// @rhema/egress-proxy — the fetch log of record (REQ-DATA-16; §12.6 attestation, §12.7).
//
// Every request the proxy handles produces a `fetch_log` row tagged with run_id / attempt / agent_id — the
// attribution the per-run credential carries. NEVER a request or response BODY (only URLs, status, decision):
// the log is a trust-chip input, not a content store. It is the source for source cards and for cited ⇒
// fetched (P0.09 validates against it). Kinds: `inference` for the /v1/messages call itself; `fetch`/`search`
// for the server-tool invocations the proxy inspects for the outbound-channel limits.

/** A `fetch_log` row (mirrors packages/db enforcement.ts, incl. the 0006 `attempt` + 0056 `phase_class` columns). */
export interface FetchLogRow {
  readonly runId: string;
  readonly ts: string;
  readonly agentLabel: string;
  readonly attempt: number;
  readonly kind: "inference" | "search" | "fetch";
  readonly query: string | null;
  readonly url: string | null;
  readonly normalizedUrl: string | null;
  readonly status: number | null;
  readonly bytes: number | null;
  readonly decision: "allow" | "deny";
  readonly denyReason: string | null;
  /** CITE.1 — the harness-stamped `x-rhema-phase-class` (`research`/`preflight`/`backfill`, else NULL):
   *  the column that lets the delivery completeness record name which retrieved urls the backfill
   *  mechanism produced (and lets ECON.2 cost it). */
  readonly phaseClass: string | null;
}

/** Lowercase scheme+host, drop fragment; keep path + query. `null` for a non-URL. */
export function normalizeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    u.protocol = u.protocol.toLowerCase();
    return u.toString();
  } catch {
    return raw.trim() || null;
  }
}

export interface FetchLogBase {
  readonly runId: string;
  readonly attempt: number;
  readonly agentLabel: string;
  readonly ts?: string;
  /** CITE.1 — the request's harness-stamped phase class (`x-rhema-phase-class`), folded onto the row. */
  readonly phaseClass?: string | null;
}

/** Build the per-request `inference` row: the proxied endpoint URL, its status, and the allow/deny decision. */
export function buildRequestFetchLogRow(
  base: FetchLogBase,
  input: {
    url: string;
    status: number | null;
    bytes?: number | null;
    decision: "allow" | "deny";
    denyReason?: string;
  },
): FetchLogRow {
  return {
    runId: base.runId,
    ts: base.ts ?? new Date().toISOString(),
    agentLabel: base.agentLabel,
    attempt: base.attempt,
    kind: "inference",
    query: null,
    url: input.url,
    normalizedUrl: normalizeUrl(input.url),
    status: input.status,
    bytes: input.bytes ?? null,
    decision: input.decision,
    denyReason: input.denyReason ?? null,
    phaseClass: base.phaseClass ?? null,
  };
}

/** Build a `search`/`fetch` row for one server-tool invocation the proxy inspected (feeds cited ⇒ fetched). */
export function buildServerToolFetchLogRow(
  base: FetchLogBase,
  input: {
    kind: "search" | "fetch";
    query?: string;
    url?: string;
    /** PRB.19 — the byte receipt when the response's server-tool result carried the fetched content inline
     *  (web_fetch `content.source.data` / web_search `encrypted_content`). Status stays null: Anthropic's
     *  server-tool results carry no HTTP status, only the payload or an `error_code`. */
    bytes?: number;
    decision: "allow" | "deny";
    denyReason?: string;
  },
): FetchLogRow {
  return {
    runId: base.runId,
    ts: base.ts ?? new Date().toISOString(),
    agentLabel: base.agentLabel,
    attempt: base.attempt,
    kind: input.kind,
    query: input.query ?? null,
    url: input.url ?? null,
    normalizedUrl: input.url ? normalizeUrl(input.url) : null,
    status: null,
    bytes: input.bytes ?? null,
    decision: input.decision,
    denyReason: input.denyReason ?? null,
    phaseClass: base.phaseClass ?? null,
  };
}
