"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SurfaceDialog } from "./SurfaceDialog";
import { useI18n } from "@/hooks/useI18n";
import { fetchContextPreview, type ContextPreviewView } from "@/lib/interactions";
import { ContextUsageBar } from "./ContextUsageBar";
import { RequestDetailViewPanel } from "./TurnInteractions";

/**
 * 发送前编辑入口（B5）：**实时装配**"这一次将发送的内容"（不调用模型）。
 * 勾选/恢复后**防抖重新装配**（与后端同一条过滤链），让面板内容、块/条目/工具与"将发送"统计立即跟上；
 * 刷新期间保留旧内容（不闪屏），仅显示"刷新中"。
 */
const REFRESH_DEBOUNCE_MS = 600;

export function ContextPreviewDialog({ sessionId, projectId, longAgentId, contextProjectId, draft, onClose }: {
  readonly sessionId: string;
  readonly projectId: string;
  readonly longAgentId: string;
  /** 当前对话所在项目（Agent 容器为 null）。 */
  readonly contextProjectId?: string | null;
  /** 用户正在输入的本轮内容（会作为本轮 user 消息出现）。 */
  readonly draft: string;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<ContextPreviewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    setError(null);
    void fetchContextPreview(sessionId, projectId, longAgentId, { draft, contextProjectId: contextProjectId ?? null, signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setPreview(value); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!controller.signal.aborted) setRefreshing(false); });
    return () => controller.abort();
  }, [sessionId, projectId, longAgentId, contextProjectId, draft, reloadToken]);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setRefreshing(true);
    timerRef.current = window.setTimeout(() => setReloadToken((token) => token + 1), REFRESH_DEBOUNCE_MS);
  }, []);
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);

  return <SurfaceDialog title={t("chat.contextPreview")} description={t("chat.contextPreviewNote")} onClose={onClose}>
    <div className="ui-scroll-20" data-context-preview>
      {error !== null && <p className="surface-error" role="alert" data-context-preview-error>{error}</p>}
      {preview === null && error === null && <p className="workspace-muted" role="status">{t("promptCapture.loadingPayload")}</p>}
      {preview !== null && refreshing && <p className="workspace-muted" role="status" data-context-preview-refreshing>
        {t("chat.contextPreviewRefreshing")}
      </p>}
      {preview?.detail != null && <>
        <ContextUsageBar usage={preview.usage} />
        <RequestDetailViewPanel detail={preview.detail} row={preview.detail.row}
          filter="all" sessionId={sessionId} projectId={projectId} editable blockLabels={preview.blockLabels}
          usage={preview.usage} onEditSaved={scheduleRefresh} />
      </>}
    </div>
  </SurfaceDialog>;
}
