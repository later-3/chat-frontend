import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchChatRootConfig, fetchChatWorkflowSummaries, saveChatRootConfig, type ChatWorkflowSummary } from "@/lib/chat-workflows-browser";
import type { ChatRootConfig } from "@/lib/chat-workflow-contract";
import { translateWorkflowCopy } from "@/lib/i18n/workflow-copy";
import { WorkflowAgentConfigDialog } from "./WorkflowAgentConfigDialog";
import { Button } from "./ui/Button";

/** The same persisted Workflow editor used by project Sessions. Identity remains in the parent form. */
export function LongAgentWorkflowSettings({ projectId, cwd, onChanged }: { projectId: string; cwd: string; onChanged: () => void }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<ChatRootConfig | null>(null);
  const current = useRef<ChatRootConfig | null>(null);
  const queue = useRef(Promise.resolve());
  const saveSequence = useRef(0);
  const [workflows, setWorkflows] = useState<ChatWorkflowSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([fetchChatRootConfig(projectId, controller.signal), fetchChatWorkflowSummaries(controller.signal)])
      .then(([value, list]) => { if (!controller.signal.aborted) { current.current = value; setConfig(value); setWorkflows(list); setError(null); } })
      .catch(cause => { if (!controller.signal.aborted) setError(String(cause)); });
    return () => controller.abort();
  }, [projectId, reload]);
  const save = (change: (value: ChatRootConfig) => ChatRootConfig) => {
    if (!current.current) return;
    const next = change(current.current);
    const sequence = ++saveSequence.current;
    current.current = next;
    setConfig(next);
    setBusy(true);
    queue.current = queue.current.then(async () => {
      const saved = await saveChatRootConfig(next, projectId);
      if (sequence === saveSequence.current) { current.current = saved; setConfig(saved); setError(null); }
      onChanged();
    }).catch(cause => setError(String(cause))).finally(() => { if (sequence === saveSequence.current) setBusy(false); });
  };
  const workflow = workflows.find(item => item.id === config?.defaultWorkflowId);
  return <div data-long-agent-workflow-settings className="assistant-workflow-settings">
    <p>{t("longAgentSettings.workflowContract")}</p>
    {error && <p role="alert">{error}<Button type="button" variant="ghost" onClick={() => setReload(value => value + 1)}>{t("common.retry")}</Button></p>}
    <div className="assistant-workflow-choice"><label>{t("longAgentSettings.workflow")}<select aria-label={t("longAgentSettings.workflow")} value={config?.defaultWorkflowId ?? ""} disabled={!config || busy}
      onChange={event => { const id = event.target.value; save(value => ({ ...value, defaultWorkflowId: id })); }}>
      {workflows.map(item => <option key={item.id} value={item.id}>{translateWorkflowCopy(item.id, item.name, t)}</option>)}
    </select></label>
    <Button type="button" variant="secondary" disabled={!workflow || !cwd || busy} onClick={() => setOpen(true)}>{t("longAgentSettings.configureWorkflow")}</Button></div>
    {workflow && <ol className="assistant-workflow-steps" aria-label={t("design.workflowSteps")}>{workflow.nodes.map((node, index) =>
      <li key={node.id}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{translateWorkflowCopy(workflow.id, node.name, t)}</li>
    )}</ol>}
    {open && workflow && config && <WorkflowAgentConfigDialog selectionScope="default" workflow={workflow} projectId={projectId} cwd={cwd}
      configs={{ ...config.workflows[workflow.id]?.agents }} proposals={[]}
      onConfigsChange={agents => save(value => ({ ...value, workflows: { ...value.workflows, [workflow.id]: { agents } } }))}
      onClose={() => { setOpen(false); onChanged(); }} />}
  </div>;
}
