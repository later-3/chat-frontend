"use client";

import { useEffect, useState } from "react";
import { countActiveSessionMemory } from "@/lib/session-memory-count";
import { fetchSessionMemory } from "@/lib/topics-browser";

/**
 * Session-memory badge count (UI/UX §20.5).
 *
 * It reads the count from the session-memory API itself instead of waiting for
 * the memory dialog to mount: the panel only reported its length while open, so
 * after a turn wrote memory the badge stayed at 0 until the user opened it.
 * `refreshKey` carries the turn signal (message count + round phase), and
 * `setCount` lets the open panel push its exact value without a second read.
 */
export function useSessionMemoryCount(input: {
  storageProjectId: string;
  sessionId: string | null;
  /** Changes whenever a turn may have written memory. */
  refreshKey: string;
}): { count: number; setCount: (count: number) => void } {
  const { refreshKey, sessionId, storageProjectId } = input;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (sessionId === null) {
      setCount(0);
      return;
    }
    const controller = new AbortController();
    void fetchSessionMemory(storageProjectId, sessionId, controller.signal)
      .then((state) => {
        if (!controller.signal.aborted) setCount(countActiveSessionMemory(state.entries));
      })
      .catch(() => {
        // A failed read keeps the last known count; the dialog reports the error.
      });
    return () => controller.abort();
  }, [refreshKey, sessionId, storageProjectId]);

  return { count, setCount };
}
