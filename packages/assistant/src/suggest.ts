// "Ask about this draft" (§7.4; REQ-CHAT-19 amended). A passage selection or ⌘J opens the composer
// with the anchor chip (`@v3 ¶…`); the assistant's suggestions arrive as P1.02 proposal cards with
// `assistant` provenance and a one-transaction Accept. A suggestion is AT MOST ONE PARAGRAPH —
// anything larger is refused with the pointer to `/lineedit @section` or `/revise` (the refusal names
// them as commands, never implies they exist in this build).

/** The block-level anchor an Ask carries (`@v3 ¶…` / `@v3 §…` / `@finding:v3/17`). */
export interface AskAnchor {
  /** the serialized ref (composer chip text, e.g. `@v3 ¶4`). */
  ref: string;
  /** the draft version the anchor targets. */
  version?: number;
  /** the paragraph/section selector inside the version. */
  block?: string;
}

/** The assistant's suggestion for an anchored span. */
export interface Suggestion {
  /** the proposed replacement text (what Accept writes in one transaction). */
  replacement: string;
  /** the anchor it lands on. */
  anchor: AskAnchor;
  /** provenance — always `assistant` (block provenance tag). */
  provenance: "assistant";
}

export type ShapedSuggestion =
  | { ok: true; proposal: Suggestion }
  | { ok: false; refusal: SuggestionRefusal };

export interface SuggestionRefusal {
  kind: "too_large";
  /** the refusal copy — names the escalation commands verbatim. */
  message: string;
  commands: readonly ["/lineedit @section", "/revise"];
}

/** True when the text is at most one paragraph (blank-line separated blocks). */
export function isSingleParagraph(text: string): boolean {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.length <= 1;
}

/**
 * Shape a proposed suggestion into a proposal card, or refuse it (§7.4: ≤1 paragraph per suggestion;
 * larger = refuse + point at `/lineedit @section` / `/revise` — named as COMMANDS, no implication the
 * assistant can do it inline).
 */
export function shapeSuggestion(args: { replacement: string; anchor: AskAnchor }): ShapedSuggestion {
  if (!isSingleParagraph(args.replacement)) {
    return {
      ok: false,
      refusal: {
        kind: "too_large",
        message:
          "That's more than a paragraph — run it as /lineedit @section or /revise instead of a chat suggestion.",
        commands: ["/lineedit @section", "/revise"],
      },
    };
  }
  return {
    ok: true,
    proposal: {
      replacement: args.replacement,
      anchor: args.anchor,
      provenance: "assistant",
    },
  };
}

/** The anchored-composer payload for a passage selection / ⌘J (the chip text + the anchor). */
export function askComposer(args: { version: number; block?: string }): {
  anchor: AskAnchor;
  chipText: string;
} {
  const ref = args.block ? `@v${args.version} ${args.block}` : `@v${args.version}`;
  return {
    anchor: { ref, version: args.version, ...(args.block ? { block: args.block } : {}) },
    chipText: ref,
  };
}
