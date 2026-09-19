import {
  MAX_ATTACHED_IMAGES,
  isBase64ImageWithinLimits,
} from "./image-attachments.ts";

export interface ChatDraftImage {
  data: string;
  mimeType: string;
}

export interface ChatDraft {
  value: string;
  images: ChatDraftImage[];
  /** Attachments were memory-only before this page reload. */
  missingImages?: number;
}

const drafts = new Map<string, ChatDraft>();
const STORAGE_PREFIX = "chat:composer:v1:";

function textStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}

function persistDraft(key: string, draft: ChatDraft | null): void {
  try {
    const storage = textStorage();
    if (!draft) storage?.removeItem(STORAGE_PREFIX + key);
    else storage?.setItem(STORAGE_PREFIX + key, JSON.stringify({
      schemaVersion: 1, value: draft.value, missingImages: draft.images.length + (draft.missingImages ?? 0),
    }));
  } catch {
    // Quota/private-mode failures never discard the in-memory composer.
  }
}

function cloneDraft(draft: ChatDraft): ChatDraft {
  return {
    value: draft.value,
    ...(draft.missingImages ? { missingImages: draft.missingImages } : {}),
    images: draft.images.map((image) => ({ ...image })),
  };
}

function isEmptyDraft(draft: ChatDraft): boolean {
  return !draft.value && draft.images.length === 0 && !draft.missingImages;
}

export function getDraft(key: string): ChatDraft | null {
  const draft = drafts.get(key);
  if (draft) return cloneDraft(draft);
  try {
    const stored: unknown = JSON.parse(textStorage()?.getItem(STORAGE_PREFIX + key) ?? "null");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
    const record = stored as Record<string, unknown>;
    if (record.schemaVersion !== 1 || typeof record.value !== "string"
      || typeof record.missingImages !== "number" || !Number.isSafeInteger(record.missingImages)
      || record.missingImages < 0) return null;
    const restored: ChatDraft = { value: record.value, images: [], ...(record.missingImages ? { missingImages: record.missingImages } : {}) };
    drafts.set(key, restored);
    return cloneDraft(restored);
  } catch { return null; }
}

export function setDraft(key: string, draft: ChatDraft): void {
  if (isEmptyDraft(draft)) {
    clearDraft(key);
    return;
  }
  drafts.set(key, cloneDraft(draft));
  persistDraft(key, draft);
}

export function clearDraft(key: string): void {
  drafts.delete(key);
  persistDraft(key, null);
}

export function mergeRestoredSubmissionText(submitted: string, current: string): string {
  if (!submitted.trim()) return current;
  if (!current.trim()) return submitted;
  return `${submitted}\n\n${current}`;
}

export function mergeRestoredSubmissionDraft(
  submittedText: string,
  submittedImages: ChatDraftImage[] | undefined,
  currentText: string,
  currentImages: ChatDraftImage[],
): ChatDraft {
  const images = [...(submittedImages ?? []), ...currentImages]
    .filter(isBase64ImageWithinLimits)
    .slice(0, MAX_ATTACHED_IMAGES)
    .map(({ data, mimeType }) => ({ data, mimeType }));

  return {
    value: mergeRestoredSubmissionText(submittedText, currentText),
    images,
  };
}

export function restoreDraftSubmission(
  key: string,
  text: string,
  images?: ChatDraftImage[],
): ChatDraft {
  const current = getDraft(key) ?? { value: "", images: [] };
  const restored = mergeRestoredSubmissionDraft(
    text,
    images,
    current.value,
    current.images,
  );
  setDraft(key, restored);
  return restored;
}

export function rekeyDraft(
  previousKey: string,
  nextKey: string,
  currentDraft?: ChatDraft,
): ChatDraft | null {
  if (previousKey === nextKey) return currentDraft ? cloneDraft(currentDraft) : getDraft(nextKey);

  const storedPrevious = getDraft(previousKey);
  const previous = currentDraft && !isEmptyDraft(currentDraft)
    ? cloneDraft(currentDraft)
    : (storedPrevious ?? (currentDraft ? cloneDraft(currentDraft) : null));
  const next = getDraft(nextKey);
  clearDraft(previousKey);
  if (!previous) return next;

  const merged = next
    ? mergeRestoredSubmissionDraft(next.value, next.images, previous.value, previous.images)
    : previous;
  setDraft(nextKey, merged);
  return cloneDraft(merged);
}
