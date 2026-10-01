import { z } from "zod";
import {
  RUBRIC_DIMENSIONS,
  WORKFLOW_KEYS,
  type RubricDimension,
  type WorkflowKey,
} from "@rhema/contracts";
import { ALLOWED_INPUT_SOURCES, type ProtocolInputSource } from "./input-sources.js";

// Genres as protocol objects (§6.7): a genre is a versioned Protocol — configuration over the seven
// Review phases and the Draft/Revise inputs, NEVER a skill fork (REQ-GENRE-1). Only the Essay protocol
// seeds in Phase 0 (Q-22 beta is Essay-only); Academic/Op-ed/Memo land at P1.21. The default rule
// (protocol + venue at project creation) is REQ-GENRE-4 (data half here). Protocol config is private
// (SS §8.4): it lives in this package and the DB `protocols` table, never a client bundle/OpenAPI/event.

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
  /** REQ-GENRE-3: each outlet row re-verified before launch (H4). */
  verified_at: string;
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
  };
  calibration_language: { verdicts: string[]; reviewer_voice: string };
  length_norms: { unit: "words" | "pages" | "minutes"; default?: number; from_venue?: boolean; apparatus: "none" | "light" | "full" };
  integrity_norms: {
    machine_may_not_supply: string[];
    disclosure_artifact?: "icmje" | "none";
    exclusivity_reminder?: boolean;
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

/** Every protocol seeded in this phase (Essay only — Q-22). Academic/Op-ed/Memo land at P1.21. */
export const PROTOCOL_SEEDS: Protocol[] = [ESSAY_PROTOCOL];

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

const VENUE_VERIFIED_AT = "2026-09-01T00:00:00.000Z"; // REQ-GENRE-3: venue rows re-verified before launch (H4)

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
    id: "academic",
    name: "Academic",
    tagline: "Journal articles, thesis chapters, and grants — held to the target venue's bar.",
    holdYouTo: "No fabricated references; apparatus in full; abstract and keywords required.",
    venueBar: {
      kind: "outlet-table",
      // §6.7: "target journal / committee; seeded table" — journal length limits are human-verified
      // content (H4); rows without bounds leave the prefill to the protocol's own length norms.
      table: [{ venue: "PLOS ONE", verified_at: VENUE_VERIFIED_AT }],
      prompt: "The target journal or committee — pick from the table or type a venue.",
    },
    lengthNorms: { unit: "words", apparatus: "full" },
    typicalWords: 8_000,
    entryDefault: "outline",
  },
  {
    id: "op-ed",
    name: "Op-ed",
    tagline: "Short opinion pieces held to an outlet's word cap and a fast verdict.",
    holdYouTo: "Links only; the outlet cap is the meter; a tight argument over apparatus.",
    venueBar: {
      kind: "outlet-table",
      // §6.7's named op-ed table (verified_at per row, REQ-GENRE-3).
      table: [
        { venue: "NYT", minWords: 400, maxWords: 1_200, verified_at: VENUE_VERIFIED_AT },
        { venue: "WaPo", maxWords: 750, verified_at: VENUE_VERIFIED_AT },
        { venue: "WSJ", minWords: 600, maxWords: 1_200, verified_at: VENUE_VERIFIED_AT },
        { venue: "LAT", maxWords: 750, verified_at: VENUE_VERIFIED_AT },
        { venue: "USA Today", minWords: 650, maxWords: 900, verified_at: VENUE_VERIFIED_AT },
        { venue: "Globe", maxWords: 700, verified_at: VENUE_VERIFIED_AT },
      ],
      prompt: "The outlet this piece is written for — pick from the table or type a venue.",
    },
    lengthNorms: { unit: "words", apparatus: "none" },
    typicalWords: 800,
    entryDefault: "draft",
  },
  {
    id: "memo",
    name: "Memo",
    tagline: "Internal briefs and six-pagers — written to be read silently and decided on.",
    holdYouTo: "An executive summary up front; light apparatus; the named audience's questions answered.",
    venueBar: {
      kind: "silent-read",
      table: [],
      prompt: "Read silently — optionally name the audience.",
    },
    lengthNorms: { unit: "pages", default: 6, apparatus: "light" },
    typicalWords: 2_400,
    entryDefault: "outline",
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

/** The DB `protocols`-table row for a protocol (P0.02 schema: id, version, body, venue_table_verified_at). */
export function protocolSeedRow(p: Protocol): {
  id: string;
  version: number;
  body: Protocol;
  venue_table_verified_at: string | null;
} {
  const verifiedAt = p.venue_bar.verified_at ?? p.venue_bar.table?.[0]?.verified_at ?? null;
  return { id: p.id, version: p.version, body: p, venue_table_verified_at: verifiedAt };
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

/** Zod shape used by the Essay-seed contract test (AC7) to assert the seeded config is well-formed. */
export const protocolSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  rubric: z.object({ dimensions: z.array(z.string()).length(8) }),
  venue_bar: z.object({ kind: z.string(), verified_at: z.string().optional() }),
  user_editable: z.array(z.enum(["venue", "length", "phase_defaults", "stage"])),
  inputSources: z.array(z.enum(ALLOWED_INPUT_SOURCES)),
});
