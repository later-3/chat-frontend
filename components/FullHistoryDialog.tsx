"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";

export function FullHistoryDialog({
  projectId,
  sessionId,
  onClose,
}: {
  projectId: string;
  sessionId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  const closeDialog = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="full-history-dialog"
      aria-label={t("history.label")}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div className="full-history-toolbar">
        <strong>{t("history.label")}</strong>
        <button
          ref={closeButtonRef}
          type="button"
          className="full-history-close"
          onClick={closeDialog}
          aria-label={t("chat.close")}
          title={t("chat.close")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="full-history-content">
        {loading && <div className="full-history-loading">{t("history.loading")}</div>}
        <iframe
          className="full-history-frame"
          src={`/api/sessions/${encodeURIComponent(sessionId)}/export?inline=1&projectId=${encodeURIComponent(projectId)}`}
          title={t("history.label")}
          sandbox="allow-downloads allow-scripts"
          onLoad={() => setLoading(false)}
        />
      </div>
    </dialog>
  );
}
