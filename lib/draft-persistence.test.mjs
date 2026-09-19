import assert from "node:assert/strict";
import test from "node:test";
import { composerDraftKey } from "./composer-context.ts";

// Separate module instances stand in for a reloaded document; storage stays in
// the same browser tab. Images intentionally remain memory-only.
test("same-tab refresh restores text, signals missing attachments, and successful clearing is durable", async () => {
  const storage = new Map();
  globalThis.window = { sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  try {
    const original = await import('./draft-store.ts?original');
    const restored = await import('./draft-store.ts?reloaded');
    const key = composerDraftKey('session', true, 'context', null, 'device', 'owner-project');
    original.setDraft(key, { value: '我的草稿', images: [{ data: 'aGVsbG8=', mimeType: 'image/png' }] });
    assert.deepEqual(restored.getDraft(key), { value: '我的草稿', images: [], missingImages: 1 });
    assert.equal(restored.getDraft(composerDraftKey('session', true, 'context', null, 'other-device', 'owner-project')), null);
    assert.equal(restored.getDraft(composerDraftKey('session', true, 'other-context', null, 'device', 'owner-project')), null);
    restored.clearDraft(key);
    const afterSend = await import('./draft-store.ts?after-send');
    assert.equal(afterSend.getDraft(key), null);
    storage.set('chat:composer:v1:broken', '{');
    assert.equal(afterSend.getDraft('broken'), null);
  } finally { delete globalThis.window; }
});
