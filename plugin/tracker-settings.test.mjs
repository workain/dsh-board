import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, linkSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { MAX_SETTINGS_BYTES, openTrackerSettings } from './tracker-settings.mjs';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'dsh-tracker-settings-test-'));
  chmodSync(directory, 0o700);
  t.after(() => { assert.match(path.basename(directory), /^dsh-tracker-settings-test-/); rmSync(directory, { recursive: true, force: true }); });
  return { directory, filename: id => path.join(directory, `tracker-${id}.sqlite`) };
}
const options = directory => ({ directory, profileId: 'profile-1' });
const data = () => ({ connection: { tokenRef: 'TOKEN', orgIdRef: 'ORG_ID', orgType: 'org' }, workspaces: { workspace1: ['123', 'board-2'], workspace2: ['123'] } });
const isCode = code => error => error.code === code;

test('initial state, CAS, persistence, no caching and profile isolation', t => {
  const { directory, filename } = fixture(t);
  const a = openTrackerSettings(options(directory));
  const b = openTrackerSettings(options(directory));
  const other = openTrackerSettings({ directory, profileId: 'profile-2' });
  assert.deepEqual(a.read(), { revision: 0, settings: { connection: null, workspaces: {} } });
  assert.equal(lstatSync(filename('profile-1')).mode & 0o7777, 0o600);
  assert.deepEqual(a.compareAndSet(0, data()), { ok: true, revision: 1 });
  assert.deepEqual(b.read(), { revision: 1, settings: data() });
  assert.deepEqual(b.compareAndSet(0, data()), { ok: false, revision: 1 });
  assert.deepEqual(other.read(), { revision: 0, settings: { connection: null, workspaces: {} } });
  const cloud = data(); cloud.connection.orgType = 'cloud';
  assert.deepEqual(b.compareAndSet(1, cloud), { ok: true, revision: 2 });
  a.close(); a.close(); b.close(); other.close();
  assert.throws(() => a.read(), isCode('closed'));
  const reopened = openTrackerSettings(options(directory));
  assert.deepEqual(reopened.read(), { revision: 2, settings: cloud });
  reopened.close();
});

test('separate processes racing the same revision commit only once', async t => {
  const { directory } = fixture(t);
  const initial = openTrackerSettings(options(directory));
  const optIn = { ws: { accountScope: 'a'.repeat(64), incarnation: 'created-at-1' } };
  assert.deepEqual(initial.compareAndSet(0, { connection: null, workspaces: {}, unattendedIssueCreation: optIn }), { ok: true, revision: 1 });
  initial.close();
  const moduleUrl = new URL('./tracker-settings.mjs', import.meta.url).href;
  const source = `
    import { openTrackerSettings } from ${JSON.stringify(moduleUrl)};
    const s = openTrackerSettings({directory: process.argv[1], profileId:'profile-1'});
    process.send('ready');
    process.on('message', () => {
      try {
        const current = s.read();
        current.settings.workspaces.ws = [process.argv[2]];
        process.send(s.compareAndSet(1, current.settings));
      }
      catch (e) { process.send({error:e.code || e.message}); }
      finally { s.close(); process.disconnect(); }
    });`;
  const children = ['board-1', 'board-2'].map(id => spawn(process.execPath, ['--input-type=module', '-e', source, directory, id], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }));
  t.after(() => { for (const child of children) if (child.exitCode === null) child.kill(); });
  const results = children.map(child => new Promise((resolve, reject) => {
    let readyResolve; child.ready = new Promise(r => { readyResolve = r; });
    let result; let stderr = '';
    child.stderr.setEncoding('utf8'); child.stderr.on('data', text => { stderr += text; });
    child.on('message', message => { if (message === 'ready') readyResolve(); else result = message; });
    child.on('error', reject);
    child.on('exit', code => code === 0 && result ? resolve(result) : reject(new Error(`child exited ${code}: ${stderr}`)));
  }));
  await Promise.all(children.map(child => child.ready));
  children.forEach(child => child.send('go'));
  assert.deepEqual((await Promise.all(results)).sort((a, b) => Number(a.ok) - Number(b.ok)), [{ ok: false, revision: 2 }, { ok: true, revision: 2 }]);
  const final = openTrackerSettings(options(directory));
  const result = final.read();
  assert.equal(result.revision, 2);
  assert.deepEqual(result.settings.unattendedIssueCreation, optIn);
  assert.ok(['board-1', 'board-2'].includes(result.settings.workspaces.ws[0]));
  final.close();
});

test('strict shape, references only, bounded settings and no partial writes', t => {
  const { directory, filename } = fixture(t);
  const store = openTrackerSettings({ ...options(directory), maxBytes: 300 });
  const invalid = [
    {}, { ...data(), extra: 1 }, { ...data(), connection: { ...data().connection, token: 'secret' } },
    { ...data(), connection: { ...data().connection, tokenRef: 'literal-secret-token' } },
    { ...data(), connection: { ...data().connection, orgIdRef: 'my-actual-org-id' } },
    { ...data(), connection: { ...data().connection, orgType: 'other' } },
    { ...data(), workspaces: { '../escape': ['123'] } },
    { ...data(), workspaces: { valid: ['same', 'same'] } },
    { ...data(), workspaces: { valid: ['bad/id'] } },
    { ...data(), workspaces: { valid: [null] } },
    { ...data(), workspaces: Object.assign(['bad'], { x: ['x'] }) },
    { ...data(), workspaces: { valid: Array(2) } },
    { ...data(), workspaces: { valid: Object.assign(['a'], { extra: 'secret' }) } },
    { ...data(), workspaces: { valid: ['a'] }, toJSON() { return data(); } },
  ];
  for (const value of invalid) assert.throws(() => store.compareAndSet(0, value), isCode('invalid'));
  assert.throws(() => store.compareAndSet(-1, data()), isCode('invalid'));
  assert.throws(() => store.compareAndSet(0, { connection: null, workspaces: { valid: Array.from({ length: 20 }, (_, i) => `board-${i}-long-string`) } }), isCode('too_large'));
  assert.deepEqual(store.read(), { revision: 0, settings: { connection: null, workspaces: {} } });
  store.close();
  assert.equal(readFileSync(filename('profile-1')).includes(Buffer.from('literal-secret-token')), false);
  assert.throws(() => openTrackerSettings({ ...options(directory), maxBytes: MAX_SETTINGS_BYTES + 1 }), isCode('invalid'));
});

test('rejects invalid profiles and insecure paths without creating their DB', t => {
  const { directory, filename } = fixture(t);
  for (const id of ['', '.', '..', '../other', 'a/b', 'a\\b', 'a'.repeat(65), 'é', 'bad id']) {
    assert.throws(() => openTrackerSettings({ directory, profileId: id }), isCode('invalid'));
  }
  assert.throws(() => openTrackerSettings({ directory: 'relative', profileId: 'p' }), isCode('path'));
  chmodSync(directory, 0o755);
  assert.throws(() => openTrackerSettings(options(directory)), isCode('permissions'));
  chmodSync(directory, 0o700);
  const store = openTrackerSettings(options(directory)); store.close();
  linkSync(filename('profile-1'), filename('hard'));
  assert.throws(() => openTrackerSettings(options(directory)), isCode('permissions'));
  symlinkSync(filename('profile-1'), filename('link'));
  assert.throws(() => openTrackerSettings({ directory, profileId: 'link' }));
  symlinkSync(directory, path.join(directory, 'linked-dir'));
  assert.throws(() => openTrackerSettings({ directory: path.join(directory, 'linked-dir'), profileId: 'p' }), isCode('permissions'));
});

test('refuses malformed, future, altered and mismatched profile DBs', t => {
  const { directory, filename } = fixture(t);
  writeFileSync(filename('blank'), '', { mode: 0o600 });
  assert.throws(() => openTrackerSettings({ directory, profileId: 'blank' }), isCode('schema'));
  writeFileSync(filename('bad'), 'not sqlite', { mode: 0o600 });
  assert.throws(() => openTrackerSettings({ directory, profileId: 'bad' }));
  let store = openTrackerSettings(options(directory)); store.close();
  let raw = new DatabaseSync(filename('profile-1'));
  raw.exec('PRAGMA user_version = 2'); raw.close();
  assert.throws(() => openTrackerSettings(options(directory)), isCode('schema'));
  raw = new DatabaseSync(filename('profile-1'));
  raw.exec("PRAGMA user_version = 1; UPDATE settings SET profile_id = 'another'"); raw.close();
  assert.throws(() => openTrackerSettings(options(directory)), isCode('corrupt'));
  raw = new DatabaseSync(filename('profile-1'));
  raw.exec("UPDATE settings SET profile_id = 'profile-1', json = '{bad'"); raw.close();
  assert.throws(() => openTrackerSettings(options(directory)), isCode('corrupt'));
});

test('rechecks schema on every operation and rejects unsafe sidecars', t => {
  const { directory, filename } = fixture(t);
  const store = openTrackerSettings(options(directory));
  const raw = new DatabaseSync(filename('profile-1'));
  raw.exec('PRAGMA user_version = 99');
  assert.throws(() => store.read(), isCode('schema'));
  assert.throws(() => store.compareAndSet(0, data()), isCode('schema'));
  raw.exec('PRAGMA user_version = 1; CREATE TABLE extra (value TEXT)'); raw.close();
  assert.throws(() => store.read(), isCode('schema'));
  store.close();
  symlinkSync(filename('profile-1'), `${filename('profile-1')}-journal`);
  assert.throws(() => openTrackerSettings(options(directory)), isCode('permissions'));
});

test('legacy data is read without migration; opt-ins round-trip without schema changes', t => {
  const { directory, filename } = fixture(t);
  const legacy = data();
  let store = openTrackerSettings(options(directory));
  assert.equal(Object.hasOwn(store.read().settings, 'unattendedIssueCreation'), false);
  assert.deepEqual(store.compareAndSet(0, legacy), { ok: true, revision: 1 });
  store.close();
  let raw = new DatabaseSync(filename('profile-1'));
  const identity = () => ({
    app: raw.prepare('PRAGMA application_id').get().application_id,
    version: raw.prepare('PRAGMA user_version').get().user_version,
    schema: raw.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all(),
  });
  const beforeIdentity = identity();
  const beforeRow = raw.prepare('SELECT * FROM settings').get();
  raw.close();
  store = openTrackerSettings(options(directory));
  assert.deepEqual(store.read(), { revision: 1, settings: legacy });
  store.close();
  raw = new DatabaseSync(filename('profile-1'));
  assert.deepEqual(raw.prepare('SELECT * FROM settings').get(), beforeRow);
  assert.deepEqual(identity(), beforeIdentity);
  raw.close();

  store = openTrackerSettings(options(directory));
  const settings = store.read().settings;
  settings.unattendedIssueCreation = {
    workspace1: { accountScope: '0123456789abcdef'.repeat(4), incarnation: '2026-01-01T00:00:00.000Z' },
    another: { accountScope: 'f'.repeat(64), incarnation: 'x'.repeat(256) },
  };
  const expected = structuredClone(settings);
  assert.deepEqual(store.compareAndSet(1, settings), { ok: true, revision: 2 });
  settings.unattendedIssueCreation.workspace1.incarnation = 'mutated-after-cas';
  const snapshot = store.read();
  assert.deepEqual(snapshot, { revision: 2, settings: expected });
  snapshot.settings.unattendedIssueCreation.workspace1.accountScope = '0'.repeat(64);
  assert.deepEqual(store.read().settings, expected);
  const copy = store.read().settings;
  copy.workspaces.workspace1.push('new-board');
  assert.deepEqual(store.compareAndSet(2, copy), { ok: true, revision: 3 });
  store.close();
  store = openTrackerSettings(options(directory));
  assert.deepEqual(store.read(), { revision: 3, settings: copy });
  store.close();
  raw = new DatabaseSync(filename('profile-1'));
  assert.deepEqual(identity(), beforeIdentity);
  raw.close();
});

test('unattended opt-ins are strict, bounded and corrupt persisted data fails closed', t => {
  const { directory, filename } = fixture(t);
  const store = openTrackerSettings(options(directory));
  const entry = { accountScope: 'a'.repeat(64), incarnation: 'created' };
  const invalidMaps = [
    null, [], 'not-a-map', Object.create(null),
    { '../bad': entry }, { ['x'.repeat(129)]: entry },
    { ws: null }, { ws: [] }, { ws: Object.create(null) },
    { ws: { ...entry, extra: true } }, { ws: { accountScope: entry.accountScope } },
    { ws: { ...entry, accountScope: 'A'.repeat(64) } },
    { ws: { ...entry, accountScope: 'g'.repeat(64) } },
    { ws: { ...entry, accountScope: 'a'.repeat(63) } },
    { ws: { ...entry, accountScope: 'a'.repeat(65) } },
    { ws: { ...entry, accountScope: 1 } },
    { ws: { ...entry, incarnation: '' } },
    { ws: { ...entry, incarnation: 'x'.repeat(257) } },
    { ws: { ...entry, incarnation: '\ud800' } },
    ...['\u0000', '\u001f', '\u007f', '\u009f', '\u202a', '\u202e', '\u2066', '\u2069'].map(incarnation => ({ ws: { ...entry, incarnation } })),
    { ws: { ...entry, incarnation: null } },
    Object.defineProperty({}, 'ws', { value: entry, enumerable: false }),
    Object.defineProperty({}, 'ws', { get() { throw new Error('getter invoked'); }, enumerable: true }),
    { [Symbol('ws')]: entry },
    { ws: Object.defineProperty({ incarnation: 'created' }, 'accountScope', { get() { throw new Error('getter invoked'); }, enumerable: true }) },
    { ws: { ...entry, [Symbol('extra')]: true } },
  ];
  for (const unattendedIssueCreation of invalidMaps) {
    assert.throws(() => store.compareAndSet(0, { ...data(), unattendedIssueCreation }), isCode('invalid'));
  }
  assert.throws(() => store.compareAndSet(0, Object.defineProperty(data(), 'unattendedIssueCreation', { get() { throw new Error('getter invoked'); }, enumerable: true })), isCode('invalid'));
  assert.deepEqual(store.read(), { revision: 0, settings: { connection: null, workspaces: {} } });
  assert.deepEqual(store.compareAndSet(0, { ...data(), unattendedIssueCreation: {} }), { ok: true, revision: 1 });
  store.close();
  const raw = new DatabaseSync(filename('profile-1'));
  raw.prepare('UPDATE settings SET json = ?').run(JSON.stringify({ ...data(), unattendedIssueCreation: { ws: { ...entry, accountScope: 'bad' } } }));
  raw.close();
  assert.throws(() => openTrackerSettings(options(directory)), isCode('corrupt'));
});

test('board authorizations round-trip alongside legacy keys without migration or schema changes', t => {
  const { directory, filename } = fixture(t);
  let store = openTrackerSettings(options(directory));
  const legacy = { ...data(), unattendedIssueCreation: { ws: { accountScope: 'a'.repeat(64), incarnation: 'created' } } };
  assert.deepEqual(store.compareAndSet(0, legacy), { ok: true, revision: 1 });
  store.close();
  let raw = new DatabaseSync(filename('profile-1'));
  const identity = () => ({ app: raw.prepare('PRAGMA application_id').get(), version: raw.prepare('PRAGMA user_version').get(), schema: raw.prepare('SELECT * FROM sqlite_schema ORDER BY name').all() });
  const beforeIdentity = identity();
  const beforeRow = raw.prepare('SELECT * FROM settings').get();
  raw.close();
  store = openTrackerSettings(options(directory));
  assert.deepEqual(store.read(), { revision: 1, settings: legacy });
  assert.equal(Object.hasOwn(store.read().settings, 'boardAuthorizations'), false);
  store.close();
  raw = new DatabaseSync(filename('profile-1'));
  assert.deepEqual(raw.prepare('SELECT * FROM settings').get(), beforeRow);
  raw.close();
  store = openTrackerSettings(options(directory));
  const boardAuthorizations = { workspace1: { accountScope: '0123456789abcdef'.repeat(4), incarnation: 'created', boardIds: ['9', '1', '999999999999999'] } };
  const combined = { ...legacy, boardAuthorizations };
  assert.deepEqual(store.compareAndSet(1, combined), { ok: true, revision: 2 });
  assert.deepEqual(store.compareAndSet(1, legacy), { ok: false, revision: 2 });
  assert.deepEqual(store.read(), { revision: 2, settings: combined });
  store.close();
  store = openTrackerSettings(options(directory));
  assert.deepEqual(store.read(), { revision: 2, settings: combined });
  const onlyAuthorization = { ...data(), boardAuthorizations };
  assert.deepEqual(store.compareAndSet(2, onlyAuthorization), { ok: true, revision: 3 });
  assert.deepEqual(store.read().settings.boardAuthorizations.workspace1.boardIds, ['9', '1', '999999999999999']);
  store.close();
  raw = new DatabaseSync(filename('profile-1'));
  assert.deepEqual(identity(), beforeIdentity);
  raw.close();
});

test('board authorizations reject malformed values and fail closed on persisted tampering', t => {
  const { directory, filename } = fixture(t);
  const store = openTrackerSettings(options(directory));
  const entry = { accountScope: 'a'.repeat(64), incarnation: 'created', boardIds: ['2', '1'] };
  const getter = () => { throw new Error('getter invoked'); };
  const invalidMaps = [
    null, [], 'map', Object.create(null), Object.create({ ws: entry }),
    { '../bad': entry }, { ['x'.repeat(129)]: entry }, { [Symbol('ws')]: entry },
    Object.defineProperty({}, 'ws', { value: entry }),
    Object.defineProperty({}, 'ws', { get: getter, enumerable: true }),
    { ws: null }, { ws: Object.create(null) }, { ws: Object.create(entry) },
    { ws: { ...entry, extra: true } }, { ws: { accountScope: entry.accountScope, incarnation: entry.incarnation } },
    { ws: { ...entry, accountScope: 'A'.repeat(64) } }, { ws: { ...entry, accountScope: 'g'.repeat(64) } },
    { ws: { ...entry, accountScope: 'a'.repeat(63) } }, { ws: { ...entry, accountScope: null } },
    ...['', 'x'.repeat(257), '\ud800', '\u0000', '\u009f', '\u202a', '\u2069'].map(incarnation => ({ ws: { ...entry, incarnation } })),
    { ws: { ...entry, incarnation: null } },
    { ws: Object.defineProperty({ incarnation: 'created', boardIds: ['1'] }, 'accountScope', { get: getter, enumerable: true }) },
    { ws: { ...entry, [Symbol('extra')]: true } },
    ...[null, '1', [], [1], ['0'], ['01'], ['-1'], ['1.0'], [' 1'], ['1000000000000000'], ['1', '1'], Array(1), Object.assign(['1'], { extra: true }), Array.from({ length: 501 }, (_, i) => String(i + 1))].map(boardIds => ({ ws: { ...entry, boardIds } })),
    { ws: { ...entry, boardIds: Object.setPrototypeOf(['1'], {}) } },
    { ws: { ...entry, boardIds: Object.defineProperty(['1'], '0', { get: getter, enumerable: true }) } },
  ];
  for (const boardAuthorizations of invalidMaps) assert.throws(() => store.compareAndSet(0, { ...data(), boardAuthorizations }), isCode('invalid'));
  assert.throws(() => store.compareAndSet(0, Object.defineProperty(data(), 'boardAuthorizations', { get: getter, enumerable: true })), isCode('invalid'));
  assert.deepEqual(store.read(), { revision: 0, settings: { connection: null, workspaces: {} } });
  assert.deepEqual(store.compareAndSet(0, { ...data(), boardAuthorizations: {} }), { ok: true, revision: 1 });
  const raw = new DatabaseSync(filename('profile-1'));
  for (const boardAuthorizations of [{ ws: { ...entry, boardIds: [] } }, { ws: { ...entry, boardIds: ['01'] } }, { ws: { ...entry, extra: true } }, { ws: { ...entry, incarnation: '\u202e' } }]) {
    raw.prepare('UPDATE settings SET json = ?').run(JSON.stringify({ ...data(), boardAuthorizations }));
    assert.throws(() => store.read(), isCode('corrupt'));
    assert.throws(() => openTrackerSettings(options(directory)), isCode('corrupt'));
  }
  raw.close();
  store.close();
});

test('the mappings count toward the configured byte limit', t => {
  const { directory } = fixture(t);
  const value = { connection: null, workspaces: {}, unattendedIssueCreation: { ws: { accountScope: 'a'.repeat(64), incarnation: 'x'.repeat(128) } }, boardAuthorizations: { ws: { accountScope: 'b'.repeat(64), incarnation: 'created', boardIds: ['42', '1'] } } };
  const size = Buffer.byteLength(JSON.stringify(value));
  const small = openTrackerSettings({ ...options(directory), maxBytes: size - 1 });
  assert.throws(() => small.compareAndSet(0, value), isCode('too_large'));
  assert.deepEqual(small.read(), { revision: 0, settings: { connection: null, workspaces: {} } });
  small.close();
  const exact = openTrackerSettings({ ...options(directory), maxBytes: size });
  assert.deepEqual(exact.compareAndSet(0, value), { ok: true, revision: 1 });
  exact.close();
  assert.throws(() => openTrackerSettings({ ...options(directory), maxBytes: size - 1 }), isCode('corrupt'));
  const reopened = openTrackerSettings({ ...options(directory), maxBytes: size });
  assert.deepEqual(reopened.read(), { revision: 1, settings: value });
  reopened.close();
});
