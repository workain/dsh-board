import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackerService, MAX_BODY_BYTES } from './tracker-service.mjs';
import { createTrackerClient } from './tracker-api.mjs';

function fixture() {
  let state = { revision: 0, settings: { connection: null, workspaces: {} } };
  const settings = {
    read: () => structuredClone(state),
    compareAndSet(revision, value) {
      if (revision !== state.revision) return { ok: false, revision: state.revision };
      state = { revision: revision + 1, settings: structuredClone(value) };
      return { ok: true, revision: state.revision };
    },
  };
  const registry = new Map([['ws', { id: 'ws', createdAt: 'one', sessionIds: ['session-1'] }], ['ws2', { id: 'ws2', createdAt: 'two', sessionIds: ['session-2'] }]]);
  registry.archivedSessionIds = [];
  const tracker = {
    identity: 'identity-A',
    async listBoards() { return { boards: [{ id: '1', name: 'First' }, { id: '2', name: 'Second' }], complete: true, reason: null }; },
    async getBoardOverview(id, options) { return { board: { id, name: 'First' }, columns: [], issues: [], issuesComplete: false, issuesReason: 'explicit_keys_only', keys: options.issueKeys, searchByBoard: options.searchByBoard }; },
    async getIssue(key) { return { key, summary: 'Example', description: 'Description', status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: true, assignee: null, boards: [{ id: '1' }, { id: '99' }], version: 1 }; },
    async listTransitions() { return [{ id: 'start', display: 'Start', to: { id: '2', key: 'progress', display: 'In progress' } }]; },
    async addComment() { return { id: '123' }; },
    async executeTransition() { return {}; },
    async openSession() { return { identity: this.identity, listBoards: (...args) => this.listBoards(...args), getBoardOverview: (...args) => this.getBoardOverview(...args), getIssue: (...args) => this.getIssue(...args), listTransitions: (...args) => this.listTransitions(...args), addComment: (...args) => this.addComment(...args), executeTransition: (...args) => this.executeTransition(...args) }; },
  };
  return { settings, registry, tracker, service: createTrackerService({ settings, tracker, workspaceRegistry: registry }) };
}
const post = (svc, body, extra = {}) => svc.fetch(new Request('http://local/api/tracker', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body), ...extra }));
const body = async r => ({ status: r.status, value: await r.json() });
const config = (svc, rev = 0) => svc.command({ op: 'configuration.configure', expectedRevision: rev, orgType: 'org' });
const select = (svc, rev = 1, boardIds = ['1'], workspaceId = 'ws') => svc.command({ op: 'workspace.select', expectedRevision: rev, workspaceId, boardIds });
const boardRead = (svc, workspaceId = 'ws', boardId = '1', issueKeys = []) => svc.command({ op: 'board.read', workspaceId, boardId, issueKeys });
const rejected = (promise, code) => assert.rejects(promise, e => e.code === code);

const scopeFor = (f, options = {}) => f.service.toolScope({ workspaceId: 'ws', sessionId: 'session-1', signal: undefined, ...options });
const prepareScope = async () => {
  const f = fixture(); await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
  return f;
};
const target = { id: '2', key: 'progress', display: 'In progress' };
const transitionInput = { issueKey: 'ABC-1', transitionId: 'start', expectedTo: target };

test('tool scope checks session, selected boards and in-memory activation', async () => {
  const f = await prepareScope();
  const scope = scopeFor(f);
  assert.equal(Object.isFrozen(scope), true);
  assert.deepEqual(await scope.selectedBoards(), ['1']);
  assert.deepEqual((await scope.boardRead({ boardId: '1', issueKeys: [] })).board, { id: '1', name: 'First' });
  await rejected(scope.boardRead({ boardId: '2', issueKeys: [] }), 'board_not_selected');
  assert.throws(() => scopeFor(f, { sessionId: 'session-2' }), e => e.code === 'session_not_in_workspace');
  assert.throws(() => scopeFor(f, { workspaceId: 'ws2' }), e => e.code === 'board_not_selected');
  f.registry.archivedSessionIds.push('session-1');
  await rejected(scope.selectedBoards(), 'session_not_in_workspace');
  assert.throws(() => scopeFor(f), e => e.code === 'session_not_in_workspace');
  f.registry.archivedSessionIds = [];
  const restarted = createTrackerService({ settings: f.settings, tracker: f.tracker, workspaceRegistry: f.registry });
  assert.throws(() => restarted.toolScope({ workspaceId: 'ws', sessionId: 'session-1', signal: undefined }), e => e.code === 'needs_reselect');
});

test('tool issue membership is positive and response is strictly projected', async () => {
  const f = await prepareScope(), scope = scopeFor(f);
  const value = await scope.getIssue({ issueKey: 'ABC-1' });
  assert.deepEqual(value, { key: 'ABC-1', summary: 'Example', description: 'Description', status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: true, assignee: null, version: 1 });
  assert.doesNotMatch(JSON.stringify(value), /99|identity|boards/);
  for (const boards of [undefined, [], [{ id: '99' }], [{ id: '1' }, {}]]) {
    f.tracker.getIssue = async key => ({ key, boards });
    await rejected(scope.getIssue({ issueKey: 'ABC-1' }), 'issue_not_in_selected_boards');
  }
  await rejected(scope.getIssue({ issueKey: 'ABC-1', url: 'http://evil' }), 'invalid');
  await rejected(scope.getIssue({ issueKey: 'abc-1' }), 'invalid');
});

test('tool scope revokes on revision, binding, identity and session changes', async () => {
  for (const change of ['revision', 'identity', 'archived', 'removed', 'incarnation', 'reselect']) {
    const f = await prepareScope(), scope = scopeFor(f);
    let release, started;
    const ready = new Promise(resolve => { started = resolve; });
    f.tracker.getIssue = key => new Promise(resolve => { release = () => resolve({ key, summary: 'private', description: null, status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: false, assignee: null, boards: [{ id: '1' }], version: 1 }); started(); });
    const pending = scope.getIssue({ issueKey: 'ABC-1' }); await ready;
    if (change === 'revision') { const s = f.settings.read(); f.settings.compareAndSet(s.revision, s.settings); }
    if (change === 'identity') f.tracker.identity = 'identity-B';
    if (change === 'archived') f.registry.archivedSessionIds.push('session-1');
    if (change === 'removed') f.registry.get('ws').sessionIds = [];
    if (change === 'incarnation') f.registry.get('ws').createdAt = 'new';
    if (change === 'reselect') { await f.service.command({ op: 'boards.list' }); await select(f.service, 2); }
    release(); await assert.rejects(pending, e => ['needs_reselect', 'session_not_in_workspace'].includes(e.code), change);
  }
});

test('writes revalidate membership and transition destination after approval', async () => {
  const f = await prepareScope(), scope = scopeFor(f); let writes = 0;
  f.tracker.addComment = async () => { writes++; return { id: '123' }; };
  f.tracker.executeTransition = async () => { writes++; return {}; };
  assert.deepEqual(await scope.listTransitions({ issueKey: 'ABC-1' }), [{ id: 'start', display: 'Start', to: target }]);
  f.tracker.getIssue = async key => ({ key, boards: [{ id: '99' }] });
  await rejected(scope.addComment({ issueKey: 'ABC-1', text: 'hello' }), 'issue_not_in_selected_boards');
  assert.equal(writes, 0);
  f.tracker.getIssue = async key => ({ key, summary: 'Example', description: null, status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: true, assignee: null, boards: [{ id: '1' }], version: 1 });
  f.tracker.listTransitions = async () => [{ id: 'start', display: 'Start', to: { ...target, display: 'Changed' } }];
  await rejected(scope.executeTransition(transitionInput), 'transition_not_available');
  assert.equal(writes, 0);
  f.tracker.listTransitions = async () => [{ id: 'start', display: 'Start', to: target }];
  assert.deepEqual(await scope.executeTransition(transitionInput), { ok: true });
  assert.deepEqual(await scope.addComment({ issueKey: 'ABC-1', text: 'hello' }), { id: '123' });
  assert.equal(writes, 2);
  await rejected(scope.addComment({ issueKey: 'ABC-1', text: '' }), 'invalid');
  await rejected(scope.executeTransition({ ...transitionInput, transitionId: '../bad' }), 'invalid');
});

test('write unknown outcomes and known errors are sanitized, never retried', async () => {
  for (const kind of ['identity', 'abort', 'network', 'known']) {
    const f = await prepareScope(), controller = new AbortController(), scope = scopeFor(f, { signal: controller.signal }); let writes = 0;
    f.tracker.addComment = async () => {
      writes++;
      if (kind === 'identity') { f.tracker.identity = 'identity-B'; return { id: '123' }; }
      if (kind === 'abort') { controller.abort(); return new Promise(() => {}); }
      throw Object.assign(new Error('SECRET http://private'), { name: 'TrackerError', code: kind === 'known' ? 'forbidden' : 'network_error' });
    };
    await assert.rejects(scope.addComment({ issueKey: 'ABC-1', text: 'hi' }), e => {
      assert.equal(e.code, kind === 'known' ? 'forbidden' : 'outcome_unknown');
      assert.doesNotMatch(String(e), /SECRET|private|identity/); return true;
    });
    assert.equal(writes, 1);
  }
});

test('configuration and selected board lifecycle uses fixed references and CAS', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.read(), { revision: 0, configured: false, orgType: null, workspaces: {}, needsReselect: [] });
  await rejected(f.service.command({ op: 'boards.list' }), 'not_configured');
  assert.equal((await config(f.service)).revision, 1);
  assert.deepEqual(f.settings.read().settings.connection, { tokenRef: 'TOKEN', orgIdRef: 'ORG_ID', orgType: 'org' });
  await rejected(select(f.service), 'board_list_required');
  await f.service.command({ op: 'boards.list' });
  await rejected(select(f.service, 1, ['3']), 'board_list_required');
  assert.equal((await select(f.service)).revision, 2);
  const explicit = await boardRead(f.service, 'ws', '1', ['ABC-2']);
  assert.deepEqual(explicit.keys, ['ABC-2']); assert.equal(explicit.searchByBoard, false);
  assert.equal((await boardRead(f.service)).searchByBoard, true);
  await rejected(boardRead(f.service, 'ws2'), 'board_not_selected');
  await rejected(boardRead(f.service, 'missing'), 'workspace_not_found');
  await rejected(select(f.service, 1, []), 'conflict');
  await config(f.service, 2);
  await rejected(boardRead(f.service), 'board_not_selected');
});

test('rejects arbitrary provider, credential, endpoint and extra fields without leakage', async () => {
  const f = fixture();
  for (const command of [
    { op: 'configuration.configure', expectedRevision: 0, orgType: 'org', token: 'TOP_SECRET' },
    { op: 'configuration.configure', expectedRevision: 0, orgType: 'org', tokenRef: 'OTHER' },
    { op: 'configuration.configure', expectedRevision: 0, orgType: 'org', tokenType: 'Bearer' },
    { op: 'configuration.configure', expectedRevision: 0, orgType: 'bad' },
    { op: 'boards.list', endpoint: 'http://127.0.0.1' },
    { op: 'board.read', workspaceId: 'ws', boardId: '1', issueKeys: [], query: 'TOP_SECRET' },
    { op: 'unknown' },
  ]) {
    const r = await body(await post(f.service, command));
    assert.equal(r.status, 400); assert.equal(r.value.error.code, 'invalid');
    assert.doesNotMatch(JSON.stringify(r), /TOP_SECRET|127\.0\.0\.1|Bearer/);
  }
  assert.equal(f.settings.read().revision, 0);
});

test('strict GET/POST semantics, content type and byte bounds', async () => {
  const { service } = fixture();
  assert.equal((await body(await service.fetch(new Request('http://local/path?op=boards.list')))).status, 400);
  assert.equal((await body(await service.fetch(new Request('http://local/path', { method: 'PUT' })))).status, 405);
  assert.equal((await body(await service.fetch(new Request('http://local/path', { method: 'POST', body: '{}' })))).status, 415);
  assert.equal((await body(await post(service, '{'))).status, 400);
  assert.equal((await body(await post(service, 'x'.repeat(MAX_BODY_BYTES + 1)))).status, 413);
  const chunks = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_BODY_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  const streamed = new Request('http://local/path', { method: 'POST', headers: { 'content-type': 'application/json' }, body: chunks, duplex: 'half' });
  assert.equal((await body(await service.fetch(streamed))).status, 413);
  const get = new Request('http://local/path', { headers: { 'content-length': '1' } });
  assert.equal((await body(await service.fetch(get))).status, 400);
});

test('invalid chunk and rejected reader cancel before releasing their lock', async () => {
  const { service } = fixture();
  for (const reject of [false, true]) {
    const actions = [];
    const reader = {
      read: () => reject ? Promise.reject(new Error('private')) : Promise.resolve({ done: false, value: 'not bytes' }),
      cancel: () => { actions.push('cancel'); return Promise.reject(new Error('private')); },
      releaseLock: () => actions.push('release'),
    };
    const request = {
      method: 'POST', url: 'http://local/path', signal: new AbortController().signal,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: { getReader: () => reader },
    };
    const result = await body(await service.fetch(request));
    assert.equal(result.status, reject ? 500 : 400);
    assert.deepEqual(actions, ['cancel', 'release']);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test('live registry and settings are rechecked after asynchronous board fetch', async () => {
  const f = fixture(); await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
  let release;
  f.tracker.getBoardOverview = () => new Promise(resolve => { release = resolve; });
  let pending = boardRead(f.service); await new Promise(resolve => setImmediate(resolve));
  f.registry.delete('ws'); release({ secret: 'must not return' }); await rejected(pending, 'workspace_not_found');
  f.registry.set('ws', { createdAt: 'one' });
  await f.service.command({ op: 'boards.list' }); await select(f.service, 2);
  pending = boardRead(f.service); await new Promise(resolve => setImmediate(resolve));
  await select(f.service, 3, []); release({ secret: 'must not return' }); await rejected(pending, 'conflict');
});

test('board list evidence invalidated on failure, config change, and selection', async () => {
  const f = fixture(); await config(f.service); await f.service.command({ op: 'boards.list' });
  f.tracker.listBoards = async () => { throw Object.assign(new Error('secret'), { name: 'TrackerError', code: 'unauthorized' }); };
  const r = await body(await post(f.service, { op: 'boards.list' }));
  assert.deepEqual(r, { status: 401, value: { error: { code: 'unauthorized' } } });
  await rejected(select(f.service), 'board_list_required');
});

test('abort stops pending remote read and does not authorize stale listing', async () => {
  const f = fixture(); await config(f.service);
  let signal;
  f.tracker.listBoards = ({ signal: s }) => { signal = s; return new Promise(() => {}); };
  const controller = new AbortController();
  const pending = post(f.service, { op: 'boards.list' }, { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  assert.equal((await body(await pending)).status, 499); assert.equal(signal.aborted, true);
  await rejected(select(f.service), 'board_list_required');
});

test('aborted streaming body returns without waiting for stream cancellation', async () => {
  const f = fixture(); const controller = new AbortController();
  const stream = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { return new Promise(() => {}); } });
  const request = new Request('http://local/path', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half', signal: controller.signal });
  const pending = f.service.fetch(request); controller.abort();
  assert.equal((await body(await pending)).status, 499);
});

test('selection and explicit keys reject malformed values', async () => {
  const f = fixture(); await config(f.service); await f.service.command({ op: 'boards.list' });
  for (const ids of [['1', '1'], ['01'], ['https://example.com'], [1]]) await rejected(select(f.service, 1, ids), 'invalid');
  await select(f.service);
  for (const keys of [['A-1', 'A-1'], ['A-0'], ['x-1'], ['A-1 OR *']]) await rejected(boardRead(f.service, 'ws', '1', keys), 'invalid');
});

test('restart and identity rotation require explicit reselect, never emit opaque identities', async () => {
  const f = fixture(); await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
  const restarted = createTrackerService({ settings: f.settings, tracker: f.tracker, workspaceRegistry: f.registry });
  assert.deepEqual((await restarted.read()).needsReselect, ['ws']);
  await rejected(boardRead(restarted), 'needs_reselect');
  f.tracker.identity = 'identity-B';
  const status = await body(await f.service.fetch(new Request('http://local/path')));
  assert.deepEqual(status.value.needsReselect, ['ws']); assert.doesNotMatch(JSON.stringify(status), /identity-[AB]/);
  f.tracker.identity = 'identity-A';
  await rejected(boardRead(f.service), 'needs_reselect');
  await f.service.command({ op: 'boards.list' });
  f.tracker.identity = 'identity-B';
  await rejected(select(f.service, 2), 'needs_reselect');
  await f.service.command({ op: 'boards.list' }); await select(f.service, 2);
  assert.deepEqual((await f.service.read()).needsReselect, []);
});

test('account or workspace incarnation change during remote call fails closed', async () => {
  const f = fixture(); await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
  let release;
  f.tracker.getBoardOverview = () => new Promise(resolve => { release = resolve; });
  let pending = boardRead(f.service); await new Promise(resolve => setImmediate(resolve));
  f.tracker.identity = 'identity-B'; release({ issuesComplete: false });
  await rejected(pending, 'needs_reselect');
  await f.service.command({ op: 'boards.list' }); await select(f.service, 2);
  pending = boardRead(f.service); await new Promise(resolve => setImmediate(resolve));
  f.registry.set('ws', { createdAt: 'replacement' }); release({ issuesComplete: false });
  await rejected(pending, 'needs_reselect');
});

test('unknown external revisions never inherit in-memory authorization', async () => {
  const f = fixture(); await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
  const snap = f.settings.read();
  f.settings.compareAndSet(snap.revision, snap.settings);
  await f.service.command({ op: 'boards.list' }); await select(f.service, 3, ['2'], 'ws2');
  await rejected(boardRead(f.service), 'needs_reselect');
});

test('a remote result cannot claim issue search completeness', async () => {
  const f = fixture(); await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
  f.tracker.getBoardOverview = async () => ({ issuesComplete: true });
  await rejected(boardRead(f.service), 'invalid_tracker_response');
});

test('close aborts outstanding reads, prevents delayed commits, and rejects new work', async () => {
  const f = fixture(); await config(f.service); await f.service.command({ op: 'boards.list' });
  let release;
  f.tracker.openSession = () => new Promise(resolve => { release = resolve; });
  const pending = post(f.service, { op: 'workspace.select', expectedRevision: 1, workspaceId: 'ws', boardIds: ['1'] });
  await new Promise(resolve => setImmediate(resolve));
  await f.service.close();
  assert.equal((await body(await pending)).status, 503);
  release({ identity: 'identity-A', listBoards() {}, getBoardOverview() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.settings.read().revision, 1);
  assert.equal((await body(await f.service.fetch(new Request('http://local/path')))).status, 503);
  await rejected(f.service.read(), 'unavailable');
  await f.service.close();
});

test('close releases a hanging streaming request without waiting on the stream', async () => {
  const f = fixture();
  const stream = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { return new Promise(() => {}); } });
  const request = new Request('http://local/path', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' });
  const pending = f.service.fetch(request);
  await new Promise(resolve => setImmediate(resolve));
  await f.service.close();
  assert.equal((await body(await pending)).status, 503);
});

test('service integrates actual Tracker client with fake transport only', async () => {
  const f = fixture(), calls = [];
  const tracker = createTrackerClient({
    getCredentials: async () => ({ token: 'LOCAL_FAKE_TOKEN', tokenType: 'OAuth', orgId: 'fake_org', orgType: 'org' }),
    fetch: async (url, init) => {
      calls.push({ url, method: init.method });
      let result;
      if (url.includes('/boards/_paginate')) result = [{ id: '1', name: 'First' }];
      else if (url.endsWith('/boards/1')) result = { id: '1', name: 'First' };
      else if (url.endsWith('/boards/1/columns')) result = [];
      else if (url.includes('/issues/_search')) result = [];
      else throw Error('unexpected fake route');
      return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const service = createTrackerService({ settings: f.settings, tracker, workspaceRegistry: f.registry });
  await config(service); await service.command({ op: 'boards.list' }); await select(service);
  const result = await boardRead(service);
  assert.equal(result.issuesComplete, false); assert.equal(result.issuesReason, 'approximate_board_filter');
  assert.equal(calls.length, 4); assert.doesNotMatch(JSON.stringify(result), /LOCAL_FAKE_TOKEN|fake_org/);
});
