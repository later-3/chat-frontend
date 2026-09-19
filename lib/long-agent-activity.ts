export interface LongAgentActivity {
  schemaVersion: 1;
  status: "idle" | "running" | "completed" | "failed" | "interrupted" | "cancelled";
  turnId: string | null;
  startedAt: string | null;
  error: string | null;
}
export function parseLongAgentActivity(value: unknown): LongAgentActivity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid Long Agent activity");
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || typeof v.status !== "string" || !["idle", "running", "completed", "failed", "interrupted", "cancelled"].includes(v.status)
    || !(v.turnId === null || typeof v.turnId === "string" && v.turnId.length > 0)
    || !(v.startedAt === null || typeof v.startedAt === "string" && Number.isFinite(Date.parse(v.startedAt)))
    || !(v.error === null || typeof v.error === "string")) throw new Error("Invalid Long Agent activity");
  return v as unknown as LongAgentActivity;
}
