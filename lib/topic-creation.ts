import {
  submitPlanReviewDecision,
  workflowRequestSignal,
  type ChatWorkflowRunReference,
  type PlanReviewDecisionInput,
} from "./chat-workflow-browser.ts";
import { parsePlanReview, type PlanReview } from "./chat-workflow-events.ts";

/**
 * The topic-creation entry shared by the Long Agent tool and the frontend (new/fork). It starts the real
 * review-gated `topic-session-create` Workflow and exposes its review; the target Session exists only
 * after the user approves.
 */
export interface TopicCreationRun {
  readonly requestId: string;
  readonly prepareSessionId: string;
  readonly runId: string;
  readonly workflowInvocationId: string;
  readonly status: string;
}

export interface TopicCreationState {
  readonly status: string;
  readonly review: PlanReview | null;
  readonly error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Chat返回了无效${label}`);
  return value;
}

export async function startTopicCreation(longAgentId: string, input: {
  prompt: string;
  parents?: readonly { nodeId: string; anchorEntryId: string; anchorSequence: number }[];
  requestId?: string;
}, signal?: AbortSignal): Promise<TopicCreationRun> {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(longAgentId)}/topics/creations`, {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ schemaVersion: 1, ...input }),
    signal: workflowRequestSignal(signal),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const candidate = isRecord(body) ? [body.statusMessage, body.message] : [];
    throw new Error(candidate.find((value): value is string => typeof value === "string" && value.trim() !== "") ?? `HTTP ${response.status}`);
  }
  if (!isRecord(body)) throw new Error("Chat返回了无效主题创建响应");
  return {
    requestId: text(body.requestId, "创建请求 id"), prepareSessionId: text(body.prepareSessionId, "准备会话"),
    runId: text(body.runId, "Workflow Run"), workflowInvocationId: text(body.workflowInvocationId, "Workflow调用"),
    status: typeof body.status === "string" ? body.status : "awaiting_review",
  };
}

/** Current run state: a pending review, a terminal status, or still collecting. */
export async function readTopicCreationRun(longAgentId: string, run: TopicCreationRun, signal?: AbortSignal): Promise<TopicCreationState> {
  const query = new URLSearchParams({ projectId: longAgentId, workflowInvocationId: run.workflowInvocationId });
  const response = await fetch(`/runs/${encodeURIComponent(run.runId)}?${query.toString()}`, { cache: "no-store", signal: workflowRequestSignal(signal) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(body)) throw new Error(`读取主题创建状态失败：HTTP ${response.status}`);
  return {
    status: typeof body.status === "string" ? body.status : "unknown",
    review: body.review === undefined || body.review === null ? null : parsePlanReview(body.review),
    error: typeof body.error === "string" ? body.error : null,
  };
}

export function topicCreationReference(longAgentId: string, run: TopicCreationRun): ChatWorkflowRunReference {
  return { runId: run.runId, workflowInvocationId: run.workflowInvocationId, projectId: longAgentId };
}

export async function submitTopicCreationDecision(longAgentId: string, run: TopicCreationRun, review: PlanReview, decision: PlanReviewDecisionInput): Promise<void> {
  return submitPlanReviewDecision(topicCreationReference(longAgentId, run), review, decision);
}

export interface TopicCreationRequest extends TopicCreationRun {
  readonly sourceSessionId: string;
  readonly startedAt: string;
  readonly phase: string | null;
  readonly review: PlanReview | null;
  readonly error: string | null;
  readonly node: { topicId: string; nodeId: string; sessionId: string; title: string } | null;
}

export function parseTopicCreationRequests(value: unknown): TopicCreationRequest[] {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.creations)) throw new Error("主题创建列表无效");
  return value.creations.map((item: unknown) => {
    if (!isRecord(item) || !["pending", "running", "completed", "failed", "cancelled", "interrupted"].includes(String(item.status))
      || (item.phase !== null && typeof item.phase !== "string") || (item.error !== null && typeof item.error !== "string")) {
      throw new Error("主题创建状态无效");
    }
    const startedAt = text(item.startedAt, "创建时间");
    if (Number.isNaN(Date.parse(startedAt))) throw new Error("主题创建时间无效");
    let node: TopicCreationRequest["node"] = null;
    if (item.node !== null) {
      if (!isRecord(item.node)) throw new Error("主题创建产物无效");
      node = { topicId: text(item.node.topicId, "主题"), nodeId: text(item.node.nodeId, "节点"),
        sessionId: text(item.node.sessionId, "会话"), title: text(item.node.title, "标题") };
    }
    return { requestId: text(item.requestId, "请求"), sourceSessionId: text(item.sourceSessionId, "来源会话"),
      prepareSessionId: text(item.prepareSessionId, "准备会话"), runId: text(item.runId, "Run"),
      workflowInvocationId: text(item.workflowInvocationId, "调用"), startedAt, status: String(item.status),
      phase: item.phase as string | null, error: item.error as string | null,
      review: item.review === null ? null : parsePlanReview(item.review), node };
  });
}

export async function fetchTopicCreationRequests(longAgentId: string, sourceSessionId?: string, signal?: AbortSignal): Promise<TopicCreationRequest[]> {
  const query = new URLSearchParams(sourceSessionId === undefined ? {} : { sourceSessionId });
  const response = await fetch(`/api/long-agents/${encodeURIComponent(longAgentId)}/topics/creations?${query}`, {
    cache: "no-store", signal: workflowRequestSignal(signal),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`读取创建任务失败（HTTP ${response.status}），可重试；已有任务不会重新提交。`);
  return parseTopicCreationRequests(body);
}

export function topicNodeUrl(longAgentId: string, node: NonNullable<TopicCreationRequest["node"]>): string {
  return `/?${new URLSearchParams({ view: "topics", topicAgent: longAgentId, topicId: node.topicId, nodeId: node.nodeId })}`;
}
