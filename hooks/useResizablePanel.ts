"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import { clampPanelWidth } from "@/lib/panel-layout";

interface DragState {
  pointerId: number;
  startX: number;
  startWidth: number;
  /** Auto state before the drag, so Escape can put it back. */
  wasAuto: boolean;
  target: HTMLDivElement;
  previousCursor: string;
  previousUserSelect: string;
}

interface UseResizablePanelOptions {
  ariaLabel: string;
  /**
   * Optional: lets the preference also be "auto" (UI/UX §20.7 会话宽度).
   * The sentinel is what storage keeps for auto; the CSS variable is then
   * removed instead of set, and resetWidth() returns to auto.
   */
  autoSentinel?: string;
  cssVariable: `--${string}`;
  defaultWidth: number;
  getDefaultWidth?: () => number;
  getMaxWidth: () => number;
  getResizeMaxWidth?: () => number;
  growthDirection: "left" | "right";
  maxWidth: number;
  minWidth: number;
  storageKey: string;
  widthRef: MutableRefObject<number>;
}

interface CommitOptions {
  forcePersist?: boolean;
  persist?: boolean;
}

function readStoredValue(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function readStoredWidth(storageKey: string): number | null {
  const stored = readStoredValue(storageKey);
  if (stored === null) return null;
  const parsed = Number.parseInt(stored, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function writeStoredWidth(storageKey: string, width: number | string): void {
  try {
    window.localStorage.setItem(storageKey, String(width));
  } catch {
    // Resizing remains available when storage is unavailable.
  }
}

export function useResizablePanel(options: UseResizablePanelOptions) {
  const {
    ariaLabel,
    autoSentinel,
    cssVariable,
    defaultWidth,
    getDefaultWidth,
    getMaxWidth,
    getResizeMaxWidth,
    growthDirection,
    maxWidth,
    minWidth,
    storageKey,
    widthRef,
  } = options;
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const restoredRef = useRef(false);
  const preferredWidthRef = useRef(defaultWidth);
  const autoRef = useRef(false);
  const [width, setWidth] = useState(defaultWidth);
  const [isAuto, setIsAuto] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const effectiveMaxWidth = useCallback(
    () => Math.min(maxWidth, Math.max(minWidth, getMaxWidth())),
    [getMaxWidth, maxWidth, minWidth],
  );

  const clampWidth = useCallback(
    (candidate: number) => clampPanelWidth(candidate, minWidth, effectiveMaxWidth()),
    [effectiveMaxWidth, minWidth],
  );

  const clampDragWidth = useCallback((candidate: number) => clampPanelWidth(
    candidate, minWidth, Math.min(maxWidth, getResizeMaxWidth?.() ?? effectiveMaxWidth()),
  ), [effectiveMaxWidth, getResizeMaxWidth, minWidth, maxWidth]);

  const applyLiveWidth = useCallback((nextWidth: number) => {
    widthRef.current = nextWidth;
    const panel = panelRef.current;
    if (!panel) return;
    // Auto keeps no pixel override, so the column falls back to --measure-prose.
    if (autoRef.current) panel.style.removeProperty(cssVariable);
    else panel.style.setProperty(cssVariable, `${nextWidth}px`);
  }, [cssVariable, widthRef]);

  const commitWidth = useCallback((candidate: number, commitOptions: CommitOptions = {}) => {
    const { forcePersist = false, persist = true } = commitOptions;
    if (persist) {
      preferredWidthRef.current = clampPanelWidth(candidate, minWidth, maxWidth);
      autoRef.current = false;
      setIsAuto(false);
    }
    const nextWidth = clampWidth(candidate);
    const changed = nextWidth !== widthRef.current;
    applyLiveWidth(nextWidth);
    setWidth(nextWidth);
    if (persist && (changed || forcePersist)) writeStoredWidth(storageKey, preferredWidthRef.current);
    return nextWidth;
  }, [applyLiveWidth, clampWidth, storageKey, widthRef, minWidth, maxWidth]);

  const restoreBodyState = useCallback((drag: DragState) => {
    document.body.style.cursor = drag.previousCursor;
    document.body.style.userSelect = drag.previousUserSelect;
  }, []);

  const releaseDrag = useCallback((pointerId: number): DragState | null => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId) return null;
    dragRef.current = null;
    restoreBodyState(drag);
    setIsResizing(false);

    try {
      if (drag.target.hasPointerCapture(pointerId)) {
        drag.target.releasePointerCapture(pointerId);
      }
    } catch {
      // The browser may have already released capture after pointer cancellation.
    }
    return drag;
  }, [restoreBodyState]);

  const finishResize = useCallback((pointerId: number) => {
    const drag = releaseDrag(pointerId);
    if (!drag) return;
    commitWidth(widthRef.current, { forcePersist: true });
  }, [commitWidth, releaseDrag, widthRef]);

  /** Escape during a drag gives up on the change and restores the previous value. */
  const cancelResize = useCallback((pointerId: number) => {
    const drag = releaseDrag(pointerId);
    if (!drag) return;
    autoRef.current = drag.wasAuto;
    setIsAuto(drag.wasAuto);
    applyLiveWidth(drag.startWidth);
    setWidth(drag.startWidth);
  }, [applyLiveWidth, releaseDrag]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const activeDrag = dragRef.current;
    if (activeDrag) finishResize(activeDrag.pointerId);
    // Dragging is a manual choice; the value it lands on gets persisted.
    const wasAuto = autoRef.current;
    autoRef.current = false;
    setIsAuto(false);

    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: widthRef.current,
      wasAuto,
      target,
      previousCursor: document.body.style.cursor,
      previousUserSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setIsResizing(true);
  }, [finishResize, widthRef]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      finishResize(event.pointerId);
      return;
    }
    event.preventDefault();

    const direction = growthDirection === "right" ? 1 : -1;
    const nextWidth = clampDragWidth(drag.startWidth + ((event.clientX - drag.startX) * direction));
    applyLiveWidth(nextWidth);
    event.currentTarget.setAttribute("aria-valuenow", String(nextWidth));
    event.currentTarget.setAttribute("aria-valuetext", `${nextWidth} px`);
  }, [applyLiveWidth, clampDragWidth, finishResize, growthDirection]);

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    finishResize(event.pointerId);
  }, [finishResize]);

  const onPointerCancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    finishResize(event.pointerId);
  }, [finishResize]);

  const onLostPointerCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    finishResize(event.pointerId);
  }, [finishResize]);

  const resetWidth = useCallback(() => {
    const nextDefault = getDefaultWidth?.() ?? defaultWidth;
    if (autoSentinel !== undefined) {
      autoRef.current = true;
      setIsAuto(true);
      preferredWidthRef.current = clampPanelWidth(nextDefault, minWidth, maxWidth);
      writeStoredWidth(storageKey, autoSentinel);
      commitWidth(nextDefault, { persist: false });
      return;
    }
    commitWidth(nextDefault, { forcePersist: true });
  }, [autoSentinel, commitWidth, defaultWidth, getDefaultWidth, minWidth, maxWidth, storageKey]);

  const reclampWidth = useCallback(() => {
    commitWidth(preferredWidthRef.current, { persist: false });
  }, [commitWidth, widthRef]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 12;
    const growKey = growthDirection === "right" ? "ArrowRight" : "ArrowLeft";
    const shrinkKey = growthDirection === "right" ? "ArrowLeft" : "ArrowRight";

    if (event.key === "Escape") {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      cancelResize(drag.pointerId);
    } else if (event.key === growKey) {
      event.preventDefault();
      commitWidth(clampDragWidth(widthRef.current + step), { forcePersist: true });
    } else if (event.key === shrinkKey) {
      event.preventDefault();
      commitWidth(clampDragWidth(widthRef.current - step), { forcePersist: true });
    } else if (event.key === "Home") {
      event.preventDefault();
      commitWidth(minWidth, { forcePersist: true });
    } else if (event.key === "End") {
      event.preventDefault();
      commitWidth(clampDragWidth(maxWidth), { forcePersist: true });
    } else if (event.key === "Enter") {
      event.preventDefault();
      resetWidth();
    }
  }, [cancelResize, commitWidth, clampDragWidth, effectiveMaxWidth, growthDirection, minWidth, maxWidth, resetWidth, widthRef]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    if (autoSentinel !== undefined && readStoredValue(storageKey) === autoSentinel) {
      autoRef.current = true;
      setIsAuto(true);
      preferredWidthRef.current = clampPanelWidth(getDefaultWidth?.() ?? defaultWidth, minWidth, maxWidth);
      commitWidth(preferredWidthRef.current, { persist: false });
      return;
    }

    const storedWidth = readStoredWidth(storageKey);
    const candidate = storedWidth ?? getDefaultWidth?.() ?? defaultWidth;
    preferredWidthRef.current = clampPanelWidth(candidate, minWidth, maxWidth);
    commitWidth(preferredWidthRef.current, { persist: false });
  }, [autoSentinel, commitWidth, defaultWidth, getDefaultWidth, maxWidth, minWidth, storageKey]);

  useEffect(() => {
    if (!restoredRef.current) return;
    commitWidth(preferredWidthRef.current, { persist: false });

    const onResize = () => {
      commitWidth(preferredWidthRef.current, { persist: false });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [commitWidth, widthRef]);

  useEffect(() => {
    if (!isResizing) return;
    const cancelResize = () => {
      const drag = dragRef.current;
      if (drag) finishResize(drag.pointerId);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") cancelResize();
    };
    window.addEventListener("blur", cancelResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", cancelResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [finishResize, isResizing]);

  useEffect(() => {
    return () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      restoreBodyState(drag);
    };
  }, [restoreBodyState]);

  return {
    isAuto,
    isResizing,
    panelRef,
    reclampWidth,
    resetWidth,
    separatorProps: {
      "aria-label": ariaLabel,
      "aria-orientation": "vertical" as const,
      "aria-valuemax": mounted ? effectiveMaxWidth() : maxWidth,
      "aria-valuemin": minWidth,
      "aria-valuenow": width,
      "aria-valuetext": `${width} px`,
      onDoubleClick: resetWidth,
      onKeyDown,
      onLostPointerCapture,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      role: "separator" as const,
      tabIndex: 0,
    },
    width,
  };
}
