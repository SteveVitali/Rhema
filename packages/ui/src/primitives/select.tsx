// Select — the Radix wrapper (225a_R7KIT.2b; REQ-KIT-2; ADR-129). A leaf-chunk primitive: the
// REQ-KIT-5 entry-graph guard keeps `@radix-ui/react-select` out of the shell entry bundle.
// Items arrive as DATA (`SelectItemView[]`) — migrated forms hand over their option lists — while
// `ref`/`data-*`/ARIA props land on the trigger (the DOM-contract hook surface). Styling is
// `.ui-select*` from `uiCss()`; the chevron/check glyphs are Lucide (`.ui-icon` sizes them).
// The no-JS/SSR fallback stays the KIT-1-styled native <select> (RV-36) — this wrapper is the
// enhancement, never the replacement.

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";

export interface SelectItemView {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  ComponentPropsWithRef<typeof SelectPrimitive.Trigger>,
  "children"
> {
  /** The option list. */
  items: SelectItemView[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Trigger text before a selection exists. */
  placeholder?: string;
  /** Form field name (Radix wires the hidden input for form posts). */
  name?: string;
  disabled?: boolean;
  required?: boolean;
}

export function Select({
  items,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  name,
  disabled,
  required,
  className,
  ...rest
}: SelectProps): ReactNode {
  const cls = ["ui-select-trigger", className ?? ""].filter(Boolean).join(" ");
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
      disabled={disabled}
      required={required}
    >
      <SelectPrimitive.Trigger className={cls} disabled={disabled} {...rest}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="ui-select-icon">
          <ChevronDown className="ui-icon" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="ui-select-content"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport>
            {items.map((item) => (
              <SelectPrimitive.Item
                key={item.value}
                value={item.value}
                disabled={item.disabled}
                className="ui-select-item"
              >
                <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ui-select-item-indicator">
                  <Check className="ui-icon" aria-hidden />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
