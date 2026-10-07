// JOURNEY.1 (REQ-SPEC-29; ADR-016; ADR-020) — the test-tenant flag's shared predicates.
//
// A workspace is `is_test` when it was provisioned for an address matching the configured test
// mailbox (exact base or base+plus-tag — `test@rhema.tools` / `test+<tag>@rhema.tools`). The flag is
// written exactly once — at provisioning, server-side, by apps/api's provisionPersonalAccount — and
// is never settable through any API route. It grants nothing; it only excludes the workspace from the
// numbers (SLO samples, the trial-spend accumulator) and marks it for the worker's auto-purge sweep.
//
// ACT.1's hook is `isTestWorkspace` (the SQL predicate).

import type { SqlClient } from "@rhema/orchestrator";

/**
 * The exact-match rule (ADR-020): `email` matches the configured test mailbox when it is the base
 * address itself OR the base local-part with a `+tag` on the same domain. `test@rhema.tools` matches;
 * `test+x@rhema.tools` matches; `test+x@other.test`, `tesseract@rhema.tools`, and `test@rhema.tools.evil`
 * never do. Comparison is case-insensitive per RFC 5321's case-insensitive domain + the convention that
 * mailbox provisioning lowercases.
 */
export function matchesTestMailbox(email: string, mailboxBase: string | undefined | null): boolean {
  const base = (mailboxBase ?? "").trim().toLowerCase();
  const addr = (email ?? "").trim().toLowerCase();
  if (!base || !addr || !base.includes("@")) return false;
  const [baseLocal, baseDomain] = base.split("@", 2);
  const [local, domain] = addr.split("@", 2);
  if (domain !== baseDomain) return false;
  return local === baseLocal || local!.startsWith(`${baseLocal}+`);
}

/**
 * ACT.1's hook — is this workspace a flagged test tenant? SQL-side callers can inline the same
 * predicate (`workspaces.is_test`); this is the code-side read for ledger/billing paths that hold a
 * workspace id.
 */
export async function isTestWorkspace(db: SqlClient, workspaceId: string): Promise<boolean> {
  const row = (
    await db.query("select is_test from workspaces where id = $1", [workspaceId])
  ).rows[0] as { is_test: boolean } | undefined;
  return row?.is_test === true;
}

/**
 * The one write path for the flag — called by apps/api's provisioning with the freshly inserted
 * workspace id and the signup address. Returns true when the workspace was flagged. Never sets the
 * flag on a non-matching address, and is a no-op when no test mailbox is configured.
 */
export async function flagWorkspaceIfTestTenant(
  db: SqlClient,
  args: { workspaceId: string; email: string; testMailbox: string | undefined | null },
): Promise<boolean> {
  if (!matchesTestMailbox(args.email, args.testMailbox)) return false;
  await db.query("update workspaces set is_test = true where id = $1", [args.workspaceId]);
  return true;
}
