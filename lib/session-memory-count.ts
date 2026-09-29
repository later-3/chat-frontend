import type { SessionMemoryEntry } from "./topics-browser";

/**
 * Badge count for one session's memory: active entries only, because a superseded
 * entry is history rather than current context.
 */
export function countActiveSessionMemory(entries: readonly SessionMemoryEntry[]): number {
  return entries.filter((entry) => entry.status === "active").length;
}

/**
 * Refresh key for the badge. The badge must not depend on the memory dialog being
 * open: it has to change as soon as a turn can have written memory, which is when
 * the message list grows or a round reaches its terminal phase.
 */
export function sessionMemoryCountKey(input: { messageCount: number; phase: string | null }): string {
  return `${input.messageCount}:${input.phase ?? "idle"}`;
}
