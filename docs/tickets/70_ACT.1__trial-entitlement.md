# ACT.1 — The trial entitlement, honoured (and every trial/pricing claim rendered from it)

- **Sequence:** 70 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** money
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** SEC.2, EST.1, ECON.1, RES.2, HOT.1
- **Scope (one line):** a new account's first Review shows *Included* and runs on the §14.3 entitlement — Standard/Base, with a word cap derived from ECON.1's post-RES.1 cost cards under the provisional $15 absorbed ceiling (zero cap deaths at that cap) — behind the first-spend unlock checks, a $50/day metered trial kill switch, 1 concurrent, Base-only, restored when its Review is *Unverified*; ACT.1 owns the claim render model (landing, pricing, trial claims) and fixes the pricing-page content defects; go-live for real users is operator-paused.
- **Spec §§:** 14.3 (+ the 2026-09-30 banner), 14.2 (Free column, "Run word cap", "What it covers"), 5.6 item 9 (the *Included* sheet), 14.4 (no consent / cap arithmetic on an entitlement run), 15.1 (hero line), 15.2 (pricing page; eligibility line), Appendix A.9 note (REQ-SPEC-8 amended)
- **REQ coverage:** REQ-SPEC-8 (amended; primary), REQ-GROWTH-10 (primary), REQ-GROWTH-15 (primary), REQ-SPEC-32(b) (claims half), REQ-GROWTH-13, REQ-BILL-4 (entitlement half), REQ-GROWTH-7 (Team waitlist display) (stamp in the PR)
- **Absorbs (backlog):** BL-50 (PR-J1), BL-62 (PR-U6 content half — all-dash rows, "Start free" on paid CTAs, Team "$/mo Annual")
- **Run:** `implement-spec spec=docs/tickets/70_ACT.1__trial-entitlement.md`
- **Gate status:** **trial go-live** for real users is operator-paused — a change to what users are charged (ADR-013/014); if the derived word cap falls below 1,500 words the **operator sets the ceiling**; retuning the kill switch away from $50/day is the operator's; rewriting existing accounts' entitlement rows is a one-off prod data write → operator-paused (design so it is unnecessary); a phone-OTP or ASN vendor needing a new third-party credential → operator-paused (else a `D-ACT.1-n` row); the Stage B runs use JOURNEY.1's test tenants + test mailbox (HUMAN-H7)
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy (pre-authorized if the preview is clean and migrations are additive) + the N5 trial Review on JOURNEY.1's ≤300-word fixture + one trial Review near the derived word cap, test tenants only, ≤$12 metered in total


> **Amended 2026-09-30 (operator — round-3 spend limit: hard ≤ $200, target ≤ $100):** this ticket's Stage B metered spend cap is **≤ $12** (was ≤ $20); aim for ≈ $6. Run legs cheapest-first and stop once the acceptance evidence suffices; where a leg plan below sums past the new cap, drop the lowest-priority legs and record each dropped leg as a `D-ACT.1-<n>` row (never overspend). The orchestrator pauses the chain when round-3 cumulative metered spend reaches $100 and hard-stops at $200 (LEDGER GATE DECISIONS 2026-09-30, D6 revised).

## Goal
The landing says "No card. Your first review is included." and pricing says "One Review of up to 6,000 words, Standard
rigor, Base — on us". The fresh account created on 2026-09-30 had 0 spendable credits. Its billing page read "Free —
chat only", and every run sheet blocked on "This run's cap … is more than your spendable balance" (PR-J1, REQ-SPEC-8
violated).

The P1.16 trial engine exists, but the product never reaches it. Three causes to re-confirm in the code:
- **The sheet cannot see the entitlement.** The sheet context only sees `unused` entitlements, while signup creates them
  `locked`.
- **The Run click never enters the gate.** It forwards neither `entitlementId` nor a device fingerprint, so the unlock
  gate never runs.
- **The tier is wrong for a trial account.** The sheet sent Balanced at Standard, which the api refuses as
  `trial_base_only` inside the trial. EST.1 fixed the derivation; ACT.1 proves the path end to end.

The shipped §14.3 terms also cannot hold at measured COGS (ADR-014). This ticket therefore:
- honours the entitlement on the **interim terms** (REQ-SPEC-8 amended);
- bounds each trial and each day;
- renders every trial, landing and pricing claim from the one entitlement config and EST.1's estimator, so copy and
  mechanics are the same sentence.

## Load (read these — do not re-read others)
- `docs/build/planning/2026-09-30_planning-ledger.md`:
  - row 70
  - § Shared decisions: ACT.1 owns the claim render model and the entitlement config, and consumes ECON.1's cost cards,
    EST.1's API, HOT.1's `claims` config and RES.2's refund class / trial hook.
  - § Journey step registry: N5, C1.
- `docs/build/reports/2026-09-30_prod-design-review.md`: PR-J1, PR-U6, PR-E5 and "Process findings" #5.
- `docs/adr/ADR-014-…` §5 (interim trial terms — the constraint set), ADR-015 §3 (restore on *Unverified*), ADR-016.
- Spec §14.3 (the parameter table, the state machine, the REQ-SPEC-8 paragraph), §14.2, §5.6 item 9, the Appendix A.9
  note.
- Landed run ledgers + ADRs of **ECON.1** (the p90 metered list COGS per word band for Standard/Base, post-RES.1),
  **EST.1** (the surface API), **RES.2** (the *Unverified* hook, the refund reason code), **HOT.1** (the `claims`
  config).
- Code (anchors — re-confirm at build time):
  - `packages/ledger/src/trial.ts`: ~45–72 `provisionTrial` (entitlement `locked`, `word_cap` frozen on the row from
    `TRIAL.entitlement.wordCap`); ~90–170 `gateTrialUnlock` (ceiling `spentToday >= TRIAL.dailySpendCeilingCredits`);
    ~240–251 `recordTrialSpend` (charges *estimated* credits at price); ~378 `killTrial`; ~410 `trialEntitlementFor`.
  - `packages/contracts/src/domain/pricing.json` ~107–120: `dailySpendCeilingCredits: 250000` ($2,500/day at price, vs
    ADR-014's $50/day of metered list COGS); `includedNote`/`eligibilityLine` hand-written. `pricing.ts` ~144–146
    asserts `wordCap === 6000`.
  - `apps/api/src/sheet-context.ts` ~97–104: `state = 'unused'` only.
  - `apps/web/src/server.ts` ~3359–3434 `POST /p/:project/run`: no `entitlementId` and no fingerprint passed to
    `createRun`.
  - `apps/api/src/run-routes.ts`: ~56–76 disposable list + fingerprint hash; ~131 `asnRiskScorer` (unbound in prod);
    ~355–449 the plan and trial gates (`trial_base_only`, `trial_shape`, `trial_word_cap`, `trial_ceiling`).
  - `packages/ui/src/run-sheet.tsx` ~270–280: the *Included* render.
  - `apps/web/src/copy.ts`: ~1408 `freeNote` "Free — chat only…" (billing ignores the trial state), ~1961 hero
    `trialNote`, ~2043 FAQ, ~2084 `trialRuleFmt`.
  - `packages/contracts/src/domain/pricing-page.ts` ~187–210 `planLadder` (`freeNotes`), ~220–266 `pricingMatrix`
    ("Run word cap" is "—" for every plan: `runWordCap` is null); `apps/web/src/marketing.tsx` ~255–258 plan price
    (Team), ~281 `COPY.pricing.startCta` "Start free" on every non-waitlist card, ~288 the trial rule line.

## In scope — deliverables
1. **The entitlement config** (REQ-SPEC-8 amended). One typed, versioned config: kind Review, rigor Standard, tier Base;
   `wordCap` derived by a pure, tested function from ECON.1's cost cards — the largest cap whose p90 metered list COGS
   is ≤ the `$15` absorbed ceiling (under 1,500 words ⇒ stop and pause for the operator); the ceiling; the pocket (150);
   concurrency 1; the daily kill switch ($50); the go-live audience (off / test tenants / everyone); an `interim: true`
   marker that ECON.2's restore flip clears. Runs read the cap from config at claim time, never from a stale row value. **Owned decision → ADR:** config versus
   row, and how existing `locked` rows follow the config without a data backfill.
2. **Reachable end to end** (REQ-SPEC-8, REQ-GROWTH-13): a `locked` or `unused` entitlement renders the sheet's
   *Included* box (no dollars, no cap line, no consent click — REQ-BILL-4); over-cap drafts offer "review the first N
   words, or upgrade" (N from config); Balanced, Frontier and Full board show locked with prices; the Run click sends
   `entitlementId` plus a device fingerprint; the entitlement run holds and debits against the entitlement, never
   credits; the run card and report say *Included*; the billing page shows the trial state, not "Free — chat only".
3. **First-spend unlock checks** (REQ-GROWTH-10) run on that click: disposable domain, a one-trial-per-fingerprint
   rule (hashed, never stored raw), an ASN/IP risk arm, and a phone challenge only above the threshold.
   - Bind the ASN arm from a licence-compatible offline source, or record the inert arm as a `D-ACT.1-n` row with its
     compensating control.
   - A `challenge` renders honest copy, with no dead end.
   - **Owned decision → ADR:** how JOURNEY.1's repeat test tenants pass the fingerprint rule without weakening it for
     real users. The test-tenant flag is operator-set, never user-settable.
4. **Kill switch and limits** (REQ-GROWTH-15):
   - The daily ceiling is re-based to **$50/day of proxy-metered list COGS** of trial runs. Projected pre-claim at the
     p90 card, reconciled from `usage_records`, it pauses new unlocks automatically when crossed. Test tenants are
     excluded from the tally (JOURNEY.1 rule).
   - The workspace kill switch voids within 60 s.
   - Base-only, 1 concurrent, and the eligibility line is stated once.
5. **Restore on *Unverified*** (ADR-015 §3): bind RES.2's hook so an entitlement consumed by an *Unverified* Review
   returns to `unused` exactly once per such run, with an audit row. The daily kill switch still bounds exposure.
6. **The claim render model** (REQ-SPEC-32(b) claims half; the shared owner for UX.1 and ECON.2). Every user-visible
   claim is a typed function of the entitlement config and EST.1's API, rendered only when its source is live — the
   hero "No card. Your first review is included.", the pricing Free column, trial rule and eligibility line,
   `includedNote`, the FAQ trial answer, the billing trial card. HOT.1's hidden trial claim is re-enabled through this model when, and only when, the trial is live for the page's
   audience. A contract test fails on any hand-typed trial or plan figure.
7. **Pricing-page content defects** (PR-U6 content half): "Run word cap" shows the trial's configured cap in the Free
   (trial) column (a row with no value anywhere is omitted — no all-dash row); paid CTAs are plan-specific ("Choose
   Writer", … — text only; the purchase flow is BILL.3's); Team renders "$40/seat/mo" plus its waitlist CTA
   (REQ-GROWTH-7), never "$/mo Annual".

## Out of scope
- Estimator figures, "what it covers", tier control — **EST.1**; cost cards, calibration, caps, the debit flip —
  **ECON.1**; *Unverified* detection and the platform-fault refund class — **RES.2**.
- Stripe checkout and purchase — **BILL.3**; the §14.3 restore (≤ 6,000 words once p90 COGS ≤ $6) — **ECON.2**.
- Pricing phone overflow — **UX.2**; "private beta" / build-jargon copy — **UX.1**; signup throttles — **SEC.2**; a
  phone-OTP vendor — 1.x / HUMAN-H7.

## Acceptance criteria
- [ ] `deriveTrialWordCap(costCards, $15)` returns the largest cap whose p90 is ≤ $15 on fixture cards, and pauses
      (a named result, no silent clamp) when that cap is under 1,500. *(deterministic)*
- [ ] A new account in trial state, fresh from signup: the sheet renders *Included* (no `$`, no cap, no consent); Run
      sends `entitlementId` plus a fingerprint; `allow` moves the entitlement locked→unused→consumed; the run holds
      against the entitlement and 0 credits are debited. Removing any link in that chain fails the test. *(deterministic)*
- [ ] Deny, challenge and paused each render their copy, and none creates a run. A second account on the same
      fingerprint is denied. A Balanced or Full-board or over-cap trial POST is refused by name. *(deterministic)*
- [ ] Daily tally: trial runs whose metered list COGS sum past $50 pause new unlocks, and test tenants don't count. The
      workspace kill switch voids within 60 s. *(deterministic)*
- [ ] An *Unverified* delivery via RES.2's hook restores the entitlement once, with an audit row. A second trigger on
      the same run is a no-op. *(deterministic)*
- [ ] Claims contract: landing, pricing, FAQ, billing and sheet trial text equal the config values; trial off for an
      audience ⇒ no trial claim renders for it; no hand-typed cap or ceiling figure remains in `copy.ts` or
      `pricing.json` (static check). *(deterministic)*
- [ ] Pricing page: no all-dash row; paid CTAs name their plan; Team shows its per-seat price and waitlist. *(deterministic + journey)*
- [ ] **Journey step N5 green** on the deployed stage via the JOURNEY.1 harness: a test-tenant trial Review of the
      ≤300-word fixture shows *Included* and runs to delivery with no cap death. Flip the expected-red flag and commit
      screenshots. *(agentic — live)*
- [ ] **Journey step C1 green:** landing, pricing and trial claims equal the entitlement config and the EST.1 API for
      the test audience, and no trial claim shows for the not-yet-live public audience. *(agentic — live, $0)*
- [ ] One test-tenant trial Review near the derived word cap delivers with no cap death, and its metered list COGS is
      recorded against the $15 ceiling. Stop and open a `D-ACT.1-n` row if cumulative Stage B spend would pass $12.
      *(agentic — live, total ≤ $12)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-8 (amended), REQ-GROWTH-10, REQ-GROWTH-15, REQ-SPEC-32(b) (claims half), REQ-GROWTH-13, REQ-BILL-4
(entitlement half), REQ-GROWTH-7 (display).

## Cross-cutting invariants
- **#1** Vocabulary: Included, credits, cap; the plan and tier names are verbatim.
- **#7** Σ debits ≤ cap, and never silent billing: an entitlement run debits 0 credits, and its absorbed COGS is
  booked as the trial class (ADR-014 §1).
- **#9** No superiority claim in any rendered claim.
- **#11** The sheet stays the only paywall.
- **#12** REQ-SPEC-29: N5 and C1 are proven by walking them, and the deployed provenance is recorded as the chain-tip
  SHA.
- **#13** REQ-SPEC-30: the daily-tally read is a system-pool sweep with an explicit predicate and never serves a user
  request. Entitlement reads stay on the user-serving pool.
- **#14** REQ-SPEC-32: every trial claim a user sees comes from the entitlement config.

## Notes
- **Owned decisions → write ADRs:** the entitlement config shape (config vs row for `word_cap`); the go-live audience
  flag; the fingerprint-rule treatment of test tenants; the projected-plus-reconciled daily tally; the claim render
  model's API (UX.1 and ECON.2 consume it).
- **Shared decisions consumed:** ECON.1 (cost cards; the trial's absorbed-COGS class); EST.1 (the surface estimator);
  RES.2 (the *Unverified* hook, the refund reason); HOT.1 (the `claims` config — this model supersedes it for trial claims).
- **Go-live.** Stage B enables the entitlement for test tenants only. Flipping the audience to everyone is the
  operator's pause: record the ready state and the exact config diff in the run ledger and the LEDGER GATE DECISIONS
  request.
- **DEFERRALS rule:** the go-live itself (pending the operator), any vendor-credential arm, and anything blocked on
  HUMAN-H7 become `D-ACT.1-<n>` rows.
