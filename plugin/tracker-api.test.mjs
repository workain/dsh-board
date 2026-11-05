import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackerClient, TrackerError } from './tracker-api.mjs';

const credentials = { token: 'synthetic-token', tokenType: 'OAuth', orgId: 'synthetic-org', orgType: 'org' };
const makeBoard = id => ({ self: 'https://evil.invalid/private', id, name: `Board ${id}`, columns: [{ id: '1', display: 'Open' }] });
const makeColumns = () => [{ id: 1, name: 'Open', statuses: [{ id: '1', key: 'open', display: 'Open', self: 'https://evil.invalid' }] }];
const makeIssue = (key, boards) => ({ key, summary: 'Synthetic issue', status: { id: '1', key: 'open', display: 'Open' }, boards });
function json(value, status = 200, headers = {}) { return new Response(JSON.stringify(value), { status, headers }); }
function harness(results, creds = credentials) {
  const calls = [];
  const client = createTrackerClient({ getCredentials: () => creds, fetch: async (url, init) => {
    calls.push({ url, init });
    assert.ok(results.length, 'unexpected request');
    const result = results.shift();
    return typeof result === 'function' ? result(url, init) : result;
  } });
  return { client, calls };
}
const rejects = (promise, code) => assert.rejects(promise, error => error instanceof TrackerError && error.code === code && error.message === `Tracker: ${code}`);

test('pagination uses only last numeric board id and ignores attacker links', async () => {
  const first = Array.from({ length: 100 }, (_, i) => makeBoard(i + 1));
  const { client, calls } = harness([json(first), json([makeBoard(101)])]);
  const result = await client.listBoards();
  assert.equal(result.complete, true); assert.equal(result.boards.length, 101);
  assert.deepEqual(result.boards[0], { id: '1', name: 'Board 1' });
  assert.equal(calls[0].url, 'https://api.tracker.yandex.net/v3/boards/_paginate?perPage=100');
  assert.equal(calls[1].url, 'https://api.tracker.yandex.net/v3/boards/_paginate?perPage=100&id=100');
  for (const c of calls) { assert.equal(c.init.method, 'GET'); assert.equal(c.init.redirect, 'error'); }
  assert.doesNotMatch(JSON.stringify(result), /synthetic-token|synthetic-org|evil\.invalid/);
});

test('page limit is explicit and repeated/out-of-order pages fail closed', async () => {
  const pages = Array.from({ length: 5 }, (_, page) => json(Array.from({ length: 100 }, (_, i) => makeBoard(page * 100 + i + 1))));
  const result = await harness(pages).client.listBoards();
  assert.equal(result.complete, false); assert.equal(result.reason, 'page_limit'); assert.equal(result.boards.length, 500);
  await rejects(harness([json(Array.from({ length: 100 }, (_, i) => makeBoard(i + 1))), json([makeBoard(100)])]).client.listBoards(), 'invalid_response');
});

test('real board and column shapes, unsupported issue listing without keys', async () => {
  const { client, calls } = harness([json(makeBoard(42)), json(makeColumns())]);
  const result = await client.getBoardOverview('42');
  assert.deepEqual(result.board, { id: '42', name: 'Board 42' });
  assert.deepEqual(result.columns, [{ id: '1', name: 'Open', statuses: [{ id: '1', key: 'open', display: 'Open' }] }]);
  assert.equal(result.issuesComplete, false); assert.equal(result.issuesReason, 'board_search_unsupported');
  assert.equal(calls.length, 2);
});

test('explicit keys use closed search, verify exact membership and track uncertainty', async () => {
  const { client, calls } = harness([json(makeBoard(42)), json(makeColumns()), json([
    makeIssue('TEST-1', [{ id: '42', display: 'not trusted', self: 'https://evil.invalid' }]),
    makeIssue('TEST-2', [{ id: '142' }]),
    makeIssue('TEST-3', undefined),
  ])]);
  const result = await client.getBoardOverview(42, { issueKeys: ['TEST-1', 'TEST-2', 'TEST-3', 'TEST-4'] });
  assert.deepEqual(result.issues.map(i => i.key), ['TEST-1']);
  assert.deepEqual(result.uncertainKeys, ['TEST-3']); assert.deepEqual(result.missingKeys, ['TEST-4']);
  assert.equal(result.issuesComplete, false); assert.equal(result.issuesReason, 'explicit_keys_only');
  const search = calls[2]; const url = new URL(search.url);
  assert.equal(url.origin, 'https://api.tracker.yandex.net'); assert.equal(url.pathname, '/v3/issues/_search');
  assert.equal(url.searchParams.get('fields'), 'key,summary,status,boards,assignee');
  assert.deepEqual(JSON.parse(search.init.body), { keys: ['TEST-1', 'TEST-2', 'TEST-3', 'TEST-4'] });
  assert.equal(search.init.method, 'POST'); assert.equal(search.init.redirect, 'error');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-token|synthetic-org|evil\.invalid/);
});

test('assignee projection distinguishes unknown, unassigned and stable identities', async () => {
  const rows = [
    makeIssue('TEST-1', [{ id: 42 }]),
    { ...makeIssue('TEST-2', [{ id: 42 }]), assignee: null },
    { ...makeIssue('TEST-3', [{ id: 42 }]), assignee: { id: 'user-1', display: 'Same name', email: 'private@example.invalid', self: 'https://evil.invalid' } },
    { ...makeIssue('TEST-4', [{ id: 42 }]), assignee: { id: 'user-2', display: 'Same name' } },
    ...[{}, { id: '', display: 'Name' }, { id: '1', display: '' }, { id: '1', display: 'Bad\nName' },
      { id: '1', display: '\u202espoof' }, { id: 'x'.repeat(129), display: 'Name' }, 'user', []]
      .map((value, i) => ({ ...makeIssue(`TEST-${i + 5}`, [{ id: 42 }]), assignee: value })),
  ];
  const { client, calls } = harness([json(makeBoard(42)), json(makeColumns()), json(rows)]);
  const result = await client.getBoardOverview(42, { searchByBoard: true });
  const projected = result.issues.map(({ assigneeKnown, assignee }) => ({ assigneeKnown, assignee }));
  assert.deepEqual(projected.slice(0, 4), [
    { assigneeKnown: false, assignee: null }, { assigneeKnown: true, assignee: null },
    { assigneeKnown: true, assignee: { id: 'user-1', display: 'Same name' } },
    { assigneeKnown: true, assignee: { id: 'user-2', display: 'Same name' } },
  ]);
  assert.ok(projected.slice(4).every(value => !value.assigneeKnown && value.assignee === null));
  assert.doesNotMatch(JSON.stringify(result), /private@example\.invalid|evil\.invalid/);
  assert.equal(new URL(calls[2].url).searchParams.get('fields'), 'key,summary,status,boards,assignee');
});

test('all input paths and key search are closed to injection', async () => {
  const { client, calls } = harness([]);
  for (const id of ['1/columns', '../', '1?evil', '01', '0', '1\n', '9007199254740992', -1]) await rejects(client.getBoardOverview(id), 'invalid_input');
  for (const keys of [['TEST-1 OR Queue:TEST'], ['TEST-1', 'TEST-1'], ['__proto__'], Array(101).fill('TEST-1')]) await rejects(client.getBoardOverview('1', { issueKeys: keys }), 'invalid_input');
  assert.equal(calls.length, 0);
});

test('malformed board, columns, returned issues and membership fail safely', async () => {
  await rejects(harness([json(makeBoard(2))]).client.getBoardOverview(1), 'invalid_response');
  await rejects(harness([json(makeBoard(1)), json([{ id: 1, name: 'A', statuses: {} }])]).client.getBoardOverview(1), 'invalid_response');
  await rejects(harness([json(makeBoard(1)), json(makeColumns()), json([makeIssue('OTHER-1', [{ id: 1 }])])]).client.getBoardOverview(1, { issueKeys: ['TEST-1'] }), 'invalid_response');
  const { client } = harness([json(makeBoard(1)), json(makeColumns()), json([makeIssue('TEST-1', [{ id: '1/../2' }])])]);
  assert.deepEqual((await client.getBoardOverview(1, { issueKeys: ['TEST-1'] })).uncertainKeys, ['TEST-1']);
  await rejects(harness([json([{ id: 1, name: 'evil\nheading' }])]).client.listBoards(), 'invalid_response');
});

test('HTTP, fetch, credential and parsing errors never expose secrets', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [429, 'rate_limited'], [302, 'redirect'], [500, 'http_error']]) {
    await rejects(harness([new Response('synthetic-token synthetic-org', { status })]).client.listBoards(), code);
  }
  await rejects(harness([() => { throw new Error('synthetic-token synthetic-org'); }]).client.listBoards(), 'network_error');
  await rejects(createTrackerClient({ getCredentials() { throw new Error('synthetic-token'); }, fetch() {} }).listBoards(), 'credentials_unavailable');
  await rejects(harness([new Response('{bad synthetic-token')]).client.listBoards(), 'invalid_response');
  await rejects(harness([], { ...credentials, token: 'x\r\nmalicious' }).client.listBoards(), 'invalid_credentials');
});

test('injected stream errors cannot leak custom TrackerError data', async () => {
  const response = { status: 200, headers: new Headers(), body: { getReader() { return {
    read() { throw new TrackerError('synthetic-secret'); }, cancel() {}, releaseLock() {},
  }; } } };
  await rejects(harness([response]).client.listBoards(), 'invalid_response');
  const forged = new TrackerError('invalid_response');
  forged.message = 'synthetic-secret';
  response.body.getReader = () => ({ read() { throw forged; }, cancel() {}, releaseLock() {} });
  await rejects(harness([response]).client.listBoards(), 'invalid_response');
});

test('both documented organization header types are supported', async () => {
  const { client, calls } = harness([json([])], { token: 'synthetic', tokenType: 'Bearer', orgId: 'cloud-id', orgType: 'cloud' });
  await client.listBoards(); assert.equal(calls[0].init.headers.Authorization, 'Bearer synthetic');
  assert.equal(calls[0].init.headers['X-Cloud-Org-ID'], 'cloud-id'); assert.equal(calls[0].init.headers['X-Org-ID'], undefined);
});

test('response size cap checks content length and streamed bytes', async () => {
  await rejects(harness([new Response('[]', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } })]).client.listBoards(), 'response_too_large');
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); controller.close(); } });
  await rejects(harness([new Response(stream)]).client.listBoards(), 'response_too_large');
});

test('cancellation works even when fetch ignores signal', async () => {
  const controller = new AbortController();
  const { client } = harness([() => new Promise(() => {})]);
  const pending = client.listBoards({ signal: controller.signal }); controller.abort();
  await rejects(pending, 'cancelled');
  await rejects(client.listBoards({ signal: controller.signal }), 'cancelled');
});

test('timeout spans credentials, fetch and streaming even when ignored', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const client = createTrackerClient({ getCredentials: () => new Promise(() => {}), fetch: () => { throw new Error('unexpected'); } });
  const pending = client.listBoards();
  const checked = rejects(pending, 'timeout');
  t.mock.timers.tick(10_000); await checked;
});

test('search rate and concurrency enforced per client', async () => {
  let finish;
  const pendingSearch = new Promise(resolve => { finish = resolve; });
  const { client } = harness([json(makeBoard(1)), json(makeColumns()), () => pendingSearch,
    json(makeBoard(1)), json(makeColumns()), json(makeBoard(1)), json(makeColumns())]);
  const first = client.getBoardOverview(1, { issueKeys: ['TEST-1'] });
  await new Promise(resolve => setImmediate(resolve));
  await rejects(client.getBoardOverview(1, { issueKeys: ['TEST-2'] }), 'client_rate_limited');
  finish(json([])); await first;
  await rejects(client.getBoardOverview(1, { issueKeys: ['TEST-3'] }), 'client_rate_limited');
});

test('opt-in board search is closed, approximate and verifies each membership', async () => {
  const { client, calls } = harness([json(makeBoard(42)), json(makeColumns()), json([
    makeIssue('TEST-1', [{ id: '42' }]), makeIssue('TEST-2', [{ id: '142' }]), makeIssue('TEST-3', undefined),
  ])]);
  const result = await client.getBoardOverview(42, { searchByBoard: true });
  assert.deepEqual(result.issues.map(i => i.key), ['TEST-1']);
  assert.deepEqual(result.uncertainKeys, ['TEST-3']);
  assert.equal(result.issuesComplete, false); assert.equal(result.issuesReason, 'membership_mismatch');
  assert.deepEqual(JSON.parse(calls[2].init.body), { filter: { boards: 42 } });
  assert.equal(calls[2].init.method, 'POST'); assert.equal(calls[2].init.redirect, 'error');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-token|synthetic-org|evil\.invalid/);
  const empty = await harness([json(makeBoard(42)), json(makeColumns()), json([])]).client.getBoardOverview(42, { searchByBoard: true });
  assert.equal(empty.issuesComplete, false); assert.equal(empty.issuesReason, 'approximate_board_filter');
  const bad = harness([]);
  await rejects(bad.client.getBoardOverview(42, { searchByBoard: true, issueKeys: ['TEST-1'] }), 'invalid_input');
  await rejects(bad.client.getBoardOverview(42, { searchByBoard: 'true' }), 'invalid_input');
  assert.equal(bad.calls.length, 0);
});

test('board search pages are bounded, rate spaced and partial', async () => {
  const pages = Array.from({ length: 5 }, (_, page) => json(Array.from({ length: 100 }, (_, i) => makeIssue(`TEST-${page * 100 + i + 1}`, [{ id: 1 }]))));
  const timestamps = [];
  const wrapped = pages.map(page => () => { timestamps.push(Date.now()); return page; });
  const { client, calls } = harness([json(makeBoard(1)), json(makeColumns()), ...wrapped]);
  const result = await client.getBoardOverview(1, { searchByBoard: true });
  assert.equal(result.issues.length, 500); assert.equal(result.issuesComplete, false); assert.equal(result.issuesReason, 'page_limit');
  assert.deepEqual(calls.slice(2).map(c => new URL(c.url).searchParams.get('page')), ['1', '2', '3', '4', '5']);
  for (let i = 1; i < timestamps.length; i++) assert.ok(timestamps[i] - timestamps[i - 1] >= 230);
});

test('board search rejects malformed and duplicate keys', async () => {
  for (const issues of [[makeIssue('bad\nkey', [{ id: 1 }])], [makeIssue('TEST-1', [{ id: 1 }]), makeIssue('TEST-1', [{ id: 1 }])]]) {
    await rejects(harness([json(makeBoard(1)), json(makeColumns()), json(issues)]).client.getBoardOverview(1, { searchByBoard: true }), 'invalid_response');
  }
});

test('abort cancels a hanging response reader and completes without waiting on cancel', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull() {}, cancel() { cancelled = true; return new Promise(() => {}); } });
  const controller = new AbortController();
  const { client } = harness([new Response(stream)]);
  const pending = client.listBoards({ signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(); await rejects(pending, 'cancelled'); assert.equal(cancelled, true);
});

test('timeout cancels a hanging stream and early size rejection cancels body', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let timeoutCancelled = false;
  const stream = new ReadableStream({ pull() {}, cancel() { timeoutCancelled = true; } });
  const { client } = harness([new Response(stream)]);
  const pending = client.listBoards(); const checked = rejects(pending, 'timeout');
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(10_000); await checked; assert.equal(timeoutCancelled, true);
  let sizeCancelled = false;
  const oversized = new ReadableStream({ pull() {}, cancel() { sizeCancelled = true; } });
  await rejects(harness([new Response(oversized, { headers: { 'content-length': '2097153' } })]).client.listBoards(), 'response_too_large');
  assert.equal(sizeCancelled, true);
});

test('unbounded empty stream chunks hit a finite read cap', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(0)); }, cancel() { cancelled = true; } });
  await rejects(harness([new Response(stream)]).client.listBoards(), 'response_too_large');
  assert.equal(cancelled, true);
});

test('session snapshots immutable identity for every request, identities detect rotation', async () => {
  const mutable = { ...credentials };
  const seen = [];
  const client = createTrackerClient({ getCredentials: () => mutable, fetch: async (url, init) => {
    seen.push(init.headers.Authorization);
    if (url.endsWith('/columns')) return json(makeColumns());
    return json(makeBoard(1));
  } });
  const first = await client.openSession();
  assert.match(first.identity, /^[a-f0-9]{64}$/);
  assert.equal(await client.identity(), first.identity);
  mutable.token = 'rotated-token';
  const result = await first.getBoardOverview(1);
  assert.equal(result.board.id, '1');
  assert.deepEqual(seen, ['OAuth synthetic-token', 'OAuth synthetic-token']);
  assert.notEqual((await client.openSession()).identity, first.identity);
  assert.doesNotMatch(JSON.stringify({ result, identity: first.identity }), /synthetic-token|synthetic-org|rotated-token/);
  assert.equal(Object.isFrozen(first), true);
});

test('direct operation rejects identity rotation without exposing credential values', async () => {
  let count = 0;
  const client = createTrackerClient({ getCredentials: () => ({ ...credentials, token: count++ ? 'rotated-token' : credentials.token }), fetch: async () => json([]) });
  await rejects(client.listBoards(), 'credential_changed');
});

test('credential resolver and hostile getters cannot leak external TrackerError codes', async () => {
  const secret = 'synthetic-super-secret';
  const getter = createTrackerClient({ getCredentials: () => ({ ...credentials, get token() { throw new TrackerError(secret); } }), fetch: () => {} });
  await rejects(getter.openSession(), 'invalid_credentials');
  const resolver = createTrackerClient({ getCredentials: () => { throw new TrackerError(secret); }, fetch: () => {} });
  await rejects(resolver.openSession(), 'credentials_unavailable');
  const proxy = createTrackerClient({ getCredentials: () => new Proxy(credentials, { get(target, key) { if (key === 'then') return undefined; throw new TrackerError(secret); } }), fetch: () => {} });
  await rejects(proxy.openSession(), 'invalid_credentials');
});

test('sessions reject credential resolution errors, timeout and cancellation safely', async t => {
  let calls = 0;
  const c = createTrackerClient({ getCredentials: () => { calls++; return new Promise(() => {}); }, fetch: () => {} });
  const ac = new AbortController();
  const p = c.openSession({ signal: ac.signal }); ac.abort(); await rejects(p, 'cancelled');
  assert.equal(calls, 0);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = c.openSession(); const checked = rejects(pending, 'timeout');
  t.mock.timers.tick(10_000); await checked;
});

test('issue and transitions use fixed paths and minimal bounded projections', async () => {
  const full = { ...makeIssue('TEST-1', [{ id: 42, self: 'https://evil.invalid' }, { id: '2', name: 'private' }]),
    description: 'First line\n\tSecond line', version: 7, assignee: { id: 'u', display: 'User', email: 'secret@example.invalid' },
    self: 'https://evil.invalid', private: 'do not expose' };
  const { client, calls } = harness([json(full), json([{ id: 'approve_1', display: 'Approve', to: { id: '2', key: 'done', display: 'Done', self: 'https://evil.invalid' }, private: 'secret' }])]);
  const session = await client.openSession();
  assert.deepEqual(await session.getIssue('TEST-1'), { key: 'TEST-1', summary: 'Synthetic issue', description: 'First line\n\tSecond line',
    status: { id: '1', key: 'open', display: 'Open' }, assigneeKnown: true, assignee: { id: 'u', display: 'User' }, boards: [{ id: '42' }, { id: '2' }], version: 7 });
  assert.deepEqual(await session.listTransitions('TEST-1'), [{ id: 'approve_1', display: 'Approve', to: { id: '2', key: 'done', display: 'Done' } }]);
  assert.equal(calls[0].url, 'https://api.tracker.yandex.net/v3/issues/TEST-1?fields=key%2Csummary%2Cdescription%2Cstatus%2Cassignee%2Cboards%2Cversion');
  assert.equal(calls[1].url, 'https://api.tracker.yandex.net/v3/issues/TEST-1/transitions');
  for (const { init } of calls) { assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.body, undefined); }
});

test('issue projection fails closed on malformed data and preserves unknown assignee', async () => {
  const issue = { ...makeIssue('TEST-1', [{ id: 42 }]), description: '', version: 0 };
  for (const patch of [{ key: 'OTHER-1' }, { boards: undefined }, { boards: [{ id: '4/2' }] }, { boards: Array(501).fill({ id: 1 }) },
    { description: 'x'.repeat(48 * 1024 + 1) }, { description: 'bad\u0000text' }, { description: 42 },
    { version: -1 }, { version: '1' }, { status: {} }]) {
    const session = await harness([json({ ...issue, ...patch })]).client.openSession();
    await rejects(session.getIssue('TEST-1'), 'invalid_response');
  }
  const result = await (await harness([json({ ...issue, description: 'x'.repeat(48 * 1024), assignee: { id: 'x' } })]).client.openSession()).getIssue('TEST-1');
  assert.equal(result.description.length, 48 * 1024);
  assert.equal(result.assigneeKnown, false); assert.equal(result.assignee, null);
});

test('documented Tracker response shapes are accepted without leaking extra fields', async () => {
  const issue = { ...makeIssue('TEST-1', [{ id: 42 }]), version: 1 };
  const { client, calls } = harness([json(issue), json({ ...issue, description: null }),
    json([{ id: 'approve', to: { id: '2', key: 'done', display: 'Done', self: 'secret' } }]),
    json({ id: 626, text: 'private' }, 201), json([{ key: 'TEST-1', secret: 'private' }]), json([])]);
  const session = await client.openSession();
  assert.equal((await session.getIssue('TEST-1')).description, '');
  assert.equal((await session.getIssue('TEST-1')).description, '');
  assert.deepEqual(await session.listTransitions('TEST-1'), [{ id: 'approve', display: 'Done', to: { id: '2', key: 'done', display: 'Done' } }]);
  assert.deepEqual(await session.addComment('TEST-1', 'text'), { id: '626' });
  assert.deepEqual(await session.executeTransition('TEST-1', 'approve'), {});
  assert.deepEqual(await session.executeTransition('TEST-1', 'approve'), {});
  assert.equal(calls.length, 6);
  for (const id of [-1, 1.5, 9007199254740992]) {
    const h = harness([json({ id }, 201)]);
    await rejects((await h.client.openSession()).addComment('TEST-1', 'text'), 'outcome_unknown');
    assert.equal(h.calls.length, 1);
  }
});

test('transition projection rejects unsafe ids, malformed fields and excess results', async () => {
  for (const value of [[{ id: '../secret', display: 'Name', to: { id: '1', key: 'x', display: 'X' } }],
    [{ id: 'x', display: 'bad\nname', to: { id: '1', key: 'x', display: 'X' } }], [{ id: 'x', display: 'Name', to: {} }],
    Array(2).fill({ id: 'x', display: 'Name', to: { id: '1', key: 'x', display: 'X' } }), Array(501).fill({}), {}]) {
    await rejects((await harness([json(value)]).client.openSession()).listTransitions('TEST-1'), 'invalid_response');
  }
});

test('writes use fixed endpoints, exact bodies, statuses and sanitized receipts', async () => {
  const { client, calls } = harness([json({ id: 'comment-1', text: 'private', self: 'https://evil.invalid' }, 201), json({ key: 'TEST-1', secret: 'private' })]);
  const session = await client.openSession();
  assert.deepEqual(await session.addComment('TEST-1', 'hello\nworld'), { id: 'comment-1' });
  assert.deepEqual(await session.executeTransition('TEST-1', 'approve_1'), {});
  assert.equal(calls[0].url, 'https://api.tracker.yandex.net/v3/issues/TEST-1/comments?isAddToFollowers=false');
  assert.equal(calls[1].url, 'https://api.tracker.yandex.net/v3/issues/TEST-1/transitions/approve_1/_execute');
  assert.deepEqual(calls.map(c => JSON.parse(c.init.body)), [{ text: 'hello\nworld' }, {}]);
  for (const { init } of calls) { assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.equal(init.headers['Content-Type'], 'application/json'); }
});

test('invalid task keys, transition ids, comments and signals never reach network', async () => {
  const { client, calls } = harness([]); const session = await client.openSession();
  for (const key of ['', 'test-1', 'TEST-0', 'TEST-1/other', 'TEST-1?x=1', 'TEST-1\n', 'A'.repeat(33) + '-1']) {
    await rejects(session.getIssue(key), 'invalid_input'); await rejects(session.listTransitions(key), 'invalid_input');
    await rejects(session.addComment(key, 'text'), 'invalid_input'); await rejects(session.executeTransition(key, 'ok'), 'invalid_input');
  }
  for (const id of ['', '../x', 'a/b', 'a?b', 'https://evil.invalid', 'x'.repeat(129), 3]) await rejects(session.executeTransition('TEST-1', id), 'invalid_input');
  for (const text of ['', '  ', 'x'.repeat(48 * 1024 + 1), 'bad\u0000text', null]) await rejects(session.addComment('TEST-1', text), 'invalid_input');
  await rejects(session.addComment('TEST-1', 'text', { signal: {} }), 'invalid_input');
  assert.equal(calls.length, 0);
});

test('write HTTP errors distinguish explicit rejections and uncertain outcomes', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [409, 'conflict'], [412, 'precondition_failed'], [422, 'unprocessable'], [429, 'rate_limited'], [400, 'outcome_unknown'], [302, 'outcome_unknown'], [500, 'outcome_unknown']]) {
    for (const method of ['addComment', 'executeTransition']) {
      const { client, calls } = harness([new Response('secret', { status })]); const session = await client.openSession();
      await rejects(session[method]('TEST-1', method === 'addComment' ? 'text' : 'ok'), code);
      assert.equal(calls.length, 1);
    }
  }
  for (const response of [json({ id: 'ok' }, 200), json({ secret: 'bad' }, 201), json({ id: '../secret' }, 201), new Response('not json', { status: 201 }), json([], 201)]) {
    const { client, calls } = harness([response]);
    await rejects((await client.openSession()).addComment('TEST-1', 'text'), 'outcome_unknown'); assert.equal(calls.length, 1);
  }
  for (const response of [json({}, 201), json(Array(501).fill({}), 200), json(null), new Response('not json')]) {
    const { client, calls } = harness([response]);
    await rejects((await client.openSession()).executeTransition('TEST-1', 'ok'), 'outcome_unknown'); assert.equal(calls.length, 1);
  }
});

test('task session snapshots credentials and never resolves a profile or reads the network implicitly', async () => {
  const mutable = { ...credentials }; let resolutions = 0;
  const calls = [];
  const client = createTrackerClient({ getCredentials: () => { resolutions++; return mutable; }, fetch: async (url, init) => {
    calls.push({ url, init }); return json({ id: 'ok' }, 201);
  } });
  const session = await client.openSession(); mutable.token = 'rotated-token';
  assert.equal(calls.length, 0); assert.equal(resolutions, 1);
  await session.addComment('TEST-1', 'text');
  assert.equal(calls[0].init.headers.Authorization, 'OAuth synthetic-token'); assert.equal(resolutions, 1);
});

test('write cancellation before send is cancelled; transport, abort and timeout after send are unknown without retry', async t => {
  const ac = new AbortController(); ac.abort();
  const { client, calls } = harness([() => { throw new Error('synthetic-token'); }, () => new Promise(() => {}), () => new Promise(() => {})]);
  const session = await client.openSession();
  await rejects(session.addComment('TEST-1', 'text', { signal: ac.signal }), 'cancelled'); assert.equal(calls.length, 0);
  await rejects(session.addComment('TEST-1', 'text'), 'outcome_unknown'); assert.equal(calls.length, 1);
  const active = new AbortController(); const pending = session.executeTransition('TEST-1', 'ok', { signal: active.signal });
  active.abort(); await rejects(pending, 'outcome_unknown'); assert.equal(calls.length, 2);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timeout = session.addComment('TEST-1', 'text'); const checked = rejects(timeout, 'outcome_unknown');
  t.mock.timers.tick(10_000); await checked; assert.equal(calls.length, 3);
});

test('write stream failure and hanging body are outcome unknown with no retry', async t => {
  const broken = new ReadableStream({ pull() { throw new Error('synthetic-token'); } });
  const stalled = new ReadableStream({ pull() {} });
  const { client, calls } = harness([new Response(broken, { status: 201 }), new Response(stalled, { status: 201 })]);
  const session = await client.openSession();
  await rejects(session.addComment('TEST-1', 'text'), 'outcome_unknown');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = session.addComment('TEST-1', 'text'); const checked = rejects(pending, 'outcome_unknown');
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(10_000);
  await checked; assert.equal(calls.length, 2);
});

test('response arriving after abort still has its body cancelled', async () => {
  let finish, cancelled = false;
  const client = createTrackerClient({ getCredentials: () => credentials, fetch: () => new Promise(resolve => { finish = resolve; }) });
  const session = await client.openSession();
  const ac = new AbortController(); const pending = session.listBoards({ signal: ac.signal });
  await new Promise(resolve => setImmediate(resolve));
  ac.abort(); await rejects(pending, 'cancelled');
  finish(new Response(new ReadableStream({ pull() {}, cancel() { cancelled = true; } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
});
