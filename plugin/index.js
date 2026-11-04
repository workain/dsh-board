import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createBoardService } from './service.mjs';

export const name = 'dsh-board';
export const inject = ['connection', 'workspaceRegistry', 'tools', 'approval'];

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
