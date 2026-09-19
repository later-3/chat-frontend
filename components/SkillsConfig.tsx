"use client";

import { ConfigurationToggle as Toggle } from "./ConfigurationToggle";

import { useDialogFocus } from "@/hooks/useDialogFocus";

import { useState, useEffect, useCallback, useRef } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useI18n } from "@/hooks/useI18n";
import type {
  SkillInfo as Skill,
  SkillInstallScope,
  SkillSearchResult,
  SkillsResponse,
  SkillUpdateResult,
} from "@/lib/api-types";

function shortenPath(p: string): string {
  // Match common home dir patterns: /Users/xxx, /home/xxx
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

import {
  parseSkillTree,
  type SkillTreeEntry,
  type SkillTreeResponse,
} from "@/lib/skill-tree-browser";

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourceLabel(skill: Skill): string {
  const src = skill.sourceInfo?.source;
  const scope = skill.sourceInfo?.scope;
  if (scope === "user" || src === "user") return "global";
  if (scope === "project" || src === "project") return "project";
  return "path";
}

function skillGroupLabel(skill: Skill): string {
  const source = sourceLabel(skill);
  if (source === "path") return source;
  return skill.install?.skillsShUrl ? `${source} / skills.sh` : source;
}

function updateKey(skill: Skill): string | null {
  return skill.install
    ? `${skill.install.scope}\0${skill.install.package}`
    : null;
}

function shortVersion(version?: string): string {
  return version ? version.slice(0, 8) : "unknown";
}

function SkillDetail({
  skill,
  cwd,
  onToggle,
  toggling,
  saveError,
  updateStatus,
  checkingUpdate,
  updating,
  updateError,
  onCheckUpdate,
  onUpdate,
}: {
  skill: Skill;
  cwd: string;
  onToggle: (skill: Skill) => void;
  toggling: boolean;
  saveError: string | null;
  updateStatus?: SkillUpdateResult;
  checkingUpdate: boolean;
  updating: boolean;
  updateError: string | null;
  onCheckUpdate: () => void;
  onUpdate: () => void;
}) {
  const { t } = useI18n();
  const label = sourceLabel(skill);
  const enabled = !skill.disableModelInvocation;

  function displayPath(p: string): string {
    if (label === "project" && p.startsWith(cwd)) {
      const rel = p.slice(cwd.length).replace(/^[/\\]/, "");
      return `./${rel}`;
    }
    return shortenPath(p);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Path + tag + toggle, with a stable status row below. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              fontSize: 12,
              padding: "1px 5px",
              borderRadius: 3,
              flexShrink: 0,
              background:
                label === "project"
                  ? "rgba(99,102,241,0.12)"
                  : "rgba(120,120,120,0.12)",
              color:
                label === "project" ? "rgba(99,102,241,0.8)" : "var(--text-dim)",
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-dim)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayPath(skill.filePath)}
          </span>
          <Toggle
            label={enabled ? t("i18n.visibleInPrompt") : t("i18n.hiddenFromPrompt")}
            enabled={enabled}
            loading={toggling}
            onToggle={() => onToggle(skill)}
          />
        </div>
        <div
          style={{
            minHeight: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
            textAlign: "right",
          }}
        >
          {!enabled && (
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              {t("i18n.hiddenButInvocable")}
            </span>
          )}
          {saveError && (
            <span style={{ fontSize: 12, color: "#f87171", overflowWrap: "anywhere" }}>
              {saveError}
            </span>
          )}
        </div>
      </div>

      {skill.install?.skillsShUrl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span
            style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}
          >
            Source
          </span>
          <a
            href={skill.install.skillsShUrl}
            target="_blank"
            rel="noreferrer"
            title={skill.install.skillsShUrl}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "fit-content",
              maxWidth: "100%",
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {skill.install.skillsShUrl.replace(/^https?:\/\//, "")} ↗
            </span>
          </a>
        </div>
      )}

      {skill.install && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span
            style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}
          >
            Version
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {shortVersion(updateStatus?.currentVersion ?? skill.install.versionHash)}
            </span>
            {skill.install.canCheckForUpdates && (
              <button
                onClick={onCheckUpdate}
                disabled={checkingUpdate || updating}
                style={{
                  padding: "4px 9px",
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  background: "none",
                  color: "var(--text-muted)",
                  cursor: checkingUpdate || updating ? "not-allowed" : "pointer",
                  opacity: checkingUpdate || updating ? 0.5 : 1,
                  fontSize: 12,
                }}
              >
                 {t("i18n.check")}
              </button>
            )}
            {updateStatus?.state === "update-available" && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--warning)",
                }}
              >
                {shortVersion(updateStatus.latestVersion)}
              </span>
            )}
            {(checkingUpdate ||
              (updateStatus && updateStatus.state !== "update-available")) && (
              <span
                style={{
                  fontSize: 12,
                  color: checkingUpdate
                    ? "var(--accent)"
                    : updateStatus?.state === "up-to-date"
                      ? "var(--success)"
                      : updateStatus?.state === "error"
                          ? "var(--danger)"
                          : "var(--text-dim)",
                }}
              >
                {checkingUpdate
                   ? t("i18n.checking")
                  : updateStatus?.state === "up-to-date"
                     ? t("i18n.upToDate")
                    : updateStatus?.state === "unsupported"
                         ? t("i18n.automaticChecksUnavailable")
                         : updateStatus?.message || t("i18n.checkFailed")}
              </span>
            )}
            {updateStatus?.state === "update-available" && (
              <button
                onClick={onUpdate}
                disabled={updating || checkingUpdate}
                style={{
                  padding: "4px 10px",
                  border: "none",
                  borderRadius: 5,
                  background: "var(--accent)",
                  color: "var(--on-accent)",
                  cursor: updating || checkingUpdate ? "not-allowed" : "pointer",
                  opacity: updating || checkingUpdate ? 0.5 : 1,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                 {updating ? t("i18n.updating") : t("i18n.update")}
              </button>
            )}
          </div>
          {updateError && (
            <span style={{ fontSize: 12, color: "var(--danger)" }}>{updateError}</span>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span
          style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}
        >
          Name
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            color: "var(--text)",
          }}
        >
          {skill.name}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span
          style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}
        >
          Description
        </span>
        <span
          style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}
        >
          {skill.description}
        </span>
      </div>
    </div>
  );
}

function AddSkillPanel({
  cwd,
  installedPackages,
  onInstalled,
}: {
  cwd: string;
  installedPackages: Record<SkillInstallScope, ReadonlySet<string>>;
  onInstalled: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [newlyInstalledPkgs, setNewlyInstalledPkgs] = useState<Set<string>>(
    new Set(),
  );
  const [scope, setScope] = useState<"global" | "project">("global");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const res = await fetch("/api/skills/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
      });
      const d = (await res.json()) as {
        results?: SkillSearchResult[];
        error?: string;
      };
      if (d.error) {
        setSearchError(d.error);
        return;
      }
      setResults(d.results ?? []);
      if ((d.results ?? []).length === 0) setSearchError("No skills found");
    } catch (e) {
      setSearchError(String(e));
    } finally {
      setSearching(false);
    }
  }, []);

  const install = useCallback(
    async (pkg: string) => {
      setInstalling(pkg);
      setInstallError(null);
      try {
        const res = await fetch("/api/skills/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package: pkg, scope, cwd }),
        });
        const d = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || d.error) {
          setInstallError(d.error ?? `HTTP ${res.status}`);
          return;
        }
        setNewlyInstalledPkgs((prev) =>
          new Set(prev).add(`${scope}:${pkg}`),
        );
        onInstalled();
      } catch (e) {
        setInstallError(String(e));
      } finally {
        setInstalling(null);
      }
    },
    [onInstalled, scope, cwd],
  );

  const installPath =
    scope === "global"
      ? "~/.pi/agent/skills/"
      : `${shortenPath(cwd)}/.pi/skills/`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Header area ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
           {t("i18n.addSkill")}
        </div>

        {/* Search row */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") search(query);
            }}
             placeholder={t("i18n.skillSearchPlaceholder")}
            style={{
              flex: 1,
              padding: "7px 10px",
              fontSize: 13,
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              outline: "none",
            }}
          />
          <button
            onClick={() => search(query)}
            disabled={searching || !query.trim()}
            style={{
              padding: "7px 16px",
              fontSize: 13,
              borderRadius: 6,
              border: "none",
              background: "var(--accent)",
              color: "var(--on-accent)",
              cursor: searching || !query.trim() ? "not-allowed" : "pointer",
              opacity: searching || !query.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
             {searching ? t("i18n.searching") : t("i18n.search")}
          </button>
        </div>

        {/* Scope + install path row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              borderRadius: 5,
              border: "1px solid var(--border)",
              overflow: "hidden",
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {(["global", "project"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                style={{
                  padding: "3px 10px",
                  border: "none",
                  cursor: "pointer",
                  background: scope === s ? "var(--bg-selected)" : "none",
                  color: scope === s ? "var(--text)" : "var(--text-dim)",
                  fontWeight: scope === s ? 600 : 400,
                  borderRight:
                    s === "global" ? "1px solid var(--border)" : "none",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-dim)",
              fontFamily: "var(--font-mono)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            → {installPath}
          </span>
        </div>

        {/* Errors */}
        {searchError && (
          <div style={{ fontSize: 12, color: "#f87171" }}>{searchError}</div>
        )}
        {installError && (
          <div
            style={{ fontSize: 12, color: "#f87171", wordBreak: "break-word" }}
          >
            {installError}
          </div>
        )}
      </div>

      {/* ── Results list ── */}
      {results.length > 0 ? (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {results.map((r) => {
            const isInstalled =
              installedPackages[scope].has(r.package) ||
              newlyInstalledPkgs.has(`${scope}:${r.package}`);
            const isInstalling = installing === r.package;
            // split "owner/repo@skill" for cleaner display
            const atIdx = r.package.indexOf("@");
            const repopart = atIdx > -1 ? r.package.slice(0, atIdx) : r.package;
            const skillpart = atIdx > -1 ? r.package.slice(atIdx + 1) : null;
            return (
              <div
                key={r.package}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* skill name prominent */}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text)",
                      marginBottom: 3,
                    }}
                  >
                    {skillpart ?? repopart}
                  </div>
                  {/* repo + installs + link row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--text-dim)",
                      }}
                    >
                      {repopart}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        fontWeight: 500,
                      }}
                    >
                      {r.installs}
                    </span>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 12,
                          color: "var(--accent)",
                          textDecoration: "none",
                        }}
                      >
                        skills.sh ↗
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() =>
                    !isInstalled && !isInstalling && install(r.package)
                  }
                  disabled={isInstalled || isInstalling || installing !== null}
                  style={{
                    flexShrink: 0,
                    padding: "5px 14px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 5,
                    border: "1px solid var(--border)",
                    cursor:
                      isInstalled || isInstalling || installing !== null
                        ? "not-allowed"
                        : "pointer",
                    background: isInstalled ? "rgba(34,197,94,0.1)" : "none",
                    color: isInstalled
                      ? "var(--success)"
                      : isInstalling
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    transition: "color 0.12s",
                  }}
                >
                  {isInstalled
                     ? `✓ ${t("i18n.installed")}`
                    : isInstalling
                       ? t("i18n.installing")
                       : t("i18n.install")}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        !searchError &&
        !searching && (
          <div
            style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.8 }}
          >
            Search{" "}
            <a
              href="https://skills.sh"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              skills.sh
            </a>{" "}
            to discover and install skills for your agent.
          </div>
        )
      )}
    </div>
  );
}

export function SkillsConfig({
  projectId,
  cwd,
  onClose,
}: {
  projectId: string;
  cwd: string;
  onClose: () => void;
}) {
  const modalRef = useDialogFocus(onClose);
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [updateStatuses, setUpdateStatuses] = useState<Record<string, SkillUpdateResult>>({});
  const [checkingUpdates, setCheckingUpdates] = useState<Set<string>>(new Set());
  const [checkingAll, setCheckingAll] = useState(false);
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [dormantGroupsOpen, setDormantGroupsOpen] = useState<Record<string, boolean>>({});
  const [skillTree, setSkillTree] = useState<SkillTreeResponse | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeGroupsOpen, setTreeGroupsOpen] = useState<Record<string, boolean>>({});

  const loadSkillTree = useCallback(async () => {
    setTreeError(null);
    try {
      const res = await fetch(`/api/skills/tree?projectId=${encodeURIComponent(projectId)}&cwd=${encodeURIComponent(cwd)}`);
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message = isRecordValue(body) && typeof body.message === "string" ? body.message : `HTTP ${res.status}`;
        throw new Error(message);
      }
      const tree = parseSkillTree(body);
      setSkillTree(tree);
      setTreeGroupsOpen((current) => ({
        personal: true,
        [`project:${projectId}`]: true,
        ...current,
      }));
    } catch (cause) {
      setSkillTree(null);
      setTreeError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [cwd, projectId]);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills?projectId=${encodeURIComponent(projectId)}&cwd=${encodeURIComponent(cwd)}`);
      const d = (await res.json()) as Partial<SkillsResponse> & { error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      const list = d.skills ?? [];
      setSkills(list);
      if (list.length > 0 && !selected) {
        const initialSkill = list.find((skill) => !skill.disableModelInvocation) ?? list[0];
        setSelected(initialSkill.filePath);
        if (initialSkill.disableModelInvocation) {
          setDormantGroupsOpen((current) => ({
            ...current,
            [skillGroupLabel(initialSkill)]: true,
          }));
        }
      }
      return list;
    } catch (e) {
      setError(String(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, [cwd, projectId, selected]);

  useEffect(() => {
    setUpdateStatuses({});
    setUpdateError(null);
    void loadSkills();
    void loadSkillTree();
  }, [cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkForUpdates = useCallback(async (skill?: Skill) => {
    const targets = skill
      ? [skill]
      : skills.filter((item) => Boolean(item.install));
    const keys = targets
      .map(updateKey)
      .filter((key): key is string => Boolean(key));
    if (keys.length === 0) return;

    setUpdateError(null);
    setCheckingUpdates((current) => new Set([...current, ...keys]));
    if (!skill) setCheckingAll(true);
    try {
      const res = await fetch("/api/skills/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          cwd,
          package: skill?.install?.package,
          scope: skill?.install?.scope,
        }),
      });
      const data = (await res.json()) as {
        updates?: SkillUpdateResult[];
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setUpdateStatuses((current) => {
        const next = { ...current };
        for (const update of data.updates ?? []) {
          next[`${update.scope}\0${update.package}`] = update;
        }
        return next;
      });
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckingUpdates((current) => {
        const next = new Set(current);
        for (const key of keys) next.delete(key);
        return next;
      });
      if (!skill) setCheckingAll(false);
    }
  }, [cwd, projectId, skills]);

  const updateInstalledSkill = useCallback(async (skill: Skill) => {
    if (!skill.install) return;
    const key = updateKey(skill)!;
    setUpdatingSkill(key);
    setUpdateError(null);
    try {
      const res = await fetch("/api/skills/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          cwd,
          package: skill.install.package,
          scope: skill.install.scope,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        skill?: Skill;
        error?: string;
      };
      if (!res.ok || data.error || !data.success) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await loadSkills();
      const versionHash = data.skill?.install?.versionHash;
      setUpdateStatuses((current) => ({
        ...current,
        [key]: {
          package: skill.install!.package,
          scope: skill.install!.scope,
          state: "up-to-date",
          currentVersion: versionHash,
          latestVersion: versionHash,
        },
      }));
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdatingSkill(null);
    }
  }, [cwd, loadSkills, projectId]);

  const toggle = useCallback(async (skill: Skill) => {
    const next = !skill.disableModelInvocation;
    setToggling((s) => new Set(s).add(skill.filePath));
    setSaveError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          cwd,
          filePath: skill.filePath,
          disableModelInvocation: next,
        }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setSaveError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setSkills((prev) =>
        prev.map((s) =>
          s.filePath === skill.filePath
            ? { ...s, disableModelInvocation: next }
            : s,
        ),
      );
      if (next) {
        setDormantGroupsOpen((current) => ({
          ...current,
          [skillGroupLabel(skill)]: true,
        }));
      }
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setToggling((s) => {
        const n = new Set(s);
        n.delete(skill.filePath);
        return n;
      });
    }
  }, []);

  const selectedSkill = skills.find((s) => s.filePath === selected) ?? null;

  const findTreeEntry = (filePath: string): { entry: SkillTreeEntry; owner: string } | null => {
    if (skillTree === null) return null;
    const personalHit = skillTree.personal.skills.find((skill) => skill.filePath === filePath);
    if (personalHit) return { entry: personalHit, owner: t("skillsTree.system") };
    for (const project of skillTree.projects) {
      const hit = project.skills.find((skill) => skill.filePath === filePath);
      if (hit) return { entry: hit, owner: `${t("skillsTree.project")} · ${project.name}` };
    }
    for (const workflow of skillTree.workflows) {
      for (const agent of workflow.agents) {
        const hit = agent.skills.find((skill) => skill.filePath === filePath);
        if (hit) return { entry: hit, owner: `${t("skillsTree.workflow")} · ${workflow.name} / ${agent.name}` };
      }
    }
    for (const agent of skillTree.longAgents) {
      const hit = agent.skills.find((skill) => skill.filePath === filePath);
      if (hit) return { entry: hit, owner: `${t("skillsTree.longAgent")} · ${agent.name}` };
    }
    return null;
  };
  const selectedTreeEntry = selectedSkill === null && selected !== null ? findTreeEntry(selected) : null;

  const renderTreeSkillRow = (entry: SkillTreeEntry) => {
    const inScope = skills.some((skill) => skill.filePath === entry.filePath);
    const isSelected = !addMode && selected === entry.filePath;
    const disabled = entry.disableModelInvocation;
    return (
      <div
        key={entry.filePath}
        onClick={() => {
          setSelected(entry.filePath);
          setAddMode(false);
        }}
        title={entry.filePath}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 8px",
          borderRadius: 5,
          cursor: "pointer",
          background: isSelected ? "var(--bg-selected)" : "none",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = "none";
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: disabled ? "var(--border)" : "var(--accent)",
            boxShadow: disabled ? "none" : "0 0 4px var(--accent)",
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: isSelected ? 600 : 400,
            color: disabled ? "var(--text-dim)" : "var(--text)",
            fontFamily: "var(--font-mono)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.name}
        </span>
        {!inScope && (
          <span style={{ fontSize: 9, color: "var(--text-dim)", flexShrink: 0 }}>{t("skillsTree.readOnlyBadge")}</span>
        )}
      </div>
    );
  };

  const renderTreeSection = (
    key: string,
    label: string,
    entries: readonly SkillTreeEntry[],
    options: { readonly badge?: string; readonly error?: string } = {},
  ) => {
    const open = treeGroupsOpen[key] ?? false;
    return (
      <div key={key} style={{ marginBottom: 4 }}>
        <div
          onClick={() => setTreeGroupsOpen((current) => ({ ...current, [key]: !open }))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 8px 4px",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <span style={{ fontSize: 8 }}>{open ? "▾" : "▸"}</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          {options.badge && <span style={{ color: "var(--accent)", textTransform: "none" }}>{options.badge}</span>}
          <span>({entries.length})</span>
        </div>
        {open && options.error && (
          <div style={{ padding: "2px 8px 4px 21px", fontSize: 12, color: "#f87171" }}>{options.error}</div>
        )}
        {open && entries.length === 0 && options.error === undefined && (
          <div style={{ padding: "2px 8px 4px 21px", fontSize: 12, color: "var(--text-dim)" }}>{t("skillsTree.empty")}</div>
        )}
        {open && entries.map(renderTreeSkillRow)}
      </div>
    );
  };

  const renderSkillTreeView = () => {
    if (skillTree === null) return null;
    return (
      <>
        {renderTreeSection("personal", t("skillsTree.system"), skillTree.personal.skills, {
          ...(skillTree.personal.error === undefined ? {} : { error: skillTree.personal.error }),
        })}
        {skillTree.projects.map((project) =>
          renderTreeSection(`project:${project.projectId}`, `${t("skillsTree.project")} · ${project.name}`, project.skills, {
            ...(project.projectId === projectId ? { badge: t("skillsTree.currentBadge") } : {}),
            ...(project.error === undefined ? {} : { error: project.error }),
          }),
        )}
        {skillTree.workflows.map((workflow) => {
          const key = `workflow:${workflow.workflowId}`;
          const open = treeGroupsOpen[key] ?? false;
          const total = workflow.agents.reduce((count, agent) => count + agent.skills.length, 0);
          return (
            <div key={key} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setTreeGroupsOpen((current) => ({ ...current, [key]: !open }))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 8px 4px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span style={{ fontSize: 8 }}>{open ? "▾" : "▸"}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t("skillsTree.workflow")} · {workflow.name}
                </span>
                <span>({total})</span>
              </div>
              {open && workflow.agents.map((agent) => (
                <div key={agent.agentId}>
                  <div style={{ padding: "2px 8px 2px 21px", fontSize: 12, color: "var(--text-muted)" }}>{agent.name}</div>
                  {agent.error !== undefined && (
                    <div style={{ padding: "2px 8px 4px 29px", fontSize: 12, color: "#f87171" }}>{agent.error}</div>
                  )}
                  {agent.error === undefined && agent.skills.length === 0 && (
                    <div style={{ padding: "2px 8px 4px 29px", fontSize: 12, color: "var(--text-dim)" }}>{t("skillsTree.empty")}</div>
                  )}
                  <div style={{ paddingLeft: 13 }}>{agent.skills.map(renderTreeSkillRow)}</div>
                </div>
              ))}
            </div>
          );
        })}
        {skillTree.longAgents.map((agent) =>
          renderTreeSection(`long-agent:${agent.longAgentId}`, `${t("skillsTree.longAgent")} · ${agent.name}`, agent.skills, {
            ...(agent.error === undefined ? {} : { error: agent.error }),
          }),
        )}
      </>
    );
  };

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" tabIndex={-1} aria-label="Skills" className="configuration-dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: isMobile ? "calc(100vw - 16px)" : 860,
          maxWidth: "calc(100vw - 16px)",
          height: isMobile ? "calc(100dvh - 16px)" : "78vh",
          maxHeight: "calc(100dvh - 16px)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}
            >
               {t("common.skills")}
            </span>
            <code
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                maxWidth: 320,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {shortenPath(cwd)}
            </code>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
          {/* Left: skill list */}
          <div
            style={{
              width: isMobile ? "100%" : 210,
              maxHeight: isMobile ? "40vh" : undefined,
              borderRight: isMobile ? "none" : "1px solid var(--border)",
              borderBottom: isMobile ? "1px solid var(--border)" : "none",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              background: "var(--bg-panel)",
            }}
          >
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {treeError !== null && (
                <div style={{ padding: "4px 8px", fontSize: 12, color: "#f87171" }}>{treeError}</div>
              )}
              {skillTree !== null ? renderSkillTreeView() : loading ? (
                <div
                  style={{
                    padding: "10px 8px",
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                   {t("i18n.loading")}
                </div>
              ) : error ? (
                <div
                  style={{
                    padding: "10px 8px",
                    fontSize: 12,
                    color: "#f87171",
                  }}
                >
                  {error}
                </div>
              ) : skills.length === 0 ? (
                <div
                  style={{
                    padding: "10px 8px",
                    fontSize: 12,
                    color: "var(--text-dim)",
                  }}
                >
                   {t("i18n.noSkills")}
                </div>
              ) : (
                (() => {
                  const groups: { label: string; skills: typeof skills }[] = [];
                  const groupDefinitions = [
                    {
                      label: "project / skills.sh",
                      matches: (skill: Skill) =>
                        sourceLabel(skill) === "project" &&
                        Boolean(skill.install?.skillsShUrl),
                    },
                    {
                      label: "project",
                      matches: (skill: Skill) =>
                        sourceLabel(skill) === "project" &&
                        !skill.install?.skillsShUrl,
                    },
                    {
                      label: "global / skills.sh",
                      matches: (skill: Skill) =>
                        sourceLabel(skill) === "global" &&
                        Boolean(skill.install?.skillsShUrl),
                    },
                    {
                      label: "global",
                      matches: (skill: Skill) =>
                        sourceLabel(skill) === "global" &&
                        !skill.install?.skillsShUrl,
                    },
                    {
                      label: "path",
                      matches: (skill: Skill) => sourceLabel(skill) === "path",
                    },
                  ];
                  for (const { label, matches } of groupDefinitions) {
                    const grpSkills = skills.filter(matches);
                    if (grpSkills.length > 0)
                      groups.push({ label, skills: grpSkills });
                  }
                  const renderSkillRow = (skill: Skill) => {
                    const isSelected =
                      !addMode && selected === skill.filePath;
                    const disabled = skill.disableModelInvocation;
                    return (
                      <div
                        key={skill.filePath}
                        onClick={() => {
                          setSelected(skill.filePath);
                          setAddMode(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "8px 8px",
                          borderRadius: 5,
                          cursor: "pointer",
                          background: isSelected
                            ? "var(--bg-selected)"
                            : "none",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected)
                            e.currentTarget.style.background =
                              "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected)
                            e.currentTarget.style.background = "none";
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: disabled
                              ? "var(--border)"
                              : "var(--accent)",
                            boxShadow: disabled
                              ? "none"
                              : "0 0 4px var(--accent)",
                            transition:
                              "background 0.15s, box-shadow 0.15s",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: isSelected ? 600 : 400,
                            color: disabled
                              ? "var(--text-dim)"
                              : "var(--text)",
                            fontFamily: "var(--font-mono)",
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {skill.name}
                        </span>
                        {(() => {
                          const key = updateKey(skill);
                          const status = key ? updateStatuses[key] : undefined;
                          if (status?.state !== "update-available") return null;
                          return (
                            <span
                               title={t("i18n.updateAvailable")}
                              style={{
                                color: "var(--warning)",
                                fontSize: 13,
                                lineHeight: 1,
                                flexShrink: 0,
                              }}
                            >
                              ↑
                            </span>
                          );
                        })()}
                      </div>
                    );
                  };
                  return groups.map(
                    ({ label: grpLabel, skills: grpSkills }) => {
                      const activeSkills = grpSkills.filter(
                        (skill) => !skill.disableModelInvocation,
                      );
                      const dormantSkills = grpSkills.filter(
                        (skill) => skill.disableModelInvocation,
                      );
                      const dormantOpen = dormantGroupsOpen[grpLabel] ?? false;
                      return (
                        <div key={grpLabel} style={{ marginBottom: 6 }}>
                          <div
                            style={{
                              padding: "4px 8px 3px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--text-dim)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {grpLabel}
                          </div>
                          {activeSkills.map(renderSkillRow)}
                          {dormantSkills.length > 0 && (
                            <>
                              <div
                                onClick={() =>
                                  setDormantGroupsOpen((current) => ({
                                    ...current,
                                    [grpLabel]: !dormantOpen,
                                  }))
                                }
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "4px 8px 3px",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "var(--text-dim)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                              >
                                <span style={{ fontSize: 8 }}>
                                  {dormantOpen ? "▾" : "▸"}
                                </span>
                                {t("i18n.dormant")} ({dormantSkills.length})
                              </div>
                              {dormantOpen && dormantSkills.map(renderSkillRow)}
                            </>
                          )}
                        </div>
                      );
                    },
                  );
                })()
              )}
            </div>
            {/* Add skill button */}
            <div
              style={{
                padding: "8px 6px",
                borderTop: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <div
                onClick={() => setAddMode(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 8px",
                  borderRadius: 5,
                  cursor: "pointer",
                  background: addMode ? "var(--bg-selected)" : "none",
                  color: addMode ? "var(--accent)" : "var(--text-dim)",
                  fontSize: 12,
                }}
                onMouseEnter={(e) => {
                  if (!addMode)
                    e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!addMode) e.currentTarget.style.background = "none";
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                 {t("i18n.addSkill")}
              </div>
            </div>
          </div>

          {/* Right: detail or add panel */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {addMode ? (
              <AddSkillPanel
                cwd={cwd}
                installedPackages={{
                  global: new Set(
                    skills
                      .filter((skill) => skill.install?.scope === "global")
                      .map((skill) => skill.install!.package),
                  ),
                  project: new Set(
                    skills
                      .filter((skill) => skill.install?.scope === "project")
                      .map((skill) => skill.install!.package),
                  ),
                }}
                onInstalled={() => {
                  void loadSkills();
                }}
              />
            ) : loading ? null : selectedSkill ? (
              <SkillDetail
                key={selectedSkill.filePath}
                skill={selectedSkill}
                cwd={cwd}
                onToggle={toggle}
                toggling={toggling.has(selectedSkill.filePath)}
                saveError={saveError}
                updateStatus={
                  updateKey(selectedSkill)
                    ? updateStatuses[updateKey(selectedSkill)!]
                    : undefined
                }
                checkingUpdate={
                  updateKey(selectedSkill)
                    ? checkingUpdates.has(updateKey(selectedSkill)!)
                    : false
                }
                updating={updatingSkill === updateKey(selectedSkill)}
                updateError={updateError}
                onCheckUpdate={() => void checkForUpdates(selectedSkill)}
                onUpdate={() => void updateInstalledSkill(selectedSkill)}
              />
            ) : selectedTreeEntry !== null ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {selectedTreeEntry.owner}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                  {selectedTreeEntry.entry.name}
                </div>
                {selectedTreeEntry.entry.description !== "" && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {selectedTreeEntry.entry.description}
                  </div>
                )}
                <code style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                  {shortenPath(selectedTreeEntry.entry.filePath)}
                </code>
                <div style={{ fontSize: 12, color: "var(--text-dim)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  {t("skillsTree.readOnlyHint")}
                </div>
              </div>
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-dim)",
                  fontSize: 13,
                }}
              >
                 {t("i18n.selectSkill")}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 18px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {skills.some((skill) => Boolean(skill.install)) && (
              <button
                onClick={() => void checkForUpdates()}
                disabled={checkingAll || updatingSkill !== null}
                style={{
                  padding: "6px 12px",
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text-muted)",
                  cursor:
                    checkingAll || updatingSkill !== null
                      ? "not-allowed"
                      : "pointer",
                  opacity: checkingAll || updatingSkill !== null ? 0.5 : 1,
                  fontSize: 12,
                }}
              >
                 {checkingAll ? t("i18n.checking") : t("i18n.checkUpdates")}
              </button>
            )}
            {Object.values(updateStatuses).filter(
              (status) => status.state === "update-available",
            ).length > 0 && (
              <span style={{ fontSize: 12, color: "var(--warning)" }}>
                {
                  Object.values(updateStatuses).filter(
                    (status) => status.state === "update-available",
                  ).length
                }{" "}
                {Object.values(updateStatuses).filter(
                  (status) => status.state === "update-available",
                ).length === 1
                   ? t("i18n.update")
                   : t("i18n.updates")}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
             {t("i18n.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
