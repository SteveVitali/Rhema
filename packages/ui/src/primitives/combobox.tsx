// Combobox + PaletteList — the cmdk wrappers (225a_R7KIT.2b; REQ-KIT-2; ADR-129 names `cmdk` for
// Combobox and palette). `Combobox` is the filter-input + list composition; `PaletteList` is the
// grouped list base the ⌘K palette surface (228) composes inside its own `Command` root.
// Styling is `.ui-command*` from `uiCss()`; every user-facing string is a prop — `inputLabel` is
// REQUIRED because the filter input needs an accessible name (REQ-UX-12; type-contracts pins it).

import { Command } from "cmdk";
import type { ComponentPropsWithRef, ReactNode } from "react";

export interface CommandItemView {
  /** The item's stable value — emitted on select and used as its filter key. */
  value: string;
  /** What the row renders (usually text — also folded into the filter keywords). */
  label: ReactNode;
  /** Extra filter keywords beyond the label text. */
  keywords?: string[];
  disabled?: boolean;
}

export interface CommandGroupView {
  /** Optional group heading (a copy-table string). */
  heading?: ReactNode;
  items: CommandItemView[];
}

/** The keywords cmdk filters on: the explicit ones plus the label text when it is a string. */
function itemKeywords(item: CommandItemView): string[] | undefined {
  const label = typeof item.label === "string" ? item.label : null;
  const merged = [...(label != null ? [label] : []), ...(item.keywords ?? [])];
  return merged.length > 0 ? merged : undefined;
}

function renderItem(item: CommandItemView, onSelect?: (value: string) => void): ReactNode {
  return (
    <Command.Item
      key={item.value}
      value={item.value}
      disabled={item.disabled}
      keywords={itemKeywords(item)}
      onSelect={(v) => onSelect?.(v)}
      className="ui-command-item"
    >
      {item.label}
    </Command.Item>
  );
}

export interface PaletteListProps extends Omit<
  ComponentPropsWithRef<typeof Command.List>,
  "children" | "onSelect"
> {
  /** Groups of items; a group without `heading` renders its items ungrouped. */
  groups: CommandGroupView[];
  /** The no-results text (from the app's copy table). */
  emptyLabel?: ReactNode;
  /** Fires with the selected item's `value`. */
  onSelect?: (value: string) => void;
}

/**
 * The palette list base — the shared `Command.List`/`Group`/`Item`/`Empty` composition.
 * Must render inside a `Command` root (the `Combobox` below mounts one; 228's palette surface
 * mounts its own so it can own the input row).
 */
export function PaletteList({
  groups,
  emptyLabel,
  onSelect,
  className,
  ...rest
}: PaletteListProps): ReactNode {
  const cls = ["ui-command-list", className ?? ""].filter(Boolean).join(" ");
  return (
    <Command.List className={cls} {...rest}>
      {emptyLabel != null ? <Command.Empty className="ui-command-empty">{emptyLabel}</Command.Empty> : null}
      {groups.map((group, i) =>
        group.heading != null ? (
          <Command.Group key={i} heading={group.heading} className="ui-command-group">
            {group.items.map((item) => renderItem(item, onSelect))}
          </Command.Group>
        ) : (
          group.items.map((item) => renderItem(item, onSelect))
        ),
      )}
    </Command.List>
  );
}

export interface ComboboxProps extends Omit<
  ComponentPropsWithRef<typeof Command>,
  "children" | "label" | "onSelect"
> {
  /** The flat item list (comboboxes are single-group; palettes use `PaletteList`). */
  items: CommandItemView[];
  /** Required — the filter input's accessible name (REQ-UX-12: a prop, never primitive copy). */
  inputLabel: string;
  inputPlaceholder?: string;
  /** The no-results text. */
  emptyLabel?: ReactNode;
  /** Fires with the selected item's `value`. */
  onSelect?: (value: string) => void;
  /** Optional controlled search text (cmdk `Command.Input` value). */
  search?: string;
  onSearchChange?: (search: string) => void;
}

/** The cmdk Combobox: a labelled filter input over a keyboard-navigable item list. */
export function Combobox({
  items,
  inputLabel,
  inputPlaceholder,
  emptyLabel,
  onSelect,
  search,
  onSearchChange,
  className,
  ...rest
}: ComboboxProps): ReactNode {
  const cls = ["ui-command", "ui-combobox", className ?? ""].filter(Boolean).join(" ");
  // `label` lands on cmdk's visually-hidden <label>, which the input's aria-labelledby resolves —
  // it is the accessible name assistive tech actually reads.
  return (
    <Command className={cls} label={inputLabel} {...rest}>
      <Command.Input
        className="ui-command-input"
        aria-label={inputLabel}
        placeholder={inputPlaceholder}
        value={search}
        onValueChange={onSearchChange}
      />
      <PaletteList groups={[{ items }]} emptyLabel={emptyLabel} onSelect={onSelect} />
    </Command>
  );
}
