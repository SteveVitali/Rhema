import type {
  BenchmarkDeps,
  CorpusProtocol,
  LengthBand,
  SqlExecutor,
} from "./types.js";
import { enclaveKeyFor, sha256Hex, type EnclaveBlobStore } from "./enclave.js";

// Corpus intake + contamination records + rotation bookkeeping (REQ-EVAL-1/2/3). The corpus CONTENT is
// commissioned by the operator (a human row); this module is the machinery that registers a draft into the
// enclave, records its per-draft contamination evidence, and tracks the ≥20%/yr rotation. Registering a draft
// stores its bytes in the enclave blob store (the row only ever holds the content sha + key — REQ-EVAL-3).

export interface RegisterDraftInput {
  readonly protocol: CorpusProtocol;
  readonly lengthBand: LengthBand;
  readonly text: string;
  readonly licenseRef: string;
  readonly canaryId: string;
  readonly createdAt: Date;
  /** the three real projects are the frozen dev set — flagged so their numbers never enter a headline (REQ-EVAL-1). */
  readonly isDevSet?: boolean;
  readonly sourceProjectId?: string;
  readonly rotationYear?: number;
  readonly id?: string;
}

export interface CorpusDraftRow {
  readonly id: string;
  readonly protocol: string;
  readonly length_band: string;
  readonly word_count: number;
  readonly content_sha256: string;
  readonly enclave_key: string;
  readonly canary_id: string;
  readonly is_dev_set: boolean;
  readonly rotation_year: number | null;
  readonly retired_at: Date | null;
}

function wordCount(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/u).length;
}

/** Register a commissioned draft into the enclave: store its bytes, insert the corpus row (sha + key only). */
export async function registerCorpusDraft(
  exec: SqlExecutor,
  store: EnclaveBlobStore,
  deps: BenchmarkDeps,
  input: RegisterDraftInput,
): Promise<CorpusDraftRow> {
  const id = input.id ?? deps.ids("bmdraft");
  const bytes = Buffer.from(input.text, "utf8");
  const sha = sha256Hex(bytes);
  await store.put(sha, bytes);
  await exec.query(
    `insert into benchmark_corpus_drafts
       (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key,
        canary_id, is_dev_set, source_project_id, rotation_year, added_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      input.protocol,
      input.lengthBand,
      wordCount(input.text),
      input.createdAt,
      input.licenseRef,
      sha,
      enclaveKeyFor(sha),
      input.canaryId,
      input.isDevSet ?? false,
      input.sourceProjectId ?? null,
      input.rotationYear ?? null,
      deps.clock.now(),
    ],
  );
  return {
    id,
    protocol: input.protocol,
    length_band: input.lengthBand,
    word_count: wordCount(input.text),
    content_sha256: sha,
    enclave_key: enclaveKeyFor(sha),
    canary_id: input.canaryId,
    is_dev_set: input.isDevSet ?? false,
    rotation_year: input.rotationYear ?? null,
    retired_at: null,
  };
}

export interface ContaminationInput {
  readonly draftId: string;
  readonly createdAfterCutoff: boolean;
  readonly neverPublished?: boolean;
  readonly newestModelCutoff: Date;
  readonly authorAttestationRef: string;
  readonly nearDuplicateClean: boolean;
  readonly nearDuplicateSearchRef: string;
  readonly canaryId: string;
}

/** Record a draft's REQ-EVAL-2 contamination evidence. A complete record is required before wave admission (AC2). */
export async function recordContamination(
  exec: SqlExecutor,
  input: ContaminationInput,
): Promise<void> {
  await exec.query(
    `insert into benchmark_contamination_records
       (draft_id, created_after_cutoff, never_published, newest_model_cutoff, author_attestation_ref,
        near_duplicate_clean, near_duplicate_search_ref, canary_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (draft_id) do update set
       created_after_cutoff = excluded.created_after_cutoff,
       never_published = excluded.never_published,
       newest_model_cutoff = excluded.newest_model_cutoff,
       author_attestation_ref = excluded.author_attestation_ref,
       near_duplicate_clean = excluded.near_duplicate_clean,
       near_duplicate_search_ref = excluded.near_duplicate_search_ref,
       canary_id = excluded.canary_id`,
    [
      input.draftId,
      input.createdAfterCutoff,
      input.neverPublished ?? false,
      input.newestModelCutoff,
      input.authorAttestationRef,
      input.nearDuplicateClean,
      input.nearDuplicateSearchRef,
      input.canaryId,
    ],
  );
}

/** The five REQ-EVAL-2 evidence checks, evaluated over a draft's contamination record — the same predicate the
 *  DB admission trigger enforces, exposed for tooling to explain WHICH field is missing before an insert fails. */
export interface ContaminationStatus {
  readonly present: boolean;
  readonly complete: boolean;
  readonly missing: string[];
}

export async function contaminationStatus(
  exec: SqlExecutor,
  draftId: string,
): Promise<ContaminationStatus> {
  const rows = (
    await exec.query(
      `select created_after_cutoff, never_published, author_attestation_ref, near_duplicate_clean,
              near_duplicate_search_ref, canary_id
         from benchmark_contamination_records where draft_id = $1`,
      [draftId],
    )
  ).rows as {
    created_after_cutoff: boolean;
    never_published: boolean;
    author_attestation_ref: string | null;
    near_duplicate_clean: boolean;
    near_duplicate_search_ref: string | null;
    canary_id: string | null;
  }[];
  const r = rows[0];
  if (!r) return { present: false, complete: false, missing: ["contamination_record"] };
  const missing: string[] = [];
  if (!(r.created_after_cutoff || r.never_published)) missing.push("created_after_cutoff|never_published");
  if (!r.author_attestation_ref) missing.push("author_attestation_ref");
  if (!r.near_duplicate_clean) missing.push("near_duplicate_clean");
  if (!r.near_duplicate_search_ref) missing.push("near_duplicate_search_ref");
  if (!r.canary_id) missing.push("canary_id");
  return { present: true, complete: missing.length === 0, missing };
}

/**
 * Rotation bookkeeping (REQ-EVAL-3): ≥20% of the corpus rotates per year. Given the active (non-dev-set,
 * non-retired) corpus and how many were added in `year`, report the rotation fraction and whether the ≥20% floor
 * is met — the repeatable half of the lift criterion depends on it.
 */
export interface RotationStatus {
  readonly activeCount: number;
  readonly rotatedInYear: number;
  readonly fraction: number;
  readonly meetsFloor: boolean;
}

export async function rotationStatus(
  exec: SqlExecutor,
  year: number,
  floor = 0.2,
): Promise<RotationStatus> {
  const active = Number(
    (
      (
        await exec.query(
          `select count(*)::int n from benchmark_corpus_drafts
             where is_dev_set = false and retired_at is null`,
        )
      ).rows[0] as { n: number }
    ).n,
  );
  const rotated = Number(
    (
      (
        await exec.query(
          `select count(*)::int n from benchmark_corpus_drafts
             where is_dev_set = false and rotation_year = $1`,
          [year],
        )
      ).rows[0] as { n: number }
    ).n,
  );
  const fraction = active === 0 ? 0 : rotated / active;
  return { activeCount: active, rotatedInYear: rotated, fraction, meetsFloor: fraction >= floor };
}
