import assert from 'node:assert/strict';
import test from 'node:test';

test('unconfirmed input survives refresh; confirmation clears only that submission, preserving later drafts', async () => {
  const storage = new Map();
  globalThis.window = { sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  try {
    const original = await import('./pending-submission.ts?sender');
    const reloaded = await import('./pending-submission.ts?receiver');
    const drafts = await import('./draft-store.ts?pending-test');
    const key = 'device/project/session/context';
    const id = original.retainPendingSubmission(key, '不能丢失的发送文字', 2);
    drafts.setDraft(key, { value: '后来输入的草稿', images: [] });
    assert.deepEqual(reloaded.readPendingSubmission(key), { id, text: '不能丢失的发送文字', missingImages: 2 });
    assert.equal(reloaded.readPendingSubmission('different/context'), null);
    const nextId = reloaded.retainPendingSubmission(key, '新的提交', 0);
    reloaded.clearPendingSubmission(key, id);
    assert.equal(reloaded.readPendingSubmission(key).id, nextId);
    reloaded.clearPendingSubmission(key, nextId);
    const afterConfirmation = await import('./pending-submission.ts?confirmed');
    assert.equal(afterConfirmation.readPendingSubmission(key), null);
    assert.equal(drafts.getDraft(key).value, '后来输入的草稿');
    storage.set('chat:unconfirmed-input:v1:broken', JSON.stringify({schemaVersion:1,id:'x',text:'x',missingImages:-1}));
    assert.equal(afterConfirmation.readPendingSubmission('broken'), null);
  } finally { delete globalThis.window; }
});
