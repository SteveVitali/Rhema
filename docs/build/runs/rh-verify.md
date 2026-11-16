# rh-verify — the handoff findings' read-only verdict pass (2026-11-15)

**Harness:** devin-desktop/swe-2-high/subagent · **Reconstructed 2026-11-16 (276_R6DOC.3).** The verify pass ran read-only at chain tip on
2026-11-15 against the operator handoff's findings note
(`rhema-boilerplate-findings-handoff/findings-note.md`, outside the repo; audited repo state
`39684e12`, wave-1 `ed7aef1d`/`40c3980a`). The pass's totals were recorded in the insert PR's
LEDGER line (GD-HANDOFF.R6 + the 2026-11-15 PHASE LOG entry) but this file was never committed —
the gap 276 closes. The verdict-to-carrier map below is reconstructed from the findings note and
the seeded tickets 266–277; it reports the same totals verbatim.

**Totals (as recorded in the LEDGER):** 34 CONFIRMED · 1 ALREADY-FIXED · 1 SUPERSEDED-residual ·
2 UNVERIFIED-DNS · 1 REFUTED-class — 39 verdicts over 41 rows; the two uncounted rows are
RH-17 (CONFIRMED, merged under RH-4's carrier) and RH-36 (INFO posture, not a defect verdict).

## Verdict table

| Finding | Verdict | Carrier |
| ------- | ------- | ------- |
| RH-0 — better-auth 1.7.2 exposed to GHSA-965c-763c-88jm (unauthenticated sign-in as any known email) | CONFIRMED (CRITICAL) | 266_R6SEC.1 (#345; deploy PREPARED-only per GD-SEC.R6) |
| RH-1 — merge-conflict markers committed in `infra/pulumi/Pulumi.dev.yaml` | CONFIRMED | 271_R6SEC.3 + repo-wide marker guard |
| RH-2 — `/billing/subscription/change-plan` grants new plan's included credits, no Stripe charge | CONFIRMED — live at tip (fence on #338 unmerged at verify time) | dated scope note on `D-R6FIX.5-1`; fence 263_R6FIX.13 (#338); residual `syncSubscription` arm → 272_R6BILL.3 |
| RH-3 — auto-reload off-session charge: no `Idempotency-Key`, per-minute key, charge/grant uncoupled | CONFIRMED | 269_R6BILL.2 |
| RH-4 — `account.hard-delete` delayed job: no watchdog/re-arm; non-transactional | CONFIRMED | 270_R6OPS.4 |
| RH-5 — email change gaps (dup pre-check 500, no old-address notice, no session revoke, unbranded HTML, plaintext `!==` token) | CONFIRMED | 270_R6OPS.4 |
| RH-6 — no DMARC (and no CAA) record on `rhema.tools` | UNVERIFIED-DNS — live `dig` owed in its ticket | 274_HUMAN (operator DNS act) |
| RH-7 — webhook sync: no event-ordering guard, no `Stripe-Version`, no `livemode` check, pre-basil field paths | CONFIRMED | 268_R6BILL.1 (with RH-9) |
| RH-8 — `ci-pass anchor` has no `if: always()`; a red leg leaves the required check `skipped` = passed | CONFIRMED | 267_R6SEC.2 (#347) |
| RH-9 — no pinned Stripe API version; code reads fields removed in `2025-03-31.basil`; first exposure ~first real renewal ~2026-11-27/28 | CONFIRMED — time-critical; read-only `api_version` check precedes code | 268_R6BILL.1 (#346) |
| RH-10 — non-prod apis trust forgeable `x-rhema-*` headers on public allUsers-invoker services | CONFIRMED | 267_R6SEC.2 (#347 — keyed shim) |
| RH-11 — `stripe_events` row commits before `queue.send`; stranded events never swept | CONFIRMED | 272_R6BILL.3 |
| RH-12 — period tick un-schedules cancellations | CONFIRMED — **worse than audited**: the tick writes `cancel_at_period_end=false` while granting | 272_R6BILL.3 |
| RH-13 — `purchaseMode=closed` also blocks Customer Portal for paying customers | CONFIRMED | 272_R6BILL.3 |
| RH-14 — `subscription.deleted` dropped silently when the account can't be resolved | CONFIRMED | 272_R6BILL.3 |
| RH-15 — invoice `period_start`/`end` stored as the subscription period (fixtures encode the same wrong shape) | CONFIRMED | 272_R6BILL.3 |
| RH-16 — unverified request email → Checkout `customer_email` | CONFIRMED | 272_R6BILL.3 |
| RH-17 — `account.hard-delete` enqueue failure swallowed (`settings-routes.ts:654`) | CONFIRMED — merged under RH-4 (not separately counted) | 270_R6OPS.4 |
| RH-18 — `singletonKey` never dedupes (every queue `standard` policy) | CONFIRMED | 270_R6OPS.4 |
| RH-19 — stale `building` export row wedges all later exports | CONFIRMED | 270_R6OPS.4 |
| RH-20 — the ADR-054 availability burn-rate alert does not exist | CONFIRMED | 273_R6OPS.5 |
| RH-21 — Error Reporting "probably ingests no ADR-053 lines" | SUPERSEDED-residual — wave-2 correction: it DOES ingest (groups exist live); residual = `serviceContext.version` = git SHA | 273_R6OPS.5 |
| RH-22 — no uptime check or absence alert | CONFIRMED | 273_R6OPS.5 |
| RH-23 — web-host mutations have no Origin / `Sec-Fetch-Site` / CSRF check (BFF path bypasses the api's Origin guard) | CONFIRMED | 275_R6WEB.1 |
| RH-24 — gitleaks globally allowlists `docs/.*` | ALREADY-FIXED — 265_R6PRIV.1 (#342) replaced it with targeted justified entries; full-history scan green | closed at verify |
| RH-25 — `.gcloudignore` doesn't exclude `.env*` | CONFIRMED | 271_R6SEC.3 |
| RH-26 — third-party Actions pinned by mutable tags in jobs holding `id-token: write`, prod SSH key, BYPASSRLS DSN; `StrictHostKeyChecking=no` | CONFIRMED | 271_R6SEC.3 |
| RH-27 — all 14 prod alert policies notify only a log-writing webhook; no human is paged | CONFIRMED (HIGH) | 273_R6OPS.5 (code) + 274_HUMAN (phone pairing) |
| RH-28 — Resend `send` MX record missing on `rhema.tools` | UNVERIFIED-DNS — live `dig` owed in its ticket | 274_HUMAN (Squarespace DNS + Resend re-verify) |
| RH-29 — previews copy secret values into Pulumi stack state and send with the prod Resend key | CONFIRMED | 271_R6SEC.3 |
| RH-30 — CSP nonce stamped by regex onto every `<script` in served HTML | CONFIRMED | 275_R6WEB.1 |
| RH-31 — magic-link emails hit Better Auth's GET `/magic-link/verify` which consumes the token (scanner burn) | CONFIRMED | 275_R6WEB.1 |
| RH-32 — `acquisition_events.ip_hash` = unsalted sha256 of a client-controlled XFF hop | CONFIRMED | 275_R6WEB.1 |
| RH-33 — `next` prefix check admits backslash off-origin paths | CONFIRMED | 275_R6WEB.1 |
| RH-34 — deep links opened signed-out lose their target (`next` not carried) | CONFIRMED | 275_R6WEB.1 |
| RH-35 — prod Cloud SQL `sslMode: ALLOW_UNENCRYPTED_AND_ENCRYPTED` | CONFIRMED | 271_R6SEC.3 |
| RH-36 — INFO: HSTS depends on `x-forwarded-proto` | INFO — posture item, confirmed as described; no ticket carrier | BL-135 (recorded by 276) |
| RH-37 — no scoped `CLAUDE.md` bridges; agents that read `CLAUDE.md` miss the 11 scoped `AGENTS.md` files | CONFIRMED | 276_R6DOC.3 (this ticket) |
| RH-38 — root + `apps/web/AGENTS.md` ≈ 30 KiB vs the 32 KiB read cap; web Critical Gotchas last | CONFIRMED | 276_R6DOC.3 (this ticket) |
| RH-39 — `apps/api/AGENTS.md:62-63` frames the unkeyed header fallback as acceptable | CONFIRMED | 267_R6SEC.2 rewrites it; 276 adds the dated superseded note on the unmerged base |
| INFO — R6FIX.12 fix commit `96730839` not an ancestor of `main` | REFUTED-class — the fix merged as #337 (squash `040e36a9`, 2026-11-15); the SHA itself stays off-main by squash, which is expected | closed at verify |

## Reference (not tracked work)

- **Upstream better-auth owner race (INFO):** concurrent org-owner changes can leave an org with
  no owner (count-then-write race, reasoned not reproduced; N-D2 BA-D2-1). Upstream issue, kept
  here for reference — no Rhēma carrier, no BL row.
- **"Not Rhēma" operator items** (stray GCP project `pr-23aed7d73660bf80`, Episteme ruleset
  admin bypass + release records, `episteme.live` expiry 2027-01-07, Eleutheria monitoring drift):
  carried verbatim on HUMAN row 274 for the operator, not verified by this pass.
- The handoff's LOW/info catch-all list is recorded as `rh-low`-tagged BL rows by 276_R6DOC.3
  (BL-116…BL-135); the verify/fix sweep itself is 277_R6LOW.1.

## Method note

The pass re-read each finding's cited lines at the then-current tip; the note's "agent-reported"
items were treated as hypotheses. Two corrections were recorded with the totals: **RH-12** is
worse than audited (the tick actively rewrites `cancel_at_period_end=false` while granting), and
**RH-2**'s fence (`403 change_plan_unavailable`) sits on unmerged #338 — the grant is live at tip
until it lands. Nothing here was exercised live; DNS items are explicitly UNVERIFIED pending the
operator-visible `dig` in 274.
