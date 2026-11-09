# Перед будущим подключением

Worker не устанавливал candidate и не менял рабочий профиль. Родитель сначала завершает independent review и combined menu-тест. Отдельное явное разрешение владельца требуется для production install; PR/merge/npm/tag не выполняются автоматически.

Candidate `dsh-board@0.1.1-workain.1`, engines DSH >=0.2.2-rc.1 / Node>=24. Точный tarball SHA-256 `a15efe7ba245fab152f42ffadba9b8225cba6bfa3ec10a37aa1137c81eabb438`. Runtime зависимостей не добавлено: Node sqlite/fs/crypto и действующие host/client context contracts. Standalone browser helper генерируется существующим build; никаких новых arbitrary require/DOM interception.

Перед write: прочитать фактический plugin graph/profile/source; сделать private restorable before snapshot profile package/lock/patch и board storages. Существующие local board DB, Tracker settings/links DB и HMAC key сохранять совместно; не отдавать raw backup в Git/чат. Новый `workspace-default-<profile-hash>.sqlite` additive, прежние схемы untouched. В случае последующего backup сохранять файл + актуальные sidecars после корректной остановки/flush, не делать hot copy отдельных SQLite файлов без штатного snapshot-процесса.

Устанавливать точный reviewed tarball штатным Plugin Manager, не npm latest и не редактировать profile вручную. При неизвестном install outcome сначала readback, не повторять автоматически. Build scripts и version exemptions не разрешены этим документом. Изменения client должны проверяться на прежнем GUI URL после обновления страницы; запуск альтернативного сервера не обновляет рабочую GUI.

После разрешённого install: проверить версии/fiber и клиентский Board action, конкретный workspace default, сохранность прежних интеграций, dirty/unknown protections и отсутствие session mutation от read-only контекстов. Никаких пробных rename/status transitions/model messages/Tracker comments в реальных данных. Визуальную приёмку выполняет владелец.

UI rollback — штатно отключить новую bundle/version и вернуть прежний reviewed source/profile после проверки конкурентных настроек. Не восстанавливать слепо старые session histories, goals, расписания, Telegram offsets или бизнес-задачи. Additive pointer DB прежняя версия игнорирует; не удалять неизвестные/новые данные и не откатывать Tracker статусы по display-контексту. Сессии/цели/todo не были изменены данным read-only endpoint.

Исходники Board не копировались в MIT Better Workspace. Родитель подключает только маленький optional client contract вызова, не реализацию лицензированного Board UI.
