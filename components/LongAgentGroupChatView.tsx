"use client";
import { PageHeader } from "./ui/PageHeader";
import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconArrowLeft, IconRefresh, IconHistory, IconList } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { fetchChatProjects, type ChatProjectSummary } from "@/lib/projects-contract";
import { fetchLongAgents, type LongAgentSummary } from "@/lib/long-agents-browser";
import type { AgentMessage } from "@/lib/types";
import {
  fetchConversation,
  fetchConversationMessages,
  fetchConversationWorks,
  fetchConversations,
  startConversationRound,
  type ConversationDiscussion,
  type ConversationPublicMessage,
  type ConversationSummary,
  type ConversationWork,
} from "@/lib/friend-conversations";
import { LongAgentAvatarView } from "./LongAgentAvatar";
import { MessageView } from "./MessageView";
import { FullHistoryDialog } from "./FullHistoryDialog";
import { GroupComposer } from "./GroupComposer";
import { GroupWorkControls } from "./GroupWorkControls";
import { readPendingSubmission, retainPendingSubmission, clearPendingSubmission } from "@/lib/pending-submission";
import { parseGroupRoundInput } from "@/lib/group-submission";
import { useIsMobile } from "@/hooks/useIsMobile";
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
  const compact = useIsMobile();
  const [agents, setAgents] = useState<readonly LongAgentSummary[]>([]);
  const [projects, setProjects] = useState<readonly ChatProjectSummary[]>([]);
  const [agentId, setAgentId] = useState(() => new URL(window.location.href).searchParams.get("groupAgent") ?? "");
  const [projectId, setProjectId] = useState(() => new URL(window.location.href).searchParams.get("groupProject") ?? "");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URL(window.location.href).searchParams.get("groupId"));
  const [detail, setDetail] = useState<{ conversation: ConversationSummary; discussions: ConversationDiscussion[] } | null>(null);
  const [messages, setMessages] = useState<ConversationPublicMessage[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [roundPolicy, setRoundPolicy] = useState<RoundPolicy>("mention");
  const [works, setWorks] = useState<ConversationWork[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyMember, setHistoryMember] = useState<{ projectId: string; sessionId: string; longAgentId: string } | null>(null);
  const [listVisible, setListVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionBusy = useRef(false);
  const latest = useRef({agentId, projectId, selectedId});
  latest.current = {agentId, projectId, selectedId};
  const listVersion = useRef(0);
  const detailVersion = useRef(0);
  const roundKey = JSON.stringify(["group-round", agentId, selectedId]);
  const [, refreshPendingRound] = useState(0);
  const pendingRound = readPendingSubmission(roundKey);
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key,value] of [["groupAgent",agentId],["groupProject",projectId],["groupId",selectedId]] as const) {
      if (value) url.searchParams.set(key,value); else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state,"",`${url.pathname}${url.search}${url.hash}`);
  }, [agentId,projectId,selectedId]);

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

  const reloadList = useCallback(async (signal?: AbortSignal) => {
    const version = ++listVersion.current;
    if (agentId === "" || projectId === "") { setLoading(false); return; }
    const list = await fetchConversations(agentId, projectId, signal);
    if (signal?.aborted || version !== listVersion.current || latest.current.agentId !== agentId || latest.current.projectId !== projectId) return;
    setConversations(list); setLoading(false);
    setSelectedId(current => current !== null && list.some(item => item.id === current) ? current : list[0]?.id ?? null);
  }, [agentId, projectId]);
  useEffect(() => {
    const controller = new AbortController();
    setConversations([]); setLoading(true); setError(null);
    void reloadList(controller.signal).catch(cause => { if (!controller.signal.aborted) { setError(String(cause.message ?? cause)); setLoading(false); } });
    return () => controller.abort();
  }, [reloadList]);

  const reloadDetail = useCallback(async (conversationId: string, signal?: AbortSignal) => {
    const version = ++detailVersion.current;
    const [next, nextMessages, nextWorks] = await Promise.all([
      fetchConversation(agentId, conversationId, signal),
      fetchConversationMessages(agentId, conversationId, signal),
      fetchConversationWorks(agentId, conversationId, signal),
    ]);
    if (signal?.aborted || version !== detailVersion.current || latest.current.agentId !== agentId || latest.current.selectedId !== conversationId) return;
    setDetail(next); setMessages(nextMessages); setWorks(nextWorks);
  }, [agentId]);
  useEffect(() => {
    setDetail(null); setMessages([]); setWorks([]); setTargets([]); setError(null); setReconnecting(false);
    if (!selectedId || !agentId) return;
    const controller = new AbortController();
    const refresh = () => { void reloadDetail(selectedId, controller.signal).catch(cause => { if (!controller.signal.aborted) setError(String(cause.message ?? cause)); }); };
    refresh();
    const stream = new EventSource(`/api/long-agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(selectedId)}/stream?after=-1`);
    stream.addEventListener("open", () => { setReconnecting(false); refresh(); });
    stream.addEventListener("message", refresh);
    stream.addEventListener("reset", refresh);
    stream.addEventListener("revoked", () => { stream.close(); refresh(); });
    // EventSource retries itself. Poll only the read projection while reconnecting.
    let disconnected = false;
    stream.addEventListener("error", () => { disconnected = true; setReconnecting(true); });
    stream.addEventListener("open", () => { disconnected = false; });
    const timer = setInterval(() => { if (disconnected && document.visibilityState === "visible") refresh(); }, 5000);
    return () => { controller.abort(); stream.close(); clearInterval(timer); };
  }, [agentId, reloadDetail, selectedId]);

  const activeMembers = useMemo(() => detail?.conversation.members.filter((member) => member.active).map((member) => member.longAgentId) ?? [], [detail]);
  const nameOf = useCallback((id: string) => agents.find((agent) => agent.id === id)?.name ?? id, [agents]);

  const run = async (action: () => Promise<void>) => {
    if (actionBusy.current) return;
    actionBusy.current = true; setBusy(true); setError(null);
    const target = { ...latest.current };
    try { await action(); } catch (cause) {
      if (target.agentId === latest.current.agentId && target.selectedId === latest.current.selectedId) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { actionBusy.current = false; setBusy(false); }
  };

  return <div className={styles.root} data-group-chat-root>
    <PageHeader title={t("groups.title")} onBack={onBack}>      <button type="button" className={styles.listToggle} onClick={() => setListVisible(value => !value)} aria-expanded={listVisible}><IconList size={18}/>{t("groups.listLabel")}</button>
      <Button variant="ghost" type="button" className={styles.back} disabled={busy} onClick={() => void run(() => reloadList())} aria-label={t("groups.refresh")} data-group-refresh><IconRefresh size={20} stroke={1.7} /></Button>
    </PageHeader>
    <div className={styles.body} data-list-visible={listVisible || undefined}>
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
        {loading && <p role="status" className={styles.hint}>{t("design.loading")}</p>}
        <ul className={styles.list}>
          {conversations.map((conversation) => <li key={conversation.id}>
            <button type="button" className={conversation.id === selectedId ? styles.activeItem : styles.item} onClick={() => { setSelectedId(conversation.id); setListVisible(false); }}>
              <span>{conversation.title}</span>
              <small>{conversation.lifecycle === "archived" ? t("groups.archived") : `${String(conversation.members.filter((member) => member.active).length)} ${t("groups.membersSuffix")}`}</small>
            </button>
          </li>)}
          {!loading && !error && conversations.length === 0 && <li className={styles.hint}>{t("groups.empty")}</li>}
        </ul>
      </aside>
      <section className={styles.center} aria-label={t("groups.chatLabel")}>
        {detail === null ? <p className={styles.hint}>{t("groups.selectHint")}</p> : <>
          <div className={styles.groupHeader}>
            <div><strong>{detail.conversation.title}</strong><span>{activeMembers.map(id => nameOf(id)).join("、")}</span></div>
            <details className={styles.historyMenu}><summary><IconHistory size={18}/>{t("design.history")}</summary>
              <div className={styles.historyOptions}>
                <button type="button" data-group-history-public onClick={() => setHistoryMember({ projectId:detail.conversation.storageProjectId, sessionId:detail.conversation.publicSessionId, longAgentId:"" })}>{t("groups.publicHistory")}</button>
                {detail.conversation.members.filter(member => member.active && member.sessionId !== null).map(member => <button key={member.longAgentId} type="button" data-group-history={member.longAgentId}
                  onClick={() => setHistoryMember({projectId:detail.conversation.storageProjectId,sessionId:member.sessionId!,longAgentId:member.longAgentId})}>{t("design.memberHistory", {name:nameOf(member.longAgentId)})}</button>)}
              </div>
            </details>
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
            <GroupComposer key={`${agentId}:${detail.conversation.id}`} agentId={agentId} conversationId={detail.conversation.id} onAccepted={() => reloadDetail(detail.conversation.id)} />
            <div className={styles.roundSection}>
            <details className={styles.roundOptions} open={!compact}>
              <summary>{t("groups.roundPolicy")} · {t(`design.policy.${roundPolicy}`)}</summary>
              <div className={styles.roundBar}>
              <span>{t("groups.roundPolicy")}</span>
              {(["mention", "round-robin", "parallel", "moderator", "free"] as const).map((policy) => (
                <button key={policy} type="button" data-group-policy={policy} aria-pressed={roundPolicy === policy}
                  className={roundPolicy === policy ? styles.activeChip : styles.chip} disabled={busy || pendingRound !== null} onClick={() => setRoundPolicy(policy)}>{t(`design.policy.${policy}`)}</button>
              ))}
              {roundPolicy === "mention" && <>
                <span>{t("groups.mention")}</span>
                {activeMembers.map((id) => <label key={id} className={styles.check}>
                  <input type="checkbox" disabled={busy || pendingRound !== null} checked={targets.includes(id)} onChange={(event) => setTargets((current) => event.target.checked ? [...new Set([...current, id])] : current.filter((entry) => entry !== id))} />
                  {nameOf(id)}
                </label>)}
              </>}
              </div>
            </details>
              {pendingRound && <button type="button" className={styles.chip} disabled={busy} onClick={() => {clearPendingSubmission(roundKey,pendingRound.id);refreshPendingRound(value => value + 1);}}>{t("design.discardRetry")}</button>}
              <button type="button" className={styles.start} data-group-start-round disabled={busy || (!pendingRound && roundPolicy === "mention" && targets.length === 0)} onClick={() => void run(async () => {
                const input = pendingRound ? parseGroupRoundInput(pendingRound.text) : {policy:roundPolicy, ...(roundPolicy === "mention" ? {targets} : {})};
                const requestId = pendingRound?.id ?? retainPendingSubmission(roundKey, JSON.stringify(input), 0);
                await startConversationRound(agentId, detail.conversation.id, {...input, discussionId:requestId});
                clearPendingSubmission(roundKey, requestId);
                await reloadDetail(detail.conversation.id);
              })}>{busy ? t("design.starting") : pendingRound ? t("design.retrySame") : t("groups.startRound")}</button>
            </div>
          </>}
          <GroupWorkControls key={`${agentId}:${detail.conversation.id}`} agentId={agentId} conversation={detail.conversation} agents={agents} works={works} onRefresh={() => reloadDetail(detail.conversation.id)} />
          {reconnecting && <p role="status" className={styles.hint}>{t("design.reconnecting")}</p>}
          <div className={styles.status} role="status" data-group-status>
            {detail.discussions.slice(-1).map((discussion) => <span key={discussion.discussionId} data-group-discussion-status data-policy={discussion.policy}>
              {t(`design.policy.${discussion.policy}`)} · {t(`groups.status.${discussion.status}`)}{discussion.stopReason !== null && <details><summary>{t("groups.stopReason")}</summary><code>{discussion.stopReason}</code></details>} · {String(discussion.modelCalls)} {t("groups.modelCalls")}
            </span>)}
            {works.map((work) => <span key={work.workId} data-group-work-status>{t("groups.work")} {work.title} · {t(`groups.status.${work.status}`)}</span>)}
          </div>
        </>}
      </section>
    </div>
    {error !== null && <p role="alert" className={styles.error}><InterfaceFeedback message={error} /></p>}
    {historyMember !== null && <FullHistoryDialog projectId={historyMember.projectId} sessionId={historyMember.sessionId} onClose={() => setHistoryMember(null)} />}
  </div>;
}
