/** An unsent coworker message belongs to both its conversation and chosen context. */
export function composerDraftKey(sessionId: string | undefined, isLongAgent: boolean, contextProjectId: string | null | undefined, newSessionDraftKey?: string | null, deviceId?: string, projectId?: string): string | undefined {
  if (!sessionId) return newSessionDraftKey ?? undefined;
  const key = isLongAgent ? `coworker:${sessionId}:context:${contextProjectId ?? "none"}` : sessionId;
  return deviceId ? JSON.stringify([deviceId, projectId ?? null, key]) : key;
}
