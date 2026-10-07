import { describe, it, expect } from "vitest";
import { lintCopy } from "@rhema/contracts";
import { collectCopyStrings } from "./copy.js";

// AC4 — the i18n string table lints green against Appendix D.2 (REQ-PROD-6 / REQ-BILL-18). This consumes
// P0.02's reserved-strings data via @rhema/contracts `lintCopy`, so the canonical vocabulary is enforced over
// the beta's copy from the first screen.

describe("copy vocabulary lint (Appendix D.2)", () => {
  it("the entire UI copy table is free of banned strings", () => {
    // Sanctioned Appendix D.2 exceptions the copy uses: "Advanced" as the progressive-disclosure label
    // (§6.5; P1.05's report heading reuses the same role), "tokens" ONLY under that disclosure (§14.5's
    // Level-4 drill-down columns), and "author" ONLY in §15.1's "the author's seat" — the human's chair,
    // exactly the role the exception reserves. Every other banned/excepted term must still be absent.
    // RES.2 — "unverified" joins the allow-list: its Appendix D.2 exception (the run-level delivery label)
    // plus the six pre-existing provenance badges are key-enumerated in the guard loop below, so a NEW use
    // still fails there even though the term is permitted here.
    const violations = lintCopy(collectCopyStrings(), {
      allow: ["Advanced", "tokens", "author", "unverified"],
    });
    expect(violations).toEqual([]);
    // and each excepted term stays inside its sanctioned role — nowhere else in the table.
    for (const v of lintCopy(collectCopyStrings())) {
      if (v.term === "tokens") {
        expect(v.key.startsWith("report.advancedColumns.")).toBe(true);
      } else if (v.term === "author") {
        // the human's seat (§15.1) — 'author' as a label for an agent stays banned.
        expect(v.key).toBe("landing.seat.heading");
      } else if (v.term === "unverified") {
        // RES.2 (Appendix D.2 "Delivery labels") — `review.deliveryLabel` is the sanctioned run-level
        // slot; the claim verdict is `unverifiable` (a different word the matcher never confuses with
        // it). The remaining keys are the PRE-EXISTING provenance badges (`[unverified]` /
        // `[unverified data]` — a source-fetch fact, not a claim verdict) — enumerated so no NEW use
        // slips past the reservation.
        expect([
          "review.deliveryLabel",
          "feed.templates.run.unverified", // the feed row for the run.unverified event (same slot)
          "gates.outline.unverifiedBadge",
          "revision.verifiedByLabel.user",
          "promote.urlsFmt",
          "visualize.insistLabel",
          "ide.chatDesk.unverified",
        ]).toContain(v.key);
      } else {
        expect(v.term).toBe("Advanced");
        // the §5.13 Files pane's Advanced disclosure (section label + the per-section "Show working"
        // disclosure) is the same sanctioned role as the run sheet's.
        expect([
          "runSheet.advanced",
          "report.advancedHeading",
          "files.sectionLabel.advanced",
          "files.advanced",
        ]).toContain(v.key);
      }
    }
  });

  it("RES.2 — `unverified` is flagged as a claim verdict but accepted as the run-level label", () => {
    // a claim-verdict use is a violation; the run-level label slot is the only fresh key permitted.
    expect(
      lintCopy({ claimVerdict: "Unverified" }).some((v) => v.term === "unverified"),
    ).toBe(true);
    // and the label string itself is exactly the reserved word — nothing else may carry it.
    const table = collectCopyStrings();
    const labelKeys = table
      .filter(([, v]) => /unverified/i.test(v))
      .map(([k]) => k);
    expect(labelKeys).toContain("review.deliveryLabel");
  });

  it("PRB.13 — the open-mode signup copy is factual and lint-clean (REQ-POS-4/5/13)", () => {
    const keys = collectCopyStrings().map(([k]) => k);
    for (const k of [
      "invite.accessNoteOpen",
      "invite.signInCtaOpen",
      "login.noteOpen",
      "login.codeLabelOptional",
      "login.emailRequiredSelfServe",
      "login.errorRateLimited",
      "login.errorSignupUnavailable",
      "runSheet.emailUnverified",
    ]) {
      expect(keys).toContain(k);
    }
    // the §16.4 gate is still closed — efficacy/superiority phrasing is caught if introduced.
    expect(lintCopy({ bad: "writes like you — unlimited, better than Pro" }).length).toBeGreaterThan(0);
  });

  it("collectCopyStrings walks every string leaf", () => {
    const pairs = collectCopyStrings();
    const keys = pairs.map(([k]) => k);
    expect(keys).toContain("brand");
    expect(keys).toContain("login.errorInvalid");
    expect(keys).toContain("dossier.contradictedTierOneLabel");
    // sanity: the lint would catch a banned word if one were introduced
    expect(lintCopy({ bad: "billed on-demand" }).length).toBeGreaterThan(0);
  });
});
