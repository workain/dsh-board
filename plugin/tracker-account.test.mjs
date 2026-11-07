import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openAccountNamespace } from './tracker-account.mjs';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'tracker-account-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const identity = { orgType: 'org', orgId: 'synthetic-org', principalId: '12345678901234567' };
const open = (directory, profileId = 'web') => openAccountNamespace({ directory, profileId });
const isCode = code => e => e?.code === code;

test('stable namespace isolates profiles, tenants, principals, and ignores token rotation', t => {
  const dir = fixture(t), a = open(dir), b = open(dir, 'other');
  const value = a.derive(identity);
  assert.match(value, /^[0-9a-f]{64}$/);
  assert.notEqual(value, b.derive(identity));
  for (const input of [{ ...identity, orgType: 'cloud' }, { ...identity, orgId: 'different' }, { ...identity, principalId: '123' }]) assert.notEqual(value, a.derive(input));
  // Tokens are not input: two credential snapshots with the same identity map identically.
  const snapshots = ['token-before', 'token-after'].map(token => ({ token, ...identity }));
  const deriveSnapshot = ({ orgType, orgId, principalId }) => a.derive({ orgType, orgId, principalId });
  assert.equal(deriveSnapshot(snapshots[0]), deriveSnapshot(snapshots[1]));
  assert.throws(() => a.derive(snapshots[0]), isCode('invalid'));
  const persisted = readFileSync(path.join(dir, 'tracker-account-web.key'));
  assert.equal(persisted.length, 64);
  assert.equal(statSync(path.join(dir, 'tracker-account-web.key')).mode & 0o777, 0o600);
  for (const secret of [identity.orgId, identity.principalId, 'token-before']) assert.equal(persisted.includes(secret), false);
  a.close(); a.close(); b.close();
  assert.throws(() => a.derive(identity), isCode('closed'));
  const reopened = open(dir); assert.equal(reopened.derive(identity), value); reopened.close();
});

test('missing key with dependent DB or sidecar fails closed, unrelated settings DB does not', t => {
  const dir = fixture(t), key = path.join(dir, 'tracker-account-web.key');
  writeFileSync(path.join(dir, 'tracker-web.sqlite'), 'settings', { mode: 0o600 });
  const a = open(dir); a.close(); unlinkSync(key);
  const db = path.join(dir, 'tracker-links-web.sqlite');
  for (const suffix of ['', '-wal', '-journal', '-shm']) {
    writeFileSync(db + suffix, 'existing', { mode: 0o600 });
    assert.throws(() => open(dir), isCode('missing_key'));
    assert.equal(existsSync(key), false);
    unlinkSync(db + suffix);
  }
  symlinkSync('missing-target', db);
  assert.throws(() => open(dir), isCode('missing_key'));
});

test('corrupt and unsafe keys are never replaced', t => {
  const dir = fixture(t), key = path.join(dir, 'tracker-account-web.key');
  const db = path.join(dir, 'tracker-links-web.sqlite');
  writeFileSync(db, 'existing', { mode: 0o600 });
  for (const content of ['', 'short', 'x'.repeat(33), 'x'.repeat(64)]) {
    writeFileSync(key, content, { mode: 0o600 });
    assert.throws(() => open(dir), isCode('corrupt'));
    assert.equal(readFileSync(key, 'utf8'), content);
  }
  writeFileSync(key, 'x'.repeat(32)); chmodSync(key, 0o644);
  assert.throws(() => open(dir), isCode('permissions'));
  chmodSync(key, 0o600);
  const hard = path.join(dir, 'hard'); linkSync(key, hard);
  assert.throws(() => open(dir), isCode('permissions')); unlinkSync(hard);
  unlinkSync(key); symlinkSync('other', key);
  assert.throws(() => open(dir));
});

test('validates directory, identifiers, shape, and unsafe numeric principal IDs', t => {
  const dir = fixture(t), a = open(dir);
  for (const principalId of [123, Number.MAX_SAFE_INTEGER + 1, '', '01', '-1', 'name', '1.0', '1'.repeat(65)]) assert.throws(() => a.derive({ ...identity, principalId }), isCode('invalid'));
  for (const orgId of ['', 'bad org', 'x'.repeat(257)]) assert.throws(() => a.derive({ ...identity, orgId }), isCode('invalid'));
  assert.throws(() => a.derive({ ...identity, orgType: 'x' }), isCode('invalid'));
  assert.throws(() => a.derive({ ...identity, token: 'secret' }), isCode('invalid'));
  assert.throws(() => open(dir, '../bad'), isCode('invalid'));
  assert.throws(() => openAccountNamespace({ directory: 'relative', profileId: 'web' }), isCode('path'));
  chmodSync(dir, 0o755); assert.throws(() => open(dir), isCode('permissions')); chmodSync(dir, 0o700);
  const target = path.join(dir, 'link'); symlinkSync(dir, target);
  assert.throws(() => open(target), isCode('permissions'));
  a.close();
});

test('concurrent creators never return different keys; incomplete files fail closed', async t => {
  const dir = fixture(t), script = `
    import { openAccountNamespace } from ${JSON.stringify(new URL('./tracker-account.mjs', import.meta.url).href)};
    try { const a = openAccountNamespace({directory:process.argv[1],profileId:'web'}); console.log(a.derive(${JSON.stringify(identity)})); a.close(); }
    catch (e) { if (e.code !== 'corrupt') { console.error(e); process.exitCode = 1; } else console.log('retry'); }
  `;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
  });
  const results = await Promise.all(Array.from({ length: 20 }, run));
  const good = results.filter(x => x !== 'retry'); assert.ok(good.length > 0); assert.equal(new Set(good).size, 1);
  const a = open(dir); assert.equal(a.derive(identity), good[0]); a.close();
});
