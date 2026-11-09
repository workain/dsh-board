import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openWorkspaceDefaultStore } from './workspace-default-store.mjs';
import { createWorkspaceContext } from './workspace-context.mjs';
import { createWorkspaceBoardSource } from './workspace-client.mjs';
const dir = t => { const d = mkdtempSync(path.join(tmpdir(), 'board-context-')); chmodSync(d, 0o700); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const pointer = (incarnation, boardId = 'b', provider = 'local') => ({ incarnation, boardId, provider, accountScope: provider === 'local' ? null : 'a'.repeat(64) });
function fixture(t) {
  const d = dir(t), defaults = openWorkspaceDefaultStore(path.join(d, 'defaults.sqlite')); t.after(() => defaults.close());
  const workspaces = new Map([['a', { createdAt: 'first', sessionIds: ['s1', 's2', 'archived'] }], ['b', { createdAt: 'second', sessionIds: ['other'] }], ['c', { createdAt: 'third', sessionIds: [] }]]);
  const aggregate = { revision: 0, state: { workspaces: [{ id: 'a', boardIds: ['b'] }, { id: 'b', boardIds: ['b2'] }], boards: [{ id: 'b', tasks: [{ id: 't' }] }, { id: 'b2', tasks: [{ id: 't2' }] }] }, links: ['s1', 's2', 'archived'].map(sessionId => ({ boardId: 'b', taskId: 't', sessionId })) };
  let disposed = 0, observed = [], hook = null, values = { goal: null, todos: [] };
  let scope = 'a'.repeat(64), trackerRevision = 0, scopeHook = null;
  const tracker = { async workspaceBoardScope() { if (scopeHook) await scopeHook(); return { accountScope: scope, incarnation: 'first', revision: trackerRevision }; }, async workspaceTaskLinks() { return { revision: 0, accountScope: scope, settingsRevision: trackerRevision, incarnation: 'first', incomplete: false, links: [{ sessionId: 's1' }] }; } };
  const service = createWorkspaceContext({ store: { read: () => structuredClone(aggregate) }, defaults, registry: { get: id => workspaces.get(id), archivedSessionIds: ['archived'] },
    getTracker: async () => tracker,
    getQuery: () => ({ async observeSession(id, options) { observed.push(id); assert.equal(options.projectionMode, 'all'); if (hook) await hook(id, options.signal); return { cursor: 7, projections: { values }, [Symbol.dispose]() { disposed++; } }; } }) });
  t.after(() => service.close());
  return { service, defaults, workspaces, aggregate, get disposed() { return disposed; }, observed, setHook: x => hook = x, setValues: x => values = x, setAccount: x => scope = x, setScopeHook: x => scopeHook = x };
}
const context = (fields = {}) => ({ op: 'task.context', workspaceId: 'a', incarnation: 'first', provider: 'local', boardId: 'b', taskId: 't', issueId: null, ...fields });
const set = (workspaceId, incarnation, expectedRevision, p) => ({ op: 'default.set', workspaceId, incarnation, expectedRevision, pointer: p });
test('private additive store persists per-workspace pointers, CAS and independent owners', t => {
  const d = dir(t), file = path.join(d, 'defaults.sqlite'), a = openWorkspaceDefaultStore(file), b = openWorkspaceDefaultStore(file);
  t.after(() => { a.close(); b.close(); });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(a.read('c'), { revision: 0, pointer: null });
  a.set('a', 0, pointer('first')); b.set('b', 0, pointer('second', 'b2'));
  assert.equal(a.read('a').pointer.boardId, 'b'); assert.equal(b.read('b').pointer.boardId, 'b2');
  assert.throws(() => b.set('a', 0, null), /conflict/); assert.equal(b.read('a').pointer.boardId, 'b');
  assert.equal(a.set('a', 1, null).revision, 2); assert.equal(b.read('b').revision, 1); assert.equal(b.read('c').pointer, null);
});
test('unsupported/empty store is never repaired', t => {
  const d = dir(t), p = path.join(d, 'blank.sqlite'); writeFileSync(p, '', { mode: 0o600 });
  assert.throws(() => openWorkspaceDefaultStore(p), /schema/); assert.equal(statSync(p).size, 0);
});
test('default selection explicit and scoped A/B/C, conflicts/incarnation fail closed', async t => {
  const f = fixture(t); assert.equal((await f.service.command({ op: 'default.read', workspaceId: 'a' })).pointer, null);
  await f.service.command(set('a', 'first', 0, { provider: 'local', boardId: 'b' }));
  await f.service.command(set('b', 'second', 0, { provider: 'local', boardId: 'b2' }));
  await assert.rejects(f.service.command(set('a', 'first', 0, null)), /conflict/);
  await assert.rejects(f.service.command(set('a', 'wrong', 1, null)), /workspace_changed/);
  await assert.rejects(f.service.command(set('a', 'first', 1, { provider: 'local', boardId: 'b2' })), /unavailable/);
  assert.equal((await f.service.command({ op: 'default.read', workspaceId: 'b' })).pointer.boardId, 'b2');
  assert.equal((await f.service.command({ op: 'default.read', workspaceId: 'c' })).pointer, null);
  f.workspaces.get('a').createdAt = 'replacement';
  const stale = await f.service.command({ op: 'default.read', workspaceId: 'a' }); assert.equal(stale.available, false); assert.equal(stale.pointer, null);
});
test('Tracker pointer binds verified account, not only board id', async t => {
  const f = fixture(t);
  await f.service.command(set('a', 'first', 0, { provider: 'tracker', boardId: '1' }));
  assert.equal((await f.service.command({ op: 'default.read', workspaceId: 'a' })).available, true);
  f.setAccount('b'.repeat(64)); assert.equal((await f.service.command({ op: 'default.read', workspaceId: 'a' })).available, false);
  assert.equal(f.defaults.read('a').pointer.accountScope, 'a'.repeat(64));
});
test('task derives exact links, includes archived members, no arbitrary ids, disposes every lease', async t => {
  const f = fixture(t); f.setValues({ goal: { goal: { id: 'g', revision: 1, objective: 'Inspect', phase: 'active', maxGoalRounds: 5 }, roundsStarted: 2 }, todos: [{ content: 'Check', status: 'in_progress' }] });
  const r = await f.service.command(context()); assert.deepEqual(f.observed.sort(), ['archived', 's1', 's2']); assert.equal(f.disposed, 3);
  assert.equal(r.rows[0].goal.value.objective, 'Inspect'); assert.equal(r.rows[0].todos.value[0].content, 'Check');
  assert.equal(JSON.stringify(r).includes('events'), false);
  await assert.rejects(f.service.command({ ...context(), sessionIds: ['other'] }), /invalid/);
  await assert.rejects(f.service.command(context({ taskId: 'no-task' })), /unavailable/);
});
test('missing registry key vs null vs explicit empty todo stay distinct', async t => {
  const f = fixture(t); f.setValues({}); let row = (await f.service.command(context())).rows[0]; assert.equal(row.goal.state, 'unavailable'); assert.equal(row.todos.state, 'unavailable');
  f.setValues({ goal: null, todos: null }); row = (await f.service.command(context())).rows[0]; assert.equal(row.goal.state, 'empty'); assert.equal(row.todos.value, null);
  f.setValues({ goal: null, todos: [] }); row = (await f.service.command(context())).rows[0]; assert.equal(row.todos.state, 'ready'); assert.deepEqual(row.todos.value, []);
});
test('per-row malformed projection is error not absence, lease released', async t => {
  const f = fixture(t); f.setValues({ goal: 'bad', todos: [{ content: 'x', status: 'invented' }] });
  assert.ok((await f.service.command(context())).rows.every(r => r.state === 'error')); assert.equal(f.disposed, 3);
});
test('membership/link changes during passive read hide all old results', async t => {
  const f = fixture(t); f.setHook(() => { f.aggregate.links = []; });
  await assert.rejects(f.service.command(context()), /scope_changed/); assert.equal(f.disposed, 3);
});
test('Tracker account changes after observation cannot expose old projections', async t => {
  const f = fixture(t); f.setHook(() => f.setAccount('b'.repeat(64)));
  await assert.rejects(f.service.command(context({ provider: 'tracker', boardId: '1', taskId: 'Q-1', issueId: 'immutable' })), /scope_changed/);
});
test('abort releases acquired leases and never publishes rows', async t => {
  const f = fixture(t), stop = new AbortController(); f.setHook(() => stop.abort());
  await assert.rejects(f.service.command(context(), stop.signal)); assert.ok(f.observed.length > 0); assert.equal(f.disposed, f.observed.length);
});
test('workspaceBoard narrow service rejects unsafe navigation and never guesses target', () => {
  let blocked = false, selected = 0; const incarnations = { a: 'first', b: 'second' };
  const source = createWorkspaceBoardSource({ valid: id => incarnations[id], canNavigate: () => !blocked, selectPanel: () => selected++ });
  assert.equal(source.service.open('c'), false); assert.equal(source.getSnapshot(), null);
  assert.equal(source.service.open('a'), true); assert.equal(source.getSnapshot().workspaceId, 'a'); assert.equal(source.getSnapshot().configure, false);
  assert.equal(source.service.configure('b'), true); assert.equal(source.getSnapshot().workspaceId, 'b'); assert.equal(source.getSnapshot().configure, true);
  blocked = true; assert.equal(source.service.open('a'), false); assert.equal(selected, 2); source.close();
});

test('valid blocked goal retains code/message and no activation inference', async t => {
  const f = fixture(t); f.setValues({ goal: { goal: { id: 'g', revision: 2, objective: 'Inspect', phase: 'blocked', maxGoalRounds: 5, blockedReason: { code: 'external-condition', message: 'Needs input' } }, roundsStarted: 3 }, todos: [] });
  const row = (await f.service.command(context())).rows[0]; assert.equal(row.state, 'ready'); assert.deepEqual(row.goal.value.blockedReason, { code: 'external-condition', message: 'Needs input' }); assert.equal('activation' in row.goal.value, false);
});
test('streamed request bodies are bounded and abort promptly', async t => {
  const f = fixture(t), stops = [], requests = [];
  for (let i = 0; i < 16; i++) {
    const stop = new AbortController(); stops.push(stop);
    requests.push(f.service.fetch(new Request('http://fixture/api/dsh-board.context', { method: 'POST', body: new ReadableStream({}), duplex: 'half', signal: stop.signal })));
  }
  const busy = await f.service.fetch(new Request('http://fixture/api/dsh-board.context', { method: 'POST', body: '{}', duplex: 'half' })); assert.equal(busy.status, 503);
  stops.forEach(s => s.abort()); assert.ok((await Promise.all(requests)).every(r => r.status === 503));
  const valid = await f.service.fetch(new Request('http://fixture/api/dsh-board.context', { method: 'POST', body: JSON.stringify({ op: 'default.read', workspaceId: 'a' }), duplex: 'half' })); assert.equal(valid.status, 200);
});
