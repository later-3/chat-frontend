import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";
import { useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { cancelConversationWork, startConversationConsultation, startConversationWork, type ConversationSummary, type ConversationWork } from "@/lib/friend-conversations";
import { readPendingSubmission, retainPendingSubmission, clearPendingSubmission } from "@/lib/pending-submission";
import { parseGroupWorkInput } from "@/lib/group-submission";
import styles from "./LongAgentGroupChatView.module.css";

/** Advanced group actions live with the public discussion, not in Friend configuration. */
export function GroupWorkControls({ agentId, conversation, agents, works, onRefresh }: {
  agentId:string; conversation:ConversationSummary; agents:readonly {id:string;name:string}[]; works:readonly ConversationWork[]; onRefresh:()=>Promise<void>;
}) {
  const { t } = useI18n();
  const members = conversation.members.filter(member => member.active && member.longAgentId !== agentId);
  const [to, setTo] = useState(members[0]?.longAgentId ?? "");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string|null>(null);
  const [notice, setNotice] = useState<string|null>(null);
  const key = JSON.stringify(["group-actions",agentId,conversation.id]);
  const [pending, setPending] = useState(() => readPendingSubmission(key));
  async function act(kind:"consult"|"work") {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const input = pending ? parseGroupWorkInput(pending.text) : {kind,to,question,title:"",instruction:""};
      const requestId = pending?.id ?? retainPendingSubmission(key, JSON.stringify(input), 0);
      setPending(readPendingSubmission(key));
      if (input.kind === "consult") await startConversationConsultation(agentId,conversation.id,{discussionId:requestId,fromLongAgentId:agentId,toLongAgentId:input.to,question:input.question});
      else await startConversationWork(agentId,conversation.id,{requestId,title:input.title,instruction:input.instruction,longAgentId:agentId});
      clearPendingSubmission(key,requestId); setPending(null); setNotice(t("design.accepted"));
      setQuestion(current => current === input.question ? "" : current);
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <details className={styles.advanced}><summary>{t("design.groupAdvanced")}</summary>
    <div className={styles.advancedBody}>
      {error && <p role="alert" className={styles.error}><InterfaceFeedback message={error} /></p>}{notice && <p role="status">{notice}</p>}
      {pending && <div><Button type="button" disabled={busy} onClick={() => void act("work")}>{t("design.retrySame")}</Button> <Button type="button" disabled={busy} onClick={() => {clearPendingSubmission(key,pending.id);setPending(null);}}>{t("design.discardRetry")}</Button></div>}
      {conversation.lifecycle === "active" && <fieldset disabled={busy || pending !== null}>
        {members.length > 0 && <form onSubmit={event => {event.preventDefault();void act("consult");}}>
          <label>{t("conversations.consultTo")}<select value={to} onChange={event=>setTo(event.target.value)}>{members.map(member=><option key={member.longAgentId} value={member.longAgentId}>{agents.find(agent=>agent.id===member.longAgentId)?.name ?? member.longAgentId}</option>)}</select></label>
          <label>{t("conversations.consultQuestion")}<textarea value={question} onChange={event=>setQuestion(event.target.value)} rows={2}/></label>
          <Button type="submit" disabled={!to || !question.trim()}>{t("conversations.consult")}</Button>
        </form>}
        <Button variant="ghost" onClick={() => document.querySelector<HTMLTextAreaElement>("[data-group-composer]")?.focus()}>{t("friendWork.arrangeInChat")}</Button>
      </fieldset>}
      {works.map(work=><div className={styles.workRow} key={work.workId}><span>{work.title} · {t(`friendWork.status.${work.status}`)}</span>
        {(work.status === "queued" || work.status === "running") && <Button type="button" disabled={busy} onClick={() => {
          if (submitting.current) return; submitting.current=true;setBusy(true);setError(null);
          void cancelConversationWork(agentId,conversation.id,work.workId).then(onRefresh).catch(cause=>setError(String(cause.message??cause))).finally(()=>{submitting.current=false;setBusy(false);});
        }}>{t("conversations.cancelWork")}</Button>}
      </div>)}
    </div>
  </details>;
}
