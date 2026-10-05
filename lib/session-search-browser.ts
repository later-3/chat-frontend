/** 会话搜索前端合同：范围 + 创建日期 + 关键词（含全文）+ 是否包含移除区。 */

export type SessionSearchScope = "project" | "agent" | "all";
export type SessionSearchState = "active" | "removed";

export interface SessionSearchParams {
  readonly scope: SessionSearchScope;
  readonly projectId?: string;
  readonly owner?: string;
  readonly query?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly includeRemoved?: boolean;
}

export interface SessionSearchResult {
  readonly sessionId: string;
  readonly projectId: string;
  readonly ownerLongAgentId?: string;
  readonly title: string;
  readonly firstMessage: string;
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: SessionSearchState;
  readonly snippet: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResult(value: unknown): SessionSearchResult {
  if (!isRecord(value)) throw new Error("无效的会话搜索结果");
  const { sessionId, projectId, ownerLongAgentId, title, firstMessage, messageCount, createdAt, updatedAt, state, snippet } = value;
  if (typeof sessionId !== "string" || typeof projectId !== "string" || typeof title !== "string"
    || typeof firstMessage !== "string" || typeof messageCount !== "number"
    || typeof createdAt !== "string" || typeof updatedAt !== "string"
    || (state !== "active" && state !== "removed")
    || (snippet !== null && typeof snippet !== "string")
    || (ownerLongAgentId !== undefined && typeof ownerLongAgentId !== "string")) {
    throw new Error("无效的会话搜索结果");
  }
  return {
    sessionId, projectId, title, firstMessage, messageCount, createdAt, updatedAt, state, snippet,
    ...(ownerLongAgentId === undefined ? {} : { ownerLongAgentId }),
  };
}

export async function searchSessions(
  params: SessionSearchParams,
  signal?: AbortSignal,
): Promise<readonly SessionSearchResult[]> {
  const query = new URLSearchParams({ scope: params.scope });
  if (params.projectId !== undefined) query.set("projectId", params.projectId);
  if (params.owner !== undefined) query.set("owner", params.owner);
  if (params.query !== undefined && params.query !== "") query.set("query", params.query);
  if (params.createdFrom !== undefined && params.createdFrom !== "") query.set("createdFrom", params.createdFrom);
  if (params.createdTo !== undefined && params.createdTo !== "") query.set("createdTo", params.createdTo);
  if (params.includeRemoved === true) query.set("includeRemoved", "1");
  const response = await fetch(`/api/sessions?${query.toString()}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`搜索会话失败 (${String(response.status)})`);
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.sessions)) throw new Error("Chat返回了无效的搜索结果");
  return body.sessions.map(parseResult);
}
