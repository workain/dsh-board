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
const validKey = key => typeof key === 'string' && /^[A-Z][A-Z0-9_]{0,31}-[1-9][0-9]{0,14}$/.test(key);
const validTransitionId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
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
  return { member: true, issue: { key: value.key, summary: text(value.summary, 4096), status: status(value.status), ...assignee(value.assignee) } };
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
async function readJson(response, signal) {
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
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)); }
  catch { fail('invalid_response'); }
}

/**
 * createTrackerClient({getCredentials, fetch}) -> {listBoards, getBoardOverview}.
 * getCredentials(): {token, tokenType:'OAuth'|'Bearer', orgId, orgType:'org'|'cloud'}.
 * openSession({signal}) snapshots credentials and exposes an opaque identity and
 * getIssue, listTransitions, addComment and executeTransition. The caller must
 * verify issue.boards against its authorized boards before reads or writes.
 * Issue descriptions and comments are untrusted content, not instructions.
 * Compare with a fresh session identity before publishing session results.
 */
export function createTrackerClient({ getCredentials, fetch: fetchFn = globalThis.fetch } = {}) {
  if (typeof getCredentials !== 'function' || typeof fetchFn !== 'function') fail('invalid_input');
  let searchBusy = false;
  let lastSearchAt = -Infinity;
  const identityKey = randomBytes(32);

  async function request(url, method, body, callerSignal, credentials, { expectedStatus = 200, write = false, project = value => value } = {}) {
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
        return project(await readJson(response, controller.signal));
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
        const params = new URLSearchParams({ fields: 'key,summary,status,boards,assignee', perPage: String(PER_PAGE), page: String(page) });
        const body = searchByBoard ? { filter: { boards: Number(id) } } : { keys };
        const found = await request(`${ORIGIN}/v3/issues/_search?${params}`, 'POST', body, signal, credentials);
        if (!Array.isArray(found) || found.length > PER_PAGE) fail('invalid_response');
        for (const raw of found) {
          const parsed = issue(raw, wanted, id);
          if (seen.has(raw.key)) fail('invalid_response');
          seen.add(raw.key);
          if (parsed.uncertain) result.uncertainKeys.push(raw.key);
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
  async function getIssue(credentials, key, { signal } = {}) {
    issueKey(key);
    const params = new URLSearchParams({ fields: 'key,summary,description,status,assignee,boards,version' });
    const value = await request(`${ORIGIN}/v3/issues/${key}?${params}`, 'GET', undefined, signal, credentials);
    if (!object(value) || value.key !== key || !Array.isArray(value.boards) || value.boards.length > 500 ||
        !Number.isSafeInteger(value.version) || value.version < 0) fail('invalid_response');
    const boards = value.boards.map(b => {
      if (!object(b)) fail('invalid_response');
      return { id: boardId(b.id, 'invalid_response') };
    });
    return { key, summary: text(value.summary, 4096),
      description: value.description == null ? '' : bodyText(value.description, MAX_DESCRIPTION, 'invalid_response', true),
      status: status(value.status), ...assignee(value.assignee), boards, version: value.version };
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
      return Object.freeze({ identity,
        listBoards: options => listBoards(credentials, options),
        getBoardOverview: (id, options) => getBoardOverview(credentials, id, options),
        getIssue: (key, options) => getIssue(credentials, key, options),
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
