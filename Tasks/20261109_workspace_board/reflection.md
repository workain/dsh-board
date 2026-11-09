# Рефлексия

- Board владеет default pointer, task/session links и карточным контекстом. Наружу нужен узкий command-like intent service, а не доступ к замыканию Page или копия лицензированного UI в другом пакете.
- Реальный rc.1 native прогон поймал this-dependent source methods: прямой `useSyncExternalStore(source.getSnapshot)` неправилен; нужны вызовы с receiver. Source-shaped стрелочные mocks этого не выявляли.
- Native turn/start сбрасывает standing todo. Fixture должна записывать todo внутри своей синтетической turn, иначе корректное отсутствие списка ошибочно принимается за дефект отображения.
- Не смешивать отсутствие нового Agent с абсолютным нулём всех Agent: штатная новая GUI уже имеет blank Agent до baseline. Проверка теперь сравнивает все исходные flags и header/event hashes, отдельно доказывая cold у всех task-source sessions.
- Проверка частичных Tracker board links отличается от exact issue links (`incomplete:true` против false). Подмена всех DTO одинаковым mock нарушает контракт; исправлялись fixture данные, не продуктовые проверки.
- Неизвестный default write защищён per-workspace CAS; UI не повторяет его автоматически. Недоступный существующий default не является пустым: требуется отдельный выбор замены/очистки.
- Поздний default read нельзя применять после ручной навигации/начала draft. Pending intent отменяется на взаимодействие и повторно проверяет target/scope; StrictMode и unmount не должны терять или повторно воспроизводить старое намерение.
- Два старых integration harness привязаны к приватным/минифицированным rc.5 деталям. Их несовместимость отмечена отдельно; новый native harness использует настоящий SDK, а не снижает ожидания для устранения дефектов.

Закрытие знаний: новый API и ограничения описаны в client_contract.md и test_evidence.md. Изменений Guard/B3 доменных сущностей, статусов, прав, бизнес-процессов или общих agent-инструкций нет: wiki/ontology — NO. Shared RAG не перестраивался; feature-индексация отложена до решения о merge/main. Production install и интеграцию BWT выполняет не этот worker.
