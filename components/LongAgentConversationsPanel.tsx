import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchChatProjects, type ChatProjectSummary } from "@/lib/projects-contract";
import {
  archiveConversation,
  cancelConversationWork,
  createConversation,
  fetchConversation,
  fetchConversationMessages,
  fetchConversations,
  fetchConversationWorks,
  sendConversationMessage,
  setConversationMember,
  startConversationConsultation,
  startConversationRound,
  startConversationWork,
  type ConversationDiscussion,
  type ConversationPublicMessage,
  type ConversationSummary,
  type ConversationWork,
} from "@/lib/friend-conversations";
import styles from "./LongAgentConversationsPanel.module.css";

type RoundPolicy = "mention" | "round-robin" | "parallel" | "moderator" | "free";

/**
 * Group conversations inside the Coworker settings surface.
 *
 * The panel only calls the owner-facing conversation API; it never sends an identity and never keeps
 * server facts in React state beyond the current render. Public messages come from the SSE projection
 * (with a polling fallback) so a revoked or archived group stops updating instead of showing stale
 * private data.
 */
export function LongAgentConversationsPanel({ longAgentId, agents }: {
  longAgentId: string;
  agents: readonly { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<readonly ChatProjectSummary[]>([]);
  const [storageProjectId, setStorageProjectId] = useState<string>("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ conversation: ConversationSummary; discussions: ConversationDiscussion[] } | null>(null);
  const [messages, setMessages] = useState<ConversationPublicMessage[]>([]);
  const [works, setWorks] = useState<ConversationWork[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState<string[]>([longAgentId]);
  const [draft, setDraft] = useState("");
  const [policy, setPolicy] = useState<RoundPolicy>("mention");
  const [targets, setTargets] = useState<string[]>([longAgentId]);
  const [consultTo, setConsultTo] = useState<string>(agents.find((agent) => agent.id !== longAgentId)?.id ?? "");
  const [consultQuestion, setConsultQuestion] = useState("");
  const [workTitle, setWorkTitle] = useState("");
  const [workInstruction, setWorkInstruction] = useState("");
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchChatProjects(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      const userProjects = result.filter((project) => project.kind === "project");
      setProjects(userProjects);
      setStorageProjectId((current) => current !== "" ? current : userProjects[0]?.projectId ?? "");
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, []);

  const reloadList = useCallback(async (signal?: AbortSignal) => {
    if (storageProjectId === "") return;
    setConversations(await fetchConversations(longAgentId, storageProjectId, signal));
  }, [longAgentId, storageProjectId]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void reloadList(controller.signal).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [reloadList]);

  const reloadDetail = useCallback(async (conversationId: string) => {
    const [next, nextMessages, nextWorks] = await Promise.all([
      fetchConversation(longAgentId, conversationId),
      fetchConversationMessages(longAgentId, conversationId),
      fetchConversationWorks(longAgentId, conversationId),
    ]);
    setDetail(next);
    setMessages(nextMessages);
    setWorks(nextWorks);
  }, [longAgentId]);

  useEffect(() => {
    streamRef.current?.close();
    streamRef.current = null;
    if (selectedId === null) { setDetail(null); setMessages([]); setWorks([]); return; }
    const controller = new AbortController();
    void reloadDetail(selectedId).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    // Live projection: the server decides what this owner may see, and closes on archive/revocation.
    const stream = new EventSource(`/api/long-agents/${encodeURIComponent(longAgentId)}/conversations/${encodeURIComponent(selectedId)}/stream?after=-1`);
    streamRef.current = stream;
    const refresh = () => { void reloadDetail(selectedId).catch(() => undefined); };
    stream.addEventListener("message", refresh);
    stream.addEventListener("reset", refresh);
    stream.addEventListener("revoked", () => { stream.close(); refresh(); });
    stream.addEventListener("error", () => { stream.close(); });
    return () => { controller.abort(); stream.close(); };
  }, [longAgentId, reloadDetail, selectedId]);

  const activeMembers = useMemo(() => detail?.conversation.members.filter((member) => member.active) ?? [], [detail]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  return <div className={styles.panel}>
    <div className={styles.columns}>
      <section className={styles.list} aria-label={t("conversations.listLabel")}>
        <label className={styles.field}>{t("conversations.storageProject")}
          <select value={storageProjectId} onChange={(event) => setStorageProjectId(event.target.value)}>
            {projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.cachedName}</option>)}
          </select>
        </label>
        <ul>
          {conversations.map((conversation) => <li key={conversation.id}>
            <button type="button" className={conversation.id === selectedId ? styles.activeItem : styles.item} onClick={() => setSelectedId(conversation.id)}>
              <span>{conversation.title}</span>
              <small>{conversation.lifecycle === "archived" ? t("conversations.archived") : t("conversations.active")} · {String(conversation.members.filter((member) => member.active).length)} {t("conversations.membersSuffix")}</small>
            </button>
          </li>)}
          {conversations.length === 0 && <li className={styles.hint}>{t("conversations.empty")}</li>}
        </ul>
        <details className={styles.create}>
          <summary>{t("conversations.createSummary")}</summary>
          <label className={styles.field}>{t("conversations.title")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
          </label>
          <fieldset>
            <legend>{t("conversations.members")}</legend>
            {agents.map((agent) => <label key={agent.id} className={styles.check}>
              <input type="checkbox" checked={members.includes(agent.id)} onChange={(event) => setMembers((current) => event.target.checked ? [...new Set([...current, agent.id])] : current.filter((id) => id !== agent.id))} />
              {agent.name}
            </label>)}
          </fieldset>
          <button type="button" className={styles.primary} disabled={storageProjectId === "" || title.trim() === "" || !members.includes(longAgentId)} onClick={() => void run(async () => {
            const created = await createConversation(longAgentId, {
              storageProjectId, title: title.trim(), requestId: `web-${String(Date.now())}-${String(Math.random()).slice(2)}`, memberLongAgentIds: members,
            });
            setTitle("");
            await reloadList();
            setSelectedId(created.id);
          })}>{t("conversations.create")}</button>
        </details>
      </section>

      <section className={styles.detail} aria-label={t("conversations.detailLabel")}>
        {detail === null ? <p className={styles.hint}>{t("conversations.selectHint")}</p> : <>
          <header className={styles.header}>
            <h3>{detail.conversation.title}</h3>
            <p>{detail.conversation.lifecycle === "archived" ? t("conversations.archived") : t("conversations.active")}
              {detail.conversation.collaborationProjectId === null ? ` · ${t("conversations.noCollaborationProject")}` : ` · ${detail.conversation.collaborationProjectId}`}</p>
          </header>
          <div className={styles.members}>
            {detail.conversation.members.map((member) => <div key={member.longAgentId} className={styles.member}>
              <span>{agents.find((agent) => agent.id === member.longAgentId)?.name ?? member.longAgentId}</span>
              <small>{member.active ? t("conversations.active") : t("conversations.revoked")}{member.grants.nativeTools.length > 0 ? ` · ${member.grants.nativeTools.join(",")}` : ""}</small>
              {detail.conversation.lifecycle === "active" && member.active && <button type="button" className={styles.link} onClick={() => void run(async () => {
                await setConversationMember(longAgentId, detail.conversation.id, { action: "revoke", expectedRevision: detail.conversation.revision, longAgentId: member.longAgentId });
                await reloadDetail(detail.conversation.id); await reloadList();
              })}>{t("conversations.revoke")}</button>}
            </div>)}
          </div>

          <ol className={styles.messages} aria-live="polite">
            {messages.map((message) => <li key={message.entryId} className={message.authorLongAgentId === "user" ? styles.userMessage : styles.agentMessage}>
              <b>{message.authorLongAgentId === "user" ? t("conversations.you") : agents.find((agent) => agent.id === message.authorLongAgentId)?.name ?? message.authorLongAgentId}</b>
              <p>{message.text ?? `[${message.unavailableReason ?? t("conversations.unavailable")}]`}</p>
            </li>)}
            {messages.length === 0 && <li className={styles.hint}>{t("conversations.noMessages")}</li>}
          </ol>

          {detail.conversation.lifecycle === "active" && <>
            <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); const value = draft.trim(); if (value === "") return; void run(async () => {
              await sendConversationMessage(longAgentId, detail.conversation.id, { clientMessageId: `web-${String(Date.now())}-${String(Math.random()).slice(2)}`, text: value });
              setDraft(""); await reloadDetail(detail.conversation.id);
            }); }}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("conversations.messagePlaceholder")} maxLength={100000} />
              <button type="submit" className={styles.primary}>{t("conversations.send")}</button>
            </form>
            <div className={styles.controls}>
              <label className={styles.field}>{t("conversations.roundPolicy")}
                <select value={policy} onChange={(event) => setPolicy(event.target.value as RoundPolicy)}>
                  {(["mention", "round-robin", "parallel", "moderator", "free"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              {policy === "mention" && <fieldset>
                <legend>{t("conversations.targets")}</legend>
                {activeMembers.map((member) => <label key={member.longAgentId} className={styles.check}>
                  <input type="checkbox" checked={targets.includes(member.longAgentId)} onChange={(event) => setTargets((current) => event.target.checked ? [...new Set([...current, member.longAgentId])] : current.filter((id) => id !== member.longAgentId))} />
                  {agents.find((agent) => agent.id === member.longAgentId)?.name ?? member.longAgentId}
                </label>)}
              </fieldset>}
              <button type="button" className={styles.primary} disabled={policy === "mention" && targets.length === 0} onClick={() => void run(async () => {
                await startConversationRound(longAgentId, detail.conversation.id, { policy, ...(policy === "mention" ? { targets } : {}) });
                await reloadDetail(detail.conversation.id);
              })}>{t("conversations.startRound")}</button>
            </div>
            {activeMembers.length > 1 && <div className={styles.controls}>
              <label className={styles.field}>{t("conversations.consultTo")}
                <select value={consultTo} onChange={(event) => setConsultTo(event.target.value)}>
                  {activeMembers.filter((member) => member.longAgentId !== longAgentId).map((member) => <option key={member.longAgentId} value={member.longAgentId}>{agents.find((agent) => agent.id === member.longAgentId)?.name ?? member.longAgentId}</option>)}
                </select>
              </label>
              <input value={consultQuestion} onChange={(event) => setConsultQuestion(event.target.value)} placeholder={t("conversations.consultQuestion")} />
              <button type="button" disabled={consultTo === "" || consultQuestion.trim() === ""} onClick={() => void run(async () => {
                await startConversationConsultation(longAgentId, detail.conversation.id, { fromLongAgentId: longAgentId, toLongAgentId: consultTo, question: consultQuestion.trim() });
                setConsultQuestion(""); await reloadDetail(detail.conversation.id);
              })}>{t("conversations.consult")}</button>
            </div>}
            <div className={styles.controls}>
              <input value={workTitle} onChange={(event) => setWorkTitle(event.target.value)} placeholder={t("conversations.workTitle")} maxLength={120} />
              <input value={workInstruction} onChange={(event) => setWorkInstruction(event.target.value)} placeholder={t("conversations.workInstruction")} />
              <button type="button" disabled={workTitle.trim() === "" || workInstruction.trim() === ""} onClick={() => void run(async () => {
                await startConversationWork(longAgentId, detail.conversation.id, { requestId: `web-${String(Date.now())}`, title: workTitle.trim(), instruction: workInstruction.trim(), longAgentId });
                setWorkTitle(""); setWorkInstruction("");
                setTimeout(() => { void reloadDetail(detail.conversation.id); }, 1500);
              })}>{t("conversations.startWork")}</button>
            </div>
          </>}

          <section className={styles.statusSection} aria-label={t("conversations.statusLabel")}>
            <h4>{t("conversations.statusLabel")}</h4>
            <ul>
              {detail.discussions.map((discussion) => <li key={discussion.discussionId}>
                <span>{discussion.policy} · {discussion.status} · {String(discussion.modelCalls)} {t("conversations.modelCalls")}</span>
                {discussion.stopReason !== null && <small>{discussion.stopReason}</small>}
                <ul>{discussion.attempts.map((attempt) => <li key={attempt.attemptId}>
                  {agents.find((agent) => agent.id === attempt.speakerLongAgentId)?.name ?? attempt.speakerLongAgentId}: {attempt.status}
                  {attempt.reason !== null ? `（${attempt.reason}）` : ""}
                </li>)}</ul>
              </li>)}
              {works.map((work) => <li key={work.workId}>
                {t("conversations.work")}: {work.title} · {work.status}
                {(work.status === "queued" || work.status === "running") && <button type="button" className={styles.link} onClick={() => void run(async () => {
                  await cancelConversationWork(longAgentId, detail.conversation.id, work.workId); await reloadDetail(detail.conversation.id);
                })}>{t("conversations.cancelWork")}</button>}
              </li>)}
            </ul>
          </section>

          {detail.conversation.lifecycle === "active" && <button type="button" className={styles.danger} onClick={() => void run(async () => {
            await archiveConversation(longAgentId, detail.conversation.id, detail.conversation.revision);
            await reloadDetail(detail.conversation.id); await reloadList();
          })}>{t("conversations.archive")}</button>}
        </>}
      </section>
    </div>
    {error !== null && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
