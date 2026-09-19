"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchFriendDailyState, type FriendDailyAction, type FriendDailyState } from "@/lib/friend-daily-browser";
import styles from "./LongAgentSettingsPanel.module.css";

export function FriendDailyStatus({ longAgentId }: { longAgentId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<FriendDailyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  const actionController = useRef<AbortController | null>(null);
  useEffect(() => {
    setState(null); setError(null); setBusy(false);
    const controller = new AbortController();
    const load = async () => {
      const current = ++sequence.current;
      try { const next = await fetchFriendDailyState(longAgentId, controller.signal); if (!controller.signal.aborted && current === sequence.current) { setState(next); setError(null); } }
      catch (cause) { if (!controller.signal.aborted && current === sequence.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    void load();
    const timer = setInterval(() => { if (!document.hidden && actionController.current === null) void load(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); actionController.current?.abort(); actionController.current = null; };
  }, [longAgentId, refresh]);
  async function act(action: FriendDailyAction) {
    if (actionController.current) return;
    const controller = new AbortController(); actionController.current = controller;
    sequence.current += 1; setBusy(true); setError(null);
    try { const next = await fetchFriendDailyState(longAgentId, controller.signal, action); if (!controller.signal.aborted) setState(next); }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (!controller.signal.aborted) { actionController.current = null; setBusy(false); } }
  }
  const label = (status: string) => t(`longAgentSettings.daily_${status}`);
  const requests = state?.requests.filter((request) => request.status !== "completed" && request.status !== "cancelled") ?? [];
  return <section className={styles.dailySection} aria-label={t("longAgentSettings.dailyHeading")}>
    <div className={styles.dailyHead}><h3>{t("longAgentSettings.dailyHeading")}</h3><button disabled={busy} onClick={() => setRefresh((value) => value + 1)}>{t("longAgentSettings.dailyRefresh")}</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!state && !error && <p role="status">{t("longAgentSettings.inspectionLoading")}</p>}
    {state && <><p className={styles.help}>{state.today} · {state.timeZone} — {t("longAgentSettings.dailyHint")}</p>
      {state.days.length === 0 && <p className={styles.help}>{t("longAgentSettings.dailyEmpty")}</p>}
      <ul className={styles.taskList}>{state.days.map((day) => <li className={styles.taskRow} key={day.date}>
        <div className={styles.dailyHead}><strong>{day.date}</strong><span>{day.date === state.today && day.summary.status === "pending" ? t("longAgentSettings.dailyToday") : label(day.summary.status)}</span>
          <a href={`/?session=${encodeURIComponent(day.sessionId)}&projectId=${encodeURIComponent(longAgentId)}`}>{t("longAgentSettings.dailyHistory")}</a>
          {day.summary.status === "failed" && <button disabled={busy} onClick={() => void act({ action: "retry-summary", date: day.date })}>{t("longAgentSettings.dailyRetrySummary")}</button>}
        </div>
        {day.summary.error && <p className={styles.taskPrompt}>{day.summary.error}</p>}
        {day.summary.nextAttemptAt && <small>{t("longAgentSettings.dailyNextRetry")} {day.summary.nextAttemptAt}</small>}
      </li>)}</ul>
      {requests.length > 0 && <><h3>{t("longAgentSettings.dailyRequests")}</h3><ul className={styles.taskList}>{requests.map((request) => <li className={styles.taskRow} key={request.turnId}>
        <div className={styles.dailyHead}><strong>#{request.sequence} · {request.date}</strong><span>{label(request.status)} · {t(`longAgentSettings.dailySource_${request.source}`)}</span>
          {request.status === "queued" && <button disabled={busy} onClick={() => void act({ action: "cancel-request", turnId: request.turnId })}>{t("longAgentSettings.dailyCancel")}</button>}
          {request.status === "failed" && <button disabled={busy} onClick={() => void act({ action: "retry-request", turnId: request.turnId })}>{t("longAgentSettings.dailyRetryRequest")}</button>}
        </div>{request.error && <p className={styles.taskPrompt}>{request.error}</p>}
      </li>)}</ul></>}
    </>}
  </section>;
}
