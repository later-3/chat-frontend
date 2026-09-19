"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  fetchLongAgentTasks,
  submitLongAgentTask,
  type LongAgentTask,
} from "@/lib/long-agents-browser";
import styles from "./LongAgentSettingsPanel.module.css";

interface Props {
  longAgentId: string;
}

interface Draft {
  readonly taskId: string | null;
  readonly name: string;
  readonly prompt: string;
  readonly recurrence: string;
  readonly reason: string;
}

const EMPTY_DRAFT: Draft = { taskId: null, name: "", prompt: "", recurrence: "", reason: "" };

function formatWhen(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** 定时任务页：全部任务可见（含 Agent 自建的），可创建、修改、启停、立即运行与删除。 */
export function LongAgentTasksSettings({ longAgentId }: Props) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<readonly LongAgentTask[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      setTasks(await fetchLongAgentTasks(longAgentId, signal));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, [longAgentId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const submit = async (input: Parameters<typeof submitLongAgentTask>[1]) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await submitLongAgentTask(longAgentId, input);
      setNotice(t("longAgentSettings.taskSaved"));
      setDraft(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () => {
    if (draft === null) return;
    const prompt = draft.prompt.trim();
    if (prompt === "") {
      setError(t("longAgentSettings.taskPromptRequired"));
      return;
    }
    const recurrence = draft.recurrence.trim();
    void submit(draft.taskId === null
      ? {
          operation: "create",
          ...(draft.name.trim() === "" ? {} : { name: draft.name.trim() }),
          prompt,
          ...(recurrence === "" ? {} : { recurrence }),
          ...(draft.reason.trim() === "" ? {} : { reason: draft.reason.trim() }),
        }
      : {
          operation: "update",
          taskId: draft.taskId,
          prompt,
          ...(recurrence === "" ? {} : { recurrence }),
          ...(draft.reason.trim() === "" ? {} : { reason: draft.reason.trim() }),
        });
  };

  return (
    <section className={styles.section} aria-label={t("longAgentSettings.tasksTab")}>
      <div className={styles.sourceLine}>
        <span>{t("longAgentSettings.tasksIntro")}</span>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setDraft(EMPTY_DRAFT)}>
          {t("longAgentSettings.taskNew")}
        </button>
      </div>
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {tasks === null && <small>{t("longAgentSettings.inspectionLoading")}</small>}
      {tasks !== null && tasks.length === 0 && <p className={styles.help}>{t("longAgentSettings.tasksEmpty")}</p>}

      {tasks !== null && tasks.length > 0 && (
        <ul className={styles.taskList}>
          {tasks.map((task) => (
            <li key={task.id} className={styles.taskRow}>
              <div className={styles.taskHead}>
                <strong>{task.recurrence ?? t("longAgentSettings.taskOneShot")}</strong>
                <small>{task.id}</small>
                <span className={task.status === "paused" ? styles.pending ?? "" : ""}>{task.status}</span>
              </div>
              <p className={styles.taskPrompt}>{task.prompt}</p>
              <dl className={styles.facts}>
                <dt>{t("longAgentSettings.taskNextRun")}</dt><dd>{formatWhen(task.processAfter)}</dd>
                <dt>{t("longAgentSettings.taskCreated")}</dt><dd>{formatWhen(task.createdAt)}</dd>
              </dl>
              <div className={styles.actions}>
                <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void submit({ operation: "run", taskId: task.id, reason: "manual run from web" })}>
                  {t("longAgentSettings.taskRun")}
                </button>
                <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void submit({ operation: task.status === "paused" ? "resume" : "pause", taskId: task.id, reason: "web toggle" })}>
                  {task.status === "paused" ? t("longAgentSettings.taskResume") : t("longAgentSettings.taskPause")}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => setDraft({ taskId: task.id, name: "", prompt: task.prompt, recurrence: task.recurrence ?? "", reason: "" })}
                >
                  {t("longAgentSettings.taskEdit")}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => { if (window.confirm(t("longAgentSettings.taskDeleteConfirm"))) void submit({ operation: "delete", taskId: task.id, reason: "web delete" }); }}
                >
                  {t("common.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft !== null && (
        <div className={styles.resourcePicker}>
          <h3>{draft.taskId === null ? t("longAgentSettings.taskNew") : t("longAgentSettings.taskEdit")}</h3>
          <p className={styles.help}>{t("longAgentSettings.taskFormHint")}</p>
          {draft.taskId === null && <label>{t("longAgentSettings.taskName")}
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>}
          <label>{t("longAgentSettings.taskRecurrence")}
            <input value={draft.recurrence} placeholder="0 8 * * *" onChange={(event) => setDraft({ ...draft, recurrence: event.target.value })} />
          </label>
          <label>{t("longAgentSettings.taskPrompt")}
            <textarea rows={6} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} />
          </label>
          <label>{t("longAgentSettings.taskReason")}
            <input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} />
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setDraft(null)}>{t("common.cancel")}</button>
            <button type="button" className={styles.primaryButton} disabled={busy} onClick={saveDraft}>{busy ? t("common.saving") : t("common.save")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
