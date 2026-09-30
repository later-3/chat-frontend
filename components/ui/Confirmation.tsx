import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "./Button";
import styles from "./ui.module.css";

const Context = createContext<((message: string, action?: string) => Promise<boolean>) | null>(null);
/** A single confirmation owner; a second request never overwrites a pending decision. */
export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [action, setAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef<((result: boolean) => void) | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const confirm = useCallback((text: string, actionLabel?: string) => {
    if (pending.current) return Promise.resolve(false);
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAction(actionLabel ?? null);
    setMessage(text);
    return new Promise<boolean>(resolve => { pending.current = resolve; });
  }, []);
  const settle = (result: boolean) => { const resolve = pending.current; pending.current = null; setMessage(null); resolve?.(result); };
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  // The shared confirmation owns Escape. Radix hands the keydown to the top DismissableLayer,
  // but a stale lower layer can consume it first and then no-op against this pending decision,
  // leaving Escape dead (seen as a hang in switch-browser tests under load). One tick after any
  // Escape, a still-pending confirmation is dismissed; the normal Radix path has already settled
  // synchronously, so this only backstops the mis-routed case and never touches other modals.
  useEffect(() => {
    if (message === null) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      queueMicrotask(() => { if (pending.current) settle(false); });
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [message]);
  return <Context.Provider value={confirm}>{children}
    <AlertDialog.Root open={message !== null} onOpenChange={open => { if (!open) settle(false); }}>
      <AlertDialog.Portal><AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content className={styles.confirmation} data-ui-dialog
          onCloseAutoFocus={event => { event.preventDefault(); if (origin.current?.isConnected) origin.current.focus(); }}>
          <AlertDialog.Title>{t("interface.confirmAction")}</AlertDialog.Title>
          <AlertDialog.Description>{message}</AlertDialog.Description>
          <div className={styles.actions}>
            <AlertDialog.Cancel asChild><Button onClick={() => settle(false)}>{t("common.cancel")}</Button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><Button variant="primary" onClick={() => settle(true)}>{action ?? t("common.confirm")}</Button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </Context.Provider>;
}
export function useConfirmation() {
  const confirm = useContext(Context);
  if (!confirm) throw new Error("ConfirmationProvider is missing");
  return confirm;
}
