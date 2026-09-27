import { historyLocaleScript } from "./history-locale.ts";
import type { Locale } from "./i18n/types";

/** Only decorate the trusted Backend's Pi export; session data and tree scripts stay intact. */
export function styleHistoryDocument(html: string, themeCss: string, locale?: Locale): string {
  if (!/<script\b[^>]*id=["']session-data["']/i.test(html) || !html.includes('</head>')) {
    throw new Error("完整历史返回了无效的页面，请重试");
  }
  const styled = html.replace('</head>', `<style id="chat-history-theme">${themeCss}</style></head>`);
  return locale ? styled.replace('</body>', `${historyLocaleScript(locale)}</body>`) : styled;
}
