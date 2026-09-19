import { useEffect, useState } from "react";
import { fetchLongAgentPresence, type LongAgentPresenceSnapshot } from "@/lib/long-agent-presence";

/** One bounded poll for the visible roster; hidden/disconnected/stale data is unknown. */
export function useLongAgentPresence(enabled: boolean, revision: number) {
  const [snapshot, setSnapshot] = useState<LongAgentPresenceSnapshot | null>(null);
  useEffect(() => {
    setSnapshot(null);
    if (!enabled) return;
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (disposed || document.hidden) return;
      const request = new AbortController();
      controller?.abort();
      controller = request;
      const timeout = setTimeout(() => { setSnapshot(null); request.abort(); }, 5000);
      try {
        const result = await fetchLongAgentPresence(request.signal);
        if (!disposed && !request.signal.aborted) setSnapshot(result);
      } catch {
        if (!disposed && controller === request) setSnapshot(null);
      } finally {
        clearTimeout(timeout);
        if (!disposed && controller === request && !document.hidden) timer = setTimeout(poll, 3000);
      }
    };
    const restart = () => {
      clearTimeout(timer);
      controller?.abort();
      setSnapshot(null);
      void poll();
    };
    void poll();
    document.addEventListener("visibilitychange", restart);
    window.addEventListener("online", restart);
    window.addEventListener("offline", restart);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("online", restart);
      window.removeEventListener("offline", restart);
    };
  }, [enabled, revision]);
  return snapshot;
}
