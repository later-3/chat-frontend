"use client";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Hint } from "./ui/Tooltip";
import {
  PromptCaptureBlock,
  REGION_FILTER_KEYS,
  contentText,
  isRegionFilter,
  type RegionFilter,
} from "./PromptCaptureTurnTree";
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
 * 轮次交互树（B3 · U7，`TurnInteractions`）：摘要条与完整历史共用的同一组件（概念 full-history
 * 执行树：轮 → 阶段 → 请求组 → 区域树）。聚合数字（attempts/failures/tokenOut）全部来自后端
 * 读模型（02 T9）；prompt 树的大纲切分是前端渲染格式化（G1 D1）。detail 缓存单一容器 +
 * 按需拉取 + LRU12（G1 D4）。mode 契约定形：B3 用 full-history，B4 复用加 turn-summary（sticky 归 B4）。
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

interface OutlineNode {
  readonly level: number;
  readonly title: string;
  readonly lines: string[];
  readonly subs: OutlineNode[];
}

/** D1：大纲切分是渲染格式化（移植自原型 parseOutline/prototype.html:601）。 */
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

export function TurnInteractions({ sessionId, projectId, turnKey, mode, defaultExpanded = true }: TurnInteractionsProps) {
  const { t } = useI18n();
  const [group, setGroup] = useState<InteractionTurnGroupView | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [details, setDetails] = useState<ReadonlyMap<string, DetailEntry>>(() => new Map());
  const [expandedRequests, setExpandedRequests] = useState<ReadonlySet<string>>(() => new Set());
  const [filters, setFilters] = useState<ReadonlySet<RegionFilter>>(() => new Set(REGION_FILTER_KEYS));
  const [rawPayload, setRawPayload] = useState(false);
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
      if (next.has(requestId)) next.delete(requestId);
      else { next.add(requestId); }
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
    let bucket = stageOrder.find(candidate => candidate.id === stage.id);
    if (bucket === undefined) { bucket = { id: stage.id, nodeKind: stage.nodeKind, requests: [] }; stageOrder.push(bucket); }
    bucket.requests.push(request);
  }

  return <div className="turn-interactions" data-turn-interactions={turnKey} data-mode={mode}>
    <div className="turn-interactions-head" data-turn-summary>
      <span>{t("promptCapture.turnRequests", { count: group.summary.requestCount })}</span>
      <span>{t("promptCapture.turnAttempts", { count: group.summary.attempts })}</span>
      <span className={group.summary.failures > 0 ? "turn-interactions-failures" : undefined}>
        {t("promptCapture.turnFailures", { count: group.summary.failures })}
      </span>
      <span>{t("promptCapture.turnTokens", { count: group.summary.tokenOut.toLocaleString() })}</span>
      {group.legacy && <span className="turn-interactions-legacy" title={t("promptCapture.legacyHint")}>{t("promptCapture.legacyBadge")}</span>}
      <details className="turn-interactions-filter" data-region-filter>
        <summary className="workspace-muted">{t("promptCapture.filters")}（{filters.size}/{REGION_FILTER_KEYS.length}）</summary>
        <div className="prompt-capture-filters">
          {REGION_FILTER_KEYS.map(region => (
            <label key={region} className={filters.has(region) ? "prompt-capture-filter is-active" : "prompt-capture-filter"}>
              <input type="checkbox" checked={filters.has(region)} onChange={event => {
                const next = new Set(filters);
                if (event.target.checked) next.add(region);
                else if (next.size > 1) next.delete(region);
                setFilters(next);
              }} />
              {t(regionLabelKey(region))}
            </label>
          ))}
        </div>
      </details>
    </div>

    {stageOrder.map(stage => <section key={stage.id} className="turn-interactions-stage" data-stage-id={stage.id}>
      {stageOrder.length > 1 && <h4 className="turn-interactions-stage-title">{stage.id} <span className="workspace-muted">· {stage.nodeKind}</span></h4>}
      {stage.requests.map((request, index) => {
        const row = rowByRequestId.get(request.requestId);
        const expanded = expandedRequests.has(request.requestId) && defaultExpanded;
        const entry = details.get(request.requestId);
        return <section key={request.requestId} className="ui-card prompt-capture-record" data-prompt-capture-record={request.requestId}>
          <button className="prompt-capture-record-header" aria-expanded={expanded} data-prompt-capture-row-toggle
            onClick={() => toggleRequest(request.requestId)}>
            {expanded ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
            <span className="prompt-capture-seq">{t("promptCapture.requestN", { n: index + 1 })}</span>
            {request.attempts > 1 && <span className="prompt-capture-attempts">{t("promptCapture.attemptsX", { count: request.attempts })}</span>}
            {request.failures > 0 && <span className="prompt-capture-failures">{t("promptCapture.attemptsFailures", { count: request.failures })}</span>}
            <span className="prompt-capture-model">{row?.model.provider}/{row?.model.modelId}</span>
            <span className="prompt-capture-meta">{t("promptCapture.payloadChars", { chars: request.regions.reduce((total, region) => total + region.chars, 0).toLocaleString() })}</span>
            {request.regions.length > 0 && <span className="prompt-capture-sections-legend">
              {request.regions.map(region => <span key={region.id} className="prompt-capture-section-chip">{region.id} · {region.chars.toLocaleString()}</span>)}
            </span>}
          </button>
          {expanded && entry === undefined && <p className="workspace-muted" role="status">{t("promptCapture.loadingPayload")}</p>}
          {expanded && entry !== null && entry !== undefined && entry.error !== null && <p className="surface-error" role="alert">{entry.error}</p>}
          {expanded && entry !== null && entry !== undefined && entry.error === null && entry.detail !== null &&
            <RequestDetailViewPanel detail={entry.detail} filters={filters} rawPayload={rawPayload} onRawToggle={() => setRawPayload(value => !value)} requestId={request.requestId} />}
        </section>;
      })}
    </section>)}
    {group.requests.length === 0 && <p className="workspace-muted" role="status">{t("promptCapture.empty")}</p>}
  </div>;
}

function RequestDetailViewPanel({ detail, filters, rawPayload, onRawToggle, requestId }: {
  readonly detail: RequestDetailView;
  readonly filters: ReadonlySet<RegionFilter>;
  readonly rawPayload: boolean;
  readonly onRawToggle: () => void;
  readonly requestId: string;
}) {
  const { t } = useI18n();
  if (detail.payload === null && !detail.legacy) {
    // 完整记录关闭的轮次：区域摘要在行上可见，原文按契约不存在——如实说明（不伪造空树）。
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
    .filter(item => !isRegionFilter(item.mark.region) || filters.has(item.mark.region as RegionFilter));
  const outline = systemContent === null ? null : parseOutline(systemContent);
  const tools = Array.isArray(payload.tools) ? (payload.tools as { name?: string; function?: { name?: string } }[]) : [];

  return <div className="prompt-capture-detail">
    {detail.outcome !== undefined && <div className="turn-interactions-outcome" data-outcome={detail.outcome.status}>
      <span>{t("promptCapture.outcome", { status: detail.outcome.status })}</span>
      {detail.outcome.errorMessage !== undefined && <span className="surface-error">{detail.outcome.errorMessage}</span>}
      {detail.outcome.durationMs !== undefined && <span className="workspace-muted">{t("promptCapture.durationMs", { ms: String(Math.round(detail.outcome.durationMs)) })}</span>}
      {detail.outcome.responseId !== undefined && <span className="workspace-muted">{detail.outcome.responseId}</span>}
    </div>}
    {detail.outcome === undefined && detail.legacy && <p className="workspace-muted" data-legacy-no-outcome>{t("promptCapture.noOutcome")}</p>}

    {systemContent !== null && outline !== null && <details className="prompt-capture-section" data-prompt-capture-system>
      <summary>{t("promptCapture.systemPrompt", { chars: systemContent.length.toLocaleString() })}</summary>
      {outline.subs.length > 0 && <div className="prompt-capture-sections-legend">
        {outline.subs.map((section, index) => <span key={index} className="prompt-capture-section-chip">{section.title} · {outlineChars(section).toLocaleString()}</span>)}
      </div>}
      <OutlineTree nodes={outline.subs} depth={0} />
    </details>}

    <div className="prompt-capture-messages">
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
    </div>

    {tools.length > 0 && <details className="prompt-capture-section">
      <summary>{t("promptCapture.tools", { count: tools.length })}</summary>
      {tools.map((tool, index) => <div key={index} className="prompt-capture-tool">{tool.function?.name ?? tool.name ?? "?"}</div>)}
    </details>}

    <details className="prompt-capture-section">
      <summary>{t("promptCapture.rawPayloadToggle")}</summary>
      <pre className="prompt-capture-raw" data-request-id={requestId}>{rawPayload ? JSON.stringify(detail.payload, null, 2) : ""}</pre>
      {!rawPayload && <button type="button" className="workspace-button" onClick={onRawToggle}>{t("promptCapture.showRaw")}</button>}
    </details>
  </div>;
}

/** D1：系统提示两层大纲（区域 → 组成项）；顶层默认展开、组成项折叠（E8 父折叠整棵）。 */
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

export { Hint as _Hint };
