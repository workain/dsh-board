# Прожарка до реализации

- Локальный core.defaultBoardId не решает Tracker и отсутствует в публичном DTO. Не выдавать его за готовый API и не перезаписывать старые данные. Единый default reference должен иметь своего владельца хранения и revision.
- Простое `selectPanel` не задаёт workspace/board/filter. Не патчить DOM/closure снаружи; board-owned сервис передаёт намерение существующей Page.
- Нельзя доверять присланным sessionIds: backend обязан вывести их из актуальных local/Tracker links и проверить workspace incarnation/account до/после. Ошибка доступа скрывает данные, а не отдаёт старый private cache.
- `goals/get` lookup требует live Agent, значит для массовой карточки опасен. Использовать только sessionQuery passive lease, не `using`/resume, не raw history output. Каждый lease освобождать даже при abort.
- Архивность не уничтожает связь: linked filter считает membership, навигация отдельно. Проекция goal complete и todo complete не меняет task business status.
- Missing projection, null и [] различны. Ошибка чтения не равна «нет целей»; stale callbacks не должны смешать workspace/account/task.
- Нужны ограничения count/concurrency/bytes/refresh и без дублирования полного UI. Никакой автоматической записи/повтора неизвестных writes.
- Формат прежних SQLite не менять; backup/downgrade не ломать. Новый default storage должен быть add-only и независим от task/status content.
- Runtime read-only. Изменения board code не копировать в MIT Better Workspace. Parent получит только узкий API и отдельно решит tiny wiring.
