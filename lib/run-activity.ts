import type { ChatRunEvent } from "./chat-workflow-events.ts";

export type RunPhase = "submitting" | "starting" | "waiting" | "thinking" | "responding" | "preparing_tool"
  | "tools" | "retry" | "compacting" | "review" | "continuing" | "syncing" | "stopping"
  | "completed" | "cancelled" | "failed" | "disconnected" | "detached" | "long_agent";
export interface RunActivity {
  phase: RunPhase;
  since: number;
  lastEventAt: number;
  confirmedAt?: number;
  streamLost?: boolean;
  error?: string;
  tools: Record<string, { name: string; status: "running" | "completed" | "failed"; since: number }>;
  retry?: { attempt: number; maxAttempts: number; until: number };
}
export function createRunActivity(phase: RunPhase, now = Date.now()): RunActivity {
  return { phase, since: now, lastEventAt: now, tools: {} };
}
export function changeRunPhase(state: RunActivity, phase: RunPhase, now = Date.now()): RunActivity {
  return { ...state, phase, since: state.phase === phase ? state.since : now };
}
export function reduceRunActivity(previous: RunActivity, event: ChatRunEvent, now = Date.now()): RunActivity {
  let state = { ...previous, lastEventAt: now, streamLost: false };
  const phase = (value: RunPhase) => previous.phase === "stopping" ? state : changeRunPhase(state, value, now);
  if (event.type === "review_required") return phase("review");
  if (event.type === "stage_start") return phase("starting");
  const value = event.event;
  switch (value.type) {
    case "agent_start": return phase("starting");
    case "turn_start": return phase("waiting");
    case "message_update": {
      const delta = value.assistantMessageEvent as { type: string };
      if (delta.type.startsWith("thinking_")) return phase("thinking");
      if (delta.type.startsWith("text_")) return phase("responding");
      if (delta.type.startsWith("toolcall_")) return phase("preparing_tool");
      return state;
    }
    case "tool_execution_start":
    case "tool_execution_update": {
      const id = value.toolCallId as string;
      state.tools = { ...state.tools, [id]: { name: value.toolName as string, status: "running", since: state.tools[id]?.since ?? now } };
      return phase("tools");
    }
    case "tool_execution_end": {
      const id = value.toolCallId as string;
      state.tools = { ...state.tools, [id]: { name: value.toolName as string, status: value.isError ? "failed" : "completed", since: state.tools[id]?.since ?? now } };
      return phase(Object.values(state.tools).some(tool => tool.status === "running") ? "tools" : "continuing");
    }
    case "auto_retry_start":
      state.retry = { attempt: value.attempt as number, maxAttempts: value.maxAttempts as number, until: now + (value.delayMs as number) };
      return phase("retry");
    case "auto_retry_end": return phase(value.success ? "waiting" : "continuing");
    case "compaction_start": return phase("compacting");
    case "compaction_end": return phase("continuing");
    case "agent_end": return phase("continuing"); // The enclosing execution owns the terminal state.
    default: return state;
  }
}
