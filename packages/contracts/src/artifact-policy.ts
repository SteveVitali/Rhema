import { z } from "zod";
import {
  ARTIFACT_KINDS,
  artifactKindSchema,
  editModeSchema,
  reasonClassSchema,
  visibilitySchema,
  type ArtifactKind,
  type EditMode,
  type ReasonClass,
  type Visibility,
} from "./enums.js";

// The §8.2 per-artifact visibility policy in code (REQ-VIS-1). Visibility is a function of artifact KIND,
// computed from this one table, never stored per row as opinion. Levels may be NARROWED per project or by
// namespace (the Editor namespace narrows every kind to H; a share link exposes only SR) but never widened
// (REQ-VIS-2). The REQ-SPEC-14 contract test asserts `keys(artifactPolicy) ≡ ArtifactKind ≡ §8.2 rows`.
//
// Where §8.2 gives a conditional level ("SE → SR when frozen", "I (SR at Confirm scope)"), the table stores
// the BASE level (the wider one, which narrowing may reduce) and cites the row. Reason classes are verbatim
// from §8.2's Reason column where present; the Rhema/workflow addition tables carry no Reason column, so
// those rows take the minimal defensible reason (R9 `preference_profile` is explicit: UX, IB).

export interface ArtifactPolicy {
  level: Visibility;
  reasons: ReasonClass[];
  editMode: EditMode;
}

export const artifactPolicySchema: z.ZodType<ArtifactPolicy> = z.object({
  level: visibilitySchema,
  reasons: z.array(reasonClassSchema),
  editMode: editModeSchema,
});

/** REQ-VIS-1 / REQ-SPEC-14: exactly one policy row per ArtifactKind (63). */
export const artifactPolicy: Record<ArtifactKind, ArtifactPolicy> = {
  // ---- shared record (§8.2 rows 2–11) ----
  draft: { level: "SE", reasons: ["immutability"], editMode: "live_doc" }, // row 2: SE→SR on freeze
  figure: { level: "SE", reasons: [], editMode: "form" }, // rows 3 / W13
  companion_doc: { level: "SE", reasons: [], editMode: "form" }, // row 3
  drafting_note: { level: "SR", reasons: ["immutability"], editMode: "none" }, // row 4
  editors_letter: { level: "SR", reasons: ["immutability"], editMode: "none" }, // row 5
  piece_brief: { level: "I", reasons: ["ux"], editMode: "none" }, // row 6: I (SR at Confirm scope)
  claim_ledger: { level: "SR", reasons: ["immutability"], editMode: "none" }, // row 7 (as data)
  discourse_report: { level: "SR", reasons: ["immutability"], editMode: "none" }, // row 8
  argument_notes: { level: "I", reasons: ["ux"], editMode: "none" }, // row 9
  craft_notes: { level: "I", reasons: ["ux"], editMode: "none" }, // row 9
  second_read: { level: "SR", reasons: ["immutability"], editMode: "none" }, // row 10
  response_letter: { level: "SR", reasons: ["immutability"], editMode: "none" }, // row 11

  // ---- Drafter namespace (§8.2 rows 12–22) ----
  outline: { level: "SE", reasons: [], editMode: "form" }, // row 12 (versioned)
  commissioning_brief: { level: "I", reasons: ["ux"], editMode: "none" }, // row 13: I; SR at Approve plan
  voice_brief: { level: "I", reasons: ["ux"], editMode: "none" }, // row 14
  structure_plan: { level: "SR", reasons: ["ux", "immutability"], editMode: "guidance_only" }, // row 15
  draft_ledger: { level: "I", reasons: ["ux", "secret_sauce"], editMode: "none" }, // row 17: I/H
  consolidation_notes: { level: "H", reasons: ["ux"], editMode: "none" }, // row 18
  fidelity_audit: { level: "I", reasons: ["ux"], editMode: "none" }, // row 19
  source_note: { level: "SR", reasons: ["ux"], editMode: "none" }, // row 20 (author); Editor ns narrows to H (row 23)
  response_ledger: { level: "SR", reasons: ["immutability"], editMode: "none" }, // row 21 (via disposition UI)
  voice_charter: { level: "I", reasons: ["ux", "integrity_boundary"], editMode: "guidance_only" }, // row 22

  // ---- voice library (§8.2 rows 25–38) ----
  persona_seed: { level: "SE", reasons: [], editMode: "live_doc" }, // row 25 (user prose)
  persona_builder_note: { level: "SR", reasons: ["immutability"], editMode: "none" }, // row 25 (agent-appended)
  sample: { level: "SE", reasons: [], editMode: "form" }, // row 26 (samples manager)
  profile_index: { level: "SR", reasons: ["ux"], editMode: "none" }, // row 27
  voice_print: { level: "I", reasons: ["secret_sauce", "ux"], editMode: "none" }, // row 28
  structure_repertoire: { level: "SR", reasons: ["ux"], editMode: "none" }, // row 29
  lexicon: { level: "I", reasons: ["secret_sauce", "ux"], editMode: "none" }, // row 30
  exemplars: { level: "SR", reasons: [], editMode: "none" }, // row 31
  positions: { level: "SR", reasons: [], editMode: "none" }, // row 32
  continuity: { level: "SR", reasons: [], editMode: "none" }, // row 33
  audience_venue: { level: "SR", reasons: ["ux"], editMode: "none" }, // row 34
  calibration_report: { level: "SR", reasons: [], editMode: "none" }, // row 35
  profile_provenance: { level: "I", reasons: ["ux"], editMode: "none" }, // row 36
  corpus_note: { level: "H", reasons: ["integrity_boundary", "secret_sauce"], editMode: "none" }, // row 37
  holdout_note: { level: "H", reasons: ["integrity_boundary", "secret_sauce"], editMode: "none" }, // row 37
  register_map: { level: "SR", reasons: [], editMode: "none" }, // row 38
  shared_lexicon: { level: "I", reasons: [], editMode: "none" }, // row 38

  // ---- Rhema additions (§8.2 rows R1–R9) ----
  run_transcript: { level: "H", reasons: ["integrity_boundary", "secret_sauce"], editMode: "none" }, // R1
  access_report: { level: "SR", reasons: [], editMode: "none" }, // R2 (trust chip)
  fetch_log: { level: "SR", reasons: [], editMode: "none" }, // R3 (source cards)
  run_report: { level: "SR", reasons: [], editMode: "none" }, // R4
  walkthrough: { level: "SR", reasons: [], editMode: "none" }, // R4
  chat_session: { level: "SE", reasons: [], editMode: "form" }, // R5: SE (user turns) / SR (assistant)
  provenance_map: { level: "SR", reasons: [], editMode: "none" }, // R6
  ai_use_statement: { level: "SR", reasons: [], editMode: "none" }, // R7
  research_note: { level: "SR", reasons: [], editMode: "none" }, // R8
  preference_profile: { level: "SR", reasons: ["ux", "integrity_boundary"], editMode: "none" }, // R9 (63rd; pre-registered)

  // ---- workflow additions (§8.2 rows W1–W15) ----
  cut_list: { level: "SR", reasons: [], editMode: "none" }, // W1
  field_map: { level: "SR", reasons: [], editMode: "none" }, // W2
  open_ground: { level: "SR", reasons: [], editMode: "none" }, // W3
  steelman_essay: { level: "SR", reasons: [], editMode: "none" }, // W4
  vulnerability_map: { level: "SR", reasons: [], editMode: "none" }, // W5
  adjudication: { level: "I", reasons: [], editMode: "none" }, // W6
  convergence_report: { level: "SR", reasons: [], editMode: "none" }, // W7
  title_candidates: { level: "SR", reasons: [], editMode: "none" }, // W8 (proposal)
  abstract_keywords: { level: "SR", reasons: [], editMode: "none" }, // W9
  reverse_outline: { level: "SR", reasons: [], editMode: "none" }, // W10
  suggestion_set: { level: "SR", reasons: [], editMode: "none" }, // W11
  pattern_note: { level: "SR", reasons: [], editMode: "none" }, // W12
  guidance_record: { level: "SR", reasons: [], editMode: "none" }, // W14 (rendered from guidance rows)
  sidecar: { level: "H", reasons: ["ux"], editMode: "none" }, // W15 (parsed into rows; never rendered)
};

/**
 * The §8.2 row set, expressed independently of the ArtifactKind enum, so the REQ-SPEC-14 contract test has
 * three lists to reconcile (enum ↔ policy keys ↔ this) rather than a self-referential pair. Adding a kind to
 * one place and not the others fails the test.
 */
export const ARTIFACT_KINDS_FROM_8_2: readonly ArtifactKind[] = ARTIFACT_KINDS;

/** Look up an artifact kind's policy; throws on an unknown kind (validates the key first). */
export function policyFor(kind: ArtifactKind): ArtifactPolicy {
  const parsed = artifactKindSchema.parse(kind);
  return artifactPolicy[parsed];
}

/** Level counts computed from the table (never hand-maintained — §8.2). */
export function levelCounts(): Record<Visibility, number> {
  const counts: Record<Visibility, number> = { SE: 0, SR: 0, I: 0, H: 0 };
  for (const kind of ARTIFACT_KINDS) counts[artifactPolicy[kind].level] += 1;
  return counts;
}

// ---------------------------------------------------------------------------------------------------------------------
// §5.13 — the artifact Browser's typed sections (P1.08). The pane shows typed sections, never a
// filesystem tree; the user-facing label is "Files". This table is the ONE authority for which section
// a kind belongs to — the api's /files read groups by it and the ui renders it verbatim. A kind's
// VISIBILITY stays `artifactPolicy[kind].level`: `H` kinds map to a nominal section so the pane can
// render them as a sealed COUNT (never a row, never a link); `I` kinds render as rows only inside the
// `advanced` disclosure section's tier. Kinds absent from the map (`null`) are unlisted entirely —
// an unknown kind is hidden, never leaked.
// ---------------------------------------------------------------------------------------------------------------------

export const BROWSER_SECTIONS = [
  "outline",
  "drafts",
  "rounds",
  "research",
  "voice",
  "assets",
  "advanced",
] as const;
export type BrowserSection = (typeof BROWSER_SECTIONS)[number];

const BROWSER_SECTION_BY_KIND: Record<ArtifactKind, BrowserSection> = {
  // Outline — the outline (versioned if edited after v1).
  outline: "outline",
  // Drafts — version-rail entries, the working head, companion docs.
  draft: "drafts",
  companion_doc: "drafts",
  // Rounds — per round: drafting note · claim ledger · discourse report · second read · Editor's
  // letter · response letter · response ledger · run reports · walkthrough (+ the 1.x workflow
  // deliverables a round can produce).
  drafting_note: "rounds",
  editors_letter: "rounds",
  claim_ledger: "rounds",
  discourse_report: "rounds",
  second_read: "rounds",
  response_letter: "rounds",
  response_ledger: "rounds",
  run_report: "rounds",
  walkthrough: "rounds",
  access_report: "rounds",
  ai_use_statement: "rounds",
  guidance_record: "rounds",
  field_map: "rounds",
  open_ground: "rounds",
  steelman_essay: "rounds",
  convergence_report: "rounds",
  title_candidates: "rounds",
  abstract_keywords: "rounds",
  reverse_outline: "rounds",
  suggestion_set: "rounds",
  pattern_note: "rounds",
  // Research — the Drafter's source library, the Assistant's chat sources + research notes, and the
  // Editor's fetched URLs (fetch_log: the URLs are SR; note BODIES stay H per §5.13's hidden list).
  source_note: "research",
  research_note: "research",
  fetch_log: "research",
  chat_session: "research",
  // Voice — the linked voice summary card's artifacts + agent memory (read-only; "Add guidance").
  persona_seed: "voice",
  persona_builder_note: "voice",
  sample: "voice",
  profile_index: "voice",
  voice_print: "voice",
  structure_repertoire: "voice",
  lexicon: "voice",
  exemplars: "voice",
  positions: "voice",
  continuity: "voice",
  audience_venue: "voice",
  calibration_report: "voice",
  profile_provenance: "voice",
  register_map: "voice",
  shared_lexicon: "voice",
  voice_charter: "voice",
  preference_profile: "voice",
  corpus_note: "voice", // H — nominal section for the sealed count only
  holdout_note: "voice", // H — nominal section for the sealed count only
  // Assets — figures (incl. working figures), uploaded files, bibliography.
  figure: "assets",
  // Advanced (disclosure) — drafting dossiers per version + the 1.x mechanism artifacts.
  commissioning_brief: "advanced",
  voice_brief: "advanced",
  structure_plan: "advanced",
  draft_ledger: "advanced",
  fidelity_audit: "advanced",
  piece_brief: "advanced",
  argument_notes: "advanced",
  craft_notes: "advanced",
  provenance_map: "advanced",
  cut_list: "advanced",
  vulnerability_map: "advanced",
  adjudication: "advanced",
  consolidation_notes: "advanced", // H — nominal section for the sealed count only
  // Hidden entirely — Editor working notes / transcripts / parsed sidecars (§5.13's hidden list).
  // Nominal sections only so the pane can render "N sealed"; they never produce a row or a route.
  run_transcript: "rounds", // H — nominal section for the sealed count only
  sidecar: "rounds", // H — nominal section for the sealed count only
};

/** Kinds that exist in storage but never joined the §8.2 enum (the bibliography the editor writes).
 *  Mapped here so the pane can show them; NOT part of the REQ-SPEC-14 63-kind contract. */
const BROWSER_SECTION_EXTRA: Record<string, BrowserSection> = {
  bibliography: "assets",
};

/** The §5.13 section a kind belongs to (nominal — `H` kinds still return their section so the pane
 *  can count them as sealed; the ROW never renders). Unknown kinds return null (unlisted). */
export function browserSectionFor(kind: string): BrowserSection | null {
  if (kind in BROWSER_SECTION_BY_KIND) {
    return BROWSER_SECTION_BY_KIND[kind as ArtifactKind];
  }
  return BROWSER_SECTION_EXTRA[kind] ?? null;
}
