import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBenchmarkTestDb, testDeps, InMemoryEnclaveBlobStore } from "./testing/harness.js";
import type { BenchmarkTestDb } from "./testing/harness.js";
import { Enclave, EnclaveContentMissingError, enclaveKeyFor } from "./enclave.js";
import { registerCorpusDraft } from "./corpus.js";

// AC1: every read of a corpus draft leaves a log row; no public/fixture path can resolve enclave content (REQ-EVAL-3).

describe("enclave access logging — AC1", () => {
  let db: BenchmarkTestDb;
  beforeEach(async () => {
    db = await createBenchmarkTestDb();
  });
  afterEach(async () => {
    await db.close();
  });

  async function seedDraft(store: InMemoryEnclaveBlobStore, id = "draft_x") {
    const deps = testDeps(0);
    return registerCorpusDraft(db.exec, store, deps, {
      id,
      protocol: "essay",
      lengthBand: "2k",
      text: "The state adjudicates who may be seen.",
      licenseRef: "lic-001",
      canaryId: "canary-001",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
  }

  it("every readDraft writes exactly one access-log row and returns the bytes", async () => {
    const store = new InMemoryEnclaveBlobStore();
    const enclave = new Enclave(store, testDeps(100));
    const draft = await seedDraft(store);

    const r1 = await enclave.readDraft(db.exec, draft.id, { actor: "runner@bench", purpose: "wave-1", runId: "run_1" });
    const r2 = await enclave.readDraft(db.exec, draft.id, { actor: "auditor@nda" });
    expect(Buffer.from(r1.bytes).toString("utf8")).toContain("adjudicates");

    const log = await enclave.accessLogFor(db.exec, draft.id);
    expect(log).toHaveLength(2); // one row PER read — the audit trail is complete
    expect(log.map((l) => l.id)).toEqual([r1.accessLogId, r2.accessLogId]);
    expect(log[0]).toMatchObject({ actor: "runner@bench", action: "read", purpose: "wave-1", run_id: "run_1" });
    expect(log[1]).toMatchObject({ actor: "auditor@nda", action: "read" });
  });

  it("logs the attempt even when the bytes are missing (a dangling blob)", async () => {
    // register the row but never store bytes → the fetch fails, but the access was still attempted + logged.
    const store = new InMemoryEnclaveBlobStore();
    const deps = testDeps(0);
    await db.exec.query(
      `insert into benchmark_corpus_drafts
         (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id, added_at)
       values ('draft_missing','essay','2k',5,now(),'lic','deadbeef',$1,'canary-x',now())`,
      [enclaveKeyFor("deadbeef")],
    );
    const enclave = new Enclave(store, deps);
    await expect(enclave.readDraft(db.exec, "draft_missing", { actor: "runner" })).rejects.toBeInstanceOf(
      EnclaveContentMissingError,
    );
    const log = await enclave.accessLogFor(db.exec, "draft_missing");
    expect(log).toHaveLength(1);
  });

  it("throws for an unknown draft (no silent empty content)", async () => {
    const enclave = new Enclave(new InMemoryEnclaveBlobStore(), testDeps(0));
    await expect(enclave.readDraft(db.exec, "nope", { actor: "runner" })).rejects.toBeInstanceOf(
      EnclaveContentMissingError,
    );
  });

  it("uses a keyspace separate from the tenant object layout (never a product/fixture path)", async () => {
    const store = new InMemoryEnclaveBlobStore();
    const draft = await seedDraft(store);
    expect(draft.enclave_key.startsWith("benchmark/enclave/")).toBe(true);
    // the tenant layout is `tenants/<ws>/objects/<sha>` — the enclave never shares it (REQ-EVAL-3).
    expect(draft.enclave_key.includes("tenants/")).toBe(false);
  });

  it("no product role can read the enclave tables — only rhema_benchmark is granted", async () => {
    const grantees = (
      await db.exec.query(
        `select grantee from information_schema.role_table_grants
          where table_name = 'benchmark_corpus_drafts' and privilege_type = 'SELECT'
            and grantee like 'rhema%'`,
      )
    ).rows as { grantee: string }[];
    const roles = grantees.map((g) => g.grantee).sort();
    expect(roles).toEqual(["rhema_benchmark"]);
    expect(roles).not.toContain("rhema_app");
  });
});
