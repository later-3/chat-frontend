"use client";

import { translateWorkflowCopy } from "@/lib/i18n/workflow-copy";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useI18n } from "@/hooks/useI18n";
import { ConfigurationSection } from "./ConfigurationSection";
import { ModelSelection, ThinkingSelection } from "./ModelSelection";

import { SurfaceDialog } from "./SurfaceDialog";
import { Button } from "./ui/Button";
import { IconCheck, IconChevronRight, IconCircleCheck, IconEye, IconInfoCircle, IconRestore, IconRobot, IconX } from "@tabler/icons-react";
import { useEffect, useId, useMemo, useState } from "react";
import type {
  AgentConfigSelection,
  AgentGenerationConfig,
  WorkflowAgentToolPolicy,
  WorkflowAgentResources,
} from "@/lib/chat-workflow-contract";
import { parseAgentConfigSelection } from "@/lib/chat-workflow-contract";
import {
  clearChatAgentResourceConfig,
  clearChatAgentToolConfig,
  clearChatAgentModelConfig,
  fetchChatModelCatalog,
  inspectChatWorkflowAgent,
  inspectChatWorkflowAgentCatalog,
  saveChatAgentModelConfig,
  saveChatAgentResourceConfig,
  saveChatAgentToolConfig,
  type ChatModelCatalog,
  type ChatWorkflowSummary,
  type WorkflowAgentInspection,
} from "@/lib/chat-workflows-browser";
import {
  fetchPromptResource,
  fetchPromptResources,
  promptResourceAddress,
  type PromptResource,
} from "@/lib/prompt-resources-browser";
import type { PromptResourceProposal } from "@/hooks/useAgentSession";
import { EffectiveSkillsList } from "./EffectiveSkillsList";

interface Props {
  readonly selectionScope?: "session" | "default";
  readonly workflow: ChatWorkflowSummary;
  readonly projectId: string;
  readonly cwd: string;
  readonly configs: Record<string, AgentConfigSelection>;
  readonly proposals: readonly PromptResourceProposal[];
  readonly onConfigsChange: (configs: Record<string, AgentConfigSelection>) => void;
  readonly onClose: () => void;
}

function lines(value: readonly string[] | undefined): string {
  return value?.join("\n") ?? "";
}

function parseLines(value: string): string[] {
  return [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))];
}

/** Key-order-independent comparison so drafts and baselines compare by content, not insertion order. */
function stableValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${key}:${stableValue((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function ResourceCheckbox({
  label,
  detail,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="workflow-agent-resource-option">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </label>
  );
}

function InspectionDetails({ inspection }: { inspection: WorkflowAgentInspection }) {
  const { t: tr } = useI18n();
  return (
    <div className="workflow-agent-inspection">
      <section>
        <h3>{tr("interface.effective.agent")}</h3>
        <dl className="workflow-agent-facts">
          <dt>{tr("interface.model")}</dt>
          <dd>{inspection.agent.effectiveModel
            ? `${inspection.agent.effectiveModel.provider}/${inspection.agent.effectiveModel.modelId}`
            : tr("interface.not.resolved")}</dd>
          <dt>{tr("interface.thinking.level")}</dt><dd>{tr(`design.thinking.${inspection.agent.effectiveThinkingLevel}`)}</dd>
          <dt>{tr("workflowSettings.generationTitle")}</dt>
          <dd>{formatGeneration(inspection.agent.effectiveGeneration, tr)}
            {inspection.agent.generationSource !== null && ` · ${tr(MODEL_SOURCE_LABELS[inspection.agent.generationSource] ?? inspection.agent.generationSource)}`}</dd>
          <dt>{tr("interface.default.configuration")}</dt><dd>{inspection.agent.configPath ?? tr("interface.built.in.definition")}</dd>
          <dt>{tr("interface.configuration.sources")}</dt>
          <dd>{inspection.agent.sources.map((source) => source.path ?? source.kind).join(" → ")}</dd>
        </dl>
      </section>

      <details open>
        <summary>{tr("interface.system.prompt.sent.to.the.model")}</summary>
        <pre>{inspection.prompt.final}</pre>
      </details>
      <details>
        <summary>{tr("inspection.promptComposition", { appended: inspection.prompt.append.length, files: inspection.prompt.contextFiles.length })}</summary>
        <div className="workflow-agent-detail-list">
          {inspection.prompt.append.map((item, index) => (
            <article key={`${item.sourcePath ?? "inline"}-${index}`}>
              <strong>{tr("inspection.appendedSection", { number: index + 1 })}</strong>
              <small>{item.sourcePath ?? tr("interface.inline.content")}</small>
              <pre>{item.text}</pre>
            </article>
          ))}
          {inspection.prompt.contextFiles.map((item) => (
            <article key={item.path}>
              <strong>{tr("interface.project.context")}</strong><small>{item.path}</small><pre>{item.content}</pre>
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>{tr("inspection.resources", { count: inspection.promptResources.length })}</summary>
        <div className="workflow-agent-detail-list">
          {inspection.promptResources.map((resource) => (
            <article key={`${promptResourceAddress(resource.target, resource.id)}:${resource.revision}`}>
              <strong>{resource.title}</strong>
              <small>{resource.kind === "rule" ? tr("interface.rule") : tr("interface.experience")} · {promptResourceAddress(resource.target, resource.id)} · v{resource.revision}</small>
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>{tr("inspection.tools", { active: inspection.tools.filter((tool) => tool.active).length, total: inspection.tools.length })}</summary>
        <div className="workflow-agent-chip-list">
          {inspection.tools.map((tool) => (
            <span
              key={tool.name}
              className={tool.active ? "active" : ""}
              title={tr("inspection.toolSource", { description: tool.description, address: tool.address ?? tool.name, source: tool.sourceInfo.source, scope: tool.sourceInfo.scope, origin: tool.sourceInfo.origin })}
            >
              {tool.name}
            </span>
          ))}
        </div>
      </details>
      <details>
        <summary>{tr("inspection.skills", { count: inspection.skills.length })}</summary>
        <div className="workflow-agent-detail-list">
          {inspection.skills.map((skill) => (
            <article key={skill.filePath}>
              <strong>{skill.name}</strong><small>{skill.address ?? skill.filePath}</small>
              <p>{skill.description}</p>
              <pre>{skill.content ?? skill.error ?? tr("interface.no.content.to.display")}</pre>
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>{tr("inspection.extensions", { count: inspection.extensions.length })}</summary>
        <div className="workflow-agent-detail-list">
          {inspection.extensions.map((extension) => (
            <article key={extension.resolvedPath}>
              <strong>{extension.resolvedPath.split("/").pop()}</strong><small>{extension.address ?? extension.resolvedPath}</small>
              <p>{tr("interface.tools.5")}{extension.capabilities.tools.join(", ") || tr("interface.none")}<br />{tr("interface.commands")}{extension.capabilities.commands.join(", ") || tr("interface.none")}<br />{tr("interface.events")}{extension.capabilities.eventHandlers.join(", ") || tr("interface.none")}
              </p>
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>{tr("inspection.plugins", { count: inspection.plugins.length })}</summary>
        <div className="workflow-agent-detail-list">
          {inspection.plugins.map((plugin) => (
            <article key={`${plugin.scope}:${plugin.source}`}>
              <strong>{plugin.source}</strong><small>{plugin.scope}</small>
              <p>{plugin.skills.length}{tr("interface.skills.2")}{plugin.extensions.length}{tr("interface.extensions.3")}{plugin.prompts.length}{tr("interface.prompts")}</p>
            </article>
          ))}
        </div>
      </details>
      {inspection.diagnostics.length > 0 && (
        <section className="workflow-agent-diagnostics">
          <h3>{tr("interface.diagnostics")}</h3>
          {inspection.diagnostics.map((diagnostic, index) => (
            <p key={`${diagnostic.path ?? diagnostic.resource}-${index}`}>{diagnostic.type}: {diagnostic.message}</p>
          ))}
        </section>
      )}
    </div>
  );
}

function RuntimeCapabilities({ inspection }: { inspection: WorkflowAgentInspection }) {
  const { t: tr } = useI18n();
  const activeTools = inspection.tools.filter((tool) => tool.active);
  return (
    <section className="workflow-agent-runtime-capabilities">
      <div>
        <strong>{tr("interface.effective.capabilities")}</strong>
        <small>{tr("interface.resolved.through.the.same.backend.path.used.for.execution")}</small>
      </div>
      <dl className="workflow-agent-facts">
        <dt>{tr("interface.tools")}</dt>
        <dd>{activeTools.map((tool) => tool.name).join("、") || tr("interface.none")}</dd>
      </dl>
      <EffectiveSkillsList
        skills={inspection.skills}
        labels={{
          title: tr("interface.effective.skills.by.source"),
          empty: tr("interface.no.effective.skills"),
          owners: { agent: tr("interface.agent.owned"), personal: tr("interface.chat.system"), project: tr("interface.current.project"), plugin: tr("interface.plugin"), injected: tr("interface.workflow.or.runtime") },
        }}
      />
    </section>
  );
}

const MODEL_SOURCE_LABELS: Record<string, string> = {
  durable: "interface.saved.in.this.project",
  "config-file": "interface.configuration.file",
  "workflow-default": "interface.workflow.default",
  "chat-default": "interface.chat.default",
  selection: "workflowSettings.sourceSelection",
};

/** Renders the effective generation values; all-absent means the agent inherits upstream defaults. */
function formatGeneration(generation: AgentGenerationConfig | null, tr: (key: string, params?: Record<string, string | number>) => string): string {
  if (!generation) return tr("workflowSettings.inheritsDefault");
  const parts: string[] = [];
  if (generation.temperature !== undefined) parts.push(`Temperature ${generation.temperature}`);
  if (generation.topP !== undefined) parts.push(`Top-P ${generation.topP}`);
  if (generation.maxOutputTokens !== undefined) parts.push(`≤${generation.maxOutputTokens.toLocaleString()} tokens`);
  return parts.length > 0 ? parts.join(" · ") : tr("workflowSettings.inheritsDefault");
}

/**
 * Controlled three-field generation editor shared by every scope. Empty inputs mean
 * "inherit"; the writer decides the storage shape (`undefined` drops the field for
 * selections, `null` clears it through the durable model-config API). Invalid input
 * never reaches onChange; the message surfaces through onError into the footer.
 */
function GenerationConfigSection({ value, inherited, maxTokensHint, disabled = false, onChange, onError }: {
  value: AgentGenerationConfig | null;
  inherited: AgentGenerationConfig | null;
  maxTokensHint: number | null;
  disabled?: boolean;
  onChange: (next: AgentGenerationConfig | null) => void;
  onError: (message: string | null) => void;
}) {
  const { t: tr } = useI18n();
  const fieldId = useId();
  const [temperature, setTemperature] = useState(value?.temperature === undefined ? "" : String(value.temperature));
  const [topP, setTopP] = useState(value?.topP === undefined ? "" : String(value.topP));
  const [maxTokens, setMaxTokens] = useState(value?.maxOutputTokens === undefined ? "" : String(value.maxOutputTokens));
  const serialized = JSON.stringify(value ?? null);
  // Resync local strings when the stored value changes (undo, scope switch, save),
  // but skip when the strings already represent the same numbers ("0.70" vs 0.7).
  useEffect(() => {
    const same = (local: string, saved: number | undefined) => local.trim() === "" ? saved === undefined : Number(local) === saved;
    const current = value ?? undefined;
    if (same(temperature, current?.temperature) && same(topP, current?.topP) && same(maxTokens, current?.maxOutputTokens)) return;
    setTemperature(current?.temperature === undefined ? "" : String(current.temperature));
    setTopP(current?.topP === undefined ? "" : String(current.topP));
    setMaxTokens(current?.maxOutputTokens === undefined ? "" : String(current.maxOutputTokens));
  }, [serialized]); // eslint-disable-line react-hooks/exhaustive-deps -- value identity is captured by serialized

  const emit = (nextTemperature: string, nextTopP: string, nextMaxTokens: string) => {
    const temperatureValue = nextTemperature.trim() === "" ? undefined : Number(nextTemperature);
    if (temperatureValue !== undefined && (!Number.isFinite(temperatureValue) || temperatureValue < 0 || temperatureValue > 2)) {
      onError(tr("workflowSettings.errorTemperature"));
      return;
    }
    const topPValue = nextTopP.trim() === "" ? undefined : Number(nextTopP);
    if (topPValue !== undefined && (!Number.isFinite(topPValue) || topPValue < 0 || topPValue > 1)) {
      onError(tr("workflowSettings.errorTopP"));
      return;
    }
    const maxTokensValue = nextMaxTokens.trim() === "" ? undefined : Number(nextMaxTokens);
    if (maxTokensValue !== undefined && (!Number.isInteger(maxTokensValue) || maxTokensValue < 1 || maxTokensValue > 32000)) {
      onError(tr("workflowSettings.errorMaxTokens"));
      return;
    }
    onError(null);
    if (temperatureValue === undefined && topPValue === undefined && maxTokensValue === undefined) {
      onChange(null);
      return;
    }
    onChange({
      ...(temperatureValue === undefined ? {} : { temperature: temperatureValue }),
      ...(topPValue === undefined ? {} : { topP: topPValue }),
      ...(maxTokensValue === undefined ? {} : { maxOutputTokens: maxTokensValue }),
    });
  };

  const restoreInheritance = () => {
    setTemperature("");
    setTopP("");
    setMaxTokens("");
    onError(null);
    onChange(null);
  };

  return (
    <>
      <div className="workflow-section-heading workflow-section-separated">
        <div>
          <h3>{tr("workflowSettings.generationTitle")}</h3>
          <p>{tr("workflowSettings.generationHint")}</p>
        </div>
        <button type="button" className="workflow-text-button muted" disabled={disabled} onClick={restoreInheritance}>
          <IconRestore size={14} aria-hidden="true" />{tr("workflowSettings.restoreInheritance")}
        </button>
      </div>
      <div className="workflow-parameter-grid">
        <div className="workflow-parameter">
          <label htmlFor={`${fieldId}-temperature`}>{tr("workflowSettings.temperatureLabel")} <span>{tr("workflowSettings.temperatureTag")}</span></label>
          <div className="workflow-number-wrap">
            <input id={`${fieldId}-temperature`} type="number" inputMode="decimal" step="0.1" min="0" max="2" disabled={disabled}
              value={temperature}
              placeholder={inherited?.temperature !== undefined
                ? tr("workflowSettings.inheritWithValue", { value: String(inherited.temperature) })
                : tr("workflowSettings.inheritPlaceholder")}
              onChange={(event) => { setTemperature(event.target.value); emit(event.target.value, topP, maxTokens); }} />
            <span>0 — 2</span>
          </div>
          <p>{tr("workflowSettings.temperatureHelp")}</p>
        </div>
        <div className="workflow-parameter">
          <label htmlFor={`${fieldId}-top-p`}>{tr("workflowSettings.topPLabel")} <span>{tr("workflowSettings.topPTag")}</span></label>
          <div className="workflow-number-wrap">
            <input id={`${fieldId}-top-p`} type="number" inputMode="decimal" step="0.05" min="0" max="1" disabled={disabled}
              value={topP}
              placeholder={inherited?.topP !== undefined
                ? tr("workflowSettings.inheritWithValue", { value: String(inherited.topP) })
                : tr("workflowSettings.inheritPlaceholder")}
              onChange={(event) => { setTopP(event.target.value); emit(temperature, event.target.value, maxTokens); }} />
            <span>0 — 1</span>
          </div>
          <p>{tr("workflowSettings.topPHelp")}</p>
        </div>
      </div>
      <div className="workflow-output-row">
        <div>
          <label htmlFor={`${fieldId}-max-tokens`}>{tr("workflowSettings.maxTokens")}</label>
          <p>{tr("workflowSettings.maxTokensHelp", { limit: (maxTokensHint ?? 32000).toLocaleString() })}</p>
        </div>
        <div className="workflow-number-wrap budget">
          <input id={`${fieldId}-max-tokens`} type="number" inputMode="numeric" min="1" max={maxTokensHint ?? 32000} disabled={disabled}
            value={maxTokens}
            placeholder={inherited?.maxOutputTokens !== undefined
              ? tr("workflowSettings.inheritWithValue", { value: inherited.maxOutputTokens.toLocaleString() })
              : tr("workflowSettings.inheritPlaceholder")}
            onChange={(event) => { setMaxTokens(event.target.value); emit(temperature, topP, event.target.value); }} />
          <span>tokens</span>
        </div>
      </div>
    </>
  );
}

/**
 * Model/thinking/generation bound to one AgentConfigSelection draft (session scope
 * in project sessions, assistant-default scope in the assistant entry). Clears are
 * expressed by omitting the field so the draft never stores explicit undefined.
 */
function SelectionModelSection({ inspection, modelCatalog, selection, onCatalogChanged, onChange, onGenerationError }: {
  inspection: WorkflowAgentInspection;
  modelCatalog: ChatModelCatalog | null;
  selection: AgentConfigSelection | undefined;
  onCatalogChanged: () => void;
  onChange: (patch: Partial<AgentConfigSelection>) => void;
  onGenerationError: (message: string | null) => void;
}) {
  const { t: tr } = useI18n();
  const catalogModels = modelCatalog?.models ?? [];
  const selectedModelKey = selection?.model ? `${selection.model.provider}/${selection.model.modelId}` : "";
  const effectiveModelKey = inspection.agent.effectiveModel
    ? `${inspection.agent.effectiveModel.provider}/${inspection.agent.effectiveModel.modelId}`
    : undefined;
  const activeModelKey = selectedModelKey || effectiveModelKey || "";
  const activeCatalogModel = catalogModels.find((model) => `${model.provider}/${model.modelId}` === activeModelKey) ?? null;
  const levels = activeCatalogModel?.thinkingLevels ?? [];
  const inheritedGeneration = inspection.agent.generationSource === "selection" ? null : inspection.agent.effectiveGeneration;

  const applyModel = (key: string) => {
    if (key === "") {
      onChange({ model: undefined });
      return;
    }
    const model = catalogModels.find((item) => `${item.provider}/${item.modelId}` === key);
    if (model !== undefined) onChange({ model: { provider: model.provider, modelId: model.modelId } });
  };

  return (
    <section className="workflow-agent-runtime-capabilities">
      <div>
        <strong>{tr("workflowSettings.runModel")}</strong>
        <small>{selectedModelKey ? tr("workflowSettings.scopeOverrideActive") : tr("workflowSettings.inheritsFromDefaults")}</small>
      </div>
      <div className="configuration-model-fields">
        <ModelSelection
          models={catalogModels}
          value={selectedModelKey}
          inheritedModelKey={effectiveModelKey}
          onChange={applyModel}
          inheritLabel={tr("interface.use.workflow.default")}
          disabled={modelCatalog === null}
          onCatalogChanged={onCatalogChanged}
        />
        <ThinkingSelection
          value={selection?.thinkingLevel ?? ""}
          levels={levels}
          onChange={(level) => onChange({ thinkingLevel: level === "" ? undefined : level })}
          inheritLabel={tr("interface.use.workflow.default")}
          disabled={modelCatalog === null}
        />
      </div>
      <GenerationConfigSection
        value={selection?.generation ?? null}
        inherited={inheritedGeneration}
        maxTokensHint={activeCatalogModel?.maxTokens ?? null}
        disabled={modelCatalog === null}
        onChange={(next) => onChange({ generation: next ?? undefined })}
        onError={onGenerationError}
      />
    </section>
  );
}

/**
 * Project-scoped durable model configuration. The selects bind to the persisted
 * override (`durableConfig`), never to the merged definition, so choosing the
 * Workflow default clears only that one field and keeps the other override.
 */
function ModelConfigSection({
  workflow,
  agentId,
  projectId,
  inspection,
  modelCatalog,
  onConfigChanged,
  onGenerationError,
}: {
  workflow: ChatWorkflowSummary;
  agentId: string;
  projectId: string;
  inspection: WorkflowAgentInspection;
  modelCatalog: ChatModelCatalog | null;
  onConfigChanged: () => void;
  onGenerationError: (message: string | null) => void;
}) {
  const { t: tr } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const durableModel = inspection.agent.durableConfig?.model ?? null;
  const durableThinking = inspection.agent.durableConfig?.thinkingLevel ?? "";
  const durableGeneration = inspection.agent.durableConfig?.generation ?? null;
  const hasDurableConfig = durableModel !== null || durableThinking !== "" || durableGeneration !== null;
  const catalogModels = modelCatalog?.models ?? [];
  const durableModelKey = durableModel === null ? "" : `${durableModel.provider}/${durableModel.modelId}`;
  const activeModelKey = durableModelKey
    || (inspection.agent.effectiveModel ? `${inspection.agent.effectiveModel.provider}/${inspection.agent.effectiveModel.modelId}` : "");
  const activeCatalogModel = catalogModels.find((model) => `${model.provider}/${model.modelId}` === activeModelKey) ?? null;
  const inheritedGeneration = inspection.agent.generationSource === "selection" ? null : inspection.agent.effectiveGeneration;

  const apply = async (
    input: {
      model?: { provider: string; modelId: string } | null;
      thinkingLevel?: string | null;
      generation?: AgentGenerationConfig | null;
    } | "clear",
  ) => {
    setBusy(true);
    setError(null);
    try {
      if (input === "clear") await clearChatAgentModelConfig(workflow.id, agentId, projectId);
      else await saveChatAgentModelConfig(workflow.id, agentId, projectId, input);
      onConfigChanged();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const applyModel = (key: string) => {
    if (key === "") {
      if (durableModel !== null) void apply({ model: null });
      return;
    }
    const model = catalogModels.find((item) => `${item.provider}/${item.modelId}` === key);
    if (model !== undefined) void apply({ model: { provider: model.provider, modelId: model.modelId } });
  };
  const applyThinking = (level: string) => {
    if (level === "") {
      if (durableThinking !== "") void apply({ thinkingLevel: null });
      return;
    }
    void apply({ thinkingLevel: level });
  };
  const applyGeneration = (next: AgentGenerationConfig | null) => {
    void apply({ generation: next });
  };

  return (
    <section className="workflow-agent-runtime-capabilities">
      <div>
        <strong>{tr("interface.model.configuration")}</strong>
        <small>
          {hasDurableConfig
            ? tr("interface.this.project.has.overrides.choose.use.workflow.default.to.restore.inheritance.for.a.field")
            : tr("interface.inherits.workflow.defaults.changes.apply.only.to.this.project")}
        </small>
      </div>
      <div className="configuration-model-fields">
      <ModelSelection models={catalogModels} value={durableModelKey} inheritedModelKey={inspection.agent.effectiveModel ? `${inspection.agent.effectiveModel.provider}/${inspection.agent.effectiveModel.modelId}` : undefined} onChange={applyModel} inheritLabel={tr("interface.use.workflow.default")} disabled={busy || modelCatalog === null} onCatalogChanged={() => onConfigChanged()} />
      <ThinkingSelection value={durableThinking} onChange={applyThinking} inheritLabel={tr("interface.use.workflow.default")} disabled={busy || modelCatalog === null}
        levels={catalogModels.find(model => `${model.provider}/${model.modelId}` === activeModelKey)?.thinkingLevels ?? []} />
      </div>
      <GenerationConfigSection
        value={durableGeneration}
        inherited={inheritedGeneration}
        maxTokensHint={activeCatalogModel?.maxTokens ?? null}
        disabled={busy || modelCatalog === null}
        onChange={applyGeneration}
        onError={onGenerationError}
      />
      <dl className="workflow-agent-facts">
        <dt>{tr("interface.effective.model")}</dt>
        <dd>{inspection.agent.effectiveModel
          ? `${inspection.agent.effectiveModel.provider}/${inspection.agent.effectiveModel.modelId}`
          : tr("interface.not.resolved")}
          {inspection.agent.modelSource !== null && ` · ${tr(MODEL_SOURCE_LABELS[inspection.agent.modelSource] ?? inspection.agent.modelSource)}`}</dd>
        <dt>{tr("interface.effective.thinking.level")}</dt>
        <dd>{tr(`design.thinking.${inspection.agent.effectiveThinkingLevel}`)}
          {inspection.agent.thinkingSource !== null && ` · ${tr(MODEL_SOURCE_LABELS[inspection.agent.thinkingSource] ?? inspection.agent.thinkingSource)}`}</dd>
        <dt>{tr("workflowSettings.generationTitle")}</dt>
        <dd>{formatGeneration(inspection.agent.effectiveGeneration, tr)}
          {inspection.agent.generationSource !== null && ` · ${tr(MODEL_SOURCE_LABELS[inspection.agent.generationSource] ?? inspection.agent.generationSource)}`}</dd>
      </dl>

      <Button variant="secondary" type="button" disabled={busy || !hasDurableConfig} onClick={() => void apply("clear")}>{tr("interface.reset.model.and.thinking.level")}</Button>
      {error && <small className="workflow-agent-model-error" role="alert"><InterfaceFeedback message={error} /></small>}
    </section>
  );
}

function ToolConfigSection({
  workflow,
  agentId,
  projectId,
  inspection,
  catalog,
  onConfigChanged,
}: {
  workflow: ChatWorkflowSummary;
  agentId: string;
  projectId: string;
  inspection: WorkflowAgentInspection;
  catalog: WorkflowAgentInspection;
  onConfigChanged: () => void;
}) {
  const { t: tr } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const durableTools = inspection.agent.durableConfig?.tools;
  const effectiveTools = durableTools ?? inspection.agent.tools;
  const systemTools = catalog.tools.filter((tool) => tool.address?.startsWith("system:tool/") === true);
  const piTools = catalog.tools.filter((tool) => tool.address?.startsWith("system:tool/") !== true);
  const selectedAddresses = effectiveTools.mode === "none" ? [] : effectiveTools.addresses ?? [];
  const selectedNames = effectiveTools.mode === "explicit" ? effectiveTools.names : [];

  const apply = async (tools: WorkflowAgentToolPolicy | "clear") => {
    setBusy(true);
    setError(null);
    try {
      if (tools === "clear") await clearChatAgentToolConfig(workflow.id, agentId, projectId);
      else await saveChatAgentToolConfig(workflow.id, agentId, projectId, tools);
      onConfigChanged();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const withAddresses = (addresses: readonly string[]): WorkflowAgentToolPolicy => {
    if (effectiveTools.mode === "none") {
      return { mode: "explicit", names: [], exclude: [], addresses };
    }
    return { ...effectiveTools, addresses };
  };

  const setMode = (mode: WorkflowAgentToolPolicy["mode"]) => {
    if (mode === "none") void apply({ mode: "none" });
    else if (mode === "pi-default") void apply({ mode, addresses: selectedAddresses });
    else {
      void apply({
        mode,
        names: effectiveTools.mode === "explicit" ? effectiveTools.names : [],
        exclude: effectiveTools.mode === "explicit" ? effectiveTools.exclude : [],
        addresses: selectedAddresses,
      });
    }
  };

  const toggleAddress = (address: string, checked: boolean) => {
    const addresses = new Set(selectedAddresses);
    if (checked) addresses.add(address);
    else addresses.delete(address);
    void apply(withAddresses([...addresses]));
  };

  const toggleName = (name: string, checked: boolean) => {
    const names = new Set(selectedNames);
    const exclude = new Set(effectiveTools.mode === "explicit" ? effectiveTools.exclude : []);
    if (checked) {
      names.add(name);
      exclude.delete(name);
    } else {
      names.delete(name);
    }
    void apply({ mode: "explicit", names: [...names], exclude: [...exclude], addresses: selectedAddresses });
  };

  const systemSelected = systemTools.filter((tool) => selectedAddresses.includes(tool.address as string)).length;
  const piSelected = effectiveTools.mode === "pi-default"
    ? piTools.length
    : piTools.filter((tool) => selectedNames.includes(tool.name)).length;

  return (
    <section className="workflow-agent-runtime-capabilities">
      <div>
        <strong>{tr("interface.tool.configuration")}</strong>
        <small>{tr("interface.tools.come.from.the.backend.catalog.selections.are.saved.in.this.project.s.agent.configuration")}{durableTools === undefined ? tr("interface.using.workflow.defaults") : tr("interface.this.project.has.overrides")}
        </small>
      </div>
      <label>{tr("interface.pi.tool.policy")}<select value={effectiveTools.mode} disabled={busy} onChange={(event) => setMode(event.target.value as WorkflowAgentToolPolicy["mode"])}>
          <option value="pi-default">{tr("interface.pi.default.tools")}</option>
          <option value="explicit">{tr("interface.explicit.selection")}</option>
          <option value="none">{tr("interface.no.tools")}</option>
        </select>
      </label>
      <div className="workflow-agent-resource-groups workflow-resource-rows">
        <h3>{tr("interface.chat.system.tools")}<span className="workflow-count-label">{systemSelected}/{systemTools.length}</span></h3>
        {systemTools.map((tool) => {
          const address = tool.address as string;
          return (
            <ResourceCheckbox
              key={address}
              label={tool.name}
              detail={`${address} · ${tool.risk ?? "unknown"} · ${(tool.permissions ?? []).join(", ") || tr("interface.no.declared.permissions")}`}
              checked={selectedAddresses.includes(address)}
              disabled={busy || effectiveTools.mode === "none"}
              onChange={(checked) => toggleAddress(address, checked)}
            />
          );
        })}
        <h3>{tr("interface.pi.and.project.tools")}<span className="workflow-count-label">{piSelected}/{piTools.length}</span></h3>
        {piTools.map((tool) => (
          <ResourceCheckbox
            key={tool.name}
            label={tool.name}
            detail={`${tool.address ?? tool.name} · ${tool.sourceInfo.scope}/${tool.sourceInfo.origin}`}
            checked={effectiveTools.mode === "pi-default" || selectedNames.includes(tool.name)}
            disabled={busy || effectiveTools.mode !== "explicit"}
            onChange={(checked) => toggleName(tool.name, checked)}
          />
        ))}
        {effectiveTools.mode === "pi-default" && (
          <small>{tr("interface.the.default.policy.enables.pi.tools.and.defaults.from.loaded.extensions.choose.explicit.selection.to.configure.each.tool")}</small>
        )}
      </div>
      <Button variant="secondary" type="button" disabled={busy || durableTools === undefined} onClick={() => void apply("clear")}>{tr("interface.restore.workflow.default.tools")}</Button>
      {error && <small className="workflow-agent-model-error" role="alert"><InterfaceFeedback message={error} /></small>}
    </section>
  );
}

function ResourceConfigSection({
  workflow,
  agentId,
  projectId,
  inspection,
  catalog,
  onConfigChanged,
}: {
  workflow: ChatWorkflowSummary;
  agentId: string;
  projectId: string;
  inspection: WorkflowAgentInspection;
  catalog: WorkflowAgentInspection;
  onConfigChanged: () => void;
}) {
  const { t: tr } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const durableResources = inspection.agent.durableConfig?.resources;
  const effectiveResources = durableResources ?? inspection.agent.resources;

  const apply = async (resources: WorkflowAgentResources | "clear") => {
    setBusy(true);
    setError(null);
    try {
      if (resources === "clear") await clearChatAgentResourceConfig(workflow.id, agentId, projectId);
      else await saveChatAgentResourceConfig(workflow.id, agentId, projectId, resources);
      onConfigChanged();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const setMode = (mode: WorkflowAgentResources["mode"]) => {
    if (mode === "inherit") {
      void apply({ mode: "inherit" });
      return;
    }
    // 切换到明确选择时冻结当前生效装配，避免隐式丢掉 Extension 或 Plugin。
    void apply({
      mode: "explicit",
      skillPaths: inspection.skills.map((skill) => skill.filePath),
      extensionPaths: inspection.extensions.map((extension) => extension.resolvedPath),
      pluginSources: inspection.plugins.map((plugin) => plugin.source),
    });
  };

  const toggle = (
    key: "skillPaths" | "extensionPaths" | "pluginSources",
    value: string,
    checked: boolean,
  ) => {
    if (effectiveResources.mode !== "explicit") return;
    const values = new Set(effectiveResources[key]);
    if (checked) values.add(value);
    else values.delete(value);
    void apply({ ...effectiveResources, [key]: [...values] });
  };

  return (
    <section className="workflow-agent-runtime-capabilities">
      <div>
        <strong>{tr("interface.skills.and.resources")}</strong>
        <small>{tr("interface.saved.to.this.project.and.applied.from.the.next.run")}{durableResources === undefined ? tr("interface.using.workflow.defaults") : tr("interface.this.project.has.overrides")}
          {effectiveResources.mode === "inherit" && tr("interface.selecting.an.item.while.inheriting.keeps.the.current.effective.selection.then.switches.to.explicit.selection")}
        </small>
      </div>
      <label>{tr("interface.resource.policy")}<select
          value={effectiveResources.mode}
          disabled={busy}
          onChange={(event) => setMode(event.target.value as WorkflowAgentResources["mode"])}
        >
          <option value="inherit">{tr("interface.inherit.pi.and.project.resources")}</option>
          <option value="explicit">{tr("interface.explicit.selection")}</option>
        </select>
      </label>
      {effectiveResources.mode === "explicit" && (
        <div className="workflow-agent-resource-groups workflow-resource-rows">
          <h3>{tr("interface.skills")}<span className="workflow-count-label">{effectiveResources.skillPaths.length}</span></h3>
          {catalog.skills.map((skill) => (
            <ResourceCheckbox
              key={skill.filePath}
              label={skill.name}
              detail={skill.filePath}
              checked={effectiveResources.skillPaths.includes(skill.filePath)}
              disabled={busy}
              onChange={(checked) => toggle("skillPaths", skill.filePath, checked)}
            />
          ))}
          <h3>{tr("interface.extensions")}<span className="workflow-count-label">{effectiveResources.extensionPaths.length}</span></h3>
          {catalog.extensions.map((extension) => (
            <ResourceCheckbox
              key={extension.resolvedPath}
              label={extension.resolvedPath.split("/").pop() ?? extension.resolvedPath}
              detail={extension.resolvedPath}
              checked={effectiveResources.extensionPaths.includes(extension.resolvedPath)}
              disabled={busy}
              onChange={(checked) => toggle("extensionPaths", extension.resolvedPath, checked)}
            />
          ))}
          <h3>{tr("interface.plugins")}<span className="workflow-count-label">{effectiveResources.pluginSources.length}</span></h3>
          {catalog.plugins.map((plugin) => (
            <ResourceCheckbox
              key={`${plugin.scope}:${plugin.source}`}
              label={plugin.source}
              detail={tr("inspection.pluginContents", { skills: plugin.skills.length, extensions: plugin.extensions.length, prompts: plugin.prompts.length })}
              checked={effectiveResources.pluginSources.includes(plugin.source)}
              disabled={busy}
              onChange={(checked) => toggle("pluginSources", plugin.source, checked)}
            />
          ))}
        </div>
      )}
      <Button variant="secondary" type="button" disabled={busy || durableResources === undefined} onClick={() => void apply("clear")}>{tr("interface.restore.workflow.default.resources")}</Button>
      {error && <small className="workflow-agent-model-error" role="alert"><InterfaceFeedback message={error} /></small>}
    </section>
  );
}

type ConfigTab = "model" | "prompt" | "tools";

const CONFIG_TABS: readonly { readonly id: ConfigTab; readonly label: string }[] = [
  { id: "model", label: "workflowSettings.tabModel" },
  { id: "prompt", label: "workflowSettings.tabPrompt" },
  { id: "tools", label: "workflowSettings.tabTools" },
];

type ConfigScope = "session" | "assistant" | "project";

export function WorkflowAgentConfigDialog({ workflow, projectId, cwd, configs, proposals, onConfigsChange, onClose, selectionScope = "session" }: Props) {
  const { t: tr } = useI18n();
  const panelId = useId();
  const [selectedNodeId, setSelectedNodeId] = useState(workflow.nodes.find(node => node.kind === "agent")?.id ?? "");
  const [agentId, setAgentId] = useState(workflow.nodes.find(node => node.kind === "agent")?.agentId ?? workflow.agents[0]?.id ?? "");
  const [tab, setTab] = useState<ConfigTab>("model");
  const [scope, setScope] = useState<ConfigScope>(selectionScope === "default" ? "assistant" : "session");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspection, setInspection] = useState<WorkflowAgentInspection | null>(null);
  const [catalog, setCatalog] = useState<WorkflowAgentInspection | null>(null);
  const [promptQuery, setPromptQuery] = useState("");
  const [promptResources, setPromptResources] = useState<PromptResource[]>([]);
  const [modelCatalog, setModelCatalog] = useState<ChatModelCatalog | null>(null);
  const [modelConfigVersion, setModelConfigVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Baseline of the session-scope drafts at dialog open; powers 撤销修改 and the dirty count.
  const [baseline, setBaseline] = useState<Record<string, AgentConfigSelection>>(configs);
  const [footerNotice, setFooterNotice] = useState<string | null>(null);
  const [footerError, setFooterError] = useState<string | null>(null);
  const agent = workflow.agents.find((candidate) => candidate.id === agentId) ?? workflow.agents[0];
  const selection = agent === undefined ? undefined : configs[agent.id];
  const selectionKey = JSON.stringify(selection ?? {});
  const node = agent === undefined ? undefined : workflow.nodes.find((candidate) => candidate.kind === "agent" && candidate.agentId === agent.id);
  /** The configs draft is writable for the session scope in project sessions and the assistant-default scope in the assistant entry. */
  const configsEditable = (scope === "session" && selectionScope === "session") || (scope === "assistant" && selectionScope === "default");
  const showSessionActions = selectionScope === "session" && scope === "session";

  useEffect(() => {
    const controller = new AbortController();
    void fetchChatModelCatalog(controller.signal)
      .then((catalog) => setModelCatalog(catalog))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => controller.abort();
  }, [modelConfigVersion]);

  useEffect(() => {
    if (agent === undefined) return;
    const controller = new AbortController();
    setInspection(null);
    setCatalog(null);
    setLoading(true);
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void Promise.all([
        inspectChatWorkflowAgent(workflow.id, agent.id, projectId, cwd, selection, controller.signal),
        inspectChatWorkflowAgentCatalog(workflow.id, agent.id, projectId, cwd, controller.signal),
      ]).then(([resolved, available]) => {
        if (controller.signal.aborted) return;
        setInspection(resolved);
        setCatalog(available);
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [agent, cwd, projectId, selectionKey, modelConfigVersion, workflow.id]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchPromptResources(projectId, "", controller.signal)
      .then(async (visible) => {
        const byAddress = new Map(visible.map((resource) => [
          promptResourceAddress(resource.target, resource.id),
          resource,
        ]));
        const selected = selection?.promptResources ?? [];
        await Promise.all(selected.map(async (item) => {
          const address = promptResourceAddress(item.target, item.id);
          if (byAddress.has(address)) return;
          try {
            const resource = await fetchPromptResource(projectId, item, controller.signal);
            byAddress.set(address, resource);
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
            // Keep an unavailable selected resource visible below so the user can remove it.
          }
        }));
        if (!controller.signal.aborted) setPromptResources([...byAddress.values()]);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => controller.abort();
  }, [projectId, selectionKey, modelConfigVersion]);

  const effectiveResources = useMemo<WorkflowAgentResources>(() => (
    selection?.resources ?? inspection?.agent.resources ?? { mode: "inherit" }
  ), [inspection?.agent.resources, selection?.resources]);

  const visiblePrompts = useMemo(() => {
    const selected = new Set((selection?.promptResources ?? []).map(item => promptResourceAddress(item.target, item.id)));
    return promptResources.filter(resource => `${resource.title} ${resource.purpose} ${resource.id}`.toLocaleLowerCase().includes(promptQuery.trim().toLocaleLowerCase()))
      .sort((a, b) => Number(selected.has(promptResourceAddress(b.target, b.id))) - Number(selected.has(promptResourceAddress(a.target, a.id))));
  }, [promptResources, promptQuery, selection?.promptResources]);

  if (agent === undefined) return null;

  const draft = selection ?? {};
  const savedDraft = baseline[agent.id] ?? {};
  const draftKeys = new Set([...Object.keys(draft), ...Object.keys(savedDraft)]);
  const changedCount = [...draftKeys].filter((key) => (
    stableValue((draft as Record<string, unknown>)[key]) !== stableValue((savedDraft as Record<string, unknown>)[key])
  )).length;

  const updateSelection = (patch: Partial<AgentConfigSelection>) => {
    const next = { ...selection, ...patch } as Record<string, unknown>;
    for (const key of Object.keys(next)) {
      if (next[key] === undefined) delete next[key];
    }
    onConfigsChange({ ...configs, [agent.id]: next as AgentConfigSelection });
    setFooterNotice(null);
    setFooterError(null);
  };
  const changeScope = (next: ConfigScope) => {
    setScope(next);
    setFooterNotice(null);
    setFooterError(null);
  };
  const selectNode = (nextNodeId: string, nextAgentId: string) => {
    setSelectedNodeId(nextNodeId);
    setFooterNotice(null);
    setFooterError(null);
    if (nextAgentId !== agent.id) {
      setInspection(null);
      setCatalog(null);
      setAgentId(nextAgentId);
    }
  };
  const undoChanges = () => {
    onConfigsChange({ ...configs, [agent.id]: savedDraft });
    setFooterError(null);
    setFooterNotice(tr("workflowSettings.undone"));
  };
  const applyToSession = () => {
    try {
      parseAgentConfigSelection(draft);
    } catch (cause: unknown) {
      setFooterNotice(null);
      setFooterError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    setFooterError(null);
    setBaseline((current) => ({ ...current, [agent.id]: draft }));
    setFooterNotice(tr("workflowSettings.appliedToSession"));
  };
  const updateExplicitResources = (
    key: "skillPaths" | "extensionPaths" | "pluginSources",
    value: string,
    checked: boolean,
  ) => {
    const current = effectiveResources.mode === "explicit"
      ? effectiveResources
      : { mode: "explicit" as const, skillPaths: [], extensionPaths: [], pluginSources: [] };
    const values = new Set(current[key]);
    if (checked) values.add(value);
    else values.delete(value);
    updateSelection({ resources: { ...current, [key]: [...values] } });
  };
  const updatePromptResource = (resource: PromptResource, checked: boolean) => {
    const address = promptResourceAddress(resource.target, resource.id);
    const selected = [...(selection?.promptResources ?? [])].filter((item) => (
      promptResourceAddress(item.target, item.id) !== address
    ));
    if (checked) selected.push({ id: resource.id, target: resource.target, selectedBy: "user" });
    updateSelection({ promptResources: selected });
  };
  const removePromptResource = (target: PromptResource["target"], id: string) => {
    updateSelection({
      promptResources: (selection?.promptResources ?? []).filter((item) => (
        promptResourceAddress(item.target, item.id) !== promptResourceAddress(target, id)
      )),
    });
  };

  const scopeHint = tr(
    scope === "session"
      ? "workflowSettings.scopeSessionHint"
      : scope === "assistant"
        ? (selectionScope === "default" ? "workflowSettings.scopeAssistantHint" : "workflowSettings.scopeAssistantReadonlyHint")
        : "workflowSettings.scopeProjectHint",
  );
  const roleLabel = node ? translateWorkflowCopy(workflow.id, node.name, tr) : tr("workflowSettings.standaloneAgent");
  const sourceSuffix = (source: string | null) => source === null ? "" : ` · ${tr(MODEL_SOURCE_LABELS[source] ?? source)}`;
  const effectiveAgent = inspection?.agent ?? null;

  return (
    <SurfaceDialog title={translateWorkflowCopy(workflow.id, workflow.name, tr)}
      description={tr("workflowSettings.subtitle")} onClose={onClose}>
      <div className="workflow-agent-dialog-shell">
        <nav className="workflow-node-navigation" aria-label={tr("interface.workflow.agents")}>
          <div className="workflow-navigation-heading"><span>{tr("design.workflowSteps")}</span><small>{tr("workflowSettings.stepsHint")}</small></div>
          <ol className="workflow-node-list">
            {workflow.nodes.map((item, index) => <li key={item.id}>
              {item.kind === "agent" ? <button type="button" aria-current={item.id === selectedNodeId ? "step" : undefined}
                className={item.id === selectedNodeId ? "active" : ""}
                onClick={() => selectNode(item.id, item.agentId)}>
                <span className="workflow-node-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{translateWorkflowCopy(workflow.id, item.name, tr)}</strong><small>{translateWorkflowCopy(workflow.id, item.description, tr)}</small></span>
              </button> : <div className="workflow-task-node">
                <span className="workflow-node-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{translateWorkflowCopy(workflow.id, item.name, tr)}</strong><small>{tr("workflowSettings.taskNode")}</small></span>
              </div>}
            </li>)}
          </ol>
          {workflow.agents.filter(item => !workflow.nodes.some(node => node.kind === "agent" && node.agentId === item.id)).map(item =>
            <button key={item.id} type="button" aria-current={item.id === agent.id ? "true" : undefined} onClick={() => { setSelectedNodeId(""); setInspection(null); setCatalog(null); setAgentId(item.id); }}>
              <strong>{translateWorkflowCopy(workflow.id, item.name, tr)}</strong>
            </button>)}
          <p className="workflow-navigation-note">{tr("workflowSettings.structureHint")}</p>
        </nav>
        <main>
          <div className="workflow-scope-picker">
            <label className="workflow-scope-control">
              <span>{tr("workflowSettings.scopeLabel")}</span>
              <select value={scope} aria-label={tr("workflowSettings.scopeLabel")} onChange={(event) => changeScope(event.target.value as ConfigScope)}>
                {selectionScope === "session" && <option value="session">{tr("workflowSettings.scopeSession")}</option>}
                <option value="assistant">{tr("workflowSettings.scopeAssistant")}</option>
                <option value="project">{tr("workflowSettings.scopeProject")}</option>
              </select>
            </label>
            <p className="workflow-scope-caption">{scopeHint}</p>
          </div>

          <div className="workflow-node-header">
            <span className="workflow-node-avatar" aria-hidden="true"><IconRobot size={24} /></span>
            <div className="workflow-node-title">
              <div>
                <h2>{translateWorkflowCopy(workflow.id, agent.name, tr)}</h2>
                <span className="workflow-role-tag">{roleLabel}</span>
              </div>
              <p>{translateWorkflowCopy(workflow.id, agent.description, tr)}</p>
            </div>
            <button type="button" className={`workflow-inspect-toggle${inspectorOpen ? " active" : ""}`} aria-pressed={inspectorOpen}
              aria-label={tr("workflowSettings.inspectToggle")} onClick={() => setInspectorOpen((open) => !open)}>
              <IconEye size={19} />
            </button>
          </div>

          <div className="workflow-agent-tabs" role="tablist" aria-label={tr("interface.agent.configuration.sections")}>
            {CONFIG_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`${panelId}-${item.id}`}
                aria-controls={`${panelId}-panel`}
                aria-selected={tab === item.id}
                tabIndex={tab === item.id ? 0 : -1}
                onKeyDown={event => {
                  const index = CONFIG_TABS.findIndex(candidate => candidate.id === tab);
                  const next = event.key === "Home" ? 0 : event.key === "End" ? CONFIG_TABS.length - 1
                    : event.key === "ArrowRight" ? (index + 1) % CONFIG_TABS.length
                    : event.key === "ArrowLeft" ? (index + CONFIG_TABS.length - 1) % CONFIG_TABS.length : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setTab(CONFIG_TABS[next].id);
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
                }}
                className={tab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
              >
                {tr(item.label)}
              </button>
            ))}
          </div>

          {loading && <div className="workflow-agent-loading">{tr("interface.resolving.the.agent.through.pi.s.execution.path")}</div>}
          {error && <div className="workflow-agent-error" role="alert"><InterfaceFeedback message={error} /><Button variant="ghost" onClick={() => setModelConfigVersion(version => version + 1)}>{tr("common.retry")}</Button></div>}

          <div className="workflow-editor-body" role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-${tab}`} tabIndex={0}>
            {tab === "model" && effectiveAgent && (
              <>
                {scope === "project" && (
                  <ModelConfigSection
                    key={`${projectId}:${agent.id}`}
                    workflow={workflow}
                    agentId={agent.id}
                    projectId={projectId}
                    inspection={inspection as WorkflowAgentInspection}
                    modelCatalog={modelCatalog}
                    onConfigChanged={() => setModelConfigVersion((version) => version + 1)}
                    onGenerationError={setFooterError}
                  />
                )}
                {configsEditable && (
                  <SelectionModelSection
                    key={`${scope}:${projectId}:${agent.id}`}
                    inspection={inspection as WorkflowAgentInspection}
                    modelCatalog={modelCatalog}
                    selection={selection}
                    onCatalogChanged={() => setModelConfigVersion((version) => version + 1)}
                    onChange={updateSelection}
                    onGenerationError={setFooterError}
                  />
                )}
                {!configsEditable && scope === "assistant" && (
                  <section className="workflow-agent-runtime-capabilities">
                    <div>
                      <strong>{tr("workflowSettings.scopeAssistant")}</strong>
                      <small>{tr("workflowSettings.assistantReadonlyNote")}</small>
                    </div>
                    <dl className="workflow-agent-facts">
                      <dt>{tr("interface.effective.model")}</dt>
                      <dd>{effectiveAgent.effectiveModel
                        ? `${effectiveAgent.effectiveModel.provider}/${effectiveAgent.effectiveModel.modelId}`
                        : tr("interface.not.resolved")}{sourceSuffix(effectiveAgent.modelSource)}</dd>
                      <dt>{tr("interface.effective.thinking.level")}</dt>
                      <dd>{tr(`design.thinking.${effectiveAgent.effectiveThinkingLevel}`)}{sourceSuffix(effectiveAgent.thinkingSource)}</dd>
                      <dt>{tr("workflowSettings.generationTitle")}</dt>
                      <dd>{formatGeneration(effectiveAgent.effectiveGeneration, tr)}{sourceSuffix(effectiveAgent.generationSource)}</dd>
                    </dl>
                  </section>
                )}
                <button type="button" className="workflow-effective-summary" aria-expanded={inspectorOpen}
                  onClick={() => setInspectorOpen(true)}>
                  <span className="workflow-summary-icon" aria-hidden="true"><IconCircleCheck size={17} /></span>
                  <span>
                    <strong>{tr("workflowSettings.effectiveSummaryTitle")}</strong>
                    <small>{effectiveAgent.effectiveModel
                      ? `${effectiveAgent.effectiveModel.provider}/${effectiveAgent.effectiveModel.modelId}`
                      : tr("interface.not.resolved")}
                      {" · "}{tr(`design.thinking.${effectiveAgent.effectiveThinkingLevel}`)}
                      {" · "}{formatGeneration(effectiveAgent.effectiveGeneration, tr)}</small>
                  </span>
                  <IconChevronRight size={17} />
                </button>
              </>
            )}

            {tab === "prompt" && inspection && (
              <section className="workflow-agent-config-fields">
                <div className="workflow-section-heading">
                  <h3>{tr("workflowSettings.basePromptTitle")}</h3>
                  <span className="workflow-source-label">{inspection.prompt.base.sourcePath ?? tr("workflowSettings.basePromptFromWorkflow")}</span>
                </div>
                <div className="workflow-instruction-preview">
                  <p>{inspection.prompt.base.text ?? (inspection.prompt.base.mode === "pi-default" ? tr("workflowSettings.basePromptPiDefault") : tr("interface.no.content.to.display"))}</p>
                </div>

                {configsEditable && (
                  <div className="workflow-agent-config-actions">
                    <small>{tr(scope === "session" ? "interface.changes.apply.to.this.workflow.agent.in.the.current.session.and.are.submitted.with.the.next.message" : "workflowSettings.defaultSaveHint")}</small>
                    <Button variant="secondary" type="button" onClick={() => onConfigsChange({ ...configs, [agent.id]: {} })}>{tr("interface.restore.workflow.defaults")}</Button>
                  </div>
                )}

                {configsEditable && (
                  <fieldset>
                    <legend>{tr("interface.rule.and.experience.prompts.2")}</legend>
                    <label className="workflow-resource-search">{tr("workflowSettings.searchPrompts")}<input type="search" value={promptQuery} onChange={event => setPromptQuery(event.target.value)} /></label>
                    <div className="workflow-agent-resource-groups workflow-prompt-options">
                      {proposals.filter((proposal) => (
                        proposal.targetWorkflowId === workflow.id
                        && proposal.targetAgentId === agent.id
                        && proposal.resolution === undefined
                      )).map((proposal) => (
                        <article key={proposal.id} className="workflow-agent-prompt-proposal">
                          <strong>{tr("interface.agent.suggestions.awaiting.confirmation")}</strong>
                          <p>{proposal.summary}</p>
                          <small>{proposal.promptResources.map((resource) => resource.reason ?? resource.id).join("；")}</small>
                        </article>
                      ))}
                      {visiblePrompts.map((resource) => {
                        const address = promptResourceAddress(resource.target, resource.id);
                        const selected = selection?.promptResources?.find((item) => (
                          promptResourceAddress(item.target, item.id) === address
                        ));
                        return (
                          <ResourceCheckbox
                            key={address}
                            label={`${resource.title}${selected?.selectedBy === "agent" ? tr("interface..suggested.by.agent") : ""}`}
                            detail={`${address} · ${resource.kind === "rule" ? tr("interface.rule") : tr("interface.experience")} · v${resource.revision}${resource.status === "archived" ? tr("interface..archived") : ""} · ${selected?.reason ?? resource.purpose}`}
                            checked={selected !== undefined}
                            disabled={resource.status === "archived" && selected === undefined}
                            onChange={(checked) => updatePromptResource(resource, checked)}
                          />
                        );
                      })}
                      {(selection?.promptResources ?? []).filter((selected) => (
                        !promptResources.some((resource) => (
                          promptResourceAddress(resource.target, resource.id)
                          === promptResourceAddress(selected.target, selected.id)
                        ))
                      )).map((selected) => {
                        const address = promptResourceAddress(selected.target, selected.id);
                        return (
                          <ResourceCheckbox
                            key={address}
                            label={`${selected.id}${selected.selectedBy === "agent" ? tr("interface..suggested.by.agent") : ""}`}
                            detail={tr("inspection.unavailableResource", { address, reason: selected.reason ?? tr("interface.deselect.this.item.to.reconfigure.it") })}
                            checked
                            onChange={() => removePromptResource(selected.target, selected.id)}
                          />
                        );
                      })}
                      {promptResources.length > 0 && visiblePrompts.length === 0 && <small>{tr("workflowSettings.noMatches")}</small>}
                      {promptResources.length === 0 && <small>{tr("interface.no.active.resources.yet.use.the.rules.and.experiences.workflow.to.create.them.through.conversation")}</small>}
                    </div>
                  </fieldset>
                )}

                {configsEditable && (
                  <ConfigurationSection title={tr("workflowSettings.configFiles")}>
                  <label>{tr("interface.primary.configuration.file")}<input value={selection?.primary ?? ""} placeholder="/path/to/agent.json" onChange={(event) => updateSelection({ primary: event.target.value.trim() || undefined })} /></label>
                  <label>{tr("interface.additional.configuration.files.one.per.line")}<textarea value={lines(selection?.append)} onChange={(event) => updateSelection({ append: parseLines(event.target.value) })} /></label>
                  <label>{tr("interface.additional.prompt.files.one.per.line")}<textarea value={lines(selection?.promptFiles)} onChange={(event) => updateSelection({ promptFiles: parseLines(event.target.value) })} /></label>
                  </ConfigurationSection>
                )}

                <details className="workflow-advanced">
                  <summary>{tr("workflowSettings.advancedTitle")}</summary>
                  <div>
                    <div>
                      <strong>{tr("interface.configuration.sources")}</strong>
                      <small>{inspection.agent.sources.map((source) => source.path ?? source.kind).join(" → ") || tr("interface.none")}</small>
                    </div>
                    {inspection.prompt.append.map((item, index) => (
                      <article key={`${item.sourcePath ?? "inline"}-${index}`}>
                        <strong>{tr("inspection.appendedSection", { number: index + 1 })}</strong>
                        <small>{item.sourcePath ?? tr("interface.inline.content")}</small>
                        <pre>{item.text}</pre>
                      </article>
                    ))}
                    {inspection.prompt.contextFiles.map((item) => (
                      <article key={item.path}>
                        <strong>{tr("interface.project.context")}</strong><small>{item.path}</small><pre>{item.content}</pre>
                      </article>
                    ))}
                  </div>
                </details>
              </section>
            )}

            {tab === "tools" && (
              <>
                {inspection && catalog && (
                  <div className="workflow-resource-section">
                  <ToolConfigSection
                    key={`${projectId}:${agent.id}`}
                    workflow={workflow}
                    agentId={agent.id}
                    projectId={projectId}
                    inspection={inspection}
                    catalog={catalog}
                    onConfigChanged={() => setModelConfigVersion((version) => version + 1)}
                  /></div>
                )}
                {inspection && catalog && (
                  <ConfigurationSection title={tr("design.resourceSettings")}>
                  <ResourceConfigSection
                    key={`${projectId}:${agent.id}`}
                    workflow={workflow}
                    agentId={agent.id}
                    projectId={projectId}
                    inspection={inspection}
                    catalog={catalog}
                    onConfigChanged={() => setModelConfigVersion((version) => version + 1)}
                  /></ConfigurationSection>
                )}
                {inspection && <ConfigurationSection title={tr("design.effectiveCapabilities")}><RuntimeCapabilities inspection={inspection} /></ConfigurationSection>}
                {configsEditable && inspection && catalog && (
                  <ConfigurationSection title={tr(scope === "session" ? "workflowSettings.sessionResourceOverrides" : "longAgentSettings.workflowDefaults")}>
                    <div className="workflow-agent-config-fields">
                      <small>{tr(scope === "session" ? "interface.changes.apply.to.this.workflow.agent.in.the.current.session.and.are.submitted.with.the.next.message" : "workflowSettings.defaultSaveHint")}</small>
                      <fieldset>
                        <legend>{tr("interface.skills.extensions.and.plugins")}</legend>
                        <label className="workflow-agent-resource-mode">
                          <input type="radio" checked={effectiveResources.mode === "inherit"} onChange={() => updateSelection({ resources: { mode: "inherit" } })} />{tr("interface.use.pi.default.resources")}</label>
                        <label className="workflow-agent-resource-mode">
                          <input type="radio" checked={effectiveResources.mode === "explicit"} onChange={() => updateSelection({ resources: { mode: "explicit", skillPaths: [], extensionPaths: [], pluginSources: [] } })} />{tr("interface.select.resources.for.this.agent")}</label>
                        {effectiveResources.mode === "explicit" && (
                          <div className="workflow-agent-resource-groups workflow-resource-rows">
                            <h3>{tr("interface.skills")}<span className="workflow-count-label">{effectiveResources.mode === "explicit" ? effectiveResources.skillPaths.length : 0}</span></h3>
                            {catalog.skills.map((skill) => <ResourceCheckbox key={skill.filePath} label={skill.name} detail={skill.filePath} checked={effectiveResources.mode === "explicit" && effectiveResources.skillPaths.includes(skill.filePath)} onChange={(checked) => updateExplicitResources("skillPaths", skill.filePath, checked)} />)}
                            <h3>{tr("interface.extensions")}<span className="workflow-count-label">{effectiveResources.mode === "explicit" ? effectiveResources.extensionPaths.length : 0}</span></h3>
                            {catalog.extensions.map((extension) => <ResourceCheckbox key={extension.resolvedPath} label={extension.resolvedPath.split("/").pop() ?? extension.resolvedPath} detail={extension.resolvedPath} checked={effectiveResources.mode === "explicit" && effectiveResources.extensionPaths.includes(extension.resolvedPath)} onChange={(checked) => updateExplicitResources("extensionPaths", extension.resolvedPath, checked)} />)}
                            <h3>{tr("interface.plugins")}<span className="workflow-count-label">{effectiveResources.mode === "explicit" ? effectiveResources.pluginSources.length : 0}</span></h3>
                            {catalog.plugins.map((plugin) => <ResourceCheckbox key={`${plugin.scope}:${plugin.source}`} label={plugin.source} detail={tr("inspection.pluginContents", { skills: plugin.skills.length, extensions: plugin.extensions.length, prompts: plugin.prompts.length })} checked={effectiveResources.mode === "explicit" && effectiveResources.pluginSources.includes(plugin.source)} onChange={(checked) => updateExplicitResources("pluginSources", plugin.source, checked)} />)}
                          </div>
                        )}
                      </fieldset>
                    </div>
                  </ConfigurationSection>
                )}
              </>
            )}
          </div>

          {inspectorOpen && inspection && (
            <section className="workflow-inspection-panel" aria-label={tr("workflowSettings.inspectPanelTitle")}>
              <div className="workflow-inspection-heading">
                <h3>{tr("workflowSettings.inspectPanelTitle")}</h3>
                <button type="button" className="workflow-inspect-toggle" aria-label={tr("workflowSettings.inspectClose")} onClick={() => setInspectorOpen(false)}>
                  <IconX size={16} />
                </button>
              </div>
              <RuntimeCapabilities inspection={inspection} />
              <InspectionDetails inspection={inspection} />
            </section>
          )}

          <footer className="workflow-editor-footer">
            <div className="workflow-save-state" aria-live="polite">
              {footerError ? (
                <span className="workflow-status-error"><IconInfoCircle size={16} aria-hidden="true" />{footerError}</span>
              ) : footerNotice ? (
                <span className="workflow-status-success"><IconCheck size={16} aria-hidden="true" />{footerNotice}</span>
              ) : showSessionActions ? (
                <>
                  <span className={changedCount > 0 ? "workflow-dirty-dot" : "workflow-neutral-dot"} aria-hidden="true" />
                  <div>
                    <strong>{changedCount > 0
                      ? tr("workflowSettings.dirtyCount", { count: changedCount })
                      : Object.keys(draft).length === 0 ? tr("workflowSettings.usingDefaults") : tr("workflowSettings.appliedState")}</strong>
                    <small>{scopeHint}</small>
                  </div>
                </>
              ) : (
                <div>
                  <strong>{tr("workflowSettings.savedImmediately")}</strong>
                  <small>{scopeHint}</small>
                </div>
              )}
            </div>
            {showSessionActions && (
              <div className="workflow-footer-actions">
                <Button variant="secondary" type="button" disabled={changedCount === 0} onClick={undoChanges}>{tr("workflowSettings.undoChanges")}</Button>
                <Button variant="primary" type="button" disabled={changedCount === 0} onClick={applyToSession}>{tr("workflowSettings.applyToSession")}</Button>
              </div>
            )}
          </footer>
        </main>
      </div>
    </SurfaceDialog>
  );
}
