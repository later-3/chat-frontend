import { useCallback, useEffect, useRef, useState } from "react";
import { readMaintenance, startMaintenance, cancelMaintenance, MaintenanceHttpError, type MaintenanceRequest, type SessionMaintenance, type MaintenanceOperation } from "@/lib/session-maintenance";
import { createRunActivity, reduceRunActivity, changeRunPhase, type RunActivity } from "@/lib/run-activity";

/** Observe native maintenance; unmount only detaches. Only the explicit cancel action aborts Pi. */
export function useSessionMaintenance(projectId: string, sessionId: string | null, leafId: string | null | undefined, onChanged: () => Promise<void>) {
  const [snapshot, setSnapshot] = useState<SessionMaintenance | null>(null);
  const [operation, setOperation] = useState<MaintenanceOperation | null>(null);
  const [activity, setActivity] = useState<RunActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const changed = useRef(onChanged); changed.current = onChanged;
  const pending = useRef<MaintenanceRequest | null>(null);
  const busy = useRef(false);
  const epoch = useRef(0);
  const revision = useRef(0);
  const lastEvent = useRef("");
  const completed = useRef("");
  const observedRunning = useRef("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    epoch.current++; pending.current = null; busy.current = false; revision.current++;
    setSnapshot(null); setOperation(null); setActivity(null); setError(null); setReadError(null); setSubmitting(false);
    lastEvent.current = ""; completed.current = ""; observedRunning.current = "";
    return () => { epoch.current++; };
  }, [projectId, sessionId]);
  const running = operation?.status === "running";
  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      const version = revision.current;
      try {
        const next = await readMaintenance(projectId, sessionId, controller.signal);
        if (controller.signal.aborted || version !== revision.current) return;
        setSnapshot(next); setOperation(next.operation); setReadError(null);
        const op = next.operation;
        if (op && pending.current?.requestId === op.requestId) setError(null);
        if (next.event && JSON.stringify(next.event) !== lastEvent.current) {
          lastEvent.current = JSON.stringify(next.event);
          setActivity(previous => reduceRunActivity(previous ?? createRunActivity("compacting"), { type: "agent_event", event: next.event! }));
        }
        if (op?.status === "running") {
          observedRunning.current = op.requestId;
          setActivity(previous => previous ?? createRunActivity("compacting"));
          timer = setTimeout(read, 600);
        } else if (op) {
          const phase = op.status === "interrupted" ? "failed" : op.status;
          setActivity(previous => changeRunPhase(previous ?? createRunActivity("continuing"), phase));
          if (completed.current !== op.requestId) {
            completed.current = op.requestId;
            if (pending.current?.requestId === op.requestId) pending.current = null;
            if (observedRunning.current === op.requestId) await changed.current();
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) { setReadError(cause instanceof Error ? cause.message : String(cause)); timer = setTimeout(read, 3000); }
      }
    };
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, sessionId, leafId, refresh, running]);
  const start = useCallback(async (kind: "compact" | "continue", detail: { entryId?: string; instructions?: string } = {}) => {
    if (!sessionId || leafId === undefined || busy.current || running) return null;
    // Keep an uncertain POST's identity for an explicit retry; never silently issue a second paid operation.
    if (pending.current && (pending.current.kind !== kind || pending.current.entryId !== detail.entryId || pending.current.instructions !== detail.instructions)) throw new Error("Resolve the previous session operation before starting another");
    const input = pending.current ?? { projectId, requestId: crypto.randomUUID(), expectedLeafId: leafId, kind, ...detail };
    pending.current = input; busy.current = true; revision.current++;
    const currentEpoch = epoch.current; setSubmitting(true); setError(null);
    try {
      const result = await startMaintenance(sessionId, input);
      if (epoch.current !== currentEpoch) return null;
      setOperation(result); lastEvent.current = "";
      if (result.status !== "running") { pending.current = null; completed.current = result.requestId; await changed.current(); }
      else { observedRunning.current = result.requestId; setActivity(createRunActivity("compacting")); }
      return result;
    } catch (cause) {
      if (epoch.current !== currentEpoch) return null;
      if (cause instanceof MaintenanceHttpError && cause.status < 500) pending.current = null;
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      if (epoch.current === currentEpoch) { busy.current = false; setSubmitting(false); setRefresh(value => value + 1); }
    }
  }, [projectId, sessionId, leafId, running]);
  const cancel = useCallback(async () => {
    if (!sessionId || operation?.status !== "running") return;
    const currentEpoch = epoch.current;
    try {
      await cancelMaintenance(projectId, sessionId, operation.requestId);
      if (epoch.current !== currentEpoch) return;
      setActivity(previous => changeRunPhase(previous ?? createRunActivity("compacting"), "stopping"));
      setRefresh(value => value + 1);
    } catch (cause) { if (epoch.current === currentEpoch) setError(cause instanceof Error ? cause.message : String(cause)); }
  }, [projectId, sessionId, operation]);
  return { snapshot, operation, activity, error: error ?? readError, start, cancel, busy: running || submitting, submitting };
}
