// Tooltip — the Radix wrapper (R7KIT.2; REQ-KIT-2; ADR-129). One of the two primitives the shell's
// entry graph is allowed to carry (the REQ-KIT-5 entry-graph guard's allowance list). Styling is
// `.ui-tooltip*` from `uiCss()`; no copy lives here — the tooltip text is the `content` prop.
// `Tooltip`'s trigger is `asChild`: the consumer's own element keeps its ref + `data-*`/ARIA attrs
// (DOM-contract hooks survive unchanged); remaining props land on the Radix `Content`.

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentPropsWithRef, ReactNode } from "react";

/** The shared provider — mount once per shell (controls the delay + skip-delay grouping). */
export function TooltipProvider({
  delayDuration = 300,
  skipDelayDuration,
  children,
}: {
  delayDuration?: number;
  skipDelayDuration?: number;
  children?: ReactNode;
}): ReactNode {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps extends Omit<
  ComponentPropsWithRef<typeof TooltipPrimitive.Content>,
  "content"
> {
  /** The trigger element — rendered via Radix `asChild`, so its own props/ref win. */
  children: ReactNode;
  /** The tooltip text. */
  content: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Tooltip({
  children,
  content,
  side = "top",
  sideOffset = 4,
  className,
  open,
  defaultOpen,
  onOpenChange,
  ...rest
}: TooltipProps): ReactNode {
  const cls = ["ui-tooltip", className ?? ""].filter(Boolean).join(" ");
  return (
    <TooltipPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={sideOffset} className={cls} {...rest}>
          {content}
          <TooltipPrimitive.Arrow className="ui-tooltip-arrow" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
