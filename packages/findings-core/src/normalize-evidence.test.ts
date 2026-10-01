import { describe, it, expect } from "vitest";
import { normalizeEvidence } from "./normalize-evidence.js";
import { buildFindingView } from "./find-view.js";
import type { Finding } from "@rhema/contracts";

// HOT.1 (ADR-019) — every stored evidence shape that has shipped must lift to the canonical
// `{ claimId?, verdict?, urls }` contract; `urls` is always an array in the output so readers guard on
// `evidence` alone. The dossier-500 root cause was a reader assuming `urls` on a legacy blob.

const BASE_FINDING: Finding = {
  id: "f_1",
  correspondenceId: "corr_1",
  draftId: "d_1",
  ordinal: 0,
  kind: "claim",
  severity: "major",
  origin: "editor",
  anchor: null,
  title: "t",
  body: "b",
  rubricDims: [],
  projections: [],
};

describe("normalizeEvidence — every shipped shape (HOT.1)", () => {
  it("passes the canonical shape through (claimId + verdict + stamped urls)", () => {
    const raw = {
      claimId: "cl_1",
      verdict: "contradicted",
      urls: [{ url: "https://a.test/s", accessed: "2026-09-30T00:00:00Z" }],
    };
    expect(normalizeEvidence(raw)).toEqual(raw);
  });

  it("lifts the older {verdict}-only sidecar shape to urls: []", () => {
    expect(normalizeEvidence({ verdict: "verified" })).toEqual({ verdict: "verified", urls: [] });
  });

  it("lifts the legacy Showcase [{claim, source}] array — source becomes the url", () => {
    expect(
      normalizeEvidence([
        { claim: "The 1871 census recorded 3.1M households.", source: "https://nrs.test/t" },
      ]),
    ).toEqual({ urls: [{ url: "https://nrs.test/t" }] });
  });

  it("keeps a stamped accessed on legacy items and drops rows with no url-ish string", () => {
    expect(
      normalizeEvidence([
        { claim: "x", source: "https://a.test/1", accessed: "2026-01-01T00:00:00Z" },
        { claim: "no source" },
        "garbage",
        null,
      ]),
    ).toEqual({ urls: [{ url: "https://a.test/1", accessed: "2026-01-01T00:00:00Z" }] });
  });

  it("canonical items without accessed keep the url (accessed is optional on read)", () => {
    expect(normalizeEvidence({ urls: [{ url: "https://a.test/2" }] })).toEqual({
      urls: [{ url: "https://a.test/2" }],
    });
  });

  it("drops malformed url entries and unknown verdicts defensively", () => {
    expect(
      normalizeEvidence({ verdict: "made_up", urls: [{ url: 42 }, { url: "https://a.test/3" }, "x"] }),
    ).toEqual({ urls: [{ url: "https://a.test/3" }] });
  });

  it("returns undefined for absent or non-object evidence", () => {
    expect(normalizeEvidence(undefined)).toBeUndefined();
    expect(normalizeEvidence(null)).toBeUndefined();
    expect(normalizeEvidence("a string")).toBeUndefined();
    expect(normalizeEvidence(42)).toBeUndefined();
  });

  it("an empty/{} object still yields urls: [] (evidence present, no urls)", () => {
    expect(normalizeEvidence({})).toEqual({ urls: [] });
    expect(normalizeEvidence([])).toEqual({ urls: [] });
  });
});

describe("buildFindingView — the view boundary normalizes (HOT.1)", () => {
  it("a legacy array-evidence Finding yields a canonical FindingView (the dossier-500 fix)", () => {
    const legacy = {
      ...BASE_FINDING,
      evidence: [{ claim: "c", source: "https://a.test/s" }] as unknown as Finding["evidence"],
    };
    const view = buildFindingView(legacy);
    expect(view.evidence).toEqual({ urls: [{ url: "https://a.test/s" }] });
  });

  it("a {verdict}-only Finding yields urls: [] — readers never guard on urls", () => {
    const view = buildFindingView({
      ...BASE_FINDING,
      evidence: { verdict: "verified" } as unknown as Finding["evidence"],
    });
    expect(view.evidence).toEqual({ verdict: "verified", urls: [] });
  });

  it("omits evidence entirely when the row has none", () => {
    expect(buildFindingView(BASE_FINDING).evidence).toBeUndefined();
  });
});
