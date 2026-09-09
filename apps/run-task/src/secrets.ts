// @rhema/run-task — the harness-only secrets file (REQ-SPEC-10; §12.4 step 4).
//
// The task starts as uid `harness`, which receives `RUN_TOKEN`, `API_INTERNAL_URL` and the per-run proxy
// credential via a FILE READABLE ONLY BY `harness`. It then launches the SDK as uid `agent` with a scrubbed
// env carrying none of these (see @rhema/engine buildAgentEnv). This module reads that file and asserts its
// permissions are harness-only (0600/0400, owned by the reading uid) — a file with any group/other bit, or
// owned by another uid, is refused: a mode slip would hand the model's uid the token. The check is the
// belt to the mount's braces (the file lives outside every seat mount).

import { readFileSync, statSync } from "node:fs";

/** The three secrets the harness holds and the agent must never see. */
export interface HarnessSecrets {
  readonly runToken: string;
  readonly apiInternalUrl: string;
  readonly proxyCredential: string;
}

/** Bits that must be clear on a harness-only file: any group or other permission (0o077). */
export const NON_OWNER_PERMISSION_MASK = 0o077;

/**
 * Assert a path is readable only by its owner and, when `expectedUid` is given, owned by that uid. Throws
 * with a precise reason otherwise. `mode` is the raw `stat` mode; we mask to the permission bits.
 */
export function assertHarnessOnly(
  stat: { mode: number; uid: number },
  expectedUid?: number,
): void {
  const perm = stat.mode & 0o777;
  if ((perm & NON_OWNER_PERMISSION_MASK) !== 0) {
    throw new Error(
      `secrets file must be readable only by harness (found mode 0${perm.toString(8)}; group/other bits set) — REQ-SPEC-10`,
    );
  }
  if (expectedUid !== undefined && stat.uid !== expectedUid) {
    throw new Error(`secrets file must be owned by the harness uid ${expectedUid} (found ${stat.uid}) — REQ-SPEC-10`);
  }
}

/**
 * Read + validate the harness secrets file. Verifies harness-only permissions before parsing, then returns
 * the three secrets. `expectedUid` (the harness uid) is asserted when provided.
 */
export function readHarnessSecrets(path: string, expectedUid?: number): HarnessSecrets {
  const st = statSync(path);
  // Default the owner check to the CURRENT (harness) uid: a 0600 file owned by some OTHER non-harness uid
  // would otherwise pass the permission gate. The reader is harness, so the file must be harness-owned.
  const owner = expectedUid ?? (typeof process.getuid === "function" ? process.getuid() : undefined);
  assertHarnessOnly({ mode: st.mode, uid: st.uid }, owner);
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<HarnessSecrets>;
  if (!raw.runToken || !raw.apiInternalUrl || !raw.proxyCredential) {
    throw new Error("harness secrets file is missing runToken / apiInternalUrl / proxyCredential");
  }
  return { runToken: raw.runToken, apiInternalUrl: raw.apiInternalUrl, proxyCredential: raw.proxyCredential };
}
