"use client";
import { LongAgentWorkflowSettings } from "./LongAgentWorkflowSettings";
import { LongAgentActivitySettings } from "./LongAgentActivitySettings";
import { useConfirmation } from "./ui/Confirmation";
import { Button } from "./ui/Button";
import { SurfaceDialog } from "./SurfaceDialog";


import { InterfaceFeedback } from "./InterfaceFeedback";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { IconBook2, IconBrain, IconClock, IconEye, IconFolder, IconPlugConnected, IconRefresh, IconSettings, IconShieldCheck, IconUser } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import {
  fetchLongAgentConfiguration,
  saveLongAgentConfiguration,
  type LongAgentConfigurationDocument,
  type LongAgentConfigurationUpdate,
  type LongAgentSummary,
} from "@/lib/long-agents-browser";
import { fetchChatProjects, type ChatProjectSummary } from "@/lib/projects-contract";
import {
  deleteChatLongAgent,
  fetchLongAgentInspection,
  setChatLongAgentArchived,
} from "@/lib/long-agents-browser";
import type { WorkflowAgentInspection } from "@/lib/chat-workflows-browser";
import { EffectiveSkillsList } from "./EffectiveSkillsList";
import {
} from "@/lib/long-agent-settings";
import styles from "./LongAgentSettingsPanel.module.css";
import { LongAgentAvatarEditor } from "./LongAgentAvatarEditor";
import { LongAgentGroupSettings } from "./LongAgentGroupSettings";
import { LongAgentHome } from "./LongAgentHome";
import { LongAgentMemorySettings } from "./LongAgentMemorySettings";
import { LongAgentTasksSettings } from "./LongAgentTasksSettings";
import { LongAgentDutiesSettings } from "./LongAgentDutiesSettings";
import { ConfigurationSection } from "./ConfigurationSection";
import { ConfigurationToggle } from "./ConfigurationToggle";

interface Props {
  agents: readonly LongAgentSummary[];
  initialAgentId?: string;
  onBack: () => void;
  onSaved: () => void;
}

interface Draft {
  name: string;
  description: string;
  enabled: boolean;
  defaultProjectId: string;
  timeZone: string;
  systemPromptMode: "pi-default" | "replace";
  systemPromptText: string;
  /** 自定义指令：真正的段落数组（P4：由拼接文本改为数组编辑） */
  customInstructions: readonly string[];
  /** 构成层开关（缺省 on）。 */
  interactionHarness: "on" | "off";
  agentMemory: "on" | "off";
  /** 绑定项目（P3 起可在此增删；后端 PUT /config 已支持）。 */
  boundProjectIds: readonly string[];
}

type SettingsTab = "identity" | "standards" | "memory" | "projects" | "on-demand" | "continuous" | "channel" | "readonly";

function draftFrom(document: LongAgentConfigurationDocument): Draft {
  const definition = document.agent.definition;
  return {
    name: document.agent.name,
    description: document.agent.description,
    enabled: document.agent.enabled,
    defaultProjectId: document.agent.defaultProjectId,
    timeZone: document.agent.timeZone ?? "UTC",
    systemPromptMode: definition.systemPrompt.mode,
    systemPromptText: definition.systemPrompt.mode === "replace" ? definition.systemPrompt.text : "",
    customInstructions: definition.customInstructions,
    interactionHarness: document.agent.interactionHarness,
    agentMemory: document.agent.agentMemory,
    boundProjectIds: document.agent.boundProjectIds,
  };
}

function updateFromDraft(
  document: LongAgentConfigurationDocument,
  draft: Draft,
): LongAgentConfigurationUpdate {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    enabled: draft.enabled,
    defaultProjectId: draft.defaultProjectId,
    timeZone: draft.timeZone,
    interactionHarness: draft.interactionHarness,
    agentMemory: draft.agentMemory,
    boundProjectIds: draft.boundProjectIds,
    definition: {
      schemaVersion: 1,
      id: document.agent.id,
      name: draft.name.trim(),
      description: draft.description.trim(),
      model: document.agent.definition.model,
      thinkingLevel: document.agent.definition.thinkingLevel,
      systemPrompt: draft.systemPromptMode === "pi-default"
        ? { mode: "pi-default" }
        : { mode: "replace", text: draft.systemPromptText.trim() },
      customInstructions: draft.customInstructions.map((text) => text.trim()).filter((text) => text !== ""),
      tools: document.agent.definition.tools,
      resources: document.agent.definition.resources,
    },
  };
}

export function LongAgentSettingsPanel({ agents, initialAgentId, onBack, onSaved }: Props) {
  const confirm = useConfirmation();
  const { t } = useI18n();
  const [agentId, setAgentId] = useState(
    initialAgentId && agents.some((agent) => agent.id === initialAgentId)
      ? initialAgentId
      : agents[0]?.id ?? "",
  );
  const loadGeneration = useRef(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [document, setDocument] = useState<LongAgentConfigurationDocument | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const [projects, setProjects] = useState<readonly ChatProjectSummary[]>([]);
  /** P4：规则资源（复用既有 Prompt 资源接口，只读展示） */
  const [ruleResources, setRuleResources] = useState<readonly { readonly id: string; readonly revision: number; readonly kind: string; readonly title: string }[]>([]);
  const [modelInspectionVersion, setModelInspectionVersion] = useState(0);
  const [inspection, setInspection] = useState<WorkflowAgentInspection | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("identity");
  const [tabDirty, setTabDirty] = useState(false);
  const dirty = draft !== null && initialDraft !== null
    && JSON.stringify(draft) !== JSON.stringify(initialDraft);

  const hasUnsavedChanges = dirty || tabDirty;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/prompt-resources?projectId=${encodeURIComponent(agentId)}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || body === null || typeof body !== "object") return;
        const list = (body as { resources?: unknown }).resources;
        if (!Array.isArray(list)) return;
        setRuleResources(list.flatMap((item) => (item !== null && typeof item === "object"
          && typeof (item as { id?: unknown }).id === "string" && typeof (item as { title?: unknown }).title === "string"
          && typeof (item as { kind?: unknown }).kind === "string" && typeof (item as { revision?: unknown }).revision === "number"
          ? [{ id: (item as { id: string }).id, revision: (item as { revision: number }).revision, kind: (item as { kind: string }).kind, title: (item as { title: string }).title }]
          : [])));
      } catch { /* 资源读取失败不影响规范开关 */ }
    })();
    void fetchChatProjects(controller.signal).then(setProjects).catch((cause: unknown) => {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!modelInspectionVersion || !document) return;
    const controller = new AbortController();
    const generation = loadGeneration.current;
    const current = () => generation === loadGeneration.current && !controller.signal.aborted;
    setInspection(null);
    setInspectionError(null);
    void fetchLongAgentInspection(document.agent.id, document.agent.id, controller.signal)
      .then(value => { if (current()) setInspection(value); })
      .catch((cause: unknown) => {
        if (current()) setInspectionError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, [document?.agent.id, modelInspectionVersion]);

  const load = useCallback(async (selectedAgentId: string, signal?: AbortSignal) => {
    if (!selectedAgentId) return;
    const generation = ++loadGeneration.current;
    const current = () => generation === loadGeneration.current && !signal?.aborted;
    setLoading(true);
    setError(null);
    setNotice(null);
    setInspection(null);
    setInspectionError(null);
    try {
      const next = await fetchLongAgentConfiguration(selectedAgentId, signal);
      if (!current()) return;
      const nextDraft = draftFrom(next);
      setDocument(next);
      setDraft(nextDraft);
      setInitialDraft(nextDraft);
      // 生效装配与配置同源读取：失败只影响只读展示区，不影响配置编辑。
      void fetchLongAgentInspection(selectedAgentId, next.agent.id, signal)
        .then(value => { if (current()) setInspection(value); })
        .catch((cause: unknown) => {
          if (current() && !(cause instanceof DOMException && cause.name === "AbortError")) {
            setInspectionError(cause instanceof Error ? cause.message : String(cause));
          }
        });
    } catch (cause) {
      if (current() && !(cause instanceof DOMException && cause.name === "AbortError")) {
        setDocument(null);
        setDraft(null);
        setInitialDraft(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  const runLifecycle = useCallback(async (action: "archive" | "restore" | "delete") => {
    if (action === "archive" && !await confirm(t("longAgent.archiveConfirm"), t("longAgent.archive"))) return;
    if (action === "delete" && !await confirm(t("longAgent.deleteConfirm"), t("longAgent.delete"))) return;
    setLifecycleBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        await deleteChatLongAgent(agentId);
        onSaved();
        onBack();
        return;
      }
      await setChatLongAgentArchived(agentId, action === "archive");
      onSaved();
      await load(agentId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLifecycleBusy(false);
    }
  }, [agentId, load, onBack, onSaved, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(agentId, controller.signal);
    return () => { controller.abort(); loadGeneration.current += 1; };
  }, [agentId, load]);

  const refresh = async () => {
    if (hasUnsavedChanges && !await confirm(t("longAgentSettings.discardConfirm"), t("common.discard"))) return;
    setTabDirty(false);
    setRefreshVersion(version => version + 1);
    await load(agentId);
  };
  const back = async () => {
    if (hasUnsavedChanges && !await confirm(t("longAgentSettings.discardConfirm"), t("common.discard"))) return;
    onBack();
  };
  const save = async () => {
    if (!document || !draft || saving) return;
    if (!draft.name.trim()) {
      setError(t("longAgentSettings.identityRequired"));
      return;
    }
    if (draft.systemPromptMode === "replace" && !draft.systemPromptText.trim()) {
      setError(t("longAgentSettings.systemPromptRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await saveLongAgentConfiguration(
        document.agent.id,
        document.revision,
        updateFromDraft(document, draft),
      );
      const nextDraft = draftFrom(next);
      setDocument(next);
      setDraft(nextDraft);
      setInitialDraft(nextDraft);
      setNotice(t("longAgentSettings.saved"));
      onSaved();
      setInspection(null);
      setInspectionError(null);
      const generation = ++loadGeneration.current;
      try {
        const resolved = await fetchLongAgentInspection(next.agent.id, next.agent.id);
        if (generation === loadGeneration.current) setInspection(resolved);
      } catch (cause) {
        if (generation === loadGeneration.current) setInspectionError(cause instanceof Error ? cause.message : String(cause));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const workflowChanged = () => {
    if (!document) return;
    const generation = ++loadGeneration.current;
    void fetchLongAgentConfiguration(document.agent.id).then(next => {
      if (generation === loadGeneration.current) setDocument(next);
    }).catch(cause => { if (generation === loadGeneration.current) setError(String(cause)); });
    setModelInspectionVersion(version => version + 1);
  };

  const selectedSummary = agents.find((agent) => agent.id === agentId) ?? null;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => current === null ? current : { ...current, [key]: value });
  };
  const [usageOpen, setUsageOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  // P8：把检查视图与真实装配对齐——引用本轮实际注入的 harness 区域（含 revision）。
  const harnessRegion = inspection?.prompt.regions?.find((region) => region.name === "chat_interaction_harness");
  const tabDescriptions: Record<SettingsTab, string> = {
    identity: t("assistantDesign.identityHint"),
    standards: t("longAgentSettings.standardsHint"),
    memory: t("assistantDesign.memoryHint"),
    projects: t("longAgentSettings.projectsHint"),
    "on-demand": t("assistantDesign.settingsHint"),
    continuous: t("assistantDesign.scheduleHint"),
    channel: t("longAgentSettings.channelHint"),
    readonly: t("longAgentSettings.readonlyHint"),
  };
  // 左侧导航 = Agent 定义的各个部分（构成 5 + 能力 3 + 只读 1），与 02-design §4 的整页骨架一致。
  const tabs = [
    { id: "identity", label: t("longAgentSettings.identity"), icon: IconUser, group: "constitution" as const },
    { id: "standards", label: t("longAgentSettings.standardsTab"), icon: IconShieldCheck, group: "constitution" as const },
    { id: "memory", label: t("longAgentSettings.memoryTab"), icon: IconBrain, group: "constitution" as const },
    { id: "projects", label: t("longAgentSettings.projectsTab"), icon: IconFolder, group: "constitution" as const },
    { id: "on-demand", label: t("longAgentSettings.onDemandTab"), icon: IconSettings, group: "capability" as const },
    { id: "continuous", label: t("longAgentSettings.continuousTab"), icon: IconClock, group: "capability" as const },
    { id: "channel", label: t("longAgentSettings.channelTab"), icon: IconPlugConnected, group: "capability" as const },
    { id: "readonly", label: t("longAgentSettings.readonlyTab"), icon: IconEye, group: "readonly" as const },
  ] as const;
  const handleTabKeyDown = async (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const tabList = event.currentTarget;
    const current = tabs.findIndex((tab) => tab.id === activeTab);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
        : (current + ((event.key === "ArrowRight" || event.key === "ArrowDown") ? 1 : -1) + tabs.length) % tabs.length;
    if (tabDirty && !await confirm(t("longAgentSettings.discardConfirm"), t("common.discard"))) return;
    setTabDirty(false);
    setActiveTab(tabs[next].id);
    const buttons = tabList.querySelectorAll<HTMLButtonElement>("[role=tab]");
    buttons[next]?.focus();
  };
  const selectTab = async (nextTab: SettingsTab) => {
    if (nextTab === activeTab) return;
    if (tabDirty && !await confirm(t("longAgentSettings.discardConfirm"), t("common.discard"))) return;
    setTabDirty(false);
    setActiveTab(nextTab);
  };
  // 顶部双页：个人主页（home，只读）与长期助手设置（settings，可编辑）——
  // draft 草稿跨页保留，切到主页再回来修改不丢失；未保存就换页先确认。
  const [topPage, setTopPage] = useState<"home" | "settings">("home");
  const switchTopPage = async (next: "home" | "settings") => {
    if (next === topPage) return;
    if (hasUnsavedChanges && !await confirm(t("longAgentSettings.discardConfirm"), t("common.discard"))) return;
    setTopPage(next);
  };
  // 分页签键盘可达：左右箭头在两页之间切换（与左导航的 handleTabKeyDown 同一模式）
  const handleTopPageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const order = ["home", "settings"] as const;
    const next = order[(order.indexOf(topPage) + (event.key === "ArrowRight" ? 1 : -1) + order.length) % order.length];
    void switchTopPage(next);
  };

  // P3: temporary config renders in the shared SurfaceDialog (wide). Radix owns
  // focus + Escape; unsaved-close confirmation runs through `back()`.
  const requestClose = () => { void back(); };
  const headerActions = (<>
      {selectedSummary !== null && (<>
        <Button variant="ghost" type="button"
          disabled={saving || lifecycleBusy}
          onClick={() => void runLifecycle(selectedSummary.status === "archived" ? "restore" : "archive")}>{selectedSummary.status === "archived" ? t("longAgent.restore") : t("longAgent.archive")}</Button>
        {selectedSummary.status === "archived" && (<Button variant="ghost" type="button"
          disabled={saving || lifecycleBusy}
          onClick={() => void runLifecycle("delete")}>{t("longAgent.delete")}</Button>)}
      </>)}
      <Button variant="secondary" type="button"
        onClick={() => void refresh()} disabled={loading || saving || lifecycleBusy}>
        <IconRefresh size={16} stroke={1.8} aria-hidden="true" />{t("common.refresh")}
      </Button>
  </>);
  return (<SurfaceDialog title={topPage === "home" ? t("longAgentHome.title") : t("longAgentSettings.title")}
    description={topPage === "home" ? undefined : t("longAgentSettings.subtitle")}
    onClose={requestClose} actions={headerActions}>
    {/* 顶部双页切换：个人主页 / 长期助手设置（同一 Dialog 内切换，不靠滚动） */}
    <div className={styles.topPages} role="tablist" aria-label={t("longAgentSettings.title")} onKeyDown={handleTopPageKeyDown}>
      <button type="button" role="tab" aria-selected={topPage === "home"}
        className={topPage === "home" ? styles.topPageActive : styles.topPage}
        onClick={() => void switchTopPage("home")}>{t("longAgentHome.title")}</button>
      <button type="button" role="tab" aria-selected={topPage === "settings"}
        className={topPage === "settings" ? styles.topPageActive : styles.topPage}
        onClick={() => void switchTopPage("settings")}>{t("longAgentSettings.title")}{hasUnsavedChanges ? <span aria-hidden="true"> ●</span> : null}</button>
    </div>
    <div className={`${styles.dialog} configuration-dialog`}>
      {topPage === "home" ? (
        /* 个人主页（只读页）：独立滚动，不渲染配置/动作条 */
        <div className={styles.scroll} data-la-scroll data-la-page="home">
          {document !== null && document.agent.id === agentId ? <LongAgentHome document={document} inspection={inspection} /> : null}
        </div>
      ) : (
        /* 配置页：左导航 8 分区 + 右内容 + 底部动作条 */
        <>
      {/* 唯一滚动容器：A 区（个人主页）+ B 区（配置）都在其中；动作条在滚动区之外，不会覆盖正文 */}
      <div className={styles.scroll} data-la-scroll data-la-page="settings">
      <div className={styles.workspace}>
        <nav className={styles.agentNav} aria-label={t("longAgentSettings.agentList")}>
              <div className={styles.settingsTabs} role="tablist" aria-orientation="vertical" aria-label={t("longAgentSettings.sections")} onKeyDown={handleTabKeyDown}>
                {tabs.map((tab, index) => {
                  const Icon = tab.icon;
                  const groupLabel = tabs[index - 1]?.group === tab.group ? null
                    : tab.group === "capability" ? t("longAgentSettings.groupCapability")
                      : tab.group === "readonly" ? t("longAgentSettings.groupReadonly")
                        : t("longAgentSettings.groupConstitution");
                  return (
                    <Fragment key={tab.id}>
                    {groupLabel !== null && (
                      <div className={styles.settingsTabGroup} role="presentation">{groupLabel}</div>
                    )}
                    <button
                      id={`long-agent-${tab.id}-tab`}
                      type="button"
                      role="tab"
                      aria-label={tab.label}
                      aria-selected={activeTab === tab.id}
                      aria-controls={`long-agent-${tab.id}-panel`}
                      tabIndex={activeTab === tab.id ? 0 : -1}
                      className={activeTab === tab.id ? styles.activeSettingsTab : styles.settingsTab}
                      onClick={() => selectTab(tab.id)}
                    >
                      <Icon size={17} aria-hidden="true" />
                      {/* 导航只放标题：同一信息不在左栏与右栏重复，说明由右栏展开 */}
                      <span><strong>{tab.label}</strong></span>
                    </button>
                    </Fragment>
                  );
                })}
              </div>
        </nav>

        <main className={styles.main}>
          {loading ? (
            <div className={styles.state} role="status">{t("longAgentSettings.loading")}</div>
          ) : error && (!document || !draft) ? (
            <div className={styles.state} role="alert">
              <strong>{t("longAgentSettings.loadFailed")}</strong>
              <span><InterfaceFeedback message={error} /></span>
              <Button variant="secondary" type="button" onClick={() => void load(agentId)}>
                {t("longAgentSettings.retry")}
              </Button>
            </div>
          ) : document && document.agent.id === agentId && draft ? (
            <div className={styles.settingsShell}>
              <div className={styles.agentHeading}>
                <div>
                  {/* P9：当前分区名称由左栏导航承担，这里不再视觉重复（保留无障碍语义） */}
                  <h2 className={styles.visuallyHidden}>{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
                  <p className={styles.headingDescription}>{tabDescriptions[activeTab]}</p>
                </div>
                {activeTab === "identity" && (
                  <div className={styles.enabledControl}>
                    <span>{draft.enabled ? t("longAgentSettings.enabled") : t("longAgentSettings.disabled")}</span>
                    <ConfigurationToggle enabled={draft.enabled} loading={saving} onToggle={() => set("enabled", !draft.enabled)} label={t("longAgentSettings.enabled")} />
                  </div>
                )}
              </div>


              <div
                id={`long-agent-${activeTab}-panel`}
                role="tabpanel"
                aria-labelledby={`long-agent-${activeTab}-tab`}
                className={styles.tabPanel}
              >
                {activeTab === "identity" && (
                  <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
                    <fieldset className={styles.formFields} disabled={saving}>
                    <div className={styles.sourceLine}>
                      <span>{t("longAgentSettings.chatSource")}</span>
                      <span>{t("longAgentSettings.nextTurnEffective")}</span>
                    </div>
                    {notice && <div className={styles.notice} role="status">{notice}</div>}
                    {error && <div className={styles.error} role="alert"><InterfaceFeedback message={error} /></div>}

                    <fieldset className={styles.section}>
                      {/* P9：与左栏导航同名的标题只留一处——这里视觉隐藏，仅保留无障碍语义 */}
                      <legend className={styles.visuallyHidden}>{t("longAgentSettings.identity")}</legend>
                      <LongAgentAvatarEditor
                        document={document}
                        onUpdated={(next) => {
                          setDocument(next);
                          setNotice(t("longAgentSettings.avatarUpdated"));
                          onSaved();
                        }}
                      />
                      <div className={styles.twoColumns}>
                        <label>{t("longAgentSettings.name")}<input value={draft.name} maxLength={80} onChange={(event) => set("name", event.target.value)} /></label>
                        <label>{t("longAgentSettings.timeZone")}<input value={draft.timeZone} onChange={(event) => set("timeZone", event.target.value)} placeholder="Asia/Shanghai" /><span className={styles.fieldHint}>{t("longAgentSettings.timeZoneHint")}</span></label>
                        <label>{t("longAgentSettings.defaultProject")}<select value={draft.defaultProjectId} onChange={(event) => set("defaultProjectId", event.target.value)}>{!projects.some((project) => project.projectId === draft.defaultProjectId) && <option value={draft.defaultProjectId}>{draft.defaultProjectId}</option>}{projects.filter(project => project.kind === "project" || project.projectId === draft.defaultProjectId || project.projectId === document.agent.id).map((project) => <option key={project.projectId} value={project.projectId} disabled={!project.available}>{project.kind === "project" ? project.cachedName : t("design.noCollaboration")}</option>)}</select></label>
                      </div>
                      <label>{t("longAgentSettings.description")}<textarea value={draft.description} rows={3} maxLength={500} onChange={(event) => set("description", event.target.value)} /></label>
                    </fieldset>

                    <fieldset className={styles.section} data-la-identity-prompt>
                      <legend>{t("longAgentSettings.systemPrompt")}</legend>
                      <label>{t("longAgentSettings.systemPromptMode")}<select value={draft.systemPromptMode} onChange={(event) => set("systemPromptMode", event.target.value as Draft["systemPromptMode"])}>
                        <option value="pi-default">{t("longAgentSettings.piDefaultPrompt")}</option>
                        <option value="replace">{t("longAgentSettings.replacePrompt")}</option>
                      </select></label>
                      {draft.systemPromptMode === "replace" && (
                        <label>{t("longAgentSettings.systemPromptText")}
                          <textarea className={styles.promptEditor} value={draft.systemPromptText} rows={12}
                            onChange={(event) => set("systemPromptText", event.target.value)} />
                        </label>
                      )}
                    </fieldset>

                    <fieldset className={styles.section} data-la-custom-instructions>
                      <legend>{t("longAgentSettings.customInstructions")}</legend>
                      <p className={styles.help}>{t("longAgentSettings.customInstructionsHint")}</p>
                      <ul className={styles.instructionList}>
                        {draft.customInstructions.map((text, index) => (
                          <li key={`instruction-${index}`} className={styles.instructionRow}>
                            <textarea value={text} rows={3}
                              aria-label={t("longAgentSettings.customInstructionN", { n: String(index + 1) })}
                              onChange={(event) => set("customInstructions", draft.customInstructions
                                .map((item, i) => (i === index ? event.target.value : item)))} />
                            <Button variant="secondary" type="button"
                              onClick={() => set("customInstructions", draft.customInstructions.filter((_, i) => i !== index))}>
                              {t("common.delete")}
                            </Button>
                          </li>
                        ))}
                      </ul>
                      <Button variant="secondary" type="button"
                        onClick={() => set("customInstructions", [...draft.customInstructions, ""])}>
                        {t("longAgentSettings.addInstruction")}
                      </Button>
                    </fieldset>


                    </fieldset>
                  </form>
                )}
                {activeTab === "identity" && <ConfigurationSection className={styles.disclosure} title={t("longAgentSettings.groupIdentity")} onToggle={event => { if (event.currentTarget.open) setIdentityOpen(true); }}>
                  {identityOpen && <LongAgentGroupSettings longAgentId={document.agent.id} key={`${document.agent.id}:${refreshVersion}`} onDirtyChange={setTabDirty} />}
                </ConfigurationSection>}
                {activeTab === "readonly" && (
                  <ConfigurationSection className={styles.disclosure} title={t("longAgentSettings.effectiveAssembly")} open>
                    <p className={styles.help}>{t("longAgentSettings.previewScope", { project: document.agent.id })}</p>
                    {dirty && <p className={styles.help}>{t("longAgentSettings.previewSaved")}</p>}
                    {inspection && <div className={styles.capabilitySummary}>
                      <strong>{t("longAgentSettings.availableTools", { count: inspection.tools.filter(tool => tool.active).length })}</strong>
                      <p>{inspection.tools.filter(tool => tool.active).map(tool => tool.name).join(" · ") || t("longAgentSettings.noTools")}</p>
                      <small>{t("longAgentSettings.memoryBoundary")}</small>
                    </div>}
                    {inspectionError && <div className={styles.error} role="alert"><InterfaceFeedback message={inspectionError} /></div>}
                    {inspection === null && inspectionError === null && <small>{t("longAgentSettings.inspectionLoading")}</small>}
                    {inspection !== null && (
                      <EffectiveSkillsList
                        skills={inspection.skills}
                        labels={{
                          title: t("longAgentSettings.effectiveSkills"),
                          empty: t("longAgentSettings.effectiveSkillsEmpty"),
                          owners: {
                            agent: t("longAgentSettings.skillOwnerLongAgent"),
                            personal: t("longAgentSettings.skillOwnerPersonal"),
                            project: t("longAgentSettings.skillOwnerProject"),
                            plugin: t("longAgentSettings.skillOwnerPlugin"),
                            injected: t("longAgentSettings.skillOwnerInjected"),
                          },
                        }}
                      />
                    )}
                  </ConfigurationSection>
                )}
                {activeTab === "readonly" && <ConfigurationSection className={styles.disclosure} title={t("longAgentSettings.activityHeading")} onToggle={event => setUsageOpen(event.currentTarget.open)}>{usageOpen && <LongAgentActivitySettings longAgentId={document.agent.id} />}</ConfigurationSection>}
            {activeTab === "continuous" && <LongAgentTasksSettings longAgentId={document.agent.id} />}
                {activeTab === "continuous" && <LongAgentDutiesSettings longAgentId={document.agent.id} />}
                {activeTab === "projects" && (
                  <fieldset className={styles.section}>
                    <legend>{t("longAgentSettings.projectsTab")}</legend>
                    <label>{t("longAgentSettings.defaultProject")}<select value={draft.defaultProjectId} onChange={(event) => set("defaultProjectId", event.target.value)}>{!projects.some((project) => project.projectId === draft.defaultProjectId) && <option value={draft.defaultProjectId}>{draft.defaultProjectId}</option>}{projects.filter(project => project.kind === "project" || project.projectId === draft.defaultProjectId || project.projectId === document.agent.id).map((project) => <option key={project.projectId} value={project.projectId} disabled={!project.available}>{project.kind === "project" ? project.cachedName : t("design.noCollaboration")}</option>)}</select></label>
                    <div className={styles.boundProjects} data-la-bound-projects>
                      <span>{t("longAgentSettings.boundProjects")} · {t("longAgentSettings.boundCount", { count: String(draft.boundProjectIds.length) })}</span>
                      {projects.filter(project => project.kind === "project").map((project) => {
                        const bound = draft.boundProjectIds.includes(project.projectId);
                        return (
                          <label key={project.projectId} className={styles.boundProjectRow}
                            title={project.available ? undefined : t("longAgentSettings.projectUnavailable")}>
                            <input type="checkbox" checked={bound} disabled={!project.available}
                              onChange={(event) => set("boundProjectIds", event.target.checked
                                ? [...draft.boundProjectIds, project.projectId]
                                : draft.boundProjectIds.filter((id) => id !== project.projectId))} />
                            <span>{project.cachedName}{project.available ? "" : ` · ${t("longAgentSettings.projectUnavailable")}`}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                {activeTab === "on-demand" && (
                  <>
                    <fieldset className={`${styles.section} ${styles.runtimeSection}`}>
                      <legend>{t("longAgentSettings.runtime")}</legend>
                      <LongAgentWorkflowSettings key={document.agent.id} projectId={document.agent.id}
                        cwd={projects.find(project => project.projectId === document.agent.id)?.path ?? ""}
                        onChanged={workflowChanged} />
                    </fieldset>
                  </>
                )}
                {activeTab === "channel" && (
                  <fieldset className={styles.section}>
                    <legend>{t("longAgentSettings.channelTab")}</legend>
                    {document.channel === null ? (
                      <p className={styles.help}>{t("longAgentSettings.channelUnbound")}</p>
                    ) : (
                      <>
                        <dl className={styles.facts}>
                          <dt>{t("longAgentSettings.adapter")}</dt><dd>{document.channel.type}</dd>
                          <dt>{t("longAgentSettings.instance")}</dt><dd>{document.channel.instance}</dd>
                          <dt>{t("longAgentSettings.host")}</dt><dd>{document.channel.host.name} · {document.channel.host.id}</dd>
                        </dl>
                        <p className={styles.securityNote}>{t("longAgentSettings.channelCredentialBoundary")}</p>
                      </>
                    )}
                  </fieldset>
                )}
                {activeTab === "standards" && (
                  <fieldset className={styles.section} data-la-standards>
                    <legend>{t("longAgentSettings.standardsTab")}</legend>
                    <label className="switch-row">
                      <input type="checkbox" data-la-interaction-harness
                        checked={draft.interactionHarness === "on"}
                        onChange={(event) => setDraft({ ...draft, interactionHarness: event.target.checked ? "on" : "off" })} />
                      <span>{t("longAgentSettings.interactionHarness")}</span>
                    </label>
                    <p className={styles.hint}>{t("longAgentSettings.interactionHarnessHint")}</p>
                    <p className={styles.hint} data-la-harness-revision={harnessRegion?.revision ?? "none"}>
                      {harnessRegion === undefined
                        ? t("longAgentSettings.harnessRevisionPending")
                        : t("longAgentSettings.harnessRevision", {
                            revision: harnessRegion.revision ?? t("longAgentSettings.harnessRevisionUnversioned"),
                            characters: harnessRegion.characters,
                          })}
                    </p>
                    <div data-la-rule-resources>
                      <h4 className={styles.regionTitle}>{t("longAgentSettings.ruleResources")}</h4>
                      <p className={styles.hint}>{t("longAgentSettings.ruleResourcesHint")}</p>
                      {ruleResources.length === 0 ? <p className={styles.hint}>{t("longAgentSettings.ruleResourcesEmpty")}</p>
                        : (
                          <ul className={styles.resourceList}>
                            {ruleResources.slice(0, 8).map((resource) => (
                              <li key={resource.id} className={styles.resourceItem}>
                                <div className={styles.resourceTitle}>{resource.title}</div>
                                <div className={styles.resourceMeta}>{t("longAgentSettings.ruleResourceKind", { kind: resource.kind, revision: String(resource.revision) })}</div>
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                    {(inspection?.prompt.regions ?? []).length > 0 && (
                      // 高级信息：折叠展示，默认界面只留“开关 + 生效 revision”。
                      <ConfigurationSection className={styles.disclosure} data-la-prompt-regions title={t("longAgentSettings.promptRegions")}>
                        <ul className={styles.regionList}>
                          {(inspection?.prompt.regions ?? []).map((region, index) => (
                            <li key={`${region.name}:${index}`}>
                              <code>{region.name}</code>
                              <span>{t("longAgentSettings.promptRegionDetail", {
                                characters: region.characters,
                                revision: region.revision ?? t("longAgentSettings.harnessRevisionUnversioned"),
                              })}</span>
                            </li>
                          ))}
                        </ul>
                      </ConfigurationSection>
                    )}
                  </fieldset>
                )}
                {activeTab === "memory" && (
                  <fieldset className={styles.section} data-la-memory-switch>
                    <legend>{t("longAgentSettings.memoryTab")}</legend>
                    <label className="switch-row">
                      <input type="checkbox" data-la-agent-memory
                        checked={draft.agentMemory === "on"}
                        onChange={(event) => setDraft({ ...draft, agentMemory: event.target.checked ? "on" : "off" })} />
                      <span>{t("longAgentSettings.agentMemoryInject")}</span>
                    </label>
                    <p className={styles.hint}>{t("longAgentSettings.agentMemoryInjectHint")}</p>
                  </fieldset>
                )}
                {activeTab === "memory" && <LongAgentMemorySettings longAgentId={document.agent.id} key={`${document.agent.id}:${refreshVersion}`} onDirtyChange={setTabDirty} />}
              </div>
            </div>
          ) : null}
        </main>
      </div>
      </div>
      </>
      )}
      {topPage === "settings" ? (
      /* 底部动作条：只在配置页；固定占位，永不覆盖正文 */
      <div className={styles.actions} data-la-actions>
        <span>{dirty ? t("longAgentSettings.unsaved") : t("longAgentSettings.savedState")}</span>
        <Button variant="secondary" type="button" disabled={!dirty || saving} onClick={() => { if (initialDraft) setDraft(initialDraft); }}>{t("longAgentSettings.reset")}</Button>
        <Button variant="primary" type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? t("common.saving") : t("common.save")}</Button>
      </div>
      ) : null}
    </div>
  </SurfaceDialog>);
}
