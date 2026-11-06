// Popover — the Radix wrapper (225a_R7KIT.2b; REQ-KIT-2; ADR-129). A leaf-chunk primitive: the
// REQ-KIT-5 entry-graph guard keeps `@radix-ui/react-popover` out of the shell entry bundle.
// Styling is `.ui-popover*` from `uiCss()`; no copy lives here. The trigger is `asChild` — the
// consumer's own element keeps its ref + `data-*`/ARIA attrs; remaining props land on `Content`.

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentPropsWithRef, ReactNode } from "react";

export interface PopoverProps extends Omit<
  ComponentPropsWithRef<typeof PopoverPrimitive.Content>,
  "children"
> {
  /** The trigger element — rendered `asChild` inside `Popover.Trigger`. */
  trigger: ReactNode;
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** `true` traps focus + blocks outside interaction (default false — a floating card). */
  modal?: boolean;
}

export function Popover({
  trigger,
  children,
  side = "bottom",
  align = "start",
  sideOffset = 4,
  className,
  open,
  defaultOpen,
  onOpenChange,
  modal,
  ...rest
}: PopoverProps): ReactNode {
  const cls = ["ui-popover", className ?? ""].filter(Boolean).join(" ");
  return (
    <PopoverPrimitive.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      modal={modal}
    >
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cls}
          {...rest}
        >
          {children}
          <PopoverPrimitive.Arrow className="ui-popover-arrow" width={10} height={5} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** A close button (for footers/headers) — `asChild` keeps the consumer's own control. */
export function PopoverClose({ children }: { children: ReactNode }): ReactNode {
  return <PopoverPrimitive.Close asChild>{children}</PopoverPrimitive.Close>;
}
