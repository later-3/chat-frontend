import { workflowRequestSignal } from "./chat-workflow-browser.ts";
export type ArtifactKind = "post" | "note";
export type ArtifactState = "pending" | "committed" | "failed";
export type ArtifactWorkspaceState = "clean" | "older" | "edited" | "missing";
export interface ArtifactNoteConflict {
  /** 外部修改来自用户可见的笔记文件，还是版本文件本身。 */
  source: "workspace" | "version-file";
  contentHash: string;
  content: string;
  preservedFile: string | null;
  at: string;
}
export interface ArtifactNoteStore {
  versionFile: string;
  pointerFile: string;
  workspacePath: string;
  workspaceHash: string | null;
  workspaceState: ArtifactWorkspaceState;
  conflict: ArtifactNoteConflict | null;
  conflictResolution: "user" | "generated" | null;
}
export type ArtifactAudience = "friends" | "self";
export interface FriendArtifact {
  id: string;
  artifactKey: string;
  longAgentId: string;
  kind: ArtifactKind;
  slot: string;
  date: string;
  taskId: string | null;
  occurrenceId: string | null;
  workId: string | null;
  dutyId: string | null;
  goalRevision: number | null;
  progressEntryId: string | null;
  state: ArtifactState;
  revision: number;
  contentHash: string;
  content: string;
  target: { kind: "file"; path: string } | { kind: "social"; audience: ArtifactAudience };
  resourceId: string | null;
  notePath: string | null;
  audience: ArtifactAudience | null;
  provenance: { materials: string[] };
  attempts: number;
  /** False when retrying cannot succeed: authorization changed or a newer version owns the target. */
  retryable: boolean;
  failure: string | null;
  createdAt: string;
  updatedAt: string;
  revisions: { revision: number; contentHash: string; origin: "generated" | "user"; versionFile: string | null; at: string }[];
  /** 笔记的不可变版本与工作区状态；post 或旧记录为 null。 */
  note: ArtifactNoteStore | null;
}
export interface FriendArtifacts {
  schemaVersion: 1;
  longAgentId: string;
  artifacts: FriendArtifact[];
  pending: number;
  /** 最近一次操作的附加结果（目前只有导出到新文件的路径）。 */
  operationResult: { path: string; relativePath: string } | null;
}
function obj(v: unknown): asserts v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("产物响应无效");
}
function text(v: unknown, max = 1024): string {
  if (typeof v !== "string" || !v || v.length > max) throw new Error("产物字段无效");
  return v;
}
function nullable(v: unknown, max = 1024): string | null {
  return v === null || v === undefined ? null : text(v, max);
}
function keys(v: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(v).some((k) => !allowed.includes(k))) throw new Error("未知产物响应字段");
}
function parseArtifact(v: unknown, agentId: string): FriendArtifact {
  obj(v);
  keys(v, [
    "id", "artifactKey", "longAgentId", "kind", "slot", "date", "taskId", "occurrenceId", "workId", "dutyId",
    "goalRevision", "progressEntryId", "state", "revision", "contentHash", "content", "target", "resourceId",
    "notePath", "audience", "provenance", "attempts", "retryable", "failure", "createdAt", "updatedAt", "revisions", "note",
  ]);
  if (
    v.longAgentId !== agentId ||
    !["post", "note"].includes(String(v.kind)) ||
    !["pending", "committed", "failed"].includes(String(v.state)) ||
    v.audience !== null && v.audience !== undefined && !["friends", "self"].includes(String(v.audience))
  )
    throw new Error("产物身份或状态无效");
  obj(v.target);
  let target: FriendArtifact["target"];
  if (v.target.kind === "file") target = { kind: "file", path: text(v.target.path, 1024) };
  else if (v.target.kind === "social") target = { kind: "social", audience: v.target.audience === "self" ? "self" : "friends" };
  else throw new Error("产物目标无效");
  obj(v.provenance);
  if (!Array.isArray(v.provenance.materials)) throw new Error("产物来源无效");
  return {
    id: text(v.id, 128),
    artifactKey: text(v.artifactKey, 128),
    longAgentId: agentId,
    kind: v.kind as ArtifactKind,
    slot: text(v.slot, 40),
    date: text(v.date, 10),
    taskId: nullable(v.taskId, 200),
    occurrenceId: nullable(v.occurrenceId, 200),
    workId: nullable(v.workId, 200),
    dutyId: nullable(v.dutyId, 200),
    goalRevision: v.goalRevision === null || v.goalRevision === undefined ? null : Number(v.goalRevision),
    progressEntryId: nullable(v.progressEntryId, 200),
    state: v.state as ArtifactState,
    revision: Number(v.revision),
    contentHash: text(v.contentHash, 128),
    content: typeof v.content === "string" ? v.content : "",
    target,
    resourceId: nullable(v.resourceId),
    notePath: nullable(v.notePath),
    audience: v.audience === undefined ? null : (v.audience as ArtifactAudience | null),
    provenance: { materials: (v.provenance.materials as unknown[]).map((m) => text(m)) },
    attempts: Number(v.attempts),
    retryable: v.retryable !== false,
    failure: nullable(v.failure, 2000),
    createdAt: text(v.createdAt, 64),
    updatedAt: text(v.updatedAt, 64),
    revisions: (() => {
      if (!Array.isArray(v.revisions)) throw new Error("产物修订记录无效");
      return (v.revisions as unknown[]).map((item) => {
        obj(item);
        keys(item, ["revision", "contentHash", "at", "resourceId", "content", "origin", "versionFile"]);
        return {
          revision: Number(item.revision),
          contentHash: text(item.contentHash, 128),
          origin: item.origin === "user" ? "user" as const : "generated" as const,
          versionFile: nullable(item.versionFile) ?? nullable(item.resourceId),
          at: text(item.at, 64),
        };
      });
    })(),
    note: (() => {
      if (v.note === null || v.note === undefined) return null;
      obj(v.note);
      keys(v.note, ["versionFile", "pointerFile", "workspacePath", "workspaceHash", "workspaceState", "conflict", "conflictResolution"]);
      if (!["clean", "older", "edited", "missing"].includes(String(v.note.workspaceState)))
        throw new Error("笔记工作区状态无效");
      const conflict = v.note.conflict === null || v.note.conflict === undefined ? null : (() => {
        obj(v.note.conflict);
        keys(v.note.conflict, ["source", "contentHash", "content", "preservedFile", "at"]);
        return {
          source: v.note.conflict.source === "version-file" ? "version-file" as const : "workspace" as const,
          contentHash: text(v.note.conflict.contentHash, 128),
          content: typeof v.note.conflict.content === "string" ? v.note.conflict.content : "",
          preservedFile: nullable(v.note.conflict.preservedFile),
          at: text(v.note.conflict.at, 64),
        };
      })();
      return {
        versionFile: text(v.note.versionFile),
        pointerFile: text(v.note.pointerFile),
        workspacePath: text(v.note.workspacePath),
        workspaceHash: nullable(v.note.workspaceHash, 128),
        workspaceState: v.note.workspaceState as ArtifactWorkspaceState,
        conflict,
        conflictResolution: v.note.conflictResolution === "user" || v.note.conflictResolution === "generated" ? v.note.conflictResolution : null,
      };
    })(),
  };
}
export function parseFriendArtifacts(v: unknown, agentId: string): FriendArtifacts {
  obj(v);
  keys(v, ["schemaVersion", "longAgentId", "artifacts", "pending", "operationResult"]);
  if (v.schemaVersion !== 1 || v.longAgentId !== agentId || !Array.isArray(v.artifacts))
    throw new Error("产物响应版本无效");
  return {
    schemaVersion: 1,
    longAgentId: agentId,
    artifacts: (v.artifacts as unknown[]).map((artifact) => parseArtifact(artifact, agentId)),
    pending: Number(v.pending ?? 0),
    operationResult: (() => {
      if (v.operationResult === null || v.operationResult === undefined) return null;
      obj(v.operationResult);
      keys(v.operationResult, ["path", "relativePath"]);
      return { path: text(v.operationResult.path), relativePath: text(v.operationResult.relativePath) };
    })(),
  };
}
export class ArtifactRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function requestFriendArtifacts(
  agentId: string,
  command?: {
    operation: "resubmit" | "revise" | "notify" | "list" | "resolve" | "export";
    artifactId?: string;
    content?: string;
    choice?: "user" | "generated";
    path?: string;
    from?: string;
    to?: string;
  },
  signal?: AbortSignal,
): Promise<FriendArtifacts> {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(agentId)}/artifacts`, {
    cache: "no-store",
    signal: workflowRequestSignal(signal),
    ...(command
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, ...command }) }
      : {}),
  });
  const value: unknown = await response.json();
  obj(value);
  if (!response.ok)
    throw new ArtifactRequestError(
      typeof value.statusMessage === "string" ? value.statusMessage : `HTTP ${response.status}`,
      response.status,
    );
  return parseFriendArtifacts(value, agentId);
}
