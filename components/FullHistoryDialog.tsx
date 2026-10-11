import { Button } from "./ui/Button";
import { InterfaceFeedback } from "./InterfaceFeedback";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { SurfaceDialog } from "./SurfaceDialog";
import { TurnInteractions } from "./TurnInteractions";
import {
  fetchInteractionIndex,
  type InteractionGroupView,
  type InteractionIndexView,
} from "@/lib/interactions";

type Props = { projectId: string; sessionId: string; onClose: () => void };

/**
 * 完整历史（B3 · U7，变体 A）：单列按轮列表 + 原位展开（与摘要条同一 TurnInteractions 组件）。
 * 首屏只取摘要（全量 groups + recording，rows 分页不消费）；原文按请求展开时按需拉取；
 * Pi HTML 导出降为“下载”（不再 iframe 载入 2.1MB）；legacy 会话同 UI，降级能力见 B3-design D3 矩阵。
 */
export function FullHistoryDialog(props: Props) {
  return <FullHistoryContent key={JSON.stringify([props.projectId, props.sessionId])} {...props} />;
}

function FullHistoryContent({ projectId, sessionId, onClose }: Props) {
  const { t } = useI18n();
  const [index, setIndex] = useState<InteractionIndexView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const exportUrl = `/api/sessions/${encodeURIComponent(sessionId)}/export?projectId=${encodeURIComponent(projectId)}`;

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void fetchInteractionIndex(sessionId, projectId, { limit: 50, signal: controller.signal })
      .then(value => { setIndex(value); })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, [sessionId, projectId, revision]);

  const retry = useCallback(() => setRevision(value => value + 1), []);

  const header = <div className="turn-interactions-dialog-head" data-full-history-head>
    {index !== null && <span
      className={index.recording.enabled ? "prompt-capture-recording is-on" : "prompt-capture-recording"}
      data-recording-state={index.recording.enabled ? "on" : "off"}>
      {index.recording.enabled ? t("promptCapture.recordingOn") : t("promptCapture.recordingOff")}
    </span>}
  </div>;

  return <SurfaceDialog
    title={t("history.label")}
    description={t("interface.complete.history.and.branches.read.only.browsing.keeps.the.current.conversation.in.place")}
    onClose={onClose}
    actions={<>
      {/* Pi 导出降为下载（U7）：不再 iframe 载入整份导出。 */}
      <a className="workspace-button" href={exportUrl} download>{t("promptCapture.downloadExport")}</a>
    </>}>
    {header}
    {error !== null
      ? <div className="surface-empty surface-error" role="alert">
          <p><InterfaceFeedback message={error} /></p>
          <Button variant="secondary" className="workspace-button" onClick={retry}>{t("interface.retry")}</Button>
        </div>
      : index === null
        ? <div className="surface-empty" role="status">{t("history.loading")}</div>
        : index.groups.length === 0
          ? <div className="surface-empty" role="status">
              <p>{t("promptCapture.empty")}</p>
              <p className="workspace-muted">{index.recording.enabled ? t("promptCapture.emptyHint") : t("promptCapture.emptyHintOff")}</p>
            </div>
          : <div className="full-history-turns" data-full-history-turns>
              {index.groups.map((group, position) => <FullHistoryTurnRow
                key={`${group.key}-${position}`}
                group={group}
                position={position + 1}
                sessionId={sessionId}
                projectId={projectId}
                legacy={index.legacy}
                expanded={expandedKey === `${group.key}-${position}`}
                onToggle={() => setExpandedKey(current => current === `${group.key}-${position}` ? null : `${group.key}-${position}`)}
              />)}
            </div>}
  </SurfaceDialog>;
}

function FullHistoryTurnRow({ group, position, sessionId, projectId, legacy, expanded, onToggle }: {
  readonly group: InteractionGroupView;
  readonly position: number;
  readonly sessionId: string;
  readonly projectId: string;
  readonly legacy: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const { t } = useI18n();
  return <section className="full-history-turn" data-turn-position={position}>
    <button className="full-history-turn-header" aria-expanded={expanded} data-full-history-turn-toggle onClick={onToggle}>
      {expanded ? <span aria-hidden="true">▾</span> : <span aria-hidden="true">▸</span>}
      <span className="full-history-turn-index">{t("promptCapture.turnN", { n: position })}</span>
      <span className="full-history-turn-source">
        {group.source === "workflow" ? t("promptCapture.turnWorkflow", { workflow: group.stage.id }) : t("promptCapture.turnDirect")}
      </span>
      <span className="full-history-turn-stats">
        {t("promptCapture.turnRequests", { count: group.requestCount })}
        {" · "}
        <span className={group.failures > 0 ? "turn-interactions-failures" : undefined}>
          {t("promptCapture.turnFailures", { count: group.failures })}
        </span>
        {" · "}
        {t("promptCapture.turnTokens", { count: group.tokenOut.toLocaleString() })}
      </span>
    </button>
    {expanded && <div className="full-history-turn-body">
      <TurnInteractions key={group.key} sessionId={sessionId} projectId={projectId} turnKey={group.key} mode="full-history" />
    </div>}
    {!expanded && legacy && <p className="workspace-muted full-history-legacy-note" data-full-history-legacy>{t("promptCapture.legacyHint")}</p>}
  </section>;
}
