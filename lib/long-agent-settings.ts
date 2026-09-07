export const LONG_AGENT_INSTRUCTION_SEPARATOR = "--- chat-instruction ---";
const AGENT_MEMORY_PREVIEW_CHARS = 2_000;

/** Formats editable instructions without flattening a multi-line instruction into multiple items. */
export function formatLongAgentInstructions(instructions: readonly string[]): string {
  return instructions.join(`\n\n${LONG_AGENT_INSTRUCTION_SEPARATOR}\n\n`);
}

/** Splits only on the dedicated separator line; ordinary newlines remain inside one instruction. */
export function parseLongAgentInstructions(value: string): string[] {
  return value
    .split(new RegExp(`\\r?\\n${LONG_AGENT_INSTRUCTION_SEPARATOR}\\r?\\n`, "g"))
    .map((instruction) => instruction.trim())
    .filter(Boolean);
}

/** Keeps Agent Group summary cards cheap; full content remains available in the Memory editor. */
export function formatAgentMemoryPreview(content: string): string {
  const normalized = content.trim();
  return normalized.length <= AGENT_MEMORY_PREVIEW_CHARS
    ? normalized
    : `${normalized.slice(0, AGENT_MEMORY_PREVIEW_CHARS)}…`;
}
