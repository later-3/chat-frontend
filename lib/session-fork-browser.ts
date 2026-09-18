export interface SessionForkResult {
  schemaVersion: 1;
  projectId: string;
  sessionId: string;
  parentSessionId: string;
  selectedText: string;
}

export function parseSessionForkResult(value: unknown, projectId: string, parentSessionId: string): SessionForkResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("无效Fork响应");
  const item = value as Record<string, unknown>;
  if (item.schemaVersion !== 1 || item.projectId !== projectId || item.parentSessionId !== parentSessionId
    || typeof item.sessionId !== "string" || !item.sessionId || item.sessionId === parentSessionId
    || typeof item.selectedText !== "string") throw new Error("Fork响应身份或内容无效");
  return { schemaVersion: 1, projectId, parentSessionId, sessionId: item.sessionId, selectedText: item.selectedText };
}

export async function forkSession(projectId: string, sessionId: string, entryId: string, requestId: string): Promise<SessionForkResult> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/fork`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, entryId, requestId }),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "statusMessage" in body && typeof body.statusMessage === "string"
      ? body.statusMessage : `Fork失败: HTTP ${response.status}`;
    throw new Error(message);
  }
  return parseSessionForkResult(body, projectId, sessionId);
}
