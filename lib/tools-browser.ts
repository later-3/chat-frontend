export interface ChatToolConsumer {
  readonly workflowId: string;
  readonly agentId: string;
  readonly source: "workflow-default" | "project-config";
  readonly enabled: boolean;
}

export interface ChatToolCatalogEntry {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly address: string;
  readonly sourceInfo: {
    readonly source: string;
    readonly scope: string;
    readonly origin: string;
  };
  readonly toolVersion?: string;
  readonly version?: {
    readonly kind: "file" | "directory";
    readonly size: number;
    readonly modifiedAt: string;
    readonly contentHash?: string;
  };
  readonly risk?: "read-only" | "write" | "destructive";
  readonly permissions: readonly string[];
  readonly consumers: readonly ChatToolConsumer[];
}

export interface ChatToolsResponse {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly tools: readonly ChatToolCatalogEntry[];
  readonly diagnostics: readonly { readonly type: string; readonly message: string; readonly path?: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Chat返回了无效的${field}`);
  return value;
}

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Chat返回了无效的${field}`);
  return value.map((item, index) => stringValue(item, `${field}[${index}]`));
}

function resourceVersion(value: unknown, field: string): ChatToolCatalogEntry["version"] {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)
    || (value.kind !== "file" && value.kind !== "directory")
    || typeof value.size !== "number" || !Number.isFinite(value.size) || value.size < 0
    || typeof value.modifiedAt !== "string" || Number.isNaN(Date.parse(value.modifiedAt))
    || (value.contentHash !== undefined && typeof value.contentHash !== "string")) {
    throw new Error(`Chat返回了无效的${field}`);
  }
  return {
    kind: value.kind,
    size: value.size,
    modifiedAt: value.modifiedAt,
    ...(typeof value.contentHash === "string" ? { contentHash: value.contentHash } : {}),
  };
}

export function parseChatToolsResponse(value: unknown): ChatToolsResponse {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.tools) || !Array.isArray(value.diagnostics)) {
    throw new Error("Chat返回了无效的Tool目录");
  }
  const tools = value.tools.map((tool, index): ChatToolCatalogEntry => {
    if (!isRecord(tool) || !isRecord(tool.sourceInfo) || !Array.isArray(tool.consumers)) {
      throw new Error(`Chat返回了无效的tools[${index}]`);
    }
    const risk = tool.risk;
    if (risk !== undefined && risk !== "read-only" && risk !== "write" && risk !== "destructive") {
      throw new Error(`Chat返回了无效的tools[${index}].risk`);
    }
    const consumers = tool.consumers.map((consumer, consumerIndex): ChatToolConsumer => {
      if (!isRecord(consumer)
        || (consumer.source !== "workflow-default" && consumer.source !== "project-config")
        || typeof consumer.enabled !== "boolean") {
        throw new Error(`Chat返回了无效的tools[${index}].consumers[${consumerIndex}]`);
      }
      return {
        workflowId: stringValue(consumer.workflowId, `tools[${index}].consumers[${consumerIndex}].workflowId`),
        agentId: stringValue(consumer.agentId, `tools[${index}].consumers[${consumerIndex}].agentId`),
        source: consumer.source,
        enabled: consumer.enabled,
      };
    });
    const version = resourceVersion(tool.version, `tools[${index}].version`);
    return {
      name: stringValue(tool.name, `tools[${index}].name`),
      label: stringValue(tool.label, `tools[${index}].label`),
      description: typeof tool.description === "string" ? tool.description : "",
      address: stringValue(tool.address, `tools[${index}].address`),
      sourceInfo: {
        source: stringValue(tool.sourceInfo.source, `tools[${index}].sourceInfo.source`),
        scope: stringValue(tool.sourceInfo.scope, `tools[${index}].sourceInfo.scope`),
        origin: stringValue(tool.sourceInfo.origin, `tools[${index}].sourceInfo.origin`),
      },
      ...(typeof tool.toolVersion === "string" && tool.toolVersion !== "" ? { toolVersion: tool.toolVersion } : {}),
      ...(version === undefined ? {} : { version }),
      ...(risk === undefined ? {} : { risk }),
      permissions: tool.permissions === undefined ? [] : strings(tool.permissions, `tools[${index}].permissions`),
      consumers,
    };
  });
  const diagnostics = value.diagnostics.map((diagnostic, index) => {
    if (!isRecord(diagnostic)) throw new Error(`Chat返回了无效的diagnostics[${index}]`);
    return {
      type: stringValue(diagnostic.type, `diagnostics[${index}].type`),
      message: typeof diagnostic.message === "string" ? diagnostic.message : "",
      ...(typeof diagnostic.path === "string" ? { path: diagnostic.path } : {}),
    };
  });
  return {
    schemaVersion: 1,
    projectId: stringValue(value.projectId, "projectId"),
    tools,
    diagnostics,
  };
}

export async function fetchChatTools(projectId: string, signal?: AbortSignal): Promise<ChatToolsResponse> {
  const response = await fetch(`/api/tools?projectId=${encodeURIComponent(projectId)}`, {
    credentials: "same-origin",
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return parseChatToolsResponse(body);
}
