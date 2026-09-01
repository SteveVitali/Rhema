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
