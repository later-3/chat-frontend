import {
  parseChatWorkflowRunAccepted,
  parseChatWorkflowPromptResult,
  type ChatWorkflowPromptInput,
  type ChatWorkflowPromptResult,
} from "./chat-workflow-contract";
import {
  parseChatRunEvent,
  parsePlanReview,
  type ChatRunEvent,
  type PlanReview,
} from "./chat-workflow-events";

const WORKFLOW_POLL_INTERVAL_MS = 300;

export interface ChatWorkflowRunReference {
  readonly runId: string;
  readonly workflowInvocationId: string;
  readonly projectId: string;
}

export interface ChatWorkflowAcceptedRunReference extends ChatWorkflowRunReference {
  readonly sessionId: string;
  readonly isNewSession: boolean;
}

export type PlanReviewDecisionInput =
  | { readonly kind: "approve" }
  | { readonly kind: "request_revision"; readonly feedback: string };

function responseError(status: number, body: unknown): Error {
  if (body && typeof body === "object") {
    const candidate = body as { error?: unknown; statusMessage?: unknown; message?: unknown };
    const message = [candidate.error, candidate.statusMessage, candidate.message]
      .find((value): value is string => typeof value === "string" && value !== "");
    if (message) return new Error(message);
  }
  return new Error(`HTTP ${status}`);
}

function waitForNextPoll(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Workflow连接已断开", "AbortError"));
      return;
    }
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = window.setTimeout(finish, WORKFLOW_POLL_INTERVAL_MS);
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Workflow连接已断开", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function consumeRunEvents(
  runId: string,
  onEvent: (event: ChatRunEvent) => void,
  signal: AbortSignal,
  startIndex?: number,
): Promise<void> {
  const query = startIndex === undefined ? "" : `?startIndex=${encodeURIComponent(String(startIndex))}`;
  const response = await fetch(`/runs/${encodeURIComponent(runId)}/events${query}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw responseError(response.status, body);
  }
  if (response.body === null) throw new Error("Chat Workflow没有返回过程事件流");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    let newline = buffered.indexOf("\n");
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line !== "") onEvent(parseChatRunEvent(JSON.parse(line) as unknown));
      newline = buffered.indexOf("\n");
    }
    if (done) break;
  }
  if (buffered.trim() !== "") onEvent(parseChatRunEvent(JSON.parse(buffered) as unknown));
}

async function followChatWorkflowRun(
  reference: ChatWorkflowRunReference,
  signal?: AbortSignal,
  onEvent?: (event: ChatRunEvent) => void,
  startIndex?: number,
): Promise<ChatWorkflowPromptResult> {
  const streamController = new AbortController();
  const abortStream = () => streamController.abort();
  signal?.addEventListener("abort", abortStream, { once: true });
  const seenReviews = new Set<string>();
  const deliverEvent = (event: ChatRunEvent) => {
    if (event.type === "review_required") seenReviews.add(event.review.reviewId);
    onEvent?.(event);
  };
  let streamError: unknown;
  const streamPromise = onEvent === undefined
    ? Promise.resolve()
    : consumeRunEvents(reference.runId, deliverEvent, streamController.signal, startIndex)
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) streamError = error;
        });

  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Workflow连接已断开", "AbortError");
      const query = new URLSearchParams({
        projectId: reference.projectId,
        workflowInvocationId: reference.workflowInvocationId,
      });
      const statusResponse = await fetch(
        `/runs/${encodeURIComponent(reference.runId)}?${query.toString()}`,
        { cache: "no-store", signal },
      );
      const statusBody: unknown = await statusResponse.json().catch(() => null);
      if (!statusResponse.ok) throw responseError(statusResponse.status, statusBody);
      if (!statusBody || typeof statusBody !== "object") throw new Error("Chat返回了无效Workflow状态");
      const statusRecord = statusBody as { status?: unknown; review?: unknown };
      if (statusRecord.review !== undefined) {
        const review = parsePlanReview(statusRecord.review);
        if (!seenReviews.has(review.reviewId)) {
          deliverEvent({
            type: "review_required",
            stage: { workflowId: review.workflowId, stageId: "review", nodeKind: "task" },
            review,
          });
        }
      }
      if (statusRecord.status === "completed") {
        await streamPromise;
        if (streamError !== undefined) console.error("Chat Workflow过程事件流中断：", streamError);
        return parseChatWorkflowPromptResult(statusBody);
      }
      if (statusRecord.status === "failed" || statusRecord.status === "cancelled") {
        throw new Error(`Workflow ${statusRecord.status}`);
      }
      await waitForNextPoll(signal);
    }
  } finally {
    streamController.abort();
    signal?.removeEventListener("abort", abortStream);
  }
}

/** Starts a Workflow Run, then follows it without coupling UI detachment to cancellation. */
export async function runChatWorkflowPrompt(
  input: ChatWorkflowPromptInput,
  signal?: AbortSignal,
  onEvent?: (event: ChatRunEvent) => void,
  onAccepted?: (reference: ChatWorkflowAcceptedRunReference) => void,
): Promise<ChatWorkflowPromptResult> {
  const startResponse = await fetch("/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  const startBody: unknown = await startResponse.json().catch(() => null);
  if (!startResponse.ok) throw responseError(startResponse.status, startBody);
  const accepted = parseChatWorkflowRunAccepted(startBody);
  const reference = {
    ...accepted,
    projectId: input.projectId,
  };
  onAccepted?.(reference);
  return followChatWorkflowRun(reference, signal, onEvent);
}

/** Reattaches to a durable Run after navigation or page refresh. */
export function resumeChatWorkflowRun(
  reference: ChatWorkflowRunReference,
  signal?: AbortSignal,
  onEvent?: (event: ChatRunEvent) => void,
): Promise<ChatWorkflowPromptResult> {
  return followChatWorkflowRun(reference, signal, onEvent, -1);
}

export async function cancelChatWorkflowRun(reference: ChatWorkflowRunReference): Promise<void> {
  const query = new URLSearchParams({
    projectId: reference.projectId,
    workflowInvocationId: reference.workflowInvocationId,
  });
  const response = await fetch(`/runs/${encodeURIComponent(reference.runId)}?${query.toString()}`, {
    method: "DELETE",
    keepalive: true,
  });
  if (!response.ok) throw responseError(response.status, await response.json().catch(() => null));
}

export async function submitPlanReviewDecision(
  reference: ChatWorkflowRunReference,
  review: PlanReview,
  decision: PlanReviewDecisionInput,
): Promise<void> {
  const response = await fetch(`/runs/${encodeURIComponent(reference.runId)}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: reference.projectId,
      decision: {
        ...decision,
        reviewId: review.reviewId,
        workflowInvocationId: review.workflowInvocationId,
        planRevision: review.planRevision,
        planSha256: review.planSha256,
      },
    }),
  });
  if (!response.ok) throw responseError(response.status, await response.json().catch(() => null));
}
