import type { ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { WorkflowProcessNode } from "@/lib/workflow-process";

export function WorkflowProcess({ nodes, finalIndex, render }: {
  nodes: WorkflowProcessNode[]; finalIndex: number; render: (index: number) => ReactNode;
}) {
  const { t } = useI18n();
  return <div className="workflow-process" aria-label={t("design.workflowSteps")}>
    {nodes.map((node, index) => {
      if (!node.stage) return <div key={`legacy-${index}`}>{node.indices.map(render)}</div>;
      const memory = node.stage.agentId === "session-memory-writer";
      const name = memory ? t("sessionActivity.memoryWriter") : node.stage.stageId === "execute"
        ? t("workflowProcess.execute") : node.stage.stageId === "plan" ? t("chat.plannerStage") : node.stage.stageId;
      return <section key={`${node.key}:${index}`} className="workflow-process-node" data-workflow-node={node.stage.stageId}>
        <div className="workflow-process-heading"><strong>{index + 1}. {name}</strong><span>{t(`workflowProcess.${node.status}`)}</span></div>
        <p className="turn-summary-note">{node.stage.agentId}</p>
        {node.indices.includes(finalIndex) && <p className="turn-summary-note">{t("workflowProcess.answerAbove")}</p>}
        {memory ? <>
          <p>{t(node.memoryWrites ? "workflowProcess.memoryWrites" : "workflowProcess.noMemoryWrites", { count: node.memoryWrites })}</p>
          <details><summary>{t("chat.processDetails")}</summary>{node.indices.map(render)}</details>
        </> : node.indices.map(render)}
      </section>;
    })}
  </div>;
}
