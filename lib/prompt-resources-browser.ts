export type PromptResourceKind = "rule" | "experience";
export type PromptResourceStatus = "active" | "archived";
export type PromptResourceTarget =
  | { readonly type: "personal" }
  | { readonly type: "project"; readonly projectId: string };

export interface PromptResourceSource {
  readonly type: "session" | "manual";
  readonly projectId?: string;
  readonly sessionId?: string;
  readonly workflowInvocationId?: string;
  readonly entryIds: readonly string[];
  readonly context: string;
  readonly capturedAt: string;
}

export interface PromptResource {
  readonly target: PromptResourceTarget;
  readonly id: string;
  readonly revision: number;
  readonly kind: PromptResourceKind;
  readonly title: string;
  readonly purpose: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly status: PromptResourceStatus;
  readonly sources: readonly PromptResourceSource[];
  readonly author: { readonly type: "user" } | { readonly type: "agent"; readonly agentId: string };
  readonly createdAt: string;
}

export interface PromptResourceDraft {
  readonly target: PromptResourceTarget;
  readonly id: string;
  readonly baseResourceId?: string;
  readonly baseRevision?: number;
  readonly kind: PromptResourceKind;
  readonly title: string;
  readonly purpose: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly status: PromptResourceStatus;
  readonly sources: readonly PromptResourceSource[];
  readonly author: PromptResource["author"];
  readonly createdAt: string;
  readonly updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Chat返回了无效字符串数组");
  }
  return value;
}

function parseTarget(value: unknown): PromptResourceTarget {
  if (!isRecord(value)) throw new Error("Chat返回了无效Prompt资源Target");
  if (value.type === "personal" && Object.keys(value).length === 1) return { type: "personal" };
  if (value.type === "project" && isNonEmptyString(value.projectId) && Object.keys(value).length === 2) {
    return { type: "project", projectId: value.projectId };
  }
  throw new Error("Chat返回了无效Prompt资源Target");
}

function parseSource(value: unknown): PromptResourceSource {
  if (
    !isRecord(value)
    || (value.type !== "session" && value.type !== "manual")
    || (value.projectId !== undefined && !isNonEmptyString(value.projectId))
    || (value.sessionId !== undefined && !isNonEmptyString(value.sessionId))
    || (value.workflowInvocationId !== undefined && !isNonEmptyString(value.workflowInvocationId))
    || (value.type === "session" && (!isNonEmptyString(value.projectId) || !isNonEmptyString(value.sessionId)))
    || typeof value.context !== "string"
    || !isNonEmptyString(value.capturedAt)
    || Number.isNaN(Date.parse(value.capturedAt))
  ) {
    throw new Error("Chat返回了无效Prompt资源来源");
  }
  return {
    type: value.type,
    ...(value.projectId === undefined ? {} : { projectId: value.projectId as string }),
    ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId as string }),
    ...(value.workflowInvocationId === undefined ? {} : { workflowInvocationId: value.workflowInvocationId as string }),
    entryIds: parseStringArray(value.entryIds),
    context: value.context,
    capturedAt: value.capturedAt,
  };
}

function parseAuthor(value: unknown): PromptResource["author"] {
  if (!isRecord(value)) throw new Error("Chat返回了无效Prompt资源作者");
  if (value.type === "user" && Object.keys(value).length === 1) return { type: "user" };
  if (value.type === "agent" && isNonEmptyString(value.agentId) && Object.keys(value).length === 2) {
    return { type: "agent", agentId: value.agentId };
  }
  throw new Error("Chat返回了无效Prompt资源作者");
}

function parseCommon(value: unknown) {
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || !isNonEmptyString(value.id)
    || (value.kind !== "rule" && value.kind !== "experience")
    || !isNonEmptyString(value.title)
    || !isNonEmptyString(value.purpose)
    || !isNonEmptyString(value.content)
    || (value.status !== "active" && value.status !== "archived")
    || !Array.isArray(value.sources)
    || !isNonEmptyString(value.createdAt)
    || Number.isNaN(Date.parse(value.createdAt))
  ) {
    throw new Error("Chat返回了无效Prompt资源");
  }
  return {
    target: parseTarget(value.target),
    id: value.id,
    kind: value.kind as PromptResourceKind,
    title: value.title,
    purpose: value.purpose,
    content: value.content,
    tags: parseStringArray(value.tags),
    status: value.status as PromptResourceStatus,
    sources: value.sources.map(parseSource),
    author: parseAuthor(value.author),
    createdAt: value.createdAt,
  };
}

function parsePromptResource(value: unknown): PromptResource {
  const common = parseCommon(value);
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) {
    throw new Error("Chat返回了无效Prompt资源版本");
  }
  return { ...common, revision: value.revision as number };
}

function parsePromptResourceDraft(value: unknown): PromptResourceDraft {
  const common = parseCommon(value);
  if (!isRecord(value) || !isNonEmptyString(value.updatedAt) || Number.isNaN(Date.parse(value.updatedAt))) {
    throw new Error("Chat返回了无效Prompt资源草稿");
  }
  const baseResourceId = value.baseResourceId;
  const baseRevision = value.baseRevision;
  if (baseResourceId !== undefined && !isNonEmptyString(baseResourceId)) throw new Error("Chat返回了无效Prompt资源草稿");
  if (baseRevision !== undefined && (!Number.isSafeInteger(baseRevision) || (baseRevision as number) < 1)) {
    throw new Error("Chat返回了无效Prompt资源草稿");
  }
  return {
    ...common,
    ...(baseResourceId === undefined ? {} : { baseResourceId: baseResourceId as string }),
    ...(baseRevision === undefined ? {} : { baseRevision: baseRevision as number }),
    updatedAt: value.updatedAt,
  };
}

function errorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    for (const key of ["message", "statusMessage", "error"]) {
      if (typeof body[key] === "string") return body[key];
    }
  }
  return `HTTP ${status}`;
}

function addTarget(parameters: URLSearchParams, target: PromptResourceTarget): void {
  parameters.set("target", target.type);
  if (target.type === "project") parameters.set("targetProjectId", target.projectId);
}

export function promptResourceAddress(target: PromptResourceTarget, id: string): string {
  return `${target.type === "personal" ? "personal" : `project:${target.projectId}`}/${id}`;
}

export async function fetchPromptResources(
  projectId: string,
  query = "",
  signal?: AbortSignal,
): Promise<PromptResource[]> {
  const parameters = new URLSearchParams({ projectId, status: "all" });
  if (query.trim()) parameters.set("q", query.trim());
  const response = await fetch(`/api/prompt-resources?${parameters}`, { cache: "no-store", signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  if (!isRecord(body) || !Array.isArray(body.resources)) throw new Error("Chat返回了无效Prompt资源列表");
  return body.resources.map(parsePromptResource);
}

export async function fetchPromptResource(
  projectId: string,
  resource: { readonly id: string; readonly target: PromptResourceTarget },
  signal?: AbortSignal,
): Promise<PromptResource> {
  const parameters = new URLSearchParams({ projectId });
  addTarget(parameters, resource.target);
  const response = await fetch(
    `/api/prompt-resources/${encodeURIComponent(resource.id)}?${parameters}`,
    { cache: "no-store", signal },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  if (!isRecord(body) || body.resource === undefined) throw new Error("Chat返回了无效Prompt资源");
  return parsePromptResource(body.resource);
}

export async function fetchPromptResourceDrafts(
  projectId: string,
  signal?: AbortSignal,
): Promise<PromptResourceDraft[]> {
  const parameters = new URLSearchParams({ projectId });
  const response = await fetch(`/api/prompt-resources/drafts?${parameters}`, { cache: "no-store", signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  if (!isRecord(body) || !Array.isArray(body.drafts)) throw new Error("Chat返回了无效Prompt资源草稿列表");
  return body.drafts.map(parsePromptResourceDraft);
}

export async function fetchPromptResourceHistory(
  projectId: string,
  resource: Pick<PromptResource, "id" | "target">,
  signal?: AbortSignal,
): Promise<PromptResource[]> {
  const parameters = new URLSearchParams({ projectId });
  addTarget(parameters, resource.target);
  const response = await fetch(
    `/api/prompt-resources/${encodeURIComponent(resource.id)}/history?${parameters}`,
    { cache: "no-store", signal },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  if (!isRecord(body) || !Array.isArray(body.revisions)) throw new Error("Chat返回了无效Prompt资源版本历史");
  return body.revisions.map(parsePromptResource);
}
