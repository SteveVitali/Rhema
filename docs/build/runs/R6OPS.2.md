# R6OPS.2 — Monitoring notification channels (run ledger)

- **Spec:** operator-directed findings work — no manifest ticket file. The contract is
  **F-R6OPS.1-1** (LEDGER OPEN FINDINGS, verbatim): all 14 prod `AlertPolicies` carry
  `notificationChannels: []` and zero `NotificationChannel` resources exist in `rhema-507501`;
  the worker's `OPS_ALERT_WEBHOOK_URL` sink is armed + proven (488 `ops_alert_received` receipts)
  but the Monitoring→channel page path was never bound (`rhema:opsAlertWebhookUrl` unset).
  Authorized under **GD-REMAINING.R6 — "approve all remaining tasks, proceed"** (GATE DECISIONS
  2026-10-23), which names "F-R6OPS.1-1 alert channels → wire Monitoring NotificationChannel to
  the existing proven `ops-alert-webhook-url` sink (H10-attested, 488 receipts)". The prod deploy
  runs under **GD-DEPLOY.R6**'s four conditions (zero stateful replace/delete · additive-migration
  lint n/a — no migrations · cost delta ≤ $15 · provenance check after).
- **Normative loads:** `docs/build/LEDGER.md` OPEN FINDINGS F-R6OPS.1-1 + GATE DECISIONS
  GD-REMAINING.R6 / GD-DEPLOY.R6; `docs/tickets/DEFERRALS.md` **D-P1.22-2** (leg (e)'s "wired
  channel" arm); `infra/pulumi/monitoring.ts` + `index.ts` + `secrets.ts`;
  `infra/PROD-BRINGUP.md` (`rhema:opsAlertWebhookUrl` documented optional-but-unset);
  `docs/build/reports/2026-10-22_R6OPS.1/alert-delivery.md` (the finding's own remediation);
  `docs/build/readouts/GATE-LAUNCH.md` threshold 7.
- **Base:** `stevevitali/r6fix-1-findings-hardening` @ `59311f3` (chain tip; PR #215)
- **Branch:** `stevevitali/r6ops-2-alert-channels` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-10-23T21:28Z · **Closed:** 2026-10-23T21:54Z
- **Live stage:** prod deploy authorized (GD-DEPLOY.R6 — `pulumi up --stack prod`, additive-only:
  +1 `NotificationChannel`, 14 `AlertPolicy` channel-reference updates).
- **Production mutations:** `pulumi config set --secret rhema:opsAlertWebhookUrl` on stack `prod`
  (ciphertext into the committed `Pulumi.prod.yaml` — the established stack-secret pattern; the
  URL value is never committed/readable) → `pulumi up --stack prod` → live verification reads
  (`gcloud monitoring channels`, policy describes, catcher log receipt). No stateful resource
  touched; no image roll (no `serviceImages`/`gitSha` change).
- **ci:** `pending` — boundary read in flight at close (`logs/ci-R6OPS.2.json`; resolved read
  recorded in the LEDGER's boundary-confirmed PHASE LOG note)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in scope:

- **D-P1.22-2** (PARTIAL) — leg (e)'s surviving arm is exactly this finding ("the `[slo]
  violation` line reaching the wired channel" — the literal Monitoring NotificationChannel page).
  This run wires + live-verifies the channel → dated tail recording the arm discharged; the row
  stays PARTIAL on (f) organic-cohort (D-R5OPS.1-1).
- No other OPEN row unblocks on this run (F-R6INF.1-1/ADR-122 ruling, D-SPA.24-1 re-proof,
  D-R6SECR.1-2 live-curl, D-R6CNT.2-1, D-CAP.2-1 funded wave all remain operator/post-merge owned).

## Requirements

1. **Bind the channel on prod.** `rhema:opsAlertWebhookUrl` Pulumi secret config set on stack
   `prod` from the live SM `rhema-prod-ops-alert-webhook-url` `latest` payload — the documented
   remediation in the finding report (`alert-delivery.md`). The value lands only as `secure:`
   ciphertext in the committed stack file; it is never printed, logged, or committed readable.
2. **Channel shape verified.** `webhook_tokenauth` is the correct channel type — the project's
   only webhook descriptors are `webhook_basicauth` + `webhook_tokenauth`; tokenauth's sole label
   is `url` ("a shared secret as a query string parameter"), and the sink URL is a bare
   unguessable `https://*.run.app` (no path/query/userinfo — verified by reading the SM payload;
   the worker already POSTs to it unauthenticated, so the URL itself is the credential).
   `monitoring.ts` already creates the channel gated on the config and wires
   `notificationChannels: channels` on every policy — code change needed: none for wiring;
   the gap was the unbound config.
3. **Tests.** Extend `monitoring.test.ts` (the alert-policy surface pin) to assert: the channel
   is `webhook_tokenauth` bound to `args.opsAlertWebhookUrl` and enabled; `channels` is
   `[notificationChannel.name]` when set / `[]` when unset; every AlertPolicy (route-5xx + the
   per-signal SLO map) carries `notificationChannels: channels`; `index.ts` reads the config as a
   Pulumi secret and passes it through.
4. **Deploy under GD-DEPLOY.R6.** `pulumi preview --diff` on prod → classify (expected: 1 create
   channel + 14 policy updates, zero replace/delete on anything) → `pulumi up --stack prod`.
   Channel-only change: no image build; `record-deployment`/provenance legs record honestly what
   changed (no deploy-SHA/services delta ⇒ no `deployments` row — record why).
5. **Live verify.** `gcloud monitoring channels list` non-empty + ≥1 policy describe shows
   `notificationChannels` set; one safe delivery proof (the channel verification flow POSTs a
   verification message to the sink → read the `ops_alert_received` receipt + verification code
   from the catcher's Cloud Logging → complete `channels verify`) — the sink is a log-recorder,
   not a human pager, so the test message does not page anyone.
6. **Close F-R6OPS.1-1** with evidence; dated GATE-LAUNCH threshold-7 note (amend by dated note
   only); D-P1.22-2 dated tail.
7. **Records.** this ledger · `pr/R6OPS.2.md` + `gh pr create` · BUILD_INDEX row 222 · LEDGER
   (finding resolved, PHASE LOG, `nextTicket` stays `196a_HUMAN-H12`) · DEFERRALS tail.
8. **Verify.** `pnpm turbo build lint typecheck` (touched surface = `infra/pulumi` — its own
   vitest/typecheck gates) · `check-build-memory.sh .` 0 violations · `check-append-only.mjs
   --base c1f20f5` OK · push + `ci-boundary.sh --ticket R6OPS.2`.

## Acceptance criteria

| # | AC | required layer |
|---|---|---|
| A | ≥1 `NotificationChannel` of type `webhook_tokenauth` exists on prod bound to the ops-alert sink URL | live-executed |
| B | Every one of the 14 prod `AlertPolicies` references ≥1 notification channel | live-executed |
| C | The URL value never appears in repo, logs, or any ledger — only `secure:` ciphertext in `Pulumi.prod.yaml` / Pulumi state | engineered |
| D | Tests pin the channel+policy contract | engineered |
| E | Deploy inside GD-DEPLOY.R6's four conditions; zero stateful replace/delete | live-executed |
| F | A delivery proof on the channel (verification receipt at the catcher, or honest skip) | live-executed |
| G | F-R6OPS.1-1 closed with evidence; GATE-LAUNCH threshold-7 dated note; records complete | engineered |

## Plan

1. Branch `stevevitali/r6ops-2-alert-channels` off `59311f3` (done) + this ledger.
2. Baseline: `infra/pulumi` vitest (monitoring.test.ts etc.) + `pnpm -C infra/pulumi typecheck` green on base.
3. Extend `monitoring.test.ts` with the channel-contract pins (Req 3).
4. `pulumi config set --secret rhema:opsAlertWebhookUrl "$(gcloud secrets versions access latest …)" --stack prod` — pipe, never argv-echo; commit the resulting `secure:` line + comment refresh in `Pulumi.prod.yaml`; dated PROD-BRINGUP.md note.
5. `pulumi preview --diff --stack prod` → write the classification into `reports/2026-10-23_R6OPS.2/preview-classification.md` → `pulumi up --stack prod`.
6. Live verify + the verify-flow delivery proof → `reports/2026-10-23_R6OPS.2/` evidence files.
7. Records + close (LEDGER finding + PHASE LOG, BUILD_INDEX 222, DEFERRALS tail, GATE-LAUNCH note, PR).
8. Validators + ci-boundary.

## Test matrix

| AC | Test | Type |
|---|---|---|
| D | channel type `webhook_tokenauth`, `labels.url = args.opsAlertWebhookUrl`, `enabled` | source pin (monitoring.test.ts) |
| D | `channels` derived array — populated iff the channel exists | source pin |
| D | every AlertPolicy site (`route5xxPolicy` + `SLO_ALERT_SIGNALS.map`) carries `notificationChannels: channels` | source pin |
| D | `index.ts` reads `getSecret("opsAlertWebhookUrl")` + passes it to `createMonitoring` | source pin |
| B/E | `pulumi preview --diff` classification: +1 channel, 14 policy updates, 0 replace/delete | live preview |
| A/B/F | `channels list` + policy describe + verify-flow receipt in catcher logs | live gcloud |

## Progress

- 2026-10-23T21:28Z — branch forked @ `59311f3`; context loaded (finding F-R6OPS.1-1 verbatim,
  GD-REMAINING.R6 + GD-DEPLOY.R6 rulings, D-P1.22-2 leg (e) arm, monitoring.ts/index.ts/secrets.ts
  wiring inspected — channel code already exists gated on the unset config; SM payload shape
  verified: bare `https://*.run.app`, no token material beyond the URL ⇒ `webhook_tokenauth`
  correct, `labels.url`-only).
- 2026-10-23T21:30Z — baseline green (infra surface 99 tests); `monitoring.test.ts` +3
  channel-contract pins written and green (16/16); one self-caught test-authoring fix
  (`const apiService` prefix-matched `const apiServiceName` — tightened to `const apiService =`).
- 2026-10-23T21:32Z — config bound (`config set --secret`, gcloud→stdin, `secure:` ciphertext
  only) → `preview --diff` (+1/~14/158unchanged, `labels.url:[secret]`, zero replace/delete) →
  `pulumi up` update 157 in 26 s.
- 2026-10-23T21:4xZ — live verify: channel exists (21:32:35Z, tokenauth, enabled), `labels.url`
  byte-equal to SM latest; 14/14 policies reference it; `sendVerificationCode` →
  FAILED_PRECONDITION recorded; no synthetic breach fabricated (out of scope).
- 2026-10-23T21:5xZ — records: LEDGER finding resolved + CURRENT STATE/PHASE LOG, BUILD_INDEX
  222, DEFERRALS tail, GATE-LAUNCH row-7 note, `pr/R6OPS.2.md`; gates: turbo 135/135, full
  vitest suite 515 files green (1 docker-build env flake, unrelated, skips on retry),
  `infra/pulumi` tsc clean; change commit `59e9dfe` pushed → PR #216; ci-boundary read in flight.

## Gap table

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| Inspect policies + secrets wiring (job 1) | engineered | engineered | met | `secrets.ts:77` (`ops-alert-webhook-url` container), `index.ts:90` (`getSecret`) + `:465` (pass-through), `monitoring.ts:93–103` (channel) + `:275,312` (`notificationChannels: channels` ×2); channel code already correct — the gap was the unbound config |
| Create NotificationChannel webhook/webhook_tokenauth to SM-URL sink (job 2) | live-executed | live-executed | met | `pulumi up` update 157 created `…/notificationChannels/11368222885303875371` 21:32:35Z, `webhook_tokenauth`+enabled; `labels.url` byte-equal to SM `latest` (sha256-checked in-memory) — `reports/2026-10-23_R6OPS.2/channels-list.json` + `verify-flow.md` |
| URL value never committed (job 2 constraint) | engineered | engineered | met | only `secure:` ciphertext at `Pulumi.prod.yaml:392`; `config set --secret` over gcloud→pulumi stdin (never argv/printed); preview renders `labels.url:[secret]` — `grep -c run.app preview-diff.txt` = 0; report JSON redacts |
| Attach channel to every AlertPolicy (job 3) | live-executed | live-executed | met | live `policies list`: **14/14** carry `[…/11368222885303875371]`, 0 empty — `policies-channels.txt` |
| Tests pin every policy → channel + channel is webhook to sink (job 4) | engineered | engineered | met | `monitoring.test.ts` "R6OPS.2" describe: 1-channel construction, tokenauth+url+enabled, derived `channels`, both AlertPolicy sites bound, `getSecret` read — 16/16 green |
| Deploy under GD-DEPLOY.R6 (job 5) | live-executed | live-executed | met | `preview-diff.txt` + `preview-classification.md`: +1/~14/158-unchanged, zero replace/delete of any kind, no migrations, ~$0, no image roll ⇒ `record-deployment`/`deployments` row honestly not owed (deployed SHA unchanged `80db0d5`) |
| Live verify + test-notification path (job 6) | live-executed | live-executed | met | `verify-flow.md`: `sendVerificationCode` → `FAILED_PRECONDITION` (webhook types take no verification codes; no gcloud/API test verb) — the only test surface exhausted; sink's POST→200 on the same URL live-proven (receipts through 15:56Z); **residual owed-by-nature:** first natural incident-open receipt (0 `[slo] violation` in 6 h, 0 open incidents; no synthetic breach fabricated — out of authorized scope) |
| Close F-R6OPS.1-1 + GATE-LAUNCH note (job 6) | engineered | engineered | met | LEDGER resolution bullet (append-only demote); `GATE-LAUNCH.md` row-7 dated note; DEFERRALS `D-P1.22-2` dated tail |
| Records (job 7) | engineered | engineered | met | this ledger · `pr/R6OPS.2.md` · BUILD_INDEX 222 · LEDGER CURRENT STATE + PHASE LOG |
| Verify gates (job 8–9) | engineered | engineered | met | turbo 135/135 · `pnpm test` full suite green · `infra/pulumi` `tsc -p` clean · `check-build-memory.sh` 0 violations · `check-append-only.mjs` OK · ci-boundary JSON |

## Evidence log

- `gcloud secrets versions access latest` (never printed): scheme `https`, host class `run.app`,
  **no path/query/userinfo/fragment**, len 68 ⇒ bare-URL secret ⇒ `webhook_tokenauth`
  (project descriptors: only `webhook_basicauth`/`webhook_tokenauth`; tokenauth's sole label =
  `url`, "shared secret as a query string parameter" — the URL IS the token).
- `gcloud secrets versions access … | pulumi config set --secret --stack prod
  rhema:opsAlertWebhookUrl` → `Pulumi.prod.yaml` `secure:` ciphertext line only (diff verified —
  2 added lines, zero plaintext).
- `pulumi preview --diff --stack prod` → `+1 NotificationChannel create, ~14 AlertPolicy update
  (+notificationChannels), 158 unchanged` → `preview-diff.txt` (0 `run.app` occurrences).
- `pulumi up --stack prod` — **update 157, 26 s**: `+1 created ~14 updated 158 unchanged`.
- `gcloud alpha monitoring channels list` → 1 channel, `webhook_tokenauth`, enabled, created
  2026-10-23T21:32:35Z (`channels-list.json`, url redacted).
- `channels describe` url vs SM `latest`: **byte-equal** (sha256 equal, in-memory compare only).
- `gcloud alpha monitoring policies list` → **14/14** `notificationChannels` non-empty
  (`policies-channels.txt`).
- `curl :sendVerificationCode` → `400 FAILED_PRECONDITION "Cannot generate verification codes
  for a channel of this type."` — recorded in `verify-flow.md`.
- `gcloud logging read … ops_alert_received` — receipts through 2026-10-23T15:56Z (sink live).
- `incidents` list → 0 open; `[slo] violation` lines → 0 in last 6 h (no natural fire pending).
- Gates: `pnpm vitest` monitoring.test.ts 16/16 (+infra surface 99+3) · `pnpm test` full suite
  green · `pnpm turbo build lint typecheck` **135/135** · `tsc -p infra/pulumi/tsconfig.json`
  clean · `check-build-memory.sh .` 0 violations · `check-append-only.mjs --base c1f20f5` OK.

## Evidence report

**PR:** https://github.com/SteveVitali/Rhema/pull/216 · base `stevevitali/r6fix-1-findings-hardening`
· head `stevevitali/r6ops-2-alert-channels` · change commit `59e9dfe` + closeout commit.

**AC table** — see `## Gap table` above (every row `met` with file/log evidence; the
test-notification row is `met` at the armed layer with the owed-by-nature residual named).

**Gap-analysis summary:** the spec diff surfaced no missed requirement — the codebase already
carried the channel resource + policy wiring (P1.22 W9); the finding was purely the unbound
`rhema:opsAlertWebhookUrl` key, bound exactly per the finding's own remediation. Two
spec-judgment calls: (a) channel type `webhook_tokenauth` confirmed against the live descriptor
list + the SM payload shape (bare URL, no token material beyond itself); (b) stack-config secret
chosen over an SM plan-time read — the repo's only secret pattern is `rhemaConfig.getSecret`
(ciphertext in the committed stack file); no invoke-reads-SM pattern exists, and an invoke would
place the plaintext in state unmarked-secret.

**Verification summary:**
- Unit: `monitoring.test.ts` 16/16 (3 new channel-contract tests); infra surface 99 green at
  baseline; `infra/pulumi` `tsc -p` clean.
- Integration: n/a at the unit seam — the integration surface IS the live deploy (the Pulumi
  program's output against prod).
- Interactive/live: `preview --diff` (+1/~14/158, `[secret]`-masked) → `pulumi up` update 157 →
  `channels list`/`describe` (byte-equal URL, sha256-checked) + `policies list` (14/14) +
  sink-liveness receipts → `verify-flow.md`.
- Deploy gates: GD-DEPLOY.R6 classification in `preview-classification.md` (all four conditions
  PASS; `record-deployment` honestly not owed — no SHA/services change).
- Suite: `pnpm test` 515 files / 6,097 pass — one docker-build env flake
  (`privsep.docker.test.ts`, daemon stream EOF mid-`pnpm install`; unrelated to the diff — the
  same leg is CI-waived under GD-MAINT.4-1 and skips cleanly on retry); `pnpm turbo build lint
  typecheck` 135/135.
- Not run: no synthetic incident fabricated (out of authorized mutation scope); no preview-stack
  deploy (prod-only config key by design — previews never bind prod secrets, REQ-ARCH-38).

**Deviations/deferrals:** none opened. Honest residual (not a deferral — an owned observation):
first natural-incident receipt at the catcher rides D-P1.22-2's tail and the on-call runbook.

**CI:** `ci: pending — boundary read in flight (logs/ci-R6OPS.2.json)` at close; the
boundary-confirmed PHASE LOG note records the resolved read.
