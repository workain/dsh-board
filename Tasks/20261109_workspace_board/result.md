# Результат GUARD-377

Подготовлен board-owned candidate `dsh-board@0.1.1-workain.1` в единственной task-ветке. Production, профиль, реальные задачи/сессии, Tracker статусы/категории, OAuth и Telegram не менялись. Worker не публиковал PR/ветку, не сливал main, не выпускал npm/tag и не устанавливал пакет.

## Реализовано

- Один общий provider-tagged default **для каждого workspace**, а не всего Harness. Только явный выбор из имеющихся local/проверенных Tracker boards; отсутствие default вызывает chooser, не первую доску. Новый private additive SQLite не меняет старые task/Tracker схемы. Per-workspace revision/CAS, incarnation и opaque Tracker account namespace проверяются при чтении/применении.
- Узкий клиентский контекст `workspaceBoard.open(workspaceId)` / `.configure(workspaceId)` с synchronous boolean «принято намерение». Он задаёт конкретные workspace/default/provider и linked filter в existing Board Page; не меняет клик managing session или chevron дерева. Pending/unknown/draft guards и отмена поздней навигации сохранены. [Точный контракт](client_contract.md).
- Existing local и Tracker карточки показывают компактный goal/todo контекст всех связанных workspace-member сессий; existing drawer/shared issue editor — полный. Архивная сессия продолжает считаться связанной, её навигация остаётся штатно недоступной. Источник указан session id, данные только для чтения.
- Task-scoped Host endpoint выводит sessionIds из реальных связей, проверяет полномочия/membership до/после, ограничивает count/concurrency/body/response/refresh. Используется passive `observeSession(all)`, leases в finally, без Agent using/resume/prompt и без raw-history output. Missing key, null, [] и read error различаются. Goal complete/todo complete не становятся business status.
- Сохранённая недоступная default-доска не выдаётся за пустую и не очищается одной blind Save. Tracker context чтения не делают full-board search для каждой карточки; exact issue/account checks сохранены.

## Доказательства

Финальный `npm test`: **506 total, 505 pass, 0 fail, 1 прежний optional skip**. `npm run build`: PASS. Native disposable SDK/Chromium: PASS local default A/B/C+reload, linked filter, три source-сессии включая архивную, реальные карточка/drawer/goals/todos, late A→manual B, unavailable default guard. Tracker-shaped carrier на существующих native Tracker card/drawer также PASS; carrier не использует реальные Tracker credentials и не выдаётся за внешний authorization test.

Native passive invariant: **0 изменений header/event hashes**, все пять seed-сессий cold, все Agent flags/member/incarnation/archive/event/prompt поля before/after равны, один штатный blank Agent существовал до baseline и не менялся; prompts 0. Неожиданных pageerror 0, дочерний server stopped. Настоящий Tracker service с synthetic adapter: 20 карточек before/after, 0 full-board search, 80 exact issue reads. [Полная воспроизводимость и пределы](test_evidence.md).

Точный local tarball: `dsh-board-0.1.1-workain.1.tgz`, SHA-256 `a15efe7ba245fab152f42ffadba9b8225cba6bfa3ec10a37aa1137c81eabb438`. Все 51 packed file побайтово сверены с tested working sources; e2e/Tasks/private logs/DB/env в пакете отсутствуют. Изменения после упаковки — только task-документы.

## Остатки перед PR/установкой

Parent выполняет независимое full-diff/delta review, соединение с BWT menu и повторный прогон по pinned tarballs. Человеческий pixel review не выполнен. Реальный Tracker account, его сеть/grants и полная ручная матрица локалей/тем не проверялись. Два прежних optional harness несовместимы с приватными rc.1 деталями (shell extraction/scheduler); исходный failure и результаты отдельно раскрыты в test_evidence, не названы PASS. Native-проекция — текущее штатное standing todo, которое Harness сбрасывает при начале следующего turn.

Перед разрешённой будущей установкой сохранить profile/lock, DB + Tracker HMAC key совместно; установить точный пакет, не upstream latest, проверить application/readback на существующем URL. Откат bundle не откатывает task status, session history, schedules или Telegram offsets; новый pointer SQLite старой версией игнорируется, не удалять его автоматически. [Условия подключения/отката](install_review.md).

## Метрики

```text
active elapsed: отдельно от ожидания не измерялось
wall elapsed: один рабочий этап 09.11.2026, около 90 минут до sealing
iterations: baseline → scoped storage/read/UI → independent early findings → native fixes/negative regressions → final test/pack
user returns: 0; уточнение per-workspace повторно подтверждено без изменения исходной трактовки
requirement sources: прямое поручение владельца и requirements.md; actual SDK rc.1 contracts; original Board source
requirements coverage: реализация и targeted local/Tracker-shaped native покрыты; parent review/combined BWT test и owner install отдельно
live checks: только immutable SDK и disposable native process
live changes: 0
prompt/config/tool deploy: 0 production; pinned local tarball подготовлен
hook effects: private/legacy harness gaps зафиксированы; общие инструкции/RAG не менялись
subagent use: новых implementation subagents не запускал; parent проводит independent read-only review
roast/rework: до реализации roast; реальные receiver/intent/DTO/goal-shape риски устранены и проверены
blockers: known code blocker не заявлен; parent acceptance ещё требуется
platform gaps: старые optional harness приватных API несовместимы; внешний Tracker не проверялся
knowledge close: API/риски/воспроизведение в task docs, wiki/ontology NO, RAG deferred to merge/main
remaining risk: read-only context bounded/не транзакция внешнего Tracker; human visual и реальная роль доступа отдельно
```
