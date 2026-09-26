// The live `ClaimPrePass` binding (DEF.2 F6; closes the pre-pass half of D-PRB.03-1). §5.6 item 1's
// Haiku-class claim-count pre-pass: count a draft version's verifiable claims so the run sheet's
// estimate refines from word-count density to a measured count.
//
// The api holds NO provider key (REQ-ARCH-30 — provider keys only ever exist inside the egress
// proxy). The call rides the SAME egress-proxy path a run pod uses, with a purpose-minted,
// narrowly-scoped synthetic credential:
//   mint → POST {proxy}/v1/messages (x-rhema-proxy-credential) → revoke
// endpoint-allowlisted to `api.anthropic.com /v1/messages`, model-allowlisted to the Haiku bare id,
// TTL-bounded (≈90 s) and capped at a handful of credits. The proxy meters it into `usage_records`
// under a synthetic `est_<id>` run id + role `estimate_prepass` — the ~5-credit COGS is metered but
// NEVER ledger-debited (there is no run to commit), which is exactly "absorbed by Rhema" (§5.6).
//
// The credential mint writes the non-RLS proxy_* tables — `rhema_app` is intentionally ungranted
// there (0025), so this seam runs on the api's ELEVATED exec (`systemExec`), the same role tier the
// worker's provision mint uses. Bind it only when the elevated exec exists; otherwise the estimate
// route stays provisional (its designed degraded posture).

import { createHash } from "node:crypto";
import { CURRENT_RATE_TABLE_VERSION } from "@rhema/contracts";
import type { IdFactory } from "@rhema/orchestrator";
import type { ContentStore } from "@rhema/mirror";
import type { ClaimPrePass } from "./estimate-routes.js";
import type { SqlExecutor } from "./estimate-cache.js";

/** The Haiku-class model the §5.6 pre-pass runs (the bare allowlist id — a dated suffix would 403). */
export const CLAIM_PREPASS_MODEL = "claude-haiku-4-5";
/** The usage_records role marking proxy-metered pre-pass COGS (no run, never ledger-debited). */
export const CLAIM_PREPASS_ROLE = "estimate_prepass";
/** The proxy request path the allowlist admits — nothing else on the provider is reachable. */
const MESSAGES_PATH = "/v1/messages";
const PROVIDER_HOST = "api.anthropic.com";

export interface ClaimPrePassDeps {
  /** the egress-proxy base URL (`EGRESS_PROXY_URL`) — the ONLY provider route. */
  readonly proxyBaseUrl: string;
  /** the ELEVATED exec (proxy_* mint/revoke — ungranted to `rhema_app` by design, 0025). */
  readonly db: SqlExecutor;
  /** content-addressed draft bytes — `draftSha` IS the artifact version's `content_sha256`. */
  readonly contentStore: ContentStore;
  /**
   * Workspace-BOUND store resolver (DEF.2 Stage-B fix): `ContentStore.get(sha256)` carries no workspace,
   * so the api's unbound write-only store THROWS on get — the live seam must resolve the store per call
   * with the principal's workspace (`contentStoreFor`, the existing api seam). Falls back to
   * `contentStore` when unset (tests bind a readable store directly).
   */
  readonly contentStoreFor?: (workspaceId: string) => Promise<ContentStore>;
  readonly ids: IdFactory;
  readonly clock: { now(): Date };
  /** injectable fetch (tests); the deploy uses global fetch. */
  readonly fetch?: typeof fetch;
  /** the pre-pass model; defaults to the Haiku bare id. */
  readonly model?: string;
  /** synthetic credential TTL — bounds a missed revoke. Default 90 s. */
  readonly credentialTtlMs?: number;
  /** the synthetic run's cap — the §5.6 ~5-credit bound with headroom. Default 25 credits. */
  readonly capCredits?: number;
  /** the draft slice the prompt carries — bounds prompt size + cost. Default 120k chars. */
  readonly maxDraftChars?: number;
  /** the fetch timeout — kept INSIDE the route's ≤5 s pre-pass budget. Default 4.5 s. */
  readonly timeoutMs?: number;
}

interface AnthropicContentBlock {
  readonly type?: string;
  readonly text?: string;
}
interface AnthropicMessagesResponse {
  readonly content?: readonly AnthropicContentBlock[];
}

/** Count verifiable claims only — terse output keeps the pre-pass at its ~5-credit bound. */
const CLAIM_COUNT_PROMPT = `Count the distinct factual claims in the document below: verifiable assertions of fact (statistics, dates, names, citations, causal or comparative claims). Do not count headings, opinions, or connective prose. Reply with ONLY the integer — no words, no punctuation.

---
`;

export function createProxyClaimPrePass(deps: ClaimPrePassDeps): ClaimPrePass {
  const model = deps.model ?? CLAIM_PREPASS_MODEL;
  const ttlMs = deps.credentialTtlMs ?? 90_000;
  const capCredits = deps.capCredits ?? 25;
  const maxChars = deps.maxDraftChars ?? 120_000;
  const doFetch: typeof fetch = deps.fetch ?? fetch;

  return {
    async count(args) {
      if (!args.draftSha) return null;
      // The sha the sheet sends IS the content hash — the store read needs no version-row join. The
      // store must be bound to the CALLER's workspace (an unbound store refuses get() outright).
      const store = deps.contentStoreFor ? await deps.contentStoreFor(args.workspaceId) : deps.contentStore;
      const bytes = await store.get(args.draftSha).catch(() => null);
      if (!bytes || bytes.byteLength === 0) return null;
      const draftText = Buffer.from(bytes).toString("utf8").slice(0, maxChars);

      // A unique `est_<id>` run id gives THIS call its own cap window — the proxy's
      // `spentCredits(runId)` check is per-run, so a shared id would let successive estimates
      // trip each other's budget.
      const pseudoRunId = `est_${deps.ids("est")}`;
      const allowlistId = deps.ids("pal");
      const credId = deps.ids("pcr");
      const secret = `${pseudoRunId}.1.${deps.ids("sec")}`;
      const hash = createHash("sha256").update(secret).digest("hex");
      const now = deps.clock.now();
      const context = {
        runId: pseudoRunId,
        attempt: 1,
        agentId: "claim-prepass",
        role: CLAIM_PREPASS_ROLE,
        workspaceId: args.workspaceId,
        billingAccountId: args.billingAccountId,
        projectId: args.projectId,
        provider: "anthropic",
        modelTier: "base",
        rateTableVersion: CURRENT_RATE_TABLE_VERSION,
        capCredits,
        // Stage-B fix: est_<id> has no `runs` row by design — fetch_log/run_events*/pause_signals all FK
        // to runs(id), so run-scoped writes must skip. usage_records has no run_id FK — metering lands.
        meterOnly: true,
      };
      const endpoints = [{ host: PROVIDER_HOST, pathPrefix: MESSAGES_PATH }];
      await deps.db.query(
        `insert into proxy_allowlists(id, run_id, hosts, endpoints, models, url_policy, cap_credits, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          allowlistId,
          pseudoRunId,
          [PROVIDER_HOST],
          JSON.stringify(endpoints),
          [model],
          JSON.stringify({ blockedDomains: [] }),
          capCredits,
          now,
        ],
      );
      await deps.db.query(
        `insert into proxy_credentials(id, run_id, attempt, allowlist_id, credential_hash, context, created_at, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          credId,
          pseudoRunId,
          1,
          allowlistId,
          hash,
          JSON.stringify(context),
          now,
          new Date(now.getTime() + ttlMs),
        ],
      );

      try {
        const res = await doFetch(`${deps.proxyBaseUrl}${MESSAGES_PATH}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
            // the ONLY credential the api ever presents — the proxy resolves it and injects the
            // provider key upstream (x-api-key never enters this process).
            "x-rhema-proxy-credential": secret,
          },
          body: JSON.stringify({
            model,
            max_tokens: 32,
            stream: false,
            messages: [{ role: "user", content: `${CLAIM_COUNT_PROMPT}${draftText}` }],
          }),
          signal: AbortSignal.timeout(deps.timeoutMs ?? 4_500),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as AnthropicMessagesResponse;
        const text = (body.content ?? []).map((b) => b.text ?? "").join("");
        const m = /\d+/.exec(text);
        if (!m) return null;
        const n = Number(m[0]);
        return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.floor(n) : null;
      } catch {
        return null; // any transport/parse failure → the route's provisional figure (§5.6).
      } finally {
        // Revoke on every path; the 90 s TTL bounds a missed revoke regardless.
        await deps.db
          .query("update proxy_credentials set revoked_at = $1 where id = $2", [deps.clock.now(), credId])
          .catch(() => {});
      }
    },
  };
}
