import { useMemo } from "react";
import { workspaceViewFromUrl, workspaceViewUrl } from "./workspace-view";

/** 更新地址栏中的Session查询参数；页面内容仍由React本地状态切换。 */
export function useBrowserRouter() {
  return useMemo(() => ({
    replace(href: string, _options?: { scroll?: boolean }) {
      const view = workspaceViewFromUrl(window.location.href);
      const next = new URL(href, window.location.href).href;
      window.history.replaceState(window.history.state, "", workspaceViewUrl(next, view));
    }
  }), []);
}
