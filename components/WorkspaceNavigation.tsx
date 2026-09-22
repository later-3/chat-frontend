import { IconUsers, IconFolders, IconPhoto, IconSettings, IconMessageCircle, IconMessages } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";

export type WorkspaceSection = "coworkers" | "projects" | "moments" | "groups" | "settings";
export function WorkspaceNavigation({ section, onSelect }: {
  section: WorkspaceSection;
  onSelect: (section: WorkspaceSection) => void;
}) {
  const { t } = useI18n();
  const items = [
    { id: "coworkers", label: t("workspaceNav.coworkers"), icon: IconUsers },
    { id: "projects", label: t("workspaceNav.projects"), icon: IconFolders },
    { id: "moments", label: t("workspaceNav.moments"), icon: IconPhoto },
    { id: "groups", label: t("workspaceNav.groups"), icon: IconMessages },
    { id: "settings", label: t("workspaceNav.settings"), icon: IconSettings },
  ] as const;
  return <nav className="workspace-rail" aria-label={t("workspaceNav.navigation")}>
    <div className="workspace-brand" title="Chat"><IconMessageCircle size={26} stroke={1.7} /></div>
    {items.map(({ id, label, icon: Icon }) => <button key={id} type="button"
      className={`workspace-nav-item${section === id ? " is-active" : ""}`}
      aria-current={section === id ? "page" : undefined}
      id={`workspace-${id}-tab`} onClick={() => onSelect(id)}>
      <Icon size={22} stroke={1.7} aria-hidden="true" /><span>{label}</span>
    </button>)}
  </nav>;
}
