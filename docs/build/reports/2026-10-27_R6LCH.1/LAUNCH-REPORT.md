# R6LCH.1 — LAUNCH REPORT

**Launch timestamp: 2026-10-28T04:0xZ** (post-flip smoke verified;
rhema.tools open to the public)

**Deploy verdict: PASS** — `b953c55e3b9b877e3147332a405d05def4cbaf88`
serves web+api; provenance all-PASS; update 168 replaced only the
stateless proxy InstanceTemplate (zero stateful replace/delete).

## Per-flip verdicts

| Flip | Mutation | Verdict | Live evidence |
|------|----------|---------|---------------|
| 1 — debitMode→metered | **PARKED** (GD-THRESH13.R6; `EFFECTIVE_DATE=2026-12-01` binds the 30-day paid-account notice) | PARKED | `DEBIT_MODE=committed` untouched; notice date not yet reached |
| 2 — purchaseMode closed→open | `stages.ts` + update 166 | **PASS** | `PURCHASE_MODE=open`; real `cs_live_a1OlskUOxPE…` minted at flip; `cs_live_a1NvsdYj…` re-minted post-flip-4 |
| 3 — refundWindowMode test_tenants→open | `stages.ts` + update 167 | **PASS** | real run `01M605XT4PD5FQZ6358JJ7HXDT` refunded 1797 cr; request `01M6093MX64EBRGBZ8APRB7135` `decision=auto_allowance`; ledger `refund`+`absorbed` rows durable |
| 4 — trial audience test_tenants→everyone | `pricing.json` + rebuild `9f35a18c` + update 168 | **PASS** | anonymous `/`+`/pricing` carry the config claim; fresh real account `is_test=false` claimed run `01M60AR5GG6Y0NXAWW5QH4GE2J`; pocket 150 granted; `concurrency_limit` fired; `trial_unlock_checks` `allow/ok` audited |

## Re-proofs (pre-flip, at launch SHA `b04fc1b`)

- Parked redrive `evt_1UVF7T2MLe3ETP9SG5x24wSg` → `processed_at` set,
  exactly one `topup_granted`.
- Webhook `we_1UH99C2MLe3ETP9Sk4UQBKXs` `enabled_events` = canonical
  nine; a real `customer.subscription.updated` drove
  `cancel_at_period_end=true` (proves the F-R6LCH.1-1 fix live).
- Golden cohort `r6lch1-launch`: 4/4 green, Promotion OK,
  $36.95 measured vs $46.94 committed ($100 hard cap).
- HSTS both origins; invite path intact.

## Post-flip smoke

`flip4-postflip-smoke.md` — fresh real account walked signup → opt-out →
trial claim → concurrency refusal → Stripe reach. Full PASS.

## Truthful-money notes

- Refund allowance auto-decided `auto_allowance` inside the quarter
  envelope; refunded COGS carried as `reason=absorbed` adjustment —
  debits and grants reconcile.
- Trial spend is entitlement-billed (`spent_credits=0` on the included
  run); the $50/day ceiling + one-concurrent cap + identity rails are
  armed (concurrency proven live; ceiling leg covered at HTTP in
  `run-routes.test.ts`).

## Outstanding operator items

- PR `stevevitali/r6lch-1-launch` — mergePolicy=OPERATOR; merge is the
  operator's call.
- Flip 1 remains parked until ≥ 2026-12-01 (30-day notice to paid
  accounts; `docs/ops/debit-mode-flip.md`).
- R6WATCH.1 watch + ADR-112 clock start at the launch timestamp.
