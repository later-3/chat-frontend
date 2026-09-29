"use client";
import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { editSessionMemory, fetchSessionMemory, TopicsRequestError, type SessionMemoryEntry } from "@/lib/topics-browser";

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
  const fieldId = useId();
  const savingRef = useRef(false);
  const targetRef = useRef("");
  const target = `${storageProjectId}/${sessionId}`;
  targetRef.current = target;
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState<readonly SessionMemoryEntry[]>([]);
  const [editing, setEditing] = useState<{ entryId: string; purpose: string; content: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const state = await fetchSessionMemory(storageProjectId, sessionId, signal);
    if (signal?.aborted || targetRef.current !== target) return state.entries;
    setRevision(state.revision);
    setEntries(state.entries);
    return state.entries;
  }, [storageProjectId, sessionId, target]);

  useEffect(() => {
    const controller = new AbortController();
    setEditing(null); setEntries([]); setConflict(false); setError(null); setLoading(true);
    void load(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
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
    if (editing === null || savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setConflict(false); setError(null);
    try {
      await editSessionMemory(storageProjectId, sessionId, {
        operation: "supersede", purpose: editing.purpose, content: editing.content,
        supersedes: editing.entryId, expectedRevision: revision,
      });
      if (targetRef.current !== target) return;
      setEditing(null);
      await load();
    } catch (cause) {
      if (targetRef.current !== target) return;
      // Reload the revision and entries, keeping the draft for the owner to compare before retrying.
      if (cause instanceof TopicsRequestError && cause.status === 409) {
        setConflict(true);
        try { await load(); } catch (reloadError) { setError(reloadError instanceof Error ? reloadError.message : String(reloadError)); }
        return;
      }
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Shared layout classes only (UI/UX §20.4): the dialog body owns the scroll, the
  // rows are cards, and buttons come from the Button primitive.
  return <div className="ui-stack-16">
    {conflict && <div className="surface-notice surface-warning" role="alert" data-session-memory-conflict>{t("topics.memoryConflict")}</div>}
    {error !== null && <div className="surface-notice surface-error" role="alert"><InterfaceFeedback message={error} /></div>}
    {loading && <p className="ui-list-note" role="status">{t("common.loading")}</p>}
    {grouped.map(([purpose, group]) => (
      <section key={purpose} className="ui-stack-8">
        <h2 className="ui-subheading" data-session-memory-purpose-label={purpose}>{purpose}</h2>
        {group.map((entry) => (
          <article key={entry.entryId} className="ui-card">
            <div className="ui-row-between">
              <span className="ui-muted-12-medium">{entry.author}</span>
              <Button variant="ghost" type="button" data-session-memory-edit={entry.entryId}
                onClick={() => setEditing({ entryId: entry.entryId, purpose: entry.purpose, content: entry.content })}>
                {t("topics.editMemory")}
              </Button>
            </div>
            <p className="ui-body">{entry.content}</p>
          </article>
        ))}
      </section>
    ))}
    {!loading && !error && grouped.length === 0 && <p className="ui-list-note">{t("topics.noMemory")}</p>}
    {editing !== null && (
      <section className="ui-card">
        <label className="ui-muted-12-medium" htmlFor={`${fieldId}-purpose`}>{t("topics.purposeLabel")}</label>
        <select id={`${fieldId}-purpose`} value={editing.purpose} data-session-memory-purpose
          onChange={(event) => setEditing({ ...editing, purpose: event.target.value })}>
          {MEMORY_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
        </select>
        <label className="ui-muted-12-medium" htmlFor={`${fieldId}-content`}>{t("design.memoryContent")}</label>
        <textarea id={`${fieldId}-content`} value={editing.content} rows={3} data-session-memory-content
          onChange={(event) => setEditing({ ...editing, content: event.target.value })} />
        <div className="ui-row-6">
          <Button variant="primary" type="button" data-session-memory-save disabled={saving || !editing.content.trim()}
            onClick={() => void save()}>{t("topics.saveMemory")}</Button>
          <Button variant="ghost" type="button" onClick={() => setEditing(null)}>{t("topics.cancel")}</Button>
        </div>
      </section>
    )}
  </div>;
}
