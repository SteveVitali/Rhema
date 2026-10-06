# BILL.3 — The credit purchase path

- **Sequence:** 65 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** money
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** RES.2
- **Scope (one line):** every purchase entry point reaches a Stripe-hosted page — run-sheet Add credits (blocked by CSP `form-action 'self'`), billing Buy / Choose Writer ("no checkout URL") and the portal — plus the pending-checkout email that no job sends and the REQ-BILL-16 failure-state integration tests; re-opening purchase to real users stays operator-held behind a switch.
- **Spec §§:** 14.6 (flows, controls, failure states, webhook lag), 14.4 (the run sheet is the single paywall), 14.2 (top-up eligibility and bounds), 5.6 (the run sheet's three sentences), 13.3 (the CSP audit from P1.22), 5.11 (the email row), Appendix A.13 (REQ-BETA-19 amended: self-serve purchase via Payment Links)
- **REQ coverage:** REQ-BILL-16 (primary), REQ-BETA-15, REQ-GROWTH-13 (the half: the sheet's Add credits), REQ-BILL-14, REQ-BETA-12 (the `exhausted_prompt` telemetry is kept) (stamp in the PR)
- **Absorbs (backlog):** BL-51 (PR-J2), BL-09 (the pending-checkout email item: X-pending-checkout-email-gap; the deploy half is HOT.1's)
- **Run:** `implement-spec spec=docs/tickets/65_BILL.3__credit-purchase-path.md`
- **Gate status:** Operator-paused: **re-opening purchase** to real users (this ships closed behind a switch; flagged test tenants are allowlisted); **any real-money purchase** and the live-mode re-verification (HUMAN-H7 "Live-mode Stripe re-verify", BL-33); any Stripe account/dashboard change — e.g. activating Stripe Tax, or creating live-mode products, prices or webhooks; and creating or rotating a Stripe credential.
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy, then as a flagged test tenant walk each entry point to a Stripe-hosted page with the JOURNEY.1 harness — no payment submitted, $0

## Goal
On prod, credits cannot be bought (PR-J2, `06-billing-unavailable.jpg`):
- **Run sheet → Add credits** posts to `/p/:slug/exhausted`. Its 302 to the Payment Link is blocked by the site's own
  CSP (`form-action 'self'`), so the click does nothing.
- **Billing → Buy 1,000 credits** and **Choose Writer** both answer "Billing is temporarily unavailable" because the
  api returned no checkout URL.
- **The pending-checkout page** promises "we'll email you when it lands", but no job sends that email (STB.4 Leg A (f)).

The CSP is a regression. P1.22 (`23fabce`, 2026-09-25) added it, and the operator's real Payment-Link purchase on
2026-09-22 (D-PRB.17-1, DONE) predates it.

BILL.3 makes every purchase entry reach a Stripe-hosted page with truthful failure copy. It sends the promised email
and proves every §14.6 failure state with an integration test (REQ-BILL-16). Re-opening purchase remains the
operator's act. BILL.3 owns journey step **N9**.

## Load (read these — do not re-read others)
- `docs/tickets/DEFERRALS.md` (start-of-run rule; D-P1.16-1 and D-PRB.08-1 are adjacent), the planning ledger row 65, `docs/build/BACKLOG.csv` BL-51 / BL-09.
- `docs/build/runs/STB.4.md` Leg A: the test-mode edge, the three live-path fixes, "Live-mode remainder", (f) the pending copy.
- Spec §14.6 in full, and §14.2's plan table (Top-ups: no on Free; yes on Writer and up).
- `apps/web/src/server.ts`:
  - ~173–183: the CSP (`cspFor`)
  - ~2516–2543: billing `subscribe` / `topup`. Every failure collapses into `?notice=checkout` via `.catch(() => undefined)`.
  - ~2587: `portal`
  - ~2619–2640: `/billing/return`
  - ~3496–3515: `/p/:project/exhausted` → `paymentLinkWithReference`
- `apps/web/src/copy.ts` ~1442 (`returnPending`); `apps/web/src/data.ts` ~1326 (`startCheckout`).
- `apps/api/src/billing-routes.ts`:
  - ~239: `/billing/checkout`. It answers 503 `stripe_unconfigured` when `stripe` or `appBaseUrl` is unset.
  - ~296–313: `topups_require_plan`, `first_month_cap`
  - ~494: the checkout-session poll
- `packages/ledger/src/checkout.ts` ~35–80 (`startCheckout`); `packages/ledger/src/stripe-port.ts` ~109–150 (`FetchStripePort.createCheckoutSession` — inline `price_data`, `automatic_tax`, `customer_update`).
- `packages/ledger/src/stripe.ts` ~385 / ~633 (`topup_granted` and the other terminal outcomes); `apps/worker/src/main.ts` ~395 / ~521 (the `stripe.event` job).
- `infra/pulumi/compute.ts` ~310 / ~341 / ~477 / ~510: `STRIPE_SECRET_KEY_NAME`, `APP_BASE_URL`, `STRIPE_PAYMENT_LINK_URL` on the api and web services.
- Existing tests to reuse by reference: `packages/ledger/src/stripe.test.ts`, `subscriptions.test.ts`, `auto-reload.test.ts`, the reprice / sweep suites, and `integration/`.

## In scope — deliverables
1. **The CSP** (PR-J2; REQ-BETA-15, REQ-GROWTH-13).
   - `form-action 'self'` blocks the post-submit redirect to `buy.stripe.com` (`/exhausted`), `checkout.stripe.com`
     (subscribe / top-up) and `billing.stripe.com` (portal).
   - Fix it with the minimum exposure: name exactly the Stripe hosts the code redirects to, from one constant, with
     no wildcards. Alternatively use a same-origin GET hand-off page.
   - Fetch-based tests cannot see CSP; the browser proof is N9.
   - **Owned decision → write an ADR.**
2. **"No checkout URL"** (PR-J2; REQ-BILL-16).
   - **Stop collapsing errors.** The web logs the api error *class* (never a secret or a body with PII) and maps each
     class to its own copy.
   - **Diagnose from read-only prod api logs** which branch fired on the review's attempts (the operator's Writer
     account and the new Free account). Candidates:
     - (a) 503 `stripe_unconfigured` — the api's `STRIPE_SECRET_KEY_NAME` or `APP_BASE_URL` binding.
     - (b) A Stripe 4xx from `createCheckoutSession`. Suspects: `customer_update[address]=auto` sent **without**
       `customer` (every never-purchased account has no `stripe_customer_id`), and `automatic_tax[enabled]=true` on a
       live account without Stripe Tax active. Re-confirm both against the Stripe API docs.
     - (c) `topups_require_plan` on a Free account, shown as "temporarily unavailable".
   - STB.4's synthetic edge could not surface Stripe-side validation.
   - **Fix at the root.** A request-contract test pins the Stripe params against the documented constraints.
   - **Free accounts.** A Free account is never offered a Checkout top-up it cannot complete (§14.2). Its purchase
     paths are the Payment Link (REQ-BETA-19 amended) and Choose Writer.
   - If the root cause is Stripe account configuration, e.g. Tax not activated: that is operator-paused. Record it as
     a `D-BILL.3-n` row and make the code degrade honestly without it.
3. **The purchase switch** (the operator's "re-opening purchase" pause).
   - Add a `purchase` open/closed switch. Default: **closed**. Test tenants flagged by JOURNEY.1 are allowlisted.
   - **Closed:** no Stripe call, and honest copy that purchases are paused, using D.2 vocabulary: credits, top-up,
     plan.
   - **Open or allowlisted:** the 302 goes to the Stripe URL.
   - The operator flips it.
   - **Owned decision → ADR:** where the switch lives (config vs DB).
4. **The pending-checkout email** (BL-09; §14.6 webhook lag: "polls ≤ 30 s then emails").
   - Record on the `checkout_sessions` row that its return page was viewed while `open` (additive migration).
   - When `stripe.event` later completes that session (top-up granted, subscription activated), send exactly one
     transactional email through PRB.09's mailer. It deep-links to `returnTo`, carries ids and templated strings
     only, and is idempotent per session.
   - A session completed before the user returned sends nothing.
5. **The REQ-BILL-16 failure-state matrix** (primary).
   - One integration-level test per §14.6 failure state:
     - card declined
     - renewal failed
     - chargeback
     - run failed / refused
     - estimate service down → no run starts
     - provider outage mid-run (> 3 retries → fail + refund)
     - rate-table change while parked
     - parked > 30 days
     - reconciliation drift
     - webhook lag (poll, then email)
   - Plus this ticket's new states: Stripe unconfigured, Stripe rejects the session, purchase closed.
   - One matrix file maps each state to its test, and a coverage assertion fails when a state lacks one. Existing
     unit tests may back a row by reference only where they already exercise the integration path.

## Out of scope
- Deploying STB.4's three Stripe fixes (the double included grant, the `/billing/return` 404, the client-trusted `rateTableVersion`) → **HOT.1**, which lands before this ticket.
- A real-money purchase, the live-mode hosted UX, 3DS / Radar / Tax / test clocks → **HUMAN-H7** (BL-33). Changes to what runs cost → **ECON.1**. The trial entitlement and pricing-page claims → **ACT.1**.
- The pricing page's layout and phone overflow → **UX.2**. Signup admission and throttle → **SEC.2**.

## Acceptance criteria
- [ ] **CSP.** `form-action` equals `'self'` plus exactly the Stripe hosts the code redirects to, taken from one shared constant. A test fails when a redirect host is missing or a wildcard appears. *(deterministic)*
- [ ] **Stripe request contract.** It never sends a parameter combination Stripe rejects (e.g. `customer_update` without `customer`). The regression test reproduces the diagnosed prod failure and fails on the pre-fix code. *(deterministic)*
- [ ] **Failure copy.** Each api failure class renders its own truthful copy. A Free account is never shown a Checkout top-up. The generic "temporarily unavailable" appears only for true outages. *(deterministic)*
- [ ] **Purchase switch, closed.** It makes no Stripe call and renders the paused copy. *(deterministic)*
- [ ] **Purchase switch, allowlisted test tenant.** It gets the Stripe 302 on all four entry points. *(deterministic)*
- [ ] **Pending email.** A completion that follows an `open` return view sends exactly one email. A completion before return, or a webhook replay, sends none. *(deterministic)*
- [ ] **REQ-BILL-16.** The matrix is complete; the coverage assertion is green and fails when a state is removed. *(deterministic)*
- [ ] **Stage B deploy.** `pulumi preview` shows no stateful replace/delete, migrations pass the additive lint, and the monthly delta is ≤ $15. Deployed provenance = the chain-tip SHA. *(agentic)*
- [ ] **Journey step N9 green** (JOURNEY.1 harness, screenshots committed). As a flagged test tenant, run-sheet **Add credits**, billing **Buy** and **Choose Writer** each land on a Stripe-hosted page showing the expected amount, with no CSP violation in the console. No payment is submitted. *(agentic)*
- [ ] **Stage B: real users unaffected.** A non-test account still sees the closed state. The Checkout sessions Stage B created stay `open` / expire, with zero `grant` rows from Stage B. *(agentic)*
- [ ] **Stage B: HUMAN-H7 remainder.** The real purchase and the live-mode re-verify are recorded as `D-BILL.3-n` rows (unblocked by HUMAN-H7), unless the operator performs them during the run. A LEDGER GATE DECISIONS row asks the operator to re-open purchase. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BILL-16 (primary), REQ-BETA-15, REQ-GROWTH-13 (the half: the sheet's Add credits is the one paywall entry),
REQ-BILL-14, REQ-BETA-12.

## Cross-cutting invariants
- `00_MANIFEST.md` #1 and REQ-BILL-18: the vocabulary is credits, cap, top-up, plan. "You will be billed", "overage" and "on-demand" are banned in the new copy and in the email.
- #7: money.
  - Grants come only from verified webhooks.
  - A Checkout insert stays idempotent.
  - Never a silent bill.
- #10: the email and logs carry ids and templated strings only; no Stripe secrets or card data.
- #11: the run sheet is the only paywall. Add credits stays the sheet's exhaustion action.
- #12 / REQ-SPEC-29: N9 is proven in a real browser. CSP is invisible to HTTP tests.
- #13 / REQ-SPEC-30: checkout-session reads stay tenant-scoped under SEC.1's user-serving role. The pending-email sweep, if it runs as a system job, uses explicit predicates.
- REQ-SPEC-11: unchanged.

## Notes
- **Owned decisions → write an ADR each:**
  1. the CSP shape (host allowlist vs hand-off page)
  2. the purchase switch's location and default
  3. the pending-email trigger
- **Consumed:**
  - HOT.1's deployed STB.4 fixes and its `claims` config (purchase copy must not re-enable a hidden claim)
  - JOURNEY.1's harness, test tenants and test mailbox (for the pending-email leg)
  - SEC.1's roles
- **Inline `price_data`** (`stripe-port.ts` ~126–140) is the product's normal runtime path, not a catalogue change.
  If the fix needs live-mode products, prices or webhooks, stop — that is operator-paused.
- **Anchors to re-confirm at build time:** all line numbers above; the four entry points the billing page actually
  renders for Free vs Writer; whether the prod web service carries `STRIPE_PAYMENT_LINK_URL`; the Stripe
  `customer_update` / `automatic_tax` constraints in the current API version.
- **DEFERRALS rule:** H7-gated legs and any Stripe account configuration become `D-BILL.3-n` rows. They report "gate
  pending", never a failure or a fabricated pass.
