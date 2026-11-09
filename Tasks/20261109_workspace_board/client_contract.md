# Узкий контракт дерева и DSH Board

Клиентский service name: **`workspaceBoard`**. Board регистрирует его через публичный `ctx.provide` с effect-owned освобождением. Внешний плагин делает optional lookup `ctx.get('workspaceBoard')` с обработкой отсутствующего сервиса; hard inject не нужен.

```js
const service = ctx.get('workspaceBoard')
const accepted = service.open(workspaceId)
const acceptedSetup = service.configure(workspaceId)
```

Оба метода синхронно возвращают boolean: принят ли запрос намерения, **не** обещание завершённой навигации/записи. Неизвестный workspace, неготовый workspace/connection или небезопасная pending/unknown операция возвращают false. Page повторно применяет штатную защиту dirty draft. При новом ручном взаимодействии pending default read отменяется и поздний результат не перенаправляет пользователя.

- `open(workspaceId)`: строго заданный workspace; читает его единственный provider-tagged default и открывает существующую Board Page с `sessionFilter='linked'`. При отсутствии/недоступности default открывает явный chooser, не угадывает первую доску.
- `configure(workspaceId)`: chooser только этого workspace. Выбор local/Tracker ограничен существующими назначенными/подтверждёнными досками; настройка Tracker доступа остаётся штатной и отдельной.
- Нет метода для чтения произвольных сессий или записи целей/todo. Имя workspace и отдельная стрелка дерева сохраняют прежнее поведение; parent подключает отдельные Board menu actions.

## Host ownership

`POST /api/dsh-board.context` — owner-only exact Connection route, не agent tool. `default.read`, `default.set`, `task.context` имеют строгие shape-контракты. `default.set` требует текущие incarnation и per-workspace expectedRevision; не меняет статусы/содержимое доски. `task.context` принимает task/issue identity, а sessionIds **выводит сам** из доказанных связей и актуального членства. Tracker identity/account guards проверяются до/после; account namespace остаётся Host-only.

Хранилище default: отдельный private SQLite-файл в board storage с profile-derived именем. Таблица хранит одну строку на workspace, revision и `{provider,boardId,incarnation,accountScope}`. Форматы прежних local/task/Tracker БД не меняются. Local default core field не перезаписывается; новый указатель появляется только после явного выбора. Ошибочный/устаревший stored pointer остаётся сохранённым, но не активным; UI не считает его пустым и требует явную замену/очистку.

Контексты карточки читаются только для видимых компонентов: максимум 4 client requests, 8 Host context operations, 4 lease reads в операции, 32 связанные сессии на карточку; body cap 16 параллельно/4096 bytes/15s, response cap 256KiB. Lease всегда освобождается в finally. Поллинг видимой карточки раз в 60 секунд; деталка имеет read-only refresh. Hidden/unmounted/scope-changed результаты скрываются/отменяются. Нет постоянного private cache.
