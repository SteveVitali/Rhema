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
  ["constitution-of-reason", "structure-plan.json"],
];

describe("sidecar schemas validate the three real projects' fixtures (AC6, REQ-SPEC-12)", () => {
  it.each(FIXTURES)("%s / %s validates", (project, file) => {
    const doc = loadFixture(project, file);
    const { schema } = SIDECAR_REGISTRY[file];
    expect(() => schema.parse(doc)).not.toThrow();
  });

  it("covers all six sidecar kinds across the fixtures", () => {
    const covered = new Set(FIXTURES.map(([, f]) => f));
    expect(covered).toEqual(new Set(Object.keys(SIDECAR_REGISTRY)));
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

  it("the registry marks the five anchor-bearing sidecars", () => {
    expect(new Set(anchorBearing)).toEqual(
      new Set([
        "findings.json",
        "01-claim-ledger.json",
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
