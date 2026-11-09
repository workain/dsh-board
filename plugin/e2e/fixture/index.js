import { mkdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export const name = 'board-workspace-fixture';
export const inject = ['connection', 'sessions', 'workspaceRegistry', 'sessionPersistence', 'sessionQuery', 'agents'];
export async function apply(ctx, config) {
  const root = resolve(config.root);
  if (await realpath(root) !== root || !root.endsWith('/synthetic-catalog')) throw Error('Invalid fixture root');
  let archivedFixtureSession; const seeded = [];
  for (const name of ['Alpha', 'Beta', 'Unassigned']) {
    const cwd = join(root, name); await mkdir(cwd);
    const workspace = await ctx.workspaceRegistry.create(cwd, name);
    for (const label of name === 'Alpha' ? ['One', 'Two', 'Archived'] : ['Other']) {
      const session = ctx.sessions.prepare(randomUUID(), { meta: { cwd } });
      seeded.push(session.id);
      const detach = ctx.sessions.enter(session); ctx.sessions.announce(session);
      const now = Date.now();
      const events = [session.append('session/title', { title: name + '/' + label, messageSeqs: [], source: { kind: 'user' } }),
        session.append('goal/change', { kind: 'goal/change', version: 1, operation: 'create', goal: { id: randomUUID(), revision: 1, objective: 'Goal ' + label, phase: 'active', maxGoalRounds: 5 }, roundsStarted: 0, createdAt: now, updatedAt: now }),
        session.append('turn/start', { turn: 1 }),
        session.append('todo/write', { todos: [{ content: 'Todo ' + label, status: 'pending' }] }),
        session.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } })];
      const handle = await ctx.sessionPersistence.create(session.header);
      try { await handle.append(events); await handle.flush(); } finally { await handle.close(); }
      detach(); await workspace.attachSession(session.id);
      if (label === 'Archived') archivedFixtureSession = session.id;
    }
  }
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/board-workspace-fixture.archive', methods: ['POST'], requestBody: 'buffered', async fetch() {
    await ctx.workspaceRegistry.archiveSession(archivedFixtureSession); return new Response('{}', { headers: { 'content-type': 'application/json' } });
  } }));
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/board-workspace-fixture', methods: ['GET'], requestBody: 'buffered', async fetch() {
    const rows = [];
    for (const w of ctx.workspaceRegistry.list()) for (const id of w.sessionIds) {
      const snapshot = await ctx.sessionQuery.readSession(id);
      rows.push({ id, liveAgent: !!ctx.agents.get(id), events: snapshot.events.length, prompts: snapshot.events.filter(e => e.type === 'user/message').length, headerHash: createHash('sha256').update(JSON.stringify(snapshot.session)).digest('hex'), eventHash: createHash('sha256').update(JSON.stringify(snapshot.events)).digest('hex') });
    }
    const memberships = ctx.workspaceRegistry.list().map(w => ({ id: w.id, createdAt: w.createdAt, sessionIds: [...w.sessionIds].sort() })).sort((a,b) => a.id.localeCompare(b.id));
    return new Response(JSON.stringify({ rows: rows.sort((a,b) => a.id.localeCompare(b.id)), seeded: [...seeded].sort(), memberships, archived: [...ctx.workspaceRegistry.archivedSessionIds].sort() }), { headers: { 'content-type': 'application/json' } });
  } }));
}
