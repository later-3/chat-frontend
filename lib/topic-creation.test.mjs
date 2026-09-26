import test from "node:test";
import assert from "node:assert/strict";
import { parseTopicCreationRequests, fetchTopicCreationRequests, topicNodeUrl } from "./topic-creation.ts";

const review = { reviewId: "review-2", workflowId: "topic-session-create", workflowInvocationId: "inv-1",
  sessionId: "prepare-1", planRevision: 2, planSha256: "a".repeat(64), plan: "已修订上下文", readiness: "ready_for_review", blockingQuestions: [] };
const request = { requestId: "req-1", sourceSessionId: "daily-1", prepareSessionId: "prepare-1", runId: "run-1",
  workflowInvocationId: "inv-1", startedAt: new Date().toISOString(), status: "running", phase: "waiting_review", review, error: null, node: null };

test("creation discovery restores a pending review and validates its version and output", () => {
  assert.deepEqual(parseTopicCreationRequests({ schemaVersion: 1, creations: [request] })[0], request);
  assert.throws(() => parseTopicCreationRequests({ schemaVersion: 1, creations: [{ ...request, review: { ...review, planRevision: 0 } }] }));
  assert.throws(() => parseTopicCreationRequests({ schemaVersion: 1, creations: [{ ...request, status: "guess-success" }] }));
  assert.throws(() => parseTopicCreationRequests({ schemaVersion: 1, creations: [{ ...request, node: { title: "missing identities" } }] }));
  const node = { topicId: "topic-1", nodeId: "node-1", sessionId: "sess-1", title: "主题" };
  const url = new URL(topicNodeUrl("friend-2", node), "http://chat.test");
  assert.equal(url.searchParams.get("topicAgent"), "friend-2");
  assert.equal(url.searchParams.get("nodeId"), node.nodeId);
});

test("refresh and reconnect only read durable creation references, never submit a second request", async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      return Response.json({ schemaVersion: 1, creations: [request] });
    };
    for (let i = 0; i < 2; i++) assert.equal((await fetchTopicCreationRequests("friend", "daily-1"))[0].runId, "run-1");
    assert.equal(calls.every(call => call.method === "GET" && call.url.includes("sourceSessionId=daily-1")), true);
  } finally { globalThis.fetch = original; }
});
