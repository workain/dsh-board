// Synchronous, single-host SQLite settings store. The caller supplies an existing,
// dedicated, canonical owner-only directory on a local filesystem. Same-UID
// processes with write access to that directory are trusted not to replace files
// during path-based SQLite operations. Never reuse a path belonging to another DB:
// SQLite may recover a hot journal before the schema identity can be checked.
// Import is side-effect free; open creates the per-profile DB when absent.
import { DatabaseSync } from 'node:sqlite';
import { constants, closeSync, fstatSync, lstatSync, openSync, realpathSync } from 'node:fs';
import path from 'node:path';

const APPLICATION_ID = 0x44535453; // DSTS
const VERSION = 1;
export const MAX_SETTINGS_BYTES = 256 * 1024;
const CREATE_SQL = 'CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id = 1), profile_id TEXT NOT NULL, revision INTEGER NOT NULL, json TEXT NOT NULL) STRICT';
const PROFILE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const ORGANIZATION_TYPES = new Set(['org', 'cloud']);

export class TrackerSettingsError extends Error {
  constructor(code, message) { super(message); this.name = 'TrackerSettingsError'; this.code = code; }
}
const fail = (code, message) => { throw new TrackerSettingsError(code, message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, expected) => plain(value) && Reflect.ownKeys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key) && Object.getOwnPropertyDescriptor(value, key)?.enumerable && 'value' in Object.getOwnPropertyDescriptor(value, key));
const revisionOK = value => Number.isSafeInteger(value) && value >= 0;
const validId = value => typeof value === 'string' && ID.test(value);

function validate(value) {
  if (!keys(value, ['connection', 'workspaces']) && !keys(value, ['connection', 'workspaces', 'unattendedIssueCreation'])) fail('invalid', 'Invalid settings shape');
  const connection = value.connection;
  if (connection !== null && (!keys(connection, ['tokenRef', 'orgIdRef', 'orgType']) || connection.tokenRef !== 'TOKEN' || connection.orgIdRef !== 'ORG_ID' || !ORGANIZATION_TYPES.has(connection.orgType))) fail('invalid', 'Invalid connection references or organization type');
  if (!plain(value.workspaces)) fail('invalid', 'Invalid workspace mapping');
  for (const key of Reflect.ownKeys(value.workspaces)) {
    const descriptor = Object.getOwnPropertyDescriptor(value.workspaces, key);
    if (!validId(key) || !descriptor.enumerable || !('value' in descriptor)) fail('invalid', 'Invalid workspace ID');
    const boards = descriptor.value;
    if (!Array.isArray(boards) || Object.getPrototypeOf(boards) !== Array.prototype || boards.length > 4096 || Reflect.ownKeys(boards).length !== boards.length + 1) fail('invalid', 'Invalid board list');
    const seen = new Set();
    for (let i = 0; i < boards.length; i++) {
      const entry = Object.getOwnPropertyDescriptor(boards, String(i));
      if (!entry || !entry.enumerable || !('value' in entry) || !validId(entry.value) || seen.has(entry.value)) fail('invalid', 'Invalid or duplicate board ID');
      seen.add(entry.value);
    }
  }
  if (Object.hasOwn(value, 'unattendedIssueCreation')) {
    const mapping = value.unattendedIssueCreation;
    if (!plain(mapping)) fail('invalid', 'Invalid unattended issue creation mapping');
    for (const key of Reflect.ownKeys(mapping)) {
      const descriptor = Object.getOwnPropertyDescriptor(mapping, key);
      if (!validId(key) || !descriptor.enumerable || !('value' in descriptor)) fail('invalid', 'Invalid unattended issue creation workspace ID');
      const entry = descriptor.value;
      if (!keys(entry, ['accountScope', 'incarnation']) || typeof entry.accountScope !== 'string' || !/^[0-9a-f]{64}$/.test(entry.accountScope) || typeof entry.incarnation !== 'string' || entry.incarnation.length === 0 || entry.incarnation.length > 256 || !entry.incarnation.isWellFormed() || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(entry.incarnation)) fail('invalid', 'Invalid unattended issue creation opt-in');
    }
  }
}
function encode(settings, maxBytes) {
  validate(settings);
  let json;
  try { json = JSON.stringify(settings); } catch { fail('invalid', 'Settings are not JSON serializable'); }
  if (typeof json !== 'string' || Buffer.byteLength(json) > maxBytes) fail('too_large', 'Settings exceed byte limit');
  validate(JSON.parse(json));
  return json;
}
function readRow(db, profileId, maxBytes) {
  const rows = db.prepare('SELECT id, profile_id, revision, CASE WHEN length(CAST(json AS BLOB)) <= ? THEN json ELSE NULL END AS json FROM settings LIMIT 2').all(maxBytes);
  const row = rows[0];
  if (rows.length !== 1 || row.id !== 1 || row.profile_id !== profileId || !revisionOK(row.revision) || typeof row.json !== 'string') fail('corrupt', 'Missing, mismatched or oversized settings');
  let settings;
  try { settings = JSON.parse(row.json); validate(settings); } catch { fail('corrupt', 'Invalid persisted settings'); }
  return { revision: row.revision, settings };
}
function securePath(directory, profileId) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.includes('\0') || path.normalize(directory) !== directory) fail('path', 'Directory must be an absolute normalized path');
  if (typeof profileId !== 'string' || !PROFILE.test(profileId)) fail('invalid', 'Invalid profile ID');
  if (typeof process.getuid !== 'function') fail('permissions', 'POSIX ownership is required');
  const dir = lstatSync(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid() || (dir.mode & 0o7777) !== 0o700 || realpathSync(directory) !== directory) fail('permissions', 'Directory must be canonical, user-owned and mode 0700');
  const filename = path.join(directory, `tracker-${profileId}.sqlite`);
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
  if (app !== APPLICATION_ID || version !== VERSION || objects.length !== 1 || objects[0].type !== 'table' || objects[0].name !== 'settings' || objects[0].tbl_name !== 'settings' || objects[0].sql !== CREATE_SQL) fail('schema', 'Unsupported or unexpected SQLite schema');
}

/**
 * openTrackerSettings({directory, profileId, busyTimeoutMs?, maxBytes?})
 * opens a per-profile store. directory must already exist; profileId is a stable,
 * case-sensitive identifier matching [A-Za-z0-9][A-Za-z0-9_-]{0,63}.
 * read() returns {revision, settings}. compareAndSet(revision, settings) returns
 * {ok: true, revision: next} or {ok: false, revision: current}; it never merges.
 * settings: {connection: null | {tokenRef:'TOKEN', orgIdRef:'ORG_ID',
 * orgType:'org'|'cloud'}, workspaces:{[workspaceId]: boardId[]},
 * unattendedIssueCreation?:{[workspaceId]:{accountScope, incarnation}}}.
 * A missing unattendedIssueCreation mapping disables it for all workspaces.
 * accountScope is exactly 64 lowercase hex characters; incarnation is the
 * workspace createdAt string, nonempty, well-formed, at most 256 UTF-16 code
 * units and free of C0/C1 control and bidirectional formatting characters.
 * IDs match [A-Za-z0-9][A-Za-z0-9_.:-]{0,127}; board IDs must be unique within
 * each workspace. No credentials are resolved. Workspace and board IDs are
 * syntax-checked only; callers must not put secrets in these identifier fields.
 * CAS replaces the entire document, including any optional mapping. Legacy data
 * is not rewritten on read. An older binary will reject data with the mapping;
 * remove it with a CAS before downgrading if such compatibility is required.
 * close() is idempotent. SQLite uses FULL synchronous rollback journaling, not network filesystems.
 * A racing opener can see an uninitialized file and must retry a schema error.
 * busyTimeoutMs is 0..30000 (default 5000); maxBytes is 1..256 KiB.
 */
export function openTrackerSettings({ directory, profileId, busyTimeoutMs = 5000, maxBytes = MAX_SETTINGS_BYTES } = {}) {
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 30000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_SETTINGS_BYTES) fail('invalid', 'Invalid store limits');
  // Fail before creating the database if even the initial settings do not fit.
  encode({ connection: null, workspaces: {} }, maxBytes);
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
        const json = encode({ connection: null, workspaces: {} }, maxBytes);
        db.exec(CREATE_SQL);
        db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${VERSION}`);
        db.prepare('INSERT INTO settings VALUES (1, ?, 0, ?)').run(profileId, json);
      }
      checkIdentity(db);
      const check = db.prepare('PRAGMA quick_check(1)').all();
      if (check.length !== 1 || check[0].quick_check !== 'ok') fail('corrupt', 'SQLite integrity check failed');
      readRow(db, profileId, maxBytes);
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    const ensureOpen = () => { if (closed) fail('closed', 'Store is closed'); };
    const read = () => {
      ensureOpen(); db.exec('BEGIN');
      try { checkIdentity(db); const value = readRow(db, profileId, maxBytes); db.exec('COMMIT'); return value; }
      catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    };
    const compareAndSet = (expectedRevision, settings) => {
      ensureOpen();
      if (!revisionOK(expectedRevision)) fail('invalid', 'Expected revision is invalid');
      const json = encode(settings, maxBytes);
      db.exec('BEGIN IMMEDIATE');
      try {
        checkIdentity(db);
        const current = readRow(db, profileId, maxBytes);
        if (current.revision !== expectedRevision) { db.exec('COMMIT'); return { ok: false, revision: current.revision }; }
        if (current.revision === Number.MAX_SAFE_INTEGER) fail('invalid', 'Revision exhausted');
        const next = current.revision + 1;
        const result = db.prepare('UPDATE settings SET revision = ?, json = ? WHERE id = 1 AND revision = ?').run(next, json, current.revision);
        if (result.changes !== 1) fail('corrupt', 'Settings update failed');
        db.exec('COMMIT');
        return { ok: true, revision: next };
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    };
    return { read, compareAndSet, close() { if (!closed) { db.close(); closed = true; } } };
  } catch (error) { db.close(); throw error; }
}
