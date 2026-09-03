import { z } from "zod";
import { idSchema, isoSchema } from "../ids.js";
import {
  GATE_KINDS,
  NEVER_AUTOPROCEED_GATES,
  gateKindSchema,
  type GateKind,
  type GateOnExpiry,
} from "../enums.js";

// Gates as durable mechanics (§6.4; REQ-GATE-1..12; REQ-SPEC-1; REQ-DATA-35/36). This module carries the
// §6.4 Ruling-R3 deadline table AS DATA — pre-registered defaults (§16.3 #2) so telemetry can revise the
// numbers without a code change — plus the REQ-SPEC-1 override rule set and the Decision row shape. The
// orchestrator (P0.10) reads GATE_DEFAULTS to open a gate and resolveGatePolicy to apply the project's
// approval policy + overrides; it never hard-codes a deadline.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The three add-eligible wait-default kinds (REQ-SPEC-1): an override may ADD a ≥2 h deadline to these. */
export const WAIT_DEFAULT_GATES: readonly GateKind[] = ["approve_triage", "approve_outline", "choose_thesis"];

/** The minimum deadline an override may ADD to a wait-default kind (REQ-SPEC-1: "≥ 2 h"). */
export const MIN_ADDED_DEADLINE_MS = 2 * HOUR_MS;

/** One row of the §6.4 R3 table, as data. `deadlineMs: null` means *wait* (no deadline). */
export interface GateDefault {
  /** default deadline in ms from open; `null` = wait (the card has no countdown). */
  readonly deadlineMs: number | null;
  /** what the kind's expiry runs when the deadline fires (the `Gate.onExpiry` enum). */
  readonly onExpiry: GateOnExpiry;
  /** whether the card blocks the run by default (approve_scope is *informational* = false; §6.4 REQ-SPEC-17). */
  readonly blocking: boolean;
  /** a spend/refusal kind that never auto-proceeds under any policy/override/timer (REQ-SPEC-1). */
  readonly neverAutoProceed: boolean;
  /** the default is *wait* and an override may add a ≥2 h deadline (REQ-SPEC-1). Exactly WAIT_DEFAULT_GATES. */
  readonly waitDefault: boolean;
}

/**
 * The §6.4 Ruling R3 table verbatim, as pre-registered defaults (§16.3 #2). Every gate kind's default deadline
 * and `onExpiry`. approve_scope's row is its *informational* base (blocking:false, no countdown); the blocking
 * and spend variants (REQ-SPEC-17) are computed by resolveGatePolicy from the run's context. continue_rounds
 * defaults to *wait* (Ask each round) and gates every round regardless of the approval policy.
 */
export const GATE_DEFAULTS: Readonly<Record<GateKind, GateDefault>> = {
  // Approve plan: 24 h, then the skill's conservative path (open questions resolved conservatively).
  approve_plan: { deadlineMs: 24 * HOUR_MS, onExpiry: "proceed_conservative", blocking: true, neverAutoProceed: false, waitDefault: false },
  // Confirm scope: informational by default (the run proceeds; the card stays). Blocking/spend variants computed.
  approve_scope: { deadlineMs: null, onExpiry: "wait", blocking: false, neverAutoProceed: false, waitDefault: false },
  // Approve triage: wait (the ledger is the human's decisions). Per-project opt-in: add 24 h → proceed_as_proposed.
  approve_triage: { deadlineMs: null, onExpiry: "wait", blocking: true, neverAutoProceed: false, waitDefault: true },
  // Approve outline: wait (nothing downstream is waiting; the user's own commitment).
  approve_outline: { deadlineMs: null, onExpiry: "wait", blocking: true, neverAutoProceed: false, waitDefault: true },
  // Approve sample: 24 h within the cap consented at launch (persona runs are never on the critical path).
  approve_sample: { deadlineMs: 24 * HOUR_MS, onExpiry: "proceed_as_proposed", blocking: true, neverAutoProceed: false, waitDefault: false },
  // Approve cut list: 2 h (cheap, restorable — the cut list is preserved).
  approve_cutlist: { deadlineMs: 2 * HOUR_MS, onExpiry: "proceed_as_proposed", blocking: true, neverAutoProceed: false, waitDefault: false },
  // Choose a thesis: wait (terminal hand-off to Outline).
  choose_thesis: { deadlineMs: null, onExpiry: "wait", blocking: true, neverAutoProceed: false, waitDefault: true },
  // Continue?: wait by default (Ask each round); gates every round even under Run to completion.
  continue_rounds: { deadlineMs: null, onExpiry: "wait", blocking: true, neverAutoProceed: false, waitDefault: false },
  // Spend (created without a sheet): wait 7 days → cancel. Never auto-proceeds.
  confirm_cost: { deadlineMs: 7 * DAY_MS, onExpiry: "cancel", blocking: true, neverAutoProceed: true, waitDefault: false },
  // Spend (mid-run overrun): wait. Never auto-proceeds.
  spend_overrun: { deadlineMs: null, onExpiry: "wait", blocking: true, neverAutoProceed: true, waitDefault: false },
  // Resume partial (a cap was hit): wait 30 days → accept the partial. Never auto-proceeds (accept ≠ proceed).
  resume_partial: { deadlineMs: 30 * DAY_MS, onExpiry: "accept_partial", blocking: true, neverAutoProceed: true, waitDefault: false },
  // Refusal / validation failure: 7 days → cancel. Never auto-proceeds.
  refusal: { deadlineMs: 7 * DAY_MS, onExpiry: "cancel", blocking: true, neverAutoProceed: true, waitDefault: false },
};

// Self-check: GATE_DEFAULTS covers exactly the twelve kinds, and neverAutoProceed ≡ NEVER_AUTOPROCEED_GATES.
for (const k of GATE_KINDS) if (!(k in GATE_DEFAULTS)) throw new Error(`GATE_DEFAULTS missing ${k}`);
for (const k of GATE_KINDS) {
  const never = NEVER_AUTOPROCEED_GATES.includes(k);
  if (GATE_DEFAULTS[k].neverAutoProceed !== never) throw new Error(`GATE_DEFAULTS.${k}.neverAutoProceed drift`);
  if (GATE_DEFAULTS[k].waitDefault !== WAIT_DEFAULT_GATES.includes(k)) throw new Error(`GATE_DEFAULTS.${k}.waitDefault drift`);
}

// ---------------------------------------------------------------------------- REQ-SPEC-1 override rules

/**
 * A per-kind override in `Project.approvalOverrides` (REQ-SPEC-1): `null` = remove the deadline (wait);
 * a positive number of ms = lengthen (or, for a wait-default kind, add) the deadline. Validation of *which*
 * overrides are legal per kind is `approvalOverridesSchema` — this is the raw value shape only.
 */
export const approvalOverrideValueSchema = z.union([z.null(), z.number().int().positive()]);

/**
 * `Project.approvalOverrides` (REQ-SPEC-1). A partial map of gate kind → override. The schema **rejects** any
 * illegal override so a bad value never reaches a run:
 *   • spend/refusal kinds (`confirm_cost`, `spend_overrun`, `resume_partial`, `refusal`) may never be overridden;
 *   • a numeric override may never SHORTEN a defaulted deadline below its default;
 *   • adding a deadline (to a wait-default kind whose default is `null`) requires ≥ 2 h.
 * `null` (remove → wait) is always legal for a non-spend/refusal kind.
 */
export const approvalOverridesSchema = z
  .record(gateKindSchema, approvalOverrideValueSchema)
  .superRefine((overrides, ctx) => {
    for (const [kind, value] of Object.entries(overrides) as [GateKind, number | null][]) {
      const def = GATE_DEFAULTS[kind];
      if (def.neverAutoProceed) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [kind], message: `override on spend/refusal kind '${kind}' is not allowed (REQ-SPEC-1)` });
        continue;
      }
      if (value === null) continue; // remove → wait: always legal for a non-spend/refusal kind
      if (def.deadlineMs === null) {
        // adding a deadline to a wait-default kind: only the three add-eligible kinds, ≥ 2 h.
        if (!def.waitDefault) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [kind], message: `cannot add a deadline to '${kind}' (not a wait-default kind; REQ-SPEC-1)` });
        } else if (value < MIN_ADDED_DEADLINE_MS) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [kind], message: `added deadline for '${kind}' must be ≥ 2 h (REQ-SPEC-1)` });
        }
        continue;
      }
      // lengthen only: an override may never shorten a defaulted deadline below its default.
      if (value < def.deadlineMs) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [kind], message: `override for '${kind}' may not shorten below the default deadline (REQ-SPEC-1)` });
      }
    }
  });
export type ApprovalOverrides = z.infer<typeof approvalOverridesSchema>;

// ---------------------------------------------------------------------------- the Decision row (§6.4 item 6)

/** The four non-human resolution mechanisms + `user`; each writes a `Decision` naming itself (REQ-SPEC-1). */
export const GATE_RESOLUTION_BY = ["user", "timeout", "policy", "trial"] as const;
export type GateResolutionBy = (typeof GATE_RESOLUTION_BY)[number];
export const gateResolutionBySchema = z.enum(GATE_RESOLUTION_BY);

/** The action a decision records. Human actions plus the non-human expiry/skip actions. */
export const DECISION_ACTIONS = [
  "approve", //              the agent's recommendation, one click
  "approve_autonomous", //   Approve and run autonomously (turns off later named gates in this run)
  "edit", //                 approved with structured edits (write-back overlay)
  "keep_planning", //        Edit guidance / Keep planning (queues guidance; re-runs the plan step once)
  "stop", //                 Stop
  "proceed_conservative", // expiry: the skill's conservative path
  "proceed_as_proposed", //  expiry / policy: proceed with the agent's proposal
  "cancel", //               expiry: cancel (spend/refusal)
  "accept_partial", //       expiry: accept the partial (resume_partial)
  "skipped", //              policy: Run to completion / autonomous skipped this named gate (REQ-DATA-36)
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];
export const decisionActionSchema = z.enum(DECISION_ACTIONS);

/**
 * A `Decision` (§6.4 item 6; REQ-DATA-35 amended). Every resolution path — human or one of the four non-human
 * mechanisms — writes exactly one Decision naming its mechanism (`by`). `presence:true` marks the fifth
 * `by:'timeout'` path (the presence-timer auto-proceed for a present user, §6.4 item 2). `overlayVersionIds`
 * are the write-back artifact versions the structured edits serialized into (REQ-SPEC-9).
 */
export const decisionSchema = z.object({
  gateId: idSchema,
  by: gateResolutionBySchema,
  action: decisionActionSchema,
  /** true iff `by:'timeout'` fired against the shortened presence deadline for a present user (§6.4 item 2). */
  presence: z.boolean().optional(),
  /** the guidance text captured with the decision (Edit guidance / a gate note). */
  guidance: z.string().optional(),
  /** "…and remember this for this project" → a standing (project-scope) guidance rule (REQ-GATE-10). */
  standingRule: z.boolean().optional(),
  /** number of structured edits captured (shown as "approved by you at 14:02 with 3 changes"). */
  changes: z.number().int().nonnegative().optional(),
  /** write-back overlay versions the structured edits serialized into (REQ-SPEC-9). */
  overlayVersionIds: z.array(idSchema).optional(),
  at: isoSchema,
});
export type Decision = z.infer<typeof decisionSchema>;

/** True when `onExpiry` auto-proceeds the run (as opposed to cancel / accept-partial / wait). */
export function isAutoProceed(onExpiry: GateOnExpiry): boolean {
  return onExpiry === "proceed_conservative" || onExpiry === "proceed_as_proposed";
}
