import { consumeExecutionStream } from "./execution-stream.ts";
import {
  parseChatWorkflowRunAccepted,
  parseChatWorkflowPromptResult,
  type ChatWorkflowPromptInput,
  type ChatWorkflowPromptResult,
} from "./chat-workflow-contract.ts";
import {
  parseChatRunEvent,
  parsePlanReview,
  type ChatRunEvent,
  type PlanReview,
} from "./chat-workflow-events.ts";

const WORKFLOW_POLL_INTERVAL_MS = 300;
export type WorkflowConnectionUpdate =
  | { kind: "confirmed"; at: number }
  | { kind: "stream_lost"; at: number };
export class WorkflowTerminalError extends Error {
  readonly status: "failed" | "cancelled";
  constructor(status: "failed" | "cancelled", message: string) { super(message); this.status = status; }
}

/** Timeout limits a network request, never the duration of a model/tool execution. */
export function workflowRequestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(10_000);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

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
    const timer = globalThis.setTimeout(finish, WORKFLOW_POLL_INTERVAL_MS);
    const abort = () => {
      globalThis.clearTimeout(timer);
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
  await consumeExecutionStream(response, signal, value => onEvent(parseChatRunEvent(value)));
}

async function followChatWorkflowRun(
  reference: ChatWorkflowRunReference,
  signal?: AbortSignal,
  onEvent?: (event: ChatRunEvent) => void,
  startIndex?: number,
  onConnection?: (update: WorkflowConnectionUpdate) => void,
): Promise<ChatWorkflowPromptResult> {
  const streamController = new AbortController();
  const abortStream = () => streamController.abort();
  signal?.addEventListener("abort", abortStream, { once: true });
  let following = true;
  const seenReviews = new Set<string>();
  const deliverEvent = (event: ChatRunEvent) => {
    if (!following) return;
    if (event.type === "review_required") seenReviews.add(event.review.reviewId);
    onEvent?.(event);
  };

  const streamPromise = onEvent === undefined
    ? Promise.resolve()
    : consumeRunEvents(reference.runId, deliverEvent, streamController.signal, startIndex)
        .catch((error: unknown) => {
          if (following && !streamController.signal.aborted) onConnection?.({ kind: "stream_lost", at: Date.now() });
          void error;
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
        { cache: "no-store", signal: workflowRequestSignal(signal) },
      );
      const statusBody: unknown = await statusResponse.json().catch(() => null);
      if (!statusResponse.ok) throw responseError(statusResponse.status, statusBody);
      if (!statusBody || typeof statusBody !== "object") throw new Error("Chat返回了无效Workflow状态");
      const statusRecord = statusBody as { status?: unknown; review?: unknown; error?: unknown };
      if (!["pending", "running", "completed", "failed", "cancelled"].includes(String(statusRecord.status))) {
        throw new Error("Chat返回了无效Workflow状态");
      }
      onConnection?.({ kind: "confirmed", at: Date.now() });
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
        // Drain already arriving chunks briefly, but terminal Runtime status wins
        // over a stream that never closes. The caller reloads the durable Session.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([streamPromise, new Promise<void>((resolve) => { timer = setTimeout(resolve, 200); })]);
        if (timer !== undefined) clearTimeout(timer);
        return parseChatWorkflowPromptResult(statusBody);
      }
      if (statusRecord.status === "failed" || statusRecord.status === "cancelled") {
        // The backend exposes the original step failure (e.g. the selected
        // model rejects image input) so the composer can surface it verbatim.
        const failure = statusRecord.error;
        throw new WorkflowTerminalError(statusRecord.status,
          typeof failure === "string" && failure.trim() !== ""
            ? failure
            : `Workflow ${statusRecord.status}`,
        );
      }
      await waitForNextPoll(signal);
    }
  } finally {
    following = false;
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
  onConnection?: (update: WorkflowConnectionUpdate) => void,
): Promise<ChatWorkflowPromptResult> {
  const startResponse = await fetch("/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: workflowRequestSignal(signal),
  });
  const startBody: unknown = await startResponse.json().catch(() => null);
  if (!startResponse.ok) throw responseError(startResponse.status, startBody);
  const accepted = parseChatWorkflowRunAccepted(startBody);
  const reference = {
    ...accepted,
    projectId: input.projectId,
  };
  onAccepted?.(reference);
  return followChatWorkflowRun(reference, signal, onEvent, undefined, onConnection);
}

/** Reattaches to a durable Run after navigation or page refresh. */
export function resumeChatWorkflowRun(
  reference: ChatWorkflowRunReference,
  signal?: AbortSignal,
  onEvent?: (event: ChatRunEvent) => void,
  onConnection?: (update: WorkflowConnectionUpdate) => void,
): Promise<ChatWorkflowPromptResult> {
  return followChatWorkflowRun(reference, signal, onEvent, -1, onConnection);
}

export async function cancelChatWorkflowRun(reference: ChatWorkflowRunReference): Promise<void> {
  const query = new URLSearchParams({
    projectId: reference.projectId,
    workflowInvocationId: reference.workflowInvocationId,
  });
  const response = await fetch(`/runs/${encodeURIComponent(reference.runId)}?${query.toString()}`, {
    method: "DELETE",
    keepalive: true,
    signal: workflowRequestSignal(),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw responseError(response.status, body);
  if (!body || typeof body !== "object" || !("status" in body) || body.status !== "cancelled") {
    throw new Error("未收到任务停止确认，请重试");
  }
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
