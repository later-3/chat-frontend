"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { PlanReview } from "@/lib/chat-workflow-events";
import type { PlanReviewDecisionInput } from "@/lib/chat-workflow-browser";
import { MarkdownBody } from "./MarkdownBody";

/** Shared human-review card: used by the chat surface AND the topic-creation panel (no per-workflow copy). */
export function PlanReviewCard({
  review,
  submitting,
  onDecision,
  title: customTitle,
  approveLabel,
}: {
  review: PlanReview;
  submitting: boolean;
  onDecision: (decision: PlanReviewDecisionInput) => Promise<void>;
  title?: string;
  approveLabel?: string;
}) {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState("");
  const trimmedFeedback = feedback.trim();
  const needsClarification = review.readiness === "needs_clarification";
  const title = customTitle ?? t(needsClarification ? "chat.planClarificationTitle" : "chat.planReviewTitle", {
    revision: review.planRevision,
  });
  return (
    <section
      aria-label={title}
      style={{
        margin: "14px 0 18px",
        padding: 16,
        border: "1px solid color-mix(in srgb, var(--accent) 42%, var(--border))",
        borderRadius: 12,
        background: "color-mix(in srgb, var(--accent) 5%, var(--bg-secondary))",
      }}
    >
      <div style={{ marginBottom: 10, color: "var(--text)", fontSize: 14, fontWeight: 650 }}>
        {title}
      </div>
      <div style={{ marginBottom: 10, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
        {t(needsClarification ? "chat.planClarificationHint" : "chat.planReviewHint")}
      </div>
      {needsClarification && (
        <div style={{ marginBottom: 12, padding: "10px 12px", border: "1px solid color-mix(in srgb, var(--warning, #d97706) 38%, var(--border))", borderRadius: 8, background: "color-mix(in srgb, var(--warning, #d97706) 7%, var(--bg-primary))" }}>
          <div style={{ marginBottom: 6, color: "var(--text)", fontSize: 12, fontWeight: 650 }}>
            {t("chat.planBlockingQuestions")}
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6 }}>
            {review.blockingQuestions.map((question) => <li key={question}>{question}</li>)}
          </ol>
        </div>
      )}
      <div className="markdown-body" style={{ maxHeight: 360, overflow: "auto", padding: "0 2px 6px" }}>
        <MarkdownBody>{review.plan}</MarkdownBody>
      </div>
      <label style={{ display: "block", marginTop: 12, color: "var(--text-muted)", fontSize: 12 }}>
        {t(needsClarification ? "chat.planClarificationFeedback" : "chat.planReviewFeedback")}
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          disabled={submitting}
          placeholder={t(needsClarification
            ? "chat.planClarificationFeedbackPlaceholder"
            : "chat.planReviewFeedbackPlaceholder")}
          rows={3}
          maxLength={20_000}
          style={{
            display: "block",
            width: "100%",
            marginTop: 7,
            padding: "9px 10px",
            resize: "vertical",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-primary)",
            color: "var(--text)",
            font: "inherit",
            lineHeight: 1.5,
          }}
        />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          disabled={submitting || trimmedFeedback === ""}
          data-plan-review-revise
          onClick={() => void onDecision({ kind: "request_revision", feedback })}
          style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-primary)", color: "var(--text)", cursor: submitting || trimmedFeedback === "" ? "not-allowed" : "pointer", opacity: trimmedFeedback === "" ? 0.55 : 1 }}
        >
          {t(needsClarification ? "chat.submitPlanClarification" : "chat.requestPlanRevision")}
        </button>
        {!needsClarification && (
          <button
            type="button"
            disabled={submitting}
            data-plan-review-approve
            onClick={() => void onDecision({ kind: "approve" })}
            style={{ padding: "7px 12px", border: "1px solid var(--accent)", borderRadius: 8, background: "var(--accent)", color: "white", cursor: submitting ? "wait" : "pointer" }}
          >
            {submitting ? t("chat.submittingPlanReview") : approveLabel ?? t("chat.approveAndExecute")}
          </button>
        )}
      </div>
    </section>
  );
}
