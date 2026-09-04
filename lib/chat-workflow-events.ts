import type { AgentEventLike } from "./agent-event-wire";

export interface ChatRunStage {
  readonly workflowId: string;
  readonly stageId: string;
  readonly nodeKind: "agent" | "task";
  readonly agentId?: string;
}

export interface PlanReview {
  readonly reviewId: string;
  readonly workflowId: string;
  readonly workflowInvocationId: string;
  readonly sessionId: string;
  readonly planRevision: number;
  readonly planSha256: string;
  readonly plan: string;
  readonly readiness: "ready_for_review" | "needs_clarification";
  readonly blockingQuestions: readonly string[];
}

export type ChatRunEvent =
  | { readonly type: "stage_start"; readonly stage: ChatRunStage }
  | { readonly type: "review_required"; readonly stage: ChatRunStage; readonly review: PlanReview }
  | { readonly type: "agent_event"; readonly stage: ChatRunStage; readonly event: AgentEventLike };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the model-safe text produced by Pi Tool onUpdate for workflow_call. */
export function workflowCallProgressText(event: AgentEventLike): string | undefined {
  if (event.type !== "tool_execution_update" || event.toolName !== "workflow_call"
    || !isRecord(event.partialResult) || !Array.isArray(event.partialResult.content)) {
    return undefined;
  }
  const text = event.partialResult.content
    .filter((item): item is Record<string, unknown> => isRecord(item) && item.type === "text")
    .map((item) => item.text)
    .find((value): value is string => typeof value === "string" && value.trim() !== "");
  return text;
}

function parseStage(value: unknown): ChatRunStage {
  if (!isRecord(value) || typeof value.workflowId !== "string" || typeof value.stageId !== "string"
    || (value.nodeKind !== "agent" && value.nodeKind !== "task")) {
    throw new Error("Chat Workflow返回了无效Stage事件");
  }
  if (value.nodeKind === "agent" && typeof value.agentId !== "string") {
    throw new Error("Chat Workflow返回的Agent Stage缺少agentId");
  }
  if (value.nodeKind === "task" && value.agentId !== undefined) {
    throw new Error("Chat Workflow返回的Task Stage不能包含agentId");
  }
  return {
    workflowId: value.workflowId,
    stageId: value.stageId,
    nodeKind: value.nodeKind,
    ...(value.agentId === undefined ? {} : { agentId: value.agentId as string }),
  };
}

export function parsePlanReview(value: unknown): PlanReview {
  if (!isRecord(value) || typeof value.reviewId !== "string" || typeof value.workflowId !== "string"
    || typeof value.workflowInvocationId !== "string" || typeof value.sessionId !== "string"
    || !Number.isSafeInteger(value.planRevision) || (value.planRevision as number) < 1
    || typeof value.planSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.planSha256)
    || typeof value.plan !== "string") {
    throw new Error("Chat Workflow返回了无效计划审核");
  }
  const readiness = value.readiness === undefined ? "ready_for_review" : value.readiness;
  const blockingQuestions = value.blockingQuestions === undefined ? [] : value.blockingQuestions;
  if ((readiness !== "ready_for_review" && readiness !== "needs_clarification")
    || !Array.isArray(blockingQuestions)
    || blockingQuestions.some((question) => typeof question !== "string" || question.trim() === "")
    || (readiness === "ready_for_review" && blockingQuestions.length > 0)
    || (readiness === "needs_clarification" && blockingQuestions.length === 0)) {
    throw new Error("Chat Workflow返回了无效计划就绪状态");
  }
  return {
    reviewId: value.reviewId,
    workflowId: value.workflowId,
    workflowInvocationId: value.workflowInvocationId,
    sessionId: value.sessionId,
    planRevision: value.planRevision as number,
    planSha256: value.planSha256,
    plan: value.plan,
    readiness,
    blockingQuestions: blockingQuestions as string[],
  };
}

function isMessage(value: unknown): boolean {
  if (!isRecord(value) || typeof value.role !== "string") return false;
  if (value.role === "user") return typeof value.content === "string" || Array.isArray(value.content);
  if (value.role === "assistant") return Array.isArray(value.content);
  return value.role === "toolResult"
    && typeof value.toolCallId === "string"
    && Array.isArray(value.content);
}

function parseAgentEvent(value: unknown): AgentEventLike {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Chat Workflow返回了无效Agent事件");
  }
  if (value.type === "agent_start") return { type: value.type };
  if (value.type === "agent_end") {
    if (typeof value.willRetry !== "boolean") throw new Error("Chat Workflow返回了无效Agent结束事件");
    return value as AgentEventLike;
  }
  if (value.type === "message_start" || value.type === "message_end") {
    if (!isMessage(value.message)) throw new Error("Chat Workflow返回了无效消息事件");
    return value as AgentEventLike;
  }
  if (value.type === "message_update") {
    if (!isRecord(value.assistantMessageEvent) || typeof value.assistantMessageEvent.type !== "string") {
      throw new Error("Chat Workflow返回了无效消息增量");
    }
    return value as AgentEventLike;
  }
  if (
    value.type === "tool_execution_start"
    || value.type === "tool_execution_update"
    || value.type === "tool_execution_end"
  ) {
    if (typeof value.toolCallId !== "string" || typeof value.toolName !== "string") {
      throw new Error("Chat Workflow返回了无效工具事件");
    }
    if (value.type === "tool_execution_end" && typeof value.isError !== "boolean") {
      throw new Error("Chat Workflow返回了无效工具结束事件");
    }
    return value as AgentEventLike;
  }
  if (
    value.type === "auto_retry_start"
    || value.type === "auto_retry_end"
    || value.type === "compaction_start"
    || value.type === "compaction_end"
  ) {
    return value as AgentEventLike;
  }
  throw new Error(`Chat Workflow返回了不支持的Agent事件: ${value.type}`);
}

/** Validates one NDJSON event before it reaches the Pi Web renderer. */
export function parseChatRunEvent(value: unknown): ChatRunEvent {
  if (!isRecord(value)) throw new Error("Chat Workflow返回了无效过程事件");
  const stage = parseStage(value.stage);
  if (value.type === "stage_start") return { type: value.type, stage };
  if (value.type === "review_required") {
    if (stage.nodeKind !== "task" || stage.stageId !== "review") {
      throw new Error("计划审核事件必须来自审核Task Stage");
    }
    return { type: value.type, stage, review: parsePlanReview(value.review) };
  }
  if (value.type !== "agent_event" || stage.nodeKind !== "agent") {
    throw new Error("Chat Workflow返回了无效Agent事件");
  }
  return { type: value.type, stage, event: parseAgentEvent(value.event) };
}
