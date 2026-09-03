import { createHash } from "node:crypto";
import type { BenchmarkDeps, SqlExecutor } from "./types.js";

// The access-logged corpus enclave (REQ-EVAL-3; AC1). The corpus drafts and gold annotations are a private store
// that is NEVER referenced from a fixture, demo, or marketing path: at the DB layer only the dedicated
// rhema_benchmark role can reach the tables (0013), and at the code layer this store is the ONLY accessor of the
// bytes — and every read it serves first writes a `benchmark_enclave_access_log` row. There is deliberately no
// method that returns enclave bytes without logging: an access that is not logged is not possible through this API.

/** The blob backend (content-addressed by sha256). DI'd so the enclave logic is pure of GCS/S3 — the live GCS
 *  client and `InMemoryEnclaveBlobStore` (testing) both satisfy it. This store is DISTINCT from the tenant
 *  ContentStore (@rhema/mirror): corpus bytes never share a bucket/keyspace with product artifacts (REQ-EVAL-3). */
export interface EnclaveBlobStore {
  get(sha256: string): Promise<Uint8Array | null>;
  put(sha256: string, bytes: Uint8Array): Promise<{ key: string }>;
}

/** In-memory `EnclaveBlobStore` for tests — a Map keyed by sha256. Deterministic; no network. */
export class InMemoryEnclaveBlobStore implements EnclaveBlobStore {
  private readonly blobs = new Map<string, Uint8Array>();

  async get(sha256: string): Promise<Uint8Array | null> {
    return this.blobs.get(sha256) ?? null;
  }

  async put(sha256: string, bytes: Uint8Array): Promise<{ key: string }> {
    this.blobs.set(sha256, bytes);
    return { key: enclaveKeyFor(sha256) };
  }

  /** Test convenience: put UTF-8 text at its own hash. */
  async putText(text: string): Promise<{ sha256: string; key: string }> {
    const sha256 = sha256Hex(text);
    const { key } = await this.put(sha256, Buffer.from(text, "utf8"));
    return { sha256, key };
  }

  has(sha256: string): boolean {
    return this.blobs.has(sha256);
  }

  get size(): number {
    return this.blobs.size;
  }
}

/** The sha256 of some bytes, lower-case hex — the content address. */
export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256")
    .update(typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes)
    .digest("hex");
}

/** The enclave's own keyspace — separate from the tenant `tenants/<ws>/objects/...` layout (REQ-EVAL-3). */
export function enclaveKeyFor(sha256: string): string {
  return `benchmark/enclave/${sha256}`;
}

/** The context recorded on every access-log row — who read, why, and the run/wave it was for. */
export interface AccessContext {
  readonly actor: string;
  readonly purpose?: string;
  readonly waveId?: string;
  readonly runId?: string;
}

/** The result of a logged read: the bytes plus the access-log row id that recorded it. */
export interface EnclaveRead {
  readonly bytes: Uint8Array;
  readonly accessLogId: string;
}

/** A missing draft row, or a dangling blob (a row whose bytes are absent) — a hard error, never a silent empty. */
export class EnclaveContentMissingError extends Error {
  constructor(public readonly draftId: string) {
    super(`benchmark enclave: draft ${draftId} content is missing`);
    this.name = "EnclaveContentMissingError";
  }
}

/**
 * The access-logged enclave. Construct it with the blob backend + deps; every `readDraft`/`readAnnotation` writes
 * an access-log row BEFORE returning bytes, so the log is the complete record of who touched the corpus (AC1).
 */
export class Enclave {
  constructor(
    private readonly store: EnclaveBlobStore,
    private readonly deps: BenchmarkDeps,
  ) {}

  /** Read a corpus draft's bytes, logging the access. Throws if the row or its bytes are missing. */
  async readDraft(exec: SqlExecutor, draftId: string, ctx: AccessContext): Promise<EnclaveRead> {
    const rows = (
      await exec.query(`select content_sha256 from benchmark_corpus_drafts where id = $1`, [draftId])
    ).rows as { content_sha256: string }[];
    const row = rows[0];
    if (!row) throw new EnclaveContentMissingError(draftId);
    // Log FIRST — the audit row exists whether or not the fetch below succeeds (a read was attempted).
    const accessLogId = await this.log(exec, { ...ctx, draftId });
    const bytes = await this.store.get(row.content_sha256);
    if (!bytes) throw new EnclaveContentMissingError(draftId);
    return { bytes, accessLogId };
  }

  /** Read a gold annotation's row (finding + material), logging the access. */
  async readAnnotation(
    exec: SqlExecutor,
    annotationId: string,
    ctx: AccessContext,
  ): Promise<{ finding: unknown; material: boolean; accessLogId: string }> {
    const rows = (
      await exec.query(
        `select id, draft_id, finding, material from benchmark_gold_annotations where id = $1`,
        [annotationId],
      )
    ).rows as { id: string; draft_id: string; finding: unknown; material: boolean }[];
    const row = rows[0];
    if (!row) throw new Error(`benchmark enclave: annotation ${annotationId} not found`);
    const accessLogId = await this.log(exec, { ...ctx, draftId: row.draft_id, annotationId });
    return { finding: row.finding, material: row.material, accessLogId };
  }

  /** Write one access-log row and return its id. The single point every read funnels through. */
  private async log(
    exec: SqlExecutor,
    entry: AccessContext & { draftId?: string; annotationId?: string; action?: "read" | "list" },
  ): Promise<string> {
    const id = this.deps.ids("bmacc");
    await exec.query(
      `insert into benchmark_enclave_access_log
         (id, at, actor, action, draft_id, annotation_id, wave_id, run_id, purpose)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        this.deps.clock.now(),
        entry.actor,
        entry.action ?? "read",
        entry.draftId ?? null,
        entry.annotationId ?? null,
        entry.waveId ?? null,
        entry.runId ?? null,
        entry.purpose ?? null,
      ],
    );
    return id;
  }

  /** Read the access trail for one draft (audit — REQ-EVAL-18's NDA verification path reads this). */
  async accessLogFor(exec: SqlExecutor, draftId: string): Promise<AccessLogRow[]> {
    return (
      await exec.query(
        `select id, at, actor, action, draft_id, annotation_id, wave_id, run_id, purpose
           from benchmark_enclave_access_log where draft_id = $1 order by at, id`,
        [draftId],
      )
    ).rows as AccessLogRow[];
  }
}

export interface AccessLogRow {
  readonly id: string;
  readonly at: Date;
  readonly actor: string;
  readonly action: string;
  readonly draft_id: string | null;
  readonly annotation_id: string | null;
  readonly wave_id: string | null;
  readonly run_id: string | null;
  readonly purpose: string | null;
}
