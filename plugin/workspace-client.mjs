// Standalone helpers are embedded by scripts/build.mjs, never imported by the browser.
export function createWorkspaceBoardSource({ valid, canNavigate, selectPanel }) {
  let value = null;
  const listeners = new Set();
  const request = (workspaceId, configure) => {
    const incarnation = valid(workspaceId);
    if (!incarnation || !canNavigate()) return false;
    value = { workspaceId, incarnation, configure, token: {} };
    for (const fn of listeners) fn();
    selectPanel(); return true;
  };
  return { service: Object.freeze({ open: id => request(id, false), configure: id => request(id, true) }),
    getSnapshot: () => value, ack(token) { if (value?.token === token) { value = null; for (const fn of listeners) fn(); } }, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    close() { value = null; listeners.clear(); } };
}
export function createWorkspaceBoardViews(React) {
  const h = React.createElement;
  let running = 0;
  const waiting = [];
  async function read(command, signal) {
    if (waiting.length >= 128) throw Error('busy');
    while (running >= 4) await new Promise((resolve, reject) => {
      const entry = { resolve: () => { signal.removeEventListener('abort', abort); resolve(); } };
      const abort = () => { const i = waiting.indexOf(entry); if (i >= 0) waiting.splice(i, 1); reject(Error('aborted')); };
      waiting.push(entry); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    });
    running++;
    try {
      signal.throwIfAborted();
      const response = await fetch(new URL('api/dsh-board.context', document.baseURI), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command), signal, cache: 'no-store' });
      if (!response.ok) throw Error('unavailable');
      const result = await response.json(); if (!result || result.error) throw Error('unavailable'); return result;
    } finally { running--; const next = waiting.shift(); if (next) next.resolve(); }
  }
  function Context({ scope, sources, full = false, t }) {
    const ws = React.useSyncExternalStore(listener => sources.workspaces.subscribe(listener), () => sources.workspaces.getSnapshot());
    const connection = React.useSyncExternalStore(listener => sources.connection.subscribe(listener), () => sources.connection.getSnapshot());
    const [state, setState] = React.useState(null);
    const [refresh, setRefresh] = React.useState(0);
    const element = React.useRef(null);
    const [visible, setVisible] = React.useState(typeof IntersectionObserver === 'undefined');
    React.useEffect(() => {
      if (typeof IntersectionObserver === 'undefined' || !element.current) return;
      const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)));
      observer.observe(element.current); return () => observer.disconnect();
    }, [scope.workspaceId, scope.incarnation, ws?.phase, ws?.state]);
    React.useEffect(() => { const timer = setInterval(() => { if (visible && document.visibilityState !== 'hidden') setRefresh(x => x + 1); }, 60000); return () => clearInterval(timer); }, [visible]);
    const w = ws?.phase === 'ready' && ws.state !== 'error' && ws.items?.find(x => x.workspaceId === scope.workspaceId);
    const stamp = JSON.stringify([scope, connection?.id, w?.createdAt, w?.sessionIds, refresh, visible]);
    React.useEffect(() => {
      if (!visible || !w || w.createdAt !== scope.incarnation || connection?.id === undefined) return;
      const abort = new AbortController(); let alive = true;
      const visibility = () => { if (document.visibilityState === 'hidden') { abort.abort(); setState(null); } else setRefresh(x => x + 1); };
      document.addEventListener('visibilitychange', visibility);
      if (document.visibilityState !== 'hidden') read({ op: 'task.context', workspaceId: scope.workspaceId, incarnation: scope.incarnation, provider: scope.provider, boardId: scope.boardId, taskId: scope.taskId, issueId: scope.issueId }, abort.signal)
        .then(result => { if (alive && !abort.signal.aborted && Array.isArray(result.rows)) setState({ stamp, result }); }, () => { if (alive && !abort.signal.aborted) setState({ stamp, error: true }); });
      return () => { alive = false; abort.abort(); document.removeEventListener('visibilitychange', visibility); };
    }, [stamp]);
    if (!w || w.createdAt !== scope.incarnation || connection?.id === undefined) return null;
    const data = state?.stamp === stamp ? state : null;
    const status = name => t ? t(name) : name;
    const value = (kind, field) => {
      if (!field || field.state === 'unavailable') return h('span', null, status('contextUnavailable'));
      if (field.state === 'empty') return h('span', null, status(kind === 'goal' ? 'contextNoGoal' : 'contextNoTodoWrite'));
      if (field.state !== 'ready') return h('span', null, status('contextUnavailable'));
      if (kind === 'goal') return h('div', null, h('strong', null, field.value.objective), ' — ', field.value.phase,
        full && h('div', null, field.value.roundsStarted, '/', field.value.maxGoalRounds, field.value.blockedReason ? ' · ' + field.value.blockedReason.code + ': ' + field.value.blockedReason.message : ''));
      if (!field.value.length) return h('span', null, status('contextEmptyTodos'));
      return h('ul', null, field.value.slice(0, full ? field.value.length : 3).map((todo, i) => h('li', { key: i }, todo.status === 'completed' ? '● ' : todo.status === 'in_progress' ? '◐ ' : '○ ', todo.content)),
        !full && field.value.length > 3 && h('li', null, '+', field.value.length - 3));
    };
    return h('section', { ref: element, className: 'dsh-board-task-context', 'aria-label': status('contextTitle') },
      h('h4', null, status('contextTitle')),
      !data ? h('p', { role: 'status' }, status('contextLoading')) : data.error ? h('p', { role: 'status' }, status('contextUnavailable')) : data.result.rows.length === 0 ? h('p', null, status('contextNoSessions')) : data.result.rows.map(row => {
        if (!w.sessionIds.includes(row.sessionId)) return null;
        return h('div', { key: row.sessionId, className: 'dsh-board-context-source' }, h('strong', null, row.sessionId), row.state !== 'ready' ? h('p', null, status('contextUnavailable')) : h(React.Fragment, null,
          h('div', null, status('contextGoal'), ': ', value('goal', row.goal)), h('div', null, status('contextTodos'), ': ', value('todos', row.todos))));
      }),
      full && h('button', { type: 'button', onClick: () => setRefresh(x => x + 1) }, status('refresh')));
  }
  function Chooser({ workspace, boards, trackerBoards, close, t, sources }) {
    const connection = React.useSyncExternalStore(listener => sources.connection.subscribe(listener), () => sources.connection.getSnapshot());
    const workspaces = React.useSyncExternalStore(listener => sources.workspaces.subscribe(listener), () => sources.workspaces.getSnapshot());
    const mounted = React.useRef(true);
    const originalConnection = React.useRef(connection?.id);
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const [state, setState] = React.useState({ loading: true });
    const [selection, select] = React.useState('');
    const current = () => mounted.current && sources.connection.getSnapshot()?.id === originalConnection.current && sources.workspaces.getSnapshot().phase === 'ready' && sources.workspaces.getSnapshot().state !== 'error' && sources.workspaces.getSnapshot().items?.find(x => x.workspaceId === workspace.workspaceId)?.createdAt === workspace.createdAt;
    React.useEffect(() => {
      const abort = new AbortController(); let alive = true;
      read({ op: 'default.read', workspaceId: workspace.workspaceId }, abort.signal).then(r => {
        if (alive && current()) { setState({ ...r, loading: false }); select(r.available === false ? '__unavailable__' : r.pointer ? JSON.stringify([r.pointer.provider, r.pointer.boardId]) : ''); }
      }, () => { if (alive) setState({ error: true }); });
      return () => { alive = false; abort.abort(); };
    }, [workspace.workspaceId, workspace.createdAt]);
    const choices = [...boards.map(b => ({ ...b, provider: 'local' })), ...trackerBoards.map(b => ({ ...b, provider: 'tracker' }))];
    async function save() {
      if (selection === '__unavailable__' || state.pending || state.unknown || state.error || !Number.isSafeInteger(state.revision) || !current()) return;
      const original = state;
      const entry = choices.find(b => JSON.stringify([b.provider, b.id]) === selection);
      if (selection && !entry) return;
      setState({ ...state, pending: true });
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
      try {
        const r = await read({ op: 'default.set', workspaceId: workspace.workspaceId, incarnation: workspace.createdAt, expectedRevision: original.revision, pointer: entry ? { provider: entry.provider, boardId: entry.id } : null }, abort.signal);
        if (!current() || r.revision !== original.revision + 1) throw Error('unknown');
        setState({ ...r, loading: false }); close();
      } catch { if (current()) setState({ ...original, unknown: true }); }
      finally { clearTimeout(timer); }
    }
    if (!current() || connection?.id === undefined || workspaces.phase !== 'ready') return null;
    return h('section', { role: 'dialog', 'aria-label': t('defaultBoard'), className: 'dsh-board-default-dialog' }, h('h2', null, t('defaultBoard'), ' — ', workspace.title),
      h('p', null, t('defaultWorkspaceOnly')),
      state.loading ? h('p', null, t('contextLoading')) : state.error || state.unknown ? h('p', { role: 'alert' }, t(state.unknown ? 'defaultUnknown' : 'contextUnavailable')) : h('label', null, t('board'), h('select', { value: selection, disabled: state.pending, onChange: e => select(e.target.value) }, state.available === false && h('option', { value: '__unavailable__', disabled: true }, t('defaultUnavailable')), h('option', { value: '' }, t('defaultNone')), choices.map(b => h('option', { key: JSON.stringify([b.provider, b.id]), value: JSON.stringify([b.provider, b.id]) }, b.name + ' (' + b.provider + ')')))),
      h('button', { type: 'button', disabled: selection === '__unavailable__' || state.loading || state.pending || state.unknown || state.error, onClick: save }, t('save')),
      h('button', { type: 'button', disabled: state.pending, onClick: close }, t('close')));
  }
  return { Context, Chooser, read };
}
