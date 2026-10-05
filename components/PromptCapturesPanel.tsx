import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { PromptCaptureRow as PromptCaptureRequestTree } from "./PromptCaptureTurnTree";
import { useI18n } from "@/hooks/useI18n";
import {
  groupPromptCaptures,
  parsePromptCaptureDetail,
  parsePromptCaptureList,
  regionLabelKey,
  type PromptCaptureDetail,
  type PromptCaptureList,
  type PromptCaptureRecordSummary,
} from "@/lib/prompt-captures";
import { Hint } from "./ui/Tooltip";

const REGION_FILTER_KEYS = [
  "injected-instruction",
  "current-user-message",
  "history-user",
  "assistant",
  "tool-result",
] as const;

type RegionFilter = (typeof REGION_FILTER_KEYS)[number];

const isRegionFilter = (value: string): value is RegionFilter =>
  (REGION_FILTER_KEYS as readonly string[]).includes(value);

interface ExpandedPayload {
  readonly detail: PromptCaptureDetail;
  readonly error: string | null;
}

/**
 * Full-history Prompt panel: every provider request actually sent, grouped by
 * turn → workflow/stage/agent, with region filters and payloads loaded on
 * demand (one gzip file per request). Chat-native rendering, not the Pi export.
 */
export function PromptCapturesPanel({ projectId, sessionId }: { projectId: string; sessionId: string }) {
  const { t, locale } = useI18n();
  const [list, setList] = useState<PromptCaptureList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState<ReadonlySet<RegionFilter>>(() => new Set(REGION_FILTER_KEYS));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [payloads, setPayloads] = useState<ReadonlyMap<string, ExpandedPayload>>(() => new Map());
  const [rawPayload, setRawPayload] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setList(null); setError(null); setExpanded(new Set()); setPayloads(new Map());
    void fetch(`/api/sessions/${encodeURIComponent(sessionId)}/prompt-captures?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parsePromptCaptureList(await response.json());
      })
      .then((parsed) => { if (!controller.signal.aborted) setList(parsed); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, [projectId, sessionId, revision]);

  const groups = useMemo(() => list === null ? [] : groupPromptCaptures(list.records), [list]);

  const toggleExpanded = useCallback((requestId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(requestId)) { next.delete(requestId); return next; }
      next.add(requestId);
      return next;
    });
    setPayloads((current) => {
      if (current.has(requestId)) return current;
      void fetch(`/api/sessions/${encodeURIComponent(sessionId)}/prompt-captures/${encodeURIComponent(requestId)}?projectId=${encodeURIComponent(projectId)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return parsePromptCaptureDetail(await response.json());
        })
        .then((detail) => {
          setPayloads((inner) => new Map(inner).set(requestId, { detail, error: null }));
        })
        .catch((cause: unknown) => {
          setPayloads((inner) => new Map(inner).set(requestId, { detail: null as unknown as PromptCaptureDetail, error: cause instanceof Error ? cause.message : String(cause) }));
        });
      return current;
    });
  }, [projectId, sessionId]);

  const toggleFilter = useCallback((filter: RegionFilter) => {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(filter)) next.delete(filter); else next.add(filter);
      return next;
    });
  }, []);

  const formatTime = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US", { hour12: false });
  }, [locale]);

  if (error !== null) {
    return <div className="surface-empty surface-error" role="alert"><p>{error}</p>
      <button className="workspace-button" onClick={() => setRevision(value => value + 1)}>{t("interface.retry")}</button>
    </div>;
  }
  if (list === null) return <div className="surface-empty" role="status">{t("history.loading")}</div>;
  if (list.records.length === 0) {
    return <div className="surface-empty" role="status"><p>{t("promptCapture.empty")}</p><p className="workspace-muted">{t("promptCapture.emptyHint")}</p></div>;
  }

  return <div className="ui-scroll-20 prompt-capture-panel" data-prompt-captures-panel>
    <div className="prompt-capture-filters" role="group" aria-label={t("promptCapture.filters")}>
      {REGION_FILTER_KEYS.map((filter) => (
        <label key={filter} className={`prompt-capture-filter${filters.has(filter) ? " is-active" : ""}`}>
          <input type="checkbox" checked={filters.has(filter)} onChange={() => toggleFilter(filter)} />
          {t(regionLabelKey(filter))}
        </label>
      ))}
      <label className={`prompt-capture-filter${rawPayload ? " is-active" : ""}`}>
        <input type="checkbox" checked={rawPayload} onChange={() => setRawPayload(value => !value)} />
        {t("promptCapture.rawPayload")}
      </label>
    </div>
    {groups.map((group) => <Fragment key={group.key}>
      <div className="prompt-capture-turn">
        {group.workflowId !== null ? t("promptCapture.turnWorkflow", { workflow: group.workflowId }) : t("promptCapture.turnDirect")}
      </div>
      {group.records.map((record) => <PromptCaptureRequestTree
        key={record.requestId} record={record}
        expanded={expanded.has(record.requestId)}
        payload={payloads.get(record.requestId) ?? null}
        filters={filters} rawPayload={rawPayload} formatTime={formatTime}
        onToggle={() => toggleExpanded(record.requestId)}
      />)}
    </Fragment>)}
  </div>;
}
