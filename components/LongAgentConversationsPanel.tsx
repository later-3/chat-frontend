import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchChatProjects, type ChatProjectSummary } from "@/lib/projects-contract";
import {
  archiveConversation,
  createConversation,
  fetchConversation,
  fetchConversations,
  setConversationMember,
  type ConversationDiscussion,
  type ConversationSummary,
} from "@/lib/friend-conversations";
import styles from "./LongAgentConversationsPanel.module.css";


/** Group identity and membership management; execution opens the one group workspace. */
export function LongAgentConversationsPanel({ longAgentId, agents, onEnter }: {
  longAgentId: string;
  onEnter: (projectId:string, conversationId:string) => void;
  agents: readonly { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<readonly ChatProjectSummary[]>([]);
  const [storageProjectId, setStorageProjectId] = useState<string>("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ conversation: ConversationSummary; discussions: ConversationDiscussion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const busyRef = useRef(false);
  const latest = useRef({longAgentId,storageProjectId,selectedId});
  latest.current = {longAgentId,storageProjectId,selectedId};
  const createRequest = useRef<{key:string;id:string}|null>(null);
  const [loaded,setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState<string[]>([longAgentId]);

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
    const list = await fetchConversations(longAgentId, storageProjectId, signal);
    if (signal?.aborted || latest.current.longAgentId !== longAgentId || latest.current.storageProjectId !== storageProjectId) return;
    setConversations(list); setLoaded(true);
  }, [longAgentId, storageProjectId]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null); setLoaded(false); setConversations([]);
    void reloadList(controller.signal).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [reloadList]);

  const reloadDetail = useCallback(async (conversationId: string, signal?:AbortSignal) => {
    const next = await fetchConversation(longAgentId,conversationId,signal);
    if (signal?.aborted || latest.current.longAgentId !== longAgentId || latest.current.selectedId !== conversationId) return;
    setDetail(next);
  }, [longAgentId]);
  useEffect(() => {
    setDetail(null);
    if (!selectedId) return;
    const controller = new AbortController();
    void reloadDetail(selectedId,controller.signal).catch(cause=>{if (!controller.signal.aborted) setError(String(cause.message??cause));});
    return ()=>controller.abort();
  }, [selectedId,reloadDetail]);

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current=true;setBusy(true);setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally {busyRef.current=false;setBusy(false);}
  };

  return <div className={styles.panel}>
    <div className={styles.columns}>
      <section className={styles.list} aria-label={t("conversations.listLabel")}>
        <label className={styles.field}>{t("conversations.storageProject")}
          <select value={storageProjectId} disabled={busy} onChange={(event) => {setStorageProjectId(event.target.value);setSelectedId(null);}}>
            {projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.cachedName}</option>)}
          </select>
        </label>
        <ul>
          {conversations.map((conversation) => <li key={conversation.id}>
            <button type="button" className={conversation.id === selectedId ? styles.activeItem : styles.item} disabled={busy} onClick={() => setSelectedId(conversation.id)}>
              <span>{conversation.title}</span>
              <small>{conversation.lifecycle === "archived" ? t("conversations.archived") : t("conversations.active")} · {String(conversation.members.filter((member) => member.active).length)} {t("conversations.membersSuffix")}</small>
            </button>
          </li>)}
          {loaded && !error && conversations.length === 0 && <li className={styles.hint}>{t("conversations.empty")}</li>}
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
          <Button variant="primary" type="button" className={styles.primary} disabled={busy || storageProjectId === "" || title.trim() === "" || !members.includes(longAgentId)} onClick={() => void run(async () => {
            const key = JSON.stringify([storageProjectId,title.trim(),members]);
            if (createRequest.current?.key !== key) createRequest.current={key,id:crypto.randomUUID()};
            const created = await createConversation(longAgentId, {
              storageProjectId, title: title.trim(), requestId: createRequest.current.id, memberLongAgentIds: members,
            });
            setTitle(""); createRequest.current=null;
            await reloadList();
            setSelectedId(created.id);
          })}>{t("conversations.create")}</Button>
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
              {detail.conversation.lifecycle === "active" && member.active && <Button variant="ghost" type="button" className={styles.link} disabled={busy} onClick={() => void run(async () => {
                await setConversationMember(longAgentId, detail.conversation.id, { action: "revoke", expectedRevision: detail.conversation.revision, longAgentId: member.longAgentId });
                await reloadDetail(detail.conversation.id); await reloadList();
              })}>{t("conversations.revoke")}</Button>}
            </div>)}
          </div>

          <p className={styles.hint}>{t("design.groupManagementHint")}</p>
          <Button variant="primary" type="button" className={styles.primary} onClick={() => onEnter(detail.conversation.storageProjectId,detail.conversation.id)}>{t("design.enterGroup")}</Button>

          {detail.conversation.lifecycle === "active" && <Button variant="danger" type="button" className={styles.danger} disabled={busy} onClick={() => void run(async () => {
            await archiveConversation(longAgentId, detail.conversation.id, detail.conversation.revision);
            await reloadDetail(detail.conversation.id); await reloadList();
          })}>{t("conversations.archive")}</Button>}
        </>}
      </section>
    </div>
    {error !== null && <p role="alert" className={styles.error}><InterfaceFeedback message={error} /></p>}
  </div>;
}
