import { InterfaceFeedback } from "./InterfaceFeedback";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchFriendDailyState, type FriendDailyState, type FriendCalendarSession } from "@/lib/friend-daily-browser";
import { fetchFriendWork, type FriendWorkItem } from "@/lib/friend-work";
import { requestFriendTasks, type FriendTasks } from "@/lib/friend-tasks";
import { FriendCalendar } from "./FriendCalendar";
import { LongAgentTasksPanel } from "./LongAgentTasksPanel";
import { LongAgentAvatarView } from "./LongAgentAvatar";
import { fetchLongAgents, type LongAgentSummary } from "@/lib/long-agents-browser";
import styles from "./FriendInspector.module.css";

/**
 * Right-panel Friend inspector (ui-ux §17.3/§15.2): single-date state with
 * derived sections. selectedDate = friendDate ?? today; everything else
 * derives from it. Tasks/duties/executions stay aggregated here and open
 * the dedicated LongAgentTasksPanel; the inspector never lists works.
 */
export function FriendInspector({ agentId, sessionId, date, onOpenSession }: {
  agentId: string; sessionId: string | null; date: string | null;
  onOpenSession: (sessionId: string, projectId: string, date?: string) => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [agent, setAgent] = useState<LongAgentSummary | null>(null);
  const [dayView, setDayView] = useState<{ date: string; calendar: FriendDailyState } | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [works, setWorks] = useState<FriendWorkItem[]>([]);
  const [tasks, setTasks] = useState<FriendTasks | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLongAgents(undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setAgent(result.agents.find(item => item.id === agentId) ?? null); })
      .catch(() => { if (!controller.signal.aborted) setAgent(null); });
    return () => controller.abort();
  }, [agentId]);

  useEffect(() => {
    const controller = new AbortController();
    setDayView(current => date !== null && current?.date === date ? current : null);
    setDayError(null);
    void (async () => {
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

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchFriendWork(agentId, controller.signal).catch(() => [] as FriendWorkItem[]),
      requestFriendTasks(agentId, undefined, controller.signal).catch(() => null),
    ]).then(([nextWorks, nextTasks]) => {
      if (controller.signal.aborted) return;
      setWorks(nextWorks);
      setTasks(nextTasks);
    });
    return () => controller.abort();
  }, [agentId, refresh]);

  const calendar = dayView?.calendar ?? null;
  const selectedDate = dayView?.date ?? date ?? calendar?.today ?? null;
  const isToday = selectedDate !== null && calendar !== null && selectedDate === calendar.today;
  const daily = selectedDate !== null ? calendar?.days.find(day => day.date === selectedDate) ?? null : null;
  const sessions = calendar?.sessions ?? [];
  const daySessions: FriendCalendarSession[] = selectedDate === null ? [] : sessions
    .filter(session => session.kind !== "work" && (session.dates.includes(selectedDate) || session.sessionId === daily?.sessionId))
    .sort((a, b) => {
      if (a.kind === "daily" && b.kind !== "daily") return -1;
      if (b.kind === "daily" && a.kind !== "daily") return 1;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  if (daily && selectedDate !== null && !daySessions.some(session => session.sessionId === daily.sessionId)) {
    daySessions.unshift({ sessionId: daily.sessionId, projectId: agentId, dates: [], kind: "daily", title: t("friendCalendar.kind.daily") });
  }
  const dailySession = daySessions.find(session => session.kind === "daily") ?? null;
  const others = daySessions.filter(session => session.kind !== "daily");

  const activeWorks = works.filter(item => item.execution?.status === "running" || item.execution?.status === "queued");
  const waitingWorks = works.filter(item => item.execution === null || item.execution?.status === "interrupted");
  const taskCount = tasks?.tasks.filter(task => task.dutyId === undefined).length ?? 0;
  const dutyCount = tasks?.tasks.filter(task => task.dutyId !== undefined).length ?? 0;

  const dateLabel = selectedDate === null ? t("common.loading") : new Intl.DateTimeFormat(locale, {
    timeZone: calendar?.timeZone, month: "long", day: "numeric",
  }).format(new Date(`${selectedDate}T00:00:00Z`));
  const timeShort = (createdAt?: string) => createdAt && calendar ? new Intl.DateTimeFormat(locale, {
    timeZone: calendar.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(createdAt)) : null;
  const timeTitle = (createdAt?: string) => createdAt && calendar ? `${new Intl.DateTimeFormat(locale, {
    timeZone: calendar.timeZone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(createdAt))} (${calendar.timeZone})` : undefined;

  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); if (mounted.current) setRefresh(value => value + 1); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (mounted.current) setBusy(false); }
  };

  return <section className={styles.inspector} aria-label={t("workspaceNav.profile")}>
    {agent && <header className={styles.identity}>
      <LongAgentAvatarView agentId={agent.id} name={agent.name} avatar={agent.avatar} />
      <div><strong>{agent.name}</strong><span>{agent.description}</span></div>
    </header>}

    <div className={styles.dateRow}>
      <h3>{dateLabel}{isToday && <em className={styles.today}>{t("friendCalendar.today")}</em>}</h3>
      <div>
        {calendar && <span className={styles.tz} title={calendar.timeZone} aria-label={calendar.timeZone}>ⓘ</span>}
        <button type="button" onClick={() => setCalendarOpen(true)} aria-label={t("friendCalendar.open")}>{t("friendCalendar.open")}</button>
      </div>
    </div>

    {dailySession && <button type="button" className={styles.primary} disabled={busy || selectedDate === null}
      aria-current={dailySession.sessionId === sessionId ? "page" : undefined}
      onClick={() => void act(() => Promise.resolve(onOpenSession(dailySession.sessionId, agentId, selectedDate!)))}>
      <strong>{isToday ? t("friendInspector.todayChat") : t("friendInspector.dayChat", { date: dateLabel })}</strong>
      <span>{t("friendInspector.enterToday")}</span>
    </button>}

    {others.length > 0 && <ul className={styles.sessions} aria-label={t("friendCalendar.daySessions")}>
      {others.map(session => <li key={session.sessionId}>
        <button type="button" disabled={busy} title={timeTitle(session.createdAt)}
          aria-current={session.sessionId === sessionId ? "page" : undefined}
          onClick={() => void act(() => Promise.resolve(onOpenSession(session.sessionId, agentId, selectedDate!)))}>
          <strong>{session.title || t("friendCalendar.untitled")}</strong>
          <span>{t(`friendCalendar.kind.${session.kind}`)}{timeShort(session.createdAt) ? ` · ${timeShort(session.createdAt)}` : ""}</span>
        </button>
      </li>)}
    </ul>}

    <button type="button" className={styles.tasks} onClick={() => setTasksOpen(true)}>
      <strong>{t("friendInspector.tasksTitle")}</strong>
      <span>{t("friendInspector.tasksSummary", {
        tasks: taskCount, duties: dutyCount,
        running: activeWorks.length, waiting: waitingWorks.length,
      })}</span>
    </button>

    {(error || dayError) && <div role="alert" className={styles.error}><p><InterfaceFeedback message={error || dayError} /></p>
      <button type="button" onClick={() => setRefresh(value => value + 1)}>{t("friendWork.retry")}</button></div>}

    {calendarOpen && agent && <FriendCalendar key={`${agent.id}:${selectedDate ?? "today"}`} agentId={agent.id} name={agent.name}
      selectedSessionId={sessionId} selectedDate={selectedDate}
      onClose={() => setCalendarOpen(false)}
      onOpenSession={async (id, ownerProjectId, nextDate) => { await onOpenSession(id, ownerProjectId, nextDate); setCalendarOpen(false); }} />}
    {tasksOpen && <LongAgentTasksPanel key={agentId} agentId={agentId} name={agent?.name ?? agentId}
      onClose={() => setTasksOpen(false)}
      onOpenSession={async (id, ownerProjectId, nextDate) => { await onOpenSession(id, ownerProjectId, nextDate); setTasksOpen(false); }} />}
  </section>;
}
