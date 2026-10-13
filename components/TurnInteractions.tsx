"use client";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { PromptCaptureBlock, contentText } from "./PromptCaptureTurnTree";
import { regionLabelKey } from "@/lib/prompt-captures";
import {
  EMPTY_CONTEXT_EDIT,
  fetchContextEdit,
  fetchInteractionTurnGroup,
  fetchRequestDetail,
  saveContextEdit,
  type ContextEditState,
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
    <button type="button" className="turn-summary-head" data-reply-bar aria-expanded={barOpen}
      onClick={() => setBarOpen(open => !open)}>
      <span className="turn-summary-number">{t("promptCapture.turnN", { n: 1 })}</span>
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
                <span className="prompt-capture-seq">{timeOf(row?.timestamp ?? "")}</span>
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
                {/* B5 边界（用户 2026-10-13）：完整历史 = 事后回看，只读；发送前的编辑入口在 composer 旁。 */}
                <RequestDetailViewPanel detail={entry.detail} row={row} request={request} filter={blockFilter}
                  sessionId={sessionId} projectId={projectId} editable={false} />
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

/** 发起方 bar（02 §2.1 a 视角）与请求组共用同一详情面板——同一条捕获记录、两个视图锚点。
 *  B3-R3：**按原始请求体自身的结构与顺序展示**（model → messages 逐条[system 内按自带 chat_* 标签块折叠] → tools 逐个），
 *  把抽象定义（区域标签/人话名/revision）作为标注叠上去——以实现为准，不按自创解析重排。 */
export function RequestDetailViewPanel({ detail, row, request, filter, sessionId, projectId, editable = false, onEditSaved }: {
  readonly detail: RequestDetailView;
  readonly row: InteractionRowView | undefined;
  readonly request?: InteractionRequestGroupView;
  readonly filter: BlockFilter;
  readonly sessionId?: string;
  readonly projectId?: string;
  /** 编辑保存成功后通知外层（发送前预览据此重新装配，让展示与"将发送"保持一致）。 */
  readonly onEditSaved?: () => void;
  /** B5：可编辑（勾选/恢复“发给模型的内容”）。默认 false = 只读展示。 */
  readonly editable?: boolean;
}) {
  const { t } = useI18n();
  const canEdit = editable && sessionId !== undefined && projectId !== undefined;
  const [contextEdit, setContextEdit] = useState<ContextEditState>(EMPTY_CONTEXT_EDIT);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  useEffect(() => {
    if (!canEdit) return;
    const controller = new AbortController();
    void fetchContextEdit(sessionId, projectId, controller.signal).then(setContextEdit).catch(() => undefined);
    return () => controller.abort();
  }, [canEdit, sessionId, projectId]);
  const excludedSet = new Set(contextEdit.excluded);
  const toggleBlock = (blockId: string) => {
    if (!canEdit || savingEdit) return;
    const nextExcluded = excludedSet.has(blockId)
      ? contextEdit.excluded.filter((id) => id !== blockId)
      : [...contextEdit.excluded, blockId];
    setContextEdit({ ...contextEdit, excluded: nextExcluded });
    setSavingEdit(true);
    setEditError(null);
    void saveContextEdit(sessionId, projectId, { excluded: nextExcluded, modified: contextEdit.modified, added: contextEdit.added })
      .then((saved) => { setContextEdit(saved); onEditSaved?.(); })
      .catch((cause) => {
        setEditError(cause instanceof Error ? cause.message : String(cause));
        void fetchContextEdit(sessionId, projectId).then(setContextEdit).catch(() => undefined);
      })
      .finally(() => setSavingEdit(false));
  };
  const payload = detail.payload ?? {};
  const messages = Array.isArray(payload.messages) ? (payload.messages as { role?: string; content?: unknown }[]) : [];
  const marks = detail.messageRegions;
  const tools = Array.isArray(payload.tools) ? (payload.tools as { name?: string; function?: { name?: string } }[]) : [];
  const excludedCount = row?.excluded.count ?? 0;

  // system（messages[0]）content 内按自带 <chat_*> 标签切块；标签外前缀 = Pi 基础人设/资源（无标签区）。
  const systemMessage = messages[0] !== undefined && messages[0]?.role === "system" ? messages[0] : undefined;
  const bodyMessages = systemMessage !== undefined ? messages.slice(1) : messages;
  const systemContent = systemMessage === undefined ? (typeof payload.system === "string" ? payload.system : null) : contentText(systemMessage.content);
  const systemBlocks = systemContent === null ? [] : splitChatTagBlocks(systemContent);
  // B5 编辑层：预览 payload 已由后端按同一过滤函数剔除，所以树里只剩下"将发送"的部分。
  // 被排除的块/子条目/工具由**编辑层本体**驱动"已排除"区（可恢复）——不依赖 payload 里是否还留着。
  const keptBlocks = systemBlocks;
  const excludedTagIds = contextEdit.excluded.filter((id) => id.startsWith("tag:") && !id.includes("#"));
  const excludedSubIds = contextEdit.excluded.filter((id) => id.startsWith("tag:") && id.includes("#"));
  const excludedToolNames = contextEdit.excluded.filter((id) => id.startsWith("tools:")).map((id) => id.slice("tools:".length));
  const excludedEntryIds = contextEdit.excluded.filter((id) => id.startsWith("entry:"));
  const sendChars = keptBlocks.reduce((total, block) => total + block.text.length, 0);

  const showSystem = filter === "all" || filter === "system";
  const showMessages = filter === "all" || filter === "history";
  const showTools = filter === "all" || filter === "tools";
  const rawModel = typeof payload.model === "string" ? payload.model : `${row?.model.provider ?? ""}/${row?.model.modelId ?? ""}`;

  return <div className="prompt-capture-detail" data-raw-request>
    <div className="request-meta" data-request-meta>
      <span><code>{rawModel}</code></span>
      <span>{row !== undefined && `${row.turn.stage.id} · ${row.turn.stage.nodeKind}`}</span>
      <span>{t("promptCapture.metaTools", { n: request?.toolCount ?? row?.toolCount ?? tools.length })}</span>
      <span>{t("promptCapture.metaMessages", { n: request?.messageCount ?? row?.messageCount ?? messages.length })}</span>
      <span>{t("promptCapture.metaExcluded", { n: excludedCount })}</span>
      <span><code>{request?.requestId ?? detail.row.requestId}</code></span>
      <span><code>{t("promptCapture.metaSha", { sha: detail.row.payload.sha256.slice(0, 8) })}</code></span>
    </div>

    {detail.outcome !== undefined && <div className="turn-interactions-outcome" data-outcome={detail.outcome.status}>
      <span>{t("promptCapture.outcome", { status: detail.outcome.status })}</span>
      {detail.outcome.errorMessage !== undefined && <span className="surface-error">{detail.outcome.errorMessage}</span>}
      {detail.outcome.durationMs !== undefined && <span className="workspace-muted">{t("promptCapture.durationMs", { ms: String(Math.round(detail.outcome.durationMs)) })}</span>}
      {detail.outcome.responseId !== undefined && <span className="workspace-muted">{detail.outcome.responseId}</span>}
    </div>}
    {detail.outcome === undefined && detail.legacy && <p className="workspace-muted" data-legacy-no-outcome>{t("promptCapture.noOutcome")}</p>}

    {showMessages && <div className="raw-messages" data-raw-messages>
      {systemMessage !== undefined && <div className="raw-message" data-role="system">
        <details className="prompt-capture-section" open>
          <summary>
            <span className="raw-role">{t("promptCapture.messageRow", { index: 0, role: "system" })}</span>
            <span className="workspace-muted">{t("promptCapture.payloadChars", { chars: (systemContent ?? "").length.toLocaleString() })}
              {" · "}{t("promptCapture.blocksCount", { n: systemBlocks.length })}</span>
            {canEdit && <span className="workspace-muted" data-context-edit-summary>
              {t("promptCapture.editSendSummary", { n: keptBlocks.length, chars: sendChars.toLocaleString() })}
            </span>}
            {savingEdit && <span className="workspace-muted">{t("promptCapture.editSaving")}</span>}
          </summary>
          {editError !== null && <p className="surface-error" role="alert" data-context-edit-error>
            {t("promptCapture.editSaveError", { message: editError })}
          </p>}
          <div className="raw-system-blocks" data-raw-system-blocks>
            {keptBlocks.map((block, index) => <SystemBlockRow key={index} block={block} excluded={false}
              canEdit={canEdit} excludedIds={excludedSet} onToggleBlock={toggleBlock} />)}
            {(excludedTagIds.length + excludedSubIds.length) > 0 && <details className="prompt-capture-section context-excluded-region" data-context-excluded open={false}>
              <summary><span className="raw-role">{t("promptCapture.editExcludedRegion", { n: excludedTagIds.length + excludedSubIds.length })}</span></summary>
              {excludedTagIds.map((id) => <details key={id} className="prompt-capture-section raw-tag-block is-excluded" data-excluded>
                <summary>
                  {canEdit && <input type="checkbox" data-context-edit-toggle={id} aria-label={t("promptCapture.editRestore")}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleBlock(id); }} />}
                  <span className="raw-tag">{`<${id.slice("tag:".length)}>`}</span>
                  <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>
                </summary>
              </details>)}
              {excludedSubIds.map((id) => <details key={id} className="prompt-capture-section raw-sub-entry is-excluded" data-excluded>
                <summary>
                  {canEdit && <input type="checkbox" data-context-edit-toggle={id} aria-label={t("promptCapture.editRestore")}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleBlock(id); }} />}
                  <span className="raw-role">{id.slice("tag:".length)}</span>
                  <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>
                </summary>
              </details>)}
            </details>}
          </div>
        </details>
      </div>}
      {bodyMessages.map((message, index) => {
        const mark = marks[index] ?? { index, role: message.role ?? "", region: "unclassified" };
        const text = contentText(message.content);
        // 用户 2026-10-13：历史消息（用户消息 / 助手回答 / 工具输出）也是历史信息，也要能勾选。
        // 每条消息带它所属的会话条目 id（预览接口提供）；当前正在输入的那条没有 entryId → 不可排除。
        const entryId = (message as { entryId?: string }).entryId;
        const messageBlockId = entryId === undefined ? null : `entry:${entryId}`;
        const messageExcluded = messageBlockId !== null && excludedSet.has(messageBlockId);
        return <div key={index} className={`raw-message${messageExcluded ? " is-excluded" : ""}`} data-role={message.role}
          data-region={mark.region} data-entry-id={entryId} data-excluded={messageExcluded || undefined}>
          <details className="prompt-capture-section">
            <summary>
              {canEdit && messageBlockId !== null && <input type="checkbox" data-context-edit-toggle={messageBlockId} checked={!messageExcluded}
                aria-label={t("promptCapture.editExclude")}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleBlock(messageBlockId); }} />}
              <span className="raw-role">{t("promptCapture.messageRow", { index: index + 1, role: message.role ?? "" })}</span>
              {mark.region === "current-user-message" && <span className="prompt-capture-success">{t("promptCapture.seqCurrentInput")}</span>}
              {messageExcluded && <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>}
              <span className="workspace-muted">{t(regionLabelKey(mark.region))}{mark.customType !== undefined ? ` · ${mark.customType}` : ""}
                {" · "}{t("promptCapture.payloadChars", { chars: text.length.toLocaleString() })}</span>
            </summary>
            <pre className={`prompt-capture-block-text${message.role === "tool" ? " is-mono" : ""}`}>{text}</pre>
          </details>
        </div>;
      })}
      {excludedEntryIds.length > 0 && <details className="prompt-capture-section context-excluded-region" data-context-excluded open={false}>
        <summary><span className="raw-role">{t("promptCapture.editExcludedMessages", { n: excludedEntryIds.length })}</span></summary>
        {excludedEntryIds.map((id) => <details key={id} className="prompt-capture-section raw-message is-excluded" data-excluded>
          <summary>
            {canEdit && <input type="checkbox" data-context-edit-toggle={id} aria-label={t("promptCapture.editRestore")}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleBlock(id); }} />}
            <span className="raw-role">{id.slice("entry:".length)}</span>
            <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>
          </summary>
        </details>)}
      </details>}
    </div>}

    {showTools && (tools.length > 0 || excludedToolNames.length > 0) && <details className="prompt-capture-section" data-tool-schemas open={false}>
      <summary>{t("promptCapture.tools", { count: tools.length })}{excludedToolNames.length > 0 ? ` · ${t("promptCapture.editExcludedRegion", { n: excludedToolNames.length })}` : ""}</summary>
      {excludedToolNames.map((name) => <details key={name} className="prompt-capture-section raw-tool is-excluded" data-excluded>
        <summary>
          {canEdit && <input type="checkbox" data-context-edit-toggle={`tools:${name}`} aria-label={t("promptCapture.editRestore")}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleBlock(`tools:${name}`); }} />}
          <span className="raw-role">{name}</span>
          <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>
        </summary>
      </details>)}
      {tools.map((tool, index) => {
        const name = tool.function?.name ?? tool.name ?? "?";
        const toolExcluded = excludedSet.has(`tools:${name}`);
        return <details key={index} className={`prompt-capture-section raw-tool${toolExcluded ? " is-excluded" : ""}`}
          data-excluded={toolExcluded || undefined}>
          <summary>
            {canEdit && <input type="checkbox" data-context-edit-toggle={`tools:${name}`} checked={!toolExcluded}
              aria-label={t("promptCapture.editExclude")}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleBlock(`tools:${name}`); }} />}
            <span className="raw-role">{name}</span>
            {toolExcluded && <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>}
          </summary>
          <pre className="prompt-capture-block-text is-mono">{JSON.stringify(tool, null, 2)}</pre>
        </details>;
      })}
    </details>}

    <details className="prompt-capture-section">
      <summary>{t("promptCapture.rawPayloadToggle")}</summary>
      <pre className="prompt-capture-raw">{JSON.stringify(detail.payload, null, 2)}</pre>
    </details>
  </div>;
}

function SystemBlockRow({ block, excluded, canEdit, excludedIds, onToggleBlock }: {
  readonly block: ChatTagBlock;
  readonly excluded: boolean;
  readonly canEdit: boolean;
  readonly excludedIds: ReadonlySet<string>;
  readonly onToggleBlock: (blockId: string) => void;
}) {
  const { t } = useI18n();
  const blockId = `tag:${block.tag}`;
  // 用户 2026-10-13：区块要能展开看**条目与内容**，条目可单独勾选（规则与后端 splitSubEntries 一致）。
  const subEntries = block.tag === "" ? [] : splitBlockSubEntries(block.tag, block.text);
  const keptSubs = subEntries.filter((entry) => !excludedIds.has(`${blockId}#${entry.id}`));
  return <details className={`prompt-capture-section raw-tag-block${excluded ? " is-excluded" : ""}`}
    data-tag={block.tag} data-excluded={excluded || undefined} open={false}>
    <summary>
      {canEdit && block.tag !== "" && <input type="checkbox" data-context-edit-toggle={blockId} checked={!excluded}
        aria-label={t("promptCapture.editExclude")}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleBlock(blockId); }} />}
      <span className="raw-tag">{block.tag === "" ? t("promptCapture.piBaseBlock") : `<${block.tag}>`}</span>
      {block.attributes !== "" && <span className="raw-attrs" title={block.attributes}>{block.attributes}</span>}
      {subEntries.length > 0 && <span className="workspace-muted" data-sub-entries-count>
        {t("promptCapture.subEntriesCount", { kept: keptSubs.length, total: subEntries.length })}
      </span>}
      {excluded && <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>}
      <span className="workspace-muted">{t("promptCapture.payloadChars", { chars: block.text.length.toLocaleString() })}</span>
    </summary>
    {subEntries.length === 0
      ? <pre className="prompt-capture-block-text">{block.text}</pre>
      : <div className="raw-sub-entries">
          {subEntries.map((entry) => {
            const subId = `${blockId}#${entry.id}`;
            const subExcluded = excludedIds.has(subId);
            return <details key={entry.id} className={`prompt-capture-section raw-sub-entry${subExcluded ? " is-excluded" : ""}`}
              data-sub-entry={entry.id} data-excluded={subExcluded || undefined} open={false}>
              <summary>
                {canEdit && <input type="checkbox" data-context-edit-toggle={subId} checked={!subExcluded}
                  aria-label={subExcluded ? t("promptCapture.editRestore") : t("promptCapture.editExclude")}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleBlock(subId); }} />}
                <span className="raw-role">{entry.title}</span>
                {subExcluded && <span className="workspace-muted" data-excluded-badge>{t("promptCapture.editExcludedBadge")}</span>}
                <span className="workspace-muted">{t("promptCapture.payloadChars", { chars: entry.text.length.toLocaleString() })}</span>
              </summary>
              <pre className="prompt-capture-block-text">{entry.text}</pre>
            </details>;
          })}
        </div>}
  </details>;
}

/** 块内子条目（镜像后端 `src/context-edit.ts` 的 `splitSubEntries`：同一规则，两端一致）。 */
export interface ChatSubEntry {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}
const HARNESS_SUB_ENTRY = /^##\s+(纯规则|通用规范|通用资产|本项目专属规范)\s*·\s*(\S.*)$/;
const SECTION_SUB_ENTRY = /^##\s+(\S.*)$/;

function normalizeSubId(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/#/g, "_");
}

export function splitBlockSubEntries(tag: string, text: string): readonly ChatSubEntry[] {
  const pattern = tag === "chat_interaction_harness" ? HARNESS_SUB_ENTRY : SECTION_SUB_ENTRY;
  const lines = text.split("\n");
  const entries: ChatSubEntry[] = [];
  let current: { id: string; title: string; lines: string[] } | null = null;
  const push = () => {
    if (current === null) return;
    const body = current.lines.slice(1).join("\n").replace(/^\n+/, "");
    entries.push({ id: current.id, title: current.title, text: body });
    current = null;
  };
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match !== null) {
      push();
      const isHarness = tag === "chat_interaction_harness";
      const raw = (isHarness ? match[2] : match[1]) as string;
      current = { id: normalizeSubId(raw), title: raw.trim(), lines: [line] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  push();
  return entries;
}

/** system 内容按自带 <chat_*> 标签切块（原始结构还原）；标签外的前缀 = Pi 基础区（tag 为空串）。 */
export interface ChatTagBlock {
  readonly tag: string;
  readonly attributes: string;
  readonly text: string;
}
export function splitChatTagBlocks(systemContent: string): readonly ChatTagBlock[] {
  const blocks: ChatTagBlock[] = [];
  const first = /<([a-z_][a-z0-9_]*)([^>]*)>/.exec(systemContent);
  const headText = first === null ? systemContent : systemContent.slice(0, first.index);
  if (headText.trim().length > 0) blocks.push({ tag: "", attributes: "", text: headText });
  const pattern = /<([a-z_][a-z0-9_]*)([^>]*)>/g;
  let cursor = first === null ? systemContent.length : first.index;
  pattern.lastIndex = cursor;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(systemContent)) !== null) {
    const tag = match[1]!;
    if (!tag.startsWith("chat_")) continue;
    const attributes = match[2]!.trim();
    const closeTag = `</${tag}>`;
    const contentStart = match.index + match[0].length;
    const contentEnd = systemContent.indexOf(closeTag, contentStart);
    const text = contentEnd === -1 ? systemContent.slice(contentStart) : systemContent.slice(contentStart, contentEnd);
    blocks.push({ tag, attributes, text });
    cursor = contentEnd === -1 ? systemContent.length : contentEnd + closeTag.length;
    pattern.lastIndex = cursor;
  }
  return blocks;
}
