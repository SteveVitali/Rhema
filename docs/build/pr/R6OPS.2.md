# R6OPS.2 — Monitoring notification channels (F-R6OPS.1-1)

## Summary

Closes **F-R6OPS.1-1** (LEDGER OPEN FINDINGS): all 14 prod GCP `AlertPolicies` carried
`notificationChannels: []` and zero `NotificationChannel` resources existed — a Monitoring-side
SLO breach raised an incident but paged nothing. The fix is the finding's own remediation:
bind `rhema:opsAlertWebhookUrl` (Pulumi SECRET config) on the prod stack to the live SM
`rhema-prod-ops-alert-webhook-url` `latest` payload — `monitoring.ts` already creates a
`webhook_tokenauth` channel and wires `notificationChannels: channels` on every policy; only the
config was unbound. **Deployed live on prod** (`pulumi up` update 157) under GD-REMAINING.R6 +
GD-DEPLOY.R6.

## What changed

- `infra/pulumi/Pulumi.prod.yaml` — `rhema:opsAlertWebhookUrl` set as a **stack-config secret**
  (`secure:` ciphertext only — the value moved `gcloud secrets versions access` → `pulumi config
  set --secret` over stdin, never argv/logs/repo, per the `resend-pull`/`stripe-pull` pattern);
  stale "intentionally unseeded" comment amended (dated note — the SM version is seeded and the
  id is in `PROD_REQUIRED_SECRETS`).
- `infra/pulumi/monitoring.test.ts` — new `R6OPS.2 ops-alert NotificationChannel` describe (3
  tests): the ONE `webhook_tokenauth` channel bound to `args.opsAlertWebhookUrl` and enabled;
  derived `channels` list gated on the config; **every AlertPolicy construction site**
  (route-5xx + the `SLO_ALERT_SIGNALS` map) carries `notificationChannels: channels` — no empty
  literal; `index.ts` reads it via `getSecret` (never plaintext config).
- `infra/PROD-BRINGUP.md` — dated amendment: `rhema:opsAlertWebhookUrl` is now bound on prod;
  keep it equal to the SM version on rotation.
- `docs/build/` — run ledger, PR body, `reports/2026-10-23_R6OPS.2/` (preview diff +
  classification + live verify), BUILD_INDEX row, LEDGER (finding resolved + PHASE LOG),
  DEFERRALS tail on D-P1.22-2, GATE-LAUNCH threshold-7 dated note.

## Design decisions

- **`webhook_tokenauth`, not `webhook`/`webhook_basicauth`** — the project's only webhook
  descriptors are basicauth + tokenauth; tokenauth's sole label is `url` ("shared secret as a
  query string parameter"). The sink URL is a bare `https://*.run.app` (verified against the SM
  payload — no path/query/userinfo material) and the worker already POSTs to it unauthenticated:
  the URL itself is the credential. `labels.url`-only is correct.
- **Stack-config secret, not an SM plan-time read.** The repo's pattern for values that must
  reach the program is `rhemaConfig.getSecret` → ciphertext in the committed stack file; nothing
  in the codebase reads SM payloads at plan time, and an invoke would land the plaintext in
  Pulumi state unmarked. Duplicated-with-SM is the documented contract (PROD-BRINGUP note says
  rotate both together).
- **No code change to `monitoring.ts`/`index.ts`.** The wiring was already complete and correct —
  verified against the deployed program; the gap was purely the unbound config key.

## Verification

- **Deployed:** `pulumi preview --diff` → `+1 create ~14 update 158 unchanged` (channel +
  `+notificationChannels` on all 14 policies; `labels.url:[secret]` — zero URL in output);
  GD-DEPLOY.R6 classified additive-only — zero stateful replace/delete, no migrations, ~$0 cost,
  no image roll (deployed SHA unchanged `80db0d5` ⇒ no `deployments` row owed).
  `reports/2026-10-23_R6OPS.2/preview-classification.md`.
- **Live:** `gcloud alpha monitoring channels list` → the channel exists (created 21:32:35Z,
  `webhook_tokenauth`, enabled); `channels describe` `labels.url` byte-equal to the SM payload
  (sha256-checked in-memory, never printed); `policies list` → **14/14 policies reference it,
  0 empty**. Sink still live (worker receipts through 15:56Z).
- **Test-notification path — honest record:** `sendVerificationCode` → `FAILED_PRECONDITION`
  (webhook types take no verification code; no gcloud/API test verb exists); no synthetic breach
  fabricated on prod (outside scope). First natural-incident receipt is owed-by-nature — the
  armed+referenced+sink-proven layer is what's verified. `verify-flow.md`.
- **Gates:** `pnpm vitest` infra surface 16/16 (+ full suite run) · `pnpm turbo build lint
  typecheck` 135/135 · `infra/pulumi` `tsc -p` clean · `check-build-memory.sh` 0 violations ·
  `check-append-only.mjs` OK.

## Requirement ids

F-R6OPS.1-1 · GD-REMAINING.R6 (item 2) · GD-DEPLOY.R6 · REQ-DEP-2(d) (GATE-LAUNCH threshold 7) ·
D-P1.22-2 leg (e) channel arm.

## AC → evidence

| AC | required layer | achieved | status | evidence |
|---|---|---|---|---|
| Channel exists on prod, webhook to the SM sink | live-executed | live-executed | met | `channels-list.json`; byte-equality check (verify-flow.md §2) |
| All 14 policies reference ≥1 channel | live-executed | live-executed | met | `policies-channels.txt` — 14/14, 0 empty |
| URL never committed/logged readable | engineered | engineered | met | `Pulumi.prod.yaml` `secure:` only; preview `[secret]`; report files redact |
| Tests pin channel+policy contract | engineered | engineered | met | `monitoring.test.ts` R6OPS.2 describe — 16/16 |
| Deploy inside GD-DEPLOY.R6 | live-executed | live-executed | met | `preview-classification.md`; up update 157 |
| Delivery proof on the channel | live-executed | live-executed (armed layer) | met — honest residual | `verify-flow.md` — no test verb exists for the type; owed-by-nature first-incident receipt recorded |
| Finding closed + records | engineered | engineered | met | LEDGER resolution bullet; GATE-LAUNCH note; DEFERRALS tail; BUILD_INDEX 222 |
