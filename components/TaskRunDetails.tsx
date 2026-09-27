import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { readMaintenance, type SessionMaintenance } from "@/lib/session-maintenance";
import type { ArtifactScope } from "@/lib/task-results";
import { LongAgentDeliverablesSettings } from "./LongAgentDeliverablesSettings";
import { InterfaceFeedback } from "./InterfaceFeedback";

/** Read details on demand; sidebar polling never opens a Pi runtime or loads every task history. */
export function TaskRunDetails({ agentId, workId, sessionId }: { agentId: string; workId: string; sessionId: string }) {
  return <TaskResults agentId={agentId} scope={{ kind: "work", id: workId }} sessionId={sessionId} />;
}
export function TaskResults({ agentId, scope, sessionId }: { agentId: string; scope: ArtifactScope; sessionId?: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SessionMaintenance | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setState(null); setError(null);
    if (!open || !sessionId) return;
    const controller = new AbortController();
    void readMaintenance(agentId, sessionId, controller.signal).then(result => {
      if (!controller.signal.aborted) setState(result);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [open, agentId, sessionId]);
  return <details data-task-results={scope.id} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t(sessionId ? "taskResults.heading" : "longAgentSettings.deliverablesTab")}</summary>
    {open && <>
      <p>{t("taskResults.scope")}</p>
      {sessionId && !state && !error && <p role="status">{t("common.loading")}</p>}
      {state && <p>{t("taskResults.stats", { tokens: state.stats.tokens.total.toLocaleString(locale), tools: state.stats.toolCalls.toLocaleString(locale) })}</p>}
      {error && <p role="alert"><InterfaceFeedback message={error} /></p>}
      <LongAgentDeliverablesSettings longAgentId={agentId} scope={scope} />
    </>}
  </details>;
}
