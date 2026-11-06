// ContextMenu — the Radix wrapper (225a_R7KIT.2b; REQ-KIT-2; ADR-129). A leaf-chunk primitive:
// the REQ-KIT-5 entry-graph guard keeps `@radix-ui/react-context-menu` out of the shell entry.
// Styling reuses the `.ui-menu*` family from `uiCss()` — a context menu IS a dropdown menu with a
// right-click trigger, so it shares the surface tokens. The trigger wraps the right-click AREA
// (`asChild` — the consumer's own element keeps its props/ref); keyboard operation is the Menu
// key / Shift+F10 then arrows. No copy lives here.

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import type { ComponentPropsWithRef, ReactNode } from "react";

export interface ContextMenuProps extends Omit<
  ComponentPropsWithRef<typeof ContextMenuPrimitive.Content>,
  "children"
> {
  /** The right-click target area — rendered `asChild` inside `ContextMenu.Trigger`. */
  trigger: ReactNode;
  /** Menu rows — compose `ContextMenuItem`/`ContextMenuLabel`/`ContextMenuSeparator`. */
  children?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}

export function ContextMenu({
  trigger,
  children,
  className,
  onOpenChange,
  modal,
  ...rest
}: ContextMenuProps): ReactNode {
  const cls = ["ui-menu", className ?? ""].filter(Boolean).join(" ");
  return (
    <ContextMenuPrimitive.Root onOpenChange={onOpenChange} modal={modal}>
      <ContextMenuPrimitive.Trigger asChild>{trigger}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className={cls} {...rest}>
          {children}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

export type ContextMenuItemProps = ComponentPropsWithRef<typeof ContextMenuPrimitive.Item>;

export function ContextMenuItem({ className, ...rest }: ContextMenuItemProps): ReactNode {
  const cls = ["ui-menu-item", className ?? ""].filter(Boolean).join(" ");
  return <ContextMenuPrimitive.Item className={cls} {...rest} />;
}

export type ContextMenuLabelProps = ComponentPropsWithRef<typeof ContextMenuPrimitive.Label>;

export function ContextMenuLabel({ className, ...rest }: ContextMenuLabelProps): ReactNode {
  const cls = ["ui-menu-label", className ?? ""].filter(Boolean).join(" ");
  return <ContextMenuPrimitive.Label className={cls} {...rest} />;
}

export type ContextMenuSeparatorProps = ComponentPropsWithRef<
  typeof ContextMenuPrimitive.Separator
>;

export function ContextMenuSeparator({
  className,
  ...rest
}: ContextMenuSeparatorProps): ReactNode {
  const cls = ["ui-menu-separator", className ?? ""].filter(Boolean).join(" ");
  return <ContextMenuPrimitive.Separator className={cls} {...rest} />;
}
