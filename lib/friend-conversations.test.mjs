import test from "node:test";
import assert from "node:assert/strict";
import {
  parseConversationMessages,
  parseConversationSummary,
  fetchConversations,
  startConversationRound,
} from "./friend-conversations.ts";

const summary = {
  schemaVersion: 1,
  id: "conv-0123456789abcdef0123456789abcdef",
  title: "研究小组",
  storageProjectId: "a",
  collaborationProjectId: null,
  publicSessionId: "s1",
  lifecycle: "active",
  revision: 3,
  authorizationRevision: 2,
  policy: { defaultPolicy: "mention", moderatorLongAgentId: null, roundRobinOrder: ["friend"] },
  budget: { maxRounds: 3, maxModelCalls: 12, maxWallClockMs: 900000, maxConcurrentSpeakers: 2, maxDelegationDepth: 1, maxTokensSoft: 200000 },
  members: [{
    longAgentId: "friend", participationEpoch: 1, active: true, joinedAt: "2026-09-21T00:00:00Z", revokedAt: null,
    hasParticipationSession: true, grants: { systemToolAddresses: [], nativeTools: ["read"], extensionTools: [] },
  }],
  createdAt: "2026-09-21T00:00:00Z",
  updatedAt: "2026-09-21T00:01:00Z",
};

test("conversation summary rejects malformed or widened shapes", () => {
  assert.equal(parseConversationSummary(summary).members[0].grants.nativeTools[0], "read");
  assert.equal(parseConversationSummary({ ...summary, collaborationProjectId: "a" }).collaborationProjectId, "a");
  assert.throws(() => parseConversationSummary({ ...summary, id: "" }));
  assert.throws(() => parseConversationSummary({ ...summary, budget: { maxRounds: "many" } }));
  assert.throws(() => parseConversationSummary({ ...summary, policy: { defaultPolicy: "mention", moderatorLongAgentId: null, roundRobinOrder: [1] } }));
  assert.throws(() => parseConversationSummary({ ...summary, members: [{ longAgentId: "friend" }] }));
});

test("public messages keep the stable cursor order and never invent text", () => {
  const messages = parseConversationMessages({ schemaVersion: 1, messages: [
    { entryId: "b", cursor: 2, seq: 2, authorLongAgentId: "friend", publicationId: "pub-1", text: null, unavailableReason: "源条目缺失", postedAt: "2026-09-21T00:01:00Z" },
    { entryId: "a", cursor: 1, seq: 0, authorLongAgentId: "user", publicationId: null, text: "hello", unavailableReason: null, postedAt: "2026-09-21T00:00:00Z" },
  ] });
  assert.deepEqual(messages.map((message) => message.cursor), [1, 2]);
  assert.equal(messages[1].text, null);
  assert.equal(messages[1].unavailableReason, "源条目缺失");
  assert.throws(() => parseConversationMessages({ messages: [{ entryId: "a" }] }));
});

test("owner requests never send an identity and surface Nitro errors", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path, init) => {
    calls.push({ path, init });
    return Response.json({ schemaVersion: 1, conversations: [summary] });
  });
  const conversations = await fetchConversations("friend", "a");
  assert.equal(conversations.length, 1);
  assert.equal(calls[0].path, "/api/long-agents/friend/conversations?storageProjectId=a");
  assert.equal(String(calls[0].path).includes("viewerLongAgentId"), false);
  assert.equal(calls[0].init.method, "GET");

  t.mock.method(globalThis, "fetch", async () => Response.json({ error: true, status: 409, message: "群已归档，不能启动讨论" }, { status: 409 }));
  await assert.rejects(startConversationRound("friend", "conv-1", { policy: "mention", targets: ["friend"] }), /群已归档/);
});
