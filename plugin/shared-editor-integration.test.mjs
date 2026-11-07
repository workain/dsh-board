import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

// This is intentionally not a fake-hooks renderer. Extract the installed DSH
// shell's own React and ReactDOM, stopping before the application bootstrap.
// Playwright intercepts every request and only serves these synthetic assets.
// Optional explicit invocation (not part of npm test):
// DSH_ROOT=/path/to/deepseek-harness PYTHON=/path/to/python node --test plugin/shared-editor-integration.test.mjs
const assets = join(process.env.DSH_ROOT || join(homedir(), '.local/share/deepseek-harness'), 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets');
const python = process.env.PYTHON || 'python3';
let extractedShell, vendorFile, vendor, skipReason;
try {
  const files = await readdir(assets);
  const shellFile = files.find(name => /^index-.*\.js$/.test(name));
  if (!shellFile) skipReason = `DSH shell bundle unavailable in ${assets}`;
  else {
    const shell = await readFile(join(assets, shellFile), 'utf8');
    const marker = 'const Ls=globalThis.dshDesktopBoot,';
    assert.ok(shell.includes(marker) && shell.includes('function OZ(){return{react:'), 'unsupported shell bundle layout');
    extractedShell = shell.slice(0, shell.indexOf(marker)) + '\nwindow.__TEST_MODULES__ = OZ();\n';
    vendorFile = shell.match(/from\s*["']\.\/(vendor-[^"']+\.js)["']/)?.[1];
    assert.ok(vendorFile, 'shell vendor bundle is required');
    vendor = await readFile(join(assets, vendorFile), 'utf8');
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
const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');

const fixture = String.raw`
const React = window.__TEST_MODULES__.react;
const ReactDOM = window.__TEST_MODULES__['react-dom/client'];
const h = React.createElement;
let plugin;
window.__ModuleLoader__ = { load(value) { plugin = value.factory(name => {
  if (name !== 'react') throw Error('unexpected module: ' + name);
  return React;
}); } };
const source = initial => { let value = initial; const listeners = new Set(); return {
  getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  set(next) { value = next; for (const fn of listeners) fn(); },
}; };
const slots = new Map();
const workspaces = source({ phase: 'ready', state: 'ready', items: [{ workspaceId: 'w', title: 'Workspace', createdAt: '2026-01-01T00:00:00Z', sessionIds: ['session-1', 'session-2'] }], archivedSessionIds: [] });
const sessions = source({ phase: 'ready', ids: ['session-1', 'session-2'], byId: { 'session-1': { title: 'Session' }, 'session-2': { title: 'Second' } } });
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
let settings = { revision: 1, configured: true, orgType: 'cloud', workspaces: { w: ['1'] }, needsReselect: [] };
window.setSettings = patch => { settings = { ...settings, ...patch }; };
// Observe actual beforeunload registrations, not only synthetic event cancellation.
const unloadListeners = new Set();
const addEventListener = window.addEventListener.bind(window), removeEventListener = window.removeEventListener.bind(window);
window.addEventListener = (type, listener, options) => { if (type === 'beforeunload') unloadListeners.add(listener); return addEventListener(type, listener, options); };
window.removeEventListener = (type, listener, options) => { if (type === 'beforeunload') unloadListeners.delete(listener); return removeEventListener(type, listener, options); };
window.unloadCount = () => unloadListeners.size;
const issue = { id: 'issue-1', key: 'A-1', summary: 'Shared issue', description: 'Shared description', assigneeKnown: true, assignee: { id: 'u', display: 'User' }, status: { id: '1', key: 'open', display: 'Open' }, version: 5 };
const scenario = window.__scenario__;
const comment = (id, text) => ({ id, text, version: 1, createdBy: { id: 'u', display: 'Author' }, createdAt: '2026-01-01' });
let releasePage, releaseMutation, releaseAuth, delayAuth = false;
window.releasePage = () => releasePage?.();
window.releaseMutation = () => releaseMutation?.();
window.delayAuthorization = () => { delayAuth = true; };
window.releaseAuthorization = () => releaseAuth?.();
const board = { board: { id: '1', name: 'Tracker board' }, columns: [{ id: '10', name: 'Open', statuses: [issue.status] }], issues: [{ id: issue.id, key: issue.key, summary: issue.summary, status: issue.status }], issuesComplete: false, issuesReason: 'approximate_board_filter' };
let revision = 1, linked = scenario === 'pending' ? ['session-1', 'session-2'] : ['session-1'];
window.testRequests = [];
window.fetch = async (path, options) => {
  const url = String(path), method = options?.method;
  const cmd = options?.body ? JSON.parse(options.body) : null;
  window.testRequests.push({ url, method, cmd });
  let value;
  if (url === 'api/dsh-board' && method === 'GET') value = { revision: 1, boards: [], links: [] };
  else if (url === 'api/dsh-board.tracker' && method === 'GET') value = settings;
  else if (url === 'api/dsh-board.tracker.mutate' && method === 'POST') {
    const links = () => linked.map(sessionId => ({ issueKey: 'A-1', issueId: 'issue-1', sessionId }));
    switch (cmd.op) {
      case 'board.read': value = board; break;
      case 'links.read': value = { revision, links: links(), incomplete: false }; break;
      case 'links.session.read': value = { revision, links: linked.includes(cmd.sessionId) ? [{ boardId: '1', issueKey: 'A-1', issueId: 'issue-1', sessionId: cmd.sessionId }] : [], incomplete: false }; break;
      case 'links.issue.read':
        if (delayAuth) { delayAuth = false; await new Promise(resolve => { releaseAuth = resolve; }); window.authorizationReleased = true; }
        value = { revision, links: links(), incomplete: false }; break;
      case 'issue.read': value = issue; break;
      case 'issue.comments':
        if (scenario === 'pagination' || scenario === 'revoke') {
          if (!cmd.cursor) value = { comments: [comment('c1', 'Shared comment')], complete: false, nextCursor: '1' };
          else if (cmd.cursor === '1') {
            if (scenario === 'revoke') {
              await new Promise(resolve => { releasePage = resolve; });
              return { ok: false, status: 403, json: async () => ({ code: 'forbidden' }) };
            }
            value = { comments: [comment('c2', 'Second page comment')], complete: false, nextCursor: '2' };
          } else if (cmd.cursor === '2') value = { comments: [comment('c3', 'Third page comment')], complete: true, nextCursor: null };
          else throw Error('unexpected comment cursor ' + cmd.cursor);
        } else value = { comments: [comment('c1', 'Shared comment')], complete: true, nextCursor: null };
        break;
      case 'issue.transitions': value = [{ id: 'start', display: 'Start', to: { id: '2', key: 'doing', display: 'Doing' } }]; break;
      case 'issue.transition': issue.status = { ...cmd.expectedTo }; issue.version++; value = { ok: true }; break;
      case 'issue.comment':
        if (['pending', 'account-pending', 'link-comment'].includes(scenario)) { await new Promise(resolve => { releaseMutation = resolve; }); window.mutationReleased = true; }
        value = { id: 'new-comment' }; break;
      case 'links.set':
        if (cmd.expectedRevision !== revision) throw Error('bad link revision');
        linked = cmd.linked ? [...linked, cmd.sessionId] : linked.filter(id => id !== cmd.sessionId);
        revision++;
        value = { revision, links: links(), incomplete: false };
        break;
      default: throw Error('unexpected command ' + cmd.op);
    }
  } else throw Error('unexpected fetch ' + url + ' ' + method);
  return { ok: true, status: 200, json: async () => value };
};
window.confirm = () => true;
plugin.apply(ctx);
const main = slots.get('main'), sidebar = slots.get('sidebar.right.pane.tab');
if (!main || !sidebar) throw Error('expected slots not registered');
const root = ReactDOM.createRoot(document.getElementById('root'));
let tab = { visible: true, signal: new AbortController().signal };
window.showBoard = () => root.render(h(main.component, { t: key => key, ...main.spec.inject() }));
window.showSidebar = () => { tab = { ...tab, visible: true }; root.render(h(sidebar.component, { sessionId: 'session-1', useTabInfo: () => ({ tab }) })); };
window.hideSidebar = () => { tab = { ...tab, visible: false }; root.render(h(sidebar.component, { sessionId: 'session-1', useTabInfo: () => ({ tab }) })); };
window.setArchived = ids => workspaces.set({ ...workspaces.getSnapshot(), archivedSessionIds: ids });
window.setMembership = ids => workspaces.set({ ...workspaces.getSnapshot(), items: workspaces.getSnapshot().items.map(item => ({ ...item, sessionIds: ids })) });
window.setConnection = id => connection.set({ id, host: { home: '/' } });
window.showBoard();
`;

// Python Playwright is the only browser dependency; it receives all fixture
// bytes over stdin and never opens the actual DSH GUI or a local HTTP server.
const runner = String.raw`
import json, sys
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
payload = json.load(sys.stdin)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
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
        page.add_script_tag(content=payload['clientPrelude'] + payload['client'] + payload['fixture'])
        if payload['scenario'] in ('hidden', 'sole-close', 'hide-auth', 'membership-evict', 'archive-evict', 'settings-evict', 'account-pending', 'link-comment'):
            page.evaluate('window.showSidebar()')
            sidebar = page.locator('.dsh-board-tracker-drawer')
            sidebar.get_by_text('Shared comment', exact=True).wait_for()
            if payload['scenario'] == 'sole-close':
                sidebar.get_by_role('button', name='close', exact=True).click()
                page.wait_for_function("!document.querySelector('.dsh-board-tracker-drawer')")
                page.evaluate('window.hideSidebar()')
                page.evaluate('window.showSidebar()')
                page.get_by_role('button', name='A-1', exact=True).click()
                sidebar.get_by_text('Shared comment', exact=True).wait_for()
                assert not errors, errors
                sys.exit(0)
            if payload['scenario'] == 'hide-auth':
                sidebar.get_by_label('issueNewComment', exact=True).fill('do not send while hidden')
                page.evaluate('window.delayAuthorization()')
                before = page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'links.issue.read').length")
                sidebar.get_by_role('button', name='issueAddComment', exact=True).click()
                page.wait_for_function("count => window.testRequests.filter(r => r.cmd?.op === 'links.issue.read').length > count", arg=before)
                page.evaluate('window.hideSidebar()')
                page.wait_for_function("!document.querySelector('.dsh-board-tracker-drawer')")
                page.evaluate('window.releaseAuthorization()')
                page.wait_for_function('window.authorizationReleased === true')
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                assert not page.evaluate("window.testRequests.some(r => r.cmd?.op === 'issue.comment')")
                assert not errors, errors
                sys.exit(0)
        if payload['scenario'] in ('membership-evict', 'archive-evict', 'settings-evict'):
            sidebar.get_by_role('button', name='edit', exact=True).click()
            sidebar.get_by_label('title', exact=True).fill('private evicted draft')
            page.wait_for_function('window.unloadCount() === 1')
            page.evaluate('window.hideSidebar()')
            page.wait_for_function("!document.querySelector('.dsh-board-tracker-drawer')")
            assert page.evaluate('window.unloadCount()') == 1
            if payload['scenario'] == 'membership-evict':
                page.evaluate("window.setMembership(['session-2'])")
                page.wait_for_function('window.unloadCount() === 0')
                page.evaluate("window.setMembership(['session-1', 'session-2'])")
            elif payload['scenario'] == 'archive-evict':
                page.evaluate("window.setArchived(['session-1'])")
                page.wait_for_function('window.unloadCount() === 0')
                page.evaluate('window.setArchived([])')
            else:
                # A new account selection is observable through the settings read.
                page.evaluate("window.setSettings({ revision: 2 })")
            page.evaluate('window.showSidebar()')
            sidebar.get_by_text('Shared comment', exact=True).wait_for()
            assert 'private evicted draft' not in sidebar.inner_text()
            assert sidebar.get_by_label('title', exact=True).count() == 0 or sidebar.get_by_label('title', exact=True).input_value() != 'private evicted draft'
            page.wait_for_function('window.unloadCount() === 0')
            assert not page.evaluate("window.testRequests.some(r => ['issue.update', 'issue.comment', 'links.set'].includes(r.cmd?.op))")
            assert not errors, errors
            sys.exit(0)
        if payload['scenario'] == 'account-pending':
            sidebar.get_by_label('issueNewComment', exact=True).fill('private account draft')
            sidebar.get_by_role('button', name='issueAddComment', exact=True).click()
            page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'issue.comment')")
            page.evaluate('window.delayAuthorization(); window.setConnection(2)')
            page.wait_for_function("!document.body.innerText.includes('Shared description') && !document.querySelector('textarea')")
            page.evaluate('window.releaseMutation()')
            page.wait_for_function('window.mutationReleased === true')
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            assert sidebar.get_by_text('Shared description', exact=True).count() == 0
            assert sidebar.locator('textarea').count() == 0
            assert len(page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'issue.comment')")) == 1
            assert not page.evaluate("window.testRequests.some(r => ['issue.update', 'links.set'].includes(r.cmd?.op))")
            page.evaluate('window.releaseAuthorization()')
            sidebar.get_by_text('issueUnknown', exact=True).wait_for()
            assert sidebar.get_by_label('issueNewComment', exact=True).input_value() != 'private account draft'
            assert not errors, errors
            sys.exit(0)
        if payload['scenario'] == 'link-comment':
            sidebar.get_by_role('button', name='issueAddSession').click()
            sidebar.locator('select').select_option('session-2')
            sidebar.get_by_role('button', name='issueLinkSave').click()
            page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'links.set' && r.cmd?.linked)")
            sidebar.get_by_role('button', name='issueUnlinkSession: Second').wait_for()
            sidebar.get_by_label('issueNewComment', exact=True).fill('private pending after link')
            sidebar.get_by_role('button', name='issueAddComment', exact=True).click()
            page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'issue.comment')")
            page.evaluate('window.hideSidebar()')
            page.wait_for_function("!document.querySelector('.dsh-board-tracker-drawer')")
            page.evaluate('window.releaseMutation()')
            page.wait_for_function('window.mutationReleased === true')
            page.evaluate('window.showSidebar()')
            sidebar.get_by_text('issueUnknown', exact=True).wait_for()
            assert sidebar.get_by_role('button', name='issueAddComment', exact=True).is_disabled()
            assert sidebar.get_by_text('issueSaved', exact=True).count() == 0
            assert len(page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'issue.comment')")) == 1
            assert not errors, errors
            sys.exit(0)
        if payload['scenario'] == 'hidden':
            sidebar = page.locator('.dsh-board-tracker-drawer')
            sidebar.get_by_text('Shared comment', exact=True).wait_for()
            sidebar.get_by_role('button', name='edit', exact=True).click()
            sidebar.get_by_label('title', exact=True).fill('private unsaved draft')
            page.evaluate('window.hideSidebar()')
            page.wait_for_function("!document.body.innerText.includes('Shared comment') && !document.querySelector('.dsh-board-tracker-drawer')")
            assert page.locator('input').count() == 0
            page.evaluate('window.showSidebar()')
            sidebar.get_by_text('Shared comment', exact=True).wait_for()
            assert sidebar.get_by_label('title', exact=True).input_value() == 'private unsaved draft'
            assert not errors, errors
            sys.exit(0)
        if payload['scenario'] == 'archived':
            page.evaluate("window.setArchived(['session-1'])")
        page.get_by_role('button', name='tracker #1 — Workspace — tracker').click()
        page.get_by_role('button', name='issueDetails: Shared issue').click()
        board = page.locator('.dsh-board-tracker-drawer')
        board.get_by_text('Shared comment', exact=True).wait_for()
        if payload['scenario'] == 'pagination':
            board.get_by_text('Third page comment', exact=True).wait_for()
            assert board.get_by_text('Second page comment', exact=True).count() == 1
            assert 'issueCommentsComplete' in board.inner_text()
            commands = page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'issue.comments').map(r => r.cmd)")
            assert commands == [
              {'op':'issue.comments','workspaceId':'w','boardId':'1','issueKey':'A-1','issueId':'issue-1'},
              {'op':'issue.comments','workspaceId':'w','boardId':'1','issueKey':'A-1','issueId':'issue-1','cursor':'1'},
              {'op':'issue.comments','workspaceId':'w','boardId':'1','issueKey':'A-1','issueId':'issue-1','cursor':'2'},
            ], commands
            assert not errors, errors
            sys.exit(0)
        if payload['scenario'] == 'revoke':
            page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'issue.comments' && r.cmd?.cursor === '1')")
            assert board.get_by_text('Shared description', exact=True).count() == 1
            page.evaluate('window.releasePage()')
            board.get_by_text('issueUnavailable', exact=True).wait_for()
            assert board.get_by_text('Shared comment', exact=True).count() == 0
            assert board.get_by_text('Shared description', exact=True).count() == 0
            assert board.get_by_label('issueNewComment', exact=True).count() == 0
            assert not errors, errors
            sys.exit(0)
        if payload['scenario'] == 'pending':
            board.get_by_label('issueNewComment', exact=True).fill('private pending text')
            board.get_by_role('checkbox', name='Session', exact=True).check()
            board.get_by_role('checkbox', name='Second', exact=True).check()
            board.get_by_role('button', name='issueAddComment', exact=True).click()
            page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'issue.comment')")
            assert board.get_by_role('checkbox', name='Session', exact=True).is_disabled()
            assert board.get_by_role('checkbox', name='Second', exact=True).is_disabled()
            assert board.locator('textarea').first.get_attribute('readonly') is not None
            assert board.get_by_role('button', name='issueAddComment', exact=True).is_disabled()
            assert board.get_by_role('button', name='sessionSendAction', exact=True).is_disabled()
            page.evaluate('window.releaseMutation()')
            board.get_by_text('sessionSendSaved', exact=True).wait_for()
            assert board.locator('textarea').first.input_value() == 'private pending text'
            assert board.get_by_role('checkbox', name='Session', exact=True).is_checked()
            assert board.get_by_role('checkbox', name='Second', exact=True).is_checked()
            assert len(page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'issue.comment')")) == 1
            assert not errors, errors
            sys.exit(0)
        if payload['scenario'] == 'transition':
            board.get_by_role('button', name='issueChangeStatus: Open').click()
            board.get_by_role('button', name='Start → Doing').click()
            board.get_by_role('button', name='issueChangeStatus', exact=True).click()
            page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'issue.transition')")
            board.get_by_role('button', name='issueChangeStatus: Doing').wait_for()
            writes = page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'issue.transition').map(r => r.cmd)")
            assert writes == [{'op':'issue.transition','workspaceId':'w','boardId':'1','issueKey':'A-1','issueId':'issue-1','transitionId':'start','expectedTo':{'id':'2','key':'doing','display':'Doing'}}], writes
            assert not errors, errors
            sys.exit(0)
        if payload['scenario'] == 'archived':
            row = board.locator('.dsh-board-tracker-session')
            assert 'sessionArchived' in row.inner_text()
            assert row.locator('a').count() == 0
            row.get_by_role('button', name='issueUnlinkSession: Session').click()
            page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'links.set' && r.cmd?.linked === false)")
            writes = page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'links.set').map(r => r.cmd)")
            assert writes == [{'op':'links.set','workspaceId':'w','boardId':'1','issueKey':'A-1','issueId':'issue-1','sessionId':'session-1','linked':False,'expectedRevision':1}], writes
            assert not errors, errors
            sys.exit(0)
        def signature(root):
            return root.locator('button, input, textarea, select, h2, h3').evaluate_all('els => els.map(e => ({tag:e.tagName, text:e.textContent.trim(), label:e.getAttribute("aria-label"), disabled:e.disabled || false}))')
        board_sig = signature(board)
        page.evaluate('window.showSidebar()')
        sidebar = page.locator('.dsh-board-tracker-drawer')
        sidebar.get_by_text('Shared comment', exact=True).wait_for()
        side_sig = signature(sidebar)
        # The close button is an intentional presentation difference in embedded mode.
        if board_sig != side_sig:
            print(json.dumps({'board': board_sig, 'sidebar': side_sig}), file=sys.stderr)
            raise AssertionError('shared editor controls differ')
        sidebar.get_by_role('button', name='issueAddSession').click()
        sidebar.locator('select').select_option('session-2')
        sidebar.get_by_role('button', name='issueLinkSave').click()
        page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'links.set' && r.cmd?.linked === true)")
        sidebar.get_by_role('button', name='issueUnlinkSession: Second').click()
        page.wait_for_function("window.testRequests.some(r => r.cmd?.op === 'links.set' && r.cmd?.linked === false)")
        writes = page.evaluate("window.testRequests.filter(r => r.cmd?.op === 'links.set').map(r => r.cmd)")
        assert writes == [
          {'op':'links.set','workspaceId':'w','boardId':'1','issueKey':'A-1','issueId':'issue-1','sessionId':'session-2','linked':True,'expectedRevision':1},
          {'op':'links.set','workspaceId':'w','boardId':'1','issueKey':'A-1','issueId':'issue-1','sessionId':'session-2','linked':False,'expectedRevision':2},
        ], writes
        assert not errors, errors
    except Exception:
        print('PAGE:', page.locator('body').inner_text(), file=sys.stderr)
        print('REQUESTS:', json.dumps(page.evaluate('window.testRequests')), file=sys.stderr)
        print('ERRORS:', errors, file=sys.stderr)
        raise
    finally:
        browser.close()
`;

function runBrowser(scenario) {
  // The client registers synchronously; pass the registration into the fixture
  // after the installed React is loaded and before its plugin context is applied.
  const prelude = `window.__scenario__=${JSON.stringify(scenario)}; window.__ModuleLoader__={load(value){window.__registration__=value;}};\n`;
  const preparedFixture = fixture.replace('const source = initial =>', 'window.__ModuleLoader__.load(window.__registration__);\nconst source = initial =>');
  const result = spawnSync(python, ['-c', runner], { input: JSON.stringify({ shell: extractedShell, vendor, vendorName: vendorFile, clientPrelude: prelude, client, fixture: preparedFixture, scenario }), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 20000 });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
}

const browserTest = (name, scenario) => test(name, { skip: skipReason || false }, () => runBrowser(scenario));
browserTest('real React board and session sidebar render the same editor and link/unlink', 'parity');
browserTest('real React session sidebar hides private editor and preserves draft when tab hides', 'hidden');
browserTest('real React board allows unlinking an archived member', 'archived');
browserTest('real React editor traverses multiple comment pages', 'pagination');
browserTest('real React editor hides private content after access is revoked during pagination', 'revoke');
browserTest('real React editor preserves multi-session selection while comment mutation is pending', 'pending');
browserTest('real React editor applies a confirmed status transition', 'transition');
browserTest('real React sidebar closes its only linked issue', 'sole-close');
browserTest('real React sidebar does not mutate after tab hides during authorization', 'hide-auth');
browserTest('real React hidden dirty sidebar evicts draft after membership removal and re-add', 'membership-evict');
browserTest('real React hidden dirty sidebar evicts draft after archive and unarchive', 'archive-evict');
browserTest('real React hidden dirty sidebar evicts draft after settings revision change', 'settings-evict');
browserTest('real React account switch during pending comment hides content without stale writes', 'account-pending');
browserTest('real React link success then hidden pending comment remains unknown', 'link-comment');
