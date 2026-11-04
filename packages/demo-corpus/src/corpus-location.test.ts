import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// REQ-DOPS-1 (corpus half): corpus content lives only in packages/demo-corpus — never under
// apps/web/src/spa, copy.ts or docs/. Two detection legs: the layout path patterns, and every
// per-file sha256 recorded in the synthetic export-manifest.json (a planted copy outside the
// package matches by bytes even if renamed).

const PKG = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(PKG, "..", "..");
const FIXTURE_CORPUS = join(PKG, "fixtures/synthetic/corpus");

const manifest = JSON.parse(readFileSync(join(FIXTURE_CORPUS, "export-manifest.json"), "utf8")) as {
  files: Record<string, { sha256: string; bytes: number }>;
  digest: string;
};

const CORPUS_PATH_RE = /(^|\/)(corpus|snapshots|goldens)\//;
const CORPUS_BASENAMES = new Set(["export-manifest.json"]);

/** Paths outside packages/demo-corpus that would be corpus artifacts. Pure — testable legs. */
export function corpusPathViolations(trackedPaths: readonly string[]): string[] {
  return trackedPaths.filter(
    (p) =>
      !p.startsWith("packages/demo-corpus/") &&
      (CORPUS_PATH_RE.test(p) || CORPUS_BASENAMES.has(p.split("/").pop() ?? "")),
  );
}

function tracked(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

describe("corpus location (REQ-DOPS-1)", () => {
  it("every manifest entry exists under the fixture corpus root with the recorded sha256", () => {
    for (const [rel, meta] of Object.entries(manifest.files)) {
      const bytes = readFileSync(join(FIXTURE_CORPUS, rel));
      expect(
        rel.startsWith("_rules/") ||
          rel.startsWith("the-borrowed-commons/") ||
          rel === "PROVENANCE.md",
      ).toBe(true);
      expect(createHash("sha256").update(bytes).digest("hex"), rel).toBe(meta.sha256);
      expect(bytes.length, rel).toBe(meta.bytes);
    }
    expect(manifest.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no tracked file outside packages/demo-corpus matches a corpus path pattern", () => {
    expect(corpusPathViolations(tracked())).toEqual([]);
  });

  it("no tracked file outside packages/demo-corpus equals a recorded corpus sha256", () => {
    const shas = new Set(Object.values(manifest.files).map((f) => f.sha256));
    const offenders: string[] = [];
    for (const rel of tracked()) {
      if (rel.startsWith("packages/demo-corpus/")) continue;
      const sha = createHash("sha256")
        .update(readFileSync(join(ROOT, rel)))
        .digest("hex");
      if (shas.has(sha)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("the legs actually fire: a planted corpus file (path or bytes) is caught", () => {
    expect(corpusPathViolations(["apps/web/src/spa/corpus/x.md"])).toHaveLength(1);
    expect(corpusPathViolations(["docs/export-manifest.json"])).toHaveLength(1);
    expect(
      corpusPathViolations(["packages/demo-corpus/fixtures/synthetic/corpus/x.md"]),
    ).toHaveLength(0);
  });
});
