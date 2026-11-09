// Additive, profile-owned pointer storage; never migrates the task databases.
import { DatabaseSync } from 'node:sqlite';
import { constants, openSync, closeSync, fstatSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
const APP = 0x44534257;
const SQL = 'CREATE TABLE pointers (workspace TEXT PRIMARY KEY, revision INTEGER NOT NULL, json TEXT) STRICT';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const valid = x => typeof x === 'string' && x.length > 0 && x.length <= 256 && x === x.trim();
export function validatePointer(p) {
  if (!p || Object.keys(p).sort().join(',') !== 'accountScope,boardId,incarnation,provider' ||
      !['local', 'tracker'].includes(p.provider) || !valid(p.boardId) || !valid(p.incarnation) ||
      (p.provider === 'local' ? p.accountScope !== null : !/^[0-9a-f]{64}$/.test(p.accountScope))) fail('invalid');
  return p;
}
export function openWorkspaceDefaultStore(filename) {
  if (!path.isAbsolute(filename) || path.normalize(filename) !== filename || typeof process.getuid !== 'function') fail('path');
  const dir = path.dirname(filename), st = lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o7777) !== 0o700 || realpathSync(dir) !== dir) fail('permissions');
  let created = false, fd;
  try { fd = openSync(filename, constants.O_EXCL | constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600); created = true; }
  catch (e) { if (e.code !== 'EEXIST') throw e; fd = openSync(filename, constants.O_RDWR | constants.O_NOFOLLOW); }
  try { const s = fstatSync(fd); if (!s.isFile() || s.uid !== process.getuid() || (s.mode & 0o7777) !== 0o600 || s.nlink !== 1) fail('permissions'); }
  finally { closeSync(fd); }
  for (const suffix of ['-journal', '-wal', '-shm']) {
    try { const s = lstatSync(filename + suffix); if (!s.isFile() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o7777) !== 0o600 || s.nlink !== 1) fail('permissions'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (!created && lstatSync(filename).size === 0) fail('schema');
  const db = new DatabaseSync(filename, { timeout: 1000 });
  const identity = () => {
    if (db.prepare('PRAGMA application_id').get().application_id !== APP || db.prepare('PRAGMA user_version').get().user_version !== 1) fail('schema');
    const rows = db.prepare("SELECT name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
    if (rows.length !== 1 || rows[0].name !== 'pointers' || rows[0].sql !== SQL) fail('schema');
  };
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=1000');
    if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete') fail('schema');
    db.exec('PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
    try {
      if (created) {
        db.exec(SQL); db.exec(`PRAGMA application_id=${APP}; PRAGMA user_version=1`);
      }
      identity(); db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } catch (e) { db.close(); throw e; }
  let closed = false;
  const read = workspace => {
    if (closed || !valid(workspace)) fail('invalid');
    identity();
    const r = db.prepare('SELECT revision, length(CAST(json AS BLOB)) AS bytes, CASE WHEN length(CAST(json AS BLOB))<=4096 THEN json ELSE NULL END AS json FROM pointers WHERE workspace=?').get(workspace);
    if (!r) return { revision: 0, pointer: null };
    if ((r.bytes !== null && r.bytes > 4096) || !Number.isSafeInteger(r.revision) || r.revision < 1) fail('corrupt');
    return { revision: r.revision, pointer: r.json === null ? null : validatePointer(JSON.parse(r.json)) };
  };
  return Object.freeze({ read, set(workspace, expectedRevision, pointer) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) fail('invalid');
    const json = pointer === null ? null : JSON.stringify(validatePointer(pointer));
    db.exec('BEGIN IMMEDIATE');
    try {
      const before = read(workspace); if (before.revision !== expectedRevision) fail('conflict');
      if (before.revision === 0 && db.prepare('SELECT count(*) AS n FROM pointers').get().n >= 10000) fail('too_large');
      db.prepare('INSERT INTO pointers(workspace,revision,json) VALUES(?,?,?) ON CONFLICT(workspace) DO UPDATE SET revision=excluded.revision,json=excluded.json').run(workspace, expectedRevision + 1, json);
      db.exec('COMMIT'); return { revision: expectedRevision + 1, pointer: pointer === null ? null : structuredClone(pointer) };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }, close() { if (!closed) { closed = true; db.close(); } } });
}
