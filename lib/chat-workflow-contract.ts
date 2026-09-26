import { validateAgentImages } from "./image-attachments.ts";

export const CHAT_WORKFLOW_ADAPTER_ENABLED = true;

export type ChatWorkflowId = string;

export const DEFAULT_CHAT_WORKFLOW_ID: ChatWorkflowId = "minimal-pi-coding-agent";

/** One image attachment in the Workflow prompt wire format (matches Pi ImageContent). */
export interface ChatWorkflowImageInput {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
}

export type WorkflowAgentToolPolicy =
  | { readonly mode: "pi-default"; readonly addresses?: readonly string[] }
  | { readonly mode: "none" }
  | {
      readonly mode: "explicit";
      readonly names: readonly string[];
      readonly exclude: readonly string[];
      readonly addresses?: readonly string[];
    };

export type WorkflowAgentResources =
  | { readonly mode: "inherit" }
  | {
      readonly mode: "explicit";
      readonly skillPaths: readonly string[];
      readonly extensionPaths: readonly string[];
      readonly pluginSources: readonly string[];
    };

export interface AgentConfigSelection {
  readonly primary?: string;
  readonly append?: readonly string[];
  readonly promptFiles?: readonly string[];
  readonly promptResources?: readonly AgentPromptResourceSelection[];
  readonly tools?: WorkflowAgentToolPolicy;
  readonly resources?: WorkflowAgentResources;
}

export interface AgentPromptResourceSelection {
  readonly id: string;
  readonly target: { readonly type: "personal" } | { readonly type: "project"; readonly projectId: string };
  readonly selectedBy: "user" | "agent";
  readonly reason?: string;
  readonly revision?: number;
}

export interface ChatRootConfig {
  readonly schemaVersion: 1;
  readonly defaultWorkflowId: ChatWorkflowId;
  readonly workflows: Readonly<Record<string, {
    readonly agents: Readonly<Record<string, AgentConfigSelection>>;
  }>>;
  readonly sessions: {
    readonly removedRetentionDays: number;
  };
}

export interface ChatWorkflowPromptInput {
  readonly projectId: string;
  readonly cwd: string;
  readonly prompt: string;
  readonly images?: readonly ChatWorkflowImageInput[];
  readonly sessionId?: string;
  readonly workflow: ChatWorkflowId;
  readonly agentConfigs?: Readonly<Record<string, AgentConfigSelection>>;
  /** Send-time switch for the Workflow's LAST node: "off" runs this round without writing session memory. */
  readonly sessionMemory?: "on" | "off";
}

export interface ChatWorkflowResult {
  readonly text: string;
  readonly sessionId: string;
  readonly sessionFile: string;
  readonly model: {
    readonly provider: string;
    readonly modelId: string;
  } | null;
}

export interface ChatWorkflowPromptResult {
  readonly runId: string;
  readonly result: ChatWorkflowResult;
}

export interface ChatWorkflowRunAccepted {
  readonly runId: string;
  readonly workflowInvocationId: string;
  readonly sessionId: string;
  readonly isNewSession: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${field}必须是字符串数组`);
  }
  return [...new Set(value)];
}

function parseWorkflowAgentResources(value: unknown): WorkflowAgentResources {
  if (!isRecord(value)) throw new Error("Agent resources无效");
  if (value.mode === "inherit") return { mode: "inherit" };
  if (value.mode !== "explicit") throw new Error("Agent resources.mode无效");
  return {
    mode: "explicit",
    skillPaths: parseStringList(value.skillPaths, "skillPaths"),
    extensionPaths: parseStringList(value.extensionPaths, "extensionPaths"),
    pluginSources: parseStringList(value.pluginSources, "pluginSources"),
  };
}

export function parseWorkflowAgentToolPolicy(value: unknown): WorkflowAgentToolPolicy {
  if (!isRecord(value)) throw new Error("Agent tools无效");
  const addresses = value.addresses === undefined ? undefined : parseStringList(value.addresses, "tool addresses");
  if (value.mode === "none") return { mode: "none" };
  if (value.mode === "pi-default") {
    return { mode: "pi-default", ...(addresses === undefined ? {} : { addresses }) };
  }
  if (value.mode !== "explicit") throw new Error("Agent tools.mode无效");
  return {
    mode: "explicit",
    names: value.names === undefined ? [] : parseStringList(value.names, "tool names"),
    exclude: value.exclude === undefined ? [] : parseStringList(value.exclude, "excluded tools"),
    ...(addresses === undefined ? {} : { addresses }),
  };
}

function parsePromptResourceTarget(value: unknown): AgentPromptResourceSelection["target"] {
  if (!isRecord(value)) throw new Error("Prompt资源Target无效");
  if (value.type === "personal" && Object.keys(value).length === 1) return { type: "personal" };
  if (value.type === "project" && typeof value.projectId === "string" && value.projectId.trim() !== "") {
    return { type: "project", projectId: value.projectId };
  }
  throw new Error("Prompt资源Target无效");
}

function parsePromptResourceSelections(value: unknown): AgentPromptResourceSelection[] {
  if (!Array.isArray(value)) throw new Error("promptResources必须是数组");
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.trim() === ""
      || (item.selectedBy !== "user" && item.selectedBy !== "agent")) {
      throw new Error(`promptResources[${index}]无效`);
    }
    if (item.reason !== undefined && (typeof item.reason !== "string" || item.reason.trim() === "")) {
      throw new Error(`promptResources[${index}].reason无效`);
    }
    if (item.revision !== undefined && (!Number.isSafeInteger(item.revision) || (item.revision as number) < 1)) {
      throw new Error(`promptResources[${index}].revision无效`);
    }
    return {
      id: item.id,
      target: parsePromptResourceTarget(item.target),
      selectedBy: item.selectedBy,
      ...(item.reason === undefined ? {} : { reason: item.reason as string }),
      ...(item.revision === undefined ? {} : { revision: item.revision as number }),
    };
  });
}

export function parseAgentConfigSelection(value: unknown): AgentConfigSelection {
  if (!isRecord(value)) throw new Error("Agent配置选择无效");
  const allowed = new Set(["primary", "append", "promptFiles", "promptResources", "tools", "resources"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`Agent配置选择包含未知字段: ${unknown.join(", ")}`);
  if (value.primary !== undefined && (typeof value.primary !== "string" || value.primary.trim() === "")) {
    throw new Error("Agent primary无效");
  }
  return {
    ...(value.primary === undefined ? {} : { primary: value.primary }),
    ...(value.append === undefined ? {} : { append: parseStringList(value.append, "append") }),
    ...(value.promptFiles === undefined ? {} : { promptFiles: parseStringList(value.promptFiles, "promptFiles") }),
    ...(value.promptResources === undefined ? {} : { promptResources: parsePromptResourceSelections(value.promptResources) }),
    ...(value.tools === undefined ? {} : { tools: parseWorkflowAgentToolPolicy(value.tools) }),
    ...(value.resources === undefined ? {} : { resources: parseWorkflowAgentResources(value.resources) }),
  };
}

/** Validates the browser projection of .chat/config.json. */
export function parseChatRootConfig(value: unknown): ChatRootConfig {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.defaultWorkflowId !== "string"
    || value.defaultWorkflowId.trim() === "" || !isRecord(value.workflows)) {
    throw new Error("Chat返回了无效的根配置");
  }
  const workflows: Record<string, { agents: Record<string, AgentConfigSelection> }> = {};
  for (const [workflowId, rawWorkflow] of Object.entries(value.workflows)) {
    if (!isRecord(rawWorkflow) || !isRecord(rawWorkflow.agents)) {
      throw new Error(`Chat返回了无效的Workflow配置: ${workflowId}`);
    }
    const agents: Record<string, AgentConfigSelection> = {};
    for (const [agentId, selection] of Object.entries(rawWorkflow.agents)) {
      agents[agentId] = parseAgentConfigSelection(selection);
    }
    workflows[workflowId] = { agents };
  }
  const rawSessions = value.sessions;
  const removedRetentionDays = rawSessions === undefined
    ? 30
    : isRecord(rawSessions)
      && Number.isInteger(rawSessions.removedRetentionDays)
      && (rawSessions.removedRetentionDays as number) >= 1
      && (rawSessions.removedRetentionDays as number) <= 3650
      ? rawSessions.removedRetentionDays as number
      : null;
  if (removedRetentionDays === null) throw new Error("Chat返回了无效的Session配置");
  return {
    schemaVersion: 1,
    defaultWorkflowId: value.defaultWorkflowId,
    workflows,
    sessions: { removedRetentionDays },
  };
}

/** 校验浏览器提交给Chat后端的文本Prompt和工作目录。 */
export function parseChatWorkflowPromptInput(value: unknown): ChatWorkflowPromptInput {
  if (!isRecord(value)) throw new Error("请求体必须是JSON对象");
  if (typeof value.projectId !== "string" || value.projectId.trim() === "") {
    throw new Error("projectId必须是非空字符串");
  }
  if (typeof value.cwd !== "string" || value.cwd.trim() === "") {
    throw new Error("cwd必须是非空字符串");
  }
  if (typeof value.prompt !== "string") {
    throw new Error("prompt必须是字符串");
  }
  let images: ChatWorkflowImageInput[] | undefined;
  if (value.images !== undefined) {
    const imagesError = validateAgentImages(value.images);
    if (imagesError !== null) throw new Error(imagesError);
    images = (value.images as Array<{ type: "image"; data: string; mimeType: string }>).map((image) => ({
      type: "image",
      data: image.data,
      mimeType: image.mimeType,
    }));
  }
  if (value.prompt.trim() === "" && (images?.length ?? 0) === 0) {
    throw new Error("prompt必须是非空字符串");
  }
  if (value.sessionId !== undefined && (typeof value.sessionId !== "string" || value.sessionId.trim() === "")) {
    throw new Error("sessionId必须是非空字符串");
  }
  if (typeof value.workflow !== "string" || value.workflow.trim() === "") {
    throw new Error("workflow必须是非空字符串");
  }
  if (value.agentConfigs !== undefined && !isRecord(value.agentConfigs)) {
    throw new Error("agentConfigs必须是对象");
  }
  const agentConfigs: Record<string, AgentConfigSelection> = {};
  for (const [agentId, selection] of Object.entries(value.agentConfigs ?? {})) {
    if (agentId.trim() === "") throw new Error("agentConfigs包含空Agent ID");
    agentConfigs[agentId] = parseAgentConfigSelection(selection);
  }
  return {
    projectId: value.projectId,
    cwd: value.cwd,
    prompt: value.prompt,
    workflow: value.workflow,
    ...(images === undefined ? {} : { images }),
    ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
    ...(value.agentConfigs === undefined ? {} : { agentConfigs }),
    ...(value.sessionMemory === undefined ? {} : { sessionMemory: value.sessionMemory as "on" | "off" }),
  };
}

/** Validates the asynchronous Run reference returned at the acceptance boundary. */
export function parseChatWorkflowRunAccepted(value: unknown): ChatWorkflowRunAccepted {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.runId)
    || !isNonEmptyString(value.workflowInvocationId)
    || !isNonEmptyString(value.sessionId)
    || typeof value.isNewSession !== "boolean"
  ) {
    throw new Error("Chat没有返回完整的Workflow Run引用");
  }
  return {
    runId: value.runId,
    workflowInvocationId: value.workflowInvocationId,
    sessionId: value.sessionId,
    isNewSession: value.isNewSession,
  };
}

/** 在网络边界校验Chat返回值，避免把不完整数据交给消息渲染层。 */
export function parseChatWorkflowPromptResult(value: unknown): ChatWorkflowPromptResult {
  if (!isRecord(value) || typeof value.runId !== "string" || !isRecord(value.result)) {
    throw new Error("Chat Workflow返回了无效响应");
  }
  const result = value.result;
  if (
    typeof result.text !== "string"
    || typeof result.sessionId !== "string"
    || typeof result.sessionFile !== "string"
  ) {
    throw new Error("Chat Workflow返回了无效结果");
  }

  const model = result.model;
  let parsedModel: ChatWorkflowResult["model"] = null;
  if (model !== null) {
    if (!isRecord(model) || typeof model.provider !== "string" || typeof model.modelId !== "string") {
      throw new Error("Chat Workflow返回了无效模型信息");
    }
    parsedModel = { provider: model.provider, modelId: model.modelId };
  }

  return {
    runId: value.runId,
    result: {
      text: result.text,
      sessionId: result.sessionId,
      sessionFile: result.sessionFile,
      model: parsedModel,
    },
  };
}
