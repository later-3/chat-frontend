export const MOBILE_MAX_WIDTH = 768;
export const SPLIT_PANEL_MIN_WIDTH = 960;
export const NAVIGATION_WIDTH = 64;
export const CHAT_MIN_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 280;
export const SIDEBAR_MIN_WIDTH = 224;
export const SIDEBAR_MAX_WIDTH = 360;
export const RIGHT_PANEL_FALLBACK_WIDTH = 360;
export const RIGHT_PANEL_MIN_WIDTH = 320;
export const RIGHT_PANEL_MAX_WIDTH = 720;

export function clampPanelWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.round(Math.max(minWidth, Math.min(Math.max(minWidth, maxWidth), Number.isFinite(width) ? width : minWidth)));
}
export function getDefaultRightPanelWidth(_viewportWidth: number): number { return RIGHT_PANEL_FALLBACK_WIDTH; }
export function isRightPanelOverlay(viewportWidth: number, sidebarOpen: boolean): boolean {
  return viewportWidth < SPLIT_PANEL_MIN_WIDTH
    || viewportWidth - NAVIGATION_WIDTH - (sidebarOpen ? SIDEBAR_MIN_WIDTH + 1 : 0) - RIGHT_PANEL_MIN_WIDTH - 1 < CHAT_MIN_WIDTH;
}
export function getSidebarMaxWidth({ viewportWidth, rightPanelOpen }: {
  viewportWidth: number; rightPanelOpen: boolean; rightPanelWidth: number;
}): number {
  if (viewportWidth < SPLIT_PANEL_MIN_WIDTH) return SIDEBAR_MAX_WIDTH;
  const right = rightPanelOpen && !isRightPanelOverlay(viewportWidth, true) ? RIGHT_PANEL_MIN_WIDTH + 1 : 0;
  return Math.min(SIDEBAR_MAX_WIDTH, viewportWidth - NAVIGATION_WIDTH - CHAT_MIN_WIDTH - 1 - right);
}
export function getRightPanelMaxWidth({ viewportWidth, sidebarOpen, sidebarWidth }: {
  viewportWidth: number; sidebarOpen: boolean; sidebarWidth: number;
}): number {
  if (isRightPanelOverlay(viewportWidth, sidebarOpen)) return Math.min(RIGHT_PANEL_MAX_WIDTH, viewportWidth - 48);
  return Math.min(RIGHT_PANEL_MAX_WIDTH, viewportWidth - NAVIGATION_WIDTH - CHAT_MIN_WIDTH - 1 - (sidebarOpen ? sidebarWidth + 1 : 0));
}
