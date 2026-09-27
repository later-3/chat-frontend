"use client";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  fetchLongAgentActivity,
  type LongAgentActivityDay,
} from "@/lib/long-agents-browser";
import { FriendDailyStatus } from "./FriendDailyStatus";
import styles from "./LongAgentSettingsPanel.module.css";

interface Props {
  longAgentId: string;
}

export function LongAgentActivitySettings({ longAgentId }: Props) {
  const { t } = useI18n();
  const [days, setDays] = useState<readonly LongAgentActivityDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const activity = await fetchLongAgentActivity(longAgentId, undefined, signal);
      if (signal?.aborted) return;
      setDays(activity);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, [longAgentId]);

  useEffect(() => {
    const controller = new AbortController();
    setDays(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section className={styles.section} aria-label={t("longAgentSettings.activityTab")}>
      {error && <div className={styles.error} role="alert"><InterfaceFeedback message={error} /></div>}
      <FriendDailyStatus key={longAgentId} longAgentId={longAgentId} />
      <h3>{t("longAgentSettings.activityHeading")}</h3>
      <p className={styles.help}>{t("longAgentSettings.activityHint")}</p>
      {days === null && !error && <small>{t("longAgentSettings.inspectionLoading")}</small>}
      {!error && days !== null && days.length === 0 && <p className={styles.help}>{t("longAgentSettings.activityEmpty")}</p>}
      {days !== null && days.length > 0 && (
        <ul className={styles.taskList}>
          {days.map((day) => (
            <li key={day.date} className={styles.taskRow}>
              <div className={styles.taskHead}>
                <strong>{day.date}</strong>
                <small>{t("longAgentSettings.activityTurns", { turns: day.turns, sessions: day.sessions })}</small>
                <span className={styles.pending}>{day.tokens.total}{t("interface.tokens")}</span>
              </div>
              <p className={styles.taskPrompt}>
                {day.tools.length === 0
                  ? t("longAgentSettings.activityNoTools")
                  : day.tools.map((tool) => `${tool.name}×${tool.count}`).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}

    </section>
  );
}
