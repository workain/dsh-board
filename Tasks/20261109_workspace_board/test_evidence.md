# Проверки

## Baseline и регрессия

Node 24.13.1. Исходный `npm test`: 492 теста, 491 pass, 0 fail, 1 существующий optional skip. Исходный `npm run build`: PASS. Финальный расширенный `npm test`: 506 тестов, 505 pass, 0 fail, тот же 1 optional skip. Build проверяет синхронность generated helpers с исходным standalone-модулем, JS syntax и прежний состав bundle; ожидания существующих продуктовых тестов не ослаблялись.

Два исходных optional integration harness имеют отдельные несовместимости с rc.1, существовавшие до реализации:
- `npm run test:browser` останавливается до сценариев: hardcoded имена минифицированного shell (`OZ`, `dshDesktopBoot`) больше не соответствуют установленному rc.1.
- `npm run test:host`: два scheduler/PTC теста используют прежний private scheduler-symbol, получая undefined до `prepare`; остальные 13 host/restoration-тестов проходят. Эти утверждения не выдаются за зелёную browser/host suite. Они не менялись ради принятия новой функции.

## Новые поведенческие проверки

`workspace-context.test.mjs` и `workspace-tracker.test.mjs` исполняют production host/helper код: independent owners/CAS; A/B/C defaults; restart/read; unknown/changed incarnation; чужая локальная доска; Tracker account change; полное членство с архивными; отсутствующий projection key / null / []; настоящий blockedReason `{code,message}`; ошибка строки; abort/dispose; смена links/account во время чтения; отсутствие произвольного sessionIds; 16-body cap и отмена зависшего stream; узкий workspaceBoard intent API.

На настоящем Tracker service с синтетическим account adapter: 20 карточек × before/after = 40 scoped link proofs, 80 exact issue reads, **0 full-board search**, 0 дополнительных board identity reads на task-context после начальной проверки default. Это число операций, не измерение внешней сетевой задержки.

## Нативный одноразовый SDK + Chromium

```sh
npm test
npm run build
BW_SDK="$SDK_RELEASE" BW_PRIVATE="$PRIVATE_ARTIFACTS" BW_NODE="$NODE_BINARY" PLAYWRIGHT_BROWSERS_PATH="$BROWSER_CACHE" "$PLAYWRIGHT_PYTHON" e2e/run.py
```

Runner создаёт свежие HOME/DSH_HOME/XDG/cwd, фиксированный allowlist серверного окружения, случайный loopback port. Код берётся из immutable SDK и task-пакета; рабочие configs, db, история и credential env не копируются. Браузер блокирует nonloopback HTTP. Дочерняя группа всегда останавливается, в том числе при падении утверждения. Fixtures и private diagnostics не входят в tarball.

Проверены реальными DOM кликами/выбором, без force-click: сохранение default A/B, unassigned C; reload; точный linked filter; несколько cold-сессий и архивный участник; цели в карточке и деталке; todo в деталке; slow default A → ручное переключение B → late A не меняет цель; saved-but-unavailable default не представляется пустым и Save заблокирован без явного выбора. Контексты только читаются.

Baseline пассивного интервала снимается **после** всех synthetic seed/link/archive операций. Проверяется точное равенство header/event SHA-256, event counts, prompts, live-Agent flags, membership/incarnation и archived set. Все пять явно засеянных task-source сессий остаются cold. Один уже живой blank Agent штатной GUI допустим только как неизменившийся факт before/after; первоначальная ошибочная проверка «ноль всех Agent» исправлена после доказанного равенства before/after, а не за счёт игнорирования новых Agent. Никакой модельный prompt не отправлен.

Отдельный Tracker-shaped carrier обслуживает actual существующую Tracker карточку/drawer в том же native клиенте. Проекционные rows получены реальным passive local task-scoped host read; только транспорт Tracker заменён синтетическим ответом. Это UI-контракт, **не** проверка настоящей Tracker авторизации или реального аккаунта. Настоящие account/link guards проверены отдельно production service unit-сценариями.

DOM и native assertions не заменяют человеческий pixel review. Совместный BWT menu → board контракт дополнительно проверяет parent после sealing артефактов.
