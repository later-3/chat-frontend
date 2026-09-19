import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEntryTimes, summarizeTurn } from './turn-summary.ts';
const usage = { input: 100, output: 20, cacheRead: 30, cacheWrite: 5, cost: {total:.02} };
const assistant = (content, extra = {}) => ({role:'assistant',content,provider:'test',model:'test',...extra});

test('turn usage includes intermediate requests and counts each tool call once', () => {
  const call = {type:'toolCall',toolCallId:'t1',toolName:'read',input:{}};
  const messages = [{role:'user',content:'request'},assistant([call],{usage}),{role:'toolResult',toolCallId:'t1',content:[]},assistant([{type:'text',text:'answer'}],{usage})];
  const result = summarizeTurn(messages,[1000,2000,2500,4500]);
  assert.equal(result.tokens,310);
  assert.equal(result.toolCount,1);
  assert.equal(result.durationMs,3500);
  assert.equal(result.usage.cost,.04);
  assert.equal(summarizeTurn([...messages,assistant([call])],[]).toolCount,1);
});
test('missing usage and timing stay unknown, rather than estimated from text or request timestamps', () => {
  const result = summarizeTurn([{role:'user',content:'request',timestamp:1000},assistant([{type:'text',text:'long answer'}],{timestamp:5000})],[]);
  assert.equal(result.recordedUsage,0);
  assert.equal(result.durationMs,null);
  assert.equal(summarizeTurn([{role:'user',content:'x'},assistant([]),assistant([])], [1000,2000,null]).durationMs,null);
  assert.equal(summarizeTurn([{role:'user',content:'x'},assistant([])], [5000,1000]).durationMs,null);
  assert.deepEqual(parseEntryTimes(undefined,2),[]);
  assert.throws(()=>parseEntryTimes([1000],2));
  assert.throws(()=>parseEntryTimes([1000,'2000'],2));
  assert.throws(()=>parseEntryTimes([1000,NaN],2));
  assert.deepEqual(parseEntryTimes([1000,null],2),[1000,null]);
});
