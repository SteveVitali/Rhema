// `primitives/` — the R7KIT.2 component kit (REQ-KIT-2; ADR-129). Shell-critical half:
// Button/IconButton, Badge, Kbd, Skeleton, the Toast queue, and the Radix wrappers Tooltip,
// DropdownMenu, Dialog + Sheet. The form/menu primitives and the `rhema/no-raw-controls` rule are
// 225a_R7KIT.2b's. Styling: `.ui-*` classes from `../ui-css.js` — no inline spacing/type/colour/
// radius literals in this directory (the no-inline-literals test fails on any).

export { Pill, Chip, FetchedUrlChip, ActionLink, severityColor } from "./chips.js";
export type { Tone, Severity } from "./chips.js";
export { Button, IconButton } from "./button.js";
export type { ButtonProps, ButtonVariant, ButtonSize, IconButtonProps } from "./button.js";
export { Badge, Kbd, Skeleton } from "./status.js";
export type { BadgeProps, BadgeTone, KbdProps, SkeletonProps } from "./status.js";
export { Tooltip, TooltipProvider } from "./tooltip.js";
export type { TooltipProps } from "./tooltip.js";
export {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./menu.js";
export type {
  DropdownMenuProps,
  DropdownMenuItemProps,
  DropdownMenuLabelProps,
  DropdownMenuSeparatorProps,
} from "./menu.js";
export { Dialog, DialogClose, Sheet } from "./dialog.js";
export type { DialogProps, SheetProps, SheetSide } from "./dialog.js";
export { ToastProvider, useToast } from "./toast.js";
export type { ToastProviderProps, ToastQueue, ToastInput, ToastTone } from "./toast.js";
