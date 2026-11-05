import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';

// Exercise the shipped module through its loader, commands, slots and event handlers. All
// transport, React and browser APIs are in-memory; no server or profile is used.
const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const base = (revision = 4) => ({ revision, boards: [{ id: 'b', workspaceId: 'w', name: 'Board', statuses: [{ id: 's', name: 'Open', position: 0 }], tasks: [{ id: 't', title: 'Existing', description: 'original', statusId: 's' }] }], links: [] });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const source = (initial) => { let snapshot = initial; const listeners = new Set(); return { getSnapshot: () => snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, set(value) { snapshot = value; listeners.forEach(fn => fn()); } }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness(sessionFixture, initialCommands = []) {
  const requests = [], events = new Map(), confirms = [], commands = new Map(initialCommands.map(command => [command.name, command])), pluginEffects = [], slotNames = [];
  let registration, slot, active = false, tree, effects = [], hooks = [], cursor = 0, needsRender = false;
  let lastLocalSnapshot;
  const panels = [], openedSessions = [], openedTabs = [];
  let currentUrl = new URL(sessionFixture?.url || 'http://localhost/app/');
  let navigation = new AbortController();
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], v => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; needsRender = true; }]; },
    useRef(initial) { const i = cursor++; return hooks[i] ||= { current: initial }; },
    useMemo(fn) { cursor++; return fn(); },
    useSyncExternalStore(_subscribe, get) { cursor++; return get(); },
    useEffect(fn, deps) {
      const i = cursor++, old = hooks[i];
      if (!old || !deps || deps.some((v, n) => !Object.is(v, old.deps[n]))) effects.push(() => { old?.cleanup?.(); hooks[i] = { deps, cleanup: fn() }; });
    },
  };
  const timers = new Set(), timeouts = new Set(), documentEvents = new Map();
  const document = { baseURI: sessionFixture?.baseURI || currentUrl.href, visibilityState: 'visible', activeElement: null, addEventListener(type, fn) { documentEvents.set(type, fn); }, removeEventListener(type, fn) { if (documentEvents.get(type) === fn) documentEvents.delete(type); } };
  const window = {
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
    setTimeout(fn) { timeouts.add(fn); return fn; }, clearTimeout(fn) { timeouts.delete(fn); },
    __ModuleLoader__: { load(value) { registration = value; } },
    addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener(type, fn) { if (events.get(type) === fn) events.delete(type); },
    confirm(message) { confirms.push(message); return window.confirmResult; },
    confirmResult: true,
    get location() { return currentUrl; },
    history: { state: null, replaceState(_state, _title, value) { currentUrl = new URL(value, currentUrl); } },
    open(...args) { openedTabs.push(args); },
  };
  const fetch = (path, options) => {
    if (path === 'api/dsh-board.tracker' && options.method === 'GET' && !sessionFixture?.manualTracker) return Promise.resolve(response({ revision: 0, configured: false, orgType: null, workspaces: {}, needsReselect: [] }));
    const d = deferred(); requests.push({ path, options, ...d }); return d.promise;
  };
  vm.runInNewContext(client, { window, document, fetch, TextEncoder, URL }, { filename: 'client.js' });
  const plugin = registration.factory(name => { assert.equal(name, 'react'); return React; });
  const ws = source({ phase: sessionFixture?.wsPhase || 'ready', state: sessionFixture?.wsState || 'ready', items: (sessionFixture?.workspaces || [{ workspaceId: 'w', title: 'Workspace', sessionIds: sessionFixture?.ids || [] }]).map(item => ({ createdAt: '2026-01-01T00:00:00Z', ...item })), archivedSessionIds: sessionFixture?.archived || [] });
  const sessions = source({ phase: sessionFixture?.sessionsPhase || 'ready', ids: sessionFixture?.ids || [], byId: sessionFixture?.byId || {} });
  const generation = source(sessionFixture?.noConnection ? undefined : { id: 1, host: { home: '/' } });
  const panelInfo = source({ activePanelId: Object.hasOwn(sessionFixture || {}, 'activePanelId') ? sessionFixture.activePanelId : 'dsh-board' });
  const ctx = {
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') pluginEffects.push(dispose); }, locale: { register() {}, bind: () => key => key },
    slots: { inject(_name, fn) { fn(); }, register(spec, component) { slotNames.push(spec.name); if (spec.name === 'main') slot = { spec, component }; } },
    commandUi: { register(command) {
      if (commands.has(command.name)) throw new Error(`ui-commands: duplicate contribution for /${command.name}`);
      commands.set(command.name, command);
      return () => { if (commands.get(command.name) === command) commands.delete(command.name); };
    } },
    inputTriggers: { registerSource() { return () => {}; } },
    sidebarRight: { mounted: source(null), openTab() {} }, sidebarRightTabs: { register() { return () => {}; } },
    connection: { generation }, workspaces: { list: ws }, sessions: { list: sessions }, uiWorkspace: { openSession(id) { openedSessions.push(id); } }, layout: { panelInfo, beginNavigation() { navigation.abort(); navigation = new AbortController(); return navigation.signal; }, selectPanel(id) { navigation.abort(); panels.push(id); panelInfo.set({ activePanelId: id }); } },
  };
  plugin.apply(ctx);
  const props = { t: key => key, ...slot.spec.inject() };
  function render() {
    assert.ok(active, 'page must be mounted');
    do {
      needsRender = false; cursor = 0; effects = []; tree = slot.component(props);
      if (sessionFixture?.domRefs) {
        function attach(node) {
          if (!node || typeof node !== 'object') return;
          if (node.props?.ref) node.props.ref.current = { isConnected: true, focus() { document.activeElement = { type: node.type, props: node.props }; } };
          node.children?.forEach(attach);
        }
        attach(tree);
      }
      const pending = effects; effects = []; pending.forEach(fn => fn());
    } while (needsRender);
    return tree;
  }
  function nodes(type) {
    render(); const result = [];
    function walk(node) { if (!node || typeof node !== 'object') return; if (node.type === type) result.push(node); node.children?.forEach(walk); }
    walk(tree); return result;
  }
  function text(node) { return node.children.map(child => typeof child === 'object' && child ? text(child) : String(child ?? '')).join(''); }
  function button(label) { const found = nodes('button').filter(n => text(n) === label || n.props['aria-label'] === label); assert.equal(found.length, 1, `button ${label}`); return found[0]; }
  function click(label) { const n = button(label); assert.ok(!n.props.disabled, `${label} is disabled`); n.props.onClick(); }
  function change(node, value) { node.props.onChange({ target: { value } }); }
  function mount() { active = true; hooks = []; render(); }
  function unmount() { hooks.forEach(h => h?.cleanup?.()); hooks = []; active = false; }
  async function resolve(index, value, status = 200) {
    assert.ok(requests[index], `request ${index} exists`);
    if (requests[index].path === 'api/dsh-board' && requests[index].options.method === 'GET' && status === 200) lastLocalSnapshot = value;
    requests[index].resolve(response(value, status)); await settle();
  }
  async function resolveSupplementalLocal(index) {
    const request = requests[index];
    assert.ok(request, `supplemental local request ${index} exists`);
    assert.equal(request.path, 'api/dsh-board'); assert.equal(request.options.method, 'GET');
    assert.ok(lastLocalSnapshot, 'supplemental local GET needs a previously returned snapshot');
    await resolve(index, lastLocalSnapshot);
  }
  async function choose() { change(nodes('select')[0], 'w'); change(nodes('select')[1], 'b'); }
  function editDraft(title = '  New title  ', description = '  first\n\nsecond\t ') {
    click('addTask'); change(nodes('input').find(n => n.props.required), title); change(nodes('textarea')[0], description);
  }
  function submit() { const form = nodes('form')[0]; assert.ok(form); form.props.onSubmit({ preventDefault() {} }); }
  function openContext(sessionId) {
    const command = commands.get('board');
    assert.ok(command, 'session command must be registered');
    const session = { sessionId };
    assert.equal(command.available(session), true); command.ui.run(session);
  }
  function disposePlugin() { pluginEffects.splice(0).reverse().forEach(dispose => dispose()); }
  function tile(label) {
    const found = nodes('button').filter(n => n.props.className === 'dsh-board-tile' && n.props['aria-label'] === label);
    assert.equal(found.length, 1, `board tile ${label}`); return found[0];
  }
  return { requests, events, documentEvents, document, timers, timeouts, confirms, panels, openedSessions, openedTabs, commands, slotNames, plugin, ctx, generation, panelInfo, ws, sessions, disposePlugin, window, nodes, text, button, click, change, mount, unmount, resolve, resolveSupplementalLocal, choose, editDraft, submit, openContext, tile };
}

async function ready() {
  const h = harness(); h.mount(); assert.equal(h.requests[0].options.method, 'GET'); await h.resolve(0, base()); await h.choose(); return h;
}

test('board command is session-scoped, effect-owned and fails on duplicate registration', () => {
  const h = harness();
  assert.ok(h.plugin.inject.includes('commandUi')); assert.ok(h.plugin.inject.includes('connection'));
  assert.deepEqual(h.slotNames, ['conversation.session.header.utilities', 'sidebar.right.pane.tab', 'main', 'sidebar.panellist']);
  const command = h.commands.get('board');
  assert.equal(command.name, 'board'); assert.equal(command.label(), 'sessionAction'); assert.equal(command.ui.kind, 'action');
  for (const session of [null, undefined, {}, { sessionId: '' }, { sessionId: 1 }, { sessionId: {} }]) {
    assert.equal(command.available(session), false); command.ui.run(session);
  }
  assert.deepEqual(h.panels, []); assert.equal(h.requests.length, 0);
  assert.equal(command.available({ sessionId: 'one' }), true);
  assert.throws(() => h.plugin.apply(h.ctx), /duplicate contribution for \/board/);
  assert.equal(h.commands.get('board'), command, 'collision must not replace the first registration');
  h.disposePlugin(); assert.equal(h.commands.has('board'), false);
  h.plugin.apply(h.ctx); assert.ok(h.commands.has('board'), 'disposal permits re-registration');
  h.disposePlugin(); assert.equal(h.commands.has('board'), false);
});

test('overview lists accessible boards and one click opens the correct workspace and kanban', async () => {
  const h = harness({ workspaces: [{ workspaceId: 'w', title: 'One', sessionIds: [] }, { workspaceId: 'w2', title: 'Two', sessionIds: [] }] });
  const a = base().boards[0], b = { ...a, workspaceId: 'w2', name: 'Second', tasks: [{ id: 'other', title: 'Second task', statusId: 's' }] };
  h.mount(); await h.resolve(0, { revision: 4, boards: [a, b, { ...a, id: 'hidden', workspaceId: 'missing', name: 'Hidden' }], links: [] });
  assert.deepEqual(h.nodes('button').filter(n => n.props.className === 'dsh-board-tile').map(n => n.props['aria-label']), ['Board — One', 'Second — Two']);
  assert.equal(h.nodes('div').filter(n => n.props.className === 'dsh-board-kanban').length, 0);
  h.tile('Second — Two').props.onClick();
  assert.equal(h.nodes('select')[0].props.value, 'w2'); assert.equal(h.nodes('select')[1].props.value, 'b');
  assert.equal(h.nodes('section').filter(n => n.props.className === 'dsh-board-column' && n.props['aria-label'] === 'Open').length, 1);
  assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'editTask: Second task'));
  assert.ok(!h.nodes('button').some(n => n.props['aria-label'] === 'editTask: Existing'));
  h.click('← returnToBoards'); h.tile('Board — One').props.onClick();
  assert.equal(h.nodes('select')[0].props.value, 'w'); assert.equal(h.nodes('select')[1].props.value, 'b');
  assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'editTask: Existing')); h.unmount();
});

test('session command filters board tiles and toggles only current session in one click', async () => {
  const h = harness({ ids: ['current', 'other'], workspaces: [{ workspaceId: 'w', title: 'One', sessionIds: ['current', 'other'] }, { workspaceId: 'w2', title: 'Two', sessionIds: ['other'] }] });
  const a = base().boards[0], b = { ...a, workspaceId: 'w2', name: 'Second' };
  h.mount(); await h.resolve(0, { revision: 4, boards: [a, b], links: [{ boardId: 'b', taskId: 't', sessionId: 'other' }] });
  h.openContext('current'); assert.deepEqual(h.panels, ['dsh-board']);
  assert.equal(h.requests.length, 1, 'opening the board must not write');
  assert.deepEqual(h.nodes('button').filter(n => n.props.className === 'dsh-board-tile').map(n => n.props['aria-label']), ['Board — One']);
  h.tile('Board — One').props.onClick(); assert.equal(h.nodes('select')[0].props.value, 'w');
  await h.resolveSupplementalLocal(1);
  h.click('linkCurrent'); assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].path, 'api/dsh-board.mutate');
  assert.deepEqual(JSON.parse(h.requests[2].options.body), { expectedRevision: 4, op: 'link.set', workspaceId: 'w', boardId: 'b', taskId: 't', sessionId: 'current', linked: true });
  assert.equal(h.button('linkCurrent').props.disabled, true);
  await h.resolve(2, { revision: 5, boards: [a, b], links: [{ boardId: 'b', taskId: 't', sessionId: 'other' }, { boardId: 'b', taskId: 't', sessionId: 'current' }] });
  h.click('unlinkCurrent'); assert.equal(h.requests.length, 4);
  assert.deepEqual(JSON.parse(h.requests[3].options.body), { expectedRevision: 5, op: 'link.set', workspaceId: 'w', boardId: 'b', taskId: 't', sessionId: 'current', linked: false });
  await h.resolve(3, { revision: 6, boards: [a, b], links: [{ boardId: 'b', taskId: 't', sessionId: 'other' }] });
  assert.equal(h.button('linkCurrent').props['aria-label'], 'linkCurrent: Existing'); h.unmount();
});

test('current session link is unavailable for archived or nonmember sessions', async () => {
  for (const kind of ['archived', 'nonmember']) {
    const h = harness({ ids: ['current'], archived: kind === 'archived' ? ['current'] : [], workspaces: [{ workspaceId: 'w', title: 'One', sessionIds: kind === 'archived' ? ['current'] : [] }] });
    h.mount(); await h.resolve(0, base()); h.openContext('current');
    // Select explicitly as a user can via the workspace/board selectors.
    h.change(h.nodes('select')[0], 'w'); h.change(h.nodes('select')[1], 'b');
    const current = h.nodes('button').filter(n => n.props.className === 'dsh-board-card-current');
    if (kind === 'archived') { assert.equal(current.length, 1); assert.equal(current[0].props.disabled, true); }
    else assert.equal(current.length, 0);
    assert.equal(h.requests.length, 1); h.unmount();
  }
});

test('session intent respects rejected dirty draft and defers while a write is pending', async () => {
  const h = harness({ ids: ['current'] }); h.mount(); await h.resolve(0, base()); await h.choose(); h.editDraft();
  h.window.confirmResult = false; h.openContext('current');
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t '); assert.equal(h.confirms.length, 1);
  assert.equal(h.nodes('div').filter(n => n.props.className === 'dsh-board-session-banner').length, 0);
  h.submit(); h.openContext('current');
  assert.equal(h.nodes('textarea')[0].props.readOnly, true); assert.equal(h.requests.length, 2);
  await h.resolve(1, { ok: true, value: { revision: 5 } });
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ');
  assert.equal(h.nodes('div').filter(n => n.props.className === 'dsh-board-session-banner').length, 0);
  assert.equal(h.button('save').props.disabled, true); h.unmount();
});

test('direct current-session link respects a rejected dirty draft', async () => {
  const h = harness({ ids: ['current'] }); h.mount(); await h.resolve(0, base());
  h.openContext('current'); h.tile('Board — Workspace').props.onClick(); await h.resolveSupplementalLocal(1); h.editDraft();
  h.window.confirmResult = false; h.click('linkCurrent');
  assert.deepEqual(h.confirms, ['discardDraft']); assert.equal(h.requests.length, 2);
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ');
  h.window.confirmResult = true; h.click('linkCurrent');
  assert.equal(h.requests.length, 3); assert.equal(JSON.parse(h.requests[2].options.body).sessionId, 'current');
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ', 'draft remains until the link is acknowledged');
  await h.resolve(2, { error: { code: 'invalid' } }, 400);
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ', 'rejected link must preserve draft');
  h.click('linkCurrent');
  await h.resolve(3, { revision: 5, boards: base().boards, links: [{ boardId: 'b', taskId: 't', sessionId: 'current' }] });
  assert.equal(h.nodes('form').length, 0); h.unmount();
});

test('linked session opens from links form without mutation', async () => {
  const h = harness({ ids: ['current'], byId: { current: { title: 'Conversation' } } });
  const snapshot = base(); snapshot.links.push({ boardId: 'b', taskId: 't', sessionId: 'current' });
  h.mount(); await h.resolve(0, snapshot); await h.choose();
  h.nodes('button').find(n => n.props['aria-label'] === 'sessions: Existing').props.onClick();
  const open = h.nodes('button').find(n => n.props['aria-label'] === 'openSession: Conversation (current)');
  assert.ok(open); open.props.onClick(); assert.deepEqual(h.openedSessions, ['current']); assert.equal(h.requests.length, 1); h.unmount();
});

test('same-title sessions remain distinguishable by full ID', async () => {
  const h = harness({ ids: ['session-a', 'session-b'], byId: { 'session-a': { title: 'Same title' }, 'session-b': { title: 'Same title' } } });
  h.mount(); await h.resolve(0, base()); await h.choose();
  const linksButton = h.nodes('button').find(n => n.props['aria-label'] === 'sessions: Existing');
  assert.ok(linksButton); linksButton.props.onClick();
  const labels = h.nodes('span').flatMap(n => n.children.filter(c => typeof c === 'string'));
  assert.ok(labels.includes('Same title (session-a)')); assert.ok(labels.includes('Same title (session-b)'));
  h.unmount();
});

test('snapshot validation rejects invalid structural references and duplicates', async () => {
  const variants = [
    { ...base(), revision: -1 },
    { ...base(), boards: [base().boards[0], base().boards[0]] },
    { ...base(), boards: [{ ...base().boards[0], tasks: [{ id: 't', title: 'x', statusId: 'missing' }] }] },
    { ...base(), links: [{ boardId: 'b', taskId: 't', sessionId: 'x' }, { boardId: 'b', taskId: 't', sessionId: 'x' }] },
  ];
  for (const value of variants) {
    const h = harness(); h.mount(); await h.resolve(0, value);
    assert.ok(h.nodes('div').some(n => n.props.role === 'alert' && n.children.includes('badSnapshot')));
    h.change(h.nodes('select')[0], 'w'); assert.equal(h.nodes('form').length, 0); assert.equal(h.requests.length, 1); h.unmount();
  }
});

test('draft is lossless across unmount and inflight success clears only on receipt', async () => {
  const h = await ready(); const description = '  first\n\nsecond\t '; h.editDraft('  New title  ', description);
  assert.ok(h.events.has('beforeunload')); h.submit();
  const payload = JSON.parse(h.requests[1].options.body);
  assert.equal(payload.expectedRevision, 4); assert.equal(payload.task.title, 'New title'); assert.equal(payload.task.description, description);
  h.unmount(); h.mount(); assert.equal(h.requests.length, 2, 'remount must not start a GET while POST is pending');
  assert.equal(h.nodes('textarea')[0].props.value, description); assert.equal(h.nodes('textarea')[0].props.readOnly, true);
  const committed = base(5); committed.boards[0].tasks.push({ id: 'new', title: 'New title', description, statusId: 's' });
  await h.resolve(1, committed); assert.equal(h.nodes('form').length, 0); assert.equal(h.events.has('beforeunload'), false); h.unmount();
});

test('malformed success remains uncertain, preserves draft and needs same-revision readback plus explicit confirmation', async () => {
  const h = await ready(); h.editDraft(); h.submit(); await h.resolve(1, { ok: true, value: { revision: 5 } });
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t '); assert.equal(h.button('acknowledgeUnknown').props.disabled, true);
  assert.equal(h.button('save').props.disabled, true); assert.ok(h.events.has('beforeunload'));
  h.click('refresh'); await h.resolve(2, base(4)); assert.equal(h.button('acknowledgeUnknown').props.disabled, false);
  h.window.confirmResult = false; h.click('acknowledgeUnknown'); assert.equal(h.button('save').props.disabled, true);
  h.window.confirmResult = true; h.click('acknowledgeUnknown'); assert.equal(h.button('save').props.disabled, false);
  assert.equal(h.confirms.length, 2); assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ');
  h.submit(); assert.equal(JSON.parse(h.requests[3].options.body).expectedRevision, 4); h.unmount();
});

test('GET -> POST race: stale GET cannot overwrite an acknowledged POST', async () => {
  const h = await ready(); h.editDraft();
  // Two invocations of the same refresh handler can race before React renders
  // the disabled button. Complete the second GET while the first remains open.
  const refresh = h.button('refresh').props.onClick; refresh(); refresh();
  assert.equal(h.requests.length, 3);
  await h.resolve(2, base(4)); h.submit(); assert.equal(h.requests.length, 4);
  await h.resolve(3, base(5)); await h.resolve(1, base(4));
  h.click('addTask'); h.change(h.nodes('input').find(n => n.props.required), 'next'); h.submit();
  assert.equal(JSON.parse(h.requests[4].options.body).expectedRevision, 5); h.unmount();
});

test('inflight failure after unmount preserves draft and blocks writes on remount', async () => {
  const h = await ready(); h.editDraft(); h.submit(); h.unmount();
  h.requests[1].reject(new Error('offline')); await settle(); h.mount();
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ');
  assert.equal(h.button('save').props.disabled, true); assert.ok(h.events.has('beforeunload'));
  assert.equal(h.requests[2].options.method, 'GET'); await h.resolve(2, base(4));
  assert.equal(h.button('acknowledgeUnknown').props.disabled, false); h.unmount();
});

test('older success revision is not accepted as a commit receipt', async () => {
  const h = await ready(); h.editDraft(); h.submit(); await h.resolve(1, base(4));
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ');
  assert.equal(h.button('save').props.disabled, true); assert.equal(h.button('acknowledgeUnknown').props.disabled, true); h.unmount();
});

const trackerSettings = (revision = 0, configured = false, workspaces = {}, needsReselect = []) => ({ revision, configured, orgType: configured ? 'cloud' : null, workspaces, needsReselect });
const issueFixture = { id: 'issue-1', key: 'A-1', summary: '<script>unsafe</script>', description: 'original', assigneeKnown: true, assignee: { id: 'user-1', display: 'User' }, status: { id: '1', key: 'open', display: 'Open' }, version: 5 };
const issueComments = { comments: [{ id: 'c1', text: '<img>comment', version: 1, createdBy: { id: 'u', display: 'Author' }, createdAt: '2026-01-01' }], complete: true, nextCursor: null };
const issueTransitions = [{ id: 'start', display: 'Start', to: { id: '2', key: 'doing', display: 'Doing' } }];
const issueLinks = { revision: 1, links: [{ issueKey: 'A-1', issueId: 'issue-1', sessionId: 'session-1' }], incomplete: true };
const trackerStatuses = {
  open: { id: '1', key: 'open', display: 'Open' },
  shared: { id: '3', key: 'shared', display: 'Shared' },
  doing: { id: '2', key: 'doing', display: 'Doing' },
  unknown: { id: '4', key: 'unknown', display: 'Unknown' },
};
const trackerBoard = { board: { id: '1', name: '<img src=x onerror=alert(1)>' }, columns: [
  { id: '10', name: 'Open', statuses: [trackerStatuses.open, trackerStatuses.shared] },
  { id: '11', name: 'Doing', statuses: [trackerStatuses.doing, trackerStatuses.shared] },
], issues: [
  { id: 'issue-1', key: 'A-1', summary: '<script>unsafe</script>', status: trackerStatuses.open },
  { key: 'A-2', summary: 'Ambiguous', status: trackerStatuses.shared },
  { key: 'A-3', summary: 'Unknown', status: trackerStatuses.unknown },
], issuesComplete: false, issuesReason: 'approximate_board_filter' };

async function trackerIssueReady({ editing = true, origin = null, domRefs = false, issue = issueFixture, comments = issueComments, links = issueLinks, fixture = {} } = {}) {
  const h = harness({ manualTracker: true, domRefs, ids: ['session-1'], byId: { 'session-1': { title: 'Session' } }, ...fixture });
  h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
  h.tile('tracker #1 — Workspace — tracker').props.onClick(); await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, trackerBoard);
  h.document.activeElement = origin;
  h.nodes('button').find(n => n.props['aria-label'] === 'issueDetails: <script>unsafe</script>').props.onClick();
  if (domRefs) h.nodes('aside');
  assert.deepEqual(h.requests.slice(4).map(r => JSON.parse(r.options.body).op), ['issue.read']);
  await h.resolve(4, issue); await h.resolve(5, comments); await h.resolve(6, issueTransitions); await h.resolve(7, links); await h.resolve(8, issue);
  if (editing) h.click('edit');
  return h;
}

const commentPage = (number, nextCursor = String(number * 100)) => ({ comments: [{ id: `page-${number}`, text: `Comment from page ${number}`, version: 1, createdBy: { id: 'author', display: 'Page Author' }, createdAt: '2026-01-01' }], complete: nextCursor === false, nextCursor: nextCursor === false ? null : nextCursor });
const commentRows = h => h.nodes('li').filter(n => n.props.className === 'dsh-board-tracker-comment').map(n => h.text(n));
const commentSummary = h => h.text(h.nodes('div').find(n => n.props.className === 'dsh-board-comment-summary'));
const commentRequest = (h, index, cursor) => assert.deepEqual(JSON.parse(h.requests[index].options.body), { op: 'issue.comments', workspaceId: 'w', boardId: '1', issueKey: 'A-1', issueId: 'issue-1', ...(cursor === undefined ? {} : { cursor }) });

const drawerSessionButton = h => h.nodes('button').find(n => n.props.className === 'dsh-board-tracker-session-link');

test('Tracker comments automatically traverse two pages and show completion', async () => {
  const h = await trackerIssueReady({ editing: false, comments: commentPage(1) });
  try {
    commentRequest(h, 5); commentRequest(h, 9, '100');
    assert.match(commentRows(h).join(' '), /Comment from page 1/);
    assert.equal(commentSummary(h), 'issueCommentsLoaded 1issueCommentsLoading');
    await h.resolve(9, commentPage(2, false));
    assert.deepEqual(commentRows(h).map(text => text.match(/Comment from page \d/)[0]), ['Comment from page 1', 'Comment from page 2']);
    assert.equal(commentSummary(h), 'issueCommentsLoaded 2issueCommentsComplete');
    assert.equal(h.requests.length, 10);
    assert.ok(!h.nodes('button').some(n => h.text(n) === 'issueCommentsMore'));
  } finally { h.unmount(); }
});

test('Tracker comments without a continuation cursor remain indeterminate', async () => {
  const h = await trackerIssueReady({ editing: false, comments: commentPage(1, null) });
  try {
    assert.match(commentRows(h).join(' '), /Comment from page 1/);
    assert.equal(commentSummary(h), 'issueCommentsLoaded 1issueCommentsTerminalPartial');
    assert.equal(h.requests.length, 9);
    assert.ok(!h.nodes('button').some(n => h.text(n) === 'issueCommentsMore'));
  } finally { h.unmount(); }
});

test('Tracker comments fail closed on duplicate IDs and cursor cycles', async () => {
  for (const invalid of [
    { ...commentPage(2), comments: [commentPage(1).comments[0]] },
    { ...commentPage(2), comments: [commentPage(2).comments[0], commentPage(2).comments[0]] },
    commentPage(2, '100'), commentPage(2, '0'),
  ]) {
    const h = await trackerIssueReady({ editing: false, comments: commentPage(1) });
    try {
      commentRequest(h, 9, '100'); await h.resolve(9, invalid);
      assert.equal(commentSummary(h), 'issueCommentsLoaded 1issueCommentsInvalid');
      assert.equal(commentRows(h).length, 1); assert.match(commentRows(h)[0], /Comment from page 1/);
      assert.equal(h.requests.length, 10);
      assert.ok(!h.nodes('button').some(n => h.text(n) === 'issueCommentsMore'));
    } finally { h.unmount(); }
  }
});

test('Tracker comments retain prior pages on error and retry only on explicit load more', async () => {
  const h = await trackerIssueReady({ editing: false, comments: commentPage(1) });
  try {
    commentRequest(h, 9, '100'); h.requests[9].reject(new Error('offline')); await settle();
    assert.equal(commentSummary(h), 'issueCommentsLoaded 1issueCommentsError');
    assert.match(commentRows(h)[0], /Comment from page 1/); assert.equal(h.requests.length, 10);
    h.click('issueCommentsMore'); commentRequest(h, 10, '100'); await h.resolve(10, commentPage(2, false));
    assert.equal(commentSummary(h), 'issueCommentsLoaded 2issueCommentsComplete');
    assert.match(commentRows(h).join(' '), /Comment from page 2/); assert.equal(h.requests.length, 11);
  } finally { h.unmount(); }
});

test('Tracker comments stop after ten pages until explicit load more', async () => {
  const h = await trackerIssueReady({ editing: false, comments: commentPage(1) });
  try {
    for (let page = 2; page <= 10; page++) {
      const index = page + 7; commentRequest(h, index, String((page - 1) * 100)); await h.resolve(index, commentPage(page));
    }
    assert.equal(h.requests.length, 18); assert.equal(commentRows(h).length, 10);
    assert.equal(commentSummary(h), 'issueCommentsLoaded 10issueCommentsPartial');
    h.click('issueCommentsMore'); commentRequest(h, 18, '1000'); await h.resolve(18, commentPage(11, false));
    assert.equal(commentRows(h).length, 11); assert.match(commentRows(h)[10], /Comment from page 11/);
    assert.equal(commentSummary(h), 'issueCommentsLoaded 11issueCommentsComplete'); assert.equal(h.requests.length, 19);
  } finally { h.unmount(); }
});

test('Tracker comment pages are fenced when issue, workspace, visibility or account changes', async () => {
  for (const stage of ['first', 'next']) for (const cause of ['issue', 'workspace', 'hidden', 'account']) {
    const h = await trackerIssueReady({ editing: false, comments: stage === 'next' ? commentPage(1) : issueComments });
    try {
      let index;
      if (stage === 'first') {
        h.click('issueReload'); await h.resolve(9, issueFixture); index = 10;
        commentRequest(h, index);
      } else { index = 9; commentRequest(h, index, '100'); }
      if (cause === 'issue') h.click('close');
      if (cause === 'workspace') h.ws.set({ ...h.ws.getSnapshot(), items: [{ workspaceId: 'w2', title: 'Other', sessionIds: [] }] });
      if (cause === 'hidden') { h.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')(); }
      if (cause === 'account') h.generation.set({ id: 2, host: { home: '/' } });
      h.nodes('main');
      const requestsBefore = h.requests.length;
      await h.resolve(index, commentPage(99, false));
      if (stage === 'first') { await h.resolve(11, issueTransitions); await h.resolve(12, issueLinks); }
      assert.ok(!commentRows(h).some(row => row.includes('Comment from page 99')), `${stage}/${cause}`);
      assert.ok(!h.nodes('p').some(n => h.text(n).includes('Comment from page 99')), `${stage}/${cause}`);
      assert.equal(h.requests.length, requestsBefore, `${stage}/${cause} dispatched stale continuation`);
    } finally { h.unmount(); }
  }
});

test('Tracker pagination refresh preserves comment drafts and edit baseline', async () => {
  const h = await trackerIssueReady({ editing: false, comments: commentPage(1) });
  try {
    h.change(h.nodes('textarea').find(n => n.props.value === ''), 'new comment draft');
    h.click('issueEditComment'); h.change(h.nodes('textarea').find(n => n.props.value === 'Comment from page 1'), 'edited comment draft');
    h.click('issueReload'); await h.resolve(10, issueFixture); await h.resolve(11, commentPage(1));
    await h.resolve(12, issueTransitions); await h.resolve(13, issueLinks); await h.resolve(14, issueFixture);
    commentRequest(h, 15, '100');
    assert.ok(h.nodes('textarea').some(n => n.props.value === 'new comment draft'));
    assert.ok(h.nodes('textarea').some(n => n.props.value === 'edited comment draft'));
    await h.resolve(9, commentPage(98, false)); await h.resolve(15, commentPage(2, false));
    assert.ok(!commentRows(h).some(row => row.includes('Comment from page 98')));
    assert.ok(h.nodes('textarea').some(n => n.props.value === 'edited comment draft'));
    h.click('issueSaveCommentEdit');
    assert.deepEqual(JSON.parse(h.requests[16].options.body), { op: 'issue.editComment', workspaceId: 'w', boardId: '1', issueKey: 'A-1', issueId: 'issue-1', commentId: 'page-1', expectedVersion: 1, text: 'edited comment draft' });
  } finally { h.unmount(); }
});

test('Tracker page authorization failure hides previously loaded comments and fences a pending write', async () => {
  for (const writing of [false, true]) {
    const h = await trackerIssueReady({ editing: false, comments: commentPage(1) });
    try {
      if (writing) { h.change(h.nodes('textarea').find(n => n.props.value === ''), 'draft pending'); h.click('issueAddComment'); }
      await h.resolve(9, { error: { code: 'issue_not_in_selected_boards' } }, 403);
      assert.equal(commentRows(h).length, 0); assert.ok(!h.nodes('h3').some(n => h.text(n) === issueFixture.summary));
      assert.ok(!h.nodes('button').some(n => h.text(n) === 'issueCommentsMore'));
      const count = h.requests.length;
      if (writing) { await h.resolve(10, { id: 'posted', version: 1 }); assert.equal(h.requests.length, count); }
      assert.ok(!h.nodes('p').some(n => h.text(n).includes('Comment from page 1')));
    } finally { h.unmount(); }
  }
});

test('Tracker drawer session opens directly and modified without board links', async () => {
  const h = await trackerIssueReady({ editing: false });
  const button = drawerSessionButton(h); assert.ok(button); assert.equal(button.props.type, 'button'); assert.equal(button.props.href, undefined);
  assert.equal(h.text(button), 'Session (session-1)');
  button.props.onClick({}); button.props.onClick({ ctrlKey: true }); button.props.onClick({ metaKey: true });
  let prevented = 0; button.props.onAuxClick({ button: 1, preventDefault() { prevented++; } });
  assert.equal(prevented, 1); assert.deepEqual(h.openedSessions, ['session-1']);
  assert.equal(h.openedTabs.length, 3);
  for (const [url, target, features] of h.openedTabs) assert.deepEqual([url, target, features], ['http://localhost/app/#dsh-board-session-v1:w:session-1', '_blank', 'noopener,noreferrer']);
  assert.equal(h.requests.length, 9, 'drawer links work without a board-links read or mutation'); h.unmount();
});

test('Tracker drawer marks unavailable links and hides foreign or mismatched relations', async () => {
  const links = { revision: 1, incomplete: true, links: [
    ...['session-1', 'archived', 'missing', 'foreign'].map(sessionId => ({ issueKey: 'A-1', issueId: 'issue-1', sessionId })),
    { issueKey: 'A-2', issueId: 'issue-1', sessionId: 'wrong-key' }, { issueKey: 'A-1', issueId: 'old-id', sessionId: 'wrong-id' },
  ] };
  const h = await trackerIssueReady({ editing: false, links, fixture: { ids: ['session-1', 'archived', 'foreign', 'wrong-key', 'wrong-id'], archived: ['archived'], workspaces: [{ workspaceId: 'w', title: 'Workspace', sessionIds: ['session-1', 'archived', 'missing', 'wrong-key', 'wrong-id'] }, { workspaceId: 'w2', title: 'Other', sessionIds: ['foreign'] }] } });
  let rows = h.nodes('li').filter(n => n.props.className === 'dsh-board-tracker-session');
  assert.deepEqual(rows.map(n => h.text(n)), ['Session (session-1)', 'archived — sessionArchived', 'missing — sessionUnavailable']);
  assert.equal(h.nodes('button').filter(n => n.props.className === 'dsh-board-tracker-session-link').length, 1);
  h.sessions.set({ ...h.sessions.getSnapshot(), phase: 'pending' });
  rows = h.nodes('li').filter(n => n.props.className === 'dsh-board-tracker-session');
  assert.ok(rows.every(n => h.text(n).endsWith(' — sessionLoading'))); assert.equal(drawerSessionButton(h), undefined);
  assert.deepEqual(h.openedSessions, []); h.unmount();
});

test('Tracker drawer stale handler rechecks membership, catalogs, scope and generations', async () => {
  for (const scenario of ['workspace-member', 'workspace-loading', 'workspace-error', 'session-loading', 'session-missing', 'archived', 'panel', 'issue-loading', 'pending', 'unknown', 'token', 'privacy', 'tracker-generation']) {
    const h = await trackerIssueReady({ editing: false }); const button = drawerSessionButton(h); assert.ok(button, scenario);
    const ws = h.ws.getSnapshot(), sessions = h.sessions.getSnapshot();
    if (scenario === 'workspace-member') h.ws.set({ ...ws, items: [{ ...ws.items[0], sessionIds: [] }, { workspaceId: 'w2', sessionIds: ['session-1'] }] });
    if (scenario === 'workspace-loading') h.ws.set({ ...ws, phase: 'pending' });
    if (scenario === 'workspace-error') h.ws.set({ ...ws, state: 'error' });
    if (scenario === 'session-loading') h.sessions.set({ ...sessions, phase: 'pending' });
    if (scenario === 'session-missing') h.sessions.set({ ...sessions, ids: [] });
    if (scenario === 'archived') h.ws.set({ ...ws, archivedSessionIds: ['session-1'] });
    if (scenario === 'panel') h.panelInfo.set({ activePanelId: 'other' });
    if (scenario === 'issue-loading') h.click('issueReload');
    if (scenario === 'pending' || scenario === 'unknown') { h.change(h.nodes('textarea').find(n => n.props.value === ''), 'comment'); h.click('issueAddComment'); if (scenario === 'unknown') { h.requests[9].reject(new Error('offline')); await settle(); } }
    if (scenario === 'token') { h.click('close'); h.nodes('button').find(n => n.props['aria-label'] === 'issueDetails: <script>unsafe</script>').props.onClick(); }
    if (scenario === 'privacy') { h.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')(); }
    if (scenario === 'tracker-generation') h.click('trackerRefreshBoard');
    button.props.onClick({}); button.props.onClick({ ctrlKey: true }); let prevented = 0; button.props.onAuxClick({ button: 1, preventDefault() { prevented++; } });
    assert.equal(prevented, 1, scenario); assert.deepEqual(h.openedSessions, [], scenario); assert.deepEqual(h.openedTabs, [], scenario); h.unmount();
  }
});

test('Tracker drawer preview shows issue metadata and safe text before explicit field editing', async () => {
  const h = await trackerIssueReady({ editing: false });
  const aside = h.nodes('aside')[0];
  assert.equal(aside.props.role, undefined); assert.equal(aside.props['aria-modal'], undefined);
  assert.ok(h.nodes('h3').some(n => h.text(n) === issueFixture.summary));
  assert.ok(h.nodes('button').some(n => n.props.className === 'dsh-board-tracker-status' && h.text(n) === 'Open'));
  assert.ok(h.nodes('p').some(n => h.text(n) === 'assignee: User'));
  assert.ok(h.nodes('div').some(n => n.props.className === 'dsh-board-richtext' && h.text(n) === 'original'));
  const external = h.nodes('a').find(n => h.text(n) === 'A-1 ↗');
  assert.equal(external.props.href, 'https://tracker.yandex.ru/A-1'); assert.equal(external.props.target, '_blank'); assert.equal(external.props.rel, 'noopener noreferrer');
  assert.ok(!h.nodes('input').some(n => n.props.value === issueFixture.summary || n.props.value === 'user-1'));
  assert.ok(!h.nodes('textarea').some(n => n.props.value === 'original'));
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueSeparateOperations'));
  const sections = h.nodes('section').filter(n => n.props.className === 'dsh-board-tracker-section');
  assert.ok(sections.findIndex(n => h.text(n).startsWith('sessions')) < sections.findIndex(n => h.text(n).startsWith('issueComments')));
  h.click('edit'); assert.ok(h.nodes('input').some(n => n.props.value === issueFixture.summary));
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'original'));
  assert.ok(h.nodes('textarea').some(n => n.props.value === ''), 'new comment remains available while editing fields');
  assert.equal(h.requests.length, 9); h.unmount();
});

test('Tracker description and comments render safe markup while editors preserve the raw source', async () => {
  const description = '<#<html><body><p onclick="alert(1)">Description <strong>bold</strong> <a href="https://example.com/path" onmouseover="alert(1)">safe</a><a href="javascript:alert(1)">bad link</a><img src="https://evil.example/x" onerror="alert(1)"><script>alert(1)</script></p></body></html>#>';
  const comment = '<#<html><body><p>Comment <em>emphasis</em> <a href="https://example.org/comment" target="_self">external</a><iframe src="https://evil.example/"></iframe><a href="javascript:alert(2)">unsafe</a></p></body></html>#>';
  const h = await trackerIssueReady({ editing: false, issue: { ...issueFixture, description }, comments: { ...issueComments, comments: [{ ...issueComments.comments[0], text: comment }] } });
  try {
    const rich = h.nodes('div').filter(n => n.props.className === 'dsh-board-richtext');
    assert.equal(rich.length, 2);
    assert.ok(h.text(rich[0]).includes('Description bold safebad link'));
    assert.ok(h.text(rich[1]).includes('Comment emphasis externalunsafe'));
    assert.ok(h.nodes('strong').some(n => h.text(n) === 'bold'));
    assert.ok(h.nodes('em').some(n => h.text(n) === 'emphasis'));
    const allowed = new Set(['div', 'p', 'span', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a']);
    const inspect = node => {
      if (!node || typeof node !== 'object') return;
      assert.ok(allowed.has(node.type), `unexpected rich text element ${node.type}`);
      for (const key of Object.keys(node.props)) assert.ok(['className', 'key', 'href', 'target', 'rel'].includes(key), `unexpected rich text prop ${key}`);
      if (node.type === 'a') {
        assert.ok(['https://example.com/path', 'https://example.org/comment'].includes(node.props.href));
        assert.equal(node.props.target, '_blank'); assert.equal(node.props.rel, 'noopener noreferrer');
      }
      node.children.forEach(inspect);
    };
    rich.forEach(inspect);
    assert.equal(h.nodes('a').filter(n => ['https://example.com/path', 'https://example.org/comment'].includes(n.props.href)).length, 2);
    assert.ok(!h.text(rich[0]).includes('alert(1)'));
    h.click('edit'); assert.ok(h.nodes('textarea').some(n => n.props.value === description));
    h.click('issueEditComment'); assert.ok(h.nodes('textarea').some(n => n.props.value === comment));
    assert.equal(h.requests.length, 9, 'rendering and entering editors do not write');
  } finally { h.unmount(); }
});

test('Tracker edit toggle moves keyboard focus and marks retained field drafts', async () => {
  const h = await trackerIssueReady({ editing: false, domRefs: true });
  assert.equal(h.document.activeElement.type, 'h2', 'opening focuses the drawer heading');
  assert.ok(!h.nodes('p').some(n => n.props.className === 'dsh-board-tracker-draft'));
  h.click('edit'); h.nodes('input');
  assert.equal(h.document.activeElement.type, 'input'); assert.equal(h.document.activeElement.props.value, issueFixture.summary);
  assert.equal(h.text(h.button('issueKeepDraft')), 'issueKeepDraft');
  h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'retained');
  h.click('issueKeepDraft'); h.nodes('button');
  assert.equal(h.document.activeElement.type, 'button'); assert.equal(h.text(h.button('edit')), 'edit');
  assert.equal(h.document.activeElement.props.ref, h.button('edit').props.ref);
  assert.ok(h.nodes('p').some(n => n.props.className === 'dsh-board-tracker-draft' && h.text(n) === 'unsaved'));
  h.click('edit'); h.nodes('input'); assert.equal(h.document.activeElement.type, 'input');
  h.change(h.nodes('input').find(n => n.props.value === 'retained'), issueFixture.summary);
  h.click('issueKeepDraft'); assert.ok(!h.nodes('p').some(n => n.props.className === 'dsh-board-tracker-draft'));
  assert.equal(h.requests.length, 9); h.unmount();
});

test('Tracker field mode preserves all drafts through cancel, refresh and resumed editing', async () => {
  const h = await trackerIssueReady();
  h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'draft title');
  h.change(h.nodes('textarea').find(n => n.props.value === 'original'), 'draft description');
  h.change(h.nodes('input').find(n => n.props.value === 'user-1'), 'draft-user');
  h.change(h.nodes('textarea').find(n => n.props.value === ''), 'draft comment');
  h.click('issueEditComment'); h.change(h.nodes('textarea').find(n => n.props.value === '<img>comment'), 'comment edit');
  h.click('issueKeepDraft'); assert.ok(!h.nodes('input').some(n => n.props.value === 'draft title'));
  assert.ok(h.nodes('p').some(n => n.props.className === 'dsh-board-tracker-draft' && h.text(n) === 'unsaved'));
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'draft comment'));
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'comment edit'));
  h.click('issueReload');
  const fresh = { ...issueFixture, summary: 'new server title', description: 'new server description', version: 6 };
  await h.resolve(9, fresh); await h.resolve(10, issueComments); await h.resolve(11, issueTransitions); await h.resolve(12, issueLinks); await h.resolve(13, fresh);
  assert.ok(h.nodes('h3').some(n => h.text(n) === 'new server title'));
  assert.ok(h.nodes('p').some(n => n.props.className === 'dsh-board-tracker-draft' && h.text(n) === 'unsaved'));
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'comment edit'));
  h.click('edit'); assert.ok(h.nodes('input').some(n => n.props.value === 'draft title'));
  assert.ok(h.nodes('input').some(n => n.props.value === 'draft-user'));
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'draft description'));
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'draft comment'));
  h.click('issueSaveFields');
  assert.deepEqual(JSON.parse(h.requests[14].options.body).changes, { expectedVersion: 5, summary: 'draft title', description: 'draft description', assignee: 'draft-user' });
  h.unmount();
});

test('Tracker drawer Escape closes only after confirmation and restores origin focus', async () => {
  let focused = 0; const origin = { isConnected: true, focus() { focused++; } };
  const h = await trackerIssueReady({ origin });
  const heading = h.nodes('h2').find(n => n.props.ref && n.props.tabIndex === -1); let headingFocus = 0; heading.props.ref.current = { focus() { headingFocus++; } };
  h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'draft');
  let prevented = 0; const escape = () => h.nodes('aside')[0].props.onKeyDown({ key: 'Escape', preventDefault() { prevented++; } });
  h.window.confirmResult = false; escape(); assert.equal(h.nodes('aside').length, 1); assert.equal(h.confirms.at(-1), 'discardDraft');
  h.window.confirmResult = true; escape(); assert.equal(h.nodes('aside').length, 0); assert.equal(prevented, 2); assert.equal(focused, 1); h.unmount();
});

test('Tracker drawer opens lazily without writes, validates and saves only changed fields', async () => {
  const h = await trackerIssueReady();
  assert.equal(h.nodes('aside').filter(n => n.props['aria-label'] === 'issueDetails').length, 1);
  assert.ok(!h.nodes('script').length); assert.ok(h.nodes('p').some(n => h.text(n) === '<img>comment'));
  assert.equal(h.nodes('input').find(n => n.props.value === 'user-1').props.value, 'user-1');
  assert.ok(h.nodes('p').some(n => h.text(n) === 'assignee: User'), 'drawer shows Tracker assignee display name');
  h.click('issueSaveFields'); assert.equal(h.requests.length, 9, 'opening and unchanged save never write');
  h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), '  '); h.click('issueSaveFields');
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueInvalid')); assert.equal(h.requests.length, 9);
  h.change(h.nodes('input').find(n => n.props.value === '  '), 'Updated'); h.click('issueSaveFields');
  assert.deepEqual(JSON.parse(h.requests[9].options.body), { op: 'issue.update', workspaceId: 'w', boardId: '1', issueKey: 'A-1', issueId: 'issue-1', changes: { expectedVersion: 5, summary: 'Updated' } });
  assert.equal(h.button('issueSaveFields').props.disabled, true); h.button('issueSaveFields').props.onClick(); assert.equal(h.requests.length, 10);
  await h.resolve(9, { version: 6 }); assert.equal(h.requests.length, 11, 'successful save triggers fresh reads'); h.unmount();
});

test('Tracker transition and comment are separate explicit writes and unknown is not retried', async () => {
  const h = await trackerIssueReady();
  h.click('issueChangeStatus: Open'); h.click('Start → Doing');
  h.window.confirmResult = false; h.click('issueChangeStatus'); assert.equal(h.requests.length, 9);
  assert.equal(h.confirms.at(-1), 'issueConfirmTransition Start: Open → Doing');
  h.window.confirmResult = true; h.click('issueChangeStatus');
  assert.deepEqual(JSON.parse(h.requests[9].options.body), { op: 'issue.read', workspaceId: 'w', boardId: '1', issueKey: 'A-1', issueId: 'issue-1' });
  await h.resolve(9, issueFixture);
  assert.deepEqual(JSON.parse(h.requests[10].options.body), { op: 'issue.transition', workspaceId: 'w', boardId: '1', issueKey: 'A-1', issueId: 'issue-1', transitionId: 'start', expectedTo: issueTransitions[0].to });
  await h.resolve(10, { error: { code: 'conflict' } }, 409);
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueConflict')); assert.equal(h.button('issueChangeStatus: Open').props.disabled, true);
  h.click('issueReload'); await h.resolve(11, issueFixture); await h.resolve(12, issueComments); await h.resolve(13, issueTransitions); await h.resolve(14, issueLinks); await h.resolve(15, issueFixture);
  assert.equal(h.button('issueChangeStatus: Open').props.disabled, true, 'reload cannot silently rebase conflicted draft');
  h.click('issueDiscardConflict'); await h.resolve(16, issueFixture); await h.resolve(17, issueComments); await h.resolve(18, issueTransitions); await h.resolve(19, issueLinks); await h.resolve(20, issueFixture);
  h.change(h.nodes('textarea')[1], 'new comment'); h.click('issueAddComment');
  assert.deepEqual(JSON.parse(h.requests[21].options.body), { op: 'issue.comment', workspaceId: 'w', boardId: '1', issueKey: 'A-1', issueId: 'issue-1', text: 'new comment' });
  h.requests[21].reject(new Error('offline')); await settle(); assert.equal(h.button('issueAddComment').props.disabled, true);
  assert.equal(h.nodes('textarea')[1].props.value, 'new comment'); assert.ok(h.nodes('p').some(n => h.text(n) === 'issueUnknown')); assert.equal(h.requests.length, 22); h.unmount();
});

test('status popover opens without requests, supports Escape and focuses the trigger', async () => {
  const h = await trackerIssueReady({ editing: false, domRefs: true });
  const pill = h.button('issueChangeStatus: Open'); assert.equal(pill.props['aria-expanded'], false);
  h.click('issueChangeStatus: Open');
  assert.equal(h.button('issueChangeStatus: Open').props['aria-expanded'], true);
  assert.equal(h.document.activeElement.type, 'button'); assert.equal(h.document.activeElement.props['aria-pressed'], false);
  assert.equal(h.requests.length, 9); assert.equal(h.confirms.length, 0);
  h.click('Start → Doing'); assert.equal(h.button('Start → Doing').props['aria-pressed'], true); assert.equal(h.requests.length, 9);
  let prevented = false; h.nodes('aside')[0].props.onKeyDown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.nodes('aside').length, 1); assert.equal(h.document.activeElement.props.ref, h.button('issueChangeStatus: Open').props.ref);
  assert.equal(h.requests.length, 9); h.unmount();
});

test('status disables unavailable transitions and preserves unknown selection without retry', async () => {
  const h = await trackerIssueReady({ editing: false }); h.click('issueReload');
  await h.resolve(9, issueFixture); await h.resolve(10, issueComments); await h.resolve(11, []); await h.resolve(12, issueLinks); await h.resolve(13, issueFixture);
  assert.equal(h.button('issueChangeStatus: Open').props.disabled, true);
  assert.ok(h.nodes('span').some(n => h.text(n) === 'issueTransitionsUnavailable'));
  h.click('issueReload'); await h.resolve(14, issueFixture); await h.resolve(15, issueComments); await h.resolve(16, issueTransitions); await h.resolve(17, issueLinks); await h.resolve(18, issueFixture);
  h.click('issueChangeStatus: Open'); h.click('Start → Doing'); h.click('issueChangeStatus');
  await h.resolve(19, issueFixture); h.requests[20].reject(new Error('offline')); await settle();
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueUnknown')); assert.equal(h.button('issueChangeStatus: Open').props.disabled, true);
  assert.equal(h.button('Start → Doing').props['aria-pressed'], true); assert.equal(h.button('issueChangeStatus').props.disabled, true); assert.equal(h.requests.length, 21); h.unmount();
});

test('status selection is fenced on privacy refresh and never rebased by identity', async () => {
  const h = await trackerIssueReady({ editing: false }); h.click('issueChangeStatus: Open'); h.click('Start → Doing');
  const staleConfirm = h.button('issueChangeStatus').props.onClick;
  h.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')(); staleConfirm();
  assert.equal(h.requests.length, 9); assert.equal(h.nodes('aside').length, 1);
  assert.ok(!h.nodes('button').some(n => h.text(n) === 'Start → Doing'));
  h.document.visibilityState = 'visible'; h.documentEvents.get('visibilitychange')();
  await h.resolveSupplementalLocal(9); await h.resolve(10, trackerSettings(1, true, { w: ['1'] })); await h.resolve(11, trackerBoard); h.nodes('main');
  await h.resolve(12, issueFixture); await h.resolve(13, issueComments); await h.resolve(14, [{ id: 'start', display: 'Different', to: { id: '3', key: 'other', display: 'Other' } }]); await h.resolve(15, issueLinks); await h.resolve(16, issueFixture);
  h.click('issueChangeStatus: Open'); assert.equal(h.button('issueChangeStatus').props.disabled, true); staleConfirm(); assert.equal(h.requests.length, 17);
  h.click('Different → Other'); h.window.confirmResult = false; h.click('issueChangeStatus'); assert.equal(h.confirms.at(-1), 'issueConfirmTransition Different: Open → Other'); assert.equal(h.requests.length, 17); h.unmount();
});

test('status preflight fails closed for changed identity, version or status and read errors', async () => {
  for (const changed of [{ ...issueFixture, id: 'different' }, { ...issueFixture, version: 6 }, { ...issueFixture, status: { ...issueFixture.status, display: 'changed' } }, null]) {
    const h = await trackerIssueReady(); h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'retained');
    h.click('issueChangeStatus: Open'); h.click('Start → Doing'); h.click('issueChangeStatus');
    if (changed) await h.resolve(9, changed); else { h.requests[9].reject(new Error('offline')); await settle(); }
    assert.equal(h.requests.length, 10); assert.ok(!h.nodes('p').some(n => h.text(n) === 'issueUnknown'));
    assert.ok(h.nodes('input').some(n => n.props.value === 'retained')); assert.ok(h.nodes('p').some(n => h.text(n) === (changed ? 'issueConflict' : 'trackerError'))); h.unmount();
  }
});

test('status confirmation and preflight are fenced by access revocation', async () => {
  {
    const h = await trackerIssueReady({ editing: false }); h.click('issueChangeStatus: Open'); h.click('Start → Doing');
    h.window.confirm = message => { h.confirms.push(message); h.generation.set(undefined); return true; };
    h.click('issueChangeStatus'); assert.equal(h.requests.length, 9); assert.equal(h.nodes('aside').length, 1); h.unmount();
  }
  {
    const h = await trackerIssueReady({ editing: false }); h.click('issueChangeStatus: Open'); h.click('Start → Doing'); h.click('issueChangeStatus');
    h.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')();
    await h.resolve(9, issueFixture); assert.equal(h.requests.length, 10, 'late preflight must not dispatch a transition');
    h.document.visibilityState = 'visible'; h.documentEvents.get('visibilitychange')();
    await h.resolveSupplementalLocal(10); await h.resolve(11, trackerSettings(1, true, { w: ['1'] })); await h.resolve(12, trackerBoard); h.nodes('main');
    await h.resolve(13, issueFixture); await h.resolve(14, issueComments); await h.resolve(15, issueTransitions); await h.resolve(16, issueLinks); await h.resolve(17, issueFixture);
    assert.ok(!h.nodes('p').some(n => h.text(n) === 'issueUnknown')); assert.equal(h.requests.length, 18); h.unmount();
  }
});

test('status preflight timeout is read-only and cannot dispatch late', async () => {
  const h = await trackerIssueReady({ editing: false }); h.click('issueChangeStatus: Open'); h.click('Start → Doing'); h.click('issueChangeStatus');
  [...h.timeouts].at(-1)(); await settle();
  assert.ok(h.nodes('p').some(n => h.text(n) === 'trackerError')); assert.ok(!h.nodes('p').some(n => h.text(n) === 'issueUnknown'));
  await h.resolve(9, issueFixture); assert.equal(h.requests.length, 10); assert.equal(h.button('issueChangeStatus').props.disabled, true); h.unmount();
});

test('status success reloads the live issue status and leaves other drafts', async () => {
  const h = await trackerIssueReady(); h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'draft title');
  h.click('issueChangeStatus: Open'); h.click('Start → Doing'); h.click('issueChangeStatus'); await h.resolve(9, issueFixture); await h.resolve(10, { ok: true });
  const fresh = { ...issueFixture, status: issueTransitions[0].to, version: 6 };
  await h.resolve(11, fresh); await h.resolve(12, issueComments); await h.resolve(13, []); await h.resolve(14, issueLinks); await h.resolve(15, fresh);
  assert.equal(h.text(h.button('issueChangeStatus: Doing')), 'Doing'); assert.ok(h.nodes('input').some(n => n.props.value === 'draft title')); assert.equal(h.requests.length, 16); h.unmount();
});

test('Tracker comment edit retains versioned row draft across refresh and saves explicitly', async () => {
  const h = await trackerIssueReady();
  h.click('issueEditComment');
  h.change(h.nodes('textarea').find(n => n.props.value === '<img>comment'), 'private revised comment');
  assert.equal(h.requests.length, 9);
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueCommentRaceWarning'));
  h.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')();
  assert.ok(!h.nodes('textarea').some(n => n.props.value === 'private revised comment'));
  h.document.visibilityState = 'visible'; h.documentEvents.get('visibilitychange')();
  await h.resolveSupplementalLocal(9); await h.resolve(10, trackerSettings(1, true, { w: ['1'] })); await h.resolve(11, trackerBoard); h.nodes('main');
  await h.resolve(12, issueFixture); await h.resolve(13, { comments: [{ ...issueComments.comments[0], text: 'changed elsewhere', version: 2 }], complete: true, nextCursor: null }); await h.resolve(14, issueTransitions); await h.resolve(15, issueLinks); await h.resolve(16, issueFixture);
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'private revised comment'));
  h.click('issueSaveCommentEdit');
  assert.deepEqual(JSON.parse(h.requests[17].options.body), { op: 'issue.editComment', workspaceId: 'w', boardId: '1', issueKey: 'A-1', issueId: 'issue-1', commentId: 'c1', expectedVersion: 1, text: 'private revised comment' });
  h.requests[17].reject(new Error('offline')); await settle();
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueUnknown'));
  assert.equal(h.button('issueSaveCommentEdit').props.disabled, true);
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'private revised comment'));
  h.unmount();
});

test('Tracker comment edit success clears only its own draft', async () => {
  const h = await trackerIssueReady();
  h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'unsaved issue field');
  h.click('issueEditComment'); h.change(h.nodes('textarea').find(n => n.props.value === '<img>comment'), 'updated');
  h.click('issueSaveCommentEdit'); await h.resolve(9, { id: 'c1', version: 2 });
  assert.equal(JSON.parse(h.requests[10].options.body).op, 'issue.read');
  await h.resolve(10, issueFixture); await h.resolve(11, { comments: [{ ...issueComments.comments[0], text: 'updated', version: 2 }], complete: true, nextCursor: null }); await h.resolve(12, issueTransitions); await h.resolve(13, issueLinks); await h.resolve(14, issueFixture);
  assert.ok(h.nodes('input').some(n => n.props.value === 'unsaved issue field'));
  assert.ok(h.nodes('p').some(n => h.text(n) === 'updated'));
  assert.ok(!h.nodes('button').some(n => h.text(n) === 'issueSaveCommentEdit'));
  h.unmount();
});

test('Tracker comment editing requires a valid version and validates receipts', async () => {
  const h = await trackerIssueReady();
  h.click('issueReload'); await h.resolve(9, issueFixture); await h.resolve(10, { comments: [{ ...issueComments.comments[0], version: null }], complete: true, nextCursor: null }); await h.resolve(11, issueTransitions); await h.resolve(12, issueLinks); await h.resolve(13, issueFixture);
  assert.ok(!h.nodes('button').some(n => h.text(n) === 'issueEditComment'));
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueCommentVersionUnavailable'));
  h.click('issueReload'); await h.resolve(14, issueFixture); await h.resolve(15, issueComments); await h.resolve(16, issueTransitions); await h.resolve(17, issueLinks); await h.resolve(18, issueFixture);
  h.click('issueEditComment'); h.change(h.nodes('textarea').find(n => n.props.value === '<img>comment'), 'updated'); h.click('issueSaveCommentEdit');
  await h.resolve(19, { id: 'other', version: 2 });
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueUnknown'));
  assert.equal(h.button('issueSaveCommentEdit').props.disabled, true);
  h.unmount();
});

test('comment edit conflict can be discarded and retried from the fresh version', async () => {
  const h = await trackerIssueReady();
  h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'other draft');
  h.click('issueEditComment'); h.change(h.nodes('textarea').find(n => n.props.value === '<img>comment'), 'my edit');
  h.click('issueSaveCommentEdit'); await h.resolve(9, { error: { code: 'conflict' } }, 409);
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'my edit'));
  h.click('issueDiscardCommentConflict');
  await h.resolve(10, issueFixture); await h.resolve(11, { comments: [{ ...issueComments.comments[0], text: 'new server text', version: 2 }], complete: true, nextCursor: null }); await h.resolve(12, issueTransitions); await h.resolve(13, issueLinks); await h.resolve(14, issueFixture);
  assert.ok(h.nodes('input').some(n => n.props.value === 'other draft'));
  h.click('issueEditComment'); h.change(h.nodes('textarea').find(n => n.props.value === 'new server text'), 'retry'); h.click('issueSaveCommentEdit');
  assert.equal(JSON.parse(h.requests[15].options.body).expectedVersion, 2); h.unmount();
});

test('comment draft remains accessible and cancellable when missing from partial results', async () => {
  const h = await trackerIssueReady(); h.click('issueEditComment');
  h.change(h.nodes('textarea').find(n => n.props.value === '<img>comment'), 'recoverable text');
  h.click('issueReload'); await h.resolve(9, issueFixture); await h.resolve(10, { comments: [], complete: true, nextCursor: null }); await h.resolve(11, issueTransitions); await h.resolve(12, issueLinks); await h.resolve(13, issueFixture);
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueEditedCommentMissing'));
  assert.ok(h.nodes('textarea').some(n => n.props.value === 'recoverable text'));
  const cancel = h.nodes('button').find(n => n.props['aria-label'] === 'cancel: issueEditComment'); assert.ok(cancel); cancel.props.onClick();
  assert.ok(!h.nodes('textarea').some(n => n.props.value === 'recoverable text')); h.unmount();
});

test('silent focus retains issue and draft without loading; authorization revocation clears them', async () => {
  const h = await trackerIssueReady(); h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'private draft');
  h.window.confirmResult = false; h.click('← returnToBoards'); assert.equal(h.confirms.at(-1), 'discardDraft');
  const assertVisible = () => {
    assert.ok(h.nodes('input').some(n => n.props.value === 'private draft'));
    assert.ok(h.nodes('h3').some(n => h.text(n) === issueFixture.summary));
    assert.ok(!h.nodes('p').some(n => ['loading', 'trackerLoading', 'issueLoading'].includes(h.text(n))));
    assert.equal(h.button('issueSaveFields').props.disabled, false);
  };
  h.events.get('focus')(); assertVisible(); assert.equal(h.requests.length, 10);
  assert.equal(h.requests[9].path, 'api/dsh-board.tracker');
  await h.resolve(9, trackerSettings(1, true, { w: ['1'] })); assertVisible();
  assert.equal(JSON.parse(h.requests[10].options.body).op, 'board.read');
  await h.resolve(10, trackerBoard); assertVisible(); assert.equal(h.requests.length, 11, 'focus must not reload issue details or write');
  h.events.get('focus')(); assertVisible();
  await h.resolve(11, { error: { code: 'unauthorized' } }, 401);
  assert.ok(!h.nodes('input').some(n => n.props.value === 'private draft'));
  assert.ok(!h.nodes('h3').some(n => h.text(n) === issueFixture.summary));
  assert.ok(!h.text(h.nodes('main')[0]).includes(issueFixture.summary)); h.unmount();
});

for (const refresh of ['trackerRefreshBoard', 'trackerConnect']) test(`issue read resumes after overlapping ${refresh}`, async () => {
  const h = await trackerIssueReady();
  h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'keep this draft');
  h.click('issueReload');
  h.click(refresh);
  await h.resolve(9, { ...issueFixture, summary: 'stale read' });
  await h.resolve(10, trackerSettings(1, true, { w: ['1'] })); await h.resolve(11, trackerBoard);
  h.nodes('main');
  assert.equal(JSON.parse(h.requests[12].options.body).op, 'issue.read');
  await h.resolve(12, issueFixture); await h.resolve(13, issueComments); await h.resolve(14, issueTransitions); await h.resolve(15, issueLinks); await h.resolve(16, issueFixture);
  assert.ok(h.nodes('input').some(n => n.props.value === 'keep this draft'));
  assert.ok(!h.nodes('input').some(n => n.props.value === 'stale read'));
  assert.ok(h.nodes('button').some(n => h.text(n) === 'issueReload' && !n.props.disabled));
  h.unmount();
});

test('Tracker settings revision change discards draft even without needsReselect', async () => {
  const h = await trackerIssueReady(); h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'cross-tab secret');
  h.events.get('focus')(); await h.resolve(9, trackerSettings(2, true, { w: ['1'] })); assert.equal(h.requests.length, 10);
  assert.equal(h.nodes('aside').length, 0); assert.ok(!h.nodes('input').some(n => n.props.value === 'cross-tab secret')); h.unmount();
});

for (const op of ['issue.read', 'issue.update', 'board.read']) test(`${op} needs_reselect discards private data and revalidates settings`, async () => {
  const h = await trackerIssueReady(); h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'discard this secret');
  if (op === 'issue.read') h.click('issueReload');
  else if (op === 'issue.update') h.click('issueSaveFields');
  else { h.click('trackerRefreshBoard'); await h.resolve(9, trackerSettings(1, true, { w: ['1'] })); }
  const index = op === 'board.read' ? 10 : 9;
  assert.equal(JSON.parse(h.requests[index].options.body).op, op);
  await h.resolve(index, { error: { code: 'needs_reselect' } }, 409);
  assert.equal(h.nodes('aside').length, 0); assert.ok(!h.text(h.nodes('main')[0]).includes('<script>unsafe</script>'));
  assert.ok(!h.nodes('input').some(n => n.props.value === 'discard this secret'));
  await h.resolve(index + 1, trackerSettings(2, true, { w: ['1'] }, ['w']));
  assert.equal(h.nodes('aside').length, 0); assert.ok(!h.text(h.nodes('main')[0]).includes('<script>unsafe</script>'));
  if (op === 'issue.update') {
    h.click('trackerConnect'); await h.resolve(index + 2, trackerSettings(2, true, { w: ['1'] }, ['w']));
    h.click('trackerList'); await h.resolve(index + 3, { boards: [{ id: '1', name: 'Board' }], complete: true });
    h.click('trackerSelect'); await h.resolve(index + 4, { revision: 3, workspaceId: 'w', boardIds: ['1'] }); await h.resolve(index + 5, trackerSettings(3, true, { w: ['1'] }));
    h.click('trackerClose'); h.click('trackerRefreshBoard'); await h.resolve(index + 6, trackerSettings(3, true, { w: ['1'] })); await h.resolve(index + 7, trackerBoard);
    h.nodes('button').find(n => n.props['aria-label'] === 'issueDetails: <script>unsafe</script>').props.onClick();
    await h.resolve(index + 8, issueFixture); await h.resolve(index + 9, issueComments); await h.resolve(index + 10, issueTransitions); await h.resolve(index + 11, issueLinks); await h.resolve(index + 12, issueFixture);
    assert.ok(h.nodes('p').some(n => h.text(n) === 'issueUnknown')); h.click('edit'); assert.equal(h.button('issueSaveFields').props.disabled, true);
  }
  h.unmount();
});

test('Tracker reselect discards old principal draft and fences old reads', async () => {
  const h = await trackerIssueReady();
  h.change(h.nodes('input').find(n => n.props.value === issueFixture.summary), 'old principal private draft');
  h.click('issueReload'); // This old-principal response arrives only after reselect.
  assert.equal(JSON.parse(h.requests[9].options.body).op, 'issue.read');
  h.events.get('focus')();
  await h.resolve(10, trackerSettings(2, true, { w: ['1'] }, ['w']));
  assert.equal(h.nodes('aside').length, 0);
  assert.ok(!h.nodes('input').some(n => n.props.value === 'old principal private draft'));
  h.click('trackerConnect'); await h.resolve(11, trackerSettings(2, true, { w: ['1'] }, ['w']));
  h.click('trackerList'); await h.resolve(12, { boards: [{ id: '1', name: 'New board' }], complete: true });
  h.click('trackerSelect'); await h.resolve(13, { revision: 3, workspaceId: 'w', boardIds: ['1'] });
  await h.resolve(14, trackerSettings(3, true, { w: ['1'] }));
  h.click('trackerClose'); h.click('trackerRefreshBoard');
  await h.resolve(15, trackerSettings(3, true, { w: ['1'] }));
  const newBoard = { ...trackerBoard, issues: [{ ...trackerBoard.issues[0], summary: 'new principal title' }] };
  await h.resolve(16, newBoard);
  await h.resolve(9, issueFixture); // Must not revive the old drawer or issue data.
  assert.equal(h.nodes('aside').length, 0);
  assert.ok(!h.text(h.nodes('main')[0]).includes('<script>unsafe</script>'));
  h.nodes('button').find(n => n.props['aria-label'] === 'issueDetails: new principal title').props.onClick();
  const fresh = { ...issueFixture, summary: 'new principal title', description: 'new account description' };
  await h.resolve(17, fresh); await h.resolve(18, { comments: [], complete: true, nextCursor: null }); await h.resolve(19, issueTransitions); await h.resolve(20, issueLinks); await h.resolve(21, fresh);
  assert.ok(!h.nodes('input').some(n => n.props.value === 'old principal private draft'));
  assert.ok(!h.text(h.nodes('main')[0]).includes('<img>comment'));
  h.click('edit'); h.click('issueSaveFields'); assert.equal(h.requests.length, 22, 'discarded draft cannot be saved');
  h.unmount();
});

test('Tracker reselect retains unknown guard for in-flight issue mutation', async () => {
  const h = await trackerIssueReady();
  h.change(h.nodes('textarea')[1], 'old principal pending comment'); h.click('issueAddComment');
  h.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')();
  h.document.visibilityState = 'visible'; h.documentEvents.get('visibilitychange')();
  await h.resolveSupplementalLocal(10); await h.resolve(11, trackerSettings(2, true, { w: ['1'] }, ['w']));
  assert.equal(h.nodes('aside').length, 0);
  h.click('trackerConnect'); await h.resolve(12, trackerSettings(2, true, { w: ['1'] }, ['w']));
  h.click('trackerList'); await h.resolve(13, { boards: [{ id: '1', name: 'New board' }], complete: true });
  h.click('trackerSelect'); await h.resolve(14, { revision: 3, workspaceId: 'w', boardIds: ['1'] });
  await h.resolve(15, trackerSettings(3, true, { w: ['1'] }));
  h.click('trackerClose'); h.click('trackerRefreshBoard'); await h.resolve(16, trackerSettings(3, true, { w: ['1'] })); await h.resolve(17, trackerBoard);
  await h.resolve(9, { id: 'created' });
  h.nodes('button').find(n => n.props['aria-label'] === 'issueDetails: <script>unsafe</script>').props.onClick();
  await h.resolve(18, issueFixture); await h.resolve(19, issueComments); await h.resolve(20, issueTransitions); await h.resolve(21, issueLinks); await h.resolve(22, issueFixture);
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueUnknown'));
  h.click('edit'); assert.equal(h.button('issueSaveFields').props.disabled, true);
  assert.equal(h.nodes('textarea')[1].props.value, '');
  h.unmount();
});

test('Tracker session links use immutable issue ID and explicit revisioned write', async () => {
  const h = await trackerIssueReady();
  const ws = h.ws.getSnapshot(); h.ws.set({ ...ws, items: ws.items.map(item => ({ ...item, sessionIds: ['session-1', 'session-2'] })) });
  // Select an already-linked session to unlink, and do not mutate on selection.
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'session-1')), 'session-1');
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'unlink')), 'unlink');
  assert.equal(h.requests.length, 9); h.click('issueLinkSave');
  assert.deepEqual(JSON.parse(h.requests[9].options.body), { op: 'links.set', workspaceId: 'w', boardId: '1', issueKey: 'A-1', issueId: 'issue-1', sessionId: 'session-1', linked: false, expectedRevision: 1 });
  assert.equal(h.button('issueLinkSave').props.disabled, true); h.unmount();
});

test('Tracker whales join only matching immutable issue IDs', async () => {
  const h = harness({ manualTracker: true, ids: ['session-1'] }); h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
  h.tile('tracker #1 — Workspace — tracker').props.onClick(); await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, trackerBoard);
  h.nodes('main'); const run = [...h.timeouts][0]; assert.ok(run); run(); await settle();
  await h.resolve(4, { revision: 1, incomplete: true, links: [{ issueKey: 'A-1', issueId: 'old-issue', sessionId: 'session-1' }] });
  assert.ok(!h.nodes('button').some(n => n.props['aria-label'] === 'openSession: <script>unsafe</script>'));
  assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'columnSessions: Open — 0'));
  h.click('trackerRefreshBoard'); await h.resolve(5, trackerSettings(1, true, { w: ['1'] })); await h.resolve(6, trackerBoard); h.nodes('main'); [...h.timeouts][0](); await settle();
  await h.resolve(7, issueLinks); const whale = h.nodes('button').find(n => n.props['aria-label'] === 'openSession: <script>unsafe</script>'); assert.ok(whale); whale.props.onClick(); assert.deepEqual(h.openedSessions, ['session-1']);
  whale.props.onClick({ ctrlKey: true }); whale.props.onClick({ metaKey: true }); whale.props.onAuxClick(middle);
  assert.equal(h.openedTabs.length, 3); assert.ok(h.openedTabs.every(([url]) => url === 'http://localhost/app/#dsh-board-session-v1:w:session-1'));
  h.panelInfo.set({ activePanelId: null }); whale.props.onClick(); whale.props.onClick({ ctrlKey: true }); assert.deepEqual(h.openedSessions, ['session-1']); assert.equal(h.openedTabs.length, 3); h.unmount();
});

test('Tracker multiple-session menu honors modified activation and stale membership', async () => {
  const h = harness({ manualTracker: true, ids: ['one', 'two', 'archived'], archived: ['archived'] }); h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
  h.tile('tracker #1 — Workspace — tracker').props.onClick(); await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, trackerBoard);
  h.nodes('main'); [...h.timeouts][0](); await settle();
  await h.resolve(4, { revision: 1, incomplete: true, links: ['one', 'two', 'archived'].map(sessionId => ({ issueKey: 'A-1', issueId: 'issue-1', sessionId })) });
  const trigger = () => h.nodes('button').find(n => n.props['aria-label'] === 'sessionMenu: <script>unsafe</script>');
  trigger().props.onClick(); let items = h.nodes('button').filter(n => n.props.role === 'menuitem');
  items[2].props.onClick({ ctrlKey: true }); assert.equal(h.openedTabs.length, 0);
  items[1].props.onClick({ metaKey: true }); assert.equal(h.openedTabs[0][0], 'http://localhost/app/#dsh-board-session-v1:w:two');
  trigger().props.onClick(); items = h.nodes('button').filter(n => n.props.role === 'menuitem'); items[0].props.onAuxClick(middle); assert.equal(h.openedTabs.length, 2);
  trigger().props.onClick(); items = h.nodes('button').filter(n => n.props.role === 'menuitem');
  h.ws.set({ ...h.ws.getSnapshot(), items: [{ workspaceId: 'w', sessionIds: [] }] }); items[0].props.onClick({ ctrlKey: true }); assert.equal(h.openedTabs.length, 2);
  assert.deepEqual(h.openedSessions, []); h.unmount();
});

test('Tracker unknown result remains blocked after drawer close and reopen', async () => {
  const h = await trackerIssueReady(); h.change(h.nodes('textarea')[1], 'uncertain comment'); h.click('issueAddComment');
  h.requests[9].reject(new Error('offline')); await settle(); h.click('close');
  h.nodes('button').find(n => n.props['aria-label'] === 'issueDetails: <script>unsafe</script>').props.onClick();
  await h.resolve(10, issueFixture); await h.resolve(11, issueComments); await h.resolve(12, issueTransitions); await h.resolve(13, issueLinks); await h.resolve(14, issueFixture);
  assert.ok(h.nodes('p').some(n => h.text(n) === 'issueUnknown')); h.click('edit'); assert.equal(h.button('issueSaveFields').props.disabled, true); h.unmount();
});

test('Tracker configuration, explicit workspace selection, and read-only partial board', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  h.click('trackerConnect'); assert.equal(h.requests[1].path, 'api/dsh-board.tracker');
  await h.resolve(1, trackerSettings());
  assert.equal(h.nodes('input').length, 0, 'no credential or organization ID inputs');
  h.click('trackerConfiguring'); assert.deepEqual(JSON.parse(h.requests[2].options.body), { op: 'configuration.configure', expectedRevision: 0, orgType: 'cloud' });
  await h.resolve(2, trackerSettings(1, true));
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w');
  h.click('trackerList'); assert.deepEqual(JSON.parse(h.requests[3].options.body), { op: 'boards.list' });
  await h.resolve(3, { boards: [{ id: '1', name: 'External' }, { id: '2', name: 'Other' }], complete: false, reason: 'page_limit' });
  assert.ok(h.nodes('p').some(n => h.text(n) === 'trackerListPartial'));
  const checks = h.nodes('input').filter(n => n.props.type === 'checkbox'); assert.equal(checks.length, 2); assert.equal(checks[0].props.checked, false);
  checks[0].props.onChange({ target: { checked: true } });
  checks[1].props.onChange({ target: { checked: true } });
  h.click('trackerSelect'); assert.deepEqual(JSON.parse(h.requests[4].options.body), { op: 'workspace.select', expectedRevision: 1, workspaceId: 'w', boardIds: ['1', '2'] });
  await h.resolve(4, { revision: 2, workspaceId: 'w', boardIds: ['1', '2'] });
  assert.equal(h.requests[5].path, 'api/dsh-board.tracker'); await h.resolve(5, trackerSettings(2, true, { w: ['1', '2'] }));
  h.click('trackerClose'); h.tile('tracker #1 — Workspace — tracker').props.onClick();
  await h.resolve(6, trackerSettings(2, true, { w: ['1', '2'] }));
  assert.deepEqual(JSON.parse(h.requests[7].options.body), { op: 'board.read', workspaceId: 'w', boardId: '1', issueKeys: [] });
  await h.resolve(7, trackerBoard);
  const columns = h.nodes('section').filter(n => n.props.className === 'dsh-board-column');
  assert.deepEqual(columns.map(n => n.props['aria-label']), ['Open', 'Shared', 'Doing', 'Unknown']);
  assert.ok(h.text(columns[0]).includes('<script>unsafe</script>'));
  assert.ok(h.text(columns[1]).includes('Ambiguous'), 'shared status appears once even in multiple source columns');
  assert.ok(!h.text(columns[2]).includes('Ambiguous') && !h.text(columns[2]).includes('Unknown'), 'configured Doing status remains empty');
  assert.ok(h.text(columns[3]).includes('Unknown'), 'status absent from configuration uses its actual identity');
  assert.equal(h.nodes('article').length, 3, 'ambiguous statuses never duplicate issues');
  assert.ok(h.nodes('p').some(n => h.text(n).includes('trackerPartial')));
  assert.ok(!h.nodes('button').some(n => ['addTask', 'addStatus', 'linkCurrent'].includes(h.text(n))));
  assert.ok(h.nodes('h2').some(n => h.text(n) === '<img src=x onerror=alert(1)>'));
  const anchors = h.nodes('a'); assert.equal(anchors.length, 3);
  for (const a of anchors) { assert.equal(a.props.href, `https://tracker.yandex.ru/${h.text(a)}`); assert.equal(a.props.target, '_blank'); assert.equal(a.props.rel, 'noopener noreferrer'); }
  const region = h.nodes('div').find(n => n.props.className === 'dsh-board-kanban'); assert.equal(region.props.tabIndex, 0); assert.equal(region.props['aria-label'], 'scrollBoard');
  assert.ok(!h.nodes('script').length); assert.ok(!h.nodes('img').length);
  assert.ok(h.requests.slice(1).every(r => !JSON.stringify(r.options).includes('orgId') && !JSON.stringify(r.options).includes('token')));
  h.unmount();
});

test('Tracker groups by status identity even when labels collide or issue display changes', async () => {
  const h = harness({ manualTracker: true });
  const first = { id: 'first', key: 'first', display: 'Same' };
  const second = { id: 'second', key: 'second', display: 'Same' };
  const missing = { id: 'missing', key: 'missing', display: 'Same' };
  const board = { ...trackerBoard, columns: [{ id: 'source', name: 'Not a status', statuses: [first, second] }], issues: [
    { key: 'X-1', summary: 'First item', status: { ...first, display: 'Changed on issue' } },
    { key: 'X-2', summary: 'Second item', status: second },
    { key: 'X-3', summary: 'Absent item', status: missing },
  ] };
  try {
    h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
    h.tile('tracker #1 — Workspace — tracker').props.onClick(); await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, board);
    const columns = h.nodes('section').filter(n => n.props.className === 'dsh-board-column');
    assert.deepEqual(columns.map(n => n.props['aria-label']), ['Same (first)', 'Same (second)', 'Same (missing)']);
    assert.deepEqual(columns.map(n => n.props.key), ['first', 'second', 'missing']);
    for (const [index, title] of ['First item', 'Second item', 'Absent item'].entries()) {
      assert.ok(h.text(columns[index]).includes(title));
      assert.equal(columns.filter(column => h.text(column).includes(title)).length, 1);
    }
    assert.equal(h.nodes('article').length, 3);
  } finally { h.unmount(); }
});

test('Tracker renders configured and issue-only statuses rather than source columns', async () => {
  const h = harness({ manualTracker: true });
  const first = { id: 'one', key: 'one', display: 'First' };
  const second = { id: 'two', key: 'two', display: 'Second' };
  const empty = { id: 'empty', key: 'empty', display: 'Empty' };
  const observed = { id: 'observed', key: 'observed', display: 'Observed' };
  const board = { ...trackerBoard, columns: [
    { id: 'c1', name: 'Source column', statuses: [first, second] },
    { id: 'c2', name: 'Other column', statuses: [empty] },
  ], issues: [
    { key: 'X-1', summary: 'First issue', status: first },
    { key: 'X-2', summary: 'Second issue', status: second },
    { key: 'X-3', summary: 'Observed issue', status: observed },
  ] };
  try {
    h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
    h.tile('tracker #1 — Workspace — tracker').props.onClick(); await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, board);
    const lanes = h.nodes('section').filter(n => n.props.className === 'dsh-board-column');
    assert.deepEqual(lanes.map(n => n.props['aria-label']), ['First', 'Second', 'Empty', 'Observed']);
    assert.deepEqual(lanes.map(n => n.props.key), ['one', 'two', 'empty', 'observed']);
    for (const [index, title] of [[0, 'First issue'], [1, 'Second issue'], [3, 'Observed issue']]) {
      assert.ok(h.text(lanes[index]).includes(title));
      assert.equal(lanes.filter(lane => h.text(lane).includes(title)).length, 1);
    }
    assert.ok(!h.text(lanes[2]).includes('issue'));
    assert.equal(h.nodes('article').length, 3);
    assert.ok(!h.nodes('p').some(n => ['trackerStatusPartial', 'trackerError'].includes(h.text(n))));
  } finally { h.unmount(); }
});

test('Tracker disambiguates labels that collide after key suffixes are added', async () => {
  const h = harness({ manualTracker: true });
  const a = { id: 'id-a', key: 'a', display: 'Same' };
  const b = { id: 'id-b', key: 'b', display: 'Same' };
  const variant = { id: 'id-c', key: 'c', display: 'Same (a)' };
  const board = { ...trackerBoard, columns: [{ id: 'source', name: 'Source', statuses: [a, b, variant] }], issues: [
    { key: 'X-1', summary: 'Issue A', status: a },
    { key: 'X-2', summary: 'Issue B', status: b },
    { key: 'X-3', summary: 'Issue C', status: variant },
  ] };
  try {
    h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
    h.tile('tracker #1 — Workspace — tracker').props.onClick(); await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, board);
    const lanes = h.nodes('section').filter(n => n.props.className === 'dsh-board-column');
    const labels = lanes.map(n => n.props['aria-label']);
    assert.deepEqual(labels, ['Same (a) [id-a]', 'Same (b)', 'Same (a) [id-c]']);
    assert.equal(new Set(labels).size, 3);
    assert.deepEqual(lanes.map(n => n.props.key), ['id-a', 'id-b', 'id-c']);
    for (const [index, title] of ['Issue A', 'Issue B', 'Issue C'].entries()) assert.ok(h.text(lanes[index]).includes(title));
  } finally { h.unmount(); }
});

test('Tracker oversized configured associations fall back to actual issue statuses and fail closed on conflicting issue identities', async () => {
  const configured = { id: 'configured', key: 'configured', display: 'Configured' };
  const observed = { id: 'observed', key: 'observed', display: 'Observed' };
  // Each column stays within schema limits while the 5,500 associations exceed the grouping cap.
  const columns = Array.from({ length: 11 }, (_, index) => ({ id: `c${index}`, name: `Column ${index}`, statuses: Array(500).fill(configured) }));
  for (const conflicting of [false, true]) {
    const h = harness({ manualTracker: true });
    const issues = [{ key: 'X-1', summary: 'Observed issue', status: observed }];
    if (conflicting) issues.push({ key: 'X-2', summary: 'Conflicting issue', status: { ...observed, id: 'other' } });
    try {
      h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
      h.tile('tracker #1 — Workspace — tracker').props.onClick(); await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, { ...trackerBoard, columns, issues });
      const lanes = h.nodes('section').filter(n => n.props.className === 'dsh-board-column');
      const alerts = h.nodes('p').filter(n => n.props.role === 'alert').map(n => h.text(n));
      if (conflicting) {
        assert.deepEqual(lanes, []); assert.equal(h.nodes('article').length, 0);
        assert.ok(alerts.includes('trackerError')); assert.ok(!alerts.includes('trackerStatusPartial'));
      } else {
        assert.deepEqual(lanes.map(n => n.props['aria-label']), ['Observed']);
        assert.equal(lanes[0].props.key, 'observed'); assert.ok(h.text(lanes[0]).includes('Observed issue'));
        assert.equal(h.nodes('article').length, 1); assert.ok(alerts.includes('trackerStatusPartial'));
      }
    } finally { h.unmount(); }
  }
});

test('Tracker linked filter stays clearable when board links become unavailable', async () => {
  const h = harness({ manualTracker: true, ids: ['session-1'] });
  try {
    h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
    h.tile('tracker #1 — Workspace — tracker').props.onClick(); await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, trackerBoard);
    h.nodes('main'); const loadLinks = [...h.timeouts][0]; assert.ok(loadLinks); loadLinks(); await settle();
    assert.equal(JSON.parse(h.requests[4].options.body).op, 'links.read'); await h.resolve(4, issueLinks);
    h.button('columnSessions: Open — 1').props.onClick();
    assert.equal(h.button('columnSessions: Open — 1').props['aria-pressed'], true);
    assert.ok(h.nodes('p').some(n => h.text(n).includes('withSession')));
    h.click('trackerRefreshBoard'); await h.resolve(5, trackerSettings(1, true, { w: ['1'] })); await h.resolve(6, trackerBoard);
    h.nodes('main'); const reloadLinks = [...h.timeouts][0]; assert.ok(reloadLinks); reloadLinks(); await settle();
    assert.equal(JSON.parse(h.requests[7].options.body).op, 'links.read'); await h.resolve(7, { error: { code: 'unavailable' } }, 503);
    assert.ok(h.nodes('p').some(n => n.props.role === 'status' && h.text(n).includes('sessionFilterUnavailable')));
    assert.ok(!h.nodes('p').some(n => h.text(n) === 'noResults'));
    assert.equal(h.nodes('article').length, 0);
    assert.equal(h.button('clearSessionFilter').props.disabled, undefined);
    h.nodes('main'); assert.ok(h.button('clearSessionFilter'), 'clear control persists across renders');
    h.click('clearSessionFilter');
    assert.equal(h.nodes('article').length, 3);
    assert.ok(!h.nodes('button').some(n => h.text(n) === 'clearSessionFilter'));
    assert.ok(!h.nodes('p').some(n => h.text(n) === 'noResults'));
  } finally { h.unmount(); }
});

test('restart requires fresh list and explicit reselection; stale listing never authorizes view', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base()); h.click('trackerConnect');
  await h.resolve(1, trackerSettings(4, true, { w: ['1'] }, ['w']));
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w');
  assert.ok(h.nodes('p').some(n => h.text(n) === 'trackerReselect'));
  assert.equal(h.nodes('button').filter(n => n.props.className === 'dsh-board-tile').length, 1);
  h.click('trackerList'); await h.resolve(2, { boards: [{ id: '1', name: 'External' }], complete: true, reason: null });
  assert.equal(h.nodes('input').find(n => n.props.type === 'checkbox').props.checked, true);
  h.click('trackerSelect'); assert.deepEqual(h.confirms, ['trackerConfirmSelection—']);
  await h.resolve(3, { error: { code: 'board_list_required' } }, 409);
  assert.ok(h.nodes('div').some(n => n.props.role === 'alert' && h.text(n) === 'trackerListRequired'));
  assert.equal(h.nodes('button').filter(n => n.props.className === 'dsh-board-tile').length, 1);
  await h.resolve(4, trackerSettings(4, true, { w: ['1'] }, ['w']));
  assert.equal(h.nodes('input').filter(n => n.props.type === 'checkbox').length, 0); h.unmount();
});

test('Tracker service failure is isolated and local drafts survive settings', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base()); await h.choose(); h.editDraft(); h.click('trackerConnect'); await h.resolve(1, { error: { code: 'unavailable' } }, 503);
  assert.ok(h.nodes('div').some(n => n.props.role === 'alert' && h.text(n) === 'trackerError'));
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ');
  h.submit(); assert.equal(h.requests[2].path, 'api/dsh-board.mutate');
  h.unmount();
});

test('Tracker cache is cleared on unmount and delayed settings from earlier mount are ignored', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  h.unmount(); h.mount();
  assert.equal(h.requests[2].path, 'api/dsh-board'); assert.equal(h.requests[3].path, 'api/dsh-board.tracker');
  await h.resolve(1, trackerSettings(8, true, { w: ['1'] }, []));
  assert.ok(!h.nodes('button').some(n => n.props['aria-label']?.includes('tracker #1')));
  await h.resolve(2, base()); await h.resolve(3, trackerSettings(0, false));
  assert.ok(!h.nodes('button').some(n => n.props['aria-label']?.includes('tracker #1'))); h.unmount();
});

test('disconnect immediately removes private Tracker content and fences late board response', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  await h.resolve(1, trackerSettings(1, true, { w: ['1'] }, []));
  h.tile('tracker #1 — Workspace — tracker').props.onClick();
  h.generation.set(undefined);
  assert.ok(!h.nodes('h2').some(n => h.text(n).includes('tracker #1')));
  await h.resolve(2, trackerBoard);
  assert.equal(h.nodes('article').length, 0);
  h.generation.set({ id: 2, host: { home: '/' } }); h.nodes('main');
  assert.equal(h.requests[3].path, 'api/dsh-board.tracker');
  await h.resolve(3, trackerSettings(2, true, { w: ['1'] }, ['w']));
  assert.equal(h.nodes('article').length, 0); assert.ok(!h.nodes('h2').some(n => h.text(n).includes('tracker #1'))); h.unmount();
});

test('late Tracker errors after workspace switch do not affect another workspace', async () => {
  const h = harness({ manualTracker: true, workspaces: [{ workspaceId: 'w', title: 'One', sessionIds: [] }, { workspaceId: 'w2', title: 'Two', sessionIds: [] }] });
  h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'], w2: ['2'] }, []));
  h.tile('tracker #1 — One — tracker').props.onClick();
  await h.resolve(2, trackerSettings(1, true, { w: ['1'], w2: ['2'] }, []));
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w2')), 'w2');
  await h.resolve(3, { error: { code: 'needs_reselect' } }, 409);
  assert.ok(!h.nodes('div').some(n => n.props.role === 'alert' && h.text(n) === 'trackerReselect'));
  assert.ok(!h.nodes('button').some(n => n.props['aria-label']?.includes('tracker #2'))); h.unmount();
});

test('partial listing retains present saved boards and confirms exact missing IDs before removal', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  await h.resolve(1, trackerSettings(4, true, { w: ['1', '2'] }, ['w']));
  h.click('trackerConnect'); await h.resolve(2, trackerSettings(4, true, { w: ['1', '2'] }, ['w']));
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w'); h.click('trackerList');
  await h.resolve(3, { boards: [{ id: '1', name: 'A' }, { id: '3', name: 'C' }], complete: false, reason: 'page_limit' });
  const checks = h.nodes('input').filter(n => n.props.type === 'checkbox');
  assert.equal(checks[0].props.checked, true); assert.equal(checks[1].props.checked, false);
  checks[1].props.onChange({ target: { checked: true } }); h.window.confirmResult = false;
  h.click('trackerSelect'); assert.equal(h.requests.length, 4); assert.equal(h.confirms[0], 'trackerConfirmSelection2');
  h.window.confirmResult = true; h.click('trackerSelect');
  assert.deepEqual(JSON.parse(h.requests[4].options.body).boardIds, ['1', '3']); h.unmount();
});

test('focus and TTL silently refresh cached board and clear it on revoked selection', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  await h.resolve(1, trackerSettings(1, true, { w: ['1'] }, []));
  h.tile('tracker #1 — Workspace — tracker').props.onClick();
  await h.resolve(2, trackerSettings(1, true, { w: ['1'] }, [])); await h.resolve(3, trackerBoard);
  assert.equal(h.nodes('article').length, 3);
  h.events.get('focus')(); assert.equal(h.nodes('article').length, 3);
  await h.resolve(4, trackerSettings(1, true, { w: ['1'] }, []));
  assert.equal(h.nodes('article').length, 3); await h.resolve(5, trackerBoard);
  assert.equal(h.nodes('article').length, 3);
  [...h.timers][1](); assert.equal(h.nodes('article').length, 3);
  await h.resolve(6, trackerSettings(1, true, { w: ['1'] }, ['w']));
  assert.equal(h.nodes('article').length, 0); assert.equal(h.requests.length, 7);
  h.unmount(); assert.equal(h.timers.size, 0);
});

test('workspace recreation immediately conceals Tracker board while fresh settings are checked', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  await h.resolve(1, trackerSettings(1, true, { w: ['1'] }, []));
  h.tile('tracker #1 — Workspace — tracker').props.onClick();
  await h.resolve(2, trackerSettings(1, true, { w: ['1'] }, [])); await h.resolve(3, trackerBoard);
  h.ws.set({ phase: 'ready', state: 'ready', items: [{ workspaceId: 'w', title: 'Workspace', sessionIds: [], createdAt: '2027-01-01' }], archivedSessionIds: [] });
  assert.equal(h.nodes('article').length, 0);
  await h.resolve(4, trackerSettings(1, true, { w: ['1'] }, ['w']));
  assert.equal(h.nodes('article').length, 0); h.unmount();
});

test('selection timeout after workspace switch invalidates and rereads profile revision', async () => {
  const h = harness({ manualTracker: true, workspaces: [{ workspaceId: 'w', title: 'One', sessionIds: [] }, { workspaceId: 'w2', title: 'Two', sessionIds: [] }] });
  h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true));
  h.click('trackerConnect'); await h.resolve(2, trackerSettings(1, true));
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w'); h.click('trackerList');
  await h.resolve(3, { boards: [{ id: '1', name: 'A' }], complete: true, reason: null });
  h.nodes('input').find(n => n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); h.click('trackerSelect');
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w2')), 'w2');
  h.requests[4].reject(new Error('timeout')); await settle();
  assert.equal(h.requests[5].path, 'api/dsh-board.tracker');
  assert.ok(h.nodes('div').some(n => n.props.role === 'alert' && h.text(n) === 'trackerUncertain'));
  await h.resolve(5, trackerSettings(2, true, { w: ['1'] }, []));
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w');
  h.tile('tracker #1 — One — tracker'); h.unmount();
});

test('empty Tracker issue result remains partial and never presents a confirmed empty board', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base()); h.click('trackerConnect');
  await h.resolve(1, trackerSettings(1, true, { w: ['1'] }, [])); h.click('trackerClose');
  h.tile('tracker #1 — Workspace — tracker').props.onClick();
  await h.resolve(2, trackerSettings(1, true, { w: ['1'] }, []));
  await h.resolve(3, { ...trackerBoard, issues: [] });
  assert.ok(h.nodes('p').some(n => h.text(n) === 'trackerEmpty'));
  assert.ok(h.nodes('p').some(n => h.text(n).includes('trackerPartial')));
  assert.ok(!h.nodes('p').some(n => h.text(n) === 'noTasks')); h.unmount();
});

test('foreground refresh coalesces events, fences hidden results and clears on panel switch', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
  h.tile('tracker #1 — Workspace — tracker').props.onClick();
  await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, trackerBoard);
  assert.equal(h.nodes('article').length, 3);
  [...h.timers][1](); h.events.get('focus')();
  assert.equal(h.requests.length, 5); assert.equal(h.nodes('article').length, 3);
  h.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')();
  await h.resolve(4, trackerSettings(1, true, { w: ['1'] }));
  assert.equal(h.requests.length, 5); assert.equal(h.nodes('article').length, 0);
  [...h.timers][1](); assert.equal(h.requests.length, 5);
  h.document.visibilityState = 'visible'; h.documentEvents.get('visibilitychange')();
  assert.equal(h.requests.length, 7); await h.resolveSupplementalLocal(5); await h.resolve(6, trackerSettings(1, true, { w: ['1'] }));
  assert.equal(h.requests.length, 8); h.panelInfo.set({ activePanelId: null });
  await h.resolve(7, trackerBoard); assert.equal(h.nodes('article').length, 0);
  [...h.timers][1](); assert.equal(h.requests.length, 8);
  h.panelInfo.set({ activePanelId: 'dsh-board' }); assert.equal(h.requests.length, 10);
  await h.resolveSupplementalLocal(8); await h.resolve(9, trackerSettings(1, true, { w: ['1'] })); await h.resolve(10, trackerBoard);
  assert.equal(h.nodes('article').length, 3);
  assert.ok(h.nodes('p').some(n => h.text(n).includes('trackerUpdatedAt')));
  h.unmount(); assert.equal(h.timers.size, 0);
});

test('refresh preserves picker IDs but requires relist and explicit review', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
  h.tile('tracker #1 — Workspace — tracker').props.onClick();
  await h.resolve(2, trackerSettings(1, true, { w: ['1'] })); await h.resolve(3, trackerBoard);
  h.click('trackerConnect'); await h.resolve(4, trackerSettings(1, true, { w: ['1'] })); await h.resolve(5, trackerBoard);
  h.click('trackerList'); await h.resolve(6, { boards: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }], complete: true });
  h.nodes('input').filter(n => n.props.type === 'checkbox')[1].props.onChange({ target: { checked: true } });
  h.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')();
  assert.equal(h.nodes('input').filter(n => n.props.type === 'checkbox').length, 0);
  h.document.visibilityState = 'visible'; h.documentEvents.get('visibilitychange')();
  await h.resolveSupplementalLocal(7); await h.resolve(8, trackerSettings(1, true, { w: ['1'] })); await h.resolve(9, trackerBoard);
  h.click('trackerList'); await h.resolve(10, { boards: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }], complete: true });
  const checks = h.nodes('input').filter(n => n.props.type === 'checkbox');
  assert.equal(checks[0].props.checked, true); assert.equal(checks[1].props.checked, true);
  assert.equal(h.button('trackerSelect').props.disabled, true);
  checks[2].props.onChange({ target: { checked: true } }); h.click('trackerSelect');
  assert.deepEqual(JSON.parse(h.requests[11].options.body).boardIds, ['1', '2']); h.unmount();
});

test('selection receipt clears old picker draft before the next list', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  await h.resolve(1, trackerSettings(1, true, { w: ['1'] })); h.click('trackerConnect');
  await h.resolve(2, trackerSettings(1, true, { w: ['1'] }));
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w');
  const listing = { boards: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }], complete: true };
  h.click('trackerList'); await h.resolve(3, listing);
  h.nodes('input').filter(n => n.props.type === 'checkbox')[1].props.onChange({ target: { checked: true } });
  h.click('trackerSelect'); await h.resolve(4, { revision: 2, workspaceId: 'w', boardIds: ['1', '2'] });
  await h.resolve(5, trackerSettings(2, true, { w: ['1', '2'] }));
  h.click('trackerList'); await h.resolve(6, listing);
  const checks = h.nodes('input').filter(n => n.props.type === 'checkbox');
  assert.equal(checks.length, 2); assert.ok(checks.every(n => n.props.checked)); h.unmount();
});

test('workspace change asks before discarding picker selection', async () => {
  const h = harness({ manualTracker: true, workspaces: [{ workspaceId: 'w', title: 'One', sessionIds: [] }, { workspaceId: 'w2', title: 'Two', sessionIds: [] }] });
  h.mount(); await h.resolve(0, base()); await h.resolve(1, trackerSettings(1, true, { w: ['1'] }));
  h.click('trackerConnect'); await h.resolve(2, trackerSettings(1, true, { w: ['1'] }));
  const workspace = () => h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w2'));
  h.change(workspace(), 'w'); h.click('trackerList'); await h.resolve(3, { boards: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }], complete: true });
  h.nodes('input').filter(n => n.props.type === 'checkbox')[1].props.onChange({ target: { checked: true } });
  h.window.confirmResult = false; h.change(workspace(), 'w2');
  assert.equal(workspace().props.value, 'w'); assert.equal(h.nodes('input').filter(n => n.props.type === 'checkbox')[1].props.checked, true);
  h.window.confirmResult = true; h.change(workspace(), 'w2'); assert.equal(workspace().props.value, 'w2'); h.unmount();
});
test('card whale opens only current member links and rechecks live state', async () => {
  const h = harness({ ids: ['one', 'foreign'], workspaces: [{ workspaceId: 'w', title: 'Workspace', sessionIds: ['one'] }] });
  const snapshot = base(); snapshot.boards[0].tasks.push({ id: 'no', title: 'No link', statusId: 's' }, { id: 'foreign', title: 'Foreign link', statusId: 's' });
  snapshot.links = [{ boardId: 'b', taskId: 't', sessionId: 'one' }, { boardId: 'b', taskId: 'foreign', sessionId: 'foreign' }];
  h.mount(); await h.resolve(0, snapshot); await h.choose();
  let whales = h.nodes('button').filter(n => n.props.className === 'dsh-board-whale-button' && n.props['aria-label'].startsWith('openSession:'));
  assert.equal(whales.length, 1); assert.equal(whales[0].props['aria-label'], 'openSession: Existing');
  const icon = whales[0].children[0]; assert.equal(icon.type, 'img'); assert.equal(icon.props.src, './favicon.svg'); assert.equal(icon.props.alt, '');
  const open = whales[0].props.onClick; open(); assert.deepEqual(h.openedSessions, ['one']);
  h.ws.set({ ...h.ws.getSnapshot(), items: [{ workspaceId: 'w', title: 'Workspace', sessionIds: [] }] }); open(); assert.deepEqual(h.openedSessions, ['one']);
  assert.equal(h.nodes('button').filter(n => n.props['aria-label'] === 'openSession: Existing').length, 0); h.unmount();
});

test('multiple member sessions expose keyboard menu with full IDs and unavailable states', async () => {
  const h = harness({ ids: ['one', 'two', 'archived'], archived: ['archived'], byId: { one: { title: 'Same' }, two: { title: 'Same' } }, workspaces: [{ workspaceId: 'w', title: 'Workspace', sessionIds: ['one', 'two', 'archived', 'missing'] }] });
  const snapshot = base(); snapshot.links = ['one', 'two', 'archived', 'missing'].map(sessionId => ({ boardId: 'b', taskId: 't', sessionId }));
  h.mount(); await h.resolve(0, snapshot); await h.choose();
  let trigger = h.nodes('button').find(n => n.props['aria-label'] === 'sessionMenu: Existing');
  assert.equal(trigger.props['aria-haspopup'], 'menu'); assert.equal(trigger.props['aria-expanded'], false); trigger.props.onClick();
  trigger = h.nodes('button').find(n => n.props['aria-label'] === 'sessionMenu: Existing'); assert.equal(trigger.props['aria-expanded'], true);
  const menu = h.nodes('div').find(n => n.props.role === 'menu'); assert.ok(menu); assert.equal(menu.props.id, trigger.props['aria-controls']);
  const items = h.nodes('button').filter(n => n.props.role === 'menuitem'); assert.equal(items.length, 4);
  assert.equal(h.text(items[0]), 'Same (one)'); assert.equal(h.text(items[1]), 'Same (two)');
  assert.equal(h.text(items[2]), 'archived — sessionArchived'); assert.equal(items[2].props['aria-disabled'], true);
  assert.equal(h.text(items[3]), 'missing — sessionUnavailable'); assert.equal(items[3].props['aria-disabled'], true);
  items[2].props.onClick(); items[3].props.onClick(); assert.deepEqual(h.openedSessions, []);
  items[1].props.onClick(); assert.deepEqual(h.openedSessions, ['two']); assert.equal(h.nodes('div').filter(n => n.props.role === 'menu').length, 0); h.unmount();
});

const fragmentUrl = (workspace = 'w', session = 'one') => `http://localhost/app/?launch=secret#dsh-board-session-v1:${encodeURIComponent(workspace)}:${encodeURIComponent(session)}`;
const middle = { button: 1, preventDefault() {} };

test('local whale and menu synchronously open sanitized tabs without changing current selection', async () => {
  const h = harness({ ids: ['one', 'two', 'archived'], archived: ['archived'], url: 'http://localhost/app/?launch=secret#old', baseURI: 'http://localhost/app/?launch=secret#old' });
  const snapshot = base(); snapshot.links = [{ boardId: 'b', taskId: 't', sessionId: 'one' }];
  h.mount(); await h.resolve(0, snapshot); await h.choose();
  const whale = h.nodes('button').find(n => n.props['aria-label'] === 'openSession: Existing');
  whale.props.onClick({ ctrlKey: true }); whale.props.onClick({ metaKey: true }); whale.props.onAuxClick(middle);
  assert.equal(h.openedTabs.length, 3); assert.deepEqual(h.openedSessions, []);
  for (const [url, target, features] of h.openedTabs) {
    assert.equal(url, 'http://localhost/app/#dsh-board-session-v1:w:one'); assert.equal(target, '_blank'); assert.equal(features, 'noopener,noreferrer');
  }
  whale.props.onClick({}); assert.deepEqual(h.openedSessions, ['one']);
  h.ws.set({ ...h.ws.getSnapshot(), archivedSessionIds: ['one'] }); whale.props.onClick({ ctrlKey: true }); assert.equal(h.openedTabs.length, 3);
  h.unmount();

  const multi = harness({ ids: ['one', 'two', 'archived'], archived: ['archived'] });
  const two = base(); two.links = ['one', 'two', 'archived'].map(sessionId => ({ boardId: 'b', taskId: 't', sessionId }));
  multi.mount(); await multi.resolve(0, two); await multi.choose();
  multi.nodes('button').find(n => n.props['aria-label'] === 'sessionMenu: Existing').props.onClick({ ctrlKey: true });
  let items = multi.nodes('button').filter(n => n.props.role === 'menuitem');
  items[2].props.onClick({ ctrlKey: true }); assert.equal(multi.openedTabs.length, 0);
  items[1].props.onClick({ metaKey: true }); assert.equal(multi.openedTabs[0][0], 'http://localhost/app/#dsh-board-session-v1:w:two');
  multi.nodes('button').find(n => n.props['aria-label'] === 'sessionMenu: Existing').props.onClick();
  items = multi.nodes('button').filter(n => n.props.role === 'menuitem'); items[0].props.onAuxClick(middle);
  assert.equal(multi.openedTabs[1][0], 'http://localhost/app/#dsh-board-session-v1:w:one'); assert.deepEqual(multi.openedSessions, []); multi.unmount();
});

test('handoff rejects hostile bases, invalid ids, and stale relations at activation', async () => {
  for (const baseURI of ['https://evil.example/?token=secret', 'javascript:alert(1)', 'http://user:pass@localhost/app/']) {
    const h = harness({ ids: ['one'], baseURI }); const snapshot = base(); snapshot.links = [{ boardId: 'b', taskId: 't', sessionId: 'one' }];
    h.mount(); await h.resolve(0, snapshot); await h.choose(); h.nodes('button').find(n => n.props['aria-label'] === 'openSession: Existing').props.onClick({ ctrlKey: true });
    assert.deepEqual(h.openedTabs, []); assert.deepEqual(h.openedSessions, []); h.unmount();
  }
  const id = 'bad\u202eid'; const h = harness({ ids: [id] }); const snapshot = base(); snapshot.links = [{ boardId: 'b', taskId: 't', sessionId: id }];
  h.mount(); await h.resolve(0, snapshot); await h.choose(); const whale = h.nodes('button').find(n => n.props['aria-label'] === 'openSession: Existing');
  whale.props.onClick({ ctrlKey: true }); assert.deepEqual(h.openedTabs, []); h.unmount();
});

test('destination consumes fragment once, awaits catalogs and opens exact member', async () => {
  const h = harness({ url: fragmentUrl(), ids: ['one'], wsPhase: 'pending', sessionsPhase: 'pending' });
  assert.equal(h.window.location.href, 'http://localhost/app/'); assert.deepEqual(h.openedSessions, []);
  h.ws.set({ ...h.ws.getSnapshot(), phase: 'ready' }); await settle(); assert.deepEqual(h.openedSessions, []);
  h.sessions.set({ ...h.sessions.getSnapshot(), phase: 'ready' }); await settle(); assert.deepEqual(h.openedSessions, ['one']);
  h.sessions.set(h.sessions.getSnapshot()); await settle(); assert.deepEqual(h.openedSessions, ['one']);
  assert.equal(h.timeouts.size, 0); h.disposePlugin();
});

test('destination opens a session when the initial panel is unset', async () => {
  const h = harness({ url: fragmentUrl(), ids: ['one'], activePanelId: null });
  await settle();
  assert.deepEqual(h.openedSessions, ['one']);
  h.disposePlugin();
});

test('destination fails closed for forged, invalid, archived and stale handoffs', async () => {
  for (const fixture of [
    { url: fragmentUrl('other', 'one'), ids: ['one'] },
    { url: fragmentUrl(), ids: ['one'], archived: ['one'] },
    { url: fragmentUrl(), ids: ['one'], workspaces: [{ workspaceId: 'w', sessionIds: [] }] },
    { url: fragmentUrl(), ids: [] },
    { url: fragmentUrl(), ids: ['one'], wsState: 'error' },
    { url: 'http://localhost/app/?launch=secret#dsh-board-session-v1:w:%ZZ', ids: ['one'] },
    { url: 'http://localhost/app/?launch=secret#dsh-board-session-v1:w:one:extra', ids: ['one'] },
    { url: fragmentUrl('w', 'bad\u202eid'), ids: ['bad\u202eid'] },
  ]) {
    const h = harness(fixture); await settle(); assert.equal(h.window.location.href, 'http://localhost/app/'); assert.deepEqual(h.openedSessions, []); h.disposePlugin();
  }
  const h = harness({ url: 'http://localhost/app/#other', ids: ['one'] }); await settle(); assert.equal(h.window.location.hash, '#other'); assert.deepEqual(h.openedSessions, []);
});

test('destination cancels on navigation, interaction, generation, timeout, and disposal', async () => {
  for (const cancel of ['pointerdown', 'keydown', 'panel', 'generation', 'timeout', 'dispose', 'url']) {
    const h = harness({ url: fragmentUrl(), ids: ['one'], wsPhase: 'pending' });
    if (cancel === 'pointerdown' || cancel === 'keydown') h.events.get(cancel)({ isTrusted: true });
    if (cancel === 'panel') h.panelInfo.set({ activePanelId: 'another' });
    if (cancel === 'generation') h.generation.set({ id: 2 });
    if (cancel === 'timeout') [...h.timeouts][0]();
    if (cancel === 'dispose') h.disposePlugin();
    if (cancel === 'url') h.window.history.replaceState(null, '', '/elsewhere');
    h.ws.set({ ...h.ws.getSnapshot(), phase: 'ready' }); await settle(); assert.deepEqual(h.openedSessions, [], cancel); assert.equal(h.timeouts.size, 0, cancel);
    h.disposePlugin();
  }
  const h = harness({ url: fragmentUrl(), ids: ['one'] }); h.disposePlugin(); await settle(); assert.deepEqual(h.openedSessions, []);
  const later = harness({ url: fragmentUrl(), ids: ['one'] }); later.ctx.layout.beginNavigation(); await settle(); assert.deepEqual(later.openedSessions, []);
});

test('column whale counts distinct member sessions before session filter and intersects other filters', async () => {
  const h = harness({ ids: ['a', 'b', 'foreign'], workspaces: [{ workspaceId: 'w', title: 'Workspace', sessionIds: ['a', 'b'] }] });
  const snapshot = base(); snapshot.boards[0].tasks = [{ id: 't', title: 'Needle one', statusId: 's', assignee: 'Alex' }, { id: 't2', title: 'Needle two', statusId: 's', assignee: 'Alex' }, { id: 't3', title: 'Needle none', statusId: 's', assignee: 'Alex' }, { id: 't4', title: 'Other', statusId: 's', assignee: 'Blair' }];
  snapshot.links = [['t','a'], ['t','b'], ['t','foreign'], ['t2','a'], ['t4','b']].map(([taskId, sessionId]) => ({ boardId: 'b', taskId, sessionId }));
  h.mount(); await h.resolve(0, snapshot); await h.choose();
  h.change(h.nodes('input').find(n => n.props['aria-label'] === 'search'), 'Needle');
  h.change(h.nodes('select').find(n => n.props['aria-label'] === 'assignee'), JSON.stringify(['assignee', 'Alex']));
  const column = () => h.nodes('button').find(n => n.props['aria-label']?.startsWith('columnSessions:'));
  assert.equal(column().props['aria-label'], 'columnSessions: Open — 2');
  h.change(h.nodes('select').find(n => n.props['aria-label'] === 'sessionFilter'), 'unlinked');
  assert.equal(column().props['aria-label'], 'columnSessions: Open — 2'); column().props.onClick();
  assert.equal(h.nodes('select').find(n => n.props['aria-label'] === 'sessionFilter').props.value, 'linked');
  assert.equal(column().props['aria-pressed'], true); assert.equal(h.nodes('button').filter(n => n.props['aria-label']?.startsWith('editTask:')).length, 2);
  h.click('clearSessionFilter'); assert.equal(h.nodes('select').find(n => n.props['aria-label'] === 'sessionFilter').props.value, 'all');
  const region = h.nodes('div').find(n => n.props.className === 'dsh-board-kanban'); assert.equal(region.props.tabIndex, 0); assert.equal(region.props.role, 'region');
  assert.match(h.text(h.nodes('style')[0]), /max-width:100%;min-width:0;overflow-x:auto/); h.unmount();
});
