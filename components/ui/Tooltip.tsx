import {
  Provider as RadixTooltipProvider,
  Root as RadixTooltipRoot,
  Trigger as RadixTooltipTrigger,
  Portal as RadixTooltipPortal,
  Content as RadixTooltipContent,
  type TooltipContentProps,
} from "@radix-ui/react-tooltip";
import { forwardRef, type ReactElement } from "react";

export { RadixTooltipProvider as TooltipProvider };

type HintSide = NonNullable<TooltipContentProps["side"]>;

export interface HintProps {
  /** Tooltip text; keep it identical to the trigger's aria-label when present. */
  label: ReactElement | string;
  side?: HintSide;
  /** Radix default is 700ms; icon-only toolbars read better around 350ms. */
  delay?: number;
  children: ReactElement;
}

/**
 * App-wide tooltip entry point (UI/UX §18). Wraps an interactive trigger —
 * the child must accept a ref. The trigger keeps its own aria-label; the
 * hint is a visual duplicate, never the only name.
 */
export const Hint = forwardRef<HTMLDivElement, HintProps>(function Hint(
  { label, side = "bottom", delay = 350, children },
  _ref,
) {
  return (
    <RadixTooltipRoot delayDuration={delay}>
      <RadixTooltipTrigger asChild>{children}</RadixTooltipTrigger>
      <RadixTooltipPortal>
        <RadixTooltipContent
          ref={_ref}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="ui-tooltip"
        >
          {label}
        </RadixTooltipContent>
      </RadixTooltipPortal>
    </RadixTooltipRoot>
  );
});
