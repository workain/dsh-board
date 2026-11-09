# План реализации

1. Прочитать baseline и запустить существующие unit/build/browser/host проверки; зафиксировать доступность окружения без изменения установленных плагинов.
2. Добавить отдельное board-owned хранилище указателя default с revision и incarnation, не меняя формат прежних SQLite. Проверять provider/local assignment/Tracker selection и доступ при каждом использовании.
3. Добавить ограниченный read-only endpoint контекста задачи: derive links на сервере, перепроверка области до/после, passive observeSession(all), dispose finally, отдельные состояния ошибки/нет проекции/null/[]; не читать Agent API.
4. Экспортировать узкий клиентский сервис `workspaceBoard.open(workspaceId)` и `workspaceBoard.configure(workspaceId)` через публичный Cordis Service. Открытие существующей Page должно выбирать default+linked filter, а не только переключать panel; беречь drafts и unknown guards.
5. Встроить компактный контекст в existing local+Tracker cards и полный в drawers/shared editor. Новая логика вынесена в модули <600 строк.
6. Behavioral/DOM и disposable native browser: exact links/membership, archived counts, multiple sessions, null/[]/missing/error, cancellation/disposal, revision conflicts и stale scope. Полный regression/build.
7. Локальный commit только task branch; итоговые evidence/ограничения и точный интеграционный API передать parent. Никакого production install/push/PR/merge.

Публичные артефакты содержат только синтетические IDs/относительные пути. Сырые native журналы и снимки не публикуются.
