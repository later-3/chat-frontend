"use client";

import { ConfigurationToggle as Toggle } from "./ConfigurationToggle";

import { useDialogFocus } from "@/hooks/useDialogFocus";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ProviderRequests } from "./ProviderRequests";
import type { ExtensionInfo, ExtensionsResponse } from "@/lib/api-types";

function shortenPath(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

function statusColor(ext: ExtensionInfo): string {
  if (!ext.enabled) return "var(--text-dim)";
  return "var(--accent)";
}

function buttonStyle(disabled?: boolean, danger?: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    background: danger ? "var(--danger-bg)" : "none",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: danger ? "var(--danger)" : "var(--text-muted)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    opacity: disabled ? 0.5 : 1,
  };
}

function ScopeTag({ scope }: { scope: "global" | "project" }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "1px 5px",
        borderRadius: 3,
        flexShrink: 0,
        background: scope === "project" ? "rgba(99,102,241,0.12)" : "rgba(120,120,120,0.12)",
        color: scope === "project" ? "rgba(99,102,241,0.85)" : "var(--text-dim)",
      }}
    >
      {scope}
    </span>
  );
}

function hasProviderRequests(ext: ExtensionInfo): boolean {
  return ext.name.includes("provider-request") || ext.name.includes("provider-review");
}

function ExtensionDetail({
  ext,
  cwd,
  busy,
  actionError,
  actionMessage,
  sessionId,
  sessionDisabled,
  sessionBusy,
  onToggle,
  onSessionToggle,
  onReloadSession,
  onViewRequests,
}: {
  ext: ExtensionInfo;
  cwd: string;
  busy: boolean;
  actionError: string | null;
  actionMessage: string | null;
  sessionId: string | null;
  sessionDisabled: boolean;
  sessionBusy: boolean;
  onToggle: () => void;
  onSessionToggle: () => void;
  onReloadSession: () => void;
  onViewRequests: () => void;
}) {
  const enabled = ext.enabled;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180, flex: 1 }}>
          {ext.canToggle ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-dim)", width: 52, flexShrink: 0 }}>Global</span>
                <Toggle
                  enabled={enabled}
                  loading={busy}
                  onToggle={onToggle}
                  label={enabled ? "Disable extension (rename .ts.disabled)" : "Enable extension"}
                />
              </div>
              {sessionId && enabled && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)", width: 52, flexShrink: 0 }}>Session</span>
                  <Toggle
                    enabled={!sessionDisabled}
                    loading={sessionBusy || busy}
                    onToggle={onSessionToggle}
                    label={sessionDisabled ? "Enable for this session" : "Disable for this session"}
                  />
                </div>
              )}
            </div>
          ) : null}
          <ScopeTag scope={ext.scope} />
          <span
            style={{
              fontSize: 12,
              padding: "1px 5px",
              borderRadius: 3,
              background: ext.origin === "package" ? "rgba(34,197,94,0.12)" : "rgba(120,120,120,0.12)",
              color: ext.origin === "package" ? "var(--success)" : "var(--text-dim)",
            }}
          >
            {ext.origin}
          </span>
          {!enabled && (
            <span style={{ fontSize: 12, padding: "1px 5px", borderRadius: 3, background: "rgba(120,120,120,0.12)", color: "var(--text-dim)" }}>
              disabled
            </span>
          )}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {ext.name}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hasProviderRequests(ext) && (
            <button onClick={onViewRequests} style={buttonStyle(false)}>
              View recorded requests
            </button>
          )}
          <button
            onClick={onReloadSession}
            disabled={!sessionId || busy}
            style={buttonStyle(!sessionId || busy)}
            title={sessionId ? "Reload current session to apply changes" : "Open a session to reload"}
          >
            Reload session
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(96px, 130px) minmax(0, 1fr)",
          gap: "9px 14px",
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        <div style={{ color: "var(--text-dim)" }}>Path</div>
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>
          {shortenPath(ext.enabled ? ext.path : ext.disabledPath ?? ext.path)}
        </div>
        <div style={{ color: "var(--text-dim)" }}>Origin</div>
        <div style={{ color: "var(--text-muted)" }}>
          {ext.origin === "package" ? "package" : "auto-discovered file"}
        </div>
        <div style={{ color: "var(--text-dim)" }}>Source</div>
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{ext.source}</div>
        <div style={{ color: "var(--text-dim)" }}>Cwd</div>
        <div style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>
          {shortenPath(cwd)}
        </div>
      </div>

      {!ext.canToggle && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
          This extension cannot be toggled from the web UI.{" "}
          {ext.origin === "package"
            ? "Package extensions are managed in the Plugins panel."
            : "Directory-form extensions are not supported yet."}
        </div>
      )}
      {ext.canToggle && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
          Toggling renames <code style={{ fontFamily: "var(--font-mono)" }}>foo.ts</code> ↔{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>foo.ts.disabled</code> on disk (global effect).
          The change applies when Chat Workflow starts its next AgentSession.
        </div>
      )}

      {actionMessage && <div style={{ fontSize: 12, color: "var(--success)" }}>{actionMessage}</div>}
      {actionError && <div style={{ fontSize: 12, color: "var(--danger)", whiteSpace: "pre-wrap" }}>{actionError}</div>}
    </div>
  );
}

export function ExtensionsConfig({
  projectId,
  cwd,
  sessionId,
  onClose,
}: {
  projectId: string;
  cwd: string;
  sessionId: string | null;
  onClose: () => void;
  onReloaded?: () => void;
}) {
  const modalRef = useDialogFocus(onClose);
  const isMobile = useIsMobile();
  const [data, setData] = useState<ExtensionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [sessionBusyPath, setSessionBusyPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"detail" | "requests">("detail");
  const reloadBusy = false;

  const extensions = useMemo(() => data?.extensions ?? [], [data?.extensions]);

  const grouped = useMemo(() => {
    return (["global", "project"] as const)
      .map((scope) => ({ scope, items: extensions.filter((e) => e.scope === scope) }))
      .filter((g) => g.items.length > 0);
  }, [extensions]);

  const selectedExt = extensions.find((e) => e.path === selected) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/extensions?projectId=${encodeURIComponent(projectId)}&cwd=${encodeURIComponent(cwd)}${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ""}`;
      const res = await fetch(url);
      const next = (await res.json()) as ExtensionsResponse & { error?: string };
      if (!res.ok || next.error) throw new Error(next.error ?? `HTTP ${res.status}`);
      setData(next);
      setSelected((cur) => {
        if (cur && next.extensions.some((e) => e.path === cur)) return cur;
        return next.extensions[0]?.path ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd, projectId, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(async (ext: ExtensionInfo) => {
    setBusyPath(ext.path);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: ext.enabled ? "disable" : "enable", path: ext.path, cwd }),
      });
      const next = (await res.json()) as ExtensionsResponse & { error?: string; success?: boolean };
      if (!res.ok || next.error) throw new Error(next.error ?? `HTTP ${res.status}`);
      setData(next);
      setActionMessage(ext.enabled ? "Extension disabled." : "Extension enabled.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyPath(null);
    }
  }, [cwd, projectId]);

  const sessionToggle = useCallback(async (ext: ExtensionInfo) => {
    if (!sessionId) return;
    setSessionBusyPath(ext.path);
    setActionError(null);
    setActionMessage(null);
    try {
      const action = ext.sessionDisabled ? "session_enable" : "session_disable";
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action, path: ext.path, cwd, sessionId }),
      });
      const next = (await res.json()) as ExtensionsResponse & { error?: string; success?: boolean };
      if (!res.ok || next.error) throw new Error(next.error ?? `HTTP ${res.status}`);
      setData(next);
      setActionMessage(ext.sessionDisabled ? "Enabled for future Workflow runs." : "Disabled for future Workflow runs.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSessionBusyPath(null);
    }
  }, [cwd, projectId, sessionId]);

  const reloadSession = useCallback(async () => {
    if (!sessionId) return;
    setActionMessage("Chat前端不持有AgentSession；配置会在后续Workflow运行时生效。");
  }, [sessionId]);

  const busy = busyPath !== null || reloadBusy;

  if (viewMode === "requests") {
    return <ProviderRequests cwd={cwd} onClose={() => setViewMode("detail")} />;
  }

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" tabIndex={-1} aria-label="Extensions" className="configuration-dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: isMobile ? "calc(100vw - 16px)" : 920,
          maxWidth: "calc(100vw - 16px)",
          height: isMobile ? "calc(100dvh - 16px)" : "78vh",
          maxHeight: "calc(100dvh - 16px)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Extensions</span>
            <code
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {shortenPath(cwd)}
            </code>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
            <div
              style={{
                width: isMobile ? "100%" : 230,
                maxHeight: isMobile ? "40vh" : undefined,
                borderRight: isMobile ? "none" : "1px solid var(--border)",
                borderBottom: isMobile ? "1px solid var(--border)" : "none",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                background: "var(--bg-panel)",
                overflowY: "auto",
              }}
            >
              {loading ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
              ) : error ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--danger)" }}>{error}</div>
              ) : extensions.length === 0 ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-dim)" }}>
                  No extensions found. Drop a .ts file in ~/.pi/agent/extensions/.
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.scope} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        padding: "4px 8px 3px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-dim)",
                        textTransform: "uppercase",
                      }}
                    >
                      {group.scope}
                    </div>
                    {group.items.map((ext) => {
                      const isSelected = selected === ext.path;
                      return (
                        <div
                          key={ext.path}
                          onClick={() => {
                            setSelected(ext.path);
                            setActionError(null);
                            setActionMessage(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "8px 8px",
                            borderRadius: 5,
                            cursor: "pointer",
                            background: isSelected ? "var(--bg-selected)" : "none",
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "none";
                          }}
                        >
                          <span
                            style={{
                              flexShrink: 0,
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: statusColor(ext),
                            }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: isSelected ? 600 : 400,
                                color: ext.enabled ? "var(--text)" : "var(--text-dim)",
                                fontFamily: "var(--font-mono)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {ext.name}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--text-dim)",
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {ext.origin} · {ext.enabled ? "on" : "off"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {loading ? null : selectedExt ? (
                <ExtensionDetail
                  ext={selectedExt}
                  cwd={cwd}
                  busy={busy}
                  actionError={actionError}
                  actionMessage={actionMessage}
                  sessionId={sessionId}
                  sessionDisabled={selectedExt.sessionDisabled ?? false}
                  sessionBusy={sessionBusyPath === selectedExt.path}
                  onToggle={() => void toggle(selectedExt)}
                  onSessionToggle={() => void sessionToggle(selectedExt)}
                  onReloadSession={() => void reloadSession()}
                  onViewRequests={() => setViewMode("requests")}
                />
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
                  Select an extension
                </div>
              )}
            </div>
          </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 18px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1, fontSize: 12, color: "var(--text-dim)", overflow: "hidden" }}>
            {data?.errors?.length ? (
              <span
                title={data.errors.map((e) => `${e.path}: ${e.error}`).join("\n")}
                style={{ color: "var(--warning)" }}
              >
                {data.errors.length} error{data.errors.length === 1 ? "" : "s"}
              </span>
            ) : data ? (
              <span>
                {extensions.length} extension{extensions.length === 1 ? "" : "s"} ·{" "}
                {extensions.filter((e) => e.enabled).length} enabled
              </span>
            ) : null}
          </div>
          <button onClick={() => void load()} disabled={loading || busy} style={buttonStyle(loading || busy)}>
            Refresh
          </button>
          <button onClick={onClose} style={buttonStyle(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
