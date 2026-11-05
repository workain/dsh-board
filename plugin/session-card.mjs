// A session-scoped, read-only view. Nothing in this module mutates Tracker or a board.
export function createSessionCard(React, deps) {
  const h = React.createElement;
  const { useEffect, useRef, useState, useSyncExternalStore } = React;
  const { transport, ws, sessions, connection, sidebarRight, renderTrackerText, t, openBoardForSession } = deps;
  const source = value => value?.getSnapshot ? value : value?.list || value?.generation;
  const wsSource = source(ws), sessionSource = source(sessions), connectionSource = source(connection), mountedSource = sidebarRight.mounted;
  const useSource = store => useSyncExternalStore(fn => store.subscribe(fn), () => store.getSnapshot(), () => store.getSnapshot());
  const text = (key, fallback) => { const value = typeof t === 'function' ? t(key) : null; return typeof value === 'string' && value && value !== key ? value : fallback; };
  const authError = error => [401, 403, 404, 409, 412].includes(error?.status) || ['needs_reselect', 'unauthorized', 'forbidden', 'not_found', 'issue_not_in_selected_boards', 'board_not_selected', 'conflict', 'credential_changed', 'credentials_unavailable', 'invalid_credentials', 'scope_expired'].includes(error?.code);
  const styles = {
    card: { padding: '16px', display: 'grid', gap: '14px', minWidth: 0, color: 'var(--foreground, var(--text-primary, inherit))', fontSize: '13px', lineHeight: 1.5 },
    panel: { minWidth: 0, padding: '14px', border: '1px solid var(--border, var(--border-color, #8885))', borderRadius: '12px', background: 'var(--surface, var(--background-secondary, transparent))', overflowWrap: 'anywhere' },
    muted: { color: 'var(--muted-foreground, var(--text-secondary, #888))', margin: 0 },
    button: { cursor: 'pointer', border: '1px solid var(--border, var(--border-color, #8885))', borderRadius: '8px', padding: '7px 10px', background: 'var(--surface, transparent)', color: 'inherit', font: 'inherit' },
    badge: { display: 'inline-block', padding: '2px 7px', borderRadius: '99px', background: 'var(--accent-subtle, #8882)', fontSize: '11px' },
    select: { display: 'block', width: '100%', minWidth: 0, marginTop: '6px', padding: '7px', borderRadius: '8px', border: '1px solid var(--border, #8885)', background: 'var(--surface, transparent)', color: 'inherit', font: 'inherit' },
  };
  function scope(id) {
    const workspaces = wsSource.getSnapshot(), catalog = sessionSource.getSnapshot(), live = connectionSource.getSnapshot();
    if (!id || !live || live.id === undefined || mountedSource.getSnapshot() !== id || workspaces?.phase !== 'ready' || workspaces.state === 'error' || !Array.isArray(workspaces.items) || !Array.isArray(workspaces.archivedSessionIds) || workspaces.archivedSessionIds.includes(id) || catalog?.phase !== 'ready' || !Array.isArray(catalog.ids) || !catalog.ids.includes(id)) return null;
    const owners = workspaces.items.filter(item => Array.isArray(item?.sessionIds) && item.sessionIds.includes(id));
    if (owners.length !== 1 || typeof owners[0].workspaceId !== 'string' || !owners[0].workspaceId || typeof owners[0].createdAt !== 'string' || !owners[0].createdAt || (Array.isArray(owners[0].archivedSessionIds) && owners[0].archivedSessionIds.includes(id))) return null;
    return { workspaceId: owners[0].workspaceId, incarnation: owners[0].createdAt, connectionId: live.id };
  }
  const sameScope = (a, b) => Boolean(a && b && a.workspaceId === b.workspaceId && a.incarnation === b.incarnation && a.connectionId === b.connectionId);
  const settingsValid = settings => settings && Number.isSafeInteger(settings.revision) && settings.revision >= 0 && typeof settings.configured === 'boolean' && settings.workspaces && typeof settings.workspaces === 'object' && !Array.isArray(settings.workspaces) && Array.isArray(settings.needsReselect) && settings.needsReselect.every(x => typeof x === 'string');
  const selectedBoards = (settings, wid) => {
    const value = settings.workspaces[wid];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 100 || value.some(x => typeof x !== 'string' || !x) || new Set(value).size !== value.length) throw Error('invalid settings');
    return value;
  };
  const identity = link => JSON.stringify([link.boardId, link.issueKey, link.issueId]);
  function Header({ sessionId }) {
    const mounted = useSource(mountedSource);
    if (!sessionId || mounted !== sessionId) return null;
    const label = text('sessionCardOpen', 'Open linked tasks');
    return h('button', { type: 'button', title: label, 'aria-label': label, onClick: () => { if (mountedSource.getSnapshot() === sessionId) sidebarRight.openTab('dsh-board-issue'); }, style: { ...styles.button, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '5px' } },
      h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }), h('path', { d: 'M9 4v16M15 4v16' })));
  }
  function Body({ sessionId, useTabInfo }) {
    const { tab } = useTabInfo();
    const workspaces = useSource(wsSource), catalog = useSource(sessionSource), connected = useSource(connectionSource), mounted = useSource(mountedSource);
    const [state, setState] = useState(null), [choice, setChoice] = useState(''), [refresh, setRefresh] = useState(0);
    const liveRef = useRef(null), epoch = useRef(0), selectedRef = useRef('');
    const visible = Boolean(tab?.visible && tab.signal && !tab.signal.aborted);
    const currentScope = scope(sessionId);
    // This ref changes during render, before effects/cleanup. Old async work and old
    // render state must not survive a hidden tab or a changed session incarnation.
    const stamp = JSON.stringify([sessionId, visible, currentScope?.workspaceId, currentScope?.incarnation, currentScope?.connectionId, refresh]);
    if (!liveRef.current || liveRef.current.stamp !== stamp || liveRef.current.signal !== tab?.signal) {
      liveRef.current = { stamp, signal: tab?.signal, visible, sessionId, scope: currentScope };
      epoch.current++;
    }
    const generation = epoch.current;
    const valid = () => epoch.current === generation && liveRef.current?.visible && !liveRef.current.signal?.aborted && liveRef.current.sessionId === sessionId && sameScope(liveRef.current.scope, scope(sessionId));
    const readCommand = async (command, accepts) => {
      for (let attempt = 0; ; attempt++) {
        if (!accepts()) return null;
        try { return await transport.trackerCommand(command); }
        catch (error) {
          if (error?.code !== 'client_rate_limited' || attempt >= 2 || !accepts()) throw error;
          await new Promise(resolve => setTimeout(resolve, 350));
          if (!accepts()) return null;
        }
      }
    };
    useEffect(() => {
      let last = JSON.stringify(scope(sessionId));
      const invalidate = () => {
        const next = JSON.stringify(scope(sessionId));
        if (next === last) return;
        last = next; epoch.current++; setState(null); setChoice(''); setRefresh(value => value + 1);
      };
      const disposers = [wsSource, sessionSource, connectionSource, mountedSource].map(store => store.subscribe(invalidate));
      invalidate();
      return () => { disposers.forEach(dispose => dispose()); };
    }, [sessionId]);
    useEffect(() => {
      if (!visible || !currentScope) return;
      const invalidate = () => { epoch.current++; setState(null); setChoice(''); setRefresh(value => value + 1); };
      const foreground = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') invalidate(); };
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', foreground);
      return () => { if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', foreground); };
    }, [stamp, tab?.signal]);
    useEffect(() => {
      let active = true;
      const accepts = () => active && valid();
      setState(null); setChoice('');
      if (!visible || !currentScope) return () => { active = false; };
      const run = async () => {
        let locals = [], localError = false;
        try {
          const snapshot = await transport.read();
          if (!accepts()) return;
          if (!Array.isArray(snapshot?.boards) || !Array.isArray(snapshot?.links)) throw Error('invalid snapshot');
          for (const board of snapshot.boards) {
            if (board?.workspaceId !== currentScope.workspaceId || typeof board.id !== 'string' || !Array.isArray(board.tasks)) continue;
            for (const task of board.tasks) {
              if (typeof task?.id !== 'string' || typeof task.title !== 'string' || !snapshot.links.some(link => link?.boardId === board.id && link.taskId === task.id && link.sessionId === sessionId)) continue;
              const status = Array.isArray(board.statuses) ? board.statuses.find(s => s.id === task.statusId)?.name : '';
              locals.push({ boardId: board.id, boardName: typeof board.name === 'string' ? board.name : '', id: task.id, title: task.title, status: typeof status === 'string' ? status : '' });
              if (locals.length >= 1000) break;
            }
            if (locals.length >= 1000) break;
          }
        } catch { if (!accepts()) return; localError = true; }
        const publish = async patch => {
          try {
            const freshLocal = await transport.read();
            if (!accepts()) return;
            if (!Array.isArray(freshLocal?.boards) || !Array.isArray(freshLocal?.links)) throw Error('invalid snapshot');
            locals = locals.flatMap(task => {
              const board = freshLocal.boards.find(item => item?.workspaceId === currentScope.workspaceId && item.id === task.boardId && Array.isArray(item.tasks));
              const fresh = board?.tasks.find(item => item.id === task.id && typeof item.title === 'string');
              if (!fresh || !freshLocal.links.some(link => link?.boardId === task.boardId && link.taskId === task.id && link.sessionId === sessionId)) return [];
              const status = Array.isArray(board.statuses) ? board.statuses.find(item => item.id === fresh.statusId)?.name : '';
              return [{ ...task, title: fresh.title, boardName: typeof board.name === 'string' ? board.name : '', status: typeof status === 'string' ? status : '' }];
            });
          } catch { if (!accepts()) return; locals = []; localError = true; }
          if (accepts()) setState({ stamp, generation, locals, localError, ...patch });
        };
        try {
          const settings = await transport.trackerRead();
          if (!accepts()) return;
          if (!settingsValid(settings)) throw Error('invalid settings');
          const boards = selectedBoards(settings, currentScope.workspaceId);
          if (!settings.configured || settings.needsReselect.includes(currentScope.workspaceId)) {
            await publish({ links: [], settings, message: settings.needsReselect.includes(currentScope.workspaceId) ? 'reselect' : 'unconfigured' }); return;
          }
          const links = []; let partialError = boards.length > 5;
          for (const boardId of boards.slice(0, 5)) {
            if (!accepts()) return;
            try {
              const result = await readCommand({ op: 'links.read', workspaceId: currentScope.workspaceId, boardId }, accepts);
              if (!accepts()) return;
              if (!result || result.incomplete !== true || !Number.isSafeInteger(result.revision) || !Array.isArray(result.links) || result.links.length > 10000) throw Error('invalid links');
              for (const link of result.links) if (link?.sessionId === sessionId && typeof link.issueKey === 'string' && /^[A-Z][A-Z0-9_]{0,31}-[1-9][0-9]{0,14}$/.test(link.issueKey) && typeof link.issueId === 'string' && link.issueId && link.issueId.length <= 128) {
                const item = { boardId, issueKey: link.issueKey, issueId: link.issueId, linkRevision: result.revision };
                if (!links.some(other => identity(other) === identity(item))) links.push(item);
                if (links.length >= 1000) { partialError = true; break; }
              }
              if (links.length >= 1000) break;
            } catch (error) { if (!accepts()) return; if (authError(error)) throw error; partialError = true; }
          }
          // A settings read after traversal detects changes that occurred while scanning.
          const after = await transport.trackerRead();
          if (!accepts()) return;
          if (!settingsValid(after) || after.revision !== settings.revision || !after.configured || after.needsReselect.includes(currentScope.workspaceId) || JSON.stringify(selectedBoards(after, currentScope.workspaceId)) !== JSON.stringify(boards)) throw Error('settings changed');
          await publish({ links, settings: after, partialError });
        } catch { if (accepts()) await publish({ links: [], message: 'unavailable' }); }
      };
      void run();
      const onAbort = () => { active = false; epoch.current++; setState(null); setChoice(''); };
      tab.signal.addEventListener('abort', onAbort, { once: true });
      return () => { active = false; tab.signal.removeEventListener('abort', onAbort); };
    }, [stamp, tab?.signal]);
    const data = visible && currentScope && state?.stamp === stamp && state.generation === generation ? state : null;
    const chosen = data?.links?.find(link => identity(link) === choice) || (data?.links?.length === 1 ? data.links[0] : null);
    selectedRef.current = chosen ? identity(chosen) : '';
    const [detail, setDetail] = useState(null);
    const detailRef = useRef(null), batchBusy = useRef(null);
    detailRef.current = detail;
    useEffect(() => {
      let active = true;
      setDetail(null);
      if (!data?.settings || !chosen || !valid()) return () => { active = false; };
      const id = identity(chosen), revision = data.settings.revision;
      const accepts = () => active && valid() && selectedRef.current === id;
      const command = op => ({ op, workspaceId: currentScope.workspaceId, boardId: chosen.boardId, issueKey: chosen.issueKey, issueId: chosen.issueId });
      const checkSettings = async () => {
        const settings = await transport.trackerRead();
        if (!accepts()) return false;
        if (!settingsValid(settings) || settings.revision !== revision || !settings.configured || settings.needsReselect.includes(currentScope.workspaceId) || !selectedBoards(settings, currentScope.workspaceId).includes(chosen.boardId)) throw Error('settings changed');
        return true;
      };
      const checkLink = async () => {
        const result = await readCommand({ op: 'links.read', workspaceId: currentScope.workspaceId, boardId: chosen.boardId }, accepts);
        if (!accepts()) return false;
        if (!result || result.incomplete !== true || !Number.isSafeInteger(result.revision) || result.revision !== chosen.linkRevision || !Array.isArray(result.links) || !result.links.some(link => link?.sessionId === sessionId && link.issueKey === chosen.issueKey && link.issueId === chosen.issueId)) throw Error('link changed');
        return true;
      };
      const checkIssue = async () => {
        const issue = await transport.trackerCommand(command('issue.read'));
        if (!accepts()) return null;
        if (!issue || issue.key !== chosen.issueKey || issue.id !== chosen.issueId || typeof issue.summary !== 'string' || !(issue.description === null || typeof issue.description === 'string') || typeof issue.status?.display !== 'string') throw Error('issue changed');
        return issue;
      };
      const run = async previous => {
        const owner = {}; batchBusy.current = owner;
        try {
          if (!await checkSettings() || !accepts() || !await checkLink() || !accepts()) return;
          const board = await readCommand({ op: 'board.read', workspaceId: currentScope.workspaceId, boardId: chosen.boardId, issueKeys: [chosen.issueKey] }, accepts);
          if (!accepts()) return;
          if (board?.board?.id !== chosen.boardId || board.issuesComplete !== false || !Array.isArray(board.issues) || !board.issues.some(issue => issue.key === chosen.issueKey && issue.id === chosen.issueId)) throw Error('board changed');
          if (!await checkIssue() || !accepts()) return;
          const comments = previous ? [...previous.comments] : [], ids = new Set(comments.map(comment => comment.id));
          const cursors = new Set(previous?.cursors || []); let cursor = previous?.cursor ?? null, bytes = previous?.bytes || 0, commentState = 'partial', resumable = false;
          for (let page = 0; page < 10; page++) {
            if (!accepts()) return;
            resumable = false;
            let result;
            try { result = await transport.trackerCommand({ ...command('issue.comments'), ...(cursor === null ? {} : { cursor }) }); }
            catch (error) { if (!accepts()) return; if (authError(error)) throw error; commentState = 'error'; resumable = cursor !== null; break; }
            if (!accepts()) return;
            if (!result || !Array.isArray(result.comments) || result.comments.length > 100 || typeof result.complete !== 'boolean' || !(result.nextCursor === null || typeof result.nextCursor === 'string')) { commentState = 'partial'; break; }
            const pageIds = new Set();
            if (result.comments.some(comment => !comment || typeof comment.id !== 'string' || !comment.id || ids.has(comment.id) || pageIds.has(comment.id) || (pageIds.add(comment.id), false) || typeof comment.text !== 'string' || typeof comment.createdBy?.display !== 'string' || typeof comment.createdAt !== 'string')) { commentState = 'partial'; break; }
            const pageBytes = new TextEncoder().encode(JSON.stringify(result.comments)).byteLength;
            if (comments.length + result.comments.length > 1000 || bytes + pageBytes > 2 * 1024 * 1024) { commentState = 'limit'; break; }
            comments.push(...result.comments); for (const comment of result.comments) ids.add(comment.id); bytes += pageBytes;
            if (result.complete && result.nextCursor === null) { commentState = 'complete'; break; }
            if (result.complete || result.nextCursor === null || !/^(?:0|[1-9][0-9]{0,15})$/.test(result.nextCursor) || !Number.isSafeInteger(Number(result.nextCursor)) || cursors.has(result.nextCursor) || (cursor !== null && Number(result.nextCursor) <= Number(cursor))) { commentState = 'partial'; break; }
            if (comments.length >= 1000 || bytes >= 2 * 1024 * 1024) { commentState = 'limit'; break; }
            cursor = result.nextCursor; cursors.add(cursor); resumable = true;
          }
          if (!accepts() || !await checkSettings() || !accepts()) return;
          const fresh = await checkIssue();
          if (!fresh || !accepts() || !await checkLink() || !accepts() || !await checkSettings() || !accepts()) return;
          const next = { stamp, generation, id, issue: fresh, comments, commentState, revision, cursor, cursors: [...cursors], bytes, resumable, loading: false, loadMore };
          detailRef.current = next; setDetail(next);
        } catch { if (accepts()) { const next = { stamp, generation, id, error: true, revision }; detailRef.current = next; setDetail(next); } }
        finally { if (batchBusy.current === owner) batchBusy.current = null; }
      };
      const loadMore = () => {
        const previous = detailRef.current;
        if (!accepts() || batchBusy.current || !previous?.resumable || previous.stamp !== stamp || previous.generation !== generation || previous.id !== id || previous.revision !== revision) return;
        const loading = { ...previous, loading: true, loadMore };
        detailRef.current = loading; setDetail(loading); void run(previous);
      };
      // Keep the action scoped to this effect, not to a stale button closure.
      void run(null);
      return () => { active = false; if (batchBusy.current) batchBusy.current = null; };
    }, [data, chosen ? identity(chosen) : '', stamp]);
    // Render checks the sources again, not only the effect's captured state.
    const safeDetail = data && chosen && valid() && detail?.stamp === stamp && detail.generation === generation && detail.id === identity(chosen) && detail.revision === data.settings?.revision ? detail : null;
    if (!visible || mounted !== sessionId || !connected) return null;
    const openBoard = () => { if (valid()) openBoardForSession(sessionId); };
    const boardButton = h('button', { type: 'button', style: styles.button, onClick: openBoard }, text('sessionCardBoard', 'Open full board to edit'));
    if (!currentScope) {
      const ambiguous = workspaces?.phase === 'ready' && Array.isArray(workspaces.items) && workspaces.items.filter(item => item?.sessionIds?.includes(sessionId)).length > 1;
      return h('section', { style: styles.card }, h('p', { style: styles.muted, role: 'status' }, ambiguous ? text('chooseSessionWorkspace', 'This session belongs to multiple workspaces. Open the board and choose a workspace explicitly.') : text('linkUnavailable', 'This session is unavailable, archived, or not registered in a workspace.')),
        h('button', { type: 'button', style: styles.button, onClick: () => { if (mountedSource.getSnapshot() === sessionId && connectionSource.getSnapshot()) openBoardForSession(sessionId); } }, text('sessionCardBoard', 'Open full board to edit')));
    }
    const renderText = value => typeof renderTrackerText === 'function' ? renderTrackerText(value) : value;
    return h('section', { style: styles.card, 'aria-label': text('sessionCardTitle', 'Linked tasks') },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } }, h('strong', null, text('sessionCardTitle', 'Linked tasks')), h('span', { style: styles.badge }, text('trackerReadOnly', 'Read only'))),
      h('p', { style: styles.muted }, text('sessionCardReadOnly', 'This view is read-only. Open the full board to edit. Access changes may not appear immediately.')), boardButton,
      !data ? h('p', { style: styles.muted, role: 'status' }, text('loading', 'Loading…')) : h(React.Fragment, null,
        h('section', { style: styles.panel }, h('strong', null, text('trackerLocal', 'Local tasks')),
          h('p', { style: styles.muted }, text('sessionCardLocalHistory', 'Local links are historical and do not record workspace incarnation; verify them on the full board.')),
          data.localError ? h('p', { style: styles.muted }, text('loadError', 'Local tasks could not be loaded.')) : data.locals.length ? h('ul', { style: { paddingLeft: '18px', marginBottom: 0 } }, data.locals.map(task => h('li', { key: JSON.stringify([task.boardId, task.id]) }, h('strong', null, task.title), h('div', { style: styles.muted }, task.boardName, task.status ? ' · ' + task.status : '')))) : h('p', { style: styles.muted }, text('sessionCardNoLocal', 'No linked local tasks found.'))),
        h('section', { style: styles.panel }, h('strong', null, text('tracker', 'Yandex Tracker')),
          h('p', { style: styles.muted }, text('sessionCardPartial', 'Linked issues are a partial result; other links may exist.')),
          data.message && h('p', { role: 'status', style: styles.muted }, data.message === 'reselect' ? text('trackerReselect', 'Tracker board selection needs confirmation.') : data.message === 'unconfigured' ? text('trackerNotConfigured', 'Tracker is not configured.') : text('trackerError', 'Tracker is unavailable; issue details are hidden.')),
          data.partialError && h('p', { role: 'status', style: styles.muted }, text('sessionCardScanError', 'Some boards could not be checked.')),
          !data.message && data.links.length === 0 && h('p', { style: styles.muted }, text('sessionCardNoLinks', 'No linked issues found in this partial result.')),
          data.links.length > 1 && h('label', null, text('sessionCardChoose', 'Choose a linked issue'), h('select', { style: styles.select, value: choice, onChange: event => { if (valid()) { selectedRef.current = event.target.value; setDetail(null); setChoice(event.target.value); } } }, h('option', { value: '' }, text('sessionCardSelect', 'Select an issue')), data.links.map(link => h('option', { key: identity(link), value: identity(link) }, link.issueKey + ' · ' + text('board', 'Board') + ' ' + link.boardId)))),
          chosen && !safeDetail && h('p', { style: styles.muted, role: 'status' }, text('loading', 'Loading…')),
          safeDetail?.error && h('p', { role: 'alert', style: styles.muted }, text('issueUnavailable', 'Issue details are hidden until access is revalidated.')),
          safeDetail?.issue && h('article', { style: { marginTop: '12px', minWidth: 0 } }, h('div', { style: styles.muted }, chosen.issueKey, ' · ', safeDetail.issue.status.display), h('h3', { style: { margin: '5px 0 10px', fontSize: '16px', overflowWrap: 'anywhere' } }, safeDetail.issue.summary), safeDetail.issue.description && h('div', null, renderText(safeDetail.issue.description)),
            h('h4', { style: { marginBottom: '6px' } }, text('issueComments', 'Comments & activity')), h('p', { style: styles.muted, role: 'status' }, safeDetail.loading ? text('issueCommentsLoading', 'Loading comments…') : safeDetail.commentState === 'complete' ? text('issueCommentsComplete', 'Traversal complete; comments may have changed while loading.') : safeDetail.commentState === 'error' ? text('issueCommentsError', 'Comments could not be loaded; earlier comments are retained.') : safeDetail.commentState === 'limit' ? text('issueCommentsLimit', 'Loading stopped at the comment or size limit.') : safeDetail.resumable ? text('issueCommentsPartial', 'More comments may be available.') : text('issueCommentsTerminalPartial', 'Traversal stopped without a usable continuation cursor; more comments may exist.')),
            safeDetail.comments.map(comment => h('div', { key: comment.id, style: { borderTop: '1px solid var(--border, #8885)', padding: '10px 0', overflowWrap: 'anywhere' } }, h('strong', null, comment.createdBy.display), ' ', h('time', { dateTime: comment.createdAt, style: styles.muted }, comment.createdAt), h('div', null, renderText(comment.text)))),
            safeDetail.resumable && h('button', { type: 'button', style: styles.button, disabled: safeDetail.loading, onClick: safeDetail.loadMore }, safeDetail.commentState === 'error' ? text('retry', 'Retry') : text('issueCommentsMore', 'Load more'))))));
  }
  return { Header, Body };
}
