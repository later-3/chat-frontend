import { useEffect, useRef, useState } from "react";
import type { TopicNodeTarget } from "@/lib/topic-node-execution";
import { fetchTopicDetail, setTopicNodeSessionMemory, TopicsRequestError } from "@/lib/topics-browser";

interface PolicyState {
  key: string;
  enabled: boolean;
  revision: number;
}

/** Every Session entry point uses the node's persisted policy, including calendar and direct links. */
export function useTopicMemoryControl(target: TopicNodeTarget | undefined, onSaved?: () => void) {
  const agentId = target?.longAgentId;
  const topicId = target?.topicId;
  const nodeId = target?.nodeId;
  const key = target ? JSON.stringify([agentId, topicId, nodeId]) : "";
  const activeKey = useRef(key);
  activeKey.current = key;
  const generation = useRef(0);
  const savingKey = useRef<string | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const request = ++generation.current;
    savingKey.current = null;
    setBusyKey(null);
    if (!agentId || !topicId || !nodeId) return;
    const controller = new AbortController();
    setPolicy(null);
    setFailure(null);
    void fetchTopicDetail(agentId, topicId, controller.signal).then(detail => {
      if (controller.signal.aborted || activeKey.current !== key || generation.current !== request) return;
      const node = detail.nodes.find(candidate => candidate.nodeId === nodeId);
      if (!node) throw new Error("主题节点已不可用");
      setPolicy({ key, enabled: node.sessionMemory !== "off", revision: detail.revision });
    }).catch(cause => {
      if (!controller.signal.aborted && activeKey.current === key && generation.current === request) {
        setFailure({ key, message: cause instanceof Error ? cause.message : String(cause) });
      }
    });
    return () => { controller.abort(); generation.current++; };
  }, [agentId, topicId, nodeId, key, reload]);

  const ready = policy?.key === key;
  const change = async (enabled: boolean) => {
    if (!target || !ready || !policy || savingKey.current === key) return;
    const request = generation.current;
    const isCurrent = () => activeKey.current === key && generation.current === request;
    savingKey.current = key;
    setBusyKey(key);
    setFailure(null);
    try {
      const result = await setTopicNodeSessionMemory(target.longAgentId, target.topicId, target.nodeId, {
        expectedRevision: policy.revision, sessionMemory: enabled ? "on" : "off",
      });
      if (!isCurrent()) return;
      setPolicy({ key, enabled: result.node.sessionMemory !== "off", revision: result.revision });
      onSavedRef.current?.();
    } catch (cause) {
      if (!isCurrent()) return;
      setFailure({ key, message: cause instanceof Error ? cause.message : String(cause) });
      if (cause instanceof TopicsRequestError && cause.status === 409) {
        const latest = await fetchTopicDetail(target.longAgentId, target.topicId).catch(() => null);
        if (!isCurrent()) return;
        const node = latest?.nodes.find(candidate => candidate.nodeId === target.nodeId);
        setPolicy(latest && node ? { key, enabled: node.sessionMemory !== "off", revision: latest.revision } : null);
      }
    } finally {
      if (isCurrent()) {
        savingKey.current = null;
        setBusyKey(null);
      }
    }
  };

  return target ? {
    // Unknown policy must not send the ordinary browser preference's "off" override.
    enabled: ready ? policy.enabled : true,
    ready,
    busy: busyKey === key,
    error: failure?.key === key ? failure.message : null,
    onChange: (enabled: boolean) => { void change(enabled); },
    retry: () => setReload(value => value + 1),
  } : undefined;
}
