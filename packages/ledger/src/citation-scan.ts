// CITE.1 (REQ-VIS-9; BL-15; ticket item 1) — the $0 READ-ONLY baseline scan. For every completed
// research-bearing run it re-reads the PRE-STRIP committed claim-ledger sidecar (the produced
// `…claim-ledger.json` artifact version — the delivered `claims`/`claim_sources` rows are post-strip
// and cannot answer this) and scores it against the run's `fetch_log` TWO ways:
//
//   • the LEGACY byte-join the pre-CITE.1 code ran — cited `normalizeUrl(url)` vs the stored
//     `fetch_log.normalized_url` byte string (the parity defect: the proxy keeps the query, the guard
//     drops it);
//   • the CANONICAL join CITE.1 lands — `@rhema/contracts` `normalizeUrl` re-applied on read to BOTH
//     sides (ADR-083), over fetch ∪ url-bearing search rows (the guard's retrieved set).
//
// Every missed cited url is then classified:
//   (i)   `normalizationOnly` — a legacy-join miss the canonical join COVERS (fetched, in a different
//         normalized form);
//   (ii)  `searchOnly` — a canonical miss the run's search rows still cover (a url-bearing `search`
//         row for new data, or the cited url appearing verbatim inside a `search` row's `query` —
//         the only search evidence pre-CITE.1 rows carry);
//   (iii) `trulyUnretrieved` — the model cited something that never touched the proxy at all.
//
// Cross-tenant by design — run against the SEC.1 system pool; flagged test tenants are counted
// separately, never folded into the aggregate. Output is ids + counts + url identifiers only
// (invariant 10). NOTHING is written.

import { normalizeUrl } from "@rhema/contracts";
import type { SqlClient } from "@rhema/orchestrator";

/**
 * Minimal content-addressed read — the same seam the live runner binds to the GCS store. Objects are
 * tenant-prefixed (`tenants/<ws>/objects/<sha256>`), so `get` carries the row's workspace — the scan is
 * cross-tenant BY DESIGN (SEC.1 system pool); each read resolves under the run's own tenant prefix.
 */
export interface ScanContentStore {
  get(sha256: string, workspaceId: string): Promise<Uint8Array | null>;
}

export interface CitationMissClassRow {
  readonly runId: string;
  readonly workspaceId: string;
  readonly workflow: string;
  readonly endedAt: string | null;
  readonly testTenant: boolean;
  /** distinct canonical cited urls in the pre-strip ledger (the completeness denominator). */
  readonly citedUrls: number;
  /** cited urls covered under the LEGACY byte-join (what the pre-fix code counted). */
  readonly legacyCovered: number;
  /** cited urls covered under the canonical join (what CITE.1 counts). */
  readonly canonicalCovered: number;
  /** misses under the legacy join — the strip count the pre-fix delivery actually applied. */
  readonly legacyMisses: number;
  readonly normalizationOnly: number;
  readonly searchOnly: number;
  readonly trulyUnretrieved: number;
  /** the missed urls by class (identifiers only — invariant 10). */
  readonly missedUrls: {
    readonly normalizationOnly: readonly string[];
    readonly searchOnly: readonly string[];
    readonly trulyUnretrieved: readonly string[];
  };
}

export interface CitationScanResult {
  readonly scanned: number;
  /** runs whose committed claim-ledger artifact was found and scored. */
  readonly scored: number;
  /** completed runs whose claim-ledger sidecar could not be located/read (reported honestly). */
  readonly unreadable: number;
  readonly runs: readonly CitationMissClassRow[];
  /** the fleet aggregate, flagged-test-tenant runs EXCLUDED. */
  readonly aggregate: {
    readonly citedUrls: number;
    readonly legacyCovered: number;
    readonly canonicalCovered: number;
    readonly legacyCompleteness: number | null;
    readonly canonicalCompleteness: number | null;
    readonly normalizationOnly: number;
    readonly searchOnly: number;
    readonly trulyUnretrieved: number;
    /** `search` rows scanned that carried no `url`/`query` evidence (pre-CITE.1 shape). */
    readonly searchRowsWithoutUrl: number;
  };
  readonly at: string;
}

interface FetchLogRow {
  url: string | null;
  normalized_url: string | null;
  kind: string;
  query: string | null;
}

interface LedgerClaim {
  url?: string | null;
  sources?: { url?: string | null }[] | null;
}

/** The raw stored `normalized_url` byte set — the LEGACY join key the pre-fix code compared against. */
function legacyRetrievedSet(rows: readonly FetchLogRow[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    // the pre-fix guard read the stored normalized_url as-is; a null falls back to the raw url.
    const v = r.normalized_url ?? r.url;
    if (v) set.add(v);
  }
  return set;
}

/** The CANONICAL retrieved set (ADR-083): every url-bearing row re-normalized on read. */
function canonicalRetrievedSet(rows: readonly FetchLogRow[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    const raw = r.normalized_url ?? r.url;
    if (raw) set.add(normalizeUrl(raw));
  }
  return set;
}

/**
 * Whether a `search` row covers a cited url: a url-bearing row's canonical form matches (new data),
 * or the cited url appears verbatim in the row's `query` (the only evidence the pre-CITE.1 rows
 * carry — a search result the model copied the url from without fetching it).
 */
function searchCovers(row: FetchLogRow, citedUrl: string, citedCanonical: string): boolean {
  if (row.kind !== "search") return false;
  const raw = row.normalized_url ?? row.url;
  if (raw && normalizeUrl(raw) === citedCanonical) return true;
  return typeof row.query === "string" && row.query.length > 0 && row.query.includes(citedUrl);
}

/**
 * Scan completed research-bearing runs (a delivered Review/fact_check). `store` reads the committed
 * claim-ledger sidecar's bytes; `exec` is the SYSTEM pool (cross-tenant; flagged test tenants are
 * classified but excluded from the aggregate).
 */
export async function scanCitationCompleteness(
  exec: SqlClient,
  store: ScanContentStore,
  opts?: { readonly limit?: number; readonly workflow?: readonly string[] },
): Promise<CitationScanResult> {
  const workflows = opts?.workflow ?? ["review", "fact_check"];
  const scanned = Number(
    (
      (
        await exec.query(
          `select count(*)::int as c from runs
             where state = 'completed' and workflow = any($1::text[])`,
          [workflows],
        )
      ).rows[0] as { c: number }
    ).c,
  );

  // The committed pre-strip claim-ledger artifact per run: a produced version whose mirror path names
  // the sidecar (`agents/<seat>/.rhema/01-claim-ledger.json`, `03-claim-ledger.json` on drafts). Latest
  // produced version wins — a re-run phase's newest ledger is the one the delivery stripped against.
  const ledgerRows = (
    await exec.query(
      `select distinct on (r.id)
              r.id as run_id, r.workspace_id, r.workflow, r.ended_at,
              coalesce(w.is_test, false) as test_tenant,
              av.content_sha256, a.mirror_path
         from runs r
         join workspaces w on w.id = r.workspace_id
         join steps s on s.run_id = r.id and s.state = 'done'
         join artifact_versions av on av.id = any(s.produced_version_ids)
         join artifacts a on a.id = av.artifact_id
        where r.state = 'completed' and r.workflow = any($1::text[])
          -- the JSON sidecar, never its human-readable .md twin (a higher version ordinal on the
          -- twin would otherwise win the distinct-on and parse-fail into unreadable).
          and a.mirror_path ilike '%claim-ledger%.json'
        order by r.id, av.ordinal desc
        ${opts?.limit ? `limit ${Math.floor(opts.limit)}` : ""}`,
      [workflows],
    )
  ).rows as {
    run_id: string;
    workspace_id: string;
    workflow: string;
    ended_at: string | null;
    test_tenant: boolean;
    content_sha256: string;
    mirror_path: string;
  }[];

  const runs: CitationMissClassRow[] = [];
  let unreadable = 0;
  let searchRowsWithoutUrl = 0;

  for (const row of ledgerRows) {
    const bytes = await store.get(row.content_sha256, row.workspace_id).catch(() => null);
    if (!bytes) {
      unreadable += 1;
      continue;
    }
    let ledger: { claims?: LedgerClaim[] };
    try {
      ledger = JSON.parse(Buffer.from(bytes).toString("utf8")) as { claims?: LedgerClaim[] };
    } catch {
      unreadable += 1;
      continue;
    }

    const cited = new Map<string, string>(); // canonical → raw cited url
    for (const c of ledger.claims ?? []) {
      for (const u of [c.url, ...(c.sources ?? []).map((s) => s.url)]) {
        if (u) cited.set(normalizeUrl(u), u);
      }
    }

    const logRows = (
      await exec.query(
        `select url, normalized_url, kind, query from fetch_log
           where run_id = $1 and kind in ('fetch','search')
             and decision in ('allow','success','ok')`,
        [row.run_id],
      )
    ).rows as FetchLogRow[];

    searchRowsWithoutUrl += logRows.filter(
      (r) => r.kind === "search" && !r.url && !r.normalized_url,
    ).length;

    const legacySet = legacyRetrievedSet(logRows);
    const canonicalSet = canonicalRetrievedSet(logRows);

    let legacyCovered = 0;
    let canonicalCovered = 0;
    const normalizationOnly: string[] = [];
    const searchOnly: string[] = [];
    const trulyUnretrieved: string[] = [];

    for (const [canonical, raw] of cited) {
      // the LEGACY join: the cited url normalized by the guard, looked up byte-for-byte in the
      // stored `normalized_url` strings — the pre-CITE.1 parity defect (proxy kept the query).
      const legacyHit = legacySet.has(normalizeUrl(raw));
      const canonicalHit = canonicalSet.has(canonical);
      if (legacyHit) legacyCovered += 1;
      if (canonicalHit) {
        canonicalCovered += 1;
        if (!legacyHit) normalizationOnly.push(raw);
        continue;
      }
      // a canonical miss: search-row evidence or truly unretrieved.
      if (logRows.some((r) => searchCovers(r, raw, canonical))) searchOnly.push(raw);
      else trulyUnretrieved.push(raw);
    }

    runs.push({
      runId: row.run_id,
      workspaceId: row.workspace_id,
      workflow: row.workflow,
      endedAt: row.ended_at,
      testTenant: row.test_tenant,
      citedUrls: cited.size,
      legacyCovered,
      canonicalCovered,
      legacyMisses: cited.size - legacyCovered,
      normalizationOnly: normalizationOnly.length,
      searchOnly: searchOnly.length,
      trulyUnretrieved: trulyUnretrieved.length,
      missedUrls: { normalizationOnly, searchOnly, trulyUnretrieved },
    });
  }

  const prodRuns = runs.filter((r) => !r.testTenant);
  const sum = (k: (r: CitationMissClassRow) => number) => prodRuns.reduce((a, r) => a + k(r), 0);
  const citedUrls = sum((r) => r.citedUrls);
  const legacyCovered = sum((r) => r.legacyCovered);
  const canonicalCovered = sum((r) => r.canonicalCovered);

  return {
    scanned,
    scored: runs.length,
    unreadable,
    runs,
    aggregate: {
      citedUrls,
      legacyCovered,
      canonicalCovered,
      legacyCompleteness: citedUrls > 0 ? legacyCovered / citedUrls : null,
      canonicalCompleteness: citedUrls > 0 ? canonicalCovered / citedUrls : null,
      normalizationOnly: sum((r) => r.normalizationOnly),
      searchOnly: sum((r) => r.searchOnly),
      trulyUnretrieved: sum((r) => r.trulyUnretrieved),
      searchRowsWithoutUrl,
    },
    at: new Date().toISOString(),
  };
}
