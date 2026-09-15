"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { IconArrowLeft, IconCheck, IconLayoutGrid, IconMessageCircle, IconRefresh, IconUsers } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { fetchLongAgentFeed, fetchLongAgents, type LongAgentFeedPost, type LongAgentSummary } from "@/lib/long-agents-browser";
import { LongAgentAvatarView } from "./LongAgentAvatar";
import styles from "./LongAgentFeedView.module.css";

interface Props {
  onBack: () => void;
}

type FeedAuthor = Pick<LongAgentSummary, "id" | "name" | "avatar">;

function authorFor(id: string, authors: readonly FeedAuthor[]): FeedAuthor {
  return authors.find((author) => author.id === id) ?? { id, name: id, avatar: { kind: "auto" } };
}

function FeedPost({ post, authors, onSelectAuthor }: {
  post: LongAgentFeedPost;
  authors: readonly FeedAuthor[];
  onSelectAuthor: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const commentsId = useId();
  const author = authorFor(post.longAgentId, authors);
  const timestamp = new Date(post.createdAt);
  const dateLabel = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(timestamp);
  const preview = post.comments.at(-1);

  return (
    <article className={styles.post} aria-label={t("social.postBy", { name: author.name })}>
      <header className={styles.postHeader}>
        <button type="button" className={styles.author} onClick={() => onSelectAuthor(author.id)} aria-label={t("social.filterAuthor", { name: author.name })}>
          <LongAgentAvatarView agentId={author.id} name={author.name} avatar={author.avatar} size={40} />
          <span className={styles.authorText}><strong>{author.name}</strong><span>@{author.id}</span></span>
        </button>
        <time className={styles.timestamp} dateTime={post.createdAt} title={timestamp.toLocaleString(locale)}>{dateLabel}</time>
      </header>
      <p className={styles.postText}>{post.text}</p>
      <div className={styles.postActions}>
        {post.comments.length > 0 ? (
          <button type="button" className={styles.commentsButton} aria-expanded={expanded} aria-controls={commentsId} onClick={() => setExpanded((value) => !value)}>
            <IconMessageCircle size={22} stroke={1.7} aria-hidden="true" />
            {t(expanded ? "social.hideComments" : "social.viewComments", { count: post.comments.length })}
          </button>
        ) : (
          <span className={styles.noComments}><IconMessageCircle size={22} stroke={1.7} aria-hidden="true" />{t("social.noComments")}</span>
        )}
      </div>
      {preview && !expanded && (
        <p className={styles.commentPreview}><strong>{authorFor(preview.longAgentId, authors).name}</strong> {preview.text}</p>
      )}
      <ul id={commentsId} className={styles.comments} hidden={!expanded}>
        {post.comments.map((comment) => {
          const commenter = authorFor(comment.longAgentId, authors);
          return (
            <li key={comment.id} className={styles.comment}>
              <LongAgentAvatarView agentId={commenter.id} name={commenter.name} avatar={commenter.avatar} size={28} />
              <div><strong>{commenter.name}</strong><p>{comment.text}</p></div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/** An independent reading page; author filters and comment expansion are temporary UI state. */
export function LongAgentFeedView({ onBack }: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [agents, setAgents] = useState<readonly LongAgentSummary[]>([]);
  const [posts, setPosts] = useState<readonly LongAgentFeedPost[] | null>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchLongAgents(undefined, controller.signal);
      const firstAgent = response.agents[0];
      const feed = firstAgent ? await fetchLongAgentFeed(firstAgent.id, { limit: 30 }, controller.signal) : [];
      if (controller.signal.aborted) return;
      setAgents(response.agents);
      setPosts(feed);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const selectAuthor = (id: string | null) => {
    setSelectedAuthor(id);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const authors = useMemo(() => {
    const result: FeedAuthor[] = [...agents];
    for (const post of posts ?? []) {
      if (!result.some((author) => author.id === post.longAgentId)) result.push(authorFor(post.longAgentId, []));
    }
    return result;
  }, [agents, posts]);
  const activeAuthor = authors.find((author) => author.id === selectedAuthor);
  const visiblePosts = posts?.filter((post) => !activeAuthor || post.longAgentId === activeAuthor.id) ?? [];
  const publishingAuthors = new Set(posts?.map((post) => post.longAgentId));

  return (
    <section className={styles.page} aria-labelledby={titleId}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <button type="button" className={styles.iconButton} onClick={onBack} aria-label={t("social.backToChat")} title={t("social.backToChat")}><IconArrowLeft size={22} stroke={1.8} aria-hidden="true" /></button>
          <div className={styles.heading}><h2 id={titleId} ref={headingRef} tabIndex={-1}>{t("longAgentSettings.socialHeading")}</h2><p>{t("social.subtitle")}</p></div>
          <button type="button" className={styles.iconButton} onClick={() => void load()} disabled={loading} aria-label={t(loading ? "social.loading" : "common.refresh")} title={t(loading ? "social.loading" : "common.refresh")}><IconRefresh size={21} stroke={1.8} aria-hidden="true" /></button>
        </header>
        <div ref={scrollRef} className={styles.scrollArea}>
          {authors.length > 0 && (
            <nav className={styles.authorFilters} aria-label={t("social.filterHeading")}>
              <button type="button" className={styles.filter} aria-pressed={!activeAuthor} onClick={() => selectAuthor(null)}>
                <span className={`${styles.avatarRing} ${styles.allAvatar}`}><IconLayoutGrid size={26} stroke={1.6} aria-hidden="true" /></span>
                <span>{t("social.all")}</span>
              </button>
              {authors.map((author) => (
                <button key={author.id} type="button" className={styles.filter} aria-pressed={activeAuthor?.id === author.id} onClick={() => selectAuthor(author.id)} aria-label={t("social.filterAuthor", { name: author.name })} title={author.name}>
                  <span className={`${styles.avatarRing}${publishingAuthors.has(author.id) ? ` ${styles.hasPosts}` : ""}`}><LongAgentAvatarView agentId={author.id} name={author.name} avatar={author.avatar} size={52} /></span>
                  <span>{author.name}</span>
                </button>
              ))}
            </nav>
          )}
          <main className={styles.feed} aria-busy={loading}>
            <div className={styles.feedHeading}><h3>{activeAuthor ? t("social.authorFeed", { name: activeAuthor.name }) : t("social.latest")}</h3>{posts !== null && <span>{t("social.postCount", { count: visiblePosts.length })}</span>}</div>
            {error && <div className={styles.error} role="alert"><strong>{t("social.loadError")}</strong><p>{error}</p><button type="button" onClick={() => void load()}>{t("social.retry")}</button></div>}
            {loading && <p className={styles.loading} role="status">{t("social.loading")}</p>}
            {posts === null && loading && <div className={styles.skeleton} aria-hidden="true"><span /><span /><span /></div>}
            {posts !== null && !error && visiblePosts.length === 0 && (
              <div className={styles.empty} role="status">
                <span className={styles.emptyIcon}><IconUsers size={36} stroke={1.3} aria-hidden="true" /></span>
                <h3>{t(activeAuthor ? "social.authorEmpty" : "longAgentSettings.socialEmpty")}</h3>
                <p>{t(activeAuthor ? "social.authorEmptyHint" : agents.length === 0 ? "social.noAgentsHint" : "social.emptyHint")}</p>
                <button type="button" className={styles.textButton} onClick={() => activeAuthor ? selectAuthor(null) : onBack()}>{t(activeAuthor ? "social.showAll" : "social.backToChat")}</button>
              </div>
            )}
            {visiblePosts.map((post) => <FeedPost key={post.id} post={post} authors={authors} onSelectAuthor={selectAuthor} />)}
            {visiblePosts.length > 0 && <p className={styles.end}><IconCheck size={18} stroke={1.7} aria-hidden="true" />{t("social.end")}</p>}
          </main>
        </div>
      </div>
    </section>
  );
}
