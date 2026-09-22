"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  DutyRequestError,
  readPendingDutyCommand,
  savePendingDutyCommand,
  requestFriendDuties,
  type FriendDuties,
  type FriendDuty,
  type DutyCommand,
  type DutyDefinition,
} from "@/lib/friend-duties";
import {
  fetchChatProjects,
  type ChatProjectSummary,
} from "@/lib/projects-contract";
import styles from "./LongAgentSettingsPanel.module.css";
interface Draft {
  duty: FriendDuty | null;
  requestId: string;
  definition: DutyDefinition;
}
export function LongAgentDutiesSettings({
  longAgentId,
}: {
  longAgentId: string;
}) {
  const { t } = useI18n();
  const [document, setDocument] = useState<FriendDuties | null>(null);
  const [projects, setProjects] = useState<ChatProjectSummary[]>([]),
    [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{
    duty: FriendDuty;
    summary: string;
    nextStep: string;
    unitsDone: string;
  } | null>(null);
  const generation = useRef(0);
  const version = useRef(0);
  const pending = useRef<DutyCommand | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const v = ++version.current;
      try {
        const result = await requestFriendDuties(longAgentId, undefined, signal);
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
    pending.current = readPendingDutyCommand(longAgentId);
    setNotice(pending.current ? t("dutyV2.retryPending") : null);
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
  }, [load, t]);
  const submit = async (command: DutyCommand) => {
    if (busy) return;
    const g = generation.current;
    pending.current = command;
    try {
      savePendingDutyCommand(longAgentId, command);
    } catch {
      setError(t("dutyV2.storageError"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    version.current++;
    try {
      const result = await requestFriendDuties(longAgentId, command);
      savePendingDutyCommand(longAgentId, null);
      if (g !== generation.current) return;
      setDocument(result);
      setDraft(null);
      pending.current = null;
      setNotice(
        result.applied === false
          ? result.syncError ?? t("dutyV2.pendingApply")
          : t("dutyV2.saved"),
      );
    } catch (e) {
      if (g !== generation.current) return;
      if (e instanceof DutyRequestError && e.status < 500) {
        pending.current = null;
        savePendingDutyCommand(longAgentId, null);
      }
      setError(
        e instanceof TypeError
          ? t("dutyV2.connectionLost")
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      if (g === generation.current) setBusy(false);
    }
  };
  const edit = (duty: FriendDuty | null) => {
    pending.current = null;
    setDraft({
      duty,
      requestId: crypto.randomUUID(),
      definition: duty
        ? {
            name: duty.name,
            objective: duty.objective,
            materials: duty.materials,
            contextProjectId: duty.contextProjectId,
            outcome: duty.outcome,
            timeZone: duty.timeZone,
            cadence: duty.cadence,
            allowedHours: duty.allowedHours,
            budget: duty.budget,
            totalUnits: duty.totalUnits,
          }
        : {
            name: "",
            objective: "",
            materials: [],
            contextProjectId: null,
            outcome: "",
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            cadence: { kind: "none" },
            allowedHours: null,
            budget: null,
            totalUnits: null,
          },
    });
  };
  const change = (patch: Partial<DutyDefinition>) => {
    if (draft) setDraft({ ...draft, definition: { ...draft.definition, ...patch } });
  };
  const materialsText = draft?.definition.materials.join("\n") ?? "";
  const liveOccurrences = (duty: FriendDuty) =>
    duty.linkedOccurrences.filter(
      (o) =>
        (o.state === "accepted" || o.state === "started") &&
        (o.work === null ||
          o.work.execution === null ||
          ["queued", "running"].includes(o.work.execution.status)),
    );
  const skippedOccurrences = (duty: FriendDuty) =>
    duty.linkedOccurrences.filter((o) => o.state === "skipped" || o.state === "blocked");
  const action = (
    duty: FriendDuty,
    operation: "pause" | "resume" | "end" | "advance",
  ) =>
    void submit({
      operation,
      dutyId: duty.id,
      expectedRevision: duty.revision,
      ...(operation === "advance" ? { requestId: crypto.randomUUID() } : {}),
    });
  const submitCorrection = () => {
    if (!correction) return;
    void submit({
      operation: "report",
      dutyId: correction.duty.id,
      expectedRevision: correction.duty.revision,
      requestId: crypto.randomUUID(),
      report: {
        summary: correction.summary,
        evidence: [],
        unitsDone:
          correction.unitsDone.trim() === "" ? null : Number(correction.unitsDone),
        nextStep: correction.nextStep.trim() === "" ? null : correction.nextStep.trim(),
        nextCheckAt: null,
        awaitingMaterial: false,
      },
    });
  };
  return (
    <section className={styles.section} aria-label={t("longAgentSettings.dutiesTab")}>
      <div className={styles.sourceLine}>
        <span>{t("dutyV2.intro")}</span>
        <button
          className={styles.secondaryButton}
          disabled={busy || !!pending.current}
          onClick={() => edit(null)}
        >
          {t("dutyV2.new")}
        </button>
        <button
          className={styles.secondaryButton}
          disabled={busy}
          onClick={() => {
            void load();
          }}
        >
          {t("dutyV2.refresh")}
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
          {t("dutyV2.retry")}
        </button>
      )}
      {notice && (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      )}
      {document?.projectionError && <p className={styles.error}>{document.projectionError}</p>}
      {!document && <p role="status">{t("longAgentSettings.inspectionLoading")}</p>}
      {document?.duties.length === 0 && (
        <p className={styles.help}>{t("dutyV2.empty")}</p>
      )}
      {draft && (
        <form
          className={styles.resourcePicker}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(
              draft.duty
                ? {
                    operation: "update",
                    dutyId: draft.duty.id,
                    expectedRevision: draft.duty.revision,
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
          <h3>{t(draft.duty ? "dutyV2.edit" : "dutyV2.new")}</h3>
          <label>
            {t("dutyV2.name")}
            <input
              required
              maxLength={120}
              value={draft.definition.name}
              disabled={busy || !!pending.current}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
          <label>
            {t("dutyV2.objective")}
            <textarea
              required
              maxLength={65536}
              rows={3}
              value={draft.definition.objective}
              disabled={busy || !!pending.current}
              onChange={(e) => change({ objective: e.target.value })}
            />
          </label>
          <label>
            {t("dutyV2.outcome")}
            <textarea
              required
              maxLength={65536}
              rows={2}
              value={draft.definition.outcome}
              disabled={busy || !!pending.current}
              onChange={(e) => change({ outcome: e.target.value })}
            />
          </label>
          <label>
            {t("dutyV2.materials")}
            <textarea
              maxLength={102400}
              rows={3}
              placeholder={t("dutyV2.materialsHint")}
              value={materialsText}
              disabled={busy || !!pending.current}
              onChange={(e) =>
                change({
                  materials: e.target.value
                    .split("\n")
                    .map((m) => m.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            {t("dutyV2.project")}
            <select
              value={draft.definition.contextProjectId ?? ""}
              disabled={busy || !!pending.current}
              onChange={(e) => change({ contextProjectId: e.target.value || null })}
            >
              <option value="">{t("dutyV2.noProject")}</option>
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
            {t("dutyV2.cadence")}
            <select
              value={draft.definition.cadence.kind}
              disabled={busy || !!pending.current}
              onChange={(e) =>
                change({
                  cadence:
                    e.target.value === "cron"
                      ? { kind: "cron", expression: "0 8 * * *" }
                      : { kind: "none" },
                })
              }
            >
              <option value="none">{t("dutyV2.manualOnly")}</option>
              <option value="cron">{t("dutyV2.cron")}</option>
            </select>
          </label>
          {draft.definition.cadence.kind === "cron" && (
            <label>
              {t("dutyV2.expression")}
              <input
                required
                disabled={busy || !!pending.current}
                value={draft.definition.cadence.expression}
                onChange={(e) =>
                  change({ cadence: { kind: "cron", expression: e.target.value } })
                }
              />
            </label>
          )}
          <label>
            {t("dutyV2.timeZone")}
            <input
              required
              disabled={busy || !!pending.current}
              value={draft.definition.timeZone}
              onChange={(e) => change({ timeZone: e.target.value })}
            />
          </label>
          <div>
            {t("dutyV2.allowedHours")}
            <div className={styles.taskActions}>
              <select
                value={draft.definition.allowedHours?.start ?? ""}
                disabled={busy || !!pending.current}
                onChange={(e) =>
                  change({
                    allowedHours:
                      e.target.value === ""
                        ? null
                        : {
                            start: Number(e.target.value),
                            end: draft.definition.allowedHours?.end ?? 22,
                          },
                  })
                }
              >
                <option value="">{t("dutyV2.allDay")}</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              {draft.definition.allowedHours && (
                <select
                  value={draft.definition.allowedHours.end}
                  disabled={busy || !!pending.current}
                  onChange={(e) =>
                    change({
                      allowedHours: {
                        start: draft.definition.allowedHours!.start,
                        end: Number(e.target.value),
                      },
                    })
                  }
                >
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <label>
            {t("dutyV2.budget")}
            <input
              type="number"
              min={1}
              placeholder={t("dutyV2.budgetHint")}
              value={draft.definition.budget?.tokensPerDay ?? ""}
              disabled={busy || !!pending.current}
              onChange={(e) =>
                change({
                  budget:
                    e.target.value === ""
                      ? null
                      : { tokensPerDay: Number(e.target.value) },
                })
              }
            />
          </label>
          <label>
            {t("dutyV2.totalUnits")}
            <input
              type="number"
              min={1}
              placeholder={t("dutyV2.totalUnitsHint")}
              value={draft.definition.totalUnits ?? ""}
              disabled={busy || !!pending.current}
              onChange={(e) =>
                change({
                  totalUnits: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <p className={styles.help}>{t("dutyV2.budgetDisclaimer")}</p>
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
      {correction && (
        <form
          className={styles.resourcePicker}
          onSubmit={(e) => {
            e.preventDefault();
            submitCorrection();
          }}
        >
          <h3>{t("dutyV2.correct")}：{correction.duty.name}</h3>
          <label>
            {t("dutyV2.correctSummary")}
            <textarea
              required
              maxLength={20000}
              rows={3}
              value={correction.summary}
              disabled={busy || !!pending.current}
              onChange={(e) => setCorrection({ ...correction, summary: e.target.value })}
            />
          </label>
          <label>
            {t("dutyV2.nextStep")}
            <input
              maxLength={65536}
              value={correction.nextStep}
              disabled={busy || !!pending.current}
              onChange={(e) => setCorrection({ ...correction, nextStep: e.target.value })}
            />
          </label>
          <label>
            {t("dutyV2.correctUnits")}
            <input
              type="number"
              min={0}
              value={correction.unitsDone}
              disabled={busy || !!pending.current}
              onChange={(e) => setCorrection({ ...correction, unitsDone: e.target.value })}
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
              onClick={() => setCorrection(null)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
      <ul className={styles.taskList}>
        {document?.duties.map((duty) => (
          <li key={duty.id} className={styles.taskRow}>
            <div className={styles.taskHead}>
              <strong>{duty.name}</strong>
              <span>{t(`dutyV2.${duty.status}`)}</span>
              <small>
                v{duty.revision}
                {duty.goalRevision !== duty.revision ? ` · ${t("dutyV2.goalRevision")} g${duty.goalRevision}` : ""}
              </small>
            </div>
            <p className={styles.taskPrompt}>{duty.objective}</p>
            <p className={styles.help}>
              {duty.totalUnits !== null
                ? `${t("dutyV2.progress")}: ${duty.unitsDone ?? 0}/${duty.totalUnits}${duty.percent !== null ? ` (${duty.percent}%)` : ""}`
                : duty.unitsDone !== null
                  ? `${t("dutyV2.progress")}: ${duty.unitsDone}`
                  : t("dutyV2.progressUnknown")}
              {duty.budget
                ? ` · ${t("dutyV2.tokensToday")}: ${duty.tokensToday}/${duty.budget.tokensPerDay}`
                : ""}
              {duty.budgetExhausted ? ` · ${t("dutyV2.budgetExhausted")}` : ""}
            </p>
            {duty.awaitingMaterial && (
              <p className={styles.error}>{t("dutyV2.awaitingMaterial")}</p>
            )}
            <p className={styles.help}>
              {t("dutyV2.nextStep")}: {duty.nextStep ?? t("dutyV2.noNextStep")}
              {duty.nextCheckAt
                ? ` · ${t("dutyV2.nextCheck")}: ${new Date(duty.nextCheckAt).toLocaleString()}`
                : ""}
            </p>
            <p className={styles.help}>
              {duty.cadence.kind === "cron"
                ? `${duty.cadence.expression} · ${duty.timeZone}`
                : t("dutyV2.manualOnly")}
              {duty.allowedHours
                ? ` · ${t("dutyV2.allowedHours")}: ${duty.allowedHours.start}–${duty.allowedHours.end}`
                : ""}
            </p>
            <p className={styles.help}>
              {duty.linkedTask
                ? t(duty.linkedTask.projection ? "taskV2.applied" : "taskV2.pendingApply")
                : t("dutyV2.taskPending")}
              {duty.linkedTask?.projection?.nextAt
                ? ` · ${t("dutyV2.nextAuto")}: ${new Date(duty.linkedTask.projection.nextAt).toLocaleString()}`
                : ""}
            </p>
            {duty.status !== "ended" && (
              <div className={styles.taskActions}>
                <button
                  className={styles.secondaryButton}
                  disabled={busy || !!pending.current}
                  onClick={() => action(duty, "advance")}
                >
                  {t("dutyV2.advanceNow")}
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={busy || !!pending.current}
                  onClick={() => action(duty, duty.status === "paused" ? "resume" : "pause")}
                >
                  {t(duty.status === "paused" ? "dutyV2.resume" : "dutyV2.pause")}
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={busy || !!pending.current}
                  onClick={() => edit(duty)}
                >
                  {t("dutyV2.edit")}
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={busy || !!pending.current}
                  onClick={() =>
                    setCorrection({ duty, summary: "", nextStep: duty.nextStep ?? "", unitsDone: duty.unitsDone === null ? "" : String(duty.unitsDone) })
                  }
                >
                  {t("dutyV2.correct")}
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={busy || !!pending.current}
                  onClick={() => action(duty, "end")}
                >
                  {t("dutyV2.end")}
                </button>
              </div>
            )}
            {liveOccurrences(duty).length > 0 && (
              <div className={styles.taskOccurrence} role="status">
                <span>{t("dutyV2.inProgress")}</span>
                <ul className={styles.taskList}>
                {liveOccurrences(duty)
                  .map((o) => (
                    <li key={`live-${o.id}`} className={styles.taskOccurrence}>
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
                      <button
                        className={styles.secondaryButton}
                        disabled={busy || !!pending.current}
                        onClick={() =>
                          void submit({
                            operation: "cancel-advance",
                            dutyId: duty.id,
                            expectedRevision: duty.revision,
                            occurrenceId: o.id,
                            expectedTurnId: o.work?.execution?.id,
                          })
                        }
                      >
                        {t("taskV2.stopRun")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <details>
              <summary>
                {t("dutyV2.advancements")} ({duty.advancements.length + liveOccurrences(duty).length})
              </summary>
              <ul className={styles.taskList}>
                {duty.advancements.map((a) => {
                  const occurrence = duty.linkedOccurrences.find(
                    (o) => o.id === a.advancementKey,
                  );
                  return (
                    <li key={a.advancementKey} className={styles.taskOccurrence}>
                      <span>
                        {new Date(a.at).toLocaleString()} · {t(`dutyV2.adv.${a.status}`)} ·{" "}
                        {a.tokens} tokens
                        {a.superseded ? ` · ${t("dutyV2.superseded")}` : ""}
                      </span>
                      {occurrence?.reason && <p>{occurrence.reason}</p>}
                      {occurrence?.work && (
                        <a
                          href={`/?session=${encodeURIComponent(occurrence.work.work.sessionId)}&projectId=${encodeURIComponent(longAgentId)}`}
                        >
                          {t("taskV2.openResult")}
                        </a>
                      )}
                      {occurrence &&
                        (occurrence.state === "accepted" ||
                          occurrence.work?.execution?.capabilities.cancel) && (
                          <button
                            className={styles.secondaryButton}
                            disabled={busy || !!pending.current}
                            onClick={() =>
                              void submit({
                                operation: "cancel-advance",
                                dutyId: duty.id,
                                expectedRevision: duty.revision,
                                occurrenceId: occurrence.id,
                                expectedTurnId: occurrence.work?.execution?.id,
                              })
                            }
                          >
                            {t("taskV2.stopRun")}
                          </button>
                        )}
                    </li>
                  );
                })}
              </ul>
            </details>
            <details>
              <summary>
                {t("dutyV2.progressHistory")} ({duty.progress.length})
              </summary>
              <ul className={styles.taskList}>
                {duty.progress
                  .slice()
                  .reverse()
                  .map((p) => (
                    <li key={p.id} className={styles.taskOccurrence}>
                      <span>
                        {new Date(p.at).toLocaleString()} ·{" "}
                        {t(p.source === "agent" ? "dutyV2.byAgent" : "dutyV2.byUser")}
                        {p.superseded ? ` · ${t("dutyV2.superseded")}` : ""}
                        {!p.applied ? ` · ${t("dutyV2.notApplied")}` : ""}
                        {p.unitsDone !== null ? ` · ${t("dutyV2.progress")}: ${p.unitsDone}` : ""}
                      </span>
                      <p>{p.summary}</p>
                      {p.evidence.length > 0 && (
                        <p className={styles.help}>
                          {p.evidence
                            .map((e) =>
                              e.kind === "file"
                                ? e.path
                                : e.kind === "work"
                                  ? `${t("dutyV2.evidenceWork")}: ${e.workId}`
                                  : e.text,
                            )
                            .join("；")}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </details>
            {skippedOccurrences(duty).length > 0 && (
              <details>
                <summary>
                  {t("dutyV2.skippedRuns")} ({skippedOccurrences(duty).length})
                </summary>
                <ul className={styles.taskList}>
                  {skippedOccurrences(duty)
                    .slice()
                    .reverse()
                    .map((o) => (
                      <li key={`skip-${o.id}`} className={styles.taskOccurrence}>
                        <span>
                          {new Date(o.scheduledAt).toLocaleString()} ·{" "}
                          {t(`taskV2.${o.state}`)}
                        </span>
                        {o.reason && <p>{o.reason}</p>}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
