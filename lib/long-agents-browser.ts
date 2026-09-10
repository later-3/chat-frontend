export type LongAgentAvatar =
  | { readonly kind: "auto" }
  | { readonly kind: "emoji"; readonly emoji: string }
  | { readonly kind: "image"; readonly revision: number };

export interface LongAgentSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly avatar: LongAgentAvatar;
  readonly defaultProjectId: string;
  readonly status: "active" | "archived";
  readonly runtime: "pi";
  readonly configuration: {
    readonly model: { readonly provider: string; readonly modelId: string } | null;
    readonly thinkingLevel: string | null;
    readonly toolMode: "pi-default" | "none" | "explicit";
    readonly channelType: string | null;
  };
  readonly project: {
    readonly started: boolean;
    readonly status: "active" | "paused" | null;
    readonly projectLongAgentId: string | null;
    readonly primarySessionId: string | null;
  } | null;
  readonly available: boolean;
  readonly channelHostAvailable: boolean;
  readonly syncStatus: "ok" | "unavailable";
  readonly syncError?: string;
}

export interface LongAgentBindingSummary {
  readonly id: string;
  readonly projectLongAgentId: string;
  readonly projectId: string;
  readonly chatSessionId: string;
  readonly longAgentId: string;
  readonly channelType: string;
  readonly nanoclawSessionId: string | null;
}

export interface LongAgentsResponse {
  readonly agents: readonly LongAgentSummary[];
  readonly bindings: readonly LongAgentBindingSummary[];
}

export interface LongAgentMessageAccepted {
  readonly accepted: true;
  readonly completed: true;
  readonly sessionId: string;
  readonly projectLongAgentId: string;
  readonly messageId: string;
  readonly turnId: string;
  readonly isNewSession: boolean;
  readonly text: string;
  readonly model: { readonly provider: string; readonly modelId: string } | null;
}

export interface ProjectLongAgentStarted {
  readonly projectLongAgentId: string;
  readonly projectId: string;
  readonly longAgentId: string;
  readonly primarySessionId: string;
  readonly status: "active" | "paused";
  readonly isNewSession: boolean;
}

export interface LongAgentEffectiveConfig {
  readonly model: { readonly provider: string; readonly modelId: string } | null;
  readonly thinkingLevel: string | null;
  readonly modelSource: "explicit" | "chat-default" | null;
  readonly thinkingSource: "explicit" | "chat-default" | null;
}

export interface LongAgentConfigurationDocument {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly agent: {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly avatar: LongAgentAvatar;
    readonly enabled: boolean;
    readonly defaultProjectId: string;
    readonly effective: LongAgentEffectiveConfig;
    readonly definition: {
      readonly schemaVersion: 1;
      readonly id: string;
      readonly name: string;
      readonly description: string;
      readonly model: { readonly provider: string; readonly modelId: string } | null;
      readonly thinkingLevel: string | null;
      readonly systemPrompt: { readonly mode: "pi-default" } | { readonly mode: "replace"; readonly text: string };
      readonly customInstructions: readonly string[];
      readonly tools: WorkflowAgentToolPolicy;
      readonly resources: WorkflowAgentResources;
    };
  };
  readonly channel: {
    readonly type: string;
    readonly instance: string;
    readonly host: {
      readonly id: string;
      readonly name: string;
      readonly executionMode: "chat-pi";
    };
  } | null;
}

export interface LongAgentConfigurationUpdate {
  readonly name: string;
  readonly description: string;
  /** Display avatar; `undefined` keeps the current value, `image` avatars change only via the upload endpoint. */
  readonly avatar?: { readonly kind: "auto" } | { readonly kind: "emoji"; readonly emoji: string };
  readonly enabled: boolean;
  readonly defaultProjectId: string;
  readonly definition: LongAgentConfigurationDocument["agent"]["definition"];
}

function parseAvatar(value: unknown): LongAgentAvatar {
  if (!isRecord(value)) throw new Error("Chat返回了无效LongAgent头像");
  if (value.kind === "auto") return { kind: "auto" };
  if (value.kind === "emoji" && nonEmpty(value.emoji)) return { kind: "emoji", emoji: value.emoji };
  if (value.kind === "image" && Number.isSafeInteger(value.revision) && (value.revision as number) >= 1) {
    return { kind: "image", revision: value.revision as number };
  }
  throw new Error("Chat返回了无效LongAgent头像");
}

export function longAgentAvatarImageUrl(longAgentId: string, revision: number): string {
  return `/api/long-agents/${encodeURIComponent(longAgentId)}/avatar?v=${revision}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseModel(value: unknown): LongAgentMessageAccepted["model"] {
  if (value === null) return null;
  if (!isRecord(value) || !nonEmpty(value.provider) || !nonEmpty(value.modelId)) {
    throw new Error("Chat返回了无效LongAgent模型信息");
  }
  return { provider: value.provider, modelId: value.modelId };
}

function parseAgent(value: unknown): LongAgentSummary {
  if (!isRecord(value) || !nonEmpty(value.id) || !nonEmpty(value.name)
    || typeof value.description !== "string" || !nonEmpty(value.defaultProjectId) || value.runtime !== "pi"
    || !isRecord(value.avatar)
    || !isRecord(value.configuration)
    || (value.configuration.model !== null && !isRecord(value.configuration.model))
    || (isRecord(value.configuration.model)
      && (!nonEmpty(value.configuration.model.provider) || !nonEmpty(value.configuration.model.modelId)))
    || (value.configuration.thinkingLevel !== null && !nonEmpty(value.configuration.thinkingLevel))
    || (value.status !== "active" && value.status !== "archived")
    || (value.configuration.toolMode !== "pi-default"
      && value.configuration.toolMode !== "none" && value.configuration.toolMode !== "explicit")
    || (value.configuration.channelType !== null && !nonEmpty(value.configuration.channelType))
    || typeof value.available !== "boolean" || typeof value.channelHostAvailable !== "boolean"
    || (value.syncStatus !== "ok" && value.syncStatus !== "unavailable")
    || (value.syncError !== undefined && typeof value.syncError !== "string")) {
    throw new Error("Chat返回了无效LongAgent摘要");
  }
  let project: LongAgentSummary["project"] = null;
  if (value.project !== null) {
    if (!isRecord(value.project) || typeof value.project.started !== "boolean"
      || (value.project.status !== null && value.project.status !== "active" && value.project.status !== "paused")
      || (value.project.projectLongAgentId !== null && !nonEmpty(value.project.projectLongAgentId))
      || (value.project.primarySessionId !== null && !nonEmpty(value.project.primarySessionId))) {
      throw new Error("Chat返回了无效Project Long Agent状态");
    }
    project = {
      started: value.project.started,
      status: value.project.status,
      projectLongAgentId: value.project.projectLongAgentId,
      primarySessionId: value.project.primarySessionId,
    };
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    avatar: parseAvatar(value.avatar),
    defaultProjectId: value.defaultProjectId,
    status: value.status,
    runtime: "pi",
    configuration: {
      model: value.configuration.model === null
        ? null
        : {
            provider: (value.configuration.model as Record<string, unknown>).provider as string,
            modelId: (value.configuration.model as Record<string, unknown>).modelId as string,
          },
      thinkingLevel: value.configuration.thinkingLevel as string | null,
      toolMode: value.configuration.toolMode,
      channelType: value.configuration.channelType,
    },
    project,
    available: value.available,
    channelHostAvailable: value.channelHostAvailable,
    syncStatus: value.syncStatus,
    ...(typeof value.syncError === "string" ? { syncError: value.syncError } : {}),
  };
}

function parseBinding(value: unknown): LongAgentBindingSummary {
  if (!isRecord(value) || !nonEmpty(value.id) || !nonEmpty(value.projectLongAgentId) || !nonEmpty(value.projectId)
    || !nonEmpty(value.chatSessionId) || !nonEmpty(value.longAgentId)
    || !nonEmpty(value.channelType)
    || (value.nanoclawSessionId !== null && !nonEmpty(value.nanoclawSessionId))) {
    throw new Error("Chat返回了无效LongAgent绑定");
  }
  return {
    id: value.id,
    projectLongAgentId: value.projectLongAgentId,
    projectId: value.projectId,
    chatSessionId: value.chatSessionId,
    longAgentId: value.longAgentId,
    channelType: value.channelType,
    nanoclawSessionId: value.nanoclawSessionId,
  };
}

function parseProjectLongAgentStarted(value: unknown): ProjectLongAgentStarted {
  if (!isRecord(value) || !nonEmpty(value.projectLongAgentId) || !nonEmpty(value.projectId)
    || !nonEmpty(value.longAgentId) || !nonEmpty(value.primarySessionId)
    || (value.status !== "active" && value.status !== "paused")
    || typeof value.isNewSession !== "boolean") {
    throw new Error("Chat返回了无效Project Long Agent启动结果");
  }
  return {
    projectLongAgentId: value.projectLongAgentId,
    projectId: value.projectId,
    longAgentId: value.longAgentId,
    primarySessionId: value.primarySessionId,
    status: value.status,
    isNewSession: value.isNewSession,
  };
}

function parseStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Chat返回了无效的${field}`);
  }
  return value as string[];
}

function parseResources(value: unknown): WorkflowAgentResources {
  if (!isRecord(value)) throw new Error("Chat返回了无效的Long Agent资源策略");
  if (value.mode === "inherit") return { mode: "inherit" };
  if (value.mode !== "explicit") throw new Error("Chat返回了无效的Long Agent资源策略");
  return {
    mode: "explicit",
    skillPaths: parseStringList(value.skillPaths, "Long Agent Skill路径"),
    extensionPaths: parseStringList(value.extensionPaths, "Long Agent Extension路径"),
    pluginSources: parseStringList(value.pluginSources, "Long Agent Plugin来源"),
  };
}

function parseEffective(value: unknown): LongAgentEffectiveConfig {
  if (!isRecord(value)
    || (value.model !== null && (!isRecord(value.model) || !nonEmpty(value.model.provider) || !nonEmpty(value.model.modelId)))
    || (value.thinkingLevel !== null && !nonEmpty(value.thinkingLevel))
    || (value.modelSource !== null && value.modelSource !== "explicit" && value.modelSource !== "chat-default")
    || (value.thinkingSource !== null
      && value.thinkingSource !== "explicit" && value.thinkingSource !== "chat-default")) {
    throw new Error("Chat返回了无效Long Agent生效配置");
  }
  return {
    model: value.model === null
      ? null
      : {
          provider: (value.model as Record<string, unknown>).provider as string,
          modelId: (value.model as Record<string, unknown>).modelId as string,
        },
    thinkingLevel: value.thinkingLevel as string | null,
    modelSource: value.modelSource as LongAgentEffectiveConfig["modelSource"],
    thinkingSource: value.thinkingSource as LongAgentEffectiveConfig["thinkingSource"],
  };
}

function parseLongAgentConfiguration(value: unknown): LongAgentConfigurationDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || !nonEmpty(value.revision)
    || !/^[a-f0-9]{64}$/.test(value.revision) || !isRecord(value.agent)
    || !nonEmpty(value.agent.id) || !nonEmpty(value.agent.name) || !nonEmpty(value.agent.description)
    || !isRecord(value.agent.avatar)
    || !isRecord(value.agent.effective)
    || typeof value.agent.enabled !== "boolean" || !nonEmpty(value.agent.defaultProjectId)
    || !isRecord(value.agent.definition) || value.agent.definition.schemaVersion !== 1
    || value.agent.definition.id !== value.agent.id || value.agent.definition.name !== value.agent.name
    || value.agent.definition.description !== value.agent.description
    || !isRecord(value.agent.definition.systemPrompt)
    || !Array.isArray(value.agent.definition.customInstructions)
    || (value.channel !== null
      && (!isRecord(value.channel) || !nonEmpty(value.channel.type) || !nonEmpty(value.channel.instance)
        || !isRecord(value.channel.host) || !nonEmpty(value.channel.host.id) || !nonEmpty(value.channel.host.name)
        || value.channel.host.executionMode !== "chat-pi"))) {
    throw new Error("Chat返回了无效Long Agent配置");
  }
  const rawDefinition = value.agent.definition;
  const rawSystemPrompt = rawDefinition.systemPrompt;
  const rawCustomInstructions = rawDefinition.customInstructions;
  if (!isRecord(rawSystemPrompt) || !Array.isArray(rawCustomInstructions)) {
    throw new Error("Chat返回了无效Long Agent Prompt配置");
  }
  const model = rawDefinition.model === undefined
    ? null
    : parseModel(rawDefinition.model);
  const thinkingLevel = rawDefinition.thinkingLevel === undefined || rawDefinition.thinkingLevel === null
    ? null
    : nonEmpty(rawDefinition.thinkingLevel)
      ? rawDefinition.thinkingLevel
      : (() => { throw new Error("Chat返回了无效Long Agent Thinking Level"); })();
  let systemPrompt: LongAgentConfigurationDocument["agent"]["definition"]["systemPrompt"];
  if (rawSystemPrompt.mode === "pi-default") {
    systemPrompt = { mode: "pi-default" };
  } else if (rawSystemPrompt.mode === "replace" && nonEmpty(rawSystemPrompt.text)) {
    systemPrompt = { mode: "replace", text: rawSystemPrompt.text };
  } else {
    throw new Error("Chat返回了无效Long Agent System Prompt");
  }
  const customInstructions = rawCustomInstructions.map((instruction, index) => {
    if (typeof instruction === "string") return instruction;
    if (!isRecord(instruction) || typeof instruction.text !== "string") {
      throw new Error(`Chat返回了无效Long Agent自定义指令[${index}]`);
    }
    return instruction.text;
  });
  return {
    schemaVersion: 1,
    revision: value.revision,
    agent: {
      id: value.agent.id,
      name: value.agent.name,
      description: value.agent.description,
      avatar: parseAvatar(value.agent.avatar),
      enabled: value.agent.enabled,
      defaultProjectId: value.agent.defaultProjectId,
      effective: parseEffective(value.agent.effective),
      definition: {
        schemaVersion: 1,
        id: rawDefinition.id as string,
        name: rawDefinition.name as string,
        description: rawDefinition.description as string,
        model,
        thinkingLevel,
        systemPrompt,
        customInstructions,
        tools: parseWorkflowAgentToolPolicy(rawDefinition.tools),
        resources: parseResources(rawDefinition.resources),
      },
    },
    channel: value.channel === null
      ? null
      : {
          type: (value.channel as Record<string, unknown>).type as string,
          instance: (value.channel as Record<string, unknown>).instance as string,
          host: {
            id: ((value.channel as Record<string, unknown>).host as Record<string, unknown>).id as string,
            name: ((value.channel as Record<string, unknown>).host as Record<string, unknown>).name as string,
            executionMode: "chat-pi",
          },
        },
  };
}

async function responseBody(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = isRecord(body)
      ? [body.statusMessage, body.message, body.error]
          .find((value): value is string => typeof value === "string" && value.trim() !== "")
      : undefined;
    throw new Error(message ?? `HTTP ${response.status}`);
  }
  return body;
}

export async function fetchLongAgents(projectId: string, signal?: AbortSignal): Promise<LongAgentsResponse> {
  const query = new URLSearchParams({ projectId });
  const response = await fetch(`/api/long-agents?${query.toString()}`, {
    cache: "no-store",
    ...(signal === undefined ? {} : { signal }),
  });
  const body = await responseBody(response);
  if (!isRecord(body) || !Array.isArray(body.agents) || !Array.isArray(body.bindings)) {
    throw new Error("Chat返回了无效LongAgent列表");
  }
  return { agents: body.agents.map(parseAgent), bindings: body.bindings.map(parseBinding) };
}

export async function sendLongAgentMessage(input: {
  readonly longAgentId: string;
  readonly projectId: string;
  readonly sessionId?: string;
  readonly text: string;
}, signal?: AbortSignal): Promise<LongAgentMessageAccepted> {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(input.longAgentId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: input.projectId,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      text: input.text,
    }),
    ...(signal === undefined ? {} : { signal }),
  });
  const body = await responseBody(response);
  if (!isRecord(body) || body.accepted !== true || body.completed !== true || !nonEmpty(body.sessionId)
    || !nonEmpty(body.projectLongAgentId) || !nonEmpty(body.messageId) || !nonEmpty(body.turnId)
    || typeof body.isNewSession !== "boolean" || typeof body.text !== "string") {
    throw new Error("Chat返回了无效LongAgent消息确认");
  }
  const model = parseModel(body.model);
  return {
    accepted: true,
    completed: true,
    sessionId: body.sessionId,
    projectLongAgentId: body.projectLongAgentId,
    messageId: body.messageId,
    turnId: body.turnId,
    isNewSession: body.isNewSession,
    text: body.text,
    model,
  };
}

export async function startProjectLongAgent(input: {
  readonly longAgentId: string;
  readonly projectId: string;
}, signal?: AbortSignal): Promise<ProjectLongAgentStarted> {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(input.longAgentId)}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: input.projectId }),
    ...(signal === undefined ? {} : { signal }),
  });
  return parseProjectLongAgentStarted(await responseBody(response));
}

/** Creates one Long Agent with full Backend provisioning (S2 lifecycle). */
export async function createChatLongAgent(input: {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly instanceId: string;
  readonly nanoclawAgentGroupId: string;
}): Promise<void> {
  const response = await fetch("/api/long-agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
}

/** Archives or restores one Long Agent (S2 lifecycle). */
export async function setChatLongAgentArchived(longAgentId: string, archived: boolean): Promise<void> {
  const response = await fetch(
    `/api/long-agents/${encodeURIComponent(longAgentId)}/archive${archived ? "" : "?restore=true"}`,
    { method: "POST", credentials: "same-origin" },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
}

/** Deletes one archived Long Agent (two-phase contract). */
export async function deleteChatLongAgent(longAgentId: string): Promise<void> {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(longAgentId)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
}

export async function fetchLongAgentConfiguration(
  longAgentId: string,
  signal?: AbortSignal,
): Promise<LongAgentConfigurationDocument> {
  const response = await fetch(`/api/long-agents/${encodeURIComponent(longAgentId)}/config`, {
    cache: "no-store",
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  return parseLongAgentConfiguration(await responseBody(response));
}

/** Fetches the Long Agent's effective assembly resolved by the Backend through the same path as execution. */
export async function fetchLongAgentInspection(
  longAgentId: string,
  projectId?: string,
  signal?: AbortSignal,
): Promise<WorkflowAgentInspection> {
  const query = projectId === undefined ? "" : `?projectId=${encodeURIComponent(projectId)}`;
  const response = await fetch(`/api/long-agents/${encodeURIComponent(longAgentId)}/inspection${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  return parseWorkflowAgentInspection(await responseBody(response), "Long Agent解析检查");
}

export async function saveLongAgentConfiguration(
  longAgentId: string,
  expectedRevision: string,
  update: LongAgentConfigurationUpdate,
  signal?: AbortSignal,
): Promise<LongAgentConfigurationDocument> {
  const definition = {
    schemaVersion: 1,
    id: update.definition.id,
    name: update.name,
    description: update.description,
    ...(update.definition.model === null ? {} : { model: update.definition.model }),
    ...(update.definition.thinkingLevel === null ? {} : { thinkingLevel: update.definition.thinkingLevel }),
    systemPrompt: update.definition.systemPrompt,
    customInstructions: update.definition.customInstructions,
    tools: update.definition.tools,
    resources: update.definition.resources,
  };
  const response = await fetch(`/api/long-agents/${encodeURIComponent(longAgentId)}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schemaVersion: 1,
      expectedRevision,
      name: update.name,
      description: update.description,
      ...(update.avatar === undefined ? {} : { avatar: update.avatar }),
      enabled: update.enabled,
      defaultProjectId: update.defaultProjectId,
      definition,
    }),
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  return parseLongAgentConfiguration(await responseBody(response));
}

/** Uploads a new image avatar as raw bytes; returns the updated configuration with its new revision. */
export async function uploadLongAgentAvatar(input: {
  readonly longAgentId: string;
  readonly bytes: Blob;
  readonly expectedRevision: string;
}): Promise<LongAgentConfigurationDocument> {
  const query = new URLSearchParams({ expectedRevision: input.expectedRevision });
  const response = await fetch(
    `/api/long-agents/${encodeURIComponent(input.longAgentId)}/avatar?${query.toString()}`,
    {
      method: "PUT",
      headers: { "Content-Type": input.bytes.type || "application/octet-stream" },
      body: input.bytes,
      credentials: "same-origin",
    },
  );
  return parseLongAgentConfiguration(await responseBody(response));
}

/** Removes the image avatar and restores the derived display identity. */
export async function deleteLongAgentAvatar(input: {
  readonly longAgentId: string;
  readonly expectedRevision: string;
}): Promise<LongAgentConfigurationDocument> {
  const query = new URLSearchParams({ expectedRevision: input.expectedRevision });
  const response = await fetch(
    `/api/long-agents/${encodeURIComponent(input.longAgentId)}/avatar?${query.toString()}`,
    { method: "DELETE", credentials: "same-origin" },
  );
  return parseLongAgentConfiguration(await responseBody(response));
}

import {
  parseWorkflowAgentInspection,
  type WorkflowAgentInspection,
} from "./chat-workflows-browser.ts";
import {
  parseWorkflowAgentToolPolicy,
  type WorkflowAgentResources,
  type WorkflowAgentToolPolicy,
} from "./chat-workflow-contract.ts";
