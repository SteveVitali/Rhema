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
import {
  composeDeliveredSummary,
  deliveredRecordCounts,
  parseLetterSections,
} from "@rhema/findings-core";
import { statusMeters } from "@rhema/editor";
import type { EditorDocDto } from "@rhema/api-client";
import { convertProject, readConvertOverrides } from "../convert/index.js";
import { parsePublished } from "../versions.js";
import { projectEssay } from "./project.js";
import {
  registerDocumentKinds,
  registeredKinds,
  snapshotEnvelopes,
  validateSnapshot,
  envelopeViolations,
} from "./harness.js";
import {
  demoAssetUri,
  inferRuns,
  markdownImageRefs,
  readFacts,
  registerRunKinds,
} from "./replay.js";
import type { SnapshotFile } from "./model.js";

// 218a_R7DEM.3b — the run/record-side snapshots on the synthetic fixture: replayed runs (S-9),
// dossier/run-report/timeline, the figure image DTO (S-7), and the card facts/counts (REQ-TOUR-1,
// REQ-SYNC-2). Regenerate: `RHEMA_REGEN_SNAPSHOTS=1 pnpm exec vitest run …replay.test.ts` — the
// drift leg lives in project.test.ts over the same emitted set.

const SLUG = "the-borrowed-commons";
const PKG = fileURLToPath(new URL("../../", import.meta.url));
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
const outputs = convert.outputs;

const manifest = JSON.parse(readFileSync(join(CORPUS, "export-manifest.json"), "utf8")) as {
  exportDate: string;
};
const provenance = readFileSync(join(CORPUS, "PROVENANCE.md"), "utf8");
const factsFile = readFacts(readFileSync(join(CORPUS, "_rules/facts.json"), "utf8"));
const facts = factsFile.slugs?.[SLUG];

const result = projectEssay({
  essay: SLUG,
  files,
  convert,
  exportDate: manifest.exportDate,
  provenance,
  facts,
});
const emitted = result.outputs;
const env = (rel: string): SnapshotFile => {
  const bytes = emitted.get(rel);
  expect(bytes, rel).toBeTruthy();
  return JSON.parse(bytes!) as SnapshotFile;
};
const dto = <T>(rel: string): T => env(rel).dto as T;

registerDocumentKinds();
registerRunKinds();

interface CardDto {
  runId: string;
  state: string;
  replayed?: boolean;
  recordSource?: string;
  phaseSource?: string;
  phases: { key: string; ordinal: number; status: string; credits?: number; durationMs?: number }[];
  artifacts?: string[];
  deliverables?: { key: string; count?: number }[];
  delivered?: unknown;
  approvals?: unknown;
  notRecorded?: string[];
  decisions?: unknown[];
  actions?: string[];
  [k: string]: unknown;
}
interface DossierDtoShape {
  replayed: boolean;
  slug: string;
  runId: string;
  projectTitle: string;
  versionLabel: string;
  reviewedDraftId?: string;
  openObligations: number;
  addressedObligations: number;
  runSummary: { runId: string; workflow: string; state: string; createdAt: string | null; card: CardDto };
  letterTitle: string;
  letterSections: { id: string; title: string; paragraphs: string[] }[];
  claims: { id: string; ordinal: number; text: string; verdict: string; tier: number }[];
  fetchLog: string[];
  findings: { id: string; ordinal: number; letterSection?: string; severity: string }[];
  rubric: { dimension: string; score: number }[];
  priorRubric?: { dimension: string; score: number }[];
  findingObligations?: Record<string, string>;
  accessReport?: unknown;
  rigor?: string;
  demo?: { importRule?: Record<string, string>; roles?: Record<string, string>; notRecorded?: string[] };
}

const runs = inferRuns({ versions: result.versions, files });

describe("every run/record snapshot per key (AC1)", () => {
  it("one dossier + run-report per reviewed round, one timeline/card-facts, one card per image", () => {
    expect(runs.map((r) => r.runId)).toEqual(["v1-review", "v2-review"]);
    for (const r of runs) {
      expect(emitted.has(`dossier/${r.runId}.json`), r.runId).toBe(true);
      expect(emitted.has(`run-report/${r.runId}.json`), r.runId).toBe(true);
    }
    expect(emitted.has("timeline.json")).toBe(true);
    expect(emitted.has("card-facts.json")).toBe(true);
    const figures = [...emitted.keys()].filter((k) => k.startsWith("figures/"));
    expect(figures).toEqual(["figures/figure_1_signal_map.json", "figures/figure_2_load_curve.json"]);
  });

  it("a missing key is a projector error, never an empty payload", () => {
    const missing = new Map(files);
    missing.delete("correspondence/v1-review/editors-letter.md");
    expect(() =>
      projectEssay({ essay: SLUG, files: missing, convert, exportDate: manifest.exportDate, provenance, facts }),
    ).toThrow();
    // an image link with no backing artifact fails closed (S-7 / REQ-DWEB-17)
    const noImage = new Map(files);
    const idx = JSON.parse(noImage.get("index.json")!) as { artifacts: { path: string; kind: string }[] };
    idx.artifacts = idx.artifacts.filter((a) => a.kind !== "image");
    noImage.set("index.json", JSON.stringify(idx));
    expect(() =>
      projectEssay({ essay: SLUG, files: noImage, convert, exportDate: manifest.exportDate, provenance, facts }),
    ).toThrow(/image ref/);
  });
});

describe("replayed runs (S-9; REQ-DWEB-15)", () => {
  const v1Card = dto<DossierDtoShape>("dossier/v1-review.json").runSummary.card;
  const v2Card = dto<DossierDtoShape>("dossier/v2-review.json").runSummary.card;

  it("phases equal exactly the set implied by the delivered files", () => {
    expect(v1Card.phases.map((p) => p.key)).toEqual([
      "intake",
      "verification",
      "discourse",
      "argument",
      "craft",
      "second_read",
      "letter",
    ]);
    // v2's record delivers only the claim ledger + the letter
    expect(v2Card.phases.map((p) => p.key)).toEqual(["verification", "letter"]);
    expect(v1Card.phaseSource).toBe("inferred_from_delivered_files");
    expect(v1Card.phases.every((p) => p.status === "done")).toBe(true);
  });

  it("badged replayed; the card carries the delivered-record artifact list", () => {
    expect(v1Card.replayed).toBe(true);
    expect(v1Card.recordSource).toBe("agent-discourse");
    expect(v1Card.artifacts).toContain("correspondence/v1-review/editors-letter.md");
    expect(v2Card.artifacts).toEqual([
      "correspondence/v2-review/01-claim-ledger.md",
      "correspondence/v2-review/editors-letter.md",
    ]);
  });

  it("approvals come only from PROVENANCE facts; absent → 'approvals not recorded'", () => {
    expect(v1Card.approvals).toEqual([
      { round: "v1 review", decision: "revision plan approved", note: "recorded in the round log" },
    ]);
    expect(v1Card.notRecorded).not.toContain("approvals");
    // a round with no PROVENANCE fact → "not_recorded" marker + the field named
    const noFacts = projectEssay({
      essay: SLUG,
      files,
      convert,
      exportDate: manifest.exportDate,
      provenance,
      facts: { approvals: [] },
    });
    const card = (JSON.parse(noFacts.outputs.get("dossier/v1-review.json")!) as SnapshotFile)
      .dto as DossierDtoShape;
    expect(card.runSummary.card.approvals).toBe("not_recorded");
    expect(card.runSummary.card.notRecorded).toContain("approvals");
  });

  it("time/credits/model are absent-and-marked, never numeric", () => {
    for (const c of [v1Card, v2Card]) {
      expect(c.notRecorded).toEqual(expect.arrayContaining(["time", "credits", "model", "estimate"]));
      for (const k of ["spentCredits", "capCredits", "creditFraction", "elapsedMs", "estimateCredits", "modelTier"])
        expect(k in c, k).toBe(false);
      expect(c.phases.every((p) => p.credits === undefined && p.durationMs === undefined)).toBe(true);
    }
    const summary = dto<DossierDtoShape>("dossier/v1-review.json").runSummary;
    expect(summary.createdAt).toBeNull();
  });

  it("'What it delivered' equals 213's composer on the same record", () => {
    const letterMd = files.get("correspondence/v1-review/editors-letter.md")!;
    const sections = parseLetterSections(letterMd);
    const findingFacts = (JSON.parse(outputs.get("correspondence/v1-review/findings.json")!) as {
      findings: { letterSection?: string }[];
    }).findings;
    const claims = (JSON.parse(outputs.get("correspondence/v1-review/01-claim-ledger.json")!) as {
      claims: unknown[];
    }).claims;
    const expected = composeDeliveredSummary({
      letterSections: sections,
      findings: findingFacts.map((f) => ({ letterSection: f.letterSection })),
      claims: claims.length,
      links: ["dossier", "letter", "ledger"],
    });
    expect(v1Card.delivered).toEqual(expected);
  });
});

describe("the dossier snapshot", () => {
  const d1 = dto<DossierDtoShape>("dossier/v1-review.json");
  const d2 = dto<DossierDtoShape>("dossier/v2-review.json");

  it("carries the delivered record: letter, findings, claims, rubric — verbatim", () => {
    expect(d1.slug).toBe(SLUG);
    expect(d1.versionLabel).toBe("Review of v1");
    expect(d1.reviewedDraftId).toBe("v1");
    expect(d1.letterSections.length).toBeGreaterThan(0);
    expect(d1.findings.length).toBe(14);
    expect(d1.claims.length).toBe(7);
    expect(d1.claims[0]!.id).toBe("C7b"); // the recorded ledger label — needed for S-6 deep links
    expect(d1.rubric.length).toBe(8);
    expect(d1.fetchLog).toEqual([]);
    expect(d1.accessReport).toBeUndefined();
    expect(d1.rigor).toBeUndefined();
    expect(d1.demo?.notRecorded).toEqual(
      expect.arrayContaining(["rigor", "fetch_log", "access_report", "time", "credits", "model"]),
    );
  });

  it("a re-review carries the prior rubric; obligations map from the response ledger", () => {
    expect(d2.priorRubric).toEqual(d1.rubric);
    expect(d1.findingObligations?.["Major 1"]).toBe("addressed");
    expect(d1.findingObligations?.["OQ 1"]).toBe("open");
    expect(d1.addressedObligations).toBeGreaterThan(0);
  });
});

describe("the timeline snapshot (REQ-CORPUS-7)", () => {
  const tl = dto<{
    project: { slug: string; title: string };
    nextStep: { verb: string; estimateCredits: number | null; headDraftN: number | null };
    rounds: { n: number; producedN: number | null; parts: { kind: string; n?: number; workflow?: string; count?: number }[]; runs: { runId: string; subjectN: number; producedN: number | null; card: CardDto }[] }[];
    ungrouped: unknown[];
    originChip: { kind: string } | null;
    demo?: { notRecorded?: string[] };
  }>("timeline.json");

  it("one round per reviewed version, newest first, with honest produced links", () => {
    expect(tl.project.slug).toBe(SLUG);
    expect(tl.rounds.map((r) => r.n)).toEqual([2, 1]);
    // the v1 round produced v2 (response_to_review); v3 is writer-directed → produced null
    expect(tl.rounds.map((r) => r.producedN)).toEqual([null, 2]);
    expect(tl.rounds[1]!.runs[0]!.card.replayed).toBe(true);
    expect(tl.rounds[1]!.parts.map((p) => p.kind)).toEqual(["version", "run", "version"]);
    expect(tl.nextStep).toMatchObject({ verb: "none", estimateCredits: null, headDraftN: 4 });
    expect(tl.ungrouped).toEqual([]);
    expect(tl.originChip).toEqual({ kind: "outline" });
    expect(tl.demo?.notRecorded).toContain("credits");
  });
});

describe("the run-report snapshot", () => {
  const rr = dto<{
    kind: string;
    report: {
      replayed: boolean;
      runId: string;
      state: string;
      phases: { key: string; seat: string | null; source: string }[];
      claims: { checked: number; verified: number } | null;
      notRecorded: string[];
      [k: string]: unknown;
    };
    demo?: { notRecorded?: string[] };
  }>("run-report/v1-review.json");

  it("omits every money/usage figure and names them not recorded", () => {
    expect(rr.kind).toBe("ok");
    expect(rr.report.replayed).toBe(true);
    for (const k of ["spentCredits", "capCredits", "meteredCredits", "estimateCredits", "seatSplit", "flags", "drivers"])
      expect(k in rr.report, k).toBe(false);
    expect(rr.report.phases.map((p) => p.key)).toContain("letter");
    expect(rr.report.claims).toMatchObject({ checked: 7 });
    expect(rr.report.notRecorded).toEqual(expect.arrayContaining(["time", "credits", "model", "usage"]));
  });
});

describe("figure image DTO variant (S-7, RV-8)", () => {
  const fig = dto<{
    id: string;
    assetUri: string;
    specKind: string;
    provenance: string;
    versions: { n: number; label: string | null }[];
    [k: string]: unknown;
  }>("figures/figure_1_signal_map.json");

  it("imports with specKind image + imported provenance and no spec/SVG/run provenance", () => {
    expect(fig.specKind).toBe("image");
    expect(fig.provenance).toBe("imported");
    expect(fig.assetUri).toBe(demoAssetUri(SLUG, "drafts/figures/figure_1_signal_map.png"));
    expect(fig.versions).toEqual([{ n: 1, label: "imported" }]);
    for (const k of ["spec", "svg", "svgLight", "svgDark", "files", "latestRunId"])
      expect(k in fig, k).toBe(false);
  });

  it("draft image links resolve to the same route shape", () => {
    const v1 = dto<EditorDocDto & { demo?: { assetRefs?: { path: string; uri: string }[] } }>(
      "drafts/v1.json",
    );
    const refs = markdownImageRefs("drafts/v1.md", files.get("drafts/v1.md")!);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(r.startsWith("drafts/figures/")).toBe(true);
    expect(v1.demo?.assetRefs?.map((a) => a.uri)).toEqual(
      refs.map((r) => `/bff/demo/asset/${SLUG}/${r}`),
    );
  });
});

describe("card facts + counts — sole owner (REQ-TOUR-1, REQ-SYNC-2, P4-6)", () => {
  const cf = dto<{
    essay: string;
    title: string;
    subtitle: string | null;
    retitle: { from: string; to: string; atVersion: string; atLabel: string } | null;
    publishedOn: string | null;
    publishedLabel: string | null;
    publishedUrl: string | null;
    words: number;
    arc: { kind: string; draftId?: string; runId?: string; n?: number; label?: string }[];
    counts: { major: number; minor: number; strengths: number; claimsChecked: number };
  }>("card-facts.json");

  it("title/subtitle/retitle/publish stamp come from version metadata", () => {
    expect(cf.title).toBe("The Borrowed Commons: a Grammar of Shared Decay");
    expect(cf.retitle).toEqual({
      from: "The Borrowed Commons",
      to: "The Borrowed Commons: a Grammar of Shared Decay",
      atVersion: "v3",
      atLabel: "Writer-directed edit (not reviewed)",
    });
    expect(cf.publishedOn).toBe("2026-09-01");
    expect(cf.publishedUrl).toBe("https://sjsebastian.example.org/p/the-borrowed-commons");
    expect(cf.publishedLabel).toBe("Published · sjsebastian.example.org · fetched 2026-09-01");
  });

  it("the word count equals statusMeters on the Published markdown (status-bar parity)", () => {
    const body = parsePublished(files.get("published.md")!).body;
    expect(cf.words).toBe(statusMeters(body).words);
    expect(cf.words).toBe(dto<EditorDocDto>("drafts/published.json").meters!.words);
  });

  it("the arc walks versions with review beats", () => {
    expect(cf.arc.map((s) => s.kind)).toEqual([
      "draft",
      "review",
      "draft",
      "review",
      "draft",
      "draft",
    ]);
    expect(cf.arc[3]).toMatchObject({ kind: "review", runId: "v2-review" });
  });

  it("finding/claim counts equal 213's count rule on the same record — majors/minors by the declared buckets", () => {
    // the count rule is CALLED — the test recomputes from the same facts to catch any independent counting
    const fact = runs.flatMap((r) => {
      const side = JSON.parse(outputs.get(`${r.dir}/findings.json`)!) as {
        findings: { letterSection?: string; severity?: string }[];
      };
      return side.findings;
    });
    const claimTotal = runs.reduce(
      (n, r) =>
        n + (JSON.parse(outputs.get(`${r.dir}/01-claim-ledger.json`)!) as { claims: unknown[] }).claims.length,
      0,
    );
    const rule = deliveredRecordCounts({
      findings: fact.map((f) => ({ letterSection: f.letterSection })),
      claims: claimTotal,
    });
    expect(cf.counts.strengths).toBe(rule.strengths);
    expect(cf.counts.claimsChecked).toBe(rule.claims);
    // buckets: one_thing+major letter slots are majors (the one thing counted ONCE there);
    // roadmap/considered_rejected are minors; otherwise severity decides.
    let major = 0;
    let minor = 0;
    for (const f of fact) {
      const b =
        f.letterSection === "one_thing" || f.letterSection === "major"
          ? "major"
          : f.letterSection === "strength"
            ? "strength"
            : f.letterSection === "roadmap" || f.letterSection === "considered_rejected"
              ? "minor"
              : f.severity === "blocking" || f.severity === "major"
                ? "major"
                : "minor";
      if (b === "major") major++;
      else if (b === "minor") minor++;
    }
    expect(cf.counts.major).toBe(major);
    expect(cf.counts.minor).toBe(minor);
    expect(cf.counts.major + cf.counts.minor).toBe(rule.findings);
  });

  it("demoCardFacts is the only exported card-count function in the repo (grep)", async () => {
    const { execSync } = await import("node:child_process");
    const hits = execSync(
      `grep -rn "export function.*[Cc]ard.*[Cc]ount\\|export function demoCardFacts" packages apps --include="*.ts" | grep -v "dist/\\|\\.test\\.ts\\|node_modules"`,
      { encoding: "utf8" },
    ).trim();
    const lines = hits.split("\n").filter((l) => l.length > 0);
    expect(lines).toEqual([
      expect.stringContaining("demo-corpus/src/project/replay.ts"),
    ]);
    expect(lines[0]).toContain("export function demoCardFacts");
  });
});

describe("the contract/drift harness on the new kinds", () => {
  it("every emitted snapshot validates against its registered kind", () => {
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
    for (const { env: e } of snapshotEnvelopes(emitted)) {
      expect(envelopeViolations(e)).toEqual([]);
      expect(validateSnapshot(e), `${e.kind} ${e.key}`).toEqual([]);
    }
  });

  it("a forged numeric field fails its kind's validator", () => {
    const bad = dto<Record<string, unknown>>("dossier/v1-review.json");
    const card = (bad.runSummary as Record<string, unknown>).card as Record<string, unknown>;
    card["spentCredits"] = 0; // serialized zero — must NOT pass
    expect(
      validateSnapshot({ format: 1, kind: "dossier", essay: SLUG, key: "v1-review", dto: bad }),
    ).not.toEqual([]);
  });

  it("re-projection is byte-identical to the committed snapshots (drift)", () => {
    if (REGEN) {
      for (const [rel, bytes] of emitted) {
        const dest = join(SNAPSHOTS, rel);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, bytes);
      }
      return;
    }
    for (const rel of [...emitted.keys()].filter((k) => k !== "index.json")) {
      const committed = readFileSync(join(SNAPSHOTS, rel), "utf8");
      expect(emitted.get(rel), rel).toBe(committed);
    }
  });
});

describe("labels + copy (REQ-CONV-14, S-10)", () => {
  it("every generated label passes lintCopy; no 'author' for an agent", () => {
    const entries: [string, string][] = [];
    for (const { env: e } of snapshotEnvelopes(emitted)) {
      const demo = (e.dto as { demo?: { importRule?: Record<string, string>; roles?: Record<string, string>; notRecorded?: string[] } }).demo;
      for (const [k, v] of Object.entries(demo?.importRule ?? {})) entries.push([`importRule.${k}`, v]);
      for (const [k, v] of Object.entries(demo?.roles ?? {})) entries.push([`roles.${k}`, v]);
      for (const v of demo?.notRecorded ?? []) entries.push([`notRecorded`, v]);
      const d = e.dto as { versionLabel?: string; label?: string };
      if (d.versionLabel) entries.push(["versionLabel", d.versionLabel]);
    }
    expect(entries.length).toBeGreaterThan(10);
    expect(lintCopy(entries)).toEqual([]);
    for (const [, v] of entries) expect(v).not.toMatch(/\bthe author\b/i);
  });
});
