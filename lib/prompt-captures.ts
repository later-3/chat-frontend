/**
 * Prompt-capture read model: the regions and grouping for the full-history
 * Prompt panel. Parsing only; all data comes from the Backend's capture API.
 */

export interface PromptCaptureRegionSummary {
  readonly parsed: boolean;
  readonly api?: string;
  readonly parseError?: string;
  readonly systemPromptChars: number;
  readonly systemSections: readonly { readonly kind: string; readonly label: string; readonly chars: number }[];
  readonly messageCount: number;
  readonly regionCounts: Readonly<Record<string, number>>;
  readonly toolCount: number;
  /** Present on detail records only. */
  readonly messages?: readonly PromptCaptureMessageRegionFull[];
}

export interface PromptCaptureRecordSummary {
  readonly requestId: string;
  readonly seq: number;
  readonly timestamp: string;
  readonly kind: "agent" | "direct";
  readonly turn: { readonly source: string; readonly workflowId?: string; readonly workflowInvocationId?: string; readonly stageId?: string; readonly turnKey?: string };
  readonly agent: { readonly agentId: string; readonly agentName?: string; readonly longAgentId?: string };
  readonly model: { readonly provider: string; readonly modelId: string; readonly api?: string };
  readonly payloadChars: number;
  readonly regions: PromptCaptureRegionSummary;
}

export interface PromptCaptureMessageRegion {
  readonly index: number;
  readonly role: string;
  readonly region: string;
  readonly customType?: string;
  readonly timestamp?: number;
  readonly chars: number;
  readonly text: string;
}

export interface PromptCaptureSystemSection {
  readonly kind: string;
  readonly label: string;
  readonly text: string;
}

export interface PromptCaptureDetail {
  readonly record: PromptCaptureRecordSummary;
  readonly payload: {
    readonly messages?: readonly { readonly role?: string; readonly content?: unknown }[];
    readonly tools?: readonly { readonly name?: string; readonly function?: { readonly name?: string; readonly description?: string } }[];
    readonly system?: unknown;
  };
}

export interface PromptCaptureList {
  readonly sessionId: string;
  readonly count: number;
  readonly records: readonly PromptCaptureRecordSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Groups request records into turns (one user send → one or more agent assemblies). */
export interface PromptCaptureTurnGroup {
  readonly key: string;
  readonly workflowId: string | null;
  readonly records: readonly PromptCaptureRecordSummary[];
}

export function parsePromptCaptureList(value: unknown): PromptCaptureList {
  if (!isRecord(value) || !isNonEmptyString(value.sessionId) || !Array.isArray(value.records)) {
    throw new Error("Chat返回的Prompt记录列表不完整");
  }
  return {
    sessionId: value.sessionId,
    count: typeof value.count === "number" ? value.count : value.records.length,
    records: value.records.map(parseRecord),
  };
}

export function parsePromptCaptureDetail(value: unknown): PromptCaptureDetail {
  if (!isRecord(value) || !isRecord(value.record) || !isRecord(value.payload)) {
    throw new Error("Chat返回的Prompt记录详情不完整");
  }
  return { record: parseRecord(value.record), payload: value.payload as PromptCaptureDetail["payload"] };
}

function parseRecord(value: unknown): PromptCaptureRecordSummary {
  if (!isRecord(value) || !isNonEmptyString(value.requestId) || !isRecord(value.turn) || !isRecord(value.agent) || !isRecord(value.model) || !isRecord(value.regions)) {
    throw new Error("Prompt记录缺少必要字段");
  }
  return {
    requestId: value.requestId,
    seq: typeof value.seq === "number" ? value.seq : 0,
    timestamp: isNonEmptyString(value.timestamp) ? value.timestamp : "",
    kind: value.kind === "direct" ? "direct" : "agent",
    turn: parseTurn(value.turn),
    agent: {
      agentId: isNonEmptyString(value.agent.agentId) ? value.agent.agentId : "",
      ...(isNonEmptyString(value.agent.agentName) ? { agentName: value.agent.agentName } : {}),
      ...(isNonEmptyString(value.agent.longAgentId) ? { longAgentId: value.agent.longAgentId } : {}),
    },
    model: {
      provider: isNonEmptyString(value.model.provider) ? value.model.provider : "",
      modelId: isNonEmptyString(value.model.modelId) ? value.model.modelId : "",
      ...(isNonEmptyString(value.model.api) ? { api: value.model.api } : {}),
    },
    payloadChars: typeof value.payloadChars === "number" ? value.payloadChars : 0,
    regions: parseRegions(value.regions),
  };
}

function parseTurn(value: Record<string, unknown>): PromptCaptureRecordSummary["turn"] {
  return {
    source: isNonEmptyString(value.source) ? value.source : "direct",
    ...(isNonEmptyString(value.workflowId) ? { workflowId: value.workflowId } : {}),
    ...(isNonEmptyString(value.workflowInvocationId) ? { workflowInvocationId: value.workflowInvocationId } : {}),
    ...(isNonEmptyString(value.stageId) ? { stageId: value.stageId } : {}),
    ...(isNonEmptyString(value.turnKey) ? { turnKey: value.turnKey } : {}),
  };
}

export interface PromptCaptureMessageRegionFull {
  readonly index: number;
  readonly role: string;
  readonly region: string;
  readonly customType?: string;
  readonly chars: number;
  readonly text: string;
}

function parseRegions(value: Record<string, unknown>): PromptCaptureRegionSummary {
  const regionCounts: Record<string, number> = {};
  if (isRecord(value.regionCounts)) {
    for (const [key, count] of Object.entries(value.regionCounts)) {
      if (typeof count === "number") regionCounts[key] = count;
    }
  }
  return {
    parsed: value.parsed === true,
    ...(isNonEmptyString(value.api) ? { api: value.api } : {}),
    ...(isNonEmptyString(value.parseError) ? { parseError: value.parseError } : {}),
    systemPromptChars: typeof value.systemPromptChars === "number" ? value.systemPromptChars : 0,
    systemSections: Array.isArray(value.systemSections) ? value.systemSections.map((section) => ({
      kind: isRecord(section) && isNonEmptyString(section.kind) ? section.kind : "other",
      label: isRecord(section) && isNonEmptyString(section.label) ? section.label : "",
      chars: isRecord(section) && typeof section.chars === "number" ? section.chars : 0,
    })) : [],
    messageCount: typeof value.messageCount === "number" ? value.messageCount : 0,
    regionCounts,
    toolCount: typeof value.toolCount === "number" ? value.toolCount : 0,
    // Detail records carry the per-message region list; list summaries do not.
    ...(Array.isArray(value.messages) ? { messages: value.messages.map((message) => ({
      index: isRecord(message) && typeof message.index === "number" ? message.index : 0,
      role: isRecord(message) && isNonEmptyString(message.role) ? message.role : "",
      region: isRecord(message) && isNonEmptyString(message.region) ? message.region : "unclassified",
      ...(isRecord(message) && isNonEmptyString(message.customType) ? { customType: message.customType } : {}),
      chars: isRecord(message) && typeof message.chars === "number" ? message.chars : 0,
      text: isRecord(message) && typeof message.text === "string" ? message.text : "",
    })) } : {}),
  };
}

/** Turns are keyed by workflow invocation (one user send); direct Friend turns group alone. */
export function groupPromptCaptures(records: readonly PromptCaptureRecordSummary[]): readonly PromptCaptureTurnGroup[] {
  const groups: PromptCaptureTurnGroup[] = [];
  const byKey = new Map<string, PromptCaptureTurnGroup>();
  for (const record of records) {
    const key = record.turn.workflowInvocationId ?? record.turn.turnKey ?? `${record.turn.source}:${record.agent.agentId}:${record.timestamp}`;
    let group = byKey.get(key);
    if (group === undefined) {
      group = { key, workflowId: record.turn.workflowId ?? null, records: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    (group.records as PromptCaptureRecordSummary[]).push(record);
  }
  return groups;
}

export function regionLabelKey(region: string): string {
  switch (region) {
    case "injected-instruction": return "promptCapture.region.injected";
    case "current-user-message": return "promptCapture.region.currentUser";
    case "history-user": return "promptCapture.region.historyUser";
    case "assistant": return "promptCapture.region.assistant";
    case "tool-result": return "promptCapture.region.toolResult";
    case "system": return "promptCapture.region.system";
    default: return "promptCapture.region.unclassified";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
