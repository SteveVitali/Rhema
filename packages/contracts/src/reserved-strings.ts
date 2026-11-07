// Appendix D.2 — banned and reserved strings, checked in as data (REQ-PROD-6, REQ-BILL-18 lint bedrock).
// This is the single source of truth the i18n / contract-enum lint consumes; later UI tickets extend the
// lint, never this data's shape. Reserved strings may appear ONLY in their sanctioned class; banned strings
// must never appear in a user-facing string. Verbatim from spec Appendix D.2 (v1.0).

/** A class of reserved strings: the display tokens that may appear only in their named role. */
export interface ReservedClass {
  /** Machine key for the class. */
  id: string;
  /** Human label for lint messages. */
  label: string;
  /** The reserved display strings. */
  strings: string[];
  /** One-line rule (Appendix D.2 "Rule" column). */
  rule: string;
}

export const RESERVED_CLASSES: ReservedClass[] = [
  {
    id: "plan_names",
    label: "Plan names",
    strings: ["Free", "Writer", "Studio", "Studio Max", "Team"],
    rule: "only as plan names",
  },
  {
    id: "model_tiers",
    label: "Model tiers",
    strings: ["Base", "Balanced", "Frontier"],
    rule: "only as model tiers; model names (Sonnet, Opus, Fable, Haiku) only under Advanced and in the run report",
  },
  {
    id: "rigor_notches",
    label: "Rigor notches",
    strings: ["Quick", "Standard", "Full board"],
    rule: "only as rigor notches",
  },
  {
    id: "seats",
    label: "Seats",
    strings: ["Drafter", "Editor", "Assistant", "Persona builder", "Rhema"],
    rule: 'only as seats; "You" for the human',
  },
  {
    id: "approvals",
    label: "Approvals",
    strings: [
      "Approve plan",
      "Confirm scope",
      "Approve triage",
      "Approve outline",
      "Approve sample",
      "Approve cut list",
      "Choose a thesis",
      "Continue?",
    ],
    rule: "only as gate names",
  },
  {
    id: "autonomy",
    label: "Autonomy",
    strings: [
      "Named approvals",
      "Wait for me at each",
      "Run to completion",
      "Ask each round",
      "Ask at every Approval",
      "Run all rounds",
    ],
    rule: "only as policy/autonomy values",
  },
  {
    id: "views",
    label: "Views",
    strings: ["Write", "Read", "Focus", "Source"],
    rule: "only as View-menu values",
  },
  {
    // RES.2 (REQ-SPEC-31(3); Appendix D.2) — the run-level delivery label class. "Unverified" names a
    // RUN whose verification found zero coverage (the platform could not fetch any source); a claim's
    // verdict is `unverifiable` — never "unverified" — and copy must never conflate the two.
    id: "delivery_labels",
    label: "Delivery labels",
    strings: ["Unverified"],
    rule: "only as the run-level delivery label above the verdict (a claim verdict is `unverifiable`)",
  },
];

/** Reserved product nouns (§4.3); usable only as defined there. "backlog" is banned (the object is Obligation). */
export const RESERVED_PRODUCT_NOUNS: string[] = [
  "Project",
  "Draft vN",
  "Round",
  "Timeline",
  "Findings",
  "Dispositions",
  "Obligation",
  "Voice",
  "Unfiled",
  "Showcase project",
  "Credit",
  "Cap",
  "Top-up",
  "Plan",
  "Files",
  "Desk",
];

/**
 * Strings banned in ANY user-facing string (Appendix D.2 last row). "Advanced" is allowed only as the
 * progressive-disclosure label and "tokens" only under Advanced — those context exceptions are noted per
 * entry so the lint (later UI tickets) can special-case them; the raw list here is the banned set.
 */
export interface BannedString {
  text: string;
  /** Optional narrow exception where the string is permitted. */
  except?: string;
}

export const BANNED_STRINGS: BannedString[] = [
  { text: "gate" },
  { text: "checkpoint" },
  { text: "Pro" },
  { text: "Advanced", except: "the progressive-disclosure label only" },
  {
    text: "author",
    except: 'reserved for the human; banned as a label for an agent (also "authored")',
  },
  { text: "authored", except: "reserved for the human" },
  { text: "overage" },
  { text: "on-demand" },
  { text: "ACU" },
  { text: "tokens", except: "only under the Advanced disclosure" },
  { text: "unlimited" },
  { text: "you will be billed" },
  { text: "Claude Code" },
  { text: "writes like you" },
  { text: "--", except: "flag syntax; never in user-facing copy" },
  { text: "browser", except: "not for the Files pane" },
  { text: "wrong", except: "never in a calibration verdict" },
  { text: "backlog", except: "the object is the Obligation (v0.3)" },
  {
    // RES.2: the lowercase form is banned outright (a claim verdict is `unverifiable`, and run copy uses
    // the title-cased label). The title-cased form is reserved for the delivery-label slot itself — the
    // surfaces render `DELIVERY_LABEL_DISPLAY.unverified` there, nothing else.
    text: "unverified",
    except: 'the run-level delivery label "Unverified" only',
  },
];

/** The flat list of banned substrings with no context exception — the seed for the strict no-banned-strings lint. */
export const STRICTLY_BANNED: string[] = BANNED_STRINGS.filter((b) => !b.except).map((b) => b.text);

// ---------- REQ-COPY-6 (R7COPY.1a) — the banned internal-term list ----------
// Internal build vocabulary that must never reach user-facing copy, verbatim from the round-7 spec
// §4.13 REQ-COPY-6 (the list is verbatim — never weaken it to get green). The ONE list lives in
// `banned-internal-terms.json` beside this file — `lintInternalTerms` (vocab-lint.ts) AND the
// ESLint `no-banned-strings` rule's `bannedPatterns` option (eslint.config.js requires the same
// JSON) both consume it: two guards, one source, no build-order dependency.

import bannedInternalTermsJson from "./banned-internal-terms.json" with { type: "json" };

export interface BannedInternalTerm {
  /** Stable id — an allow entry references this. */
  id: string;
  /** The spec §4.13 term verbatim. */
  text: string;
  /** Regex source matched against a copy leaf's VALUE (never its key). */
  pattern: string;
  /** Regex flags; "" = case-sensitive (the "QUIET" bucket term is uppercase-only on purpose). */
  flags: string;
  /** The plain-language replacement the jargon pass applies. */
  replacement: string;
}

export const BANNED_INTERNAL_TERMS: readonly BannedInternalTerm[] =
  bannedInternalTermsJson as readonly BannedInternalTerm[];

/**
 * A temporary, named, dated exemption for a banned internal term in an H15-SIGNED `demo.*` /
 * `demo.tour.*` leaf (Phase-4 P4-24; `GD-TOURSIGN.R7` — the demo script is signed copy, never
 * silently edited or silently exempted). Each entry must name the leaf + term, carry a D-row key
 * (`D-<TICKET>-<n>`) that owns its removal, and name the date it was added. `validateInternalTermAllow`
 * rejects a malformed or stale entry — a seeded allow without a D-row key fails the lint suite.
 */
export interface InternalTermAllow {
  /** The copy-table leaf (must be `demo.*` — H15-signed copy only). */
  key: string;
  /** The `BANNED_INTERNAL_TERMS.id` this entry exempts. */
  termId: string;
  /** The DEFERRALS row owning removal (e.g. `D-R7COPY.1a-1`). */
  deferral: string;
  /** `date -u` day the entry was added (YYYY-MM-DD). */
  added: string;
  /** Why the leaf can't be edited here (e.g. "H15-signed tour script — 248's changed-leaf list"). */
  note: string;
}

/**
 * The live allow list. The expected case is EMPTY — a banned term in an H15-signed demo leaf is
 * routed to `D-R7COPY.1a-1` (owner 248_R7TOUR.2) instead of being edited or silently exempted.
 */
export const BANNED_INTERNAL_TERM_ALLOW: readonly InternalTermAllow[] = [];
