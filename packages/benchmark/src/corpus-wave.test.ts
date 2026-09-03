import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBenchmarkTestDb, testDeps, InMemoryEnclaveBlobStore } from "./testing/harness.js";
import type { BenchmarkTestDb } from "./testing/harness.js";
import { registerCorpusDraft, recordContamination, contaminationStatus, rotationStatus } from "./corpus.js";
import { createWave, admitToWave, waveManifest, WaveAdmissionError } from "./wave.js";
import { assertHeadlineDrafts, DevSetInHeadlineError } from "./report-guard.js";
import type { BenchmarkDeps } from "./types.js";

// AC2: a draft missing any REQ-EVAL-2 evidence field cannot be admitted to a wave manifest. Plus the REQ-EVAL-1
// dev-set admission rule and the DB-backed headline guard (AC6).

describe("wave admission gate — AC2", () => {
  let db: BenchmarkTestDb;
  let deps: BenchmarkDeps;
  const store = new InMemoryEnclaveBlobStore();

  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    deps = testDeps(0);
  });
  afterEach(async () => {
    await db.close();
  });

  async function draft(id: string, isDevSet = false) {
    return registerCorpusDraft(db.exec, store, deps, {
      id,
      protocol: "essay",
      lengthBand: "2k",
      text: `draft ${id}`,
      licenseRef: "lic",
      canaryId: `canary-${id}`,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      isDevSet,
    });
  }
  async function fullContamination(id: string) {
    await recordContamination(db.exec, {
      draftId: id,
      createdAfterCutoff: true,
      newestModelCutoff: new Date("2025-06-01T00:00:00Z"),
      authorAttestationRef: "attest-001",
      nearDuplicateClean: true,
      nearDuplicateSearchRef: "search-001",
      canaryId: `canary-${id}`,
    });
  }

  it("admits a draft with a complete contamination record", async () => {
    await draft("d1");
    await fullContamination("d1");
    const wave = await createWave(db.exec, deps, { name: "scored-1", agreementFloor: 0.6 });
    await admitToWave(db.exec, wave, "d1");
    expect(await waveManifest(db.exec, wave)).toEqual(["d1"]);
  });

  it("REJECTS a draft with no contamination record", async () => {
    await draft("d2");
    const wave = await createWave(db.exec, deps, { name: "scored-2", agreementFloor: 0.6 });
    await expect(admitToWave(db.exec, wave, "d2")).rejects.toBeInstanceOf(WaveAdmissionError);
    expect(await waveManifest(db.exec, wave)).toEqual([]);
  });

  it("REJECTS a draft whose contamination evidence is incomplete (each missing field)", async () => {
    const wave = await createWave(db.exec, deps, { name: "scored-3", agreementFloor: 0.6 });
    // near-duplicate NOT clean
    await draft("d_nd");
    await recordContamination(db.exec, {
      draftId: "d_nd",
      createdAfterCutoff: true,
      newestModelCutoff: new Date("2025-06-01T00:00:00Z"),
      authorAttestationRef: "attest",
      nearDuplicateClean: false,
      nearDuplicateSearchRef: "search",
      canaryId: "canary-d_nd",
    });
    await expect(admitToWave(db.exec, wave, "d_nd")).rejects.toBeInstanceOf(WaveAdmissionError);

    // neither post-cutoff NOR never-published
    await draft("d_cut");
    await recordContamination(db.exec, {
      draftId: "d_cut",
      createdAfterCutoff: false,
      neverPublished: false,
      newestModelCutoff: new Date("2025-06-01T00:00:00Z"),
      authorAttestationRef: "attest",
      nearDuplicateClean: true,
      nearDuplicateSearchRef: "search",
      canaryId: "canary-d_cut",
    });
    await expect(admitToWave(db.exec, wave, "d_cut")).rejects.toBeInstanceOf(WaveAdmissionError);

    // empty attestation ref
    await draft("d_att");
    await recordContamination(db.exec, {
      draftId: "d_att",
      createdAfterCutoff: true,
      newestModelCutoff: new Date("2025-06-01T00:00:00Z"),
      authorAttestationRef: "",
      nearDuplicateClean: true,
      nearDuplicateSearchRef: "search",
      canaryId: "canary-d_att",
    });
    await expect(admitToWave(db.exec, wave, "d_att")).rejects.toBeInstanceOf(WaveAdmissionError);

    expect(await waveManifest(db.exec, wave)).toEqual([]);
  });

  it("a never-published draft is admissible even if not post-cutoff", async () => {
    await draft("d_np");
    await recordContamination(db.exec, {
      draftId: "d_np",
      createdAfterCutoff: false,
      neverPublished: true,
      newestModelCutoff: new Date("2025-06-01T00:00:00Z"),
      authorAttestationRef: "attest",
      nearDuplicateClean: true,
      nearDuplicateSearchRef: "search",
      canaryId: "canary-d_np",
    });
    const wave = await createWave(db.exec, deps, { name: "scored-np", agreementFloor: 0.6 });
    await admitToWave(db.exec, wave, "d_np");
    expect(await waveManifest(db.exec, wave)).toEqual(["d_np"]);
  });

  it("a dev-set draft cannot enter a scored (headline-eligible) wave, only a dev-set wave (REQ-EVAL-1)", async () => {
    await draft("dev1", true);
    await fullContamination("dev1");
    const scored = await createWave(db.exec, deps, { name: "scored-dev", agreementFloor: 0.6 });
    await expect(admitToWave(db.exec, scored, "dev1")).rejects.toBeInstanceOf(WaveAdmissionError);

    const pilot = await createWave(db.exec, deps, { name: "pilot", kind: "pilot", isDevSet: true, agreementFloor: 0.6 });
    await admitToWave(db.exec, pilot, "dev1"); // the pilot (dev-set) wave accepts it
    expect(await waveManifest(db.exec, pilot)).toEqual(["dev1"]);
  });

  it("contaminationStatus reports WHICH field is missing before an insert fails", async () => {
    await draft("d_s");
    expect(await contaminationStatus(db.exec, "d_s")).toMatchObject({ present: false, complete: false });
    await recordContamination(db.exec, {
      draftId: "d_s",
      createdAfterCutoff: true,
      newestModelCutoff: new Date("2025-06-01T00:00:00Z"),
      authorAttestationRef: "attest",
      nearDuplicateClean: false,
      nearDuplicateSearchRef: "search",
      canaryId: "canary-d_s",
    });
    const st = await contaminationStatus(db.exec, "d_s");
    expect(st.present).toBe(true);
    expect(st.complete).toBe(false);
    expect(st.missing).toContain("near_duplicate_clean");
  });
});

describe("DB-backed headline guard — AC6", () => {
  let db: BenchmarkTestDb;
  let deps: BenchmarkDeps;
  const store = new InMemoryEnclaveBlobStore();
  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    deps = testDeps(0);
  });
  afterEach(async () => {
    await db.close();
  });

  it("passes for known non-dev-set drafts; fails for a dev-set or unknown draft", async () => {
    await registerCorpusDraft(db.exec, store, deps, {
      id: "h1", protocol: "essay", lengthBand: "2k", text: "x", licenseRef: "l", canaryId: "c-h1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await registerCorpusDraft(db.exec, store, deps, {
      id: "dev_h", protocol: "essay", lengthBand: "2k", text: "x", licenseRef: "l", canaryId: "c-dev_h",
      createdAt: new Date("2026-01-01T00:00:00Z"), isDevSet: true,
    });
    await expect(assertHeadlineDrafts(db.exec, ["h1"])).resolves.toBeUndefined();
    await expect(assertHeadlineDrafts(db.exec, ["h1", "dev_h"])).rejects.toBeInstanceOf(DevSetInHeadlineError);
    await expect(assertHeadlineDrafts(db.exec, ["unknown"])).rejects.toBeInstanceOf(DevSetInHeadlineError);
  });
});

describe("rotation bookkeeping — REQ-EVAL-3", () => {
  let db: BenchmarkTestDb;
  let deps: BenchmarkDeps;
  const store = new InMemoryEnclaveBlobStore();
  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    deps = testDeps(0);
  });
  afterEach(async () => {
    await db.close();
  });

  it("computes the ≥20%/yr rotation fraction over the active corpus", async () => {
    // 5 active drafts; 1 rotated in 2027 → 20% (meets floor). Dev-set drafts are excluded.
    for (let i = 0; i < 5; i++) {
      await registerCorpusDraft(db.exec, store, deps, {
        id: `r${i}`, protocol: "essay", lengthBand: "2k", text: "x", licenseRef: "l", canaryId: `c-r${i}`,
        createdAt: new Date("2026-01-01T00:00:00Z"), rotationYear: i === 0 ? 2027 : undefined,
      });
    }
    const st = await rotationStatus(db.exec, 2027, 0.2);
    expect(st.activeCount).toBe(5);
    expect(st.rotatedInYear).toBe(1);
    expect(st.fraction).toBeCloseTo(0.2, 12);
    expect(st.meetsFloor).toBe(true);
  });
});
