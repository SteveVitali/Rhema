// RES.1 — the ≤$1 planted-error probe: launch a bounded `fact_check` run over the planted-error
// excerpt and evaluate the proxy's OWN evidence (usage_records / fetch_log / claims / claim_sources).
//
// The run IS the probe: every model request rides the real proxy path — `ensureServerWebTools`, the
// URL policy, the run budget, and the RES.1 research floor — so a pass proves `web_search` reaches the
// model end-to-end, the regression the 2026-09-30 Quick/Base Review (run 01M3SK62…) failed silently.
// A fact_check over the ≤300-word excerpt is the cheapest research-bearing run shape (inventory +
// verification on a handful of claims).
//
// Two halves:
//   • LIVE (`driveResearchProbe`) — needs the deployed api + a DB read seam; runs in Stage B, ≤$1.
//   • TWIN (`evaluateProbeEvidence` is pure) — the vitest twin feeds recorded rows, CI at $0.
//
// Evidence is ids/counts/urls only — never prompt or draft text (Manifest #10).

import { type SqlClient } from "@rhema/orchestrator";
import { LiveWorkflowLauncher, type LivePrincipal, type FetchLike } from "./live-launcher.js";

/** The planted claim the probe must see Contradicted (the essay's "1850" for the real 1800). */
export const PLANTED_CLAIM = {
  /** substring identifying the planted claim row. */
  marker: "Library of Congress",
  /** the planted (false) value the claim asserts. */
  wrongValue: "1850",
  /** the value a working web_search must find. */
  rightValue: "1800",
  /** the verdict a real verification pass must land on. */
  expectVerdict: "contradicted",
} as const;

/**
 * The probe fixture's sizing snapshot — the `wordCount`/`claimCount` the launch sheet would carry
 * from its claim pre-pass into `runs.input_snapshot` (what `authorWebToolPolicy` reads to scale the
 * research bound). `planted-error-excerpt.md` is fixed: 267 words, 9 checkable claims (the count the
 * first live run's claim extraction produced). An API-direct launch that omits it lands the claims=0
 * fallback bound (8 searches/16 fetches) — the starvation the first live probe hit.
 */
export const PROBE_INPUT_SNAPSHOT = { wordCount: 267, claimCount: 9 } as const;

// ---------------------------------------------------------------- evidence types ----

export interface UsageByModel {
  readonly model: string;
  readonly searches: number;
  readonly fetches: number;
  readonly credits: number;
}
export interface FetchRow {
  readonly kind: string;
  readonly decision: string;
  readonly url: string | null;
  readonly agentLabel: string | null;
}
export interface ClaimRow {
  readonly id: string;
  readonly ordinal: number;
  readonly text: string;
  readonly verdict: string;
  readonly tier: number | null;
}
export interface ClaimSourceRow {
  readonly claimId: string;
  readonly url: string;
  readonly stance: string;
}

/** Everything the evaluator needs — rows the proxy/delivery already wrote; the probe mints none. */
export interface ProbeEvidence {
  readonly runId: string;
  readonly state: string;
  readonly usageByModel: readonly UsageByModel[];
  readonly fetchLog: readonly FetchRow[];
  readonly claims: readonly ClaimRow[];
  readonly claimSources: readonly ClaimSourceRow[];
}

export interface ProbeOutcome {
  readonly ok: boolean;
  /** every failed assertion, human-readable — the evidence report quotes these verbatim. */
  readonly failures: readonly string[];
  /** the summary an evidence report prints: counts, the planted row's verdict, spend. */
  readonly detail: {
    readonly searchesByModel: Record<string, number>;
    readonly fetchesAllowed: number;
    readonly searchesAllowed: number;
    readonly plantedVerdict: string | null;
    readonly plantedSourcesFetched: number;
    readonly meteredCredits: number;
  };
}

// ---------------------------------------------------------------- collection ----

/** Read the run's proxy evidence rows (usage, fetch_log, claims, claim_sources) — system-pool seam. */
export async function collectProbeEvidence(sql: SqlClient, runId: string): Promise<ProbeEvidence> {
  const state = (
    await sql.query("select state from runs where id = $1", [runId])
  ).rows[0] as { state: string } | undefined;
  const usageByModel = (
    await sql.query(
      `select model, coalesce(sum(searches),0)::int as searches, coalesce(sum(fetches),0)::int as fetches,
              coalesce(sum(credits),0)::int as credits
         from usage_records where run_id = $1 group by model order by model`,
      [runId],
    )
  ).rows as UsageByModel[];
  const fetchLog = (
    await sql.query(
      `select kind, decision, url, agent_label as "agentLabel" from fetch_log where run_id = $1 order by ts`,
      [runId],
    )
  ).rows as FetchRow[];
  const claims = (
    await sql.query(
      `select c.id, c.ordinal, c.text, c.verdict, c.tier
         from claims c join correspondence_items ci on ci.id = c.correspondence_id
        where ci.run_id = $1 order by c.ordinal`,
      [runId],
    )
  ).rows as ClaimRow[];
  const claimSources = (
    await sql.query(
      `select cs.claim_id as "claimId", cs.url, cs.stance
         from claim_sources cs
         join claims c on c.id = cs.claim_id
         join correspondence_items ci on ci.id = c.correspondence_id
        where ci.run_id = $1 order by cs.ordinal`,
      [runId],
    )
  ).rows as ClaimSourceRow[];
  return { runId, state: state?.state ?? "missing", usageByModel, fetchLog, claims, claimSources };
}

// ---------------------------------------------------------------- evaluation ----

/**
 * The probe's pass rule (RES.1 AC): the run completed; every expected tier model shows ≥1 metered
 * search (the regression asserted: `web_search` reached the model); ≥1 fetch_log allow row exists for
 * a search AND a fetch (`cited⇒fetched` provenance); the planted claim is `contradicted`; and ≥1 of
 * its cited sources was actually fetched (the URL appears among the allow rows).
 */
export function evaluateProbeEvidence(
  ev: ProbeEvidence,
  opts: { readonly expectModels?: readonly string[] } = {},
): ProbeOutcome {
  const failures: string[] = [];
  const searchesByModel = Object.fromEntries(ev.usageByModel.map((u) => [u.model, u.searches]));
  const allowed = ev.fetchLog.filter((r) => r.decision === "allow");
  const searchesAllowed = allowed.filter((r) => r.kind === "search").length;
  const fetchesAllowed = allowed.filter((r) => r.kind === "fetch").length;

  if (ev.state !== "completed") failures.push(`run ended '${ev.state}', not completed`);
  for (const m of opts.expectModels ?? ev.usageByModel.map((u) => u.model)) {
    if ((searchesByModel[m] ?? 0) < 1) failures.push(`model ${m} ran zero searches`);
  }
  if (ev.usageByModel.length === 0) failures.push("no usage_records rows at all — nothing metered");
  if (searchesAllowed < 1) failures.push("fetch_log has no allowed search row");
  if (fetchesAllowed < 1) failures.push("fetch_log has no allowed fetch row");

  const planted = ev.claims.find(
    (c) => c.text.includes(PLANTED_CLAIM.marker) && c.text.includes(PLANTED_CLAIM.wrongValue),
  );
  const plantedVerdict = planted?.verdict ?? null;
  if (!planted) {
    failures.push(`no claim row names ${PLANTED_CLAIM.marker} ${PLANTED_CLAIM.wrongValue}`);
  } else if (planted.verdict !== PLANTED_CLAIM.expectVerdict) {
    failures.push(`planted claim verdict '${planted.verdict}', not '${PLANTED_CLAIM.expectVerdict}'`);
  }
  // cited ⇒ fetched: the contradiction's source must be a URL the proxy actually fetched.
  const fetchedUrls = new Set(
    allowed.filter((r) => r.kind === "fetch" && r.url != null).map((r) => r.url as string),
  );
  const plantedSourcesFetched = planted
    ? ev.claimSources.filter((s) => s.claimId === planted.id && fetchedUrls.has(s.url)).length
    : 0;
  if (planted && plantedVerdict === PLANTED_CLAIM.expectVerdict && plantedSourcesFetched < 1) {
    failures.push("planted claim contradicted but none of its sources were fetched (cited≠fetched)");
  }

  return {
    ok: failures.length === 0,
    failures,
    detail: {
      searchesByModel,
      fetchesAllowed,
      searchesAllowed,
      plantedVerdict,
      plantedSourcesFetched,
      meteredCredits: ev.usageByModel.reduce((n, u) => n + u.credits, 0),
    },
  };
}

// ---------------------------------------------------------------- the live leg ----

export interface DriveProbeOptions {
  readonly apiBaseUrl: string;
  readonly principal: LivePrincipal;
  /** the project holding the planted-error excerpt draft (the probe fixture, already ingested). */
  readonly projectId: string;
  /** pg-backed executor for terminal polling + evidence rows. */
  readonly sql: SqlClient;
  readonly timeoutMs?: number;
  /** folded into the launch idempotency key — a retried probe attempt must mint a NEW run. */
  readonly idempotencySeed?: string;
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/**
 * Launch the bounded fact_check on the excerpt project, poll to terminal, then evaluate the proxy's
 * evidence. Throws on launch/transport errors; the OUTCOME (ok/failures) is data, never an exception.
 */
export async function driveResearchProbe(opts: DriveProbeOptions): Promise<ProbeOutcome> {
  const launcher = new LiveWorkflowLauncher({
    apiBaseUrl: opts.apiBaseUrl,
    principal: opts.principal,
    sql: opts.sql,
    // the probe's own bound: a small cap so a misbehaving run dies at cap instead of the budget.
    modelTier: "base",
    ...(opts.idempotencySeed ? { idempotencySeed: opts.idempotencySeed } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  });
  const launched = await launcher.launch({
    projectId: opts.projectId,
    workflow: "fact_check",
    // the fixture's real sizing — the claim-scaled research bound (see PROBE_INPUT_SNAPSHOT).
    inputSnapshot: PROBE_INPUT_SNAPSHOT,
  });
  const evidence = await collectProbeEvidence(opts.sql, launched.runId);
  return evaluateProbeEvidence(evidence);
}
