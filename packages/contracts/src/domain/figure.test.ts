import { describe, expect, it } from "vitest";
import {
  figureAssetSchema,
  figureBadge,
  figureBlockMarkdown,
  figureClaims,
  figureClaimsSupported,
  figureExportPackage,
  figureInsertReadiness,
  figureSidecarSchema,
  parseFigureMarker,
  verificationFromVerdicts,
  FIGURE_BADGE_TEXT,
  type FigureAsset,
} from "../index.js";

const ULID = "01J9ZZZZZZZZZZZZZZZZZZZZZZ";
const NOW = "2026-10-01T12:00:00Z";

function asset(over: Partial<FigureAsset> = {}): FigureAsset {
  return {
    id: ULID,
    projectId: ULID,
    kind: "chart",
    title: "GAL–TAN correlations",
    caption: "Correlation of party-family GAL–TAN position with the harms index.",
    alt: "Horizontal bar chart of four party families; radical right highest at 0.71.",
    sourceLine: "CHES 2019 (chesdata.eu), authors' calculation.",
    specKind: "vega_lite",
    data: { rows: 4, columns: ["family", "r"], csvSha256: "a".repeat(64) },
    provenance: {
      kind: "fetched",
      refs: [{ url: "https://chesdata.eu", accessedAt: NOW }],
      computedBy: "assistant",
      verification: "unverified",
    },
    versions: [{ n: 1, request: "initial", specSha256: "b".repeat(64), createdAt: NOW, cost: 6 }],
    ...over,
  };
}

describe("figureAssetSchema", () => {
  it("accepts a complete asset; rejects alt > 250 and unknown enums", () => {
    expect(figureAssetSchema.parse(asset()).id).toBe(ULID);
    expect(() => figureAssetSchema.parse(asset({ alt: "x".repeat(251) }))).toThrow();
    expect(() => figureAssetSchema.parse(asset({ specKind: "d3" as never }))).toThrow();
    expect(() =>
      figureAssetSchema.parse(
        asset({ provenance: { ...asset().provenance, kind: "remembered" as never } }),
      ),
    ).toThrow();
  });
});

describe("figureBadge (§7.5)", () => {
  it("kind:none + unverified ⇒ persistent [unverified data]", () => {
    expect(figureBadge({ kind: "none", verification: "unverified" })).toBe("unverified_data");
    expect(FIGURE_BADGE_TEXT.unverified_data).toBe("[unverified data]");
  });
  it("user_typed ⇒ author-supplied; selection/fetched carry no badge", () => {
    expect(figureBadge({ kind: "user_typed", verification: "unverified" })).toBe("author_supplied");
    expect(figureBadge({ kind: "selection", verification: "unverified" })).toBeNull();
    expect(figureBadge({ kind: "fetched", verification: "unverified" })).toBeNull();
  });
  it("a review verdict outranks provenance — a none figure verified loses the badge", () => {
    expect(figureBadge({ kind: "none", verification: "verified" })).toBe("verified");
    expect(figureBadge({ kind: "claim_ledger", verification: "verified" })).toBe("verified");
    expect(figureBadge({ kind: "fetched", verification: "contradicted" })).toBe("contradicted");
    expect(figureBadge({ kind: "fetched", verification: "unverifiable" })).toBe("unverifiable");
  });
});

describe("figureInsertReadiness (REQ-VIZ-2)", () => {
  it("alt + sourceLine are both required before insert", () => {
    expect(figureInsertReadiness({ alt: "a", sourceLine: "s" }).ok).toBe(true);
    expect(figureInsertReadiness({ alt: "", sourceLine: "s" }).missing).toEqual(["alt"]);
    expect(figureInsertReadiness({ alt: "a", sourceLine: "  " }).missing).toEqual(["sourceLine"]);
    expect(figureInsertReadiness({ alt: "", sourceLine: "" }).missing).toEqual(["alt", "sourceLine"]);
  });
});

describe("figureBlockMarkdown + parseFigureMarker (§7.5 block form)", () => {
  it("writes the verbatim block and round-trips the marker", () => {
    const md = figureBlockMarkdown({
      figureId: ULID,
      version: 2,
      alt: "Horizontal bar chart…",
      caption: "Correlation of party-family GAL–TAN position with the harms index.",
      figureNumber: 2,
      footnoteId: "12",
      sourceLine: "CHES 2019 (chesdata.eu, accessed 2026-08-27), authors' calculation from `data.csv`.",
    });
    expect(md).toContain(`![Horizontal bar chart…](asset://fig_${ULID})`);
    expect(md).toContain(
      "*Figure 2. Correlation of party-family GAL–TAN position with the harms index.[^12]*",
    );
    expect(md).toContain(`<!-- rhema:figure id=fig_${ULID} version=2 -->`);
    expect(md).toContain("[^12]: Source: CHES 2019");
    const parsed = parseFigureMarker(md);
    expect(parsed).toEqual([{ figureId: ULID, version: 2 }]);
  });

  it("accepts an already-prefixed fig_ id without double-prefixing", () => {
    const md = figureBlockMarkdown({
      figureId: `fig_${ULID}`,
      version: 1,
      alt: "a",
      caption: "c",
      footnoteId: "1",
      sourceLine: "s",
    });
    expect(md).toContain(`(asset://fig_${ULID})`);
    expect(md).not.toContain("fig_fig_");
    expect(md).not.toContain("*Figure"); // no number ⇒ no *Figure N.* lead
  });
});

describe("figureClaims (REQ-VIZ-13/14)", () => {
  const rows = [
    { family: "Radical right", r: 0.71 },
    { family: "Conservative", r: 0.42 },
  ];

  it("inventories data values + labels + caption comparisons as Tier-1 claims", () => {
    const claims = figureClaims({
      figure: asset(),
      figureNumber: 2,
      rows,
      labels: ["GAL–TAN position", "party family"],
      captionComparisons: ["radical right highest"],
    });
    expect(claims).toHaveLength(2 * 1 + 2 + 1); // numeric cells only (family is a string)
    expect(claims[0]).toMatchObject({ kind: "value", value: 0.71, figureNumber: 2 });
    expect(claims.filter((c) => c.kind === "label")).toHaveLength(2);
    expect(claims[claims.length - 1]!.kind).toBe("caption_comparison");
    // provenance refs flow through for re-fetch/recompute
    expect(claims[0]!.refs[0]!.url).toBe("https://chesdata.eu");
  });

  it("a kind:none figure inventories Unsupported-by-construction (no refs)", () => {
    const noneFig = asset({
      provenance: { kind: "none", refs: [], computedBy: "user", verification: "unverified" },
    });
    expect(figureClaimsSupported(noneFig.provenance)).toBe(false);
    const claims = figureClaims({ figure: noneFig, rows });
    expect(claims.every((c) => c.refs.length === 0)).toBe(true);
    expect(figureClaimsSupported(asset().provenance)).toBe(true);
  });
});

describe("verificationFromVerdicts (REQ-VIZ-13)", () => {
  it("folds claim verdicts into provenance.verification", () => {
    expect(verificationFromVerdicts(["verified", "verified"])).toBe("verified");
    expect(verificationFromVerdicts(["verified", "contradicted"])).toBe("contradicted");
    expect(verificationFromVerdicts(["verified", "unverifiable"])).toBe("unverifiable");
    expect(verificationFromVerdicts([])).toBeNull();
  });
});

describe("figureExportPackage (REQ-VIZ-15 — the asset half)", () => {
  it("maps formats to the §7.5 embed kinds", () => {
    const p = figureExportPackage({ figure: asset(), format: "docx", png2x: new Uint8Array([1, 2]) });
    expect(p.embed).toBe("png2x");
    expect(p.png2x).toBeInstanceOf(Uint8Array);
    expect(figureExportPackage({ figure: asset(), format: "html", svg: "<svg/>" }).embed).toBe("svg");
    expect(figureExportPackage({ figure: asset(), format: "pdf", svg: "<svg/>" }).embed).toBe("svg");
    expect(figureExportPackage({ figure: asset(), format: "latex", svg: "<svg/>" }).embed).toBe("svg");
    expect(figureExportPackage({ figure: asset(), format: "txt" }).embed).toBe("text");
  });

  it("always carries alt + the source footnote; a table figure embeds its native table", () => {
    const table = asset({ specKind: "table", kind: "table" });
    const p = figureExportPackage({ figure: table, format: "docx", tableSource: "| a | b |" });
    expect(p.embed).toBe("table");
    expect(p.tableSource).toBe("| a | b |");
    expect(p.altText).toContain("Horizontal bar chart");
    expect(p.sourceFootnote).toContain("CHES 2019");
  });

  it("the [unverified data] badge becomes a caption note in exports", () => {
    const noneFig = asset({
      provenance: { kind: "none", refs: [], computedBy: "user", verification: "unverified" },
    });
    const p = figureExportPackage({ figure: noneFig, format: "md" });
    expect(p.captionNote).toBe("[unverified data]");
    const ok = figureExportPackage({ figure: asset(), format: "md" });
    expect(ok.captionNote).toBeUndefined();
  });
});

describe("figureSidecarSchema (the caption phase's twin)", () => {
  it("validates the emitted card fields; coerces loosely-cased enums", () => {
    const s = figureSidecarSchema.parse({
      sidecar: "figure",
      version: 1,
      figureId: ULID,
      specKind: "Vega-Lite",
      kind: "chart",
      title: "t",
      caption: "c",
      alt: "a",
      sourceLine: "Source: s",
      provenanceKind: "fetched",
      request: "make it a bar chart",
    });
    expect(s.specKind).toBe("vega_lite");
    expect(s.figureId).toBe(ULID);
  });

  it("rejects alt > 250 and a missing sourceLine (REQ-VIZ-2 floor)", () => {
    const base = {
      sidecar: "figure",
      version: 1,
      figureId: ULID,
      specKind: "mermaid",
      kind: "diagram",
      title: "t",
      caption: "c",
      sourceLine: "s",
      provenanceKind: "none",
    };
    expect(() => figureSidecarSchema.parse({ ...base, alt: "x".repeat(251) })).toThrow();
    expect(() => figureSidecarSchema.parse({ ...base, alt: "ok", sourceLine: undefined })).toThrow();
  });
});
