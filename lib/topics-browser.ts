import { workflowRequestSignal } from "./chat-workflow-browser.ts";
import type { AgentMessage, ChatTopicRelayProvenance } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Chat返回了无效${label}`);
  return value;
}
function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`Chat返回了无效${label}`);
  return value;
}
function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Chat返回了无效${label}`);
  return value;
}
function bodyOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
function address(value: unknown, label: string): TopicMemoryAddress {
  if (!isRecord(value) || typeof value.storageProjectId !== "string" || typeof value.sessionId !== "string" || typeof value.entryId !== "string")
    throw new Error(`Chat返回了无效${label}`);
  return { storageProjectId: value.storageProjectId, sessionId: value.sessionId, entryId: value.entryId };
}

export class TopicsRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export interface TopicMemoryAddress { readonly storageProjectId: string; readonly sessionId: string; readonly entryId: string }
export interface TopicNodeParentRef { readonly edgeId: string; readonly parentNodeId: string; readonly anchorEntryId: string | null; readonly anchorSequence: number | null }
export interface TopicNodeSummary {
  readonly nodeId: string; readonly sessionId: string; readonly title: string;
  readonly status: "active" | "archived" | "removed"; readonly readable: boolean;
  readonly frozenProjectContext: string | null; readonly sessionMemory: "on" | "off";
  /** The request that created this node: lets the UI resolve the node produced by an approved creation. */
  readonly createdByRequestId: string | null;
  readonly initialMemoryRefs: readonly { entryId: string; source: TopicMemoryAddress }[];
  readonly parents: readonly TopicNodeParentRef[];
}
export interface TopicSummary {
  readonly topicId: string; readonly title: string; readonly purpose: string;
  readonly status: "active" | "archived"; readonly rootSessionId: string; readonly createdAt: string;
  readonly nodes: readonly TopicNodeSummary[];
}
export interface TopicEdge { readonly edgeId: string; readonly parentNodeId: string; readonly childNodeId: string; readonly anchorEntryId: string | null; readonly anchorSequence: number | null }
export interface TopicDetail {
  readonly schemaVersion: 1; readonly revision: number;
  readonly topic: { readonly topicId: string; readonly title: string; readonly purpose: string; readonly status: string; readonly rootSessionId: string };
  readonly nodes: readonly (TopicNodeSummary & { readonly topicId: string })[];
  readonly edges: readonly TopicEdge[];
}
export interface TopicMessageRelay { readonly requestId: string; readonly relayedByLongAgentId: string }
/** Read the Chat-owned relay association off an already-structured message. */
export function topicMessageRelayOf(message: AgentMessage): TopicMessageRelay | null {
  const relay = (message as { chatTopicRelay?: ChatTopicRelayProvenance }).chatTopicRelay;
  if (relay === undefined || typeof relay.requestId !== "string") return null;
  return { requestId: relay.requestId, relayedByLongAgentId: typeof relay.relayedByLongAgentId === "string" ? relay.relayedByLongAgentId : "" };
}
export interface FriendTurnStatus { readonly id: string; readonly sessionId: string; readonly status: "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted"; readonly error: string | null; readonly messages?: readonly AgentMessage[] }
export interface TopicAnchor { readonly anchorEntryId: string; readonly anchorSequence: number; readonly turnId: string; readonly settledAt: string | null }
export interface TopicIntegrationState {
  readonly requestId: string; readonly topicId: string; readonly nodeId: string; readonly sessionId: string;
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted" | "unknown";
  readonly error: string | null;
}
export interface SessionMemoryEntry {
  readonly entryId: string; readonly purpose: string; readonly author: string; readonly content: string;
  readonly status: "active" | "superseded"; readonly updatedAt: string;
}

const base = (longAgentId: string) => `/api/long-agents/${encodeURIComponent(longAgentId)}/topics`;

async function requestJson(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store", ...init, signal: workflowRequestSignal(signal) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const candidate = isRecord(body) ? [body.statusMessage, body.message] : [];
    const message = candidate.find((value): value is string => typeof value === "string" && value.trim() !== "") ?? `HTTP ${response.status}`;
    throw new TopicsRequestError(message, response.status);
  }
  return body;
}

function parseNode(value: unknown, field: string): TopicNodeSummary & { topicId?: string } {
  if (!isRecord(value)) throw new Error(`Chat返回了无效${field}`);
  return {
    nodeId: text(value.nodeId, `${field}.nodeId`), sessionId: text(value.sessionId, `${field}.sessionId`),
    title: text(value.title, `${field}.title`),
    status: value.status === "archived" ? "archived" : value.status === "removed" ? "removed" : "active",
    readable: value.readable === undefined ? true : boolean(value.readable, `${field}.readable`),
    frozenProjectContext: optionalText(value.frozenProjectContext),
    sessionMemory: value.sessionMemory === "off" ? "off" : "on",
    createdByRequestId: optionalText(value.createdByRequestId),
    initialMemoryRefs: list(value.initialMemoryRefs, `${field}.initialMemoryRefs`).map((ref) => {
      if (!isRecord(ref) || typeof ref.entryId !== "string") throw new Error(`Chat返回了无效${field}.initialMemoryRefs`);
      return { entryId: ref.entryId, source: address(ref.source, `${field}.initialMemoryRefs.source`) };
    }),
    parents: (value.parents === undefined ? [] : list(value.parents, `${field}.parents`)).map((parent) => {
      if (!isRecord(parent)) throw new Error(`Chat返回了无效${field}.parents`);
      return {
        edgeId: text(parent.edgeId, `${field}.parents.edgeId`), parentNodeId: text(parent.parentNodeId, `${field}.parents.parentNodeId`),
        anchorEntryId: optionalText(parent.anchorEntryId),
        anchorSequence: parent.anchorSequence === null || parent.anchorSequence === undefined ? null : integer(parent.anchorSequence, `${field}.parents.anchorSequence`),
      };
    }),
  };
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Chat返回了无效${label}`);
  return value;
}

export async function fetchTopicGraph(longAgentId: string, signal?: AbortSignal): Promise<{ revision: number; topics: TopicSummary[] }> {
  const body = bodyOf(await requestJson(base(longAgentId), { method: "GET" }, signal));
  if (body.schemaVersion !== 1 || !Number.isSafeInteger(body.revision) || !Array.isArray(body.topics)) throw new Error("Chat返回了无效主题图");
  return {
    revision: body.revision as number,
    topics: body.topics.map((topic) => {
      if (!isRecord(topic)) throw new Error("Chat返回了无效主题");
      return {
        topicId: text(topic.topicId, "主题 topicId"), title: text(topic.title, "主题标题"),
        purpose: typeof topic.purpose === "string" ? topic.purpose : "",
        status: topic.status === "archived" ? "archived" : "active",
        rootSessionId: text(topic.rootSessionId, "主题根会话"),
        createdAt: typeof topic.createdAt === "string" ? topic.createdAt : "",
        nodes: list(topic.nodes, "主题节点").map((node) => parseNode(node, "主题节点") as TopicNodeSummary),
      };
    }),
  };
}

export async function fetchTopicDetail(longAgentId: string, topicId: string, signal?: AbortSignal): Promise<TopicDetail> {
  const body = bodyOf(await requestJson(`${base(longAgentId)}/${encodeURIComponent(topicId)}`, { method: "GET" }, signal));
  if (body.schemaVersion !== 1 || !Number.isSafeInteger(body.revision) || !isRecord(body.topic) || !Array.isArray(body.nodes) || !Array.isArray(body.edges))
    throw new Error("Chat返回了无效主题详情");
  return {
    schemaVersion: 1, revision: body.revision as number,
    topic: {
      topicId: text(body.topic.topicId, "主题 topicId"), title: text(body.topic.title, "主题标题"),
      purpose: typeof body.topic.purpose === "string" ? body.topic.purpose : "",
      status: text(body.topic.status, "主题状态"), rootSessionId: text(body.topic.rootSessionId, "主题根会话"),
    },
    nodes: body.nodes.map((node) => {
      const parsed = parseNode(node, "主题节点");
      return { ...parsed, topicId: text(isRecord(node) ? node.topicId : undefined, "主题节点 topicId") };
    }),
    edges: body.edges.map((edge) => {
      if (!isRecord(edge)) throw new Error("Chat返回了无效主题边");
      return {
        edgeId: text(edge.edgeId, "主题边 edgeId"), parentNodeId: text(edge.parentNodeId, "主题边 parentNodeId"),
        childNodeId: text(edge.childNodeId, "主题边 childNodeId"),
        anchorEntryId: optionalText(edge.anchorEntryId),
        anchorSequence: edge.anchorSequence === null || edge.anchorSequence === undefined ? null : integer(edge.anchorSequence, "主题边 anchorSequence"),
      };
    }),
  };
}

export async function fetchTopicNodeMessages(longAgentId: string, topicId: string, nodeId: string, signal?: AbortSignal): Promise<{
  messages: AgentMessage[]; sessionId: string; entryIds: readonly string[];
}> {
  const body = bodyOf(await requestJson(
    `${base(longAgentId)}/${encodeURIComponent(topicId)}/nodes/${encodeURIComponent(nodeId)}/messages`,
    { method: "GET" }, signal,
  ));
  const sessionId = text(body.sessionId, "节点会话");
  const context = isRecord(body.context) ? body.context : {};
  // The node messages come from the SAME `readChatSession` projection the normal chat uses, so they are
  // handed to the shared MessageView UNCHANGED: text, tool calls and results, images and thinking are
  // all preserved (no flattening to text, no fabricated model/provider).
  const rawMessages = list(context.messages, "节点消息");
  const ids = list(context.entryIds, "节点消息 entryIds").map((value) => text(value, "节点消息 entryId"));
  if (ids.length !== rawMessages.length) throw new Error("Chat返回了无效节点消息（entryIds 与 messages 不一致）");
  return { sessionId, messages: rawMessages as AgentMessage[], entryIds: ids };
}

export interface TopicNodeSessionInfo { readonly id: string; readonly cwd: string; readonly name: string | null }
/** Minimal Session info for mounting the shared ChatWindow on a topic node's own Session. */
export async function fetchTopicNodeSession(longAgentId: string, sessionId: string, signal?: AbortSignal): Promise<TopicNodeSessionInfo> {
  const body = bodyOf(await requestJson(
    `/api/sessions/${encodeURIComponent(sessionId)}?projectId=${encodeURIComponent(longAgentId)}&deferThinking=1&deferMedia=1`,
    { method: "GET" }, signal,
  ));
  const session = isRecord(body.session) ? body.session : {};
  return { id: text(body.sessionId, "节点会话 id"), cwd: text(session.cwd, "节点会话 cwd"), name: optionalText(session.name) };
}

export async function sendTopicNodeMessage(longAgentId: string, topicId: string, nodeId: string, input: {
  requestId: string; text: string;
}, signal?: AbortSignal): Promise<FriendTurnStatus> {
  const body = bodyOf(await requestJson(
    `${base(longAgentId)}/${encodeURIComponent(topicId)}/nodes/${encodeURIComponent(nodeId)}/messages`,
    { method: "POST", body: JSON.stringify({ schemaVersion: 1, ...input }) }, signal,
  ));
  if (typeof body.id !== "string" || typeof body.sessionId !== "string") throw new Error("Chat返回了无效节点轮次");
  const status = body.status;
  if (status !== "queued" && status !== "running" && status !== "completed" && status !== "failed" && status !== "cancelled" && status !== "interrupted")
    throw new Error("Chat返回了无效节点轮次状态");
  return { id: body.id, sessionId: body.sessionId, status, error: body.error === null || body.error === undefined ? null : String(body.error) };
}

export async function followTopicNodeTurn(longAgentId: string, turnId: string, signal: AbortSignal, onProgress?: (status: FriendTurnStatus) => void): Promise<FriendTurnStatus> {
  const path = `/api/long-agents/${encodeURIComponent(longAgentId)}/turns/${encodeURIComponent(turnId)}`;
  for (;;) {
    signal.throwIfAborted();
    const body = bodyOf(await requestJson(path, { method: "GET" }, signal).catch((error: unknown) => {
      if (signal.aborted) throw error;
      return {};
    }));
    const execution = isRecord(body.execution) ? body.execution : {};
    const status = execution.status;
    // While the round runs, the live snapshot is already the structured message projection: report the
    // same shapes the finished session will return, never a text-only placeholder.
    const snapshot = isRecord(body.snapshot) && Array.isArray(body.snapshot.messages) ? body.snapshot.messages as AgentMessage[] : undefined;
    const state: FriendTurnStatus = {
      id: typeof execution.id === "string" ? execution.id : turnId,
      sessionId: typeof execution.sessionId === "string" ? execution.sessionId : "",
      status: status === "completed" || status === "failed" || status === "cancelled" || status === "interrupted" ? status : "running",
      error: execution.error === null || execution.error === undefined ? null : String(execution.error),
      ...(snapshot === undefined ? {} : { messages: snapshot }),
    };
    onProgress?.(state);
    if (state.status !== "running") return state;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1_000);
      signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
  }
}

export async function fetchTopicNodeAnchors(longAgentId: string, topicId: string, nodeId: string, signal?: AbortSignal): Promise<TopicAnchor[]> {
  const body = bodyOf(await requestJson(
    `${base(longAgentId)}/${encodeURIComponent(topicId)}/nodes/${encodeURIComponent(nodeId)}/anchors`,
    { method: "GET" }, signal,
  ));
  return list(body.anchors, "节点锚点").map((anchor) => {
    if (!isRecord(anchor)) throw new Error("Chat返回了无效节点锚点");
    return {
      anchorEntryId: text(anchor.anchorEntryId, "锚点 entryId"), anchorSequence: integer(anchor.anchorSequence, "锚点序号"),
      turnId: text(anchor.turnId, "锚点轮次"), settledAt: optionalText(anchor.settledAt),
    };
  });
}

export async function setTopicNodeSessionMemory(longAgentId: string, topicId: string, nodeId: string, input: {
  expectedRevision: number; sessionMemory: "on" | "off";
}, signal?: AbortSignal): Promise<{ node: TopicNodeSummary & { topicId: string }; revision: number }> {
  const body = bodyOf(await requestJson(
    `${base(longAgentId)}/${encodeURIComponent(topicId)}/nodes/${encodeURIComponent(nodeId)}`,
    { method: "PATCH", body: JSON.stringify({ schemaVersion: 1, ...input }) }, signal,
  ));
  if (!Number.isSafeInteger(body.revision) || !isRecord(body.node)) throw new Error("Chat返回了无效节点更新");
  return { node: { ...parseNode(body.node, "节点更新"), topicId: text(body.node.topicId, "节点 topicId") } as TopicNodeSummary & { topicId: string }, revision: body.revision as number };
}

function parseIntegrationState(body: Record<string, unknown>): TopicIntegrationState {
  const status = body.status;
  if (typeof body.requestId !== "string" || typeof body.topicId !== "string" || typeof body.nodeId !== "string"
    || typeof body.sessionId !== "string"
    || (status !== "queued" && status !== "running" && status !== "completed" && status !== "failed"
      && status !== "cancelled" && status !== "interrupted" && status !== "unknown"))
    throw new Error("Chat返回了无效整合状态");
  return {
    requestId: body.requestId, topicId: body.topicId, nodeId: body.nodeId, sessionId: body.sessionId, status,
    error: body.error === null || body.error === undefined ? null : String(body.error),
  };
}

export async function startTopicIntegration(longAgentId: string, input: {
  requestId: string; title: string; purpose: string;
  parents?: readonly { nodeId: string; anchorEntryId: string; anchorSequence: number }[];
}, signal?: AbortSignal): Promise<TopicIntegrationState> {
  return parseIntegrationState(bodyOf(await requestJson(`${base(longAgentId)}/integrations`, {
    method: "POST", body: JSON.stringify({ schemaVersion: 1, ...input }),
  }, signal)));
}

export async function fetchTopicIntegration(longAgentId: string, requestId: string, signal?: AbortSignal): Promise<TopicIntegrationState> {
  return parseIntegrationState(bodyOf(await requestJson(
    `${base(longAgentId)}/integrations/${encodeURIComponent(requestId)}`, { method: "GET" }, signal,
  )));
}

export async function followTopicIntegration(longAgentId: string, requestId: string, signal: AbortSignal): Promise<TopicIntegrationState> {
  for (;;) {
    signal.throwIfAborted();
    const state = await fetchTopicIntegration(longAgentId, requestId, signal).catch((error: unknown) => {
      if (signal.aborted) throw error;
      return null;
    });
    if (state !== null && (state.status === "completed" || state.status === "failed" || state.status === "cancelled" || state.status === "interrupted")) return state;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1_000);
      signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
  }
}

export interface SupplementResult { readonly created: boolean; readonly kind: "memory" | "relay"; readonly ref: string; readonly turnId: string | null; readonly turnStatus: string | null }
export async function supplementTopicNode(longAgentId: string, topicId: string, nodeId: string, input: {
  requestId: string; parentNodeId: string; anchorEntryId: string; anchorSequence: number;
  product: { kind: "memory"; content: string } | { kind: "relay"; text: string };
}, signal?: AbortSignal): Promise<SupplementResult> {
  const body = bodyOf(await requestJson(
    `${base(longAgentId)}/${encodeURIComponent(topicId)}/nodes/${encodeURIComponent(nodeId)}/supplements`,
    { method: "POST", body: JSON.stringify({ schemaVersion: 1, ...input }) }, signal,
  ));
  if (body.created !== true && body.created !== false) throw new Error("Chat返回了无效补充整合响应");
  const product = isRecord(body.product) ? body.product : {};
  if (product.kind === "memory" && typeof product.entryId === "string") return { created: body.created, kind: "memory", ref: product.entryId, turnId: null, turnStatus: null };
  if (product.kind === "relay" && typeof product.intentEntryId === "string") return { created: body.created, kind: "relay", ref: product.intentEntryId,
    turnId: typeof product.turnId === "string" ? product.turnId : null,
    turnStatus: typeof product.turnStatus === "string" ? product.turnStatus : null };
  throw new Error("Chat返回了无效补充整合产物");
}

export async function fetchSessionMemory(longAgentId: string, sessionId: string, signal?: AbortSignal): Promise<{
  revision: number; entries: SessionMemoryEntry[];
}> {
  const body = bodyOf(await requestJson(
    `/api/long-agents/${encodeURIComponent(longAgentId)}/sessions/${encodeURIComponent(sessionId)}/memory`,
    { method: "GET" }, signal,
  ));
  if (!Number.isSafeInteger(body.revision) || !Array.isArray(body.entries)) throw new Error("Chat返回了无效会话记忆");
  return {
    revision: body.revision as number,
    entries: body.entries.map((entry) => {
      if (!isRecord(entry)) throw new Error("Chat返回了无效会话记忆条目");
      return {
        entryId: text(entry.entryId, "记忆条目 id"), purpose: text(entry.purpose, "记忆 purpose"),
        author: text(entry.author, "记忆作者"), content: typeof entry.content === "string" ? entry.content : "",
        status: entry.status === "superseded" ? "superseded" : "active",
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
      };
    }),
  };
}

export async function editSessionMemory(longAgentId: string, sessionId: string, input: {
  operation: "write" | "supersede"; purpose: string; content: string; supersedes?: string; expectedRevision: number;
}, signal?: AbortSignal): Promise<{ revision: number }> {
  const body = bodyOf(await requestJson(
    `/api/long-agents/${encodeURIComponent(longAgentId)}/sessions/${encodeURIComponent(sessionId)}/memory`,
    { method: "PATCH", body: JSON.stringify({ ...input, ...(input.operation === "supersede" ? { supersedes: input.supersedes } : {}) }) }, signal,
  ));
  if (!Number.isSafeInteger(body.revision)) throw new Error("Chat返回了无效会话记忆写入");
  return { revision: body.revision as number };
}
