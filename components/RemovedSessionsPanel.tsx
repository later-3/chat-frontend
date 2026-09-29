"use client";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconRefresh, IconRestore, IconTrash } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { SurfaceDialog } from "./SurfaceDialog";
import { Button } from "./ui/Button";
import type { ChatProjectSummary } from "@/lib/projects-contract";
import {
  fetchRemovedSessions,
  purgeRemovedSession,
  restoreRemovedSession,
  updateRemovedSessionRetention,
  type RemovedSessionInfo,
} from "@/lib/session-removal-browser";

function sessionTitle(session: RemovedSessionInfo): string {
  return session.name || session.firstMessage.slice(0, 80) || session.id.slice(0, 12);
}

export function RemovedSessionsPanel({
  projects,
  initialProjectId,
  onClose,
  onChanged,
}: {
  readonly projects: readonly ChatProjectSummary[];
  readonly initialProjectId?: string;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const availableProjects = useMemo(() => projects.filter((project) => project.available), [projects]);
  const [projectId, setProjectId] = useState(() => (
    availableProjects.some((project) => project.projectId === initialProjectId)
      ? initialProjectId as string
      : availableProjects[0]?.projectId ?? ""
  ));
  const [sessions, setSessions] = useState<readonly RemovedSessionInfo[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [retentionInput, setRetentionInput] = useState("30");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [savingRetention, setSavingRetention] = useState(false);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);

  useEffect(() => {
    setProjectId((current) => {
      if (availableProjects.some((project) => project.projectId === current)) return current;
      if (availableProjects.some((project) => project.projectId === initialProjectId)) {
        return initialProjectId as string;
      }
      return availableProjects[0]?.projectId ?? "";
    });
  }, [availableProjects, initialProjectId]);

  const load = useCallback(async () => {
    if (!projectId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const page = await fetchRemovedSessions(projectId);
      setSessions(page.sessions);
      setRetentionDays(page.retentionDays);
      setRetentionInput(String(page.retentionDays));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const restore = useCallback(async (sessionId: string) => {
    setBusySessionId(sessionId);
    try {
      await restoreRemovedSession(projectId, sessionId);
      await load();
      onChanged();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : String(restoreError));
    } finally {
      setBusySessionId(null);
    }
  }, [load, onChanged, projectId]);

  const purge = useCallback(async (sessionId: string) => {
    setBusySessionId(sessionId);
    try {
      await purgeRemovedSession(projectId, sessionId);
      setConfirmPurgeId(null);
      await load();
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : String(purgeError));
    } finally {
      setBusySessionId(null);
    }
  }, [load, projectId]);

  const saveRetention = useCallback(async () => {
    const days = Number(retentionInput);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setError(t("removedSessions.invalidRetention"));
      return;
    }
    setSavingRetention(true);
    try {
      const saved = await updateRemovedSessionRetention(projectId, days);
      setRetentionDays(saved);
      setRetentionInput(String(saved));
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingRetention(false);
    }
  }, [projectId, retentionInput, t]);

  return <SurfaceDialog
    title={t("removedSessions.title")}
    description={t("removedSessions.description")}
    onClose={onClose}
    actions={<Button iconOnly variant="ghost" type="button" aria-label={t("sidebar.refresh")} title={t("sidebar.refresh")} onClick={() => void load()}><IconRefresh size={17} stroke={1.8} aria-hidden="true" /></Button>}
  >
    <div className="ui-scroll-20 ui-stack-16 removed-sessions-dialog">
      <div className="ui-card">
        <div className="ui-row-6" style={{ flexWrap: "wrap" }}>
          <label className="ui-stack-4" style={{ flex: "1 1 210px", color: "var(--text-dim)", fontSize: 12 }}>
            {t("removedSessions.project")}
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {availableProjects.map((project) => (
                <option key={project.projectId} value={project.projectId}>{project.cachedName}</option>
              ))}
            </select>
          </label>
          <label className="ui-stack-4" style={{ flex: "1 1 210px", color: "var(--text-dim)", fontSize: 12 }}>
            {t("removedSessions.retention")}
            <span className="ui-row-6">
              <input type="number" min={1} max={3650} value={retentionInput} style={{ width: 82 }}
                onChange={(event) => setRetentionInput(event.target.value)} />
              <Button variant="secondary" type="button" disabled={savingRetention || retentionInput === String(retentionDays)} onClick={() => void saveRetention()}>
                {savingRetention ? t("removedSessions.saving") : t("removedSessions.save")}
              </Button>
            </span>
          </label>
        </div>
      </div>

      {error !== null && <div className="surface-notice surface-error" role="alert"><InterfaceFeedback message={error} /></div>}

      <div className="ui-stack-4">
        {loading ? (
          <p className="ui-list-note" role="status">{t("sidebar.loading")}</p>
        ) : sessions.length === 0 ? (
          <p className="ui-list-note">{t("removedSessions.empty")}</p>
        ) : sessions.map((session) => {
          const busy = busySessionId === session.id;
          return (
            <div key={session.id} className="ui-card" style={{ opacity: busy ? 0.55 : 1 }}>
              <div className="ui-row-between">
                <div className="ui-grow">
                  <div className="ui-label-truncate" title={sessionTitle(session)} style={{ fontSize: 13 }}>{sessionTitle(session)}</div>
                  <div className="ui-row-6" style={{ flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                    <span className="ui-dim-12">{t("sidebar.messagesCount", { count: session.messageCount })}</span>
                    <span className="ui-dim-12">{t("removedSessions.removedAt", { time: new Date(session.removedAt).toLocaleString(locale) })}</span>
                    <span className="ui-dim-12">{t("removedSessions.purgeAt", { time: new Date(session.purgeAt).toLocaleString(locale) })}</span>
                  </div>
                </div>
                {confirmPurgeId === session.id ? (
                  <div className="ui-row-6">
                    <Button variant="primary" type="button" disabled={busy} onClick={() => void purge(session.id)}>{t("removedSessions.confirmPurge")}</Button>
                    <Button variant="secondary" type="button" onClick={() => setConfirmPurgeId(null)}>{t("sidebar.cancel")}</Button>
                  </div>
                ) : (
                  <div className="ui-row-6">
                    <Button iconOnly variant="ghost" type="button" disabled={busy} title={t("removedSessions.restore")} aria-label={t("removedSessions.restore")} onClick={() => void restore(session.id)}>
                      <IconRestore size={17} stroke={1.8} aria-hidden="true" />
                    </Button>
                    <Button iconOnly variant="ghost" type="button" disabled={busy} title={t("removedSessions.purge")} aria-label={t("removedSessions.purge")} onClick={() => setConfirmPurgeId(session.id)}>
                      <IconTrash size={17} stroke={1.8} aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </SurfaceDialog>;
}
