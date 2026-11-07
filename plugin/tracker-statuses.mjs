// Derive a status-oriented view from Tracker data, without changing Tracker's
// board configuration or any issue. Both configured and observed statuses are
// real Tracker objects. Inconsistent identities fail closed, never guess.
export function groupTrackerStatuses({ columns, issues }) {
  const fail = () => { throw new TypeError('Invalid Tracker status data'); };
  if (!Array.isArray(columns) || columns.length > 500 || !Array.isArray(issues) || issues.length > 500) fail();
  const byId = new Map(), idByKey = new Map(), groups = [], observedOnly = [], issueKeys = new Set();
  let associations = 0;
  const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && Boolean(value.trim()) && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
  function add(status, columnIndex) {
    if (!status || typeof status !== 'object' || !text(status.id, 128) || !text(status.key, 128) || !text(status.display, 256)) fail();
    const knownId = idByKey.get(status.key), existing = byId.get(status.id);
    if ((knownId !== undefined && knownId !== status.id) || (existing && existing.status.key !== status.key)) fail();
    let group = existing;
    if (!group) {
      if (byId.size >= 500) fail();
      group = { status: { id: status.id, key: status.key, display: status.display }, columnIndexes: [], issues: [] };
      (columnIndex === null ? observedOnly : groups).push(group);
      byId.set(status.id, group); idByKey.set(status.key, status.id);
    }
    // A display label can change or be localized; the observed issue's label
    // is not reinterpreted or used as identity. Preserve the first source label.
    if (columnIndex !== null && !group.columnIndexes.includes(columnIndex)) group.columnIndexes.push(columnIndex);
    return group;
  }
  columns.forEach((column, index) => {
    if (!column || !Array.isArray(column.statuses) || column.statuses.length > 500) fail();
    associations += column.statuses.length;
    if (associations > 5000) fail();
    column.statuses.forEach(status => add(status, index));
  });
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object' || !text(issue.key, 128) || issueKeys.has(issue.key)) fail();
    issueKeys.add(issue.key);
    add(issue.status, null).issues.push(issue);
  }
  // Stable across search order and environments: no locale-dependent collation.
  observedOnly.sort((a, b) => a.status.key < b.status.key ? -1 : a.status.key > b.status.key ? 1 : 0);
  return [...groups, ...observedOnly];
}
