export interface WorkflowCallCounts {
  total: number;
  active: number;
  starting: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalDurationMs: number;
}

export interface WorkflowCallStatistics {
  capacity: {
    active: number;
    limit: number;
  };
  direct: WorkflowCallCounts;
  tree: WorkflowCallCounts & {
    subsessionCount: number;
    maxDepth: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Chat返回了无效Workflow调用统计: ${field}`);
  }
  return value as number;
}

function parseCounts(value: unknown, field: string): WorkflowCallCounts {
  if (!isRecord(value)) throw new Error(`Chat返回了无效Workflow调用统计: ${field}`);
  const parsed = {
    total: count(value.total, `${field}.total`),
    active: count(value.active, `${field}.active`),
    starting: count(value.starting, `${field}.starting`),
    running: count(value.running, `${field}.running`),
    completed: count(value.completed, `${field}.completed`),
    failed: count(value.failed, `${field}.failed`),
    cancelled: count(value.cancelled, `${field}.cancelled`),
    totalDurationMs: count(value.totalDurationMs, `${field}.totalDurationMs`),
  };
  if (parsed.active !== parsed.starting + parsed.running
    || parsed.total !== parsed.active + parsed.completed + parsed.failed + parsed.cancelled) {
    throw new Error(`Chat返回了不一致的Workflow调用统计: ${field}`);
  }
  return parsed;
}

export function parseWorkflowCallStatistics(value: unknown): WorkflowCallStatistics {
  if (!isRecord(value) || !isRecord(value.capacity)) {
    throw new Error("Chat返回了无效Workflow调用统计");
  }
  const direct = parseCounts(value.direct, "direct");
  const treeCounts = parseCounts(value.tree, "tree");
  const active = count(value.capacity.active, "capacity.active");
  const limit = count(value.capacity.limit, "capacity.limit");
  if (active !== direct.active || limit < 1 || active > limit || !isRecord(value.tree)) {
    throw new Error("Chat返回了不一致的Workflow调用容量统计");
  }
  return {
    capacity: { active, limit },
    direct,
    tree: {
      ...treeCounts,
      subsessionCount: count(value.tree.subsessionCount, "tree.subsessionCount"),
      maxDepth: count(value.tree.maxDepth, "tree.maxDepth"),
    },
  };
}
