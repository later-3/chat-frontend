/** Only decorate the trusted Backend's Pi export; session data and tree scripts stay intact. */
export function styleHistoryDocument(html: string, themeCss: string): string {
  if (!/<script\b[^>]*id=["']session-data["']/i.test(html) || !html.includes('</head>')) {
    throw new Error("完整历史返回了无效的页面，请重试");
  }
  return html.replace('</head>', `<style id="chat-history-theme">${themeCss}</style></head>`);
}
