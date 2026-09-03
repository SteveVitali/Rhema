import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBenchmarkTestDb, testDeps, InMemoryEnclaveBlobStore } from "./testing/harness.js";
import type { BenchmarkTestDb } from "./testing/harness.js";
import { registerCorpusDraft } from "./corpus.js";
import { recordAnnotation, adjudicateGold, loadGold, loadAnnotator, annotatorsFor } from "./gold.js";
import { Enclave } from "./enclave.js";
import type { BenchmarkDeps, Finding } from "./types.js";

// REQ-EVAL-4 gold-set intake: two independent editors annotate in the §5.7 Finding schema + material flag; a senior
// editor adjudicates into the gold set. The gold rows are the reference the scorers score against.

function fnd(id: string, severity: Finding["severity"] = "major"): Finding {
  return {
    id,
    correspondenceId: "c",
    draftId: "d",
    ordinal: 0,
    kind: "claim",
    severity,
    origin: "editor",
    anchor: { blockId: "b1", quote: "q", startOffset: 0, endOffset: 1, confidence: 1 },
    title: id,
    body: "",
    rubricDims: [],
    projections: [],
  };
}

describe("gold-set intake + adjudication — REQ-EVAL-4", () => {
  let db: BenchmarkTestDb;
  let deps: BenchmarkDeps;
  const store = new InMemoryEnclaveBlobStore();
  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    deps = testDeps(0);
    await registerCorpusDraft(db.exec, store, deps, {
      id: "d1", protocol: "essay", lengthBand: "2k", text: "x", licenseRef: "l", canaryId: "c-d1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
  });
  afterEach(async () => {
    await db.close();
  });

  it("records two annotators, then a senior adjudication into the gold set", async () => {
    const a1 = await recordAnnotation(db.exec, deps, { draftId: "d1", editorId: "ed_a", finding: fnd("f_a"), material: true });
    const a2 = await recordAnnotation(db.exec, deps, { draftId: "d1", editorId: "ed_b", finding: fnd("f_b"), material: true });
    expect(await annotatorsFor(db.exec, "d1")).toEqual(["ed_a", "ed_b"]);
    expect(await loadAnnotator(db.exec, "d1", "ed_a")).toHaveLength(1);

    await adjudicateGold(db.exec, deps, {
      draftId: "d1",
      adjudicatorId: "senior",
      finding: fnd("g1", "blocking"),
      material: true,
      adjudicatedFrom: [a1, a2],
    });
    const gold = await loadGold(db.exec, "d1");
    expect(gold).toHaveLength(1);
    expect(gold[0]!.material).toBe(true);
    expect(gold[0]!.finding.id).toBe("g1");
    expect(gold[0]!.finding.severity).toBe("blocking");
  });

  it("annotator rows are NOT gold; only adjudicated rows load as gold", async () => {
    await recordAnnotation(db.exec, deps, { draftId: "d1", editorId: "ed_a", finding: fnd("f_a"), material: true });
    expect(await loadGold(db.exec, "d1")).toHaveLength(0);
  });

  it("reading a gold annotation through the enclave logs the access (REQ-EVAL-3)", async () => {
    const gid = await adjudicateGold(db.exec, deps, {
      draftId: "d1", adjudicatorId: "senior", finding: fnd("g1"), material: true, adjudicatedFrom: [],
    });
    const enclave = new Enclave(store, testDeps(500));
    const r = await enclave.readAnnotation(db.exec, gid, { actor: "runner" });
    expect(r.material).toBe(true);
    const log = await enclave.accessLogFor(db.exec, "d1");
    expect(log.some((l) => l.annotation_id === gid)).toBe(true);
  });
});
