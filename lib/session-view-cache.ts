/** Disposable first-screen views. Backend remains authoritative on every navigation. */
interface View { readonly body: unknown; readonly bytes: number; readonly at: number }
const views = new Map<string, View>();
const requests = new Map<string, Promise<unknown>>();
const keyOf = (projectId: string, sessionId: string) => `${projectId}\u0000${sessionId}`;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_VIEWS = 16;
let totalBytes = 0;

export function discardSessionView(projectId: string, sessionId: string): void {
  const key = keyOf(projectId, sessionId);
  const old = views.get(key);
  if (old) totalBytes -= old.bytes;
  views.delete(key);
}
export function rememberSessionView(projectId: string, sessionId: string, body: unknown): void {
  discardSessionView(projectId, sessionId);
  const bytes = JSON.stringify(body).length * 2;
  if (bytes > MAX_BYTES) return;
  views.set(keyOf(projectId, sessionId), { body, bytes, at: Date.now() });
  totalBytes += bytes;
  while (totalBytes > MAX_BYTES || views.size > MAX_VIEWS) {
    const key = views.keys().next().value!;
    totalBytes -= views.get(key)!.bytes;
    views.delete(key);
  }
}
export function peekSessionView(projectId: string, sessionId: string): unknown | undefined {
  const key = keyOf(projectId, sessionId);
  const view = views.get(key);
  if (view === undefined) return undefined;
  if (Date.now() - view.at > 5 * 60_000) { discardSessionView(projectId, sessionId); return undefined; }
  views.delete(key); views.set(key, view);
  return view.body;
}

/** All readers of this navigation share one in-flight GET. Cancellation only detaches that reader. */
export async function fetchSessionView(projectId: string, sessionId: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const key = keyOf(projectId, sessionId);
  let pending = requests.get(key);
  if (pending === undefined) {
    pending = (async () => {
      const query = new URLSearchParams({ projectId, view: "chat", deferThinking: "1", deferMedia: "1" });
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?${query}`, { cache: "no-store",
        credentials: "same-origin", signal: AbortSignal.timeout(15_000) });
      const body: unknown = await response.json().catch(() => null);
      const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : undefined;
      if (!response.ok) {
        discardSessionView(projectId, sessionId);
        throw new Error(typeof record?.statusMessage === "string" ? record.statusMessage : `读取Session失败: HTTP ${response.status}`);
      }
      const session = typeof record?.session === "object" && record.session !== null
        ? record.session as Record<string, unknown> : undefined;
      if (session?.id !== sessionId || (session.projectId !== undefined && session.projectId !== projectId)) {
        discardSessionView(projectId, sessionId);
        throw new Error(`Chat返回了不匹配的Session: ${sessionId}`);
      }
      rememberSessionView(projectId, sessionId, body);
      return body;
    })();
    requests.set(key, pending);
    // The observer cleanup must not create an unhandled rejected promise.
    void pending.finally(() => { if (requests.get(key) === pending) requests.delete(key); }).catch(() => {});
  }
  if (signal === undefined) return pending;
  return new Promise((resolve, reject) => {
    const abort = () => { reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    pending.then(value => { if (!signal.aborted) resolve(value); }, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
