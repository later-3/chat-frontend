"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  TaskRequestError,
  readPendingTaskCommand,
  savePendingTaskCommand,
  requestFriendTasks,
  type FriendTasks,
  type FriendTask,
  type TaskCommand,
  type TaskDefinition,
} from "@/lib/friend-tasks";
import {
  fetchChatProjects,
  type ChatProjectSummary,
} from "@/lib/projects-contract";
import styles from "./LongAgentSettingsPanel.module.css";
interface Draft {
  task: FriendTask | null;
  requestId: string;
  definition: TaskDefinition;
}
export function LongAgentTasksSettings({
  longAgentId,
}: {
  longAgentId: string;
}) {
  const { t } = useI18n();
  const [document, setDocument] = useState<FriendTasks | null>(null);
  const [projects, setProjects] = useState<ChatProjectSummary[]>([]),
    [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const version = useRef(0);
  const pending = useRef<TaskCommand | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const v = ++version.current;
      try {
        const result = await requestFriendTasks(longAgentId, undefined, signal);
        if (!signal?.aborted && v === version.current) {
          setDocument(result);
          setError(null);
        }
      } catch (e) {
        if (!signal?.aborted && v === version.current)
          setError(e instanceof Error ? e.message : String(e));
      }
    },
    [longAgentId],
  );
  useEffect(() => {
    generation.current++;
    setDocument(null);
    setDraft(null);
    setBusy(false);
    pending.current = readPendingTaskCommand(longAgentId);
    setNotice(pending.current ? t("taskV2.retryPending") : null);
    const c = new AbortController();
    void load(c.signal);
    void fetchChatProjects(c.signal)
      .then(setProjects)
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    const timer = setInterval(() => {
      if (globalThis.document.visibilityState === "visible" && !pending.current)
        void load(c.signal);
    }, 5000);
    return () => {
      generation.current++;
      c.abort();
      clearInterval(timer);
      version.current++;
    };
  }, [load]);
  const submit = async (command: TaskCommand) => {
    if (busy) return;
    const g = generation.current;
    pending.current = command;
    try {
      savePendingTaskCommand(longAgentId, command);
    } catch {
      setError(t("taskV2.storageError"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    version.current++;
    try {
      const result = await requestFriendTasks(longAgentId, command);
      savePendingTaskCommand(longAgentId, null);
      if (g !== generation.current) return;
      setDocument(result);
      setDraft(null);
      pending.current = null;
      setNotice(
        t(
          result.applied === false
            ? "taskV2.pendingApply"
            : "longAgentSettings.taskSaved",
        ),
      );
    } catch (e) {
      if (g !== generation.current) return;
      if (e instanceof TaskRequestError && e.status < 500) {
        pending.current = null;
        savePendingTaskCommand(longAgentId, null);
      }
      setError(
        e instanceof TypeError
          ? t("taskV2.connectionLost")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      if (g === generation.current) setBusy(false);
    }
  };
  const edit = (task: FriendTask | null) => {
    pending.current = null;
    setDraft({
      task,
      requestId: crypto.randomUUID(),
      definition: task
        ? {
            name: task.name,
            prompt: task.prompt,
            contextProjectId: task.contextProjectId,
            timeZone: task.timeZone,
            schedule: task.schedule,
            missed: task.missed,
            overlap: task.overlap,
            ...(task.deliverable === undefined ? {} : { deliverable: task.deliverable }),
          }
        : {
            name: "",
            prompt: "",
            contextProjectId: null,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            schedule: { kind: "cron", expression: "0 8 * * *" },
            missed: "skip",
            overlap: "skip",
          },
    });
  };
  const change = (patch: Partial<TaskDefinition>) => {
    if (draft)
      setDraft({ ...draft, definition: { ...draft.definition, ...patch } });
  };
  const action = (
    task: FriendTask,
    operation: "pause" | "resume" | "cancel" | "run",
  ) =>
    void submit({
      operation,
      taskId: task.id,
      expectedRevision: task.revision,
      ...(operation === "run" ? { requestId: crypto.randomUUID() } : {}),
    });
  return (
    <section
      className={styles.section}
      aria-label={t("longAgentSettings.tasksTab")}
    >
      <div className={styles.sourceLine}>
        <span>{t("taskV2.intro")}</span>
        <button
          className={styles.secondaryButton}
          disabled={busy || !!pending.current}
          onClick={() => edit(null)}
        >
          {t("longAgentSettings.taskNew")}
        </button>
        <button
          className={styles.secondaryButton}
          disabled={busy}
          onClick={() => {
            void load();
          }}
        >
          {t("taskV2.refresh")}
        </button>
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {pending.current && !busy && (
        <button
          className={styles.secondaryButton}
          onClick={() => void submit(pending.current!)}
        >
          {t("taskV2.retry")}
        </button>
      )}
      {notice && (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      )}
      {document?.projectionError && (
        <p className={styles.error}>{document.projectionError}</p>
      )}
      {!document && (
        <p role="status">{t("longAgentSettings.inspectionLoading")}</p>
      )}
      {document?.tasks.length === 0 && (
        <p className={styles.help}>{t("longAgentSettings.tasksEmpty")}</p>
      )}
      {draft && (
        <form
          className={styles.resourcePicker}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(
              draft.task
                ? {
                    operation: "update",
                    taskId: draft.task.id,
                    expectedRevision: draft.task.revision,
                    definition: draft.definition,
                  }
                : {
                    operation: "create",
                    requestId: draft.requestId,
                    definition: draft.definition,
                  },
            );
          }}
        >
          <h3>
            {t(
              draft.task
                ? "longAgentSettings.taskEdit"
                : "longAgentSettings.taskNew",
            )}
          </h3>
          <label>
            {t("taskV2.name")}
            <input
              required
              maxLength={120}
              value={draft.definition.name}
              disabled={busy || !!pending.current}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
          <label>
            {t("taskV2.project")}
            <select
              value={draft.definition.contextProjectId ?? ""}
              disabled={busy || !!pending.current}
              onChange={(e) =>
                change({ contextProjectId: e.target.value || null })
              }
            >
              <option value="">{t("taskV2.noProject")}</option>
              {projects
                .filter((p) => p.kind === "project")
                .map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.cachedName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t("taskV2.trigger")}
            <select
              value={draft.definition.schedule.kind}
              disabled={busy || !!pending.current}
              onChange={(e) =>
                change({
                  schedule:
                    e.target.value === "once"
                      ? {
                          kind: "once",
                          at: new Date(Date.now() + 3600000).toISOString(),
                        }
                      : e.target.value === "event"
                        ? { kind: "event", source: "materials" }
                        : { kind: "cron", expression: "0 8 * * *" },
                })
              }
            >
              <option value="once">{t("taskV2.once")}</option>
              <option value="cron">{t("taskV2.cron")}</option>
              <option value="event">{t("taskV2.event")}</option>
            </select>
          </label>
          <label>
            {t(
              draft.definition.schedule.kind === "once"
                ? "taskV2.at"
                : draft.definition.schedule.kind === "cron"
                  ? "taskV2.expression"
                  : "taskV2.source",
            )}
            <input
              required
              disabled={busy || !!pending.current}
              value={
                draft.definition.schedule.kind === "once"
                  ? draft.definition.schedule.at
                  : draft.definition.schedule.kind === "cron"
                    ? draft.definition.schedule.expression
                    : draft.definition.schedule.source
              }
              onChange={(e) =>
                change({
                  schedule:
                    draft.definition.schedule.kind === "once"
                      ? { kind: "once", at: e.target.value }
                      : draft.definition.schedule.kind === "cron"
                        ? { kind: "cron", expression: e.target.value }
                        : { kind: "event", source: e.target.value },
                })
              }
            />
          </label>
          <label>
            {t("taskV2.timeZone")}
            <input
              required
              disabled={busy || !!pending.current}
              value={draft.definition.timeZone}
              onChange={(e) => change({ timeZone: e.target.value })}
            />
          </label>
          <p className={styles.help}>{t("taskV2.clockHint")}</p>
          {draft.definition.schedule.kind === "event" && (
            <p className={styles.help}>{t("taskV2.eventHint")}</p>
          )}
          <label>
            {t("taskV2.missed")}
            <select
              disabled={busy || !!pending.current}
              value={draft.definition.missed}
              onChange={(e) =>
                change({ missed: e.target.value as TaskDefinition["missed"] })
              }
            >
              <option value="skip">{t("taskV2.skipMissed")}</option>
              <option value="latest">{t("taskV2.latest")}</option>
            </select>
          </label>
          <label>
            {t("taskV2.overlap")}
            <select
              disabled={busy || !!pending.current}
              value={draft.definition.overlap}
              onChange={(e) =>
                change({ overlap: e.target.value as TaskDefinition["overlap"] })
              }
            >
              <option value="skip">{t("taskV2.skipOverlap")}</option>
              <option value="queue-one">{t("taskV2.queueOne")}</option>
            </select>
          </label>
          <label>
            {t("taskV2.deliverable")}
            <select
              value={draft.definition.deliverable?.kind ?? ""}
              disabled={busy || !!pending.current}
              onChange={(e) =>
                change({
                  deliverable:
                    e.target.value === ""
                      ? undefined
                      : { kind: e.target.value as "post" | "note", slot: draft.definition.deliverable?.slot ?? "morning", ...(e.target.value === "post" ? { audience: draft.definition.deliverable?.audience ?? "friends" } : {}) },
                })
              }
            >
              <option value="">{t("taskV2.deliverableNone")}</option>
              <option value="post">{t("taskV2.deliverablePost")}</option>
              <option value="note">{t("taskV2.deliverableNote")}</option>
            </select>
          </label>
          {draft.definition.deliverable && (
            <>
              <label>
                {t("taskV2.deliverableSlot")}
                <input
                  required
                  maxLength={40}
                  value={draft.definition.deliverable.slot}
                  disabled={busy || !!pending.current}
                  onChange={(e) =>
                    change({ deliverable: { ...draft.definition.deliverable!, slot: e.target.value } })
                  }
                />
              </label>
              {draft.definition.deliverable.kind === "post" && (
                <label>
                  {t("taskV2.deliverableAudience")}
                  <select
                    value={draft.definition.deliverable.audience ?? "friends"}
                    disabled={busy || !!pending.current}
                    onChange={(e) =>
                      change({ deliverable: { ...draft.definition.deliverable!, audience: e.target.value as "friends" | "self" } })
                    }
                  >
                    <option value="friends">{t("taskV2.audienceFriends")}</option>
                    <option value="self">{t("taskV2.audienceSelf")}</option>
                  </select>
                </label>
              )}
              <p className={styles.help}>{t("taskV2.deliverableHint")}</p>
            </>
          )}
          <label>
            {t("longAgentSettings.taskPrompt")}
            <textarea
              required
              maxLength={65536}
              rows={5}
              value={draft.definition.prompt}
              disabled={busy || !!pending.current}
              onChange={(e) => change({ prompt: e.target.value })}
            />
          </label>
          <div className={styles.taskActions}>
            <button
              className={styles.primaryButton}
              disabled={busy || !!pending.current}
              type="submit"
            >
              {t("common.save")}
            </button>
            <button
              className={styles.secondaryButton}
              disabled={busy || !!pending.current}
              type="button"
              onClick={() => setDraft(null)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
      <ul className={styles.taskList}>
        {document?.tasks.map((task) => (
          <li key={task.id} className={styles.taskRow}>
            <div className={styles.taskHead}>
              <strong>{task.name}</strong>
              <span>{t(`taskV2.${task.status}`)}</span>
              <small>v{task.revision}</small>
            </div>
            <p className={styles.taskPrompt}>{task.prompt}</p>
            <p className={styles.help}>
              {task.schedule.kind === "cron"
                ? task.schedule.expression
                : task.schedule.kind === "once"
                  ? task.schedule.at
                  : task.schedule.source}{" "}
              · {task.timeZone}
            </p>
            <p className={styles.help}>
              {t(task.projection ? "taskV2.applied" : "taskV2.pendingApply")}
              {task.projection?.nextAt
                ? ` · ${new Date(task.projection.nextAt).toLocaleString()}`
                : ""}
            </p>
            {task.migrationNote && (
              <p className={styles.error}>{task.migrationNote}</p>
            )}
            {task.legacyId && (
              <p className={styles.help}>
                {t("taskV2.migrated")}: {task.legacyId}
              </p>
            )}
            {task.status !== "cancelled" && (
              <div className={styles.taskActions}>
                <button
                  className={styles.secondaryButton}
                  disabled={busy || !!pending.current}
                  onClick={() => action(task, "run")}
                >
                  {t("longAgentSettings.taskRun")}
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={busy || !!pending.current}
                  onClick={() =>
                    action(task, task.status === "paused" ? "resume" : "pause")
                  }
                >
                  {t(
                    task.status === "paused"
                      ? "longAgentSettings.taskResume"
                      : "longAgentSettings.taskPause",
                  )}
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={busy || !!pending.current}
                  onClick={() => edit(task)}
                >
                  {t("longAgentSettings.taskEdit")}
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={busy || !!pending.current}
                  onClick={() => action(task, "cancel")}
                >
                  {t("taskV2.cancelFuture")}
                </button>
              </div>
            )}
            <details>
              <summary>
                {t("taskV2.runs")} (
                {
                  document.occurrences.filter((o) => o.taskId === task.id)
                    .length
                }
                )
              </summary>
              <ul className={styles.taskList}>
                {document.occurrences
                  .filter((o) => o.taskId === task.id)
                  .slice()
                  .reverse()
                  .map((o) => (
                    <li key={o.id} className={styles.taskOccurrence}>
                      <span>
                        {new Date(o.scheduledAt).toLocaleString()} ·{" "}
                        {o.work?.execution
                          ? t(`friendWork.status.${o.work.execution.status}`)
                          : t(`taskV2.${o.state}`)}
                      </span>
                      {o.reason && <p>{o.reason}</p>}
                      {o.work && (
                        <a
                          href={`/?session=${encodeURIComponent(o.work.work.sessionId)}&projectId=${encodeURIComponent(longAgentId)}`}
                        >
                          {t("taskV2.openResult")}
                        </a>
                      )}
                      {(o.state === "accepted" ||
                        o.work?.execution?.capabilities.cancel) && (
                        <button
                          className={styles.secondaryButton}
                          disabled={busy || !!pending.current}
                          onClick={() =>
                            void submit({
                              operation: "cancel-run",
                              occurrenceId: o.id,
                              expectedTurnId: o.work?.execution?.id,
                            })
                          }
                        >
                          {t("taskV2.stopRun")}
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
