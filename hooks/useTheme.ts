"use client";

import { useCallback, useSyncExternalStore } from "react";
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, PRESET_MODE, applyAppearance, initializeAppearance, readAppearance, writeAppearance, type Appearance, type Preset } from "@/lib/appearance";

export type ResolvedTheme = "light" | "dark";

type ThemeState = {
  theme: ResolvedTheme;
  appearance: Appearance;
};

type ToggleOrigin = { x: number; y: number };

const SERVER_SNAPSHOT: ThemeState = { theme: "light", appearance: { ...DEFAULT_APPEARANCE } };

const listeners = new Set<() => void>();
let state: ThemeState | null = null;
let storageListening = false;
// Quick-toggle memory: the most recent preset of each mode (session only, not persisted).
let lastLightPreset: Preset = "paper";
let lastDarkPreset: Preset = "graphite";

function emit(): void {
  listeners.forEach((cb) => cb());
}

function resolveTheme(appearance: Appearance): ResolvedTheme {
  return PRESET_MODE[appearance.preset] === "dark" ? "dark" : "light";
}

function rememberPreset(appearance: Appearance): void {
  if (PRESET_MODE[appearance.preset] === "dark") lastDarkPreset = appearance.preset;
  else lastLightPreset = appearance.preset;
}

function ensureState(): ThemeState {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (state) return state;
  const appearance = initializeAppearance();
  rememberPreset(appearance);
  state = { theme: resolveTheme(appearance), appearance };
  return state;
}

function commitAppearance(appearance: Appearance): void {
  applyAppearance(document.documentElement, appearance);
  try {
    writeAppearance(window.localStorage, appearance);
  } catch {
    // keep in-memory preference usable
  }
  rememberPreset(appearance);
  state = { theme: resolveTheme(appearance), appearance };
  emit();
}

function ensureStorageListener(): void {
  if (storageListening || typeof window === "undefined") return;
  window.addEventListener("storage", event => {
    if (event.key !== null && event.key !== APPEARANCE_KEY) return;
    let appearance = { ...DEFAULT_APPEARANCE };
    try { appearance = readAppearance(window.localStorage); } catch { /* blocked storage */ }
    applyAppearance(document.documentElement, appearance);
    rememberPreset(appearance);
    state = { theme: resolveTheme(appearance), appearance };
    emit();
  });
  storageListening = true;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  ensureState();
  ensureStorageListener();
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): ThemeState {
  return ensureState();
}

function getServerSnapshot(): ThemeState {
  return SERVER_SNAPSHOT;
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setAppearance = useCallback((patch: Partial<Appearance>) => {
    const current = ensureState();
    commitAppearance({ ...current.appearance, ...patch });
  }, []);

  const toggleTheme = useCallback((origin?: ToggleOrigin) => {
    const current = ensureState();
    const nextPreset = current.theme === "dark" ? lastLightPreset : lastDarkPreset;
    const nextAppearance: Appearance = { ...current.appearance, preset: nextPreset };

    const apply = () => {
      commitAppearance(nextAppearance);
    };

    const reduceMotion = current.appearance.motion === "reduced" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const supportsVT = typeof document.startViewTransition === "function";

    if (!supportsVT || reduceMotion) {
      apply();
      return;
    }

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 450,
            easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // transition cancelled — ignore
      });
  }, []);

  return {
    theme: snapshot.theme,
    appearance: snapshot.appearance,
    setAppearance,
    toggleTheme,
    isDark: snapshot.theme === "dark",
  };
}
