"use client";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconPlugConnected, IconRefresh, IconSettings } from "@tabler/icons-react";
import { ToolbarAction, ToolbarStatus } from "./ui/ToolbarAction";
import { useLongAgentPresence } from "@/hooks/useLongAgentPresence";
import { useI18n } from "@/hooks/useI18n";
import {
  enableChatLongAgents,
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
  selectedLongAgentId?: string;
  visible?: boolean;
  refreshKey?: number;
  onOpenSession: (sessionId: string, projectId: string, date?: string, longAgentId?: string) => void | Promise<void>;
  onRequestClose?: () => void;
  closeAfterOpen?: boolean;
  /** 顶栏 slot（最右）：面板可见时把网关状态与设置齿轮 Portal 进顶栏，替代原面板头部。 */
  toolbarSlot: HTMLElement | null;
}

export function ProjectLongAgentSection({
  projectId,
  selectedSessionId,
  selectedLongAgentId,
  visible = true,
  refreshKey,
  onOpenSession,
  onRequestClose,
  closeAfterOpen = false,
  toolbarSlot,
}: Props) {
  const { t } = useI18n();
  const [agents, setAgents] = useState<readonly LongAgentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openVersion = useRef(0);
  useEffect(() => { openVersion.current += 1; }, [visible, selectedSessionId]);
  const [openingAgentId, setOpeningAgentId] = useState<string | null>(null);
  const [openingNoticeId, setOpeningNoticeId] = useState<string | null>(null);
  useEffect(() => {
    setOpeningNoticeId(null);
    if (openingAgentId === null) return;
    const timer = window.setTimeout(() => setOpeningNoticeId(openingAgentId), 300);
    return () => window.clearTimeout(timer);
  }, [openingAgentId]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Creation happens by talking to a Friend (`long_agent_manage`), so the rail only
  // bootstraps the first one; there is no local name/description form.
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  const presence = useLongAgentPresence(visible && agents.length > 0, refreshKey ?? 0);
  const loadVersion = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const response = await fetchLongAgents(projectId ?? undefined, signal);
      if (signal?.aborted || version !== loadVersion.current) return;
      setAgents(response.agents);
      setError(null);
    } catch (cause) {
      if (version !== loadVersion.current) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!signal?.aborted && version === loadVersion.current) setLoading(false);
    }
  }, [projectId]);

  const enable = async () => {
    setEnabling(true);
    setEnableError(null);
    try {
      await enableChatLongAgents();
      await load();
    } catch (cause) {
      setEnableError(cause instanceof Error ? cause.message : String(cause));
    } finally { setEnabling(false); }
  };

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
    if (openingAgentId !== null || !agent.available) return;
    const version = ++openVersion.current;
    setOpeningAgentId(agent.id);
    setError(null);
    try {
      // 长期同事可以直接会话：它的会话永远落在它自己的 home 项目（defaultProjectId），
      // 而不是当前选中的项目——否则在 Agent 工作区视图里会落到错误的项目并打开空会话。
      const started = await startProjectLongAgent({ longAgentId: agent.id, projectId: agent.defaultProjectId });
      // start 返回的 projectId 是会话真实归属（共享 daily 入口会重定向到 Agent 自己的
      // Daily Project）；打开时必须用它，否则前端会拿当前项目去查一个不存在的会话。
      if (version !== openVersion.current) return;
      const sessionProjectId = started.projectId;
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
      // 三要素齐全：agent（当前长期同事）+ project（会话真实归属）+ session。
      await onOpenSession(started.primarySessionId, sessionProjectId, undefined, agent.id);
      if (closeAfterOpen) onRequestClose?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpeningAgentId(null);
    }
  }, [closeAfterOpen, onOpenSession, onRequestClose, openingAgentId, projectId]);

  if (!visible) return null;

  const gatewayLabel = channelHostAvailable
    ? t("sidebar.longAgentImOnline")
    : t("sidebar.longAgentImOffline");

  return (
    <>
    {/* 面板头部已取消：网关状态（ToolbarStatus，非交互读数）与设置齿轮（ToolbarAction）
        统一走顶栏 toolbar-action 体系，Portal 到顶栏最右 slot。 */}
    {toolbarSlot && createPortal(
      <>
        {!loading && agents.length > 0 && (
          // 网关健康是基础设施层（NanoClaw 常驻进程连通性），独立于下方每个 Agent 的
          // presence 状态；图标/文字随 Appearance 的 label 偏好，颜色随连通状态过渡。
          <ToolbarStatus
            label={gatewayLabel}
            tone={channelHostAvailable ? "success" : "danger"}
            icon={<IconPlugConnected size={18} stroke={1.8} aria-hidden="true" />}
          />
        )}
        <ToolbarAction
          label={t("longAgentSettings.open")}
          icon={<IconSettings size={18} stroke={1.8} aria-hidden="true" />}
          onClick={() => setSettingsOpen(true)}
          disabled={agents.length === 0}
        />
      </>,
      toolbarSlot,
    )}
    <section
      id="sidebar-long-agents-panel"
      className={styles.section}
      role="tabpanel"
      aria-labelledby="workspace-coworkers-tab"
    >

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
        <div className={styles.empty}>
          <p>{t("sidebar.longAgentEmpty")}</p>
          <button type="button" disabled={enabling} onClick={() => void enable()}>
            {enabling ? t("common.saving") : t("longAgent.enable")}
          </button>
          <p>{t("sidebar.longAgentCreateViaChat")}</p>
          {enableError && <p className={styles.inlineError} role="alert"><InterfaceFeedback message={enableError} /></p>}
        </div>
      ) : (
        <nav aria-label={t("sidebar.longAgentCoworkers")}>
          <ul className={styles.list}>
            {agents.map((agent) => {
              const state = presence?.agents.find(item => item.id === agent.id)?.status ?? "unknown";
              const stateLabel = t(`coworkerState.${state}`);
              const primarySessionId = agent.project?.primarySessionId ?? null;
              const selected = agent.id === selectedLongAgentId || (primarySessionId !== null && primarySessionId === selectedSessionId);
              const opening = openingAgentId === agent.id;
              const showOpening = opening && openingNoticeId === agent.id;
              const started = agent.project?.started === true;
              const action = selected
                ? t("sidebar.longAgentCurrent")
                : started
                  ? t("sidebar.longAgentDedicatedSession")
                  : t("sidebar.longAgentStartChat");
              return (
                <li key={agent.id} className={styles.agentRow}>
                  <button
                    type="button"
                    className={`${styles.agentButton}${selected ? ` ${styles.selected}` : ""}`}
                    data-long-agent-open={agent.id}
                    onClick={() => void handleOpen(agent)}
                    disabled={openingAgentId !== null || !agent.available || state === "disabled"}
                    data-opening-blocked={openingAgentId !== null && agent.available && state !== "disabled" ? "true" : undefined}
                    aria-busy={opening || undefined}
                    aria-current={selected ? "page" : undefined}
                    aria-label={t("sidebar.longAgentChatWith", { name: agent.name })}
                    title={agent.available
                      ? `${agent.name} · ${stateLabel} · ${agent.description}`
                      : t("sidebar.longAgentUnavailable", { name: agent.name })}
                  >
                    <span className={styles.avatarWrap} aria-hidden="true">
                      <LongAgentAvatarView agentId={agent.id} name={agent.name} avatar={agent.avatar} />
                      <span className={styles.presence} data-state={state} />
                    </span>
                    <span className={styles.agentText}>
                      <strong>
                        {agent.name}
                        {agent.status === "archived" && <em className={styles.archivedBadge}>{t("longAgent.archivedBadge")}</em>}
                      </strong>
                      <span title={agent.description}>{agent.description}</span>
                      <span className={styles.presenceLabel} data-state={state}>{stateLabel}</span>
                    </span>
                    <span className={`${styles.status}${selected ? ` ${styles.statusActive}` : ""}`}>
                      {showOpening ? t("sidebar.longAgentOpening") : action}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {error && agents.length > 0 && <p className={styles.inlineError} role="status"><InterfaceFeedback message={error} /></p>}
    </section>
    {settingsOpen && agents.length > 0 && (
      <LongAgentSettingsPanel
        agents={agents}
        initialAgentId={selectedLongAgentId ?? agents.find((agent) => agent.project?.primarySessionId === selectedSessionId)?.id}
        onBack={() => setSettingsOpen(false)}
        onSaved={() => void load()}
      />
    )}
    </>
  );
}
