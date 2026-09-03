// Per-run proxy credential revocation (REQ-SPEC-11). Rotation (per attempt) and terminal revocation both flow
// through here. `proxy_credentials` is NOT under RLS, so revocation works under any tenant scope. Kept in its
// own module so both provisioning (rotation) and the internal API's terminal transitions (finalize/fail) use
// it without an import cycle.

import type { SqlClient } from "./tx.js";

/** Revoke every live credential for a run, inside the caller's transaction. */
export async function revokeRunCredentials(tx: SqlClient, runId: string, now: Date): Promise<void> {
  await tx.query("update proxy_credentials set revoked_at = $2 where run_id = $1 and revoked_at is null", [
    runId,
    now,
  ]);
}
