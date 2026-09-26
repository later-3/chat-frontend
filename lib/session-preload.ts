/**
 * Navigation hand-off: ONE read result shared by every consumer of the SAME navigation.
 *
 * Opening a session can be triggered from more than one place (the default landing, a Friend click, a
 * deep-link restore) and each trigger loads the chat, so a "single use" hand-off still let a second
 * consumer download the whole session again. This keeps the navigation's response available to any loader
 * of THAT session until the navigation identity changes or the burst ends.
 *
 * Scope: one entry, keyed by the session id (globally unique) and valid for a short burst only.
 * Invalidation: a different session replaces it, and it expires. The chat still validates the body it
 * consumes and runs its own live sync, so nothing is served from here beyond the navigation itself.
 */
interface PreloadedProjectSession {
  readonly projectId: string;
  readonly sessionId: string;
  readonly body: unknown;
  readonly stashedAt: number;
}

/** A navigation payload only serves the burst of loads that opening this session starts. */
const PRELOAD_TTL_MS = 3_000;

let pending: PreloadedProjectSession | null = null;

export function stashProjectSessionPayload(projectId: string, sessionId: string, body: unknown, now = Date.now()): void {
  // A different session means a different navigation: the previous payload can never serve it.
  pending = { projectId, sessionId, body, stashedAt: now };
}

export function takeProjectSessionPayload(sessionId: string, now = Date.now()): unknown | undefined {
  if (pending === null || pending.sessionId !== sessionId) return undefined;
  if (now - pending.stashedAt > PRELOAD_TTL_MS) {
    pending = null;
    return undefined;
  }
  return pending.body;
}

export function clearProjectSessionPayload(): void {
  pending = null;
}
