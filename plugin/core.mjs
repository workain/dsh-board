// Pure, local board model. IDs are supplied by the caller, never generated here.
// Persistence, locking/CAS, authorization, sessions and rendering belong to the host.
// Each state is one JSON-compatible aggregate: validate before accepting stored data.

export class BoardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BoardError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new BoardError(code, message); };
const check = (condition, code, message) => { if (!condition) fail(code, message); };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function shape(value, keys, label) {
  check(plain(value), 'INVALID', `${label} must be an object`);
  const actual = Reflect.ownKeys(value);
  check(actual.every(key => typeof key === 'string' && keys.includes(key))
    && keys.every(key => own(value, key)), 'INVALID', `${label} has invalid fields`);
}
function input(value, allowed, required, label) {
  check(plain(value), 'INVALID', `${label} must be an object`);
  check(Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key))
    && required.every(key => own(value, key)), 'INVALID', `${label} has invalid fields`);
}
function text(value, label, empty = false) {
  check(typeof value === 'string' && (empty || value.trim().length > 0), 'INVALID', `${label} must be ${empty ? 'a string' : 'non-empty text'}`);
}
function id(value, label = 'id') {
  text(value, label);
  check(value === value.trim(), 'INVALID', `${label} must not have surrounding whitespace`);
}
function array(value, label) { check(Array.isArray(value), 'INVALID', `${label} must be an array`); }
function unique(values, label) { check(new Set(values).size === values.length, 'INVALID', `${label} contains duplicates`); }
function optionalId(value, label) { if (value !== null) id(value, label); }
function ensureRef(items, value, label, active = false) {
  const result = items.find(item => item.id === value);
  check(result !== undefined, 'NOT_FOUND', `${label} not found`);
  if (active) check(!result.archived, 'ARCHIVED', `${label} is archived`);
  return result;
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function noDuplicates(items, label) { unique(items.map(item => item.id), label); }
function assertIds(items, label) { array(items, label); items.forEach(value => id(value, label)); unique(items, label); }
function validateColumn(column) {
  shape(column, ['id', 'name', 'archived'], 'column');
  id(column.id); text(column.name, 'column name');
  check(typeof column.archived === 'boolean', 'INVALID', 'column archived must be boolean');
}
function validateIteration(iteration) {
  shape(iteration, ['id', 'name', 'archived'], 'iteration');
  id(iteration.id); text(iteration.name, 'iteration name');
  check(typeof iteration.archived === 'boolean', 'INVALID', 'iteration archived must be boolean');
}
function validateComment(comment) {
  shape(comment, ['id', 'body'], 'comment');
  id(comment.id); text(comment.body, 'comment body');
}
function validateTask(task, board) {
  shape(task, ['id', 'title', 'description', 'columnId', 'iterationId', 'assignee', 'labels', 'priority', 'comments'], 'task');
  id(task.id); text(task.title, 'task title'); text(task.description, 'description', true);
  id(task.columnId, 'columnId');
  const column = board.columns.find(item => item.id === task.columnId);
  check(column && !column.archived, 'INVALID', 'task references missing or archived column');
  optionalId(task.iterationId, 'iterationId');
  if (task.iterationId !== null) {
    const iteration = board.iterations.find(item => item.id === task.iterationId);
    check(iteration && !iteration.archived, 'INVALID', 'task references missing or archived iteration');
  }
  if (task.assignee !== null) text(task.assignee, 'assignee');
  if (task.priority !== null) text(task.priority, 'priority');
  array(task.labels, 'labels'); task.labels.forEach(label => text(label, 'label')); unique(task.labels, 'labels');
  array(task.comments, 'comments'); task.comments.forEach(validateComment); noDuplicates(task.comments, 'comments');
}
function validateBoard(board) {
  shape(board, ['id', 'name', 'archived', 'columns', 'iterations', 'tasks'], 'board');
  id(board.id); text(board.name, 'board name');
  check(typeof board.archived === 'boolean', 'INVALID', 'board archived must be boolean');
  array(board.columns, 'columns'); board.columns.forEach(validateColumn); noDuplicates(board.columns, 'columns');
  array(board.iterations, 'iterations'); board.iterations.forEach(validateIteration); noDuplicates(board.iterations, 'iterations');
  array(board.tasks, 'tasks'); board.tasks.forEach(task => validateTask(task, board)); noDuplicates(board.tasks, 'tasks');
}

/** Throw BoardError on invalid/incompatible state; return true on success. */
export function validateState(state) {
  shape(state, ['version', 'boards', 'workspaces'], 'state');
  check(state.version === 1, 'UNSUPPORTED_VERSION', 'unsupported state version');
  array(state.boards, 'boards'); state.boards.forEach(validateBoard); noDuplicates(state.boards, 'boards');
  array(state.workspaces, 'workspaces');
  for (const workspace of state.workspaces) {
    shape(workspace, ['id', 'boardIds', 'defaultBoardId'], 'workspace');
    id(workspace.id, 'workspace id'); assertIds(workspace.boardIds, 'boardIds');
    optionalId(workspace.defaultBoardId, 'defaultBoardId');
    check(workspace.defaultBoardId === null || workspace.boardIds.includes(workspace.defaultBoardId), 'INVALID', 'default board must be assigned');
    for (const boardId of workspace.boardIds) {
      const board = state.boards.find(item => item.id === boardId);
      check(board !== undefined, 'INVALID', 'workspace references missing board');
      check(!board.archived, 'INVALID', 'workspace references archived board');
    }
  }
  noDuplicates(state.workspaces, 'workspaces');
  return true;
}

export function createState() { return { version: 1, boards: [], workspaces: [] }; }
function change(state, callback) {
  validateState(state);
  const next = structuredClone(state);
  callback(next);
  validateState(next);
  return next;
}
function boardOf(state, boardId, active = true) { id(boardId, 'boardId'); return ensureRef(state.boards, boardId, 'board', active); }
function workspaceOf(state, workspaceId) { id(workspaceId, 'workspaceId'); return ensureRef(state.workspaces, workspaceId, 'workspace'); }
function taskOf(board, taskId) { id(taskId, 'taskId'); return ensureRef(board.tasks, taskId, 'task'); }
function appendUnique(items, item, label) {
  const existing = items.find(entry => entry.id === item.id);
  if (existing) {
    check(same(existing, item), 'CONFLICT', `${label} ID already exists with different data`);
    return;
  }
  items.push(item);
}
function applyPatch(target, patch, allowed, label) {
  input(patch, allowed, [], label);
  for (const key of Object.keys(patch)) target[key] = structuredClone(patch[key]);
}

export function createBoard(state, data) {
  input(data, ['id', 'name'], ['id', 'name'], 'board');
  id(data.id); text(data.name, 'board name');
  return change(state, next => appendUnique(next.boards, { id: data.id, name: data.name, archived: false, columns: [], iterations: [], tasks: [] }, 'board'));
}
export function renameBoard(state, boardId, name) {
  text(name, 'board name');
  return change(state, next => { boardOf(next, boardId).name = name; });
}
/** Archive without deleting data; explicitly unassign first. Repeating archive is safe. */
export function archiveBoard(state, boardId) {
  return change(state, next => {
    const board = boardOf(next, boardId, false);
    if (board.archived) return;
    check(!next.workspaces.some(workspace => workspace.boardIds.includes(boardId)), 'IN_USE', 'board is assigned to a workspace');
    board.archived = true;
  });
}
export function restoreBoard(state, boardId) {
  return change(state, next => { boardOf(next, boardId, false).archived = false; });
}
export function ensureWorkspace(state, workspaceId) {
  id(workspaceId, 'workspaceId');
  return change(state, next => {
    if (!next.workspaces.some(workspace => workspace.id === workspaceId)) next.workspaces.push({ id: workspaceId, boardIds: [], defaultBoardId: null });
  });
}
export function assignBoard(state, workspaceId, boardId) {
  return change(state, next => {
    const workspace = workspaceOf(next, workspaceId); boardOf(next, boardId);
    if (!workspace.boardIds.includes(boardId)) workspace.boardIds.push(boardId);
  });
}
export function unassignBoard(state, workspaceId, boardId) {
  id(boardId, 'boardId');
  return change(state, next => {
    const workspace = workspaceOf(next, workspaceId);
    workspace.boardIds = workspace.boardIds.filter(item => item !== boardId);
    if (workspace.defaultBoardId === boardId) workspace.defaultBoardId = null;
  });
}
export function setDefaultBoard(state, workspaceId, boardId) {
  optionalId(boardId, 'boardId');
  return change(state, next => {
    const workspace = workspaceOf(next, workspaceId);
    check(boardId === null || workspace.boardIds.includes(boardId), 'NOT_ASSIGNED', 'board is not assigned to workspace');
    workspace.defaultBoardId = boardId;
  });
}
function reorder(items, orderedIds, label) {
  assertIds(orderedIds, `${label} ids`);
  check(orderedIds.length === items.length && orderedIds.every(item => items.some(entry => entry.id === item)), 'INVALID', `order must contain all ${label} ids exactly once`);
  return orderedIds.map(item => items.find(entry => entry.id === item));
}
export function reorderWorkspaceBoards(state, workspaceId, boardIds) {
  assertIds(boardIds, 'boardIds');
  return change(state, next => {
    const workspace = workspaceOf(next, workspaceId);
    check(boardIds.length === workspace.boardIds.length && boardIds.every(item => workspace.boardIds.includes(item)), 'INVALID', 'order must contain all assigned boards exactly once');
    workspace.boardIds = [...boardIds];
  });
}
function createNamed(state, boardId, data, collection, label) {
  input(data, ['id', 'name'], ['id', 'name'], label); id(data.id); text(data.name, `${label} name`);
  return change(state, next => appendUnique(boardOf(next, boardId)[collection], { id: data.id, name: data.name, archived: false }, label));
}
export function createColumn(state, boardId, data) { return createNamed(state, boardId, data, 'columns', 'column'); }
export function createIteration(state, boardId, data) { return createNamed(state, boardId, data, 'iterations', 'iteration'); }
function renameNamed(state, boardId, itemId, name, collection, label) {
  id(itemId); text(name, `${label} name`);
  return change(state, next => { ensureRef(boardOf(next, boardId)[collection], itemId, label, true).name = name; });
}
export function renameColumn(state, boardId, columnId, name) { return renameNamed(state, boardId, columnId, name, 'columns', 'column'); }
export function renameIteration(state, boardId, iterationId, name) { return renameNamed(state, boardId, iterationId, name, 'iterations', 'iteration'); }
export function reorderColumns(state, boardId, columnIds) {
  return change(state, next => { const board = boardOf(next, boardId); board.columns = reorder(board.columns, columnIds, 'column'); });
}
export function reorderIterations(state, boardId, iterationIds) {
  return change(state, next => { const board = boardOf(next, boardId); board.iterations = reorder(board.iterations, iterationIds, 'iteration'); });
}
/** Inspect consequences before archiving. Returned task IDs are detached from state. */
export function affectedTasks(state, boardId, kind, itemId) {
  validateState(state); const board = boardOf(state, boardId); id(itemId);
  check(kind === 'column' || kind === 'iteration', 'INVALID', 'kind must be column or iteration');
  ensureRef(kind === 'column' ? board.columns : board.iterations, itemId, kind);
  return board.tasks.filter(task => task[kind === 'column' ? 'columnId' : 'iterationId'] === itemId).map(task => task.id);
}
/** When tasks exist, targetId must explicitly name an active replacement; for iterations null clears assignment. */
function archiveNamed(state, boardId, itemId, targetId, collection, field, label) {
  id(itemId); if (targetId !== undefined) optionalId(targetId, 'targetId');
  return change(state, next => {
    const board = boardOf(next, boardId), item = ensureRef(board[collection], itemId, label);
    if (item.archived) return;
    const affected = board.tasks.filter(task => task[field] === itemId);
    if (affected.length) {
      check(targetId !== undefined, 'IN_USE', `${label} has tasks; explicit replacement required`);
      check(label === 'iteration' || targetId !== null, 'INVALID', 'column replacement must be a column');
      check(targetId !== itemId, 'INVALID', 'replacement must differ');
      if (targetId !== null) ensureRef(board[collection], targetId, `replacement ${label}`, true);
      for (const task of affected) task[field] = targetId;
    } else if (targetId !== undefined && targetId !== null) {
      check(targetId !== itemId, 'INVALID', 'replacement must differ');
      ensureRef(board[collection], targetId, `replacement ${label}`, true);
    } else if (label === 'column' && targetId === null) fail('INVALID', 'column replacement must be a column');
    item.archived = true;
  });
}
export function archiveColumn(state, boardId, columnId, replacementId) { return archiveNamed(state, boardId, columnId, replacementId, 'columns', 'columnId', 'column'); }
export function archiveIteration(state, boardId, iterationId, replacementId) { return archiveNamed(state, boardId, iterationId, replacementId, 'iterations', 'iterationId', 'iteration'); }
function restoreNamed(state, boardId, itemId, collection, label) {
  id(itemId); return change(state, next => { ensureRef(boardOf(next, boardId)[collection], itemId, label).archived = false; });
}
export function restoreColumn(state, boardId, columnId) { return restoreNamed(state, boardId, columnId, 'columns', 'column'); }
export function restoreIteration(state, boardId, iterationId) { return restoreNamed(state, boardId, iterationId, 'iterations', 'iteration'); }

export function createTask(state, boardId, data) {
  input(data, ['id', 'title', 'columnId', 'description', 'iterationId', 'assignee', 'labels', 'priority'], ['id', 'title', 'columnId'], 'task');
  const task = { id: data.id, title: data.title, description: data.description === undefined ? '' : data.description, columnId: data.columnId,
    iterationId: data.iterationId === undefined ? null : data.iterationId, assignee: data.assignee === undefined ? null : data.assignee,
    labels: data.labels === undefined ? [] : structuredClone(data.labels), priority: data.priority === undefined ? null : data.priority, comments: [] };
  return change(state, next => { const board = boardOf(next, boardId); validateTask(task, board); appendUnique(board.tasks, task, 'task'); });
}
export function updateTask(state, boardId, taskId, patch) {
  return change(state, next => {
    const board = boardOf(next, boardId), task = taskOf(board, taskId);
    applyPatch(task, patch, ['title', 'description', 'columnId', 'iterationId', 'assignee', 'labels', 'priority'], 'task patch');
  });
}
export function createComment(state, boardId, taskId, data) {
  input(data, ['id', 'body'], ['id', 'body'], 'comment');
  const comment = { id: data.id, body: data.body }; validateComment(comment);
  return change(state, next => appendUnique(taskOf(boardOf(next, boardId), taskId).comments, comment, 'comment'));
}
export function updateComment(state, boardId, taskId, commentId, body) {
  id(commentId); text(body, 'comment body');
  return change(state, next => { ensureRef(taskOf(boardOf(next, boardId), taskId).comments, commentId, 'comment').body = body; });
}

/** Detached views for UI; filters combine with AND, labels are exact, search is case-insensitive. */
export function listBoards(state, workspaceId) {
  validateState(state); const workspace = workspaceOf(state, workspaceId);
  return workspace.boardIds.map(boardId => structuredClone(boardOf(state, boardId)));
}
export function listTasks(state, boardId, filters = {}) {
  validateState(state); const board = boardOf(state, boardId);
  input(filters, ['search', 'columnId', 'iterationId', 'assignee', 'label', 'priority'], [], 'filters');
  for (const key of ['search', 'columnId', 'label']) if (own(filters, key)) text(filters[key], key, key === 'search');
  for (const key of ['iterationId', 'assignee', 'priority']) if (own(filters, key) && filters[key] !== null) text(filters[key], key);
  if (own(filters, 'columnId')) ensureRef(board.columns, filters.columnId, 'column');
  if (own(filters, 'iterationId') && filters.iterationId !== null) ensureRef(board.iterations, filters.iterationId, 'iteration');
  const needle = filters.search?.toLowerCase();
  return structuredClone(board.tasks.filter(task =>
    (needle === undefined || `${task.title}\n${task.description}`.toLowerCase().includes(needle)) &&
    (!own(filters, 'columnId') || task.columnId === filters.columnId) &&
    (!own(filters, 'iterationId') || task.iterationId === filters.iterationId) &&
    (!own(filters, 'assignee') || task.assignee === filters.assignee) &&
    (!own(filters, 'priority') || task.priority === filters.priority) &&
    (!own(filters, 'label') || task.labels.includes(filters.label))));
}
