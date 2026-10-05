"use client";
import type { ExecutionSettlement } from "@/lib/execution-completion";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from "./ui/DropdownMenu";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { composerDraftKey } from "@/lib/composer-context";
import { registerAbortHandler } from "@/hooks/useKeyboardShortcuts";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AgentMessage, AssistantContentBlock, AssistantMessage, BashExecutionMessage, BlockingExtensionUiRequest, CustomMessage, ExtensionUiRequest, SessionInfo, SessionTreeNode, ToolResultMessage, UserMessage } from "@/lib/types";
import { normalizeCustomPanelLines, parseAnsiLine } from "@/lib/ansi";
import { asBracketedPaste, toTerminalKeyData } from "@/lib/terminal-input";
import { getAssistantErrorMessage, getDisplayableAssistantBlocks, splitFinalAssistantBlocks, findFinalAssistantIndex, isSessionMemoryResponse } from "@/lib/message-display";
import { extractTurnWrittenFiles, type WrittenFile } from "@/lib/turn-written-files";
import { groupWorkflowProcess } from "@/lib/workflow-process";
import { WorkflowProcess } from "./WorkflowProcess";
import { summarizeTurn } from "@/lib/turn-summary";
import { TurnSummary } from "./TurnSummary";
import { Hint } from "@/components/ui/Tooltip";
import { RunStatus, ToolActivityContext } from "./RunStatus";
import { MessageView } from "./MessageView";
import { TurnPromptCaptures } from "./TurnPromptCaptures";
import { groupPromptCaptures, parsePromptCaptureList, type PromptCaptureTurnGroup } from "@/lib/prompt-captures";
import { isSessionActivity } from "@/lib/session-activity";
import { turnProcessIndices } from "@/lib/message-display";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatMinimap, useMessageRefs } from "./ChatMinimap";
import { ExtensionStatusBar } from "./ExtensionStatusBar";
import { useI18n } from "@/hooks/useI18n";
import { useAgentSession, type NoticeItem } from "@/hooks/useAgentSession";
import { useSessionMemoryCount } from "@/hooks/useSessionMemoryCount";
import { sessionMemoryCountKey } from "@/lib/session-memory-count";
import { useDragDrop } from "@/hooks/useDragDrop";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import type { SessionStatsInfo } from "@/lib/pi-types";
import type { PlanReview } from "@/lib/chat-workflow-events";
import type { PlanReviewDecisionInput } from "@/lib/chat-workflow-browser";
import type { TopicNodeTarget } from "@/lib/topic-node-execution";
import { MarkdownBody } from "./MarkdownBody";
import { PlanReviewCard } from "./PlanReviewCard";
import { SessionMemoryDialog } from "./SessionMemoryDialog";
import { Button } from "./ui/Button";
import { ToolbarAction } from "./ui/ToolbarAction";
import { IconMessageCircle, IconBell, IconCircleDot, IconNotebook, IconVolume, IconAdjustmentsHorizontal, IconArrowsMinimize, IconPlayerStop } from "@tabler/icons-react";
import { SurfaceDialog } from "./SurfaceDialog";
import { TopicCreationRequests } from "./TopicCreationRequests";
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
  deviceId?: string;
  /** 顶栏选中的项目：随 Long Agent 新轮次发送，受理时冻结为本轮执行项目。 */
  contextProjectId?: string | null;
  /** Topic node target: sends go through the node route, everything else uses the shared Session surface. */
  topicNode?: TopicNodeTarget;
  session: SessionInfo | null;
  sessionRunning?: boolean;
  /** DOM slot in the conversation top bar that hosts this session's actions. */
  chatActionsSlot?: HTMLElement | null;
  newSessionCwd: string | null;
  newSessionDraftKey: string | null;
  onExecutionSettled?: (event: ExecutionSettlement) => void;
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
    // A memory failure must be plainly visible, never folded into a collapsed turn summary: it is the
    // only signal that this round's memory was not written.
    "chat.session_memory_notice",
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

export function ChatWindow({ chatActionsSlot, projectId, deviceId, contextProjectId, topicNode: requestedTopicNode, session, sessionRunning, newSessionCwd, newSessionDraftKey, onExecutionSettled, onAttentionNeeded, onSessionCreated, onSessionOpen, onSessionForked, chatInputRef, onBranchDataChange, onSystemPromptChange, onSystemPromptLoaderChange, onSessionStatsChange, onSessionStatsPanelOpen, onContextUsageChange, onOpenFile, onConnectionFailure, soundEnabled = true, onSoundToggle, playDoneSound = () => {}, unlockAudio }: Props) {
  const topicNode = requestedTopicNode ?? session?.topicNode;
  const { t, locale } = useI18n();
  // The session-memory bar: one view button that opens the manual session-memory reader.
  const [memoryOpen, setMemoryOpen] = useState(false);
  const { pushStatus, onPushToggle } = usePushNotifications(locale);
  const isMobile = useIsMobile();
  const readOnly = session?.readOnly === true;

  // Completion sound belongs to the enclosing execution in AppShell. Extension
  // input requests retain their separate attention cue.
  const playDoneSoundRef = useRef(playDoneSound);
  playDoneSoundRef.current = playDoneSound;
  const soundedExtensionDialogIdRef = useRef<string | null>(null);

  // 稳定化 onEditContent 引用，配合 React.memo 防止历史消息重渲染
  const handleEditContent = useCallback((message: UserMessage) => {
    chatInputRef?.current?.replaceMessage(message);
  }, [chatInputRef]);

  const {
    data, activeLeafId, loading, error, messages, entryIds, entryTimes, streamState,
    agentRunning, bashRunning, pendingBash, workflowId, longAgentId, friendExecution, friendImages, workflowAgentConfigs, promptResourceProposals,
    retryInfo, contextUsage, forkingEntryId,
    isCompacting, compactError, compactResult, sessionStats, canCompact, canContinue, browsingHistory, handleReturnToCurrent,
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
    promptCaptureEnabled, setPromptCaptureEnabled,
  } = useAgentSession({
    projectId, deviceId, contextProjectId, topicNode, session, sessionRunning, newSessionCwd, newSessionDraftKey, onExecutionSettled, onAttentionNeeded, onSessionCreated, onSessionOpen, onSessionForked,
    chatInputRef, onBranchDataChange, onSystemPromptChange, onSystemPromptLoaderChange, onSessionStatsPanelOpen,
    onConnectionFailure,
  });
  const sessionBusy = agentRunning || bashRunning || isCompacting;
  // 完整 Prompt 记录（开启时）：消息流内逐轮内嵌真实发出的 Provider 请求解析。
  const prevAgentRunningRef = useRef(agentRunning);
  useEffect(() => {
    // 一轮结束（running→false）后刷新捕获索引，新记录立即可展开。
    if (prevAgentRunningRef.current && !agentRunning) setCaptureRevision((value) => value + 1);
    prevAgentRunningRef.current = agentRunning;
  }, [agentRunning]);
  const promptCaptureActive = promptCaptureEnabled && longAgentId !== null && !readOnly;
  const [captureGroups, setCaptureGroups] = useState<ReadonlyMap<string, PromptCaptureTurnGroup>>(() => new Map());
  const [captureRevision, setCaptureRevision] = useState(0);
  const captureSessionId = session?.id ?? sessionIdRef.current ?? null;
  useEffect(() => {
    if (!promptCaptureActive || captureSessionId === null) { setCaptureGroups(new Map()); return; }
    const controller = new AbortController();
    void fetch(`/api/sessions/${encodeURIComponent(captureSessionId)}/prompt-captures?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return parsePromptCaptureList(await response.json()); })
      .then((parsed) => {
        if (controller.signal.aborted) return;
        const byKey = new Map<string, PromptCaptureTurnGroup>();
        for (const group of groupPromptCaptures(parsed.records)) {
          // 轮次匹配键 = turnKey（Long Agent 轮即轮次 ID）；无 turnKey 的直调请求（如压缩摘要）不入流。
          for (const record of group.records) {
            if (record.turn.turnKey !== undefined) byKey.set(record.turn.turnKey, group);
          }
        }
        setCaptureGroups(byKey);
      })
      .catch(() => { if (!controller.signal.aborted) setCaptureGroups(new Map()); });
    return () => controller.abort();
  }, [promptCaptureActive, captureSessionId, projectId, captureRevision]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!extensionDialog || soundedExtensionDialogIdRef.current === extensionDialog.id) return;
    soundedExtensionDialogIdRef.current = extensionDialog.id;
    playDoneSoundRef.current();
  }, [extensionDialog]);

  // Register the abort handler for the global Esc shortcut
  useEffect(() => {
    registerAbortHandler(isCompacting ? handleAbortCompaction : sessionBusy ? handleAbort : null);
  }, [sessionBusy, isCompacting, handleAbort, handleAbortCompaction]);

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

  const isEmptyChat = messages.length === 0 && !streamState.isStreaming && !sessionBusy && !browsingHistory && !readOnly;
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
  }, [isEmptyChat, loading, error]);

  useLayoutEffect(() => {
    autoScrollRef.current?.update(activityKey);
  }, [activityKey, isEmptyChat, loading, error]);

  // 会话记忆归属 = 会话的真实存储项目：LA 受理回合已在服务端冻结绑定（turn.storageProjectId），
  // 记忆文件与 Pi 会话文件同处一个项目目录。owner=LA 且 projectId 等于属主（Friend/主题节点会话，
  // 存在于 Agent 容器 home）时，归属就是该 LA home；绑定项目的会话必须读绑定项目，而非 LA home。
  const ownerLongAgentId = session?.owner.type === "long-agent" ? session.owner.longAgentId : null;
  const memoryStorageProjectId = session?.projectId !== undefined && session.projectId !== ownerLongAgentId
    ? session.projectId
    : longAgentId ?? projectId;
  const memorySessionId = session?.id ?? sessionIdRef.current ?? null;
  // The badge reads the memory API itself; the dialog no longer has to be open for
  // it to be correct (see hooks/useSessionMemoryCount).
  const memoryCountKey = sessionMemoryCountKey({ messageCount: messages.length, phase: activity?.phase ?? null });
  const sessionMemoryCount = useSessionMemoryCount({
    storageProjectId: memoryStorageProjectId, sessionId: memorySessionId, refreshKey: memoryCountKey,
  });
  const memoryCount = sessionMemoryCount.count;
  // Session-level actions live in the conversation top bar (UI/UX §20.5): this
  // one opens the session-memory reader and shows how many active entries it has.
  const sessionMemoryAction = !readOnly && memorySessionId !== null ? (
    <ToolbarAction
      label={t("topics.memoryPanel")}
      icon={<IconNotebook size={18} aria-hidden="true" />}
      badge={memoryCount}
      active={memoryOpen}
      aria-expanded={memoryOpen}
      aria-controls="session-memory-dialog"
      data-session-memory-open
      onClick={() => setMemoryOpen(true)}
    />
  ) : null;
  const settingsAction = <DropdownMenu>
    <DropdownMenuTrigger asChild><ToolbarAction data-chat-settings iconOnly={isMobile} label={t("chat.settings")} icon={<IconAdjustmentsHorizontal size={18} />} /></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel>{t("chat.settings")}</DropdownMenuLabel>
      {isMobile && !readOnly && memorySessionId !== null && <DropdownMenuItem data-session-memory-open onSelect={() => setMemoryOpen(true)}>
        <IconNotebook size={18} />{t("topics.memoryPanel")}{memoryCount !== null && <span>{memoryCount}</span>}
      </DropdownMenuItem>}
      {isMobile && canCompact && (!sessionBusy || isCompacting) && <DropdownMenuItem
        data-session-compact={isCompacting ? "running" : "idle"}
        onSelect={() => { void (isCompacting ? handleAbortCompaction() : handleCompact()); }}>
        {isCompacting ? <IconPlayerStop size={18} /> : <IconArrowsMinimize size={18} />}
        {isCompacting ? t("chat.stopCompaction") : t("chat.compactContext")}
      </DropdownMenuItem>}
      {isMobile && <DropdownMenuSeparator />}
      {!readOnly && <DropdownMenuCheckboxItem checked={promptCaptureEnabled} onSelect={event => event.preventDefault()} onCheckedChange={setPromptCaptureEnabled} data-prompt-capture-toggle>
        <IconCircleDot size={18} />{t("chat.recordPrompts")}
      </DropdownMenuCheckboxItem>}
      {onSoundToggle && <DropdownMenuCheckboxItem checked={soundEnabled} onCheckedChange={onSoundToggle}>
        <IconVolume size={18} />{t("chat.completionSound")}
      </DropdownMenuCheckboxItem>}
      {onPushToggle && <DropdownMenuCheckboxItem checked={pushStatus === "on"} onCheckedChange={onPushToggle}
        disabled={["checking", "unsupported", "enabling", "disabling", "denied"].includes(pushStatus)}>
        <IconBell size={18} />{t("chat.completionNotification")}
      </DropdownMenuCheckboxItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
  const compactAction = canCompact && (!sessionBusy || isCompacting) ? (
    <ToolbarAction
      label={isCompacting ? t("chat.stopCompaction") : t("chat.compactContext")}
      active={isCompacting}
      data-session-compact={isCompacting ? "running" : "idle"}
      onClick={() => { void (isCompacting ? handleAbortCompaction() : handleCompact()); }}
      icon={isCompacting ? <IconPlayerStop size={18} /> : <IconArrowsMinimize size={18} />}
    />
  ) : null;

  const chatInputElement = <>{readOnly ? (
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
    >{t("interface.this.session.is.read.only.execution.and.changes.are.unavailable")}</div>
  ) : browsingHistory ? (
    <div role="status" className="mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm">
      <span className="flex-1 text-text-muted">{t("sessionControls.browsing")}</span>
      <button className="rounded-md px-3 py-2 hover:bg-bg-hover" onClick={() => void handleReturnToCurrent()}>{t("sessionControls.returnCurrent")}</button>
      {canContinue && entryIds.at(-1) && !sessionBusy && <button className="rounded-md bg-accent px-3 py-2 text-white" onClick={() => void handleNavigate(entryIds.at(-1)!)}>{t("sessionControls.continueHere")}</button>}
    </div>
  ) : (
    <ChatInput
      key={session?.owner.type === "long-agent" ? composerDraftKey(session.id, true, contextProjectId) : "ordinary-composer"}
      ref={chatInputRef}
      projectId={projectId}
      onSend={handleSend}
      onAbort={isCompacting ? handleAbortCompaction : handleAbort}
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
      onCompact={canCompact ? () => { void handleCompact(); } : undefined}
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
      onAudioUnlock={unlockAudio}
      draftKey={composerDraftKey(session?.id, session?.owner.type === "long-agent", contextProjectId, newSessionDraftKey, deviceId, projectId)}
      cwd={session?.cwd ?? newSessionCwd}
    />
  )}</>;

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
        <InterfaceFeedback message={error} />
      </div>
    );
  }

  return (
    <ToolActivityContext value={{ tools: activity?.tools ?? {}, busy: sessionBusy }}>
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-rendered-session={data?.sessionId ?? undefined}
      data-rendered-message-count={messages.length}
      style={{ paddingBottom: readOnly ? "env(safe-area-inset-bottom)" : undefined }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {chatActionsSlot !== null && chatActionsSlot !== undefined && createPortal(
        <>{!isMobile && sessionMemoryAction}{!isMobile && compactAction}{settingsAction}</>, chatActionsSlot,
      )}
      {memoryOpen && memorySessionId !== null && (
        <SessionMemoryDialog
          onCount={sessionMemoryCount.setCount}
          onClose={() => setMemoryOpen(false)}
          sessionId={memorySessionId}
          storageProjectId={memoryStorageProjectId}
        />
      )}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-[drop-zone-in_0.15s_ease_both] items-center justify-center bg-[var(--accent-wash)] backdrop-blur-[1px]">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.8, 1.6].map((delay) => (
              <div
                key={delay}
                className="absolute h-[720px] w-[720px] rounded-full border-[1.5px] border-solid border-[var(--accent-outline)] animate-[drop-ripple_2.4s_ease-out_infinite_backwards]"
                style={{ transformOrigin: "center", animationDelay: `${delay}s` }}
              />
            ))}
          </div>
          <svg
            width="280" height="280" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_6px_18px_var(--accent-shadow)]"
          >
            <rect x="28" y="44" width="84" height="60" rx="8" fill="var(--accent-wash)" stroke="var(--accent-outline)" strokeWidth="1.8"/>
            <path d="M36 100 L54 72 L68 88 L80 74 L104 100Z" fill="var(--accent-wash)" stroke="var(--accent-outline)" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="96" cy="58" r="8" fill="var(--accent-shadow)" stroke="var(--accent-outline)" strokeWidth="1.6"/>
            <g stroke="var(--accent-outline)" strokeWidth="1.4" strokeLinecap="round">
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
          padding: isMobile ? "0 12px" : `0 ${CHAT_COLUMN_PADDING}px`,
          pointerEvents: "none",
        }}
      >
        <NoticeShelf notices={notices} floating />
      </div>

      {isEmptyChat ? (
        <div className={`chat-empty${isMobile ? " is-mobile" : ""}`}>
          <div className="w-full workspace-message-column chat-empty-column">
            <div className="chat-welcome">
              <div className="chat-welcome-brand"><span><IconMessageCircle size={24} aria-hidden="true" /></span>Chat</div>
              <h2>{t("chatDesign.welcomeTitle")}</h2>
              <p>{t("chatDesign.welcomeDescription")}</p>
              <small>{t("chatDesign.inputHint")}</small>
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
                    onFork={readOnly || sessionBusy || isNew || longAgentId !== null || (idx === 0 && msg.role === "user") ? undefined : handleFork}
                    forking={forkingEntryId === entryIds[idx]}
                    onNavigate={readOnly || sessionBusy || !canContinue ? undefined : handleNavigate}
                    prevAssistantEntryId={readOnly || sessionBusy ? undefined : prevAssistantEntryId}
                    onEditContent={readOnly ? undefined : handleEditContent}
                    showTimestamp={showTimestamp}
                    sessionId={session?.id ?? sessionIdRef.current ?? undefined}
                    projectId={projectId}
                    writtenFiles={options.writtenFiles}
                  />
                );
                const workflowAgentId = msg.role === "assistant"
                  ? (msg as AssistantMessage).chatWorkflow?.agentId
                  : undefined;
                // 完整 Prompt 内嵌：用户消息下挂本轮真实发出的 Provider 请求解析树（默认展开，可收起）。
                const userTurnId = msg.role === "user" && longAgentId !== null
                  ? (msg as { chatLongAgent?: { turnId?: string } }).chatLongAgent?.turnId ?? null
                  : null;
                const captureGroup = userTurnId === null ? undefined : captureGroups.get(userTurnId);
                const view = workflowAgentId === undefined
                  ? messageView
                  : (
                      <div key={`${keyPrefix}-workflow-${idx}`}>
                        <div className="pb-1 text-[11px] font-medium text-text-muted">
                          {workflowAgentId === "planner"
                            ? t("chat.plannerStage")
                            : (workflowAgentId === "pi-coding-agent" ? t("interface.pi.coding.agent")
                              : workflowAgentId === "session-memory-writer" ? t("sessionActivity.memoryWriter") : workflowAgentId)}
                        </div>
                        {messageView}
                      </div>
                    );
                const withCapture = captureGroup === undefined
                  ? view
                  : (<div key={`${keyPrefix}-capture-${idx}`} className="chat-message-with-capture">
                      {view}
                      <TurnPromptCaptures projectId={projectId} sessionId={captureSessionId ?? ""}
                        group={captureGroup} defaultExpanded={promptCaptureEnabled} />
                    </div>);
                if (!isVisible || options.attachRef === false || currentRefIdx === undefined) return withCapture;
                return (
                  <div key={`${keyPrefix}-${idx}`} ref={attachVisibleRef(currentRefIdx)}>
                    {withCapture}
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
                while (endIdx < messages.length && !isGroupAnchor(messages[endIdx]) && !isSessionActivity(messages[endIdx])) endIdx += 1;

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

                const memoryRound = messages.slice(userIdx + 1, endIdx).some(isSessionMemoryResponse);
                const processIndices = turnProcessIndices(messages, userIdx, memoryRound ? endIdx : finalAssistantIdx + 1, finalAssistantIdx);
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
                const processNodes = groupWorkflowProcess(messages, userIdx + 1, endIdx, toolResultsMap);
                const processContent = processNodes.some(node => node.stage) || visibleProcessIndices.length || finalProcessMessage ? <WorkflowProcess
                  nodes={processNodes} finalIndex={finalAssistantIdx} render={(processIdx) => !visibleProcessIndices.includes(processIdx) ? null : renderMessage(processIdx, {
                    attachRef: false, keyPrefix: "process",
                    ...(processIdx === finalAssistantIdx && finalProcessMessage
                      ? { messageOverride: finalProcessMessage, showTimestamp: false } : {}),
                  })} /> : undefined;
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
                  const writtenFiles = extractTurnWrittenFiles(turnContent, toolResultsMap, messageCwd, longAgentId ?? undefined);
                  rendered.push(renderMessage(finalAssistantIdx, { messageOverride: finalAnswerMessage, writtenFiles }));
                }
                for (let renderIdx = finalAssistantIdx + 1; !memoryRound && renderIdx < endIdx; renderIdx++) {
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
                  {/* Session-memory notices are rendered on their own: they are the only signal that a
                      round's memory was not written, so turn folding must never swallow them. */}
                  {messages.flatMap((message, index) => message.role === "custom"
                    && (message as CustomMessage).customType === "chat.session_memory_notice"
                    && !((message as CustomMessage).details && typeof (message as CustomMessage).details === "object"
                      && "status" in ((message as CustomMessage).details as object) && ((message as CustomMessage).details as { status: unknown }).status === "skipped")
                    ? [<MessageView key={`session-memory-notice-${String(index)}`} message={message} cwd={messageCwd} onOpenFile={onOpenFile} />]
                    : [])}
                </>
              );
            })()}
            {streamState.isStreaming && hasStreamingContent && streamState.streamingMessage && (
              <div>
                {activeRunStage && (
                  <div className="pb-1 text-[11px] font-medium text-text-muted">
                    {activeRunStage.agentId === "planner"
                      ? t("chat.plannerStage")
                      : (activeRunStage.agentId === "pi-coding-agent" ? t("interface.pi.coding.agent")
                        : activeRunStage.agentId === "session-memory-writer" ? t("sessionActivity.memoryWriter") : activeRunStage.agentId)}
                  </div>
                )}
                <MessageView message={streamState.streamingMessage as AgentMessage} isStreaming cwd={messageCwd} onOpenFile={onOpenFile} />
              </div>
            )}

            {longAgentId && !topicNode && (session?.id ?? sessionIdRef.current) && (
              <TopicCreationRequests key={`${longAgentId}:${session?.id ?? sessionIdRef.current}`}
                longAgentId={longAgentId} sourceSessionId={session?.id ?? sessionIdRef.current ?? undefined} />
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

      <div className="relative shrink-0" data-chat-footer>
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

/* v2.3: shelf chrome lives in components.css (.notice-shelf*); only the
   per-notice semantic dot + exit state stay inline. No geometry here. */
function NoticeShelf({ notices, floating = false }: { notices: NoticeItem[]; floating?: boolean }) {
  if (notices.length === 0) return null;
  return (
    <div className={`notice-shelf${floating ? " is-floating" : ""}`}>
      {notices.map((notice, index) => {
        const dot = notice.type === "error"
          ? "var(--danger)"
          : notice.type === "warning"
            ? "var(--warning)"
            : notice.type === "success"
              ? "var(--success)"
              : "var(--accent)";
        return (
          <div
            key={notice.id}
            className={`notice-shelf-item${floating ? " is-floating" : ""}${notice.exiting ? " is-exiting" : ""}${index === notices.length - 1 ? " is-last" : ""}`}
          >
            <span className="notice-shelf-dot" style={{ background: dot }} />
            <span className="notice-shelf-text">
              <InterfaceFeedback message={notice.message} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

type ExtensionDialogRequest = Extract<ExtensionUiRequest, { method: "select" | "confirm" | "input" | "editor" }>;

/**
 * A blocking request from an extension (UI/UX §18.4). It used to be a hand-rolled
 * overlay with its own scrim alpha, width, radius, shadow and z-index; it is now the
 * shared modal, so every reader in the app opens the same way and animates alike.
 */
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

  return <SurfaceDialog
    title={request.title}
    description={t("chat.extensionRequest")}
    onClose={() => onRespond(request, { cancelled: true })}
  >
    <div className="ui-scroll-20 ui-stack-16">
      {request.method === "confirm" && (
        <p className="ui-body">{request.message}</p>
      )}
      {request.method === "select" && (
        <div className="ui-stack-8">
          {request.options.map((option) => (
            <Button key={option} variant="secondary" type="button" className="workspace-button"
              onClick={() => onRespond(request, { value: option })}>
              {option}
            </Button>
          ))}
        </div>
      )}
      {request.method === "input" && (
        <input
          autoFocus
          value={value}
          placeholder={request.placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") submitValue(); }}
        />
      )}
      {request.method === "editor" && (
        <textarea
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submitValue(); }}
          style={{ minHeight: 220, resize: "vertical", fontFamily: "var(--font-mono)", lineHeight: 1.55 }}
        />
      )}
      <div className="ui-row-6" style={{ justifyContent: "flex-end" }}>
        <Button variant="secondary" type="button" className="workspace-button" onClick={() => onRespond(request, { cancelled: true })}>
          {t("chat.cancel")}
        </Button>
        {request.method !== "select" && (
          <Button variant="primary" type="button" className="workspace-button" onClick={submitValue}>
            {request.method === "confirm" ? t("chat.confirm") : t("chat.submit")}
          </Button>
        )}
      </div>
    </div>
  </SurfaceDialog>;
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

  // Terminal-style panel (UI/UX §18.4): the shared modal owns the shell, the backdrop,
  // the reveal and the layer; only the terminal body itself stays custom.
  return <SurfaceDialog title={t("chat.extensionPanel")} description={t("chat.extensionRequest")}
    onClose={() => onInput(request, "\x03")}>
    <div className="ui-scroll-20 ui-stack-8" onClick={(event) => {
      if (!(event.target as HTMLElement).closest("button")) inputRef.current?.focus();
    }}>
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
        onCompositionStart={() => { composingRef.current = true; }}
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
        style={{ position: "absolute", width: 1, height: 1, padding: 0, border: 0, opacity: 0, pointerEvents: "none" }}
      />
      <pre className="ui-body" style={{ margin: 0, padding: 14, background: "var(--bg-panel)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre" }}>
        {(displayLines.length ? displayLines : [""]).map((line, index, allLines) => (
          <Fragment key={index}>
            {renderAnsiLine(line, `line-${index}`)}
            {index < allLines.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </pre>
      <div className="ui-row-6" style={{ justifyContent: "flex-end" }}>
        <Button variant="secondary" type="button" className="workspace-button" onClick={() => onInput(request, "\x03")}>
          {t("chat.close")}
        </Button>
      </div>
    </div>
  </SurfaceDialog>;
}
