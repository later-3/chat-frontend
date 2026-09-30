import { useEffect, useState } from "react";
import { IconFileText, IconChevronRight } from "@tabler/icons-react";
import { fetchFriendDayArchive, type FriendDayArchive } from "@/lib/friend-day-archive";
import { useI18n } from "@/hooks/useI18n";
import { SurfaceDialog } from "./SurfaceDialog";
import { MarkdownBody } from "./MarkdownBody";
import { InterfaceFeedback } from "./InterfaceFeedback";
import { Button } from "./ui/Button";
import styles from "./FriendInspector.module.css";

export function FriendDaySummary({ agentId, date, refresh, active, onOpenSession }: {
  agentId: string; date: string; refresh: number; active: boolean;
  onOpenSession: (sessionId: string, projectId: string, date?: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [archive, setArchive] = useState<FriendDayArchive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    setError(null);
    void fetchFriendDayArchive(agentId, date, abort.signal).then(value => { if (!abort.signal.aborted) setArchive(value); })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => abort.abort();
  }, [active, agentId, date, refresh, retry]);
  const summary = archive?.summary;
  const occurrence = archive?.occurrences.findLast(item => item.summaryDate === date);
  const execution = archive?.works.find(work => work.workId === occurrence?.workId);
  const status = summary ? t("friendArchive.saved") : execution?.status === "completed" ? t("friendArchive.missingFile")
    : execution?.status === "running" || execution?.status === "queued" ? t("friendArchive.running")
    : execution && ["failed", "interrupted", "cancelled"].includes(execution.status) ? t("friendArchive.failed")
    : occurrence?.state === "blocked" || occurrence?.state === "skipped" ? occurrence.reason : t("friendArchive.pending");
  return <div className={styles.group} data-day-archive={date}>
    <span className={styles.groupLabel}>{t("friendArchive.heading")}</span>
    {error ? <div role="alert"><InterfaceFeedback message={error} /><Button variant="ghost" onClick={() => setRetry(value => value + 1)}>{t("friendWork.retry")}</Button></div>
      : <div className={styles.rows}><button type="button" className={styles.row} disabled={!archive} onClick={() => setOpen(true)}>
        <IconFileText size={18} aria-hidden="true" /><span className={styles.rowText}><strong>{t("friendArchive.summary")}</strong>
          <small>{archive ? status : t("friendArchive.loading")}</small></span><IconChevronRight size={16} aria-hidden="true" />
      </button></div>}
    {open && archive && <SurfaceDialog title={`${date} · ${t("friendArchive.heading")}`} onClose={() => setOpen(false)} description={archive.timeZone}>
      <div className={styles.archiveBody}>
        {summary ? <><p className={styles.archiveFileName}>{summary.fileName}</p><MarkdownBody>{summary.markdown}</MarkdownBody></>
          : <p role="status">{status}</p>}
        <h2>{t("friendArchive.sources")}</h2>
        {archive.sessions.filter(session => session.kind !== "work").map(session => <button className={styles.row} key={`${session.projectId}:${session.sessionId}`} type="button"
          onClick={() => { void Promise.resolve(onOpenSession(session.sessionId, session.projectId, date)).then(() => setOpen(false)).catch(cause => setError(String(cause))); }}>
          <span className={styles.rowText}><strong>{session.title || t("friendCalendar.untitled")}</strong></span><IconChevronRight size={16} /></button>)}
        {archive.works.filter(work => !archive.occurrences.some(item => item.workId === work.workId)).map(work => <div key={work.workId} className={styles.row}>
          <span className={styles.rowText}><strong>{work.title}</strong><small>{work.error ?? t(`friendWork.status.${work.status}`)}</small></span>
        </div>)}
        {archive.occurrences.map(item => <div key={item.occurrenceId} className={styles.row}>
          <span className={styles.rowText}><strong>{item.title}</strong><small>{item.reason ?? (archive.works.find(work => work.workId === item.workId)?.status ? t(`friendWork.status.${archive.works.find(work => work.workId === item.workId)!.status}`) : t(`friendArchive.${item.state}`))}</small></span>
        </div>)}
        {archive.sessions.length === 0 && archive.occurrences.length === 0 && archive.works.length === 0 && <p>{t("friendArchive.noSources")}</p>}
      </div>
    </SurfaceDialog>}
  </div>;
}
