/**
 * Device-level UI preferences that are not covered by theme/locale.
 * Browser-owned display choices only; they never carry product facts.
 */
const TOOLBAR_LABELS_KEY = "chat:toolbar-labels";

export type ToolbarLabelMode = "icons" | "icons-and-labels";

/** Toolbars default to icons only; labels are opt-in (UI/UX §13.2). */
export function readToolbarLabelMode(): ToolbarLabelMode {
  try {
    return localStorage.getItem(TOOLBAR_LABELS_KEY) === "icons-and-labels" ? "icons-and-labels" : "icons";
  } catch {
    return "icons";
  }
}

export function writeToolbarLabelMode(mode: ToolbarLabelMode): void {
  try {
    localStorage.setItem(TOOLBAR_LABELS_KEY, mode);
  } catch {
    // Display preference only; the toolbar stays usable without storage.
  }
}

export const showToolbarLabels = (mode: ToolbarLabelMode): boolean => mode === "icons-and-labels";
