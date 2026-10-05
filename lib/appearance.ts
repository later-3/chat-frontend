export const APPEARANCE_KEY = "chat:appearance:v2";
export const LEGACY_APPEARANCE_KEY = "chat:appearance:v1";
/**
 * v1 kept light/dark in the separate `pi-theme` key. v2 binds the mode to the
 * preset, so this key is no longer a second writable definition: it is mirrored
 * with the resolved light/dark so the standalone offline shell
 * (public/offline.html) keeps its documented classic fallback.
 */
export const LEGACY_THEME_KEY = "pi-theme";

export const PRESETS = ["paper", "glacier", "peach", "instagram", "graphite", "obsidian", "dracula"] as const;
export type Preset = typeof PRESETS[number];

/** Mode is bound to the preset (sample themes.mjs); there is no independent light/dark axis. */
export const PRESET_MODE: Record<Preset, "light" | "dark"> = {
  paper: "light",
  glacier: "light",
  peach: "light",
  instagram: "light",
  graphite: "dark",
  obsidian: "dark",
  dracula: "dark",
};

/** Glass presets own translucent surfaces; the opaque switch only applies to them. */
export const GLASS_PRESETS = ["glacier", "obsidian"] as const;

export type Appearance = {
  preset: Preset;
  motion: "full" | "reduced";
  background: boolean;
  opaque: boolean;
};
export const DEFAULT_APPEARANCE: Readonly<Appearance> = {
  preset: "paper", motion: "full", background: true, opaque: false,
};

type V1Appearance = {
  material?: unknown;
  palette?: unknown;
  motion?: unknown;
  background?: unknown;
  opaque?: unknown;
};

const V1_PALETTES = ["classic", "ocean", "rose", "orchid", "instagram"] as const;
type V1Palette = typeof V1_PALETTES[number];
type V1Material = "paper" | "glass";

/**
 * Deterministic v1 → v2 migration (design record: docs/design/appearance-seven-presets.md §4).
 * `dark` is the resolved v1 theme value (pi-theme preference against the system scheme).
 */
const V1_MIGRATION: Record<V1Material, Record<V1Palette, { light: Preset; dark: Preset }>> = {
  paper: {
    classic: { light: "paper", dark: "paper" },
    ocean: { light: "glacier", dark: "glacier" },
    rose: { light: "peach", dark: "peach" },
    orchid: { light: "glacier", dark: "dracula" },
    instagram: { light: "instagram", dark: "instagram" },
  },
  glass: {
    classic: { light: "glacier", dark: "obsidian" },
    ocean: { light: "glacier", dark: "obsidian" },
    rose: { light: "peach", dark: "peach" },
    orchid: { light: "glacier", dark: "dracula" },
    instagram: { light: "instagram", dark: "instagram" },
  },
};

/** Pure and side-effect free so the table can be unit-tested cell by cell. */
export function migrateV1Appearance(raw: string | null, dark: boolean): Appearance {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return { ...DEFAULT_APPEARANCE };
    const data = value as V1Appearance;
    const material: V1Material = data.material === "glass" ? "glass" : "paper";
    const palette = V1_PALETTES.includes(data.palette as V1Palette) ? data.palette as V1Palette : "classic";
    return {
      preset: V1_MIGRATION[material][palette][dark ? "dark" : "light"],
      motion: data.motion === "reduced" ? "reduced" : "full",
      background: typeof data.background === "boolean" ? data.background : true,
      opaque: typeof data.opaque === "boolean" ? data.opaque : false,
    };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

/** Browser preferences are untrusted and independent of execution configuration. */
export function parseAppearance(raw: string | null): Appearance {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 2) return { ...DEFAULT_APPEARANCE };
    const data = value as Record<string, unknown>;
    if (!PRESETS.includes(data.preset as Preset)) return { ...DEFAULT_APPEARANCE };
    return {
      preset: data.preset as Preset,
      motion: data.motion === "reduced" ? "reduced" : "full",
      background: typeof data.background === "boolean" ? data.background : true,
      opaque: typeof data.opaque === "boolean" ? data.opaque : false,
    };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

/**
 * v2 first; when the v2 key has never been written, migrate the v1 record.
 * The v1 theme lives in `pi-theme` (light/dark/auto); auto and a missing value
 * resolve against `systemDark`. Unreadable storage yields the default preset.
 */
export function readAppearance(
  storage: Pick<Storage, "getItem">,
  systemDark: () => boolean = () => false,
): Appearance {
  try {
    const v2 = storage.getItem(APPEARANCE_KEY);
    if (v2 !== null) return parseAppearance(v2);
    const v1 = storage.getItem(LEGACY_APPEARANCE_KEY);
    if (v1 !== null) {
      let dark = false;
      try {
        const preference = storage.getItem(LEGACY_THEME_KEY);
        dark = preference === "dark" || ((preference === null || preference === "" || preference === "auto") && systemDark());
      } catch { /* theme key unreadable counts as light */ }
      return migrateV1Appearance(v1, dark);
    }
  } catch { /* storage can be blocked */ }
  return { ...DEFAULT_APPEARANCE };
}

/** Persist v2 and refresh the offline-shell light/dark mirror. Throws on blocked storage. */
export function writeAppearance(storage: Pick<Storage, "setItem">, value: Appearance): void {
  storage.setItem(APPEARANCE_KEY, JSON.stringify({ version: 2, ...value }));
  storage.setItem(LEGACY_THEME_KEY, PRESET_MODE[value.preset] === "dark" ? "dark" : "light");
}

export function applyAppearance(root: HTMLElement, value: Appearance): void {
  root.dataset.preset = value.preset;
  root.dataset.motion = value.motion === "reduced" ? "off" : "on";
  root.dataset.background = value.background ? "on" : "off";
  root.dataset.transparency = value.opaque ? "reduced" : "normal";
  root.classList.toggle("dark", PRESET_MODE[value.preset] === "dark");
}

/** Also called by the head module before React mounts. */
export function initializeAppearance(): Appearance {
  let appearance = { ...DEFAULT_APPEARANCE };
  try {
    appearance = readAppearance(window.localStorage, () => window.matchMedia("(prefers-color-scheme: dark)").matches);
    try { writeAppearance(window.localStorage, appearance); } catch { /* migration retry is idempotent */ }
  } catch { /* storage can be blocked */ }
  applyAppearance(document.documentElement, appearance);
  return appearance;
}
