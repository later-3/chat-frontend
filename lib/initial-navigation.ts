export interface InitialNavigation {
  requestedCwd: string | null;
  sessionId: string | null;
  sessionProjectId?: string;
  /** 会话归属的 Long Agent：URL 三要素之一（agent + project + session）。 */
  sessionLongAgentId?: string;
}

export function getInitialNavigation(searchParams: Pick<URLSearchParams, "get">): InitialNavigation {
  const requestedCwd = searchParams.get("cwd")?.trim() || null;

  return {
    requestedCwd,
    sessionId: requestedCwd ? null : searchParams.get("session"),
    ...(!requestedCwd && searchParams.get("session") && searchParams.get("projectId")?.trim()
      ? { sessionProjectId: searchParams.get("projectId")!.trim() } : {}),
    ...(!requestedCwd && searchParams.get("session") && searchParams.get("agent")?.trim()
      ? { sessionLongAgentId: searchParams.get("agent")!.trim() } : {}),
  };
}
