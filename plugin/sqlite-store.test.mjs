import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, chmodSync, lstatSync, rmSync, writeFileSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openBoardStore } from './sqlite-store.mjs';

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-board-sqlite-test-'));
  chmodSync(dir, 0o700);
  t.after(() => { assert.match(path.basename(dir), /^dsh-board-sqlite-test-/); rmSync(dir, { recursive: true, force: true }); });
  return { dir, db: path.join(dir, 'board.sqlite') };
}
const advance = current => ({ ...current, revision: current.revision + 1 });
const isCode = code => error => error.code === code;

test('persists across close and reopen, no stale cache, conflict and rollback', t => {
  const { db } = fixture(t);
  const a = openBoardStore({ path: db });
  const b = openBoardStore({ path: db });
  assert.equal(lstatSync(db).mode & 0o777, 0o600);
  assert.equal(a.read().revision, 0);
  assert.equal(a.transaction(0, advance).revision, 1);
  assert.equal(b.read().revision, 1);
  assert.throws(() => b.transaction(0, advance), isCode('conflict'));
  assert.throws(() => a.transaction(1, () => { throw new Error('abort updater'); }), /abort updater/);
  assert.equal(a.read().revision, 1);
  a.close(); b.close();
  assert.throws(() => a.read(), isCode('closed'));
  const reopened = openBoardStore({ path: db });
  assert.equal(reopened.read().revision, 1);
  assert.equal(reopened.transaction(null, advance).revision, 2);
  reopened.close();
});

test('two child processes racing the same expected revision yield one commit', async t => {
  const { db } = fixture(t);
  const store = openBoardStore({ path: db });
  store.transaction(0, advance); store.close();
  const moduleUrl = new URL('./sqlite-store.mjs', import.meta.url).href;
  const source = `
    import { openBoardStore } from ${JSON.stringify(moduleUrl)};
    const s = openBoardStore({ path: process.argv[1] });
    process.send('ready');
    process.on('message', () => {
      try { s.transaction(1, x => ({...x, revision: x.revision + 1})); process.send('success'); }
      catch (e) { process.send(e.code || e.message); }
      finally { s.close(); process.disconnect(); }
    });`;
  const children = [0, 1].map(() => spawn(process.execPath, ['--input-type=module', '-e', source, db], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }));
  t.after(() => { for (const child of children) if (child.exitCode === null) child.kill(); });
  const results = children.map(child => new Promise((resolve, reject) => {
    let readyResolve;
    const ready = new Promise(r => { readyResolve = r; });
    let result; let stderr = '';
    child.stderr.setEncoding('utf8'); child.stderr.on('data', data => { stderr += data; });
    child.on('message', message => { if (message === 'ready') readyResolve(); else result = message; });
    child.on('error', reject);
    child.on('exit', code => code === 0 && result ? resolve(result) : reject(new Error(`child exited ${code}: ${stderr}`)));
    child.ready = ready;
  }));
  await Promise.all(children.map(child => child.ready));
  children.forEach(child => child.send('go'));
  assert.deepEqual((await Promise.all(results)).sort(), ['conflict', 'success']);
  const final = openBoardStore({ path: db });
  assert.equal(final.read().revision, 2); final.close();
});

test('refuses corrupt, unknown, and existing blank databases', t => {
  const { dir, db } = fixture(t);
  writeFileSync(db, 'not a sqlite database', { mode: 0o600 });
  assert.throws(() => openBoardStore({ path: db }));
  const unknown = path.join(dir, 'unknown.sqlite');
  const raw = new DatabaseSync(unknown);
  chmodSync(unknown, 0o600);
  raw.exec('CREATE TABLE other (x TEXT); PRAGMA user_version=99'); raw.close();
  assert.throws(() => openBoardStore({ path: unknown }), isCode('schema'));
  const blank = path.join(dir, 'blank.sqlite');
  writeFileSync(blank, '', { mode: 0o600 });
  assert.throws(() => openBoardStore({ path: blank }), isCode('schema'));
});

test('refuses unsupported versions and invalid persisted aggregates', t => {
  const { db } = fixture(t);
  let store = openBoardStore({ path: db }); store.close();
  let raw = new DatabaseSync(db);
  raw.exec('PRAGMA user_version = 2'); raw.close();
  assert.throws(() => openBoardStore({ path: db }), isCode('schema'));
  raw = new DatabaseSync(db); raw.exec("PRAGMA user_version = 1; UPDATE aggregate SET json = '{broken'"); raw.close();
  assert.throws(() => openBoardStore({ path: db }), isCode('corrupt'));
});

test('refuses metadata or schema changes after a store was opened', t => {
  const { db } = fixture(t);
  const store = openBoardStore({ path: db });
  let raw = new DatabaseSync(db);
  raw.exec('PRAGMA user_version = 9'); raw.close();
  assert.throws(() => store.read(), isCode('schema'));
  assert.throws(() => store.transaction(0, advance), isCode('schema'));
  raw = new DatabaseSync(db);
  raw.exec('PRAGMA user_version = 1; CREATE TABLE audit (x INTEGER); CREATE TRIGGER capture AFTER UPDATE ON aggregate BEGIN INSERT INTO audit VALUES(NEW.revision); END'); raw.close();
  assert.throws(() => store.read(), isCode('schema'));
  assert.throws(() => store.transaction(0, advance), isCode('schema'));
  raw = new DatabaseSync(db); assert.equal(raw.prepare('SELECT count(*) AS n FROM audit').get().n, 0); raw.close();
  store.close();
});

test('bounds data, validates updates, and honours cancellation before commit', t => {
  const { db } = fixture(t);
  const store = openBoardStore({ path: db, maxBytes: 200 });
  assert.throws(() => store.transaction(0, x => ({ ...x, revision: 1, links: [{ boardId: 'x', taskId: 'y', sessionId: 'z' }] })));
  assert.throws(() => store.transaction(0, async x => advance(x)), isCode('invalid'));
  assert.throws(() => store.transaction(0, x => ({ ...x, revision: 2 })), isCode('invalid'));
  assert.throws(() => store.transaction(0, x => ({ ...x, revision: 1, state: { ...x.state, boards: [], workspaces: [{ id: 'x'.repeat(300), boardIds: [], defaultBoardId: null }] } })), isCode('too_large'));
  const c = new AbortController();
  assert.throws(() => store.transaction(0, x => { c.abort(); return advance(x); }, { signal: c.signal }), { name: 'AbortError' });
  assert.equal(store.read().revision, 0);
  const d = new AbortController(); d.abort();
  assert.throws(() => store.read({ signal: d.signal }), { name: 'AbortError' });
  store.close();
});

test('rejects insecure directories, symlinks and hardlinked database files', t => {
  const { dir, db } = fixture(t);
  assert.throws(() => openBoardStore({ path: 'relative.db' }), isCode('path'));
  chmodSync(dir, 0o755);
  assert.throws(() => openBoardStore({ path: db }), isCode('permissions'));
  chmodSync(dir, 0o700);
  const store = openBoardStore({ path: db }); store.close();
  const hard = path.join(dir, 'hard.sqlite'); linkSync(db, hard);
  assert.throws(() => openBoardStore({ path: db }), isCode('permissions'));
  const symlink = path.join(dir, 'link.sqlite'); symlinkSync(db, symlink);
  assert.throws(() => openBoardStore({ path: symlink }));
});

test('refuses unsafe sidecars and symlinked parent paths', t => {
  const { dir, db } = fixture(t);
  const store = openBoardStore({ path: db }); store.close();
  const sidecar = `${db}-journal`;
  symlinkSync(db, sidecar);
  assert.throws(() => openBoardStore({ path: db }), isCode('permissions'));
  const dirLink = path.join(dir, 'linked-dir');
  symlinkSync(dir, dirLink);
  assert.throws(() => openBoardStore({ path: path.join(dirLink, 'other.sqlite') }), isCode('permissions'));
});
