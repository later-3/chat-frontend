"use client";

import { Range, Root, Thumb, Track } from "@radix-ui/react-slider";
import { useEffect, useState } from "react";
import { formatConversationMeasure } from "@/lib/conversation-measure";
import { Hint } from "./Tooltip";

export interface MeasureSliderProps {
  /** Committed value in px; `isAuto` marks the layout default (no stored override). */
  value: number;
  min: number;
  max: number;
  step: number;
  isAuto: boolean;
  /** Live value while dragging or arrowing: apply it to the layout now. */
  onLive: (value: number) => void;
  /** Released value: this is the one that gets persisted. */
  onCommit: (value: number) => void;
  /** Enter or double click: back to the layout default (auto). */
  onReset: () => void;
  /** Accessible name and Hint label, e.g. 「会话宽度」. */
  label: string;
  /** Suffix shown while auto is active, e.g. 「自适应」. */
  autoLabel: string;
}

/**
 * Conversation width control (UI/UX §20.7).
 *
 * Built on the Radix slider primitive instead of a hand-rolled track: it brings
 * live thumb tracking while dragging, click-to-seek, pointer capture, keyboard
 * steps (arrows, PageUp/PageDown, Home/End) and correct `role="slider"`
 * semantics. The value is local while the pointer moves so only this component
 * re-renders; the parent persists it on release.
 */
export function MeasureSlider({
  value, min, max, step, isAuto, onLive, onCommit, onReset, label, autoLabel,
}: MeasureSliderProps) {
  const [liveValue, setLiveValue] = useState(value);
  const [dragging, setDragging] = useState(false);

  // The parent owns the committed value: auto resets it, storage restores it.
  useEffect(() => { setLiveValue(value); }, [value]);

  const readout = `${label} · ${formatConversationMeasure(liveValue)}${isAuto ? ` · ${autoLabel}` : ""}`;

  return <Hint label={readout}>
    <div
      className={`measure-slider${isAuto ? " is-auto" : ""}${dragging ? " is-dragging" : ""}`}
      data-measure-slider="true"
      data-measure-auto={isAuto ? "true" : undefined}
      onDoubleClick={onReset}
    >
      <Root
        className="measure-slider-root"
        value={[liveValue]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={([next]) => { setLiveValue(next); onLive(next); }}
        onValueCommit={([next]) => { setDragging(false); onCommit(next); }}
        onPointerDown={() => setDragging(true)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onReset(); } }}
      >
        <Track className="measure-slider-track">
          <Range className="measure-slider-fill" />
        </Track>
        <Thumb className="measure-slider-thumb" />
      </Root>
    </div>
  </Hint>;
}
