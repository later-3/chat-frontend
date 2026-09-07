import type { SessionInfo } from "./types.ts";

export type SessionSidebarPanel = "sessions" | "long-agents";

/** Returns the durable execution route without consulting Agent availability or message content. */
export function sessionLongAgentId(session: SessionInfo | null): string | null {
  return session?.owner.type === "long-agent" ? session.owner.longAgentId : null;
}

export function sessionSidebarPanel(session: SessionInfo | null): SessionSidebarPanel {
  return session?.owner.type === "long-agent" ? "long-agents" : "sessions";
}

export function ordinarySessions(sessions: readonly SessionInfo[]): SessionInfo[] {
  return sessions.filter((session) => session.owner.type === "ordinary");
}
