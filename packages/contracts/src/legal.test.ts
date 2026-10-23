// R6LGL.1 (REQ-LCH-1) — the legal/trust flag + placeholder census's invariants (ADR-118):
// R6CNT.2 flipped the shipped set to `approved: true` + filled details under HUMAN-H11's
// recorded A1 pre-approval, `legalApprovalViolations` is the live "approved ⇒ no placeholder
// remains" gate predicate, and the page table stays coherent with the route enumeration it
// feeds.

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
  it("enumerates the five documents, each approved: true under the recorded pre-approval", () => {
    expect(LEGAL_ROUTE_IDS).toEqual([
      "/terms",
      "/privacy",
      "/refunds",
      "/acceptable-use",
      "/contact",
    ]);
    for (const p of LEGAL_PAGES) {
      // HUMAN-H11 A1 (2026-10-23): "I pre-approve whatever text you generate now" — the
      // generated text IS the approved text; GATE-LAUNCH reads `approved` on every row.
      expect(p.approved, `${p.routeId} must ship approved: true (H11 A1)`).toBe(true);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.navLabel.length).toBeGreaterThan(0);
      // every declared detail key is a real slot — a typo'd reference must fail loudly
      for (const k of p.details) {
        expect(LEGAL_DETAIL_KEYS).toContain(k);
        expect(LEGAL_DETAIL_LABELS[k].length).toBeGreaterThan(0);
      }
    }
  });

  it("ships the HUMAN-H11-recorded operator-fill values verbatim (A1)", () => {
    // The recorded A1 values — an approved page can only render filled details.
    expect(LEGAL_DETAILS.OPERATING_ENTITY).toBe("Rhema Labs");
    expect(LEGAL_DETAILS.GOVERNING_LAW).toBe("NY, NY");
    expect(LEGAL_DETAILS.CONTACT_EMAIL).toBe("contact@rhema.tools");
    // The unrecorded slot: no page may reference it while it is null (the copy's
    // postal-mail clause was dropped with the value — never a fabricated address).
    expect(LEGAL_DETAILS.CONTACT_ADDRESS).toBeNull();
    for (const p of LEGAL_PAGES) {
      expect(p.details, `${p.routeId} references an unfilled slot`).not.toContain(
        "CONTACT_ADDRESS",
      );
    }
    for (const k of LEGAL_DETAIL_KEYS) {
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
  it("no approved page carries an unfilled referenced detail", () => {
    for (const p of LEGAL_PAGES) expect(legalPlaceholdersFor(p), p.routeId).toEqual([]);
  });

  it("flags an approved page that still carries unfilled details — the test that must fail " +
    "the build if a placeholder is ever approved over", () => {
    const dirty: LegalPageRow = {
      ...LEGAL_PAGES[0],
      approved: true,
      details: [...LEGAL_PAGES[0].details, "CONTACT_ADDRESS"],
    };
    const violations = legalApprovalViolations([dirty]);
    expect(violations).toEqual([{ routeId: "/terms", unfilled: ["CONTACT_ADDRESS"] }]);
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

  it("the shipped set carries zero violations today (all approved, all details filled)", () => {
    expect(legalApprovalViolations()).toEqual([]);
  });

  it("the placeholder-token grammar matches exactly the detail-key spelling", () => {
    const text = "Contact ⟦CONTACT_EMAIL⟧ about ⟦OPERATING_ENTITY⟧ — not ⟦lowercase⟧ or [BRACKET]";
    const hits = [...text.matchAll(LEGAL_PLACEHOLDER_RE)].map((m) => m[1]);
    expect(hits).toEqual(["CONTACT_EMAIL", "OPERATING_ENTITY"]);
  });
});
