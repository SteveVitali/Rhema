# ADR-090: The emailed export token resolves on the system pool, not the scoped connection

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-ACCT-3, REQ-SPEC-30
- **Spec:** §5.11, §11.4

## Context

D-STB.5a-1: `GET /export/download?token=` is anonymous — the emailed token IS the credential.
`createScopedDb` runs anonymous requests on `rhema_app_login` with no `app.tenant_id`, and
`account_exports` is FORCE-RLS (0038): the row lookup returned zero rows and every emailed link
answered 404, forever (reproduced live three times, report `docs/build/reports/STB.5a`).

## Decision

The anonymous download route resolves `token → account_exports` row on `deps.systemExec` (the
BYPASSRLS system pool) — a single hash-keyed lookup plus the `downloaded_at` stamp. When
`systemExec` is not bound the route fails closed with 503 `download_unavailable`; it never falls
back to the scoped pool. Authenticated export routes stay on the tenant-scoped `db`.

## Consequences

- The emailed link works; the anonymous path can see exactly one table and only by token hash —
  no other cross-tenant surface is opened.
- `apps/api/src/index.ts` must forward `systemExec`; the route surface for REQ-SPEC-30's
  allowlisted-intentional-scan class gains one entry, scoped to a credential-bearing token.
- Live re-verification (T3 302 on the deployed tip) is consolidated under D-CAP.3-1.

## Alternatives considered

- A dedicated `token→workspace` map without RLS: new table + writes for a single lookup; rejected.
- A SECURITY DEFINER probe (like ADR-092): viable, but the route already needs `downloaded_at`
  writes — two probes is worse than one system-pool seam.
- Grant `rhema_app_login` a conditional policy on `account_exports`: a policy that reveals rows by
  raw-token match still exposes the table to enumeration by timing; rejected.

## Revisit trigger

Reopen if the anonymous-download surface needs more than hash lookup + stamp (e.g. resumable
ranges with per-chunk auth), or if the system pool's allowlist needs tightening to per-function
scopes.
