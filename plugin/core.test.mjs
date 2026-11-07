import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from './core.mjs';

const error = (fn, code) => assert.throws(fn, e => e instanceof core.BoardError && e.code === code);
const board = () => core.createBoard(core.createState(), { id: 'b', name: 'Доска' });
function ready() {
  let s = board();
  s = core.createColumn(s, 'b', { id: 'todo', name: 'План' });
  s = core.createColumn(s, 'b', { id: 'done', name: 'Готово' });
  s = core.createIteration(s, 'b', { id: 'i', name: 'Итерация' });
  s = core.createIteration(s, 'b', { id: 'j', name: 'Следующая' });
  return s;
}
function addTask(s, id = 't') {
  return core.createTask(s, 'b', { id, title: 'Проверка', columnId: 'todo', iterationId: 'i', labels: ['важно'], assignee: 'Аня' });
}

test('initial model is JSON roundtrippable, incompatible schemas fail closed', () => {
  const s = addTask(ready());
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.equal(core.validateState(JSON.parse(JSON.stringify(s))), true);
  for (const version of [0, 2, null]) error(() => core.validateState({ ...s, version }), 'UNSUPPORTED_VERSION');
  error(() => core.validateState({ ...s, extra: true }), 'INVALID');
  error(() => core.validateState(null), 'INVALID');
});

test('functions preserve inputs, including on failure, and detach views', () => {
  const s = addTask(ready());
  const before = structuredClone(s);
  const next = core.updateTask(s, 'b', 't', { title: 'Новая', labels: ['новое'] });
  assert.deepEqual(s, before);
  next.boards[0].columns[0].name = 'changed';
  assert.deepEqual(s, before);
  error(() => core.updateTask(s, 'b', 't', { columnId: 'missing' }), 'INVALID');
  assert.deepEqual(s, before);
  const tasks = core.listTasks(s, 'b');
  tasks[0].labels.push('not in state');
  assert.deepEqual(s, before);
  let w = core.ensureWorkspace(s, 'w');
  w = core.assignBoard(w, 'w', 'b');
  const listed = core.listBoards(w, 'w');
  listed[0].tasks[0].title = 'not in state';
  assert.equal(w.boards[0].tasks[0].title, 'Проверка');
});

test('workspace assignments, independent defaults and explicit ordering', () => {
  let s = board();
  s = core.createBoard(s, { id: 'b2', name: 'Вторая' });
  s = core.ensureWorkspace(s, 'w1'); s = core.ensureWorkspace(s, 'w2');
  s = core.assignBoard(s, 'w1', 'b'); s = core.assignBoard(s, 'w1', 'b2');
  s = core.assignBoard(s, 'w2', 'b2');
  s = core.setDefaultBoard(s, 'w1', 'b'); s = core.setDefaultBoard(s, 'w2', 'b2');
  s = core.reorderWorkspaceBoards(s, 'w1', ['b2', 'b']);
  assert.deepEqual(core.listBoards(s, 'w1').map(b => b.id), ['b2', 'b']);
  assert.deepEqual(core.listBoards(s, 'w2').map(b => b.id), ['b2']);
  error(() => core.setDefaultBoard(s, 'w2', 'b'), 'NOT_ASSIGNED');
  error(() => core.reorderWorkspaceBoards(s, 'w1', ['b']), 'INVALID');
  error(() => core.reorderWorkspaceBoards(s, 'w1', ['b', 'b']), 'INVALID');
  error(() => core.assignBoard(s, 'missing', 'b'), 'NOT_FOUND');
  s = core.unassignBoard(s, 'w1', 'b');
  assert.equal(s.workspaces[0].defaultBoardId, null);
  assert.equal(s.workspaces[1].defaultBoardId, 'b2');
  assert.equal(s.boards.length, 2);
});

test('repeated creation, assignment, update and conflicts', () => {
  let s = core.createState();
  const b = { id: 'b', name: 'Доска' };
  s = core.createBoard(s, b); assert.deepEqual(core.createBoard(s, b), s);
  error(() => core.createBoard(s, { ...b, name: 'Другое' }), 'CONFLICT');
  s = core.ensureWorkspace(s, 'w'); assert.deepEqual(core.ensureWorkspace(s, 'w'), s);
  s = core.assignBoard(s, 'w', 'b'); assert.deepEqual(core.assignBoard(s, 'w', 'b'), s);
  s = core.createColumn(s, 'b', { id: 'c', name: 'Колонка' });
  assert.deepEqual(core.createColumn(s, 'b', { id: 'c', name: 'Колонка' }), s);
  const task = { id: 't', title: 'Задача', columnId: 'c' };
  s = core.createTask(s, 'b', task); assert.deepEqual(core.createTask(s, 'b', task), s);
  error(() => core.createTask(s, 'b', { ...task, title: 'Иное' }), 'CONFLICT');
  s = core.createComment(s, 'b', 't', { id: 'c', body: 'Текст' });
  assert.deepEqual(core.createComment(s, 'b', 't', { id: 'c', body: 'Текст' }), s);
  error(() => core.createComment(s, 'b', 't', { id: 'c', body: 'Иное' }), 'CONFLICT');
  s = core.updateTask(s, 'b', 't', { title: 'Новое' });
  assert.deepEqual(core.updateTask(s, 'b', 't', { title: 'Новое' }), s);
  s = core.unassignBoard(s, 'w', 'b'); assert.deepEqual(core.unassignBoard(s, 'w', 'b'), s);
});

test('columns and iterations: consequence preview, explicit move, archive and restore', () => {
  let s = addTask(ready()); s = addTask(s, 'u');
  assert.deepEqual(core.affectedTasks(s, 'b', 'column', 'todo'), ['t', 'u']);
  assert.deepEqual(core.affectedTasks(s, 'b', 'iteration', 'i'), ['t', 'u']);
  error(() => core.archiveColumn(s, 'b', 'todo'), 'IN_USE');
  error(() => core.archiveColumn(s, 'b', 'todo', null), 'INVALID');
  error(() => core.archiveColumn(s, 'b', 'todo', 'todo'), 'INVALID');
  error(() => core.archiveColumn(s, 'b', 'todo', 'absent'), 'NOT_FOUND');
  s = core.archiveColumn(s, 'b', 'todo', 'done');
  assert.deepEqual(core.archiveColumn(s, 'b', 'todo', 'done'), s);
  assert.deepEqual(s.boards[0].tasks.map(t => t.columnId), ['done', 'done']);
  error(() => core.createTask(s, 'b', { id: 'x', title: 'X', columnId: 'todo' }), 'INVALID');
  error(() => core.archiveIteration(s, 'b', 'i'), 'IN_USE');
  s = core.archiveIteration(s, 'b', 'i', null);
  assert.deepEqual(s.boards[0].tasks.map(t => t.iterationId), [null, null]);
  s = core.restoreColumn(s, 'b', 'todo'); s = core.restoreIteration(s, 'b', 'i');
  s = core.updateTask(s, 'b', 't', { columnId: 'todo', iterationId: 'i' });
  s = core.archiveIteration(s, 'b', 'i', 'j');
  assert.equal(s.boards[0].tasks[0].iterationId, 'j');
  assert.equal(s.boards[0].tasks.length, 2);
});

test('archiving board requires explicit unassignment, retains data and permits restoration', () => {
  let s = addTask(ready()); s = core.ensureWorkspace(s, 'w'); s = core.assignBoard(s, 'w', 'b');
  error(() => core.archiveBoard(s, 'b'), 'IN_USE');
  s = core.unassignBoard(s, 'w', 'b'); s = core.archiveBoard(s, 'b');
  assert.deepEqual(core.archiveBoard(s, 'b'), s);
  error(() => core.listTasks(s, 'b'), 'ARCHIVED');
  error(() => core.assignBoard(s, 'w', 'b'), 'ARCHIVED');
  assert.equal(s.boards[0].tasks.length, 1);
  s = core.restoreBoard(s, 'b'); s = core.assignBoard(s, 'w', 'b');
  assert.equal(core.listTasks(s, 'b').length, 1);
});

test('task updates, comments and combined UI filters', () => {
  let s = addTask(ready());
  s = core.createTask(s, 'b', { id: 'u', title: 'Другое', description: 'ПРОВЕРКА описания', columnId: 'done' });
  s = core.createComment(s, 'b', 't', { id: 'comment', body: 'Первый' });
  s = core.updateComment(s, 'b', 't', 'comment', 'Второй');
  assert.equal(s.boards[0].tasks[0].comments[0].body, 'Второй');
  assert.deepEqual(core.listTasks(s, 'b', { search: 'проверка' }).map(t => t.id), ['t', 'u']);
  assert.deepEqual(core.listTasks(s, 'b', { columnId: 'todo', iterationId: 'i', assignee: 'Аня', label: 'важно' }).map(t => t.id), ['t']);
  assert.deepEqual(core.listTasks(s, 'b', { iterationId: null, assignee: null, priority: null }).map(t => t.id), ['u']);
  assert.deepEqual(core.listTasks(s, 'b', { label: 'нет' }), []);
  error(() => core.listTasks(s, 'b', { columnId: 'unknown' }), 'NOT_FOUND');
  error(() => core.listTasks(s, 'b', { bad: true }), 'INVALID');
  error(() => core.updateTask(s, 'b', 't', { id: 'u' }), 'INVALID');
  s = core.updateTask(s, 'b', 't', { title: 'Готово', description: '', columnId: 'done', iterationId: null, assignee: null, labels: [], priority: 'Высокий' });
  assert.deepEqual(core.listTasks(s, 'b', { priority: 'Высокий' }).map(t => t.id), ['t']);
});

test('strict shape and referential integrity validation', () => {
  const good = addTask(ready());
  const invalid = mutate => { const s = structuredClone(good); mutate(s); error(() => core.validateState(s), 'INVALID'); };
  invalid(s => { s.boards.push(structuredClone(s.boards[0])); });
  invalid(s => { s.boards[0].tasks[0].columnId = 'unknown'; });
  invalid(s => { s.boards[0].columns[0].archived = true; });
  invalid(s => { s.boards[0].tasks[0].iterationId = 'unknown'; });
  invalid(s => { s.boards[0].iterations[0].archived = true; });
  invalid(s => { s.boards[0].tasks[0].labels = ['x', 'x']; });
  invalid(s => { s.boards[0].tasks[0].comments = [{ id: 'c', body: 'x' }, { id: 'c', body: 'y' }]; });
  invalid(s => { s.workspaces.push({ id: 'w', boardIds: ['missing'], defaultBoardId: null }); });
  invalid(s => { s.workspaces.push({ id: 'w', boardIds: [], defaultBoardId: 'b' }); });
  invalid(s => { s.workspaces.push({ id: 'w', boardIds: ['b', 'b'], defaultBoardId: null }); });
  invalid(s => { s.boards[0].name = '  '; });
  invalid(s => { s.boards[0].tasks[0].id = ' t '; });
  invalid(s => { s.boards[0].tasks[0].source = 'remote'; });
  error(() => core.createBoard(good, { id: '', name: 'X' }), 'INVALID');
  error(() => core.createTask(good, 'b', { id: 'x', title: 'X', columnId: 'todo', labels: ['x', 'x'] }), 'INVALID');
  error(() => core.createTask(good, 'b', { id: 'x', title: 'X', columnId: 'todo', description: null }), 'INVALID');
});

test('rename and ordering operations require existing IDs and complete permutations', () => {
  let s = ready();
  s = core.renameBoard(s, 'b', 'Другой'); s = core.renameColumn(s, 'b', 'todo', 'К работе');
  s = core.renameIteration(s, 'b', 'i', 'Новая');
  s = core.reorderColumns(s, 'b', ['done', 'todo']);
  s = core.reorderIterations(s, 'b', ['j', 'i']);
  assert.deepEqual(s.boards[0].columns.map(c => c.id), ['done', 'todo']);
  assert.deepEqual(s.boards[0].iterations.map(i => i.id), ['j', 'i']);
  error(() => core.reorderColumns(s, 'b', ['todo', 'absent']), 'INVALID');
  error(() => core.reorderIterations(s, 'b', ['j', 'j']), 'INVALID');
  error(() => core.renameColumn(s, 'b', 'absent', 'X'), 'NOT_FOUND');
  error(() => core.affectedTasks(s, 'b', 'board', 'todo'), 'INVALID');
});
