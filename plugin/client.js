window.__ModuleLoader__.load({
  id: 'dsh-board',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;
    const PANEL = 'dsh-board';
    const NS = 'dshBoard';
    const en = {
      trackerReviewDraft: 'I reviewed the refreshed board list and my selection.', trackerUpdatedAt: 'Last successful partial update:',
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
      archived: 'Archived', inProgress: 'Loading workspaces…', untitled: 'Untitled session', sessionAction: 'Open board for this session', sessionContext: 'Current session', chooseSessionWorkspace: 'Choose the workspace for this session explicitly.', outsideWorkspace: 'This session is not registered in the selected workspace; linking is unavailable.', saveRejected: 'The server rejected the change. Review the values and try again.',
      discardDraft: 'Discard the unsaved draft?', reviewUnknown: 'The previous operation may still commit. Your next change can race it; only one can use the current revision. Carefully inspect the board, then confirm you accept this uncertainty.', readbackFirst: 'Refresh and inspect the board before acknowledging the unknown result. The original operation may still commit later.', acknowledgeUnknown: 'I checked the board; allow another attempt', draftWarning: 'Drafts are kept only while this page is open. Reloading or closing it will discard them.',
      eyebrow: 'YOUR WORKSPACE', pageDescription: 'A clear view of your work and the conversations behind it.', boardDescription: 'Your tasks, organized in one place.', chooseHint: 'Select a workspace and board to get started.', workspaceHint: 'Start by choosing a workspace.', boardHint: 'Choose a board to see your tasks.', taskCount: 'Tasks', statusCount: 'Statuses', filterLabel: 'Filter', refreshShort: 'Refresh board', emptyColumn: 'No tasks in this status', taskBoard: 'Task board',
      boardArgsUnsupported: 'The /board command does not accept arguments. Open /board without arguments.',
      assignee: 'Assignee', allAssignees: 'All assignees', unassigned: 'Unassigned', assigneeUnknown: 'Assignee unknown', assigneeUnavailable: 'Selected assignee is not in the current results', sessionFilter: 'Session in this workspace', allSessions: 'All tasks', withSession: 'With linked session', withoutSession: 'Without linked session', sessionFilterUnavailable: 'Workspace session membership is unavailable.',
      boards: 'Boards', allBoards: 'All boards', noBoardsAnywhere: 'No boards yet', noBoardsHelp: 'Choose a workspace to create your first board.', linkCurrent: 'Link this session', unlinkCurrent: 'Unlink this session', sessionHelp: 'Choose a board and link this session to a task.', linkUnavailable: 'This session is not available in this workspace.', returnToBoards: 'All boards', sessionCount: 'Sessions',
      tracker: 'Yandex Tracker', trackerConnect: 'Connect Yandex Tracker', trackerSettings: 'Tracker settings', trackerOrg: 'Organization type', trackerConfigured: 'Configured in this profile', trackerNotConfigured: 'Not configured in this profile', trackerRefs: 'Credentials and organization ID must already be stored on the server. They are never entered here.', trackerConfigureWarning: 'Reconnecting clears all workspace board selections. Continue?', trackerChoose: 'Choose Tracker boards', trackerList: 'Load available boards', trackerSelect: 'Save board selection', trackerReselect: 'Selection needs confirmation after restart or account change. Load boards and select them again.', trackerNoSelection: 'No Tracker boards selected for this workspace.', trackerListPartial: 'Board list is partial; not all available boards may appear.', trackerPartial: 'Partial results as of the last request: board membership is approximate and the list may be incomplete, even when empty. Access changes are not shown instantly.', trackerReadOnly: 'read only', trackerPartialBadge: 'partial', trackerUnmapped: 'Unmapped', trackerEmpty: 'No issues returned in this partial result.', trackerError: 'Tracker is unavailable or the request failed. Try again.', trackerReload: 'Reload settings', trackerPickerHint: 'Select boards explicitly for this workspace. The list expires; reload it if saving fails.', trackerContext: 'Tracker boards cannot be linked to sessions.', trackerRefreshBoard: 'Refresh Tracker board', trackerSelectionSaved: 'Selection saved.', trackerUncertain: 'The result is unknown. Reload settings and review before trying again.', trackerMissingSelection: 'Some saved boards are absent from this list. They will be removed if you save.', trackerConfirmSelection: 'Confirm this workspace board selection? Removed board IDs: ', trackerNoBoards: 'No boards returned.', trackerStatus: 'Status', trackerClose: 'Close Tracker settings', trackerListRequired: 'The board list expired or changed. Load it again and reselect.', trackerConflict: 'Tracker settings changed. Reload settings and review your selection.', trackerNotSelected: 'This board is no longer selected. Reload settings.', trackerCredentials: 'Server credentials are unavailable or rejected. Check the server configuration.', trackerRate: 'Tracker is busy or rate-limited. Try again later.', trackerConfiguring: 'Save connection', trackerLocal: 'Local', trackerSettingsUnknown: 'Tracker is not loaded. Open its settings to check available boards.', trackerBindingsPending: 'Some workspace selections need confirmation. Open Tracker settings and choose a workspace to reselect.',
    };
    const ru = {
      trackerReviewDraft: 'Я проверил обновлённый список досок и свой выбор.', trackerUpdatedAt: 'Последнее успешное частичное обновление:',
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
      archived: 'В архиве', inProgress: 'Загрузка рабочих пространств…', untitled: 'Сессия без названия', sessionAction: 'Открыть доску для этой сессии', sessionContext: 'Текущая сессия', chooseSessionWorkspace: 'Выберите рабочее пространство для этой сессии явно.', outsideWorkspace: 'Сессия не зарегистрирована в выбранном рабочем пространстве; привязка недоступна.', saveRejected: 'Сервер отклонил изменение. Проверьте значения и повторите попытку.',
      discardDraft: 'Отменить несохранённый черновик?', reviewUnknown: 'Предыдущий запрос ещё может сохраниться. Следующее изменение может с ним соревноваться; текущую ревизию сможет использовать только одно. Проверьте доску и подтвердите, что принимаете эту неопределённость.', readbackFirst: 'Обновите и проверьте доску перед подтверждением. Исходный запрос всё ещё может сохраниться позже.', acknowledgeUnknown: 'Я проверил доску; разрешить повторную попытку', draftWarning: 'Черновики хранятся только пока открыта эта страница. При обновлении или закрытии они пропадут.',
      eyebrow: 'ВАШЕ ПРОСТРАНСТВО', pageDescription: 'Все задачи и связанные с ними сессии — в одном месте.', boardDescription: 'Задачи и работа команды в одном месте.', chooseHint: 'Выберите рабочее пространство и доску, чтобы начать.', workspaceHint: 'Сначала выберите рабочее пространство.', boardHint: 'Выберите доску, чтобы увидеть задачи.', taskCount: 'Задачи', statusCount: 'Статусы', filterLabel: 'Фильтр', refreshShort: 'Обновить доску', emptyColumn: 'В этом статусе пока нет задач', taskBoard: 'Доска задач',
      boardArgsUnsupported: 'Команда /board не принимает аргументы. Откройте /board без аргументов.',
      assignee: 'Исполнитель', allAssignees: 'Все исполнители', unassigned: 'Не назначен', assigneeUnknown: 'Исполнитель неизвестен', assigneeUnavailable: 'Выбранного исполнителя нет в текущих результатах', sessionFilter: 'Сессия в этом пространстве', allSessions: 'Все задачи', withSession: 'Есть связанная сессия', withoutSession: 'Нет связанной сессии', sessionFilterUnavailable: 'Сведения о сессиях пространства недоступны.',
      boards: 'Доски', allBoards: 'Все доски', noBoardsAnywhere: 'Досок пока нет', noBoardsHelp: 'Выберите рабочее пространство и создайте первую доску.', linkCurrent: 'Привязать сессию', unlinkCurrent: 'Отвязать сессию', sessionHelp: 'Выберите доску и привяжите текущую сессию к задаче.', linkUnavailable: 'Эта сессия недоступна в выбранном пространстве.', returnToBoards: 'Все доски', sessionCount: 'Сессии',
      tracker: 'Яндекс Трекер', trackerConnect: 'Подключить Яндекс Трекер', trackerSettings: 'Настройки Трекера', trackerOrg: 'Тип организации', trackerConfigured: 'Настроен в этом профиле', trackerNotConfigured: 'Не настроен в этом профиле', trackerRefs: 'Данные доступа и идентификатор организации должны быть заранее сохранены на сервере. Здесь они не вводятся.', trackerConfigureWarning: 'Повторное подключение удалит выбор досок всех пространств. Продолжить?', trackerChoose: 'Выбрать доски Трекера', trackerList: 'Загрузить доступные доски', trackerSelect: 'Сохранить выбор досок', trackerReselect: 'После перезапуска или смены аккаунта выбор нужно подтвердить заново. Загрузите доски и выберите их снова.', trackerNoSelection: 'Для этого пространства доски Трекера не выбраны.', trackerListPartial: 'Список досок неполный: доступны могут быть и другие.', trackerPartial: 'Данные на момент последнего запроса частичные: принадлежность к доске определена приблизительно, список может быть неполным, даже если он пуст. Изменения доступа отображаются не мгновенно.', trackerReadOnly: 'только чтение', trackerPartialBadge: 'частично', trackerUnmapped: 'Без соответствия', trackerEmpty: 'В этом частичном результате задачи не найдены.', trackerError: 'Трекер недоступен или запрос не выполнен. Повторите попытку.', trackerReload: 'Обновить настройки', trackerPickerHint: 'Выберите доски для этого пространства явно. Список действует недолго; при ошибке загрузите его снова.', trackerContext: 'Доски Трекера нельзя связывать с сессиями.', trackerRefreshBoard: 'Обновить доску Трекера', trackerSelectionSaved: 'Выбор сохранён.', trackerUncertain: 'Результат неизвестен. Обновите настройки и проверьте их перед повтором.', trackerMissingSelection: 'Некоторых сохранённых досок нет в списке. При сохранении они будут удалены.', trackerConfirmSelection: 'Подтвердить выбор досок для пространства? Удаляемые ID досок: ', trackerNoBoards: 'Доски не найдены.', trackerStatus: 'Статус', trackerClose: 'Закрыть настройки Трекера', trackerListRequired: 'Список досок устарел или изменился. Загрузите его и выберите доски снова.', trackerConflict: 'Настройки Трекера изменились. Обновите их и проверьте выбор.', trackerNotSelected: 'Эта доска больше не выбрана. Обновите настройки.', trackerCredentials: 'Данные доступа на сервере недоступны или отклонены. Проверьте настройки сервера.', trackerRate: 'Трекер занят или ограничил частоту запросов. Повторите позже.', trackerConfiguring: 'Сохранить подключение', trackerLocal: 'Локальная',
    };

    // Keep the transport in one seam. The server remains authoritative for access and writes.
    function makeTransport() {
      async function request(options, tracker = false) {
        const base = tracker ? 'api/dsh-board.tracker' : 'api/dsh-board';
        const path = options.method === 'POST' ? base + '.mutate' : base;
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
        trackerRead: () => request({ method: 'GET' }, true),
        trackerCommand: (command) => request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) }, true),
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
          if (!task || typeof task.id !== 'string' || taskIds.has(task.id) || typeof task.title !== 'string' || !statusIds.has(task.statusId) || (task.description !== undefined && typeof task.description !== 'string') || (task.assignee !== undefined && task.assignee !== null && typeof task.assignee !== 'string')) throw new Error('badSnapshot');
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
    // Local drafts outlive Page mounts; Tracker data is invalidated at each connection boundary.
    function emptyTracker(generation, open = false) {
      return { open, settings: null, busy: false, mutating: false, error: '', notice: '', orgType: 'cloud', listing: null, listingStarted: 0, pickerWorkspace: '', picked: [], draftWorkspace: '', draftPicked: [], reviewRequired: false, board: null, boardUpdatedAt: null, incarnations: {}, generation };
    }
    const memory = {
      snapshot: null, workspaceId: '', boardId: '', showContext: false, contextSessionId: '',
      mode: 'board', query: '', statusFilter: '', assigneeFilter: '["all"]', sessionFilter: 'all', form: null, dirty: false,
      pending: false, loading: false, uncertain: false, uncertainRevision: null, readback: false, error: '', generation: 0, overview: true,
      contextHandled: null, provider: 'local', tracker: emptyTracker(0), listeners: new Set(),
    };
    function updateMemory(patch) {
      Object.assign(memory, patch);
      memory.listeners.forEach((listener) => listener());
    }
    let privacyEpoch = 0, trackerMutationPending = false;
    function invalidateTracker(preserveOpen = true, preserveDraft = false) {
      privacyEpoch++;
      const current = memory.tracker;
      const draftWorkspace = current.pickerWorkspace || current.draftWorkspace;
      const draftPicked = current.pickerWorkspace ? [...current.picked] : current.draftPicked;
      const next = emptyTracker(current.generation + 1, preserveOpen && current.open);
      if (trackerMutationPending) Object.assign(next, { busy: true, mutating: true, error: 'trackerUncertain' });
      if (preserveDraft && draftWorkspace) Object.assign(next, { draftWorkspace, draftPicked, draftIncarnation: current.draftIncarnation || current.incarnations[draftWorkspace], reviewRequired: true });
      updateMemory({ tracker: next });
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
    function trackerSettings(value) {
      if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.configured !== 'boolean' || !value.workspaces || typeof value.workspaces !== 'object' || Array.isArray(value.workspaces) || (value.orgType !== null && !['cloud', 'org'].includes(value.orgType)) || (value.needsReselect !== undefined && (!Array.isArray(value.needsReselect) || value.needsReselect.some((id) => typeof id !== 'string')))) throw new Error('invalid response');
      for (const ids of Object.values(value.workspaces)) if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new Error('invalid response');
      // Missing live-binding evidence must never be interpreted as authorization.
      return { revision: value.revision, configured: value.configured, orgType: value.orgType, workspaces: value.workspaces, needsReselect: value.needsReselect || Object.keys(value.workspaces) };
    }
    function trackerListing(value) {
      if (!value || !Array.isArray(value.boards) || typeof value.complete !== 'boolean' || value.boards.some((board) => !board || typeof board.id !== 'string' || typeof board.name !== 'string') || new Set(value.boards.map((board) => board.id)).size !== value.boards.length) throw new Error('invalid response');
      return { boards: value.boards.map(({ id, name }) => ({ id, name })), complete: value.complete };
    }
    function trackerBoard(value, id) {
      if (!value || !value.board || value.board.id !== id || typeof value.board.name !== 'string' || value.issuesComplete !== false || !Array.isArray(value.columns) || !Array.isArray(value.issues)) throw new Error('invalid response');
      if (value.columns.some((c) => !c || typeof c.id !== 'string' || typeof c.name !== 'string' || !Array.isArray(c.statuses) || c.statuses.some((s) => !s || typeof s.key !== 'string')) || new Set(value.columns.map((c) => c.id)).size !== value.columns.length || value.issues.some((i) => !i || typeof i.key !== 'string' || typeof i.summary !== 'string' || !i.status || typeof i.status.key !== 'string' || typeof i.status.display !== 'string') || new Set(value.issues.map((i) => i.key)).size !== value.issues.length) throw new Error('invalid response');
      return { board: { id, name: value.board.name }, columns: value.columns.map((c) => ({ id: c.id, name: c.name, statuses: c.statuses.map((s) => ({ key: s.key })) })), issues: value.issues.map((i) => {
        const validAssignee = i.assignee && typeof i.assignee === 'object' && typeof i.assignee.id === 'string' && i.assignee.id.length > 0 && typeof i.assignee.display === 'string' && i.assignee.display.length > 0;
        const known = i.assigneeKnown === true && (i.assignee === null || validAssignee);
        return { key: i.key, summary: i.summary, status: { key: i.status.key, display: i.status.display }, assigneeKnown: known, assignee: known && validAssignee ? { id: i.assignee.id, display: i.assignee.display } : null };
      }) };
    }
    function trackerError(error) {
      const code = error?.code;
      if (code === 'needs_reselect') return 'trackerReselect';
      if (code === 'board_list_required') return 'trackerListRequired';
      if (code === 'conflict') return 'trackerConflict';
      if (code === 'board_not_selected') return 'trackerNotSelected';
      if (['invalid_credentials', 'credentials_unavailable', 'unauthorized', 'forbidden'].includes(code)) return 'trackerCredentials';
      if (['rate_limited', 'client_rate_limited'].includes(code)) return 'trackerRate';
      return 'trackerError';
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
      .dsh-board{--ink:var(--dsw-alias-label-primary,#20242b);--muted:var(--dsw-alias-label-secondary,#67717d);--line:var(--dsw-alias-border-l2,#dfe3e8);--base:var(--dsw-alias-bg-base,#fff);--layer:var(--dsw-alias-bg-layer-1,#f6f7f9);--accent:var(--dsw-alias-state-business-primary,#4176e6);--accent-soft:var(--dsw-alias-state-business-tertiary,#e4edfd);height:100%;overflow:auto;color:var(--ink);background:var(--base);font-family:var(--dsw-font-family,inherit)}
      .dsh-board *{box-sizing:border-box}.dsh-board h1,.dsh-board h2,.dsh-board h3,.dsh-board p{margin:0}.dsh-board button,.dsh-board input,.dsh-board textarea,.dsh-board select{font:inherit;color:inherit}.dsh-board button{cursor:pointer}.dsh-board button:disabled{opacity:.45;cursor:not-allowed}
      .dsh-board button:focus-visible,.dsh-board input:focus-visible,.dsh-board select:focus-visible,.dsh-board textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.dsh-board-shell{max-width:1700px;min-height:100%;margin:0 auto;padding:36px 40px 48px}
      .dsh-board-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:28px}.dsh-board-header-title{min-width:0}.dsh-board-eyebrow{display:flex;align-items:center;gap:8px;color:var(--accent);font-size:10px;font-weight:750;letter-spacing:.13em}.dsh-board-eyebrow:before{content:'';width:7px;height:7px;border-radius:50%;background:var(--accent)}.dsh-board-header h1{margin-top:10px;font-size:30px;font-weight:680;line-height:1.15;letter-spacing:-.035em}.dsh-board-subtitle{margin-top:8px!important;color:var(--muted);font-size:13px;line-height:1.5}.dsh-board-header-actions,.dsh-board-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
      .dsh-board button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--base);font-size:12px;font-weight:600;line-height:1.2;transition:border-color .15s,background .15s}.dsh-board button:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,var(--layer))}.dsh-board button.dsh-board-primary,.dsh-board-form button[type=submit]{border-color:var(--dsw-static-deepseek-500,#4176e6);background:var(--dsw-static-deepseek-500,#4176e6);color:#fff}.dsh-board button.dsh-board-primary:not(:disabled):hover,.dsh-board-form button[type=submit]:not(:disabled):hover{filter:brightness(.94)}.dsh-board-icon{display:block;flex:none;width:15px;height:15px}
      .dsh-board-context{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:var(--base)}.dsh-board-field{display:grid;gap:7px;min-width:0}.dsh-board-field>span,.dsh-board-form label{color:var(--muted);font-size:11px;font-weight:650}.dsh-board-context .dsh-board-field{flex:0 1 260px}.dsh-board-context .dsh-board-field:first-child{flex-basis:310px}.dsh-board-context-action{margin-left:auto}
      .dsh-board input:not([type=checkbox]),.dsh-board textarea,.dsh-board select{width:100%;min-width:0;min-height:38px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--base);font-size:12px;color:var(--ink)}.dsh-board select{cursor:pointer}.dsh-board textarea{min-height:110px;resize:vertical}.dsh-board input::placeholder,.dsh-board textarea::placeholder{color:var(--muted)}
      .dsh-board-content{margin-top:30px}.dsh-board-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap}.dsh-board-section-head>div:first-child{min-width:0;max-width:100%}.dsh-board-section-title{display:flex;align-items:center;gap:11px;min-width:0}.dsh-board-section-title h2{font-size:19px;font-weight:670;letter-spacing:-.025em;overflow-wrap:anywhere}.dsh-board-summary{display:flex;align-items:center;gap:8px;margin-top:7px;color:var(--muted);font-size:12px}.dsh-board-summary-dot{width:3px;height:3px;border-radius:50%;background:currentColor}.dsh-board-actions{display:flex;gap:8px;flex-wrap:wrap}
      .dsh-board-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:20px 0 16px}.dsh-board-switch{display:flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:9px;background:var(--layer)}.dsh-board-switch button{min-height:30px;padding:6px 11px;border:0;background:transparent;color:var(--muted)}.dsh-board-switch button[aria-pressed=true]{color:var(--ink);background:var(--base);box-shadow:0 1px 4px #172b4d1a}.dsh-board-toolbar-spacer{flex:1}.dsh-board-search{width:220px}.dsh-board-filter{width:165px}.dsh-board-search,.dsh-board-filter{position:relative}.dsh-board-search svg,.dsh-board-filter svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}.dsh-board .dsh-board-search input,.dsh-board .dsh-board-filter select{padding-left:33px;min-height:36px}
      .dsh-board-kanban{display:flex;gap:14px;overflow-x:auto;align-items:stretch;padding:2px 1px 22px;scrollbar-width:thin}.dsh-board-column{flex:0 0 290px;min-width:0;min-height:245px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--layer)}.dsh-board-column-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px}.dsh-board-column-label{display:flex;align-items:center;gap:8px;min-width:0}.dsh-board-column-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--column-color,var(--accent))}.dsh-board-column-head h2{overflow-wrap:anywhere;font-size:12px;font-weight:700}.dsh-board-count{display:inline-grid;place-items:center;min-width:21px;height:21px;padding:0 5px;border-radius:6px;background:var(--base);color:var(--muted);font-size:11px;font-weight:650}.dsh-board-column-head button{min-height:27px;padding:4px 7px;border-color:transparent;background:transparent;color:var(--muted);font-size:11px}.dsh-board-column-empty{display:grid;place-items:center;min-height:92px;border:1px dashed var(--line);border-radius:9px;color:var(--muted);font-size:11px;text-align:center}
      .dsh-board-card{display:grid;gap:11px;margin:0 0 9px;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--base);box-shadow:0 2px 6px #172b4d0a}.dsh-board-card h3{font-size:13px;font-weight:660;line-height:1.45;overflow-wrap:anywhere}.dsh-board-card-description{margin-top:6px!important;color:var(--muted);font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.dsh-board-card-header,.dsh-board-card-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}.dsh-board-card-id{color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.04em}.dsh-board-card-status{min-width:0;overflow-wrap:anywhere;border-radius:5px;padding:4px 7px;background:var(--layer);color:var(--muted);font-size:10px;font-weight:700}.dsh-board-card-actions{justify-content:flex-start;padding-top:9px;border-top:1px solid var(--line)}.dsh-board-card-actions button{min-height:28px;padding:5px 7px;border:0;background:transparent;color:var(--muted);font-size:11px}.dsh-board-card-sessions-label{color:var(--muted);font-size:10px;font-weight:650}.dsh-board-card-sessions-list{display:grid;gap:5px;margin:6px 0 0;padding:0;list-style:none}.dsh-board-card-session{min-width:0;overflow-wrap:anywhere}.dsh-board-card-session button{display:block;max-width:100%;min-height:0;padding:0;overflow-wrap:anywhere;border:0;background:transparent;text-align:left;color:var(--accent);font-size:11px;font-weight:550}.dsh-board-card-session-unavailable{color:var(--muted);font-size:11px}.dsh-board-card-session-link{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
      .dsh-board-muted{color:var(--muted);font-size:12px;line-height:1.5}.dsh-board-list{display:grid;gap:10px;max-width:860px}.dsh-board-list .dsh-board-card{margin:0}.dsh-board-form{display:grid;gap:15px;max-width:700px;margin:18px 0;padding:22px;border:1px solid var(--line);border-radius:12px;background:var(--base);box-shadow:0 8px 28px #172b4d0c}.dsh-board-form h2{min-width:0;overflow-wrap:anywhere;font-size:16px;letter-spacing:-.02em}.dsh-board-form label{display:grid;gap:7px}.dsh-board-form fieldset{display:grid;gap:5px;max-height:240px;margin:0;padding:10px;border:1px solid var(--line);border-radius:8px;overflow:auto}.dsh-board-form legend{color:var(--muted);font-size:11px}.dsh-board-form fieldset label{display:flex;align-items:center;gap:9px;padding:7px;color:var(--ink);font-size:12px;overflow-wrap:anywhere}.dsh-board-form input[type=checkbox]{accent-color:var(--accent)}
      .dsh-board-alert{padding:12px 14px;margin:12px 0;border:1px solid var(--dsw-alias-state-warn-primary,var(--line));border-radius:9px;font-size:12px;line-height:1.5}.dsh-board-empty{padding:22px 0;color:var(--muted);font-size:12px}.dsh-board-welcome{display:grid;justify-items:center;gap:9px;margin:30px 0;padding:64px 20px;border:1px dashed var(--line);border-radius:12px;text-align:center}.dsh-board-welcome-icon{display:grid;place-items:center;width:44px;height:44px;margin-bottom:6px;border-radius:12px;background:var(--layer);color:var(--accent)}.dsh-board-welcome h2{font-size:15px}.dsh-board-welcome p{max-width:380px;color:var(--muted);font-size:12px;line-height:1.6}
      .dsh-board-overview{margin-top:30px}.dsh-board-overview-count{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:var(--accent-soft);color:var(--ink);font-size:11px;font-weight:700}.dsh-board-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:12px;margin-top:16px}.dsh-board button.dsh-board-tile{position:relative;display:flex;align-items:flex-start;justify-content:flex-start;gap:12px;min-height:98px;padding:16px;text-align:left;border-color:var(--line);background:var(--base)}.dsh-board button.dsh-board-tile:not(:disabled):hover{border-color:var(--accent);background:var(--accent-soft)}.dsh-board-tile-icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:10px;background:var(--accent-soft);color:var(--accent)}.dsh-board-tile-content{display:grid;gap:5px;min-width:0}.dsh-board-tile-content strong{color:var(--ink);font-size:13px;overflow-wrap:anywhere}.dsh-board-tile-content>span,.dsh-board-tile-content small{color:var(--muted);font-size:11px;font-weight:500;overflow-wrap:anywhere}.dsh-board-tile-arrow{margin-left:auto;color:var(--accent);font-size:15px}.dsh-board-session-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:16px 0;padding:12px 14px;border:1px solid var(--accent);border-radius:10px;background:var(--accent-soft);font-size:12px}.dsh-board-session-banner strong,.dsh-board-session-banner span{display:block;overflow-wrap:anywhere}.dsh-board-session-banner strong{margin-bottom:4px}.dsh-board-session-banner p{margin-top:5px;color:var(--muted)}.dsh-board button.dsh-board-back{justify-content:flex-start;min-height:0;margin:0 0 10px;padding:0;border:0;background:transparent;color:var(--accent);font-size:12px}.dsh-board .dsh-board-card{gap:6px;padding:8px 10px;border-radius:8px}.dsh-board .dsh-board-card-header{align-items:flex-start}.dsh-board button.dsh-board-card-title{display:block;min-height:28px;padding:4px 2px;border:0;background:transparent;color:var(--ink);font-size:12px;font-weight:600}.dsh-board button.dsh-board-card-action-links{display:inline-flex;gap:4px;min-width:30px;min-height:28px;padding:4px 6px;border:0;background:var(--accent-soft);color:var(--ink)}.dsh-board-card-action-links .dsh-board-icon{width:13px;height:13px}.dsh-board button.dsh-board-card-current{justify-self:start;min-height:28px;padding:5px 8px;border-color:var(--accent-soft);background:var(--accent-soft);color:var(--ink);font-size:11px}.dsh-board button.dsh-board-card-current.is-linked{border-color:var(--dsw-alias-state-success-primary,#22c55e);background:var(--dsw-alias-state-success-tertiary,#e6faed)}.dsh-board-session-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.dsh-board-session-row label{min-width:0}.dsh-board-session-row button{flex:none}
      @media(max-width:900px){.dsh-board-shell{padding:28px 24px}.dsh-board-context-action{margin-left:0}.dsh-board-header h1{font-size:26px}}@media(max-width:600px){.dsh-board-shell{padding:22px 16px}.dsh-board-header{gap:14px;margin-bottom:22px}.dsh-board-header h1{font-size:24px}.dsh-board-context{padding:14px;align-items:stretch}.dsh-board-context .dsh-board-field,.dsh-board-context .dsh-board-field:first-child{flex:1 1 100%}.dsh-board-context-action{width:100%}.dsh-board-context-action button{width:100%}.dsh-board-section-head{gap:12px}.dsh-board-toolbar-spacer{display:none}.dsh-board-search{flex:1 1 160px}.dsh-board-filter{flex:1 1 130px}.dsh-board-column{flex-basis:min(290px,85vw)}}@media(prefers-reduced-motion:reduce){.dsh-board button{transition:none}}
    `;

    function Icon({ name, size = 16 }) {
      const paths = {
        plus: h('path', { d: 'M12 5v14M5 12h14' }),
        refresh: h('path', { d: 'M20 7v5h-5M4 17v-5h5M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5A7 7 0 0 0 18.4 15' }),
        search: h(React.Fragment, null, h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }), h('path', { d: 'm16 16 4 4' })),
        filter: h('path', { d: 'M4 6h16M7 12h10M10 18h4' }),
        sessions: h(React.Fragment, null, h('path', { d: 'M8.5 12h7M10 9l-2.5 3L10 15M14 9l2.5 3L14 15' }), h('circle', { cx: 12, cy: 12, r: 8.5 })),
        columns: h(React.Fragment, null, h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }), h('path', { d: 'M9 4v16M15 4v16' })),
      };
      return h('svg', { className: 'dsh-board-icon', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, paths[name]);
    }
    function Page({ t, transport, workspacesSource, sessionsSource, openSession, sessionContext, connectionSource, panelSource }) {
      const connection = useSource(connectionSource);
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
      const { snapshot, workspaceId, boardId, showContext, contextSessionId, mode, query, statusFilter, assigneeFilter, sessionFilter, form, error, loading, uncertain, overview } = memory;
      const busy = memory.pending;
      const setMode = (value) => updateMemory({ mode: value });
      const setQuery = (value) => updateMemory({ query: value });
      const setStatusFilter = (value) => updateMemory({ statusFilter: value });
      const setShowContext = (value) => updateMemory({ showContext: value });
      const formHeading = useRef(null);
      const boards = useMemo(() => (snapshot ? snapshot.boards.filter((item) => item.workspaceId === workspaceId) : []), [snapshot, workspaceId]);
      const workspaceReady = workspaces.phase === 'ready' && workspaces.state !== 'error' && (!workspaceId || workspaces.items.some((item) => item.workspaceId === workspaceId));
      const selected = memory.provider === 'local' && !overview && workspaceReady ? boards.find((item) => item.id === boardId) : undefined;
      const tracker = memory.tracker;
      useEffect(() => {
        const known = memory.tracker.incarnations;
        if (Object.keys(known).some((id) => workspaceIncarnation(id) !== known[id])) {
          invalidateTracker();
          if (connectionSource.getSnapshot()) loadTracker();
        }
      }, [workspaces]);
      const trackerLive = (id) => connection && tracker.settings && Object.hasOwn(tracker.settings.workspaces, id) && !tracker.settings.needsReselect.includes(id) && workspaces.phase === 'ready' && workspaces.state !== 'error' && workspaces.items.some((item) => item.workspaceId === id && typeof item.createdAt === 'string' && item.createdAt && tracker.incarnations[id] === item.createdAt);
      const trackerTiles = connection && tracker.settings && tracker.settings.configured && !showContext && workspaces.phase === 'ready' && workspaces.state !== 'error' ? workspaces.items.flatMap((item) => (!workspaceId || workspaceId === item.workspaceId) && trackerLive(item.workspaceId) ? (tracker.settings.workspaces[item.workspaceId] || []).map((id) => ({ id, workspaceId: item.workspaceId, name: tracker.listing?.boards.find((b) => b.id === id)?.name || `${t('tracker')} #${id}` })) : []) : [];
      const visibleBoards = snapshot && workspaces.phase === 'ready' && workspaces.state !== 'error'
        ? snapshot.boards.filter((board) => (!workspaceId || board.workspaceId === workspaceId) && workspaces.items.some((item) => item.workspaceId === board.workspaceId) && (!showContext || !contextSessionId || workspaces.items.some((item) => item.workspaceId === board.workspaceId && item.sessionIds.includes(contextSessionId)))) : [];
      const workspace = workspaces.items.find((item) => item.workspaceId === workspaceId);
      const statuses = selected ? [...selected.statuses].sort((a, b) => (a.position || 0) - (b.position || 0)) : [];
      const filterValue = (kind, value) => JSON.stringify(value === undefined ? [kind] : [kind, value]);
      const allAssigneesValue = filterValue('all'), unassignedValue = filterValue('unassigned'), unknownValue = filterValue('unknown');
      const assigneeMatches = (filter, known, value) => filter === allAssigneesValue || (filter === unknownValue ? !known : filter === unassignedValue ? known && value === null : known && value !== null && filter === filterValue('assignee', value));
      const localAssignees = selected ? [...new Set(selected.tasks.map((task) => task.assignee).filter((value) => typeof value === 'string'))].sort((a, b) => a.localeCompare(b)) : [];
      const specialAssigneeFilter = [allAssigneesValue, unassignedValue, unknownValue].includes(assigneeFilter);
      const linksFor = (taskId) => snapshot.links.filter((link) => link.boardId === boardId && link.taskId === taskId);
      const sessionMembershipReady = Boolean(workspaceReady && workspace && Array.isArray(workspace.sessionIds));
      const tasks = selected ? selected.tasks.filter((task) => {
        const linked = sessionMembershipReady && linksFor(task.id).some((link) => workspace.sessionIds.includes(link.sessionId));
        return (!statusFilter || task.statusId === statusFilter) && (task.title + '\n' + (task.description || '')).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
          assigneeMatches(assigneeFilter, task.assignee !== undefined, task.assignee ?? null) &&
          (sessionFilter === 'all' || (sessionMembershipReady && (sessionFilter === 'linked' ? linked : !linked)));
      }) : [];
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
        if (connectionSource.getSnapshot()) loadTracker();
        return () => invalidateTracker(false, true);
      }, []);
      useEffect(() => {
        if (connection && !memory.tracker.settings && !memory.tracker.busy && !memory.tracker.error) loadTracker();
      }, [connection]);
      useEffect(() => {
        let alive = true, running = false, queued = false, lastEvent = 0;
        const active = () => trackerActive();
        const targetOpen = () => memory.provider === 'tracker' && !memory.overview && !memory.showContext && Boolean(memory.workspaceId && memory.boardId);
        // Keep only non-authorizing draft IDs; fence every private response across a boundary.
        const clearPrivate = () => {
          privacyEpoch++;
          const current = memory.tracker;
          const draftWorkspace = current.pickerWorkspace || current.draftWorkspace;
          const draftPicked = current.pickerWorkspace ? [...current.picked] : current.draftPicked;
          updateTracker({ settings: null, incarnations: {}, board: null, boardUpdatedAt: null, listing: null, pickerWorkspace: '', draftWorkspace, draftPicked, draftIncarnation: current.draftIncarnation || current.incarnations[draftWorkspace], reviewRequired: Boolean(draftWorkspace) });
        };
        const drain = async () => {
          if (!alive || running || !queued || !active() || !connectionSource.getSnapshot() || memory.tracker.busy) return;
          queued = false; running = true;
          try { await loadTracker(); } finally {
            running = false;
            if (alive && queued) void drain();
          }
        };
        const request = (force = false) => {
          if (!force && !targetOpen()) return;
          if (running && lastEvent && Date.now() - lastEvent < 250) return;
          lastEvent = Date.now();
          clearPrivate();
          if (!active()) { queued = false; return; }
          queued = true; void drain();
        };
        const onVisibility = () => { if (!active()) { clearPrivate(); queued = false; lastEvent = 0; } else request(true); };
        const onFocus = () => { if (active()) request(true); };
        const onPanel = () => { if (!active()) { clearPrivate(); queued = false; lastEvent = 0; } else request(true); };
        const onMemory = () => { if (queued && !running && !memory.tracker.busy) void drain(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        const unsubscribe = panelSource?.subscribe(onPanel);
        memory.listeners.add(onMemory);
        const timer = window.setInterval(() => { if (active() && targetOpen()) request(); }, 30000);
        return () => { alive = false; queued = false; memory.listeners.delete(onMemory); unsubscribe?.(); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); window.clearInterval(timer); };
      }, []);
      useEffect(() => {
        if (!context.sessionId || workspaces.phase !== 'ready' || workspaces.state === 'error' || memory.contextHandled === context.token) return;
        // Never switch the target behind an existing draft or in-flight write.
        if (memory.pending || memory.uncertain) return;
        if (memory.form && memory.dirty && !window.confirm(t('discardDraft'))) { memory.contextHandled = context.token; return; }
        memory.contextHandled = context.token;
        const candidates = workspaces.items.filter((item) => item.sessionIds.includes(context.sessionId));
        updateMemory({ showContext: true, contextSessionId: context.sessionId, form: null, dirty: false, workspaceId: candidates.length === 1 ? candidates[0].workspaceId : '', boardId: '', provider: 'local', statusFilter: '', query: '', assigneeFilter: '["all"]', sessionFilter: 'all', overview: true });
      }, [context, workspaces, busy, uncertain]);
      useEffect(() => { if (form && formHeading.current) formHeading.current.focus(); }, [form && form.kind]);
      function updateTracker(patch) { updateMemory({ tracker: { ...memory.tracker, ...patch } }); }
      function validTrackerRequest(epoch, connectionId) {
        return memory.tracker.generation === epoch && connectionId !== undefined && connectionSource.getSnapshot()?.id === connectionId;
      }
      function trackerActive() {
        return document.visibilityState !== 'hidden' && (!panelSource || panelSource.getSnapshot()?.activePanelId === PANEL);
      }
      function validPrivateRequest(generation, connectionId, epoch) {
        return validTrackerRequest(generation, connectionId) && privacyEpoch === epoch && trackerActive();
      }
      function workspaceIncarnation(id) {
        const current = workspacesSource.getSnapshot();
        if (current.phase !== 'ready' || current.state === 'error') return undefined;
        const value = current.items.find((item) => item.workspaceId === id)?.createdAt;
        return typeof value === 'string' && value ? value : undefined;
      }
      function currentWorkspace(id, incarnation = memory.tracker.incarnations[id]) {
        return Boolean(incarnation && workspaceIncarnation(id) === incarnation);
      }
      function workspaceIncarnations() {
        const current = workspacesSource.getSnapshot(), result = {};
        if (current.phase === 'ready' && current.state !== 'error') for (const item of current.items) if (typeof item.createdAt === 'string' && item.createdAt) result[item.workspaceId] = item.createdAt;
        return result;
      }
      async function loadTracker(accepts = () => document.visibilityState !== 'hidden' && (!panelSource || panelSource.getSnapshot()?.activePanelId === PANEL)) {
        const connectionId = connectionSource.getSnapshot()?.id;
        if (memory.tracker.busy || connectionId === undefined || !accepts()) return;
        const generation = memory.tracker.generation + 1, incarnations = workspaceIncarnations(), epoch = privacyEpoch;
        const target = memory.provider === 'tracker' && !memory.overview && !memory.showContext ? memory.workspaceId : '', id = memory.boardId;
        const draftWorkspace = memory.tracker.pickerWorkspace || memory.tracker.draftWorkspace;
        const draftPicked = memory.tracker.pickerWorkspace ? [...memory.tracker.picked] : memory.tracker.draftPicked;
        updateTracker({ busy: true, error: '', notice: '', settings: null, pickerWorkspace: '', listing: null, draftWorkspace, draftPicked, reviewRequired: Boolean(draftWorkspace), board: null, boardUpdatedAt: null, incarnations: {}, generation });
        try {
          const settings = trackerSettings(await transport.trackerRead());
          if (!validPrivateRequest(generation, connectionId, epoch) || !accepts()) return;
          updateTracker({ settings, orgType: settings.orgType || 'cloud', incarnations, board: null });
          if (target && memory.provider === 'tracker' && !memory.overview && !memory.showContext && memory.workspaceId === target && memory.boardId === id && currentWorkspace(target, incarnations[target])) {
            if (settings.needsReselect.includes(target) || !settings.workspaces[target]?.includes(id)) { updateTracker({ error: 'trackerReselect' }); return; }
            const board = trackerBoard(await transport.trackerCommand({ op: 'board.read', workspaceId: target, boardId: id, issueKeys: [] }), id);
            if (validPrivateRequest(generation, connectionId, epoch) && accepts() && memory.provider === 'tracker' && !memory.overview && !memory.showContext && memory.workspaceId === target && memory.boardId === id && currentWorkspace(target, incarnations[target])) updateTracker({ board, boardUpdatedAt: Date.now() });
          }
        } catch (err) { if (validPrivateRequest(generation, connectionId, epoch) && accepts() && (!target || (memory.provider === 'tracker' && !memory.overview && memory.workspaceId === target && memory.boardId === id))) updateTracker({ settings: null, board: null, error: trackerError(err) }); }
        finally { if (validTrackerRequest(generation, connectionId)) updateTracker({ busy: false }); }
      }
      async function configureTracker() {
        const current = memory.tracker;
        if (current.busy || !current.settings || (current.settings.configured && !window.confirm(t('trackerConfigureWarning')))) return;
        const revision = current.settings.revision, connectionId = connectionSource.getSnapshot()?.id;
        if (connectionId === undefined) return;
        const generation = current.generation + 1, epoch = privacyEpoch;
        trackerMutationPending = true;
        updateTracker({ busy: true, mutating: true, error: '', notice: '', listing: null, pickerWorkspace: '', board: null, settings: null, generation });
        try {
          const next = trackerSettings(await transport.trackerCommand({ op: 'configuration.configure', expectedRevision: revision, orgType: current.orgType }));
          if (!validPrivateRequest(generation, connectionId, epoch)) return;
          if (next.revision !== revision + 1 || !next.configured) throw new Error('invalid receipt');
          updateTracker({ settings: next, orgType: next.orgType, notice: 'trackerConfigured', draftWorkspace: '', draftPicked: [], reviewRequired: false });
        } catch (err) { if (validPrivateRequest(generation, connectionId, epoch)) updateTracker({ settings: null, error: err.status >= 400 && err.status < 500 ? trackerError(err) : 'trackerUncertain' }); }
        finally {
          trackerMutationPending = false;
          if (validTrackerRequest(generation, connectionId)) updateTracker({ busy: false, mutating: false, ...(privacyEpoch !== epoch ? { error: 'trackerUncertain' } : {}) });
          else if (memory.tracker.mutating) {
            updateTracker({ busy: false, mutating: false, settings: null, error: 'trackerUncertain' });
            if (trackerActive() && connectionSource.getSnapshot()) void loadTracker();
          }
        }
      }
      async function listTrackerBoards() {
        const current = memory.tracker;
        if (current.busy || !current.settings?.configured || !memory.workspaceId || !workspaceReady) return;
        const target = memory.workspaceId, revision = current.settings.revision, connectionId = connectionSource.getSnapshot()?.id;
        if (connectionId === undefined || !currentWorkspace(target)) return;
        const generation = current.generation + 1, epoch = privacyEpoch, incarnation = current.incarnations[target];
        const listingStarted = Date.now(), draftWorkspace = current.pickerWorkspace || current.draftWorkspace;
        const draftPicked = current.pickerWorkspace ? [...current.picked] : current.draftPicked;
        updateTracker({ busy: true, error: '', notice: '', listing: null, pickerWorkspace: '', draftWorkspace, draftPicked, generation });
        try {
          const listing = trackerListing(await transport.trackerCommand({ op: 'boards.list' }));
          if (!validPrivateRequest(generation, connectionId, epoch) || memory.workspaceId !== target || !currentWorkspace(target, incarnation) || memory.tracker.settings?.revision !== revision) return;
          const hasDraft = draftWorkspace === target && current.draftIncarnation === incarnation;
          const saved = hasDraft ? draftPicked : current.settings.workspaces[target] || [];
          updateTracker({ listing, listingStarted, pickerWorkspace: target, picked: hasDraft ? [...saved] : saved.filter((id) => listing.boards.some((board) => board.id === id)), draftWorkspace: target, draftPicked: saved, draftIncarnation: incarnation, reviewRequired: hasDraft });
        } catch (err) { if (validPrivateRequest(generation, connectionId, epoch) && memory.workspaceId === target && currentWorkspace(target, incarnation)) updateTracker({ error: trackerError(err) }); }
        finally { if (validTrackerRequest(generation, connectionId)) updateTracker({ busy: false }); }
      }
      async function selectTrackerBoards() {
        const current = memory.tracker, target = memory.workspaceId;
        if (current.busy || !current.settings || !current.listing || current.pickerWorkspace !== target || !workspaceReady) return;
        if (Date.now() - current.listingStarted >= 30000 || current.reviewRequired) { updateTracker({ error: 'trackerListRequired' }); return; }
        if (current.picked.some((id) => !current.listing.boards.some((board) => board.id === id))) { updateTracker({ error: 'trackerListRequired' }); return; }
        const revision = current.settings.revision, connectionId = connectionSource.getSnapshot()?.id;
        if (connectionId === undefined || !currentWorkspace(target)) return;
        const removed = (current.settings.workspaces[target] || []).filter((id) => !current.picked.includes(id));
        if (!window.confirm(t('trackerConfirmSelection') + (removed.join(', ') || '—'))) return;
        const generation = current.generation + 1, incarnations = workspaceIncarnations(), epoch = privacyEpoch;
        trackerMutationPending = true;
        updateTracker({ busy: true, mutating: true, error: '', notice: '', settings: null, listing: null, pickerWorkspace: '', draftWorkspace: target, draftPicked: [...current.picked], draftIncarnation: incarnations[target], reviewRequired: true, board: null, generation });
        try {
          const receipt = await transport.trackerCommand({ op: 'workspace.select', expectedRevision: revision, workspaceId: target, boardIds: [...current.picked] });
          if (!validPrivateRequest(generation, connectionId, epoch)) return;
          if (!receipt || receipt.revision !== revision + 1 || receipt.workspaceId !== target || !Array.isArray(receipt.boardIds) || JSON.stringify(receipt.boardIds) !== JSON.stringify(current.picked)) throw new Error('invalid receipt');
          const settings = trackerSettings(await transport.trackerRead());
          if (!validPrivateRequest(generation, connectionId, epoch)) return;
          if (settings.revision < receipt.revision) throw new Error('invalid receipt');
          updateTracker({ settings, listing: null, incarnations, pickerWorkspace: '', picked: [], draftWorkspace: '', draftPicked: [], draftIncarnation: undefined, reviewRequired: false, board: null, notice: 'trackerSelectionSaved' });
        } catch (err) {
          if (validPrivateRequest(generation, connectionId, epoch)) {
            updateTracker({ settings: null, listing: null, pickerWorkspace: '', board: null, error: err.status >= 400 && err.status < 500 ? trackerError(err) : 'trackerUncertain' });
            try {
              const settings = trackerSettings(await transport.trackerRead());
              if (validPrivateRequest(generation, connectionId, epoch)) updateTracker({ settings, incarnations: workspaceIncarnations() });
            } catch { /* Remain invalid until an explicit reload succeeds. */ }
          }
        } finally {
          trackerMutationPending = false;
          if (validTrackerRequest(generation, connectionId)) updateTracker({ busy: false, mutating: false, ...(privacyEpoch !== epoch ? { error: 'trackerUncertain' } : {}) });
          else if (memory.tracker.mutating) {
            updateTracker({ busy: false, mutating: false, settings: null, error: 'trackerUncertain' });
            if (trackerActive() && connectionSource.getSnapshot()) void loadTracker();
          }
        }
      }
      async function readTrackerBoard(target, id) {
        const settings = memory.tracker.settings, connectionId = connectionSource.getSnapshot()?.id;
        if (memory.tracker.busy || connectionId === undefined || !currentWorkspace(target) || !settings || settings.needsReselect.includes(target) || !settings.workspaces[target]?.includes(id)) return;
        const incarnation = memory.tracker.incarnations[target], generation = memory.tracker.generation + 1, epoch = privacyEpoch;
        const current = memory.tracker, draftWorkspace = current.pickerWorkspace || current.draftWorkspace;
        const draftPicked = current.pickerWorkspace ? [...current.picked] : current.draftPicked;
        updateTracker({ busy: true, error: '', settings: null, listing: null, pickerWorkspace: '', draftWorkspace, draftPicked, reviewRequired: Boolean(draftWorkspace), board: null, boardUpdatedAt: null, generation });
        const accepts = () => validPrivateRequest(generation, connectionId, epoch) && currentWorkspace(target, incarnation) && memory.provider === 'tracker' && !memory.overview && !memory.showContext && memory.workspaceId === target && memory.boardId === id;
        try {
          const fresh = trackerSettings(await transport.trackerRead());
          if (!accepts()) return;
          updateTracker({ settings: fresh });
          if (fresh.needsReselect.includes(target) || !fresh.workspaces[target]?.includes(id)) { updateTracker({ error: 'trackerReselect' }); return; }
          const board = trackerBoard(await transport.trackerCommand({ op: 'board.read', workspaceId: target, boardId: id, issueKeys: [] }), id);
          if (accepts()) updateTracker({ board, boardUpdatedAt: Date.now() });
        } catch (err) {
          if (validPrivateRequest(generation, connectionId, epoch)) {
            const error = trackerError(err), targetActive = accepts();
            if (['trackerReselect', 'trackerConflict', 'trackerNotSelected', 'trackerCredentials'].includes(error)) updateTracker({ settings: null, listing: null, board: null });
            if (targetActive) updateTracker({ error, board: null });
          }
        } finally { if (validTrackerRequest(generation, connectionId)) updateTracker({ busy: false }); }
      }
      function openTrackerBoard(board) {
        if (memory.pending || memory.uncertain || memory.tracker.busy || !setForm(null)) return;
        updateMemory({ workspaceId: board.workspaceId, boardId: board.id, provider: 'tracker', statusFilter: '', query: '', assigneeFilter: '["all"]', sessionFilter: 'all', overview: false, showContext: false });
        readTrackerBoard(board.workspaceId, board.id);
      }
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
        if (form.kind === 'task') submit({ op: 'task.save', workspaceId, boardId, task: { ...(form.id ? { id: form.id } : {}), title: form.title.trim(), description: form.description, statusId: form.statusId, ...(form.assigneeEdited ? { assignee: form.assignee.trim() || null } : {}) } });
      }
      function changeWorkspace(event) {
        const value = event.target.value;
        const tracker = memory.tracker;
        const draftWorkspace = tracker.pickerWorkspace || tracker.draftWorkspace;
        if (value !== memory.workspaceId && draftWorkspace && !window.confirm(t('discardDraft'))) { event.target.value = memory.workspaceId; return; }
        if (!setForm(null)) { event.target.value = memory.workspaceId; return; }
        updateMemory({ workspaceId: value, boardId: '', provider: 'local', statusFilter: '', query: '', assigneeFilter: '["all"]', sessionFilter: 'all', overview: true, tracker: { ...memory.tracker, pickerWorkspace: '', picked: [], draftWorkspace: '', draftPicked: [], draftIncarnation: undefined, reviewRequired: false, listing: null, board: null } });
      }
      function changeBoard(event) {
        const value = event.target.value;
        if (!setForm(null)) { event.target.value = memory.boardId; return; }
        updateMemory({ boardId: value, provider: 'local', statusFilter: '', query: '', assigneeFilter: '["all"]', sessionFilter: 'all', overview: !value });
      }
      function openBoard(board) {
        if (memory.pending || memory.uncertain || !setForm(null)) return;
        updateMemory({ workspaceId: board.workspaceId, boardId: board.id, provider: 'local', statusFilter: '', query: '', assigneeFilter: '["all"]', sessionFilter: 'all', overview: false });
      }
      function showBoards() {
        if (!setForm(null)) return;
        updateMemory({ workspaceId: '', boardId: '', provider: 'local', statusFilter: '', query: '', assigneeFilter: '["all"]', sessionFilter: 'all', overview: true });
      }
      function editTask(task) { setForm({ kind: 'task', id: task.id, title: task.title, description: task.description || '', statusId: task.statusId, assignee: task.assignee ?? '', assigneeEdited: false }); }
      function open(id) { if (sessionState(id, sessions, workspaces) === 'available') openSession(id); }
      function link(id, linked, taskId) {
        if (memory.form && memory.form.kind !== 'links' && memory.dirty && !window.confirm(t('discardDraft'))) return;
        submit({ op: 'link.set', workspaceId, boardId, taskId, sessionId: id, linked });
      }
      function card(task) {
        const taskLinks = linksFor(task.id);
        const membership = workspace && workspace.sessionIds.includes(contextSessionId);
        const isLinked = taskLinks.some((item) => item.sessionId === contextSessionId);
        const unavailable = sessionState(contextSessionId, sessions, workspaces) !== 'available';
        return h('article', { className: 'dsh-board-card', key: task.id },
          h('div', { className: 'dsh-board-card-header' },
            h('button', { className: 'dsh-board-card-title', type: 'button', disabled: busy || uncertain, onClick: () => editTask(task), 'aria-label': t('editTask') + ': ' + task.title, style: { flex: 1, minWidth: 0, justifyContent: 'flex-start', overflowWrap: 'anywhere', textAlign: 'left' } }, task.title),
            mode === 'list' && h('span', { className: 'dsh-board-card-status' }, statuses.find((s) => s.id === task.statusId)?.name || t('statusMissing')),
            h('button', { className: 'dsh-board-card-action dsh-board-card-action-links dsh-board-count', type: 'button', disabled: busy || uncertain, onClick: () => setForm({ kind: 'links', id: task.id, title: task.title }), 'aria-label': t('sessions') + ': ' + task.title, title: t('sessions'), style: { flex: 'none' } }, h(Icon, { name: 'sessions' }), String(taskLinks.length))),
          task.assignee && h('span', { className: 'dsh-board-muted' }, t('assignee'), ': ', task.assignee),
          showContext && contextSessionId && (membership || isLinked) && h('button', { className: 'dsh-board-card-current' + (isLinked ? ' is-linked' : ''), type: 'button', disabled: busy || loading || uncertain || !snapshot || !selected || (!isLinked && unavailable), 'aria-label': t(isLinked ? 'unlinkCurrent' : 'linkCurrent') + ': ' + task.title, onClick: () => link(contextSessionId, !isLinked, task.id) }, t(isLinked ? 'unlinkCurrent' : 'linkCurrent')));
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
              return h('div', { className: 'dsh-board-session-row', key: id },
                h('label', null, h('input', { type: 'checkbox', checked, disabled: !checked && Boolean(reason), onChange: (event) => link(id, event.target.checked, form.id) }), h('span', null, label(id), reason ? ' — ' + t(reason) : '')),
                checked && state === 'available' && h('button', { type: 'button', onClick: () => open(id), 'aria-label': t('openSession') + ': ' + label(id) }, t('openSession')));
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
            h('label', null, t('assignee'), h('input', { readOnly: busy || uncertain, maxLength: 256, value: form.assignee || '', onChange: (event) => { if (!memory.form || memory.pending || memory.uncertain) return; updateMemory({ form: { ...memory.form, assignee: event.target.value, assigneeEdited: true }, dirty: true }); } })),
            h('label', null, t('status'), h('select', { required: true, disabled: busy || uncertain, value: form.statusId, onChange: (event) => setField('statusId', event.target.value) }, statuses.map((status) => h('option', { key: status.id, value: status.id }, status.name))))),
          h('div', { className: 'dsh-board-row' }, h('button', { type: 'submit', disabled: busy || loading || uncertain || !snapshot || (form.kind !== 'board' && !selected) || ((form.kind === 'board' || form.kind === 'status') && !form.name.trim()) || (form.kind === 'task' && (!form.title.trim() || !form.statusId)) }, busy ? t('saving') : t('save')),
            h('button', { type: 'button', disabled: busy || uncertain, onClick: () => setForm(null) }, t('cancel'))));
      }
      function trackerView() {
        if (memory.provider !== 'tracker' || overview || showContext) return null;
        const value = connection && workspaceReady && trackerLive(workspaceId) && tracker.settings.workspaces[workspaceId]?.includes(boardId) ? tracker.board : null;
        const statusOwners = new Map();
        for (const column of value?.columns || []) for (const key of new Set(column.statuses.map((s) => s.key))) {
          const owners = statusOwners.get(key) || []; owners.push(column.id); statusOwners.set(key, owners);
        }
        const assignees = new Map();
        for (const issue of value?.issues || []) if (issue.assigneeKnown && issue.assignee && !assignees.has(issue.assignee.id)) assignees.set(issue.assignee.id, issue.assignee.display);
        const issues = (value?.issues || []).filter((issue) => assigneeMatches(assigneeFilter, issue.assigneeKnown, issue.assignee?.id ?? null));
        const grouped = (value?.columns || []).map((column) => ({ id: column.id, name: column.name, issues: issues.filter((issue) => { const owners = statusOwners.get(issue.status.key) || []; return owners.length === 1 && owners[0] === column.id; }) }));
        const unmapped = issues.filter((issue) => (statusOwners.get(issue.status.key) || []).length !== 1);
        if (unmapped.length) grouped.push({ id: null, name: t('trackerUnmapped'), issues: unmapped });
        return h('section', { 'aria-label': t('tracker') },
          h('div', { className: 'dsh-board-section-head' }, h('div', null,
            h('button', { className: 'dsh-board-back', type: 'button', disabled: busy || uncertain, onClick: showBoards }, '← ', t('returnToBoards')),
            h('div', { className: 'dsh-board-section-title' }, h('h2', null, value?.board.name || (connection && trackerLive(workspaceId) ? `${t('tracker')} #${boardId}` : t('tracker')))),
            h('p', { className: 'dsh-board-muted' }, t('tracker'), ' · ', t('trackerReadOnly'), ' · ', t('trackerPartialBadge'))),
            h('button', { type: 'button', disabled: tracker.busy || !trackerLive(workspaceId), onClick: () => readTrackerBoard(workspaceId, boardId) }, t('trackerRefreshBoard'))),
          h('p', { className: 'dsh-board-alert', role: 'status' }, t('trackerPartial'), ' ', t('trackerContext')),
          tracker.busy && h('p', { role: 'status' }, t('loading')),
          value && tracker.boardUpdatedAt !== null && h('p', { className: 'dsh-board-muted', role: 'status' }, t('trackerUpdatedAt'), ' ', new Date(tracker.boardUpdatedAt).toLocaleString()),
          value && h('label', { className: 'dsh-board-filter' }, h('select', { 'aria-label': t('assignee'), value: assigneeFilter, onChange: (event) => updateMemory({ assigneeFilter: event.target.value }) }, h('option', { value: allAssigneesValue }, t('allAssignees')), h('option', { value: unassignedValue }, t('unassigned')), h('option', { value: unknownValue }, t('assigneeUnknown')), !specialAssigneeFilter && ![...assignees.keys()].some((id) => filterValue('assignee', id) === assigneeFilter) && h('option', { value: assigneeFilter }, t('assigneeUnavailable')), [...assignees].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([id, display]) => h('option', { key: id, value: filterValue('assignee', id) }, display, ' (', id, ')')))),
          value && !value.issues.length && h('p', { className: 'dsh-board-muted' }, t('trackerEmpty')),
          value && value.issues.length > 0 && !issues.length && h('p', { className: 'dsh-board-muted' }, t('noResults')),
          value && h('div', { className: 'dsh-board-kanban' }, grouped.map((column) => h('section', { className: 'dsh-board-column', key: column.id || '__unmapped', 'aria-label': column.name },
            h('div', { className: 'dsh-board-column-head' }, h('div', { className: 'dsh-board-column-label' }, h('h2', null, column.name), h('span', { className: 'dsh-board-count' }, column.issues.length))),
            column.issues.map((issue) => h('article', { className: 'dsh-board-card', key: issue.key }, h('span', { className: 'dsh-board-card-id' }, issue.key), h('h3', null, issue.summary), h('span', { className: 'dsh-board-card-status' }, issue.status.display), h('span', { className: 'dsh-board-muted' }, t('assignee'), ': ', issue.assigneeKnown ? (issue.assignee?.display || t('unassigned')) : t('assigneeUnknown'))))))));
      }
      const colors = ['var(--dsw-alias-state-business-primary, #4176e6)', 'var(--dsw-alias-state-warn-primary, #d89548)', 'var(--dsw-alias-state-success-primary, #45a784)', 'var(--dsw-alias-state-error-primary, #d16f72)'];
      return h('main', { className: 'dsh-board' }, h('style', null, css), h('div', { className: 'dsh-board-shell' },
        h('header', { className: 'dsh-board-header' },
          h('div', { className: 'dsh-board-header-title' }, h('div', { className: 'dsh-board-eyebrow' }, t('eyebrow')), h('h1', null, t('panel')), h('p', { className: 'dsh-board-subtitle' }, t('pageDescription'))),
          h('div', { className: 'dsh-board-header-actions' }, h('button', { type: 'button', onClick: () => { if (memory.tracker.open) updateTracker({ open: false }); else { updateTracker({ open: true }); loadTracker(); } } }, t(tracker.open ? 'trackerClose' : 'trackerConnect')), h('button', { type: 'button', disabled: busy || loading, onClick: load, title: t('refreshShort') }, h(Icon, { name: 'refresh' }), t('refresh')))),
        tracker.open && h('section', { className: 'dsh-board-form', 'aria-label': t('trackerSettings') },
          h('h2', null, t('trackerSettings')), h('p', { className: 'dsh-board-muted' }, t('trackerRefs')),
          tracker.busy && h('p', { role: 'status' }, t('loading')),
          connection && tracker.settings && h(React.Fragment, null,
            h('p', { className: 'dsh-board-muted' }, t(tracker.settings.configured ? 'trackerConfigured' : 'trackerNotConfigured')),
            h('label', null, t('trackerOrg'), h('select', { value: tracker.orgType, disabled: tracker.busy, onChange: (event) => updateTracker({ orgType: event.target.value }) }, h('option', { value: 'cloud' }, 'cloud'), h('option', { value: 'org' }, 'org'))),
            h('div', { className: 'dsh-board-row' }, h('button', { type: 'button', disabled: tracker.busy, onClick: configureTracker }, t('trackerConfiguring')), h('button', { type: 'button', disabled: tracker.busy, onClick: loadTracker }, t('trackerReload'))),
            tracker.settings.configured && workspaceId && workspaceReady && h(React.Fragment, null,
              h('h3', null, t('trackerChoose'), ' — ', workspace?.title || workspaceId),
              h('p', { className: 'dsh-board-muted' }, t('trackerPickerHint')),
              tracker.settings.needsReselect.includes(workspaceId) && h('p', { className: 'dsh-board-alert', role: 'status' }, t('trackerReselect')),
              !tracker.settings.workspaces[workspaceId]?.length && h('p', { className: 'dsh-board-muted' }, t('trackerNoSelection')),
              h('button', { type: 'button', disabled: tracker.busy, onClick: listTrackerBoards }, t('trackerList')),
              tracker.listing && tracker.pickerWorkspace === workspaceId && h(React.Fragment, null,
                !tracker.listing.complete && h('p', { className: 'dsh-board-alert' }, t('trackerListPartial')),
                (tracker.settings.workspaces[workspaceId] || []).some((id) => !tracker.listing.boards.some((board) => board.id === id)) && h('p', { className: 'dsh-board-alert' }, t('trackerMissingSelection')),
                tracker.listing.boards.length ? h('fieldset', { disabled: tracker.busy }, h('legend', null, t('trackerChoose')), tracker.listing.boards.map((board) => h('label', { key: board.id }, h('input', { type: 'checkbox', checked: tracker.picked.includes(board.id), onChange: (event) => updateTracker({ picked: event.target.checked ? [...memory.tracker.picked, board.id] : memory.tracker.picked.filter((id) => id !== board.id) }) }), board.name, ' #', board.id))) : h('p', null, t('trackerNoBoards')),
                tracker.picked.filter((id) => !tracker.listing.boards.some((board) => board.id === id)).map((id) => h('label', { key: id }, h('input', { type: 'checkbox', checked: true, onChange: () => updateTracker({ picked: memory.tracker.picked.filter((value) => value !== id) }) }), t('trackerMissingSelection'), ' #', id)),
                tracker.reviewRequired && h('label', null, h('input', { type: 'checkbox', checked: false, onChange: (event) => { if (event.target.checked) updateTracker({ reviewRequired: false }); } }), t('trackerReviewDraft')),
                h('button', { type: 'button', disabled: tracker.busy || tracker.reviewRequired, onClick: selectTrackerBoards }, t('trackerSelect'))))),
          !tracker.settings && !tracker.busy && h('button', { type: 'button', onClick: loadTracker }, t('trackerReload'))),
        tracker.error && h('div', { className: 'dsh-board-alert', role: 'alert' }, t(tracker.error)),
        tracker.notice && h('p', { className: 'dsh-board-muted', role: 'status' }, t(tracker.notice)),
        error && h('div', { className: 'dsh-board-alert', role: 'alert' }, t(error), ' ', h('button', { type: 'button', disabled: busy || loading, onClick: load }, t('retry'))),
        uncertain && h('div', { className: 'dsh-board-alert', role: 'status' }, t('readbackFirst'), ' ', h('button', { type: 'button', disabled: busy || loading || !memory.readback, onClick: () => { if (memory.readback && !memory.loading && window.confirm(t('reviewUnknown'))) updateMemory({ uncertain: false, uncertainRevision: null, readback: false, error: '' }); } }, t('acknowledgeUnknown'))),
        (memory.dirty || busy || uncertain) && h('p', { className: 'dsh-board-muted' }, t('draftWarning')),
        loading && h('p', { className: 'dsh-board-muted', role: 'status' }, t('loading')),
        workspaces.state === 'error' && h('p', { className: 'dsh-board-alert', role: 'alert' }, t('workspaceError')),
        workspaces.phase !== 'ready' && h('p', { className: 'dsh-board-muted', role: 'status' }, t('inProgress')),
        workspaces.phase === 'ready' && workspaces.state !== 'error' && !workspaces.items.length && h('p', { className: 'dsh-board-muted' }, t('noWorkspaces')),
        showContext && contextSessionId && h('div', { className: 'dsh-board-session-banner' }, h('div', null, h('strong', null, t('sessionContext')), h('span', null, label(contextSessionId)), h('p', null, t('sessionHelp'))), h('button', { type: 'button', onClick: () => setShowContext(false) }, t('close'))),
        h('div', { className: 'dsh-board-context' },
          h('label', { className: 'dsh-board-field' }, h('span', null, t('workspace')), h('select', { value: workspaceId, onChange: changeWorkspace, disabled: busy || uncertain || workspaces.phase !== 'ready' || workspaces.state === 'error' }, h('option', { value: '' }, t('chooseWorkspace')), workspaces.items.map((item) => h('option', { key: item.workspaceId, value: item.workspaceId }, item.title)))),
          workspaceId && workspaceReady && snapshot && h('label', { className: 'dsh-board-field' }, h('span', null, t('board')), h('select', { value: memory.provider === 'local' ? boardId : '', onChange: changeBoard, disabled: busy || uncertain }, h('option', { value: '' }, t('chooseBoard')), boards.map((item) => h('option', { key: item.id, value: item.id }, item.name)))),
          workspaceId && workspaceReady && snapshot && h('div', { className: 'dsh-board-context-action' }, h('button', { type: 'button', disabled: busy || uncertain, onClick: () => setForm({ kind: 'board', name: '' }) }, h(Icon, { name: 'plus' }), t('newBoard')))),
        overview && !form && snapshot && workspaces.phase === 'ready' && workspaces.state !== 'error' && h('section', { className: 'dsh-board-overview', 'aria-label': t('boards') },
          h('div', { className: 'dsh-board-section-head' }, h('div', { className: 'dsh-board-section-title' }, h('h2', null, t('boards'))), h('span', { className: 'dsh-board-overview-count' }, visibleBoards.length + trackerTiles.length)),
          showContext && h('p', { className: 'dsh-board-muted', role: 'status' }, t('trackerContext')),
          !showContext && tracker.settings?.needsReselect.some((id) => (!workspaceId || workspaceId === id) && workspaces.items.some((item) => item.workspaceId === id)) && h('p', { className: 'dsh-board-alert', role: 'status' }, t('trackerReselect')),
          !showContext && !tracker.settings && h('p', { className: 'dsh-board-muted', role: 'status' }, t(tracker.busy ? 'loading' : 'trackerError')),
          visibleBoards.length + trackerTiles.length > 0 ? h('div', { className: 'dsh-board-tiles' }, visibleBoards.map((board) => {
            const owner = workspaces.items.find((item) => item.workspaceId === board.workspaceId);
            return h('button', { className: 'dsh-board-tile', key: JSON.stringify([board.workspaceId, board.id]), type: 'button', disabled: busy || uncertain, onClick: () => openBoard(board), 'aria-label': board.name + ' — ' + (owner?.title || board.workspaceId) },
              h('span', { className: 'dsh-board-tile-icon' }, h(Icon, { name: 'columns' })),
              h('span', { className: 'dsh-board-tile-content' }, h('strong', null, board.name), h('span', null, owner?.title || board.workspaceId), h('small', null, t('trackerLocal'), ' · ', t('taskCount'), ': ', board.tasks.length)), h('span', { className: 'dsh-board-tile-arrow', 'aria-hidden': true }, '↗'));
          }), trackerTiles.map((board) => {
            const owner = workspaces.items.find((item) => item.workspaceId === board.workspaceId);
            return h('button', { className: 'dsh-board-tile', key: JSON.stringify(['tracker', board.workspaceId, board.id]), type: 'button', disabled: busy || uncertain || tracker.busy, onClick: () => openTrackerBoard(board), 'aria-label': board.name + ' — ' + (owner?.title || board.workspaceId) + ' — ' + t('tracker') },
              h('span', { className: 'dsh-board-tile-icon' }, h(Icon, { name: 'columns' })), h('span', { className: 'dsh-board-tile-content' }, h('strong', null, board.name), h('span', null, owner?.title || board.workspaceId), h('small', null, t('tracker'), ' · ', t('trackerReadOnly'), ' · ', t('trackerPartialBadge'))), h('span', { className: 'dsh-board-tile-arrow', 'aria-hidden': true }, '↗'));
          })) : (showContext || (tracker.settings && !tracker.settings.needsReselect.some((id) => (!workspaceId || workspaceId === id) && workspaces.items.some((item) => item.workspaceId === id)))) && h('div', { className: 'dsh-board-welcome' }, h('div', { className: 'dsh-board-welcome-icon' }, h(Icon, { name: 'columns', size: 22 })), h('h2', null, t('noBoardsAnywhere')), h('p', null, showContext ? t('sessionHelp') : t('noBoardsHelp')))),
        h('div', { className: 'dsh-board-content' },
          trackerView(),
          selected && h(React.Fragment, null,
            h('div', { className: 'dsh-board-section-head' },
              h('div', null, h('button', { className: 'dsh-board-back', type: 'button', disabled: busy || uncertain, onClick: showBoards }, '← ', t('returnToBoards')), h('div', { className: 'dsh-board-section-title' }, h('h2', null, selected.name)), h('div', { className: 'dsh-board-summary' }, h('span', null, t('taskCount'), ': ', selected.tasks.length), h('span', { className: 'dsh-board-summary-dot', 'aria-hidden': true }), h('span', null, t('statusCount'), ': ', statuses.length))),
              h('div', { className: 'dsh-board-actions' },
                h('button', { type: 'button', disabled: busy || uncertain, onClick: () => setForm({ kind: 'status', name: '' }) }, h(Icon, { name: 'plus' }), t('addStatus')),
                h('button', { className: 'dsh-board-primary', type: 'button', disabled: busy || uncertain || !statuses.length, onClick: () => setForm({ kind: 'task', title: '', description: '', statusId: statuses[0].id, assignee: '', assigneeEdited: false }) }, h(Icon, { name: 'plus' }), t('addTask')))),
            showContext && contextSessionId && (!workspace || !workspace.sessionIds.includes(contextSessionId)) && h('p', { className: 'dsh-board-alert', role: 'status' }, t('linkUnavailable')),
            h('div', { className: 'dsh-board-toolbar' },
              h('div', { className: 'dsh-board-switch', role: 'group', 'aria-label': t('view') },
                h('button', { type: 'button', 'aria-pressed': mode === 'board', onClick: () => setMode('board') }, t('boardView')),
                h('button', { type: 'button', 'aria-pressed': mode === 'list', onClick: () => setMode('list') }, t('listView'))),
              h('div', { className: 'dsh-board-toolbar-spacer' }),
              h('label', { className: 'dsh-board-search' }, h(Icon, { name: 'search' }), h('input', { type: 'search', 'aria-label': t('search'), placeholder: t('search'), value: query, onChange: (event) => setQuery(event.target.value) })),
              h('label', { className: 'dsh-board-filter' }, h(Icon, { name: 'filter' }), h('select', { 'aria-label': t('status'), value: statusFilter, onChange: (event) => setStatusFilter(event.target.value) }, h('option', { value: '' }, t('allStatuses')), statuses.map((status) => h('option', { key: status.id, value: status.id }, status.name)))),
              h('label', { className: 'dsh-board-filter' }, h('select', { 'aria-label': t('assignee'), value: assigneeFilter, onChange: (event) => updateMemory({ assigneeFilter: event.target.value }) }, h('option', { value: allAssigneesValue }, t('allAssignees')), h('option', { value: unassignedValue }, t('unassigned')), h('option', { value: unknownValue }, t('assigneeUnknown')), !specialAssigneeFilter && !localAssignees.some((name) => filterValue('assignee', name) === assigneeFilter) && h('option', { value: assigneeFilter }, t('assigneeUnavailable')), localAssignees.map((name) => h('option', { key: name, value: filterValue('assignee', name) }, name === name.trim() && !/\s{2,}/u.test(name) ? name : JSON.stringify(name))))),
              h('label', { className: 'dsh-board-filter' }, h('select', { 'aria-label': t('sessionFilter'), value: sessionFilter, disabled: !sessionMembershipReady, onChange: (event) => updateMemory({ sessionFilter: event.target.value }) }, h('option', { value: 'all' }, t('allSessions')), h('option', { value: 'linked' }, t('withSession')), h('option', { value: 'unlinked' }, t('withoutSession'))))),
            !sessionMembershipReady && h('p', { className: 'dsh-board-muted', role: 'status' }, t('sessionFilterUnavailable')),
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
      inject: ['slots', 'locale', 'workspaces', 'sessions', 'uiWorkspace', 'layout', 'commandUi', 'connection', 'inputTriggers'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, ru, zh: en }), 'dsh-board: locale');
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.inputTriggers.registerSource({
          trigger: '/', name: 'board-args-guard',
          candidates: async () => [], onPick: () => undefined,
          async matchEnter(_session, line) {
            if (/^\/board\s/u.test(line)) throw new Error(t('boardArgsUnsupported'));
          },
        }), 'dsh-board: reject unsupported /board arguments');
        const transport = makeTransport();
        const connectionSource = ctx.connection.generation;
        ctx.effect(() => {
          let id = connectionSource.getSnapshot()?.id;
          const dispose = connectionSource.subscribe(() => {
            const next = connectionSource.getSnapshot()?.id;
            if (next !== id) { id = next; invalidateTracker(); }
          });
          const next = connectionSource.getSnapshot()?.id;
          if (next !== id) { id = next; invalidateTracker(); }
          return () => { dispose(); invalidateTracker(false); };
        }, 'dsh-board: tracker connection');
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
          inject: () => ({ transport, sessionContext, connectionSource, panelSource: ctx.layout.panelInfo, workspacesSource: ctx.workspaces.list, sessionsSource: ctx.sessions.list, openSession: (id) => ctx.uiWorkspace.openSession(id) }),
        }, Page));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 15, locale: NS, label: () => t('panel') }, BoardIcon));
        ctx.effect(() => ctx.commandUi.register({
          name: 'board',
          label: () => t('sessionAction'),
          available: (session) => typeof session?.sessionId === 'string' && session.sessionId.length > 0,
          ui: { kind: 'action', run: (session) => {
            if (typeof session?.sessionId === 'string' && session.sessionId.length > 0) openBoardForSession(session.sessionId);
          } },
        }), 'dsh-board: /board contribution');
      },
    };
  },
});
