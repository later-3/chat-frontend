"use client";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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

/** Splits "…/frag" into [parent, fragment, usedBackslash]; fragment may be "" for a trailing slash. */
function splitFragment(input: string): { parent: string; fragment: string; backslash: boolean } | null {
  const index = Math.max(input.lastIndexOf("/"), input.lastIndexOf("\\"));
  if (index < 0) return null;
  return {
    parent: index === 0 ? input.slice(0, 1) : input.slice(0, index),
    fragment: input.slice(index + 1),
    backslash: input[index] === "\\",
  };
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
  // 输入补全：按输入的最后一段从兄弟目录建议；Tab 接受高亮项。
  const [suggestions, setSuggestions] = useState<DirectoryBrowseEntry[]>([]);
  const [activeSuggest, setActiveSuggest] = useState(-1);

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

  // Suggest against the PARENT directory of whatever fragment the user is typing. The already-loaded
  // child list of `currentPath` answers the common case ("…/current/<frag>") with zero requests;
  // a different parent fetches once (debounced) through the same backend browse endpoint.
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fragmentRef = useRef("");
  useEffect(() => {
    const split = splitFragment(pathInput);
    if (split === null || (!pathInput.includes("/") && !pathInput.includes("\\"))) { setSuggestions([]); setActiveSuggest(-1); return; }
    fragmentRef.current = split.fragment.toLowerCase();
    const acceptFilter = (source: readonly DirectoryBrowseEntry[]) => {
      const matches = source
        .filter((entry) => fragmentRef.current === "" || entry.name.toLowerCase().startsWith(fragmentRef.current))
        .slice(0, 8);
      setSuggestions(matches);
      setActiveSuggest(matches.length > 0 ? 0 : -1);
    };
    const normalizedSplitParent = split.parent === "" ? "/" : split.parent;
    if (currentPath !== "" && (currentPath === normalizedSplitParent || currentPath + "/" === normalizedSplitParent || currentPath.replace(/\/+$/, "") === normalizedSplitParent)) {
      acceptFilter(directories);
      return;
    }
    if (suggestTimer.current !== null) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => {
      let disposed = false;
      const controller = new AbortController();
      void browseDirectories(normalizedSplitParent, controller.signal).then((data) => {
        if (disposed) return;
        acceptFilter(data.directories);
      }).catch(() => { if (!disposed) { setSuggestions([]); setActiveSuggest(-1); } });
      return () => { disposed = true; };
    }, 250);
    return () => {
      if (suggestTimer.current !== null) { clearTimeout(suggestTimer.current); suggestTimer.current = null; }
    };
  }, [pathInput, currentPath, directories]);

  const handlePathSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = pathInput.trim();
    if (candidate) void navigateTo(candidate);
  };
  const acceptSuggestion = useCallback(() => {
    if (activeSuggest < 0 || suggestions[activeSuggest] === undefined) return false;
    const split = splitFragment(pathInput);
    const joiner = split?.backslash ? "\\" : "/";
    const parent = split === null ? "" : (split.parent === "" ? (split.backslash ? "\\" : "/") : split.parent + joiner);
    const next = `${parent}${suggestions[activeSuggest].name}${joiner}`;
    setPathInput(next);
    setSuggestions([]);
    setActiveSuggest(-1);
    document.getElementById("directory-path")?.focus();
    return true;
  }, [activeSuggest, suggestions, pathInput]);

  // 输入了路径即可直接选择：存在性由 openChatProject 后端校验（不存在会给出友好报错），
  // 不再强制“先转到该路径”。补全或手输的尾部斜杠做容错。
  const selectedCandidate = pathInput.trim().replace(/[\\/]+$/, "");
  const canSelect = selectedCandidate !== "" && !busy;
  const canNavigateUp = Boolean(parentDirectory) || isWindowsDriveRoot(currentPath);

  return <SurfaceDialog
    title={t("directoryPicker.selectDirectory")}
    onClose={() => { if (!busy) onCancel(); }}
  >
    <form className="directory-picker-nav" onSubmit={handlePathSubmit}>
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
        onKeyDown={(event) => {
          if (event.key === "Tab") { if (suggestions.length > 0) event.preventDefault(); acceptSuggestion(); return; }
          if (suggestions.length > 0) {
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveSuggest((i) => Math.min(i + 1, suggestions.length - 1)); return; }
            if (event.key === "ArrowUp") { event.preventDefault(); setActiveSuggest((i) => Math.max(i - 1, 0)); return; }
          }
        }}
      />
      {suggestions.length > 0 && <div className="directory-picker-suggests" role="listbox" aria-label={t("directoryPicker.suggestions")}>
        {suggestions.map((entry, index) => (
          <Button key={entry.path} variant="ghost" type="button" className="directory-picker-suggestion"
            role="option" aria-selected={index === activeSuggest} data-suggest-active={index === activeSuggest || undefined}
            title={entry.path}
            onClick={(e) => { e.preventDefault(); setActiveSuggest(index); acceptSuggestion(); }}>
            <FolderIcon />
            <span className="ui-label-truncate">{entry.name}{index === activeSuggest && <small className="directory-picker-hint">{t("directoryPicker.tabAccepts")}</small>}</span>
          </Button>
        ))}
      </div>}
      <Button variant="secondary" type="submit" className="directory-picker-action" disabled={loading || !pathInput.trim()}>
        {t("directoryPicker.go")}
      </Button>
    </form>

    <div className="directory-picker-list" data-directory-entries>
      {loading ? (
        <p className="ui-list-note" role="status">{t("directoryPicker.loadingDirectories")}</p>
      ) : drives !== null ? (
        drives.length > 0 ? drives.map((drive) => (
          <Button key={drive.path} variant="ghost" type="button" className="directory-picker-entry"
            title={drive.path} onClick={() => void navigateTo(drive.path)}>
            <DriveIcon />
            <span className="ui-label-truncate">{drive.name}</span>
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
      <div className="directory-picker-error surface-notice surface-error" role="alert"><InterfaceFeedback message={loadError ?? error ?? ""} /></div>
    )}

    <div className="directory-picker-footer">
      <Button variant="secondary" type="button" className="directory-picker-action" disabled={busy} onClick={onCancel}>
        {t("i18n.cancel")}
      </Button>
      <Button variant="primary" type="button" className="directory-picker-action" disabled={!canSelect}
        title={selectedCandidate === currentPath ? t("directoryPicker.selectCurrentDirectory") : t("directoryPicker.selectTypedPath")}
        onClick={() => onSelect(selectedCandidate === "" ? currentPath : selectedCandidate)}>
        {busy ? t("i18n.checking") : t("directoryPicker.selectThisFolder")}
      </Button>
    </div>
  </SurfaceDialog>;
}
