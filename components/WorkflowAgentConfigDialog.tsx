"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentConfigSelection,
  WorkflowAgentToolPolicy,
  WorkflowAgentResources,
} from "@/lib/chat-workflow-contract";
import {
  clearChatAgentToolConfig,
  clearChatAgentModelConfig,
  fetchChatModelCatalog,
  inspectChatWorkflowAgent,
  inspectChatWorkflowAgentCatalog,
  saveChatAgentModelConfig,
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

interface Props {
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
  return (
    <div className="workflow-agent-inspection">
      <section>
        <h3>实际 Agent</h3>
        <dl className="workflow-agent-facts">
          <dt>Model</dt>
          <dd>{inspection.agent.effectiveModel
            ? `${inspection.agent.effectiveModel.provider}/${inspection.agent.effectiveModel.modelId}`
            : "未解析"}</dd>
          <dt>Thinking</dt><dd>{inspection.agent.effectiveThinkingLevel}</dd>
          <dt>默认配置</dt><dd>{inspection.agent.configPath ?? "内置定义"}</dd>
          <dt>配置来源</dt>
          <dd>{inspection.agent.sources.map((source) => source.path ?? source.kind).join(" → ")}</dd>
        </dl>
      </section>

      <details open>
        <summary>System Prompt（最终发送给模型）</summary>
        <pre>{inspection.prompt.final}</pre>
      </details>
      <details>
        <summary>Prompt 组成（{inspection.prompt.append.length} 个追加区域，{inspection.prompt.contextFiles.length} 个上下文文件）</summary>
        <div className="workflow-agent-detail-list">
          {inspection.prompt.append.map((item, index) => (
            <article key={`${item.sourcePath ?? "inline"}-${index}`}>
              <strong>追加区域 {index + 1}</strong>
              <small>{item.sourcePath ?? "内联内容"}</small>
              <pre>{item.text}</pre>
            </article>
          ))}
          {inspection.prompt.contextFiles.map((item) => (
            <article key={item.path}>
              <strong>项目上下文</strong><small>{item.path}</small><pre>{item.content}</pre>
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>规则与经验 Prompt资源（{inspection.promptResources.length}）</summary>
        <div className="workflow-agent-detail-list">
          {inspection.promptResources.map((resource) => (
            <article key={`${promptResourceAddress(resource.target, resource.id)}:${resource.revision}`}>
              <strong>{resource.title}</strong>
              <small>{resource.kind === "rule" ? "规则" : "经验"} · {promptResourceAddress(resource.target, resource.id)} · v{resource.revision}</small>
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>Tools（{inspection.tools.filter((tool) => tool.active).length}/{inspection.tools.length} 启用）</summary>
        <div className="workflow-agent-chip-list">
          {inspection.tools.map((tool) => (
            <span
              key={tool.name}
              className={tool.active ? "active" : ""}
              title={`${tool.description}\n地址: ${tool.address ?? tool.name}\n来源: ${tool.sourceInfo.source} (${tool.sourceInfo.scope}/${tool.sourceInfo.origin})`}
            >
              {tool.name}
            </span>
          ))}
        </div>
      </details>
      <details>
        <summary>Skills（{inspection.skills.length}）</summary>
        <div className="workflow-agent-detail-list">
          {inspection.skills.map((skill) => (
            <article key={skill.filePath}>
              <strong>{skill.name}</strong><small>{skill.address ?? skill.filePath}</small>
              <p>{skill.description}</p>
              <pre>{skill.content ?? skill.error ?? "没有可显示的内容"}</pre>
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>Extensions（{inspection.extensions.length}）</summary>
        <div className="workflow-agent-detail-list">
          {inspection.extensions.map((extension) => (
            <article key={extension.resolvedPath}>
              <strong>{extension.resolvedPath.split("/").pop()}</strong><small>{extension.address ?? extension.resolvedPath}</small>
              <p>
                Tools: {extension.capabilities.tools.join(", ") || "无"}<br />
                Commands: {extension.capabilities.commands.join(", ") || "无"}<br />
                Events: {extension.capabilities.eventHandlers.join(", ") || "无"}
              </p>
            </article>
          ))}
        </div>
      </details>
      <details>
        <summary>Plugins（{inspection.plugins.length}）</summary>
        <div className="workflow-agent-detail-list">
          {inspection.plugins.map((plugin) => (
            <article key={`${plugin.scope}:${plugin.source}`}>
              <strong>{plugin.source}</strong><small>{plugin.scope}</small>
              <p>{plugin.skills.length} Skills · {plugin.extensions.length} Extensions · {plugin.prompts.length} Prompts</p>
            </article>
          ))}
        </div>
      </details>
      {inspection.diagnostics.length > 0 && (
        <section className="workflow-agent-diagnostics">
          <h3>诊断</h3>
          {inspection.diagnostics.map((diagnostic, index) => (
            <p key={`${diagnostic.path ?? diagnostic.resource}-${index}`}>{diagnostic.type}: {diagnostic.message}</p>
          ))}
        </section>
      )}
    </div>
  );
}

function RuntimeCapabilities({ inspection }: { inspection: WorkflowAgentInspection }) {
  const activeTools = inspection.tools.filter((tool) => tool.active);
  return (
    <section className="workflow-agent-runtime-capabilities">
      <div>
        <strong>实际装配能力</strong>
        <small>后端按本次执行的同一路径解析；无需在浏览器重复注册。</small>
      </div>
      <dl className="workflow-agent-facts">
        <dt>Skills</dt>
        <dd>{inspection.skills.map((skill) => skill.name).join("、") || "无"}</dd>
        <dt>Tools</dt>
        <dd>{activeTools.map((tool) => tool.name).join("、") || "无"}</dd>
      </dl>
    </section>
  );
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDurableConfig = inspection.agent.durableConfig?.model !== undefined
    || inspection.agent.durableConfig?.thinkingLevel !== undefined;
  const configuredModel = inspection.agent.model ?? null;
  const configuredThinking = inspection.agent.thinkingLevel ?? "";

  const apply = async (
    input: { model?: { provider: string; modelId: string }; thinkingLevel?: string } | "clear",
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
      void apply(configuredThinking ? { thinkingLevel: configuredThinking } : "clear");
      return;
    }
    const model = modelCatalog?.models.find((item) => `${item.provider}/${item.modelId}` === key);
    if (model !== undefined) {
      void apply({
        model: { provider: model.provider, modelId: model.modelId },
        ...(configuredThinking === "" ? {} : { thinkingLevel: configuredThinking }),
      });
    }
  };
  const applyThinking = (level: string) => {
    if (level === "") {
      void apply(configuredModel === null ? "clear" : { model: configuredModel });
      return;
    }
    void apply({
      ...(configuredModel === null ? {} : { model: configuredModel }),
      thinkingLevel: level,
    });
  };

  return (
    <section className="workflow-agent-runtime-capabilities">
      <div>
        <strong>模型配置</strong>
        <small>
          保存到 Chat 的 Project 数据目录，之后每次运行这个Workflow Agent都会生效。
          {hasDurableConfig ? " 当前为持久化配置。" : " 当前使用Workflow默认。"}
        </small>
      </div>
      <dl className="workflow-agent-facts">
        <dt>生效模型</dt>
        <dd>{inspection.agent.effectiveModel
          ? `${inspection.agent.effectiveModel.provider}/${inspection.agent.effectiveModel.modelId}`
          : "未解析"}</dd>
        <dt>生效思考等级</dt>
        <dd>{inspection.agent.effectiveThinkingLevel}</dd>
      </dl>
      <label>
        模型
        <select
          value={configuredModel === null ? "" : `${configuredModel.provider}/${configuredModel.modelId}`}
          disabled={busy || modelCatalog === null}
          onChange={(event) => applyModel(event.target.value)}
        >
          <option value="">使用Workflow默认</option>
          {(modelCatalog?.models ?? []).map((model) => (
            <option
              key={`${model.provider}/${model.modelId}`}
              value={`${model.provider}/${model.modelId}`}
              disabled={!model.authConfigured}
            >
              {model.provider}/{model.modelId}（{model.name}）{model.authConfigured ? "" : " · 未认证"}
            </option>
          ))}
        </select>
      </label>
      <label>
        思考等级
        <select
          value={configuredThinking}
          disabled={busy}
          onChange={(event) => applyThinking(event.target.value)}
        >
          <option value="">使用Workflow默认</option>
          {THINKING_LEVELS.map((level) => (
            <option key={level} value={level}>{level}</option>
          ))}
        </select>
      </label>
      <button type="button" disabled={busy || !hasDurableConfig} onClick={() => void apply("clear")}>
        恢复Workflow默认模型
      </button>
      {error && <small className="workflow-agent-model-error">{error}</small>}
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
        <strong>Tool配置</strong>
        <small>
          系统Tool由Backend Catalog发现，保存到当前Project的Agent持久配置。
          {durableTools === undefined ? " 当前使用Workflow默认。" : " 当前存在Project覆盖。"}
        </small>
      </div>
      <label>
        Pi Tool策略
        <select value={effectiveTools.mode} disabled={busy} onChange={(event) => setMode(event.target.value as WorkflowAgentToolPolicy["mode"])}>
          <option value="pi-default">Pi默认Tool</option>
          <option value="explicit">明确选择</option>
          <option value="none">不使用Tool</option>
        </select>
      </label>
      <div className="workflow-agent-resource-groups">
        <h3>Chat系统Tools</h3>
        {systemTools.map((tool) => {
          const address = tool.address as string;
          return (
            <ResourceCheckbox
              key={address}
              label={tool.name}
              detail={`${address} · ${tool.risk ?? "unknown"} · ${(tool.permissions ?? []).join(", ") || "无声明权限"}`}
              checked={selectedAddresses.includes(address)}
              disabled={busy || effectiveTools.mode === "none"}
              onChange={(checked) => toggleAddress(address, checked)}
            />
          );
        })}
        <h3>Pi 与 Project Tools</h3>
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
          <small>Pi默认策略会启用Pi和已加载Extension提供的默认Tools；切换到“明确选择”后可逐项配置。</small>
        )}
      </div>
      <button type="button" disabled={busy || durableTools === undefined} onClick={() => void apply("clear")}>恢复Workflow默认Tool</button>
      {error && <small className="workflow-agent-model-error">{error}</small>}
    </section>
  );
}

export function WorkflowAgentConfigDialog({ workflow, projectId, cwd, configs, proposals, onConfigsChange, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [agentId, setAgentId] = useState(workflow.agents[0]?.id ?? "");
  const [inspection, setInspection] = useState<WorkflowAgentInspection | null>(null);
  const [catalog, setCatalog] = useState<WorkflowAgentInspection | null>(null);
  const [promptResources, setPromptResources] = useState<PromptResource[]>([]);
  const [modelCatalog, setModelCatalog] = useState<ChatModelCatalog | null>(null);
  const [modelConfigVersion, setModelConfigVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agent = workflow.agents.find((candidate) => candidate.id === agentId) ?? workflow.agents[0];
  const selection = agent === undefined ? undefined : configs[agent.id];
  const selectionKey = JSON.stringify(selection ?? {});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchChatModelCatalog(controller.signal)
      .then((catalog) => setModelCatalog(catalog))
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (agent === undefined) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void Promise.all([
        inspectChatWorkflowAgent(workflow.id, agent.id, projectId, cwd, selection, controller.signal),
        inspectChatWorkflowAgentCatalog(workflow.id, agent.id, projectId, cwd, controller.signal),
      ]).then(([resolved, available]) => {
        setInspection(resolved);
        setCatalog(available);
      }).catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }).finally(() => setLoading(false));
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
        setPromptResources([...byAddress.values()]);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => controller.abort();
  }, [projectId, selectionKey]);

  const effectiveResources = useMemo<WorkflowAgentResources>(() => (
    selection?.resources ?? inspection?.agent.resources ?? { mode: "inherit" }
  ), [inspection?.agent.resources, selection?.resources]);

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
  const closeDialog = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="workflow-agent-dialog"
      onCancel={(event) => { event.preventDefault(); closeDialog(); }}
      onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
    >
      <div className="workflow-agent-dialog-shell">
        <header>
          <div><strong>{workflow.name}</strong><small>{workflow.description}</small></div>
          <button type="button" onClick={closeDialog} aria-label="关闭">×</button>
        </header>
        <nav aria-label="Workflow Agents">
          {workflow.agents.map((item) => (
            <button key={item.id} type="button" className={item.id === agent.id ? "active" : ""} onClick={() => setAgentId(item.id)}>
              <strong>{item.name}</strong><small>{item.description}</small>
            </button>
          ))}
        </nav>
        <main>
          <section className="workflow-agent-config-fields">
            <h2>{agent.name}</h2>
            <p>{agent.description}</p>
            <p>{workflow.nodes.map((node) => `${node.name}（${node.kind === "agent" ? node.agentId : "普通节点"}）`).join(" → ")}</p>
            <div className="workflow-agent-config-actions">
              <small>修改只作用于当前Session中的这个Workflow Agent，并在下一次发送时提交。</small>
              <button type="button" onClick={() => onConfigsChange({ ...configs, [agent.id]: {} })}>
                恢复Workflow默认
              </button>
            </div>
            {inspection && <RuntimeCapabilities inspection={inspection} />}
            {inspection && (
              <ModelConfigSection
                workflow={workflow}
                agentId={agent.id}
                projectId={projectId}
                inspection={inspection}
                modelCatalog={modelCatalog}
                onConfigChanged={() => setModelConfigVersion((version) => version + 1)}
              />
            )}
            {inspection && catalog && (
              <ToolConfigSection
                workflow={workflow}
                agentId={agent.id}
                projectId={projectId}
                inspection={inspection}
                catalog={catalog}
                onConfigChanged={() => setModelConfigVersion((version) => version + 1)}
              />
            )}
            <label>主配置文件<input value={selection?.primary ?? ""} placeholder="/path/to/agent.json" onChange={(event) => updateSelection({ primary: event.target.value.trim() || undefined })} /></label>
            <label>追加配置文件（每行一个）<textarea value={lines(selection?.append)} onChange={(event) => updateSelection({ append: parseLines(event.target.value) })} /></label>
            <label>追加 Prompt 文件（每行一个）<textarea value={lines(selection?.promptFiles)} onChange={(event) => updateSelection({ promptFiles: parseLines(event.target.value) })} /></label>

            <fieldset>
              <legend>规则与经验 Prompt资源</legend>
              <div className="workflow-agent-resource-groups">
                {proposals.filter((proposal) => (
                  proposal.targetWorkflowId === workflow.id
                  && proposal.targetAgentId === agent.id
                  && proposal.resolution === undefined
                )).map((proposal) => (
                  <article key={proposal.id} className="workflow-agent-prompt-proposal">
                    <strong>Agent待确认建议</strong>
                    <p>{proposal.summary}</p>
                    <small>{proposal.promptResources.map((resource) => resource.reason ?? resource.id).join("；")}</small>
                  </article>
                ))}
                {promptResources.map((resource) => {
                  const address = promptResourceAddress(resource.target, resource.id);
                  const selected = selection?.promptResources?.find((item) => (
                    promptResourceAddress(item.target, item.id) === address
                  ));
                  return (
                    <ResourceCheckbox
                      key={address}
                      label={`${resource.title}${selected?.selectedBy === "agent" ? "（Agent选择）" : ""}`}
                      detail={`${address} · ${resource.kind === "rule" ? "规则" : "经验"} · v${resource.revision}${resource.status === "archived" ? " · 已归档" : ""} · ${selected?.reason ?? resource.purpose}`}
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
                      label={`${selected.id}${selected.selectedBy === "agent" ? "（Agent选择）" : ""}`}
                      detail={`${address} · 当前不可读取 · ${selected.reason ?? "可取消选择后重新配置"}`}
                      checked
                      onChange={() => removePromptResource(selected.target, selected.id)}
                    />
                  );
                })}
                {promptResources.length === 0 && <small>规则库中还没有启用的资源。可切换到“规则与经验”Workflow，通过对话创建。</small>}
              </div>
            </fieldset>

            <fieldset>
              <legend>Skill、Extension 与 Plugin</legend>
              <label className="workflow-agent-resource-mode">
                <input type="radio" checked={effectiveResources.mode === "inherit"} onChange={() => updateSelection({ resources: { mode: "inherit" } })} />
                使用 Pi 默认资源
              </label>
              <label className="workflow-agent-resource-mode">
                <input type="radio" checked={effectiveResources.mode === "explicit"} onChange={() => updateSelection({ resources: { mode: "explicit", skillPaths: [], extensionPaths: [], pluginSources: [] } })} />
                为这个 Agent 明确选择
              </label>
              {effectiveResources.mode === "explicit" && catalog && (
                <div className="workflow-agent-resource-groups">
                  <h3>Skills</h3>
                  {catalog.skills.map((skill) => <ResourceCheckbox key={skill.filePath} label={skill.name} detail={skill.filePath} checked={effectiveResources.skillPaths.includes(skill.filePath)} onChange={(checked) => updateExplicitResources("skillPaths", skill.filePath, checked)} />)}
                  <h3>Extensions</h3>
                  {catalog.extensions.map((extension) => <ResourceCheckbox key={extension.resolvedPath} label={extension.resolvedPath.split("/").pop() ?? extension.resolvedPath} detail={extension.resolvedPath} checked={effectiveResources.extensionPaths.includes(extension.resolvedPath)} onChange={(checked) => updateExplicitResources("extensionPaths", extension.resolvedPath, checked)} />)}
                  <h3>Plugins</h3>
                  {catalog.plugins.map((plugin) => <ResourceCheckbox key={`${plugin.scope}:${plugin.source}`} label={plugin.source} detail={`${plugin.skills.length} Skills · ${plugin.extensions.length} Extensions · ${plugin.prompts.length} Prompts`} checked={effectiveResources.pluginSources.includes(plugin.source)} onChange={(checked) => updateExplicitResources("pluginSources", plugin.source, checked)} />)}
                </div>
              )}
            </fieldset>
          </section>

          {loading && <div className="workflow-agent-loading">正在按 Pi 的实际运行方式解析 Agent…</div>}
          {error && <div className="workflow-agent-error">{error}</div>}
          {inspection && <InspectionDetails inspection={inspection} />}
        </main>
      </div>
    </dialog>
  );
}
