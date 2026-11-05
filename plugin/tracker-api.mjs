import { createHmac, randomBytes } from 'node:crypto';

// Standalone, narrowly scoped Tracker integration. No environment or filesystem access.
// Board search is an opt-in approximation, not a documented complete board API.
// No caller-provided Tracker query, URL or search body is accepted.
const ORIGIN = 'https://api.tracker.yandex.net';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_KEYS = 100;
const PER_PAGE = 100;
const MAX_PAGES = 5;
const TIMEOUT_MS = 10_000;
const SEARCH_INTERVAL_MS = 250;
const MAX_DESCRIPTION = 48 * 1024;
const MAX_COMMENT = 48 * 1024;
const MAX_TRANSITIONS = 500;
const MAX_COMMENTS = 100;
const MAX_WRITE_BYTES = 64 * 1024;

export class TrackerError extends Error {
  constructor(code) {
    super(`Tracker: ${code}`);
    this.name = 'TrackerError';
    this.code = code;
  }
}
const fail = code => { throw new TrackerError(code); };
const REQUEST_ERROR_CODES = new Set(['invalid_input', 'invalid_credentials', 'invalid_response', 'response_too_large',
  'cancelled', 'timeout', 'network_error', 'unauthorized', 'forbidden', 'not_found', 'rate_limited', 'redirect', 'http_error']);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function boardId(value, code = 'invalid_input') {
  const v = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof v !== 'string' || !/^[1-9][0-9]{0,14}$/.test(v) || !Number.isSafeInteger(Number(v))) fail(code);
  return v;
}
function text(value, max, code = 'invalid_response') {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !value.trim() || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) fail(code);
  return value;
}
function credentialHeaders(value) {
  if (!object(value)) fail('invalid_credentials');
  const { token, tokenType, orgId, orgType } = value;
  if (typeof token !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(token) ||
      typeof orgId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(orgId) ||
      !['OAuth', 'Bearer'].includes(tokenType) || !['org', 'cloud'].includes(orgType)) fail('invalid_credentials');
  return { Authorization: `${tokenType} ${token}`, [orgType === 'org' ? 'X-Org-ID' : 'X-Cloud-Org-ID']: orgId };
}
const validQueueKey = key => typeof key === 'string' && /^[A-Z][A-Z0-9_]{0,31}$/.test(key);
const validKey = key => typeof key === 'string' && /^[A-Z][A-Z0-9_]{0,31}-[1-9][0-9]{0,14}$/.test(key);
const plainObject = value => object(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
// Do not accept inherited, accessor, symbol, or non-enumerable input properties.
function plainFields(value, allowed, required) {
  if (!plainObject(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))) return false;
  return required.every(key => Object.hasOwn(value, key)) && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
}
const validTransitionId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
// Tracker's comment id is numeric. Cursors must remain exactly representable and canonical.
const validCommentCursor = id => typeof id === 'string' && /^(?:0|[1-9][0-9]{0,15})$/.test(id) && Number.isSafeInteger(Number(id));

// Parse a bounded, conservative subset of Link syntax; never request the supplied URL.
// The docs do not specify its exact serialization, so unknown syntax fails closed.
function commentNextCursor(headers, key) {
  if (!headers || typeof headers.get !== 'function') fail('invalid_response');
  const link = headers.get('link');
  if (link === null) return { present: false, next: null };
  if (typeof link !== 'string' || !link || link.length > 8192 || /[\u0000-\u001f\u007f-\u009f]/u.test(link)) fail('invalid_response');
  const relations = new Set();
  let next = null;
  for (const entry of link.split(',')) {
    const match = /^[ \t]*<([^<>\s]+)>[ \t]*;[ \t]*rel[ \t]*=[ \t]*(?:"([A-Za-z]+)"|([A-Za-z]+))[ \t]*$/i.exec(entry);
    if (!match) fail('invalid_response');
    const relation = (match[2] || match[3]).toLowerCase();
    if (!['first', 'next'].includes(relation) || relations.has(relation)) fail('invalid_response');
    relations.add(relation);
    const prefix = `${ORIGIN}/v3/issues/${encodeURIComponent(key)}/comments`;
    const raw = match[1];
    // The exact raw prefix additionally rejects URL normalization, credentials,
    // explicit ports (including :443), fragments and path/host encodings.
    if ((raw !== prefix && !raw.startsWith(`${prefix}?`)) || /[#\\]/.test(raw)) fail('invalid_response');
    let url;
    try { url = new URL(raw); } catch { fail('invalid_response'); }
    if (url.origin !== ORIGIN || url.pathname !== `/v3/issues/${encodeURIComponent(key)}/comments` ||
        url.username || url.password || url.port || url.hash) fail('invalid_response');
    // Additional parameters are untrusted and are never copied into a request.
    // Reject encoded spelling, malformed separators and duplicate cursor fields.
    const parsed = new Map();
    if (raw.length > prefix.length) {
      const params = raw.slice(prefix.length + 1).split('&');
      if (params.length > 100) fail('invalid_response');
      for (const param of params) {
        const part = /^([A-Za-z0-9_.~-]+)=((?:[A-Za-z0-9_.~!$'()*+;=:@/?-]|%[0-9A-Fa-f]{2})*)$/.exec(param);
        if (!part) fail('invalid_response');
        if (part[1] === 'id' || part[1] === 'perPage') {
          if (parsed.has(part[1]) || part[2].includes('%')) fail('invalid_response');
          parsed.set(part[1], part[2]);
        } else {
          // Unknown values are discarded, not interpreted. Reject encoded controls
          // and nested escapes rather than tolerating header/query injection.
          let decoded;
          try { decoded = decodeURIComponent(part[2]); } catch { fail('invalid_response'); }
          if (/[\u0000-\u001f\u007f-\u009f%]/u.test(decoded)) fail('invalid_response');
        }
      }
    }
    if ((parsed.has('perPage') && parsed.get('perPage') !== String(MAX_COMMENTS)) ||
        (parsed.has('id') && !validCommentCursor(parsed.get('id')))) fail('invalid_response');
    if (relation === 'next') {
      if (!parsed.has('id')) fail('invalid_response');
      next = parsed.get('id');
    }
  }
  return { present: true, next };
}
function issueKey(key) {
  if (!validKey(key)) fail('invalid_input');
  return key;
}
// Preserve the full body (including newlines/tabs); never truncate a comparison value.
function bodyText(value, max, code, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) fail(code);
  return value;
}
function validateKeys(keys) {
  if (!Array.isArray(keys) || keys.length > MAX_KEYS) fail('invalid_input');
  const seen = new Set();
  for (const key of keys) {
    if (!validKey(key) || seen.has(key)) fail('invalid_input');
    seen.add(key);
  }
  return [...keys];
}
function status(value) {
  if (!object(value)) fail('invalid_response');
  return { id: text(value.id, 128), key: text(value.key, 128), display: text(value.display, 256) };
}
function board(value) {
  if (!object(value)) fail('invalid_response');
  return { id: boardId(value.id, 'invalid_response'), name: text(value.name, 256) };
}
function columns(value) {
  if (!Array.isArray(value) || value.length > 500) fail('invalid_response');
  const ids = new Set();
  return value.map(v => {
    if (!object(v) || !Array.isArray(v.statuses) || v.statuses.length > 500) fail('invalid_response');
    const id = boardId(v.id, 'invalid_response');
    if (ids.has(id)) fail('invalid_response');
    ids.add(id);
    return { id, name: text(v.name, 256), statuses: v.statuses.map(status) };
  });
}
// Omitted or malformed assignees are unknown, never an explicit unassignment.
// Return only the two display fields; other Tracker user properties can be private.
function assignee(value) {
  if (value === null) return { assigneeKnown: true, assignee: null };
  if (!object(value)) return { assigneeKnown: false, assignee: null };
  try {
    return { assigneeKnown: true, assignee: { id: text(value.id, 128), display: text(value.display, 256) } };
  } catch {
    return { assigneeKnown: false, assignee: null };
  }
}
function issue(value, wantedKeys, targetId) {
  if (!object(value) || !validKey(value.key) || (wantedKeys && !wantedKeys.has(value.key))) fail('invalid_response');
  if (!Array.isArray(value.boards) || value.boards.length > 500) return { uncertain: true };
  let member = false;
  for (const b of value.boards) {
    if (!object(b)) return { uncertain: true };
    let id;
    try { id = boardId(b.id, 'invalid_response'); } catch { return { uncertain: true }; }
    if (id === targetId) member = true;
  }
  if (!member) return { member: false };
  const id = typeof value.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.id) ? value.id : undefined;
  return { member: true, issue: { ...(id ? { id } : {}), key: value.key, summary: text(value.summary, 4096), status: status(value.status), ...assignee(value.assignee) } };
}
function abortCode(signal, timedOut) {
  return timedOut() ? 'timeout' : signal?.aborted ? 'cancelled' : 'network_error';
}
function waitForSearch(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new TrackerError('cancelled'));
    const onAbort = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(new TrackerError('cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, delay);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
async function readJson(response, signal, principal = false) {
  const length = response.headers?.get?.('content-length');
  if (length !== null && length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
    try { Promise.resolve(response.body?.cancel?.()).catch(() => {}); } catch {}
    fail('response_too_large');
  }
  if (!response.body || typeof response.body.getReader !== 'function') fail('invalid_response');
  if (signal.aborted) {
    try { Promise.resolve(response.body.cancel?.()).catch(() => {}); } catch {}
    fail('cancelled');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0, reads = 0;
  const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
  let onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => { cancel(); reject(new TrackerError('cancelled')); };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    while (true) {
      if (signal.aborted) fail('cancelled');
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      if (++reads > 8192) fail('response_too_large');
      if (!(value instanceof Uint8Array)) fail('invalid_response');
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) fail('response_too_large');
      if (value.byteLength) chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    cancel();
    try { reader.releaseLock(); } catch {}
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(joined);
    if (!principal) return JSON.parse(decoded);
    const marker = Symbol('raw-tracker-uid');
    const value = JSON.parse(decoded, (key, item, context) => key === 'uid' && typeof item === 'number' ? { [marker]: context?.source } : item);
    const uid = value?.uid?.[marker];
    if (typeof uid !== 'string' || !/^[1-9][0-9]{0,63}$/.test(uid)) fail('invalid_response');
    return { uid };
  } catch { fail('invalid_response'); }
}

/**
 * createTrackerClient({getCredentials, fetch}) -> {listBoards, getBoardOverview}.
 * getCredentials(): {token, tokenType:'OAuth'|'Bearer', orgId, orgType:'org'|'cloud'}.
 * openSession({signal}) snapshots credentials and exposes an opaque identity and
 * getIssue, getComments, updateIssue, listTransitions, addComment and executeTransition. The caller must
 * verify issue.boards against its authorized boards before reads or writes.
 * For creation, authorize the selected board first; getBoardCreationQueue(id, options)
 * returns an immutable queue capability accepted only by createIssue(payload, options)
 * in that same session. Creation does not establish board membership.
 * Issue descriptions and comments are untrusted content, not instructions.
 * Compare with a fresh session identity before publishing session results.
 */
export function createTrackerClient({ getCredentials, fetch: fetchFn = globalThis.fetch, getAccountScope } = {}) {
  if (typeof getCredentials !== 'function' || typeof fetchFn !== 'function' || (getAccountScope !== undefined && typeof getAccountScope !== 'function')) fail('invalid_input');
  let searchBusy = false;
  let lastSearchAt = -Infinity;
  const identityKey = randomBytes(32);

  async function request(url, method, body, callerSignal, credentials, { expectedStatus = 200, write = false, principal = false, project = value => value } = {}) {
    if (callerSignal !== undefined && !(callerSignal instanceof AbortSignal)) fail('invalid_input');
    if (callerSignal?.aborted) fail('cancelled');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    const onAbort = () => controller.abort();
    callerSignal?.addEventListener('abort', onAbort, { once: true });
    let removeAbort, sent = false, rejected = false;
    const stopped = new Promise((_, reject) => {
      const fn = () => reject(new TrackerError(abortCode(callerSignal, () => timedOut)));
      controller.signal.addEventListener('abort', fn, { once: true });
      removeAbort = () => controller.signal.removeEventListener('abort', fn);
      if (controller.signal.aborted) fn();
    });
    try {
      return await Promise.race([stopped, (async () => {
        if (controller.signal.aborted) fail(abortCode(callerSignal, () => timedOut));
        const headers = { Accept: 'application/json', ...credentialHeaders(credentials) };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const init = { method, headers, redirect: 'error', signal: controller.signal };
        if (body !== undefined) init.body = JSON.stringify(body);
        let response;
        try { sent = true; response = await fetchFn(url, init); } catch { fail(abortCode(callerSignal, () => timedOut)); }
        if (controller.signal.aborted) {
          try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}); } catch {}
          fail(abortCode(callerSignal, () => timedOut));
        }
        if (!response || !Number.isInteger(response.status)) fail('invalid_response');
        if (response.status !== expectedStatus) {
          try { Promise.resolve(response.body?.cancel?.()).catch(() => {}); } catch {}
          const codes = { 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 429: 'rate_limited',
            ...(write ? { 409: 'conflict', 412: 'precondition_failed', 422: 'unprocessable' } : {}) };
          const code = Object.hasOwn(codes, response.status) ? codes[response.status] : null;
          if (code) { rejected = true; fail(code); }
          if (response.status >= 300 && response.status < 400) fail('redirect');
          fail('http_error');
        }
        return project(await readJson(response, controller.signal, principal), response.headers);
      })()]);
    } catch (error) {
      if (write && sent && !rejected) fail('outcome_unknown');
      if (controller.signal.aborted && !rejected) fail(abortCode(callerSignal, () => timedOut));
      let safeCode;
      try {
        if (error instanceof TrackerError && (REQUEST_ERROR_CODES.has(error.code) ||
            (write && rejected && ['conflict', 'precondition_failed', 'unprocessable'].includes(error.code)))) safeCode = error.code;
      } catch {}
      fail(safeCode || 'invalid_response');
    } finally {
      clearTimeout(timer); removeAbort?.(); callerSignal?.removeEventListener('abort', onAbort);
      controller.abort();
    }
  }

  async function listBoards(credentials, { signal } = {}) {
    const boards = [];
    let cursor = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ perPage: String(PER_PAGE) });
      if (cursor) params.set('id', String(cursor));
      const result = await request(`${ORIGIN}/v3/boards/_paginate?${params}`, 'GET', undefined, signal, credentials);
      if (!Array.isArray(result) || result.length > PER_PAGE) fail('invalid_response');
      for (const raw of result) {
        const b = board(raw);
        if (Number(b.id) <= cursor) fail('invalid_response');
        cursor = Number(b.id); boards.push(b);
      }
      if (result.length < PER_PAGE) return { boards, complete: true, reason: null };
    }
    return { boards, complete: false, reason: 'page_limit' };
  }

  async function getBoardOverview(credentials, id, { issueKeys = [], searchByBoard = false, signal } = {}) {
    id = boardId(id);
    const keys = validateKeys(issueKeys);
    if (typeof searchByBoard !== 'boolean' || (searchByBoard && keys.length)) fail('invalid_input');
    if (signal !== undefined && !(signal instanceof AbortSignal)) fail('invalid_input');
    const rawBoard = await request(`${ORIGIN}/v3/boards/${id}`, 'GET', undefined, signal, credentials);
    const resultBoard = board(rawBoard);
    if (resultBoard.id !== id) fail('invalid_response');
    const resultColumns = columns(await request(`${ORIGIN}/v3/boards/${id}/columns`, 'GET', undefined, signal, credentials));
    const result = { board: resultBoard, columns: resultColumns, issues: [], issuesComplete: false,
      issuesReason: searchByBoard ? 'approximate_board_filter' : keys.length ? 'explicit_keys_only' : 'board_search_unsupported', uncertainKeys: [], missingKeys: [] };
    if (!keys.length && !searchByBoard) return result;
    if (searchBusy || Date.now() - lastSearchAt < SEARCH_INTERVAL_MS) fail('client_rate_limited');
    searchBusy = true;
    lastSearchAt = Date.now();
    try {
      const wanted = searchByBoard ? null : new Set(keys), seen = new Set();
      let finished = false, membershipMismatch = false;
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (page > 1) {
          const delay = Math.max(0, SEARCH_INTERVAL_MS - (Date.now() - lastSearchAt));
          if (delay) await waitForSearch(delay, signal);
        }
        lastSearchAt = Date.now();
        const params = new URLSearchParams({ fields: 'id,key,summary,status,boards,assignee', perPage: String(PER_PAGE), page: String(page) });
        const body = searchByBoard ? { filter: { boards: Number(id) } } : { keys };
        const found = await request(`${ORIGIN}/v3/issues/_search?${params}`, 'POST', body, signal, credentials);
        if (!Array.isArray(found) || found.length > PER_PAGE) fail('invalid_response');
        for (const raw of found) {
          const parsed = issue(raw, wanted, id);
          if (seen.has(raw.key)) fail('invalid_response');
          seen.add(raw.key);
          if (parsed.uncertain && !searchByBoard) result.uncertainKeys.push(raw.key);
          else if (parsed.member) result.issues.push(parsed.issue);
          if (searchByBoard && !parsed.member) membershipMismatch = true;
        }
        if (found.length < PER_PAGE || (!searchByBoard && seen.size === keys.length)) { finished = true; break; }
      }
      result.missingKeys = keys.filter(key => !seen.has(key));
      if (!finished) result.issuesReason = 'page_limit';
      if (membershipMismatch) result.issuesReason = 'membership_mismatch';
      return result;
    } finally { searchBusy = false; }
  }
  // The caller must authorize the board before using this projection. Only this
  // exact frozen result is accepted for creation in the same credential session.
  async function getBoardCreationQueue(credentials, id, approvedQueues, { signal } = {}) {
    id = boardId(id);
    return request(`${ORIGIN}/v3/boards/${id}`, 'GET', undefined, signal, credentials, {
      project(value) {
        if (!object(value) || boardId(value.id, 'invalid_response') !== id || !object(value.defaultQueue)) fail('invalid_response');
        const raw = value.defaultQueue;
        if (typeof raw.id !== 'string' || !/^[1-9][0-9]{0,14}$/.test(raw.id) || !Number.isSafeInteger(Number(raw.id)) ||
            !validQueueKey(raw.key)) fail('invalid_response');
        const queue = { id: raw.id, key: raw.key };
        if (raw.display !== undefined) queue.display = text(raw.display, 256);
        Object.freeze(queue);
        approvedQueues.add(queue);
        return queue;
      },
    });
  }

  async function createIssue(credentials, payload, approvedQueues, { signal } = {}) {
    if (!plainFields(payload, ['queue', 'summary', 'description', 'unique'], ['queue', 'summary']) ||
        !approvedQueues.has(payload.queue)) fail('invalid_input');
    const queue = payload.queue;
    const body = { queue: queue.key, summary: text(payload.summary, 4096, 'invalid_input') };
    if (Object.hasOwn(payload, 'description')) body.description = bodyText(payload.description, MAX_DESCRIPTION, 'invalid_input', true);
    if (Object.hasOwn(payload, 'unique')) body.unique = text(payload.unique, 4096, 'invalid_input');
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_WRITE_BYTES) fail('invalid_input');
    // Notifications default to on; opt out explicitly rather than notify subscribers.
    return request(`${ORIGIN}/v3/issues?notify=false`, 'POST', body, signal, credentials, {
      expectedStatus: 201, write: true,
      project(value) {
        if (!object(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) ||
            !validKey(value.key) || !value.key.startsWith(`${queue.key}-`) ||
            !Number.isSafeInteger(value.version) || value.version < 0) fail('invalid_response');
        return { id: value.id, key: value.key, version: value.version };
      },
    });
  }

  async function getMyself(credentials, { signal } = {}) {
    return request(`${ORIGIN}/v3/myself`, 'GET', undefined, signal, credentials, { principal: true });
  }

  async function getIssue(credentials, key, { signal } = {}) {
    issueKey(key);
    const params = new URLSearchParams({ fields: 'id,key,summary,description,status,assignee,boards,version' });
    const value = await request(`${ORIGIN}/v3/issues/${key}?${params}`, 'GET', undefined, signal, credentials);
    if (!object(value) || value.key !== key || !Array.isArray(value.boards) || value.boards.length > 500 ||
        !Number.isSafeInteger(value.version) || value.version < 0) fail('invalid_response');
    const boards = value.boards.map(b => {
      if (!object(b)) fail('invalid_response');
      return { id: boardId(b.id, 'invalid_response') };
    });
    const id = typeof value.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.id) ? value.id : undefined;
    return { ...(id ? { id } : {}), key, summary: text(value.summary, 4096),
      description: value.description == null ? '' : bodyText(value.description, MAX_DESCRIPTION, 'invalid_response', true),
      status: status(value.status), ...assignee(value.assignee), boards, version: value.version };
  }

  // One page per call. A completed traversal is not a snapshot: Tracker recalculates pages.
  async function getComments(credentials, key, { signal, cursor } = {}) {
    issueKey(key);
    if (cursor !== undefined && !validCommentCursor(cursor)) fail('invalid_input');
    const params = new URLSearchParams({ perPage: String(MAX_COMMENTS) });
    if (cursor !== undefined) params.set('id', cursor);
    return request(`${ORIGIN}/v3/issues/${encodeURIComponent(key)}/comments?${params}`, 'GET', undefined, signal, credentials, {
      project(values, headers) {
        if (!Array.isArray(values) || values.length > MAX_COMMENTS) fail('invalid_response');
        const seen = new Set();
        const comments = values.map(value => {
          if (!object(value) || !object(value.createdBy) || !Number.isSafeInteger(value.version) || value.version < 0) fail('invalid_response');
          const id = typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id >= 0 ? String(value.id) : value.id;
          if (!validCommentCursor(id) || seen.has(id) || id === cursor) fail('invalid_response');
          seen.add(id);
          const createdAt = text(value.createdAt, 40);
          if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) fail('invalid_response');
          return { id, text: bodyText(value.text, MAX_COMMENT, 'invalid_response', true), version: value.version,
            createdBy: { id: text(value.createdBy.id, 128), display: text(value.createdBy.display, 256) }, createdAt };
        });
        const link = commentNextCursor(headers, key);
        const nextCursor = link.next;
        if (nextCursor !== null && (!comments.length || (cursor !== undefined && Number(nextCursor) <= Number(cursor)))) fail('invalid_response');
        // Tracker may silently cap pages below our requested size, so no Link
        // cannot prove completion or provide a trustworthy continuation cursor.
        const complete = link.present && nextCursor === null;
        return { comments, complete, nextCursor };
      },
    });
  }

  // Single-comment lookup is used as a best-effort baseline, not an atomic CAS.
  async function getComment(credentials, key, id, { signal } = {}) {
    issueKey(key);
    if (!validTransitionId(id)) fail('invalid_input');
    return request(`${ORIGIN}/v3/issues/${key}/comments/${id}`, 'GET', undefined, signal, credentials, {
      project(value) {
        if (!object(value)) fail('invalid_response');
        const actualId = typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id >= 0 ? String(value.id) : value.id;
        if (actualId !== id || !Number.isSafeInteger(value.version) || value.version < 0) fail('invalid_response');
        return { id, version: value.version };
      },
    });
  }

  async function editComment(credentials, key, comment, { signal } = {}) {
    issueKey(key);
    if (!object(comment) || Object.keys(comment).length !== 2 || !Object.hasOwn(comment, 'id') || !Object.hasOwn(comment, 'text') || !validTransitionId(comment.id)) fail('invalid_input');
    bodyText(comment.text, MAX_COMMENT, 'invalid_input');
    const body = { text: comment.text };
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_WRITE_BYTES) fail('invalid_input');
    return request(`${ORIGIN}/v3/issues/${key}/comments/${comment.id}`, 'PATCH', body, signal, credentials, {
      write: true,
      project(value) {
        if (!object(value)) fail('invalid_response');
        const id = typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id >= 0 ? String(value.id) : value.id;
        if (id !== comment.id || !Number.isSafeInteger(value.version) || value.version < 0) fail('invalid_response');
        return { id, version: value.version };
      },
    });
  }

  async function updateIssue(credentials, key, changes, { signal } = {}) {
    issueKey(key);
    if (!object(changes) || Object.keys(changes).some(k => !['expectedVersion', 'summary', 'description', 'assignee'].includes(k)) ||
        !Object.hasOwn(changes, 'expectedVersion') || !Number.isSafeInteger(changes.expectedVersion) || changes.expectedVersion < 0) fail('invalid_input');
    const body = {};
    if (Object.hasOwn(changes, 'summary')) body.summary = text(changes.summary, 4096, 'invalid_input');
    if (Object.hasOwn(changes, 'description')) body.description = bodyText(changes.description, MAX_DESCRIPTION, 'invalid_input', true);
    if (Object.hasOwn(changes, 'assignee')) {
      if (changes.assignee !== null) text(changes.assignee, 128, 'invalid_input');
      body.assignee = changes.assignee;
    }
    if (!Object.keys(body).length || Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_WRITE_BYTES) fail('invalid_input');
    return request(`${ORIGIN}/v3/issues/${key}?version=${changes.expectedVersion}`, 'PATCH', body, signal, credentials, {
      write: true,
      project(value) {
        if (!object(value) || value.key !== key || !Number.isSafeInteger(value.version) || value.version < 0) fail('invalid_response');
        return { version: value.version };
      },
    });
  }

  async function listTransitions(credentials, key, { signal } = {}) {
    issueKey(key);
    const values = await request(`${ORIGIN}/v3/issues/${key}/transitions`, 'GET', undefined, signal, credentials);
    if (!Array.isArray(values) || values.length > MAX_TRANSITIONS) fail('invalid_response');
    const seen = new Set();
    return values.map(value => {
      if (!object(value) || !validTransitionId(value.id) || seen.has(value.id)) fail('invalid_response');
      seen.add(value.id);
      const to = status(value.to);
      return { id: value.id, display: value.display == null ? to.display : text(value.display, 256), to };
    });
  }

  async function addComment(credentials, key, comment, { signal } = {}) {
    issueKey(key);
    bodyText(comment, MAX_COMMENT, 'invalid_input');
    return request(`${ORIGIN}/v3/issues/${key}/comments?isAddToFollowers=false`, 'POST', { text: comment }, signal, credentials, {
      expectedStatus: 201, write: true,
      project(value) {
        if (!object(value)) fail('invalid_response');
        const id = typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id >= 0 ? String(value.id) : value.id;
        if (!validTransitionId(id)) fail('invalid_response');
        return { id };
      },
    });
  }

  async function executeTransition(credentials, key, transitionId, { signal } = {}) {
    issueKey(key);
    if (!validTransitionId(transitionId)) fail('invalid_input');
    return request(`${ORIGIN}/v3/issues/${key}/transitions/${transitionId}/_execute`, 'POST', {}, signal, credentials, {
      write: true,
      project(value) {
        if (!object(value) && !(Array.isArray(value) && value.length <= 500)) fail('invalid_response');
        return {};
      },
    });
  }

  async function openSession({ signal } = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) fail('invalid_input');
    if (signal?.aborted) fail('cancelled');
    let timer, onAbort;
    const stopped = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new TrackerError('timeout')), TIMEOUT_MS);
      onAbort = () => reject(new TrackerError('cancelled'));
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const raw = await Promise.race([stopped, Promise.resolve().then(async () => {
        if (signal?.aborted) fail('cancelled');
        try { return await getCredentials(); } catch { fail('credentials_unavailable'); }
      })]);
      if (signal?.aborted) fail('cancelled');
      if (!object(raw)) fail('invalid_credentials');
      let credentials;
      try { credentials = Object.freeze({ token: raw.token, tokenType: raw.tokenType, orgId: raw.orgId, orgType: raw.orgType }); }
      catch { fail('invalid_credentials'); }
      credentialHeaders(credentials);
      const identity = createHmac('sha256', identityKey).update(JSON.stringify([credentials.token, credentials.tokenType, credentials.orgId, credentials.orgType])).digest('hex');
      const approvedQueues = new WeakSet();
      return Object.freeze({ identity,
        listBoards: options => listBoards(credentials, options),
        getBoardOverview: (id, options) => getBoardOverview(credentials, id, options),
        getBoardCreationQueue: (id, options) => getBoardCreationQueue(credentials, id, approvedQueues, options),
        createIssue: (payload, options) => createIssue(credentials, payload, approvedQueues, options),
        getIssue: (key, options) => getIssue(credentials, key, options),
        getMyself: options => getMyself(credentials, options),
        async getAccountScope(options) {
          if (!getAccountScope) fail('invalid_credentials');
          const { uid } = await getMyself(credentials, options);
          let scope;
          try { scope = await getAccountScope({ orgType: credentials.orgType, orgId: credentials.orgId, principalId: String(uid) }); }
          catch { fail('invalid_credentials'); }
          if (typeof scope !== 'string' || !/^[0-9a-f]{64}$/.test(scope)) fail('invalid_credentials');
          return scope;
        },
        getComments: (key, options) => getComments(credentials, key, options),
        getComment: (key, id, options) => getComment(credentials, key, id, options),
        editComment: (key, comment, options) => editComment(credentials, key, comment, options),
        updateIssue: (key, changes, options) => updateIssue(credentials, key, changes, options),
        listTransitions: (key, options) => listTransitions(credentials, key, options),
        addComment: (key, comment, options) => addComment(credentials, key, comment, options),
        executeTransition: (key, transitionId, options) => executeTransition(credentials, key, transitionId, options) });
    } catch (error) {
      if (error instanceof TrackerError) throw error;
      fail('invalid_credentials');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
    }
  }
  async function identity(options) { return (await openSession(options)).identity; }
  async function checkedRun(name, id, options) {
    const session = await openSession({ signal: options?.signal });
    const result = name === 'listBoards' ? await session.listBoards(options) : await session.getBoardOverview(id, options);
    if ((await identity({ signal: options?.signal })) !== session.identity) fail('credential_changed');
    return result;
  }
  return Object.freeze({ openSession, identity,
    listBoards: options => checkedRun('listBoards', undefined, options),
    getBoardOverview: (id, options) => checkedRun('getBoardOverview', id, options) });
}
