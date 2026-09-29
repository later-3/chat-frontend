
import { InterfaceFeedback } from "./InterfaceFeedback";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronLeft, IconChevronRight, IconRefresh } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { calendarDates, calendarWeekday, sessionsByDate } from "@/lib/friend-calendar";
import { fetchFriendDailyState, type FriendDailyState } from "@/lib/friend-daily-browser";
import { startProjectLongAgent } from "@/lib/long-agents-browser";
import { SurfaceDialog } from "./SurfaceDialog";
import styles from "./FriendCalendar.module.css";

export function FriendCalendar({ agentId, name, selectedSessionId, selectedDate, onOpenSession, onClose, onPickDate }: {
  agentId: string;
  name: string;
  selectedSessionId: string | null;
  selectedDate: string | null;
  onOpenSession: (sessionId: string, projectId: string, date?: string) => void | Promise<void>;
  onClose: () => void;
  /** Browse-only mode: choosing a date reports it instead of switching the chat. */
  onPickDate?: (date: string) => void;
}) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<FriendDailyState | null>(null);
  const [year, setYear] = useState<number | null>(() => selectedDate ? Number(selectedDate.slice(0, 4)) : null);
  const [month, setMonth] = useState(() => selectedDate ? Number(selectedDate.slice(5, 7)) - 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void fetchFriendDailyState(agentId, controller.signal, undefined, year ?? undefined).then(next => {
      if (controller.signal.aborted) return;
      if (year === null) {
        // Bootstrap from the Friend's date; then request the complete year, beyond the status panel's 60 days.
        setYear(Number(next.today.slice(0, 4))); setMonth(Number(next.today.slice(5, 7)) - 1);
        return;
      }
      setState(next);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [agentId, year, refresh]);
  const dates = useMemo(() => year === null ? [] : calendarDates(year), [year]);
  const sessions = useMemo(() => sessionsByDate(state?.sessions ?? []), [state]);
  const monthDates = dates.filter(date => Number(date.slice(5, 7)) === month + 1);
  const monthFormat = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const weekFormat = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const busy = loading || opening;
  const openDate = (date: string) => {
    if (busy) return;
    if (onPickDate) { onPickDate(date); return; }
    setOpening(true); setError(null);
    // Date opens the existing workspace at that day's daily Session; its sidebar shows the day's
    // work and other Sessions. /start is idempotent and does not run a model or schedule anything.
    void startProjectLongAgent({ longAgentId: agentId, projectId: agentId, date }).then(async started => {
      await onOpenSession(started.primarySessionId, started.projectId, date); onClose();
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setOpening(false));
  };
  const isCurrent = (date: string) => selectedDate !== null ? selectedDate === date
    : state?.days.some(day => day.date === date && day.sessionId === selectedSessionId) === true;
  const label = (date: string) => `${date} · ${t(sessions.has(date) ? "friendCalendar.hasSession" : "friendCalendar.noSession")}`;
  const count = loading ? "—" : String(dates.filter(date => sessions.has(date)).length);
  // Keep the reader visible when a narrow layout hides the sidebar that opened it.
  return createPortal(<SurfaceDialog title={t("friendCalendar.title", { name })}
    description={onPickDate ? t("friendCalendar.pickHint") : t("friendCalendar.hint")} onClose={onClose}>
    <div className={styles.body} data-friend-calendar={agentId} aria-busy={busy}>
      <div className={styles.toolbar}>
        <strong>{t("friendCalendar.count", { count })}</strong>
        <div className={styles.year}>
          <button type="button" aria-label={t("friendCalendar.previousYear")} disabled={busy || year === null || year <= 1970} onClick={() => setYear(value => value === null ? value : value - 1)}><IconChevronLeft size={18} /></button>
          <span data-calendar-year>{year ?? "—"}</span>
          <button type="button" aria-label={t("friendCalendar.nextYear")} disabled={busy || year === null || year >= 9999} onClick={() => setYear(value => value === null ? value : value + 1)}><IconChevronRight size={18} /></button>
          <button type="button" aria-label={t("common.refresh")} disabled={busy} onClick={() => setRefresh(value => value + 1)}><IconRefresh size={18} /></button>
        </div>
      </div>
      {error && <p role="alert" className={styles.error}><InterfaceFeedback message={error} /></p>}
      {loading && <p role="status">{t("common.loading")}</p>}
      {state && year !== null && <>
        <div className={styles.heatmapScroll}>
          <div className={styles.heatmap} aria-label={t("friendCalendar.yearOverview")}>
            {Array.from({ length: calendarWeekday(dates[0]) }, (_, index) => <span key={`pad-${index}`} />)}
            {dates.map(date => <button type="button" key={date} title={label(date)} aria-label={label(date)}
              data-calendar-heat-date={date} data-active={!loading && sessions.has(date) || undefined}
              aria-current={isCurrent(date) ? "date" : undefined}
              disabled={busy} onClick={() => openDate(date)} />)}
          </div>
        </div>
        <p className={styles.legend}><span aria-hidden="true" />{t("friendCalendar.legend")} · {state.timeZone}</p>
        <div className={styles.months} aria-label={t("friendCalendar.months")}>
          {Array.from({ length: 12 }, (_, index) => <button type="button" key={index} aria-pressed={month === index}
            data-calendar-month={index + 1} onClick={() => setMonth(index)}>{monthFormat.format(new Date(Date.UTC(year, index, 1)))}</button>)}
        </div>
        <div className={styles.monthGrid} aria-label={`${year} ${monthFormat.format(new Date(Date.UTC(year, month, 1)))}`}>
          {Array.from({ length: 7 }, (_, index) => <span className={styles.weekday} key={`weekday-${index}`}>{weekFormat.format(new Date(Date.UTC(2026, 0, 4 + index)))}</span>)}
          {Array.from({ length: calendarWeekday(monthDates[0]) }, (_, index) => <span key={`pad-${index}`} />)}
          {monthDates.map(date => <button type="button" key={date} title={label(date)} aria-label={label(date)}
            data-calendar-date={date} aria-current={isCurrent(date) ? "date" : undefined}
            disabled={busy} onClick={() => openDate(date)}>
            {Number(date.slice(8))}{!loading && sessions.has(date) && <span className={styles.dot} aria-hidden="true" />}
          </button>)}
        </div>
        {!loading && !error && !monthDates.some(date => sessions.has(date)) && <p className={styles.legend}>{t("friendCalendar.emptyMonth")}</p>}
      </>}
    </div>
  </SurfaceDialog>, document.body);
}
