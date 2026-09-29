"use client";

import { InterfaceFeedback } from "./InterfaceFeedback";
import { SurfaceDialog } from "./SurfaceDialog";
import { Button } from "./ui/Button";

import { ConfigurationToggle as Toggle } from "./ConfigurationToggle";

import { useI18n } from "@/hooks/useI18n";


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
  const { t } = useI18n();
  return (
    <span
      style={{
        fontSize: 12,
        padding: "1px 5px",
        borderRadius: 3,
        flexShrink: 0,
        background: scope === "project" ? "var(--bg-selected)" : "rgba(120,120,120,0.12)",
        color: scope === "project" ? "var(--accent)" : "var(--text-dim)",
      }}
    >
      {t(scope === "project" ? "design.scopeProject" : "design.scopePersonal")}
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
  const { t } = useI18n();
  const enabled = ext.enabled;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180, flex: 1 }}>
          {ext.canToggle ? (
            <div className="ui-stack-5">
              <div className="ui-row-center-6">
                <span style={{ fontSize: 12, color: "var(--text-dim)", width: 52, flexShrink: 0 }}>{t("design.persistentSetting")}</span>
                <Toggle
                  enabled={enabled}
                  loading={busy}
                  onToggle={onToggle}
                  label={t(enabled ? "design.disableExtension" : "design.enableExtension")}
                />
              </div>
              {sessionId && enabled && (
                <div className="ui-row-center-6">
                  <span style={{ fontSize: 12, color: "var(--text-dim)", width: 52, flexShrink: 0 }}>{t("design.thisSession")}</span>
                  <Toggle
                    enabled={!sessionDisabled}
                    loading={sessionBusy || busy}
                    onToggle={onSessionToggle}
                    label={t(sessionDisabled ? "design.enableThisSession" : "design.disableThisSession")}
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
              {t("i18n.disabled")}
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
              {t("design.recordedRequests")}
            </button>
          )}
          <button
            onClick={onReloadSession}
            disabled={!sessionId || busy}
            style={buttonStyle(!sessionId || busy)}
            title={t(sessionId ? "design.reloadSessionHint" : "design.openSessionHint")}
          >
            {t("i18n.reloadSession")}
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
        <div className="ui-dim">{t("design.resourcePath")}</div>
        <div className="ui-mono-muted">
          {shortenPath(ext.enabled ? ext.path : ext.disabledPath ?? ext.path)}
        </div>
        <div className="ui-dim">{t("design.resourceOrigin")}</div>
        <div className="ui-muted">
          {t(ext.origin === "package" ? "design.packageOrigin" : "design.fileOrigin")}
        </div>
        <div className="ui-dim">{t("design.resourceSource")}</div>
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{ext.source}</div>
        <div className="ui-dim">{t("design.workingDirectory")}</div>
        <div style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>
          {shortenPath(cwd)}
        </div>
      </div>

      {!ext.canToggle && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
          {t(ext.origin === "package" ? "design.extensionManagedByPlugin" : "design.extensionNoToggle")}
        </div>
      )}
      {ext.canToggle && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
          {t("design.extensionToggleHint")}
        </div>
      )}

      {actionMessage && <div style={{ fontSize: 12, color: "var(--success)" }}>{actionMessage}</div>}
      {actionError && <div className="ui-error-12"><InterfaceFeedback message={actionError} /></div>}
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
  const { t } = useI18n();
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
    setActionMessage(t("interface.configuration.applies.when.the.next.workflow.runs"));
  }, [sessionId]);

  const busy = busyPath !== null || reloadBusy;

  if (viewMode === "requests") {
    return <ProviderRequests cwd={cwd} onClose={() => setViewMode("detail")} />;
  }

  return <SurfaceDialog title={t("interface.extensions")} description={shortenPath(cwd)} onClose={onClose}>
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
                <div className="ui-list-note">{t("i18n.loading")}</div>
              ) : error ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--danger)" }}><InterfaceFeedback message={error} /></div>
              ) : extensions.length === 0 ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-dim)" }}>
                  {t("design.extensionsEmpty")}
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.scope} className="ui-mb-6">
                    <div
                      style={{
                        padding: "4px 8px 3px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-dim)",
                        textTransform: "uppercase",
                      }}
                    >
                      {t(group.scope === "project" ? "design.scopeProject" : "design.scopePersonal")}
                    </div>
                    {group.items.map((ext) => {
                      const isSelected = selected === ext.path;
                      return (
                        <button type="button" className="resource-nav-button" aria-pressed={isSelected}
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
                          <div className="ui-grow">
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
                              {ext.origin} · {ext.enabled ? t("interface.on") : t("interface.off")}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="ui-scroll-20">
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
                  {t("design.selectExtension")}
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
                {t("design.extensionErrors", { count: data.errors.length })}
              </span>
            ) : data ? (
              <span>
                {t("design.extensionCount", { count: extensions.length, enabled: extensions.filter((e) => e.enabled).length })}
              </span>
            ) : null}
          </div>
          <Button variant="secondary" type="button" onClick={() => void load()} disabled={loading || busy}>
            {t("common.refresh")}
          </Button>
</div>
  </SurfaceDialog>;
}
