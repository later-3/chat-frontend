import assert from "node:assert/strict";
import test from "node:test";
import { friendSessionCreationRequest, acknowledgeFriendSessionCreation } from "./friend-session-creation.ts";
test("unacknowledged creation keeps its request across retries and separates Agent/date", () => {
  const first = friendSessionCreationRequest("friend", "2026-09-30");
  assert.equal(friendSessionCreationRequest("friend", "2026-09-30"), first);
  assert.notEqual(friendSessionCreationRequest("other", "2026-09-30"), first);
  assert.notEqual(friendSessionCreationRequest("friend", "2026-10-01"), first);
  acknowledgeFriendSessionCreation("friend", "2026-09-30");
  assert.notEqual(friendSessionCreationRequest("friend", "2026-09-30"), first);
});
