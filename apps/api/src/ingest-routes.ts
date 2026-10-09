// The P1.15 ingestion routes (§9.5; REQ-INGEST-1..16). The Sources pane's link/discover/confirm/
// sync/remove flows, the item preview + version history + raw-bytes read (the quality drawer's
// side-by-side), the priced reconstruction enqueues, and the voice delete.
//
// NEVER-COOKIES (AC-I-B) is structural on this surface: the request schemas carry NO credential
// field — no cookie, no session token, no auth header passthrough exists to smuggle in. Every
// remote byte rides `deps.fetcher` (the operator-owned fetcher service — SSRF/robots/rate-limited)
// and every parse rides `deps.converter` (the convert Job). A missing seam answers 501/503 rather
// than degrading to a server-side direct fetch.

import { Hono } from "hono";
import { parseQuarantineKey } from "@rhema/contracts";
import {
  createProviderRegistry,
  normalizeItemUrl,
  sqlSyncStore,
  substackOrigin,
  syncConnection,
  checkBatchSize,
  sampleCaps,
  type BlobPort,
  type ConvertPort,
  type DiscoveredDraft,
  type FetchPort,
  type Provider,
  type SyncReport,
} from "@rhema/ingest";
import type { ContentStore } from "@rhema/mirror";
import type { Queue } from "@rhema/orchestrator";
import type { Principal } from "./run-routes.js";
import type { Converter } from "./import.js";
import { logApiRouteError } from "./observability.js";

/** The pg-boss queues the ingestion worker consumes (registered in apps/worker/src/main.ts). */
export const INGEST_JOBS = {
  sync: "ingest.sync",
  reconstruct: "ingest.reconstruct",
  voicePurge: "voice.purge",
} as const;

/** Priced-tier estimates (§9.5 — shown before the run: "~4 credits" text / "~180 credits" visual). */
export const RECONSTRUCT_PRICING = {
  text: { estimateCredits: 4, capCredits: 8 },
  visual: { estimateCredits: 180, capCredits: 240 },
} as const;

/** The quarantine byte seam (the user-content bucket — uploads AND the export zip live there). */
export interface IngestBlobs {
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
}

export interface IngestApiDeps {
  readonly principal: (c: { req: { header(name: string): string | undefined } }) => Principal | null;
  readonly txRunner: {
    run<T>(workspaceId: string, fn: (tx: {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    }) => Promise<T>): Promise<T>;
  };
  readonly ids: (prefix: string) => string;
  readonly clock?: () => Date;
  /** pg-boss send — sync/reconstruct/purge ride it (unset ⇒ the mutating routes answer 503). */
  readonly queue?: Queue;
  /** The operator-owned fetcher seam — bound to the fetcher Cloud Run service in prod. */
  readonly fetcher?: FetchPort;
  /** Quarantine bytes — export-zip reads + fetched-body writes land here. */
  readonly ingestBlobs?: IngestBlobs;
  /** The PRB.02 convert seam (quarantine key → ConversionResult). */
  readonly converter?: Converter;
  /** Canonical-document + raw-byte persistence (the workspace content store). */
  readonly contentStoreFor?: (workspaceId: string) => Promise<ContentStore> | ContentStore;
  /** Test/dev binding: run the sync inline inside the request instead of queueing (prod leaves it
   *  unset — the worker owns the pass). */
  readonly inlineSync?: boolean;
}

const PROVIDERS = createProviderRegistry();

const safeKey = (v: unknown, workspaceId: string): string | null =>
  parseQuarantineKey(v, workspaceId) ? (v as string) : null;

/** Adapt the quarantine-write + convert-preview pair into the ingest ConvertPort. */
function quarantineConvertPort(
  blobs: IngestBlobs,
  converter: Converter,
  workspaceId: string,
  ids: (p: string) => string,
): ConvertPort {
  return {
    async convert(bytes) {
      const key = `quarantine/${workspaceId}/${ids("fq")}`;
      await blobs.write(key, bytes);
      const pv = await converter.preview(key, { waitMs: 25_000 });
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

/** A byte sink over the workspace content store (canonical docs) or quarantine (raw originals). */
const contentStoreSink = (cs: ContentStore, workspaceId: string) => ({
  async put(sha256: string, bytes: Uint8Array): Promise<string> {
    const { key } = await cs.put(workspaceId, sha256, bytes);
    return key;
  },
});
const quarantineSink = (blobs: IngestBlobs) => ({
  async put(sha256: string, bytes: Uint8Array): Promise<string> {
    const key = `ingest-originals/${sha256}`;
    await blobs.write(key, bytes);
    return key;
  },
});

export function createIngestRoutes(deps: IngestApiDeps): Hono {
  const app = new Hono();
  const blobPort: BlobPort | undefined = deps.ingestBlobs
    ? { read: (key) => deps.ingestBlobs!.read(key) }
    : undefined;

  const personaOr404 = async (
    tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    personaId: string,
  ) => {
    const res = await tx.query(`select id from personas where id = $1 and deleted_at is null`, [personaId]);
    return (res.rows[0] as { id: string } | undefined) ?? null;
  };

  const loadConn = async (
    tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    personaId: string,
    connectionId: string,
  ) => {
    const res = await tx.query(
      `select id, persona_id, provider, handle, auto_include_new, schedule
         from connections where id = $1 and persona_id = $2 and removed_at is null`,
      [connectionId, personaId],
    );
    return (res.rows[0] as
      | { id: string; persona_id: string; provider: string; handle: string | null;
          auto_include_new: boolean | null; schedule: string | null }
      | undefined) ?? null;
  };

  /** Run one sync pass inline (the discover→confirm→fetch→version engine) over the live seams. */
  const runSync = async (
    workspaceId: string,
    personaId: string,
    conn: { id: string; provider: string; handle: string | null; auto_include_new: boolean | null; schedule: string | null },
    opts?: { auto?: boolean },
  ): Promise<SyncReport | { error: string }> => {
    const provider = PROVIDERS.get(conn.provider as never) as Provider | undefined;
    if (!provider) return { error: `unknown provider ${conn.provider}` };
    if (!deps.fetcher) return { error: "fetcher_unavailable" };
    if (!deps.ingestBlobs || !deps.converter) return { error: "converter_unavailable" };
    const cs = await deps.contentStoreFor?.(workspaceId);
    if (!cs) return { error: "content_store_unavailable" };
    const convert = quarantineConvertPort(deps.ingestBlobs, deps.converter, workspaceId, deps.ids);
    return deps.txRunner.run(workspaceId, async (tx) =>
      syncConnection(
        {
          id: conn.id,
          provider: conn.provider as never,
          handle: conn.handle,
          autoIncludeNew: conn.auto_include_new ?? undefined,
          schedule: conn.schedule,
        },
        provider,
        {
          fetch: deps.fetcher!,
          blobs: blobPort,
          convert,
          store: sqlSyncStore({
            tx,
            ids: deps.ids,
            personaId,
            workspaceId,
            bytes: contentStoreSink(cs, workspaceId),
            originalBytes: quarantineSink(deps.ingestBlobs!),
            actor: { kind: "system", role: "ingest" },
          }),
          now: deps.clock ?? (() => new Date()),
        },
        opts,
      ),
    );
  };

  // ---- GET /voices/:id/connections — the Sources pane list (provider + status + last sync + the
  //  verbatim error line + per-source item counts). Removed sources drop out (rows stay). ----
  app.get("/voices/:id/connections", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, personaId))) return null;
      const rows = await tx.query(
        `select cn.id, cn.provider, cn.handle, cn.status, cn.last_sync_at, cn.schedule,
                cn.auto_include_new, cn.error,
                count(di.id) as items,
                count(di.id) filter (where di.state in ('included','removed_remote')) as included
           from connections cn
           left join discovered_items di on di.connection_id = cn.id
          where cn.persona_id = $1 and cn.removed_at is null
          group by cn.id order by cn.id`,
        [personaId],
      );
      return rows.rows;
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    return c.json({ connections: res });
  });

  // ---- POST /voices/:id/connections — link a source. The body carries a handle/quarantine key and
  //  NOTHING credential-shaped: there is no field to put a cookie or token in (AC-I-B). ----
  app.post("/voices/:id/connections", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      provider?: string;
      handle?: string;
      url?: string;
      quarantineKey?: string;
      autoIncludeNew?: boolean;
      dailySync?: boolean;
    };
    const provider = body.provider;
    if (provider !== "substack" && provider !== "substack_export" && provider !== "url") {
      return c.json({ error: "provider must be substack | substack_export | url" }, 400);
    }
    let handle: string;
    if (provider === "substack") {
      const origin = substackOrigin(body.handle ?? body.url ?? "");
      if (!origin) return c.json({ error: "a publication address like name.substack.com is required" }, 400);
      handle = origin;
    } else if (provider === "url") {
      const url = normalizeItemUrl(body.url ?? body.handle ?? "");
      if (!url) return c.json({ error: "a public http(s) url is required" }, 400);
      handle = url;
    } else {
      const key = safeKey(body.quarantineKey, principal.workspaceId);
      if (!key) return c.json({ error: "a quarantineKey for the export zip is required" }, 400);
      handle = key;
    }
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, personaId))) return null;
      const id = deps.ids("cn");
      await tx.query(
        `insert into connections (id, persona_id, provider, handle, status, auto_include_new, schedule)
           values ($1,$2,$3,$4,'ok',$5,$6)`,
        [
          id,
          personaId,
          provider,
          handle,
          body.autoIncludeNew !== false,
          body.dailySync === true ? "daily" : null,
        ],
      );
      return { connectionId: id, provider, handle };
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    return c.json(res, 201);
  });

  // ---- POST /voices/:id/connections/:cid/discover — the review step: discovery rows ONLY, never
  //  bodies (REQ-INGEST-3). Each row carries the proposed state the confirm screen defaults to. ----
  app.post("/voices/:id/connections/:cid/discover", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const connectionId = c.req.param("cid");
    if (!deps.fetcher) return c.json({ error: "fetcher_unavailable" }, 503);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, personaId))) return { error: "not_found" as const };
      const conn = await loadConn(tx, personaId, connectionId);
      if (!conn) return { error: "not_found" as const };
      const provider = PROVIDERS.get(conn.provider as never) as Provider | undefined;
      if (!provider) return { error: "unknown_provider" as const };
      if (!provider.hasDiscovery) return { error: "no_discovery" as const };
      let drafts: DiscoveredDraft[];
      try {
        drafts = await provider.discover(
          {
            id: conn.id,
            provider: conn.provider as never,
            handle: conn.handle,
            autoIncludeNew: conn.auto_include_new ?? undefined,
            schedule: conn.schedule,
          },
          { fetch: deps.fetcher!, blobs: blobPort },
        );
      } catch (e) {
        const pe = (e ?? {}) as { message?: string; remedy?: string };
        // Verbatim provider message + remedy, persisted on the connection (REQ-INGEST-11).
        const line = `${pe.message ?? String(e)} — ${pe.remedy ?? "Retry the sync"}`;
        await tx.query(`update connections set error = $2 where id = $1`, [conn.id, line]);
        return { error: "provider_error" as const, message: pe.message ?? String(e), remedy: pe.remedy ?? "Retry" };
      }
      // Upsert the discovery rows (listing data only — NEVER a body, REQ-INGEST-3). A new row's
      // state is the connection's default policy: free + auto-include ⇒ 'included'; paid/unknown ⇒
      // 'omitted' (the export CTA); otherwise 'new' awaiting the confirm click. Existing rows keep
      // their state (a user's omit decision survives re-discovery).
      const auto = conn.auto_include_new ?? true;
      for (const d of drafts) {
        const proposed = d.access === "free" ? (auto ? "included" : "new") : "omitted";
        await tx.query(
          `insert into discovered_items
             (id, connection_id, external_id, title, url, date, word_count, access, remote_change_key, state)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             on conflict do nothing`,
          [deps.ids("di"), conn.id, d.externalId, d.title, d.url, d.date, d.wordCount, d.access, d.remoteChangeKey, proposed],
        );
        // Refresh the listing fields + key on the row the upsert matched by external_id.
        await tx.query(
          `update discovered_items
              set title = $3, url = $4, date = $5, word_count = $6, access = $7, remote_change_key = $8
            where connection_id = $1 and external_id = $2`,
          [conn.id, d.externalId, d.title, d.url, d.date, d.wordCount, d.access, d.remoteChangeKey],
        );
      }
      const known = await tx.query(
        `select id, external_id, state, title, url, date, word_count, access, remote_change_key
           from discovered_items where connection_id = $1 order by date desc nulls last, id`,
        [conn.id],
      );
      return { items: known.rows };
    });
    if ("error" in res) {
      if (res.error === "not_found") return c.json({ error: "not_found" }, 404);
      if (res.error === "provider_error") {
        // OBS.1 — the classified provider failure is a user-visible 502: its one structured line.
        logApiRouteError(c, undefined, { status: 502, upstreamCode: "provider_error", msg: "ingest_provider_failed" });
        return c.json(res, 502);
      }
      return c.json(res, 422);
    }
    return c.json(res);
  });

  // ---- POST /voices/:id/connections/:cid/confirm — persist the reviewed include/omit set, then
  //  run the fetch pass (queued in prod; inline when the seam is bound). Confirmation precedes ANY
  //  body fetch (REQ-INGEST-4). ----
  app.post("/voices/:id/connections/:cid/confirm", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const connectionId = c.req.param("cid");
    const body = (await c.req.json().catch(() => ({}))) as {
      items?: { externalId?: string; include?: boolean }[];
    };
    const chosen = new Map(
      (body.items ?? [])
        .filter((i) => typeof i.externalId === "string")
        .map((i) => [i.externalId!, i.include === true]),
    );
    const prep = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, personaId))) return null;
      const conn = await loadConn(tx, personaId, connectionId);
      if (!conn) return null;
      return conn;
    });
    if (!prep) return c.json({ error: "not_found" }, 404);

    if (deps.inlineSync) {
      // Persist the confirm states, then run the engine inline: the engine re-discovers, creates
      // missing items with their defaults, then fetches what 'included' marks. The explicit choices
      // land first so the engine sees them as already-known states.
      await deps.txRunner.run(principal.workspaceId, async (tx) => {
        for (const [externalId, include] of chosen) {
          await tx.query(
            `update discovered_items set state = $3 where connection_id = $1 and external_id = $2`,
            [connectionId, externalId, include ? "included" : "omitted"],
          );
        }
      });
      const report = await runSync(principal.workspaceId, personaId, prep);
      if ("error" in report) return c.json(report, 503);
      return c.json({ report }, 200);
    }
    if (!deps.queue) return c.json({ error: "queue_unavailable" }, 503);
    await deps.queue.send(
      INGEST_JOBS.sync,
      { connectionId, personaId, workspaceId: principal.workspaceId, confirm: Object.fromEntries(chosen) },
      { singletonKey: `ingest:${connectionId}` },
    );
    return c.json({ queued: true, connectionId }, 202);
  });

  // ---- POST /voices/:id/connections/:cid/sync — the manual Re-sync (REQ-INGEST-6; the daily
  //  schedule rides the worker cron with auto:true — never auto-includes). ----
  app.post("/voices/:id/connections/:cid/sync", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const connectionId = c.req.param("cid");
    const conn = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, personaId))) return null;
      return loadConn(tx, personaId, connectionId);
    });
    if (!conn) return c.json({ error: "not_found" }, 404);
    if (deps.inlineSync) {
      const report = await runSync(principal.workspaceId, personaId, conn);
      if ("error" in report) return c.json(report, 503);
      return c.json({ report });
    }
    if (!deps.queue) return c.json({ error: "queue_unavailable" }, 503);
    await deps.queue.send(
      INGEST_JOBS.sync,
      { connectionId, personaId, workspaceId: principal.workspaceId },
      { singletonKey: `ingest:${connectionId}` },
    );
    return c.json({ queued: true }, 202);
  });

  // ---- POST /voices/:id/sync — "Re-sync all" (§9.5): one job per live connection. ----
  app.post("/voices/:id/sync", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const conns = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, personaId))) return null;
      const res = await tx.query(
        `select cn.id, cn.persona_id, cn.provider, cn.handle, cn.auto_include_new, cn.schedule
           from connections cn
           join discovered_items di on di.connection_id = cn.id
          where cn.persona_id = $1 and cn.removed_at is null and cn.provider in ('substack','substack_export','url')
          group by cn.id`,
        [personaId],
      );
      return res.rows as {
        id: string; persona_id: string; provider: string; handle: string | null;
        auto_include_new: boolean | null; schedule: string | null;
      }[];
    });
    if (conns === null) return c.json({ error: "not_found" }, 404);
    if (deps.inlineSync) {
      const reports = [];
      for (const conn of conns) {
        const r = await runSync(principal.workspaceId, personaId, conn);
        reports.push(r);
      }
      return c.json({ reports });
    }
    if (!deps.queue) return c.json({ error: "queue_unavailable" }, 503);
    for (const conn of conns) {
      await deps.queue.send(
        INGEST_JOBS.sync,
        { connectionId: conn.id, personaId, workspaceId: principal.workspaceId },
        { singletonKey: `ingest:${conn.id}` },
      );
    }
    return c.json({ queued: conns.length }, 202);
  });

  // ---- PATCH /voices/:id/connections/:cid — the per-source settings (auto-include new items;
  //  daily auto-sync on/off). ----
  app.patch("/voices/:id/connections/:cid", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      autoIncludeNew?: boolean;
      dailySync?: boolean;
    };
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, c.req.param("id")))) return null;
      const upd = await tx.query(
        `update connections
            set auto_include_new = coalesce($3, auto_include_new),
                schedule = case when $4::boolean is null then schedule
                                when $4::boolean then 'daily' else null end
          where id = $1 and persona_id = $2 and removed_at is null
          returning id`,
        [c.req.param("cid"), c.req.param("id"), body.autoIncludeNew ?? null, body.dailySync ?? null],
      );
      return upd.rows[0] ?? null;
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  // ---- DELETE /voices/:id/connections/:cid — Remove: soft-detach the source (items + versions
  //  stay — unlinking never destroys corpus). P1.20 (REQ-ACCT-2): the credential drops in the SAME
  //  write — `auth_ref` nulls immediately; the samples remain unless separately removed. ----
  app.delete("/voices/:id/connections/:cid", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, c.req.param("id")))) return null;
      const upd = await tx.query(
        `update connections set removed_at = now(), status = 'removed', auth_ref = null
          where id = $1 and persona_id = $2 and removed_at is null returning id`,
        [c.req.param("cid"), c.req.param("id")],
      );
      return upd.rows[0] ?? null;
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  // ---- GET /voices/:id/samples/:itemId — the read-only preview: the canonical document plus the
  //  listing facts the drawer shows (state, access, quality, notes, version count). ----
  app.get("/voices/:id/samples/:itemId", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, c.req.param("id")))) return null;
      const item = (
        await tx.query(
          `select di.id, di.external_id, di.title, di.url, di.date, di.word_count, di.access, di.state,
                  di.remote_change_key, di.current_sample_id, cn.provider, cn.id as connection_id
             from discovered_items di join connections cn on cn.id = di.connection_id
            where di.id = $1 and cn.persona_id = $2`,
          [c.req.param("itemId"), c.req.param("id")],
        )
      ).rows[0] as
        | { id: string; external_id: string | null; title: string | null; url: string | null;
            date: string | null; word_count: number | null; access: string | null; state: string;
            remote_change_key: string | null; current_sample_id: string | null; provider: string;
            connection_id: string }
        | undefined;
      if (!item) return null;
      const versions = (
        await tx.query(
          `select id, n, content_sha256, original_sha256, original_key, quality, quality_notes, word_count
             from sample_versions where discovered_item_id = $1 order by n desc`,
          [item.id],
        )
      ).rows;
      let document: string | null = null;
      const head = (versions[0] ?? null) as
        | { content_sha256: string; artifact_version_id?: string } & Record<string, unknown>
        | null;
      const headRow = item.current_sample_id
        ? (versions.find((v) => (v as { id: string }).id === item.current_sample_id) ?? head)
        : null;
      const cs = await deps.contentStoreFor?.(principal.workspaceId);
      if (headRow && cs) {
        const sha = (headRow as { content_sha256: string }).content_sha256;
        const bytes = await cs.get(sha).catch(() => null);
        if (bytes) document = new TextDecoder().decode(bytes);
      }
      return { item, versions, document };
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    return c.json(res);
  });

  // ---- GET /voices/:id/samples/:itemId/versions — the version history list (v1..vN newest first). ----
  app.get("/voices/:id/samples/:itemId/versions", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, c.req.param("id")))) return null;
      const rows = await tx.query(
        `select sv.id, sv.n, sv.content_sha256, sv.quality, sv.quality_notes, sv.word_count
           from sample_versions sv
           join discovered_items di on di.id = sv.discovered_item_id
           join connections cn on cn.id = di.connection_id
          where sv.discovered_item_id = $1 and cn.persona_id = $2
          order by sv.n desc`,
        [c.req.param("itemId"), c.req.param("id")],
      );
      return rows.rows;
    });
    if (res === null) return c.json({ error: "not_found" }, 404);
    return c.json({ versions: res });
  });

  // ---- GET /voices/:id/samples/:itemId/raw — the ORIGINAL bytes (PDF page for the side-by-side
  //  pdf.js preview; the drawer's left pane). original_key → quarantine; else content store. ----
  app.get("/voices/:id/samples/:itemId/raw", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, c.req.param("id")))) return null;
      const row = (
        await tx.query(
          `select sv.original_sha256, sv.original_key
             from discovered_items di
             join connections cn on cn.id = di.connection_id
             join sample_versions sv on sv.id = di.current_sample_id
            where di.id = $1 and cn.persona_id = $2`,
          [c.req.param("itemId"), c.req.param("id")],
        )
      ).rows[0] as { original_sha256: string | null; original_key: string | null } | undefined;
      return row ?? null;
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    let bytes: Uint8Array | null = null;
    if (res.original_key && deps.ingestBlobs) {
      bytes = await deps.ingestBlobs.read(res.original_key).catch(() => null);
    }
    if (!bytes && res.original_sha256) {
      const cs = await deps.contentStoreFor?.(principal.workspaceId);
      bytes = (await cs?.get(res.original_sha256).catch(() => null)) ?? null;
    }
    if (!bytes) return c.json({ error: "raw_unavailable" }, 404);
    return new Response(Buffer.from(bytes), {
      headers: { "content-type": "application/octet-stream" },
    });
  });

  // ---- POST /voices/:id/samples/:itemId/reconstruct — the priced pass (REQ-INGEST-10). The drawer
  //  shows the estimate FIRST; this route requires confirmed:true and only runs on non-clean
  //  samples. `tier:'visual'` is the opt-in ~180-credit pass (its own cap). The actual model call
  //  is a metered worker job — never inline, never inside convert. ----
  app.post("/voices/:id/samples/:itemId/reconstruct", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      tier?: string;
      confirmed?: boolean;
    };
    const tier = body.tier === "visual" ? "visual" : "text";
    if (body.confirmed !== true) {
      // The estimate the drawer shows BEFORE the opt-in click.
      return c.json({ error: "confirm_required", ...RECONSTRUCT_PRICING[tier] }, 400);
    }
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (!(await personaOr404(tx, c.req.param("id")))) return null;
      const row = (
        await tx.query(
          `select di.id, di.state, sv.quality
             from discovered_items di
             join connections cn on cn.id = di.connection_id
             left join sample_versions sv on sv.id = di.current_sample_id
            where di.id = $1 and cn.persona_id = $2`,
          [c.req.param("itemId"), c.req.param("id")],
        )
      ).rows[0] as { id: string; state: string; quality: string | null } | undefined;
      return row ?? null;
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    if (res.quality === "clean") {
      return c.json({ error: "already_clean" }, 422);
    }
    if (!deps.queue) return c.json({ error: "queue_unavailable" }, 503);
    await deps.queue.send(
      INGEST_JOBS.reconstruct,
      {
        itemId: c.req.param("itemId"),
        personaId: c.req.param("id"),
        workspaceId: principal.workspaceId,
        tier,
        estimateCredits: RECONSTRUCT_PRICING[tier].estimateCredits,
        capCredits: RECONSTRUCT_PRICING[tier].capCredits,
      },
      { singletonKey: `reconstruct:${c.req.param("itemId")}:${tier}` },
    );
    return c.json({ queued: true, ...RECONSTRUCT_PRICING[tier] }, 202);
  });

  // ---- DELETE /voices/:id — delete the voice (REQ-INGEST-16): stamp deleted_at so the persona
  //  vanishes from every read, then the voice.purge job cascades owned rows (samples, raw bytes,
  //  profiles, corrections). Forked house-style samples are references to artifact rows the FORK
  //  owns — the cascade only touches persona-owned rows, so forks survive. ----
  app.delete("/voices/:id", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const personaId = c.req.param("id");
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const upd = await tx.query(
        `update personas set deleted_at = now() where id = $1 and deleted_at is null returning id`,
        [personaId],
      );
      return upd.rows[0] ?? null;
    });
    if (!res) return c.json({ error: "not_found" }, 404);
    if (deps.queue) {
      await deps.queue.send(INGEST_JOBS.voicePurge, {
        personaId,
        workspaceId: principal.workspaceId,
      });
    }
    return c.json({ deleted: true, personaId });
  });

  return app;
}

/** Shared batch/quality-caps helper for POST /voices/:id/samples (kept here so voice-routes stays
 *  focused): over-cap/unreadable uploads still list as auto-omitted items (REQ-INGEST-8). */
export { checkBatchSize, sampleCaps };
