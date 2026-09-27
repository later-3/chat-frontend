import assert from "node:assert/strict";
import test from "node:test";
import { findFinalAssistantIndex } from "./message-display.ts";

test("a memory receipt does not replace the work answer; ordinary multi-message answers keep their last reply", () => {
  const user = { role: "user", content: "question" };
  const work = { role: "assistant", content: [{ type: "text", text: "useful answer" }] };
  const receipt = { role: "assistant", content: [{ type: "text", text: "stored entry/revision" }],
    chatWorkflow: { workflowId: "session-memory", stageId: "remember", agentId: "writer", invocationId: "i" } };
  assert.equal(findFinalAssistantIndex([user, work, receipt], 0, 3), 1);
  assert.equal(findFinalAssistantIndex([user, work, { ...work }], 0, 3), 2);
  assert.equal(findFinalAssistantIndex([user, receipt], 0, 2), -1, "a receipt alone is never an answer");
});

test("a memory tail owned by a selected Workflow never replaces the work answer", () => {
  const user = { role: "user", content: "question" };
  const answer = { role: "assistant", content: [{ type: "text", text: "answer" }] };
  const memory = { role: "assistant", content: [{ type: "text", text: "stored" }], chatWorkflow: { workflowId: "minimal-pi-coding-agent", stageId: "remember", agentId: "session-memory-writer", invocationId: "round" } };
  assert.equal(findFinalAssistantIndex([user, answer, memory], 0, 3), 1);
});
