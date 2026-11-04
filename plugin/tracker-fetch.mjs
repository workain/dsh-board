import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

const HOST = 'api.tracker.yandex.net';
const MAX_BODY_BYTES = 64 * 1024;
const error = () => new TypeError('Tracker transport failed');
const cancelled = () => new DOMException('Tracker transport cancelled', 'AbortError');

// Network layer only: deliberately IPv4-only (family: 4), with no fallback.
// Path/query restrictions, response size limits and timeouts belong to the API client.
// No global DNS/dispatcher changes, redirects, or logging; enforce TLS verification.
// createTrackerFetch({requestFn?}) returns fetch(url, {method, headers, body, signal, redirect}).
export function createTrackerFetch({ requestFn = httpsRequest } = {}) {
  if (typeof requestFn !== 'function') throw error();

  return async function trackerFetch(input, init = {}) {
    let url, headers, body, method, signal;
    try {
      if (typeof input !== 'string' || typeof init !== 'object' || init === null) throw error();
      // URL normalizes away an explicit :443, empty userinfo and empty fragments.
      // Reject their raw forms as well as their parsed equivalents.
      const authority = /^https:\/\/([^/?#]*)/i.exec(input)?.[1];
      if (authority !== HOST || input.includes('#')) throw error();
      if (/%(?![0-9a-f]{2})/i.test(input) || /[\u0000-\u0020\u007f-\u009f\\]/u.test(input) || /[\ud800-\udfff]/u.test(input)) throw error();
      // Reject invalid UTF-8 octets and encoded control characters rather than
      // silently normalizing malformed paths or query strings.
      if (/[\u0000-\u001f\u007f-\u009f]/u.test(decodeURI(input))) throw error();
      url = new URL(input);
      if (url.protocol !== 'https:' || url.hostname !== HOST || url.port || url.username || url.password || url.hash) throw error();
      method = init.method ?? 'GET';
      if (method !== 'GET' && method !== 'POST') throw error();
      if (init.redirect !== undefined && init.redirect !== 'error') throw error();
      signal = init.signal;
      if (signal !== undefined && signal !== null && !(signal instanceof AbortSignal)) throw error();
      if (signal?.aborted) throw cancelled();
      headers = new Headers(init.headers);
      // These headers must not override the pinned authority, framing or encoding.
      for (const name of ['host', 'connection', 'transfer-encoding', 'content-length', 'accept-encoding', 'proxy-authorization']) {
        if (headers.has(name)) throw error();
      }
      headers.set('accept-encoding', 'identity');
      body = init.body;
      if (body !== undefined && body !== null) {
        if (method !== 'POST' || typeof body !== 'string' || /[\ud800-\udfff]/u.test(body)) throw error();
        if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) throw error();
        body = Buffer.from(body, 'utf8');
      } else body = undefined;
    } catch (e) {
      if (signal?.aborted) throw cancelled();
      throw error();
    }

    return new Promise((resolve, reject) => {
      let req, res, streamSource, settled = false, cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        signal?.removeEventListener('abort', onAbort);
      };
      const fail = (aborted = false) => {
        if (!settled) { settled = true; reject(aborted ? cancelled() : error()); }
        cleanup();
      };
      const onAbort = () => {
        // Do not pass signal.reason or an underlying error into streams.
        if (streamSource) streamSource.destroy(cancelled());
        if (res) res.destroy();
        fail(true);
        if (req) req.destroy();
      };
      try {
        req = requestFn({
          protocol: 'https:', hostname: HOST, family: 4, method,
          rejectUnauthorized: true,
          path: `${url.pathname}${url.search}`, headers: Object.fromEntries(headers),
        }, response => {
          res = response;
          // Never forward raw network errors into the fetch body stream.
          response.on('error', () => { streamSource?.destroy(error()); fail(); });
          response.once('aborted', () => { streamSource?.destroy(error()); fail(); });
          response.once('close', () => {
            if (!response.complete && !response.readableEnded) {
              streamSource?.destroy(error());
              fail();
            }
            cleanup();
          });
          if (signal?.aborted) { onAbort(); return; }
          try {
            const status = response.statusCode;
            if (!Number.isInteger(status) || status < 200 || status > 599) throw error();
            if (status >= 300 && status < 400) throw error();
            const responseHeaders = new Headers();
            for (const [name, value] of Object.entries(response.headers)) {
              if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item);
              else if (value !== undefined) responseHeaders.append(name, String(value));
            }
            // node:https supplies raw encoded bytes, unlike fetch decompression.
            const encoding = responseHeaders.get('content-encoding');
            if (encoding && encoding.trim().toLowerCase() !== 'identity') throw error();
            const noBody = status === 204 || status === 205;
            if (!noBody) {
              streamSource = new Readable({
                read() { response.resume(); },
                destroy(cause, callback) { response.destroy(); callback(cause); },
              });
              response.on('data', chunk => { if (!streamSource.push(chunk)) response.pause(); });
              response.once('end', () => streamSource.push(null));
            }
            const stream = noBody ? null : Readable.toWeb(streamSource);
            const result = new Response(stream, { status, headers: responseHeaders });
            settled = true;
            if (noBody) { cleanup(); response.destroy(); }
            resolve(result);
          } catch {
            response.destroy();
            req.destroy();
            fail();
          }
        });
        req.on('error', () => {
          streamSource?.destroy(error());
          res?.destroy();
          fail();
        });
        req.once('close', () => { if (!res) fail(); });
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) { onAbort(); return; }
        req.end(body);
      } catch {
        streamSource?.destroy(error());
        res?.destroy();
        fail();
        req?.destroy();
      }
    });
  };
}
