// @rhema/egress-proxy — the run cap accountant (REQ-SPEC-11; §12.7, §12.4).
//
// The proxy enforces the cap: when a run's Σ metered cost ≥ its cap, the NEXT request is rejected with 402
// (the engine sees `budget`, the orchestrator opens `resume_partial`). The request that crosses the cap is
// served and metered — the residual overrun bound is exactly one in-flight request (§12.4). The accountant
// sums PRECISE platform credits (never the per-row rounded `credits`), so the cap does not drift from
// double-rounding. The live service seeds this from Σ `list_cost_usd` over the run's committed proxy rows.

/** Accumulates a run's metered platform credits and answers "how much has this run spent?". */
export interface CapAccountant {
  /** Precise platform credits metered for the run so far (§14.1: list × 1.4 ÷ $0.01). */
  spentCredits(runId: string): Promise<number> | number;
  /** Add one served response's precise platform credits to the run's running total. */
  record(runId: string, platformCredits: number): Promise<void> | void;
}

/**
 * In-memory accountant for a single proxy process's view of a run (the proxy is the run's one meter of
 * record for its lifetime). Deterministic; used in tests and as the default when no DB-backed Σ is wired.
 */
export class InMemoryCapAccountant implements CapAccountant {
  private readonly byRun = new Map<string, number>();

  constructor(seed?: Readonly<Record<string, number>>) {
    if (seed) for (const [runId, credits] of Object.entries(seed)) this.byRun.set(runId, credits);
  }

  spentCredits(runId: string): number {
    return this.byRun.get(runId) ?? 0;
  }

  record(runId: string, platformCredits: number): void {
    this.byRun.set(runId, (this.byRun.get(runId) ?? 0) + platformCredits);
  }
}

/**
 * The cap decision for a request, taken BEFORE forwarding (§12.4): a run already at or over its cap is
 * refused; otherwise the request proceeds and may itself cross the cap (served, then the next is refused).
 */
export function isOverCap(spentCredits: number, capCredits: number): boolean {
  return spentCredits >= capCredits;
}
