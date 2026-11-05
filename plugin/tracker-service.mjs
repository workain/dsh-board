// Owner authorization belongs to the host's exact ctx.connection routes, not
// this service. Never expose this object or its methods to an untrusted caller.
// The host constructs `tracker` with fixed, server-owned credential resolution;
// this module accepts neither credentials nor Tracker URLs from HTTP clients.
export const MAX_BODY_BYTES = 64 * 1024;
const TIMEOUT_MS = 15_000;
const LIST_TTL_MS = 30_000;
const MAX_PENDING = 64;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const BOARD = /^[1-9][0-9]{0,14}$/;
const ISSUE = /^[A-Z][A-Z0-9_]{0,31}-[1-9][0-9]{0,14}$/;
const TRANSITION = /^[A-Za-z0-9_-]{1,128}$/;
const TOOL_SCOPE_TTL_MS = 60_000;
const MAX_COMMENT = 48 * 1024;

class ServiceError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new ServiceError(code, status); };
const invalid = () => fail('invalid', 400);
function shape(v, fields) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype ||
      Reflect.ownKeys(v).length !== fields.length || fields.some(k => {
        const d = Object.getOwnPropertyDescriptor(v, k);
        return !d || !d.enumerable || !('value' in d);
      })) invalid();
}
function workspaceId(v) { if (typeof v !== 'string' || !ID.test(v)) invalid(); }
function boardId(v) { if (typeof v !== 'string' || !BOARD.test(v) || !Number.isSafeInteger(Number(v))) invalid(); }
function revision(v) { if (!Number.isSafeInteger(v) || v < 0) invalid(); }
function boardIds(v) {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length > 500 || Reflect.ownKeys(v).length !== v.length + 1) invalid();
  const seen = new Set();
  for (let i = 0; i < v.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    if (!d || !d.enumerable || !('value' in d)) invalid();
    boardId(d.value); if (seen.has(d.value)) invalid(); seen.add(d.value);
  }
}
function issueKeys(v) {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length > 100 || Reflect.ownKeys(v).length !== v.length + 1) invalid();
  const seen = new Set();
  for (let i = 0; i < v.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    if (!d || !d.enumerable || !('value' in d) || typeof d.value !== 'string' || !ISSUE.test(d.value) || seen.has(d.value)) invalid();
    seen.add(d.value);
  }
}
function checkCommand(c) {
  if (!c || typeof c !== 'object') invalid();
  switch (c.op) {
    case 'configuration.configure':
      shape(c, ['op', 'expectedRevision', 'orgType']); revision(c.expectedRevision);
      if (!['cloud', 'org'].includes(c.orgType)) invalid(); break;
    case 'boards.list': shape(c, ['op']); break;
    case 'workspace.select':
      shape(c, ['op', 'expectedRevision', 'workspaceId', 'boardIds']); revision(c.expectedRevision); workspaceId(c.workspaceId); boardIds(c.boardIds); break;
    case 'board.read':
      shape(c, ['op', 'workspaceId', 'boardId', 'issueKeys']); workspaceId(c.workspaceId); boardId(c.boardId); issueKeys(c.issueKeys); break;
    default: invalid();
  }
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
} });
function cancel(body) { try { Promise.resolve(body?.cancel()).catch(() => {}); } catch {} }
async function readBody(request, signal) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) { cancel(request.body); fail('body_too_large', 413); }
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type') || '')) { cancel(request.body); fail('content_type', 415); }
  if (!request.body) invalid();
  const reader = request.body.getReader(), chunks = []; let size = 0, count = 0, completed = false;
  const abort = () => cancel(reader);
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) { completed = true; break; }
      if (!(value instanceof Uint8Array)) invalid();
      if (++count > 4096) fail('body_too_large', 413);
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) fail('body_too_large', 413);
      if (value.byteLength) chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    if (!completed) cancel(reader);
    try { reader.releaseLock(); } catch {}
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { invalid(); }
}
function raceAbort(work, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  let onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return Promise.race([Promise.resolve().then(work), stopped]).finally(() => signal.removeEventListener('abort', onAbort));
}
function safeError(error, signal) {
  if (signal.aborted) return { code: signal.reason?.name === 'TimeoutError' ? 'timeout' : 'aborted', status: signal.reason?.name === 'TimeoutError' ? 504 : 499 };
  if (error instanceof ServiceError) return { code: error.code, status: error.status };
  if (error?.name === 'TrackerError') {
    const statuses = { invalid_input: 400, invalid_credentials: 503, credentials_unavailable: 503, unauthorized: 401,
      forbidden: 403, not_found: 404, rate_limited: 429, client_rate_limited: 429, timeout: 504,
      cancelled: 499, network_error: 502, invalid_response: 502, response_too_large: 502, redirect: 502, http_error: 502 };
    if (Object.hasOwn(statuses, error.code)) return { code: error.code, status: statuses[error.code] };
  }
  if (error?.name === 'TrackerSettingsError' && error.code === 'too_large') return { code: 'settings_too_large', status: 413 };
  return { code: 'internal', status: 500 };
}

/**
 * Construct with a profile-scoped settings store, a server-configured Tracker
 * client, and the live workspace registry. The host must enforce owner access.
 * The Tracker adapter supplies openSession({signal}) returning a credential-bound
 * {identity, listBoards, getBoardOverview}; identity is opaque and internal only.
 * GET: configuration.read (no body/query); POST: exact command JSON.
 * Calls are bounded, and all failures are sanitized. No credentials are accepted.
 * read(signal?) and command(command, signal?) expose the same trusted API.
 */
export function createTrackerService({ settings, tracker, workspaceRegistry } = {}) {
  if (!settings || typeof settings.read !== 'function' || typeof settings.compareAndSet !== 'function' ||
      !tracker || typeof tracker.openSession !== 'function' ||
      !workspaceRegistry || typeof workspaceRegistry.get !== 'function') throw new TypeError('Invalid tracker service dependencies');
  let listing = null, pending = 0, generation = 0, closed = false, closing;
  const bindings = new Map(), active = new Set();
  const lifecycle = new AbortController();
  async function session(signal) {
    const value = await raceAbort(() => tracker.openSession({ signal }), signal);
    if (!value || typeof value.identity !== 'string' || value.identity.length < 1 || value.identity.length > 256 ||
        typeof value.listBoards !== 'function' || typeof value.getBoardOverview !== 'function') fail('invalid_tracker_response', 502);
    return value;
  }
  function current() { return settings.read(); }
  function configured(state) { if (!state.settings.connection) fail('not_configured', 409); }
  function workspace(id, incarnation) {
    const item = workspaceRegistry.get(id);
    if (!item || typeof item.createdAt !== 'string' || !item.createdAt) { bindings.delete(id); fail('workspace_not_found', 404); }
    if (incarnation !== undefined && item.createdAt !== incarnation) { bindings.delete(id); fail('needs_reselect', 409); }
    return item.createdAt;
  }
  function cas(expected, next) {
    const result = settings.compareAndSet(expected, next);
    if (!result.ok) fail('conflict', 409);
    return result.revision;
  }
  function invalidate() { listing = null; generation++; }
  async function readImpl(signal) {
    signal.throwIfAborted();
    const state = current();
    let identity;
    if (state.settings.connection && bindings.size) {
      try { identity = (await session(signal)).identity; }
      catch (error) { if (signal.aborted) throw error; bindings.clear(); }
      signal.throwIfAborted();
      if (current().revision !== state.revision) fail('conflict', 409);
    }
    // Persisted selections are never sufficient after restart or credential rotation.
    const needsReselect = Object.keys(state.settings.workspaces).filter(id => {
      const binding = bindings.get(id), item = workspaceRegistry.get(id);
      const needed = !binding || binding.identity !== identity || !item || item.createdAt !== binding.incarnation || binding.revision !== state.revision;
      if (needed) bindings.delete(id);
      return needed;
    });
    return { revision: state.revision, configured: !!state.settings.connection,
      orgType: state.settings.connection?.orgType ?? null, workspaces: structuredClone(state.settings.workspaces), needsReselect };
  }
  async function commandImpl(c, signal) {
    checkCommand(c); signal.throwIfAborted();
    const state = current();
    if (c.op === 'configuration.configure') {
      if (state.revision !== c.expectedRevision) fail('conflict', 409);
      // Reconfiguration invalidates every board authorization, even for the same type.
      const next = { connection: { tokenRef: 'TOKEN', orgIdRef: 'ORG_ID', orgType: c.orgType }, workspaces: {} };
      const nextRevision = cas(c.expectedRevision, next); invalidate(); bindings.clear();
      return { revision: nextRevision, configured: true, orgType: c.orgType, workspaces: {}, needsReselect: [] };
    }
    configured(state);
    if (c.op === 'boards.list') {
      // A failed or interrupted list must never leave previous selection evidence valid.
      invalidate(); const version = generation;
      const account = await session(signal);
      const result = await raceAbort(() => account.listBoards({ signal }), signal);
      const afterAccount = await session(signal);
      signal.throwIfAborted();
      const after = current();
      if (afterAccount.identity !== account.identity) { bindings.clear(); fail('needs_reselect', 409); }
      if (after.revision !== state.revision || version !== generation) fail('conflict', 409);
      if (!result || !Array.isArray(result.boards) || result.boards.length > 500 || typeof result.complete !== 'boolean' || !(result.reason === null || result.reason === 'page_limit')) fail('invalid_tracker_response', 502);
      const ids = new Set(), boards = [];
      for (const board of result.boards) {
        if (!board || typeof board !== 'object' || typeof board.id !== 'string' || !BOARD.test(board.id) || !Number.isSafeInteger(Number(board.id)) || typeof board.name !== 'string' || board.name.length < 1 || board.name.length > 256 || ids.has(board.id)) fail('invalid_tracker_response', 502);
        ids.add(board.id); boards.push({ id: board.id, name: board.name });
      }
      listing = { ids, identity: account.identity, revision: state.revision, expires: Date.now() + LIST_TTL_MS };
      return { boards, complete: result.complete, reason: result.reason };
    }
    const incarnation = workspace(c.workspaceId);
    if (c.op === 'workspace.select') {
      if (state.revision !== c.expectedRevision) fail('conflict', 409);
      if (c.boardIds.length && (!listing || listing.revision !== state.revision || listing.expires <= Date.now() || c.boardIds.some(id => !listing.ids.has(id)))) fail('board_list_required', 409);
      const evidence = listing;
      const account = await session(signal);
      if (c.boardIds.length && (!evidence || evidence !== listing || evidence.expires <= Date.now() || evidence.identity !== account.identity)) { invalidate(); bindings.clear(); fail('needs_reselect', 409); }
      const workspaces = { ...state.settings.workspaces, [c.workspaceId]: [...c.boardIds] };
      workspace(c.workspaceId, incarnation); signal.throwIfAborted();
      const nextRevision = cas(c.expectedRevision, { connection: state.settings.connection, workspaces });
      invalidate();
      // Settings revision changed, but previously activated workspaces retain their
      // binding only while the same account and incarnation remain in force.
      for (const [id, binding] of bindings) {
        if (binding.revision === state.revision && binding.identity === account.identity && workspaceRegistry.get(id)?.createdAt === binding.incarnation) binding.revision = nextRevision;
        else bindings.delete(id);
      }
      bindings.set(c.workspaceId, { identity: account.identity, incarnation, revision: nextRevision });
      return { revision: nextRevision, workspaceId: c.workspaceId, boardIds: [...c.boardIds] };
    }
    if (!Object.hasOwn(state.settings.workspaces, c.workspaceId) || !state.settings.workspaces[c.workspaceId].includes(c.boardId)) fail('board_not_selected', 403);
    const binding = bindings.get(c.workspaceId);
    if (!binding || binding.incarnation !== incarnation || binding.revision !== state.revision) { bindings.delete(c.workspaceId); fail('needs_reselect', 409); }
    const account = await session(signal);
    if (account.identity !== binding.identity) { bindings.clear(); invalidate(); fail('needs_reselect', 409); }
    workspace(c.workspaceId, incarnation); signal.throwIfAborted();
    if (current().revision !== state.revision || bindings.get(c.workspaceId) !== binding) fail('conflict', 409);
    const value = await raceAbort(() => account.getBoardOverview(c.boardId, { issueKeys: [...c.issueKeys], searchByBoard: c.issueKeys.length === 0, signal }), signal);
    const afterAccount = await session(signal);
    signal.throwIfAborted();
    workspace(c.workspaceId, incarnation);
    const after = current();
    if (afterAccount.identity !== account.identity) { bindings.clear(); invalidate(); fail('needs_reselect', 409); }
    if (after.revision !== state.revision || !after.settings.connection || !Object.hasOwn(after.settings.workspaces, c.workspaceId) || !after.settings.workspaces[c.workspaceId].includes(c.boardId)) fail('conflict', 409);
    if (bindings.get(c.workspaceId) !== binding || binding.revision !== state.revision) fail('needs_reselect', 409);
    // Even a well-formed search is never a claim of complete board membership.
    if (!value || typeof value !== 'object' || value.issuesComplete !== false) fail('invalid_tracker_response', 502);
    return value;
  }
  function run(work, callerSignal) {
    if (closed || active.size >= MAX_PENDING) return Promise.reject(new ServiceError('unavailable', 503));
    if (callerSignal !== undefined && !(callerSignal instanceof AbortSignal)) return Promise.reject(new ServiceError('invalid', 400));
    const signal = AbortSignal.any([lifecycle.signal, AbortSignal.timeout(TIMEOUT_MS), ...(callerSignal ? [callerSignal] : [])]);
    const job = Promise.resolve().then(() => { signal.throwIfAborted(); return work(signal); });
    active.add(job);
    job.then(() => active.delete(job), () => active.delete(job));
    return job;
  }
  const read = signal => run(s => readImpl(s), signal);
  const command = (value, signal) => run(s => commandImpl(value, s), signal);
  function close() {
    if (!closing) {
      closed = true;
      lifecycle.abort(new ServiceError('unavailable', 503));
      invalidate(); bindings.clear();
      closing = Promise.allSettled([...active]).then(() => undefined);
    }
    return closing;
  }
  async function fetch(request) {
    if (closed || pending >= MAX_PENDING) { cancel(request.body); return response({ error: { code: 'unavailable' } }, 503); }
    pending++;
    const timeout = AbortSignal.timeout(TIMEOUT_MS), signal = AbortSignal.any([request.signal, timeout, lifecycle.signal]);
    try {
      const url = new URL(request.url);
      if (url.search || url.hash) { cancel(request.body); invalid(); }
      if (request.method === 'GET') {
        if (request.body || request.headers.has('transfer-encoding') || (request.headers.has('content-length') && request.headers.get('content-length') !== '0')) { cancel(request.body); invalid(); }
        return response(await raceAbort(() => read(signal), signal));
      }
      if (request.method !== 'POST') { cancel(request.body); return response({ error: { code: 'method_not_allowed' } }, 405); }
      const body = await raceAbort(() => readBody(request, signal), signal);
      return response(await raceAbort(() => command(body, signal), signal));
    } catch (error) {
      const result = closed ? { code: 'unavailable', status: 503 } : safeError(error, signal);
      return response({ error: { code: result.code } }, result.status);
    } finally { pending--; }
  }
  // Internal only: sessionId comes from the host's exec.agent, never from JSON.
  // The scope is tied to a single binding/revision/incarnation and expires quickly.
  function toolScope(options) {
    try { return makeToolScope(options); }
    catch (error) { const safe = safeError(error, lifecycle.signal); throw new ServiceError(safe.code, safe.status); }
  }
  function makeToolScope(options) {
    shape(options, ['workspaceId', 'sessionId', 'signal']);
    const { workspaceId: wid, sessionId: sid, signal: callerSignal } = options;
    workspaceId(wid); workspaceId(sid);
    if (callerSignal !== undefined && !(callerSignal instanceof AbortSignal)) invalid();
    const initial = current(), incarnation = workspace(wid), binding = bindings.get(wid);
    configured(initial);
    const ids = initial.settings.workspaces[wid];
    if (!Array.isArray(ids) || !ids.length) fail('board_not_selected', 403);
    boardIds(ids);
    if (!binding || binding.incarnation !== incarnation || binding.revision !== initial.revision) fail('needs_reselect', 409);
    const selected = Object.freeze([...ids]);
    const selectedIdentity = binding.identity;
    const expires = Date.now() + TOOL_SCOPE_TTL_MS;

    function check(signal) {
      signal.throwIfAborted();
      if (Date.now() >= expires) fail('scope_expired', 409);
      const item = workspaceRegistry.get(wid);
      if (!item || item.createdAt !== incarnation) fail('needs_reselect', 409);
      if (!Array.isArray(item.sessionIds) || !item.sessionIds.includes(sid) ||
          (workspaceRegistry.archivedSessionIds != null && !Array.isArray(workspaceRegistry.archivedSessionIds)) ||
          workspaceRegistry.archivedSessionIds?.includes(sid) ||
          (item.archivedSessionIds != null && (!Array.isArray(item.archivedSessionIds) || item.archivedSessionIds.includes(sid)))) fail('session_not_in_workspace', 403);
      const state = current();
      if (state.revision !== initial.revision || !state.settings.connection || bindings.get(wid) !== binding ||
          binding.revision !== initial.revision || binding.incarnation !== incarnation || binding.identity !== selectedIdentity ||
          !Array.isArray(state.settings.workspaces[wid]) || state.settings.workspaces[wid].length !== selected.length ||
          selected.some((id, index) => state.settings.workspaces[wid][index] !== id)) fail('needs_reselect', 409);
    }
    check(callerSignal ?? lifecycle.signal);
    async function account(signal) {
      check(signal);
      let result;
      try { result = await session(signal); }
      catch (error) { check(signal); throw error; }
      check(signal);
      if (result.identity !== selectedIdentity) { bindings.clear(); invalidate(); fail('needs_reselect', 409); }
      return result;
    }
    async function checkedAwait(work, signal) {
      check(signal);
      try {
        const value = await raceAbort(work, signal);
        check(signal);
        await account(signal);
        check(signal);
        return value;
      } catch (error) {
        check(signal);
        // Credentials may rotate during a failed operation too.
        await account(signal);
        check(signal);
        throw error;
      }
    }
    function resultText(value, max, nullable = false) {
      if (nullable && value === null) return null;
      if (typeof value !== 'string' || value.length > max || (!nullable && !value.trim()) || (nullable ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u : /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u).test(value)) fail('invalid_tracker_response', 502);
      return value;
    }
    function safeStatus(value) {
      if (!value || typeof value !== 'object') fail('invalid_tracker_response', 502);
      return { id: resultText(value.id, 128), key: resultText(value.key, 128), display: resultText(value.display, 256) };
    }
    function safeIssue(value, key, includeDescription = true) {
      if (!value || typeof value !== 'object' || value.key !== key || !Array.isArray(value.boards) || value.boards.length > 500) fail('issue_not_in_selected_boards', 403);
      let member = false;
      for (const board of value.boards) {
        if (!board || typeof board !== 'object' || typeof board.id !== 'string' || !BOARD.test(board.id) || !Number.isSafeInteger(Number(board.id))) fail('issue_not_in_selected_boards', 403);
        if (selected.includes(board.id)) member = true;
      }
      if (!member) fail('issue_not_in_selected_boards', 403);
      if (typeof value.assigneeKnown !== 'boolean' || (value.assigneeKnown && value.assignee !== null && (!value.assignee || typeof value.assignee !== 'object'))) fail('invalid_tracker_response', 502);
      const assignee = value.assigneeKnown && value.assignee !== null ? { id: resultText(value.assignee.id, 128), display: resultText(value.assignee.display, 256) } : null;
      const result = { key, summary: resultText(value.summary, 4096), status: safeStatus(value.status), assigneeKnown: value.assigneeKnown, assignee };
      if (includeDescription) {
        result.description = resultText(value.description, 48 * 1024, true);
        if (!(value.version === null || (Number.isSafeInteger(value.version) && value.version >= 0))) fail('invalid_tracker_response', 502);
        result.version = value.version;
      }
      return result;
    }
    function keyArg(value) { if (typeof value !== 'string' || !ISSUE.test(value)) invalid(); }
    async function issue(key, signal) {
      const a = await account(signal);
      if (typeof a.getIssue !== 'function') fail('invalid_tracker_response', 502);
      return safeIssue(await checkedAwait(() => a.getIssue(key, { signal }), signal), key);
    }
    function safeTransitions(value) {
      if (!Array.isArray(value) || value.length > 500) fail('invalid_tracker_response', 502);
      const seen = new Set();
      return value.map(item => {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !TRANSITION.test(item.id) || seen.has(item.id)) fail('invalid_tracker_response', 502);
        seen.add(item.id);
        return { id: item.id, display: resultText(item.display, 256), to: safeStatus(item.to) };
      });
    }
    async function transitions(key, signal) {
      await issue(key, signal);
      const a = await account(signal);
      if (typeof a.listTransitions !== 'function') fail('invalid_tracker_response', 502);
      const result = safeTransitions(await checkedAwait(() => a.listTransitions(key, { signal }), signal));
      await issue(key, signal);
      return result;
    }
    function execute(work) {
      return run(async signal => {
        try { return await work(signal); }
        catch (error) {
          if (error instanceof ServiceError && error.code === 'outcome_unknown') throw error;
          const safe = safeError(error, signal); throw new ServiceError(safe.code, safe.status);
        }
      }, callerSignal).catch(error => {
        if (error instanceof ServiceError && error.code === 'outcome_unknown') throw error;
        const safe = safeError(error, callerSignal ?? lifecycle.signal);
        throw new ServiceError(safe.code, safe.status);
      });
    }
    async function write(signal, key, kind, value, expectedTo) {
      await issue(key, signal);
      if (kind === 'executeTransition') {
        const available = await transitions(key, signal);
        if (!available.some(item => item.id === value && item.to.id === expectedTo.id && item.to.key === expectedTo.key && item.to.display === expectedTo.display)) fail('transition_not_available', 409);
      }
      const a = await account(signal);
      if (typeof a[kind] !== 'function') fail('invalid_tracker_response', 502);
      // Last synchronous check before dispatch. Revocation and the remote send cannot
      // be atomic; after dispatch any uncertain result is reported without retry.
      check(signal);
      let result, dispatched = false, returned = false;
      const operation = a[kind];
      try {
        result = await raceAbort(() => { check(signal); dispatched = true; return operation(key, value, { signal }); }, signal);
        returned = true;
        check(signal);
        await account(signal);
        check(signal);
      } catch (error) {
        if (dispatched) {
          if (!returned && !signal.aborted && error?.name === 'TrackerError' && ['unauthorized', 'forbidden', 'not_found', 'conflict', 'precondition_failed', 'unprocessable', 'rate_limited', 'invalid_input'].includes(error.code)) {
            try { check(signal); await account(signal); check(signal); }
            catch { fail('outcome_unknown', 502); }
            const statuses = { unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, precondition_failed: 412, unprocessable: 422, rate_limited: 429, invalid_input: 400 };
            fail(error.code, statuses[error.code]);
          }
          fail('outcome_unknown', 502);
        }
        throw error;
      }
      if (kind === 'addComment') {
        if (!result || typeof result.id !== 'string' || !TRANSITION.test(result.id)) fail('outcome_unknown', 502);
        return { id: result.id };
      }
      return { ok: true };
    }
    return Object.freeze({
      selectedBoards: () => execute(async signal => { await account(signal); return [...selected]; }),
      boardRead: input => execute(async signal => {
        shape(input, ['boardId', 'issueKeys']); boardId(input.boardId); issueKeys(input.issueKeys);
        if (!selected.includes(input.boardId)) fail('board_not_selected', 403);
        await account(signal);
        const raw = await checkedAwait(() => commandImpl({ op: 'board.read', workspaceId: wid, boardId: input.boardId, issueKeys: [...input.issueKeys] }, signal), signal);
        if (!raw.board || raw.board.id !== input.boardId || !Array.isArray(raw.columns) || raw.columns.length > 500 || !Array.isArray(raw.issues) || raw.issues.length > 500) fail('invalid_tracker_response', 502);
        const columns = raw.columns.map(column => {
          if (!column || typeof column !== 'object' || !Array.isArray(column.statuses) || column.statuses.length > 500) fail('invalid_tracker_response', 502);
          boardId(column.id);
          return { id: column.id, name: resultText(column.name, 256), statuses: column.statuses.map(safeStatus) };
        });
        // getBoardOverview already validates membership against its search response.
        const issues = raw.issues.map(entry => {
          keyArg(entry?.key);
          if (typeof entry.assigneeKnown !== 'boolean' || (entry.assigneeKnown && entry.assignee !== null && (!entry.assignee || typeof entry.assignee !== 'object'))) fail('invalid_tracker_response', 502);
          const assignee = entry.assigneeKnown && entry.assignee !== null ? { id: resultText(entry.assignee.id, 128), display: resultText(entry.assignee.display, 256) } : null;
          return { key: entry.key, summary: resultText(entry.summary, 4096), status: safeStatus(entry.status), assigneeKnown: entry.assigneeKnown, assignee };
        });
        check(signal);
        return { board: { id: input.boardId, name: resultText(raw.board.name, 256) }, columns, issues, issuesComplete: false,
          issuesReason: ['approximate_board_filter', 'explicit_keys_only', 'board_search_unsupported', 'page_limit', 'membership_mismatch'].includes(raw.issuesReason) ? raw.issuesReason : 'unknown' };
      }),
      getIssue: input => execute(async signal => { shape(input, ['issueKey']); keyArg(input.issueKey); return issue(input.issueKey, signal); }),
      listTransitions: input => execute(async signal => { shape(input, ['issueKey']); keyArg(input.issueKey); return transitions(input.issueKey, signal); }),
      addComment: input => execute(async signal => {
        shape(input, ['issueKey', 'text']); keyArg(input.issueKey);
        if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > MAX_COMMENT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(input.text)) invalid();
        return write(signal, input.issueKey, 'addComment', input.text);
      }),
      executeTransition: input => execute(async signal => {
        shape(input, ['issueKey', 'transitionId', 'expectedTo']); keyArg(input.issueKey);
        if (typeof input.transitionId !== 'string' || !TRANSITION.test(input.transitionId)) invalid();
        shape(input.expectedTo, ['id', 'key', 'display']);
        for (const [name, max] of [['id', 128], ['key', 128], ['display', 256]]) {
          if (typeof input.expectedTo[name] !== 'string' || !input.expectedTo[name].trim() || input.expectedTo[name].length > max || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(input.expectedTo[name])) invalid();
        }
        return write(signal, input.issueKey, 'executeTransition', input.transitionId, input.expectedTo);
      }),
    });
  }
  return Object.freeze({ read, command, fetch, close, toolScope });
}
