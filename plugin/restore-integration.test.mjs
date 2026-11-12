import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAccountNamespace } from './tracker-account.mjs';
import { openTrackerSettings } from './tracker-settings.mjs';
import { createTrackerService } from './tracker-service.mjs';
import { registerTrackerTools } from './tracker-tools.mjs';

// Independent process-lifecycle integration: a private temporary SQLite database
// and account key are really closed/reopened, but Tracker is entirely in-process.
// No live Tracker, server, credentials, HTTP client, or network is involved.
// Temporary data is deliberately retained (this test performs no deletions).
// Run separately: node --test plugin/restore-integration.test.mjs
const profileId = 'synthetic';
const workspaceId = 'ws', sid = 'synthetic-session', incarnation = 'incarnation-one';
const connection = { tokenRef: 'TOKEN', orgIdRef: 'ORG_ID', orgType: 'org' };
const signal = () => new AbortController().signal;
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-board-restore-'));
  const workspace = { id: workspaceId, createdAt: incarnation, sessionIds: [sid] };
  const registry = { current: workspace, archivedSessionIds: [],
    get(id) { return id === workspaceId ? this.current : undefined; },
    list() { return this.current ? [this.current] : []; },
  };
  const fake = {
    uid: '12345678901234567890', orgId: 'orgA', identity: 'credential-A',
    reachable: true, gate: null, lookups: [], lists: 0, sessions: 0,
    async openSession() {
      this.sessions++;
      // Snapshot exactly as a credential-bound Tracker session must do.
      const identity = this.identity, uid = this.uid, orgId = this.orgId, self = this;
      return { identity, uid, orgId,
        async listBoards() { self.lists++; return { boards: [{ id: '1', name: 'One' }, { id: '2', name: 'Two' }], complete: true, reason: null }; },
        async getBoardOverview(id) { return { board: { id, name: `Board ${id}` }, columns: [], issues: [], issuesComplete: false, issuesReason: 'explicit_keys_only' }; },
        async getBoardIdentity(id) {
          self.lookups.push(id);
          if (self.gate) { const gate = self.gate; gate.started.resolve(); await gate.release.promise; }
          if (!self.reachable) { const error = new Error('synthetic board unavailable'); error.name = 'TrackerError'; error.code = 'network_error'; throw error; }
          return { id, name: `Board ${id}` };
        },
      };
    },
  };
  let processState;
  const links = { read: () => ({ revision: 0, links: [] }), mutate() { throw Error('unexpected link mutation'); } };
  function open() {
    assert.equal(processState, undefined);
    const namespace = openAccountNamespace({ directory, profileId });
    const settings = openTrackerSettings({ directory, profileId });
    const service = createTrackerService({ settings, tracker: fake, workspaceRegistry: registry, links,
      resolveAccountScope: async ({ account }) => namespace.derive({ orgType: settings.read().settings.connection.orgType, orgId: account.orgId, principalId: account.uid }),
    });
    processState = { namespace, settings, service };
    return processState;
  }
  async function close() {
    if (!processState) return;
    const current = processState; processState = undefined;
    await current.service.close(); current.settings.close(); current.namespace.close();
  }
  t.after(close);
  return { directory, registry, fake, open, close, get process() { return processState; } };
}

async function seedLegacy(f) {
  const { settings } = f.open();
  assert.deepEqual(settings.compareAndSet(0, { connection, workspaces: { [workspaceId]: ['1', '2'] } }), { ok: true, revision: 1 });
}
async function ownerReselect(f) {
  const { service, settings, namespace } = f.process;
  const before = settings.read();
  const result = await service.command({ op: 'workspace.reselect', workspaceId, expectedRevision: before.revision, boardIds: ['1', '2'] });
  const after = settings.read();
  assert.equal(result.revision, before.revision + 1);
  assert.deepEqual(after.settings.boardAuthorizations[workspaceId], {
    accountScope: namespace.derive({ orgType: 'org', orgId: f.fake.orgId, principalId: f.fake.uid }),
    incarnation, boardIds: ['1', '2'],
  });
  return after;
}
const current = service => service.currentWorkspace({ sessionId: sid, signal: signal() });
const boards = service => service.toolScope({ workspaceId, sessionId: sid, signal: signal() }).selectedBoards();
const denied = fn => assert.rejects(async () => fn(), e => ['needs_reselect', 'board_not_selected', 'workspace_not_found', 'unavailable', 'aborted', 'conflict'].includes(e?.code));

// Exercise the actual registered tool facades as well as the service methods. The
// synthetic context captures definitions only; it never starts the DSH runtime.
function tools(service) {
  const definitions = new Map();
  const dispose = registerTrackerTools({ tools: { register(definition) { definitions.set(definition.name, definition); return () => definitions.delete(definition.name); } } }, { getService: async () => service });
  const exec = { agent: { id: sid, session: { id: sid } }, signal: signal(), callId: 'synthetic-call' };
  return { dispose, async call(name, args) { return JSON.parse((await definitions.get(name).execute(args, exec)).json); } };
}

test('owner reselect persists provenance; newly opened service tools restore without an owner GET', async t => {
  const f = fixture(t); await seedLegacy(f);
  const saved = await ownerReselect(f);
  assert.deepEqual(f.fake.lookups, ['1', '2']);
  await f.close();
  f.fake.identity = 'credential-after-restart'; // New volatile identity, same UID.
  const { service, settings } = f.open();
  assert.deepEqual(settings.read(), saved, 'SQLite reopens the exact prior state');
  const api = tools(service); t.after(api.dispose);
  assert.deepEqual(await api.call('tracker_current_workspace', {}), { workspaceId, boardIds: ['1', '2'] });
  assert.deepEqual(await api.call('tracker_list_boards', { workspaceId }), { boardIds: ['1', '2'] });
  assert.deepEqual(settings.read(), saved, 'normal restore must not rewrite settings or bump revision');
  assert.deepEqual(f.fake.lookups, ['1', '2', '1', '2']);
  assert.equal(f.fake.lists, 0, 'restoration must use exact board identities, not an owner board listing');
});

test('arbitrary tool scope independently restores and accepts same-principal credential rotation', async t => {
  const f = fixture(t); await seedLegacy(f); const saved = await ownerReselect(f); await f.close();
  f.fake.identity = 'credential-after-restart';
  const { service, settings } = f.open();
  assert.deepEqual(await boards(service), ['1', '2']);
  // Rotate while the service is live as well as across a process restart. A
  // previously held scope may fail closed; a fresh scope must reverify and work.
  f.fake.identity = 'rotated-credential';
  const rotated = await Promise.resolve().then(() => boards(service)).catch(error => {
    assert.equal(error.code, 'needs_reselect');
    return boards(service);
  });
  assert.deepEqual(rotated, ['1', '2']);
  assert.deepEqual(await current(service), { workspaceId, boardIds: ['1', '2'] });
  assert.deepEqual(settings.read(), saved);
  assert.deepEqual(f.fake.lookups, ['1', '2', '1', '2', '1', '2']);
});

test('concurrent tool calls restore without an owner GET', async t => {
  const f = fixture(t); await seedLegacy(f); const saved = await ownerReselect(f); await f.close();
  f.fake.identity = 'credential-after-restart';
  const { service, settings } = f.open();
  const gate = { started: deferred(), release: deferred() }; f.fake.gate = gate;
  t.after(() => gate.release.resolve());
  const first = current(service), second = Promise.resolve().then(() => boards(service));
  first.catch(() => {}); second.catch(() => {});
  await gate.started.promise;
  gate.release.resolve(); f.fake.gate = null;
  assert.deepEqual(await Promise.all([first, second]), [{ workspaceId, boardIds: ['1', '2'] }, ['1', '2']]);
  assert.ok(f.fake.lookups.slice(2).includes('1'));
  assert.ok(f.fake.lookups.slice(2).includes('2'));
  assert.deepEqual(settings.read(), saved);
});

test('different authenticated UID or organization never exposes the stored boards', async t => {
  for (const change of ['uid', 'orgId']) await t.test(change, async t => {
    const f = fixture(t); await seedLegacy(f); await ownerReselect(f); await f.close();
    f.fake[change] = change === 'uid' ? '98765432101234567890' : 'orgB';
    f.fake.identity = 'different-account';
    const { service } = f.open();
    await denied(() => current(service));
    await denied(() => boards(service));
    assert.equal(f.fake.lookups.length, 2, 'wrong principal must not reach exact board verification');
  });
});

test('workspace replacement never inherits prior incarnation authorization', async t => {
  const f = fixture(t); await seedLegacy(f); await ownerReselect(f); await f.close();
  f.registry.current = { id: workspaceId, createdAt: 'replacement', sessionIds: [sid] };
  let { service, settings } = f.open();
  await denied(() => current(service));
  await denied(() => boards(service));
  assert.equal(f.fake.lookups.length, 2);
  assert.equal(settings.read().settings.boardAuthorizations?.[workspaceId], undefined);
  await f.close();
  // Even an ABA replacement restoring the former timestamp cannot resurrect it.
  f.registry.current = { id: workspaceId, createdAt: incarnation, sessionIds: [sid] };
  ({ service } = f.open());
  await denied(() => current(service));
});

test('unreachable board fails gracefully, preserves proof, and retries successfully', async t => {
  const f = fixture(t); await seedLegacy(f); const saved = await ownerReselect(f); await f.close();
  f.fake.reachable = false;
  const { service, settings } = f.open();
  await assert.rejects(async () => current(service), e => ['network_error', 'unavailable'].includes(e.code));
  assert.deepEqual(settings.read(), saved);
  f.fake.reachable = true;
  assert.deepEqual(await boards(service), ['1', '2']);
  assert.deepEqual(settings.read(), saved);
});

test('observed A → B → A account change permanently invalidates old proof', async t => {
  const f = fixture(t); await seedLegacy(f); await ownerReselect(f); await f.close();
  f.fake.uid = '98765432101234567890'; f.fake.identity = 'credential-B';
  let { service, settings } = f.open();
  await denied(() => current(service));
  assert.equal(settings.read().settings.boardAuthorizations?.[workspaceId], undefined);
  const observed = await service.read();
  assert.deepEqual(observed.needsReselect, [workspaceId]);
  await f.close();
  f.fake.uid = '12345678901234567890'; f.fake.identity = 'credential-A-returned';
  ({ service } = f.open());
  await denied(() => current(service));
  await denied(() => boards(service));
});

test('legacy selection without provenance still requires explicit owner reselect', async t => {
  const f = fixture(t); await seedLegacy(f); await f.close();
  const { service, settings } = f.open();
  const before = settings.read();
  await assert.rejects(async () => current(service), e => e.code === 'needs_reselect');
  await assert.rejects(async () => boards(service), e => e.code === 'needs_reselect');
  assert.deepEqual((await service.read()).needsReselect, [workspaceId]);
  assert.deepEqual(settings.read(), before);
  assert.deepEqual(f.fake.lookups, []);
});

test('concurrent local revocation prevents an in-flight restoration from binding', async t => {
  const f = fixture(t); await seedLegacy(f); await ownerReselect(f);
  await f.process.service.command({ op: 'configuration.setUnattendedIssueCreation', workspaceId, expectedRevision: f.process.settings.read().revision, enabled: true });
  await f.close();
  const { service, settings } = f.open();
  assert.ok(settings.read().settings.unattendedIssueCreation?.[workspaceId]);
  const gate = { started: deferred(), release: deferred() }; f.fake.gate = gate;
  t.after(() => gate.release.resolve());
  const pending = Promise.resolve().then(() => current(service));
  pending.catch(() => {});
  await gate.started.promise;
  const before = settings.read();
  assert.deepEqual(await service.command({ op: 'configuration.setUnattendedIssueCreation', workspaceId, expectedRevision: before.revision, enabled: false }), { revision: before.revision + 1, workspaceId, enabled: false });
  assert.equal(settings.read().settings.unattendedIssueCreation?.[workspaceId], undefined);
  gate.release.resolve(); f.fake.gate = null;
  await denied(() => pending);
  assert.deepEqual(await boards(service), ['1', '2']);
});

test('closing during restoration prevents stale in-flight binding', async t => {
  const f = fixture(t); await seedLegacy(f); const saved = await ownerReselect(f); await f.close();
  const { service } = f.open();
  const gate = { started: deferred(), release: deferred() }; f.fake.gate = gate;
  t.after(() => gate.release.resolve());
  const pending = Promise.resolve().then(() => current(service));
  pending.catch(() => {});
  await gate.started.promise;
  const closing = f.close();
  await denied(() => pending);
  gate.release.resolve(); f.fake.gate = null;
  await closing;
  await assert.rejects(async () => current(service));
  const reopened = f.open();
  assert.deepEqual(await boards(reopened.service), ['1', '2']);
  assert.deepEqual(reopened.settings.read(), saved);
});

test('revocation of selected boards during restoration cannot leak a stale selection', async t => {
  const f = fixture(t); await seedLegacy(f); await ownerReselect(f); await f.close();
  const { service, settings } = f.open();
  const gate = { started: deferred(), release: deferred() }; f.fake.gate = gate;
  t.after(() => gate.release.resolve());
  const pending = Promise.resolve().then(() => boards(service));
  pending.catch(() => {});
  await gate.started.promise;
  const before = settings.read();
  assert.deepEqual(await service.command({ op: 'workspace.select', workspaceId, expectedRevision: before.revision, boardIds: [] }), { revision: before.revision + 1, workspaceId, boardIds: [] });
  gate.release.resolve(); f.fake.gate = null;
  await denied(() => pending);
  await denied(() => current(service));
  assert.deepEqual(settings.read().settings.workspaces[workspaceId], []);
});
