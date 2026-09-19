/** Browser projection only; Backend owns the calendar, queue and recovery. */
export interface FriendDailyState {
  schemaVersion: 1;
  longAgentId: string;
  timeZone: string;
  today: string;
  days: { date: string; sessionId: string; timeZone: string; summary: {
    status: "pending" | "running" | "completed" | "failed"; attempts: number;
    error: string | null; nextAttemptAt: string | null;
  } }[];
  requests: { turnId: string; requestId: string; sessionId: string; date: string; acceptedAt: string;
    sequence: number; source: "chat-web" | "channel" | "scheduled"; contextProjectId: string | null;
    status: "queued" | "running" | "completed" | "failed" | "interrupted" | "cancelled"; error: string | null }[];
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function nullable(value: unknown): boolean { return value === null || text(value); }
function date(value: unknown): boolean { return text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)); }
export function parseFriendDailyState(value: unknown): FriendDailyState {
  if (!record(value) || value.schemaVersion !== 1 || !text(value.longAgentId) || !text(value.timeZone) || !date(value.today)
    || !Array.isArray(value.days) || !Array.isArray(value.requests)) throw new Error("Invalid Friend calendar response");
  for (const day of value.days) {
    if (!record(day) || !date(day.date) || !text(day.sessionId) || !text(day.timeZone) || !record(day.summary)
      || !["pending", "running", "completed", "failed"].includes(String(day.summary.status))
      || !Number.isSafeInteger(day.summary.attempts) || Number(day.summary.attempts) < 0
      || !nullable(day.summary.error) || !nullable(day.summary.nextAttemptAt)
      || (day.summary.nextAttemptAt !== null && !Number.isFinite(Date.parse(String(day.summary.nextAttemptAt))))) throw new Error("Invalid Friend summary response");
  }
  for (const request of value.requests) {
    if (!record(request) || !text(request.turnId) || !text(request.requestId) || !text(request.sessionId) || !date(request.date)
      || !text(request.acceptedAt) || !Number.isFinite(Date.parse(request.acceptedAt))
      || !Number.isSafeInteger(request.sequence) || Number(request.sequence) < 1
      || !["chat-web", "channel", "scheduled"].includes(String(request.source)) || !nullable(request.contextProjectId) || !nullable(request.error)
      || !["queued", "running", "completed", "failed", "interrupted", "cancelled"].includes(String(request.status))) throw new Error("Invalid Friend request response");
  }
  return value as unknown as FriendDailyState;
}
export type FriendDailyAction = { action: "retry-summary"; date: string } | { action: "cancel-request" | "retry-request"; turnId: string };
export async function fetchFriendDailyState(longAgentId: string, signal?: AbortSignal, action?: FriendDailyAction): Promise<FriendDailyState> {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(longAgentId)}/daily`, {
    ...(action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) } : {}), signal,
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(record(body) && text(body.statusMessage) ? body.statusMessage : `HTTP ${response.status}`);
  const parsed = parseFriendDailyState(body);
  if (parsed.longAgentId !== longAgentId) throw new Error("Friend response identity mismatch");
  return parsed;
}
