// Session-scoped discovery and authorization for the shared Tracker editor.
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
  const settingsValid = settings => settings && Number.isSafeInteger(settings.revision) && settings.revision >= 0 && typeof settings.configured === 'boolean' && settings.workspaces && typeof settings.workspaces === 'object' && !Array.isArray(settings.workspaces) && Array.isArray(settings.needsReselect) && settings.needsReselect.every(x => typeof x === 'string') && (settings.verificationUnavailable === undefined || (Array.isArray(settings.verificationUnavailable) && settings.verificationUnavailable.every(x => typeof x === 'string')));
  const unavailable = (settings, wid) => settings.verificationUnavailable?.includes(wid) === true;
  const selectedBoards = (settings, wid) => {
    const value = settings.workspaces[wid];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 100 || value.some(x => typeof x !== 'string' || !x) || new Set(value).size !== value.length) throw Error('invalid settings');
    return value;
  };
  const identity = link => JSON.stringify([link.boardId, link.issueKey, link.issueId]);
  const sessionLinksValid = (result, sessionId, boards) => result && Number.isSafeInteger(result.revision) && result.revision >= 0 && typeof result.incomplete === 'boolean' && Array.isArray(result.links) && result.links.length <= 10000 && result.links.every(link => link && link.sessionId === sessionId && typeof link.boardId === 'string' && boards.includes(link.boardId) && typeof link.issueKey === 'string' && /^[A-Z][A-Z0-9_]{0,31}-[1-9][0-9]{0,14}$/.test(link.issueKey) && typeof link.issueId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(link.issueId));
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
    const [state, setState] = useState(null), [choice, setChoice] = useState(''), [closed, setClosed] = useState(false), [refresh, setRefresh] = useState(0);
    const liveRef = useRef(null), epoch = useRef(0), selectedRef = useRef(''), selectionEpoch = useRef(0), revisionRef = useRef(null);
    const documentVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const visible = Boolean(tab?.visible && tab.signal && !tab.signal.aborted && documentVisible());
    const currentScope = scope(sessionId);
    // This ref changes during render, before effects/cleanup. Old async work and old
    // render state must not survive a hidden tab or a changed session incarnation.
    const stamp = JSON.stringify([sessionId, visible, currentScope?.workspaceId, currentScope?.incarnation, currentScope?.connectionId, refresh]);
    if (!liveRef.current || liveRef.current.stamp !== stamp || liveRef.current.signal !== tab?.signal) {
      liveRef.current = { stamp, signal: tab?.signal, visible, sessionId, scope: currentScope };
      epoch.current++;
    }
    const generation = epoch.current;
    const valid = () => epoch.current === generation && liveRef.current?.visible && documentVisible() && !liveRef.current.signal?.aborted && liveRef.current.sessionId === sessionId && sameScope(liveRef.current.scope, scope(sessionId));
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
      if (!currentScope) return;
      const invalidate = () => { epoch.current++; setState(null); setRefresh(value => value + 1); };
      const foreground = () => invalidate();
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', foreground);
      return () => { if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', foreground); };
    }, [stamp, tab?.signal]);
    useEffect(() => {
      let active = true;
      const accepts = () => active && valid();
      setState(null);
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
          deps.onSettings?.(settings);
          if (!settings.configured || settings.needsReselect.includes(currentScope.workspaceId) || unavailable(settings, currentScope.workspaceId)) {
            await publish({ links: [], settings, message: unavailable(settings, currentScope.workspaceId) ? 'verification_unavailable' : settings.needsReselect.includes(currentScope.workspaceId) ? 'reselect' : 'unconfigured' }); return;
          }
          if (boards.length === 0) { await publish({ links: [], settings, message: 'no_boards' }); return; }
          const result = await readCommand({ op: 'links.session.read', workspaceId: currentScope.workspaceId, sessionId }, accepts);
          if (!accepts()) return;
          if (!sessionLinksValid(result, sessionId, boards)) throw Error('invalid session links');
          const links = [], seen = new Set();
          let partialError = result.incomplete;
          for (const link of result.links) {
            const item = { boardId: link.boardId, issueKey: link.issueKey, issueId: link.issueId, linkRevision: result.revision };
            const key = identity(item);
            if (seen.has(key)) continue;
            if (links.length >= 1000) { partialError = true; break; }
            seen.add(key); links.push(item);
          }
          // A settings read after traversal detects changes that occurred while scanning.
          const after = await transport.trackerRead();
          if (!accepts()) return;
          if (settingsValid(after)) deps.onSettings?.(after);
          if (settingsValid(after) && unavailable(after, currentScope.workspaceId)) { await publish({ links: [], settings: after, message: 'verification_unavailable' }); return; }
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
    const chosen = !closed && (data?.links?.find(link => identity(link) === choice) || (data?.links?.length === 1 ? data.links[0] : null));
    selectedRef.current = chosen ? identity(chosen) : '';
    const selectedId = chosen ? identity(chosen) : '', selectionGeneration = selectionEpoch.current;
    const revisionIdentity = JSON.stringify([sessionId, currentScope?.workspaceId, currentScope?.incarnation, currentScope?.connectionId, data?.settings?.revision, selectedId, generation]);
    if (chosen && revisionRef.current?.identity !== revisionIdentity) revisionRef.current = { identity: revisionIdentity, revision: chosen.linkRevision };
    const editorValid = () => valid() && selectionEpoch.current === selectionGeneration && selectedRef.current === selectedId && Boolean(data?.settings && chosen);
    const reportUnavailable = settings => {
      if (!editorValid() || !settingsValid(settings) || !unavailable(settings, currentScope.workspaceId)) return false;
      selectionEpoch.current++; selectedRef.current = '';
      setChoice('');
      setState({ ...data, links: [], settings, message: 'verification_unavailable' });
      return true;
    };
    const authorization = {
      valid: editorValid,
      async reconcileLink(command, receipt, accepts) {
        const allowed = () => editorValid() && accepts() && revisionRef.current?.identity === revisionIdentity && command.expectedRevision === revisionRef.current.revision;
        if (!allowed() || !Number.isSafeInteger(receipt.revision) || receipt.revision !== command.expectedRevision + 1) return false;
        if (!command.linked && command.sessionId === sessionId) {
          epoch.current++; setState(null); setChoice(''); setRefresh(value => value + 1);
          return false;
        }
        const settings = await transport.trackerRead();
        if (allowed() && settingsValid(settings)) { if (unavailable(settings, currentScope.workspaceId)) reportUnavailable(settings); deps.onSettings?.(settings); }
        if (!allowed() || !settingsValid(settings) || settings.revision !== data.settings.revision || !settings.configured || settings.needsReselect.includes(currentScope.workspaceId) || unavailable(settings, currentScope.workspaceId) || !selectedBoards(settings, currentScope.workspaceId).includes(chosen.boardId)) return false;
        const result = await readCommand({ op: 'links.issue.read', workspaceId: currentScope.workspaceId, boardId: chosen.boardId, issueKey: chosen.issueKey, issueId: chosen.issueId }, allowed);
        if (!allowed() || !result || result.incomplete !== false || result.revision !== receipt.revision || !Array.isArray(result.links) || result.links.length > 10000) return false;
        const seen = new Set();
        if (result.links.some(link => !link || typeof link.sessionId !== 'string' || !link.sessionId || link.issueKey !== chosen.issueKey || link.issueId !== chosen.issueId || seen.has(link.sessionId) || (seen.add(link.sessionId), false)) || !seen.has(sessionId) || seen.has(command.sessionId) !== command.linked) return false;
        const after = await transport.trackerRead();
        if (allowed() && settingsValid(after)) { if (unavailable(after, currentScope.workspaceId)) reportUnavailable(after); deps.onSettings?.(after); }
        if (!allowed() || !settingsValid(after) || after.revision !== settings.revision || !after.configured || after.needsReselect.includes(currentScope.workspaceId) || unavailable(after, currentScope.workspaceId) || !selectedBoards(after, currentScope.workspaceId).includes(chosen.boardId)) return false;
        revisionRef.current.revision = receipt.revision;
        return true;
      },
      async authorize(issue, accepts, expectedRevision) {
        const revision = revisionRef.current?.revision;
        const allowed = () => editorValid() && accepts() && revisionRef.current?.revision === revision && issue.workspaceId === currentScope.workspaceId && issue.boardId === chosen.boardId && issue.key === chosen.issueKey && issue.issueId === chosen.issueId;
        const checkSettings = async () => {
          const settings = await transport.trackerRead();
          if (!allowed()) return false;
          if (settingsValid(settings)) { if (unavailable(settings, currentScope.workspaceId)) reportUnavailable(settings); deps.onSettings?.(settings); }
          if (!settingsValid(settings) || settings.revision !== data.settings.revision || !settings.configured || settings.needsReselect.includes(currentScope.workspaceId) || unavailable(settings, currentScope.workspaceId) || !selectedBoards(settings, currentScope.workspaceId).includes(chosen.boardId)) throw Error('settings changed');
          return true;
        };
        try {
          if (!allowed() || !await checkSettings() || !allowed()) return false;
          const result = await readCommand({ op: 'links.issue.read', workspaceId: currentScope.workspaceId, boardId: chosen.boardId, issueKey: chosen.issueKey, issueId: chosen.issueId }, allowed);
          if (!allowed()) return false;
          const seen = new Set();
          if (!result || result.incomplete !== false || !Number.isSafeInteger(result.revision) || result.revision !== revisionRef.current?.revision || (expectedRevision !== undefined && result.revision !== expectedRevision) || !Array.isArray(result.links) || result.links.length > 10000 || result.links.some(link => !link || typeof link.sessionId !== 'string' || !link.sessionId || link.issueKey !== chosen.issueKey || link.issueId !== chosen.issueId || seen.has(link.sessionId) || (seen.add(link.sessionId), false)) || !result.links.some(link => link.sessionId === sessionId)) throw Error('link changed');
          return await checkSettings() && allowed();
        } catch (error) { if (allowed()) { error.sessionAuthorization = true; throw error; } return false; }
      },
    };
    if (!visible || mounted !== sessionId || !connected) return null;
    const openBoard = () => { if (valid()) openBoardForSession(sessionId); };
    const openCurrentSession = event => {
      if (!valid()) return;
      const modified = event?.ctrlKey || event?.metaKey || event?.button === 1;
      if (modified) {
        if (typeof deps.openSessionInNewTab === 'function') deps.openSessionInNewTab(sessionId);
      } else if (typeof deps.openSession === 'function') deps.openSession(sessionId);
    };
    const sessionTitle = catalog?.byId?.[sessionId]?.displayTitle || catalog?.byId?.[sessionId]?.title;
    const sessionButton = h('button', { type: 'button', style: styles.button, onClick: openCurrentSession, onAuxClick: event => { if (event.button === 1) openCurrentSession(event); }, disabled: typeof deps.openSession !== 'function' }, text('sessionCardCurrentSession', 'Open current session'), ' · ', typeof sessionTitle === 'string' && sessionTitle.trim() && sessionTitle.trim() !== sessionId ? sessionTitle : text('untitled', 'Untitled session'));
    const boardButton = h('button', { type: 'button', style: styles.button, onClick: openBoard }, text('sessionCardBoard', 'Open full board to edit'));
    if (!currentScope) {
      const ambiguous = workspaces?.phase === 'ready' && Array.isArray(workspaces.items) && workspaces.items.filter(item => item?.sessionIds?.includes(sessionId)).length > 1;
      return h('section', { style: styles.card }, h('p', { style: styles.muted, role: 'status' }, ambiguous ? text('chooseSessionWorkspace', 'This session belongs to multiple workspaces. Open the board and choose a workspace explicitly.') : text('linkUnavailable', 'This session is unavailable, archived, or not registered in a workspace.')),
        h('button', { type: 'button', style: styles.button, onClick: () => { if (mountedSource.getSnapshot() === sessionId && connectionSource.getSnapshot()) openBoardForSession(sessionId); } }, text('sessionCardBoard', 'Open full board to edit')));
    }
        return h('section', { style: styles.card, 'aria-label': text('sessionCardTitle', 'Linked tasks') },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } }, h('strong', null, text('sessionCardTitle', 'Linked tasks'))),
      sessionButton, boardButton,
      !data ? h('p', { style: styles.muted, role: 'status' }, text('loading', 'Loading…')) : h(React.Fragment, null,
        h('section', { style: styles.panel }, h('strong', null, text('trackerLocal', 'Local tasks')),
          h('p', { style: styles.muted }, text('sessionCardLocalHistory', 'Local links are historical and do not record workspace incarnation; verify them on the full board.')),
          data.localError ? h('p', { style: styles.muted }, text('loadError', 'Local tasks could not be loaded.')) : data.locals.length ? h('ul', { style: { paddingLeft: '18px', marginBottom: 0 } }, data.locals.map(task => h('li', { key: JSON.stringify([task.boardId, task.id]) }, h('strong', null, task.title), h('div', { style: styles.muted }, task.boardName, task.status ? ' · ' + task.status : '')))) : h('p', { style: styles.muted }, text('sessionCardNoLocal', 'No linked local tasks found.'))),
        h('section', { style: styles.panel }, h('strong', null, text('tracker', 'Yandex Tracker')),
          data.message && h('p', { role: 'status', style: styles.muted }, data.message === 'verification_unavailable' ? text('trackerVerificationUnavailable', 'Tracker verification is temporarily unavailable. Your saved selection is unchanged; try again.') : data.message === 'reselect' ? text('trackerReselect', 'Tracker board selection needs confirmation.') : data.message === 'unconfigured' ? text('trackerNotConfigured', 'Tracker is not configured.') : data.message === 'no_boards' ? text('trackerNoBoardsSelected', 'No Tracker boards are selected.') : text('trackerError', 'Tracker is unavailable; issue details are hidden.')),
          data.message === 'verification_unavailable' && h('button', { type: 'button', style: styles.button, onClick: () => { if (valid()) { epoch.current++; setState(null); setRefresh(value => value + 1); } } }, text('retry', 'Retry')),
          data.partialError && h('p', { role: 'status', style: styles.muted }, text('sessionCardPartial', 'Linked issues are a partial result; other links may exist.')),
          !data.message && data.links.length === 0 && h('p', { style: styles.muted }, data.partialError ? text('sessionCardNoLinksPartial', 'No linked issues found in this partial result.') : text('sessionCardNoLinks', 'No linked issues found.')),
          data.links.length > 1 && h('label', null, text('sessionCardChoose', 'Choose a linked issue'), h('select', { style: styles.select, value: choice, onChange: event => { if (valid()) { selectionEpoch.current++; selectedRef.current = event.target.value; setClosed(false); setChoice(event.target.value); } } }, h('option', { value: '' }, text('sessionCardSelect', 'Select an issue')), data.links.map(link => h('option', { key: identity(link), value: identity(link) }, link.issueKey + ' · ' + text('board', 'Board') + ' ' + link.boardId)))),
          closed && data.links.length === 1 && h('button', { type: 'button', style: styles.button, onClick: () => { if (valid()) { selectionEpoch.current++; setClosed(false); } } }, data.links[0].issueKey),
          chosen && editorValid() && typeof deps.renderIssueEditor === 'function' && deps.renderIssueEditor({
            target: { sessionId, ...currentScope, settings: data.settings, boardId: chosen.boardId, key: chosen.issueKey, issueId: chosen.issueId, linkRevision: chosen.linkRevision },
            authorization, onClose: () => { selectionEpoch.current++; selectedRef.current = ''; setChoice(''); setClosed(true); },
          }))));
  }
  return { Header, Body };
}
