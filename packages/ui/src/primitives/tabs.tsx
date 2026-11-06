// Tabs — the Radix wrapper (225a_R7KIT.2b; REQ-KIT-2; ADR-129; 229 composes it for the pane
// switcher). A leaf-chunk primitive. Composition matches Radix: `Tabs` root + `TabsList` +
// `TabsTrigger` + `TabsContent`; every part forwards `ref`/`data-*`/ARIA. Styling is `.ui-tabs*`
// from `uiCss()`; no copy lives here.

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithRef, ReactNode } from "react";

export type TabsProps = ComponentPropsWithRef<typeof TabsPrimitive.Root>;

export function Tabs({ className, ...rest }: TabsProps): ReactNode {
  const cls = ["ui-tabs", className ?? ""].filter(Boolean).join(" ");
  return <TabsPrimitive.Root className={cls} {...rest} />;
}

export type TabsListProps = ComponentPropsWithRef<typeof TabsPrimitive.List>;

export function TabsList({ className, ...rest }: TabsListProps): ReactNode {
  const cls = ["ui-tabs-list", className ?? ""].filter(Boolean).join(" ");
  return <TabsPrimitive.List className={cls} {...rest} />;
}

export type TabsTriggerProps = ComponentPropsWithRef<typeof TabsPrimitive.Trigger>;

export function TabsTrigger({ className, ...rest }: TabsTriggerProps): ReactNode {
  const cls = ["ui-tabs-trigger", className ?? ""].filter(Boolean).join(" ");
  return <TabsPrimitive.Trigger className={cls} {...rest} />;
}

export type TabsContentProps = ComponentPropsWithRef<typeof TabsPrimitive.Content>;

export function TabsContent({ className, ...rest }: TabsContentProps): ReactNode {
  const cls = ["ui-tabs-content", className ?? ""].filter(Boolean).join(" ");
  return <TabsPrimitive.Content className={cls} {...rest} />;
}
