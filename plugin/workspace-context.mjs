// Owner-only routes. The caller never supplies session ids or projection keys.
import { openWorkspaceDefaultStore } from './workspace-default-store.mjs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 256 && v === v.trim();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const id = value => { if (!text(value)) fail('invalid'); return value; };
const shape = (v, fields) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== [...fields].sort().join(',')) fail('invalid');
};
export function createWorkspaceContext({ store, defaults, registry, getTracker, getQuery }) {
  let active = 0, pendingBodies = 0, closed = false;
  const lifetime = new AbortController();
  const current = (wid, incarnation) => {
    const w = registry.get(wid);
    if (!w || !text(w.createdAt) || (incarnation !== undefined && incarnation !== w.createdAt) || !Array.isArray(w.sessionIds)) fail('workspace_changed');
    return w;
  };
  const local = (wid, bid, taskId) => {
    const a = store.read(), w = a.state.workspaces.find(x => x.id === wid);
    if (!w?.boardIds.includes(bid)) fail('unavailable');
    const b = a.state.boards.find(x => x.id === bid && !x.archived);
    if (!b || (taskId !== undefined && !b.tasks.some(x => x.id === taskId))) fail('unavailable');
    return { aggregate: a, board: b };
  };
  async function proof(wid, pointer, signal) {
    const w = current(wid, pointer.incarnation);
    if (pointer.provider === 'local') { local(wid, pointer.boardId); return { incarnation: w.createdAt, accountScope: null }; }
    const tracker = await getTracker();
    const result = await tracker.workspaceBoardScope(wid, pointer.boardId, signal);
    if (pointer.accountScope !== undefined && result.accountScope !== pointer.accountScope) fail('account_changed');
    current(wid, result.incarnation);
    return { incarnation: result.incarnation, accountScope: result.accountScope };
  }
  async function links(c, signal) {
    const w = current(c.workspaceId, c.incarnation);
    if (c.provider === 'local') {
      const { aggregate } = local(c.workspaceId, c.boardId, c.taskId);
      return { token: ['local', aggregate.revision], ids: [...new Set(aggregate.links.filter(l => l.boardId === c.boardId && l.taskId === c.taskId && w.sessionIds.includes(l.sessionId)).map(l => l.sessionId))] };
    }
    const tracker = await getTracker();
    const result = await tracker.workspaceTaskLinks({ workspaceId: c.workspaceId, boardId: c.boardId, issueKey: c.taskId, issueId: c.issueId }, signal);
    if (result.incarnation !== c.incarnation) fail('workspace_changed');
    if (result.incomplete) fail('incomplete');
    return { token: ['tracker', result.accountScope, result.settingsRevision, result.revision], ids: [...new Set(result.links.map(x => x.sessionId).filter(x => w.sessionIds.includes(x)))] };
  }
  function project(o) {
    const values = o.projections?.values;
    const result = { asOfSeq: o.cursor, goal: { state: 'unavailable' }, todos: { state: 'unavailable' } };
    if (!values) return result;
    if (Object.hasOwn(values, 'goal')) {
      if (values.goal === null) result.goal = { state: 'empty', value: null };
      else {
        const p = values.goal, g = p?.goal;
        if (!g || !text(g.id) || typeof g.objective !== 'string' || g.objective.length > 32768 || !['active', 'paused', 'blocked', 'complete'].includes(g.phase) || !Number.isSafeInteger(g.revision) || !Number.isSafeInteger(p.roundsStarted) || !Number.isSafeInteger(g.maxGoalRounds) || (g.blockedReason !== undefined && (!g.blockedReason || typeof g.blockedReason.code !== 'string' || g.blockedReason.code.length > 256 || typeof g.blockedReason.message !== 'string' || g.blockedReason.message.length > 32768))) fail('invalid_projection');
        result.goal = { state: 'ready', value: { id: g.id, revision: g.revision, objective: g.objective, phase: g.phase, maxGoalRounds: g.maxGoalRounds, roundsStarted: p.roundsStarted, ...(g.blockedReason === undefined ? {} : { blockedReason: { code: g.blockedReason.code, message: g.blockedReason.message } }) } };
      }
    }
    if (Object.hasOwn(values, 'todos')) {
      const todos = values.todos;
      if (todos === null) result.todos = { state: 'empty', value: null };
      else {
        if (!Array.isArray(todos) || todos.length > 500 || todos.some(t => typeof t?.content !== 'string' || t.content.length > 4096 || !['pending', 'in_progress', 'completed'].includes(t.status))) fail('invalid_projection');
        result.todos = { state: 'ready', value: todos.map(t => ({ content: t.content, status: t.status })) };
      }
    }
    return result;
  }
  async function command(c, callerSignal) {
    if (closed || active >= 8) fail('busy');
    active++;
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000), ...(callerSignal ? [callerSignal] : [])]);
    try {
      if (!c || typeof c !== 'object') fail('invalid');
      c = structuredClone(c);
      id(c.workspaceId); const w = current(c.workspaceId);
      if (c.op === 'default.read') {
        shape(c, ['op', 'workspaceId']);
        const r = defaults.read(c.workspaceId);
        if (!r.pointer) return { ...r, available: true };
        try { await proof(c.workspaceId, r.pointer, signal); signal.throwIfAborted(); if (!equal(defaults.read(c.workspaceId), r)) fail('conflict'); return { revision: r.revision, pointer: { provider: r.pointer.provider, boardId: r.pointer.boardId, incarnation: r.pointer.incarnation }, available: true }; }
        catch { return { revision: r.revision, pointer: null, available: false }; }
      }
      if (c.op === 'default.set') {
        shape(c, ['op', 'workspaceId', 'incarnation', 'expectedRevision', 'pointer']);
        current(c.workspaceId, c.incarnation);
        let pointer = null;
        if (c.pointer !== null) {
          shape(c.pointer, ['provider', 'boardId']); id(c.pointer.boardId);
          if (!['local', 'tracker'].includes(c.pointer.provider)) fail('invalid');
          pointer = { ...c.pointer, incarnation: c.incarnation };
          const authority = await proof(c.workspaceId, pointer, signal);
          pointer.accountScope = authority.accountScope;
        }
        signal.throwIfAborted(); current(c.workspaceId, c.incarnation);
        const r = defaults.set(c.workspaceId, c.expectedRevision, pointer);
        return { revision: r.revision, pointer: pointer && { provider: pointer.provider, boardId: pointer.boardId, incarnation: pointer.incarnation } };
      }
      if (c.op !== 'task.context') fail('invalid');
      shape(c, ['op', 'workspaceId', 'incarnation', 'provider', 'boardId', 'taskId', 'issueId']);
      if (!['local', 'tracker'].includes(c.provider)) fail('invalid');
      id(c.boardId); id(c.taskId); if (c.provider === 'tracker') id(c.issueId); else if (c.issueId !== null) fail('invalid');
      const before = await links(c, signal);
      if (before.ids.length > 32) fail('too_large');
      const query = getQuery();
      if (!query || typeof query.observeSession !== 'function') fail('projections_unavailable');
      const rows = new Array(before.ids.length); let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
        while (next < before.ids.length) {
          const i = next++, sessionId = before.ids[i]; let observation;
          try {
            signal.throwIfAborted(); current(c.workspaceId, c.incarnation);
            observation = await query.observeSession(sessionId, { projectionMode: 'all', signal });
            signal.throwIfAborted();
            rows[i] = { sessionId, state: 'ready', ...project(observation) };
          } catch { rows[i] = { sessionId, state: 'error' }; }
          finally { observation?.[Symbol.dispose](); }
        }
      }));
      signal.throwIfAborted();
      const after = await links(c, signal); current(c.workspaceId, c.incarnation);
      if (!equal(before, after)) fail('scope_changed');
      const result = { rows, incomplete: false };
      if (Buffer.byteLength(JSON.stringify(result)) > 256 * 1024) fail('too_large');
      return result;
    } finally { active--; }
  }
  return { command, async fetch(request) {
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    if (closed || pendingBodies >= 16) { void request.body?.cancel().catch(() => {}); return new Response(JSON.stringify({ error: { code: 'busy' } }), { status: 503, headers }); }
    pendingBodies++;
    const signal = AbortSignal.any([request.signal, lifetime.signal, AbortSignal.timeout(15000)]);
    let reader;
    const stop = () => { void reader?.cancel().catch(() => {}); };
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => { stop(); reject(Error('aborted')); };
      signal.addEventListener('abort', onAbort, { once: true });
    });
    // The abort race rejects promptly even if a supplied stream ignores cancel.
    const race = work => Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }), aborted]);
    try {
      if (request.method !== 'POST' || new URL(request.url).search || new URL(request.url).hash) fail('invalid');
      reader = request.body?.getReader(); if (!reader) fail('invalid');
      let bytes = 0; const chunks = [];
      while (true) { const { done, value } = await race(() => reader.read()); if (done) break; bytes += value.length; if (bytes > 4096) fail('too_large'); chunks.push(value); }
      const c = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return new Response(JSON.stringify(await race(() => command(c, signal))), { headers });
    } catch (e) {
      const safe = ['invalid', 'busy', 'conflict', 'workspace_changed', 'account_changed', 'scope_changed', 'too_large', 'projections_unavailable', 'unavailable', 'incomplete'].includes(e.code) ? e.code : 'unavailable';
      return new Response(JSON.stringify({ error: { code: safe } }), { status: safe === 'conflict' ? 409 : safe === 'invalid' ? 400 : 503, headers });
    } finally { signal.removeEventListener('abort', onAbort); stop(); pendingBodies--; }
  }, close() { closed = true; lifetime.abort(); } };
}

export async function registerWorkspaceContext(ctx, store, directory) {
  const profile = ctx.get('profileContext');
  if (!profile || typeof profile.name !== 'string') throw new Error('Profile unavailable');
  const suffix = createHash('sha256').update(profile.name).digest('hex').slice(0, 24);
  const defaults = openWorkspaceDefaultStore(path.join(directory, 'workspace-default-' + suffix + '.sqlite'));
  const service = createWorkspaceContext({ store, defaults, registry: ctx.workspaceRegistry,
    getTracker: async () => { const access = ctx.get('boardTrackerAccess'); if (!access) fail('unavailable'); return access.getService(); },
    getQuery: () => ctx.get('sessionQuery') });
  ctx.effect(() => () => { service.close(); defaults.close(); });
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/dsh-board.context', methods: ['POST'], requestBody: 'streaming', fetch: r => service.fetch(r) }));
}
