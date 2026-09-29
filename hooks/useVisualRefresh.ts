"use client";

import { useCallback, useSyncExternalStore } from "react";

export type VisualRefreshMode = "conservative" | "aggressive";

const STORAGE_KEY = "chat:visual-refresh";

const listeners = new Set<() => void>();
let cached: VisualRefreshMode | null = null;

function readMode(): VisualRefreshMode {
  if (typeof window === "undefined") return "conservative";
  if (cached) return cached;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    cached = value === "aggressive" ? "aggressive" : "conservative";
  } catch {
    cached = "conservative";
  }
  return cached;
}

function applyDomMode(mode: VisualRefreshMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.visualRefresh = mode;
}

function ensureMode(): VisualRefreshMode {
  const mode = readMode();
  applyDomMode(mode);
  return mode;
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Conservative/aggressive visual-refresh preview switch.
 * Prototype-only: gates the P5 reading-surface treatment (message measure,
 * rhythm, surface layering) without forking pages or touching execution.
 */
export function useVisualRefresh(): {
  mode: VisualRefreshMode;
  setMode: (mode: VisualRefreshMode) => void;
} {
  const mode = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => { listeners.delete(notify); };
    },
    ensureMode,
    () => "conservative" as VisualRefreshMode,
  );
  const setMode = useCallback((next: VisualRefreshMode) => {
    cached = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preview switch is best-effort; layout stays usable without storage.
    }
    applyDomMode(next);
    emit();
  }, []);
  return { mode, setMode };
}
