window.__ModuleLoader__.load({ id: 'board-workspace-fixture', factory() { return {
  inject: ['workspaces', 'sessions', 'layout', 'workspaceBoard'],
  apply(ctx) {
    const fixture = { snapshots: () => ({ workspaces: ctx.workspaces.list.getSnapshot(), sessions: ctx.sessions.list.getSnapshot() }),
      open: id => ctx.get('workspaceBoard').open(id), configure: id => ctx.get('workspaceBoard').configure(id) };
    window.__boardFixture = fixture;
    ctx.effect(() => () => { if (window.__boardFixture === fixture) delete window.__boardFixture; });
  },
}; } });
