"use client";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { browseDirectories, type DirectoryBrowseEntry } from "@/lib/directory-browser";
import { SurfaceDialog } from "./SurfaceDialog";
import { Button } from "./ui/Button";

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M1.5 3h4l1.5 2h7.5v7.5h-13z" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 9h12" />
      <circle cx="11.5" cy="11" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function isWindowsDriveRoot(directory: string): boolean {
  return /^[a-zA-Z]:[\\/]?$/.test(directory);
}

interface Props {
  onCancel: () => void;
  onSelect: (path: string) => void;
  busy?: boolean;
  error?: string | null;
}

export function DirectoryPicker({ onCancel, onSelect, busy = false, error }: Props) {
  const { t } = useI18n();
  const [currentPath, setCurrentPath] = useState("");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [directories, setDirectories] = useState<DirectoryBrowseEntry[]>([]);
  const [drives, setDrives] = useState<DirectoryBrowseEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const navigateTo = useCallback(async (directory?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await browseDirectories(directory);
      const nextPath = data.path || directory || "/";
      setCurrentPath(nextPath);
      setParentDirectory(data.parentPath);
      setPathInput(nextPath);
      setDirectories([...data.directories]);
      setDrives(data.drives === null ? null : [...data.drives]);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void navigateTo(); }, [navigateTo]);

  const handlePathSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = pathInput.trim();
    if (candidate) void navigateTo(candidate);
  };
  const hasUncommittedPath = pathInput.trim() !== currentPath;
  const canSelect = Boolean(currentPath) && !hasUncommittedPath && !busy;
  const canNavigateUp = Boolean(parentDirectory) || isWindowsDriveRoot(currentPath);

  return <SurfaceDialog
    title={t("directoryPicker.selectDirectory")}
    onClose={() => { if (!busy) onCancel(); }}
  >
    <div className="ui-scroll-20 ui-stack-16">
      <form className="ui-row-6" onSubmit={handlePathSubmit}>
        <Button variant="secondary" type="button" iconOnly className="directory-picker-back"
          aria-label={t("directoryPicker.goToParent")} title={t("directoryPicker.goToParent")}
          disabled={loading || !canNavigateUp}
          onClick={() => void navigateTo(parentDirectory ?? undefined)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m18 15-6-6-6 6" />
          </svg>
        </Button>
        <label htmlFor="directory-path" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
          {t("directoryPicker.directoryPath")}
        </label>
        <input
          className="directory-picker-path"
          id="directory-path"
          type="text"
          value={pathInput}
          placeholder={t("interface..path.to.project.or.project")}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          style={{ minWidth: 0, flex: 1, fontFamily: "var(--font-mono)" }}
          onChange={(event) => { setPathInput(event.target.value); setLoadError(null); }}
        />
        <Button variant="secondary" type="submit" className="directory-picker-action" disabled={loading || !pathInput.trim()}>
          {t("directoryPicker.go")}
        </Button>
      </form>

      <div className="ui-stack-4" data-directory-entries>
        {loading ? (
          <p className="ui-list-note" role="status">{t("directoryPicker.loadingDirectories")}</p>
        ) : drives !== null ? (
          drives.length > 0 ? drives.map((drive) => (
            <Button key={drive.path} variant="ghost" type="button" className="directory-picker-entry"
              title={drive.path} onClick={() => void navigateTo(drive.path)}>
              <DriveIcon />
              <span>{drive.name}</span>
            </Button>
          )) : <p className="ui-list-note">{t("directoryPicker.noDrives")}</p>
        ) : directories.length > 0 ? directories.map((entry) => (
          <Button key={entry.path} variant="ghost" type="button" className="directory-picker-entry"
            title={entry.path} onClick={() => void navigateTo(entry.path)}>
            <FolderIcon />
            <span className="ui-label-truncate">{entry.name}</span>
          </Button>
        )) : <p className="ui-list-note">{t("directoryPicker.noSubdirectories")}</p>}
      </div>

      {(loadError ?? error) != null && (
        <div className="surface-notice surface-error" role="alert"><InterfaceFeedback message={loadError ?? error ?? ""} /></div>
      )}

      <div className="ui-row-6 directory-picker-footer" style={{ justifyContent: "flex-end" }}>
        <Button variant="secondary" type="button" className="directory-picker-action" disabled={busy} onClick={onCancel}>
          {t("i18n.cancel")}
        </Button>
        <Button variant="primary" type="button" className="directory-picker-action" disabled={!canSelect}
          title={hasUncommittedPath ? t("directoryPicker.openBeforeSelecting") : t("directoryPicker.selectCurrentDirectory")}
          onClick={() => onSelect(currentPath)}>
          {busy ? t("i18n.checking") : t("directoryPicker.selectThisFolder")}
        </Button>
      </div>
    </div>
  </SurfaceDialog>;
}
