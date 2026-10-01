# RLS-only exposure since migration 0026 — audit list (SEC.1 / REQ-SPEC-30; HUMAN-H7 review)

**The window.** Migration `0026_system_bypassrls.sql` granted the production `postgres` role
`BYPASSRLS` while every service still connected as `postgres`. From **2026-09-17** (0026 applied /
first prod deploy — whichever is later, per the ticket) until the SEC.1 role switch lands, RLS was
the *only* isolation on the user-serving path and it was *bypassed* for the serving role — any
tenant-scoped query missing an explicit workspace predicate could return another workspace's rows.

**Status.** Every entry's "fixed" date is the SEC.1 stage-B switch timestamp (pending — see
`docs/tickets/DEFERRALS.md` if the window defers); code-level predicates marked FIXED below already
hold on a bypass role (verified by `apps/api/src/voice-routes.test.ts` BYPASSRLS simulation and the
two-tenant probe `integration/src/two-tenant-probe.ts`).

## Confirmed leaks (had no predicate, served cross-tenant)

| Route | File:line | Table(s) | Exposure | Status |
|---|---|---|---|---|
| `GET /projects/:id/review/:runId/dossier` | `apps/api/src/dossier-routes.ts` | `correspondence_items` + children | 2026-09-17 → STB.2 fix | **FIXED (STB.2)** — explicit workspace predicate |
| `GET /voices` (persona list) | `apps/api/src/voice-routes.ts` | `personas` | 2026-09-17 → SEC.1 | **FIXED (SEC.1)** — `workspace_id = $principal`; BYPASSRLS regression test |
| `GET|POST|PATCH|DELETE /projects/:id/chat…` + outline routes | `apps/api/src/chat-routes.ts:196`, `apps/api/src/outline-routes.ts:73` (`loadProject`) | `projects` → then bucket-C `threads`, `artifacts`, `runs`, `drafts` | 2026-09-17 → SEC.1 | **FIXED (SEC.1)** — `and workspace_id = $2` on the project lookup; deterministic probe found the live leak under the bypass role |

## Residual classes that relied on RLS alone (enforced for `rhema_app_login` post-switch; still bypass-transparent under `postgres`)

Every route below queries through `deps.txRunner` / `createScopedDb` — correct under the user role.
Under BYPASSRLS `postgres` (the exposure window) a missing predicate meant cross-tenant read. The
two-tenant probe exercises every GET in this set as each tenant and asserts zero foreign markers;
this list is the human-review index (HUMAN-H7).

- **Bucket A, `where id = $1` without `workspace_id` (RLS was the only check):**
  - `GET /runs/:id` family — `apps/api/src/run-routes.ts` (`runs`)
  - `GET /projects/:id` + project sub-resources — `apps/api/src/project-routes.ts` (`projects`, `artifacts`, `figures`, `timeline_events`)
  - `GET /billing/usage/run/:id`, `…/project/:id`, `…/checkout-sessions/:id` — `apps/api/src/billing-routes.ts` (`runs`, `projects`, `checkout_sessions`)
  - `GET /voices/:id`, `…/connections`, `…/estimate` — `apps/api/src/voice-routes.ts` (`personas` + bucket-C children)
  - `GET /session`, `/inbox`, `/usage` — session/inbox routes (`user`-keyed + `inbox_items` — bucket D/user-keyed, route-enforced by `principal.userId`)
- **Bucket C, child reads without a parent join** (no row-level policy at all — the named residual the
  census pins): `threads`, `findings`, `correspondence_items`, `decisions`, `dispositions`,
  `artifact_versions`, `figure_versions`, `live_docs`, `restore_points`, `guidance`, `gates`,
  `steps`, `claims`, `provenance_maps`, `working_copies`, `discovered_items`, `connections` — every
  route that touches them is safe *post-switch* only because it reaches them through an RLS'd parent
  inside a tenant transaction. A route that forgets the parent join reads cross-tenant under ANY
  bypass role — this is why `loadProject`'s predicate landed in SEC.1 rather than waiting for the
  switch.
- **List routes without `workspace_id` in the WHERE clause:** none found — every list route (`/voices`,
  `/projects`, `/inbox`, `/billing/usage*`) carries the predicate; the probe's list pass confirms.

## Verification + review hooks

- `integration/src/two-tenant-probe.ts` — deterministic census: every tenant-scoped GET × foreign ids
  + list, as `rhema_app_login`; `--base-url` live mode for the Stage-B pre/post probes.
- `packages/security-checks/src/rls-catalog.test.ts` — bucket A/B/C/D census + `rhema_app_login`
  grant pins; a new table without a decision fails CI.
- `docs/security/tenancy-audit.md` — the system-pool boundary audit + allowlist.
- **HUMAN-H7** owns the exposure-period review: confirm the 0026 apply date vs first deploy, confirm
  the switch timestamp, sign off on the residual classes above.
