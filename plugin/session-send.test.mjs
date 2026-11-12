import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionSender } from './session-send.mjs';

const ok = { ok: true, value: { accepted: true } };
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function fixture({ prompt = async () => ok, validate = async () => true, snapshots = {}, ready = async () => {} } = {}) {
  const events = [], releases = [], submissions = [];
  let nextId = 0;
  const sessions = {
    async using(id, options, callback) {
      events.push(['using', id, options]);
      let isReady = false;
      const session = {
        sessionId: id,
        getSnapshot() { return { sessionId: id, openState: 'open', removed: false, subagent: null, ...snapshots[id] }; },
        beginSubmission(input) {
          events.push(['begin', id, input]);
          const entry = { id, requestId: `req-${++nextId}`, abandoned: false };
          submissions.push(entry);
          return { requestId: entry.requestId, abandon() { entry.abandoned = true; events.push(['abandon', id]); } };
        },
        async prompt(...args) { events.push(['prompt', id, ...args]); return prompt(id, ...args); },
      };
      const ref = {
        sessionId: id,
        ready: Promise.resolve().then(() => ready(id)).then(() => { isReady = true; }),
        get binding() { assert.equal(isReady, true, 'binding accessed before ready'); return { session }; },
      };
      try { return await callback(ref); } finally { releases.push(id); }
    },
  };
  return { events, releases, submissions, sender: createSessionSender({ sessions, validateSession: async id => { events.push(['validate', id]); return validate(id); } }) };
}
const statuses = result => result.targets.map(({ id, status }) => [id, status]);

test('validates twice and sends sequentially in queue mode', async () => {
  const f = fixture(), progress = [];
  const result = await f.sender.send(['a', 'b'], '  comment  ', { onProgress: p => progress.push(p) });
  assert.equal(result.state, 'complete');
  assert.deepEqual(statuses(result), [['a', 'accepted'], ['b', 'accepted']]);
  assert.deepEqual(f.events.map(e => e.slice(0, 2)), [
    ['validate', 'a'], ['using', 'a'], ['validate', 'a'], ['begin', 'a'], ['prompt', 'a'],
    ['validate', 'b'], ['using', 'b'], ['validate', 'b'], ['begin', 'b'], ['prompt', 'b'],
  ]);
  for (const e of f.events.filter(e => e[0] === 'using')) assert.equal(e[2].source, 'controllerOperation');
  for (const e of f.events.filter(e => e[0] === 'begin')) assert.deepEqual(e[2], { mode: 'queue', text: '  comment  ', attachments: [] });
  for (const e of f.events.filter(e => e[0] === 'prompt')) {
    assert.deepEqual(e[2], [{ type: 'text', text: '  comment  ' }]);
    assert.equal(e[3], 'queue');
    assert.match(e[5], /^req-/);
  }
  assert.deepEqual(f.submissions.map(s => s.requestId), ['req-1', 'req-2']);
  assert.deepEqual(f.releases, ['a', 'b']);
  assert.equal(progress.length, 2);
  assert.equal(JSON.stringify(progress).includes('comment'), false);
  progress[0].targets[0].status = 'mutated';
  assert.equal(result.targets[0].status, 'accepted');
});

test('validates unique target limit, text size and input without dispatch', async () => {
  const f = fixture();
  for (const [ids, text] of [[[], 'x'], [[''], 'x'], [[1], 'x'], [['a', 'a'], 'x'], [['a'], ''], [['a'], '  '], [['a'], 'é'.repeat(24577)], [Array.from({ length: 21 }, (_, i) => String(i)), 'x']]) {
    await assert.rejects(f.sender.send(ids, text));
  }
  assert.equal(f.events.length, 0);
  assert.equal((await f.sender.send(['a'], 'é'.repeat(24576))).state, 'complete');
});

test('stale or unauthorized checks stop before acquisition or dispatch', async () => {
  for (const rejectAt of [1, 2]) {
    let count = 0;
    const f = fixture({ validate: async () => ++count !== rejectAt });
    const result = await f.sender.send(['a', 'b'], 'x');
    assert.equal(result.state, 'stopped');
    assert.deepEqual(statuses(result), [['a', 'not-sent'], ['b', 'not-sent']]);
    assert.equal(f.submissions.length, 0);
    assert.equal(f.releases.length, rejectAt === 1 ? 0 : 1);
  }
  for (const snapshot of [{ openState: 'error' }, { removed: true }, { subagent: {} }, { sessionId: 'other' }]) {
    const f = fixture({ snapshots: { a: snapshot } });
    assert.equal((await f.sender.send(['a'], 'x')).state, 'stopped');
    assert.equal(f.submissions.length, 0);
    assert.deepEqual(f.releases, ['a']);
  }
});

test('rechecks snapshot after asynchronous authorization', async () => {
  const snapshot = {};
  let count = 0;
  const f = fixture({ snapshots: { a: snapshot }, validate: async () => { if (++count === 2) snapshot.removed = true; return true; } });
  assert.equal((await f.sender.send(['a'], 'x')).state, 'stopped');
  assert.equal(f.submissions.length, 0);
});

test('aborted before dispatch never sends', async () => {
  const controller = new AbortController();
  controller.abort();
  const f = fixture();
  const result = await f.sender.send(['a'], 'x', { signal: controller.signal });
  assert.equal(result.state, 'stopped');
  assert.equal(f.events.length, 0);
  const controller2 = new AbortController();
  const g = fixture({ validate: async () => { controller2.abort(); return true; } });
  assert.equal((await g.sender.send(['a'], 'x', { signal: controller2.signal })).state, 'stopped');
  assert.equal(g.submissions.length, 0);
});

test('after-dispatch abort, thrown and transport failures are unknown and stop', async () => {
  for (const kind of ['throw', 'cancelled', 'internal', 'busy', 'abort', 'malformed']) {
    const controller = new AbortController();
    const f = fixture({ prompt: async () => {
      if (kind === 'throw') throw Error('secret comment');
      if (kind === 'abort') { controller.abort(); return ok; }
      if (kind === 'malformed') return {};
      return { ok: false, error: { code: kind === 'busy' ? 'session/agent-busy' : `gateway/${kind}` } };
    } });
    const result = await f.sender.send(['a', 'b'], 'secret comment', { signal: controller.signal });
    assert.equal(result.state, 'unknown', kind);
    assert.deepEqual(statuses(result), [['a', 'unknown'], ['b', 'not-sent']]);
    assert.equal(f.submissions.length, 1);
    assert.equal(f.submissions[0].abandoned, false);
    assert.deepEqual(f.releases, ['a']);
    assert.equal(JSON.stringify(result).includes('secret comment'), false);
  }
});

test('explicit pre-admission rejection stops batch as not-sent', async () => {
  const f = fixture({ prompt: async () => ({ ok: false, error: { code: 'gateway/bad-request', message: 'secret' } }) });
  const result = await f.sender.send(['a', 'b'], 'x');
  assert.equal(result.state, 'stopped');
  assert.deepEqual(statuses(result), [['a', 'not-sent'], ['b', 'not-sent']]);
  assert.equal(f.submissions.length, 1);
  assert.equal(f.submissions[0].abandoned, false);
});

test('acquisition, ready, validation and progress exceptions release and do not leak', async () => {
  for (const f of [fixture({ ready: async () => { throw Error('secret'); } }), fixture({ validate: async () => { throw Error('secret'); } })]) {
    const result = await f.sender.send(['a'], 'x');
    assert.equal(result.state, 'stopped');
    assert.equal(JSON.stringify(result).includes('secret'), false);
    assert.equal(f.submissions.length, 0);
  }
  const f = fixture();
  assert.equal((await f.sender.send(['a', 'b'], 'x', { onProgress() { throw Error('secret'); } })).state, 'complete');
  assert.deepEqual(f.releases, ['a', 'b']);
});

test('concurrent batches never overlap, including same recipient', async () => {
  const first = deferred(), entered = deferred();
  let calls = 0;
  const f = fixture({ prompt: async () => { if (++calls === 1) { entered.resolve(); return first.promise; } return ok; } });
  const one = f.sender.send(['a', 'b'], 'one');
  await entered.promise;
  const two = f.sender.send(['a'], 'two');
  await Promise.resolve();
  assert.equal(calls, 1);
  first.resolve(ok);
  assert.equal((await one).state, 'complete');
  assert.equal((await two).state, 'complete');
  assert.deepEqual(f.events.filter(e => e[0] === 'prompt').map(e => [e[1], e[2][0].text]), [['a', 'one'], ['b', 'one'], ['a', 'two']]);
  assert.deepEqual(f.submissions.map(s => s.requestId), ['req-1', 'req-2', 'req-3']);
});

test('abandon only if aborted after echo creation and before prompt', async () => {
  const controller = new AbortController();
  let abandoned = 0, calls = 0;
  const session = { sessionId: 'a', getSnapshot: () => ({ sessionId: 'a', openState: 'open' }), beginSubmission() { controller.abort(); return { requestId: '1', abandon() { abandoned++; } }; }, prompt() { calls++; } };
  const sessions = { async using(id, options, callback) { return callback({ sessionId: id, ready: Promise.resolve(), binding: { session } }); } };
  const sender = createSessionSender({ sessions, validateSession: async () => true });
  assert.equal((await sender.send(['a'], 'x', { signal: controller.signal })).state, 'stopped');
  assert.equal(abandoned, 1);
  assert.equal(calls, 0);
});
