import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { apply, boardDatabasePath, inject } from './index.js';
import { createBoardService, MAX_BODY_BYTES, MAX_PENDING, MAX_SNAPSHOT_BYTES } from './service.mjs';
import { openBoardStore, StoreError } from './sqlite-store.mjs';
import * as core from './core.mjs';

const initial = () => ({ revision: 0, state: core.createState(), links: [] });
const registry = () => ({ get: id => ({ w: { id: 'w', sessionIds: ['s'] }, w2: { id: 'w2', sessionIds: ['s2'] } })[id], archivedSessionIds: [] });
function mockStore(start = initial()) {
  let saved = structuredClone(start), failWrite = false, beforeUpdate;
  return {
    read({ signal } = {}) { signal?.throwIfAborted(); return structuredClone(saved); },
    transaction(expected, updater, { signal } = {}) {
      signal?.throwIfAborted();
      if (expected !== null && saved.revision !== expected) throw new StoreError('conflict', 'conflict');
      beforeUpdate?.();
      const next = updater(structuredClone(saved));
      signal?.throwIfAborted();
      if (failWrite) throw Error('disk');
      saved = structuredClone(next);
      return structuredClone(saved);
    },
    close() {}, fail(value) { failWrite = value; }, before(callback) { beforeUpdate = callback; }, get saved() { return structuredClone(saved); },
  };
}
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-board-service-test-'));
  t.after(() => { assert.match(path.basename(dir), /^dsh-board-service-test-/); rmSync(dir, { recursive: true, force: true }); });
  return { dir, db: path.join(dir, 'board.sqlite') };
}
const cmd = (revision, op, extra = {}) => ({ expectedRevision: revision, op, workspaceId: 'w', ...extra });
const post = command => new Request('http://localhost/api/dsh-board.mutate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) });
async function setup(service) {
  let result = await service.mutate(cmd(0, 'board.create', { name: 'Board' })); const b = result.boards[0].id;
  result = await service.mutate(cmd(1, 'status.save', { boardId: b, status: { name: 'Todo' } })); const c = result.boards[0].statuses[0].id;
  result = await service.mutate(cmd(2, 'task.save', { boardId: b, task: { title: 'Task', description: '', statusId: c } }));
  return { b, c, t: result.boards[0].tasks[0].id };
}
function context(workspaceRegistry = registry()) {
  const routes = [], cleanup = []; let tool, approvalRequest, approvalOutcome = 'allowed-once';
  const ctx = { workspaceRegistry, effect(fn) { cleanup.push(fn()); },
    approval: { async request(req) { approvalRequest = req; return approvalOutcome; } },
    tools: { register(value) { tool = value; } },
    connection: { fetch: { register(value) { routes.push(value); return () => {}; } } } };
  return { ctx, routes, cleanup, get tool() { return tool; }, get approvalRequest() { return approvalRequest; }, reject() { approvalOutcome = 'rejected'; } };
}
async function inHome(dir, action) {
  const old = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  try { return await action(); } finally { if (old === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = old; }
}
async function dispose(f) { for (const fn of f.cleanup.reverse()) await fn(); }

test('mock transactions: mutations, conflict, persistence, rollback and projection', async () => {
  const store = mockStore(), s = createBoardService(store, registry()), { b, c, t } = await setup(s);
  const [a, conflict] = await Promise.all([
    s.fetch(post(cmd(3, 'link.set', { boardId: b, taskId: t, sessionId: 's', linked: true }))),
    s.fetch(post(cmd(3, 'status.save', { boardId: b, status: { id: c, name: 'Changed' } }))),
  ]);
  assert.equal(a.status, 200); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error.code, 'conflict');
  assert.equal((await s.fetch(post(cmd(4, 'link.set', { boardId: b, taskId: t, sessionId: 's2', linked: true })))).status, 400);
  store.fail(true); assert.equal((await s.fetch(post(cmd(4, 'status.save', { boardId: b, status: { name: 'Failed' } })))).status, 500);
  assert.equal((await s.read()).revision, 4); store.fail(false); await s.close();
  const saved = store.saved; saved.state = core.assignBoard(core.ensureWorkspace(saved.state, 'w2'), 'w2', b);
  const reopened = createBoardService(mockStore(saved), registry());
  assert.deepEqual((await reopened.read()).boards.map(x => [x.id, x.workspaceId]), [[b, 'w'], [b, 'w2']]);
  const updated = await reopened.mutate({ expectedRevision: 4, op: 'status.save', workspaceId: 'w2', boardId: b, status: { name: 'Shared' } });
  assert.equal(updated.boards[0].statuses.length, 2); assert.equal(updated.boards[1].statuses.length, 2); await reopened.close();
});

test('real SQLite: exact routes, direct approval and tool/API race across instances', async t => {
  const { dir } = fixture(t);
  await inHome(dir, async () => {
    const a = context(), b = context(); await apply(a.ctx); await apply(b.ctx);
    assert.deepEqual(inject, ['connection', 'workspaceRegistry', 'tools', 'approval']);
    assert.deepEqual(a.routes.map(r => [r.path, r.methods, r.requestBody]), [
      ['/api/dsh-board', ['GET'], 'buffered'], ['/api/dsh-board.mutate', ['POST'], 'streaming'],
    ]);
    const invoke = async c => (await a.routes[1].fetch(post(c))).json();
    let result = await invoke(cmd(0, 'board.create', { name: 'Board' })); const boardId = result.boards[0].id;
    result = await invoke(cmd(1, 'status.save', { boardId, status: { name: 'Todo' } })); const statusId = result.boards[0].statuses[0].id;
    result = await invoke(cmd(2, 'task.save', { boardId, task: { title: 'Task', description: '', statusId } })); const taskId = result.boards[0].tasks[0].id;
    const args = { workspaceId: 'w', boardId, taskId, linked: true }, signal = new AbortController().signal;
    await assert.rejects(a.tool.execute(args, { signal }), /requires a caller agent/);
    await assert.rejects(a.tool.execute({ ...args, sessionId: 's' }, { agent: { id: 's' }, signal }), /Invalid/);
    await assert.rejects(a.tool.execute(args, { agent: { id: 's2' }, signal }), /session_not_in_workspace/);
    a.reject(); await assert.rejects(a.tool.execute(args, { agent: { id: 's' }, signal }), /not approved/);
    assert.match(a.approvalRequest.reason, new RegExp(`board ${boardId}; task ${taskId}`));
    const [toolResult, api] = await Promise.all([
      b.tool.execute(args, { agent: { id: 's' }, callId: 'call', signal }),
      a.routes[1].fetch(post(cmd(3, 'status.save', { boardId, status: { name: 'Race' } }))),
    ]);
    assert.equal(toolResult.revision, 4); assert.equal(api.status, 409);
    assert.equal(b.approvalRequest.agent.id, 's'); assert.equal(b.approvalRequest.callId, 'call');
    const snap = await (await a.routes[0].fetch(new Request('http://localhost/api/dsh-board'))).json();
    assert.equal(snap.revision, 4); assert.deepEqual(snap.links, [{ boardId, taskId, sessionId: 's' }]);
    assert.equal(lstatSync(path.join(dir, 'storages', 'dsh-board')).mode & 0o7777, 0o700);
    await dispose(a); await dispose(b);
    const reopened = context(); await apply(reopened.ctx);
    assert.equal((await (await reopened.routes[0].fetch(new Request('http://localhost/api/dsh-board'))).json()).revision, 4); await dispose(reopened);
  });
});

test('independent processes race through API and tool on a shared SQLite database', async t => {
  const { dir, db } = fixture(t), s = createBoardService(openBoardStore({ path: db }), registry());
  const { b, t: taskId } = await setup(s); await s.close();
  const storeUrl = new URL('./sqlite-store.mjs', import.meta.url).href;
  const serviceUrl = new URL('./service.mjs', import.meta.url).href;
  const code = `
    import { openBoardStore } from ${JSON.stringify(storeUrl)};
    import { createBoardService } from ${JSON.stringify(serviceUrl)};
    const [db, boardId, taskId, mode] = process.argv.slice(1);
    const registry = { get: id => id === 'w' ? { sessionIds: ['s'] } : undefined, archivedSessionIds: [] };
    const service = createBoardService(openBoardStore({path: db}), registry);
    process.send('ready');
    process.once('message', async () => {
      try {
        if (mode === 'tool') {
          const result = await service.linkCurrentSession({workspaceId:'w',boardId,taskId,linked:true}, 's');
          process.send({mode, revision:result.revision});
        } else {
          const cmd = {expectedRevision:3,op:'status.save',workspaceId:'w',boardId,status:{name:'Race'}};
          const req = new Request('http://localhost/api/dsh-board.mutate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cmd)});
          const result = await service.fetch(req); process.send({mode,status:result.status});
        }
      } catch (error) { process.send({mode,error:error.code || error.message}); }
      finally { await service.close(); process.disconnect(); }
    });`;
  const children = ['tool', 'api'].map(mode => spawn(process.execPath, ['--input-type=module', '-e', code, db, b, taskId, mode], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }));
  t.after(() => { for (const child of children) if (child.exitCode === null) child.kill(); });
  const outcomes = children.map(child => {
    let readyResolve; const ready = new Promise(resolve => { readyResolve = resolve; }); let output, stderr = '';
    const result = new Promise((resolve, reject) => {
      child.stderr.setEncoding('utf8'); child.stderr.on('data', part => { stderr += part; });
      child.on('message', msg => { if (msg === 'ready') readyResolve(); else output = msg; });
      child.on('error', reject); child.on('exit', exit => exit === 0 && output ? resolve(output) : reject(new Error(`child exited ${exit}: ${stderr}`)));
    });
    return { ready, result };
  });
  await Promise.all(outcomes.map(x => x.ready)); children.forEach(child => child.send('go'));
  const results = await Promise.all(outcomes.map(x => x.result));
  const tool = results.find(x => x.mode === 'tool'), api = results.find(x => x.mode === 'api');
  assert.equal(tool.error, undefined); assert.ok([4, 5].includes(tool.revision));
  assert.equal(api.status, tool.revision === 4 ? 409 : 200);
  const verify = openBoardStore({ path: db }); assert.equal(verify.read().revision, tool.revision); assert.equal(verify.read().links.length, 1); verify.close();
});

test('session membership is checked inside the transaction, including unlink', async () => {
  let members = ['s']; const reg = { get: () => ({ sessionIds: members }), archivedSessionIds: [] };
  const store = mockStore(), s = createBoardService(store, reg), { b, t } = await setup(s);
  store.before(() => { members = []; });
  await assert.rejects(s.linkCurrentSession({ workspaceId: 'w', boardId: b, taskId: t, linked: false }, 's'), /session_not_in_workspace/);
  assert.equal((await s.read()).revision, 3); await s.close();
});

test('untrusted input, cancellation and queue are bounded', async () => {
  const store = mockStore(), s = createBoardService(store, registry());
  const oversized = new Request('http://localhost/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(MAX_BODY_BYTES + 1) });
  assert.equal((await s.fetch(oversized)).status, 413);
  const header = new Request('http://localhost/', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(MAX_BODY_BYTES + 1) }, body: '{}' });
  assert.equal((await s.fetch(header)).status, 413);
  assert.equal((await s.fetch(new Request('http://localhost/', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await s.fetch(post(cmd(0, 'board.create', { name: 'ok', extra: true })))).status, 400);
  assert.equal((await s.fetch(post(cmd(0, 'board.create', { name: 'ok', workspaceId: 'missing' })))).status, 404);
  const controller = new AbortController(); let cancelled = false;
  const stream = new ReadableStream({ pull() {}, cancel() { cancelled = true; } });
  const request = new Request('http://localhost/', { method: 'POST', duplex: 'half', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: stream });
  const waiting = s.fetch(request); controller.abort(); assert.equal((await waiting).status, 499); assert.equal(cancelled, true);
  const ops = Array.from({ length: MAX_PENDING }, () => s.read());
  await assert.rejects(s.read(), error => error.code === 'unavailable'); await Promise.all(ops);
  const c = new AbortController(); c.abort(); await assert.rejects(s.mutate(cmd(0, 'board.create', { name: 'No' }), c.signal));
  assert.equal((await s.read()).revision, 0); await s.close(); await s.close();
  await assert.rejects(s.read(), error => error.code === 'unavailable');
});

test('body readers are bounded and shutdown cancels stalled streams', async () => {
  const s = createBoardService(mockStore(), registry()); let cancelled = 0;
  const makeRequest = () => new Request('http://localhost/', { method: 'POST', duplex: 'half', headers: { 'content-type': 'application/json' },
    body: new ReadableStream({ pull() {}, cancel() { cancelled++; } }) });
  const waiting = Array.from({ length: MAX_PENDING }, () => s.fetch(makeRequest()));
  const overflow = await s.fetch(makeRequest()); assert.equal(overflow.status, 503);
  await s.close();
  const results = await Promise.all(waiting); assert.ok(results.every(result => result.status === 503));
  assert.equal(cancelled, MAX_PENDING + 1);
});

test('snapshot expansion and persisted aggregate are bounded', async t => {
  const { db } = fixture(t), store = openBoardStore({ path: db, maxBytes: 700 }), s = createBoardService(store, registry());
  const result = await s.fetch(post(cmd(0, 'board.create', { name: 'x'.repeat(200) })));
  assert.equal(result.status, 200);
  assert.equal((await s.fetch(post(cmd(1, 'board.create', { name: 'x'.repeat(200) })))).status, 413);
  assert.equal((await s.read()).revision, 1); await s.close();
  const state = core.createState();
  state.boards.push({ id: 'b', name: 'B', archived: false, columns: [{ id: 'c', name: 'C', archived: false }], iterations: [], tasks: [{ id: 't', title: 'T', description: 'x'.repeat(50000), columnId: 'c', iterationId: null, assignee: null, labels: [], priority: null, comments: [] }] });
  state.workspaces = Array.from({ length: Math.ceil(MAX_SNAPSHOT_BYTES / 50000) + 2 }, (_, i) => ({ id: `w${i}`, boardIds: ['b'], defaultBoardId: null }));
  const expanded = createBoardService(mockStore({ revision: 0, state, links: [] }), registry());
  await assert.rejects(expanded.read(), error => error.code === 'too_large'); await expanded.close();
});

test('initialization path is private, fails closed and never repairs blank database', async t => {
  const { dir } = fixture(t), missing = path.join(dir, 'uninitialized-home');
  assert.equal(boardDatabasePath({ DSH_HOME: missing }), path.join(missing, 'storages', 'dsh-board', 'board.sqlite'));
  assert.equal(existsSync(missing), false);
  await inHome(missing, async () => { const f = context(); await apply(f.ctx); await dispose(f); });
  const boardDir = path.join(missing, 'storages', 'dsh-board'); chmodSync(boardDir, 0o755);
  await inHome(missing, async () => assert.rejects(apply(context().ctx), /0700/));
  assert.equal(lstatSync(boardDir).mode & 0o7777, 0o755);
  const badHome = path.join(dir, 'bad'); mkdirSync(badHome); symlinkSync(missing, path.join(badHome, 'storages'));
  await inHome(badHome, async () => assert.rejects(apply(context().ctx), /Unsafe/));
  const blankHome = path.join(dir, 'blank'); const blankDir = path.join(blankHome, 'storages', 'dsh-board'); mkdirSync(blankDir, { recursive: true, mode: 0o700 });
  const blank = path.join(blankDir, 'board.sqlite'); writeFileSync(blank, '', { mode: 0o600 });
  await inHome(blankHome, async () => assert.rejects(apply(context().ctx), error => error.code === 'schema'));
  assert.equal(lstatSync(blank).size, 0);
});

test('importing plugin does not initialize a profile', async t => {
  const { dir } = fixture(t), home = path.join(dir, 'not-created');
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import ${JSON.stringify(new URL('./index.js', import.meta.url).href)}`], { env: { ...process.env, DSH_HOME: home }, stdio: 'pipe' });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  assert.equal(code, 0); assert.equal(existsSync(home), false);
});
