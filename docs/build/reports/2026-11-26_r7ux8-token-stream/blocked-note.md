# R7UX.8 pr-425 walk — blocked 2026-11-26 ~06:15 UTC

AC6 (`chat.token` deltas on the run's SSE stream mid-turn) is BLOCKED on a dead upstream
credential — **the non-production Anthropic key is dead at the provider**, not on a defect in
this PR's plumbing. Every plumbing leg exercised is green; the run's engine never received a
token to forward.

## What ran

| Leg | Result |
| --- | --- |
| magic-link test identity (`test+jr7ux8tok@rhema.tools`, invite `prv-425-test`) | signed in, `is_test` workspace |
| scratch project via `POST /app/new {entry:"scratch"}` | 302 → `/p/untitled-3`, `/p/untitled-5` |
| turn POST `/p/<slug>/chat/turns` | 200 `{runId, state:"queued", planCard{capCredits:40}}` |
| SSE attach `/p/<slug>/r/<runId>/events` | 200 — replay + live tail healthy |

## Funding (audited operator seam, actor `devin-cli:r7ux-8`)

The fresh test tenant started at 0 spendable (`insufficient_balance` 402). Two `house-grant`
executions via a one-off in-VPC Cloud Run Job (api image, worker SA, `SYSTEM_DATABASE_URL` by
secret-ref — value never printed; job deleted after each run):

- 50 cr — ledger `01M8B62C7QJ6JDA7743TNG87ZM`, audit `01M8B62C80CDKFV3GYGPCX0MKJ`
- 50 cr — ledger `01M8B7EYBRKK1DKK9BSCTD1BWM`, audit `01M8B7EYC0TNFABMPC5M4XY499`

## Failure chain (live-diagnosed)

1. Run `01M8B6444QVZ9VKXRDPS0MDYBF` attempt 1: `GcsApiError` materializing work (transient).
   Heartbeat stale → `orphaned` → `reaper_resume` → `run.hiccup` — the resume machinery works.
2. Attempts 2–3: agent phase failed `API returned an empty or malformed response (HTTP 200) …
   body is JSON but not a Message … 0 stream events`. Root cause: **the egress-proxy MIG's
   `OPPORTUNISTIC` updatePolicy left the running VM on the deleted placeholder template**
   (`proxy-image = us-docker.pkg.dev/cloudrun/container/hello`) — the hello container answered
   :8443 with HTTP-200 non-Message bodies. `update-instances --minimal-action replace` recreated
   `rhema-pr-425-proxy-pqk4` on template `…-200d066` (`egress-proxy@sha256:d845ad7c…`), now
   HEALTHY.
3. With the real proxy serving: phase failed `Invalid API key · Fix external API key` — the
   relayed upstream 401. `rhema-pr-425-anthropic-api-key` v2 was a byte-identical copy of dev
   `anthropic-api-key` v2 (sha256 verified, never printed); dev v1 re-seeded as preview v3 —
   same 401.
4. Direct probe (operator shell, key in transient env, never logged):
   `POST api.anthropic.com/v1/messages` → **401 `authentication_error: invalid x-api-key`**
   (request `req_011ChR3Rbx1Fbw6bZtcAA1AS`). Both nonprod key versions are dead at the provider.

## Operator act needed

Mint/seed a valid **non-production** Anthropic key into `rhema-pr-425-anthropic-api-key`
(`versions/latest`; the proxy's ≤5-min periodic refresh rebinds without a restart) — or rule
that the prod key may ride in-window. Preview posture (`infra/config/stages.ts`
`PREVIEW_REQUIRED_SECRETS`) seeds the preview's own container from the non-prod key — never
`rhema-prod-*` — so borrowing prod is an operator ruling, not a build-env act. Dev's key has
been dead since at least mid-October (F-R6CNT.2-1: the dev value 401'd on prod then; the
operator's own key is what `rhema-prod-anthropic-api-key` v5 now holds).

## Resume notes

- Preview pr-425 is UP and healthy (real images @ f25bb4b2, real proxy, invites, billing
  funded). Once a key lands, re-run:
  `node docs/build/reports/2026-11-26_r7ux8-token-stream/walk.mjs <webOrigin> <outDir>`
- Balance at block time: spendable 30 / held 80 (two failed runs each hold 40 cr pending
  settlement). A further `house-grant` of ~50 cr (same one-off-job pattern) is needed if the
  holds have not released before the re-run.
- Failed runs: `01M8B6444QVZ9VKXRDPS0MDYBF` (3 attempts), `01M8B7G7622NKS9QEW5MY56R5X` (1
  attempt) — all `error_during_execution` at the agent call; zero model spend.

## 2026-11-26 — `.state/` session cache removed (P-1)

The walk script's `.state/test_jr7ux8tok_rhema_tools.json` held a live-at-capture
`__Host-rhema.session_token` cookie for the test tenant and was committed on
`f2420b09` (PR #425, merged). Removed forward per operator ruling P-1 (no session
tokens in records — even dead/test-tenant ones). The cookie is dead with the
pr-425 stack; the test tenant is `is_test` and holds no real data. The walk
script keeps writing `.state/` locally — it is now gitignored (`**/.state/`) and
the UX.9 run scrubbed its own copy pre-commit (`runs/R7UX.9.md`).
