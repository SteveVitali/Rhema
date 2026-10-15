import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STEP_REGISTRY, stepById } from "./registry.js";
import { ALL_IMPLS } from "./impls.js";

// JOURNEY.1 — the registry is THE deliverable-2 artifact: every planning-ledger step, an owner,
// an expected flag, and a wired implementation.

describe("the journey step registry", () => {
  it("carries every planning-ledger step id", () => {
    const ids = STEP_REGISTRY.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        // UX.1 added N10 (public copy/meta/showcase) + R8 (signed-in showcase/prefs/inbox).
        // CITE.1 added N11 (the dossier citation-chip invariant — red until its Stage-B Leg 3).
        "C1", "N1", "N2", "N2.invite", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10", "N11",
        // DEF.4 added R9 (the §14.4 refund-window leg — red until Stage B flips the flag).
        // SPA.6 split P1→P1.{public,project,pill,runsheet,app-new} and X1→X1.{voices,usage,home,
        // inbox,detail} — the per-surface legs SURFACE_GATES selects (REQ-VFY-8).
        // SPA.11 split T2→T2.{badge,matrix} and R8→R8.{showcase,prefs,inbox} the same way.
        // SPA.18 added P1.outline (the phone-width /outline + /outline/promote leg — red pending
        // its first preview run, D-SPA.18-*).
        "P1.public", "P1.project", "P1.pill", "P1.runsheet", "P1.app-new", "P1.outline",
        "R1", "R4", "R5", "R6", "R7", "R8.showcase", "R8.prefs", "R8.inbox", "R9",
        "X1.voices", "X1.usage", "X1.home", "X1.inbox", "X1.detail",
        // STB.5a added T1…T16 — the BL-21/BL-22 live legs (nightly $0 T1–T8; weekly paid T9–T16).
        "T1", "T2.badge", "T2.matrix", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T14", "T15", "T16",
        // STB.5b added B16/B17/B18A/B18B/B19A/B19B/B19C — the BL-16–19 bounded paid live legs
        // (all `red` until a leg lands its live asserts; B19C is the pre-registered cap drop).
        "B16", "B17", "B18A", "B18B", "B19A", "B19B", "B19C",
      ].sort(),
    );
  });
  it("every step has an owner, an assertion, and an expected flag", () => {
    for (const s of STEP_REGISTRY) {
      expect(s.owner, s.id).toMatch(/^[A-Z0-9]+\.\d+[a-z]?$/); // STB.5a's sub-ticket suffix is legit
      expect(s.asserts.length, s.id).toBeGreaterThan(10);
      expect(["red", "green"]).toContain(s.expected);
    }
  });
  it("the green baseline is {N2, R5} + carried greens {N7, R1, X1} + owner-flipped {N9 (BILL.3), N4 (EST.1), R6 (RPT.1), N5 + C1 (ACT.1), N1 + N3 (ONB.1), N8 (EDIT.1), R4 + R7 (RUN.1)} + UX.1's {N10, R8} + UX.2's {P1}", () => {
    const green = STEP_REGISTRY.filter((s) => s.expected === "green").map((s) => s.id).sort();
    expect(green).toEqual(
      // P1 flipped red→green on prod proof (UX.2 Stage B, nonce 4ff89a27d950 @6723784).
      [
        // R9 flipped red→green 2026-10-06 (funded window B): live refund leg A auto-refunded 504 cr
        // (+504 spendable), leg B "sent for review" (pending_review + sweep alerted_at) — D-DEF.4-1 DONE.
        // N11 flipped red→green 2026-10-06 (funded-window A2 redeploy @476a0ed): the claimUrlViews
        // canonical-fold fix deployed; the Leg-3 dossier re-walked 7/7 chipped / 0 chip-less.
        "C1", "N1", "N2", "N2.invite", "N3", "N4", "N5", "N7", "N8", "N9", "N10", "N11",
        "P1.public", "P1.project", "P1.pill", "P1.runsheet", "P1.app-new",
        "R1", "R4", "R5", "R6", "R7", "R8.showcase", "R8.prefs", "R8.inbox", "R9",
        "X1.voices", "X1.usage", "X1.home", "X1.inbox", "X1.detail",
        // STB.5a's greens: the $0 legs that pass on free tenants (T1–T7) + the weekly
        // paid riders whose prerequisites the weekly leg itself produces (T9–T12, T14). T3+T7
        // flipped green 2026-10-06 on the deployed tip fcbbc66 (CAP.3's fixes verified live —
        // nonce 6c268536d58b); T13 flipped green 2026-10-06 (funded window B continuation —
        // Apply + bulk-preview legs landed on the delivered funded dossier, nonce b76029538106-class);
        // T8/T15/T16 stay red — clock/prerequisite rows.
        "T1", "T2.badge", "T2.matrix", "T3", "T4", "T5", "T6", "T7", "T9", "T10", "T11", "T12", "T13", "T14",
        // B16 flipped green 2026-10-06 (funded window B continuation): the pinned phase-4,
        // sidecar-absent review committed exactly the craft phase + phase-result then stopped —
        // D-P0.03-2 DONE.
        "B16",
      ].sort(),
    );
  });
  it("every registry row has a wired implementation", () => {
    for (const s of STEP_REGISTRY) {
      expect(ALL_IMPLS[s.id], s.id).toBeTypeOf("function");
    }
  });
  it("paid steps are exactly the paid legs (run/chat spend)", () => {
    const paid = STEP_REGISTRY.filter((s) => s.paid).map((s) => s.id).sort();
    // R9 is paid (two Quick/Base runs on the planted excerpt — the Stage-B evidence leg).
    // N11 is paid (CITE.1's golden-op-ed dossier leg — the Stage-B evidence leg).
    // T9–T16 are paid — they ride the weekly funded leg on jrn-a (the tenant the runs deliver to).
    // B16…B19C are paid — the STB.5b BL-16–19 bounded live legs (cheapest-first).
    expect(paid).toEqual(
      [
        "N11", "N5", "N6", "R4", "R6", "R9",
        "T10", "T11", "T12", "T13", "T14", "T15", "T16", "T9",
        "B16", "B17", "B18A", "B18B", "B19A", "B19B", "B19C",
      ].sort(),
    );
  });
  it("stepById resolves", () => {
    expect(stepById("N7")?.owner).toBe("HOT.1");
    expect(stepById("nope")).toBeUndefined();
  });

  // Deliverable 2: "a test asserts every planning-ledger step id exists here with the same owner
  // (superset allowed)" — parse the ledger table itself so a ledger/registry drift fails here.
  it("every planning-ledger step id exists with the same owner", () => {
    const ledger = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../docs/build/planning/2026-09-30_planning-ledger.md",
      ),
      "utf8",
    );
    const section = ledger.split("## Journey step registry")[1] ?? "";
    const rows = [...section.matchAll(/^\|\s*([A-Z]\d+)\s*\|[^|]+\|[^|]+\|\s*([^|]+?)\s*\|$/gm)];
    expect(rows.length).toBeGreaterThanOrEqual(16); // N1–N9, R1/R4–R7, P1, C1, X1
    for (const [, id, ownerCell] of rows) {
      const owner = ownerCell.match(/[A-Z0-9]+\.\d+/)?.[0];
      // SPA.6 — a split ledger id (P1→P1.*, X1→X1.*) resolves as the family; every leg must carry
      // the ledger's owner (the split never re-assigns ownership).
      const family = stepById(id)
        ? [stepById(id)!]
        : STEP_REGISTRY.filter((s) => s.id.startsWith(`${id}.`));
      expect(family.length, `ledger step ${id} missing from the registry`).toBeGreaterThan(0);
      for (const step of family) {
        expect(step.owner, `ledger owner for ${step.id}`).toBe(owner);
      }
    }
  });
});
