// `primitives/` — the R7KIT.2 component kit (REQ-KIT-2; ADR-129). Shell-critical half:
// Button/IconButton, Badge, Kbd, Skeleton, the Toast queue, and the Radix wrappers Tooltip,
// DropdownMenu, Dialog + Sheet. 225a_R7KIT.2b adds the form/menu primitives: Popover, ContextMenu,
// Select, Tabs, Checkbox, RadioGroup, Switch, the cmdk Combobox + PaletteList base, and the
// in-house TextField/TextArea/RadioCards/two-variant Chip/EmptyState/Accordion. Styling: `.ui-*`
// classes from `../ui-css.js` — no inline spacing/type/colour/radius literals in this directory
// (the no-inline-literals test fails on any).

export { Pill, Chip, FetchedUrlChip, ActionLink, severityColor } from "./chips.js";
export type { Tone, Severity, ChipProps } from "./chips.js";
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
// 225a_R7KIT.2b — the form/menu primitives (leaf chunks only; the entry-graph guard denies these
// Radix packages in the SPA entry).
export { Popover, PopoverClose } from "./popover.js";
export type { PopoverProps } from "./popover.js";
export {
  ContextMenu,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "./context-menu.js";
export type {
  ContextMenuProps,
  ContextMenuItemProps,
  ContextMenuLabelProps,
  ContextMenuSeparatorProps,
} from "./context-menu.js";
export { Select } from "./select.js";
export type { SelectProps, SelectItemView } from "./select.js";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs.js";
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps } from "./tabs.js";
export { Checkbox, RadioGroup, RadioGroupItem, Switch } from "./toggles.js";
export type {
  CheckboxProps,
  RadioGroupProps,
  RadioGroupItemProps,
  SwitchProps,
} from "./toggles.js";
export { Combobox, PaletteList } from "./combobox.js";
export type {
  ComboboxProps,
  PaletteListProps,
  CommandItemView,
  CommandGroupView,
} from "./combobox.js";
export { TextField, TextArea, RadioCards } from "./fields.js";
export type {
  TextFieldProps,
  TextAreaProps,
  RadioCardsProps,
  RadioCardsOption,
} from "./fields.js";
export { EmptyState, Accordion } from "./surfaces.js";
export type { EmptyStateProps, AccordionProps, AccordionItemView } from "./surfaces.js";
