# ACT.1 — The trial entitlement, honoured (and every trial/pricing claim rendered from it)

A fresh account's first Standard/Base Review is now **honoured** end-to-end: the run sheet finds
the `locked` entitlement (not just `unused`), renders **Included** with the configured word cap,
and the Run POST carries `entitlementId` + a device fingerprint into the first-spend gate —
unlock → claim → entitlement-funded run with **0 credits debited**. Every trial figure a user
reads derives from one typed config (`PRICING.trial`): the cap is `deriveTrialWordCap`'s fit on
ECON.1 measured cost cards under the provisional **$15** absorbed-COGS ceiling (**2,800 words**,
zero cap deaths at that point), never a hand-typed string. First-spend abuse checks (fingerprint
binding — test tenants excluded — disposable domains, a conservative unbound-ASN arm, the account
kill switch), **one concurrent trial run**, Base-only trial enforcement, and a **$50/day** trial
COGS kill switch (projected at claim + reconciled by sweep, never under-counted) are all live.
Trial go-live is **audience-gated** (`off | test_tenants | everyone` — shipped at `test_tenants`;
the everyone-flip is the operator's, diff recorded). HOT.1's hidden trial claim re-enables
*through* the fold — uncovered viewers provably see no trial claim — and the pricing page's PR-U6
defects are fixed (no all-dash row, plan-named CTAs, Team `$40/seat/mo` + waitlist).

Ticket: `docs/tickets/70_ACT.1__trial-entitlement.md` (chain row 70, round 3).
Base: `stevevitali/sec-2-signup-admission-throttle` @ `61f64c2` (stacks on the SEC.2 tip).
Merge policy: **OPERATOR — do not merge.**
ADRs: **ADR-042** (trial config as the single spec + the projected-plus-reconciled daily tally),
**ADR-043** (the audience gate + the claim render model UX.1/ECON.2 consume).
Requirement ids: **REQ-SPEC-8** (amended — interim trial), **REQ-GROWTH-10** (trial engine),
**REQ-GROWTH-15** (throttle half — fingerprint binding), **REQ-SPEC-32(b)** (claims half),
**REQ-GROWTH-13** (pricing truth), **REQ-BILL-4** (entitlement half — sheet is the only paywall,
Included shows no dollar figure), **REQ-GROWTH-7** (display — Team seats + waitlist).
Deferrals: **D-ACT.1-1** (unbound ASN scorer — operator credential arm; fingerprint + disposable
+ kill-switch compensate), **D-ACT.1-2** (Stage B live legs), **D-ACT.1-3** (everyone-flip —
operator's pause, diff below); **D-P1.16-1 leg (h)** annotated (entitlement-claim copy surfaced).

## The defects

- **The sheet couldn't see a locked entitlement.** Signup provisions `locked`; the sheet only
  queried `unused` — so a new account's run sheet priced its included Review in dollars and the
  ledger had no `entitlementId` to claim against anyway (the Run action never forwarded one).
- **The Run POST never sent a fingerprint** — the unlock gate's first-spend checks had no device
  signal to bind.
- **Every figure was duplicated by hand** — cap, pocket, ceiling, and note text lived in copy
  strings across landing/pricing/billing/sheet, each one a stale-claim bug waiting to ship.
- **Pricing page (PR-U6):** an all-dash "Run word cap" row, generic "Choose plan" CTAs, and Team
  rendering "$/mo Annual" with no per-seat price or waitlist.
- **The $50/day switch counted only projected spend** — a run metered higher than its estimate
  never raised the tally; and `trial_spend_daily` had no sticky pause marker.

## What changed

**Config is the spec (ADR-042).** `packages/contracts/src/domain/pricing.json`'s trial block now
carries the entitlement shape (`kind:review`, `wordCap:2800`, `rigor:standard`, `modelTier:base`),
`capCeilingUsd:15`, `dailyCeilingUsd:50`, `audience:"test_tenants"`, `interim:true`,
`projects:3`, `concurrency:1`, and note **templates** (`{cap}`/`{pocket}`/`{chatCredits}`
placeholders — `pricing.ts`'s load-time `validate()` refuses a literal digit inside any template).
`dailySpendCeilingCredits` derives as `ceil($50 × 1.4 × 100) = 7,000` proxy credits.
NEW `trial-claims.ts`: `trialAudienceAllows`, `claimsForAudience` (the fold — `audience` decides
whether `trial.firstReviewIncluded` reaches a viewer), `trialIncludedNote`, `trialPostTrialNote`,
`sheetEntitlementLine`, and **`deriveTrialWordCap`** — scans evaluated cost points, takes the
largest word count whose p90 fits the ceiling, ignores non-finite points, honours bounds, and
returns a **named `below_floor`** (operator pause) under `TRIAL_CAP_FLOOR_WORDS` = 1,500.

**Sheet → claim.** `sheet-context` selects `locked` ∪ `unused`, not-killed, in-window, and
audience-covered entitlements; emits config `wordCap` + the row `id`. `view.ts` /
`ui/run-sheet.tsx` render **Included** + the generated cap line and post `entitlementId` hidden.
Web mints `rhema_fp` (HttpOnly · SameSite=Lax · Secure-on-https · 1y) on the run-sheet GET and
forwards the raw fingerprint on Run POST; the api stores only the salted hash (`rhema:trial:`).

**First-spend gate (deterministic).** `run-routes` refuses by name, in order: audience-uncovered
`422 entitlement_unavailable` (before unlock — no audit row), `trial_base_only`, `trial_shape`,
`trial_word_cap`, `phone_challenge_required` 403, `trial_ceiling` 429, `trial_denied` 403.
`gateTrialUnlock` counts fingerprint bindings owned by **non-test** workspaces only (JOURNEY.1's
harness can't starve the trial); a second ordinary account on one fingerprint still denies.

**$50/day, projected + reconciled.** Migration `0051` adds `trial_spend_daily.reconciled_credits`
+ `paused_at`. The entitlement hold books the **projection** (`HoldArgs.projectedCredits` ←
`estimateCredits`) in-transaction, refuses on a paused day or `max(credits, reconciled) > ceiling`,
and exempts `is_test` workspaces. NEW `sweepTrialSpend` (system-pool, wired into
`handleBillingPeriodTick` — REQ-SPEC-30: the aggregate never serves a user request) recomputes
`Σ greatest(spent_credits, estimate_credits)` over today's non-test entitlement runs into
`reconciled_credits` and sticks `paused_at` for the UTC day. The account kill switch voids a
pending trial on read. RES.2's hook restores `consumed → unused` exactly once with a
`trial_restorations` audit row.

**Claims & pages.** `/billing/plans` resolves `claimsForAudience(…, isTestWorkspace)` —
`includedNote` transmits `null` to uncovered viewers; `GET /session` reports `isTest`; web `/` +
`/pricing` preview trial claims to a flagged tenant via `?audience=test` only. `pages.tsx`
renders `trial_pending` (Included badge + generated note + eligibility line when covered;
factual window line otherwise) — the "Free — chat only" state that spawned this ticket cannot
render for a covered trial account. The pricing page drops all-dash rows, names plans on paid
CTAs, and Team shows `$40/seat/mo` + waitlist. `runSheet` copy covers every named refusal —
placeholders, never literals.

**Journeys (flags stay `expected:"red"` — Stage B flips on evidence).** N5: fresh test user →
scratch project (≤300-word fixture) → Included carrying the configured cap → `entitlementId` in
the form → launch → dossier-poll to delivery. C1: anonymous `/` + `/pricing` carry no trial
claim; the test tenant's `?audience=test` renders config figures on both. `@rhema/journeys` gains
the explicit `@rhema/contracts` dep so legs read shipped config, never literals.

## Verify

`turbo build lint typecheck` — **46/46** across the touched packages. Scoped `vitest` runs — all
green: **contracts** incl. NEW `trial-claims.test.ts` (12 — derivation fits, below-floor, bounds,
non-finite, audience fold, generated notes); **ledger** `trial.test.ts` (**24** — +sweep
reconciliation, paused-day stickiness, max(projected,reconciled), test-tenant exemption);
**api** `run-routes.test.ts` (**57** — audience-pause refusal, named shape/cap/ceiling/phone
refusals, exemption coverage), `billing-routes.test.ts` (audience-folded DTO), `signup.test.ts`;
**web** `claims-visibility.test.ts` (5 — folding + redaction through the real api path);
**security-checks** launch-surface (29) + secrets-manifests (11); journeys (29);
run-sheet/ui/worker/api-client/orchestrator; `check-additive-migrations` (+0051);
`check:licenses` (609) + `check:protocol-markers` clean. RES.2 restore proven by
`unverified-settle.test.ts` (exactly-once + audit row + `trial_active`).

**The everyone-flip (D-ACT.1-3 — recorded for the operator):**
```diff
-    "audience": "test_tenants",
+    "audience": "everyone",
```
plus re-running `deriveTrialWordCap` against the then-current cost cards (`pnpm vitest run
packages/contracts` fails the config if the published cap no longer equals the derivation under
`capCeilingUsd`). No code deploy; no migration.

## Owed (operator-paused — never silently skipped)

- **Stage B (D-ACT.1-2):** apply `0051` (additive, verified), deploy api+web+worker, walk N5 on a
  JOURNEY.1 flagged tenant (≤300-word fixture → Included → delivery), C1 audience proof ($0), one
  near-cap trial Review on a claim-light fixture — cumulative metered ≤ **$12** (aim ≈$6); stop
  and `D-ACT.1-n` any leg that would breach.
- **ASN arm (D-ACT.1-1):** the scorer binding ships as a stub denied-never; wiring a vendor needs
  an operator credential.
- **Real-user go-live (D-ACT.1-3):** the diff above is the entire change; the flip is the
  operator's.
