import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

/** Menu contract (UI/UX §18): structural parts forward unchanged. */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

export interface DropdownMenuContentProps
  extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> {}

/**
 * Action menu surface. Portals, positions against the trigger and carries
 * the shared float styles; keyboard and outside-click behaviour come from
 * Radix, so pages must not hand-roll Escape or focus traps for menus.
 */
export const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  function DropdownMenuContent(
    { sideOffset = 6, align = "start", collisionPadding = 8, className = "", ...props },
    ref,
  ) {
    return (
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          ref={ref}
          sideOffset={sideOffset}
          align={align}
          collisionPadding={collisionPadding}
          className={`ui-menu ${className}`}
          {...props}
        />
      </DropdownMenuPrimitive.Portal>
    );
  },
);

export interface DropdownMenuItemProps
  extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {}

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(function DropdownMenuItem(
  { className = "", ...props },
  ref,
) {
  return <DropdownMenuPrimitive.Item ref={ref} className={`ui-menu-item ${className}`} {...props} />;
});

export const DropdownMenuLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function DropdownMenuLabel({ className = "", ...props }, ref) {
  return <DropdownMenuPrimitive.Label ref={ref} className={`ui-menu-label ${className}`} {...props} />;
});

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className = "", ...props }, ref) {
  return <DropdownMenuPrimitive.Separator ref={ref} className={`ui-menu-separator ${className}`} {...props} />;
});

export const DropdownMenuRadioItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(function DropdownMenuRadioItem({ className = "", children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem ref={ref} className={`ui-menu-item ${className}`} {...props}>
      {children}
      <DropdownMenuPrimitive.ItemIndicator className="ui-menu-indicator">✓</DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  );
});

export const DropdownMenuCheckboxItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className = "", children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.CheckboxItem ref={ref} className={`ui-menu-item ${className}`} {...props}>
      {children}
      <DropdownMenuPrimitive.ItemIndicator className="ui-menu-indicator">✓</DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.CheckboxItem>
  );
});
