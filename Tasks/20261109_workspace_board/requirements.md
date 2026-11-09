# Доска по умолчанию и цели/todo сессий

Задача: GUARD-377 (существующая); связана с деревом GUARD-379. Новое прямое поручение владельца разрешает реализацию прежнего отложенного карточного scope. Статус Tracker не менять; записи комментариев требуют штатного одобрения, ранее оно отклонялось, обхода нет.

## Уточнено владельцем

1. Нужна существующая DSH Board, в том числе с Tracker backend, не новый отдельный Tracker UI.
2. Workspace имеет одну общую явно выбранную доску по умолчанию: локальную либо Tracker. Не выбирать автоматически первую из списка.
3. При открытии этой доски — фильтр задач с существующей явной связью на сессию текущего workspace. Поиск по ключам/заголовкам не используется.
4. Карточка и её деталка показывают цели и последний todo-снимок всех связанных сессий, с пометкой источника. Только чтение, без управления goals/todo.
5. Текущий клик имени workspace открывает управляющую сессию, стрелка раскрывает дерево. Не заменять эти действия открытием доски; нужен отдельный Board action/узкий клиентский контракт.

## Сохранение поведения

Связь и навигационная доступность отличаются. Фильтр сохраняет штатную семантику членства; архивность сессии сама по себе не уничтожает связь, навигация архивной запрещена штатно. Недоступная/ошибочная проекция не означает «целей нет». Отсутствующий projection key, null и [] различаются. Нет массового Agent resume, using, prompt или обхода через transcript/control. Цели не являются todo/планом; complete goal/todo не меняет Tracker status. Activation armed/disarmed процессная, не выводить её из GoalProjection.

## Исходники и границы

Repo workain/dsh-board; единственная task-ветка task/guard-377-workspace-board-context, task-worktree для доски. Baseline4b06de2 совпадает с установленным source по критическим модулям. Primary repo и release read-only. Новые модули <600 строк, документация по-русски. Существующий крупный generic client допускает минимальную проводку, новая логика отдельно.

Никаких live writes/profile install/сервисных рестартов/Tracker transitions/реальных board links/status/categories/model/Telegram prompts. Новая версия отдельно принимается на disposable fixture, затем owner-approved install. Не копировать board implementation в публичный MIT Better Workspace: у доски нет опубликованной лицензии на такой перенос. Один PR доски, без merge/main/npm release/tag.

## API-факты

core.setDefaultBoard существует, но service snapshot не отдаёт default и commandShape не принимает default operation. Нужен реальный контракт настройки/чтения, включая provider, incarnation и авторизацию Tracker selected board. Нельзя выдавать deletionIdentity default hash-input за snapshot поле.

Host rc1 ctx.sessionQuery.observeSession(id,{projectionMode:'all',signal}) возвращает disposable lease: projections={asOfSeq,values}. values.todos=TodoItem[]|null, content/status pending|in_progress|completed. values.goal=GoalProjection|null, где .goal={id,revision,objective,phase,maxGoalRounds,blockedReason?}, wrapper={roundsStarted,createdAt,updatedAt}. Освободить Symbol.dispose в finally, ограничить конкурентность/объём/refresh, проверять текущие связи/членство/доступ до и после. Не передавать клиенту сырую переписку/конфиги. goals/get требует live agent, не подходит.

## Приёмка

Локальная и Tracker-shaped доска, persistence/reconnect/две вкладки, explicit default/clear/change/revision conflict, rejected/stale mapping, linked/unlinked/archived membership, переключение workspace во время запроса без утечки результата. Несколько сессий, goal+todos только чтение, ошибки/нет registry/null/[], отмена/dispose, no-Agent/no-event-write. Реальные DOM clicks карточка/деталка и отдельное действие дерева. Сохранение всех существующих tests; native disposable SDK/browser с неунаследованным окружением, без production auth/моделей. Независимый full-diff review до PR/install.
