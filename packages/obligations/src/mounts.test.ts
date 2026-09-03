import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { materializeScoped, materializeSeat, type ServerFile } from "@rhema/mirror";
import { SqlObligationHook } from "./hook.js";
import { buildObligationsJson, buildObligationsMountFile, createObligationMountProvider } from "./mount.js";
import {
  createObligationTestDb,
  deliverReviewViaHook,
  InMemoryContentStore,
  seedProject,
  testDeps,
  type MirrorTestDb,
} from "./testing/index.js";

// AC5 (deterministic): the re-review's `obligations.json` appears ONLY in the letter-writing (Editor-seat)
// context's manifest — never in the input-scoped second-read / fidelity / gap contexts, and never on a first
// review (REQ-OBJ-4/8, with P0.09's mount manifest).

describe("obligations.json mount — letter-context only (AC5, REQ-OBJ-8)", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let projectId: string;
  let draftId: string;
  const deps = testDeps(6000);

  beforeEach(async () => {
    db = await createObligationTestDb();
    store = new InMemoryContentStore();
    const seeded = await seedProject(db.exec, store);
    projectId = seeded.projectId;
    draftId = seeded.draftId;
  });
  afterEach(() => db.close());

  async function spawnSomeObligations(): Promise<void> {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "r1",
      findings: [{ ordinal: 1, severity: "blocking", quote: "a", url: "ua" }, { ordinal: 2, severity: "major", quote: "b", url: "ub" }],
    });
  }

  it("no live obligations (a first review) ⇒ no obligations.json is built", async () => {
    expect(await buildObligationsJson(db.exec, projectId)).toBeNull();
    expect(await buildObligationsMountFile(db.exec, projectId)).toBeNull();
  });

  it("a re-review's Editor manifest carries obligations.json; the scoped contexts never do", async () => {
    await spawnSomeObligations();
    const oblFile = await buildObligationsMountFile(db.exec, projectId);
    expect(oblFile).not.toBeNull();

    const tree = await materializeSeat(db.exec, store, { seat: "editor", projectId, serverFiles: [oblFile as ServerFile] });
    // present in the Editor tree + manifest, read-only + derived.
    const inTree = tree.files.find((f) => f.path === "obligations.json");
    expect(inTree).toBeDefined();
    expect(inTree!.mode).toBe("read");
    expect(inTree!.derived).toBe(true);
    expect(tree.manifest.entries.some((e) => e.path === "obligations.json")).toBe(true);

    // its bytes are the live-obligation projection.
    const json = JSON.parse(Buffer.from(inTree!.bytes).toString("utf8")) as { obligations: unknown[] };
    expect(json.obligations.length).toBe(2);

    // NEVER handed to an input-scoped independence subagent (second read / fidelity / gap).
    for (const role of ["second-reader", "fidelity-auditor", "gap-analyst"] as const) {
      const scoped = materializeScoped(tree, role);
      expect(scoped.some((p) => p.endsWith("obligations.json"))).toBe(false);
    }
  });

  it("the mount provider applies only to the Editor seat of a RE-review (priorReviewId present)", async () => {
    await spawnSomeObligations();
    const provider = createObligationMountProvider();
    const base = { runId: "r", projectId };
    // Editor + review + a re-review → mounts.
    expect(await provider.forHydration(db.exec, { ...base, seat: "editor", workflow: "review", inputs: { priorReviewId: "corr_prev" } })).not.toBeNull();
    // Editor + review but FIRST review (no priorReviewId) → null.
    expect(await provider.forHydration(db.exec, { ...base, seat: "editor", workflow: "review", inputs: {} })).toBeNull();
    // a non-Editor seat → null (independence contexts + the Drafter never see obligations).
    expect(await provider.forHydration(db.exec, { ...base, seat: "author", workflow: "review", inputs: { priorReviewId: "corr_prev" } })).toBeNull();
    // a non-review workflow → null.
    expect(await provider.forHydration(db.exec, { ...base, seat: "editor", workflow: "revise", inputs: { priorReviewId: "corr_prev" } })).toBeNull();
  });
});
