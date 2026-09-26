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
