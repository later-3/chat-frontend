/** Only an unacknowledged creation intent. Session identity/ownership always come from Backend. */
const pending = new Map<string, string>();
const key = (agentId: string, date: string) => `chat:friend-session-creation:v1:${agentId}:${date}`;
export function friendSessionCreationRequest(agentId: string, date: string): string {
  const storageKey = key(agentId, date);
  let requestId = pending.get(storageKey);
  if (requestId === undefined) {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (typeof saved === "object" && saved !== null && "requestId" in saved && typeof saved.requestId === "string"
        && /^[a-f0-9-]{36}$/.test(saved.requestId)) requestId = saved.requestId;
    } catch { /* Use the in-memory intent when browser storage is unavailable. */ }
  }
  requestId ??= crypto.randomUUID();
  pending.set(storageKey, requestId);
  try { sessionStorage.setItem(storageKey, JSON.stringify({ requestId })); } catch { /* The current tab still retains the intent. */ }
  return requestId;
}
export function acknowledgeFriendSessionCreation(agentId: string, date: string): void {
  const storageKey = key(agentId, date);
  pending.delete(storageKey);
  try { sessionStorage.removeItem(storageKey); } catch { /* Browser storage is optional. */ }
}
