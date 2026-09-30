import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useTheme } from "@/hooks/useTheme";
import { SurfaceDialog } from "./SurfaceDialog";
import { PromptCapturesPanel } from "./PromptCapturesPanel";
import { styleHistoryDocument } from "@/lib/history-document";
import historyCss from "@/src/history-theme.css?raw";

type FullHistoryView = "history" | "prompts";

export function FullHistoryDialog({ projectId, sessionId, onClose }: { projectId: string; sessionId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { theme } = useTheme();
  const [view, setView] = useState<FullHistoryView>("history");
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/export?projectId=${encodeURIComponent(projectId)}`;
  // The composed document lives behind a blob URL: the 3 MB string is handed to the
  // browser once per theme/locale instead of living in React state and re-rendering.
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const rawHtmlRef = useRef<string | null>(null);

  useEffect(() => {
    if (view !== "history") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(new Error(t("interface.history.loading.timed.out.please.retry"))), 45_000);
    setError(null);
    if (rawHtmlRef.current === null) {
      void fetch(`${url}&inline=1`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error(`读取完整历史失败（HTTP ${response.status}）`);
        if (!response.headers.get('content-type')?.includes('text/html')) throw new Error(t("interface.the.history.service.returned.an.unsupported.document.format"));
        const document = await response.text();
        styleHistoryDocument(document, "");
        if (!controller.signal.aborted) rawHtmlRef.current = document;
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted || controller.signal.reason instanceof Error && controller.signal.reason.name !== 'AbortError') {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }).finally(() => window.clearTimeout(timer));
      return () => { window.clearTimeout(timer); controller.abort(); };
    }
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [url, revision, view, t]);

  useEffect(() => {
    const raw = rawHtmlRef.current;
    if (view !== "history" || raw === null) return;
    const computed = getComputedStyle(window.document.documentElement);
    const mapping: Record<string, string> = { 'body-bg':'bg', 'container-bg':'bg-panel', 'info-bg':'bg-panel', text:'text', muted:'text-muted', dim:'text-dim', border:'border', accent:'accent', borderAccent:'accent', hover:'bg-hover', selectedBg:'bg-selected', success:'success', warning:'warning', error:'danger', userMessageBg:'user-bg', userMessageText:'text', toolPendingBg:'bg-panel', toolSuccessBg:'success-bg', toolErrorBg:'danger-bg', customMessageBg:'bg-panel', customMessageLabel:'accent', customMessageText:'text', thinkingText:'text-muted', toolOutput:'text', toolDiffAdded:'success', toolDiffRemoved:'danger', toolDiffContext:'text-muted', mdCode:'accent', mdCodeBlockBorder:'border', mdHeading:'text', mdHr:'border', mdLink:'accent', mdListBullet:'accent', mdQuote:'text-muted', mdQuoteBorder:'border', syntaxComment:'text-muted', syntaxFunction:'accent', syntaxKeyword:'accent', syntaxNumber:'warning', syntaxOperator:'text', syntaxPunctuation:'text-muted', syntaxString:'success', syntaxType:'accent', syntaxVariable:'text' };
    const declarations = Object.entries(mapping).map(([target, source]) => `--${target}:${computed.getPropertyValue(`--${source}`)};`).join('');
    const composed = styleHistoryDocument(raw, `:root { color-scheme:${theme}; ${declarations} }\n${historyCss}`, locale);
    const blobUrl = URL.createObjectURL(new Blob([composed], { type: "text/html" }));
    setFrameUrl(blobUrl);
    return () => { URL.revokeObjectURL(blobUrl); setFrameUrl(null); };
  }, [view, theme, locale, error, revision]);

  const retry = useCallback(() => { rawHtmlRef.current = null; setRevision(value => value + 1); }, []);
  const historyViewActive = view === "history";

  return <SurfaceDialog title={t("history.label")} description={t("interface.complete.history.and.branches.read.only.browsing.keeps.the.current.conversation.in.place")} onClose={onClose}
    actions={<>
      <div className="prompt-capture-view-toggle" role="tablist" aria-label={t("promptCapture.viewToggle")}>
        <button className={`workspace-button${historyViewActive ? " is-active" : ""}`} role="tab" aria-selected={historyViewActive} onClick={() => setView("history")}>{t("promptCapture.viewConversation")}</button>
        <button className={`workspace-button${!historyViewActive ? " is-active" : ""}`} role="tab" aria-selected={!historyViewActive} data-prompt-captures-view onClick={() => setView("prompts")}>{t("promptCapture.viewRequests")}</button>
      </div>
      <a className="workspace-button" href={url} download>{t("interface.export")}</a>
    </>}>
    {!historyViewActive ? <PromptCapturesPanel projectId={projectId} sessionId={sessionId} />
      : error ? <div className="surface-empty surface-error" role="alert"><p><InterfaceFeedback message={error} /></p><Button variant="secondary" className="workspace-button" onClick={retry}>{t("interface.retry")}</Button></div>
      : frameUrl !== null ? <iframe className="full-history-frame" src={frameUrl} title={t("history.label")} sandbox="allow-downloads allow-scripts" />
      : <div className="surface-empty" role="status">{t("history.loading")}</div>}
  </SurfaceDialog>;
}
