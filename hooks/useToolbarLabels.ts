"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readToolbarLabelMode, showToolbarLabels, writeToolbarLabelMode, type ToolbarLabelMode } from "@/lib/ui-preference";

const listeners = new Set<() => void>();
let cached: ToolbarLabelMode | null = null;

function snapshot(): ToolbarLabelMode {
  cached ??= readToolbarLabelMode();
  return cached;
}

/** Toolbar label preference (icons by default); shared by every toolbar in the app. */
export function useToolbarLabels(): { mode: ToolbarLabelMode; labels: boolean; setMode: (mode: ToolbarLabelMode) => void } {
  const mode = useSyncExternalStore(
    (notify) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    snapshot,
    () => "icons" as ToolbarLabelMode,
  );
  const setMode = useCallback((next: ToolbarLabelMode) => {
    cached = next;
    writeToolbarLabelMode(next);
    listeners.forEach(listener => listener());
  }, []);
  return { mode, labels: showToolbarLabels(mode), setMode };
}
