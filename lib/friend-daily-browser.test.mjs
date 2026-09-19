import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFriendDailyState, fetchFriendDailyState } from './friend-daily-browser.ts';
const fixture = () => ({ schemaVersion: 1, longAgentId: 'friend', timeZone: 'Asia/Shanghai', today: '2026-09-20',
  days: [{ date: '2026-09-19', sessionId: 'yesterday', timeZone: 'Asia/Shanghai', summary: { status: 'failed', attempts: 1, error: 'Invalid model response', nextAttemptAt: null } }],
  requests: [{ turnId: 'web:friend:request', requestId: 'request', sessionId: 'yesterday', date: '2026-09-19', acceptedAt: '2026-09-19T00:00:00Z', sequence: 1, source: 'chat-web', contextProjectId: 'a', status: 'interrupted', error: 'Check prior tool writes' }],
});
test('daily calendar retains failure and request identity; malformed lifecycle data fails closed', () => {
  assert.deepEqual(parseFriendDailyState(fixture()), fixture());
  for (const alter of [v => v.days[0].summary.status = 'success', v => v.days[0].summary.attempts = -1, v => v.requests[0].sequence = '1', v => v.requests[0].status = 'offline', v => v.today = 'invalid', v => v.days[0].summary.nextAttemptAt = 'invalid']) {
    const value = fixture(); alter(value); assert.throws(() => parseFriendDailyState(value));
  }
});
test('daily status retry uses scoped backend action and rejects wrong Friend or error responses', async (t) => {
  const calls = []; let response = fixture();
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({url,options}); return Response.json(response); });
  await fetchFriendDailyState('friend', undefined, {action: 'retry-summary',date:'2026-09-19'});
  assert.equal(calls[0].url, '/api/long-agents/friend/daily'); assert.deepEqual(JSON.parse(calls[0].options.body), {action:'retry-summary',date:'2026-09-19'});
  response = {...fixture(),longAgentId:'other'}; await assert.rejects(fetchFriendDailyState('friend'), /identity mismatch/);
  t.mock.method(globalThis, 'fetch', async () => Response.json({statusMessage:'Already running'}, {status:409}));
  await assert.rejects(fetchFriendDailyState('friend'), /Already running/);
});
