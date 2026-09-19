import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchLongAgents, type LongAgentSummary } from "@/lib/long-agents-browser";
import { LongAgentAvatarView } from "./LongAgentAvatar";
import { LongAgentSettingsPanel } from "./LongAgentSettingsPanel";

/** Read-only identity summary. Editing remains in the existing configuration owner. */
export function CoworkerDetails({ agentId }: { agentId: string }) {
  const { t } = useI18n();
  const [agents, setAgents] = useState<readonly LongAgentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchLongAgents(undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) setAgents(result.agents);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [agentId, revision]);
  const agent = agents.find(candidate => candidate.id === agentId);
  return <section className="workspace-coworker-details" aria-label={t("workspaceNav.profile")}>
    {loading ? <p role="status">{t("common.loading")}</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="workspace-button" onClick={() => setRevision(value => value + 1)}>{t("sidebar.longAgentRetry")}</button></div> : agent ? <>
      <LongAgentAvatarView agentId={agent.id} name={agent.name} avatar={agent.avatar} />
      <h2>{agent.name}</h2><p>{agent.description}</p>
      <dl><dt>{t("workspaceNav.defaultProject")}</dt><dd>{agent.defaultProjectId}</dd>
        <dt>{t("workspaceNav.model")}</dt><dd>{agent.configuration.model ? `${agent.configuration.model.provider} / ${agent.configuration.model.modelId}` : t("workspaceNav.inheritModel")}</dd></dl>
      <p>{t("workspaceNav.profileHint")}</p>
      <button type="button" className="workspace-button" onClick={() => setEditing(true)}>{t("workspaceNav.configureCoworker")}</button>
    </> : <p role="alert">{t("sidebar.longAgentUnavailable", { name: agentId })}</p>}
    {editing && agent && <LongAgentSettingsPanel agents={agents} initialAgentId={agent.id} onBack={() => setEditing(false)} onSaved={() => setRevision(value => value + 1)} />}
  </section>;
}
