"use client";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  PromptCaptureBlock,
  contentText,
  type RegionFilter,
} from "./PromptCaptureTurnTree";
import { regionLabelKey } from "@/lib/prompt-captures";
import {
  fetchInteractionTurnGroup,
  fetchRequestDetail,
  type InteractionRequestGroupView,
  type InteractionRowView,
  type InteractionStageSummaryView,
  type InteractionTurnGroupView,
  type RequestDetailView,
} from "@/lib/interactions";

/**
 * 轮次交互树（B3-R 修复版）：轮 → 阶段（带统计头）→ 请求组（×N 聚合）→ 详情
 * （元信息行 / 逐次尝试列表 / 区域条形图 / 系统提示大纲 / 消息序列 / 工具清单）。
 *
 * 规范出处（B3-fix §1.B）：阶段头与逐次尝试=原型 r1-s2 与设计记录字段清单（F5/F7）；
 * 条形图+人话名=原型"带字符数条形的分组列表"+F-09 禁裸 tag（F6）；4 pills=原型过滤形态（F8）；
 * 聚合数字全部来自后端（02 T9），前端只渲染；mode 契约定形（full-history / turn-summary）。
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

/** 区块级过滤（F8：原型 4 pills——全部 / 规范与上下文 / 历史消息 / 工具）。 */
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

/** D1：大纲切分是渲染格式化（移植原型 parseOutline）。 */
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
  const detailsRef = useRef(details);
  detailsRef.current = details;

  useEffect(() => {
    const controller = new AbortController();
    setGroup(null);
    setGroupError(null);
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
  for (const request of group.requests) {
    const stage = stageOf(request);
    let bucket = stageOrder.find(candidate => candidate.id === stage.id && candidate.nodeKind === stage.nodeKind);
    if (bucket === undefined) { bucket = { id: stage.id, nodeKind: stage.nodeKind, requests: [] }; stageOrder.push(bucket); }
    bucket.requests.push(request);
  }
  const tokensKnown = !(group.legacy && group.summary.tokenOut === 0);

  return <div className="turn-interactions" data-turn-interactions={turnKey} data-mode={mode}>
    <div className="turn-interactions-head" data-turn-summary>
      <span>{t("promptCapture.turnRequests", { count: group.summary.requestCount })}</span>
      <span>{t("promptCapture.turnAttempts", { count: group.summary.attempts })}</span>
      <span className={group.summary.failures > 0 ? "turn-interactions-failures" : undefined}>
        {t("promptCapture.turnFailures", { count: group.summary.failures })}
      </span>
      <span>{tokensKnown
        ? t("promptCapture.turnTokens", { count: group.summary.tokenOut.toLocaleString() })
        : t("promptCapture.tokensUnknown")}</span>
      {group.legacy && <span className="turn-interactions-legacy" title={t("promptCapture.legacyHint")}>{t("promptCapture.legacyBadge")}</span>}
      {/* F8：原型 4 pills，区块级单选过滤 */}
      <div className="region-pills" role="tablist" aria-label={t("promptCapture.filters")} data-block-filter>
        {BLOCK_FILTERS.map(filter => (
          <button key={filter} type="button" role="tab" aria-selected={blockFilter === filter}
            className={blockFilter === filter ? "region-pill is-active" : "region-pill"}
            onClick={() => setBlockFilter(filter)}>
            {t(BLOCK_LABEL_KEY[filter])}
          </button>
        ))}
      </div>
    </div>

    {stageOrder.map(stage => {
      const stageSummary = group.stages.find(candidate => candidate.id === stage.id && candidate.nodeKind === stage.nodeKind)
        ?? { id: stage.id, nodeKind: stage.nodeKind, requestCount: stage.requests.length, attempts: 0, failures: 0 };
      return <section key={`${stage.id}::${stage.nodeKind}`} className="turn-interactions-stage" data-stage-id={stage.id}>
        {/* F7：阶段头（带底色 + 后端统计） */}
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
          return <section key={request.requestId} className="ui-card prompt-capture-record" data-prompt-capture-record={request.requestId}>
            <button className="prompt-capture-record-header" aria-expanded={expanded} data-prompt-capture-row-toggle
              onClick={() => toggleRequest(request.requestId)}>
              {expanded ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
              <span className="prompt-capture-seq">{t("promptCapture.requestN", { n: index + 1 })}</span>
              {request.attempts > 1 && <span className="prompt-capture-attempts">{t("promptCapture.attemptsX", { count: request.attempts })}</span>}
              {request.failures > 0 && <span className="prompt-capture-failures">{t("promptCapture.attemptsFailures", { count: request.failures })}</span>}
              <span className="prompt-capture-model">{row?.model.provider}/{row?.model.modelId}</span>
              <span className="prompt-capture-meta">
                {t("promptCapture.payloadChars", { chars: request.regions.reduce((total, region) => total + region.chars, 0).toLocaleString() })}
                {row !== undefined && ` · ${timeOf(row.timestamp)}`}
              </span>
            </button>
            {expanded && entry === undefined && <p className="workspace-muted" role="status">{t("promptCapture.loadingPayload")}</p>}
            {expanded && entry !== null && entry !== undefined && entry.error !== null && <p className="surface-error" role="alert">{entry.error}</p>}
            {expanded && entry !== null && entry !== undefined && entry.error === null && entry.detail !== null && <div className="prompt-capture-detail">
              {/* F5：逐次尝试列表（数据=后端归组的 attempt 链行，各自 outcome） */}
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
              <RequestDetailViewPanel detail={entry.detail} row={row} request={request} filter={blockFilter} />
            </div>}
          </section>;
        })}
      </section>;
    })}
    {group.requests.length === 0 && <p className="workspace-muted" role="status">{t("promptCapture.empty")}</p>}
  </div>;
}

function RequestDetailViewPanel({ detail, row, request, filter }: {
  readonly detail: RequestDetailView;
  readonly row: InteractionRowView | undefined;
  readonly request: InteractionRequestGroupView;
  readonly filter: BlockFilter;
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
  const visible = body
    .map((message, index) => ({ message, index, mark: marks[index] ?? { index, role: message.role ?? "", region: "unclassified" } }))
    .filter(item => item.mark.region !== "history-user" || filter === "all" || filter === "history");
  const outline = systemContent === null ? null : parseOutline(systemContent);
  const tools = Array.isArray(payload.tools) ? (payload.tools as { name?: string; function?: { name?: string } }[]) : [];
  const excludedCount = row?.excluded.count ?? 0;
  const maxRegionChars = Math.max(1, ...detailRowRegions(row ?? detail.row).map(region => region.chars));

  return <div className="prompt-capture-detail">
    {/* F5：元信息行（E1 四问"怎么来的"、E5 三件套） */}
    <div className="request-meta" data-request-meta>
      <span><code>{row?.model.provider}/{row?.model.modelId}</code></span>
      <span>{row !== undefined && `${row.turn.stage.id} · ${row.turn.stage.nodeKind}`}</span>
      <span>{t("promptCapture.metaTools", { n: request.toolCount })}</span>
      <span>{t("promptCapture.metaMessages", { n: request.messageCount })}</span>
      <span>{t("promptCapture.metaExcluded", { n: excludedCount })}</span>
      <span><code>{request.requestId}</code></span>
      <span><code>{t("promptCapture.metaSha", { sha: detail.row.payload.sha256.slice(0, 8) })}</code></span>
    </div>

    {detail.outcome !== undefined && <div className="turn-interactions-outcome" data-outcome={detail.outcome.status}>
      <span>{t("promptCapture.outcome", { status: detail.outcome.status })}</span>
      {detail.outcome.errorMessage !== undefined && <span className="surface-error">{detail.outcome.errorMessage}</span>}
      {detail.outcome.durationMs !== undefined && <span className="workspace-muted">{t("promptCapture.durationMs", { ms: String(Math.round(detail.outcome.durationMs)) })}</span>}
      {detail.outcome.responseId !== undefined && <span className="workspace-muted">{detail.outcome.responseId}</span>}
    </div>}
    {detail.outcome === undefined && detail.legacy && <p className="workspace-muted" data-legacy-no-outcome>{t("promptCapture.noOutcome")}</p>}

    {/* F6：区域条形图（人话名 + 字符数进度条）——替代 chips 平铺；区块过滤 system/history/tools */}
    {detailRowRegions(detail.row).length > 0 && (filter === "all" || filter === "system") &&
      <div className="region-bars" data-region-bars>
        {detailRowRegions(detail.row).map(region => (
          <div key={region.id} className="region-bar-row">
            <span className="region-name" title={region.id}>{region.label ?? region.id}</span>
            <span className="region-track"><span className="region-fill" style={{ width: `${Math.max(4, Math.round(region.chars / maxRegionChars * 100))}%` }} /></span>
            <span className="region-chars">{region.chars.toLocaleString()}</span>
          </div>
        ))}
      </div>}

    {systemContent !== null && outline !== null && (filter === "all" || filter === "system") &&
      <details className="prompt-capture-section" data-prompt-capture-system>
        <summary>{t("promptCapture.systemPrompt", { chars: systemContent.length.toLocaleString() })}</summary>
        <OutlineTree nodes={outline.subs} depth={0} />
      </details>}

    {(filter === "all" || filter === "history") && <div className="prompt-capture-messages" data-message-seq>
      {visible.map(item => item.mark.region === "history-user"
        ? <details key={item.index} className="prompt-capture-section prompt-capture-history">
            <summary>{t(regionLabelKey(item.mark.region))} · {t("promptCapture.payloadChars", { chars: contentText(item.message.content).length.toLocaleString() })}</summary>
            <PromptCaptureBlock label={t(regionLabelKey(item.mark.region)) + (item.message.role === undefined ? "" : ` · ${item.message.role}`)}
              text={contentText(item.message.content)} mono={item.message.role === "tool"} />
          </details>
        : <PromptCaptureBlock key={item.index}
            label={t(regionLabelKey(item.mark.region)) + (item.mark.customType !== undefined ? ` · ${item.mark.customType}` : item.message.role === undefined ? "" : ` · ${item.message.role}`)}
            text={contentText(item.message.content)}
            mono={item.message.role === "tool"}
            focus={item.mark.region === "current-user-message"} />)}
    </div>}

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

function detailRowRegions(row: InteractionRowView): readonly { readonly id: string; readonly chars: number; readonly label?: string }[] {
  return row.regions;
}

/** D1：系统提示两层大纲；顶层默认展开、组成项折叠（E8 父折叠整棵）。 */
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
