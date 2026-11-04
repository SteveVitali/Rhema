import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { exportCorpus } from "./export.js";

// REQ-CORPUS-4/8/9/11/12/13/15: the synthetic fixture is the exporter's own golden — a re-run on
// the committed source is byte-identical to the committed export, the manifest digest is stable,
// and every output shape (index, versions, published node, excluded-refs, PROVENANCE) is asserted.

const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic", import.meta.url));
const GOLDEN = join(FIXTURE, "corpus");

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function freshRun(): string {
  const out = mkdtempSync(join(tmpdir(), "corpus-run-"));
  cpSync(join(GOLDEN, "_rules"), join(out, "_rules"), { recursive: true });
  exportCorpus({
    sourceRoot: join(FIXTURE, "source"),
    corpusRoot: out,
    slugs: ["the-borrowed-commons"],
    exportDate: "2026-11-03",
  });
  return out;
}

describe("export on the synthetic fixture (REQ-CORPUS-11/15)", () => {
  const out = freshRun();

  it("is byte-identical to the committed exported golden, manifest digest included", () => {
    const goldenFiles = [...walk(GOLDEN)]
      .map((p) => relative(GOLDEN, p))
      .filter((p) => !p.startsWith("_rules"))
      .sort();
    const outFiles = [...walk(out)]
      .map((p) => relative(out, p))
      .filter((p) => !p.startsWith("_rules"))
      .sort();
    expect(outFiles).toEqual(goldenFiles);
    for (const rel of goldenFiles) {
      expect(readFileSync(join(out, rel)), rel).toEqual(readFileSync(join(GOLDEN, rel)));
    }
    const gm = JSON.parse(readFileSync(join(GOLDEN, "export-manifest.json"), "utf8"));
    const om = JSON.parse(readFileSync(join(out, "export-manifest.json"), "utf8"));
    expect(om.digest).toBe(gm.digest);
  });

  it("published.md exports as the Published node: URL, fetch date, sha256, origin imported", () => {
    const v = JSON.parse(readFileSync(join(out, "the-borrowed-commons/versions.json"), "utf8"));
    expect(v.published).toMatchObject({
      file: "published.md",
      url: "https://sjsebastian.example.org/p/the-borrowed-commons",
      fetched: "2026-09-01",
      label: "Published · sjsebastian.example.org · fetched 2026-09-01",
      origin: "imported",
    });
    expect(v.published.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("writer-directed versions carry the label; titles/subtitles are data (retitle v3)", () => {
    const v = JSON.parse(readFileSync(join(out, "the-borrowed-commons/versions.json"), "utf8"));
    const byVersion = Object.fromEntries(
      v.versions.map((x: { version: string }) => [x.version, x]),
    );
    expect(byVersion.v1.title).toBe("The Borrowed Commons");
    expect(byVersion.v3.title).toBe("The Borrowed Commons: a Grammar of Shared Decay");
    expect(byVersion.v3.writerDirected).toBe(true);
    expect(byVersion.v3.provenanceLabel).toBe("Writer-directed edit (not reviewed)");
    expect(byVersion.v2.writerDirected).toBeUndefined();
  });

  it("emits per-artifact files + index, excluded-refs markers, and the facts block", () => {
    const idx = JSON.parse(readFileSync(join(out, "the-borrowed-commons/index.json"), "utf8"));
    expect(idx.artifacts.length).toBeGreaterThan(30);
    expect(idx.artifacts[0]).toHaveProperty("sha256");
    const refs = JSON.parse(
      readFileSync(join(out, "the-borrowed-commons/excluded-refs.json"), "utf8"),
    );
    expect(refs.refs).toContainEqual({
      file: "drafts/v1.md",
      line: 27,
      excluded: "manifest.md",
    });
    const prov = readFileSync(join(out, "PROVENANCE.md"), "utf8");
    expect(prov).toContain("Allowlisted input tree digest");
    expect(prov).toContain("v1 review: revision plan approved");
    expect(prov).toContain("drafts/short-v1.md` — a different piece");
  });

  it("the exported text never carries the deleted-content markers: text is kept, refs are marked", () => {
    const v1 = readFileSync(join(out, "the-borrowed-commons/drafts/v1.md"), "utf8");
    expect(v1).toContain("agents/author/outline/01-outline.md"); // ref kept, marker recorded
    expect(v1).toContain("](figures/figure_1_signal_map.png)");
    expect(v1).not.toContain("](figure_1_signal_map.png)");
  });
});
