import { InterfaceFeedback } from "./InterfaceFeedback";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronRight, IconPlus, IconX } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { fetchFriendDailyState, type FriendDailyState, type FriendCalendarSession } from "@/lib/friend-daily-browser";
import { fetchFriendWork, startFriendWork, type FriendWorkItem } from "@/lib/friend-work";
import { requestFriendTasks, buildFriendTaskRows, type FriendTasks, type TaskPanelRow } from "@/lib/friend-tasks";
import { readFriendWorkSubmission, saveFriendWorkSubmission, type FriendWorkSubmission } from "@/lib/friend-work-draft";
import { dateInTimeZone, sessionsByDate } from "@/lib/friend-calendar";
import { addArchivedDay, readArchivedDays, removeArchivedDay } from "@/lib/friend-archive-memory";
import { fetchChatProjects } from "@/lib/projects-contract";
import { startProjectLongAgent } from "@/lib/long-agents-browser";
import { Button } from "./ui/Button";
import { FriendCalendar } from "./FriendCalendar";
import { LongAgentTasksPanel } from "./LongAgentTasksPanel";
import styles from "./FriendInspector.module.css";

/**
 * "Tasks & archive" for one Friend (ui-ux §17.3).
 *
 * What the user needs here: what is happening for this Friend **today** —
 * its Sessions and its tasks, each labelled by category — and a way to look
 * at earlier days. So the area is a vertical column of day blocks:
 *
 *   today (always)  → sessions, then tasks grouped by category
 *   added days      → the same shape, for days the user picked on purpose
 *
 * Earlier days are browsed in the floating calendar and only enter this
 * column after the user picks them, so the area stays short and intentional.
 * Opening a Session still navigates the shared chat; the area never becomes
 * a second chat surface.
 */
export function FriendInspector({ agentId, sessionId, date, onOpenSession, onClose, active = true }: {
  agentId: string; sessionId: string | null; date: string | null;
  onOpenSession: (sessionId: string, projectId: string, date?: string) => void | Promise<void>;
  onClose: () => void;
  /** The shell stays mounted for the reveal animation; data loads only while visible. */
  active?: boolean;
}) {
  const { t, locale } = useI18n();
  const [calendar, setCalendar] = useState<FriendDailyState | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [works, setWorks] = useState<FriendWorkItem[]>([]);
  const [tasks, setTasks] = useState<FriendTasks | null>(null);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<FriendWorkSubmission | null>(() => readFriendWorkSubmission(agentId));
  const [addedDays, setAddedDays] = useState<string[]>(() => readArchivedDays(agentId));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setAddedDays(readArchivedDays(agentId)); }, [agentId]);
  // Pending work recovery is local state; it must not be fetched while hidden.

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setCalendar(null);
    setDayError(null);
    void (async () => {
      // The 60-day window resolves today; the annual read supplies the real
      // per-day Session projection used by the archive.
      const summary = await fetchFriendDailyState(agentId, controller.signal);
      const target = date ?? summary.days.find(day => day.sessionId === sessionId)?.date ?? summary.today;
      const annual = await fetchFriendDailyState(agentId, controller.signal, undefined, Number(target.slice(0, 4)));
      if (!controller.signal.aborted) setCalendar(annual);
    })().catch((cause: unknown) => {
      if (!controller.signal.aborted) setDayError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => controller.abort();
  }, [active, agentId, sessionId, date, refresh]);

  useEffect(() => {
    if (!active) return;
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
  }, [active, agentId, refresh]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void fetchChatProjects(controller.signal)
      .then(projects => { if (!controller.signal.aborted) setProjectNames(new Map(projects.map(project => [project.projectId, project.cachedName]))); })
      .catch(() => { if (!controller.signal.aborted) setProjectNames(new Map()); });
    return () => controller.abort();
  }, [active, agentId]);

  const timeZone = calendar?.timeZone;
  const today = calendar?.today ?? null;
  const sessions = calendar?.sessions ?? [];
  const byDate = useMemo(() => sessionsByDate(sessions), [sessions]);
  const rows = useMemo(() => buildFriendTaskRows(tasks, works), [tasks, works]);

  // A day the user picked stays in the area even when it turns out empty —
  // silently dropping it would look like the pick failed. Today is always first.
  const days = useMemo(() => {
    const older = addedDays.filter(day => day !== today);
    return today === null ? older : [today, ...older];
  }, [addedDays, today]);

  function inDay(timestamp: string | null, day: string, tz: string | undefined): boolean {
    return timestamp !== null && tz !== undefined && dateInTimeZone(timestamp, tz) === day;
  }

  const dayContent = (day: string) => {
    const daySessions = (byDate.get(day) ?? []).filter((session: FriendCalendarSession) => session.kind !== "work");
    const planned = [...rows.plan, ...rows.duty].filter(row => inDay(row.timeAt, day, timeZone));
    const executed = rows.executions.filter(row => inDay(row.sortAt, day, timeZone));
    return { daySessions, planned, executed };
  };

  const formatDay = (day: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "long", day: "numeric" }) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(new Date(`${day}T00:00:00Z`));
  const formatTime = (value: string | null) => value === null ? null : new Intl.DateTimeFormat(locale, {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone,
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
  const openSession = (id: string, day: string) => act(async () => { await onOpenSession(id, agentId, day); });
  // Idempotent day entry, same path the calendar uses: no model run, no schedule.
  const openDay = (day: string) => act(async () => {
    const started = await startProjectLongAgent({ longAgentId: agentId, projectId: agentId, date: day });
    await onOpenSession(started.primarySessionId, started.projectId, day);
  });
  const addDay = useCallback((day: string) => {
    setPickerOpen(false);
    setAddedDays(addArchivedDay(agentId, day, today));
  }, [agentId, today]);
  const dropDay = (day: string) => setAddedDays(removeArchivedDay(agentId, day));

  const taskRow = (row: TaskPanelRow, day: string) => {
    const meta = [t(row.statusKey), projectOf(row), row.badge === "task" || row.badge === "duty"
      ? (row.timeAt === null ? t("taskPanel.unscheduled") : formatTime(row.timeAt))
      : formatTime(row.timeAt)].filter(Boolean).join(" · ");
    const body = <>
      <span className={styles.badge} data-kind={row.badge}>{t(`taskPanel.badge.${row.badge}`)}</span>
      <span className={styles.rowText}><strong>{row.title}</strong><small>{meta}</small></span>
    </>;
    // Only an execution has a readable Session; a plan has nothing to open here.
    return row.sessionId === null
      ? <div key={row.key} className={styles.taskRow}>{body}</div>
      : <button type="button" key={row.key} className={`${styles.taskRow} ${styles.taskRowOpen}`} disabled={busy}
          data-task-row-open={row.key}
          onClick={() => void openSession(row.sessionId!, day)}>
          {body}<IconChevronRight size={16} aria-hidden="true" />
        </button>;
  };

  return <section className={styles.panel} data-friend-panel={agentId} aria-label={t("friendInspector.heading")}>
    <header className={styles.panelHeader}>
      {/* Purpose, not identity: the rail already shows who this Friend is. */}
      <h2 title={timeZone ?? undefined}>{t("friendInspector.heading")}</h2>
      <Button iconOnly variant="ghost" type="button" className={styles.headerAction} onClick={onClose}
        aria-label={t("chat.close")}><IconX size={18} /></Button>
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

    {days.map((day, index) => {
      const isToday = day === today;
      const firstAdded = index === 1;
      const { daySessions, planned, executed } = dayContent(day);
      const activeCount = executed.filter(row => row.execution && ["running", "queued"].includes(row.execution.status)).length;
      return <Fragment key={day}>
      {firstAdded && <h3 className={styles.sectionLabel}>{t("friendInspector.addedDaysHeading")}</h3>}
      <section className={styles.dayBlock} data-friend-day={day}>
        <header className={styles.dayHeader}>
          <h3>{isToday ? t("friendInspector.todayHeading") : formatDay(day)}{isToday && <em>{formatDay(day)}</em>}</h3>
          <div className={styles.dayMeta}>
            <span>{t("friendInspector.dayCounts", { sessions: daySessions.length, tasks: planned.length + executed.length })}</span>
            {!isToday && <Button iconOnly variant="ghost" type="button" data-friend-day-remove={day}
              aria-label={t("friendInspector.removeDay")} onClick={() => dropDay(day)}><IconX size={16} /></Button>}
          </div>
        </header>

        <div className={styles.group}>
          <span className={styles.groupLabel}>{t("friendInspector.sessionsLabel")}</span>
          <div className={styles.rows}>
            {/* The day's sessions read like the project session list: name + kind + time. */}
            {daySessions.map(session => <button type="button" key={session.sessionId} className={styles.row} disabled={busy}
              data-day-session={session.sessionId}
              aria-current={session.sessionId === sessionId ? "page" : undefined}
              onClick={() => void openSession(session.sessionId, day)}>
              <span className={styles.rowText}>
                <strong>{session.kind === "daily" ? (isToday ? t("friendInspector.todayChat") : t("friendInspector.dayChatLabel")) : session.title || t("friendCalendar.untitled")}</strong>
                <small>{[t(`friendCalendar.kind.${session.kind}`), formatTime(session.createdAt ?? null)].filter(Boolean).join(" · ")}</small>
              </span>
              <IconChevronRight size={16} aria-hidden="true" />
            </button>)}
            {daySessions.length === 0 && <button type="button" className={styles.row} disabled={busy}
              data-friend-enter-day={day}
              onClick={() => void openDay(day)}>
              <span className={styles.rowText}>
                <strong>{t("friendInspector.enterDay")}</strong>
                <small>{t("friendInspector.noSessions")}</small>
              </span>
              <IconChevronRight size={16} aria-hidden="true" />
            </button>}
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>
            {t("friendInspector.tasksLabel")}
            {activeCount > 0 && <span className={styles.count} data-state="running">{t("friendInspector.runningCount", { count: activeCount })}</span>}
          </span>
          <div className={styles.rows}>
            {planned.length === 0 && executed.length === 0 && <p className={styles.empty}>{t("friendInspector.noTasks")}</p>}
            {planned.map(row => taskRow(row, day))}
            {executed.map(row => taskRow(row, day))}
          </div>
        </div>
      </section>
      </Fragment>;
    })}

    <div className={styles.panelActions}>
      <Button variant="secondary" type="button" data-friend-add-day disabled={busy || calendar === null}
        onClick={() => setPickerOpen(true)}><IconPlus size={16} aria-hidden="true" />{t("friendInspector.addDay")}</Button>
      <Button variant="secondary" type="button" data-friend-tasks-open={agentId} onClick={() => setTasksOpen(true)}>
        {t("friendInspector.openTasks")}
      </Button>
    </div>

    {pickerOpen && <FriendCalendar key={`pick:${agentId}`} agentId={agentId} name={agentId}
      selectedSessionId={sessionId} selectedDate={today}
      onPickDate={addDay} onClose={() => setPickerOpen(false)} onOpenSession={() => undefined} />}
    {tasksOpen && <LongAgentTasksPanel key={agentId} agentId={agentId} name={agentId}
      onClose={() => setTasksOpen(false)}
      onOpenSession={async (id, ownerProjectId, nextDate) => { await onOpenSession(id, ownerProjectId, nextDate); setTasksOpen(false); }} />}
  </section>;
}
