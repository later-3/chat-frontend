"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "./ui/Button";

/**
 * Bottom sheet (UI/UX §20.6).
 *
 * Same family as SurfaceDialog: one scrim, one reveal, one layer token — only the
 * position differs (anchored to the bottom edge, safe-area aware). Compact action
 * sheets used to hand-roll their own backdrop, panel, z-index and header; this is
 * the single primitive for them.
 */
export function SurfaceSheet({ title, description, actions, children, onClose }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="surface-overlay" />
      <Dialog.Content className="surface-sheet configuration-dialog" data-ui-sheet
        {...(description === undefined ? { "aria-describedby": undefined } : {})}>
        <header className="surface-sheet-header">
          <div className="ui-minw">
            <Dialog.Title asChild><h2 className="surface-sheet-title">{title}</h2></Dialog.Title>
            {description !== undefined && <Dialog.Description className="surface-sheet-description">{description}</Dialog.Description>}
          </div>
          {actions}
          <Dialog.Close asChild>
            <Button iconOnly variant="ghost" type="button" aria-label={t("chat.close")}><IconX size={20} aria-hidden="true" /></Button>
          </Dialog.Close>
        </header>
        <div className="surface-sheet-body ui-scroll-20">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
