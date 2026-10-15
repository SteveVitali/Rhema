// SPA.6 — the surface gate table (REQ-VFY-8/10, REQ-SEQ-7; design/27 F9's per-surface subsets;
// design/29 §route-map + §flip-order + the per-flip runbook). `--surface <key>` selects exactly
// the gate subset for that surface and scopes `--expect-renderer` to the gated routes' path set.
// SPA.28 — the migration-window "two-leg" (leg A pinned-ssr / leg B flag-on) is RETIRED with the
// override channels: every gated surface serves the shell unconditionally now, so the only
// renderer a `--surface` leg can observe on its docs is `spa` (+ the structural `ssr` of the
// public funnel/forced-SSR Page arms it traverses — which is why the scope exists).
//
// Every row's `steps` are `paid:false` forever (REQ-VFY-10 — a gate never runs a paid leg);
// coverage that only exists inside paid legs rides `weeklyHolds` (the weekly leg re-proves it —
// the "hold" rule), and coverage no free step provides yet rides `owed` with its owning
// surface ticket named (the run refuses to gate an `owed`-only surface — an empty subset is
// vacuous, never a gate).

import type { SpaSurface } from "@rhema/contracts";
import { STEP_REGISTRY } from "./registry.js";

/** One gated row: which registry steps carry a surface's journey contract. */
export interface SurfaceGate {
  /** the surface key — identical to the map key (kept explicit for report serialization). */
  readonly flag: SpaSurface;
  /** registry step ids whose green must hold for this surface's gate leg. */
  readonly steps: readonly string[];
  /** which leg of a multi-surface step carries THIS surface's contract (the step runs whole). */
  readonly legNotes: Readonly<Record<string, string>>;
  /** free coverage the surface still owes (owner ticket named). */
  readonly owed: readonly string[];
  /** paid steps whose weekly green must keep holding — never part of the $0 gate (REQ-VFY-10). */
  readonly weeklyHolds: readonly string[];
}

/**
 * The procedure every gate row shares (design/29 §per-flip-runbook, REQ-SEQ-7 — updated SPA.28):
 * ONE `pr-<n>` preview deployment serves the legs — the surface subset runs with
 * `--expect-renderer spa` (every gated document must report the shell; the `data-renderer`
 * markers remain the contract), then the whole `paid:false` suite (nightly-shaped). The old
 * leg-A `x-rhema-renderer: ssr` pin + the flag-revert rollback are gone — there is no SSR
 * document or flag left to observe; rollback of a flipped surface is revert+redeploy of the
 * serving code (D-SPA.27-1), then the same `--expect-renderer spa` leg.
 */
export const TWO_LEG_PROCEDURE = {
  legA: {
    pin: null,
    expect: "spa",
    proves: "the surface's documents report data-renderer=spa on the deployment",
  },
  legB: "the full paid:false suite on the same build (nightly-shaped)",
  rollback:
    "revert the serving change + redeploy (no flag remains — D-SPA.27-1), then re-run the expect-spa leg",
} as const;

const gate = (
  flag: SpaSurface,
  steps: readonly string[],
  extra: Partial<Pick<SurfaceGate, "legNotes" | "owed" | "weeklyHolds">> = {},
): SurfaceGate => ({
  flag,
  steps,
  legNotes: extra.legNotes ?? {},
  owed: extra.owed ?? [],
  weeklyHolds: extra.weeklyHolds ?? [],
});

/**
 * The registry — one row per `SpaSurface` key (the type enforces totality). Step ids are the
 * design/27 F9 table's subsets applied to the post-split registry; a step whose legs span several
 * surfaces appears under each with a `legNotes` entry naming the load-bearing leg.
 */
export const SURFACE_GATES: Readonly<Record<SpaSurface, SurfaceGate>> = {
  usage: gate("usage", ["X1.usage"]),
  // SPA.11 — T2/R8 were split into per-surface legs, so each gated id IS this surface's leg and
  // no legNotes indirection is needed here.
  inbox: gate("inbox", ["T2.badge", "R8.inbox", "X1.inbox"]),
  settings: gate("settings", ["T2.matrix", "T3", "R8.prefs"], {
    legNotes: {
      T3: "the account zip / rights-export legs",
    },
  }),
  voices: gate("voices", ["T5", "X1.voices"]),
  onboarding: gate("onboarding", ["N1", "N3", "N4", "P1.app-new"], {
    legNotes: { N4: "the protocol-card estimate half" },
  }),
  "project-home": gate("project-home", ["R1", "R7", "T2.badge", "T6", "T7", "P1.project", "X1.home", "R10"], {
    legNotes: {
      R7: "the gate/labels legs",
      // R10 is expected:red until its first live leg — it reports owed, it does not gate.
      R10: "the /app → /p/:slug client-nav hop (the ticket's owed-reporting leg)",
    },
  }),
  billing: gate("billing", ["N9"], {
    legNotes: { N9: "the free Choose-Writer / Buy-credits / portal legs" },
  }),
  export: gate("export", ["R5", "T4", "T8"], {
    // T8 is expected-red — it reports owed under both renderers, it does not gate.
    legNotes: { T8: "the token gate — owed-reporting, not a gate assert" },
  }),
  // SPA.18 — `P1.outline` walks `/p/:p/outline` + `/outline/promote` at phone width under BOTH
  // renderers (the §10.1 read-only contract + the not-found arms — renderer-agnostic). The step is
  // `expected:"red"` pending its first preview leg (D-SPA.18-*) — a red miss reports `owed`, and a
  // desktop-width + outline-bearing walk remains owed honestly: no free step can mint an outline
  // (promotion is a paid run — REQ-VFY-10), so the desktop/editor arms ride this note until a seeded
  // fixture or a paid leg can carry them.
  outline: gate("outline", ["P1.outline"], {
    owed: [
      "P1.outline is expected:red pending its first preview leg — the Resend secret blocker (D-SPA.18-1) holds the run; SPA.28 discharged the renderer-parity leg (only one renderer remains)",
      "desktop-width + outline-bearing legs (the editable form's ed.* grammar, autosave status, cited-409 flash) — no free step can mint an outline today; the dom.test parity legs stand in until a seeded fixture or paid leg carries them",
    ],
  }),
  // SPA.19 — `P1.figures` walks the pane, the card, and the visualize sheet at phone width under
  // BOTH renderers (rows-or-empty / preview-or-not-found / consent-form-or-not-found — every leg
  // is a designed arm, renderer-agnostic). The step is `expected:"red"` pending its first preview
  // leg (the Resend secret blocker — D-SPA.19-*): a red miss reports `owed`, and the
  // figure-bearing desktop legs stay owed honestly — no free step can mint a figure (the
  // Visualize click is a paid run — REQ-VFY-10), so the populated-card arms ride this note until
  // a seeded fixture or a paid leg can carry them.
  figures: gate("figures", ["P1.figures"], {
    owed: [
      "P1.figures is expected:red pending its first preview leg — the Resend secret blocker (D-SPA.19-1) holds the run; SPA.28 discharged the renderer-parity leg (only one renderer remains)",
      "figure-bearing legs (type chips, field edits, the pending-proposal Accept/Reject arms) — no free step can mint a figure today (the Visualize click is a paid run); the dom.test parity legs stand in until a seeded fixture or paid leg carries them",
    ],
  }),
  // SPA.20 — the F9 subset (design/27): N4's estimate-agreement leg, R7's scope-line leg, N9's
  // run-sheet Add-credits Payment-Link leg, P1.runsheet's phone-width capability note. Every leg
  // selects on manifest hooks (`form[data-run-sheet]`, `[data-phone-blocked]`, `data-*` copy
  // hooks) — renderer-agnostic by construction. The steps stay `expected:"green"` (they are
  // carried legs the nightly already walks); what is owed is the ticket's own preview leg — the
  // Resend secret blocker (D-SPA.20-*) holds it.
  "run-sheet": gate("run-sheet", ["N4", "R7", "N9", "P1.runsheet"], {
    legNotes: { R7: "the scope-line leg", N9: "the Add-credits Payment-Link leg" },
    owed: [
      "the SPA.20 preview leg — the Resend secret blocker (D-SPA.20-1) holds the pr-<n> run; SPA.28 retired the two-leg/rollback drill (no SSR document or flag remains); the dom.test + bff.test parity legs stand in",
    ],
  }),
  // SPA.21 — the F9 subset plus the REQ-VFY-10 seeded-mutation sub-steps this surface owed:
  // T12F/T13F walk T12/T13's write legs on the seeded writable dossier (`seedWritableDossier` —
  // the Showcase fixture on a `showcase=false` project), P1.dossier walks the dossier at phone
  // width under both renderers. All three are `expected:"red"` pending their first live leg (the
  // Resend secret blocker — D-SPA.21-*) — a red miss reports `owed`, it does not gate.
  dossier: gate("dossier", ["N7", "T1", "T12F", "T13F", "P1.dossier"], {
    owed: [
      "the SPA.21 preview leg — the Resend secret blocker (D-SPA.21-1) holds the pr-<n> run; SPA.28 retired the two-leg/rollback drill (no SSR document or flag remains); the dom.test + bff parity legs stand in",
      "T12F/T13F/P1.dossier are expected:red until their first live leg — red misses report owed; the seeded writable dossier provisioning (seedWritableDossier + the JOURNEY_DATABASE_URL arm) is committed and unit-tested",
    ],
    weeklyHolds: ["T10", "T11", "T12", "T13"],
  }),
  // SPA.22 — the delivered-render leg this surface owed: R6F walks the SEEDED delivered run
  // report (`seedDeliveredRunReport` — the dossier fixture plus the credit_ledger grant+debit
  // pair and the `step:<phase>`-keyed proxy usage_records, all at $0 on the leg's own tenant)
  // and asserts the full Level-3/4 vocabulary under both renderers. The step is
  // `expected:"red"` pending its first live leg (the Resend secret blocker — D-SPA.22-*) — a
  // red miss reports `owed`, it does not gate. The paid live-meter legs (R6's within-phase
  // meter movement + R9's refund round-trip) stay `weeklyHolds` — REQ-VFY-10 keeps them out of
  // the $0 gate.
  "run-report": gate("run-report", ["R6F"], {
    owed: [
      "the SPA.22 preview leg — the Resend secret blocker (D-SPA.22-1) holds the pr-<n> run; SPA.28 retired the two-leg/rollback drill (no SSR document or flag remains); the dom.test parity legs stand in",
      "R6F is expected:red until its first live leg — a red miss reports owed; the seeded delivered-run-report provisioning (seedDeliveredRunReport + the JOURNEY_DATABASE_URL arm) is committed and unit-tested",
    ],
    weeklyHolds: ["R6", "R9"],
  }),
  // SPA.23 — the mount/registry seam lands the five leaves (`/p/:p`, `/v/:v`, `/v/:n/diff/:m`,
  // `/a/:artifactId`, `/revisions/:cid`); the steps stay the carried legs the nightly already
  // walks — renderer-agnostic by construction. What is owed is the ticket's own preview legs —
  // the Resend secret blocker (D-SPA.23-*) holds the pr-<n> runs.
  editor: gate("editor", ["N8", "P1.pill", "P1.project", "R7", "R10", "R10.keepalive", "T2.badge", "T6", "T7", "T17"], {
    legNotes: {
      N8: "type → fork → save, no confirm",
      "P1.pill": "the pill legs + the phone reader-Page markers",
      // R10/R10.keepalive are expected:red until their first live legs — owed, not gating.
      R10: "the /p/:slug → /v/working → Back client-nav hops + the warm-return freshness assert",
      "R10.keepalive": "the /app away-hop → same data-page-session + ⌘Z semantic-undo return leg",
      T17: "the source-mode toggle — SPA-rendered only (REQ-ED-17)",
    },
    owed: [
      "the preview legs — the Resend secret blocker (D-SPA.23-1 for the mount half, D-SPA.24-1 for the collab half, D-SPA.25-1 for the source-mode leg) holds the pr-<n> runs; SPA.28 retired the two-leg/rollback drills (no SSR document or flag remains); the dom.test + bff parity legs stand in",
    ],
  }),
  "ide-chrome": gate("ide-chrome", ["P1.project"], {
    legNotes: {
      "P1.project": "the IDE frame at phone width — phonebar, action row, §10.1 mount contract",
    },
    // flips together with `export` (SPA.17); the framed surfaces' gates carry the content half.
    weeklyHolds: ["T12"],
  }),
};

/**
 * The union of the named surfaces' gate subsets, in registry order. Throws on a surface whose
 * gate is still empty — gating nothing is vacuous, so the run refuses loudly instead.
 */
export function stepsForSurfaces(surfaces: readonly SpaSurface[]): readonly string[] {
  const wanted = new Set<string>();
  const empty: SpaSurface[] = [];
  for (const key of surfaces) {
    const g = SURFACE_GATES[key];
    if (g.steps.length === 0) {
      empty.push(key);
      continue;
    }
    for (const id of g.steps) wanted.add(id);
  }
  if (empty.length > 0) {
    const detail = empty
      .map((k) => `${k} (owed: ${SURFACE_GATES[k].owed.join("; ") || "coverage unset"})`)
      .join(", ");
    throw new Error(`--surface: no gated steps exist yet for ${detail}`);
  }
  return STEP_REGISTRY.filter((s) => wanted.has(s.id)).map((s) => s.id);
}
