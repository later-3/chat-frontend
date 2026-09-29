"use client";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useI18n } from "@/hooks/useI18n";

import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ProviderRequestDetail,
  ProviderRequestsResponse,
  ProviderRequestSummary,
} from "@/lib/api-types";

function shortenPath(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtSize(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)} KB`;
  return `${n} B`;
}

const ROLE_COLORS: Record<string, string> = {
  system: "var(--text-dim)",
  user: "var(--accent)",
  assistant: "var(--success)",
  tool: "var(--warning)",
  developer: "var(--accent)",
};

function roleColor(role: string): string {
  return ROLE_COLORS[role] ?? "var(--text-muted)";
}

function truncate(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}

function contentSummary(content: unknown): string {
  if (typeof content === "string") return truncate(content, 80);
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        const type = typeof p.type === "string" ? p.type : "";
        if (
          (type === "text" || type === "input_text" || type === "output_text") &&
          typeof p.text === "string"
        ) {
          return truncate(p.text, 80);
        }
      }
    }
    const types = content.map((p) =>
      p && typeof p === "object" && "type" in p
        ? String((p as { type: unknown }).type)
        : "?",
    );
    return `[${types.join(", ")}]`;
  }
  return "";
}

/** Parse a possibly-stringified JSON value (OpenAI tool args are strings). */
function parseMaybeJson(v: unknown): unknown {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

function JsonBlock({ value, maxHeight = 320 }: { value: unknown; maxHeight?: number }) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <pre
      style={{
        margin: 0,
        padding: 10,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        overflow: "auto",
        maxHeight,
        fontSize: 12,
        lineHeight: 1.5,
        fontFamily: "var(--font-mono)",
        color: "var(--text-muted)",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }}
    >
      {text}
    </pre>
  );
}

function Collapsible({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "7px 10px",
          background: "var(--bg-panel)",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ color: "var(--text-dim)", width: 12, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {summary}
        </span>
      </button>
      {open && <div style={{ padding: 10 }}>{children}</div>}
    </div>
  );
}

function TextPart({ text }: { text: string }) {
  const { t: tr, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 600;
  const shown = expanded || !long ? text : text.slice(0, 600);
  return (
    <div className="ui-minw">
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontSize: 12,
          lineHeight: 1.55,
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          maxHeight: expanded ? "none" : long ? 180 : "none",
          overflow: expanded ? "visible" : long ? "hidden" : "visible",
        }}
      >
        {shown}
        {long && !expanded && "…"}
      </pre>
      {long && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            marginTop: 4,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--accent)",
            fontSize: 12,
            padding: 0,
          }}
        >
          {expanded ? tr("interface.collapse") : tr("request.expand", { count: text.length.toLocaleString(locale) })}
        </button>
      )}
    </div>
  );
}

function MessagePart({ part }: { part: unknown }) {
  const { t: tr } = useI18n();
  const p = (part ?? {}) as Record<string, unknown>;
  const type = typeof p.type === "string" ? p.type : "unknown";
  const norm = type === "input_text" || type === "output_text" ? "text" : type;
  if (norm === "text" && typeof p.text === "string") {
    return <TextPart text={p.text} />;
  }
  if (norm === "image_url" || norm === "image" || norm === "input_image") {
    const url = (p.image_url as { url?: string } | undefined)?.url ?? (p as { url?: string }).url;
    return (
      <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>{tr("interface..image")}{url ? `: ${truncate(url, 60)}` : ""}]
      </div>
    );
  }
  if (norm === "tool_use" || norm === "function_call") {
    const name = (p as { name?: string }).name ?? tr("request.unknown");
    return (
      <div className="ui-stack-4">
        <div className="ui-mono-warning">
          {tr("request.toolCall")}: {name}
        </div>
        <JsonBlock value={parseMaybeJson(p.input ?? p.arguments)} maxHeight={240} />
      </div>
    );
  }
  if (norm === "tool_result" || norm === "function_call_output") {
    return (
      <div className="ui-stack-4">
        <div className="ui-mono-warning">
          {tr("request.toolResult")}
        </div>
        <JsonBlock value={parseMaybeJson(p.content ?? p.output)} maxHeight={240} />
      </div>
    );
  }
  return <JsonBlock value={part} maxHeight={240} />;
}

function MessageView({ message }: { message: unknown }) {
  const { t: tr } = useI18n();
  const m = (message ?? {}) as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const content = m.content;
  const toolCalls = Array.isArray(m.tool_calls) ? m.tool_calls : null;

  const summary = contentSummary(content);

  return (
    <Collapsible
      defaultOpen={false}
      summary={
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              color: roleColor(role),
              fontWeight: 700,
              textTransform: "uppercase",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}
          >
            {ROLE_COLORS[role] ? tr(`request.${role}`) : role}
          </span>
          {toolCalls && toolCalls.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--warning)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
              {tr("request.toolCalls", { count: toolCalls.length })}
            </span>
          )}
          <span style={{ color: "var(--text-dim)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {summary}
          </span>
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {typeof content === "string" ? (
          <TextPart text={content} />
        ) : Array.isArray(content) ? (
          content.map((part, i) => <MessagePart key={i} part={part} />)
        ) : content != null ? (
          <JsonBlock value={content} />
        ) : null}
        {toolCalls?.map((tc, i) => {
          const t = (tc ?? {}) as Record<string, unknown>;
          const fn = (t.function ?? {}) as Record<string, unknown>;
          const name = typeof fn.name === "string" ? fn.name : tr("request.unknown");
          return (
            <div key={i} className="ui-stack-4">
              <div className="ui-mono-warning">
                {tr("request.toolCall")}: {name}
              </div>
              <JsonBlock value={parseMaybeJson(fn.arguments)} maxHeight={240} />
            </div>
          );
        })}
      </div>
    </Collapsible>
  );
}

function ToolView({ tool }: { tool: unknown }) {
  const { t: tr } = useI18n();
  const t = (tool ?? {}) as Record<string, unknown>;
  const fn = (t.function ?? t) as Record<string, unknown>;
  const name = typeof fn.name === "string" ? fn.name : tr("request.unknown");
  const desc = typeof fn.description === "string" ? fn.description : undefined;
  const params = fn.parameters ?? fn.input_schema;
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)" }}>{name}</span>
        {typeof t.type === "string" && (
          <span className="ui-dim-12">{t.type}</span>
        )}
      </div>
      {desc && <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>}
      {params != null && (
        <Collapsible summary={tr("request.parameters")}>
          <JsonBlock value={params} maxHeight={300} />
        </Collapsible>
      )}
    </div>
  );
}

function Detail({ detail }: { detail: ProviderRequestDetail }) {
  const { t: tr } = useI18n();
  const payload = (detail.payload ?? {}) as Record<string, unknown>;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const tools = Array.isArray(payload.tools) ? payload.tools : [];
  const s = detail.summary;
  const roles = Object.entries(s.roles).sort((a, b) => b[1] - a[1]);

  const summaryRows: Array<[string, React.ReactNode]> = [
    [tr("request.model"), s.model ?? "—"],
    [tr("request.messages"), `${s.messageCount}`],
    [tr("request.tools"), `${s.toolCount}`],
    [tr("request.stream"), s.stream === undefined ? "—" : tr(s.stream ? "request.yes" : "request.no")],
    [tr("request.maxTokens"), s.maxTokens === undefined ? "—" : String(s.maxTokens)],
    [tr("request.reasoning"), s.reasoningEffort ?? "—"],
  ];
  if (s.thinking != null) {
    summaryRows.push([tr("request.thinking"), <JsonBlock key="t" value={s.thinking} maxHeight={120} />]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
      <div>
        <div className="ui-subheading">{tr("interface.summary")}</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(110px, 150px) minmax(0, 1fr)",
            gap: "7px 14px",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {summaryRows.map(([label, value]) => (
            <div key={String(label)} style={{ display: "contents" }}>
              <div className="ui-dim">{label}</div>
              <div className="ui-mono-muted">{value}</div>
            </div>
          ))}
          {roles.length > 0 && (
            <>
              <div className="ui-dim">{tr("interface.by.role")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {roles.map(([role, count]) => (
                  <span
                    key={ROLE_COLORS[role] ? tr(`request.${role}`) : role}
                    style={{
                      fontSize: 12,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "var(--bg-panel)",
                      color: roleColor(role),
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {ROLE_COLORS[role] ? tr(`request.${role}`) : role}: {count}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="ui-subheading">{tr("request.messageCount", { count: messages.length })}
        </div>
        <div className="ui-stack-6">
          {messages.map((m, i) => (
            <MessageView key={i} message={m} />
          ))}
          {messages.length === 0 && (
            <div className="ui-dim-12">{tr("interface.no.messages.in.this.request")}</div>
          )}
        </div>
      </div>

      {tools.length > 0 && (
        <div>
          <div className="ui-subheading">{tr("request.toolCount", { count: tools.length })}
          </div>
          <div className="ui-stack-6">
            {tools.map((t, i) => (
              <ToolView key={i} tool={t} />
            ))}
          </div>
        </div>
      )}

      <Collapsible summary={tr("request.raw")}>
        <JsonBlock value={detail.payload} maxHeight={600} />
      </Collapsible>
    </div>
  );
}

// ── Icons ──

function IconListCollapse() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function IconListExpand() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <polyline points="14 8 18 12 14 16" />
    </svg>
  );
}

function IconFullscreen() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function IconWindow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

const headerBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
  background: "none",
  border: "1px solid transparent",
  borderRadius: 5,
  color: "var(--text-muted)",
  cursor: "pointer",
  transition: "background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)",
};

export function ProviderRequests({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const { t: tr } = useI18n();
  const modalRef = useDialogFocus(onClose);
  const [list, setList] = useState<ProviderRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProviderRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/provider-requests?cwd=${encodeURIComponent(cwd)}`);
      const d = (await res.json()) as ProviderRequestsResponse & { error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      setList(d.requests ?? []);
      setSelectedFile((cur) => cur ?? (d.requests[0]?.file ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedFile) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    fetch(`/api/provider-requests?cwd=${encodeURIComponent(cwd)}&file=${encodeURIComponent(selectedFile)}`)
      .then(async (res) => {
        const d = (await res.json()) as ProviderRequestDetail & { error?: string };
        if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
        return d as ProviderRequestDetail;
      })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setDetailError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, selectedFile]);

  const overlayStyle: React.CSSProperties = fullscreen
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }
    : {
        position: "fixed",
        inset: 24,
        zIndex: 1100,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
      };

  return (
    <>
      {/* Backdrop (window mode only) */}
      {!fullscreen && (
        <div
          className="ui-scrim"
          onClick={onClose}
        />
      )}

      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={tr("interface.provider.requests")} className="configuration-dialog provider-requests-dialog" style={overlayStyle}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>{tr("interface.provider.requests")}</span>
          <code
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {shortenPath(cwd)}
          </code>

          <div style={{ flex: 1 }} />

          <button
            onClick={() => setListCollapsed((c) => !c)}
            title={listCollapsed ? tr("interface.show.request.list") : tr("interface.hide.request.list")}
            aria-label={listCollapsed ? tr("interface.show.list") : tr("interface.hide.list")}
            style={headerBtnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {listCollapsed ? <IconListExpand /> : <IconListCollapse />}
          </button>

          <button
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? tr("interface.window.mode") : tr("interface.fullscreen")}
            aria-label={fullscreen ? tr("interface.window.mode") : tr("interface.fullscreen")}
            style={headerBtnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {fullscreen ? <IconWindow /> : <IconFullscreen />}
          </button>

          <button
            onClick={onClose}
            title={tr("interface.close")}
            aria-label={tr("interface.close")}
            style={{
              ...headerBtnStyle,
              fontSize: 18,
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: request list */}
          {!listCollapsed && (
            <div
              style={{
                width: 260,
                flexShrink: 0,
                borderRight: "1px solid var(--border)",
                overflowY: "auto",
                background: "var(--bg-panel)",
              }}
            >
              {loading ? (
                <div style={{ padding: 12, fontSize: 12, color: "var(--text-muted)" }}>{tr("interface.loading")}</div>
              ) : error ? (
                <div style={{ padding: 12, fontSize: 12, color: "var(--danger)" }}><InterfaceFeedback message={error} /></div>
              ) : list.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7 }}>{tr("interface.no.provider.requests.have.been.recorded")}<div style={{ marginTop: 6 }}>{tr("interface.enable.the")}{" "}
                    <code style={{ fontFamily: "var(--font-mono)" }}>provider-request-review</code>{" "}{tr("interface.extension.then.send.a.message")}</div>
                </div>
              ) : (
                list.map((r) => {
                  const isSelected = selectedFile === r.file;
                  return (
                    <button
                      key={r.file}
                      onClick={() => setSelectedFile(r.file)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: isSelected ? "var(--bg-selected)" : "none",
                        border: "none",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = isSelected ? "var(--bg-selected)" : "none";
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          color: isSelected ? "var(--text)" : "var(--text-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.file}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                        {r.model && (
                          <span style={{ fontSize: 12, color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                            {r.model}
                          </span>
                        )}
                        <span className="ui-dim-12">{r.messageCount}{tr("interface.messages.2")}</span>
                        <span className="ui-dim-12">{r.toolCount}{tr("interface.tools.3")}</span>
                        <span className="ui-dim-12">{fmtSize(r.size)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>
                        {fmtTime(r.mtime)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Right: detail */}
          <div style={{ flex: 1, overflowY: "auto", minWidth: 0, padding: 16 }}>
            {detailLoading ? (
              <div style={{ padding: 12, fontSize: 12, color: "var(--text-muted)" }}>{tr("interface.loading.request.data")}</div>
            ) : detailError ? (
              <div style={{ padding: 12, fontSize: 12, color: "var(--danger)" }}><InterfaceFeedback message={detailError} /></div>
            ) : detail ? (
              <Detail detail={detail} />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-dim)",
                  fontSize: 13,
                }}
              >
                {list.length > 0 ? tr("interface.select.a.request") : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
