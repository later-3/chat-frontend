import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

/** Floating surface contract (UI/UX §18): Root/Trigger forward unchanged. */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export interface PopoverContentProps extends ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {}

/**
 * Anchored non-modal surface for inline details and small forms. Content
 * portals and shares the common float surface; per-page focus management is
 * forbidden — use the Radix contract instead.
 */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(function PopoverContent(
  { sideOffset = 6, align = "start", collisionPadding = 8, className = "", ...props },
  ref,
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={`ui-popover ${className}`}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
