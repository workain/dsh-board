import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackerService } from './tracker-service.mjs';

test('task context trusted proof uses exact issue links and zero full-board searches for 20 cards', async () => {
  let state = { revision: 0, settings: { connection: null, workspaces: {} } }, account = 'a'.repeat(64);
  let searches = 0, issueReads = 0, boardReads = 0;
  const registry = new Map([['w', { createdAt: 'first', sessionIds: ['s'] }]]);
  registry.archivedSessionIds = [];
  const links = { read: () => ({ revision: 0, links: [{ issueId: 'immutable', sessionId: 's' }] }), mutate() { throw Error('no write'); } };
  const tracker = { async openSession() { return {
    identity: account, async listBoards() { return { boards: [{ id: '1', name: 'Board' }], complete: true, reason: null }; },
    async getBoardIdentity(id) { boardReads++; return { id, name: 'Board' }; },
    async getBoardOverview() { searches++; throw Error('No full board search for context'); },
    async getIssue(key) { issueReads++; return { key, id: 'immutable', boards: [{ id: '1' }] }; },
  }; } };
  const service = createTrackerService({ settings: { read: () => structuredClone(state), compareAndSet(revision, value) {
    if (state.revision !== revision) return { ok: false, revision: state.revision };
    state = { revision: revision + 1, settings: structuredClone(value) }; return { ok: true, revision: state.revision };
  } }, tracker, links, workspaceRegistry: registry, resolveAccountScope: async () => account });
  try {
    await service.command({ op: 'configuration.configure', expectedRevision: 0, orgType: 'org' });
    await service.command({ op: 'boards.list' });
    await service.command({ op: 'workspace.select', expectedRevision: 1, workspaceId: 'w', boardIds: ['1'] });
    const proof = await service.workspaceBoardScope('w', '1');
    assert.equal(proof.accountScope, account); assert.equal(proof.incarnation, 'first'); assert.ok(boardReads >= 1);
    const beforeBoards = boardReads;
    for (let i = 0; i < 20; i++) for (let pass = 0; pass < 2; pass++) {
      const result = await service.workspaceTaskLinks({ workspaceId: 'w', boardId: '1', issueKey: 'Q-' + (i + 1), issueId: 'immutable' });
      assert.equal(result.accountScope, account); assert.equal(result.incarnation, 'first'); assert.equal(result.incomplete, false); assert.equal(result.links[0].sessionId, 's');
    }
    assert.equal(searches, 0); assert.equal(boardReads, beforeBoards); assert.equal(issueReads, 80);
    account = 'b'.repeat(64);
    await assert.rejects(service.workspaceTaskLinks({ workspaceId: 'w', boardId: '1', issueKey: 'Q-1', issueId: 'immutable' }));
  } finally { await service.close(); }
});
