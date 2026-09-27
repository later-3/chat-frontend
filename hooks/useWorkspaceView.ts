"use client";

import { useCallback, useEffect, useState } from "react";
import { workspaceViewFromUrl, workspaceViewUrl, type WorkspaceView } from "@/lib/workspace-view";

/** Navigation state only; switching views never replaces the mounted Chat Session. */
export function useWorkspaceView() {
  const [view, setView] = useState(() => workspaceViewFromUrl(window.location.href));
  useEffect(() => {
    const restore = () => setView(workspaceViewFromUrl(window.location.href));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const openView = useCallback((next: Exclude<WorkspaceView, "chat">) => {
    if (workspaceViewFromUrl(window.location.href) !== next) {
      window.history.pushState({ workspaceNavigation: true }, "", workspaceViewUrl(window.location.href, next));
    }
    setView(next);
  }, []);

  const openMoments = useCallback(() => openView("moments"), [openView]);
  const openGroups = useCallback(() => openView("groups"), [openView]);
  const openTopics = useCallback(() => openView("topics"), [openView]);
  const openSettings = useCallback(() => openView("settings"), [openView]);

  const showChat = useCallback(() => {
    window.history.replaceState(null, "", workspaceViewUrl(window.location.href, "chat"));
    setView("chat");
  }, []);

  // A labelled destination is deterministic; browser Back remains the user's history action.
  const goBack = showChat;

  return { view, openMoments, openGroups, openTopics, openSettings, showChat, goBack };
}
