// TextField / TextArea / RadioCards — the in-house form controls (225a_R7KIT.2b; REQ-KIT-2;
// UXC-15 — the settings/billing/voices batches migrate onto these). Styling is `.ui-field*`/
// `.ui-radio-card*` from `uiCss()`; no copy lives here. Every primitive forwards `ref`,
// `data-*` and ARIA props so the migrated surfaces keep their DOM-contract hooks.
//
// TextArea auto-grow is an enhancement over the KIT-1-styled native textarea (RV-36): it writes
// `el.style.height` imperatively from the measured `scrollHeight` — a runtime measurement, never
// a JSX `style={{…}}` literal (the no-inline-literals scan governs the latter only).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithRef, KeyboardEvent, ReactNode } from "react";

export interface TextFieldProps extends ComponentPropsWithRef<"input"> {
  /** Marks the field `aria-invalid` and takes the blocking-tone border. */
  invalid?: boolean;
}

export function TextField({ invalid, className, ...rest }: TextFieldProps): ReactNode {
  const cls = ["ui-field", invalid ? "ui-field--invalid" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <input className={cls} aria-invalid={invalid || undefined} {...rest} />;
}

export interface TextAreaProps extends ComponentPropsWithRef<"textarea"> {
  invalid?: boolean;
  /** Auto-grow to content (default true). The height is written from `scrollHeight`. */
  autoGrow?: boolean;
}

export function TextArea({
  invalid,
  autoGrow = true,
  className,
  onInput,
  ref,
  ...rest
}: TextAreaProps): ReactNode {
  const cls = ["ui-field", "ui-field--area", invalid ? "ui-field--invalid" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const grow = (): void => {
    // packages/ui builds without DOM lib (React's global.d.ts stubs are empty interfaces), so the
    // element is asserted to just the two members the runtime browser provides — truthful there.
    const el = innerRef.current as { style: { height: string }; scrollHeight: number } | null;
    if (el == null || !autoGrow) return;
    // A measured runtime write, not a style literal: collapse then size to the content.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Re-measure on mount and whenever the (controlled or uncontrolled) value changes.
  const { value, defaultValue } = rest;
  useLayoutEffect(grow, [value, defaultValue, autoGrow]);

  return (
    <textarea
      className={cls}
      aria-invalid={invalid || undefined}
      onInput={(e) => {
        grow();
        onInput?.(e);
      }}
      ref={(el) => {
        innerRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref != null) ref.current = el;
      }}
      {...rest}
    />
  );
}

export interface RadioCardsOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps extends Omit<
  ComponentPropsWithRef<"div">,
  "children" | "onChange" | "onSelect" | "aria-label"
> {
  options: RadioCardsOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  /** Form field name — renders a hidden input so a no-JS form post carries the selection. */
  name?: string;
  /** Required — the radiogroup's accessible name (REQ-UX-12; type-contracts pins it). */
  "aria-label": string;
}

/**
 * A card-style radio group (the settings option pickers): `role="radiogroup"` over
 * `role="radio"` cards with a roving tabindex and arrow-key selection per the APG radio pattern.
 */
export function RadioCards({
  options,
  value,
  onValueChange,
  name,
  className,
  "aria-label": ariaLabel,
  ...rest
}: RadioCardsProps): ReactNode {
  const cls = ["ui-radio-cards", className ?? ""].filter(Boolean).join(" ");
  const enabled = options.map((o, i) => ({ ...o, index: i })).filter((o) => !o.disabled);
  const selectedIdx = Math.max(
    0,
    enabled.findIndex((o) => o.value === value),
  );
  const [focusIdx, setFocusIdx] = useState(selectedIdx);
  // Roving tabindex tracks the checked card when `value` moves externally (APG: the checked
  // radio owns the group's tab stop).
  useEffect(() => setFocusIdx(selectedIdx), [selectedIdx]);

  const selectAt = (pos: number): void => {
    const opt = enabled[pos];
    if (opt == null) return;
    setFocusIdx(pos);
    if (opt.value !== value) onValueChange?.(opt.value);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const last = enabled.length - 1;
    const move =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : null;
    if (move != null && last >= 0) {
      e.preventDefault();
      selectAt((focusIdx + move + enabled.length) % enabled.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      selectAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      selectAt(last);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      selectAt(focusIdx);
    }
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cls} {...rest}>
      {name != null ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      {options.map((opt, i) => {
        const enabledPos = enabled.findIndex((e) => e.index === i);
        const checked = opt.value === value;
        return (
          <div
            key={opt.value}
            role="radio"
            aria-checked={checked}
            aria-disabled={opt.disabled || undefined}
            data-checked={checked || undefined}
            tabIndex={opt.disabled ? -1 : enabledPos === focusIdx ? 0 : -1}
            className="ui-radio-card"
            onClick={opt.disabled ? undefined : () => selectAt(enabledPos)}
            onKeyDown={opt.disabled ? undefined : onKeyDown}
            onFocus={opt.disabled ? undefined : () => setFocusIdx(enabledPos)}
          >
            <span className="ui-radio-card-label">{opt.label}</span>
            {opt.description != null ? (
              <span className="ui-radio-card-desc">{opt.description}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
