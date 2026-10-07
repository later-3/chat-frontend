"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { useI18n } from "@/hooks/useI18n";
import type { LongAgentConfigurationDocument } from "@/lib/long-agents-browser";
import type { WorkflowAgentInspection } from "@/lib/chat-workflows-browser";
import styles from "./LongAgentSettingsPanel.module.css";

/** 总览入口可跳转的标签（P3 阶段沿用现有标签；P4–P7 重排后指向更精确的目标）。 */
export type LongAgentOverviewTab = "identity" | "standards" | "memory" | "projects" | "on-demand" | "continuous" | "channel";

interface Counts {
  readonly memory?: number;
  readonly tasks?: number;
  readonly duties?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 复用既有集合接口取计数：失败返回 undefined（总览显示“—”，不阻塞面板）。 */
async function countOf(
  url: string,
  key: string,
  signal: AbortSignal,
): Promise<number | undefined> {
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal });
    if (!response.ok) return undefined;
    const body: unknown = await response.json().catch(() => null);
    if (!isRecord(body)) return undefined;
    const list = body[key];
    return Array.isArray(list) ? list.length : undefined;
  } catch {
    return undefined;
  }
}

export function LongAgentOverviewCard({ document, inspection, onOpenTab }: {
  readonly document: LongAgentConfigurationDocument;
  readonly inspection: WorkflowAgentInspection | null;
  readonly onOpenTab: (tab: LongAgentOverviewTab) => void;
}) {
  const { t } = useI18n();
  const [counts, setCounts] = useState<Counts>({});
  const longAgentId = document.agent.id;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const base = `/api/long-agents/${encodeURIComponent(longAgentId)}`;
      const [memory, tasks, duties] = await Promise.all([
        countOf(`${base}/agent-memory?operation=list`, "files", controller.signal),
        countOf(`${base}/tasks`, "tasks", controller.signal),
        countOf(`${base}/duties`, "duties", controller.signal),
      ]);
      if (!controller.signal.aborted) setCounts({ memory, tasks, duties });
    })();
    return () => controller.abort();
  }, [longAgentId]);

  const definition = document.agent.definition;
  const promptText = definition.systemPrompt.mode === "replace" ? definition.systemPrompt.text : "";
  const harnessRegion = inspection?.prompt.regions?.find((region) => region.name === "chat_interaction_harness");
  const activeTools = inspection?.tools.filter((tool) => tool.active).length;
  const skills = inspection?.skills.length;
  const model = inspection?.agent.effectiveModel;
  const thinking = inspection?.agent.effectiveThinkingLevel;
  const count = (value: number | undefined) => (value === undefined ? "—" : String(value));

  const rows: readonly { key: string; label: string; summary: string; count?: string; tab: LongAgentOverviewTab }[] = [
    {
      key: "identity", label: t("longAgentSettings.identity"),
      summary: t("longAgentSettings.overviewIdentitySummary", {
        description: String(document.agent.description.length),
        prompt: String(promptText.length),
        custom: String(definition.customInstructions.length),
      }),
      tab: "identity",
    },
    {
      key: "standards", label: t("longAgentSettings.standardsTab"),
      summary: t("longAgentSettings.overviewStandardsSummary", {
        state: document.agent.interactionHarness === "off" ? t("longAgentSettings.disabled") : t("longAgentSettings.enabled"),
        revision: harnessRegion?.revision ?? "—",
      }),
      tab: "standards",
    },
    {
      key: "memory", label: t("longAgentSettings.memoryTab"),
      summary: t("longAgentSettings.overviewMemorySummary", {
        count: count(counts.memory), source: t("longAgentSettings.overviewMemorySource"),
      }),
      count: count(counts.memory), tab: "memory",
    },
    {
      key: "projects", label: t("longAgentSettings.overviewProjects"),
      summary: t("longAgentSettings.overviewProjectSummary", {
        project: document.agent.defaultProjectId, bound: String(document.agent.boundProjectIds.length),
      }),
      count: String(document.agent.boundProjectIds.length), tab: "projects",
    },
    {
      key: "on-demand", label: t("longAgentSettings.overviewOnDemand"),
      summary: t("longAgentSettings.overviewCapabilitySummary", {
        model: model === null || model === undefined ? "—" : `${model.provider}/${model.modelId}`,
        thinking: thinking ?? "—", tools: count(activeTools), skills: count(skills),
      }),
      tab: "on-demand",
    },
    {
      key: "continuous", label: t("longAgentSettings.overviewContinuous"),
      summary: t("longAgentSettings.overviewContinuousSummary", { tasks: count(counts.tasks), duties: count(counts.duties) }),
      count: counts.tasks === undefined && counts.duties === undefined
        ? undefined : `${count(counts.tasks)} / ${count(counts.duties)}`,
      tab: "continuous",
    },
    {
      key: "channel", label: t("longAgentSettings.overviewChannel"),
      summary: document.channel === null
        ? t("longAgentSettings.overviewChannelUnbound")
        : t("longAgentSettings.overviewChannelBound", { type: document.channel.type, instance: document.channel.instance }),
      tab: "channel",
    },
  ];

  return (
    <section className={styles.overview} aria-label={t("longAgentSettings.overviewTitle")} data-la-overview>
      <header className={styles.overviewHead}>
        <strong>{t("longAgentSettings.overviewTitle")}</strong>
        <small>{t("longAgentSettings.overviewHint")}</small>
      </header>
      <ul className={styles.overviewList}>
        {rows.map((row) => (
          <li key={row.key} className={styles.overviewRow} data-la-overview-row={row.key}>
            <span className={styles.overviewLabel}>{row.label}</span>
            <span className={styles.overviewSummary}>{row.summary}</span>
            {row.count === undefined ? null : <span className={styles.overviewCount}>{row.count}</span>}
            <Button variant="secondary" type="button" onClick={() => onOpenTab(row.tab)}>{t("longAgentSettings.overviewOpen")}</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
