// Offline, per-profile account namespace. This module does not resolve credentials
// or call Tracker. GET /v3/myself documents uid as the unique Tracker account ID:
// https://yandex.ru/support/tracker/ru/api/users/get-user-info
// The documentation does not explicitly promise that uid is immutable. Callers
// must obtain/validate it under the same credential snapshot and preserve all JSON
// number digits (reject unsafe JS numbers); no login/token fallback is permitted.
//
// A dedicated, existing canonical 0700 local directory is required. As with the
// link store, same-UID writers are trusted not to replace entries. Initialize this
// namespace fully before creating tracker-links-<profileId>.sqlite. All writers
// must honor that ordering; independently creating a DB concurrently with key
// creation is not coordinated by this module. Back up/restore key and DB together.
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readSync, realpathSync, writeSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import path from 'node:path';

const PROFILE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ORG = /^[A-Za-z0-9_-]{1,256}$/;
const PRINCIPAL = /^(?:0|[1-9][0-9]{0,63})$/;
const DOMAIN = 'dsh-board/tracker-account-scope/v1';

export class TrackerAccountError extends Error {
  constructor(code, message) { super(message); this.name = 'TrackerAccountError'; this.code = code; }
}
const fail = (code, message) => { throw new TrackerAccountError(code, message); };
function dataShape(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => {
      const d = Object.getOwnPropertyDescriptor(value, key);
      return d && d.enumerable && 'value' in d;
    });
}
function exists(filename) {
  try { lstatSync(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function checkDirectory(directory, profileId) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.includes('\0') || path.normalize(directory) !== directory) fail('path', 'Directory must be absolute and normalized');
  if (typeof profileId !== 'string' || !PROFILE.test(profileId)) fail('invalid', 'Invalid profile ID');
  if (typeof process.getuid !== 'function' || !constants.O_NOFOLLOW) fail('permissions', 'POSIX ownership and O_NOFOLLOW are required');
  const st = lstatSync(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o7777) !== 0o700 || realpathSync(directory) !== directory) fail('permissions', 'Directory must be canonical, user-owned and mode 0700');
}
function checkFile(fd) {
  const st = fstatSync(fd);
  if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o7777) !== 0o600 || st.nlink !== 1) fail('permissions', 'Key must be a user-owned regular file, mode 0600, with one link');
  return st;
}
function readKey(fd) {
  // A checksum detects accidental corruption and, crucially, prevents a racing
  // reader from accepting a partly written file merely because it has full size.
  if (checkFile(fd).size !== 64) fail('corrupt', 'Key is incomplete or corrupt');
  const key = Buffer.alloc(64);
  try {
    let pos = 0;
    while (pos < key.length) { const count = readSync(fd, key, pos, key.length - pos, pos); if (!count) fail('corrupt', 'Key is incomplete'); pos += count; }
    if (checkFile(fd).size !== 64 || !createHmac('sha256', key.subarray(0, 32)).update('dsh-board/tracker-account-key-check/v1').digest().equals(key.subarray(32))) fail('corrupt', 'Key changed or is corrupt');
    const result = Buffer.from(key.subarray(0, 32));
    key.fill(0);
    return result;
  } catch (error) { key.fill(0); throw error; }
}
/**
 * openAccountNamespace({directory, profileId}) -> {derive, close}.
 * derive({orgType, orgId, principalId}) takes a decimal Tracker uid string,
 * not a login, and returns a 64-character lowercase HMAC-SHA256. The caller
 * must ensure the ID comes from the authenticated principal and was not rounded.
 * Opening while another process is initializing a key may fail with 'corrupt';
 * retry later. A partial key is never replaced automatically. close() is idempotent
 * and overwrites this instance's key buffer; JS/runtime copies cannot be guaranteed
 * erased. Link DB creation must follow successful namespace initialization.
 */
export function openAccountNamespace(options) {
  if (!dataShape(options, ['directory', 'profileId'])) fail('invalid', 'Invalid namespace options');
  const { directory, profileId } = options;
  checkDirectory(directory, profileId);
  const keyPath = path.join(directory, `tracker-account-${profileId}.key`);
  const dbPath = path.join(directory, `tracker-links-${profileId}.sqlite`);
  let fd, key, created = false;
  try {
    try { fd = openSync(keyPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (exists(dbPath) || exists(dbPath + '-journal') || exists(dbPath + '-wal') || exists(dbPath + '-shm')) fail('missing_key', 'Dependent database exists without its key');
      try { fd = openSync(keyPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600); created = true; }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        fd = openSync(keyPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      }
    }
    if (created) {
      checkFile(fd);
      // Recheck after exclusive creation; never complete a new key when a DB is
      // already present. Leave the empty file in place to force manual recovery.
      if (exists(dbPath) || exists(dbPath + '-journal') || exists(dbPath + '-wal') || exists(dbPath + '-shm')) fail('missing_key', 'Dependent database exists without its key');
      key = randomBytes(32);
      const record = Buffer.alloc(64);
      try {
        key.copy(record);
        createHmac('sha256', key).update('dsh-board/tracker-account-key-check/v1').digest().copy(record, 32);
        let pos = 0;
        while (pos < record.length) { const count = writeSync(fd, record, pos, record.length - pos, pos); if (!count) fail('io', 'Key write failed'); pos += count; }
        fsyncSync(fd);
      } finally { record.fill(0); }
      const dirFd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
      if (checkFile(fd).size !== 64) fail('corrupt', 'Key write incomplete');
    } else {
      key = readKey(fd);
      // A racing creator may not have reached its fsync yet. Every successful
      // opener makes both the completed record and its directory entry durable.
      fsyncSync(fd);
      const dirFd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
    }
  } catch (error) { key?.fill(0); throw error; }
  finally { if (fd !== undefined) closeSync(fd); }
  let closed = false;
  return Object.freeze({
    derive(input) {
      if (closed) fail('closed', 'Namespace is closed');
      if (!dataShape(input, ['orgType', 'orgId', 'principalId']) || !['org', 'cloud'].includes(input.orgType) || typeof input.orgId !== 'string' || !ORG.test(input.orgId) || typeof input.principalId !== 'string' || !PRINCIPAL.test(input.principalId)) fail('invalid', 'Invalid account identity');
      return createHmac('sha256', key).update(JSON.stringify([DOMAIN, input.orgType, input.orgId, input.principalId]), 'utf8').digest('hex');
    },
    close() { if (!closed) { closed = true; key.fill(0); } },
  });
}
