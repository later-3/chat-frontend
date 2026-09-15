"use client";

import { useCallback, useEffect, useState } from "react";
import { workspaceViewFromUrl, workspaceViewUrl } from "@/lib/workspace-view";

/** Navigation state only; switching views never replaces the mounted Chat Session. */
export function useWorkspaceView() {
  const [view, setView] = useState(() => workspaceViewFromUrl(window.location.href));
  useEffect(() => {
    const restore = () => setView(workspaceViewFromUrl(window.location.href));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const openMoments = useCallback(() => {
    if (workspaceViewFromUrl(window.location.href) !== "moments") {
      window.history.pushState({ momentsNavigation: true }, "", workspaceViewUrl(window.location.href, "moments"));
    }
    setView("moments");
  }, []);

  const showChat = useCallback(() => {
    window.history.replaceState(null, "", workspaceViewUrl(window.location.href, "chat"));
    setView("chat");
  }, []);

  const goBack = useCallback(() => {
    if (window.history.state?.momentsNavigation === true) window.history.back();
    else showChat();
  }, [showChat]);

  return { view, openMoments, showChat, goBack };
}
