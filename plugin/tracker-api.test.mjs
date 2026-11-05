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

test('account scope derives only from captured credentials and validated current user', async () => {
  let seen;
  const client = createTrackerClient({ getCredentials: () => credentials, fetch: async () => json({ uid: 123 }),
    getAccountScope: async value => { seen = value; return 'a'.repeat(64); } });
  const session = await client.openSession();
  assert.equal(await session.getAccountScope(), 'a'.repeat(64));
  assert.deepEqual(seen, { orgType: 'org', orgId: 'synthetic-org', principalId: '123' });
  const bad = createTrackerClient({ getCredentials: () => credentials, fetch: async () => json({ uid: 123 }), getAccountScope: () => 'bad' });
  await rejects((await bad.openSession()).getAccountScope(), 'invalid_credentials');
});

test('current user identity is read from the fixed Tracker endpoint and must be safe', async () => {
  const { client, calls } = harness([json({ uid: 123, display: 'Private', email: 'hidden@example.invalid' })]);
  const account = await client.openSession();
  assert.deepEqual(await account.getMyself(), { uid: '123' });
  assert.equal(calls[0].url, 'https://api.tracker.yandex.net/v3/myself');
  for (const uid of [null, '123', 0, -1, 1.5]) {
    const c = harness([json({ uid })]).client;
    await rejects((await c.openSession()).getMyself(), 'invalid_response');
  }
  for (const raw of ['{"uid":1.0000000000000001}', '{"uid":9e2}', '{"uid":9007199254740990.9}']) {
    const c = harness([new Response(raw)]).client;
    await rejects((await c.openSession()).getMyself(), 'invalid_response');
  }
  const c = harness([new Response('{"uid":90071992547409931234}')]).client;
  assert.deepEqual(await (await c.openSession()).getMyself(), { uid: '90071992547409931234' });
});

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
  assert.equal(url.searchParams.get('fields'), 'id,key,summary,status,boards,assignee');
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
  assert.equal(new URL(calls[2].url).searchParams.get('fields'), 'id,key,summary,status,boards,assignee');
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
  assert.deepEqual(result.uncertainKeys, [], 'board search never discloses unverified issue keys');
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
  assert.equal(calls[0].url, 'https://api.tracker.yandex.net/v3/issues/TEST-1?fields=id%2Ckey%2Csummary%2Cdescription%2Cstatus%2Cassignee%2Cboards%2Cversion');
  assert.equal(calls[1].url, 'https://api.tracker.yandex.net/v3/issues/TEST-1/transitions');
  for (const { init } of calls) { assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.body, undefined); }
});

test('immutable issue ID lookup uses a fixed GET and returns only verified board evidence', async () => {
  const raw = { ...makeIssue('NEW-1', [{ id: 42, self: 'https://evil.invalid', name: 'private' }, { id: '2' }]),
    id: 'immutable_123', self: 'https://evil.invalid', secret: 'private', description: 'private',
    status: { id: '1', key: 'open', display: 'Open', self: 'https://evil.invalid' } };
  const h = harness([json(raw)]), session = await h.client.openSession();
  const result = await session.getIssueById('immutable_123');
  assert.deepEqual(result, { id: 'immutable_123', key: 'NEW-1', summary: 'Synthetic issue',
    status: { id: '1', key: 'open', display: 'Open' }, boards: [{ id: '42' }, { id: '2' }] });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, 'https://api.tracker.yandex.net/v3/issues/immutable_123?fields=id%2Ckey%2Csummary%2Cstatus%2Cboards');
  assert.equal(h.calls[0].init.method, 'GET'); assert.equal(h.calls[0].init.redirect, 'error');
  assert.equal(h.calls[0].init.body, undefined);
  assert.doesNotMatch(JSON.stringify(result), /evil\.invalid|private|synthetic-token|synthetic-org/);
});

test('immutable issue ID lookup rejects unsafe input and unverified or ambiguous response', async () => {
  const h = harness([]), session = await h.client.openSession();
  for (const id of ['', '../x', 'a/b', 'a?b', 'https://evil.invalid', 'x'.repeat(129), 123, null, 'a\n', 'é'])
    await rejects(session.getIssueById(id), 'invalid_input');
  await rejects(session.getIssueById('valid', { signal: {} }), 'invalid_input');
  assert.equal(h.calls.length, 0);
  const raw = { ...makeIssue('TEST-1', [{ id: '42' }]), id: 'immutable-1' };
  for (const patch of [{ id: 'other' }, { id: 1 }, { id: undefined }, { key: 'test-1' }, { key: 'TEST-0' },
    { key: 'TEST-1/evil' }, { boards: undefined }, { boards: null }, { boards: [{ id: '042' }] },
    { boards: [{ id: 42 }, { id: '42' }] }, { boards: [{ id: '42' }, null] }, { boards: Array(501).fill({ id: '1' }) },
    { status: {} }, { summary: 'bad\ntext' }]) {
    const next = await harness([json({ ...raw, ...patch })]).client.openSession();
    await rejects(next.getIssueById('immutable-1'), 'invalid_response');
  }
  // A key reused by a different issue must never satisfy an immutable-ID lookup.
  const reused = await harness([json({ ...raw, id: 'replacement-id', key: 'TEST-1' })]).client.openSession();
  await rejects(reused.getIssueById('immutable-1'), 'invalid_response');
  const boundary = 'A'.repeat(128);
  assert.equal((await (await harness([json({ ...raw, id: boundary, boards: [] })]).client.openSession()).getIssueById(boundary)).id, boundary);
});

test('immutable issue ID lookup bounds and cancels response without leaking errors', async () => {
  const oversized = harness([new Response('{}', { headers: { 'content-length': '2097153' } })]);
  await rejects((await oversized.client.openSession()).getIssueById('id'), 'response_too_large');
  const largeStream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2097153)); controller.close(); } });
  await rejects((await harness([new Response(largeStream)]).client.openSession()).getIssueById('id'), 'response_too_large');
  const failure = harness([() => { throw new Error('synthetic-token synthetic-org'); }]);
  await rejects((await failure.client.openSession()).getIssueById('id'), 'network_error');
  await rejects((await harness([new Response('{synthetic-token')]).client.openSession()).getIssueById('id'), 'invalid_response');
  let cancelled = false;
  const stream = new ReadableStream({ pull() {}, cancel() { cancelled = true; } });
  const h = harness([new Response(stream)]), session = await h.client.openSession(), ac = new AbortController();
  const pending = session.getIssueById('id', { signal: ac.signal });
  await new Promise(resolve => setImmediate(resolve)); ac.abort();
  await rejects(pending, 'cancelled'); assert.equal(cancelled, true); assert.equal(h.calls.length, 1);
  await rejects(session.getIssueById('id', { signal: ac.signal }), 'cancelled'); assert.equal(h.calls.length, 1);
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

test('comments return only bounded allowlisted fields and missing Link is indeterminate', async () => {
  const raw = { id: 42, text: '', version: 0, createdBy: { id: 'u1', display: 'User', self: 'https://evil.invalid' },
    createdAt: '2020-11-03T13:24:52.575+0000', self: 'https://evil.invalid', private: 'secret' };
  const { client, calls } = harness([json([raw])]);
  const result = await (await client.openSession()).getComments('TEST-1');
  assert.deepEqual(result, { comments: [{ id: '42', text: '', version: 0, createdBy: { id: 'u1', display: 'User' }, createdAt: raw.createdAt }], complete: false, nextCursor: null });
  assert.equal(calls[0].url, 'https://api.tracker.yandex.net/v3/issues/TEST-1/comments?perPage=100');
  assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.redirect, 'error');
  assert.doesNotMatch(JSON.stringify(result), /evil\.invalid|secret/);
  const full = { ...raw, text: 'x'.repeat(48 * 1024) };
  assert.equal((await (await harness([json([full])]).client.openSession()).getComments('TEST-1')).comments[0].text.length, 48 * 1024);
  for (const patch of [{ id: 9007199254740992 }, { id: '../bad' }, { text: 'x'.repeat(48 * 1024 + 1) },
    { text: '\u0000' }, { version: -1 }, { version: '0' }, { createdBy: {} }, { createdAt: 'https://evil.invalid' }]) {
    await rejects((await harness([json([{ ...raw, ...patch }])]).client.openSession()).getComments('TEST-1'), 'invalid_response');
  }
  for (const rows of [[raw, raw], Array(101).fill(raw), {}]) {
    await rejects((await harness([json(rows)]).client.openSession()).getComments('TEST-1'), 'invalid_response');
  }
  const h = harness([]); const session = await h.client.openSession();
  await rejects(session.getComments('TEST-1?url=https://evil.invalid'), 'invalid_input');
  await rejects(session.getComments('TEST-1', { signal: {} }), 'invalid_input');
  assert.equal(h.calls.length, 0);
});

const comment = id => ({ id, text: 'content', version: 0, createdBy: { id: 'u', display: 'User' }, createdAt: '2020-11-03T13:24:52Z' });
const commentsBase = 'https://api.tracker.yandex.net/v3/issues/TEST-1/comments?perPage=100';
const linkTo = (url, rel) => `<${url}>; rel="${rel}"`;

test('comment pagination reconstructs explicit next and permits cursor unlike last returned ID', async () => {
  const h = harness([
    json([comment(1), comment(2)], 200, { link: `${linkTo(commentsBase, 'first')}, ${linkTo(`${commentsBase}&id=5`, 'next')}` }),
    json([comment(6)], 200, { link: linkTo(commentsBase, 'first') }),
  ]);
  const s = await h.client.openSession();
  const first = await s.getComments('TEST-1');
  assert.deepEqual({ ids: first.comments.map(c => c.id), complete: first.complete, nextCursor: first.nextCursor },
    { ids: ['1', '2'], complete: false, nextCursor: '5' });
  const second = await s.getComments('TEST-1', { cursor: first.nextCursor });
  assert.deepEqual({ ids: second.comments.map(c => c.id), complete: second.complete, nextCursor: second.nextCursor },
    { ids: ['6'], complete: true, nextCursor: null });
  assert.deepEqual(h.calls.map(c => c.url), [commentsBase, `${commentsBase}&id=5`]);
});

test('short capped pages continue with only reconstructed safe parameters', async () => {
  const page = Array.from({ length: 30 }, (_, i) => comment(i + 1));
  const firstLink = `${commentsBase}&expand=comments&createdAt=2020-11-03T13%3A24%3A52Z`;
  const nextLink = `${commentsBase}&id=30&order=createdAt&url=https%3A%2F%2Fevil.invalid%2Fprivate&token=synthetic-link-secret`;
  const h = harness([
    json(page, 200, { link: `${linkTo(firstLink, 'first')}, ${linkTo(nextLink, 'next')}` }),
    json([comment(31)], 200, { link: linkTo(firstLink, 'first') }),
  ]);
  const s = await h.client.openSession();
  const first = await s.getComments('TEST-1');
  assert.equal(first.comments.length, 30); assert.equal(first.complete, false); assert.equal(first.nextCursor, '30');
  assert.doesNotMatch(JSON.stringify(first), /evil\.invalid|synthetic-link-secret/);
  const second = await s.getComments('TEST-1', { cursor: first.nextCursor });
  assert.equal(second.complete, true); assert.equal(second.nextCursor, null);
  assert.deepEqual(h.calls.map(c => c.url), [commentsBase, `${commentsBase}&id=30`]);
  for (const { init } of h.calls) { assert.equal(init.redirect, 'error'); assert.equal(init.method, 'GET'); }
});

test('comment Link may omit perPage without changing reconstructed requests', async () => {
  const base = commentsBase.replace('?perPage=100', '');
  const h = harness([
    json([comment(1)], 200, { link: `${linkTo(base, 'first')}, ${linkTo(`${base}?id=2`, 'next')}` }),
    json([comment(3)], 200, { link: linkTo(`${base}?id=2`, 'first') }),
  ]);
  const s = await h.client.openSession();
  const first = await s.getComments('TEST-1');
  assert.equal(first.complete, false); assert.equal(first.nextCursor, '2');
  const second = await s.getComments('TEST-1', { cursor: first.nextCursor });
  assert.equal(second.complete, true); assert.equal(second.nextCursor, null);
  assert.deepEqual(h.calls.map(c => c.url), [commentsBase, `${commentsBase}&id=2`]);
});

test('pages of any length without Link are indeterminate; first-only Link ends', async () => {
  const page = Array.from({ length: 100 }, (_, i) => comment(i + 1));
  const h = harness([json(page), json([comment(101)]), json(page, 200, { link: linkTo(commentsBase, 'first') }), json([])]);
  const s = await h.client.openSession();
  const first = await s.getComments('TEST-1');
  assert.equal(first.complete, false); assert.equal(first.nextCursor, null);
  const second = await s.getComments('TEST-1', { cursor: '100' });
  assert.equal(second.complete, false); assert.equal(second.nextCursor, null);
  const explicitEnd = await s.getComments('TEST-1');
  assert.equal(explicitEnd.complete, true); assert.equal(explicitEnd.nextCursor, null);
  const empty = await s.getComments('TEST-1');
  assert.equal(empty.complete, false); assert.equal(empty.nextCursor, null);
  assert.deepEqual(h.calls.map(c => c.url), [commentsBase, `${commentsBase}&id=100`, commentsBase, commentsBase]);
});

test('comment pagination validates caller cursor and response IDs', async () => {
  const h = harness([]), s = await h.client.openSession();
  for (const cursor of ['', '01', '-1', '+1', '1.0', '1e2', '9007199254740992', '1&perPage=1', 1, null])
    await rejects(s.getComments('TEST-1', { cursor }), 'invalid_input');
  assert.equal(h.calls.length, 0);
  for (const id of ['01', '-1', '1e2', '9007199254740992', 'abc', '', -1, 1.5, 9007199254740992, null]) {
    const session = await harness([json([comment(id)])]).client.openSession();
    await rejects(session.getComments('TEST-1'), 'invalid_response');
  }
  for (const rows of [[comment('1'), comment(1)], [comment(5)]]) {
    const session = await harness([json(rows)]).client.openSession();
    await rejects(session.getComments('TEST-1', rows.length === 1 ? { cursor: '5' } : {}), 'invalid_response');
  }
  const valid = await (await harness([json([comment(0), comment('9007199254740991')])]).client.openSession()).getComments('TEST-1');
  assert.deepEqual(valid.comments.map(c => c.id), ['0', '9007199254740991']);
});

test('comment pagination rejects unsafe or ambiguous Link metadata without following it', async () => {
  const badLinks = [
    '', 'x'.repeat(8193), 'not-a-link', `${linkTo(`${commentsBase}&id=2`, 'next')},`,
    linkTo('https://evil.invalid/v3/issues/TEST-1/comments?perPage=100&id=2', 'next'),
    linkTo('https://api.tracker.yandex.net.evil.invalid/v3/issues/TEST-1/comments?perPage=100&id=2', 'next'),
    linkTo('https://user:pass@api.tracker.yandex.net/v3/issues/TEST-1/comments?perPage=100&id=2', 'next'),
    linkTo('https://api.tracker.yandex.net:443/v3/issues/TEST-1/comments?perPage=100&id=2', 'next'),
    linkTo('http://api.tracker.yandex.net/v3/issues/TEST-1/comments?perPage=100&id=2', 'next'),
    linkTo('https://api.tracker.yandex.net/v3/issues/OTHER-1/comments?perPage=100&id=2', 'next'),
    linkTo('https://api.tracker.yandex.net/v3/issues/TEST-1/x/../comments?perPage=100&id=2', 'next'),
    linkTo(`${commentsBase}&id=2#fragment`, 'next'),
    linkTo(`${commentsBase}&id=2&id=3`, 'next'), linkTo(`${commentsBase}&id=2&perPage=100`, 'next'),
    linkTo(`${commentsBase}&id=2&%69d=3`, 'next'), linkTo(`${commentsBase}&id=%32`, 'next'),
    linkTo(`${commentsBase}&id=2&extra=%0d%0aInjected`, 'next'),
    linkTo(`${commentsBase}&id=2&extra=%250a`, 'next'), linkTo(`${commentsBase}&id=2&extra=%zz`, 'next'),
    linkTo(`${commentsBase}&id=02`, 'next'),
    linkTo(`${commentsBase}&id=9007199254740992`, 'next'), linkTo(commentsBase, 'next'),
    linkTo(commentsBase.replace('100', '99') + '&id=2', 'next'),
    `${linkTo(`${commentsBase}&id=2`, 'next')}, ${linkTo(`${commentsBase}&id=3`, 'next')}`,
    `${linkTo(commentsBase, 'first')}, ${linkTo(commentsBase, 'first')}`,
    linkTo(commentsBase, 'last'), `${linkTo(`${commentsBase}&id=2`, 'next')}; title="extra"`,
  ];
  for (const link of badLinks) {
    const h = harness([json([comment(1)], 200, { link })]);
    await rejects((await h.client.openSession()).getComments('TEST-1'), 'invalid_response');
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].url, commentsBase);
  }
});

test('comment pagination rejects non-advancing cursors and empty pages with next', async () => {
  for (const next of ['4', '5']) {
    const h = harness([json([comment(6)], 200, { link: linkTo(`${commentsBase}&id=${next}`, 'next') })]);
    await rejects((await h.client.openSession()).getComments('TEST-1', { cursor: '5' }), 'invalid_response');
    assert.equal(h.calls.length, 1);
  }
  const empty = harness([json([], 200, { link: linkTo(`${commentsBase}&id=6`, 'next') })]);
  await rejects((await empty.client.openSession()).getComments('TEST-1', { cursor: '5' }), 'invalid_response');
  const noLink = harness([json(Array.from({ length: 100 }, (_, i) => comment(i + 1)))]);
  const indeterminate = await (await noLink.client.openSession()).getComments('TEST-1', { cursor: '101' });
  assert.equal(indeterminate.complete, false); assert.equal(indeterminate.nextCursor, null);
});

test('issue PATCH is optimistic, exact, bounded and projects only safe receipt', async () => {
  const { client, calls } = harness([json({ key: 'TEST-1', version: 8, self: 'https://evil.invalid', secret: 'private' }), json({ key: 'TEST-1', version: 9 })]);
  const session = await client.openSession();
  assert.deepEqual(await session.updateIssue('TEST-1', { expectedVersion: 7, summary: 'Hello', description: '', assignee: null }), { version: 8 });
  assert.deepEqual(await session.updateIssue('TEST-1', { expectedVersion: 8, assignee: 'u1' }), { version: 9 });
  assert.equal(calls[0].url, 'https://api.tracker.yandex.net/v3/issues/TEST-1?version=7');
  assert.deepEqual(JSON.parse(calls[0].init.body), { summary: 'Hello', description: '', assignee: null });
  assert.deepEqual(JSON.parse(calls[1].init.body), { assignee: 'u1' });
  for (const { init } of calls) { assert.equal(init.method, 'PATCH'); assert.equal(init.redirect, 'error'); }
});

test('issue PATCH rejects unsafe input, status and oversized encoded body before sending', async () => {
  const { client, calls } = harness([]); const session = await client.openSession();
  for (const changes of [null, {}, { expectedVersion: -1, summary: 'x' }, { expectedVersion: '1', summary: 'x' },
    { expectedVersion: 1 }, { expectedVersion: 1, status: 'done' }, { expectedVersion: 1, summary: '' },
    { expectedVersion: 1, description: null }, { expectedVersion: 1, assignee: {} }, { expectedVersion: 1, assignee: '' },
    { expectedVersion: 1, description: 'x'.repeat(48 * 1024 + 1) }, { expectedVersion: 1, description: '😀'.repeat(24576) }]) {
    await rejects(session.updateIssue('TEST-1', changes), 'invalid_input');
  }
  await rejects(session.updateIssue('TEST-1/../../evil', { expectedVersion: 1, summary: 'x' }), 'invalid_input');
  await rejects(session.updateIssue('TEST-1', { expectedVersion: 1, summary: 'x' }, { signal: {} }), 'invalid_input');
  assert.equal(calls.length, 0);
});

test('issue PATCH explicit rejections, ambiguous responses, cancellation and timeout never retry', async t => {
  for (const [status, code] of [[409, 'conflict'], [412, 'precondition_failed'], [422, 'unprocessable'], [500, 'outcome_unknown']]) {
    const h = harness([new Response('secret', { status })]);
    await rejects((await h.client.openSession()).updateIssue('TEST-1', { expectedVersion: 1, summary: 'x' }), code);
    assert.equal(h.calls.length, 1);
  }
  for (const data of [{ key: 'OTHER-1', version: 2 }, { key: 'TEST-1', version: '2' }, { key: 'TEST-1', version: -1 }]) {
    const h = harness([json(data)]);
    await rejects((await h.client.openSession()).updateIssue('TEST-1', { expectedVersion: 1, summary: 'x' }), 'outcome_unknown');
    assert.equal(h.calls.length, 1);
  }
  const h = harness([() => new Promise(() => {}), () => new Promise(() => {})]); const session = await h.client.openSession();
  const ac = new AbortController(); ac.abort();
  await rejects(session.updateIssue('TEST-1', { expectedVersion: 1, summary: 'x' }, { signal: ac.signal }), 'cancelled');
  assert.equal(h.calls.length, 0);
  const active = new AbortController(); const pending = session.updateIssue('TEST-1', { expectedVersion: 1, summary: 'x' }, { signal: active.signal });
  active.abort(); await rejects(pending, 'outcome_unknown'); assert.equal(h.calls.length, 1);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timed = session.updateIssue('TEST-1', { expectedVersion: 1, summary: 'x' }); const checked = rejects(timed, 'outcome_unknown');
  t.mock.timers.tick(10_000); await checked; assert.equal(h.calls.length, 2);
});

test('comment lookup and PATCH use fixed documented routes and minimal receipts', async () => {
  const h = harness([json({ id: 42, version: 3, text: 'secret' }), json({ id: 42, version: 4, text: 'secret', self: 'https://evil.invalid' })]);
  const s = await h.client.openSession();
  assert.deepEqual(await s.getComment('TEST-1', '42'), { id: '42', version: 3 });
  assert.deepEqual(await s.editComment('TEST-1', { id: '42', text: 'New\ntext' }), { id: '42', version: 4 });
  assert.deepEqual(h.calls.map(c => [c.url, c.init.method]), [
    ['https://api.tracker.yandex.net/v3/issues/TEST-1/comments/42', 'GET'],
    ['https://api.tracker.yandex.net/v3/issues/TEST-1/comments/42', 'PATCH'],
  ]);
  assert.deepEqual(JSON.parse(h.calls[1].init.body), { text: 'New\ntext' });
  assert.equal(h.calls[1].init.redirect, 'error');
});

test('comment edit rejects injection and unsafe text without remote requests', async () => {
  const h = harness([]), s = await h.client.openSession();
  for (const id of ['', '../x', 'x/y', 'x?z', 'x'.repeat(129), 1]) {
    await rejects(s.getComment('TEST-1', id), 'invalid_input');
    await rejects(s.editComment('TEST-1', { id, text: 'x' }), 'invalid_input');
  }
  for (const text of ['', ' ', 'x'.repeat(48 * 1024 + 1), '😀'.repeat(24576), '\u0000', null])
    await rejects(s.editComment('TEST-1', { id: '1', text }), 'invalid_input');
  await rejects(s.editComment('TEST-1/evil', { id: '1', text: 'x' }), 'invalid_input');
  await rejects(s.editComment('TEST-1', { id: '1', text: 'x', version: 3 }), 'invalid_input');
  assert.equal(h.calls.length, 0);
});

test('comment edit unknown responses and cancellation are never retried', async () => {
  for (const response of [new Response('', { status: 500 }), new Response('bad'), json({ id: 'wrong', version: 1 }), json({ id: '1' }), json({ id: '1', version: -1 }), json({ id: '1', version: 2 }, 201)]) {
    const h = harness([response]);
    await rejects((await h.client.openSession()).editComment('TEST-1', { id: '1', text: 'x' }), 'outcome_unknown');
    assert.equal(h.calls.length, 1);
  }
  for (const value of [{ id: '2', version: 1 }, { id: '1', version: '1' }]) {
    const h = harness([json(value)]);
    await rejects((await h.client.openSession()).getComment('TEST-1', '1'), 'invalid_response');
    assert.equal(h.calls.length, 1);
  }
  const h = harness([() => new Promise(() => {})]), s = await h.client.openSession(), ac = new AbortController();
  const pending = s.editComment('TEST-1', { id: '1', text: 'x' }, { signal: ac.signal });
  ac.abort(); await rejects(pending, 'outcome_unknown'); assert.equal(h.calls.length, 1);
});

const boardWithQueue = (boardId = 42, queue = { id: '3', key: 'DOC', display: 'Documenting', self: 'https://evil.invalid' }) =>
  ({ ...makeBoard(boardId), defaultQueue: queue, private: 'secret' });

test('board creation queue is a minimal frozen projection and creation uses only fixed endpoint', async () => {
  const h = harness([json(boardWithQueue()), json({ id: 'abc123', key: 'DOC-99', version: 1, self: 'https://evil.invalid', secret: 'private' }, 201)]);
  const s = await h.client.openSession();
  const queue = await s.getBoardCreationQueue('42');
  assert.deepEqual(queue, { id: '3', key: 'DOC', display: 'Documenting' });
  assert.equal(Object.isFrozen(queue), true);
  assert.throws(() => { queue.key = 'OTHER'; }, TypeError);
  assert.deepEqual(await s.createIssue({ queue, summary: 'New issue', description: 'first\nsecond', unique: 'synthetic-unique' }),
    { id: 'abc123', key: 'DOC-99', version: 1 });
  assert.deepEqual(h.calls.map(c => [c.url, c.init.method]), [
    ['https://api.tracker.yandex.net/v3/boards/42', 'GET'],
    ['https://api.tracker.yandex.net/v3/issues?notify=false', 'POST'],
  ]);
  assert.deepEqual(JSON.parse(h.calls[1].init.body), { queue: 'DOC', summary: 'New issue', description: 'first\nsecond', unique: 'synthetic-unique' });
  assert.equal(h.calls[1].init.redirect, 'error');
  assert.equal(h.calls[1].init.headers['Content-Type'], 'application/json');
  assert.doesNotMatch(JSON.stringify(queue), /evil\.invalid|secret/);
});

test('board creation queue requires exact board id and documented defaultQueue fields', async () => {
  const invalid = [
    makeBoard(42), boardWithQueue(43), boardWithQueue(42, null), boardWithQueue(42, {}),
    boardWithQueue(42, { id: 3, key: 'DOC' }), boardWithQueue(42, { id: '03', key: 'DOC' }),
    boardWithQueue(42, { id: '9007199254740992', key: 'DOC' }),
    boardWithQueue(42, { id: '3', key: 'doc' }), boardWithQueue(42, { id: '3', key: 'DOC/other' }),
    boardWithQueue(42, { id: '3', key: 'DOC', display: null }), boardWithQueue(42, { id: '3', key: 'DOC', display: 'bad\nname' }),
  ];
  for (const raw of invalid) {
    const h = harness([json(raw)]), s = await h.client.openSession();
    await rejects(s.getBoardCreationQueue(42), 'invalid_response');
    assert.equal(h.calls.length, 1);
  }
  const h = harness([json(boardWithQueue(42, { id: '3', key: 'DOC' }))]), s = await h.client.openSession();
  for (const id of ['42?evil', '042', '42/other']) await rejects(s.getBoardCreationQueue(id), 'invalid_input');
  assert.deepEqual(await s.getBoardCreationQueue(42), { id: '3', key: 'DOC' });
  assert.equal(h.calls.length, 1);
});

test('issue creation rejects queue spoofing, foreign sessions and unsafe payloads before dispatch', async () => {
  const h = harness([json(boardWithQueue())]), s = await h.client.openSession();
  const queue = await s.getBoardCreationQueue(42);
  const foreign = await h.client.openSession();
  const invalid = [
    null, {}, { queue: { ...queue }, summary: 'x' }, { queue: { id: '3', key: 'OTHER' }, summary: 'x' },
    { queue, summary: '' }, { queue, summary: ' '.repeat(10) }, { queue, summary: 'x'.repeat(4097) },
    { queue, summary: 'bad\ntext' }, { queue, summary: 'x', description: null },
    { queue, summary: 'x', description: '\u0000' }, { queue, summary: 'x', description: 'x'.repeat(48 * 1024 + 1) },
    { queue, summary: 'x', description: '😀'.repeat(24576) }, { queue, summary: 'x', unique: '' },
    { queue, summary: 'x', unique: 'a\nb' }, { queue, summary: 'x', status: 'done' },
    Object.assign(Object.create({ injected: true }), { queue, summary: 'x' }),
    Object.defineProperty({ queue }, 'summary', { get() { throw new Error('secret'); }, enumerable: true }),
    { queue, summary: 'x', [Symbol('extra')]: true },
  ];
  for (const payload of invalid) await rejects(s.createIssue(payload), 'invalid_input');
  await rejects(foreign.createIssue({ queue, summary: 'x' }), 'invalid_input');
  await rejects(s.createIssue({ queue, summary: 'x' }, { signal: {} }), 'invalid_input');
  assert.equal(h.calls.length, 1);
});

test('issue creation accepts bounded optional fields and strips nothing into extra requests', async () => {
  const h = harness([json(boardWithQueue()), json({ id: 'id', key: 'DOC-1', version: 0 }, 201)]);
  const s = await h.client.openSession(), queue = await s.getBoardCreationQueue(42);
  assert.deepEqual(await s.createIssue({ queue, summary: 'x'.repeat(4096), description: 'x'.repeat(48 * 1024), unique: 'y'.repeat(4096) }),
    { id: 'id', key: 'DOC-1', version: 0 });
  assert.equal(h.calls.length, 2);
  assert.deepEqual(Object.keys(JSON.parse(h.calls[1].init.body)), ['queue', 'summary', 'description', 'unique']);
});

test('creation failures classify explicit rejections and malformed receipts without retry', async () => {
  for (const [response, code] of [
    [new Response('', { status: 409 }), 'conflict'], [new Response('', { status: 403 }), 'forbidden'],
    [new Response('', { status: 500 }), 'outcome_unknown'], [json({ id: 'id', key: 'DOC-1', version: 1 }), 'outcome_unknown'],
    [json({ id: '', key: 'DOC-1', version: 1 }, 201), 'outcome_unknown'],
    [json({ id: 'id', key: 'OTHER-1', version: 1 }, 201), 'outcome_unknown'],
    [json({ id: 'id', key: 'DOC-0', version: 1 }, 201), 'outcome_unknown'],
    [json({ id: 'id', key: 'DOC-1', version: '1' }, 201), 'outcome_unknown'],
    [json({ id: 'id', key: 'DOC-1', version: -1 }, 201), 'outcome_unknown'],
    [new Response('bad', { status: 201 }), 'outcome_unknown'],
  ]) {
    const h = harness([json(boardWithQueue()), response]), s = await h.client.openSession();
    const queue = await s.getBoardCreationQueue(42);
    await rejects(s.createIssue({ queue, summary: 'x' }), code);
    assert.equal(h.calls.length, 2);
  }
});

test('creation cancellation, transport failure and timeout never trigger retry', async t => {
  const h = harness([json(boardWithQueue()), () => { throw new Error('secret'); }, () => new Promise(() => {}), () => new Promise(() => {})]);
  const s = await h.client.openSession(), queue = await s.getBoardCreationQueue(42);
  const before = new AbortController(); before.abort();
  await rejects(s.createIssue({ queue, summary: 'x' }, { signal: before.signal }), 'cancelled');
  assert.equal(h.calls.length, 1);
  await rejects(s.createIssue({ queue, summary: 'x' }), 'outcome_unknown');
  const active = new AbortController(), pending = s.createIssue({ queue, summary: 'x' }, { signal: active.signal });
  active.abort(); await rejects(pending, 'outcome_unknown');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timed = s.createIssue({ queue, summary: 'x' }); const checked = rejects(timed, 'outcome_unknown');
  t.mock.timers.tick(10_000); await checked;
  assert.equal(h.calls.length, 4);
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
