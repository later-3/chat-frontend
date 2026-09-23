"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconArrowLeft, IconRefresh, IconSend } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { fetchChatProjects, type ChatProjectSummary } from "@/lib/projects-contract";
import { fetchLongAgents, type LongAgentSummary } from "@/lib/long-agents-browser";
import type { AgentMessage } from "@/lib/types";
import {
  fetchConversation,
  fetchConversationMessages,
  fetchConversationWorks,
  fetchConversations,
  sendConversationMessage,
  startConversationRound,
  type ConversationDiscussion,
  type ConversationPublicMessage,
  type ConversationSummary,
  type ConversationWork,
} from "@/lib/friend-conversations";
import { LongAgentAvatarView } from "./LongAgentAvatar";
import { MessageView } from "./MessageView";
import { FullHistoryDialog } from "./FullHistoryDialog";
import styles from "./LongAgentGroupChatView.module.css";

type RoundPolicy = "mention" | "round-robin" | "parallel" | "moderator" | "free";

/** Turn one authorized public projection entry into the shared chat message shape. */
function toAgentMessage(message: ConversationPublicMessage): AgentMessage {
  const timestamp = Number.isFinite(Date.parse(message.postedAt)) ? Date.parse(message.postedAt) : undefined;
  const text = message.text ?? `[${message.unavailableReason ?? ""}]`;
  if (message.authorLongAgentId === "user") {
    return { role: "user", content: text, ...(timestamp === undefined ? {} : { timestamp }) };
  }
  return {
    role: "assistant",
    model: "group",
    provider: "conversation",
    content: text === "" ? [] : [{ type: "text", text }],
    ...(timestamp === undefined ? {} : { timestamp }),
  };
}

/**
 * Central group chat surface, opened from the workspace rail and sharing the public chat message
 * component with normal sessions. It reads only the owner-facing authorized projection: history comes
 * from `/messages`, live updates from the SSE stream, and no private participation Session content is
 * ever rendered here. Member/policy/budget management stays in the Coworker settings page.
 */
export function LongAgentGroupChatView({ onBack }: { onBack: () => void }) {
  const { t, locale } = useI18n();
  const [agents, setAgents] = useState<readonly LongAgentSummary[]>([]);
  const [projects, setProjects] = useState<readonly ChatProjectSummary[]>([]);
  const [agentId, setAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ conversation: ConversationSummary; discussions: ConversationDiscussion[] } | null>(null);
  const [messages, setMessages] = useState<ConversationPublicMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [roundPolicy, setRoundPolicy] = useState<RoundPolicy>("mention");
  const [works, setWorks] = useState<ConversationWork[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyMember, setHistoryMember] = useState<{ projectId: string; sessionId: string; longAgentId: string } | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([fetchLongAgents(undefined, controller.signal), fetchChatProjects(controller.signal)])
      .then(([agentResult, projectResult]) => {
        if (controller.signal.aborted) return;
        setAgents(agentResult.agents);
        setAgentId((current) => current !== "" ? current : agentResult.agents[0]?.id ?? "");
        const userProjects = projectResult.filter((project) => project.kind === "project");
        setProjects(userProjects);
        setProjectId((current) => current !== "" ? current : userProjects[0]?.projectId ?? "");
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, []);

  const reloadList = useCallback(async () => {
    if (agentId === "" || projectId === "") return;
    const list = await fetchConversations(agentId, projectId);
    setConversations(list);
    setSelectedId((current) => current !== null && list.some((item) => item.id === current) ? current : list[0]?.id ?? null);
  }, [agentId, projectId]);

  useEffect(() => {
    void reloadList().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [reloadList]);

  const reloadDetail = useCallback(async (conversationId: string) => {
    const [next, nextMessages, nextWorks] = await Promise.all([
      fetchConversation(agentId, conversationId),
      fetchConversationMessages(agentId, conversationId),
      fetchConversationWorks(agentId, conversationId),
    ]);
    setDetail(next);
    setMessages(nextMessages);
    setWorks(nextWorks);
  }, [agentId]);

  useEffect(() => {
    streamRef.current?.close();
    streamRef.current = null;
    if (selectedId === null) { setDetail(null); setMessages([]); setWorks([]); return; }
    void reloadDetail(selectedId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    // Live projection: the server decides what the owner may see and closes on archive.
    const stream = new EventSource(`/api/long-agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(selectedId)}/stream?after=-1`);
    streamRef.current = stream;
    const refresh = () => { void reloadDetail(selectedId).catch(() => undefined); };
    stream.addEventListener("message", refresh);
    stream.addEventListener("reset", refresh);
    stream.addEventListener("revoked", () => { stream.close(); refresh(); });
    stream.addEventListener("error", () => stream.close());
    return () => stream.close();
  }, [agentId, reloadDetail, selectedId]);

  const activeMembers = useMemo(() => detail?.conversation.members.filter((member) => member.active).map((member) => member.longAgentId) ?? [], [detail]);
  const nameOf = useCallback((id: string) => agents.find((agent) => agent.id === id)?.name ?? id, [agents]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  return <div className={styles.root} data-group-chat-root>
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={onBack} aria-label={t("groups.back")}><IconArrowLeft size={20} stroke={1.7} /></button>
      <h2>{t("groups.title")}</h2>
      <button type="button" className={styles.back} onClick={() => void run(reloadList)} aria-label={t("groups.refresh")} data-group-refresh><IconRefresh size={20} stroke={1.7} /></button>
    </header>
    <div className={styles.body}>
      <aside className={styles.sidebar} aria-label={t("groups.listLabel")}>
        <label className={styles.field}>{t("groups.friend")}
          <select value={agentId} onChange={(event) => { setAgentId(event.target.value); setSelectedId(null); }} data-group-friend-select>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </label>
        <label className={styles.field}>{t("groups.storageProject")}
          <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setSelectedId(null); }} data-group-project-select>
            {projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.cachedName}</option>)}
          </select>
        </label>
        <ul className={styles.list}>
          {conversations.map((conversation) => <li key={conversation.id}>
            <button type="button" className={conversation.id === selectedId ? styles.activeItem : styles.item} onClick={() => setSelectedId(conversation.id)}>
              <span>{conversation.title}</span>
              <small>{conversation.lifecycle === "archived" ? t("groups.archived") : `${String(conversation.members.filter((member) => member.active).length)} ${t("groups.membersSuffix")}`}</small>
            </button>
          </li>)}
          {conversations.length === 0 && <li className={styles.hint}>{t("groups.empty")}</li>}
        </ul>
      </aside>
      <section className={styles.center} aria-label={t("groups.chatLabel")}>
        {detail === null ? <p className={styles.hint}>{t("groups.selectHint")}</p> : <>
          <div className={styles.groupHeader}>
            <strong>{detail.conversation.title}</strong>
            <span>{activeMembers.map((id) => nameOf(id)).join("、")}</span>
            {detail.conversation.members.filter((member) => member.active && member.sessionId !== null).map((member) => (
              <button key={member.longAgentId} type="button" className={styles.chip} data-group-history={member.longAgentId}
                onClick={() => setHistoryMember({ projectId: detail.conversation.storageProjectId, sessionId: member.sessionId as string, longAgentId: member.longAgentId })}>
                {t("groups.memberHistory", { name: nameOf(member.longAgentId) })}
              </button>
            ))}
            <button type="button" className={styles.chip} data-group-history-public
              onClick={() => setHistoryMember({ projectId: detail.conversation.storageProjectId, sessionId: detail.conversation.publicSessionId, longAgentId: "" })}>
              {t("groups.publicHistory")}
            </button>
          </div>
          <ol className={styles.messages} aria-live="polite">
            {messages.map((message) => <li key={message.entryId} className={message.authorLongAgentId === "user" ? styles.userRow : styles.agentRow}>
              <div className={styles.author}>
                {message.authorLongAgentId !== "user" && !message.external && <LongAgentAvatarView agentId={message.authorLongAgentId} name={nameOf(message.authorLongAgentId)} avatar={agents.find((agent) => agent.id === message.authorLongAgentId)?.avatar ?? { kind: "auto" }} size={28} />}
                <b>{message.authorLongAgentId === "user" ? t("groups.you") : message.external ? `${message.authorDisplayName ?? message.authorLongAgentId} · ${t("groups.external")}` : nameOf(message.authorLongAgentId)}</b>
                <time dateTime={message.postedAt}>{new Date(message.postedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
              <MessageView message={toAgentMessage(message)} />
            </li>)}
            {messages.length === 0 && <li className={styles.hint}>{t("groups.noMessages")}</li>}
          </ol>
          {detail.conversation.lifecycle === "active" && <>
            <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); const value = draft.trim(); if (value === "") return; void run(async () => {
              await sendConversationMessage(agentId, detail.conversation.id, { clientMessageId: `web-${String(Date.now())}-${String(Math.random()).slice(2)}`, text: value });
              setDraft(""); await reloadDetail(detail.conversation.id);
            }); }}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("groups.messagePlaceholder")} maxLength={100000} data-group-composer />
              <button type="submit" className={styles.send} aria-label={t("groups.send")} data-group-send><IconSend size={18} stroke={1.7} /></button>
            </form>
            <div className={styles.roundBar}>
              <span>{t("groups.roundPolicy")}</span>
              {(["mention", "round-robin", "parallel", "moderator", "free"] as const).map((policy) => (
                <button key={policy} type="button" data-group-policy={policy} aria-pressed={roundPolicy === policy}
                  className={roundPolicy === policy ? styles.activeChip : styles.chip} onClick={() => setRoundPolicy(policy)}>{policy}</button>
              ))}
              {roundPolicy === "mention" && <>
                <span>{t("groups.mention")}</span>
                {activeMembers.map((id) => <label key={id} className={styles.check}>
                  <input type="checkbox" checked={targets.includes(id)} onChange={(event) => setTargets((current) => event.target.checked ? [...new Set([...current, id])] : current.filter((entry) => entry !== id))} />
                  {nameOf(id)}
                </label>)}
              </>}
              <button type="button" className={styles.start} data-group-start-round disabled={roundPolicy === "mention" && targets.length === 0} onClick={() => void run(async () => {
                await startConversationRound(agentId, detail.conversation.id, { policy: roundPolicy, ...(roundPolicy === "mention" ? { targets } : {}) });
                await reloadDetail(detail.conversation.id);
              })}>{t("groups.startRound")}</button>
            </div>
          </>}
          <div className={styles.status} role="status" data-group-status>
            {detail.discussions.slice(-1).map((discussion) => <span key={discussion.discussionId} data-group-discussion-status>
              {discussion.policy} · {discussion.status}{discussion.stopReason !== null ? ` · ${discussion.stopReason}` : ""} · {String(discussion.modelCalls)} {t("groups.modelCalls")}
            </span>)}
            {works.map((work) => <span key={work.workId} data-group-work-status>{t("groups.work")} {work.title} · {work.status}</span>)}
          </div>
        </>}
      </section>
    </div>
    {error !== null && <p role="alert" className={styles.error}>{error}</p>}
    {historyMember !== null && <FullHistoryDialog projectId={historyMember.projectId} sessionId={historyMember.sessionId} onClose={() => setHistoryMember(null)} />}
  </div>;
}
