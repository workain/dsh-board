import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';

// Reuse the real client harness without modifying its implementation or registering
// its test cases. Reading only its declarations keeps these races independent.
const tests = await readFile(new URL('./client.test.mjs', import.meta.url), 'utf8');
const start = tests.indexOf('const client = '), end = tests.indexOf("test('local empty lanes");
assert.ok(start >= 0 && end > start, 'client harness declarations not found');
const declarations = tests.slice(start, end).replace("new URL('./client.js', import.meta.url)", "new URL('./client.js', baseUrl)");
const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const prelude = declarations.replace(/^const client = .*?;\n/m, '');
const { harness, settle } = vm.runInNewContext(`(function () { ${prelude}\n return { harness, settle }; })()`, { client, vm, TextEncoder, URL, AbortController, assert, baseUrl: import.meta.url });
const base = { revision: 1, boards: [], links: [] };
const settings = { revision: 1, configured: true, orgType: 'cloud', workspaces: { w: ['1'] }, needsReselect: [] };
const status = { id: '1', key: 'open', display: 'Open' };
const board = { board: { id: '1', name: 'Private board' }, columns: [{ id: 'c', name: 'Open', statuses: [status] }], issues: [{ key: 'X-1', summary: 'Private issue', status }], issuesComplete: false };
const listing = { boards: [{ id: '1', name: 'Private board' }, { id: '2', name: 'Private other' }], complete: true };

async function mounted() {
  const h = harness({ manualTracker: true }); h.mount(); await h.resolve(0, base); await h.resolve(1, settings); return h;
}
async function opened() {
  const h = await mounted(); h.tile('tracker #1 — Workspace — tracker').props.onClick();
  await h.resolve(2, settings); await h.resolve(3, board); return h;
}
const hide = h => { h.document.visibilityState = 'hidden'; h.documentEvents.get('visibilitychange')(); };
const show = h => { h.document.visibilityState = 'visible'; h.documentEvents.get('visibilitychange')(); };

// The foreground event may legitimately start one queued fresh revalidation once
// the old request has settled; these assertions inspect before its reply arrives.
test('manual board.read response after hide/show cannot restore private issues', async () => {
  const h = await opened(); h.click('trackerRefreshBoard'); await h.resolve(4, settings);
  hide(h); show(h); await h.resolve(5, board);
  assert.equal(h.nodes('article').length, 0, 'old board.read must not repopulate after privacy boundary');
  assert.ok(!h.nodes('p').some(n => h.text(n).includes('trackerUpdatedAt')));
  h.unmount();
});

test('boards.list response after panel off/on cannot restore private listing', async () => {
  const h = await mounted(); h.click('trackerConnect'); await h.resolve(2, settings);
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w');
  h.click('trackerList');
  h.panelInfo.set({ activePanelId: null }); h.panelInfo.set({ activePanelId: 'dsh-board' });
  await h.resolve(3, listing);
  assert.equal(h.nodes('input').filter(n => n.props.type === 'checkbox').length, 0, 'old listing must not be applied');
  h.unmount();
});

test('workspace.select completing while hidden cannot retain listing or launch private readback', async () => {
  const h = await mounted(); h.click('trackerConnect'); await h.resolve(2, settings);
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w');
  h.click('trackerList'); await h.resolve(3, listing); h.click('trackerSelect');
  const count = h.requests.length; hide(h);
  await h.resolve(4, { revision: 2, workspaceId: 'w', boardIds: ['1'] });
  assert.equal(h.requests.length, count, 'hidden receipt must not trigger a private tracker read');
  assert.equal(h.nodes('input').filter(n => n.props.type === 'checkbox').length, 0);
  show(h); await settle();
  assert.ok(h.requests.length > count, 'foreground must reconcile the acknowledged write');
  h.unmount();
});

test('completed selection does not leave a phantom pending mutation on remount', async () => {
  const h = await mounted(); h.click('trackerConnect'); await h.resolve(2, settings);
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w');
  h.click('trackerList'); await h.resolve(3, listing); h.click('trackerSelect');
  await h.resolve(4, { revision: 2, workspaceId: 'w', boardIds: ['1'] });
  await h.resolve(5, { ...settings, revision: 2 });
  h.unmount(); h.mount(); await settle();
  assert.equal(h.requests.length, 8, 'remount must start local and Tracker reads');
  await h.resolve(6, base); await h.resolve(7, { ...settings, revision: 2 });
  assert.ok(!h.nodes('p').some(n => h.text(n).includes('trackerUncertain')));
  h.unmount();
});

test('selection settling after remount releases the new page and reconciles', async () => {
  const h = await mounted(); h.click('trackerConnect'); await h.resolve(2, settings);
  h.change(h.nodes('select').find(n => n.children.some(c => c?.props?.value === 'w')), 'w');
  h.click('trackerList'); await h.resolve(3, listing); h.click('trackerSelect');
  h.unmount(); h.mount(); await settle();
  await h.resolve(5, base);
  await h.resolve(4, { revision: 2, workspaceId: 'w', boardIds: ['1'] });
  await settle();
  assert.equal(h.requests.length, 7, 'settled stale mutation must start a fresh settings read');
  await h.resolve(6, { ...settings, revision: 2 });
  assert.ok(!h.nodes('p').some(n => h.text(n).includes('trackerUncertain')));
  h.unmount();
});

test('manual board.read response after unmount cannot restore private content on remount', async () => {
  const h = await opened(); h.click('trackerRefreshBoard'); await h.resolve(4, settings);
  h.unmount(); await h.resolve(5, board); h.mount();
  assert.equal(h.nodes('article').length, 0);
  h.unmount();
});

const local = revision => ({ revision, boards: [{ id: 'b', workspaceId: 'w', name: 'Board', statuses: [{ id: 's', name: 'Open', position: 0 }], tasks: [{ id: 't', title: 'Original', statusId: 's' }] }], links: [] });
const tick = h => [...h.timers].forEach(fn => fn());
const op = request => request.options.body && JSON.parse(request.options.body).op;
const isWrite = request => request.path === 'api/dsh-board.mutate' || ['issue.update', 'issue.comment', 'issue.editComment', 'issue.transition', 'links.set', 'workspace.select', 'configuration.configure'].includes(op(request));

test('initial local load hides, resumes immediately, and fences out-of-order completion', async () => {
  const h = harness(); h.mount();
  hide(h); show(h);
  assert.equal(h.requests.length, 2, 'resume starts a replacement GET without waiting for the stale one');
  const stale = local(9); stale.boards[0].name = 'Stale secret';
  await h.resolve(0, stale);
  assert.ok(!h.nodes('button').some(n => n.props['aria-label'] === 'Stale secret — Workspace'));
  await h.resolve(1, local(2));
  assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'Board — Workspace'));
  h.click('refresh'); assert.equal(h.requests.length, 3, 'stale finally did not leave loading set');
  await h.resolve(2, local(3)); h.unmount();
});

test('initial local load unmounts and remounts with independent loading ownership', async () => {
  const h = harness(); h.mount(); h.unmount(); h.mount();
  assert.equal(h.requests.length, 2);
  await h.resolve(1, local(2));
  const stale = local(9); stale.boards[0].name = 'Old mount'; await h.resolve(0, stale);
  assert.ok(!h.nodes('button').some(n => n.props['aria-label'] === 'Old mount — Workspace'));
  h.click('refresh'); await h.resolve(2, local(3)); h.unmount();
});

test('manual local GET invalidated by hide preserves draft and resumes without rebasing', async () => {
  const h = harness(); h.mount(); await h.resolve(0, local(1)); await h.choose(); h.editDraft('draft', 'private draft');
  h.click('refresh'); hide(h); show(h);
  assert.equal(h.requests.length, 3);
  const stale = local(9); stale.boards[0].tasks[0].title = 'Stale'; await h.resolve(1, stale);
  const fresh = local(2); fresh.boards[0].tasks[0].title = 'Fresh'; await h.resolve(2, fresh);
  assert.equal(h.nodes('textarea')[0].props.value, 'private draft');
  assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'editTask: Original'));
  h.submit(); assert.equal(JSON.parse(h.requests[3].options.body).expectedRevision, 1);
  h.unmount();
});

test('old local silent GET cannot release a resumed GET or overwrite it', async () => {
  const h = harness(); h.mount(); await h.resolve(0, local(1)); tick(h);
  hide(h); show(h); assert.equal(h.requests.length, 3);
  const stale = local(9); stale.boards[0].name = 'Stale'; await h.resolve(1, stale);
  tick(h); assert.equal(h.requests.length, 3, 'old finally cannot release the current poll');
  const fresh = local(2); fresh.boards[0].name = 'Fresh'; await h.resolve(2, fresh);
  assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'Fresh — Workspace'));
  assert.equal(h.requests.length, 4, 'queued poll starts only when its owner finishes'); h.unmount();
});

test('manual local load unmounts without blocking its remount', async () => {
  const h = harness(); h.mount(); await h.resolve(0, local(1)); h.click('refresh');
  h.unmount(); h.mount(); assert.equal(h.requests.length, 3);
  const stale = local(9); stale.boards[0].name = 'Old mount'; await h.resolve(1, stale);
  const fresh = local(2); fresh.boards[0].name = 'Fresh mount'; await h.resolve(2, fresh);
  assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'Fresh mount — Workspace'));
  h.click('refresh'); await h.resolve(3, local(3)); h.unmount();
});

test('local manual GET cannot cross a connection or workspace target change', async () => {
  for (const change of ['connection', 'workspace']) {
    const h = harness(); h.mount(); await h.resolve(0, local(1));
    h.click('refresh');
    if (change === 'connection') h.generation.set({ id: 2, host: { home: '/' } });
    else h.change(h.nodes('select')[0], 'w');
    const stale = local(9); stale.boards[0].name = 'Stale'; await h.resolve(1, stale);
    assert.ok(!h.nodes('button').some(n => n.props['aria-label'] === 'Stale — Workspace'), change);
    h.click('refresh'); assert.equal(h.requests.length, 3, change);
    await h.resolve(2, local(2)); h.unmount();
  }
});

test('local background snapshot stays silent and never rebases an open draft', async () => {
  const h = harness(); h.mount(); await h.resolve(0, local(1)); await h.choose(); h.editDraft('my draft', 'draft');
  tick(h); assert.equal(h.requests.length, 2);
  const newer = local(2); newer.boards[0].tasks[0].title = 'Other client';
  await h.resolve(1, newer);
  assert.equal(h.nodes('textarea')[0].props.value, 'draft');
  assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'editTask: Original'));
  assert.ok(!h.nodes('div').some(n => n.props.role === 'alert'));
  h.submit(); assert.equal(JSON.parse(h.requests[2].options.body).expectedRevision, 1);
  assert.equal(h.requests.filter(isWrite).length, 1); h.unmount();
});

test('local silent snapshots apply after a draft closes and ignore stale targets', async () => {
  const h = harness(); h.mount(); await h.resolve(0, local(1)); await h.choose(); h.editDraft('draft', 'description');
  tick(h); const newer = local(2); newer.boards[0].tasks[0].title = 'Other client'; await h.resolve(1, newer);
  h.click('cancel'); assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'editTask: Other client'));
  tick(h); h.change(h.nodes('select')[0], '');
  const stale = local(3); stale.boards[0].name = 'Stale board'; await h.resolve(2, stale);
  assert.ok(!h.nodes('button').some(n => n.props['aria-label'] === 'Stale board — Workspace'));
  assert.equal(h.requests.filter(isWrite).length, 0); h.unmount();
});

test('Tracker polling retains board without banners and refreshes silently', async () => {
  const h = await opened(); tick(h);
  assert.ok(h.nodes('article').length); assert.ok(!h.nodes('p').some(n => h.text(n) === 'loading'));
  const trackerIndex = h.requests.findIndex((r, i) => i >= 4 && r.path === 'api/dsh-board.tracker');
  assert.ok(trackerIndex >= 0); await h.resolve(trackerIndex, settings);
  assert.ok(h.nodes('article').length, 'board remains visible while board.read is pending');
  const index = h.requests.findIndex((r, i) => i > trackerIndex && op(r) === 'board.read');
  const changed = { ...board, issues: [{ ...board.issues[0], summary: 'Updated issue' }] };
  await h.resolve(index, changed);
  assert.ok(h.nodes('button').some(n => n.props['aria-label'] === 'issueDetails: Updated issue'));
  assert.equal(h.requests.filter(isWrite).length, 0); h.unmount();
});

test('Tracker silent response cannot cross privacy boundary or unmount', async () => {
  const h = await opened(); tick(h);
  const index = h.requests.findIndex((r, i) => i >= 4 && r.path === 'api/dsh-board.tracker');
  await h.resolve(index, settings);
  const boardIndex = h.requests.findIndex((r, i) => i > index && op(r) === 'board.read');
  hide(h); assert.equal(h.nodes('article').length, 0); await h.resolve(boardIndex, board);
  assert.equal(h.nodes('article').length, 0);
  const before = h.requests.length; h.unmount(); tick(h); assert.equal(h.requests.length, before);
  assert.equal(h.requests.filter(isWrite).length, 0);
});

test('Tracker silent changed binding conceals board without dispatching board read', async () => {
  const h = await opened(); tick(h);
  const index = h.requests.findIndex((r, i) => i >= 4 && r.path === 'api/dsh-board.tracker');
  const count = h.requests.length;
  await h.resolve(index, { ...settings, revision: 2 });
  assert.equal(h.nodes('article').length, 0);
  assert.equal(h.requests.length, count, 'changed principal must not trigger board.read');
  h.unmount();
});

test('Tracker silent board authorization failure conceals cached content', async () => {
  const h = await opened(); tick(h);
  const index = h.requests.findIndex((r, i) => i >= 4 && r.path === 'api/dsh-board.tracker');
  await h.resolve(index, settings);
  const boardIndex = h.requests.findIndex((r, i) => i > index && op(r) === 'board.read');
  await h.resolve(boardIndex, { error: { code: 'board_not_selected' } }, 403);
  assert.equal(h.nodes('article').length, 0); h.unmount();
});

test('Tracker silent authorization failure clears private data immediately', async () => {
  const h = await opened(); tick(h);
  const index = h.requests.findIndex((r, i) => i >= 4 && r.path === 'api/dsh-board.tracker');
  await h.resolve(index, { error: { code: 'credentials_unavailable' } }, 403);
  assert.equal(h.nodes('article').length, 0);
  assert.equal(h.requests.filter(isWrite).length, 0); h.unmount();
});
