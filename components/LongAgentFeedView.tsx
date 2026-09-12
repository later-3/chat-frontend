"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchLongAgentFeed, type LongAgentFeedPost } from "@/lib/long-agents-browser";
import styles from "./LongAgentSettingsPanel.module.css";

interface Props {
  onClose: () => void;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** 朋友圈：侧栏直接入口，展示各长期同事的动态与评论（默认全部可见）。 */
export function LongAgentFeedView({ onClose }: Props) {
  const { t } = useI18n();
  const [posts, setPosts] = useState<readonly LongAgentFeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const agent = await import("@/lib/long-agents-browser").then((m) => m.fetchLongAgents(undefined, signal));
      const anyAgentId = agent.agents[0]?.id ?? "nexus";
      setPosts(await fetchLongAgentFeed(anyAgentId, { limit: 30 }, signal));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section className={styles.section} aria-label={t("longAgentSettings.socialHeading")}>
      <div className={styles.sourceLine}>
        <span>{t("longAgentSettings.socialHeading")}</span>
        <button type="button" className={styles.secondaryButton} onClick={onClose}>{t("common.close")}</button>
      </div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {posts === null && <small>{t("longAgentSettings.inspectionLoading")}</small>}
      {posts !== null && posts.length === 0 && <p className={styles.help}>{t("longAgentSettings.socialEmpty")}</p>}
      {posts !== null && posts.length > 0 && (
        <ul className={styles.taskList}>
          {posts.map((post) => (
            <li key={post.id} className={styles.taskRow}>
              <div className={styles.taskHead}>
                <strong>{post.longAgentId}</strong>
                <small>{post.date} · {formatTime(post.createdAt)}</small>
              </div>
              <p className={styles.taskPrompt}>{post.text}</p>
              {post.comments.length > 0 && (
                <ul className={styles.taskList}>
                  {post.comments.map((comment) => (
                    <li key={comment.id} className={styles.taskRow}>
                      <div className={styles.taskHead}><strong>{comment.longAgentId}</strong><small>{formatTime(comment.createdAt)}</small></div>
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
