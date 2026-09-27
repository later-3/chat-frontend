import type { FriendCalendarSession } from "./friend-daily-browser";

/** One date can contain a daily conversation, several jobs and topic/child Sessions. */
export function sessionsByDate(sessions: readonly FriendCalendarSession[]): Map<string, FriendCalendarSession[]> {
  const result = new Map<string, FriendCalendarSession[]>();
  for (const session of sessions) for (const date of session.dates) {
    const day = result.get(date) ?? [];
    day.push(session);
    result.set(date, day);
  }
  return result;
}

/** Calendar layout uses civil dates from the Friend's time zone, never the browser's offset. */
export function calendarDates(year: number): string[] {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) throw new Error("Invalid calendar year");
  const dates: string[] = [];
  const cursor = new Date(Date.UTC(year, 0, 1));
  while (cursor.getUTCFullYear() === year) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function calendarWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Optional day filter in a Session URL; never grants ownership or changes execution identity. */
export function friendDateFromUrl(href: string): string | null {
  const date = new URL(href).searchParams.get("friendDate");
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(date).toISOString().slice(0, 10) === date ? date : null;
}

export function dateInTimeZone(timestamp: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
