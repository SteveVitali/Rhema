import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { anchorSchema, ANCHOR_FIELD_SHAPE } from "./domain/anchor.js";
import { SIDECAR_REGISTRY, type SidecarFilename } from "./sidecars.js";

// AC6: the sidecar schemas validate the three real projects' dossier fixtures. AC8 (REQ-OBJ-16): every
// anchor-bearing sidecar uses §11.3 Anchor verbatim. Both deterministic.

const FIXTURE_DIR = fileURLToPath(new URL("../test/fixtures/", import.meta.url));
function loadFixture(project: string, file: SidecarFilename): unknown {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${project}/${file}`, "utf8"));
}

// Which fixtures exist per project (real-project-derived).
const FIXTURES: Array<[string, SidecarFilename]> = [
  ["the-politics-of-visibility", "01-claim-ledger.json"],
  ["the-politics-of-visibility", "findings.json"],
  ["the-politics-of-visibility", "rubric.json"],
  ["the-politics-of-visibility", "response-ledger.json"],
  ["the-politics-of-visibility", "cut-list.json"],
  ["structure-of-political-difference", "01-claim-ledger.json"],
  ["constitution-of-reason", "01-claim-ledger.json"],
  ["constitution-of-reason", "03-claim-ledger.json"],
  ["constitution-of-reason", "structure-plan.json"],
];

describe("sidecar schemas validate the three real projects' fixtures (AC6, REQ-SPEC-12)", () => {
  it.each(FIXTURES)("%s / %s validates", (project, file) => {
    const doc = loadFixture(project, file);
    const { schema } = SIDECAR_REGISTRY[file];
    expect(() => schema.parse(doc)).not.toThrow();
  });

  it("covers all seven sidecar kinds across the fixtures", () => {
    const covered = new Set(FIXTURES.map(([, f]) => f));
    expect(covered).toEqual(new Set(Object.keys(SIDECAR_REGISTRY)));
  });

  // D-P0.15h-1 (diagnosed live): the skill authors the ledger with the review protocol's HUMAN verdict
  // vocabulary (Title Case + spaces) while the enum is snake_case — a faithful ledger failed sidecar_validates
  // and blocked the phase. The sidecar enums now coerce the human form → canonical, so a real ledger validates.
  it("coerces the skill's human verdict vocabulary to the canonical enum (01-claim-ledger.json)", () => {
    const doc = {
      sidecar: "claim_ledger",
      version: 1,
      claims: [
        { ordinal: 0, text: "A tier-1 factual claim.", tier: 1, verdict: "Contradicted" },
        { ordinal: 1, text: "Another claim.", tier: 2, verdict: "Substantially accurate" },
        { ordinal: 2, text: "A third.", tier: 1, verdict: "Misleading in context" },
        { ordinal: 3, text: "A fourth.", tier: 3, verdict: "Unverifiable" },
      ],
    };
    const parsed = SIDECAR_REGISTRY["01-claim-ledger.json"].schema.parse(doc) as {
      claims: Array<{ verdict: string }>;
    };
    expect(parsed.claims.map((c) => c.verdict)).toEqual([
      "contradicted",
      "substantially_accurate",
      "misleading_in_context",
      "unverifiable",
    ]);
  });

  it("coerces human forms in findings/rubric too, and still REJECTS a genuinely invalid verdict", () => {
    const findings = {
      sidecar: "findings",
      version: 1,
      findings: [
        {
          ordinal: 0,
          kind: "argument",
          severity: "Major",
          origin: "Second read",
          anchor: null,
          title: "t",
          body: "b",
          evidence: { verdict: "Contradicted", urls: [] },
          rubricDims: ["Evidence accuracy"],
        },
      ],
    };
    const p = SIDECAR_REGISTRY["findings.json"].schema.parse(findings) as {
      findings: Array<{ severity: string; origin: string; evidence?: { verdict?: string } }>;
    };
    expect(p.findings[0]!.severity).toBe("major");
    expect(p.findings[0]!.origin).toBe("second_read");
    expect(p.findings[0]!.evidence!.verdict).toBe("contradicted");
    // a value that does not canonicalize to any member is still rejected (coercion never masks a real error).
    const bad = { ...findings, findings: [{ ...findings.findings[0], severity: "catastrophic" }] };
    expect(() => SIDECAR_REGISTRY["findings.json"].schema.parse(bad)).toThrow();
  });

  // D-P0.15h-1 (second live failure): the skill also authors numeric fields as STRINGS and the envelope kind
  // with a hyphen — a faithful ledger arrived as {sidecar:"claim-ledger", version:"1", tier:"1"} and failed
  // sidecar_validates. The envelope + numeric literals now coerce string→number and hyphen→underscore.
  it("coerces a string version / hyphenated kind / string tier in the envelope + numeric fields", () => {
    const doc = {
      sidecar: "claim-ledger",
      version: "1",
      claims: [{ ordinal: 0, text: "A claim.", tier: "2", verdict: "verified" }],
    };
    const parsed = SIDECAR_REGISTRY["01-claim-ledger.json"].schema.parse(doc) as {
      sidecar: string;
      version: number;
      claims: Array<{ tier: number }>;
    };
    expect(parsed.sidecar).toBe("claim_ledger");
    expect(parsed.version).toBe(1);
    expect(parsed.claims[0]!.tier).toBe(2);
  });

  it("coerces a string rubric score, and still REJECTS an out-of-range numeric field", () => {
    const ok = {
      sidecar: "rubric",
      version: 1,
      dimensions: [{ dimension: "prose", score: "4" }],
    };
    const parsed = SIDECAR_REGISTRY["rubric.json"].schema.parse(ok) as {
      dimensions: Array<{ score: number }>;
    };
    expect(parsed.dimensions[0]!.score).toBe(4);
    // a numeric string that is not a member (6 is out of 1–5) is still rejected — coercion never masks it.
    const bad = { ...ok, dimensions: [{ dimension: "prose", score: "6" }] };
    expect(() => SIDECAR_REGISTRY["rubric.json"].schema.parse(bad)).toThrow();
    // a wrong envelope kind is still rejected.
    const badKind = { ...ok, sidecar: "rubrik" };
    expect(() => SIDECAR_REGISTRY["rubric.json"].schema.parse(badKind)).toThrow();
  });

  it("a re-review findings sidecar carries carriesObligationId + obligationCounts (REQ-OBJ-4/REQ-WF-7)", () => {
    const doc = loadFixture("the-politics-of-visibility", "findings.json") as {
      findings: Array<Record<string, unknown>>;
      obligationCounts?: unknown;
    };
    doc.findings[0]!.carriesObligationId = "01J0OBLIGATION00000000000A";
    doc.obligationCounts = { carried: 3, closed: 1, new: 2 };
    const parsed = SIDECAR_REGISTRY["findings.json"].schema.parse(doc) as {
      findings: Array<{ carriesObligationId?: string }>;
      obligationCounts?: { carried: number; closed: number; new: number };
    };
    expect(parsed.findings[0]!.carriesObligationId).toBe("01J0OBLIGATION00000000000A");
    expect(parsed.obligationCounts).toEqual({ carried: 3, closed: 1, new: 2 });
  });

  it("both v0.3 re-review fields are optional (a first review's sidecar omits them)", () => {
    const doc = loadFixture("the-politics-of-visibility", "findings.json");
    const parsed = SIDECAR_REGISTRY["findings.json"].schema.parse(doc) as { obligationCounts?: unknown };
    expect(parsed.obligationCounts).toBeUndefined();
  });

  it("a ClaimVerdict drift in a real ledger fixture is rejected (REQ-OBJ-17)", () => {
    const doc = loadFixture("structure-of-political-difference", "01-claim-ledger.json") as {
      claims: Array<{ verdict: string }>;
    };
    doc.claims[1]!.verdict = "mostly_misleading"; // drift the real 'misleading_in_context'
    expect(() => SIDECAR_REGISTRY["01-claim-ledger.json"].schema.parse(doc)).toThrow();
  });
});

// Deep-find the first object that looks like an anchor (has a blockId or a startOffset).
function findAnchorHost(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const el of node) {
      const hit = findAnchorHost(el);
      if (hit) return hit;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.anchor && typeof o.anchor === "object") return o;
    for (const v of Object.values(o)) {
      const hit = findAnchorHost(v);
      if (hit) return hit;
    }
  }
  return null;
}

describe("every anchor-bearing sidecar uses §11.3 Anchor verbatim (AC8, REQ-OBJ-16)", () => {
  const anchorBearing = (Object.keys(SIDECAR_REGISTRY) as SidecarFilename[]).filter(
    (f) => SIDECAR_REGISTRY[f].anchorBearing,
  );

  it("the registry marks the six anchor-bearing sidecars", () => {
    expect(new Set(anchorBearing)).toEqual(
      new Set([
        "findings.json",
        "01-claim-ledger.json",
        "03-claim-ledger.json",
        "structure-plan.json",
        "response-ledger.json",
        "cut-list.json",
      ]),
    );
  });

  it("Anchor has exactly the §11.3 fields", () => {
    expect(Object.keys(ANCHOR_FIELD_SHAPE).sort()).toEqual(
      ["blockId", "confidence", "endOffset", "quote", "startOffset", "unanchored"].sort(),
    );
    // a Yjs-relative-position shape (relStart/relEnd) is NOT the anchor of record — it must be rejected.
    expect(() =>
      anchorSchema.parse({ relStart: "a1", relEnd: "a2", quote: "x", confidence: 0.9 }),
    ).toThrow();
    // extra keys are rejected (strict), so a "drifted" anchor can't sneak through
    expect(() =>
      anchorSchema.parse({
        blockId: "b",
        quote: "x",
        startOffset: 0,
        endOffset: 1,
        confidence: 0.9,
        relStart: "z",
      }),
    ).toThrow();
  });

  it.each(anchorBearing.map((f) => [f] as [SidecarFilename]))(
    "%s rejects a drifted anchor in a real fixture",
    (file) => {
      // find a project fixture for this sidecar that has an anchor
      const project = FIXTURES.find(([, f]) => f === file)![0];
      const doc = loadFixture(project, file);
      const host = findAnchorHost(doc);
      expect(host, `${file} fixture must contain an anchor to exercise REQ-OBJ-16`).not.toBeNull();
      // Drift the anchor into a Yjs-relative shape; the sidecar must reject it because it embeds the strict Anchor.
      host!.anchor = { relStart: "a1", relEnd: "a2", quote: "x", confidence: 0.9 };
      expect(() => SIDECAR_REGISTRY[file].schema.parse(doc)).toThrow();
    },
  );
});
