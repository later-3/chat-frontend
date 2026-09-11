"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  fetchLongAgentActivity,
  fetchLongAgentFeed,
  type LongAgentActivityDay,
  type LongAgentFeedPost,
} from "@/lib/long-agents-browser";
import styles from "./LongAgentSettingsPanel.module.css";

interface Props {
  longAgentId: string;
}

function localDate(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * 活动与朋友圈（A4/C2）：每天做了什么（轮次/token/工具）来自 Session 派生索引；
 * 朋友圈是各长期同事公开的动态与评论（默认全部可见）。
 */
export function LongAgentActivitySettings({ longAgentId }: Props) {
  const { t } = useI18n();
  const [days, setDays] = useState<readonly LongAgentActivityDay[] | null>(null);
  const [posts, setPosts] = useState<readonly LongAgentFeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const [activity, feed] = await Promise.all([
        fetchLongAgentActivity(longAgentId, { from: localDate(-14), to: localDate() }, signal),
        fetchLongAgentFeed(longAgentId, { limit: 30 }, signal),
      ]);
      setDays(activity);
      setPosts(feed);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, [longAgentId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section className={styles.section} aria-label={t("longAgentSettings.activityTab")}>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <h3>{t("longAgentSettings.activityHeading")}</h3>
      <p className={styles.help}>{t("longAgentSettings.activityHint")}</p>
      {days === null && <small>{t("longAgentSettings.inspectionLoading")}</small>}
      {days !== null && days.length === 0 && <p className={styles.help}>{t("longAgentSettings.activityEmpty")}</p>}
      {days !== null && days.length > 0 && (
        <ul className={styles.taskList}>
          {days.map((day) => (
            <li key={day.date} className={styles.taskRow}>
              <div className={styles.taskHead}>
                <strong>{day.date}</strong>
                <small>{t("longAgentSettings.activityTurns", { turns: day.turns, sessions: day.sessions })}</small>
                <span className={styles.pending}>{day.tokens.total} tok</span>
              </div>
              <p className={styles.taskPrompt}>
                {day.tools.length === 0
                  ? t("longAgentSettings.activityNoTools")
                  : day.tools.map((tool) => `${tool.name}×${tool.count}`).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h3>{t("longAgentSettings.socialHeading")}</h3>
      {posts === null && <small>{t("longAgentSettings.inspectionLoading")}</small>}
      {posts !== null && posts.length === 0 && <p className={styles.help}>{t("longAgentSettings.socialEmpty")}</p>}
      {posts !== null && posts.length > 0 && (
        <ul className={styles.taskList}>
          {posts.map((post) => (
            <li key={post.id} className={styles.taskRow}>
              <div className={styles.taskHead}>
                <strong>{post.longAgentId}</strong>
                <small>{post.date}</small>
              </div>
              <p className={styles.taskPrompt}>{post.text}</p>
              {post.comments.length > 0 && (
                <ul className={styles.taskList}>
                  {post.comments.map((comment) => (
                    <li key={comment.id} className={styles.taskRow}>
                      <div className={styles.taskHead}><strong>{comment.longAgentId}</strong><small>{comment.createdAt.slice(0, 16).replace("T", " ")}</small></div>
                      <p className={styles.taskPrompt}>{comment.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
