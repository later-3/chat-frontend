import assert from 'node:assert/strict';
import test from 'node:test';
import { composerDraftKey } from './composer-context.ts';
import { setDraft, getDraft, clearDraft } from './draft-store.ts';
import { parseLongAgentActivity } from './long-agent-activity.ts';
import { getSidebarMaxWidth, getRightPanelMaxWidth, isRightPanelOverlay } from './panel-layout.ts';
test('coworker drafts stay with their original project context when switching either selection',()=>{
 const a=composerDraftKey('agent-a',true,'thinking');const b=composerDraftKey('agent-a',true,'learning');const c=composerDraftKey('agent-b',true,'thinking');
 setDraft(a,{value:'thinking draft',images:[]});setDraft(b,{value:'learning draft',images:[]});
 assert.equal(getDraft(a).value,'thinking draft');assert.equal(getDraft(b).value,'learning draft');assert.equal(getDraft(c),null);
 assert.equal(composerDraftKey('ordinary',false,'thinking'),composerDraftKey('ordinary',false,'learning'));
 clearDraft(a);clearDraft(b);
});
test('panels preserve a usable conversation and fall back to an overlay at the actual width budget',()=>{
 for(const viewportWidth of [960,1080,1090,1100,1280,1440,1920])for(const sidebarOpen of [false,true]) {
  const sidebarWidth=sidebarOpen?Math.min(280,getSidebarMaxWidth({viewportWidth,rightPanelOpen:true,rightPanelWidth:360})):0;
  const right=Math.min(360,getRightPanelMaxWidth({viewportWidth,sidebarOpen,sidebarWidth}));
  const main=viewportWidth-64-(sidebarOpen?sidebarWidth+1:0)-(isRightPanelOverlay(viewportWidth,sidebarOpen)?0:right+1);
  assert.ok(main>=480,`main ${main} at ${viewportWidth}`);
 }
 assert.equal(isRightPanelOverlay(1080,true),true);assert.equal(isRightPanelOverlay(1090,true),false);
 assert.equal(1440-64-281-361,734);
});
test('activity parser rejects unsupported and malformed recovery responses',()=>{
 const valid={schemaVersion:1,status:'running',turnId:'turn',startedAt:'2026-09-19T00:00:00Z',error:null};
 assert.deepEqual(parseLongAgentActivity(valid),valid);
 for(const invalid of [null,{...valid,schemaVersion:2},{...valid,status:'guessed'},{...valid,status:['running']},{...valid,startedAt:'never'}])assert.throws(()=>parseLongAgentActivity(invalid));
});
