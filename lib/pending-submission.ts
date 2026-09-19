/** Browser-owned input recovery only; this is not a delivery or execution record. */
export interface PendingSubmission {
  id: string;
  text: string;
  missingImages: number;
}
const prefix = "chat:unconfirmed-input:v1:";
const memory = new Map<string, PendingSubmission>();
const listeners = new Set<() => void>();

export function readPendingSubmission(key: string): PendingSubmission | null {
  const cached = memory.get(key);
  if (cached) return cached;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(prefix + key) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 1 || typeof record.id !== "string" || !record.id
      || typeof record.text !== "string" || typeof record.missingImages !== "number"
      || !Number.isSafeInteger(record.missingImages) || record.missingImages < 0) return null;
    const restored = { id: record.id, text: record.text, missingImages: record.missingImages };
    memory.set(key, restored);
    return restored;
  } catch { return null; }
}

export function retainPendingSubmission(key: string, text: string, imageCount: number): string {
  const value = { id: crypto.randomUUID(), text, missingImages: imageCount };
  memory.set(key, value);
  try { window.sessionStorage.setItem(prefix + key, JSON.stringify({ schemaVersion: 1, ...value })); }
  catch { /* Keep recovery in memory when storage is unavailable. */ }
  listeners.forEach(listener => listener());
  return value.id;
}

export function clearPendingSubmission(key: string, id: string): void {
  if (readPendingSubmission(key)?.id !== id) return;
  memory.delete(key);
  try { window.sessionStorage.removeItem(prefix + key); }
  catch { /* Storage restrictions must not break sending. */ }
  listeners.forEach(listener => listener());
}

export function subscribePendingSubmissions(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
