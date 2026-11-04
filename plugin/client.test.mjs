import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';

// Exercise the shipped module through its loader, slots and event handlers. All
// transport, React and browser APIs are in-memory; no server or profile is used.
const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const base = (revision = 4) => ({ revision, boards: [{ id: 'b', workspaceId: 'w', name: 'Board', statuses: [{ id: 's', name: 'Open', position: 0 }], tasks: [{ id: 't', title: 'Existing', description: 'original', statusId: 's' }] }], links: [] });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const source = (snapshot) => ({ getSnapshot: () => snapshot, subscribe: () => () => {} });
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness() {
  const requests = [], events = new Map(), confirms = [];
  let registration, slot, active = false, tree, effects = [], hooks = [], cursor = 0, needsRender = false;
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
  const window = {
    __ModuleLoader__: { load(value) { registration = value; } },
    addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener(type, fn) { if (events.get(type) === fn) events.delete(type); },
    confirm(message) { confirms.push(message); return window.confirmResult; },
    confirmResult: true,
  };
  const fetch = (path, options) => { const d = deferred(); requests.push({ path, options, ...d }); return d.promise; };
  vm.runInNewContext(client, { window, fetch, TextEncoder }, { filename: 'client.js' });
  const plugin = registration.factory(name => { assert.equal(name, 'react'); return React; });
  const ws = source({ phase: 'ready', state: 'ready', items: [{ workspaceId: 'w', title: 'Workspace', sessionIds: [] }], archivedSessionIds: [] });
  const sessions = source({ phase: 'ready', ids: [], byId: {} });
  const ctx = {
    effect(fn) { fn(); }, locale: { register() {}, bind: () => key => key },
    slots: { inject(_name, fn) { fn(); }, register(spec, component) { if (spec.name === 'main') slot = { spec, component }; } },
    workspaces: { list: ws }, sessions: { list: sessions }, uiWorkspace: { openSession() {} }, layout: { selectPanel() {} },
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
  return { requests, events, confirms, window, nodes, button, click, change, mount, unmount, resolve, choose, editDraft, submit };
}

async function ready() {
  const h = harness(); h.mount(); assert.equal(h.requests[0].options.method, 'GET'); await h.resolve(0, base()); await h.choose(); return h;
}

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
