"use client";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useI18n } from "@/hooks/useI18n";

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

function targetLabel(value: PromptResource | PromptResourceDraft, t: ReturnType<typeof useI18n>["t"]): string {
  return value.target.type === "personal" ? t("prompt.targetPersonal") : t("prompt.targetProject", { project: value.target.projectId });
}

export function PromptResourcesConfig({
  projectId,
  onClose,
}: {
  readonly projectId: string;
  readonly onClose: () => void;
}) {
  const { t: tr, locale } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detailOpen, setDetailOpen] = useState(false);
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
      className="workflow-agent-dialog configuration-dialog" aria-label={tr("interface.rules.and.experiences.2")}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className={`workflow-agent-dialog-shell prompt-resource-library${detailOpen ? " prompt-detail-open" : ""}`}>
        <header>
          <div><strong>{tr("interface.rules.and.experiences.2")}</strong><small>{tr("interface.personal.and.project.prompt.resources.drafts.are.excluded.from.agent.configuration")}</small></div>
          <button type="button" onClick={close} aria-label={tr("interface.close")}>×</button>
        </header>
        <nav aria-label={tr("interface.prompt.resources")}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("interface.search.names.purposes.content.tags.or.sources")} aria-label={tr("interface.search.rules.and.experiences")} />
          {drafts.length > 0 && <p>{tr("interface.drafts.awaiting.confirmation")}</p>}
          {drafts.map((draft) => {
            const key = `draft:${promptResourceAddress(draft.target, draft.id)}`;
            return (
              <button key={key} type="button" className={key === selectedKey ? "active" : ""} onClick={() => { setSelectedKey(key); setDetailOpen(true); }}>
                <strong>{draft.title}</strong><small>{tr("interface.draft")}{targetLabel(draft, tr)} · {draft.id}</small>
              </button>
            );
          })}
          {resources.length > 0 && <p>{tr("interface.confirmed.resources")}</p>}
          {resources.map((resource) => {
            const key = `resource:${promptResourceAddress(resource.target, resource.id)}`;
            return (
              <button key={key} type="button" className={key === selectedKey ? "active" : ""} onClick={() => { setSelectedKey(key); setDetailOpen(true); }}>
                <strong>{resource.title}</strong>
                <small>{targetLabel(resource, tr)} · v{resource.revision} · {resource.status === "active" ? tr("interface.enabled") : tr("interface.archived")}</small>
              </button>
            );
          })}
          {!loading && drafts.length === 0 && resources.length === 0 && <p>{tr("interface.no.matching.rules.experiences.or.drafts")}</p>}
        </nav>
        <main>
          <button type="button" className="catalog-back workspace-button" onClick={() => setDetailOpen(false)}>{tr("interface.back.to.resources")}</button>
          {error && <p className="workflow-agent-error"><InterfaceFeedback message={error} /></p>}
          {loading && value === undefined ? <p>{tr("interface.loading.resources")}</p> : value && (
            <div className="workflow-agent-inspection prompt-resource-detail">
              <section>
                <h2>{value.title}</h2>
                <div className="workflow-agent-chip-list">
                  <span className="active">{selected?.type === "draft" ? tr("interface.draft.2") : value.kind === "rule" ? tr("interface.rule") : tr("interface.experience")}</span>
                  <span>{targetLabel(value, tr)}</span>
                  <span>{value.status === "active" ? tr("interface.enabled") : tr("interface.archived")}</span>
                  {selected?.type === "resource" && <span>{tr("interface.version")}{selected.value.revision}</span>}
                  {value.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </section>
              <section><h3>{tr("interface.purpose")}</h3><p>{value.purpose}</p></section>
              <details open><summary>{tr("interface.prompt.content")}</summary><pre>{value.content}</pre></details>
              <details>
                <summary>{tr("interface.sources")}{value.sources.length}）</summary>
                <div className="workflow-agent-detail-list">
                  {value.sources.map((source, index) => (
                    <article key={`${source.sessionId ?? "manual"}-${index}`}>
                      <strong>{source.type === "session" ? `Session ${source.sessionId}` : tr("interface.created.manually")}</strong>
                      <small>{source.projectId ? `${tr("prompt.targetProject", { project: source.projectId })} · ` : ""}{new Date(source.capturedAt).toLocaleString(locale)}</small>
                      {source.workflowInvocationId && <small>{tr("interface.workflow.invocation")}{source.workflowInvocationId}</small>}
                      <p>{source.context || tr("interface.no.source.summary")}</p>
                      {source.entryIds.length > 0 && <small>{tr("interface.entries")}{source.entryIds.join(", ")}</small>}
                    </article>
                  ))}
                </div>
              </details>
              {selected?.type === "resource" && (
                <details>
                  <summary>{tr("interface.revision.history")}{history.length}）</summary>
                  <div className="workflow-agent-detail-list">
                    {[...history].reverse().map((revision) => (
                      <article key={revision.revision}>
                        <strong>v{revision.revision} · {revision.status === "active" ? tr("interface.enabled") : tr("interface.archived")}</strong>
                        <small>{new Date(revision.createdAt).toLocaleString(locale)}</small>
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
