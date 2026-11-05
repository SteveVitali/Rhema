// Button / IconButton — the kit's in-house actions (R7KIT.2; REQ-KIT-2; UXC-15). Styling is the
// `.ui-btn*` classes emitted by `uiCss()`; no inline literals. Every user-facing string is a prop —
// these components own no copy (REQ-UX-12). `IconButton` makes `aria-label` a REQUIRED prop: an
// icon-only action without an accessible name does not typecheck (type-contracts.ts pins it).

import type { ComponentPropsWithRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** The button primitive. Forwards `ref` and every `data-*`/ARIA prop untouched. */
export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps): ReactNode {
  const cls = ["ui-btn", `ui-btn--${variant}`, size === "sm" ? "ui-btn--sm" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={cls} {...rest} />;
}

export interface IconButtonProps extends Omit<ButtonProps, "aria-label"> {
  /** Required — an icon-only button must name its action for assistive tech. */
  "aria-label": string;
}

/** A square icon-only button; `aria-label` is mandatory. */
export function IconButton({
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...rest
}: IconButtonProps): ReactNode {
  const cls = [
    "ui-btn",
    "ui-btn--icon",
    `ui-btn--${variant}`,
    size === "sm" ? "ui-btn--sm" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={cls} {...rest} />;
}
