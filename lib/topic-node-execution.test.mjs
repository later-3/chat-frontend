import test from "node:test";
import assert from "node:assert/strict";
import { acceptTopicNodeMessage } from "./topic-node-execution.ts";

const EXECUTION = {
  schemaVersion: 1, kind: "friend", id: "chat-web:friend:node-1", longAgentId: "friend", projectId: "friend",
  sessionId: "sess-node", contextProjectId: null, status: "queued", error: null, acceptedAt: new Date().toISOString(),
  capabilities: { cancel: true, steer: false, followUp: true, images: true },
};

function jsonResponse(body, status = 202) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("acceptTopicNodeMessage posts to the node route and parses the accepted execution", async () => {
  const original = globalThis.fetch;
  let seen = null;
  try {
    globalThis.fetch = async (url, init) => {
      seen = { url: String(url), method: init?.method, body: JSON.parse(String(init?.body)) };
      return jsonResponse(EXECUTION);
    };
    const accepted = await acceptTopicNodeMessage(
      { longAgentId: "friend", topicId: "topic 1", nodeId: "node/1" },
      { requestId: "req-1", text: "hello" },
    );
    assert.equal(accepted.id, EXECUTION.id);
    assert.equal(accepted.sessionId, "sess-node");
    assert.equal(seen.method, "POST");
    // The node target is encoded; the send NEVER falls back to the private-chat entry.
    assert.equal(seen.url, "/api/long-agents/friend/topics/topic%201/nodes/node%2F1/messages");
    assert.deepEqual(seen.body, { schemaVersion: 1, requestId: "req-1", text: "hello" });

    globalThis.fetch = async () => jsonResponse({ statusMessage: "节点已归档，不能写入" }, 409);
    await assert.rejects(
      acceptTopicNodeMessage({ longAgentId: "friend", topicId: "t", nodeId: "n" }, { requestId: "r", text: "x" }),
      /节点已归档/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
