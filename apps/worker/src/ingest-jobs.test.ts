// P1.15 worker-job tests — the ingest.sync / ingest.reconstruct / ingest.sync.sweep / voice.purge
// handlers driven in-process over the PGlite harness (the chain's deterministic DB-test pattern).
// Every seam is faked: the fetcher port serves fixture bytes, the converter returns a fixed
// ConversionResult, the reconstructor is a deterministic function, the meter is the real SQL impl.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  type OrchestratorTestDb,
} from "@rhema/orchestrator/testing";
import type { ContentStore } from "@rhema/mirror";
import type { ConversionResult } from "@rhema/contracts";
import type { FetchPort, FetchResult } from "@rhema/ingest";
import {
  INGEST_JOB_NAMES,
  handleIngestReconstruct,
  handleIngestSync,
  handleIngestSyncSweep,
  handleVoicePurge,
  sqlSampleMeter,
  type IngestBlobStore,
  type WorkerIngestDeps,
} from "./ingest-jobs.js";

let db: OrchestratorTestDb;
const PAGE = "https://example.com/post";

const PAGE_HTML = `<html><head><title>Fixture Post</title></head><body><article><p>Hello world body</p></article></body></html>`;

const fetcher: FetchPort = {
  async get(url): Promise<FetchResult> {
    if (url !== PAGE) return { ok: false, status: 404, reason: "not found", finalUrl: url };
    return {
      ok: true,
      status: 200,
      finalUrl: url,
      contentType: "text/html",
      headers: { etag: '"v1"' },
      bytes: new TextEncoder().encode(PAGE_HTML),
    };
  },
};

const blobs: IngestBlobStore & { data: Map<string, Uint8Array> } = {
  data: new Map(),
  async read(key) {
    return this.data.get(key) ?? null;
  },
  async write(key, bytes) {
    this.data.set(key, bytes);
  },
  async delete(key) {
    this.data.delete(key);
  },
};

const converterResult: ConversionResult = {
  sourceFormat: "html",
  markdown: "Hello world body",
  counts: { words: 3, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
  warnings: [],
  unconverted: [],
  quality: "partial",
  qualityNotes: [],
};

const converter = { preview: async () => converterResult };

const contentStore = (): ContentStore & { data: Map<string, Uint8Array> } => {
  const data = new Map<string, Uint8Array>();
  return {
    data,
    async get(sha256) {
      return data.get(sha256) ?? null;
    },
    async put(_ws, sha256, bytes) {
      data.set(sha256, bytes);
      return { key: `objects/${sha256}` };
    },
  };
};

let idSeq = 0;
const ids = (p: string) => `${p}_${++idSeq}`;
const clock = { now: () => new Date("2026-03-01T00:00:00Z") };

let deps: WorkerIngestDeps & { systemExec: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> } };
let cs: ReturnType<typeof contentStore>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  idSeq = 0;
  blobs.data.clear();
  cs = contentStore();
  await seedProject(db, { draftN: 0 });
  deps = {
    txRunner: db.txRunner,
    systemExec: db.client,
    ids,
    clock,
    fetcher,
    ingestBlobs: blobs,
    converter,
    contentStoreFor: () => cs,
    meter: sqlSampleMeter(ids),
    minFetchIntervalMs: 0,
  };
});
afterEach(() => db.close());

async function seedPersona(personaId = "per_1", deleted = false) {
  await db.pg.query(
    `insert into personas (id, workspace_id, slug, mode, kind) values ($1,'ws_seed',$2,'self','leaf')`,
    [personaId, personaId],
  );
  if (deleted) await db.pg.query(`update personas set deleted_at = now() where id = $1`, [personaId]);
}

async function seedUrlConnection(connectionId = "cn_1", personaId = "per_1", schedule: string | null = null) {
  await db.pg.query(
    `insert into connections (id, persona_id, provider, handle, status, auto_include_new, schedule)
       values ($1,$2,'url',$3,'ok',true,$4)`,
    [connectionId, personaId, PAGE, schedule],
  );
}

const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await db.client.query(sql, params)).rows as T[];

describe("ingest.sync job", () => {
  it("discovers, includes (auto_include_new), fetches, and writes a content-addressed version", async () => {
    await seedPersona();
    await seedUrlConnection();
    const report = await handleIngestSync(deps, {
      connectionId: "cn_1",
      personaId: "per_1",
      workspaceId: "ws_seed",
    });
    expect("error" in report).toBe(false);
    if (!("error" in report)) {
      expect(report.discovered).toBe(1);
      expect(report.added).toBe(1);
      expect(report.newVersions).toBe(1);
      expect(report.errors).toHaveLength(0);
    }
    const items = await q<{ state: string; remote_change_key: string | null; current_sample_id: string | null }>(
      `select state, remote_change_key, current_sample_id from discovered_items where connection_id = 'cn_1'`,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.state).toBe("included");
    expect(items[0]!.remote_change_key).toBe("etag:\"v1\"");
    expect(items[0]!.current_sample_id).not.toBeNull();
    const svs = await q<{ n: number; quality: string; original_key: string | null }>(
      `select n, quality, original_key from sample_versions`,
    );
    expect(svs).toHaveLength(1);
    expect(svs[0]!.quality).toBe("partial");
    const arts = await q<{ kind: string }>(`select kind from artifacts where persona_id = 'per_1'`);
    expect(arts).toHaveLength(1);
    const conn = await q<{ last_sync_at: string | null }>(`select last_sync_at from connections where id = 'cn_1'`);
    expect(conn[0]!.last_sync_at).not.toBeNull();
  });

  it("re-sync with an unchanged body creates NO new version (AC-I-A dedup)", async () => {
    await seedPersona();
    await seedUrlConnection();
    const payload = { connectionId: "cn_1", personaId: "per_1", workspaceId: "ws_seed" };
    await handleIngestSync(deps, payload);
    const second = await handleIngestSync(deps, payload);
    // The url provider has no remote clock — discovery's key is null, so the engine re-fetches and
    // the normalized body hash decides: identical bytes → no new version, no pill change.
    if (!("error" in second)) {
      expect(second.newVersions).toBe(0);
      expect(second.changed).toBe(1);
    }
    expect(await q(`select id from sample_versions`)).toHaveLength(1);
    const item = await q<{ state: string }>(`select state from discovered_items where connection_id = 'cn_1'`);
    expect(item[0]!.state).toBe("included");
  });

  it("applies the confirm map BEFORE the diff (confirm-included items fetch in the same pass)", async () => {
    await seedPersona();
    await seedUrlConnection();
    await db.pg.query(`update connections set auto_include_new = false where id = 'cn_1'`);
    // First pass leaves the item 'new' (no auto-include); the confirm flips it and the SAME job fetches.
    const first = await handleIngestSync(deps, {
      connectionId: "cn_1",
      personaId: "per_1",
      workspaceId: "ws_seed",
    });
    if (!("error" in first)) {
      expect(first.newVersions).toBe(0); // 'new' items are never fetched
    }
    const confirmed = await handleIngestSync(deps, {
      connectionId: "cn_1",
      personaId: "per_1",
      workspaceId: "ws_seed",
      confirm: { [PAGE]: true },
    });
    if (!("error" in confirmed)) {
      expect(confirmed.newVersions).toBe(1);
    }
    expect(await q(`select id from sample_versions`)).toHaveLength(1);
  });

  it("provider discover errors land verbatim on the connection with a remedy", async () => {
    await seedPersona();
    await seedUrlConnection();
    await db.pg.query(`update connections set handle = 'ftp://nope' where id = 'cn_1'`);
    const report = await handleIngestSync(deps, {
      connectionId: "cn_1",
      personaId: "per_1",
      workspaceId: "ws_seed",
    });
    if (!("error" in report)) {
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]!.remedy.length).toBeGreaterThan(0);
    }
    const conn = await q<{ error: string | null }>(`select error from connections where id = 'cn_1'`);
    expect(conn[0]!.error).toContain("invalid url");
  });
});

describe("ingest.reconstruct job", () => {
  async function seedPartialItem() {
    await seedPersona();
    await seedUrlConnection();
    await handleIngestSync(deps, { connectionId: "cn_1", personaId: "per_1", workspaceId: "ws_seed" });
    await db.pg.query(
      `insert into credit_balances (billing_account_id, bucket, available, held)
         values ('ba_seed','included',1000,0)`,
    );
  }
  const itemId = async () =>
    (await q<{ id: string }>(`select id from discovered_items where connection_id = 'cn_1'`))[0]!.id;

  it("debits the shown estimate and writes a 'reconstructed' version", async () => {
    await seedPartialItem();
    const deps2: WorkerIngestDeps = {
      ...deps,
      reconstructor: { reconstruct: async () => ({ markdown: "A repaired body with more words." }) },
    };
    const res = await handleIngestReconstruct(deps2, {
      itemId: await itemId(),
      personaId: "per_1",
      workspaceId: "ws_seed",
      tier: "text",
      estimateCredits: 4,
      capCredits: 4,
    });
    expect(res).toMatchObject({ ok: true, newVersion: true, quality: "reconstructed" });
    const ledger = await q<{ kind: string; credits: number; source: string }>(
      `select kind, credits, source from credit_ledger where workspace_id = 'ws_seed'`,
    );
    expect(ledger).toEqual([
      { kind: "debit", credits: 4, source: "ingest.reconstruct.text" },
    ]);
    const bal = await q<{ available: number }>(
      `select available::int as available from credit_balances where billing_account_id = 'ba_seed' and bucket = 'included'`,
    );
    expect(bal[0]!.available).toBe(996);
    const svs = await q<{ n: number; quality: string }>(
      `select n, quality from sample_versions order by n`,
    );
    expect(svs.map((s) => s.quality)).toEqual(["partial", "reconstructed"]);
  });

  it("an identical reconstruction writes NO new version (dedup on body hash)", async () => {
    await seedPartialItem();
    const deps2: WorkerIngestDeps = {
      ...deps,
      reconstructor: { reconstruct: async () => ({ markdown: "Hello world body" }) },
    };
    const res = await handleIngestReconstruct(deps2, {
      itemId: await itemId(),
      personaId: "per_1",
      workspaceId: "ws_seed",
      tier: "text",
      estimateCredits: 4,
      capCredits: 4,
    });
    expect(res).toMatchObject({ ok: true, newVersion: false });
    expect(await q(`select id from sample_versions`)).toHaveLength(1);
  });

  it("refuses cleanly on an insufficient balance — no version, no debit", async () => {
    await seedPartialItem();
    await db.pg.query(`update credit_balances set available = 0 where billing_account_id = 'ba_seed'`);
    const deps2: WorkerIngestDeps = {
      ...deps,
      reconstructor: { reconstruct: async () => ({ markdown: "new" }) },
    };
    const res = await handleIngestReconstruct(deps2, {
      itemId: await itemId(),
      personaId: "per_1",
      workspaceId: "ws_seed",
      tier: "text",
      estimateCredits: 4,
      capCredits: 4,
    });
    expect(res).toMatchObject({ ok: false, reason: "insufficient_balance" });
    expect(await q(`select id from sample_versions`)).toHaveLength(1);
    expect(await q(`select id from credit_ledger`)).toHaveLength(0);
  });
});

describe("ingest.sync.sweep job", () => {
  it("queues auto-sync for stale daily connections — never for deleted personas", async () => {
    const sent: { name: string; payload: Record<string, unknown> }[] = [];
    const deps2 = {
      ...deps,
      queue: {
        send: async (name: string, payload: Record<string, unknown>) => {
          sent.push({ name, payload });
        },
      },
    };
    await seedPersona();
    await seedUrlConnection("cn_a", "per_1", "daily");
    await seedPersona("per_2", true); // deleted voice — its connections never auto-sync
    await seedUrlConnection("cn_b", "per_2", "daily");
    await seedPersona("per_3");
    await seedUrlConnection("cn_c", "per_3", "daily");
    await db.pg.query(`update connections set last_sync_at = now() where id = 'cn_c'`); // fresh — skip
    const res = await handleIngestSyncSweep(deps2);
    expect(res.queued).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.name).toBe(INGEST_JOB_NAMES.sync);
    expect(sent[0]!.payload).toMatchObject({ connectionId: "cn_a", auto: true });
  });
});

describe("voice.purge job", () => {
  it("hard-cascades the deleted persona's owned rows; other personas survive", async () => {
    await seedPersona();
    await seedUrlConnection();
    await handleIngestSync(deps, { connectionId: "cn_1", personaId: "per_1", workspaceId: "ws_seed" });
    await seedPersona("per_2");
    await seedUrlConnection("cn_2", "per_2");
    await handleIngestSync(deps, { connectionId: "cn_2", personaId: "per_2", workspaceId: "ws_seed" });
    await db.pg.query(`update personas set deleted_at = now() where id = 'per_1'`);

    const res = await handleVoicePurge(deps, { personaId: "per_1", workspaceId: "ws_seed" });
    expect(res.purged).toBe(true);
    expect(res.deleted["personas"]).toBe(1);
    expect(res.deleted["sample_versions"]).toBe(1);
    expect(res.deleted["artifacts"]).toBe(1);
    expect(await q(`select id from personas where id = 'per_1'`)).toHaveLength(0);
    expect(await q(`select id from connections where persona_id = 'per_1'`)).toHaveLength(0);
    // per_2's corpus is untouched.
    expect(await q(`select id from sample_versions`)).toHaveLength(1);
    expect(await q(`select id from personas where id = 'per_2'`)).toHaveLength(1);
  });

  it("is a no-op for a persona that is not deleted", async () => {
    await seedPersona();
    const res = await handleVoicePurge(deps, { personaId: "per_1", workspaceId: "ws_seed" });
    expect(res.purged).toBe(false);
    expect(await q(`select id from personas where id = 'per_1'`)).toHaveLength(1);
  });
});
