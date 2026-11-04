import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STEP_REGISTRY, stepById, cogsLeversFor, legCapUsdFor } from "./registry.js";
import { LEG_CAP_FLOOR_USD } from "./window-plan.js";
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
        // its first preview run, D-SPA.18-*). SPA.19 added P1.figures (the pane/card/visualize
        // leg — red pending its first preview run, D-SPA.19-*). SPA.21 added P1.dossier (the
        // phone-width dossier leg — red pending its first preview run, D-SPA.21-*).
        "P1.public", "P1.project", "P1.pill", "P1.runsheet", "P1.app-new", "P1.outline", "P1.figures", "P1.dossier",
        // SPA.22 added R6F — the seeded delivered-run-report free render leg (REQ-VFY-10's owed
        // delivered-render coverage — red pending its first live leg, D-SPA.22-*).
        // NAVC.4 added R10 + R10.keepalive — the client-nav acceptance chain and the
        // keep-alive/semantic-undo leg (both red pending their first live leg).
        "R1", "R10", "R10.keepalive", "R4", "R5", "R6", "R6F", "R7", "R8.showcase", "R8.prefs", "R8.inbox", "R9",
        "X1.voices", "X1.usage", "X1.home", "X1.inbox", "X1.detail",
        // STB.5a added T1…T16 — the BL-21/BL-22 live legs (nightly $0 T1–T8; weekly paid T9–T16).
        // SPA.21 added T12F/T13F — the seeded-dossier free twins of T12/T13 (REQ-VFY-10's owed
        // mutation coverage — red pending their first live leg, D-SPA.21-*).
        // SPA.25 added T17 — the source-mode toggle leg (REQ-ED-17; red while the editor-flag
        // preview run is owed — the toggle only exists on data-renderer="spa").
        "T1", "T2.badge", "T2.matrix", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T14", "T15", "T16", "T17", "T12F", "T13F",
        // STB.5b added B16/B17/B18A/B18B/B19A/B19B/B19C — the BL-16–19 bounded paid live legs
        // (all `red` until a leg lands its live asserts; B19C is the pre-registered cap drop).
        "B16", "B17", "B18A", "B18B", "B19A", "B19B", "B19C",
        // R7OPEN.1 (REQ-DACC-8) registered every round-7 leg `expected:"red"` with a wired owed
        // stub (r7legs.ts): the five D* demo legs, the seven U* UX legs, and the two
        // sub-assertions (U3.stopgap for the R7a PANE-0 probe, R8.showcase.spa for the REQ-DACC-6
        // renderer re-expectation). All `paid:false` — U6 is never a paid row (P4-25).
        "D1.hub", "D2.tour", "D3.readonly", "P1.demo", "R11.demo",
        "U1.shell", "U2.noreload", "U3.occlusion", "U4.controls", "U5.write", "U6.chat", "U7.import",
        "U3.stopgap", "R8.showcase.spa",
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
        // P1.outline/P1.figures/P1.dossier, R6F, T12F/T13F, T17 flipped red→green 2026-10-15
        // (VERIF.1 composed pass on the deployed `ffbb8ad` — each registry row carries its
        // dated live-evidence comment; all seven are `paid:false`, the paid pin is unaffected).
        "P1.public", "P1.project", "P1.pill", "P1.runsheet", "P1.app-new", "P1.outline", "P1.figures", "P1.dossier",
        // R10 flipped red→green 2026-10-16 (VERIF.2 pr-186 @ e7b21aecb): the warm-return leg
        // reported ready-to-flip on two independent runs (gates/ + seeded2/ — client-side hops,
        // monotone data-nav-count, no warm twin re-GET inside the freshness window).
        // R10.keepalive flipped red→green 2026-10-26 (R6DEP.2 posture stage pr-219 @ e04a8c8):
        // same data-page-session re-acquired inside the 120 s TTL AND ⌘Z removed the pre-leave
        // synced marker — F-R6POST.2-2's session-owned UndoManager proven live on the collab wire.
        "R1", "R4", "R5", "R6", "R6F", "R7", "R8.showcase", "R8.prefs", "R8.inbox", "R9", "R10", "R10.keepalive",
        "X1.voices", "X1.usage", "X1.home", "X1.inbox", "X1.detail",
        // STB.5a's greens: the $0 legs that pass on free tenants (T1–T7) + the weekly
        // paid riders whose prerequisites the weekly leg itself produces (T9–T12, T14). T3+T7
        // flipped green 2026-10-06 on the deployed tip fcbbc66 (CAP.3's fixes verified live —
        // nonce 6c268536d58b); T13 flipped green 2026-10-06 (funded window B continuation —
        // Apply + bulk-preview legs landed on the delivered funded dossier, nonce b76029538106-class);
        // T8 flipped red→green 2026-10-22 (R6POST.1 prod `dc7fb15a`, nonce dac7c118bf38): the
        // mint-t8-export.mjs fixture (GD-PREAUTH-ACTS.R6) answered 404 bogus / 410
        // `export_link_expired` minted — D-FIX.1-1 DONE. T15/T16 stay red — clock/prerequisite rows.
        "T1", "T2.badge", "T2.matrix", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T14",
        "T12F", "T13F", "T17",
        // D1.hub/D2.tour/D3.readonly/P1.demo/R11.demo flipped red→green 2026-11-04 — 224
        // R7DEP.1 Part A on the owned pr-259 preview @4f66cebc (ready-to-flip + three-width
        // screenshots, provenance match; U3.stopgap + R8.showcase.spa stay owed on defects).
        "D1.hub", "D2.tour", "D3.readonly", "P1.demo", "R11.demo",
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
  // R7OPEN.1 (REQ-DACC-8; RV-13): every round-7 leg is `expected:"red"` + `paid:false` with
  // exactly one owner — the nightly reports `owed`, never a run failure, and no leg can flip
  // before its owner lands the body (the phase deploys 224/250 plus 248 for D2.tour are the
  // only sanctioned flippers under GD-PREVIEW.R7). U6 is never a paid row (P4-25).
  it("every round-7 leg is red, free, single-owned, and its stub fails owed-loudly", async () => {
    // 224 R7DEP.1 (the sanctioned flipper) flipped D1.hub/D2.tour/D3.readonly/P1.demo/R11.demo
    // green on pr-259 preview evidence @4f66cebc — they are out of the red census; U3.stopgap +
    // R8.showcase.spa stay owed (D-R7DEP.1-1/-2).
    const R7_IDS = [
      "U1.shell", "U2.noreload", "U3.occlusion", "U4.controls", "U5.write", "U6.chat", "U7.import",
      "U3.stopgap", "R8.showcase.spa",
    ];
    const OWNERS: Record<string, string> = {
      "U1.shell": "R7SHELL.1a", "U2.noreload": "R7RELOAD.1", "U3.occlusion": "R7PANE.1",
      "U4.controls": "R7KIT.3e", "U5.write": "R7WRITE.1b", "U6.chat": "R7TALK.1a",
      "U7.import": "R7HOME.2a", "U3.stopgap": "R7FIX.1", "R8.showcase.spa": "R7RO.1",
    };
    // R7RO.1 / R7FIX.1 landed the real `R8.showcase.spa` / `U3.stopgap` bodies — they still read
    // red (the 224 phase deploy is the sanctioned flipper) but their impls are no longer the owed
    // stub: invoking them must NOT throw the stub message. Every other round-7 leg still throws
    // owed-loudly.
    // R7DEM.4b landed the real `R11.demo`/`P1.demo` bodies; R7DEM.5 landed `D3.readonly` — same arm (red until 224, but the
    // impl is a real body whose offline throw is its own error, never the stub message).
    // R7DEM.5b landed the real `D1.hub` body — same arm.
    // 222 R7DEM.6a landed the real `D2.tour` body — same arm (stays red until 224's preview evidence).
    const REAL_BODIES = new Set(["R8.showcase.spa", "U3.stopgap"]);
    for (const id of R7_IDS) {
      const s = stepById(id);
      expect(s, id).toBeDefined();
      expect(s!.expected, id).toBe("red");
      expect(s!.paid, id).toBe(false);
      expect(s!.capUsd, id).toBeUndefined();
      expect(s!.owner, id).toBe(OWNERS[id]);
      if (REAL_BODIES.has(id)) {
        await expect(ALL_IMPLS[id]!({} as never), id).rejects.toThrow(/^(?!.*owed — owner)/);
      } else {
        await expect(ALL_IMPLS[id]!({} as never), id).rejects.toThrow(
          `${id} owed — owner ${OWNERS[id]}`,
        );
      }
    }
    // no round-7 leg silently became a paid row (the weekly cron would sweep it in).
    const r7paid = STEP_REGISTRY.filter((s) => R7_IDS.includes(s.id) && s.paid);
    expect(r7paid).toEqual([]);
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

  // R5ECON.3 (REQ-ECON-9) — the §5.3 cap table lives VERBATIM on the registry's paid rows: the
  // dispatch refuses an uncapped paid leg (cli.ts + funded-window.mjs) and `finishLeg` enforces
  // the declared figure at close (CapOverrunError, REQ-ECON-7). Basis O2-F19: levered-expected;
  // unlevered-measured is the opt-out fallback bound. The no-own-spend riders (T9, T10–T16)
  // declare the $0.50 floor.
  it("every paid step declares the §5.3 capUsd verbatim (REQ-ECON-9)", () => {
    const FIVE_THREE: Record<string, number> = {
      B16: 0.5, B17: 1.0, B18A: 1.0, B18B: 1.0, B19A: 3.5, B19B: 1.5, B19C: 15.0,
      N5: 9.0, N6: 6.0, N11: 6.5, R4: 0.5, R6: 4.5, R9: 0.5,
    };
    for (const [id, cap] of Object.entries(FIVE_THREE)) {
      expect(legCapUsdFor(id), id).toBe(cap);
    }
    // the no-own-spend riders declare the floor (they ride the window's own deliveries).
    for (const id of ["T9", "T10", "T11", "T12", "T13", "T14", "T15", "T16"]) {
      expect(legCapUsdFor(id), id).toBe(LEG_CAP_FLOOR_USD);
    }
    // every paid row carries a finite cap ≥ the floor; a free row may carry none.
    for (const s of STEP_REGISTRY) {
      if (s.paid) {
        expect(Number.isFinite(s.capUsd), s.id).toBe(true);
        expect(s.capUsd!, s.id).toBeGreaterThanOrEqual(LEG_CAP_FLOOR_USD);
      }
    }
  });

  // R5ECON.2 (REQ-ECON-11) — the model-judgment opt-out pins: B19C (mandatory — the assert object
  // IS the full tier's judgment) + N6/R4 (the planted-error verdict / the turn's answer quality IS
  // the assert) pin `testCheapRoute:false` so COGS_LEVERS_TEST's default-ON arm never reaches them.
  it("the model-judgment legs pin testCheapRoute:false (REQ-ECON-11)", () => {
    for (const id of ["N6", "R4", "B19C"]) {
      expect(cogsLeversFor(id), id).toEqual({ testCheapRoute: false });
    }
    // …and no OTHER leg silently pins — the pin list is the audited opt-out set verbatim.
    const pinned = STEP_REGISTRY.filter((s) => s.cogsLevers !== undefined).map((s) => s.id).sort();
    expect(pinned).toEqual(["B19C", "N6", "R4"]);
    // pins are boolean lever maps — a non-boolean or a pin of an unknown key fails here.
    for (const s of STEP_REGISTRY) {
      for (const [k, v] of Object.entries(s.cogsLevers ?? {})) {
        expect(typeof v, `${s.id}.${k}`).toBe("boolean");
      }
    }
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
      // the ledger's owner (the split never re-assigns ownership). R7OPEN.1: `P1.demo` is NOT a
      // P1 split — it is a round-7 leg from spec §4.17 (REQ-DACC-4), owned by R7DEM.4b per §10 as
      // amended (P4-5); it shares the prefix but carries its own family.
      const family = stepById(id)
        ? [stepById(id)!]
        : STEP_REGISTRY.filter((s) => s.id.startsWith(`${id}.`) && s.id !== "P1.demo");
      expect(family.length, `ledger step ${id} missing from the registry`).toBeGreaterThan(0);
      for (const step of family) {
        expect(step.owner, `ledger owner for ${step.id}`).toBe(owner);
      }
    }
  });
});
