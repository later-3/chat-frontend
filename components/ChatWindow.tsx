"use client";
import { composerDraftKey } from "@/lib/composer-context";
import { registerAbortHandler } from "@/hooks/useKeyboardShortcuts";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentMessage, AssistantContentBlock, AssistantMessage, BashExecutionMessage, BlockingExtensionUiRequest, CustomMessage, ExtensionUiRequest, SessionInfo, SessionTreeNode, ToolResultMessage, UserMessage } from "@/lib/types";
import { normalizeCustomPanelLines, parseAnsiLine } from "@/lib/ansi";
import { asBracketedPaste, toTerminalKeyData } from "@/lib/terminal-input";
import { getAssistantErrorMessage, getDisplayableAssistantBlocks, splitFinalAssistantBlocks } from "@/lib/message-display";
import { extractTurnWrittenFiles, type WrittenFile } from "@/lib/turn-written-files";
import { summarizeTurn } from "@/lib/turn-summary";
import { TurnSummary } from "./TurnSummary";
import { RunStatus, ToolActivityContext } from "./RunStatus";
import { MessageView } from "./MessageView";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatMinimap, useMessageRefs } from "./ChatMinimap";
import { ExtensionStatusBar } from "./ExtensionStatusBar";
import { useI18n } from "@/hooks/useI18n";
import { useAgentSession, type NoticeItem } from "@/hooks/useAgentSession";
import { useDragDrop } from "@/hooks/useDragDrop";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import type { SessionStatsInfo } from "@/lib/pi-types";
import type { PlanReview } from "@/lib/chat-workflow-events";
import type { PlanReviewDecisionInput } from "@/lib/chat-workflow-browser";
import { MarkdownBody } from "./MarkdownBody";
import {
  captureScrollDistance,
  getNextVisibleCount,
  getVisibleRenderWindow,
  restoreScrollTop,
  VISIBLE_PAGE_SIZE,
} from "@/lib/chat-lazy-load";

import { observeChatAutoScroll } from "@/lib/chat-auto-scroll";

interface Props {
  projectId: string;
  /** 顶栏上下文项目（B1）：只注入 Long Agent 提示词，不改变会话归属。 */
  deviceId?: string;
  contextProjectId?: string | null;
  /** Per-Friend collaboration-project association revision (LA6 A). */
  interactionRevision?: number;
  /** Non-null when a new Friend private turn must be refused (association loading/unavailable). */
  contextBlockedReason?: string | null;
  session: SessionInfo | null;
  sessionRunning?: boolean;
  newSessionCwd: string | null;
  newSessionDraftKey: string | null;
  onAgentEnd?: () => void;
  onAttentionNeeded?: (request: BlockingExtensionUiRequest) => void;
  onSessionCreated?: (session: SessionInfo, sourceDraftKey: string) => void;
  onSessionOpen?: (sessionId: string) => void | Promise<void>;
  onSessionForked?: (newSessionId: string) => void;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSystemPromptLoaderChange?: (loader: (() => Promise<void>) | null) => void;
  onSessionStatsChange?: (stats: SessionStatsInfo | null) => void;
  onSessionStatsPanelOpen?: () => void;
  onContextUsageChange?: (usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => void;
  onOpenFile?: (filePath: string) => void;
  onConnectionFailure?: () => Promise<boolean | null>;
  /** Completion sound state + controls, owned by AppShell so tasks finishing in
   *  a non-active workspace can still ring. */
  soundEnabled?: boolean;
  onSoundToggle?: () => void;
  playDoneSound?: () => void;
  unlockAudio?: () => void;
}

const CHAT_MINIMAP_WIDTH = 36;
const CHAT_COLUMN_PADDING = 16;

function hasFinalAssistantAnswer(message: AgentMessage): boolean {
  if (message.role !== "assistant") return false;
  return splitFinalAssistantBlocks(message as AssistantMessage).answerBlocks.some((block) => (
    block.type === "image" || (block.type === "text" && block.text.trim().length > 0)
  ));
}

function findFinalAssistantIndex(messages: AgentMessage[], userIdx: number, endIdx: number): number {
  for (let candidateIdx = endIdx - 1; candidateIdx > userIdx; candidateIdx--) {
    if (hasFinalAssistantAnswer(messages[candidateIdx])) return candidateIdx;
  }
  for (let candidateIdx = endIdx - 1; candidateIdx > userIdx; candidateIdx--) {
    if (messages[candidateIdx]?.role === "assistant") return candidateIdx;
  }
  return -1;
}

function getUserInputText(message: AgentMessage): string | null {
  if (message.role !== "user") return null;
  if (typeof message.content === "string") {
    const text = message.content.trim();
    return text.length > 0 ? text : null;
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

function hasDisplayableProcessMessage(message: AgentMessage): boolean {
  if (message.role === "assistant") {
    return getDisplayableAssistantBlocks(message as AssistantMessage).length > 0;
  }
  return message.role === "custom";
}

// A user message normally anchors a turn (user prompt → process → final
// answer), and the process messages in between get folded into a collapsed
// TurnSummary. When compaction fires mid-turn, pi drops the original
// user prompt and inserts a compaction summary (role "custom", customType
// "compaction") in its place; the agent then keeps producing tool calls and a
// final answer with no user message left to anchor them. Treat a compaction
// summary as an anchor too, otherwise every post-compaction message renders
// standalone and never collapses.
function isGroupAnchor(message: AgentMessage): boolean {
  if (message.role === "user") return true;
  return message.role === "custom" && [
    "compaction",
    "chat.plan_review_decision",
    "chat.plan_review_feedback",
  ].includes((message as CustomMessage).customType);
}

function withAssistantBlocks(
  message: AssistantMessage,
  content: AssistantContentBlock[],
  options: { omitUsage?: boolean } = {},
): AssistantMessage {
  const next = { ...message, content };
  if (options.omitUsage) next.usage = undefined;
  return next;
}

function PlanReviewCard({
  review,
  submitting,
  onDecision,
}: {
  review: PlanReview;
  submitting: boolean;
  onDecision: (decision: PlanReviewDecisionInput) => Promise<void>;
}) {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState("");
  const trimmedFeedback = feedback.trim();
  const needsClarification = review.readiness === "needs_clarification";
  const title = t(needsClarification ? "chat.planClarificationTitle" : "chat.planReviewTitle", {
    revision: review.planRevision,
  });
  return (
    <section
      aria-label={title}
      style={{
        margin: "14px 0 18px",
        padding: 16,
        border: "1px solid color-mix(in srgb, var(--accent) 42%, var(--border))",
        borderRadius: 12,
        background: "color-mix(in srgb, var(--accent) 5%, var(--bg-secondary))",
      }}
    >
      <div style={{ marginBottom: 10, color: "var(--text)", fontSize: 14, fontWeight: 650 }}>
        {title}
      </div>
      <div style={{ marginBottom: 10, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
        {t(needsClarification ? "chat.planClarificationHint" : "chat.planReviewHint")}
      </div>
      {needsClarification && (
        <div style={{ marginBottom: 12, padding: "10px 12px", border: "1px solid color-mix(in srgb, var(--warning, #d97706) 38%, var(--border))", borderRadius: 8, background: "color-mix(in srgb, var(--warning, #d97706) 7%, var(--bg-primary))" }}>
          <div style={{ marginBottom: 6, color: "var(--text)", fontSize: 12, fontWeight: 650 }}>
            {t("chat.planBlockingQuestions")}
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6 }}>
            {review.blockingQuestions.map((question) => <li key={question}>{question}</li>)}
          </ol>
        </div>
      )}
      <div className="markdown-body" style={{ maxHeight: 360, overflow: "auto", padding: "0 2px 6px" }}>
        <MarkdownBody>{review.plan}</MarkdownBody>
      </div>
      <label style={{ display: "block", marginTop: 12, color: "var(--text-muted)", fontSize: 12 }}>
        {t(needsClarification ? "chat.planClarificationFeedback" : "chat.planReviewFeedback")}
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          disabled={submitting}
          placeholder={t(needsClarification
            ? "chat.planClarificationFeedbackPlaceholder"
            : "chat.planReviewFeedbackPlaceholder")}
          rows={3}
          maxLength={20_000}
          style={{
            display: "block",
            width: "100%",
            marginTop: 7,
            padding: "9px 10px",
            resize: "vertical",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-primary)",
            color: "var(--text)",
            font: "inherit",
            lineHeight: 1.5,
          }}
        />
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          disabled={submitting || trimmedFeedback === ""}
          onClick={() => void onDecision({ kind: "request_revision", feedback })}
          style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-primary)", color: "var(--text)", cursor: submitting || trimmedFeedback === "" ? "not-allowed" : "pointer", opacity: trimmedFeedback === "" ? 0.55 : 1 }}
        >
          {t(needsClarification ? "chat.submitPlanClarification" : "chat.requestPlanRevision")}
        </button>
        {!needsClarification && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void onDecision({ kind: "approve" })}
            style={{ padding: "7px 12px", border: "1px solid var(--accent)", borderRadius: 8, background: "var(--accent)", color: "white", cursor: submitting ? "wait" : "pointer" }}
          >
            {submitting ? t("chat.submittingPlanReview") : t("chat.approveAndExecute")}
          </button>
        )}
      </div>
    </section>
  );
}

export function ChatWindow({ projectId, deviceId, contextProjectId, interactionRevision, contextBlockedReason, session, sessionRunning, newSessionCwd, newSessionDraftKey, onAgentEnd, onAttentionNeeded, onSessionCreated, onSessionOpen, onSessionForked, chatInputRef, onBranchDataChange, onSystemPromptChange, onSystemPromptLoaderChange, onSessionStatsChange, onSessionStatsPanelOpen, onContextUsageChange, onOpenFile, onConnectionFailure, soundEnabled = true, onSoundToggle, playDoneSound = () => {}, unlockAudio }: Props) {
  const { t, locale } = useI18n();
  const { pushStatus, onPushToggle } = usePushNotifications(locale);
  const isMobile = useIsMobile();
  const readOnly = session?.readOnly === true;

  // Wrap onAgentEnd to play the completion sound. This is more reliable than
  // wrapping handleAgentEventRef because useAgentSession overwrites that ref
  // on every render (it syncs the latest callback), which would blow away an
  // externally-installed wrapper after the first re-render.
  const playDoneSoundRef = useRef(playDoneSound);
  playDoneSoundRef.current = playDoneSound;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const soundedExtensionDialogIdRef = useRef<string | null>(null);
  const wrappedOnAgentEnd = useCallback(() => {
    if (soundEnabledRef.current) {
      playDoneSoundRef.current();
    }
    onAgentEnd?.();
  }, [onAgentEnd]);

  // 稳定化 onEditContent 引用，配合 React.memo 防止历史消息重渲染
  const handleEditContent = useCallback((message: UserMessage) => {
    chatInputRef?.current?.replaceMessage(message);
  }, [chatInputRef]);

  const {
    data, activeLeafId, loading, error, messages, entryIds, entryTimes, streamState,
    agentRunning, bashRunning, pendingBash, workflowId, longAgentId, friendExecution, friendImages, workflowAgentConfigs, promptResourceProposals,
    retryInfo, contextUsage, forkingEntryId,
    isCompacting, compactError, compactResult, sessionStats,
    slashCommands, slashCommandsLoading, queuedMessages,
    notices, extensionDialog, extensionCustomUi, extensionStatuses, extensionWidgets, respondToExtensionUi, sendExtensionCustomInput,
    activity, agentPhase, activeRunStage, planReview, reviewSubmitting,
    isNew,
    sessionIdRef,
    handleSend, handleAbort, handlePlanReviewDecision, handleFork, handleNavigate,
    handleCompact, handleSteer, handleFollowUp, handlePromptWithStreamingBehavior, handleAbortCompaction,
    handleRecallQueue,
    handleBuiltinSlashCommand,
    loadSlashCommands,
    setWorkflowId, setWorkflowAgentConfigs,
  } = useAgentSession({
    projectId, deviceId, contextProjectId, interactionRevision, contextBlockedReason, session, sessionRunning, newSessionCwd, newSessionDraftKey, onAgentEnd: wrappedOnAgentEnd, onAttentionNeeded, onSessionCreated, onSessionOpen, onSessionForked,
    chatInputRef, onBranchDataChange, onSystemPromptChange, onSystemPromptLoaderChange, onSessionStatsPanelOpen,
    onConnectionFailure,
  });
  const sessionBusy = agentRunning || bashRunning;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!extensionDialog || soundedExtensionDialogIdRef.current === extensionDialog.id) return;
    soundedExtensionDialogIdRef.current = extensionDialog.id;
    playDoneSoundRef.current();
  }, [extensionDialog]);

  // Register the abort handler for the global Esc shortcut
  useEffect(() => {
    registerAbortHandler(sessionBusy ? handleAbort : null);
  }, [sessionBusy, handleAbort]);

  // --- Lazy-load historical messages ---
  // Only render the last N messages initially. When the user scrolls to the
  // top, load another page while keeping the scroll position stable.
  const [visibleCount, setVisibleCount] = useState(VISIBLE_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollDistanceRef = useRef<number | null>(null);

  // IntersectionObserver on the sentinel div at the top of the message list.
  // When it becomes visible, load the next page of older messages.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          // Save distance from top before prepending to restore scroll later
          prevScrollDistanceRef.current = captureScrollDistance(container.scrollHeight, container.scrollTop);
          setVisibleCount((prev) => getNextVisibleCount(prev));
        }
      },
      { root: container, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, messages.length, scrollContainerRef]);

  // After visibleCount increases (more messages prepended), restore the
  // scroll position so the viewport doesn't jump.
  useEffect(() => {
    if (prevScrollDistanceRef.current == null) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = restoreScrollTop(container.scrollHeight, prevScrollDistanceRef.current);
    prevScrollDistanceRef.current = null;
  }, [visibleCount, scrollContainerRef]);
  // Push session stats up to AppShell for the top bar.
  // Compare scalar fields to avoid loops from new object identity each render.
  const statsKey = sessionStats
    ? [
      sessionStats.sessionId,
      sessionStats.sessionFile ?? "",
      sessionStats.sessionName ?? "",
      sessionStats.userMessages,
      sessionStats.assistantMessages,
      sessionStats.toolCalls,
      sessionStats.toolResults,
      sessionStats.totalMessages,
      sessionStats.tokens.input,
      sessionStats.tokens.output,
      sessionStats.tokens.cacheRead,
      sessionStats.tokens.cacheWrite,
      sessionStats.tokens.total,
      sessionStats.cost ?? 0,
      sessionStats.totalActiveMs ?? 0,
    ].join("|")
    : null;
  const sessionStatsRef = useRef(sessionStats);
  sessionStatsRef.current = sessionStats;
  useEffect(() => {
    onSessionStatsChange?.(sessionStatsRef.current);
  }, [statsKey, onSessionStatsChange]);
  useEffect(() => () => { onSessionStatsChange?.(null); }, [onSessionStatsChange]);

  // Push context usage up to AppShell as well.
  const ctxKey = contextUsage
    ? `${contextUsage.percent ?? "null"}|${contextUsage.contextWindow}|${contextUsage.tokens ?? "null"}`
    : null;
  const contextUsageRef = useRef(contextUsage);
  contextUsageRef.current = contextUsage;
  useEffect(() => {
    onContextUsageChange?.(contextUsageRef.current);
  }, [ctxKey, onContextUsageChange]);
  useEffect(() => () => { onContextUsageChange?.(null); }, [onContextUsageChange]);

  const onDrop = useCallback((files: File[]) => {
    if (sessionBusy || readOnly) return;
    chatInputRef?.current?.addImages(files);
  }, [sessionBusy, readOnly, chatInputRef]);

  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(onDrop);

  const visibleMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");
  // Stable Map identity: `messages` doesn't change during streaming updates
  // (the streaming message lives in streamState), so memoized MessageViews
  // skip re-rendering on every message_update event. An inline `new Map()`
  // here used to defeat MessageView's memo() on each streamed chunk.
  const toolResultsMap = useMemo(() => {
    const map = new Map<string, ToolResultMessage>();
    for (const msg of messages) {
      if (msg.role === "toolResult") {
        map.set((msg as ToolResultMessage).toolCallId, msg as ToolResultMessage);
      }
    }
    return map;
  }, [messages]);
  const inputHistory = useMemo(() => {
    const seen = new Set<string>();
    const history: string[] = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const text = getUserInputText(messages[i]);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      history.push(text);
      if (history.length >= 50) break;
    }
    return history.reverse();
  }, [messages]);
  const messageRefs = useMessageRefs(visibleMessages.length);
  const revealHistoryForMinimap = useCallback(() => {
    setVisibleCount((current) => Math.max(current, messages.length * 2));
  }, [messages.length]);

  const isEmptyNew = isNew && messages.length === 0 && !streamState.isStreaming && !sessionBusy;
  const hasStreamingContent = Boolean(streamState.streamingMessage?.content.length);
  const messageCwd = session?.cwd ?? newSessionCwd ?? undefined;
  const messageContentRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef<ReturnType<typeof observeChatAutoScroll> | null>(null);
  // Polling reconstructs messages every 3 seconds; object identity is not new activity.
  const messageTailKey = useMemo(() => JSON.stringify([
    messages.length, messages.at(-1),
  ]), [messages]);
  const activityKey = JSON.stringify([
    session?.id, messageTailKey, streamState, sessionBusy,
    agentPhase, activeRunStage, planReview, pendingBash,
  ]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const content = messageContentRef.current;
    if (!container || !content) return;
    const autoScroll = observeChatAutoScroll(container, content);
    autoScrollRef.current = autoScroll;
    return () => {
      autoScroll.dispose();
      autoScrollRef.current = null;
    };
  }, [isEmptyNew, loading, error]);

  useLayoutEffect(() => {
    autoScrollRef.current?.update(activityKey);
  }, [activityKey, isEmptyNew, loading, error]);

  const chatInputElement = readOnly ? (
    <div
      role="note"
      style={{
        margin: "0 16px 14px",
        padding: "11px 14px",
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-secondary)",
        color: "var(--text-muted)",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      当前Session为只读记录，不能继续执行或修改。
    </div>
  ) : (
    <ChatInput
      key={session?.owner.type === "long-agent" ? composerDraftKey(session.id, true, contextProjectId) : "ordinary-composer"}
      ref={chatInputRef}
      projectId={projectId}
      onSend={handleSend}
      onAbort={handleAbort}
      stopLabel={activity?.phase === "stopping" ? t("runStatus.stopping") : undefined}
      stopping={activity?.phase === "stopping"}
      onSteer={agentRunning && longAgentId !== null && friendExecution?.capabilities.steer && (friendExecution.workId !== undefined || friendExecution.contextProjectId === (contextProjectId ?? null)) ? handleSteer : undefined}
      onFollowUp={agentRunning && longAgentId !== null && friendExecution?.capabilities.followUp ? handleFollowUp : undefined}
      onPromptWithStreamingBehavior={agentRunning && longAgentId !== null ? handlePromptWithStreamingBehavior : undefined}
      isStreaming={sessionBusy}
      workflowId={workflowId}
      onWorkflowChange={setWorkflowId}
      longAgentId={longAgentId}
      friendImages={friendImages}
      workflowAgentConfigs={workflowAgentConfigs}
      promptResourceProposals={promptResourceProposals}
      onWorkflowAgentConfigsChange={setWorkflowAgentConfigs}
      onCompact={session || isNew ? handleCompact : undefined}
      onAbortCompaction={handleAbortCompaction}
      isCompacting={isCompacting}
      compactError={compactError}
      compactResult={compactResult}
      retryInfo={retryInfo}
      queuedMessages={queuedMessages}
      inputHistory={inputHistory}
      onRecallQueue={handleRecallQueue}
      slashCommands={slashCommands}
      slashCommandsLoading={slashCommandsLoading}
      onLoadSlashCommands={loadSlashCommands}
      onBuiltinCommand={handleBuiltinSlashCommand}
      soundEnabled={soundEnabled}
      onSoundToggle={onSoundToggle}
      pushStatus={pushStatus}
      onPushToggle={onPushToggle}
      onAudioUnlock={unlockAudio}
      draftKey={composerDraftKey(session?.id, session?.owner.type === "long-agent", contextProjectId, newSessionDraftKey, deviceId, projectId)}
      cwd={session?.cwd ?? newSessionCwd}
    />
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
         {t("chat.loadingSession")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  return (
    <ToolActivityContext value={{ tools: activity?.tools ?? {}, busy: sessionBusy }}>
    <div
      className="relative flex h-full min-w-0 flex-col overflow-hidden"
      style={{ paddingBottom: readOnly ? "env(safe-area-inset-bottom)" : undefined }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-[drop-zone-in_0.15s_ease_both] items-center justify-center bg-[rgba(37,99,235,0.06)] backdrop-blur-[1px]">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.8, 1.6].map((delay) => (
              <div
                key={delay}
                className="absolute h-[720px] w-[720px] rounded-full border-[1.5px] border-solid border-[rgba(37,99,235,0.5)] animate-[drop-ripple_2.4s_ease-out_infinite_backwards]"
                style={{ transformOrigin: "center", animationDelay: `${delay}s` }}
              />
            ))}
          </div>
          <svg
            width="280" height="280" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_6px_18px_rgba(37,99,235,0.18)]"
          >
            <rect x="28" y="44" width="84" height="60" rx="8" fill="rgba(37,99,235,0.08)" stroke="rgba(37,99,235,0.50)" strokeWidth="1.8"/>
            <path d="M36 100 L54 72 L68 88 L80 74 L104 100Z" fill="rgba(37,99,235,0.16)" stroke="rgba(37,99,235,0.40)" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="96" cy="58" r="8" fill="rgba(37,99,235,0.22)" stroke="rgba(37,99,235,0.55)" strokeWidth="1.6"/>
            <g stroke="rgba(37,99,235,0.45)" strokeWidth="1.4" strokeLinecap="round">
              <line x1="96" y1="46" x2="96" y2="43"/>
              <line x1="96" y1="70" x2="96" y2="73"/>
              <line x1="84" y1="58" x2="81" y2="58"/>
              <line x1="108" y1="58" x2="111" y2="58"/>
              <line x1="87.5" y1="49.5" x2="85.4" y2="47.4"/>
              <line x1="104.5" y1="66.5" x2="106.6" y2="68.6"/>
              <line x1="104.5" y1="49.5" x2="106.6" y2="47.4"/>
              <line x1="87.5" y1="66.5" x2="85.4" y2="68.6"/>
            </g>
          </svg>
        </div>
      )}

      {extensionDialog && (
        <ExtensionDialog
          request={extensionDialog}
          onRespond={respondToExtensionUi}
        />
      )}

      {extensionCustomUi && (
        <ExtensionCustomPanel
          request={extensionCustomUi}
          onInput={sendExtensionCustomInput}
        />
      )}

      <div
        style={{
          position: "absolute",
          top: 12,
          left: 0,
          right: isMobile ? 0 : CHAT_MINIMAP_WIDTH,
          zIndex: 40,
          display: "flex",
          justifyContent: "center",
          padding: `0 ${CHAT_COLUMN_PADDING}px`,
          pointerEvents: "none",
        }}
      >
        <NoticeShelf notices={notices} floating />
      </div>

      {isEmptyNew ? (
        <div className={`flex flex-1 flex-col items-center overflow-y-auto ${isMobile ? "justify-between px-0 pt-4 pb-0" : "justify-center px-4 py-8"}`}>
          <div className="w-full workspace-message-column" style={{ paddingLeft: isMobile ? 16 : 0, paddingRight: isMobile ? 16 : 0 }}>
            <div
              className="mb-3"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginLeft: isMobile ? 0 : 16,
                marginRight: isMobile ? 0 : 52,
                fontFamily: "var(--font-mono)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: isMobile ? 7 : 10, minWidth: 0, flex: 1, lineHeight: 1.4, overflow: "hidden" }}>
                <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: 0, color: "var(--text)", flexShrink: 0, whiteSpace: "nowrap" }}>π</span>
                <span style={{ fontSize: 22, color: "var(--text)", fontWeight: 700, letterSpacing: 0, flexShrink: 0, whiteSpace: "nowrap" }}>Chat</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  web <span style={{ color: "var(--text)" }}>v{import.meta.env.VITE_APP_VERSION ?? "0.1.1"}</span>
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  pi <span style={{ color: "var(--text)" }}>v{import.meta.env.VITE_PI_VERSION ?? "source"}</span>
                </span>
              </div>
            </div>
            {isMobile ? null : (
              <>
                {chatInputElement}
                <ExtensionStatusBar statuses={extensionStatuses} widgets={extensionWidgets} />
              </>
            )}
          </div>
          {isMobile && (
            <div className="w-full workspace-message-column" style={{ flexShrink: 0, marginTop: "auto" }}>
              {chatInputElement}
              <ExtensionStatusBar statuses={extensionStatuses} widgets={extensionWidgets} />
            </div>
          )}
        </div>
      ) : (
      <>
      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        <div ref={scrollContainerRef} className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pt-4 [scrollbar-width:none]">
          <div style={{ minWidth: 0, padding: `0 ${CHAT_COLUMN_PADDING}px` }}>
            <div ref={messageContentRef} className="workspace-message-column" style={{ width: "100%", minWidth: 0, margin: "0 auto" }}>
            {(() => {
              // Compaction summaries can anchor the still-streaming segment.
              let lastAnchorIdx = -1;
              for (let i = messages.length - 1; i >= 0; i--) {
                if (isGroupAnchor(messages[i])) { lastAnchorIdx = i; break; }
              }

              const visibleRefIndexByMessage = new Map<number, number>();
              let refIdx = 0;
              messages.forEach((msg, idx) => {
                if (msg.role === "user" || msg.role === "assistant") {
                  visibleRefIndexByMessage.set(idx, refIdx++);
                }
              });

              const attachVisibleRef = (refIndex: number) => (el: HTMLDivElement | null) => {
                messageRefs.current[refIndex] = el;
              };

              const renderMessage = (idx: number, options: { attachRef?: boolean; keyPrefix?: string; messageOverride?: AgentMessage; showTimestamp?: boolean; writtenFiles?: WrittenFile[] } = {}): ReactNode => {
                const msg = options.messageOverride ?? messages[idx];
                const prevAssistantEntryId =
                  msg.role === "user" && idx > 0 && messages[idx - 1].role === "assistant"
                    ? entryIds[idx - 1]
                    : undefined;
                const isVisible = msg.role === "user" || msg.role === "assistant";
                const currentRefIdx = visibleRefIndexByMessage.get(idx);
                const keyPrefix = options.keyPrefix ?? "message";
                let showTimestamp = false;
                if (msg.role === "assistant") {
                  showTimestamp = true;
                  for (let j = idx + 1; j < messages.length; j++) {
                    const r = messages[j].role;
                    if (r === "user") break;
                    if (r === "assistant") { showTimestamp = false; break; }
                  }
                  // Hide on the currently-streaming tail (the streaming bubble owns the live timestamp)
                  if (showTimestamp && streamState.isStreaming && idx === messages.length - 1) {
                    showTimestamp = false;
                  }
                }
                if (options.showTimestamp !== undefined) showTimestamp = options.showTimestamp;
                const messageView = (
                  <MessageView
                    key={`${keyPrefix}-view-${idx}`}
                    message={msg}
                    toolResults={toolResultsMap}
                    cwd={messageCwd}
                    onOpenFile={onOpenFile}
                    entryId={entryIds[idx]}
                    onFork={readOnly || sessionBusy || isNew || (idx === 0 && msg.role === "user") ? undefined : handleFork}
                    forking={forkingEntryId === entryIds[idx]}
                    onNavigate={readOnly || sessionBusy ? undefined : handleNavigate}
                    prevAssistantEntryId={readOnly || sessionBusy ? undefined : prevAssistantEntryId}
                    onEditContent={readOnly ? undefined : handleEditContent}
                    showTimestamp={showTimestamp}
                    prevTimestamp={idx > 0 ? (messages[idx - 1] as AgentMessage & { timestamp?: number }).timestamp : undefined}
                    sessionId={session?.id ?? sessionIdRef.current ?? undefined}
                    writtenFiles={options.writtenFiles}
                  />
                );
                const workflowAgentId = msg.role === "assistant"
                  ? (msg as AssistantMessage).chatWorkflow?.agentId
                  : undefined;
                const view = workflowAgentId === undefined
                  ? messageView
                  : (
                      <div key={`${keyPrefix}-workflow-${idx}`}>
                        <div className="pb-1 text-[11px] font-medium text-text-muted">
                          {workflowAgentId === "planner"
                            ? t("chat.plannerStage")
                            : (workflowAgentId === "pi-coding-agent" ? "Pi Coding Agent" : workflowAgentId)}
                        </div>
                        {messageView}
                      </div>
                    );
                if (!isVisible || options.attachRef === false || currentRefIdx === undefined) return view;
                return (
                  <div key={`${keyPrefix}-${idx}`} ref={attachVisibleRef(currentRefIdx)}>
                    {view}
                  </div>
                );
              };

              const rendered: ReactNode[] = [];
              for (let idx = 0; idx < messages.length;) {
                const msg = messages[idx];
                if (!isGroupAnchor(msg)) {
                  rendered.push(renderMessage(idx));
                  idx += 1;
                  continue;
                }

                const userIdx = idx;
                let endIdx = userIdx + 1;
                while (endIdx < messages.length && !isGroupAnchor(messages[endIdx])) endIdx += 1;

                const finalAssistantIdx = findFinalAssistantIndex(messages, userIdx, endIdx);

                if (finalAssistantIdx === -1) {
                  for (let renderIdx = userIdx; renderIdx < endIdx; renderIdx++) {
                    rendered.push(renderMessage(renderIdx));
                  }
                  idx = endIdx;
                  continue;
                }

                const isLiveTail = (sessionBusy || streamState.isStreaming) && endIdx === messages.length && userIdx === lastAnchorIdx;
                if (isLiveTail) {
                  for (let renderIdx = userIdx; renderIdx < endIdx; renderIdx++) {
                    rendered.push(renderMessage(renderIdx));
                  }
                  idx = endIdx;
                  continue;
                }

                rendered.push(renderMessage(userIdx));

                const processIndices: number[] = [];
                for (let processIdx = userIdx + 1; processIdx < finalAssistantIdx; processIdx++) {
                  processIndices.push(processIdx);
                }
                const visibleProcessIndices = processIndices.filter((processIdx) => hasDisplayableProcessMessage(messages[processIdx]));
                const finalAssistant = messages[finalAssistantIdx] as AssistantMessage;
                const finalSplit = splitFinalAssistantBlocks(finalAssistant);
                const finalProcessMessage = finalSplit.processBlocks.length > 0
                  ? withAssistantBlocks(finalAssistant, finalSplit.processBlocks, { omitUsage: true })
                  : null;
                const finalAnswerMessage = finalSplit.answerBlocks.length > 0 || getAssistantErrorMessage(finalAssistant)
                  ? withAssistantBlocks(finalAssistant, finalSplit.answerBlocks, { omitUsage: true })
                  : null;

                const processRefIdx = visibleProcessIndices
                  .map((processIdx) => visibleRefIndexByMessage.get(processIdx))
                  .find((value): value is number => typeof value === "number")
                  ?? (finalAnswerMessage ? undefined : visibleRefIndexByMessage.get(finalAssistantIdx));
                const processContent = visibleProcessIndices.length || finalProcessMessage ? <>
                  {visibleProcessIndices.map((processIdx) => renderMessage(processIdx, { attachRef: false, keyPrefix: "process" }))}
                  {finalProcessMessage && renderMessage(finalAssistantIdx, { attachRef: false, keyPrefix: "process-final", messageOverride: finalProcessMessage, showTimestamp: false })}
                </> : undefined;
                if (finalAnswerMessage) {
                  // Each tool call is stored as its own assistant entry, so the
                  // final answer alone carries no record of what the turn wrote.
                  // Gather the turn's assistant blocks and derive the file list
                  // from the write/edit calls among them.
                  const turnContent: AssistantContentBlock[] = [];
                  for (let i = userIdx + 1; i <= finalAssistantIdx; i++) {
                    const m = messages[i];
                    if (m?.role === "assistant") {
                      for (const b of (m as AssistantMessage).content ?? []) turnContent.push(b);
                    }
                  }
                  const writtenFiles = extractTurnWrittenFiles(turnContent, toolResultsMap, messageCwd);
                  rendered.push(renderMessage(finalAssistantIdx, { messageOverride: finalAnswerMessage, writtenFiles }));
                }
                for (let renderIdx = finalAssistantIdx + 1; renderIdx < endIdx; renderIdx++) {
                  rendered.push(renderMessage(renderIdx));
                }
                rendered.push(<div key={`turn-summary-${userIdx}-${finalAssistantIdx}`}
                  ref={processRefIdx === undefined ? undefined : (el) => { messageRefs.current[processRefIdx] = el; }}>
                  <TurnSummary summary={summarizeTurn(messages.slice(userIdx, endIdx), entryTimes.slice(userIdx, endIdx))}
                    completed={activeLeafId === data?.leafId && endIdx === messages.length && activity?.phase === "completed"}
                    defaultExpanded={!finalAnswerMessage}>
                    {processContent}
                  </TurnSummary>
                </div>);
                idx = endIdx;
              }
              const { startIndex, hasMore } = getVisibleRenderWindow(rendered.length, visibleCount);
              return (
                <>
                  {hasMore && (
                     <div ref={sentinelRef} className="py-3 text-center text-xs text-text-muted">
                       {t("chat.loadEarlier", { count: startIndex })}
                    </div>
                  )}
                  {rendered.slice(startIndex)}
                </>
              );
            })()}
            {streamState.isStreaming && hasStreamingContent && streamState.streamingMessage && (
              <div>
                {activeRunStage && (
                  <div className="pb-1 text-[11px] font-medium text-text-muted">
                    {activeRunStage.agentId === "planner"
                      ? t("chat.plannerStage")
                      : (activeRunStage.agentId === "pi-coding-agent" ? "Pi Coding Agent" : activeRunStage.agentId)}
                  </div>
                )}
                <MessageView message={streamState.streamingMessage as AgentMessage} isStreaming cwd={messageCwd} onOpenFile={onOpenFile} />
              </div>
            )}

            {planReview && (
              <PlanReviewCard
                key={planReview.reviewId}
                review={planReview}
                submitting={reviewSubmitting}
                onDecision={handlePlanReviewDecision}
              />
            )}

            {bashRunning && !pendingBash && (
              <div className="py-2 text-[13px] text-text-muted">
                 <span className="animate-[pulse_1.5s_infinite]">{t("chat.runningCommand")}</span>
              </div>
            )}

            {pendingBash && (
              <MessageView
                message={{
                  role: "bashExecution",
                  command: pendingBash.command,
                  output: "",
                  excludeFromContext: pendingBash.excludeFromContext,
                } as BashExecutionMessage}
                sessionId={session?.id ?? sessionIdRef.current ?? undefined}
              />
            )}

            </div>
          </div>
        </div>
        {isMobile ? null : (
          <ChatMinimap
            messages={messages}
            streamingMessage={streamState.streamingMessage}
            scrollContainer={scrollContainerRef}
            messageRefs={messageRefs}
            onRevealHistory={revealHistoryForMinimap}
          />
        )}
      </div>

      <div className="relative">
        <RunStatus activity={activity} busy={sessionBusy} />
        {chatInputElement}
        <ExtensionStatusBar statuses={extensionStatuses} widgets={extensionWidgets} />
      </div>
      </>
      )}
    </div>
    </ToolActivityContext>
  );
}

function NoticeShelf({ notices, floating = false }: { notices: NoticeItem[]; floating?: boolean }) {
  if (notices.length === 0) return null;
  return (
    <div
      className="extension-dialog-backdrop"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginBottom: floating ? 0 : 10,
      }}
    >
      {notices.map((notice, index) => {
        const color = notice.type === "error"
          ? "#ef4444"
          : notice.type === "warning"
            ? "#d97706"
            : notice.type === "success"
              ? "#10b981"
              : "var(--accent)";
        return (
          <div
            key={notice.id}
            className="notice-shelf-item"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 60,
              height: 60,
              maxHeight: 60,
              marginBottom: index === notices.length - 1 ? 0 : 6,
              overflow: "hidden",
              borderRadius: 14,
              border: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
              background: "var(--bg)",
              color: "var(--text-muted)",
              width: "fit-content",
              maxWidth: "min(100%, 620px)",
              boxShadow: floating
                ? "0 1px 2px rgba(15,23,42,0.05), 0 10px 28px -14px rgba(15,23,42,0.24)"
                : "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)",
              fontSize: 18,
              lineHeight: 1.45,
              transformOrigin: "top center",
              animation: notice.exiting
                ? "notice-shelf-out 0.18s ease-in forwards"
                : "notice-shelf-in 0.18s ease-out both",
              padding: "0 12px",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
              }}
            />
            <span style={{ padding: "14px 0", minWidth: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {notice.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type ExtensionDialogRequest = Extract<ExtensionUiRequest, { method: "select" | "confirm" | "input" | "editor" }>;

function ExtensionDialog({
  request,
  onRespond,
}: {
  request: ExtensionDialogRequest;
  onRespond: (request: ExtensionDialogRequest, response: { value: string } | { confirmed: boolean } | { cancelled: true }) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(request.method === "editor" ? request.prefill ?? "" : "");

  useEffect(() => {
    setValue(request.method === "editor" ? request.prefill ?? "" : "");
  }, [request]);

  const submitValue = () => {
    if (request.method === "confirm") {
      onRespond(request, { confirmed: true });
    } else {
      onRespond(request, { value });
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0,0,0,0.18)",
      }}
    >
      <div
        className="extension-dialog-surface configuration-dialog"
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(560px, 100%)",
          maxHeight: "min(760px, 100%)",
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
          overflow: "hidden",
        }}
      >
        <div style={{ flexShrink: 0, padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ color: "var(--text)", fontSize: 14, fontWeight: 650 }}>{request.title}</div>
          <div style={{ marginTop: 3, color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{t("chat.extensionRequest")}</div>
        </div>

        <div
          style={{
            padding: 14,
            ...(request.method === "select"
              ? { flex: "1 1 auto", minHeight: 0, overflowY: "auto" }
              : {}),
          }}
        >
          {request.method === "confirm" && (
            <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{request.message}</div>
          )}
          {request.method === "select" && (
            <div style={{ display: "grid", gap: 8 }}>
              {request.options.map((option) => (
                <button
                  key={option}
                  onClick={() => onRespond(request, { value: option })}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    borderRadius: 7,
                    border: "1px solid var(--border)",
                    background: "var(--bg-panel)",
                    color: "var(--text)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    overflowWrap: "anywhere",
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          {request.method === "input" && (
            <input
              autoFocus
              value={value}
              placeholder={request.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitValue();
                if (e.key === "Escape") onRespond(request, { cancelled: true });
              }}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                color: "var(--text)",
                outline: "none",
                fontSize: 13,
              }}
            />
          )}
          {request.method === "editor" && (
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onRespond(request, { cancelled: true });
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitValue();
              }}
              style={{
                width: "100%",
                minHeight: 220,
                padding: 10,
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                color: "var(--text)",
                outline: "none",
                resize: "vertical",
                fontSize: 13,
                lineHeight: 1.55,
                fontFamily: "var(--font-mono)",
              }}
            />
          )}
        </div>

        <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--bg-panel)" }}>
          <button
            onClick={() => onRespond(request, { cancelled: true })}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
             {t("chat.cancel")}
          </button>
          {request.method === "confirm" ? (
            <button
              onClick={submitValue}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
               {t("chat.confirm")}
            </button>
          ) : request.method !== "select" ? (
            <button
              onClick={submitValue}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
               {t("chat.submit")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type ExtensionCustomRequest = Extract<ExtensionUiRequest, { method: "custom" }>;

function renderAnsiLine(line: string, keyPrefix: string): ReactNode[] {
  return parseAnsiLine(line).map((segment, index) => (
    Object.keys(segment.style).length > 0
      ? <span key={`${keyPrefix}-${index}`} style={segment.style}>{segment.text}</span>
      : segment.text
  ));
}

function ExtensionCustomPanel({
  request,
  onInput,
}: {
  request: ExtensionCustomRequest;
  onInput: (request: ExtensionCustomRequest, data: string) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const displayLines = normalizeCustomPanelLines(request.lines);

  useEffect(() => {
    inputRef.current?.focus();
  }, [request.id]);

  return (
    <div
      className="extension-dialog-backdrop"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 95,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0,0,0,0.18)",
      }}
    >
      <div
        className="extension-dialog-surface configuration-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("button")) inputRef.current?.focus();
        }}
        style={{
          position: "relative",
          width: "min(920px, 100%)",
          maxHeight: "min(760px, calc(100vh - 40px))",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
          overflow: "hidden",
          outline: "none",
        }}
      >
        <textarea
          ref={inputRef}
           aria-label={t("chat.extensionInput")}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={(event) => {
            if (composingRef.current || event.nativeEvent.isComposing) return;
            const data = toTerminalKeyData(event);
            if (!data) return;
            event.preventDefault();
            event.stopPropagation();
            onInput(request, data);
          }}
          onInput={(event) => {
            if (composingRef.current || event.nativeEvent.isComposing) return;
            const text = event.currentTarget.value;
            event.currentTarget.value = "";
            if (text) onInput(request, text);
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            const input = event.currentTarget;
            queueMicrotask(() => {
              const text = input.value;
              input.value = "";
              if (text) onInput(request, text);
            });
          }}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData("text");
            if (text) onInput(request, asBracketedPaste(text));
          }}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            border: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
           <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 650 }}>{t("chat.extensionPanel")}</div>
          <button
            onClick={() => onInput(request, "\x03")}
            style={{
              padding: "5px 9px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-panel)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
             {t("chat.close")}
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            padding: 14,
            maxHeight: "calc(min(760px, 100vh - 40px) - 48px)",
            overflow: "auto",
            background: "var(--bg-panel)",
            color: "var(--text)",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            lineHeight: 1.45,
            whiteSpace: "pre",
          }}
        >
          {(displayLines.length ? displayLines : [""]).map((line, index, allLines) => (
            <Fragment key={index}>
              {renderAnsiLine(line, `line-${index}`)}
              {index < allLines.length - 1 ? "\n" : null}
            </Fragment>
          ))}
        </pre>
      </div>
    </div>
  );
}
