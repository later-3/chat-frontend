"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconArrowRight, IconRefresh } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { cancelChatWorkflowRun, type PlanReviewDecisionInput } from "@/lib/chat-workflow-browser";
import { fetchTopicCreationRequests, submitTopicCreationDecision, topicCreationReference, topicNodeUrl, type TopicCreationRequest } from "@/lib/topic-creation";
import { PlanReviewCard } from "./PlanReviewCard";
import { SurfaceDialog } from "./SurfaceDialog";
import styles from "./TopicCreationRequests.module.css";

const terminal = (status: string) => ["completed", "cancelled", "failed", "interrupted"].includes(status);

/** Both conversation and topic navigation observe the same durable Runs and use the same review UI. */
export function TopicCreationRequests({ longAgentId, sourceSessionId, focusedRequestId, onCreated }: {
  longAgentId: string;
  sourceSessionId?: string;
  focusedRequestId?: string | null;
  onCreated?: (node: NonNullable<TopicCreationRequest["node"]>) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [requests, setRequests] = useState<TopicCreationRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(focusedRequestId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [submittedReview, setSubmittedReview] = useState<string | null>(null);
  const openAfterApproval = useRef<string | null>(null);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  useEffect(() => { if (focusedRequestId) { setSelectedId(focusedRequestId); setRefresh(n => n + 1); } }, [focusedRequestId]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let reading = false;
    // Opening a session must not be dragged down by a background poll: while there is no active creation
    // the read backs off hard, and a hidden page stops it entirely until it is visible again. Creating,
    // reconnecting or returning to the foreground refreshes immediately.
    const ACTIVE_POLL_MS = 1_500;
    const IDLE_POLL_MS = 15_000;
    const schedule = (hasActive: boolean) => {
      if (controller.signal.aborted || document.visibilityState !== "visible") return;
      timer = setTimeout(() => void read(), hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    const read = async () => {
      if (reading || controller.signal.aborted) return;
      if (document.visibilityState !== "visible") return;
      reading = true;
      let hasActive = false;
      try {
        const next = await fetchTopicCreationRequests(longAgentId, sourceSessionId, controller.signal);
        if (controller.signal.aborted) return;
        hasActive = next.some((item) => !terminal(item.status));
        setRequests(next); setError(null);
        const completed = next.find(item => item.requestId === openAfterApproval.current && item.status === "completed" && item.node !== null);
        if (completed?.node && onCreatedRef.current) {
          openAfterApproval.current = null;
          await onCreatedRef.current(completed.node);
          if (!controller.signal.aborted) setSelectedId(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        reading = false;
        schedule(hasActive);
      }
    };
    const reconnect = () => { clearTimeout(timer); void read(); };
    const onVisibility = () => { if (document.visibilityState === "visible") reconnect(); else clearTimeout(timer); };
    void read();
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [longAgentId, sourceSessionId, refresh]);

  const selected = requests.find(item => item.requestId === selectedId);
  const review = selected?.review?.reviewId === submittedReview ? null : selected?.review;
  const operate = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setActionError(null);
    try { await action(); setRefresh(n => n + 1); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const decide = async (decision: PlanReviewDecisionInput) => {
    if (!selected?.review) return;
    await operate(async () => {
      await submitTopicCreationDecision(longAgentId, selected, selected.review!, decision);
      setSubmittedReview(selected.review!.reviewId);
      if (decision.kind === "approve") openAfterApproval.current = selected.requestId;
    });
  };
  const statusText = (item: TopicCreationRequest) => t(
    item.review !== null && !terminal(item.status) ? "topics.creationReview" :
      item.status === "completed" ? "topics.creationCompleted" : item.status === "cancelled" ? "topics.creationCancelled" :
        item.status === "failed" || item.status === "interrupted" ? "topics.creationFailed" : "topics.creationCollecting");
  const visible = requests.filter((item, index) => !terminal(item.status) || index < 3);
  if (!visible.length && !error && selectedId === null) return null;
  return <section className={styles.root} aria-label={t("topics.creationTasks")} data-topic-creation-requests>
    {error && <p role="alert" className={styles.error}>{t("topics.creationOffline")} <button onClick={() => setRefresh(n => n + 1)} aria-label={t("topics.refresh")}><IconRefresh size={16} /></button></p>}
    {visible.map(item => <button type="button" key={item.runId} className={styles.request}
      data-topic-creation-open={item.requestId} data-creation-status={item.status} onClick={() => { setSelectedId(item.requestId); setActionError(null); }}>
      <span>{item.node?.title ?? t("topics.creationTasks")}<small>{statusText(item)}</small></span><IconArrowRight size={16} />
    </button>)}
    {selectedId !== null && createPortal(<SurfaceDialog title={t("topics.creationTasks")} onClose={() => setSelectedId(null)}>
      <div className={styles.content} data-topic-creation-review data-creation-run={selected?.runId}>
        {error && <p role="alert">{t("topics.creationOffline")}</p>}
        {actionError && <p role="alert">{actionError}</p>}
        {!selected ? <p role="status">{t("topics.creationCollecting")}</p> : <>
          <p role="status">{review ? statusText(selected) : submittedReview === selected.review?.reviewId ? t("topics.creationCollecting") : statusText(selected)}</p>
          {selected.error && <p role="alert">{selected.error}</p>}
          {review && <PlanReviewCard key={review.reviewId} review={review} submitting={busy} onDecision={decide}
            title={t("topics.creationReviewTitle", { revision: review.planRevision })} approveLabel={t("topics.creationApprove")} />}
          {selected.node && <a className={styles.primary} data-topic-creation-enter href={topicNodeUrl(longAgentId, selected.node)}
            onClick={onCreated === undefined ? undefined : event => { event.preventDefault(); void onCreated(selected.node!); setSelectedId(null); }}>
            {t("topics.creationEnter")}</a>}
          {!terminal(selected.status) && <button type="button" className={styles.cancel} data-topic-creation-cancel disabled={busy}
            onClick={() => void operate(async () => {
              await cancelChatWorkflowRun(topicCreationReference(longAgentId, selected));
              setSubmittedReview(selected.review?.reviewId ?? null); openAfterApproval.current = null;
            })}>{busy ? t("topics.creationSubmitting") : t("topics.creationCancel")}</button>}
        </>}
      </div>
    </SurfaceDialog>, document.body)}
  </section>;
}
