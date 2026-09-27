import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberSessionView,peekSessionView,discardSessionView,fetchSessionView} from './session-view-cache.ts';

test('warm views never cross projects, expire, and evict large/old histories', t => {
  t.mock.method(Date, 'now', () => 1000);
  rememberSessionView('one','same',{version:1});
  assert.equal(peekSessionView('two','same'),undefined);
  assert.deepEqual(peekSessionView('one','same'),{version:1});
  rememberSessionView('one','huge',{text:'x'.repeat(4*1024*1024)});
  assert.equal(peekSessionView('one','huge'),undefined);
  for(let i=0;i<17;i++)rememberSessionView('one',`n${i}`,{i});
  assert.equal(peekSessionView('one','same'),undefined);
  assert.equal(peekSessionView('one','n0'),undefined);
  Date.now.mock.mockImplementation(()=>302000);
  assert.equal(peekSessionView('one','n16'),undefined);
});

test('parallel navigation shares one GET; cancelling one reader preserves the other and next navigation revalidates', async t => {
  let finish, calls=0;
  t.mock.method(globalThis,'fetch',async()=>{
    calls++;return await new Promise(resolve=>{finish=value=>resolve(new Response(JSON.stringify(value),{status:200}));});
  });
  const body={session:{id:'shared',projectId:'one'},context:{messages:[]}};
  const controller=new AbortController();
  const cancelled=fetchSessionView('one','shared',controller.signal);
  const other=fetchSessionView('one','shared');
  controller.abort();
  await assert.rejects(cancelled,{name:'AbortError'});
  finish(body);assert.deepEqual(await other,body);assert.equal(calls,1);
  assert.deepEqual(peekSessionView('one','shared'),body);
  const fresh=fetchSessionView('one','shared');
  finish({...body,revision:2});assert.equal((await fresh).revision,2);assert.equal(calls,2);
  discardSessionView('one','shared');assert.equal(peekSessionView('one','shared'),undefined);
});

test('failed or mismatched authoritative reads cannot populate a session view', async t => {
  rememberSessionView('one','blocked',{old:true});
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({statusMessage:'removed'}),{status:404}));
  await assert.rejects(fetchSessionView('one','blocked'),/removed/);
  assert.equal(peekSessionView('one','blocked'),undefined);
  globalThis.fetch.mock.mockImplementation(async()=>new Response(JSON.stringify({session:{id:'other',projectId:'one'}})));
  await assert.rejects(fetchSessionView('one','wrong'),/不匹配/);
  assert.equal(peekSessionView('one','wrong'),undefined);
});
