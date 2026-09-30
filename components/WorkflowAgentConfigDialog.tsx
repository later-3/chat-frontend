"use client";

import { translateWorkflowCopy } from "@/lib/i18n/workflow-copy";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useI18n } from "@/hooks/useI18n";
import { ConfigurationSection } from "./ConfigurationSection";
import { ModelSelection, ThinkingSelection } from "./ModelSelection";

import { SurfaceDialog } from "./SurfaceDialog";
import { Button } from "./ui/Button";
import { useEffect, useId, useMemo, useState } from "react";
import type {
  AgentConfigSelection,
  WorkflowAgentToolPolicy,
  WorkflowAgentResources,
} from "@/lib/chat-workflow-contract";
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
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
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
};

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
}: {
  workflow: ChatWorkflowSummary;
  agentId: string;
  projectId: string;
  inspection: WorkflowAgentInspection;
  modelCatalog: ChatModelCatalog | null;
  onConfigChanged: () => void;
}) {
  const { t: tr } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const durableModel = inspection.agent.durableConfig?.model ?? null;
  const durableThinking = inspection.agent.durableConfig?.thinkingLevel ?? "";
  const hasDurableConfig = durableModel !== null || durableThinking !== "";
  const catalogModels = modelCatalog?.models ?? [];
  const durableModelKey = durableModel === null ? "" : `${durableModel.provider}/${durableModel.modelId}`;

  const apply = async (
    input: {
      model?: { provider: string; modelId: string } | null;
      thinkingLevel?: string | null;
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
        levels={catalogModels.find(model => `${model.provider}/${model.modelId}` === (durableModelKey || (inspection.agent.effectiveModel ? `${inspection.agent.effectiveModel.provider}/${inspection.agent.effectiveModel.modelId}` : "")))?.thinkingLevels ?? []} />
      </div>
      <dl className="workflow-agent-facts">
        <dt>{tr("interface.effective.model")}</dt>
        <dd>{inspection.agent.effectiveModel
          ? `${inspection.agent.effectiveModel.provider}/${inspection.agent.effectiveModel.modelId}`
          : tr("interface.not.resolved")}
          {inspection.agent.modelSource !== null && ` · ${tr(MODEL_SOURCE_LABELS[inspection.agent.modelSource] ?? inspection.agent.modelSource)}`}</dd>
        <dt>{tr("interface.effective.thinking.level")}</dt>
        <dd>{tr(`design.thinking.${inspection.agent.effectiveThinkingLevel}`)}
          {inspection.agent.thinkingSource !== null && ` · ${tr(MODEL_SOURCE_LABELS[inspection.agent.thinkingSource] ?? inspection.agent.thinkingSource)}`}</dd>
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
      <div className="workflow-agent-resource-groups">
        <h3>{tr("interface.chat.system.tools")}</h3>
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
        <h3>{tr("interface.pi.and.project.tools")}</h3>
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
        <div className="workflow-agent-resource-groups">
          <h3>{tr("interface.skills")}</h3>
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
          <h3>{tr("interface.extensions")}</h3>
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
          <h3>{tr("interface.plugins")}</h3>
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

type ConfigTab = "runtime" | "resources" | "session" | "inspect";

const CONFIG_TABS: readonly { readonly id: ConfigTab; readonly label: string }[] = [
  { id: "runtime", label: "workflowSettings.model" },
  { id: "resources", label: "workflowSettings.resources" },
  { id: "session", label: "interface.session.overrides" },
  { id: "inspect", label: "interface.inspect.configuration" },
];

export function WorkflowAgentConfigDialog({ workflow, projectId, cwd, configs, proposals, onConfigsChange, onClose, selectionScope = "session" }: Props) {
  const { t: tr } = useI18n();
  const panelId = useId();
  const [selectedNodeId, setSelectedNodeId] = useState(workflow.nodes.find(node => node.kind === "agent")?.id ?? "");
  const [agentId, setAgentId] = useState(workflow.nodes.find(node => node.kind === "agent")?.agentId ?? workflow.agents[0]?.id ?? "");
  const [tab, setTab] = useState<ConfigTab>("runtime");
  const [inspection, setInspection] = useState<WorkflowAgentInspection | null>(null);
  const [catalog, setCatalog] = useState<WorkflowAgentInspection | null>(null);
  const [promptQuery, setPromptQuery] = useState("");
  const [promptResources, setPromptResources] = useState<PromptResource[]>([]);
  const [modelCatalog, setModelCatalog] = useState<ChatModelCatalog | null>(null);
  const [modelConfigVersion, setModelConfigVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agent = workflow.agents.find((candidate) => candidate.id === agentId) ?? workflow.agents[0];
  const selection = agent === undefined ? undefined : configs[agent.id];
  const selectionKey = JSON.stringify(selection ?? {});

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

  const updateSelection = (patch: Partial<AgentConfigSelection>) => {
    onConfigsChange({
      ...configs,
      [agent.id]: { ...selection, ...patch },
    });
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
  return (
    <SurfaceDialog title={translateWorkflowCopy(workflow.id, workflow.name, tr)}
      description={tr("workflowSettings.subtitle")} onClose={onClose}>
      <div className="workflow-agent-dialog-shell">
        <nav className="workflow-node-navigation" aria-label={tr("interface.workflow.agents")}>
          <div className="workflow-navigation-heading"><span>{tr("design.workflowSteps")}</span><small>{tr("workflowSettings.stepsHint")}</small></div>
          <ol className="workflow-node-list">
            {workflow.nodes.map((node, index) => <li key={node.id}>
              {node.kind === "agent" ? <button type="button" aria-current={node.id === selectedNodeId ? "step" : undefined}
                className={node.id === selectedNodeId ? "active" : ""}
                onClick={() => { setSelectedNodeId(node.id); if (node.agentId !== agent.id) { setInspection(null); setCatalog(null); setAgentId(node.agentId); } }}>
                <span className="workflow-node-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{translateWorkflowCopy(workflow.id, node.name, tr)}</strong><small>{translateWorkflowCopy(workflow.id, node.description, tr)}</small></span>
              </button> : <div className="workflow-task-node">
                <span className="workflow-node-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{translateWorkflowCopy(workflow.id, node.name, tr)}</strong><small>{tr("workflowSettings.taskNode")}</small></span>
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
          <section className="workflow-agent-config-fields workflow-agent-intro">
            <span className="workflow-scope-label">{tr(selectionScope === "default" ? "workflowSettings.homeScope" : "workflowSettings.projectScope")}</span>
            <h2>{translateWorkflowCopy(workflow.id, agent.name, tr)}</h2>
            <p>{translateWorkflowCopy(workflow.id, agent.description, tr)}</p>
          </section>

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
                  const index = CONFIG_TABS.findIndex(item => item.id === tab);
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
                {tr(item.id === "session" && selectionScope === "default" ? "longAgentSettings.workflowDefaults" : item.label)}
              </button>
            ))}
          </div>

          {loading && <div className="workflow-agent-loading">{tr("interface.resolving.the.agent.through.pi.s.execution.path")}</div>}
          {error && <div className="workflow-agent-error" role="alert"><InterfaceFeedback message={error} /><Button variant="ghost" onClick={() => setModelConfigVersion(version => version + 1)}>{tr("common.retry")}</Button></div>}

          {tab === "runtime" && (
            <div className="workflow-agent-tab-panel" role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-${tab}`} tabIndex={0} aria-label={tr("interface.model.and.tools")}>
              <p className="workflow-agent-tab-note">{tr("interface.changes.save.automatically.to.this.project.and.apply.from.the.next.run")}</p>
              {inspection && (
                <ModelConfigSection
                  key={`${projectId}:${agent.id}`}
                  workflow={workflow}
                  agentId={agent.id}
                  projectId={projectId}
                  inspection={inspection}
                  modelCatalog={modelCatalog}
                  onConfigChanged={() => setModelConfigVersion((version) => version + 1)}
                />
              )}
            </div>
          )}

          {tab === "resources" && (
            <div className="workflow-agent-tab-panel" role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-${tab}`} tabIndex={0}>
              <p className="workflow-agent-tab-note">{tr("interface.changes.save.automatically.to.this.project.and.apply.from.the.next.run")}</p>
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
            </div>
          )}

          {tab === "session" && (
            <div className="workflow-agent-tab-panel" role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-${tab}`} tabIndex={0} aria-label={tr(selectionScope === "default" ? "longAgentSettings.workflowDefaults" : "interface.session.overrides")}>
              <section className="workflow-agent-config-fields">
                <div className="workflow-agent-config-actions">
                  <small>{tr(selectionScope === "default" ? "workflowSettings.defaultSaveHint" : "interface.changes.apply.to.this.workflow.agent.in.the.current.session.and.are.submitted.with.the.next.message")}</small>
                  <Button variant="secondary" type="button" onClick={() => onConfigsChange({ ...configs, [agent.id]: {} })}>{tr("interface.restore.workflow.defaults")}</Button>
                </div>


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

                <fieldset>
                  <legend>{tr("interface.skills.extensions.and.plugins")}</legend>
                  <label className="workflow-agent-resource-mode">
                    <input type="radio" checked={effectiveResources.mode === "inherit"} onChange={() => updateSelection({ resources: { mode: "inherit" } })} />{tr("interface.use.pi.default.resources")}</label>
                  <label className="workflow-agent-resource-mode">
                    <input type="radio" checked={effectiveResources.mode === "explicit"} onChange={() => updateSelection({ resources: { mode: "explicit", skillPaths: [], extensionPaths: [], pluginSources: [] } })} />{tr("interface.select.resources.for.this.agent")}</label>
                  {effectiveResources.mode === "explicit" && catalog && (
                    <div className="workflow-agent-resource-groups">
                      <h3>{tr("interface.skills")}</h3>
                      {catalog.skills.map((skill) => <ResourceCheckbox key={skill.filePath} label={skill.name} detail={skill.filePath} checked={effectiveResources.skillPaths.includes(skill.filePath)} onChange={(checked) => updateExplicitResources("skillPaths", skill.filePath, checked)} />)}
                      <h3>{tr("interface.extensions")}</h3>
                      {catalog.extensions.map((extension) => <ResourceCheckbox key={extension.resolvedPath} label={extension.resolvedPath.split("/").pop() ?? extension.resolvedPath} detail={extension.resolvedPath} checked={effectiveResources.extensionPaths.includes(extension.resolvedPath)} onChange={(checked) => updateExplicitResources("extensionPaths", extension.resolvedPath, checked)} />)}
                      <h3>{tr("interface.plugins")}</h3>
                      {catalog.plugins.map((plugin) => <ResourceCheckbox key={`${plugin.scope}:${plugin.source}`} label={plugin.source} detail={tr("inspection.pluginContents", { skills: plugin.skills.length, extensions: plugin.extensions.length, prompts: plugin.prompts.length })} checked={effectiveResources.pluginSources.includes(plugin.source)} onChange={(checked) => updateExplicitResources("pluginSources", plugin.source, checked)} />)}
                    </div>
                  )}
                </fieldset>
                <ConfigurationSection title={tr("workflowSettings.configFiles")}>
                <label>{tr("interface.primary.configuration.file")}<input value={selection?.primary ?? ""} placeholder="/path/to/agent.json" onChange={(event) => updateSelection({ primary: event.target.value.trim() || undefined })} /></label>
                <label>{tr("interface.additional.configuration.files.one.per.line")}<textarea value={lines(selection?.append)} onChange={(event) => updateSelection({ append: parseLines(event.target.value) })} /></label>
                <label>{tr("interface.additional.prompt.files.one.per.line")}<textarea value={lines(selection?.promptFiles)} onChange={(event) => updateSelection({ promptFiles: parseLines(event.target.value) })} /></label>
                </ConfigurationSection>
              </section>
            </div>
          )}

          {tab === "inspect" && (
            <div className="workflow-agent-tab-panel" role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-${tab}`} tabIndex={0} aria-label={tr("interface.inspect.configuration")}>
              {inspection && <RuntimeCapabilities inspection={inspection} />}
              {inspection && <InspectionDetails inspection={inspection} />}
            </div>
          )}
        </main>
      </div>
    </SurfaceDialog>
  );
}
