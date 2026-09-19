"use client";

import {
  readFriendCapabilities,
  acceptFriendMessage,
  steerFriendExecution,
  followFriendExecution,
  cancelFriendExecution,
  parseFriendExecution,
  type FriendExecution,
} from "@/lib/friend-execution";

import {
  useCallback,
  useEffect,
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
import { setDraft } from "@/lib/draft-store";
import { readPendingSubmission, retainPendingSubmission, clearPendingSubmission } from "@/lib/pending-submission";
import {
  cancelChatWorkflowRun,
  workflowRequestSignal,
  WorkflowTerminalError,
  type WorkflowConnectionUpdate,
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
import type { SessionStatsInfo } from "@/lib/pi-types";
import {
  parseWorkflowCallProjection,
} from "@/lib/workflow-call-browser";
import type { WorkflowCallStatistics } from "@/lib/workflow-call-statistics";
import type { WorkflowCallTreeNode } from "@/lib/workflow-call-tree";
import {
  fetchLongAgents,
  type LongAgentSummary,
} from "@/lib/long-agents-browser";
import { parseSessionInfo } from "@/lib/session-list-browser";
import { sessionLongAgentId } from "@/lib/session-owner";
import { forkSession } from "@/lib/session-fork-browser";
import { getBuiltinSlashCommand } from "@/lib/builtin-slash-commands";

import { createRunActivity, changeRunPhase, reduceRunActivity, type RunActivity, type RunPhase } from "@/lib/run-activity";

import { composerDraftKey as resolveComposerDraftKey } from "@/lib/composer-context";
import { parseLongAgentActivity, type LongAgentActivity } from "@/lib/long-agent-activity";
import { parseEntryTimes } from "@/lib/turn-summary";
import { parseWorkflowOutcome, type WorkflowOutcome } from "@/lib/workflow-outcome";

export interface SessionData {
  longAgentActivity?: LongAgentActivity;
  friendExecution?: FriendExecution;
  workflowOutcome?: WorkflowOutcome;
  session: SessionInfo;
  sessionId: string;
  filePath: string;
  totalActiveMs: number;
  tree: SessionTreeNode[];
  leafId: string | null;
  context: {
    messages: AgentMessage[];
    entryIds: string[];
    entryTimes?: (number | null)[];
    thinkingLevel: string;
    model: { provider: string; modelId: string } | null;
  };
  workflowConfigurations: Record<string, Record<string, AgentConfigSelection>>;
  workflowTurnConfigurations: WorkflowTurnConfiguration[];
  workflowCallStatistics: WorkflowCallStatistics;
  workflowCallTree: WorkflowCallTreeNode[];
  promptResourceProposals: PromptResourceProposal[];
  activeWorkflowRun?: SessionData["activePlanningExecution"];
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
  /** 顶栏上下文项目（B1）：随消息传给 Long Agent，仅注入提示词。 */
  deviceId?: string;
  contextProjectId?: string | null;
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
    signal: workflowRequestSignal(signal),
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
    || body.context.messages.length !== body.context.entryIds.length
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
    workflowOutcome: parseWorkflowOutcome(body.workflowOutcome),
    session: parseSessionInfo(body.session),
    sessionId: body.sessionId,
    filePath: body.filePath,
    totalActiveMs: typeof body.totalActiveMs === "number" ? body.totalActiveMs : 0,
    tree: body.tree as SessionTreeNode[],
    leafId: typeof body.leafId === "string" ? body.leafId : null,
    context: {
      messages: body.context.messages as AgentMessage[],
      entryIds: body.context.entryIds as string[],
      entryTimes: parseEntryTimes(body.context.entryTimes, body.context.entryIds.length),
      thinkingLevel: body.context.thinkingLevel,
      model: body.context.model as SessionData["context"]["model"],
    },
    ...(body.friendExecution === undefined ? {} : { friendExecution: parseFriendExecution(body.friendExecution) }),
    ...(body.longAgentActivity === undefined ? {} : { longAgentActivity: parseLongAgentActivity(body.longAgentActivity) }),
    workflowConfigurations: parseWorkflowConfigurations(body.workflowConfigurations),
    workflowTurnConfigurations: body.workflowTurnConfigurations.map(parseWorkflowTurnConfiguration),
    ...workflowCallProjection,
    promptResourceProposals: body.promptResourceProposals.map(parsePromptResourceProposal),
    ...(body.activeWorkflowRun === undefined ? {} : { activeWorkflowRun: parseActivePlanningExecution(body.activeWorkflowRun, projectId) }),
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



/**
 * Pi Web在这个分支中只负责页面与Chat Workflow协议适配。
 * 这里不创建AgentSession，也不连接Pi Web原有的Agent SSE接口。
 */
export function useAgentSession(opts: UseAgentSessionOptions) {
  const {
    projectId,
    contextProjectId,
    deviceId,
    session,
    newSessionCwd,
    newSessionDraftKey,
    onAgentEnd,
    onSessionCreated,
    onSessionOpen,
    onSessionForked,
    onBranchDataChange,
    onSystemPromptChange,
    onSystemPromptLoaderChange,
    onSessionStatsPanelOpen,
    chatInputRef,
    onConnectionFailure,
  } = opts;
  const isNew = session === null && newSessionCwd !== null;
  const composerDraftKey = resolveComposerDraftKey(session?.id, session?.owner.type === "long-agent", contextProjectId, newSessionDraftKey, deviceId, projectId);
  const workflowConfigDraftKey = `${projectId}:${composerDraftKey ?? "new"}`;

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [forkingEntryId, setForkingEntryId] = useState<string | null>(null);
  const forkRequestRef = useRef<{ sessionId: string; entryId: string; requestId: string } | null>(null);
  const browsingHistoryRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [entryTimes, setEntryTimes] = useState<(number | null)[]>([]);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [streamState, dispatch] = useReducer(streamReducer, INITIAL_STREAMING_STATE);
  const friendExecutionRef = useRef<FriendExecution | null>(null);
  const [friendExecution, setFriendExecution] = useState<FriendExecution | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [activity, setActivity] = useState<RunActivity | null>(null);
  const stoppingRef = useRef(false);
  const setRunPhase = useCallback((phase: RunPhase) => {
    setActivity(current => current === null ? createRunActivity(phase) : changeRunPhase(current, phase));
  }, []);
  const handleConnection = useCallback((update: WorkflowConnectionUpdate) => {
    setActivity(current => current === null ? current : update.kind === "confirmed"
      ? (update.at - (current.confirmedAt ?? 0) < 3000 && !current.streamLost ? current : { ...current, confirmedAt: update.at, streamLost: false }) : { ...current, streamLost: true });
  }, []);
  const [agentPhase, setAgentPhase] = useState<AgentPhase>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [workflowId, setWorkflowIdState] = useState<ChatWorkflowId>(DEFAULT_CHAT_WORKFLOW_ID);
  const [longAgentCatalog, setLongAgentCatalog] = useState<{
    readonly projectId: string | null;
    readonly agents: readonly LongAgentSummary[];
  }>(() => ({ projectId: null, agents: [] }));
  const longAgents = longAgentCatalog.projectId === projectId ? longAgentCatalog.agents : [];
  const longAgentId = sessionLongAgentId(session);
  const [friendImages, setFriendImages] = useState(false);

  const [agentConfigsByWorkflow, setAgentConfigsByWorkflow] = useState<
    Record<string, Record<string, AgentConfigSelection>>
  >({});
  const defaultAgentConfigsByWorkflowRef = useRef<Record<string, Record<string, AgentConfigSelection>>>({});
  const persistedAgentConfigsByWorkflowRef = useRef<Record<string, Record<string, AgentConfigSelection>>>({});
  const chatRootConfigRef = useRef<ChatRootConfig | null>(null);
  const configSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const [activeRunStage, setActiveRunStage] = useState<ChatRunStage | null>(null);
  const [planReview, setPlanReview] = useState<PlanReview | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const sessionIdRef = useRef<string | null>(session?.id ?? null);
  const sessionLoadAbortRef = useRef<AbortController | null>(null);
  const workflowAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
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
    if (body.friendExecution) { friendExecutionRef.current = body.friendExecution; setFriendExecution(body.friendExecution); }
    if (workflowAbortRef.current === null && body.longAgentActivity) {
      const recovered = body.longAgentActivity;
      setAgentRunning(recovered.status === "running");
      if (recovered.status !== "idle") {
        const phase = recovered.status === "running" ? "long_agent" : recovered.status === "completed" ? "completed" : recovered.status === "cancelled" ? "cancelled" : "failed";
        setActivity(current => current?.phase === phase && current.error === (recovered.error ?? undefined) ? current : {
          ...createRunActivity(phase), ...(recovered.error ? { error: recovered.error } : {}),
        });
      }
    }

    if (workflowAbortRef.current === null && body.activeWorkflowRun === undefined && body.workflowOutcome) {
      const outcome = body.workflowOutcome;
      setActivity(current => current?.phase === outcome.status && current.error === outcome.error ? current
        : { ...createRunActivity(outcome.status), ...(outcome.error ? { error: outcome.error } : {}) });
    }
    setMessages(body.context.messages);
    setEntryIds(body.context.entryIds);
    setEntryTimes(parseEntryTimes(body.context.entryTimes, body.context.entryIds.length));
    setActiveLeafId(body.leafId);
    const recoveredRun = body.activeWorkflowRun ?? body.activePlanningExecution;
    activeWorkflowRunRef.current = recoveredRun === undefined
      ? null
      : {
          runId: recoveredRun.runId,
          workflowInvocationId: recoveredRun.workflowInvocationId,
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

  useEffect(() => {
    setFriendImages(false);
    if (longAgentId === null) return;
    const controller = new AbortController();
    void readFriendCapabilities(longAgentId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setFriendImages(value.images);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          addNotice({
            type: "warning",
            message: `Friend能力读取失败，附件暂不可用：${cause instanceof Error ? cause.message : String(cause)}`,
          });
      });
    return () => controller.abort();
  }, [longAgentId, addNotice]);

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
    setActivity(current => reduceRunActivity(current ?? createRunActivity("starting"), runEvent));
    const stage = runEvent.stage;
    const waitingPhase: AgentPhase = stage === undefined ? { kind: "waiting_model" } : { kind: "workflow_stage", stage };
    if (
      stage !== undefined && (activeRunStageRef.current?.workflowId !== stage.workflowId
      || activeRunStageRef.current.stageId !== stage.stageId
      || activeRunStageRef.current.agentId !== stage.agentId)
    ) {
      activeRunStageRef.current = stage;
      setActiveRunStage(stage);
    }
    if (runEvent.type === "stage_start") {
      dispatch({ type: "end" });
      setAgentPhase(waitingPhase);
      return;
    }
    if (runEvent.type === "review_required") {
      sessionIdRef.current = runEvent.review.sessionId;
      setPlanReview(runEvent.review);
      setReviewSubmitting(false);
      dispatch({ type: "end" });
      setAgentPhase(waitingPhase);
      return;
    }

    const event = runEvent.event;
    if (event.type === "agent_start") {
      dispatch({ type: "start" });
      setAgentPhase(waitingPhase);
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
      if (message !== undefined && (message.role !== "user" || stage === undefined)) {
        const displayedMessage = message.role === "assistant" && stage?.agentId !== undefined
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
          stage?.agentId !== "planner"
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
        if (current?.kind !== "running_tools") return waitingPhase;
        const tools = current.tools.filter((tool) => tool.id !== id);
        return tools.length === 0 ? waitingPhase : { kind: "running_tools", tools };
      });
    }
  }, [showActiveStage]);

  const observeFriend = useCallback(
    async (reference: FriendExecution, controller: AbortController) => {
      friendExecutionRef.current = reference;
      setFriendExecution(reference);
      setAgentRunning(true);
      setActivity(createRunActivity("starting"));
      let terminal: "completed" | "failed" | "cancelled" | undefined;
      try {
        await followFriendExecution(reference, controller.signal, {
          event: handleRunEvent,
          connection: handleConnection,
          status: (next) => {
            if (!controller.signal.aborted) {
              friendExecutionRef.current = next;
              setFriendExecution(next);
            }
          },
          snapshot: (snapshot) => {
            if (controller.signal.aborted) return;
            setMessages(snapshot.messages.map(normalizeToolCalls));
            setEntryIds([]);
            setEntryTimes([]);
            dispatch({ type: "end" });
            handleRunEvent({ type: "agent_event", event: snapshot.phase });
            if (snapshot.partial?.role === "assistant") dispatch({ type: "snapshot", message: snapshot.partial });
          },
        });
        terminal = "completed";
      } catch (cause) {
        if (cause instanceof WorkflowTerminalError) terminal = cause.status;
        else throw cause;
        if (terminal !== "cancelled")
          addNotice({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
      } finally {
        if (!controller.signal.aborted && mountedRef.current) {
          if (terminal !== undefined) {
            setRunPhase("syncing");
            try {
              const refreshed = await fetchSessionData(reference.sessionId, reference.projectId, controller.signal);
              if (!controller.signal.aborted) applySessionData(refreshed);
            } catch (cause) {
              if (!controller.signal.aborted)
                addNotice({
                  type: "warning",
                  message: `执行已结束，历史同步失败：${cause instanceof Error ? cause.message : String(cause)}`,
                });
            }
            setRunPhase(terminal);
            onAgentEnd?.();
          }
          setAgentRunning(false);
          setAgentPhase(null);
          dispatch({ type: "end" });
        }
      }
    },
    [addNotice, applySessionData, handleConnection, handleRunEvent, onAgentEnd, setRunPhase],
  );

  const loadSession = useCallback(async (sessionId: string) => {
    browsingHistoryRef.current = false;
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
    browsingHistoryRef.current = true;
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
    setEntryTimes(parseEntryTimes(body.context.entryTimes, body.context.entryIds.length));
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
    if (getBuiltinSlashCommand(prompt) || prompt.startsWith("!")) {
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
      addNotice({ type: "error", message: `长期 Agent ${selectedLongAgent.name}已停用，请在同事设置中检查启用状态` });
      return;
    }

    if (composerDraftKey && readPendingSubmission(composerDraftKey)) {
      restoreSubmission(message, images);
      addNotice({ type: "warning", message: "上次发送尚未确认，请先核对会话并处理保留的文字，再发送新消息" });
      return;
    }
    // Keep user input until an explicit server acceptance. UI clearing is only visual.
    const pendingId = composerDraftKey
      ? retainPendingSubmission(composerDraftKey, message, images?.length ?? 0)
      : null;
    const confirmSubmission = () => {
      if (composerDraftKey && pendingId) clearPendingSubmission(composerDraftKey, pendingId);
    };

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
    setActivity(createRunActivity(longAgentId === null ? "submitting" : "long_agent"));
    setAgentPhase({ kind: "waiting_model" });
    dispatch({ type: "start" });
    activeRunStageRef.current = null;
    setActiveRunStage(null);
    activeWorkflowRunRef.current = null;
    setPlanReview(null);
    receivedFinalAssistantRef.current = false;

    const controller = new AbortController();
    workflowAbortRef.current = controller;
    let longAgentAccepted = false;
    let workflowAccepted = false;
    try {
      if (selectedLongAgent !== undefined) {
        const accepted = await acceptFriendMessage(selectedLongAgent.id, {
          requestId: pendingId ?? crypto.randomUUID(),
          ...(sessionIdRef.current === null ? {} : { sessionId: sessionIdRef.current }),
          text: message, contextProjectId: contextProjectId ?? null,
          ...(images?.length ? { images: images.map(image => ({ type: "image" as const, data:image.data, mimeType:image.mimeType })) } : {}),
        }, controller.signal);
        longAgentAccepted = true;
        confirmSubmission();
        sessionIdRef.current = accepted.sessionId;
        await observeFriend(accepted, controller);
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
          workflowAccepted = true;
          confirmSubmission();
          setRunPhase("starting");
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
        handleConnection,
      );
      if (!mountedRef.current) return;
      setRunPhase("syncing");
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
        setRunPhase("syncing");
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
      setRunPhase("completed");
      onAgentEnd?.();
    } catch (cause) {
      if (!mountedRef.current) return;
      if (!longAgentAccepted && !workflowAccepted) {
        setMessages((current) => {
          const index = current.lastIndexOf(userMessage);
          return index < 0 ? current : [...current.slice(0, index), ...current.slice(index + 1)];
        });
        restoreSubmission(message, images);
      }
      setRunPhase(cause instanceof WorkflowTerminalError ? cause.status
        : longAgentId !== null && cause instanceof DOMException && cause.name === "AbortError" ? "detached" : "disconnected");
      if (cause instanceof WorkflowTerminalError) activeWorkflowRunRef.current = null;
      if (cause instanceof DOMException && cause.name === "AbortError") {
        addNotice({
          type: "info",
          message: longAgentId !== null ? "已停止等待；长期 Agent仍在后台处理，回复会同步到Session" : "已断开Workflow连接",
        });
      } else if (cause instanceof WorkflowTerminalError) {
        addNotice({ type: cause.status === "cancelled" ? "info" : "error", message: cause.status === "cancelled" ? "任务已停止" : cause.message });
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
        dispatch({ type: "end" });
      }
    }
  }, [observeFriend, setRunPhase, handleConnection, addNotice, agentConfigsByWorkflow, agentRunning, applySessionData, composerDraftKey, handleRunEvent, longAgentId, longAgents, newSessionCwd, newSessionDraftKey, onAgentEnd, onConnectionFailure, onSessionCreated, onSessionOpen, projectId, contextProjectId, restoreSubmission, session?.cwd, workflowConfigDraftKey, workflowId]);

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
    if (stoppingRef.current) return;
    if (run !== null) {
      stoppingRef.current = true;
      setRunPhase("stopping");
      void cancelChatWorkflowRun(run).then(() => {
        // Keep following until Runtime confirms its terminal status.
        addNotice({ type: "info", message: "任务已取消，正在同步结果" });
      }).catch((cause: unknown) => {
        if (activeWorkflowRunRef.current?.runId !== run.runId) return;
        setRunPhase("continuing");
        addNotice({ type: "error", message: `停止未确认：${cause instanceof Error ? cause.message : String(cause)}` });
      }).finally(() => { stoppingRef.current = false; });
      return;
    }
    const friend = friendExecutionRef.current;
    if (friend !== null) {
      stoppingRef.current = true; setRunPhase("stopping");
      void cancelFriendExecution(friend).catch((cause:unknown) => {
        setRunPhase("continuing"); addNotice({type:"error",message:`停止未确认：${cause instanceof Error ? cause.message : String(cause)}`});
      }).finally(()=>{stoppingRef.current=false;});
      return;
    }
    workflowAbortRef.current?.abort();
    setPlanReview(null);
  }, [addNotice, setRunPhase]);
  const unsupported = useCallback((message: string) => addNotice({ type: "info", message }), [addNotice]);
  const handleFork = useCallback(async (entryId: string) => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId || forkingEntryId !== null || agentRunning || longAgentId !== null) return;
    setForkingEntryId(entryId);
    try {
      if (forkRequestRef.current?.sessionId !== currentSessionId || forkRequestRef.current.entryId !== entryId) {
        forkRequestRef.current = { sessionId: currentSessionId, entryId, requestId: crypto.randomUUID() };
      }
      const result = await forkSession(projectId, currentSessionId, entryId, forkRequestRef.current.requestId);
      setDraft(result.sessionId, { value: result.selectedText, images: [] });
      onSessionForked?.(result.sessionId);
    } catch (cause) {
      addNotice({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
    } finally { setForkingEntryId(null); }
  }, [addNotice, agentRunning, forkingEntryId, longAgentId, onSessionForked, projectId]);
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
  const sendDuringExecution = useCallback(
    async (message: string, behavior: "steer" | "followUp", images?: AttachedImage[]) => {
      const reference = friendExecutionRef.current;
      if (longAgentId === null || reference === null) {
        restoreSubmission(message, images);
        unsupported("当前Workflow不支持运行中追加消息");
        return;
      }
      if (behavior === "steer" && images?.length) {
        restoreSubmission(message, images);
        unsupported("图片请使用后续消息发送");
        return;
      }
      const pendingId = composerDraftKey
        ? retainPendingSubmission(composerDraftKey, message, images?.length ?? 0)
        : crypto.randomUUID();
      try {
        if (behavior === "steer") {
          const result = await steerFriendExecution(reference, {
            requestId: pendingId,
            text: message,
            contextProjectId: contextProjectId ?? null,
          });
          addNotice({
            type: "info",
            message: result.delivery === "steer" ? "引导已接受，将在下一模型轮次生效" : "当前轮已结束，已转为后续消息",
          });
        } else {
          await acceptFriendMessage(longAgentId, {
            requestId: pendingId,
            sessionId: reference.sessionId,
            text: message,
            contextProjectId: contextProjectId ?? null,
            ...(images?.length
              ? {
                  images: images.map((image) => ({ type: "image" as const, data: image.data, mimeType: image.mimeType })),
                }
              : {}),
          });
          addNotice({ type: "info", message: "后续消息已进入队列，当前轮结束后执行" });
        }
        if (composerDraftKey) clearPendingSubmission(composerDraftKey, pendingId);
      } catch (cause) {
        restoreSubmission(message, images);
        addNotice({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
      }
    },
    [addNotice, composerDraftKey, contextProjectId, longAgentId, restoreSubmission, unsupported],
  );
  const handleSteer = useCallback(
    (message: string, images?: AttachedImage[]) => {
      void sendDuringExecution(message, "steer", images);
    },
    [sendDuringExecution],
  );
  const handleFollowUp = useCallback(
    (message: string, images?: AttachedImage[]) => {
      void sendDuringExecution(message, "followUp", images);
    },
    [sendDuringExecution],
  );
  const handlePromptWithStreamingBehavior = useCallback(
    (message: string, behavior: "steer" | "followUp", images?: AttachedImage[]) => {
      void sendDuringExecution(message, behavior, images);
    },
    [sendDuringExecution],
  );

  const handleRecallQueue = useCallback(() => {}, []);
  const handleBuiltinSlashCommand = useCallback(async (message: string): Promise<BuiltinSlashCommandResult> => {
    const command = getBuiltinSlashCommand(message);
    if (!command) return { handled: false };
    const error = `当前会话不支持 /${command.name} 命令，请改用界面操作或普通文字描述；输入已保留`;
    addNotice({ type: "warning", message: error });
    return { handled: true, error };
  }, [addNotice]);
  const loadSlashCommands = useCallback(async (): Promise<SlashCommandInfo[]> => [], []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionLoadAbortRef.current?.abort();
      sessionLoadAbortRef.current = null;
      workflowAbortRef.current?.abort();
      workflowAbortRef.current = null;
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
    const active = data?.activeWorkflowRun ?? data?.activePlanningExecution;
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
    setActivity(createRunActivity("starting"));
    setAgentPhase(active.phase === "waiting_review"
      ? {
          kind: "workflow_stage",
          stage: { workflowId: active.workflowId, stageId: "review", nodeKind: "task" },
        }
      : { kind: "waiting_model" });

    void resumeChatWorkflowRun(reference, controller.signal, handleRunEvent, handleConnection)
      .then(async (workflow) => {
        if (!mountedRef.current) return;
        activeWorkflowRunRef.current = null;
        setPlanReview(null);
        setRunPhase("syncing");
        try {
          const refreshed = await fetchSessionData(workflow.result.sessionId, projectId);
          if (!mountedRef.current) return;
          applySessionData(refreshed);
        } catch (cause) {
          if (!mountedRef.current) return;
          addNotice({ type: "warning", message: `Workflow已完成，但读取Session失败：${cause instanceof Error ? cause.message : String(cause)}` });
        }
        setRunPhase("completed");
        onAgentEnd?.();
      })
      .catch((cause: unknown) => {
        if (!mountedRef.current || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setRunPhase(cause instanceof WorkflowTerminalError ? cause.status : "disconnected");
        if (cause instanceof WorkflowTerminalError) activeWorkflowRunRef.current = null;
        setPlanReview(null);
        addNotice({ type: cause instanceof WorkflowTerminalError && cause.status === "cancelled" ? "info" : "error", message: cause instanceof Error ? cause.message : String(cause) });
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
  }, [setRunPhase, handleConnection, addNotice, applySessionData, data?.activeWorkflowRun, data?.activePlanningExecution, handleRunEvent, onAgentEnd, projectId]);

  useEffect(() => {
    const active = data?.friendExecution;
    if (
      active === undefined ||
      !["queued", "running"].includes(active.status) ||
      workflowAbortRef.current !== null ||
      browsingHistoryRef.current
    )
      return;
    const controller = new AbortController();
    workflowAbortRef.current = controller;
    void observeFriend(active, controller)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setRunPhase("disconnected");
          addNotice({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
        }
      })
      .finally(() => {
        if (workflowAbortRef.current === controller) workflowAbortRef.current = null;
      });
    return () => controller.abort();
  }, [data?.friendExecution?.id, data?.friendExecution?.status, observeFriend, addNotice, setRunPhase]);

  // External clients can create turns while this page is open. Preserve composer drafts and history browsing.
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let refreshFailed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        if (document.visibilityState === "visible" && workflowAbortRef.current === null && !browsingHistoryRef.current) {
          const body = await fetchSessionData(session.id, projectId, controller.signal);
          if (!stopped && sessionIdRef.current === session.id && workflowAbortRef.current === null) applySessionData(body);
        }
        refreshFailed = false;
      } catch (cause) {
        if (!stopped && !refreshFailed) {
          refreshFailed = true;
          addNotice({ type: "error", message: `会话同步中断，将自动重试：${cause instanceof Error ? cause.message : String(cause)}` });
        }
      }
      if (!stopped) timer = setTimeout(refresh, 3000);
    };
    timer = setTimeout(refresh, 3000);
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [addNotice, applySessionData, longAgentId, projectId, session?.id]);

  useEffect(() => {
    onSystemPromptChange?.(null);
    const loader = async () => onSystemPromptChange?.(null);
    onSystemPromptLoaderChange?.(loader);
    return () => onSystemPromptLoaderChange?.(null);
  }, [onSystemPromptChange, onSystemPromptLoaderChange]);

  useEffect(() => {
    onBranchDataChange?.(data?.tree ?? [], activeLeafId, handleLeafChange);
  }, [activeLeafId, data?.tree, handleLeafChange, onBranchDataChange]);

  const sessionStats = useMemo<SessionStatsInfo | null>(() => null, []);

  return {
    data, loading, error, activeLeafId, messages, entryIds, entryTimes, streamState,
    agentRunning, workflowId, longAgents, longAgentId, friendExecution, friendImages,
    workflowAgentConfigs: agentConfigsByWorkflow[workflowId] ?? {},
    promptResourceProposals: data?.promptResourceProposals ?? [],
    retryInfo: null, contextUsage: null as ContextUsage | null, systemPrompt: null, forkingEntryId,
    isCompacting: false, compactError: null, compactResult: null,
    sessionStats,
    slashCommands: [] as SlashCommandInfo[], slashCommandsLoading: false,
    queuedMessages: EMPTY_QUEUE, notices,
    extensionDialog: null as Extract<ExtensionUiRequest, { method: "select" | "confirm" | "input" | "editor" }> | null,
    extensionCustomUi: null as Extract<ExtensionUiRequest, { method: "custom" }> | null,
    extensionStatuses: [] as ExtensionStatusItem[], extensionWidgets: [] as ExtensionWidgetItem[],
    respondToExtensionUi: () => {}, sendExtensionCustomInput: () => {},
    activity, agentPhase, activeRunStage, planReview, reviewSubmitting, isNew,
    sessionIdRef,
    handleSend, handleAbort, handlePlanReviewDecision, handleFork, handleNavigate,
    handleCompact, handleSteer, handleFollowUp, handlePromptWithStreamingBehavior,
    handleAbortCompaction, handleRecallQueue, handleBuiltinSlashCommand,
    loadSlashCommands,
    setWorkflowId, setWorkflowAgentConfigs,
    setActiveLeafId, setData, setMessages,
    dispatch, setAgentRunning, setForkingEntryId: () => {},
    bashRunning: false, pendingBash: null as PendingBash | null, handleAgentEventRef,
    onSessionStatsPanelOpen,
  };
}
