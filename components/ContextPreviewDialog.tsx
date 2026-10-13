"use client";

import { useEffect, useState } from "react";
import { SurfaceDialog } from "./SurfaceDialog";
import { useI18n } from "@/hooks/useI18n";
import { fetchContextPreview, type ContextPreviewView } from "@/lib/interactions";
import { RequestDetailViewPanel } from "./TurnInteractions";

/**
 * 发送前编辑入口（B5，用户 2026-10-13 定界）：
 *   **这是"这一次要发给模型什么"的地方**（composer 旁）；完整历史是事后只读回看。
 * 展示最近一次发送的**完整请求体**：区块可展开 → 看到块内条目与内容 → 区块级/条目级勾选（下一轮生效）。
 * 底层与完整历史共用同一套树与编辑接口，入口与语义分开。
 */
export function ContextPreviewDialog({ sessionId, projectId, onClose }: {
  readonly sessionId: string;
  readonly projectId: string;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<ContextPreviewView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setError(null);
    void fetchContextPreview(sessionId, projectId, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setPreview(value); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [sessionId, projectId]);

  return <SurfaceDialog title={t("chat.contextPreview")} description={t("chat.contextPreviewNote")} onClose={onClose}>
    <div className="ui-scroll-20" data-context-preview>
      {error !== null && <p className="surface-error" role="alert" data-context-preview-error>{error}</p>}
      {preview === null && error === null && <p className="workspace-muted" role="status">{t("promptCapture.loadingPayload")}</p>}
      {preview !== null && !preview.payloadPresent && <p className="workspace-muted" data-context-preview-empty>
        {t("chat.contextPreviewEmpty")}
      </p>}
      {preview?.detail != null && <RequestDetailViewPanel detail={preview.detail} row={preview.detail.row}
        filter="all" sessionId={sessionId} projectId={projectId} editable />}
    </div>
  </SurfaceDialog>;
}
