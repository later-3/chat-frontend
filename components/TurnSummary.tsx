import { useState, type ReactNode } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import type { TurnSummaryData } from "@/lib/turn-summary";

export function TurnSummary({ summary, completed, children, defaultExpanded = false }: {
  summary: TurnSummaryData;
  completed: boolean;
  children?: ReactNode;
  defaultExpanded?: boolean;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const number = (value: number) => value.toLocaleString();
  return <section className="turn-summary" aria-label={t("turnSummary.label")}>
    <button className="turn-summary-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      <span className="turn-summary-state">{completed && <IconCheck size={14} aria-hidden />}{t(completed ? "runStatus.completed" : "turnSummary.label")}</span>
      <span>{summary.recordedUsage ? `${number(summary.tokens)} tokens` : t("turnSummary.noUsage")}</span>
      <span>{t("turnSummary.tools", { count: summary.toolCount })}</span>
      {summary.durationMs !== null && <span title={t("turnSummary.durationHint")}>{t("turnSummary.seconds", { seconds: number(Math.round(summary.durationMs / 100) / 10) })}</span>}
      <span className="turn-summary-disclosure">{t(children ? "chat.processDetails" : "turnSummary.details")}<IconChevronDown size={14} aria-hidden style={{ transform: expanded ? "rotate(180deg)" : undefined }} /></span>
    </button>
    {expanded && <div className="turn-summary-details">
      {summary.recordedUsage > 0 && <div className="turn-summary-usage">
        <span>{t("turnSummary.input")} {number(summary.usage.input)}</span>
        <span>{t("turnSummary.output")} {number(summary.usage.output)}</span>
        <span>{t("turnSummary.cacheRead")} {number(summary.usage.cacheRead)}</span>
        <span>{t("turnSummary.cacheWrite")} {number(summary.usage.cacheWrite)}</span>
        {summary.usage.cost > 0 && <span>${summary.usage.cost.toFixed(4)}</span>}
      </div>}
      {summary.recordedUsage < summary.assistantCount && <p className="turn-summary-note">{t("turnSummary.partialUsage")}</p>}
      <p className="turn-summary-note">{t(summary.durationMs === null ? "turnSummary.noDuration" : "turnSummary.durationHint")}</p>
      {children}
    </div>}
  </section>;
}
