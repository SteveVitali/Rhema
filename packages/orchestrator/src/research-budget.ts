// RES.3 (REQ-ENG-3) — the research-budget consult the retry gate reads. Run `01M48VNKY6F263TCQRVBJ8JRQA`
// (RES.3 / D-RES.3-1) burned its entire claim-scaled bound because nothing consulted `usage_records`
// before a retry or stranded re-drive: the in-pod guided retry and two fresh pods each re-researched
// against the SAME run-level bound with fresh sessions until the proxy itself dropped the tools.
// The consult is the server-authoritative answer to "what remains of this run's research budget":
//   remaining = claimScaledBudget − Σ usage_records{source='proxy', phase_class ∉ {preflight, backfill}}
// summed across ALL attempts — a new attempt/pod/session never resets the envelope (the per-attempt
// isolation D-RES.3-1 specifies). It is a read-only fact source; the admission decision itself stays
// the proxy's (apps/egress-proxy's in-flight-aware tracker stays the meter of record).
//
// Counting parity with the proxy's ResearchUsageTracker:
//   - `source='proxy'` rows only — the meter of record (provider-executed tool traffic); `sdk_stream`
//     deltas and `sdk_estimate` rows never count (they did not execute web tools);
//   - `phase_class='preflight'` excluded — RES.1 probes bypass budget admission in the proxy and are
//     settled separately;
//   - `phase_class='backfill'` excluded — CITE.1's dedicated `backfillFetchBudget` is a different
//     allowance that must never consume the research bound (ADR-085);
//   - `phase_class is null` (unstamped rows) counts — the conservative default for traffic that
//     metered without a class stamp.

import type { OrchestratorDeps } from "./internal-api.js";
import type { WebToolPolicyData } from "./resolver.js";

/**
 * The proxy's fail-safe defaults when the credential context carries no authored policy — the SAME
 * values `apps/egress-proxy/src/url-policy.ts` applies (`DEFAULT_WEB_SEARCH_BUDGET`/`DEFAULT_WEB_FETCH_BUDGET`).
 * The graphs are separate (the proxy package is not an orchestrator dep), so parity is stated here and
 * covered by a test; if the proxy defaults ever move, so must these.
 */
export const RESEARCH_BUDGET_DEFAULT_SEARCHES = 24;
export const RESEARCH_BUDGET_DEFAULT_FETCHES = 48;

/** The server-authoritative view of what remains of the run's claim-scaled research bound. */
export interface ResearchBudgetConsult {
  /** proxy-metered searches/fetches consumed by the run across every attempt. */
  readonly searchesUsed: number;
  readonly fetchesUsed: number;
  /** the claim-scaled bound the run's web-tool policy authored (proxy defaults when unauthored). */
  readonly searchBudget: number;
  readonly fetchBudget: number;
  readonly searchesRemaining: number;
  readonly fetchesRemaining: number;
  /**
   * Exhaustion needs BOTH axes at zero: with either kind remaining the retry can still do honest
   * work (a search-only or fetch-only pass), so the gate never blocks while spend is possible.
   * When both are dead a retry can produce nothing a checkpoint cannot — the honest outcome is
   * `research_budget_exhausted` (checkpoint-commit when the checkpointed artifacts satisfy the
   * phase contract, else the terminal fail that can never re-enqueue into a dead budget).
   */
  readonly exhausted: boolean;
}

/**
 * Read the run's authored web-tools policy off its latest active proxy credential — the SAME row
 * `buildHarnessRunSpec` consults for the research-preflight roster. Null when no credential/policy
 * is bound (the consult then falls back to the proxy's fail-safe defaults).
 */
export async function readRunWebToolsPolicy(
  deps: Pick<OrchestratorDeps, "txRunner" | "systemTxRunner">,
  args: { readonly runId: string; readonly workspaceId: string },
): Promise<WebToolPolicyData | null> {
  const runner = deps.systemTxRunner ?? deps.txRunner;
  const row = (
    await runner.run(args.workspaceId, (tx) =>
      tx.query(
        `select context->'webTools' as wt from proxy_credentials
           where run_id = $1 and revoked_at is null order by attempt desc, created_at desc limit 1`,
        [args.runId],
      ),
    )
  ).rows[0] as { wt: WebToolPolicyData | null } | undefined;
  return row?.wt ?? null;
}

/**
 * The consult: sum the run's proxy-metered web-tool use (all attempts; `preflight`/`backfill`
 * excluded) and subtract it from the authored claim-scaled bound. `webTools` may be supplied by a
 * caller that already read the credential context (`buildHarnessRunSpec` reads it once for both the
 * preflight roster and this consult); absent, this reads it itself.
 */
export async function researchBudgetConsult(
  deps: Pick<OrchestratorDeps, "txRunner" | "systemTxRunner">,
  args: {
    readonly runId: string;
    readonly workspaceId: string;
    readonly webTools?: WebToolPolicyData | null;
  },
): Promise<ResearchBudgetConsult> {
  const webTools = args.webTools !== undefined ? args.webTools : await readRunWebToolsPolicy(deps, args);
  const searchBudget = webTools?.searchBudget ?? RESEARCH_BUDGET_DEFAULT_SEARCHES;
  const fetchBudget = webTools?.fetchBudget ?? RESEARCH_BUDGET_DEFAULT_FETCHES;
  const row = (
    await deps.txRunner.run(args.workspaceId, (tx) =>
      tx.query(
        `select coalesce(sum(searches),0)::int as searches, coalesce(sum(fetches),0)::int as fetches
           from usage_records
          where run_id = $1 and source = 'proxy'
            and coalesce(phase_class, '') not in ('preflight', 'backfill')`,
        [args.runId],
      ),
    )
  ).rows[0] as { searches: number; fetches: number } | undefined;
  const searchesUsed = row?.searches ?? 0;
  const fetchesUsed = row?.fetches ?? 0;
  const searchesRemaining = Math.max(0, searchBudget - searchesUsed);
  const fetchesRemaining = Math.max(0, fetchBudget - fetchesUsed);
  return {
    searchesUsed,
    fetchesUsed,
    searchBudget,
    fetchBudget,
    searchesRemaining,
    fetchesRemaining,
    exhausted: searchesRemaining <= 0 && fetchesRemaining <= 0,
  };
}
