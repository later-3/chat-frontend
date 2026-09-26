"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { TopicSummary } from "@/lib/topics-browser";
import styles from "./TopicsGraph.module.css";

/**
 * Obsidian-style mind map: every topic is one tree; every node is a Session you can open.
 *
 * The map is the NAVIGATION surface only. Clicking a node opens its Session in the pane next to it;
 * fork / supplement / memory stay in the node's detail surface, never on the map.
 */
export interface TopicsGraphGroup {
  readonly agentId: string;
  readonly agentName: string;
  readonly topics: readonly TopicSummary[];
}
interface Props {
  /** Every Long Agent is a root of the forest; each of its topics is a tree of Sessions. */
  readonly groups: readonly TopicsGraphGroup[];
  readonly selectedAgentId: string | null;
  readonly selectedTopicId: string | null;
  readonly selectedNodeId: string | null;
  readonly onSelect: (agentId: string, topicId: string, nodeId: string) => void;
}

const CARD_W = 190;
const CARD_H = 58;
const GAP_X = 74;
const GAP_Y = 20;
const TOPIC_GAP = 40;
const GROUP_GAP = 56;
const ORIGIN_X = 26;

interface LaidNode {
  readonly topicId: string; readonly nodeId: string; readonly agentId: string; readonly title: string; readonly status: string;
  readonly sessionMemory: string; readonly depth: number; readonly x: number; readonly y: number; readonly childCount: number;
}
interface LaidEdge { readonly id: string; readonly from: { x: number; y: number }; readonly to: { x: number; y: number }; readonly anchored: boolean }
interface LaidTopic { readonly topicId: string; readonly title: string; readonly status: string; readonly x: number; readonly y: number; readonly count: number; readonly agentId: string }
interface LaidGroup { readonly agentId: string; readonly agentName: string; readonly x: number; readonly y: number; readonly topics: number }

/** Longest-path depth so a node with several parents always sits after ALL of them. */
function depthsOf(nodes: readonly { nodeId: string; parents: readonly { parentNodeId: string }[] }[]): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const depth = new Map<string, number>();
  const visit = (nodeId: string, guard: Set<string>): number => {
    const cached = depth.get(nodeId);
    if (cached !== undefined) return cached;
    if (guard.has(nodeId)) return 0;
    const node = byId.get(nodeId);
    if (node === undefined) return 0;
    const nextGuard = new Set(guard).add(nodeId);
    const parents = node.parents.filter((parent) => byId.has(parent.parentNodeId));
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((parent) => visit(parent.parentNodeId, nextGuard))) + 1;
    depth.set(nodeId, value);
    return value;
  };
  for (const node of nodes) visit(node.nodeId, new Set());
  return depth;
}

function layout(groups: readonly TopicsGraphGroup[]): { nodes: LaidNode[]; edges: LaidEdge[]; labels: LaidTopic[]; groupLabels: LaidGroup[]; width: number; height: number } {
  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  const labels: LaidTopic[] = [];
  const groupLabels: LaidGroup[] = [];
  let cursorY = 22;
  let maxX = 0;
  for (const group of groups) {
    groupLabels.push({ agentId: group.agentId, agentName: group.agentName, x: ORIGIN_X, y: cursorY, topics: group.topics.length });
    cursorY += 36;
    for (const topic of group.topics) {
    const depth = depthsOf(topic.nodes);
    const byDepth = new Map<number, string[]>();
    for (const node of topic.nodes) {
      const level = depth.get(node.nodeId) ?? 0;
      byDepth.set(level, [...(byDepth.get(level) ?? []), node.nodeId]);
    }
    labels.push({ topicId: topic.topicId, title: topic.title, status: topic.status, x: ORIGIN_X + 14, y: cursorY, count: topic.nodes.length, agentId: group.agentId });
    cursorY += 28;
    const indexInDepth = new Map<string, number>();
    let rows = 0;
    for (const level of [...byDepth.keys()].sort((a, b) => a - b)) {
      const ids = byDepth.get(level) ?? [];
      ids.forEach((nodeId, rowIndex) => indexInDepth.set(nodeId, rowIndex));
      rows = Math.max(rows, ids.length);
    }
    const topicTop = cursorY;
    for (const node of topic.nodes) {
      const level = depth.get(node.nodeId) ?? 0;
      const row = indexInDepth.get(node.nodeId) ?? 0;
      const x = ORIGIN_X + 14 + level * (CARD_W + GAP_X);
      const y = topicTop + row * (CARD_H + GAP_Y);
      nodes.push({ topicId: topic.topicId, nodeId: node.nodeId, agentId: group.agentId, title: node.title, status: node.status, sessionMemory: node.sessionMemory,
        depth: level, x, y, childCount: topic.nodes.filter((candidate) => candidate.parents.some((parent) => parent.parentNodeId === node.nodeId)).length });
      maxX = Math.max(maxX, x + CARD_W);
      for (const parent of node.parents) {
        const parentNode = nodes.find((candidate) => candidate.topicId === topic.topicId && candidate.nodeId === parent.parentNodeId);
        if (parentNode === undefined) continue;
        edges.push({ id: `${parent.parentNodeId}->${node.nodeId}`, from: { x: parentNode.x + CARD_W, y: parentNode.y + CARD_H / 2 },
          to: { x, y: y + CARD_H / 2 }, anchored: parent.anchorEntryId !== null });
      }
    }
    cursorY = topicTop + Math.max(rows, 1) * (CARD_H + GAP_Y) + TOPIC_GAP;
    }
    cursorY += GROUP_GAP;
  }
  return { nodes, edges, labels, groupLabels, width: maxX + 40, height: cursorY + 20 };
}

export function TopicsGraph({ groups, selectedAgentId, selectedTopicId, selectedNodeId, onSelect }: Props) {
  const { t } = useI18n();
  const { nodes, edges, labels, groupLabels, width, height } = useMemo(() => layout(groups), [groups]);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y };
  }, [view.x, view.y]);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start === null) return;
    setView((current) => ({ ...current, x: start.originX + (event.clientX - start.x), y: start.originY + (event.clientY - start.y) }));
  }, []);
  const onPointerUp = useCallback(() => { drag.current = null; }, []);
  const zoom = (delta: number) => setView((current) => ({ ...current, scale: Math.min(1.8, Math.max(0.4, current.scale + delta)) }));

  return (
    <div className={styles.canvas} data-topics-graph>
      <div className={styles.controls}>
        <button type="button" className={styles.control} onClick={() => zoom(0.15)} aria-label={t("topics.zoomIn")}>＋</button>
        <button type="button" className={styles.control} onClick={() => zoom(-0.15)} aria-label={t("topics.zoomOut")}>－</button>
        <button type="button" className={styles.control} onClick={() => setView({ x: 0, y: 0, scale: 1 })} aria-label={t("topics.zoomReset")}>⤾</button>
        <span className={styles.zoomLabel}>{Math.round(view.scale * 100)}%</span>
      </div>
      <div className={styles.viewport} data-topics-graph-viewport onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <div className={styles.world} style={{ width, height, transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})` }}>
          <svg className={styles.edges} width={width} height={height} aria-hidden="true">
            {edges.map((edge) => {
              const midX = (edge.from.x + edge.to.x) / 2;
              return <path key={edge.id} className={edge.anchored ? styles.edgeAnchored : styles.edge}
                d={`M ${String(edge.from.x)} ${String(edge.from.y)} C ${String(midX)} ${String(edge.from.y)}, ${String(midX)} ${String(edge.to.y)}, ${String(edge.to.x)} ${String(edge.to.y)}`} />;
            })}
          </svg>
          {groupLabels.map((group) => (
            <div key={group.agentId} className={styles.groupLabel} data-topics-agent={group.agentId} style={{ left: group.x, top: group.y }}>
              {group.agentName}<small>{group.topics} 主题</small>
            </div>
          ))}
          {labels.map((label) => {
            const rootNode = nodes.find((node) => node.topicId === label.topicId && node.depth === 0) ?? nodes.find((node) => node.topicId === label.topicId);
            return (
              <button key={label.topicId} type="button" className={styles.topicLabel} data-topic-id={label.topicId}
                style={{ left: label.x, top: label.y }}
                onClick={() => { if (rootNode !== undefined) onSelect(label.agentId, label.topicId, rootNode.nodeId); }}>
                <span className={label.status === "archived" ? styles.dotArchived : styles.dotTopic} />
                {label.title}
                <small>{label.status === "archived" ? t("topics.archived") : t("topics.active")} · {String(label.count)}</small>
              </button>
            );
          })}
          {nodes.map((node) => {
            const active = node.agentId === selectedAgentId && node.topicId === selectedTopicId && node.nodeId === selectedNodeId;
            return (
              <button key={node.nodeId} type="button" data-topic-node-id={node.nodeId} data-graph-topic={node.topicId}
                className={`${styles.node} ${active ? styles.nodeActive : ""} ${node.status !== "active" ? styles.nodeArchived : ""}`}
                style={{ left: node.x, top: node.y, width: CARD_W, height: CARD_H }}
                onClick={() => onSelect(node.agentId, node.topicId, node.nodeId)}>
                <span className={node.status === "archived" ? styles.dotArchived : node.sessionMemory === "off" ? styles.dotMemoryOff : styles.dotActive} />
                <span className={styles.nodeTitle}>{node.title}</span>
                <span className={styles.nodeMeta}>
                  {node.depth === 0 ? t("topics.rootNode") : t("topics.branchNode")}
                  {node.childCount > 0 ? ` · ${String(node.childCount)} ${t("topics.childrenSuffix")}` : ""}
                  {node.sessionMemory === "off" ? ` · ${t("topics.memoryOff")}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
