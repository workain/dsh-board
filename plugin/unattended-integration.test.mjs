import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Like shared-editor-integration.test.mjs, use the installed shell's own React
// and ReactDOM, but route all browser traffic to synthetic in-memory assets.
// DSH_ROOT=/path/to/deepseek-harness PYTHON=/path/to/python node --test plugin/unattended-integration.test.mjs
const assets = join(process.env.DSH_ROOT || join(homedir(), '.local/share/deepseek-harness'), 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets');
const python = process.env.PYTHON || 'python3';
let shell, vendorName, vendor, skipReason;
try {
  const files = await readdir(assets);
  const name = files.find(file => /^index-.*\.js$/.test(file));
  if (!name) skipReason = `DSH shell bundle unavailable in ${assets}`;
  else {
    const original = await readFile(join(assets, name), 'utf8');
    const marker = 'const Ls=globalThis.dshDesktopBoot,';
    assert.ok(original.includes(marker) && original.includes('function OZ(){return{react:'), 'unsupported shell bundle layout');
    shell = original.slice(0, original.indexOf(marker)) + '\nwindow.__TEST_MODULES__ = OZ();\n';
    vendorName = original.match(/from\s*["']\.\/(vendor-[^"']+\.js)["']/)?.[1];
    assert.ok(vendorName, 'shell vendor bundle is required');
    vendor = await readFile(join(assets, vendorName), 'utf8');
  }
} catch (error) {
  if (error.code === 'ENOENT') skipReason = `DSH assets unavailable: ${error.message}`;
  else throw error;
}
if (!skipReason) {
  const probe = spawnSync(python, ['-c', 'from playwright.sync_api import sync_playwright'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT' || (probe.status !== 0 && /No module named ['"]?playwright/.test(probe.stderr))) skipReason = `Python Playwright unavailable (${python})`;
  else assert.equal(probe.status, 0, `Playwright probe failed: ${probe.stderr}`);
}

const fixture = String.raw`
const React = window.__TEST_MODULES__.react;
const ReactDOM = window.__TEST_MODULES__['react-dom/client'];
const h = React.createElement;
let plugin;
window.__ModuleLoader__ = { load(value) { plugin = value.factory(name => {
  if (name !== 'react') throw Error('unexpected module: ' + name);
  return React;
}); } };
window.__ModuleLoader__.load(window.__registration__);
const source = initial => { let value = initial; const listeners = new Set(); return {
  getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  set(next) { value = next; for (const fn of listeners) fn(); },
}; };
const slots = new Map();
const workspaces = source({ phase: 'ready', state: 'ready', items: [
  { workspaceId: 'w-one', title: 'First workspace', createdAt: '2026-01-01T00:00:00Z', sessionIds: ['session-1'] },
  { workspaceId: 'w-two', title: 'Second workspace', createdAt: '2026-01-02T00:00:00Z', sessionIds: [] },
], archivedSessionIds: [] });
const sessions = source({ phase: 'ready', ids: ['session-1'], byId: { 'session-1': { title: 'Session' } } });
const connection = source({ id: 1, host: { home: '/' } });
const mounted = source('session-1'), panelInfo = source({ activePanelId: 'dsh-board' });
const ctx = {
  effect(fn) { fn(); }, locale: { register() {}, bind: () => key => key },
  slots: { inject(_name, fn) { fn(); }, register(spec, component) { slots.set(spec.name, { spec, component }); } },
  commandUi: { register() {} }, inputTriggers: { registerSource() {} },
  sidebarRight: { mounted, openTab() {} }, sidebarRightTabs: { register() {} },
  connection: { generation: connection }, workspaces: { list: workspaces }, sessions: { list: sessions },
  uiWorkspace: { openSession() {} }, layout: { panelInfo, selectPanel() {} },
};
let settings = { revision: 7, configured: true, orgType: 'cloud', workspaces: { 'w-one': ['1'], 'w-two': ['2'] }, needsReselect: [], unattendedIssueCreation: {}, unattendedIssueCreationStored: {} };
if (['unbound-disable', 'offline-revoke', 'delayed-stale-settings'].includes(window.__scenario__)) settings = { ...settings, needsReselect: ['w-one'], unattendedIssueCreation: { 'w-one': false }, unattendedIssueCreationStored: { 'w-one': true } };
window.testRequests = [];
window.testReadbacks = [];
window.testWarnings = [];
window.pendingSettingsReleases = [];
window.releasedSettingsReads = 0;
window.releaseStaleSettings = () => { for (const release of window.pendingSettingsReleases.splice(0)) release(); };
window.confirmResult = false;
window.confirm = message => { window.testWarnings.push(message); return window.confirmResult; };
window.fetch = async (path, options) => {
  const url = String(path), method = options?.method;
  const cmd = options?.body ? JSON.parse(options.body) : null;
  window.testRequests.push({ url, method, cmd });
  let value;
  if (url === 'api/dsh-board' && method === 'GET') value = { revision: 1, boards: [], links: [] };
  else if (url === 'api/dsh-board.tracker' && method === 'GET') {
    if (window.__scenario__ === 'offline-revoke') {
      window.pendingTrackerReads = (window.pendingTrackerReads || 0) + 1;
      return await new Promise(() => {}); // Never resolves, even after revocation.
    }
    value = structuredClone(settings);
    if (window.__scenario__ === 'delayed-stale-settings' && !window.testRequests.some(r => r.cmd?.op === 'configuration.setUnattendedIssueCreation')) {
      await new Promise(resolve => { window.pendingSettingsReleases.push(resolve); });
      window.releasedSettingsReads++;
    }
    if (window.testRequests.some(r => r.cmd?.op === 'configuration.setUnattendedIssueCreation')) {
      if (window.__scenario__ === 'stale-readback') value.revision--;
      if (window.__scenario__ === 'wrong-value') {
        value.unattendedIssueCreation['w-one'] = false;
        value.unattendedIssueCreationStored['w-one'] = false;
      }
    }
    window.testReadbacks.push(value);
  }
  else if (url === 'api/dsh-board.tracker.mutate' && method === 'POST' && cmd.op === 'configuration.unattendedRead') {
    value = { revision: settings.revision, unattendedIssueCreationStored: Object.fromEntries(Object.keys(settings.workspaces).map(id => [id, settings.unattendedIssueCreationStored[id] === true])) };
    window.testReadbacks.push(value);
  }
  else if (url === 'api/dsh-board.tracker.mutate' && method === 'POST' && cmd.op === 'configuration.setUnattendedIssueCreation') {
    if (cmd.expectedRevision !== settings.revision) throw Error('bad settings revision');
    // Surviving bindings are retagged on revoke. Account changes may still
    // independently invalidate them, which is modeled in a separate scenario.
    const needsReselect = !cmd.enabled && window.__scenario__ === 'disable-binding-loss' ? Object.keys(settings.workspaces) : settings.needsReselect;
    settings = { ...settings, revision: settings.revision + 1, needsReselect,
      unattendedIssueCreationStored: { ...settings.unattendedIssueCreationStored, [cmd.workspaceId]: cmd.enabled },
      unattendedIssueCreation: { ...settings.unattendedIssueCreation, [cmd.workspaceId]: cmd.enabled && !needsReselect.includes(cmd.workspaceId) },
    };
    value = { revision: settings.revision, workspaceId: cmd.workspaceId, enabled: cmd.enabled };
  } else throw Error('unexpected fetch ' + url + ' ' + method + ' ' + JSON.stringify(cmd));
  return { ok: true, status: 200, json: async () => value };
};
plugin.apply(ctx);
const main = slots.get('main');
if (!main) throw Error('main slot not registered');
ReactDOM.createRoot(document.getElementById('root')).render(h(main.component, { t: key => key, ...main.spec.inject() }));
`;

// The browser only receives these bytes via stdin, and all requests are routed.
const runner = String.raw`
import json, sys
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
payload = json.load(sys.stdin)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.set_default_timeout(5000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def route_handler(route):
        path = urlparse(route.request.url).path
        files = {
          '/': ('text/html', '<!doctype html><div id="root"></div><script type="module" src="/shell.js"></script>'),
          '/shell.js': ('text/javascript', payload['shell']),
          '/' + payload['vendorName']: ('text/javascript', payload['vendor']),
        }
        if path not in files:
            errors.append('unexpected network: ' + route.request.url)
            route.abort()
            return
        content_type, body = files[path]
        route.fulfill(status=200, content_type=content_type, body=body)
    page.route('**/*', route_handler)
    try:
        page.goto('http://fixture.invalid/', wait_until='load')
        page.wait_for_function('window.__TEST_MODULES__ !== undefined')
        page.add_script_tag(content='window.__scenario__=' + json.dumps(payload['scenario']) + '; window.__ModuleLoader__={load(value){window.__registration__=value;}};\n' + payload['client'] + payload['fixture'])
        page.locator('.dsh-board-context select').first.select_option('w-one')
        page.get_by_role('button', name='trackerConnect', exact=True).click()
        if payload['scenario'] in ('offline-revoke', 'delayed-stale-settings'):
            if payload['scenario'] == 'offline-revoke':
                page.wait_for_function('window.pendingTrackerReads > 0')
            else:
                page.wait_for_function('window.pendingSettingsReleases.length > 0')
                assert page.evaluate('window.pendingSettingsReleases.length') == 1, 'initial settings fetch should not duplicate when opening settings'
            page.get_by_role('button', name='trackerLocalPermissionRead', exact=True).click()
            page.get_by_role('status').filter(has_text='trackerLocalPermissionOn First workspace (w-one)').wait_for()
            page.get_by_role('button', name='trackerLocalPermissionRevoke', exact=True).click()
            page.get_by_role('status').filter(has_text='trackerLocalPermissionOff First workspace (w-one)').wait_for()
            if payload['scenario'] == 'offline-revoke':
                assert page.evaluate('window.pendingTrackerReads') > 0, 'normal settings reads must remain pending'
            else:
                page.evaluate('window.releaseStaleSettings()')
                page.wait_for_function('window.releasedSettingsReads > 0')
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                assert page.get_by_role('status').filter(has_text='trackerLocalPermissionOff First workspace (w-one)').count() == 1, 'late stale settings must not overwrite the local readback'
                assert page.get_by_role('button', name='trackerLocalPermissionRevoke', exact=True).count() == 0
                assert page.get_by_role('checkbox', name='trackerUnattended', exact=True).count() == 0, 'pre-revocation Tracker settings must not become visible'
            commands = page.evaluate("window.testRequests.filter(r => r.cmd).map(r => r.cmd)")
            assert commands == [
              {'op': 'configuration.unattendedRead'},
              {'op': 'configuration.setUnattendedIssueCreation', 'workspaceId': 'w-one', 'expectedRevision': 7, 'enabled': False},
              {'op': 'configuration.unattendedRead'},
            ], commands
            assert page.evaluate("window.testReadbacks.filter(r => !Object.hasOwn(r, 'configured'))") == [
              {'revision': 7, 'unattendedIssueCreationStored': {'w-one': True, 'w-two': False}},
              {'revision': 8, 'unattendedIssueCreationStored': {'w-one': False, 'w-two': False}},
            ]
            assert page.evaluate('window.testWarnings') == []
            assert not errors, errors
            sys.exit(0)
        toggle = page.get_by_role('checkbox', name='trackerUnattended', exact=True)
        toggle.wait_for()
        if payload['scenario'] == 'unbound-disable':
            assert toggle.is_checked(), 'stored enabled setting must remain visible even when inactive'
            assert toggle.is_enabled(), 'unbound workspace must allow disabling the stored permission'
            assert page.get_by_text('trackerReselect', exact=True).count() >= 1
            assert page.get_by_text('trackerUnattendedInactive', exact=True).count() == 1
            toggle.click()
            page.get_by_role('status').filter(has_text='trackerLocalPermissionOff First workspace (w-one)').wait_for()
            page.get_by_text('trackerUnattendedSaved', exact=True).wait_for()
            assert toggle.count() == 0, 'full settings must be invalidated after local revoke'
            assert page.evaluate('window.testWarnings') == [], 'disabling must not ask for approval'
            requests = page.evaluate('window.testRequests')
            commands = [r['cmd'] for r in requests if r['cmd']]
            assert commands == [
              {'op': 'configuration.setUnattendedIssueCreation', 'workspaceId': 'w-one', 'expectedRevision': 7, 'enabled': False},
              {'op': 'configuration.unattendedRead'},
            ], commands
            readback = page.evaluate('window.testReadbacks.at(-1)')
            assert readback == {'revision': 8, 'unattendedIssueCreationStored': {'w-one': False, 'w-two': False}}, readback
            page.get_by_role('button', name='trackerReload', exact=True).click()
            toggle.wait_for()
            assert not toggle.is_checked()
            fresh = page.evaluate('window.testReadbacks.at(-1)')
            assert fresh['revision'] == 8 and fresh['needsReselect'] == ['w-one']
            assert fresh['unattendedIssueCreationStored']['w-one'] is False and fresh['unattendedIssueCreation']['w-one'] is False
            assert page.evaluate("window.testRequests.filter(r => r.cmd).map(r => r.cmd)") == commands, 'reload must not write'
            assert not errors, errors
            sys.exit(0)
        assert not toggle.is_checked(), 'absent per-workspace setting must default off'
        toggle.click()
        assert not toggle.is_checked(), 'cancel must leave the setting disabled'
        assert page.evaluate('window.testWarnings') == ['trackerUnattendedWarning\nworkspace: First workspace (w-one)']
        assert not page.evaluate("window.testRequests.some(r => r.cmd?.op === 'configuration.setUnattendedIssueCreation')")
        page.evaluate('window.confirmResult = true')
        toggle.click()
        page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'configuration.setUnattendedIssueCreation' && r.cmd.enabled === true)")
        if payload['scenario'] in ('stale-readback', 'wrong-value'):
            page.get_by_role('alert').get_by_text('trackerUncertain', exact=True).wait_for()
            assert page.get_by_text('trackerUnattendedSaved', exact=True).count() == 0
            assert toggle.count() == 0, 'mismatching readback must not display a confirmed toggle'
            writes = page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'configuration.setUnattendedIssueCreation').map(r => r.cmd)")
            assert writes == [{'op': 'configuration.setUnattendedIssueCreation', 'workspaceId': 'w-one', 'expectedRevision': 7, 'enabled': True}], writes
            assert not errors, errors
            sys.exit(0)
        page.get_by_text('trackerUnattendedSaved', exact=True).wait_for()
        assert toggle.is_checked(), 'enabled only after settings readback'
        assert page.evaluate('window.testWarnings') == ['trackerUnattendedWarning\nworkspace: First workspace (w-one)'] * 2
        toggle.click()
        page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'configuration.setUnattendedIssueCreation' && r.cmd.enabled === false)")
        page.get_by_role('status').filter(has_text='trackerLocalPermissionOff First workspace (w-one)').wait_for()
        page.get_by_text('trackerUnattendedSaved', exact=True).wait_for()
        assert toggle.count() == 0, 'full settings must be invalidated after local revoke'
        assert page.get_by_role('button', name='trackerReload', exact=True).is_enabled()
        assert page.evaluate('window.testWarnings.length') == 2, 'disabling should not ask for approval'
        readbacks = page.evaluate('window.testReadbacks')
        assert readbacks[-2]['revision'] == 8 and readbacks[-2]['unattendedIssueCreation']['w-one'] is True and readbacks[-2]['unattendedIssueCreationStored']['w-one'] is True, readbacks
        assert readbacks[-1] == {'revision': 9, 'unattendedIssueCreationStored': {'w-one': False, 'w-two': False}}, readbacks
        requests = page.evaluate('window.testRequests')
        writes = [r['cmd'] for r in requests if r['cmd'] and r['cmd'].get('op') == 'configuration.setUnattendedIssueCreation']
        assert writes == [
          {'op': 'configuration.setUnattendedIssueCreation', 'workspaceId': 'w-one', 'expectedRevision': 7, 'enabled': True},
          {'op': 'configuration.setUnattendedIssueCreation', 'workspaceId': 'w-one', 'expectedRevision': 8, 'enabled': False},
        ], writes
        for i, request in enumerate(requests):
            if request['cmd'] and request['cmd'].get('op') == 'configuration.setUnattendedIssueCreation':
                next_request = requests[i + 1]
                if request['cmd']['enabled']:
                    assert next_request['url'] == 'api/dsh-board.tracker' and next_request['method'] == 'GET', requests
                else:
                    assert next_request['cmd'] == {'op': 'configuration.unattendedRead'}, requests
        assert [r['cmd'] for r in requests if r['cmd']] == [writes[0], writes[1], {'op': 'configuration.unattendedRead'}], requests
        page.get_by_role('button', name='trackerReload', exact=True).click()
        toggle.wait_for()
        assert not toggle.is_checked(), 'explicitly reloaded settings must keep permission disabled'
        fresh = page.evaluate('window.testReadbacks.at(-1)')
        assert fresh['revision'] == 9 and fresh['unattendedIssueCreation']['w-one'] is False and fresh['unattendedIssueCreationStored']['w-one'] is False, fresh
        assert fresh['needsReselect'] == (['w-one', 'w-two'] if payload['scenario'] == 'disable-binding-loss' else []), fresh
        assert page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'configuration.setUnattendedIssueCreation').map(r => r.cmd)") == writes, 'reload must not write'
        assert not errors, errors
    except Exception:
        print('PAGE:', page.locator('body').inner_text(), file=sys.stderr)
        print('REQUESTS:', json.dumps(page.evaluate('window.testRequests')), file=sys.stderr)
        print('ERRORS:', errors, file=sys.stderr)
        raise
    finally:
        browser.close()
`;

for (const [name, scenario] of [
  ['requires workspace confirmation and exact readback', 'success'],
  ['allows disabling when bindings are independently lost', 'disable-binding-loss'],
  ['rejects stale revision in readback', 'stale-readback'],
  ['rejects wrong enabled value in readback', 'wrong-value'],
  ['allows disabling stored permission while workspace needs reselect', 'unbound-disable'],
  ['revokes locally while ordinary settings reads never resolve', 'offline-revoke'],
  ['fences stale settings after local revocation', 'delayed-stale-settings'],
]) test(`real React unattended creation ${name}`, { skip: skipReason || false }, async () => {
  const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const result = spawnSync(python, ['-c', runner], { input: JSON.stringify({ shell, vendorName, vendor, client, fixture, scenario }), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 20000 });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
});
