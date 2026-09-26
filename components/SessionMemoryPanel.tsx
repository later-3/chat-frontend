"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { editSessionMemory, fetchSessionMemory, TopicsRequestError, type SessionMemoryEntry } from "@/lib/topics-browser";
import styles from "./SessionMemoryPanel.module.css";

/**
 * The ONE session-memory view used by a session surface: it reads a single session's own memory, groups
 * the ACTIVE entries by their purpose tag and lets the owner rewrite an entry (a new entry supersedes the
 * old one, so history stays auditable).
 */
const MEMORY_PURPOSES = ["background", "goal", "experience", "rule", "finding", "hypothesis", "decision", "open-question"];

export function SessionMemoryPanel({ storageProjectId, sessionId, onCount }: {
  readonly storageProjectId: string;
  readonly sessionId: string;
  readonly onCount?: (count: number) => void;
}) {
  const { t } = useI18n();
  const [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState<readonly SessionMemoryEntry[]>([]);
  const [editing, setEditing] = useState<{ entryId: string; purpose: string; content: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const state = await fetchSessionMemory(storageProjectId, sessionId, signal);
    setRevision(state.revision);
    setEntries(state.entries);
    return state.entries;
  }, [storageProjectId, sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    setEditing(null); setConflict(false); setError(null);
    void load(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => controller.abort();
  }, [load]);

  const active = useMemo(() => entries.filter((entry) => entry.status === "active"), [entries]);
  const grouped = useMemo(() => {
    const groups = new Map<string, SessionMemoryEntry[]>();
    for (const entry of active) groups.set(entry.purpose, [...(groups.get(entry.purpose) ?? []), entry]);
    return [...groups.entries()];
  }, [active]);

  useEffect(() => { onCount?.(active.length); }, [active.length, onCount]);

  const save = async () => {
    if (editing === null) return;
    setSaving(true); setConflict(false); setError(null);
    try {
      await editSessionMemory(storageProjectId, sessionId, {
        operation: "supersede", purpose: editing.purpose, content: editing.content,
        supersedes: editing.entryId, expectedRevision: revision,
      });
      setEditing(null);
      await load();
    } catch (cause) {
      // A concurrent writer wins the revision: keep the user's draft and tell them to retry.
      if (cause instanceof TopicsRequestError && cause.status === 409) { setConflict(true); return; }
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return <div className={styles.section}>
    {conflict && <p role="alert" className={styles.error} data-session-memory-conflict>{t("topics.memoryConflict")}</p>}
    {error !== null && <p role="alert" className={styles.error}>{error}</p>}
    {grouped.map(([purpose, group]) => (
      <div key={purpose} className={styles.group}>
        <h5 data-session-memory-purpose-label={purpose}>{purpose}</h5>
        {group.map((entry) => (
          <div key={entry.entryId} className={styles.entry}>
            <span className={styles.author}>{entry.author}</span>
            <button type="button" className={styles.action} data-session-memory-edit={entry.entryId}
              onClick={() => setEditing({ entryId: entry.entryId, purpose: entry.purpose, content: entry.content })}>
              {t("topics.editMemory")}
            </button>
            <div className={styles.content}>{entry.content}</div>
          </div>
        ))}
      </div>
    ))}
    {grouped.length === 0 && <span className={styles.hint}>{t("topics.noMemory")}</span>}
    {editing !== null && (
      <div className={styles.edit}>
        <label className={styles.label}>{t("topics.purposeLabel")}</label>
        <select value={editing.purpose} data-session-memory-purpose
          onChange={(event) => setEditing({ ...editing, purpose: event.target.value })}>
          {MEMORY_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
        </select>
        <textarea value={editing.content} rows={3} data-session-memory-content
          onChange={(event) => setEditing({ ...editing, content: event.target.value })} />
        <div className={styles.actions}>
          <button type="button" className={styles.primary} data-session-memory-save disabled={saving}
            onClick={() => void save()}>{t("topics.saveMemory")}</button>
          <button type="button" className={styles.action} onClick={() => setEditing(null)}>{t("topics.cancel")}</button>
        </div>
      </div>
    )}
  </div>;
}
