"use client";

import { useI18n } from "@/hooks/useI18n";
import type { ChatProjectSummary } from "@/lib/projects-contract";
import type { FriendInteractionProject } from "@/lib/friend-interaction-project";
import styles from "./FriendProjectContext.module.css";

/**
 * Per-Friend collaboration-project control for the private chat header (LA6 A).
 *
 * Reads the association the Backend resolved and writes it with a revision CAS. It never falls back
 * to the globally selected workspace project, so switching Friends cannot leak one Friend's project
 * into another; an unavailable association is shown as unusable until the user re-selects.
 */
export function FriendProjectContext({ agentId, interaction, projects, busy, error, contextCwd, onSave }: {
  agentId: string;
  interaction: FriendInteractionProject | null;
  projects: readonly ChatProjectSummary[];
  busy: boolean;
  error: string | null;
  /** Resolved working directory of the associated project (same source as the file browser). */
  contextCwd?: string | null;
  onSave: (projectId: string | null) => void;
}) {
  const { t } = useI18n();
  if (interaction === null) return null;
  const value = interaction.effective.projectId ?? "";
  return <div className={styles.root} data-friend-project-context aria-label={t("friendProject.label")}>
    <span className={styles.label}>{t("friendProject.label")}</span>
    <select
      className={styles.select}
      value={value}
      disabled={busy}
      data-friend-project-select
      aria-label={t("friendProject.label")}
      onChange={(event) => onSave(event.target.value === "" ? null : event.target.value)}
    >
      <option value="">{t("friendProject.none")}</option>
      {projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.cachedName}</option>)}
    </select>
    {interaction.effective.availability === "unavailable" && <span className={styles.unavailable} role="alert">{interaction.effective.reason ?? t("friendProject.unavailable")}</span>}
    {error !== null && <span className={styles.error} role="alert">{error}</span>}
    <span hidden data-friend-project-cwd>{contextCwd ?? ""}</span>
    <span hidden>{agentId}</span>
  </div>;
}
