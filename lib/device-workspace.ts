import type { FileViewerState } from "./file-viewer-state";
import { getInitialNavigation, type InitialNavigation } from "./initial-navigation.ts";

export const DEVICE_WORKSPACE_STORAGE_KEY = "pi-web:device-workspaces:v1";
export const MAX_DEVICE_WORKSPACE_TABS = 24;

export interface DeviceWorkspaceFileTab {
  id: string;
  label: string;
  filePath: string;
  sourceSessionId?: string | null;
  sourceCwd?: string;
  viewerState?: FileViewerState;
  initialDisplayMode?: "source" | "preview" | "diff";
}

export interface DeviceWorkspaceSnapshot {
  navigation: InitialNavigation;
  fileTabs: DeviceWorkspaceFileTab[];
  activeFileTabId: string | null;
  rightPanelOpen: boolean;
  contextSelection?: { projectId: string; cwd: string };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DEVICE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const DISPLAY_MODES = new Set(["source", "preview", "diff"]);

export function emptyDeviceWorkspaceSnapshot(
  navigation: InitialNavigation = { requestedCwd: null, sessionId: null },
): DeviceWorkspaceSnapshot {
  return {
    navigation,
    fileTabs: [],
    activeFileTabId: null,
    rightPanelOpen: false,
  };
}

export function navigationFromSearch(search: string): InitialNavigation {
  const value = search.startsWith("?") ? search.slice(1) : search;
  return getInitialNavigation(new URLSearchParams(value));
}

export function workspaceUrlFromNavigation(navigation: InitialNavigation): string {
  const params = new URLSearchParams();
  if (navigation.requestedCwd) params.set("cwd", navigation.requestedCwd);
  else if (navigation.sessionId) {
    params.set("session", navigation.sessionId);
    if (navigation.sessionProjectId) params.set("projectId", navigation.sessionProjectId);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function normalizeNavigation(value: unknown): InitialNavigation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyDeviceWorkspaceSnapshot().navigation;
  }
  const record = value as Record<string, unknown>;
  const requestedCwd = boundedString(record.requestedCwd, 4096);
  return {
    requestedCwd,
    sessionId: requestedCwd ? null : boundedString(record.sessionId, 256),
    ...(!requestedCwd && boundedString(record.sessionId, 256) && boundedString(record.sessionProjectId, 256)
      ? { sessionProjectId: record.sessionProjectId as string } : {}),
  };
}

function normalizeFileTab(value: unknown): DeviceWorkspaceFileTab | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = boundedString(record.id, 4352);
  const label = boundedString(record.label, 256);
  const filePath = boundedString(record.filePath, 4096);
  if (!id || !label || !filePath) return null;

  const sourceSessionId = record.sourceSessionId === null
    ? null
    : boundedString(record.sourceSessionId, 256) ?? undefined;
  const initialDisplayMode = typeof record.initialDisplayMode === "string"
    && DISPLAY_MODES.has(record.initialDisplayMode)
    ? record.initialDisplayMode as DeviceWorkspaceFileTab["initialDisplayMode"]
    : undefined;

  let viewerState: FileViewerState | undefined;
  if (record.viewerState && typeof record.viewerState === "object" && !Array.isArray(record.viewerState)) {
    const state = record.viewerState as Record<string, unknown>;
    if ((state.displayMode === "source" || state.displayMode === "preview" || state.displayMode === "diff")
      && typeof state.wrapLines === "boolean" && typeof state.scrollTop === "number"
      && Number.isFinite(state.scrollTop) && state.scrollTop >= 0 && typeof state.scrollLeft === "number"
      && Number.isFinite(state.scrollLeft) && state.scrollLeft >= 0) {
      viewerState = { displayMode: state.displayMode, wrapLines: state.wrapLines, scrollTop: state.scrollTop, scrollLeft: state.scrollLeft };
    }
  }
  return {
    id,
    label,
    filePath,
    ...(viewerState ? { viewerState } : {}),
    ...(sourceSessionId !== undefined ? { sourceSessionId } : {}),
    ...(boundedString(record.sourceCwd, 4096) ? { sourceCwd: record.sourceCwd as string } : {}),
    ...(initialDisplayMode ? { initialDisplayMode } : {}),
  };
}

export function normalizeDeviceWorkspaceSnapshot(value: unknown): DeviceWorkspaceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyDeviceWorkspaceSnapshot();
  }
  const record = value as Record<string, unknown>;
  const fileTabs = Array.isArray(record.fileTabs)
    ? record.fileTabs.slice(0, MAX_DEVICE_WORKSPACE_TABS).flatMap((tab) => {
        const normalized = normalizeFileTab(tab);
        return normalized ? [normalized] : [];
      })
    : [];
  const activeCandidate = boundedString(record.activeFileTabId, 4352);
  const activeFileTabId = activeCandidate && fileTabs.some((tab) => tab.id === activeCandidate)
    ? activeCandidate
    : fileTabs.at(-1)?.id ?? null;

  return {
    navigation: normalizeNavigation(record.navigation),
    ...(record.contextSelection && typeof record.contextSelection === "object"
      && "projectId" in record.contextSelection && "cwd" in record.contextSelection
      && typeof record.contextSelection.projectId === "string" && record.contextSelection.projectId.trim()
      && typeof record.contextSelection.cwd === "string" && record.contextSelection.cwd.trim()
      ? { contextSelection: { projectId: record.contextSelection.projectId, cwd: record.contextSelection.cwd } } : {}),
    fileTabs,
    activeFileTabId,
    rightPanelOpen: record.rightPanelOpen === true && fileTabs.length > 0,
  };
}

function readWorkspaceMap(storage: StorageLike): Record<string, DeviceWorkspaceSnapshot> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(DEVICE_WORKSPACE_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([deviceId]) => DEVICE_ID_PATTERN.test(deviceId))
        .slice(0, 32)
        .map(([deviceId, snapshot]) => [deviceId, normalizeDeviceWorkspaceSnapshot(snapshot)]),
    );
  } catch {
    return {};
  }
}

export function loadDeviceWorkspaceSnapshot(
  storage: StorageLike,
  deviceId: string,
): DeviceWorkspaceSnapshot | null {
  if (!DEVICE_ID_PATTERN.test(deviceId)) return null;
  return readWorkspaceMap(storage)[deviceId] ?? null;
}

export function saveDeviceWorkspaceSnapshot(
  storage: StorageLike,
  deviceId: string,
  snapshot: DeviceWorkspaceSnapshot,
): void {
  if (!DEVICE_ID_PATTERN.test(deviceId)) return;
  const workspaces = readWorkspaceMap(storage);
  workspaces[deviceId] = normalizeDeviceWorkspaceSnapshot(snapshot);
  try {
    storage.setItem(DEVICE_WORKSPACE_STORAGE_KEY, JSON.stringify(workspaces));
  } catch {
    // Private browsing and storage quotas must never block device switching.
  }
}
