import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchTopicDetail,
  fetchTopicGraph,
  fetchTopicIntegration,
  fetchTopicNodeAnchors,
  fetchTopicNodeMessages,
  followTopicIntegration,
  sendTopicNodeMessage,
  topicMessageRelayOf,
  TopicsRequestError,
} from "./topics-browser.ts";

const TOPIC_GRAPH = {
  schemaVersion: 1, revision: 3,
  topics: [{
    topicId: "topic-1", title: "定位", purpose: "定位线上问题", status: "active", rootSessionId: "sess-root", createdAt: "2026-09-24T00:00:00.000Z",
    nodes: [{ nodeId: "node-1", sessionId: "sess-root", title: "根节点", status: "active", readable: true, frozenProjectContext: null,
      sessionMemory: "on", initialMemoryRefs: [], parents: [] }],
  }],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("topics-browser: parses the topic graph and topic detail contracts", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => jsonResponse(TOPIC_GRAPH);
    const graph = await fetchTopicGraph("friend");
    assert.equal(graph.revision, 3);
    assert.equal(graph.topics.length, 1);
    assert.equal(graph.topics[0].nodes[0].sessionMemory, "on");
    assert.equal(graph.topics[0].nodes[0].status, "active");

    globalThis.fetch = async () => jsonResponse({
      schemaVersion: 1, revision: 4,
      topic: { topicId: "topic-1", title: "定位", purpose: "p", status: "active", rootSessionId: "sess-root" },
      nodes: [{ ...TOPIC_GRAPH.topics[0].nodes[0], topicId: "topic-1", nodeId: "node-2", sessionMemory: "off",
        initialMemoryRefs: [{ entryId: "smem-1", source: { storageProjectId: "friend", sessionId: "sess-root", entryId: "smem-0" } }],
        parents: [{ edgeId: "e1", parentNodeId: "node-1", anchorEntryId: "entry-1", anchorSequence: 1 }] }],
      edges: [{ edgeId: "e1", parentNodeId: "node-1", childNodeId: "node-2", anchorEntryId: "entry-1", anchorSequence: 1 }],
    });
    const detail = await fetchTopicDetail("friend", "topic-1");
    assert.equal(detail.nodes[0].sessionMemory, "off");
    assert.equal(detail.nodes[0].initialMemoryRefs[0].source.entryId, "smem-0");
    assert.equal(detail.edges[0].anchorSequence, 1);

    // The detail route returns RAW node records: `readable`/`parents` are only added by the graph route,
    // so the parser must tolerate their absence (and still resolve the topic's edges).
    globalThis.fetch = async () => jsonResponse({
      schemaVersion: 1, revision: 5,
      topic: { topicId: "topic-1", title: "定位", purpose: "p", status: "active", rootSessionId: "sess-root" },
      nodes: [{ topicId: "topic-1", nodeId: "node-1", sessionId: "sess-root", title: "根节点", status: "active", sessionMemory: "on",
        frozenProjectContext: null, createdBy: "agent", initialMemoryRefs: [], createdByRequestId: "r", createdAt: "t", updatedAt: "t" }],
      edges: [],
    });
    const rawDetail = await fetchTopicDetail("friend", "topic-1");
    assert.equal(rawDetail.nodes[0].readable, true, "a raw node defaults to readable for the owner");
    assert.deepEqual(rawDetail.nodes[0].parents, [], "a raw node without parents parses as no parents");

    globalThis.fetch = async () => jsonResponse({ schemaVersion: 1, topics: "nope" });
    await assert.rejects(fetchTopicGraph("friend"), /无效主题图/);
  } finally {
    globalThis.fetch = original;
  }
});

test("topics-browser: parses node messages with the relay association and rejects invalid shapes", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => jsonResponse({
      sessionId: "sess-root",
      context: { messages: [
        { role: "user", content: "为什么空指针", chatTopicRelay: { requestId: "r1", targetNodeId: "node-1", relayedByLongAgentId: "friend", source: "relay", textDigest: "x" } },
        { role: "assistant", model: "real-model", provider: "real-provider", content: [
          { type: "thinking", thinking: "先看调用栈" },
          { type: "text", text: "根因在第 42 行" },
          { type: "toolCall", toolCallId: "tc-1", toolName: "read_file", input: { path: "a.ts" } },
        ] },
        { role: "toolResult", toolCallId: "tc-1", toolName: "read_file", content: [
          { type: "text", text: "file body" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
        ] },
        { role: "user", content: [{ type: "text", text: "继续" }] },
      ], entryIds: ["e-1", "e-2", "e-3", "e-4"] },
    });
    const { messages, entryIds } = await fetchTopicNodeMessages("friend", "topic-1", "node-1");
    assert.equal(messages.length, 4);
    assert.deepEqual(entryIds, ["e-1", "e-2", "e-3", "e-4"], "entryIds stay parallel to messages");
    // Structured content is preserved as-is: no flattening, no fabricated model/provider.
    assert.equal(messages[0].role, "user");
    assert.equal(messages[0].content, "为什么空指针");
    assert.deepEqual(topicMessageRelayOf(messages[0]), { requestId: "r1", relayedByLongAgentId: "friend" });
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[1].model, "real-model");
    assert.equal(messages[1].provider, "real-provider");
    assert.deepEqual(messages[1].content.map((block) => block.type), ["thinking", "text", "toolCall"]);
    assert.equal(messages[1].content[0].thinking, "先看调用栈");
    assert.equal(messages[1].content[2].toolName, "read_file");
    assert.equal(messages[2].role, "toolResult");
    assert.deepEqual(messages[2].content.map((block) => block.type), ["text", "image"]);
    assert.equal(topicMessageRelayOf(messages[3]), null);

    globalThis.fetch = async () => jsonResponse({ sessionId: "s", context: { messages: "nope", entryIds: [] } });
    await assert.rejects(fetchTopicNodeMessages("friend", "topic-1", "node-1"), /无效节点消息/);
    // entryIds must stay parallel to messages.
    globalThis.fetch = async () => jsonResponse({ sessionId: "s", context: { messages: [{ role: "user", content: "x" }], entryIds: [] } });
    await assert.rejects(fetchTopicNodeMessages("friend", "topic-1", "node-1"), /无效节点消息/);

    globalThis.fetch = async () => jsonResponse({ statusMessage: "没有权限" }, 403);
    await assert.rejects(
      sendTopicNodeMessage("friend", "topic-1", "node-1", { requestId: "t1", text: "x" }),
      (error) => error instanceof TopicsRequestError && error.status === 403 && error.message === "没有权限",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("topics-browser: validates anchors and the integration state machine", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => jsonResponse({ schemaVersion: 1, nodeId: "node-1", sessionId: "s",
      anchors: [{ anchorEntryId: "entry-1", anchorSequence: 1, turnId: "turn-1", settledAt: "2026-09-24T00:00:00.000Z" }] });
    const anchors = await fetchTopicNodeAnchors("friend", "topic-1", "node-1");
    assert.equal(anchors[0].anchorSequence, 1);

    globalThis.fetch = async () => jsonResponse({ schemaVersion: 1, requestId: "r", topicId: "topic-1", nodeId: "node-1",
      sessionId: "s", status: "running", error: null });
    assert.equal((await fetchTopicIntegration("friend", "r")).status, "running");

    let poll = 0;
    globalThis.fetch = async () => {
      poll += 1;
      return jsonResponse({ schemaVersion: 1, requestId: "r", topicId: "topic-1", nodeId: "node-1", sessionId: "s",
        status: poll >= 2 ? "completed" : "queued", error: null });
    };
    const completed = await followTopicIntegration("friend", "r", new AbortController().signal);
    assert.equal(completed.status, "completed");
    assert.ok(poll >= 2);

    globalThis.fetch = async () => jsonResponse({ schemaVersion: 1, requestId: "r", topicId: "topic-1", nodeId: "node-1",
      sessionId: "s", status: "failed", error: "模型错误" });
    assert.deepEqual(await fetchTopicIntegration("friend", "r"), {
      requestId: "r", topicId: "topic-1", nodeId: "node-1", sessionId: "s", status: "failed", error: "模型错误",
    });

    globalThis.fetch = async () => jsonResponse({ statusMessage: "没有权限" }, 403);
    await assert.rejects(
      fetchTopicNodeAnchors("friend", "topic-1", "node-1"),
      (error) => error instanceof TopicsRequestError && error.status === 403,
    );
  } finally {
    globalThis.fetch = original;
  }
});
