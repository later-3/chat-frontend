import assert from "node:assert/strict";
import test from "node:test";
import { createRunActivity, reduceRunActivity, changeRunPhase } from "./run-activity.ts";
import { parseChatRunEvent } from "./chat-workflow-events.ts";
const stage = { workflowId: "w", stageId: "execute", nodeKind: "agent", agentId: "a" };
const event = value => parseChatRunEvent({ type: "agent_event", stage, event: value });
test("streamed tool arguments are model generation until tool execution actually starts", () => {
  let state = createRunActivity("responding", 0);
  for (const [index, type] of ["toolcall_start", "toolcall_delta", "toolcall_delta", "toolcall_end"].entries()) {
    state = reduceRunActivity(state, event({ type: "message_update", assistantMessageEvent: { type, contentIndex: 1, delta: "new parameter text" } }), 10 + index);
    assert.equal(state.phase, "preparing_tool");
    assert.equal(state.since, 10);
    assert.equal(state.lastEventAt, 10 + index);
    assert.deepEqual(state.tools, {});
  }
  state = reduceRunActivity(state, event({ type: "tool_execution_start", toolCallId: "edit-1", toolName: "edit" }), 20);
  assert.equal(state.phase, "tools");
  state = reduceRunActivity(state, event({ type: "tool_execution_end", toolCallId: "edit-1", toolName: "edit", isError: false }), 25);
  state = reduceRunActivity(state, event({ type: "turn_start" }), 30);
  assert.equal(state.phase, "waiting");
});
test("waiting, thinking and text keep a continuous phase clock until the phase changes", () => {
  let state = reduceRunActivity(createRunActivity("starting", 0), event({ type: "turn_start" }), 10);
  assert.equal(state.phase, "waiting");
  state = reduceRunActivity(state, event({ type: "message_update", assistantMessageEvent: { type: "thinking_delta" } }), 20);
  state = reduceRunActivity(state, event({ type: "message_update", assistantMessageEvent: { type: "thinking_delta" } }), 30);
  assert.equal(state.since, 20);
  assert.equal(state.lastEventAt, 30);
  state = reduceRunActivity(state, event({ type: "message_update", assistantMessageEvent: { type: "text_delta" } }), 40);
  assert.equal(state.phase, "responding");
});
test("parallel tools remain running until all end; next turn waits for the model", () => {
  let state = createRunActivity("waiting");
  for (const id of ["a", "b"]) state = reduceRunActivity(state, event({ type: "tool_execution_start", toolCallId: id, toolName: "bash" }));
  state = reduceRunActivity(state, event({ type: "tool_execution_end", toolCallId: "a", toolName: "bash", isError: false }));
  assert.equal(state.phase, "tools");
  state = reduceRunActivity(state, event({ type: "tool_execution_end", toolCallId: "b", toolName: "bash", isError: true }));
  assert.equal(state.tools.b.status, "failed");
  state = reduceRunActivity(state, event({ type: "turn_start" }));
  assert.equal(state.phase, "waiting");
  state = reduceRunActivity(state, event({ type: "agent_end", willRetry: false }));
  assert.equal(state.phase, "continuing");
});
test("retry, compression and cancellation are explicit and validate their fields", () => {
  let state = reduceRunActivity(createRunActivity("waiting"), event({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 3000 }), 100);
  assert.equal(state.retry.until, 3100);
  assert.equal(state.phase, "retry");
  state = reduceRunActivity(state, event({ type: "compaction_start", reason: "threshold" }));
  assert.equal(state.phase, "compacting");
  state = changeRunPhase(state, "stopping");
  state = reduceRunActivity(state, event({ type: "turn_start" }));
  assert.equal(state.phase, "stopping");
  assert.throws(() => event({ type: "auto_retry_start", attempt: 0, maxAttempts: 3, delayMs: -1 }));
  assert.throws(() => event({ type: "compaction_start", reason: "unknown" }));
});
