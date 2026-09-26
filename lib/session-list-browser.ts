import type { SessionInfo } from "./types";

import { stashProjectSessionPayload } from "./session-preload.ts";
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

/** Resolves an exact Session through Backend, including recorded legacy Project aliases. */
/**
 * Request coalescing for ONE navigation.
 *
 * Opening a session can resolve the same deep-link from more than one place (the click handler and the
 * sidebar's restore effect), which used to download the whole session twice in the same instant. Scope:
 * one in-flight request per project+session plus a very short (1.5s) reuse of its result, so a second
 * caller in the SAME navigation shares the first response. Invalidation: a different session replaces it,
 * an error clears it immediately, and the TTL ends the reuse — the chat still reads the session through
 * the payload hand-off and its own live sync, so nothing is served from this beyond the navigation burst.
 */
const NAVIGATION_REUSE_MS = 1_500;
/**
 * The coalescing store lives on globalThis: bundlers can instantiate a module twice (different specifier
 * spellings), and two instances would otherwise each start their own request for the same navigation.
 */
interface NavigationBurst {
  readonly inFlight: Map<string, Promise<SessionInfo>>;
  readonly reuse: Map<string, { readonly at: number; readonly info: SessionInfo }>;
}
const navigationBurst: NavigationBurst = ((globalThis as { __chatNavigationBurst?: NavigationBurst }).__chatNavigationBurst ??= {
  inFlight: new Map(),
  reuse: new Map(),
});

/**
 * Owner-facing navigation read: resolves the REAL session (server-side owner + storage project) and keeps
 * the SAME response for the chat loader, so opening a session downloads its body only once.
 * The payload is validated here (a session must be present) and the chat validates the body it consumes.
 */
export async function fetchProjectSessionById(
  projectId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionInfo> {
  const key = `${projectId}\u0000${sessionId}`;
  const reused = navigationBurst.reuse.get(key);
  if (reused !== undefined && Date.now() - reused.at < NAVIGATION_REUSE_MS) return reused.info;
  const inFlight = navigationBurst.inFlight.get(key);
  if (inFlight !== undefined) return await inFlight;
  const promise = requestProjectSessionById(projectId, sessionId, signal);
  navigationBurst.inFlight.set(key, promise);
  try {
    const info = await promise;
    navigationBurst.reuse.set(key, { at: Date.now(), info });
    return info;
  } catch (error) {
    navigationBurst.reuse.delete(key);
    throw error;
  } finally {
    if (navigationBurst.inFlight.get(key) === promise) navigationBurst.inFlight.delete(key);
  }
}

async function requestProjectSessionById(
  projectId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionInfo> {
  const query = new URLSearchParams({ projectId, deferThinking: "1", deferMedia: "1" });
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`, {
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
  if (!isRecord(body)) throw new Error("Chat返回了无效的Session响应");
  const target = parseSessionInfo(body.session);
  if (target.id !== sessionId) throw new Error(`Chat返回了不匹配的Session: ${sessionId}`);
  // Hand the very same response to the chat loader: the navigation load already paid for it.
  stashProjectSessionPayload(projectId, sessionId, body);
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
