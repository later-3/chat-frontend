export interface FriendDayArchive {
  schemaVersion: 1; longAgentId: string; date: string; timeZone: string;
  sessions: { sessionId: string; projectId: string; kind: string; title: string; readable: boolean }[];
  works: { workId: string; sessionId: string | null; title: string; contextProjectId: string | null; status: string; error: string | null; createdAt: string }[];
  occurrences: { occurrenceId: string; taskId: string; revision: number; title: string; kind: string; dutyId: string | null; scheduledAt: string; state: string; reason: string | null; workId: string | null; summaryDate: string | null; contextProjectId: string | null }[];
  summary: { date: string; markdown: string; updatedAt: string; revision: string | null; fileName: string } | null;
}
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid daily archive");
}
function strings(value: Record<string, unknown>, fields: string[]) {
  if (fields.some(field => typeof value[field] !== "string")) throw new Error("Invalid archive field");
}
function nullable(value: Record<string, unknown>, fields: string[]) {
  if (fields.some(field => value[field] !== null && typeof value[field] !== "string")) throw new Error("Invalid archive field");
}
export function parseFriendDayArchive(value: unknown, id: string, date: string): FriendDayArchive {
  object(value);
  if (value.schemaVersion !== 1 || value.longAgentId !== id || value.date !== date || !Array.isArray(value.sessions)
    || !Array.isArray(value.works) || !Array.isArray(value.occurrences)) throw new Error("Daily archive identity mismatch");
  strings(value, ["timeZone"]);
  new Intl.DateTimeFormat("en", { timeZone: String(value.timeZone) });
  for (const session of value.sessions) {
    object(session); strings(session, ["sessionId", "projectId", "kind", "title"]);
    if (typeof session.readable !== "boolean") throw new Error("Invalid archive session");
  }
  for (const work of value.works) {
    object(work); strings(work, ["workId", "title", "status", "createdAt"]); nullable(work, ["contextProjectId", "error", "sessionId"]);
    if (!Number.isFinite(Date.parse(String(work.createdAt))) || !["queued", "running", "completed", "failed", "interrupted", "cancelled"].includes(String(work.status))) throw new Error("Invalid archive work");
  }
  for (const item of value.occurrences) {
    object(item); strings(item, ["occurrenceId", "taskId", "title", "kind", "scheduledAt", "state"]);
    nullable(item, ["dutyId", "reason", "workId", "summaryDate", "contextProjectId"]);
    if (!Number.isSafeInteger(item.revision) || Number(item.revision) < 1 || !["accepted", "started", "skipped", "blocked"].includes(String(item.state))
      || !Number.isFinite(Date.parse(String(item.scheduledAt)))) throw new Error("Invalid archive occurrence");
  }
  if (value.summary !== null) {
    object(value.summary); strings(value.summary, ["date", "markdown", "updatedAt", "fileName"]); nullable(value.summary, ["revision"]);
    if (value.summary.date !== date || value.summary.fileName !== "summary.md" || !Number.isFinite(Date.parse(String(value.summary.updatedAt)))) throw new Error("Invalid archive summary");
  }
  return value as unknown as FriendDayArchive;
}
export async function fetchFriendDayArchive(id: string, date: string, signal?: AbortSignal): Promise<FriendDayArchive> {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(id)}/daily?date=${encodeURIComponent(date)}`, { signal });
  const value: unknown = await response.json();
  if (!response.ok) { object(value); throw new Error(typeof value.statusMessage === "string" ? value.statusMessage : `HTTP ${response.status}`); }
  return parseFriendDayArchive(value, id, date);
}
