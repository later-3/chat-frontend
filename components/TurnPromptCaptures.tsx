"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { groupPromptCaptures, parsePromptCaptureDetail } from "@/lib/prompt-captures";
import { PromptCaptureRow } from "./PromptCaptureTurnTree";

type DetailState = { detail: import("@/lib/prompt-captures").PromptCaptureDetail | null; error: string | null };

/**
 * 对话流内嵌的「本轮完整 Prompt」解析块（区域树）。
 *
 * 开启「完整 Prompt 记录」的会话在消息流里逐轮内嵌该轮真实发出的 Provider 请求解析：
 * system prompt 分区（系统基础 / 当前项目 / 协作 / 自定义指令）、按区域标注的消息序列
 * （当前用户消息 / 历史用户 / assistant / 工具结果 / 注入指令）、tool schema。
 * 默认展开；块头收起后即回到普通会话视图（只看到用户那句话）。
 */
export function TurnPromptCaptures({ projectId, sessionId, group, defaultExpanded }: {
  readonly projectId: string;
  readonly sessionId: string;
  /** 该轮对应的 prompt-capture 分组（按 turnKey 已匹配）；undefined = 该轮没有记录。 */
  readonly group: ReturnType<typeof groupPromptCaptures>[number] | undefined;
  readonly defaultExpanded: boolean;
}) {
  const { t } = useI18n();
  const [payloads, setPayloads] = useState<ReadonlyMap<string, DetailState>>(() => new Map());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  if (group === undefined || group.records.length === 0) return null;

  const allCollapsed = group.records.every((record) => collapsed.has(record.requestId));

  const loadDetail = (requestId: string) => {
    setPayloads((current) => {
      if (current.has(requestId)) return current;
      void fetch(`/api/sessions/${encodeURIComponent(sessionId)}/prompt-captures/${encodeURIComponent(requestId)}?projectId=${encodeURIComponent(projectId)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return parsePromptCaptureDetail(await response.json());
        })
        .then((detail) => {
          setPayloads((inner) => new Map(inner).set(requestId, { detail, error: null }));
        })
        .catch((cause) => {
          setPayloads((inner) => new Map(inner).set(requestId, { detail: null, error: cause instanceof Error ? cause.message : String(cause) }));
        });
      return current;
    });
  };

  // 需要展示的记录统一在 effect 里加载（渲染期不做副作用）。
  useEffect(() => {
    if (group === undefined) return;
    for (const record of group.records) {
      if (!collapsed.has(record.requestId) && !payloads.has(record.requestId)) loadDetail(record.requestId);
    }
  }, [group, collapsed, payloads, sessionId, projectId]);

  return <div className="chat-prompt-embed" data-turn-prompt-capture={group.key}>
    <button type="button" className="chat-prompt-embed-toggle" aria-expanded={!allCollapsed}
      onClick={() => {
        setCollapsed((current) => allCollapsed
          ? new Set()
          : new Set(group.records.map((record) => record.requestId)));
      }}>
      {allCollapsed ? "▸" : "▾"} {t("promptCapture.embedTitle")}
      <small className="chat-prompt-embed-count">{t("promptCapture.embedRequests", { count: group.records.length })}</small>
    </button>
    {group.records.map((record) => {
      const stored = payloads.get(record.requestId) ?? null;
      return <PromptCaptureRow
        key={record.requestId}
        record={record}
        expanded={!collapsed.has(record.requestId)}
        payload={stored}
        filters={new Set(["injected-instruction", "current-user-message", "history-user", "assistant", "tool-result"])}
        rawPayload={false}
        formatTime={(timestamp) => timestamp}
        onToggle={() => {
          loadDetail(record.requestId);
          setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(record.requestId)) next.delete(record.requestId); else next.add(record.requestId);
            return next;
          });
        }}
      />;
    })}
  </div>;
}
