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
  const initial = openTrackerSettings(options(directory)); initial.close();
  const moduleUrl = new URL('./tracker-settings.mjs', import.meta.url).href;
  const source = `
    import { openTrackerSettings } from ${JSON.stringify(moduleUrl)};
    const s = openTrackerSettings({directory: process.argv[1], profileId:'profile-1'});
    process.send('ready');
    process.on('message', () => {
      try { process.send(s.compareAndSet(0, {connection:null, workspaces:{ws:[process.argv[2]]}})); }
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
  assert.deepEqual((await Promise.all(results)).sort((a, b) => Number(a.ok) - Number(b.ok)), [{ ok: false, revision: 1 }, { ok: true, revision: 1 }]);
  const final = openTrackerSettings(options(directory));
  assert.equal(final.read().revision, 1); final.close();
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
