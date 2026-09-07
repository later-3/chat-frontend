export interface ChatProjectSummary {
  readonly projectId: string;
  readonly cachedName: string;
  readonly cachedDescription: string;
  readonly path: string;
  readonly firstOpenedAt: string;
  readonly lastOpenedAt: string;
  readonly available: boolean;
  readonly kind: "daily" | "directory";
}

export interface OpenedChatProject {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly cwd: string;
  readonly projectRoot: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProject(value: unknown): ChatProjectSummary {
  if (!isRecord(value)) throw new Error("Chat返回了无效的Project");
  for (const field of ["projectId", "cachedName", "cachedDescription", "path", "firstOpenedAt", "lastOpenedAt"] as const) {
    if (typeof value[field] !== "string") throw new Error(`Chat返回了无效的Project字段: ${field}`);
  }
  if (typeof value.available !== "boolean") throw new Error("Chat返回了无效的Project字段: available");
  if (value.kind !== "daily" && value.kind !== "directory") {
    throw new Error("Chat返回了无效的Project字段: kind");
  }
  return value as unknown as ChatProjectSummary;
}

function readString(value: Record<string, unknown>, field: string): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || (field !== "description" && fieldValue.trim() === "")) {
    throw new Error(`Chat返回了无效的Project字段: ${field}`);
  }
  return fieldValue;
}

export function parseOpenedChatProject(value: unknown): OpenedChatProject {
  if (!isRecord(value)) throw new Error("Chat返回了无效的已打开Project");
  const fields = ["projectId", "name", "description", "cwd", "projectRoot"];
  if (Object.keys(value).some((field) => !fields.includes(field))) {
    throw new Error("Chat返回了未知的已打开Project字段");
  }
  return {
    projectId: readString(value, "projectId"),
    name: readString(value, "name"),
    description: readString(value, "description"),
    cwd: readString(value, "cwd"),
    projectRoot: readString(value, "projectRoot"),
  };
}

export async function openChatProject(path: string, signal?: AbortSignal): Promise<OpenedChatProject> {
  const response = await fetch("/api/projects/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    credentials: "same-origin",
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body)
      ? [body.statusMessage, body.message, body.error].find((value): value is string => typeof value === "string")
      : undefined;
    throw new Error(message ?? `打开Project失败: HTTP ${response.status}`);
  }
  return parseOpenedChatProject(body);
}

export async function fetchChatProjects(signal?: AbortSignal): Promise<ChatProjectSummary[]> {
  const response = await fetch("/api/projects", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`读取Project失败: HTTP ${response.status}`);
  if (!isRecord(body) || !Array.isArray(body.projects)) throw new Error("Chat返回了无效的Project列表");
  return body.projects.map(parseProject)
    .sort((left, right) => {
      if (left.kind === "daily" && right.kind !== "daily") return -1;
      if (right.kind === "daily" && left.kind !== "daily") return 1;
      return right.lastOpenedAt.localeCompare(left.lastOpenedAt);
    });
}
