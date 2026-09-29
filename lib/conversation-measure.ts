/**
 * Conversation reading width (UI/UX §20.7 会话宽度).
 *
 * The width slider in the conversation top bar owns this single value; the
 * message column, the run status and the composer all read
 * `--conversation-measure`, so the column cannot drift apart while it is being
 * adjusted (see `lib/measure-contract.test.mjs`).
 */

/** 30rem — below this the readable prose measure breaks down. */
export const CONVERSATION_MEASURE_MIN_WIDTH = 480;
/**
 * 90rem — the ceiling for very wide screens. The width that is actually
 * reachable is smaller: it comes from the column that is available right now
 * (`conversationMeasureMaxWidth`), minus the column chrome and a margin, so the
 * column can be filled without touching the surrounding panels.
 */
export const CONVERSATION_MEASURE_MAX_WIDTH = 1440;
/** Message-area chrome: 16px side padding + the 36px ChatMinimap gutter. */
export const CONVERSATION_MEASURE_CHROME_WIDTH = 68;
/** Aesthetic breathing room kept on both sides when the column is filled. */
export const CONVERSATION_MEASURE_EDGE_MARGIN = 24;
/** Pointer/keyboard step in px; Shift uses the coarse step. */
export const CONVERSATION_MEASURE_STEP = 12;
export const CONVERSATION_MEASURE_COARSE_STEP = 32;
/** 42rem, the layout default that `--measure-prose` declares. */
export const CONVERSATION_MEASURE_DEFAULT_WIDTH = 672;
export const CONVERSATION_MEASURE_STORAGE_KEY = "chat:conversation-measure";
/** Stored value for "follow the layout default": no pixel override at all. */
export const CONVERSATION_MEASURE_AUTO_SENTINEL = "auto";

export function clampConversationMeasure(width: number): number {
  const bounded = Number.isFinite(width) ? width : CONVERSATION_MEASURE_DEFAULT_WIDTH;
  return Math.round(Math.min(CONVERSATION_MEASURE_MAX_WIDTH, Math.max(CONVERSATION_MEASURE_MIN_WIDTH, bounded)));
}

export function stepConversationMeasure(current: number, delta: number): number {
  return clampConversationMeasure(current + delta);
}

/**
 * Widest measure that still leaves a margin inside `columnWidth` (the width of
 * the conversation column area). Never below the readable minimum, never above
 * the hard ceiling.
 */
export function conversationMeasureMaxWidth(columnWidth: number): number {
  if (!Number.isFinite(columnWidth) || columnWidth <= 0) return CONVERSATION_MEASURE_MAX_WIDTH;
  const usable = columnWidth - CONVERSATION_MEASURE_CHROME_WIDTH - CONVERSATION_MEASURE_EDGE_MARGIN * 2;
  return Math.max(CONVERSATION_MEASURE_MIN_WIDTH, Math.min(CONVERSATION_MEASURE_MAX_WIDTH, Math.round(usable)));
}

/** `null` means auto: the column follows `--measure-prose` and the window width. */
export function readConversationMeasure(): number | null {
  try {
    const stored = window.localStorage.getItem(CONVERSATION_MEASURE_STORAGE_KEY);
    if (stored === null || stored === CONVERSATION_MEASURE_AUTO_SENTINEL) return null;
    const parsed = Number.parseInt(stored, 10);
    return Number.isFinite(parsed) ? clampConversationMeasure(parsed) : null;
  } catch {
    return null;
  }
}

export function writeConversationMeasure(value: number | null): void {
  try {
    window.localStorage.setItem(
      CONVERSATION_MEASURE_STORAGE_KEY,
      value === null ? CONVERSATION_MEASURE_AUTO_SENTINEL : String(clampConversationMeasure(value)),
    );
  } catch {
    // The slider keeps working while storage is unavailable.
  }
}

/** Custom-property value; `""` removes the override and falls back to --measure-prose. */
export function conversationMeasureCssValue(value: number | null): string {
  return value === null ? "" : `${clampConversationMeasure(value)}px`;
}

/** Label for the Hint and `aria-valuetext`, in rem because that is the design unit. */
export function formatConversationMeasure(value: number): string {
  const rem = Math.round((clampConversationMeasure(value) / 16) * 10) / 10;
  return `${rem}rem`;
}
