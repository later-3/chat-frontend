"use client";

import { useCallback, useEffect, useState } from "react";
import { SurfaceDialog } from "./SurfaceDialog";
import { useI18n } from "@/hooks/useI18n";
import {
  EMPTY_CONTEXT_EDIT,
  fetchContextEdit,
  fetchInteractionIndex,
  saveContextEdit,
  type ContextEditState,
  type InteractionRowView,
} from "@/lib/interactions";

/**
 * 发送前编辑入口（B5，用户 2026-10-13 定界）：
 *   **这是"这一次要发给模型什么"的地方**（composer 旁）；完整历史是事后只读回看。
 * 数据 = 当前上下文块清单（来源：最近一次实际请求的区域记录——块名/大小/预览/工具名都无条件记录，
 * 不依赖"完整记录"开关）。勾掉/恢复即写入编辑层，**下一轮生效**；原记录不改写。
 */
export function ContextPreviewDialog({ sessionId, projectId, onClose }: {
  readonly sessionId: string;
  readonly projectId: string;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const [latest, setLatest] = useState<InteractionRowView | null>(null);
  const [edit, setEdit] = useState<ContextEditState>(EMPTY_CONTEXT_EDIT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.all([
      fetchInteractionIndex(sessionId, projectId, { limit: 50, signal: controller.signal }),
      fetchContextEdit(sessionId, projectId, controller.signal),
    ]).then(([index, state]) => {
      if (controller.signal.aborted) return;
      const rows = [...index.rows].sort((a, b) => a.seq - b.seq);
      setLatest(rows.at(-1) ?? null);
      setEdit(state);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sessionId, projectId]);

  const excludedSet = new Set(edit.excluded);
  const toggle = useCallback((blockId: string) => {
    if (saving) return;
    const nextExcluded = excludedSet.has(blockId)
      ? edit.excluded.filter((id) => id !== blockId)
      : [...edit.excluded, blockId];
    setEdit({ ...edit, excluded: nextExcluded });
    setSaving(true);
    setError(null);
    void saveContextEdit(sessionId, projectId, { excluded: nextExcluded, modified: edit.modified, added: edit.added })
      .then((saved) => setEdit(saved))
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        void fetchContextEdit(sessionId, projectId).then(setEdit).catch(() => undefined);
      })
      .finally(() => setSaving(false));
  }, [edit, excludedSet, projectId, saving, sessionId]);

  const blocks = latest?.regions ?? [];
  const tools = latest?.toolNames ?? [];
  const blockIdOf = (tag: string | undefined) => (tag === undefined || tag === "" ? null : `tag:${tag}`);
  const keptBlocks = blocks.filter((block) => { const id = blockIdOf(block.tag); return id === null || !excludedSet.has(id); });
  const excludedBlocks = blocks.filter((block) => { const id = blockIdOf(block.tag); return id !== null && excludedSet.has(id); });
  const keptTools = tools.filter((name) => !excludedSet.has(`tools:${name}`));
  const excludedTools = tools.filter((name) => excludedSet.has(`tools:${name}`));
  const sendChars = keptBlocks.reduce((sum, block) => sum + block.chars, 0);

  return <SurfaceDialog title={t("chat.contextPreview")} description={t("chat.contextPreviewNote")} onClose={onClose}>
    <div className="ui-scroll-20 ui-stack-16" data-context-preview>
      {loading && <p className="workspace-muted" role="status">{t("promptCapture.loadingPayload")}</p>}
      {!loading && latest === null && <p className="workspace-muted" data-context-preview-empty>{t("chat.contextPreviewEmpty")}</p>}
      {!loading && latest !== null && <>
        <div className="request-meta" data-context-preview-summary>
          <span>{t("chat.contextPreviewSendSummary", { n: keptBlocks.length, chars: sendChars.toLocaleString() })}</span>
          <span>{t("chat.contextPreviewTools", { n: keptTools.length })}</span>
          {saving && <span className="workspace-muted">{t("promptCapture.editSaving")}</span>}
        </div>
        {error !== null && <p className="surface-error" role="alert" data-context-edit-error>
          {t("promptCapture.editSaveError", { message: error })}
        </p>}

        <div className="raw-system-blocks" data-context-preview-blocks>
          {keptBlocks.map((block, index) => <ContextPreviewBlockRow key={`kept-${index}`} block={block} excluded={false}
            blockId={blockIdOf(block.tag)} onToggle={toggle} />)}
          {excludedBlocks.length > 0 && <details className="prompt-capture-section context-excluded-region" data-context-excluded open>
            <summary><span className="raw-role">{t("promptCapture.editExcludedRegion", { n: excludedBlocks.length })}</span></summary>
            {excludedBlocks.map((block, index) => <ContextPreviewBlockRow key={`excluded-${index}`} block={block} excluded
              blockId={blockIdOf(block.tag)} onToggle={toggle} />)}
          </details>}
        </div>

        {tools.length > 0 && <details className="prompt-capture-section" data-context-preview-tools open>
          <summary>{t("promptCapture.tools", { count: tools.length })}</summary>
          <div className="raw-system-blocks">
            {keptTools.map((name) => <details key={name} className="prompt-capture-section raw-tool">
              <summary>
                <input type="checkbox" checked data-context-edit-toggle={`tools:${name}`}
                  aria-label={t("promptCapture.editExclude")}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle(`tools:${name}`); }} />
                <span className="raw-role">{name}</span>
              </summary>
            </details>)}
            {excludedTools.length > 0 && <details className="prompt-capture-section context-excluded-region" data-context-excluded-tools open>
              <summary><span className="raw-role">{t("promptCapture.editExcludedRegion", { n: excludedTools.length })}</span></summary>
              {excludedTools.map((name) => <details key={name} className="prompt-capture-section raw-tool is-excluded" data-excluded>
                <summary>
                  <input type="checkbox" data-context-edit-toggle={`tools:${name}`}
                    aria-label={t("promptCapture.editRestore")}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle(`tools:${name}`); }} />
                  <span className="raw-role">{name}</span>
                  <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>
                </summary>
              </details>)}
            </details>}
          </div>
        </details>}

        <details className="prompt-capture-section" data-context-preview-messages>
          <summary>{t("promptCapture.metaMessages", { n: latest.messageCount })}</summary>
          <p className="workspace-muted">{t("chat.contextPreviewMessagesNote")}</p>
        </details>
      </>}
    </div>
  </SurfaceDialog>;
}

function ContextPreviewBlockRow({ block, excluded, blockId, onToggle }: {
  readonly block: { readonly id: string; readonly label: string; readonly chars: number; readonly preview?: string; readonly tag?: string };
  readonly excluded: boolean;
  readonly blockId: string | null;
  readonly onToggle: (blockId: string) => void;
}) {
  const { t } = useI18n();
  return <details className={`prompt-capture-section raw-tag-block${excluded ? " is-excluded" : ""}`}
    data-tag={block.tag ?? ""} data-context-preview-block={block.id} data-excluded={excluded || undefined}>
    <summary>
      {blockId !== null && <input type="checkbox" data-context-edit-toggle={blockId} checked={!excluded}
        aria-label={excluded ? t("promptCapture.editRestore") : t("promptCapture.editExclude")}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(blockId); }} />}
      <span className="raw-tag">{block.tag === undefined || block.tag === "" ? t("promptCapture.piBaseBlock") : `<${block.tag}>`}</span>
      <span className="workspace-muted">{block.label}</span>
      {excluded && <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>}
      <span className="workspace-muted">{t("promptCapture.payloadChars", { chars: block.chars.toLocaleString() })}</span>
    </summary>
    {block.preview !== undefined && <pre className="prompt-capture-block-text">{block.preview}{(block.preview.length >= 80) ? "…" : ""}</pre>}
  </details>;
}
