import assert from "node:assert/strict";
import test from "node:test";
import { parseChatRunEvent, workflowCallProgressText } from "./chat-workflow-events.ts";

test("validates Workflow Stage and Agent events", () => {
  const stage = {
    workflowId: "planning-execution",
    stageId: "plan",
    nodeKind: "agent",
    agentId: "planner",
  };
  assert.deepEqual(parseChatRunEvent({ type: "stage_start", stage }), {
    type: "stage_start",
    stage,
  });
  assert.deepEqual(parseChatRunEvent({
    type: "agent_event",
    stage,
    event: { type: "tool_execution_start", toolCallId: "tool-1", toolName: "bash" },
  }), {
    type: "agent_event",
    stage,
    event: { type: "tool_execution_start", toolCallId: "tool-1", toolName: "bash" },
  });
});

test("rejects malformed Workflow events at the browser boundary", () => {
  assert.throws(() => parseChatRunEvent({ type: "stage_start", stage: {} }), /Stage/);
  assert.throws(() => parseChatRunEvent({
    type: "agent_event",
    stage: { workflowId: "w", stageId: "s", nodeKind: "agent", agentId: "a" },
    event: {},
  }), /Agent/);
  assert.throws(() => parseChatRunEvent({
    type: "agent_event",
    stage: { workflowId: "w", stageId: "s", nodeKind: "agent", agentId: "a" },
    event: { type: "message_end", message: { role: "assistant" } },
  }), /消息/);
});

test("reads workflow_call progress without interpreting other Tool updates", () => {
  const event = {
    type: "tool_execution_update",
    toolCallId: "tool-1",
    toolName: "workflow_call",
    partialResult: {
      content: [{ type: "text", text: "Workflow child running: bash · 1200ms" }],
      details: { status: "running", elapsedMs: 1_200 },
    },
  };
  assert.equal(workflowCallProgressText(event), "Workflow child running: bash · 1200ms");
  assert.equal(workflowCallProgressText({ ...event, toolName: "bash" }), undefined);
  assert.equal(workflowCallProgressText({ ...event, partialResult: {} }), undefined);
});

test("validates a human plan review without inventing an Agent", () => {
  const stage = { workflowId: "planning-execution", stageId: "review", nodeKind: "task" };
  const review = {
    reviewId: "review-1",
    workflowId: "planning-execution",
    workflowInvocationId: "invocation-1",
    sessionId: "session-1",
    planRevision: 2,
    planSha256: "a".repeat(64),
    plan: "revised plan",
    readiness: "ready_for_review",
    blockingQuestions: [],
  };
  assert.deepEqual(parseChatRunEvent({ type: "review_required", stage, review }), {
    type: "review_required",
    stage,
    review,
  });
  assert.throws(() => parseChatRunEvent({
    type: "review_required",
    stage: { ...stage, agentId: "human" },
    review,
  }), /Task Stage/);
  assert.throws(() => parseChatRunEvent({
    type: "review_required",
    stage,
    review: { ...review, readiness: "needs_clarification", blockingQuestions: [] },
  }), /就绪状态/);
});

test("validates a clarification review that cannot be presented as executable", () => {
  const stage = { workflowId: "planning-execution", stageId: "review", nodeKind: "task" };
  const review = {
    reviewId: "clarification-1",
    workflowId: "planning-execution",
    workflowInvocationId: "invocation-1",
    sessionId: "session-1",
    planRevision: 1,
    planSha256: "b".repeat(64),
    plan: "# Task clarification",
    readiness: "needs_clarification",
    blockingQuestions: ["Which budget should be used?"],
  };
  assert.deepEqual(parseChatRunEvent({ type: "review_required", stage, review }).review, review);
});
