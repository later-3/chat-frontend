
import { InterfaceFeedback } from "./InterfaceFeedback";
import { useRef, useState } from "react";
import { IconSend } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { getDraft, setDraft as storeDraft, clearDraft } from "@/lib/draft-store";
import { readPendingSubmission, retainPendingSubmission, clearPendingSubmission } from "@/lib/pending-submission";
import { sendConversationMessage } from "@/lib/friend-conversations";
import styles from "./LongAgentGroupChatView.module.css";

/** Key this component by group and owner; acknowledgements only clear their original input. */
export function GroupComposer({ agentId, conversationId, onAccepted }: { agentId:string; conversationId:string; onAccepted:()=>Promise<void> }) {
  const { t } = useI18n();
  const key = JSON.stringify(["group", agentId, conversationId]);
  const [draft, setDraft] = useState(() => getDraft(key)?.value ?? "");
  const [pending, setPending] = useState(() => readPendingSubmission(key));
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    if (submitting.current || (!pending && !draft.trim())) return;
    submitting.current = true; setBusy(true); setError(null);
    const text = pending?.text ?? draft.trim();
    const id = pending?.id ?? retainPendingSubmission(key, text, 0);
    setPending(readPendingSubmission(key));
    try {
      await sendConversationMessage(agentId, conversationId, { clientMessageId:id, text });
      clearPendingSubmission(key, id); setPending(null);
      if (getDraft(key)?.value.trim() === text) { clearDraft(key); setDraft(current => current.trim() === text ? "" : current); }
      await onAccepted();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className={styles.composerArea}>
    {error && <p role="alert" className={styles.error}><InterfaceFeedback message={error} /></p>}
    {pending && !busy && <p className={styles.hint}>{t("design.groupPending")} <button type="button" onClick={() => {clearPendingSubmission(key,pending.id);setPending(null);}}>{t("design.discardRetry")}</button></p>}
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}>
      <label className={styles.composerLabel} htmlFor={`group-message-${conversationId}`}>{t("groups.messagePlaceholder")}</label>
      <textarea id={`group-message-${conversationId}`} value={draft} rows={2} onChange={event => { setDraft(event.target.value); storeDraft(key, { value:event.target.value, images:[] }); }} placeholder={t("design.groupMessageHint")} maxLength={100000} data-group-composer />
      <button type="submit" className={styles.send} disabled={busy || (!pending && !draft.trim())} aria-label={pending ? t("design.retrySame") : t("groups.send")} data-group-send>
        <IconSend size={18}/><span>{busy ? t("design.sending") : pending ? t("design.retrySame") : t("groups.send")}</span>
      </button>
    </form>
    <p className={styles.composerHint}>{t("design.groupSendHint")}</p>
  </div>;
}
