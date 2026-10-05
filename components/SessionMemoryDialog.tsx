"use client";

import { SessionMemoryPanel } from "./SessionMemoryPanel";
import { SurfaceDialog } from "./SurfaceDialog";
import { useI18n } from "@/hooks/useI18n";

export interface SessionMemoryDialogProps {
  readonly storageProjectId: string;
  readonly sessionId: string;
  readonly onCount: (count: number) => void;
  readonly onClose: () => void;
}

/**
 * The session-memory reader (UI/UX §18.4, §20.4).
 *
 * One SurfaceDialog owns the shell, the naming and the scroll; the body only uses
 * shared layout classes. Session memory itself is maintained by the user-triggered
 * 「会话记忆」Workflow, so this dialog is a pure reader.
 */
export function SessionMemoryDialog({ onClose, onCount, sessionId, storageProjectId }: SessionMemoryDialogProps) {
  const { t } = useI18n();
  return <SurfaceDialog title={t("topics.memoryPanel")} onClose={onClose}>
    <div className="ui-scroll-20 ui-stack-16">
      <SessionMemoryPanel storageProjectId={storageProjectId} sessionId={sessionId} onCount={onCount} />
    </div>
  </SurfaceDialog>;
}
