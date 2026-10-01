import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { materializeSeat } from "./materialize.js";
import { harvest, type HarvestFile } from "./harvest.js";
import { createMirrorTestDb, type MirrorTestDb } from "./testing/harness.js";
import { InMemoryContentStore } from "./content-store.js";
import { seedArtifact, seedBase, seedMirrorProject, type SeededMirrorProject } from "./testing/fixture.js";

// P0.09 harvest (REQ-DATA-6; §12.2 commit step 2): the read-only hash check (AC4), the write-back allowlist
// filter + boundary violations + quarantine (AC5), and identical-file de-duplication (REQ-DATA-9a).

describe("harvest", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let p: SeededMirrorProject;
  let workspaceId: string;

  beforeEach(async () => {
    db = await createMirrorTestDb();
    store = new InMemoryContentStore();
    ({ workspaceId } = await seedBase(db.exec));
    p = await seedMirrorProject(db.exec, store, workspaceId, { id: "proj_pv", personaId: "prs_pv", tag: "PV" });
  });
  afterEach(() => db.close());

  async function authorTree() {
    return materializeSeat(db.exec, store, { seat: "author", projectId: p.projectId, personaId: p.personaId });
  }
  function asFiles(tree: Awaited<ReturnType<typeof authorTree>>): HarvestFile[] {
    return tree.files.map((f) => ({ path: f.path, root: f.root, bytes: f.bytes }));
  }

  // AC4 — `chmod +w` + edit of a read-only mirror file fails the step at the hash check (review 13 F14).
  it("a changed read-only artifact file fails the step (hash check, AC4)", async () => {
    const tree = await authorTree();
    const files = asFiles(tree);
    // drafts/v1.md is a read-only bind mount for the author; tamper with its bytes (a chmod+w edit).
    const tampered = files.map((f) =>
      f.path === "drafts/v1.md" ? { ...f, bytes: Buffer.from("# tampered\n", "utf8") } : f,
    );
    const result = harvest({ seat: "author", manifest: tree.manifest, files: tampered });
    expect(result.readOnlyHashMismatch).toContain("drafts/v1.md");
    expect(result.stepFailed).toBe(true);
    expect(result.newVersions).toEqual([]); // a tampered read-only file is never versioned
  });

  // AC5 — an out-of-allowlist write is dropped and counted as boundary.violation.
  it("an out-of-allowlist write is dropped and counted (AC5)", async () => {
    const tree = await authorTree();
    const files = [...asFiles(tree), { path: "agents/editor/leak.md", root: "project" as const, bytes: Buffer.from("x") }];
    const result = harvest({ seat: "author", manifest: tree.manifest, files });
    expect(result.boundaryViolations).toContainEqual({ path: "agents/editor/leak.md", reason: "out_of_allowlist" });
    expect(result.newVersions).toEqual([]);
    expect(result.quarantine).toBe(false); // one violation is below the threshold
  });

  it(">5 out-of-allowlist violations quarantine the run's artifacts (AC5)", async () => {
    const tree = await authorTree();
    const extra: HarvestFile[] = Array.from({ length: 6 }, (_, i) => ({
      path: `secret-${i}.md`,
      root: "project" as const,
      bytes: Buffer.from(`x${i}`),
    }));
    const result = harvest({ seat: "author", manifest: tree.manifest, files: [...asFiles(tree), ...extra] });
    expect(result.boundaryViolations.length).toBe(6);
    expect(result.quarantine).toBe(true);
  });

  // AC5 — a write to an IMMUTABLE artifact quarantines regardless of count.
  it("a single write to an immutable artifact quarantines (AC5)", async () => {
    // seed an immutable ledger inside the author's writable namespace.
    await seedArtifact(db.exec, store, workspaceId, {
      scope: "project", scopeId: p.projectId, kind: "response_ledger", namespace: "agent:author",
      mirrorPath: "agents/author/ledgers/frozen-ledger.md", content: "delivered ledger\n", immutable: true,
    });
    const tree = await authorTree();
    const files = asFiles(tree).map((f) =>
      f.path === "agents/author/ledgers/frozen-ledger.md" ? { ...f, bytes: Buffer.from("rewritten\n") } : f,
    );
    const result = harvest({ seat: "author", manifest: tree.manifest, files });
    expect(result.boundaryViolations).toContainEqual({ path: "agents/author/ledgers/frozen-ledger.md", reason: "immutable" });
    expect(result.quarantine).toBe(true);
    expect(result.newVersions).toEqual([]);
  });

  // A genuine new writable file with a known kind IS versioned; identical files are not (REQ-DATA-6/9a).
  it("versions a changed writable file, leaves identical files unversioned", async () => {
    const tree = await authorTree();
    // agents/author/ledgers/v1-response-ledger.md is writable for the author and the path→kind map recognizes it.
    const target = "agents/author/ledgers/v1-response-ledger.md";
    const files = asFiles(tree).map((f) =>
      f.path === target ? { ...f, bytes: Buffer.from("Response ledger — PV, revised\n") } : f,
    );
    const result = harvest({ seat: "author", manifest: tree.manifest, files });
    expect(result.newVersions.map((v) => v.path)).toEqual([target]);
    expect(result.newVersions[0]!.kind).toBe("response_ledger");
    expect(result.stepFailed).toBe(false);
  });

  // An unknown path inside a writable namespace fails the step (the conservative "or fail" branch).
  it("an unknown writable path fails the step", async () => {
    const tree = await authorTree();
    const files = [...asFiles(tree), { path: "agents/author/mystery.xyz", root: "project" as const, bytes: Buffer.from("?") }];
    const result = harvest({ seat: "author", manifest: tree.manifest, files });
    expect(result.unknownPaths).toContain("agents/author/mystery.xyz");
    expect(result.stepFailed).toBe(true);
  });

  // PRB.19 (F26b) — the run's declared phase outputs are writable even under the seat's read-only shared
  // mounts: `drafts/v2.md` + `correspondence/v1-response.md` (the revise deliverables the live pod wrote and
  // lost — D-PRB.16-1) persist as content-addressed versions instead of dropping as violations.
  it("persists a NEW declared output under a read-only shared mount when the run grants it (F26b)", async () => {
    const tree = await authorTree();
    const files = [
      ...asFiles(tree),
      { path: "drafts/v2.md", root: "project" as const, bytes: Buffer.from("# revised\n") },
      { path: "correspondence/v1-response.md", root: "project" as const, bytes: Buffer.from("# response\n") },
    ];
    const result = harvest({
      seat: "author",
      manifest: tree.manifest,
      files,
      writablePaths: ["drafts/v2.md", "correspondence/v1-response.md"],
    });
    expect(result.boundaryViolations).toEqual([]);
    expect(result.stepFailed).toBe(false);
    expect(result.newVersions.map((v) => v.path).sort()).toEqual([
      "correspondence/v1-response.md",
      "drafts/v2.md",
    ]);
    expect(result.newVersions.find((v) => v.path === "drafts/v2.md")!.kind).toBe("draft");
    expect(result.newVersions.find((v) => v.path === "correspondence/v1-response.md")!.kind).toBe("response_letter");
  });

  it("a shared path NOT in the grant still drops as out_of_allowlist (the grant is path-precise)", async () => {
    const tree = await authorTree();
    const files = [
      ...asFiles(tree),
      { path: "drafts/v9.md", root: "project" as const, bytes: Buffer.from("# stray\n") },
    ];
    const result = harvest({
      seat: "author",
      manifest: tree.manifest,
      files,
      writablePaths: ["drafts/v2.md", "correspondence/v1-response.md"],
    });
    expect(result.boundaryViolations).toContainEqual({ path: "drafts/v9.md", reason: "out_of_allowlist" });
    expect(result.newVersions).toEqual([]);
  });
});
