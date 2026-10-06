import assert from 'node:assert/strict';
import test from 'node:test';
import { getInitialNavigation } from './initial-navigation.ts';
import { normalizeDeviceWorkspaceSnapshot, workspaceUrlFromNavigation } from './device-workspace.ts';
test('legacy Session links preserve the owning Project across device snapshot and URL restoration', () => {
  const navigation = getInitialNavigation(new URLSearchParams('session=old-friend-session&projectId=daily-friend'));
  assert.equal(navigation.sessionProjectId, 'daily-friend');
  const saved = normalizeDeviceWorkspaceSnapshot({ navigation });
  assert.equal(workspaceUrlFromNavigation(saved.navigation), '/?session=old-friend-session&projectId=daily-friend');
  assert.deepEqual(getInitialNavigation(new URLSearchParams('cwd=/workspace&session=old&projectId=daily')), { requestedCwd: '/workspace', sessionId: null });
});

test("会话定位三要素：URL 读取 agent，并兼容没有 agent 的旧链接", () => {
  const withAgent = getInitialNavigation(new URLSearchParams("session=s1&projectId=p1&agent=coder-muse"));
  assert.equal(withAgent.sessionId, "s1");
  assert.equal(withAgent.sessionProjectId, "p1");
  assert.equal(withAgent.sessionLongAgentId, "coder-muse");

  const legacy = getInitialNavigation(new URLSearchParams("session=s1&projectId=p1"));
  assert.equal(legacy.sessionLongAgentId, undefined, "旧链接（无 agent）仍可解析");

  const ordinary = getInitialNavigation(new URLSearchParams("session=s1"));
  assert.equal(ordinary.sessionProjectId, undefined);
  assert.equal(ordinary.sessionLongAgentId, undefined);
});
