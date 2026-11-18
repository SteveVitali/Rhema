# D-R6SEC.1-1 arm (c) — read-only compromise audit (RH-0 / GHSA-965c-763c-88jm)

Executed 2026-11-18 against prod `279f45d3` (better-auth@1.7.25 — lockfile +
`apps/api/package.json` pinned at the deployed SHA). $0, read-only: Cloud Logging request logs
(`rhema-prod-api-*`, ~20-day retention 2026-10-29→11-18) + system-DSN `BEGIN READ ONLY` census.

The advisory's attack shape: a `magic-link/verify` redemption whose token was never emitted by a
`sign-in/magic-link` send, minting a session (pre-account-hijack) and/or a falsely-verified
account.

## Log arm — verify-without-send

- 807 `POST /api/auth/sign-in/magic-link` sends (all 200) vs 796 `GET /api/auth/magic-link/verify`
  redemptions (all 302) — verifies < sends is the healthy direction.
- **794/796 verifies have a send within the prior 15 min** (the link-expiry window). The 2
  exceptions are literal `token=invalidtoken000` probes 2026-11-15T21:04Z — deliberate, 302 to the
  error callback, no session minted.
- No verify with status ≥400 and none minted anomalous volume.

## DB arm — session ↔ redemption correlation

- 122 `session` rows total; **78 minted inside the log window — 78/78 have an auth redemption
  (verify-302 or OAuth `callback`) within 30 s. Zero orphans.**
- The 44 pre-window sessions (created 2026-09-17→09-23) trivially lack log coverage (retention);
  all resolve to operator/test user `01M2V3PM…`/`prb20_sess_*` — test-harness residue, not
  anomalies.

## DB arm — falsely-verified-account census

- 72 `user` rows created since launch (2026-10-28); 75/79 total `email_verified`. The only 4
  unverified rows are identifiable test/probe identities (`probe-nope@example.invalid`,
  `nobody-zzz@example.com`, two `test+…held@rhema.tools` journey-held fixtures) — the honest
  "signed up, never verified" state, **not** the advisory's falsely-verified shape.

## sign-in/social arm

- 5 `sign-in/social` requests in window (4×200, 1×404 on `/sign-in/social/google` — a path probe).
  Request logs do not carry POST bodies, so attacker-chosen `additionalData.email` is not
  directly visible — honest limit; no volume or status anomaly.

## Honest limits (per deploy-plan §4.2)

- Consumed `verification` rows are deleted at redemption — pre-upgrade state cannot be
  re-identified; this is a best-effort audit, never a completeness claim.
- POST bodies are absent from request logs (`additionalData.email`, per-email send↔verify pairing
  unattainable); the session↔redemption timing correlation is the strongest available arm.
- Log retention ~30 days: 2026-10-28 launch→10-29 has ~1 day of thin coverage at the window edge.

## Verdict

**No evidence any session was minted, or any account falsely verified, via an
OAuth-state-shaped magic-link redemption** in the observable window. All four D-R6SEC.1-1 arms
discharged: (a) provenance all-PASS @ `279f45d3` carrying `better-auth@1.7.25`; (b) pending-link
invalidation noted (deploys since 2026-11-15 carried the patch; pre-deploy links/OAuth states die
inside their ≤15-min expiry — no unauthenticated-user banner surface exists, the failure mode is
a fresh send); (c) this audit — clean; (d) `N1`/`N3` + public-page legs PASS @ `279f45d3` in the
R6DEP.6 ad-hoc suite (`reports/2026-11-18_R6DEP.6-suite/`).
