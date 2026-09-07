"use client";

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
  listMemoryTargets,
  rebuildMemoryIndexes,
  searchMemories,
  updateMemory,
  type MemoryHealth,
  type MemoryKind,
  type MemoryRecord,
  type MemoryTarget,
} from "@/lib/memory-contract";
import { fetchChatProjects, type ChatProjectSummary } from "@/lib/projects-contract";
import styles from "./MemoryManager.module.css";

const PAGE_SIZE = 30;
const VISIBLE_TARGET_KEY = "visible";

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

function targetsForView(key: string, currentProjectId: string | null): readonly MemoryTarget[] {
  if (key !== VISIBLE_TARGET_KEY) return [targetFromKey(key)];
  return currentProjectId === null
    ? [{ type: "personal" }]
    : [{ type: "personal" }, { type: "project", projectId: currentProjectId }];
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
  const [targetKey, setTargetKey] = useState(VISIBLE_TARGET_KEY);
  const targets = useMemo(() => targetsForView(targetKey, currentProjectId), [currentProjectId, targetKey]);
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

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const startCreate = () => {
    setDraft(draftFor(null));
    setDraftTargetKey(targetKey === VISIBLE_TARGET_KEY
      ? (currentProjectId === null ? "personal" : `project:${currentProjectId}`)
      : targetKey);
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
    const scope = targetKey === VISIBLE_TARGET_KEY
      ? t("memory.allScopes")
      : targetKey === "personal"
        ? t("memory.scope.personal")
        : projects.find((project) => `project:${project.projectId}` === targetKey)?.cachedName
          ?? targetKey.slice("project:".length);
    if (!window.confirm(t("memory.rebuildConfirm", { scope }))) return;
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
    <section className={styles.overlay} role="dialog" aria-modal="true" aria-label={t("memory.title")}>
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
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label={t("common.close")}><IconX size={19} stroke={1.8} aria-hidden="true" /></button>
        </div>
      </header>

      <div className={styles.content}><div className={styles.inner}>
        <div className={styles.healthGrid}>
          {([[
            "memory.total", health?.records ?? "—",
          ], ["memory.indexed", health?.indexed ?? "—"], ["memory.pending", health?.pending ?? "—"], ["memory.failed", health?.failed ?? "—"], ["memory.cleanup", health?.pendingDeletions ?? "—"]] as const).map(([label, value]) => (
            <div key={label} className={styles.healthCard}><span>{t(label)}</span><strong>{value}</strong></div>
          ))}
        </div>

        <form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); setOffset(0); setActiveQuery(query.trim()); }}>
          <div className={styles.searchBox}><IconSearch size={16} stroke={1.8} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("memory.searchPlaceholder")} /></div>
          <select className={styles.select} aria-label={t("memory.scope")} value={targetKey} onChange={(event) => { setTargetKey(event.target.value); setOffset(0); }}>
            <option value={VISIBLE_TARGET_KEY}>{t("memory.allScopes")}</option>
            <option value="personal">{t("memory.scope.personal")}</option>
            {currentProjectId !== null && !projects.some((project) => project.projectId === currentProjectId) && <option value={`project:${currentProjectId}`}>{currentProjectId}</option>}
            {projects.map((project) => <option key={project.projectId} value={`project:${project.projectId}`}>{project.cachedName}</option>)}
          </select>
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
      </div></div>

      {editing !== undefined && <div className={styles.editorBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditing(undefined); }}>
        <div className={styles.editor} role="dialog" aria-modal="true" aria-label={editing === null ? t("memory.add") : t("memory.edit")}>
          <div className={styles.editorHeader}><h2>{editing === null ? t("memory.add") : t("memory.edit")}</h2><button type="button" className={styles.iconButton} onClick={() => setEditing(undefined)} disabled={busy} aria-label={t("common.close")}><IconX size={18} stroke={1.8} aria-hidden="true" /></button></div>
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
            <div className={styles.editorActions}><button type="button" className={styles.button} onClick={() => setEditing(undefined)} disabled={busy}>{t("common.cancel")}</button><button type="button" className={styles.primaryButton} onClick={() => void saveDraft()} disabled={busy}>{busy ? t("common.saving") : t("common.save")}</button></div>
          </div>
        </div>
      </div>}
    </section>
  );
}
