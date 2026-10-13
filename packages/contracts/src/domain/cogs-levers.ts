// @rhema/contracts — ECON.2's named COGS levers (REQ-SPEC-32(c); ticket 83; ADR-087).
//
// Each lever is a server-side on/off flag resolved ONCE at run creation and frozen onto the run —
// `runs.inputs.cogsLevers` feeds the consumers (runspec → PhaseRequest → engine options; the
// worker's provisioning webTools policy) and `input_snapshot.cogsLevers` is the REQ-BILL-6
// measurement record the on/off comparison reads. Resolution rule:
//   · the deploy's `COGS_LEVERS` env JSON supplies the server default (unset ⇒ all off — the
//     pre-ECON.2 pipeline, byte-for-byte);
//   · on `workspaces.is_test` tenants a client-supplied `inputs.cogsLevers` may override per key
//     (the measurement ON/OFF arms — same gating precedent as `inputs.force_unverified`);
//   · on every non-test tenant a client value is discarded and the server default freezes.
// Every consumer treats an absent or malformed value as all-off — a pre-ECON.2 run is
// indistinguishable from today's pipeline.

/** The five named levers (ADR-087 § the five levers). */
export interface CogsLevers {
  /** L1 — per-phase `autoCompactWindow` table in place of one run-wide 80 K. */
  readonly l1PerPhaseWindow: boolean;
  /** L2 — verification fan-out shape (batch size × concurrency) for `researcher` subagents. */
  readonly l2FanoutShape: boolean;
  /** L3 — per-phase model routing by `phaseClass` per §12.3, in place of the flat tier main model. */
  readonly l3PhaseRouting: boolean;
  /** L4 — prompt-cache TTL choice: on ⇒ the CLI's ≈5-min default; off ⇒ the §12.2 1-h TTL. */
  readonly l4CacheTtl5m: boolean;
  /** L5 — tuned research envelope strictly above RES.1's floor (headroom + per-page cap). */
  readonly l5ResearchEnvelope: boolean;
}

/** Every lever key — the allowlist `sanitizeCogsLevers` keeps (unknown keys drop silently). */
export const COGS_LEVER_KEYS = [
  "l1PerPhaseWindow",
  "l2FanoutShape",
  "l3PhaseRouting",
  "l4CacheTtl5m",
  "l5ResearchEnvelope",
] as const;
export type CogsLeverKey = (typeof COGS_LEVER_KEYS)[number];

/** The shipped default — all off. "Levers that pass ship ON by default" flips a key here (ADR-087). */
export const DEFAULT_COGS_LEVERS: CogsLevers = {
  l1PerPhaseWindow: false,
  l2FanoutShape: false,
  l3PhaseRouting: false,
  l4CacheTtl5m: false,
  l5ResearchEnvelope: false,
};

/**
 * Coerce an arbitrary stored value into a full `CogsLevers`: unknown keys and non-boolean values
 * drop, missing keys fill from `base` (default `DEFAULT_COGS_LEVERS`). Total — never throws — so a
 * pre-ECON.2 run row or a hand-edited input still resolves.
 */
export function sanitizeCogsLevers(raw: unknown, base: CogsLevers = DEFAULT_COGS_LEVERS): CogsLevers {
  const out: Record<CogsLeverKey, boolean> = { ...base };
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    for (const key of COGS_LEVER_KEYS) {
      if (typeof rec[key] === "boolean") out[key] = rec[key] as boolean;
    }
  }
  return out as CogsLevers;
}

/**
 * Resolve the lever set frozen at run creation. On a test workspace the client's
 * `inputs.cogsLevers` keys override the server default (the measurement arms); anywhere else the
 * client value is ignored entirely — a production run's levers are server-authored only.
 */
export function resolveCogsLevers(args: {
  readonly client: unknown;
  readonly isTest: boolean;
  readonly defaults?: CogsLevers;
}): CogsLevers {
  const defaults = args.defaults ?? DEFAULT_COGS_LEVERS;
  return args.isTest ? sanitizeCogsLevers(args.client, defaults) : { ...defaults };
}

/**
 * Parse the deploy's `COGS_LEVERS` env (a JSON object of lever keys → booleans). Malformed JSON or
 * an empty value yields `undefined` — the caller falls back to `DEFAULT_COGS_LEVERS`, never to a
 * partial env that could silently disable a lever.
 */
export function parseCogsLeversEnv(raw: string | undefined): CogsLevers | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return sanitizeCogsLevers(parsed);
  } catch {
    return undefined;
  }
}

// ---- the lever-tuned constants (ADR-087 pre-registered arms; the measurement picks, these stay
//      the candidates until a measured adopt/reject amends them) ---------------------------------

/** The baseline research fan-out (PRB.24): ≤5 items per `researcher` batch, ≤5 concurrent. */
export const COGS_FANOUT_BASELINE = { batchSize: 5, maxConcurrent: 5 } as const;
/**
 * L2's ON arm (ADR-087): fewer, larger batches — ≤8 items at ≤3 concurrent — so the ~18 K-token
 * subagent seed is repaid fewer times in parallel, at the cost of deeper in-session growth.
 */
export const COGS_FANOUT_TUNED = { batchSize: 8, maxConcurrent: 3 } as const;

/**
 * L1's ON arm (ADR-087): the per-`phaseClass` `autoCompactWindow` table, keyed by the manifest's
 * `PhaseClass` union ("research"|"judge"|"generate"|"package" — duplicated here as strings because
 * @rhema/protocols imports contracts, never the reverse). `research` holds 80 K — the setting
 * applies session-wide INCLUDING researcher subagent sessions, and one bounded batch's working set
 * was measured ≈71 K (16 K envelope + 5×8 K pages + ~15 K notes); tightening research below the
 * subagent working set would thrash the L2 contract. Judge phases run tighter (smaller working
 * sets — intake/craft/argument read artifacts, not fetched pages), synthesis runs wider (a
 * letter's single-context write should not compact mid-write), package between.
 */
export const COGS_PHASE_COMPACT_WINDOWS: Readonly<Record<string, number>> = {
  research: 80_000,
  judge: 48_000,
  generate: 120_000,
  package: 64_000,
} as const;

/** The flat run-wide bound the OFF arm keeps (PRB.24). */
export const COGS_COMPACT_WINDOW_BASELINE = 80_000 as const;

/** L5's ON arm (ADR-087): the share of the above-floor headroom the tuned envelope keeps. */
export const COGS_L5_HEADROOM_SHARE = 0.5 as const;
/** L5's ON arm: the per-page fetch context cap (was FETCH_MAX_CONTENT_TOKENS = 8 000). */
export const COGS_L5_FETCH_MAX_CONTENT_TOKENS = 4_000 as const;
