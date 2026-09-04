"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { fetchChatTools, type ChatToolCatalogEntry } from "@/lib/tools-browser";

function scopeColor(scope: string): string {
  if (scope === "system") return "var(--accent)";
  if (scope === "project") return "#6366f1";
  return "var(--text-dim)";
}

export function ToolsConfig({ projectId, onClose }: { readonly projectId: string; readonly onClose: () => void }) {
  const isMobile = useIsMobile();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tools, setTools] = useState<readonly ChatToolCatalogEntry[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchChatTools(projectId, controller.signal)
      .then((result) => {
        setTools(result.tools);
        setSelectedAddress((current) => current ?? result.tools[0]?.address ?? null);
        setError(result.diagnostics.length === 0 ? null : result.diagnostics.map((item) => item.message).join("；"));
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [projectId]);

  const selected = useMemo(
    () => tools.find((tool) => tool.address === selectedAddress) ?? null,
    [selectedAddress, tools],
  );
  const close = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      style={{ border: "none", padding: 0, background: "transparent", maxWidth: "none", maxHeight: "none" }}
    >
      <div style={{ width: isMobile ? "calc(100vw - 16px)" : 920, maxWidth: "calc(100vw - 16px)", height: isMobile ? "calc(100dvh - 16px)" : "78vh", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
          <div><strong>Tools</strong><small style={{ marginLeft: 10, color: "var(--text-muted)" }}>Project: {projectId}</small></div>
          <button type="button" onClick={close} style={{ border: "none", background: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>×</button>
        </header>
        <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: 0 }}>
          <aside style={{ width: isMobile ? "100%" : 280, maxHeight: isMobile ? "40vh" : undefined, overflowY: "auto", borderRight: isMobile ? "none" : "1px solid var(--border)", borderBottom: isMobile ? "1px solid var(--border)" : "none", background: "var(--bg-panel)" }}>
            {loading && <p style={{ padding: 12, color: "var(--text-muted)" }}>Loading…</p>}
            {tools.map((tool) => (
              <button
                key={tool.address}
                type="button"
                onClick={() => setSelectedAddress(tool.address)}
                style={{ width: "100%", display: "grid", gap: 3, textAlign: "left", padding: "9px 12px", border: "none", borderBottom: "1px solid var(--border)", background: tool.address === selectedAddress ? "var(--bg-selected)" : "transparent", color: "var(--text)", cursor: "pointer" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{tool.name}</span>
                <small style={{ color: scopeColor(tool.sourceInfo.scope) }}>{tool.sourceInfo.scope} · {tool.sourceInfo.source}</small>
              </button>
            ))}
          </aside>
          <main style={{ flex: 1, overflowY: "auto", padding: 18 }}>
            {error && <p style={{ color: "#ef4444" }}>{error}</p>}
            {selected && (
              <div style={{ display: "grid", gap: 14 }}>
                <div><h2 style={{ margin: 0 }}>{selected.label}</h2><code>{selected.address}</code></div>
                <p style={{ margin: 0 }}>{selected.description}</p>
                <dl style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8, margin: 0 }}>
                  <dt>来源</dt><dd>{selected.sourceInfo.scope} / {selected.sourceInfo.source} / {selected.sourceInfo.origin}</dd>
                  <dt>版本</dt><dd>{selected.toolVersion ?? selected.version?.contentHash ?? selected.version?.modifiedAt ?? "未提供"}</dd>
                  <dt>风险</dt><dd>{selected.risk ?? "未声明"}</dd>
                  <dt>权限</dt><dd>{selected.permissions.join("、") || "未声明"}</dd>
                </dl>
                <section>
                  <h3>Workflow Agent 使用关系</h3>
                  {selected.consumers.length === 0 ? <p>没有默认或Project配置使用者。</p> : (
                    <ul>
                      {selected.consumers.map((consumer) => (
                        <li key={`${consumer.source}:${consumer.workflowId}:${consumer.agentId}`}>
                          {consumer.workflowId} / {consumer.agentId} · {consumer.source} · {consumer.enabled ? "启用" : "禁用"}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      </div>
    </dialog>
  );
}
