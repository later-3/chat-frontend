/**
 * Browser contract for the Backend directory picker listing. The Backend only
 * enumerates directory names; selecting a directory still goes through the
 * Project open flow.
 */

export interface DirectoryBrowseEntry {
  readonly name: string;
  readonly path: string;
}

export interface DirectoryBrowseResult {
  readonly path: string;
  readonly parentPath: string | null;
  readonly directories: readonly DirectoryBrowseEntry[];
  readonly drives: readonly DirectoryBrowseEntry[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntries(value: unknown, field: string): DirectoryBrowseEntry[] {
  if (!Array.isArray(value)) throw new Error(`Chat返回了无效的${field}`);
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.name !== "string" || typeof entry.path !== "string") {
      throw new Error(`Chat返回了无效的${field}[${index}]`);
    }
    return { name: entry.name, path: entry.path };
  });
}

function parseBrowseResult(value: unknown): DirectoryBrowseResult {
  if (!isRecord(value) || typeof value.path !== "string"
    || (value.parentPath !== null && typeof value.parentPath !== "string")) {
    throw new Error("Chat返回了无效的目录浏览结果");
  }
  return {
    path: value.path,
    parentPath: value.parentPath,
    directories: parseEntries(value.directories ?? [], "子目录列表"),
    drives: value.drives === undefined ? null : parseEntries(value.drives, "驱动器列表"),
  };
}

export async function browseDirectories(
  directory?: string,
  signal?: AbortSignal,
): Promise<DirectoryBrowseResult> {
  const query = directory ? `?path=${encodeURIComponent(directory)}` : "";
  const response = await fetch(`/api/cwd/browse${query}`, {
    credentials: "same-origin",
    ...(signal === undefined ? {} : { signal }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // h3 error bodies mark failure with boolean `error: true`; only string
    // fields are safe to display.
    const message = isRecord(body)
      ? [body.statusMessage, body.message, body.error]
          .find((value): value is string => typeof value === "string" && value.trim() !== "")
      : undefined;
    throw new Error(message ?? `HTTP ${response.status}`);
  }
  return parseBrowseResult(body);
}
