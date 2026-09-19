export interface InitialNavigation {
  requestedCwd: string | null;
  sessionId: string | null;
  sessionProjectId?: string;
}

export function getInitialNavigation(searchParams: Pick<URLSearchParams, "get">): InitialNavigation {
  const requestedCwd = searchParams.get("cwd")?.trim() || null;

  return {
    requestedCwd,
    sessionId: requestedCwd ? null : searchParams.get("session"),
    ...(!requestedCwd && searchParams.get("session") && searchParams.get("projectId")?.trim()
      ? { sessionProjectId: searchParams.get("projectId")!.trim() } : {}),
  };
}
