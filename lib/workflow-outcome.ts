export interface WorkflowOutcome {
  runId: string;
  status: "completed" | "failed" | "cancelled";
  error?: string;
}
export function parseWorkflowOutcome(value: unknown): WorkflowOutcome | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || !("runId" in value) || typeof value.runId !== "string" || !value.runId.trim()
    || !("status" in value) || (value.status !== "completed" && value.status !== "failed" && value.status !== "cancelled")
    || ("error" in value && typeof value.error !== "string")) throw new Error("Chat返回了无效任务结束状态");
  return { runId: value.runId, status: value.status, ...("error" in value ? { error: value.error as string } : {}) };
}
