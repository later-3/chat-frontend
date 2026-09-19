"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArchive, IconRefresh, IconRestore, IconTrash, IconX } from "@tabler/icons-react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useI18n } from "@/hooks/useI18n";
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
  const { t } = useI18n();
  const availableProjects = useMemo(() => projects.filter((project) => project.available), [projects]);
  const [projectId, setProjectId] = useState(() => (
    availableProjects.some((project) => project.projectId === initialProjectId)
      ? initialProjectId as string
      : availableProjects[0]?.projectId ?? ""
  ));
  const [sessions, setSessions] = useState<readonly RemovedSessionInfo[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [retentionInput, setRetentionInput] = useState("30");
  const modalRef = useDialogFocus(onClose);
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

  return (
    <div
      ref={modalRef} tabIndex={-1} className="configuration-dialog removed-sessions-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t("removedSessions.title")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 4000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.48)",
      }}
      onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}
    >
      <div style={{
        width: "min(720px, 100%)",
        maxHeight: "min(760px, calc(100dvh - 32px))",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--bg)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <IconArchive size={20} stroke={1.7} color="var(--accent)" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 650 }}>{t("removedSessions.title")}</div>
            <div style={{ marginTop: 2, color: "var(--text-dim)", fontSize: 12 }}>{t("removedSessions.description")}</div>
          </div>
          <button type="button" onClick={() => void load()} title={t("sidebar.refresh")} style={{ width: 32, height: 32, padding: 0, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg-hover)", color: "var(--text-muted)" }}>
            <IconRefresh size={15} stroke={1.8} aria-hidden="true" />
          </button>
          <button type="button" onClick={onClose} aria-label={t("removedSessions.close")} style={{ width: 32, height: 32, padding: 0, display: "grid", placeItems: "center", border: "none", borderRadius: 7, background: "transparent", color: "var(--text-muted)" }}>
            <IconX size={19} stroke={1.8} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, padding: 14, borderBottom: "1px solid var(--border)", background: "var(--bg-hover)" }}>
          <label style={{ display: "grid", gap: 5, color: "var(--text-dim)", fontSize: 12 }}>
            {t("removedSessions.project")}
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={{ height: 34, minWidth: 0, padding: "0 9px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg)", color: "var(--text)", fontSize: 12 }}>
              {availableProjects.map((project) => (
                <option key={project.projectId} value={project.projectId}>{project.cachedName}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5, color: "var(--text-dim)", fontSize: 12 }}>
            {t("removedSessions.retention")}
            <span style={{ display: "flex", gap: 6 }}>
              <input type="number" min={1} max={3650} value={retentionInput} onChange={(event) => setRetentionInput(event.target.value)} style={{ width: 82, height: 34, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg)", color: "var(--text)" }} />
              <button type="button" disabled={savingRetention || retentionInput === String(retentionDays)} onClick={() => void saveRetention()} style={{ minWidth: 68, height: 34, border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg)", color: "var(--text-muted)", opacity: savingRetention || retentionInput === String(retentionDays) ? 0.55 : 1 }}>
                {savingRetention ? t("removedSessions.saving") : t("removedSessions.save")}
              </button>
            </span>
          </label>
        </div>

        {error && <div role="alert" style={{ margin: "12px 14px 0", padding: "9px 11px", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 7, background: "rgba(239,68,68,0.07)", color: "var(--danger)", fontSize: 12 }}>{error}</div>}

        <div style={{ flex: 1, minHeight: 160, overflowY: "auto", padding: 14 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>{t("sidebar.loading")}</div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>{t("removedSessions.empty")}</div>
          ) : sessions.map((session) => {
            const busy = busySessionId === session.id;
            return (
              <div key={session.id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 66, padding: "9px 10px", borderBottom: "1px solid var(--border)", opacity: busy ? 0.55 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div title={sessionTitle(session)} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)", fontSize: 12, fontWeight: 550 }}>{sessionTitle(session)}</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4, color: "var(--text-dim)", fontSize: 12 }}>
                    <span>{t("sidebar.messagesCount", { count: session.messageCount })}</span>
                    <span>{t("removedSessions.removedAt", { time: new Date(session.removedAt).toLocaleString() })}</span>
                    <span>{t("removedSessions.purgeAt", { time: new Date(session.purgeAt).toLocaleString() })}</span>
                  </div>
                </div>
                {confirmPurgeId === session.id ? (
                  <div style={{ display: "flex", gap: 5 }}>
                    <button type="button" disabled={busy} onClick={() => void purge(session.id)} style={{ height: 30, padding: "0 9px", border: "none", borderRadius: 6, background: "var(--danger)", color: "var(--on-accent)", fontSize: 12 }}>{t("removedSessions.confirmPurge")}</button>
                    <button type="button" onClick={() => setConfirmPurgeId(null)} style={{ height: 30, padding: "0 9px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text-muted)", fontSize: 12 }}>{t("sidebar.cancel")}</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 5 }}>
                    <button type="button" disabled={busy} onClick={() => void restore(session.id)} title={t("removedSessions.restore")} style={{ width: 32, height: 32, padding: 0, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg-hover)", color: "var(--accent)" }}>
                      <IconRestore size={16} stroke={1.8} aria-hidden="true" />
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirmPurgeId(session.id)} title={t("removedSessions.purge")} style={{ width: 32, height: 32, padding: 0, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg-hover)", color: "var(--danger)" }}>
                      <IconTrash size={16} stroke={1.8} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
