export const MEMORY_KINDS = [
  "preference",
  "fact",
  "decision",
  "lesson",
  "goal",
  "constraint",
  "session_summary",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryScope = "personal" | "project";
export type MemoryTarget =
  | { readonly type: "personal" }
  | { readonly type: "project"; readonly projectId: string };
export type MemoryStatus = "active" | "archived";
export type MemoryIndexStatus = "pending" | "indexed" | "failed";

export interface MemoryRecord {
  readonly id: string;
  readonly text: string;
  readonly kind: MemoryKind;
  readonly scope: MemoryScope;
  readonly projectId: string | null;
  readonly groupId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly sourceSessionId: string | null;
  readonly sourceProjectId: string | null;
  readonly sourceEntryIds: readonly string[];
  readonly sourceWorkflowInvocationId: string | null;
  readonly status: MemoryStatus;
  readonly version: number;
  readonly mem0Id: string | null;
  readonly indexStatus: MemoryIndexStatus;
  readonly indexError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MemoryListPage {
  readonly items: readonly MemoryRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface MemorySearchHit {
  readonly memory: MemoryRecord;
  readonly score: number | null;
}

export interface MemoryHealth {
  readonly records: number;
  readonly indexed: number;
  readonly pending: number;
  readonly failed: number;
  readonly pendingDeletions: number;
}

export interface MemoryRebuildResult {
  readonly total: number;
  readonly indexed: number;
  readonly failed: number;
  readonly failures: readonly { readonly memoryId: string; readonly error: string }[];
}

export interface MemoryListInput {
  readonly target: MemoryTarget;
  readonly kind?: MemoryKind;
  readonly status?: MemoryStatus;
  readonly limit?: number;
  readonly offset?: number;
}

export interface MemorySearchInput {
  readonly query: string;
  readonly targets: readonly MemoryTarget[];
  readonly kind?: MemoryKind;
  readonly topK?: number;
}

export interface MemoryCreateInput {
  readonly text: string;
  readonly kind: MemoryKind;
  readonly target: MemoryTarget;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MemoryUpdateInput {
  readonly target: MemoryTarget;
  readonly text?: string;
  readonly kind?: MemoryKind;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Chat返回了无效的Memory字段: ${field}`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredString(value, field);
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Chat返回了无效的Memory字段: ${field}`);
  }
  return value;
}

function parseMemoryRecord(value: unknown): MemoryRecord {
  if (!isRecord(value)) throw new Error("Chat返回了无效的Memory记录");
  const kind = requiredString(value.kind, "kind");
  const scope = requiredString(value.scope, "scope");
  const status = requiredString(value.status, "status");
  const indexStatus = requiredString(value.indexStatus, "indexStatus");
  if (!MEMORY_KINDS.includes(kind as MemoryKind)) throw new Error("Chat返回了无效的Memory kind");
  if (scope !== "personal" && scope !== "project") throw new Error("Chat返回了无效的Memory scope");
  if (status !== "active" && status !== "archived") throw new Error("Chat返回了无效的Memory status");
  if (indexStatus !== "pending" && indexStatus !== "indexed" && indexStatus !== "failed") {
    throw new Error("Chat返回了无效的Memory indexStatus");
  }
  if (!isRecord(value.metadata)) throw new Error("Chat返回了无效的Memory metadata");
  if (!Array.isArray(value.sourceEntryIds) || value.sourceEntryIds.some((item) => typeof item !== "string")) {
    throw new Error("Chat返回了无效的Memory sourceEntryIds");
  }
  return {
    id: requiredString(value.id, "id"),
    text: requiredString(value.text, "text"),
    kind: kind as MemoryKind,
    scope,
    projectId: nullableString(value.projectId, "projectId"),
    groupId: requiredString(value.groupId, "groupId"),
    metadata: value.metadata,
    sourceSessionId: nullableString(value.sourceSessionId, "sourceSessionId"),
    sourceProjectId: nullableString(value.sourceProjectId, "sourceProjectId"),
    sourceEntryIds: value.sourceEntryIds as string[],
    sourceWorkflowInvocationId: nullableString(
      value.sourceWorkflowInvocationId,
      "sourceWorkflowInvocationId",
    ),
    status,
    version: requiredNumber(value.version, "version"),
    mem0Id: nullableString(value.mem0Id, "mem0Id"),
    indexStatus,
    indexError: nullableString(value.indexError, "indexError"),
    createdAt: requiredString(value.createdAt, "createdAt"),
    updatedAt: requiredString(value.updatedAt, "updatedAt"),
  };
}

function parseMemoryEnvelope(value: unknown): MemoryRecord {
  if (!isRecord(value) || !("memory" in value)) throw new Error("Chat返回了无效的Memory响应");
  return parseMemoryRecord(value.memory);
}

function parseListPage(value: unknown): MemoryListPage {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("Chat返回了无效的Memory列表");
  return {
    items: value.items.map(parseMemoryRecord),
    total: requiredNumber(value.total, "total"),
    limit: requiredNumber(value.limit, "limit"),
    offset: requiredNumber(value.offset, "offset"),
  };
}

function parseSearchHits(value: unknown): MemorySearchHit[] {
  if (!isRecord(value) || !Array.isArray(value.results)) throw new Error("Chat返回了无效的Memory搜索结果");
  return value.results.map((item) => {
    if (!isRecord(item)) throw new Error("Chat返回了无效的Memory搜索项");
    const score = item.score === null ? null : requiredNumber(item.score, "score");
    return { memory: parseMemoryRecord(item.memory), score };
  });
}

function parseHealth(value: unknown): MemoryHealth {
  if (!isRecord(value)) throw new Error("Chat返回了无效的Memory状态");
  return {
    records: requiredNumber(value.records, "records"),
    indexed: requiredNumber(value.indexed, "indexed"),
    pending: requiredNumber(value.pending, "pending"),
    failed: requiredNumber(value.failed, "failed"),
    pendingDeletions: requiredNumber(value.pendingDeletions, "pendingDeletions"),
  };
}

function parseRebuild(value: unknown): MemoryRebuildResult {
  if (!isRecord(value) || !Array.isArray(value.failures)) throw new Error("Chat返回了无效的Memory重建结果");
  const failures = value.failures.map((failure) => {
    if (!isRecord(failure)) throw new Error("Chat返回了无效的Memory重建失败项");
    return {
      memoryId: requiredString(failure.memoryId, "memoryId"),
      error: requiredString(failure.error, "error"),
    };
  });
  return {
    total: requiredNumber(value.total, "total"),
    indexed: requiredNumber(value.indexed, "indexed"),
    failed: requiredNumber(value.failed, "failed"),
    failures,
  };
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function errorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    if (typeof body.statusMessage === "string") return body.statusMessage;
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  }
  return `HTTP ${status}`;
}

async function memoryRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  const body = await responseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  return body;
}

export async function listMemories(input: MemoryListInput, signal?: AbortSignal): Promise<MemoryListPage> {
  const query = new URLSearchParams();
  query.set("scope", input.target.type);
  if (input.target.type === "project") query.set("projectId", input.target.projectId);
  const { target: _target, ...filters } = input;
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return parseListPage(await memoryRequest(`/api/memories?${query.toString()}`, { signal }));
}

export async function searchMemories(input: MemorySearchInput, signal?: AbortSignal): Promise<MemorySearchHit[]> {
  return parseSearchHits(await memoryRequest("/api/memories/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  }));
}

export async function createMemory(input: MemoryCreateInput): Promise<MemoryRecord> {
  return parseMemoryEnvelope(await memoryRequest("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function updateMemory(memoryId: string, input: MemoryUpdateInput): Promise<MemoryRecord> {
  return parseMemoryEnvelope(await memoryRequest(`/api/memories/${encodeURIComponent(memoryId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

function targetQuery(target: MemoryTarget): string {
  const query = new URLSearchParams({ scope: target.type });
  if (target.type === "project") query.set("projectId", target.projectId);
  return query.toString();
}

export async function deleteMemory(memoryId: string, target: MemoryTarget): Promise<void> {
  await memoryRequest(`/api/memories/${encodeURIComponent(memoryId)}?${targetQuery(target)}`, { method: "DELETE" });
}

export async function fetchMemoryHealth(target: MemoryTarget, signal?: AbortSignal): Promise<MemoryHealth> {
  return parseHealth(await memoryRequest(`/api/memories/health?${targetQuery(target)}`, { signal }));
}

export async function rebuildMemoryIndex(target: MemoryTarget): Promise<MemoryRebuildResult> {
  return parseRebuild(await memoryRequest("/api/memories/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  }));
}

export const memoryContractParsers = {
  list: parseListPage,
  search: parseSearchHits,
  health: parseHealth,
  rebuild: parseRebuild,
};
