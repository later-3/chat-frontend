import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useTheme } from "@/hooks/useTheme";
import { SurfaceDialog } from "./SurfaceDialog";
import { styleHistoryDocument } from "@/lib/history-document";
import historyCss from "@/src/history-theme.css?raw";

export function FullHistoryDialog({ projectId, sessionId, onClose }: { projectId: string; sessionId: string; onClose: () => void }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/export?projectId=${encodeURIComponent(projectId)}`;
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(new Error("读取历史超时，请重试")), 45_000);
    setHtml(null);
    setError(null);
    void fetch(`${url}&inline=1`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(`读取完整历史失败（HTTP ${response.status}）`);
      if (!response.headers.get('content-type')?.includes('text/html')) throw new Error("历史服务返回了非 HTML 内容");
      const document = await response.text();
      styleHistoryDocument(document, "");
      if (!controller.signal.aborted) setHtml(document);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted || controller.signal.reason instanceof Error && controller.signal.reason.name !== 'AbortError') {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }).finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [url, revision]);
  const document = useMemo(() => {
    if (!html) return undefined;
    const computed = getComputedStyle(window.document.documentElement);
    const mapping: Record<string, string> = { 'body-bg':'bg', 'container-bg':'bg-panel', 'info-bg':'bg-panel', text:'text', muted:'text-muted', dim:'text-dim', border:'border', accent:'accent', borderAccent:'accent', hover:'bg-hover', selectedBg:'bg-selected', success:'success', warning:'warning', error:'danger', userMessageBg:'user-bg', userMessageText:'text', toolPendingBg:'bg-panel', toolSuccessBg:'success-bg', toolErrorBg:'danger-bg', customMessageBg:'bg-panel', customMessageLabel:'accent', customMessageText:'text', thinkingText:'text-muted', toolOutput:'text', toolDiffAdded:'success', toolDiffRemoved:'danger', toolDiffContext:'text-muted', mdCode:'accent', mdCodeBlockBorder:'border', mdHeading:'text', mdHr:'border', mdLink:'accent', mdListBullet:'accent', mdQuote:'text-muted', mdQuoteBorder:'border', syntaxComment:'text-muted', syntaxFunction:'accent', syntaxKeyword:'accent', syntaxNumber:'warning', syntaxOperator:'text', syntaxPunctuation:'text-muted', syntaxString:'success', syntaxType:'accent', syntaxVariable:'text' };
    const declarations = Object.entries(mapping).map(([target, source]) => `--${target}:${computed.getPropertyValue(`--${source}`)};`).join('');
    return styleHistoryDocument(html, `:root { color-scheme:${theme}; ${declarations} }\n${historyCss}`);
  }, [html, theme]);
  return <SurfaceDialog title={t("history.label")} description="当前 Session 的完整记录与分支 · 只读浏览，不改变正在交流的会话" wide onClose={onClose}
    actions={<a className="workspace-button" href={url} download>导出</a>}>
    {error ? <div className="surface-empty surface-error" role="alert"><p>{error}</p><button className="workspace-button" onClick={() => setRevision(value => value + 1)}>重试</button></div>
      : document ? <iframe className="full-history-frame" srcDoc={document} title={t("history.label")} sandbox="allow-downloads allow-scripts" />
      : <div className="surface-empty" role="status">{t("history.loading")}</div>}
  </SurfaceDialog>;
}
