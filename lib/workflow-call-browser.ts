import { parseWorkflowCallStatistics, type WorkflowCallStatistics } from "./workflow-call-statistics.ts";
import { parseWorkflowCallTree, type WorkflowCallTreeNode } from "./workflow-call-tree.ts";

export interface WorkflowCallProjection {
  workflowCallStatistics: WorkflowCallStatistics;
  workflowCallTree: WorkflowCallTreeNode[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWorkflowCallProjection(
  value: unknown,
  rootSessionId: string,
): WorkflowCallProjection {
  if (!isRecord(value)) throw new Error("Chat返回了无效Workflow调用看护数据");
  return {
    workflowCallStatistics: parseWorkflowCallStatistics(value.workflowCallStatistics),
    workflowCallTree: parseWorkflowCallTree(value.workflowCallTree, rootSessionId),
  };
}
