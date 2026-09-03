import type { BenchmarkDeps, SqlExecutor } from "./types.js";

// Provider no-training/retention verification (REQ-EVAL-3 machinery). A corpus draft reaches a model API only from
// an account whose no-training/retention terms are verified IN WRITING; "nothing is transmitted until it is." The
// written verification is a human act (D-P0.13-2); this is the record it produces + the GATE the P0.14 arm runner
// MUST consult before transmitting any enclave draft to a provider. Enforcing it here — as a seam, not a doc
// convention — is what makes REQ-EVAL-3's "nothing transmitted until verified" checkable rather than aspirational.

/** Raised when a transmission to a provider is attempted without a current written verification (REQ-EVAL-3). */
export class ProviderNotVerifiedError extends Error {
  constructor(public readonly provider: string) {
    super(
      `benchmark: provider "${provider}" has no current written no-training/retention verification — ` +
        `no corpus draft may be transmitted to it (REQ-EVAL-3)`,
    );
    this.name = "ProviderNotVerifiedError";
  }
}

export interface RecordVerificationInput {
  readonly provider: string;
  /** the signed no-training/retention terms on file. */
  readonly termsRef: string;
  readonly verifiedAt: Date;
  readonly expiresAt?: Date;
  readonly id?: string;
}

/** Record a provider's written no-training/retention verification. */
export async function recordProviderVerification(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: RecordVerificationInput,
): Promise<string> {
  const id = input.id ?? deps.ids("bmpv");
  await exec.query(
    `insert into benchmark_provider_verifications (id, provider, terms_ref, verified_at, expires_at, recorded_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, input.provider, input.termsRef, input.verifiedAt, input.expiresAt ?? null, deps.clock.now()],
  );
  return id;
}

/** Revoke a verification (the terms lapsed or were withdrawn) — the provider becomes non-transmissible again. */
export async function revokeProviderVerification(
  exec: SqlExecutor,
  id: string,
  revokedAt: Date,
): Promise<void> {
  await exec.query(`update benchmark_provider_verifications set revoked_at = $2 where id = $1`, [id, revokedAt]);
}

/**
 * Is `provider` transmissible at time `at`? True iff a non-revoked verification exists whose `verified_at ≤ at` and
 * whose `expires_at` is null or `> at`. This is the predicate the P0.14 transmission path gates on.
 */
export async function providerTransmissible(
  exec: SqlExecutor,
  provider: string,
  at: Date,
): Promise<boolean> {
  const rows = (
    await exec.query(
      `select 1 from benchmark_provider_verifications
        where provider = $1 and revoked_at is null and verified_at <= $2
          and (expires_at is null or expires_at > $2)
        limit 1`,
      [provider, at],
    )
  ).rows;
  return rows.length > 0;
}

/** Assert `provider` is transmissible at `at`, else throw `ProviderNotVerifiedError` (the enforceable gate). */
export async function assertProviderTransmissible(
  exec: SqlExecutor,
  provider: string,
  at: Date,
): Promise<void> {
  if (!(await providerTransmissible(exec, provider, at))) throw new ProviderNotVerifiedError(provider);
}
