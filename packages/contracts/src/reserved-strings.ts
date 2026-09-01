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
];

/** The flat list of banned substrings with no context exception — the seed for the strict no-banned-strings lint. */
export const STRICTLY_BANNED: string[] = BANNED_STRINGS.filter((b) => !b.except).map((b) => b.text);
