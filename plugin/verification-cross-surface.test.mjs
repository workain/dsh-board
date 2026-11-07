import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Use the same installed-shell extraction as shared-editor-integration.test.mjs:
// actual React/ReactDOM, but no application bootstrap, server, or real network.
const assets = join(process.env.DSH_ROOT || join(homedir(), '.local/share/deepseek-harness'), 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets');
const python = process.env.PYTHON || 'python3';
let shell, vendorName, vendor, skipReason;
try {
  const shellName = (await readdir(assets)).find(name => /^index-.*\.js$/.test(name));
  if (!shellName) skipReason = `DSH shell bundle unavailable in ${assets}`;
  else {
    const bundle = await readFile(join(assets, shellName), 'utf8');
    const marker = 'const Ls=globalThis.dshDesktopBoot,';
    assert.ok(bundle.includes(marker) && bundle.includes('function OZ(){return{react:'), 'unsupported shell bundle layout');
    shell = bundle.slice(0, bundle.indexOf(marker)) + '\nwindow.__TEST_MODULES__ = OZ();\n';
    vendorName = bundle.match(/from\s*["']\.\/(vendor-[^"']+\.js)["']/)?.[1];
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
const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const fixture = String.raw`
const React = window.__TEST_MODULES__.react, ReactDOM = window.__TEST_MODULES__['react-dom/client'], h = React.createElement;
let plugin;
window.__ModuleLoader__ = { load(value) { plugin = value.factory(name => { if (name !== 'react') throw Error('unexpected module: ' + name); return React; }); } };
window.__ModuleLoader__.load(window.__registration__);
const source = initial => { let value = initial; const listeners = new Set(); return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, set(next) { value = next; for (const fn of listeners) fn(); } }; };
const slots = new Map();
const workspaces = source({ phase:'ready', state:'ready', items:[
  { workspaceId:'a', title:'Alpha', createdAt:'2026-01-01T00:00:00Z', sessionIds:['session-a'] },
  { workspaceId:'b', title:'Beta', createdAt:'2026-01-01T00:00:00Z', sessionIds:['session-b','session-b2'] },
], archivedSessionIds:[] });
const sessions = source({ phase:'ready', ids:['session-a','session-b','session-b2'], byId:{ 'session-a':{title:'Alpha session'}, 'session-b':{title:'Beta session'}, 'session-b2':{title:'Beta second'} } });
const connection = source({ id:1, host:{home:'/'} }), mounted = source('session-b'), panelInfo = source({ activePanelId:'dsh-board' });
const ctx = { effect(fn){fn();}, locale:{register(){}, bind:()=>key=>key}, slots:{inject(_name,fn){fn();}, register(spec,component){slots.set(spec.name,{spec,component});}}, commandUi:{register(){}}, inputTriggers:{registerSource(){}}, sidebarRight:{mounted,openTab(){}}, sidebarRightTabs:{register(){}}, connection:{generation:connection}, workspaces:{list:workspaces}, sessions:{list:sessions}, uiWorkspace:{openSession(){}}, layout:{panelInfo,selectPanel(){}} };
let unavailable = false, settingsReads = 0, failSecond = false, delayAuth = false, releaseAuth;
window.outage = value => { unavailable = value; };
window.failSecondSettings = () => { settingsReads = 0; failSecond = true; };
window.delayAuthorization = () => { delayAuth = true; };
window.releaseAuthorization = () => releaseAuth?.();
window.testRequests = [];
const status = { id:'1', key:'open', display:'Open' };
const issues = { a:{id:'ia',key:'A-1',summary:'Alpha issue',description:'Alpha description',assigneeKnown:true,assignee:null,status,version:5}, b:{id:'ib',key:'B-1',summary:'Beta private issue',description:'Beta private description',assigneeKnown:true,assignee:null,status,version:5} };
const settings = () => ({ revision:1, configured:true, orgType:'cloud', workspaces:{a:['1'],b:['2']}, needsReselect:[], verificationUnavailable: unavailable ? ['b'] : [] });
window.fetch = async (path, options) => {
  const url=String(path), method=options?.method, cmd=options?.body ? JSON.parse(options.body) : null;
  window.testRequests.push({url,method,cmd});
  let value;
  if (url === 'api/dsh-board' && method === 'GET') value={revision:1,boards:[],links:[]};
  else if (url === 'api/dsh-board.tracker' && method === 'GET') {
    settingsReads++;
    if (failSecond && settingsReads === 2) { unavailable = true; failSecond = false; }
    value=settings();
  } else if (url === 'api/dsh-board.tracker.mutate' && method === 'POST') {
    const issue=issues[cmd.workspaceId];
    switch(cmd.op) {
      case 'board.read': value={board:{id:cmd.boardId,name:cmd.workspaceId === 'a'?'Alpha board':'Beta board'},columns:[{id:'10',name:'Open',statuses:[status]}],issues:[{id:issue.id,key:issue.key,summary:issue.summary,status}],issuesComplete:false,issuesReason:'approximate_board_filter'}; break;
      case 'links.read': value={revision:1,links:[],incomplete:false}; break;
      case 'links.session.read': value={revision:1,links:[{boardId:'2',issueKey:'B-1',issueId:'ib',sessionId:'session-b'}],incomplete:false}; break;
      case 'links.issue.read':
        if (delayAuth) { delayAuth=false; await new Promise(resolve => { releaseAuth=resolve; }); window.authorizationReleased=true; }
        value={revision:1,links:[{issueKey:issue.key,issueId:issue.id,sessionId:'session-b'}],incomplete:false}; break;
      case 'issue.read': value=issue; break;
      case 'issue.comments': value={comments:[{id:'c1',text:'Beta private comment',version:1,createdBy:{id:'u',display:'Author'},createdAt:'2026-01-01'}],complete:true,nextCursor:null}; break;
      case 'issue.transitions': value=[{id:'start',display:'Start',to:{id:'2',key:'doing',display:'Doing'}}]; break;
      case 'issue.transition': case 'issue.comment': case 'issue.update': case 'links.set': throw Error('unexpected write: '+cmd.op);
      default: throw Error('unexpected command '+cmd.op);
    }
  } else throw Error('unexpected fetch '+url+' '+method);
  return {ok:true,status:200,json:async()=>value};
};
window.confirm=()=>true;
plugin.apply(ctx);
const main=slots.get('main'), sidebar=slots.get('sidebar.right.pane.tab');
if (!main || !sidebar) throw Error('expected slots not registered');
const root=ReactDOM.createRoot(document.getElementById('root'));
const tab={visible:true,signal:new AbortController().signal};
window.showBoth = () => root.render(h(React.Fragment,null,h('section',{id:'board'},h(main.component,{t:key=>key,...main.spec.inject()})),h('section',{id:'sidebar'},h(sidebar.component,{sessionId:'session-b',useTabInfo:()=>({tab})}))));
window.showMain = () => root.render(h(main.component,{t:key=>key,...main.spec.inject()}));
window.showBoth();
`;
const runner = String.raw`
import json, sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
payload=json.load(sys.stdin)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1000})
    page.set_default_timeout(5000)
    errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    def route_handler(route):
        path=urlparse(route.request.url).path
        files={'/':('text/html','<!doctype html><div id="root"></div><script type="module" src="/shell.js"></script>'),'/shell.js':('text/javascript',payload['shell']),'/' + payload['vendorName']:('text/javascript',payload['vendor'])}
        if path not in files:
            errors.append('unexpected network: '+route.request.url); route.abort(); return
        content_type,body=files[path]
        route.fulfill(status=200,content_type=content_type,body=body)
    page.route('**/*',route_handler)
    try:
        page.goto('http://fixture.invalid/',wait_until='load')
        page.wait_for_function('window.__TEST_MODULES__ !== undefined')
        page.add_script_tag(content='window.__ModuleLoader__={load(value){window.__registration__=value;}};\n'+payload['client']+payload['fixture'])
        side=page.locator('#sidebar')
        board=page.locator('#board')
        side.get_by_text('Beta private description',exact=True).wait_for()
        board.get_by_role('button',name='tracker #1 — Alpha — tracker').click()
        board.get_by_role('button',name='issueDetails: Alpha issue').wait_for()
        if payload['scenario']=='second-read':
            page.evaluate('window.showMain()')
            page.evaluate('window.failSecondSettings(); window.showBoth()')
            side.get_by_text('Tracker verification is temporarily unavailable. Your saved selection is unchanged; try again.',exact=True).wait_for()
            assert side.get_by_text('Tracker board selection needs confirmation.',exact=True).count()==0
            assert side.get_by_text('Beta private description',exact=True).count()==0
            assert board.get_by_role('button',name='issueDetails: Alpha issue').count()==1
            page.evaluate('window.outage(false)')
            side.get_by_role('button',name='Retry',exact=True).click()
            side.get_by_text('Beta private description',exact=True).wait_for()
        else:
            side.get_by_role('button',name='edit',exact=True).click()
            side.get_by_label('title',exact=True).fill('Beta preserved draft')
            if payload['scenario']=='preflight':
                side.get_by_role('button',name='issueChangeStatus: Open').click()
                side.get_by_role('button',name='Start → Doing').click()
                page.evaluate('window.delayAuthorization()')
                before=page.evaluate("window.testRequests.filter(r=>r.cmd?.op==='links.issue.read').length")
                side.get_by_role('button',name='issueChangeStatus',exact=True).click()
                page.wait_for_function("n=>window.testRequests.filter(r=>r.cmd?.op==='links.issue.read').length>n",arg=before)
            before=page.evaluate("window.testRequests.filter(r=>r.url==='api/dsh-board.tracker' && r.method==='GET').length")
            page.evaluate("window.outage(true); window.dispatchEvent(new Event('focus'))")
            page.wait_for_function("n=>window.testRequests.filter(r=>r.url==='api/dsh-board.tracker' && r.method==='GET').length>n",arg=before)
            page.wait_for_function("!document.querySelector('#sidebar input[aria-label=title]') && !document.querySelector('#sidebar').innerText.includes('Beta private description') && !document.querySelector('#sidebar').innerText.includes('Beta private comment')")
            assert side.get_by_text('Beta private comment',exact=True).count()==0
            assert board.get_by_role('button',name='issueDetails: Alpha issue').count()==1
            if payload['scenario']=='preflight':
                page.evaluate('window.releaseAuthorization()')
                page.wait_for_function('window.authorizationReleased===true')
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                assert not page.evaluate("window.testRequests.some(r=>['issue.transition','links.set','issue.update','issue.comment'].includes(r.cmd?.op))")
            page.evaluate('window.outage(false); window.showMain()')
            page.evaluate('window.showBoth()')
            side.get_by_text('Beta private description',exact=True).wait_for()
            assert side.get_by_label('title',exact=True).input_value()=='Beta preserved draft'
        assert not page.evaluate("window.testRequests.some(r=>['issue.transition','links.set','issue.update','issue.comment'].includes(r.cmd?.op))")
        assert not errors,errors
    except Exception:
        print('PAGE:',page.locator('body').inner_text(),file=sys.stderr)
        print('REQUESTS:',json.dumps(page.evaluate('window.testRequests')),file=sys.stderr)
        print('ERRORS:',errors,file=sys.stderr)
        raise
    finally:
        browser.close()
`;
function runBrowser(scenario) {
  const result = spawnSync(python, ['-c', runner], { input: JSON.stringify({ shell, vendorName, vendor, client, fixture, scenario }), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 20000 });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
}
for (const [name, scenario] of [
  ['background verification outage hides only the affected session and recovers its draft', 'outage'],
  ['background outage fences a pending session status preflight', 'preflight'],
  ['session second settings read exposes verification retry and recovers', 'second-read'],
]) test(name, { skip: skipReason || false }, () => runBrowser(scenario));
