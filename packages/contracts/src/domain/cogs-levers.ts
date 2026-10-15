// @rhema/contracts — ECON.2's named COGS levers (REQ-SPEC-32(c); ticket 83; ADR-087),
// plus R5ECON.2's is_test-scoped routing arm (REQ-ECON-1/2/3).
//
// Each lever is a server-side on/off flag resolved ONCE at run creation and frozen onto the run —
// `runs.inputs.cogsLevers` feeds the consumers (runspec → PhaseRequest → engine options; the
// worker's provisioning webTools policy) and `input_snapshot.cogsLevers` is the REQ-BILL-6
// measurement record the on/off comparison reads. Resolution rule:
//   · the deploy's `COGS_LEVERS` env JSON supplies the server default (unset ⇒ all off — the
//     pre-ECON.2 pipeline, byte-for-byte);
//   · the deploy's `COGS_LEVERS_TEST` env JSON (R5ECON.2) overlays that default on
//     `workspaces.is_test` tenants only — the is_test-scoped arm defaults (Q-ECON.e's ratified
//     "server default + explicit opt-outs" posture; a UI-launched test leg gets the arm without
//     carrying it);
//   · on `workspaces.is_test` tenants a client-supplied `inputs.cogsLevers` may override per key
//     (the measurement ON/OFF arms — same gating precedent as `inputs.force_unverified`);
//   · on every non-test tenant a client value is discarded and the server default freezes —
//     and `testCheapRoute` resolves FALSE regardless of either env (it is an is_test-scoped
//     arm, never a production route).
// Every consumer treats an absent or malformed value as all-off — a pre-ECON.2 run is
// indistinguishable from today's pipeline.

/** The named levers (ADR-087 § the five levers, + R5ECON.2's sixth). */
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
  /**
   * R5ECON.2 (REQ-ECON-1/2/3) — the intra-tier cheap-route arm. ON ⇒ every phase class's
   * main context resolves `claude-haiku-4-5` inside the tier's own allowlist (the ~3× cut on
   * the dominant cache-read class). is_test-SCOPED: the resolved value is forced off on any
   * non-test workspace even when an env default sets it — production routing is untouched and
   * `runs.model_tier` stays the frozen user-facing tier (`usage_records.model` records the
   * SERVED model; REQ-ECON-4/5).
   */
  readonly testCheapRoute: boolean;
}

/** Every lever key — the allowlist `sanitizeCogsLevers` keeps (unknown keys drop silently). */
export const COGS_LEVER_KEYS = [
  "l1PerPhaseWindow",
  "l2FanoutShape",
  "l3PhaseRouting",
  "l4CacheTtl5m",
  "l5ResearchEnvelope",
  "testCheapRoute",
] as const;
export type CogsLeverKey = (typeof COGS_LEVER_KEYS)[number];

/** The shipped default — all off. "Levers that pass ship ON by default" flips a key here (ADR-087).
 *  `testCheapRoute` ships OFF too: the ratified posture arms it via `COGS_LEVERS_TEST` on is_test
 *  tenants only (Q-ECON.e) — never a fleet-wide default. */
export const DEFAULT_COGS_LEVERS: CogsLevers = {
  l1PerPhaseWindow: false,
  l2FanoutShape: false,
  l3PhaseRouting: false,
  l4CacheTtl5m: false,
  l5ResearchEnvelope: false,
  testCheapRoute: false,
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
 *
 * R5ECON.2 (REQ-ECON-1/10; ratified Q-ECON.e): `testDefaults` is the deploy's `COGS_LEVERS_TEST`
 * overlay — consulted ONLY on `is_test` workspaces, layered over `defaults` (unset keys inherit
 * the main env's arms). Precedence: client arm (is_test) → COGS_LEVERS_TEST (is_test) →
 * COGS_LEVERS → DEFAULT. On a non-test workspace `testCheapRoute` resolves FALSE no matter what
 * either env carries — the arm is is_test-scoped by construction, so a mis-set deploy env or a
 * crafted client value can never cheap-route a production run.
 */
export function resolveCogsLevers(args: {
  readonly client: unknown;
  readonly isTest: boolean;
  readonly defaults?: CogsLevers;
  /** `COGS_LEVERS_TEST` (R5ECON.2) — the is_test-scoped default overlay; never read off-test. */
  readonly testDefaults?: Partial<CogsLevers>;
}): CogsLevers {
  const defaults = args.defaults ?? DEFAULT_COGS_LEVERS;
  if (!args.isTest) return { ...defaults, testCheapRoute: false };
  const base = args.testDefaults ? sanitizeCogsLevers(args.testDefaults, defaults) : defaults;
  return sanitizeCogsLevers(args.client, base);
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

/**
 * R5ECON.2 — parse the deploy's `COGS_LEVERS_TEST` env into the is_test-scoped OVERLAY (the same
 * JSON object grammar as `COGS_LEVERS`). Unlike `parseCogsLeversEnv` this keeps ONLY the keys the
 * env named: the overlay must not silently re-assert OFF over the main `COGS_LEVERS` arms — a
 * `{"testCheapRoute":true}` deploy layers cheap routing ON without disturbing the adopted set.
 * Malformed/empty ⇒ `undefined` (no overlay). Unknown keys and non-boolean values drop silently,
 * same rule as `sanitizeCogsLevers`.
 */
export function parseCogsLeversTestEnv(raw: string | undefined): Partial<CogsLevers> | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const rec = parsed as Record<string, unknown>;
    const out: Record<CogsLeverKey, boolean> = {} as Record<CogsLeverKey, boolean>;
    let kept = 0;
    for (const key of COGS_LEVER_KEYS) {
      if (typeof rec[key] === "boolean") {
        out[key] = rec[key] as boolean;
        kept += 1;
      }
    }
    return kept > 0 ? (out as Partial<CogsLevers>) : undefined;
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
