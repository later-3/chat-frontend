"use client";

import { useDialogFocus } from "@/hooks/useDialogFocus";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconActivity, IconArrowLeft, IconBook2, IconBrain, IconClock, IconMessages, IconRefresh, IconSend, IconSettings, IconUsersGroup } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { fetchChatModelCatalog, type ChatModelCatalog } from "@/lib/chat-workflows-browser";
import {
  fetchLongAgentConfiguration,
  saveLongAgentConfiguration,
  type LongAgentConfigurationDocument,
  type LongAgentConfigurationUpdate,
  type LongAgentSummary,
} from "@/lib/long-agents-browser";
import { fetchChatProjects, type ChatProjectSummary } from "@/lib/projects-contract";
import {
  fetchProjectResourceCatalog,
  type ProjectResourceCatalog,
} from "@/lib/project-resources";
import type { WorkflowAgentResources, WorkflowAgentToolPolicy } from "@/lib/chat-workflow-contract";
import { fetchChatTools, type ChatToolCatalogEntry } from "@/lib/tools-browser";
import {
  deleteChatLongAgent,
  fetchLongAgentInspection,
  setChatLongAgentArchived,
} from "@/lib/long-agents-browser";
import { fetchChatSkillTree, type SkillTreeEntry, type SkillTreeResponse } from "@/lib/skill-tree-browser";
import type { WorkflowAgentInspection } from "@/lib/chat-workflows-browser";
import { EffectiveSkillsList } from "./EffectiveSkillsList";
import {
  formatLongAgentInstructions,
  LONG_AGENT_INSTRUCTION_SEPARATOR,
  parseLongAgentInstructions,
} from "@/lib/long-agent-settings";
import styles from "./LongAgentSettingsPanel.module.css";
import { LongAgentAvatarEditor } from "./LongAgentAvatarEditor";
import { LongAgentGroupSettings } from "./LongAgentGroupSettings";
import { LongAgentMemorySettings } from "./LongAgentMemorySettings";
import { LongAgentTasksSettings } from "./LongAgentTasksSettings";
import { LongAgentDeliverablesSettings } from "./LongAgentDeliverablesSettings";
import { LongAgentDutiesSettings } from "./LongAgentDutiesSettings";
import { LongAgentActivitySettings } from "./LongAgentActivitySettings";
import { LongAgentConversationsPanel } from "./LongAgentConversationsPanel";

/**
 * 可选系统Tool清单只来自Backend `/api/tools`；这里只提供已知地址的本地化标签，
 * 新增系统Tool不需要修改Frontend。
 */
const CHAT_TOOL_LABEL_KEYS: Record<string, string> = {
  "system:tool/memory_search": "longAgentSettings.memorySearch",
  "system:tool/memory_record": "longAgentSettings.memoryRecord",
  "system:tool/workflow_call": "longAgentSettings.workflowCall",
  "system:tool/agent_memory_search": "longAgentSettings.agentMemorySearch",
  "system:tool/agent_memory_read": "longAgentSettings.agentMemoryRead",
  "system:tool/agent_memory_write": "longAgentSettings.agentMemoryWrite",
  "system:tool/project_search": "longAgentSettings.projectSearch",
  "system:tool/project_read": "longAgentSettings.projectRead",
  "system:tool/project_create": "longAgentSettings.projectCreate",
  "system:tool/project_open": "longAgentSettings.projectOpen",
  "system:tool/project_update": "longAgentSettings.projectUpdate",
  "system:tool/project_configure": "longAgentSettings.projectConfigure",
  "system:tool/long_agent_manage": "longAgentSettings.longAgentManage",
  "system:tool/channel_send": "longAgentSettings.channelSend",
};

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
  modelKey: string;
  thinkingLevel: string;
  systemPromptMode: "pi-default" | "replace";
  systemPromptText: string;
  responseTemplateText: string;
  customInstructionsText: string;
  toolMode: WorkflowAgentToolPolicy["mode"];
  toolNamesText: string;
  excludedToolNamesText: string;
  toolAddresses: readonly string[];
  resourceMode: WorkflowAgentResources["mode"];
  skillPathsText: string;
  extensionPathsText: string;
  pluginSourcesText: string;
}

type SettingsTab = "runtime" | "tasks" | "duties" | "deliverables" | "activity" | "conversations" | "agent-group" | "agent-memory";

function lines(value: string): string[] {
  return [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))];
}

function draftFrom(document: LongAgentConfigurationDocument): Draft {
  const definition = document.agent.definition;
  const resources = definition.resources;
  const tools = definition.tools;
  return {
    name: document.agent.name,
    description: document.agent.description,
    enabled: document.agent.enabled,
    defaultProjectId: document.agent.defaultProjectId,
    timeZone: document.agent.timeZone ?? "UTC",
    modelKey: definition.model === null ? "" : `${definition.model.provider}/${definition.model.modelId}`,
    thinkingLevel: definition.thinkingLevel ?? "",
    systemPromptMode: definition.systemPrompt.mode,
    systemPromptText: definition.systemPrompt.mode === "replace" ? definition.systemPrompt.text : "",
    responseTemplateText: document.agent.responseTemplate ?? "",
    customInstructionsText: formatLongAgentInstructions(definition.customInstructions),
    toolMode: tools.mode,
    toolNamesText: tools.mode === "explicit" ? tools.names.join("\n") : "",
    excludedToolNamesText: tools.mode === "explicit" ? tools.exclude.join("\n") : "",
    toolAddresses: tools.mode === "none" ? [] : tools.addresses ?? [],
    resourceMode: resources.mode,
    skillPathsText: resources.mode === "explicit" ? resources.skillPaths.join("\n") : "",
    extensionPathsText: resources.mode === "explicit" ? resources.extensionPaths.join("\n") : "",
    pluginSourcesText: resources.mode === "explicit" ? resources.pluginSources.join("\n") : "",
  };
}

function updateFromDraft(
  document: LongAgentConfigurationDocument,
  draft: Draft,
  modelCatalog: ChatModelCatalog | null,
): LongAgentConfigurationUpdate {
  const model = draft.modelKey === ""
    ? null
    : modelCatalog?.models.find((item) => `${item.provider}/${item.modelId}` === draft.modelKey) ?? null;
  const tools: WorkflowAgentToolPolicy = draft.toolMode === "none"
    ? { mode: "none" }
    : draft.toolMode === "pi-default"
      ? { mode: "pi-default", addresses: draft.toolAddresses }
      : {
          mode: "explicit",
          names: lines(draft.toolNamesText),
          exclude: lines(draft.excludedToolNamesText),
          addresses: draft.toolAddresses,
        };
  const resources: WorkflowAgentResources = draft.resourceMode === "inherit"
    ? { mode: "inherit" }
    : {
        mode: "explicit",
        skillPaths: lines(draft.skillPathsText),
        extensionPaths: lines(draft.extensionPathsText),
        pluginSources: lines(draft.pluginSourcesText),
      };
  return {
    responseTemplate: draft.responseTemplateText.trim() === "" ? null : draft.responseTemplateText.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    enabled: draft.enabled,
    defaultProjectId: draft.defaultProjectId,
    timeZone: draft.timeZone,
    definition: {
      schemaVersion: 1,
      id: document.agent.id,
      name: draft.name.trim(),
      description: draft.description.trim(),
      model: model === null ? null : { provider: model.provider, modelId: model.modelId },
      thinkingLevel: draft.thinkingLevel || null,
      systemPrompt: draft.systemPromptMode === "pi-default"
        ? { mode: "pi-default" }
        : { mode: "replace", text: draft.systemPromptText.trim() },
      customInstructions: parseLongAgentInstructions(draft.customInstructionsText),
      tools,
      resources,
    },
  };
}

export function LongAgentSettingsPanel({ agents, initialAgentId, onBack, onSaved }: Props) {
  const { t } = useI18n();
  const pageRef = useDialogFocus<HTMLElement>(() => back());
  const [agentId, setAgentId] = useState(
    initialAgentId && agents.some((agent) => agent.id === initialAgentId)
      ? initialAgentId
      : agents[0]?.id ?? "",
  );
  const [document, setDocument] = useState<LongAgentConfigurationDocument | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const [projects, setProjects] = useState<readonly ChatProjectSummary[]>([]);
  const [modelCatalog, setModelCatalog] = useState<ChatModelCatalog | null>(null);
  const [resourceCatalog, setResourceCatalog] = useState<ProjectResourceCatalog | null>(null);
  const [resourceCatalogError, setResourceCatalogError] = useState<string | null>(null);
  const [toolCatalog, setToolCatalog] = useState<readonly ChatToolCatalogEntry[] | null>(null);
  const [toolCatalogError, setToolCatalogError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<WorkflowAgentInspection | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [skillTree, setSkillTree] = useState<SkillTreeResponse | null>(null);
  const [skillTreeError, setSkillTreeError] = useState<string | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("runtime");
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
    void Promise.all([
      fetchChatProjects(controller.signal),
      fetchChatModelCatalog(controller.signal),
    ]).then(([nextProjects, nextModels]) => {
      setProjects(nextProjects);
      setModelCatalog(nextModels);
    }).catch((cause: unknown) => {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const defaultProjectId = document?.agent.defaultProjectId;
    if (!defaultProjectId) return;
    const controller = new AbortController();
    setResourceCatalog(null);
    setResourceCatalogError(null);
    setToolCatalog(null);
    setToolCatalogError(null);
    setSkillTree(null);
    setSkillTreeError(null);
    void fetchChatSkillTree(defaultProjectId, controller.signal)
      .then(setSkillTree)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setSkillTreeError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    void fetchProjectResourceCatalog(defaultProjectId, controller.signal)
      .then(setResourceCatalog)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setResourceCatalogError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    void fetchChatTools(defaultProjectId, controller.signal)
      .then((response) => setToolCatalog(
        response.tools.filter((tool) => tool.address.startsWith("system:tool/")),
      ))
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setToolCatalogError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => controller.abort();
  }, [document?.agent.defaultProjectId]);

  const load = useCallback(async (selectedAgentId: string, signal?: AbortSignal) => {
    if (!selectedAgentId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    setInspection(null);
    setInspectionError(null);
    try {
      const next = await fetchLongAgentConfiguration(selectedAgentId, signal);
      const nextDraft = draftFrom(next);
      setDocument(next);
      setDraft(nextDraft);
      setInitialDraft(nextDraft);
      // 生效装配与配置同源读取：失败只影响只读展示区，不影响配置编辑。
      void fetchLongAgentInspection(selectedAgentId, next.agent.defaultProjectId, signal)
        .then(setInspection)
        .catch((cause: unknown) => {
          if (!(cause instanceof DOMException && cause.name === "AbortError")) {
            setInspectionError(cause instanceof Error ? cause.message : String(cause));
          }
        });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setDocument(null);
        setDraft(null);
        setInitialDraft(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const runLifecycle = useCallback(async (action: "archive" | "restore" | "delete") => {
    if (action === "archive" && !window.confirm(t("longAgent.archiveConfirm"))) return;
    if (action === "delete" && !window.confirm(t("longAgent.deleteConfirm"))) return;
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
    return () => controller.abort();
  }, [agentId, load]);

  const selectAgent = (nextAgentId: string) => {
    if (nextAgentId === agentId) return;
    if (hasUnsavedChanges && !window.confirm(t("longAgentSettings.discardConfirm"))) return;
    setTabDirty(false);
    setAgentId(nextAgentId);
  };
  const back = () => {
    if (hasUnsavedChanges && !window.confirm(t("longAgentSettings.discardConfirm"))) return;
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
    if (draft.modelKey && !modelCatalog?.models.some((model) => (
      `${model.provider}/${model.modelId}` === draft.modelKey
    ))) {
      setError(t("longAgentSettings.modelUnavailable"));
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await saveLongAgentConfiguration(
        document.agent.id,
        document.revision,
        updateFromDraft(document, draft, modelCatalog),
      );
      const nextDraft = draftFrom(next);
      setDocument(next);
      setDraft(nextDraft);
      setInitialDraft(nextDraft);
      setNotice(t("longAgentSettings.saved"));
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const selectedSummary = agents.find((agent) => agent.id === agentId) ?? null;
  const modelOptions = useMemo(() => modelCatalog?.models ?? [], [modelCatalog]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => current === null ? current : { ...current, [key]: value });
  };
  const toggleToolAddress = (address: string, checked: boolean) => {
    if (!draft) return;
    const addresses = new Set(draft.toolAddresses);
    if (checked) addresses.add(address);
    else addresses.delete(address);
    set("toolAddresses", [...addresses]);
  };
  /**
   * Skill 树勾选：勾中 = 写入该 Agent 配置并默认生效，未勾 = 仅存在的实体。
   * 继承模式下首次改动会切换为“明确选择”，并按当前生效装配冻结 Skills、
   * Extensions 和 Plugins，避免隐式丢掉其他资源。
   */
  const toggleSkillPath = (filePath: string, checked: boolean) => {
    if (!draft) return;
    const currentPaths = draft.resourceMode === "explicit"
      ? lines(draft.skillPathsText)
      : (inspection?.skills.map((skill) => skill.filePath) ?? []);
    const next = new Set(currentPaths);
    if (checked) next.add(filePath);
    else next.delete(filePath);
    if (draft.resourceMode === "explicit") {
      set("skillPathsText", [...next].join("\n"));
      return;
    }
    setDraft({
      ...draft,
      resourceMode: "explicit",
      skillPathsText: [...next].join("\n"),
      extensionPathsText: (inspection?.extensions.map((extension) => extension.resolvedPath) ?? []).join("\n"),
      pluginSourcesText: (inspection?.plugins.map((plugin) => plugin.source) ?? []).join("\n"),
    });
  };
  const isSkillChecked = (filePath: string): boolean => {
    if (!draft) return false;
    if (draft.resourceMode === "explicit") return lines(draft.skillPathsText).includes(filePath);
    return inspection?.skills.some((skill) => skill.filePath === filePath) ?? false;
  };
  const skillSelectionDisabled = saving || (draft?.resourceMode === "inherit" && inspection === null);

  const toggleResourcePath = (
    key: "skillPathsText" | "extensionPathsText" | "pluginSourcesText",
    value: string,
    checked: boolean,
  ) => {
    if (!draft) return;
    const current = new Set(lines(draft[key]));
    if (checked) current.add(value);
    else current.delete(value);
    set(key, [...current].join("\n"));
  };
  const tabs = [
    { id: "runtime", label: t("longAgentSettings.runtimeTab"), icon: IconSettings },
    { id: "tasks", label: t("longAgentSettings.tasksTab"), icon: IconClock },
    { id: "duties", label: t("longAgentSettings.dutiesTab"), icon: IconBook2 },
    { id: "deliverables", label: t("longAgentSettings.deliverablesTab"), icon: IconSend },
    { id: "activity", label: t("longAgentSettings.activityTab"), icon: IconActivity },
    { id: "conversations", label: t("longAgentSettings.conversationsTab"), icon: IconMessages },
    { id: "agent-group", label: t("longAgentSettings.agentGroupTab"), icon: IconUsersGroup },
    { id: "agent-memory", label: t("longAgentSettings.agentMemoryTab"), icon: IconBrain },
  ] as const;
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const current = tabs.findIndex((tab) => tab.id === activeTab);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    if (tabDirty && !window.confirm(t("longAgentSettings.discardConfirm"))) return;
    setTabDirty(false);
    setActiveTab(tabs[next].id);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]");
    buttons[next]?.focus();
  };
  const selectTab = (nextTab: SettingsTab) => {
    if (nextTab === activeTab) return;
    if (tabDirty && !window.confirm(t("longAgentSettings.discardConfirm"))) return;
    setTabDirty(false);
    setActiveTab(nextTab);
  };

  return createPortal(
    <section
      ref={pageRef}
      className={`${styles.page} configuration-dialog`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="long-agent-settings-title"
    >
      <header className={styles.pageHeader}>
        <button type="button" className={styles.backButton} onClick={back}>
          <IconArrowLeft size={18} stroke={1.8} aria-hidden="true" />
          {t("longAgentSettings.back")}
        </button>
        <div className={styles.titleGroup}>
          <h1 id="long-agent-settings-title">{t("longAgentSettings.title")}</h1>
          <p>{t("longAgentSettings.subtitle")}</p>
        </div>
        {selectedSummary !== null && (
          <>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={saving || lifecycleBusy}
              onClick={() => void runLifecycle(selectedSummary.status === "archived" ? "restore" : "archive")}
            >
              {selectedSummary.status === "archived" ? t("longAgent.restore") : t("longAgent.archive")}
            </button>
            {selectedSummary.status === "archived" && (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={saving || lifecycleBusy}
                onClick={() => void runLifecycle("delete")}
              >
                {t("longAgent.delete")}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void load(agentId)}
          disabled={loading || saving}
        >
          <IconRefresh size={16} stroke={1.8} aria-hidden="true" />
          {t("common.refresh")}
        </button>
      </header>

      <div className={styles.workspace}>
        <nav className={styles.agentNav} aria-label={t("longAgentSettings.agentList")}>
          <div className={styles.navHeading}>
            <strong>{t("longAgentSettings.agents")}</strong>
            <span>{agents.length}</span>
          </div>
          <div className={styles.agentList}>
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={agent.id === agentId ? styles.activeAgent : styles.agentItem}
                onClick={() => selectAgent(agent.id)}
                aria-current={agent.id === agentId ? "page" : undefined}
              >
                <span className={styles.agentItemName}>{agent.name}</span>
                <span className={styles.agentItemMeta}>
                  {agent.available ? t("longAgentSettings.enabled") : t("longAgentSettings.disabled")}
                </span>
              </button>
            ))}
          </div>
        </nav>

        <main className={styles.main}>
          {loading ? (
            <div className={styles.state} role="status">{t("longAgentSettings.loading")}</div>
          ) : error && (!document || !draft) ? (
            <div className={styles.state} role="alert">
              <strong>{t("longAgentSettings.loadFailed")}</strong>
              <span>{error}</span>
              <button type="button" className={styles.secondaryButton} onClick={() => void load(agentId)}>
                {t("longAgentSettings.retry")}
              </button>
            </div>
          ) : document && draft ? (
            <div className={styles.settingsShell}>
              <div className={styles.agentHeading}>
                <div>
                  <span className={styles.eyebrow}>{selectedSummary?.id ?? document.agent.id}</span>
                  <h2>{draft.name}</h2>
                </div>
                {activeTab === "runtime" && (
                  <label className={styles.enabledControl}>
                    <input type="checkbox" checked={draft.enabled} onChange={(event) => set("enabled", event.target.checked)} />
                    <span>{draft.enabled ? t("longAgentSettings.enabled") : t("longAgentSettings.disabled")}</span>
                  </label>
                )}
              </div>

              <div className={styles.settingsTabs} role="tablist" aria-label={t("longAgentSettings.sections")} onKeyDown={handleTabKeyDown}>
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      id={`long-agent-${tab.id}-tab`}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      aria-controls={`long-agent-${tab.id}-panel`}
                      tabIndex={activeTab === tab.id ? 0 : -1}
                      className={activeTab === tab.id ? styles.activeSettingsTab : styles.settingsTab}
                      onClick={() => selectTab(tab.id)}
                    >
                      <Icon size={17} aria-hidden="true" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div
                id={`long-agent-${activeTab}-panel`}
                role="tabpanel"
                aria-labelledby={`long-agent-${activeTab}-tab`}
                className={styles.tabPanel}
              >
                {activeTab === "runtime" && (
                  <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
                    <div className={styles.sourceLine}>
                      <span>{t("longAgentSettings.chatSource")}</span>
                      <span>{t("longAgentSettings.nextTurnEffective")}</span>
                    </div>
                    {notice && <div className={styles.notice} role="status">{notice}</div>}
                    {error && <div className={styles.error} role="alert">{error}</div>}

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.identity")}</legend>
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
                        <label>{t("longAgentSettings.defaultProject")}<select value={draft.defaultProjectId} onChange={(event) => set("defaultProjectId", event.target.value)}>{!projects.some((project) => project.projectId === draft.defaultProjectId) && <option value={draft.defaultProjectId}>{draft.defaultProjectId}</option>}{projects.map((project) => <option key={project.projectId} value={project.projectId} disabled={!project.available}>{project.cachedName} · {project.projectId}</option>)}</select></label>
                      </div>
                      <label>{t("longAgentSettings.description")}<textarea value={draft.description} rows={3} maxLength={500} onChange={(event) => set("description", event.target.value)} /></label>
                    </fieldset>

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.runtime")}</legend>
                      <dl className={styles.facts}>
                        <dt>{t("longAgentSettings.effectiveModel")}</dt>
                        <dd>
                          {document.agent.effective.model
                            ? `${document.agent.effective.model.provider}/${document.agent.effective.model.modelId}`
                            : t("longAgentSettings.modelSourceUnresolved")}
                          {document.agent.effective.modelSource && ` · ${document.agent.effective.modelSource === "explicit"
                            ? t("longAgentSettings.modelSourceExplicit")
                            : t("longAgentSettings.modelSourceChatDefault")}`}
                        </dd>
                        <dt>{t("longAgentSettings.effectiveThinking")}</dt>
                        <dd>
                          {document.agent.effective.thinkingLevel ?? t("longAgentSettings.modelSourceUnresolved")}
                          {document.agent.effective.thinkingSource && ` · ${document.agent.effective.thinkingSource === "explicit"
                            ? t("longAgentSettings.modelSourceExplicit")
                            : t("longAgentSettings.modelSourceChatDefault")}`}
                        </dd>
                      </dl>
                      <div className={styles.twoColumns}>
                        <label>{t("longAgentSettings.model")}<select value={draft.modelKey} onChange={(event) => set("modelKey", event.target.value)}><option value="">{t("longAgentSettings.projectDefaultModel")}{document.agent.effective.model && document.agent.effective.modelSource === "chat-default"
                          ? `（${document.agent.effective.model.provider}/${document.agent.effective.model.modelId}）`
                          : ""}</option>{draft.modelKey && !modelOptions.some((model) => `${model.provider}/${model.modelId}` === draft.modelKey) && <option value={draft.modelKey}>{draft.modelKey} · {t("longAgentSettings.unavailable")}</option>}{modelOptions.map((model) => <option key={`${model.provider}/${model.modelId}`} value={`${model.provider}/${model.modelId}`} disabled={!model.authConfigured}>{model.name} · {model.modelId}{model.authConfigured ? "" : ` · ${t("longAgentSettings.notAuthenticated")}`}</option>)}</select></label>
                        <label>{t("longAgentSettings.thinking")}<select value={draft.thinkingLevel} onChange={(event) => set("thinkingLevel", event.target.value)}><option value="">{t("longAgentSettings.modelDefault")}{document.agent.effective.thinkingLevel && document.agent.effective.thinkingSource === "chat-default"
                          ? `（${document.agent.effective.thinkingLevel}）`
                          : ""}</option>{(modelCatalog?.thinkingLevels ?? []).map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
                      </div>
                      <label>{t("longAgentSettings.systemPrompt")}<select value={draft.systemPromptMode} onChange={(event) => set("systemPromptMode", event.target.value as Draft["systemPromptMode"])}><option value="pi-default">{t("longAgentSettings.piDefaultPrompt")}</option><option value="replace">{t("longAgentSettings.replacePrompt")}</option></select></label>
                      {draft.systemPromptMode === "replace" && <label>{t("longAgentSettings.systemPromptText")}<textarea value={draft.systemPromptText} rows={8} onChange={(event) => set("systemPromptText", event.target.value)} /></label>}
                      <label>{t("longAgentSettings.responseTemplate")}<textarea rows={3} value={draft.responseTemplateText} placeholder={"project：{{project}}"} onChange={(event) => set("responseTemplateText", event.target.value)} /><span className={styles.fieldHint}>{t("longAgentSettings.responseTemplateHint")}</span></label>
                      <label>{t("longAgentSettings.customInstructions")}<textarea value={draft.customInstructionsText} rows={8} placeholder={t("longAgentSettings.instructionSeparator", { separator: LONG_AGENT_INSTRUCTION_SEPARATOR })} onChange={(event) => set("customInstructionsText", event.target.value)} /><span className={styles.fieldHint}>{t("longAgentSettings.instructionSeparator", { separator: LONG_AGENT_INSTRUCTION_SEPARATOR })}</span></label>
                    </fieldset>

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.chatTools")}</legend>
                      <label>{t("longAgentSettings.toolMode")}<select value={draft.toolMode} onChange={(event) => set("toolMode", event.target.value as Draft["toolMode"])}><option value="pi-default">{t("longAgentSettings.piDefaultTools")}</option><option value="explicit">{t("longAgentSettings.explicitTools")}</option><option value="none">{t("longAgentSettings.noTools")}</option></select></label>
                      <p className={styles.help}>{t("longAgentSettings.chatToolsHelp")}</p>
                      {toolCatalogError && <div className={styles.error} role="alert">{toolCatalogError}</div>}
                      <div className={styles.checkGrid}>
                        {(toolCatalog ?? []).map((tool) => {
                          const labelKey = CHAT_TOOL_LABEL_KEYS[tool.address];
                          return (
                            <label key={tool.address} className={styles.checkCard}>
                              <input type="checkbox" checked={draft.toolAddresses.includes(tool.address)} disabled={draft.toolMode === "none"} onChange={(event) => toggleToolAddress(tool.address, event.target.checked)} />
                              <span><strong>{labelKey === undefined ? tool.label || tool.name : t(labelKey)}</strong><code>{tool.address}</code></span>
                            </label>
                          );
                        })}
                        {draft.toolAddresses
                          .filter((address) => !(toolCatalog ?? []).some((tool) => tool.address === address))
                          .map((address) => (
                            <label key={address} className={styles.checkCard}>
                              <input type="checkbox" checked disabled={draft.toolMode === "none"} onChange={(event) => toggleToolAddress(address, event.target.checked)} />
                              <span><strong>{address}</strong><code>{t("longAgentSettings.toolUnavailable")}</code></span>
                            </label>
                          ))}
                      </div>
                      {draft.toolMode === "explicit" && <div className={styles.twoColumns}><label>{t("longAgentSettings.toolNames")}<textarea rows={4} value={draft.toolNamesText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("toolNamesText", event.target.value)} /></label><label>{t("longAgentSettings.excludedToolNames")}<textarea rows={4} value={draft.excludedToolNamesText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("excludedToolNamesText", event.target.value)} /></label></div>}
                    </fieldset>

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.skillSelection")}</legend>
                      <p className={styles.help}>{t("longAgentSettings.skillSelectionHint")}</p>
                      {skillTreeError && <div className={styles.error} role="alert">{skillTreeError}</div>}
                      {skillTree === null && skillTreeError === null && <small>{t("longAgentSettings.inspectionLoading")}</small>}
                      {skillTree !== null && (
                        <div className={styles.checkGrid}>
                          {([
                            { key: "personal", label: t("longAgentSettings.skillOwnerPersonal"), entries: skillTree.personal.skills },
                            ...skillTree.projects.map((project) => ({
                              key: `project:${project.projectId}`,
                              label: `${t("longAgentSettings.skillOwnerProject")} · ${project.name}${project.projectId === document.agent.defaultProjectId ? ` · ${t("skillsTree.currentBadge")}` : ""}`,
                              entries: project.skills,
                            })),
                            ...skillTree.workflows.flatMap((workflow) => workflow.agents.map((agent) => ({
                              key: `workflow:${workflow.workflowId}/${agent.agentId}`,
                              label: `${t("longAgentSettings.skillOwnerWorkflow")} · ${workflow.name} / ${agent.name}`,
                              entries: agent.skills,
                            }))),
                            ...skillTree.longAgents.map((agent) => ({
                              key: `long-agent:${agent.longAgentId}`,
                              label: `${t("longAgentSettings.skillOwnerLongAgent")} · ${agent.name}${agent.longAgentId === document.agent.id ? ` · ${t("skillsTree.currentBadge")}` : ""}`,
                              entries: agent.skills,
                            })),
                          ] as const).map((group) => (
                            <div key={group.key} className={styles.skillTreeGroup}>
                              <small className={styles.skillTreeOwner}>{group.label}</small>
                              {group.entries.length === 0
                                ? <small className={styles.skillTreeOwner}>{t("skillsTree.empty")}</small>
                                : group.entries.map((entry: SkillTreeEntry) => (
                                    <label key={entry.filePath} className={styles.checkCard} title={entry.filePath}>
                                      <input
                                        type="checkbox"
                                        checked={isSkillChecked(entry.filePath)}
                                        disabled={skillSelectionDisabled}
                                        onChange={(event) => toggleSkillPath(entry.filePath, event.target.checked)}
                                      />
                                      <span><strong>{entry.name}</strong><code>{entry.description || entry.filePath}</code></span>
                                    </label>
                                  ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </fieldset>

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.resources")}</legend>
                      <label>{t("longAgentSettings.resourceMode")}<select value={draft.resourceMode} onChange={(event) => set("resourceMode", event.target.value as Draft["resourceMode"])}><option value="inherit">{t("longAgentSettings.inheritResources")}</option><option value="explicit">{t("longAgentSettings.explicitResources")}</option></select></label>
                      {draft.resourceMode === "explicit" && (
                        <div className={styles.resourcePicker}>
                          <p className={styles.help}>{t("longAgentSettings.resourceCatalogHint")}</p>
                          {resourceCatalogError && <div className={styles.error} role="alert">{resourceCatalogError}</div>}
                          <h4>Extensions</h4>
                          {resourceCatalog !== null && resourceCatalog.extensions.length > 0 ? (
                            <div className={styles.checkGrid}>
                              {resourceCatalog.extensions.map((extension) => (
                                <label key={extension.path} className={styles.checkCard}>
                                  <input
                                    type="checkbox"
                                    checked={lines(draft.extensionPathsText).includes(extension.path)}
                                    onChange={(event) => toggleResourcePath("extensionPathsText", extension.path, event.target.checked)}
                                  />
                                  <span><strong>{extension.name}</strong><code>{extension.path}</code></span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <small>{t("longAgentSettings.resourceCatalogEmpty")}</small>
                          )}
                          <h4>Plugins</h4>
                          {resourceCatalog !== null && resourceCatalog.plugins.length > 0 ? (
                            <div className={styles.checkGrid}>
                              {resourceCatalog.plugins.map((plugin) => (
                                <label key={`${plugin.scope}:${plugin.source}`} className={styles.checkCard}>
                                  <input
                                    type="checkbox"
                                    checked={lines(draft.pluginSourcesText).includes(plugin.source)}
                                    onChange={(event) => toggleResourcePath("pluginSourcesText", plugin.source, event.target.checked)}
                                  />
                                  <span><strong>{plugin.source}</strong><code>{plugin.scope} · {plugin.status} · {plugin.skills} Skills · {plugin.extensions} Extensions</code></span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <small>{t("longAgentSettings.resourceCatalogEmpty")}</small>
                          )}
                          <div className={styles.resourceGrid}><label>Skills<textarea rows={4} value={draft.skillPathsText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("skillPathsText", event.target.value)} /></label><label>Extensions<textarea rows={4} value={draft.extensionPathsText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("extensionPathsText", event.target.value)} /></label><label>Plugins<textarea rows={4} value={draft.pluginSourcesText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("pluginSourcesText", event.target.value)} /></label></div>
                        </div>
                      )}
                    </fieldset>

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.channel")}</legend>
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

                    <div className={styles.actions}>
                      <span>{dirty ? t("longAgentSettings.unsaved") : t("longAgentSettings.savedState")}</span>
                      <button type="button" className={styles.secondaryButton} disabled={!dirty || saving} onClick={() => { if (initialDraft) setDraft(initialDraft); }}>{t("longAgentSettings.reset")}</button>
                      <button type="submit" className={styles.primaryButton} disabled={!dirty || saving}>{saving ? t("common.saving") : t("common.save")}</button>
                    </div>
                  </form>
                )}
                {activeTab === "runtime" && (
                  <section className={styles.section} aria-label={t("longAgentSettings.effectiveAssembly")}>
                    <h3>{t("longAgentSettings.effectiveAssembly")}</h3>
                    {inspectionError && <div className={styles.error} role="alert">{inspectionError}</div>}
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
                  </section>
                )}
                {activeTab === "tasks" && <LongAgentTasksSettings longAgentId={document.agent.id} />}
                {activeTab === "duties" && <LongAgentDutiesSettings longAgentId={document.agent.id} />}
                {activeTab === "deliverables" && <LongAgentDeliverablesSettings longAgentId={document.agent.id} />}
                {activeTab === "activity" && <LongAgentActivitySettings longAgentId={document.agent.id} />}
                {activeTab === "conversations" && <LongAgentConversationsPanel longAgentId={document.agent.id} agents={agents.map((agent) => ({ id: agent.id, name: agent.name }))} />}
                {activeTab === "agent-group" && <LongAgentGroupSettings longAgentId={document.agent.id} onDirtyChange={setTabDirty} />}
                {activeTab === "agent-memory" && <LongAgentMemorySettings longAgentId={document.agent.id} onDirtyChange={setTabDirty} />}
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </section>,
    window.document.body,
  );
}
