import { describe, it, expect } from "vitest";
import type { Anchor, FindingView } from "@rhema/contracts";
import {
  MARGIN_CLUSTER_THRESHOLD,
  QUICK_FINDINGS_CAP,
  applyGate,
  applySeverityBudget,
  bulkSelect,
  filterFindings,
  marginItems,
  parseFindingFilters,
  sectionedTriageQueue,
  severityBudget,
} from "./surface.js";
import { groupFindingsForList } from "./find-view.js";

// P1.07 — the §5.7 findings-surface derivations: margin clustering, the shared filters, the sectioned
// triage queue, the progress pill counts, the Quick severity budget, and the Apply gate (REQ-SPEC-6).
// Pure + deterministic — React renders these verbatim.

const user = { kind: "user", userId: "u_1" } as const;

function view(over: Partial<FindingView>): FindingView {
  return {
    id: "f_1",
    correspondenceId: "c_1",
    draftId: "d_1",
    kind: "argument",
    severity: "major",
    origin: "editor",
    anchor: null,
    title: "t",
    body: "b",
    rubricDims: [],
    provisional: false,
    ...over,
  };
}

const anchorAt = (blockId: string): Anchor => ({
  blockId,
  startOffset: 0,
  endOffset: 4,
  quote: "the ",
  confidence: 1,
});

function disposed(kind: "accept" | "adapt" | "rebut" | "defer" | "escalate", extra?: { frozen?: boolean; applied?: boolean }) {
  return {
    kind,
    by: user,
    at: "2026-09-16T00:00:00Z",
    frozen: extra?.frozen ?? false,
    ...(extra?.applied != null ? { applied: extra.applied } : {}),
  };
}

describe("marginItems (§5.7 — cards beside passages; >1 on a paragraph stacks to a chip)", () => {
  it("renders a card per lone finding and a chip per crowded paragraph; whole-piece heads the stack", () => {
    const items = marginItems([
      view({ id: "whole", anchor: null, severity: "note" }),
      view({ id: "a", anchor: anchorAt("p1"), severity: "minor" }),
      view({ id: "b", anchor: anchorAt("p1"), severity: "blocking" }),
      view({ id: "c", anchor: anchorAt("p2"), severity: "major" }),
    ]);
    // whole piece first (same grouping the Desk uses), then p1's chip, then p2's card.
    expect(items.map((i) => i.kind)).toEqual(["card", "chip", "card"]);
    expect(items[0]).toMatchObject({ kind: "card", finding: { id: "whole" } });
    expect(items[1]).toMatchObject({ kind: "chip", count: 2, topSeverity: "blocking", topCount: 1 });
    expect(items[2]).toMatchObject({ kind: "card", finding: { id: "c" } });
  });

  it(`stacks every paragraph once the dossier clears ${MARGIN_CLUSTER_THRESHOLD} findings`, () => {
    const many = Array.from({ length: MARGIN_CLUSTER_THRESHOLD + 1 }, (_, i) =>
      view({ id: `f_${i}`, anchor: anchorAt(`p_${i}`), severity: "minor" }),
    );
    const items = marginItems(many);
    expect(items.every((i) => i.kind === "chip")).toBe(true);
    expect(items[0]).toMatchObject({ count: 1, topSeverity: "minor", topCount: 1 });
    // nothing dropped: chip findings sum to the input count.
    expect(
      items.reduce((n, i) => n + (i.kind === "chip" ? i.findings.length : 1), 0),
    ).toBe(many.length);
  });

  it("never drops findings — chip findings + cards equal the input", () => {
    const views = [
      view({ id: "x", anchor: anchorAt("p"), severity: "minor" }),
      view({ id: "y", anchor: anchorAt("p"), severity: "major" }),
      view({ id: "z", anchor: anchorAt("p"), severity: "note" }),
    ];
    const items = marginItems(views);
    expect(items).toHaveLength(1);
    const chip = items[0]!;
    if (chip.kind !== "chip") throw new Error("expected a chip");
    expect(chip.findings.map((f) => f.id).sort()).toEqual(["x", "y", "z"]);
    expect(chip).toMatchObject({ count: 3, topSeverity: "major", topCount: 1 });
  });
});

describe("filterFindings (§5.7 — the shared filter set)", () => {
  const views = [
    view({ id: "a", severity: "blocking", kind: "claim", origin: "editor", letterSection: "major" }),
    view({ id: "b", severity: "note", kind: "craft", origin: "second_read", suggestion: { replacement: "x" } }),
    view({
      id: "c",
      severity: "minor",
      kind: "voice",
      origin: "both",
      disposition: disposed("defer"),
      evidence: { urls: [{ url: "https://x.test", accessed: "2026-09-16T00:00:00Z" }] },
    }),
  ];

  it("filters on each axis, and composes", () => {
    expect(filterFindings(views, { severity: "note" }).map((v) => v.id)).toEqual(["b"]);
    expect(filterFindings(views, { kind: "claim" }).map((v) => v.id)).toEqual(["a"]);
    expect(filterFindings(views, { origin: "both" }).map((v) => v.id)).toEqual(["c"]);
    expect(filterFindings(views, { disposition: "undecided" }).map((v) => v.id)).toEqual(["a", "b"]);
    expect(filterFindings(views, { disposition: "defer" }).map((v) => v.id)).toEqual(["c"]);
    expect(filterFindings(views, { section: "major" }).map((v) => v.id)).toEqual(["a"]);
    expect(filterFindings(views, { section: "whole" }).map((v) => v.id)).toEqual(["b", "c"]);
    expect(filterFindings(views, { hasUrl: true }).map((v) => v.id)).toEqual(["c"]);
    expect(filterFindings(views, { hasSuggestion: true }).map((v) => v.id)).toEqual(["b"]);
    expect(
      filterFindings(views, { openObligation: true }, { openObligationIds: new Set(["a"]) }).map((v) => v.id),
    ).toEqual(["a"]);
    expect(filterFindings(views, { severity: "minor", disposition: "defer" }).map((v) => v.id)).toEqual(["c"]);
  });

  it("parseFindingFilters maps GET params and ignores unknown values", () => {
    const f = parseFindingFilters({ sev: "major", kind: "bogus", disp: "undecided", url: "1", obl: "1" });
    expect(f).toEqual({ severity: "major", disposition: "undecided", hasUrl: true, openObligation: true });
    expect(parseFindingFilters({})).toEqual({});
  });
});

describe("sectionedTriageQueue (§5.7 triage mode — sections, blocking → note within, escalations pinned)", () => {
  it("groups by letter section, sorts severity within, pins escalations, keeps decided rows", () => {
    const views = [
      view({ id: "s1_minor", letterSection: "strength", severity: "minor" }),
      view({ id: "s1_blocking", letterSection: "strength", severity: "blocking" }),
      view({ id: "m_major", letterSection: "major", severity: "major" }),
      view({ id: "m_esc", letterSection: "major", severity: "note", disposition: disposed("escalate") }),
      view({ id: "whole_note", severity: "note" }),
    ];
    const q = sectionedTriageQueue(views);
    // the escalation's section leads; "whole" trails with its own label.
    expect(q.sections.map((s) => s.key)).toEqual(["major", "strength", "whole"]);
    expect(q.sections[0]!.rows.map((r) => r.id)).toEqual(["m_esc", "m_major"]);
    expect(q.sections[1]!.rows.map((r) => r.id)).toEqual(["s1_blocking", "s1_minor"]);
    expect(q.sections[2]!.label).toBe("Whole piece");
    expect(q).toMatchObject({ total: 5, decided: 1, undecided: 4 });
    // the queue's own order (escalations, then undecided by severity) picks the next undecided —
    // the blocking row outranks the major regardless of section.
    expect(q.nextUndecidedId).toBe("s1_blocking");
  });

  it("surfaces the Drafter promotion over the threshold", () => {
    const many = Array.from({ length: MARGIN_CLUSTER_THRESHOLD + 1 }, (_, i) => view({ id: `f_${i}` }));
    expect(sectionedTriageQueue(many).promoteAgentTriage).toBe(true);
  });
});

describe("severityBudget / applySeverityBudget (§5.7 — Quick's 40-finding rendered cap)", () => {
  const many = Array.from({ length: QUICK_FINDINGS_CAP + 23 }, (_, i) =>
    view({ id: `f_${i}`, severity: i < 10 ? "major" : "note" }),
  );

  it("caps quick runs at 40 and reports the folded count from the sidecar's own numbers", () => {
    const b = severityBudget(many, "quick");
    expect(b).toEqual({ cap: QUICK_FINDINGS_CAP, shown: QUICK_FINDINGS_CAP, folded: 23 });
    const shown = applySeverityBudget(many, "quick");
    expect(shown).toHaveLength(QUICK_FINDINGS_CAP);
    expect(shown.filter((v) => v.severity === "major")).toHaveLength(10); // all majors survive
  });

  it("renders everything for standard/deep runs and under-cap quicks", () => {
    expect(severityBudget(many, "standard")).toEqual({ cap: null, shown: many.length, folded: 0 });
    expect(severityBudget(many.slice(0, 5), "quick").cap).toBeNull();
    expect(applySeverityBudget(many, "standard")).toHaveLength(many.length);
  });
});

describe("applyGate (REQ-SPEC-6 — the free verb's lock rules)", () => {
  const applyable = view({ id: "ok", severity: "note", anchor: anchorAt("p"), suggestion: { replacement: "r" } });

  it("opens on an anchored finding with a suggestion, locks with a reason otherwise", () => {
    expect(applyGate(applyable)).toEqual({ ok: true });
    expect(applyGate(view({ ...applyable, id: "no_sug", suggestion: undefined }))).toEqual({
      ok: false,
      reason: "no_suggestion",
    });
    expect(applyGate(view({ ...applyable, id: "done", disposition: disposed("accept", { applied: true }) }))).toEqual({
      ok: false,
      reason: "already_applied",
    });
    expect(applyGate(view({ ...applyable, id: "prov", provisional: true }))).toEqual({
      ok: false,
      reason: "provisional",
    });
    expect(applyGate(view({ ...applyable, id: "frz", disposition: disposed("accept", { frozen: true }) }))).toEqual({
      ok: false,
      reason: "frozen",
    });
    expect(applyGate(view({ ...applyable, id: "whole", anchor: null }))).toEqual({
      ok: false,
      reason: "unanchored",
    });
  });

  it("a non-applied disposition does not lock Apply — the verbs coexist until freeze", () => {
    expect(applyGate(view({ ...applyable, id: "def", disposition: disposed("defer") }))).toEqual({ ok: true });
  });
});

describe("bulkSelect (§5.7 — the three Desk/palette bulk actions)", () => {
  const views = [
    view({ id: "n1", severity: "note", anchor: anchorAt("p"), suggestion: { replacement: "r" } }),
    view({ id: "n2", severity: "note", anchor: anchorAt("p"), suggestion: { replacement: "r" } }),
    view({ id: "n3", severity: "note" }), // no suggestion — apply_notes can't cover it
    view({ id: "mi1", severity: "minor" }),
    view({ id: "mi2", severity: "minor", disposition: disposed("accept") }), // decided — defer_minor skips it
    view({ id: "mj1", severity: "major", letterSection: "major" }),
    view({ id: "mj2", severity: "major", letterSection: "major", disposition: disposed("rebut") }),
  ];

  it("apply_notes covers applyable notes; defer_minor covers undecided minors; accept_section covers a section's undecided", () => {
    expect(bulkSelect(views, "apply_notes").map((v) => v.id)).toEqual(["n1", "n2"]);
    expect(bulkSelect(views, "defer_minor").map((v) => v.id)).toEqual(["mi1"]);
    expect(bulkSelect(views, "accept_section", "major").map((v) => v.id)).toEqual(["mj1"]);
  });
});

describe("the ONE-model invariant", () => {
  it("groupFindingsForList + marginItems + the triage queue all carry every row", () => {
    const views = [
      view({ id: "a", anchor: anchorAt("p1") }),
      view({ id: "b", anchor: null }),
      view({ id: "c", anchor: anchorAt("p2"), reconciliation: "rejected" }),
    ];
    const grouped = groupFindingsForList(views);
    expect(grouped.reduce((n, g) => n + g.findings.length, 0)).toBe(3);
    expect(marginItems(views).reduce((n, i) => n + (i.kind === "chip" ? i.findings.length : 1), 0)).toBe(3);
    expect(sectionedTriageQueue(views).sections.reduce((n, s) => n + s.rows.length, 0)).toBe(3);
  });
});
