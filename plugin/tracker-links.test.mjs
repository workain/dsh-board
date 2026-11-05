import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, linkSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { MAX_TRACKER_LINKS, openTrackerLinks } from './tracker-links.mjs';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'dsh-tracker-links-test-'));
  chmodSync(directory, 0o700);
  t.after(() => { assert.match(path.basename(directory), /^dsh-tracker-links-test-/); rmSync(directory, { recursive: true, force: true }); });
  return { directory, filename: id => path.join(directory, `tracker-links-${id}.sqlite`) };
}
const options = directory => ({ directory, profileId: 'profile-1' });
const scope = 'a'.repeat(64);
const query = (changes = {}) => ({ accountScope: scope, workspaceId: 'workspace-1', workspaceCreatedAt: '2026-01-01T00:00:00Z', ...changes });
const mutation = (revision, changes = {}) => ({ ...query(), expectedRevision: revision, issueId: 'issue_1', sessionId: 'session-1', linked: true, ...changes });
const code = value => error => error.code === value;

test('persisted scoped links, global CAS and independent profiles', t => {
  const { directory, filename } = fixture(t);
  const a = openTrackerLinks(options(directory));
  const b = openTrackerLinks(options(directory));
  const other = openTrackerLinks({ directory, profileId: 'profile-2' });
  assert.deepEqual(a.read(query()), { revision: 0, links: [] });
  assert.equal(lstatSync(filename('profile-1')).mode & 0o7777, 0o600);
  assert.deepEqual(a.mutate(mutation(0)), { ok: true, revision: 1 });
  assert.deepEqual(b.read(query()), { revision: 1, links: [{ issueId: 'issue_1', sessionId: 'session-1' }] });
  assert.deepEqual(b.mutate(mutation(0, { issueId: 'issue_2' })), { ok: false, revision: 1 });
  assert.deepEqual(b.mutate(mutation(1)), { ok: true, revision: 1 });
  assert.deepEqual(b.mutate(mutation(1, { linked: false, sessionId: 'missing' })), { ok: true, revision: 1 });
  assert.deepEqual(b.mutate(mutation(1, { issueId: 'issue_2', sessionId: 'session-2' })), { ok: true, revision: 2 });
  assert.deepEqual(other.read(query()), { revision: 0, links: [] });
  assert.deepEqual(b.mutate(mutation(2, { linked: false })), { ok: true, revision: 3 });
  a.close(); a.close(); b.close(); other.close();
  assert.throws(() => a.read(query()), code('closed'));
  const reopened = openTrackerLinks(options(directory));
  assert.deepEqual(reopened.read(query()), { revision: 3, links: [{ issueId: 'issue_2', sessionId: 'session-2' }] });
  reopened.close();
});

test('account scope, workspace and incarnation are independent and historical rows persist', t => {
  const { directory } = fixture(t);
  let s = openTrackerLinks(options(directory));
  const variants = [query(), query({ accountScope: 'b'.repeat(64) }), query({ workspaceId: 'workspace-2' }), query({ workspaceCreatedAt: 'replacement' })];
  variants.forEach((q, i) => assert.deepEqual(s.mutate({ ...mutation(i), ...q, sessionId: `session-${i}` }), { ok: true, revision: i + 1 }));
  variants.forEach((q, i) => assert.deepEqual(s.read(q), { revision: 4, links: [{ issueId: 'issue_1', sessionId: `session-${i}` }] }));
  s.close(); s = openTrackerLinks(options(directory));
  variants.forEach((q, i) => assert.deepEqual(s.read(q).links, [{ issueId: 'issue_1', sessionId: `session-${i}` }]));
  s.close();
});

test('separate processes racing a revision commit only once', async t => {
  const { directory } = fixture(t);
  const initial = openTrackerLinks(options(directory)); initial.close();
  const moduleUrl = new URL('./tracker-links.mjs', import.meta.url).href;
  const source = `
    import { openTrackerLinks } from ${JSON.stringify(moduleUrl)};
    const s = openTrackerLinks({ directory: process.argv[1], profileId: 'profile-1' });
    process.send('ready');
    process.on('message', () => {
      try { process.send(s.mutate({accountScope:'a'.repeat(64), workspaceId:'workspace-1', workspaceCreatedAt:'one', expectedRevision:0, issueId:process.argv[2], sessionId:'session-1', linked:true})); }
      catch (e) { process.send({error:e.code || e.message}); }
      finally { s.close(); process.disconnect(); }
    });`;
  const children = ['issue_1', 'issue_2'].map(id => spawn(process.execPath, ['--input-type=module', '-e', source, directory, id], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }));
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
  const final = openTrackerLinks(options(directory));
  assert.equal(final.read(query({ workspaceCreatedAt: 'one' })).links.length, 1); final.close();
});

test('strict inputs refuse missing scope, credentials, invalid identifiers and partial writes', t => {
  const { directory, filename } = fixture(t);
  const s = openTrackerLinks(options(directory));
  const invalid = [
    {}, { ...mutation(0), accountScope: undefined }, { ...mutation(0), accountScope: 'a'.repeat(63) },
    { ...mutation(0), accountScope: 'A'.repeat(64) }, { ...mutation(0), accountScope: 'g'.repeat(64) },
    { ...mutation(0), accountScope: 'token' }, { ...mutation(0), token: 'literal-secret-token' },
    { ...mutation(0), workspaceId: '../escape' }, { ...mutation(0), workspaceCreatedAt: '' },
    { ...mutation(0), workspaceCreatedAt: 'x\n' }, { ...mutation(0), sessionId: ' x ' },
    { ...mutation(0), sessionId: 'x\0y' }, { ...mutation(0), issueId: '' },
    { ...mutation(0), issueId: 'x'.repeat(129) }, { ...mutation(0), issueId: 'Q-1/path' },
    { ...mutation(0), issueId: 123 }, { ...mutation(0), issueId: null }, { ...mutation(0), issueId: new String('123') },
    { ...mutation(0), issueId: 'x\n' }, { ...mutation(0), issueKey: 'QUEUE-1' },
    { ...mutation(0), workspaceCreatedAt: '\ud800' }, { ...mutation(0), workspaceCreatedAt: '\udc00' },
    { ...mutation(0), sessionId: '\ud800' }, { ...mutation(0), sessionId: '\udc00' },
    { ...mutation(0), linked: 1 }, { ...mutation(0), expectedRevision: -1 },
    { ...mutation(0), expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    Object.defineProperty(mutation(0), 'issueId', { get() { throw Error('getter ran'); }, enumerable: true }),
  ];
  for (const input of invalid) assert.throws(() => s.mutate(input), code('invalid'));
  assert.throws(() => s.read({ ...query(), extra: 'secret' }), code('invalid'));
  assert.deepEqual(s.read(query()), { revision: 0, links: [] });
  s.close();
  assert.equal(readFileSync(filename('profile-1')).includes(Buffer.from('literal-secret-token')), false);
});

test('immutable issue IDs and well-formed Unicode round-trip without surrogate aliases', t => {
  const { directory } = fixture(t);
  const s = openTrackerLinks(options(directory));
  const longId = 'X'.repeat(128);
  assert.deepEqual(s.mutate(mutation(0, { issueId: longId, workspaceCreatedAt: '😀', sessionId: '😀' })), { ok: true, revision: 1 });
  assert.deepEqual(s.mutate(mutation(1, { issueId: '9', workspaceCreatedAt: '\ufffd', sessionId: '\ufffd' })), { ok: true, revision: 2 });
  assert.deepEqual(s.mutate(mutation(2, { issueId: 'y'.repeat(49), workspaceCreatedAt: '49', sessionId: 's' })), { ok: true, revision: 3 });
  assert.deepEqual(s.read(query({ workspaceCreatedAt: '😀' })).links, [{ issueId: longId, sessionId: '😀' }]);
  assert.deepEqual(s.read(query({ workspaceCreatedAt: '49' })).links, [{ issueId: 'y'.repeat(49), sessionId: 's' }]);
  assert.deepEqual(s.read(query({ workspaceCreatedAt: '\ufffd' })).links, [{ issueId: '9', sessionId: '\ufffd' }]);
  assert.throws(() => s.read(query({ workspaceCreatedAt: '\ud800' })), code('invalid'));
  assert.throws(() => s.mutate(mutation(3, { issueId: '9', workspaceCreatedAt: '\ufffd', sessionId: '\ud800', linked: false })), code('invalid'));
  assert.deepEqual(s.read(query({ workspaceCreatedAt: '\ufffd' })).links, [{ issueId: '9', sessionId: '\ufffd' }]);
  s.close();
});

test('rejects invalid profiles and insecure paths and sidecars', t => {
  const { directory, filename } = fixture(t);
  for (const profileId of ['', '.', '../other', 'a/b', 'a'.repeat(65), 'bad id']) assert.throws(() => openTrackerLinks({ directory, profileId }), code('invalid'));
  assert.throws(() => openTrackerLinks({ directory: 'relative', profileId: 'p' }), code('path'));
  chmodSync(directory, 0o755); assert.throws(() => openTrackerLinks(options(directory)), code('permissions')); chmodSync(directory, 0o700);
  const s = openTrackerLinks(options(directory)); s.close();
  linkSync(filename('profile-1'), filename('hard'));
  assert.throws(() => openTrackerLinks(options(directory)), code('permissions'));
  symlinkSync(filename('profile-1'), filename('link'));
  assert.throws(() => openTrackerLinks({ directory, profileId: 'link' }));
  symlinkSync(directory, path.join(directory, 'linked-dir'));
  assert.throws(() => openTrackerLinks({ directory: path.join(directory, 'linked-dir'), profileId: 'p' }), code('permissions'));
  symlinkSync(filename('profile-1'), `${filename('link')}-journal`);
  assert.throws(() => openTrackerLinks({ directory, profileId: 'link' }));
  const fresh = openTrackerLinks({ directory, profileId: 'sidecar' }); fresh.close();
  symlinkSync(filename('sidecar'), `${filename('sidecar')}-journal`);
  assert.throws(() => openTrackerLinks({ directory, profileId: 'sidecar' }), code('permissions'));
});

test('refuses blank, corrupted, altered and mismatched databases without repair', t => {
  const { directory, filename } = fixture(t);
  writeFileSync(filename('blank'), '', { mode: 0o600 });
  assert.throws(() => openTrackerLinks({ directory, profileId: 'blank' }), code('schema'));
  assert.equal(lstatSync(filename('blank')).size, 0);
  writeFileSync(filename('bad'), 'not sqlite', { mode: 0o600 });
  assert.throws(() => openTrackerLinks({ directory, profileId: 'bad' }));
  let s = openTrackerLinks(options(directory)); s.close();
  let raw = new DatabaseSync(filename('profile-1'));
  raw.exec('PRAGMA user_version = 2'); raw.close();
  assert.throws(() => openTrackerLinks(options(directory)), code('schema'));
  raw = new DatabaseSync(filename('profile-1'));
  raw.exec("PRAGMA user_version = 1; UPDATE meta SET profile_id = 'another'"); raw.close();
  assert.throws(() => openTrackerLinks(options(directory)), code('corrupt'));
  raw = new DatabaseSync(filename('profile-1'));
  raw.exec("UPDATE meta SET profile_id = 'profile-1'; INSERT INTO links VALUES ('bad','ws','one','Q-1','s')"); raw.close();
  assert.throws(() => openTrackerLinks(options(directory)), code('corrupt'));
});

test('rechecks schema and data on every operation', t => {
  const { directory, filename } = fixture(t);
  const s = openTrackerLinks(options(directory));
  const raw = new DatabaseSync(filename('profile-1'));
  raw.exec('PRAGMA user_version = 99');
  assert.throws(() => s.read(query()), code('schema'));
  assert.throws(() => s.mutate(mutation(0)), code('schema'));
  raw.exec("PRAGMA user_version = 1; INSERT INTO links VALUES ('bad','ws','one','Q-1','s')");
  assert.throws(() => s.read(query()), code('corrupt'));
  assert.throws(() => s.mutate(mutation(0)), code('corrupt'));
  raw.exec('DELETE FROM links; CREATE TABLE extra (value TEXT)'); raw.close();
  assert.throws(() => s.read(query()), code('schema'));
  s.close();
});

test('global bounded count and exhausted revisions do not partially mutate', t => {
  const { directory, filename } = fixture(t);
  let s = openTrackerLinks(options(directory)); s.close();
  let raw = new DatabaseSync(filename('profile-1'));
  raw.exec('BEGIN');
  const insert = raw.prepare('INSERT INTO links VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < MAX_TRACKER_LINKS; i++) insert.run(scope, 'workspace-1', 'one', 'Q-1', `s-${i}`);
  raw.exec('COMMIT'); raw.close();
  s = openTrackerLinks(options(directory));
  assert.throws(() => s.mutate(mutation(0)), code('too_large'));
  assert.equal(s.read(query({ workspaceCreatedAt: 'one' })).links.length, MAX_TRACKER_LINKS);
  assert.deepEqual(s.mutate(mutation(0, { workspaceCreatedAt: 'one', issueId: 'Q-1', sessionId: 's-0', linked: false })), { ok: true, revision: 1 });
  assert.deepEqual(s.mutate(mutation(1)), { ok: true, revision: 2 });
  s.close();
  raw = new DatabaseSync(filename('profile-1')); raw.prepare('UPDATE meta SET revision = ?').run(Number.MAX_SAFE_INTEGER); raw.close();
  s = openTrackerLinks(options(directory));
  assert.throws(() => s.mutate(mutation(Number.MAX_SAFE_INTEGER, { linked: false })), code('invalid'));
  assert.equal(s.read(query()).revision, Number.MAX_SAFE_INTEGER);
  s.close();
});
