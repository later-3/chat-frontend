"use client";

import { useI18n } from "@/hooks/useI18n";
import { SessionMemoryPanel } from "./SessionMemoryPanel";
import { SurfaceDialog } from "./SurfaceDialog";
import { InterfaceFeedback } from "./InterfaceFeedback";
import { Button } from "./ui/Button";

export interface SessionMemoryDialogProps {
  readonly storageProjectId: string;
  readonly sessionId: string;
  /** Server-side "record this session" setting; falls back to the local default. */
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly busy: boolean;
  /** False while the server-side setting is still loading or failed. */
  readonly ready: boolean;
  readonly error: string | null;
  readonly retry: (() => void) | null;
  readonly onCount: (count: number) => void;
  readonly onClose: () => void;
}

/**
 * The session-memory reader (UI/UX §18.4, §20.4).
 *
 * One SurfaceDialog owns the shell, the naming and the scroll; the body only uses
 * shared layout classes. It used to be assembled inline in ChatWindow with the
 * "record memory" setting mixed into a hand-rolled body, which is why it neither
 * followed the modal contract nor scrolled.
 */
export function SessionMemoryDialog({
  busy, enabled, error, onClose, onCount, onEnabledChange, ready, retry, sessionId, storageProjectId,
}: SessionMemoryDialogProps) {
  const { t } = useI18n();
  return <SurfaceDialog title={t("topics.memoryPanel")} onClose={onClose}>
    <div className="ui-scroll-20 ui-stack-16">
      <div className="ui-card">
        {!ready ? <div className="ui-stack-8">
          {error !== null
            ? <div className="ui-row-between">
              <InterfaceFeedback message={error} />
              {retry !== null && <Button variant="ghost" type="button" onClick={retry}>{t("longAgentSettings.retry")}</Button>}
            </div>
            : <p className="ui-list-note" role="status">{t("common.loading")}</p>}
        </div> : (
          <label className="ui-setting-row">
            <input type="checkbox" checked={enabled} data-session-memory-toggle disabled={busy}
              onChange={(event) => onEnabledChange(event.target.checked)} />
            {t("friendCalendar.recordMemory")}
          </label>
        )}
      </div>
      <SessionMemoryPanel storageProjectId={storageProjectId} sessionId={sessionId} onCount={onCount} />
    </div>
  </SurfaceDialog>;
}
