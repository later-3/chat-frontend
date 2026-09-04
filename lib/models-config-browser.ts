export interface ChatModelEntry {
  id: string;
  name?: string;
  api?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; tiers?: unknown };
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
}

export interface ChatProviderEntry {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
  models?: ChatModelEntry[];
  modelOverrides?: Record<string, unknown>;
}

export interface ChatModelsConfig {
  providers?: Record<string, ChatProviderEntry>;
}

export interface ChatModelsConfigDocument {
  readonly schemaVersion: 1;
  readonly source: {
    readonly kind: "chat-home";
    readonly path: string;
  };
  readonly config: ChatModelsConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOptionalString(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== "string") throw new Error(`Chat返回了无效的${field}`);
}

function assertOptionalFiniteNumber(value: unknown, field: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`Chat返回了无效的${field}`);
  }
}

function assertStringRecord(value: unknown, field: string): void {
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== "string")) {
    throw new Error(`Chat返回了无效的${field}`);
  }
}

function validateModel(value: unknown, field: string): void {
  if (!isRecord(value) || typeof value.id !== "string") throw new Error(`Chat返回了无效的${field}`);
  assertOptionalString(value.name, `${field}.name`);
  assertOptionalString(value.api, `${field}.api`);
  if (value.reasoning !== undefined && typeof value.reasoning !== "boolean") {
    throw new Error(`Chat返回了无效的${field}.reasoning`);
  }
  if (value.thinkingLevelMap !== undefined) {
    if (!isRecord(value.thinkingLevelMap)
      || Object.values(value.thinkingLevelMap).some((entry) => entry !== null && typeof entry !== "string")) {
      throw new Error(`Chat返回了无效的${field}.thinkingLevelMap`);
    }
  }
  if (value.input !== undefined
    && (!Array.isArray(value.input) || value.input.some((entry) => typeof entry !== "string"))) {
    throw new Error(`Chat返回了无效的${field}.input`);
  }
  assertOptionalFiniteNumber(value.contextWindow, `${field}.contextWindow`);
  assertOptionalFiniteNumber(value.maxTokens, `${field}.maxTokens`);
  if (value.cost !== undefined) {
    if (!isRecord(value.cost)) throw new Error(`Chat返回了无效的${field}.cost`);
    for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
      assertOptionalFiniteNumber(value.cost[key], `${field}.cost.${key}`);
    }
  }
  if (value.headers !== undefined) assertStringRecord(value.headers, `${field}.headers`);
  if (value.compat !== undefined && !isRecord(value.compat)) throw new Error(`Chat返回了无效的${field}.compat`);
}

function validateConfig(value: unknown, field: string): asserts value is ChatModelsConfig {
  if (!isRecord(value) || !isRecord(value.providers)) throw new Error(`Chat返回了无效的${field}`);
  for (const [providerId, provider] of Object.entries(value.providers)) {
    const providerField = `${field}.providers.${providerId}`;
    if (!isRecord(provider)) throw new Error(`Chat返回了无效的${providerField}`);
    assertOptionalString(provider.baseUrl, `${providerField}.baseUrl`);
    assertOptionalString(provider.api, `${providerField}.api`);
    assertOptionalString(provider.apiKey, `${providerField}.apiKey`);
    if (provider.headers !== undefined) assertStringRecord(provider.headers, `${providerField}.headers`);
    if (provider.compat !== undefined && !isRecord(provider.compat)) {
      throw new Error(`Chat返回了无效的${providerField}.compat`);
    }
    if (provider.modelOverrides !== undefined && !isRecord(provider.modelOverrides)) {
      throw new Error(`Chat返回了无效的${providerField}.modelOverrides`);
    }
    if (provider.models !== undefined) {
      if (!Array.isArray(provider.models)) throw new Error(`Chat返回了无效的${providerField}.models`);
      provider.models.forEach((model, index) => validateModel(model, `${providerField}.models[${index}]`));
    }
  }
}

export function parseChatModelsConfigDocument(value: unknown): ChatModelsConfigDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.source)
    || value.source.kind !== "chat-home" || typeof value.source.path !== "string") {
    throw new Error("Chat返回了无效的模型配置文档");
  }
  validateConfig(value.config, "模型配置文档.config");
  return value as unknown as ChatModelsConfigDocument;
}

async function responseError(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  const message = isRecord(body)
    ? (typeof body.message === "string"
        ? body.message
        : typeof body.statusMessage === "string"
          ? body.statusMessage
          : typeof body.error === "string"
            ? body.error
            : undefined)
    : undefined;
  return new Error(message ?? `HTTP ${response.status}`);
}

export async function fetchChatModelsConfig(signal?: AbortSignal): Promise<ChatModelsConfigDocument> {
  const response = await fetch("/api/models-config", { credentials: "same-origin", signal });
  if (!response.ok) throw await responseError(response);
  return parseChatModelsConfigDocument(await response.json());
}

export async function saveChatModelsConfig(
  config: ChatModelsConfig,
  signal?: AbortSignal,
): Promise<ChatModelsConfigDocument> {
  const response = await fetch("/api/models-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw await responseError(response);
  return parseChatModelsConfigDocument(await response.json());
}
