"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconArrowLeft, IconBrain, IconRefresh, IconSettings, IconUsersGroup } from "@tabler/icons-react";
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
import type { WorkflowAgentResources, WorkflowAgentToolPolicy } from "@/lib/chat-workflow-contract";
import {
  formatLongAgentInstructions,
  LONG_AGENT_INSTRUCTION_SEPARATOR,
  parseLongAgentInstructions,
} from "@/lib/long-agent-settings";
import styles from "./LongAgentSettingsPanel.module.css";
import { LongAgentGroupSettings } from "./LongAgentGroupSettings";
import { LongAgentMemorySettings } from "./LongAgentMemorySettings";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const CHAT_TOOL_ADDRESSES = [
  { address: "system:tool/memory_search", labelKey: "longAgentSettings.memorySearch" },
  { address: "system:tool/memory_record", labelKey: "longAgentSettings.memoryRecord" },
  { address: "system:tool/workflow_call", labelKey: "longAgentSettings.workflowCall" },
  { address: "system:tool/agent_memory_search", labelKey: "longAgentSettings.agentMemorySearch" },
  { address: "system:tool/agent_memory_read", labelKey: "longAgentSettings.agentMemoryRead" },
  { address: "system:tool/agent_memory_write", labelKey: "longAgentSettings.agentMemoryWrite" },
] as const;

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
  modelKey: string;
  thinkingLevel: string;
  systemPromptMode: "pi-default" | "replace";
  systemPromptText: string;
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

type SettingsTab = "runtime" | "agent-group" | "agent-memory";

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
    modelKey: definition.model === null ? "" : `${definition.model.provider}/${definition.model.modelId}`,
    thinkingLevel: definition.thinkingLevel ?? "",
    systemPromptMode: definition.systemPrompt.mode,
    systemPromptText: definition.systemPrompt.mode === "replace" ? definition.systemPrompt.text : "",
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
    name: draft.name.trim(),
    description: draft.description.trim(),
    enabled: draft.enabled,
    defaultProjectId: draft.defaultProjectId,
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
  const pageRef = useRef<HTMLElement>(null);
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

  const load = useCallback(async (selectedAgentId: string, signal?: AbortSignal) => {
    if (!selectedAgentId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const next = await fetchLongAgentConfiguration(selectedAgentId, signal);
      const nextDraft = draftFrom(next);
      setDocument(next);
      setDraft(nextDraft);
      setInitialDraft(nextDraft);
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
  useEffect(() => {
    const previousFocus = window.document.activeElement instanceof HTMLElement
      ? window.document.activeElement
      : null;
    pageRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previousFocus?.focus();
  }, []);

  const handlePageKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      back();
      return;
    }
    if (event.key !== "Tab" || !pageRef.current) return;
    const focusable = [...pageRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && window.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && window.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const save = async () => {
    if (!document || !draft || saving) return;
    if (!draft.name.trim() || !draft.description.trim()) {
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
  const tabs = [
    { id: "runtime", label: t("longAgentSettings.runtimeTab"), icon: IconSettings },
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
      className={styles.page}
      role="dialog"
      aria-modal="true"
      aria-labelledby="long-agent-settings-title"
      onKeyDown={handlePageKeyDown}
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
                      <div className={styles.twoColumns}>
                        <label>{t("longAgentSettings.name")}<input value={draft.name} maxLength={80} onChange={(event) => set("name", event.target.value)} /></label>
                        <label>{t("longAgentSettings.defaultProject")}<select value={draft.defaultProjectId} onChange={(event) => set("defaultProjectId", event.target.value)}>{!projects.some((project) => project.projectId === draft.defaultProjectId) && <option value={draft.defaultProjectId}>{draft.defaultProjectId}</option>}{projects.map((project) => <option key={project.projectId} value={project.projectId} disabled={!project.available}>{project.cachedName} · {project.projectId}</option>)}</select></label>
                      </div>
                      <label>{t("longAgentSettings.description")}<textarea value={draft.description} rows={3} maxLength={500} onChange={(event) => set("description", event.target.value)} /></label>
                    </fieldset>

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.runtime")}</legend>
                      <div className={styles.twoColumns}>
                        <label>{t("longAgentSettings.model")}<select value={draft.modelKey} onChange={(event) => set("modelKey", event.target.value)}><option value="">{t("longAgentSettings.projectDefaultModel")}</option>{draft.modelKey && !modelOptions.some((model) => `${model.provider}/${model.modelId}` === draft.modelKey) && <option value={draft.modelKey}>{draft.modelKey} · {t("longAgentSettings.unavailable")}</option>}{modelOptions.map((model) => <option key={`${model.provider}/${model.modelId}`} value={`${model.provider}/${model.modelId}`} disabled={!model.authConfigured}>{model.name} · {model.modelId}{model.authConfigured ? "" : ` · ${t("longAgentSettings.notAuthenticated")}`}</option>)}</select></label>
                        <label>{t("longAgentSettings.thinking")}<select value={draft.thinkingLevel} onChange={(event) => set("thinkingLevel", event.target.value)}><option value="">{t("longAgentSettings.modelDefault")}</option>{THINKING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
                      </div>
                      <label>{t("longAgentSettings.systemPrompt")}<select value={draft.systemPromptMode} onChange={(event) => set("systemPromptMode", event.target.value as Draft["systemPromptMode"])}><option value="pi-default">{t("longAgentSettings.piDefaultPrompt")}</option><option value="replace">{t("longAgentSettings.replacePrompt")}</option></select></label>
                      {draft.systemPromptMode === "replace" && <label>{t("longAgentSettings.systemPromptText")}<textarea value={draft.systemPromptText} rows={8} onChange={(event) => set("systemPromptText", event.target.value)} /></label>}
                      <label>{t("longAgentSettings.customInstructions")}<textarea value={draft.customInstructionsText} rows={8} placeholder={t("longAgentSettings.instructionSeparator", { separator: LONG_AGENT_INSTRUCTION_SEPARATOR })} onChange={(event) => set("customInstructionsText", event.target.value)} /><span className={styles.fieldHint}>{t("longAgentSettings.instructionSeparator", { separator: LONG_AGENT_INSTRUCTION_SEPARATOR })}</span></label>
                    </fieldset>

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.chatTools")}</legend>
                      <label>{t("longAgentSettings.toolMode")}<select value={draft.toolMode} onChange={(event) => set("toolMode", event.target.value as Draft["toolMode"])}><option value="pi-default">{t("longAgentSettings.piDefaultTools")}</option><option value="explicit">{t("longAgentSettings.explicitTools")}</option><option value="none">{t("longAgentSettings.noTools")}</option></select></label>
                      <p className={styles.help}>{t("longAgentSettings.chatToolsHelp")}</p>
                      <div className={styles.checkGrid}>
                        {CHAT_TOOL_ADDRESSES.map((tool) => <label key={tool.address} className={styles.checkCard}><input type="checkbox" checked={draft.toolAddresses.includes(tool.address)} disabled={draft.toolMode === "none"} onChange={(event) => toggleToolAddress(tool.address, event.target.checked)} /><span><strong>{t(tool.labelKey)}</strong><code>{tool.address}</code></span></label>)}
                      </div>
                      {draft.toolMode === "explicit" && <div className={styles.twoColumns}><label>{t("longAgentSettings.toolNames")}<textarea rows={4} value={draft.toolNamesText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("toolNamesText", event.target.value)} /></label><label>{t("longAgentSettings.excludedToolNames")}<textarea rows={4} value={draft.excludedToolNamesText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("excludedToolNamesText", event.target.value)} /></label></div>}
                    </fieldset>

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.resources")}</legend>
                      <label>{t("longAgentSettings.resourceMode")}<select value={draft.resourceMode} onChange={(event) => set("resourceMode", event.target.value as Draft["resourceMode"])}><option value="inherit">{t("longAgentSettings.inheritResources")}</option><option value="explicit">{t("longAgentSettings.explicitResources")}</option></select></label>
                      {draft.resourceMode === "explicit" && <div className={styles.resourceGrid}><label>Skills<textarea rows={5} value={draft.skillPathsText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("skillPathsText", event.target.value)} /></label><label>Extensions<textarea rows={5} value={draft.extensionPathsText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("extensionPathsText", event.target.value)} /></label><label>Plugins<textarea rows={5} value={draft.pluginSourcesText} placeholder={t("longAgentSettings.onePerLine")} onChange={(event) => set("pluginSourcesText", event.target.value)} /></label></div>}
                    </fieldset>

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.channel")}</legend>
                      <dl className={styles.facts}>
                        <dt>{t("longAgentSettings.adapter")}</dt><dd>{document.channel.type}</dd>
                        <dt>{t("longAgentSettings.instance")}</dt><dd>{document.channel.instance}</dd>
                        <dt>{t("longAgentSettings.host")}</dt><dd>{document.channel.host.name} · {document.channel.host.id}</dd>
                      </dl>
                      <p className={styles.securityNote}>{t("longAgentSettings.channelCredentialBoundary")}</p>
                    </fieldset>

                    <div className={styles.actions}>
                      <span>{dirty ? t("longAgentSettings.unsaved") : t("longAgentSettings.savedState")}</span>
                      <button type="button" className={styles.secondaryButton} disabled={!dirty || saving} onClick={() => { if (initialDraft) setDraft(initialDraft); }}>{t("longAgentSettings.reset")}</button>
                      <button type="submit" className={styles.primaryButton} disabled={!dirty || saving}>{saving ? t("common.saving") : t("common.save")}</button>
                    </div>
                  </form>
                )}
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
