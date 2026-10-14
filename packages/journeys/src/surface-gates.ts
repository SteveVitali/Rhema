// SPA.6 — the flip-gate table (REQ-VFY-8/10, REQ-SEQ-7; design/27 F9's per-surface subsets;
// design/29 §route-map + §flip-order + the per-flip runbook). `--surface <key>` selects exactly
// the gate subset the surface's two-leg procedure must run — leg A (pinned ssr), leg B (unpinned
// expect-spa), leg C (the full `paid:false` suite) — on ONE flagged preview deployment.
//
// Every row's `steps` are `paid:false` forever (REQ-VFY-10 — a flip never gates on a paid leg);
// coverage that only exists inside paid legs rides `weeklyHolds` (the weekly leg re-proves it —
// the flag "hold" rule), and coverage no free step provides yet rides `owed` with its owning
// surface ticket named (the run refuses to gate an `owed`-only surface — an empty subset is
// vacuous, never a gate).

import type { SpaSurface } from "@rhema/contracts";
import { STEP_REGISTRY } from "./registry.js";

/** One gated row: which registry steps prove a surface safe to flip, on both renderers. */
export interface SurfaceGate {
  /** the flag key — identical to the map key (kept explicit for report serialization). */
  readonly flag: SpaSurface;
  /** registry step ids whose green must hold under BOTH renderers before this flag flips. */
  readonly steps: readonly string[];
  /** which leg of a multi-surface step carries THIS surface's contract (the step runs whole). */
  readonly legNotes: Readonly<Record<string, string>>;
  /** free coverage the surface still owes before its flip can gate (owner ticket named). */
  readonly owed: readonly string[];
  /** paid steps whose weekly green must keep holding — never part of the $0 gate (REQ-VFY-10). */
  readonly weeklyHolds: readonly string[];
}

/**
 * The two-leg procedure every gate row shares (design/29 §per-flip-runbook, REQ-SEQ-7): ONE
 * flagged `pr-<n>` preview deployment serves both legs — leg A pins `x-rhema-renderer: ssr` and
 * `--expect-renderer ssr` (the fallback verbatim), leg B runs un-pinned with
 * `--expect-renderer spa` (the env-flag truth), leg C runs the whole `paid:false` suite. Rollback
 * is the flag revert plus a leg-A re-run.
 */
export const TWO_LEG_PROCEDURE = {
  legA: {
    pin: "ssr",
    expect: "ssr",
    proves: "the SSR fallback behaves verbatim on the flagged build",
  },
  legB: {
    pin: null,
    expect: "spa",
    proves: "the surface under its own flag, same deployment",
  },
  legC: "the full paid:false suite on the flagged build (nightly-shaped)",
  rollback: "remove the key from rhema:spaSurfaces → up → re-run leg A",
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
  inbox: gate("inbox", ["T2", "R8", "X1.inbox"], {
    legNotes: { T2: "the badge ⇄ Needs-you rows legs", R8: "the inbox leg" },
  }),
  settings: gate("settings", ["T2", "T3", "R8"], {
    legNotes: {
      T2: "the notification-matrix leg",
      R8: "the Preferences leg",
      T3: "the account zip / data-rights legs",
    },
  }),
  voices: gate("voices", ["T5", "X1.voices"]),
  onboarding: gate("onboarding", ["N1", "N3", "N4", "P1.app-new"], {
    legNotes: { N4: "the protocol-card estimate half" },
  }),
  "project-home": gate("project-home", ["R1", "R7", "T2", "T6", "T7", "P1.project", "X1.home"], {
    legNotes: { T2: "the badge leg", R7: "the gate/labels legs" },
  }),
  billing: gate("billing", ["N9"], {
    legNotes: { N9: "the free Choose-Writer / Buy-credits / portal legs" },
  }),
  export: gate("export", ["R5", "T4", "T8"], {
    // T8 is expected-red — it reports owed under both renderers, it does not gate.
    legNotes: { T8: "the token gate — owed-reporting, not a gate assert" },
  }),
  outline: gate("outline", [], {
    owed: ["no free step walks /p/:p/outline today — SPA.18 names its gate subset"],
  }),
  figures: gate("figures", [], {
    owed: ["no free step walks /p/:p/figures or /visualize today — SPA.19 names its gate subset"],
  }),
  "run-sheet": gate("run-sheet", ["N4", "R7", "N9", "P1.runsheet"], {
    legNotes: { R7: "the scope-line leg", N9: "the Add-credits Payment-Link leg" },
  }),
  dossier: gate("dossier", ["N7", "T1"], {
    owed: [
      "the T12F/T13F seeded-dossier mutation free sub-steps (REQ-VFY-10) — SPA.21 owns them",
    ],
    weeklyHolds: ["T10", "T11", "T12", "T13"],
  }),
  "run-report": gate("run-report", [], {
    owed: [
      "the free delivered-run-report render step (REQ-VFY-10) — SPA.22 owns it; until it lands this surface cannot flip",
    ],
    weeklyHolds: ["R6", "R9"],
  }),
  editor: gate("editor", ["N8", "P1.pill", "P1.project", "R7", "T2", "T6", "T7"], {
    legNotes: {
      N8: "type → fork → save, no confirm",
      "P1.pill": "the pill legs + the phone reader-Page markers",
      T2: "the badge leg",
    },
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
