// The selection bubble + the artifact/Timeline context-menu item models (§7.4; REQ-CHAT-21/22,
// REQ-WRITE-1) — PURE data: the island renders these verbatim. Every agent item's `command` is a
// §7.2 command string the island parses + resolves through the same @rhema/commands path as a
// typed palette command, so all surfaces produce an IDENTICAL run sheet (the byte-identical
// invariant the tests assert). No item ever carries a POST — the sheet remains the only launcher
// (REQ-CHAT-25).
//
// R7WRITE.1a (REQ-WRITE-1; UXC-22, I6) — the selection popover becomes the FORMAT BUBBLE:
//   • `comment` — the RESERVED first slot 238 fills with Comment (REQ-WRITE-2). `null` today;
//     nothing renders for it until then (no dead item).
//   • `format` — group 1: Bold/Italic/Link/H2/H3/Quote/Bulleted/Numbered, local PM commands over
//     the page schema (no cost, no navigation).
//   • `agent` — group 2: the agent verbs, each carrying an estimator-sourced cost hint and routing
//     to the run sheet through the same resolveCommand path as before.
// The "not available yet" items (Line edit, Cut to length — 1.x verbs) are REMOVED, not disabled
// (I6: shipping disabled items was the finding).

import { verbSpec } from "@rhema/commands";
import type { FormatAction } from "@rhema/editor";
import { commandForVerb } from "./palette.js";

export interface CommandMenuItem {
  readonly label: string;
  /** a §7.2 command string resolved through the grammar — cost-bearing rows route to the sheet. */
  readonly command?: string;
  /** "ask" opens the Desk's composer tab — a free local action, never a command. */
  readonly action?: "ask";
  /** a format action — a local ProseMirror command the Page's live view dispatches. */
  readonly format?: FormatAction;
  /** a hint shown right-aligned (e.g. "chat", "≈ 40 cr"); the island derives disabled reasons
   *  from resolve. */
  readonly hint?: string;
  /** render a separator row instead of a button. */
  readonly separator?: boolean;
}

const SEP: CommandMenuItem = { label: "", separator: true };

export interface SelectionMenuModel {
  /** the RESERVED leading slot — 238 fills it with Comment (REQ-WRITE-2). `null` ⇒ nothing
   *  renders there. */
  readonly comment: CommandMenuItem | null;
  /** group 1 — the format items (local PM commands; never POSTs). */
  readonly format: readonly CommandMenuItem[];
  /** group 2 — the agent verbs + Ask. */
  readonly agent: readonly CommandMenuItem[];
}

export interface SelectionMenuOpts {
  /** estimator-sourced cost hints per verb key (e.g. `{ review: "≈ 560 cr" }`) — the island
   *  supplies them from the one estimator's output; absent ⇒ the item still renders, hint-free. */
  readonly costHints?: Readonly<Record<string, string>>;
}

/**
 * The §7.4 selection bubble's item model (REQ-WRITE-1). `costHints` are the shared estimator's
 * rendered figures keyed by verb — never computed here (the grammar stays a pure item model;
 * invariant 14: every number comes from the one estimator/entitlement config).
 */
export function selectionMenuModel(opts?: SelectionMenuOpts): SelectionMenuModel {
  const hint = (verb: string): { hint?: string } =>
    opts?.costHints?.[verb] ? { hint: opts.costHints[verb] } : {};
  return {
    comment: null, // 238_R7WRITE.1b fills this slot (REQ-WRITE-2) — nothing renders until then.
    format: [
      { label: "Bold", format: "bold" },
      { label: "Italic", format: "italic" },
      { label: "Link", format: "link" },
      { label: "H2", format: "h2" },
      { label: "H3", format: "h3" },
      { label: "Quote", format: "quote" },
      { label: "Bulleted", format: "bulleted" },
      { label: "Numbered", format: "numbered" },
    ],
    agent: [
      { label: "Ask", action: "ask", hint: "chat" },
      {
        label: verbSpec("visualize")?.label ?? "Visualize",
        command: commandForVerb("visualize", "selection"),
        ...hint("visualize"),
      },
      {
        label: verbSpec("factcheck")?.label ?? "Fact-check",
        command: commandForVerb("factcheck", "selection"),
        ...hint("factcheck"),
      },
      { label: "Review this section", command: commandForVerb("review", "selection"), ...hint("review") },
    ],
  };
}

/**
 * The flat row list the island renders — comment slot (when 238 fills it) first, then the two
 * groups with a separator between them. Kept for the context-menu-shaped consumers.
 */
export function selectionMenuItems(opts?: SelectionMenuOpts): readonly CommandMenuItem[] {
  const m = selectionMenuModel(opts);
  return [...(m.comment ? [m.comment] : []), ...m.format, SEP, ...m.agent];
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
