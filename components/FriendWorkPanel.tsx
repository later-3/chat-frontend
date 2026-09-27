import { Button } from "./ui/Button";
import { TaskRunDetails } from "./TaskRunDetails";
import { InterfaceFeedback } from "./InterfaceFeedback";
import { readFriendWorkSubmission, saveFriendWorkSubmission, type FriendWorkSubmission } from "@/lib/friend-work-draft";
import { useEffect, useRef, useState } from "react";
import { IconPlayerStop } from "@tabler/icons-react";
import { fetchFriendWork, startFriendWork, type FriendWorkItem } from "@/lib/friend-work";
import { cancelFriendExecution } from "@/lib/friend-execution";
import { fetchFriendDailyState, type FriendDailyState } from "@/lib/friend-daily-browser";
import { dateInTimeZone } from "@/lib/friend-calendar";
import { useI18n } from "@/hooks/useI18n";
import styles from "./FriendWorkPanel.module.css";

export function FriendWorkPanel({ agentId, sessionId, date, onOpenSession }: {
  agentId: string; sessionId: string; projectId: string | null; date: string | null;
  onOpenSession: (sessionId: string, projectId: string, date?: string) => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [dayView, setDayView] = useState<{ date: string; calendar: FriendDailyState } | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [items, setItems] = useState<FriendWorkItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<FriendWorkSubmission | null>(() => readFriendWorkSubmission(agentId));
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const selected = items.find(item => item.work.sessionId === sessionId);
  useEffect(() => {
    const controller = new AbortController(); let fetching = false;
    const load = async () => {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        const next = await fetchFriendWork(agentId, controller.signal);
        if (!controller.signal.aborted) { setItems(next); setLoaded(true); setLoadError(null); }
      } catch (cause) { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : String(cause)); }
      finally { fetching = false; }
    };
    void load(); const timer = setInterval(() => void load(), 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [agentId, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setDayView(current => date !== null && current?.date === date ? current : null); setDayError(null);
    void (async () => {
      // Navigation stays on the shared Session path. Read the existing calendar after it opens;
      // this sidebar projection never delays the message/composer first paint.
      let target = date;
      if (target === null) {
        const summary = await fetchFriendDailyState(agentId, controller.signal);
        target = summary.days.find(day => day.sessionId === sessionId)?.date ?? summary.today;
      }
      const calendar = await fetchFriendDailyState(agentId, controller.signal, undefined, Number(target.slice(0, 4)));
      if (!controller.signal.aborted) setDayView({ date: target, calendar });
    })().catch((cause: unknown) => {
      if (!controller.signal.aborted) setDayError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => controller.abort();
  }, [agentId, sessionId, date, refresh]);
  const calendarSessions = dayView?.calendar.sessions ?? [];
  const daily = dayView?.calendar.days.find(day => day.date === dayView.date);
  const daySessions = calendarSessions.filter(session => session.kind !== "work"
    && (session.dates.includes(dayView!.date) || session.sessionId === daily?.sessionId));
  // Empty daily Sessions intentionally have no green activity dot, but remain navigable here.
  if (daily && !daySessions.some(session => session.sessionId === daily.sessionId)) daySessions.unshift({
    sessionId: daily.sessionId, projectId: agentId, dates: [], kind: "daily", title: t("friendCalendar.kind.daily"),
  });
  const dayWorks = dayView === null ? [] : items.filter(item =>
    dateInTimeZone(item.work.createdAt, dayView.calendar.timeZone) === dayView.date
    || calendarSessions.some(session => session.sessionId === item.work.sessionId && session.dates.includes(dayView.date)));
  const createdTime = (timestamp: string) => new Intl.DateTimeFormat(locale, {
    timeZone: dayView?.calendar.timeZone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(timestamp));
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); if (mounted.current) setRefresh(n => n + 1); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section className={styles.panel} data-friend-day={dayView?.date} aria-label={t("friendCalendar.dayWorkspace")}>
    <h3 className={styles.dayHeading}>{dayView?.date ?? date ?? t("common.loading")}</h3>
    {dayView && <p className={styles.timeZone}>{dayView.calendar.timeZone}</p>}
    <ul aria-label={t("friendCalendar.daySessions")}>{daySessions.map(session => <li key={session.sessionId}>
      <button type="button" className={styles.work} data-day-session={session.sessionId}
        aria-current={session.sessionId === sessionId ? "page" : undefined} disabled={busy}
        onClick={() => void act(() => Promise.resolve(onOpenSession(session.sessionId, agentId, dayView?.date)))}>
        <strong>{session.kind === "daily" ? t("friendCalendar.kind.daily") : session.title || t("friendCalendar.untitled")}</strong>{session.kind !== "daily" && <span>{t(`friendCalendar.kind.${session.kind}`)}</span>}
        {session.createdAt && <span>{t("friendCalendar.started", { time: createdTime(session.createdAt) })}</span>}
      </button>
    </li>)}</ul>
    <header><h3>{t("friendWork.heading")}</h3></header>
    {daily && <Button variant="ghost" data-arrange-background onClick={() => void act(async () => { await onOpenSession(daily.sessionId, agentId, dayView?.date); document.querySelector<HTMLTextAreaElement>("[data-chat-composer]")?.focus(); })}>{t("friendWork.arrangeInChat")}</Button>}
    {selected && <p>{t("friendWork.fixedContext", { project: selected.work.contextProjectId ?? t("friendWork.noProject") })}</p>}
    {pending && <div role="status"><p>{t("friendWork.unconfirmed")}</p>
      <button type="button" disabled={busy} onClick={() => void act(async () => {
        await startFriendWork(agentId, pending); saveFriendWorkSubmission(agentId, null);
        if (mounted.current) { setPending(null); }
      })}>{t("friendWork.confirm")}</button></div>}
    {(error || loadError || dayError) && <div role="alert"><p><InterfaceFeedback message={error || loadError || dayError} /></p><button type="button" onClick={() => setRefresh(n => n + 1)}>{t("friendWork.retry")}</button></div>}
    {!loaded && !error && !loadError && <p role="status">{t("friendWork.loading")}</p>}
    {loaded && dayView && dayWorks.length === 0 && <p>{t("friendWork.empty")}</p>}
    <ul>{[...dayWorks].reverse().map(item => <li key={item.work.id} data-day-work={item.work.id}>
      <button type="button" className={styles.work} aria-current={item.work.sessionId === sessionId ? "page" : undefined}
        onClick={() => void act(() => Promise.resolve(onOpenSession(item.work.sessionId, agentId, dayView?.date)))} disabled={busy}>
        <strong title={item.work.title}>{item.displayTitle ?? item.work.title}</strong><span title={item.work.createdAt}>{t("friendCalendar.started", { time: createdTime(item.work.createdAt) })}</span><span>{t(`friendWork.status.${item.execution?.status ?? "unknown"}`)}</span>
      </button>
      {item.execution?.capabilities.cancel && <button type="button" disabled={busy} title={t("friendWork.stop", { title: item.work.title })}
        aria-label={t("friendWork.stop", { title: item.work.title })} onClick={() => void act(() => cancelFriendExecution(item.execution!))}><IconPlayerStop size={16} /></button>}
    </li>)}</ul>
    {selected && <TaskRunDetails agentId={agentId} workId={selected.work.id} sessionId={selected.work.sessionId} />}
  </section>;
}
