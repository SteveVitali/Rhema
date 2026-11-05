// Dialog + Sheet — the Radix Dialog wrappers (R7KIT.2; REQ-KIT-2; ADR-129). Styling is
// `.ui-dialog*`/`.ui-sheet*` from `uiCss()`; no copy lives here — `title` is a REQUIRED prop so the
// dialog always has an accessible name (Radix only warns otherwise). Sheet rides the same
// primitive with `modal={false}` as its default: no overlay, no focus trap, no scroll lock —
// outside content stays focusable (REQ-IDE-41 is kept). These wrappers are leaf-chunk primitives:
// the REQ-KIT-5 entry-graph guard keeps their code out of the shell entry bundle.

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentPropsWithRef, ReactNode } from "react";

export interface DialogProps extends Omit<
  ComponentPropsWithRef<typeof DialogPrimitive.Content>,
  "children" | "title"
> {
  /** Optional trigger element — rendered `asChild` inside `Dialog.Trigger`. */
  trigger?: ReactNode;
  /** Required — the accessible name (rendered in `.ui-dialog-title`). */
  title: ReactNode;
  /** Optional description rendered under the title (`.ui-dialog-desc`). */
  description?: ReactNode;
  children?: ReactNode;
  /** Optional footer row (`.ui-dialog-actions`). */
  actions?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** A modal dialog: overlay + focus trap + Escape/outside-dismiss, all Radix. */
export function Dialog({
  trigger,
  title,
  description,
  children,
  actions,
  className,
  open,
  defaultOpen,
  onOpenChange,
  ...rest
}: DialogProps): ReactNode {
  const cls = ["ui-dialog", className ?? ""].filter(Boolean).join(" ");
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger != null ? (
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      ) : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-dialog-overlay" />
        <DialogPrimitive.Content className={cls} {...rest}>
          <DialogPrimitive.Title className="ui-dialog-title">{title}</DialogPrimitive.Title>
          {description != null ? (
            <DialogPrimitive.Description className="ui-dialog-desc">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children}
          {actions != null ? <div className="ui-dialog-actions">{actions}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A close button (for footers/headers) — `asChild` keeps the consumer's own control. */
export function DialogClose({ children }: { children: ReactNode }): ReactNode {
  return <DialogPrimitive.Close asChild>{children}</DialogPrimitive.Close>;
}

export type SheetSide = "right" | "left";

export interface SheetProps extends Omit<
  ComponentPropsWithRef<typeof DialogPrimitive.Content>,
  "children" | "title"
> {
  trigger?: ReactNode;
  /** Required — the accessible name (rendered in `.ui-sheet-title`). */
  title: ReactNode;
  children?: ReactNode;
  /** The edge the sheet slides in from (default `right`). */
  side?: SheetSide;
  /**
   * `false` (the default) mounts a NON-MODAL sheet: no overlay, no focus trap, no scroll lock —
   * outside content stays interactive/focusable (REQ-IDE-41). `true` restores the modal posture.
   */
  modal?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Sheet({
  trigger,
  title,
  children,
  side = "right",
  modal = false,
  className,
  open,
  defaultOpen,
  onOpenChange,
  ...rest
}: SheetProps): ReactNode {
  const cls = ["ui-sheet", `ui-sheet--${side}`, className ?? ""].filter(Boolean).join(" ");
  return (
    <DialogPrimitive.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      modal={modal}
    >
      {trigger != null ? (
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      ) : null}
      <DialogPrimitive.Portal>
        {modal ? <DialogPrimitive.Overlay className="ui-dialog-overlay" /> : null}
        <DialogPrimitive.Content className={cls} {...rest}>
          <DialogPrimitive.Title className="ui-sheet-title">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
