import { useEffect, useMemo, useState } from "react";
import { SurfaceDialog } from "./SurfaceDialog";
import { fetchChatTools, type ChatToolCatalogEntry, type ChatToolsResponse } from "@/lib/tools-browser";

export function ToolsConfig({ projectId, onClose }: { readonly projectId: string; readonly onClose: () => void }) {
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

  return <SurfaceDialog title="Tools" description={`当前 Project · ${projectId} · 可用工具目录，实际启用由 Agent 配置决定`} onClose={onClose}>
    {error && <div className="surface-notice surface-error" role="alert">工具目录读取失败：{error} <button onClick={() => setRevision(value => value + 1)}>重试</button></div>}
    {diagnostics.length > 0 && <details className="surface-notice surface-warning"><summary>部分扩展未加载 · {diagnostics.length} 条诊断，可用工具仍可浏览</summary>
      {diagnostics.map((item, index) => <p key={`${item.path}:${index}`}>{item.message}</p>)}
    </details>}
    <div className={`catalog-layout${detailOpen ? " catalog-detail-open" : ""}`}>
      <nav className="catalog-list" aria-label="工具目录">
        <label className="catalog-search">搜索工具<input value={query} onChange={event => setQuery(event.target.value)} placeholder="名称或用途" /></label>
        {loading && <p className="surface-empty" role="status">正在读取工具…</p>}
        {!loading && !error && visible.length === 0 && <p className="surface-empty">没有匹配的工具</p>}
        {visible.map(tool => <button key={tool.address} type="button" className="catalog-item" aria-current={selectedAddress === tool.address ? "true" : undefined}
          onClick={() => { setSelectedAddress(tool.address); setDetailOpen(true); }}>
          <strong>{tool.name}</strong><small>{tool.label}</small>
        </button>)}
      </nav>
      <main className="catalog-detail">
        <button type="button" className="catalog-back workspace-button" onClick={() => setDetailOpen(false)}>返回工具列表</button>
        {selected && <>
          <h2>{selected.label}</h2><p className="surface-meta">{selected.name} · {selected.sourceInfo.scope} / {selected.sourceInfo.source}</p>
          <p>{selected.description}</p>
          <dl className="surface-facts"><dt>风险</dt><dd>{selected.risk === "read-only" ? "只读" : selected.risk === "write" ? "可写入" : selected.risk === "destructive" ? "含删除等操作" : "未声明"}</dd><dt>权限</dt><dd>{selected.permissions.join("、") || "未声明"}</dd></dl>
          <section><h3>Workflow Agent 使用关系</h3><p className="surface-meta">配置结果，不代表工具正在执行。Friend 的实际工具请在其配置中检查。</p>
            {consumers.length === 0 ? <p>没有已声明的使用关系。</p> : <ul className="surface-records">{consumers.map(consumer => <li key={`${consumer.workflowId}/${consumer.agentId}`}>
              <div><strong>{consumer.agentId}</strong><small>{consumer.workflowId}</small></div><span>{consumer.enabled ? "启用" : "禁用"} · {consumer.source === "project-config" ? "项目配置" : "默认"}</span>
            </li>)}</ul>}
          </section>
          <details><summary>技术信息</summary><dl className="surface-facts"><dt>地址</dt><dd><code>{selected.address}</code></dd><dt>版本</dt><dd>{selected.toolVersion ?? selected.version?.contentHash ?? selected.version?.modifiedAt ?? "未提供"}</dd><dt>来源</dt><dd>{selected.sourceInfo.origin}</dd></dl></details>
        </>}
      </main>
    </div>
  </SurfaceDialog>;
}
