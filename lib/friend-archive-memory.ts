/**
 * Days the user added to a Friend's tasks/archive area (UI/UX §17.3).
 *
 * The area always shows today; older days are added on purpose from the
 * calendar so the column keeps the days the user actually cares about
 * instead of scrolling through a year. Browser-owned navigation preference:
 * it never carries task or Session facts, and a bad/expired value is dropped
 * rather than repaired.
 */
const STORAGE_PREFIX = "chat:friend-archive:";
const MAX_DAYS = 7;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function keyFor(agentId: string): string {
  return `${STORAGE_PREFIX}${agentId}`;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && DATE_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

/** Reads the stored days, newest first, ignoring anything malformed. */
export function readArchivedDays(agentId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(agentId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter(isDate))].sort((a, b) => b.localeCompare(a)).slice(0, MAX_DAYS);
  } catch {
    return [];
  }
}

/** Stores the days, newest first and capped; returns the value actually kept. */
export function writeArchivedDays(agentId: string, days: readonly string[]): string[] {
  const next = [...new Set(days.filter(isDate))].sort((a, b) => b.localeCompare(a)).slice(0, MAX_DAYS);
  try {
    if (next.length === 0) localStorage.removeItem(keyFor(agentId));
    else localStorage.setItem(keyFor(agentId), JSON.stringify(next));
  } catch {
    // Storage is a convenience; the panel stays usable without it.
  }
  return next;
}

/** Adds one day, keeping the cap; today is never stored because it is always shown. */
export function addArchivedDay(agentId: string, day: string, today: string | null): string[] {
  const current = readArchivedDays(agentId);
  const next = day === today ? current : [day, ...current];
  return writeArchivedDays(agentId, next);
}

export function removeArchivedDay(agentId: string, day: string): string[] {
  return writeArchivedDays(agentId, readArchivedDays(agentId).filter(value => value !== day));
}

export const ARCHIVED_DAY_LIMIT = MAX_DAYS;
