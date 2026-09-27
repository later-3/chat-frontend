import { parseAgentEvent } from "./chat-workflow-events.ts";
import type { AgentEventLike } from "./agent-event-wire";
import type { SessionStatsInfo } from "./pi-types";

export interface MaintenanceRequest {
  projectId: string; requestId: string; expectedLeafId: string | null;
  kind: "compact" | "continue"; entryId?: string; instructions?: string;
}
export interface MaintenanceOperation {
  schemaVersion: 1; sessionId: string; requestId: string; kind: "compact" | "continue";
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  error?: string; editorText?: string;
  result?: { tokensBefore: number; estimatedTokensAfter: number };
}
export interface SessionMaintenance {
  schemaVersion: 1; projectId: string; sessionId: string; leafId: string | null;
  capabilities: { compact: boolean; continue: boolean };
  stats: SessionStatsInfo; operation: MaintenanceOperation | null; event: AgentEventLike | null;
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function number(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
export function parseMaintenanceOperation(value: unknown, sessionId: string, requestId?: string): MaintenanceOperation {
  if (!object(value) || value.schemaVersion !== 1 || value.sessionId !== sessionId || typeof value.requestId !== "string"
    || (requestId !== undefined && value.requestId !== requestId) || !["compact", "continue"].includes(String(value.kind))
    || !["running", "completed", "failed", "cancelled", "interrupted"].includes(String(value.status))
    || (value.error !== undefined && typeof value.error !== "string") || (value.editorText !== undefined && typeof value.editorText !== "string")
    || (value.result !== undefined && (!object(value.result) || !number(value.result.tokensBefore) || !number(value.result.estimatedTokensAfter)))) {
    throw new Error("Invalid session operation response");
  }
  return value as unknown as MaintenanceOperation;
}
export function parseSessionMaintenance(value: unknown, projectId: string, sessionId: string): SessionMaintenance {
  if (!object(value) || value.schemaVersion !== 1 || value.projectId !== projectId || value.sessionId !== sessionId
    || (value.leafId !== null && typeof value.leafId !== "string") || !object(value.capabilities)
    || typeof value.capabilities.compact !== "boolean" || typeof value.capabilities.continue !== "boolean" || !object(value.stats)) throw new Error("Invalid session controls response");
  const stats = value.stats;
  if (stats.sessionId !== sessionId || !["userMessages", "assistantMessages", "toolCalls", "toolResults", "totalMessages", "cost"].every(key => number(stats[key]))
    || !object(stats.tokens) || !["input", "output", "cacheRead", "cacheWrite", "total"].every(key => number((stats.tokens as Record<string, unknown>)[key]))
    || (stats.sessionName !== undefined && typeof stats.sessionName !== "string")) throw new Error("Invalid native session statistics");
  if (stats.contextUsage !== undefined) {
    const context = stats.contextUsage;
    if (!object(context) || !number(context.contextWindow) || (context.tokens !== null && !number(context.tokens)) || (context.percent !== null && !number(context.percent))) throw new Error("Invalid context usage");
  }
  return { ...value, operation: value.operation === null ? null : parseMaintenanceOperation(value.operation, sessionId),
    event: value.event === null ? null : parseAgentEvent(value.event) } as unknown as SessionMaintenance;
}
export class MaintenanceHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
async function responseBody(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) throw new MaintenanceHttpError(object(value) && typeof value.statusMessage === "string" ? value.statusMessage : `HTTP ${response.status}`, response.status);
  return value;
}
export async function readMaintenance(projectId: string, sessionId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/maintenance?${new URLSearchParams({ projectId })}`, { cache: "no-store", signal });
  return parseSessionMaintenance(await responseBody(response), projectId, sessionId);
}
export async function startMaintenance(sessionId: string, input: MaintenanceRequest) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/maintenance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  return parseMaintenanceOperation(await responseBody(response), sessionId, input.requestId);
}
export async function cancelMaintenance(projectId: string, sessionId: string, requestId: string) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/maintenance?${new URLSearchParams({ projectId, requestId })}`, { method: "DELETE" });
  return parseSessionMaintenance(await responseBody(response), projectId, sessionId);
}
