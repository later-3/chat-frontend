"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  fetchLongAgentActivity, fetchLongAgentFeed,
  type LongAgentActivityDay, type LongAgentConfigurationDocument, type LongAgentFeedPost,
} from "@/lib/long-agents-browser";
import { fetchLongAgentPresence } from "@/lib/long-agent-presence";
import { LongAgentAvatarView } from "./LongAgentAvatar";
import styles from "./LongAgentHome.module.css";

interface HomeFeedPost { readonly id: string; readonly longAgentId: string; readonly date: string; readonly text: string }
interface HomeCounts { readonly tasks?: number; readonly duties?: number }
/** 最近活跃（来自 activity 的最后一天；日报接口返回的是生成状态而非正文，故不展示“工作总结”） */
interface HomeLatest { readonly date: string; readonly turns: number; readonly sessions: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function listLength(body: unknown, key: string): number | undefined {
  if (!isRecord(body)) return undefined;
  const list = body[key];
  return Array.isArray(list) ? list.length : undefined;
}
async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch { return null; }
}
/** 人类可读的 token 量：1.6M / 12.3K / 842 */
function humanTokens(total: number): string {
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)}K`;
  return String(total);
}
const WEEKS = 12;
const DAYS = WEEKS * 7;

export function LongAgentHome({ document, onOpenFeed }: {
  readonly document: LongAgentConfigurationDocument;
  readonly onOpenFeed?: () => void;
}) {
  const { t } = useI18n();
  const agentId = document.agent.id;
  const [days, setDays] = useState<readonly LongAgentActivityDay[]>([]);
  const [posts, setPosts] = useState<readonly HomeFeedPost[]>([]);

  const [counts, setCounts] = useState<HomeCounts>({});
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      const base = `/api/long-agents/${encodeURIComponent(agentId)}`;
      const [activity, feed, presence, tasks, duties] = await Promise.allSettled([
        fetchLongAgentActivity(agentId, undefined, signal),
        fetchLongAgentFeed(agentId, { limit: 40 }, signal),
        fetchLongAgentPresence(signal),
        getJson(`${base}/tasks`, signal),
        getJson(`${base}/duties`, signal),
      ]);
      if (signal.aborted) return;
      if (activity.status === "fulfilled") setDays(activity.value);
      if (feed.status === "fulfilled") {
        setPosts(feed.value.map((post: LongAgentFeedPost) => ({
          id: post.id, longAgentId: post.longAgentId, date: post.date, text: post.text,
        })));
      }
      if (presence.status === "fulfilled") {
        setStatus(presence.value.agents.find((agent) => agent.id === agentId)?.status ?? null);
      }
      setCounts({
        tasks: tasks.status === "fulfilled" ? listLength(tasks.value, "tasks") : undefined,
        duties: duties.status === "fulfilled" ? listLength(duties.value, "duties") : undefined,
      });
    })();
    return () => controller.abort();
  }, [agentId]);

  // A2：近 12 周（84 天）热力图，按当日 token 总量分 4 档
  const byDate = new Map(days.map((day) => [day.date, day]));
  const today = new Date();
  const cells: { date: string; total: number; level: number }[] = [];
  const maxTotal = Math.max(1, ...days.map((day) => day.tokens.total));
  for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    const total = byDate.get(date)?.tokens.total ?? 0;
    cells.push({ date, total, level: total === 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((total / maxTotal) * 4))) });
  }
  const recent = days.slice(-14);
  const sum = (pick: (day: LongAgentActivityDay) => number) => recent.reduce((acc, day) => acc + pick(day), 0);
  const toolTally = new Map<string, number>();
  for (const day of recent) for (const tool of day.tools) toolTally.set(tool.name, (toolTally.get(tool.name) ?? 0) + tool.count);
  const topTool = [...toolTally.entries()].sort((a, b) => b[1] - a[1])[0];
  const latestDay = days.length === 0 ? undefined : days[days.length - 1];
  const latest: HomeLatest | undefined = latestDay === undefined ? undefined
    : { date: latestDay.date, turns: latestDay.turns, sessions: latestDay.sessions };
  const self = posts.filter((post) => post.longAgentId === agentId).slice(0, 3);
  const stateLabel = status === null ? t("longAgentHome.statusUnknown")
    : status === "ready" ? t("longAgentHome.statusOnline") : t("longAgentHome.statusOffline");

  return (
    <section className={styles.home} aria-label={t("longAgentHome.title")} data-la-home>
      {/* A1 身份卡 */}
      <header className={styles.identity} data-la-home-region="identity">
        <span className={styles.avatar} data-la-home-avatar>
          <LongAgentAvatarView agentId={agentId} name={document.agent.name} avatar={document.agent.avatar} />
          <span className={styles.presence} data-state={status ?? "unknown"} />
        </span>
        <div className={styles.identityText}>
          <h2 className={styles.name}>{document.agent.name}<span className={styles.state}>{stateLabel}</span></h2>
          <p className={styles.desc}>{document.agent.description}</p>
          <p className={styles.meta}>
            <span>{t("longAgentHome.defaultProject")} <b>{document.agent.defaultProjectId}</b></span>
            <span>{t("longAgentHome.boundProjects")} <b>{document.agent.boundProjectIds.length}</b></span>
            <span>{t("longAgentHome.channel")} <b>{document.channel === null ? t("longAgentHome.unbound") : document.channel.type}</b></span>
            <span>{t("longAgentHome.harness")} <b>{document.agent.interactionHarness === "off" ? t("longAgentSettings.disabled") : t("longAgentSettings.enabled")}</b></span>
          </p>
        </div>
      </header>

      {/* A2 活跃 */}
      <section className={styles.region} data-la-home-region="activity">
        <h3 className={styles.regionTitle}>{t("longAgentHome.activity")}</h3>
        <div className={styles.calendar} role="img" aria-label={t("longAgentHome.activityHint")}>
          {cells.map((cell) => (
            <span key={cell.date} className={styles.cell} data-level={cell.level}
              data-today={cell.date === new Date().toISOString().slice(0, 10) ? "true" : undefined}
              title={`${cell.date} · ${humanTokens(cell.total)} tokens`} />
          ))}
        </div>
        <p className={styles.stat}>
          {t("longAgentHome.statLine", {
            sessions: String(sum((day) => day.sessions)), turns: String(sum((day) => day.turns)),
            tokens: humanTokens(sum((day) => day.tokens.total)),
            tool: topTool === undefined ? "—" : `${topTool[0]}(${topTool[1]})`,
          })}
        </p>
      </section>

      {/* A3 个人动态（公共朋友圈已按用户要求移除） */}
      <section className={styles.region} data-la-home-region="posts">
        <h3 className={styles.regionTitle}>{t("longAgentHome.ownPosts")}</h3>
        <ul className={styles.posts}>
          {self.length === 0 ? <li className={styles.empty}>{t("longAgentHome.empty")}</li>
            : self.map((post) => (
              <li key={post.id} className={styles.post} data-la-home-post="own">
                <span className={styles.postText}>{post.text}</span>
                <span className={styles.postDate}>{post.date.slice(5)}</span>
              </li>
            ))}
        </ul>
        {onOpenFeed === undefined ? null
          : <button type="button" className={styles.more} onClick={onOpenFeed}>{t("longAgentHome.viewAll")}</button>}
      </section>

      {/* A5 正在做的事（待办因无接口暂不展示） */}
      <section className={styles.region} data-la-home-region="working-on">
        <h3 className={styles.regionTitle}>{t("longAgentHome.workingOn")}</h3>
        <ul className={styles.facts}>
          <li><span>{t("longAgentHome.scheduledTasks")}</span>
            <span><b className={styles.chip}>{counts.tasks ?? "—"}</b></span></li>
          <li><span>{t("longAgentHome.duties")}</span>
            <span><b className={styles.chip}>{counts.duties ?? "—"}</b></span></li>
          <li><span>{t("longAgentHome.latestActivity")}</span>
            <span>{latest === undefined ? "—" : `${latest.date.slice(5)} · ${t("longAgentHome.latestActivityValue", { sessions: String(latest.sessions), turns: String(latest.turns) })}`}</span></li>
        </ul>
      </section>
    </section>
  );
}
