"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconRefresh, IconSettings } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import {
  createChatLongAgent,
  fetchLongAgents,
  startProjectLongAgent,
  type LongAgentSummary,
} from "@/lib/long-agents-browser";
import styles from "./ProjectLongAgentSection.module.css";
import { LongAgentAvatarView } from "./LongAgentAvatar";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({ id: "", name: "", description: "", nanoclawAgentGroupId: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);


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

  const submitCreate = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      await createChatLongAgent({
        id: createDraft.id.trim(),
        name: createDraft.name.trim(),
        description: createDraft.description.trim(),
        instanceId: "local",
        nanoclawAgentGroupId: createDraft.nanoclawAgentGroupId.trim(),
      });
      setCreateOpen(false);
      setCreateDraft({ id: "", name: "", description: "", nanoclawAgentGroupId: "" });
      await load();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  }, [createDraft, load]);

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
          onClick={() => setCreateOpen((open) => !open)}
          title={t("longAgent.create")}
          aria-label={t("longAgent.create")}
        >
          <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>＋</span>
        </button>
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

      {createOpen && (
        <div className={styles.createForm}>
          <p className={styles.createHelp}>{t("longAgent.createHint")}</p>
          <input
            value={createDraft.id}
            placeholder={t("longAgent.createId")}
            onChange={(event) => setCreateDraft((draft) => ({ ...draft, id: event.target.value }))}
          />
          <input
            value={createDraft.name}
            placeholder={t("longAgent.createName")}
            onChange={(event) => setCreateDraft((draft) => ({ ...draft, name: event.target.value }))}
          />
          <input
            value={createDraft.description}
            placeholder={t("longAgent.createDescription")}
            onChange={(event) => setCreateDraft((draft) => ({ ...draft, description: event.target.value }))}
          />
          <input
            value={createDraft.nanoclawAgentGroupId}
            placeholder={t("longAgent.createGroupId")}
            onChange={(event) => setCreateDraft((draft) => ({ ...draft, nanoclawAgentGroupId: event.target.value }))}
          />
          {createError && <p className={styles.inlineError} role="alert">{createError}</p>}
          <div>
            <button type="button" disabled={creating} onClick={() => void submitCreate()}>
              {creating ? t("common.saving") : t("longAgent.createSubmit")}
            </button>
            <button type="button" disabled={creating} onClick={() => setCreateOpen(false)}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}

      {loading && agents.length === 0 ? (
        <div className={styles.loading} role="status">{t("sidebar.longAgentLoading")}</div>
      ) : error && agents.length === 0 ? (
        <div className={styles.error} role="alert">
          <span>{t("sidebar.longAgentLoadFailed")}</span>
          <button type="button" onClick={() => void load()} aria-label={t("sidebar.longAgentRetry")}>
            <IconRefresh size={14} stroke={1.8} aria-hidden="true" />
          </button>
        </div>
      ) : agents.length === 0 ? (
        <div className={styles.loading} role="status">{t("sidebar.longAgentEmpty")}</div>
      ) : (
        <nav aria-label={t("sidebar.longAgentCoworkers")}>
          <ul className={styles.list}>
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
                    title={agent.available
                      ? `${agent.name} · ${agent.description}`
                      : t("sidebar.longAgentUnavailable", { name: agent.name })}
                  >
                    <span className={styles.avatarWrap} aria-hidden="true">
                      <LongAgentAvatarView agentId={agent.id} name={agent.name} avatar={agent.avatar} />
                      <span className={agent.available && agent.channelHostAvailable
                        ? styles.presenceOnline
                        : styles.presenceOffline} />
                    </span>
                    <span className={styles.agentText}>
                      <strong>
                        {agent.name}
                        {agent.status === "archived" && <em className={styles.archivedBadge}>{t("longAgent.archivedBadge")}</em>}
                      </strong>
                      <span>{agent.description}</span>
                    </span>
                    <span className={`${styles.status}${selected ? ` ${styles.statusActive}` : ""}`}>
                      {opening ? t("sidebar.longAgentOpening") : action}
                    </span>
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
