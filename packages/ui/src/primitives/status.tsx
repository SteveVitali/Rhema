// Badge / Kbd / Skeleton — the small in-house status primitives (R7KIT.2; REQ-KIT-2). Styling is
// the `.ui-*` classes from `uiCss()`; no user-facing text lives here (REQ-UX-12). Every primitive
// forwards `ref`, `data-*` and ARIA props so DOM-contract hooks survive the KIT-3 migrations.

import type { ComponentPropsWithRef, CSSProperties, ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "ok" | "attention" | "danger";

export interface BadgeProps extends ComponentPropsWithRef<"span"> {
  tone?: BadgeTone;
}

/** A small status badge (state/severity tag). */
export function Badge({ tone = "neutral", className, ...rest }: BadgeProps): ReactNode {
  const cls = ["ui-badge", `ui-badge--${tone}`, className ?? ""].filter(Boolean).join(" ");
  return <span className={cls} {...rest} />;
}

export type KbdProps = ComponentPropsWithRef<"kbd">;

/** A keyboard-shortcut key cap (`⌘K`, `?`). */
export function Kbd({ className, ...rest }: KbdProps): ReactNode {
  const cls = ["ui-kbd", className ?? ""].filter(Boolean).join(" ");
  return <kbd className={cls} {...rest} />;
}

export interface SkeletonProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** Rendered width — a CSS length emitted as the `--ui-skeleton-w` custom property. */
  width?: string;
  /** Rendered height — a CSS length emitted as `--ui-skeleton-h` (default: `1em` of the context). */
  height?: string;
}

/** A loading placeholder block; `aria-hidden` — it carries no content. */
export function Skeleton({ width, height, className, style, ...rest }: SkeletonProps): ReactNode {
  const cls = ["ui-skeleton", className ?? ""].filter(Boolean).join(" ");
  const vars = {
    ...(width != null ? { "--ui-skeleton-w": width } : {}),
    ...(height != null ? { "--ui-skeleton-h": height } : {}),
    ...style,
  } as CSSProperties;
  return <span aria-hidden="true" className={cls} style={vars} {...rest} />;
}
