export const APPEARANCE_KEY = "chat:appearance:v1";
export const PALETTES = ["classic", "ocean", "rose", "orchid", "instagram"] as const;
export type Palette = typeof PALETTES[number];
export type Appearance = {
  material: "paper" | "glass";
  palette: Palette;
  motion: "full" | "reduced";
  background: boolean;
  opaque: boolean;
};
export const DEFAULT_APPEARANCE: Readonly<Appearance> = {
  material: "paper", palette: "classic", motion: "full", background: true, opaque: false,
};

/** Browser preferences are untrusted and independent of execution configuration. */
export function parseAppearance(raw: string | null): Appearance {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) return { ...DEFAULT_APPEARANCE };
    const data = value as Record<string, unknown>;
    return {
      material: data.material === "glass" ? "glass" : "paper",
      palette: PALETTES.includes(data.palette as Palette) ? data.palette as Palette : "classic",
      motion: data.motion === "reduced" ? "reduced" : "full",
      background: typeof data.background === "boolean" ? data.background : true,
      opaque: typeof data.opaque === "boolean" ? data.opaque : false,
    };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

export function readAppearance(storage: Pick<Storage, "getItem">): Appearance {
  try { return parseAppearance(storage.getItem(APPEARANCE_KEY)); }
  catch { return { ...DEFAULT_APPEARANCE }; }
}

export function applyAppearance(root: HTMLElement, value: Appearance): void {
  root.dataset.material = value.material;
  root.dataset.palette = value.palette;
  root.dataset.motion = value.motion;
  root.dataset.background = value.background ? "on" : "off";
  root.dataset.transparency = value.opaque ? "opaque" : "auto";
}

/** Also called by the head module before React mounts. */
export function initializeAppearance(): Appearance {
  let appearance = { ...DEFAULT_APPEARANCE };
  try { appearance = readAppearance(window.localStorage); } catch { /* storage can be blocked */ }
  applyAppearance(document.documentElement, appearance);
  return appearance;
}
