import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';

// Execute only the declarations from the actual client harness: its transport,
// sources, React and browser are all in memory, with no profile or network.
const tests = await readFile(new URL('./client.test.mjs', import.meta.url), 'utf8');
const start = tests.indexOf('const client = '), end = tests.indexOf("test('board command");
assert.ok(start >= 0 && end > start, 'client harness declarations not found');
const declarations = tests.slice(start, end).replace("new URL('./client.js', import.meta.url)", "new URL('./client.js', baseUrl)");
const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const prelude = declarations.replace(/^const client = .*?;\n/m, '');
const { harness, base, settle } = vm.runInNewContext(`(function () { ${prelude}\n return { harness, base, settle }; })()`, { client, vm, TextEncoder, URL, AbortController, assert, baseUrl: import.meta.url });

const all = JSON.stringify(['all']);
const unassigned = JSON.stringify(['unassigned']);
const unknown = JSON.stringify(['unknown']);
const assigned = value => JSON.stringify(['assignee', value]);

function select(h, label) {
  const matches = h.nodes('select').filter(node => node.props['aria-label'] === label);
  assert.equal(matches.length, 1, `select aria-label=${label}`);
  return matches[0];
}
function filter(h, label, value) {
  const node = select(h, label);
  assert.ok(node.children.some(option => option?.props?.value === value), `${label} option ${value}`);
  h.change(node, value);
}
function titles(h) {
  return Array.from(h.nodes('article'), article => h.text(article)).sort();
}
function localTitles(h) {
  return Array.from(h.nodes('button'), n => n.props['aria-label']).filter(label => label?.startsWith('editTask: ')).map(label => label.slice('editTask: '.length)).sort();
}
function edit(h, title) {
  const button = h.nodes('button').find(node => node.props['aria-label'] === `editTask: ${title}`);
  assert.ok(button, `edit task ${title}`);
  button.props.onClick();
}
function assigneeInput(h) {
  const label = h.nodes('label').find(node => node.children[0] === 'assignee' && node.children.some(child => child?.type === 'input'));
  assert.ok(label, 'assignee form input');
  return label.children.find(child => child?.type === 'input');
}

async function local() {
  const h = harness({
    ids: ['member', 'shared-only'],
    workspaces: [
      { workspaceId: 'w', title: 'One', sessionIds: ['member'] },
      { workspaceId: 'w2', title: 'Two', sessionIds: ['shared-only'] },
    ],
  });
  const snapshot = base();
  snapshot.boards[0].statuses.push({ id: 'done', name: 'Done', position: 1 });
  snapshot.boards[0].tasks = [
    { id: 'both', title: 'Needle member', description: '', statusId: 's', assignee: 'Alex' },
    { id: 'foreign', title: 'Needle foreign', description: '', statusId: 's', assignee: 'Alex' },
    { id: 'none', title: 'Needle no link', description: '', statusId: 's', assignee: 'Alex' },
    { id: 'done', title: 'Needle done', description: '', statusId: 'done', assignee: 'Alex' },
    { id: 'other', title: 'Needle other', description: '', statusId: 's', assignee: 'Blair' },
    { id: 'query', title: 'Different member', description: '', statusId: 's', assignee: 'Alex' },
    { id: 'null', title: 'Explicitly unassigned', statusId: 's', assignee: null },
    { id: 'missing', title: 'Unknown assignee', statusId: 's' },
  ];
  snapshot.links = [
    { boardId: 'b', taskId: 'both', sessionId: 'member' },
    { boardId: 'b', taskId: 'both', sessionId: 'shared-only' },
    { boardId: 'b', taskId: 'foreign', sessionId: 'shared-only' },
    { boardId: 'b', taskId: 'done', sessionId: 'member' },
    { boardId: 'b', taskId: 'other', sessionId: 'member' },
    { boardId: 'b', taskId: 'query', sessionId: 'member' },
  ];
  h.mount(); await h.resolve(0, snapshot); h.tile('Board — One').props.onClick(); await settle();
  return { h, snapshot };
}

test('local assignee and workspace session filters intersect status and query in board and list views', async () => {
  const { h } = await local();
  try {
    assert.equal(select(h, 'assignee').props.value, all);
    assert.equal(select(h, 'sessionFilter').props.value, 'all');
    filter(h, 'assignee', assigned('Alex'));
    filter(h, 'sessionFilter', 'linked');
    filter(h, 'status', 's');
    const search = h.nodes('input').find(node => node.props['aria-label'] === 'search');
    assert.ok(search); h.change(search, '  NEEDLE  ');
    assert.deepEqual(localTitles(h), ['Needle member']);
    h.click('listView');
    assert.deepEqual(localTitles(h), ['Needle member'], 'switching view preserves all filter intersections');
    filter(h, 'sessionFilter', 'unlinked');
    assert.deepEqual(localTitles(h), ['Needle foreign', 'Needle no link'], 'a link only in a different workspace does not count');
    filter(h, 'sessionFilter', 'all');
    assert.deepEqual(localTitles(h), ['Needle foreign', 'Needle member', 'Needle no link']);
    h.click('boardView');
    assert.deepEqual(localTitles(h), ['Needle foreign', 'Needle member', 'Needle no link']);
    assert.equal(h.requests.length, 1, 'filtering and changing views never write');
  } finally { h.unmount(); }
});

test('local unassigned and missing assignee remain distinct filter values', async () => {
  const { h } = await local();
  try {
    filter(h, 'assignee', unassigned);
    assert.deepEqual(localTitles(h), ['Explicitly unassigned']);
    filter(h, 'assignee', unknown);
    assert.deepEqual(localTitles(h), ['Unknown assignee']);
    filter(h, 'assignee', all);
    assert.equal(localTitles(h).length, 8);
  } finally { h.unmount(); }
});

test('editing and clearing assignee sends only explicitly changed fields', async () => {
  const { h, snapshot } = await local();
  try {
    edit(h, 'Unknown assignee');
    assert.equal(assigneeInput(h).props.value, '');
    h.submit();
    let task = JSON.parse(h.requests[1].options.body).task;
    assert.equal(task.id, 'missing'); assert.equal(Object.hasOwn(task, 'assignee'), false, 'untouched missing value must stay missing');
    await h.resolve(1, { ...snapshot, revision: 5 });

    edit(h, 'Needle member');
    assert.equal(assigneeInput(h).props.value, 'Alex');
    h.change(assigneeInput(h), '  '); h.submit();
    task = JSON.parse(h.requests[2].options.body).task;
    assert.equal(task.assignee, null, 'clearing explicitly unassigns');
    const cleared = { ...snapshot, revision: 6, boards: snapshot.boards.map(board => ({ ...board, tasks: board.tasks.map(item => item.id === 'both' ? { ...item, assignee: null } : item) })) };
    await h.resolve(2, cleared);

    edit(h, 'Explicitly unassigned');
    h.change(assigneeInput(h), '  Casey  '); h.submit();
    task = JSON.parse(h.requests[3].options.body).task;
    assert.equal(task.assignee, 'Casey', 'explicit edit is trimmed');
    await h.resolve(3, { ...cleared, revision: 7 });
  } finally { h.unmount(); }
});

test('selected local assignee remains visible when the last matching task changes', async () => {
  const { h, snapshot } = await local();
  try {
    filter(h, 'assignee', assigned('Blair'));
    edit(h, 'Needle other'); h.change(assigneeInput(h), 'New synthetic owner'); h.submit();
    const updated = { ...snapshot, revision: 5, boards: snapshot.boards.map(board => ({ ...board, tasks: board.tasks.map(task => task.id === 'other' ? { ...task, assignee: 'New synthetic owner' } : task) })) };
    await h.resolve(1, updated);
    const node = select(h, 'assignee');
    assert.equal(node.props.value, assigned('Blair'));
    const selected = node.children.find(option => option?.props?.value === assigned('Blair'));
    assert.ok(selected, 'controlled select must not silently display All');
    assert.equal(h.text(selected), 'assigneeUnavailable');
    assert.deepEqual(localTitles(h), []);
  } finally { h.unmount(); }
});

test('partial Tracker board filters known identities, explicit unassigned and unknown independently', async () => {
  const h = harness({ manualTracker: true });
  const settings = { revision: 1, configured: true, orgType: 'cloud', workspaces: { w: ['1'] }, needsReselect: [] };
  const status = { key: 'open', display: 'Open' };
  const board = {
    board: { id: '1', name: 'Synthetic Tracker' },
    columns: [{ id: 'c', name: 'Open', statuses: [{ key: 'open' }] }],
    issues: [
      { key: 'S-1', summary: 'First identity', status, assigneeKnown: true, assignee: { id: 'id-1', display: 'Same name' } },
      { key: 'S-2', summary: 'Second identity', status, assigneeKnown: true, assignee: { id: 'id-2', display: 'Same name' } },
      { key: 'S-3', summary: 'No assignee', status, assigneeKnown: true, assignee: null },
      { key: 'S-4', summary: 'Missing assignee', status },
      { key: 'S-5', summary: 'Malformed assignee', status, assigneeKnown: true, assignee: { display: 'Same name' } },
    ], issuesComplete: false, issuesReason: 'approximate_board_filter',
  };
  try {
    h.mount(); await h.resolve(0, { revision: 1, boards: [], links: [] }); await h.resolve(1, settings);
    h.tile('tracker #1 — Workspace — tracker').props.onClick();
    await h.resolve(2, settings); await h.resolve(3, board);
    assert.ok(h.nodes('p').some(node => h.text(node).includes('trackerPartial')), 'partial data is disclosed');
    assert.equal(titles(h).length, 5);
    const options = Array.from(select(h, 'assignee').children).filter(child => child?.type === 'option');
    const identities = options.filter(option => [assigned('id-1'), assigned('id-2')].includes(option.props.value));
    assert.equal(identities.length, 2);
    assert.deepEqual(identities.map(option => h.text(option)).sort(), ['Same name (id-1)', 'Same name (id-2)']);
    for (const [value, expected] of [
      [assigned('id-1'), ['First identity']], [assigned('id-2'), ['Second identity']],
      [unassigned, ['No assignee']], [unknown, ['Malformed assignee', 'Missing assignee']],
    ]) {
      filter(h, 'assignee', value);
      const actual = Array.from(h.nodes('button').filter(node => node.props['aria-label']?.startsWith('issueDetails: ')), node => h.text(node)).sort();
      assert.deepEqual(actual, expected, `Tracker filter ${value}`);
      assert.ok(h.nodes('p').some(node => h.text(node).includes('trackerPartial')), 'filter does not hide partial warning');
    }
    filter(h, 'assignee', all); assert.equal(titles(h).length, 5);
    assert.equal(h.requests.length, 4, 'client-side filters do not request or mutate Tracker');
  } finally { h.unmount(); }
});
