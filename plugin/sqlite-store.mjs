// Single-host store. The caller must provide an existing private owner directory
// and a dedicated path managed only by this plugin. Never point it at another DB:
// SQLite may recover a hot rollback journal before its schema can be validated.
// Importing this module does not create a database; openBoardStore does.
import { DatabaseSync } from 'node:sqlite';
import { constants, closeSync, fstatSync, lstatSync, openSync, realpathSync } from 'node:fs';
import path from 'node:path';
import * as core from './core.mjs';

const APPLICATION_ID = 0x44534244; // DSBD
const VERSION = 1;
export const MAX_AGGREGATE_BYTES = 4 * 1024 * 1024;
const CREATE_SQL = 'CREATE TABLE aggregate (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, json TEXT NOT NULL) STRICT';

export class StoreError extends Error {
  constructor(code, message) { super(message); this.name = 'StoreError'; this.code = code; }
}
const fail = (code, message) => { throw new StoreError(code, message); };
const plain = v => v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const validRevision = n => Number.isSafeInteger(n) && n >= 0;
function validate(value) {
  if (!plain(value) || Object.keys(value).sort().join(',') !== 'links,revision,state' || !validRevision(value.revision)) fail('invalid', 'Invalid aggregate');
  core.validateState(value.state);
  if (!Array.isArray(value.links)) fail('invalid', 'Invalid links');
  const seen = new Set();
  for (const link of value.links) {
    if (!plain(link) || Object.keys(link).sort().join(',') !== 'boardId,sessionId,taskId') fail('invalid', 'Invalid link');
    for (const key of ['boardId', 'taskId', 'sessionId']) {
      const s = link[key];
      if (typeof s !== 'string' || !s.trim() || s !== s.trim() || s.length > 256) fail('invalid', 'Invalid link id');
    }
    const board = value.state.boards.find(b => b.id === link.boardId);
    if (!board || !board.tasks.some(t => t.id === link.taskId)) fail('invalid', 'Dangling link');
    const key = JSON.stringify([link.boardId, link.taskId, link.sessionId]);
    if (seen.has(key)) fail('invalid', 'Duplicate link');
    seen.add(key);
  }
  return value;
}
function encode(value, maxBytes) {
  validate(value);
  let json;
  try { json = JSON.stringify(value); } catch { fail('invalid', 'Aggregate is not JSON serializable'); }
  if (typeof json !== 'string' || Buffer.byteLength(json) > maxBytes) fail('too_large', 'Aggregate exceeds byte limit');
  // Check the actual persisted representation as well as the input object.
  const parsed = JSON.parse(json);
  validate(parsed);
  return json;
}
function decode(row, maxBytes) {
  if (!row || typeof row.json !== 'string' || Buffer.byteLength(row.json) > maxBytes || !validRevision(row.revision)) fail('corrupt', 'Missing or oversized aggregate');
  let value;
  try { value = JSON.parse(row.json); validate(value); } catch (error) { throw new StoreError('corrupt', `Invalid stored aggregate: ${error.message}`); }
  if (value.revision !== row.revision) fail('corrupt', 'Stored revisions disagree');
  return value;
}
function readAggregate(db, maxBytes) {
  // Refuse oversized JSON in SQLite before converting it into a V8 string.
  const row = db.prepare('SELECT revision, CASE WHEN length(CAST(json AS BLOB)) <= ? THEN json ELSE NULL END AS json FROM aggregate WHERE id = 1').get(maxBytes);
  return decode(row, maxBytes);
}
function securePath(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || filename.includes('\0') || path.normalize(filename) !== filename) fail('path', 'Database path must be an absolute normalized path');
  if (typeof process.getuid !== 'function') fail('permissions', 'POSIX ownership is required');
  const dir = path.dirname(filename);
  const st = lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o7777) !== 0o700 || realpathSync(dir) !== dir) fail('permissions', 'Database directory must be canonical, owned by the user, and mode 0700');
  // O_EXCL and O_NOFOLLOW prevent following a final-component symlink during creation.
  // The private directory excludes other users; same-UID processes are trusted not
  // to replace entries between checks and SQLite's path-based operations.
  let fd;
  let created = false;
  try { fd = openSync(filename, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600); created = true; }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    fd = openSync(filename, constants.O_RDWR | constants.O_NOFOLLOW);
  }
  try {
    const file = fstatSync(fd);
    if (!file.isFile() || file.uid !== process.getuid() || (file.mode & 0o7777) !== 0o600 || file.nlink !== 1) fail('permissions', 'Database must be a user-owned regular file, mode 0600, with one link');
  } finally { closeSync(fd); }
  return created;
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
  if (app !== APPLICATION_ID || version !== VERSION || objects.length !== 1 || objects[0].type !== 'table' || objects[0].name !== 'aggregate' || objects[0].tbl_name !== 'aggregate' || objects[0].sql !== CREATE_SQL) fail('schema', 'Unsupported or unexpected SQLite schema');
}
function checkSchema(db) {
  checkIdentity(db);
  const check = db.prepare('PRAGMA quick_check(1)').all();
  if (check.length !== 1 || check[0].quick_check !== 'ok') fail('corrupt', 'SQLite integrity check failed');
  const rows = db.prepare('SELECT id FROM aggregate').all();
  if (rows.length !== 1 || rows[0].id !== 1) fail('corrupt', 'Expected exactly one aggregate');
}

/**
 * Open a synchronous, non-caching store. Options: absolute path, busyTimeoutMs
 * (0..30000; default 5000), maxBytes (1..4 MiB), signal. The private parent
 * directory must already exist with mode 0700. Uses SQLite rollback journaling.
 * Abort is checked before and after synchronous lock acquisition and before commit;
 * synchronous SQLite calls cannot be interrupted while blocked on the busy timeout.
 */
export function openBoardStore({ path: filename, busyTimeoutMs = 5000, maxBytes = MAX_AGGREGATE_BYTES, signal } = {}) {
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 30000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_AGGREGATE_BYTES) fail('invalid', 'Invalid store limits');
  signal?.throwIfAborted();
  const created = securePath(filename);
  checkSidecars(filename);
  signal?.throwIfAborted();
  // Refuse an existing empty file, including another process's initialization
  // window; only its creator may initialize it. A racing opener must retry.
  if (!created && lstatSync(filename).size === 0) fail('schema', 'Uninitialized database; retry after its creator completes');
  const db = new DatabaseSync(filename, { timeout: busyTimeoutMs });
  let closed = false;
  try {
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    db.exec('PRAGMA trusted_schema = OFF');
    // Check before any transaction so an unsupported WAL database is not touched.
    if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete') fail('schema', 'Only DELETE rollback journal mode is supported');
    db.exec('PRAGMA synchronous = FULL');
    db.exec('BEGIN IMMEDIATE');
    try {
      signal?.throwIfAborted();
      const app = db.prepare('PRAGMA application_id').get().application_id;
      const version = db.prepare('PRAGMA user_version').get().user_version;
      const objects = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
      // A zero-length file created by this or another process is the only blank DB.
      if (created && app === 0 && version === 0 && objects.length === 0) {
        db.exec(CREATE_SQL);
        db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${VERSION}`);
        const initial = { revision: 0, state: core.createState(), links: [] };
        db.prepare('INSERT INTO aggregate VALUES (1, 0, ?)').run(encode(initial, maxBytes));
      }
      checkSchema(db);
      readAggregate(db, maxBytes);
      signal?.throwIfAborted();
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    const ensureOpen = () => { if (closed) fail('closed', 'Store is closed'); };
    const read = ({ signal: readSignal } = {}) => {
      ensureOpen(); readSignal?.throwIfAborted();
      db.exec('BEGIN');
      try {
        checkIdentity(db);
        const value = readAggregate(db, maxBytes);
        readSignal?.throwIfAborted();
        db.exec('COMMIT');
        return value;
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    };
    const transaction = (expectedRevision, updater, { signal: txSignal } = {}) => {
      ensureOpen();
      if (expectedRevision !== null && !validRevision(expectedRevision)) fail('invalid', 'Expected revision is invalid');
      if (typeof updater !== 'function') fail('invalid', 'Updater must be a function');
      txSignal?.throwIfAborted();
      db.exec('BEGIN IMMEDIATE');
      try {
        txSignal?.throwIfAborted();
        checkIdentity(db);
        const current = readAggregate(db, maxBytes);
        if (expectedRevision !== null && current.revision !== expectedRevision) fail('conflict', 'Revision conflict');
        const revision = current.revision;
        const next = updater(current);
        if (next && typeof next.then === 'function') fail('invalid', 'Updater must be synchronous');
        if (revision === Number.MAX_SAFE_INTEGER || !plain(next) || next.revision !== revision + 1) fail('invalid', 'Updater must advance revision exactly once');
        const json = encode(next, maxBytes);
        txSignal?.throwIfAborted();
        const result = db.prepare('UPDATE aggregate SET revision = ?, json = ? WHERE id = 1 AND revision = ?').run(next.revision, json, revision);
        if (result.changes !== 1) fail('corrupt', 'Aggregate update failed');
        txSignal?.throwIfAborted();
        db.exec('COMMIT');
        return JSON.parse(json);
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    };
    return { read, transaction, close() { if (!closed) { db.close(); closed = true; } } };
  } catch (error) { db.close(); throw error; }
}
