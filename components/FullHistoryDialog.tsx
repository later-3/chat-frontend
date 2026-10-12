import { Button } from "./ui/Button";
import { InterfaceFeedback } from "./InterfaceFeedback";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { SurfaceDialog } from "./SurfaceDialog";
import { RequestDetailViewPanel, TurnInteractions } from "./TurnInteractions";
import { MarkdownBody } from "./MarkdownBody";
import {
  fetchInteractionIndex,
  fetchRequestDetail,
  fetchSessionMessages,
  type InteractionGroupView,
  type InteractionIndexView,
  type InteractionRowView,
  type RequestDetailView,
  type SessionMessageView,
} from "@/lib/interactions";

type Props = { projectId: string; sessionId: string; onClose: () => void };

/**
 * 完整历史（B3-R 修复版，变体 A）= **会话内容（a/b 平级消息）+ 每侧挂交互 bar**：
 * 轮头（时间/方向/状态/统计，F4）→ a 气泡（右·发起方）+ 发起方 bar → b 回复卡（左·回复方）
 * → 回复侧 TurnInteractions（阶段→请求→区域，B4 复用同一组件，F3）。
 * 首屏只取轮分组摘要；展开任一轮时拉一次会话消息（turnId 优先、时间窗兜底匹配，单一容器缓存）；
 * Pi HTML 导出降为“下载”；滚动职责由 .full-history-turns 承担（F1）。
 */
export function FullHistoryDialog(props: Props) {
  return <FullHistoryContent key={JSON.stringify([props.projectId, props.sessionId])} {...props} />;
}

function FullHistoryContent({ projectId, sessionId, onClose }: Props) {
  const { t } = useI18n();
  const [index, setIndex] = useState<InteractionIndexView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // 发起方 bar 展开（02 §2.1：a 视角=同一请求详情，定位高亮"本轮输入"）
  const [initiatorOpen, setInitiatorOpen] = useState<string | null>(null);
  const [initiatorDetail, setInitiatorDetail] = useState<RequestDetailView | null>(null);
  useEffect(() => {
    if (initiatorDetail === null) return;
    // a 视角（02 §2.1）：定位到高亮的"本轮输入"
    const timer = window.setTimeout(() => {
      document.querySelector('[data-initiator-detail] .prompt-capture-block.is-focus')
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [initiatorDetail]);
  const loadInitiatorDetail = useCallback((requestId: string) => {
    setInitiatorDetail(null);
    void fetchRequestDetail(sessionId, projectId, requestId)
      .then(detail => setInitiatorDetail(detail))
      .catch(() => setInitiatorDetail(null));
  }, [sessionId, projectId]);
  const [messages, setMessages] = useState<readonly SessionMessageView[] | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const messagesInFlight = useRef(false);
  const exportUrl = `/api/sessions/${encodeURIComponent(sessionId)}/export?projectId=${encodeURIComponent(projectId)}`;

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void fetchInteractionIndex(sessionId, projectId, { limit: 50, signal: controller.signal })
      .then(value => { setIndex(value); })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, [sessionId, projectId, revision]);

  // 会话消息（a/b 层数据源）：第一次展开轮时拉取，进程内单一容器缓存（D4 同源）。
  const ensureMessages = useCallback(() => {
    if (messagesRef.current !== null || messagesInFlight.current) return;
    messagesInFlight.current = true;
    void fetchSessionMessages(sessionId, projectId)
      .then(value => setMessages(value))
      .catch(() => setMessages([])) // 拉取失败：轮仍可看执行树，a/b 显示未关联
      .finally(() => { messagesInFlight.current = false; });
  }, [sessionId, projectId]);

  const retry = useCallback(() => setRevision(value => value + 1), []);

  return <SurfaceDialog
    title={t("history.label")}
    description={t("interface.complete.history.and.branches.read.only.browsing.keeps.the.current.conversation.in.place")}
    onClose={onClose}
    actions={<>
      <a className="workspace-button" href={exportUrl} download>{t("promptCapture.downloadExport")}</a>
    </>}>
    {index !== null && <div className="turn-interactions-dialog-head" data-full-history-head>
      <span
        className={index.recording.enabled ? "prompt-capture-recording is-on" : "prompt-capture-recording"}
        data-recording-state={index.recording.enabled ? "on" : "off"}>
        {index.recording.enabled ? t("promptCapture.recordingOn") : t("promptCapture.recordingOff")}
      </span>
    </div>}
    {error !== null
      ? <div className="surface-empty surface-error" role="alert">
          <p><InterfaceFeedback message={error} /></p>
          <Button variant="secondary" className="workspace-button" onClick={retry}>{t("interface.retry")}</Button>
        </div>
      : index === null
        ? <div className="surface-empty" role="status">{t("history.loading")}</div>
        : index.groups.length === 0
          ? <div className="surface-empty" role="status">
              <p>{t("promptCapture.empty")}</p>
              <p className="workspace-muted">{index.recording.enabled ? t("promptCapture.emptyHint") : t("promptCapture.emptyHintOff")}</p>
            </div>
          : <div className="full-history-turns" data-full-history-turns>
              <p className="turn-turn-note">{t("promptCapture.turnModelNote")}</p>
              {index.groups.map((group, position) => <FullHistoryTurnRow
                key={`${group.key}-${position}`}
                group={group}
                position={position + 1}
                nextTimestamp={index.groups[position + 1]?.firstTimestamp}
                rows={index.rows.filter(row => (row.turn.workflowInvocationId ?? row.turn.turnKey ?? "系统调用") === group.key)}
                sessionId={sessionId}
                projectId={projectId}
                legacy={index.legacy}
                recordingOn={index.recording.enabled}
                messages={messages}
                onExpand={ensureMessages}
                expanded={expandedKey === `${group.key}-${position}`}
                initiatorOpenKey={initiatorOpen}
                onInitiatorToggle={(requestId) => {
                  if (initiatorOpen === requestId) { setInitiatorOpen(null); setInitiatorDetail(null); return; }
                  setInitiatorOpen(requestId);
                  loadInitiatorDetail(requestId);
                }}
                initiatorDetail={initiatorDetail}
                onToggle={() => {
                  ensureMessages();
                  setInitiatorOpen(null);
                  setInitiatorDetail(null);
                  setExpandedKey(current => current === `${group.key}-${position}` ? null : `${group.key}-${position}`);
                }}
              />)}
            </div>}
  </SurfaceDialog>;
}

/** 从消息 content 提取纯文本（过滤 toolCall/thinking 块，a/b 展示用）。 */
function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content === undefined || content === null ? "" : JSON.stringify(content);
  return content
    .filter((block): block is { type: "text"; text: string } =>
      typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text" && typeof (block as { text?: unknown }).text === "string")
    .map(block => block.text)
    .join("\n")
    .trim();
}

function matchExchange(group: InteractionGroupView, position: number, groups: readonly InteractionGroupView[], rows: readonly InteractionRowView[], messages: readonly SessionMessageView[]) {
  const byKey = messages.filter(message => message.turnId === group.key);
  const windowStart = position === 0 ? -Infinity : Date.parse(groups[position - 1]!.firstTimestamp);
  const windowEnd = group.key === "" ? Infinity : Date.parse(group.firstTimestamp);
  const inWindow = (message: SessionMessageView) => {
    const ts = message.timestamp ?? 0;
    return ts >= (Number.isNaN(windowStart) ? -Infinity : windowStart) && ts <= (Number.isNaN(windowEnd) ? Infinity : windowEnd) + 1;
  };
  const userMessages = byKey.filter(message => message.role === "user");
  const aCandidates = userMessages.length > 0 ? userMessages : messages.filter(message => message.role === "user" && inWindow(message));
  const assistantCandidates = (byKey.length > 0 ? byKey : messages.filter(inWindow)).filter(message => message.role === "assistant");
  // a = 本组发起方（turnId 命中优先；否则取窗口内最后一条 user——它紧邻本组首请求）
  const a = aCandidates.length === 0 ? null : (byKey.length > 0 ? aCandidates[0]! : aCandidates[aCandidates.length - 1]!);
  const bText = assistantCandidates.map(message => messageText(message.content)).filter(text => text.length > 0).join("\n\n");
  void rows;
  return { a, bText };
}

function FullHistoryTurnRow({ group, position, nextTimestamp, rows, sessionId, projectId, legacy, recordingOn, messages, onExpand, expanded, initiatorOpenKey, onInitiatorToggle, initiatorDetail, onToggle }: {
  readonly group: InteractionGroupView;
  readonly position: number;
  readonly nextTimestamp: string | undefined;
  readonly rows: readonly InteractionRowView[];
  readonly sessionId: string;
  readonly projectId: string;
  readonly legacy: boolean;
  readonly recordingOn: boolean;
  readonly messages: readonly SessionMessageView[] | null;
  readonly onExpand: () => void;
  readonly expanded: boolean;
  readonly initiatorOpenKey: string | null;
  readonly onInitiatorToggle: (requestId: string) => void;
  readonly initiatorDetail: RequestDetailView | null;
  readonly onToggle: () => void;
}) {
  const { t } = useI18n();
  const time = group.firstTimestamp ? new Date(group.firstTimestamp).toTimeString().slice(0, 5) : "";
  const firstRequest = rows.reduce<InteractionRowView | null>((oldest, row) =>
    oldest === null || row.timestamp < oldest.timestamp ? row : oldest, null);
  const firstChars = firstRequest?.regions.reduce((total, region) => total + region.chars, 0) ?? 0;
  const exchange = expanded && messages !== null ? matchExchange(group, position - 1, [group], rows, messages) : null;
  const agentLabel = group.agentLabel || "agent";
  const direction = exchange?.a !== null && exchange?.a !== undefined && exchange.a.role === "user"
    ? t("promptCapture.directionUserToAgent", { name: agentLabel })
    : t("promptCapture.directionAgentToUser", { name: agentLabel });

  return <section className="full-history-turn" data-turn-position={position}>
    {/* F4 轮头：轮次 · 时间 · 方向 · 状态 · 统计 */}
    <button className="full-history-turn-header" aria-expanded={expanded} data-full-history-turn-toggle onClick={onToggle}>
      {expanded ? <span aria-hidden="true">▾</span> : <span aria-hidden="true">▸</span>}
      <span className="full-history-turn-index">{t("promptCapture.turnN", { n: position })}</span>
      {time !== "" && <span className="turn-time">{time}</span>}
      <span className="turn-direction">{direction}</span>
      <span className={`turn-state ${group.state === "done" ? "is-done" : ""}`} data-turn-state={group.state}>
        {group.state === "done" ? t("promptCapture.turnDone") : t("promptCapture.turnRunning")}
      </span>
      {!recordingOn && <span className="workspace-muted">{t("promptCapture.recordingOffShort")}</span>}
      {legacy && <span className="turn-interactions-legacy" data-full-history-legacy title={t("promptCapture.legacyHint")}>{t("promptCapture.legacyBadge")}</span>}
      <span className="full-history-turn-stats">
        {t("promptCapture.turnRequests", { count: group.requestCount })}
        {" · "}
        <span className={group.failures > 0 ? "turn-interactions-failures" : undefined}>
          {t("promptCapture.turnFailures", { count: group.failures })}
        </span>
        {" · "}
        {group.tokenOut > 0 ? t("promptCapture.turnTokens", { count: group.tokenOut.toLocaleString() }) : t("promptCapture.tokensUnknown")}
      </span>
    </button>
    {expanded && <div className="full-history-turn-body">
      <div className="turn-exchange" data-turn-exchange>
        {messages === null
          ? <p className="workspace-muted" role="status">{t("history.loading")}</p>
          : exchange !== null && (exchange.a !== null || exchange.bText !== "") ? <>
              {/* a：发起方（右）+ 发起方 bar */}
              <div className="turn-side-a" data-side-a>
                {exchange.a !== null && messageText(exchange.a.content) !== "" && <div className="turn-bubble">
                  <span className="turn-role">{t("promptCapture.sideA")}</span>
                  {messageText(exchange.a.content)}
                </div>}
                {firstRequest !== undefined && firstRequest !== null && <button type="button"
                  className="initiator-bar" data-initiator-bar
                  aria-expanded={initiatorOpenKey === firstRequest.requestId}
                  onClick={() => onInitiatorToggle(firstRequest.requestId)}>
                  <span className="bar-name">{t("promptCapture.initiatorBar")}</span>
                  <span>{t("promptCapture.initiatorSummary", { chars: firstChars.toLocaleString() })}</span>
                  <span className="bar-outcome">{group.failures > 0
                    ? t("promptCapture.attemptsFailures", { count: group.failures })
                    : t("promptCapture.turnDone")}</span>
                  <span className="bar-chev" aria-hidden="true">{initiatorOpenKey === firstRequest.requestId ? "▾" : "▸"}</span>
                </button>}
              </div>
              {/* 发起方 bar 展开：同一请求详情、a 视角定位"本轮输入"（02 §2.1；占满全宽） */}
              {firstRequest !== undefined && firstRequest !== null && initiatorOpenKey === firstRequest.requestId && (
                initiatorDetail === null
                  ? <div className="initiator-detail" data-initiator-detail role="status">{t("promptCapture.loadingPayload")}</div>
                  : <div className="initiator-detail" data-initiator-detail data-view="initiator">
                      <RequestDetailViewPanel detail={initiatorDetail} row={firstRequest} filter="all" />
                    </div>
              )}
              {/* b：回复方（左）+ 回复侧交互树 */}
              <div className="turn-side-b" data-side-b>
                {exchange.bText !== "" && <div className="turn-reply-card">
                  <span className="turn-role">{t("promptCapture.sideBReply", { name: agentLabel })}</span>
                  <MarkdownBody>{exchange.bText}</MarkdownBody>
                </div>}
                {legacy && <p className="workspace-muted" data-legacy-no-outcome>{t("promptCapture.legacyHint")}</p>}
                <TurnInteractions key={group.key} sessionId={sessionId} projectId={projectId} turnKey={group.key} mode="full-history" />
              </div>
            </> : <>
              <p className="workspace-muted">{t("promptCapture.noMessages")}</p>
              <TurnInteractions key={group.key} sessionId={sessionId} projectId={projectId} turnKey={group.key} mode="full-history" />
            </>}
      </div>
    </div>}
  </section>;
}
