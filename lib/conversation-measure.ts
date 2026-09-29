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
/** 60rem — above this a single prose column stops being readable. */
export const CONVERSATION_MEASURE_MAX_WIDTH = 960;
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
