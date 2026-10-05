import assert from "node:assert/strict";
import test from "node:test";
import { claimExecutionCompletion, friendSettlement, parseSessionSettlement } from "./execution-completion.ts";

const event = { projectId: "project", sessionId: "session", executionId: "run:one", status: "completed" };
const session = { id: event.sessionId, projectId: event.projectId };
const parse = body => parseSessionSettlement({ session, ...body }, session.projectId, session.id);
const friend = {
  schemaVersion: 1, kind: "friend", id: "turn", longAgentId: "friend", projectId: "project", sessionId: "session",
  contextProjectId: null, status: "running", error: null, acceptedAt: "2026-09-30T00:00:00Z",
  capabilities: { cancel: true, steer: true, followUp: true, images: false },
};

test("foreground, reconnect and background observations share one completion, while the next Run can notify", () => {
  const delivered = new Set();
  assert.equal(claimExecutionCompletion(event, delivered), true);
  assert.equal(claimExecutionCompletion({ ...event }, delivered), false);
  assert.equal(claimExecutionCompletion({ ...event, executionId: "run:two" }, delivered), true);
  for (const status of ["failed", "cancelled", "interrupted"]) {
    assert.equal(claimExecutionCompletion({ ...event, executionId: status, status }, delivered), false);
  }
});

test("a vanished roster entry, active execution or old outcome cannot prove success", () => {
  assert.equal(parse({}), undefined);
  const workflowOutcome = { runId: "old", status: "completed" };
  assert.equal(parse({ workflowOutcome, activeWorkflowRun: { runId: "new" } }), undefined);
  assert.equal(parse({ workflowOutcome, activePlanningExecution: { id: "planning" } }), undefined);
  for (const status of ["queued", "running"]) assert.equal(parse({ workflowOutcome, friendExecution: { ...friend, status } }), undefined);
  for (const status of ["failed", "cancelled", "interrupted"]) {
    const settlement = parse({ workflowOutcome, friendExecution: { ...friend, status } });
    assert.equal(settlement.status, status);
    assert.equal(claimExecutionCompletion(settlement, new Set()), false);
  }
});

test("terminal Session facts identify the whole Workflow or Friend turn and reject mismatched identities", () => {
  assert.deepEqual(parse({ workflowOutcome: { runId: "one", status: "completed" } }), event);
  // 一轮一次完成事件：Friend 轮次的 settlement 键固定在「接受的轮次」上，即使它后来绑定了 run。
  assert.equal(friendSettlement({ ...friend, workflow: { runId: "one" } }, "completed").executionId, "turn:turn");
  assert.equal(parse({ friendExecution: { ...friend, status: "completed" } }).executionId, "turn:turn");
  assert.throws(() => parse({ session: { ...session, projectId: "elsewhere" } }), /mismatched/);
  assert.throws(() => parse({ friendExecution: { ...friend, sessionId: "elsewhere" } }), /mismatched/);
  assert.throws(() => parse({ workflowOutcome: { runId: "one", status: "agent_end" } }));
});
