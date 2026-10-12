"use client";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { PromptCaptureBlock, contentText } from "./PromptCaptureTurnTree";
import { regionLabelKey } from "@/lib/prompt-captures";
import {
  fetchInteractionTurnGroup,
  fetchRequestDetail,
  type InteractionRequestGroupView,
  type InteractionRowView,
  type InteractionTurnGroupView,
  type RequestDetailView,
} from "@/lib/interactions";

/**
 * 轮次交互树（B3-R2 · 按原型逐屏装配）：
 *   b 卡下方 = **回复 bar 胶囊（默认收起）** → 点击展开 = 区块 pills → 阶段头 → 请求组 → 详情
 *   （详情顺序：元信息 → 同内容引导句 → 逐次尝试 → 结果 → 系统提示[占比+两层条形+同内容提示]
 *    → 消息序列[历史/本轮输入/执行链三段] → 工具 → 原始请求体）。
 * 信息正确性：请求数/尝试数分列（E1）；legacy 无 outcome → "未记录"而非 0/进行中（E2-E4）；
 * 聚合数字全部来自后端（02 T9）。mode 契约：full-history（本组件）/ turn-summary（B4）。
 */

export interface TurnInteractionsProps {
  readonly sessionId: string;
  readonly projectId: string;
  readonly turnKey: string;
  readonly mode: "full-history" | "turn-summary";
  readonly defaultExpanded?: boolean;
}

interface DetailEntry {
  readonly detail: RequestDetailView | null;
  readonly error: string | null;
}

const DETAIL_CACHE_LIMIT = 12;

/** 区块级过滤（原型 4 pills）。 */
type BlockFilter = "all" | "system" | "history" | "tools";
const BLOCK_FILTERS: readonly BlockFilter[] = ["all", "system", "history", "tools"];
const BLOCK_LABEL_KEY: Record<BlockFilter, string> = {
  all: "promptCapture.filterAll",
  system: "promptCapture.filterSystem",
  history: "promptCapture.filterHistory",
  tools: "promptCapture.filterTools",
};

interface OutlineNode {
  readonly level: number;
  readonly title: string;
  readonly lines: string[];
  readonly subs: OutlineNode[];
}

function parseOutline(text: string): OutlineNode {
  const root: OutlineNode = { level: 0, title: "", lines: [], subs: [] };
  const stack: OutlineNode[] = [root];
  for (const raw of text.split("\n")) {
    const match = /^(#{1,6}) (.*)/.exec(raw.trimEnd());
    if (match && match[2]!.trim().length <= 60) {
      const node: OutlineNode = { level: match[1]!.length, title: match[2]!.trim(), lines: [], subs: [] };
      while (stack.length > 1 && stack[stack.length - 1]!.level >= node.level) stack.pop();
      stack[stack.length - 1]!.subs.push(node);
      stack.push(node);
    } else stack[stack.length - 1]!.lines.push(raw);
  }
  return root;
}
function outlineChars(node: OutlineNode): number {
  return node.lines.join("\n").length + node.subs.reduce((total, sub) => total + outlineChars(sub), 0);
}
function stripTitle(text: string): string {
  return text.replace(/^#{1,3} [^\n]{1,44}\s*\n/, "");
}
function timeOf(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toTimeString().slice(0, 8);
}

export function TurnInteractions({ sessionId, projectId, turnKey, mode, defaultExpanded = true }: TurnInteractionsProps) {
  const { t } = useI18n();
  const [group, setGroup] = useState<InteractionTurnGroupView | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [details, setDetails] = useState<ReadonlyMap<string, DetailEntry>>(() => new Map());
  const [expandedRequests, setExpandedRequests] = useState<ReadonlySet<string>>(() => new Set());
  const [blockFilter, setBlockFilter] = useState<BlockFilter>("all");
  // 回复 bar 默认收起（原型装配：bar 是入口，展开才见执行树）
  const [barOpen, setBarOpen] = useState(defaultExpanded ? false : false);
  const detailsRef = useRef(details);
  detailsRef.current = details;

  useEffect(() => {
    const controller = new AbortController();
    setGroup(null);
    setGroupError(null);
    setBarOpen(false);
    setExpandedRequests(new Set());
    void fetchInteractionTurnGroup(sessionId, projectId, turnKey, controller.signal)
      .then(value => { if (!controller.signal.aborted) setGroup(value); })
      .catch(cause => { if (!controller.signal.aborted) setGroupError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [sessionId, projectId, turnKey]);

  const loadDetail = useCallback((requestId: string) => {
    if (detailsRef.current.has(requestId)) return;
    setDetails(current => new Map(current).set(requestId, { detail: null, error: null }));
    void fetchRequestDetail(sessionId, projectId, requestId)
      .then(detail => {
        setDetails(current => {
          const next = new Map(current);
          next.set(requestId, { detail, error: null });
          while (next.size > DETAIL_CACHE_LIMIT) {
            const oldest = next.keys().next().value as string | undefined;
            if (oldest === undefined || oldest === requestId) break;
            next.delete(oldest);
          }
          return next;
        });
      })
      .catch(cause => {
        setDetails(current => new Map(current).set(requestId, { detail: null, error: cause instanceof Error ? cause.message : String(cause) }));
      });
  }, [sessionId, projectId]);

  const toggleRequest = useCallback((requestId: string) => {
    setExpandedRequests(current => {
      const next = new Set(current);
      if (next.has(requestId)) next.delete(requestId); else next.add(requestId);
      return next;
    });
    loadDetail(requestId);
  }, [loadDetail]);

  if (groupError !== null) return <p className="surface-error" role="alert">{groupError}</p>;
  if (group === null) return <p className="workspace-muted" role="status">{t("promptCapture.loadingPayload")}</p>;

  const rowByRequestId = new Map<string, InteractionRowView>(group.rows.map(row => [row.requestId, row]));
  const stageOf = (request: InteractionRequestGroupView) =>
    rowByRequestId.get(request.requestId)?.turn.stage ?? { id: "direct", nodeKind: "system" };
  const stageOrder: { id: string; nodeKind: string; requests: InteractionRequestGroupView[] }[] = [];
  if (barOpen) {
    for (const request of group.requests) {
      const stage = stageOf(request);
      let bucket = stageOrder.find(candidate => candidate.id === stage.id && candidate.nodeKind === stage.nodeKind);
      if (bucket === undefined) { bucket = { id: stage.id, nodeKind: stage.nodeKind, requests: [] }; stageOrder.push(bucket); }
      bucket.requests.push(request);
    }
  }
  const known = group.summary.hasOutcome;

  return <div className="turn-interactions" data-turn-interactions={turnKey} data-mode={mode}>
    {/* 回复 bar（S1）：内联胶囊、默认收起——统计入口，点开才见执行树 */}
    <button type="button" className="reply-bar" data-reply-bar aria-expanded={barOpen}
      onClick={() => setBarOpen(open => !open)}>
      <span className="bar-name">{t("promptCapture.replyBar")}</span>
      <span className={group.summary.failures > 0 ? "bar-failures" : undefined} data-reply-state={
        !known ? "unknown" : group.summary.failures > 0 ? "failed" : "done"}>
        {!known ? t("promptCapture.resultUnknown")
          : group.summary.failures > 0 ? t("promptCapture.turnFailures", { count: group.summary.failures })
          : t("promptCapture.turnDone")}
      </span>
      <span>{t("promptCapture.replyBarStats", {
        chars: group.summary.promptChars.toLocaleString(),
        requests: group.summary.requestCount,
        attempts: group.summary.attempts,
      })}</span>
      <span>{known
        ? t("promptCapture.turnTokens", { count: group.summary.tokenOut.toLocaleString() })
        : t("promptCapture.tokensUnknown")}</span>
      <span className="bar-model">{group.summary.model}</span>
      {group.legacy && <span className="turn-interactions-legacy" title={t("promptCapture.legacyHint")}>{t("promptCapture.legacyBadge")}</span>}
      <span className="bar-chev" aria-hidden="true">{barOpen ? "▾" : "▸"}</span>
    </button>

    {barOpen && <>
      {/* S6：区块 pills 在展开区顶部（独立行） */}
      <div className="region-pills" role="tablist" aria-label={t("promptCapture.filters")} data-block-filter>
        {BLOCK_FILTERS.map(filter => (
          <button key={filter} type="button" role="tab" aria-selected={blockFilter === filter}
            className={blockFilter === filter ? "region-pill is-active" : "region-pill"}
            onClick={() => setBlockFilter(filter)}>
            {t(BLOCK_LABEL_KEY[filter])}
          </button>
        ))}
      </div>

      {stageOrder.map(stage => {
        const stageSummary = group.stages.find(candidate => candidate.id === stage.id && candidate.nodeKind === stage.nodeKind)
          ?? { id: stage.id, nodeKind: stage.nodeKind, requestCount: stage.requests.length, attempts: 0, failures: 0 };
        return <section key={`${stage.id}::${stage.nodeKind}`} className="turn-interactions-stage" data-stage-id={stage.id}>
          <div className="stage-head" data-stage-head>
            <span className="stage-name">{stage.id === "direct" ? t("promptCapture.turnDirect") : stage.id}</span>
            <span className="stage-kind">{stage.nodeKind}</span>
            <span className="stage-stats">{t("promptCapture.stageStats", {
              requests: stageSummary.requestCount,
              attempts: stageSummary.attempts,
              failures: stageSummary.failures,
            })}</span>
          </div>
          {stage.requests.map((request, index) => {
            const row = rowByRequestId.get(request.requestId);
            const expanded = expandedRequests.has(request.requestId) && defaultExpanded;
            const entry = details.get(request.requestId);
            const attempts = request.attemptIds.map(id => rowByRequestId.get(id)).filter((candidate): candidate is InteractionRowView => candidate !== undefined);
            const finalSuccess = request.attempts > 1 && request.lastOutcome?.status === "success";
            return <section key={request.requestId} className="ui-card prompt-capture-record" data-prompt-capture-record={request.requestId}>
              <button className="prompt-capture-record-header" aria-expanded={expanded} data-prompt-capture-row-toggle
                onClick={() => toggleRequest(request.requestId)}>
                {expanded ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
                <span className="prompt-capture-seq">{t("promptCapture.requestN", { n: index + 1 })}</span>
                {request.attempts > 1 && <span className="prompt-capture-attempts">{t("promptCapture.attemptsX", { count: request.attempts })}</span>}
                {request.failures > 0 && <span className="prompt-capture-failures">{t("promptCapture.attemptsFailures", { count: request.failures })}</span>}
                {finalSuccess && <span className="prompt-capture-success">{t("promptCapture.finalSuccess")}</span>}
                <span className="prompt-capture-meta">
                  {t("promptCapture.payloadChars", { chars: request.regions.reduce((total, region) => total + region.chars, 0).toLocaleString() })}
                  {row !== undefined && ` · ${timeOf(row.timestamp)}`}
                </span>
              </button>
              {expanded && entry === undefined && <p className="workspace-muted" role="status">{t("promptCapture.loadingPayload")}</p>}
              {expanded && entry !== null && entry !== undefined && entry.error !== null && <p className="surface-error" role="alert">{entry.error}</p>}
              {expanded && entry !== null && entry !== undefined && entry.error === null && entry.detail !== null && <div className="prompt-capture-detail">
                {/* S4 顺序：元信息 → 同内容引导 → 逐次尝试 → 结果 → 区块 */}
                <RequestMeta detail={entry.detail} row={row} request={request} />
                {request.attempts > 1 && <p className="attempt-guide" data-attempt-guide>
                  {t("promptCapture.sameContent", { sha: entry.detail.row.payload.sha256.slice(0, 8), n: request.attempts })}
                </p>}
                {request.attempts > 1 && <div className="attempt-list" data-attempt-list>
                  {attempts.map((attemptRow, attemptIndex) => (
                    <div key={attemptRow.requestId}
                      className={attemptRow.outcome === undefined ? "attempt-row"
                        : attemptRow.outcome.status === "success" ? "attempt-row is-success" : "attempt-row is-error"}>
                      <span className="attempt-no">{t("promptCapture.attemptN", { n: attemptIndex + 1 })}</span>
                      {attemptRow.outcome === undefined
                        ? <span className="attempt-meta">{t("promptCapture.attemptNoResult")}</span>
                        : <>
                            {attemptRow.outcome.status !== "success" && <span className="attempt-error">{attemptRow.outcome.errorMessage ?? attemptRow.outcome.stopReason ?? attemptRow.outcome.status}</span>}
                            {typeof attemptRow.outcome.usage === "object" && attemptRow.outcome.usage !== null &&
                              <span className="attempt-meta">↑{t("promptCapture.attemptTokens", { n: (attemptRow.outcome.usage as { totalTokens?: number }).totalTokens?.toLocaleString() ?? "?" })}</span>}
                            {attemptRow.outcome.durationMs !== undefined && <span className="attempt-meta">{t("promptCapture.durationMs", { ms: String(Math.round(attemptRow.outcome.durationMs)) })}</span>}
                            {attemptRow.outcome.responseId !== undefined && <span className="attempt-meta">{attemptRow.outcome.responseId}</span>}
                            {attemptRow.outcome.status === "success" && <span className="attempt-meta">{attemptRow.outcome.stopReason ?? ""}</span>}
                          </>}
                    </div>
                  ))}
                </div>}
                <RequestDetailViewPanel detail={entry.detail} row={row} request={request} filter={blockFilter} attemptsOfRequest={request.attempts} />
              </div>}
            </section>;
          })}
        </section>;
      })}
      {group.requests.length === 0 && <p className="workspace-muted" role="status">{t("promptCapture.empty")}</p>}
    </>}
  </div>;
}

function RequestMeta({ detail, row, request }: {
  readonly detail: RequestDetailView;
  readonly row: InteractionRowView | undefined;
  readonly request?: InteractionRequestGroupView;
}) {
  const { t } = useI18n();
  return <div className="request-meta" data-request-meta>
    <span><code>{row?.model.provider}/{row?.model.modelId}</code></span>
    <span>{row !== undefined && `${row.turn.stage.id} · ${row.turn.stage.nodeKind}`}</span>
    <span>{t("promptCapture.metaTools", { n: request?.toolCount ?? row?.toolCount ?? 0 })}</span>
    <span>{t("promptCapture.metaMessages", { n: request?.messageCount ?? row?.messageCount ?? 0 })}</span>
    <span>{t("promptCapture.metaExcluded", { n: row?.excluded.count ?? 0 })}</span>
    <span><code>{request?.requestId ?? detail.row.requestId}</code></span>
    <span><code>{t("promptCapture.metaSha", { sha: detail.row.payload.sha256.slice(0, 8) })}</code></span>
  </div>;
}

/** 发起方 bar（02 §2.1 a 视角）与请求组共用同一详情面板——同一条捕获记录、两个视图锚点。 */
export function RequestDetailViewPanel({ detail, row, request, filter, attemptsOfRequest }: {
  readonly detail: RequestDetailView;
  readonly row: InteractionRowView | undefined;
  readonly request?: InteractionRequestGroupView;
  readonly filter: BlockFilter;
  readonly attemptsOfRequest?: number;
}) {
  const { t } = useI18n();
  if (detail.payload === null && !detail.legacy) {
    // 完整记录关闭的轮次：区域摘要在请求行可见，原文按契约不存在——如实说明（不伪造空树）。
    return <div className="prompt-capture-detail" data-payload-missing>
      {detail.outcome !== undefined && <div className="turn-interactions-outcome" data-outcome={detail.outcome.status}>
        <span>{t("promptCapture.outcome", { status: detail.outcome.status })}</span>
      </div>}
      <p className="workspace-muted">{t("promptCapture.noOriginal")}</p>
    </div>;
  }
  const payload = detail.payload ?? {};
  const messages = Array.isArray(payload.messages) ? (payload.messages as { role?: string; content?: unknown }[]) : [];
  const systemContent = typeof payload.system === "string"
    ? payload.system
    : messages[0] !== undefined && messages[0]?.role === "system" ? contentText(messages[0]?.content) : null;
  const body = systemContent !== null ? messages.slice(1) : messages;
  const marks = detail.messageRegions;

  // S4/S3：消息序列三段（历史 / 本轮输入 / 执行链），带过滤
  const grouped = body.map((message, index) => {
    const mark = marks[index] ?? { index, role: message.role ?? "", region: "unclassified" };
    const seg = mark.region === "history-user" ? "history" as const
      : mark.region === "current-user-message" ? "current" as const : "chain" as const;
    return { message, mark, seg };
  });
  const historyItems = grouped.filter(item => item.seg === "history");
  const currentItems = grouped.filter(item => item.seg === "current");
  const chainItems = grouped.filter(item => item.seg === "chain");
  const visible = (items: typeof grouped) => filter === "all" || filter === "history"
    ? items
    : items.filter(item => item.seg !== "history");

  const outline = systemContent === null ? null : parseOutline(systemContent);
  const systemChars = systemContent === null ? 0 : systemContent.length;
  // S2 双源：优先大纲树（顶层=原文标题、天然两层，真实样本齐全）；system 无标题结构（E2E fixture）
  // 时回退读模型 rows 的区域摘要（单层、人话 label）。
  const barSections = outline !== null && outline.subs.length > 0
    ? outline.subs.map(section => ({ id: section.title, label: section.title, chars: outlineChars(section), subs: section.subs }))
    : (row ?? detail.row).regions.map(region => ({ id: region.id, label: region.label ?? region.id, chars: region.chars, subs: [] as OutlineNode[] }));
  const maxSectionChars = Math.max(1, ...barSections.map(section => section.chars));
  const tools = Array.isArray(payload.tools) ? (payload.tools as { name?: string; function?: { name?: string } }[]) : [];
  const attempts = attemptsOfRequest ?? request?.attempts ?? 1;

  const renderItems = (items: typeof grouped, keyPrefix: string) => items.map(item => item.mark.region === "history-user"
    ? <details key={`${keyPrefix}-${item.mark.index}`} className="prompt-capture-section prompt-capture-history">
        <summary>{t(regionLabelKey(item.mark.region))} · {t("promptCapture.payloadChars", { chars: contentText(item.message.content).length.toLocaleString() })}</summary>
        <PromptCaptureBlock label={t(regionLabelKey(item.mark.region)) + (item.message.role === undefined ? "" : ` · ${item.message.role}`)}
          text={contentText(item.message.content)} mono={item.message.role === "tool"} />
      </details>
    : <PromptCaptureBlock key={`${keyPrefix}-${item.mark.index}`}
        label={t(regionLabelKey(item.mark.region)) + (item.mark.customType !== undefined ? ` · ${item.mark.customType}` : item.message.role === undefined ? "" : ` · ${item.message.role}`)}
        text={contentText(item.message.content)}
        mono={item.message.role === "tool"}
        focus={item.mark.region === "current-user-message"} />);

  return <div className="prompt-capture-detail">
    {detail.outcome !== undefined && <div className="turn-interactions-outcome" data-outcome={detail.outcome.status}>
      <span>{t("promptCapture.outcome", { status: detail.outcome.status })}</span>
      {detail.outcome.errorMessage !== undefined && <span className="surface-error">{detail.outcome.errorMessage}</span>}
      {detail.outcome.durationMs !== undefined && <span className="workspace-muted">{t("promptCapture.durationMs", { ms: String(Math.round(detail.outcome.durationMs)) })}</span>}
      {detail.outcome.responseId !== undefined && <span className="workspace-muted">{detail.outcome.responseId}</span>}
    </div>}
    {detail.outcome === undefined && detail.legacy && <p className="workspace-muted" data-legacy-no-outcome>{t("promptCapture.noOutcome")}</p>}

    {/* S2：系统提示折叠区内 = 占比 + 两层区域条形（顶层带条、子层缩进列表）+ 同内容提示 */}
    {systemContent !== null && outline !== null && (filter === "all" || filter === "system") &&
      <details className="prompt-capture-section" data-prompt-capture-system open>
        <summary>
          <span>{t("promptCapture.systemPrompt", { chars: systemChars.toLocaleString() })}</span>
          <span className="workspace-muted">{t("promptCapture.ofRequest", { pct: (Math.round(systemChars / Math.max(1, detail.row.payload.chars) * 1000) / 10).toFixed(1) })}</span>
          {attempts > 1 && <span className="prompt-capture-success">{t("promptCapture.contentIdentical", { n: attempts })}</span>}
        </summary>
        {barSections.length > 0 && <div className="region-bars" data-region-bars>
          {barSections.map((section, index) => (
            <div key={index} className="region-bar-group">
              <div className="region-bar-row">
                <span className="region-name" title={section.id}>{section.label}</span>
                <span className="region-track"><span className="region-fill" style={{ width: `${Math.max(4, Math.round(section.chars / maxSectionChars * 100))}%` }} /></span>
                <span className="region-chars">{section.chars.toLocaleString()}</span>
              </div>
              {section.subs.map((sub, subIndex) => (
                <div key={subIndex} className="region-bar-row is-sub">
                  <span className="region-name">{sub.title}</span>
                  <span className="region-chars">{outlineChars(sub).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ))}
        </div>}
        <OutlineTree nodes={outline.subs} depth={0} />
      </details>}

    {/* S3：消息序列三段（历史 / 本轮输入 / 执行链） */}
    {(filter === "all" || filter === "history") && grouped.length > 0 &&
      <details className="prompt-capture-section" data-message-seq open>
        <summary>{t("promptCapture.messageSequence", { count: grouped.length, chars: grouped.reduce((total, item) => total + contentText(item.message.content).length, 0).toLocaleString() })}</summary>
        <div className="message-segments">
          {historyItems.length > 0 && <div className="message-segment" data-segment="history">
            <div className="message-segment-title">{t("promptCapture.seqHistory")} · {t("promptCapture.payloadChars", { chars: historyItems.reduce((total, item) => total + contentText(item.message.content).length, 0).toLocaleString() })}</div>
            {renderItems(visible(historyItems), "h")}
          </div>}
          {currentItems.length > 0 && <div className="message-segment is-current" data-segment="current">
            <div className="message-segment-title">{t("promptCapture.seqCurrentInput")}</div>
            {renderItems(currentItems, "c")}
          </div>}
          {chainItems.length > 0 && <div className="message-segment" data-segment="chain">
            <div className="message-segment-title">{t("promptCapture.seqExecutionChain")}</div>
            {renderItems(visible(chainItems), "k")}
          </div>}
        </div>
      </details>}

    {tools.length > 0 && (filter === "all" || filter === "tools") && <details className="prompt-capture-section" data-tool-schemas>
      <summary>{t("promptCapture.tools", { count: tools.length })}</summary>
      {tools.map((tool, index) => <div key={index} className="prompt-capture-tool">{tool.function?.name ?? tool.name ?? "?"}</div>)}
    </details>}

    <details className="prompt-capture-section">
      <summary>{t("promptCapture.rawPayloadToggle")}</summary>
      <pre className="prompt-capture-raw">{JSON.stringify(detail.payload, null, 2)}</pre>
    </details>
  </div>;
}

function OutlineTree({ nodes, depth }: { readonly nodes: readonly OutlineNode[]; readonly depth: number }) {
  const { t } = useI18n();
  return <div className="turn-outline" data-depth={depth}>
    {nodes.map((node, index) => <details key={index} className="prompt-capture-section turn-outline-node" open={depth === 0}>
      <summary>
        <span>{node.title}</span>
        <span className="workspace-muted">{t("promptCapture.payloadChars", { chars: outlineChars(node).toLocaleString() })}</span>
      </summary>
      {node.lines.join("\n").trim().length > 0 && <pre className="prompt-capture-block-text">{stripTitle(node.lines.join("\n"))}</pre>}
      {node.subs.length > 0 && <OutlineTree nodes={node.subs} depth={depth + 1} />}
    </details>)}
  </div>;
}
