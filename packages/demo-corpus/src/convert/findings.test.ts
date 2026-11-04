import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { parseSidecar } from "@rhema/protocols";
import type { ClaimVerdict } from "@rhema/contracts";
import { canonicalJson } from "./index.js";
import { convertClaimLedger } from "./claim-ledger.js";
import { convertFindings } from "./findings.js";
import { convertRubric } from "./rubric.js";
import { sourceNoteIndex } from "./source-note.js";
import { reviewLabels, lintGeneratedLabels, CONVERTER_ASSIGNED_FIELDS, IMPORT_RULE_NOTE } from "./labels.js";
import { isRawOnly } from "./raw-only.js";
import { DEMO_DEFAULTS } from "./demo-defaults.js";
import { OverrideBook, readConvertOverrides } from "./overrides.js";

// REQ-CONV-2/7/8/9/12/13/14/16 + REQ-CORPUS-15 — the letter + second read → findings/rubric
// converters on the synthetic fixture: declared R2 §2.2 rules, REQ-CONV-16 defaults, the
// verbatim invariant, the parseSidecar gate, import-rule labels, the RAW_ONLY registry, and
// canonical-JSON goldens (findings, rubric, the review-level labels.json, rung histogram).
// Regenerate goldens with `RHEMA_REGEN_GOLDENS=1 pnpm exec vitest run …findings.test.ts`.

const SLUG = "the-borrowed-commons";
const PKG = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS = join(PKG, "fixtures/synthetic/corpus", SLUG);
const GOLDENS = join(PKG, "fixtures/synthetic/goldens", SLUG);
const REGEN = process.env.RHEMA_REGEN_GOLDENS === "1";
const read = (p: string) => readFileSync(join(CORPUS, p), "utf8");

const notes = sourceNoteIndex(
  ["author", "editor"].flatMap((who) =>
    readdirSync(join(CORPUS, "agents", who, "research", "sources")).map((f) => ({
      slug: f.replace(/\.md$/, ""),
      markdown: read(`agents/${who}/research/sources/${f}`),
    })),
  ),
);

const ROUNDS = ["v1", "v2"] as const;
const converted = ROUNDS.map((round) => {
  const letterMd = read(`correspondence/${round}-review/editors-letter.md`);
  const srPath = `correspondence/${round}-review/05-second-read.md`;
  const secondReadMarkdown = existsSync(join(CORPUS, srPath)) ? read(srPath) : undefined;
  const draftMarkdown = read(`drafts/${round}.md`);
  const ledger = convertClaimLedger(read(`correspondence/${round}-review/01-claim-ledger.md`), {
    draftMarkdown,
    sourceNotes: notes,
  });
  if (!ledger.ok) throw new Error(`${round} claim-ledger conversion failed`);
  const claimVerdicts = new Map<string, ClaimVerdict>(
    ledger.value.labels.claims.map((l) => [
      l.id,
      ledger.value.sidecar.claims[l.ordinal]!.verdict,
    ]),
  );
  const checkDate = ledger.value.meta.checkDate ?? undefined;
  const r = convertFindings(letterMd, {
    draftMarkdown,
    secondReadMarkdown,
    reviewDate: checkDate,
    claimVerdicts,
  });
  const rub = convertRubric(letterMd);
  return {
    round,
    letterMd,
    secondReadMarkdown,
    draftMarkdown,
    ledger: ledger.value,
    r,
    rub,
    labels: r.ok
      ? reviewLabels({ claims: ledger.value.labels.claims, findings: r.value.labels })
      : undefined,
  };
});

function golden(rel: string, value: unknown): void {
  const path = join(GOLDENS, rel);
  const bytes = canonicalJson(value);
  if (REGEN) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return;
  }
  expect(existsSync(path), `golden ${rel} — regenerate with RHEMA_REGEN_GOLDENS=1`).toBe(true);
  expect(bytes, `golden ${rel} byte-equality`).toBe(readFileSync(path, "utf8"));
}

const v1 = converted[0]!;
const v2 = converted[1]!;

describe("findings conversion (REQ-CONV-7/2; R2 §2.2)", () => {
  it.each(ROUNDS)("%s converts: parseSidecar ok, zero errors", (round) => {
    const c = converted.find((x) => x.round === round)!;
    expect(c.r.ok).toBe(true);
    if (!c.r.ok) return;
    expect(c.r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(parseSidecar("findings.json", { json: c.r.value.sidecar }).parseStatus).toBe("ok");
  });

  it("v1 emits the R2 §2.2 table: one_thing, majors, strengths, minors, line notes, CaR, OQ — majors carry all four parts", () => {
    if (!v1.r.ok) throw new Error("v1 failed");
    const f = v1.r.value.sidecar.findings;
    expect(f).toHaveLength(14);
    const at = (o: number) => f.find((x) => x.ordinal === o)!;
    expect(at(0)).toMatchObject({
      letterSection: "one_thing",
      severity: "major",
      origin: "editor",
      title: "The one thing",
    });
    expect(at(1)).toMatchObject({
      letterSection: "major",
      severity: "major",
      kind: "argument",
      origin: "both",
      reconciliation: "kept",
      rubricDims: ["thesis_contribution", "argument_rigor"],
    });
    expect(at(1)!.body).toContain("**The problem:**");
    expect(at(2)).toMatchObject({
      letterSection: "major",
      kind: "structure",
      origin: "both",
      reconciliation: "kept",
      rubricDims: ["structure"],
    });
    // strengths → craft/note/strength (REQ-CONV-16)
    for (const o of [3, 4, 5, 6, 7])
      expect(at(o)).toMatchObject({ letterSection: "strength", severity: "note", kind: "craft" });
    // minors: C7b-citing + quotation-hygiene rows are claim kind
    expect(at(8)).toMatchObject({ severity: "minor", kind: "claim" });
    expect(at(8)!.evidence?.verdict).toBe("contradicted");
    expect(at(9)).toMatchObject({ severity: "minor", kind: "claim" });
    expect(at(10)).toMatchObject({ severity: "note", kind: "craft" });
    expect(at(12)).toMatchObject({
      letterSection: "considered_rejected",
      severity: "note",
      kind: "argument",
      origin: "editor",
      anchor: null,
    });
    expect(at(13)).toMatchObject({
      letterSection: "roadmap",
      severity: "note",
      kind: "argument",
      anchor: null,
    });
    // no `suggestion` anywhere (R2 §2.2); no `blocking` (REQ-CONV-16)
    for (const row of f) {
      expect(row.suggestion).toBeUndefined();
      expect(row.severity).not.toBe("blocking");
    }
    // merged objections ride the majors' labels (the 217 `SR n` join)
    const labels = v1.r.value.labels;
    expect(labels.find((l) => l.id === "Major 1")?.aliases).toEqual(["SR 1"]);
    expect(labels.find((l) => l.id === "OQ 1")?.ordinal).toBe(13);
  });

  it("v2 minimal variant converts: one finding (the one thing), 8-dim rubric", () => {
    if (!v2.r.ok || !v2.rub.ok) throw new Error("v2 failed");
    expect(v2.r.value.sidecar.findings).toHaveLength(1);
    expect(v2.r.value.sidecar.findings[0]).toMatchObject({
      letterSection: "one_thing",
      severity: "major",
    });
    expect(v2.rub.value.sidecar.dimensions).toHaveLength(8);
  });
});

describe("verbatim invariant (REQ-CONV-13)", () => {
  it("every emitted title/body is a substring of the sanitized source, apart from declared truncation", () => {
    for (const c of converted) {
      if (!c.r.ok) throw new Error("conversion failed");
      const sources = [c.letterMd, c.secondReadMarkdown ?? ""];
      for (const row of c.r.value.sidecar.findings) {
        const src = sources.find((s) => s.includes(row.title));
        expect(src, `${c.round} ordinal ${row.ordinal} title`).toBeTruthy();
        const body = row.body.endsWith("…") ? row.body.slice(0, -1) : row.body;
        expect(
          sources.some((s) => s.includes(body)),
          `${c.round} ordinal ${row.ordinal} body`,
        ).toBe(true);
      }
    }
  });
});

describe("rubric conversion (REQ-CONV-9/2)", () => {
  it("maps all eight names; cap only where Basis states one; no aggregate", () => {
    if (!v1.rub.ok) throw new Error("rubric failed");
    const d = v1.rub.value.sidecar.dimensions;
    expect(d.map((x) => x.dimension)).toEqual([
      "thesis_contribution",
      "argument_rigor",
      "evidence_accuracy",
      "originality_situatedness",
      "structure",
      "prose",
      "voice_audience_fit",
      "intellectual_honesty",
    ]);
    const capped = d.filter((x) => x.cap);
    expect(capped.map((x) => x.dimension)).toEqual(["evidence_accuracy"]);
    expect(capped[0]!.cap!.at).toBe(3);
    expect(capped[0]!.cap!.reason).toContain("cap");
    // no aggregate score field anywhere in the emitted sidecar
    const json = JSON.stringify(v1.rub.value.sidecar);
    expect(json).not.toMatch(/aggregate|total|average/i);
    expect(Object.keys(v1.rub.value.sidecar).sort()).toEqual(["dimensions", "sidecar", "version"]);
  });
});

describe("negative controls (R2 header; REQ-CONV-2)", () => {
  it.each(["Thesis & contribution", "Voice & audience fit"])(
    'raw rubric name "%s" fails the real validator (the explicit map is required)',
    (raw) => {
      if (!v1.rub.ok) throw new Error("rubric failed");
      const j = {
        ...v1.rub.value.sidecar,
        dimensions: [{ ...v1.rub.value.sidecar.dimensions[0]!, dimension: raw }],
      };
      expect(parseSidecar("rubric.json", { json: j }).parseStatus).toBe("failed");
    },
  );
  it('letterSection: "minor" fails the real validator', () => {
    if (!v1.r.ok) throw new Error("findings failed");
    const j = {
      ...v1.r.value.sidecar,
      findings: [{ ...v1.r.value.sidecar.findings[8]!, letterSection: "minor" }],
    };
    expect(parseSidecar("findings.json", { json: j }).parseStatus).toBe("failed");
  });
});

describe("import-rule labels (REQ-CONV-14)", () => {
  it("every converter-assigned field has a marker in labels.json; a field without one fails", () => {
    for (const c of converted) {
      const labels = c.labels!;
      for (const f of [
        ...CONVERTER_ASSIGNED_FIELDS.claims,
        ...CONVERTER_ASSIGNED_FIELDS.findings,
      ])
        expect(labels.importRule[f], f).toBe(IMPORT_RULE_NOTE);
      expect(Object.keys(labels.importRule)).toHaveLength(
        CONVERTER_ASSIGNED_FIELDS.claims.length + CONVERTER_ASSIGNED_FIELDS.findings.length,
      );
      // S-10 roles + generated label text pass lintCopy
      expect(lintGeneratedLabels(labels)).toEqual([]);
    }
  });
});

describe("RAW_ONLY registry (REQ-CONV-13; R2 §6)", () => {
  it("classifies every corpus artifact file", () => {
    const walk = (dir: string): string[] =>
      readdirSync(join(CORPUS, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk("").map((p) => relative(CORPUS, join(CORPUS, p)).replace(/\\/g, "/"));
    const raw = files.filter((f) => f.endsWith(".md")).filter(isRawOnly);
    for (const expected of [
      "correspondence/v1-review/00-piece-brief.md",
      "correspondence/v1-review/02-discourse-report.md",
      "correspondence/v1-review/03-argument-notes.md",
      "correspondence/v1-review/04-craft-notes.md",
      "correspondence/v1-response.md",
      "correspondence/v1-drafting-note.md",
      "correspondence/v2-response.md",
      "agents/author/drafting/v1/00-commissioning-brief.md",
      "agents/author/drafting/v1/03-claim-ledger.md",
      "agents/author/drafting/v1/04-draft-ledger.md",
      "agents/author/drafting/v1/06-fidelity-audit.md",
      "agents/author/research/index.md",
      "agents/editor/research/sources/freeform-gazette-note.md",
    ])
      expect(raw, expected).toContain(expected);
    // structured artifacts are never raw-only
    for (const not of [
      "correspondence/v1-review/01-claim-ledger.md",
      "correspondence/v1-review/editors-letter.md",
      "correspondence/v1-review/05-second-read.md",
      "agents/author/ledgers/v1-response-ledger.md",
      "agents/author/drafting/v1/02-structure-plan.md",
      "drafts/v1.md",
    ])
      expect(raw, not).not.toContain(not);
  });
});

describe("goldens (REQ-CONV-12, synthetic findings/rubric part)", () => {
  it("sidecars + review labels + rung histogram are canonical-JSON byte-equal on re-run", () => {
    for (const c of converted) {
      if (!c.r.ok || !c.rub.ok) throw new Error("conversion failed");
      const dir = `correspondence/${c.round}-review`;
      golden(`${dir}/findings.json`, c.r.value.sidecar);
      golden(`${dir}/rubric.json`, c.rub.value.sidecar);
      golden(`${dir}/labels.json`, c.labels);
    }
    golden("findings-anchor-histogram.json", {
      version: 1,
      files: Object.fromEntries(
        converted.map((c) => [
          `correspondence/${c.round}-review/{editors-letter,05-second-read}.md`,
          c.r.ok ? c.r.value.meta.anchorRungs : {},
        ]),
      ),
    });
    // majors' Where anchors resolved through the ladder — incl. the section-heading fallback.
    if (!v1.r.ok) throw new Error("v1 failed");
    const majors = v1.r.value.sidecar.findings.filter((f) => f.letterSection === "major");
    expect(majors.every((f) => f.anchor !== null)).toBe(true);
  });
});

describe("reconciliation overrides (REQ-CONV-8/6)", () => {
  it("a planted heuristic disagreement surfaces as a diagnostic warning; the override wins", () => {
    const file = readConvertOverrides({
      version: 1,
      overrides: [{ kind: "reconciliation", objection: "1", outcome: "kept", cite: "x.md:9" }],
    });
    if (!file.ok) throw new Error("override file rejected");
    const r = convertFindings(v1.letterMd, {
      draftMarkdown: v1.draftMarkdown,
      secondReadMarkdown: v1.secondReadMarkdown,
      overrides: OverrideBook.from(file.value),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diagnostics.some((d) => d.code === "reconcile_disagreement")).toBe(true);
    // objection 1 kept → a standalone second_read finding now exists
    expect(
      r.value.sidecar.findings.some(
        (f) => f.origin === "second_read" && f.reconciliation === "kept",
      ),
    ).toBe(true);
    // and Major 1 reverts to editor-only origin
    expect(r.value.sidecar.findings[1]).toMatchObject({ origin: "editor" });
  });

  it("an unused reconciliation override fails the conversion", () => {
    const file = readConvertOverrides({
      version: 1,
      overrides: [{ kind: "reconciliation", objection: "99", outcome: "kept", cite: "x.md:9" }],
    });
    if (!file.ok) throw new Error("override file rejected");
    const r = convertFindings(v1.letterMd, {
      draftMarkdown: v1.draftMarkdown,
      secondReadMarkdown: v1.secondReadMarkdown,
      overrides: OverrideBook.from(file.value),
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "override_unconsumed")).toBe(true);
  });
});

describe("REQ-CONV-16 demo defaults (GD-DEMO-CONV.R7)", () => {
  it("the declared constant set owns the defaults", () => {
    expect(DEMO_DEFAULTS.oneThing).toEqual({ severity: "major", letterSection: "one_thing" });
    expect(DEMO_DEFAULTS.strength).toEqual({
      kind: "craft",
      severity: "note",
      letterSection: "strength",
    });
    expect(DEMO_DEFAULTS.blockingPermitted).toBe(false);
    expect(DEMO_DEFAULTS.unrepresentedResponseRows).toBe("raw_table_only");
  });
});
