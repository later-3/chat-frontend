import { InterfaceFeedback } from "./InterfaceFeedback";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronRight, IconX } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { fetchFriendDailyState, type FriendDailyState, type FriendCalendarSession } from "@/lib/friend-daily-browser";
import { fetchFriendWork, startFriendWork, type FriendWorkItem } from "@/lib/friend-work";
import { requestFriendTasks, buildFriendTaskRows, type FriendTasks, type TaskPanelRow } from "@/lib/friend-tasks";
import { readFriendWorkSubmission, saveFriendWorkSubmission, type FriendWorkSubmission } from "@/lib/friend-work-draft";
import { sessionsByDate } from "@/lib/friend-calendar";
import { fetchChatProjects } from "@/lib/projects-contract";
import { startProjectLongAgent } from "@/lib/long-agents-browser";
import { Button } from "./ui/Button";
import { FriendCalendar } from "./FriendCalendar";
import { LongAgentTasksPanel } from "./LongAgentTasksPanel";
import styles from "./FriendInspector.module.css";

const ARCHIVE_DAYS = 7;
const TASK_ROWS = 5;

/**
 * Vertical day/task area for one Friend (ui-ux §17.3/§15.2).
 *
 * Purpose, not identity: the rail already shows who the Friend is, so this
 * area must never repeat the avatar/name/description. It answers two
 * questions — "what is scheduled for this Friend" and "what happened on
 * which day" — as one vertical column:
 *
 *   当天     daily entry + the other sessions of the selected day
 *   任务     scheduled tasks / duties / executions (from the tasks view model)
 *   日期归档  recent days that actually carry messages, plus the full calendar
 *
 * One state (selectedDate = friendDate ?? today) drives all three.
 */
export function FriendInspector({ agentId, sessionId, date, onOpenSession, onClose }: {
  agentId: string; sessionId: string | null; date: string | null;
  onOpenSession: (sessionId: string, projectId: string, date?: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [calendar, setCalendar] = useState<FriendDailyState | null>(null);
  const [resolvedDate, setResolvedDate] = useState<string | null>(date);
  const [dayError, setDayError] = useState<string | null>(null);
  const [works, setWorks] = useState<FriendWorkItem[]>([]);
  const [tasks, setTasks] = useState<FriendTasks | null>(null);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<FriendWorkSubmission | null>(() => readFriendWorkSubmission(agentId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setResolvedDate(date); }, [date]);

  useEffect(() => {
    const controller = new AbortController();
    setCalendar(null);
    setDayError(null);
    void (async () => {
      // The 60-day window resolves today (and the current Session's day); the annual
      // read then supplies the per-day session projection used by the archive.
      const summary = await fetchFriendDailyState(agentId, controller.signal);
      const target = date ?? summary.days.find(day => day.sessionId === sessionId)?.date ?? summary.today;
      const annual = await fetchFriendDailyState(agentId, controller.signal, undefined, Number(target.slice(0, 4)));
      if (!controller.signal.aborted) { setCalendar(annual); setResolvedDate(target); }
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

  useEffect(() => {
    const controller = new AbortController();
    void fetchChatProjects(controller.signal)
      .then(projects => { if (!controller.signal.aborted) setProjectNames(new Map(projects.map(project => [project.projectId, project.cachedName]))); })
      .catch(() => { if (!controller.signal.aborted) setProjectNames(new Map()); });
    return () => controller.abort();
  }, [agentId]);

  const selectedDate = resolvedDate ?? calendar?.today ?? null;
  const isToday = selectedDate !== null && calendar !== null && selectedDate === calendar.today;
  const sessions = calendar?.sessions ?? [];
  const byDate = useMemo(() => sessionsByDate(sessions), [sessions]);
  const daily = selectedDate !== null ? calendar?.days.find(day => day.date === selectedDate) ?? null : null;
  const daySessions: FriendCalendarSession[] = selectedDate === null ? [] : sessions
    .filter(session => session.kind !== "work" && (session.dates.includes(selectedDate) || session.sessionId === daily?.sessionId))
    .sort((a, b) => (a.kind === "daily" ? -1 : b.kind === "daily" ? 1 : (b.createdAt ?? "").localeCompare(a.createdAt ?? "")));
  const dailySession = daySessions.find(session => session.kind === "daily")
    ?? (daily && selectedDate !== null ? { sessionId: daily.sessionId, projectId: agentId, dates: [], kind: "daily" as const, title: t("friendCalendar.kind.daily") } : null);
  const others = daySessions.filter(session => session.kind !== "daily");

  // Archive: real activity days only, newest first, capped so the area stays scannable.
  const archive = useMemo(() => {
    if (!calendar) return [];
    const today = calendar.today;
    return [...byDate.entries()]
      .filter(([day]) => day <= today)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, ARCHIVE_DAYS)
      .map(([day, list]) => ({ day, sessions: list, isToday: day === today }));
  }, [byDate, calendar]);

  const rows = useMemo(() => buildFriendTaskRows(tasks, works), [tasks, works]);
  const activeRows = rows.executions.filter(row => row.execution && ["running", "queued"].includes(row.execution.status));
  const upcoming = [...rows.plan, ...rows.duty]
    .sort((a, b) => (a.timeAt ?? "").localeCompare(b.timeAt ?? ""))
    .slice(0, TASK_ROWS);
  const recentExecutions = rows.executions.slice(0, Math.max(0, TASK_ROWS - upcoming.length));

  const formatDay = (day: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: calendar?.timeZone }).format(new Date(`${day}T00:00:00Z`));
  const formatTime = (value: string | null) => value === null ? null : new Intl.DateTimeFormat(locale, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: calendar?.timeZone,
  }).format(new Date(value));
  const projectOf = (row: TaskPanelRow) => row.contextProjectId === null
    ? t("taskPanel.noProject")
    : projectNames.get(row.contextProjectId) ?? row.contextProjectId;

  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); if (mounted.current) setRefresh(value => value + 1); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const openSession = (id: string, day?: string | null) => act(async () => {
    setResolvedDate(day ?? selectedDate);
    await onOpenSession(id, agentId, day ?? selectedDate ?? undefined);
  });
  // Idempotent day entry: same path the calendar uses, no model run and no new schedule.
  const openDay = (day: string) => act(async () => {
    const started = await startProjectLongAgent({ longAgentId: agentId, projectId: agentId, date: day });
    setResolvedDate(day);
    await onOpenSession(started.primarySessionId, started.projectId, day);
  });

  return <section className={styles.panel} data-friend-panel={agentId} aria-label={t("friendInspector.heading")}>
    <header className={styles.panelHeader}>
      <div>
        <h2>{t("friendInspector.heading")}</h2>
        <p title={calendar?.timeZone}>
          {selectedDate === null ? t("common.loading") : formatDay(selectedDate, { month: "long", day: "numeric", weekday: "short" })}
          {isToday && ` · ${t("friendCalendar.today")}`}
        </p>
      </div>
      <Button iconOnly variant="ghost" type="button" onClick={onClose} aria-label={t("chat.close")}><IconX size={18} /></Button>
    </header>

    {pending && <div className={styles.pending} role="status" data-friend-work-pending>
      <p>{t("friendWork.unconfirmed")}</p>
      <Button type="button" data-friend-work-confirm disabled={busy}
        onClick={() => void act(async () => {
          await startFriendWork(agentId, pending);
          saveFriendWorkSubmission(agentId, null);
          if (mounted.current) setPending(null);
        })}>{t("friendWork.confirm")}</Button>
    </div>}

    {(error || dayError) && <div role="alert" className={styles.error}><p><InterfaceFeedback message={error || dayError} /></p>
      <Button type="button" onClick={() => setRefresh(value => value + 1)}>{t("friendWork.retry")}</Button></div>}

    <section className={styles.section} aria-labelledby="friend-panel-day">
      <h3 id="friend-panel-day">{t("friendInspector.dayHeading")}</h3>
      <div className={styles.rows} data-friend-day={selectedDate ?? undefined}>
        {dailySession && <button type="button" className={`${styles.row} ${styles.rowPrimary}`} disabled={busy || selectedDate === null}
          data-day-session={dailySession.sessionId}
          aria-current={dailySession.sessionId === sessionId ? "page" : undefined}
          onClick={() => void openSession(dailySession.sessionId)}>
          <span className={styles.rowText}>
            <strong>{isToday ? t("friendInspector.todayChat") : t("friendInspector.dayChat", { date: formatDay(selectedDate!) })}</strong>
            <small>{t("friendInspector.enterToday")}</small>
          </span>
          <IconChevronRight size={16} aria-hidden="true" />
        </button>}
        {others.map(session => <button type="button" key={session.sessionId} className={styles.row} disabled={busy}
          data-day-session={session.sessionId}
          aria-current={session.sessionId === sessionId ? "page" : undefined}
          onClick={() => void openSession(session.sessionId)}>
          <span className={styles.rowText}>
            <strong>{session.title || t("friendCalendar.untitled")}</strong>
            <small>{t(`friendCalendar.kind.${session.kind}`)}{session.createdAt ? ` · ${formatTime(session.createdAt)}` : ""}</small>
          </span>
          <IconChevronRight size={16} aria-hidden="true" />
        </button>)}
      </div>
    </section>

    <section className={styles.section} aria-labelledby="friend-panel-tasks">
      <h3 id="friend-panel-tasks">
        {t("friendInspector.tasksHeading")}
        {activeRows.length > 0 && <span className={styles.count} data-state="running">{t("friendInspector.runningCount", { count: activeRows.length })}</span>}
      </h3>
      {upcoming.length === 0 && recentExecutions.length === 0
        ? <p className={styles.empty}>{t("friendInspector.tasksEmpty")}</p>
        : <div className={styles.rows}>
          {upcoming.map(row => <div key={row.key} className={styles.taskRow}>
            <span className={styles.badge} data-kind={row.badge}>{t(`taskPanel.badge.${row.badge}`)}</span>
            <span className={styles.rowText}>
              <strong>{row.title}</strong>
              <small>{[t(row.statusKey), projectOf(row), row.timeAt === null ? t("taskPanel.unscheduled") : formatTime(row.timeAt)].filter(Boolean).join(" · ")}</small>
            </span>
          </div>)}
          {recentExecutions.map(row => <div key={row.key} className={styles.taskRow}>
            <span className={styles.badge} data-kind={row.badge}>{t(`taskPanel.badge.${row.badge}`)}</span>
            <span className={styles.rowText}>
              <strong>{row.title}</strong>
              <small>{[t(row.statusKey), projectOf(row), formatTime(row.timeAt)].filter(Boolean).join(" · ")}</small>
            </span>
          </div>)}
        </div>}
      <Button variant="secondary" type="button" data-friend-tasks-open={agentId} onClick={() => setTasksOpen(true)}>
        {t("friendInspector.openTasks")}
      </Button>
    </section>

    <section className={styles.section} aria-labelledby="friend-panel-archive">
      <h3 id="friend-panel-archive">{t("friendInspector.archiveHeading")}</h3>
      {archive.length === 0
        ? <p className={styles.empty}>{t("friendInspector.archiveEmpty")}</p>
        : <div className={styles.rows}>
          {archive.map(entry => <button type="button" key={entry.day} className={styles.row} disabled={busy}
            data-friend-archive-day={entry.day}
            aria-current={entry.day === selectedDate ? "page" : undefined}
            onClick={() => void openDay(entry.day)}>
            <span className={styles.rowText}>
              <strong>{formatDay(entry.day)}{entry.isToday && <em className={styles.today}>{t("friendCalendar.today")}</em>}</strong>
              <small>{t("friendInspector.archiveCount", { count: entry.sessions.length })}</small>
            </span>
            <IconChevronRight size={16} aria-hidden="true" />
          </button>)}
        </div>}
      <Button variant="secondary" type="button" data-friend-calendar-open={agentId} onClick={() => setCalendarOpen(true)}>
        {t("friendInspector.openCalendar")}
      </Button>
    </section>

    {calendarOpen && <FriendCalendar key={`${agentId}:${selectedDate ?? "today"}`} agentId={agentId} name={agentId}
      selectedSessionId={sessionId} selectedDate={selectedDate}
      onClose={() => setCalendarOpen(false)}
      onOpenSession={async (id, ownerProjectId, nextDate) => { await openSession(id, nextDate ?? selectedDate); setCalendarOpen(false); }} />}
    {tasksOpen && <LongAgentTasksPanel key={agentId} agentId={agentId} name={agentId}
      onClose={() => setTasksOpen(false)}
      onOpenSession={async (id, ownerProjectId, nextDate) => { await openSession(id, nextDate ?? selectedDate); setTasksOpen(false); }} />}
  </section>;
}
