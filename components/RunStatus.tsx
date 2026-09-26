import { createContext, useEffect, useState } from "react";
import { IconLoader2, IconCheck, IconAlertCircle, IconPlayerPause } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import type { RunActivity } from "@/lib/run-activity";

export const ToolActivityContext = createContext<{ tools: RunActivity["tools"]; busy: boolean }>({ tools: {}, busy: false });

export function RunStatus({ activity, busy }: { activity: RunActivity | null; busy: boolean }) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  if (activity === null || (!busy && activity.phase === "completed")) return null;
  const phase = activity.phase;
  const waitingHuman = phase === "review";
  const runningTools = Object.values(activity.tools).filter(tool => tool.status === "running");
  const label = activity.streamLost && busy
    ? t("runStatus.streamLost")
    : phase === "tools"
      ? t("runStatus.tools", { names: runningTools.map(tool => tool.name).join(", ") })
      : phase === "retry" && activity.retry
        ? t("runStatus.retry", { attempt: activity.retry.attempt, max: activity.retry.maxAttempts, seconds: Math.max(0, Math.ceil((activity.retry.until - now) / 1000)) })
        : t(`runStatus.${phase}`);
  const warning = phase === "failed" || phase === "disconnected" || (busy && activity.streamLost);
  const announcement = phase === "retry" && activity.retry && !activity.streamLost
    ? t("runStatus.retryAnnouncement", { attempt: activity.retry.attempt, max: activity.retry.maxAttempts })
    : label;
  const Icon = warning ? IconAlertCircle : waitingHuman || phase === "cancelled" || phase === "detached" ? IconPlayerPause : busy ? IconLoader2 : IconCheck;
  return (
    <div data-run-status data-round-phase={busy ? activity.roundPhase : undefined} style={{ maxWidth: 820, margin: "0 auto", padding: "8px 16px", fontSize: 13, color: "var(--text-muted)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={16} aria-hidden className={busy && !waitingHuman && !warning ? "animate-spin motion-reduce:animate-none" : undefined} style={{ flexShrink: 0 }} />
        <span aria-hidden>{busy && activity.roundPhase === "remember" ? `${t("topics.rememberRunning")} · ${label}` : label}</span>
        <span role="status" aria-live="polite" className="sr-only">{busy && activity.roundPhase === "remember" ? `${t("topics.rememberRunning")} · ${announcement}` : announcement}</span>
        {busy && !waitingHuman && <span aria-hidden style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{t("runStatus.elapsed", { seconds: Math.max(0, Math.floor((now - activity.since) / 1000)) })}</span>}
      </div>
      {activity.error && <div style={{ marginTop: 4, fontSize: 12 }}>{activity.error}</div>}
      {busy && !waitingHuman && now - activity.lastEventAt >= 30_000 && (
        <div style={{ marginTop: 4, fontSize: 12 }}>
          {t("runStatus.quiet")}
          {activity.confirmedAt !== undefined && ` ${t("runStatus.confirmed", { seconds: Math.max(0, Math.floor((now - activity.confirmedAt) / 1000)) })}`}
        </div>
      )}
    </div>
  );
}
