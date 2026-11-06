import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { syncBuiltinESMExports } from 'node:module';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { apply, boardDatabasePath, inject, trackerPlugin } from './index.js';
import { openTrackerSettings } from './tracker-settings.mjs';
import { openAccountNamespace } from './tracker-account.mjs';
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
  const routes = [], tools = [], cleanup = [], children = []; let approvalRequest, approvalOutcome = 'allowed-once';
  function own(dispose) {
    let active = true;
    const once = () => { if (!active) return; active = false; return dispose?.(); };
    cleanup.push(once); return once;
  }
  const ctx = { workspaceRegistry, effect(fn) { return own(fn()); },
    plugin(value) { children.push(value); },
    approval: { async request(req) { approvalRequest = req; return approvalOutcome; } },
    tools: { register(value) {
      tools.push(value);
      return own(() => { const index = tools.indexOf(value); if (index >= 0) tools.splice(index, 1); });
    } },
    connection: { fetch: { register(value) { routes.push(value); return () => {}; } } } };
  return { ctx, routes, tools, cleanup, children, get tool() { return tools.find(tool => tool.name === 'board_link_session'); }, get approvalRequest() { return approvalRequest; }, reject() { approvalOutcome = 'rejected'; } };
}
function trackerContext(dir, options = {}) {
  const f = context(options.workspaceRegistry ?? registry());
  f.ctx.profileContext = { name: options.name ?? 'web', home: options.home ?? dir };
  f.ctx.credentials = options.credentials ?? { async resolve() { return undefined; } };
  trackerPlugin.apply(f.ctx);
  return f;
}
const trackerGet = f => f.routes[0].fetch(new Request('http://localhost/api/dsh-board.tracker'));
const trackerPost = (f, command) => f.routes[1].fetch(new Request('http://localhost/api/dsh-board.tracker.mutate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command),
}));
const trackerDirectory = dir => path.join(dir, 'storages', 'dsh-board');
async function inHome(dir, action) {
  const old = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  try { return await action(); } finally { if (old === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = old; }
}
async function dispose(f) { for (const fn of f.cleanup.reverse()) await fn(); }

test('assignee DTO and optional writes preserve legacy values and reject invalid input', async () => {
  const store = mockStore(), service = createBoardService(store, registry());
  const { b, c, t } = await setup(service);
  const task = (revision, fields = {}) => cmd(revision, 'task.save', {
    boardId: b, task: { id: t, title: 'Task', description: '', statusId: c, ...fields },
  });
  assert.deepEqual((await service.read()).boards[0].tasks[0], { id: t, title: 'Task', description: '', statusId: c, assignee: null });
  let result = await service.mutate(task(3, { assignee: 'synthetic-assignee-a' }));
  assert.equal(result.boards[0].tasks[0].assignee, 'synthetic-assignee-a');
  assert.equal(store.saved.state.boards[0].tasks[0].assignee, 'synthetic-assignee-a');
  result = await service.mutate(task(4));
  assert.equal(result.boards[0].tasks[0].assignee, 'synthetic-assignee-a');
  result = await service.mutate(task(5, { assignee: null }));
  assert.equal(result.boards[0].tasks[0].assignee, null);
  for (const invalid of ['', ' ', ' Anne', 'Anne ', 'x'.repeat(257), 0, {}, []]) {
    const response = await service.fetch(post(task(6, { assignee: invalid })));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid');
    assert.equal((await service.read()).revision, 6);
  }
  result = await service.mutate(task(6, { assignee: 'x'.repeat(256) }));
  assert.equal(result.boards[0].tasks[0].assignee.length, 256);
  result = await service.mutate(cmd(7, 'task.save', { boardId: b, task: { title: 'Assigned', description: '', statusId: c, assignee: 'synthetic-assignee-b' } }));
  assert.equal(result.boards[0].tasks.find(item => item.title === 'Assigned').assignee, 'synthetic-assignee-b');
  await service.close();

  const legacy = store.saved;
  legacy.state.boards[0].tasks[0].assignee = '  legacy  ';
  const reopened = createBoardService(mockStore(legacy), registry());
  assert.equal((await reopened.read()).boards[0].tasks[0].assignee, '  legacy  ');
  result = await reopened.mutate(task(8));
  assert.equal(result.boards[0].tasks[0].assignee, '  legacy  ');
  await reopened.close();
});

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

test('owner board.delete is atomic, exact and preserves unrelated boards and links', async t => {
  const { db } = fixture(t), store = openBoardStore({ path: db }), s = createBoardService(store, registry());
  const { b, c, t: taskId } = await setup(s);
  let snap = await s.mutate(cmd(3, 'link.set', { boardId: b, taskId, sessionId: 's', linked: true }));
  snap = await s.mutate(cmd(4, 'board.create', { name: 'Keep' }));
  const keep = snap.boards.find(board => board.id !== b).id;
  snap = await s.mutate(cmd(5, 'status.save', { boardId: keep, status: { name: 'Keep status' } }));
  const keepStatus = snap.boards.find(board => board.id === keep).statuses[0].id;
  snap = await s.mutate(cmd(6, 'task.save', { boardId: keep, task: { title: 'Keep task', description: '', statusId: keepStatus } }));
  const keepTask = snap.boards.find(board => board.id === keep).tasks[0].id;
  snap = await s.mutate(cmd(7, 'link.set', { boardId: keep, taskId: keepTask, sessionId: 's', linked: true }));
  // Set the target as default and add hidden data to prove the identity covers
  // more than the visible projection; this is a synthetic fixture, not a live DB.
  store.transaction(8, current => {
    current.state = core.setDefaultBoard(current.state, 'w', b);
    current.state = core.createIteration(current.state, b, { id: 'iteration', name: 'Hidden iteration' });
    current.state = core.createComment(current.state, b, taskId, { id: 'comment', body: 'Hidden comment' });
    current.revision++;
    return current;
  });
  snap = await s.read();
  const target = snap.boards.find(board => board.id === b), identity = target.deletionIdentity;
  assert.deepEqual({ ...identity, digest: '<digest>' }, { digest: '<digest>', taskCount: 1, linkCount: 1, statusCount: 1 });
  assert.match(identity.digest, /^[0-9a-f]{64}$/);
  const command = cmd(9, 'board.delete', { boardId: b, expectedIdentity: identity });
  const before = store.read(), oldKeep = structuredClone(before.state.boards.find(board => board.id === keep));
  const response = await s.fetch(post(command));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.revision, 10); assert.deepEqual(result.boards.map(board => board.id), [keep]);
  const after = store.read();
  assert.deepEqual(after.state.boards, [oldKeep]);
  assert.deepEqual(after.state.workspaces, [{ id: 'w', boardIds: [keep], defaultBoardId: null }]);
  assert.deepEqual(after.links, [{ boardId: keep, taskId: keepTask, sessionId: 's' }]);
  assert.equal((await s.fetch(post(command))).status, 409);
  await s.close();
  const reopened = openBoardStore({ path: db }); assert.deepEqual(reopened.read(), after); reopened.close();
});

test('board.delete rejects malformed, stale, changed, unauthorized and shared targets', async () => {
  const store = mockStore(), s = createBoardService(store, registry()), { b } = await setup(s);
  const snap = await s.read(), identity = snap.boards[0].deletionIdentity;
  const command = cmd(3, 'board.delete', { boardId: b, expectedIdentity: identity });
  const invalids = [
    { ...command, expectedIdentity: undefined }, { ...command, expectedIdentity: {} },
    { ...command, expectedIdentity: { ...identity, extra: 1 } },
    { ...command, expectedIdentity: { ...identity, digest: 'A'.repeat(64) } },
    { ...command, expectedIdentity: { ...identity, taskCount: -1 } },
    { ...command, expectedIdentity: { ...identity, linkCount: 0.5 } },
    { ...command, extra: true }, { ...command, expectedRevision: null },
    { ...command, boardId: ' b' },
  ];
  for (const bad of invalids) assert.equal((await s.fetch(post(bad))).status, 400);
  for (const [bad, status, code] of [
    [{ ...command, expectedRevision: 2 }, 409, 'conflict'],
    [{ ...command, workspaceId: 'missing' }, 404, 'workspace_not_found'],
    [{ ...command, workspaceId: 'w2' }, 404, 'not_found'],
    [{ ...command, boardId: 'missing' }, 404, 'not_found'],
    [{ ...command, expectedIdentity: { ...identity, taskCount: 0 } }, 409, 'board_changed'],
    [{ ...command, expectedIdentity: { ...identity, digest: '0'.repeat(64) } }, 409, 'board_changed'],
  ]) {
    const response = await s.fetch(post(bad)); assert.equal(response.status, status); assert.equal((await response.json()).error.code, code);
  }
  assert.equal(store.saved.revision, 3);
  store.fail(true); assert.equal((await s.fetch(post(command))).status, 500); store.fail(false);
  assert.equal(store.saved.revision, 3);
  // Shared board assignment is not authorization to destroy another workspace's view.
  const shared = store.saved; shared.state = core.assignBoard(core.ensureWorkspace(shared.state, 'w2'), 'w2', b);
  const sharedStore = mockStore(shared), sharedService = createBoardService(sharedStore, registry());
  const sharedIdentity = (await sharedService.read()).boards[0].deletionIdentity;
  const result = await sharedService.fetch(post({ ...command, expectedIdentity: sharedIdentity }));
  assert.equal(result.status, 409); assert.equal((await result.json()).error.code, 'board_shared');
  assert.deepEqual(sharedStore.saved, shared);
  await s.close(); await sharedService.close();
});

test('board.delete identity detects hidden data and membership drift even at the same revision', async () => {
  const baseStore = mockStore(), base = createBoardService(baseStore, registry()), { b, t: taskId } = await setup(base);
  const identity = (await base.read()).boards[0].deletionIdentity, original = baseStore.saved;
  const changes = [
    state => core.createComment(state, b, taskId, { id: 'comment', body: 'new' }),
    state => core.createIteration(state, b, { id: 'iteration', name: 'new' }),
    state => core.setDefaultBoard(state, 'w', b),
    state => core.assignBoard(core.ensureWorkspace(state, 'w2'), 'w2', b),
  ];
  for (const change of changes) {
    const changed = structuredClone(original); changed.state = change(changed.state);
    const store = mockStore(changed), s = createBoardService(store, registry());
    const result = await s.fetch(post(cmd(3, 'board.delete', { boardId: b, expectedIdentity: identity })));
    assert.equal(result.status, 409); assert.equal((await result.json()).error.code, 'board_changed');
    assert.deepEqual(store.saved, changed); await s.close();
  }
  // Membership is rechecked after the store transaction begins.
  const mutable = { allowed: true }, store = mockStore(original);
  const s = createBoardService(store, { get: id => mutable.allowed ? registry().get(id) : undefined });
  store.before(() => { mutable.allowed = false; });
  const response = await s.fetch(post(cmd(3, 'board.delete', { boardId: b, expectedIdentity: identity })));
  assert.equal(response.status, 404); assert.deepEqual(store.saved, original);
  await base.close(); await s.close();
});

test('board.delete handles empty and large boards and snapshots queued command input', async () => {
  const emptyStore = mockStore(), empty = createBoardService(emptyStore, registry());
  let snap = await empty.mutate(cmd(0, 'board.create', { name: 'Empty' }));
  const command = cmd(1, 'board.delete', { boardId: snap.boards[0].id, expectedIdentity: snap.boards[0].deletionIdentity });
  assert.deepEqual({ ...command.expectedIdentity, digest: '<digest>' }, { digest: '<digest>', taskCount: 0, linkCount: 0, statusCount: 0 });
  const blocker = empty.read(), pending = empty.mutate(command); command.boardId = 'changed'; command.expectedIdentity.taskCount = 100;
  await blocker; snap = await pending; assert.equal(snap.revision, 2); assert.deepEqual(snap.boards, []); await empty.close();
  const state = core.createState();
  state.boards.push({ id: 'large', name: 'Large', archived: false, columns: [{ id: 'c', name: 'Status', archived: false }], iterations: [], tasks: Array.from({ length: 1000 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, description: '', columnId: 'c', iterationId: null, assignee: null, labels: [], priority: null, comments: [] })) });
  state.workspaces.push({ id: 'w', boardIds: ['large'], defaultBoardId: null });
  const large = createBoardService(mockStore({ revision: 0, state, links: [] }), registry());
  const largeSnap = await large.read(), largeIdentity = largeSnap.boards[0].deletionIdentity;
  assert.equal(largeIdentity.taskCount, 1000);
  assert.deepEqual((await large.mutate(cmd(0, 'board.delete', { boardId: 'large', expectedIdentity: largeIdentity }))).boards, []);
  await large.close();
});

test('real SQLite: exact routes, direct approval and tool/API race across instances', async t => {
  const { dir } = fixture(t);
  await inHome(dir, async () => {
    const a = context(), b = context(); await apply(a.ctx); await apply(b.ctx);
    assert.deepEqual(inject, ['connection', 'workspaceRegistry', 'tools', 'approval']);
    assert.deepEqual(a.children, [trackerPlugin]);
    assert.deepEqual(trackerPlugin.inject, ['connection', 'workspaceRegistry', 'profileContext', 'credentials', 'tools', 'approval', 'agents']);
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

test('Tracker routes bootstrap lazily per launcher profile and fail soft', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir);
  mkdirSync(storage, { recursive: true, mode: 0o700 });
  let calls = 0;
  const web = trackerContext(dir, { credentials: { resolve() { calls++; throw Error('must not resolve yet'); } } });
  assert.deepEqual(web.routes.map(r => [r.path, r.methods, r.requestBody]), [
    ['/api/dsh-board.tracker', ['GET'], 'buffered'], ['/api/dsh-board.tracker.mutate', ['POST'], 'streaming'],
  ]);
  assert.deepEqual(web.tools.map(tool => tool.name), [
    'tracker_current_workspace', 'tracker_list_boards', 'tracker_list_issues', 'tracker_get_issue', 'tracker_list_transitions', 'tracker_add_comment', 'tracker_transition_issue',
    'tracker_update_issue', 'tracker_create_issue', 'tracker_link_own_session', 'tracker_unlink_own_session',
  ]);
  const db = path.join(storage, 'tracker-web.sqlite');
  const key = path.join(storage, 'tracker-account-web.key'), links = path.join(storage, 'tracker-links-web.sqlite');
  assert.equal(existsSync(db), false); assert.equal(existsSync(key), false); assert.equal(existsSync(links), false);
  const [one, two] = await Promise.all([trackerGet(web), trackerGet(web)]);
  assert.deepEqual(await one.json(), { revision: 0, configured: false, orgType: null, workspaces: {}, needsReselect: [], unattendedIssueCreation: {}, unattendedIssueCreationStored: {} });
  assert.equal(two.status, 200); assert.equal(calls, 0); assert.equal(existsSync(db), true);
  for (const file of [db, key, links]) assert.equal(lstatSync(file).mode & 0o7777, 0o600);
  assert.equal(lstatSync(key).size, 64);
  const configured = await trackerPost(web, { op: 'configuration.configure', expectedRevision: 0, orgType: 'cloud' });
  assert.equal(configured.status, 200); assert.equal(calls, 0);
  const other = trackerContext(dir, { name: 'other' });
  assert.equal((await (await trackerGet(other)).json()).configured, false);
  assert.equal(existsSync(path.join(storage, 'tracker-other.sqlite')), true);
  assert.equal(existsSync(path.join(storage, 'tracker-account-other.key')), true);
  assert.equal(existsSync(path.join(storage, 'tracker-links-other.sqlite')), true);
  await dispose(web); await dispose(other);
  assert.equal(web.tools.length, 0);
  assert.equal((await trackerGet(web)).status, 503);
  const reopened = trackerContext(dir);
  assert.equal((await (await trackerGet(reopened)).json()).orgType, 'cloud'); await dispose(reopened);

  const invalid = trackerContext(dir, { name: '../outside' });
  assert.equal((await trackerGet(invalid)).status, 503); await dispose(invalid);
  const missing = trackerContext(dir, { home: path.join(dir, 'missing') });
  assert.equal((await trackerGet(missing)).status, 503);
  assert.equal(existsSync(path.join(dir, 'missing')), false); await dispose(missing);
});

test('Tracker bootstrap fails closed for missing key or invalid links database and closes partial resources', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir);
  mkdirSync(storage, { recursive: true, mode: 0o700 });
  const links = path.join(storage, 'tracker-links-web.sqlite'), key = path.join(storage, 'tracker-account-web.key');
  // A pre-existing dependent database must never cause creation of a replacement key.
  writeFileSync(links, '', { mode: 0o600 });
  const f = trackerContext(dir);
  let response = await trackerGet(f);
  assert.equal(response.status, 503); assert.equal(existsSync(key), false);
  const db = path.join(storage, 'tracker-web.sqlite');
  // A closed settings handle must not leave SQLite locks after failed bootstrap.
  let probe = new DatabaseSync(db, { timeout: 0 });
  probe.exec('BEGIN EXCLUSIVE; ROLLBACK'); probe.close();
  rmSync(links);
  // Provision a valid namespace before introducing an invalid dependent DB.
  openAccountNamespace({ directory: storage, profileId: 'web' }).close();
  // Now namespace opens, but a malformed existing links DB still fails closed.
  mkdirSync(links, { mode: 0o700 });
  response = await trackerGet(f);
  assert.equal(response.status, 503); assert.equal(lstatSync(key).size, 64);
  probe = new DatabaseSync(db, { timeout: 0 });
  probe.exec('BEGIN EXCLUSIVE; ROLLBACK'); probe.close();
  rmSync(links, { recursive: true });
  response = await trackerGet(f);
  assert.equal(response.status, 200); assert.equal(existsSync(links), true);
  await dispose(f);
  for (const file of [db, links]) {
    probe = new DatabaseSync(file, { timeout: 0 });
    probe.exec('BEGIN EXCLUSIVE; ROLLBACK'); probe.close();
  }
});

test('Tracker links use the credential-bound principal and persist only opaque scope', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir);
  mkdirSync(storage, { recursive: true, mode: 0o700 });
  const token = 'synthetic-private-token', orgId = 'synthetic-tenant', principal = 87654321;
  const calls = [], oldRequest = https.request;
  https.request = (options, callback) => {
    calls.push(options);
    const req = new EventEmitter(); req.destroy = () => {}; req.end = () => {
      const url = options.path;
      let body;
      if (url.startsWith('/v3/boards/_paginate')) body = [{ id: 1, name: 'Board' }];
      else if (url === '/v3/myself') body = { uid: principal };
      else if (url.startsWith('/v3/issues/TEAM-1?')) body = {
        id: 'issue-123', key: 'TEAM-1', summary: 'Issue', description: '', version: 1,
        status: { id: '1', key: 'open', display: 'Open' }, assignee: null, boards: [{ id: 1 }],
      };
      else throw Error(`unexpected synthetic request ${url}`);
      queueMicrotask(() => {
        const res = new PassThrough(); res.statusCode = 200; res.headers = {}; res.complete = true;
        callback(res); res.end(JSON.stringify(body));
      });
    };
    return req;
  };
  syncBuiltinESMExports();
  t.after(() => { https.request = oldRequest; syncBuiltinESMExports(); });
  const f = trackerContext(dir, {
    workspaceRegistry: { get: id => id === 'w' ? { createdAt: 'synthetic-incarnation', sessionIds: ['s'] } : undefined, archivedSessionIds: [] },
    credentials: { async resolve(ref) { return { value: ref.endsWith('TOKEN') ? token : orgId }; } },
  });
  t.after(() => dispose(f));
  assert.equal((await trackerPost(f, { op: 'configuration.configure', expectedRevision: 0, orgType: 'org' })).status, 200);
  assert.equal((await trackerPost(f, { op: 'boards.list' })).status, 200);
  assert.equal((await trackerPost(f, { op: 'workspace.select', workspaceId: 'w', boardIds: ['1'], expectedRevision: 1 })).status, 200);
  const command = { op: 'links.set', workspaceId: 'w', boardId: '1', issueKey: 'TEAM-1', issueId: 'issue-123', sessionId: 's', linked: true, expectedRevision: 0 };
  const forged = await trackerPost(f, { ...command, accountScope: '0'.repeat(64) });
  assert.equal(forged.status, 400);
  const saved = await trackerPost(f, command); assert.equal(saved.status, 200); assert.deepEqual(await saved.json(), { revision: 1 });
  // Principal is re-resolved across listing, selection, and before the link commit.
  assert.equal(calls.filter(call => call.path === '/v3/myself').length, 7);
  assert.ok(calls.every(call => call.headers.authorization === `OAuth ${token}` && call.headers['x-org-id'] === orgId));
  await dispose(f);
  const db = new DatabaseSync(path.join(storage, 'tracker-links-web.sqlite'), { readOnly: true });
  const rows = db.prepare('SELECT account_scope, issue_id, session_id FROM links').all(); db.close();
  assert.equal(rows.length, 1); assert.match(rows[0].account_scope, /^[0-9a-f]{64}$/);
  assert.equal(rows[0].issue_id, 'issue-123'); assert.equal(rows[0].session_id, 's');
  for (const file of readdirSync(storage)) {
    const bytes = readFileSync(path.join(storage, file));
    for (const secret of [token, orgId, String(principal)]) assert.equal(bytes.includes(Buffer.from(secret)), false);
  }
});

test('Tracker tools share lazy startup, reject unauthorized callers and stay closed after unload', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir), db = path.join(storage, 'tracker-web.sqlite');
  mkdirSync(storage, { recursive: true, mode: 0o700 });
  let calls = 0;
  const f = trackerContext(dir, { credentials: { resolve() { calls++; throw Error('unexpected secret resolution'); } } });
  const list = f.tools.find(tool => tool.name === 'tracker_list_boards');
  const signal = new AbortController().signal;
  const caller = { agent: { id: 's', session: { id: 's' } }, signal };
  assert.equal(existsSync(db), false);
  await assert.rejects(list.execute({ workspaceId: 'w' }, { signal }), /invalid_caller/);
  assert.equal(existsSync(db), false); assert.equal(calls, 0);
  const [unauthorized, response] = await Promise.allSettled([
    list.execute({ workspaceId: 'w' }, caller), trackerGet(f),
  ]);
  assert.equal(unauthorized.status, 'rejected');
  assert.doesNotMatch(String(unauthorized.reason), /secret|YANDEX_TRACKER/);
  assert.equal(response.status, 'fulfilled'); assert.equal(response.value.status, 200);
  assert.equal(existsSync(db), true); assert.equal(calls, 0);
  await dispose(f);
  await assert.rejects(list.execute({ workspaceId: 'w' }, caller), /unavailable/);
  assert.equal(calls, 0);
});

test('Tracker shutdown aborts a pending read while an unregister remains stuck', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir); mkdirSync(storage, { recursive: true, mode: 0o700 });
  const f = context(); let release, entered, released = false, started, releaseCredentials;
  const waiting = new Promise(resolve => { release = () => { released = true; resolve(); }; });
  const unregistered = new Promise(resolve => { entered = resolve; });
  const credentialStarted = new Promise(resolve => { started = resolve; });
  const stalledCredentials = new Promise(resolve => { releaseCredentials = resolve; });
  let stall = false, calls = 0;
  f.ctx.profileContext = { name: 'web', home: dir };
  f.ctx.credentials = { resolve(ref) {
    calls++;
    if (stall) { started(); return stalledCredentials; }
    return { value: ref.endsWith('TOKEN') ? 'synthetic-token' : 'synthetic-org' };
  } };
  const oldRequest = https.request;
  https.request = (options, callback) => {
    const req = new EventEmitter(); req.destroy = () => {}; req.end = () => {
      const body = options.path === '/v3/myself' ? { uid: 12345 } : [{ id: 1, name: 'Board' }];
      queueMicrotask(() => { const res = new PassThrough(); res.statusCode = 200; res.headers = {}; res.complete = true; callback(res); res.end(JSON.stringify(body)); });
    };
    return req;
  };
  syncBuiltinESMExports();
  t.after(() => { https.request = oldRequest; syncBuiltinESMExports(); release(); releaseCredentials({ value: 'synthetic', source: 'fake' }); });
  f.ctx.workspaceRegistry = { get: id => id === 'w' ? { createdAt: 'test-workspace', sessionIds: ['s'] } : undefined, archivedSessionIds: [] };
  f.ctx.connection.fetch.register = route => {
    f.routes.push(route);
    return () => { if (route.methods[0] === 'POST') { entered(); return waiting; } };
  };
  trackerPlugin.apply(f.ctx);
  const list = f.tools.find(tool => tool.name === 'tracker_list_boards');
  const caller = { agent: { id: 's', session: { id: 's' } }, signal: new AbortController().signal };
  assert.equal((await trackerPost(f, { op: 'configuration.configure', expectedRevision: 0, orgType: 'org' })).status, 200);
  assert.equal((await trackerPost(f, { op: 'boards.list' })).status, 200);
  assert.equal((await trackerPost(f, { op: 'workspace.select', workspaceId: 'w', boardIds: ['1'], expectedRevision: 1 })).status, 200);
  stall = true;
  const pending = trackerGet(f); await credentialStarted;
  let finished = false;
  const closing = dispose(f).then(() => { finished = true; });
  await unregistered;
  assert.equal(f.tools.length, 0);
  await assert.rejects(list.execute({ workspaceId: 'w' }, caller), /unavailable/);
  assert.equal((await trackerGet(f)).status, 503);
  assert.equal((await pending).status, 503);
  const callsAtShutdown = calls;
  assert.equal((await trackerPost(f, { op: 'boards.list' })).status, 503);
  assert.equal(calls, callsAtShutdown);
  assert.equal(finished, false); assert.equal(released, false);
  release(); await closing; assert.equal(finished, true);
  releaseCredentials({ value: 'synthetic', source: 'fake' });
  await dispose(f);
});

test('Tracker bootstrap failures can be retried by tools and routes', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir), db = path.join(storage, 'tracker-web.sqlite');
  const f = trackerContext(dir);
  const list = f.tools.find(tool => tool.name === 'tracker_list_boards');
  const caller = { agent: { id: 's', session: { id: 's' } }, signal: new AbortController().signal };
  await assert.rejects(list.execute({ workspaceId: 'w' }, caller), /unavailable/);
  assert.equal(existsSync(db), false);
  mkdirSync(storage, { recursive: true, mode: 0o700 });
  const response = await trackerGet(f);
  assert.equal(response.status, 200); assert.equal(existsSync(db), true);
  await dispose(f);
});

test('Tracker resolves only fixed refs, fails closed on revision change and sanitizes errors', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir); mkdirSync(storage, { recursive: true, mode: 0o700 });
  const refs = []; let release; let started;
  const called = new Promise(resolve => { started = resolve; });
  const credentials = { resolve(ref) {
    refs.push(ref); if (refs.length === 2) started();
    return new Promise(resolve => { release ??= []; release.push(() => resolve({ value: ref.endsWith('TOKEN') ? 'synthetic-secret' : 'synthetic-org', source: 'fake' })); });
  } };
  const f = trackerContext(dir, { credentials });
  assert.equal((await trackerPost(f, { op: 'configuration.configure', expectedRevision: 0, orgType: 'org' })).status, 200);
  const pending = trackerPost(f, { op: 'boards.list' }); await called;
  assert.deepEqual(refs, ['YANDEX_TRACKER_TOKEN', 'YANDEX_TRACKER_ORG_ID']);
  assert.equal((await trackerPost(f, { op: 'configuration.configure', expectedRevision: 1, orgType: 'cloud' })).status, 200);
  for (const done of release) done();
  const result = await pending, text = await result.text();
  assert.equal(result.status, 503); assert.match(text, /credentials_unavailable/);
  assert.doesNotMatch(text, /synthetic|OAuth|YANDEX_TRACKER/);
  await dispose(f);
});

test('Tracker coalesces stalled credential resolutions across aborts and rejects stale revisions', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir); mkdirSync(storage, { recursive: true, mode: 0o700 });
  const calls = [], finish = []; let started;
  const called = new Promise(resolve => { started = resolve; });
  const credentials = { resolve(ref) {
    calls.push(ref);
    if (calls.length === 2) started();
    return new Promise((resolve, reject) => finish.push({ resolve, reject }));
  } };
  const f = trackerContext(dir, { credentials });
  const send = signal => f.routes[1].fetch(new Request('http://localhost/api/dsh-board.tracker.mutate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'boards.list' }), signal,
  }));
  await trackerPost(f, { op: 'configuration.configure', expectedRevision: 0, orgType: 'org' });
  const firstController = new AbortController(), first = send(firstController.signal); await called;
  firstController.abort(); assert.equal((await first).status, 499);
  for (let i = 0; i < 5; i++) {
    const controller = new AbortController(), next = send(controller.signal);
    await new Promise(resolve => setImmediate(resolve)); controller.abort();
    assert.equal((await next).status, 499);
  }
  assert.deepEqual(calls, ['YANDEX_TRACKER_TOKEN', 'YANDEX_TRACKER_ORG_ID']);
  // One failing provider does not free the slot while the other remains pending.
  finish[0].reject(Error('synthetic secret')); await new Promise(resolve => setImmediate(resolve));
  const controller = new AbortController(), waiting = send(controller.signal);
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  assert.equal((await waiting).status, 499); assert.equal(calls.length, 2);
  assert.equal((await trackerPost(f, { op: 'configuration.configure', expectedRevision: 1, orgType: 'cloud' })).status, 200);
  const stale = await send(); assert.equal(stale.status, 503);
  assert.doesNotMatch(await stale.text(), /synthetic secret/); assert.equal(calls.length, 2);
  finish[1].resolve({ value: 'synthetic', source: 'fake' });
  await new Promise(resolve => setImmediate(resolve));
  const retryController = new AbortController(), retry = send(retryController.signal);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 4); retryController.abort(); assert.equal((await retry).status, 499);
  await dispose(f);
  finish[2].resolve({ value: 'synthetic', source: 'fake' });
  finish[3].resolve({ value: 'synthetic', source: 'fake' });
  await new Promise(resolve => setImmediate(resolve));
});

test('Tracker unload aborts stalled credentials and streams before closing settings', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir); mkdirSync(storage, { recursive: true, mode: 0o700 });
  let started, release; const called = new Promise(resolve => { started = resolve; });
  const credentials = { resolve() { started(); return new Promise(resolve => { release ??= []; release.push(resolve); }); } };
  const f = trackerContext(dir, { credentials });
  await trackerPost(f, { op: 'configuration.configure', expectedRevision: 0, orgType: 'org' });
  const pending = trackerPost(f, { op: 'boards.list' }); await called;
  let canceled = false;
  const stream = new ReadableStream({ pull() {}, cancel() { canceled = true; } });
  const streaming = f.routes[1].fetch(new Request('http://localhost/api/dsh-board.tracker.mutate', {
    method: 'POST', duplex: 'half', headers: { 'content-type': 'application/json' }, body: stream,
  }));
  await new Promise(resolve => setImmediate(resolve));
  await dispose(f);
  assert.equal((await pending).status, 503); assert.equal((await streaming).status, 503); assert.equal(canceled, true);
  for (const done of release) done({ value: 'synthetic', source: 'fake' });
  await new Promise(resolve => setImmediate(resolve));
  const store = openTrackerSettings({ directory: storage, profileId: 'web' });
  assert.equal(store.read().revision, 1); store.close();
});

test('Tracker unload during lazy initialization rejects work without opening resources', async t => {
  const { dir } = fixture(t), storage = trackerDirectory(dir);
  mkdirSync(storage, { recursive: true, mode: 0o700 });
  const f = trackerContext(dir);
  const pending = trackerGet(f);
  await dispose(f);
  assert.equal((await pending).status, 503);
  assert.equal((await trackerGet(f)).status, 503);
  assert.deepEqual(readdirSync(storage), []);
});

test('Tracker startup failures do not break local board or leak registered routes', async t => {
  const { dir } = fixture(t);
  await inHome(dir, async () => {
    const f = context(); f.ctx.plugin = () => { throw Error('tracker incompatible'); };
    await apply(f.ctx);
    assert.equal((await f.routes[0].fetch(new Request('http://localhost/api/dsh-board'))).status, 200);
    await dispose(f);
  });
  const f = context(); let unregisters = 0;
  f.ctx.profileContext = { name: 'web', home: dir }; f.ctx.credentials = { resolve() {} };
  f.ctx.connection.fetch.register = route => {
    if (route.methods[0] === 'POST') throw Error('route conflict');
    return () => { unregisters++; };
  };
  assert.throws(() => trackerPlugin.apply(f.ctx), /route conflict/);
  assert.equal(unregisters, 1);
  await dispose(f);

  const partial = context(), activeRoutes = new Set(); let registrations = 0;
  partial.ctx.profileContext = { name: 'web', home: dir }; partial.ctx.credentials = { resolve() {} };
  partial.ctx.connection.fetch.register = route => { activeRoutes.add(route.path); return () => activeRoutes.delete(route.path); };
  const register = partial.ctx.tools.register;
  partial.ctx.tools.register = definition => {
    if (++registrations === 3) throw Error('tool conflict');
    return register(definition);
  };
  assert.throws(() => trackerPlugin.apply(partial.ctx), /tool conflict/);
  assert.equal(activeRoutes.size, 0); assert.equal(partial.tools.length, 0);
  await dispose(partial); await dispose(partial);
  assert.equal(activeRoutes.size, 0); assert.equal(partial.tools.length, 0);
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
