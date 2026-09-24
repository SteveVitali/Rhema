// The §7.2 verb table — one row per command verb, DATA-DRIVEN off the workflow registry
// (`WORKFLOW_KEYS` in @rhema/contracts, REQ-WF-1): a new workflow lands in the grammar by adding a
// declaration row, never by editing the parser. `phase: "one_x"` verbs parse (completion offers them,
// marked "1.x") but resolve disabled-with-reason.

import type { AgentTypeKey, WorkflowKey } from "@rhema/contracts";
import type { LeverKey, ScopeKind } from "./types.js";

export interface VerbSpec {
  /** the canonical verb, typed without the slash ("review"). */
  readonly verb: string;
  /** accepted spellings that normalize to `verb` ("fact-check" → factcheck). */
  readonly aliases: readonly string[];
  /** the display label ("Fact-check"). */
  readonly label: string;
  /** the workflow a sheet-launched verb creates (absent ⇒ a free navigation action). */
  readonly workflow?: WorkflowKey;
  /** the seat the run sits in (§7.2 table column). */
  readonly seat?: AgentTypeKey;
  /** "mvp" verbs launch today; "one_x" verbs parse + complete but resolve disabled-with-reason. */
  readonly phase: "mvp" | "one_x";
  /** scope kinds this verb accepts (empty ⇒ scope-free). */
  readonly scopes: readonly ScopeKind[];
  /** levers this verb accepts. */
  readonly levers: readonly LeverKey[];
  /** the §7.2 "default scope / notes" column, shown as the verb's hint in the palette. */
  readonly note?: string;
  /** when `one_x`, the reason resolve reports. */
  readonly disabledReason?: string;
}

const READER_LEVERS: readonly LeverKey[] = ["rigor", "tier", "stage", "protocol", "no-discourse", "no-second-read", "no-factcheck", "wait", "auto"];
const WRITER_LEVERS: readonly LeverKey[] = ["rigor", "tier", "stage", "protocol", "venue", "wait", "auto"];

export const VERB_TABLE: readonly VerbSpec[] = [
  {
    verb: "draft",
    aliases: ["write"],
    label: "Draft",
    workflow: "draft",
    seat: "author",
    phase: "mvp",
    scopes: ["section", "outline", "thread", "version"],
    levers: [...WRITER_LEVERS, "variants", "no-factcheck"],
    note: "the whole outline; @section:II drafts one section into a working copy",
  },
  {
    verb: "review",
    aliases: [],
    label: "Review",
    workflow: "review",
    seat: "editor",
    phase: "mvp",
    scopes: ["section", "selection", "version", "outline", "words"],
    levers: READER_LEVERS,
    note: "the latest unreviewed draft; @section restricts findings to the range",
  },
  {
    verb: "revise",
    aliases: [],
    label: "Revise",
    workflow: "revise",
    seat: "author",
    phase: "mvp",
    scopes: ["finding", "review", "section", "version"],
    levers: WRITER_LEVERS,
    note: "the latest unanswered review; @finding:… subsets (the rest defer)",
  },
  {
    verb: "factcheck",
    aliases: ["fact-check", "fc"],
    label: "Fact-check",
    workflow: "fact_check",
    seat: "editor",
    phase: "mvp",
    scopes: ["section", "selection", "version", "claim"],
    levers: ["rigor", "tier", "tiers", "wait", "auto"],
    note: "the latest draft, a @section, or the selection; --tiers 1|all",
  },
  {
    verb: "research",
    aliases: [],
    label: "Research",
    workflow: "research_burst",
    seat: "assistant",
    phase: "mvp",
    scopes: ["thread"],
    levers: ["rigor", "tier", "sources", "strata", "map"],
    note: "a research burst on the question; --map opens Map the field (1.x)",
  },
  {
    verb: "outline",
    aliases: [],
    label: "Outline",
    workflow: "outline",
    // P1.12 — the Outline RUN sits on the Assistant seat (it reads agents/assistant/* and writes the
    // outline only through the sanctioned agents/author/outline/ conduit); the artifact it produces
    // is author-owned. seatForWorkflow("outline") agrees.
    seat: "assistant",
    phase: "mvp",
    scopes: ["thread"],
    levers: ["rigor", "tier", "protocol", "venue", "target"],
    note: "promote the current thread to the project outline",
  },
  {
    verb: "visualize",
    aliases: ["figure", "fig"],
    label: "Visualize",
    workflow: "figure",
    seat: "author",
    phase: "mvp",
    scopes: ["selection", "claim", "figure", "asset"],
    levers: ["rigor", "tier"],
    note: "a figure from the selection, a @claim, an @asset, or free text",
  },
  {
    verb: "update-voice",
    aliases: ["voice", "update_voice"],
    label: "Update voice",
    workflow: "refresh_voice",
    seat: "persona_builder",
    phase: "mvp",
    scopes: [],
    levers: [],
    note: "rebuild the linked voice profile from the current draft",
  },
  {
    verb: "export",
    aliases: [],
    label: "Export",
    phase: "mvp",
    scopes: ["version", "section"],
    levers: [],
    note: "the export dialog for the draft or a version",
  },
  {
    verb: "compare",
    aliases: ["diff"],
    label: "Compare",
    phase: "mvp",
    scopes: ["version"],
    levers: [],
    note: "diff two versions: /compare @v2 @v3",
  },
  {
    verb: "cut",
    aliases: ["cut-to-length", "cut_to_length"],
    label: "Cut to length",
    workflow: "cut_to_length",
    seat: "author",
    phase: "one_x",
    scopes: ["section", "selection", "version"],
    levers: ["target", "venue", "protect", "rigor", "tier"],
    note: "--target 900 or --venue nyt-oped; --protect @section:IV",
    disabledReason: "Cut to length is a 1.x workflow — not yet available.",
  },
  {
    verb: "lineedit",
    aliases: ["line-edit", "line_edit"],
    label: "Line edit",
    workflow: "line_edit",
    seat: "author",
    phase: "one_x",
    scopes: ["section", "selection", "version"],
    levers: ["rigor", "tier"],
    disabledReason: "Line edit is a 1.x workflow — not yet available.",
  },
  {
    verb: "title",
    aliases: ["titles"],
    label: "Titles",
    workflow: "titles",
    seat: "author",
    phase: "one_x",
    scopes: ["version"],
    levers: ["variants", "rigor", "tier"],
    disabledReason: "Titles is a 1.x workflow — not yet available.",
  },
  {
    verb: "abstract",
    aliases: [],
    label: "Abstract",
    workflow: "abstract",
    seat: "author",
    phase: "one_x",
    scopes: ["version"],
    levers: ["variants", "rigor", "tier"],
    disabledReason: "Abstract is a 1.x workflow — not yet available.",
  },
  {
    verb: "reverse-outline",
    aliases: ["reverse_outline"],
    label: "Reverse outline",
    workflow: "reverse_outline",
    seat: "author",
    phase: "one_x",
    scopes: ["version"],
    levers: ["rigor", "tier"],
    disabledReason: "Reverse outline is a 1.x workflow — not yet available.",
  },
  {
    verb: "steelman",
    aliases: [],
    label: "Steelman",
    workflow: "steelman",
    seat: "editor",
    phase: "one_x",
    scopes: ["version", "outline"],
    levers: ["rigor", "tier"],
    disabledReason: "Steelman is a 1.x workflow — not yet available.",
  },
  {
    verb: "interview",
    aliases: [],
    label: "Interview me",
    workflow: "interview",
    seat: "author",
    phase: "one_x",
    scopes: ["outline", "version"],
    levers: ["rigor", "tier"],
    disabledReason: "Interview me is a 1.x workflow — not yet available.",
  },
  {
    verb: "rounds",
    aliases: ["run-rounds", "run_rounds"],
    label: "Run rounds",
    workflow: "run_rounds",
    seat: "system",
    phase: "one_x",
    scopes: ["version"],
    levers: ["until", "max", "budget"],
    note: "--until minor|rubric>=4 --max 3 --budget 6000",
    disabledReason: "Run rounds is a 1.x workflow — not yet available.",
  },
];

const BY_VERB = new Map<string, VerbSpec>();
const ALIASES = new Map<string, string>();
for (const spec of VERB_TABLE) {
  BY_VERB.set(spec.verb, spec);
  for (const a of spec.aliases) ALIASES.set(a, spec.verb);
}

/** Look a verb up by canonical name or alias (input without the leading `/`). */
export function verbSpec(raw: string): VerbSpec | undefined {
  const v = raw.trim().toLowerCase();
  const canonical = BY_VERB.has(v) ? v : ALIASES.get(v);
  return canonical ? BY_VERB.get(canonical) : undefined;
}

/** Canonical verb name for an input spelling (alias-resolved). */
export function canonicalVerb(raw: string): string | undefined {
  return verbSpec(raw)?.verb;
}

/**
 * Correct an unknown verb against the table — NEVER guessed (REQ-CHAT-21): returns candidates by
 * prefix, then by edit distance ≤2, in table order. The caller offers; it never silently substitutes.
 */
export function correctVerb(raw: string): readonly string[] {
  const v = raw.trim().toLowerCase();
  if (!v) return [];
  const prefix = VERB_TABLE.filter((s) => s.verb.startsWith(v) || s.aliases.some((a) => a.startsWith(v))).map((s) => s.verb);
  if (prefix.length > 0) return prefix;
  const near = VERB_TABLE.filter((s) => editDistance(v, s.verb) <= 2 || s.aliases.some((a) => editDistance(v, a) <= 2)).map((s) => s.verb);
  return near;
}

/** Levenshtein distance — the correction metric for unknown verbs (small tables, no perf concern). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n]!;
}
