import { interfaceCopy } from "./messages/interface.ts";

const copy = Object.entries(interfaceCopy).filter(([key]) => key.startsWith("workflowCopy."));
/** Localize unchanged built-in display metadata only. Unknown/custom names and execution data stay intact. */
export function translateWorkflowCopy(workflowId: string, value: string, translate: (key: string) => string): string {
  const match = copy.find(([key, text]) => key.startsWith(`workflowCopy.${workflowId}.`) && text.source === value);
  return match ? translate(match[0]) : value;
}
