"use client";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { Fragment } from "react";
import { Hint } from "./ui/Tooltip";
import { regionLabelKey, type PromptCaptureDetail, type PromptCaptureRecordSummary } from "@/lib/prompt-captures";

export const REGION_FILTER_KEYS = [
  "injected-instruction",
  "current-user-message",
  "history-user",
  "assistant",
  "tool-result",
] as const;

export type RegionFilter = (typeof REGION_FILTER_KEYS)[number];

export const isRegionFilter = (value: string): value is RegionFilter =>
  (REGION_FILTER_KEYS as readonly string[]).includes(value);

export interface ExpandedPayload {
  readonly detail: PromptCaptureDetail;
  readonly error: string | null;
}

export function PromptCaptureRow({ record, expanded, payload, filters, rawPayload, formatTime, onToggle }: {
  readonly record: PromptCaptureRecordSummary;
  readonly expanded: boolean;
  /** detail 为 null = 详情仍在加载；error 非 null = 加载失败（可见错误，不伪装成功）。 */
  readonly payload: { readonly detail: PromptCaptureDetail | null; readonly error: string | null } | null;
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
    {expanded && payload === null && <p className="workspace-muted" role="status">{t("promptCapture.loadingPayload")}</p>}
    {expanded && payload !== null && payload.error !== null && <p className="surface-error" role="alert">{payload.error}</p>}
    {expanded && payload !== null && payload.error === null && payload.detail !== null && <div className="prompt-capture-detail">
      <PromptCaptureBody record={record} detail={payload.detail} filters={filters} rawPayload={rawPayload} />
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
