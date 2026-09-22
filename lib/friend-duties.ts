import { parseFriendWorkItem, type FriendWorkItem } from "./friend-work.ts";
import { workflowRequestSignal } from "./chat-workflow-browser.ts";
export type DutyCadence = { kind: "cron"; expression: string } | { kind: "none" };
export interface DutyDefinition {
  name: string;
  objective: string;
  materials: string[];
  contextProjectId: string | null;
  outcome: string;
  timeZone: string;
  cadence: DutyCadence;
  allowedHours: { start: number; end: number } | null;
  budget: { tokensPerDay: number } | null;
  totalUnits: number | null;
}
export interface DutyEvidence {
  kind: "file" | "work" | "note";
  path?: string;
  workId?: string;
  text?: string;
}
export interface DutyProgressEntry {
  id: string;
  advancementKey: string;
  payloadHash: string;
  at: string;
  source: "agent" | "user";
  goalRevision: number;
  applied: boolean;
  summary: string;
  evidence: DutyEvidence[];
  unitsDone: number | null;
  nextStep: string | null;
  nextCheckAt: string | null;
  superseded: boolean;
}
export interface DutyAdvancement {
  advancementKey: string;
  workId: string;
  goalRevision: number;
  status: "completed" | "failed" | "cancelled" | "interrupted";
  tokens: number;
  at: string;
  superseded: boolean;
}
export interface DutyOccurrence {
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
export interface FriendDuty extends DutyDefinition {
  id: string;
  longAgentId: string;
  revision: number;
  goalRevision: number;
  status: "active" | "paused" | "ended";
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  taskId: string | null;
  nextStep: string | null;
  nextCheckAt: string | null;
  awaitingMaterial: boolean;
  unitsDone: number | null;
  percent: number | null;
  tokensToday: number;
  budgetExhausted: boolean | null;
  progress: DutyProgressEntry[];
  advancements: DutyAdvancement[];
  linkedTask: {
    id: string;
    revision: number;
    status: "active" | "paused" | "cancelled";
    projection: { taskId: string; revision: number; nextAt: string | null } | null;
  } | null;
  linkedOccurrences: DutyOccurrence[];
}
export interface FriendDuties {
  schemaVersion: 1;
  longAgentId: string;
  projectionError: string | null;
  duties: FriendDuty[];
  applied?: boolean;
  syncError?: string;
}
function obj(v: unknown): asserts v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("职责响应无效");
}
function text(v: unknown, max = 65536): string {
  if (typeof v !== "string" || !v || v.length > max) throw new Error("职责文字无效");
  return v;
}
function integer(v: unknown): number {
  if (!Number.isSafeInteger(v) || Number(v) < 1) throw new Error("职责版本无效");
  return Number(v);
}
function date(v: unknown): string {
  const s = text(v);
  if (!Number.isFinite(Date.parse(s))) throw new Error("职责时间无效");
  return s;
}
function nullable(v: unknown): string | null {
  return v === null ? null : text(v);
}
function nullableInt(v: unknown): number | null {
  if (v === null) return null;
  if (!Number.isSafeInteger(v) || Number(v) < 0) throw new Error("完成量无效");
  return Number(v);
}
function keys(v: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(v).some((k) => !allowed.includes(k))) throw new Error("未知职责响应字段");
}
function parseEvidence(v: unknown): DutyEvidence {
  obj(v);
  if (v.kind === "file") {
    keys(v, ["kind", "path"]);
    return { kind: "file", path: text(v.path, 1024) };
  }
  if (v.kind === "work") {
    keys(v, ["kind", "workId"]);
    return { kind: "work", workId: text(v.workId) };
  }
  if (v.kind === "note") {
    keys(v, ["kind", "text"]);
    return { kind: "note", text: text(v.text, 2000) };
  }
  throw new Error("证据类型无效");
}
function parseOccurrence(v: unknown, agentId: string, dutyTaskIds: Set<string>): DutyOccurrence {
  obj(v);
  keys(v, ["id", "taskId", "revision", "source", "scheduledAt", "state", "reason", "workId", "work"]);
  if (
    !dutyTaskIds.has(text(v.taskId)) ||
    !["time", "event", "manual"].includes(String(v.source)) ||
    !["accepted", "started", "skipped", "blocked"].includes(String(v.state))
  )
    throw new Error("职责推进记录无效");
  const work = v.work === null ? null : parseFriendWorkItem(v.work, agentId);
  if (work && work.work.id !== v.workId) throw new Error("职责工作引用不匹配");
  return {
    id: text(v.id),
    taskId: text(v.taskId),
    revision: integer(v.revision),
    source: v.source as DutyOccurrence["source"],
    scheduledAt: date(v.scheduledAt),
    state: v.state as DutyOccurrence["state"],
    reason: nullable(v.reason),
    workId: nullable(v.workId),
    work,
  };
}
function parseDuty(v: unknown, agentId: string): FriendDuty {
  obj(v);
  keys(v, [
    "id",
    "longAgentId",
    "revision",
    "goalRevision",
    "status",
    "createdAt",
    "updatedAt",
    "endedAt",
    "taskId",
    "unitsDone",
    "nextStep",
    "nextCheckAt",
    "awaitingMaterial",
    "name",
    "objective",
    "materials",
    "contextProjectId",
    "outcome",
    "timeZone",
    "cadence",
    "allowedHours",
    "budget",
    "totalUnits",
    "unitsDone",
    "percent",
    "tokensToday",
    "budgetExhausted",
    "progress",
    "advancements",
    "linkedTask",
    "linkedOccurrences",
  ]);
  if (
    v.longAgentId !== agentId ||
    !["active", "paused", "ended"].includes(String(v.status)) ||
    typeof v.awaitingMaterial !== "boolean" ||
    typeof v.tokensToday !== "number" ||
    (v.budgetExhausted !== null && typeof v.budgetExhausted !== "boolean") ||
    !/^duty-[a-f0-9]{32}$/.test(String(v.id)) ||
    !Array.isArray(v.materials) ||
    !Array.isArray(v.progress) ||
    !Array.isArray(v.advancements)
  )
    throw new Error("职责身份或状态无效");
  obj(v.cadence);
  let cadence: DutyCadence;
  if (v.cadence.kind === "cron") {
    keys(v.cadence, ["kind", "expression"]);
    cadence = { kind: "cron", expression: text(v.cadence.expression, 120) };
  } else if (v.cadence.kind === "none") {
    keys(v.cadence, ["kind"]);
    cadence = { kind: "none" };
  } else throw new Error("推进节奏无效");
  let allowedHours: FriendDuty["allowedHours"] = null;
  if (v.allowedHours !== null) {
    obj(v.allowedHours);
    keys(v.allowedHours, ["start", "end"]);
    const start = v.allowedHours.start;
    const end = v.allowedHours.end;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      Number(start) < 0 ||
      Number(start) > 23 ||
      Number(end) < 1 ||
      Number(end) > 24
    )
      throw new Error("允许时段无效");
    allowedHours = { start: Number(start), end: Number(end) };
  }
  let budget: FriendDuty["budget"] = null;
  if (v.budget !== null) {
    obj(v.budget);
    keys(v.budget, ["tokensPerDay"]);
    const tokensPerDay = v.budget.tokensPerDay;
    if (!Number.isSafeInteger(tokensPerDay) || Number(tokensPerDay) < 1)
      throw new Error("预算无效");
    budget = { tokensPerDay: Number(tokensPerDay) };
  }
  let linkedTask: FriendDuty["linkedTask"] = null;
  if (v.linkedTask !== null) {
    obj(v.linkedTask);
    keys(v.linkedTask, ["id", "revision", "status", "projection"]);
    if (!["active", "paused", "cancelled"].includes(String(v.linkedTask.status)))
      throw new Error("职责推进任务无效");    let projection: NonNullable<FriendDuty["linkedTask"]>["projection"] = null;
    if (v.linkedTask.projection !== null) {
      const p = v.linkedTask.projection as Record<string, unknown>;
      keys(p, ["taskId", "revision", "nextAt"]);
      if (p.taskId !== v.linkedTask.id || p.revision !== v.linkedTask.revision)
        throw new Error("职责推进投影无效");
      projection = {
        taskId: text(p.taskId),
        revision: integer(p.revision),
        nextAt: p.nextAt === null ? null : date(p.nextAt),
      };
    }
    linkedTask = {
      id: text(v.linkedTask.id),
      revision: integer(v.linkedTask.revision),
      status: v.linkedTask.status as "active" | "paused" | "cancelled",
      projection,
    };
  }
  const duty: FriendDuty = {
    id: text(v.id),
    longAgentId: agentId,
    revision: integer(v.revision),
    goalRevision: integer(v.goalRevision),
    status: v.status as FriendDuty["status"],
    createdAt: date(v.createdAt),
    updatedAt: date(v.updatedAt),
    endedAt: v.endedAt === null ? null : date(v.endedAt),
    taskId: v.taskId === null ? null : text(v.taskId),
    nextStep: nullable(v.nextStep),
    nextCheckAt: v.nextCheckAt === null ? null : date(v.nextCheckAt),
    awaitingMaterial: v.awaitingMaterial,
    name: text(v.name, 120),
    objective: text(v.objective),
    materials: (v.materials as unknown[]).map((m) => text(m, 1024)),
    contextProjectId: nullable(v.contextProjectId),
    outcome: text(v.outcome),
    timeZone: text(v.timeZone, 64),    cadence,
    allowedHours,
    budget,
    totalUnits: nullableInt(v.totalUnits),
    unitsDone: nullableInt(v.unitsDone),
    percent:
      v.percent === null
        ? null
        : Number.isInteger(v.percent) && Number(v.percent) >= 0 && Number(v.percent) <= 100
          ? Number(v.percent)
          : (() => {
              throw new Error("百分比无效");
            })(),
    tokensToday: Number(v.tokensToday),
    budgetExhausted: v.budgetExhausted as boolean | null,
    progress: (v.progress as unknown[]).map((p) => {
      obj(p);
      keys(p, [
        "id",
        "advancementKey",
        "payloadHash",
        "at",
        "source",
        "goalRevision",
        "applied",
        "summary",
        "evidence",
        "unitsDone",
        "nextStep",
        "nextCheckAt",
        "superseded",
      ]);
      if (
        !["agent", "user"].includes(String(p.source)) ||
        typeof p.superseded !== "boolean" ||
        typeof p.applied !== "boolean"
      )
        throw new Error("进度记录无效");
      return {
        id: text(p.id),
        advancementKey: text(p.advancementKey),
        payloadHash: typeof p.payloadHash === "string" ? p.payloadHash : "",
        at: date(p.at),
        source: p.source as DutyProgressEntry["source"],
        goalRevision: integer(p.goalRevision),
        applied: p.applied,
        summary: text(p.summary, 20000),
        evidence: (p.evidence as unknown[]).map(parseEvidence),
        unitsDone: nullableInt(p.unitsDone),
        nextStep: nullable(p.nextStep),
        nextCheckAt: p.nextCheckAt === null ? null : date(p.nextCheckAt),
        superseded: p.superseded,
      };
    }),
    advancements: (v.advancements as unknown[]).map((a) => {
      obj(a);
      keys(a, ["advancementKey", "workId", "goalRevision", "status", "tokens", "at", "superseded"]);
      if (
        typeof a.superseded !== "boolean" ||
        !["completed", "failed", "cancelled", "interrupted"].includes(String(a.status)) ||
        !Number.isSafeInteger(a.tokens) ||
        Number(a.tokens) < 0
      )
        throw new Error("推进回执无效");
      return {
        advancementKey: text(a.advancementKey),
        workId: text(a.workId),
        goalRevision: integer(a.goalRevision),
        status: a.status as DutyAdvancement["status"],
        tokens: Number(a.tokens),
        at: date(a.at),
        superseded: a.superseded,
      };
    }),
    linkedTask,
    linkedOccurrences: [],
  };
  const dutyTaskIds = new Set(duty.linkedTask ? [duty.linkedTask.id] : []);
  duty.linkedOccurrences = (v.linkedOccurrences as unknown[]).map((o) => parseOccurrence(o, agentId, dutyTaskIds));
  return duty;
}
export function parseFriendDuties(v: unknown, agentId: string): FriendDuties {
  obj(v);
  keys(v, ["schemaVersion", "longAgentId", "projectionError", "duties", "applied", "syncError"]);
  if (v.schemaVersion !== 1 || v.longAgentId !== agentId || !Array.isArray(v.duties))
    throw new Error("职责响应版本无效");
  return {
    schemaVersion: 1,
    longAgentId: agentId,
    projectionError: nullable(v.projectionError),
    duties: (v.duties as unknown[]).map((d) => parseDuty(d, agentId)),
    ...(typeof v.applied === "boolean" ? { applied: v.applied } : {}),
    ...(v.syncError === undefined ? {} : { syncError: text(v.syncError, 2000) }),
  };
}
export type DutyCommand = {
  operation: "create" | "update" | "pause" | "resume" | "end" | "advance" | "cancel-advance" | "report";
  dutyId?: string;
  expectedRevision?: number;
  requestId?: string;
  definition?: DutyDefinition;
  report?: {
    summary: string;
    evidence: DutyEvidence[];
    unitsDone: number | null;
    nextStep: string | null;
    nextCheckAt: string | null;
    awaitingMaterial: boolean;
  };
  occurrenceId?: string;
  expectedTurnId?: string;
};
export class DutyRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export function readPendingDutyCommand(agentId: string): DutyCommand | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(`chat.duty-command.${agentId}`) ?? "null");
    obj(value);
    if (value.operation !== "create" && value.operation !== "advance") return null;
    text(value.requestId as unknown);
    return value as unknown as DutyCommand;
  } catch {
    return null;
  }
}
export function savePendingDutyCommand(agentId: string, command: DutyCommand | null): void {
  const key = `chat.duty-command.${agentId}`;
  if (command && (command.operation === "create" || command.operation === "advance"))
    sessionStorage.setItem(key, JSON.stringify(command));
  else sessionStorage.removeItem(key);
}
export async function requestFriendDuties(
  agentId: string,
  command?: DutyCommand,
  signal?: AbortSignal,
): Promise<FriendDuties> {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(agentId)}/duties`, {
    cache: "no-store",
    signal: workflowRequestSignal(signal),
    ...(command
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schemaVersion: 1, ...command }),
        }
      : {}),
  });
  const value: unknown = await response.json();
  obj(value);
  if (!response.ok)
    throw new DutyRequestError(
      typeof value.statusMessage === "string"
        ? value.statusMessage
        : typeof value.message === "string"
          ? value.message
          : `HTTP ${response.status}`,
      response.status,
    );
  return parseFriendDuties(value, agentId);
}
