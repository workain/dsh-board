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
  const opened = [], full = [], sessionOpened = [], sessionNewTabs = [], calls = [], editorRenders = [], flows = [];
  let tree, cursor = 0, hooks = [], effects = [], pending = false, active = false, tab = { visible: true, signal: new AbortController().signal }, sessionId = 's', editor = null;
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
  // This fake models an embedded editor's authorization boundary, not the real
  // editor's page traversal or rendering. Every flow explicitly checks before
  // and after the mocked request and publishes only if both checks succeed.
  function renderIssueEditor(props) {
    editor = props; editorRenders.push(props);
    return React.createElement('fake-editor', { target: props.target });
  }
  const card = createSessionCard(React, { transport, ws, sessions, connection, sidebarRight, t: key => key, renderTrackerText: value => value, renderIssueEditor, openBoardForSession: id => full.push(id), openSession: id => sessionOpened.push(id), ...(options.noNewTab ? {} : { openSessionInNewTab: id => sessionNewTabs.push(id) }) });
  function render(component = card.Body) {
    active = true; let loops = 0;
    do { pending = false; cursor = 0; effects = []; if (component === card.Body) editor = null; tree = component({ sessionId, useTabInfo: () => ({ tab }) }); const next = effects; effects = []; next.forEach(fn => fn()); assert.ok(++loops < 100); } while (pending);
    return tree;
  }
  function nodes(type) { render(); const out = []; function walk(n) { if (!n || typeof n !== 'object') return; if (n.type === type) out.push(n); n.children?.forEach(walk); } walk(tree); return out; }
  function text(n) { if (arguments.length === 0) n = tree; if (!n || typeof n !== 'object') return String(n ?? ''); return n.children.map(child => text(child)).join(''); }
  function unmount() { if (active) hooks.forEach(item => item?.cleanup?.()); active = false; hooks = []; editor = null; }
  async function flow(captured, op = 'issue.read', extra = {}) {
    assert.ok(captured, 'editor must be mounted');
    const { target, authorization } = captured, events = [];
    const accepts = () => authorization.valid();
    const authorize = async stage => { events.push('authorize:' + stage); try { return await authorization.authorize(target, accepts, target.linkRevision); } catch { return false; } };
    const result = { events, value: null }; flows.push(result);
    if (!await authorize('before')) return result;
    events.push(op);
    let value;
    try { value = await transport.trackerCommand({ op, workspaceId: target.workspaceId, boardId: target.boardId, issueKey: target.key, issueId: target.issueId, ...extra }); } catch { return result; }
    if (!await authorize('after')) return result;
    result.value = value;
    return result;
  }
  return { card, render, nodes, text, unmount, ws, sessions, connection, mounted, opened, full, sessionOpened, sessionNewTabs, calls, editorRenders, flows, flow, get editor() { return editor; }, setSession: id => { sessionId = id; }, setTab: value => { tab = { ...tab, ...value }; }, select: value => { const select = nodes('select')[0]; select.props.onChange({ target: { value } }); render(); } };
}
async function ready(h) { h.render(); await settle(); h.render(); await settle(); h.render(); }
const choose = (h, key) => { const option = h.nodes('select')[0].children.find(n => n?.type === 'option' && h.text(n).includes(key)); assert.ok(option); h.select(option.props.value); };

test('header is session-scoped and rechecks mounted session when clicked', () => {
  const h = harness(); const button = h.render(h.card.Header); assert.equal(button.type, 'button'); button.props.onClick(); assert.deepEqual(h.opened, ['dsh-board-issue']); h.mounted.set('other'); button.props.onClick(); assert.deepEqual(h.opened, ['dsh-board-issue']); assert.equal(h.render(h.card.Header), null);
});
test('joins local tasks and delegates the exact linked target to the editor', async () => {
  const h = harness(); await ready(h); assert.match(h.text(), /Local task/); assert.match(h.text(), /historical/); assert.doesNotMatch(h.text(), /Foreign local|SECRET/); assert.doesNotMatch(h.text(), /partial result/);
  assert.deepEqual(h.calls.find(c => c.op === 'links.session.read'), { op: 'links.session.read', workspaceId: 'w', sessionId: 's' });
  assert.deepEqual(h.editor.target, { sessionId: 's', workspaceId: 'w', incarnation: 'incarnation', connectionId: 1, settings, boardId: '1', key: 'ABC-1', issueId: 'id-1', linkRevision: 1 });
  const flow = await h.flow(h.editor); assert.deepEqual(flow.events, ['authorize:before', 'issue.read', 'authorize:after']); assert.equal(flow.value.summary, 'Private ABC-1');
  assert.deepEqual(h.calls.filter(c => c.op === 'links.issue.read'), Array(2).fill({ op: 'links.issue.read', workspaceId: 'w', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1' }));
  h.nodes('button').find(n => h.text(n).includes('Open full board')).props.onClick(); assert.deepEqual(h.full, ['s']);
});
test('visible session button opens current session and rejects stale scope and unsupported modifiers', async () => {
  const h = harness(); h.sessions.set({ phase: 'ready', ids: ['s', 'other'], byId: { s: { displayTitle: 'Session title' } } }); await ready(h);
  const button = h.nodes('button').find(node => h.text(node) === 'Open current session · Session title'); assert.ok(button);
  button.props.onClick({ button: 0 }); button.props.onClick({ button: 0, ctrlKey: true }); button.props.onClick({ button: 0, metaKey: true }); button.props.onAuxClick({ button: 1 });
  assert.deepEqual(h.sessionOpened, ['s']); assert.deepEqual(h.sessionNewTabs, ['s', 's', 's']);
  h.mounted.set('other'); button.props.onClick({ button: 0 }); button.props.onAuxClick({ button: 1 }); assert.deepEqual(h.sessionOpened, ['s']); assert.equal(h.sessionNewTabs.length, 3);
  const other = harness({ noNewTab: true }); await ready(other); const fallback = other.nodes('button').find(node => other.text(node) === 'Open current session · Untitled session'); assert.ok(fallback); assert.notEqual(other.text(fallback), 'Open current session · s'); fallback.props.onClick({ ctrlKey: true }); fallback.props.onAuxClick({ button: 1 }); assert.deepEqual(other.sessionOpened, []);
  other.sessions.set({ phase: 'ready', ids: ['s', 'other'], byId: { s: { displayTitle: 's' } } }); other.render(); const idTitle = other.nodes('button').find(node => other.text(node).startsWith('Open current session')); assert.equal(other.text(idTitle), 'Open current session · Untitled session');
});
test('rejects malformed session discovery', async () => {
  for (const mode of ['wrong-session', 'unselected-board', 'bad-incomplete', 'bad-key', 'bad-id', 'bad-revision']) {
    const h = harness({ command(c) { if (c.op === 'links.session.read') return { revision: mode === 'bad-revision' ? -1 : 1, incomplete: mode === 'bad-incomplete' ? 'no' : false, links: [{ sessionId: mode === 'wrong-session' ? 'other' : 's', boardId: mode === 'unselected-board' ? '99' : '1', issueKey: mode === 'bad-key' ? 'bad' : 'ABC-1', issueId: mode === 'bad-id' ? '' : 'id-1' }] }; } });
    await ready(h); assert.equal(h.editor, null, mode); assert.match(h.text(), /unavailable/, mode); assert.equal(h.calls.filter(c => c.op === 'issue.read').length, 0, mode);
  }
});
test('rejects malformed exact-link replies and mismatched editor targets', async () => {
  for (const mode of ['wrong-target', 'wrong-key', 'missing-session', 'duplicate', 'incomplete', 'bad-revision']) {
    const h = harness({ command(c) { if (c.op !== 'links.issue.read') return; const link = { sessionId: mode === 'missing-session' ? 'other' : 's', issueKey: mode === 'wrong-key' ? 'ZZ-9' : 'ABC-1', issueId: mode === 'wrong-target' ? 'other-id' : 'id-1' }; return { revision: mode === 'bad-revision' ? 2 : 1, incomplete: mode === 'incomplete', links: mode === 'duplicate' ? [link, link] : [link] }; } });
    await ready(h); const flow = await h.flow(h.editor); assert.deepEqual(flow.events, ['authorize:before'], mode); assert.equal(flow.value, null, mode); assert.equal(h.calls.filter(c => c.op === 'issue.read').length, 0, mode);
  }
  const h = harness(); await ready(h); const { authorization, target } = h.editor;
  for (const patch of [{ workspaceId: 'other' }, { boardId: '2' }, { key: 'XYZ-3' }, { issueId: 'other' }]) assert.equal(await authorization.authorize({ ...target, ...patch }, () => true), false);
  assert.equal(h.calls.filter(c => c.op === 'links.issue.read').length, 0);
});
test('multiple linked issues require an explicit choice and selected target is current', async () => {
  const h = harness({ incomplete: true, links: { '1': links['1'], '2': [{ sessionId: 's', issueKey: 'XYZ-3', issueId: 'id-3' }] } }); await ready(h);
  assert.equal(h.nodes('select').length, 1); assert.equal(h.editor, null); assert.match(h.text(), /partial result/);
  choose(h, 'XYZ-3'); assert.equal(h.editor.target.key, 'XYZ-3'); assert.equal(h.editor.target.boardId, '2'); const result = await h.flow(h.editor); assert.equal(result.value.key, 'XYZ-3'); assert.equal(h.calls.find(c => c.op === 'issue.read').boardId, '2');
});
test('visibility, abort, session, workspace incarnation, and connection invalidate pending editor flows', async () => {
  for (const change of ['hidden', 'abort', 'session', 'incarnation', 'connection']) {
    const slow = defer(); let hit = false; const controller = new AbortController();
    const h = harness({ command(c) { if (c.op === 'issue.read') { hit = true; return slow.promise; } } }); h.setTab({ signal: controller.signal }); await ready(h); const old = h.editor; const pending = h.flow(old); await settle(); assert.ok(hit, change);
    if (change === 'hidden') h.setTab({ visible: false });
    if (change === 'abort') controller.abort();
    if (change === 'session') { h.setSession('other'); h.mounted.set('other'); }
    if (change === 'incarnation') h.ws.set({ ...wsValue, items: [{ ...wsValue.items[0], createdAt: 'replacement' }] });
    if (change === 'connection') h.connection.set({ id: 2 });
    h.render(); slow.resolve(issue('ABC-1', 'id-1')); const result = await pending; assert.deepEqual(result.events, ['authorize:before', 'issue.read', 'authorize:after'], change); assert.equal(result.value, null, change); assert.equal(old.authorization.valid(), false, change); h.unmount();
  }
});
test('ambiguous or unavailable membership never fetches private data', async () => {
  const h = harness(); h.ws.set({ ...wsValue, items: [...wsValue.items, { workspaceId: 'w2', createdAt: 'other', sessionIds: ['s'] }] }); h.render(); await settle(); assert.match(h.text(), /multiple workspaces/i); assert.equal(h.calls.length, 0);
  h.ws.set({ ...wsValue, archivedSessionIds: ['s'] }); h.render(); await settle(); assert.match(h.text(), /unavailable|archived/i); assert.equal(h.calls.length, 0);
});
test('mocked issue and comment flows authorize before and after each request', async () => {
  const h = harness(); await ready(h); const editor = h.editor;
  const detail = await h.flow(editor); const page = await h.flow(editor, 'issue.comments', { cursor: '100' });
  assert.deepEqual(detail.events, ['authorize:before', 'issue.read', 'authorize:after']); assert.equal(detail.value.id, 'id-1');
  assert.deepEqual(page.events, ['authorize:before', 'issue.comments', 'authorize:after']); assert.equal(page.value.comments[0].text, 'Comment a');
  assert.equal(h.calls.filter(c => c.op === 'links.issue.read').length, 4);
});
test('link removal during detail or comment flow prevents publishing', async () => {
  for (const op of ['issue.read', 'issue.comments']) {
    let removed = false; const h = harness({ command(c) { if (c.op === 'links.issue.read' && removed) return { revision: 2, incomplete: false, links: [] }; if (c.op === op) { removed = true; return op === 'issue.read' ? issue('ABC-1', 'id-1') : { comments: [comment('secret')], complete: true, nextCursor: null }; } } });
    await ready(h); const flow = await h.flow(h.editor, op); assert.deepEqual(flow.events, ['authorize:before', op, 'authorize:after']); assert.equal(flow.value, null); assert.equal(h.calls.filter(c => c.op === 'links.issue.read').length, 2);
  }
});
test('workspace ABA and settings revision changes invalidate old flows', async () => {
  const slow = defer(); let hit = false, revision = 1;
  const h = harness({ settings: () => ({ ...settings, revision }), command(c) { if (c.op === 'issue.read' && !hit) { hit = true; return slow.promise; } } });
  await ready(h); const old = h.editor, pending = h.flow(old); await settle(); assert.ok(hit);
  h.ws.set({ ...wsValue, items: [{ ...wsValue.items[0], createdAt: 'different' }] }); h.ws.set(wsValue); revision = 2; h.render();
  slow.resolve(issue('ABC-1', 'id-1')); assert.equal((await pending).value, null); assert.equal(old.authorization.valid(), false);
  await ready(h); assert.ok(h.editor); assert.equal(h.editor.target.settings.revision, 2); assert.ok((await h.flow(h.editor)).value);
});
test('discovery reads once for many selected boards', async () => {
  const many = Array.from({ length: 20 }, (_, n) => String(n + 1)); const h = harness({ settings: () => ({ ...settings, workspaces: { w: many } }) }); await ready(h);
  assert.equal(h.calls.filter(c => c.op === 'links.session.read').length, 1); assert.ok(h.editor); assert.equal(h.calls.filter(c => c.op === 'issue.comments').length, 0);
});
test('verification unavailable hides session data and retry restores it', async () => {
  let current = { ...settings, verificationUnavailable: ['w'] };
  const h = harness({ settings: () => current });
  await ready(h);
  assert.equal(h.editor, null);
  assert.match(h.text(), /temporarily unavailable/);
  assert.doesNotMatch(h.text(), /selection needs confirmation/);
  assert.equal(h.calls.filter(c => c.op === 'links.session.read').length, 0);
  current = settings;
  h.nodes('button').find(node => h.text(node) === 'Retry').props.onClick();
  await settle(); h.render(); await settle(); h.render();
  assert.ok(h.editor);
});
test('late unavailable discovery exposes retry and hides linked issue', async () => {
  let reads = 0;
  const h = harness({ settings: () => ({ ...settings, verificationUnavailable: ++reads === 2 ? ['w'] : [] }) });
  await ready(h);
  assert.equal(h.editor, null);
  assert.match(h.text(), /temporarily unavailable/);
  assert.ok(h.nodes('button').some(node => h.text(node) === 'Retry'));
});
test('unavailable editor authorization and reconciliation expose retry', async () => {
  for (const kind of ['authorize', 'reconcile']) {
    let current = settings;
    const h = harness({ settings: () => current }); await ready(h);
    const editor = h.editor;
    current = { ...settings, verificationUnavailable: ['w'] };
    if (kind === 'authorize') assert.equal((await h.flow(editor)).value, null);
    else assert.equal(await editor.authorization.reconcileLink({ sessionId: 'other', linked: true, expectedRevision: 1 }, { revision: 2 }, () => true), false);
    h.render(); assert.equal(h.editor, null);
    assert.match(h.text(), /temporarily unavailable/);
    assert.ok(h.nodes('button').some(node => h.text(node) === 'Retry'));
    h.unmount();
  }
});
test('settings changes and invalid settings fail authorization closed', async () => {
  for (const mode of ['revision', 'unconfigured', 'reselect', 'unavailable', 'bad-unavailable', 'selection', 'invalid']) {
    let current = settings; const h = harness({ settings: () => current }); await ready(h); const old = h.editor;
    current = mode === 'revision' ? { ...settings, revision: 2 } : mode === 'unconfigured' ? { ...settings, configured: false } : mode === 'reselect' ? { ...settings, needsReselect: ['w'] } : mode === 'unavailable' ? { ...settings, verificationUnavailable: ['w'] } : mode === 'bad-unavailable' ? { ...settings, verificationUnavailable: [5] } : mode === 'selection' ? { ...settings, workspaces: { w: ['2'] } } : { ...settings, revision: 'bad' };
    const flow = await h.flow(old); assert.deepEqual(flow.events, ['authorize:before'], mode); assert.equal(flow.value, null, mode); assert.equal(h.calls.filter(c => c.op === 'issue.read').length, 0, mode);
  }
});
test('verification loss during discovery or issue request fences late data', async () => {
  for (const stage of ['discovery', 'issue']) {
    let current = settings;
    const slow = defer();
    const h = harness({ settings: () => current, command(c) {
      if (stage === 'discovery' && c.op === 'links.session.read') return slow.promise;
      if (stage === 'issue' && c.op === 'issue.read') return slow.promise;
    } });
    if (stage === 'discovery') {
      h.render(); await settle();
      current = { ...settings, verificationUnavailable: ['w'] };
      slow.resolve({ revision: 1, incomplete: false, links: [{ sessionId: 's', boardId: '1', issueKey: 'ABC-1', issueId: 'id-1' }] });
      await settle(); h.render(); await settle(); h.render();
      assert.equal(h.editor, null);
    } else {
      await ready(h);
      const pending = h.flow(h.editor); await settle();
      current = { ...settings, verificationUnavailable: ['w'] };
      slow.resolve(issue('ABC-1', 'id-1'));
      assert.equal((await pending).value, null);
    }
    h.unmount();
  }
});
test('settings revision ABA during a mocked request rejects old content', async () => {
  let current = settings; const slow = defer(); let hit = false;
  const h = harness({ settings: () => current, command(c) { if (c.op === 'issue.read') { hit = true; return slow.promise; } } });
  await ready(h); const pending = h.flow(h.editor); await settle(); assert.ok(hit);
  // A settings change and restoration still advances the monotonic revision.
  current = { ...settings, revision: 3 }; slow.resolve(issue('ABC-1', 'id-1'));
  const result = await pending; assert.deepEqual(result.events, ['authorize:before', 'issue.read', 'authorize:after']); assert.equal(result.value, null);
});
test('settings changed during discovery are rejected', async () => {
  let reads = 0; const h = harness({ settings: () => ({ ...settings, revision: ++reads === 1 ? 1 : 2 }) }); await ready(h);
  assert.equal(h.editor, null); assert.match(h.text(), /unavailable/); assert.equal(h.calls.filter(c => c.op === 'issue.read').length, 0);
});
test('unrelated catalog and workspace changes do not refetch', async () => {
  const h = harness(); await ready(h); const before = h.calls.length, old = h.editor;
  h.sessions.set({ phase: 'ready', ids: ['s', 'other'], byId: { other: { title: 'changed' } } }); h.ws.set({ ...wsValue, items: [{ ...wsValue.items[0], title: 'changed', sessionIds: ['s', 'other', 'new'] }] }); h.render(); await settle(); h.render();
  assert.equal(h.calls.length, before); assert.equal(old.authorization.valid(), true); assert.equal(h.editor.target.key, 'ABC-1');
});
test('link unlink-relink ABA during initial or later mocked request fails closed', async () => {
  for (const op of ['issue.read', 'issue.comments']) {
    let revision = 1; const h = harness({ command(c) { if (c.op === 'links.issue.read') return { revision, incomplete: false, links: [{ sessionId: 's', issueKey: 'ABC-1', issueId: 'id-1' }] }; if (c.op === op) { revision = 3; return op === 'issue.read' ? issue('ABC-1', 'id-1') : { comments: [comment('secret')], complete: true, nextCursor: null }; } } });
    await ready(h); const flow = await h.flow(h.editor, op); assert.deepEqual(flow.events, ['authorize:before', op, 'authorize:after']); assert.equal(flow.value, null);
  }
});
test('authorization is revoked if scope changes while an exact-link read is pending', async () => {
  const slow = defer(); let hit = false;
  const h = harness({ command(c) { if (c.op === 'links.issue.read') { hit = true; return slow.promise; } } });
  await ready(h); const stale = h.editor, pending = h.flow(stale); await settle(); assert.ok(hit);
  h.setTab({ visible: false }); h.render(); slow.resolve({ revision: 1, incomplete: false, links: [{ sessionId: 's', issueKey: 'ABC-1', issueId: 'id-1' }] });
  const result = await pending; assert.deepEqual(result.events, ['authorize:before']); assert.equal(result.value, null); assert.equal(h.calls.filter(c => c.op === 'issue.read').length, 0);
});
test('local unlink is revalidated even when Tracker is unconfigured or fails', async () => {
  for (const mode of ['unconfigured', 'failure']) {
    const local = count => ({ boards: [{ id: 'b', workspaceId: 'w', name: 'Board', tasks: [{ id: 't', title: 'Stale local' }] }], links: count === 1 ? [{ boardId: 'b', taskId: 't', sessionId: 's' }] : [] });
    const h = harness({ local, settings: () => { if (mode === 'failure') throw Error('offline'); return { ...settings, configured: false }; } });
    await ready(h); assert.doesNotMatch(h.text(), /Stale local/); assert.equal(h.calls.filter(c => c.op === 'local.read').length, 2); assert.equal(h.editor, null);
  }
});
test('selection ABA invalidates old authorization immediately before rerender', async () => {
  const h = harness({ links: { '1': links['1'], '2': [{ sessionId: 's', issueKey: 'XYZ-3', issueId: 'id-3' }] } }); await ready(h); choose(h, 'ABC-1'); const stale = h.editor;
  const select = h.nodes('select')[0], first = select.children.find(n => n?.type === 'option' && h.text(n).includes('ABC-1')), second = select.children.find(n => n?.type === 'option' && h.text(n).includes('XYZ-3')); const before = h.calls.length;
  select.props.onChange({ target: { value: second.props.value } }); select.props.onChange({ target: { value: first.props.value } }); assert.equal(stale.authorization.valid(), false); assert.equal((await h.flow(stale)).value, null); assert.equal(h.calls.length, before);
  h.render(); assert.equal(h.editor.target.key, 'ABC-1'); assert.ok((await h.flow(h.editor)).value);
});
test('bounded retry handles read throttling and cancels after scope change', async () => {
  for (const revoked of [false, true]) {
    const originalTimeout = globalThis.setTimeout, timers = []; let attempts = 0;
    globalThis.setTimeout = fn => { timers.push(fn); return 1; };
    try {
      const h = harness({ command(c) { if (c.op === 'links.session.read' && ++attempts === 1) return Promise.reject(Object.assign(Error('throttled'), { code: 'client_rate_limited' })); } });
      h.render(); await settle(); assert.equal(timers.length, 1); if (revoked) { h.mounted.set('other'); h.render(); }
      timers.shift()(); await settle(); h.render(); await settle(); h.render();
      if (revoked) { assert.equal(attempts, 1); assert.equal(h.editor, null); }
      else { assert.equal(attempts, 2); assert.ok(h.editor); }
      h.unmount();
    } finally { globalThis.setTimeout = originalTimeout; }
  }
});
