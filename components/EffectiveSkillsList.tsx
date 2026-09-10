"use client";

import type { WorkflowAgentInspection } from "@/lib/chat-workflows-browser";

type SkillEntry = WorkflowAgentInspection["skills"][number];
type SkillOwner = SkillEntry["owner"];

const OWNER_ORDER: readonly SkillOwner[] = ["agent", "personal", "project", "plugin", "injected"];

export interface EffectiveSkillsLabels {
  readonly title: string;
  readonly empty: string;
  readonly owners: Record<SkillOwner, string>;
}

/**
 * Read-only "currently effective Skills" list, grouped by Backend-classified
 * ownership. The data always comes from a Backend inspection resolved through
 * the same assembly path as execution; the Frontend never guesses directories.
 */
export function EffectiveSkillsList({
  skills,
  labels,
}: {
  readonly skills: readonly SkillEntry[];
  readonly labels: EffectiveSkillsLabels;
}) {
  return (
    <div className="effective-skills-list">
      <strong>{labels.title}</strong>
      {skills.length === 0 && <small>{labels.empty}</small>}
      {OWNER_ORDER.map((owner) => {
        const group = skills.filter((skill) => skill.owner === owner);
        if (group.length === 0) return null;
        return (
          <div key={owner} className="effective-skills-group">
            <small className="effective-skills-owner">{labels.owners[owner]}</small>
            <ul>
              {group.map((skill) => (
                <li key={skill.filePath} title={skill.filePath}>
                  <strong>{skill.name}</strong>
                  {skill.description !== "" && <small>{skill.description}</small>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
