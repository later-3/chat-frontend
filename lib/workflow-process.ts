import type { AgentMessage, ChatWorkflowMessageProvenance, ToolResultMessage } from "./types";

export interface WorkflowProcessNode {
  key: string;
  stage?: ChatWorkflowMessageProvenance;
  indices: number[];
  status: "completed" | "failed" | "cancelled" | "skipped" | "recorded";
  memoryWrites: number;
}

/** Group persisted messages by contiguous invocation/stage, retaining unlabelled legacy content. */
export function groupWorkflowProcess(messages: readonly AgentMessage[], start: number, end: number,
  results: ReadonlyMap<string, ToolResultMessage>): WorkflowProcessNode[] {
  const nodes: WorkflowProcessNode[] = [];
  for (let index = start; index < end; index++) {
    const message = messages[index];
    if (!message || message.role === "toolResult") continue; // owned by its tool-call card
    if (message.role === "custom" && message.customType === "chat.session_memory_notice") {
      const details = message.details;
      if (typeof details === "object" && details !== null && "invocationId" in details && typeof details.invocationId === "string"
        && "workflowId" in details && typeof details.workflowId === "string" && "status" in details
        && (details.status === "failed" || details.status === "cancelled" || details.status === "skipped")) {
        const stage = { invocationId: details.invocationId, workflowId: details.workflowId, stageId: "remember", agentId: "session-memory-writer" };
        const existing = nodes.find(node => node.stage?.invocationId === stage.invocationId && node.stage.agentId === stage.agentId);
        if (existing) { existing.status = details.status; existing.indices.push(index); }
        else nodes.push({ key: JSON.stringify(stage), stage, indices: [index], status: details.status, memoryWrites: 0 });
        continue;
      }
    }
    const stage = message.role === "assistant" ? message.chatWorkflow : undefined;
    const key = stage ? JSON.stringify([stage.invocationId, stage.workflowId, stage.stageId, stage.agentId]) : "legacy";
    let node = nodes.at(-1);
    if (!node || node.key !== key) {
      node = { key, ...(stage ? { stage } : {}), indices: [], status: "recorded", memoryWrites: 0 };
      nodes.push(node);
    }
    node.indices.push(index);
    if (message.role !== "assistant") continue;
    node.status = message.stopReason === "error" ? "failed" : message.stopReason === "aborted" ? "cancelled"
      : message.stopReason === "stop" || message.stopReason === "length" ? "completed" : "recorded";
    for (const block of message.content) {
      if (block.type !== "toolCall" || block.toolName !== "session_memory"
        || !["write", "supersede"].includes(String(block.input.operation))) continue;
      const result = results.get(block.toolCallId);
      const receipt = result?.details;
      if (result && !result.isError && typeof receipt === "object" && receipt !== null
        && "revision" in receipt && typeof receipt.revision === "number"
        && "entries" in receipt && Array.isArray(receipt.entries)) node.memoryWrites++;
    }
  }
  return nodes;
}
