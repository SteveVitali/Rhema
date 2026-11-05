// Checkbox / RadioGroup / Switch — the Radix toggle wrappers (225a_R7KIT.2b; REQ-KIT-2; ADR-129;
// the settings batch 240 consumes them). Leaf-chunk primitives; every part forwards
// `ref`/`data-*`/ARIA props. Styling is `.ui-checkbox`/`.ui-radio*`/`.ui-switch*` from `uiCss()`;
// the check glyph is Lucide. No copy lives here — labels are the consumer's adjacent elements.

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";

export type CheckboxProps = ComponentPropsWithRef<typeof CheckboxPrimitive.Root>;

export function Checkbox({ className, ...rest }: CheckboxProps): ReactNode {
  const cls = ["ui-checkbox", className ?? ""].filter(Boolean).join(" ");
  return (
    <CheckboxPrimitive.Root className={cls} {...rest}>
      <CheckboxPrimitive.Indicator className="ui-checkbox-indicator">
        <Check className="ui-icon" aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export type RadioGroupProps = ComponentPropsWithRef<typeof RadioGroupPrimitive.Root>;

export function RadioGroup({ className, ...rest }: RadioGroupProps): ReactNode {
  const cls = ["ui-radio-group", className ?? ""].filter(Boolean).join(" ");
  return <RadioGroupPrimitive.Root className={cls} {...rest} />;
}

export type RadioGroupItemProps = ComponentPropsWithRef<typeof RadioGroupPrimitive.Item>;

export function RadioGroupItem({ className, ...rest }: RadioGroupItemProps): ReactNode {
  const cls = ["ui-radio-item", className ?? ""].filter(Boolean).join(" ");
  return (
    <RadioGroupPrimitive.Item className={cls} {...rest}>
      <RadioGroupPrimitive.Indicator className="ui-radio-indicator" />
    </RadioGroupPrimitive.Item>
  );
}

export type SwitchProps = ComponentPropsWithRef<typeof SwitchPrimitive.Root>;

export function Switch({ className, ...rest }: SwitchProps): ReactNode {
  const cls = ["ui-switch", className ?? ""].filter(Boolean).join(" ");
  return (
    <SwitchPrimitive.Root className={cls} {...rest}>
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
