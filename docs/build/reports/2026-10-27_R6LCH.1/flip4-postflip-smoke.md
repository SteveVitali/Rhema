# R6LCH.1 — Flip 4 post-flip smoke (fresh real account)

**When:** 2026-10-28T03:5x–04:0xZ (after Pulumi update 168, provenance
`b953c55e3b9b877e3147332a405d05def4cbaf88` all-PASS)
**Who:** agent-driven HTTP against prod (`api.rhema.tools`); DB reads over
the IAP/alloydb proxy tunnel (read-only selects).
**Account:** `14stevevitali+r6lch1@gmail.com` — created live during this
smoke; NOT in `accounts`, NOT invite-pinned, `is_test=false` everywhere.

## Funnel walk — every leg

| # | Leg | Request | Result |
|---|-----|---------|--------|
| 1 | Signup | `POST /signup` | 201 `{"ok":true,"created":true}` |
| 2 | Session | `GET /api/auth/magic-link/verify?token=…` | 302 → `/app`, `__Host-rhema.session_token` set |
| 3 | Opt-out | `POST /settings/privacy {"analyticsOptOut":true}` | `{"ok":true,"analyticsOptOut":true}`; GET re-read `{"analyticsOptOut":true}` |
| 4 | Trial posture | `GET /billing/subscription` | `purchase:"open"`, `trial.state:"trial_pending"`, entitlement `locked` wordCap 2800 expires 2026-11-11 |
| 5 | Upload | `POST /import/presign` → GCS v4 PUT → `POST /import/preview` | preview OK (`sourceFormat:"md"`) |
| 6 | Project | `POST /projects` `entry:"draft"` | project `01M60AQSJBMHEJGPXFW9X2A2NC`, draft `01M60AQSQ3GP0E4C56TK49VDM0` |
| 7 | **Claim** | `POST /projects/:id/runs` `{workflow:"review",rigor:"standard",modelTier:"base",entitlementId}` | `{"runId":"01M60AR5GG6Y0NXAWW5QH4GE2J","state":"queued"}` |
| 8 | Concurrency | second run POST while slot held | `{"error":"concurrency_limit","limit":0,"active":1}` |
| 9 | Top-up pack | `POST /billing/checkout {kind:"topup",packId:"topup_10"}` | `{"error":"topups_require_plan"}` — truthful refusal (pack SKU needs a paid plan) |
| 10 | **Purchase reach** | `POST /billing/checkout {kind:"subscribe",plan:"writer",cycle:"monthly"}` | `sessionId=01M60ASG3BE28D704F1J80RKVQ`, real `cs_live_a1NvsdYj7U0RpuwbQvysXTIkLluPWOgD3bZN9KRYUsQN5WGxCmK2Z6Yz4O` |

## DB truth (post-claim reads)

- `runs` `01M60AR5GG6Y0NXAWW5QH4GE2J`: `state=running`,
  `entitlement_id=01M60AJ50EZKRXK2CYTDEE612D`, `estimate_credits=1463`,
  `cap_credits=4390`, `spent_credits=0` — the included run is
  entitlement-billed, not account-billed.
- `trial_entitlements` `01M60AJ50EZKRXK2CYTDEE612D`: `state=consumed`,
  `consumed_by_run_id=01M60AR5GG6Y0NXAWW5QH4GE2J`,
  `consumed_at=2026-10-28T04:02:03.916Z`,
  `pocket_ledger_id=01M60AR5ESATR1WRTXXT3A9GPD`.
- `billing_accounts`: `trial_state=trial_pending → trial_used`.
- `credit_ledger` `01M60AR5ESATR1WRTXXT3A9GPD`: `kind=grant`,
  `credits=150`, `bucket=trial_pocket`, `source=system`,
  `reason=trial_pocket` — the pocket landed.
- `trial_unlock_checks`: `decision="allow"`, `reason="ok"`,
  `disposable_domain=false`, `fingerprint_seen=0` — the abuse-rail
  audit row exists for the real claim.

## Verdict

A brand-new unflagged user signed up, claimed the included Review, got
the 150-credit pocket, had the one-concurrent cap enforced, kept the
analytics opt-out, and reached a real Stripe Checkout — **Flip 4 + the
post-flip smoke pass.**
