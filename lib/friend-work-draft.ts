/** Only an unacknowledged submission is stored here; execution facts always come from Backend. */
export interface FriendWorkSubmission {
  requestId: string; originSessionId: string; contextProjectId: string | null; title: string; text: string;
}
const key = (agent: string) => `chat:friend-work-submission:v1:${agent}`;
export function readFriendWorkSubmission(agent: string): FriendWorkSubmission | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key(agent)) ?? "null");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    if (!["requestId", "originSessionId", "title", "text"].every(k => typeof v[k] === "string")
      || !(v.contextProjectId === null || typeof v.contextProjectId === "string")) return null;
    return v as unknown as FriendWorkSubmission;
  } catch { return null; }
}
export function saveFriendWorkSubmission(agent: string, value: FriendWorkSubmission | null): void {
  try {
    if (value) sessionStorage.setItem(key(agent), JSON.stringify(value));
    else sessionStorage.removeItem(key(agent));
  } catch { /* Keep the form in memory if browser storage is unavailable. */ }
}
