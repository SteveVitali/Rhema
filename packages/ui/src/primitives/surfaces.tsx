// EmptyState + Accordion — the in-house content surfaces (225a_R7KIT.2b; REQ-KIT-2; EmptyState
// feeds 228's palette/empty legs and 234's list empty states; Accordion feeds the REQ-PUB-2 FAQ).
// Styling is `.ui-empty*`/`.ui-accordion*` from `uiCss()`; every user-facing string is a prop
// (REQ-UX-12). Both forward `ref`/`data-*`/ARIA props; the chevron glyph is Lucide.

import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { ComponentPropsWithRef, KeyboardEvent, ReactNode } from "react";

export interface EmptyStateProps extends Omit<ComponentPropsWithRef<"div">, "title"> {
  /** Optional leading icon node (a Lucide icon, rendered `aria-hidden`). */
  icon?: ReactNode;
  /** The empty-state heading. */
  title: ReactNode;
  /** Optional body line under the heading. */
  body?: ReactNode;
  /** Optional action node (a Button/ActionLink from the caller's copy). */
  action?: ReactNode;
}

/** A centered empty/zero state. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  ...rest
}: EmptyStateProps): ReactNode {
  const cls = ["ui-empty", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {icon != null ? (
        <span className="ui-empty-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="ui-empty-title">{title}</p>
      {body != null ? <p className="ui-empty-body">{body}</p> : null}
      {action != null ? <div className="ui-empty-action">{action}</div> : null}
    </div>
  );
}

export interface AccordionItemView {
  /** Stable id for the item's open state. */
  id: string;
  /** The trigger text. */
  title: ReactNode;
  /** The panel content. */
  body: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  items: AccordionItemView[];
  /** Controlled open set (item ids). */
  openIds?: readonly string[];
  defaultOpenIds?: readonly string[];
  onOpenChange?: (ids: string[]) => void;
  /** Allow several panels open at once (default true). */
  multiple?: boolean;
}

/**
 * An in-house accordion (no `@radix-ui/react-accordion` in the ADR-129 stack): buttons with
 * `aria-expanded`/`aria-controls` + `role="region"` panels, roving arrow-key focus across the
 * triggers, controlled or uncontrolled open state.
 */
export function Accordion({
  items,
  openIds,
  defaultOpenIds,
  onOpenChange,
  multiple = true,
  className,
  ...rest
}: AccordionProps): ReactNode {
  const cls = ["ui-accordion", className ?? ""].filter(Boolean).join(" ");
  const baseId = useId();
  const [internal, setInternal] = useState<readonly string[]>(defaultOpenIds ?? []);
  const open = openIds ?? internal;
  // Roving focus targets — packages/ui builds without DOM lib (React's stubs are empty), so the
  // focus call is asserted structurally at use; the browser supplies it.
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const toggle = (id: string): void => {
    const next = open.includes(id)
      ? open.filter((x) => x !== id)
      : multiple
        ? [...open, id]
        : [id];
    if (openIds == null) setInternal(next);
    onOpenChange?.(next);
  };

  // Roving focus across the trigger buttons (the APG accordion pattern), skipping disabled rows.
  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const enabledIdx = items
      .map((it, i) => (it.disabled ? -1 : i))
      .filter((i) => i >= 0);
    const pos = enabledIdx.indexOf(index);
    if (pos < 0 || enabledIdx.length === 0) return;
    const nextPos =
      e.key === "ArrowDown"
        ? (pos + 1) % enabledIdx.length
        : e.key === "ArrowUp"
          ? (pos - 1 + enabledIdx.length) % enabledIdx.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? enabledIdx.length - 1
              : null;
    if (nextPos == null) return;
    e.preventDefault();
    const el = triggerRefs.current[enabledIdx[nextPos]!] as
      | { focus(): void }
      | null
      | undefined;
    el?.focus();
  };

  return (
    <div className={cls} {...rest}>
      {items.map((item, i) => {
        const isOpen = open.includes(item.id);
        const triggerId = `${baseId}-trigger-${item.id}`;
        const panelId = `${baseId}-panel-${item.id}`;
        return (
          <div key={item.id} className="ui-accordion-item">
            <button
              type="button"
              id={triggerId}
              className="ui-accordion-trigger"
              aria-expanded={isOpen}
              aria-controls={panelId}
              disabled={item.disabled}
              ref={(el) => {
                triggerRefs.current[i] = el;
              }}
              onClick={() => toggle(item.id)}
              onKeyDown={(e) => onTriggerKeyDown(e, i)}
            >
              <span>{item.title}</span>
              <ChevronDown className="ui-icon ui-accordion-chevron" aria-hidden />
            </button>
            {isOpen ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                className="ui-accordion-panel"
              >
                {item.body}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
