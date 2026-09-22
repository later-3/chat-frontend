import { workflowRequestSignal } from "./chat-workflow-browser.ts";

/**
 * Browser client for one Friend's collaboration-project association (LA6 A).
 *
 * The Backend is the authority: the client reads the association and writes it with a revision CAS.
 * It never sends a project as an implicit per-turn override, and a stale revision is surfaced as an
 * explicit conflict instead of silently adopting another value.
 */
export interface FriendInteractionProject {
  longAgentId: string;
  /** `unset` = no record; `set` = explicit choice (including explicit clear). */
  status: "unset" | "set";
  projectId: string | null;
  revision: number;
  updatedAt: string | null;
  effective: {
    projectId: string | null;
    availability: "none" | "active" | "unavailable";
    reason: string | null;
  };
}

function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("项目关联响应无效");
  return value as Record<string, unknown>;
}

export function parseFriendInteractionProject(value: unknown): FriendInteractionProject {
  const body = obj(value);
  const effective = obj(body.effective);
  if (body.status !== "unset" && body.status !== "set") throw new Error("项目关联状态无效");
  if (body.projectId !== null && typeof body.projectId !== "string") throw new Error("项目关联 projectId 无效");
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error("项目关联 revision 无效");
  const availability = effective.availability;
  if (availability !== "none" && availability !== "active" && availability !== "unavailable") throw new Error("项目关联可用性无效");
  return {
    longAgentId: typeof body.longAgentId === "string" ? body.longAgentId : "",
    status: body.status,
    projectId: (body.projectId as string | null) ?? null,
    revision: Number(body.revision),
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
    effective: {
      projectId: effective.projectId === null || effective.projectId === undefined ? null : String(effective.projectId),
      availability,
      reason: effective.reason === null || effective.reason === undefined ? null : String(effective.reason),
    },
  };
}

async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: workflowRequestSignal(signal),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload ? String((payload as { message: unknown }).message) : `请求失败（${String(response.status)}）`;
    throw new Error(message);
  }
  return payload;
}

export async function fetchFriendInteractionProject(agentId: string, signal?: AbortSignal): Promise<FriendInteractionProject> {
  return parseFriendInteractionProject(await request(`/api/long-agents/${encodeURIComponent(agentId)}/interaction-project`, { method: "GET" }, signal));
}

export async function saveFriendInteractionProject(agentId: string, input: { projectId: string | null; expectedRevision: number }, signal?: AbortSignal): Promise<FriendInteractionProject> {
  return parseFriendInteractionProject(await request(`/api/long-agents/${encodeURIComponent(agentId)}/interaction-project`, {
    method: "PUT", body: JSON.stringify(input),
  }, signal));
}

/** True when a response still belongs to the Friend currently selected (slow-response guard). */
export function isFriendInteractionResponseCurrent(targetAgentId: string, currentAgentId: string | null): boolean {
  return currentAgentId !== null && targetAgentId === currentAgentId;
}

export type FriendProjectSendState = "ready" | "loading" | "unavailable";

/**
 * Whether a new private turn may be sent. A missing association means the client has not loaded the
 * authoritative value yet, so sending without a revision is refused instead of silently bypassing it.
 */
export function friendProjectSendState(state: FriendInteractionProject | null): FriendProjectSendState {
  if (state === null) return "loading";
  if (state.effective.availability === "unavailable") return "unavailable";
  return "ready";
}
