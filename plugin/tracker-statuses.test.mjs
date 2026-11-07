import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTrackerStatuses } from './tracker-statuses.mjs';

const status = (id, key, display = key) => ({ id, key, display });
const issue = (key, value) => ({ key, status: value });

test('preserves configured order and empty statuses, then observed-only statuses', () => {
  const open = status('1', 'open'), pending = status('2', 'pending'), closed = status('3', 'closed'), absent = status('4', 'needInfo');
  const input = { columns: [{ statuses: [open, pending] }, { statuses: [closed] }], issues: [issue('A-1', absent), issue('A-2', open), issue('A-3', absent)] };
  const before = structuredClone(input);
  const result = groupTrackerStatuses(input);
  assert.deepEqual(result.map(g => g.status.key), ['open', 'pending', 'closed', 'needInfo']);
  assert.deepEqual(result.map(g => g.issues.length), [1, 0, 0, 2]);
  assert.deepEqual(result.map(g => g.columnIndexes), [[0], [0], [1], []]);
  assert.deepEqual(input, before);
});

test('one status with multiple source columns is a single explicitly ambiguous group', () => {
  const s = status('1', 'open');
  const groups = groupTrackerStatuses({ columns: [{ statuses: [s, s] }, { statuses: [s] }], issues: [issue('A-1', s)] });
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].columnIndexes, [0, 1]);
  assert.equal(groups[0].issues.length, 1);
});

test('identical display labels do not merge distinct real identities', () => {
  const result = groupTrackerStatuses({ columns: [{ statuses: [status('1', 'first', 'Same'), status('2', 'second', 'Same')] }], issues: [] });
  assert.deepEqual(result.map(g => g.status.id), ['1', '2']);
});

test('identity conflicts and malformed or excessive input fail closed', () => {
  const s = status('1', 'open');
  const badInputs = [
    { columns: [{ statuses: [s, status('2', 'open')] }], issues: [] },
    { columns: [{ statuses: [s, status('1', 'other')] }], issues: [] },
    { columns: [{ statuses: [s] }], issues: [issue('A-1', status('2', 'open'))] },
    { columns: [{ statuses: [{ key: 'open', display: 'Open' }] }], issues: [] },
    { columns: [{ statuses: [status('1', 'open', '')] }], issues: [] },
    { columns: [], issues: [issue('A-1', null)] },
    { columns: [], issues: [issue('A-1', s), issue('A-1', s)] },
    { columns: [], issues: [issue('', s)] },
    { columns: Array.from({ length: 11 }, () => ({ statuses: Array(500).fill(s) })), issues: [] },
    { columns: [{ statuses: Array.from({ length: 500 }, (_, i) => status(String(i), `status${i}`)) }], issues: [issue('A-1', status('501', 'extra'))] },
    { columns: Array(501).fill({ statuses: [] }), issues: [] },
    { columns: [], issues: Array(501).fill(issue('A-1', s)) },
    { columns: [{ statuses: Array(501).fill(s) }], issues: [] },
  ];
  for (const input of badInputs) assert.throws(() => groupTrackerStatuses(input), TypeError);
});

test('observed-only statuses have deterministic key order regardless of issue order', () => {
  const items = [issue('A-1', status('1', 'z')), issue('A-2', status('2', 'a'))];
  const keys = issues => groupTrackerStatuses({ columns: [], issues }).map(group => group.status.key);
  assert.deepEqual(keys(items), ['a', 'z']);
  assert.deepEqual(keys([...items].reverse()), ['a', 'z']);
});

test('accepts boundary of 5000 associations and 500 distinct statuses', () => {
  const statuses = Array.from({ length: 500 }, (_, i) => status(String(i), `status${i}`));
  const columns = Array.from({ length: 10 }, () => ({ statuses }));
  assert.equal(groupTrackerStatuses({ columns, issues: [] }).length, 500);
});

test('display labels are not identity and issue object retains its own status', () => {
  const configured = status('1', 'open', 'Original'), observed = status('1', 'open', 'Changed');
  const task = issue('A-1', observed);
  const [group] = groupTrackerStatuses({ columns: [{ statuses: [configured] }], issues: [task] });
  assert.equal(group.status.display, 'Original');
  assert.equal(group.issues[0].status.display, 'Changed');
});
