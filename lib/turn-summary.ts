import type { AgentMessage } from "./types";

/** Entry write times, not model request-start timestamps. Absent on older servers. */
export function parseEntryTimes(value: unknown, count: number): (number | null)[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length !== count
    || value.some(time => time !== null && (typeof time !== "number" || !Number.isFinite(time) || time < 0))) {
    throw new Error("Invalid Session entry times");
  }
  return value as (number | null)[];
}

export function summarizeTurn(messages: readonly AgentMessage[], times: readonly (number | null)[]) {
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  const tools = new Set<string>();
  let recordedUsage = 0;
  let assistantCount = 0;
  let endedAt: number | null = null;
  for (const [index, message] of messages.entries()) {
    if (message.role === "assistant" || message.role === "toolResult") endedAt = times[index] ?? null;
    if (message.role !== "assistant") continue;
    assistantCount++;
    for (const block of message.content) {
      if (block.type === "toolCall") tools.add(`${message.chatWorkflow?.invocationId ?? ""}:${block.toolCallId}`);
    }
    const reported = message.usage;
    if (!reported || ![reported.input, reported.output, reported.cacheRead, reported.cacheWrite]
      .every(count => typeof count === "number" && Number.isFinite(count) && count >= 0)) continue;
    recordedUsage++;
    usage.input += reported.input;
    usage.output += reported.output;
    usage.cacheRead += reported.cacheRead;
    usage.cacheWrite += reported.cacheWrite;
    const cost = reported.cost?.total;
    if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) usage.cost += cost;
  }
  const startedAt = times[0];
  return {
    usage, recordedUsage, assistantCount, toolCount: tools.size,
    tokens: usage.input + usage.output + usage.cacheRead + usage.cacheWrite,
    durationMs: startedAt != null && endedAt != null && endedAt >= startedAt ? endedAt - startedAt : null,
  };
}
export type TurnSummaryData = ReturnType<typeof summarizeTurn>;
