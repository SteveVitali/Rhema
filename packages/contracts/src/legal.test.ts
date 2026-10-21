// R6LGL.1 (REQ-LCH-1) — the legal/trust flag + placeholder census's invariants (ADR-118):
// the shipped set carries `approved: false` + `null` details (GD-LEGAL.R6 / -DETAILS.R6),
// `legalApprovalViolations` is the live "approved ⇒ no placeholder remains" gate predicate,
// and the page table stays coherent with the route enumeration it feeds.

import { describe, expect, it } from "vitest";
import {
  LEGAL_DETAIL_KEYS,
  LEGAL_DETAIL_LABELS,
  LEGAL_DETAILS,
  LEGAL_PAGES,
  LEGAL_PLACEHOLDER_RE,
  LEGAL_ROUTE_IDS,
  legalApprovalViolations,
  legalPageFor,
  legalPlaceholdersFor,
  type LegalPageRow,
} from "./legal.js";

describe("LEGAL_PAGES census (REQ-LCH-1)", () => {
  it("enumerates the five documents, each approved: false with a real title + navLabel", () => {
    expect(LEGAL_ROUTE_IDS).toEqual([
      "/terms",
      "/privacy",
      "/refunds",
      "/acceptable-use",
      "/contact",
    ]);
    for (const p of LEGAL_PAGES) {
      expect(p.approved, `${p.routeId} must ship approved: false (GD-LEGAL.R6)`).toBe(false);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.navLabel.length).toBeGreaterThan(0);
      // every declared detail key is a real slot — a typo'd reference must fail loudly
      for (const k of p.details) {
        expect(LEGAL_DETAIL_KEYS).toContain(k);
        expect(LEGAL_DETAIL_LABELS[k].length).toBeGreaterThan(0);
      }
    }
  });

  it("ships every operator-fill detail null (GD-LEGAL-DETAILS.R6 'Placeholders now')", () => {
    for (const k of LEGAL_DETAIL_KEYS) {
      expect(LEGAL_DETAILS[k], `${k} must be null until HUMAN-H11 + R6CNT.2`).toBeNull();
      expect(LEGAL_DETAIL_LABELS[k].length).toBeGreaterThan(0);
    }
  });

  it("every page references at least one detail and keeps them within the slot set", () => {
    for (const p of LEGAL_PAGES) {
      expect(p.details.length).toBeGreaterThan(0);
      // no duplicates — a detail referenced twice is a census bug
      expect(new Set(p.details).size).toBe(p.details.length);
    }
  });

  it("legalPageFor resolves each route id and nothing else", () => {
    for (const p of LEGAL_PAGES) expect(legalPageFor(p.routeId)).toBe(p);
    expect(legalPageFor("/nope")).toBeUndefined();
    expect(legalPageFor("/privacy/")).toBeUndefined();
  });
});

describe("legalPlaceholdersFor / legalApprovalViolations (the flag invariant)", () => {
  it("reports every page's referenced details while the slots are null", () => {
    for (const p of LEGAL_PAGES) expect(legalPlaceholdersFor(p)).toEqual(p.details);
  });

  it("flags an approved page that still carries unfilled details — the test that must fail " +
    "the build if a placeholder is ever approved over", () => {
    const dirty: LegalPageRow = { ...LEGAL_PAGES[0], approved: true };
    const violations = legalApprovalViolations([dirty]);
    expect(violations).toEqual([{ routeId: "/terms", unfilled: dirty.details }]);
  });

  it("accepts an approved page whose details are all filled", () => {
    const clean: LegalPageRow = {
      routeId: "/terms",
      title: "Terms of Service",
      navLabel: "Terms",
      approved: true,
      details: [],
    };
    expect(legalApprovalViolations([clean])).toEqual([]);
  });

  it("the shipped set carries zero violations today (all approved: false)", () => {
    expect(legalApprovalViolations()).toEqual([]);
  });

  it("the placeholder-token grammar matches exactly the detail-key spelling", () => {
    const text = "Contact ⟦CONTACT_EMAIL⟧ about ⟦OPERATING_ENTITY⟧ — not ⟦lowercase⟧ or [BRACKET]";
    const hits = [...text.matchAll(LEGAL_PLACEHOLDER_RE)].map((m) => m[1]);
    expect(hits).toEqual(["CONTACT_EMAIL", "OPERATING_ENTITY"]);
  });
});
