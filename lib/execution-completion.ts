import { parseFriendExecution, type FriendExecution } from "./friend-execution.ts";
import { parseWorkflowOutcome } from "./workflow-outcome.ts";
import { fetchSessionView } from "./session-view-cache.ts";

export interface ExecutionSettlement {
  projectId: string;
  sessionId: string;
  executionId: string;
  status: "completed" | "failed" | "cancelled" | "interrupted";
}

export function friendSettlement(reference: FriendExecution, status: ExecutionSettlement["status"]): ExecutionSettlement {
  return { projectId: reference.projectId, sessionId: reference.sessionId,
    executionId: reference.workflow?.runId ? `run:${reference.workflow.runId}` : `turn:${reference.id}`, status };
}

/** Active observation and background revalidation share this delivery claim. No execution state is stored here. */
export function claimExecutionCompletion(event: ExecutionSettlement, delivered: Set<string>): boolean {
  if (event.status !== "completed") return false;
  const key = JSON.stringify([event.projectId, event.sessionId, event.executionId]);
  if (delivered.has(key)) return false;
  delivered.add(key);
  if (delivered.size > 256) delivered.delete(delivered.values().next().value!);
  return true;
}

/** Disappearing from a running roster is only a reason to read, never proof of success. */
export function parseSessionSettlement(body: unknown, projectId: string, sessionId: string): ExecutionSettlement | undefined {
  if (!body || typeof body !== "object" || !("session" in body)
    || !body.session || typeof body.session !== "object" || !("id" in body.session)
    || body.session.id !== sessionId || !("projectId" in body.session) || body.session.projectId !== projectId) {
    throw new Error("Chat returned a mismatched execution Session");
  }
  if (("activeWorkflowRun" in body && body.activeWorkflowRun !== undefined)
    || ("activePlanningExecution" in body && body.activePlanningExecution !== undefined)) return undefined;
  if ("friendExecution" in body && body.friendExecution !== undefined) {
    const execution = parseFriendExecution(body.friendExecution);
    if (execution.projectId !== projectId || execution.sessionId !== sessionId) throw new Error("Chat returned a mismatched Friend execution");
    if (execution.status === "queued" || execution.status === "running") return undefined;
    return friendSettlement(execution, execution.status);
  }
  const outcome = parseWorkflowOutcome("workflowOutcome" in body ? body.workflowOutcome : undefined);
  return outcome ? { projectId, sessionId, executionId: `run:${outcome.runId}`, status: outcome.status } : undefined;
}

export async function readSessionSettlement(projectId: string, sessionId: string): Promise<ExecutionSettlement | undefined> {
  return parseSessionSettlement(await fetchSessionView(projectId, sessionId), projectId, sessionId);
}
