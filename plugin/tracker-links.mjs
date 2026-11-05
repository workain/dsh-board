// Dedicated single-host per-profile SQLite store. No Tracker requests, credentials,
// tenant IDs, principal IDs, or authorization decisions belong here. The caller
// must provide a stable, secret-derived accountScope for the tenant AND principal,
// and revalidate workspace/session membership and Tracker issue access each time.
// Never point this store at another DB: SQLite can recover a hot journal before
// schema checks. The existing canonical 0700 directory must be on a local FS;
// same-UID processes with access to it are trusted not to replace entries during
// SQLite's path-based operations. Importing this module has no filesystem effects.
import { DatabaseSync } from 'node:sqlite';
import { constants, closeSync, fstatSync, lstatSync, openSync, realpathSync } from 'node:fs';
import path from 'node:path';

const APPLICATION_ID = 0x4453544c; // DSTL
const VERSION = 1;
export const MAX_TRACKER_LINKS = 5000;
const CREATE_META = 'CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK(id = 1), profile_id TEXT NOT NULL, revision INTEGER NOT NULL) STRICT';
const CREATE_LINKS = 'CREATE TABLE links (account_scope TEXT NOT NULL, workspace_id TEXT NOT NULL, workspace_created_at TEXT NOT NULL, issue_id TEXT NOT NULL, session_id TEXT NOT NULL, PRIMARY KEY (account_scope, workspace_id, workspace_created_at, issue_id, session_id)) STRICT';
const PROFILE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const ISSUE = /^[A-Za-z0-9_-]{1,128}$/;
const SCOPE = /^[0-9a-f]{64}$/;

export class TrackerLinksError extends Error {
  constructor(code, message) { super(message); this.name = 'TrackerLinksError'; this.code = code; }
}
const fail = (code, message) => { throw new TrackerLinksError(code, message); };
const revisionOK = value => Number.isSafeInteger(value) && value >= 0;
const validId = value => typeof value === 'string' && ID.test(value);
// Registry creation values are opaque, compared byte-for-byte, not parsed as dates.
const validIncarnation = value => typeof value === 'string' && value.isWellFormed() && value.length >= 1 && value.length <= 256 && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
const validSession = value => typeof value === 'string' && value.isWellFormed() && value.length >= 1 && value.length <= 256 && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
const validIssue = value => typeof value === 'string' && ISSUE.test(value);
const validScope = value => typeof value === 'string' && SCOPE.test(value);
function shape(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === expected.length && expected.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && descriptor.enumerable && 'value' in descriptor;
    });
}
function validateRequest(value, mutation) {
  const fields = mutation ? ['accountScope', 'workspaceId', 'workspaceCreatedAt', 'expectedRevision', 'issueId', 'sessionId', 'linked'] : ['accountScope', 'workspaceId', 'workspaceCreatedAt'];
  if (!shape(value, fields) || !validScope(value.accountScope) || !validId(value.workspaceId) || !validIncarnation(value.workspaceCreatedAt) ||
      (mutation && (!revisionOK(value.expectedRevision) || !validIssue(value.issueId) || !validSession(value.sessionId) || typeof value.linked !== 'boolean'))) fail('invalid', 'Invalid link request');
}
function securePath(directory, profileId) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.includes('\0') || path.normalize(directory) !== directory) fail('path', 'Directory must be an absolute normalized path');
  if (typeof profileId !== 'string' || !PROFILE.test(profileId)) fail('invalid', 'Invalid profile ID');
  if (typeof process.getuid !== 'function') fail('permissions', 'POSIX ownership is required');
  const dir = lstatSync(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid() || (dir.mode & 0o7777) !== 0o700 || realpathSync(directory) !== directory) fail('permissions', 'Directory must be canonical, user-owned and mode 0700');
  const filename = path.join(directory, `tracker-links-${profileId}.sqlite`);
  let fd; let created = false;
  try { fd = openSync(filename, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600); created = true; }
  catch (error) { if (error.code !== 'EEXIST') throw error; fd = openSync(filename, constants.O_RDWR | constants.O_NOFOLLOW); }
  try {
    const file = fstatSync(fd);
    if (!file.isFile() || file.uid !== process.getuid() || (file.mode & 0o7777) !== 0o600 || file.nlink !== 1) fail('permissions', 'Database must be a user-owned regular file, mode 0600, with one link');
  } finally { closeSync(fd); }
  return { filename, created };
}
function checkSidecars(filename) {
  for (const suffix of ['-journal', '-wal', '-shm']) {
    let file;
    try { file = lstatSync(filename + suffix); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!file.isFile() || file.isSymbolicLink() || file.uid !== process.getuid() || (file.mode & 0o7777) !== 0o600 || file.nlink !== 1) fail('permissions', 'Unsafe SQLite sidecar');
  }
}
function checkIdentity(db) {
  if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete') fail('schema', 'Only DELETE rollback journal mode is supported');
  const app = db.prepare('PRAGMA application_id').get().application_id;
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const objects = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  if (app !== APPLICATION_ID || version !== VERSION || objects.length !== 2 ||
      objects[0].type !== 'table' || objects[0].name !== 'links' || objects[0].tbl_name !== 'links' || objects[0].sql !== CREATE_LINKS ||
      objects[1].type !== 'table' || objects[1].name !== 'meta' || objects[1].tbl_name !== 'meta' || objects[1].sql !== CREATE_META) fail('schema', 'Unsupported or unexpected SQLite schema');
}
function readMeta(db, profileId) {
  const rows = db.prepare('SELECT id, profile_id, revision FROM meta LIMIT 2').all();
  if (rows.length !== 1 || rows[0].id !== 1 || rows[0].profile_id !== profileId || !revisionOK(rows[0].revision)) fail('corrupt', 'Invalid store metadata');
  return rows[0].revision;
}
function checkRows(db) {
  // Bound the result before transferring data to JS. The limits are global per
  // profile, including historical incarnations and other account scopes.
  const rows = db.prepare(`SELECT CASE WHEN length(CAST(account_scope AS BLOB)) <= 64 THEN account_scope ELSE NULL END AS account_scope,
    CASE WHEN length(CAST(workspace_id AS BLOB)) <= 128 THEN workspace_id ELSE NULL END AS workspace_id,
    CASE WHEN length(CAST(workspace_created_at AS BLOB)) <= 1024 THEN workspace_created_at ELSE NULL END AS workspace_created_at,
    CASE WHEN length(CAST(issue_id AS BLOB)) <= 128 THEN issue_id ELSE NULL END AS issue_id,
    CASE WHEN length(CAST(session_id AS BLOB)) <= 1024 THEN session_id ELSE NULL END AS session_id FROM links LIMIT ?`).all(MAX_TRACKER_LINKS + 1);
  if (rows.length > MAX_TRACKER_LINKS) fail('corrupt', 'Too many persisted links');
  for (const row of rows) {
    if (!validScope(row.account_scope) || !validId(row.workspace_id) || !validIncarnation(row.workspace_created_at) || !validIssue(row.issue_id) || !validSession(row.session_id)) fail('corrupt', 'Invalid persisted link');
  }
  return rows;
}

/**
 * openTrackerLinks({directory, profileId, busyTimeoutMs?}) returns a synchronous
 * non-caching store. The directory must already exist and be canonical, owned by
 * the current UID and mode 0700. The DB is per-profile and mode 0600. An existing
 * blank DB is never initialized; a racing opener must retry after initialization.
 *
 * read({accountScope, workspaceId, workspaceCreatedAt}) returns
 * {revision, links:[{issueId, sessionId}]}. mutate adds/removes a single link:
 * mutate({accountScope, workspaceId, workspaceCreatedAt, expectedRevision,
 * issueId, sessionId, linked}) returns {ok:true, revision} or, on CAS conflict,
 * {ok:false, revision}. Revision is globally monotonic per profile; a no-op does
 * not advance it. 5000 stored rows maximum, including historical incarnations.
 *
 * accountScope is lowercase 64-hex, a caller-derived stable HMAC of tenant type,
 * tenant identity and stable principal identity; no accountScope fallback. The
 * local HMAC key must itself be durable and protected. Changes in account, tenant,
 * or profile must fail closed and require workspace/board reselection; validate
 * Tracker permissions on every use. workspaceCreatedAt is a stable, opaque host
 * incarnation string. Rows are not deleted on archive, deletion or recreation;
 * caller handles historical visibility. issueId must be the immutable string ID
 * returned by Tracker for the issue, not its mutable key. This store only checks
 * syntax; callers must obtain the ID from an authorized live Tracker response and
 * revalidate issue access and membership. Session and workspace IDs are only
 * syntax checked, not authorized. Never put secrets in identifier fields.
 * close() is idempotent. FULL synchronous DELETE rollback journaling is used.
 */
export function openTrackerLinks({ directory, profileId, busyTimeoutMs = 5000 } = {}) {
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 30000) fail('invalid', 'Invalid store limits');
  const { filename, created } = securePath(directory, profileId);
  checkSidecars(filename);
  if (!created && lstatSync(filename).size === 0) fail('schema', 'Uninitialized database; retry after its creator completes');
  const db = new DatabaseSync(filename, { timeout: busyTimeoutMs });
  let closed = false;
  try {
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    db.exec('PRAGMA trusted_schema = OFF');
    if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete') fail('schema', 'Only DELETE rollback journal mode is supported');
    db.exec('PRAGMA synchronous = FULL');
    db.exec('BEGIN IMMEDIATE');
    try {
      const app = db.prepare('PRAGMA application_id').get().application_id;
      const version = db.prepare('PRAGMA user_version').get().user_version;
      const objects = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
      if (created && app === 0 && version === 0 && objects.length === 0) {
        db.exec(CREATE_META); db.exec(CREATE_LINKS);
        db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${VERSION}`);
        db.prepare('INSERT INTO meta VALUES (1, ?, 0)').run(profileId);
      }
      checkIdentity(db);
      const check = db.prepare('PRAGMA quick_check(1)').all();
      if (check.length !== 1 || check[0].quick_check !== 'ok') fail('corrupt', 'SQLite integrity check failed');
      readMeta(db, profileId); checkRows(db);
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    const ensureOpen = () => { if (closed) fail('closed', 'Store is closed'); };
    const read = request => {
      ensureOpen(); validateRequest(request, false);
      db.exec('BEGIN');
      try {
        checkIdentity(db);
        const revision = readMeta(db, profileId);
        const links = checkRows(db).filter(row => row.account_scope === request.accountScope && row.workspace_id === request.workspaceId && row.workspace_created_at === request.workspaceCreatedAt)
          .map(row => ({ issueId: row.issue_id, sessionId: row.session_id }))
          .sort((a, b) => a.issueId < b.issueId ? -1 : a.issueId > b.issueId ? 1 : a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0);
        db.exec('COMMIT'); return { revision, links };
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    };
    const mutate = request => {
      ensureOpen(); validateRequest(request, true);
      db.exec('BEGIN IMMEDIATE');
      try {
        checkIdentity(db);
        const revision = readMeta(db, profileId);
        const rows = checkRows(db);
        if (request.expectedRevision !== revision) { db.exec('COMMIT'); return { ok: false, revision }; }
        const exists = rows.some(row => row.account_scope === request.accountScope && row.workspace_id === request.workspaceId && row.workspace_created_at === request.workspaceCreatedAt && row.issue_id === request.issueId && row.session_id === request.sessionId);
        if (exists === request.linked) { db.exec('COMMIT'); return { ok: true, revision }; }
        if (revision === Number.MAX_SAFE_INTEGER) fail('invalid', 'Revision exhausted');
        if (request.linked && rows.length === MAX_TRACKER_LINKS) fail('too_large', 'Link limit exceeded');
        const args = [request.accountScope, request.workspaceId, request.workspaceCreatedAt, request.issueId, request.sessionId];
        const result = request.linked ? db.prepare('INSERT INTO links VALUES (?, ?, ?, ?, ?)').run(...args) : db.prepare('DELETE FROM links WHERE account_scope = ? AND workspace_id = ? AND workspace_created_at = ? AND issue_id = ? AND session_id = ?').run(...args);
        if (result.changes !== 1) fail('corrupt', 'Link update failed');
        const next = revision + 1;
        if (db.prepare('UPDATE meta SET revision = ? WHERE id = 1 AND revision = ?').run(next, revision).changes !== 1) fail('corrupt', 'Revision update failed');
        db.exec('COMMIT'); return { ok: true, revision: next };
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    };
    return { read, mutate, close() { if (!closed) { db.close(); closed = true; } } };
  } catch (error) { db.close(); throw error; }
}
