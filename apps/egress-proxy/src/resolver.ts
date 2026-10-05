// The live DB-backed `RunContextResolver` binding (D-P0.07-1/3). The orchestrator MINTS the credential + AUTHORS
// the allowlist at provision (packages/orchestrator provision.ts) and ships a structurally-identical resolver
// (resolver.ts); this proxy-LOCAL copy runs the same query over the proxy's own `SqlExecutor` so the egress
// security boundary carries NONE of the orchestrator's graph (engine/mirror/hooks) in its image — a thin shell
// behind the seam. It reads only the NON-RLS proxy tables (proxy_credentials / proxy_allowlists), so the system
// proxy resolves any run's credential without a tenant-scoped read; an unknown/revoked/expired credential → null
// (the handler answers 403 egress.denied).

import { createHash } from "node:crypto";
import type { AllowedEndpoint, RunContext, RunContextResolver } from "./context.js";
import type { SqlExecutor } from "./sinks.js";

function defaultHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

interface CredJoinRow {
  context: Record<string, unknown> | string;
  endpoints: AllowedEndpoint[] | string;
  models: string[];
  url_policy: Record<string, unknown> | string;
}

function parseJson<T>(v: T | string): T {
  return typeof v === "string" ? (JSON.parse(v) as T) : v;
}

/**
 * A `RunContextResolver` over the proxy tables. `resolve` hashes the credential, finds a live (not revoked, not
 * expired) credential row, joins its allowlist, and assembles the `RunContext`. All fields are server-side truth
 * (§12.7) — nothing a request body carries can change them.
 */
export function createDbRunContextResolver(
  db: SqlExecutor,
  opts: { now?: () => Date; hash?: (secret: string) => string } = {},
): RunContextResolver {
  const now = opts.now ?? (() => new Date());
  const hash = opts.hash ?? defaultHash;
  return {
    async resolve(credential: string): Promise<RunContext | null> {
      const h = hash(credential);
      const res = await db.query(
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

      const ctx = parseJson<Record<string, unknown>>(row.context);
      const endpoints = parseJson<AllowedEndpoint[]>(row.endpoints);
      const urlPolicy = parseJson<{
        blockedDomains?: string[];
        allowedDomains?: string[];
        userSourceDomains?: string[];
        fetchUserDataForbidden?: boolean;
        knownDomains?: string[];
        novelDomainCap?: number;
      }>(row.url_policy);

      return {
        ...(ctx as unknown as Omit<RunContext, "allowlist" | "urlPolicy">),
        allowlist: { endpoints, models: row.models },
        urlPolicy: {
          blockedDomains: urlPolicy.blockedDomains ?? [],
          ...(urlPolicy.allowedDomains ? { allowedDomains: urlPolicy.allowedDomains } : {}),
          // P1.21 — the Memo run's `user_sources[]` domains + the forbidden marker (REQ-WF-8).
          ...(urlPolicy.userSourceDomains ? { userSourceDomains: urlPolicy.userSourceDomains } : {}),
          ...(urlPolicy.fetchUserDataForbidden === true ? { fetchUserDataForbidden: true } : {}),
        },
        ...(urlPolicy.knownDomains ? { knownDomains: urlPolicy.knownDomains } : {}),
        ...(urlPolicy.novelDomainCap != null ? { novelDomainCap: urlPolicy.novelDomainCap } : {}),
      };
    },
  };
}
