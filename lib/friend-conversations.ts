import { workflowRequestSignal } from "./chat-workflow-browser.ts";

/**
 * Browser client for group conversations (LA5 D).
 *
 * The Backend owns every fact: the browser can only call the owner-facing conversation API and must
 * validate each response shape before using it. No identity is ever sent — the API derives the owner
 * entry server-side — so this client cannot widen access by adding parameters.
 */

export interface ConversationMemberSummary {
  longAgentId: string;
  participationEpoch: number;
  active: boolean;
  joinedAt: string;
  revokedAt: string | null;
  hasParticipationSession: boolean;
  /** Owner-facing only: the member's participation Session, openable as read-only full history. */
  sessionId: string | null;
  grants: { systemToolAddresses: string[]; nativeTools: string[]; extensionTools: string[] };
}

export interface ConversationSummary {
  schemaVersion: 1;
  id: string;
  title: string;
  storageProjectId: string;
  collaborationProjectId: string | null;
  /** The group's public root Session: raw record holds user messages plus publication references. */
  publicSessionId: string;
  lifecycle: "active" | "archived";
  revision: number;
  authorizationRevision: number;
  policy: { defaultPolicy: string; moderatorLongAgentId: string | null; roundRobinOrder: string[] };
  budget: Record<string, number>;
  members: ConversationMemberSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDiscussion {
  discussionId: string;
  policy: string;
  round: number;
  status: string;
  stopReason: string | null;
  modelCalls: number;
  attempts: { attemptId: string; speakerLongAgentId: string; status: string; reason: string | null; publicationId: string | null }[];
}

export interface ConversationWork {
  workId: string;
  title: string;
  status: string;
  publicationId: string | null;
  error: string | null;
}

export interface ConversationPublicMessage {
  entryId: string;
  cursor: number;
  seq: number;
  authorLongAgentId: string;
  /** External human sender display name; null for the owner and Friends. */
  authorDisplayName: string | null;
  /** True when the message came from an external channel and is data, not the owner's instruction. */
  external: boolean;
  publicationId: string | null;
  text: string | null;
  unavailableReason: string | null;
  postedAt: string;
}

function obj(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}无效`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`${label}无效`);
  return value;
}
function nullableText(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : text(value, label);
}
function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label}无效`);
  return value as number;
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label}无效`);
  return value as string[];
}

export function parseConversationSummary(value: unknown): ConversationSummary {
  const body = obj(value, "群响应");
  const policy = obj(body.policy, "群策略");
  const budget = obj(body.budget, "群预算");
  if (!Array.isArray(body.members)) throw new Error("群成员无效");
  return {
    schemaVersion: 1,
    id: text(body.id, "群 id"),
    title: text(body.title, "群名称"),
    storageProjectId: text(body.storageProjectId, "存储 Project"),
    collaborationProjectId: nullableText(body.collaborationProjectId, "协作项目"),
    publicSessionId: text(body.publicSessionId, "公共根 Session"),
    lifecycle: body.lifecycle === "archived" ? "archived" : "active",
    revision: integer(body.revision, "群 revision"),
    authorizationRevision: integer(body.authorizationRevision, "授权修订"),
    policy: {
      defaultPolicy: text(policy.defaultPolicy, "默认策略"),
      moderatorLongAgentId: nullableText(policy.moderatorLongAgentId, "主持"),
      roundRobinOrder: strings(policy.roundRobinOrder, "圆桌顺序"),
    },
    budget: Object.fromEntries(Object.entries(budget).map(([key, entry]) => [key, integer(entry, `预算 ${key}`)])),
    members: body.members.map((member) => {
      const record = obj(member, "群成员");
      const grants = record.grants === undefined ? { systemToolAddresses: [], nativeTools: [], extensionTools: [] } : obj(record.grants, "成员授权");
      return {
        longAgentId: text(record.longAgentId, "成员 id"),
        participationEpoch: integer(record.participationEpoch, "参与期"),
        active: record.active === true,
        joinedAt: text(record.joinedAt, "加入时间"),
        revokedAt: nullableText(record.revokedAt, "退出时间"),
        hasParticipationSession: record.hasParticipationSession === true,
        sessionId: record.sessionId === undefined ? null : nullableText(record.sessionId, "成员 Session"),
        grants: {
          systemToolAddresses: strings(grants.systemToolAddresses ?? [], "系统 Tool 授权"),
          nativeTools: strings(grants.nativeTools ?? [], "原生 Tool 授权"),
          extensionTools: strings(grants.extensionTools ?? [], "扩展 Tool 授权"),
        },
      };
    }),
    createdAt: text(body.createdAt, "创建时间"),
    updatedAt: text(body.updatedAt, "更新时间"),
  };
}

export function parseConversationMessages(value: unknown): ConversationPublicMessage[] {
  const body = obj(value, "群消息响应");
  if (!Array.isArray(body.messages)) throw new Error("群消息列表无效");
  return body.messages.map((message) => {
    const record = obj(message, "群消息");
    return {
      entryId: text(record.entryId, "消息 id"),
      cursor: integer(record.cursor, "游标"),
      seq: integer(record.seq, "序号"),
      authorLongAgentId: text(record.authorLongAgentId, "作者"),
      authorDisplayName: nullableText(record.authorDisplayName, "发送者名称"),
      external: record.external === true,
      publicationId: nullableText(record.publicationId, "发布 id"),
      text: nullableText(record.text, "正文"),
      unavailableReason: nullableText(record.unavailableReason, "不可用原因"),
      postedAt: text(record.postedAt, "时间"),
    };
  }).sort((left, right) => left.cursor - right.cursor);
}

async function jsonRequest(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
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

const base = (agentId: string) => `/api/long-agents/${encodeURIComponent(agentId)}/conversations`;

export async function fetchConversations(agentId: string, projectId: string, signal?: AbortSignal): Promise<ConversationSummary[]> {
  const payload = await jsonRequest(`${base(agentId)}?storageProjectId=${encodeURIComponent(projectId)}`, { method: "GET" }, signal);
  const body = obj(payload, "群列表响应");
  if (!Array.isArray(body.conversations)) throw new Error("群列表无效");
  return body.conversations.map(parseConversationSummary).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createConversation(agentId: string, input: {
  storageProjectId: string; title: string; requestId: string; memberLongAgentIds: string[]; collaborationProjectId?: string | null;
}, signal?: AbortSignal): Promise<ConversationSummary> {
  return parseConversationSummary(await jsonRequest(base(agentId), { method: "POST", body: JSON.stringify(input) }, signal));
}

export async function fetchConversation(agentId: string, conversationId: string, signal?: AbortSignal): Promise<{ conversation: ConversationSummary; discussions: ConversationDiscussion[] }> {
  const body = obj(await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}`, { method: "GET" }, signal), "群详情响应");
  return {
    conversation: parseConversationSummary(body),
    discussions: Array.isArray(body.discussions) ? body.discussions.map((item) => {
      const record = obj(item, "讨论");
      return {
        discussionId: text(record.discussionId, "讨论 id"),
        policy: text(record.policy, "策略"),
        round: integer(record.round, "轮次"),
        status: text(record.status, "状态"),
        stopReason: nullableText(record.stopReason, "终止原因"),
        modelCalls: integer(record.modelCalls, "模型调用"),
        attempts: Array.isArray(record.attempts) ? record.attempts.map((attempt) => {
          const entry = obj(attempt, "发言尝试");
          return {
            attemptId: text(entry.attemptId, "尝试 id"),
            speakerLongAgentId: text(entry.speakerLongAgentId, "发言人"),
            status: text(entry.status, "尝试状态"),
            reason: nullableText(entry.reason, "原因"),
            publicationId: nullableText(entry.publicationId, "发布 id"),
          };
        }) : [],
      };
    }) : [],
  };
}

export async function fetchConversationMessages(agentId: string, conversationId: string, signal?: AbortSignal): Promise<ConversationPublicMessage[]> {
  return parseConversationMessages(await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}/messages`, { method: "GET" }, signal));
}

export async function sendConversationMessage(agentId: string, conversationId: string, input: { clientMessageId: string; text: string }, signal?: AbortSignal): Promise<boolean> {
  const payload = await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}/messages`, { method: "POST", body: JSON.stringify(input) }, signal);
  return obj(payload, "消息响应").created === true;
}

export async function startConversationRound(agentId: string, conversationId: string, input: {
  policy: "mention" | "round-robin" | "parallel" | "moderator" | "free"; targets?: string[];
}, signal?: AbortSignal): Promise<string> {
  const payload = await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}/discussions`, { method: "POST", body: JSON.stringify(input) }, signal);
  return text(obj(payload, "讨论响应").discussionId, "讨论 id");
}

export async function startConversationConsultation(agentId: string, conversationId: string, input: {
  fromLongAgentId: string; toLongAgentId: string; question: string;
}, signal?: AbortSignal): Promise<string> {
  const payload = await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}/consult`, { method: "POST", body: JSON.stringify(input) }, signal);
  return text(obj(payload, "请教响应").discussionId, "讨论 id");
}

export async function fetchConversationWorks(agentId: string, conversationId: string, signal?: AbortSignal): Promise<ConversationWork[]> {
  const body = obj(await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}/works`, { method: "GET" }, signal), "群任务响应");
  if (!Array.isArray(body.works)) throw new Error("群任务列表无效");
  return body.works.map((work) => {
    const record = obj(work, "群任务");
    return {
      workId: text(record.workId, "任务 id"),
      title: text(record.title, "任务名称"),
      status: text(record.status, "任务状态"),
      publicationId: nullableText(record.publicationId, "结果引用"),
      error: nullableText(record.error, "任务错误"),
    };
  });
}

export async function startConversationWork(agentId: string, conversationId: string, input: {
  requestId: string; title: string; instruction: string; longAgentId: string; originEntryId?: string | null;
}, signal?: AbortSignal): Promise<void> {
  await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}/works`, { method: "POST", body: JSON.stringify({ action: "start", ...input }) }, signal);
}

export async function cancelConversationWork(agentId: string, conversationId: string, workId: string, signal?: AbortSignal): Promise<void> {
  await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}/works`, { method: "POST", body: JSON.stringify({ action: "cancel", workId }) }, signal);
}

export async function updateConversation(agentId: string, conversationId: string, input: {
  expectedRevision: number; title?: string; collaborationProjectId?: string | null; policy?: { defaultPolicy: string; moderatorLongAgentId: string | null; roundRobinOrder: string[] };
}, signal?: AbortSignal): Promise<ConversationSummary> {
  return parseConversationSummary(await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}`, { method: "PATCH", body: JSON.stringify(input) }, signal));
}

export async function setConversationMember(agentId: string, conversationId: string, input: {
  action: "add" | "revoke" | "rejoin" | "setGrants"; expectedRevision: number; longAgentId?: string; memberLongAgentIds?: string[];
}, signal?: AbortSignal): Promise<ConversationSummary> {
  return parseConversationSummary(await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}/members`, { method: "POST", body: JSON.stringify(input) }, signal));
}

export async function archiveConversation(agentId: string, conversationId: string, expectedRevision: number, signal?: AbortSignal): Promise<ConversationSummary> {
  return parseConversationSummary(await jsonRequest(`${base(agentId)}/${encodeURIComponent(conversationId)}/archive`, { method: "POST", body: JSON.stringify({ expectedRevision }) }, signal));
}
