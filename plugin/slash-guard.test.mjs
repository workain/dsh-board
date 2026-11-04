import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';

// This exercises the actual plugin source in the same loader shape as client.test.mjs.
// No browser, profile, host server, network or writes are involved.
const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');
function loadPlugin() {
  let registration;
  const window = { __ModuleLoader__: { load(value) { registration = value; } } };
  vm.runInNewContext(client, { window }, { filename: 'client.js' });
  return registration.factory(name => {
    assert.equal(name, 'react');
    return { createElement() {} };
  });
}
function harness(language = 'ru') {
  const sources = [], commands = [], disposers = [];
  let dictionaries, networkCalls = 0;
  const snapshot = { getSnapshot: () => ({ id: 1 }), subscribe: () => () => {} };
  const ctx = {
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    locale: {
      register(_ns, value) { dictionaries = value; return () => {}; },
      bind() { return key => dictionaries[language][key] ?? key; },
    },
    slots: { inject() {}, register() {} },
    connection: { generation: snapshot }, workspaces: { list: snapshot }, sessions: { list: snapshot },
    uiWorkspace: { openSession() {} }, layout: { selectPanel() {} },
    commandUi: { register(command) { commands.push(command); return () => {}; } },
    inputTriggers: { registerSource(source) { sources.push(source); return () => { const i = sources.indexOf(source); if (i !== -1) sources.splice(i, 1); }; } },
    remote: new Proxy({}, { get() { networkCalls++; throw Error('unexpected host RPC'); } }),
  };
  const plugin = loadPlugin();
  plugin.apply(ctx);
  const guard = sources.find(source => source.trigger === '/' && source.name === 'board-args-guard');
  assert.ok(guard, 'plugin must register the board argument guard');
  assert.ok(plugin.inject.includes('inputTriggers'), 'inputTriggers must be a required dependency');
  return { guard, sources, commands, disposers, get networkCalls() { return networkCalls; } };
}
const signal = () => new AbortController().signal;
const session = { sessionId: 'local-test' };
const envelope = { attachments: 0 };

// Composer sends a trimmed draft to matchEnter; this includes whitespace, newlines,
// malformed arguments and attachments. The error must not echo entered text.
for (const language of ['en', 'ru']) {
  test(`guard refuses arguments without echo, in ${language}`, async () => {
    const h = harness(language);
    const messages = new Set();
    for (const line of ['/board secret', '/board\tsecret', '/board\nsecret', '/board\r\nsecret', '/board\u00a0secret', '/board \u200b', '/board --bad "unterminated']) {
      await assert.rejects(h.guard.matchEnter(session, line, signal(), envelope), error => {
        assert.equal(typeof error.message, 'string');
        assert.ok(error.message.length > 0);
        assert.notEqual(error.message, 'boardArgsUnsupported', 'message must resolve to localized copy');
        assert.ok(!error.message.includes('secret'));
        assert.ok(!error.message.includes('unterminated'));
        messages.add(error.message);
        return true;
      });
    }
    assert.equal(messages.size, 1, 'all invalid inputs must give the same safe error');
    await assert.rejects(h.guard.matchEnter(session, '/board secret', signal(), { attachments: 1 }));
    assert.equal(h.networkCalls, 0);
  });
}

test('bare command and other command names remain available to existing sources', async () => {
  const h = harness();
  for (const line of ['/board', '/Board foo', '/boardx foo', '/other foo']) {
    assert.equal(await h.guard.matchEnter(session, line, signal(), envelope), undefined, line);
  }
  assert.equal(h.commands.filter(c => c.name === 'board').length, 1);
  for (const dispose of h.disposers.reverse()) dispose();
  assert.equal(h.sources.length, 0, 'guard is effect-owned');
});

// The package exports a browser loader bundle, not a Node module. Prefer an explicit
// installed checkout when provided; otherwise resolve a locally installed package.
// DSH_ROOT is a checkout root, not a profile. A missing optional runtime skips only
// the actual-controller test; an explicitly supplied but invalid path fails loudly.
async function loadController() {
  let path;
  if (process.env.DSH_ROOT) path = join(process.env.DSH_ROOT, 'node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js');
  else {
    try { path = createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-ui-input-trigger/client'); }
    catch (error) { if (error.code === 'MODULE_NOT_FOUND') return undefined; throw error; }
  }
  let registration;
  vm.runInNewContext(await readFile(path, 'utf8'), { window: { __ModuleLoader__: { load(value) { registration = value; } } }, console }, { filename: path });
  const store = { createSnapshotStore(initial) { let value = initial; return { getSnapshot: () => value, set(next) { value = next; }, subscribe() { return () => {}; } }; } };
  const deps = { '@deepseek-ai/cordis': { Service: class {} }, '@deepseek-ai/dsh-client-store': store, 'react/jsx-runtime': {}, '@deepseek-ai/dsh-client-ui-primitives': {}, react: {} };
  return registration.factory(name => { assert.ok(Object.hasOwn(deps, name), `unexpected runtime dependency: ${name}`); return deps[name]; }).InputTriggerController;
}

test('actual InputTriggerController respects the guard after a non-claiming command', async t => {
  const Controller = await loadController();
  if (!Controller) return t.skip('Set DSH_ROOT to an installed DSH checkout to exercise its actual controller');
  const h = harness();
  const calls = [];
  // Model the relevant current ui-commands contribution branch only; this is not
  // a replacement for an end-to-end test of ui-commands and SubmitMachine.
  const command = { trigger: '/', name: 'command', async matchEnter(_session, line) { calls.push('command'); return line === '/board' ? 'handled' : undefined; } };
  const sources = [command, h.guard];
  const controller = new Controller({ actx: {}, sessionId: 'local-test', roster: { all: () => sources, sources: trigger => sources.filter(source => source.trigger === trigger) } });
  try {
    await assert.rejects(controller.adjudicate('/board secret', signal(), envelope), error => !error.message.includes('secret'));
    assert.equal(await controller.adjudicate('/board', signal(), envelope), 'handled');
    assert.deepEqual(calls, ['command', 'command']);
    // Adjudication is registration-order, irrespective of the source `order`.
    sources.unshift({ trigger: '/', name: 'prior', async matchEnter() { return 'handled'; } });
    assert.equal(await controller.adjudicate('/board secret', signal(), envelope), 'handled');
  } finally { controller.dispose(); }
});
