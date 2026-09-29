"use client";

import { IconChevronDown } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { translateWorkflowCopy } from "@/lib/i18n/workflow-copy";
import type { ChatWorkflowSummary } from "@/lib/chat-workflows-browser";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "./ui/DropdownMenu";

/**
 * Workflow selection inside the composer frame (UI/UX §18, §20.5).
 *
 * It replaces a native `<select>`, which could not follow the design system:
 * the trigger is the shared frame control and the list is the shared menu
 * primitive (name + description + the selected marker), so it matches every
 * other picker in the app.
 */
export function WorkflowPicker({ disabled, onChange, selected, summaries, value }: {
  readonly disabled: boolean;
  readonly onChange: (workflowId: string) => void;
  readonly selected: ChatWorkflowSummary | undefined;
  readonly summaries: readonly ChatWorkflowSummary[];
  readonly value: string;
}) {
  const { t } = useI18n();
  const label = selected === undefined ? value : translateWorkflowCopy(selected.id, selected.name, t);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" className="composer-control" data-workflow-picker aria-label={t("chat.workflow")}
        title={t("chat.workflowTitle")} disabled={disabled}>
        <span className="composer-control-label">{label}</span>
        <IconChevronDown size={14} stroke={1.8} aria-hidden="true" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="workflow-menu" data-workflow-picker-menu>
      <DropdownMenuLabel>{t("chat.workflow")}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
        {summaries.map((workflow) => (
          <DropdownMenuRadioItem key={workflow.id} value={workflow.id} data-workflow-option={workflow.id}
            title={translateWorkflowCopy(workflow.id, workflow.description, t)}>
            <span className="workflow-menu-row">
              <span className="workflow-menu-name">{translateWorkflowCopy(workflow.id, workflow.name, t)}</span>
              <span className="workflow-menu-detail">{translateWorkflowCopy(workflow.id, workflow.description, t)}</span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
