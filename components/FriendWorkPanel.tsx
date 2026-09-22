import { readFriendWorkSubmission, saveFriendWorkSubmission, type FriendWorkSubmission } from "@/lib/friend-work-draft";
import { useEffect, useRef, useState } from "react";
import { IconPlus, IconPlayerStop } from "@tabler/icons-react";
import { fetchFriendWork, startFriendWork, type FriendWorkItem } from "@/lib/friend-work";
import { cancelFriendExecution } from "@/lib/friend-execution";
import { startProjectLongAgent } from "@/lib/long-agents-browser";
import { useI18n } from "@/hooks/useI18n";
import styles from "./FriendWorkPanel.module.css";

export function FriendWorkPanel({ agentId, sessionId, projectId, onOpenSession }: {
  agentId: string; sessionId: string; projectId: string | null;
  onOpenSession: (sessionId: string, projectId: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<FriendWorkItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<FriendWorkSubmission | null>(() => readFriendWorkSubmission(agentId));
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const request = useRef<{ key: string; id: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const selected = items.find(item => item.work.sessionId === sessionId);
  useEffect(() => {
    const controller = new AbortController(); let fetching = false;
    const load = async () => {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        const next = await fetchFriendWork(agentId, controller.signal);
        if (!controller.signal.aborted) { setItems(next); setLoaded(true); setLoadError(null); }
      } catch (cause) { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : String(cause)); }
      finally { fetching = false; }
    };
    void load(); const timer = setInterval(() => void load(), 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [agentId, refresh]);
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); if (mounted.current) setRefresh(n => n + 1); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const create = () => act(async () => {
    const input = { originSessionId: selected?.work.originSessionId ?? sessionId, contextProjectId: projectId, title, text };
    const key = JSON.stringify(input);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    const submission = { ...input, requestId: request.current.id };
    saveFriendWorkSubmission(agentId, submission); setPending(submission);
    await startFriendWork(agentId, submission);
    saveFriendWorkSubmission(agentId, null); setPending(null);
    if (mounted.current) { setTitle(""); setText(""); setOpen(false); request.current = null; }
  });
  return <section className={styles.panel} aria-label={t("friendWork.heading")}>
    <header><h3>{t("friendWork.heading")}</h3><button type="button" disabled={busy || !loaded}
      onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={t("friendWork.create")} title={t("friendWork.create")}><IconPlus size={16} /></button></header>
    {selected && <><p>{t("friendWork.fixedContext", { project: selected.work.contextProjectId ?? t("friendWork.noProject") })}</p>
      <button type="button" disabled={busy} onClick={() => void act(async () => {
        const result = await startProjectLongAgent({ longAgentId: agentId, projectId: agentId });
        await onOpenSession(result.primarySessionId, result.projectId);
      })}>{t("friendWork.back")}</button></>}
    {pending && <div role="status"><p>{t("friendWork.unconfirmed")}</p>
      <button type="button" disabled={busy} onClick={() => void act(async () => {
        await startFriendWork(agentId, pending); saveFriendWorkSubmission(agentId, null);
        if (mounted.current) { setPending(null); setOpen(false); setTitle(""); setText(""); }
      })}>{t("friendWork.confirm")}</button></div>}
    {open && !pending && <form onSubmit={e => { e.preventDefault(); void create(); }}>
      <p>{t("friendWork.hint")}</p>
      <label>{t("friendWork.title")}<input required maxLength={120} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
      <label>{t("friendWork.description")}<textarea required maxLength={100000} rows={4} value={text} disabled={busy} onChange={e => setText(e.target.value)} /></label>
      <button type="submit" disabled={busy || !title.trim() || !text.trim()}>{busy ? t("friendWork.accepting") : t("friendWork.start")}</button>
    </form>}
    {(error || loadError) && <div role="alert"><p>{error || loadError}</p><button type="button" onClick={() => setRefresh(n => n + 1)}>{t("friendWork.retry")}</button></div>}
    {!loaded && !error && !loadError && <p role="status">{t("friendWork.loading")}</p>}
    {loaded && items.length === 0 && <p>{t("friendWork.empty")}</p>}
    <ul>{[...items].reverse().map(item => <li key={item.work.id}>
      <button type="button" className={styles.work} aria-current={item.work.sessionId === sessionId ? "page" : undefined}
        onClick={() => void act(() => Promise.resolve(onOpenSession(item.work.sessionId, agentId)))} disabled={busy || !item.execution}>
        <strong>{item.work.title}</strong><span>{t(`friendWork.status.${item.execution?.status ?? "pending"}`)}</span>
      </button>
      {item.execution?.capabilities.cancel && <button type="button" disabled={busy} title={t("friendWork.stop", { title: item.work.title })}
        aria-label={t("friendWork.stop", { title: item.work.title })} onClick={() => void act(() => cancelFriendExecution(item.execution!))}><IconPlayerStop size={16} /></button>}
    </li>)}</ul>
  </section>;
}
