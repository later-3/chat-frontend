import type { SessionInfo } from "./types";

export interface SessionListPage {
  sessions: SessionInfo[];
  runningSessionIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Chat返回了无效的${field}`);
  }
  return value;
}

function dateString(value: unknown, field: string): string {
  const parsed = requiredString(value, field);
  if (Number.isNaN(Date.parse(parsed))) throw new Error(`Chat返回了无效的${field}`);
  return parsed;
}

function parseSessionOwner(value: unknown): SessionInfo["owner"] {
  if (!isRecord(value)) throw new Error("Chat返回了无效的Session owner");
  if (value.type === "ordinary") {
    if (Object.keys(value).length !== 1) throw new Error("Chat返回了无效的普通Session owner");
    return { type: "ordinary" };
  }
  if (value.type !== "long-agent"
    || Object.keys(value).length !== 3
    || typeof value.longAgentId !== "string" || value.longAgentId.trim() === ""
    || typeof value.projectLongAgentId !== "string" || value.projectLongAgentId.trim() === "") {
    throw new Error("Chat返回了无效的长期Agent Session owner");
  }
  return {
    type: "long-agent",
    longAgentId: value.longAgentId,
    projectLongAgentId: value.projectLongAgentId,
  };
}

export function parseSessionInfo(value: unknown): SessionInfo {
  if (!isRecord(value) || !Number.isSafeInteger(value.messageCount) || (value.messageCount as number) < 0
    || typeof value.firstMessage !== "string") {
    throw new Error("Chat返回了无效的Session摘要");
  }
  if ((value.projectAvailable !== undefined && typeof value.projectAvailable !== "boolean")
    || (value.transient !== undefined && typeof value.transient !== "boolean")
    || (value.readOnly !== undefined && typeof value.readOnly !== "boolean")
    || (value.sessionSource !== undefined && value.sessionSource !== "pi" && value.sessionSource !== "chat")) {
    throw new Error("Chat返回了无效的Session属性");
  }
  let attention: SessionInfo["attention"];
  if (value.attention !== undefined) {
    if (!isRecord(value.attention)
      || (value.attention.kind !== "review" && value.attention.kind !== "clarification")) {
      throw new Error("Chat返回了无效的Session待确认状态");
    }
    attention = {
      kind: value.attention.kind,
      workflowId: requiredString(value.attention.workflowId, "待确认Workflow ID"),
      updatedAt: dateString(value.attention.updatedAt, "待确认更新时间"),
    };
  }
  return {
    path: requiredString(value.path, "Session路径"),
    id: requiredString(value.id, "Session ID"),
    cwd: requiredString(value.cwd, "Session工作目录"),
    ...(value.name === undefined ? {} : { name: requiredString(value.name, "Session名称") }),
    created: dateString(value.created, "Session创建时间"),
    modified: dateString(value.modified, "Session修改时间"),
    messageCount: value.messageCount as number,
    firstMessage: value.firstMessage,
    owner: parseSessionOwner(value.owner),
    ...(value.parentSessionId === undefined ? {} : { parentSessionId: requiredString(value.parentSessionId, "父Session ID") }),
    ...(attention === undefined ? {} : { attention }),
    ...(value.projectRoot === undefined ? {} : { projectRoot: requiredString(value.projectRoot, "Project根目录") }),
    ...(value.projectAvailable === undefined ? {} : { projectAvailable: value.projectAvailable }),
    ...(value.projectKey === undefined ? {} : { projectKey: requiredString(value.projectKey, "Project Key") }),
    ...(value.projectId === undefined ? {} : { projectId: requiredString(value.projectId, "Project ID") }),
    ...(value.worktreeBranch === undefined ? {} : { worktreeBranch: requiredString(value.worktreeBranch, "Worktree分支") }),
    ...(value.transient === undefined ? {} : { transient: value.transient }),
    ...(value.sessionSource === undefined ? {} : { sessionSource: value.sessionSource }),
    ...(value.readOnly === undefined ? {} : { readOnly: value.readOnly }),
  };
}

/** Loads one existing Session from its owning Project list and preserves the exact server summary. */
export async function fetchProjectSessionById(
  projectId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionInfo> {
  const query = new URLSearchParams({ projectId });
  const response = await fetch(`/api/sessions?${query.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body)
      ? [body.statusMessage, body.message, body.error]
          .find((item): item is string => typeof item === "string" && item.trim() !== "")
      : undefined;
    throw new Error(message ?? `读取Session失败: HTTP ${response.status}`);
  }
  const target = parseSessionListPage(body).sessions.find((session) => session.id === sessionId);
  if (target === undefined) throw new Error(`当前Project中找不到Session: ${sessionId}`);
  return target;
}

export function parseSessionListPage(value: unknown): SessionListPage {
  if (!isRecord(value) || !Array.isArray(value.sessions)) {
    throw new Error("Chat返回了无效的Session列表");
  }
  const runningSessionIds = value.runningSessionIds ?? [];
  if (!Array.isArray(runningSessionIds)
    || runningSessionIds.some((sessionId) => typeof sessionId !== "string" || sessionId.trim() === "")) {
    throw new Error("Chat返回了无效的运行中Session列表");
  }
  return {
    sessions: value.sessions.map(parseSessionInfo),
    runningSessionIds: runningSessionIds as string[],
  };
}
