"use client";

import type { HTMLAttributes } from "react";
import { Hint } from "./Tooltip";

export interface MeasureSliderProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Current value in px. */
  value: number;
  min: number;
  max: number;
  /** Auto follows the layout default; the thumb sits at the default and nothing is overridden. */
  isAuto: boolean;
  dragging?: boolean;
  /** Accessible name and Hint label, e.g. 「会话宽度」. */
  label: string;
  /** Value text, e.g. `48rem`. */
  valueLabel: string;
  /** Suffix used while auto is active, e.g. 「自适应」. */
  autoLabel: string;
}

/**
 * The conversation width control (UI/UX §20.7): a scrollbar-like track in the
 * conversation top bar. Drag right to widen, left to narrow; the drag mechanics
 * (pointer capture, keyboard steps, Home/End, Enter to reset) come from
 * `useResizablePanel` through the spread separator props, so this component only
 * draws the track and reports the current value.
 */
export function MeasureSlider({
  value, min, max, isAuto, dragging = false, label, valueLabel, autoLabel, ...separatorProps
}: MeasureSliderProps) {
  const range = max - min;
  const ratio = range > 0 ? Math.min(1, Math.max(0, (value - min) / range)) : 0;
  const percent = `${(ratio * 100).toFixed(2)}%`;
  const readout = `${label} · ${valueLabel}${isAuto ? ` · ${autoLabel}` : ""}`;

  return <Hint label={readout}>
    <div
      {...separatorProps}
      className={`measure-slider${isAuto ? " is-auto" : ""}${dragging ? " is-dragging" : ""}`}
      data-measure-slider="true"
      data-measure-auto={isAuto ? "true" : undefined}
      aria-label={readout}
      aria-valuetext={valueLabel}
    >
      <span className="measure-slider-track" aria-hidden="true">
        <span className="measure-slider-fill" style={{ width: percent }} />
        <span className="measure-slider-thumb" style={{ left: percent }} />
      </span>
    </div>
  </Hint>;
}
