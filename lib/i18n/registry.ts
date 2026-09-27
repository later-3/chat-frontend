import { enLocale } from "./messages/en";
import { zhCNLocale } from "./messages/zh-CN";
import type { LocalePlugin } from "./types";

const localePlugins = new Map<string, LocalePlugin>();

/** 注册一个语言包；重复注册会抛出异常，避免静默覆盖翻译。 */
export function registerLocale(plugin: LocalePlugin): void {
  if (!plugin.id.trim()) throw new Error("Locale id must not be empty");
  if (localePlugins.has(plugin.id)) throw new Error(`Locale already registered: ${plugin.id}`);
  localePlugins.set(plugin.id, plugin);
}

/**
 * 根据标识获取已注册的语言包。
 * @param id 要查询的语言标识
 * @returns 已注册的语言包，不存在时返回 undefined
 */
export function getLocalePlugin(id: string): LocalePlugin | undefined {
  return localePlugins.get(id);
}

/** 获取当前已注册语言的稳定顺序列表。 */
export function getSupportedLocales(): string[] {
  return [...localePlugins.keys()];
}

registerLocale(enLocale);
registerLocale(zhCNLocale);
