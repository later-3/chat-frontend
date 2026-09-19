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
