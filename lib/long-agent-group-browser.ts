export interface LongAgentCoreMemoryFile {
  readonly path: string;
  readonly content: string;
  readonly size: number;
  readonly updatedAt: string;
  readonly revision: string;
}

export interface LongAgentGroupDocument {
  readonly schemaVersion: 1;
  readonly stale: boolean;
  readonly fetchedAt: string;
  readonly group: {
    readonly id: string;
    readonly name: string;
    readonly standingInstructions: string | null;
    readonly revision: string;
  };
  readonly workspace: {
    readonly folder: string;
    readonly memoryFileCount: number;
  };
  readonly coreMemory: {
    readonly index: LongAgentCoreMemoryFile;
    readonly definition: LongAgentCoreMemoryFile;
  };
}

export interface LongAgentMemoryFileSummary {
  readonly path: string;
  readonly size: number;
  readonly updatedAt: string;
  readonly revision: string;
}

export interface LongAgentMemoryList {
  readonly schemaVersion: 1;
  readonly stale: boolean;
  readonly agentGroupId: string;
  readonly files: readonly LongAgentMemoryFileSummary[];
}

export interface LongAgentMemoryFile extends LongAgentMemoryFileSummary {
  readonly content: string;
}

export interface LongAgentMemoryRead {
  readonly schemaVersion: 1;
  readonly stale: boolean;
  readonly agentGroupId: string;
  readonly file: LongAgentMemoryFile;
}

export interface LongAgentMemorySearchResult {
  readonly path: string;
  readonly revision: string;
  readonly score: number;
  readonly snippet: string;
}

export interface LongAgentMemorySearch {
  readonly schemaVersion: 1;
  readonly stale: boolean;
  readonly agentGroupId: string;
  readonly results: readonly LongAgentMemorySearchResult[];
}

export interface LongAgentMemoryDelete {
  readonly schemaVersion: 1;
  readonly stale: boolean;
  readonly agentGroupId: string;
  readonly deleted: true;
  readonly path: string;
}

export class LongAgentManagementError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LongAgentManagementError";
    this.status = status;
  }
}

const MAX_AGENT_MEMORY_SEARCH_CHARS = 512;
const MAX_AGENT_MEMORY_SEARCH_TERMS = 32;
const MAX_AGENT_MEMORY_CONTENT_BYTES = 900 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isIsoDate(value: unknown): value is string {
  if (!nonEmpty(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value;
}

function assertExactFields(value: Record<string, unknown>, fields: readonly string[], context: string): void {
  const expected = new Set(fields);
  if (Object.keys(value).some((field) => !expected.has(field))) {
    throw new Error(`Chat返回了包含未知字段的${context}`);
  }
}

/** Browser-visible paths are always relative Agent Group paths. */
export function isSafeAgentGroupPath(value: unknown): value is string {
  if (!nonEmpty(value) || value.includes("\0") || value.includes("\\")) return false;
  if (value.startsWith("/") || /^[a-zA-Z]:\//.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

export function isSafeAgentMemoryPath(value: unknown): value is string {
  return isSafeAgentGroupPath(value) && value.toLowerCase().endsWith(".md");
}

function parseRevision(value: unknown, context: string): string {
  if (!nonEmpty(value) || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Chat返回了无效的${context} revision`);
  }
  return value;
}

function parseCoreMemoryFile(value: unknown, context: string, expectedPath: string): LongAgentCoreMemoryFile {
  if (isRecord(value)) assertExactFields(value, ["path", "content", "size", "updatedAt", "revision"], context);
  if (!isRecord(value) || value.path !== expectedPath || typeof value.content !== "string"
    || !Number.isSafeInteger(value.size) || (value.size as number) < 0 || !isIsoDate(value.updatedAt)) {
    throw new Error(`Chat返回了无效的${context}`);
  }
  return {
    path: value.path,
    content: value.content,
    size: value.size as number,
    updatedAt: value.updatedAt,
    revision: parseRevision(value.revision, context),
  };
}

export function parseLongAgentGroupDocument(value: unknown): LongAgentGroupDocument {
  if (isRecord(value)) {
    assertExactFields(
      value,
      ["schemaVersion", "stale", "fetchedAt", "group", "workspace", "coreMemory"],
      "Agent Group配置",
    );
    if (isRecord(value.group)) assertExactFields(
      value.group,
      ["id", "name", "standingInstructions", "revision"],
      "Agent Group身份",
    );
    if (isRecord(value.workspace)) assertExactFields(
      value.workspace,
      ["folder", "memoryFileCount"],
      "Agent Group Workspace摘要",
    );
    if (isRecord(value.coreMemory)) assertExactFields(
      value.coreMemory,
      ["index", "definition"],
      "Agent Group核心Memory",
    );
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.stale !== "boolean"
    || !isIsoDate(value.fetchedAt) || !isRecord(value.group) || !nonEmpty(value.group.id)
    || !nonEmpty(value.group.name)
    || (value.group.standingInstructions !== null && typeof value.group.standingInstructions !== "string")
    || !isRecord(value.workspace) || !isSafeAgentGroupPath(value.workspace.folder)
    || !Number.isSafeInteger(value.workspace.memoryFileCount) || (value.workspace.memoryFileCount as number) < 0
    || !isRecord(value.coreMemory)) {
    throw new Error("Chat返回了无效的Agent Group配置");
  }
  return {
    schemaVersion: 1,
    stale: value.stale,
    fetchedAt: value.fetchedAt,
    group: {
      id: value.group.id,
      name: value.group.name,
      standingInstructions: value.group.standingInstructions,
      revision: parseRevision(value.group.revision, "Agent Group"),
    },
    workspace: {
      folder: value.workspace.folder,
      memoryFileCount: value.workspace.memoryFileCount as number,
    },
    coreMemory: {
      index: parseCoreMemoryFile(value.coreMemory.index, "Agent Memory index", "index.md"),
      definition: parseCoreMemoryFile(
        value.coreMemory.definition,
        "Agent Memory definition",
        "system/definition.md",
      ),
    },
  };
}

function parseMemoryFileSummary(value: unknown): LongAgentMemoryFileSummary {
  if (isRecord(value)) assertExactFields(value, ["path", "size", "updatedAt", "revision"], "Agent Memory文件摘要");
  if (!isRecord(value) || !isSafeAgentMemoryPath(value.path)
    || !Number.isSafeInteger(value.size) || (value.size as number) < 0 || !isIsoDate(value.updatedAt)) {
    throw new Error("Chat返回了无效的Agent Memory文件摘要");
  }
  return {
    path: value.path,
    size: value.size as number,
    updatedAt: value.updatedAt,
    revision: parseRevision(value.revision, "Agent Memory文件"),
  };
}

function parseMemoryEnvelope(value: unknown): {
  readonly record: Record<string, unknown>;
  readonly stale: boolean;
  readonly agentGroupId: string;
} {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.stale !== "boolean"
    || !nonEmpty(value.agentGroupId)) {
    throw new Error("Chat返回了无效的Agent Memory响应");
  }
  return { record: value, stale: value.stale, agentGroupId: value.agentGroupId };
}

export function parseLongAgentMemoryList(value: unknown): LongAgentMemoryList {
  const envelope = parseMemoryEnvelope(value);
  assertExactFields(envelope.record, ["schemaVersion", "stale", "agentGroupId", "files"], "Agent Memory文件列表");
  if (!Array.isArray(envelope.record.files)) {
    throw new Error("Chat返回了无效的Agent Memory文件列表");
  }
  return {
    schemaVersion: 1,
    stale: envelope.stale,
    agentGroupId: envelope.agentGroupId,
    files: envelope.record.files.map(parseMemoryFileSummary),
  };
}

export function parseLongAgentMemoryRead(value: unknown): LongAgentMemoryRead {
  const envelope = parseMemoryEnvelope(value);
  assertExactFields(envelope.record, ["schemaVersion", "stale", "agentGroupId", "file"], "Agent Memory文件响应");
  if (!isRecord(envelope.record.file) || typeof envelope.record.file.content !== "string") {
    throw new Error("Chat返回了无效的Agent Memory文件");
  }
  assertExactFields(envelope.record.file, ["path", "content", "size", "updatedAt", "revision"], "Agent Memory文件");
  const { content, ...summaryFields } = envelope.record.file;
  const summary = parseMemoryFileSummary(summaryFields);
  return {
    schemaVersion: 1,
    stale: envelope.stale,
    agentGroupId: envelope.agentGroupId,
    file: { ...summary, content: envelope.record.file.content },
  };
}

export function parseLongAgentMemorySearch(value: unknown): LongAgentMemorySearch {
  const envelope = parseMemoryEnvelope(value);
  assertExactFields(envelope.record, ["schemaVersion", "stale", "agentGroupId", "results"], "Agent Memory搜索响应");
  if (!Array.isArray(envelope.record.results)) {
    throw new Error("Chat返回了无效的Agent Memory搜索结果");
  }
  const results = envelope.record.results.map((item): LongAgentMemorySearchResult => {
    if (isRecord(item)) assertExactFields(item, ["path", "revision", "score", "snippet"], "Agent Memory搜索结果");
    if (!isRecord(item) || !isSafeAgentMemoryPath(item.path) || typeof item.snippet !== "string"
      || typeof item.score !== "number" || !Number.isFinite(item.score)) {
      throw new Error("Chat返回了无效的Agent Memory搜索结果");
    }
    return {
      path: item.path,
      revision: parseRevision(item.revision, "Agent Memory搜索结果"),
      score: item.score,
      snippet: item.snippet,
    };
  });
  return {
    schemaVersion: 1,
    stale: envelope.stale,
    agentGroupId: envelope.agentGroupId,
    results,
  };
}

export function parseLongAgentMemoryDelete(value: unknown): LongAgentMemoryDelete {
  const envelope = parseMemoryEnvelope(value);
  assertExactFields(envelope.record, ["schemaVersion", "stale", "agentGroupId", "deleted", "path"], "Agent Memory删除结果");
  if (envelope.record.deleted !== true || !isSafeAgentMemoryPath(envelope.record.path)) {
    throw new Error("Chat返回了无效的Agent Memory删除结果");
  }
  return {
    schemaVersion: 1,
    stale: envelope.stale,
    agentGroupId: envelope.agentGroupId,
    deleted: true,
    path: envelope.record.path,
  };
}

async function responseBody(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = isRecord(body)
      ? [body.statusMessage, body.message, body.error]
          .find((item): item is string => nonEmpty(item))
      : undefined;
    throw new LongAgentManagementError(message ?? `HTTP ${response.status}`, response.status);
  }
  return body;
}

function endpoint(longAgentId: string, resource: "agent-group" | "agent-memory"): string {
  return `/api/long-agents/${encodeURIComponent(longAgentId)}/${resource}`;
}

export async function fetchLongAgentGroup(
  longAgentId: string,
  signal?: AbortSignal,
): Promise<LongAgentGroupDocument> {
  const response = await fetch(endpoint(longAgentId, "agent-group"), {
    cache: "no-store",
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  return parseLongAgentGroupDocument(await responseBody(response));
}

export async function saveLongAgentGroup(
  longAgentId: string,
  expectedRevision: string,
  update: { readonly name: string; readonly standingInstructions: string | null },
  signal?: AbortSignal,
): Promise<LongAgentGroupDocument> {
  const response = await fetch(endpoint(longAgentId, "agent-group"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ schemaVersion: 1, expectedRevision, ...update }),
    ...(signal === undefined ? {} : { signal }),
  });
  return parseLongAgentGroupDocument(await responseBody(response));
}

export async function fetchLongAgentMemory(
  longAgentId: string,
  signal?: AbortSignal,
): Promise<LongAgentMemoryList> {
  const query = new URLSearchParams({ operation: "list" });
  const response = await fetch(`${endpoint(longAgentId, "agent-memory")}?${query.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  return parseLongAgentMemoryList(await responseBody(response));
}

export async function readLongAgentMemory(
  longAgentId: string,
  path: string,
  signal?: AbortSignal,
): Promise<LongAgentMemoryRead> {
  if (!isSafeAgentMemoryPath(path)) throw new Error("Agent Memory路径必须是安全的相对Markdown路径");
  const query = new URLSearchParams({ operation: "read", path });
  const response = await fetch(`${endpoint(longAgentId, "agent-memory")}?${query.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  return parseLongAgentMemoryRead(await responseBody(response));
}

export async function searchLongAgentMemory(
  longAgentId: string,
  queryText: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<LongAgentMemorySearch> {
  const normalized = queryText.trim();
  if (!normalized) throw new Error("Agent Memory搜索内容不能为空");
  if (normalized.length > MAX_AGENT_MEMORY_SEARCH_CHARS
    || normalized.split(/\s+/).filter(Boolean).length > MAX_AGENT_MEMORY_SEARCH_TERMS) {
    throw new Error("Agent Memory搜索内容不能超过512个字符或32个分词");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Agent Memory搜索数量必须在1到100之间");
  }
  const query = new URLSearchParams({ operation: "search", query: normalized, limit: String(limit) });
  const response = await fetch(`${endpoint(longAgentId, "agent-memory")}?${query.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  return parseLongAgentMemorySearch(await responseBody(response));
}

export async function writeLongAgentMemory(
  longAgentId: string,
  input: { readonly path: string; readonly content: string; readonly expectedRevision: string | null },
  signal?: AbortSignal,
): Promise<LongAgentMemoryRead> {
  if (!isSafeAgentMemoryPath(input.path)) throw new Error("Agent Memory路径必须是安全的相对Markdown路径");
  if (new TextEncoder().encode(input.content).byteLength > MAX_AGENT_MEMORY_CONTENT_BYTES) {
    throw new Error("Agent Memory文件不能超过900 KiB UTF-8数据");
  }
  const response = await fetch(endpoint(longAgentId, "agent-memory"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ schemaVersion: 1, operation: "write", ...input }),
    ...(signal === undefined ? {} : { signal }),
  });
  return parseLongAgentMemoryRead(await responseBody(response));
}

export async function deleteLongAgentMemory(
  longAgentId: string,
  input: { readonly path: string; readonly expectedRevision: string },
  signal?: AbortSignal,
): Promise<LongAgentMemoryDelete> {
  if (!isSafeAgentMemoryPath(input.path)) throw new Error("Agent Memory路径必须是安全的相对Markdown路径");
  const response = await fetch(endpoint(longAgentId, "agent-memory"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ schemaVersion: 1, operation: "delete", ...input }),
    ...(signal === undefined ? {} : { signal }),
  });
  return parseLongAgentMemoryDelete(await responseBody(response));
}
