# Независимая приёмка связки

Код Board commit `56d211d4ff58a70b5b5c2264d45a3e3d5b45659e` прошёл независимое bounded full/delta review: PASS для PR/code handoff, без утверждения о production install или человеческой визуальной приёмке. Runtime после sealing не менялся.

Parent отдельно повторил `npm test`: 506 total, 505 pass, 0 fail, 1 прежний optional skip; build PASS. Все 51 файла Board tarball побайтово сверены с source. Использованы точные пакеты:

- Board `0.1.1-workain.1`, SHA-256 `a15efe7ba245fab152f42ffadba9b8225cba6bfa3ec10a37aa1137c81eabb438`.
- Better Workspace `0.41.0-workain.2`, SHA-256 `95bfc32d309a4c6affdb35df2052f7a7cd28285d1a20256f7068649bcc84b1a2`; его 118 тестов независимо повторены, 0 ошибок/пропусков.

Оба tarball извлекались после проверки SHA в новый закрытый HOME/XDG/cwd. Включались только disposable SDK/fixtures; source release и рабочий профиль не менялись. First parent attempt остановился до сервера из-за отсутствующего пути нового test-only `tracker_ui` в Python import path; исправлен только runner import path, без изменения ожиданий или product code. Полный повтор завершён успешно.

## Реальный combined Chromium

- Обычный правый клик по строкам Alpha и Beta в настоящем BWT → «Open workspace board» открывает разные сохранённые доски, linked filter не показывает unlinked task.
- «Default workspace board…» у Alpha открывает chooser именно Alpha, не Harness-wide setting.
- Отдельная стрелка BWT раскрывает дерево без замены выбранного board panel.
- Повторены native local chooser/reload/A/B/unassigned C, цели нескольких сессий и архивного участника в карточке/drawer, todo; slow A → manual B не возвращает A; недоступный сохранённый default нельзя очистить blind Save.
- Existing Tracker card/drawer прошли synthetic carrier сценарий с реальными native projection rows; Tracker-shaped write calls 0. Это не проверка реальной сети/учётной записи Tracker.
- Header/event SHA-256 изменений 0; пять task-source сессий cold. Все event/Agent/member/archive поля before/after равны; один blank Agent существовал до baseline и не менялся. Новых prompts или Agent не появилось.
- Page errors 0 в обоих браузерных этапах, дочерний сервер завершён.

## Закрытые замечания и остатки

Исправлены и перепроверены native object `blockedReason`, bound streaming bodies, лишние full-board запросы, receiver-bound source getters, stale default intent и misleading unavailable default. Все замечания закрыты фактическим source review и поведенческими/native сценариями, а не ослаблением ожиданий.

Старые optional browser/host harness остаются несовместимы с rc.1 private details; они не объявлены PASS. Исторический `plugin/README.md` пока описывает старый rc.5 preview и отсутствие default UI. Для этого candidate актуальны manifest engines rc.1, этот task-пакет и [client_contract.md](client_contract.md); старое README не использовать как инструкцию установки новой функции. Человеческий pixel review и реальная ограниченная transport-role отдельно не проверены.

Предыдущий код Board уже находится в открытом PR №2 `issue-1-local-board → main`. Новое изменение оформляется отдельным небольшим stacked PR в эту ветку, чтобы не дублировать весь старый diff и не сливать main автоматически. BWT остаётся в своём существующем PR №1. Подключение обоих новых пакетов в рабочую GUI требует нового явного разрешения владельца; прежнее разрешение на Workain.1 не распространяется на этот candidate.

Знания: доменные роли/формы/статусы Guard/B3 не менялись, wiki/ontology NO. Описаны реальные контракты и эксплуатационные риски инструмента. Shared RAG не перестраивается на feature-ветке. Compact hook выполнен один раз для этого task: exit2, Guard-инструмент не принимает путь задачи внешнего репозитория. Отказ записан приватно; это не успешная проверка и не причина копировать task в другой repo или обходить ограничение.
