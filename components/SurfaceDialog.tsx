import * as Dialog from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "./ui/Button";

/** One modal primitive owns focus, Escape and accessible naming for every reader. */
export function SurfaceDialog({ title, description, children, onClose, maximized = false, actions }: {
  title: string; description?: string; children: ReactNode; onClose: () => void;
  /**
   * Every dialog has the SAME size and position (UI/UX §20.6): there is no tier to
   * pick, so two floating pages can never look different. `maximized` is only for a
   * user-triggered "fill the viewport" state, never a design choice.
   */
  maximized?: boolean; actions?: ReactNode;
}) {
  const { t } = useI18n();
  const origin = useRef(document.activeElement);
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="surface-overlay" />
      <Dialog.Content className={`surface-dialog configuration-dialog${maximized ? " surface-dialog-maximized" : ""}`} data-ui-dialog
        {...(description ? {} : { "aria-describedby": undefined })}
        onCloseAutoFocus={event => { event.preventDefault(); if (origin.current instanceof HTMLElement && origin.current.isConnected) origin.current.focus(); }}>
        <header className="surface-header">
          <div className="surface-heading"><Dialog.Title asChild><h1>{title}</h1></Dialog.Title>{description && <Dialog.Description>{description}</Dialog.Description>}</div>
          {actions && <div className="surface-actions">{actions}</div>}
          <Dialog.Close asChild><Button className="surface-close" iconOnly variant="ghost" aria-label={t("chat.close")}><IconX size={20} /></Button></Dialog.Close>
        </header>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
