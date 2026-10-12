"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { TurnInteractions } from "./TurnInteractions";
import type { TurnSummaryData } from "@/lib/turn-summary";
import { fetchInteractionIndex, type InteractionGroupView } from "@/lib/interactions";

/**
 * 回复 bar（B4 · P2，变体 A）：跟随每条 agent 回复下方、内联宽度的收起态胶囊；
 * 点击展开 = 占满全宽详情面板（`TurnInteractions mode="turn-summary"`，B3-R3 全能力）；
 * **展开态 bar sticky 吸顶**（G1 D1：挂接 scrollContainerRef 真实滚动容器；失效先查 :595 overflow-hidden）。
 *
 * 数据双源（都在后端聚合，02 T9）：
 *   - Pi 会话侧 `summary`（summarizeTurn：usage/tokens/工具数/耗时/model）；
 *   - 交互侧 interactions 轮 summary（promptChars/请求/尝试/失败/状态——按 chatLongAgent.turnId 匹配；
 *     匹配不到（summaryDraft/daily-summary/群聊/普通会话，G1 D2 清单）→ 交互侧字段降级"未记录"，
 *     **不报错不伪造**）。
 * 运行中实时（G1 D3）：`completed` 翻转（true→false 边界之外，false→true 即轮结束）时强制 refetch，
 *   运行中每 5s 轮询（保守，不引 SSE）。
 */

export interface TurnSummaryBarProps {
  readonly summary: TurnSummaryData;
  /** 轮是否已完成（false = 运行中） */
  readonly completed: boolean;
  /** 交互轮键（= chatLongAgent.turnId）；undefined = 匹配不到（G1 D2 降级清单） */
  readonly turnKey?: string;
  /** 轮起点时间（entryTimes[userIdx]）——turnId 与交互分组键不同系时按时间窗匹配（B3-R2 后键系缺口） */
  readonly turnStartedAt?: number | null;
  readonly projectId: string;
  readonly sessionId: string | undefined;
  readonly defaultExpanded?: boolean;
}

const REFRESH_INTERVAL_MS = 5_000;

export function TurnSummaryBar({ summary, completed, turnKey, turnStartedAt, projectId, sessionId, defaultExpanded = false }: TurnSummaryBarProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const [group, setGroup] = useState<InteractionGroupView | null>(null);
  const prevCompleted = useRef(completed);

  const refetch = useCallback(() => {
    if (turnKey === undefined || sessionId === undefined) return;
    void fetchInteractionIndex(sessionId, projectId, { limit: 50 })
      .then(index => {
        // 轮匹配：turnId 直配优先；分组键是 workflowInvocationId ?? turnKey（与消息 turnId 不同系）
        // → 时间窗兜底（轮首请求在用户消息之后，取最近的组）。
        const direct = turnKey !== undefined ? index.groups.find(candidate => candidate.key === turnKey) : undefined;
        const started = turnStartedAt ?? null;
        const byTime = started === null ? undefined
          : [...index.groups].filter(candidate => Date.parse(candidate.firstTimestamp) >= started - 1_000)
            .sort((x, y) => Date.parse(x.firstTimestamp) - Date.parse(y.firstTimestamp))[0];
        setGroup(direct ?? byTime ?? null);
      })
      .catch(() => { /* 交互侧降级：字段保持"未记录"，不报错（G1 D2） */ });
  }, [sessionId, projectId, turnKey, turnStartedAt]);

  useEffect(() => {
    if (turnKey === undefined || sessionId === undefined) return;
    refetch();
  }, [turnKey, sessionId, refetch]);

  // G1 D3：轮结束翻转（completed false→true）立即强制 refetch；运行中每 5s 轮询
  useEffect(() => {
    if (prevCompleted.current === false && completed === true) refetch();
    prevCompleted.current = completed;
  }, [completed, refetch]);
  useEffect(() => {
    if (completed || turnKey === undefined || sessionId === undefined) return;
    const timer = window.setInterval(refetch, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [completed, turnKey, refetch]);

  const known = group !== null && group.hasOutcome;
  const stateLabel = !completed ? t("promptCapture.turnRunning")
    : !known ? t("promptCapture.resultUnknown")
    : group!.failures > 0 ? t("promptCapture.attemptsFailures", { count: group!.failures })
    : t("promptCapture.turnDone");
  const promptChars = group?.promptChars;
  const tokens = summary.tokens > 0 ? summary.tokens.toLocaleString() : null;

  return <div className={`turn-summary-bar${expanded ? " is-expanded" : ""}`} data-summary-bar data-expanded={expanded ? "true" : "false"} data-group-key={group?.key ?? "none"} data-turn-started-at={String(turnStartedAt ?? "none")}>
    <button type="button" className="reply-bar" aria-expanded={expanded} data-summary-bar-toggle
      onClick={() => setExpanded((open: boolean) => !open)}>
      <span className="bar-name">{t("promptCapture.replyBar")}</span>
      <span className={!completed ? "bar-running" : known && group!.failures > 0 ? "bar-failures" : undefined}
        data-reply-state={!completed ? "running" : !known ? "unknown" : "done"}>
        {stateLabel}
      </span>
      <span>{promptChars !== undefined
        ? t("promptCapture.replyBarPrompt", { chars: promptChars.toLocaleString() })
        : t("promptCapture.promptUnknown")}</span>
      {tokens !== null && <span>↑{t("promptCapture.attemptTokens", { n: tokens })}</span>}
      <span>{t("promptCapture.metaTools", { n: summary.toolCount })}</span>
      {summary.durationMs !== null && <span>{t("promptCapture.durationMs", { ms: String(Math.round(summary.durationMs)) })}</span>}
      {summary.model !== null && <span className="bar-model">{summary.model}</span>}
      <span className="bar-chev" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
    </button>
    {expanded && <div className="summary-detail-panel" data-summary-detail>
      {turnKey === undefined
        ? <p className="workspace-muted" data-no-interactions>{t("promptCapture.noInteractions")}</p>
        : <TurnInteractions turnKey={group!.key} sessionId={sessionId ?? ""} projectId={projectId} mode="turn-summary" />}
    </div>}
  </div>;
}


