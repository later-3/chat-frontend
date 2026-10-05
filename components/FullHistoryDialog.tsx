import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useTheme } from "@/hooks/useTheme";
import { SurfaceDialog } from "./SurfaceDialog";
import { styleHistoryDocument } from "@/lib/history-document";
import historyCss from "@/src/history-theme.css?raw";


type Props = { projectId: string; sessionId: string; onClose: () => void };

export function FullHistoryDialog(props: Props) {
  // Session changes must discard cached documents and abort the old request.
  return <FullHistoryContent key={JSON.stringify([props.projectId, props.sessionId])} {...props} />;
}

function FullHistoryContent({ projectId, sessionId, onClose }: Props) {
  const { t, locale } = useI18n();
  const { theme } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/export?projectId=${encodeURIComponent(projectId)}`;
  // Keep the composed string stable until content/theme/locale changes. srcDoc also
  // works in embedded browsers that cannot navigate a sandboxed frame to a blob URL.
  const [frameDocument, setFrameDocument] = useState<string | null>(null);
  const [rawHtml, setRawHtml] = useState<string | null>(null);

  useEffect(() => {
    if (rawHtml !== null) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => controller.abort(new Error(t("interface.history.loading.timed.out.please.retry"))), 45_000);
    setError(null);
    void fetch(`${url}&inline=1`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(`读取完整历史失败（HTTP ${response.status}）`);
      if (!response.headers.get('content-type')?.includes('text/html')) throw new Error(t("interface.the.history.service.returned.an.unsupported.document.format"));
      const document = await response.text();
      styleHistoryDocument(document, "");
      if (active && !controller.signal.aborted) setRawHtml(document);
    }).catch((cause: unknown) => {
      if (active && (!controller.signal.aborted || controller.signal.reason instanceof Error && controller.signal.reason.name !== 'AbortError')) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }).finally(() => window.clearTimeout(timer));
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [url, revision, t, rawHtml]);

  useEffect(() => {
    const raw = rawHtml;
    if (raw === null) return;
    const computed = getComputedStyle(window.document.documentElement);
    const mapping: Record<string, string> = { 'body-bg':'bg', 'container-bg':'bg-panel', 'info-bg':'bg-panel', text:'text', muted:'text-muted', dim:'text-dim', border:'border', accent:'accent', borderAccent:'accent', hover:'bg-hover', selectedBg:'bg-selected', success:'success', warning:'warning', error:'danger', userMessageBg:'user-bg', userMessageText:'text', toolPendingBg:'bg-panel', toolSuccessBg:'success-bg', toolErrorBg:'danger-bg', customMessageBg:'bg-panel', customMessageLabel:'accent', customMessageText:'text', thinkingText:'text-muted', toolOutput:'text', toolDiffAdded:'success', toolDiffRemoved:'danger', toolDiffContext:'text-muted', mdCode:'accent', mdCodeBlockBorder:'border', mdHeading:'text', mdHr:'border', mdLink:'accent', mdListBullet:'accent', mdQuote:'text-muted', mdQuoteBorder:'border', syntaxComment:'text-muted', syntaxFunction:'accent', syntaxKeyword:'accent', syntaxNumber:'warning', syntaxOperator:'text', syntaxPunctuation:'text-muted', syntaxString:'success', syntaxType:'accent', syntaxVariable:'text' };
    const declarations = Object.entries(mapping).map(([target, source]) => `--${target}:${computed.getPropertyValue(`--${source}`)};`).join('');
    const composed = styleHistoryDocument(raw, `:root { color-scheme:${theme}; ${declarations} }\n${historyCss}`, locale);
    setFrameDocument(composed);
  }, [theme, locale, rawHtml]);

  const retry = useCallback(() => { setRawHtml(null); setRevision(value => value + 1); }, []);

  return <SurfaceDialog title={t("history.label")} description={t("interface.complete.history.and.branches.read.only.browsing.keeps.the.current.conversation.in.place")} onClose={onClose}
    actions={<>
      <a className="workspace-button" href={url} download>{t("interface.export")}</a>
    </>}>
    {error ? <div className="surface-empty surface-error" role="alert"><p><InterfaceFeedback message={error} /></p><Button variant="secondary" className="workspace-button" onClick={retry}>{t("interface.retry")}</Button></div>
      : frameDocument !== null ? <iframe className="full-history-frame" srcDoc={frameDocument} title={t("history.label")} sandbox="allow-downloads allow-scripts" />
      : <div className="surface-empty" role="status">{t("history.loading")}</div>}
  </SurfaceDialog>;
}
