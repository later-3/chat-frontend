import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";
import { DirectoryPicker } from "./DirectoryPicker";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  clearProjectSessionsCache,
  createLongAgentProjectSession,
  fetchLongAgentConfiguration,
  fetchLongAgentProjectSessions,
  saveLongAgentConfiguration,
  type LongAgentConfigurationDocument,
  type LongAgentProjectSession,
} from "@/lib/long-agents-browser";
import { fetchChatProjects, openChatProject, type ChatProjectSummary } from "@/lib/projects-contract";
import { renameSession } from "@/lib/session-removal-browser";
import styles from "./LongAgentProjectTree.module.css";

export interface LongAgentProjectTreeProps {
  readonly longAgentId: string;
  readonly activeSessionId: string | null;
  /** 当前打开会话的存储项目：树必须跟随它，否则会出现"打开的是 chat 会话、树却停在 Workspace"的错位。 */
  readonly activeProjectId?: string | null;
  readonly onOpenSession: (projectId: string, sessionId: string) => void | Promise<void>;
  /** 点击项目节点即切换到该项目：打开最新会话；该项目还没有会话时创建一条归属会话再打开。 */
  readonly onSelectProject?: (projectId: string) => void | Promise<void>;
}

function kindLabelKey(kind: string): string {
  switch (kind) {
    case "fork": return "laProjectTree.kindFork";
    case "additional": case "independent": return "laProjectTree.kindIndependent";
    case "daily": return "laProjectTree.kindDaily";
    case "work": return "laProjectTree.kindWork";
    case "topic": return "laProjectTree.kindTopic";
    default: return "laProjectTree.kindIndependent";
  }
}

function projectName(projects: readonly ChatProjectSummary[], id: string, fallback: string): string {
  return projects.find((project) => project.projectId === id)?.cachedName ?? fallback;
}

export function LongAgentProjectTree({ longAgentId, activeSessionId, activeProjectId, onOpenSession, onSelectProject }: LongAgentProjectTreeProps) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<readonly ChatProjectSummary[]>([]);
  const [doc, setDoc] = useState<LongAgentConfigurationDocument | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [sessions, setSessions] = useState<readonly LongAgentProjectSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // 用户手动命名：预填当前显示标题；未改动则不写盘（把“第一句话兜底”误固化成真名字）。
  const [renaming, setRenaming] = useState<{ sessionId: string; value: string } | null>(null);
  const renameCancelled = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ longAgentId, selectedProject });
  latest.current = { longAgentId, selectedProject };

  const reloadConfig = useCallback(async (signal?: AbortSignal) => {
    const next = await fetchLongAgentConfiguration(longAgentId, signal);
    if (signal?.aborted || latest.current.longAgentId !== longAgentId) return;
    setDoc(next);
    setSelectedProject((current) => current ?? (activeProjectId ?? null) ?? next.agent.boundProjectIds[0] ?? null);
  }, [longAgentId, activeProjectId]);

  // 会话切换时让树跟随它所属的项目（只在真正切换时跟随一次，不打断用户手动展开别的项目）。
  const lastActiveProject = useRef<string | null>(null);
  useEffect(() => {
    if (activeProjectId === null || activeProjectId === undefined) return;
    if (lastActiveProject.current === activeProjectId) return;
    lastActiveProject.current = activeProjectId;
    setSelectedProject(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null); setDoc(null);
    setSelectedProject(null); setSessions([]); setSessionsLoaded(false);
    void Promise.all([reloadConfig(controller.signal), fetchChatProjects(controller.signal).then((list) => {
      if (controller.signal.aborted) return;
      setProjects(list);
    })]).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [reloadConfig]);

  const reloadSessions = useCallback(async (projectId: string, signal?: AbortSignal, force = false) => {
    const list = await fetchLongAgentProjectSessions(longAgentId, projectId, signal, { force });
    if (signal?.aborted || latest.current.longAgentId !== longAgentId || latest.current.selectedProject !== projectId) return;
    setSessions(list); setSessionsLoaded(true);
  }, [longAgentId]);

  useEffect(() => {
    setSessions([]); setSessionsLoaded(false);
    if (selectedProject === null) return;
    const controller = new AbortController();
    void reloadSessions(selectedProject, controller.signal)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [selectedProject, reloadSessions, activeSessionId]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const saveBoundProjects = async (boundProjectIds: readonly string[]) => {
    if (doc === null) return;
    const saved = await saveLongAgentConfiguration(longAgentId, doc.revision, {
      name: doc.agent.name, description: doc.agent.description, enabled: doc.agent.enabled,
      defaultProjectId: doc.agent.defaultProjectId, boundProjectIds,
      definition: doc.agent.definition,
    });
    setDoc(saved);
  };

  // 与侧栏项目选择器同一注册流程：目录选择器 → 后端登记或初始化 → 再绑定到该 Agent。
  // 打开已注册的目录是幂等的：openChatProject 会返回既有项目，重复绑定被 includes 守卫挡掉。
  const openAndBindProject = (candidate: string) => void run(async () => {
    const path = candidate.trim();
    if (path === "" || doc === null) return;
    const opened = await openChatProject(path);
    if (latest.current.longAgentId !== longAgentId) return;
    if (!doc.agent.boundProjectIds.includes(opened.projectId)) {
      await saveBoundProjects([...doc.agent.boundProjectIds, opened.projectId]);
    }
    setProjects(await fetchChatProjects());
    setSelectedProject(opened.projectId);
    setPickerOpen(false);
    clearProjectSessionsCache();
  });

  const unbindProject = async (projectId: string) => {
    if (doc === null) return;
    await saveBoundProjects(doc.agent.boundProjectIds.filter((id) => id !== projectId));
    clearProjectSessionsCache(longAgentId);
    if (selectedProject === projectId) { setSelectedProject(null); setSessions([]); setSessionsLoaded(false); }
  };
  const unbind = (projectId: string) => { void run(async () => { await unbindProject(projectId); }); };

  const newSession = (projectId: string) => void run(async () => {
    const created = await createLongAgentProjectSession(longAgentId, {
      projectId, requestId: crypto.randomUUID(),
    });
    await reloadSessions(projectId, undefined, true);
    setSelectedProject(projectId);
    await onOpenSession(projectId, created.sessionId);
  });

  /**
   * 点击项目 = 切换上下文到该项目（用户合同：点第二个项目必须真的切过去）。
   * 有会话 → 打开最新一条；还没有会话 → 用固定 requestId 幂等创建一条归属会话再打开，
   * 因此重复点击不会堆积空壳会话。Workspace 由每日/额外会话承载，永不新建项目归属会话。
   */
  const openProjectNode = (projectId: string) => void run(async () => {
    if (onSelectProject !== undefined) { await onSelectProject(projectId); return; }
    setSelectedProject(projectId);
    const list = await fetchLongAgentProjectSessions(longAgentId, projectId, undefined, { force: true });
    if (latest.current.longAgentId !== longAgentId) return;
    setSessions(list); setSessionsLoaded(true);
    const latestSession = list[0];
    if (latestSession !== undefined) { await onOpenSession(projectId, latestSession.sessionId); return; }
    if (projectId === (doc?.agent.boundProjectIds[0] ?? longAgentId)) return;
    const created = await createLongAgentProjectSession(longAgentId, { projectId, requestId: `tree-open:${projectId}` });
    // 直接取新列表：reloadSessions 的守卫以"已提交的 selectedProject"为准，
    // 同一轮点击里刚 set 的状态尚未生效，会让列表停在创建前的空结果。
    const refreshed = await fetchLongAgentProjectSessions(longAgentId, projectId, undefined, { force: true });
    if (latest.current.longAgentId !== longAgentId) return;
    setSessions(refreshed); setSessionsLoaded(true);
    await onOpenSession(projectId, created.sessionId);
  });

  const commitRename = () => void run(async () => {
    const target = renaming;
    setRenaming(null);
    if (target === null || selectedProject === null) return;
    const name = target.value.trim();
    const current = sessions.find((session) => session.sessionId === target.sessionId)?.title;
    if (name === "" || name === current) return;
    await renameSession(selectedProject, target.sessionId, name);
    const refreshed = await fetchLongAgentProjectSessions(longAgentId, selectedProject, undefined, { force: true });
    if (latest.current.longAgentId !== longAgentId) return;
    setSessions(refreshed); setSessionsLoaded(true);
  });

  const boundProjectIds = doc?.agent.boundProjectIds ?? [];
  const workspaceId = boundProjectIds[0] ?? longAgentId;

  return <div className={styles.tree} data-long-agent-project-tree={longAgentId}>
    <p className={styles.heading}>{t("laProjectTree.projects")}</p>
    <ul className={styles.projects}>
      <li>
        <button type="button" data-project-tree-project={workspaceId}
          className={selectedProject === workspaceId ? styles.activeProject : styles.project}
          onClick={() => openProjectNode(workspaceId)}>
          <span className={styles.projectName}>{projectName(projects, workspaceId, workspaceId)}</span>
        </button>
      </li>
      {boundProjectIds.filter((id) => id !== workspaceId).map((projectId) => <li key={projectId}>
        <button type="button" data-project-tree-project={projectId}
          className={selectedProject === projectId ? styles.activeProject : styles.project}
          onClick={() => openProjectNode(projectId)}>
          <span className={styles.projectName}>{projectName(projects, projectId, projectId)}</span>
          <span className={styles.unlink} data-project-tree-unbind={projectId} role="button" tabIndex={0}
            title={t("laProjectTree.unbind")}
            onClick={(event) => { event.stopPropagation(); unbind(projectId); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.stopPropagation(); unbind(projectId); } }}
          >×</span>
        </button>
      </li>)}
    </ul>
    {/* 添加项目 = 打开一个目录：点击直接弹目录选择器（复用 /api/cwd/browse 底层能力），无中间层。 */}
    <Button variant="ghost" type="button" className={styles.addProject} data-project-tree-add
      disabled={busy}
      onClick={() => { setError(null); setPickerOpen(true); }}>{t("laProjectTree.addProject")}</Button>

    {selectedProject !== null && <>
      <div className={styles.sessionsHeader}>
        <p className={styles.heading}>{projectName(projects, selectedProject, selectedProject)}</p>
        {selectedProject !== workspaceId && <Button variant="primary" type="button" className={styles.newSession} data-project-tree-new={selectedProject}
          disabled={busy} onClick={() => newSession(selectedProject)}>{t("laProjectTree.newSession")}</Button>}
      </div>
      <ul className={styles.sessions}>
        {sessions.map((session) => <li key={session.sessionId} className={styles.sessionRow}>
          {renaming?.sessionId === session.sessionId ? (
            <input className={styles.sessionRename} autoFocus value={renaming.value}
              data-project-tree-rename-input={session.sessionId}
              onChange={(event) => setRenaming({ sessionId: session.sessionId, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") { renameCancelled.current = true; setRenaming(null); }
              }}
              onBlur={() => { if (renameCancelled.current) { renameCancelled.current = false; return; } commitRename(); }} />
          ) : (<>
            <button type="button" data-project-tree-session={session.sessionId}
              className={session.sessionId === activeSessionId ? styles.activeSession : styles.session}
              onClick={() => void onOpenSession(session.projectId, session.sessionId)}>
              <span className={styles.sessionTitle}>{session.title}</span>
              <small className={styles.sessionMeta}>
                {t(kindLabelKey(session.kind))}{" · "}{session.messageCount} {t("laProjectTree.messagesSuffix")}
              </small>
            </button>
            <button type="button" data-project-tree-rename={session.sessionId} className={styles.rename}
              title={t("laProjectTree.rename")}
              onClick={() => { renameCancelled.current = false; setRenaming({ sessionId: session.sessionId, value: session.title }); }}>✎</button>
          </>)}
        </li>)}
        {sessionsLoaded && sessions.length === 0 && <li className={styles.hint}>{t("laProjectTree.emptySessions")}</li>}
      </ul>
    </>}
    {error !== null && <p role="alert" className={styles.error}><InterfaceFeedback message={error} /></p>}
    {pickerOpen && (
      <DirectoryPicker
        busy={busy}
        error={error}
        onCancel={() => setPickerOpen(false)}
        onSelect={(path) => openAndBindProject(path)}
      />
    )}
  </div>;
}
