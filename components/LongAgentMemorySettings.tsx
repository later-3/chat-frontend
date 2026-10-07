"use client";
import { useConfirmation } from "./ui/Confirmation";
import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useCallback, useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconDeviceFloppy,
  IconFilePlus,
  IconFileText,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import {
  deleteLongAgentMemory,
  fetchLongAgentMemory,
  isSafeAgentMemoryPath,
  LongAgentManagementError,
  readLongAgentMemory,
  searchLongAgentMemory,
  writeLongAgentMemory,
  type LongAgentMemoryFile,
  type LongAgentMemoryList,
  type LongAgentMemorySearchResult,
} from "@/lib/long-agent-group-browser";
import styles from "./LongAgentSettingsPanel.module.css";

interface Props {
  longAgentId: string;
  onDirtyChange: (dirty: boolean) => void;
}

interface EditorDraft {
  readonly path: string;
  readonly content: string;
  readonly expectedRevision: string | null;
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function makeEditor(file: LongAgentMemoryFile): EditorDraft {
  return { path: file.path, content: file.content, expectedRevision: file.revision };
}

function isCoreMemory(path: string): boolean {
  return path === "index.md" || path === "system/index.md" || path === "system/definition.md";
}

export function LongAgentMemorySettings({ longAgentId, onDirtyChange }: Props) {
  const confirm = useConfirmation();
  const { t } = useI18n();
  const [memory, setMemory] = useState<LongAgentMemoryList | null>(null);
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [baseline, setBaseline] = useState<EditorDraft | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly LongAgentMemorySearchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const dirty = editor !== null && baseline !== null && JSON.stringify(editor) !== JSON.stringify(baseline);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const loadList = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setMemory(await fetchLongAgentMemory(longAgentId, signal));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [longAgentId]);

  useEffect(() => {
    const controller = new AbortController();
    setMemory(null);
    setEditor(null);
    setBaseline(null);
    setResults(null);
    setQuery("");
    void loadList(controller.signal);
    return () => controller.abort();
  }, [loadList]);

  const openFile = async (path: string, discardDraft = false) => {
    if (!discardDraft && dirty && !await confirm(t("longAgentSettings.memoryDiscardConfirm"))) return;
    setFileLoading(true);
    setError(null);
    setNotice(null);
    setConflict(false);
    try {
      const response = await readLongAgentMemory(longAgentId, path);
      const next = makeEditor(response.file);
      setEditor(next);
      setBaseline(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setFileLoading(false);
    }
  };

  const createFile = async () => {
    if (dirty && !await confirm(t("longAgentSettings.memoryDiscardConfirm"))) return;
    const next = { path: "", content: "", expectedRevision: null };
    setEditor(next);
    setBaseline(next);
    setError(null);
    setNotice(null);
    setConflict(false);
  };

  const saveFile = async () => {
    if (!editor || saving) return;
    if (!isSafeAgentMemoryPath(editor.path)) {
      setError(t("longAgentSettings.memoryPathInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    setConflict(false);
    try {
      const response = await writeLongAgentMemory(longAgentId, editor);
      const next = makeEditor(response.file);
      setEditor(next);
      setBaseline(next);
      setNotice(t("longAgentSettings.memorySaved"));
      await loadList();
    } catch (cause) {
      setConflict(cause instanceof LongAgentManagementError && cause.status === 409);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async () => {
    if (!editor?.expectedRevision || deleting || isCoreMemory(editor.path)) return;
    if (!await confirm(t("longAgentSettings.memoryDeleteConfirm", { path: editor.path }), t("common.delete"))) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    setConflict(false);
    try {
      await deleteLongAgentMemory(longAgentId, {
        path: editor.path,
        expectedRevision: editor.expectedRevision,
      });
      setEditor(null);
      setBaseline(null);
      setNotice(t("longAgentSettings.memoryDeleted"));
      await loadList();
    } catch (cause) {
      setConflict(cause instanceof LongAgentManagementError && cause.status === 409);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeleting(false);
    }
  };

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setError(null);
    setNotice(null);
    try {
      const response = await searchLongAgentMemory(longAgentId, query);
      setResults(response.results);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSearching(false);
    }
  };

  const reloadCurrent = async () => {
    if (!editor?.expectedRevision) return;
    if (!await confirm(t("longAgentSettings.memoryReloadConfirm"))) return;
    await openFile(editor.path, true);
  };

  // P5 摘要层：条数 · 最近更新 · 大小合计（直接来自 fetchLongAgentMemory 的 files）
  const memoryFiles = memory?.files ?? [];
  const memoryBytes = memoryFiles.reduce((sum, file) => sum + file.size, 0);
  const memoryLatest = memoryFiles.reduce((latest, file) => (file.updatedAt > latest ? file.updatedAt : latest), "");
  const humanBytes = (bytes: number) => (bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`);

  return (
    <div className={styles.memoryTab} data-agent-memory={longAgentId}>
      <div className={styles.sourceLine}>
        <span>{t("longAgentSettings.nanoMemorySource")}</span>
        <span>{t("longAgentSettings.nextTurnEffective")}</span>
      </div>

      {memory === null ? null : (
        <p className={styles.memorySummary} data-agent-memory-summary>
          {t("longAgentSettings.memorySummary", {
            count: String(memoryFiles.length), bytes: humanBytes(memoryBytes),
            updated: memoryLatest === "" ? "—" : memoryLatest.slice(0, 10),
          })}
        </p>
      )}

      <div className={styles.memoryToolbar}>
        <form className={styles.memorySearch} onSubmit={(event) => { event.preventDefault(); void search(); }} role="search">
          <label className={styles.visuallyHidden} htmlFor="agent-memory-search">{t("longAgentSettings.memorySearchLabel")}</label>
          <IconSearch size={17} aria-hidden="true" />
          <input
            id="agent-memory-search"
            type="search"
            value={query}
            placeholder={t("longAgentSettings.memorySearchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
          {results !== null && (
            <Button iconOnly variant="ghost" type="button" className={styles.iconButton} aria-label={t("longAgentSettings.clearSearch")} onClick={() => { setResults(null); setQuery(""); }}>
              <IconX size={16} aria-hidden="true" />
            </Button>
          )}
          <Button variant="secondary" type="submit" className={styles.secondaryButton} disabled={!query.trim() || searching}>
            {searching ? t("longAgentSettings.searching") : t("longAgentSettings.search")}
          </Button>
        </form>
        <Button variant="secondary" type="button" className={styles.secondaryButton} onClick={createFile}>
          <IconFilePlus size={17} aria-hidden="true" />
          {t("longAgentSettings.newMemoryFile")}
        </Button>
        <Button iconOnly variant="ghost" type="button" className={styles.iconButton} aria-label={t("common.refresh")} onClick={() => void loadList()} disabled={loading}>
          <IconRefresh size={17} aria-hidden="true" />
        </Button>
      </div>

      {memory?.stale && (
        <div className={styles.warning} role="status">
          <IconAlertTriangle size={17} aria-hidden="true" />
          <span>{t("longAgentSettings.memoryStale")}</span>
        </div>
      )}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {error && (
        <div className={conflict ? styles.warning : styles.error} role="alert" data-agent-memory-error>
          {conflict && <IconAlertTriangle size={17} aria-hidden="true" />}
          <span><InterfaceFeedback message={conflict ? t("longAgentSettings.memoryConflict") : error} /></span>
          {conflict && editor?.expectedRevision && (
            <button type="button" className={styles.inlineButton} onClick={() => void reloadCurrent()}>
              {t("longAgentSettings.loadLatest")}
            </button>
          )}
        </div>
      )}

      <div className={styles.memoryWorkspace}>
        <section className={styles.memoryBrowser} aria-labelledby="agent-memory-files-heading">
          <div className={styles.memoryBrowserHeader}>
            <h3 id="agent-memory-files-heading">
              {results === null ? t("longAgentSettings.memoryFilesTitle") : t("longAgentSettings.searchResults")}
            </h3>
            <span>{results === null ? memory?.files.length ?? "—" : results.length}</span>
          </div>
          {loading && memory === null ? (
            <div className={styles.listState} role="status">{t("longAgentSettings.memoryLoading")}</div>
          ) : results === null ? (
            memory && memory.files.length > 0 ? (
              <ul className={styles.memoryList}>
                {memory.files.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      className={editor?.path === file.path ? styles.activeMemoryFile : styles.memoryFile}
                      onClick={() => void openFile(file.path)}
                      aria-current={editor?.path === file.path ? "page" : undefined}
                    >
                      <IconFileText size={17} aria-hidden="true" />
                      <span><strong>{fileName(file.path)}</strong><small title={file.path}>{file.path}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.listState}>{t(error && memory === null ? "longAgentSettings.memoryUnavailable" : "longAgentSettings.memoryEmpty")}</div>
            )
          ) : results.length > 0 ? (
            <ul className={styles.searchResultList}>
              {results.map((result) => (
                <li key={`${result.path}:${result.revision}`}>
                  <button type="button" onClick={() => void openFile(result.path)}>
                    <strong>{result.path}</strong>
                    <span>{result.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.listState}>{t("longAgentSettings.noSearchResults")}</div>
          )}
        </section>

        <section className={styles.memoryEditor} aria-labelledby="agent-memory-editor-heading">
          {fileLoading ? (
            <div className={styles.listState} role="status">{t("longAgentSettings.memoryFileLoading")}</div>
          ) : editor ? (
            <>
              <div className={styles.memoryEditorHeader}>
                <div>
                  <h3 id="agent-memory-editor-heading">{editor.path ? fileName(editor.path) : t("longAgentSettings.newMemoryFile")}</h3>
                  <span>{editor.expectedRevision ? t("longAgentSettings.existingMemoryFile") : t("longAgentSettings.newMemoryFileHint")}</span>
                </div>
                <div className={styles.editorActions}>
                  {editor.expectedRevision && !isCoreMemory(editor.path) && (
                    <button type="button" className={styles.dangerButton} onClick={() => void deleteFile()} disabled={deleting || saving}>
                      <IconTrash size={16} aria-hidden="true" />
                      {deleting ? t("longAgentSettings.deleting") : t("longAgentSettings.delete")}
                    </button>
                  )}
                  <Button variant="primary" type="button" className={styles.primaryButton} onClick={() => void saveFile()} disabled={!dirty || saving || deleting}>
                    <IconDeviceFloppy size={16} aria-hidden="true" />
                    {saving ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              </div>
              <label className={styles.editorField}>
                {t("longAgentSettings.memoryPath")}
                <input
                  value={editor.path}
                  readOnly={editor.expectedRevision !== null}
                  placeholder="notes/topic.md"
                  spellCheck={false}
                  onChange={(event) => setEditor((current) => current && ({ ...current, path: event.target.value }))}
                />
                <span>{t("longAgentSettings.memoryPathHelp")}</span>
              </label>
              <label className={styles.editorFieldGrow}>
                {t("longAgentSettings.memoryContent")}
                <textarea
                  value={editor.content}
                  rows={18}
                  spellCheck
                  onChange={(event) => setEditor((current) => current && ({ ...current, content: event.target.value }))}
                />
              </label>
              <div className={styles.editorFooter}>
                <span>{dirty ? t("longAgentSettings.unsaved") : t("longAgentSettings.savedState")}</span>
                {dirty && baseline && (
                  <button type="button" className={styles.inlineButton} onClick={() => setEditor(baseline)}>
                    {t("longAgentSettings.reset")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className={styles.editorEmpty}>
              <IconFileText size={28} aria-hidden="true" />
              <h3 id="agent-memory-editor-heading">{t("longAgentSettings.selectMemoryFile")}</h3>
              <p>{t("longAgentSettings.selectMemoryFileHelp")}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
