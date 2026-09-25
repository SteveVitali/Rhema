// The DB-backed proxy `RunContextResolver` (D-P0.07-3; §12.7). The egress proxy resolves a per-run credential
// to a RunContext to meter/enforce; this ticket MINTS the credential + AUTHORS the allowlist (provision.ts)
// and provides the resolver that reads them back. The resolver reads only the NON-RLS proxy tables
// (proxy_credentials / proxy_allowlists), so the system proxy resolves any run's credential without a
// tenant-scoped read. The returned shape is structurally the egress-proxy `RunContext`; binding this resolver
// to the live proxy is the deploy's job (deferred — see DEFERRALS D-P0.07-1/3).

import { createHash } from "node:crypto";
import type { SqlClient } from "./tx.js";

export interface AllowedEndpointData {
  readonly host: string;
  readonly pathPrefix: string;
}
export interface ProxyUrlPolicyData {
  readonly blockedDomains: readonly string[];
  readonly allowedDomains?: readonly string[];
  /**
   * P1.21 (REQ-WF-8) — the `user_sources[]` domains of a Memo run: a fetch to one is a
   * `web_fetch_of_user_data` violation — denied at the proxy (and logged `user_source`), never advised.
   */
  readonly userSourceDomains?: readonly string[];
  /** the §6.7 `web_fetch_of_user_data: 'forbidden'` marker — set on every Memo-protocol run. */
  readonly fetchUserDataForbidden?: boolean;
  /** the known-domain set + novel-domain cap live in the persisted URL policy; the resolver lifts them out. */
  readonly knownDomains?: readonly string[];
  readonly novelDomainCap?: number;
}
/** The allowlist as persisted on proxy_allowlists (endpoints + models + URL policy). */
export interface RunAllowlistData {
  readonly endpoints: readonly AllowedEndpointData[];
  readonly models: readonly string[];
  readonly urlPolicy: ProxyUrlPolicyData;
}

/**
 * The run's server web-research policy (§12.6; P0.15i + PRB.22), mirrored structurally from the
 * egress-proxy `WebToolPolicy` (the proxy-local type is the authority; the security boundary keeps the
 * graphs separate). The budgets bound a run's TOTAL search/fetch invocations — `max_uses` bounds a single
 * API call only — and `fetchMaxContentTokens` truncates each fetched page before context ingress.
 */
export interface WebToolPolicyData {
  readonly search?: boolean;
  readonly fetch?: boolean;
  readonly searchMaxUses?: number;
  readonly fetchMaxUses?: number;
  readonly searchBudget?: number;
  readonly fetchBudget?: number;
  readonly fetchMaxContentTokens?: number;
}

/** The RunContext attribution denormalized onto the credential (everything but allowlist/urlPolicy). */
export interface RunContextData {
  readonly runId: string;
  readonly attempt: number;
  readonly agentId: string;
  readonly role: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly userId?: string;
  readonly projectId?: string;
  readonly personaId?: string;
  readonly agentInstanceId?: string;
  readonly provider: string;
  readonly modelTier: string;
  readonly rateTableVersion: number;
  readonly capCredits: number;
  /** The run's server web-research policy (PRB.22); absent ⇒ the proxy's bounded defaults apply. */
  readonly webTools?: WebToolPolicyData;
  /**
   * P1.21 — the text the proxy n-gram-diffs search queries against (§12.8d). For a Memo run the
   * orchestrator supplies the concatenated `user_sources[]` text here, so a search query quoting
   * internal figures is `suspicious_query`-denied — internal data can never ride a query out.
   */
  readonly draftText?: string;
}

/** The resolved context the proxy consumes — structurally the egress-proxy `RunContext`. */
export interface ResolvedRunContext extends RunContextData {
  readonly allowlist: { readonly endpoints: readonly AllowedEndpointData[]; readonly models: readonly string[] };
  readonly urlPolicy: {
    readonly blockedDomains: readonly string[];
    readonly allowedDomains?: readonly string[];
    /** P1.21 — the Memo run's `user_sources[]` domains (a fetch to one is denied `user_source`). */
    readonly userSourceDomains?: readonly string[];
    readonly fetchUserDataForbidden?: boolean;
  };
  readonly draftText?: string;
  readonly knownDomains?: readonly string[];
  readonly novelDomainCap?: number;
}

export interface RunContextResolver {
  resolve(credential: string): Promise<ResolvedRunContext | null>;
}

function defaultHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

interface CredJoinRow {
  context: RunContextData | string;
  endpoints: AllowedEndpointData[] | string;
  models: string[];
  url_policy: ProxyUrlPolicyData | string;
}

function parseJson<T>(v: T | string): T {
  return typeof v === "string" ? (JSON.parse(v) as T) : v;
}

/**
 * A `RunContextResolver` over the proxy tables. `resolve` hashes the credential, finds a live (not revoked,
 * not expired) credential row, joins its allowlist, and assembles the RunContext. Unknown/revoked/expired
 * credential → null (the proxy answers 403 `egress.denied`).
 */
export function createDbRunContextResolver(
  client: SqlClient,
  opts: { now?: () => Date; hash?: (secret: string) => string } = {},
): RunContextResolver {
  const now = opts.now ?? (() => new Date());
  const hash = opts.hash ?? defaultHash;
  return {
    async resolve(credential: string): Promise<ResolvedRunContext | null> {
      const h = hash(credential);
      const res = await client.query(
        `select c.context, a.endpoints, a.models, a.url_policy
           from proxy_credentials c
           join proxy_allowlists a on a.id = c.allowlist_id
          where c.credential_hash = $1
            and c.revoked_at is null
            and (c.expires_at is null or c.expires_at > $2)`,
        [h, now()],
      );
      const row = res.rows[0] as CredJoinRow | undefined;
      if (!row) return null;

      const ctx = parseJson<RunContextData>(row.context);
      const endpoints = parseJson<AllowedEndpointData[]>(row.endpoints);
      const urlPolicy = parseJson<ProxyUrlPolicyData>(row.url_policy);

      return {
        ...ctx,
        allowlist: { endpoints, models: row.models },
        urlPolicy: {
          blockedDomains: urlPolicy.blockedDomains ?? [],
          ...(urlPolicy.allowedDomains ? { allowedDomains: urlPolicy.allowedDomains } : {}),
          ...(urlPolicy.userSourceDomains ? { userSourceDomains: urlPolicy.userSourceDomains } : {}),
          ...(urlPolicy.fetchUserDataForbidden === true ? { fetchUserDataForbidden: true } : {}),
        },
        ...(urlPolicy.knownDomains ? { knownDomains: urlPolicy.knownDomains } : {}),
        ...(urlPolicy.novelDomainCap != null ? { novelDomainCap: urlPolicy.novelDomainCap } : {}),
      };
    },
  };
}
