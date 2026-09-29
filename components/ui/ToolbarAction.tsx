"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Hint } from "./Tooltip";
import { useToolbarLabels } from "@/hooks/useToolbarLabels";

export interface ToolbarActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also the tooltip text and the visible label when labels are on. */
  label: string;
  icon: ReactNode;
  active?: boolean;
  /** Optional count shown next to the icon (e.g. session-memory entries). */
  badge?: number;
  /** Hide the label even when the preference is on (e.g. a very narrow container). */
  iconOnly?: boolean;
  /**
   * `bar` is the toolbar strip (dividers, full height); `frame` is a button inside
   * the composer frame (rounded 32/44px hit area). Same label rule for both.
   */
  shape?: "bar" | "frame";
}

/**
 * One toolbar action for the whole app (UI/UX §13.2): icons only by default,
 * labels on request from Settings → Appearance. Every toolbar button that has a
 * label must use this, so the top bar never mixes labelled and unlabelled actions.
 */
export const ToolbarAction = forwardRef<HTMLButtonElement, ToolbarActionProps>(function ToolbarAction(
  { label, icon, active = false, badge = 0, iconOnly = false, shape = "bar", className = "", type = "button", ...props }, ref,
) {
  const { labels } = useToolbarLabels();
  const showLabel = labels && !iconOnly;
  return <Hint label={label}>
    <button
      {...props}
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active || undefined}
      data-toolbar-action="true"
      className={`toolbar-action${shape === "frame" ? " is-frame" : ""}${active ? " is-active" : ""}${showLabel ? "" : " is-icon-only"} ${className}`.trim()}
    >
      <span className="toolbar-action-icon" aria-hidden="true">{icon}</span>
      {badge > 0 && <span className="toolbar-action-badge" aria-hidden="true">{badge}</span>}
      {showLabel && <span className="toolbar-action-label">{label}</span>}
    </button>
  </Hint>;
});
