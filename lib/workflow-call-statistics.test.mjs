import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkflowCallStatistics } from "./workflow-call-statistics.ts";

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

test("Workflow call statistics validate direct capacity and recursive totals", () => {
  assert.deepEqual(parseWorkflowCallStatistics({
    capacity: { active: 1, limit: 8 },
    direct: { ...emptyCounts, total: 2, active: 1, running: 1, completed: 1 },
    tree: {
      ...emptyCounts,
      total: 3,
      active: 1,
      running: 1,
      completed: 1,
      failed: 1,
      subsessionCount: 3,
      maxDepth: 2,
    },
  }), {
    capacity: { active: 1, limit: 8 },
    direct: { ...emptyCounts, total: 2, active: 1, running: 1, completed: 1 },
    tree: {
      ...emptyCounts,
      total: 3,
      active: 1,
      running: 1,
      completed: 1,
      failed: 1,
      subsessionCount: 3,
      maxDepth: 2,
    },
  });
});

test("Workflow call statistics reject inconsistent totals", () => {
  assert.throws(() => parseWorkflowCallStatistics({
    capacity: { active: 0, limit: 8 },
    direct: { ...emptyCounts, total: 1 },
    tree: { ...emptyCounts, subsessionCount: 0, maxDepth: 0 },
  }), /不一致/);
});
