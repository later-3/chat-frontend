export type LongAgentPresence = "ready" | "working" | "disabled" | "unknown";
export interface LongAgentPresenceSnapshot {
  readonly schemaVersion: 1;
  readonly observedAt: string;
  readonly agents: readonly { readonly id: string; readonly status: Exclude<LongAgentPresence, "unknown"> }[];
}

export function parseLongAgentPresence(value: unknown): LongAgentPresenceSnapshot {
  const invalid = () => new Error("Invalid Long Agent presence response");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.observedAt !== "string"
    || !Number.isFinite(Date.parse(record.observedAt)) || !Array.isArray(record.agents)) throw invalid();
  const ids = new Set<string>();
  const agents = record.agents.map((item: unknown): LongAgentPresenceSnapshot["agents"][number] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw invalid();
    const agent = item as Record<string, unknown>;
    if (typeof agent.id !== "string" || !agent.id.trim() || ids.has(agent.id)
      || (agent.status !== "ready" && agent.status !== "working" && agent.status !== "disabled")) throw invalid();
    ids.add(agent.id);
    return { id: agent.id, status: agent.status };
  });
  return { schemaVersion: 1, observedAt: record.observedAt, agents };
}

export async function fetchLongAgentPresence(signal: AbortSignal): Promise<LongAgentPresenceSnapshot> {
  const response = await fetch("/api/long-agents/presence", { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Long Agent presence: HTTP ${response.status}`);
  return parseLongAgentPresence(await response.json() as unknown);
}
