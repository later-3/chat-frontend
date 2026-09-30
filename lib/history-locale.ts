import type { Locale } from "./i18n/types";

/** Presentation-only adapter for the pinned Pi export. Never translate message, prompt or tool content. */
function localizeHistory(locale: Locale) {
  const chinese = locale === "zh-CN";
  document.documentElement.lang = locale;
  document.title = chinese ? "完整历史" : "Full history";
  const text = (selector: string, value: string) => document.querySelectorAll(selector).forEach(element => {
    if (element.textContent !== value) element.textContent = value;
  });
  const attribute = (selector: string, name: string, value: string) => document.querySelectorAll(selector).forEach(element => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  });
  const dates = new Map<string, string>();
  let sessionDate: string | undefined;
  try {
    const encoded = document.getElementById("session-data")?.textContent ?? "";
    const data: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))));
    if (data && typeof data === "object") {
      const payload = data as { header?: { timestamp?: unknown }; entries?: unknown };
      if (typeof payload.header?.timestamp === "string") sessionDate = payload.header.timestamp;
      if (Array.isArray(payload.entries)) for (const entry of payload.entries) {
        if (entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.timestamp === "string") dates.set(`entry-${entry.id}`, entry.timestamp);
      }
    }
  } catch { /* Pi owns invalid export handling. Decoration never changes its data. */ }
  const apply = () => {
    text('[data-chat-session-activity="daily-summary"] > .chat-agent-stage-header > span', chinese ? "日终总结" : "Daily summary");
    text('[data-chat-session-activity="daily-summary-draft"] > .chat-agent-stage-header > span', chinese ? "日终总结草稿" : "Daily summary draft");
    if (sessionDate && Number.isFinite(Date.parse(sessionDate))) text(".header-info .info-item:first-child .info-value", new Date(sessionDate).toLocaleString(locale));
    document.querySelectorAll("#messages > [id] > .message-timestamp").forEach(element => {
      const date = dates.get(element.parentElement?.id ?? "");
      if (!date || !Number.isFinite(Date.parse(date))) return;
      const value = new Date(date).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (element.textContent !== value) element.textContent = value;
    });
    attribute("#hamburger", "title", chinese ? "打开历史树" : "Open history tree");
    attribute("#sidebar-close", "title", chinese ? "关闭" : "Close");
    attribute("#tree-search", "placeholder", chinese ? "搜索历史…" : "Search history…");
    attribute("#tree-search", "aria-label", chinese ? "搜索历史" : "Search history");
    attribute("#sidebar-resizer", "aria-label", chinese ? "调整历史树宽度" : "Resize history tree");
    const filters = chinese ? ["默认", "隐藏工具", "用户", "已标记", "全部"] : ["Default", "No tools", "User", "Labeled", "All"];
    const hints = chinese ? ["隐藏设置记录", "隐藏设置与工具结果", "仅用户消息", "仅已标记记录", "显示全部记录"] : ["Hide settings entries", "Hide settings and tool results", "Only user messages", "Only labeled entries", "Show all entries"];
    ["default", "no-tools", "user-only", "labeled-only", "all"].forEach((filter, index) => {
      const selector = `.sidebar-filters [data-filter="${filter}"]`;
      text(selector, filters[index]); attribute(selector, "title", hints[index]);
    });
    ["thinking", "tools"].forEach((kind, index) => {
      const label = chinese ? ["显示或收起思考", "显示或收起工具"][index] : ["Toggle thinking", "Toggle tools"][index];
      const selector = `.header [data-action="toggle-${kind}"]`;
      text(selector, label); attribute(selector, "title", `${label} (${index ? "O" : "T"})`);
    });
    text(".header .help-hint", chinese ? "T 切换思考 · O 切换工具" : "T toggle thinking · O toggle tools");
    attribute(".header .download-json-btn", "title", chinese ? "下载会话 JSONL" : "Download session as JSONL");
    attribute("#messages > div > .copy-link-btn", "title", chinese ? "复制此消息的链接" : "Copy link to this message");
    const labels = chinese ? ["日期：", "模型：", "消息：", "工具调用：", "词元：", "费用："] : ["Date:", "Models:", "Messages:", "Tool calls:", "Tokens:", "Cost:"];
    document.querySelectorAll(".header-info .info-label").forEach((element, index) => {
      if (labels[index] && element.textContent !== labels[index]) element.textContent = labels[index];
    });
    text("#header-container .system-prompt-header", chinese ? "系统提示词" : "System prompt");
    text("#header-container .tools-header", chinese ? "可用工具" : "Available tools");
    text("#header-container .tool-param-required", chinese ? "必填" : "required");
    text("#header-container .tool-param-optional", chinese ? "可选" : "optional");
    text("#messages > .assistant-message > .thinking-block > .thinking-collapsed", chinese ? "思考…" : "Thinking…");
    if (chinese) {
      text("#tree-container .tree-role-user", "用户：");
      text("#tree-container .tree-role-assistant", "助手：");
      text("#tree-container .tree-role-skill", "技能：");
      text("#tree-container .tree-branch-summary", "[分支摘要]：");
      const replacements: [string, RegExp, string][] = [
        ["#tree-status", / entries$/, " 条记录"],
        [".header-info .info-value", /^unknown$/, "未知"],
        ["#tree-container .tree-muted", /^\[session_info\]$/, "[会话信息]"],
        ["#tree-container .tree-muted", /^\[custom\]$/, "[自定义记录]"],
        [".header h1", /^Session: /, "会话："],
        [".header-info .info-item:nth-child(3) .info-value", /tool results|branch summaries|compactions|assistant|custom|user/g, ""],
        ["#header-container .system-prompt-expand-hint", /\.\.\. \((\d+) more lines, click to expand\)/, "…（还有 $1 行，点击展开）"],
        ["#tree-container .tree-muted", /^\(aborted\)$/, "（已停止）"],
        ["#tree-container .tree-muted", /^\(no text\)$/, "（无正文）"],
        ["#tree-container .tree-muted", /^\[model: /, "[模型："],
        ["#tree-container .tree-muted", /^\[thinking: /, "[思考："],
        ["#tree-container .tree-compaction", /^\[compaction: (.*) tokens\]$/, "[压缩：$1 词元]"],
      ];
      const roles: Record<string, string> = { user: "用户", assistant: "助手", "tool results": "工具结果", custom: "自定义", compactions: "压缩", "branch summaries": "分支摘要" };
      replacements.forEach(([selector, pattern, replacement]) => document.querySelectorAll(selector).forEach(element => {
        const current = element.textContent ?? "";
        const next = replacement ? current.replace(pattern, replacement) : current.replace(pattern, match => roles[match]);
        if (current !== next) element.textContent = next;
      }));
    }
  };
  apply();
  // Pi re-renders the tree when a filter or branch changes. Disconnect while updating owned UI.
  const observer = new MutationObserver(() => { observer.disconnect(); apply(); observe(); });
  function observe() {
    ["sidebar", "header-container", "messages"].forEach(id => {
      const root = document.getElementById(id);
      if (root) observer.observe(root, { childList: true, subtree: true });
    });
  }
  observe();
}

export function historyLocaleScript(locale: Locale): string {
  return `<script id="chat-history-locale">(${localizeHistory.toString()})(${JSON.stringify(locale)})</script>`;
}
