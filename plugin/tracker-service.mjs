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
const validCommentCursor = value => typeof value === 'string' && /^(?:0|[1-9][0-9]{0,15})$/.test(value) && Number.isSafeInteger(Number(value));
const TOOL_SCOPE_TTL_MS = 60_000;
const MAX_COMMENT = 48 * 1024;
const MAX_SESSION_LINK_LOOKUPS = 100;
const SESSION_LINK_CONCURRENCY = 5;
const RESELECT_CONCURRENCY = 5;

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
function fields(v, required, optional = []) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) invalid();
  const keys = Reflect.ownKeys(v), allowed = [...required, ...optional];
  if (required.some(k => !keys.includes(k)) || keys.some(k => typeof k !== 'string' || !allowed.includes(k))) invalid();
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(v, key);
    if (!d || !d.enumerable || !('value' in d)) invalid();
  }
}
function issueKey(v) { if (typeof v !== 'string' || !ISSUE.test(v)) invalid(); }
function validSessionId(v) {
  return typeof v === 'string' && v.isWellFormed() && v.length >= 1 && v.length <= 256 && v === v.trim() && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(v);
}
function sessionId(v) { if (!validSessionId(v)) invalid(); }
function inputText(v, max, { empty = false, multiline = false } = {}) {
  const unsafe = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u : /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
  if (typeof v !== 'string' || v.length > max || (!empty && !v.trim()) || unsafe.test(v)) invalid();
}
function checkCommand(c) {
  if (!c || typeof c !== 'object') invalid();
  switch (c.op) {
    case 'configuration.configure':
      shape(c, ['op', 'expectedRevision', 'orgType']); revision(c.expectedRevision);
      if (!['cloud', 'org'].includes(c.orgType)) invalid(); break;
    case 'configuration.setUnattendedIssueCreation':
      shape(c, ['op', 'workspaceId', 'expectedRevision', 'enabled']); workspaceId(c.workspaceId); revision(c.expectedRevision);
      if (typeof c.enabled !== 'boolean') invalid(); break;
    case 'configuration.unattendedRead':
    case 'boards.list': shape(c, ['op']); break;
    case 'workspace.select': case 'workspace.reselect':
      shape(c, ['op', 'expectedRevision', 'workspaceId', 'boardIds']); revision(c.expectedRevision); workspaceId(c.workspaceId); boardIds(c.boardIds); break;
    case 'board.read':
      shape(c, ['op', 'workspaceId', 'boardId', 'issueKeys']); workspaceId(c.workspaceId); boardId(c.boardId); issueKeys(c.issueKeys); break;
    case 'links.read':
      shape(c, ['op', 'workspaceId', 'boardId']); workspaceId(c.workspaceId); boardId(c.boardId); break;
    case 'links.session.read':
      shape(c, ['op', 'workspaceId', 'sessionId']); workspaceId(c.workspaceId); sessionId(c.sessionId); break;
    case 'links.issue.read':
      shape(c, ['op', 'workspaceId', 'boardId', 'issueKey', 'issueId']);
      workspaceId(c.workspaceId); boardId(c.boardId); issueKey(c.issueKey);
      if (typeof c.issueId !== 'string' || !TRANSITION.test(c.issueId)) invalid(); break;
    case 'links.set':
      shape(c, ['op', 'workspaceId', 'boardId', 'issueKey', 'issueId', 'sessionId', 'linked', 'expectedRevision']);
      workspaceId(c.workspaceId); boardId(c.boardId); issueKey(c.issueKey); sessionId(c.sessionId); revision(c.expectedRevision);
      if (typeof c.issueId !== 'string' || !TRANSITION.test(c.issueId)) invalid();
      if (typeof c.linked !== 'boolean') invalid(); break;
    case 'issue.read': case 'issue.comments': case 'issue.transitions':
      fields(c, ['op', 'workspaceId', 'boardId', 'issueKey', 'issueId'], c.op === 'issue.comments' ? ['cursor'] : []); workspaceId(c.workspaceId); boardId(c.boardId); issueKey(c.issueKey);
      if (typeof c.issueId !== 'string' || !TRANSITION.test(c.issueId)) invalid();
      if (Object.hasOwn(c, 'cursor') && !validCommentCursor(c.cursor)) invalid(); break;
    case 'issue.comment':
      shape(c, ['op', 'workspaceId', 'boardId', 'issueKey', 'issueId', 'text']); workspaceId(c.workspaceId); boardId(c.boardId); issueKey(c.issueKey); inputText(c.text, MAX_COMMENT, { multiline: true });
      if (typeof c.issueId !== 'string' || !TRANSITION.test(c.issueId)) invalid(); break;
    case 'issue.editComment':
      shape(c, ['op', 'workspaceId', 'boardId', 'issueKey', 'issueId', 'commentId', 'expectedVersion', 'text']);
      workspaceId(c.workspaceId); boardId(c.boardId); issueKey(c.issueKey); revision(c.expectedVersion);
      if (typeof c.issueId !== 'string' || !TRANSITION.test(c.issueId) || typeof c.commentId !== 'string' || !TRANSITION.test(c.commentId)) invalid();
      inputText(c.text, MAX_COMMENT, { multiline: true }); break;
    case 'issue.transition':
      shape(c, ['op', 'workspaceId', 'boardId', 'issueKey', 'issueId', 'transitionId', 'expectedTo']); workspaceId(c.workspaceId); boardId(c.boardId); issueKey(c.issueKey);
      if (typeof c.issueId !== 'string' || !TRANSITION.test(c.issueId)) invalid();
      if (typeof c.transitionId !== 'string' || !TRANSITION.test(c.transitionId)) invalid();
      shape(c.expectedTo, ['id', 'key', 'display']);
      inputText(c.expectedTo.id, 128); inputText(c.expectedTo.key, 128); inputText(c.expectedTo.display, 256); break;
    case 'issue.update':
      shape(c, ['op', 'workspaceId', 'boardId', 'issueKey', 'issueId', 'changes']); workspaceId(c.workspaceId); boardId(c.boardId); issueKey(c.issueKey);
      if (typeof c.issueId !== 'string' || !TRANSITION.test(c.issueId)) invalid();
      fields(c.changes, ['expectedVersion'], ['summary', 'description', 'assignee']); revision(c.changes.expectedVersion);
      if (!['summary', 'description', 'assignee'].some(k => Object.hasOwn(c.changes, k))) invalid();
      if (Object.hasOwn(c.changes, 'summary')) inputText(c.changes.summary, 4096);
      if (Object.hasOwn(c.changes, 'description')) inputText(c.changes.description, 48 * 1024, { empty: true, multiline: true });
      if (Object.hasOwn(c.changes, 'assignee') && c.changes.assignee !== null) inputText(c.changes.assignee, 128);
      break;
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
  if (error instanceof ServiceError && error.code === 'outcome_unknown') return { code: 'outcome_unknown', status: 502 };
  if (signal.aborted) return { code: signal.reason?.name === 'TimeoutError' ? 'timeout' : 'aborted', status: signal.reason?.name === 'TimeoutError' ? 504 : 499 };
  if (error instanceof ServiceError) return { code: error.code, status: error.status };
  if (error?.name === 'TrackerError') {
    const statuses = { invalid_input: 400, invalid_credentials: 503, credentials_unavailable: 503, unauthorized: 401,
      forbidden: 403, not_found: 404, rate_limited: 429, client_rate_limited: 429, timeout: 504,
      cancelled: 499, network_error: 502, invalid_response: 502, response_too_large: 502, redirect: 502, http_error: 502,
      board_default_queue_unavailable: 409 };
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
 * For unattended creation the host alone constructs toolScope with an optional
 * synchronous assertCaller callback; it must throw (or return false) unless the
 * caller remains an eligible root. allowUnattendedIssueCreation() returns only
 * {enabled, revision}; it confers no authority. A subsequent trusted call to
 * createIssue(input, {unattendedRevision}) checks callback and opt-in repeatedly.
 * Neither callback nor the separate second argument is accepted from tool JSON.
 * Optional links is the synchronous host-owned store; resolveAccountScope receives
 * the exact credential-bound session and resolves a stable 64-hex account namespace.
 * The host owns and closes both dependencies; neither is exposed to callers.
 */
export function createTrackerService({ settings, tracker, workspaceRegistry, links, resolveAccountScope } = {}) {
  if (!settings || typeof settings.read !== 'function' || typeof settings.compareAndSet !== 'function' ||
      !tracker || typeof tracker.openSession !== 'function' ||
      !workspaceRegistry || typeof workspaceRegistry.get !== 'function' ||
      ((links !== undefined || resolveAccountScope !== undefined) &&
       (!links || typeof links.read !== 'function' || typeof links.mutate !== 'function' || typeof resolveAccountScope !== 'function'))) throw new TypeError('Invalid tracker service dependencies');
  let listing = null, pending = 0, facadePending = 0, generation = 0, closed = false, closing;
  const bindings = new Map(), active = new Set(), restorations = new Map();
  let restoreLookups = 0;
  const lookupWaiters = [];
  async function exactRestoreBoard(account, id, signal) {
    if (restoreLookups >= RESELECT_CONCURRENCY) {
      await new Promise((resolve, reject) => {
        let granted = false;
        const wake = () => { granted = true; signal.removeEventListener('abort', abort); resolve(); };
        const abort = () => {
          if (granted) return;
          const index = lookupWaiters.indexOf(wake);
          if (index >= 0) lookupWaiters.splice(index, 1);
          reject(signal.reason);
        };
        lookupWaiters.push(wake);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
      if (signal.aborted) { const next = lookupWaiters.shift(); if (next) next(); else restoreLookups--; signal.throwIfAborted(); }
    } else { signal.throwIfAborted(); restoreLookups++; }
    // A misbehaving adapter may ignore abort. Keep its permit until the actual
    // operation settles, even when the caller has already stopped waiting.
    const operation = Promise.resolve().then(() => { signal.throwIfAborted(); return account.getBoardIdentity(id, { signal }); });
    operation.finally(() => { const next = lookupWaiters.shift(); if (next) next(); else restoreLookups--; }).catch(() => {});
    return raceAbort(() => operation, signal);
  }
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
  function optedIn(state, wid, scope, incarnation) {
    const map = state.settings.unattendedIssueCreation;
    const entry = map && typeof map === 'object' && Object.hasOwn(map, wid) ? map[wid] : undefined;
    return typeof scope === 'string' && /^[0-9a-f]{64}$/.test(scope) && !!entry && typeof entry === 'object' &&
      entry.accountScope === scope && entry.incarnation === incarnation;
  }
  // Owner-only local projection, never claims that a stored grant is active.
  // This path must not wait on Tracker so a stuck GET cannot prevent revocation.
  function storedGrants(state) {
    const result = {}, map = state.settings.unattendedIssueCreation;
    for (const id of Object.keys(state.settings.workspaces)) {
      Object.defineProperty(result, id, { enumerable: true, configurable: true, writable: true,
        value: !!map && Object.hasOwn(map, id) });
    }
    if (map) for (const id of Object.keys(map)) {
      if (!Object.hasOwn(result, id) && workspaceRegistry.get(id)) {
        Object.defineProperty(result, id, { enumerable: true, configurable: true, writable: true, value: true });
      }
    }
    return result;
  }
  function retagBindings(oldRevision, newRevision, identity, scope) {
    for (const [id, binding] of bindings) {
      if (binding.revision === oldRevision && binding.identity === identity && binding.accountScope === scope &&
          workspaceRegistry.get(id)?.createdAt === binding.incarnation) binding.revision = newRevision;
      else bindings.delete(id);
    }
  }
  // Remove only evidence observed to belong to the old account/incarnation.
  // This is a local CAS, never a Tracker write. A conflicting newer owner change
  // is not overwritten. Retrying against a new snapshot prevents ABA revival.
  function invalidateProvenance(wid, expected, expectedRevision) {
    const state = current(), auth = state.settings.boardAuthorizations?.[wid];
    if (expectedRevision !== undefined && state.revision !== expectedRevision) fail('conflict', 409);
    if (expected && (!auth || auth.accountScope !== expected.accountScope || auth.incarnation !== expected.incarnation || !sameIds(auth.boardIds, expected.boardIds))) fail('conflict', 409);
    bindings.delete(wid); invalidate();
    const grant = state.settings.unattendedIssueCreation?.[wid];
    if (!auth && !grant) return;
    const next = { ...state.settings };
    for (const key of ['boardAuthorizations', 'unattendedIssueCreation']) {
      const map = { ...next[key] }; delete map[wid];
      if (Object.keys(map).length) next[key] = map; else delete next[key];
    }
    cas(state.revision, next); bindings.clear();
  }
  function revokeAccount(observedScope, expectedRevision) {
    const state = current();
    if (expectedRevision !== undefined && expectedRevision !== state.revision) { bindings.clear(); invalidate(); fail('needs_reselect', 409); }
    // A changed credential fingerprint alone is not a changed principal. Existing
    // operations are revoked, but a future exact-board verification may restore.
    if (typeof observedScope === 'string') {
      const mismatched = Object.entries(state.settings.boardAuthorizations ?? {}).filter(([, proof]) => proof?.accountScope !== observedScope);
      if (mismatched.length) {
        const next = { ...state.settings }, proofs = { ...next.boardAuthorizations }, grants = { ...next.unattendedIssueCreation };
        for (const [wid] of mismatched) { delete proofs[wid]; delete grants[wid]; }
        if (Object.keys(proofs).length) next.boardAuthorizations = proofs; else delete next.boardAuthorizations;
        if (Object.keys(grants).length) next.unattendedIssueCreation = grants; else delete next.unattendedIssueCreation;
        cas(state.revision, next);
      }
    }
    bindings.clear(); invalidate(); fail('needs_reselect', 409);
  }
  async function accountScope(account, signal) {
    if (!resolveAccountScope) return undefined;
    const value = await raceAbort(() => resolveAccountScope({ account, signal }), signal);
    signal.throwIfAborted();
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail('invalid_tracker_response', 502);
    return value;
  }
  const sameIds = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((id, i) => id === b[i]);
  function authorization(state, wid) {
    const entry = state.settings.boardAuthorizations?.[wid], ids = state.settings.workspaces[wid];
    if (!entry || typeof entry !== 'object' || typeof entry.accountScope !== 'string' || !/^[0-9a-f]{64}$/.test(entry.accountScope) ||
        typeof entry.incarnation !== 'string' || !entry.incarnation || !sameIds(entry.boardIds, ids)) return null;
    try { boardIds(entry.boardIds); } catch { return null; }
    return entry;
  }
  async function restore(wid, signal) {
    signal.throwIfAborted();
    let flight = restorations.get(wid);
    if (flight?.controller.signal.aborted) { restorations.delete(wid); flight = null; }
    if (flight) return waitRestore(flight, signal);
    const controller = new AbortController();
    const sharedSignal = AbortSignal.any([lifecycle.signal, controller.signal, AbortSignal.timeout(TIMEOUT_MS)]);
    const operation = (async () => {
      const state = current(), proof = authorization(state, wid), version = generation;
      if (!proof || !resolveAccountScope) fail('needs_reselect', 409);
      const snapshot = structuredClone(proof), ids = [...proof.boardIds], incarnation = workspace(wid);
      if (incarnation !== proof.incarnation) { invalidateProvenance(wid, snapshot, state.revision); fail('needs_reselect', 409); }
      function check() {
        sharedSignal.throwIfAborted();
        const now = current(), item = workspaceRegistry.get(wid), entry = authorization(now, wid);
        if (generation !== version || now.revision !== state.revision || !now.settings.connection ||
            !entry || entry.accountScope !== snapshot.accountScope || entry.incarnation !== incarnation || !sameIds(entry.boardIds, ids)) fail('needs_reselect', 409);
        if (item && item.createdAt !== incarnation) { invalidateProvenance(wid, snapshot, state.revision); fail('needs_reselect', 409); }
        if (!item) fail('needs_reselect', 409);
      }
      check();
      const account = await session(sharedSignal); check();
      const scope = await accountScope(account, sharedSignal); check();
      if (scope !== snapshot.accountScope) { invalidateProvenance(wid, snapshot, state.revision); fail('needs_reselect', 409); }
      if (typeof account.getBoardIdentity !== 'function') fail('invalid_tracker_response', 502);
      let next = 0, failure;
      async function worker() {
        while (!failure && next < ids.length) {
          const id = ids[next++];
          try {
            check();
            const board = await exactRestoreBoard(account, id, sharedSignal);
            check();
            if (!board || typeof board !== 'object' || board.id !== id || typeof board.name !== 'string' || !board.name.length || board.name.length > 256) fail('invalid_tracker_response', 502);
          } catch (error) { failure ??= error; }
        }
      }
      await Promise.all(Array.from({ length: Math.min(RESELECT_CONCURRENCY, ids.length) }, () => worker()));
      check();
      const after = await session(sharedSignal); check();
      const afterScope = await accountScope(after, sharedSignal); check();
      if (afterScope !== scope) { invalidateProvenance(wid, snapshot, state.revision); fail('needs_reselect', 409); }
      if (after.identity !== account.identity) { bindings.clear(); invalidate(); fail('needs_reselect', 409); }
      if (failure) throw failure;
      check();
      bindings.set(wid, { identity: account.identity, accountScope: scope, incarnation, revision: state.revision });
    })();
    flight = { operation, controller, waiters: 0 };
    restorations.set(wid, flight);
    operation.finally(() => { if (restorations.get(wid) === flight) restorations.delete(wid); }).catch(() => {});
    return waitRestore(flight, signal);
  }
  async function waitRestore(flight, signal) {
    flight.waiters++;
    try { return await raceAbort(() => flight.operation, signal); }
    finally {
      if (--flight.waiters === 0) flight.controller.abort();
    }
  }
  async function ensureBinding(wid, signal) {
    const state = current(), incarnation = workspace(wid);
    let binding = bindings.get(wid);
    if (binding && binding.revision === state.revision && binding.incarnation === incarnation && authorization(state, wid)) {
      const version = generation;
      const account = await session(signal), scope = await accountScope(account, signal);
      signal.throwIfAborted();
      if (current().revision !== state.revision || generation !== version || bindings.get(wid) !== binding) fail('needs_reselect', 409);
      if (scope !== binding.accountScope) revokeAccount(scope, state.revision);
      if (account.identity !== binding.identity) { bindings.clear(); invalidate(); binding = undefined; }
    }
    if (!binding || binding.revision !== state.revision || binding.incarnation !== incarnation) {
      const proof = authorization(state, wid);
      if (proof && proof.incarnation !== incarnation) { invalidateProvenance(wid, proof, state.revision); fail('needs_reselect', 409); }
      if (binding && binding.incarnation !== incarnation) { bindings.delete(wid); fail('needs_reselect', 409); }
      bindings.delete(wid);
      try { await restore(wid, signal); }
      catch (error) {
        signal.throwIfAborted();
        if (error?.code === 'needs_reselect' || error?.code === 'workspace_not_found') throw error;
        fail('unavailable', 503);
      }
    }
  }
  async function readImpl(signal) {
    signal.throwIfAborted();
    let state = current();
    const initialRevision = state.revision;
    const unavailable = new Set();
    if (state.settings.connection) {
      const ids = Object.keys(state.settings.workspaces).filter(id => authorization(state, id));
      let index = 0;
      async function worker() {
        while (index < ids.length) {
          const id = ids[index++];
          try {
            await ensureBinding(id, signal);
            const binding = bindings.get(id), observed = current(), observedGeneration = generation;
            const account = await session(signal), scope = await accountScope(account, signal);
            if (current().revision !== observed.revision || generation !== observedGeneration || bindings.get(id) !== binding) fail('conflict', 409);
            if (binding && binding.accountScope !== scope) { invalidateProvenance(id, authorization(observed, id), observed.revision); continue; }
            if (binding && binding.identity !== account.identity) { bindings.clear(); invalidate(); await ensureBinding(id, signal); }
          } catch (error) {
            signal.throwIfAborted();
            if (current().revision !== initialRevision) {
              if (error?.code === 'needs_reselect' && !authorization(current(), id)) continue;
              fail('conflict', 409);
            }
            if (error?.code === 'conflict') throw error;
            bindings.delete(id);
            if (error?.code !== 'needs_reselect' && error?.code !== 'workspace_not_found') unavailable.add(id);
            else if (authorization(current(), id)) unavailable.add(id);
          }
        }
      }
      await worker();
      // Legacy bindings cannot be restored, but still require live credential
      // verification before presenting them as active.
      for (const [id, binding] of bindings) if (!authorization(state, id)) {
        try {
          const account = await session(signal), scope = await accountScope(account, signal);
          if (account.identity !== binding.identity || scope !== binding.accountScope) { bindings.delete(id); invalidate(); }
        } catch (error) { signal.throwIfAborted(); bindings.delete(id); }
      }
      state = current();
    }
    const needsReselect = Object.keys(state.settings.workspaces).filter(id => {
      const binding = bindings.get(id), item = workspaceRegistry.get(id);
      const active = binding && item?.createdAt === binding.incarnation && binding.revision === state.revision;
      if (!active && authorization(state, id)) unavailable.add(id);
      return !active && !authorization(state, id) && !unavailable.has(id);
    });
    const unattendedIssueCreation = {}, unattendedIssueCreationStored = storedGrants(state);
    for (const id of Object.keys(state.settings.workspaces)) {
      const binding = bindings.get(id);
      Object.defineProperty(unattendedIssueCreation, id, { enumerable: true, configurable: true, writable: true,
        value: !!binding && binding.revision === state.revision && workspaceRegistry.get(id)?.createdAt === binding.incarnation && optedIn(state, id, binding.accountScope, binding.incarnation) });
    }
    return { revision: state.revision, configured: !!state.settings.connection,
      orgType: state.settings.connection?.orgType ?? null, workspaces: structuredClone(state.settings.workspaces), needsReselect, verificationUnavailable: [...unavailable], unattendedIssueCreation, unattendedIssueCreationStored };
  }
  async function commandImpl(c, signal) {
    checkCommand(c); signal.throwIfAborted();
    const state = current();
    if (c.op === 'configuration.unattendedRead') {
      return { revision: state.revision, unattendedIssueCreationStored: storedGrants(state) };
    }
    if (c.op === 'configuration.configure') {
      if (state.revision !== c.expectedRevision) fail('conflict', 409);
      // Reconfiguration invalidates every board authorization, even for the same type.
      const next = { connection: { tokenRef: 'TOKEN', orgIdRef: 'ORG_ID', orgType: c.orgType }, workspaces: {} };
      const nextRevision = cas(c.expectedRevision, next); invalidate(); bindings.clear();
      return { revision: nextRevision, configured: true, orgType: c.orgType, workspaces: {}, needsReselect: [], verificationUnavailable: [], unattendedIssueCreation: {}, unattendedIssueCreationStored: {} };
    }
    configured(state);
    if (c.op === 'configuration.setUnattendedIssueCreation') {
      if (state.revision !== c.expectedRevision) fail('conflict', 409);
      if (c.enabled && (!Array.isArray(state.settings.workspaces[c.workspaceId]) || !state.settings.workspaces[c.workspaceId].length)) fail('board_not_selected', 403);
      if (c.enabled && resolveAccountScope) await ensureBinding(c.workspaceId, signal);
      // Revocation is a local, owner-authorized CAS and must work even when the
      // Tracker account or previous in-memory binding is unavailable. Existing
      // bindings retain their original provenance and must still verify the live
      // account before any operation; this CAS does not authorize a new principal.
      if (!c.enabled) {
        workspace(c.workspaceId);
        if (!Object.hasOwn(state.settings.workspaces, c.workspaceId) &&
            !(state.settings.unattendedIssueCreation && Object.hasOwn(state.settings.unattendedIssueCreation, c.workspaceId))) fail('board_not_selected', 403);
        const map = { ...state.settings.unattendedIssueCreation };
        delete map[c.workspaceId];
        const next = { ...state.settings };
        if (Object.keys(map).length) next.unattendedIssueCreation = map;
        else delete next.unattendedIssueCreation;
        signal.throwIfAborted();
        const nextRevision = cas(c.expectedRevision, next);
        invalidate();
        for (const [id, binding] of bindings) {
          if (binding.revision === state.revision && workspaceRegistry.get(id)?.createdAt === binding.incarnation) binding.revision = nextRevision;
          else bindings.delete(id);
        }
        return { revision: nextRevision, workspaceId: c.workspaceId, enabled: false };
      }
      if (!resolveAccountScope) fail('unavailable', 503);
      const wid = c.workspaceId, incarnation = workspace(wid), binding = bindings.get(wid), version = generation;
      if (!Array.isArray(state.settings.workspaces[wid]) || !state.settings.workspaces[wid].length) fail('board_not_selected', 403);
      if (!binding || binding.revision !== state.revision || binding.incarnation !== incarnation) fail('needs_reselect', 409);
      const identity = binding.identity, selectedScope = binding.accountScope;
      function check() {
        signal.throwIfAborted();
        workspace(wid, incarnation);
        const now = current();
        if (generation !== version || now.revision !== state.revision || !now.settings.connection ||
            bindings.get(wid) !== binding || binding.revision !== state.revision || binding.identity !== identity ||
            binding.accountScope !== selectedScope || binding.incarnation !== incarnation ||
            !Array.isArray(now.settings.workspaces[wid]) || !now.settings.workspaces[wid].length) fail('needs_reselect', 409);
      }
      check();
      const account = await session(signal); check();
      const scope = await accountScope(account, signal); check();
      if (account.identity !== identity || scope !== selectedScope) revokeAccount();
      const afterAccount = await session(signal); check();
      const afterScope = await accountScope(afterAccount, signal); check();
      if (afterAccount.identity !== identity || afterScope !== selectedScope) revokeAccount();
      const map = { ...state.settings.unattendedIssueCreation };
      Object.defineProperty(map, wid, { value: { accountScope: scope, incarnation }, enumerable: true, configurable: true, writable: true });
      const next = { ...state.settings, unattendedIssueCreation: map };
      check();
      const nextRevision = cas(c.expectedRevision, next);
      invalidate(); retagBindings(state.revision, nextRevision, identity, scope);
      return { revision: nextRevision, workspaceId: wid, enabled: c.enabled };
    }
    if (c.op === 'links.read' || c.op === 'links.issue.read' || c.op === 'links.session.read' || c.op === 'links.set') {
      await ensureBinding(c.workspaceId, signal);
      return linksCommand(c, signal, current());
    }
    if (c.op.startsWith('issue.')) {
      await ensureBinding(c.workspaceId, signal);
      const scope = makeWorkspaceScope({ workspaceId: c.workspaceId, boardId: c.boardId, signal }, false);
      const issueKey = c.issueKey;
      switch (c.op) {
        case 'issue.read': return scope.getIssue({ issueKey, issueId: c.issueId });
        case 'issue.comments': return scope.getComments({ issueKey, issueId: c.issueId, ...(Object.hasOwn(c, 'cursor') ? { cursor: c.cursor } : {}) });
        case 'issue.transitions': return scope.listTransitions({ issueKey, issueId: c.issueId });
        case 'issue.update': return scope.updateIssue({ issueKey, changes: c.changes, issueId: c.issueId });
        case 'issue.comment': return scope.addComment({ issueKey, text: c.text, issueId: c.issueId });
        case 'issue.editComment': return scope.editComment({ issueKey, issueId: c.issueId, commentId: c.commentId, expectedVersion: c.expectedVersion, text: c.text });
        case 'issue.transition': return scope.executeTransition({ issueKey, transitionId: c.transitionId, expectedTo: c.expectedTo, issueId: c.issueId });
        default: invalid();
      }
    }
    if (c.op === 'boards.list') {
      // A failed or interrupted list must never leave previous selection evidence valid.
      invalidate(); const version = generation;
      const account = await session(signal);
      const scope = await accountScope(account, signal);
      if (current().revision !== state.revision || version !== generation) fail('conflict', 409);
      const result = await raceAbort(() => account.listBoards({ signal }), signal);
      const afterAccount = await session(signal);
      const afterScope = await accountScope(afterAccount, signal);
      signal.throwIfAborted();
      const after = current();
      if (afterAccount.identity !== account.identity || afterScope !== scope) revokeAccount();
      if (after.revision !== state.revision || version !== generation) fail('conflict', 409);
      if (!result || !Array.isArray(result.boards) || result.boards.length > 500 || typeof result.complete !== 'boolean' || !(result.reason === null || result.reason === 'page_limit')) fail('invalid_tracker_response', 502);
      const ids = new Set(), boards = [];
      for (const board of result.boards) {
        if (!board || typeof board !== 'object' || typeof board.id !== 'string' || !BOARD.test(board.id) || !Number.isSafeInteger(Number(board.id)) || typeof board.name !== 'string' || board.name.length < 1 || board.name.length > 256 || ids.has(board.id)) fail('invalid_tracker_response', 502);
        ids.add(board.id); boards.push({ id: board.id, name: board.name });
      }
      listing = { ids, identity: account.identity, accountScope: scope, revision: state.revision, expires: Date.now() + LIST_TTL_MS };
      return { boards, complete: result.complete, reason: result.reason };
    }
    // Reconfirmation authorizes the saved IDs for the current principal; it does
    // not establish continuity with an account used before a restart. The host
    // must obtain explicit owner confirmation before invoking this operation.
    if (c.op === 'workspace.reselect') {
      const wid = c.workspaceId;
      // Fail closed even when a valid command fails its preconditions. Invalidate
      // listing evidence and in-flight reselect/list operations at the outset.
      bindings.delete(wid); invalidate();
      const version = generation;
      const incarnation = workspace(wid);
      if (state.revision !== c.expectedRevision) fail('conflict', 409);
      if (!Object.hasOwn(state.settings.workspaces, wid)) fail('conflict', 409);
      const selected = state.settings.workspaces[wid];
      if (!Array.isArray(selected) || !selected.length || selected.length !== c.boardIds.length ||
          selected.some((id, index) => id !== c.boardIds[index])) fail('conflict', 409);
      // The store normally returns copies, but pin a snapshot even if a custom
      // store returns mutable references. Compare all settings, not just IDs.
      const snapshot = structuredClone(state.settings), startRevision = state.revision;
      const sameSettings = (a, b) => {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
        const ak = Object.keys(a), bk = Object.keys(b);
        return ak.length === bk.length && ak.every(key => Object.hasOwn(b, key) && sameSettings(a[key], b[key]));
      };
      function check() {
        signal.throwIfAborted();
        workspace(wid, incarnation);
        const now = current();
        if (generation !== version || now.revision !== startRevision || !sameSettings(now.settings, snapshot)) fail('conflict', 409);
      }
      const account = await session(signal); check();
      const scope = await accountScope(account, signal); check();
      if (typeof account.getBoardIdentity !== 'function') fail('invalid_tracker_response', 502);
      let next = 0, failure;
      async function worker() {
        while (!failure && next < c.boardIds.length) {
          const id = c.boardIds[next++];
          try {
            check();
            const board = await raceAbort(() => account.getBoardIdentity(id, { signal }), signal);
            check();
            if (!board || typeof board !== 'object' || board.id !== id || typeof board.name !== 'string' || board.name.length < 1 || board.name.length > 256) fail('invalid_tracker_response', 502);
          } catch (error) { if (!failure) failure = error; }
        }
      }
      await Promise.all(Array.from({ length: Math.min(RESELECT_CONCURRENCY, c.boardIds.length) }, () => worker()));
      // Re-resolve even after a failed lookup, so credential rotation revokes all
      // bindings instead of leaving other workspaces tied to a stale account.
      check();
      const afterAccount = await session(signal); check();
      const afterScope = await accountScope(afterAccount, signal); check();
      if (afterAccount.identity !== account.identity || afterScope !== scope) revokeAccount();
      if (failure) throw failure;
      check();
      // A saved grant belongs to this account and incarnation only. If an owner
      // reselects a different principal or replacement workspace, discard the old
      // grant permanently so switching back cannot silently revive it.
      let boundRevision = startRevision;
      const saved = snapshot.unattendedIssueCreation;
      const nextSettings = { ...snapshot };
      let changed = false;
      if (saved && Object.hasOwn(saved, wid) && !optedIn(state, wid, scope, incarnation)) {
        const map = { ...saved }; delete map[wid];
        if (Object.keys(map).length) nextSettings.unattendedIssueCreation = map;
        else delete nextSettings.unattendedIssueCreation;
        changed = true;
      }
      if (scope !== undefined) {
        const old = authorization(state, wid);
        if (!old || old.accountScope !== scope || old.incarnation !== incarnation || !sameIds(old.boardIds, c.boardIds)) {
          nextSettings.boardAuthorizations = { ...snapshot.boardAuthorizations, [wid]: { accountScope: scope, incarnation, boardIds: [...c.boardIds] } };
          changed = true;
        }
      }
      if (changed) {
        check(); boundRevision = cas(startRevision, nextSettings);
        invalidate(); retagBindings(startRevision, boundRevision, account.identity, scope);
      }
      bindings.set(wid, { identity: account.identity, accountScope: scope, incarnation, revision: boundRevision });
      return { revision: boundRevision, workspaceId: wid, boardIds: [...c.boardIds] };
    }
    const incarnation = workspace(c.workspaceId);
    if (c.op === 'workspace.select') {
      if (state.revision !== c.expectedRevision) fail('conflict', 409);
      if (c.boardIds.length && (!listing || listing.revision !== state.revision || listing.expires <= Date.now() || c.boardIds.some(id => !listing.ids.has(id)))) fail('board_list_required', 409);
      const evidence = listing;
      const account = await session(signal);
      const scope = await accountScope(account, signal);
      if (c.boardIds.length && (!evidence || evidence !== listing || evidence.expires <= Date.now() || evidence.identity !== account.identity || evidence.accountScope !== scope)) revokeAccount();
      // Recheck with a fresh immutable credential session before the synchronous CAS.
      const afterAccount = resolveAccountScope ? await session(signal) : account;
      const afterScope = resolveAccountScope ? await accountScope(afterAccount, signal) : scope;
      if (afterScope !== scope || afterAccount.identity !== account.identity) revokeAccount();
      if (c.boardIds.length && (evidence !== listing || evidence.expires <= Date.now())) fail('conflict', 409);
      const workspaces = { ...state.settings.workspaces, [c.workspaceId]: [...c.boardIds] };
      const next = { ...state.settings, workspaces };
      const proofs = { ...state.settings.boardAuthorizations };
      if (scope !== undefined && c.boardIds.length) proofs[c.workspaceId] = { accountScope: scope, incarnation, boardIds: [...c.boardIds] };
      else delete proofs[c.workspaceId];
      if (Object.keys(proofs).length) next.boardAuthorizations = proofs;
      else delete next.boardAuthorizations;
      if (state.settings.unattendedIssueCreation) {
        const map = { ...state.settings.unattendedIssueCreation };
        delete map[c.workspaceId];
        if (Object.keys(map).length) next.unattendedIssueCreation = map;
        else delete next.unattendedIssueCreation;
      }
      workspace(c.workspaceId, incarnation); signal.throwIfAborted();
      const nextRevision = cas(c.expectedRevision, next);
      invalidate();
      // Retag only bindings still valid for this identity and workspace incarnation.
      retagBindings(state.revision, nextRevision, account.identity, scope);
      bindings.set(c.workspaceId, { identity: account.identity, accountScope: scope, incarnation, revision: nextRevision });
      return { revision: nextRevision, workspaceId: c.workspaceId, boardIds: [...c.boardIds] };
    }
    if (!Object.hasOwn(state.settings.workspaces, c.workspaceId) || !state.settings.workspaces[c.workspaceId].includes(c.boardId)) fail('board_not_selected', 403);
    await ensureBinding(c.workspaceId, signal);
    const binding = bindings.get(c.workspaceId);
    if (!binding || binding.incarnation !== incarnation || binding.revision !== state.revision) { bindings.delete(c.workspaceId); fail('needs_reselect', 409); }
    const account = await session(signal);
    const scope = await accountScope(account, signal);
    if (account.identity !== binding.identity || scope !== binding.accountScope) revokeAccount(scope, state.revision);
    workspace(c.workspaceId, incarnation); signal.throwIfAborted();
    if (current().revision !== state.revision || bindings.get(c.workspaceId) !== binding) fail('conflict', 409);
    const value = await raceAbort(() => account.getBoardOverview(c.boardId, { issueKeys: [...c.issueKeys], searchByBoard: c.issueKeys.length === 0, signal }), signal);
    const afterAccount = await session(signal);
    const afterScope = await accountScope(afterAccount, signal);
    signal.throwIfAborted();
    workspace(c.workspaceId, incarnation);
    const after = current();
    if (afterAccount.identity !== binding.identity || afterScope !== binding.accountScope) revokeAccount(afterScope, state.revision);
    if (after.revision !== state.revision || !after.settings.connection || !Object.hasOwn(after.settings.workspaces, c.workspaceId) || !after.settings.workspaces[c.workspaceId].includes(c.boardId)) fail('conflict', 409);
    if (bindings.get(c.workspaceId) !== binding || binding.revision !== state.revision) fail('needs_reselect', 409);
    // Even a well-formed search is never a claim of complete board membership.
    if (!value || typeof value !== 'object' || value.issuesComplete !== false) fail('invalid_tracker_response', 502);
    return value;
  }
  // Link authorization is scoped to the selected board, exact in-memory binding,
  // credential snapshot, workspace incarnation and live account principal. All
  // remote work completes before entering the synchronous store transaction.
  async function linksCommand(c, signal, initial) {
    if (!links) fail('unavailable', 503);
    const wid = c.workspaceId, incarnation = workspace(wid), binding = bindings.get(wid);
    const selected = initial.settings.workspaces[wid];
    const sessionRead = c.op === 'links.session.read';
    if (!Array.isArray(selected) || (sessionRead ? !selected.length : !selected.includes(c.boardId))) fail('board_not_selected', 403);
    if (sessionRead) boardIds(selected);
    if (!binding || binding.incarnation !== incarnation || binding.revision !== initial.revision) fail('needs_reselect', 409);
    const identity = binding.identity, selectedScope = binding.accountScope;
    const selectedBoards = [...selected];
    function check() {
      signal.throwIfAborted();
      const item = workspaceRegistry.get(wid), state = current();
      if (!item || item.createdAt !== incarnation || state.revision !== initial.revision || !state.settings.connection ||
          bindings.get(wid) !== binding || binding.revision !== initial.revision || binding.incarnation !== incarnation || binding.identity !== identity || binding.accountScope !== selectedScope ||
          !Array.isArray(state.settings.workspaces[wid]) || (sessionRead
            ? state.settings.workspaces[wid].length !== selectedBoards.length || selectedBoards.some((id, index) => state.settings.workspaces[wid][index] !== id)
            : !state.settings.workspaces[wid].includes(c.boardId))) fail('needs_reselect', 409);
      return item;
    }
    function member(item, sid, linking) {
      if (!Array.isArray(item.sessionIds) || item.sessionIds.length > 100_000 || !item.sessionIds.includes(sid) ||
          (workspaceRegistry.archivedSessionIds != null && !Array.isArray(workspaceRegistry.archivedSessionIds)) ||
          (item.archivedSessionIds != null && !Array.isArray(item.archivedSessionIds)) ||
          (linking && (workspaceRegistry.archivedSessionIds?.includes(sid) || item.archivedSessionIds?.includes(sid)))) fail('session_not_in_workspace', 403);
    }
    async function liveAccount() {
      check();
      const account = await session(signal);
      check();
      const scope = await accountScope(account, signal);
      check();
      if (account.identity !== identity || scope !== binding.accountScope) revokeAccount(scope, initial.revision);
      return account;
    }
    if (sessionRead) member(check(), c.sessionId, true);
    const account = await liveAccount();
    const scope = binding.accountScope;
    if (sessionRead) {
      member(check(), c.sessionId, true);
      if (typeof account.getIssueById !== 'function') fail('invalid_tracker_response', 502);
      const storeScope = { accountScope: scope, workspaceId: wid, workspaceCreatedAt: incarnation };
      function snapshot() {
        let result;
        try { result = links.read(storeScope); } catch { fail('internal', 500); }
        if (!result || !Number.isSafeInteger(result.revision) || result.revision < 0 || !Array.isArray(result.links) || result.links.length > 5000) fail('internal', 500);
        const pairs = new Set(), issueIds = [];
        for (const link of result.links) {
          if (!link || typeof link.issueId !== 'string' || !TRANSITION.test(link.issueId) || !validSessionId(link.sessionId)) fail('internal', 500);
          const pair = JSON.stringify([link.issueId, link.sessionId]);
          if (pairs.has(pair)) fail('internal', 500);
          pairs.add(pair);
          if (link.sessionId === c.sessionId) issueIds.push(link.issueId);
        }
        return { revision: result.revision, pairs, issueIds };
      }
      const before = snapshot();
      member(check(), c.sessionId, true);
      // Stable order makes the cap and board choice independent of store ordering.
      before.issueIds.sort();
      let incomplete = before.issueIds.length > MAX_SESSION_LINK_LOOKUPS;
      async function resolveIssue(id) {
        member(check(), c.sessionId, true);
        let issue;
        try { issue = await raceAbort(() => account.getIssueById(id, { signal }), signal); }
        catch (error) {
          member(check(), c.sessionId, true);
          // Verify credentials even on failures; a principal change is not partial.
          await liveAccount();
          member(check(), c.sessionId, true);
          if (error?.name === 'TrackerError' && ['forbidden', 'not_found'].includes(error.code)) { incomplete = true; return null; }
          throw error;
        }
        member(check(), c.sessionId, true);
        if (!issue || issue.id !== id || typeof issue.key !== 'string' || !ISSUE.test(issue.key) ||
            !Array.isArray(issue.boards) || issue.boards.length > 500 ||
            issue.boards.some(board => !board || typeof board.id !== 'string' || !BOARD.test(board.id) || !Number.isSafeInteger(Number(board.id)))) {
          incomplete = true; return null;
        }
        const board = selectedBoards.find(selectedId => issue.boards.some(candidate => candidate.id === selectedId));
        if (!board) { incomplete = true; return null; }
        return { issueId: id, issueKey: issue.key, sessionId: c.sessionId, boardId: board };
      }
      async function sweep(ids) {
        const values = new Array(ids.length);
        let next = 0, failure;
        async function worker() {
          while (!failure && next < ids.length) {
            const index = next++;
            try { values[index] = await resolveIssue(ids[index]); }
            catch (error) { if (!failure) failure = error; }
          }
        }
        // Wait for every in-flight read, including on failures, before proceeding.
        await Promise.all(Array.from({ length: Math.min(SESSION_LINK_CONCURRENCY, ids.length) }, () => worker()));
        if (failure) throw failure;
        await liveAccount();
        member(check(), c.sessionId, true);
        return values;
      }
      const candidates = (await sweep(before.issueIds.slice(0, MAX_SESSION_LINK_LOOKUPS))).filter(Boolean);
      // Revalidate every positive result after the first sweep. Tracker and SQLite
      // cannot share an atomic snapshot; changes during this pass remain possible.
      const latest = await sweep(candidates.map(candidate => candidate.issueId));
      const visible = [];
      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index], value = latest[index];
        if (!value || value.issueKey !== candidate.issueKey || value.boardId !== candidate.boardId) { incomplete = true; continue; }
        visible.push(value);
      }
      await liveAccount();
      member(check(), c.sessionId, true);
      const after = snapshot();
      member(check(), c.sessionId, true);
      // Revision is global, so even an unlink/relink of the same pair is detected.
      if (after.revision !== before.revision || visible.some(link => !after.pairs.has(JSON.stringify([link.issueId, link.sessionId])))) fail('conflict', 409);
      return { revision: before.revision, incomplete, links: visible };
    }
    if (c.op === 'links.issue.read') {
      // Validate the same immutable issue on both sides of the synchronous local
      // snapshot. Search results are deliberately not used as membership evidence.
      async function exactIssue(a) {
        if (typeof a.getIssue !== 'function') fail('invalid_tracker_response', 502);
        const issue = await raceAbort(() => a.getIssue(c.issueKey, { signal }), signal);
        check();
        if (!issue || issue.key !== c.issueKey || !Array.isArray(issue.boards) || issue.boards.length > 500 ||
            issue.boards.some(board => !board || typeof board.id !== 'string' || !BOARD.test(board.id) || !Number.isSafeInteger(Number(board.id))) ||
            !issue.boards.some(board => board.id === c.boardId)) fail('issue_not_in_selected_boards', 403);
        if (typeof issue.id !== 'string' || !TRANSITION.test(issue.id)) fail('issue_id_required', 409);
        if (issue.id !== c.issueId) fail('conflict', 409);
      }
      await exactIssue(account);
      const afterAccount = await liveAccount();
      const item = check();
      if (!Array.isArray(item.sessionIds) || item.sessionIds.length > 100_000) fail('invalid_tracker_response', 502);
      const sessions = new Set(item.sessionIds.filter(validSessionId));
      let result;
      try { result = links.read({ accountScope: scope, workspaceId: wid, workspaceCreatedAt: incarnation }); }
      catch { fail('internal', 500); }
      check();
      if (!result || !Number.isSafeInteger(result.revision) || result.revision < 0 || !Array.isArray(result.links) || result.links.length > 5000) fail('internal', 500);
      const visible = [], seen = new Set();
      for (const link of result.links) {
        if (!link || typeof link.issueId !== 'string' || !TRANSITION.test(link.issueId) || !validSessionId(link.sessionId)) fail('internal', 500);
        const pair = JSON.stringify([link.issueId, link.sessionId]);
        if (seen.has(pair)) fail('internal', 500);
        seen.add(pair);
        if (link.issueId === c.issueId && sessions.has(link.sessionId)) visible.push({ issueId: c.issueId, issueKey: c.issueKey, sessionId: link.sessionId });
      }
      await exactIssue(afterAccount);
      await liveAccount();
      const finalItem = check();
      if (!Array.isArray(finalItem.sessionIds) || finalItem.sessionIds.length > 100_000) fail('invalid_tracker_response', 502);
      const finalSessions = new Set(finalItem.sessionIds.filter(validSessionId));
      let latest;
      try { latest = links.read({ accountScope: scope, workspaceId: wid, workspaceCreatedAt: incarnation }); }
      catch { fail('internal', 500); }
      check();
      if (!latest || !Number.isSafeInteger(latest.revision) || latest.revision < 0 || !Array.isArray(latest.links) || latest.links.length > 5000) fail('internal', 500);
      if (latest.revision !== result.revision) fail('conflict', 409);
      const latestPairs = new Set();
      for (const link of latest.links) {
        if (!link || typeof link.issueId !== 'string' || !TRANSITION.test(link.issueId) || !validSessionId(link.sessionId)) fail('internal', 500);
        const pair = JSON.stringify([link.issueId, link.sessionId]);
        if (latestPairs.has(pair)) fail('internal', 500);
        latestPairs.add(pair);
      }
      if (visible.some(link => !latestPairs.has(JSON.stringify([link.issueId, link.sessionId])))) fail('conflict', 409);
      const publishItem = check();
      if (!Array.isArray(publishItem.sessionIds) || publishItem.sessionIds.length > 100_000) fail('invalid_tracker_response', 502);
      const publishSessions = new Set(publishItem.sessionIds.filter(validSessionId));
      return { revision: result.revision, incomplete: false, links: visible.filter(link => finalSessions.has(link.sessionId) && publishSessions.has(link.sessionId)) };
    }
    let boardIssues, issueId;
    if (c.op === 'links.read') {
      const value = await raceAbort(() => account.getBoardOverview(c.boardId, { issueKeys: [], searchByBoard: true, signal }), signal);
      check();
      if (!value || value.board?.id !== c.boardId || value.issuesComplete !== false || !Array.isArray(value.issues) || value.issues.length > 500) fail('invalid_tracker_response', 502);
      boardIssues = new Map(); const seenKeys = new Set();
      for (const issue of value.issues) {
        if (!issue || typeof issue.key !== 'string' || !ISSUE.test(issue.key) || seenKeys.has(issue.key)) fail('invalid_tracker_response', 502);
        seenKeys.add(issue.key);
        // Missing IDs are unresolvable, never joined by key or inferred.
        if (issue.id === undefined || issue.id === null) continue;
        if (typeof issue.id !== 'string' || !TRANSITION.test(issue.id) || boardIssues.has(issue.id)) fail('invalid_tracker_response', 502);
        boardIssues.set(issue.id, issue.key);
      }
    } else {
      member(check(), c.sessionId, c.linked);
      if (typeof account.getIssue !== 'function') fail('invalid_tracker_response', 502);
      const issue = await raceAbort(() => account.getIssue(c.issueKey, { signal }), signal);
      check();
      if (!issue || issue.key !== c.issueKey || !Array.isArray(issue.boards) || issue.boards.length > 500 ||
          issue.boards.some(board => !board || typeof board.id !== 'string' || !BOARD.test(board.id) || !Number.isSafeInteger(Number(board.id))) ||
          !issue.boards.some(board => board.id === c.boardId)) fail('issue_not_in_selected_boards', 403);
      if (typeof issue.id !== 'string' || !TRANSITION.test(issue.id)) fail('issue_id_required', 409);
      if (issue.id !== c.issueId) fail('conflict', 409);
      issueId = issue.id;
    }
    // Re-resolve principal using a fresh credential-bound session. This catches
    // principal changes even when the underlying credential fingerprint is stable.
    const afterAccount = await liveAccount();
    check();
    const storeScope = { accountScope: scope, workspaceId: wid, workspaceCreatedAt: incarnation };
    if (c.op === 'links.read') {
      const item = check();
      if (!Array.isArray(item.sessionIds) || item.sessionIds.length > 100_000) fail('invalid_tracker_response', 502);
      const sessions = new Set(item.sessionIds.filter(validSessionId));
      let result;
      try { result = links.read(storeScope); } catch { fail('internal', 500); }
      if (!result || !Number.isSafeInteger(result.revision) || result.revision < 0 || !Array.isArray(result.links) || result.links.length > 5000) fail('internal', 500);
      const visible = [], seen = new Set();
      for (const link of result.links) {
        if (!link || typeof link.issueId !== 'string' || !TRANSITION.test(link.issueId) || !validSessionId(link.sessionId)) fail('internal', 500);
        const key = boardIssues.get(link.issueId), pair = JSON.stringify([link.issueId, link.sessionId]);
        if (seen.has(pair)) fail('internal', 500);
        seen.add(pair);
        if (key && sessions.has(link.sessionId)) visible.push({ issueId: link.issueId, issueKey: key, sessionId: link.sessionId });
      }
      const finalItem = check();
      if (!Array.isArray(finalItem.sessionIds) || finalItem.sessionIds.length > 100_000) fail('invalid_tracker_response', 502);
      const finalSessions = new Set(finalItem.sessionIds.filter(validSessionId));
      return { revision: result.revision, links: visible.filter(link => finalSessions.has(link.sessionId)), incomplete: true };
    }
    member(check(), c.sessionId, c.linked);
    // Recheck this issue under the same fresh credential snapshot immediately
    // before the local commit; the remote membership and SQLite cannot be atomic.
    const latest = await raceAbort(() => afterAccount.getIssue(c.issueKey, { signal }), signal);
    member(check(), c.sessionId, c.linked);
    if (latest && latest.id !== c.issueId) fail('conflict', 409);
    if (!latest || latest.key !== c.issueKey || latest.id !== issueId || !Array.isArray(latest.boards) || latest.boards.length > 500 ||
        latest.boards.some(board => !board || typeof board.id !== 'string' || !BOARD.test(board.id) || !Number.isSafeInteger(Number(board.id))) ||
        !latest.boards.some(board => board.id === c.boardId)) fail('issue_not_in_selected_boards', 403);
    await liveAccount();
    member(check(), c.sessionId, c.linked);
    // A throwing store may have committed; never retry or report a definite failure.
    let result;
    try {
      const raw = links.mutate({ ...storeScope, expectedRevision: c.expectedRevision, issueId, sessionId: c.sessionId, linked: c.linked });
      result = { ok: raw?.ok, revision: raw?.revision };
      if (typeof result.ok !== 'boolean' || !Number.isSafeInteger(result.revision) || result.revision < 0 ||
          (result.ok && result.revision !== c.expectedRevision && result.revision !== c.expectedRevision + 1)) fail('outcome_unknown', 502);
    } catch { fail('outcome_unknown', 502); }
    if (!result.ok) fail('conflict', 409);
    try { member(check(), c.sessionId, c.linked); } catch { fail('outcome_unknown', 502); }
    return { revision: result.revision };
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
  const command = (value, signal) => {
    // Validate and capture before scheduling work: a trusted in-process caller may
    // otherwise mutate an object while credential or membership checks are pending.
    try {
      checkCommand(value);
      const snapshot = structuredClone(value);
      const freeze = v => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; };
      freeze(snapshot);
      return run(s => commandImpl(snapshot, s), signal);
    } catch (error) { return Promise.reject(error); }
  };
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
      return response(await command(body, signal));
    } catch (error) {
      const result = error instanceof ServiceError && error.code === 'outcome_unknown' ? safeError(error, signal) : closed ? { code: 'unavailable', status: 503 } : safeError(error, signal);
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
    fields(options, ['workspaceId', 'sessionId', 'signal'], ['assertCaller']);
    const { workspaceId: wid, sessionId: sid, signal, assertCaller } = options;
    workspaceId(wid); sessionId(sid);
    if (signal !== undefined && !(signal instanceof AbortSignal)) invalid();
    if (assertCaller !== undefined && typeof assertCaller !== 'function') invalid();
    const state = current(), incarnation = workspace(wid), item = workspaceRegistry.get(wid);
    configured(state);
    const ids = state.settings.workspaces[wid];
    if (!Array.isArray(ids) || !ids.length) fail('board_not_selected', 403);
    boardIds(ids);
    if (!Array.isArray(item.sessionIds) || !item.sessionIds.includes(sid) ||
        (workspaceRegistry.archivedSessionIds != null && !Array.isArray(workspaceRegistry.archivedSessionIds)) || workspaceRegistry.archivedSessionIds?.includes(sid) ||
        (item.archivedSessionIds != null && (!Array.isArray(item.archivedSessionIds) || item.archivedSessionIds.includes(sid)))) fail('session_not_in_workspace', 403);
    if (!bindings.has(wid) && !authorization(state, wid)) fail('needs_reselect', 409);
    const expires = Date.now() + TOOL_SCOPE_TTL_MS, scopeGeneration = generation;
    let pinnedBinding = bindings.get(wid);
    const methods = ['allowUnattendedIssueCreation', 'previewCreate', 'createIssue', 'previewOwnLink', 'setOwnLink', 'selectedBoards', 'boardRead', 'getIssue', 'getComments', 'updateIssue', 'listTransitions', 'addComment', 'executeTransition'];
    const facade = {};
    for (const method of methods) facade[method] = (...args) => {
      let captured;
      try {
        const validate = value => {
          if (!value || typeof value !== 'object') return;
          if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== Array.prototype) invalid();
          const array = Array.isArray(value), keys = Reflect.ownKeys(value);
          if (array && (keys.length !== value.length + 1 || value.length > 500)) invalid();
          for (const key of keys) {
            if (typeof key !== 'string') invalid();
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !('value' in descriptor) || (!descriptor.enumerable && !(array && key === 'length'))) invalid();
            if (array && key !== 'length' && (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) invalid();
            validate(descriptor.value);
          }
        };
        for (const arg of args) validate(arg);
        captured = structuredClone(args);
      } catch { return Promise.reject(new ServiceError('invalid', 400)); }
      if (closed || facadePending >= MAX_PENDING) return Promise.reject(new ServiceError('unavailable', 503));
      facadePending++;
      const callSignal = AbortSignal.any([lifecycle.signal, AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])]);
      return Promise.resolve().then(async () => {
        callSignal.throwIfAborted();
        if (closed) fail('unavailable', 503);
        if (Date.now() >= expires) fail('scope_expired', 409);
        const now = current(), live = workspaceRegistry.get(wid);
        if (!live || live.createdAt !== incarnation || now.revision !== state.revision || generation !== scopeGeneration || !sameIds(now.settings.workspaces[wid], ids)) fail('needs_reselect', 409);
        if (pinnedBinding && bindings.get(wid) !== pinnedBinding) fail('needs_reselect', 409);
        if (!pinnedBinding) await ensureBinding(wid, callSignal);
        pinnedBinding ??= bindings.get(wid);
        if (Date.now() >= expires) fail('scope_expired', 409);
        const scope = makeWorkspaceScope({ workspaceId: wid, sessionId: sid, signal: callSignal, ...(assertCaller ? { assertCaller } : {}) }, true, expires);
        return scope[method](...captured);
      }).catch(error => {
        const safe = safeError(error, callSignal);
        throw new ServiceError(safe.code, safe.status);
      }).finally(() => { facadePending--; });
    };
    return Object.freeze(facade);
  }
  // Resolve from the host registry only. Never infer ownership from a path or
  // select among ambiguous owners. Recheck the same incarnation after the
  // asynchronous account/selection authorization performed by toolScope.
  function currentWorkspace(options) {
    try {
      shape(options, ['sessionId', 'signal']);
      const { sessionId: sid, signal: callerSignal } = options;
      sessionId(sid);
      if (callerSignal !== undefined && !(callerSignal instanceof AbortSignal)) invalid();
      return run(async signal => {
        function resolve() {
          signal.throwIfAborted();
          if (typeof workspaceRegistry.list !== 'function') fail('unavailable', 503);
          const items = workspaceRegistry.list(), archived = workspaceRegistry.archivedSessionIds;
          if (!Array.isArray(items) || (archived != null && !Array.isArray(archived))) fail('unavailable', 503);
          if (archived?.includes(sid)) fail('workspace_not_found', 404);
          const owners = [];
          for (const item of items) {
            if (!item || !Array.isArray(item.sessionIds) || item.sessionIds.length > 100_000 ||
                (item.archivedSessionIds != null && !Array.isArray(item.archivedSessionIds))) fail('unavailable', 503);
            if (item.sessionIds.includes(sid) && !item.archivedSessionIds?.includes(sid)) owners.push(item);
          }
          if (!owners.length) fail('workspace_not_found', 404);
          if (owners.length !== 1) fail('workspace_ambiguous', 409);
          const owner = owners[0], id = owner.id, incarnation = owner.createdAt;
          if (typeof id !== 'string' || !ID.test(id) || typeof incarnation !== 'string' || !incarnation ||
              incarnation.length > 256 || !incarnation.isWellFormed() || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(incarnation)) fail('unavailable', 503);
          const live = workspaceRegistry.get(id);
          if (!live || live.id !== id || live.createdAt !== incarnation || !Array.isArray(live.sessionIds) || !live.sessionIds.includes(sid) ||
              (live.archivedSessionIds != null && (!Array.isArray(live.archivedSessionIds) || live.archivedSessionIds.includes(sid)))) fail('unavailable', 503);
          return { id, incarnation };
        }
        const before = resolve();
        const scope = toolScope({ workspaceId: before.id, sessionId: sid, signal });
        const ids = await scope.selectedBoards();
        const after = resolve();
        if (after.id !== before.id || after.incarnation !== before.incarnation) fail('needs_reselect', 409);
        signal.throwIfAborted();
        return { workspaceId: before.id, boardIds: ids };
      }, callerSignal).catch(error => {
        const safe = safeError(error, callerSignal ?? lifecycle.signal);
        throw new ServiceError(safe.code, safe.status);
      });
    } catch (error) {
      const safe = safeError(error, lifecycle.signal);
      return Promise.reject(new ServiceError(safe.code, safe.status));
    }
  }
  // Only the owner's authenticated HTTP command dispatcher may omit a session.
  // Session tools always use the wrapper above and retain all session checks.
  function makeWorkspaceScope(options, requireSession, deadline) {
    if (requireSession) fields(options, ['workspaceId', 'sessionId', 'signal'], ['assertCaller']);
    else shape(options, ['workspaceId', 'boardId', 'signal']);
    const { workspaceId: wid, sessionId: sid, boardId: requestedBoard, signal: callerSignal, assertCaller } = options;
    if (assertCaller !== undefined && typeof assertCaller !== 'function') invalid();
    workspaceId(wid); if (requireSession) sessionId(sid); else boardId(requestedBoard);
    if (callerSignal !== undefined && !(callerSignal instanceof AbortSignal)) invalid();
    const initial = current(), incarnation = workspace(wid), binding = bindings.get(wid);
    configured(initial);
    const ids = initial.settings.workspaces[wid];
    if (!Array.isArray(ids) || !ids.length) fail('board_not_selected', 403);
    boardIds(ids);
    if (!requireSession && !ids.includes(requestedBoard)) fail('board_not_selected', 403);
    if (!binding || binding.incarnation !== incarnation || binding.revision !== initial.revision) fail('needs_reselect', 409);
    const selected = Object.freeze([...ids]);
    const selectedIdentity = binding.identity, selectedAccountScope = binding.accountScope;
    const expires = deadline ?? Date.now() + TOOL_SCOPE_TTL_MS;

    function check(signal) {
      signal.throwIfAborted();
      if (Date.now() >= expires) fail('scope_expired', 409);
      const item = workspaceRegistry.get(wid);
      if (!item || item.createdAt !== incarnation) fail('needs_reselect', 409);
      if (requireSession && (!Array.isArray(item.sessionIds) || !item.sessionIds.includes(sid) ||
          (workspaceRegistry.archivedSessionIds != null && !Array.isArray(workspaceRegistry.archivedSessionIds)) ||
          workspaceRegistry.archivedSessionIds?.includes(sid) ||
          (item.archivedSessionIds != null && (!Array.isArray(item.archivedSessionIds) || item.archivedSessionIds.includes(sid))))) fail('session_not_in_workspace', 403);
      const state = current();
      if (state.revision !== initial.revision || !state.settings.connection || bindings.get(wid) !== binding ||
          binding.revision !== initial.revision || binding.incarnation !== incarnation || binding.identity !== selectedIdentity || binding.accountScope !== selectedAccountScope ||
          !Array.isArray(state.settings.workspaces[wid]) || state.settings.workspaces[wid].length !== selected.length ||
          selected.some((id, index) => state.settings.workspaces[wid][index] !== id)) fail('needs_reselect', 409);
    }
    check(callerSignal ?? lifecycle.signal);
    // The unattended path additionally requires an unambiguous live owner and a
    // trusted host callback. Neither capability can be supplied via tool JSON.
    function checkUnattended(signal, expectedRevision, requireCaller = true) {
      check(signal);
      if (requireCaller) {
        if (typeof assertCaller !== 'function') fail('forbidden', 403);
        const result = assertCaller();
        if (result && (typeof result === 'object' || typeof result === 'function') && typeof result.then === 'function') {
          // A rejected accidental async assertion must not become an unhandled rejection.
          Promise.resolve(result).catch(() => {});
          fail('forbidden', 403);
        }
        if (result === false) fail('forbidden', 403);
        check(signal);
      }
      if (typeof workspaceRegistry.list !== 'function') fail('unavailable', 503);
      const items = workspaceRegistry.list();
      if (!Array.isArray(items)) fail('unavailable', 503);
      let owners = 0;
      for (const item of items) {
        if (!item || !Array.isArray(item.sessionIds) || item.sessionIds.length > 100_000 ||
            (item.archivedSessionIds != null && !Array.isArray(item.archivedSessionIds))) fail('unavailable', 503);
        if (item.sessionIds.includes(sid) && !item.archivedSessionIds?.includes(sid)) {
          owners++;
          if (item.id !== wid || item.createdAt !== incarnation) fail('workspace_ambiguous', 409);
        }
      }
      if (owners !== 1) fail('workspace_ambiguous', 409);
      const state = current();
      if (expectedRevision !== undefined && (state.revision !== expectedRevision || !optedIn(state, wid, selectedAccountScope, incarnation))) fail('unattended_not_enabled', 403);
      return state;
    }
    async function account(signal, verify = () => check(signal)) {
      verify();
      let result;
      let scope;
      try { result = await session(signal); verify(); scope = await accountScope(result, signal); }
      catch (error) { verify(); throw error; }
      verify();
      if (result.identity !== selectedIdentity || scope !== selectedAccountScope) revokeAccount(scope, initial.revision);
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
        if (requireSession ? selected.includes(board.id) : board.id === requestedBoard) member = true;
      }
      if (!member) fail('issue_not_in_selected_boards', 403);
      if (typeof value.assigneeKnown !== 'boolean' || (value.assigneeKnown && value.assignee !== null && (!value.assignee || typeof value.assignee !== 'object'))) fail('invalid_tracker_response', 502);
      const assignee = value.assigneeKnown && value.assignee !== null ? { id: resultText(value.assignee.id, 128), display: resultText(value.assignee.display, 256) } : null;
      const result = { key, summary: resultText(value.summary, 4096), status: safeStatus(value.status), assigneeKnown: value.assigneeKnown, assignee };
      if (Object.hasOwn(value, 'id')) {
        if (typeof value.id !== 'string' || !TRANSITION.test(value.id)) fail('invalid_tracker_response', 502);
        result.id = value.id;
      }
      if (includeDescription) {
        result.description = resultText(value.description, 48 * 1024, true);
        if (!(value.version === null || (Number.isSafeInteger(value.version) && value.version >= 0))) fail('invalid_tracker_response', 502);
        result.version = value.version;
      }
      return result;
    }
    function keyArg(value) { if (typeof value !== 'string' || !ISSUE.test(value)) invalid(); }
    async function issue(key, signal, expectedId) {
      const a = await account(signal);
      if (typeof a.getIssue !== 'function') fail('invalid_tracker_response', 502);
      const value = safeIssue(await checkedAwait(() => a.getIssue(key, { signal }), signal), key);
      if (expectedId !== undefined && value.id !== expectedId) fail('conflict', 409);
      return value;
    }
    function issueInput(input, fields) {
      shape(input, requireSession ? fields : [...fields, 'issueId']);
      keyArg(input.issueKey);
      if (!requireSession && (typeof input.issueId !== 'string' || !TRANSITION.test(input.issueId))) invalid();
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
    async function transitions(key, signal, expectedId) {
      await issue(key, signal, expectedId);
      const a = await account(signal);
      if (typeof a.listTransitions !== 'function') fail('invalid_tracker_response', 502);
      const result = safeTransitions(await checkedAwait(() => a.listTransitions(key, { signal }), signal));
      await issue(key, signal, expectedId);
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
    // Own-link operations never accept a workspace, session or account namespace
    // from their input. Board membership is checked by exact issue GET, not search.
    async function ownLinkIssue(key, board, signal, expectedId) {
      const a = await account(signal);
      if (typeof a.getIssue !== 'function') fail('invalid_tracker_response', 502);
      const value = await checkedAwait(() => a.getIssue(key, { signal }), signal);
      if (!value || value.key !== key || !Array.isArray(value.boards) || value.boards.length > 500 ||
          value.boards.some(b => !b || typeof b.id !== 'string' || !BOARD.test(b.id) || !Number.isSafeInteger(Number(b.id))) ||
          !value.boards.some(b => b.id === board)) fail('issue_not_in_selected_boards', 403);
      if (typeof value.id !== 'string' || !TRANSITION.test(value.id)) fail('issue_id_required', 409);
      if (expectedId !== undefined && value.id !== expectedId) fail('conflict', 409);
      return value.id;
    }
    function ownLinkArgs(input, mutation) {
      shape(input, mutation ? ['boardId', 'issueKey', 'issueId', 'linked', 'expectedRevision'] : ['boardId', 'issueKey']);
      boardId(input.boardId); keyArg(input.issueKey);
      if (!selected.includes(input.boardId)) fail('board_not_selected', 403);
      if (mutation) {
        if (typeof input.issueId !== 'string' || !TRANSITION.test(input.issueId) || typeof input.linked !== 'boolean') invalid();
        revision(input.expectedRevision);
      }
      if (!links) fail('unavailable', 503);
    }
    // A queue capability proves the exact lookup, not board membership. An
    // explicit queue need not be related to the board. Keep it separate from
    // the safe projection used for approval.
    function safeQueue(value, input = false) {
      const bad = () => input ? invalid() : fail('invalid_tracker_response', 502);
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) bad();
      const keys = Reflect.ownKeys(value);
      if (!keys.includes('id') || !keys.includes('key') || keys.some(k => typeof k !== 'string' || !['id', 'key', 'display'].includes(k))) bad();
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) bad();
      }
      if (typeof value.id !== 'string' || !BOARD.test(value.id) || !Number.isSafeInteger(Number(value.id)) ||
          typeof value.key !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(value.key)) bad();
      if (Object.hasOwn(value, 'display') && (typeof value.display !== 'string' || !value.display.trim() || value.display.length > 256 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value.display))) bad();
      return Object.freeze({ id: value.id, key: value.key, ...(Object.hasOwn(value, 'display') ? { display: value.display } : {}) });
    }
    function sameQueue(a, b) {
      return a.id === b.id && a.key === b.key && Object.hasOwn(a, 'display') === Object.hasOwn(b, 'display') && a.display === b.display;
    }
    function creationBoard(id) {
      boardId(id);
      if (!selected.includes(id)) fail('board_not_selected', 403);
    }
    async function creationQueue(a, id, queueKey, signal, verify = () => check(signal)) {
      const explicit = queueKey !== undefined;
      if (typeof a[explicit ? 'getExplicitCreationQueue' : 'getBoardCreationQueue'] !== 'function') fail('invalid_tracker_response', 502);
      verify();
      const capability = await raceAbort(() => { verify(); return explicit ? a.getExplicitCreationQueue(id, queueKey, { signal }) : a.getBoardCreationQueue(id, { signal }); }, signal);
      verify();
      const queue = safeQueue(capability);
      if (explicit && queue.key !== queueKey) fail('invalid_tracker_response', 502);
      // The API capability is an immutable object bound to this account session.
      // A mutable substitute could change after its validation but before POST.
      if (!Object.isFrozen(capability)) fail('invalid_tracker_response', 502);
      return { capability, queue };
    }
    async function write(signal, key, kind, value, expectedTo, issueId) {
      const initialIssue = await issue(key, signal);
      if (issueId !== undefined && initialIssue.id !== issueId) fail('conflict', 409);
      if (kind === 'editComment') {
        const baselineAccount = await account(signal);
        if (typeof baselineAccount.getComment !== 'function') fail('invalid_tracker_response', 502);
        const baseline = await checkedAwait(() => baselineAccount.getComment(key, value.id, { signal }), signal);
        if (!baseline || baseline.id !== value.id || !Number.isSafeInteger(baseline.version) || baseline.version < 0) fail('invalid_tracker_response', 502);
        // Tracker documents no atomic precondition for comment PATCH.
        if (baseline.version !== value.expectedVersion) fail('conflict', 409);
        value = { id: value.id, text: value.text };
      }
      if (kind === 'executeTransition') {
        const available = await transitions(key, signal, issueId);
        if (!available.some(item => item.id === value && item.to.id === expectedTo.id && item.to.key === expectedTo.key && item.to.display === expectedTo.display)) fail('transition_not_available', 409);
      }
      if (issueId !== undefined && (await issue(key, signal)).id !== issueId) fail('conflict', 409);
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
      if (kind === 'editComment') {
        if (!result || result.id !== value.id || !Number.isSafeInteger(result.version) || result.version < 0) fail('outcome_unknown', 502);
        return { id: result.id, version: result.version };
      }
      if (kind === 'updateIssue') {
        if (!result || !Number.isSafeInteger(result.version) || result.version < 0) fail('outcome_unknown', 502);
        return { version: result.version };
      }
      return { ok: true };
    }
    return Object.freeze({
      ...(requireSession ? {
        // This is only a boolean projection; it grants no authority to dispatch.
        allowUnattendedIssueCreation: () => execute(async signal => {
          check(signal);
          await account(signal);
          const state = current();
          if (!optedIn(state, wid, selectedAccountScope, incarnation)) return { enabled: false, revision: state.revision };
          try { checkUnattended(signal, undefined, false); }
          catch (error) {
            if (error instanceof ServiceError && ['workspace_ambiguous', 'unavailable'].includes(error.code)) return { enabled: false, revision: state.revision };
            throw error;
          }
          return { enabled: true, revision: state.revision };
        }),
        // The projection is safe for approval and is not itself a capability.
        previewCreate: input => {
          try {
            fields(input, ['boardId'], ['queueKey']); creationBoard(input.boardId);
            if (Object.hasOwn(input, 'queueKey') && (typeof input.queueKey !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(input.queueKey))) invalid();
            input = Object.freeze({ boardId: input.boardId, ...(Object.hasOwn(input, 'queueKey') ? { queueKey: input.queueKey } : {}) });
          } catch (error) { return Promise.reject(error); }
          return execute(async signal => {
            const a = await account(signal);
            const { queue } = await creationQueue(a, input.boardId, input.queueKey, signal);
            await account(signal); check(signal);
            return { queue };
          });
        },
        createIssue: (input, unattended) => {
          try {
            if (unattended !== undefined) {
              shape(unattended, ['unattendedRevision']); revision(unattended.unattendedRevision);
              unattended = Object.freeze({ unattendedRevision: unattended.unattendedRevision });
              checkUnattended(callerSignal ?? lifecycle.signal, unattended.unattendedRevision);
            }
            fields(input, ['boardId', 'expectedQueue', 'summary'], ['description', 'queueKey']);
            creationBoard(input.boardId);
            const expectedQueue = safeQueue(input.expectedQueue, true);
            if (Object.hasOwn(input, 'queueKey') && (typeof input.queueKey !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(input.queueKey))) invalid();
            if (Object.hasOwn(input, 'queueKey') && input.queueKey !== expectedQueue.key) fail('conflict', 409);
            inputText(input.summary, 4096);
            if (Object.hasOwn(input, 'description')) inputText(input.description, MAX_COMMENT, { empty: true, multiline: true });
            input = Object.freeze({ boardId: input.boardId, expectedQueue, summary: input.summary,
              ...(Object.hasOwn(input, 'queueKey') ? { queueKey: input.queueKey } : {}),
              ...(Object.hasOwn(input, 'description') ? { description: input.description } : {}) });
          } catch (error) { return Promise.reject(error); }
          return execute(async signal => {
            // Resolve account first and use the capability obtained from this exact
            // immutable account session for the POST. The final live queue check
            // happens after approval and immediately before dispatch.
            const creationCheck = () => unattended ? checkUnattended(signal, unattended.unattendedRevision) : check(signal);
            creationCheck();
            const a = await account(signal, creationCheck); creationCheck();
            if (typeof a.createIssue !== 'function') fail('invalid_tracker_response', 502);
            const { capability, queue } = await creationQueue(a, input.boardId, input.queueKey, signal, creationCheck); creationCheck();
            if (!sameQueue(queue, input.expectedQueue)) fail('conflict', 409);
            // Detect rotation while fetching the queue, while retaining a's exact
            // credential-bound capability for the eventual call.
            await account(signal, creationCheck); creationCheck();
            let dispatched = false, returned = false, result;
            try {
              result = await raceAbort(() => {
                creationCheck(); dispatched = true;
                return a.createIssue({ queue: capability, summary: input.summary,
                  ...(Object.hasOwn(input, 'description') ? { description: input.description } : {}) }, { signal });
              }, signal);
              returned = true;
              creationCheck(); await account(signal, creationCheck); creationCheck();
            } catch (error) {
              if (!dispatched) throw error;
              // A definitive Tracker rejection may be reported only while the
              // original scope and credentials still hold. Never retry a POST.
              if (!returned && !signal.aborted && error?.name === 'TrackerError' && ['unauthorized', 'forbidden', 'not_found', 'conflict', 'precondition_failed', 'unprocessable', 'rate_limited', 'invalid_input'].includes(error.code)) {
                try { creationCheck(); await account(signal, creationCheck); creationCheck(); }
                catch { fail('outcome_unknown', 502); }
                const statuses = { unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, precondition_failed: 412, unprocessable: 422, rate_limited: 429, invalid_input: 400 };
                fail(error.code, statuses[error.code]);
              }
              fail('outcome_unknown', 502);
            }
            if (!result || typeof result.id !== 'string' || !TRANSITION.test(result.id) ||
                typeof result.key !== 'string' || !ISSUE.test(result.key) || !result.key.startsWith(`${queue.key}-`) ||
                !Number.isSafeInteger(result.version) || result.version < 0) fail('outcome_unknown', 502);
            return { id: result.id, key: result.key, version: result.version };
          });
        },
        previewOwnLink: input => {
          // Capture exact inputs before any asynchronous boundary.
          try { ownLinkArgs(input, false); input = Object.freeze({ boardId: input.boardId, issueKey: input.issueKey }); }
          catch (error) { return Promise.reject(error); }
          return execute(async signal => {
            const id = await ownLinkIssue(input.issueKey, input.boardId, signal);
            await account(signal); check(signal);
            let result;
            try { result = links.read({ accountScope: binding.accountScope, workspaceId: wid, workspaceCreatedAt: incarnation }); }
            catch { fail('internal', 500); }
            if (!result || !Number.isSafeInteger(result.revision) || result.revision < 0 || !Array.isArray(result.links) || result.links.length > 5000) fail('internal', 500);
            let linked = false; const seen = new Set();
            for (const row of result.links) {
              if (!row || typeof row.issueId !== 'string' || !TRANSITION.test(row.issueId) || !validSessionId(row.sessionId)) fail('internal', 500);
              const pair = JSON.stringify([row.issueId, row.sessionId]);
              if (seen.has(pair)) fail('internal', 500);
              seen.add(pair);
              if (row.issueId === id && row.sessionId === sid) linked = true;
            }
            check(signal);
            return { issueId: id, linked, revision: result.revision };
          });
        },
        setOwnLink: input => {
          try {
            ownLinkArgs(input, true);
            input = Object.freeze({ boardId: input.boardId, issueKey: input.issueKey, issueId: input.issueId, linked: input.linked, expectedRevision: input.expectedRevision });
          } catch (error) { return Promise.reject(error); }
          return execute(async signal => {
            await ownLinkIssue(input.issueKey, input.boardId, signal, input.issueId);
            await ownLinkIssue(input.issueKey, input.boardId, signal, input.issueId);
            await account(signal); check(signal);
            // Synchronous host store CAS; any throw or malformed response could
            // follow commit. There is no retry and board is not part of the key.
            let result;
            try {
              const raw = links.mutate({ accountScope: binding.accountScope, workspaceId: wid, workspaceCreatedAt: incarnation,
                expectedRevision: input.expectedRevision, issueId: input.issueId, sessionId: sid, linked: input.linked });
              result = { ok: raw?.ok, revision: raw?.revision };
              if (typeof result.ok !== 'boolean' || !Number.isSafeInteger(result.revision) || result.revision < 0 ||
                  (result.ok && result.revision !== input.expectedRevision && result.revision !== input.expectedRevision + 1)) fail('outcome_unknown', 502);
            } catch { fail('outcome_unknown', 502); }
            if (!result.ok) fail('conflict', 409);
            try { check(signal); await account(signal); check(signal); } catch { fail('outcome_unknown', 502); }
            return { revision: result.revision };
          });
        },
      } : {}),
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
          const value = { key: entry.key, summary: resultText(entry.summary, 4096), status: safeStatus(entry.status), assigneeKnown: entry.assigneeKnown, assignee };
          if (Object.hasOwn(entry, 'id')) {
            if (typeof entry.id !== 'string' || !TRANSITION.test(entry.id)) fail('invalid_tracker_response', 502);
            value.id = entry.id;
          }
          return value;
        });
        check(signal);
        return { board: { id: input.boardId, name: resultText(raw.board.name, 256) }, columns, issues, issuesComplete: false,
          issuesReason: ['approximate_board_filter', 'explicit_keys_only', 'board_search_unsupported', 'page_limit', 'membership_mismatch'].includes(raw.issuesReason) ? raw.issuesReason : 'unknown' };
      }),
      getIssue: input => execute(async signal => { issueInput(input, ['issueKey']); return issue(input.issueKey, signal, input.issueId); }),
      getComments: input => execute(async signal => {
        if (requireSession) issueInput(input, ['issueKey']);
        else {
          fields(input, ['issueKey', 'issueId'], ['cursor']);
          keyArg(input.issueKey);
          if (typeof input.issueId !== 'string' || !TRANSITION.test(input.issueId) ||
              (Object.hasOwn(input, 'cursor') && !validCommentCursor(input.cursor))) invalid();
        }
        await issue(input.issueKey, signal, input.issueId);
        const a = await account(signal);
        if (typeof a.getComments !== 'function') fail('invalid_tracker_response', 502);
        const result = await checkedAwait(() => a.getComments(input.issueKey, { signal, ...(Object.hasOwn(input, 'cursor') ? { cursor: input.cursor } : {}) }), signal);
        await issue(input.issueKey, signal, input.issueId);
        if (!result || !Array.isArray(result.comments) || result.comments.length > 100 || typeof result.complete !== 'boolean' ||
            (result.complete && result.nextCursor !== null) ||
            (result.nextCursor !== null && (!validCommentCursor(result.nextCursor) || (Object.hasOwn(input, 'cursor') && Number(result.nextCursor) <= Number(input.cursor))))) fail('invalid_tracker_response', 502);
        const seen = new Set();
        const comments = result.comments.map(comment => {
          if (!comment || typeof comment.id !== 'string' || !TRANSITION.test(comment.id) || seen.has(comment.id) ||
              !Number.isSafeInteger(comment.version) || comment.version < 0 || !comment.createdBy || typeof comment.createdBy !== 'object') fail('invalid_tracker_response', 502);
          seen.add(comment.id);
          const createdAt = resultText(comment.createdAt, 40);
          if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) fail('invalid_tracker_response', 502);
          if (typeof comment.text !== 'string') fail('invalid_tracker_response', 502);
          return { id: comment.id, text: resultText(comment.text, MAX_COMMENT, true), version: comment.version,
            createdBy: { id: resultText(comment.createdBy.id, 128), display: resultText(comment.createdBy.display, 256) }, createdAt };
        });
        // Completeness describes this traversal only, not a stable snapshot.
        // A null cursor with incomplete metadata is unknown, not an end or a cursor.
        // Agent tools retain their original non-paginated response contract.
        return requireSession ? { comments, complete: false } : { comments, complete: result.complete, nextCursor: result.nextCursor };
      }),
      updateIssue: input => {
        try {
          shape(input, ['issueKey', 'issueId', 'changes']); keyArg(input.issueKey);
          if (typeof input.issueId !== 'string' || !TRANSITION.test(input.issueId)) invalid();
          fields(input.changes, ['expectedVersion'], ['summary', 'description', 'assignee']); revision(input.changes.expectedVersion);
          if (!['summary', 'description', 'assignee'].some(k => Object.hasOwn(input.changes, k))) invalid();
          if (Object.hasOwn(input.changes, 'summary')) inputText(input.changes.summary, 4096);
          if (Object.hasOwn(input.changes, 'description')) inputText(input.changes.description, 48 * 1024, { empty: true, multiline: true });
          if (Object.hasOwn(input.changes, 'assignee') && input.changes.assignee !== null) inputText(input.changes.assignee, 128);
          input = Object.freeze({ issueKey: input.issueKey, issueId: input.issueId, changes: Object.freeze({ ...input.changes }) });
        } catch (error) { return Promise.reject(error); }
        return execute(signal => write(signal, input.issueKey, 'updateIssue', input.changes, undefined, input.issueId));
      },
      listTransitions: input => execute(async signal => { issueInput(input, ['issueKey']); return transitions(input.issueKey, signal, input.issueId); }),
      addComment: input => {
        try {
          shape(input, ['issueKey', 'issueId', 'text']); keyArg(input.issueKey);
          if (typeof input.issueId !== 'string' || !TRANSITION.test(input.issueId)) invalid();
          inputText(input.text, MAX_COMMENT, { multiline: true });
          input = Object.freeze({ issueKey: input.issueKey, issueId: input.issueId, text: input.text });
        } catch (error) { return Promise.reject(error); }
        return execute(signal => write(signal, input.issueKey, 'addComment', input.text, undefined, input.issueId));
      },
      // Editing is owner-GUI only; do not add it to agent tool scopes.
      ...(!requireSession ? { editComment: input => execute(async signal => {
        issueInput(input, ['issueKey', 'commentId', 'expectedVersion', 'text']);
        if (typeof input.commentId !== 'string' || !TRANSITION.test(input.commentId)) invalid();
        revision(input.expectedVersion); inputText(input.text, MAX_COMMENT, { multiline: true });
        return write(signal, input.issueKey, 'editComment', { id: input.commentId, expectedVersion: input.expectedVersion, text: input.text }, undefined, input.issueId);
      }) } : {}),
      executeTransition: input => {
        try {
          shape(input, ['issueKey', 'issueId', 'transitionId', 'expectedTo']); keyArg(input.issueKey);
          if (typeof input.issueId !== 'string' || !TRANSITION.test(input.issueId) ||
              typeof input.transitionId !== 'string' || !TRANSITION.test(input.transitionId)) invalid();
          shape(input.expectedTo, ['id', 'key', 'display']);
          inputText(input.expectedTo.id, 128); inputText(input.expectedTo.key, 128); inputText(input.expectedTo.display, 256);
          input = Object.freeze({ issueKey: input.issueKey, issueId: input.issueId, transitionId: input.transitionId,
            expectedTo: Object.freeze({ ...input.expectedTo }) });
        } catch (error) { return Promise.reject(error); }
        return execute(signal => write(signal, input.issueKey, 'executeTransition', input.transitionId, input.expectedTo, input.issueId));
      },
    });
  }
  return Object.freeze({ read, command, fetch, close, toolScope, currentWorkspace });
}
