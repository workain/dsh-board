import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createTrackerFetch } from './tracker-fetch.mjs';

const URL = 'https://api.tracker.yandex.net/v3/boards?a=1';
const secret = 'sensitive-token-and-host-details';
function fixture() {
  const calls = [];
  const requestFn = (options, callback) => {
    const req = new EventEmitter();
    req.destroyed = false;
    req.destroy = () => { req.destroyed = true; req.emit('close'); };
    req.end = body => { req.body = body; };
    const res = new PassThrough();
    res.statusCode = 200;
    res.headers = { 'content-type': 'application/json' };
    calls.push({ options, req, res, respond: () => callback(res) });
    return req;
  };
  return { fetch: createTrackerFetch({ requestFn }), calls };
}

test('pins destination, IPv4 and streams response without buffering', async () => {
  const { fetch, calls } = fixture();
  const pending = fetch(URL, { headers: { Authorization: secret } });
  const call = calls[0];
  assert.equal(call.options.protocol, 'https:');
  assert.equal(call.options.hostname, 'api.tracker.yandex.net');
  assert.equal(call.options.family, 4);
  assert.equal(call.options.path, '/v3/boards?a=1');
  assert.equal(call.options.headers.authorization, secret);
  assert.equal(call.options.headers['accept-encoding'], 'identity');
  assert.equal(call.options.rejectUnauthorized, true);
  call.respond();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json');
  const reader = response.body.getReader();
  call.res.write('{"ok":');
  assert.equal(new TextDecoder().decode((await reader.read()).value), '{"ok":');
  call.res.end('true}');
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'true}');
  assert.equal((await reader.read()).done, true);
});

test('requires TLS verification even when disabled in the host environment', async () => {
  const old = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const { fetch, calls } = fixture();
    const pending = fetch(URL);
    assert.equal(calls[0].options.rejectUnauthorized, true);
    calls[0].respond();
    calls[0].res.end('{}');
    await (await pending).text();
  } finally {
    if (old === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = old;
  }
});

test('POST body bounded by UTF-8 bytes and preserves astral Unicode', async () => {
  const { fetch, calls } = fixture();
  const pending = fetch(URL, { method: 'POST', body: '😀' });
  assert.deepEqual(calls[0].req.body, Buffer.from('😀'));
  calls[0].respond(); calls[0].res.end('{}');
  assert.equal(await (await pending).text(), '{}');
  const p = fetch(URL, { method: 'POST', body: 'é'.repeat(32768) });
  calls[1].respond(); calls[1].res.end('{}'); await p;
  await assert.rejects(fetch(URL, { method: 'POST', body: 'é'.repeat(32769) }));
  await assert.rejects(fetch(URL, { method: 'POST', body: '\ud800' }));
  await assert.rejects(fetch(URL, { method: 'GET', body: 'x' }));
  await assert.rejects(fetch(URL, { method: 'POST', body: new Uint8Array([1]) }));
  assert.equal(calls.length, 2);
});

test('rejects untrusted destinations and malformed URLs before requesting', async () => {
  const { fetch, calls } = fixture();
  for (const url of [
    'http://api.tracker.yandex.net/', 'https://evil.example/',
    'https://api.tracker.yandex.net.evil.example/', 'https://api.tracker.yandex.net:443/',
    'https://api.tracker.yandex.net:444/', 'https://user@api.tracker.yandex.net/',
    'https://@api.tracker.yandex.net/', 'https://api.tracker.yandex.net/#',
    'https://api.tracker.yandex.net/%xx', 'https://api.tracker.yandex.net/%ff',
    'https://api.tracker.yandex.net/%0d', 'https://api.tracker.yandex.net/\\x',
    'https://api.tracker.yandex.net/a b',
    'https://api.tracker.yandex.net/\ud800', 'https://api.tracker.yandex.net\\@evil/',
  ]) await assert.rejects(fetch(url), TypeError, url);
  assert.equal(calls.length, 0);
});

test('rejects unsupported options and sensitive framing overrides', async () => {
  const { fetch, calls } = fixture();
  for (const init of [
    { method: 'PUT' }, { method: 'post' }, { redirect: 'follow' },
    { headers: { host: 'evil.example' } }, { headers: { 'content-length': '1' } },
    { headers: { 'transfer-encoding': 'chunked' } }, { headers: { 'accept-encoding': 'gzip' } },
    { headers: { x: 'bad\nvalue' } }, { signal: {} },
  ]) await assert.rejects(fetch(URL, init));
  assert.equal(calls.length, 0);
});

test('redirects and encoded responses are rejected without following', async () => {
  for (const [status, headers] of [[302, { location: 'https://evil.example/' }], [200, { 'content-encoding': 'gzip' }]]) {
    const { fetch, calls } = fixture();
    const p = fetch(URL);
    calls[0].res.statusCode = status;
    calls[0].res.headers = headers;
    calls[0].respond();
    await assert.rejects(p, e => e instanceof TypeError && !e.message.includes(secret));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].req.destroyed, true);
    assert.equal(calls[0].res.destroyed, true);
  }
});

test('sanitizes network errors before and after response headers', async () => {
  const f = fixture();
  const p = f.fetch(URL);
  f.calls[0].req.emit('error', new Error(secret));
  await assert.rejects(p, e => e instanceof TypeError && !String(e).includes(secret));
  const p2 = f.fetch(URL);
  f.calls[1].respond();
  const response = await p2;
  const text = response.text();
  f.calls[1].res.destroy(new Error(secret));
  await assert.rejects(text, e => e instanceof TypeError && !String(e).includes(secret));
  const p3 = f.fetch(URL);
  f.calls[2].respond();
  const text2 = (await p3).text();
  f.calls[2].req.emit('error', new Error(secret));
  await assert.rejects(text2, e => e instanceof TypeError && !String(e).includes(secret));
});

test('abort before and after headers destroys the request and sanitizes reason', async () => {
  const f = fixture();
  const ac = new AbortController();
  const p = f.fetch(URL, { signal: ac.signal });
  ac.abort(secret);
  await assert.rejects(p, e => e.name === 'AbortError' && !String(e).includes(secret));
  assert.equal(f.calls[0].req.destroyed, true);
  await assert.rejects(f.fetch(URL, { signal: ac.signal }), e => e.name === 'AbortError');
  const ac2 = new AbortController();
  const p2 = f.fetch(URL, { signal: ac2.signal });
  f.calls[1].respond();
  const response = await p2;
  const reader = response.body.getReader();
  f.calls[1].res.write('{}');
  await reader.read();
  const pendingRead = reader.read();
  ac2.abort(secret);
  await assert.rejects(pendingRead, e => e.name === 'AbortError' && !String(e).includes(secret));
  assert.equal(f.calls[1].req.destroyed, true);
  assert.equal(f.calls[1].res.destroyed, true);
});

test('cancelling response body destroys underlying response', async () => {
  const f = fixture();
  const p = f.fetch(URL);
  f.calls[0].respond();
  const response = await p;
  await response.body.cancel();
  assert.equal(f.calls[0].res.destroyed, true);
});

test('bodyless statuses produce valid responses', async () => {
  for (const status of [204, 205]) {
    const f = fixture();
    const p = f.fetch(URL);
    f.calls[0].res.statusCode = status;
    f.calls[0].respond();
    const response = await p;
    assert.equal(response.status, status);
    assert.equal(response.body, null);
  }
});
