import { parseFriendExecution, type FriendExecution } from "./friend-execution.ts";
import { workflowRequestSignal } from "./chat-workflow-browser.ts";

/**
 * A topic node target. Sending must go through the node's own authorized route (it freezes the node
 * binding and the topic round semantics); it must never fall back to the ordinary private-chat entry.
 */
export interface TopicNodeTarget {
  readonly longAgentId: string;
  readonly topicId: string;
  readonly nodeId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accepts ONE owner turn in a topic node. The Session and the topic/node target are resolved by the
 * Backend from the graph; the response is the same Long Agent execution the queue produces, so the shared
 * observer (`followFriendExecution`) drives streaming, tools, status and recovery unchanged.
 */
export async function acceptTopicNodeMessage(
  target: TopicNodeTarget,
  input: {
    requestId: string;
    text: string;
    images?: { type: "image"; data: string; mimeType: string }[];
  },
  signal?: AbortSignal,
): Promise<FriendExecution> {
  const url = `/api/long-agents/${encodeURIComponent(target.longAgentId)}/topics/${encodeURIComponent(target.topicId)}/nodes/${encodeURIComponent(target.nodeId)}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ schemaVersion: 1, ...input }),
    signal: workflowRequestSignal(signal),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(isRecord(value) && typeof value.statusMessage === "string" ? value.statusMessage : `HTTP ${response.status}`);
  }
  return parseFriendExecution(value);
}
