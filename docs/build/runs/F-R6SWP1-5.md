# F-R6SWP.1-5 — the prod magic-link limiter is below journey-suite demand (findings work, run ledger)

- **Spec:** LEDGER OPEN FINDINGS `F-R6SWP.1-5` + `runs/R6SWP.1.md` (the finding's recorded options;
  worker brief: prefer option (a) — exempt `test+*@rhema.tools` from the magic-link send limiter),
  plus the NON-secret half of `F-R6SWP.1-4` if engineering-shaped (the T8 recurring-mint leg).
- **Normative loads:** `docs/tickets/DEFERRALS.md` (read first — nothing in blast radius flips);
  `apps/api/AGENTS.md`; `packages/journeys/AGENTS.md`; ADR-039/040/041 (shared-store throttles +
  the never-unlimited degrade posture); `packages/ledger/src/test-workspaces.ts` (`matchesTestMailbox`,
  the ADR-020 flag predicate); `docs/tickets/69_SEC.2__signup-admission-and-throttle.md` family.
- **Base:** `origin/main` @ `5e0e87e` · **Branch:** `stevevitali/f-r6swp1-5-limiter`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory + self-review
- **Requirement ids stamped:** REQ-BETA-19 REQ-SPEC-29 (the throttle + the test-tenant class)
- **Started:** 2026-10-29T21:0xZ
- **Live stage:** none — code + deterministic tests; live re-proof rides the next scheduled/dispatch
  nightly on `main` post-merge (provenance refuses non-`main` refs; merge is OPERATOR).
- **Production mutations:** none.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). No OPEN row is unblocked by this ticket's scope —
the journeys-adjacent rows (D-OBS.1-3, D-SPA.28-1) owe the *literal scheduled-nightly* arm, which a
code change can only make POSSIBLE, not prove (still OPEN, dated tails carried by the watch stream).

## Requirements

1. Root-cause the limiter's exact shape on the send path (done — below).
2. Pick the honest option; record the security reasoning explicitly.
3. Implement + deterministic tests: the test-alias prefix rides its own bucket ONLY at the exact
   `matchesTestMailbox` boundary; real third-party addresses keep the production limits; normal
   signups unaffected.
4. F-R6SWP.1-4's NON-secret half (the `JOURNEY_T8_EXPORT_TOKEN` recurring-mint): implement a
   workflow-side self-supply if one exists without a secret/posture ruling; else record honestly.
5. Do NOT wire `JOURNEY_DATABASE_URL` into repo secrets — a prod DSN in GitHub secrets is an
   operator posture ruling (recorded as an ask, not done).
6. Records: this ledger + `pr/F-R6SWP1-5.md` + PR + BUILD_INDEX row 236 + LEDGER (finding →
   RESOLVED-IN-CODE or honest state; PHASE LOG; `nextTicket` stays `200_R6WATCH.1`) + GATE-LAUNCH
   threshold-6 dated note.
7. Verify: `pnpm turbo build lint typecheck` + `pnpm test` touched; `check-build-memory.sh .` 0
   violations; `check-append-only.mjs --base 5e0e87e` OK; `ci-boundary.sh` after push.

## Root cause (measured, not assumed)

Each session-minting leg's `/signup` form submit crosses **TWO** shared Redis throttles on the api
(web BFF → api, OIDC-stamped client IP = the single GitHub-runner IP):

- `POST /signup` → `rl:signup` (`SIGNUP_THROTTLE_DEFAULTS` perIp=10, perEmail=5, 1 h) —
  `apps/api/src/signup.ts:331` counts EVERY attempt before admission.
- `POST /api/auth/sign-in/magic-link` → `rl:magiclink` (`MAGIC_LINK_THROTTLE_DEFAULTS` perIp=20,
  perEmail=4, 1 h) — `apps/api/src/auth.ts` `hooks.before` send gate.

The suite mints ~20+ sessions per run — nightly 40876457031 (schedule, `ea7d8f2`) shows the shape
verbatim: 13 legs failed on `signup for test+…@rhema.tools … "Too many attempts"` — fresh
`test+j<nonce><tag>` identities (distinct emails ⇒ the **per-IP** dims bind: 10/h `rl:signup` trips
first, 20/h `rl:magiclink` second; retries count too) AND stable `test+jrn-b` legs (X1.* ×5 ⇒ the
perEmail=4 send dim also binds). An isolated nightly can NEVER go green: the finding's "magic-link
send limiter" wording understates it — the account-creation bucket (`rl:signup`) binds even sooner.

## Option analysis

- **(a) exempt `test+*@rhema.tools` — CHOSEN, amended to a bounded dedicated bucket.** The recorded
  security reasoning is sound: every address in the exemption class delivers to OUR OWN pinned DWD
  test mailbox (`test@rhema.tools` catch-all), so the third-party email-bombing surface the limiter
  exists to close cannot open — an attacker pointing the send at `test+anything@rhema.tools` can
  only mail-bomb us, never a victim. Two refinements over the finding's literal text:
  (i) the exemption must cover BOTH buckets the submit crosses (`rl:signup` account-creation AND
      `rl:magiclink` send) — exempting only the send still trips `rl:signup` perIp=10 at leg ~10;
  (ii) instead of a full skip, test identities count on their OWN higher-ceiling shared bucket
      (`rl:testidentity`, perIp=240, perEmail=120, 1 h ≈10× suite demand). ADR-039's never-unlimited
      posture holds — the exemption moves the ceiling, never removes it. Residual honestly bounded:
      a hostile caller can still churn bounded test+ account rows (all `is_test`-flagged, 26 h-purged,
      0-credit, unverifiable — the link goes to our mailbox) + enqueue mail to our own mailbox, at
      ≤240/IP·h — self-targeted only.
- (b) runner-side pacing — rejected: a throughput workaround, not a policy fix; ~20+ mints at ≥4–5/h
  means multi-hour suites or multi-day windows — structurally unworkable.
- (c) pre-minted session fixtures — rejected for the fresh-identity legs: `test+j<nonce>` signups
  are the new-visitor JOURNEY under test; caching them away defeats the legs' assert object. The
  stable-identity legs already cache storageState; the cache just can't survive fresh CI checkouts.

## Acceptance criteria

- [ ] `test[+<tag>]@<TEST_MAILBOX domain>` sends + creations count on `rl:testidentity`, not the prod
      buckets, at the exact `matchesTestMailbox` boundary (near-misses — `test+x@other.test`,
      `tesseract@rhema.tools`, `test@rhema.tools.evil` — stay prod-limited) *(engineered)*
- [ ] Real addresses keep the production limits unchanged; no `testMailbox` configured ⇒ no
      exemption anywhere (fail-closed default) *(engineered)*
- [ ] The test bucket still bounds (never unlimited) *(engineered)*
- [ ] Invite/mode admission is NOT exempted — only the throttle bucket selection *(engineered)*
- [ ] Live re-proof rides the next nightly on `main` post-merge *(live-executed — carried,
      provenance refuses branch dispatches)*

## Test matrix

- `auth.test.ts`: test+ send past the prod email limit still sends + prod bucket untouched; boundary
  near-misses prod-limited; unbound testThrottle/unset testMailbox ⇒ prod limits (safe default); the
  test bucket itself still 429s past its own ceiling; the verify-create leg rides the test bucket.
- `signup.test.ts`: test+ signups past the prod perIp limit still create; real emails stay limited;
  near-misses prod-limited; unbound ⇒ prod limits; test bucket still bounds.

## Plan

1. `auth.ts`: `AuthAdmission` + `testMailbox`/`testIdentityThrottle` + `TEST_IDENTITY_THROTTLE_DEFAULTS`;
   throttle selection in `user.create.before` + the send gate.
2. `signup.ts`: `SignupApiDeps.testIdentityThrottle`; selection in `POST /signup`.
3. `index.ts`: `BetaApiDeps.testIdentityThrottle` + wiring into `createSignupRoutes`.
4. `server.ts`: shared+fallback `rl:testidentity` throttle; bind into `admission` + app deps.
5. Tests per the matrix; build/lint/typecheck/vitest.
6. F-R6SWP.1-4 T8 half → disposition (needs operator ruling — record); records + PR + close.

## Progress

- 2026-10-29T21:0xZ — branch cut at `5e0e87e`; finding + R6SWP.1 ledger + DEFERRALS read; root cause
  confirmed against nightly 40876457031's `report.json` (13 legs 429'd on `test+` signups; fresh AND
  stable identities — both `rl:signup` and `rl:magiclink` dims bind).
- Option picked: (a) amended — dedicated bounded test bucket on BOTH admission throttles.
- Implementation landed: `auth.ts` (`AuthAdmission.testMailbox`/`testIdentityThrottle` +
  `TEST_IDENTITY_THROTTLE_DEFAULTS` 240/120/1h + `admissionThrottle` selection at BOTH create and
  send gates), `signup.ts` (`SignupApiDeps.testIdentityThrottle` + selection in POST /signup),
  `index.ts` (`BetaApiDeps.testIdentityThrottle` + wiring), `server.ts` (`rl:testidentity`
  shared+fallback throttle bound into `admission` + app deps). ADR-124 records the amended
  option-(a) decision. 10 new deterministic tests (6 auth + 4 signup) — all green.
- Verify: `vitest apps/api/src` 46 files / 575 pass · `turbo build lint typecheck` 135/135 ·
  `pnpm --filter @rhema/api lint`+`typecheck` clean. `pnpm format` is pre-existing repo-wide red
  (1,128 files at base — recorded, not caused; my new files are prettier-clean).

## Gap table

| requirement / AC | layer | state | evidence |
|---|---|---|---|
| Root-cause the limiter's shape | engineered | **MET** — two shared buckets bind per mint: `rl:signup` (POST /signup, perIp=10/perEmail=5) + `rl:magiclink` (send gate, perIp=20/perEmail=4); nightly 40876457031 report.json shows fresh+stable test+ identities 429'd | signup.ts:339 · auth.ts send gate · report.json census |
| test+ sends/creations ride `rl:testidentity`, not the prod buckets | engineered | **MET** — `admissionThrottle()` selects on `matchesTestMailbox` at all three call sites; tests assert prod buckets untouched | auth.ts `admissionThrottle` · signup.ts POST /signup · auth.test.ts/signup.test.ts |
| Exact boundary — near-misses stay prod-limited | engineered | **MET** — `test+x@other.test`, `tesseract@rhema.tools`, `test@rhema.tools.evil` all prod-limited in both suites | auth.test.ts "boundary is exact" · signup.test.ts "near-miss aliases" |
| Real addresses unchanged; unconfigured ⇒ no exemption | engineered | **MET** — prod limits intact (real email 429 legs); no testMailbox/bucket ⇒ prod bucket (fail-closed) | both test files' safe-default legs |
| Test bucket still bounds (never unlimited) | engineered | **MET** — dedicated bucket 429s past its own perIp ceiling | auth.test.ts + signup.test.ts "still bounds" legs |
| Admission NOT exempted (throttle only) | engineered | **MET** — invite mode still refuses a test+ send with no code (403); the exemption is bucket selection only | auth.test.ts "exemption lifts ONLY the throttle" |
| F-R6SWP.1-4 non-secret half (T8 recurring mint) | record | **MET-DIFFERENTLY → operator-gated, recorded** — every self-supply channel (in-workflow `mint-t8-export.mjs --execute`, admin-cli) reduces to a system-role prod DSN in GitHub secrets + an authorized recurring prod write — TWO rulings, not zero. Shrinking path recorded: one-time re-mint on the purge-exempt `test+jrn-a` tenant + bind `JOURNEY_T8_EXPORT_TOKEN` (harmless value — only ever yields 410); full automation recipe recorded, not committed | see "F-R6SWP.1-4 disposition" below |
| `JOURNEY_DATABASE_URL` NOT wired | scope | **MET** — nothing added to repo secrets; recorded as the operator ask it is | F-R6SWP.1-4 disposition |
| Live re-proof | live-executed | **carried** — provenance refuses non-`main`; rides the next scheduled/dispatch nightly post-merge (orchestrator triggers) | recorded |

## F-R6SWP.1-4 disposition (non-secret half)

The T8 leg's 410 arm needs a backdated `account_exports` row; the token is hash-only stored, so a
live expired token exists ONLY via a system-role DB write (`scripts/live/mint-t8-export.mjs
--execute`). Every self-supply channel — an in-workflow mint step, the admin-cli — reduces to **a
system-role prod DSN in GitHub secrets PLUS an authorized recurring prod write**. That is two
operator posture rulings, not engineering work: nothing was implemented here, honestly.

What CAN shrink the recurring-mint burden without any secret: re-mint **once** on the
purge-exempt funded stable tenant (`test+jrn-a` — `JOURNEY_FUNDED_STABLE_TAG=a`, the tenant
`funded-tenant.mjs` keeps `created_at`-fresh) and bind `JOURNEY_T8_EXPORT_TOKEN` as a repo secret
or variable. The value is harmless — it only ever returns `410 export_link_expired`. The first
mint (`t8exp_1f9832…`, 2026-10-22) died when its tenant reaped under the 26 h sweep; the exempt
tenant's row survives indefinitely, making the bind one-time rather than recurring.

Full-automation recipe, recorded not committed (needs both rulings): a self-gating journeys.yml
step `if secrets.JOURNEY_SYSTEM_DATABASE_URL bound → node scripts/live/mint-t8-export.mjs
--execute → echo JOURNEY_T8_EXPORT_TOKEN=$TOKEN >> $GITHUB_ENV` before the suite step. The
system-role DSN ask is strictly stronger than the `rhema_app_login` read-pool ask F-R6SWP.1-4
already records — hence flagged, not shipped.

`JOURNEY_DATABASE_URL` (app-login read pool for R6F/T7/T12F/T13F): unchanged — operator posture
ruling; NOT wired (per brief).

## Evidence log

- `vitest run apps/api/src/auth.test.ts apps/api/src/signup.test.ts` — 49/49 pass (incl. 10 new).
- `vitest run apps/api/src` — 46 files / 575 pass.
- `pnpm turbo build lint typecheck` — 135/135 tasks.
- `pnpm --filter @rhema/api lint` / `typecheck` — clean.
- `pnpm format` — pre-existing repo-wide red (1,128 files dirty at base incl. the 6 touched;
  unchanged in count by this diff's intent — the touched files were already non-clean; new docs
  are prettier-clean). Recorded as an unrun-enforcement finding, not caused.
- Nightly 40876457031 `report.json` — 13 `test+` 429 legs (the measured demand shape).

## Evidence report

**Option chosen: (a)** — amended to a *dedicated bounded bucket* (`rl:testidentity`,
240/IP·120/email·h) covering BOTH admission throttles the mint crosses, per ADR-124. Verdict:
**RESOLVED-IN-CODE** — deterministic tests prove test+ identities route off the prod buckets at
the exact `matchesTestMailbox` boundary while real addresses keep every limit; live re-proof rides
the next nightly on `main` post-merge (provenance refuses branch dispatches; merge is OPERATOR).
