import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackerService, MAX_BODY_BYTES } from './tracker-service.mjs';
import { createTrackerClient } from './tracker-api.mjs';

function fixture(options = {}) {
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
  registry.list = () => [...registry.values()];
  const tracker = {
    identity: 'identity-A',
    async listBoards() { return { boards: [{ id: '1', name: 'First' }, { id: '2', name: 'Second' }], complete: true, reason: null }; },
    async getBoardOverview(id, options) { return { board: { id, name: 'First' }, columns: [], issues: [], issuesComplete: false, issuesReason: 'explicit_keys_only', keys: options.issueKeys, searchByBoard: options.searchByBoard }; },
    async getIssue(key) { return { key, id: 'id-1', summary: 'Example', description: 'Description', status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: true, assignee: null, boards: [{ id: '1' }, { id: '99' }], version: 1 }; },
    async getIssueById(id) { return { id, key: 'ABC-1', boards: [{ id: '1' }] }; },
    async listTransitions() { return [{ id: 'start', display: 'Start', to: { id: '2', key: 'progress', display: 'In progress' } }]; },
    async addComment() { return { id: '123' }; },
    async getComments() { return { comments: [{ id: '1', text: 'hello', version: 1, createdBy: { id: 'u', display: 'User', secret: 'hidden' }, createdAt: '2026-01-01T12:00:00Z', secret: 'hidden' }], complete: false, nextCursor: '1' }; },
    async getComment(_key, id) { return { id, version: 1 }; },
    async editComment(_key, value) { return { id: value.id, version: 2 }; },
    async updateIssue(_key, changes) { return { version: changes.expectedVersion + 1 }; },
    async executeTransition() { return {}; },
    async getBoardCreationQueue() { return Object.freeze({ id: '3', key: 'DOC', display: 'Documents' }); },
    async getExplicitCreationQueue(_board, key) { return Object.freeze({ id: '8', key, display: 'Other queue' }); },
    async createIssue() { return { id: 'issue-1', key: 'DOC-1', version: 1 }; },
    async openSession() {
      const capabilities = new WeakSet();
      return { identity: this.identity, listBoards: (...args) => this.listBoards(...args), getBoardOverview: (...args) => this.getBoardOverview(...args), getIssue: (...args) => this.getIssue(...args), getIssueById: (...args) => this.getIssueById(...args), getComments: (...args) => this.getComments(...args), getComment: (...args) => this.getComment(...args), editComment: (...args) => this.editComment(...args), updateIssue: (...args) => this.updateIssue(...args), listTransitions: (...args) => this.listTransitions(...args), addComment: (...args) => this.addComment(...args), executeTransition: (...args) => this.executeTransition(...args),
        getBoardCreationQueue: async (...args) => { const queue = await this.getBoardCreationQueue(...args); if (queue && typeof queue === 'object') capabilities.add(queue); return queue; },
        getExplicitCreationQueue: async (...args) => { const queue = await this.getExplicitCreationQueue(...args); if (queue && typeof queue === 'object') capabilities.add(queue); return queue; },
        createIssue: (...args) => { assert.ok(capabilities.has(args[0].queue), 'capability must come from same account session'); return this.createIssue(...args); } };
    },
  };
  return { settings, registry, tracker, service: createTrackerService({ settings, tracker, workspaceRegistry: registry, ...options }) };
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
const transitionInput = { issueKey: 'ABC-1', issueId: 'id-1', transitionId: 'start', expectedTo: target };

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
  assert.deepEqual(value, { key: 'ABC-1', id: 'id-1', summary: 'Example', description: 'Description', status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: true, assignee: null, version: 1 });
  assert.doesNotMatch(JSON.stringify(value), /99|identity|boards/);
  for (const boards of [undefined, [], [{ id: '99' }], [{ id: '1' }, {}]]) {
    f.tracker.getIssue = async key => ({ key, boards });
    await rejected(scope.getIssue({ issueKey: 'ABC-1' }), 'issue_not_in_selected_boards');
  }
  await rejected(scope.getIssue({ issueKey: 'ABC-1', url: 'http://evil' }), 'invalid');
  await rejected(scope.getIssue({ issueKey: 'abc-1' }), 'invalid');
});

test('issue immutable id is projected when present and validated', async () => {
  const f = await prepareScope(), scope = scopeFor(f);
  const base = await f.tracker.getIssue('ABC-1');
  f.tracker.getIssue = async () => ({ ...base, id: 'immutable_123' });
  assert.equal((await scope.getIssue({ issueKey: 'ABC-1' })).id, 'immutable_123');
  assert.equal((await f.service.command({ op: 'issue.read', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'immutable_123' })).id, 'immutable_123');
  f.tracker.getIssue = async () => ({ ...base, id: '../bad' });
  await rejected(scope.getIssue({ issueKey: 'ABC-1' }), 'invalid_tracker_response');
  f.tracker.getBoardOverview = async id => ({ board: { id, name: 'First' }, columns: [], issues: [{ key: 'ABC-1', id: 'immutable_123', summary: 'Example', status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: true, assignee: null }], issuesComplete: false });
  assert.equal((await scope.boardRead({ boardId: '1', issueKeys: [] })).issues[0].id, 'immutable_123');
  const original = f.tracker.getBoardOverview;
  f.tracker.getBoardOverview = async (...args) => { const v = await original(...args); v.issues[0].id = '../bad'; return v; };
  await rejected(scope.boardRead({ boardId: '1', issueKeys: [] }), 'invalid_tracker_response');
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
  await rejected(scope.addComment({ issueKey: 'ABC-1', issueId: 'id-1', text: 'hello' }), 'issue_not_in_selected_boards');
  assert.equal(writes, 0);
  f.tracker.getIssue = async key => ({ key, id: 'id-1', summary: 'Example', description: null, status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: true, assignee: null, boards: [{ id: '1' }], version: 1 });
  f.tracker.listTransitions = async () => [{ id: 'start', display: 'Start', to: { ...target, display: 'Changed' } }];
  await rejected(scope.executeTransition(transitionInput), 'transition_not_available');
  assert.equal(writes, 0);
  f.tracker.listTransitions = async () => [{ id: 'start', display: 'Start', to: target }];
  assert.deepEqual(await scope.executeTransition(transitionInput), { ok: true });
  assert.deepEqual(await scope.addComment({ issueKey: 'ABC-1', issueId: 'id-1', text: 'hello' }), { id: '123' });
  assert.equal(writes, 2);
  await rejected(scope.addComment({ issueKey: 'ABC-1', issueId: 'id-1', text: '' }), 'invalid');
  await rejected(scope.executeTransition({ ...transitionInput, transitionId: '../bad' }), 'invalid');
});

test('session comment and transition require pinned IDs and reject malformed inputs', async () => {
  const f = await prepareScope(), scope = scopeFor(f); let reads = 0, writes = 0;
  f.tracker.getIssue = async () => { reads++; throw Error('unexpected read'); };
  f.tracker.addComment = f.tracker.executeTransition = async () => { writes++; };
  const comment = { issueKey: 'ABC-1', issueId: 'id-1', text: 'hello' };
  for (const invoke of [
    () => scope.addComment({ issueKey: 'ABC-1', text: 'hello' }),
    () => scope.executeTransition({ issueKey: 'ABC-1', transitionId: 'start', expectedTo: target }),
    ...[null, '', '../bad', 123, undefined].flatMap(issueId => [
      () => scope.addComment({ ...comment, issueId }),
      () => scope.executeTransition({ ...transitionInput, issueId }),
    ]),
    () => scope.addComment({ ...comment, extra: true }),
    () => scope.executeTransition({ ...transitionInput, expectedTo: { ...target, extra: true } }),
    () => scope.addComment(Object.defineProperty({ issueKey: 'ABC-1', text: 'hello' }, 'issueId', { enumerable: true, get: () => 'id-1' })),
    () => scope.executeTransition({ ...transitionInput, [Symbol('extra')]: true }),
  ]) await rejected(invoke(), 'invalid');
  assert.equal(reads, 0); assert.equal(writes, 0);
});

test('session writes check approved issue ID and selected board before dispatch', async () => {
  for (const kind of ['addComment', 'executeTransition']) {
    for (const change of ['initial-id', 'missing-id', 'reused-key', 'revoked-board']) {
      const f = await prepareScope(), scope = scopeFor(f); let reads = 0, writes = 0;
      const original = f.tracker.getIssue.bind(f.tracker);
      f.tracker.getIssue = async key => {
        const value = await original(key); reads++;
        if (change === 'initial-id' || (change === 'reused-key' && reads > 1)) value.id = 'id-2';
        if (change === 'missing-id') delete value.id;
        if (change === 'revoked-board' && reads > 1) value.boards = [{ id: '2' }];
        return value;
      };
      f.tracker.addComment = f.tracker.executeTransition = async () => { writes++; return { id: 'comment-1' }; };
      const promise = kind === 'addComment'
        ? scope.addComment({ issueKey: 'ABC-1', issueId: 'id-1', text: 'hello' })
        : scope.executeTransition(transitionInput);
      await rejected(promise, change === 'revoked-board' ? 'issue_not_in_selected_boards' : 'conflict');
      assert.equal(writes, 0, `${kind}: ${change}`);
      assert.equal(reads, change === 'reused-key' || change === 'revoked-board' ? 2 : 1, `${kind}: ${change}`);
    }
  }
});

test('session writes preserve independent Tracker profile settings', async () => {
  const first = await prepareScope(), second = await prepareScope();
  const beforeFirst = first.settings.read(), beforeSecond = second.settings.read();
  let otherWrites = 0;
  second.tracker.addComment = second.tracker.executeTransition = async () => { otherWrites++; };
  const scope = scopeFor(first);
  assert.deepEqual(await scope.addComment({ issueKey: 'ABC-1', issueId: 'id-1', text: 'hello' }), { id: '123' });
  assert.deepEqual(await scope.executeTransition(transitionInput), { ok: true });
  await rejected(scope.addComment({ issueKey: 'ABC-1', issueId: 'reused', text: 'hello' }), 'conflict');
  await rejected(scope.executeTransition({ ...transitionInput, issueId: 'reused' }), 'conflict');
  assert.deepEqual(first.settings.read(), beforeFirst);
  assert.deepEqual(second.settings.read(), beforeSecond);
  assert.equal(otherWrites, 0);
});

test('session write arguments are captured before asynchronous checks', async () => {
  for (const kind of ['addComment', 'executeTransition']) {
    const f = await prepareScope(), scope = scopeFor(f); let captured;
    f.tracker[kind] = async (key, value) => { captured = { key, value }; return { id: 'comment-1' }; };
    const input = kind === 'addComment'
      ? { issueKey: 'ABC-1', issueId: 'id-1', text: 'original' }
      : { ...transitionInput, expectedTo: { ...target } };
    const pending = scope[kind](input);
    input.issueKey = 'EVIL-1'; input.issueId = 'id-2';
    if (kind === 'addComment') input.text = 'changed';
    else { input.transitionId = 'changed'; input.expectedTo.display = 'changed'; }
    await pending;
    assert.deepEqual(captured, { key: 'ABC-1', value: kind === 'addComment' ? 'original' : 'start' });
  }
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
    await assert.rejects(scope.addComment({ issueKey: 'ABC-1', issueId: 'id-1', text: 'hi' }), e => {
      assert.equal(e.code, kind === 'known' ? 'forbidden' : 'outcome_unknown');
      assert.doesNotMatch(String(e), /SECRET|private|identity/); return true;
    });
    assert.equal(writes, 1);
  }
});

test('owner issue commands work without session and project comments', async () => {
  const f = await prepareScope();
  f.registry.get('ws').sessionIds = [];
  const send = (op, extra = {}) => f.service.command({ op, workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', ...extra });
  assert.equal((await send('issue.read')).summary, 'Example');
  const comments = await send('issue.comments');
  assert.deepEqual(comments, { comments: [{ id: '1', text: 'hello', version: 1, createdBy: { id: 'u', display: 'User' }, createdAt: '2026-01-01T12:00:00Z' }], complete: false, nextCursor: '1' });
  assert.deepEqual(await send('issue.transitions'), [{ id: 'start', display: 'Start', to: target }]);
  assert.deepEqual(await send('issue.update', { changes: { expectedVersion: 1, summary: 'new', description: '', assignee: null } }), { version: 2 });
  assert.deepEqual(await send('issue.comment', { text: 'hello' }), { id: '123' });
  assert.deepEqual(await send('issue.transition', { transitionId: 'start', expectedTo: target }), { ok: true });
  assert.throws(() => scopeFor(f), e => e.code === 'session_not_in_workspace');
});

const commentsCommand = (overrides = {}) => ({ op: 'issue.comments', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', ...overrides });
const testComment = (id = '1') => ({ id, text: 'hello', version: 1, createdBy: { id: 'u', display: 'User' }, createdAt: '2026-01-01T12:00:00Z' });

test('owner comment pages forward only explicit cursor; legacy agent scope stays unchanged', async () => {
  const f = await prepareScope(), calls = [];
  f.tracker.getComments = async (key, options) => {
    assert.equal(key, 'ABC-1'); assert.ok(options.signal instanceof AbortSignal);
    calls.push(Object.hasOwn(options, 'cursor') ? options.cursor : null);
    return options.cursor === undefined
      ? { comments: [testComment('1')], complete: false, nextCursor: '1', secret: 'hidden' }
      : { comments: [testComment('2')], complete: true, nextCursor: null, secret: 'hidden' };
  };
  assert.deepEqual(await f.service.command(commentsCommand()), { comments: [testComment('1')], complete: false, nextCursor: '1' });
  assert.deepEqual(await f.service.command(commentsCommand({ cursor: '1' })), { comments: [testComment('2')], complete: true, nextCursor: null });
  assert.deepEqual(await scopeFor(f).getComments({ issueKey: 'ABC-1' }), { comments: [testComment('1')], complete: false });
  await rejected(scopeFor(f).getComments({ issueKey: 'ABC-1', cursor: '1' }), 'invalid');
  assert.deepEqual(calls, [null, '1', null]);
});

test('indeterminate end passes through without an invented cursor or agent scope changes', async () => {
  const f = await prepareScope(), calls = [];
  const comments = Array.from({ length: 100 }, (_, i) => testComment(String(i + 2)));
  f.tracker.getComments = async (_key, options) => {
    calls.push(Object.hasOwn(options, 'cursor') ? options.cursor : null);
    return { comments, complete: false, nextCursor: null, secret: 'hidden' };
  };
  assert.deepEqual(await f.service.command(commentsCommand()), { comments, complete: false, nextCursor: null });
  assert.deepEqual(await f.service.command(commentsCommand({ cursor: '1' })), { comments, complete: false, nextCursor: null });
  assert.deepEqual(await scopeFor(f).getComments({ issueKey: 'ABC-1' }), { comments, complete: false });
  assert.deepEqual(calls, [null, '1', null]);
});

test('owner comment page cursor and response validation fail closed', async () => {
  const f = await prepareScope(); let calls = 0;
  f.tracker.getComments = async () => { calls++; return { comments: [], complete: true, nextCursor: null }; };
  for (const cursor of ['', '01', '-1', '+1', '1.0', '1e2', ' 1', '1 ', '1&perPage=500', '../1', '9007199254740992', 1, null, undefined])
    await rejected(f.service.command(commentsCommand({ cursor })), 'invalid');
  await rejected(f.service.command(commentsCommand({ cursor: '1', extra: true })), 'invalid');
  await rejected(f.service.command({ ...commentsCommand({ cursor: '1' }), op: 'issue.read' }), 'invalid');
  assert.equal(calls, 0);
  await f.service.command(commentsCommand({ cursor: '0' }));
  await f.service.command(commentsCommand({ cursor: '9007199254740991' }));
  f.tracker.getComments = async () => ({ comments: [testComment('0')], complete: false, nextCursor: '0' });
  assert.deepEqual(await f.service.command(commentsCommand()), { comments: [testComment('0')], complete: false, nextCursor: '0' });
  await rejected(f.service.command(commentsCommand({ cursor: '0' })), 'invalid_tracker_response');
  for (const result of [
    { comments: [], complete: false }, { comments: [], complete: true },
    { comments: [], complete: true, nextCursor: '2' },
    { comments: [], complete: 'true', nextCursor: null }, { comments: [], complete: false, nextCursor: '1' },
    { comments: [], complete: false, nextCursor: '0' }, { comments: [], complete: false, nextCursor: '01' },
    { comments: [], complete: false, nextCursor: '9007199254740992' },
    { comments: [], complete: false, nextCursor: 'https://evil' },
    { comments: Array.from({ length: 101 }, (_, i) => testComment(String(i))), complete: true, nextCursor: null },
    { comments: [testComment(), testComment()], complete: true, nextCursor: null },
    { comments: [{ ...testComment(), id: '../1' }], complete: true, nextCursor: null },
    { comments: [{ ...testComment(), version: -1 }], complete: true, nextCursor: null },
    { comments: [{ ...testComment(), text: 'bad\u0000text' }], complete: true, nextCursor: null },
  ]) {
    f.tracker.getComments = async () => result;
    await rejected(f.service.command(commentsCommand({ cursor: '1' })), 'invalid_tracker_response');
  }
});

test('comment page authorization is rechecked and never dispatches writes', async () => {
  for (const change of ['scope', 'issue-id', 'board', 'workspace', 'selection']) {
    const links = linkStore(), control = { scope: 'a'.repeat(64) };
    const f = fixture({ links, resolveAccountScope: async () => control.scope });
    await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
    let started, release, writes = 0;
    for (const method of ['addComment', 'editComment', 'updateIssue', 'executeTransition']) f.tracker[method] = async () => { writes++; };
    const ready = new Promise(resolve => { started = resolve; });
    f.tracker.getComments = () => new Promise(resolve => { release = () => resolve({ comments: [testComment()], complete: true, nextCursor: null }); started(); });
    const pending = f.service.command(commentsCommand({ cursor: '1' })); await ready;
    if (change === 'scope') control.scope = 'b'.repeat(64);
    if (change === 'issue-id' || change === 'board') {
      const original = f.tracker.getIssue;
      f.tracker.getIssue = async key => ({ ...(await original(key)), ...(change === 'issue-id' ? { id: 'id-2' } : { boards: [{ id: '2' }] }) });
    }
    if (change === 'workspace') f.registry.get('ws').createdAt = 'replacement';
    if (change === 'selection') { const s = f.settings.read(); f.settings.compareAndSet(s.revision, { ...s.settings, workspaces: { ws: [] } }); }
    release();
    await assert.rejects(pending, e => ['needs_reselect', 'conflict', 'issue_not_in_selected_boards'].includes(e.code), change);
    assert.equal(writes, 0); assert.equal(links.calls.length, 0);
  }
});

test('owner issue commands require exact fields and positive membership', async () => {
  const f = await prepareScope();
  const base = { workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1' };
  for (const command of [
    { op: 'issue.read', ...base, extra: true },
    { op: 'issue.update', ...base, changes: { expectedVersion: 1 } },
    { op: 'issue.update', ...base, changes: { expectedVersion: 1, summary: 'ok', status: 'x' } },
    { op: 'issue.update', ...base, changes: { expectedVersion: -1, summary: 'ok' } },
    { op: 'issue.update', ...base, changes: { expectedVersion: 1, assignee: '' } },
    { op: 'issue.comment', ...base, text: '  ' },
    { op: 'issue.transition', ...base, transitionId: 'start', expectedTo: { ...target, unknown: true } },
  ]) await rejected(f.service.command(command), 'invalid');
  let writes = 0;
  f.tracker.addComment = async () => { writes++; return { id: '123' }; };
  f.tracker.getIssue = async key => ({ key, boards: [{ id: '99' }] });
  for (const command of [
    { op: 'issue.read', ...base }, { op: 'issue.comments', ...base },
    { op: 'issue.transitions', ...base }, { op: 'issue.comment', ...base, text: 'x' },
    { op: 'issue.update', ...base, changes: { expectedVersion: 1, summary: 'x' } },
    { op: 'issue.transition', ...base, transitionId: 'start', expectedTo: target },
  ]) await rejected(f.service.command(command), 'issue_not_in_selected_boards');
  assert.equal(writes, 0);
});

test('owner issue commands snapshot input before asynchronous authorization', async () => {
  const f = await prepareScope(); let captured;
  f.tracker.updateIssue = async (_key, changes) => { captured = structuredClone(changes); return { version: 2 }; };
  const command = { op: 'issue.update', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', changes: { expectedVersion: 1, summary: 'original' } };
  const pending = f.service.command(command);
  command.issueKey = 'EVIL-1'; command.changes.summary = 'changed'; command.changes.expectedVersion = 99;
  assert.deepEqual(await pending, { version: 2 });
  assert.deepEqual(captured, { expectedVersion: 1, summary: 'original' });
});

test('owner issue reads recheck workspace, identity and membership after comments', async () => {
  for (const change of ['identity', 'incarnation', 'revision', 'membership']) {
    const f = await prepareScope(); let release, started;
    const ready = new Promise(resolve => { started = resolve; });
    f.tracker.getComments = () => new Promise(resolve => { release = () => resolve({ comments: [], complete: true, nextCursor: null }); started(); });
    const pending = f.service.command({ op: 'issue.comments', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1' });
    await ready;
    if (change === 'identity') f.tracker.identity = 'other';
    if (change === 'incarnation') f.registry.get('ws').createdAt = 'other';
    if (change === 'revision') { const state = f.settings.read(); f.settings.compareAndSet(state.revision, state.settings); }
    if (change === 'membership') f.tracker.getIssue = async key => ({ key, boards: [{ id: '99' }] });
    release();
    await assert.rejects(pending, e => ['needs_reselect', 'issue_not_in_selected_boards'].includes(e.code), change);
  }
});

test('HTTP abort after a write dispatch reports outcome unknown', async () => {
  const f = await prepareScope(), controller = new AbortController(); let started, writes = 0;
  const ready = new Promise(resolve => { started = resolve; });
  f.tracker.addComment = () => { writes++; started(); return new Promise(() => {}); };
  const pending = post(f.service, { op: 'issue.comment', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', text: 'x' }, { signal: controller.signal });
  await ready; controller.abort();
  assert.deepEqual(await body(await pending), { status: 502, value: { error: { code: 'outcome_unknown' } } });
  assert.equal(writes, 1);
});

test('owner writes reject stale transitions and never retry unknown outcomes', async () => {
  const f = await prepareScope(); let writes = 0;
  f.tracker.executeTransition = async () => { writes++; return {}; };
  await rejected(f.service.command({ op: 'issue.transition', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', transitionId: 'start', expectedTo: { ...target, display: 'stale' } }), 'transition_not_available');
  assert.equal(writes, 0);
  f.tracker.updateIssue = async () => { writes++; throw Object.assign(new Error('SECRET'), { name: 'TrackerError', code: 'network_error' }); };
  await rejected(f.service.command({ op: 'issue.update', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', changes: { expectedVersion: 1, summary: 'new' } }), 'outcome_unknown');
  assert.equal(writes, 1);
  f.tracker.updateIssue = async () => { writes++; throw Object.assign(new Error('SECRET'), { name: 'TrackerError', code: 'precondition_failed' }); };
  const result = await body(await post(f.service, { op: 'issue.update', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', changes: { expectedVersion: 1, summary: 'new' } }));
  assert.deepEqual(result, { status: 412, value: { error: { code: 'precondition_failed' } } });
  assert.equal(writes, 2);
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

function linkStore() {
  let revision = 0;
  const rows = [];
  return {
    calls: [], rows,
    read(scope) { this.calls.push(['read', structuredClone(scope)]); return { revision, links: rows.filter(r => r.accountScope === scope.accountScope && r.workspaceId === scope.workspaceId && r.workspaceCreatedAt === scope.workspaceCreatedAt).map(({ issueId, sessionId }) => ({ issueId, sessionId })) }; },
    mutate(request) {
      this.calls.push(['mutate', structuredClone(request)]);
      if (request.expectedRevision !== revision) return { ok: false, revision };
      const { expectedRevision, linked, ...row } = request;
      const index = rows.findIndex(value => Object.keys(row).every(k => value[k] === row[k]));
      if (linked && index === -1) { rows.push(row); revision++; }
      if (!linked && index !== -1) { rows.splice(index, 1); revision++; }
      return { ok: true, revision };
    },
  };
}
async function prepareLinks() {
  const links = linkStore(), control = { scope: 'a'.repeat(64) };
  const f = fixture({ links, resolveAccountScope: async ({ account, signal }) => { assert.equal(typeof account.identity, 'string'); signal.throwIfAborted(); return control.scope; } });
  f.tracker.getIssue = async key => ({ key, id: 'id-1', boards: [{ id: '1' }] });
  f.tracker.getBoardOverview = async (id, options) => {
    assert.deepEqual(options.issueKeys, []); assert.equal(options.searchByBoard, true);
    return { board: { id }, issues: [{ key: 'ABC-1', id: 'id-1' }], issuesComplete: false };
  };
  await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
  return { ...f, links, control };
}
const linkRead = (f, workspaceId = 'ws', boardId = '1') => f.service.command({ op: 'links.read', workspaceId, boardId });
const issueLinkCommand = (overrides = {}) => ({ op: 'links.issue.read', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', ...overrides });
const issueLinkRead = (f, overrides = {}, signal) => f.service.command(issueLinkCommand(overrides), signal);
const linkSet = (f, overrides = {}) => f.service.command({ op: 'links.set', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', sessionId: 'session-1', linked: true, expectedRevision: 0, ...overrides });
const sessionLinkCommand = (overrides = {}) => ({ op: 'links.session.read', workspaceId: 'ws', sessionId: 'session-1', ...overrides });
const sessionLinkRead = (f, overrides = {}, signal) => f.service.command(sessionLinkCommand(overrides), signal);

test('session links use exact IDs without board search, preserve memberships and project only verified fields', async () => {
  const f = await prepareLinks(); await linkSet(f);
  await f.service.command({ op: 'boards.list' }); await select(f.service, 2, ['2', '1']);
  const storeScope = { accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one' };
  f.links.rows.push({ ...storeScope, issueId: 'id-2', sessionId: 'session-1' },
    { ...storeScope, issueId: 'id-3', sessionId: 'foreign' },
    { ...storeScope, accountScope: 'b'.repeat(64), issueId: 'id-4', sessionId: 'session-1' },
    { ...storeScope, workspaceCreatedAt: 'old', issueId: 'id-5', sessionId: 'session-1' });
  f.tracker.getBoardOverview = () => { throw Error('search must not run'); };
  const ids = [];
  f.tracker.getIssueById = async (id, { signal }) => {
    signal.throwIfAborted(); ids.push(id);
    return { id, key: 'ABC-1', boards: [{ id: '1' }, { id: '2' }], summary: 'secret' };
  };
  f.links.calls.length = 0;
  assert.deepEqual(await sessionLinkRead(f), { revision: 1, incomplete: false, links: [
    { issueId: 'id-1', issueKey: 'ABC-1', sessionId: 'session-1', boardId: '2' },
    { issueId: 'id-2', issueKey: 'ABC-1', sessionId: 'session-1', boardId: '2' },
  ] });
  assert.deepEqual(ids, ['id-1', 'id-2', 'id-1', 'id-2']);
  assert.deepEqual(f.links.calls, [['read', storeScope], ['read', storeScope]]);
});

test('session links require strict command, live member, active binding and enabled selected boards', async () => {
  const f = await prepareLinks(); await linkSet(f); let lookups = 0;
  f.tracker.getIssueById = async () => { lookups++; return {}; };
  for (const c of [sessionLinkCommand({ extra: 1 }), sessionLinkCommand({ issueId: 'id-1' }), sessionLinkCommand({ sessionId: ' bad' }),
    Object.defineProperty(sessionLinkCommand(), 'sessionId', { enumerable: true, get: () => 'session-1' })]) await rejected(f.service.command(c), 'invalid');
  await rejected(sessionLinkRead(f, { workspaceId: 'missing' }), 'workspace_not_found');
  await rejected(sessionLinkRead(f, { sessionId: 'missing' }), 'session_not_in_workspace');
  f.registry.archivedSessionIds.push('session-1');
  await rejected(sessionLinkRead(f), 'session_not_in_workspace');
  f.registry.archivedSessionIds = [];
  f.registry.get('ws').archivedSessionIds = ['session-1'];
  await rejected(sessionLinkRead(f), 'session_not_in_workspace');
  f.registry.get('ws').archivedSessionIds = [];
  await select(f.service, 2, []);
  await rejected(sessionLinkRead(f), 'board_not_selected');
  assert.equal(lookups, 0);
  const noLinks = fixture(); await config(noLinks.service); await noLinks.service.command({ op: 'boards.list' }); await select(noLinks.service);
  await rejected(sessionLinkRead(noLinks), 'unavailable');
});

test('session links mark partial on unavailable or invalid individual issues without revealing them', async () => {
  const f = await prepareLinks();
  const scope = { accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one' };
  for (let i = 1; i <= 8; i++) f.links.rows.push({ ...scope, issueId: `id-${i}`, sessionId: 'session-1' });
  const error = code => Object.assign(new Error('secret'), { name: 'TrackerError', code });
  f.tracker.getIssueById = async id => {
    if (id === 'id-1') throw error('forbidden');
    if (id === 'id-2') throw error('not_found');
    if (id === 'id-3') return { id, key: 'ABC-3', boards: [{ id: '2' }] };
    if (id === 'id-4') return { id: 'wrong', key: 'ABC-4', boards: [{ id: '1' }] };
    if (id === 'id-5') return { id, key: 'abc-5', boards: [{ id: '1' }] };
    if (id === 'id-6') return { id, key: 'ABC-6', boards: [{ id: '1' }, {}] };
    if (id === 'id-7') return { id, key: 'ABC-7', boards: [] };
    return { id, key: 'ABC-8', boards: [{ id: '1' }] };
  };
  assert.deepEqual(await sessionLinkRead(f), { revision: 0, incomplete: true, links: [{ issueId: 'id-8', issueKey: 'ABC-8', sessionId: 'session-1', boardId: '1' }] });
  for (const code of ['unauthorized', 'invalid_credentials', 'network_error', 'rate_limited']) {
    f.tracker.getIssueById = async () => { throw error(code); };
    await rejected(sessionLinkRead(f), code);
  }
});

test('session links cap lookups and concurrency while preserving deterministic order', async () => {
  const f = await prepareLinks(), scope = { accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one' };
  for (let i = 0; i < 101; i++) f.links.rows.push({ ...scope, issueId: `id-${String(i).padStart(3, '0')}`, sessionId: 'session-1' });
  let calls = 0, active = 0, maxActive = 0;
  f.tracker.getIssueById = async id => {
    active++; maxActive = Math.max(maxActive, active); assert.ok(active <= 5); calls++;
    await new Promise(resolve => setImmediate(resolve));
    active--; return { id, key: 'ABC-1', boards: [{ id: '1' }] };
  };
  const result = await sessionLinkRead(f);
  assert.equal(maxActive, 5); assert.equal(active, 0);
  assert.equal(calls, 200); assert.equal(result.links.length, 100); assert.equal(result.incomplete, true);
  assert.equal(result.links[0].issueId, 'id-000'); assert.equal(result.links.at(-1).issueId, 'id-099');
});

test('session links revalidate earlier results after a deferred board change', async () => {
  const f = await prepareLinks(), scope = { accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one' };
  f.links.rows.push({ ...scope, issueId: 'id-1', sessionId: 'session-1' }, { ...scope, issueId: 'id-2', sessionId: 'session-1' });
  let started, release, revoked = false;
  const ready = new Promise(resolve => { started = resolve; });
  f.tracker.getIssueById = async id => {
    if (id === 'id-2' && !revoked) await new Promise(resolve => { release = resolve; started(); });
    return { id, key: 'ABC-1', boards: [{ id: id === 'id-1' && revoked ? '2' : '1' }] };
  };
  const pending = sessionLinkRead(f); await ready; revoked = true; release();
  assert.deepEqual(await pending, { revision: 0, incomplete: true, links: [{ issueId: 'id-2', issueKey: 'ABC-1', sessionId: 'session-1', boardId: '1' }] });
});

test('session links drain concurrent lookups after a fatal error and dispatch no more', async () => {
  const f = await prepareLinks(), scope = { accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one' };
  for (let i = 0; i < 10; i++) f.links.rows.push({ ...scope, issueId: `id-${i}`, sessionId: 'session-1' });
  let started, active = 0, calls = 0, done = false;
  const ready = new Promise(resolve => { started = resolve; });
  // Every in-flight deferred read shares one gate.
  let unblock; const gate = new Promise(resolve => { unblock = resolve; });
  f.tracker.getIssueById = async id => {
    calls++; active++;
    if (id === 'id-0') { active--; throw Object.assign(new Error('private'), { name: 'TrackerError', code: 'unauthorized' }); }
    started(); await gate; active--;
    return { id, key: 'ABC-1', boards: [{ id: '1' }] };
  };
  const pending = sessionLinkRead(f).finally(() => { done = true; });
  await ready; await new Promise(resolve => setImmediate(resolve));
  assert.equal(done, false); assert.equal(calls, 5); assert.equal(active, 4);
  unblock(); await rejected(pending, 'unauthorized'); assert.equal(active, 0); assert.equal(calls, 5);
});

test('session links fail closed on concurrent scope, membership or local revision changes', async () => {
  for (const change of ['identity', 'scope', 'revision', 'workspace', 'removed', 'archived', 'unlink-relink', 'other-pair', 'abort']) {
    const f = await prepareLinks(); await linkSet(f); let release, started;
    const ready = new Promise(resolve => { started = resolve; }), controller = new AbortController();
    let lookups = 0;
    f.tracker.getIssueById = id => ++lookups === 1
      ? new Promise(resolve => { release = () => resolve({ id, key: 'ABC-1', boards: [{ id: '1' }] }); started(); })
      : Promise.resolve({ id, key: 'ABC-1', boards: [{ id: '1' }] });
    const pending = sessionLinkRead(f, {}, controller.signal); await ready;
    const scope = { accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one' };
    if (change === 'identity') f.tracker.identity = 'other';
    if (change === 'scope') f.control.scope = 'b'.repeat(64);
    if (change === 'revision') { const s = f.settings.read(); f.settings.compareAndSet(s.revision, s.settings); }
    if (change === 'workspace') f.registry.get('ws').createdAt = 'new';
    if (change === 'removed') f.registry.get('ws').sessionIds = [];
    if (change === 'archived') f.registry.archivedSessionIds.push('session-1');
    if (change === 'unlink-relink') {
      f.links.mutate({ ...scope, issueId: 'id-1', sessionId: 'session-1', linked: false, expectedRevision: 1 });
      f.links.mutate({ ...scope, issueId: 'id-1', sessionId: 'session-1', linked: true, expectedRevision: 2 });
    }
    if (change === 'other-pair') f.links.mutate({ ...scope, issueId: 'other', sessionId: 'session-1', linked: true, expectedRevision: 1 });
    if (change === 'abort') controller.abort();
    release(); await assert.rejects(pending, change);
  }
});

test('exact issue links bypass search, project current members and retain global CAS revision', async () => {
  const f = await prepareLinks();
  await linkSet(f);
  f.registry.get('ws').sessionIds.push('archived', 'other');
  f.registry.archivedSessionIds.push('archived');
  const scope = { accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one' };
  f.links.rows.push({ ...scope, issueId: 'id-1', sessionId: 'archived' },
    { ...scope, issueId: 'id-1', sessionId: 'removed' }, { ...scope, issueId: 'id-2', sessionId: 'other' },
    { ...scope, accountScope: 'b'.repeat(64), issueId: 'id-1', sessionId: 'other' },
    { ...scope, workspaceCreatedAt: 'old', issueId: 'id-1', sessionId: 'other' });
  f.tracker.getBoardOverview = async id => ({ board: { id }, issues: [], issuesComplete: false });
  assert.deepEqual(await linkRead(f), { revision: 1, links: [], incomplete: true });
  f.tracker.getBoardOverview = () => { throw Error('search must not run'); };
  assert.deepEqual(await issueLinkRead(f), { revision: 1, incomplete: false, links: [
    { issueId: 'id-1', issueKey: 'ABC-1', sessionId: 'session-1' },
    { issueId: 'id-1', issueKey: 'ABC-1', sessionId: 'archived' },
  ] });
  await rejected(linkSet(f, { expectedRevision: 0, sessionId: 'other' }), 'conflict');
  assert.deepEqual(await linkSet(f, { expectedRevision: 1, sessionId: 'other' }), { revision: 2 });
  assert.equal((await issueLinkRead(f)).revision, 2);
});

test('exact issue link commands enforce strict shape and live exact authorization', async () => {
  const f = await prepareLinks(); await linkSet(f); f.links.calls.length = 0;
  for (const cmd of [issueLinkCommand({ extra: 1 }), issueLinkCommand({ issueId: '../bad' }),
    issueLinkCommand({ issueKey: 'abc-1' }), issueLinkCommand({ boardId: '2' }),
    Object.defineProperty(issueLinkCommand(), 'issueId', { enumerable: true, get: () => 'id-1' })]) {
    await rejected(f.service.command(cmd), cmd.boardId === '2' ? 'board_not_selected' : 'invalid');
  }
  for (const [value, code] of [
    [{ key: 'ABC-1', id: 'id-2', boards: [{ id: '1' }] }, 'conflict'],
    [{ key: 'ABC-2', id: 'id-1', boards: [{ id: '1' }] }, 'issue_not_in_selected_boards'],
    [{ key: 'ABC-1', id: 'id-1', boards: [{ id: '2' }] }, 'issue_not_in_selected_boards'],
    [{ key: 'ABC-1', boards: [{ id: '1' }] }, 'issue_id_required'],
  ]) { f.tracker.getIssue = async () => value; await rejected(issueLinkRead(f), code); }
  assert.equal(f.links.calls.length, 0);
});

test('exact issue links revalidate after local read and suppress removed sessions', async () => {
  for (const change of ['deleted', 'revoked', 'reused', 'identity', 'scope', 'revision', 'workspace', 'removed', 'abort']) {
    const f = await prepareLinks(); await linkSet(f); let calls = 0, started, release;
    const controller = new AbortController(), ready = new Promise(resolve => { started = resolve; });
    f.tracker.getIssue = key => {
      calls++;
      if (calls === 1) return Promise.resolve({ key, id: 'id-1', boards: [{ id: '1' }] });
      return new Promise((resolve, reject) => { release = () => change === 'deleted'
        ? reject(Object.assign(new Error('secret'), { name: 'TrackerError', code: 'not_found' }))
        : resolve({ key, id: change === 'reused' ? 'id-2' : 'id-1', boards: [{ id: change === 'revoked' ? '2' : '1' }] }); started(); });
    };
    const pending = issueLinkRead(f, {}, controller.signal); await ready;
    if (change === 'identity') f.tracker.identity = 'other';
    if (change === 'scope') f.control.scope = 'b'.repeat(64);
    if (change === 'revision') { const s = f.settings.read(); f.settings.compareAndSet(s.revision, s.settings); }
    if (change === 'workspace') f.registry.get('ws').createdAt = 'new';
    if (change === 'removed') f.registry.get('ws').sessionIds = [];
    if (change === 'abort') controller.abort();
    release();
    if (change === 'removed') assert.deepEqual(await pending, { revision: 1, incomplete: false, links: [] });
    else await assert.rejects(pending, change);
    assert.equal(f.links.calls.filter(([kind]) => kind === 'mutate').length, 1, change);
  }
});

test('exact issue links reject a concurrent unlink or unlink-relink after snapshot', async () => {
  for (const relink of [false, true]) {
    const f = await prepareLinks(); await linkSet(f); let calls = 0, started, release;
    const ready = new Promise(resolve => { started = resolve; });
    f.tracker.getIssue = key => ++calls === 1
      ? Promise.resolve({ key, id: 'id-1', boards: [{ id: '1' }] })
      : new Promise(resolve => { release = () => resolve({ key, id: 'id-1', boards: [{ id: '1' }] }); started(); });
    const pending = issueLinkRead(f); await ready;
    const scope = { accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one', issueId: 'id-1', sessionId: 'session-1' };
    f.links.mutate({ ...scope, linked: false, expectedRevision: 1 });
    if (relink) f.links.mutate({ ...scope, linked: true, expectedRevision: 2 });
    release(); await rejected(pending, 'conflict');
  }
});

test('exact issue link reads bound store output and sanitize failures', async () => {
  const f = await prepareLinks();
  for (const value of [{ revision: -1, links: [] }, { revision: 0, links: Array(5001).fill({ issueId: 'id-1', sessionId: 's' }) },
    { revision: 0, links: [{ issueId: 'id-1', sessionId: 's' }, { issueId: 'id-1', sessionId: 's' }] }]) {
    f.links.read = () => value;
    await rejected(issueLinkRead(f), 'internal');
  }
  f.links.read = () => { throw Error('private'); };
  assert.deepEqual(await body(await post(f.service, issueLinkCommand())), { status: 500, value: { error: { code: 'internal' } } });
  f.tracker.getIssue = async () => { throw Object.assign(new Error('private'), { name: 'TrackerError', code: 'forbidden' }); };
  assert.deepEqual(await body(await post(f.service, issueLinkCommand())), { status: 403, value: { error: { code: 'forbidden' } } });
  f.tracker.getIssue = async () => { throw Error('private'); };
  assert.deepEqual(await body(await post(f.service, issueLinkCommand())), { status: 500, value: { error: { code: 'internal' } } });
});

test('links join only confirmed immutable IDs and workspace sessions', async () => {
  const f = await prepareLinks();
  assert.deepEqual(await linkSet(f), { revision: 1 });
  assert.deepEqual(await linkSet(f, { expectedRevision: 1 }), { revision: 1 });
  assert.deepEqual(await linkRead(f), { revision: 1, links: [{ issueId: 'id-1', issueKey: 'ABC-1', sessionId: 'session-1' }], incomplete: true });
  const scope = { accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one' };
  f.links.rows.push({ ...scope, issueId: 'private-id', sessionId: 'session-1' }, { ...scope, issueId: 'id-1', sessionId: 'foreign-session' },
    { ...scope, accountScope: 'b'.repeat(64), issueId: 'id-1', sessionId: 'session-1' },
    { ...scope, workspaceCreatedAt: 'old', issueId: 'id-1', sessionId: 'session-1' });
  f.tracker.getBoardOverview = async id => ({ board: { id }, issuesComplete: false, issues: [{ key: 'NEW-9', id: 'id-1' }, { key: 'ABC-1', id: 'reused-id' }, { key: 'NOID-1' }] });
  const result = await linkRead(f);
  assert.deepEqual(result, { revision: 1, links: [{ issueId: 'id-1', issueKey: 'NEW-9', sessionId: 'session-1' }], incomplete: true });
  assert.doesNotMatch(JSON.stringify(result), /private|foreign|NOID|ABC/);
  f.tracker.getBoardOverview = async id => ({ board: { id }, issues: [], issuesComplete: false });
  assert.deepEqual(await linkRead(f), { revision: 1, links: [], incomplete: true });
  f.tracker.getBoardOverview = async id => ({ board: { id }, issues: [{ key: 'ABC-1' }], issuesComplete: false });
  assert.deepEqual(await linkRead(f), { revision: 1, links: [], incomplete: true });
  f.tracker.getBoardOverview = async id => ({ board: { id }, issues: [{ key: 'ABC-1', id: 'id-1' }, { key: 'ABC-2', id: 'id-1' }], issuesComplete: false });
  await rejected(linkRead(f), 'invalid_tracker_response');
});

test('links isolate namespaces across accounts and workspace incarnations', async () => {
  const f = await prepareLinks(); await linkSet(f);
  f.control.scope = 'b'.repeat(64);
  await rejected(linkRead(f), 'needs_reselect');
  await rejected(linkSet(f, { expectedRevision: 1 }), 'needs_reselect');
  await f.service.command({ op: 'boards.list' }); await select(f.service, 2);
  assert.deepEqual(await linkRead(f), { revision: 1, links: [], incomplete: true });
  assert.deepEqual(await linkSet(f, { expectedRevision: 1 }), { revision: 2 });
  f.control.scope = 'a'.repeat(64);
  await rejected(linkRead(f), 'needs_reselect');
  await f.service.command({ op: 'boards.list' }); await select(f.service, 3);
  assert.equal((await linkRead(f)).links.length, 1);
  f.registry.get('ws').createdAt = 'replacement';
  await rejected(linkRead(f), 'needs_reselect');
  await f.service.command({ op: 'boards.list' }); await select(f.service, 4);
  assert.deepEqual(await linkRead(f), { revision: 2, links: [], incomplete: true });
});

test('link writes require selected board, live issue ID, workspace member and CAS', async () => {
  const f = await prepareLinks();
  await rejected(linkSet(f, { boardId: '2' }), 'board_not_selected');
  await rejected(linkSet(f, { sessionId: 'session-2' }), 'session_not_in_workspace');
  f.tracker.getIssue = async key => ({ key, id: 'id-1', boards: [{ id: '2' }] });
  await rejected(linkSet(f), 'issue_not_in_selected_boards');
  f.tracker.getIssue = async key => ({ key, boards: [{ id: '1' }] });
  await rejected(linkSet(f), 'issue_id_required');
  f.tracker.getIssue = async key => ({ key, id: 'id-1', boards: [{ id: '1' }] });
  f.registry.archivedSessionIds.push('session-1');
  await rejected(linkSet(f), 'session_not_in_workspace');
  assert.deepEqual(await linkSet(f, { linked: false }), { revision: 0 });
  f.registry.archivedSessionIds = [];
  assert.deepEqual(await linkSet(f), { revision: 1 });
  await rejected(linkSet(f), 'conflict');
  f.registry.get('ws').sessionIds = [];
  await rejected(linkSet(f, { linked: false, expectedRevision: 1 }), 'session_not_in_workspace');
});

test('link authorization races reject before local CAS', async () => {
  for (const change of ['identity', 'scope', 'revision', 'incarnation', 'membership', 'abort']) {
    const f = await prepareLinks(), controller = new AbortController(); let release, started;
    const ready = new Promise(resolve => { started = resolve; });
    f.tracker.getIssue = key => new Promise(resolve => { release = () => resolve({ key, id: 'id-1', boards: [{ id: '1' }] }); started(); });
    const pending = f.service.command({ op: 'links.set', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', sessionId: 'session-1', linked: true, expectedRevision: 0 }, controller.signal);
    await ready;
    if (change === 'identity') f.tracker.identity = 'other';
    if (change === 'scope') f.control.scope = 'b'.repeat(64);
    if (change === 'revision') { const s = f.settings.read(); f.settings.compareAndSet(s.revision, s.settings); }
    if (change === 'incarnation') f.registry.get('ws').createdAt = 'other';
    if (change === 'membership') f.registry.get('ws').sessionIds = [];
    if (change === 'abort') controller.abort();
    release();
    await assert.rejects(pending, change);
    assert.equal(f.links.calls.filter(([kind]) => kind === 'mutate').length, 0, change);
  }
});

test('links errors are sanitized and uncertain local commits are never retried', async () => {
  const f = await prepareLinks(); let count = 0;
  f.links.mutate = () => { count++; throw Error('private http://secret'); };
  const result = await body(await post(f.service, { op: 'links.set', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', sessionId: 'session-1', linked: true, expectedRevision: 0 }));
  assert.deepEqual(result, { status: 502, value: { error: { code: 'outcome_unknown' } } });
  assert.equal(count, 1);
  f.links.mutate = () => { count++; return { ok: true, revision: 'private' }; };
  await rejected(linkSet(f), 'outcome_unknown'); assert.equal(count, 2);
  f.links.read = () => { throw Error('private'); };
  const read = await body(await post(f.service, { op: 'links.read', workspaceId: 'ws', boardId: '1' }));
  assert.deepEqual(read, { status: 500, value: { error: { code: 'internal' } } });
});

test('principal is bound to listing and selection, including changes during awaits', async () => {
  for (const stage of ['list', 'before-select', 'during-select']) {
    const links = linkStore(), control = { scope: 'a'.repeat(64), calls: 0 };
    const f = fixture({ links, resolveAccountScope: async () => { control.calls++; if (stage === 'during-select' && control.calls === 4) control.scope = 'b'.repeat(64); return control.scope; } });
    await config(f.service);
    if (stage === 'list') f.tracker.listBoards = async () => { control.scope = 'b'.repeat(64); return { boards: [{ id: '1', name: 'private' }], complete: true, reason: null }; };
    if (stage === 'list') {
      await rejected(f.service.command({ op: 'boards.list' }), 'needs_reselect');
      await rejected(select(f.service), 'board_list_required');
    } else {
      const listing = await f.service.command({ op: 'boards.list' });
      assert.doesNotMatch(JSON.stringify(listing), /a{64}|b{64}|identity/);
      if (stage === 'before-select') control.scope = 'b'.repeat(64);
      await rejected(select(f.service), 'needs_reselect');
    }
    assert.equal(f.settings.read().revision, 1);
    assert.deepEqual(f.links, undefined);
    assert.equal(links.calls.length, 0);
  }
});

test('principal changes while opening the post-list session invalidate evidence', async () => {
  const links = linkStore(); let scope = 'a'.repeat(64), opens = 0;
  const f = fixture({ links, resolveAccountScope: async () => scope });
  const original = f.tracker.openSession;
  f.tracker.openSession = async function () { if (++opens === 2) scope = 'b'.repeat(64); return original.call(this); };
  await config(f.service);
  await rejected(f.service.command({ op: 'boards.list' }), 'needs_reselect');
  await rejected(select(f.service), 'board_list_required');
});

test('same credential principal changes revoke all bound operations and writes', async () => {
  for (const op of ['board', 'issue', 'link-read', 'link-set', 'status', 'write']) {
    const f = await prepareLinks(); let writes = 0;
    f.tracker.addComment = async () => { writes++; return { id: '1' }; };
    f.control.scope = 'b'.repeat(64);
    const commands = {
      board: () => boardRead(f.service),
      issue: () => f.service.command({ op: 'issue.read', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1' }),
      'link-read': () => linkRead(f), 'link-set': () => linkSet(f),
      status: () => f.service.read(),
      write: () => f.service.command({ op: 'issue.comment', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', text: 'x' }),
    };
    if (op === 'status') assert.deepEqual((await commands[op]()).needsReselect, ['ws']);
    else await rejected(commands[op](), 'needs_reselect');
    assert.equal(writes, 0); assert.equal(f.links.calls.length, 0);
    f.control.scope = 'a'.repeat(64);
    await rejected(boardRead(f.service), 'needs_reselect');
  }
});

test('principal changes during remote responses never expose data or commit', async () => {
  for (const op of ['board', 'issue', 'links-read', 'links-set-first', 'links-set-latest']) {
    const f = await prepareLinks(); let release, started, calls = 0;
    const ready = new Promise(resolve => { started = resolve; });
    const wait = value => new Promise(resolve => { release = () => resolve(value); started(); });
    if (op === 'board' || op === 'links-read') f.tracker.getBoardOverview = id => wait({ board: { id }, issues: [], issuesComplete: false, secret: 'private' });
    else f.tracker.getIssue = key => {
      calls++;
      const value = { key, id: 'id-1', summary: 'private', description: null, status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: true, assignee: null, boards: [{ id: '1' }], version: 1 };
      return (op === 'links-set-latest' && calls === 1) ? Promise.resolve(value) : wait(value);
    };
    const pending = op === 'board' ? boardRead(f.service) : op === 'links-read' ? linkRead(f) : op.startsWith('links-set') ? linkSet(f) : f.service.command({ op: 'issue.read', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1' });
    await ready; f.control.scope = 'b'.repeat(64); release();
    await rejected(pending, 'needs_reselect');
    assert.equal(f.links.calls.length, 0);
  }
});

test('owner issue operations bind immutable ID and exact selected board', async () => {
  const f = await prepareScope(); let writes = 0;
  f.tracker.addComment = async () => { writes++; return { id: '1' }; };
  const base = { workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'other' };
  for (const cmd of [{ op: 'issue.read', ...base }, { op: 'issue.comments', ...base }, { op: 'issue.transitions', ...base }, { op: 'issue.comment', ...base, text: 'x' }, { op: 'issue.update', ...base, changes: { expectedVersion: 1, summary: 'x' } }, { op: 'issue.transition', ...base, transitionId: 'start', expectedTo: target }]) await rejected(f.service.command(cmd), 'conflict');
  assert.equal(writes, 0);
  await rejected(f.service.command({ op: 'issue.read', ...base, issueId: 'id-1', boardId: '2' }), 'board_not_selected');
  const result = await f.tracker.getIssue('ABC-1');
  f.tracker.getIssue = async () => ({ ...result, boards: [{ id: '2' }] });
  await rejected(f.service.command({ op: 'issue.read', ...base, issueId: 'id-1' }), 'issue_not_in_selected_boards');
});

test('links compare the requested immutable ID on both live checks', async () => {
  const f = await prepareLinks();
  await rejected(linkSet(f, { issueId: 'other' }), 'conflict');
  let count = 0;
  f.tracker.getIssue = async key => ({ key, id: ++count === 1 ? 'id-1' : 'id-2', boards: [{ id: '1' }] });
  await rejected(linkSet(f), 'conflict');
  assert.equal(f.links.calls.length, 0);
});

test('own links expose only caller state, use exact board and global CAS', async () => {
  const f = await prepareLinks();
  f.registry.get('ws').sessionIds.push('session-foreign');
  f.links.rows.push({ accountScope: 'a'.repeat(64), workspaceId: 'ws', workspaceCreatedAt: 'one', issueId: 'id-1', sessionId: 'session-foreign' });
  const scope = scopeFor(f), preview = { boardId: '1', issueKey: 'ABC-1' };
  const set = { ...preview, issueId: 'id-1', linked: true, expectedRevision: 0 };
  assert.deepEqual(await scope.previewOwnLink(preview), { issueId: 'id-1', linked: false, revision: 0 });
  for (const extra of [{ sessionId: 'session-foreign' }, { workspaceId: 'ws2' }, { accountScope: 'a'.repeat(64) }]) {
    await rejected(scope.previewOwnLink({ ...preview, ...extra }), 'invalid');
    await rejected(scope.setOwnLink({ ...set, ...extra }), 'invalid');
  }
  await rejected(scope.previewOwnLink({ ...preview, boardId: '2' }), 'board_not_selected');
  await rejected(scope.setOwnLink({ ...set, issueId: 'other' }), 'conflict');
  assert.deepEqual(await scope.setOwnLink(set), { revision: 1 });
  assert.deepEqual(await scope.previewOwnLink(preview), { issueId: 'id-1', linked: true, revision: 1 });
  await rejected(scope.setOwnLink(set), 'conflict');
  assert.equal(f.links.rows.length, 2);
  await f.service.command({ op: 'boards.list' }); await select(f.service, 2, ['1', '2']);
  f.tracker.getIssue = async key => ({ key, id: 'id-1', boards: [{ id: '1' }, { id: '2' }] });
  const next = scopeFor(f);
  assert.deepEqual(await next.previewOwnLink({ ...preview, boardId: '2' }), { issueId: 'id-1', linked: true, revision: 1 });
  assert.deepEqual(await next.setOwnLink({ ...set, boardId: '2', linked: false, expectedRevision: 1 }), { revision: 2 });
  assert.deepEqual(await next.previewOwnLink(preview), { issueId: 'id-1', linked: false, revision: 2 });
  assert.equal(f.links.rows.length, 1);
});

test('own links fail closed on identity, membership, revocation and uncertain commit', async () => {
  const preview = { boardId: '1', issueKey: 'ABC-1' }, set = { ...preview, issueId: 'id-1', linked: true, expectedRevision: 0 };
  for (const change of ['id', 'board', 'scope', 'identity', 'archived', 'removed', 'workspace', 'selection']) {
    const f = await prepareLinks(), scope = scopeFor(f); let calls = 0, started, release;
    const ready = new Promise(resolve => { started = resolve; });
    f.tracker.getIssue = key => {
      calls++;
      if (calls === 1) return Promise.resolve({ key, id: 'id-1', boards: [{ id: '1' }] });
      return new Promise(resolve => { release = () => resolve({ key, id: change === 'id' ? 'id-2' : 'id-1', boards: [{ id: change === 'board' ? '2' : '1' }] }); started(); });
    };
    const pending = scope.setOwnLink(set); await ready;
    if (change === 'scope') f.control.scope = 'b'.repeat(64);
    if (change === 'identity') f.tracker.identity = 'changed';
    if (change === 'archived') f.registry.archivedSessionIds.push('session-1');
    if (change === 'removed') f.registry.get('ws').sessionIds = [];
    if (change === 'workspace') f.registry.get('ws').createdAt = 'other';
    if (change === 'selection') { const s = f.settings.read(); f.settings.compareAndSet(s.revision, s.settings); }
    release(); await assert.rejects(pending, change);
    assert.equal(f.links.calls.filter(([op]) => op === 'mutate').length, 0, change);
  }
  const f = await prepareLinks(), scope = scopeFor(f); let calls = 0;
  const mutate = f.links.mutate.bind(f.links);
  f.links.mutate = request => { calls++; mutate(request); throw Error('private'); };
  await rejected(scope.setOwnLink(set), 'outcome_unknown'); assert.equal(calls, 1);
  assert.deepEqual(await scope.previewOwnLink(preview), { issueId: 'id-1', linked: true, revision: 1 });
  f.registry.archivedSessionIds.push('session-1');
  await rejected(scope.setOwnLink({ ...set, linked: false, expectedRevision: 1 }), 'session_not_in_workspace');
  await rejected(scope.previewOwnLink(preview), 'session_not_in_workspace');
});

test('agent update pins issue identity twice and snapshots input', async () => {
  const f = await prepareScope(), scope = scopeFor(f); let writes = 0, reads = 0;
  const original = f.tracker.getIssue;
  f.tracker.getIssue = async key => ({ ...(await original(key)), id: ++reads === 1 ? 'id-1' : 'id-2' });
  f.tracker.updateIssue = async () => { writes++; return { version: 2 }; };
  const input = { issueKey: 'ABC-1', issueId: 'id-1', changes: { expectedVersion: 1, summary: 'new' } };
  await rejected(scope.updateIssue(input), 'conflict'); assert.equal(writes, 0);
  await rejected(scope.updateIssue({ issueKey: 'ABC-1', changes: input.changes }), 'invalid');
  f.tracker.getIssue = original; let captured;
  f.tracker.updateIssue = async (key, changes) => { writes++; captured = { key, ...changes }; return { version: 2 }; };
  const pending = scope.updateIssue(input); input.issueId = 'other'; input.changes.summary = 'spoof';
  assert.deepEqual(await pending, { version: 2 });
  assert.deepEqual(captured, { key: 'ABC-1', expectedVersion: 1, summary: 'new' });
});

test('current workspace requires one live unarchived owner and active selected-board binding', async () => {
  const f = await prepareScope(), current = (sid = 'session-1', signal = undefined) => f.service.currentWorkspace({ sessionId: sid, signal });
  assert.deepEqual(await current(), { workspaceId: 'ws', boardIds: ['1'] });
  await rejected(current('unknown'), 'workspace_not_found');
  f.registry.get('ws2').sessionIds.push('session-1');
  await rejected(current(), 'workspace_ambiguous');
  f.registry.get('ws2').archivedSessionIds = ['session-1'];
  assert.deepEqual(await current(), { workspaceId: 'ws', boardIds: ['1'] });
  f.registry.archivedSessionIds.push('session-1');
  await rejected(current(), 'workspace_not_found');
  f.registry.archivedSessionIds = [];
  f.registry.get('ws2').sessionIds = ['session-2'];
  f.registry.get('ws').archivedSessionIds = ['session-1'];
  await rejected(current(), 'workspace_not_found');
  f.registry.get('ws').archivedSessionIds = [];
  f.registry.get('ws').id = '../bad'; await rejected(current(), 'unavailable');
  f.registry.get('ws').id = 'ws'; f.registry.get('ws').createdAt = ''; await rejected(current(), 'unavailable');
  f.registry.get('ws').createdAt = 'one';
  const fresh = createTrackerService({ settings: f.settings, tracker: f.tracker, workspaceRegistry: f.registry });
  await rejected(fresh.currentWorkspace({ sessionId: 'session-1', signal: undefined }), 'needs_reselect');
  await fresh.close(); await f.service.close();
});

test('current workspace re-resolves uniqueness and immutable incarnation after authorization', async () => {
  for (const change of ['multiple', 'moved', 'incarnation', 'removed', 'archived', 'identity', 'abort', 'close']) {
    const f = await prepareScope(), ac = new AbortController();
    let release, started;
    const ready = new Promise(resolve => { started = resolve; });
    const open = f.tracker.openSession;
    f.tracker.openSession = async function () { started(); await new Promise(resolve => { release = resolve; }); return open.call(this); };
    const pending = f.service.currentWorkspace({ sessionId: 'session-1', signal: ac.signal });
    await ready;
    if (change === 'multiple') f.registry.get('ws2').sessionIds.push('session-1');
    if (change === 'moved') { f.registry.get('ws').sessionIds = []; f.registry.get('ws2').sessionIds.push('session-1'); }
    if (change === 'incarnation') f.registry.get('ws').createdAt = 'new';
    if (change === 'removed') f.registry.get('ws').sessionIds = [];
    if (change === 'archived') f.registry.archivedSessionIds.push('session-1');
    if (change === 'identity') f.tracker.identity = 'rotated';
    if (change === 'abort') ac.abort();
    if (change === 'close') void f.service.close();
    release();
    await assert.rejects(pending, error => ['workspace_ambiguous', 'workspace_not_found', 'needs_reselect', 'session_not_in_workspace', 'aborted', 'unavailable'].includes(error.code), change);
    await f.service.close();
  }
});

test('explicit creation queues are exact, independently approved, and never imply board membership', async () => {
  const f = await prepareScope(), scope = scopeFor(f), calls = []; let writes = 0;
  f.tracker.getBoardCreationQueue = async () => { throw Object.assign(new Error('private'), { name: 'TrackerError', code: 'board_default_queue_unavailable' }); };
  f.tracker.getExplicitCreationQueue = async (board, key, { signal }) => {
    calls.push([board, key]); signal.throwIfAborted();
    return Object.freeze({ id: '8', key, display: 'Other queue' });
  };
  f.tracker.createIssue = async ({ queue }) => { writes++; assert.equal(queue.key, 'OTHER'); return { id: 'i', key: 'OTHER-1', version: 1 }; };
  await rejected(scope.previewCreate({ boardId: '1' }), 'board_default_queue_unavailable');
  const preview = await scope.previewCreate({ boardId: '1', queueKey: 'OTHER' });
  assert.deepEqual(preview, { queue: { id: '8', key: 'OTHER', display: 'Other queue' } });
  await rejected(scope.createIssue({ boardId: '1', queueKey: 'DOC', expectedQueue: preview.queue, summary: 'Task' }), 'conflict');
  await rejected(scope.previewCreate({ boardId: '2', queueKey: 'OTHER' }), 'board_not_selected');
  for (const key of ['', 'other', '../OTHER', undefined, null]) await rejected(scope.previewCreate({ boardId: '1', queueKey: key }), 'invalid');
  assert.deepEqual(await scope.createIssue({ boardId: '1', queueKey: 'OTHER', expectedQueue: preview.queue, summary: 'Task' }), { id: 'i', key: 'OTHER-1', version: 1 });
  assert.deepEqual(calls, [['1', 'OTHER'], ['1', 'OTHER']]); assert.equal(writes, 1);
  f.tracker.getExplicitCreationQueue = async () => Object.freeze({ id: '9', key: 'OTHER', display: 'Other queue' });
  await rejected(scope.createIssue({ boardId: '1', queueKey: 'OTHER', expectedQueue: preview.queue, summary: 'Task' }), 'conflict');
  f.tracker.getExplicitCreationQueue = async () => Object.freeze({ id: '8', key: 'WRONG' });
  await rejected(scope.previewCreate({ boardId: '1', queueKey: 'OTHER' }), 'invalid_tracker_response');
  assert.equal(writes, 1); await f.service.close();
});

const createQueue = Object.freeze({ id: '3', key: 'DOC', display: 'Documents' });
const createInput = (overrides = {}) => ({ boardId: '1', expectedQueue: { ...createQueue }, summary: 'Original', description: 'Details\nmore', ...overrides });

test('explicit creation checks revocation while fetching the queue and never writes', async () => {
  for (const change of ['identity', 'principal', 'revision', 'incarnation', 'archived', 'removed', 'abort', 'close']) {
    const links = linkStore(), control = { scope: 'a'.repeat(64) };
    const f = fixture({ links, resolveAccountScope: async () => control.scope });
    await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
    const ac = new AbortController(), scope = scopeFor(f, { signal: ac.signal }); let writes = 0, started, release;
    const ready = new Promise(resolve => { started = resolve; });
    f.tracker.getExplicitCreationQueue = () => new Promise(resolve => { release = () => resolve(Object.freeze({ id: '8', key: 'OTHER' })); started(); });
    f.tracker.createIssue = async () => { writes++; return { id: 'i', key: 'OTHER-1', version: 1 }; };
    const pending = scope.createIssue({ boardId: '1', queueKey: 'OTHER', expectedQueue: { id: '8', key: 'OTHER' }, summary: 'Task' });
    await ready;
    if (change === 'identity') f.tracker.identity = 'other';
    if (change === 'principal') control.scope = 'b'.repeat(64);
    if (change === 'revision') { const state = f.settings.read(); f.settings.compareAndSet(state.revision, state.settings); }
    if (change === 'incarnation') f.registry.get('ws').createdAt = 'new';
    if (change === 'archived') f.registry.archivedSessionIds.push('session-1');
    if (change === 'removed') f.registry.get('ws').sessionIds = [];
    if (change === 'abort') ac.abort();
    if (change === 'close') void f.service.close();
    release();
    await assert.rejects(pending, e => ['needs_reselect', 'session_not_in_workspace', 'aborted', 'unavailable'].includes(e.code), change);
    assert.equal(writes, 0, change); await f.service.close();
  }
});

test('creation preview and write authorize board and copy exact inputs', async () => {
  const f = await prepareScope(), scope = scopeFor(f); let queueCalls = 0, writes = 0, captured;
  f.tracker.getBoardCreationQueue = async id => { queueCalls++; assert.equal(id, '1'); return createQueue; };
  f.tracker.createIssue = async payload => { writes++; captured = payload; return { id: 'i-1', key: 'DOC-1', version: 2, secret: 'hidden' }; };
  const previewInput = { boardId: '1' }, previewPending = scope.previewCreate(previewInput);
  previewInput.boardId = '2';
  const preview = await previewPending;
  assert.deepEqual(preview, { queue: createQueue });
  assert.notEqual(preview.queue, createQueue);
  assert.ok(Object.isFrozen(preview.queue));
  const input = createInput(), pending = scope.createIssue(input);
  input.boardId = '2'; input.expectedQueue.key = 'EVIL'; input.summary = 'spoof'; input.description = 'spoof';
  assert.deepEqual(await pending, { id: 'i-1', key: 'DOC-1', version: 2 });
  assert.equal(captured.queue, createQueue);
  assert.deepEqual({ ...captured, queue: { ...captured.queue } }, { queue: createQueue, summary: 'Original', description: 'Details\nmore' });
  assert.equal(queueCalls, 2); assert.equal(writes, 1);
  await rejected(scope.previewCreate({ boardId: '2' }), 'board_not_selected');
  await rejected(scope.createIssue(createInput({ boardId: '2' })), 'board_not_selected');
  assert.equal(queueCalls, 2); assert.equal(writes, 1);
});

test('creation rejects malformed input and unsafe queue evidence without writes', async () => {
  const f = await prepareScope(), scope = scopeFor(f); let writes = 0;
  f.tracker.createIssue = async () => { writes++; return { id: 'i', key: 'DOC-1', version: 1 }; };
  const accessor = { id: '3', key: 'DOC' }; Object.defineProperty(accessor, 'display', { enumerable: true, get() { throw Error('secret'); } });
  for (const expectedQueue of [null, {}, { id: '03', key: 'DOC' }, { id: '9007199254740992', key: 'DOC' }, { id: '3', key: 'doc' }, { id: '3', key: 'DOC', display: '' }, { ...createQueue, display: 'bad\u0000' }, { ...createQueue, extra: 'x' }, accessor])
    await rejected(scope.createIssue(createInput({ expectedQueue })), 'invalid');
  for (const overrides of [{ boardId: '01' }, { summary: '' }, { summary: 'a'.repeat(4097) }, { summary: 'bad\n' }, { description: 'bad\u0000' }, { description: 'a'.repeat(48 * 1024 + 1) }, { status: 'open' }, { queue: 'EVIL' }, { workspaceId: 'ws2' }, { sessionId: 'foreign' }, { accountScope: 'a'.repeat(64) }])
    await rejected(scope.createIssue(createInput(overrides)), 'invalid');
  await rejected(scope.previewCreate({ boardId: '1', queue: 'EVIL' }), 'invalid');
  for (const queue of [null, {}, { id: '03', key: 'DOC' }, { id: '3', key: 'doc' }, { ...createQueue, display: '' }, { ...createQueue, extra: 'secret' }, accessor, { ...createQueue }]) {
    f.tracker.getBoardCreationQueue = async () => queue;
    await rejected(scope.previewCreate({ boardId: '1' }), 'invalid_tracker_response');
    await rejected(scope.createIssue(createInput()), 'invalid_tracker_response');
  }
  assert.equal(writes, 0);
});

test('creation compares queue id key and display after approval', async () => {
  const f = await prepareScope(), scope = scopeFor(f); let writes = 0;
  f.tracker.createIssue = async () => { writes++; return { id: 'i', key: 'DOC-1', version: 1 }; };
  const preview = await scope.previewCreate({ boardId: '1' });
  for (const changed of [{ ...createQueue, id: '4' }, { ...createQueue, key: 'OTHER' }, { ...createQueue, display: 'Other' }, { id: '3', key: 'DOC' }]) {
    f.tracker.getBoardCreationQueue = async () => Object.freeze(changed);
    await rejected(scope.createIssue(createInput({ expectedQueue: preview.queue })), 'conflict');
  }
  f.tracker.getBoardCreationQueue = async () => Object.freeze({ id: '3', key: 'DOC' });
  const withoutDisplay = await scope.previewCreate({ boardId: '1' });
  assert.deepEqual(withoutDisplay, { queue: { id: '3', key: 'DOC' } });
  f.tracker.getBoardCreationQueue = async () => createQueue;
  await rejected(scope.createIssue(createInput({ expectedQueue: withoutDisplay.queue })), 'conflict');
  assert.equal(writes, 0);
});

test('creation rechecks session account and workspace during queue reads', async () => {
  for (const op of ['preview', 'create']) for (const change of ['identity', 'principal', 'revision', 'incarnation', 'removed', 'archived', 'abort']) {
    const links = linkStore(), control = { scope: 'a'.repeat(64) };
    const f = fixture({ links, resolveAccountScope: async () => control.scope });
    await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
    const controller = new AbortController(), scope = scopeFor(f, { signal: controller.signal });
    let started, release, writes = 0;
    const ready = new Promise(resolve => { started = resolve; });
    f.tracker.getBoardCreationQueue = () => new Promise(resolve => { release = () => resolve(createQueue); started(); });
    f.tracker.createIssue = async () => { writes++; return { id: 'i', key: 'DOC-1', version: 1 }; };
    const pending = op === 'preview' ? scope.previewCreate({ boardId: '1' }) : scope.createIssue(createInput());
    await ready;
    if (change === 'identity') f.tracker.identity = 'rotated';
    if (change === 'principal') control.scope = 'b'.repeat(64);
    if (change === 'revision') { const s = f.settings.read(); f.settings.compareAndSet(s.revision, s.settings); }
    if (change === 'incarnation') f.registry.get('ws').createdAt = 'new';
    if (change === 'removed') f.registry.get('ws').sessionIds = [];
    if (change === 'archived') f.registry.archivedSessionIds.push('session-1');
    if (change === 'abort') controller.abort();
    release();
    await assert.rejects(pending, error => ['needs_reselect', 'session_not_in_workspace', 'aborted'].includes(error.code), `${op}: ${change}`);
    assert.equal(writes, 0, `${op}: ${change}`);
  }
});

test('creation fails closed when authorization changes between preview and write', async () => {
  for (const change of ['identity', 'principal', 'revision', 'incarnation', 'removed', 'archived', 'abort']) {
    const links = linkStore(), control = { scope: 'a'.repeat(64) };
    const f = fixture({ links, resolveAccountScope: async () => control.scope });
    await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
    const controller = new AbortController(), scope = scopeFor(f, { signal: controller.signal });
    const { queue } = await scope.previewCreate({ boardId: '1' }); let writes = 0;
    f.tracker.createIssue = async () => { writes++; return { id: 'i', key: 'DOC-1', version: 1 }; };
    if (change === 'identity') f.tracker.identity = 'rotated';
    if (change === 'principal') control.scope = 'b'.repeat(64);
    if (change === 'revision') { const s = f.settings.read(); f.settings.compareAndSet(s.revision, s.settings); }
    if (change === 'incarnation') f.registry.get('ws').createdAt = 'new';
    if (change === 'removed') f.registry.get('ws').sessionIds = [];
    if (change === 'archived') f.registry.archivedSessionIds.push('session-1');
    if (change === 'abort') controller.abort();
    await assert.rejects(scope.createIssue(createInput({ expectedQueue: queue })), error => ['needs_reselect', 'session_not_in_workspace', 'aborted'].includes(error.code), change);
    assert.equal(writes, 0, change);
  }
});

test('creation post-dispatch ambiguity is sanitized and never retried', async () => {
  for (const mode of ['network', 'timeout', 'malformed', 'wrong-key', 'identity', 'principal', 'incarnation', 'removed', 'abort', 'known', 'known-rotated']) {
    const links = linkStore(), control = { scope: 'a'.repeat(64) };
    const f = fixture({ links, resolveAccountScope: async () => control.scope });
    await config(f.service); await f.service.command({ op: 'boards.list' }); await select(f.service);
    const controller = new AbortController(), scope = scopeFor(f, { signal: controller.signal }); let writes = 0;
    f.tracker.createIssue = async () => {
      writes++;
      if (mode === 'identity' || mode === 'known-rotated') f.tracker.identity = 'other';
      if (mode === 'principal') control.scope = 'b'.repeat(64);
      if (mode === 'incarnation') f.registry.get('ws').createdAt = 'new';
      if (mode === 'removed') f.registry.get('ws').sessionIds = [];
      if (mode === 'abort') { controller.abort(); return new Promise(() => {}); }
      if (mode === 'network' || mode === 'timeout' || mode === 'known' || mode === 'known-rotated')
        throw Object.assign(new Error('SECRET https://private'), { name: 'TrackerError', code: mode.startsWith('known') ? 'forbidden' : mode === 'network' ? 'network_error' : 'timeout' });
      if (mode === 'malformed') return { id: '../secret', key: 'DOC-1', version: 1 };
      return { id: 'i', key: mode === 'wrong-key' ? 'EVIL-1' : 'DOC-1', version: 1 };
    };
    await assert.rejects(scope.createIssue(createInput()), error => {
      assert.equal(error.code, mode === 'known' ? 'forbidden' : 'outcome_unknown', mode);
      assert.doesNotMatch(String(error), /SECRET|private|identity|a{64}|b{64}/); return true;
    });
    assert.equal(writes, 1, mode);
  }
});

test('creation checks its exact second selected board and handles absent description', async () => {
  const f = await prepareScope();
  await f.service.command({ op: 'boards.list' }); await select(f.service, 2, ['1', '2']);
  const scope = scopeFor(f), boards = []; let payload;
  f.tracker.getBoardCreationQueue = async id => { boards.push(id); return Object.freeze({ id: '8', key: 'ALT' }); };
  f.tracker.createIssue = async value => { payload = value; return { id: 'i-2', key: 'ALT-2', version: 0 }; };
  const { queue } = await scope.previewCreate({ boardId: '2' });
  assert.deepEqual(await scope.createIssue({ boardId: '2', expectedQueue: queue, summary: 'Task' }), { id: 'i-2', key: 'ALT-2', version: 0 });
  assert.deepEqual(boards, ['2', '2']);
  assert.deepEqual(payload, { queue: { id: '8', key: 'ALT' }, summary: 'Task' });
});

test('creation post-dispatch abort and revocation cannot claim definite failure', async () => {
  for (const mode of ['abort', 'close', 'revision', 'archived']) {
    const f = await prepareScope(), controller = new AbortController(), scope = scopeFor(f, { signal: controller.signal });
    let started, release, writes = 0;
    const ready = new Promise(resolve => { started = resolve; });
    f.tracker.createIssue = () => { writes++; return new Promise(resolve => { release = () => resolve({ id: 'i', key: 'DOC-1', version: 1 }); started(); }); };
    const pending = scope.createIssue(createInput()); await ready;
    if (mode === 'abort') controller.abort();
    if (mode === 'close') void f.service.close();
    if (mode === 'revision') { const s = f.settings.read(); f.settings.compareAndSet(s.revision, s.settings); }
    if (mode === 'archived') f.registry.archivedSessionIds.push('session-1');
    release(); await rejected(pending, 'outcome_unknown'); assert.equal(writes, 1);
    if (mode === 'close') await f.service.close();
  }
});

test('creation checks real API transport has no retry on ambiguous POST', async () => {
  const f = fixture(), calls = [];
  const tracker = createTrackerClient({
    getCredentials: async () => ({ token: 'LOCAL_FAKE_TOKEN', tokenType: 'OAuth', orgId: 'fake_org', orgType: 'org' }),
    fetch: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.includes('/boards/_paginate')) return new Response(JSON.stringify([{ id: '1', name: 'First' }]));
      if (url.endsWith('/boards/1')) return new Response(JSON.stringify({ id: '1', defaultQueue: createQueue }));
      if (init.method === 'POST') throw Error('SECRET synthetic transport failed');
      throw Error('unexpected synthetic route');
    },
  });
  const service = createTrackerService({ settings: f.settings, tracker, workspaceRegistry: f.registry });
  await config(service); await service.command({ op: 'boards.list' }); await select(service);
  const scope = service.toolScope({ workspaceId: 'ws', sessionId: 'session-1', signal: undefined });
  await assert.rejects(scope.createIssue(createInput()), e => e.code === 'outcome_unknown' && !String(e).includes('SECRET'));
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
});

test('creation uses same-session API capability and a single synthetic POST', async () => {
  const f = fixture(), calls = [];
  const tracker = createTrackerClient({
    getCredentials: async () => ({ token: 'LOCAL_FAKE_TOKEN', tokenType: 'OAuth', orgId: 'fake_org', orgType: 'org' }),
    fetch: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (url.includes('/boards/_paginate')) return new Response(JSON.stringify([{ id: '1', name: 'First' }]));
      if (url.endsWith('/boards/1')) return new Response(JSON.stringify({ id: '1', name: 'First', defaultQueue: { ...createQueue } }));
      if (url.endsWith('/issues?notify=false') && init.method === 'POST') return new Response(JSON.stringify({ id: 'i-1', key: 'DOC-1', version: 1 }), { status: 201 });
      throw Error('unexpected synthetic route');
    },
  });
  const service = createTrackerService({ settings: f.settings, tracker, workspaceRegistry: f.registry });
  await config(service); await service.command({ op: 'boards.list' }); await select(service);
  const scope = service.toolScope({ workspaceId: 'ws', sessionId: 'session-1', signal: undefined });
  const { queue } = await scope.previewCreate({ boardId: '1' });
  assert.deepEqual(await scope.createIssue(createInput({ expectedQueue: queue })), { id: 'i-1', key: 'DOC-1', version: 1 });
  assert.deepEqual(calls.map(c => c.method), ['GET', 'GET', 'GET', 'POST']);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { queue: 3, summary: 'Original', description: 'Details\nmore' });
  assert.doesNotMatch(JSON.stringify(calls), /LOCAL_FAKE_TOKEN|fake_org/);
});

const editCommand = (overrides = {}) => ({ op: 'issue.editComment', workspaceId: 'ws', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1', commentId: '1', expectedVersion: 1, text: 'Edited\ntext', ...overrides });

test('owner edits existing comment after fresh baseline and issue checks', async () => {
  const f = await prepareScope(), events = [];
  const original = f.tracker.getIssue;
  f.tracker.getIssue = async key => { events.push('issue'); return original(key); };
  f.tracker.getComment = async (key, id) => { events.push('baseline'); assert.equal(key, 'ABC-1'); return { id, version: 1 }; };
  f.tracker.editComment = async (key, value) => { events.push('patch'); assert.equal(key, 'ABC-1'); assert.deepEqual(value, { id: '1', text: 'Edited\ntext' }); return { id: '1', version: 2, secret: 'hidden' }; };
  assert.deepEqual(await f.service.command(editCommand()), { id: '1', version: 2 });
  assert.deepEqual(events, ['issue', 'baseline', 'issue', 'patch']);
  assert.equal(scopeFor(f).editComment, undefined);
});

test('owner comment edit rejects stale version, invalid input and membership changes', async () => {
  const f = await prepareScope(); let patches = 0;
  f.tracker.editComment = async () => { patches++; return { id: '1', version: 2 }; };
  f.tracker.getComment = async () => ({ id: '1', version: 2 });
  await rejected(f.service.command(editCommand()), 'conflict');
  f.tracker.getComment = async () => ({ id: 'wrong', version: 1 });
  await rejected(f.service.command(editCommand()), 'invalid_tracker_response');
  for (const overrides of [{ commentId: '../x' }, { commentId: '1?x' }, { expectedVersion: -1 }, { expectedVersion: '1' }, { text: '' }, { text: 'x'.repeat(48 * 1024 + 1) }, { issueKey: 'ABC-1/x' }, { extra: true }])
    await rejected(f.service.command(editCommand(overrides)), 'invalid');
  f.tracker.getComment = async () => ({ id: '1', version: 1 });
  await rejected(f.service.command(editCommand({ issueId: 'other' })), 'conflict');
  await rejected(f.service.command(editCommand({ boardId: '2' })), 'board_not_selected');
  const original = f.tracker.getIssue; let reads = 0;
  f.tracker.getIssue = async key => ({ ...(await original(key)), ...(++reads === 2 ? { id: 'other' } : {}) });
  await rejected(f.service.command(editCommand()), 'conflict');
  reads = 0;
  f.tracker.getIssue = async key => ({ ...(await original(key)), ...(++reads === 2 ? { boards: [{ id: '2' }] } : {}) });
  await rejected(f.service.command(editCommand()), 'issue_not_in_selected_boards');
  assert.equal(patches, 0);
});

test('owner comment edit unknown result and cancellation do not retry', async () => {
  for (const mode of ['error', 'malformed', 'abort']) {
    const f = await prepareScope(), ac = new AbortController(); let patches = 0;
    f.tracker.editComment = async () => {
      patches++;
      if (mode === 'error') throw Object.assign(new Error('private'), { name: 'TrackerError', code: 'outcome_unknown' });
      if (mode === 'abort') { ac.abort(); return new Promise(() => {}); }
      return { id: 'wrong', version: 2 };
    };
    const result = await body(await post(f.service, editCommand(), { signal: ac.signal }));
    assert.deepEqual(result, { status: 502, value: { error: { code: 'outcome_unknown' } } });
    assert.equal(patches, 1);
  }
});

test('owner comment pagination uses only synthetic Tracker GET requests', async () => {
  const f = fixture(), calls = [];
  const tracker = createTrackerClient({
    getCredentials: async () => ({ token: 'LOCAL_FAKE_TOKEN', tokenType: 'OAuth', orgId: 'fake_org', orgType: 'org' }),
    fetch: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (url.includes('/boards/_paginate')) return new Response(JSON.stringify([{ id: '1', name: 'First' }]));
      if (url.includes('/issues/ABC-1?')) return new Response(JSON.stringify({ key: 'ABC-1', id: 'id-1', summary: 'Example', description: '', status: { id: '1', key: 'open', display: 'Open' }, assignee: null, boards: [{ id: '1' }], version: 1 }));
      if (url.includes('/issues/ABC-1/comments?')) {
        const next = new URL(url).searchParams.has('id');
        return new Response(JSON.stringify([{ ...testComment(next ? '2' : '1') }]), { headers: next ? {} : { link: '<https://api.tracker.yandex.net/v3/issues/ABC-1/comments?perPage=100&id=1>; rel="next"' } });
      }
      throw Error('unexpected synthetic route');
    },
  });
  const service = createTrackerService({ settings: f.settings, tracker, workspaceRegistry: f.registry });
  await config(service); await service.command({ op: 'boards.list' }); await select(service);
  assert.deepEqual(await service.command(commentsCommand()), { comments: [testComment('1')], complete: false, nextCursor: '1' });
  assert.deepEqual(await service.command(commentsCommand({ cursor: '1' })), { comments: [testComment('2')], complete: false, nextCursor: null });
  const reads = calls.filter(call => call.url.includes('/comments?'));
  assert.equal(reads.length, 2); assert.equal(new URL(reads[0].url).searchParams.has('id'), false);
  assert.equal(new URL(reads[1].url).searchParams.get('id'), '1');
  assert.ok(calls.every(call => call.method === 'GET' && call.body === undefined));
});

test('comment edit integrates service and API through synthetic transport only', async () => {
  const f = fixture(), calls = [];
  const tracker = createTrackerClient({
    getCredentials: async () => ({ token: 'LOCAL_FAKE_TOKEN', tokenType: 'OAuth', orgId: 'fake_org', orgType: 'org' }),
    fetch: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      let value;
      if (url.endsWith('/boards/_paginate?perPage=100')) value = [{ id: '1', name: 'First' }];
      else if (url.includes('/issues/ABC-1?')) value = { key: 'ABC-1', id: 'id-1', summary: 'Example', description: '', status: { id: '1', key: 'open', display: 'Open' }, assignee: null, boards: [{ id: '1' }], version: 1 };
      else if (url.endsWith('/issues/ABC-1/comments/1') && init.method === 'GET') value = { id: 1, version: 1 };
      else if (url.endsWith('/issues/ABC-1/comments/1') && init.method === 'PATCH') value = { id: 1, version: 2 };
      else throw Error('unexpected fake route');
      return new Response(JSON.stringify(value), { status: 200 });
    },
  });
  const service = createTrackerService({ settings: f.settings, tracker, workspaceRegistry: f.registry });
  await config(service); await service.command({ op: 'boards.list' }); await select(service);
  assert.deepEqual(await service.command(editCommand()), { id: '1', version: 2 });
  assert.deepEqual(calls.map(c => c.method), ['GET', 'GET', 'GET', 'GET', 'PATCH']);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { text: 'Edited\ntext' });
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
