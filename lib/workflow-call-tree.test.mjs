import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkflowCallTree } from "./workflow-call-tree.ts";

function call(callId, parentSessionId, childSessionId, status = "running") {
  return {
    schemaVersion: 1,
    callId,
    toolCallId: `tool-${callId}`,
    parent: {
      sessionId: parentSessionId,
      workflowId: "direct",
      workflowInvocationId: `parent-${callId}`,
      stageId: "execute",
      agentId: "agent",
    },
    child: {
      sessionId: childSessionId,
      workflowId: "memory",
      workflowInvocationId: `child-${callId}`,
      runId: `run-${callId}`,
    },
    status,
    startedAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:01.000Z",
  };
}

test("Workflow call tree validates recursive Session ownership", () => {
  const parsed = parseWorkflowCallTree([
    { depth: 1, call: call("one", "root", "child") },
    { depth: 2, parentCallId: "one", call: call("two", "child", "grandchild") },
  ], "root");
  assert.deepEqual(parsed.map((node) => [node.call.callId, node.depth]), [["one", 1], ["two", 2]]);
});

test("Workflow call tree rejects an unrelated nested Session", () => {
  assert.throws(() => parseWorkflowCallTree([
    { depth: 1, call: call("one", "root", "child") },
    { depth: 2, parentCallId: "one", call: call("two", "other", "grandchild") },
  ], "root"), /父子关系/);
});

test("Workflow call tree rejects duplicate call IDs", () => {
  assert.throws(() => parseWorkflowCallTree([
    { depth: 1, call: call("one", "root", "child") },
    { depth: 1, call: call("one", "root", "other") },
  ], "root"), /重复/);
});

test("cross-project child references retain both storage owners and reject invalid project IDs", () => {
  const value = call("one", "root", "child");
  value.parent.projectId = "friend-home";
  value.child.projectId = "user-project";
  const parsed = parseWorkflowCallTree([{ depth: 1, call: value }], "root");
  assert.equal(parsed[0].call.parent.projectId, "friend-home");
  assert.equal(parsed[0].call.child.projectId, "user-project");
  value.child.projectId = 3;
  assert.throws(() => parseWorkflowCallTree([{ depth: 1, call: value }], "root"), /projectId/);
});
