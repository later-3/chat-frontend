/**
 * Browser contracts for the Backend Pi resource catalogs (`/api/skills`,
 * `/api/extensions`, `/api/plugins`). They let a configuration page offer
 * catalog checkboxes instead of forcing raw paths.
 */

export interface ProjectSkill {
  readonly name: string;
  readonly description: string;
  readonly filePath: string;
  readonly address?: string;
}

export interface ProjectExtension {
  readonly name: string;
  readonly path: string;
  readonly source: string;
  readonly scope: string;
  readonly enabled: boolean;
}

export interface ProjectPlugin {
  readonly source: string;
  readonly scope: string;
  readonly status: string;
  readonly skills: number;
  readonly extensions: number;
  readonly prompts: number;
}

export interface ProjectResourceCatalog {
  readonly skills: readonly ProjectSkill[];
  readonly extensions: readonly ProjectExtension[];
  readonly plugins: readonly ProjectPlugin[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseSkills(value: unknown): ProjectSkill[] {
  if (!isRecord(value) || !Array.isArray(value.skills)) throw new Error("Chat返回了无效的Skill目录");
  return value.skills.map((item, index) => {
    if (!isRecord(item) || !nonEmpty(item.name) || typeof item.description !== "string" || !nonEmpty(item.filePath)) {
      throw new Error(`Chat返回了无效的Skill目录[${index}]`);
    }
    return {
      name: item.name,
      description: item.description,
      filePath: item.filePath,
      ...(typeof item.address === "string" ? { address: item.address } : {}),
    };
  });
}

function parseExtensions(value: unknown): ProjectExtension[] {
  if (!isRecord(value) || !Array.isArray(value.extensions)) throw new Error("Chat返回了无效的Extension目录");
  return value.extensions.map((item, index) => {
    if (!isRecord(item) || !nonEmpty(item.name) || !nonEmpty(item.path) || typeof item.enabled !== "boolean") {
      throw new Error(`Chat返回了无效的Extension目录[${index}]`);
    }
    return {
      name: item.name,
      path: item.path,
      source: typeof item.source === "string" ? item.source : "",
      scope: typeof item.scope === "string" ? item.scope : "global",
      enabled: item.enabled,
    };
  });
}

function parsePlugins(value: unknown): ProjectPlugin[] {
  if (!isRecord(value) || !Array.isArray(value.packages)) throw new Error("Chat返回了无效的Plugin目录");
  return value.packages.map((item, index) => {
    if (!isRecord(item) || !nonEmpty(item.source) || !nonEmpty(item.scope)) {
      throw new Error(`Chat返回了无效的Plugin目录[${index}]`);
    }
    const counts = isRecord(item.counts) ? item.counts : {};
    return {
      source: item.source,
      scope: item.scope,
      status: typeof item.status === "string" ? item.status : "unknown",
      skills: typeof counts.skills === "number" ? counts.skills : 0,
      extensions: typeof counts.extensions === "number" ? counts.extensions : 0,
      prompts: typeof counts.prompts === "number" ? counts.prompts : 0,
    };
  });
}

async function fetchResource(path: string, projectId: string, signal?: AbortSignal): Promise<unknown> {
  const query = new URLSearchParams({ projectId });
  const response = await fetch(`${path}?${query.toString()}`, {
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body)
      ? [body.statusMessage, body.message, body.error]
          .find((value): value is string => typeof value === "string" && value.trim() !== "")
      : undefined;
    throw new Error(message ?? `HTTP ${response.status}`);
  }
  return body;
}

/** Loads the available skills, extensions and plugins for one Project. */
export async function fetchProjectResourceCatalog(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectResourceCatalog> {
  const [skills, extensions, plugins] = await Promise.all([
    fetchResource("/api/skills", projectId, signal),
    fetchResource("/api/extensions", projectId, signal),
    fetchResource("/api/plugins", projectId, signal),
  ]);
  return {
    skills: parseSkills(skills),
    extensions: parseExtensions(extensions),
    plugins: parsePlugins(plugins),
  };
}
