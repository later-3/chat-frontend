import { useId, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatInterfaceFeedback } from "@/lib/i18n/feedback";

/** Localized operation feedback, with original provider/server diagnostics available on demand. */
export function InterfaceFeedback({ message }: { message: string | null | undefined }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (!message) return null;
  const feedback = formatInterfaceFeedback(message, locale);
  return <span className="interface-feedback">
    <span>{feedback.summary}</span>
    {feedback.details && <>
      {" "}<button type="button" className="interface-feedback-toggle" aria-expanded={expanded} aria-controls={id}
        onClick={() => setExpanded(value => !value)}>{t(expanded ? "feedback.hideDetails" : "feedback.details")}</button>
      {expanded && <code id={id} className="interface-feedback-details">{feedback.details}</code>}
    </>}
  </span>;
}
