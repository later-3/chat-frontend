import { useEffect } from "react";
import { Command } from "cmdk";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useI18n } from "@/hooks/useI18n";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Requires an active project cwd; hidden when absent. */
  onNewSession: () => void;
  onBackToChat: () => void;
  onOpenMoments: () => void;
  onOpenGroups: () => void;
  onOpenTopics: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
}

interface PaletteCommand {
  id: string;
  label: string;
  group: "actions" | "navigation";
  keywords?: string;
  run: () => void;
}

/**
 * Global ⌘K command palette (cmdk). Routes are navigation-only: every action
 * goes through the same AppShell callbacks the sidebars use, so the palette
 * cannot become a second control plane. Focus and Escape handling come from
 * the shared `useDialogFocus` modal contract.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onNewSession,
  onBackToChat,
  onOpenMoments,
  onOpenGroups,
  onOpenTopics,
  onOpenSettings,
  onToggleTheme,
}: CommandPaletteProps) {
  const { t } = useI18n();
  const dialogRef = useDialogFocus<HTMLDivElement>(() => onOpenChange(false), open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onOpenChange]);

  if (!open) return null;

  const commands: PaletteCommand[] = [
    { id: "new-session", label: t("interface.palette.newSession"), group: "actions", keywords: "new session create", run: onNewSession },
    { id: "toggle-theme", label: t("interface.palette.toggleTheme"), group: "actions", keywords: "theme dark light appearance", run: onToggleTheme },
    { id: "back-chat", label: t("interface.palette.backToChat"), group: "navigation", keywords: "chat sessions", run: onBackToChat },
    { id: "open-moments", label: t("interface.palette.moments"), group: "navigation", keywords: "moments feed", run: onOpenMoments },
    { id: "open-groups", label: t("interface.palette.groups"), group: "navigation", keywords: "groups", run: onOpenGroups },
    { id: "open-topics", label: t("interface.palette.topics"), group: "navigation", keywords: "topics", run: onOpenTopics },
    { id: "open-settings", label: t("interface.palette.settings"), group: "navigation", keywords: "settings preferences", run: onOpenSettings },
  ];

  const runCommand = (command: PaletteCommand) => {
    onOpenChange(false);
    command.run();
  };

  return (
    <div
      className="command-palette-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label={t("interface.palette.open")}>
        <Command loop label={t("interface.palette.open")}>
          <Command.Input
            autoFocus
            placeholder={t("interface.palette.placeholder")}
            className="command-palette-input"
          />
          <Command.List className="command-palette-list">
            <Command.Empty className="command-palette-empty">{t("interface.palette.empty")}</Command.Empty>
            <Command.Group
              heading={t("interface.palette.group.actions")}
              className="command-palette-group"
            >
              {commands.filter((command) => command.group === "actions").map((command) => (
                <Command.Item
                  key={command.id}
                  value={`${command.label} ${command.keywords ?? ""}`}
                  className="command-palette-item"
                  onSelect={() => runCommand(command)}
                >
                  {command.label}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group
              heading={t("interface.palette.group.navigate")}
              className="command-palette-group"
            >
              {commands.filter((command) => command.group === "navigation").map((command) => (
                <Command.Item
                  key={command.id}
                  value={`${command.label} ${command.keywords ?? ""}`}
                  className="command-palette-item"
                  onSelect={() => runCommand(command)}
                >
                  {command.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
