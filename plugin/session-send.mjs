// Enqueue only: the caller owns confirmation, link/authorization validation and UI.
// Results and progress deliberately contain no prompt text or raw exceptions.
const MAX_TARGETS = 20;
const MAX_TEXT_BYTES = 48 * 1024;

// These failures are raised during gateway validation or before admission. In
// particular, do not treat session/agent-busy as definite: the host wraps
// generic failures even when followup() may already have been called.
const DEFINITE_REJECTIONS = new Set([
  'gateway/bad-request',
  'gateway/arguments-invalid',
  'gateway/input-invalid',
  'gateway/interactions-forbidden',
  'session/not-found',
  'session/migration-required',
  'session/attachment-invalid',
]);

/**
 * Build an isolated, serialized sender. validateSession(id) must resolve to
 * true only while the selected session remains authorized and linked.
 *
 * send() returns { state, targets }, with state complete, stopped, or unknown,
 * and targets in selection order as { id, status } (accepted, not-sent, or
 * unknown). Progress receives independent copies of that same shape. An
 * invalid argument rejects before acquiring or sending to any session.
 */
export function createSessionSender({ sessions, validateSession }) {
  if (typeof sessions?.using !== 'function' || typeof validateSession !== 'function') {
    throw new TypeError('A sessions service and validateSession function are required');
  }

  let tail = Promise.resolve();

  async function send(targetIds, text, { signal, onProgress } = {}) {
    if (!Array.isArray(targetIds) || targetIds.length === 0 ||
        targetIds.some(id => typeof id !== 'string' || id.length === 0)) {
      throw new TypeError('Target IDs must be nonempty strings');
    }
    const ids = [...new Set(targetIds)];
    if (ids.length !== targetIds.length) throw new TypeError('Duplicate target sessions');
    if (ids.length > MAX_TARGETS) throw new RangeError('Too many target sessions');
    if (typeof text !== 'string' || text.trim().length === 0 ||
        new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
      throw new TypeError('Text must be nonempty and no larger than 48 KiB');
    }
    if (onProgress !== undefined && typeof onProgress !== 'function') {
      throw new TypeError('onProgress must be a function');
    }

    // Each call takes its place immediately; its releases are independent of
    // failures in earlier batches. No caller's queued batch can interleave.
    const predecessor = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await predecessor;
    try {
      const targets = ids.map(id => ({ id, status: 'not-sent' }));
      let state = 'stopped';
      const report = () => {
        if (!onProgress) return;
        try { onProgress({ state, targets: targets.map(target => ({ ...target })) }); } catch { /* UI callbacks cannot affect delivery. */ }
      };

      for (const target of targets) {
        if (signal?.aborted) break;
        let dispatched = false;
        let outcome = 'not-sent';
        try {
          if (await validateSession(target.id) !== true || signal?.aborted) break;
          await sessions.using(target.id, { source: 'controllerOperation', signal }, async ref => {
            await ref.ready;
            const session = ref.binding.session;
            const validSnapshot = () => {
              const snapshot = session.getSnapshot();
              return ref.sessionId === target.id && session.sessionId === target.id &&
                snapshot?.sessionId === target.id && snapshot.openState === 'open' &&
                !snapshot.removed && !snapshot.subagent;
            };
            if (signal?.aborted || !validSnapshot()) return;
            if (await validateSession(target.id) !== true || signal?.aborted || !validSnapshot()) return;

            let handle;
            try {
              handle = session.beginSubmission({ mode: 'queue', text, attachments: [] });
              // A synchronous abort during echo creation must not reach prompt.
              if (signal?.aborted) return;
              dispatched = true;
              const result = await session.prompt([{ type: 'text', text }], 'queue', signal, handle.requestId);
              if (signal?.aborted) outcome = 'unknown';
              else if (result?.ok === true && result.value?.accepted === true) outcome = 'accepted';
              else if (result?.ok === false && DEFINITE_REJECTIONS.has(result.error?.code)) outcome = 'not-sent';
              else outcome = 'unknown';
            } finally {
              if (handle && !dispatched) handle.abandon();
            }
          });
        } catch {
          // The prompt may have reached the host even when it threw or a
          // reference release failed. Never retry an uncertain request.
          if (dispatched && outcome !== 'accepted' && outcome !== 'not-sent') outcome = 'unknown';
          else if (dispatched && outcome === 'not-sent') outcome = 'unknown';
        }
        target.status = outcome;
        if (outcome === 'unknown') state = 'unknown';
        else if (outcome === 'accepted' && targets.every(item => item.status === 'accepted')) state = 'complete';
        report();
        if (outcome !== 'accepted') break;
      }
      return { state, targets: targets.map(target => ({ ...target })) };
    } finally {
      release();
    }
  }
  return { send };
}
