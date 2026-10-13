"use client";

import { useI18n } from "@/hooks/useI18n";
import type { ContextUsageView } from "@/lib/interactions";

/** 上下文窗口占比（用户 2026-10-13）：顶部显示"这一轮总共占多少"，与每个区块的占比同一口径。 */
export function ContextUsageBar({ usage }: { readonly usage: ContextUsageView }) {
  const { t } = useI18n();
  if (usage.contextWindowTokens <= 0) return null;
  const percent = (usage.totalTokens / usage.contextWindowTokens) * 100;
  return <div className="context-usage-bar" data-context-usage>
    <div className="context-usage-head">
      <span className="context-usage-title">{t("chat.contextPreviewUsage")}</span>
      <span className="context-usage-percent" data-context-usage-percent>{percent.toFixed(2)}%</span>
      <span className="context-usage-tokens">
        {t("chat.contextPreviewUsageTokens", {
          tokens: usage.totalTokens.toLocaleString(),
          window: usage.contextWindowTokens.toLocaleString(),
        })}
      </span>
    </div>
    <div className="context-usage-track" role="img" aria-label={`${percent.toFixed(2)}%`}>
      <div className="context-usage-fill" style={{ width: `${Math.min(100, Math.max(0.5, percent))}%` }} />
    </div>
  </div>;
}
