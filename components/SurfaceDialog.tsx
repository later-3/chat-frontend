import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";

/** Read-only catalog/readers share a shell; editors retain their draft-aware close policy. */
export function SurfaceDialog({ title, description, children, onClose, wide = false, actions }: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={ref} className={`surface-dialog configuration-dialog${wide ? " surface-dialog-wide" : ""}`}
    aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="surface-header">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions}
      <button type="button" className="workspace-icon" onClick={onClose} aria-label={t("chat.close")}><IconX size={20} /></button>
    </header>
    {children}
  </dialog>;
}
