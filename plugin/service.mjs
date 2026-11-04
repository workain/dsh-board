import { randomUUID } from 'node:crypto';
import * as core from './core.mjs';

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_PENDING = 64;
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
class InputError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
const invalid = () => { throw new InputError('invalid'); };
function shape(v, allowed, required = allowed) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype || Object.keys(v).some(k => !allowed.includes(k)) || required.some(k => !own(v, k))) invalid();
}
function text(v, max = 200, empty = false) {
  if (typeof v !== 'string' || v.length > max || (!empty && (!v.trim() || v !== v.trim()))) invalid();
}
function id(v) { text(v, 256); }
function validateAggregate(value) {
  shape(value, ['revision', 'state', 'links']);
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) invalid();
  core.validateState(value.state);
  if (!Array.isArray(value.links)) invalid();
  const seen = new Set();
  for (const link of value.links) {
    shape(link, ['boardId', 'taskId', 'sessionId']);
    id(link.boardId); id(link.taskId); id(link.sessionId);
    const board = value.state.boards.find(b => b.id === link.boardId);
    if (!board || !board.tasks.some(t => t.id === link.taskId)) invalid();
    const key = JSON.stringify([link.boardId, link.taskId, link.sessionId]);
    if (seen.has(key)) invalid();
    seen.add(key);
  }
  return value;
}
function snapshot(value) {
  validateAggregate(value);
  const boards = [];
  // A shared board can occur in many workspaces, so the projected DTO needs its
  // own limit independently of SQLite's bounded aggregate.
  let bytes = Buffer.byteLength(JSON.stringify({ revision: value.revision, boards: [], links: value.links }));
  for (const workspace of value.state.workspaces) {
    for (const boardId of workspace.boardIds) {
      const board = value.state.boards.find(b => b.id === boardId);
      const view = { id: board.id, workspaceId: workspace.id, name: board.name,
        statuses: board.columns.filter(c => !c.archived).map((c, position) => ({ id: c.id, name: c.name, position })),
        tasks: board.tasks.map(t => ({ id: t.id, title: t.title, description: t.description, statusId: t.columnId })) };
      bytes += Buffer.byteLength(JSON.stringify(view)) + 1;
      if (bytes > MAX_SNAPSHOT_BYTES) throw new InputError('too_large', 413);
      boards.push(view);
    }
  }
  return { revision: value.revision, boards, links: structuredClone(value.links) };
}
function commandShape(c) {
  shape(c, ['expectedRevision', 'op', 'workspaceId', 'boardId', 'name', 'status', 'task', 'taskId', 'sessionId', 'linked'], ['expectedRevision', 'op', 'workspaceId']);
  if (!Number.isSafeInteger(c.expectedRevision) || c.expectedRevision < 0) invalid();
  id(c.workspaceId);
  const fields = {
    'board.create': ['expectedRevision', 'op', 'workspaceId', 'name'],
    'status.save': ['expectedRevision', 'op', 'workspaceId', 'boardId', 'status'],
    'task.save': ['expectedRevision', 'op', 'workspaceId', 'boardId', 'task'],
    'link.set': ['expectedRevision', 'op', 'workspaceId', 'boardId', 'taskId', 'sessionId', 'linked'],
  }[c.op];
  if (!fields) invalid();
  shape(c, fields);
  if (c.op === 'board.create') text(c.name);
  else id(c.boardId);
  if (c.op === 'status.save') {
    shape(c.status, ['id', 'name', 'position'], ['name']);
    if (own(c.status, 'id')) id(c.status.id);
    text(c.status.name);
    if (own(c.status, 'position') && (!Number.isSafeInteger(c.status.position) || c.status.position < 0)) invalid();
  }
  if (c.op === 'task.save') {
    shape(c.task, ['id', 'title', 'description', 'statusId'], ['title', 'description', 'statusId']);
    if (own(c.task, 'id')) id(c.task.id);
    text(c.task.title); text(c.task.description, 48 * 1024, true); id(c.task.statusId);
  }
  if (c.op === 'link.set') { id(c.taskId); id(c.sessionId); if (typeof c.linked !== 'boolean') invalid(); }
}
function assigned(state, workspaceId, boardId) {
  if (!state.workspaces.find(w => w.id === workspaceId)?.boardIds.includes(boardId)) throw new InputError('not_found', 404);
  return state.boards.find(b => b.id === boardId);
}
function applyCommand(value, c, registry) {
  commandShape(c);
  const workspace = registry.get(c.workspaceId);
  if (!workspace) throw new InputError('workspace_not_found', 404);
  let state = value.state, links = value.links;
  if (c.op === 'board.create') {
    const boardId = randomUUID();
    state = core.assignBoard(core.ensureWorkspace(core.createBoard(state, { id: boardId, name: c.name }), c.workspaceId), c.workspaceId, boardId);
  } else {
    const board = assigned(state, c.workspaceId, c.boardId);
    if (c.op === 'status.save') {
      const columnId = c.status.id || randomUUID();
      state = c.status.id ? core.renameColumn(state, c.boardId, columnId, c.status.name) : core.createColumn(state, c.boardId, { id: columnId, name: c.status.name });
      if (own(c.status, 'position')) {
        const columns = state.boards.find(b => b.id === c.boardId).columns;
        if (c.status.position >= columns.filter(x => !x.archived).length) invalid();
        const active = columns.filter(x => !x.archived && x.id !== columnId).map(x => x.id);
        active.splice(c.status.position, 0, columnId);
        const archived = columns.filter(x => x.archived).map(x => x.id);
        state = core.reorderColumns(state, c.boardId, [...active, ...archived]);
      }
    } else if (c.op === 'task.save') {
      const t = c.task;
      state = t.id ? core.updateTask(state, c.boardId, t.id, { title: t.title, description: t.description, columnId: t.statusId }) : core.createTask(state, c.boardId, { id: randomUUID(), title: t.title, description: t.description, columnId: t.statusId });
    } else {
      if (!board.tasks.some(t => t.id === c.taskId)) throw new InputError('not_found', 404);
      const exists = links.some(l => l.boardId === c.boardId && l.taskId === c.taskId && l.sessionId === c.sessionId);
      // Removal remains possible after a Session is archived or no longer accounted.
      if (c.linked && (!Array.isArray(workspace.sessionIds) || !workspace.sessionIds.includes(c.sessionId) || registry.archivedSessionIds?.includes(c.sessionId))) throw new InputError('session_not_in_workspace', 400);
      if (c.linked && !exists) links = [...links, { boardId: c.boardId, taskId: c.taskId, sessionId: c.sessionId }];
      if (!c.linked && exists) links = links.filter(l => !(l.boardId === c.boardId && l.taskId === c.taskId && l.sessionId === c.sessionId));
    }
  }
  if (value.revision === Number.MAX_SAFE_INTEGER) throw new InputError('revision_exhausted', 503);
  return validateAggregate({ revision: value.revision + 1, state, links });
}
async function readBody(request, signal) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    if (request.body) void request.body.cancel().catch(() => {});
    throw new InputError('body_too_large', 413);
  }
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type') || '')) {
    if (request.body) void request.body.cancel().catch(() => {});
    throw new InputError('content_type', 415);
  }
  if (!request.body) invalid();
  signal.throwIfAborted();
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { void reader.cancel().catch(() => {}); throw new InputError('body_too_large', 413); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { invalid(); }
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
export function createBoardService(store, registry) {
  let tail = Promise.resolve(), stopping = false, pending = 0, requests = 0, closing;
  const activeBodies = new Set();
  validateAggregate(store.read());
  function serialize(work, signal) {
    if (stopping || pending >= MAX_PENDING) return Promise.reject(new InputError('unavailable', 503));
    if (signal?.aborted) return Promise.reject(signal.reason);
    pending++;
    const result = tail.then(() => { signal?.throwIfAborted(); return work(); });
    tail = result.catch(() => {}).finally(() => { pending--; });
    return result;
  }
  const service = {
    read: signal => serialize(() => snapshot(store.read({ signal })), signal),
    mutate: (c, signal) => serialize(() => {
      commandShape(c);
      const next = store.transaction(c.expectedRevision, current => {
        const next = applyCommand(validateAggregate(current), c, registry);
        // Refuse a mutation whose response cannot be represented within the bound.
        snapshot(next);
        return next;
      }, { signal });
      return snapshot(next);
    }, signal),
    linkCurrentSession: (args, sessionId, signal) => serialize(() => {
      shape(args, ['workspaceId', 'boardId', 'taskId', 'linked']);
      id(sessionId);
      const next = store.transaction(null, current => {
        // Recheck membership after acquiring the database transaction, not before
        // approval or while waiting in the queue. Removal also requires membership.
        const workspace = registry.get(args.workspaceId);
        if (!workspace || !Array.isArray(workspace.sessionIds) || !workspace.sessionIds.includes(sessionId)) throw new InputError('session_not_in_workspace', 400);
        const value = applyCommand(validateAggregate(current), { ...args, sessionId, op: 'link.set', expectedRevision: current.revision }, registry);
        snapshot(value);
        return value;
      }, { signal });
      return { revision: next.revision, linked: args.linked };
    }, signal),
    close() {
      if (!closing) {
        stopping = true;
        for (const controller of activeBodies) controller.abort();
        closing = tail.then(() => store.close());
      }
      return closing;
    },
    async fetch(request) {
      if (stopping || requests >= MAX_PENDING) {
        if (request.body) void request.body.cancel().catch(() => {});
        return response({ error: { code: 'unavailable' } }, 503);
      }
      requests++;
      const controller = new AbortController();
      const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(15000)]);
      activeBodies.add(controller);
      try {
        if (request.method === 'GET') return response(await service.read(signal));
        if (request.method === 'POST') return response(await service.mutate(await readBody(request, signal), signal));
        return response({ error: { code: 'method_not_allowed' } }, 405);
      } catch (error) {
        const storeCode = error?.name === 'StoreError' ? error.code : undefined;
        const known = error instanceof InputError || error instanceof core.BoardError || ['conflict', 'too_large'].includes(storeCode);
        const status = error instanceof InputError ? error.status : error instanceof core.BoardError ? (error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400) : storeCode === 'conflict' ? 409 : storeCode === 'too_large' ? 413 : signal.aborted ? (stopping ? 503 : 499) : 500;
        return response({ error: { code: known ? error.code.toLowerCase() : signal.aborted ? (stopping ? 'unavailable' : 'aborted') : 'internal' } }, status);
      } finally { activeBodies.delete(controller); requests--; }
    },
  };
  return service;
}
