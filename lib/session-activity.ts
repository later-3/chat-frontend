import type { AgentMessage, ChatSessionActivity } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate optional maintenance provenance at HTTP history boundaries. */
export function parseSessionActivity(value: unknown): ChatSessionActivity | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !["daily-summary", "daily-summary-draft"].includes(String(value.kind))
    || typeof value.triggerEntryId !== "string" || value.triggerEntryId.trim() === ""
    || Object.keys(value).some(key => !["kind", "triggerEntryId", "date"].includes(key))
    || (value.date !== undefined && (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)))) {
    throw new Error("Invalid Session activity provenance");
  }
  return { kind: value.kind as ChatSessionActivity["kind"], triggerEntryId: value.triggerEntryId,
    ...(value.date === undefined ? {} : { date: value.date as string }) };
}

export function parseSessionActivityMessages(messages: readonly unknown[]): AgentMessage[] {
  return messages.map(message => {
    if (!isRecord(message)) throw new Error("Invalid Session message");
    const activity = parseSessionActivity(message.chatSessionActivity);
    if (activity === undefined) return message as unknown as AgentMessage;
    if (message.role !== "assistant") throw new Error("Session activity must belong to an assistant result");
    return { ...message, chatSessionActivity: activity } as unknown as AgentMessage;
  });
}

export function isSessionActivity(message: AgentMessage): boolean {
  return message.role === "assistant" && message.chatSessionActivity !== undefined;
}

/** Malformed or extended output stays readable raw instead of losing unrecognized content. */
export function parseDailySummary(text: string): { did: string[]; reflections: string[]; handoff: string } | null {
  if (text.length > 20_000) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!isRecord(value) || Object.keys(value).some(key => !["did", "reflections", "handoff"].includes(key))
    || !Array.isArray(value.did) || !value.did.every(item => typeof item === "string")
    || !Array.isArray(value.reflections) || !value.reflections.every(item => typeof item === "string")
    || typeof value.handoff !== "string") return null;
  return { did: value.did as string[], reflections: value.reflections as string[], handoff: value.handoff };
}
