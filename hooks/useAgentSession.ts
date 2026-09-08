"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ChatInputHandle, AttachedImage } from "@/components/ChatInput";
import type {
  AgentMessage,
  BlockingExtensionUiRequest,
  ExtensionStatusItem,
  ExtensionUiRequest,
  ExtensionWidgetItem,
  SessionInfo,
  SessionTreeNode,
} from "@/lib/types";
import { clearDraft } from "@/lib/draft-store";
import {
  cancelChatWorkflowRun,
  resumeChatWorkflowRun,
  runChatWorkflowPrompt,
  submitPlanReviewDecision,
  type ChatWorkflowRunReference,
  type PlanReviewDecisionInput,
} from "@/lib/chat-workflow-browser";
import {
  parsePlanReview,
  workflowCallProgressText,
  type ChatRunEvent,
  type ChatRunStage,
  type PlanReview,
} from "@/lib/chat-workflow-events";
import {
  CHAT_WORKFLOW_ADAPTER_ENABLED,
  DEFAULT_CHAT_WORKFLOW_ID,
  parseAgentConfigSelection,
  type AgentConfigSelection,
  type ChatRootConfig,
  type ChatWorkflowId,
} from "@/lib/chat-workflow-contract";
import { fetchChatRootConfig, saveChatRootConfig } from "@/lib/chat-workflows-browser";
import {
  readWorkflowConfigDraft,
  removeWorkflowConfigDraft,
  removeSubmittedWorkflowConfig,
  writeWorkflowConfigDraft,
} from "@/lib/workflow-config-draft-store";
import { INITIAL_STREAMING_STATE, streamReducer } from "@/lib/streaming-message";
import type { ClientAssistantMessageEvent } from "@/lib/streaming-message";
import { normalizeToolCalls } from "@/lib/normalize";
import { getPreferredToolPreset } from "@/lib/tool-preset-preference";
import type { ToolEntry, ToolPreset } from "@/lib/tool-presets";
import type { SessionStatsInfo } from "@/lib/pi-types";
import {
  parseWorkflowCallProjection,
} from "@/lib/workflow-call-browser";
import type { WorkflowCallStatistics } from "@/lib/workflow-call-statistics";
import type { WorkflowCallTreeNode } from "@/lib/workflow-call-tree";
import {
  fetchLongAgents,
  sendLongAgentMessage,
  type LongAgentSummary,
} from "@/lib/long-agents-browser";
import { parseSessionInfo } from "@/lib/session-list-browser";
import { sessionLongAgentId } from "@/lib/session-owner";

export interface SessionData {
  session: SessionInfo;
  sessionId: string;
  filePath: string;
  totalActiveMs: number;
  tree: SessionTreeNode[];
  leafId: string | null;
  context: {
    messages: AgentMessage[];
    entryIds: string[];
    thinkingLevel: string;
    model: { provider: string; modelId: string } | null;
  };
  workflowConfigurations: Record<string, Record<string, AgentConfigSelection>>;
  workflowTurnConfigurations: WorkflowTurnConfiguration[];
  workflowCallStatistics: WorkflowCallStatistics;
  workflowCallTree: WorkflowCallTreeNode[];
  promptResourceProposals: PromptResourceProposal[];
  activePlanningExecution?: ChatWorkflowRunReference & {
    readonly workflowId: string;
    readonly phase: PlanningExecutionPhase;
    readonly review?: PlanReview;
  };
}

type PlanningExecutionPhase = "starting" | "planning" | "waiting_review" | "executing" | "completed" | "failed" | "cancelled";

export interface WorkflowTurnConfiguration {
  schemaVersion: 1;
  invocationId: string;
  workflowId: string;
  agentConfigs: Record<string, AgentConfigSelection>;
}

export interface PromptResourceProposal {
  id: string;
  invocationId: string;
  sourceWorkflowId: string;
  sourceAgentId: string;
  targetWorkflowId: string;
  targetAgentId: string;
  promptResources: NonNullable<AgentConfigSelection["promptResources"]>;
  summary: string;
  createdAt: string;
  resolution?: { status: "applied" | "dismissed"; resolvedAt: string };
}

export interface QueuedMessages {
  steering: string[];
  followUp: string[];
}

export interface CompactResultInfo {
  reason: "manual" | "threshold" | "overflow" | "auto" | string;
  tokensBefore: number;
  estimatedTokensAfter: number;
}

export interface SlashCommandInfo {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo?: {
    path: string;
    source: string;
    scope: "user" | "project" | "temporary";
    origin: "package" | "top-level";
    baseDir?: string;
  };
}

export type BuiltinSlashCommandResult =
  | { handled: false }
  | { handled: true; message?: string; error?: string; action?: "openSessionStats" };

export type ThinkingLevelOption = "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type AgentPhase =
  | { kind: "waiting_model" }
  | { kind: "workflow_stage"; stage: ChatRunStage }
  | { kind: "running_command" }
  | { kind: "running_tools"; tools: { id: string; name: string; progress?: string }[] }
  | null;

export type NoticeType = "info" | "success" | "warning" | "error";
export interface NoticeItem {
  id: string;
  message: string;
  type: NoticeType;
  exiting?: boolean;
}

interface UseAgentSessionOptions {
  projectId: string;
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
  onBranchDataChange?: (
    tree: SessionTreeNode[],
    activeLeafId: string | null,
    onLeafChange: (leafId: string | null) => void,
  ) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSystemPromptLoaderChange?: (loader: (() => Promise<void>) | null) => void;
  onSessionStatsPanelOpen?: () => void;
  setToolPreset?: (preset: ToolPreset) => void;
  onConnectionFailure?: () => Promise<boolean | null>;
}

interface ContextResponse {
  context?: SessionData["context"];
  error?: string;
}

interface ContextUsage {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
}

interface PendingBash {
  command: string;
  excludeFromContext: boolean;
}

const EMPTY_QUEUE: QueuedMessages = { steering: [], followUp: [] };
const NOTICE_VISIBLE_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseWorkflowConfigurations(value: unknown): Record<string, Record<string, AgentConfigSelection>> {
  if (!isRecord(value)) throw new Error("Chat返回了无效Session Workflow配置");
  const configurations: Record<string, Record<string, AgentConfigSelection>> = {};
  for (const [workflowId, rawAgents] of Object.entries(value)) {
    if (workflowId.trim() === "" || !isRecord(rawAgents)) throw new Error("Chat返回了无效Session Workflow配置");
    const agents: Record<string, AgentConfigSelection> = {};
    for (const [agentId, selection] of Object.entries(rawAgents)) {
      if (agentId.trim() === "") throw new Error("Chat返回了无效Session Agent配置");
      agents[agentId] = parseAgentConfigSelection(selection);
    }
    configurations[workflowId] = agents;
  }
  return configurations;
}

function parsePromptResourceProposal(value: unknown): PromptResourceProposal {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.invocationId)
    || !isNonEmptyString(value.sourceWorkflowId) || !isNonEmptyString(value.sourceAgentId)
    || !isNonEmptyString(value.targetWorkflowId) || !isNonEmptyString(value.targetAgentId)
    || !isNonEmptyString(value.summary) || !isNonEmptyString(value.createdAt)
    || Number.isNaN(Date.parse(value.createdAt))) {
    throw new Error("Chat返回了无效Prompt资源建议");
  }
  const promptResources = parseAgentConfigSelection({ promptResources: value.promptResources }).promptResources;
  if (promptResources === undefined || promptResources.length === 0) throw new Error("Chat返回了空Prompt资源建议");
  let resolution: PromptResourceProposal["resolution"];
  if (value.resolution !== undefined) {
    if (!isRecord(value.resolution)
      || (value.resolution.status !== "applied" && value.resolution.status !== "dismissed")
      || !isNonEmptyString(value.resolution.resolvedAt)
      || Number.isNaN(Date.parse(value.resolution.resolvedAt))) {
      throw new Error("Chat返回了无效Prompt资源建议状态");
    }
    resolution = { status: value.resolution.status, resolvedAt: value.resolution.resolvedAt };
  }
  return {
    id: value.id,
    invocationId: value.invocationId,
    sourceWorkflowId: value.sourceWorkflowId,
    sourceAgentId: value.sourceAgentId,
    targetWorkflowId: value.targetWorkflowId,
    targetAgentId: value.targetAgentId,
    promptResources,
    summary: value.summary,
    createdAt: value.createdAt,
    ...(resolution === undefined ? {} : { resolution }),
  };
}

function parseWorkflowTurnConfiguration(value: unknown): WorkflowTurnConfiguration {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isNonEmptyString(value.invocationId)
    || !isNonEmptyString(value.workflowId)) {
    throw new Error("Chat返回了无效Workflow Turn配置快照");
  }
  return {
    schemaVersion: 1,
    invocationId: value.invocationId,
    workflowId: value.workflowId,
    agentConfigs: parseWorkflowConfigurations({ workflow: value.agentConfigs }).workflow ?? {},
  };
}

function parseActivePlanningExecution(value: unknown, projectId: string): SessionData["activePlanningExecution"] {
  const phases = new Set<PlanningExecutionPhase>([
    "starting", "planning", "waiting_review", "executing", "completed", "failed", "cancelled",
  ]);
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isNonEmptyString(value.runId)
    || !isNonEmptyString(value.workflowId) || !isNonEmptyString(value.workflowInvocationId)
    || !phases.has(value.phase as PlanningExecutionPhase)) {
    throw new Error("Chat返回了无效的规划执行Run");
  }
  const review = value.review === undefined ? undefined : parsePlanReview(value.review);
  return {
    runId: value.runId,
    workflowId: value.workflowId,
    workflowInvocationId: value.workflowInvocationId,
    projectId,
    phase: value.phase as PlanningExecutionPhase,
    ...(review === undefined ? {} : { review }),
  };
}

function mergeWorkflowConfigurations(
  defaults: Record<string, Record<string, AgentConfigSelection>>,
  persisted: Record<string, Record<string, AgentConfigSelection>>,
  draft: ReturnType<typeof readWorkflowConfigDraft>,
): Record<string, Record<string, AgentConfigSelection>> {
  const merged = { ...defaults, ...persisted };
  for (const workflowId of draft?.dirtyWorkflowIds ?? []) {
    const configs = draft?.configs[workflowId];
    if (configs !== undefined) merged[workflowId] = configs;
  }
  return merged;
}

async function fetchSessionData(
  sessionId: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<SessionData> {
  const query = new URLSearchParams({ projectId, deferThinking: "1", deferMedia: "1" });
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`, {
    cache: "no-store",
    ...(signal === undefined ? {} : { signal }),
  });
  const body: unknown = await response.json().catch(() => null);
  const error = isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
  if (!response.ok) throw new Error(error);
  if (
    !isRecord(body)
    || !isRecord(body.session)
    || typeof body.sessionId !== "string"
    || typeof body.filePath !== "string"
    || !Array.isArray(body.tree)
    || !isRecord(body.context)
    || !Array.isArray(body.context.messages)
    || !Array.isArray(body.context.entryIds)
    || body.context.entryIds.some((entryId) => !isNonEmptyString(entryId))
    || typeof body.context.thinkingLevel !== "string"
    || (body.context.model !== null && (!isRecord(body.context.model)
      || typeof body.context.model.provider !== "string" || typeof body.context.model.modelId !== "string"))
    || !isRecord(body.workflowConfigurations)
    || !Array.isArray(body.workflowTurnConfigurations)
    || body.workflowCallStatistics === undefined
    || body.workflowCallTree === undefined
    || !Array.isArray(body.promptResourceProposals)
  ) {
    throw new Error("Chat返回了无效Session");
  }
  const workflowCallProjection = parseWorkflowCallProjection(body, body.sessionId);
  return {
    session: parseSessionInfo(body.session),
    sessionId: body.sessionId,
    filePath: body.filePath,
    totalActiveMs: typeof body.totalActiveMs === "number" ? body.totalActiveMs : 0,
    tree: body.tree as SessionTreeNode[],
    leafId: typeof body.leafId === "string" ? body.leafId : null,
    context: {
      messages: body.context.messages as AgentMessage[],
      entryIds: body.context.entryIds as string[],
      thinkingLevel: body.context.thinkingLevel,
      model: body.context.model as SessionData["context"]["model"],
    },
    workflowConfigurations: parseWorkflowConfigurations(body.workflowConfigurations),
    workflowTurnConfigurations: body.workflowTurnConfigurations.map(parseWorkflowTurnConfiguration),
    ...workflowCallProjection,
    promptResourceProposals: body.promptResourceProposals.map(parsePromptResourceProposal),
    ...(body.activePlanningExecution === undefined
      ? {}
      : { activePlanningExecution: parseActivePlanningExecution(body.activePlanningExecution, projectId) }),
  };
}

function createNoticeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hasLongAgentReply(messages: readonly AgentMessage[], messageId: string, longAgentId: string): boolean {
  const userIndex = messages.findIndex((message) => message.role === "user"
    && message.chatLongAgent?.messageId === messageId
    && message.chatLongAgent.longAgentId === longAgentId);
  if (userIndex < 0) return false;
  return messages.slice(userIndex + 1).some((message) => message.role === "assistant"
    && message.chatLongAgent?.longAgentId === longAgentId
    && message.chatLongAgent.direction === "out");
}

/**
 * Pi Web在这个分支中只负责页面与Chat Workflow协议适配。
 * 这里不创建AgentSession，也不连接Pi Web原有的Agent SSE接口。
 */
export function useAgentSession(opts: UseAgentSessionOptions) {
  const {
    projectId,
    session,
    newSessionCwd,
    newSessionDraftKey,
    onAgentEnd,
    onSessionCreated,
    onSessionOpen,
    onBranchDataChange,
    onSystemPromptChange,
    onSystemPromptLoaderChange,
    onSessionStatsPanelOpen,
    chatInputRef,
    onConnectionFailure,
  } = opts;
  const isNew = session === null && newSessionCwd !== null;
  const composerDraftKey = session?.id ?? newSessionDraftKey ?? undefined;
  const workflowConfigDraftKey = `${projectId}:${composerDraftKey ?? "new"}`;

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [streamState, dispatch] = useReducer(streamReducer, INITIAL_STREAMING_STATE);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentPhase, setAgentPhase] = useState<AgentPhase>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [workflowId, setWorkflowIdState] = useState<ChatWorkflowId>(DEFAULT_CHAT_WORKFLOW_ID);
  const [longAgentCatalog, setLongAgentCatalog] = useState<{
    readonly projectId: string | null;
    readonly agents: readonly LongAgentSummary[];
  }>(() => ({ projectId: null, agents: [] }));
  const longAgents = longAgentCatalog.projectId === projectId ? longAgentCatalog.agents : [];
  const longAgentId = sessionLongAgentId(session);
  const [agentConfigsByWorkflow, setAgentConfigsByWorkflow] = useState<
    Record<string, Record<string, AgentConfigSelection>>
  >({});
  const defaultAgentConfigsByWorkflowRef = useRef<Record<string, Record<string, AgentConfigSelection>>>({});
  const persistedAgentConfigsByWorkflowRef = useRef<Record<string, Record<string, AgentConfigSelection>>>({});
  const chatRootConfigRef = useRef<ChatRootConfig | null>(null);
  const configSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const [toolPreset] = useState<ToolPreset>(() => getPreferredToolPreset());
  const [thinkingLevel] = useState<ThinkingLevelOption>("auto");
  const [promptAnchorActive, setPromptAnchorActive] = useState(false);
  const [activeRunStage, setActiveRunStage] = useState<ChatRunStage | null>(null);
  const [planReview, setPlanReview] = useState<PlanReview | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const sessionIdRef = useRef<string | null>(session?.id ?? null);
  const sessionLoadAbortRef = useRef<AbortController | null>(null);
  const workflowAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const pendingScrollToUserRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const mountedRef = useRef(true);
  const initialNewSessionDraftKeyRef = useRef(isNew ? newSessionDraftKey : null);
  const handleAgentEventRef = useRef<(event: { type: string; [key: string]: unknown }) => void>(() => {});
  const activeRunStageRef = useRef<ChatRunStage | null>(null);
  const activeWorkflowRunRef = useRef<ChatWorkflowRunReference | null>(null);
  const receivedFinalAssistantRef = useRef(false);

  useEffect(() => {
    persistedAgentConfigsByWorkflowRef.current = {};
    const controller = new AbortController();
    void fetchChatRootConfig(projectId, controller.signal).then((config) => {
      chatRootConfigRef.current = config;
      setWorkflowIdState(config.defaultWorkflowId);
      const defaults = Object.fromEntries(
        Object.entries(config.workflows).map(([id, workflow]) => [id, { ...workflow.agents }]),
      );
      defaultAgentConfigsByWorkflowRef.current = defaults;
      setAgentConfigsByWorkflow(mergeWorkflowConfigurations(
        defaults,
        persistedAgentConfigsByWorkflowRef.current,
        readWorkflowConfigDraft(workflowConfigDraftKey),
      ));
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Failed to load .chat/config.json", error);
      }
    });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    setLongAgentCatalog({ projectId, agents: [] });
    void fetchLongAgents(projectId, controller.signal).then((result) => {
      if (!mountedRef.current || controller.signal.aborted) return;
      setLongAgentCatalog({ projectId, agents: [...result.agents] });
    }).catch((cause: unknown) => {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        console.error("Failed to load LongAgents", cause);
      }
    });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    if (!isNew) return;
    persistedAgentConfigsByWorkflowRef.current = {};
    setAgentConfigsByWorkflow(mergeWorkflowConfigurations(
      defaultAgentConfigsByWorkflowRef.current,
      {},
      readWorkflowConfigDraft(workflowConfigDraftKey),
    ));
  }, [isNew, workflowConfigDraftKey]);

  const persistChatRootConfig = useCallback((next: ChatRootConfig) => {
    chatRootConfigRef.current = next;
    configSaveChainRef.current = configSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const saved = await saveChatRootConfig(next, projectId);
        if (chatRootConfigRef.current === next) chatRootConfigRef.current = saved;
      })
      .catch((error: unknown) => {
        console.error("Failed to save .chat/config.json", error);
      });
  }, [projectId]);

  const applySessionData = useCallback((
    body: SessionData,
    submittedAdjustment?: { workflowId: string; configs: Record<string, AgentConfigSelection> },
  ) => {
    sessionIdRef.current = body.sessionId;
    setData(body);
    setMessages(body.context.messages);
    setEntryIds(body.context.entryIds);
    setActiveLeafId(body.leafId);
    activeWorkflowRunRef.current = body.activePlanningExecution === undefined
      ? null
      : {
          runId: body.activePlanningExecution.runId,
          workflowInvocationId: body.activePlanningExecution.workflowInvocationId,
          projectId,
        };
    setPlanReview(body.activePlanningExecution?.review ?? null);
    persistedAgentConfigsByWorkflowRef.current = body.workflowConfigurations;

    const currentDraft = readWorkflowConfigDraft(workflowConfigDraftKey);
    const remainingDraft = submittedAdjustment === undefined
      ? currentDraft
      : removeSubmittedWorkflowConfig(
          currentDraft,
          submittedAdjustment.workflowId,
          submittedAdjustment.configs,
        );
    const remainingDirty = remainingDraft?.dirtyWorkflowIds ?? [];
    const remainingConfigs = Object.fromEntries(
      remainingDirty.flatMap((workflow) => {
        const configs = remainingDraft?.configs[workflow];
        return configs === undefined ? [] : [[workflow, configs] as const];
      }),
    );
    const targetDraftKey = `${projectId}:${body.sessionId}`;
    writeWorkflowConfigDraft(targetDraftKey, {
      configs: remainingConfigs,
      dirtyWorkflowIds: remainingDirty,
    });
    if (targetDraftKey !== workflowConfigDraftKey) removeWorkflowConfigDraft(workflowConfigDraftKey);
    setAgentConfigsByWorkflow(mergeWorkflowConfigurations(
      defaultAgentConfigsByWorkflowRef.current,
      body.workflowConfigurations,
      remainingDirty.length === 0 ? null : { configs: remainingConfigs, dirtyWorkflowIds: remainingDirty },
    ));
  }, [projectId, workflowConfigDraftKey]);

  const addNotice = useCallback((notice: { message: string; type: NoticeType }) => {
    const item = { ...notice, id: createNoticeId() };
    setNotices((current) => [...current.slice(-4), item]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((candidate) => candidate.id !== item.id));
    }, NOTICE_VISIBLE_MS);
  }, []);

  const restoreSubmission = useCallback((message: string, images?: AttachedImage[]) => {
    chatInputRef?.current?.restoreSubmission(
      message,
      images?.map(({ data: imageData, mimeType }) => ({ data: imageData, mimeType })),
      composerDraftKey,
    );
  }, [chatInputRef, composerDraftKey]);

  const showActiveStage = useCallback(() => {
    const stage = activeRunStageRef.current;
    setAgentPhase(stage === null ? { kind: "waiting_model" } : { kind: "workflow_stage", stage });
  }, []);

  const handleRunEvent = useCallback((runEvent: ChatRunEvent) => {
    const stage = runEvent.stage;
    if (
      activeRunStageRef.current?.workflowId !== stage.workflowId
      || activeRunStageRef.current.stageId !== stage.stageId
      || activeRunStageRef.current.agentId !== stage.agentId
    ) {
      activeRunStageRef.current = stage;
      setActiveRunStage(stage);
    }
    if (runEvent.type === "stage_start") {
      dispatch({ type: "end" });
      setAgentPhase({ kind: "workflow_stage", stage });
      return;
    }
    if (runEvent.type === "review_required") {
      sessionIdRef.current = runEvent.review.sessionId;
      setPlanReview(runEvent.review);
      setReviewSubmitting(false);
      dispatch({ type: "end" });
      setAgentPhase({ kind: "workflow_stage", stage });
      return;
    }

    const event = runEvent.event;
    if (event.type === "agent_start") {
      dispatch({ type: "start" });
      setAgentPhase({ kind: "workflow_stage", stage });
      return;
    }
    if (event.type === "message_start") {
      const message = event.message as AgentMessage | undefined;
      if (message?.role === "assistant") {
        dispatch({ type: "snapshot", message });
        if (message.content.length > 0) setAgentPhase(null);
      }
      return;
    }
    if (event.type === "message_update") {
      const delta = event.assistantMessageEvent as ClientAssistantMessageEvent | undefined;
      if (delta !== undefined) {
        dispatch({ type: "delta", event: delta });
        if (delta.type !== "toolcall_start" && delta.type !== "toolcall_delta") {
          setAgentPhase(null);
        }
      }
      return;
    }
    if (event.type === "message_end") {
      const message = event.message as AgentMessage | undefined;
      if (message !== undefined && message.role !== "user") {
        const displayedMessage = message.role === "assistant" && stage.agentId !== undefined
          ? {
              ...message,
              chatWorkflow: {
                invocationId: "live",
                workflowId: stage.workflowId,
                stageId: stage.stageId,
                agentId: stage.agentId,
              },
            }
          : message;
        setMessages((current) => [...current, normalizeToolCalls(displayedMessage)]);
        if (
          stage.agentId !== "planner"
          &&
          message.role === "assistant"
          && message.stopReason !== "toolUse"
          && message.content.some((part) => part.type === "text" && part.text.trim() !== "")
        ) {
          receivedFinalAssistantRef.current = true;
        }
      }
      dispatch({ type: "end" });
      showActiveStage();
      return;
    }
    if (event.type === "tool_execution_start") {
      const id = typeof event.toolCallId === "string" ? event.toolCallId : "";
      const name = typeof event.toolName === "string" ? event.toolName : "tool";
      setAgentPhase((current) => {
        const tools = current?.kind === "running_tools" ? [...current.tools] : [];
        if (!tools.some((tool) => tool.id === id)) tools.push({ id, name });
        return { kind: "running_tools", tools };
      });
      return;
    }
    if (event.type === "tool_execution_update") {
      const id = typeof event.toolCallId === "string" ? event.toolCallId : "";
      const name = typeof event.toolName === "string" ? event.toolName : "tool";
      const progress = workflowCallProgressText(event);
      setAgentPhase((current) => {
        const tools = current?.kind === "running_tools" ? [...current.tools] : [];
        const index = tools.findIndex((tool) => tool.id === id);
        if (index === -1) tools.push({ id, name, ...(progress === undefined ? {} : { progress }) });
        else tools[index] = { ...tools[index], name, ...(progress === undefined ? {} : { progress }) };
        return { kind: "running_tools", tools };
      });
      return;
    }
    if (event.type === "tool_execution_end") {
      const id = typeof event.toolCallId === "string" ? event.toolCallId : "";
      setAgentPhase((current) => {
        if (current?.kind !== "running_tools") return { kind: "workflow_stage", stage };
        const tools = current.tools.filter((tool) => tool.id !== id);
        return tools.length === 0 ? { kind: "workflow_stage", stage } : { kind: "running_tools", tools };
      });
    }
  }, [showActiveStage]);

  const loadSession = useCallback(async (sessionId: string) => {
    sessionLoadAbortRef.current?.abort();
    const controller = new AbortController();
    sessionLoadAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const body = await fetchSessionData(sessionId, projectId, controller.signal);
      if (!mountedRef.current || sessionLoadAbortRef.current !== controller) return;
      applySessionData(body);
    } catch (cause) {
      if (mountedRef.current && sessionLoadAbortRef.current === controller
        && !(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (mountedRef.current && sessionLoadAbortRef.current === controller) {
        sessionLoadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [applySessionData, projectId]);

  const loadContext = useCallback(async (leafId: string | null) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    const query = new URLSearchParams({ projectId, deferThinking: "1", deferMedia: "1" });
    if (leafId) query.set("leafId", leafId);
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/context?${query.toString()}`, {
      cache: "no-store",
    });
    const body = await response.json() as ContextResponse;
    if (!response.ok || !body.context) throw new Error(body.error ?? `HTTP ${response.status}`);
    setMessages(body.context.messages);
    setEntryIds(body.context.entryIds);
    setActiveLeafId(leafId);
  }, [projectId]);

  const handleSend = useCallback(async (message: string, images?: AttachedImage[]) => {
    const prompt = message.trim();
    if (!prompt && !images?.length) return;
    if (agentRunning) {
      restoreSubmission(message, images);
      return;
    }
    if (!CHAT_WORKFLOW_ADAPTER_ENABLED) {
      restoreSubmission(message, images);
      addNotice({ type: "error", message: "Chat Workflow Adapter未启用" });
      return;
    }
    const targetCwd = session?.cwd ?? newSessionCwd;
    if (!targetCwd) {
      restoreSubmission(message, images);
      addNotice({ type: "warning", message: "请先选择工作目录" });
      return;
    }
    if (images?.length && longAgentId !== null) {
      restoreSubmission(message, images);
      addNotice({ type: "warning", message: "当前长期 Agent只接受文本消息" });
      return;
    }
    if (prompt.startsWith("/") || prompt.startsWith("!")) {
      restoreSubmission(message, images);
      addNotice({
        type: "warning",
        message: longAgentId === null ? "当前Workflow只接受普通文本Prompt" : "当前长期 Agent只接受普通文本消息",
      });
      return;
    }

    const selectedLongAgent = longAgentId === null
      ? undefined
      : longAgents.find((candidate) => candidate.id === longAgentId);
    if (longAgentId !== null && selectedLongAgent === undefined) {
      restoreSubmission(message, images);
      addNotice({ type: "error", message: `找不到长期 Agent：${longAgentId}` });
      return;
    }
    if (selectedLongAgent !== undefined && !selectedLongAgent.available) {
      restoreSubmission(message, images);
      addNotice({ type: "error", message: `长期 Agent ${selectedLongAgent.name}当前不在线，请检查 NanoClaw 服务` });
      return;
    }

    const userMessage: AgentMessage = {
      role: "user",
      // Keep image blocks in the optimistic message so the transcript renders
      // the attachments before the durable Session read replaces them.
      content: images?.length
        ? [
            { type: "text", text: message },
            ...images.map((image) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: image.mimeType, data: image.data },
            })),
          ]
        : message,
      timestamp: Date.now(),
    };
    setMessages((current) => [...current, userMessage]);
    setAgentRunning(true);
    setAgentPhase({ kind: "waiting_model" });
    setPromptAnchorActive(true);
    pendingScrollToUserRef.current = true;
    dispatch({ type: "start" });
    activeRunStageRef.current = null;
    setActiveRunStage(null);
    activeWorkflowRunRef.current = null;
    setPlanReview(null);
    receivedFinalAssistantRef.current = false;

    const controller = new AbortController();
    workflowAbortRef.current = controller;
    let longAgentAccepted = false;
    try {
      if (selectedLongAgent !== undefined) {
        const activeDedicatedSessionId = selectedLongAgent.project?.primarySessionId;
        const accepted = await sendLongAgentMessage({
          longAgentId: selectedLongAgent.id,
          projectId,
          ...(activeDedicatedSessionId !== null
            && activeDedicatedSessionId !== undefined
            && activeDedicatedSessionId === sessionIdRef.current
            ? { sessionId: activeDedicatedSessionId }
            : {}),
          text: message,
        }, controller.signal);
        longAgentAccepted = true;
        const previousSessionId = sessionIdRef.current;
        sessionIdRef.current = accepted.sessionId;
        if (accepted.isNewSession && newSessionDraftKey !== null) {
          const now = new Date().toISOString();
          onSessionCreated?.({
            path: "",
            id: accepted.sessionId,
            cwd: targetCwd,
            created: now,
            modified: now,
            messageCount: 1,
            firstMessage: message,
            owner: {
              type: "long-agent",
              longAgentId: selectedLongAgent.id,
              projectLongAgentId: accepted.projectLongAgentId,
            },
            projectRoot: targetCwd,
            projectAvailable: true,
            projectKey: projectId,
            projectId,
            transient: false,
            sessionSource: "chat",
            readOnly: false,
          }, newSessionDraftKey);
        } else if (previousSessionId !== accepted.sessionId) {
          await onSessionOpen?.(accepted.sessionId);
          if (composerDraftKey) clearDraft(composerDraftKey);
          return;
        }

        const refreshed = await fetchSessionData(accepted.sessionId, projectId, controller.signal);
        if (!mountedRef.current) return;
        applySessionData(refreshed);
        const replied = hasLongAgentReply(refreshed.context.messages, accepted.messageId, selectedLongAgent.id);
        if (!replied) {
          addNotice({
            type: "warning",
            message: `长期 Agent ${selectedLongAgent.name}已完成，但Session尚未显示对应回复，请刷新重试`,
          });
        }
        onAgentEnd?.();
        if (composerDraftKey) clearDraft(composerDraftKey);
        return;
      }

      const workflowDraft = readWorkflowConfigDraft(workflowConfigDraftKey);
      const hasWorkflowAdjustment = workflowDraft?.dirtyWorkflowIds.includes(workflowId) === true;
      const submittedAgentConfigs = hasWorkflowAdjustment
        ? structuredClone(agentConfigsByWorkflow[workflowId] ?? {})
        : undefined;
      const workflow = await runChatWorkflowPrompt(
        {
          projectId,
          cwd: targetCwd,
          prompt: message,
          ...(images?.length
            ? {
                images: images.map((image) => ({
                  type: "image" as const,
                  data: image.data,
                  mimeType: image.mimeType,
                })),
              }
            : {}),
          workflow: workflowId,
          ...(!hasWorkflowAdjustment
            ? {}
            : { agentConfigs: submittedAgentConfigs }),
          ...(sessionIdRef.current === null ? {} : { sessionId: sessionIdRef.current }),
        },
        controller.signal,
        handleRunEvent,
        (reference) => {
          activeWorkflowRunRef.current = reference;
          sessionIdRef.current = reference.sessionId;
          if (reference.isNewSession && newSessionDraftKey !== null) {
            const now = new Date().toISOString();
            onSessionCreated?.({
              path: "",
              id: reference.sessionId,
              cwd: targetCwd,
              created: now,
              modified: now,
              messageCount: 1,
              firstMessage: message,
              owner: { type: "ordinary" },
              projectRoot: targetCwd,
              projectAvailable: true,
              projectKey: projectId,
              projectId,
              transient: false,
              sessionSource: "chat",
              readOnly: false,
            }, newSessionDraftKey);
          }
        },
      );
      if (!mountedRef.current) return;
      const model = workflow.result.model;
      activeWorkflowRunRef.current = null;
      setPlanReview(null);
      sessionIdRef.current = workflow.result.sessionId;
      if (!receivedFinalAssistantRef.current) {
        setMessages((current) => [...current, {
          role: "assistant",
          content: [{ type: "text", text: workflow.result.text }],
          provider: model?.provider ?? "unknown",
          model: model?.modelId ?? "unknown",
          timestamp: Date.now(),
        }]);
      }

      try {
        const refreshed = await fetchSessionData(workflow.result.sessionId, projectId);
        if (!mountedRef.current) return;
        applySessionData(
          refreshed,
          submittedAgentConfigs === undefined ? undefined : { workflowId, configs: submittedAgentConfigs },
        );
        if (newSessionDraftKey) {
          onSessionCreated?.(refreshed.session, newSessionDraftKey);
        }
      } catch (cause) {
        addNotice({
          type: "warning",
          message: `Workflow已完成，但读取Session失败：${cause instanceof Error ? cause.message : String(cause)}`,
        });
      }
      if (composerDraftKey) clearDraft(composerDraftKey);
      onAgentEnd?.();
    } catch (cause) {
      if (!mountedRef.current) return;
      if (!longAgentAccepted) {
        setMessages((current) => {
          const index = current.lastIndexOf(userMessage);
          return index < 0 ? current : [...current.slice(0, index), ...current.slice(index + 1)];
        });
        restoreSubmission(message, images);
      }
      if (cause instanceof DOMException && cause.name === "AbortError") {
        addNotice({
          type: "info",
          message: longAgentAccepted ? "已停止等待；长期 Agent仍在后台处理，回复会同步到Session" : "已断开Workflow连接",
        });
      } else {
        const availability = await onConnectionFailure?.().catch(() => null);
        if (availability !== false) {
          addNotice({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
        }
      }
    } finally {
      if (workflowAbortRef.current === controller) workflowAbortRef.current = null;
      if (mountedRef.current) {
        setAgentRunning(false);
        setAgentPhase(null);
        activeRunStageRef.current = null;
        setActiveRunStage(null);
        setPromptAnchorActive(false);
        dispatch({ type: "end" });
      }
    }
  }, [addNotice, agentConfigsByWorkflow, agentRunning, applySessionData, composerDraftKey, handleRunEvent, longAgentId, longAgents, newSessionCwd, newSessionDraftKey, onAgentEnd, onConnectionFailure, onSessionCreated, onSessionOpen, projectId, restoreSubmission, session?.cwd, workflowConfigDraftKey, workflowId]);

  const handlePlanReviewDecision = useCallback(async (decision: PlanReviewDecisionInput) => {
    const reference = activeWorkflowRunRef.current;
    const review = planReview;
    if (reference === null || review === null || reviewSubmitting) return;
    setReviewSubmitting(true);
    try {
      await submitPlanReviewDecision(reference, review, decision);
      setPlanReview(null);
      // The next durable event supplies the target Workflow's actual downstream
      // Stage; do not invent planning-execution-specific topology here.
      setAgentPhase({ kind: "waiting_model" });
    } catch (cause) {
      addNotice({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setReviewSubmitting(false);
    }
  }, [addNotice, planReview, reviewSubmitting]);

  const setWorkflowId = useCallback((nextWorkflowId: ChatWorkflowId) => {
    setWorkflowIdState(nextWorkflowId);
    const current = chatRootConfigRef.current;
    if (current !== null && current.defaultWorkflowId !== nextWorkflowId) {
      persistChatRootConfig({ ...current, defaultWorkflowId: nextWorkflowId });
    }
  }, [persistChatRootConfig]);

  const setWorkflowAgentConfigs = useCallback((configs: Record<string, AgentConfigSelection>) => {
    setAgentConfigsByWorkflow((current) => ({ ...current, [workflowId]: configs }));
    const existing = readWorkflowConfigDraft(workflowConfigDraftKey);
    writeWorkflowConfigDraft(workflowConfigDraftKey, {
      configs: { ...(existing?.configs ?? {}), [workflowId]: configs },
      dirtyWorkflowIds: [...new Set([...(existing?.dirtyWorkflowIds ?? []), workflowId])],
    });
  }, [workflowConfigDraftKey, workflowId]);

  const handleAbort = useCallback(() => {
    const run = activeWorkflowRunRef.current;
    if (run !== null) {
      void cancelChatWorkflowRun(run).catch((cause: unknown) => {
        addNotice({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
      });
    }
    workflowAbortRef.current?.abort();
    activeWorkflowRunRef.current = null;
    setPlanReview(null);
  }, [addNotice]);
  const unsupported = useCallback((message: string) => addNotice({ type: "info", message }), [addNotice]);
  const handleFork = useCallback(async () => unsupported("当前Workflow模式尚未接入Session分支"), [unsupported]);
  const handleNavigate = useCallback((leafId: string) => {
    void loadContext(leafId).catch((cause) => addNotice({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    }));
  }, [addNotice, loadContext]);
  const handleLeafChange = useCallback((leafId: string | null) => {
    void loadContext(leafId).catch((cause) => addNotice({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    }));
  }, [addNotice, loadContext]);
  const handleCompact = useCallback(async () => unsupported("上下文压缩由Chat Workflow负责"), [unsupported]);
  const handleAbortCompaction = useCallback(async () => {}, []);
  const handleSteer = useCallback((message: string, images?: AttachedImage[]) => {
    restoreSubmission(message, images);
    unsupported("当前Workflow不支持运行中追加消息");
  }, [restoreSubmission, unsupported]);
  const handleFollowUp = handleSteer;
  const handlePromptWithStreamingBehavior = useCallback((message: string, _behavior: "steer" | "followUp", images?: AttachedImage[]) => {
    handleSteer(message, images);
  }, [handleSteer]);
  const handleRecallQueue = useCallback(() => {}, []);
  const handleBuiltinSlashCommand = useCallback(async (): Promise<BuiltinSlashCommandResult> => ({
    handled: true,
    error: longAgentId === null ? "当前Workflow只接受普通文本Prompt" : "当前长期 Agent只接受普通文本消息",
  }), [longAgentId]);
  const handleToolPresetChange = useCallback(() => unsupported("工具权限由Chat Workflow配置决定"), [unsupported]);
  const handleThinkingLevelChange = useCallback(() => unsupported("Thinking Level由Chat Workflow配置决定"), [unsupported]);
  const loadTools = useCallback(async (): Promise<ToolEntry[]> => [], []);
  const loadSlashCommands = useCallback(async (): Promise<SlashCommandInfo[]> => [], []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);
  const scrollUserMsgToTop = useCallback(() => {
    const container = scrollContainerRef.current;
    const message = lastUserMsgRef.current;
    if (!container || !message) return;
    const top = message.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
    container.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionLoadAbortRef.current?.abort();
      sessionLoadAbortRef.current = null;
      workflowAbortRef.current?.abort();
      workflowAbortRef.current = null;
      const initialDraftKey = initialNewSessionDraftKeyRef.current;
      if (initialDraftKey !== null) clearDraft(initialDraftKey);
    };
  }, []);

  useEffect(() => {
    if (session === null) return;
    sessionIdRef.current = session.id;
    if (workflowAbortRef.current === null && data?.sessionId !== session.id) {
      void loadSession(session.id);
    }
  }, [data?.sessionId, loadSession, session]);

  useEffect(() => {
    const active = data?.activePlanningExecution;
    if (active === undefined || workflowAbortRef.current !== null) return;
    const reference: ChatWorkflowRunReference = {
      runId: active.runId,
      workflowInvocationId: active.workflowInvocationId,
      projectId,
    };
    const controller = new AbortController();
    workflowAbortRef.current = controller;
    activeWorkflowRunRef.current = reference;
    setPlanReview(active.review ?? null);
    setAgentRunning(true);
    setAgentPhase(active.phase === "waiting_review"
      ? {
          kind: "workflow_stage",
          stage: { workflowId: active.workflowId, stageId: "review", nodeKind: "task" },
        }
      : { kind: "waiting_model" });

    void resumeChatWorkflowRun(reference, controller.signal, handleRunEvent)
      .then(async (workflow) => {
        if (!mountedRef.current) return;
        activeWorkflowRunRef.current = null;
        setPlanReview(null);
        const refreshed = await fetchSessionData(workflow.result.sessionId, projectId);
        if (!mountedRef.current) return;
        applySessionData(refreshed);
        onAgentEnd?.();
      })
      .catch((cause: unknown) => {
        if (!mountedRef.current || (cause instanceof DOMException && cause.name === "AbortError")) return;
        activeWorkflowRunRef.current = null;
        setPlanReview(null);
        addNotice({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
      })
      .finally(() => {
        if (workflowAbortRef.current === controller) workflowAbortRef.current = null;
        if (mountedRef.current) {
          setAgentRunning(false);
          setAgentPhase(null);
          activeRunStageRef.current = null;
          setActiveRunStage(null);
          dispatch({ type: "end" });
        }
      });

    return () => {
      if (workflowAbortRef.current === controller) controller.abort();
    };
  }, [addNotice, applySessionData, data?.activePlanningExecution, handleRunEvent, onAgentEnd, projectId]);

  useEffect(() => {
    onSystemPromptChange?.(null);
    const loader = async () => onSystemPromptChange?.(null);
    onSystemPromptLoaderChange?.(loader);
    return () => onSystemPromptLoaderChange?.(null);
  }, [onSystemPromptChange, onSystemPromptLoaderChange]);

  useEffect(() => {
    onBranchDataChange?.(data?.tree ?? [], activeLeafId, handleLeafChange);
  }, [activeLeafId, data?.tree, handleLeafChange, onBranchDataChange]);

  useLayoutEffect(() => {
    if (!initialScrollDoneRef.current && messages.length > 0) {
      initialScrollDoneRef.current = true;
      scrollToBottom("instant");
    }
  }, [messages.length, scrollToBottom]);

  const sessionStats = useMemo<SessionStatsInfo | null>(() => null, []);

  return {
    data, loading, error, activeLeafId, messages, entryIds, streamState,
    agentRunning, workflowId, longAgents, longAgentId,
    workflowAgentConfigs: agentConfigsByWorkflow[workflowId] ?? {}, toolPreset, thinkingLevel,
    promptResourceProposals: data?.promptResourceProposals ?? [],
    retryInfo: null, contextUsage: null as ContextUsage | null, systemPrompt: null, forkingEntryId: null,
    isCompacting: false, compactError: null, compactResult: null,
    sessionStats,
    slashCommands: [] as SlashCommandInfo[], slashCommandsLoading: false,
    queuedMessages: EMPTY_QUEUE, notices,
    extensionDialog: null as Extract<ExtensionUiRequest, { method: "select" | "confirm" | "input" | "editor" }> | null,
    extensionCustomUi: null as Extract<ExtensionUiRequest, { method: "custom" }> | null,
    extensionStatuses: [] as ExtensionStatusItem[], extensionWidgets: [] as ExtensionWidgetItem[],
    respondToExtensionUi: () => {}, sendExtensionCustomInput: () => {},
    agentPhase, activeRunStage, planReview, reviewSubmitting, isNew, promptAnchorActive,
    sessionIdRef, messagesEndRef, scrollContainerRef, lastUserMsgRef,
    pendingScrollToUserRef, initialScrollDoneRef,
    handleSend, handleAbort, handlePlanReviewDecision, handleFork, handleNavigate,
    handleCompact, handleSteer, handleFollowUp, handlePromptWithStreamingBehavior,
    handleAbortCompaction, handleRecallQueue, handleBuiltinSlashCommand,
    handleToolPresetChange, handleThinkingLevelChange, loadTools, loadSlashCommands,
    setWorkflowId, setWorkflowAgentConfigs,
    setActiveLeafId, setData, setMessages, scrollToBottom, scrollUserMsgToTop,
    dispatch, setAgentRunning, setForkingEntryId: () => {},
    bashRunning: false, pendingBash: null as PendingBash | null, handleAgentEventRef,
    onSessionStatsPanelOpen,
  };
}
