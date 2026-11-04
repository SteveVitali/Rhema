// P1.15 — the ingestion worker jobs (§9.5; §12.1 "worker owns sync/reconstruction/purge").
//
//   ingest.sync          one Connection through the discover→diff→fetch→version engine
//                        (`syncConnection` over @rhema/ingest; confirm-map state edits apply first).
//   ingest.sync.sweep    the daily auto-sync cron: schedule='daily' connections re-sync with
//                        auto:true — auto-sync NEVER auto-includes new items (REQ-INGEST-7).
//   ingest.reconstruct   the priced PDF pass (REQ-INGEST-10): metered debit → model seam → new
//                        sample version (quality 'reconstructed'). `tier:'visual'` is the opt-in
//                        ~180-credit pass with its own cap; the model call is a separate metered
//                        operation — NEVER inside convert (F41).
//   voice.purge          the voice-delete cascade (REQ-INGEST-16): a deleted persona's owned rows —
//                        samples, versions, artifacts, raw-byte keys, profiles, corrections — go
//                        inside the retention window; forked house-style samples survive because
//                        the cascade only touches rows the persona OWNS (a fork's corpus copies live
//                        under the fork's own connection/artifact rows).
//
// Every remote byte rides `deps.fetcher` (the operator-owned fetcher service); every parse rides
// `deps.converter` (the convert Job). The seams are all injectable — prod binds the live services,
// tests drive the handlers in-process over PGlite.

import {
  applyReconstruction,
  loadConnection,
  providerFor,
  createProviderRegistry,
  sqlSyncStore,
  syncConnection,
  type ConvertPort,
  type FetchPort,
  type SyncReport,
} from "@rhema/ingest";
import type { ContentStore } from "@rhema/mirror";
import type { Queue, SqlClient, TxRunner } from "@rhema/orchestrator";
import { applyLedgerEntry, type EntryDeps, type HoldBucket } from "@rhema/ledger";
import type { ConversionResult } from "@rhema/contracts";

export const INGEST_JOB_NAMES = {
  sync: "ingest.sync",
  syncSweep: "ingest.sync.sweep",
  reconstruct: "ingest.reconstruct",
  voicePurge: "voice.purge",
} as const;

export interface IngestSyncJobPayload {
  readonly connectionId: string;
  readonly personaId: string;
  readonly workspaceId: string;
  /** The confirm step's include/omit choices, applied before the diff runs. */
  readonly confirm?: Record<string, boolean>;
  /** Auto (scheduled) pass — never auto-includes new items (REQ-INGEST-7). */
  readonly auto?: boolean;
}

export interface IngestReconstructJobPayload {
  readonly itemId: string;
  readonly personaId: string;
  readonly workspaceId: string;
  readonly tier: "text" | "visual";
  readonly estimateCredits: number;
  readonly capCredits: number;
}

export interface VoicePurgeJobPayload {
  readonly personaId: string;
  readonly workspaceId: string;
}

/** The quarantine/user-content byte seam (reads the export zip + fetched originals; writes fetched
 *  bodies for the convert Job). */
export interface IngestBlobStore {
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  /** voice.purge deletes retained raw bytes — unset ⇒ byte cleanup is deferred (rows still go). */
  delete?(key: string): Promise<void>;
}

/** The priced-operation debit seam — a canonical ledger `hold`+`debit` pair (no run; `source` names the
 *  job in `reason`). A bare debit would be an unheld charge — the exact drift STB.3 measured on prod. */
export interface SampleMeter {
  debit(
    tx: SqlClient,
    args: {
      workspaceId: string;
      credits: number;
      source: string;
      reason: string;
      idempotencyKey: string;
    },
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
}

/** The model seam behind `ingest.reconstruct` — prod binds Anthropic (Secret-Manager key like the
 *  retired walkthrough generator did); tests inject a deterministic fake. */
export interface Reconstructor {
  /** True when the seam consumes the raw PDF bytes itself (a document block) — then the visual tier
   *  needs no `pageImages` raster. False/absent ⇒ visual jobs require `deps.pageImages`. */
  readonly acceptsDocumentBytes?: boolean;
  reconstruct(args: {
    tier: "text" | "visual";
    extractedText: string;
    title: string;
    notes: readonly string[];
    /** The raw source bytes — the visual tier renders pages from these. */
    originalBytes?: Uint8Array;
    /** Pre-rendered page images for the visual tier (prod: pdf.js raster). */
    pageImages?: readonly Uint8Array[];
  }): Promise<{ markdown: string }>;
}

/** Priced-pass model tiers (§9.5): the ~4-credit text pass rides the base tier; the opt-in ~180-credit
 *  visual pass rides a vision-capable mid tier (PDF document blocks, no raster step needed). */
const RECONSTRUCT_MODEL = { text: "claude-haiku-4-5", visual: "claude-sonnet-5" } as const;
const RECONSTRUCT_MAX_TOKENS = 16_000;

/** The deploy-bound Reconstructor: POST /v1/messages — text tier sends the degraded extraction +
 *  the fix brief; the visual tier sends the raw PDF as a `document` block (the provider API reads
 *  PDFs natively, so no page rasterization is needed). Server-side only; the prompt never reaches a
 *  payload. Same posture the retired AnthropicWalkthroughGenerator had (Secret-Manager key, one call). */
export class AnthropicReconstructor implements Reconstructor {
  readonly acceptsDocumentBytes = true;
  // never-cookies note: `apiKey` is the WORKER's own egress model key (Secret Manager), not a
  // connector credential — no user-supplied cookie/session ever reaches this surface (AC-I-B).
  constructor(
    private readonly args: { readonly apiKey: string; readonly baseUrl?: string }, // AC-I-B: model key, not a connector credential
  ) {}

  async reconstruct(a: Parameters<Reconstructor["reconstruct"]>[0]): Promise<{ markdown: string }> {
    const base = this.args.baseUrl ?? "https://api.anthropic.com";
    const model = RECONSTRUCT_MODEL[a.tier];
    const instruction =
      a.tier === "visual"
        ? [
            `Reconstruct this PDF ("${a.title}") as clean markdown prose.`,
            "Preserve the document's own order, wording, and footnotes ([^n] form). No commentary,",
            "no invented content — if a passage is illegible, mark it [unreadable].",
            ...(a.notes.length > 0 ? [`Known extraction notes: ${a.notes.join("; ")}`] : []),
          ].join("\n")
        : [
            `Repair this extracted PDF text ("${a.title}") into clean markdown prose.`,
            "Fix extraction artifacts only — broken words, dropped spaces, garbled spans. Preserve",
            "order, wording, and footnotes ([^n] form). Never invent content.",
            ...(a.notes.length > 0 ? [`Known extraction notes: ${a.notes.join("; ")}`] : []),
            "",
            "Extracted text:",
            a.extractedText.slice(0, 120_000),
          ].join("\n");
    const content: Record<string, unknown>[] =
      a.tier === "visual" && a.originalBytes
        ? [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: Buffer.from(a.originalBytes).toString("base64"),
              },
            },
            { type: "text", text: instruction },
          ]
        : [{ type: "text", text: instruction }];
    const res = await fetch(`${base}/v1/messages`, {
      method: "post",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.args.apiKey, // the egress model key — not a connector credential (AC-I-B)
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model,
        max_tokens: RECONSTRUCT_MAX_TOKENS,
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) throw new Error(`reconstruct model call failed: ${res.status}`);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const markdown = (body.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    return { markdown };
  }
}

export interface WorkerIngestDeps {
  readonly txRunner: TxRunner;
  readonly ids: (prefix: string) => string;
  readonly clock: { now(): Date };
  readonly queue?: Queue;
  readonly fetcher?: FetchPort;
  readonly ingestBlobs?: IngestBlobStore;
  readonly converter?: {
    preview(key: string, opts?: { waitMs?: number }): Promise<ConversionResult | null>;
  };
  readonly contentStoreFor?: (workspaceId: string) => Promise<ContentStore> | ContentStore;
  readonly meter?: SampleMeter;
  readonly reconstructor?: Reconstructor;
  /** The visual tier's page raster (prod binds a pdf.js renderer; unset ⇒ visual jobs refuse). */
  readonly pageImages?: (pdfBytes: Uint8Array) => Promise<Uint8Array[]>;
  /** Client-side pacing on top of the fetcher service's ≤1 req/s/host (default 1100 ms). */
  readonly minFetchIntervalMs?: number;
}

const REGISTRY = createProviderRegistry();

/** The fixed-price debit for a metered sample op — SQL impl bound in prod; tests inject a fake.
 *
 *  DEF.2/F4: this writes through `applyLedgerEntry` — the ONLY path allowed to touch `credit_balances`
 *  — as a `hold` then `debit` pair on the same bucket, in the caller's transaction. The pair is the
 *  canonical "reserve, then spend" for a fixed-price op with no run: `hold` moves available → held,
 *  `debit` spends the held amount (net: available −credits, held ±0, ledger-foldable). The previous
 *  bare `debit` row + direct `available -= credits` bypassed `balanceEffect` — the fold attributes a
 *  `debit` to `held`, so every op drifted the counter against the ledger (STB.3's −897) — and would
 *  trip the `credit_balances.held >= 0` invariant (0044). */
export const sqlSampleMeter: (deps: EntryDeps) => SampleMeter = (deps) => ({
  async debit(tx, args) {
    const ws = (
      await tx.query(`select billing_account_id from workspaces where id = $1`, [args.workspaceId])
    ).rows[0] as { billing_account_id: string } | undefined;
    if (!ws) return { ok: false, reason: "workspace_missing" };
    // Row-lock the billing account BEFORE the headroom read (REQ-SPEC-24.2 ordering — the same guard
    // the canonical hold takes), so two concurrent priced ops cannot both pass the available check and
    // race one over the balance; the check(available >= 0) is the backstop.
    await tx.query("select id from billing_accounts where id = $1 for update", [
      ws.billing_account_id,
    ]);
    // Draw from the first bucket with headroom (included → topup → daily), respecting the
    // credit_balances check(available >= 0).
    const balances = (
      await tx.query(
        `select bucket, available::int as available from credit_balances
           where billing_account_id = $1 order by case bucket when 'included' then 0 when 'topup' then 1 else 2 end`,
        [ws.billing_account_id],
      )
    ).rows as { bucket: string; available: number }[];
    const bucket = balances.find((b) => b.available >= args.credits)?.bucket as
      HoldBucket | undefined;
    if (!bucket) return { ok: false, reason: "insufficient_balance" };
    const entry = {
      workspaceId: args.workspaceId,
      billingAccountId: ws.billing_account_id,
      credits: args.credits,
      bucket,
      source: "system" as const,
      // the job label rides `reason` — `source` is the canonical audit-provenance enum.
      reason: args.reason ? `${args.source}: ${args.reason}` : args.source,
    };
    const hold = await applyLedgerEntry(tx, deps, {
      ...entry,
      kind: "hold",
      idempotencyKey: `${args.idempotencyKey}#hold`,
    });
    // A replayed hold means the pair already committed in an earlier drive — nothing re-charges.
    if (!hold.applied) return { ok: true };
    await applyLedgerEntry(tx, deps, {
      ...entry,
      kind: "debit",
      idempotencyKey: `${args.idempotencyKey}#debit`,
    });
    return { ok: true };
  },
});

/** The convert seam the worker shares with the api: write bytes to quarantine → preview the Job's
 *  ConversionResult (the Job's ONLY write grant is `converted/`; reads come back through GCS). */
export function jobConvertPort(
  blobs: IngestBlobStore,
  converter: { preview(key: string, opts?: { waitMs?: number }): Promise<ConversionResult | null> },
  workspaceId: string,
  ids: (p: string) => string,
): ConvertPort {
  return {
    async convert(bytes) {
      const key = `quarantine/${workspaceId}/${ids("fq")}`;
      await blobs.write(key, bytes);
      // A worker job can wait past the api's 25s bound — but still bounded (the Job is ~2.5–4 min cold).
      const pv = await converter.preview(key, { waitMs: 240_000 });
      if (!pv) throw new Error("conversion_pending");
      return {
        markdown: pv.markdown,
        quality: pv.quality,
        qualityNotes: pv.qualityNotes,
        counts: pv.counts,
      };
    },
  };
}

const contentStoreSink = (cs: ContentStore, workspaceId: string) => ({
  async put(sha256: string, bytes: Uint8Array, _mediaType: string): Promise<string> {
    const { key } = await cs.put(workspaceId, sha256, bytes);
    return key;
  },
});
const quarantineSink = (blobs: IngestBlobStore) => ({
  async put(sha256: string, bytes: Uint8Array, _mediaType: string): Promise<string> {
    const key = `ingest-originals/${sha256}`;
    await blobs.write(key, bytes);
    return key;
  },
});

/** `ingest.sync` — one connection through the engine. Returns the report (never throws on provider
 *  errors — they're recorded on the connection verbatim + remedy). */
export async function handleIngestSync(
  deps: WorkerIngestDeps,
  payload: IngestSyncJobPayload,
): Promise<SyncReport | { error: string }> {
  if (!deps.fetcher) return { error: "fetcher_unavailable" };
  if (!deps.ingestBlobs || !deps.converter) return { error: "converter_unavailable" };
  const cs = await deps.contentStoreFor?.(payload.workspaceId);
  if (!cs) return { error: "content_store_unavailable" };
  return deps.txRunner.run(payload.workspaceId, async (tx) => {
    // The confirm step's include/omit choices land BEFORE the diff (a confirm-then-fetch batch).
    if (payload.confirm) {
      for (const [externalId, include] of Object.entries(payload.confirm)) {
        await tx.query(
          `update discovered_items set state = $3 where connection_id = $1 and external_id = $2`,
          [payload.connectionId, externalId, include ? "included" : "omitted"],
        );
      }
    }
    const conn = await loadConnection(tx, payload.connectionId);
    if (!conn) return { error: "connection_missing" };
    const provider = providerFor(REGISTRY, conn.provider);
    if (!provider) return { error: `unknown_provider ${conn.provider}` };
    return syncConnection(
      conn,
      provider,
      {
        fetch: deps.fetcher!,
        blobs: { read: (key) => deps.ingestBlobs!.read(key) },
        convert: jobConvertPort(deps.ingestBlobs!, deps.converter!, payload.workspaceId, deps.ids),
        store: sqlSyncStore({
          tx,
          ids: deps.ids,
          personaId: payload.personaId,
          workspaceId: payload.workspaceId,
          bytes: contentStoreSink(cs, payload.workspaceId),
          originalBytes: quarantineSink(deps.ingestBlobs!),
          actor: { kind: "system", role: "ingest" },
        }),
        now: () => deps.clock.now(),
        minFetchIntervalMs: deps.minFetchIntervalMs ?? 1100,
      },
      { auto: payload.auto === true },
    );
  });
}

/** `ingest.reconstruct` — the priced pass: metered debit → model → new version (or none when the
 *  body hash is unchanged). `visual` renders pages first (deps.pageImages). */
export async function handleIngestReconstruct(
  deps: WorkerIngestDeps,
  payload: IngestReconstructJobPayload,
): Promise<{ ok: true; newVersion: boolean; quality: string } | { ok: false; reason: string }> {
  if (!deps.reconstructor) return { ok: false, reason: "reconstructor_unconfigured" };
  if (!deps.meter) return { ok: false, reason: "meter_unconfigured" };
  const cs = await deps.contentStoreFor?.(payload.workspaceId);
  if (!cs) return { ok: false, reason: "content_store_unavailable" };
  return deps.txRunner.run(payload.workspaceId, async (tx) => {
    const row = (
      await tx.query(
        `select di.id, di.title, di.url, di.date, di.external_id, di.connection_id, cn.provider,
                sv.id as sv_id, sv.content_sha256, sv.original_sha256, sv.original_key, sv.quality
           from discovered_items di
           join connections cn on cn.id = di.connection_id
           left join sample_versions sv on sv.id = di.current_sample_id
          where di.id = $1 and cn.persona_id = $2`,
        [payload.itemId, payload.personaId],
      )
    ).rows[0] as
      | {
          id: string;
          title: string | null;
          url: string | null;
          date: string | null;
          external_id: string | null;
          connection_id: string;
          provider: string;
          sv_id: string | null;
          content_sha256: string | null;
          original_sha256: string | null;
          original_key: string | null;
          quality: string | null;
        }
      | undefined;
    if (!row || !row.sv_id) return { ok: false, reason: "item_missing" };
    if (row.quality === "clean") return { ok: false, reason: "already_clean" };

    // The metered debit — capped at the shown estimate; an insufficient balance refuses cleanly.
    const debit = await deps.meter!.debit(tx, {
      workspaceId: payload.workspaceId,
      credits: Math.min(payload.estimateCredits, payload.capCredits),
      source: `ingest.reconstruct.${payload.tier}`,
      reason: `sample reconstruction (${payload.tier})`,
      idempotencyKey: `reconstruct:${payload.itemId}:${payload.tier}:${row.sv_id}`,
    });
    if (!debit.ok) return debit;

    // Inputs: the current body text (fix-spans) + the raw bytes (visual tier renders pages).
    const docBytes = row.content_sha256 ? await cs.get(row.content_sha256).catch(() => null) : null;
    const extractedText = docBytes ? new TextDecoder().decode(docBytes) : "";
    let originalBytes: Uint8Array | undefined;
    if (payload.tier === "visual") {
      if (row.original_key && deps.ingestBlobs) {
        originalBytes =
          (await deps.ingestBlobs.read(row.original_key).catch(() => null)) ?? undefined;
      }
      if (!originalBytes && row.original_sha256) {
        originalBytes = (await cs.get(row.original_sha256).catch(() => null)) ?? undefined;
      }
      if (!originalBytes) return { ok: false, reason: "original_bytes_unavailable" };
      // The visual tier needs page images OR a reconstructor that reads the PDF bytes directly.
      if (!deps.pageImages && deps.reconstructor!.acceptsDocumentBytes !== true) {
        return { ok: false, reason: "visual_tier_unconfigured" };
      }
    }
    const pageImages =
      payload.tier === "visual" && originalBytes
        ? await deps.pageImages!(originalBytes)
        : undefined;

    const out = await deps.reconstructor!.reconstruct({
      tier: payload.tier,
      extractedText,
      title: row.title ?? "Untitled",
      notes: [],
      originalBytes,
      pageImages,
    });
    const applied = applyReconstruction({
      tier: payload.tier,
      modelMarkdown: out.markdown,
      prior: {
        id: deps.ids("sv"),
        title: row.title ?? "Untitled",
        date: row.date ?? undefined,
        url: row.url ?? undefined,
        connectionId: row.connection_id,
        externalId: row.external_id ?? undefined,
        originalFormat: "pdf",
        originalSha256: row.original_sha256 ?? "",
        fetchedAt: deps.clock.now(),
      },
    });
    // Dedup by the assembled body hash — an identical reconstruction is the SAME version, not new.
    if (applied.document.contentSha256 === row.content_sha256) {
      return { ok: true, newVersion: false, quality: applied.quality };
    }
    const store = sqlSyncStore({
      tx,
      ids: deps.ids,
      personaId: payload.personaId,
      workspaceId: payload.workspaceId,
      bytes: contentStoreSink(cs, payload.workspaceId),
      ...(deps.ingestBlobs ? { originalBytes: quarantineSink(deps.ingestBlobs) } : {}),
      actor: { kind: "system", role: "reconstruct" },
    });
    const n = await store.nextVersionN(row.id);
    await store.writeSample(row.id, n, {
      document: applied.document.document,
      contentSha256: applied.document.contentSha256,
      originalSha256: row.original_sha256 ?? "",
      quality: applied.quality,
      qualityNotes: [`reconstructed via the ${payload.tier} pass`],
      wordCount: applied.document.wordCount,
      originalBytes,
    });
    return { ok: true, newVersion: true, quality: applied.quality };
  });
}

/** `ingest.sync.sweep` — the daily auto-sync: every schedule='daily' connection whose last sync is
 *  ≥23h old gets an `ingest.sync` job with auto:true. Never auto-includes (the engine forces 'new'). */
export async function handleIngestSyncSweep(
  deps: WorkerIngestDeps & { systemExec: SqlClient },
): Promise<{ queued: number }> {
  if (!deps.queue) return { queued: 0 };
  const rows = (
    await deps.systemExec.query(
      `select cn.id, cn.persona_id, p.workspace_id
         from connections cn join personas p on p.id = cn.persona_id
        where cn.schedule = 'daily' and cn.removed_at is null and p.deleted_at is null
          and cn.provider in ('substack','substack_export','url')
          and (cn.last_sync_at is null or cn.last_sync_at < now() - interval '23 hours')`,
    )
  ).rows as { id: string; persona_id: string; workspace_id: string }[];
  for (const r of rows) {
    await deps.queue.send(
      INGEST_JOB_NAMES.sync,
      { connectionId: r.id, personaId: r.persona_id, workspaceId: r.workspace_id, auto: true },
      { singletonKey: `ingest-auto:${r.id}` },
    );
  }
  return { queued: rows.length };
}

/** `voice.purge` — the delete cascade (REQ-INGEST-16). Only persona-OWNED rows go: forked
 *  house-style samples are references under the fork's own rows and survive. */
export async function handleVoicePurge(
  deps: WorkerIngestDeps & { systemExec: SqlClient },
  payload: VoicePurgeJobPayload,
): Promise<{ purged: boolean; deleted: Record<string, number> }> {
  const deleted: Record<string, number> = {};
  const purged = await deps.txRunner.run(payload.workspaceId, async (tx) => {
    const p = (
      await tx.query(
        `select id, workspace_id from personas where id = $1 and deleted_at is not null`,
        [payload.personaId],
      )
    ).rows[0] as { id: string; workspace_id: string } | undefined;
    if (!p) return false;

    // Collect the byte keys to delete AFTER the rows commit (best-effort object cleanup).
    const rawKeys = (
      await tx.query(
        `select sv.original_key from sample_versions sv
           join discovered_items di on di.id = sv.discovered_item_id
           join connections cn on cn.id = di.connection_id
          where cn.persona_id = $1 and sv.original_key is not null`,
        [payload.personaId],
      )
    ).rows as { original_key: string }[];
    const docKeys = (
      await tx.query(
        `select av.s3_key from artifact_versions av join artifacts a on a.id = av.artifact_id
          where a.persona_id = $1`,
        [payload.personaId],
      )
    ).rows as { s3_key: string | null }[];

    const del = async (label: string, sql: string, params: unknown[], ret = "id") => {
      const r = await tx.query(`${sql} returning ${ret}`, params);
      deleted[label] = r.rows.length;
    };
    // Leaf → root order. samples → items → connections → profiles → artifacts → persona.
    await del(
      "sample_versions",
      `delete from sample_versions where discovered_item_id in
         (select di.id from discovered_items di join connections cn on cn.id = di.connection_id
          where cn.persona_id = $1)`,
      [payload.personaId],
    );
    await del(
      "discovered_items",
      `delete from discovered_items where connection_id in
         (select id from connections where persona_id = $1)`,
      [payload.personaId],
    );
    await del("connections", `delete from connections where persona_id = $1`, [payload.personaId]);
    await del("profile_corrections", `delete from profile_corrections where persona_id = $1`, [
      payload.personaId,
    ]);
    await del("persona_build_notes", `delete from persona_build_notes where persona_id = $1`, [
      payload.personaId,
    ]);
    await del("persona_profiles", `delete from persona_profiles where persona_id = $1`, [
      payload.personaId,
    ]);
    await del(
      "persona_members",
      `delete from persona_members where composite_id = $1 or member_id = $1`,
      [payload.personaId],
      "composite_id",
    );
    await del(
      "artifact_versions",
      `delete from artifact_versions where artifact_id in
         (select id from artifacts where persona_id = $1)`,
      [payload.personaId],
    );
    await del("artifacts", `delete from artifacts where persona_id = $1`, [payload.personaId]);
    await del("personas", `delete from personas where id = $1`, [payload.personaId]);

    // Byte cleanup — the raw originals (quarantine) + canonical docs (content store), best-effort.
    if (deps.ingestBlobs?.delete) {
      for (const k of rawKeys.map((r) => r.original_key)) {
        await deps.ingestBlobs.delete(k).catch(() => undefined);
      }
    }
    deleted["byte_keys"] = rawKeys.length + docKeys.filter((d) => d.s3_key).length;
    return true;
  });
  return { purged, deleted };
}
