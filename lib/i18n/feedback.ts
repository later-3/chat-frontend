import { enLocale } from "./messages/en.ts";
import { zhCNLocale } from "./messages/zh-CN.ts";
import { interfaceCopy } from "./messages/interface.ts";
import { interpolateMessage } from "./format.ts";
import type { Locale } from "./types";

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const copyCatalog = Object.fromEntries(Object.entries(enLocale.messages).map(([key, en]) => [key, { en, "zh-CN": zhCNLocale.messages[key] ?? en, source: interfaceCopy[key]?.source ?? en }]));
const exact = new Map<string, string>();
const patterns = Object.entries(copyCatalog).flatMap(([key, copy]) =>
  [...new Set([copy.source, copy.en, copy["zh-CN"]])].map(text => {
    if (!/\{[\w.-]+\}/.test(text)) { exact.set(text, key); return null; }
    // Short or placeholder-only templates are labels, not reliable feedback signatures.
    if (text.replace(/\{[\w.-]+\}/g, "").replace(/[^\p{L}]/gu, "").length < 8) return null;
    const names: string[] = [];
    let expression = "";
    let cursor = 0;
    for (const match of text.matchAll(/\{([\w.-]+)\}/g)) {
      expression += escapePattern(text.slice(cursor, match.index)) + "([\\s\\S]*?)";
      names.push(match[1]);
      cursor = match.index! + match[0].length;
    }
    expression += escapePattern(text.slice(cursor));
    return { key, names, pattern: new RegExp(`^${expression}$`) };
  }).filter((item): item is NonNullable<typeof item> => item !== null),
);

/** Only product-owned feedback is translated. Conversation text and resource content never use this. */
export function formatInterfaceFeedback(message: string, locale: Locale): { summary: string; details: string | null } {
  const exactKey = exact.get(message);
  if (exactKey) return { summary: copyCatalog[exactKey][locale], details: null };
  for (const item of patterns) {
    const match = item.pattern.exec(message);
    if (!match) continue;
    const params = Object.fromEntries(item.names.map((name, index) => [name, match[index + 1]]));
    return {
      summary: interpolateMessage(copyCatalog[item.key][locale], params),
      details: item.names.includes("detail") ? message : null,
    };
  }
  const key = /(?:network|fetch|connection|连接|网络|offline|ECONNREFUSED)/i.test(message) ? "feedback.connection"
    : /(?:409|conflict|revision|冲突|版本.*变化)/i.test(message) ? "feedback.conflict"
    : /(?:403|forbidden|permission|denied|权限|授权)/i.test(message) ? "feedback.permission"
    : /(?:404|not found|不存在|找不到|已删除)/i.test(message) ? "feedback.missing"
    : /(?:invalid|malformed|无效|非法|缺少.*字段)/i.test(message) ? "feedback.invalid"
    : "feedback.unavailable";
  return { summary: interfaceCopy[key][locale], details: message };
}
