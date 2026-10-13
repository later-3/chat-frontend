/**
 * 完整交互读模型数据层（B3 · U7）。
 *
 * 唯一事实源 = Backend 读模型 `/api/sessions/:id/interactions*`；聚合（tokenOut、失败数、
 * 重试归并）全部由后端给出（02 T9：前端不自行聚合），本模块只做字段校验与视图归一化。
 * legacy 会话（旧 prompt-captures schema1）：index 已由后端适配（legacy:true）；详情回落
 * 旧 `prompt-captures/:id` 路由，归一化到同一 RequestDetailView，降级能力见 B3-design D3 矩阵。
 */

export interface InteractionRecordingState {
  readonly enabled: boolean;
  readonly revision: number;
}

export interface InteractionRegionMark {
  readonly id: string;
  readonly chars: number;
  /** 人话展示名（F6：读模型已补 registry label；缺失回退 id） */
  readonly label: string;
  /** B5：内容前 80 字符预览（发送前编辑入口识别块用；无条件记录） */
  readonly preview?: string;
  /** B5：XML 标签名（= registry.id，如 chat_identity；pi-base 无标签不写） */
  readonly tag?: string;
}

export interface InteractionOutcomeView {
  readonly status: "success" | "error" | "aborted";
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly usage?: unknown;
  readonly durationMs?: number;
  readonly responseId?: string;
}

export interface InteractionTurnView {
  readonly source: string;
  readonly workflowId?: string;
  readonly workflowInvocationId?: string;
  readonly stageId?: string;
  readonly turnKey?: string;
  readonly stage: { readonly id: string; readonly nodeKind: string };
}

export interface InteractionRowView {
  readonly requestId: string;
  readonly seq: number;
  readonly timestamp: string;
  readonly kind: "agent" | "direct";
  readonly turn: InteractionTurnView;
  readonly agent: { readonly agentId: string; readonly agentName?: string; readonly longAgentId?: string };
  readonly model: { readonly provider: string; readonly modelId: string; readonly api?: string };
  readonly payloadChars: number;
  readonly regions: readonly InteractionRegionMark[];
  readonly messageCount: number;
  readonly toolCount: number;
  /** B5：工具名清单（发送前编辑入口用） */
  readonly toolNames?: readonly string[];
  readonly attempt: number;
  readonly retryOf?: string;
  readonly excluded: { readonly count: number };
  readonly payload: { readonly sha256: string; readonly chars: number; readonly file?: string };
  readonly outcome?: InteractionOutcomeView;
  readonly degraded?: boolean;
  readonly legacy?: boolean;
}

export interface InteractionRequestGroupView {
  readonly requestId: string;
  readonly attemptIds: readonly string[];
  readonly attempts: number;
  readonly failures: number;
  readonly regions: readonly InteractionRegionMark[];
  readonly messageCount: number;
  readonly toolCount: number;
  readonly lastOutcome?: InteractionOutcomeView;
}

export interface InteractionTurnSummaryView {
  readonly requestCount: number;
  readonly attempts: number;
  readonly failures: number;
  readonly tokenOut: number;
  readonly promptChars: number;
  readonly model: string;
  readonly hasOutcome: boolean;
}

export interface InteractionGroupView {
  readonly key: string;
  readonly source: string;
  readonly stage: { readonly id: string; readonly nodeKind: string };
  /** 去重请求数（E1） */
  readonly requestCount: number;
  readonly attempts: number;
  readonly failures: number;
  readonly tokenOut: number;
  readonly promptChars: number;
  readonly model: string;
  readonly firstTimestamp: string;
  readonly agentLabel: string;
  /** unknown = legacy 无任何 outcome（UI 显示"未记录"而非 0/进行中，E2/E3） */
  readonly state: "done" | "running" | "unknown";
  readonly hasOutcome: boolean;
}

export interface InteractionIndexView {
  readonly legacy: boolean;
  readonly groups: readonly InteractionGroupView[];
  readonly rows: readonly InteractionRowView[];
  readonly nextCursor?: number;
  readonly recording: InteractionRecordingState;
}

export interface InteractionStageSummaryView {
  readonly id: string;
  readonly nodeKind: string;
  readonly requestCount: number;
  readonly attempts: number;
  readonly failures: number;
}

export interface InteractionTurnGroupView {
  readonly rows: readonly InteractionRowView[];
  readonly summary: InteractionTurnSummaryView;
  readonly requests: readonly InteractionRequestGroupView[];
  readonly stages: readonly InteractionStageSummaryView[];
  readonly legacy: boolean;
}

/** 归一化的请求详情：v2 与 legacy（v1）两源在此收敛为同一视图模型。 */
export interface RequestDetailView {
  readonly row: InteractionRowView;
  /** 原始请求体（messages/tools；legacy 同样来自旧 gz）。 */
  readonly payload: Record<string, unknown> | null;
  /** 消息区域标注（v2 来自 D2 messageRegions；legacy 来自 v1 regions.messages 的分类部分）。 */
  readonly messageRegions: readonly { readonly index: number; readonly role: string; readonly region: string; readonly customType?: string }[];
  /** 结果；legacy 无 → undefined，UI 显示“旧记录未保存结果”（D3 矩阵）。 */
  readonly outcome?: InteractionOutcomeView;
  readonly legacy: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}
function optionalStr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseOutcome(value: unknown): InteractionOutcomeView | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.status;
  if (status !== "success" && status !== "error" && status !== "aborted") return undefined;
  return {
    status,
    ...(optionalStr(value.stopReason) === undefined ? {} : { stopReason: optionalStr(value.stopReason) }),
    ...(optionalStr(value.errorMessage) === undefined ? {} : { errorMessage: optionalStr(value.errorMessage) }),
    ...(value.usage === undefined ? {} : { usage: value.usage }),
    ...(typeof value.durationMs === "number" ? { durationMs: value.durationMs } : {}),
    ...(optionalStr(value.responseId) === undefined ? {} : { responseId: optionalStr(value.responseId) }),
  };
}

function parseTurn(value: unknown): InteractionTurnView {
  const turn = isRecord(value) ? value : {};
  const stage = isRecord(turn.stage) ? turn.stage : {};
  return {
    source: str(turn.source, "direct"),
    ...(optionalStr(turn.workflowId) === undefined ? {} : { workflowId: optionalStr(turn.workflowId) }),
    ...(optionalStr(turn.workflowInvocationId) === undefined ? {} : { workflowInvocationId: optionalStr(turn.workflowInvocationId) }),
    ...(optionalStr(turn.stageId) === undefined ? {} : { stageId: optionalStr(turn.stageId) }),
    ...(optionalStr(turn.turnKey) === undefined ? {} : { turnKey: optionalStr(turn.turnKey) }),
    stage: { id: str(stage.id, "direct"), nodeKind: str(stage.nodeKind, "system") },
  };
}

function parseRegions(value: unknown): InteractionRegionMark[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(region => ({ id: str(region.id, "unknown"), chars: num(region.chars), label: str(region.label, str(region.id, "unknown")),
    ...(optionalStr(region.preview) === undefined ? {} : { preview: optionalStr(region.preview) }),
    ...(optionalStr(region.tag) === undefined ? {} : { tag: optionalStr(region.tag) }) }));
}

function parseRow(value: unknown): InteractionRowView {
  if (!isRecord(value) || typeof value.requestId !== "string") throw new Error("读模型行缺少 requestId");
  const agent = isRecord(value.agent) ? value.agent : {};
  const model = isRecord(value.model) ? value.model : {};
  const regions = parseRegions(value.regions);
  return {
    requestId: value.requestId,
    seq: num(value.seq),
    timestamp: str(value.timestamp),
    kind: value.kind === "direct" ? "direct" : "agent",
    turn: parseTurn(value.turn),
    agent: {
      agentId: str(agent.agentId),
      ...(optionalStr(agent.agentName) === undefined ? {} : { agentName: optionalStr(agent.agentName) }),
      ...(optionalStr(agent.longAgentId) === undefined ? {} : { longAgentId: optionalStr(agent.longAgentId) }),
    },
    model: { provider: str(model.provider), modelId: str(model.modelId), ...(optionalStr(model.api) === undefined ? {} : { api: optionalStr(model.api) }) },
    payloadChars: num(value.payloadChars),
    regions,
    messageCount: num(value.messageCount),
    toolCount: num(value.toolCount),
    ...(Array.isArray(value.toolNames)
      ? { toolNames: value.toolNames.filter((name): name is string => typeof name === "string") }
      : {}),
    attempt: num(value.attempt, 1),
    ...(optionalStr(value.retryOf) === undefined ? {} : { retryOf: optionalStr(value.retryOf) }),
    excluded: { count: num(isRecord(value.excluded) ? value.excluded.count : 0) },
    payload: {
      sha256: str(isRecord(value.payload) ? value.payload.sha256 : ""),
      chars: num(isRecord(value.payload) ? value.payload.chars : 0),
      ...(isRecord(value.payload) && typeof value.payload.file === "string" ? { file: value.payload.file } : {}),
    },
    ...(parseOutcome(value.outcome) === undefined ? {} : { outcome: parseOutcome(value.outcome) }),
    ...(value.degraded === true ? { degraded: true } : {}),
    ...(value.legacy === true ? { legacy: true } : {}),
  };
}

function parseRecording(value: unknown): InteractionRecordingState {
  if (!isRecord(value)) return { enabled: false, revision: 0 };
  return { enabled: value.enabled === true, revision: num(value.revision) };
}

async function readJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${label}：HTTP ${response.status}`);
  return response.json();
}

export async function fetchInteractionIndex(
  sessionId: string,
  projectId: string,
  options: { cursor?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<InteractionIndexView> {
  const query = new URLSearchParams({ projectId, limit: String(options.limit ?? 50) });
  if (options.cursor !== undefined) query.set("cursor", String(options.cursor));
  const payload = await readJson(
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/interactions?${query.toString()}`, { signal: options.signal, credentials: "same-origin" }),
    "读取完整交互索引",
  );
  if (!isRecord(payload)) throw new Error("读模型索引响应不完整");
  return {
    legacy: payload.legacy === true,
    groups: Array.isArray(payload.groups) ? payload.groups.filter(isRecord).map(group => ({
      key: str(group.key),
      source: str(group.source, "direct"),
      stage: isRecord(group.stage) ? { id: str(group.stage.id, "direct"), nodeKind: str(group.stage.nodeKind, "system") } : { id: "direct", nodeKind: "system" },
      requestCount: num(group.requestCount),
      attempts: num(group.attempts, num(group.requestCount)),
      failures: num(group.failures),
      tokenOut: num(group.tokenOut),
      promptChars: num(group.promptChars),
      model: str(group.model),
      firstTimestamp: str(group.firstTimestamp),
      agentLabel: str(group.agentLabel),
      state: group.state === "running" ? "running" : group.state === "unknown" ? "unknown" : "done",
      hasOutcome: group.hasOutcome === true,
    })) : [],
    rows: Array.isArray(payload.rows) ? payload.rows.map(parseRow) : [],
    ...(typeof payload.nextCursor === "number" ? { nextCursor: payload.nextCursor } : {}),
    recording: parseRecording(payload.recording),
  };
}

export async function fetchInteractionTurnGroup(
  sessionId: string,
  projectId: string,
  turnKey: string,
  signal?: AbortSignal,
): Promise<InteractionTurnGroupView> {
  const payload = await readJson(
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/interactions/${encodeURIComponent(turnKey)}?projectId=${encodeURIComponent(projectId)}`, { signal, credentials: "same-origin" }),
    "读取轮次交互",
  );
  if (!isRecord(payload)) throw new Error("轮次交互响应不完整");
  const summary = isRecord(payload.summary) ? payload.summary : {};
  return {
    rows: Array.isArray(payload.rows) ? payload.rows.map(parseRow) : [],
    summary: {
      requestCount: num(summary.requestCount),
      attempts: num(summary.attempts),
      failures: num(summary.failures),
      tokenOut: num(summary.tokenOut),
      promptChars: num(summary.promptChars),
      model: str(summary.model),
      hasOutcome: summary.hasOutcome === true,
    },
    requests: Array.isArray(payload.requests) ? payload.requests.filter(isRecord).map(request => ({
      requestId: str(request.requestId),
      attemptIds: Array.isArray(request.attemptIds) ? request.attemptIds.filter((id): id is string => typeof id === "string") : [],
      attempts: num(request.attempts, 1),
      failures: num(request.failures),
      regions: parseRegions(request.regions),
      messageCount: num(request.messageCount),
      toolCount: num(request.toolCount),
      ...(parseOutcome(request.lastOutcome) === undefined ? {} : { lastOutcome: parseOutcome(request.lastOutcome) }),
    })) : [],
    stages: Array.isArray(payload.stages) ? payload.stages.filter(isRecord).map(stage => ({
      id: str(stage.id, "direct"),
      nodeKind: str(stage.nodeKind, "system"),
      requestCount: num(stage.requestCount),
      attempts: num(stage.attempts),
      failures: num(stage.failures),
    })) : [],
    legacy: payload.legacy === true,
  };
}

function normalizeDetail(row: InteractionRowView, payload: unknown, messageRegions: unknown, legacy: boolean): RequestDetailView {
  const payloadRecord = isRecord(payload) ? payload : null;
  const regions = Array.isArray(messageRegions)
    ? messageRegions.filter(isRecord).map(mark => ({
        index: num(mark.index),
        role: str(mark.role),
        region: str(mark.region, "unclassified"),
        ...(optionalStr(mark.customType) === undefined ? {} : { customType: optionalStr(mark.customType) }),
      }))
    : [];
  return { row, payload: payloadRecord, messageRegions: regions, ...(row.outcome === undefined ? {} : { outcome: row.outcome }), legacy };
}

/** 详情读取：先打 v2 接口；legacy 会话（404 legacy）回落旧 prompt-captures 路由并归一化。 */
export async function fetchRequestDetail(
  sessionId: string,
  projectId: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<RequestDetailView> {
  const query = `projectId=${encodeURIComponent(projectId)}`;
  const primary = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/interactions/requests/${encodeURIComponent(requestId)}?${query}&payload=1`,
    { signal, credentials: "same-origin" },
  );
  if (primary.status !== 404) {
    const payload = await readJson(primary, "读取请求详情");
    if (!isRecord(payload) || !isRecord(payload.row)) throw new Error("请求详情响应不完整");
    return normalizeDetail(parseRow(payload.row), payload.payload, payload.messageRegions, false);
  }
  // legacy 回落：旧路由返回 v1 {record, payload}；v1 record.regions.messages 自带区域分类。
  const legacy = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/prompt-captures/${encodeURIComponent(requestId)}?${query}`, { signal, credentials: "same-origin" });
  const body = await readJson(legacy, "读取旧记录详情");
  if (!isRecord(body) || !isRecord(body.record)) throw new Error("旧记录详情响应不完整");
  const record = body.record;
  const regions = isRecord(record.regions) ? record.regions : {};
  const legacyTurn = isRecord(record.turn) ? record.turn : {};
  // v1 record 的 sha/file 是顶层字段——归一成 payload 对象（否则 sha 空、占比分母丢失）
  const legacyPayload = {
    sha256: str(record.payloadSha256),
    chars: num(record.payloadChars),
    ...(isRecord(record.file) === false && typeof record.file === "string" ? { file: record.file } : {}),
  };
  const legacySections = isRecord(regions.systemPrompt) && Array.isArray(regions.systemPrompt.sections)
    ? (regions.systemPrompt.sections as unknown[]).filter(isRecord) : [];
  const rowLike = {
    ...record,
    payload: legacyPayload,
    // F6：legacy 行同样带区域摘要+人话名（条形图数据），v1 sections 自带 label
    regions: legacySections.map(section => ({
      id: str(section.kind, "unknown"),
      chars: num(isRecord(section.text) ? String(section.text).length : num(section.chars)),
      label: str(section.label, str(section.kind, "unknown")),
    })),
    outcome: undefined,
    legacy: true,
    attempt: num(record.attempt, 1),
    turn: { ...legacyTurn, stage: isRecord(legacyTurn.stage) ? legacyTurn.stage : { id: "direct", nodeKind: "system" } },
  };
  const messageRegions = Array.isArray(regions.messages)
    ? regions.messages.filter(isRecord).map(mark => ({ index: num(mark.index), role: str(mark.role), region: str(mark.region, "unclassified"), ...(optionalStr(mark.customType) === undefined ? {} : { customType: optionalStr(mark.customType) }) }))
    : [];
  return normalizeDetail(parseRow(rowLike), body.payload, messageRegions, true);
}

export async function fetchInteractionRecording(sessionId: string, projectId: string, signal?: AbortSignal): Promise<InteractionRecordingState> {
  const payload = await readJson(
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/interaction-recording?projectId=${encodeURIComponent(projectId)}`, { signal, credentials: "same-origin" }),
    "读取完整记录开关",
  );
  return parseRecording(payload);
}

/** 写开关；409（revision 冲突）重读一次后重试一次，仍冲突则抛给 UI。 */
export async function setInteractionRecording(
  sessionId: string,
  projectId: string,
  enabled: boolean,
): Promise<InteractionRecordingState> {
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/interaction-recording?projectId=${encodeURIComponent(projectId)}`;
  const attempt = async (expectedRevision: number): Promise<InteractionRecordingState> => {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ enabled, expectedRevision }),
    });
    if (response.status === 409) {
      // 并发修改：重读最新 revision 后重试一次；仍冲突抛给 UI（不再自动三试）。
      const current = await fetchInteractionRecording(sessionId, projectId);
      if (current.enabled === enabled) return current;
      const retry = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ enabled, expectedRevision: current.revision }),
      });
      if (!retry.ok) throw new Error(`保存完整记录开关：HTTP ${retry.status}`);
      return parseRecording(await retry.json());
    }
    if (!response.ok) throw new Error(`保存完整记录开关：HTTP ${response.status}`);
    return parseRecording(await response.json());
  };
  // 路由要求 expectedRevision（乐观并发）——先读当前 revision 再写。
  const current = await fetchInteractionRecording(sessionId, projectId);
  return attempt(current.revision);
}


/** 会话消息视图（F3 a/b 层数据源）：`GET /api/sessions/:id?view=chat` 的 context.messages 投影。 */
export interface SessionMessageView {
  readonly role: string;
  readonly content: unknown;
  readonly timestamp?: number;
  /** LA 轮绑定键（= turnKey）；旧消息可能缺失 → 用时间窗兜底匹配 */
  readonly turnId?: string;
  /** 完整原始消息（AgentMessage 形状——MessageView 过程展示直接消费） */
  readonly raw: Record<string, unknown>;
  /** 条目 id（与 messages 平行——thinking 内容按需 API 需要 sessionId+entryId） */
  readonly entryId?: string;
}

/**
 * 按轮匹配会话消息（turnId 直配优先；时间窗：a=(上一组首请求, 本组首请求]、b=[本组首请求, 下一组)）。
 * 消息流 bar 展开（B4 过程回放）与完整历史 a/b 层共用同一匹配。
 */
export function matchTurnMessages(
  group: { readonly key: string; readonly firstTimestamp: string },
  index: number,
  groups: readonly { readonly key: string; readonly firstTimestamp: string }[],
  messages: readonly SessionMessageView[],
  nextTimestamp?: string,
): readonly SessionMessageView[] {
  const byKey = messages.filter(message => message.turnId === group.key);
  const prevTs = index <= 0 ? -Infinity : Date.parse(groups[index - 1]?.firstTimestamp ?? "");
  const thisTs = Date.parse(group.firstTimestamp);
  const nextTs = nextTimestamp === undefined || nextTimestamp === "" ? Infinity : Date.parse(nextTimestamp);
  const inWindow = (message: SessionMessageView, fromTs: number, toTs: number) => {
    const ts = message.timestamp ?? 0;
    return ts > (Number.isNaN(fromTs) ? -Infinity : fromTs) && ts <= (Number.isNaN(toTs) ? Infinity : toTs);
  };
  if (byKey.length > 0) {
    // turnId 命中：取该轮 user 起点及其后的全部消息
    const firstUser = byKey.findIndex(m => m.role === "user");
    if (firstUser >= 0) return byKey.slice(firstUser);
    return byKey;
  }
  // 时间窗：该轮 a 之后、下一组之前（含 a）
  const aMessages = messages.filter(m => m.role === "user" && inWindow(m, prevTs, thisTs));
  const startTs = aMessages.length > 0 ? (aMessages[aMessages.length - 1]!.timestamp ?? thisTs) : thisTs;
  return messages.filter(m => (m.timestamp ?? 0) >= startTs - 1 && (m.timestamp ?? 0) < (Number.isNaN(nextTs) ? Infinity : nextTs));
}

export async function fetchSessionMessages(sessionId: string, projectId: string, signal?: AbortSignal): Promise<readonly SessionMessageView[]> {
  const payload = await readJson(
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?projectId=${encodeURIComponent(projectId)}&view=chat&deferThinking=1&deferMedia=1`, { signal, credentials: "same-origin" }),
    "读取会话消息",
  );
  const context = isRecord(payload) && isRecord(payload.context) ? payload.context : undefined;
  const messages = context !== undefined && Array.isArray(context.messages) ? context.messages : [];
  const entryIds = context !== undefined && Array.isArray(context.entryIds) ? context.entryIds : [];
  return messages.filter((message, index) => isRecord(message) && true).map((message, filteredIndex) => {
    // 过滤只去非 record——filteredIndex 与 entryIds 按原始 index 对齐（非 record 项极少见，原位对齐）
    const originalIndex = messages.indexOf(message);
    const link = isRecord(message.chatLongAgent) ? message.chatLongAgent : undefined;
    const entryId = entryIds[originalIndex];
    return {
      role: str(message.role, ""),
      content: message.content,
      ...(typeof message.timestamp === "number" ? { timestamp: message.timestamp } : {}),
      ...(link !== undefined && typeof link.turnId === "string" ? { turnId: link.turnId } : {}),
      raw: message,
      ...(typeof entryId === "string" ? { entryId } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// B5 上下文编辑层：发给模型的内容 = 可勾选/可修改/可追加的文字块
// ---------------------------------------------------------------------------

export interface ContextEditState {
  /** 不再发送的块（blockId：tag:<chat_xxx> / entry:<entryId> / tools:<名>）。 */
  readonly excluded: readonly string[];
  readonly modified: Readonly<Record<string, string>>;
  readonly added: Readonly<Record<string, readonly string[]>>;
  readonly revision: number;
}

export const EMPTY_CONTEXT_EDIT: ContextEditState = { excluded: [], modified: {}, added: {}, revision: 0 };

function parseContextEdit(payload: unknown): ContextEditState {
  if (!isRecord(payload)) throw new Error("编辑层响应不是对象");
  const excluded = Array.isArray(payload.excluded) ? payload.excluded.filter((item): item is string => typeof item === "string") : [];
  const modified: Record<string, string> = {};
  if (isRecord(payload.modified)) {
    for (const [key, value] of Object.entries(payload.modified)) if (typeof value === "string") modified[key] = value;
  }
  const added: Record<string, string[]> = {};
  if (isRecord(payload.added)) {
    for (const [key, value] of Object.entries(payload.added)) {
      if (Array.isArray(value)) added[key] = value.filter((item): item is string => typeof item === "string");
    }
  }
  return { excluded, modified, added, revision: num(payload.revision, 0) };
}

export async function fetchContextEdit(sessionId: string, projectId: string, signal?: AbortSignal): Promise<ContextEditState> {
  const payload = await readJson(
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/context-edit?projectId=${encodeURIComponent(projectId)}`, { signal, credentials: "same-origin" }),
    "读取上下文编辑层",
  );
  return parseContextEdit(payload);
}

/** 保存编辑层；409（revision 冲突）重读一次后重试一次，仍冲突抛给 UI。 */
export async function saveContextEdit(
  sessionId: string,
  projectId: string,
  next: { readonly excluded: readonly string[]; readonly modified: Readonly<Record<string, string>>; readonly added: Readonly<Record<string, readonly string[]>> },
): Promise<ContextEditState> {
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/context-edit?projectId=${encodeURIComponent(projectId)}`;
  const attempt = async (expectedRevision: number): Promise<ContextEditState> => {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ...next, expectedRevision }),
    });
    if (response.status === 409) {
      const current = await fetchContextEdit(sessionId, projectId);
      const retry = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...next, expectedRevision: current.revision }),
      });
      if (!retry.ok) throw new Error(`保存上下文编辑层：HTTP ${retry.status}`);
      return parseContextEdit(await retry.json());
    }
    if (!response.ok) throw new Error(`保存上下文编辑层：HTTP ${response.status}`);
    return parseContextEdit(await response.json());
  };
  const current = await fetchContextEdit(sessionId, projectId);
  return attempt(current.revision);
}

/** 发送前预览视图（B5）：**实时装配**的"这一次将发送的内容"（不调用模型）+ 当前编辑层。 */
export interface ContextPreviewView {
  readonly detail: RequestDetailView | null;
  readonly edit: ContextEditState;
  readonly payloadPresent: boolean;
}

export async function fetchContextPreview(
  sessionId: string,
  projectId: string,
  longAgentId: string,
  options: { draft?: string; contextProjectId?: string | null; signal?: AbortSignal } = {},
): Promise<ContextPreviewView> {
  const query = new URLSearchParams({ projectId, longAgentId });
  if (options.contextProjectId != null && options.contextProjectId !== "") query.set("contextProjectId", options.contextProjectId);
  if (options.draft !== undefined && options.draft.trim() !== "") query.set("draft", options.draft);
  const payload = await readJson(
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/context-preview?${query.toString()}`, { signal: options.signal, credentials: "same-origin" }),
    "读取发送前预览",
  );
  if (!isRecord(payload)) throw new Error("预览响应不完整");
  const edit = parseContextEdit(isRecord(payload.edit) ? payload.edit : {});
  const raw = isRecord(payload.payload) ? payload.payload : null;
  if (raw === null) return { detail: null, edit, payloadPresent: false };
  const messages = Array.isArray(raw.messages) ? raw.messages : [];
  const tools = Array.isArray(raw.tools) ? raw.tools : [];
  const model = isRecord(raw.model) ? raw.model : {};
  // 预览没有历史行记录：构造一个最小行，让同一套树组件可以渲染（row 只用于元信息显示）。
  const row: InteractionRowView = {
    requestId: "assembly-preview",
    seq: 0,
    timestamp: new Date().toISOString(),
    kind: "agent",
    turn: { source: "workflow", stage: { id: "preview", nodeKind: "agent" } },
    agent: { agentId: longAgentId },
    model: { provider: str(model.provider), modelId: str(model.modelId) },
    payloadChars: 0,
    regions: [],
    messageCount: messages.length,
    toolCount: tools.length,
    attempt: 1,
    excluded: { count: edit.excluded.length },
    payload: { sha256: "", chars: 0 },
  };
  // 与真实详情一致：使用后端给的消息区域分类（否则显示"未分类"）。
  return { detail: normalizeDetail(row, raw, payload.messageRegions, false), edit, payloadPresent: true };
}
