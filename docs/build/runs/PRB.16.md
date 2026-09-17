# PRB.16 — prod golden-path verification (run ledger)

- **Ticket:** `docs/tickets/28g_PRB.16__prod-golden-path-verification.md` (seq 28g)
- **Branch:** `stevevitali/prb-16-prod-golden-path-verification` (base `stevevitali/prb-15-prod-bringup`)
- **Budget:** $50 total paid inference (HUMAN-H6); per-run caps via `cap_credits` at $0.01/credit.
- **Fixture:** workspace `01M2R2E1WA81E1BQJX94K1SZQ4`, user `01M2R2E1W23EY1X3G83ZMF9T1F`
  (`prb16-probe-…@rhema.tools`, magic-link session), project `proj_prb16` ("The Quiet Cost of
  Convenience"), draft `proj_prb16_d1` (454 words, sha `0d132c22…`), funding 200,000 credits.

## Stage A (committed `86fd5ff`)
Better Auth mounted on prod: session→principal bind, `__Host-` cookies (web→api auth proxy), tenant-scoped
`db`, `IDENTITY_HEADERS` non-prod only, origin guard, signup-account provisioning for OAuth/magic-link
user-create, `auth.mail` queue + placeholder-safe Resend handling, migration `0025_better_auth.sql`
(applied live: `[migrate] 25 migrations recorded`).

## Stage B live legs — evidence log

### 2026-09-17 — auth + estimate + first Review attempt
- Prod smoke: `https://api.rhema.tools/healthz` 200; `GET /projects` with the magic-link session cookie →
  `proj_prb16` visible under the fixture workspace (tenant-scoped read works through the real cookie path).
- Magic-link sign-in leg: `POST /api/auth/sign-in/magic-link` accepted; `auth.mail` pg-boss job carried the
  verify URL (Resend = placeholder → send is the deferred leg, D-* open); `verification` row written; the
  verify URL 302'd and set `__Host-rhema.session_token` (7-day). Session row asserts to the fixture
  user/workspace.
- Estimate leg: `POST /projects/proj_prb16/estimates` 200 — provisional 702cr/full lever matrix; run create
  re-derived server-side: `estimate_credits=415`, `cap_credits=623` (~$6.23 cap at $0.01/cr).
- Run 1 `01M2R2W9WKYXQG0JR95T58MAEP` (review/standard/balanced, `second_read:false`): 201 `queued` →
  worker consumed `run.start` → `provisioning`; SSE replayed `queued`→`provisioning` state events.
  **LIVE FINDING 1:** pod `InvalidImageName` — the launcher built `${imageRepo}@${imageDigest}` while prod's
  `rhema:runTaskImageDigest` carries the full `repo@sha256:…` ref → double-qualified image. Fix:
  `k8s-launcher.ts` accepts a fully-qualified ref verbatim (bare digest still joins repo+digest);
  regression test added. Worker rebuilt `worker@sha256:93d5dbe5…`, deployed (pulumi update 17).
- **LIVE FINDING 2:** the stranded sweep ran every minute but saw ZERO rows — every prod DB connection is
  `postgres`, and `postgres` is subject to FORCE RLS with `app.tenant_id` unset → the system-scoped scan was
  blind (dev had the same fix applied out-of-band, P0.15g `live-alter-rls.ts`). Applied
  `alter role postgres bypassrls` live; captured durably as migration `0026_system_bypassrls.sql`.
  The next `run.reap` tick failed the stuck run through the real code path — **D-P0.08-4 leg A now has live
  evidence**: `provisioning → failed` (`failure.code=provisioning_timeout`, `state_since` 16:48:31Z),
  hold 623cr released (`credit_ledger` `release:…#topup`), proxy credential `revoked_at` set, project writer
  lock cleared (`active_writer_run_id` → null). Orphaned Job deleted by hand.
- Run 2 `01M2R4KKQKF49EXCMMM5BH6WYZ`: pod pulled the image in 19s (finding 1 fixed — real pull) but the
  harness's first heartbeat to `api.rhema.tools:443` timed out. **LIVE FINDING 3:** `rhema:internalApiUrl`
  unset → `API_INTERNAL_URL` defaulted to the public origin, which sandbox egress denies (allow-list is only
  the PGA VIP + proxy). The intended path is the api's `*.run.app` URL — the prod private DNS zone maps
  `run.app` → `private.googleapis.com` VIP (199.36.153.8/30) and the api's ingress is
  `internal-and-cloud-load-balancing`. Set `rhema:internalApiUrl` to
  `https://rhema-prod-api-e745ce0-tkbl73n3tq-uc.a.run.app` (pulumi update 18). Run 2 left to the sweep.

## Open at last update
- Run 2 swept `failed` (provisioning timeout) pending; run 3 to be launched after the worker env rolls.
- Remaining legs: SSE tail, dossier rows, triage, editor read/write, Revise, Quick Voice, export, spend
  reconciliation, browser Google sign-in (operator step), Resend delivery (deferred — placeholder secret).
