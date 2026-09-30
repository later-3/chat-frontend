import type { AssistantContentBlock, ToolResultMessage } from "./types";
import { resolveLocalFilePath } from "./file-links.ts";
import { isEditToolName, isWriteToolName } from "./tool-names.ts";
import { isSafeAgentMemoryPath } from "./long-agent-group-browser.ts";

export type WrittenFile = {
  /** Resolved absolute path of a file this turn wrote. */
  kind?: "file";
  filePath: string;
} | { kind: "agent-memory"; longAgentId: string; path: string; revision: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileWritingToolName(toolName: string): boolean {
  return isWriteToolName(toolName) || isEditToolName(toolName);
}

function readToolPath(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  const value = input.file_path ?? input.path;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Collect the distinct files a single assistant turn actually wrote.
 *
 * Every entry is derived from a `write`/`edit` tool call whose result arrived
 * and did not error — never from the reply text. A path the assistant merely
 * mentions in prose is not evidence that any file was touched, so it is not a
 * source here; the tool call is the record of what happened.
 *
 * Paths are resolved against `cwd`, deduped, and kept in first-seen order.
 */
export function extractTurnWrittenFiles(
  content: AssistantContentBlock[],
  toolResults: Map<string, ToolResultMessage> | undefined,
  cwd?: string,
  longAgentId?: string,
): WrittenFile[] {
  const seen = new Set<string>();
  const writtenFiles: WrittenFile[] = [];

  for (const block of content) {
    if (block.type !== "toolCall") continue;
    if (!isFileWritingToolName(block.toolName)) continue;

    // No result yet (still streaming) or the call failed — nothing was written.
    const result = toolResults?.get(block.toolCallId);
    if (!result || result.isError) continue;

    // Agent Memory paths are relative to an Agent Group, never the execution cwd.
    // Historical receipts have {file}; newer receipts also bind their trusted owner.
    if (block.toolName === "agent_memory_write") {
      const details = result.details;
      const owner = record(details) && typeof details.longAgentId === "string" ? details.longAgentId : longAgentId;
      const file = record(details) ? details.file : undefined;
      if (owner && /^[a-z0-9][a-z0-9._-]*$/.test(owner) && record(file) && isSafeAgentMemoryPath(file.path)
        && typeof file.revision === "string" && /^sha256:[a-f0-9]{64}$/.test(file.revision)) {
        const key = `agent-memory:${owner}:${file.path}`;
        if (!seen.has(key)) { seen.add(key); writtenFiles.push({ kind: "agent-memory", longAgentId: owner, path: file.path, revision: file.revision }); }
      }
      continue;
    }

    // Other domain tools must opt into their own resource contract; a write-like
    // name alone cannot turn a memory/catalog identifier into a filesystem path.
    if (/memory|summary|resource/.test(block.toolName)) continue;

    const rawPath = readToolPath(block.input);
    if (!rawPath) continue;

    // Tool arguments are filesystem paths, not hrefs: preserve characters such
    // as #, ?, and :digits that have special meaning in links and source refs.
    const filePath = resolveLocalFilePath(rawPath, cwd);
    if (!filePath) continue;

    if (seen.has(filePath)) continue;
    seen.add(filePath);
    writtenFiles.push({ filePath });
  }

  return writtenFiles;
}
