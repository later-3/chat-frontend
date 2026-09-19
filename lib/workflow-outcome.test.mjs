import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkflowOutcome } from "./workflow-outcome.ts";
test("terminal outcomes restore after refresh and reject nonterminal or malformed facts", () => {
  assert.equal(parseWorkflowOutcome(undefined), undefined);
  for (const status of ["completed", "cancelled", "failed"]) {
    assert.deepEqual(parseWorkflowOutcome({ runId: "r", status }), { runId: "r", status });
  }
  assert.equal(parseWorkflowOutcome({ runId: "r", status: "failed", error: "interrupted" }).error, "interrupted");
  for (const value of [null, {}, { runId: "r", status: "running" }, { runId: "", status: "failed" }, { runId: "r", status: "failed", error: 1 }]) {
    assert.throws(() => parseWorkflowOutcome(value));
  }
});
