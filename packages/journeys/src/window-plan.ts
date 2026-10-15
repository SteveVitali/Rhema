// R5ECON.3 — the funded-window regime (REQ-FND-6/7/8 + REQ-ECON-9's caps-in-registry half).
// One module owns the window's own vocabulary — the re-authorized round envelope, the §5.3
// cap-table constants the census's non-registry items share, the §5.5 checklist ordering, and
// the pure checklist evaluator `funded-window.mjs --dry-run` prints — so 166_GATE-R5F's
// checklist is mechanically checkable and 167_FUNDED.1 is a leg-runner.

import { STEP_REGISTRY, stepById, type JourneyStep } from "./registry.js";

/** A step's index in the registry — the canonical within-class order the checklist applies. */
const REGISTRY_INDEX = new Map(STEP_REGISTRY.map((s, i) => [s.id, i]));

/** Ratified Q-ECON.f — the re-authorized cumulative round envelope (was the stale round-3
 *  $150 bound; ~$60 covers the levered window's ~$20–40 estimate with headroom). The env
 *  `FUNDED_WINDOW_CAP_USD` (fallback `FUNDED_ROUND3_CAP_USD`) overrides it at dispatch. */
export const FUNDED_WINDOW_CAP_USD = 60 as const;

/** The cumulative query's epoch — unchanged from the round-3 window (the pinned-scope sum
 *  counts every flagged-tenant proxy row since this date; the seed exclusion is inside
 *  `FLAGGED_PROXY_SPEND_SCOPE`). */
export const FUNDED_WINDOW_SINCE_DEFAULT = "2026-10-01" as const;

/** §5.3 verbatim — the non-registry CITE probe legs' per-probe cap (Q-ECON.h's raise). */
export const CITE_PROBE_CAP_USD = 9 as const;

/** §5.3 — the declared-cap floor: no launching leg's bound may sit below $0.50. */
export const LEG_CAP_FLOOR_USD = 0.5 as const;

// ---- the census spend classes (r5_f1_funded-census.md F1.1 — 12 launchers + 9 riders) --------

/** T9 — the quiet-hours arming pre-step: it MUST run before any launch so the window's
 *  run_finished deliveries land inside the armed window (the T14 rider reads them). */
export const WINDOW_PRESTEP_ID = "T9" as const;

/** The riders — `paid:true` steps that launch no run of their own and ride the window's own
 *  deliveries/substrate (REQ-FND-6): T10–T16 + R9. T9 is the pre-step, not a rider here. */
export const WINDOW_RIDER_IDS = ["T10", "T11", "T12", "T13", "T14", "T15", "T16", "R9"] as const;

/** B19C — last-and-conditional: the $15 full-tier build runs only when the envelope survives
 *  every earlier leg. */
export const WINDOW_CONDITIONAL_ID = "B19C" as const;

export type WindowClass = "free" | "prestep" | "launcher" | "rider" | "conditional";

/** A step's §5.5 checklist slot. `paid:false` ⇒ `free` — the ordering rule never touches it. */
export function windowClassOf(step: Pick<JourneyStep, "id" | "paid">): WindowClass {
  if (!step.paid) return "free";
  if (step.id === WINDOW_PRESTEP_ID) return "prestep";
  if (step.id === WINDOW_CONDITIONAL_ID) return "conditional";
  if ((WINDOW_RIDER_IDS as readonly string[]).includes(step.id)) return "rider";
  return "launcher";
}

/**
 * §5.5's checklist ordering applied to a dispatch's selected steps: T9 first, then the
 * launchers in registry order, then the riders, then B19C last-and-conditional. Free steps
 * sort ahead of the paid block in registry order (they spend nothing and may seed substrate).
 * Within every class the order is REGISTRY order — the selection's own order never leaks
 * (a `--steps B19A,N5` CSV dispatches N5 first regardless of how the operator typed it).
 */
export function orderWindowSteps(steps: readonly JourneyStep[]): JourneyStep[] {
  const sorted = [...steps].sort(
    (a, b) => (REGISTRY_INDEX.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (REGISTRY_INDEX.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const byClass = (cls: WindowClass) => sorted.filter((s) => windowClassOf(s) === cls);
  return [
    ...byClass("free"),
    ...byClass("prestep"),
    ...byClass("launcher"),
    ...byClass("rider"),
    ...byClass("conditional"),
  ];
}

export interface WindowDispatchPlan {
  /** the selected steps in §5.5 checklist order */
  readonly ordered: readonly JourneyStep[];
  /** the selected paid steps (ordered) — the set the headroom sum + cap presence cover */
  readonly paid: readonly JourneyStep[];
  /** paid steps carrying no declared capUsd — non-empty ⇒ refuse to dispatch (REQ-ECON-9) */
  readonly missingCaps: readonly string[];
  /** Σ capUsd over the selected paid steps — the honest spend bound this dispatch may incur */
  readonly requiredHeadroomUsd: number;
}

/** The dispatch pre-flight shape: order + cap presence + the summed headroom requirement. */
export function planWindowDispatch(steps: readonly JourneyStep[]): WindowDispatchPlan {
  const ordered = orderWindowSteps(steps);
  const paid = ordered.filter((s) => s.paid);
  return {
    ordered,
    paid,
    missingCaps: paid.filter((s) => s.capUsd == null).map((s) => s.id),
    requiredHeadroomUsd: paid.reduce((sum, s) => sum + (s.capUsd ?? 0), 0),
  };
}

// ---- the §5.5 window-opening checklist (166_GATE-R5F's mechanical arm) ------------------------

export interface WindowChecklistRow {
  /** the checklist item's stable id (§5.5 order) */
  readonly id: string;
  /** the verbatim checklist assertion, threshold included */
  readonly label: string;
  readonly status: "pass" | "fail" | "skip";
  readonly detail: string;
}

const row = (id: string, label: string, ok: boolean, detail: string): WindowChecklistRow => ({
  id,
  label,
  status: ok ? "pass" : "fail",
  detail,
});

export interface WindowChecklistInput {
  /** JOURNEY_DATABASE_URL bound? (a `null` probe means the DB rows can't be measured — fail) */
  readonly dsnBound: boolean;
  /** the `pg_roles` probe result — true only on a superuser/BYPASSRLS system role */
  readonly systemRoleBypass: boolean | null;
  /** pinned-scope cumulative metered USD since the round epoch (null ⇒ unmeasured) */
  readonly cumulativeUsd: number | null;
  /** cumulative row count (evidence echo) */
  readonly cumulativeRows?: number | null;
  /** the re-authorized round cap the cumulative is compared against */
  readonly roundCapUsd: number;
  /** the epoch the cumulative counts from */
  readonly roundSince: string;
  /** `--headroom` as passed (null ⇒ absent) */
  readonly headroomUsd: number | null;
  /** the dispatch plan (caps presence, ordering, headroom requirement) */
  readonly plan: WindowDispatchPlan;
  /** the leg-close cap assert is compiled in — proven by a synthetic CapOverrunError probe */
  readonly capEnforcementLive: boolean;
  /** JOURNEY_FUNDED_STABLE_TAG bound */
  readonly fundedStableTag: string | null;
  /** the funded tenant probe (null fields ⇒ unmeasurable) */
  readonly fundedTenant: {
    readonly exists: boolean;
    readonly isTest: boolean;
    /** age of `workspaces.created_at` in hours — the purge exemption is freshness-based */
    readonly ageHours: number | null;
    /** TEST_TENANT_PURGE_HOURS as deployed (the exemption must sit inside it) */
    readonly purgeHours: number;
  } | null;
  /** the shared guard scope carries the REQ-ECON-6 seed exclusion (compile-time fact) */
  readonly seedExclusionsLive: boolean;
  /** the REQ-ECON-11 opt-out pins honored: B19C/N6/R4 pin `testCheapRoute:false` */
  readonly optOutPinsHonored: boolean;
  /** the funded-pause sentinel (a prior cap_overrun pauses the window until re-authorized) */
  readonly paused: { readonly paused: boolean; readonly detail?: string };
}

/**
 * Evaluate the §5.5 window-opening checklist — the same rows, in the same order, the gate
 * reads. `null` inputs mean "unmeasurable" and FAIL closed (a gate that cannot see a meter
 * cannot open the window). `funded-window.mjs --dry-run` feeds this the live reads.
 */
export function windowChecklist(args: WindowChecklistInput): WindowChecklistRow[] {
  const rows: WindowChecklistRow[] = [];

  // 1 — system-role DSN + pg_roles probe (REQ-FND-2 / D-STB.5b-1).
  rows.push(
    !args.dsnBound
      ? { id: "dsn", label: "system-role DSN bound (JOURNEY_DATABASE_URL)", status: "fail", detail: "JOURNEY_DATABASE_URL unset — the meter is unreadable" }
      : row(
          "dsn",
          "system-role DSN bound + pg_roles probe (rolsuper|rolbypassrls)",
          args.systemRoleBypass === true,
          args.systemRoleBypass === true
            ? "the bound role bypasses RLS — the meter reads real spend"
            : args.systemRoleBypass === false
              ? "the bound role does NOT bypass RLS — an app-login pool reads $0 and blinds the guard"
              : "the pg_roles probe did not run",
        ),
  );

  // 2 — cumulative < the re-authorized round cap, on the pinned scope.
  rows.push(
    args.cumulativeUsd == null
      ? { id: "cumulative", label: `cumulative < ~$${args.roundCapUsd} (pinned-scope since ${args.roundSince})`, status: "fail", detail: "unmeasured — the DSN row must pass first" }
      : row(
          "cumulative",
          `cumulative < ~$${args.roundCapUsd} re-authorized round cap (pinned-scope since ${args.roundSince})`,
          args.cumulativeUsd < args.roundCapUsd,
          `$${args.cumulativeUsd.toFixed(2)} metered over ${args.cumulativeRows ?? "?"} flagged-tenant proxy rows vs $${args.roundCapUsd}`,
        ),
  );

  // 3 — --headroom required (REQ-ECON-9): present AND covering the selected legs' summed caps.
  rows.push(
    args.headroomUsd == null
      ? { id: "headroom", label: "--headroom <legCapUsd> required on every dispatch", status: "fail", detail: "absent" }
      : row(
          "headroom",
          "--headroom <legCapUsd> required (covers the selected legs' summed caps)",
          args.headroomUsd >= args.plan.requiredHeadroomUsd,
          `$${args.headroomUsd} declared vs $${args.plan.requiredHeadroomUsd.toFixed(2)} required (${args.plan.paid.length} paid leg(s))`,
        ),
  );

  // 4 — per-leg caps declared + the leg-close enforcement compiled in.
  const missing = args.plan.missingCaps;
  rows.push(
    row(
      "caps",
      "per-leg cap presence (every selected paid leg declares capUsd) + leg-close enforcement live",
      missing.length === 0 && args.capEnforcementLive,
      missing.length > 0
        ? `uncapped paid legs: ${missing.join(",")}`
        : args.capEnforcementLive
          ? "all selected paid legs declare capUsd; the synthetic CapOverrunError probe fires"
          : "caps declared but the leg-close CapOverrunError probe did not fire",
    ),
  );

  // 5 — ordering: T9 → launchers → riders → B19C last-and-conditional.
  const ids = args.plan.ordered.map((s) => s.id);
  const classes = args.plan.ordered.map((s) => windowClassOf(s));
  const seq = { free: 0, prestep: 1, launcher: 2, rider: 3, conditional: 4 } as const;
  const orderedOk = classes.every((c, i) => i === 0 || seq[c] >= seq[classes[i - 1]!]);
  rows.push(
    row(
      "ordering",
      "ordering T9 → launchers → riders → B19C last-and-conditional",
      orderedOk,
      ids.join(" → ") || "(no steps selected)",
    ),
  );

  // 6 — the funded stable tenant + purge exemption (freshness arm).
  const t = args.fundedTenant;
  rows.push(
    args.fundedStableTag == null
      ? { id: "tenant", label: "JOURNEY_FUNDED_STABLE_TAG tenant + purge exemption", status: "fail", detail: "JOURNEY_FUNDED_STABLE_TAG unset" }
      : t == null
        ? { id: "tenant", label: "JOURNEY_FUNDED_STABLE_TAG tenant + purge exemption", status: "fail", detail: `tag ${args.fundedStableTag} bound but the tenant row is unmeasured — the DSN row must pass first` }
        : row(
            "tenant",
            "JOURNEY_FUNDED_STABLE_TAG tenant exists, is_test-flagged, purge-fresh",
            t.exists && t.isTest && t.ageHours != null && t.ageHours < t.purgeHours,
            !t.exists
              ? `no workspace for the stable tag — seed it (scripts/live/funded-tenant.mjs) before the gate`
              : !t.isTest
                ? "the resolved workspace is NOT is_test — the funded tenant must be flagged"
                : t.ageHours == null
                  ? "workspace age unmeasured"
                  : t.ageHours < t.purgeHours
                    ? `workspace ${t.ageHours.toFixed(1)}h old < ${t.purgeHours}h purge window`
                    : `workspace ${t.ageHours.toFixed(1)}h old ≥ ${t.purgeHours}h purge window — refresh the exemption (funded-tenant.mjs)`,
          ),
  );

  // 7 — REQ-ECON-6 seed exclusions live on the guard scope.
  rows.push(
    row(
      "exclusions",
      "REQ-ECON-6 seed exclusions live (req_jrn_ marker filtered from every guard query)",
      args.seedExclusionsLive,
      args.seedExclusionsLive
        ? "FLAGGED_PROXY_SPEND_SCOPE carries the provider_request_id exclusion"
        : "the shared guard scope lacks the seed marker — seeded fiction would count as spend",
    ),
  );

  // 8 — the testCheapRoute arm's per-leg opt-outs honored (gate's pre-registered threshold).
  rows.push(
    row(
      "optouts",
      "testCheapRoute arm live with per-leg opt-outs pinned (B19C/N6/R4 → false)",
      args.optOutPinsHonored,
      args.optOutPinsHonored
        ? "B19C/N6/R4 pin cogsLevers.testCheapRoute=false — the model-judgment legs opt out"
        : "an opt-out pin is missing — check cogsLeversFor(B19C|N6|R4)",
    ),
  );

  // 9 — the window is unpaused (no cap_overrun sentinel — REQ-ECON-7).
  rows.push(
    row(
      "unpaused",
      "funded window unpaused (no cap_overrun sentinel)",
      !args.paused.paused,
      args.paused.paused ? `PAUSED — ${args.paused.detail ?? "a leg closed cap_overrun"}` : "no funded-pause.json sentinel",
    ),
  );

  return rows;
}

/** The REQ-ECON-11 opt-out set the gate checks verbatim — B19C mandatory, N6/R4 candidate. */
export const REQ_ECON_11_OPTOUT_IDS = ["B19C", "N6", "R4"] as const;

/** Are the opt-out pins honored? (B19C/N6/R4 pin `testCheapRoute:false` in the registry.) */
export function optOutPinsHonored(): boolean {
  return REQ_ECON_11_OPTOUT_IDS.every(
    (id) => stepById(id)?.cogsLevers?.["testCheapRoute"] === false,
  );
}
