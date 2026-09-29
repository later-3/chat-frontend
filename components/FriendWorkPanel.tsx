import { InterfaceFeedback } from "./InterfaceFeedback";
import { readFriendWorkSubmission, saveFriendWorkSubmission, type FriendWorkSubmission } from "@/lib/friend-work-draft";
import { useEffect, useRef, useState } from "react";
import { startFriendWork } from "@/lib/friend-work";
import { fetchFriendDailyState, type FriendDailyState } from "@/lib/friend-daily-browser";
import { useI18n } from "@/hooks/useI18n";
import styles from "./FriendWorkPanel.module.css";

/** Day projection only: navigation across the day's sessions plus unconfirmed-submission recovery.
    Tasks, duties and background executions live in the dedicated LongAgentTasksPanel overlay. */
export function FriendWorkPanel({ agentId, sessionId, date, onOpenSession }: {
  agentId: string; sessionId: string; date: string | null;
  onOpenSession: (sessionId: string, projectId: string, date?: string) => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [dayView, setDayView] = useState<{ date: string; calendar: FriendDailyState } | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<FriendWorkSubmission | null>(() => readFriendWorkSubmission(agentId));
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
  // P2：当天导航只做导航。daily 置顶，其他按开始时间倒序；work 类由任务面板承载。
  const daySessions = calendarSessions.filter(session => session.kind !== "work"
    && (session.dates.includes(dayView!.date) || session.sessionId === daily?.sessionId))
    .sort((a, b) => {
      if (a.kind === "daily" && b.kind !== "daily") return -1;
      if (b.kind === "daily" && a.kind !== "daily") return 1;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  // Empty daily Sessions intentionally have no green activity dot, but remain navigable here.
  if (daily && !daySessions.some(session => session.sessionId === daily.sessionId)) daySessions.unshift({
    sessionId: daily.sessionId, projectId: agentId, dates: [], kind: "daily", title: t("friendCalendar.kind.daily"),
  });
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); if (mounted.current) setRefresh(n => n + 1); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section className={styles.panel} data-friend-day={dayView?.date} aria-label={t("friendCalendar.dayWorkspace")}>
    <ul aria-label={t("friendCalendar.daySessions")}>{daySessions.map(session => {
      // P2：时区只留 title 提示，不占一行；时间精确到分；kind 只在非 daily 显示。
      const startedTitle = session.createdAt && dayView ? new Intl.DateTimeFormat(locale, {
        timeZone: dayView.calendar.timeZone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(new Date(session.createdAt)) + (dayView.calendar.timeZone ? ` (${dayView.calendar.timeZone})` : "") : null;
      const startedShort = session.createdAt && dayView ? new Intl.DateTimeFormat(locale, {
        timeZone: dayView.calendar.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(new Date(session.createdAt)) : null;
      return <li key={session.sessionId}>
      <button type="button" className={styles.work} data-day-session={session.sessionId}
        aria-current={session.sessionId === sessionId ? "page" : undefined} disabled={busy}
        title={startedTitle ?? undefined}
        onClick={() => void act(() => Promise.resolve(onOpenSession(session.sessionId, agentId, dayView?.date)))}>
        <strong>{session.kind === "daily" ? t("friendCalendar.kind.daily") : session.title || t("friendCalendar.untitled")}</strong>{session.kind !== "daily" && <span>{t(`friendCalendar.kind.${session.kind}`)}{startedShort ? ` · ${startedShort}` : ""}</span>}
      </button>
    </li>;})}</ul>
    <header><h3>{t("friendWork.heading")}</h3></header>
    {pending && <div role="status"><p>{t("friendWork.unconfirmed")}</p>
      <button type="button" disabled={busy} onClick={() => void act(async () => {
        await startFriendWork(agentId, pending); saveFriendWorkSubmission(agentId, null);
        if (mounted.current) { setPending(null); }
      })}>{t("friendWork.confirm")}</button></div>}
    {(error || dayError) && <div role="alert"><p><InterfaceFeedback message={error || dayError} /></p><button type="button" onClick={() => setRefresh(n => n + 1)}>{t("friendWork.retry")}</button></div>}
  </section>;
}
