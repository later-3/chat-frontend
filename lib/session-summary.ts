import type { SessionInfo } from "./types";

/**
 * Session creation is durable before its first message is appended. A list
 * refresh in that short window therefore returns a valid, but older, summary.
 * Keep fields that can only move forward until the persisted snapshot catches
 * up, while still accepting the server as the source of truth for all other
 * metadata.
 */
export function mergeSessionSummary(current: SessionInfo, persisted: SessionInfo): SessionInfo {
  if (current.id !== persisted.id) return persisted;
  return {
    ...current,
    ...persisted,
    modified: current.modified > persisted.modified ? current.modified : persisted.modified,
    messageCount: Math.max(current.messageCount, persisted.messageCount),
    firstMessage: persisted.firstMessage.trim() === "" ? current.firstMessage : persisted.firstMessage,
  };
}

/** Makes a newly accepted Session visible without letting a lagging list read erase its summary. */
export function overlaySelectedSession(
  sessions: SessionInfo[],
  selectedSession: SessionInfo | null,
): SessionInfo[] {
  if (selectedSession === null) return sessions;
  const index = sessions.findIndex((session) => session.id === selectedSession.id);
  if (index < 0) return [selectedSession, ...sessions];
  return sessions.map((session, candidateIndex) => (
    candidateIndex === index ? mergeSessionSummary(selectedSession, session) : session
  ));
}
