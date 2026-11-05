window.__ModuleLoader__.load({
  id: 'dsh-board',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;
    const PANEL = 'dsh-board';
    const NS = 'dshBoard';
    const en = {
      issueMissingId: 'Issue details are unavailable because its immutable ID is missing.', issueDetails: 'Issue details', issueSaveFields: 'Save fields', issueChangeStatus: 'Change status', issueAddComment: 'Add comment', issueComments: 'Comments & activity', issueCommentsLoaded: 'Loaded comments:', issueCommentsComplete: 'Traversal complete; comments may have changed during loading.', issueCommentsPartial: 'More comments may be available.', issueCommentsTerminalPartial: 'Traversal stopped without a continuation cursor; more comments may exist.', issueCommentsLoading: 'Loading comments…', issueCommentsError: 'Comments could not be loaded. Previously loaded comments are retained.', issueCommentsInvalid: 'Comment pagination was invalid; reload the issue to start again.', issueCommentsLimit: 'Loading stopped at the comment or size limit.', issueCommentsMore: 'Load more', issueNewComment: 'New comment', issueAssigneeId: 'Assignee ID (empty to unassign)', issueTransitions: 'Available transitions', issueNoTransition: 'Choose a transition', issueTransitionsUnavailable: 'No status transitions are available or permitted.', issueConfirmTransition: 'Apply this status transition? The status check is best-effort; the remote API has no atomic precondition.', issueSessionsPending: 'Tracker session linking is not available yet.', issueUnknown: 'The operation outcome is unknown. Do not retry until you independently check Tracker; it may still commit.', issueConflict: 'The issue changed or this transition is no longer available. Reload and review your draft.', issueRejected: 'The operation was rejected. Review the values.', issueSaved: 'Operation saved.', issueReload: 'Reload issue', issueDiscardConflict: 'Discard field draft and reload', issueReview: 'I checked Tracker and accept the uncertainty', issueUnavailable: 'Issue details are hidden until access is revalidated.', issueInvalid: 'Enter valid, nonempty values within the limits.', issueVersionUnavailable: 'Editing fields is unavailable because the issue version is unknown.', issueSessionPartial: 'Session links are incomplete; unavailable links may be omitted.', issueLinkSave: 'Save session link', issueChooseSession: 'Choose a workspace session', issueLinkAction: 'Link session', issueUnlinkAction: 'Unlink session', issueLinkUnavailable: 'Session links could not be loaded.',
      issueSeparateOperations: 'Fields, status, comments and session links are saved separately; changes are not atomic.', issueKeepDraft: 'Cancel editing (draft retained)',
      sessionSendChoose: 'Choose linked sessions for this text', sessionSendAction: 'Send to selected sessions', sessionSendConfirm: 'Queue this text as a user message in the selected sessions? This can start or resume their agents and does not add a Tracker comment.', sessionSendAccepted: 'Accepted into queue', sessionSendNotSent: 'Not sent', sessionSendUnknown: 'Outcome unknown — inspect this session before retrying.', sessionSendInflight: 'Sending or awaiting result', sessionSendReview: 'I inspected this session; allow retry', sessionSendReviewConfirm: 'Did you inspect this session and accept that the previous message may still arrive? Allowing a retry can create a duplicate.', sessionSendWarning: 'Sending queues agent work and can start or resume agents; acceptance does not mean completion. Sending is a separate action and does not add a Tracker comment. Delivery history is only kept in this page’s memory: reloads and other tabs cannot prevent duplicates.', sessionSendSaved: 'Tracker comment saved. The text remains here; press Send to selected sessions separately.', sessionSendUnavailable: 'Session message sending is unavailable.',
      issueAddSession: 'Add session', issueCancelAddSession: 'Cancel adding a session', issueUnlinkSession: 'Unlink session', issueConfirmUnlinkSession: 'Unlink this session from the issue?',
      issueEditComment: 'Edit comment', issueSaveCommentEdit: 'Save comment edit', issueEditCommentText: 'Comment text', issueDiscardCommentConflict: 'Discard edited comment and reload', issueCommentVersionUnavailable: 'Editing is unavailable because the comment version is unknown.', issueCommentRaceWarning: 'The version check before the remote request is best-effort, not atomic. This edit can overwrite a concurrent change.', issueEditedCommentMissing: 'The comment being edited is not in this partial result; the draft is retained.',
      sessionCardOpen: 'Open linked tasks', sessionCardTitle: 'Linked tasks', sessionCardBoard: 'Open full board to edit', sessionCardReadOnly: 'This view is read-only. Open the full board to edit. Access changes may not appear immediately.', sessionCardLocalHistory: 'Local links are historical and do not record workspace incarnation; verify them on the full board.', sessionCardNoLocal: 'No linked local tasks found.', trackerLocal: 'Local tasks', sessionCardPartial: 'Linked issues are a partial result; other links may exist.', sessionCardScanError: 'Some boards could not be checked.', sessionCardNoLinks: 'No linked issues found.', sessionCardNoLinksPartial: 'No linked issues found in this partial result.', sessionCardCurrentSession: 'Open current session', trackerNoBoardsSelected: 'No Tracker boards are selected.', sessionCardChoose: 'Choose a linked issue', sessionCardSelect: 'Select an issue',
      trackerReviewDraft: 'I reviewed the refreshed board list and my selection.', trackerUpdatedAt: 'Last successful partial update:',
      panel: 'Board', workspace: 'Workspace', chooseWorkspace: 'Choose a workspace', board: 'Board',
      chooseBoard: 'Choose a board', noWorkspaces: 'No workspaces are available.', workspaceError: 'Workspaces could not be loaded.',
      noBoards: 'There are no boards in this workspace yet.', newBoard: 'New board', boardName: 'Board name',
      create: 'Create', cancel: 'Cancel', save: 'Save', edit: 'Edit', loading: 'Loading…', retry: 'Retry',
      loadError: 'Could not load the board. Check the connection and try again.',
      conflict: 'The board changed elsewhere. Reload it and review your changes.',
      unknown: 'The save result is unknown. Reload and check the board before trying again.',
      trackerStatusView: 'Grouped by actual Tracker status; this is not the Tracker board-column layout.', trackerStatusPartial: 'Configured status mapping is too large or inconsistent; showing statuses from loaded issues only.',
      boardView: 'Board', listView: 'List', view: 'View', search: 'Search tasks', allStatuses: 'All statuses',
      status: 'Status', addStatus: 'Add status', editStatus: 'Edit status', statusName: 'Status name',
      addTask: 'Add task', editTask: 'Edit task', title: 'Title', description: 'Description',
      noStatuses: 'Create a status before adding tasks.', noTasks: 'No tasks yet.', noResults: 'No tasks match the filters.',
      sessions: 'Linked sessions', noSessions: 'No sessions are available in this workspace.',
      sessionUnavailable: 'Unavailable or not in the session catalog', sessionArchived: 'Archived — restore it in the workspace first',
      sessionLoading: 'Session availability is loading', openSession: 'Open session', close: 'Close', sessionMenu: 'Linked sessions for task', columnSessions: 'Distinct linked sessions in this column (excluding the session filter)', scrollBoard: 'Task board, scroll horizontally', scrollBoardTop: 'Scroll task board horizontally', resizeDrawer: 'Resize task drawer', manageStatuses: 'Manage statuses', clearSessionFilter: 'Clear session filter',
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
      tracker: 'Yandex Tracker', trackerConnect: 'Connect Yandex Tracker', trackerSettings: 'Tracker settings', trackerOrg: 'Organization type', trackerConfigured: 'Configured in this profile', trackerNotConfigured: 'Not configured in this profile', trackerRefs: 'Credentials and organization ID must already be stored on the server. They are never entered here.', trackerConfigureWarning: 'Reconnecting clears all workspace board selections. Continue?', trackerChoose: 'Choose Tracker boards', trackerList: 'Load available boards', trackerSelect: 'Save board selection', trackerReselect: 'Selection needs confirmation after restart or account change. Load boards and select them again.', trackerNoSelection: 'No Tracker boards selected for this workspace.', trackerListPartial: 'Board list is partial; not all available boards may appear.', trackerPartial: 'Partial results as of the last request: board membership is approximate and the list may be incomplete, even when empty. Access changes are not shown instantly.', trackerReadOnly: 'read only', trackerPartialBadge: 'partial', trackerUnmapped: 'Unmapped', trackerEmpty: 'No issues returned in this partial result.', trackerError: 'Tracker is unavailable or the request failed. Try again.', trackerReload: 'Reload settings', trackerPickerHint: 'Select boards explicitly for this workspace. The list expires; reload it if saving fails.', trackerContext: 'Open a Tracker issue to link this workspace’s sessions.', trackerRefreshBoard: 'Refresh Tracker board', trackerSelectionSaved: 'Selection saved.', trackerUncertain: 'The result is unknown. Reload settings and review before trying again.', trackerMissingSelection: 'Some saved boards are absent from this list. They will be removed if you save.', trackerConfirmSelection: 'Confirm this workspace board selection? Removed board IDs: ', trackerNoBoards: 'No boards returned.', trackerStatus: 'Status', trackerClose: 'Close Tracker settings', trackerListRequired: 'The board list expired or changed. Load it again and reselect.', trackerConflict: 'Tracker settings changed. Reload settings and review your selection.', trackerNotSelected: 'This board is no longer selected. Reload settings.', trackerCredentials: 'Server credentials are unavailable or rejected. Check the server configuration.', trackerRate: 'Tracker is busy or rate-limited. Try again later.', trackerConfiguring: 'Save connection', trackerLocal: 'Local', trackerSettingsUnknown: 'Tracker is not loaded. Open its settings to check available boards.', trackerBindingsPending: 'Some workspace selections need confirmation. Open Tracker settings and choose a workspace to reselect.',
    };
    const ru = {
      issueMissingId: 'Карточка недоступна: отсутствует неизменяемый ID задачи.', issueDetails: 'Карточка задачи', issueSaveFields: 'Сохранить поля', issueChangeStatus: 'Изменить статус', issueAddComment: 'Добавить комментарий', issueComments: 'Комментарии и активность', issueCommentsLoaded: 'Загружено комментариев:', issueCommentsComplete: 'Обход завершён; за время загрузки комментарии могли измениться.', issueCommentsPartial: 'Могут быть доступны другие комментарии.', issueCommentsTerminalPartial: 'Обход остановлен без курсора продолжения; могут существовать другие комментарии.', issueCommentsLoading: 'Загрузка комментариев…', issueCommentsError: 'Не удалось загрузить комментарии. Ранее загруженные комментарии сохранены.', issueCommentsInvalid: 'Некорректная пагинация комментариев; обновите задачу, чтобы начать заново.', issueCommentsLimit: 'Достигнут предел количества или размера комментариев.', issueCommentsMore: 'Загрузить ещё', issueNewComment: 'Новый комментарий', issueAssigneeId: 'ID исполнителя (пусто — снять назначение)', issueTransitions: 'Доступные переходы', issueNoTransition: 'Выберите переход', issueTransitionsUnavailable: 'Нет доступных или разрешённых переходов статуса.', issueConfirmTransition: 'Выполнить этот переход статуса? Проверка выполняется по возможности: удалённый API не поддерживает атомарное предусловие.', issueSessionsPending: 'Связывание сессий с задачами Трекера пока недоступно.', issueUnknown: 'Результат операции неизвестен. Не повторяйте её до самостоятельной проверки в Трекере: она ещё может выполниться.', issueConflict: 'Задача изменилась или переход больше недоступен. Обновите данные и проверьте черновик.', issueRejected: 'Операция отклонена. Проверьте значения.', issueSaved: 'Операция сохранена.', issueReload: 'Обновить задачу', issueDiscardConflict: 'Отменить черновик полей и обновить', issueReview: 'Я проверил Трекер и принимаю неопределённость', issueUnavailable: 'Данные задачи скрыты до повторной проверки доступа.', issueInvalid: 'Введите допустимые непустые значения в пределах ограничений.', issueVersionUnavailable: 'Изменение полей недоступно: версия задачи неизвестна.', issueSessionPartial: 'Список связей неполный; недоступные связи могут отсутствовать.', issueLinkSave: 'Сохранить связь с сессией', issueChooseSession: 'Выберите сессию рабочего пространства', issueLinkAction: 'Связать сессию', issueUnlinkAction: 'Отвязать сессию', issueLinkUnavailable: 'Не удалось загрузить связи сессий.',
      issueSeparateOperations: 'Поля, статус, комментарии и связи с сессиями сохраняются отдельно; изменения не атомарны.', issueKeepDraft: 'Закрыть редактирование (черновик сохранён)',
      sessionSendChoose: 'Выберите связанные сессии для этого текста', sessionSendAction: 'Отправить в выбранные сессии', sessionSendConfirm: 'Поставить этот текст в очередь как сообщение пользователя в выбранных сессиях? Это может запустить или продолжить работу их агентов и не добавляет комментарий в Трекер.', sessionSendAccepted: 'Принято в очередь', sessionSendNotSent: 'Не отправлено', sessionSendUnknown: 'Результат неизвестен — проверьте эту сессию перед повторной отправкой.', sessionSendInflight: 'Отправляется или ожидается результат', sessionSendReview: 'Я проверил эту сессию; разрешить повтор', sessionSendReviewConfirm: 'Вы проверили эту сессию и принимаете, что предыдущее сообщение ещё может поступить? Повтор может создать дубликат.', sessionSendWarning: 'Отправка ставит работу агента в очередь и может запустить или продолжить его работу; принятие в очередь не означает выполнения. Это отдельное действие, оно не добавляет комментарий в Трекер. История отправки хранится только в памяти этой страницы: после обновления и в других вкладках защита от дублей не действует.', sessionSendSaved: 'Комментарий в Трекере сохранён. Текст оставлен здесь; отдельно нажмите «Отправить в выбранные сессии».', sessionSendUnavailable: 'Отправка сообщений в сессии недоступна.',
      issueAddSession: 'Добавить сессию', issueCancelAddSession: 'Отмена добавления сессии', issueUnlinkSession: 'Отвязать сессию', issueConfirmUnlinkSession: 'Отвязать эту сессию от задачи?',
      issueEditComment: 'Изменить комментарий', issueSaveCommentEdit: 'Сохранить изменение комментария', issueEditCommentText: 'Текст комментария', issueDiscardCommentConflict: 'Отменить изменение комментария и обновить', issueCommentVersionUnavailable: 'Редактирование недоступно: версия комментария неизвестна.', issueCommentRaceWarning: 'Проверка версии перед удалённым запросом выполняется по возможности и не атомарна. Изменение может перезаписать параллельную правку.', issueEditedCommentMissing: 'Редактируемый комментарий отсутствует в частичном списке; черновик сохранён.',
      sessionCardOpen: 'Открыть связанные задачи', sessionCardTitle: 'Связанные задачи', sessionCardBoard: 'Открыть доску для редактирования', sessionCardReadOnly: 'Просмотр без редактирования. Для изменений откройте доску. Изменения доступа могут появляться не сразу.', sessionCardLocalHistory: 'Локальные связи не хранят версию рабочего пространства; проверьте их на доске.', sessionCardNoLocal: 'Связанные локальные задачи не найдены.', trackerLocal: 'Локальные задачи', sessionCardPartial: 'Список связанных задач может быть неполным.', sessionCardScanError: 'Некоторые доски не удалось проверить.', sessionCardNoLinks: 'Связанные задачи не найдены.', sessionCardNoLinksPartial: 'В частичном списке связанные задачи не найдены.', sessionCardCurrentSession: 'Открыть текущую сессию', trackerNoBoardsSelected: 'Доски Трекера не выбраны.', sessionCardChoose: 'Выберите связанную задачу', sessionCardSelect: 'Выберите задачу',
      trackerReviewDraft: 'Я проверил обновлённый список досок и свой выбор.', trackerUpdatedAt: 'Последнее успешное частичное обновление:',
      panel: 'Доска', workspace: 'Рабочее пространство', chooseWorkspace: 'Выберите рабочее пространство', board: 'Доска',
      chooseBoard: 'Выберите доску', noWorkspaces: 'Нет доступных рабочих пространств.', workspaceError: 'Не удалось загрузить рабочие пространства.',
      noBoards: 'В этом рабочем пространстве пока нет досок.', newBoard: 'Новая доска', boardName: 'Название доски',
      create: 'Создать', cancel: 'Отмена', save: 'Сохранить', edit: 'Изменить', loading: 'Загрузка…', retry: 'Повторить',
      loadError: 'Не удалось загрузить доску. Проверьте соединение и повторите попытку.',
      conflict: 'Доска изменилась в другом месте. Обновите её и проверьте изменения.',
      unknown: 'Результат сохранения неизвестен. Обновите доску и проверьте её перед повтором.',
      trackerStatusView: 'Задачи сгруппированы по фактическому статусу Tracker; расположение столбцов может отличаться от доски Tracker.', trackerStatusPartial: 'Настройка статусов слишком велика или противоречива; показаны только статусы загруженных задач.',
      boardView: 'Доска', listView: 'Список', view: 'Вид', search: 'Поиск задач', allStatuses: 'Все статусы',
      status: 'Статус', addStatus: 'Добавить статус', editStatus: 'Изменить статус', statusName: 'Название статуса',
      addTask: 'Добавить задачу', editTask: 'Изменить задачу', title: 'Название', description: 'Описание',
      noStatuses: 'Создайте статус, прежде чем добавлять задачи.', noTasks: 'Задач пока нет.', noResults: 'Нет задач по выбранным условиям.',
      sessions: 'Связанные сессии', noSessions: 'В этом рабочем пространстве нет доступных сессий.',
      sessionUnavailable: 'Недоступна или отсутствует в списке сессий', sessionArchived: 'В архиве — сначала восстановите в рабочем пространстве',
      sessionLoading: 'Загружается доступность сессии', openSession: 'Открыть сессию', close: 'Закрыть', sessionMenu: 'Связанные сессии задачи', columnSessions: 'Разные связанные сессии задач столбца (без фильтра сессий)', scrollBoard: 'Доска задач, горизонтальная прокрутка', scrollBoardTop: 'Горизонтальная прокрутка доски задач', resizeDrawer: 'Изменить ширину карточки задачи', manageStatuses: 'Управление статусами', clearSessionFilter: 'Сбросить фильтр сессий',
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
      tracker: 'Яндекс Трекер', trackerConnect: 'Подключить Яндекс Трекер', trackerSettings: 'Настройки Трекера', trackerOrg: 'Тип организации', trackerConfigured: 'Настроен в этом профиле', trackerNotConfigured: 'Не настроен в этом профиле', trackerRefs: 'Данные доступа и идентификатор организации должны быть заранее сохранены на сервере. Здесь они не вводятся.', trackerConfigureWarning: 'Повторное подключение удалит выбор досок всех пространств. Продолжить?', trackerChoose: 'Выбрать доски Трекера', trackerList: 'Загрузить доступные доски', trackerSelect: 'Сохранить выбор досок', trackerReselect: 'После перезапуска или смены аккаунта выбор нужно подтвердить заново. Загрузите доски и выберите их снова.', trackerNoSelection: 'Для этого пространства доски Трекера не выбраны.', trackerListPartial: 'Список досок неполный: доступны могут быть и другие.', trackerPartial: 'Данные на момент последнего запроса частичные: принадлежность к доске определена приблизительно, список может быть неполным, даже если он пуст. Изменения доступа отображаются не мгновенно.', trackerReadOnly: 'только чтение', trackerPartialBadge: 'частично', trackerUnmapped: 'Без соответствия', trackerEmpty: 'В этом частичном результате задачи не найдены.', trackerError: 'Трекер недоступен или запрос не выполнен. Повторите попытку.', trackerReload: 'Обновить настройки', trackerPickerHint: 'Выберите доски для этого пространства явно. Список действует недолго; при ошибке загрузите его снова.', trackerContext: 'Откройте задачу Трекера, чтобы связать сессии этого рабочего пространства.', trackerRefreshBoard: 'Обновить доску Трекера', trackerSelectionSaved: 'Выбор сохранён.', trackerUncertain: 'Результат неизвестен. Обновите настройки и проверьте их перед повтором.', trackerMissingSelection: 'Некоторых сохранённых досок нет в списке. При сохранении они будут удалены.', trackerConfirmSelection: 'Подтвердить выбор досок для пространства? Удаляемые ID досок: ', trackerNoBoards: 'Доски не найдены.', trackerStatus: 'Статус', trackerClose: 'Закрыть настройки Трекера', trackerListRequired: 'Список досок устарел или изменился. Загрузите его и выберите доски снова.', trackerConflict: 'Настройки Трекера изменились. Обновите их и проверьте выбор.', trackerNotSelected: 'Эта доска больше не выбрана. Обновите настройки.', trackerCredentials: 'Данные доступа на сервере недоступны или отклонены. Проверьте настройки сервера.', trackerRate: 'Трекер занят или ограничил частоту запросов. Повторите позже.', trackerConfiguring: 'Сохранить подключение', trackerLocal: 'Локальная',
    };

    // Keep the transport in one seam. The server remains authoritative for access and writes.
    function makeTransport() {
      async function request(options, tracker = false) {
        const base = tracker ? 'api/dsh-board.tracker' : 'api/dsh-board';
        const path = options.method === 'POST' ? base + '.mutate' : base;
        const response = await fetch(path, { credentials: 'same-origin', ...options });
        let result;
        try { result = await response.json(); } catch { const error = new Error('invalid response'); error.status = response.status; throw error; }
        if (!response.ok || result?.ok === false) {
          const error = new Error('remote');
          error.code = result?.error?.code || result?.code || (response.status === 409 ? 'conflict' : 'remote');
          error.status = response.status;
          throw error;
        }
        return result?.ok === true && Object.hasOwn(result, 'value') ? result.value : result;
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
      return { open, settings: null, busy: false, mutating: false, error: '', notice: '', orgType: 'cloud', listing: null, listingStarted: 0, pickerWorkspace: '', picked: [], draftWorkspace: '', draftPicked: [], reviewRequired: false, board: null, boardLinks: null, boardUpdatedAt: null, incarnations: {}, generation };
    }
    const memory = {
      snapshot: null, workspaceId: '', boardId: '', showContext: false, contextSessionId: '',
      mode: 'board', query: '', statusFilter: '', assigneeFilter: '["all"]', sessionFilter: 'all', form: null, dirty: false,
      pending: false, loading: false, uncertain: false, uncertainRevision: null, readback: false, error: '', generation: 0, overview: true,
      contextHandled: null, provider: 'local', tracker: emptyTracker(0), issue: null, drawerWidth: 580, listeners: new Set(),
    };
    function updateMemory(patch) {
      Object.assign(memory, patch);
      memory.listeners.forEach((listener) => listener());
    }
    let privacyEpoch = 0, trackerMutationPending = false, issueMutationPending = false, boardLinksGeneration = 0;
    // The currently visible loading indicator belongs to one foreground GET only.
    let localLoadOwner = null;
    function invalidateLocalLoad() {
      ++memory.generation;
      localLoadOwner = null;
      if (memory.loading) updateMemory({ loading: false });
    }
    const unknownIssues = new Set();
    // Exact message text stays only in this page's memory. This is not cross-tab
    // or reload durable; accepted and uncertain receipts fence duplicate sends.
    const sessionSendLedger = new Map();
    const issueUnknownKey = (issue) => JSON.stringify([issue.workspaceId, issue.incarnation, issue.key, issue.issueId]);
    const sessionSendKey = (issue, id, text) => JSON.stringify([issue.workspaceId, issue.incarnation, issue.key, issue.issueId, id, text]);
    // A reselect may bind the same workspace and issue IDs to a different Tracker principal.
    // Drop all issue content, but retain the global uncertainty guard for in-flight writes.
    function discardTrackerIssue(workspaceId) {
      const issue = memory.issue;
      if (!issue || (workspaceId && issue.workspaceId !== workspaceId)) return;
      if ((issue.pending && !issue.preflight && !issue.sendOwner) || issue.unknown) unknownIssues.add(issueUnknownKey(issue));
      updateMemory({ issue: null });
    }
    function discardReselectedIssue(settings) {
      if (memory.issue && (settings.needsReselect.includes(memory.issue.workspaceId) || settings.revision !== memory.issue.settingsRevision)) discardTrackerIssue(memory.issue.workspaceId);
    }
    function invalidateTracker(preserveOpen = true, preserveDraft = false) {
      privacyEpoch++;
      const current = memory.tracker;
      const draftWorkspace = current.pickerWorkspace || current.draftWorkspace;
      const draftPicked = current.pickerWorkspace ? [...current.picked] : current.draftPicked;
      const next = emptyTracker(current.generation + 1, preserveOpen && current.open);
      if (memory.issue) { const writing = memory.issue.pending && !memory.issue.preflight && !memory.issue.sendOwner; if (writing) unknownIssues.add(issueUnknownKey(memory.issue)); memory.issue = { ...memory.issue, available: false, loading: false, unknown: memory.issue.unknown || writing, error: writing ? 'issueUnknown' : memory.issue.error, generation: memory.issue.generation + 1 }; }
      if (trackerMutationPending) Object.assign(next, { busy: true, mutating: true, error: 'trackerUncertain' });
      if (preserveDraft && draftWorkspace) Object.assign(next, { draftWorkspace, draftPicked, draftIncarnation: current.draftIncarnation || current.incarnations[draftWorkspace], reviewRequired: true });
      updateMemory({ tracker: next });
    }
    // Register only while needed: browsers may otherwise disable back/forward cache.
    let unloadArmed = false;
    function beforeUnload(event) { event.preventDefault(); event.returnValue = ''; }
    memory.listeners.add(() => {
      const needed = memory.dirty || memory.pending || memory.uncertain || Boolean(memory.issue && (memory.issue.dirty || memory.issue.pending || memory.issue.unknown)) || [...sessionSendLedger.values()].some(status => status === 'inflight' || status === 'unknown');
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
      if (value.columns.some((c) => !c || typeof c.id !== 'string' || typeof c.name !== 'string' || !Array.isArray(c.statuses) || c.statuses.some((s) => !s || typeof s.id !== 'string' || typeof s.key !== 'string' || typeof s.display !== 'string')) || new Set(value.columns.map((c) => c.id)).size !== value.columns.length || value.issues.some((i) => !i || typeof i.key !== 'string' || typeof i.summary !== 'string' || !i.status || typeof i.status.id !== 'string' || typeof i.status.key !== 'string' || typeof i.status.display !== 'string') || new Set(value.issues.map((i) => i.key)).size !== value.issues.length) throw new Error('invalid response');
      return { board: { id, name: value.board.name }, columns: value.columns.map((c) => ({ id: c.id, name: c.name, statuses: c.statuses.map((s) => ({ id: s.id, key: s.key, display: s.display })) })), issues: value.issues.map((i) => {
        const validAssignee = i.assignee && typeof i.assignee === 'object' && typeof i.assignee.id === 'string' && i.assignee.id.length > 0 && typeof i.assignee.display === 'string' && i.assignee.display.length > 0;
        const known = i.assigneeKnown === true && (i.assignee === null || validAssignee);
        return { key: i.key, ...(typeof i.id === 'string' && i.id ? { id: i.id } : {}), summary: i.summary, status: { id: i.status.id, key: i.status.key, display: i.status.display }, assigneeKnown: known, assignee: known && validAssignee ? { id: i.assignee.id, display: i.assignee.display } : null };
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
    // This fragment is a one-shot, same-origin handoff, not an application route.
    const sessionFragment = '#dsh-board-session-v1:';
    const validHandoffId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 256 && !/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(id);
    function newTabSession(workspaceId, sessionId) {
      if (!validHandoffId(workspaceId) || !validHandoffId(sessionId)) return;
      try {
        const url = new URL(document.baseURI);
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin || url.username || url.password) return;
        url.search = ''; url.hash = sessionFragment + encodeURIComponent(workspaceId) + ':' + encodeURIComponent(sessionId);
        window.open(url.href, '_blank', 'noopener,noreferrer');
      } catch { /* Invalid base URLs and blocked windows fail closed. */ }
    }
    function modifiedSessionClick(event) { return Boolean(event && (event.button === 1 || event.ctrlKey || event.metaKey)); }
    function consumeSessionFragment(ctx) {
      const hash = window.location?.hash;
      if (typeof hash !== 'string' || !hash.startsWith(sessionFragment)) return;
      // Remove even malformed handoffs before parsing or waiting. Never preserve a launch query.
      try { window.history.replaceState(window.history.state, '', window.location.pathname); } catch { return; }
      let workspaceId, sessionId;
      try {
        const parts = hash.slice(sessionFragment.length).split(':');
        if (parts.length !== 2) return;
        [workspaceId, sessionId] = parts.map(decodeURIComponent);
        if (!validHandoffId(workspaceId) || !validHandoffId(sessionId) || hash !== sessionFragment + encodeURIComponent(workspaceId) + ':' + encodeURIComponent(sessionId)) return;
      } catch { return; }
      let stopped = false, scheduled = false, generationId, navigation;
      const cleanup = [];
      const stop = () => { if (stopped) return; stopped = true; cleanup.splice(0).forEach(fn => fn()); };
      const listen = (target, name, handler, options) => { target.addEventListener(name, handler, options); cleanup.push(() => target.removeEventListener(name, handler, options)); };
      const originalUrl = window.location.href;
      const initialPanel = ctx.layout.panelInfo.getSnapshot().activePanelId;
      // Capture genuine interaction before readiness, including same-panel and same-session selections.
      const interaction = event => { if (event.isTrusted) stop(); };
      for (const name of ['pointerdown', 'keydown']) listen(window, name, interaction, true);
      for (const name of ['hashchange', 'popstate', 'pagehide']) listen(window, name, stop);
      const timer = window.setTimeout(stop, 30000); cleanup.push(() => window.clearTimeout(timer));
      const check = () => {
        if (stopped) return;
        if (window.location.href !== originalUrl || ctx.layout.panelInfo.getSnapshot().activePanelId !== initialPanel) return stop();
        const generation = ctx.connection.generation.getSnapshot();
        if (generationId !== undefined && generation?.id !== generationId) return stop();
        if (!generation || generation.id === undefined) return;
        generationId = generation.id;
        const ws = ctx.workspaces.list.getSnapshot(), sessions = ctx.sessions.list.getSnapshot();
        if (ws.state === 'error') return stop();
        if (ws.phase !== 'ready' || sessions.phase !== 'ready') return;
        const owner = ws.items?.find(item => item.workspaceId === workspaceId);
        if (!Array.isArray(owner?.sessionIds) || !owner.sessionIds.includes(sessionId) || !Array.isArray(ws.archivedSessionIds) || ws.archivedSessionIds.includes(sessionId) || !Array.isArray(sessions.ids) || !sessions.ids.includes(sessionId)) return stop();
        if (scheduled) return;
        // Reserve only once catalogs are ready; startup restoration has already had
        // its readiness callback. Later navigation, even to the same panel, cancels.
        navigation = ctx.layout.beginNavigation();
        if (navigation.aborted) return stop();
        listen(navigation, 'abort', stop);
        scheduled = true;
        // Recheck after other readiness subscribers finish before committing.
        Promise.resolve().then(() => {
          if (stopped) return;
          scheduled = false;
          const liveWs = ctx.workspaces.list.getSnapshot(), liveSessions = ctx.sessions.list.getSnapshot();
          const owner = liveWs.items?.find(item => item.workspaceId === workspaceId);
          if (window.location.href !== originalUrl || ctx.layout.panelInfo.getSnapshot().activePanelId !== initialPanel || ctx.connection.generation.getSnapshot()?.id !== generationId || liveWs.state === 'error' || liveWs.phase !== 'ready' || liveSessions.phase !== 'ready' || !owner?.sessionIds?.includes(sessionId) || !liveWs.archivedSessionIds?.includes || liveWs.archivedSessionIds.includes(sessionId) || !liveSessions.ids?.includes(sessionId)) return stop();
          stop();
          if (!navigation.aborted) ctx.uiWorkspace.openSession(sessionId);
        });
      };
      for (const source of [ctx.connection.generation, ctx.workspaces.list, ctx.sessions.list, ctx.layout.panelInfo]) cleanup.push(source.subscribe(check));
      check();
      return stop;
    }
    /* BEGIN GENERATED TRACKER HELPERS */
const { parseTrackerMarkup, safeTrackerHref, groupTrackerStatuses, createSessionCard, createSessionSender } = {
  // tracker-markup.mjs sha256:57c60106a9c2fd8380725309c06fd09b018114bff7b7b884d5f7ae4468d76ea4
  ...(() => {
// A deliberately small, pure, non-DOM parser for untrusted Tracker content.
// Consumers MUST render text as text nodes, never as HTML. See parseTrackerMarkup.
const TRACKER_MARKUP_LIMITS = Object.freeze({ input: 200_000, nodes: 8_000, depth: 24, work: 1_000_000 });

const LIMIT = Symbol('limit');
const text = value => ({ type: 'text', value });
const element = (type, children = [], extra = {}) => ({ type, ...extra, children });
const fallback = value => ({ type: 'root', children: value ? [text(value)] : [] });
const allowed = new Set(['p', 'div', 'br', 'ul', 'ol', 'li', 'b', 'strong', 'em', 'i', 'code', 'pre', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const dangerous = new Set(['script', 'style', 'iframe', 'svg', 'math', 'img', 'object', 'embed', 'video', 'audio', 'source', 'link', 'meta', 'base', 'form', 'input', 'template', 'noscript', 'canvas', 'head']);
const voidTags = new Set(['img', 'source', 'link', 'meta', 'base', 'input', 'embed', 'br']);
const entities = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' });

function decodeEntities(value) {
  // Bound each candidate to avoid rescanning a long run after repeated '&'.
  return value.replace(/&(#(?:x[0-9a-f]{1,8}|[0-9]{1,10})|[a-z][a-z0-9]{1,31});/gi, (whole, entity) => {
    if (entity[0] !== '#') return Object.hasOwn(entities, entity.toLowerCase()) ? entities[entity.toLowerCase()] : whole;
    const hex = entity[1]?.toLowerCase() === 'x';
    const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '\ufffd';
  });
}

// No relative, protocol-relative, backslash, whitespace/control, credentials or
// encoded protocol/host. URL canonicalization is only applied after strict checks.
function safeTrackerHref(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f-\u009f\\]/u.test(value) || !/^https?:\/\//i.test(value)) return null;
  const authority = /^https?:\/\/([^/?#]*)/i.exec(value)?.[1];
  if (!authority || authority.includes('%')) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function context() {
  let count = 0, work = 0;
  return {
    // Charge the entire potentially scanned region *before* invoking indexOf or
    // a regex on it. An attacker cannot force repeated unbounded lookaheads.
    scan(size) { work += size; if (work > TRACKER_MARKUP_LIMITS.work) throw LIMIT; },
    add(type, children, extra) { if (++count > TRACKER_MARKUP_LIMITS.nodes) throw LIMIT; return element(type, children, extra); },
    text(value) { if (++count > TRACKER_MARKUP_LIMITS.nodes) throw LIMIT; return text(value); },
  };
}
function pushText(out, value, ctx) {
  if (!value) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.value += value;
  else out.push(ctx.text(value));
}

// Balanced minimal inline syntax. Ambiguous or incomplete syntax stays literal.
function inline(s, ctx, depth = 0) {
  if (depth >= TRACKER_MARKUP_LIMITS.depth) throw LIMIT;
  const out = [];
  let i = 0;
  ctx.scan(s.length);
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length && /[\\`*_[\]()!]/.test(s[i + 1])) { pushText(out, s[i + 1], ctx); i += 2; continue; }
    if (s[i] === '\n') { out.push(ctx.add('br', [])); i++; continue; }
    if (s[i] === '`') {
      ctx.scan(s.length - i);
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) { out.push(ctx.add('code', [ctx.text(s.slice(i + 1, end))])); i = end + 1; continue; }
    }
    // Images are always literal: neither a link nor an image element.
    if (s.startsWith('![', i)) {
      ctx.scan(s.length - i);
      const match = /^!\[[^\]\n]*\]\([^\n)]*\)/.exec(s.slice(i));
      if (match) { pushText(out, match[0], ctx); i += match[0].length; continue; }
      pushText(out, '![', ctx); i += 2; continue;
    }
    if (s[i] === '[') {
      ctx.scan(s.length - i);
      const match = /^\[([^\]\n]+)\]\(([^\s()]+)\)/.exec(s.slice(i));
      if (match) {
        const href = safeTrackerHref(match[2]);
        if (href) out.push(ctx.add('a', inline(match[1], ctx, depth + 1), { href }));
        else pushText(out, match[0], ctx);
        i += match[0].length; continue;
      }
    }
    const marker = s.startsWith('**', i) ? '**' : s.startsWith('__', i) ? '__' : s[i] === '*' ? '*' : s[i] === '_' ? '_' : null;
    if (marker && !(marker[0] === '_' && i > 0 && /[\p{L}\p{N}_]/u.test(s[i - 1]))) {
      ctx.scan(s.length - i);
      const end = s.indexOf(marker, i + marker.length);
      if (end > i + marker.length && !/\s/.test(s[i + marker.length]) && !/\s/.test(s[end - 1]) && !(marker[0] === '_' && /[\p{L}\p{N}_]/u.test(s[end + marker.length] || ''))) {
        out.push(ctx.add(marker.length === 2 ? 'strong' : 'em', inline(s.slice(i + marker.length, end), ctx, depth + 1)));
        i = end + marker.length; continue;
      }
    }
    pushText(out, s[i], ctx); i++;
  }
  return out;
}

function markdown(source, ctx) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  ctx.scan(source.length * 4);
  const blocks = [];
  // Unsupported YFM directives delimit constructs we cannot safely interpret.
  // Keep the whole source verbatim instead of rendering their bodies as Markdown.
  if (lines.some(line => /^[ \t]*\{%/.test(line) || /^[ \t]+(?:[-+*]|\d+[.)])[ \t]+/.test(line))) return { type: 'root', children: [ctx.add('p', [ctx.text(source)])] };
  let i = 0;
  const heading = line => /^(#{1,6})[ \t]+(.+)$/.exec(line);
  const item = line => /^([-+*]|\d+[.)])[ \t]+(.+)$/.exec(line);
  const fence = line => /^ {0,3}```[ \t]*([a-zA-Z0-9_-]*)[ \t]*$/.exec(line);
  const special = line => !!(heading(line) || item(line) || fence(line));
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const f = fence(lines[i]);
    if (f) {
      let end = i + 1;
      while (end < lines.length && !/^ {0,3}```[ \t]*$/.test(lines[end])) end++;
      if (end < lines.length) {
        blocks.push(ctx.add('pre', [ctx.add('code', [ctx.text(lines.slice(i + 1, end).join('\n'))])])); i = end + 1; continue;
      }
      // Preserve unclosed fences including their subsequent lines verbatim.
      blocks.push(ctx.add('p', [ctx.text(lines.slice(i).join('\n'))])); break;
    }
    const h = heading(lines[i]);
    if (h) { blocks.push(ctx.add(`h${h[1].length}`, inline(h[2], ctx))); i++; continue; }
    const first = item(lines[i]);
    if (first) {
      const ordered = /^\d/.test(first[1]);
      const items = [];
      while (i < lines.length) {
        const m = item(lines[i]);
        if (!m || /^\d/.test(m[1]) !== ordered) break;
        items.push(ctx.add('li', inline(m[2], ctx))); i++;
      }
      blocks.push(ctx.add(ordered ? 'ol' : 'ul', items)); continue;
    }
    const para = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !special(lines[i])) para.push(lines[i++]);
    blocks.push(ctx.add('p', inline(para.join('\n'), ctx)));
  }
  return { type: 'root', children: blocks };
}

// Tokenize attributes, rejecting malformed syntax and duplicate href. Nothing but
// a validated href is emitted; event handlers, styles, src etc. are ignored.
function attributes(s, ctx) {
  let i = 0, href = null, alt = null, seenHref = false, seenAlt = false;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i === s.length) break;
    ctx.scan(s.length - i);
    const name = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*/.exec(s.slice(i));
    if (!name) return null;
    i += name[0].length;
    while (i < s.length && /\s/.test(s[i])) i++;
    let value = '';
    if (s[i] === '=') {
      i++; while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] === '"' || s[i] === "'") {
        const quote = s[i++];
        ctx.scan(s.length - i);
        const end = s.indexOf(quote, i);
        if (end < 0) return null;
        value = s.slice(i, end); i = end + 1;
      } else {
        ctx.scan(s.length - i);
        const m = /^[^\s"'`=<>]+/.exec(s.slice(i));
        if (!m) return null;
        value = m[0]; i += value.length;
      }
    }
    const lower = name[0].toLowerCase();
    if (lower === 'href') {
      if (seenHref) return null;
      seenHref = true; href = decodeEntities(value);
    }
    if (lower === 'alt') {
      if (seenAlt) return null;
      seenAlt = true; alt = decodeEntities(value);
    }
  }
  return { href, alt };
}

function html(source, ctx) {
  const root = { type: 'root', children: [] }, stack = [{ name: '', node: root }];
  ctx.scan(source.length * 4);
  let i = 0, skipped = null, skipDepth = 0;
  const current = () => stack[stack.length - 1].node.children;
  while (i < source.length) {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4); if (end < 0) return null;
      i = end + 3; continue;
    }
    if (source[i] !== '<') {
      let end = source.indexOf('<', i); if (end < 0) end = source.length;
      if (!skipped) pushText(current(), decodeEntities(source.slice(i, end)), ctx);
      i = end; continue;
    }
    // Find the next > without interpreting quoted attribute values.
    let end = i + 1, quote = null;
    for (; end < source.length; end++) {
      const c = source[end];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
      else if (c === '<') return null;
    }
    if (end === source.length || quote) return null;
    const raw = source.slice(i + 1, end);
    i = end + 1;
    if (/^!doctype\s+html\s*$/i.test(raw)) continue;
    const token = /^(\/)?([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*)$/.exec(raw);
    if (!token) return null;
    const closing = !!token[1], name = token[2].toLowerCase();
    let rest = token[3], selfClosing = false;
    if (closing && rest.trim()) return null;
    if (!closing && rest.trimEnd().endsWith('/')) { selfClosing = true; rest = rest.trimEnd().slice(0, -1); }
    if (!closing && rest && !/^\s/.test(rest)) return null;
    const attrs = closing ? null : attributes(rest, ctx);
    if (!closing && !attrs) return null;
    if (skipped) {
      if (name === skipped && !voidTags.has(name)) {
        if (closing) { if (--skipDepth === 0) skipped = null; }
        else if (!selfClosing) skipDepth++;
      }
      continue;
    }
    if (dangerous.has(name)) {
      if (name === 'img' && !closing && attrs.alt) pushText(current(), attrs.alt, ctx);
      if (!closing && !voidTags.has(name) && !selfClosing) { skipped = name; skipDepth = 1; }
      continue;
    }
    if (name === 'html' || name === 'body') continue;
    if (!allowed.has(name)) {
      // Unknown syntax remains visible, never interpreted as HTML.
      pushText(current(), source.slice(i - raw.length - 2, i), ctx); continue;
    }
    if (closing) {
      if (name === 'br' || stack.length === 1 || stack[stack.length - 1].name !== name) return null;
      stack.pop(); continue;
    }
    if (stack.length >= TRACKER_MARKUP_LIMITS.depth) throw LIMIT;
    const href = name === 'a' ? safeTrackerHref(attrs.href) : null;
    // A rejected link becomes a span-like div-less node, not an active link.
    const type = name === 'a' && !href ? 'span' : name === 'b' ? 'strong' : name === 'i' ? 'em' : name;
    const node = ctx.add(type, [], href ? { href } : {});
    current().push(node);
    if (name !== 'br' && !selfClosing) stack.push({ name, node });
  }
  if (stack.length !== 1 || skipped) return null;
  return root;
}

/**
 * parseTrackerMarkup(string) -> {type:'root', children:[node,...]}.
 * Nodes are {type:'text', value:string}, or {type, children}, with an optional
 * href ONLY on type 'a'. Element types: p, div, span, br, ul, ol, li, strong,
 * em, code, pre, h1..h6, a. For 'a' the caller MUST set target='_blank' and
 * rel='noopener noreferrer'. Do not spread AST fields into DOM props; map the
 * allowlisted types explicitly and render text as React children, never innerHTML.
 * No image nodes, fetching, DOM APIs, effects, or markup execution occur here.
 * Input over 200k UTF-16 code units is truncated with a visible marker. Excessive
 * nodes/depth/work and malformed legacy HTML fall back to literal, safely rendered
 * text. The conservative work budget may also fall back on long valid constructs.
 * This is a conservative YFM/Markdown subset, not a CommonMark or HTML parser.
 */
function parseTrackerMarkup(input) {
  if (typeof input !== 'string') return fallback('');
  const source = input.length > TRACKER_MARKUP_LIMITS.input ? input.slice(0, TRACKER_MARKUP_LIMITS.input) + '\n[… truncated …]' : input;
  // Legacy wrapper is recognized only around the whole content. Parsing failure
  // shows the original literal rather than guessing browser error recovery.
  const trimmed = source.trim();
  const wrapper = trimmed.startsWith('<#') && trimmed.endsWith('#>') ? trimmed.slice(2, -2) : null;
  try {
    const ctx = context();
    return wrapper !== null && /^\s*(?:<!doctype\s+html\s*>\s*)?<html(?:\s|>)/i.test(wrapper) ? (html(wrapper, ctx) || fallback(source)) : markdown(source, ctx);
  } catch (error) {
    if (error === LIMIT) return fallback(source);
    throw error;
  }
}

    return { TRACKER_MARKUP_LIMITS, safeTrackerHref, parseTrackerMarkup };
  })(),
  // tracker-statuses.mjs sha256:8220ed56da8ed5b95fbcf7a0beb76d754e38e75a404880a6a77b4843d01a59d7
  ...(() => {
// Derive a status-oriented view from Tracker data, without changing Tracker's
// board configuration or any issue. Both configured and observed statuses are
// real Tracker objects. Inconsistent identities fail closed, never guess.
function groupTrackerStatuses({ columns, issues }) {
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

    return { groupTrackerStatuses };
  })(),
  // session-card.mjs sha256:82f72008106de614610c41df42903d0795e01252eaf6075e5cc3af2b5a33e2d3
  ...(() => {
// A session-scoped, read-only view. Nothing in this module mutates Tracker or a board.
function createSessionCard(React, deps) {
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
        const result = await readCommand(command('links.issue.read'), accepts);
        if (!accepts()) return false;
        if (!result || result.incomplete !== false || !Number.isSafeInteger(result.revision) || result.revision !== chosen.linkRevision || !Array.isArray(result.links) || result.links.length > 10000 || result.links.some(link => !link || typeof link.sessionId !== 'string' || link.issueKey !== chosen.issueKey || link.issueId !== chosen.issueId) || !result.links.some(link => link.sessionId === sessionId)) throw Error('link changed');
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
    const openCurrentSession = event => {
      if (!valid()) return;
      const modified = event?.ctrlKey || event?.metaKey || event?.button === 1;
      if (modified) {
        if (typeof deps.openSessionInNewTab === 'function') deps.openSessionInNewTab(sessionId);
      } else if (typeof deps.openSession === 'function') deps.openSession(sessionId);
    };
    const sessionTitle = catalog?.byId?.[sessionId]?.displayTitle || catalog?.byId?.[sessionId]?.title;
    const sessionButton = h('button', { type: 'button', style: styles.button, onClick: openCurrentSession, onAuxClick: event => { if (event.button === 1) openCurrentSession(event); }, disabled: typeof deps.openSession !== 'function' }, text('sessionCardCurrentSession', 'Open current session'), ' · ', typeof sessionTitle === 'string' && sessionTitle.trim() ? sessionTitle : sessionId);
    const boardButton = h('button', { type: 'button', style: styles.button, onClick: openBoard }, text('sessionCardBoard', 'Open full board to edit'));
    if (!currentScope) {
      const ambiguous = workspaces?.phase === 'ready' && Array.isArray(workspaces.items) && workspaces.items.filter(item => item?.sessionIds?.includes(sessionId)).length > 1;
      return h('section', { style: styles.card }, h('p', { style: styles.muted, role: 'status' }, ambiguous ? text('chooseSessionWorkspace', 'This session belongs to multiple workspaces. Open the board and choose a workspace explicitly.') : text('linkUnavailable', 'This session is unavailable, archived, or not registered in a workspace.')),
        h('button', { type: 'button', style: styles.button, onClick: () => { if (mountedSource.getSnapshot() === sessionId && connectionSource.getSnapshot()) openBoardForSession(sessionId); } }, text('sessionCardBoard', 'Open full board to edit')));
    }
    const renderText = value => typeof renderTrackerText === 'function' ? renderTrackerText(value) : value;
    return h('section', { style: styles.card, 'aria-label': text('sessionCardTitle', 'Linked tasks') },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } }, h('strong', null, text('sessionCardTitle', 'Linked tasks')), h('span', { style: styles.badge }, text('trackerReadOnly', 'Read only'))),
      h('p', { style: styles.muted }, text('sessionCardReadOnly', 'This view is read-only. Open the full board to edit. Access changes may not appear immediately.')), sessionButton, boardButton,
      !data ? h('p', { style: styles.muted, role: 'status' }, text('loading', 'Loading…')) : h(React.Fragment, null,
        h('section', { style: styles.panel }, h('strong', null, text('trackerLocal', 'Local tasks')),
          h('p', { style: styles.muted }, text('sessionCardLocalHistory', 'Local links are historical and do not record workspace incarnation; verify them on the full board.')),
          data.localError ? h('p', { style: styles.muted }, text('loadError', 'Local tasks could not be loaded.')) : data.locals.length ? h('ul', { style: { paddingLeft: '18px', marginBottom: 0 } }, data.locals.map(task => h('li', { key: JSON.stringify([task.boardId, task.id]) }, h('strong', null, task.title), h('div', { style: styles.muted }, task.boardName, task.status ? ' · ' + task.status : '')))) : h('p', { style: styles.muted }, text('sessionCardNoLocal', 'No linked local tasks found.'))),
        h('section', { style: styles.panel }, h('strong', null, text('tracker', 'Yandex Tracker')),
          data.message && h('p', { role: 'status', style: styles.muted }, data.message === 'reselect' ? text('trackerReselect', 'Tracker board selection needs confirmation.') : data.message === 'unconfigured' ? text('trackerNotConfigured', 'Tracker is not configured.') : data.message === 'no_boards' ? text('trackerNoBoardsSelected', 'No Tracker boards are selected.') : text('trackerError', 'Tracker is unavailable; issue details are hidden.')),
          data.partialError && h('p', { role: 'status', style: styles.muted }, text('sessionCardPartial', 'Linked issues are a partial result; other links may exist.')),
          !data.message && data.links.length === 0 && h('p', { style: styles.muted }, data.partialError ? text('sessionCardNoLinksPartial', 'No linked issues found in this partial result.') : text('sessionCardNoLinks', 'No linked issues found.')),
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

    return { createSessionCard };
  })(),
  // session-send.mjs sha256:56832ff496730dbb2a989cd61ec6b1dc941fd6e165b0fc074718a067ae45eae5
  ...(() => {
// Enqueue only: the caller owns confirmation, link/authorization validation and UI.
// Results and progress deliberately contain no prompt text or raw exceptions.
const MAX_TARGETS = 20;
const MAX_TEXT_BYTES = 48 * 1024;

// These failures are raised during gateway validation or before admission. In
// particular, do not treat session/agent-busy as definite: the host wraps
// generic failures even when followup() may already have been called.
const DEFINITE_REJECTIONS = new Set([
  'gateway/bad-request',
  'gateway/arguments-invalid',
  'gateway/input-invalid',
  'gateway/interactions-forbidden',
  'session/not-found',
  'session/migration-required',
  'session/attachment-invalid',
]);

/**
 * Build an isolated, serialized sender. validateSession(id) must resolve to
 * true only while the selected session remains authorized and linked.
 *
 * send() returns { state, targets }, with state complete, stopped, or unknown,
 * and targets in selection order as { id, status } (accepted, not-sent, or
 * unknown). Progress receives independent copies of that same shape. An
 * invalid argument rejects before acquiring or sending to any session.
 */
function createSessionSender({ sessions, validateSession }) {
  if (typeof sessions?.using !== 'function' || typeof validateSession !== 'function') {
    throw new TypeError('A sessions service and validateSession function are required');
  }

  let tail = Promise.resolve();

  async function send(targetIds, text, { signal, onProgress } = {}) {
    if (!Array.isArray(targetIds) || targetIds.length === 0 ||
        targetIds.some(id => typeof id !== 'string' || id.length === 0)) {
      throw new TypeError('Target IDs must be nonempty strings');
    }
    const ids = [...new Set(targetIds)];
    if (ids.length !== targetIds.length) throw new TypeError('Duplicate target sessions');
    if (ids.length > MAX_TARGETS) throw new RangeError('Too many target sessions');
    if (typeof text !== 'string' || text.trim().length === 0 ||
        new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
      throw new TypeError('Text must be nonempty and no larger than 48 KiB');
    }
    if (onProgress !== undefined && typeof onProgress !== 'function') {
      throw new TypeError('onProgress must be a function');
    }

    // Each call takes its place immediately; its releases are independent of
    // failures in earlier batches. No caller's queued batch can interleave.
    const predecessor = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await predecessor;
    try {
      const targets = ids.map(id => ({ id, status: 'not-sent' }));
      let state = 'stopped';
      const report = () => {
        if (!onProgress) return;
        try { onProgress({ state, targets: targets.map(target => ({ ...target })) }); } catch { /* UI callbacks cannot affect delivery. */ }
      };

      for (const target of targets) {
        if (signal?.aborted) break;
        let dispatched = false;
        let outcome = 'not-sent';
        try {
          if (await validateSession(target.id) !== true || signal?.aborted) break;
          await sessions.using(target.id, { source: 'controllerOperation', signal }, async ref => {
            await ref.ready;
            const session = ref.binding.session;
            const validSnapshot = () => {
              const snapshot = session.getSnapshot();
              return ref.sessionId === target.id && session.sessionId === target.id &&
                snapshot?.sessionId === target.id && snapshot.openState === 'open' &&
                !snapshot.removed && !snapshot.subagent;
            };
            if (signal?.aborted || !validSnapshot()) return;
            if (await validateSession(target.id) !== true || signal?.aborted || !validSnapshot()) return;

            let handle;
            try {
              handle = session.beginSubmission({ mode: 'queue', text, attachments: [] });
              // A synchronous abort during echo creation must not reach prompt.
              if (signal?.aborted) return;
              dispatched = true;
              const result = await session.prompt([{ type: 'text', text }], 'queue', signal, handle.requestId);
              if (signal?.aborted) outcome = 'unknown';
              else if (result?.ok === true && result.value?.accepted === true) outcome = 'accepted';
              else if (result?.ok === false && DEFINITE_REJECTIONS.has(result.error?.code)) outcome = 'not-sent';
              else outcome = 'unknown';
            } finally {
              if (handle && !dispatched) handle.abandon();
            }
          });
        } catch {
          // The prompt may have reached the host even when it threw or a
          // reference release failed. Never retry an uncertain request.
          if (dispatched && outcome !== 'accepted' && outcome !== 'not-sent') outcome = 'unknown';
          else if (dispatched && outcome === 'not-sent') outcome = 'unknown';
        }
        target.status = outcome;
        if (outcome === 'unknown') state = 'unknown';
        else if (outcome === 'accepted' && targets.every(item => item.status === 'accepted')) state = 'complete';
        report();
        if (outcome !== 'accepted') break;
      }
      return { state, targets: targets.map(target => ({ ...target })) };
    } finally {
      release();
    }
  }
  return { send };
}

    return { createSessionSender };
  })(),
};
/* END GENERATED TRACKER HELPERS */
    // Tracker content is untrusted. Render only a fixed AST vocabulary as React
    // elements; never interpret HTML, spread attributes, or fetch remote media.
    function renderTrackerText(text) {
      const allowed = new Set(['p', 'div', 'span', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a']);
      try {
        function node(item, key) {
          if (item?.type === 'text' && typeof item.value === 'string') return item.value;
          if (!item || !allowed.has(item.type) || !Array.isArray(item.children)) return null;
          const props = { key };
          if (item.type === 'a') {
            const href = safeTrackerHref(item.href);
            if (!href) return h('span', props, ...item.children.map((child, index) => node(child, index)));
            Object.assign(props, { href, target: '_blank', rel: 'noopener noreferrer' });
          }
          return h(item.type, props, ...item.children.map((child, index) => node(child, index)));
        }
        const ast = parseTrackerMarkup(text);
        return h('div', { className: 'dsh-board-richtext' }, ...ast.children.map((child, index) => node(child, index)));
      } catch { return h('div', { className: 'dsh-board-richtext' }, text); }
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
      .dsh-board-kanban{display:flex;gap:14px;max-width:100%;min-width:0;overflow-x:auto;align-items:stretch;padding:2px 1px 22px;scrollbar-width:thin}.dsh-board-column{flex:0 0 290px;min-width:0;min-height:245px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--layer)}.dsh-board-column-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px}.dsh-board-column-label{display:flex;align-items:center;gap:8px;min-width:0}.dsh-board-column-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--column-color,var(--accent))}.dsh-board-column-head h2{overflow-wrap:anywhere;font-size:12px;font-weight:700}.dsh-board-count{display:inline-grid;place-items:center;min-width:21px;height:21px;padding:0 5px;border-radius:6px;background:var(--base);color:var(--muted);font-size:11px;font-weight:650}.dsh-board-column-head button{min-height:27px;padding:4px 7px;border-color:transparent;background:transparent;color:var(--muted);font-size:11px}.dsh-board-column-empty{display:grid;place-items:center;min-height:92px;border:1px dashed var(--line);border-radius:9px;color:var(--muted);font-size:11px;text-align:center}
      .dsh-board button.dsh-board-card-title{text-align:left}
      .dsh-board-card{display:grid;gap:11px;margin:0 0 9px;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--base);box-shadow:0 2px 6px #172b4d0a}.dsh-board-card h3{font-size:13px;font-weight:660;line-height:1.45;overflow-wrap:anywhere}.dsh-board-card-description{margin-top:6px!important;color:var(--muted);font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.dsh-board-card-header,.dsh-board-card-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}.dsh-board-card-id{color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.04em}.dsh-board-card-status{min-width:0;overflow-wrap:anywhere;border-radius:5px;padding:4px 7px;background:var(--layer);color:var(--muted);font-size:10px;font-weight:700}.dsh-board-card-actions{justify-content:flex-start;padding-top:9px;border-top:1px solid var(--line)}.dsh-board-card-actions button{min-height:28px;padding:5px 7px;border:0;background:transparent;color:var(--muted);font-size:11px}.dsh-board-card-sessions-label{color:var(--muted);font-size:10px;font-weight:650}.dsh-board-card-sessions-list{display:grid;gap:5px;margin:6px 0 0;padding:0;list-style:none}.dsh-board-card-session{min-width:0;overflow-wrap:anywhere}.dsh-board-card-session button{display:block;max-width:100%;min-height:0;padding:0;overflow-wrap:anywhere;border:0;background:transparent;text-align:left;color:var(--accent);font-size:11px;font-weight:550}.dsh-board-card-session-unavailable{color:var(--muted);font-size:11px}.dsh-board-card-session-link{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
      .dsh-board-muted{color:var(--muted);font-size:12px;line-height:1.5}.dsh-board-list{display:grid;gap:10px;max-width:860px}.dsh-board-list .dsh-board-card{margin:0}.dsh-board-form{display:grid;gap:15px;max-width:700px;margin:18px 0;padding:22px;border:1px solid var(--line);border-radius:12px;background:var(--base);box-shadow:0 8px 28px #172b4d0c}.dsh-board-form h2{min-width:0;overflow-wrap:anywhere;font-size:16px;letter-spacing:-.02em}.dsh-board-form label{display:grid;gap:7px}.dsh-board-form fieldset{display:grid;gap:5px;max-height:240px;margin:0;padding:10px;border:1px solid var(--line);border-radius:8px;overflow:auto}.dsh-board-form legend{color:var(--muted);font-size:11px}.dsh-board-form fieldset label{display:flex;align-items:center;gap:9px;padding:7px;color:var(--ink);font-size:12px;overflow-wrap:anywhere}.dsh-board-form input[type=checkbox]{accent-color:var(--accent)}
      .dsh-board-alert{padding:12px 14px;margin:12px 0;border:1px solid var(--dsw-alias-state-warn-primary,var(--line));border-radius:9px;font-size:12px;line-height:1.5}.dsh-board-empty{padding:22px 0;color:var(--muted);font-size:12px}.dsh-board-welcome{display:grid;justify-items:center;gap:9px;margin:30px 0;padding:64px 20px;border:1px dashed var(--line);border-radius:12px;text-align:center}.dsh-board-welcome-icon{display:grid;place-items:center;width:44px;height:44px;margin-bottom:6px;border-radius:12px;background:var(--layer);color:var(--accent)}.dsh-board-welcome h2{font-size:15px}.dsh-board-welcome p{max-width:380px;color:var(--muted);font-size:12px;line-height:1.6}
      .dsh-board-overview{margin-top:30px}.dsh-board-overview-count{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:var(--accent-soft);color:var(--ink);font-size:11px;font-weight:700}.dsh-board-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:12px;margin-top:16px}.dsh-board button.dsh-board-tile{position:relative;display:flex;align-items:flex-start;justify-content:flex-start;gap:12px;min-height:98px;padding:16px;text-align:left;border-color:var(--line);background:var(--base)}.dsh-board button.dsh-board-tile:not(:disabled):hover{border-color:var(--accent);background:var(--accent-soft)}.dsh-board-tile-icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:10px;background:var(--accent-soft);color:var(--accent)}.dsh-board-tile-content{display:grid;gap:5px;min-width:0}.dsh-board-tile-content strong{color:var(--ink);font-size:13px;overflow-wrap:anywhere}.dsh-board-tile-content>span,.dsh-board-tile-content small{color:var(--muted);font-size:11px;font-weight:500;overflow-wrap:anywhere}.dsh-board-tile-arrow{margin-left:auto;color:var(--accent);font-size:15px}.dsh-board-session-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:16px 0;padding:12px 14px;border:1px solid var(--accent);border-radius:10px;background:var(--accent-soft);font-size:12px}.dsh-board-session-banner strong,.dsh-board-session-banner span{display:block;overflow-wrap:anywhere}.dsh-board-session-banner strong{margin-bottom:4px}.dsh-board-session-banner p{margin-top:5px;color:var(--muted)}.dsh-board button.dsh-board-back{justify-content:flex-start;min-height:0;margin:0 0 10px;padding:0;border:0;background:transparent;color:var(--accent);font-size:12px}.dsh-board .dsh-board-card{gap:6px;padding:8px 10px;border-radius:8px}.dsh-board .dsh-board-card-header{align-items:flex-start}.dsh-board button.dsh-board-card-title{display:block;min-height:28px;padding:4px 2px;border:0;background:transparent;color:var(--ink);font-size:12px;font-weight:600}.dsh-board button.dsh-board-card-action-links{display:inline-flex;gap:4px;min-width:30px;min-height:28px;padding:4px 6px;border:0;background:var(--accent-soft);color:var(--ink)}.dsh-board-card-action-links .dsh-board-icon{width:13px;height:13px}.dsh-board button.dsh-board-card-current{justify-self:start;min-height:28px;padding:5px 8px;border-color:var(--accent-soft);background:var(--accent-soft);color:var(--ink);font-size:11px}.dsh-board button.dsh-board-card-current.is-linked{border-color:var(--dsw-alias-state-success-primary,#22c55e);background:var(--dsw-alias-state-success-tertiary,#e6faed)}.dsh-board-session-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.dsh-board-session-row label{min-width:0}.dsh-board-session-row button{flex:none}
      .dsh-board-drawer{position:fixed;z-index:100;top:0;right:0;bottom:0;width:min(520px,100vw);overflow:auto;padding:22px;background:var(--base);border-left:1px solid var(--line);box-shadow:-12px 0 32px #172b4d30}.dsh-board-drawer .dsh-board-form{margin:0;max-width:none;padding:0;border:0;box-shadow:none}.dsh-board-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.dsh-board-drawer section{display:grid;gap:10px;margin:20px 0}.dsh-board-drawer label{display:grid;gap:7px;color:var(--muted);font-size:11px;font-weight:650}.dsh-board-drawer p,.dsh-board-drawer li{white-space:pre-wrap;overflow-wrap:anywhere}.dsh-board-drawer ul{padding-left:20px}
      .dsh-board .dsh-board-tracker-drawer{width:min(580px,100vw);padding:0;overflow-x:hidden;overscroll-behavior:contain;box-shadow:-12px 0 36px #0003}.dsh-board-tracker-drawer,.dsh-board-tracker-drawer *{min-width:0}.dsh-board-tracker-drawer button{white-space:normal;overflow-wrap:anywhere}.dsh-board-tracker-drawer select{max-width:100%}
      .dsh-board-tracker-drawer .dsh-board-tracker-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;padding:12px 24px;border-bottom:1px solid var(--line);background:var(--base)}
      .dsh-board-tracker-head h2{min-width:0;color:var(--muted);font-size:12px;font-weight:650;overflow-wrap:anywhere}.dsh-board-tracker-head h2:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.dsh-board-tracker-head a{color:var(--accent);text-decoration:none}.dsh-board-tracker-head a:hover{text-decoration:underline}.dsh-board-tracker-head-actions{display:flex;align-items:center;gap:8px;flex:none}.dsh-board .dsh-board-tracker-close{min-width:36px;padding:8px;font-size:18px;line-height:1}
      .dsh-board-tracker-body{display:grid;gap:0;min-width:0;padding:24px}.dsh-board-tracker-body>*{min-width:0}.dsh-board-tracker-body .dsh-board-tracker-hero{display:grid;gap:14px;margin:0 0 22px}.dsh-board-tracker-hero h3{font-size:20px;line-height:1.3;letter-spacing:-.025em;overflow-wrap:anywhere}.dsh-board-tracker-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dsh-board-tracker-meta p{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:12px}.dsh-board-tracker-meta strong{color:var(--ink);font-weight:600;overflow-wrap:anywhere}.dsh-board-tracker-status{padding:5px 9px;border-radius:7px;background:var(--accent-soft);color:var(--ink);font-size:12px;font-weight:650;overflow-wrap:anywhere}
      .dsh-board-tracker-drawer section.dsh-board-tracker-section{display:grid;gap:12px;min-width:0;margin:0;padding:22px 0;border-top:1px solid var(--line)}.dsh-board-tracker-section h3{font-size:14px;font-weight:700;letter-spacing:-.01em}.dsh-board-tracker-section label{font-size:12px}.dsh-board-tracker-section .dsh-board-richtext{font-size:14px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}.dsh-board-tracker-section button{justify-self:start;max-width:100%;overflow-wrap:anywhere;text-align:left}.dsh-board-tracker-section .dsh-board-row{align-items:flex-end}.dsh-board-tracker-section .dsh-board-row label{flex:1 1 180px;min-width:0}
      .dsh-board-tracker-drawer ul.dsh-board-tracker-list{display:grid;gap:12px;margin:0;padding:0;list-style:none}.dsh-board-tracker-list li{min-width:0;overflow-wrap:anywhere}.dsh-board-tracker-session{padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--layer);font-size:13px}.dsh-board-tracker-session-link{padding:0;border:0;background:none;color:var(--accent);font:inherit;text-align:left;text-decoration:underline;cursor:pointer;overflow-wrap:anywhere}.dsh-board-tracker-comment{display:grid;gap:8px;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--layer)}.dsh-board-tracker-comment-meta{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;color:var(--muted);font-size:11px}.dsh-board-tracker-comment-meta strong{color:var(--ink);font-size:12px}.dsh-board-tracker-comment p{font-size:13px;line-height:1.55}.dsh-board-tracker-notices{display:grid;gap:8px;margin-bottom:16px}.dsh-board-tracker-notices p{font-size:12px;line-height:1.5;overflow-wrap:anywhere}.dsh-board-tracker-separate{color:var(--muted);font-size:12px;line-height:1.5}.dsh-board-tracker-draft{justify-self:start;margin-top:12px!important;padding:6px 9px;border:1px solid var(--line);border-radius:7px;background:var(--layer);color:var(--ink);font-size:12px;line-height:1.4}.dsh-board-tracker-footer{padding:4px 0 12px}
      @media(max-width:600px){.dsh-board-tracker-drawer .dsh-board-tracker-head{padding:10px 16px}.dsh-board-tracker-body{padding:20px 16px}.dsh-board .dsh-board-tracker-drawer button,.dsh-board .dsh-board-tracker-drawer input,.dsh-board .dsh-board-tracker-drawer select{min-height:44px}.dsh-board .dsh-board-tracker-close{min-width:44px}.dsh-board-tracker-head-actions{gap:6px}.dsh-board-tracker-head-actions button{padding:8px}}
      .dsh-board-tracker-body .dsh-board-tracker-hero{gap:18px;padding:4px 0 24px;margin:0}.dsh-board-tracker-hero h3{font-size:24px;font-weight:700;line-height:1.25;letter-spacing:-.035em}.dsh-board-tracker-meta{gap:12px}.dsh-board .dsh-board-tracker-status{border-color:transparent;background:var(--accent-soft);color:var(--accent);font-weight:700}.dsh-board-tracker-meta p{padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--layer)}
      .dsh-board-tracker-drawer section.dsh-board-tracker-section{gap:14px;padding:24px 0}.dsh-board-tracker-section h3{font-size:15px}.dsh-board-tracker-section>.dsh-board-richtext{padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--layer)}.dsh-board-comment-summary{display:grid;gap:4px;color:var(--muted);font-size:12px;line-height:1.45}.dsh-board-comment-summary strong{color:var(--ink)}.dsh-board-comment-composer{display:grid;gap:10px;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--layer)}.dsh-board-comment-composer textarea{min-height:84px}.dsh-board-tracker-comment{padding:16px;background:var(--base);box-shadow:0 2px 8px #172b4d0a}.dsh-board-tracker-comment-meta{align-items:center;gap:9px}.dsh-board-comment-avatar{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:50%;background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:750}.dsh-board-tracker-comment-meta time{margin-left:auto}.dsh-board-tracker-head{box-shadow:0 2px 8px #172b4d0a}.dsh-board-tracker-head h2 a{display:inline-block;padding:5px 8px;border-radius:6px;background:var(--accent-soft)}
      @media(max-width:600px){.dsh-board-tracker-hero h3{font-size:21px}.dsh-board-tracker-section>.dsh-board-richtext,.dsh-board-tracker-comment,.dsh-board-comment-composer{padding:12px}.dsh-board-tracker-comment-meta time{margin-left:0}.dsh-board-tracker-head-actions{flex-wrap:wrap;justify-content:flex-end}.dsh-board-tracker-head-actions button{font-size:11px}}
      .dsh-board-tracker-drawer .dsh-board-richtext{font-size:14px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}.dsh-board-richtext p,.dsh-board-richtext ul,.dsh-board-richtext ol,.dsh-board-richtext pre{margin:0 0 .75em}.dsh-board-richtext ul,.dsh-board-richtext ol{padding-left:1.5em}.dsh-board-richtext pre{max-width:100%;overflow:auto;padding:12px;border-radius:8px;background:var(--layer);white-space:pre}.dsh-board-richtext code{font-family:monospace}.dsh-board-richtext a{color:var(--accent);text-decoration:underline}.dsh-board-richtext h1,.dsh-board-richtext h2,.dsh-board-richtext h3,.dsh-board-richtext h4,.dsh-board-richtext h5,.dsh-board-richtext h6{margin:.75em 0 .4em;line-height:1.3}.dsh-board-richtext> :last-child{margin-bottom:0}
      .dsh-board-scroll-wrap{min-width:0;max-width:100%}.dsh-board-scroll-top{position:sticky;top:0;z-index:3;min-width:0;max-width:100%;height:20px;overflow-x:scroll;overflow-y:hidden;background:var(--layer);border:1px solid var(--line);border-radius:5px;scrollbar-color:var(--muted) var(--layer)}.dsh-board-scroll-top>div{height:1px}.dsh-board-scroll-top::-webkit-scrollbar{height:14px}.dsh-board-scroll-top::-webkit-scrollbar-thumb{background:var(--muted);border-radius:7px}.dsh-board-scroll-top:focus-visible,.dsh-board-resize:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}.dsh-board-resize{position:fixed;z-index:101;top:0;bottom:0;width:12px;transform:translateX(-50%);cursor:ew-resize;touch-action:none;background:var(--layer);border-inline:1px solid var(--line)}.dsh-board-resize:after{content:'⋮';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--muted);font-size:20px}.dsh-board-status-manager{margin:12px 0}.dsh-board-status-manager summary{cursor:pointer;color:var(--muted);font-size:12px}.dsh-board-status-manager ul{display:flex;gap:8px;flex-wrap:wrap;padding:0;list-style:none}
      .dsh-board,.dsh-board-shell,.dsh-board-content{min-width:0;max-width:100%}.dsh-board-kanban:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.dsh-board-whale{display:block;width:16px;height:16px;flex:none}.dsh-board button.dsh-board-whale-button{min-height:26px;padding:4px;border:0;background:transparent;color:var(--muted)}.dsh-board button.dsh-board-whale-button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}.dsh-board-session-menu{display:grid;gap:3px;padding:6px;border:1px solid var(--line);border-radius:8px;background:var(--base)}.dsh-board .dsh-board-session-menu button{justify-content:flex-start;min-width:0;min-height:28px;padding:5px 7px;border:0;text-align:left;overflow-wrap:anywhere}.dsh-board-session-menu button[aria-disabled=true]{color:var(--muted);cursor:not-allowed}.dsh-board-card-id[href]{color:var(--accent);text-decoration:none}.dsh-board-card-id[href]:hover{text-decoration:underline}
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
    function Page({ t, transport, workspacesSource, sessionsSource, sessionService, openSession, sessionContext, connectionSource, panelSource }) {
      const connection = useSource(connectionSource);
      const workspaces = useSource(workspacesSource);
      const sessions = useSource(sessionsSource);
      const context = useSource(sessionContext);
      const [, render] = useState(0);
      const scrollTop = useRef(null), scrollBoard = useRef(null), scrollSizer = useRef(null), drag = useRef(null);
      const viewportWidth = () => Math.max(1, window.innerWidth || 1024);
      const drawerWidth = () => Math.min(viewportWidth(), Math.max(Math.min(320, viewportWidth()), memory.drawerWidth));
      const setDrawerWidth = width => updateMemory({ drawerWidth: Math.round(Math.min(viewportWidth(), Math.max(Math.min(320, viewportWidth()), width))) });
      const finishDrag = () => { const active = drag.current; drag.current = null; if (active) { try { active.target.releasePointerCapture(active.id); } catch {} } };
      useEffect(() => { const resize = () => render(value => value + 1); window.addEventListener('resize', resize); return () => { finishDrag(); window.removeEventListener('resize', resize); }; }, []);
      useEffect(() => { if (!memory.issue && !['task', 'links'].includes(memory.form?.kind)) finishDrag(); });
      const syncScrollSize = () => { const board = scrollBoard.current, top = scrollTop.current, sizer = scrollSizer.current; if (!board || !top || !sizer) return; sizer.style.width = board.scrollWidth + 'px'; top.scrollLeft = board.scrollLeft; };
      useEffect(() => {
        const board = scrollBoard.current, top = scrollTop.current;
        if (!board || !top) return;
        syncScrollSize();
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncScrollSize) : null;
        observer?.observe(board); for (const child of board.children || []) observer?.observe(child);
        window.addEventListener('resize', syncScrollSize);
        return () => { observer?.disconnect(); window.removeEventListener('resize', syncScrollSize); };
      });
      const scrollView = children => h('div', { className: 'dsh-board-scroll-wrap' },
        h('div', { ref: scrollTop, className: 'dsh-board-scroll-top', role: 'region', tabIndex: 0, 'aria-label': t('scrollBoardTop'), onScroll: event => { if (scrollBoard.current) scrollBoard.current.scrollLeft = event.currentTarget.scrollLeft; } }, h('div', { ref: scrollSizer, 'aria-hidden': true })),
        h('div', { ref: scrollBoard, className: 'dsh-board-kanban', role: 'region', tabIndex: 0, 'aria-label': t('scrollBoard'), onScroll: event => { if (scrollTop.current) scrollTop.current.scrollLeft = event.currentTarget.scrollLeft; } }, children));
      const resizeHandle = () => h('div', { className: 'dsh-board-resize', role: 'separator', tabIndex: 0, 'aria-label': t('resizeDrawer'), 'aria-orientation': 'vertical', 'aria-valuemin': Math.min(320, viewportWidth()), 'aria-valuemax': viewportWidth(), 'aria-valuenow': drawerWidth(), style: { right: drawerWidth() + 'px', transform: 'translateX(50%)' },
        onPointerDown: event => { if (event.button !== 0 || drag.current) return; event.preventDefault(); event.currentTarget.focus(); drag.current = { id: event.pointerId, target: event.currentTarget, x: event.clientX, width: drawerWidth() }; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { drag.current = null; } },
        onPointerMove: event => { const active = drag.current; if (active && active.id === event.pointerId) setDrawerWidth(active.width + active.x - event.clientX); },
        onPointerUp: event => { if (drag.current?.id === event.pointerId) finishDrag(); }, onPointerCancel: event => { if (drag.current?.id === event.pointerId) finishDrag(); }, onLostPointerCapture: event => { if (drag.current?.id === event.pointerId) drag.current = null; },
        onKeyDown: event => { const key = event.key; if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return; event.preventDefault(); setDrawerWidth(key === 'Home' ? Math.min(320, viewportWidth()) : key === 'End' ? viewportWidth() : drawerWidth() + (key === 'ArrowLeft' ? 20 : -20)); } });
      const [sessionMenu, setSessionMenu] = useState(null);
      useEffect(() => { if (sessionMenu) document.getElementById?.(sessionMenu.menuId)?.querySelector('[role="menuitem"]')?.focus(); }, [sessionMenu]);
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
      const formHeading = useRef(null), issueHeading = useRef(null), issueOrigin = useRef(null);
      const issueEditButton = useRef(null), issueTitleInput = useRef(null), issueFocusRequest = useRef(null);
      const [statusPopover, setStatusPopover] = useState(null);
      const statusButton = useRef(null), statusFirstOption = useRef(null), statusSelection = useRef(null);
      useEffect(() => {
        const issue = memory.issue;
        if (statusPopover && issue?.token === statusPopover && issue.available && issueScope(issue)) statusFirstOption.current?.focus();
      }, [statusPopover]);
      useEffect(() => {
        const issue = memory.issue;
        if (statusPopover && (!issue || issue.token !== statusPopover || !issue.available || !issueScope(issue))) setStatusPopover(null);
      });
      useEffect(() => {
        if (!memory.issue) return;
        issueHeading.current?.focus();
        return () => { if (issueOrigin.current?.isConnected) issueOrigin.current.focus(); issueOrigin.current = null; };
      }, [Boolean(memory.issue)]);
      useEffect(() => {
        const request = issueFocusRequest.current;
        if (!request) return;
        if (memory.issue?.token === request.token && memory.issue.available && memory.issue.editingFields === request.editing && issueScope(memory.issue)) {
          const target = request.editing ? issueTitleInput.current : issueEditButton.current;
          if (target) { issueFocusRequest.current = null; target.focus(); }
        } else if (memory.issue?.token !== request.token) issueFocusRequest.current = null;
      });
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
      const workspaceLinksFor = (taskId) => sessionMembershipReady ? linksFor(taskId).filter((link) => workspace.sessionIds.includes(link.sessionId)) : [];
      // Count column sessions before the session filter, so switching to “without”
      // cannot hide the control needed to switch back to linked tasks.
      const baseTasks = selected ? selected.tasks.filter((task) =>
        (!statusFilter || task.statusId === statusFilter) && (task.title + '\n' + (task.description || '')).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
        assigneeMatches(assigneeFilter, task.assignee !== undefined, task.assignee ?? null)) : [];
      const tasks = baseTasks.filter((task) => {
        const linked = workspaceLinksFor(task.id).length > 0;
        return sessionFilter === 'all' || (sessionMembershipReady && (sessionFilter === 'linked' ? linked : !linked));
      });
      const availableSessions = workspace && sessions.phase === 'ready' && workspaces.phase === 'ready' && workspaces.state !== 'error'
        ? workspace.sessionIds.filter((id) => sessions.ids.includes(id)) : [];
      function label(id) {
        const title = sessions.byId[id]?.displayTitle || sessions.byId[id]?.title;
        // Titles are not unique. Keep the complete stable ID visible for an
        // unambiguous session choice and independently verifiable links.
        return title && title !== id ? `${title} (${id})` : id;
      }
      async function load() {
        if (memory.pending || !trackerActive() || connectionSource.getSnapshot()?.id === undefined) return;
        const generation = ++memory.generation, connectionId = connectionSource.getSnapshot()?.id, epoch = privacyEpoch;
        const target = JSON.stringify([memory.provider, memory.workspaceId, memory.boardId, memory.overview, memory.showContext]);
        const owner = {}; localLoadOwner = owner;
        const accepts = () => localLoadOwner === owner && generation === memory.generation && connectionSource.getSnapshot()?.id === connectionId && privacyEpoch === epoch && trackerActive() && target === JSON.stringify([memory.provider, memory.workspaceId, memory.boardId, memory.overview, memory.showContext]);
        updateMemory({ loading: true, error: '' });
        try {
          const value = validateSnapshot(await transport.read());
          if (!accepts()) return;
          if (memory.snapshot && value.revision < memory.snapshot.revision) throw new Error('staleSnapshot');
          const reconciled = memory.uncertain && memory.uncertainRevision !== null && value.revision >= memory.uncertainRevision;
          updateMemory({ snapshot: value, readback: reconciled, error: memory.uncertain ? 'unknown' : '' });
        } catch (err) {
          if (accepts()) updateMemory({ readback: false, error: err.message === 'noTransport' ? 'noTransport' : err.message === 'badSnapshot' ? 'badSnapshot' : 'loadError' });
        } finally { if (localLoadOwner === owner) { localLoadOwner = null; updateMemory({ loading: false }); } }
      }
      useEffect(() => { if (!memory.pending && (!memory.snapshot || memory.uncertain)) load(); return () => { invalidateLocalLoad(); }; }, []);
      const localVisibility = useRef(() => {}), localRefresh = useRef(() => {});
      // Poll the local snapshot without changing loading/error/readback state. A form
      // owns its original revision, even before the first keystroke; applying a
      // newer snapshot under it would silently rebase a subsequent CAS write.
      useEffect(() => {
        let alive = true, running = false, queued = false, deferred = null, refreshOwner = null;
        const active = () => trackerActive() && connectionSource.getSnapshot()?.id !== undefined;
        const target = () => JSON.stringify([memory.provider, memory.workspaceId, memory.boardId, memory.overview, memory.showContext]);
        let lastTarget = target();
        const blocked = () => Boolean(memory.form || memory.pending || memory.uncertain || memory.loading);
        const applyDeferred = () => {
          if (!deferred || !active() || blocked()) return;
          const item = deferred; deferred = null;
          if (item.generation === memory.generation && item.connectionId === connectionSource.getSnapshot()?.id && item.epoch === privacyEpoch && item.target === target() && (!memory.snapshot || item.value.revision >= memory.snapshot.revision)) updateMemory({ snapshot: item.value });
        };
        const refresh = async () => {
          if (!alive || running || !active() || memory.pending || memory.uncertain || memory.loading) return;
          running = true;
          const owner = {}; refreshOwner = owner;
          const generation = ++memory.generation, connectionId = connectionSource.getSnapshot()?.id, stamp = target(), epoch = privacyEpoch;
          try {
            const value = validateSnapshot(await transport.read());
            if (!alive || !active() || generation !== memory.generation || connectionSource.getSnapshot()?.id !== connectionId || privacyEpoch !== epoch || target() !== stamp || (memory.snapshot && value.revision < memory.snapshot.revision)) return;
            deferred = { value, generation, connectionId, epoch, target: stamp };
            applyDeferred();
          } catch { /* A background failure must not disturb the current view. */ }
          finally { if (refreshOwner === owner) { refreshOwner = null; running = false; if (alive && queued) { queued = false; void refresh(); } } }
        };
        const request = () => {
          if (!alive || !active()) return;
          if (!memory.snapshot || memory.uncertain) { if (!memory.loading && !memory.pending) void load(); return; }
          if (running) { queued = true; return; }
          void refresh();
        };
        let lastConnectionId = connectionSource.getSnapshot()?.id;
        const onMemory = () => {
          const nextTarget = target(), nextConnectionId = connectionSource.getSnapshot()?.id;
          if (nextTarget !== lastTarget || nextConnectionId !== lastConnectionId) {
            const changedConnection = nextConnectionId !== lastConnectionId;
            lastTarget = nextTarget; lastConnectionId = nextConnectionId; deferred = null;
            running = false; queued = false; refreshOwner = null;
            if (localLoadOwner) invalidateLocalLoad();
            if (changedConnection && active() && !memory.pending && !memory.loading && (!memory.snapshot || memory.uncertain)) void load();
          } else applyDeferred();
        };
        const onVisibility = () => {
          if (active()) request();
          else { deferred = null; queued = false; running = false; refreshOwner = null; invalidateLocalLoad(); }
        };
        localVisibility.current = onVisibility;
        localRefresh.current = request;
        memory.listeners.add(onMemory);
        const timer = window.setInterval(request, 30000);
        if (memory.snapshot && !memory.uncertain && !memory.pending) request();
        return () => { alive = false; deferred = null; queued = false; refreshOwner = null; invalidateLocalLoad(); localVisibility.current = () => {}; localRefresh.current = () => {}; memory.listeners.delete(onMemory); window.clearInterval(timer); };
      }, []);
      useEffect(() => {
        if (connectionSource.getSnapshot()) loadTracker();
        return () => invalidateTracker(false, true);
      }, []);
      useEffect(() => {
        if (connection && !memory.tracker.settings && !memory.tracker.busy && !memory.tracker.error) loadTracker();
        if (connection && trackerActive() && !memory.pending && !memory.loading && (!memory.snapshot || memory.uncertain)) load();
      }, [connection]);
      useEffect(() => {
        let alive = true, running = false, queued = false, lastEvent = 0, wasActive = trackerActive(), localWasActive = trackerActive();
        const active = () => trackerActive();
        const targetOpen = () => memory.provider === 'tracker' && !memory.overview && !memory.showContext && Boolean(memory.workspaceId && memory.boardId);
        // Keep only non-authorizing draft IDs; fence every private response across a boundary.
        const clearPrivate = () => {
          privacyEpoch++;
          const current = memory.tracker;
          const draftWorkspace = current.pickerWorkspace || current.draftWorkspace;
          const draftPicked = current.pickerWorkspace ? [...current.picked] : current.draftPicked;
          if (memory.issue) { const writing = memory.issue.pending && !memory.issue.preflight && !memory.issue.sendOwner; if (writing) unknownIssues.add(issueUnknownKey(memory.issue)); memory.issue = { ...memory.issue, available: false, loading: false, unknown: memory.issue.unknown || writing, error: writing ? 'issueUnknown' : memory.issue.error, generation: memory.issue.generation + 1 }; }
          updateTracker({ settings: null, incarnations: {}, board: null, boardLinks: null, boardUpdatedAt: null, listing: null, pickerWorkspace: '', draftWorkspace, draftPicked, draftIncarnation: current.draftIncarnation || current.incarnations[draftWorkspace], reviewRequired: Boolean(draftWorkspace) });
        };
        const drain = async () => {
          if (!alive || running || !queued || !active() || !connectionSource.getSnapshot() || memory.tracker.busy) return;
          queued = false; running = true;
          try { await loadTracker(); } finally {
            running = false;
            if (alive && queued) void drain();
          }
        };
        const request = () => {
          if (running && lastEvent && Date.now() - lastEvent < 250) return;
          lastEvent = Date.now();
          if (!active()) { queued = false; return; }
          queued = true; void drain();
        };
        const boundary = () => {
          const now = active();
          if (!now && wasActive) { clearPrivate(); queued = false; lastEvent = 0; }
          else if (now && !wasActive) request();
          wasActive = now;
        };
        const onVisibility = () => { localVisibility.current(); localWasActive = active(); boundary(); };
        const onFocus = () => { if (active() && targetOpen()) void refreshTrackerSilently(); };
        const onPanel = () => { const now = active(); if (now !== localWasActive) localVisibility.current(); localWasActive = now; boundary(); };
        const onMemory = () => { if (queued && !running && !memory.tracker.busy) void drain(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        const unsubscribe = panelSource?.subscribe(onPanel);
        memory.listeners.add(onMemory);
        const timer = window.setInterval(() => { if (alive && active() && targetOpen()) void refreshTrackerSilently(); }, 30000);
        return () => { alive = false; queued = false; memory.listeners.delete(onMemory); unsubscribe?.(); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); window.clearInterval(timer); };
      }, []);
      useEffect(() => {
        if (!context.sessionId || workspaces.phase !== 'ready' || workspaces.state === 'error' || memory.contextHandled === context.token) return;
        // Never switch the target behind an existing draft or in-flight write.
        if (memory.pending || memory.uncertain) return;
        if (!closeIssue()) { memory.contextHandled = context.token; return; }
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
      function suspendIssueForRefresh() {
        const issue = memory.issue;
        if (!issue) return;
        const writing = issue.pending && !issue.preflight && !issue.sendOwner;
        if (writing) unknownIssues.add(issueUnknownKey(issue));
        updateMemory({ issue: { ...issue, available: false, loading: false, generation: issue.generation + 1, unknown: issue.unknown || writing, error: writing ? 'issueUnknown' : issue.error } });
      }
      async function loadTracker(accepts = () => document.visibilityState !== 'hidden' && (!panelSource || panelSource.getSnapshot()?.activePanelId === PANEL)) {
        const connectionId = connectionSource.getSnapshot()?.id;
        if (memory.tracker.busy || connectionId === undefined || !accepts()) return;
        const generation = memory.tracker.generation + 1, incarnations = workspaceIncarnations(), epoch = privacyEpoch;
        const target = memory.provider === 'tracker' && !memory.overview && !memory.showContext ? memory.workspaceId : '', id = memory.boardId;
        const draftWorkspace = memory.tracker.pickerWorkspace || memory.tracker.draftWorkspace;
        const draftPicked = memory.tracker.pickerWorkspace ? [...memory.tracker.picked] : memory.tracker.draftPicked;
        suspendIssueForRefresh();
        updateTracker({ busy: true, error: '', notice: '', settings: null, pickerWorkspace: '', listing: null, draftWorkspace, draftPicked, reviewRequired: Boolean(draftWorkspace), board: null, boardLinks: null, boardUpdatedAt: null, incarnations: {}, generation });
        try {
          const settings = trackerSettings(await transport.trackerRead());
          if (!validPrivateRequest(generation, connectionId, epoch) || !accepts()) return;
          discardReselectedIssue(settings);
          updateTracker({ settings, orgType: settings.orgType || 'cloud', incarnations, board: null });
          if (target && memory.provider === 'tracker' && !memory.overview && !memory.showContext && memory.workspaceId === target && memory.boardId === id && currentWorkspace(target, incarnations[target])) {
            if (settings.needsReselect.includes(target) || !settings.workspaces[target]?.includes(id)) { updateTracker({ error: 'trackerReselect' }); return; }
            const board = trackerBoard(await transport.trackerCommand({ op: 'board.read', workspaceId: target, boardId: id, issueKeys: [] }), id);
            if (validPrivateRequest(generation, connectionId, epoch) && accepts() && memory.provider === 'tracker' && !memory.overview && !memory.showContext && memory.workspaceId === target && memory.boardId === id && currentWorkspace(target, incarnations[target])) updateTracker({ board, boardUpdatedAt: Date.now() });
          }
        } catch (err) { if (validPrivateRequest(generation, connectionId, epoch) && accepts() && (!target || (memory.provider === 'tracker' && !memory.overview && memory.workspaceId === target && memory.boardId === id))) { if (err?.code === 'needs_reselect') invalidateIssueAccess(); else updateTracker({ settings: null, board: null, error: trackerError(err) }); } }
        finally { if (validTrackerRequest(generation, connectionId)) updateTracker({ busy: false }); }
      }
      // Separate from manual refresh: never blank the board, suspend the drawer,
      // reload comments, or touch a draft merely because a poll has started.
      const silentTracker = useRef({ running: false, sequence: 0 });
      async function refreshTrackerSilently() {
        const current = memory.tracker, settings = current.settings;
        const target = memory.workspaceId, id = memory.boardId, incarnation = current.incarnations[target];
        const connectionId = connectionSource.getSnapshot()?.id, generation = current.generation, epoch = privacyEpoch;
        if (silentTracker.current.running || !trackerActive() || connectionId === undefined || current.busy || trackerMutationPending || issueMutationPending || memory.issue?.pending || !settings || !current.board || memory.provider !== 'tracker' || memory.overview || memory.showContext || !currentWorkspace(target, incarnation) || settings.needsReselect.includes(target) || !settings.workspaces[target]?.includes(id)) return;
        const sequence = ++silentTracker.current.sequence;
        silentTracker.current.running = true;
        const scope = () => sequence === silentTracker.current.sequence && validPrivateRequest(generation, connectionId, epoch) && memory.tracker.settings?.revision === settings.revision && memory.tracker.incarnations[target] === incarnation && currentWorkspace(target, incarnation) && memory.provider === 'tracker' && !memory.overview && !memory.showContext && memory.workspaceId === target && memory.boardId === id;
        const accepts = () => scope() && !memory.tracker.busy && !trackerMutationPending && !issueMutationPending && !memory.issue?.pending;
        const revoke = (error) => {
          if (!scope()) return;
          // A changed authorization binding is a privacy boundary, not a transient
          // polling failure. Keep drafts hidden as in the existing invalidation path.
          invalidateTracker(true, true);
          updateTracker({ error });
        };
        try {
          const fresh = trackerSettings(await transport.trackerRead());
          if (!scope()) return;
          if (fresh.revision !== settings.revision || !fresh.configured || fresh.needsReselect.includes(target) || !fresh.workspaces[target]?.includes(id)) { discardReselectedIssue(fresh); revoke('trackerReselect'); return; }
          if (!accepts()) return;
          const board = trackerBoard(await transport.trackerCommand({ op: 'board.read', workspaceId: target, boardId: id, issueKeys: [] }), id);
          if (!accepts()) return;
          // Do not refetch focused issue/comments during polling. Existing detail
          // reads and transition preflight retain their original CAS safety.
          updateTracker({ board, boardUpdatedAt: Date.now() });
        } catch (err) {
          if (scope() && ([401, 403, 404, 409, 412].includes(err?.status) || ['needs_reselect', 'board_not_selected', 'unauthorized', 'forbidden', 'credential_changed', 'credentials_unavailable', 'invalid_credentials', 'scope_expired'].includes(err?.code))) revoke(trackerError(err));
        } finally { if (sequence === silentTracker.current.sequence) silentTracker.current.running = false; }
      }
      useEffect(() => () => { ++silentTracker.current.sequence; silentTracker.current.running = false; }, []);
      async function configureTracker() {
        const current = memory.tracker;
        if (current.busy || !current.settings || (current.settings.configured && !window.confirm(t('trackerConfigureWarning')))) return;
        const revision = current.settings.revision, connectionId = connectionSource.getSnapshot()?.id;
        if (connectionId === undefined) return;
        const generation = current.generation + 1, epoch = privacyEpoch;
        trackerMutationPending = true;
        discardTrackerIssue();
        updateTracker({ busy: true, mutating: true, error: '', notice: '', listing: null, pickerWorkspace: '', board: null, boardLinks: null, settings: null, generation });
        try {
          const next = trackerSettings(await transport.trackerCommand({ op: 'configuration.configure', expectedRevision: revision, orgType: current.orgType }));
          if (!validPrivateRequest(generation, connectionId, epoch)) return;
          if (next.revision !== revision + 1 || !next.configured) throw new Error('invalid receipt');
          discardReselectedIssue(next);
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
        discardTrackerIssue(target);
        updateTracker({ busy: true, mutating: true, error: '', notice: '', settings: null, listing: null, pickerWorkspace: '', draftWorkspace: target, draftPicked: [...current.picked], draftIncarnation: incarnations[target], reviewRequired: true, board: null, boardLinks: null, generation });
        try {
          const receipt = await transport.trackerCommand({ op: 'workspace.select', expectedRevision: revision, workspaceId: target, boardIds: [...current.picked] });
          if (!validPrivateRequest(generation, connectionId, epoch)) return;
          if (!receipt || receipt.revision !== revision + 1 || receipt.workspaceId !== target || !Array.isArray(receipt.boardIds) || JSON.stringify(receipt.boardIds) !== JSON.stringify(current.picked)) throw new Error('invalid receipt');
          const settings = trackerSettings(await transport.trackerRead());
          if (!validPrivateRequest(generation, connectionId, epoch)) return;
          if (settings.revision < receipt.revision) throw new Error('invalid receipt');
          discardReselectedIssue(settings);
          updateTracker({ settings, listing: null, incarnations, pickerWorkspace: '', picked: [], draftWorkspace: '', draftPicked: [], draftIncarnation: undefined, reviewRequired: false, board: null, notice: 'trackerSelectionSaved' });
        } catch (err) {
          if (validPrivateRequest(generation, connectionId, epoch)) {
            updateTracker({ settings: null, listing: null, pickerWorkspace: '', board: null, error: err.status >= 400 && err.status < 500 ? trackerError(err) : 'trackerUncertain' });
            try {
              const settings = trackerSettings(await transport.trackerRead());
              if (validPrivateRequest(generation, connectionId, epoch)) { discardReselectedIssue(settings); updateTracker({ settings, incarnations: workspaceIncarnations() }); }
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
        suspendIssueForRefresh();
        updateTracker({ busy: true, error: '', settings: null, listing: null, pickerWorkspace: '', draftWorkspace, draftPicked, reviewRequired: Boolean(draftWorkspace), board: null, boardLinks: null, boardUpdatedAt: null, generation });
        const accepts = () => validPrivateRequest(generation, connectionId, epoch) && currentWorkspace(target, incarnation) && memory.provider === 'tracker' && !memory.overview && !memory.showContext && memory.workspaceId === target && memory.boardId === id;
        try {
          const fresh = trackerSettings(await transport.trackerRead());
          if (!accepts()) return;
          discardReselectedIssue(fresh);
          updateTracker({ settings: fresh });
          if (fresh.needsReselect.includes(target) || !fresh.workspaces[target]?.includes(id)) { updateTracker({ error: 'trackerReselect' }); return; }
          const board = trackerBoard(await transport.trackerCommand({ op: 'board.read', workspaceId: target, boardId: id, issueKeys: [] }), id);
          if (accepts()) updateTracker({ board, boardUpdatedAt: Date.now() });
        } catch (err) {
          if (validPrivateRequest(generation, connectionId, epoch)) {
            if (err?.code === 'needs_reselect') { invalidateIssueAccess(); return; }
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
        if (memory.pending || memory.uncertain || !closeIssue()) return false;
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
        localRefresh.current();
      }
      function showBoards() {
        if (!setForm(null)) return;
        updateMemory({ workspaceId: '', boardId: '', provider: 'local', statusFilter: '', query: '', assigneeFilter: '["all"]', sessionFilter: 'all', overview: true });
      }
      function editTask(task) { setForm({ kind: 'task', id: task.id, title: task.title, description: task.description || '', statusId: task.statusId, assignee: task.assignee ?? '', assigneeEdited: false }); }
      function open(id, taskId, event) {
        // Recheck the live sources and current relation at activation, not a stale render.
        const liveWorkspaces = workspacesSource.getSnapshot(), liveSessions = sessionsSource.getSnapshot();
        const liveWorkspace = liveWorkspaces.items.find((item) => item.workspaceId === workspaceId);
        if (memory.provider !== 'local' || memory.overview || memory.workspaceId !== workspaceId || memory.boardId !== boardId ||
            liveWorkspaces.phase !== 'ready' || liveWorkspaces.state === 'error' || !liveWorkspace || !Array.isArray(liveWorkspace.sessionIds) || !liveWorkspace.sessionIds.includes(id) ||
            !memory.snapshot?.boards.some((board) => board.workspaceId === workspaceId && board.id === boardId && board.tasks.some((task) => task.id === taskId)) ||
            !memory.snapshot.links.some((link) => link.boardId === boardId && link.taskId === taskId && link.sessionId === id) ||
            sessionState(id, liveSessions, liveWorkspaces) !== 'available') return;
        setSessionMenu(null);
        if (modifiedSessionClick(event)) newTabSession(workspaceId, id);
        else openSession(id);
      }
      function link(id, linked, taskId) {
        if (memory.form && memory.form.kind !== 'links' && memory.dirty && !window.confirm(t('discardDraft'))) return;
        submit({ op: 'link.set', workspaceId, boardId, taskId, sessionId: id, linked });
      }
      function card(task) {
        const taskLinks = linksFor(task.id);
        const memberLinks = workspaceLinksFor(task.id);
        const menuOpen = sessionMenu?.workspaceId === workspaceId && sessionMenu?.boardId === boardId && sessionMenu?.taskId === task.id;
        const menuId = 'dsh-board-sessions-' + encodeURIComponent(workspaceId) + '-' + encodeURIComponent(boardId) + '-' + encodeURIComponent(task.id);
        const membership = workspace && workspace.sessionIds.includes(contextSessionId);
        const isLinked = taskLinks.some((item) => item.sessionId === contextSessionId);
        const unavailable = sessionState(contextSessionId, sessions, workspaces) !== 'available';
        return h('article', { className: 'dsh-board-card', key: task.id },
          h('div', { className: 'dsh-board-card-header' },
            h('button', { className: 'dsh-board-card-title', type: 'button', disabled: busy || uncertain, onClick: () => editTask(task), 'aria-label': t('editTask') + ': ' + task.title, style: { flex: 1, minWidth: 0, justifyContent: 'flex-start', overflowWrap: 'anywhere', textAlign: 'left' } }, task.title),
            mode === 'list' && h('span', { className: 'dsh-board-card-status' }, statuses.find((s) => s.id === task.statusId)?.name || t('statusMissing')),
            memberLinks.length > 0 && h('button', { className: 'dsh-board-whale-button', type: 'button', 'aria-label': (memberLinks.length === 1 ? t('openSession') : t('sessionMenu')) + ': ' + task.title, title: t('sessions'), ...(memberLinks.length > 1 ? { 'aria-haspopup': 'menu', 'aria-expanded': menuOpen, 'aria-controls': menuId } : { 'aria-disabled': sessionState(memberLinks[0].sessionId, sessions, workspaces) !== 'available' }), onClick: event => memberLinks.length === 1 ? open(memberLinks[0].sessionId, task.id, event) : setSessionMenu(menuOpen ? null : { workspaceId, boardId, taskId: task.id, menuId }), onAuxClick: event => { if (event.button === 1 && memberLinks.length === 1) { event.preventDefault(); open(memberLinks[0].sessionId, task.id, event); } } }, h('img', { className: 'dsh-board-whale', src: './favicon.svg', alt: '' })),
            h('button', { className: 'dsh-board-card-action dsh-board-card-action-links dsh-board-count', type: 'button', disabled: busy || uncertain, onClick: () => setForm({ kind: 'links', id: task.id, title: task.title }), 'aria-label': t('sessions') + ': ' + task.title, title: t('sessions'), style: { flex: 'none' } }, h(Icon, { name: 'sessions' }), String(taskLinks.length))),
          menuOpen && memberLinks.length > 1 && h('div', { className: 'dsh-board-session-menu', id: menuId, role: 'menu', 'aria-label': t('sessionMenu') + ': ' + task.title, onKeyDown: (event) => { if (event.key === 'Escape') { event.preventDefault(); setSessionMenu(null); event.currentTarget.parentElement?.querySelector('[aria-haspopup="menu"]')?.focus(); } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')]; const current = items.indexOf(document.activeElement); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next]?.focus(); } } }, memberLinks.map(({ sessionId }) => { const state = sessionState(sessionId, sessions, workspaces); return h('button', { key: sessionId, type: 'button', role: 'menuitem', 'aria-disabled': state !== 'available', onClick: event => open(sessionId, task.id, event), onAuxClick: event => { if (event.button === 1) { event.preventDefault(); open(sessionId, task.id, event); } } }, label(sessionId), state === 'available' ? '' : ' — ' + t(state)); })),
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
                checked && state === 'available' && inWorkspace && h('button', { type: 'button', onClick: () => open(id, form.id), 'aria-label': t('openSession') + ': ' + label(id) }, t('openSession')));
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
      // An issue draft belongs to one connection, workspace incarnation and board.
      // Reselection discards it; ordinary board refresh keeps it independently.
      function closeIssue() {
        const issue = memory.issue;
        if (!issue) return true;
        if (issue.pending) return false;
        if ((issue.dirty || issue.unknown) && !window.confirm(t('discardDraft'))) return false;
        updateMemory({ issue: null });
        return true;
      }
      function issueScope(issue, requireAccess = true) {
        const settings = memory.tracker.settings;
        return Boolean(issue && memory.issue?.token === issue.token && connectionSource.getSnapshot()?.id === issue.connectionId && trackerActive() &&
          memory.provider === 'tracker' && !memory.overview && !memory.showContext && memory.workspaceId === issue.workspaceId && memory.boardId === issue.boardId &&
          currentWorkspace(issue.workspaceId, issue.incarnation) && (!requireAccess || (settings && settings.revision === issue.settingsRevision && !settings.needsReselect.includes(issue.workspaceId) && settings.workspaces[issue.workspaceId]?.includes(issue.boardId))));
      }
      function issuePatch(patch) { if (memory.issue) updateMemory({ issue: { ...memory.issue, ...patch } }); }
      function validIssue(value, key) {
        const status = value?.status, assignee = value?.assignee;
        if (!value || value.key !== key || typeof value.summary !== 'string' || !(value.description === null || typeof value.description === 'string') ||
            !(value.version === null || (Number.isSafeInteger(value.version) && value.version >= 0)) || typeof value.assigneeKnown !== 'boolean' ||
            (value.assigneeKnown && assignee !== null && (!assignee || typeof assignee.id !== 'string' || !assignee.id || typeof assignee.display !== 'string')) ||
            !status || typeof status.id !== 'string' || typeof status.key !== 'string' || typeof status.display !== 'string') throw new Error('invalid response');
        return value;
      }
      function validTransitions(value) {
        if (!Array.isArray(value) || value.some((item) => !item || typeof item.id !== 'string' || !item.id || typeof item.display !== 'string' || !item.to || ['id', 'key', 'display'].some((k) => typeof item.to[k] !== 'string' || !item.to[k])) || new Set(value.map((item) => item.id)).size !== value.length) throw new Error('invalid response');
        return value.map(({ id, display, to }) => ({ id, display, to: { id: to.id, key: to.key, display: to.display } }));
      }
      const validCommentCursor = value => typeof value === 'string' && /^(?:0|[1-9][0-9]{0,15})$/.test(value) && Number.isSafeInteger(Number(value));
      function validComments(value, cursor, seenIds, seenCursors) {
        if (!value || typeof value.complete !== 'boolean' || !Array.isArray(value.comments) || value.comments.length > 100 ||
            (value.complete ? value.nextCursor !== null : value.nextCursor !== null && (!validCommentCursor(value.nextCursor) || cursor !== null && Number(value.nextCursor) <= Number(cursor) || seenCursors.includes(value.nextCursor))) ||
            value.comments.some((c) => !c || typeof c.id !== 'string' || !c.id || typeof c.text !== 'string' || !c.createdBy || typeof c.createdBy.display !== 'string' || typeof c.createdAt !== 'string')) throw new Error('invalid response');
        const ids = new Set(seenIds);
        for (const comment of value.comments) { if (ids.has(comment.id)) throw new Error('invalid response'); ids.add(comment.id); }
        return value;
      }
      function commentInitials(name) {
        return name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase() || '?';
      }
      function commentTime(value) {
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
      }
      // Each bounded turn has a single owner and checks the complete privacy scope on
      // both sides of every await. The server independently revalidates each page.
      async function loadCommentPages(stamp, firstResult) {
        const accepts = () => issueScope(stamp) && memory.issue.generation === stamp.generation && privacyEpoch === stamp.epoch && memory.issue.available && !memory.issue.loading && memory.issue.issue?.id === stamp.issueId && memory.issue.commentsOwner === stamp.owner;
        if (!accepts()) return;
        let result = firstResult;
        for (let page = 0; page < 10; page++) {
          if (!accepts()) return;
          const current = memory.issue, cursor = current.commentsCursor;
          try {
            if (!result) {
              if (!accepts()) return;
              result = { value: await transport.trackerCommand({ op: 'issue.comments', workspaceId: stamp.workspaceId, boardId: stamp.boardId, issueKey: stamp.key, issueId: stamp.issueId, ...(cursor === null ? {} : { cursor }) }) };
              if (!accepts()) return;
            }
            if (result.error) throw result.error;
            const value = validComments(result.value, cursor, current.comments.map(comment => comment.id), current.commentsCursors);
            const bytes = new TextEncoder().encode(JSON.stringify(value.comments)).byteLength;
            if (current.comments.length + value.comments.length > 1000 || current.commentsBytes + bytes > 2 * 1024 * 1024) {
              issuePatch({ commentsState: 'limit', commentsOwner: null }); return;
            }
            const comments = [...current.comments, ...value.comments], totalBytes = current.commentsBytes + bytes;
            const state = value.complete ? 'complete' : comments.length >= 1000 || totalBytes >= 2 * 1024 * 1024 ? 'limit' : value.nextCursor === null ? 'terminalPartial' : page === 9 ? 'partial' : 'loading';
            issuePatch({ comments, commentsBytes: totalBytes, commentsCursor: value.nextCursor, commentsCursors: value.nextCursor === null ? current.commentsCursors : [...current.commentsCursors, value.nextCursor], commentsState: state, ...(state !== 'loading' ? { commentsOwner: null } : {}) });
            if (state !== 'loading') return;
            result = null;
          } catch (error) {
            if (!accepts()) return;
            if (error?.code === 'needs_reselect') invalidateIssueAccess(stamp);
            else if ([401, 403, 404, 409, 412].includes(error?.status) || ['unauthorized', 'forbidden', 'not_found', 'issue_not_in_selected_boards', 'board_not_selected', 'conflict', 'credential_changed', 'credentials_unavailable', 'invalid_credentials', 'scope_expired'].includes(error?.code)) {
              // Revocation, changed identity, or lost membership is not a
              // recoverable page error: do not retain previously visible data.
              const issue = memory.issue, writing = issue.pending && !issue.preflight && !issue.sendOwner;
              if (writing) unknownIssues.add(issueUnknownKey(issue));
              issuePatch({ generation: issue.generation + 1, available: false, comments: [], commentsBytes: 0, commentsCursor: null, commentsCursors: [], commentsState: 'error', commentsOwner: null, unknown: issue.unknown || writing, error: writing ? 'issueUnknown' : 'issueUnavailable' });
            } else issuePatch({ commentsState: error?.message === 'invalid response' ? 'invalid' : 'error', commentsOwner: null });
            return;
          }
        }
      }
      function loadMoreComments() {
        const issue = memory.issue;
        if (!issueScope(issue) || !issue.available || issue.loading || issue.pending || !['partial', 'error'].includes(issue.commentsState)) return;
        const owner = {};
        issuePatch({ commentsState: 'loading', commentsOwner: owner });
        void loadCommentPages({ ...issue, epoch: privacyEpoch, owner });
      }
      function validIssueLinks(value, issue) {
        if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.incomplete !== false || !Array.isArray(value.links) || value.links.length > 10000) return null;
        const seen = new Set();
        for (const link of value.links) {
          if (!link || link.issueKey !== issue.key || link.issueId !== issue.issueId || typeof link.sessionId !== 'string' || !link.sessionId || link.sessionId.length > 256 || seen.has(link.sessionId)) return null;
          seen.add(link.sessionId);
        }
        return value;
      }
      function validBoardLinks(value) {
        return value && Number.isSafeInteger(value.revision) && value.revision >= 0 && value.incomplete === true && Array.isArray(value.links) && value.links.every(link => link && typeof link.issueKey === 'string' && typeof link.issueId === 'string' && Boolean(link.issueId) && typeof link.sessionId === 'string') ? value : null;
      }
      async function loadBoardLinks() {
        const target = memory.workspaceId, board = memory.boardId, connectionId = connectionSource.getSnapshot()?.id, generation = memory.tracker.generation, epoch = privacyEpoch, incarnation = memory.tracker.incarnations[target], linksGeneration = ++boardLinksGeneration;
        const accepts = () => linksGeneration === boardLinksGeneration && validPrivateRequest(generation, connectionId, epoch) && currentWorkspace(target, incarnation) && memory.provider === 'tracker' && !memory.overview && !memory.showContext && memory.workspaceId === target && memory.boardId === board && memory.tracker.settings?.workspaces[target]?.includes(board) && !memory.tracker.settings?.needsReselect.includes(target);
        if (!accepts()) return;
        try {
          let result;
          try { result = await transport.trackerCommand({ op: 'links.read', workspaceId: target, boardId: board }); }
          catch (error) {
            if (error.code !== 'client_rate_limited') throw error;
            await new Promise(resolve => window.setTimeout(resolve, 350));
            if (!accepts()) return;
            result = await transport.trackerCommand({ op: 'links.read', workspaceId: target, boardId: board });
          }
          if (accepts()) updateTracker({ boardLinks: validBoardLinks(result) });
        } catch (err) { if (accepts()) { if (err?.code === 'needs_reselect') invalidateIssueAccess(); else updateTracker({ boardLinks: null }); } }
      }
      useEffect(() => {
        if (!tracker.board || tracker.busy || !trackerActive()) return;
        const timer = window.setTimeout(() => void loadBoardLinks(), 350);
        return () => window.clearTimeout(timer);
      }, [tracker.board, tracker.busy]);
      function invalidateIssueAccess(issue) {
        if (issue && memory.issue?.token !== issue.token) return;
        discardTrackerIssue();
        invalidateTracker(true, false);
        updateTracker({ error: 'trackerReselect' });
        if (trackerActive() && connectionSource.getSnapshot()) void loadTracker();
      }
      async function loadIssue() {
        const issue = memory.issue;
        if (!issueScope(issue) || issue.loading || issue.pending) return;
        const generation = issue.generation + 1, epoch = privacyEpoch;
        // A fetched transition is tied to the read that produced it. Refresh never
        // silently carries that selection over to a potentially different action.
        statusSelection.current = null;
        issuePatch({ loading: true, available: false, generation, transitionId: '', comments: [], commentsBytes: 0, commentsCursor: null, commentsCursors: [], commentsState: 'loading', commentsOwner: null, dirty: Boolean(issue.comment || issue.editComment || issue.linkSessionId || (issue.draft && issue.original && JSON.stringify(issue.draft) !== JSON.stringify(issue.original)) || issue.assigneeEdited), error: issue.unknown ? 'issueUnknown' : '' });
        const accepts = () => issueScope(issue) && memory.issue.generation === generation && privacyEpoch === epoch;
        const command = (op) => transport.trackerCommand({ op, workspaceId: issue.workspaceId, boardId: issue.boardId, issueKey: issue.key, issueId: issue.issueId });
        try {
          const first = validIssue(await command('issue.read'), issue.key);
          if (!accepts()) return;
          const [commentsResult, transitions, linksResult] = await Promise.all([command('issue.comments').then(value => ({ value }), error => ({ error })), command('issue.transitions'), command('links.issue.read').then(value => ({ value }), error => { if (error?.code === 'needs_reselect' || [401, 403, 404, 409, 412].includes(error?.status)) throw error; return { value: null }; })]);
          if (!accepts()) return;
          if (commentsResult.error?.code === 'needs_reselect' || [401, 403, 404, 409, 412].includes(commentsResult.error?.status) || ['unauthorized', 'forbidden', 'not_found', 'issue_not_in_selected_boards', 'board_not_selected', 'conflict', 'credential_changed', 'credentials_unavailable', 'invalid_credentials', 'scope_expired'].includes(commentsResult.error?.code)) throw commentsResult.error;
          const fresh = validIssue(await command('issue.read'), issue.key), safeTransitions = validTransitions(transitions);
          if (!accepts()) return;
          if (!issue.issueId || first.id !== issue.issueId || fresh.id !== issue.issueId || !Number.isSafeInteger(first.version) || !Number.isSafeInteger(fresh.version) || first.version !== fresh.version || first.status.id !== fresh.status.id || first.status.key !== fresh.status.key) { if (accepts()) issuePatch({ loading: false, available: false, error: 'issueConflict' }); return; }
          const rawLinks = linksResult.value;
          const links = validIssueLinks(rawLinks, issue);
          if (!accepts()) return;
          const current = memory.issue, freshOriginal = { summary: fresh.summary, description: fresh.description ?? '', assignee: fresh.assigneeKnown ? (fresh.assignee?.id || '') : '' };
          // Preserve the draft's CAS baseline across refresh; never silently rebase edits.
          const original = current.dirty && current.original ? current.original : freshOriginal;
          const draft = current.dirty && current.draft ? current.draft : { ...freshOriginal };
          const liveVersion = fresh.version;
          if (current.dirty && current.issue) fresh.version = current.issue.version;
          const owner = {};
          issuePatch({ loading: false, available: true, original, draft, liveVersion, issue: fresh, commentsOwner: owner, transitions: safeTransitions, links, transitionId: current.transitionId || '', conflict: Boolean(current.conflict), error: current.unknown ? 'issueUnknown' : current.conflict ? 'issueConflict' : '', dirty: Boolean(current.dirty) });
          void loadCommentPages({ ...issue, generation, epoch, owner }, commentsResult);
        } catch (err) {
          if (accepts()) {
            if (err?.code === 'needs_reselect') invalidateIssueAccess(issue);
            else issuePatch({ loading: false, available: false, error: 'trackerError' });
          }
        }
      }
      function openIssue(issue) {
        if (!/^[A-Z][A-Z0-9_]{0,31}-[1-9][0-9]{0,14}$/.test(issue.key) || typeof issue.id !== 'string' || !issue.id || memory.tracker.busy || !setForm(null)) return;
        const connectionId = connectionSource.getSnapshot()?.id, incarnation = memory.tracker.incarnations[workspaceId];
        if (connectionId === undefined || !currentWorkspace(workspaceId, incarnation) || !memory.tracker.settings || memory.tracker.settings.needsReselect.includes(workspaceId) || !memory.tracker.settings.workspaces[workspaceId]?.includes(boardId)) return;
        const draft = { token: {}, generation: 0, workspaceId, boardId, key: issue.key, issueId: issue.id || '', connectionId, incarnation, settingsRevision: memory.tracker.settings.revision, draft: null, comment: '', editComment: null, transitionId: '', linkSessionId: '', addingSession: false, sendTargets: [], sendResult: null, savedComment: null, editingFields: false, dirty: false, pending: false, unknown: false, loading: false, available: false, error: '', notice: '' };
        draft.unknown = unknownIssues.has(issueUnknownKey(draft));
        issueOrigin.current = document.activeElement;
        setSessionMenu(null);
        updateMemory({ issue: draft });
        void loadIssue();
      }
      function editIssue(key, value) {
        const current = memory.issue;
        if (!current || !issueScope(current) || !current.available || current.pending) return;
        const next = key === 'comment' || key === 'transitionId' || key === 'linkSessionId' ? { [key]: value } : { draft: { ...current.draft, [key]: value }, ...(key === 'assignee' ? { assigneeEdited: true } : {}) };
        issuePatch({ ...next, dirty: true, notice: '' });
      }
      const sameStatus = (a, b) => Boolean(a && b && a.id === b.id && a.key === b.key && a.display === b.display);
      function validStatusSelection(selection, pending = false) {
        const current = memory.issue;
        return Boolean(selection && statusSelection.current === selection && issueScope(current) && current.token === selection.token &&
          current.generation === selection.generation && privacyEpoch === selection.epoch && current.available && !current.loading &&
          current.pending === pending && !current.unknown && !current.conflict && current.issueId === selection.issueId && current.issue?.id === selection.issueId &&
          current.liveVersion === selection.version && sameStatus(current.issue.status, selection.from) && current.transitionId === selection.id &&
          current.transitions.some(item => item.id === selection.id && item.display === selection.display && sameStatus(item.to, selection.to)));
      }
      const safeIssueText = (value, max, multiline = false, empty = false) => typeof value === 'string' && value.length <= max && (empty || Boolean(value.trim())) && !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u : /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u).test(value);
      async function saveIssue(kind, unlink = null) {
        const issue = memory.issue;
        if (!issueScope(issue) || !issue.available || issue.pending || issueMutationPending || issue.unknown || issue.conflict || issue.loading) return;
        const base = { workspaceId: issue.workspaceId, boardId: issue.boardId, issueKey: issue.key, issueId: issue.issueId };
        let command, selection;
        if (kind === 'fields') {
          const { draft, original } = issue, changes = { expectedVersion: issue.issue.version };
          if (!Number.isSafeInteger(changes.expectedVersion) || !safeIssueText(draft.summary, 4096) || !safeIssueText(draft.description, 48 * 1024, true, true) || !safeIssueText(draft.assignee, 128, false, true)) { issuePatch({ error: 'issueInvalid' }); return; }
          if (draft.summary !== original.summary) changes.summary = draft.summary;
          if (draft.description !== original.description) changes.description = draft.description;
          if (issue.assigneeEdited && (draft.assignee !== original.assignee || !issue.issue.assigneeKnown)) changes.assignee = draft.assignee.trim() || null;
          if (Object.keys(changes).length === 1) return;
          command = { op: 'issue.update', ...base, changes };
        } else if (kind === 'comment') {
          if (issue.savedComment === issue.comment) return;
          if (!safeIssueText(issue.comment, 48 * 1024, true)) { issuePatch({ error: 'issueInvalid' }); return; }
          command = { op: 'issue.comment', ...base, text: issue.comment };
        } else if (kind === 'editComment') {
          const edit = issue.editComment;
          if (!edit || !Number.isSafeInteger(edit.version) || edit.version < 0 || !safeIssueText(edit.text, 48 * 1024, true)) { issuePatch({ error: 'issueInvalid' }); return; }
          if (edit.text === edit.original) return;
          command = { op: 'issue.editComment', ...base, commentId: edit.id, expectedVersion: edit.version, text: edit.text };
        } else if (kind === 'link') {
          const linked = !unlink, sessionId = unlink?.sessionId || issue.linkSessionId;
          const validLinkChange = () => {
            const current = memory.issue, ws = workspacesSource.getSnapshot(), sess = sessionsSource.getSnapshot(), member = ws.items.find(item => item.workspaceId === issue.workspaceId);
            return current === issue && issueScope(current) && current.available && !current.loading && !current.pending && !current.unknown && !current.conflict && !issueMutationPending &&
              current.generation === generation && privacyEpoch === epoch && memory.tracker.generation === trackerGeneration && current.links === links &&
              Boolean(current.issueId && current.issue?.id === current.issueId && sessionId && ws.phase === 'ready' && ws.state !== 'error' && member?.sessionIds?.includes(sessionId) && sessionState(sessionId, sess, ws) === 'available') &&
              linked !== links.links.some(link => link.issueKey === current.key && link.issueId === current.issueId && link.sessionId === sessionId) &&
              (linked ? current.linkSessionId === sessionId : unlink.token === current.token && unlink.generation === current.generation && unlink.epoch === privacyEpoch && unlink.trackerGeneration === memory.tracker.generation && unlink.links === links);
          };
          const generation = issue.generation, epoch = privacyEpoch, trackerGeneration = memory.tracker.generation, links = issue.links;
          if (!links || !validLinkChange()) return;
          if (!linked && (!window.confirm(t('issueConfirmUnlinkSession') + ' ' + label(sessionId)) || !validLinkChange())) return;
          ++boardLinksGeneration;
          updateTracker({ boardLinks: null });
          command = { op: 'links.set', workspaceId: issue.workspaceId, boardId: issue.boardId, issueKey: issue.key, issueId: issue.issueId, sessionId, linked, expectedRevision: links.revision };
        } else {
          selection = statusSelection.current;
          if (!validStatusSelection(selection) || !Number.isSafeInteger(selection.version) || !window.confirm(t('issueConfirmTransition') + ' ' + selection.display + ': ' + selection.from.display + ' → ' + selection.to.display)) return;
          // confirm() can synchronously trigger navigation, reauthorization or other state changes.
          if (!validStatusSelection(selection) || issueMutationPending) return;
          command = { op: 'issue.transition', ...base, transitionId: selection.id, expectedTo: selection.to };
        }
        if (new TextEncoder().encode(JSON.stringify(command)).byteLength > 64 * 1024) { issuePatch({ error: 'tooLarge' }); return; }
        const epoch = privacyEpoch, generation = issue.generation;
        issueMutationPending = true;
        if (kind !== 'transition') unknownIssues.add(issueUnknownKey(issue));
        issuePatch({ pending: true, ...(kind === 'transition' ? { preflight: true } : {}), error: '', notice: '' });
        const accepts = () => issueScope(issue) && memory.issue.generation === generation && privacyEpoch === epoch;
        if (kind === 'transition') {
          try {
            let timer;
            const fresh = validIssue(await Promise.race([
              transport.trackerCommand({ op: 'issue.read', ...base }),
              new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('preflight timeout')), 15000); }),
            ]).finally(() => window.clearTimeout(timer)), issue.key);
            if (!validStatusSelection(selection, true)) return;
            if (fresh.id !== selection.issueId || fresh.version !== selection.version || !sameStatus(fresh.status, selection.from)) {
              issuePatch({ pending: false, preflight: false, conflict: true, conflictKind: 'transition', error: 'issueConflict' }); return;
            }
          } catch (err) {
            if (accepts()) {
              if (err?.code === 'needs_reselect') invalidateIssueAccess(issue);
              else { statusSelection.current = null; issuePatch({ pending: false, preflight: false, error: 'trackerError' }); }
            }
            return;
          } finally {
            if (!validStatusSelection(selection, true)) {
              issueMutationPending = false;
              if (memory.issue?.token === issue.token && memory.issue.preflight) issuePatch({ pending: false, preflight: false });
            }
          }
          if (!validStatusSelection(selection, true)) { issueMutationPending = false; return; }
          issuePatch({ preflight: false });
          unknownIssues.add(issueUnknownKey(issue));
        }
        try {
          const receipt = await transport.trackerCommand(command);
          if (!accepts()) return;
          if (kind === 'fields' && (!Number.isSafeInteger(receipt?.version) || receipt.version < 0) || kind === 'comment' && (typeof receipt?.id !== 'string' || !receipt.id) || kind === 'editComment' && (receipt?.id !== command.commentId || !Number.isSafeInteger(receipt?.version) || receipt.version < 0) || kind === 'transition' && receipt?.ok !== true || kind === 'link' && (!Number.isSafeInteger(receipt?.revision) || ![command.expectedRevision, command.expectedRevision + 1].includes(receipt.revision))) throw new Error('invalid receipt');
          unknownIssues.delete(issueUnknownKey(issue));
          const current = memory.issue;
          if (kind === 'fields') issuePatch({ pending: false, original: { ...current.draft }, issue: { ...current.issue, version: receipt.version }, assigneeEdited: false, dirty: Boolean(current.comment || current.editComment || current.transitionId || current.linkSessionId), notice: 'issueSaved' });
          else if (kind === 'comment') { const keep = current.sendTargets?.length > 0; issuePatch({ pending: false, savedComment: keep ? current.comment : null, comment: keep ? current.comment : '', dirty: Boolean(keep || current.editComment || current.transitionId || current.linkSessionId || JSON.stringify(current.draft) !== JSON.stringify(current.original) || current.assigneeEdited), notice: keep ? 'sessionSendSaved' : 'issueSaved' }); }
          else if (kind === 'editComment') issuePatch({ pending: false, editComment: null, dirty: Boolean(current.comment || current.transitionId || current.linkSessionId || JSON.stringify(current.draft) !== JSON.stringify(current.original) || current.assigneeEdited), notice: 'issueSaved' });
          else if (kind === 'transition') issuePatch({ pending: false, transitionId: '', dirty: Boolean(current.comment || current.editComment || current.linkSessionId || JSON.stringify(current.draft) !== JSON.stringify(current.original) || current.assigneeEdited), notice: 'issueSaved' });
          else { issuePatch({ pending: false, ...(command.linked ? { linkSessionId: '', addingSession: false } : {}), dirty: Boolean(current.comment || current.editComment || current.transitionId || (!command.linked && current.linkSessionId) || JSON.stringify(current.draft) !== JSON.stringify(current.original) || current.assigneeEdited), notice: 'issueSaved' }); updateTracker({ boardLinks: null }); void loadBoardLinks(); }
          issueMutationPending = false;
          void loadIssue();
        } catch (err) {
          if (!accepts()) return;
          if (err?.code === 'needs_reselect') { invalidateIssueAccess(issue); return; }
          const conflict = err.status === 409 || err.status === 412 || /conflict|precondition|transition_not_available/.test(err.code || '');
          const unknown = !conflict && (!(err.status >= 400 && err.status < 500) || err.status === 499 || err.code === 'outcome_unknown');
          if (unknown) unknownIssues.add(issueUnknownKey(issue)); else unknownIssues.delete(issueUnknownKey(issue));
          issuePatch({ pending: false, unknown, conflict, conflictKind: conflict ? kind : '', error: unknown ? 'issueUnknown' : conflict ? 'issueConflict' : 'issueRejected' });
        } finally {
          issueMutationPending = false;
          if (memory.issue?.token === issue.token && memory.issue.pending) { unknownIssues.add(issueUnknownKey(issue)); issuePatch({ pending: false, unknown: true, error: 'issueUnknown' }); }
        }
      }
      function discardCommentEdit(reload = false) {
        const current = memory.issue;
        if (!issueScope(current) || !current.available || current.pending || !current.editComment || !window.confirm(t('discardDraft'))) return;
        const commentConflict = current.conflict && current.conflictKind === 'editComment';
        issuePatch({ editComment: null, ...(commentConflict ? { conflict: false, conflictKind: '', error: '' } : {}),
          dirty: Boolean(current.comment || current.transitionId || current.linkSessionId || JSON.stringify(current.draft) !== JSON.stringify(current.original) || current.assigneeEdited) });
        if (reload || commentConflict) void loadIssue();
      }
      function commentEditor(issue) {
        const edit = issue.editComment;
        return h(React.Fragment, null,
          h('p', { className: 'dsh-board-alert' }, t('issueCommentRaceWarning')),
          h('label', null, t('issueEditCommentText'), h('textarea', { value: edit.text, maxLength: 48 * 1024, readOnly: issue.pending, onChange: e => { const current = memory.issue; if (issueScope(current) && current.available && !current.pending && current.editComment?.id === edit.id) issuePatch({ editComment: { ...current.editComment, text: e.target.value }, dirty: true, notice: '' }); } })),
          h('button', { type: 'button', disabled: issue.pending || issue.unknown || issue.conflict || !edit.text.trim(), onClick: () => saveIssue('editComment') }, t('issueSaveCommentEdit')),
          h('button', { type: 'button', disabled: issue.pending, 'aria-label': t('cancel') + ': ' + t('issueEditComment'), onClick: () => discardCommentEdit() }, t('cancel')));
      }
      function openIssueSession(stamp, id, event) {
        // The drawer has its own link snapshot; boardLinks may be absent or stale.
        const current = memory.issue, ws = workspacesSource.getSnapshot(), sess = sessionsSource.getSnapshot();
        const owner = ws.items.find(item => item.workspaceId === stamp.workspaceId);
        if (!current || current.token !== stamp.token || current.generation !== stamp.generation || memory.tracker.generation !== stamp.trackerGeneration || privacyEpoch !== stamp.privacyEpoch ||
            !issueScope(current) || !current.available || current.loading || current.pending || current.unknown ||
            current.workspaceId !== stamp.workspaceId || current.key !== stamp.key || current.issueId !== stamp.issueId || !current.issueId || current.issue?.id !== current.issueId ||
            !current.links?.links.some(link => link.issueKey === stamp.key && link.issueId === stamp.issueId && link.sessionId === id) ||
            ws.phase !== 'ready' || ws.state === 'error' || !Array.isArray(owner?.sessionIds) || !owner.sessionIds.includes(id) || sessionState(id, sess, ws) !== 'available') return;
        if (modifiedSessionClick(event)) newTabSession(stamp.workspaceId, id);
        else openSession(id);
      }
      function toggleIssueAddSession(stamp) {
        const current = memory.issue;
        if (!issueScope(current) || current.token !== stamp.token || current.generation !== stamp.generation || privacyEpoch !== stamp.privacyEpoch || memory.tracker.generation !== stamp.trackerGeneration || !current.available || current.loading || current.pending || !current.links || current.links !== stamp.links) return;
        if (current.addingSession && current.linkSessionId && !window.confirm(t('discardDraft'))) return;
        if (memory.issue !== current || !issueScope(current) || current.generation !== stamp.generation || privacyEpoch !== stamp.privacyEpoch || memory.tracker.generation !== stamp.trackerGeneration || current.pending || current.links !== stamp.links) return;
        issuePatch({ addingSession: !current.addingSession, ...(current.addingSession ? { linkSessionId: '', dirty: Boolean(current.comment || current.editComment || current.transitionId || JSON.stringify(current.draft) !== JSON.stringify(current.original) || current.assigneeEdited) } : {}) });
      }
      async function sendIssueToSessions() {
        const initial = memory.issue;
        if (!sessionService || typeof sessionService.using !== 'function' || !issueScope(initial) || !initial.available || initial.loading || initial.pending || initial.unknown || initial.conflict || issueMutationPending || !initial.links) return;
        const selected = [...(initial.sendTargets || [])], text = initial.comment, revision = initial.links.revision;
        if (!safeIssueText(text, 48 * 1024, true) || new TextEncoder().encode(text).byteLength > 48 * 1024 || !selected.length || selected.length > 20 || new Set(selected).size !== selected.length) { issuePatch({ error: 'issueInvalid' }); return; }
        const stamp = { ...initial, trackerGeneration: memory.tracker.generation, epoch: privacyEpoch };
        const key = id => sessionSendKey(stamp, id, text);
        const scopeValid = () => Boolean(issueScope(stamp) && memory.issue.generation === stamp.generation && memory.tracker.generation === stamp.trackerGeneration && privacyEpoch === stamp.epoch && memory.issue.available && !memory.issue.loading && memory.issue.issue?.id === stamp.issueId);
        const localValid = id => {
          const current = memory.issue, ws = workspacesSource.getSnapshot(), catalog = sessionsSource.getSnapshot();
          const owner = ws?.items?.find(item => item.workspaceId === stamp.workspaceId);
          return Boolean(scopeValid() && current.comment === text && current.links?.revision === revision && current.links.links.some(link => link.issueKey === stamp.key && link.issueId === stamp.issueId && link.sessionId === id) && ws.phase === 'ready' && ws.state !== 'error' && owner?.sessionIds?.includes(id) && sessionState(id, catalog, ws) === 'available');
        };
        const unreserved = () => selected.every(id => !sessionSendLedger.has(key(id)));
        if (!unreserved() || !selected.every(localValid) || !window.confirm(t('sessionSendConfirm') + '\n\n' + selected.map(id => label(id)).join('\n') + '\n\n' + text)) return;
        if (!unreserved() || !selected.every(localValid) || memory.issue.pending || issueMutationPending) return;
        // Without a dispatch callback, reserve all targets until the helper returns.
        // On an unexpected exception the conservative outcome is unknown, not unsent.
        selected.forEach(id => sessionSendLedger.set(key(id), 'inflight'));
        issueMutationPending = true;
        issuePatch({ pending: true, sendOwner: stamp, sendResult: { state: 'stopped', targets: selected.map(id => ({ id, status: 'inflight' })) }, notice: '' });
        const validateSession = async id => {
          if (!localValid(id)) return false;
          try {
            const result = validIssueLinks(await transport.trackerCommand({ op: 'links.issue.read', workspaceId: stamp.workspaceId, boardId: stamp.boardId, issueKey: stamp.key, issueId: stamp.issueId }), { key: stamp.key, issueId: stamp.issueId });
            return Boolean(result && localValid(id) && result.revision === revision && result.links.some(link => link.sessionId === id));
          } catch { return false; }
        };
        const record = (result, final = false) => {
          for (const item of result.targets) {
            if (item.status === 'accepted' || item.status === 'unknown') sessionSendLedger.set(key(item.id), item.status);
            else if (final && item.status === 'not-sent') sessionSendLedger.delete(key(item.id));
          }
          if (scopeValid()) issuePatch({ ...(final ? { pending: false, sendTargets: selected.filter(id => !sessionSendLedger.has(key(id))) } : {}), sendResult: { state: result.state, targets: selected.map(id => ({ id, status: sessionSendLedger.get(key(id)) || 'not-sent' })) } });
        };
        try {
          const sender = createSessionSender({ sessions: sessionService, validateSession });
          const result = await sender.send(selected, text, { onProgress: result => record(result) });
          record(result, true);
        } catch {
          selected.forEach(id => { if (sessionSendLedger.get(key(id)) === 'inflight') sessionSendLedger.set(key(id), 'unknown'); });
          if (scopeValid()) issuePatch({ pending: false, sendResult: { state: 'unknown', targets: selected.map(id => ({ id, status: sessionSendLedger.get(key(id)) || 'not-sent' })) } });
        } finally {
          issueMutationPending = false;
          // Release only this operation's lock, even when its scope was hidden or
          // invalidated; never repaint its private result into a stale drawer.
          if (memory.issue?.token === stamp.token && memory.issue.sendOwner === stamp) issuePatch({ pending: false, sendOwner: null });
        }
      }
      function reviewSessionSend(issue, id) {
        const text = issue.comment, key = sessionSendKey(issue, id, text), epoch = privacyEpoch, generation = issue.generation, trackerGeneration = memory.tracker.generation;
        const valid = () => issueScope(issue) && memory.issue.generation === generation && privacyEpoch === epoch && memory.tracker.generation === trackerGeneration && memory.issue.available && !memory.issue.loading && !memory.issue.pending && memory.issue.comment === text && sessionSendLedger.get(key) === 'unknown';
        if (!valid() || !window.confirm(t('sessionSendReviewConfirm') + '\n\n' + label(id)) || !valid()) return;
        sessionSendLedger.delete(key);
        issuePatch({ sendResult: null });
      }
      function issueView() {
        const issue = memory.issue;
        if (!issue || memory.provider !== 'tracker' || overview || showContext) return null;
        const visible = issue.available && issueScope(issue) && connection && trackerLive(workspaceId);
        const retryAvailable = issueScope(issue) && !issue.loading && !issue.pending;
        const sessionStamp = { token: issue.token, generation: issue.generation, trackerGeneration: memory.tracker.generation, privacyEpoch, epoch: privacyEpoch, workspaceId: issue.workspaceId, key: issue.key, issueId: issue.issueId, links: issue.links };
        const statusOpen = visible && statusPopover === issue.token;
        const statusDisabled = issue.pending || issue.unknown || issue.conflict || issue.loading || issueMutationPending || !issue.issueId || issue.issue?.id !== issue.issueId || !issue.transitions?.length;
        const closeStatus = () => { setStatusPopover(null); statusSelection.current = null; const current = memory.issue; if (issueScope(current) && current.available && !current.pending && !current.unknown && !current.conflict && current.transitionId) issuePatch({ transitionId: '', dirty: Boolean(current.comment || current.editComment || current.linkSessionId || JSON.stringify(current.draft) !== JSON.stringify(current.original) || current.assigneeEdited) }); statusButton.current?.focus(); };
        return h('aside', { className: 'dsh-board-drawer dsh-board-tracker-drawer', style: { width: drawerWidth() + 'px' }, 'aria-label': t('issueDetails'), onKeyDown: (event) => { if (event.key === 'Escape') { event.preventDefault(); if (statusOpen) closeStatus(); else closeIssue(); } } },
          resizeHandle(), h('div', { className: 'dsh-board-tracker-head' },
            h('h2', { ref: issueHeading, tabIndex: -1 }, visible ? h('a', { href: 'https://tracker.yandex.ru/' + encodeURIComponent(issue.key), target: '_blank', rel: 'noopener noreferrer' }, issue.key, ' ↗') : t('issueDetails')),
            h('div', { className: 'dsh-board-tracker-head-actions' },
              visible && !issue.editingFields && h('button', { ref: issueEditButton, type: 'button', disabled: issue.pending, onClick: () => { issueFocusRequest.current = { token: issue.token, editing: true }; issuePatch({ editingFields: true }); } }, t('edit')),
              h('button', { type: 'button', disabled: !retryAvailable, onClick: loadIssue }, t('issueReload')),
              h('button', { className: 'dsh-board-tracker-close', type: 'button', disabled: issue.pending, 'aria-label': t('close'), title: t('close'), onClick: closeIssue }, '×'))),
          h('div', { className: 'dsh-board-tracker-body' },
            !visible ? h('p', { role: 'status' }, t(issue.loading ? 'loading' : issue.error || 'issueUnavailable')) : h(React.Fragment, null,
              h('div', { className: 'dsh-board-tracker-hero' }, h('h3', null, issue.issue.summary),
                h('div', { className: 'dsh-board-tracker-meta' },
                  h('div', { style: { position: 'relative' } },
                    h('button', { ref: statusButton, className: 'dsh-board-tracker-status', type: 'button', disabled: statusDisabled, 'aria-label': t('issueChangeStatus') + ': ' + issue.issue.status.display, 'aria-expanded': Boolean(statusOpen), 'aria-controls': 'dsh-board-issue-transitions', title: !issue.transitions.length ? t('issueTransitionsUnavailable') : t('issueChangeStatus'), onClick: () => { const current = memory.issue; if (!issueScope(current) || !current.available || current.pending || current.unknown || current.conflict || current.loading || issueMutationPending || current.issue?.id !== current.issueId || !current.transitions.length) return; if (statusOpen) closeStatus(); else setStatusPopover(current.token); } }, issue.issue.status.display),
                    !issue.transitions.length && h('span', { className: 'dsh-board-muted' }, t('issueTransitionsUnavailable')),
                    statusOpen && h('div', { id: 'dsh-board-issue-transitions', className: 'dsh-board-session-menu', role: 'group', 'aria-label': t('issueTransitions'), style: { position: 'absolute', zIndex: 2 } },
                      issue.transitions.map((transition, index) => h('button', { key: transition.id, ref: index === 0 ? statusFirstOption : undefined, type: 'button', disabled: statusDisabled, 'aria-pressed': issue.transitionId === transition.id, onClick: () => { const current = memory.issue; if (!issueScope(current) || !current.available || current.pending || current.unknown || current.conflict || current.loading || issueMutationPending || current.issue?.id !== current.issueId || !current.transitions.some(item => item.id === transition.id && item.display === transition.display && item.to.id === transition.to.id && item.to.key === transition.to.key && item.to.display === transition.to.display)) return; statusSelection.current = Object.freeze({ token: current.token, generation: current.generation, epoch: privacyEpoch, issueId: current.issueId, version: current.liveVersion, id: transition.id, display: transition.display, to: Object.freeze({ ...transition.to }), from: Object.freeze({ ...current.issue.status }) }); editIssue('transitionId', transition.id); } }, transition.display, ' → ', transition.to.display)),
                      h('button', { type: 'button', disabled: statusDisabled || !issue.transitions.some(item => item.id === issue.transitionId) || statusSelection.current?.token !== issue.token || statusSelection.current?.generation !== issue.generation || statusSelection.current?.id !== issue.transitionId, onClick: () => { const current = memory.issue, selection = statusSelection.current; if (!selection || !issueScope(current) || !current.available || current.token !== selection.token || current.generation !== selection.generation || current.transitionId !== selection.id) return; void saveIssue('transition'); } }, t('issueChangeStatus')))),
                  h('p', null, t('assignee'), ': ', h('strong', null, issue.issue.assigneeKnown ? (issue.issue.assignee?.display || t('unassigned')) : t('assigneeUnknown'))))),
              h('div', { className: 'dsh-board-tracker-notices' },
                issue.error && h('p', { role: 'alert' }, t(issue.error)), issue.notice && h('p', { role: 'status' }, t(issue.notice)),
                issue.unknown && h('button', { type: 'button', onClick: () => { if (window.confirm(t('issueUnknown'))) { unknownIssues.delete(issueUnknownKey(issue)); issuePatch({ unknown: false, error: '' }); } } }, t('issueReview')),
                issue.conflict && h('button', { type: 'button', onClick: () => { if (window.confirm(t('discardDraft'))) { issuePatch({ conflict: false, conflictKind: '', available: false, draft: null, original: null, dirty: Boolean(issue.comment || issue.editComment || issue.transitionId || issue.linkSessionId), assigneeEdited: false }); void loadIssue(); } } }, t('issueDiscardConflict')),
                issue.conflict && issue.conflictKind === 'editComment' && issue.editComment && h('button', { type: 'button', onClick: () => discardCommentEdit(true) }, t('issueDiscardCommentConflict'))),
              h('p', { className: 'dsh-board-tracker-separate' }, t('issueSeparateOperations')),
              !issue.editingFields && issue.draft && issue.original && (JSON.stringify(issue.draft) !== JSON.stringify(issue.original) || (issue.assigneeEdited && !issue.issue.assigneeKnown)) && h('p', { className: 'dsh-board-tracker-draft', role: 'status' }, t('unsaved')),
              h('section', { className: 'dsh-board-tracker-section' },
                h('h3', null, t('description')),
                issue.editingFields ? h(React.Fragment, null,
                  h('label', null, t('title'), h('input', { ref: issueTitleInput, value: issue.draft.summary, maxLength: 4096, readOnly: issue.pending, onChange: (e) => editIssue('summary', e.target.value) })),
                  h('label', null, t('description'), h('textarea', { value: issue.draft.description, maxLength: 48 * 1024, readOnly: issue.pending, onChange: (e) => editIssue('description', e.target.value) })),
                  h('label', null, t('issueAssigneeId'), h('input', { value: issue.draft.assignee, maxLength: 128, readOnly: issue.pending, onChange: (e) => editIssue('assignee', e.target.value) })),
                  !issue.issue.assigneeKnown && h('p', null, t('assigneeUnknown')), issue.issue.version === null && h('p', null, t('issueVersionUnavailable')),
                  h('div', { className: 'dsh-board-row' }, h('button', { className: 'dsh-board-primary', type: 'button', disabled: issue.pending || issue.unknown || issue.conflict || issue.issue.version === null, onClick: () => saveIssue('fields') }, t('issueSaveFields')), h('button', { type: 'button', disabled: issue.pending, onClick: () => { issueFocusRequest.current = { token: issue.token, editing: false }; issuePatch({ editingFields: false }); } }, t('issueKeepDraft')))) :
                  renderTrackerText(issue.issue.description || t('emptyDescription'))),
              h('section', { className: 'dsh-board-tracker-section' }, h('h3', null, t('sessions')), issue.links ? h(React.Fragment, null,
                h('p', { className: 'dsh-board-muted' }, t('issueSessionPartial')),
                h('ul', { className: 'dsh-board-tracker-list' }, issue.links.links.filter(link => issue.issueId && issue.issue?.id === issue.issueId && link.issueId === issue.issueId && link.issueKey === issue.key && workspace?.sessionIds?.includes(link.sessionId)).map(link => {
                  const state = sessionState(link.sessionId, sessions, workspaces);
                  const unavailable = state !== 'available' || issue.loading || issue.pending || issue.unknown;
                  return h('li', { className: 'dsh-board-tracker-session', key: link.sessionId }, unavailable ? h('span', null, label(link.sessionId), ' — ', t(state !== 'available' ? state : 'issueUnavailable')) : h('button', { className: 'dsh-board-tracker-session-link', type: 'button', role: 'link', onClick: event => openIssueSession(sessionStamp, link.sessionId, event), onAuxClick: event => { if (event.button === 1) { event.preventDefault(); openIssueSession(sessionStamp, link.sessionId, event); } } }, label(link.sessionId)),
                    h('button', { type: 'button', className: 'dsh-board-tracker-session-unlink', disabled: unavailable || issue.conflict, 'aria-label': t('issueUnlinkSession') + ': ' + label(link.sessionId), onClick: () => saveIssue('link', { ...sessionStamp, sessionId: link.sessionId }) }, t('issueUnlinkSession')));
                })),
                issue.links.links.length > 0 && h('button', { type: 'button', disabled: issue.pending, 'aria-expanded': Boolean(issue.addingSession), 'aria-label': t(issue.addingSession ? 'issueCancelAddSession' : 'issueAddSession'), onClick: () => toggleIssueAddSession(sessionStamp) }, issue.addingSession ? t('issueCancelAddSession') : '+'),
                (issue.links.links.length === 0 || issue.addingSession) && h(React.Fragment, null,
                  h('label', null, t('issueChooseSession'), h('select', { value: issue.linkSessionId, disabled: issue.pending, onChange: e => editIssue('linkSessionId', e.target.value) }, h('option', { value: '' }, t('issueChooseSession')), availableSessions.filter(id => sessionState(id, sessions, workspaces) === 'available' && !issue.links.links.some(link => link.sessionId === id)).map(id => h('option', { key: id, value: id }, label(id))))),
                  h('button', { type: 'button', disabled: issue.pending || issue.unknown || issue.conflict || !issue.issueId || issue.issue?.id !== issue.issueId || !issue.linkSessionId, onClick: () => saveIssue('link') }, t('issueLinkSave')))) : h('p', null, t('issueLinkUnavailable'))),
              h('section', { className: 'dsh-board-tracker-section' }, h('h3', null, t('issueComments')), h('div', { className: 'dsh-board-comment-summary', role: 'status' }, h('strong', null, t('issueCommentsLoaded'), ' ', String(issue.comments.length)), h('span', null, t(({ loading: 'issueCommentsLoading', complete: 'issueCommentsComplete', partial: 'issueCommentsPartial', terminalPartial: 'issueCommentsTerminalPartial', error: 'issueCommentsError', invalid: 'issueCommentsInvalid', limit: 'issueCommentsLimit' })[issue.commentsState]))),
                h('div', { className: 'dsh-board-comment-composer' }, h('label', null, t('issueNewComment'), h('textarea', { value: issue.comment, maxLength: 48 * 1024, readOnly: issue.pending, onChange: (e) => editIssue('comment', e.target.value) })), h('button', { className: 'dsh-board-primary', type: 'button', disabled: issue.pending || issue.unknown || issue.conflict || !issue.comment.trim() || issue.savedComment === issue.comment, onClick: () => saveIssue('comment') }, t('issueAddComment')),
                  issue.links && issue.links.links.length > 0 && h(React.Fragment, null,
                    h('fieldset', { disabled: issue.pending }, h('legend', null, t('sessionSendChoose')), issue.links.links.filter(link => workspace?.sessionIds?.includes(link.sessionId) && link.issueKey === issue.key && link.issueId === issue.issueId).map(link => {
                      const id = link.sessionId, status = sessionSendLedger.get(sessionSendKey(issue, id, issue.comment));
                      return h('div', { key: id }, h('label', null, h('input', { type: 'checkbox', checked: (issue.sendTargets || []).includes(id), disabled: sessionState(id, sessions, workspaces) !== 'available' || Boolean(status), onChange: e => { const current = memory.issue; if (!issueScope(current) || current.pending || sessionSendLedger.has(sessionSendKey(current, id, current.comment)) || !current.links?.links.some(item => item.sessionId === id && item.issueId === current.issueId)) return; const ids = current.sendTargets || []; issuePatch({ sendTargets: e.target.checked ? [...new Set([...ids, id])] : ids.filter(item => item !== id), sendResult: null }); } }), label(id)), status && h('span', { role: 'status' }, ' — ', t(status === 'accepted' ? 'sessionSendAccepted' : status === 'unknown' ? 'sessionSendUnknown' : 'sessionSendInflight')), status === 'unknown' && h('button', { type: 'button', disabled: issue.pending, onClick: () => reviewSessionSend(issue, id) }, t('sessionSendReview')));
                    })),
                    h('p', { className: 'dsh-board-muted' }, t('sessionSendWarning')),
                    typeof sessionService?.using !== 'function' && h('p', null, t('sessionSendUnavailable')),
                    h('button', { type: 'button', disabled: issue.pending || issue.unknown || issue.conflict || !issue.comment.trim() || !(issue.sendTargets || []).length || issue.sendTargets.some(id => sessionSendLedger.has(sessionSendKey(issue, id, issue.comment))) || typeof sessionService?.using !== 'function', onClick: sendIssueToSessions }, t('sessionSendAction'))),
                  issue.sendResult && h('ul', { role: 'status' }, issue.sendResult.targets.map(item => h('li', { key: item.id }, label(item.id), ' — ', t(item.status === 'accepted' ? 'sessionSendAccepted' : item.status === 'unknown' ? 'sessionSendUnknown' : item.status === 'inflight' ? 'sessionSendInflight' : 'sessionSendNotSent'))))),
                h('ul', { className: 'dsh-board-tracker-list' }, issue.comments.map((comment) => h('li', { className: 'dsh-board-tracker-comment', key: comment.id }, h('div', { className: 'dsh-board-tracker-comment-meta' }, h('span', { className: 'dsh-board-comment-avatar', 'aria-hidden': true }, commentInitials(comment.createdBy.display)), h('strong', null, comment.createdBy.display), h('time', { dateTime: comment.createdAt, title: comment.createdAt }, commentTime(comment.createdAt))), renderTrackerText(comment.text),
                issue.editComment?.id === comment.id ? commentEditor(issue) :
                  Number.isSafeInteger(comment.version) && comment.version >= 0 ? h('button', { type: 'button', disabled: issue.pending || Boolean(issue.editComment), 'aria-label': t('issueEditComment') + ': ' + comment.id, onClick: () => { const current = memory.issue; if (issueScope(current) && current.available && !current.pending && !current.editComment) issuePatch({ editComment: { id: comment.id, version: comment.version, original: comment.text, text: comment.text }, dirty: true, notice: '' }); } }, t('issueEditComment')) : h('p', { className: 'dsh-board-muted' }, t('issueCommentVersionUnavailable'))))),
                issue.editComment && !issue.comments.some(comment => comment.id === issue.editComment.id) && h('div', null, h('p', { role: 'status' }, t('issueEditedCommentMissing')), commentEditor(issue)),
                ['partial', 'error'].includes(issue.commentsState) && h('button', { type: 'button', disabled: issue.pending, onClick: loadMoreComments }, t('issueCommentsMore'))))));
      }
      useEffect(() => {
        const issue = memory.issue;
        if (issue && !issue.available && !issue.loading && !issue.pending && issueScope(issue) && tracker.board && !tracker.busy && (!issue.error || issue.unknown)) void loadIssue();
      }, [tracker.board, tracker.busy, tracker.settings, connection, memory.issue?.pending]);
      function openTrackerSession(issue, sessionId, event) {
        const tr = memory.tracker, ws = workspacesSource.getSnapshot(), sess = sessionsSource.getSnapshot();
        const board = tr.board, owner = ws.items.find(item => item.workspaceId === memory.workspaceId);
        if (!trackerActive() || !connectionSource.getSnapshot() || memory.provider !== 'tracker' || memory.overview || memory.showContext || !currentWorkspace(memory.workspaceId) || !tr.settings?.workspaces[memory.workspaceId]?.includes(memory.boardId) || tr.settings.needsReselect.includes(memory.workspaceId) || !board?.issues.some(item => item.key === issue.key && item.id && item.id === issue.id) || !tr.boardLinks?.links.some(link => link.issueKey === issue.key && link.issueId === issue.id && link.sessionId === sessionId) || !owner?.sessionIds?.includes(sessionId) || sessionState(sessionId, sess, ws) !== 'available') return;
        setSessionMenu(null);
        if (modifiedSessionClick(event)) newTabSession(memory.workspaceId, sessionId);
        else openSession(sessionId);
      }
      function trackerSessionShortcut(issue, links) {
        const menuId = 'dsh-board-tracker-sessions-' + encodeURIComponent(workspaceId) + '-' + encodeURIComponent(boardId) + '-' + encodeURIComponent(issue.key);
        const menuOpen = sessionMenu?.menuId === menuId;
        return h(React.Fragment, null,
          h('button', { type: 'button', className: 'dsh-board-whale-button', 'aria-label': (links.length === 1 ? t('openSession') : t('sessionMenu')) + ': ' + issue.summary, title: t('issueSessionPartial'), ...(links.length > 1 ? { 'aria-haspopup': 'menu', 'aria-expanded': menuOpen, 'aria-controls': menuId } : { 'aria-disabled': sessionState(links[0].sessionId, sessions, workspaces) !== 'available' }), onClick: event => links.length === 1 ? openTrackerSession(issue, links[0].sessionId, event) : setSessionMenu(menuOpen ? null : { menuId }), onAuxClick: event => { if (event.button === 1 && links.length === 1) { event.preventDefault(); openTrackerSession(issue, links[0].sessionId, event); } } }, h('img', { className: 'dsh-board-whale', src: './favicon.svg', alt: '' }), String(links.length)),
          menuOpen && links.length > 1 && h('div', { className: 'dsh-board-session-menu', id: menuId, role: 'menu', 'aria-label': t('sessionMenu') + ': ' + issue.summary, onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); setSessionMenu(null); event.currentTarget.parentElement?.querySelector('[aria-haspopup="menu"]')?.focus(); } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')], current = items.indexOf(document.activeElement), next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next]?.focus(); } } }, links.map(({ sessionId }) => { const state = sessionState(sessionId, sessions, workspaces); return h('button', { key: sessionId, type: 'button', role: 'menuitem', 'aria-disabled': state !== 'available', onClick: event => openTrackerSession(issue, sessionId, event), onAuxClick: event => { if (event.button === 1) { event.preventDefault(); openTrackerSession(issue, sessionId, event); } } }, label(sessionId), state === 'available' ? '' : ' — ' + t(state)); })));
      }
      function trackerView() {
        if (memory.provider !== 'tracker' || overview || showContext) return null;
        const value = connection && workspaceReady && trackerLive(workspaceId) && tracker.settings.workspaces[workspaceId]?.includes(boardId) ? tracker.board : null;
        const assignees = new Map();
        for (const issue of value?.issues || []) if (issue.assigneeKnown && issue.assignee && !assignees.has(issue.assignee.id)) assignees.set(issue.assignee.id, issue.assignee.display);
        const boardLinks = value && tracker.boardLinks && sessionMembershipReady ? tracker.boardLinks.links.filter(link => workspace.sessionIds.includes(link.sessionId)) : null;
        const issueLinks = (issue) => issue.id ? (boardLinks || []).filter(link => link.issueKey === issue.key && link.issueId === issue.id) : [];
        const issues = (value?.issues || []).filter((issue) => assigneeMatches(assigneeFilter, issue.assigneeKnown, issue.assignee?.id ?? null) && (sessionFilter === 'all' || (boardLinks && sessionFilter === 'linked' && issueLinks(issue).length > 0)));
        let groups = [], groupError = false;
        if (value) {
          try { groups = groupTrackerStatuses({ columns: value.columns, issues: value.issues }); }
          catch {
            groupError = true;
            // Fall back only to actual loaded issue statuses; never guess if their
            // own identities conflict. Empty configured statuses may be omitted.
            try { groups = groupTrackerStatuses({ columns: [], issues: value.issues }); } catch { groups = []; }
          }
        }
        groups = groups.filter(group => group.issues.length > 0);
        const labelCounts = new Map();
        for (const group of groups) labelCounts.set(group.status.display, (labelCounts.get(group.status.display) || 0) + 1);
        const tentativeNames = groups.map(group => labelCounts.get(group.status.display) > 1 ? `${group.status.display} (${group.status.key})` : group.status.display);
        const finalCounts = new Map();
        for (const name of tentativeNames) finalCounts.set(name, (finalCounts.get(name) || 0) + 1);
        const allowedIssues = new Set(issues.map(issue => issue.key));
        const grouped = groups.map((group, index) => ({ id: group.status.id,
          name: finalCounts.get(tentativeNames[index]) > 1 ? `${tentativeNames[index]} [${group.status.id}]` : tentativeNames[index],
          issues: group.issues.filter(issue => allowedIssues.has(issue.key)),
          allIssues: group.issues.filter(issue => assigneeMatches(assigneeFilter, issue.assigneeKnown, issue.assignee?.id ?? null)) })).filter(group => group.issues.length > 0);
        return h('section', { 'aria-label': t('tracker') },
          h('div', { className: 'dsh-board-section-head' }, h('div', null,
            h('button', { className: 'dsh-board-back', type: 'button', disabled: busy || uncertain, onClick: showBoards }, '← ', t('returnToBoards')),
            h('div', { className: 'dsh-board-section-title' }, h('h2', null, value?.board.name || (connection && trackerLive(workspaceId) ? `${t('tracker')} #${boardId}` : t('tracker'))))),
            h('button', { type: 'button', disabled: tracker.busy || !trackerLive(workspaceId), onClick: () => readTrackerBoard(workspaceId, boardId) }, t('trackerRefreshBoard'))),
          groupError && h('p', { className: 'dsh-board-alert', role: 'alert' }, t(groups.length ? 'trackerStatusPartial' : 'trackerError')),
          tracker.busy && h('p', { role: 'status' }, t('loading')),
          value && tracker.boardUpdatedAt !== null && h('p', { className: 'dsh-board-muted', role: 'status' }, t('trackerUpdatedAt'), ' ', new Date(tracker.boardUpdatedAt).toLocaleString()),
          value && h('label', { className: 'dsh-board-filter' }, h('select', { 'aria-label': t('assignee'), value: assigneeFilter, onChange: (event) => updateMemory({ assigneeFilter: event.target.value }) }, h('option', { value: allAssigneesValue }, t('allAssignees')), h('option', { value: unassignedValue }, t('unassigned')), h('option', { value: unknownValue }, t('assigneeUnknown')), !specialAssigneeFilter && ![...assignees.keys()].some((id) => filterValue('assignee', id) === assigneeFilter) && h('option', { value: assigneeFilter }, t('assigneeUnavailable')), [...assignees].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([id, display]) => h('option', { key: id, value: filterValue('assignee', id) }, display, ' (', id, ')')))),
          value && !value.issues.length && h('p', { className: 'dsh-board-muted' }, t('trackerEmpty')),
          value && sessionFilter === 'linked' && h('p', { className: 'dsh-board-muted', role: 'status' }, !boardLinks ? t('sessionFilterUnavailable') : t('withSession'), ' ', h('button', { type: 'button', onClick: () => updateMemory({ sessionFilter: 'all' }) }, t('clearSessionFilter'))),
          value && value.issues.length > 0 && !issues.length && !(sessionFilter === 'linked' && !boardLinks) && h('p', { className: 'dsh-board-muted' }, t('noResults')),
          value && grouped.length > 0 && scrollView(grouped.map((column) => h('section', { className: 'dsh-board-column', key: column.id || '__unmapped', 'aria-label': column.name },
            h('div', { className: 'dsh-board-column-head' }, h('div', { className: 'dsh-board-column-label' }, h('h2', null, column.name), h('span', { className: 'dsh-board-count' }, column.issues.length)), boardLinks && h('button', { className: 'dsh-board-whale-button', type: 'button', 'aria-label': t('columnSessions') + ': ' + column.name + ' — ' + new Set(column.allIssues.flatMap(issue => issueLinks(issue).map(link => link.sessionId))).size, title: t('issueSessionPartial'), 'aria-pressed': sessionFilter === 'linked', onClick: () => updateMemory({ sessionFilter: sessionFilter === 'linked' ? 'all' : 'linked' }) }, h('img', { className: 'dsh-board-whale', src: './favicon.svg', alt: '' }), String(new Set(column.allIssues.flatMap(issue => issueLinks(issue).map(link => link.sessionId))).size))),
            column.issues.map((issue) => h('article', { className: 'dsh-board-card', key: issue.key }, /^[A-Z][A-Z0-9_]{0,31}-[1-9][0-9]{0,14}$/.test(issue.key) ? h('a', { className: 'dsh-board-card-id', href: 'https://tracker.yandex.ru/' + encodeURIComponent(issue.key), target: '_blank', rel: 'noopener noreferrer' }, issue.key) : h('span', { className: 'dsh-board-card-id' }, issue.key), h('button', { className: 'dsh-board-card-title', type: 'button', disabled: !issue.id, title: !issue.id ? t('issueMissingId') : undefined, onClick: () => openIssue(issue), 'aria-label': t('issueDetails') + ': ' + issue.summary }, issue.summary), h('span', { className: 'dsh-board-card-status' }, issue.status.display), h('span', { className: 'dsh-board-muted' }, t('assignee'), ': ', issue.assigneeKnown ? (issue.assignee?.display || t('unassigned')) : t('assigneeUnknown')), boardLinks && issueLinks(issue).length > 0 && trackerSessionShortcut(issue, issueLinks(issue))))))));
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
              h('span', { className: 'dsh-board-tile-icon' }, h(Icon, { name: 'columns' })), h('span', { className: 'dsh-board-tile-content' }, h('strong', null, board.name), h('span', null, owner?.title || board.workspaceId), h('small', null, t('tracker'), ' · ', t('trackerPartialBadge'))), h('span', { className: 'dsh-board-tile-arrow', 'aria-hidden': true }, '↗'));
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
              h('label', { className: 'dsh-board-filter' }, h('select', { 'aria-label': t('sessionFilter'), value: sessionFilter, disabled: !sessionMembershipReady, onChange: (event) => updateMemory({ sessionFilter: event.target.value }) }, h('option', { value: 'all' }, t('allSessions')), h('option', { value: 'linked' }, t('withSession')), h('option', { value: 'unlinked' }, t('withoutSession')))),
              sessionFilter !== 'all' && h('button', { type: 'button', onClick: () => updateMemory({ sessionFilter: 'all' }) }, t('clearSessionFilter'))),
            !sessionMembershipReady && h('p', { className: 'dsh-board-muted', role: 'status' }, t('sessionFilterUnavailable')),
            statuses.length > 0 && h('details', { className: 'dsh-board-status-manager' }, h('summary', null, t('manageStatuses')), h('ul', null, statuses.map(status => h('li', { key: status.id }, h('button', { type: 'button', disabled: busy || uncertain, 'aria-label': t('manageStatuses') + ': ' + status.name, onClick: () => setForm({ kind: 'status', id: status.id, name: status.name, position: status.position }) }, status.name))))),
            !statuses.length && h('p', { className: 'dsh-board-empty' }, t('noStatuses'))),
          form && (form.kind === 'task' || form.kind === 'links' ? h('aside', { className: 'dsh-board-drawer', style: { width: drawerWidth() + 'px' }, 'aria-label': t('editTask'), onKeyDown: (event) => { if (event.key === 'Escape') { event.preventDefault(); setForm(null); } } }, resizeHandle(), formView()) : formView()),
          issueView(),
          selected && statuses.length > 0 && h(React.Fragment, null,
            selected.tasks.length > 0 && !tasks.length && h('p', { className: 'dsh-board-empty' }, t('noResults')),
            !selected.tasks.length && h('p', { className: 'dsh-board-empty' }, t('noTasks')),
            mode === 'list' ? h('div', { className: 'dsh-board-list' }, tasks.map(card)) : tasks.length > 0 && scrollView(statuses.filter((status) => tasks.some(task => task.statusId === status.id)).map((status) => {
              const columnTasks = tasks.filter((task) => task.statusId === status.id);
              const columnSessionCount = new Set(baseTasks.filter((task) => task.statusId === status.id).flatMap((task) => workspaceLinksFor(task.id).map((link) => link.sessionId))).size;
              const color = colors[statuses.findIndex((item) => item.id === status.id) % colors.length];
              return h('section', { className: 'dsh-board-column', key: status.id, 'aria-label': status.name, style: { '--column-color': color } },
                h('div', { className: 'dsh-board-column-head' }, h('div', { className: 'dsh-board-column-label' }, h('span', { className: 'dsh-board-column-dot', 'aria-hidden': true }), h('h2', null, status.name), h('span', { className: 'dsh-board-count' }, columnTasks.length)), h('div', { className: 'dsh-board-row' }, h('button', { className: 'dsh-board-whale-button', type: 'button', disabled: !sessionMembershipReady, 'aria-label': t('columnSessions') + ': ' + status.name + ' — ' + columnSessionCount, title: t('columnSessions'), 'aria-pressed': sessionFilter === 'linked', onClick: () => updateMemory({ sessionFilter: sessionFilter === 'linked' ? 'all' : 'linked' }) }, h('img', { className: 'dsh-board-whale', src: './favicon.svg', alt: '' }), String(columnSessionCount)), h('button', { type: 'button', disabled: busy || uncertain, 'aria-label': t('editStatus') + ': ' + status.name, onClick: () => setForm({ kind: 'status', id: status.id, name: status.name, position: status.position }) }, t('edit')))),
                columnTasks.length ? columnTasks.map(card) : h('div', { className: 'dsh-board-column-empty' }, t('emptyColumn')));
            }))))));
    }
    return {
      inject: ['slots', 'locale', 'workspaces', 'sessions', 'uiWorkspace', 'layout', 'commandUi', 'connection', 'inputTriggers', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => consumeSessionFragment(ctx), 'dsh-board: session handoff');
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
            if (next !== id) { id = next; invalidateLocalLoad(); invalidateTracker(); }
          });
          const next = connectionSource.getSnapshot()?.id;
          if (next !== id) { id = next; invalidateLocalLoad(); invalidateTracker(); }
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
        const { Header: SessionCardHeader, Body: SessionCardBody } = createSessionCard(React, {
          transport, ws: ctx.workspaces.list, sessions: ctx.sessions.list, connection: connectionSource,
          sidebarRight: ctx.sidebarRight, renderTrackerText, t, openBoardForSession,
          openSession: id => ctx.uiWorkspace.openSession(id),
          openSessionInNewTab: id => { const workspace = ctx.workspaces.list.getSnapshot().items?.find(item => item.sessionIds?.includes(id)); if (workspace) newTabSession(workspace.workspaceId, id); },
        });
        ctx.effect(() => ctx.sidebarRightTabs.register({ id: 'dsh-board-issue', kind: 'dsh-board-issue', title: () => t('issueDetails') }), 'dsh-board: session issue tab');
        ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities', id: 'dsh-board-issue', order: 100,
          inject: sessionId => ({ sessionId }),
        }, SessionCardHeader)), 'dsh-board: session issue action');
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab', key: 'dsh-board-issue', inject: sessionId => ({ sessionId }),
        }, SessionCardBody)), 'dsh-board: session issue body');
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: PANEL, locale: NS,
          inject: () => ({ transport, sessionContext, connectionSource, panelSource: ctx.layout.panelInfo, workspacesSource: ctx.workspaces.list, sessionsSource: ctx.sessions.list, sessionService: ctx.sessions, openSession: (id) => ctx.uiWorkspace.openSession(id) }),
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
