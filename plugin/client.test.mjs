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
  const panels = [], openedSessions = [];
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
  const timers = new Set(), documentEvents = new Map();
  const document = { visibilityState: 'visible', addEventListener(type, fn) { documentEvents.set(type, fn); }, removeEventListener(type, fn) { if (documentEvents.get(type) === fn) documentEvents.delete(type); } };
  const window = {
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
    __ModuleLoader__: { load(value) { registration = value; } },
    addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener(type, fn) { if (events.get(type) === fn) events.delete(type); },
    confirm(message) { confirms.push(message); return window.confirmResult; },
    confirmResult: true,
  };
  const fetch = (path, options) => {
    if (path === 'api/dsh-board.tracker' && options.method === 'GET' && !sessionFixture?.manualTracker) return Promise.resolve(response({ revision: 0, configured: false, orgType: null, workspaces: {}, needsReselect: [] }));
    const d = deferred(); requests.push({ path, options, ...d }); return d.promise;
  };
  vm.runInNewContext(client, { window, document, fetch, TextEncoder }, { filename: 'client.js' });
  const plugin = registration.factory(name => { assert.equal(name, 'react'); return React; });
  const ws = source({ phase: 'ready', state: 'ready', items: (sessionFixture?.workspaces || [{ workspaceId: 'w', title: 'Workspace', sessionIds: sessionFixture?.ids || [] }]).map(item => ({ createdAt: '2026-01-01T00:00:00Z', ...item })), archivedSessionIds: sessionFixture?.archived || [] });
  const sessions = source({ phase: 'ready', ids: sessionFixture?.ids || [], byId: sessionFixture?.byId || {} });
  const generation = source({ id: 1, host: { home: '/' } });
  const ctx = {
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') pluginEffects.push(dispose); }, locale: { register() {}, bind: () => key => key },
    slots: { inject(_name, fn) { fn(); }, register(spec, component) { slotNames.push(spec.name); if (spec.name === 'main') slot = { spec, component }; } },
    commandUi: { register(command) {
      if (commands.has(command.name)) throw new Error(`ui-commands: duplicate contribution for /${command.name}`);
      commands.set(command.name, command);
      return () => { if (commands.get(command.name) === command) commands.delete(command.name); };
    } },
    inputTriggers: { registerSource() { return () => {}; } },
    connection: { generation }, workspaces: { list: ws }, sessions: { list: sessions }, uiWorkspace: { openSession(id) { openedSessions.push(id); } }, layout: { selectPanel(id) { panels.push(id); } },
  };
  plugin.apply(ctx);
  const props = { t: key => key, ...slot.spec.inject() };
  function render() {
    assert.ok(active, 'page must be mounted');
    do { needsRender = false; cursor = 0; effects = []; tree = slot.component(props); const pending = effects; effects = []; pending.forEach(fn => fn()); } while (needsRender);
    return tree;
  }
  function nodes(type) {
    render(); const result = [];
    function walk(node) { if (!node || typeof node !== 'object') return; if (node.type === type) result.push(node); node.children?.forEach(walk); }
    walk(tree); return result;
  }
  function text(node) { return node.children.map(child => typeof child === 'object' && child ? text(child) : String(child ?? '')).join(''); }
  function button(label) { const found = nodes('button').filter(n => text(n) === label); assert.equal(found.length, 1, `button ${label}`); return found[0]; }
  function click(label) { const n = button(label); assert.ok(!n.props.disabled, `${label} is disabled`); n.props.onClick(); }
  function change(node, value) { node.props.onChange({ target: { value } }); }
  function mount() { active = true; hooks = []; render(); }
  function unmount() { hooks.forEach(h => h?.cleanup?.()); hooks = []; active = false; }
  async function resolve(index, value, status = 200) { requests[index].resolve(response(value, status)); await settle(); }
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
  return { requests, events, documentEvents, document, timers, confirms, panels, openedSessions, commands, slotNames, plugin, ctx, generation, ws, disposePlugin, window, nodes, text, button, click, change, mount, unmount, resolve, choose, editDraft, submit, openContext, tile };
}

async function ready() {
  const h = harness(); h.mount(); assert.equal(h.requests[0].options.method, 'GET'); await h.resolve(0, base()); await h.choose(); return h;
}

test('board command is session-scoped, effect-owned and fails on duplicate registration', () => {
  const h = harness();
  assert.ok(h.plugin.inject.includes('commandUi')); assert.ok(h.plugin.inject.includes('connection'));
  assert.deepEqual(h.slotNames, ['main', 'sidebar.panellist']);
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
  h.click('linkCurrent'); assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].path, 'api/dsh-board.mutate');
  assert.deepEqual(JSON.parse(h.requests[1].options.body), { expectedRevision: 4, op: 'link.set', workspaceId: 'w', boardId: 'b', taskId: 't', sessionId: 'current', linked: true });
  assert.equal(h.button('linkCurrent').props.disabled, true);
  await h.resolve(1, { revision: 5, boards: [a, b], links: [{ boardId: 'b', taskId: 't', sessionId: 'other' }, { boardId: 'b', taskId: 't', sessionId: 'current' }] });
  h.click('unlinkCurrent'); assert.equal(h.requests.length, 3);
  assert.deepEqual(JSON.parse(h.requests[2].options.body), { expectedRevision: 5, op: 'link.set', workspaceId: 'w', boardId: 'b', taskId: 't', sessionId: 'current', linked: false });
  await h.resolve(2, { revision: 6, boards: [a, b], links: [{ boardId: 'b', taskId: 't', sessionId: 'other' }] });
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
  h.openContext('current'); h.tile('Board — Workspace').props.onClick(); h.editDraft();
  h.window.confirmResult = false; h.click('linkCurrent');
  assert.deepEqual(h.confirms, ['discardDraft']); assert.equal(h.requests.length, 1);
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ');
  h.window.confirmResult = true; h.click('linkCurrent');
  assert.equal(h.requests.length, 2); assert.equal(JSON.parse(h.requests[1].options.body).sessionId, 'current');
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ', 'draft remains until the link is acknowledged');
  await h.resolve(1, { error: { code: 'invalid' } }, 400);
  assert.equal(h.nodes('textarea')[0].props.value, '  first\n\nsecond\t ', 'rejected link must preserve draft');
  h.click('linkCurrent');
  await h.resolve(2, { revision: 5, boards: base().boards, links: [{ boardId: 'b', taskId: 't', sessionId: 'current' }] });
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
const trackerBoard = { board: { id: '1', name: '<img src=x onerror=alert(1)>' }, columns: [
  { id: '10', name: 'Open', statuses: [{ key: 'open' }, { key: 'shared' }] },
  { id: '11', name: 'Doing', statuses: [{ key: 'doing' }, { key: 'shared' }] },
], issues: [
  { key: 'A-1', summary: '<script>unsafe</script>', status: { key: 'open', display: 'Open' } },
  { key: 'A-2', summary: 'Ambiguous', status: { key: 'shared', display: 'Shared' } },
  { key: 'A-3', summary: 'Unknown', status: { key: 'unknown', display: 'Unknown' } },
], issuesComplete: false, issuesReason: 'approximate_board_filter' };

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
  h.click('trackerClose'); h.tile('External — Workspace — tracker').props.onClick();
  await h.resolve(6, trackerSettings(2, true, { w: ['1', '2'] }));
  assert.deepEqual(JSON.parse(h.requests[7].options.body), { op: 'board.read', workspaceId: 'w', boardId: '1', issueKeys: [] });
  await h.resolve(7, trackerBoard);
  const columns = h.nodes('section').filter(n => n.props.className === 'dsh-board-column');
  assert.deepEqual(columns.map(n => n.props['aria-label']), ['Open', 'Doing', 'trackerUnmapped']);
  assert.ok(h.text(columns[0]).includes('<script>unsafe</script>'));
  assert.ok(h.text(columns[2]).includes('Ambiguous') && h.text(columns[2]).includes('Unknown'));
  assert.equal(h.nodes('article').length, 3, 'ambiguous statuses never duplicate issues');
  assert.ok(h.nodes('p').some(n => h.text(n).includes('trackerPartial')));
  assert.ok(!h.nodes('button').some(n => ['addTask', 'addStatus', 'linkCurrent'].includes(h.text(n))));
  assert.ok(h.nodes('h2').some(n => h.text(n) === '<img src=x onerror=alert(1)>'));
  assert.ok(!h.nodes('a').length); assert.ok(!h.nodes('script').length); assert.ok(!h.nodes('img').length);
  assert.ok(h.requests.slice(1).every(r => !JSON.stringify(r.options).includes('orgId') && !JSON.stringify(r.options).includes('token')));
  h.unmount();
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

test('focus and TTL erase cached issues before revalidation and refresh board without another click', async () => {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base());
  await h.resolve(1, trackerSettings(1, true, { w: ['1'] }, []));
  h.tile('tracker #1 — Workspace — tracker').props.onClick();
  await h.resolve(2, trackerSettings(1, true, { w: ['1'] }, [])); await h.resolve(3, trackerBoard);
  assert.equal(h.nodes('article').length, 3);
  h.events.get('focus')(); assert.equal(h.nodes('article').length, 0);
  await h.resolve(4, trackerSettings(1, true, { w: ['1'] }, []));
  assert.equal(h.nodes('article').length, 0); await h.resolve(5, trackerBoard);
  assert.equal(h.nodes('article').length, 3);
  [...h.timers][0](); assert.equal(h.nodes('article').length, 0);
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
