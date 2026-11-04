import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createBoardService } from './service.mjs';

export const name = 'dsh-board';
export const inject = ['connection', 'workspaceRegistry', 'tools', 'approval'];

// A separate fiber keeps missing Tracker dependencies or route failures from
// disabling the local board. Bootstrap modules and storage only on first use.
export const trackerPlugin = {
  name: 'dsh-board-tracker',
  inject: ['connection', 'workspaceRegistry', 'profileContext', 'credentials'],
  apply(ctx) {
    let disposed = false, initializing, settings, service, credentialFlight;
    const stop = new AbortController();
    const unavailable = request => {
      try { Promise.resolve(request.body?.cancel()).catch(() => {}); } catch {}
      return new Response(JSON.stringify({ error: { code: 'unavailable' } }), { status: 503, headers: {
        'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      } });
    };
    async function bootstrap() {
      const [{ openTrackerSettings }, { createTrackerClient }, { createTrackerFetch }, { createTrackerService }] = await Promise.all([
        import('./tracker-settings.mjs'), import('./tracker-api.mjs'), import('./tracker-fetch.mjs'), import('./tracker-service.mjs'),
      ]);
      if (disposed) throw new Error('Tracker stopped');
      const { name: profileId, home } = ctx.profileContext;
      if (typeof home !== 'string' || !path.isAbsolute(home) || path.normalize(home) !== home) throw new Error('Invalid profile home');
      // Unlike local board startup, Tracker never creates or repairs the parent.
      const directory = path.join(home, 'storages', 'dsh-board');
      let opened;
      try {
        opened = openTrackerSettings({ directory, profileId });
        const tracker = createTrackerClient({ fetch: createTrackerFetch(), async getCredentials() {
          if (disposed) throw new Error('Tracker stopped');
          const state = opened.read(), orgType = state.settings.connection?.orgType;
          if (!orgType) throw new Error('Tracker not configured');
          // A provider may ignore cancellation: allow at most one pair of
          // outstanding resolutions, even after the requesting call aborts.
          // Never reuse an older revision for a new configuration.
          if (credentialFlight && credentialFlight.revision !== state.revision) throw new Error('Tracker configuration changed');
          if (!credentialFlight) {
            const flight = { revision: state.revision };
            // CredentialRef is a compile-time string brand; these are fixed server refs.
            // allSettled holds the slot until BOTH providers have settled, including
            // when one rejects immediately and the other remains stuck.
            flight.result = Promise.allSettled([
              Promise.resolve().then(() => ctx.credentials.resolve('YANDEX_TRACKER_TOKEN')),
              Promise.resolve().then(() => ctx.credentials.resolve('YANDEX_TRACKER_ORG_ID')),
            ]).then(results => {
              if (results.some(result => result.status !== 'fulfilled')) throw new Error('Tracker credentials unavailable');
              return results.map(result => result.value);
            });
            credentialFlight = flight;
            flight.result.then(() => { if (credentialFlight === flight) credentialFlight = undefined; }, () => { if (credentialFlight === flight) credentialFlight = undefined; });
          }
          const [token, orgId] = await credentialFlight.result;
          if (disposed || opened.read().revision !== state.revision) throw new Error('Tracker configuration changed');
          if (!token?.value || !orgId?.value) throw new Error('Tracker credentials unavailable');
          return { token: token.value, tokenType: 'OAuth', orgId: orgId.value, orgType };
        } });
        const created = createTrackerService({ settings: opened, tracker, workspaceRegistry: ctx.workspaceRegistry });
        if (typeof created.close !== 'function') throw new Error('Tracker service lifecycle unsupported');
        if (disposed) throw new Error('Tracker stopped');
        settings = opened; service = created;
        return created;
      } catch (error) {
        opened?.close();
        throw error;
      }
    }
    async function fetch(request) {
      if (disposed) return unavailable(request);
      if (!initializing) {
        initializing = bootstrap();
        // Permit a transient initialization error to be retried by a later request.
        initializing.catch(() => { initializing = undefined; });
      }
      try {
        const ready = await initializing;
        if (disposed || request.signal.aborted) return unavailable(request);
        const signal = AbortSignal.any([request.signal, stop.signal]);
        return await ready.fetch(new Request(request, { signal }));
      } catch { return unavailable(request); }
    }
    let closing;
    const close = () => {
      if (!closing) {
        disposed = true;
        // Signal the service itself first so in-flight requests observe its
        // shutdown reason, then cancel any request still in lazy bootstrap.
        let drain;
        try { drain = service?.close(); } catch { drain = Promise.reject(new Error('Tracker close failed')); }
        stop.abort();
        closing = (async () => {
          if (initializing) { try { await initializing; } catch {} }
          try { await drain; } finally { settings?.close(); }
        })();
      }
      return closing;
    };
    // Register cleanup before both routes so unload unregisters routes first.
    const disposeStore = ctx.effect(() => close, 'dsh-board-tracker: close');
    let disposeRead;
    try {
      disposeRead = ctx.effect(() => ctx.connection.fetch.register({
        path: '/api/dsh-board.tracker', methods: ['GET'], requestBody: 'buffered', fetch,
      }), 'dsh-board-tracker: owner read route');
      ctx.effect(() => ctx.connection.fetch.register({
        path: '/api/dsh-board.tracker.mutate', methods: ['POST'], requestBody: 'streaming', fetch,
      }), 'dsh-board-tracker: owner write route');
    } catch (error) {
      try { Promise.resolve(disposeRead?.()).catch(() => {}); } catch {}
      try { Promise.resolve(disposeStore()).catch(() => {}); } catch {}
      throw error;
    }
  },
};

// Resolve only: importing this plugin never creates files in a profile or home.
export function boardDatabasePath(env = process.env) {
  let home = env.DSH_HOME?.trim() ? env.DSH_HOME : path.join(homedir(), '.dsh');
  if (home === '~') home = homedir();
  else if (home.startsWith('~/') || home.startsWith('~\\')) home = path.join(homedir(), home.slice(2));
  return path.join(path.resolve(home), 'storages', 'dsh-board', 'board.sqlite');
}
function privateDirectory(dir) {
  // Never follow an existing symlink or silently repair unsafe permissions.
  const parts = dir.slice(path.parse(dir).root.length).split(path.sep).filter(Boolean);
  let current = path.parse(dir).root;
  for (const part of parts) {
    current = path.join(current, part);
    let st;
    try { st = lstatSync(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { mkdirSync(current, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      st = lstatSync(current);
    }
    if (!st.isDirectory() || st.isSymbolicLink() || realpathSync(current) !== current) throw new Error('Unsafe board storage path');
  }
  const st = lstatSync(dir);
  if (typeof process.getuid !== 'function' || st.uid !== process.getuid() || (st.mode & 0o7777) !== 0o700) throw new Error('Board storage directory must be user-owned and mode 0700');
}
export async function apply(ctx) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('dsh-board requires Node.js >=24');
  const filename = boardDatabasePath();
  const { openBoardStore } = await import('./sqlite-store.mjs');
  privateDirectory(path.dirname(filename));
  // An existing empty or unsupported database fails closed. Never replace it
  // automatically; recovery requires explicit owner verification.
  const store = openBoardStore({ path: filename });
  let service;
  try {
    service = createBoardService(store, ctx.workspaceRegistry);
    ctx.effect(() => () => service.close(), 'dsh-board: store close');
    ctx.effect(() => ctx.connection.fetch.register({
      path: '/api/dsh-board', methods: ['GET'], requestBody: 'buffered',
      fetch: request => service.fetch(request),
    }), 'dsh-board: owner read route');
    ctx.effect(() => ctx.connection.fetch.register({
      path: '/api/dsh-board.mutate', methods: ['POST'], requestBody: 'streaming',
      fetch: request => service.fetch(request),
    }), 'dsh-board: owner write route');
    // This optional child owns its own routes and resources; it never gates the
    // local board if its dependencies or initialization are unavailable.
    try { ctx.plugin(trackerPlugin); } catch { /* local board remains available */ }
    ctx.tools.register({
      name: 'board_link_session',
      description: 'Link or unlink the calling agent’s own session to an existing board task in its actual workspace. The workspace and task must already exist.',
      parameters: {
        type: 'object', additionalProperties: false,
        required: ['workspaceId', 'boardId', 'taskId', 'linked'],
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID containing this session and the board.' },
          boardId: { type: 'string', description: 'Board ID assigned to the workspace.' },
          taskId: { type: 'string', description: 'Task ID on that board.' },
          linked: { type: 'boolean', description: 'True to link, false to unlink.' },
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, required: ['revision', 'linked'], properties: {
          revision: { type: 'integer' }, linked: { type: 'boolean' },
        } },
        render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
      },
      async execute(args, exec) {
        if (exec.agent?.id === undefined) throw new Error('board_link_session requires a caller agent');
        exec.signal?.throwIfAborted();
        if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !['workspaceId', 'boardId', 'taskId', 'linked'].includes(key)) || ['workspaceId', 'boardId', 'taskId'].some(key => typeof args[key] !== 'string' || args[key].length > 256 || !/^[A-Za-z0-9_-]+$/.test(args[key])) || typeof args.linked !== 'boolean') throw new Error('Invalid board-link request');
        const target = `workspace ${args.workspaceId}; board ${args.boardId}; task ${args.taskId}`;
        const reason = `${args.linked ? 'Link' : 'Unlink'} the current session: ${target}`;
        const answer = await ctx.approval.request({ agent: exec.agent, toolName: 'board_link_session', callId: exec.callId, reason, signal: exec.signal });
        if (answer !== 'allowed-once') throw new Error('Board link was not approved');
        return service.linkCurrentSession(args, String(exec.agent.id), exec.signal);
      },
    });
  } catch (error) {
    await (service ? service.close() : store.close());
    throw error;
  }
}
