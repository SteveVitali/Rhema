# ADR-020: The browser-journey harness — keyless mailbox sessions, flagged test tenants, expected-red registry

- **Status:** Accepted
- **Date:** 2026-10-01
- **Ticket:** JOURNEY.1
- **Requirement ids:** REQ-SPEC-29, REQ-SPEC-30, REQ-ARCH-39
- **Spec:** §13.2 (stages/CI); pairs with ADR-013 (deploy authorization), ADR-016 (the journey concept
  this ticket implements), ADR-018 (the role boundary the purge sweep rides)

## Context

JOURNEY.1 makes every user-facing Stage-B deploy operationally verifiable by walking the real
product in a real browser, on production, every night. That needs three things the platform never
had: (1) a way to *sign in* inside CI without a password, OAuth client drive, or lifted cookie;
(2) a way to let that traffic exist on prod without polluting SLOs, the trial kill switch, or
storage forever; (3) a registry that records which user-visible behaviors are proven and which are
still owed — so a red step is reported debt, not a hidden failure.

## Decision

### 1. Sessions ride the real magic-link flow into a pinned test mailbox — keyless end to end

The harness signs in exactly like a user: `POST /signup` (or `/login`) with a `test+<tag>@rhema.tools`
address → the api's Better Auth sends a magic link via Resend → the runner reads the message out of
the operator-provisioned mailbox `test@rhema.tools` and navigates the link in Playwright.

The mailbox client (`packages/journeys/src/mailbox.ts`) is **keyless**: it mints a short-lived JWT
(`iss` = `rhema-journeys@rhema-507501.iam.gserviceaccount.com`, `aud` = the Google token endpoint,
`scope` = `gmail.readonly`, `sub` = `test@rhema.tools`), has the IAM Credentials API `signJwt` it
(the *caller's* identity — CI Workload Identity Federation or the operator's ADC — holds
`roles/iam.serviceAccountTokenCreator` on the SA), exchanges it via the OAuth JWT-bearer grant, and
reads Gmail. **No credential exists**: no key file, no app password, no OAuth refresh token — the
SA has no exported key and the mailbox password is never known to the harness. The `sub` is
hard-pinned: the client constructor throws on any `userId` other than `test@rhema.tools`, and the
session layer (`assertTestIdentity`) refuses any address that isn't `test@…`/`test+<tag>@…` on that
domain — so the harness *cannot* mint a session for a real user, and there is no code path that
lifts one (no cookie import, no DB session read, no minted token).

**Per-run email-leg assertion:** the new-visitor identity is fresh every run
(`test+j<nonce>nv@rhema.tools`), so N2 exercises the full mailbox round-trip on every run. Returning
identities (`test+jrn-<tag>@…`) are stable and `storageState`-cached under a gitignored `.journeys-state/`
dir — one link per identity per run — and a dead cache (the purge reaped the tenant, or the cookie
expired) provably re-mints: the probe is "does `/app` authenticate," not file freshness.

### 2. `workspaces.is_test` — the flag that grants nothing

Migration `0046_test_workspaces.sql` adds `is_test boolean not null default false` + a partial index
on `(created_at) where is_test`. The flag is written exactly once — server-side inside
`provisionPersonalAccount` (`apps/api/src/signup.ts`), which covers both `POST /signup` and the
Better Auth `onUserCreate` path — when the provisioned account's stored email matches the configured
`TEST_MAILBOX` (deploy config, not a secret) under the **exact-match rule**:
`matchesTestMailbox` accepts the base address and `base+<tag>` on the same domain, and nothing else
(`tesseract@`, `test@rhema.tools.evil`, `test2@` never flag). No API route writes the column; a
flagged account still hits every gate (the test suite asserts the unverified-email run gate still
refuses it).

What the flag does — exclusion only:

- **SLOs:** every `probeSlos` probe over a workspace-keyed table applies `not exists (… where
  w.is_test)`; `run_id`-keyed tables (`gates`, `fetch_log`) wrap through `runs`; `slo_samples`'s
  nullable `workspace_id` keeps NULL platform rows in. Test traffic can neither breach nor flatter
  a signal.
- **Trial kill switch:** `recordTrialSpend` skips the `trial_spend_daily` increment for flagged
  workspaces (the ceiling measures real users' burn).
- **Purge:** the worker's hourly `test-tenant.purge` sweep (system pool — `jobs.ts` is already in
  `tools/system-pool-boundary.json`) selects `is_test` workspaces older than
  `TEST_TENANT_PURGE_HOURS` (26 h default) and routes each member through the *existing*
  `account.hard-delete` pipeline with `deletion_requested_at` stamped past the 14-day grace —
  flagged accounts skip grace, real accounts are never touched. Hard deletion keeps the retention
  contract: anonymized ledger/usage rows survive for metering truth.

### 3. The registry lives in code, not a planning doc

`packages/journeys/src/registry.ts` owns the step table — `{id, journey, asserts, owner, expected,
paid}` for every planning-ledger step (N1–N9, R1/R4–R7, P1, C1, X1). The planning ledger's table is
historical (a dated note says so). Runner semantics make red a report, not a failure: green-fail ⇒
run fails; red-fail ⇒ `owed` to its owner; red-pass ⇒ `ready-to-flip` (the owner flips `expected`
with screenshot evidence in its own PR). Paid steps (`N5 N6 R4 R6`) skip unless `--paid` — the
nightly stays $0 by construction.

### 4. Provenance, parity, spend

- **Provenance (REQ-ARCH-39):** `deployments` remains the record of truth; each image now bakes
  `ARG GIT_SHA` → `RHEMA_BUILD_GIT_SHA`, and `/healthz` serves `build.gitSha` — the
  network-reachable fast path `scripts/check-deploy-provenance.mjs` compares against the chain tip,
  failing closed on absent/unknown/mismatch.
- **Parity:** every `/assets/*.js` response on a visited page must be 200 + JS content-type; console
  errors and failed requests are captured per step into the report (PR-J4's defect class).
- **Spend:** the weekly paid leg runs one ≤ 300-word fixture (one planted-error claim for N6) and at
  most one chat turn; `spend-guard` sums the ISO week's flagged-tenant `usage_records.list_cost_usd`
  and refuses at ≥ $5 before dispatch.

## Consequences

- Nightly CI walks prod for free; the weekly paid leg is bounded and audited.
- Any ticket that owns a step flips it with a screenshot — the registry is the shared scoreboard.
- Test tenants are self-cleaning; nothing they do can corrupt the numbers or persist past a day.
- If the mailbox path breaks, *only* session-bearing legs fail — and they fail loudly at N2, not
  silently skipped.

## Revisit trigger

- The mailbox moves off Gmail DWD (a different provider or a first-class test-inbox API) — replace
  `mailbox.ts`; the nonce/marker contract and `N2` stay.
- A paid leg needs more than $5/week or a >300-word fixture — raise the constants in
  `spend-guard.ts` deliberately and re-justify the cap here.
- Test tenants need privileges beyond exclusion/cleanup (they must never get any by accident) — the
  `is_test` flag's semantics are "excluded from SLOs and the kill switch, purged hourly", nothing
  more; a new behaviour wants a new flag and a new ADR.
- The registry format changes (new metadata fields, new cadence classes) — this ADR records the
  v1 shape; planning-ledger § Journey step registry defers to the code.
