import test from "node:test";
import assert from "node:assert/strict";
import { parseFriendInteractionProject, fetchFriendInteractionProject, saveFriendInteractionProject, friendProjectSendState, isFriendInteractionResponseCurrent } from "./friend-interaction-project.ts";

const state = {
  schemaVersion: 1, longAgentId: "friend", status: "set", projectId: "proj-p", revision: 2, updatedAt: "2026-09-21T00:00:00Z",
  effective: { projectId: "proj-p", availability: "active", reason: null },
};

test("project association parsing keeps the three states and rejects malformed shapes", () => {
  assert.equal(parseFriendInteractionProject(state).effective.projectId, "proj-p");
  assert.equal(parseFriendInteractionProject({ ...state, status: "unset", projectId: null, revision: 0, effective: { projectId: null, availability: "none", reason: null } }).status, "unset");
  assert.equal(parseFriendInteractionProject({ ...state, effective: { projectId: null, availability: "unavailable", reason: "gone" } }).effective.availability, "unavailable");
  assert.throws(() => parseFriendInteractionProject({ ...state, status: "other" }));
  assert.throws(() => parseFriendInteractionProject({ ...state, revision: -1 }));
  assert.throws(() => parseFriendInteractionProject({ ...state, effective: { projectId: "x", availability: "maybe", reason: null } }));
});

test("association requests carry projectId and expectedRevision only", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path, init) => {
    calls.push({ path, init });
    return Response.json({ ...state, revision: 3 });
  });
  await fetchFriendInteractionProject("friend");
  const next = await saveFriendInteractionProject("friend", { projectId: null, expectedRevision: 2 });
  assert.equal(next.revision, 3);
  assert.equal(calls[0].path, "/api/long-agents/friend/interaction-project");
  assert.equal(calls[0].init.method, "GET");
  assert.deepEqual(JSON.parse(calls[1].init.body), { projectId: null, expectedRevision: 2 });
  assert.equal(String(calls[1].path).includes("interactionRevision"), false);
});

test("slow responses and send gating are decided by the current Friend identity", () => {
  assert.equal(isFriendInteractionResponseCurrent("friend", "friend"), true);
  assert.equal(isFriendInteractionResponseCurrent("friend", "friend2"), false);
  assert.equal(isFriendInteractionResponseCurrent("friend", null), false);
  assert.equal(friendProjectSendState(null), "loading");
  assert.equal(friendProjectSendState(parseFriendInteractionProject(state)), "ready");
  assert.equal(friendProjectSendState(parseFriendInteractionProject({ ...state, effective: { projectId: null, availability: "unavailable", reason: "gone" } })), "unavailable");
  assert.equal(friendProjectSendState(parseFriendInteractionProject({ ...state, projectId: null, effective: { projectId: null, availability: "none", reason: null } })), "ready");
});
