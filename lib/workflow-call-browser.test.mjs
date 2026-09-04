import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkflowCallProjection } from "./workflow-call-browser.ts";

const emptyCounts = {
  total: 0,
  active: 0,
  starting: 0,
  running: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  totalDurationMs: 0,
};

test("Workflow projection parser accepts a validated Session projection", () => {
  const projection = parseWorkflowCallProjection({
    workflowCallStatistics: {
      capacity: { active: 0, limit: 8 },
      direct: emptyCounts,
      tree: { ...emptyCounts, subsessionCount: 0, maxDepth: 0 },
    },
    workflowCallTree: [],
  }, "session/root");
  assert.deepEqual(projection.workflowCallTree, []);
  assert.deepEqual(projection.workflowCallStatistics.capacity, { active: 0, limit: 8 });
});

test("Workflow projection parser rejects malformed trees", () => {
  assert.throws(
    () => parseWorkflowCallProjection({
      workflowCallStatistics: {
        capacity: { active: 0, limit: 8 },
        direct: emptyCounts,
        tree: { ...emptyCounts, subsessionCount: 0, maxDepth: 0 },
      },
      workflowCallTree: [{ depth: 2, call: {} }],
    }, "root"),
    /无效Workflow调用树节点/,
  );
});
