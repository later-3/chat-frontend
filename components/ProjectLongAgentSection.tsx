"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconMessageCircle, IconRefresh, IconSettings } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import {
  fetchLongAgents,
  startProjectLongAgent,
  type LongAgentSummary,
} from "@/lib/long-agents-browser";
import styles from "./ProjectLongAgentSection.module.css";
import { LongAgentSettingsPanel } from "./LongAgentSettingsPanel";

interface Props {
  projectId: string | null;
  selectedSessionId: string | null;
  visible?: boolean;
  refreshKey?: number;
  onOpenSession: (sessionId: string) => void | Promise<void>;
  onRequestClose?: () => void;
  closeAfterOpen?: boolean;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return Array.from(words[0] ?? "A").slice(0, 2).join("").toUpperCase();
}

export function ProjectLongAgentSection({
  projectId,
  selectedSessionId,
  visible = true,
  refreshKey,
  onOpenSession,
  onRequestClose,
  closeAfterOpen = false,
}: Props) {
  const { t } = useI18n();
  const [agents, setAgents] = useState<readonly LongAgentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingAgentId, setOpeningAgentId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setAgents([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetchLongAgents(projectId, signal);
      setAgents(response.agents);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setAgents([]);
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  const channelHostAvailable = useMemo(
    () => agents.length > 0 && agents.every((agent) => agent.channelHostAvailable),
    [agents],
  );

  const handleOpen = useCallback(async (agent: LongAgentSummary) => {
    if (!projectId || openingAgentId !== null || !agent.available) return;
    setOpeningAgentId(agent.id);
    setError(null);
    try {
      const started = await startProjectLongAgent({ longAgentId: agent.id, projectId });
      setAgents((current) => current.map((item) => item.id === agent.id
        ? {
            ...item,
            project: {
              started: true,
              status: started.status,
              projectLongAgentId: started.projectLongAgentId,
              primarySessionId: started.primarySessionId,
            },
          }
        : item));
      await onOpenSession(started.primarySessionId);
      if (closeAfterOpen) onRequestClose?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpeningAgentId(null);
    }
  }, [closeAfterOpen, onOpenSession, onRequestClose, openingAgentId, projectId]);

  if (!projectId || !visible) return null;

  return (
    <>
    <section
      id="sidebar-long-agents-panel"
      className={styles.section}
      role="tabpanel"
      aria-labelledby="sidebar-long-agents-tab"
    >
      <div className={styles.header}>
        <h2 id="project-long-agent-heading">{t("sidebar.longAgentCoworkers")}</h2>
        <div className={styles.headerActions}>
        {!loading && agents.length > 0 && (
          <span
            className={channelHostAvailable ? styles.hostOnline : styles.hostOffline}
            title={channelHostAvailable
              ? t("sidebar.longAgentImOnlineTitle")
              : t("sidebar.longAgentImOfflineTitle")}
          >
            <span aria-hidden="true" />
            {channelHostAvailable ? t("sidebar.longAgentImOnline") : t("sidebar.longAgentImOffline")}
          </span>
        )}
        <button
          type="button"
          className={styles.settingsButton}
          onClick={() => setSettingsOpen(true)}
          disabled={agents.length === 0}
          title={t("longAgentSettings.open")}
          aria-label={t("longAgentSettings.open")}
        >
          <IconSettings size={14} stroke={1.8} aria-hidden="true" />
        </button>
        </div>
      </div>

      {loading && agents.length === 0 ? (
        <div className={styles.loading} role="status">{t("sidebar.longAgentLoading")}</div>
      ) : error && agents.length === 0 ? (
        <div className={styles.error} role="alert">
          <span>{t("sidebar.longAgentLoadFailed")}</span>
          <button type="button" onClick={() => void load()} aria-label={t("sidebar.longAgentRetry")}>
            <IconRefresh size={14} stroke={1.8} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <nav aria-label={t("sidebar.longAgentCoworkers")}>
          <ul className={styles.grid}>
            {agents.map((agent) => {
              const primarySessionId = agent.project?.primarySessionId ?? null;
              const selected = primarySessionId !== null && primarySessionId === selectedSessionId;
              const opening = openingAgentId === agent.id;
              const started = agent.project?.started === true;
              const action = selected
                ? t("sidebar.longAgentCurrent")
                : started
                  ? t("sidebar.longAgentDedicatedSession")
                  : t("sidebar.longAgentStartChat");
              return (
                <li key={agent.id}>
                  <button
                    type="button"
                    className={`${styles.agentButton}${selected ? ` ${styles.selected}` : ""}`}
                    onClick={() => void handleOpen(agent)}
                    disabled={openingAgentId !== null || !agent.available}
                    aria-current={selected ? "page" : undefined}
                    aria-label={t("sidebar.longAgentChatWith", { name: agent.name })}
                    title={`${agent.name} · ${agent.description}`}
                  >
                    <span className={styles.avatar} aria-hidden="true">{initials(agent.name)}</span>
                    <span className={styles.agentText}>
                      <strong>{agent.name}</strong>
                      <span>{opening ? t("sidebar.longAgentOpening") : action}</span>
                    </span>
                    <IconMessageCircle className={styles.chatIcon} size={15} stroke={1.7} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {error && agents.length > 0 && <p className={styles.inlineError} role="status">{error}</p>}
    </section>
    {settingsOpen && agents.length > 0 && (
      <LongAgentSettingsPanel
        agents={agents}
        initialAgentId={agents.find((agent) => agent.project?.primarySessionId === selectedSessionId)?.id}
        onBack={() => setSettingsOpen(false)}
        onSaved={() => void load()}
      />
    )}
    </>
  );
}
