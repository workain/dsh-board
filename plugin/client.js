window.__ModuleLoader__.load({
  id: 'dsh-board',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;
    const PANEL = 'dsh-board';
    const NS = 'dshBoard';
    const en = {
      panel: 'Board', workspace: 'Workspace', chooseWorkspace: 'Choose a workspace', board: 'Board',
      chooseBoard: 'Choose a board', noWorkspaces: 'No workspaces are available.', workspaceError: 'Workspaces could not be loaded.',
      noBoards: 'There are no boards in this workspace yet.', newBoard: 'New board', boardName: 'Board name',
      create: 'Create', cancel: 'Cancel', save: 'Save', edit: 'Edit', loading: 'Loading…', retry: 'Retry',
      loadError: 'Could not load the board. Check the connection and try again.',
      conflict: 'The board changed elsewhere. Reload it and review your changes.',
      unknown: 'The save result is unknown. Reload and check the board before trying again.',
      boardView: 'Board', listView: 'List', view: 'View', search: 'Search tasks', allStatuses: 'All statuses',
      status: 'Status', addStatus: 'Add status', editStatus: 'Edit status', statusName: 'Status name',
      addTask: 'Add task', editTask: 'Edit task', title: 'Title', description: 'Description',
      noStatuses: 'Create a status before adding tasks.', noTasks: 'No tasks yet.', noResults: 'No tasks match the filters.',
      sessions: 'Linked sessions', noSessions: 'No sessions are available in this workspace.',
      sessionUnavailable: 'Unavailable or not in the session catalog', sessionArchived: 'Archived — restore it in the workspace first',
      sessionLoading: 'Session availability is loading', openSession: 'Open session', close: 'Close',
      linkedSession: 'Linked session', emptyDescription: 'No description', refresh: 'Refresh',
      unsaved: 'Your changes have not been saved.', statusMissing: 'Unknown status', saving: 'Saving…',
      badSnapshot: 'The server returned an invalid board snapshot.', noTransport: 'Board service is unavailable.', tooLarge: 'The request is too large (maximum 64 KiB in UTF-8). Shorten the description.',
      noSearchSession: 'There are no matching sessions.', selectSession: 'Available sessions',
      archived: 'Archived', inProgress: 'Loading workspaces…', untitled: 'Untitled session', sessionAction: 'Link tasks', sessionContext: 'Current session', chooseSessionWorkspace: 'Choose the workspace for this session explicitly.', outsideWorkspace: 'This session is not registered in the selected workspace; linking is unavailable.', saveRejected: 'The server rejected the change. Review the values and try again.',
      discardDraft: 'Discard the unsaved draft?', reviewUnknown: 'The previous operation may still commit. Your next change can race it; only one can use the current revision. Carefully inspect the board, then confirm you accept this uncertainty.', readbackFirst: 'Refresh and inspect the board before acknowledging the unknown result. The original operation may still commit later.', acknowledgeUnknown: 'I checked the board; allow another attempt', draftWarning: 'Drafts are kept only while this page is open. Reloading or closing it will discard them.',
      eyebrow: 'YOUR WORKSPACE', pageDescription: 'A clear view of your work and the conversations behind it.', boardDescription: 'Your tasks, organized in one place.', chooseHint: 'Select a workspace and board to get started.', workspaceHint: 'Start by choosing a workspace.', boardHint: 'Choose a board to see your tasks.', taskCount: 'Tasks', statusCount: 'Statuses', filterLabel: 'Filter', refreshShort: 'Refresh board', emptyColumn: 'No tasks in this status', taskBoard: 'Task board',
    };
    const ru = {
      panel: 'Доска', workspace: 'Рабочее пространство', chooseWorkspace: 'Выберите рабочее пространство', board: 'Доска',
      chooseBoard: 'Выберите доску', noWorkspaces: 'Нет доступных рабочих пространств.', workspaceError: 'Не удалось загрузить рабочие пространства.',
      noBoards: 'В этом рабочем пространстве пока нет досок.', newBoard: 'Новая доска', boardName: 'Название доски',
      create: 'Создать', cancel: 'Отмена', save: 'Сохранить', edit: 'Изменить', loading: 'Загрузка…', retry: 'Повторить',
      loadError: 'Не удалось загрузить доску. Проверьте соединение и повторите попытку.',
      conflict: 'Доска изменилась в другом месте. Обновите её и проверьте изменения.',
      unknown: 'Результат сохранения неизвестен. Обновите доску и проверьте её перед повтором.',
      boardView: 'Доска', listView: 'Список', view: 'Вид', search: 'Поиск задач', allStatuses: 'Все статусы',
      status: 'Статус', addStatus: 'Добавить статус', editStatus: 'Изменить статус', statusName: 'Название статуса',
      addTask: 'Добавить задачу', editTask: 'Изменить задачу', title: 'Название', description: 'Описание',
      noStatuses: 'Создайте статус, прежде чем добавлять задачи.', noTasks: 'Задач пока нет.', noResults: 'Нет задач по выбранным условиям.',
      sessions: 'Связанные сессии', noSessions: 'В этом рабочем пространстве нет доступных сессий.',
      sessionUnavailable: 'Недоступна или отсутствует в списке сессий', sessionArchived: 'В архиве — сначала восстановите в рабочем пространстве',
      sessionLoading: 'Загружается доступность сессии', openSession: 'Открыть сессию', close: 'Закрыть',
      linkedSession: 'Связанная сессия', emptyDescription: 'Нет описания', refresh: 'Обновить',
      unsaved: 'Изменения не сохранены.', statusMissing: 'Неизвестный статус', saving: 'Сохранение…',
      badSnapshot: 'Сервер вернул некорректные данные доски.', noTransport: 'Сервис доски недоступен.', tooLarge: 'Запрос слишком большой (максимум 64 КиБ в UTF-8). Сократите описание.',
      noSearchSession: 'Нет подходящих сессий.', selectSession: 'Доступные сессии',
      archived: 'В архиве', inProgress: 'Загрузка рабочих пространств…', untitled: 'Сессия без названия', sessionAction: 'Связать задачи', sessionContext: 'Текущая сессия', chooseSessionWorkspace: 'Выберите рабочее пространство для этой сессии явно.', outsideWorkspace: 'Сессия не зарегистрирована в выбранном рабочем пространстве; привязка недоступна.', saveRejected: 'Сервер отклонил изменение. Проверьте значения и повторите попытку.',
      discardDraft: 'Отменить несохранённый черновик?', reviewUnknown: 'Предыдущий запрос ещё может сохраниться. Следующее изменение может с ним соревноваться; текущую ревизию сможет использовать только одно. Проверьте доску и подтвердите, что принимаете эту неопределённость.', readbackFirst: 'Обновите и проверьте доску перед подтверждением. Исходный запрос всё ещё может сохраниться позже.', acknowledgeUnknown: 'Я проверил доску; разрешить повторную попытку', draftWarning: 'Черновики хранятся только пока открыта эта страница. При обновлении или закрытии они пропадут.',
      eyebrow: 'ВАШЕ ПРОСТРАНСТВО', pageDescription: 'Все задачи и связанные с ними сессии — в одном месте.', boardDescription: 'Задачи и работа команды в одном месте.', chooseHint: 'Выберите рабочее пространство и доску, чтобы начать.', workspaceHint: 'Сначала выберите рабочее пространство.', boardHint: 'Выберите доску, чтобы увидеть задачи.', taskCount: 'Задачи', statusCount: 'Статусы', filterLabel: 'Фильтр', refreshShort: 'Обновить доску', emptyColumn: 'В этом статусе пока нет задач', taskBoard: 'Доска задач',
    };

    // Keep the transport in one seam. The server remains authoritative for access and writes.
    function makeTransport() {
      async function request(options) {
        const path = options.method === 'POST' ? 'api/dsh-board.mutate' : 'api/dsh-board';
        const response = await fetch(path, { credentials: 'same-origin', ...options });
        let result;
        try { result = await response.json(); } catch { throw new Error('invalid response'); }
        if (!response.ok || result?.ok === false) {
          const error = new Error('remote');
          error.code = result?.error?.code || result?.code || (response.status === 409 ? 'conflict' : 'remote');
          error.status = response.status;
          throw error;
        }
        return result?.ok === true ? result.value : result;
      }
      return {
        read: () => request({ method: 'GET' }),
        mutate: (command) => request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) }),
      };
    }
    function validateSnapshot(value) {
      if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.boards) || !Array.isArray(value.links)) throw new Error('badSnapshot');
      const boardIds = new Set();
      for (const board of value.boards) {
        if (!board || typeof board.id !== 'string' || !board.id || typeof board.workspaceId !== 'string' || !board.workspaceId || typeof board.name !== 'string' || !board.name.trim() || !Array.isArray(board.statuses) || !Array.isArray(board.tasks)) throw new Error('badSnapshot');
        const boardKey = JSON.stringify([board.workspaceId, board.id]);
        if (boardIds.has(boardKey)) throw new Error('badSnapshot');
        boardIds.add(boardKey);
        const statusIds = new Set();
        for (const status of board.statuses) {
          if (!status || typeof status.id !== 'string' || !status.id || statusIds.has(status.id) || typeof status.name !== 'string' || !status.name.trim() || !Number.isSafeInteger(status.position) || status.position < 0) throw new Error('badSnapshot');
          statusIds.add(status.id);
        }
        const taskIds = new Set();
        for (const task of board.tasks) {
          if (!task || typeof task.id !== 'string' || taskIds.has(task.id) || typeof task.title !== 'string' || !statusIds.has(task.statusId) || (task.description !== undefined && typeof task.description !== 'string')) throw new Error('badSnapshot');
          taskIds.add(task.id);
        }
      }
      const linkKeys = new Set();
      for (const link of value.links) {
        if (!link || typeof link.boardId !== 'string' || !link.boardId || typeof link.taskId !== 'string' || !link.taskId || typeof link.sessionId !== 'string' || !link.sessionId) throw new Error('badSnapshot');
        const key = JSON.stringify([link.boardId, link.taskId, link.sessionId]);
        if (linkKeys.has(key)) throw new Error('badSnapshot');
        linkKeys.add(key);
      }
      return value;
    }
    // Memory only: no browser storage. The store outlives Page mounts and pending requests.
    const memory = {
      snapshot: null, workspaceId: '', boardId: '', showContext: false, contextSessionId: '',
      mode: 'board', query: '', statusFilter: '', form: null, dirty: false,
      pending: false, loading: false, uncertain: false, uncertainRevision: null, readback: false, error: '', generation: 0,
      contextHandled: null, listeners: new Set(),
    };
    function updateMemory(patch) {
      Object.assign(memory, patch);
      memory.listeners.forEach((listener) => listener());
    }
    // Register only while needed: browsers may otherwise disable back/forward cache.
    let unloadArmed = false;
    function beforeUnload(event) { event.preventDefault(); event.returnValue = ''; }
    memory.listeners.add(() => {
      const needed = memory.dirty || memory.pending || memory.uncertain;
      if (needed && !unloadArmed) window.addEventListener('beforeunload', beforeUnload);
      if (!needed && unloadArmed) window.removeEventListener('beforeunload', beforeUnload);
      unloadArmed = needed;
    });
    function useSource(source) {
      return useSyncExternalStore((fn) => source.subscribe(fn), () => source.getSnapshot(), () => source.getSnapshot());
    }
    function sessionState(id, sessions, workspaces) {
      if (workspaces.state === 'error') return 'sessionUnavailable';
      if (sessions.phase !== 'ready' || workspaces.phase !== 'ready') return 'sessionLoading';
      if (workspaces.archivedSessionIds.includes(id)) return 'sessionArchived';
      if (!sessions.ids.includes(id)) return 'sessionUnavailable';
      return 'available';
    }
    function BoardIcon({ size = 20 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
        h('path', { d: 'M9 4v16M15 4v16M5.5 8h1M11.5 8h1M17.5 8h1' }));
    }
    const css = `
      .dsh-board{--ink:var(--dsw-alias-label-primary,#20242b);--muted:var(--dsw-alias-label-secondary,#67717d);--line:var(--dsw-alias-border-l2,#dfe3e8);--base:var(--dsw-alias-bg-base,#fff);--layer:var(--dsw-alias-bg-layer-1,#f6f7f9);--accent:var(--dsw-alias-brand-primary,#5264db);height:100%;overflow:auto;color:var(--ink);background:var(--base);font-family:var(--dsw-font-family,inherit)}
      .dsh-board *{box-sizing:border-box}.dsh-board h1,.dsh-board h2,.dsh-board h3,.dsh-board p{margin:0}.dsh-board button,.dsh-board input,.dsh-board textarea,.dsh-board select{font:inherit;color:inherit}.dsh-board button{cursor:pointer}.dsh-board button:disabled{opacity:.45;cursor:not-allowed}
      .dsh-board button:focus-visible,.dsh-board input:focus-visible,.dsh-board select:focus-visible,.dsh-board textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.dsh-board-shell{max-width:1700px;min-height:100%;margin:0 auto;padding:36px 40px 48px}
      .dsh-board-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:28px}.dsh-board-header-title{min-width:0}.dsh-board-eyebrow{display:flex;align-items:center;gap:8px;color:var(--accent);font-size:10px;font-weight:750;letter-spacing:.13em}.dsh-board-eyebrow:before{content:'';width:7px;height:7px;border-radius:50%;background:var(--accent)}.dsh-board-header h1{margin-top:10px;font-size:30px;font-weight:680;line-height:1.15;letter-spacing:-.035em}.dsh-board-subtitle{margin-top:8px!important;color:var(--muted);font-size:13px;line-height:1.5}.dsh-board-header-actions,.dsh-board-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
      .dsh-board button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--base);font-size:12px;font-weight:600;line-height:1.2;transition:border-color .15s,background .15s}.dsh-board button:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,var(--layer))}.dsh-board button.dsh-board-primary,.dsh-board-form button[type=submit]{border-color:var(--accent);background:var(--accent);color:var(--dsw-alias-label-primary-inverted,#fff)}.dsh-board button.dsh-board-primary:not(:disabled):hover,.dsh-board-form button[type=submit]:not(:disabled):hover{filter:brightness(.94)}.dsh-board-icon{display:block;flex:none;width:15px;height:15px}
      .dsh-board-context{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:var(--base)}.dsh-board-field{display:grid;gap:7px;min-width:0}.dsh-board-field>span,.dsh-board-form label{color:var(--muted);font-size:11px;font-weight:650}.dsh-board-context .dsh-board-field{flex:0 1 260px}.dsh-board-context .dsh-board-field:first-child{flex-basis:310px}.dsh-board-context-action{margin-left:auto}
      .dsh-board input:not([type=checkbox]),.dsh-board textarea,.dsh-board select{width:100%;min-width:0;min-height:38px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--base);font-size:12px;color:var(--ink)}.dsh-board select{cursor:pointer}.dsh-board textarea{min-height:110px;resize:vertical}.dsh-board input::placeholder,.dsh-board textarea::placeholder{color:var(--muted)}
      .dsh-board-content{margin-top:30px}.dsh-board-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap}.dsh-board-section-head>div:first-child{min-width:0;max-width:100%}.dsh-board-section-title{display:flex;align-items:center;gap:11px;min-width:0}.dsh-board-section-title h2{font-size:19px;font-weight:670;letter-spacing:-.025em;overflow-wrap:anywhere}.dsh-board-summary{display:flex;align-items:center;gap:8px;margin-top:7px;color:var(--muted);font-size:12px}.dsh-board-summary-dot{width:3px;height:3px;border-radius:50%;background:currentColor}.dsh-board-actions{display:flex;gap:8px;flex-wrap:wrap}
      .dsh-board-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:20px 0 16px}.dsh-board-switch{display:flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:9px;background:var(--layer)}.dsh-board-switch button{min-height:30px;padding:6px 11px;border:0;background:transparent;color:var(--muted)}.dsh-board-switch button[aria-pressed=true]{color:var(--ink);background:var(--base);box-shadow:0 1px 4px #172b4d1a}.dsh-board-toolbar-spacer{flex:1}.dsh-board-search{width:220px}.dsh-board-filter{width:165px}.dsh-board-search,.dsh-board-filter{position:relative}.dsh-board-search svg,.dsh-board-filter svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}.dsh-board .dsh-board-search input,.dsh-board .dsh-board-filter select{padding-left:33px;min-height:36px}
      .dsh-board-kanban{display:flex;gap:14px;overflow-x:auto;align-items:stretch;padding:2px 1px 22px;scrollbar-width:thin}.dsh-board-column{flex:0 0 290px;min-width:0;min-height:245px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--layer)}.dsh-board-column-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px}.dsh-board-column-label{display:flex;align-items:center;gap:8px;min-width:0}.dsh-board-column-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--column-color,var(--accent))}.dsh-board-column-head h2{overflow-wrap:anywhere;font-size:12px;font-weight:700}.dsh-board-count{display:inline-grid;place-items:center;min-width:21px;height:21px;padding:0 5px;border-radius:6px;background:var(--base);color:var(--muted);font-size:11px;font-weight:650}.dsh-board-column-head button{min-height:27px;padding:4px 7px;border-color:transparent;background:transparent;color:var(--muted);font-size:11px}.dsh-board-column-empty{display:grid;place-items:center;min-height:92px;border:1px dashed var(--line);border-radius:9px;color:var(--muted);font-size:11px;text-align:center}
      .dsh-board-card{display:grid;gap:11px;margin:0 0 9px;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--base);box-shadow:0 2px 6px #172b4d0a}.dsh-board-card h3{font-size:13px;font-weight:660;line-height:1.45;overflow-wrap:anywhere}.dsh-board-card-description{margin-top:6px!important;color:var(--muted);font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.dsh-board-card-header,.dsh-board-card-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}.dsh-board-card-id{color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.04em}.dsh-board-card-status{min-width:0;overflow-wrap:anywhere;border-radius:5px;padding:4px 7px;background:var(--layer);color:var(--muted);font-size:10px;font-weight:700}.dsh-board-card-actions{justify-content:flex-start;padding-top:9px;border-top:1px solid var(--line)}.dsh-board-card-actions button{min-height:28px;padding:5px 7px;border:0;background:transparent;color:var(--muted);font-size:11px}.dsh-board-card-sessions-label{color:var(--muted);font-size:10px;font-weight:650}.dsh-board-card-sessions-list{display:grid;gap:5px;margin:6px 0 0;padding:0;list-style:none}.dsh-board-card-session{min-width:0;overflow-wrap:anywhere}.dsh-board-card-session button{display:block;max-width:100%;min-height:0;padding:0;overflow-wrap:anywhere;border:0;background:transparent;text-align:left;color:var(--accent);font-size:11px;font-weight:550}.dsh-board-card-session-unavailable{color:var(--muted);font-size:11px}.dsh-board-card-session-link{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
      .dsh-board-muted{color:var(--muted);font-size:12px;line-height:1.5}.dsh-board-list{display:grid;gap:10px;max-width:860px}.dsh-board-list .dsh-board-card{margin:0}.dsh-board-form{display:grid;gap:15px;max-width:700px;margin:18px 0;padding:22px;border:1px solid var(--line);border-radius:12px;background:var(--base);box-shadow:0 8px 28px #172b4d0c}.dsh-board-form h2{min-width:0;overflow-wrap:anywhere;font-size:16px;letter-spacing:-.02em}.dsh-board-form label{display:grid;gap:7px}.dsh-board-form fieldset{display:grid;gap:5px;max-height:240px;margin:0;padding:10px;border:1px solid var(--line);border-radius:8px;overflow:auto}.dsh-board-form legend{color:var(--muted);font-size:11px}.dsh-board-form fieldset label{display:flex;align-items:center;gap:9px;padding:7px;color:var(--ink);font-size:12px;overflow-wrap:anywhere}.dsh-board-form input[type=checkbox]{accent-color:var(--accent)}
      .dsh-board-alert{padding:12px 14px;margin:12px 0;border:1px solid var(--dsw-alias-state-warn-primary,var(--line));border-radius:9px;font-size:12px;line-height:1.5}.dsh-board-empty{padding:22px 0;color:var(--muted);font-size:12px}.dsh-board-welcome{display:grid;justify-items:center;gap:9px;margin:30px 0;padding:64px 20px;border:1px dashed var(--line);border-radius:12px;text-align:center}.dsh-board-welcome-icon{display:grid;place-items:center;width:44px;height:44px;margin-bottom:6px;border-radius:12px;background:var(--layer);color:var(--accent)}.dsh-board-welcome h2{font-size:15px}.dsh-board-welcome p{max-width:380px;color:var(--muted);font-size:12px;line-height:1.6}
      @media(max-width:900px){.dsh-board-shell{padding:28px 24px}.dsh-board-context-action{margin-left:0}.dsh-board-header h1{font-size:26px}}@media(max-width:600px){.dsh-board-shell{padding:22px 16px}.dsh-board-header{gap:14px;margin-bottom:22px}.dsh-board-header h1{font-size:24px}.dsh-board-context{padding:14px;align-items:stretch}.dsh-board-context .dsh-board-field,.dsh-board-context .dsh-board-field:first-child{flex:1 1 100%}.dsh-board-context-action{width:100%}.dsh-board-context-action button{width:100%}.dsh-board-section-head{gap:12px}.dsh-board-toolbar-spacer{display:none}.dsh-board-search{flex:1 1 160px}.dsh-board-filter{flex:1 1 130px}.dsh-board-column{flex-basis:min(290px,85vw)}}@media(prefers-reduced-motion:reduce){.dsh-board button{transition:none}}
    `;

    function Icon({ name, size = 16 }) {
      const paths = {
        plus: h('path', { d: 'M12 5v14M5 12h14' }),
        refresh: h('path', { d: 'M20 7v5h-5M4 17v-5h5M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5A7 7 0 0 0 18.4 15' }),
        search: h(React.Fragment, null, h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }), h('path', { d: 'm16 16 4 4' })),
        filter: h('path', { d: 'M4 6h16M7 12h10M10 18h4' }),
        columns: h(React.Fragment, null, h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }), h('path', { d: 'M9 4v16M15 4v16' })),
      };
      return h('svg', { className: 'dsh-board-icon', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, paths[name]);
    }
    function SessionAction({ sessionId, t, openBoardForSession }) {
      return h('button', { type: 'button', onClick: () => openBoardForSession(sessionId), title: t('sessionAction'), 'aria-label': t('sessionAction'), style: { font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' } }, t('sessionAction'));
    }
    function Page({ t, transport, workspacesSource, sessionsSource, openSession, sessionContext }) {
      const workspaces = useSource(workspacesSource);
      const sessions = useSource(sessionsSource);
      const context = useSource(sessionContext);
      const [, render] = useState(0);
      useEffect(() => {
        const listener = () => render((value) => value + 1);
        memory.listeners.add(listener);
        // Pick up a change between render and effect subscription.
        listener();
        return () => memory.listeners.delete(listener);
      }, []);
      const { snapshot, workspaceId, boardId, showContext, contextSessionId, mode, query, statusFilter, form, error, loading, uncertain } = memory;
      const busy = memory.pending;
      const setMode = (value) => updateMemory({ mode: value });
      const setQuery = (value) => updateMemory({ query: value });
      const setStatusFilter = (value) => updateMemory({ statusFilter: value });
      const setShowContext = (value) => updateMemory({ showContext: value });
      const formHeading = useRef(null);
      const boards = useMemo(() => (snapshot ? snapshot.boards.filter((item) => item.workspaceId === workspaceId) : []), [snapshot, workspaceId]);
      const workspaceReady = workspaces.phase === 'ready' && workspaces.state !== 'error' && (!workspaceId || workspaces.items.some((item) => item.workspaceId === workspaceId));
      const selected = workspaceReady ? boards.find((item) => item.id === boardId) : undefined;
      const workspace = workspaces.items.find((item) => item.workspaceId === workspaceId);
      const statuses = selected ? [...selected.statuses].sort((a, b) => (a.position || 0) - (b.position || 0)) : [];
      const tasks = selected ? selected.tasks.filter((task) => (!statusFilter || task.statusId === statusFilter) && (task.title + '\n' + (task.description || '')).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
      const linksFor = (taskId) => snapshot.links.filter((link) => link.boardId === boardId && link.taskId === taskId);
      const availableSessions = workspace && sessions.phase === 'ready' && workspaces.phase === 'ready' && workspaces.state !== 'error'
        ? workspace.sessionIds.filter((id) => sessions.ids.includes(id)) : [];
      function label(id) {
        const title = sessions.byId[id]?.displayTitle || sessions.byId[id]?.title;
        // Titles are not unique. Keep the complete stable ID visible for an
        // unambiguous session choice and independently verifiable links.
        return title && title !== id ? `${title} (${id})` : id;
      }
      async function load() {
        if (memory.pending) return;
        const generation = ++memory.generation;
        updateMemory({ loading: true, error: '' });
        try {
          const value = validateSnapshot(await transport.read());
          if (generation !== memory.generation) return;
          if (memory.snapshot && value.revision < memory.snapshot.revision) throw new Error('staleSnapshot');
          const reconciled = memory.uncertain && memory.uncertainRevision !== null && value.revision >= memory.uncertainRevision;
          updateMemory({ snapshot: value, readback: reconciled, error: memory.uncertain ? 'unknown' : '' });
        } catch (err) {
          if (generation === memory.generation) updateMemory({ readback: false, error: err.message === 'noTransport' ? 'noTransport' : err.message === 'badSnapshot' ? 'badSnapshot' : 'loadError' });
        } finally { if (generation === memory.generation) updateMemory({ loading: false }); }
      }
      useEffect(() => { if (!memory.pending) load(); }, []);
      useEffect(() => {
        if (!context.sessionId || workspaces.phase !== 'ready' || workspaces.state === 'error' || memory.contextHandled === context.token) return;
        // Consume each intent once, even when preserving an existing draft.
        memory.contextHandled = context.token;
        const candidates = workspaces.items.filter((item) => item.sessionIds.includes(context.sessionId));
        const patch = { showContext: true, contextSessionId: context.sessionId };
        if (!memory.form && !memory.pending && !memory.uncertain) Object.assign(patch, { workspaceId: candidates.length === 1 ? candidates[0].workspaceId : '', boardId: '', statusFilter: '', query: '' });
        updateMemory(patch);
      }, [context, workspaces]);
      useEffect(() => { if (form && formHeading.current) formHeading.current.focus(); }, [form && form.kind]);
      async function submit(command) {
        if (!memory.snapshot || memory.pending || memory.loading || memory.uncertain || !workspaceReady || !workspaces.items.some((item) => item.workspaceId === memory.workspaceId)) return;
        const payload = { expectedRevision: memory.snapshot.revision, ...command };
        if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 64 * 1024) { updateMemory({ error: 'tooLarge' }); return; }
        const submittedForm = memory.form;
        ++memory.generation;
        updateMemory({ pending: true, error: '', readback: false });
        try {
          const value = await transport.mutate(payload);
          // Accept only an actual, newer server snapshot as a commit receipt.
          // A malformed or unrelated success response has unknown outcome.
          const next = validateSnapshot(value);
          if (next.revision !== payload.expectedRevision + 1 || (memory.snapshot && next.revision < memory.snapshot.revision)) throw new Error('invalidReceipt');
          if (submittedForm && submittedForm.kind !== 'links' && memory.form === submittedForm) updateMemory({ form: null, dirty: false });
          updateMemory({ snapshot: next });
        } catch (err) {
          const conflict = err.status === 409 || String(err.code || '').toLowerCase().includes('conflict');
          const rejected = err.status >= 400 && err.status < 500;
          updateMemory({ error: conflict ? 'conflict' : rejected ? 'saveRejected' : 'unknown', uncertain: conflict || !rejected, uncertainRevision: conflict || !rejected ? payload.expectedRevision : null, readback: false });
        } finally { updateMemory({ pending: false }); }
      }
      function setForm(next) {
        if (memory.pending || memory.uncertain) return false;
        if (memory.form && memory.dirty && !window.confirm(t('discardDraft'))) return false;
        updateMemory({ form: next, dirty: false });
        return true;
      }
      function setField(key, value) {
        if (!memory.form || memory.pending || memory.uncertain) return;
        updateMemory({ form: { ...memory.form, [key]: value }, dirty: true });
      }
      function onSubmit(event) {
        event.preventDefault();
        if (!form || (form.kind !== 'board' && !selected)) return;
        if (form.kind === 'board') submit({ op: 'board.create', workspaceId, name: form.name.trim() });
        if (form.kind === 'status') submit({ op: 'status.save', workspaceId, boardId, status: { ...(form.id ? { id: form.id } : {}), name: form.name.trim(), ...(form.position !== undefined ? { position: form.position } : {}) } });
        if (form.kind === 'task') submit({ op: 'task.save', workspaceId, boardId, task: { ...(form.id ? { id: form.id } : {}), title: form.title.trim(), description: form.description, statusId: form.statusId } });
      }
      function changeWorkspace(event) {
        const value = event.target.value;
        if (!setForm(null)) { event.target.value = memory.workspaceId; return; }
        updateMemory({ workspaceId: value, boardId: '', statusFilter: '', query: '' });
      }
      function changeBoard(event) {
        const value = event.target.value;
        if (!setForm(null)) { event.target.value = memory.boardId; return; }
        updateMemory({ boardId: value, statusFilter: '', query: '' });
      }
      function editTask(task) { setForm({ kind: 'task', id: task.id, title: task.title, description: task.description || '', statusId: task.statusId }); }
      function open(id) { if (sessionState(id, sessions, workspaces) === 'available') openSession(id); }
      function link(id, linked, taskId) { submit({ op: 'link.set', workspaceId, boardId, taskId, sessionId: id, linked }); }
      function card(task) {
        const taskLinks = linksFor(task.id);
        const status = statuses.find((item) => item.id === task.statusId);
        const shortId = task.id.length > 8 ? task.id.slice(0, 8) + '…' : task.id;
        return h('article', { className: 'dsh-board-card', key: task.id },
          h('div', { className: 'dsh-board-card-header' },
            task.id && h('span', { className: 'dsh-board-card-id', title: task.id, 'aria-label': task.id }, shortId),
            mode === 'list' && h('div', { className: 'dsh-board-card-status dsh-board-muted' }, t('status'), ': ', status ? status.name : t('statusMissing'))),
          h('div', { className: 'dsh-board-card-content' },
            h('h3', { className: 'dsh-board-card-title' }, task.title),
            task.description && h('p', { className: 'dsh-board-card-description dsh-board-description' }, task.description)),
          taskLinks.length > 0 && h('div', { className: 'dsh-board-card-sessions' },
            h('span', { className: 'dsh-board-card-sessions-label dsh-board-muted' }, t('sessions')),
            h('ul', { className: 'dsh-board-card-sessions-list dsh-board-sessions' }, taskLinks.map((linkItem) => {
              const state = sessionState(linkItem.sessionId, sessions, workspaces);
              return h('li', { className: 'dsh-board-card-session', key: linkItem.sessionId }, state === 'available'
                ? h('button', { className: 'dsh-board-card-session-link', type: 'button', onClick: () => open(linkItem.sessionId), title: label(linkItem.sessionId), 'aria-label': t('openSession') + ': ' + label(linkItem.sessionId) }, sessions.byId[linkItem.sessionId]?.displayTitle || sessions.byId[linkItem.sessionId]?.title || linkItem.sessionId)
                : h('span', { className: 'dsh-board-card-session-unavailable' }, label(linkItem.sessionId), ' — ', t(state)));
            }))),
          h('div', { className: 'dsh-board-card-actions dsh-board-row' },
            h('button', { className: 'dsh-board-card-action dsh-board-card-action-edit', type: 'button', disabled: busy || uncertain, onClick: () => editTask(task), 'aria-label': t('editTask') + ': ' + task.title }, t('edit')),
            h('button', { className: 'dsh-board-card-action dsh-board-card-action-links', type: 'button', disabled: busy || uncertain, onClick: () => setForm({ kind: 'links', id: task.id, title: task.title }), 'aria-label': t('sessions') + ': ' + task.title }, t('sessions'), ' (', taskLinks.length, ')')));
      }
      function formView() {
        if (!form) return null;
        const heading = form.kind === 'board' ? t('newBoard') : form.kind === 'status' ? t(form.id ? 'editStatus' : 'addStatus') : form.kind === 'task' ? t(form.id ? 'editTask' : 'addTask') : t('sessions') + ': ' + form.title;
        if (form.kind === 'links') {
          const current = linksFor(form.id).map((item) => item.sessionId);
          const ids = Array.from(new Set([...availableSessions, ...(showContext && contextSessionId ? [contextSessionId] : []), ...current]));
          return h('section', { className: 'dsh-board-form', 'aria-labelledby': 'dsh-board-form-heading' }, h('h2', { id: 'dsh-board-form-heading', tabIndex: -1, ref: formHeading }, heading),
            h('p', { className: 'dsh-board-muted' }, t('selectSession')),
            ids.length ? h('fieldset', { disabled: busy || loading || uncertain || !snapshot || !selected }, h('legend', null, t('sessions')), ids.map((id) => {
              const state = sessionState(id, sessions, workspaces);
              const checked = current.includes(id);
              const inWorkspace = workspace && workspace.sessionIds.includes(id);
              const reason = state !== 'available' ? state : !inWorkspace ? 'outsideWorkspace' : '';
              return h('label', { key: id }, h('input', { type: 'checkbox', checked, disabled: !checked && Boolean(reason), onChange: (event) => link(id, event.target.checked, form.id) }),
                h('span', null, label(id), reason ? ' — ' + t(reason) : ''));
            })) : h('p', null, t('noSessions')),
            h('div', null, h('button', { type: 'button', disabled: busy || uncertain, onClick: () => setForm(null) }, t('close'))));
        }
        return h('form', { className: 'dsh-board-form', onSubmit, 'aria-labelledby': 'dsh-board-form-heading' },
          h('h2', { id: 'dsh-board-form-heading', tabIndex: -1, ref: formHeading }, heading),
          form.kind !== 'board' && !selected && h('p', { role: 'alert' }, t('loadError')),
          form.kind === 'board' || form.kind === 'status' ? h('label', null, t(form.kind === 'board' ? 'boardName' : 'statusName'), h('input', { required: true, readOnly: busy || uncertain, maxLength: 200, value: form.name, onChange: (event) => setField('name', event.target.value) })) : null,
          form.kind === 'task' && h(React.Fragment, null,
            h('label', null, t('title'), h('input', { required: true, readOnly: busy || uncertain, maxLength: 200, value: form.title, onChange: (event) => setField('title', event.target.value) })),
            h('label', null, t('description'), h('textarea', { readOnly: busy || uncertain, maxLength: 48 * 1024, value: form.description, onChange: (event) => setField('description', event.target.value) })),
            h('label', null, t('status'), h('select', { required: true, disabled: busy || uncertain, value: form.statusId, onChange: (event) => setField('statusId', event.target.value) }, statuses.map((status) => h('option', { key: status.id, value: status.id }, status.name))))),
          h('div', { className: 'dsh-board-row' }, h('button', { type: 'submit', disabled: busy || loading || uncertain || !snapshot || (form.kind !== 'board' && !selected) || ((form.kind === 'board' || form.kind === 'status') && !form.name.trim()) || (form.kind === 'task' && (!form.title.trim() || !form.statusId)) }, busy ? t('saving') : t('save')),
            h('button', { type: 'button', disabled: busy || uncertain, onClick: () => setForm(null) }, t('cancel'))));
      }
      const colors = ['var(--dsw-alias-brand-primary, #5969d8)', 'var(--dsw-alias-state-warn-primary, #d89548)', 'var(--dsw-alias-state-success-primary, #45a784)', 'var(--dsw-alias-state-error-primary, #d16f72)'];
      return h('main', { className: 'dsh-board' }, h('style', null, css), h('div', { className: 'dsh-board-shell' },
        h('header', { className: 'dsh-board-header' },
          h('div', { className: 'dsh-board-header-title' }, h('div', { className: 'dsh-board-eyebrow' }, t('eyebrow')), h('h1', null, t('panel')), h('p', { className: 'dsh-board-subtitle' }, t('pageDescription'))),
          h('div', { className: 'dsh-board-header-actions' }, h('button', { type: 'button', disabled: busy || loading, onClick: load, title: t('refreshShort') }, h(Icon, { name: 'refresh' }), t('refresh')))),
        error && h('div', { className: 'dsh-board-alert', role: 'alert' }, t(error), ' ', h('button', { type: 'button', disabled: busy || loading, onClick: load }, t('retry'))),
        uncertain && h('div', { className: 'dsh-board-alert', role: 'status' }, t('readbackFirst'), ' ', h('button', { type: 'button', disabled: busy || loading || !memory.readback, onClick: () => { if (memory.readback && !memory.loading && window.confirm(t('reviewUnknown'))) updateMemory({ uncertain: false, uncertainRevision: null, readback: false, error: '' }); } }, t('acknowledgeUnknown'))),
        (memory.dirty || busy || uncertain) && h('p', { className: 'dsh-board-muted' }, t('draftWarning')),
        loading && h('p', { className: 'dsh-board-muted', role: 'status' }, t('loading')),
        workspaces.state === 'error' && h('p', { className: 'dsh-board-alert', role: 'alert' }, t('workspaceError')),
        workspaces.phase !== 'ready' && h('p', { className: 'dsh-board-muted', role: 'status' }, t('inProgress')),
        workspaces.phase === 'ready' && workspaces.state !== 'error' && !workspaces.items.length && h('p', { className: 'dsh-board-muted' }, t('noWorkspaces')),
        showContext && contextSessionId && h('div', { className: 'dsh-board-row dsh-board-alert' }, h('span', null, t('sessionContext'), ': ', label(contextSessionId), !workspaceId ? ' — ' + t('chooseSessionWorkspace') : ''), h('button', { type: 'button', onClick: () => setShowContext(false) }, t('close'))),
        h('div', { className: 'dsh-board-context' },
          h('label', { className: 'dsh-board-field' }, h('span', null, t('workspace')), h('select', { value: workspaceId, onChange: changeWorkspace, disabled: busy || uncertain || workspaces.phase !== 'ready' || workspaces.state === 'error' }, h('option', { value: '' }, t('chooseWorkspace')), workspaces.items.map((item) => h('option', { key: item.workspaceId, value: item.workspaceId }, item.title)))),
          workspaceId && workspaceReady && snapshot && h('label', { className: 'dsh-board-field' }, h('span', null, t('board')), h('select', { value: boardId, onChange: changeBoard, disabled: busy || uncertain }, h('option', { value: '' }, t('chooseBoard')), boards.map((item) => h('option', { key: item.id, value: item.id }, item.name)))),
          workspaceId && workspaceReady && snapshot && h('div', { className: 'dsh-board-context-action' }, h('button', { type: 'button', disabled: busy || uncertain, onClick: () => setForm({ kind: 'board', name: '' }) }, h(Icon, { name: 'plus' }), t('newBoard')))),
        !selected && !form && h('div', { className: 'dsh-board-welcome' }, h('div', { className: 'dsh-board-welcome-icon' }, h(Icon, { name: 'columns', size: 22 })), h('h2', null, !workspaceId ? t('workspaceHint') : workspaceReady && snapshot && !boards.length ? t('noBoards') : t('boardHint')), h('p', null, t('chooseHint'))),
        h('div', { className: 'dsh-board-content' },
          selected && h(React.Fragment, null,
            h('div', { className: 'dsh-board-section-head' },
              h('div', null, h('div', { className: 'dsh-board-section-title' }, h('h2', null, selected.name)), h('div', { className: 'dsh-board-summary' }, h('span', null, t('taskCount'), ': ', selected.tasks.length), h('span', { className: 'dsh-board-summary-dot', 'aria-hidden': true }), h('span', null, t('statusCount'), ': ', statuses.length))),
              h('div', { className: 'dsh-board-actions' },
                h('button', { type: 'button', disabled: busy || uncertain, onClick: () => setForm({ kind: 'status', name: '' }) }, h(Icon, { name: 'plus' }), t('addStatus')),
                h('button', { className: 'dsh-board-primary', type: 'button', disabled: busy || uncertain || !statuses.length, onClick: () => setForm({ kind: 'task', title: '', description: '', statusId: statuses[0].id }) }, h(Icon, { name: 'plus' }), t('addTask')))),
            h('div', { className: 'dsh-board-toolbar' },
              h('div', { className: 'dsh-board-switch', role: 'group', 'aria-label': t('view') },
                h('button', { type: 'button', 'aria-pressed': mode === 'board', onClick: () => setMode('board') }, t('boardView')),
                h('button', { type: 'button', 'aria-pressed': mode === 'list', onClick: () => setMode('list') }, t('listView'))),
              h('div', { className: 'dsh-board-toolbar-spacer' }),
              h('label', { className: 'dsh-board-search' }, h(Icon, { name: 'search' }), h('input', { type: 'search', 'aria-label': t('search'), placeholder: t('search'), value: query, onChange: (event) => setQuery(event.target.value) })),
              h('label', { className: 'dsh-board-filter' }, h(Icon, { name: 'filter' }), h('select', { 'aria-label': t('status'), value: statusFilter, onChange: (event) => setStatusFilter(event.target.value) }, h('option', { value: '' }, t('allStatuses')), statuses.map((status) => h('option', { key: status.id, value: status.id }, status.name))))),
            !statuses.length && h('p', { className: 'dsh-board-empty' }, t('noStatuses'))),
          form && formView(),
          selected && statuses.length > 0 && h(React.Fragment, null,
            selected.tasks.length > 0 && !tasks.length && h('p', { className: 'dsh-board-empty' }, t('noResults')),
            mode === 'list' ? h('div', { className: 'dsh-board-list' }, !selected.tasks.length && h('p', { className: 'dsh-board-empty' }, t('noTasks')), tasks.map(card)) : h('div', { className: 'dsh-board-kanban' }, statuses.filter((status) => !statusFilter || status.id === statusFilter).map((status) => {
              const columnTasks = tasks.filter((task) => task.statusId === status.id);
              const color = colors[statuses.findIndex((item) => item.id === status.id) % colors.length];
              return h('section', { className: 'dsh-board-column', key: status.id, 'aria-label': status.name, style: { '--column-color': color } },
                h('div', { className: 'dsh-board-column-head' }, h('div', { className: 'dsh-board-column-label' }, h('span', { className: 'dsh-board-column-dot', 'aria-hidden': true }), h('h2', null, status.name), h('span', { className: 'dsh-board-count' }, columnTasks.length)), h('button', { type: 'button', disabled: busy || uncertain, 'aria-label': t('editStatus') + ': ' + status.name, onClick: () => setForm({ kind: 'status', id: status.id, name: status.name, position: status.position }) }, t('edit'))),
                columnTasks.length ? columnTasks.map(card) : h('div', { className: 'dsh-board-column-empty' }, t('emptyColumn')));
            }))))));
    }
    return {
      inject: ['slots', 'locale', 'workspaces', 'sessions', 'uiWorkspace', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, ru, zh: en }), 'dsh-board: locale');
        const t = ctx.locale.bind(NS);
        const transport = makeTransport();
        let sessionSnapshot = { sessionId: '', token: {} };
        const listeners = new Set();
        const sessionContext = { getSnapshot: () => sessionSnapshot, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
        const openBoardForSession = (sessionId) => {
          sessionSnapshot = { sessionId, token: {} };
          listeners.forEach((listener) => listener());
          ctx.layout.selectPanel(PANEL);
        };
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: PANEL, locale: NS,
          inject: () => ({ transport, sessionContext, workspacesSource: ctx.workspaces.list, sessionsSource: ctx.sessions.list, openSession: (id) => ctx.uiWorkspace.openSession(id) }),
        }, Page));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 15, locale: NS, label: () => t('panel') }, BoardIcon));
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-board-link', order: 30, locale: NS, inject: () => ({ openBoardForSession }) }, SessionAction));
      },
    };
  },
});
