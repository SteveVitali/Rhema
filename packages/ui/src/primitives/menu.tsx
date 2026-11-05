// DropdownMenu — the Radix wrapper (R7KIT.2; REQ-KIT-2; ADR-129). The second of the two
// primitives the shell's entry graph may carry (the REQ-KIT-5 entry-graph allowance). Styling is
// `.ui-menu*` from `uiCss()`; no copy lives here. Every part forwards `ref` + `data-*`/ARIA props.

import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithRef, ReactNode } from "react";

export interface DropdownMenuProps extends Omit<
  ComponentPropsWithRef<typeof MenuPrimitive.Content>,
  "children"
> {
  /** The trigger element — `asChild`, keeps its own props/ref. */
  trigger: ReactNode;
  /** Menu rows — compose `DropdownMenuItem`/`DropdownMenuLabel`/`DropdownMenuSeparator`. */
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}

/** Root + trigger + portalled content in one call. */
export function DropdownMenu({
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
}: DropdownMenuProps): ReactNode {
  const cls = ["ui-menu", className ?? ""].filter(Boolean).join(" ");
  return (
    <MenuPrimitive.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      modal={modal}
    >
      <MenuPrimitive.Trigger asChild>{trigger}</MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cls}
          {...rest}
        >
          {children}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export type DropdownMenuItemProps = ComponentPropsWithRef<typeof MenuPrimitive.Item>;

export function DropdownMenuItem({ className, ...rest }: DropdownMenuItemProps): ReactNode {
  const cls = ["ui-menu-item", className ?? ""].filter(Boolean).join(" ");
  return <MenuPrimitive.Item className={cls} {...rest} />;
}

export type DropdownMenuLabelProps = ComponentPropsWithRef<typeof MenuPrimitive.Label>;

export function DropdownMenuLabel({ className, ...rest }: DropdownMenuLabelProps): ReactNode {
  const cls = ["ui-menu-label", className ?? ""].filter(Boolean).join(" ");
  return <MenuPrimitive.Label className={cls} {...rest} />;
}

export type DropdownMenuSeparatorProps = ComponentPropsWithRef<typeof MenuPrimitive.Separator>;

export function DropdownMenuSeparator({
  className,
  ...rest
}: DropdownMenuSeparatorProps): ReactNode {
  const cls = ["ui-menu-separator", className ?? ""].filter(Boolean).join(" ");
  return <MenuPrimitive.Separator className={cls} {...rest} />;
}
