import test from "node:test";
import assert from "node:assert/strict";
import { groupWorkflowProcess } from "./workflow-process.ts";
const message = (stageId, content, stopReason = "stop", invocationId = "i") => ({ role: "assistant", content, stopReason,
  chatWorkflow: { workflowId: "direct", invocationId, stageId, agentId: stageId === "remember" ? "session-memory-writer" : "worker" } });
test("answers without thinking still expose their node; memory summaries count actual writes only", () => {
  const messages = [message("execute", [{ type: "text", text: "answer" }]),
    message("remember", [{ type: "text", text: "I saved it" }])];
  let nodes = groupWorkflowProcess(messages, 0, messages.length, new Map());
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes.map(n => n.indices), [[0], [1]]);
  assert.equal(nodes[1].memoryWrites, 0, "model prose is not a write receipt");
  messages[1].content.push({ type: "toolCall", toolCallId: "t", toolName: "session_memory", input: { operation: "write" } });
  const result = { role: "toolResult", toolCallId: "t", content: [], details: { revision: 1, entries: [] } };
  nodes = groupWorkflowProcess(messages, 0, messages.length, new Map([["t", result]]));
  assert.equal(nodes[1].memoryWrites, 1);
  assert.equal(groupWorkflowProcess(messages, 0, messages.length, new Map([["t", { ...result, isError: true }]]))[1].memoryWrites, 0);
});
test("different invocations and failure/cancel outcomes stay separate", () => {
  const nodes = groupWorkflowProcess([message("execute", [], "error", "i1"), message("execute", [], "aborted", "i2")], 0, 2, new Map());
  assert.deepEqual(nodes.map(n => n.status), ["failed", "cancelled"]);
  assert.notEqual(nodes[0].key, nodes[1].key);
});
test("durable memory notices expose skipped and pre-response failure nodes", () => {
  for (const status of ["skipped", "failed", "cancelled"]) {
    const messages = [message("execute", [{ type: "text", text: "answer" }]), { role: "custom", customType: "chat.session_memory_notice",
      content: "maintenance outcome", details: { workflowId: "direct", invocationId: "i", status } }];
    assert.equal(groupWorkflowProcess(messages, 0, 2, new Map())[1].status, status);
  }
});
