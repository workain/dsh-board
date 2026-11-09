"""Finite native SDK/browser fixture. Requires BW_SDK/BW_PRIVATE/BW_NODE.
No ambient credentials or production HOME/profile/data are copied.
"""
import asyncio
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from tracker_ui import tracker_ui
REPO = Path(__file__).resolve().parents[1]


def link_modules(sdk, target):
    target.mkdir(parents=True)
    for package in (sdk / 'node_modules').iterdir():
        if package.name.startswith('@'):
            scope = target / package.name
            scope.mkdir()
            for child in package.iterdir():
                (scope / child.name).symlink_to(child)
        elif not package.name.startswith('.'):
            (target / package.name).symlink_to(package)


async def dismiss_setup(page):
    quiet = 0
    for _ in range(20):
        await page.wait_for_timeout(200)
        clicked = False
        for label in ['Continue','Configure later','Later','Skip for now','Close']:
            button = page.get_by_role('button', name=label, exact=True)
            if await button.count() and await button.last.is_visible():
                try:
                    await button.last.click(timeout=600)
                    clicked = True
                    break
                except Exception:
                    pass
        quiet = 0 if clicked else quiet + 1
        if quiet >= 5:
            break


async def scenarios(url, root, report):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, env={'HOME':str(root/'home'), 'PATH':'/usr/bin:/bin', 'LANG':'C.UTF-8'})
        try:
            context = await browser.new_context(viewport={'width':1440,'height':1000})
            async def local_only(route):
                if urlparse(route.request.url).hostname in ('127.0.0.1','localhost'):
                    await route.continue_()
                else:
                    await route.abort()
            await context.route('**/*', local_only)
            page = await context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            console_errors=[]
            page.on('console',lambda message: console_errors.append(message.text) if message.type=='error' else None)
            await page.goto(url, wait_until='networkidle')
            for _ in range(15):
                for label in ['Continue','Configure later','Later','Skip for now','Close']:
                    button = page.get_by_role('button', name=label, exact=True)
                    if await button.count() and await button.last.is_visible():
                        try:
                            await button.last.click(timeout=500)
                        except Exception:
                            pass
                if await page.evaluate('!!window.__boardFixture && __boardFixture.snapshots().workspaces.items.length === 3'):
                    break
                await page.wait_for_timeout(200)
            await page.wait_for_function('window.__boardFixture && __boardFixture.snapshots().workspaces.items.length === 3')
            snapshot = await page.evaluate('__boardFixture.snapshots()')
            workspaces = snapshot['workspaces']['items']
            alpha = next(w for w in workspaces if w['title']=='Alpha')
            beta = next(w for w in workspaces if w['title']=='Beta')
            unassigned = next(w for w in workspaces if w['title']=='Unassigned')
            # Native board endpoints, synthetic fixture only. No Tracker calls.
            async def mutate(command):
                result = await page.evaluate("async c=>{const r=await fetch('api/dsh-board.mutate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(c)});return {status:r.status,value:await r.json()}}",command)
                assert result['status']==200, result
                return result['value']
            current = await page.evaluate("fetch('api/dsh-board').then(r=>r.json())")
            async def create(wid, name):
                nonlocal current
                def cmd(op, **extra):
                    return {'op':op,'workspaceId':wid,'expectedRevision':current['revision'],**extra}
                current=await mutate(cmd('board.create',name=name))
                board=next(b for b in current['boards'] if b['workspaceId']==wid and b['name']==name)
                current=await mutate(cmd('status.save',boardId=board['id'],status={'name':'Fixture status'}))
                board=next(b for b in current['boards'] if b['id']==board['id'])
                status=board['statuses'][0]['id']
                current=await mutate(cmd('task.save',boardId=board['id'],task={'title':'Linked '+name,'description':'Synthetic task','statusId':status}))
                board=next(b for b in current['boards'] if b['id']==board['id'])
                task=board['tasks'][0]
                for sid in next(w for w in workspaces if w['workspaceId']==wid)['sessionIds']:
                    if sid in snapshot['workspaces']['archivedSessionIds']:
                        # Existing archived link fixture is seeded before archiving via
                        # its unarchived peers; archive membership covered by host tests.
                        continue
                    current=await mutate(cmd('link.set',boardId=board['id'],taskId=task['id'],sessionId=sid,linked=True))
                current=await mutate(cmd('task.save',boardId=board['id'],task={'title':'Unlinked '+name,'description':'','statusId':status}))
                return board['id']
            a=await create(alpha['workspaceId'],'Alpha board')
            b=await create(beta['workspaceId'],'Beta board')
            assert await page.evaluate("fetch('api/board-workspace-fixture.archive',{method:'POST'}).then(r=>r.status)")==200
            before = await page.evaluate("fetch('api/board-workspace-fixture').then(r=>r.json())")
            await page.reload(wait_until='networkidle')
            await dismiss_setup(page)
            await page.wait_for_function('!!window.__boardFixture')
            await page.wait_for_function('(id)=>__boardFixture.configure(id)',arg=alpha['workspaceId'])
            dialog=page.get_by_role('dialog',name='Default board for this workspace',exact=True)
            await dialog.wait_for()
            await dialog.get_by_role('combobox').select_option(json.dumps(['local',a],separators=(',',':')))
            await dialog.get_by_role('button',name='Save',exact=True).click()
            await dialog.wait_for(state='detached')
            assert await page.evaluate('(id)=>__boardFixture.open(id)',alpha['workspaceId'])
            await page.get_by_role('button',name='Edit task: Linked Alpha board',exact=True).wait_for()
            assert await page.get_by_role('button',name='Edit task: Unlinked Alpha board',exact=True).count()==0
            card=page.locator('article.dsh-board-card').filter(has=page.get_by_role('button',name='Edit task: Linked Alpha board',exact=True))
            await card.get_by_text('Goal One',exact=True).wait_for()
            await card.get_by_text('Goal Two',exact=True).wait_for()
            await card.get_by_text('Goal Archived',exact=True).wait_for()
            await page.get_by_role('button',name='Edit task: Linked Alpha board',exact=True).click()
            drawer=page.locator('aside.dsh-board-drawer')
            await drawer.get_by_text('Goal One',exact=True).wait_for()
            await drawer.get_by_text('Todo One',exact=False).wait_for()
            await drawer.get_by_role('button',name='Cancel',exact=True).click()
            report['native_default_linked_filter_card_drawer_multiple_sessions']='pass'
            assert await page.evaluate('(id)=>__boardFixture.configure(id)',beta['workspaceId'])
            await dialog.wait_for()
            await dialog.get_by_role('combobox').select_option(json.dumps(['local',b],separators=(',',':')))
            await dialog.get_by_role('button',name='Save',exact=True).click()
            await dialog.wait_for(state='detached')
            await page.reload(wait_until='networkidle')
            await dismiss_setup(page)
            await page.wait_for_function('(id)=>window.__boardFixture && __boardFixture.open(id)',arg=alpha['workspaceId'])
            await page.get_by_role('button',name='Edit task: Linked Alpha board',exact=True).wait_for()
            assert await page.evaluate('(id)=>__boardFixture.open(id)',beta['workspaceId'])
            await page.get_by_role('button',name='Edit task: Linked Beta board',exact=True).wait_for()
            # The late A default response must not navigate back after a manual
            # workspace selection. Serve the actual response only after the click.
            hold=asyncio.Event()
            entered=asyncio.Event()
            async def delayed(route):
                command=route.request.post_data_json
                if command.get('op')=='default.read' and command.get('workspaceId')==alpha['workspaceId']:
                    response=await route.fetch()
                    entered.set()
                    await hold.wait()
                    try:
                        await route.fulfill(response=response)
                    except Exception:
                        pass # cancellation of the superseded read is expected
                else:
                    await route.continue_()
            await page.route('**/api/dsh-board.context',delayed)
            await page.wait_for_function('(id)=>__boardFixture.open(id)',arg=alpha['workspaceId'])
            await asyncio.wait_for(entered.wait(),10)
            selector=page.locator('.dsh-board-context select').first
            await selector.select_option(beta['workspaceId'])
            hold.set()
            await page.wait_for_timeout(200)
            assert await selector.input_value()==beta['workspaceId']
            await page.unroute('**/api/dsh-board.context',delayed)
            report['native_slow_default_A_manual_B_ignores_late_result']='pass'
            # Saved-but-inaccessible is not an empty default, and cannot be
            # blindly cleared by Save without a fresh explicit selection.
            async def unavailable(route):
                command=route.request.post_data_json
                if command.get('op')=='default.read' and command.get('workspaceId')==beta['workspaceId']:
                    await route.fulfill(status=200,content_type='application/json',body=json.dumps({'revision':1,'pointer':None,'available':False}))
                else:
                    await route.continue_()
            await page.route('**/api/dsh-board.context',unavailable)
            await page.wait_for_function('(id)=>__boardFixture.configure(id)',arg=beta['workspaceId'])
            await dialog.wait_for()
            await page.wait_for_function("document.querySelector('.dsh-board-default-dialog select')?.value==='__unavailable__'")
            assert await dialog.get_by_role('button',name='Save',exact=True).is_disabled()
            await dialog.get_by_role('button',name='Close',exact=True).click()
            await page.unroute('**/api/dsh-board.context',unavailable)
            report['native_unavailable_default_not_blind_clear']='pass'
            assert await page.evaluate('(id)=>__boardFixture.open(id)',unassigned['workspaceId'])
            await dialog.wait_for()
            assert await dialog.get_by_role('combobox').input_value()==''
            report['native_per_workspace_A_B_C_reload']='pass'
            await dialog.get_by_role('button',name='Close',exact=True).click()
            linked_task=next(task for board in current['boards'] if board['id']==a for task in board['tasks'] if task['title']=='Linked Alpha board')
            await tracker_ui(page,alpha,a,linked_task['id'],report)
            after=await page.evaluate("fetch('api/board-workspace-fixture').then(r=>r.json())")
            (root/'passive-before-after.json').write_text(json.dumps({'before':before,'after':after},indent=2))
            assert before==after
            assert all(not row['liveAgent'] for row in after['rows'] if row['id'] in after['seeded'])
            assert all(row['prompts']==0 for row in after['rows'])
            report['seeded_cold_sessions_checked']=len(after['seeded'])
            report['preexisting_native_agents_unchanged']=sum(row['liveAgent'] for row in before['rows'])
            report['event_and_header_hash_changes']=0
            report['native_passive_no_agent_events_or_prompts']='pass'
            report['unexpected_page_errors']=len(errors)
            assert not errors
            await context.close()
        except Exception:
            (root/'synthetic-dom.txt').write_text(await page.locator('body').inner_text())
            (root/'page-errors.json').write_text(json.dumps({'page':errors,'console':console_errors}))
            raise
        finally:
            await browser.close()


def main():
    sdk=Path(os.environ['BW_SDK']).resolve()
    private=Path(os.environ['BW_PRIVATE']).resolve()
    node=Path(os.environ['BW_NODE']).resolve()
    private.mkdir(mode=0o700,parents=True,exist_ok=True)
    assert REPO not in private.parents and private!=REPO
    root=Path(tempfile.mkdtemp(prefix='board-isolated-',dir=private));os.chmod(root,0o700)
    home,cwd=root/'home',root/'cwd';home.mkdir();cwd.mkdir()
    catalog=root/'synthetic-catalog';catalog.mkdir()
    profile=home/'.dsh/profiles/web';profile.mkdir(parents=True)
    link_modules(sdk,profile/'node_modules')
    (profile/'node_modules/dsh-board').symlink_to(REPO)
    (profile/'node_modules/board-workspace-fixture').symlink_to(REPO/'e2e/fixture')
    (profile/'package.json').write_text(json.dumps({'name':'board-isolated-profile','private':True,'dependencies':{},'dsh':{'profile':{'bundles':['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-board']}}}))
    (profile/'cordis.yml').write_text('[]\n')
    (profile/'cordis.patch.yml').write_text('- insert:\n    - id: board-workspace-fixture\n      name: board-workspace-fixture\n      config:\n        root: '+str(catalog)+'\n')
    env={'HOME':str(home),'DSH_HOME':str(home/'.dsh'),'TMPDIR':str(root),'LANG':'C.UTF-8','PATH':str(node.parent)+':/usr/bin:/bin','DSH_TELEMETRY_DISABLED':'1'}
    for key,sub in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_STATE_HOME','state')]:
        env[key]=str(home/sub)
    report={}
    with (root/'server.log').open('w') as out:
        process=subprocess.Popen([str(node),str(sdk/'node_modules/@deepseek-ai/dsh/lib/bin.js'),'web','--no-open','--host','127.0.0.1','--port','0'],cwd=cwd,env=env,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            deadline=time.monotonic()+60
            while time.monotonic()<deadline:
                if process.poll() is not None:
                    raise RuntimeError('Fixture server exited; inspect private log')
                match=re.search(r'https?://[^\s\x1b]+',(root/'server.log').read_text())
                if match:
                    asyncio.run(asyncio.wait_for(scenarios(match.group(),root,report),timeout=180));break
                time.sleep(.2)
            else:
                raise TimeoutError('Fixture startup timeout')
        finally:
            if process.poll() is None:
                os.killpg(process.pid,signal.SIGTERM)
                try:process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
            report['server_stopped']=process.poll() is not None
            (root/'result.json').write_text(json.dumps(report,indent=2))
            print(json.dumps(report,sort_keys=True))
if __name__=='__main__':
    main()
