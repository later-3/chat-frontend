import { useEffect, useRef } from "react";
import { topDialogLayer } from "@/lib/dialog-layer";

const layers: HTMLElement[] = [];
function layerLevel(element: HTMLElement): number {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const level = Number.parseInt(getComputedStyle(node).zIndex, 10);
    if (Number.isFinite(level)) return level;
  }
  return 0;
}
function topLayer(): HTMLElement | undefined {
  // Resizing can activate a drawer beneath an existing modal. Mount order alone
  // must not let that drawer take the modal's focus or Escape handling.
  return topDialogLayer(layers, layerLevel);
}
const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])";

/** Focus ownership for legacy non-native modal surfaces; nested layers close first. */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(onClose: () => void, enabled = true) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    layers.push(root);
    const previous = document.activeElement;
    const items = () => [...root.querySelectorAll<HTMLElement>(focusableSelector)].filter(item => item.getClientRects().length > 0);
    if (topLayer() === root) (items()[0] ?? root).focus();
    const keydown = (event: KeyboardEvent) => {
      if (topLayer() !== root || event.defaultPrevented) return;
      // Native dialogs above this legacy layer own their own focus/cancel event.
      if (document.activeElement instanceof Element && document.activeElement.closest("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      } else if (event.key === "Tab") {
        const elements = items();
        const first = elements[0] ?? root;
        const last = elements.at(-1) ?? root;
        if (!root.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      const restoreFocus = topLayer() === root;
      layers.splice(layers.indexOf(root), 1);
      document.removeEventListener("keydown", keydown, true);
      if (restoreFocus && previous instanceof HTMLElement && previous.isConnected && previous.getClientRects().length) previous.focus();
    };
  }, [enabled]);
  return ref;
}
