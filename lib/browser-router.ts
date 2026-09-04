import { useMemo } from "react";

/** 更新地址栏中的Session查询参数；页面内容仍由React本地状态切换。 */
export function useBrowserRouter() {
  return useMemo(() => ({
    replace(href: string, _options?: { scroll?: boolean }) {
      window.history.replaceState(null, "", href);
    }
  }), []);
}
