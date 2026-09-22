"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  ArtifactRequestError,
  requestFriendArtifacts,
  type FriendArtifacts,
  type FriendArtifact,
} from "@/lib/friend-artifacts";
import { requestFriendTasks, type FriendTask } from "@/lib/friend-tasks";
import styles from "./LongAgentSettingsPanel.module.css";

const WORKSPACE_STATE_KEYS: Record<"clean" | "older" | "edited" | "missing", string> = {
  clean: "deliverables.workspaceClean",
  older: "deliverables.workspaceOlder",
  edited: "deliverables.workspaceEdited",
  missing: "deliverables.workspaceMissing",
};
function workspaceStateKey(state: "clean" | "older" | "edited" | "missing"): string {
  return WORKSPACE_STATE_KEYS[state];
}

export function LongAgentDeliverablesSettings({ longAgentId }: { longAgentId: string }) {
  const { t } = useI18n();
  const [document, setDocument] = useState<FriendArtifacts | null>(null);
  const [tasks, setTasks] = useState<FriendTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [revising, setRevising] = useState<{ artifactId: string; content: string } | null>(null);
  const version = useRef(0);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const v = ++version.current;
      try {
        const [artifacts, taskDocument] = await Promise.all([
          requestFriendArtifacts(longAgentId, undefined, signal),
          requestFriendTasks(longAgentId, undefined, signal),
        ]);
        if (signal?.aborted || v !== version.current) return;
        setDocument(artifacts);
        setTasks(taskDocument.tasks.filter((task) => task.deliverable));
        setError(null);
      } catch (e) {
        if (!signal?.aborted && v === version.current) setError(e instanceof Error ? e.message : String(e));
      }
    },
    [longAgentId],
  );
  useEffect(() => {
    const controller = new AbortController();
    setDocument(null);
    void load(controller.signal);
    const timer = setInterval(() => {
      if (globalThis.document.visibilityState === "visible") void load(controller.signal);
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  const submit = async (
    command: { operation: "resubmit" | "revise" | "notify" | "resolve" | "export"; artifactId: string; content?: string; choice?: "user" | "generated" },
    okKey: string,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestFriendArtifacts(longAgentId, command);
      setDocument(result);
      setNotice(
        command.operation === "export" && result.operationResult
          ? t("deliverables.exported", { path: result.operationResult.relativePath })
          : t(okKey),
      );
      setRevising(null);
      setMine(null);
    } catch (e) {
      setError(e instanceof ArtifactRequestError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const regenerate = async (artifact: FriendArtifact) => {
    const task = tasks.find((candidate) => candidate.id === artifact.taskId);
    if (!task) {
      setError(t("deliverables.taskMissing"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestFriendTasks(longAgentId, { operation: "run", taskId: task.id, expectedRevision: task.revision, requestId: crypto.randomUUID() });
      setNotice(t("deliverables.regenerateQueued"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const byDate = useMemo(() => {
    const groups = new Map<string, FriendArtifact[]>();
    for (const artifact of document?.artifacts ?? []) {
      groups.set(artifact.date, [...(groups.get(artifact.date) ?? []), artifact]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [document]);
  const stateLabel = (state: FriendArtifact["state"]) =>
    t(state === "committed" ? "deliverables.stateCommitted" : state === "pending" ? "deliverables.statePending" : "deliverables.stateFailed");
  return (
    <section className={styles.section} aria-label={t("longAgentSettings.deliverablesTab")}>
      <div className={styles.sourceLine}>
        <span>{t("deliverables.intro")}</span>
        <button className={styles.secondaryButton} disabled={busy} onClick={() => void load()}>
          {t("taskV2.refresh")}
        </button>
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      )}
      <h3>{t("deliverables.slots")}</h3>
      {tasks.length === 0 && <p className={styles.help}>{t("deliverables.slotsEmpty")}</p>}
      <ul className={styles.taskList}>
        {tasks.map((task) => (
          <li key={task.id} className={styles.taskRow}>
            <div className={styles.taskHead}>
              <strong>{task.name}</strong>
              <span>
                {task.deliverable?.kind === "post" ? t("deliverables.kindPost") : t("deliverables.kindNote")} · {task.deliverable?.slot}
                {task.deliverable?.audience ? ` · ${task.deliverable.audience}` : ""}
              </span>
              <small>{t(`taskV2.${task.status}`)}</small>
            </div>
            <p className={styles.help}>
              {task.schedule.kind === "cron" ? task.schedule.expression : task.schedule.kind === "once" ? task.schedule.at : task.schedule.source} · {task.timeZone}
              {task.projection?.nextAt ? ` · ${new Date(task.projection.nextAt).toLocaleString()}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <h3>
        {t("deliverables.artifacts")}
        {document && document.pending > 0 ? ` · ${t("deliverables.pendingCount", { count: String(document.pending) })}` : ""}
      </h3>
      {document && document.artifacts.length === 0 && <p className={styles.help}>{t("deliverables.empty")}</p>}
      {byDate.map(([date, artifacts]) => (
        <div key={date}>
          <h4 className={styles.help}>{date}</h4>
          <ul className={styles.taskList}>
            {artifacts.map((artifact) => (
              <li key={artifact.id} className={styles.taskRow}>
                <div className={styles.taskHead}>
                  <strong>
                    {artifact.kind === "post" ? t("deliverables.kindPost") : t("deliverables.kindNote")} · {artifact.slot}
                  </strong>
                  <span>{stateLabel(artifact.state)}</span>
                  {artifact.revision > 1 && <small>v{artifact.revision}</small>}
                </div>
                <p className={styles.help}>
                  {artifact.kind === "post"
                    ? `${t("deliverables.audience")}: ${artifact.audience ?? "friends"}${artifact.resourceId ? ` · ${artifact.resourceId}` : ""}`
                    : `${t("deliverables.notePath")}: ${artifact.target.kind === "file" ? artifact.target.path : ""} · ${t("deliverables.noteVersion", { revision: String(artifact.revision) })}${artifact.note ? ` · ${t(workspaceStateKey(artifact.note.workspaceState))}` : ""}`}
                </p>
                {(artifact.dutyId || artifact.progressEntryId) && (
                  <p className={styles.help}>
                    {t("deliverables.provenance")}: {artifact.dutyId ?? ""}
                    {artifact.goalRevision !== null ? ` g${artifact.goalRevision}` : ""}
                    {artifact.progressEntryId ? ` · ${artifact.progressEntryId}` : ""}
                  </p>
                )}
                {artifact.failure && (
                  <p className={styles.error}>
                    {artifact.failure}
                    {!artifact.retryable ? ` · ${t("deliverables.blockedHint")}` : ""}
                  </p>
                )}
                {artifact.note?.conflict && (
                  <div className={styles.error}>
                    <p>
                      {t(artifact.note.conflict.source === "version-file" ? "deliverables.conflictVersionFile" : "deliverables.conflictWorkspace")}
                      {" "}
                      {t("deliverables.conflictBothKept", {
                        file: artifact.note.conflict.preservedFile ?? artifact.note.workspacePath,
                        revision: String(artifact.revision),
                      })}
                    </p>
                    {artifact.note.conflictResolution === "generated" && <p>{t("deliverables.conflictKeptGenerated")}</p>}
                    <div className={styles.taskActions}>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => setMine(mine === artifact.id ? null : artifact.id)}>
                        {t(mine === artifact.id ? "deliverables.hideMine" : "deliverables.showMine")}
                      </button>
                      {artifact.note.conflictResolution === null && (
                        <>
                          <button className={styles.secondaryButton} disabled={busy} onClick={() => void submit({ operation: "resolve", artifactId: artifact.id, choice: "user" }, "deliverables.conflictAdopted")}>
                            {t("deliverables.keepMine")}
                          </button>
                          <button className={styles.secondaryButton} disabled={busy} onClick={() => void submit({ operation: "resolve", artifactId: artifact.id, choice: "generated" }, "deliverables.conflictKept")}>
                            {t("deliverables.keepGenerated")}
                          </button>
                        </>
                      )}
                    </div>
                    {mine === artifact.id && <pre className={styles.taskPrompt}>{artifact.note.conflict.content}</pre>}
                  </div>
                )}
                <div className={styles.taskActions}>
                  <button className={styles.secondaryButton} disabled={busy} onClick={() => setExpanded(expanded === artifact.id ? null : artifact.id)}>
                    {t(expanded === artifact.id ? "deliverables.hideContent" : "deliverables.showContent")}
                  </button>
                  {artifact.state !== "committed" && artifact.retryable && (
                    <button className={styles.secondaryButton} disabled={busy} onClick={() => void submit({ operation: "resubmit", artifactId: artifact.id }, "deliverables.resubmitted")}>
                      {t("deliverables.resubmit")}
                    </button>
                  )}
                  {artifact.state === "committed" && artifact.kind === "note" && (
                    <button className={styles.secondaryButton} disabled={busy} onClick={() => setRevising({ artifactId: artifact.id, content: artifact.content })}>
                      {t("deliverables.revise")}
                    </button>
                  )}
                  {artifact.state === "committed" && artifact.kind === "note" && artifact.note && (
                    <button className={styles.secondaryButton} disabled={busy} onClick={() => void submit({ operation: "export", artifactId: artifact.id }, "deliverables.exported")}>
                      {t("deliverables.export")}
                    </button>
                  )}
                  {artifact.kind === "note" && (artifact.revisions.length > 1 || artifact.revisions.some((entry) => entry.origin === "user")) && (
                    <button className={styles.secondaryButton} disabled={busy} onClick={() => setHistory(history === artifact.id ? null : artifact.id)}>
                      {t(history === artifact.id ? "deliverables.hideHistory" : "deliverables.history", { count: String(artifact.revisions.length) })}
                    </button>
                  )}
                  {artifact.state === "committed" && (
                    <button className={styles.secondaryButton} disabled={busy} onClick={() => void submit({ operation: "notify", artifactId: artifact.id }, "deliverables.notified")}>
                      {t("deliverables.notify")}
                    </button>
                  )}
                  <button className={styles.secondaryButton} disabled={busy || !artifact.taskId} onClick={() => void regenerate(artifact)}>
                    {t("deliverables.regenerate")}
                  </button>
                </div>
                {expanded === artifact.id && <pre className={styles.taskPrompt}>{artifact.content}</pre>}
                {history === artifact.id && (
                  <ul className={styles.taskList}>
                    {[...artifact.revisions].sort((left, right) => right.revision - left.revision).map((entry) => (
                      <li key={entry.revision} className={styles.taskRow}>
                        <div className={styles.taskHead}>
                          <strong>v{entry.revision}</strong>
                          <small>
                            {t(entry.origin === "user" ? "deliverables.versionOriginUser" : "deliverables.versionOriginGenerated")}
                            {` · ${new Date(entry.at).toLocaleString()}`}
                          </small>
                        </div>
                        {entry.versionFile && <p className={styles.help}>{entry.versionFile}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {revising?.artifactId === artifact.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit({ operation: "revise", artifactId: artifact.id, content: revising.content }, "deliverables.revised");
                    }}
                  >
                    <label>
                      {t("deliverables.reviseContent")}
                      <textarea required rows={8} maxLength={60000} value={revising.content} disabled={busy} onChange={(e) => setRevising({ ...revising, content: e.target.value })} />
                    </label>
                    <div className={styles.taskActions}>
                      <button className={styles.primaryButton} disabled={busy} type="submit">
                        {t("common.save")}
                      </button>
                      <button className={styles.secondaryButton} disabled={busy} type="button" onClick={() => setRevising(null)}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className={styles.help}>{t("deliverables.legend")}</p>
    </section>
  );
}
