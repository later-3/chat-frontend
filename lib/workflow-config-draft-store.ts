import {
  parseAgentConfigSelection,
  type AgentConfigSelection,
} from "./chat-workflow-contract.ts";

const PREFIX = "chat.workflow-config-draft.v1:";

export interface WorkflowConfigDraft {
  readonly configs: Record<string, Record<string, AgentConfigSelection>>;
  readonly dirtyWorkflowIds: readonly string[];
}

function selectionsEqual(
  left: Record<string, AgentConfigSelection> | undefined,
  right: Record<string, AgentConfigSelection>,
): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

/** Removes only the exact Workflow adjustment that the completed run submitted. */
export function removeSubmittedWorkflowConfig(
  draft: WorkflowConfigDraft | null,
  workflowId: string,
  submitted: Record<string, AgentConfigSelection>,
): WorkflowConfigDraft | null {
  if (draft === null || !draft.dirtyWorkflowIds.includes(workflowId)
    || !selectionsEqual(draft.configs[workflowId], submitted)) {
    return draft;
  }
  const dirtyWorkflowIds = draft.dirtyWorkflowIds.filter((id) => id !== workflowId);
  const configs = Object.fromEntries(
    Object.entries(draft.configs).filter(([id]) => id !== workflowId),
  );
  return { configs, dirtyWorkflowIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

function parseDraft(value: unknown): WorkflowConfigDraft | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.configs)
    || !Array.isArray(value.dirtyWorkflowIds)
    || value.dirtyWorkflowIds.some((item) => typeof item !== "string" || item.trim() === "")) {
    return null;
  }
  try {
    const configs: Record<string, Record<string, AgentConfigSelection>> = {};
    for (const [workflowId, rawAgents] of Object.entries(value.configs)) {
      if (workflowId.trim() === "" || !isRecord(rawAgents)) return null;
      const agents: Record<string, AgentConfigSelection> = {};
      for (const [agentId, selection] of Object.entries(rawAgents)) {
        if (agentId.trim() === "") return null;
        agents[agentId] = parseAgentConfigSelection(selection);
      }
      configs[workflowId] = agents;
    }
    return { configs, dirtyWorkflowIds: [...new Set(value.dirtyWorkflowIds as string[])] };
  } catch {
    return null;
  }
}

export function readWorkflowConfigDraft(key: string, storage: Storage = window.localStorage): WorkflowConfigDraft | null {
  const raw = storage.getItem(storageKey(key));
  if (raw === null) return null;
  try {
    return parseDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeWorkflowConfigDraft(
  key: string,
  draft: WorkflowConfigDraft,
  storage: Storage = window.localStorage,
): void {
  if (draft.dirtyWorkflowIds.length === 0) {
    storage.removeItem(storageKey(key));
    return;
  }
  storage.setItem(storageKey(key), JSON.stringify({ schemaVersion: 1, ...draft }));
}

export function removeWorkflowConfigDraft(key: string, storage: Storage = window.localStorage): void {
  storage.removeItem(storageKey(key));
}
