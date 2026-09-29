import { IconUsers, IconFolders, IconPhoto, IconSettings, IconMessageCircle, IconMessages, IconSitemap } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Hint } from "./ui/Tooltip";
import { useToolbarLabels } from "@/hooks/useToolbarLabels";

export type WorkspaceSection = "coworkers" | "projects" | "moments" | "groups" | "topics" | "settings";
/**
 * Global navigation rail. Icons only by default (UI/UX §20.5); Settings →
 * Appearance can add the names, and Compact keeps them because touch has no
 * hover and an icon-only rail would be undiscoverable (§7).
 */
export function WorkspaceNavigation({ section, onSelect }: {
  section: WorkspaceSection;
  onSelect: (section: WorkspaceSection) => void;
}) {
  const { t } = useI18n();
  const { labels } = useToolbarLabels();
  const isCompact = useIsMobile();
  const showLabels = labels || isCompact;
  const items = [
    { id: "coworkers", label: t("workspaceNav.coworkers"), icon: IconUsers },
    { id: "projects", label: t("workspaceNav.projects"), icon: IconFolders },
    { id: "moments", label: t("workspaceNav.moments"), icon: IconPhoto },
    { id: "groups", label: t("workspaceNav.groups"), icon: IconMessages },
    { id: "topics", label: t("workspaceNav.topics"), icon: IconSitemap },
    { id: "settings", label: t("workspaceNav.settings"), icon: IconSettings },
  ] as const;
  return <nav className="workspace-rail" aria-label={t("workspaceNav.navigation")}>
    <div className="workspace-brand" title="Chat"><IconMessageCircle size={26} stroke={1.7} /></div>
    {items.map(({ id, label, icon: Icon }) => <Hint key={id} label={label} side="right">
      <button type="button"
        className={`workspace-nav-item${section === id ? " is-active" : ""}${showLabels ? "" : " is-icon-only"}`}
        aria-current={section === id ? "page" : undefined}
        aria-label={label}
        id={`workspace-${id}-tab`} onClick={() => onSelect(id)}>
        <Icon size={22} stroke={1.7} aria-hidden="true" />{showLabels && <span>{label}</span>}
      </button>
    </Hint>)}
  </nav>;
}
