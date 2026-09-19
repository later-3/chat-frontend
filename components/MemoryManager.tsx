"use client";

import { useDialogFocus } from "@/hooks/useDialogFocus";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconBrain,
  IconChevronLeft,
  IconChevronRight,
  IconDatabase,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import {
  MEMORY_KINDS,
  createMemory,
  deleteMemory,
  fetchMemoryTargetsHealth,
  fetchMemoryTree,
  listMemoryTargets,
  rebuildMemoryIndexes,
  searchMemories,
  updateMemory,
  type MemoryHealth,
  type MemoryKind,
  type MemoryRecord,
  type MemoryTarget,
  type MemoryTree,
} from "@/lib/memory-contract";
import { fetchChatProjects, type ChatProjectSummary } from "@/lib/projects-contract";
import { LongAgentMemorySettings } from "./LongAgentMemorySettings";
import styles from "./MemoryManager.module.css";

const PAGE_SIZE = 30;

type MemoryScope =
  | { readonly kind: "personal" }
  | { readonly kind: "project"; readonly projectId: string }
  | { readonly kind: "agent"; readonly longAgentId: string };

interface MemoryManagerProps {
  currentProjectId: string | null;
  onClose: () => void;
}

interface MemoryDraft {
  text: string;
  kind: MemoryKind;
}

function keyForTarget(target: MemoryTarget): string {
  return target.type === "personal" ? "personal" : `project:${target.projectId}`;
}

function targetFromKey(key: string): MemoryTarget {
  return key === "personal"
    ? { type: "personal" }
    : { type: "project", projectId: key.slice("project:".length) };
}

function targetsForScope(scope: MemoryScope): readonly MemoryTarget[] {
  if (scope.kind === "project") return [{ type: "project", projectId: scope.projectId }];
  return [{ type: "personal" }];
}

function scopeKey(scope: MemoryScope): string {
  return scope.kind === "personal" ? "personal" : scope.kind === "project" ? `project:${scope.projectId}` : `agent:${scope.longAgentId}`;
}

function scopeFromKey(key: string): MemoryScope {
  if (key.startsWith("project:")) return { kind: "project", projectId: key.slice("project:".length) };
  if (key.startsWith("agent:")) return { kind: "agent", longAgentId: key.slice("agent:".length) };
  return { kind: "personal" };
}

function navHeaderStyle(label: string): React.CSSProperties {
  return {
    padding: "5px 8px 3px", fontSize: 10, fontWeight: 600, color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  };
}

function navItemStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
    width: "100%", padding: "6px 8px", marginBottom: 1, borderRadius: 6,
    border: "none", background: active ? "var(--bg-selected)" : "transparent",
    color: active ? "var(--text)" : "var(--text-muted)", fontSize: 12, textAlign: "left",
    cursor: "pointer",
  };
}

function targetForMemory(memory: MemoryRecord): MemoryTarget {
  return memory.scope === "personal"
    ? { type: "personal" }
    : { type: "project", projectId: memory.projectId ?? "" };
}

function draftFor(memory: MemoryRecord | null): MemoryDraft {
  return memory === null ? { text: "", kind: "fact" } : { text: memory.text, kind: memory.kind };
}

export function MemoryManager({ currentProjectId, onClose }: MemoryManagerProps) {
  const { locale, t } = useI18n();
  const [projects, setProjects] = useState<readonly ChatProjectSummary[]>([]);
  const [tree, setTree] = useState<MemoryTree | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [scope, setScope] = useState<MemoryScope>({ kind: "personal" });
  const [scopeKeyState, setScopeKeyState] = useState(scopeKey(scope));
  const targets = useMemo(() => targetsForScope(scope), [scope]);
  const isAgentScope = scope.kind === "agent";
  const [items, setItems] = useState<readonly MemoryRecord[]>([]);
  const [scores, setScores] = useState<ReadonlyMap<string, number | null>>(new Map());
  const [health, setHealth] = useState<MemoryHealth | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<MemoryKind | "all">("all");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemoryRecord | null | undefined>(undefined);
  const [draft, setDraft] = useState<MemoryDraft>(() => draftFor(null));
  const [draftTargetKey, setDraftTargetKey] = useState("personal");
  const editorDirty = editing !== undefined && JSON.stringify(draft) !== JSON.stringify(draftFor(editing));
  const closeEditor = () => {
    if (busy || (editorDirty && !window.confirm(t("longAgentSettings.discardConfirm")))) return;
    setEditing(undefined);
  };
  const closeManager = () => {
    if (busy || (editorDirty && !window.confirm(t("longAgentSettings.discardConfirm")))) return;
    onClose();
  };
  const managerRef = useDialogFocus<HTMLElement>(closeManager);
  const editorRef = useDialogFocus(closeEditor, editing !== undefined);
  useEffect(() => {
    if (!editorDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editorDirty]);

  const loadTree = useCallback(async (signal?: AbortSignal) => {
    setTreeError(null);
    try {
      setTree(await fetchMemoryTree(signal));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setTreeError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadTree(controller.signal);
    return () => controller.abort();
  }, [loadTree]);

  const selectScope = (next: MemoryScope) => {
    setScope(next);
    setScopeKeyState(scopeKey(next));
    setOffset(0);
    setActiveQuery("");
    setQuery("");
    setEditing(undefined);
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchChatProjects(controller.signal).then(setProjects).catch((loadError: unknown) => {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    });
    return () => controller.abort();
  }, []);

  const loadHealth = useCallback(async (signal?: AbortSignal) => {
    setHealth(await fetchMemoryTargetsHealth(targets, signal));
  }, [targets]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const request = activeQuery === ""
      ? listMemoryTargets({
          targets,
          status: "active",
          limit: PAGE_SIZE,
          offset,
          ...(kind === "all" ? {} : { kind }),
        }, controller.signal).then((page) => {
          setItems(page.items);
          setTotal(page.total);
          setScores(new Map());
        })
      : searchMemories({
          query: activeQuery,
          targets,
          topK: 50,
          ...(kind === "all" ? {} : { kind }),
        }, controller.signal).then((hits) => {
          setItems(hits.map((hit) => hit.memory));
          setTotal(hits.length);
          setScores(new Map(hits.map((hit) => [hit.memory.id, hit.score])));
        });

    void Promise.all([request, loadHealth(controller.signal)])
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeQuery, kind, loadHealth, offset, refreshKey, targets]);

  const refresh = useCallback(() => { setRefreshKey((value) => value + 1); void loadTree(); }, [loadTree]);
  const startCreate = () => {
    setDraft(draftFor(null));
    setDraftTargetKey(scope.kind === "project" ? `project:${scope.projectId}` : "personal");
    setEditing(null);
    setError(null);
  };
  const startEdit = (memory: MemoryRecord) => {
    setDraft(draftFor(memory));
    setEditing(memory);
    setError(null);
  };

  const saveDraft = async () => {
    const text = draft.text.trim();
    if (text === "") {
      setError(t("memory.textRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (editing === null) {
        await createMemory({
          target: targetFromKey(draftTargetKey),
          text,
          kind: draft.kind,
          metadata: { managedBy: "memory-page" },
        });
        setNotice(t("memory.created"));
      } else if (editing !== undefined) {
        await updateMemory(editing.id, { target: targetForMemory(editing), text, kind: draft.kind });
        setNotice(t("memory.updated"));
      }
      setEditing(undefined);
      refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memory: MemoryRecord) => {
    if (!window.confirm(t("memory.deleteConfirm"))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deleteMemory(memory.id, targetForMemory(memory));
      setNotice(t("memory.deleted"));
      refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async () => {
    const scopeLabel = scope.kind === "project"
      ? (projects.find((project) => project.projectId === scope.projectId)?.cachedName ?? scope.projectId)
      : t("memory.scope.personal");
    if (!window.confirm(t("memory.rebuildConfirm", { scope: scopeLabel }))) return;
    setBusy(true);
    setError(null);
    setNotice(t("memory.rebuilding"));
    try {
      const result = await rebuildMemoryIndexes(targets);
      setNotice(t("memory.rebuildComplete", { indexed: result.indexed, failed: result.failed }));
      refresh();
    } catch (rebuildError) {
      setNotice(null);
      setError(rebuildError instanceof Error ? rebuildError.message : String(rebuildError));
    } finally {
      setBusy(false);
    }
  };

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
  };
  const statusClass = (status: MemoryRecord["indexStatus"]) => (
    status === "indexed" ? styles.indexed : status === "failed" ? styles.failed : styles.pending
  );

  return (
    <section ref={managerRef} tabIndex={-1} className={`${styles.overlay} configuration-dialog`} role="dialog" aria-modal="true" aria-label={t("memory.title")}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <IconBrain size={22} stroke={1.7} aria-hidden="true" />
          <div><h1>{t("memory.title")}</h1><p>{t("memory.subtitle")}</p></div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.button} onClick={() => void rebuild()} disabled={busy}>
            <IconDatabase size={16} stroke={1.8} aria-hidden="true" /><span>{t("memory.rebuild")}</span>
          </button>
          <button type="button" className={styles.iconButton} onClick={refresh} disabled={loading || busy} aria-label={t("common.refresh")}><IconRefresh size={17} stroke={1.8} aria-hidden="true" /></button>
          <button type="button" className={styles.iconButton} onClick={closeManager} aria-label={t("common.close")}><IconX size={19} stroke={1.8} aria-hidden="true" /></button>
        </div>
      </header>

      <div className={styles.content}>
        <div style={{ display: "flex", gap: 0, minHeight: "100%", alignItems: "stretch" }}>
          <nav
            aria-label={t("memory.scopeTree")}
            style={{
              width: 200, flexShrink: 0, overflowY: "auto", padding: "8px 6px",
              borderRight: "1px solid var(--border)", background: "var(--bg-panel)",
            }}
          >
            {treeError !== null && <div style={{ padding: "4px 8px", fontSize: 10, color: "#f87171" }}>{treeError}</div>}
            {tree === null && treeError === null && (
              <div style={{ padding: "8px", fontSize: 11, color: "var(--text-dim)" }}>{t("common.loading")}</div>
            )}
            {tree !== null && (
              <>
                <div style={navHeaderStyle(t("memory.scopeTreeSystem"))}>
                  <button
                    type="button"
                    onClick={() => selectScope({ kind: "personal" })}
                    style={navItemStyle(scopeKeyState === "personal")}
                  >
                    <span>{t("memory.scope.personal")}</span>
                    <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{tree.personal.total}</span>
                  </button>
                </div>
                <div style={navHeaderStyle(t("memory.scopeTreeProjects"))}>
                  {tree.projects.map((project) => (
                    <button
                      key={project.projectId}
                      type="button"
                      disabled={!project.available}
                      onClick={() => selectScope({ kind: "project", projectId: project.projectId })}
                      style={navItemStyle(scopeKeyState === `project:${project.projectId}`)}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{project.available ? project.total : "—"}</span>
                    </button>
                  ))}
                </div>
                <div style={navHeaderStyle(t("memory.scopeTreeAgents"))}>
                  {tree.longAgents.map((agent) => (
                    <button
                      key={agent.longAgentId}
                      type="button"
                      onClick={() => selectScope({ kind: "agent", longAgentId: agent.longAgentId })}
                      style={navItemStyle(scopeKeyState === `agent:${agent.longAgentId}`)}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</span>
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{agent.memoryFiles} f</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </nav>
          <div style={{ flex: 1, minWidth: 0 }} className={styles.inner}>
        {isAgentScope ? (
          <LongAgentMemorySettings
            longAgentId={scope.longAgentId}
            onDirtyChange={() => {}}
          />
        ) : (
        <>
        <div className={styles.healthGrid}>
          {([[
            "memory.total", health?.records ?? "—",
          ], ["memory.indexed", health?.indexed ?? "—"], ["memory.pending", health?.pending ?? "—"], ["memory.failed", health?.failed ?? "—"], ["memory.cleanup", health?.pendingDeletions ?? "—"]] as const).map(([label, value]) => (
            <div key={label} className={styles.healthCard}><span>{t(label)}</span><strong>{value}</strong></div>
          ))}
        </div>

        <form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); setOffset(0); setActiveQuery(query.trim()); }}>
          <div className={styles.searchBox}><IconSearch size={16} stroke={1.8} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("memory.searchPlaceholder")} /></div>
          <select className={styles.select} aria-label={t("memory.kind")} value={kind} onChange={(event) => { setKind(event.target.value as MemoryKind | "all"); setOffset(0); }}>
            <option value="all">{t("memory.allKinds")}</option>
            {MEMORY_KINDS.map((value) => <option key={value} value={value}>{t(`memory.kind.${value}`)}</option>)}
          </select>
          <button type="button" className={styles.primaryButton} onClick={startCreate} disabled={busy}><IconPlus size={16} stroke={2} aria-hidden="true" />{t("memory.add")}</button>
        </form>

        {activeQuery !== "" && <div className={styles.notice}>{t("memory.searchingFor", { query: activeQuery })}<button type="button" className={styles.button} onClick={() => { setQuery(""); setActiveQuery(""); setOffset(0); }} style={{ marginLeft: 10 }}>{t("memory.clearSearch")}</button></div>}
        {notice && <div className={styles.notice} role="status">{notice}</div>}
        {error && <div className={styles.error} role="alert">{error}</div>}

        {loading ? <div className={styles.empty}>{t("common.loading")}</div> : items.length === 0 ? (
          <div className={styles.empty}><IconBrain size={32} stroke={1.4} aria-hidden="true" /><strong>{t("memory.empty")}</strong><span>{t("memory.emptyHint")}</span></div>
        ) : (
          <div className={styles.list}>{items.map((memory) => (
            <article key={`${keyForTarget(targetForMemory(memory))}:${memory.id}`} className={styles.memoryCard}>
              <div><p className={styles.memoryText}>{memory.text}</p><div className={styles.metaRow}>
                <span className={styles.badge}>{t(`memory.kind.${memory.kind}`)}</span>
                <span className={styles.badge}>{memory.scope === "personal" ? t("memory.scope.personal") : memory.projectId}</span>
                <span className={statusClass(memory.indexStatus)}>{t(`memory.index.${memory.indexStatus}`)}</span>
                <span>v{memory.version}</span>
                {scores.has(memory.id) && <span>{t("memory.score")}: {scores.get(memory.id)?.toFixed(3) ?? "—"}</span>}
                <span>{formatDate(memory.updatedAt)}</span>
              </div>{memory.indexError && <div className={styles.error} style={{ marginTop: 9 }}>{memory.indexError}</div>}</div>
              <div className={styles.cardActions}>
                <button type="button" className={styles.iconButton} onClick={() => startEdit(memory)} disabled={busy} aria-label={t("memory.edit")}><IconPencil size={15} stroke={1.8} aria-hidden="true" /></button>
                <button type="button" className={styles.dangerButton} onClick={() => void remove(memory)} disabled={busy} aria-label={t("memory.delete")}><IconTrash size={15} stroke={1.8} aria-hidden="true" /></button>
              </div>
            </article>
          ))}</div>
        )}

        {activeQuery === "" && total > PAGE_SIZE && <div className={styles.pagination}>
          <button type="button" className={styles.iconButton} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || loading} aria-label={t("memory.previous")}><IconChevronLeft size={17} stroke={1.8} aria-hidden="true" /></button>
          <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}</span>
          <button type="button" className={styles.iconButton} onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total || loading} aria-label={t("memory.next")}><IconChevronRight size={17} stroke={1.8} aria-hidden="true" /></button>
        </div>}
        </>
        )}
        </div>
        </div>
      </div>

      {editing !== undefined && <div className={styles.editorBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeEditor(); }}>
        <div ref={editorRef} tabIndex={-1} className={styles.editor} role="dialog" aria-modal="true" aria-label={editing === null ? t("memory.add") : t("memory.edit")}>
          <div className={styles.editorHeader}><h2>{editing === null ? t("memory.add") : t("memory.edit")}</h2><button type="button" className={styles.iconButton} onClick={closeEditor} disabled={busy} aria-label={t("common.close")}><IconX size={18} stroke={1.8} aria-hidden="true" /></button></div>
          <div className={styles.form}>
            <div className={styles.field}><label htmlFor="memory-text">{t("memory.text")}</label><textarea id="memory-text" className={styles.textarea} value={draft.text} maxLength={50_000} autoFocus onChange={(event) => setDraft((value) => ({ ...value, text: event.target.value }))} /></div>
            <div className={styles.formRow}>
              <div className={styles.field}><label htmlFor="memory-kind">{t("memory.kind")}</label><select id="memory-kind" className={styles.select} value={draft.kind} onChange={(event) => setDraft((value) => ({ ...value, kind: event.target.value as MemoryKind }))}>{MEMORY_KINDS.map((value) => <option key={value} value={value}>{t(`memory.kind.${value}`)}</option>)}</select></div>
              <div className={styles.field}><label htmlFor={editing === null ? "memory-target" : undefined}>{t("memory.scope")}</label>{editing === null ? <select id="memory-target" className={styles.select} value={draftTargetKey} onChange={(event) => setDraftTargetKey(event.target.value)}>
                <option value="personal">{t("memory.scope.personal")}</option>
                {currentProjectId !== null && !projects.some((project) => project.projectId === currentProjectId) && <option value={`project:${currentProjectId}`}>{currentProjectId}</option>}
                {projects.map((project) => <option key={project.projectId} value={`project:${project.projectId}`}>{project.cachedName}</option>)}
              </select> : <div className={styles.input}>{editing.scope === "personal" ? t("memory.scope.personal") : editing.projectId}</div>}</div>
            </div>
            <div className={styles.editorActions}><button type="button" className={styles.button} onClick={closeEditor} disabled={busy}>{t("common.cancel")}</button><button type="button" className={styles.primaryButton} onClick={() => void saveDraft()} disabled={busy}>{busy ? t("common.saving") : t("common.save")}</button></div>
          </div>
        </div>
      </div>}
    </section>
  );
}
