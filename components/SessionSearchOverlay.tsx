"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconCalendar, IconSearch } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "./ui/Button";
import { SurfaceDialog } from "./SurfaceDialog";
import { InterfaceFeedback } from "./InterfaceFeedback";
import { searchSessions, type SessionSearchResult, type SessionSearchScope } from "@/lib/session-search-browser";

export interface SessionSearchOverlayProps {
  /** 当前项目（范围默认）与该会话所属的 Long Agent。 */
  readonly projectId?: string;
  readonly ownerLongAgentId?: string;
  readonly projectName?: (projectId: string) => string;
  readonly onOpenSession: (projectId: string, sessionId: string) => void | Promise<void>;
  readonly onClose: () => void;
}

/**
 * 会话搜索浮层：按钮触发（无快捷键），输入 + 范围/日期筛选 → 结果列表（含命中片段）
 * → 选中条目在预览区查看证据 → 确认后打开。结果可能很多，所以先看证据再决定打开哪一条。
 */
export function SessionSearchOverlay({
  projectId, ownerLongAgentId, projectName, onOpenSession, onClose,
}: SessionSearchOverlayProps) {
  const { t, locale } = useI18n();
  const [scope, setScope] = useState<SessionSearchScope>(projectId === undefined ? "all" : "project");
  const [query, setQuery] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [results, setResults] = useState<readonly SessionSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const run = useCallback(async (signal?: AbortSignal) => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const found = await searchSessions({
        scope,
        ...(projectId === undefined ? {} : { projectId }),
        ...(ownerLongAgentId === undefined ? {} : { owner: ownerLongAgentId }),
        query,
        createdFrom,
        createdTo,
        includeRemoved,
      }, signal);
      if (request !== requestRef.current) return;
      setResults(found);
      setSelectedIndex(0);
    } catch (cause: unknown) {
      if ((cause as { name?: string } | null)?.name === "AbortError") return;
      if (request !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setResults([]);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [scope, projectId, ownerLongAgentId, query, createdFrom, createdTo, includeRemoved]);

  // 输入即搜索（防抖），范围与日期变化立即重查。
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { void run(controller.signal); }, 220);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [run]);

  const selected = results[selectedIndex];
  const formatTime = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value.slice(0, 10)
      : date.toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return <SurfaceDialog title={t("sessionSearch.title")} onClose={onClose}>
    <div className="session-search-filters">
      <div className="session-search-input">
        <IconSearch size={16} aria-hidden="true" />
        <input data-session-search-input autoFocus value={query} placeholder={t("sessionSearch.placeholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0))); }
            if (event.key === "ArrowUp") { event.preventDefault(); setSelectedIndex((index) => Math.max(index - 1, 0)); }
            if (event.key === "Enter" && selected !== undefined) { event.preventDefault(); void onOpenSession(selected.projectId, selected.sessionId); onClose(); }
          }} />
      </div>
      <label className="session-search-scope">
        <span>{t("sessionSearch.scope")}</span>
        <select data-session-search-scope value={scope} onChange={(event) => setScope(event.target.value as SessionSearchScope)}>
          {projectId !== undefined && <option value="project">{t("sessionSearch.scopeProject", { project: projectName?.(projectId) ?? projectId })}</option>}
          {ownerLongAgentId !== undefined && <option value="agent">{t("sessionSearch.scopeAgent")}</option>}
          <option value="all">{t("sessionSearch.scopeAll")}</option>
        </select>
      </label>
      <label className="session-search-date">
        <IconCalendar size={15} aria-hidden="true" />
        <input type="date" data-session-search-from value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} />
        <span>–</span>
        <input type="date" data-session-search-to value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} />
      </label>
      <label className="session-search-removed">
        <input type="checkbox" data-session-search-removed checked={includeRemoved}
          onChange={(event) => setIncludeRemoved(event.target.checked)} />
        <span>{t("sessionSearch.includeRemoved")}</span>
      </label>
    </div>

    <div className="session-search-body">
      <ul className="session-search-results" data-session-search-results>
        {results.map((item, index) => <li key={`${item.projectId}:${item.sessionId}`}>
          <button type="button" data-session-search-result={item.sessionId}
            className={index === selectedIndex ? "is-selected" : ""}
            onClick={() => setSelectedIndex(index)}
            onDoubleClick={() => { void onOpenSession(item.projectId, item.sessionId); onClose(); }}>
            <span className="session-search-result-title">
              {item.state === "removed" && <em>{t("sessionSearch.removedTag")}</em>}
              {item.title}
            </span>
            <small>{projectName?.(item.projectId) ?? item.projectId}{" · "}{item.messageCount} {t("laProjectTree.messagesSuffix")}{" · "}{formatTime(item.updatedAt)}</small>
            {item.snippet !== null && <small className="session-search-snippet">{item.snippet}</small>}
          </button>
        </li>)}
        {!loading && results.length === 0 && <li className="session-search-empty">{t("sessionSearch.empty")}</li>}
      </ul>

      <div className="session-search-preview" data-session-search-preview>
        {selected === undefined ? <p className="session-search-empty">{t("sessionSearch.previewHint")}</p> : <>
          <h4>{selected.title}</h4>
          <dl>
            <div><dt>{t("sessionSearch.project")}</dt><dd>{projectName?.(selected.projectId) ?? selected.projectId}</dd></div>
            <div><dt>{t("sessionSearch.created")}</dt><dd>{formatTime(selected.createdAt)}</dd></div>
            <div><dt>{t("sessionSearch.updated")}</dt><dd>{formatTime(selected.updatedAt)}</dd></div>
            <div><dt>{t("sessionSearch.messages")}</dt><dd>{selected.messageCount}</dd></div>
          </dl>
          {selected.firstMessage !== "" && <p className="session-search-first">{selected.firstMessage.slice(0, 400)}</p>}
          {selected.snippet !== null && <p className="session-search-hit" data-session-search-hit>{selected.snippet}</p>}
          <Button variant="primary" type="button" data-session-search-open
            onClick={() => { void onOpenSession(selected.projectId, selected.sessionId); onClose(); }}>
            {t("sessionSearch.open")}
          </Button>
        </>}
      </div>
    </div>

    {error !== null && <p role="alert"><InterfaceFeedback message={error} /></p>}
  </SurfaceDialog>;
}
