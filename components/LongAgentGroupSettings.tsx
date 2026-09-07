"use client";

import { useCallback, useEffect, useState } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import {
  fetchLongAgentGroup,
  LongAgentManagementError,
  saveLongAgentGroup,
  type LongAgentGroupDocument,
} from "@/lib/long-agent-group-browser";
import { formatAgentMemoryPreview } from "@/lib/long-agent-settings";
import styles from "./LongAgentSettingsPanel.module.css";

interface Props {
  longAgentId: string;
  onDirtyChange: (dirty: boolean) => void;
}

interface Draft {
  readonly name: string;
  readonly standingInstructions: string;
}

function makeDraft(document: LongAgentGroupDocument): Draft {
  return {
    name: document.group.name,
    standingInstructions: document.group.standingInstructions ?? "",
  };
}

function shortRevision(revision: string): string {
  return revision.length > 16 ? `${revision.slice(0, 12)}…` : revision;
}

export function LongAgentGroupSettings({ longAgentId, onDirtyChange }: Props) {
  const { t } = useI18n();
  const [document, setDocument] = useState<LongAgentGroupDocument | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const dirty = draft !== null && baseline !== null && JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setConflict(false);
    try {
      const next = await fetchLongAgentGroup(longAgentId, signal);
      const nextDraft = makeDraft(next);
      setDocument(next);
      setDraft(nextDraft);
      setBaseline(nextDraft);
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
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const save = async () => {
    if (!document || !draft || saving) return;
    if (!draft.name.trim()) {
      setError(t("longAgentSettings.groupNameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    setConflict(false);
    try {
      const next = await saveLongAgentGroup(longAgentId, document.group.revision, {
        name: draft.name.trim(),
        standingInstructions: draft.standingInstructions.trim() || null,
      });
      const nextDraft = makeDraft(next);
      setDocument(next);
      setDraft(nextDraft);
      setBaseline(nextDraft);
      setNotice(t("longAgentSettings.groupSaved"));
    } catch (cause) {
      setConflict(cause instanceof LongAgentManagementError && cause.status === 409);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const loadLatest = () => {
    if (dirty && !window.confirm(t("longAgentSettings.groupReloadConfirm"))) return;
    void load();
  };

  if (loading && document === null) {
    return <div className={styles.state} role="status">{t("longAgentSettings.groupLoading")}</div>;
  }
  if (!document || !draft) {
    return (
      <div className={styles.state} role="alert">
        <strong>{t("longAgentSettings.groupLoadFailed")}</strong>
        {error && <span>{error}</span>}
        <button type="button" className={styles.secondaryButton} onClick={() => void load()}>
          {t("longAgentSettings.retry")}
        </button>
      </div>
    );
  }

  return (
    <form className={styles.tabContent} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className={styles.sourceLine}>
        <span>{t("longAgentSettings.nanoSource")}</span>
        <span>{t("longAgentSettings.nextTurnEffective")}</span>
      </div>

      {document.stale && (
        <div className={styles.warning} role="status">
          <IconAlertTriangle size={17} aria-hidden="true" />
          <span>{t("longAgentSettings.snapshotStale")}</span>
        </div>
      )}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {error && (
        <div className={conflict ? styles.warning : styles.error} role="alert">
          {conflict && <IconAlertTriangle size={17} aria-hidden="true" />}
          <span>{conflict ? t("longAgentSettings.groupConflict") : error}</span>
          {conflict && (
            <button type="button" className={styles.inlineButton} onClick={loadLatest}>
              <IconRefresh size={15} aria-hidden="true" />
              {t("longAgentSettings.loadLatest")}
            </button>
          )}
        </div>
      )}

      <fieldset className={styles.section}>
        <legend>{t("longAgentSettings.groupIdentity")}</legend>
        <div className={styles.twoColumns}>
          <label>
            {t("longAgentSettings.groupName")}
            <input
              value={draft.name}
              maxLength={120}
              onChange={(event) => setDraft((current) => current && ({ ...current, name: event.target.value }))}
            />
          </label>
          <div className={styles.readonlyField}>
            <span>{t("longAgentSettings.groupId")}</span>
            <code title={document.group.id}>{document.group.id}</code>
          </div>
        </div>
        <label>
          {t("longAgentSettings.standingInstructions")}
          <textarea
            rows={10}
            value={draft.standingInstructions}
            onChange={(event) => setDraft((current) => current && ({ ...current, standingInstructions: event.target.value }))}
          />
          <span className={styles.fieldHint}>{t("longAgentSettings.standingInstructionsHelp")}</span>
        </label>
      </fieldset>

      <section className={styles.section} aria-labelledby="long-agent-workspace-heading">
        <h3 id="long-agent-workspace-heading">{t("longAgentSettings.workspace")}</h3>
        <dl className={styles.facts}>
          <dt>{t("longAgentSettings.workspaceName")}</dt>
          <dd>{document.workspace.folder}</dd>
          <dt>{t("longAgentSettings.memoryFiles")}</dt>
          <dd>{document.workspace.memoryFileCount}</dd>
          <dt>{t("longAgentSettings.snapshotRevision")}</dt>
          <dd title={document.group.revision}>{shortRevision(document.group.revision)}</dd>
          <dt>{t("longAgentSettings.snapshotFetchedAt")}</dt>
          <dd>{new Date(document.fetchedAt).toLocaleString()}</dd>
        </dl>
        <p className={styles.help}>{t("longAgentSettings.workspaceHelp")}</p>
      </section>

      <section className={styles.section} aria-labelledby="long-agent-core-memory-heading">
        <h3 id="long-agent-core-memory-heading">{t("longAgentSettings.coreMemory")}</h3>
        <div className={styles.coreMemoryGrid}>
          {[document.coreMemory.index, document.coreMemory.definition].map((file) => (
            <div key={file.path} className={styles.coreMemoryCard}>
              <code title={file.path}>{file.path}</code>
              <span title={file.revision}>{t("longAgentSettings.revisionValue", { revision: shortRevision(file.revision) })}</span>
              <p>{formatAgentMemoryPreview(file.content) || t("longAgentSettings.emptyFile")}</p>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.actions}>
        <span>{dirty ? t("longAgentSettings.unsaved") : t("longAgentSettings.savedState")}</span>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!dirty || saving}
          onClick={() => { if (baseline) setDraft(baseline); }}
        >
          {t("longAgentSettings.reset")}
        </button>
        <button type="submit" className={styles.primaryButton} disabled={!dirty || saving}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}
