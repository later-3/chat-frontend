"use client";
import { LongAgentWorkflowSettings } from "./LongAgentWorkflowSettings";
import { LongAgentActivitySettings } from "./LongAgentActivitySettings";
import { useConfirmation } from "./ui/Confirmation";
import { Button } from "./ui/Button";
import { SurfaceDialog } from "./SurfaceDialog";


import { InterfaceFeedback } from "./InterfaceFeedback";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconBook2, IconBrain, IconClock, IconRefresh, IconSettings } from "@tabler/icons-react";
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
  formatLongAgentInstructions,
  LONG_AGENT_INSTRUCTION_SEPARATOR,
  parseLongAgentInstructions,
} from "@/lib/long-agent-settings";
import styles from "./LongAgentSettingsPanel.module.css";
import { LongAgentAvatarEditor } from "./LongAgentAvatarEditor";
import { LongAgentGroupSettings } from "./LongAgentGroupSettings";
import { LongAgentMemorySettings } from "./LongAgentMemorySettings";
import { LongAgentTasksSettings } from "./LongAgentTasksSettings";
import { LongAgentDutiesSettings } from "./LongAgentDutiesSettings";
import { ConfigurationSection } from "./ConfigurationSection";
import { ConfigurationToggle } from "./ConfigurationToggle";
import { SearchSelect } from "./SearchSelect";

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
  responseTemplateText: string;
  customInstructionsText: string;
}

type SettingsTab = "runtime" | "tasks" | "duties" | "agent-memory";

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
    responseTemplateText: document.agent.responseTemplate ?? "",
    customInstructionsText: formatLongAgentInstructions(definition.customInstructions),
  };
}

function updateFromDraft(
  document: LongAgentConfigurationDocument,
  draft: Draft,
): LongAgentConfigurationUpdate {
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
      model: document.agent.definition.model,
      thinkingLevel: document.agent.definition.thinkingLevel,
      systemPrompt: draft.systemPromptMode === "pi-default"
        ? { mode: "pi-default" }
        : { mode: "replace", text: draft.systemPromptText.trim() },
      customInstructions: parseLongAgentInstructions(draft.customInstructionsText),
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
  const [modelInspectionVersion, setModelInspectionVersion] = useState(0);
  const [inspection, setInspection] = useState<WorkflowAgentInspection | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
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

  const selectAgent = async (nextAgentId: string) => {
    if (nextAgentId === agentId) return;
    if (hasUnsavedChanges && !await confirm(t("longAgentSettings.discardConfirm"), t("common.discard"))) return;
    setTabDirty(false);
    setAgentId(nextAgentId);
  };
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
  const tabDescriptions = {
    runtime: t("assistantDesign.settingsHint"), tasks: t("assistantDesign.scheduleHint"),
    duties: t("assistantDesign.dutiesHint"), "agent-memory": t("assistantDesign.memoryHint"),
  };
  const tabs = [
    { id: "runtime", label: t("longAgentSettings.runtimeTab"), icon: IconSettings },
    { id: "tasks", label: t("longAgentSettings.tasksTab"), icon: IconClock },
    { id: "duties", label: t("longAgentSettings.dutiesTab"), icon: IconBook2 },
    { id: "agent-memory", label: t("longAgentSettings.agentMemoryTab"), icon: IconBrain },
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
  return (<SurfaceDialog title={t("longAgentSettings.title")} description={t("longAgentSettings.subtitle")}
    onClose={requestClose} actions={headerActions}>
    <div className={`${styles.dialog} configuration-dialog`}>
      <div className={styles.workspace}>
        <nav className={styles.agentNav} aria-label={t("longAgentSettings.agentList")}>
          <div className={styles.navIntro}><span>{t("assistantDesign.workspace")}</span><small>{t("assistantDesign.workspaceHint")}</small></div>
          <SearchSelect label={t("longAgentSettings.agentList")} value={agentId}
            options={agents.map(agent => ({ value:agent.id, label:agent.name, detail:agent.available ? t("longAgentSettings.enabled") : t("longAgentSettings.disabled") }))}
            onChange={selectAgent} disabled={saving || lifecycleBusy} />
              <div className={styles.settingsTabs} role="tablist" aria-orientation="vertical" aria-label={t("longAgentSettings.sections")} onKeyDown={handleTabKeyDown}>
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
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
                      <span><strong>{tab.label}</strong><small>{tabDescriptions[tab.id]}</small></span>
                    </button>
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
                  <span className={styles.eyebrow}>{tabs.find(tab => tab.id === activeTab)?.label}</span>
                  <h2>{draft.name}</h2>
                  <p className={styles.headingDescription}>{tabDescriptions[activeTab]}</p>
                </div>
                {activeTab === "runtime" && (
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
                {activeTab === "runtime" && (
                  <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
                    <fieldset className={styles.formFields} disabled={saving}>
                    <div className={styles.sourceLine}>
                      <span>{t("longAgentSettings.chatSource")}</span>
                      <span>{t("longAgentSettings.nextTurnEffective")}</span>
                    </div>
                    {notice && <div className={styles.notice} role="status">{notice}</div>}
                    {error && <div className={styles.error} role="alert"><InterfaceFeedback message={error} /></div>}

                    <fieldset className={styles.section}>
                      <legend>{t("longAgentSettings.identity")}</legend>
                      <p className={styles.help}>{t("assistantDesign.identityHint")}</p>
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

                    <fieldset className={`${styles.section} ${styles.runtimeSection}`}>
                      <legend>{t("longAgentSettings.runtime")}</legend>
                      <LongAgentWorkflowSettings key={document.agent.id} projectId={document.agent.id}
                        cwd={projects.find(project => project.projectId === document.agent.id)?.path ?? ""}
                        onChanged={workflowChanged} />
                      <ConfigurationSection className={styles.disclosure} title={t("design.promptOptions")}>
                      <label>{t("longAgentSettings.systemPrompt")}<select value={draft.systemPromptMode} onChange={(event) => set("systemPromptMode", event.target.value as Draft["systemPromptMode"])}><option value="pi-default">{t("longAgentSettings.piDefaultPrompt")}</option><option value="replace">{t("longAgentSettings.replacePrompt")}</option></select></label>
                      {draft.systemPromptMode === "replace" && <label>{t("longAgentSettings.systemPromptText")}<textarea value={draft.systemPromptText} rows={8} onChange={(event) => set("systemPromptText", event.target.value)} /></label>}
                      <label>{t("longAgentSettings.responseTemplate")}<textarea rows={3} value={draft.responseTemplateText} placeholder={"project：{{project}}"} onChange={(event) => set("responseTemplateText", event.target.value)} /><span className={styles.fieldHint}>{t("longAgentSettings.responseTemplateHint")}</span></label>
                      <label>{t("longAgentSettings.customInstructions")}<textarea value={draft.customInstructionsText} rows={8} placeholder={t("longAgentSettings.instructionSeparator", { separator: LONG_AGENT_INSTRUCTION_SEPARATOR })} onChange={(event) => set("customInstructionsText", event.target.value)} /><span className={styles.fieldHint}>{t("longAgentSettings.instructionSeparator", { separator: LONG_AGENT_INSTRUCTION_SEPARATOR })}</span></label>
                      </ConfigurationSection>
                    </fieldset>

                    <ConfigurationSection className={styles.disclosure} title={t("longAgentSettings.channel")}>
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
                    </ConfigurationSection>

                    <div className={styles.actions}>
                      <span>{dirty ? t("longAgentSettings.unsaved") : t("longAgentSettings.savedState")}</span>
                      <Button variant="secondary" type="button" disabled={!dirty || saving} onClick={() => { if (initialDraft) setDraft(initialDraft); }}>{t("longAgentSettings.reset")}</Button>
                      <Button variant="primary" type="submit" disabled={!dirty || saving}>{saving ? t("common.saving") : t("common.save")}</Button>
                    </div>
                    </fieldset>
                  </form>
                )}
                {activeTab === "runtime" && <ConfigurationSection className={styles.disclosure} title={t("longAgentSettings.groupIdentity")} onToggle={event => { if (event.currentTarget.open) setIdentityOpen(true); }}>
                  {identityOpen && <LongAgentGroupSettings longAgentId={document.agent.id} key={`${document.agent.id}:${refreshVersion}`} onDirtyChange={setTabDirty} />}
                </ConfigurationSection>}
                {activeTab === "runtime" && (
                  <ConfigurationSection className={styles.disclosure} title={t("longAgentSettings.effectiveAssembly")}>
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
                {activeTab === "runtime" && <ConfigurationSection className={styles.disclosure} title={t("longAgentSettings.activityHeading")} onToggle={event => setUsageOpen(event.currentTarget.open)}>{usageOpen && <LongAgentActivitySettings longAgentId={document.agent.id} />}</ConfigurationSection>}
            {activeTab === "tasks" && <LongAgentTasksSettings longAgentId={document.agent.id} />}
                {activeTab === "duties" && <LongAgentDutiesSettings longAgentId={document.agent.id} />}
                {activeTab === "agent-memory" && <LongAgentMemorySettings longAgentId={document.agent.id} key={`${document.agent.id}:${refreshVersion}`} onDirtyChange={setTabDirty} />}
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  </SurfaceDialog>);
}
