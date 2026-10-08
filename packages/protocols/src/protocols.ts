import { z } from "zod";
import {
  RUBRIC_DIMENSIONS,
  WORKFLOW_KEYS,
  type RubricDimension,
  type WorkflowKey,
} from "@rhema/contracts";
import { ALLOWED_INPUT_SOURCES, type ProtocolInputSource } from "./input-sources.js";

// Genres as protocol objects (§6.7): a genre is a versioned Protocol — configuration over the seven
// Review phases and the Draft/Revise inputs, NEVER a skill fork (REQ-GENRE-1). P0.03 seeded Essay;
// P1.21 lands Academic / Op-ed / Memo as seeds of the same shape. The default rule (protocol + venue at
// project creation) is REQ-GENRE-4 (data half here). Protocol config is private (SS §8.4): it lives in
// this package and the DB `protocols` table, never a client bundle/OpenAPI/event.

// -----------------------------------------------------------------------------------------------------------
// REQ-SAFE-2 (SPA.8) — protocol-IP sentinels. Exported string CONSTANTS, never comments: minifiers strip
// comments but keep string literals, so a constant is the only marker that survives into a bundle (the
// design/28 F2 "belt" layer — the provenance scan over .map sources[] is the proof). They are planted
// adjacent to the protected rubric/calibration bodies so a leaked protocol text carries its marker, and
// they are load-bearing both directions through `check:protocol-markers`: the gate FAILS if any marker
// is absent from this package's sources (an unarmed tripwire) and FAILS if any appears in a public
// artifact (a leak). Do not delete, rename, or "clean up" — absence is a CI failure by construction.
// -----------------------------------------------------------------------------------------------------------

/** Marker for the protocol body as a whole (config, seeds, phase wiring). */
export const SENTINEL_PROTOCOL_BODY = "RHEMA-PROTOCOL-SECRET";
/** Marker for the rubric dimension/cap blocks (`rubric.dimensions` / `caps` below). */
export const SENTINEL_RUBRIC_BLOCK = "BEGIN-RHEMA-RUBRIC";
/** Marker for the `calibration_language` blocks (verdict vocab + reviewer voice). */
export const SENTINEL_CALIBRATION_BLOCK = "BEGIN-RHEMA-CALIBRATION";

export interface ProtocolVariant {
  id: string;
  name: string;
  default?: boolean;
}
export interface CapRule {
  dimension: RubricDimension;
  /** the score ceiling this cap imposes when `when` holds. */
  at: 1 | 2 | 3 | 4;
  when: string;
}
export interface VenueRow {
  venue: string;
  minWords?: number;
  maxWords?: number;
  /** a venue may bound the abstract separately (§6.7: "PLOS ONE abstract ≤300"). */
  abstractMaxWords?: number;
  /**
   * REQ-GENRE-3 (H4): set ONLY when a human verified this row's bounds. An unverified row is STALE —
   * it carries `as_of` instead and renders its date (§16.4: "stale rows show the date"). Never set a
   * fabricated date here.
   */
  verified_at?: string;
  /** The date an unverified row's bounds were authored/last seen — the display date a stale row shows. */
  as_of?: string;
}
export type VenueBarKind = "user-venue" | "own-archive" | "outlet-table" | "silent-read";

export interface Protocol {
  id: "academic" | "essay" | "op-ed" | "memo" | string;
  version: number;
  name: string;
  tagline: string;
  variants: ProtocolVariant[];
  rubric: { dimensions: RubricDimension[]; swaps?: { from: string; to: RubricDimension }[]; caps: CapRule[] };
  venue_bar: { kind: VenueBarKind; table?: VenueRow[]; prompt: string; verified_at?: string };
  phase_defaults: {
    verification: boolean;
    discourse: boolean;
    second_read: boolean;
    grounding: boolean;
    audit: boolean;
    stage: "early" | "near-final" | "infer";
    line_depth: "light" | "full";
    /**
     * §6.7 phase-defaults row, Memo's two extra cells: verification emits
     * `verified_against_user_source` against the run's `user_sources[]`, and
     * `web_fetch_of_user_data: 'forbidden'` flows into the run's URL policy (enforced, not
     * advised). Absent on the other protocols (both default to not-applicable).
     */
    user_source_verification?: boolean;
    web_fetch_of_user_data?: "allowed" | "forbidden";
  };
  calibration_language: { verdicts: string[]; reviewer_voice: string };
  length_norms: {
    unit: "words" | "pages" | "minutes";
    default?: number;
    from_venue?: boolean;
    apparatus: "none" | "light" | "full";
    /** required apparatus pieces (§6.7 "abstract & keywords required" / "executive summary required"). */
    required?: string[];
  };
  integrity_norms: {
    machine_may_not_supply: string[];
    disclosure_artifact?: "icmje" | "none";
    exclusivity_reminder?: boolean;
    /** free-text norms from the §6.7 Integrity row that no typed field covers (e.g. "no fabricated
     *  references", "sourced news peg"). */
    notes?: string[];
    web_fetch_of_user_data: "allowed" | "forbidden";
  };
  intake_expectations: { typical_inputs: string[]; entry_default: "chat" | "outline" | "draft" };
  workflow_availability: Record<string, "default" | "available" | "off">;
  user_editable: ("venue" | "length" | "phase_defaults" | "stage")[];
  /** REQ-OBJ-11: the closed set of sources this protocol's config may derive from (never dispositions). */
  inputSources: ProtocolInputSource[];
}

const availability = (): Record<string, "default" | "available" | "off"> => {
  const out: Record<string, "default" | "available" | "off"> = {};
  for (const k of WORKFLOW_KEYS) out[k] = "available"; // Essay: "all" available…
  for (const k of ["review", "revise", "draft", "fact_check", "figure"] as WorkflowKey[]) out[k] = "default"; // …core verbs default
  return out;
};

/** Essay — the only Phase-0 protocol (§6.7 Essay column). Seeded, versioned, venue re-verified (REQ-GENRE-3). */
export const ESSAY_PROTOCOL: Protocol = {
  id: "essay",
  version: 1,
  name: "Essay",
  tagline: "The long-form argumentative essay, held to its own project and its author's archive.",
  variants: [
    { id: "long-form", name: "Long-form", default: true },
    { id: "newsletter-short", name: "Newsletter / short" },
  ],
  rubric: {
    dimensions: [...RUBRIC_DIMENSIONS], // the 8 as-is; the letter leads with Voice & audience fit and Originality
    caps: [
      { dimension: "evidence_accuracy", at: 2, when: "a load-bearing claim is contradicted" },
      { dimension: "argument_rigor", at: 3, when: "the strongest counterargument is unaddressed" },
    ],
  },
  venue_bar: {
    kind: "own-archive",
    prompt: "The author's own archive (linked voice) or a named venue — inferred from the piece, stated as inferred.",
    verified_at: "2026-09-01T00:00:00.000Z",
  },
  phase_defaults: {
    verification: true,
    discourse: true,
    second_read: true,
    grounding: true,
    audit: true,
    stage: "infer",
    line_depth: "full",
  },
  calibration_language: {
    verdicts: ["publish", "revise", "rethink"],
    reviewer_voice: "A senior editor at a serious general-interest publication, calibrated to the elite bar, on the author's side.",
  },
  length_norms: { unit: "words", from_venue: false, apparatus: "light" },
  integrity_norms: { machine_may_not_supply: [], disclosure_artifact: "none", web_fetch_of_user_data: "allowed" },
  intake_expectations: { typical_inputs: ["notes", "nothing"], entry_default: "chat" },
  workflow_availability: availability(),
  user_editable: ["venue", "length", "phase_defaults", "stage"],
  inputSources: ["protocol_seed", "venue_table", "run_input"],
};

// ---------------------------------------------------------------------------------------------------------
// P1.21 — the remaining §6.7 rows. Every column lands verbatim: variants, rubric swaps/adds, venue bars
// (stale rows carry `as_of`, NEVER a fabricated `verified_at` — H4 is incomplete), phase defaults,
// verdict vocabularies, length/apparatus, integrity norms, intake, workflow availability. Same shared
// phases — these are configuration, not skill forks (REQ-GENRE-1).
// ---------------------------------------------------------------------------------------------------------

/** The date the P1.21 venue tables were authored — the display date a stale row shows (§16.4). */
const VENUE_AS_OF = "2026-09-01";

/**
 * Academic — the §6.7 Academic column: journal articles / thesis chapters / grants, held to the target
 * venue's bar. The rubric is the eight as-is; the venue table is seeded (PLOS ONE abstract ≤300) but
 * UNVERIFIED until H4 completes — the row carries `as_of`, not `verified_at`.
 */
export const ACADEMIC_PROTOCOL: Protocol = {
  id: "academic",
  version: 1,
  name: "Academic",
  tagline: "Journal articles, thesis chapters, and grants — held to the target venue's bar.",
  variants: [
    { id: "journal-article", name: "Journal article", default: true },
    { id: "thesis-chapter", name: "Thesis chapter" },
    { id: "grant-proposal", name: "Grant proposal" },
  ],
  rubric: {
    dimensions: [...RUBRIC_DIMENSIONS], // "the 8 as-is"
    caps: [
      { dimension: "evidence_accuracy", at: 2, when: "a load-bearing claim is contradicted" },
      { dimension: "argument_rigor", at: 3, when: "the strongest counterargument is unaddressed" },
    ],
  },
  venue_bar: {
    kind: "outlet-table",
    // §6.7: "target journal / committee; seeded table (e.g. PLOS ONE abstract ≤300)" — the row's
    // bounds are authored but H4 has not verified them: `as_of`, never a fabricated `verified_at`.
    table: [{ venue: "PLOS ONE", abstractMaxWords: 300, as_of: VENUE_AS_OF }],
    prompt: "The target journal or committee — pick from the table or type a venue.",
  },
  phase_defaults: {
    verification: true,
    discourse: true,
    second_read: true,
    grounding: true,
    audit: true,
    stage: "infer",
    line_depth: "full",
  },
  calibration_language: {
    // §6.7 verbatim: "accept · minor · major · reject · reject premise (reviewer voice)".
    verdicts: ["accept", "minor", "major", "reject", "reject premise"],
    reviewer_voice: "A referee writing a report for the target venue — the verdict vocabulary is reviewer voice (accept · minor · major · reject · reject premise).",
  },
  length_norms: { unit: "words", from_venue: true, apparatus: "full", required: ["abstract", "keywords"] },
  integrity_norms: {
    machine_may_not_supply: ["results", "data", "first-person method"],
    disclosure_artifact: "icmje",
    notes: ["no fabricated references", "disclosure statement at export"],
    web_fetch_of_user_data: "allowed",
  },
  intake_expectations: { typical_inputs: ["outline", "bibliography", "prior drafts"], entry_default: "outline" },
  workflow_availability: { ...availability(), abstract: "default" }, // "all; Abstract default; Submission pack 1.x"
  user_editable: ["venue", "length", "phase_defaults", "stage"],
  inputSources: ["protocol_seed", "venue_table", "run_input"],
};

/**
 * Op-ed — the §6.7 Op-ed column: short opinion pieces held to the outlet's word cap. The rubric adds
 * Timeliness and anchors Structure to the OpEd Project form; the outlet table's six rows are authored
 * but UNVERIFIED until H4 completes — each carries `as_of`, never a fabricated `verified_at`.
 */
export const OP_ED_PROTOCOL: Protocol = {
  id: "op-ed",
  version: 1,
  name: "Op-ed",
  tagline: "Short opinion pieces held to an outlet's word cap and a fast verdict.",
  variants: [
    { id: "national", name: "National", default: true },
    { id: "regional-trade", name: "Regional/trade" },
  ],
  rubric: {
    // "the 8 + Timeliness; Structure anchored to the OpEd Project form"
    dimensions: [...RUBRIC_DIMENSIONS, "timeliness"],
    caps: [
      { dimension: "evidence_accuracy", at: 2, when: "a load-bearing claim is contradicted" },
      { dimension: "argument_rigor", at: 3, when: "the strongest counterargument is unaddressed" },
      { dimension: "timeliness", at: 2, when: "the piece has no sourced news peg" },
    ],
  },
  venue_bar: {
    kind: "outlet-table",
    // §6.7's named outlet table, authored but UNVERIFIED until H4 completes (as_of, never verified_at).
    table: [
      { venue: "NYT", minWords: 400, maxWords: 1_200, as_of: VENUE_AS_OF },
      { venue: "WaPo", maxWords: 750, as_of: VENUE_AS_OF },
      { venue: "WSJ", minWords: 600, maxWords: 1_200, as_of: VENUE_AS_OF },
      { venue: "LAT", maxWords: 750, as_of: VENUE_AS_OF },
      { venue: "USA Today", minWords: 650, maxWords: 900, as_of: VENUE_AS_OF },
      { venue: "Globe", maxWords: 700, as_of: VENUE_AS_OF },
    ],
    prompt: "The outlet this piece is written for — pick from the table or type a venue.",
  },
  phase_defaults: {
    verification: true,
    discourse: true,
    second_read: true,
    grounding: true,
    audit: true,
    stage: "near-final",
    line_depth: "full",
  },
  calibration_language: {
    verdicts: ["run", "pass"],
    reviewer_voice: "An op-ed desk editor deciding whether this piece runs this week — a 'pass' always says why not this week.",
  },
  length_norms: { unit: "words", from_venue: true, apparatus: "none" }, // "outlet cap; links only"
  integrity_norms: {
    machine_may_not_supply: [],
    exclusivity_reminder: true,
    notes: ["sourced news peg"],
    web_fetch_of_user_data: "allowed",
  },
  intake_expectations: { typical_inputs: ["a take", "a news peg"], entry_default: "chat" },
  // "all; Cut to length bound to the outlet (1.x); Fact-check default at MVP, Map the field default from 1.x"
  workflow_availability: availability(),
  user_editable: ["venue", "length", "phase_defaults", "stage"],
  inputSources: ["protocol_seed", "venue_table", "run_input"],
};

/**
 * Memo — the §6.7 Memo column: internal briefs and six-pagers, written to be read silently and decided
 * on. The rubric swaps Originality → Decision readiness and adds Scope discipline; discourse defaults
 * off; verification may emit `verified_against_user_source` against the run's `user_sources[]`; and
 * `web_fetch_of_user_data: 'forbidden'` is ENFORCED in the run's URL policy (REQ-WF-8 / REQ-GENRE-6 /
 * §16.4) — the sources the user supplies are never fetched or leaked to the web.
 */
export const MEMO_PROTOCOL: Protocol = {
  id: "memo",
  version: 1,
  name: "Memo",
  tagline: "Internal briefs and six-pagers — written to be read silently and decided on.",
  variants: [
    { id: "six-pager", name: "Six-pager", default: true },
    { id: "report", name: "Report" },
    { id: "whitepaper", name: "Whitepaper" },
  ],
  rubric: {
    // "swap Originality → Decision readiness; add Scope discipline" — nine scored rows.
    dimensions: [
      "thesis_contribution",
      "argument_rigor",
      "evidence_accuracy",
      "decision_readiness",
      "structure",
      "prose",
      "voice_audience_fit",
      "intellectual_honesty",
      "scope_discipline",
    ],
    swaps: [{ from: "originality_situatedness", to: "decision_readiness" }],
    caps: [
      { dimension: "evidence_accuracy", at: 2, when: "a load-bearing claim is contradicted" },
      { dimension: "decision_readiness", at: 2, when: "the memo names no decision or no recommendation" },
    ],
  },
  venue_bar: {
    kind: "silent-read",
    prompt: "\"Six-pager read silently\" — optionally name the audience.",
  },
  phase_defaults: {
    verification: true, // …with user-supplied-source verdicts (verified_against_user_source)
    discourse: false, // §6.7: discourse OFF for memo
    second_read: true,
    grounding: true,
    audit: true,
    stage: "infer",
    line_depth: "full",
    user_source_verification: true,
    web_fetch_of_user_data: "forbidden",
  },
  calibration_language: {
    // §6.7 verbatim: "ship · rewrite · needs data".
    verdicts: ["ship", "rewrite", "needs data"],
    reviewer_voice: "The decision-maker's staffer — ship, rewrite, or needs data.",
  },
  length_norms: { unit: "pages", default: 6, apparatus: "light", required: ["executive_summary"] },
  integrity_norms: {
    machine_may_not_supply: ["the recommendation", "numbers"],
    notes: ["no web fetch of internal figures"],
    web_fetch_of_user_data: "forbidden",
  },
  intake_expectations: { typical_inputs: ["data", "a decision", "an audience"], entry_default: "outline" },
  // "all; Map the field off by default; Figure default; Abstract → executive summary"
  workflow_availability: { ...availability(), map_the_field: "off", abstract: "default" },
  user_editable: ["venue", "length", "phase_defaults", "stage"],
  inputSources: ["protocol_seed", "venue_table", "run_input"],
};

/** Every protocol seeded in this phase: Essay (P0.03) + Academic / Op-ed / Memo (P1.21). */
export const PROTOCOL_SEEDS: Protocol[] = [ESSAY_PROTOCOL, ACADEMIC_PROTOCOL, OP_ED_PROTOCOL, MEMO_PROTOCOL];

// ---------------------------------------------------------------------------------------------------------
// P1.04 — the new-project sheet's protocol cards (§5.3; REQ-GENRE-3/4). The sheet shows the FOUR §6.7
// protocols even though only Essay's full `Protocol` body is seeded — these cards carry the picker's
// public metadata (tagline, hold-you-to line, venue bar, length prefill) while the rubric/calibration
// bodies stay P1.21's. Nothing here is protocol IP: it is the same metadata the §6.7 table publishes.
// ---------------------------------------------------------------------------------------------------------

export interface ProtocolCard {
  readonly id: "essay" | "academic" | "op-ed" | "memo" | string;
  readonly name: string;
  readonly tagline: string;
  /** §5.3: "what the Editor will hold you to" — the card's second line. */
  readonly holdYouTo: string;
  /** The venue typeahead source: a verified outlet table or free-text only (REQ-GENRE-4). */
  readonly venueBar: { readonly kind: VenueBarKind; readonly table: readonly VenueRow[]; readonly prompt: string };
  /** Target-length prefill unit + apparatus level (§6.7's "Length / apparatus" row). */
  readonly lengthNorms: {
    readonly unit: "words" | "pages" | "minutes";
    readonly default?: number;
    readonly apparatus: "none" | "light" | "full";
  };
  /** A representative draft length the api uses to price the card's typical Review band. */
  readonly typicalWords: number;
  /** The card's default entry point (§6.7 intake_expectations.entry_default). */
  readonly entryDefault: "chat" | "outline" | "draft";
}

export const PROTOCOL_CARDS: readonly ProtocolCard[] = [
  {
    id: ESSAY_PROTOCOL.id,
    name: ESSAY_PROTOCOL.name,
    tagline: ESSAY_PROTOCOL.tagline,
    holdYouTo: "Every claim checked, the field mapped, an independent second read, a verdict.",
    venueBar: {
      kind: ESSAY_PROTOCOL.venue_bar.kind,
      table: ESSAY_PROTOCOL.venue_bar.table ?? [],
      prompt: ESSAY_PROTOCOL.venue_bar.prompt,
    },
    lengthNorms: {
      unit: ESSAY_PROTOCOL.length_norms.unit,
      default: ESSAY_PROTOCOL.length_norms.default,
      apparatus: ESSAY_PROTOCOL.length_norms.apparatus,
    },
    typicalWords: 4_000,
    entryDefault: ESSAY_PROTOCOL.intake_expectations.entry_default,
  },
  {
    id: ACADEMIC_PROTOCOL.id,
    name: ACADEMIC_PROTOCOL.name,
    tagline: ACADEMIC_PROTOCOL.tagline,
    holdYouTo: "No fabricated references; apparatus in full; abstract and keywords required.",
    venueBar: {
      kind: ACADEMIC_PROTOCOL.venue_bar.kind,
      table: ACADEMIC_PROTOCOL.venue_bar.table ?? [],
      prompt: ACADEMIC_PROTOCOL.venue_bar.prompt,
    },
    lengthNorms: {
      unit: ACADEMIC_PROTOCOL.length_norms.unit,
      default: ACADEMIC_PROTOCOL.length_norms.default,
      apparatus: ACADEMIC_PROTOCOL.length_norms.apparatus,
    },
    typicalWords: 8_000,
    entryDefault: ACADEMIC_PROTOCOL.intake_expectations.entry_default,
  },
  {
    id: OP_ED_PROTOCOL.id,
    name: OP_ED_PROTOCOL.name,
    tagline: OP_ED_PROTOCOL.tagline,
    holdYouTo: "Links only; the outlet cap is the meter; a tight argument over apparatus.",
    venueBar: {
      kind: OP_ED_PROTOCOL.venue_bar.kind,
      table: OP_ED_PROTOCOL.venue_bar.table ?? [],
      prompt: OP_ED_PROTOCOL.venue_bar.prompt,
    },
    lengthNorms: {
      unit: OP_ED_PROTOCOL.length_norms.unit,
      default: OP_ED_PROTOCOL.length_norms.default,
      apparatus: OP_ED_PROTOCOL.length_norms.apparatus,
    },
    typicalWords: 800,
    entryDefault: OP_ED_PROTOCOL.intake_expectations.entry_default,
  },
  {
    id: MEMO_PROTOCOL.id,
    name: MEMO_PROTOCOL.name,
    tagline: MEMO_PROTOCOL.tagline,
    holdYouTo: "An executive summary up front; light apparatus; the named audience's questions answered.",
    venueBar: {
      kind: MEMO_PROTOCOL.venue_bar.kind,
      table: MEMO_PROTOCOL.venue_bar.table ?? [],
      prompt: MEMO_PROTOCOL.venue_bar.prompt,
    },
    lengthNorms: {
      unit: MEMO_PROTOCOL.length_norms.unit,
      default: MEMO_PROTOCOL.length_norms.default,
      apparatus: MEMO_PROTOCOL.length_norms.apparatus,
    },
    typicalWords: 2_400,
    entryDefault: MEMO_PROTOCOL.intake_expectations.entry_default,
  },
];

/** The card for a protocol id (null ⇒ unknown — the sheet asks once rather than guessing). */
export function protocolCard(id: string | null | undefined): ProtocolCard | null {
  return PROTOCOL_CARDS.find((p) => p.id === id) ?? null;
}

/**
 * REQ-GENRE-4's apparatus probe: a linked Voice's `structure_repertoire` artifact head records the
 * writer's apparatus level (`apparatus: full` ⇒ the Academic default). The artifact is markdown, so
 * the probe accepts a frontmatter-style `apparatus: full` line or a JSON `"apparatus": "full"` field.
 * Returns null when the repertoire does not record one (the sheet asks once instead of guessing).
 */
export function detectApparatus(structureRepertoire: string | null | undefined): "full" | "light" | "none" | null {
  if (!structureRepertoire) return null;
  const m = /apparatus\s*[:=]\s*"?(full|light|none)"?\b/i.exec(structureRepertoire);
  if (!m?.[1]) return null;
  return m[1].toLowerCase() as "full" | "light" | "none";
}

/**
 * REQ-GENRE-4's default rule, pure: Essay for Unfiled (no linked Voice); Academic when the Voice's
 * structure repertoire records `apparatus: full`; null ⇒ the sheet asks once.
 */
export function defaultProtocolId(args: {
  personaId: string | null;
  structureRepertoire: string | null;
}): string | null {
  if (!args.personaId) return "essay";
  return detectApparatus(args.structureRepertoire) === "full" ? "academic" : null;
}

/** True when the venue row was never verified (H4) — it must render its `as_of` date, never a
 *  fabricated `verified_at` (§16.4 "stale rows show the date"). */
export function venueRowStale(row: VenueRow): boolean {
  return row.verified_at == null;
}

/** The display date a stale venue row shows (its authored/last-seen date), or null when verified. */
export function venueRowAsOf(row: VenueRow): string | null {
  return row.verified_at == null ? (row.as_of ?? null) : null;
}

/** The `venue_table_verified_at` column value for a protocol: the bar's own verified stamp, or the
 *  table's earliest verified date when EVERY row is verified — null while any row is stale (H4). */
export function venueTableVerifiedAt(p: Protocol): string | null {
  if (p.venue_bar.verified_at != null) return p.venue_bar.verified_at;
  const table = p.venue_bar.table;
  if (!table || table.length === 0) return null;
  return table.every((r) => r.verified_at != null) ? table[0]!.verified_at! : null;
}

/** The DB `protocols`-table row for a protocol (P0.02 schema: id, version, body, venue_table_verified_at). */
export function protocolSeedRow(p: Protocol): {
  id: string;
  version: number;
  body: Protocol;
  venue_table_verified_at: string | null;
} {
  return { id: p.id, version: p.version, body: p, venue_table_verified_at: venueTableVerifiedAt(p) };
}

/** Minimal engine-agnostic query target (matches @rhema/db's TenantClient / PGlite — REQ-DATA-3 pattern). */
export interface SeedTarget {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * Seed the protocol rows into the `protocols` table. Upserts on (id, version): P0.02 seeds a row
 * *placeholder* (`{scaffold:true, note:"body seeded by P0.03"}`) so the row exists; this fills the real
 * §6.7 body and the venue_table_verified_at column (REQ-GENRE-3). Idempotent.
 */
export async function seedProtocols(target: SeedTarget, protocols: Protocol[] = PROTOCOL_SEEDS): Promise<void> {
  for (const p of protocols) {
    const row = protocolSeedRow(p);
    await target.query(
      `insert into protocols (id, version, body, venue_table_verified_at)
       values ($1, $2, $3, $4)
       on conflict (id, version) do update
         set body = excluded.body, venue_table_verified_at = excluded.venue_table_verified_at`,
      [row.id, row.version, JSON.stringify(row.body), row.venue_table_verified_at],
    );
  }
}

/** Zod shape the seed contract tests use to assert a seeded protocol body is well-formed (§6.7). A
 *  protocol scores 8 or 9 rubric rows (§6.7: swap at most one, add at most one). */
export const protocolSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  rubric: z.object({
    dimensions: z.array(z.string()).min(8).max(9),
    swaps: z.array(z.object({ from: z.string(), to: z.string() })).max(1).optional(),
  }),
  venue_bar: z.object({
    kind: z.string(),
    verified_at: z.string().optional(),
    table: z
      .array(
        z
          .object({
            venue: z.string(),
            verified_at: z.string().optional(),
            as_of: z.string().optional(),
          })
          .passthrough()
          // a row declares when it was verified OR the date its bounds were authored — never neither.
          .refine((r) => r.verified_at != null || r.as_of != null, {
            message: "venue row must carry verified_at (verified) or as_of (stale)",
          }),
      )
      .optional(),
  }),
  user_editable: z.array(z.enum(["venue", "length", "phase_defaults", "stage"])),
  inputSources: z.array(z.enum(ALLOWED_INPUT_SOURCES)),
});
