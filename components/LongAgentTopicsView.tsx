"use client";

import { useEffect, useState } from "react";
import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { fetchLongAgents, type LongAgentSummary } from "@/lib/long-agents-browser";
import { LongAgentTopicsPanel } from "./LongAgentTopicsPanel";
import styles from "./LongAgentTopicsView.module.css";

/**
 * Central topic-mode surface, opened from the workspace rail. The selected Friend is the only identity
 * the panel needs; the graph, nodes, messages, anchors and memory all come from the owner-facing topic
 * API, never from a second client-side runtime.
 */
export function LongAgentTopicsView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [agents, setAgents] = useState<readonly LongAgentSummary[]>([]);
  const [agentId, setAgentId] = useState(() => new URLSearchParams(window.location.search).get("topicAgent") ?? "");
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLongAgents(undefined, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setAgents(result.agents);
      setAgentId((current) => current !== "" ? current : result.agents[0]?.id ?? "");
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [reloadKey]);

  return <div className={styles.root} data-topics-view-root>
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={onBack} aria-label={t("topics.back")} data-topics-back>
        <IconArrowLeft size={20} stroke={1.7} />
      </button>
      <h2>{t("topics.viewTitle")}</h2>
      <label className={styles.friendField}>{t("topics.friend")}
        <select value={agentId} onChange={(event) => { setAgentId(event.target.value); setReloadKey((key) => key + 1); }} data-topics-friend-select>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
      </label>
      <button type="button" className={styles.back} onClick={() => setReloadKey((key) => key + 1)} aria-label={t("topics.refresh")}>
        <IconRefresh size={18} stroke={1.7} />
      </button>
    </header>
    <div className={styles.body}>
      {error !== null && <p role="alert" className={styles.error}>{error}</p>}
      {agentId !== "" && <LongAgentTopicsPanel key={`${agentId}:${String(reloadKey)}`} initialAgentId={agentId} agents={agents} />}
    </div>
  </div>;
}
