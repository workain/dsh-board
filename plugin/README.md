# DSH Board

A local task board for [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh). This repository contains an **early development preview**, not a stable or security-certified release.

## First-stage scope

- Create local boards, columns and tasks; change task title, description and column.
- See available boards on opening the panel and open one in a click; optionally filter by workspace, use a board or list view and search or filter by column.
- Link a task to an existing session in the selected workspace, open it, and start linking from the session header: choose a board, then **Link this session** on an existing task. The header action is currently not shown by DSH for a blank conversation; it does not create a new task. The session must belong to the board's workspace.
- `board_link_session` lets an agent request an explicit one-time user approval to link or unlink **its own** session.
- Local data remains on the host; no GitHub or Yandex Tracker integration or network service is required.

The domain model also contains iterations, labels and comments, but this preview does **not** yet expose them in the UI or agent tools. Shared-board assignment, default board, deletion and cross-workspace/session-without-workspace linking are not exposed yet. Agents cannot create or edit tasks through tools in this preview. The full project design and future integrations are broader than this first stage.

## Requirements and installation

- DeepSeek Harness **0.2.1-rc.5**; other versions are not yet tested.
- Node.js **24 or newer** with `node:sqlite` available (this Node API reports itself as experimental).
- A POSIX, local, same-host filesystem, a single trusted OS user and a writable DSH home. Windows, network filesystems and multi-user isolation are not supported by this preview.
- Harness services: Connection, WorkspaceRegistry, Tools, Approval; without them Cordis will not activate the plugin.

Install the bundle directory using the Harness Plugin Manager (`install_bundle`); the manager updates the selected profile and can affect all its sessions. Review the code before enabling any Host plugin. Do not edit the profile's package or patch files by hand. If replacing an already installed package, a Host restart may be required. Check the manager's activation result rather than assuming installation succeeded.

The original authoring instructions for this DSH build require using the Plugin Manager instead of manually modifying profile files. The `npm run build` command checks syntax and package completeness; it is not a generated Typert RPC or browser build. Package-manager scripts are not required.

## Development

```sh
npm test
npm run build
npm audit --omit=dev --ignore-scripts
npm pack --dry-run --ignore-scripts
```

Tests use temporary synthetic data. A passing unit test or build does not establish browser integration, working authentication, or behavior of another DSH release.

## Storage and security limitations

The plugin owns a dedicated SQLite database at `$DSH_HOME/storages/dsh-board/board.sqlite` (`~/.dsh` if unset). Its directory must be canonical, owned by the running user and mode `0700`; the database must be mode `0600`. SQLite transactions compare revisions under `BEGIN IMMEDIATE`, so conflicting writes to the **same database** fail rather than silently overwriting. All writers must use the same absolute path on a local filesystem. Changing the database, SQLite journal mode, its directory or sidecars outside the plugin is unsupported. The checks do not defend against an adversarial process running as the same OS user. Do not point this dedicated path to an unrelated database: SQLite may recover a hot journal before the schema check.

Initial creation is fail-closed. A crash during first initialization can leave an empty or unsupported file and the plugin may refuse to start. Do not delete it automatically: stop all writers, preserve a backup, verify with the owner that no data exists, then explicitly recover or recreate it. A simultaneous first open may also require retry. `synchronous=FULL` is not a proof against every power failure; power-loss and filesystem fault tests remain open. SQLite's synchronous lock wait can block the Host event loop for up to five seconds.

The HTTP endpoints are registered with DSH Connection, whose authenticated exact-route dispatch denies non-owner peers. They are **not** multi-user resource ACLs; snapshots contain owner-visible board and link data. A session's membership is checked through the Host's workspace registry, which is a cached per-process view. Multiple DSH Host processes sharing one home can have inconsistent workspace membership even though the board database prevents lost updates; run only one Host per DSH home until cross-process membership synchronization is verified. Archive/unarchive and workspace changes can race linking. The agent tool requires the Host approval service and one-time approval; approval events may contain target IDs in the session log. SQLite commits and session-log approval events are not one atomic transaction.

Correctly routed POST bodies are limited to 64 KiB, the stored aggregate to 4 MiB and a projected snapshot to 8 MiB. Concurrent handler requests and pending operations are bounded; this is a small-board preview, not a load-tested capacity claim. The DSH HTTP carrier can buffer unmatched methods and GET request bodies before the plugin handler, up to its separately configured global limit; these plugin limits do not bound that carrier-level exposure. Restrict access to trusted owner clients and configure carrier limits as appropriate.

Drafts and uncertain-operation protection live only in browser memory. Closing or refreshing the page can discard a draft; a save with unknown outcome must be checked before retrying. After a successful refresh, the application asks for explicit acknowledgment before another write; the old request may still win the revision race. There is no durable operation idempotency or guaranteed exactly-once behavior.

The plugin stores local data in plaintext SQLite. Same-UID agents can access it; no secret, private Tracker/GitHub task or conversation transcript is required to operate it. Status values and test fixtures are synthetic. Security questions or vulnerability reports should not include credentials or private task content.

## License

No open-source license has been selected yet. The source is visible for review, but no additional license grant is implied; a license will be added after the owner chooses one.
