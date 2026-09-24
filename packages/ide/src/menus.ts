// The selection popover + the artifact/Timeline context-menu item models (§7.4; REQ-CHAT-21/22) —
// PURE data: the island renders these verbatim. Every item's `command` is a §7.2 command string the
// island parses + resolves through the same @rhema/commands path as a typed palette command, so all
// four surfaces produce an IDENTICAL run sheet (the byte-identical invariant the tests assert). No
// item ever carries a POST — the sheet remains the only launcher (REQ-CHAT-25).

import { verbSpec } from "@rhema/commands";
import { commandForVerb } from "./palette.js";

export interface CommandMenuItem {
  readonly label: string;
  /** a §7.2 command string resolved through the grammar — cost-bearing rows route to the sheet. */
  readonly command?: string;
  /** "ask" opens the Desk's composer tab — a free local action, never a command. */
  readonly action?: "ask";
  /** a hint shown right-aligned (e.g. "chat"); the island derives disabled reasons from resolve. */
  readonly hint?: string;
  /** render a separator row instead of a button. */
  readonly separator?: boolean;
}

const SEP: CommandMenuItem = { label: "", separator: true };

/**
 * The §7.4 selection popover — shown on a non-collapsed selection inside the Page:
 * Ask (→ the composer tab) · Visualize · Fact-check · Review this section; Line edit + Cut to
 * length are 1.x — their commands resolve disabled-with-reason through the grammar, never hidden.
 */
export function selectionMenuItems(): readonly CommandMenuItem[] {
  return [
    { label: "Ask", action: "ask", hint: "chat" },
    { label: verbSpec("visualize")?.label ?? "Visualize", command: commandForVerb("visualize", "selection") },
    { label: verbSpec("factcheck")?.label ?? "Fact-check", command: commandForVerb("factcheck", "selection") },
    { label: "Review this section", command: commandForVerb("review", "selection") },
    SEP,
    { label: verbSpec("lineedit")?.label ?? "Line edit", command: commandForVerb("lineedit", "selection") },
    { label: verbSpec("cut")?.label ?? "Cut to length", command: commandForVerb("cut", "selection") },
  ];
}

/**
 * The artifact/Timeline context menu — verbs scoped to the right-clicked round's subject version
 * (`@vN`); called without a version (e.g. the ungrouped tail) the bare verbs apply to the current
 * head. Labels read "Review v3 again" / "Review the draft again".
 */
export function contextMenuItems(scopeVersion?: number): readonly CommandMenuItem[] {
  const scope = scopeVersion != null ? `v${scopeVersion}` : undefined;
  const on = scope ?? "the draft";
  return [
    { label: `Review ${on} again`, command: commandForVerb("review", scope) },
    { label: `Fact-check ${on}`, command: commandForVerb("factcheck", scope) },
    { label: `Revise ${on}`, command: commandForVerb("revise", scope) },
    SEP,
    { label: `Export ${on}`, command: commandForVerb("export", scope) },
  ];
}
