# SEC.1 — Tenant isolation in depth: split the user-serving and system DB roles

- **Sequence:** 59 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** security
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** STB.4
- **Scope (one line):** user-serving pools (`DATABASE_URL`: api, worker user-scoped handlers) connect as a role that cannot bypass RLS, while `SYSTEM_DATABASE_URL` keeps the bypass for audited system paths only. The work: a lint, a system-pool audit, the suite run as the user role, a two-tenant probe, the rollback, and the RLS-only exposure list for HUMAN-H7.
- **Spec §§:** §11.4 and §13.3 (2026-09-30 banners), Appendix A.9 (REQ-SPEC-30 row + note); ADR-017; ADR-013 (standing authorization)
- **REQ coverage:** REQ-SPEC-30 (primary), REQ-DATA-4, REQ-ARCH-30 (stamp in the PR)
- **Absorbs (backlog):** BL-08 (PR-S1; X-api-db-role-bypassrls)
- **Run:** `implement-spec spec=docs/tickets/59_SEC.1__tenant-isolation-in-depth.md`
- **Gate status:** **DB role switch — window OPEN (operator decision, 2026-09-30; LEDGER GATE DECISIONS).** The operator-paused window (ADR-013) covers: prod deploy of the chain tip + `ALTER ROLE … LOGIN PASSWORD` + repoint `appDatabaseUrl`/`workerDatabaseUrl` + pre/post-switch two-tenant probe + 30-min observation → keep or roll back. The deploy rides the same answer — the additive-migration lint that pre-authorized deploys presuppose only lands in HOT.1. The worker runs Stage A then Stage B end-to-end in this run; the operator is available during the switch + observation. Probe accounts sign in through the real magic link into `test@rhema.tools`, read keylessly by the `rhema-journeys` service account (H7 mailbox DONE — no operator assist, never minted sessions). All other ADR-013 pauses still stand (no DNS, `signup.mode`, credentials, real money, stateful destroy/replace, one-off prod data writes). If the window cannot complete, the ticket fallback applies: Stage A lands, switch → `D-SEC.1-1`, `/voices` predicate rides HOT.1's deploy, H7 exposure review → `D-SEC.1-n`. *(Amended 2026-09-30 at SEC.1 build time from the stale "operator-paused" text — the LEDGER answer is authoritative.)*
- **Live stage:** Stage A: code + tests ($0). Stage B: the operator-paused switch window, $0 inference (cap $0). It deploys the chain tip, enables the role, switches the pools, runs the two-tenant probe before and after, observes for 30 min, then keeps or rolls back.

## Goal
Since `0026_system_bypassrls.sql` (2026-09-17), every prod service has connected as `postgres` with `rolbypassrls=true`, so every query that relied on RLS alone has been cross-tenant in prod. Two leaks are known:
- the STB.2 dossier leak, patched at its route (`apps/api/src/dossier-routes.ts` ~237)
- the live `/voices` leak (PR-S1): `apps/api/src/voice-routes.ts` ~349, `select id from personas where deleted_at is null`, screenshot `reports/2026-09-30_prod-review/04-crosstenant-voices.jpg`

The tests stayed green because PGlite runs as its bootstrap superuser. After this ticket:
- user-serving code cannot bypass RLS
- only a named, linted, audited system pool can
- the suite proves isolation as the role prod actually uses
- a two-tenant probe proves it on the deployed stage
- the operator holds the list of what was exposed and when

## Load (read these — do not re-read others)
- ADR-017, ADR-013 (the pause list); spec §11.4/§13.3 banners and the REQ-SPEC-30 row (Appendix A.9); the prod
  review's PR-S1 row and Process finding 3.
- `packages/db/migrations/0001_roles.sql`, `0004_rls.sql`, `0026_system_bypassrls.sql`. `grep rhema_app
  packages/db/migrations` shows that grants cover only ~17 migrations' tables. `packages/db/src/rls.ts` (`withTenant`).
- `packages/security-checks/src/rls-catalog.test.ts`: the P1.22 census (buckets A–D) and the pooled probe, which
  already runs `set role rhema_app`. Its header cites `docs/security/tenancy-audit.md`, which **does not exist**.
- Pools: api `apps/api/src/env.ts` + `server.ts` (`pool` ~56, `new PgBoss(env.databaseUrl)` ~58, `rawDb` ~105,
  `systemPool`/`systemExec` ~160/227/230/304); worker `apps/worker/src/main.ts` (`pool` ~136; ~234 `systemPool …
  : pool` silently falls back to the user pool); egress-proxy `apps/egress-proxy/src/main.ts` ~34 (a system
  component writing `usage_records`); collab `apps/collab/src/env.ts` (`rhema_collab`).
- System-pool call sites (`grep -rn "systemExec\|systemPool" apps packages`): api `admin-cli.ts`,
  `billing-routes.ts` ~62–80 (Stripe intake), `claim-prepass.ts` (the elevated `proxy_*` mint); worker `main.ts`,
  `billing-jobs.ts`, `ingest-jobs.ts`, `run-jobs.ts`, `ledger-jobs.ts`, `jobs.ts`, `export-jobs.ts`;
  `packages/orchestrator/src/stranded-sweep.ts`.
- Harnesses: `packages/db/src/testing/pglite.ts`, `packages/orchestrator/src/testing/pg.ts` (+ mirror/benchmark);
  `integration/src/server-postgres.test.ts` (CI `postgres:16`). Lint precedent: `tools/eslint-plugin-rhema/rules/
  no-raw-set-tenant.js`.
- IaC: `infra/pulumi/index.ts` ~37–55 (the `*DatabaseUrl` secret configs); `compute.ts` ~336/337 + ~526–529
  (plaintext `value` envs), ~546 (collab), ~312–319 (the `secretKeyRef` precedent); `data.ts` ~138–144 (the
  Cloud SQL `postgres` user); `infra/PROD-BRINGUP.md` ~51–59 (the URL builds).

## In scope — deliverables
1. **The user-serving role** (REQ-SPEC-30, REQ-DATA-4). A forward migration creates it, guarded, as `NOLOGIN
   NOBYPASSRLS NOSUPERUSER` and grants it DML on exactly the tables user-serving code touches. It includes the
   grants `0027`–`0044` never gave `rhema_app`, plus `pgboss` schema privileges if pg-boss stays on this pool. It
   **changes no existing role**. Extend the census so that every table carries an explicit user-role grant
   decision; an ungranted new table fails CI. LOGIN + password are set only in the Stage B window.
2. **Pool wiring** (REQ-SPEC-30):
   - `DATABASE_URL` means the user-serving role in the api and in the worker's user-scoped handlers.
     `SYSTEM_DATABASE_URL` means the bypass role.
   - The worker's `systemPool … : pool` fallback (~234) becomes fail-closed: the system client is the system
     pool, or it is absent and logged, never the user pool.
   - Decide and document which pool `pg-boss` (api ~58, worker) and `rawDb` (Better Auth, account provisioning,
     `estimate_cache`) use.
   - Classify egress-proxy and collab. The proxy is a system component, so its `usage_records` writes need an
     explicit run→workspace predicate or an allowlist entry. Collab must not have `rolbypassrls`.
3. **The lint** (REQ-SPEC-30). Add `tools/eslint-plugin-rhema/rules/no-system-pool-in-user-route.js` + test.
   User-route modules (`apps/api/src/*-routes.ts`, route registrations in `apps/api/src/index.ts`, and the
   worker's user-scoped job handlers) may not reference `systemExec` / `systemPool` / `SYSTEM_DATABASE_URL`. The
   audited exceptions (the Stripe webhook intake; the estimate pre-pass's elevated `proxy_*` mint) are reached
   only through named functions on one allowlist file, with a reason each.
4. **The system-pool audit** (REQ-SPEC-30). For every call site in the Load list, each query either carries an
   explicit workspace predicate or sits on the allowlist of intentional cross-tenant scans. Examples: stranded
   sweeps, `run_events` retention/partition, the circuit breaker, `select id from workspaces` at worker ~621, and
   purges. Write `docs/security/tenancy-audit.md`: the allowlist, the bucket-C residual the census already
   names, and the pool classification. A test pins the allowlist.
5. **The suite runs as the user role** (REQ-SPEC-30, REQ-DATA-4). The PGlite harnesses run tenant-scoped
   transactions under `set role <user role>`, keeping a separate handle for seeding and the system paths. The
   CI `integration` job gains a leg that connects as the user role on the `postgres:16` service. A harness
   assertion fails if the tenant handle is superuser or `rolbypassrls`. Fix every test the switch turns red at
   its root: a query that silently depended on bypass while serving a user. List each in the run ledger.
6. **The `/voices` compensating predicate** (PR-S1). Add an explicit `workspace_id = $principal` predicate at
   `voice-routes.ts` ~349, so the confirmed live leak closes on the first deploy even if the switch window slips.
   Add a regression test that seeds two tenants and **fails without the predicate under a `BYPASSRLS` test role**
   (simulating today's prod).
7. **The two-tenant probe** (REQ-SPEC-30; journey step **X1**, API half).
   - `integration/src/two-tenant-probe.ts`. In deterministic mode it is the in-process api over PGlite as the
     user role, with tenants A and B. Every tenant-scoped GET route is called as A with B's ids and as a list,
     and must return no B row or id.
   - A census built from Hono's `app.routes` (re-confirm) plus an explicit exemption list makes any new
     unprobed GET route fail CI.
   - A `--base-url` live mode takes two sessions from env, never persisted. It also fetches the web pages
     `/voices`, `/app`, `/app/inbox`, `/usage` and a dossier, and looks for the other tenant's nonce.
8. **IaC + runbook** (REQ-ARCH-30).
   - The new role's password is **IaC-generated** into Secret Manager (a new role only — pre-authorized). Use
     e.g. `@pulumi/random`, after re-confirming the licence allowlist.
   - It reaches api and worker as a `secretKeyRef` DATABASE_URL, never a plaintext `value` env.
   - `infra/PROD-BRINGUP.md` gains the enable-role step, the switch, the verification queries and the rollback.
   - Record collab's plaintext `DATABASE_URL` (compute.ts ~546) as a REQ-ARCH-30 finding. Fix it if the change is
     only the env source; otherwise it becomes a `D-SEC.1-n` row owned by OPS.2 (BL-27).
9. **The exposure list** (BL-37 input). `docs/security/rls-exposure-since-0026.md` lists every user-serving
   query reachable on prod that relied on RLS alone: no explicit workspace predicate on a bucket-A table, or a
   bucket-C child read without its parent join. For each it gives:
   - route
   - `file:line`
   - table
   - window: start is the later of the 0026 apply (2026-09-17) and the route's first prod deploy (from the
     PHASE LOG and `deployments`); end is the switch time
   - the read-only Cloud Run request-log query and the read-only SQL that lists the affected rows

   Query **outputs** (other users' data) go only to `docs/build/logs/` (gitignored) or to the operator. They are
   never committed.
10. **Stage B**, in the operator's window:
    - `pulumi preview`, which must show zero replace/delete on stateful resources, then deploy the chain tip
      (it also carries cf40f28; HOT.1 verifies those fixes)
    - the pre-switch live probe; any foreign row found is added to the exposure list
    - `ALTER ROLE … LOGIN PASSWORD` from the secret, then switch the api and worker URLs
    - the post-switch probe, then a 30-min observation
    - keep, or roll back by shifting Cloud Run traffic to the retained pre-switch revision and restoring the
      config

## Out of scope
- The signup throttle and the invite field: SEC.2.
- Run-task confinement: SEC.3.
- Moving pre-existing URLs other than the new role's to `secretKeyRef`, and runbooking the collab role's LOGIN:
  OPS.2 (BL-27).
- The journey half of X1 (browser, two tenants): JOURNEY.1.
- The access-log review and the disclosure decision: HUMAN-H7 (BL-37).
- Retrofitting explicit predicates across user-serving code. ADR-017 rejects it; RLS carries that layer.
- A least-privilege replacement for `postgres` as the system role: a watch item in the ADR, not this ticket.

## Acceptance criteria
- [ ] The migration creates the user-serving role with `rolbypassrls = false`, `rolsuper = false`, and no
      membership in `postgres` or `cloudsqlsuperuser` (`pg_has_role` false). It alters no existing role. A test
      asserts all of this after `applyMigrations`. *(deterministic)*
- [ ] A census test fails on any table without an explicit user-role grant decision. *(deterministic)*
- [ ] Every tenant-scoped harness transaction runs as the user role, and a guard test fails if the tenant handle
      is superuser or `BYPASSRLS`. The CI `integration` job has a green user-role leg. `turbo build lint
      typecheck` and `pnpm test` are green after the root-cause fixes, each listed in the run ledger.
      *(deterministic)*
- [ ] The `/voices` regression test fails with the predicate removed under a BYPASSRLS role, and passes with it.
      *(deterministic)*
- [ ] The lint rejects a fixture route module that references `systemExec`, and accepts the allowlisted named
      functions. The allowlist test pins every system-pool call site from deliverable 4. *(deterministic)*
- [ ] The deterministic two-tenant probe returns zero foreign rows or ids on every tenant-scoped GET route. Its
      census fails when an unprobed GET route is added. *(deterministic)*
- [ ] `docs/security/tenancy-audit.md` and `docs/security/rls-exposure-since-0026.md` are committed. Neither
      contains any user data. *(agentic)*
- [ ] **Stage B** (operator window):
  - `select rolname, rolbypassrls, rolsuper from pg_roles` on prod shows the user role as non-bypass and
    non-super, and `rhema_collab` as non-bypass.
  - Cloud Run api and worker revisions carry the new `DATABASE_URL` via `secretKeyRef`.
  - The live probe (HTTP level: api JSON + web HTML) reports **zero foreign rows** on `/voices`, `/usage`, the
    project list, the dossier and the Inbox, with both tenants' **own** rows still visible (fail-closed ≠ empty).
    Journey step **X1**'s API half is green.
  - The worker's system sweeps still scan rows (e.g. the stranded-sweep / SLO-probe logs show non-zero scans).
  - No new 5xx on api/web in the 30-min window, per the Cloud Run request logs.
  - The rollback command and the retained pre-switch revision are recorded in the run ledger.

  *(agentic — HTTP-level + log evidence)*
- [ ] If the window has not opened by close:
  - Stage A lands.
  - The switch becomes `D-SEC.1-1` (unblocked by the operator window).
  - The `/voices` predicate still ships with the next pre-authorized deploy (HOT.1's).
  - The H7 exposure review becomes `D-SEC.1-n` ("H7 pending: exposure review").

  *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-30 (primary), REQ-DATA-4 (the two-tenant pooled test now runs as the prod-shaped role), REQ-ARCH-30 (the
new role's credential via Secret Manager, never plaintext env).

## Cross-cutting invariants
- Manifest **#13**, tenant isolation in depth (REQ-SPEC-30): this ticket makes it true. Every later ticket that
  adds a tenant read extends the probe census built here.
- Manifest **#10**: the probe, audit and exposure docs carry ids and counts only, never user text.
- Manifest **#12** / REQ-SPEC-29: SEC.1 lands before JOURNEY.1, so its evidence is HTTP-level + tests. JOURNEY.1
  later registers X1's browser half.
- REQ-SPEC-32: not touched (no money path changes).

## Notes
- **Owned decisions → write an ADR (the next free number):**
  - the user role's identity: reuse `rhema_app` + a LOGIN child `IN ROLE rhema_app`, or a fresh role
  - how it is created: by SQL as `postgres`, **not** the Cloud SQL Users API, because API-created users join
    `cloudsqlsuperuser`
  - the grant model: explicit per-table grants vs `ALTER DEFAULT PRIVILEGES` plus the census
  - the pg-boss and `rawDb` pools
  - the lint's module boundary + allowlist format, and whether a user-request-triggered **elevated mint** (the
    estimate pre-pass) is allowed. REQ-SPEC-30 lists "elevated mints" on the system pool, while ADR-017 says
    the system pool "never serves a user request". Resolve it as a named, audited function or move the mint.
  - **the definition of "role change"** that HOT.1's additive-migration lint encodes. Recommended: any
    `ALTER ROLE` / `DROP ROLE` / `GRANT <role> TO <role>` or attribute change on an existing role is a role
    change; creating a new `NOLOGIN` role and granting it table privileges is additive.
- **Consumes:** nothing earlier in round 3. **Consumers:** every later ticket touching SQL (the pool rule),
  HOT.1 (the role-change definition; its deploy may carry this ticket's inert migration if the window slipped),
  JOURNEY.1 (X1; its purge sweep runs on the system pool through this lint).
- **Probe accounts:** two dedicated accounts created through the real signup funnel, never a DB-lifted token
  (ADR-016). Record them in the run ledger by tag only, for JOURNEY.1's flagging and MAINT.2's test-data inventory
  (BL-38).
- **Anchors to re-confirm at build time:** every line number above; whether `app.routes` enumerates the mounted
  sub-apps; the migration number after `0044`; whether any user-serving path writes `usage_records` or
  `credit_ledger` outside `withTenant`.
- **Sizing risk:** deliverable 5 can cascade. If root-cause fixes exceed the window, land the harness switch with
  the failing set enumerated in the run ledger + a `D-SEC.1-n` row, and say so in the PR. Never skip-mark tests.
- **DEFERRALS rule:** anything not verifiable at build time, or blocked on HUMAN-H7 or the operator window,
  becomes a `D-SEC.1-<n>` row. Rows unblocked by the H7 item follow `85a_HUMAN-H7` § DEFERRALS rule.
