import { parseFriendWorkItem, type FriendWorkItem } from "./friend-work.ts";
import { workflowRequestSignal } from "./chat-workflow-browser.ts";
export type TaskSchedule =
  | { kind: "once"; at: string }
  | { kind: "cron"; expression: string }
  | { kind: "event"; source: string };
export interface TaskDeliverable {
  kind: "post" | "note";
  slot: string;
  audience?: "friends" | "self";
}
export interface TaskDefinition {
  name: string;
  prompt: string;
  contextProjectId: string | null;
  timeZone: string;
  schedule: TaskSchedule;
  missed: "skip" | "latest";
  overlap: "skip" | "queue-one";
  deliverable?: TaskDeliverable;
}
export interface FriendTask extends TaskDefinition {
  id: string;
  longAgentId: string;
  revision: number;
  status: "active" | "paused" | "cancelled";
  createdAt: string;
  updatedAt: string;
  legacyId?: string;
  migrationNote?: string;
  /** Set when this task drives an LA3 duty; such tasks are managed from the duty page. */
  dutyId?: string;
  projection: {
    taskId: string;
    revision: number;
    nextAt: string | null;
  } | null;
}
export interface TaskOccurrence {
  id: string;
  taskId: string;
  revision: number;
  source: "time" | "event" | "manual";
  scheduledAt: string;
  state: "accepted" | "started" | "skipped" | "blocked";
  reason: string | null;
  workId: string | null;
  work: FriendWorkItem | null;
}
export interface FriendTasks {
  schemaVersion: 2;
  longAgentId: string;
  migration: "pending" | "complete";
  projectionError: string | null;
  tasks: FriendTask[];
  occurrences: TaskOccurrence[];
  applied?: boolean;
}
function obj(v: unknown): asserts v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("任务响应无效");
}
function text(v: unknown): string {
  if (typeof v !== "string" || !v) throw new Error("任务文字无效");
  return v;
}
function integer(v: unknown): number {
  if (!Number.isSafeInteger(v) || Number(v) < 1)
    throw new Error("任务版本无效");
  return Number(v);
}
function date(v: unknown): string {
  const s = text(v);
  if (!Number.isFinite(Date.parse(s))) throw new Error("任务时间无效");
  return s;
}
function nullable(v: unknown): string | null {
  return v === null ? null : text(v);
}
function keys(v: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    throw new Error("未知任务响应字段");
}
export function parseFriendTasks(v: unknown, agentId: string): FriendTasks {
  obj(v);
  keys(v, [
    "schemaVersion",
    "longAgentId",
    "migration",
    "projectionError",
    "tasks",
    "occurrences",
    "applied",
  ]);
  if (
    v.schemaVersion !== 2 ||
    v.longAgentId !== agentId ||
    !["pending", "complete"].includes(String(v.migration)) ||
    !Array.isArray(v.tasks) ||
    !Array.isArray(v.occurrences) ||
    (v.applied !== undefined && typeof v.applied !== "boolean")
  )
    throw new Error("任务身份或版本无效");
  const tasks: FriendTask[] = v.tasks.map((raw) => {
    obj(raw);
    keys(raw, [
      "id",
      "longAgentId",
      "revision",
      "status",
      "createdAt",
      "updatedAt",
      "legacyId",
      "migrationNote",
      "name",
      "prompt",
      "contextProjectId",
      "timeZone",
      "schedule",
      "missed",
      "overlap",
      "deliverable",
      "dutyId",
      "projection",
    ]);
    if (
      raw.longAgentId !== agentId ||
      !["active", "paused", "cancelled"].includes(String(raw.status)) ||
      !["skip", "latest"].includes(String(raw.missed)) ||
      !["skip", "queue-one"].includes(String(raw.overlap))
    )
      throw new Error("任务状态无效");
    obj(raw.schedule);
    const s = raw.schedule;
    let schedule: TaskSchedule;
    if (s.kind === "once") {
      keys(s, ["kind", "at"]);
      schedule = { kind: "once", at: date(s.at) };
    } else if (s.kind === "cron") {
      keys(s, ["kind", "expression"]);
      schedule = { kind: "cron", expression: text(s.expression) };
    } else if (s.kind === "event") {
      keys(s, ["kind", "source"]);
      schedule = { kind: "event", source: text(s.source) };
    } else throw new Error("任务触发类型无效");
    let deliverable: TaskDeliverable | undefined;
    if (raw.deliverable !== undefined) {
      obj(raw.deliverable);
      const d = raw.deliverable;
      keys(d, d.kind === "post" ? ["kind", "slot", "audience"] : ["kind", "slot"]);
      if ((d.kind !== "post" && d.kind !== "note") || typeof d.slot !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(d.slot))
        throw new Error("产物任务配置无效");
      if (d.kind === "post" && d.audience !== undefined && d.audience !== "friends" && d.audience !== "self")
        throw new Error("产物受众无效");
      deliverable = {
        kind: d.kind,
        slot: d.slot,
        ...(d.kind === "post" ? { audience: (d.audience as "friends" | "self" | undefined) ?? "friends" } : {}),
      };
    }
    let projection: FriendTask["projection"] = null;
    if (raw.projection !== null) {
      obj(raw.projection);
      const p = raw.projection;
      keys(p, ["taskId", "revision", "nextAt"]);
      if (p.taskId !== raw.id || p.revision !== raw.revision)
        throw new Error("任务投影归属无效");
      projection = {
        taskId: text(p.taskId),
        revision: integer(p.revision),
        nextAt: p.nextAt === null ? null : date(p.nextAt),
      };
    }
    const timeZone = text(raw.timeZone);
    new Intl.DateTimeFormat("en", { timeZone });
    return {
      id: text(raw.id),
      longAgentId: agentId,
      revision: integer(raw.revision),
      name: text(raw.name),
      prompt: text(raw.prompt),
      contextProjectId: nullable(raw.contextProjectId),
      timeZone,
      schedule,
      status: raw.status as FriendTask["status"],
      missed: raw.missed as FriendTask["missed"],
      overlap: raw.overlap as FriendTask["overlap"],
      createdAt: date(raw.createdAt),
      updatedAt: date(raw.updatedAt),
      ...(deliverable === undefined ? {} : { deliverable }),
      projection,
      ...(raw.migrationNote === undefined
        ? {}
        : { migrationNote: text(raw.migrationNote) }),
      ...(raw.dutyId === undefined ? {} : { dutyId: text(raw.dutyId) }),
      ...(raw.legacyId === undefined ? {} : { legacyId: text(raw.legacyId) }),
    };
  });
  const occurrences: TaskOccurrence[] = v.occurrences.map((raw) => {
    obj(raw);
    keys(raw, [
      "id",
      "taskId",
      "revision",
      "source",
      "scheduledAt",
      "state",
      "reason",
      "workId",
      "work",
    ]);
    if (
      !tasks.some((t) => t.id === raw.taskId) ||
      !["time", "event", "manual"].includes(String(raw.source)) ||
      !["accepted", "started", "skipped", "blocked"].includes(String(raw.state))
    )
      throw new Error("任务执行归属或状态无效");
    const work =
      raw.work === null ? null : parseFriendWorkItem(raw.work, agentId);
    if (work && work.work.id !== raw.workId)
      throw new Error("任务工作引用不匹配");
    return {
      id: text(raw.id),
      taskId: text(raw.taskId),
      revision: integer(raw.revision),
      source: raw.source as TaskOccurrence["source"],
      scheduledAt: date(raw.scheduledAt),
      state: raw.state as TaskOccurrence["state"],
      reason: nullable(raw.reason),
      workId: nullable(raw.workId),
      work,
    };
  });
  return {
    schemaVersion: 2,
    longAgentId: agentId,
    migration: v.migration as FriendTasks["migration"],
    projectionError: nullable(v.projectionError),
    tasks,
    occurrences,
    ...(typeof v.applied === "boolean" ? { applied: v.applied } : {}),
  };
}
export interface TaskCommand {
  operation:
    | "create"
    | "update"
    | "pause"
    | "resume"
    | "cancel"
    | "run"
    | "cancel-run";
  taskId?: string;
  expectedRevision?: number;
  requestId?: string;
  definition?: TaskDefinition;
  occurrenceId?: string;
  expectedTurnId?: string;
}
export class TaskRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export function readPendingTaskCommand(agentId: string): TaskCommand | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`chat.task-command.${agentId}`) ?? "null",
    );
    obj(value);
    if (value.operation !== "create" && value.operation !== "run") return null;
    text(value.requestId);
    return value as unknown as TaskCommand;
  } catch {
    return null;
  }
}
export function savePendingTaskCommand(
  agentId: string,
  command: TaskCommand | null,
): void {
  const key = `chat.task-command.${agentId}`;
  if (
    command &&
    (command.operation === "create" || command.operation === "run")
  )
    sessionStorage.setItem(key, JSON.stringify(command));
  else sessionStorage.removeItem(key);
}
export async function requestFriendTasks(
  agentId: string,
  command?: TaskCommand,
  signal?: AbortSignal,
): Promise<FriendTasks> {
  const response = await fetch(
    `/api/long-agents/${encodeURIComponent(agentId)}/tasks`,
    {
      cache: "no-store",
      signal: workflowRequestSignal(signal),
      ...(command
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ schemaVersion: 2, ...command }),
          }
        : {}),
    },
  );
  const value: unknown = await response.json();
  obj(value);
  if (!response.ok)
    throw new TaskRequestError(
      typeof value.statusMessage === "string"
        ? value.statusMessage
        : typeof value.message === "string"
          ? value.message
          : `HTTP ${response.status}`,
      response.status,
    );
  return parseFriendTasks(value, agentId);
}
