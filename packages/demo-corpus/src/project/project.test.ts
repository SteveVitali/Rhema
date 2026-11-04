import { describe, expect, it } from "vitest";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { lintCopy } from "@rhema/contracts";
import type {
  EditorDocDto,
  VersionRailDto,
  ProjectRow,
} from "@rhema/api-client";
import { convertProject, canonicalJson, readConvertOverrides } from "../convert/index.js";
import type { WhatChangedArtifact } from "../convert/what-changed.js";
import { projectEssay } from "./project.js";
import {
  registerSnapshotKind,
  registerDocumentKinds,
  registeredKinds,
  validateSnapshot,
  snapshotEnvelopes,
  indexViolations,
  resolveViolations,
  envelopeViolations,
} from "./harness.js";
import { registerRunKinds, readFacts } from "./replay.js";
import { ENVELOPE_BYTES, type EssayIndex, type SnapshotFile, type KindDtoMap } from "./model.js";

// REQ-CORPUS-9/12/13, REQ-CONV-13/14 — the projector + contract/drift harness on the synthetic
// fixture: one lazy chunk per artifact/draft/pair, the per-essay index, the `satisfies`-typed
// DTO contract, the size bound, the label/marker carriage, and the committed-snapshot drift
// test. Regenerate snapshots with `RHEMA_REGEN_SNAPSHOTS=1 pnpm exec vitest run …project.test.ts`.

const SLUG = "the-borrowed-commons";
const PKG = fileURLToPath(new URL("../../", import.meta.url));
const ROOT = join(PKG, "..", "..");
const CORPUS = join(PKG, "fixtures/synthetic/corpus");
const CORPUS_SLUG = join(CORPUS, SLUG);
const OVERRIDES_DIR = join(PKG, "fixtures/synthetic/overrides", SLUG);
const SNAPSHOTS = join(PKG, "fixtures/synthetic/snapshots", SLUG);
const REGEN = process.env.RHEMA_REGEN_SNAPSHOTS === "1";

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const files = new Map<string, string>();
for (const p of walk(CORPUS_SLUG))
  files.set(relative(CORPUS_SLUG, p).replace(/\\/g, "/"), readFileSync(p, "utf8"));

const overridesFile = readConvertOverrides(
  JSON.parse(readFileSync(join(OVERRIDES_DIR, "convert-overrides.json"), "utf8")),
);
if (!overridesFile.ok) throw new Error("fixture overrides failed to parse");
const convert = convertProject({ files, overrides: overridesFile.value });
if (!convert.ok) throw new Error("fixture conversion failed");

const manifest = JSON.parse(readFileSync(join(CORPUS, "export-manifest.json"), "utf8")) as {
  exportDate: string;
};
const provenance = readFileSync(join(CORPUS, "PROVENANCE.md"), "utf8");
const facts = readFacts(readFileSync(join(CORPUS, "_rules/facts.json"), "utf8")).slugs?.[SLUG];

const result = projectEssay({
  essay: SLUG,
  files,
  convert,
  exportDate: manifest.exportDate,
  provenance,
  facts,
});
const outputs = result.outputs;
const index = JSON.parse(outputs.get("index.json")!) as EssayIndex;

const env = (rel: string): SnapshotFile => {
  const bytes = outputs.get(rel);
  expect(bytes, rel).toBeTruthy();
  return JSON.parse(bytes!) as SnapshotFile;
};
const dto = <K extends keyof KindDtoMap>(rel: string, _kind: K): KindDtoMap[K] =>
  env(rel).dto as KindDtoMap[K];

registerDocumentKinds();
registerRunKinds();

describe("every document-side method has a snapshot per key (AC1)", () => {
  it("emits the expected chunk set and the index names exactly the emitted files", () => {
    expect([...outputs.keys()].sort()).toEqual(
      [
        "index.json",
        "versions.json",
        "files.json",
        "timeline.json",
        "card-facts.json",
        "drafts/v1.json",
        "drafts/v2.json",
        "drafts/v3.json",
        "drafts/published.json",
        "diffs/1-2.json",
        "diffs/2-3.json",
        "diffs/3-4.json",
        "what-changed/v1-v2.json",
        "what-changed/v2-v3.json",
        "what-changed/v3-published.json",
        ...Object.values(index.chunks["artifact-page"] ?? {}),
        ...Object.values(index.chunks["dossier"] ?? {}),
        ...Object.values(index.chunks["run-report"] ?? {}),
        ...Object.values(index.chunks["figure-image"] ?? {}),
      ].sort(),
    );
    // every corpus markdown artifact that isn't a draft has a page
    const pages = Object.keys(index.chunks["artifact-page"] ?? {});
    expect(pages.length).toBeGreaterThan(20);
    expect(pages).toContain("correspondence/v1-review/00-piece-brief.md");
    expect(pages).toContain("correspondence/v1-review/01-claim-ledger.md"); // sidecar'd raw twin
    expect(pages).toContain("agents/editor/research/sources/freeform-gazette-note.md");
    expect(indexViolations(index, outputs)).toEqual([]);
    expect(resolveViolations(index)).toEqual([]);
  });

  it("a missing key is a projector error, never an empty payload", () => {
    const missing = new Map(files);
    missing.delete("correspondence/v1-review/00-piece-brief.md");
    expect(() =>
      projectEssay({
        essay: SLUG,
        files: missing,
        convert,
        exportDate: manifest.exportDate,
        provenance,
      }),
    ).toThrow(/missing|piece-brief/);
  });

  it("resolve covers working + every n; working is the Published head", () => {
    expect(index.resolve["working"]).toMatchObject({ draftId: "published", draftN: 4 });
    for (const n of [1, 2, 3, 4]) expect(index.resolve[String(n)]?.draftN).toBe(n);
  });
});

describe("the version rail (AC4)", () => {
  const rail = dto("versions.json", "versions");
  it("carries every version incl. Published + the writer-directed edit, exactly as 214 declares", () => {
    expect(rail.drafts.map((d) => d.draftId)).toEqual(["v1", "v2", "v3", "published"]);
    expect(rail.drafts.map((d) => d.origin)).toEqual([
      "drafted_from_outline",
      "response_to_review",
      "human_revision",
      "imported",
    ]);
    expect(rail.drafts[2]!.label).toBe("Writer-directed edit (not reviewed)");
    expect(rail.drafts[3]!.label).toBe(
      "Published · sjsebastian.example.org · fetched 2026-09-01",
    );
    expect(rail.workingN).toBe(4);
    expect(rail.drafts[3]!.state).toBe("working");
    expect(rail.drafts.slice(0, 3).map((d) => d.frozen)).toEqual([true, true, true]);
    expect(rail.drafts.map((d) => d.reviewed)).toEqual([true, true, false, false]);
    expect(rail.drafts.map((d) => d.answered)).toEqual([true, true, false, false]);
    expect(rail.drafts[2]!.claimsPendingVerification).toBe(true);
  });
});

describe("editor docs + artifact pages", () => {
  it("draft chunks carry the corpus markdown byte-for-byte; reviewed versions carry the rail", () => {
    const v1 = dto("drafts/v1.json", "editor-doc");
    expect(v1.markdown).toBe(files.get("drafts/v1.md"));
    expect(v1.sha256).toBeTruthy();
    expect(v1.findings.length).toBeGreaterThan(0);
    expect(v1.findings[0]).toMatchObject({ sourceLabel: "from Review of v1", method: "exact" });
    expect(v1.demo?.importRule).toBeTruthy();
    const v3 = dto("drafts/v3.json", "editor-doc");
    expect(v3.findings).toEqual([]);
    expect(v3.versionLabel).toBe("Writer-directed edit (not reviewed)");
    const pub = dto("drafts/published.json", "editor-doc");
    expect(pub.origin).toBe("imported");
    expect(pub.markdown.startsWith("#")).toBe(true);
  });

  it("artifact pages are raw markdown, kind-tagged, carrying not-published refs", () => {
    const brief = dto(
      "artifacts/correspondence/v1-review/00-piece-brief.md.json",
      "artifact-page",
    );
    expect(brief.markdown).toBe(files.get("correspondence/v1-review/00-piece-brief.md"));
    expect(brief.artifactKind).toBe("piece_brief");
    expect(brief.findings).toEqual([]);
    const note = dto(
      "artifacts/correspondence/v1-drafting-note.md.json",
      "artifact-page",
    );
    expect(note.demo?.notPublishedRefs).toEqual([
      { line: 4, path: "agents/author/outline/01-outline.md" },
    ]);
    const v1 = dto("drafts/v1.json", "editor-doc");
    expect(v1.demo?.notPublishedRefs?.length).toBe(2);
  });
});

describe("diffs + what-changed", () => {
  it("1:2 carries the ledger join (M1/M3 link h3; leftovers Unlinked); meta fields honest", () => {
    const d = dto("diffs/1-2.json", "version-diff");
    expect(d.responseId).toBe("v1-v2");
    expect(d.reviewId).toBe("v1-review");
    expect(d.before).toMatchObject({ n: 1, origin: "drafted_from_outline" });
    expect(d.after).toMatchObject({ n: 2, origin: "response_to_review" });
    const a = JSON.parse(
      convert.outputs.get("what-changed/v1-v2.json")!,
    ) as WhatChangedArtifact;
    expect(d.view.strip).toMatchObject({
      addressed: a.summary.addressed,
      rebutted: a.summary.rebutted,
      stillOpen: a.summary.stillOpen,
      moves: a.summary.moves,
      hunks: a.summary.hunks,
    });
    expect(d.view.moves.map((m) => m.moveId)).toEqual(["M1", "M3"]);
    expect(d.view.moves.flatMap((m) => m.hunks).map((h) => h.id)).toEqual(["h3", "h3"]);
    expect(d.view.moves[0]!.findings[0]!.findingId).toBeTruthy();
    expect(d.view.moves[0]!.dischargeLines).toEqual([]);
    expect(d.view.unlinked.hunks.length).toBe(a.summary.unlinkedHunks);
    expect(d.diff.beforeBlocks.length).toBeGreaterThan(0);
  });

  it("2:3 (writer-directed) is honest: every hunk Unlinked, no review, no response", () => {
    const d = dto("diffs/2-3.json", "version-diff");
    expect(d.responseId).toBeNull();
    expect(d.reviewId).toBeNull();
    expect(d.view.moves).toEqual([]);
    expect(d.view.unlinked.hunks.length).toBe(d.diff.hunks.length);
    const w = dto("what-changed/v2-v3.json", "what-changed");
    expect(w.beforeN).toBe(2);
    expect(w.afterN).toBe(3);
  });

  it("3:4 (Published) diffs the last draft against the live post", () => {
    const d = dto("diffs/3-4.json", "version-diff");
    expect(d.after).toMatchObject({ n: 4, origin: "imported", claimsPendingVerification: true });
    expect(d.reviewId).toBeNull();
    expect(d.view.unlinked.hunks.length).toBe(d.diff.hunks.length);
  });
});

describe("the Files tree", () => {
  const f = dto("files.json", "files");
  it("groups rows by section; drafts carry draftRef; fragments note present", () => {
    const keys = f.sections.map((s) => s.key);
    expect(keys).toEqual(["drafts", "rounds", "research", "assets", "advanced"]);
    const drafts = f.sections.find((s) => s.key === "drafts")!;
    expect(drafts.rows.filter((r) => r.kind === "draft").map((r) => r.draftRef?.n)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(drafts.rows.some((r) => r.kind === "companion_doc")).toBe(true);
    const adv = f.sections.find((s) => s.key === "advanced")!;
    expect(adv.advancedRows.length).toBeGreaterThan(0);
    expect(f.demo?.fragmentsNote).toBe("3 working fragments not shown");
    const research = f.sections.find((s) => s.key === "research")!;
    expect(research.rows.filter((r) => r.kind === "source_note").length).toBe(5);
  });
});

describe("the contract/drift harness (AC2)", () => {
  it("every emitted snapshot validates against its registered kind", () => {
    for (const { env: e } of snapshotEnvelopes(outputs)) {
      expect(envelopeViolations(e)).toEqual([]);
      expect(validateSnapshot(e), `${e.kind} ${e.key}`).toEqual([]);
    }
    expect(registeredKinds()).toEqual(
      [
        "artifact-page",
        "card-facts",
        "dossier",
        "editor-doc",
        "files",
        "figure-image",
        "projects",
        "run-report",
        "timeline",
        "version-diff",
        "versions",
        "what-changed",
      ].sort(),
    );
  });

  it("a malformed payload fails its kind's validator", () => {
    expect(
      validateSnapshot({
        format: 1,
        kind: "editor-doc",
        essay: SLUG,
        key: "x",
        dto: { draftId: "x" },
      }),
    ).not.toEqual([]);
    expect(
      validateSnapshot({ format: 1, kind: "unregistered-kind", essay: SLUG, key: "x", dto: {} }),
    ).toEqual(["unregistered snapshot kind: unregistered-kind"]);
  });

  it("a new kind registers without editing the harness core (218a's seam)", () => {
    registerSnapshotKind("test-card", (e) =>
      typeof (e.dto as { n?: unknown }).n === "number" ? [] : ["n not a number"],
    );
    expect(registeredKinds()).toContain("test-card");
    expect(
      validateSnapshot({ format: 1, kind: "test-card", essay: "x", key: "c", dto: { n: 1 } }),
    ).toEqual([]);
    expect(
      validateSnapshot({ format: 1, kind: "test-card", essay: "x", key: "c", dto: { n: "1" } }),
    ).toEqual(["n not a number"]);
  });
});

describe("the size bound (AC3)", () => {
  /** the artifact each snapshot kind carries, in source bytes. */
  function carriedBytes(rel: string, e: SnapshotFile): number {
    const body = (p: string): number => (files.get(p) ?? "").length;
    switch (e.kind) {
      case "editor-doc":
        return (
          body(
            e.key === "published" ? "published.md" : `drafts/${e.key}.md`,
          ) +
          (JSON.parse(convert.outputs.get("correspondence/v1-review/findings.json") ?? "null") &&
          ["v1", "v2"].includes(e.key)
            ? convert.outputs.get(`correspondence/${e.key}-review/findings.json`)!.length +
              convert.outputs.get(`correspondence/${e.key}-review/labels.json`)!.length
            : 0)
        );
      case "artifact-page":
        return body(e.key);
      // 218a — the run/record side carries its whole correspondence round plus the sidecars.
      case "dossier": {
        const dir = `correspondence/${e.key}`;
        return (
          [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).reduce((n, p) => n + body(p), 0) +
          [...convert.outputs.keys()]
            .filter((k) => k.startsWith(`${dir}/`) || k.endsWith(`${e.key.split("-")[0]}-response-ledger.json`))
            .reduce((n, k) => n + (convert.outputs.get(k)?.length ?? 0), 0)
        );
      }
      case "run-report":
        return convert.outputs.get(`correspondence/${e.key}/01-claim-ledger.json`)?.length ?? 0;
      case "timeline":
      case "card-facts":
        return body("index.json") + body("versions.json");
      case "figure-image":
        return 0; // the card references the PNG by route URI — it carries no bytes
      case "version-diff": {
        const [n, m] = e.key.split(":").map(Number);
        const before = n === 4 ? "published.md" : `drafts/v${n}.md`;
        const after = m === 4 ? "published.md" : `drafts/v${m}.md`;
        const art = convert.outputs.get(`what-changed/v${n}-v${m}.json`) ?? "";
        return body(before) + body(after) + art.length;
      }
      case "what-changed": {
        const [f, t] = e.key.split("-");
        const art = convert.outputs.get(`what-changed/${e.key}.json`) ?? "";
        return (
          art.length +
          body(f === "published" ? "published.md" : `drafts/${f}.md`) +
          body(t === "published" ? "published.md" : `drafts/${t}.md`)
        );
      }
      case "versions":
      case "files":
        return body("index.json") + body("versions.json");
      case "projects":
        return body("versions.json");
      default:
        return 0;
    }
  }

  it("no snapshot exceeds its one artifact plus the declared envelope", () => {
    for (const { path, env: e } of snapshotEnvelopes(outputs)) {
      const bytes = outputs.get(path)!;
      const kind = e.kind as keyof typeof ENVELOPE_BYTES;
      const envelope = ENVELOPE_BYTES[kind] ?? 0;
      expect(
        bytes.length,
        `${path} (${bytes.length} > ${carriedBytes(path, e)} + ${envelope})`,
      ).toBeLessThanOrEqual(carriedBytes(path, e) + envelope);
    }
    // and the hard REQ-CORPUS-9 point: no artifact page carries a second artifact's bytes
    for (const { env: e } of snapshotEnvelopes(outputs))
      if (e.kind === "artifact-page")
        expect((e.dto as EditorDocDto).markdown).toBe(files.get(e.key));
  });

  it("no snapshot JSON is imported by any SPA module", () => {
    const spa = join(ROOT, "apps/web/src");
    for (const p of walk(spa)) {
      if (!/\.(ts|tsx)$/.test(p)) continue;
      // test files never enter client bundles — the dossier-snapshot test reads the committed
      // snapshots by path (218a's colocated DossierViewData check); shipped code still may not.
      if (/\.test\.(ts|tsx)$/.test(p)) continue;
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/demo-corpus|fixtures\/synthetic|snapshots\//);
    }
  });
});

describe("labels + copy (AC5)", () => {
  it("every generated label and marker string passes lintCopy; no 'author' for an agent", () => {
    const entries: [string, string][] = [];
    for (const { env: e } of snapshotEnvelopes(outputs)) {
      const demo = (e.dto as { demo?: { importRule?: Record<string, string>; roles?: Record<string, string>; fragmentsNote?: string } }).demo;
      for (const [k, v] of Object.entries(demo?.importRule ?? {}))
        entries.push([`importRule.${k}`, v]);
      for (const [k, v] of Object.entries(demo?.roles ?? {})) entries.push([`roles.${k}`, v]);
      if (demo?.fragmentsNote) entries.push(["fragmentsNote", demo.fragmentsNote]);
      for (const f of (e.dto as EditorDocDto).findings ?? [])
        if (typeof f.sourceLabel === "string") entries.push([`finding ${f.findingId}`, f.sourceLabel]);
      if ((e.dto as VersionRailDto).drafts)
        for (const d of (e.dto as VersionRailDto).drafts)
          if (d.label) entries.push([`draft ${d.draftId} label`, d.label]);
    }
    expect(entries.length).toBeGreaterThan(10);
    expect(lintCopy(entries)).toEqual([]);
    for (const [, v] of entries) expect(v).not.toMatch(/\bthe author\b/i);
  });
});

describe("the project row + drift (AC1/AC6)", () => {
  it("the row is keyed by essay key — never a demo~ slug", () => {
    const row = result.row satisfies ProjectRow;
    expect(row).toMatchObject({ slug: SLUG, headDraftId: "published", headDraftN: 4 });
    expect(JSON.stringify(result.row)).not.toContain("demo~");
  });

  it("re-projection is byte-identical to the committed synthetic snapshots", () => {
    if (REGEN) {
      for (const [rel, bytes] of outputs) {
        const dest = join(SNAPSHOTS, rel);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, bytes);
      }
      writeFileSync(
        join(SNAPSHOTS, "..", "projects.json"),
        canonicalJson({ format: 1, kind: "projects", essay: "*", key: "projects", dto: [result.row] }),
      );
      return;
    }
    const committed = [...walk(SNAPSHOTS)]
      .map((p) => relative(SNAPSHOTS, p).replace(/\\/g, "/"))
      .sort();
    const emitted = [...outputs.keys()].sort();
    expect(emitted).toEqual(committed);
    for (const rel of emitted)
      expect(outputs.get(rel), `snapshot ${rel} byte-equality`).toBe(
        readFileSync(join(SNAPSHOTS, rel), "utf8"),
      );
    const projects = JSON.parse(readFileSync(join(SNAPSHOTS, "..", "projects.json"), "utf8"));
    expect(projects.dto).toEqual([result.row]);
    // a second run produces identical bytes (determinism)
    const again = projectEssay({
      essay: SLUG,
      files,
      convert,
      exportDate: manifest.exportDate,
      provenance,
      facts,
    });
    for (const [rel, bytes] of outputs) expect(again.outputs.get(rel)).toBe(bytes);
  });
});
