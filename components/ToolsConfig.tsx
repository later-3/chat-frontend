
import { InterfaceFeedback } from "./InterfaceFeedback";

import { useI18n } from "@/hooks/useI18n";
import { useEffect, useMemo, useState } from "react";
import { SurfaceDialog } from "./SurfaceDialog";
import { fetchChatTools, type ChatToolCatalogEntry, type ChatToolsResponse } from "@/lib/tools-browser";

export function ToolsConfig({ projectId, onClose }: { readonly projectId: string; readonly onClose: () => void }) {
  const { t: tr } = useI18n();
  const [tools, setTools] = useState<readonly ChatToolCatalogEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<ChatToolsResponse["diagnostics"]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDiagnostics([]);
    setTools([]);
    void fetchChatTools(projectId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setTools(result.tools);
      setDiagnostics(result.diagnostics);
      setSelectedAddress(current => result.tools.some(tool => tool.address === current) ? current : result.tools[0]?.address ?? null);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, revision]);

  const visible = useMemo(() => tools.filter(tool => `${tool.name} ${tool.label} ${tool.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [query, tools]);
  const selected = tools.find(tool => tool.address === selectedAddress);
  // Project overrides replace Workflow defaults. Do not display both as simultaneous effective states.
  const consumers = useMemo(() => {
    const byAgent = new Map<string, NonNullable<typeof selected>["consumers"][number]>();
    for (const consumer of selected?.consumers ?? []) {
      const key = `${consumer.workflowId}/${consumer.agentId}`;
      if (!byAgent.has(key) || consumer.source === "project-config") byAgent.set(key, consumer);
    }
    return [...byAgent.values()];
  }, [selected]);

  return <SurfaceDialog title={tr("interface.tools")} description={tr("tools.scopeHint", { project: projectId })} onClose={onClose}>
    {error && <div className="surface-notice surface-error" role="alert">{tr("interface.unable.to.load.tools")}<InterfaceFeedback message={error} /> <button onClick={() => setRevision(value => value + 1)}>{tr("interface.retry")}</button></div>}
    {diagnostics.length > 0 && <details className="surface-notice surface-warning"><summary>{tr("interface.some.extensions.did.not.load")}{diagnostics.length}{tr("interface.diagnostics.available.tools.can.still.be.browsed")}</summary>
      {diagnostics.map((item, index) => <p key={`${item.path}:${index}`}>{item.message}</p>)}
    </details>}
    <div className={`catalog-layout${detailOpen ? " catalog-detail-open" : ""}`}>
      <nav className="catalog-list" aria-label={tr("interface.tool.catalog")}>
        <label className="catalog-search">{tr("interface.search.tools")}<input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr("interface.name.or.purpose")} /></label>
        {loading && <p className="surface-empty" role="status">{tr("interface.loading.tools")}</p>}
        {!loading && !error && visible.length === 0 && <p className="surface-empty">{tr("interface.no.matching.tools")}</p>}
        {visible.map(tool => <button key={tool.address} type="button" className="catalog-item" aria-current={selectedAddress === tool.address ? "true" : undefined}
          onClick={() => { setSelectedAddress(tool.address); setDetailOpen(true); }}>
          <strong>{tool.name}</strong><small>{tool.label}</small>
        </button>)}
      </nav>
      <main className="catalog-detail">
        <button type="button" className="catalog-back workspace-button" onClick={() => setDetailOpen(false)}>{tr("interface.back.to.tools")}</button>
        {selected && <>
          <h2>{selected.label}</h2><p className="surface-meta">{selected.name} · {selected.sourceInfo.scope} / {selected.sourceInfo.source}</p>
          <p>{selected.description}</p>
          <dl className="surface-facts"><dt>{tr("interface.risk")}</dt><dd>{selected.risk === "read-only" ? tr("interface.read.only") : selected.risk === "write" ? tr("interface.can.write") : selected.risk === "destructive" ? tr("interface.includes.destructive.actions") : tr("interface.not.declared")}</dd><dt>{tr("interface.permissions")}</dt><dd>{selected.permissions.join("、") || tr("interface.not.declared")}</dd></dl>
          <section><h3>{tr("interface.workflow.agent.usage")}</h3><p className="surface-meta">{tr("interface.configured.usage.does.not.mean.a.tool.is.running.check.each.friend.s.settings.for.its.effective.tools")}</p>
            {consumers.length === 0 ? <p>{tr("interface.no.configured.usage")}</p> : <ul className="surface-records">{consumers.map(consumer => <li key={`${consumer.workflowId}/${consumer.agentId}`}>
              <div><strong>{consumer.agentId}</strong><small>{consumer.workflowId}</small></div><span>{consumer.enabled ? tr("interface.enabled") : tr("interface.disabled")} · {consumer.source === "project-config" ? tr("interface.project.configuration") : tr("interface.default")}</span>
            </li>)}</ul>}
          </section>
          <details><summary>{tr("interface.technical.details")}</summary><dl className="surface-facts"><dt>{tr("interface.address")}</dt><dd><code>{selected.address}</code></dd><dt>{tr("interface.version")}</dt><dd>{selected.toolVersion ?? selected.version?.contentHash ?? selected.version?.modifiedAt ?? tr("interface.not.provided")}</dd><dt>{tr("interface.source")}</dt><dd>{selected.sourceInfo.origin}</dd></dl></details>
        </>}
      </main>
    </div>
  </SurfaceDialog>;
}
