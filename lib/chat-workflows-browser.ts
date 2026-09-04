import type {
  AgentConfigSelection,
  ChatRootConfig,
  ChatWorkflowId,
  WorkflowAgentToolPolicy,
  WorkflowAgentResources,
} from "./chat-workflow-contract";
import { parseChatRootConfig, parseWorkflowAgentToolPolicy } from "./chat-workflow-contract.ts";

interface BrowserSourceInfo {
  readonly path: string;
  readonly source: string;
  readonly scope: string;
  readonly origin: string;
  readonly baseDir?: string;
}

interface BrowserResourceVersion {
  readonly kind: "file" | "directory";
  readonly size: number;
  readonly modifiedAt: string;
  readonly contentHash?: string;
}

export interface ChatWorkflowAgentSummary {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly model?: { readonly provider: string; readonly modelId: string };
  readonly thinkingLevel?: string;
  readonly systemPrompt: { readonly mode: "pi-default" } | { readonly mode: "replace"; readonly text: string };
  readonly customInstructions: readonly { readonly text: string; readonly sourcePath?: string }[];
  readonly tools: WorkflowAgentToolPolicy;
  readonly resources: WorkflowAgentResources;
  readonly configPath?: string;
}

export type ChatWorkflowNodeSummary = {
  readonly kind: "agent";
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly agentId: string;
} | {
  readonly kind: "task";
  readonly id: string;
  readonly name: string;
  readonly description: string;
};

export interface ChatWorkflowSummary {
  readonly id: ChatWorkflowId;
  readonly name: string;
  readonly description: string;
  readonly agentCallable: boolean;
  readonly planReview: boolean;
  readonly nodes: readonly ChatWorkflowNodeSummary[];
  readonly agents: readonly ChatWorkflowAgentSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`Chat返回了无效的${field}`);
  }
  return value;
}

function readOptionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : readString(value, field);
}

function readStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Chat返回了无效的${field}`);
  return value.map((item, index) => readString(item, `${field}[${index}]`));
}

function parseModel(value: unknown, field: string): { provider: string; modelId: string } {
  if (!isRecord(value)) throw new Error(`Chat返回了无效的${field}`);
  return {
    provider: readString(value.provider, `${field}.provider`),
    modelId: readString(value.modelId, `${field}.modelId`),
  };
}

function parseBrowserResources(value: unknown): WorkflowAgentResources {
  if (!isRecord(value)) throw new Error("Chat返回了无效的Agent resources");
  if (value.mode === "inherit") return { mode: "inherit" };
  if (value.mode !== "explicit") throw new Error("Chat返回了无效的Agent resources.mode");
  return {
    mode: "explicit",
    skillPaths: readStringList(value.skillPaths, "Agent resources.skillPaths"),
    extensionPaths: readStringList(value.extensionPaths, "Agent resources.extensionPaths"),
    pluginSources: readStringList(value.pluginSources, "Agent resources.pluginSources"),
  };
}

function parsePromptResourceTarget(value: unknown): { type: "personal" } | { type: "project"; projectId: string } {
  if (!isRecord(value)) throw new Error("Chat返回了无效的Prompt资源Target");
  if (value.type === "personal") return { type: "personal" };
  if (value.type === "project") {
    return { type: "project", projectId: readString(value.projectId, "Prompt资源Target projectId") };
  }
  throw new Error("Chat返回了无效的Prompt资源Target");
}

function parsePromptResourceInspection(value: unknown): WorkflowAgentInspection["promptResources"][number] {
  if (!isRecord(value) || (value.kind !== "rule" && value.kind !== "experience")
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) {
    throw new Error("Chat返回了无效的Prompt资源解析结果");
  }
  return {
    id: readString(value.id, "Prompt资源ID"),
    target: parsePromptResourceTarget(value.target),
    revision: value.revision as number,
    kind: value.kind,
    title: readString(value.title, "Prompt资源标题"),
  };
}

function parseAgentSummary(value: unknown): ChatWorkflowAgentSummary {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error("Chat返回了无效的Workflow Agent");
  const systemPrompt = value.systemPrompt;
  if (!isRecord(systemPrompt)) throw new Error("Chat返回了无效的Agent System Prompt");
  let parsedSystemPrompt: ChatWorkflowAgentSummary["systemPrompt"];
  if (systemPrompt.mode === "pi-default") {
    parsedSystemPrompt = { mode: "pi-default" };
  } else if (systemPrompt.mode === "replace") {
    parsedSystemPrompt = {
      mode: "replace",
      text: readString(systemPrompt.text, "Agent System Prompt text"),
      ...(readOptionalString(systemPrompt.sourcePath, "Agent System Prompt sourcePath") === undefined
        ? {}
        : { sourcePath: systemPrompt.sourcePath as string }),
    };
  } else {
    throw new Error("Chat返回了无效的Agent System Prompt mode");
  }

  if (!Array.isArray(value.customInstructions)) throw new Error("Chat返回了无效的Agent customInstructions");
  const customInstructions = value.customInstructions.map((instruction, index) => {
    if (!isRecord(instruction)) throw new Error(`Chat返回了无效的Agent customInstructions[${index}]`);
    const sourcePath = readOptionalString(instruction.sourcePath, `Agent customInstructions[${index}].sourcePath`);
    if (instruction.promptResource !== undefined) parsePromptResourceInspection(instruction.promptResource);
    return {
      text: readString(instruction.text, `Agent customInstructions[${index}].text`),
      ...(sourcePath === undefined ? {} : { sourcePath }),
    };
  });

  const tools = parseWorkflowAgentToolPolicy(value.tools);

  const model = value.model === undefined ? undefined : parseModel(value.model, "Agent model");
  const thinkingLevel = readOptionalString(value.thinkingLevel, "Agent thinkingLevel");
  const configPath = readOptionalString(value.configPath, "Agent configPath");
  return {
    schemaVersion: 1,
    id: readString(value.id, "Agent id"),
    name: readString(value.name, "Agent name"),
    description: readString(value.description, "Agent description", true),
    ...(model === undefined ? {} : { model }),
    ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
    systemPrompt: parsedSystemPrompt,
    customInstructions,
    tools,
    resources: parseBrowserResources(value.resources),
    ...(configPath === undefined ? {} : { configPath }),
  };
}

/** Validates the browser-safe subset used by the Workflow selector. */
export function parseChatWorkflowSummaries(value: unknown): ChatWorkflowSummary[] {
  if (!isRecord(value) || !Array.isArray(value.workflows)) {
    throw new Error("Chat返回了无效的Workflow列表");
  }

  return value.workflows.map((workflow) => {
    if (
      !isRecord(workflow)
      || typeof workflow.id !== "string"
      || workflow.id.trim() === ""
      || typeof workflow.name !== "string"
      || workflow.name.trim() === ""
      || typeof workflow.description !== "string"
      || typeof workflow.agentCallable !== "boolean"
      || typeof workflow.planReview !== "boolean"
    ) {
      throw new Error("Chat返回了无效的Workflow定义");
    }
    if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.agents)) {
      throw new Error("Chat返回了无效的Workflow结构");
    }
    const nodes = workflow.nodes.map((node): ChatWorkflowNodeSummary => {
      if (!isRecord(node) || typeof node.id !== "string" || typeof node.name !== "string"
        || typeof node.description !== "string") {
        throw new Error("Chat返回了无效的Workflow Node");
      }
      if (node.kind === "agent" && typeof node.agentId === "string") {
        return { kind: "agent", id: node.id, name: node.name, description: node.description, agentId: node.agentId };
      }
      if (node.kind === "task") {
        return { kind: "task", id: node.id, name: node.name, description: node.description };
      }
      throw new Error("Chat返回了无效的Workflow Node类型");
    });
    const agents = workflow.agents.map(parseAgentSummary);
    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      agentCallable: workflow.agentCallable,
      planReview: workflow.planReview,
      nodes,
      agents,
    };
  });
}

export interface WorkflowAgentInspection {
  readonly agent: ChatWorkflowAgentSummary & {
    readonly sources: readonly { readonly kind: string; readonly path?: string }[];
    readonly effectiveModel: { readonly provider: string; readonly modelId: string } | null;
    readonly effectiveThinkingLevel: string;
    readonly durableConfig: {
      readonly model?: { readonly provider: string; readonly modelId: string };
      readonly thinkingLevel?: string;
      readonly tools?: WorkflowAgentToolPolicy;
    } | null;
  };
  readonly prompt: {
    readonly final: string;
    readonly base: { readonly mode: string; readonly text?: string; readonly sourcePath: string | null };
    readonly append: readonly { readonly text: string; readonly sourcePath: string | null }[];
    readonly contextFiles: readonly { readonly path: string; readonly content: string }[];
  };
  readonly tools: readonly {
    readonly name: string;
    readonly label: string;
    readonly description: string;
    readonly parameters: unknown;
    readonly promptGuidelines: readonly string[];
    readonly sourceInfo: BrowserSourceInfo;
    readonly address?: string;
    readonly version: BrowserResourceVersion | null;
    readonly toolVersion?: string;
    readonly risk?: "read-only" | "write" | "destructive";
    readonly permissions?: readonly string[];
    readonly active: boolean;
  }[];
  readonly skills: readonly {
    readonly name: string;
    readonly description: string;
    readonly filePath: string;
    readonly content?: string;
    readonly error?: string;
    readonly baseDir: string;
    readonly disableModelInvocation: boolean;
    readonly sourceInfo: BrowserSourceInfo;
    readonly address?: string;
    readonly version: BrowserResourceVersion | null;
  }[];
  readonly extensions: readonly {
    readonly path: string;
    readonly resolvedPath: string;
    readonly sourceInfo: BrowserSourceInfo;
    readonly address?: string;
    readonly version: BrowserResourceVersion | null;
    readonly capabilities: {
      readonly tools: readonly string[];
      readonly commands: readonly string[];
      readonly flags: readonly string[];
      readonly shortcuts: readonly string[];
      readonly eventHandlers: readonly string[];
      readonly hasMarkdownTransformer: boolean;
    };
  }[];
  readonly plugins: readonly {
    readonly source: string;
    readonly scope: string;
    readonly skills: readonly string[];
    readonly extensions: readonly string[];
    readonly prompts: readonly string[];
  }[];
  readonly prompts: readonly {
    readonly name: string;
    readonly description: string;
    readonly filePath: string;
    readonly content: string;
    readonly sourceInfo: BrowserSourceInfo;
    readonly address?: string;
    readonly version: BrowserResourceVersion | null;
  }[];
  readonly promptResources: readonly {
    readonly id: string;
    readonly target: { readonly type: "personal" } | { readonly type: "project"; readonly projectId: string };
    readonly revision: number;
    readonly kind: "rule" | "experience";
    readonly title: string;
  }[];
  readonly diagnostics: readonly { readonly resource: string; readonly type: string; readonly message: string; readonly path?: string }[];
}

function parseSourceInfo(value: unknown, field: string): BrowserSourceInfo {
  if (!isRecord(value)) throw new Error(`Chat返回了无效的${field}`);
  const baseDir = readOptionalString(value.baseDir, `${field}.baseDir`);
  return {
    path: readString(value.path, `${field}.path`),
    source: readString(value.source, `${field}.source`),
    scope: readString(value.scope, `${field}.scope`),
    origin: readString(value.origin, `${field}.origin`),
    ...(baseDir === undefined ? {} : { baseDir }),
  };
}

function parseVersion(value: unknown, field: string): BrowserResourceVersion | null {
  if (value === null) return null;
  if (!isRecord(value) || (value.kind !== "file" && value.kind !== "directory")
    || typeof value.size !== "number" || !Number.isFinite(value.size) || value.size < 0) {
    throw new Error(`Chat返回了无效的${field}`);
  }
  const contentHash = readOptionalString(value.contentHash, `${field}.contentHash`);
  return {
    kind: value.kind,
    size: value.size,
    modifiedAt: readString(value.modifiedAt, `${field}.modifiedAt`),
    ...(contentHash === undefined ? {} : { contentHash }),
  };
}

function parseAddress(value: unknown, field: string): string | undefined {
  return readOptionalString(value, field);
}

function parseWorkflowAgentInspection(value: unknown, field: string): WorkflowAgentInspection {
  if (!isRecord(value)) throw new Error(`Chat返回了无效的${field}`);
  const rawAgent = value.agent;
  if (!isRecord(rawAgent)) throw new Error(`Chat返回了无效的${field}.agent`);
  const agentSummary = parseAgentSummary(rawAgent);
  if (!Array.isArray(rawAgent.sources)) throw new Error(`Chat返回了无效的${field}.agent.sources`);
  const sources = rawAgent.sources.map((source, index) => {
    if (!isRecord(source)) throw new Error(`Chat返回了无效的${field}.agent.sources[${index}]`);
    const path = readOptionalString(source.path, `${field}.agent.sources[${index}].path`);
    if (source.resourceTarget !== undefined) parsePromptResourceTarget(source.resourceTarget);
    if (source.resourceId !== undefined) readString(source.resourceId, `${field}.agent.sources[${index}].resourceId`);
    if (source.revision !== undefined
      && (!Number.isSafeInteger(source.revision) || (source.revision as number) < 1)) {
      throw new Error(`Chat返回了无效的${field}.agent.sources[${index}].revision`);
    }
    return {
      kind: readString(source.kind, `${field}.agent.sources[${index}].kind`),
      ...(path === undefined ? {} : { path }),
    };
  });
  const effectiveModel = rawAgent.effectiveModel === null
    ? null
    : parseModel(rawAgent.effectiveModel, `${field}.agent.effectiveModel`);
  let durableConfig: WorkflowAgentInspection["agent"]["durableConfig"] = null;
  if (rawAgent.durableConfig !== null) {
    if (!isRecord(rawAgent.durableConfig)) throw new Error(`Chat返回了无效的${field}.agent.durableConfig`);
    durableConfig = {
      ...(rawAgent.durableConfig.model === undefined
        ? {}
        : { model: parseModel(rawAgent.durableConfig.model, `${field}.agent.durableConfig.model`) }),
      ...(rawAgent.durableConfig.thinkingLevel === undefined
        ? {}
        : { thinkingLevel: readString(rawAgent.durableConfig.thinkingLevel, `${field}.agent.durableConfig.thinkingLevel`) }),
      ...(rawAgent.durableConfig.tools === undefined
        ? {}
        : { tools: parseWorkflowAgentToolPolicy(rawAgent.durableConfig.tools) }),
    };
  }
  const agent: WorkflowAgentInspection["agent"] = {
    ...agentSummary,
    sources,
    effectiveModel,
    effectiveThinkingLevel: readString(rawAgent.effectiveThinkingLevel, `${field}.agent.effectiveThinkingLevel`),
    durableConfig,
  };

  const rawPrompt = value.prompt;
  if (!isRecord(rawPrompt) || !isRecord(rawPrompt.base) || !Array.isArray(rawPrompt.append)
    || !Array.isArray(rawPrompt.contextFiles)) {
    throw new Error(`Chat返回了无效的${field}.prompt`);
  }
  const baseSourcePath = rawPrompt.base.sourcePath === null
    ? null
    : readString(rawPrompt.base.sourcePath, `${field}.prompt.base.sourcePath`);
  const baseText = readOptionalString(rawPrompt.base.text, `${field}.prompt.base.text`);
  const prompt: WorkflowAgentInspection["prompt"] = {
    final: readString(rawPrompt.final, `${field}.prompt.final`, true),
    base: {
      mode: readString(rawPrompt.base.mode, `${field}.prompt.base.mode`),
      ...(baseText === undefined ? {} : { text: baseText }),
      sourcePath: baseSourcePath,
    },
    append: rawPrompt.append.map((item, index) => {
      if (!isRecord(item)) throw new Error(`Chat返回了无效的${field}.prompt.append[${index}]`);
      return {
        text: readString(item.text, `${field}.prompt.append[${index}].text`, true),
        sourcePath: item.sourcePath === null
          ? null
          : readString(item.sourcePath, `${field}.prompt.append[${index}].sourcePath`),
      };
    }),
    contextFiles: rawPrompt.contextFiles.map((item, index) => {
      if (!isRecord(item)) throw new Error(`Chat返回了无效的${field}.prompt.contextFiles[${index}]`);
      return {
        path: readString(item.path, `${field}.prompt.contextFiles[${index}].path`),
        content: readString(item.content, `${field}.prompt.contextFiles[${index}].content`, true),
      };
    }),
  };

  if (!Array.isArray(value.tools) || !Array.isArray(value.skills) || !Array.isArray(value.extensions)
    || !Array.isArray(value.plugins) || !Array.isArray(value.prompts)
    || !Array.isArray(value.promptResources) || !Array.isArray(value.diagnostics)) {
    throw new Error(`Chat返回了无效的${field}资源集合`);
  }
  const tools = value.tools.map((tool, index): WorkflowAgentInspection["tools"][number] => {
    if (!isRecord(tool) || !("parameters" in tool) || typeof tool.active !== "boolean") {
      throw new Error(`Chat返回了无效的${field}.tools[${index}]`);
    }
    const address = parseAddress(tool.address, `${field}.tools[${index}].address`);
    const toolVersion = readOptionalString(tool.toolVersion, `${field}.tools[${index}].toolVersion`);
    const risk = tool.risk;
    if (risk !== undefined && risk !== "read-only" && risk !== "write" && risk !== "destructive") {
      throw new Error(`Chat返回了无效的${field}.tools[${index}].risk`);
    }
    const permissions = tool.permissions === undefined
      ? undefined
      : readStringList(tool.permissions, `${field}.tools[${index}].permissions`);
    return {
      name: readString(tool.name, `${field}.tools[${index}].name`),
      label: readString(tool.label, `${field}.tools[${index}].label`),
      description: readString(tool.description, `${field}.tools[${index}].description`, true),
      parameters: tool.parameters,
      promptGuidelines: readStringList(tool.promptGuidelines, `${field}.tools[${index}].promptGuidelines`),
      sourceInfo: parseSourceInfo(tool.sourceInfo, `${field}.tools[${index}].sourceInfo`),
      ...(address === undefined ? {} : { address }),
      version: parseVersion(tool.version, `${field}.tools[${index}].version`),
      ...(toolVersion === undefined ? {} : { toolVersion }),
      ...(risk === undefined ? {} : { risk }),
      ...(permissions === undefined ? {} : { permissions }),
      active: tool.active,
    };
  });
  const skills = value.skills.map((skill, index): WorkflowAgentInspection["skills"][number] => {
    if (!isRecord(skill) || typeof skill.disableModelInvocation !== "boolean") {
      throw new Error(`Chat返回了无效的${field}.skills[${index}]`);
    }
    const content = readOptionalString(skill.content, `${field}.skills[${index}].content`);
    const error = readOptionalString(skill.error, `${field}.skills[${index}].error`);
    const address = parseAddress(skill.address, `${field}.skills[${index}].address`);
    return {
      name: readString(skill.name, `${field}.skills[${index}].name`),
      description: readString(skill.description, `${field}.skills[${index}].description`, true),
      filePath: readString(skill.filePath, `${field}.skills[${index}].filePath`),
      baseDir: readString(skill.baseDir, `${field}.skills[${index}].baseDir`),
      disableModelInvocation: skill.disableModelInvocation,
      ...(content === undefined ? {} : { content }),
      ...(error === undefined ? {} : { error }),
      sourceInfo: parseSourceInfo(skill.sourceInfo, `${field}.skills[${index}].sourceInfo`),
      ...(address === undefined ? {} : { address }),
      version: parseVersion(skill.version, `${field}.skills[${index}].version`),
    };
  });
  const extensions = value.extensions.map((extension, index): WorkflowAgentInspection["extensions"][number] => {
    if (!isRecord(extension) || !isRecord(extension.capabilities)
      || typeof extension.capabilities.hasMarkdownTransformer !== "boolean") {
      throw new Error(`Chat返回了无效的${field}.extensions[${index}]`);
    }
    const address = parseAddress(extension.address, `${field}.extensions[${index}].address`);
    return {
      path: readString(extension.path, `${field}.extensions[${index}].path`),
      resolvedPath: readString(extension.resolvedPath, `${field}.extensions[${index}].resolvedPath`),
      sourceInfo: parseSourceInfo(extension.sourceInfo, `${field}.extensions[${index}].sourceInfo`),
      ...(address === undefined ? {} : { address }),
      version: parseVersion(extension.version, `${field}.extensions[${index}].version`),
      capabilities: {
        tools: readStringList(extension.capabilities.tools, `${field}.extensions[${index}].capabilities.tools`),
        commands: readStringList(extension.capabilities.commands, `${field}.extensions[${index}].capabilities.commands`),
        flags: readStringList(extension.capabilities.flags, `${field}.extensions[${index}].capabilities.flags`),
        shortcuts: readStringList(extension.capabilities.shortcuts, `${field}.extensions[${index}].capabilities.shortcuts`),
        eventHandlers: readStringList(extension.capabilities.eventHandlers, `${field}.extensions[${index}].capabilities.eventHandlers`),
        hasMarkdownTransformer: extension.capabilities.hasMarkdownTransformer,
      },
    };
  });
  const plugins = value.plugins.map((plugin, index): WorkflowAgentInspection["plugins"][number] => {
    if (!isRecord(plugin)) throw new Error(`Chat返回了无效的${field}.plugins[${index}]`);
    return {
      source: readString(plugin.source, `${field}.plugins[${index}].source`),
      scope: readString(plugin.scope, `${field}.plugins[${index}].scope`),
      skills: readStringList(plugin.skills, `${field}.plugins[${index}].skills`),
      extensions: readStringList(plugin.extensions, `${field}.plugins[${index}].extensions`),
      prompts: readStringList(plugin.prompts, `${field}.plugins[${index}].prompts`),
    };
  });
  const prompts = value.prompts.map((item, index): WorkflowAgentInspection["prompts"][number] => {
    if (!isRecord(item)) throw new Error(`Chat返回了无效的${field}.prompts[${index}]`);
    const address = parseAddress(item.address, `${field}.prompts[${index}].address`);
    return {
      name: readString(item.name, `${field}.prompts[${index}].name`),
      description: readString(item.description, `${field}.prompts[${index}].description`, true),
      filePath: readString(item.filePath, `${field}.prompts[${index}].filePath`),
      content: readString(item.content, `${field}.prompts[${index}].content`, true),
      sourceInfo: parseSourceInfo(item.sourceInfo, `${field}.prompts[${index}].sourceInfo`),
      ...(address === undefined ? {} : { address }),
      version: parseVersion(item.version, `${field}.prompts[${index}].version`),
    };
  });
  const diagnostics = value.diagnostics.map((diagnostic, index): WorkflowAgentInspection["diagnostics"][number] => {
    if (!isRecord(diagnostic)) throw new Error(`Chat返回了无效的${field}.diagnostics[${index}]`);
    const path = readOptionalString(diagnostic.path, `${field}.diagnostics[${index}].path`);
    return {
      resource: readString(diagnostic.resource, `${field}.diagnostics[${index}].resource`),
      type: readString(diagnostic.type, `${field}.diagnostics[${index}].type`),
      message: readString(diagnostic.message, `${field}.diagnostics[${index}].message`, true),
      ...(path === undefined ? {} : { path }),
    };
  });

  return {
    agent,
    prompt,
    tools,
    skills,
    extensions,
    plugins,
    prompts,
    promptResources: value.promptResources.map(parsePromptResourceInspection),
    diagnostics,
  };
}

export async function inspectChatWorkflowAgent(
  workflowId: ChatWorkflowId,
  agentId: string,
  projectId: string,
  cwd: string,
  selection?: AgentConfigSelection,
  signal?: AbortSignal,
): Promise<WorkflowAgentInspection> {
  const response = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/agents/${encodeURIComponent(agentId)}/resolve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, cwd, ...(selection === undefined ? {} : { selection }) }),
      credentials: "same-origin",
      signal,
    },
  );
  const body: unknown = await response.json().catch(() => null);
  const errorMessage = isRecord(body)
    ? (typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : undefined)
    : undefined;
  if (!response.ok) throw new Error(errorMessage ?? `HTTP ${response.status}`);
  return parseWorkflowAgentInspection(body, "Agent检查结果");
}

export async function inspectChatWorkflowAgentCatalog(
  workflowId: ChatWorkflowId,
  agentId: string,
  projectId: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<WorkflowAgentInspection> {
  const response = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/agents/${encodeURIComponent(agentId)}/catalog?projectId=${encodeURIComponent(projectId)}&cwd=${encodeURIComponent(cwd)}`,
    { credentials: "same-origin", signal },
  );
  const body: unknown = await response.json().catch(() => null);
  const errorMessage = isRecord(body)
    ? (typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : undefined)
    : undefined;
  if (!response.ok) throw new Error(errorMessage ?? `HTTP ${response.status}`);
  return parseWorkflowAgentInspection(body, "Agent资源目录");
}

export interface ChatModelCatalogModel {
  readonly provider: string;
  readonly modelId: string;
  readonly name: string;
  readonly reasoning: boolean;
  readonly contextWindow: number;
  readonly maxTokens: number;
  readonly authConfigured: boolean;
}

export interface ChatModelCatalog {
  readonly providers: readonly { readonly id: string; readonly name: string; readonly authConfigured: boolean }[];
  readonly models: readonly ChatModelCatalogModel[];
}

function parseModelCatalog(value: unknown, field: string): ChatModelCatalog {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.providers) || !Array.isArray(value.models)) {
    throw new Error(`Chat返回了无效的${field}`);
  }
  const providers = value.providers.map((provider, index): ChatModelCatalog["providers"][number] => {
    if (!isRecord(provider) || typeof provider.authConfigured !== "boolean") {
      throw new Error(`Chat返回了无效的${field}.providers[${index}]`);
    }
    return {
      id: readString(provider.id, `${field}.providers[${index}].id`),
      name: readString(provider.name, `${field}.providers[${index}].name`),
      authConfigured: provider.authConfigured,
    };
  });
  const models = value.models.map((model, index): ChatModelCatalogModel => {
    if (!isRecord(model) || typeof model.reasoning !== "boolean" || typeof model.authConfigured !== "boolean"
      || typeof model.contextWindow !== "number" || !Number.isFinite(model.contextWindow)
      || typeof model.maxTokens !== "number" || !Number.isFinite(model.maxTokens)) {
      throw new Error(`Chat返回了无效的${field}.models[${index}]`);
    }
    return {
      provider: readString(model.provider, `${field}.models[${index}].provider`),
      modelId: readString(model.modelId, `${field}.models[${index}].modelId`),
      name: readString(model.name, `${field}.models[${index}].name`),
      reasoning: model.reasoning,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      authConfigured: model.authConfigured,
    };
  });
  return { providers, models };
}

export async function fetchChatModelCatalog(signal?: AbortSignal): Promise<ChatModelCatalog> {
  const response = await fetch("/api/models", { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`读取模型目录失败: HTTP ${response.status}`);
  return parseModelCatalog(await response.json(), "模型目录");
}

function readApiError(body: unknown, response: Response): Error {
  const errorMessage = isRecord(body)
    ? (typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : undefined)
    : undefined;
  return new Error(errorMessage ?? `HTTP ${response.status}`);
}

/** Persists one Workflow Agent's durable model configuration; read by every later Workflow run. */
export async function saveChatAgentModelConfig(
  workflowId: ChatWorkflowId,
  agentId: string,
  projectId: string,
  config: { readonly model?: { readonly provider: string; readonly modelId: string }; readonly thinkingLevel?: string },
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/agents/${encodeURIComponent(agentId)}/model-config`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        ...(config.model === undefined ? {} : { model: config.model }),
        ...(config.thinkingLevel === undefined ? {} : { thinkingLevel: config.thinkingLevel }),
      }),
      credentials: "same-origin",
      signal,
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw readApiError(body, response);
}

/** Restores the Workflow default by removing the durable model configuration file. */
export async function clearChatAgentModelConfig(
  workflowId: ChatWorkflowId,
  agentId: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/agents/${encodeURIComponent(agentId)}/model-config?projectId=${encodeURIComponent(projectId)}`,
    { method: "DELETE", credentials: "same-origin", signal },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw readApiError(body, response);
}

/** Persists one Workflow Agent's Project-scoped Tool policy. */
export async function saveChatAgentToolConfig(
  workflowId: ChatWorkflowId,
  agentId: string,
  projectId: string,
  tools: WorkflowAgentToolPolicy,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/agents/${encodeURIComponent(agentId)}/tool-config`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, tools }),
      credentials: "same-origin",
      signal,
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw readApiError(body, response);
}

/** Removes only the Project-scoped Tool policy and restores the Workflow default. */
export async function clearChatAgentToolConfig(
  workflowId: ChatWorkflowId,
  agentId: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/agents/${encodeURIComponent(agentId)}/tool-config?projectId=${encodeURIComponent(projectId)}`,
    { method: "DELETE", credentials: "same-origin", signal },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw readApiError(body, response);
}

export async function fetchChatWorkflowSummaries(
  signal?: AbortSignal,
): Promise<ChatWorkflowSummary[]> {
  const response = await fetch("/api/workflows", {
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(`读取Workflow失败: HTTP ${response.status}`);
  return parseChatWorkflowSummaries(await response.json());
}

export async function fetchChatRootConfig(projectId: string, signal?: AbortSignal): Promise<ChatRootConfig> {
  const response = await fetch(`/api/chat-config?projectId=${encodeURIComponent(projectId)}`, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`读取Chat配置失败: HTTP ${response.status}`);
  return parseChatRootConfig(await response.json());
}

export async function saveChatRootConfig(
  config: ChatRootConfig,
  projectId: string,
  signal?: AbortSignal,
): Promise<ChatRootConfig> {
  const response = await fetch(`/api/chat-config?scope=project&projectId=${encodeURIComponent(projectId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    credentials: "same-origin",
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  const message = isRecord(body)
    ? (typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : undefined)
    : undefined;
  if (!response.ok) throw new Error(message ?? `保存Chat配置失败: HTTP ${response.status}`);
  return parseChatRootConfig(body);
}
