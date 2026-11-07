import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerTrackerTools } from './tracker-tools.mjs';
import { createTrackerService } from './tracker-service.mjs';

// Run in an isolated test process, never against the live DSH server or Tracker:
// DSH_ROOT=/path/to/deepseek-harness node --test plugin/full-access-integration.test.mjs
// Missing installations skip; broken or incompatible installed modules fail.
const root = process.env.DSH_ROOT || join(homedir(), '.local/share/deepseek-harness');
const modules = ['cordis', 'dsh-agent', 'dsh-tools'].map(name => join(root, 'node_modules', '@deepseek-ai', name, 'lib/index.js'));
let skipReason;
try { await Promise.all(modules.map(path => access(path))); }
catch (error) {
  if (error.code === 'ENOENT') skipReason = `Installed DSH runtime unavailable under ${root}`;
  else throw error;
}
let Context, AgentRegistry, ToolRuntime, TOOL_RUNTIME_SCHEDULER;
if (!skipReason) {
  [{ Context }, { AgentRegistry }, { ToolRuntime, TOOL_RUNTIME_SCHEDULER }] = await Promise.all(modules.map(path => import(pathToFileURL(path).href)));
}

async function fixture(mode = 'native') {
  const ctx = new Context();
  ctx.systemPrompt = { tools() {}, section() {}, getSectionOrder() { return 0; } };
  new AgentRegistry(ctx);
  new ToolRuntime(ctx, { mode });
  let approvals = 0;
  ctx.approval = { config: { policy: 'never' }, overrideOf() {}, request() { approvals++; throw Error('unexpected approval'); } };
  ctx.provide('workingDirectory', { async ensure() { return '/'; } });

  const events = [];
  const agent = id => ({ id, status: 'running', session: { id, append: (type, data) => events.push({ type, data }) }, ctx });
  const rootAgent = agent('root-session'), child = agent('child-session');
  const detachRoot = ctx.agents.enter(rootAgent, undefined);
  const detachChild = ctx.agents.enter(child, rootAgent);
  assert.deepEqual(ctx.agents.roots(), [rootAgent]);

  let state = { revision: 0, settings: { connection: null, workspaces: {} } };
  const settings = {
    read: () => structuredClone(state),
    compareAndSet(revision, value) {
      if (revision !== state.revision) return { ok: false, revision: state.revision };
      state = { revision: revision + 1, settings: structuredClone(value) };
      return { ok: true, revision: state.revision };
    },
  };
  const workspace = { id: 'w', createdAt: 'incarnation', sessionIds: [rootAgent.id, child.id] };
  const workspaceRegistry = { get: id => id === 'w' ? workspace : undefined, list: () => [workspace], archivedSessionIds: [] };
  const writes = [], initiators = [];
  // Pure in-memory Tracker: this fixture has no HTTP client or credentials.
  const tracker = { async openSession() {
    const capabilities = new WeakSet();
    return {
      identity: 'synthetic-account',
      async listBoards() { return { boards: [{ id: '1', name: 'Board' }], complete: true, reason: null }; },
      async getBoardOverview() { return {}; },
      async getBoardCreationQueue() {
        const queue = Object.freeze({ id: '7', key: 'ABC', display: 'Queue' });
        capabilities.add(queue); return queue;
      },
      async createIssue({ queue, summary }) {
        assert.ok(capabilities.has(queue));
        initiators.push(ctx.agents.currentInitiator());
        writes.push(summary);
        return { id: 'issue-2', key: 'ABC-2', version: 1 };
      },
    };
  } };
  const links = { read: () => ({ revision: 0, links: [] }), mutate() { throw Error('unused'); } };
  const service = createTrackerService({ settings, tracker, workspaceRegistry, links, resolveAccountScope: async () => 'a'.repeat(64) });
  await service.command({ op: 'configuration.configure', expectedRevision: 0, orgType: 'org' });
  await service.command({ op: 'boards.list' });
  await service.command({ op: 'workspace.select', expectedRevision: 1, workspaceId: 'w', boardIds: ['1'] });
  await service.command({ op: 'configuration.setUnattendedIssueCreation', expectedRevision: 2, workspaceId: 'w', enabled: true });
  const disposeTools = registerTrackerTools(ctx, { getService: async () => service });

  // The real PTC transport and its nested scheduler run against a deterministic
  // in-process interpreter stub; no code from the test is evaluated and no subprocess/network is used.
  if (mode === 'ptc') ctx.provide('ptcRuntime', {
    language: 'typescript', programFormat: 'function-body',
    resolve(request) { return request; },
    async run(spec) {
      assert.equal(spec.program, 'synthetic tracker call');
      const binding = spec.bindings.find(item => item.global === 'tools');
      return { logs: [], value: await binding.functions.tracker_create_issue({ workspaceId: 'w', boardId: '1', summary: 'PTC synthetic' }) };
    },
    async release() {},
  });
  return { ctx, rootAgent, child, service, writes, initiators, events, get approvals() { return approvals; },
    async close() { disposeTools(); detachChild(); detachRoot(); await service.close(); } };
}

async function scheduled(ctx, agent, name, args, withInitiator = true) {
  const exec = { agent, name, callId: 'synthetic-call', arguments: args, signal: new AbortController().signal };
  const run = async () => {
    const scheduler = ctx.tools[TOOL_RUNTIME_SCHEDULER];
    const prepared = await scheduler.prepare(exec);
    if (prepared.kind !== 'dispatch') return prepared.kind === 'post-result' ? scheduler.finalize(prepared.exec, prepared.result) : scheduler.finish(prepared.exec, prepared.result);
    const outcome = await scheduler.dispatch(prepared.exec);
    return outcome.kind === 'post-result' ? scheduler.finalize(prepared.exec, outcome.result) : scheduler.finish(prepared.exec, outcome.result);
  };
  return withInitiator ? ctx.agents.withInitiator(agent, run) : run();
}

const args = { workspaceId: 'w', boardId: '1', summary: 'Native synthetic' };
test('installed scheduler preserves live-root initiator through real Tracker service under policy never', { skip: skipReason || false }, async () => {
  const f = await fixture();
  try {
    const missing = await scheduled(f.ctx, f.rootAgent, 'tracker_create_issue', args, false);
    assert.equal(missing.isError, true);
    assert.match(missing.error.message, /approval_policy_never/);
    const child = await scheduled(f.ctx, f.child, 'tracker_create_issue', args);
    assert.equal(child.isError, true);
    assert.match(child.error.message, /approval_policy_never/);
    assert.deepEqual(f.writes, []);

    const success = await scheduled(f.ctx, f.rootAgent, 'tracker_create_issue', args);
    assert.equal(success.isError, false, JSON.stringify(success));
    assert.deepEqual(JSON.parse(success.value.json), { id: 'issue-2', key: 'ABC-2', version: 1, mode: 'unattended' });
    assert.deepEqual(f.writes, ['Native synthetic']);
    assert.deepEqual(f.initiators, [f.rootAgent]);
    assert.equal(f.approvals, 0);
  } finally { await f.close(); }
});

test('installed PTC transport nested dispatch retains initiator for synthetic root, rejects child', { skip: skipReason || false }, async () => {
  const f = await fixture('ptc');
  try {
    const ptcArgs = { code: 'synthetic tracker call', description: 'Synthetic Tracker call' };
    const denied = await scheduled(f.ctx, f.child, 'run_code', ptcArgs);
    assert.equal(denied.isError, true);
    assert.match(denied.error.message, /approval_policy_never/);
    assert.deepEqual(f.writes, []);
    const success = await scheduled(f.ctx, f.rootAgent, 'run_code', ptcArgs);
    assert.equal(success.isError, false, JSON.stringify(success));
    assert.deepEqual(JSON.parse(success.value.result.json), { id: 'issue-2', key: 'ABC-2', version: 1, mode: 'unattended' });
    assert.deepEqual(f.writes, ['PTC synthetic']);
    assert.deepEqual(f.initiators, [f.rootAgent]);
    assert.ok(f.events.some(event => event.type === 'tool/ptc-dispatch' && event.data.name === 'tracker_create_issue'));
    assert.equal(f.approvals, 0);
  } finally { await f.close(); }
});
