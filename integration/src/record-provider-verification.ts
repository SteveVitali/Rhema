// The LIVE provider-verification write (D-P0.13-2 — PRB.15 Stage B, operator-gated). Records the
// operator's WRITTEN attestation that the provider's no-training/retention terms are verified (the
// Anthropic Commercial Terms reference, per the HUMAN-H6 act — the human reads the terms and records
// the reference here; the agent never fabricates it), then asserts `providerTransmissible("anthropic",
// now) === true` so the REQ-EVAL-3 gate ("nothing is transmitted until it is") is armed on prod.
//
// `benchmark_provider_verifications` rows are facts-of-record: this inserts a NEW row each call (a
// re-verification supersedes; `revokeProviderVerification` is the lapse path — no update, no delete).

import pg from "pg";
import { recordProviderVerification, providerTransmissible } from "@rhema/benchmark";
import { systemClock, randomUlids } from "@rhema/orchestrator";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`record-provider-verification: missing required env ${name}`);
  return v;
}

export interface ProviderVerificationResult {
  readonly id: string;
  readonly provider: string;
  readonly termsRef: string;
  readonly transmissible: boolean;
}

/**
 * Record the written verification and assert the gate. `termsRef` is the human's reference to the
 * signed/attested terms (e.g. the Anthropic Commercial Terms URL + the attestation date); `verifiedAt`
 * is when the HUMAN verified (not when this runs) — the operator passes it in writing.
 */
export async function recordAndAssertProvider(
  pool: pg.Pool,
  args: { provider: string; termsRef: string; verifiedAt: Date; expiresAt?: Date },
  log: (msg: string) => void = console.log,
): Promise<ProviderVerificationResult> {
  const exec = { query: (sql: string, params?: unknown[]) => pool.query(sql, params) };
  const id = await recordProviderVerification(exec, { ids: randomUlids(), clock: systemClock }, {
    provider: args.provider,
    termsRef: args.termsRef,
    verifiedAt: args.verifiedAt,
    ...(args.expiresAt ? { expiresAt: args.expiresAt } : {}),
  });
  log(`[provider-verification] recorded ${id} for ${args.provider} (terms: ${args.termsRef})`);
  const transmissible = await providerTransmissible(exec, args.provider, new Date());
  if (!transmissible) {
    throw new Error(
      `provider "${args.provider}" still non-transmissible after recording ${id} — ` +
        "the REQ-EVAL-3 gate must hold before any corpus draft is transmitted",
    );
  }
  log(`[provider-verification] providerTransmissible("${args.provider}", now) === true`);
  return { id, provider: args.provider, termsRef: args.termsRef, transmissible };
}

/** CLI: DATABASE_URL + PROVIDER + TERMS_REF + VERIFIED_AT (ISO date the human verified) [+ EXPIRES_AT]. */
export async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const provider = requireEnv("PROVIDER");
  const termsRef = requireEnv("TERMS_REF");
  const verifiedAt = new Date(requireEnv("VERIFIED_AT"));
  if (Number.isNaN(verifiedAt.getTime())) {
    console.error("[record-provider-verification] VERIFIED_AT must be an ISO timestamp");
    process.exit(1);
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await recordAndAssertProvider(pool, {
      provider,
      termsRef,
      verifiedAt,
      ...(process.env.EXPIRES_AT ? { expiresAt: new Date(process.env.EXPIRES_AT) } : {}),
    });
    console.log("[record-provider-verification] done");
  } catch (err) {
    console.error("[record-provider-verification] failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
