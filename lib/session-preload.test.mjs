import assert from "node:assert/strict";
import test from "node:test";
import {
  clearProjectSessionPayload,
  stashProjectSessionPayload,
  takeProjectSessionPayload,
} from "./session-preload.ts";

/**
 * The navigation payload is a one-shot shortcut for the chat loader. These are exactly the properties the
 * "no duplicate full session download" claim rests on: one slot, matched by BOTH ids, consumed once,
 * and expired so a stale body can never be shown as the current session.
 */
test("a navigation payload serves every load of that same navigation, and nothing else", () => {
  clearProjectSessionPayload();
  stashProjectSessionPayload("p1", "s1", { body: 1 });

  assert.equal(takeProjectSessionPayload("OTHER"), undefined, "a different session must not take it");
  // Two consumers of the SAME navigation (the landing and the click) share the ONE read result.
  assert.deepEqual(takeProjectSessionPayload("s1"), { body: 1 });
  assert.deepEqual(takeProjectSessionPayload("s1"), { body: 1 });

  // A new navigation to another session replaces it: the old payload can never serve the new one.
  stashProjectSessionPayload("p1", "s2", { body: "new" });
  assert.deepEqual(takeProjectSessionPayload("s2"), { body: "new" });
  assert.equal(takeProjectSessionPayload("s1"), undefined, "the replaced navigation is gone");
  clearProjectSessionPayload();
});

test("a stale navigation payload is not reused", () => {
  clearProjectSessionPayload();
  stashProjectSessionPayload("p1", "s1", { body: "stale" }, 1_000);
  assert.equal(takeProjectSessionPayload("s1", 1_000 + 60_000), undefined, "beyond the TTL the chat must fetch");
  clearProjectSessionPayload();
  stashProjectSessionPayload("p1", "s1", { body: "fresh" }, 1_000);
  assert.deepEqual(takeProjectSessionPayload("s1", 1_000 + 100), { body: "fresh" });
  clearProjectSessionPayload();
});
