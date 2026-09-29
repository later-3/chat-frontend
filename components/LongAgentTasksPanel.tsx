import { InterfaceFeedback } from "./InterfaceFeedback";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { requestFriendTasks, buildFriendTaskRows, type FriendTasks, type TaskPanelRow } from "@/lib/friend-tasks";
import { fetchFriendWork, type FriendWorkItem } from "@/lib/friend-work";
import { cancelFriendExecution } from "@/lib/friend-execution";
import { fetchChatProjects } from "@/lib/projects-contract";
import { TaskRunDetails } from "./TaskRunDetails";
import { SurfaceDialog } from "./SurfaceDialog";
import styles from "./LongAgentTasksPanel.module.css";

/** One overlay lists every task category of a Long Agent: scheduled tasks, duties and background executions. */
export function LongAgentTasksPanel({ agentId, name, onOpenSession, onClose }: {
  agentId: string;
  name: string;
  onOpenSession: (sessionId: string, projectId: string, date?: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<FriendTasks | null>(null);
  const [works, setWorks] = useState<FriendWorkItem[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    const load = async () => {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        const [nextTasks, nextWorks] = await Promise.all([
          requestFriendTasks(agentId, undefined, controller.signal),
          fetchFriendWork(agentId, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setData(nextTasks);
        setWorks(nextWorks);
        setLoaded(true);
        setError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        fetching = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [agentId, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    // Read-only panel: project display names resolve once per open; unknown ids fall back to the raw id.
    void fetchChatProjects(controller.signal).then(list => {
      if (controller.signal.aborted) return;
      setProjectNames(new Map(list.map(project => [project.projectId, project.cachedName])));
    }).catch(() => setProjectNames(new Map()));
    return () => controller.abort();
  }, [agentId]);

  const timeFormat = (timestamp: string) => new Intl.DateTimeFormat(locale, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(timestamp));
  const projectLabel = (contextProjectId: string | null) => contextProjectId === null
    ? t("taskPanel.noProject")
    : projectNames.get(contextProjectId) ?? contextProjectId;

  const { plan: taskRows, duty: dutyRows, executions: executionRows } = buildFriendTaskRows(data, works);

  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      setRefresh(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const stateOf = (statusKey: string) => statusKey.endsWith(".running") ? "running"
    : [".failed", ".blocked", ".cancelled"].some(suffix => statusKey.endsWith(suffix)) ? "alert" : undefined;
  const row = (item: TaskPanelRow) => {
    const project = projectLabel(item.contextProjectId);
    const time = item.badge === "task" || item.badge === "duty"
      ? item.timeAt === null ? t("taskPanel.unscheduled") : t("taskPanel.nextRun", { time: timeFormat(item.timeAt) })
      : timeFormat(item.timeAt!);
    return <li key={item.key} className={styles.row} data-task-row={item.key}>
      <span className={styles.badge} data-task-badge={item.badge}>{t(`taskPanel.badge.${item.badge}`)}</span>
      <span className={styles.title} title={item.title}>{item.title}</span>
      <span className={styles.status} data-state={stateOf(item.statusKey)}>{t(item.statusKey)}</span>
      <span className={styles.project} title={project}>{project}</span>
      <span className={styles.time}>{time}</span>
      {(item.sessionId !== null || item.execution?.capabilities.cancel) && <span className={styles.actions}>
        {item.sessionId && <button type="button" data-task-open={item.key} disabled={busy}
          onClick={() => void onOpenSession(item.sessionId!, agentId)}>{t("taskPanel.open")}</button>}
        {item.execution?.capabilities.cancel && <button type="button" data-task-stop={item.key} disabled={busy}
          aria-label={t("friendWork.stop", { title: item.title })} title={t("friendWork.stop", { title: item.title })}
          onClick={() => void act(() => cancelFriendExecution(item.execution!))}>{t("taskPanel.stop")}</button>}
        {item.workId && item.sessionId && <button type="button" data-task-details={item.key} disabled={busy}
          aria-expanded={detailsKey === item.key}
          onClick={() => setDetailsKey(current => current === item.key ? null : item.key)}>{t("taskPanel.details")}</button>}
      </span>}
      {item.reason && <span className={styles.reason}>{t("taskPanel.reason", { reason: item.reason })}</span>}
      {detailsKey === item.key && item.workId && item.sessionId
        && <div className={styles.details}><TaskRunDetails agentId={agentId} workId={item.workId} sessionId={item.sessionId} /></div>}
    </li>;
  };

  const groups: { title: string; note?: string; rows: TaskPanelRow[] }[] = [
    { title: t("taskPanel.tasks"), rows: taskRows },
    { title: t("taskPanel.duties"), note: t("taskPanel.dutyNote"), rows: dutyRows },
    { title: t("taskPanel.works"), rows: executionRows },
  ];
  return createPortal(<SurfaceDialog title={t("taskPanel.title", { name })} description={t("taskPanel.hint")} onClose={onClose}>
    <div className={styles.body} data-long-agent-tasks={agentId} aria-busy={busy}>
      {error && <p role="alert" className={styles.error}><InterfaceFeedback message={error} /></p>}
      {!loaded && !error && <p role="status">{t("common.loading")}</p>}
      {loaded && taskRows.length === 0 && dutyRows.length === 0 && executionRows.length === 0
        && <p className={styles.empty}>{t("taskPanel.empty")}</p>}
      {groups.filter(group => group.rows.length > 0).map(group => <section key={group.title} className={styles.group}>
        <h2>{group.title}</h2>
        {group.note && <p className={styles.groupNote}>{group.note}</p>}
        <ul className={styles.rows}>{group.rows.map(row)}</ul>
      </section>)}
    </div>
  </SurfaceDialog>, document.body);
}
