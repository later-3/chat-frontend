export interface RemovedSessionInfo {
  readonly id: string;
  readonly projectId: string;
  readonly cwd: string;
  readonly name?: string;
  readonly created: string;
  readonly modified: string;
  readonly messageCount: number;
  readonly firstMessage: string;
  readonly parentSessionId?: string;
  readonly removedAt: string;
  readonly purgeAt: string;
}

export interface RemovedSessionsPage {
  readonly sessions: readonly RemovedSessionInfo[];
  readonly retentionDays: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Chat返回了无效的${field}`);
  return value;
}

function dateString(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (Number.isNaN(Date.parse(result))) throw new Error(`Chat返回了无效的${field}`);
  return result;
}

export function parseRemovedSessionInfo(value: unknown): RemovedSessionInfo {
  if (!isRecord(value)) throw new Error("Chat返回了无效的移除Session");
  if (!Number.isInteger(value.messageCount) || (value.messageCount as number) < 0) {
    throw new Error("Chat返回了无效的移除Session消息数");
  }
  if (value.name !== undefined && typeof value.name !== "string") throw new Error("Chat返回了无效的Session名称");
  if (value.parentSessionId !== undefined && typeof value.parentSessionId !== "string") {
    throw new Error("Chat返回了无效的父Session ID");
  }
  if (typeof value.firstMessage !== "string") throw new Error("Chat返回了无效的Session首条消息");
  return {
    id: requiredString(value.id, "Session ID"),
    projectId: requiredString(value.projectId, "Project ID"),
    cwd: requiredString(value.cwd, "Session工作目录"),
    ...(value.name === undefined ? {} : { name: value.name }),
    created: dateString(value.created, "Session创建时间"),
    modified: dateString(value.modified, "Session修改时间"),
    messageCount: value.messageCount as number,
    firstMessage: value.firstMessage,
    ...(value.parentSessionId === undefined ? {} : { parentSessionId: value.parentSessionId }),
    removedAt: dateString(value.removedAt, "Session移除时间"),
    purgeAt: dateString(value.purgeAt, "Session永久删除时间"),
  };
}

function retentionDays(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 3650) {
    throw new Error("Chat返回了无效的Session保留天数");
  }
  return value as number;
}

export function parseRemovedSessionsPage(value: unknown): RemovedSessionsPage {
  if (!isRecord(value) || !Array.isArray(value.sessions)) throw new Error("Chat返回了无效的Session移除区");
  return {
    sessions: value.sessions.map(parseRemovedSessionInfo),
    retentionDays: retentionDays(value.retentionDays),
  };
}

async function responseError(response: Response): Promise<Error> {
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json() as unknown;
    if (isRecord(body)) {
      if (typeof body.statusMessage === "string" && body.statusMessage.trim() !== "") message = body.statusMessage;
      else if (typeof body.message === "string" && body.message.trim() !== "") message = body.message;
    }
  } catch {
    // Keep the HTTP status when the response body is not JSON.
  }
  return new Error(message);
}

async function jsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<unknown>;
}

export async function fetchRemovedSessions(projectId: string): Promise<RemovedSessionsPage> {
  const query = new URLSearchParams({ projectId });
  return parseRemovedSessionsPage(await jsonResponse(await fetch(`/api/sessions/removed?${query}`, { cache: "no-store" })));
}

export async function removeSession(projectId: string, sessionId: string): Promise<RemovedSessionInfo> {
  const query = new URLSearchParams({ projectId });
  const body = await jsonResponse(await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/remove?${query}`,
    { method: "POST" },
  ));
  if (!isRecord(body) || body.state !== "removed") throw new Error("Chat返回了无效的Session移除结果");
  return parseRemovedSessionInfo(body.session);
}

export async function renameSession(projectId: string, sessionId: string, name: string): Promise<string | null> {
  const query = new URLSearchParams({ projectId });
  const body = await jsonResponse(await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?${query}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }));
  if (!isRecord(body) || body.sessionId !== sessionId || (body.name !== null && typeof body.name !== "string")) {
    throw new Error("Chat返回了无效的Session重命名结果");
  }
  return body.name;
}

export async function restoreRemovedSession(projectId: string, sessionId: string): Promise<void> {
  const query = new URLSearchParams({ projectId });
  const body = await jsonResponse(await fetch(
    `/api/sessions/removed/${encodeURIComponent(sessionId)}/restore?${query}`,
    { method: "POST" },
  ));
  if (!isRecord(body) || body.state !== "active" || body.sessionId !== sessionId) {
    throw new Error("Chat返回了无效的Session恢复结果");
  }
}

export async function purgeRemovedSession(projectId: string, sessionId: string): Promise<void> {
  const query = new URLSearchParams({ projectId });
  const body = await jsonResponse(await fetch(
    `/api/sessions/removed/${encodeURIComponent(sessionId)}?${query}`,
    { method: "DELETE" },
  ));
  if (!isRecord(body) || body.state !== "purged" || body.sessionId !== sessionId
    || Number.isNaN(Date.parse(String(body.purgedAt)))) {
    throw new Error("Chat返回了无效的Session永久删除结果");
  }
}

export async function updateRemovedSessionRetention(projectId: string, days: number): Promise<number> {
  const query = new URLSearchParams({ projectId });
  const body = await jsonResponse(await fetch(`/api/sessions/removed/settings?${query}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removedRetentionDays: days }),
  }));
  if (!isRecord(body)) throw new Error("Chat返回了无效的Session移除区配置");
  return retentionDays(body.removedRetentionDays);
}
