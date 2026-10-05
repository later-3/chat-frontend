import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/DropdownMenu";
import { useI18n } from "@/hooks/useI18n";

export interface SessionActionsMenuProps {
  readonly sessionId: string;
  /** 当前显示标题（用户命名或第一句话），用于重命名预填与确认文案。 */
  readonly title: string;
  /** 会话正在运行等状态下禁用危险动作，并给出原因。 */
  readonly removeDisabledReason?: string;
  readonly onRename: (sessionId: string, title: string) => void;
  readonly onRemove: (sessionId: string) => void | Promise<void>;
  /** 移除区使用：动作为“恢复到项目 / 永久删除”。 */
  readonly mode?: "active" | "removed";
  readonly onRestore?: (sessionId: string) => void | Promise<void>;
  readonly onPurge?: (sessionId: string) => void | Promise<void>;
}

/**
 * 会话行的唯一动作入口。列表行默认只展示信息，hover 时出现这个 “…”：
 * 低频、危险的动作收在菜单里，未来新增动作不需要改列表布局。
 */
export function SessionActionsMenu({
  sessionId, title, removeDisabledReason, onRename, onRemove,
  mode = "active", onRestore, onPurge,
}: SessionActionsMenuProps) {
  const { t } = useI18n();
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" className="session-actions-trigger" data-session-menu={sessionId}
        title={mode === "active" ? t("sessionActions.more") : title}
        aria-label={t("sessionActions.more")}>⋯</button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {mode === "active" ? <>
        <DropdownMenuItem data-session-action="rename" onSelect={() => onRename(sessionId, title)}>
          {t("sessionActions.rename")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-session-action="remove" disabled={removeDisabledReason !== undefined}
          title={removeDisabledReason ?? t("sessionActions.removeHint")}
          onSelect={() => { if (removeDisabledReason === undefined) void onRemove(sessionId); }}>
          {t("sessionActions.remove")}
        </DropdownMenuItem>
      </> : <>
        <DropdownMenuItem data-session-action="restore" onSelect={() => void onRestore?.(sessionId)}>
          {t("sessionActions.restore")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-session-action="purge" onSelect={() => void onPurge?.(sessionId)}>
          {t("sessionActions.purge")}
        </DropdownMenuItem>
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
