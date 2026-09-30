import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
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
      {group.records.map((record) => <PromptCaptureRow
        key={record.requestId} record={record}
        expanded={expanded.has(record.requestId)}
        payload={payloads.get(record.requestId) ?? null}
        filters={filters} rawPayload={rawPayload} formatTime={formatTime}
        onToggle={() => toggleExpanded(record.requestId)}
      />)}
    </Fragment>)}
  </div>;
}

function PromptCaptureRow({ record, expanded, payload, filters, rawPayload, formatTime, onToggle }: {
  readonly record: PromptCaptureRecordSummary;
  readonly expanded: boolean;
  readonly payload: ExpandedPayload | null;
  readonly filters: ReadonlySet<RegionFilter>;
  readonly rawPayload: boolean;
  readonly formatTime: (timestamp: string) => string;
  readonly onToggle: () => void;
}) {
  const { t } = useI18n();
  const agentLabel = record.agent.agentName ?? record.agent.agentId;
  return <section className="ui-card prompt-capture-record" data-prompt-capture-record={record.requestId}>
    <button className="prompt-capture-record-header" onClick={onToggle} aria-expanded={expanded} data-prompt-capture-row-toggle>
      {expanded ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}
      <span className="prompt-capture-seq">#{record.seq}</span>
      <Hint label={`${record.model.provider}/${record.model.modelId}`}>
        <span className="prompt-capture-model">{record.model.provider}/{record.model.modelId}</span>
      </Hint>
      <span className="prompt-capture-agent">{agentLabel}</span>
      <span className="prompt-capture-meta">{formatTime(record.timestamp)} · {t("promptCapture.payloadChars", { chars: record.payloadChars.toLocaleString() })}</span>
    </button>
    {expanded && <div className="prompt-capture-detail">
      {payload === null && <p className="workspace-muted" role="status">{t("promptCapture.loadingPayload")}</p>}
      {payload !== null && payload.error !== null && <p className="surface-error" role="alert">{payload.error}</p>}
      {payload !== null && payload.error === null && <PromptCaptureBody record={record} detail={payload.detail} filters={filters} rawPayload={rawPayload} />}
    </div>}
  </section>;
}

function PromptCaptureBody({ record, detail, filters, rawPayload }: {
  readonly record: PromptCaptureRecordSummary;
  readonly detail: PromptCaptureDetail;
  readonly filters: ReadonlySet<RegionFilter>;
  readonly rawPayload: boolean;
}) {
  const { t } = useI18n();
  const regions = detail.record.regions;
  const messages = detail.payload.messages ?? [];
  const systemContent = typeof detail.payload.system === "string"
    ? detail.payload.system
    : messages[0] !== undefined && messages[0]?.role === "system" ? contentText(messages[0]?.content) : null;
  // openai-completions keeps the system prompt as messages[0]; the Backend's region list excludes it.
  const body = systemContent !== null ? messages.slice(1) : messages;
  const messageRegions = regions.messages ?? [];
  const visible = body
    .map((message, index) => ({ message, region: messageRegions[index]?.region ?? "unclassified", customType: messageRegions[index]?.customType }))
    .filter(({ region }) => !isRegionFilter(region) || filters.has(region));
  return <div className="prompt-capture-body">
    {systemContent !== null && (
      <details className="prompt-capture-section" data-prompt-capture-system>
        <summary>{t("promptCapture.systemPrompt", { chars: record.regions.systemPromptChars.toLocaleString() })}</summary>
        {record.regions.systemSections.length > 0 && <div className="prompt-capture-sections-legend">
          {record.regions.systemSections.map((section, index) => (
            <span key={index} className="prompt-capture-section-chip">{section.label} · {section.chars.toLocaleString()}</span>
          ))}
        </div>}
        <pre className={`prompt-capture-block-text${false ? " is-mono" : ""}`}>{systemContent}</pre>
      </details>
    )}
    {visible.map(({ message, region, customType }, index) => <PromptCaptureBlock key={index}
      label={t(regionLabelKey(region)) + (customType !== undefined ? ` · ${customType}` : ` · ${message?.role ?? ""}`)}
      text={contentText(message?.content)}
      mono={(message?.role ?? "") === "tool"} />)}
    {record.regions.toolCount > 0 && (
      <details className="prompt-capture-section">
        <summary>{t("promptCapture.tools", { count: record.regions.toolCount })}</summary>
        {(detail.payload.tools ?? []).map((tool, index) => <div key={index} className="prompt-capture-tool">
          {tool?.function?.name ?? tool?.name ?? "?"}
        </div>)}
      </details>
    )}
    {!regions.parsed && <p className="workspace-muted">{t("promptCapture.unparsed")}{regions.parseError !== undefined ? `: ${regions.parseError}` : ""}</p>}
    {rawPayload && <details className="prompt-capture-section">
      <summary>{t("promptCapture.rawPayload")}</summary>
      <pre className="prompt-capture-raw">{JSON.stringify(detail.payload, null, 2)}</pre>
    </details>}
  </div>;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content === undefined || content === null ? "" : JSON.stringify(content);
  return content.map((block) => {
    if (typeof block === "string") return block;
    if (block !== null && typeof block === "object" && "text" in (block as Record<string, unknown>)) {
      return String((block as Record<string, unknown>).text ?? "");
    }
    return JSON.stringify(block);
  }).join("\n");
}

function PromptCaptureBlock({ label, text, mono }: { readonly label: string; readonly text: string; readonly mono: boolean }) {
  const { t } = useI18n();
  const preview = text.length > 8000 ? `${text.slice(0, 8000)}\n… ${t("promptCapture.truncated")}` : text;
  return <div className="prompt-capture-block">
    <div className="prompt-capture-block-label">{label}</div>
    <pre className={`prompt-capture-block-text${mono ? " is-mono" : ""}`}>{preview}</pre>
  </div>;
}
