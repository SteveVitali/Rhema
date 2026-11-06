// Type-level contracts for the kit (R7KIT.2; REQ-KIT-2) — compiled by `tsc -b`/`typecheck`, no
// runtime API. Each `// @ts-expect-error` leg MUST keep erroring: if the prop it pins ever becomes
// optional, tsc reports an unused directive and `pnpm --filter @rhema/ui typecheck` fails — that IS
// the "an IconButton without `aria-label` fails typecheck" AC leg.

import type { IconButtonProps, ButtonProps } from "./button.js";
import type { DialogProps, SheetProps } from "./dialog.js";
import type { ToastProviderProps } from "./toast.js";

// @ts-expect-error — IconButton without `aria-label` must not typecheck (icon-only ⇒ name required).
export const iconButtonMissingLabel: IconButtonProps = { children: null };

export const iconButtonWithLabel: IconButtonProps = {
  "aria-label": "Close panel",
  children: null,
};

// @ts-expect-error — Dialog without a `title` must not typecheck (the accessible name is required).
export const dialogMissingTitle: DialogProps = {};

// @ts-expect-error — Sheet without a `title` must not typecheck.
export const sheetMissingTitle: SheetProps = {};

// @ts-expect-error — ToastProvider without `dismissLabel` must not typecheck (REQ-UX-12: even the
// dismiss button's accessible name comes from the app's copy table, never a primitive default).
export const toastProviderMissingDismissLabel: ToastProviderProps = {};

export const okButtonProps: ButtonProps = { variant: "primary", children: null };
