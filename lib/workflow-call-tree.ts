export type WorkflowCallStatus = "starting" | "running" | "completed" | "failed" | "cancelled";

export interface WorkflowCallEndpoint {
  sessionId: string;
  workflowId: string;
  workflowInvocationId: string;
}

export interface WorkflowCall {
  schemaVersion: 1;
  callId: string;
  toolCallId: string;
  parent: WorkflowCallEndpoint & { stageId: string; agentId: string };
  child: WorkflowCallEndpoint & { runId?: string };
  status: WorkflowCallStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface WorkflowCallTreeNode {
  depth: number;
  parentCallId?: string;
  call: WorkflowCall;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Chat返回了无效Workflow调用树: ${field}`);
  }
  return value;
}

function endpoint(value: unknown, field: string): WorkflowCallEndpoint {
  if (!isRecord(value)) throw new Error(`Chat返回了无效Workflow调用树: ${field}`);
  return {
    sessionId: nonEmptyString(value.sessionId, `${field}.sessionId`),
    workflowId: nonEmptyString(value.workflowId, `${field}.workflowId`),
    workflowInvocationId: nonEmptyString(value.workflowInvocationId, `${field}.workflowInvocationId`),
  };
}

function parseWorkflowCall(value: unknown): WorkflowCall {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.parent) || !isRecord(value.child)) {
    throw new Error("Chat返回了无效Workflow调用树节点");
  }
  const statuses = new Set<WorkflowCallStatus>(["starting", "running", "completed", "failed", "cancelled"]);
  if (!statuses.has(value.status as WorkflowCallStatus)) {
    throw new Error("Chat返回了无效Workflow调用状态");
  }
  const hasFinishedAt = value.finishedAt !== undefined;
  const hasDurationMs = value.durationMs !== undefined;
  if (hasFinishedAt !== hasDurationMs
    || (hasDurationMs && (!Number.isSafeInteger(value.durationMs) || (value.durationMs as number) < 0))) {
    throw new Error("Chat返回了无效Workflow调用耗时");
  }
  const parsed: WorkflowCall = {
    schemaVersion: 1,
    callId: nonEmptyString(value.callId, "callId"),
    toolCallId: nonEmptyString(value.toolCallId, "toolCallId"),
    parent: {
      ...endpoint(value.parent, "parent"),
      stageId: nonEmptyString(value.parent.stageId, "parent.stageId"),
      agentId: nonEmptyString(value.parent.agentId, "parent.agentId"),
    },
    child: {
      ...endpoint(value.child, "child"),
      ...(value.child.runId === undefined
        ? {}
        : { runId: nonEmptyString(value.child.runId, "child.runId") }),
    },
    status: value.status as WorkflowCallStatus,
    startedAt: nonEmptyString(value.startedAt, "startedAt"),
    updatedAt: nonEmptyString(value.updatedAt, "updatedAt"),
    ...(hasFinishedAt ? { finishedAt: nonEmptyString(value.finishedAt, "finishedAt") } : {}),
    ...(hasDurationMs ? { durationMs: value.durationMs as number } : {}),
  };
  return parsed;
}

/** Validates both node shape and parent/child Session ownership in pre-order. */
export function parseWorkflowCallTree(value: unknown, rootSessionId: string): WorkflowCallTreeNode[] {
  if (!Array.isArray(value)) throw new Error("Chat返回了无效Workflow调用树");
  const calls = new Map<string, WorkflowCallTreeNode>();
  return value.map((candidate, index) => {
    if (!isRecord(candidate) || !Number.isSafeInteger(candidate.depth) || (candidate.depth as number) < 1) {
      throw new Error(`Chat返回了无效Workflow调用树节点: ${String(index)}`);
    }
    const call = parseWorkflowCall(candidate.call);
    if (calls.has(call.callId)) throw new Error(`Chat返回了重复Workflow调用: ${call.callId}`);
    const depth = candidate.depth as number;
    const parentCallId = candidate.parentCallId === undefined
      ? undefined
      : nonEmptyString(candidate.parentCallId, "parentCallId");
    if (depth === 1) {
      if (parentCallId !== undefined || call.parent.sessionId !== rootSessionId) {
        throw new Error(`Chat返回了不一致的根Workflow调用: ${call.callId}`);
      }
    } else {
      const parent = parentCallId === undefined ? undefined : calls.get(parentCallId);
      if (parent === undefined || parent.depth + 1 !== depth
        || parent.call.child.sessionId !== call.parent.sessionId) {
        throw new Error(`Chat返回了不一致的Workflow调用父子关系: ${call.callId}`);
      }
    }
    const node = { depth, ...(parentCallId === undefined ? {} : { parentCallId }), call };
    calls.set(call.callId, node);
    return node;
  });
}
