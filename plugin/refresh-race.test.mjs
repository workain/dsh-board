import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';

// Reuse the real client harness without modifying its implementation or registering
// its test cases. Reading only its declarations keeps these races independent.
const tests = await readFile(new URL('./client.test.mjs', import.meta.url), 'utf8');
const start = tests.indexOf('const client = '), end = tests.indexOf("test('board command");
assert.ok(start >= 0 && end > start, 'client harness declarations not found');
const declarations = tests.slice(start, end).replace("new URL('./client.js', import.meta.url)", "new URL('./client.js', baseUrl)");
const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const prelude = declarations.replace(/^const client = .*?;\n/m, '');
const { harness, settle } = vm.runInNewContext(`(function () { ${prelude}\n return { harness, settle }; })()`, { client, vm, TextEncoder, assert, baseUrl: import.meta.url });
const base = { revision: 1, boards: [], links: [] };
const settings = { revision: 1, configured: true, orgType: 'cloud', workspaces: { w: ['1'] }, needsReselect: [] };
const board = { board: { id: '1', name: 'Private board' }, columns: [{ id: 'c', name: 'Open', statuses: [{ key: 'open' }] }], issues: [{ key: 'X-1', summary: 'Private issue', status: { key: 'open', display: 'Open' } }], issuesComplete: false };
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
