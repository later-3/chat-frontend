"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchPromptResourceDrafts,
  fetchPromptResourceHistory,
  fetchPromptResources,
  promptResourceAddress,
  type PromptResource,
  type PromptResourceDraft,
} from "@/lib/prompt-resources-browser";

type SelectedPromptResource =
  | { readonly type: "draft"; readonly value: PromptResourceDraft }
  | { readonly type: "resource"; readonly value: PromptResource };

function matchesDraft(draft: PromptResourceDraft, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized === "") return true;
  return [draft.title, draft.purpose, draft.content, ...draft.tags, ...draft.sources.map((source) => source.context)]
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}

function targetLabel(value: PromptResource | PromptResourceDraft): string {
  return value.target.type === "personal" ? "Personal" : `Project · ${value.target.projectId}`;
}

export function PromptResourcesConfig({
  projectId,
  onClose,
}: {
  readonly projectId: string;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<PromptResource[]>([]);
  const [drafts, setDrafts] = useState<PromptResourceDraft[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<PromptResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      document.body.style.overflow = overflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void Promise.all([
        fetchPromptResources(projectId, query, controller.signal),
        fetchPromptResourceDrafts(projectId, controller.signal),
      ]).then(([nextResources, nextDrafts]) => {
        const visibleDrafts = nextDrafts.filter((draft) => matchesDraft(draft, query));
        setResources(nextResources);
        setDrafts(visibleDrafts);
        const keys = new Set([
          ...visibleDrafts.map((draft) => `draft:${promptResourceAddress(draft.target, draft.id)}`),
          ...nextResources.map((resource) => `resource:${promptResourceAddress(resource.target, resource.id)}`),
        ]);
        setSelectedKey((current) => (
          current !== null && keys.has(current)
            ? current
            : visibleDrafts[0] === undefined
              ? nextResources[0] === undefined
                ? null
                : `resource:${promptResourceAddress(nextResources[0].target, nextResources[0].id)}`
              : `draft:${promptResourceAddress(visibleDrafts[0].target, visibleDrafts[0].id)}`
        ));
      }).catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }).finally(() => setLoading(false));
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, query]);

  const selected = useMemo<SelectedPromptResource | null>(() => {
    const draft = drafts.find((item) => `draft:${promptResourceAddress(item.target, item.id)}` === selectedKey);
    if (draft !== undefined) return { type: "draft", value: draft };
    const resource = resources.find((item) => `resource:${promptResourceAddress(item.target, item.id)}` === selectedKey);
    return resource === undefined ? null : { type: "resource", value: resource };
  }, [drafts, resources, selectedKey]);

  useEffect(() => {
    if (selected?.type !== "resource") {
      setHistory([]);
      return;
    }
    const controller = new AbortController();
    void fetchPromptResourceHistory(projectId, selected.value, controller.signal)
      .then(setHistory)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => controller.abort();
  }, [projectId, selected]);

  const close = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  };

  const value = selected?.value;
  return (
    <dialog
      ref={dialogRef}
      className="workflow-agent-dialog"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="workflow-agent-dialog-shell prompt-resource-library">
        <header>
          <div><strong>规则与经验库</strong><small>Personal与当前Project的Agent Prompt资源；草稿不会进入Agent配置。</small></div>
          <button type="button" onClick={close} aria-label="关闭">×</button>
        </header>
        <nav aria-label="Prompt资源">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、目的、内容、标签或来源" aria-label="搜索规则与经验" />
          {drafts.length > 0 && <p>待确认草稿</p>}
          {drafts.map((draft) => {
            const key = `draft:${promptResourceAddress(draft.target, draft.id)}`;
            return (
              <button key={key} type="button" className={key === selectedKey ? "active" : ""} onClick={() => setSelectedKey(key)}>
                <strong>{draft.title}</strong><small>草稿 · {targetLabel(draft)} · {draft.id}</small>
              </button>
            );
          })}
          {resources.length > 0 && <p>已确认资源</p>}
          {resources.map((resource) => {
            const key = `resource:${promptResourceAddress(resource.target, resource.id)}`;
            return (
              <button key={key} type="button" className={key === selectedKey ? "active" : ""} onClick={() => setSelectedKey(key)}>
                <strong>{resource.title}</strong>
                <small>{targetLabel(resource)} · v{resource.revision} · {resource.status === "active" ? "启用" : "已归档"}</small>
              </button>
            );
          })}
          {!loading && drafts.length === 0 && resources.length === 0 && <p>没有匹配的规则、经验或草稿。</p>}
        </nav>
        <main>
          {error && <p className="workflow-agent-error">{error}</p>}
          {loading && value === undefined ? <p>正在读取规则库…</p> : value && (
            <div className="workflow-agent-inspection prompt-resource-detail">
              <section>
                <h2>{value.title}</h2>
                <div className="workflow-agent-chip-list">
                  <span className="active">{selected?.type === "draft" ? "草稿" : value.kind === "rule" ? "规则" : "经验"}</span>
                  <span>{targetLabel(value)}</span>
                  <span>{value.status === "active" ? "启用" : "已归档"}</span>
                  {selected?.type === "resource" && <span>版本 {selected.value.revision}</span>}
                  {value.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </section>
              <section><h3>目的</h3><p>{value.purpose}</p></section>
              <details open><summary>Prompt内容</summary><pre>{value.content}</pre></details>
              <details open>
                <summary>来源（{value.sources.length}）</summary>
                <div className="workflow-agent-detail-list">
                  {value.sources.map((source, index) => (
                    <article key={`${source.sessionId ?? "manual"}-${index}`}>
                      <strong>{source.type === "session" ? `Session ${source.sessionId}` : "手动创建"}</strong>
                      <small>{source.projectId ? `Project ${source.projectId} · ` : ""}{new Date(source.capturedAt).toLocaleString()}</small>
                      {source.workflowInvocationId && <small>Workflow Invocation: {source.workflowInvocationId}</small>}
                      <p>{source.context || "没有来源摘要"}</p>
                      {source.entryIds.length > 0 && <small>Entries: {source.entryIds.join(", ")}</small>}
                    </article>
                  ))}
                </div>
              </details>
              {selected?.type === "resource" && (
                <details>
                  <summary>版本历史（{history.length}）</summary>
                  <div className="workflow-agent-detail-list">
                    {[...history].reverse().map((revision) => (
                      <article key={revision.revision}>
                        <strong>v{revision.revision} · {revision.status === "active" ? "启用" : "已归档"}</strong>
                        <small>{new Date(revision.createdAt).toLocaleString()}</small>
                        <p>{revision.purpose}</p>
                      </article>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </main>
      </div>
    </dialog>
  );
}
