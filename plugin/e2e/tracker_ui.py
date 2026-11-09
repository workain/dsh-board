"""Synthetic Tracker carrier over the actual native Board UI; no Tracker creds.
Authority/account isolation is tested against the real host adapter separately.
"""
import json
from urllib.parse import urlparse


async def tracker_ui(page, workspace, board_id, task_id, report):
    payload={'op':'task.context','workspaceId':workspace['workspaceId'],'incarnation':workspace['createdAt'],'provider':'local','boardId':board_id,'taskId':task_id,'issueId':None}
    native=await page.evaluate("async c=>{const r=await fetch('api/dsh-board.context',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(c)});if(!r.ok)throw Error('native context');return r.json()}",payload)
    calls=[]
    issue={'id':'fixture-issue','key':'Q-1','summary':'Tracker synthetic','description':'Synthetic issue','status':{'id':'1','key':'open','display':'Fixture status'},'assigneeKnown':True,'assignee':None,'version':1}
    links=[{'issueKey':'Q-1','issueId':'fixture-issue','sessionId':row['sessionId']} for row in native['rows']]
    async def carrier(route):
        path=urlparse(route.request.url).path
        command=route.request.post_data_json if route.request.method=='POST' else None
        value=None
        if path=='/api/dsh-board.context':
            if command.get('op')=='default.read' and command.get('workspaceId')==workspace['workspaceId']:
                value={'revision':1,'available':True,'pointer':{'provider':'tracker','boardId':'1','incarnation':workspace['createdAt']}}
            elif command.get('op')=='task.context' and command.get('provider')=='tracker' and command.get('taskId')=='Q-1' and command.get('issueId')=='fixture-issue':
                value=native
        elif path=='/api/dsh-board.tracker':
            value={'revision':1,'configured':True,'orgType':'cloud','workspaces':{workspace['workspaceId']:['1']},'needsReselect':[],'verificationUnavailable':[]}
        elif path=='/api/dsh-board.tracker.mutate':
            calls.append(command['op'])
            if command['op']=='board.read':
                value={'board':{'id':'1','name':'Synthetic Tracker board'},'columns':[{'id':'column','name':'Fixture status','statuses':[issue['status']]}],'issues':[issue],'issuesComplete':False,'issuesReason':'approximate_board_filter'}
            elif command['op'] in ['links.read','links.issue.read']:
                value={'revision':1,'links':links,'incomplete':command['op']=='links.read'}
            elif command['op']=='issue.read':
                value=issue
            elif command['op']=='issue.transitions':
                value=[]
            elif command['op']=='issue.comments':
                value={'comments':[],'complete':True,'nextCursor':None}
            else:
                raise AssertionError('Unexpected Tracker operation: '+command['op'])
        if value is None:
            await route.continue_()
        else:
            await route.fulfill(status=200,content_type='application/json',body=json.dumps(value))
    await page.route('**/api/dsh-board*',carrier)
    try:
        await page.wait_for_function('(id)=>__boardFixture.open(id)',arg=workspace['workspaceId'])
        title=page.get_by_role('button',name='Issue details: Tracker synthetic',exact=True)
        await title.wait_for()
        card=page.locator('article.dsh-board-card').filter(has=title)
        await card.get_by_text('Goal One',exact=True).wait_for()
        await card.get_by_text('Goal Two',exact=True).wait_for()
        await title.click()
        drawer=page.locator('aside.dsh-board-tracker-drawer')
        await drawer.get_by_text('Goal One',exact=True).wait_for()
        await drawer.get_by_text('Goal Two',exact=True).wait_for()
        await drawer.get_by_text('Todo One',exact=False).wait_for()
        assert calls and all(op in ['board.read','links.read','links.issue.read','issue.read','issue.transitions','issue.comments'] for op in calls)
        report['native_tracker_shaped_existing_card_drawer_with_native_projection_rows']='pass'
        report['tracker_shaped_write_calls']=0
    finally:
        await page.unroute('**/api/dsh-board*',carrier)
