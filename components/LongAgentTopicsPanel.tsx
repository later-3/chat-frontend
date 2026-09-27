"use client";
import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { SessionInfo } from "@/lib/types";
import {
  fetchSessionMemory,
  fetchTopicDetail,
  fetchTopicGraph,
  fetchTopicNodeAnchors,
  fetchTopicNodeSession,
  followTopicNodeTurn,
  supplementTopicNode,
  type TopicAnchor,
  type TopicDetail,
  type TopicSummary,
} from "@/lib/topics-browser";
import { ChatWindow } from "./ChatWindow";
import { SurfaceDialog } from "./SurfaceDialog";
import { TopicCreationRequests } from "./TopicCreationRequests";
import { TopicsGraph } from "./TopicsGraph";
import { startTopicCreation, type TopicCreationRequest } from "@/lib/topic-creation";
import styles from "./LongAgentTopicsPanel.module.css";

interface Props {
  readonly initialAgentId: string;
  readonly agents: readonly { readonly id: string; readonly name: string }[];
}

interface MemoryEntryView { entryId: string; purpose: string; author: string; content: string; status: string }
interface NodeState { anchors: TopicAnchor[]; memory: { revision: number; entries: MemoryEntryView[] } | null; loading: boolean }

function readStoredSelection(longAgentId: string): { topicId: string | null; nodeId: string | null } {
  try {
    const query = new URLSearchParams(window.location.search);
    if (query.get("topicAgent") === longAgentId && query.has("topicId") && query.has("nodeId")) {
      return { topicId: query.get("topicId"), nodeId: query.get("nodeId") };
    }
    const parsed: unknown = JSON.parse(localStorage.getItem(`chat:topics:${longAgentId}`) ?? "null");
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as { topicId?: unknown; nodeId?: unknown };
      return { topicId: typeof record.topicId === "string" ? record.topicId : null, nodeId: typeof record.nodeId === "string" ? record.nodeId : null };
    }
  } catch { /* A missing/broken selection just falls back to the first node. */ }
  return { topicId: null, nodeId: null };
}

export function LongAgentTopicsPanel({ initialAgentId, agents }: Props) {
  const { t } = useI18n();
  // The forest shows EVERY Long Agent as a root; selecting a node may switch the active agent, which is
  // what all data loading below uses.
  const [activeAgentId, setActiveAgentId] = useState(initialAgentId);
  const longAgentId = activeAgentId;
  const activeAgentRef = useRef(longAgentId);
  activeAgentRef.current = longAgentId;
  const detailRequestRef = useRef(0);
  const [allGraphs, setAllGraphs] = useState<{ agentId: string; agentName: string; topics: TopicSummary[] }[]>([]);
  const stored = useMemo(() => readStoredSelection(longAgentId), [longAgentId]);
  const [graph, setGraph] = useState<{ revision: number; topics: TopicSummary[] } | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(stored.topicId);
  const [navigationOpen, setNavigationOpen] = useState(stored.nodeId === null);
  // Node details are separate from the shared session-memory entry.
  const [auxView, setAuxView] = useState<"details" | null>(null);
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(stored.nodeId);
  const selectedNode = detail?.nodes.find((node) => node.nodeId === selectedNodeId);
  const nodeSessionId = selectedNode?.sessionId;
  const nodeTitle = selectedNode?.title;
  const memoryTarget = `${longAgentId}/${selectedTopicId}/${selectedNodeId}`;
  const memoryTargetRef = useRef(memoryTarget);
  memoryTargetRef.current = memoryTarget;
  const [nodeState, setNodeState] = useState<NodeState | null>(null);
  const [nodeSession, setNodeSession] = useState<SessionInfo | null>(null);
  const [nodeSessionError, setNodeSessionError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPurpose, setNewPurpose] = useState("");
  const [forkTitle, setForkTitle] = useState("");
  const [forkAnchor, setForkAnchor] = useState<TopicAnchor | null>(null);
  const [supplementProduct, setSupplementProduct] = useState<"memory" | "relay">("memory");
  const [supplementContent, setSupplementContent] = useState("");
  const [supplementParent, setSupplementParent] = useState<string>("");
  const [supplementParentAnchors, setSupplementParentAnchors] = useState<TopicAnchor[]>([]);
  const [supplementAnchor, setSupplementAnchor] = useState<TopicAnchor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [integrating, setIntegrating] = useState<string | null>(null);
  const [creationRequestId, setCreationRequestId] = useState<string | null>(null);
  // Narrow screens prioritise the conversation: the map is collapsed unless the user opens it.
  const [mapVisible, setMapVisible] = useState<boolean>(() => typeof window === "undefined" || !window.matchMedia("(max-width: 959px)").matches);

  // The selection is UI state only; the graph, nodes, messages and memory are always re-read from the server.
  useEffect(() => {
    try { localStorage.setItem(`chat:topics:${longAgentId}`, JSON.stringify({ topicId: selectedTopicId, nodeId: selectedNodeId })); } catch { /* Selection is not a server fact. */ }
    const url = new URL(window.location.href);
    if (url.searchParams.get("topicAgent") === longAgentId && selectedTopicId && selectedNodeId) {
      url.searchParams.set("topicId", selectedTopicId); url.searchParams.set("nodeId", selectedNodeId);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [longAgentId, selectedTopicId, selectedNodeId]);

  const graphRevisionForForest = graph?.revision;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(agents.map(async (agent) => ({
      agentId: agent.id, agentName: agent.name,
      topics: (await fetchTopicGraph(agent.id, controller.signal)).topics,
    }))).then((next) => { if (!controller.signal.aborted) setAllGraphs(next); })
      .catch(() => { /* the map is navigation only; a failed group never blanks the session */ });
    return () => controller.abort();
  }, [agents, graphRevisionForForest]);

  const loadGraph = useCallback(async (signal?: AbortSignal) => {
    const next = await fetchTopicGraph(longAgentId, signal);
    if (!signal?.aborted && activeAgentRef.current === longAgentId) setGraph(next);
    return next;
  }, [longAgentId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadGraph(controller.signal).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [loadGraph]);

  const loadDetail = useCallback(async (topicId: string, signal?: AbortSignal): Promise<TopicDetail> => {
    const request = ++detailRequestRef.current;
    const next = await fetchTopicDetail(longAgentId, topicId, signal);
    if (signal?.aborted || activeAgentRef.current !== longAgentId || request !== detailRequestRef.current) return next;
    setDetail(next);
    // Auto-select the first node so an existing topic is immediately enterable (never a dead end).
    setSelectedNodeId((current) => current !== null && next.nodes.some((node) => node.nodeId === current) ? current : next.nodes[0]?.nodeId ?? null);
    return next;
  }, [longAgentId]);

  useEffect(() => {
    if (selectedTopicId === null) { setDetail(null); setNodeState(null); return; }
    const controller = new AbortController();
    void loadDetail(selectedTopicId, controller.signal).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [selectedTopicId, loadDetail]);

  const loadNodeState = useCallback(async (topicId: string, nodeId: string, sessionId: string, signal?: AbortSignal) => {
    const target = `${longAgentId}/${topicId}/${nodeId}`;
    setNodeState({ anchors: [], memory: null, loading: true });
    try {
      const [anchors, mem] = await Promise.all([
        fetchTopicNodeAnchors(longAgentId, topicId, nodeId, signal),
        fetchSessionMemory(longAgentId, sessionId, signal),
      ]);
      if (!signal?.aborted && memoryTargetRef.current === target) setNodeState({ anchors, memory: mem, loading: false });
    } catch (cause) {
      if (signal?.aborted || memoryTargetRef.current !== target) return;
      setNodeState({ anchors: [], memory: null, loading: false });
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [longAgentId]);

  useEffect(() => {
    if (selectedNodeId === null || detail === null) { setNodeState(null); return; }
    const node = detail.nodes.find((candidate) => candidate.nodeId === selectedNodeId);
    if (node === undefined) return;
    const controller = new AbortController();
    void loadNodeState(detail.topic.topicId, selectedNodeId, node.sessionId, controller.signal);
    return () => controller.abort();
  }, [selectedNodeId, detail, loadNodeState]);

  // The central surface is a REAL Session: mount the shared ChatWindow on the node's own Session. The
  // node target routes sends through the node's authorized endpoint; everything else is the public chat.
  useEffect(() => {
    if (nodeSessionId === undefined) { setNodeSession(null); setNodeSessionError(null); return; }
    const controller = new AbortController();
    setNodeSession(null); setNodeSessionError(null);
    void fetchTopicNodeSession(longAgentId, nodeSessionId, controller.signal)
      .then((info) => {
        if (controller.signal.aborted) return;
        const now = new Date().toISOString();
        setNodeSession({ path: "", id: info.id, cwd: info.cwd, ...(info.name === null ? {} : { name: info.name }), created: now, modified: now,
          messageCount: 0, firstMessage: nodeTitle ?? "", owner: { type: "ordinary" }, projectRoot: info.cwd, projectAvailable: true,
          projectKey: longAgentId, projectId: longAgentId, transient: false, readOnly: false, sessionSource: "chat" });
      })
      .catch((cause) => { if (!controller.signal.aborted) setNodeSessionError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [nodeSessionId, nodeTitle, longAgentId]);

  // The supplemental-integration anchor belongs to the SELECTED PARENT, never to the current child.
  useEffect(() => {
    if (supplementParent === "" || detail === null) { setSupplementParentAnchors([]); return; }
    const controller = new AbortController();
    void fetchTopicNodeAnchors(longAgentId, detail.topic.topicId, supplementParent)
      .then((anchors) => { if (!controller.signal.aborted) setSupplementParentAnchors(anchors); })
      .catch(() => { if (!controller.signal.aborted) setSupplementParentAnchors([]); });
    return () => controller.abort();
  }, [supplementParent, detail, longAgentId]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const openCreatedNode = useCallback(async (node: NonNullable<TopicCreationRequest["node"]>) => {
    await loadGraph();
    setSelectedTopicId(node.topicId);
    await loadDetail(node.topicId);
    setSelectedNodeId(node.nodeId); setNavigationOpen(false); setAuxView(null);
    setNotice(t("topics.created", { title: node.title }));
  }, [loadGraph, loadDetail, t]);
  const beginCreation = (prompt: string, parents?: readonly { nodeId: string; anchorEntryId: string; anchorSequence: number }[]) => void run(async () => {
    if (integrating !== null) return;
    const requestId = `web-create-${crypto.randomUUID()}`;
    setIntegrating(requestId);
    try {
      const reference = await startTopicCreation(longAgentId, { prompt, requestId, ...(parents === undefined ? {} : { parents }) });
      setAuxView(null); setNavigationOpen(false); setCreationRequestId(reference.requestId);
    } finally { setIntegrating(null); }
  });
  const createTopic = () => beginCreation(`请把当前日常会话中的讨论整理为主题。建议标题：${newTitle.trim()}；目的：${newPurpose.trim()}。`);

  const forkFromAnchor = () => {
    if (selectedNodeId === null || forkAnchor === null) return;
    const nodeId = selectedNodeId;
    const anchor = forkAnchor;
    setForkTitle(""); setForkAnchor(null);
    beginCreation(`从主题节点 ${nodeId} 的已完成轮次分叉出新的主题会话。建议标题：${forkTitle.trim()}。`,
      [{ nodeId, anchorEntryId: anchor.anchorEntryId, anchorSequence: anchor.anchorSequence }]);
  };

  const confirmSupplement = () => void run(async () => {
    if (detail === null || selectedNodeId === null || supplementParent === "" || supplementAnchor === null || supplementContent.trim() === "") return;
    const topicId = detail.topic.topicId;
    const nodeId = selectedNodeId;
    const requestId = `web-supp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await supplementTopicNode(longAgentId, topicId, nodeId, {
      requestId, parentNodeId: supplementParent,
      anchorEntryId: supplementAnchor.anchorEntryId, anchorSequence: supplementAnchor.anchorSequence,
      product: supplementProduct === "memory" ? { kind: "memory", content: supplementContent.trim() } : { kind: "relay", text: supplementContent.trim() },
    });
    setSupplementContent(""); setSupplementParent(""); setSupplementAnchor(null);
    // A relay product is a real round: acceptance and completion are two distinct facts, shown separately.
    if (result.kind === "relay" && result.turnId !== null) {
      setNotice(t("topics.relayAccepted", { turnId: result.turnId, status: result.turnStatus ?? "queued" }));
      const terminal = await followTopicNodeTurn(longAgentId, result.turnId, new AbortController().signal);
      setNotice(t("topics.relayCompleted", { status: terminal.status }));
      if (terminal.status !== "completed") setError(terminal.error ?? `轮次${terminal.status}`);
    } else {
      setNotice(t("topics.supplemented", { kind: result.kind, ref: result.ref }));
    }
    const node = (await loadDetail(topicId)).nodes.find((candidate) => candidate.nodeId === nodeId);
    if (node !== undefined) await loadNodeState(topicId, nodeId, node.sessionId);
  });

  return <div className={styles.panel} data-topics-root>
    {error !== null && <p role="alert" className={styles.error}><InterfaceFeedback message={error} /></p>}
    {notice !== null && <p role="status" className={styles.notice}>{notice}</p>}
    {integrating !== null && <div className={styles.integrating} role="status" data-topics-integrating>⏳ {t("topics.integrating")}</div>}
    <div className={styles.toolbar}>
      <TopicCreationRequests longAgentId={longAgentId} focusedRequestId={creationRequestId} onCreated={openCreatedNode} />
      <Button variant="secondary" type="button" className={styles.secondary} data-topics-map-toggle onClick={() => setMapVisible((value) => !value)}>
        {mapVisible ? t("topics.hideMap") : t("topics.showMap")}
      </Button>
      <details className={styles.createForm} data-topic-create>
        <summary className={styles.createSummary}>{t("topics.createSummary")}</summary>
        <div className={styles.createRow}>
          <label className={styles.field}>{t("topics.title")}<input value={newTitle} data-topic-create-title placeholder={t("topics.title")} onChange={(event) => setNewTitle(event.target.value)} maxLength={200} /></label>
          <label className={styles.field}>{t("topics.purpose")}<input value={newPurpose} data-topic-create-purpose placeholder={t("topics.purpose")} onChange={(event) => setNewPurpose(event.target.value)} maxLength={2000} /></label>
          <Button variant="primary" type="button" className={styles.primary} data-topic-create-submit disabled={newTitle.trim() === "" || newPurpose.trim() === "" || integrating !== null}
            onClick={createTopic}>{t("topics.create")}</Button>
        </div>
      </details>
    </div>
    <div className={styles.workspace}>
      <section className={`${styles.mapPane} ${mapVisible ? "" : styles.mapHidden}`} aria-label={t("topics.listLabel")}>
        {(graph?.topics.length ?? 0) === 0
          ? <p className={styles.hint}>{t("topics.empty")}</p>
          : <TopicsGraph groups={allGraphs.length > 0 ? allGraphs : [{ agentId: longAgentId, agentName: agents.find((agent) => agent.id === longAgentId)?.name ?? longAgentId, topics: graph?.topics ?? [] }]}
              selectedAgentId={longAgentId} selectedTopicId={selectedTopicId} selectedNodeId={selectedNodeId}
              onSelect={(agentId, topicId, nodeId) => {
                if (agentId !== longAgentId) setActiveAgentId(agentId);
                setSelectedTopicId(topicId); setSelectedNodeId(nodeId); setNavigationOpen(false);
                if (typeof window !== "undefined" && window.matchMedia("(max-width: 959px)").matches) setMapVisible(false);
              }} />}
      </section>
      <section className={styles.sessionPane} aria-label={t("topics.detailLabel")}>
        {detail === null ? <p className={styles.hint}>{t("topics.selectNodeHint")}</p> : <>
          {selectedNodeId !== null && <div className={styles.header}>
            <h3>{selectedNode?.title ?? ""}</h3>
            <Button variant="secondary" type="button" className={styles.secondary} data-topic-aux-open onClick={() => setAuxView("details")}>{t("topics.details")}</Button>

          </div>}
          {selectedNodeId !== null && <>
            <div className={styles.session} data-topic-session>
              {nodeSessionError !== null
                ? <p role="alert" className={styles.error}><InterfaceFeedback message={nodeSessionError} /></p>
                : nodeSession !== null
                  ? <ChatWindow
                      key={`${detail.topic.topicId}:${selectedNodeId}`}
                      projectId={longAgentId}
                      session={nodeSession}
                      topicNode={{ longAgentId, topicId: detail.topic.topicId, nodeId: selectedNodeId }}
                      onSessionMemoryChanged={() => {
                        void loadGraph().catch(cause => setError(String(cause)));
                        void loadDetail(detail.topic.topicId).catch(cause => setError(String(cause)));
                      }}
                      newSessionCwd={null}
                      newSessionDraftKey={null}
                    />
                  : <p className={styles.hint} data-topic-session-loading>{t("topics.sessionLoading")}</p>}
            </div>
            {auxView !== null && <SurfaceDialog title={t("topics.auxSummary")} onClose={() => setAuxView(null)}>
            <div className={styles.auxPanel} data-topic-aux>
            {auxView === "details" && selectedNode !== undefined && <div className={styles.nodeMeta} data-topic-node-meta>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>{t("topics.frozenProject")}</span>
                <span data-topic-frozen-project>{selectedNode.frozenProjectContext ?? t("topics.frozenProjectNone")}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>{t("topics.initialSources")}</span>
                <div className={styles.metaValues} data-topic-initial-sources>
                  {selectedNode.initialMemoryRefs.length === 0
                    ? <span className={styles.hint} data-topic-initial-sources-none>{t("topics.noInitialSources")}</span>
                    : selectedNode.initialMemoryRefs.map((ref) => (
                      <div key={ref.entryId} className={styles.metaValue} data-topic-initial-source={ref.entryId}>
                        {ref.entryId} ← {ref.source.storageProjectId}/{ref.source.sessionId}#{ref.source.entryId}
                      </div>
                    ))}
                </div>
              </div>
            </div>}

            {auxView === "details" && <div className={styles.section}>
              <h4>{t("topics.anchors")}</h4>
              <div className={styles.anchorList}>
                {(nodeState?.anchors ?? []).map((anchor) => (
                  <div key={anchor.anchorEntryId} className={styles.anchorRow}>
                    <span>#{String(anchor.anchorSequence)} · {anchor.turnId}</span>
                    <Button variant="secondary" type="button" className={styles.secondary} data-topic-fork-anchor={anchor.anchorEntryId}
                      onClick={() => setForkAnchor(forkAnchor?.anchorEntryId === anchor.anchorEntryId ? null : anchor)}>
                      {forkAnchor?.anchorEntryId === anchor.anchorEntryId ? t("topics.forkSelected") : t("topics.selectForFork")}
                    </Button>
                  </div>
                ))}
                {(nodeState?.anchors.length ?? 0) === 0 && <span className={styles.hint}>{t("topics.noAnchors")}</span>}
              </div>
              {forkAnchor !== null && (
                <div className={styles.forkForm}>
                  <div className={styles.formRow}>
                    <label>{t("topics.forkTitle")}</label>
                    <input value={forkTitle} data-topic-fork-title onChange={(event) => setForkTitle(event.target.value)} maxLength={200} />
                  </div>
                  <Button variant="primary" type="button" className={styles.primary} data-topic-fork-submit disabled={forkTitle.trim() === "" || integrating !== null}
                    onClick={forkFromAnchor}>{t("topics.fork")}</Button>
                </div>
              )}
            </div>}
            {auxView === "details" && <div className={styles.section}>
              <h4>{t("topics.supplementTitle")}</h4>
              <div className={styles.supplementForm}>
                <div className={styles.formRow}>
                  <label>{t("topics.supplementProduct")}</label>
                  <select value={supplementProduct} data-topic-supplement-product onChange={(event) => setSupplementProduct(event.target.value as "memory" | "relay")}>
                    <option value="memory">{t("topics.supplementMemory")}</option>
                    <option value="relay">{t("topics.supplementRelay")}</option>
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>{t("topics.supplementParent")}</label>
                  <select value={supplementParent} data-topic-supplement-parent
                    onChange={(event) => { setSupplementParent(event.target.value); setSupplementAnchor(null); }}>
                    <option value="">{t("topics.selectParent")}</option>
                    {detail.nodes.filter((node) => node.nodeId !== selectedNodeId && node.status === "active").map((node) => (
                      <option key={node.nodeId} value={node.nodeId}>{node.title}</option>
                    ))}
                  </select>
                </div>
                {supplementParent !== "" && (
                  <div className={styles.formRow}>
                    <label>{t("topics.supplementAnchor")}</label>
                    <select value={supplementAnchor?.anchorEntryId ?? ""} data-topic-supplement-anchor
                      onChange={(event) => {
                        const found = supplementParentAnchors.find((anchor) => anchor.anchorEntryId === event.target.value);
                        setSupplementAnchor(found ?? null);
                      }}>
                      <option value="">{t("topics.selectAnchor")}</option>
                      {supplementParentAnchors.map((anchor) => (
                        <option key={anchor.anchorEntryId} value={anchor.anchorEntryId}>#{String(anchor.anchorSequence)} · {anchor.turnId}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={styles.formRow}>
                  <label>{t("topics.supplementContent")}</label>
                  <input value={supplementContent} data-topic-supplement-content onChange={(event) => setSupplementContent(event.target.value)} maxLength={4000} />
                </div>
                <Button variant="primary" type="button" className={styles.primary} data-topic-supplement-confirm
                  disabled={supplementParent === "" || supplementAnchor === null || supplementContent.trim() === ""}
                  onClick={confirmSupplement}>{t("topics.confirmSupplement")}</Button>
              </div>
            </div>}
            </div></SurfaceDialog>}
          </>}
        </>}
      </section>
    </div>
  </div>;
}
