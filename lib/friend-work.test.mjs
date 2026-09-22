import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFriendWorkItem, startFriendWork, fetchFriendWork } from './friend-work.ts';
import { readFriendWorkSubmission, saveFriendWorkSubmission } from './friend-work-draft.ts';
const work = { id: `work-${'a'.repeat(32)}`, longAgentId: 'friend', sessionId: 'work-session', originSessionId: 'daily', originEntryId: 'entry',
  contextProjectId: 'project-a', requestId: 'request', payloadHash: 'a'.repeat(64), title: '研究', createdAt: '2026-09-20T00:00:00Z' };
const execution = { schemaVersion: 1, kind: 'friend', id: 'turn', longAgentId: 'friend', projectId: 'friend', sessionId: work.sessionId,
  workId: work.id, contextProjectId: work.contextProjectId, status: 'running', error: null, acceptedAt: work.createdAt,
  capabilities: { cancel: true, steer: true, followUp: true, images: false } };
test('work responses validate the Friend, native Session, work and fixed project together', () => {
  assert.equal(parseFriendWorkItem({ work, execution }, 'friend').execution.status, 'running');
  for (const change of [{ longAgentId: 'other' }, { sessionId: 'daily' }, { workId: `work-${'b'.repeat(32)}` }, { contextProjectId: 'project-b' }])
    assert.throws(() => parseFriendWorkItem({ work, execution: { ...execution, ...change } }, 'friend'));
});
test('start and list share a validated durable handle and retain the request identity', async t => {
  const original = globalThis.fetch; t.after(() => globalThis.fetch = original);
  const input = { requestId: 'request', originSessionId: 'daily', contextProjectId: 'project-a', title: '研究', text: 'instructions' };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/long-agents/friend/work');
    if (init.method === 'POST') { assert.deepEqual(JSON.parse(init.body), { schemaVersion: 1, ...input }); return Response.json({ schemaVersion: 1, work, execution }); }
    return Response.json({ schemaVersion: 1, works: [{ work, execution }] });
  };
  assert.equal((await startFriendWork('friend', input)).work.id, work.id);
  assert.equal((await fetchFriendWork('friend'))[0].work.id, work.id);
});
test('an unconfirmed submission survives reload with its original project and id, without automatic resend', t => {
  const original = globalThis.sessionStorage; const data = new Map();
  globalThis.sessionStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
  t.after(() => globalThis.sessionStorage = original);
  const input = { requestId: 'request', originSessionId: 'yesterday', contextProjectId: 'project-a', title: '研究', text: 'instructions' };
  saveFriendWorkSubmission('friend', input);
  assert.deepEqual(readFriendWorkSubmission('friend'), input);
  assert.equal(readFriendWorkSubmission('another'), null);
  saveFriendWorkSubmission('friend', null); assert.equal(readFriendWorkSubmission('friend'), null);
});
