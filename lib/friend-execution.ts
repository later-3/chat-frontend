import { parseAgentEvent, type ChatRunEvent } from "./chat-workflow-events.ts";
import { consumeExecutionStream } from "./execution-stream.ts";
import {
  workflowRequestSignal,
  WorkflowTerminalError,
  type WorkflowConnectionUpdate,
} from "./chat-workflow-browser.ts";
import type { AgentMessage } from "./types";

export interface FriendExecution {
  schemaVersion: 1;
  kind: "friend";
  id: string;
  longAgentId: string;
  projectId: string;
  sessionId: string;
  contextProjectId: string | null;
  workId?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
  error: string | null;
  acceptedAt: string;
  capabilities: { cancel: boolean; steer: boolean; followUp: boolean; images: boolean };
}
export interface FriendSnapshot {
  roundPhase?: "work" | "remember";
  seq: number;
  messages: AgentMessage[];
  partial: AgentMessage | null;
  phase: ReturnType<typeof parseAgentEvent>;
}
export class FriendContractError extends Error {}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
export function parseFriendExecution(v: unknown): FriendExecution {
  if (
    !record(v) ||
    v.schemaVersion !== 1 ||
    v.kind !== "friend" ||
    (v.workId !== undefined && (typeof v.workId !== "string" || !/^work-[a-f0-9]{32}$/.test(v.workId))) ||
    ![v.id, v.longAgentId, v.projectId, v.sessionId].every((x) => typeof x === "string" && x.length > 0) ||
    !(v.contextProjectId === null || typeof v.contextProjectId === "string") ||
    !["queued", "running", "completed", "failed", "cancelled", "interrupted"].includes(String(v.status)) ||
    !(v.error === null || typeof v.error === "string") ||
    typeof v.acceptedAt !== "string" ||
    !Number.isFinite(Date.parse(v.acceptedAt)) ||
    !record(v.capabilities) ||
    !["cancel", "steer", "followUp", "images"].every(
      (k) => typeof (v.capabilities as Record<string, unknown>)[k] === "boolean",
    )
  )
    throw new FriendContractError("无效Friend执行状态");
  return v as unknown as FriendExecution;
}
function parseFriendAgentEvent(value: unknown) {
  try { return parseAgentEvent(value); }
  catch (error) { throw new FriendContractError(error instanceof Error ? error.message : "无效Pi事件"); }
}
function parseRoundPhase(value: unknown): "work" | "remember" | undefined {
  if (value === undefined || value === "work" || value === "remember") return value;
  throw new FriendContractError("无效节点轮次阶段");
}
function parseSnapshot(v: unknown): FriendSnapshot {
  if (!record(v) || !Number.isSafeInteger(v.seq) || Number(v.seq) < 0 || !Array.isArray(v.messages))
    throw new FriendContractError("无效会话快照");
  for (const message of v.messages) parseFriendAgentEvent({ type: "message_end", message });
  if (v.partial !== null) parseFriendAgentEvent({ type: "message_start", message: v.partial });
  return {
    roundPhase: parseRoundPhase(v.roundPhase),
    seq: Number(v.seq),
    messages: v.messages as AgentMessage[],
    partial: v.partial as AgentMessage | null,
    phase: parseFriendAgentEvent(v.phase),
  };
}
const base = (ref: Pick<FriendExecution, "longAgentId" | "id">) =>
  `/api/long-agents/${encodeURIComponent(ref.longAgentId)}/turns/${encodeURIComponent(ref.id)}`;
async function json(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const value: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      record(value) && typeof value.statusMessage === "string" ? value.statusMessage : `HTTP ${response.status}`,
    );
  return value;
}
export async function acceptFriendMessage(
  longAgentId: string,
  input: {
    requestId: string;
    sessionId?: string;
    contextProjectId?: string | null;
    /** Association revision the client last read; the Backend freezes the project from it. */
    interactionRevision?: number;
    text: string;
    sessionMemory?: "on" | "off";
    images?: { type: "image"; data: string; mimeType: string }[];
  },
  signal?: AbortSignal,
) {
  return parseFriendExecution(
    await json(`/api/long-agents/${encodeURIComponent(longAgentId)}/turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, ...input }),
      signal: workflowRequestSignal(signal),
    }),
  );
}
export async function cancelFriendExecution(ref: FriendExecution) {
  return parseFriendExecution(await json(base(ref), { method: "DELETE", signal: workflowRequestSignal() }));
}
/** Both entry points deliver the same Agent event to the chat reducer; Friend adds only its lifecycle adapter. */
export async function followFriendExecution(
  ref: FriendExecution,
  signal: AbortSignal,
  callbacks: {
    event: (event: ChatRunEvent) => void;
    roundPhase?: (phase: "work" | "remember" | undefined) => void;
    snapshot: (snapshot: FriendSnapshot) => void;
    status: (status: FriendExecution) => void;
    connection: (status: WorkflowConnectionUpdate) => void;
  },
) {
  let seq = 0;
  for (;;) {
    signal.throwIfAborted();
    try {
      const value = await json(base(ref), { signal: workflowRequestSignal(signal) });
      if (!record(value)) throw new FriendContractError("无效执行快照");
      let current = parseFriendExecution(value.execution);
      if (
        current.id !== ref.id ||
        current.sessionId !== ref.sessionId ||
        current.longAgentId !== ref.longAgentId ||
        current.projectId !== ref.projectId
      )
        throw new FriendContractError("执行快照归属不一致");
      const snapshot = parseSnapshot(value.snapshot);
      seq = snapshot.seq;
      callbacks.snapshot(snapshot);
      callbacks.roundPhase?.(snapshot.roundPhase);
      callbacks.status(current);
      const check = (execution: unknown) => {
        const next = parseFriendExecution(execution);
        if (
          next.id !== ref.id ||
          next.sessionId !== ref.sessionId ||
          next.longAgentId !== ref.longAgentId ||
          next.projectId !== ref.projectId
        )
          throw new FriendContractError("执行事件归属不一致");
        if (JSON.stringify(current) !== JSON.stringify(next)) callbacks.status(next);
        current = next;
        callbacks.connection({ kind: "confirmed", at: Date.now() });
      };
      if (["queued", "running"].includes(current.status)) {
        const stream = await fetch(`${base(ref)}/events?after=${seq}`, { cache: "no-store", signal });
        await consumeExecutionStream(
          stream,
          signal,
          (item) => {
            if (!record(item)) throw new FriendContractError("无效过程事件");
            if (item.type === "status") {
              check(item.execution);
              return;
            }
            if (item.type === "reset") {
              check(item.execution);
              const reset = parseSnapshot(item.snapshot);
              seq = reset.seq;
              callbacks.snapshot(reset);
              callbacks.roundPhase?.(reset.roundPhase);
              return;
            }
            if (
              item.type !== "agent_event" ||
              item.schemaVersion !== 1 ||
              !record(item.execution) ||
              item.execution.id !== ref.id ||
              item.execution.sessionId !== ref.sessionId ||
              item.execution.projectId !== ref.projectId ||
              item.execution.kind !== "friend" ||
              !Number.isSafeInteger(item.seq) ||
              typeof item.at !== "string" ||
              !Number.isFinite(Date.parse(item.at))
            )
              throw new FriendContractError("无效Agent事件信封");
            const next = Number(item.seq);
            if (next <= seq) return;
            callbacks.roundPhase?.(parseRoundPhase(item.roundPhase));
            if (next !== seq + 1) throw new Error("事件不连续，需要重新同步");
            seq = next;
            callbacks.event({ type: "agent_event", event: parseFriendAgentEvent(item.event) });
          },
          15_000,
        );
      }
      if (current.status === "completed") return current;
      if (["failed", "cancelled", "interrupted"].includes(current.status))
        throw new WorkflowTerminalError(
          current.status === "cancelled" ? "cancelled" : "failed",
          current.error ?? `Friend ${current.status}`,
        );
      throw new Error("实时连接提前关闭");
    } catch (error) {
      if (signal.aborted || error instanceof WorkflowTerminalError || error instanceof FriendContractError) throw error;
      callbacks.connection({ kind: "stream_lost", at: Date.now() });
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, 1000);
        signal.addEventListener("abort", abort, { once: true });
      });
    }
  }
}

export async function steerFriendExecution(
  ref: FriendExecution,
  input: { requestId: string; text: string; contextProjectId: string | null },
) {
  const value = await json(`${base(ref)}/steer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: workflowRequestSignal(),
  });
  if (!record(value) || !["steer", "followUp"].includes(String(value.delivery)))
    throw new FriendContractError("无效引导接受响应");
  return { execution: parseFriendExecution(value.execution), delivery: value.delivery as "steer" | "followUp" };
}

export async function readFriendCapabilities(id: string, signal: AbortSignal) {
  const value = await json(`/api/long-agents/${encodeURIComponent(id)}/capabilities`, {
    signal: workflowRequestSignal(signal),
  });
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.longAgentId !== id ||
    typeof value.images !== "boolean" ||
    typeof value.manualCompaction !== "boolean" ||
    typeof value.followUp !== "boolean"
  )
    throw new FriendContractError("无效Friend能力响应");
  return { images: value.images, manualCompaction: value.manualCompaction, followUp: value.followUp };
}
