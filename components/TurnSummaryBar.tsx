"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { MessageView } from "./MessageView";
import type { AgentMessage } from "@/lib/types";
import type { TurnSummaryData } from "@/lib/turn-summary";
import {
  fetchInteractionIndex,
  fetchSessionMessages,
  matchTurnMessages,
  type InteractionGroupView,
  type SessionMessageView,
} from "@/lib/interactions";

/**
 * 轮次摘要行（B4-R2，用户裁定重做）：
 * - **不叫"回复 bar"**（去自标）——轮次号 + 本响应的属性与总结信息，直接打印（原 TurnSummary 的语义：一个东西）；
 * - 点击展开 = **按 session 时间顺序的响应过程回放**：思考 → 工具调用（收起态行，点开看参数/结果）→ 最终回复，
 *   **复用 Pi 生态的 MessageView**（Pi TUI 同款展示：thinking 折叠、toolCall 收起展开）——不做"请求 N"抽象；
 * - 不含"看完整 prompt"入口（完整历史负责 (a)）；不嵌套第二层面板。
 * - 属性数据双源（都在后端/既有聚合）：summarizeTurn（Pi 会话侧）+ interactions 轮 summary（交互侧，
 *   未匹配降级"未记录"，G1 D2 清单）；运行中轮询 5s + completed 翻转强制 refetch（G1 D3）。
 */

export interface TurnSummaryBarProps {
  /** 轮次序号（1 起，直接打印） */
  readonly turnNumber: number;
  readonly summary: TurnSummaryData;
  readonly completed: boolean;
  readonly turnKey?: string;
  /** 轮起点时间（消息流 entryTimes[userIdx]）——轮键不同系时按时间窗匹配 */
  readonly turnStartedAt?: number | null;
  readonly projectId: string;
  readonly sessionId: string | undefined;
  readonly defaultExpanded?: boolean;
}

const REFRESH_INTERVAL_MS = 5_000;

export function TurnSummaryBar({ turnNumber, summary, completed, turnKey, turnStartedAt, projectId, sessionId, defaultExpanded = false }: TurnSummaryBarProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const [group, setGroup] = useState<InteractionGroupView | null>(null);
  const [groups, setGroups] = useState<readonly InteractionGroupView[]>([]);
  const [processMessages, setProcessMessages] = useState<readonly SessionMessageView[] | null>(null);
  const prevCompleted = useRef(completed);

  // 交互侧轮属性（状态/失败/prompt 占用）——轮键不同系：turnId 直配 + 时间窗（G1 D2 清单）
  const refetch = useCallback(() => {
    if (sessionId === undefined) return;
    void fetchInteractionIndex(sessionId, projectId, { limit: 50 })
      .then(index => {
        const direct = turnKey !== undefined ? index.groups.find(candidate => candidate.key === turnKey) : undefined;
        const started = turnStartedAt ?? null;
        const byTime = started === null ? undefined
          : [...index.groups].filter(candidate => Date.parse(candidate.firstTimestamp) >= started - 1_000)
            .sort((x, y) => Date.parse(x.firstTimestamp) - Date.parse(y.firstTimestamp))[0];
        setGroups(index.groups);
        setGroup(direct ?? byTime ?? null);
      })
      .catch(() => { /* 交互侧降级"未记录"（G1 D2） */ });
  }, [sessionId, projectId, turnKey, turnStartedAt]);

  // 过程回放数据：该轮 session 消息（展开时拉一次；完整原始消息给 MessageView）
  const loadProcess = useCallback(() => {
    if (sessionId === undefined) return;
    void fetchSessionMessages(sessionId, projectId)
      .then(value => setProcessMessages(value))
      .catch(() => setProcessMessages([]));
  }, [sessionId, projectId]);

  useEffect(() => {
    if (turnKey === undefined && turnStartedAt === undefined) return;
    refetch();
  }, [turnKey, turnStartedAt, refetch]);
  useEffect(() => {
    if (expanded) loadProcess();
  }, [expanded, loadProcess]);

  // G1 D3：轮结束翻转强制 refetch；运行中每 5s 轮询
  useEffect(() => {
    if (prevCompleted.current === false && completed === true) refetch();
    prevCompleted.current = completed;
  }, [completed, refetch]);
  useEffect(() => {
    if (completed) return;
    const timer = window.setInterval(refetch, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [completed, refetch]);

  const groupState = group?.state ?? null;
  const stateLabel = groupState === "unknown" ? t("promptCapture.resultUnknown")
    : groupState === "done" ? (group !== null && group.failures > 0 ? t("promptCapture.attemptsFailures", { count: group.failures }) : t("promptCapture.turnDone"))
    : !completed ? t("promptCapture.turnRunning")
    : group !== null && group.hasOutcome ? t("promptCapture.turnDone") : t("promptCapture.resultUnknown");
  const promptChars = group?.promptChars;
  const tokens = summary.tokens > 0 ? summary.tokens.toLocaleString() : null;

  // 该轮响应过程（按 session 时间顺序，去掉发起方 a——展示"收到之后做了什么"）
  const turnIndex = group !== null ? groups.findIndex(candidate => candidate.key === group.key) : -1;
  const process = expanded && processMessages !== null && group !== null
    ? matchTurnMessages(group, turnIndex >= 0 ? turnIndex : 0, groups, processMessages,
        turnIndex >= 0 ? groups[turnIndex + 1]?.firstTimestamp : undefined)
    : null;
  const responseProcess = process === null ? null
    : (() => {
        const firstAssistant = process.findIndex(message => message.role === "assistant" || message.role === "toolResult");
        let slice = firstAssistant < 0 ? process.slice(1) : process.slice(firstAssistant, process.length);
        // 跳过空条目：toolResult 独立消息（结果已内联展示在上方 toolCall 卡）与无可见内容的占位消息
        slice = slice.filter(message => {
          if (message.role === "toolResult") return false;
          const content = message.content;
          const hasBlocks = Array.isArray(content) && content.length > 0;
          const hasText = typeof content === "string" && content.trim().length > 0;
          const hasThinking = hasBlocks && (content as { type?: string }[]).some(block => block?.type === "thinking");
          const hasToolCall = hasBlocks && (content as { type?: string }[]).some(block => block?.type === "toolCall");
          return hasText || hasThinking || hasToolCall || message.role === "assistant";
        });
        return slice;
      })();

  return <div className={`turn-summary-bar${expanded ? " is-expanded" : ""}`} data-summary-bar data-expanded={expanded ? "true" : "false"}>
    {/* 轮次摘要行：轮号 + 属性（直接打印，无自标名） */}
    <button type="button" className="turn-summary-head" aria-expanded={expanded} data-summary-bar-toggle
      onClick={() => setExpanded(open => !open)}>
      <span className="turn-summary-number">{t("promptCapture.turnN", { n: turnNumber })}</span>
      <span className={groupState === "running" || (group === null && !completed) ? "bar-running" : undefined}
        data-reply-state={groupState === "unknown" ? "unknown"
          : groupState === "done" ? "done"
          : groupState === "running" || (group === null && !completed) ? "running" : "unknown"}>
        {stateLabel}
      </span>
      {(group?.excluded ?? 0) > 0 && <span className="turn-summary-excluded" data-turn-excluded={group?.excluded}>
        {t("promptCapture.turnExcluded", { n: group?.excluded ?? 0 })}
      </span>}
      <span>{promptChars !== undefined
        ? t("promptCapture.replyBarPrompt", { chars: promptChars.toLocaleString() })
        : t("promptCapture.promptUnknown")}</span>
      {tokens !== null && <span>↑{t("promptCapture.attemptTokens", { n: tokens })}</span>}
      <span>{t("promptCapture.metaTools", { n: summary.toolCount })}</span>
      {summary.durationMs !== null && <span>{t("promptCapture.durationMs", { ms: String(Math.round(summary.durationMs)) })}</span>}
      {summary.model !== null && <span className="bar-model">{summary.model}</span>}
      <span className="bar-chev" aria-hidden="true">{expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}</span>
    </button>

    {/* 展开 = 响应过程回放（session 顺序：思考/工具调用/结果/回复——Pi MessageView 同款） */}
    {expanded && <div className="turn-process" data-turn-process>
      {responseProcess === null
        ? <p className="workspace-muted" role="status">{t("history.loading")}</p>
        : responseProcess.length === 0
          ? <p className="workspace-muted">{t("promptCapture.noProcessMessages")}</p>
          : responseProcess.map((message, index) => (
              <div key={`${message.timestamp ?? index}-${index}`} className="turn-process-item" data-process-index={index}>
                <MessageView message={message.raw as unknown as AgentMessage}
                  sessionId={sessionId} projectId={projectId}
                  {...(message.entryId === undefined ? {} : { entryId: message.entryId })} />
              </div>
            ))}
    </div>}
  </div>;
}
