import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCard } from './session-card.mjs';

// Deterministic hook/element harness: no browser, network, or user profile.
const source = initial => { let value = initial; const listeners = new Set(); return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, set(next) { value = next; listeners.forEach(fn => fn()); } }; };
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async (n = 50) => { while (n--) await Promise.resolve(); };
const settings = { revision: 1, configured: true, workspaces: { w: ['1', '2'] }, needsReselect: [] };
const wsValue = { phase: 'ready', state: 'ready', archivedSessionIds: [], items: [{ workspaceId: 'w', title: 'Work', createdAt: 'incarnation', sessionIds: ['s', 'other'] }] };
const issue = (key, id) => ({ id, key, summary: 'Private ' + key, description: 'Description', status: { display: 'Open' } });
const comment = id => ({ id, text: 'Comment ' + id, createdBy: { display: 'Alice' }, createdAt: '2026-01-01' });
const links = { '1': [{ sessionId: 's', issueKey: 'ABC-1', issueId: 'id-1' }, { sessionId: 'other', issueKey: 'SECRET-2', issueId: 'id-2' }], '2': [] };
function harness(options = {}) {
  const ws = source(wsValue), sessions = source({ phase: 'ready', ids: ['s', 'other'] }), connection = source({ id: 1 }), mounted = source('s');
  const opened = [], full = [], sessionOpened = [], sessionNewTabs = [], calls = [];
  let tree, cursor = 0, hooks = [], effects = [], pending = false, active = false, tab = { visible: true, signal: new AbortController().signal }, sessionId = 's';
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; pending = true; }]; },
    useRef(initial) { const i = cursor++; return hooks[i] ||= { current: initial }; },
    useSyncExternalStore(_subscribe, get) { cursor++; return get(); },
    useEffect(fn, deps) { const i = cursor++, previous = hooks[i]; if (!previous || !deps || deps.length !== previous.deps.length || deps.some((v, n) => !Object.is(v, previous.deps[n]))) effects.push(() => { previous?.cleanup?.(); hooks[i] = { deps, cleanup: fn() }; }); },
  };
  const transport = {
    async read() { calls.push({ op: 'local.read' }); if (options.local) return await options.local(calls.filter(c => c.op === 'local.read').length); return { boards: [{ id: 'b', workspaceId: 'w', name: 'Local board', statuses: [{ id: 'open', name: 'Open' }], tasks: [{ id: 't', title: 'Local task', statusId: 'open' }] }, { id: 'foreign', workspaceId: 'other', name: 'Foreign board', tasks: [{ id: 't', title: 'Foreign local' }] }], links: [{ boardId: 'b', taskId: 't', sessionId: 's' }, { boardId: 'foreign', taskId: 't', sessionId: 's' }] }; },
    async trackerRead() { calls.push({ op: 'settings.read' }); return options.settings?.() || settings; },
    async trackerCommand(command) {
      calls.push(command);
      if (options.command) { const custom = options.command(command); if (custom !== undefined) return await custom; }
      const all = Object.entries(options.links || links).flatMap(([boardId, items]) => items.map(item => ({ ...item, boardId })));
      if (command.op === 'links.session.read') return { revision: 1, incomplete: Boolean(options.incomplete), links: all.filter(link => link.sessionId === command.sessionId) };
      if (command.op === 'links.issue.read') return { revision: 1, incomplete: false, links: all.filter(link => link.boardId === command.boardId && link.issueKey === command.issueKey && link.issueId === command.issueId) };
      if (command.op === 'issue.read') return issue(command.issueKey, command.issueId);
      if (command.op === 'issue.comments') return { comments: [comment('a')], complete: true, nextCursor: null };
      throw Error('Unexpected write');
    },
    mutate() { throw Error('Unexpected mutation'); },
  };
  const sidebarRight = { mounted, openTab: id => opened.push(id) };
  const card = createSessionCard(React, { transport, ws, sessions, connection, sidebarRight, t: key => key, renderTrackerText: value => value, openBoardForSession: id => full.push(id), openSession: id => sessionOpened.push(id), ...(options.noNewTab ? {} : { openSessionInNewTab: id => sessionNewTabs.push(id) }) });
  function render(component = card.Body) {
    active = true; let loops = 0;
    do { pending = false; cursor = 0; effects = []; tree = component({ sessionId, useTabInfo: () => ({ tab }) }); const next = effects; effects = []; next.forEach(fn => fn()); assert.ok(++loops < 100); } while (pending);
    return tree;
  }
  function nodes(type) { render(); const out = []; function walk(n) { if (!n || typeof n !== 'object') return; if (n.type === type) out.push(n); n.children?.forEach(walk); } walk(tree); return out; }
  function text(n) { if (arguments.length === 0) n = tree; if (!n || typeof n !== 'object') return String(n ?? ''); return n.children.map(child => text(child)).join(''); }
  function unmount() { if (active) hooks.forEach(item => item?.cleanup?.()); active = false; hooks = []; }
  return { card, render, nodes, text, unmount, ws, sessions, connection, mounted, opened, full, sessionOpened, sessionNewTabs, calls, setSession: id => { sessionId = id; }, setTab: value => { tab = { ...tab, ...value }; }, select: value => { const select = nodes('select')[0]; select.props.onChange({ target: { value } }); render(); } };
}
async function ready(h) { h.render(); await settle(); h.render(); await settle(); h.render(); }

test('header is session-scoped and rechecks mounted session when clicked', () => {
  const h = harness(); const button = h.render(h.card.Header); assert.equal(button.type, 'button'); button.props.onClick(); assert.deepEqual(h.opened, ['dsh-board-issue']); h.mounted.set('other'); button.props.onClick(); assert.deepEqual(h.opened, ['dsh-board-issue']); assert.equal(h.render(h.card.Header), null);
});
test('joins local tasks in workspace and displays validated linked issue without writes', async () => {
  const h = harness(); await ready(h); assert.match(h.text(), /Local task/); assert.doesNotMatch(h.text(), /Foreign local|SECRET/); assert.match(h.text(), /Private ABC-1/); assert.match(h.text(), /Comment a/); assert.doesNotMatch(h.text(), /partial result/); assert.match(h.text(), /read-only/i);
  assert.deepEqual(h.calls.find(c => c.op === 'links.session.read'), { op: 'links.session.read', workspaceId: 'w', sessionId: 's' });
  assert.deepEqual(h.calls.find(c => c.op === 'links.issue.read'), { op: 'links.issue.read', workspaceId: 'w', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1' });
  const read = h.calls.find(c => c.op === 'issue.read'); assert.equal(read.issueId, 'id-1'); assert.ok(h.calls.every(c => ['local.read', 'settings.read', 'links.session.read', 'links.issue.read', 'issue.read', 'issue.comments'].includes(c.op)));
  h.nodes('button').find(n => h.text(n).includes('Open full board')).props.onClick(); assert.deepEqual(h.full, ['s']);
});
test('visible session button opens current session and rejects stale scope and unsupported modifiers', async () => {
  const h = harness(); h.sessions.set({ phase: 'ready', ids: ['s', 'other'], byId: { s: { displayTitle: 'Session title' } } }); await ready(h);
  const button = h.nodes('button').find(node => h.text(node) === 'Open current session · Session title'); assert.ok(button);
  button.props.onClick({ button: 0 }); button.props.onClick({ button: 0, ctrlKey: true }); button.props.onClick({ button: 0, metaKey: true }); button.props.onAuxClick({ button: 1 });
  assert.deepEqual(h.sessionOpened, ['s']); assert.deepEqual(h.sessionNewTabs, ['s', 's', 's']);
  h.mounted.set('other'); button.props.onClick({ button: 0 }); button.props.onAuxClick({ button: 1 }); assert.deepEqual(h.sessionOpened, ['s']); assert.equal(h.sessionNewTabs.length, 3);
  const other = harness({ noNewTab: true }); await ready(other); const fallback = other.nodes('button').find(node => other.text(node) === 'Open current session · s'); fallback.props.onClick({ ctrlKey: true }); fallback.props.onAuxClick({ button: 1 }); assert.deepEqual(other.sessionOpened, []);
});
test('rejects malformed session discovery and exact issue results', async () => {
  for (const mode of ['wrong-session', 'unselected-board', 'bad-incomplete', 'wrong-target']) {
    const h = harness({ command(c) {
      if (c.op === 'links.session.read' && mode !== 'wrong-target') return { revision: 1, incomplete: mode === 'bad-incomplete' ? 'no' : false, links: [{ sessionId: mode === 'wrong-session' ? 'other' : 's', boardId: mode === 'unselected-board' ? '99' : '1', issueKey: 'ABC-1', issueId: 'id-1' }] };
      if (c.op === 'links.issue.read' && mode === 'wrong-target') return { revision: 1, incomplete: false, links: [{ sessionId: 's', issueKey: 'ABC-1', issueId: 'other-id' }] };
    } });
    await ready(h); assert.doesNotMatch(h.text(), /Private ABC-1|Comment a/, mode); assert.match(h.text(), mode === 'wrong-target' ? /hidden/ : /unavailable/, mode);
  }
});
test('multiple linked issues require an explicit choice; results remain partial', async () => {
  const h = harness({ incomplete: true, links: { '1': links['1'], '2': [{ sessionId: 's', issueKey: 'XYZ-3', issueId: 'id-3' }] } }); await ready(h);
  assert.equal(h.nodes('select').length, 1); assert.doesNotMatch(h.text(), /Private ABC-1|Private XYZ-3/); assert.match(h.text(), /partial result/);
  const select = h.nodes('select')[0]; const option = select.children.find(n => n?.type === 'option' && h.text(n).includes('XYZ-3')); h.select(option.props.value); await settle(); h.render(); assert.match(h.text(), /Private XYZ-3/); assert.equal(h.calls.find(c => c.op === 'issue.read').boardId, '2');
});
test('visibility, session, workspace incarnation, and connection invalidate pending private reads', async () => {
  for (const change of ['hidden', 'session', 'incarnation', 'connection']) {
    const slow = defer(); let hit = false;
    const h = harness({ command(c) { if (c.op === 'issue.read' && !hit) { hit = true; return slow.promise; } } });
    h.render(); await settle(); h.render(); await settle(); assert.ok(hit, change);
    if (change === 'hidden') h.setTab({ visible: false });
    if (change === 'session') { h.setSession('other'); h.mounted.set('other'); }
    if (change === 'incarnation') h.ws.set({ ...wsValue, items: [{ ...wsValue.items[0], createdAt: 'replacement' }] });
    if (change === 'connection') h.connection.set({ id: 2 });
    h.render(); slow.resolve(issue('ABC-1', 'id-1')); await settle(); h.render(); assert.doesNotMatch(h.text(), /Private ABC-1|Comment a/, change); h.unmount();
  }
});
test('ambiguous or unavailable membership never fetches private data', async () => {
  const h = harness(); h.ws.set({ ...wsValue, items: [...wsValue.items, { workspaceId: 'w2', createdAt: 'other', sessionIds: ['s'] }] }); h.render(); await settle(); assert.match(h.text(), /multiple workspaces/i); assert.equal(h.calls.length, 0);
  h.ws.set({ ...wsValue, archivedSessionIds: ['s'] }); h.render(); await settle(); assert.match(h.text(), /unavailable|archived/i); assert.equal(h.calls.length, 0);
});
test('cursor pages are sequential, duplicate cursor is partial, errors retain comments except authorization', async () => {
  for (const mode of ['complete', 'duplicate', 'error', 'auth']) {
    const h = harness({ command(c) {
      if (c.op !== 'issue.comments') return;
      if (!c.cursor) return { comments: [comment('first')], complete: false, nextCursor: '100' };
      if (mode === 'error') return Promise.reject(Object.assign(Error('offline'), { status: 503 }));
      if (mode === 'auth') return Promise.reject(Object.assign(Error('forbidden'), { status: 403 }));
      return { comments: [comment('second')], complete: mode === 'complete', nextCursor: mode === 'complete' ? null : '100' };
    } });
    await ready(h); const pages = h.calls.filter(c => c.op === 'issue.comments'); assert.equal(pages.length, 2, mode); assert.equal(pages[1].cursor, '100');
    if (mode === 'auth') { assert.doesNotMatch(h.text(), /Private ABC-1|Comment first/); assert.match(h.text(), /hidden/); }
    else { assert.match(h.text(), /Comment first/); assert.match(h.text(), mode === 'complete' ? /Traversal complete/ : mode === 'error' ? /could not be loaded/ : /continuation cursor/); }
  }
});
test('stale or mismatched immutable issue target is never rendered', async () => {
  const h = harness({ command(c) { if (c.op === 'issue.read') return issue(c.issueKey, 'reused-id'); } }); await ready(h); assert.doesNotMatch(h.text(), /Private ABC-1/); assert.match(h.text(), /hidden/);
});
test('link removal during detail fetch hides the issue', async () => {
  let reads = 0;
  const h = harness({ command(c) { if (c.op === 'links.issue.read' && c.boardId === '1' && ++reads === 1) return { revision: 2, incomplete: false, links: [] }; } });
  await ready(h); assert.equal(reads, 1); assert.doesNotMatch(h.text(), /Private ABC-1|Comment a/); assert.match(h.text(), /hidden/);
});
test('workspace ABA and settings revision changes invalidate old reads', async () => {
  const slow = defer(); let hit = false, revision = 1;
  const h = harness({ settings: () => ({ ...settings, revision }), command(c) { if (c.op === 'issue.read' && !hit) { hit = true; return slow.promise; } } });
  h.render(); await settle(); h.render(); await settle(); assert.ok(hit);
  h.ws.set({ ...wsValue, items: [{ ...wsValue.items[0], createdAt: 'different' }] }); h.ws.set(wsValue); revision = 2;
  slow.resolve(issue('ABC-1', 'id-1')); await settle(); h.render(); assert.doesNotMatch(h.text(), /Private ABC-1|Comment a/);
  await settle(); h.render(); await settle(); h.render(); assert.match(h.text(), /Private ABC-1/);
});
test('board and comment traversal have bounded work', async () => {
  const many = Array.from({ length: 20 }, (_, n) => String(n + 1));
  const h = harness({ settings: () => ({ ...settings, workspaces: { w: many } }), command(c) { if (c.op === 'issue.comments') return { comments: [comment(c.cursor || '0')], complete: false, nextCursor: String(Number(c.cursor || 0) + 1) }; } });
  await ready(h); assert.equal(h.calls.filter(c => c.op === 'links.session.read').length, 1); assert.equal(h.calls.filter(c => c.op === 'issue.comments').length, 10); assert.match(h.text(), /More comments/);
});
const clickButton = (h, label) => { const button = h.nodes('button').find(node => h.text(node) === label); assert.ok(button, label); button.props.onClick(); };
test('load more traverses ten pages per explicit batch, retains prior pages, and completes', async () => {
  const h = harness({ command(c) { if (c.op === 'issue.comments') { const n = Number(c.cursor || 0); return { comments: [comment('page-' + n)], complete: n === 22, nextCursor: n === 22 ? null : String(n + 1) }; } } });
  await ready(h); assert.equal(h.calls.filter(c => c.op === 'issue.comments').length, 10); assert.match(h.text(), /Comment page-0/); assert.doesNotMatch(h.text(), /Comment page-10/);
  clickButton(h, 'Load more'); h.render(); await settle(); h.render(); assert.equal(h.calls.filter(c => c.op === 'issue.comments').length, 20); assert.match(h.text(), /Comment page-0/); assert.match(h.text(), /Comment page-19/);
  clickButton(h, 'Load more'); h.render(); await settle(); h.render(); assert.equal(h.calls.filter(c => c.op === 'issue.comments').length, 23); assert.match(h.text(), /Comment page-22/); assert.match(h.text(), /Traversal complete/); assert.equal(h.nodes('button').filter(n => h.text(n) === 'Load more').length, 0);
});
test('load more revalidates link and scope before displaying new content', async () => {
  for (const scenario of ['removed', 'session', 'hidden']) {
    const slow = defer(); let paging = false, unlinked = false;
    const h = harness({ command(c) {
      if (c.op === 'links.issue.read' && c.boardId === '1' && unlinked) return { revision: 2, incomplete: false, links: [] };
      if (c.op === 'issue.comments') { const n = Number(c.cursor || 0); if (n === 10 && scenario !== 'removed') { paging = true; return slow.promise; } return { comments: [comment('page-' + n)], complete: false, nextCursor: String(n + 1) }; }
    } });
    await ready(h); if (scenario === 'removed') unlinked = true; clickButton(h, 'Load more'); h.render(); await settle();
    if (scenario === 'removed') { h.render(); assert.doesNotMatch(h.text(), /Private ABC-1|Comment page-0/); assert.match(h.text(), /hidden/); assert.equal(h.calls.filter(c => c.op === 'issue.comments').length, 10); }
    else { assert.ok(paging); if (scenario === 'session') { h.setSession('other'); h.mounted.set('other'); } else h.setTab({ visible: false }); h.render(); slow.resolve({ comments: [comment('secret')], complete: true, nextCursor: null }); await settle(); h.render(); assert.doesNotMatch(h.text(), /Private ABC-1|Comment secret|Comment page-0/); }
    h.unmount();
  }
});
test('continuation retries known cursors, terminates without cursor, and fails closed on auth', async () => {
  for (const scenario of ['retry', 'terminal', 'auth']) {
    let attempts = 0;
    const h = harness({ command(c) { if (c.op !== 'issue.comments') return; const n = Number(c.cursor || 0); if (n === 10 && ++attempts === 1) { if (scenario === 'terminal') return { comments: [comment('terminal')], complete: false, nextCursor: null }; return Promise.reject(Object.assign(Error('failed'), { status: scenario === 'auth' ? 403 : 503 })); } return { comments: [comment('page-' + n)], complete: n === 10, nextCursor: n === 10 ? null : String(n + 1) }; } });
    await ready(h); clickButton(h, 'Load more'); h.render(); await settle(); h.render();
    if (scenario === 'auth') { assert.doesNotMatch(h.text(), /Private ABC-1|Comment page-0/); assert.match(h.text(), /hidden/); }
    if (scenario === 'terminal') { assert.match(h.text(), /continuation cursor/); assert.equal(h.nodes('button').filter(n => /Load more|Retry/.test(h.text(n))).length, 0); }
    if (scenario === 'retry') { assert.match(h.text(), /could not be loaded/); assert.match(h.text(), /Comment page-0/); clickButton(h, 'Retry'); h.render(); await settle(); h.render(); assert.match(h.text(), /Comment page-10/); assert.match(h.text(), /Traversal complete/); }
  }
});
test('unrelated catalog and workspace changes do not refetch', async () => {
  const h = harness(); await ready(h); const before = h.calls.length;
  h.sessions.set({ phase: 'ready', ids: ['s', 'other'], byId: { other: { title: 'changed' } } }); h.ws.set({ ...wsValue, items: [{ ...wsValue.items[0], title: 'changed', sessionIds: ['s', 'other', 'new'] }] }); h.render(); await settle(); h.render();
  assert.equal(h.calls.length, before); assert.match(h.text(), /Private ABC-1/);
});
test('link unlink-relink ABA during initial or later batch fails closed', async () => {
  for (const when of ['initial', 'continuation']) {
    let revision = 1;
    const h = harness({ command(c) {
      if (c.op === 'links.issue.read' && c.boardId === '1') return { revision, incomplete: false, links: links['1'].filter(link => link.issueId === c.issueId) };
      if (c.op === 'issue.comments') { const n = Number(c.cursor || 0); if ((when === 'initial' && n === 0) || (when === 'continuation' && n === 10)) revision = 3; return { comments: [comment('page-' + n)], complete: false, nextCursor: String(n + 1) }; }
    } });
    await ready(h); if (when === 'continuation') { assert.match(h.text(), /Private ABC-1/); clickButton(h, 'Load more'); h.render(); await settle(); h.render(); }
    assert.doesNotMatch(h.text(), /Private ABC-1|Comment page-0/); assert.match(h.text(), /hidden/);
  }
});
test('local unlink is revalidated even when Tracker is unconfigured or fails', async () => {
  for (const mode of ['unconfigured', 'failure']) {
    const local = count => ({ boards: [{ id: 'b', workspaceId: 'w', name: 'Board', tasks: [{ id: 't', title: 'Stale local' }] }], links: count === 1 ? [{ boardId: 'b', taskId: 't', sessionId: 's' }] : [] });
    const h = harness({ local, settings: () => { if (mode === 'failure') throw Error('offline'); return { ...settings, configured: false }; } });
    await ready(h); assert.doesNotMatch(h.text(), /Stale local/); assert.equal(h.calls.filter(c => c.op === 'local.read').length, 2);
  }
});
test('old load-more action cannot run after issue selection before render', async () => {
  const h = harness({ links: { '1': links['1'], '2': [{ sessionId: 's', issueKey: 'XYZ-3', issueId: 'id-3' }] }, command(c) { if (c.op === 'issue.comments') return { comments: [comment(c.cursor || '0')], complete: false, nextCursor: String(Number(c.cursor || 0) + 1) }; } });
  await ready(h); const options = h.nodes('select')[0].children; h.select(options.find(n => n?.type === 'option' && h.text(n).includes('ABC-1')).props.value); await settle(); h.render();
  const stale = h.nodes('button').find(n => h.text(n) === 'Load more'), select = h.nodes('select')[0], second = select.children.find(n => n?.type === 'option' && h.text(n).includes('XYZ-3')); const before = h.calls.length;
  select.props.onChange({ target: { value: second.props.value } }); stale.props.onClick(); await settle(); assert.equal(h.calls.length, before);
});
test('bounded retry handles read throttling and cancels after scope change', async () => {
  for (const revoked of [false, true]) {
    const originalTimeout = globalThis.setTimeout, timers = []; let attempts = 0;
    globalThis.setTimeout = fn => { timers.push(fn); return 1; };
    try {
      const h = harness({ command(c) { if (c.op === 'links.session.read' && ++attempts === 1) return Promise.reject(Object.assign(Error('throttled'), { code: 'client_rate_limited' })); } });
      h.render(); await settle(); assert.equal(timers.length, 1); if (revoked) { h.mounted.set('other'); h.render(); }
      timers.shift()(); await settle(); h.render(); await settle(); h.render();
      if (revoked) { assert.equal(attempts, 1); assert.doesNotMatch(h.text(), /Private ABC-1/); }
      else { assert.equal(attempts, 2); assert.match(h.text(), /Private ABC-1/); }
      h.unmount();
    } finally { globalThis.setTimeout = originalTimeout; }
  }
});
