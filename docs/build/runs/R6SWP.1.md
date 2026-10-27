# R6SWP.1 — post-merge nightly sweep (run ledger)

- **Spec:** `docs/tickets/197_R6SWP.1__post-merge-nightly.md` (manifest row 197, REQ-GO-2 /
  REQ-POST-4; gate pre-ticked by `GD-DEPLOY.R6` per the ticket header).
- **Normative loads:** `docs/tickets/DEFERRALS.md` (D-OBS.1-3, D-SPA.28-1 — the GO-2 nightly
  legs); LEDGER GATE DECISIONS `GD-MERGE-SWEEP.R6` (sweep discharged, `main` @ `0039850`
  contains chain tip `7413b17`), `GD-THRESH6.R6` (threshold 6 dispositioned as
  nightly-on-deployed-SHA; the literal `main`==prod arm lands post-launch-deploy — this run
  attempts it anyway as pre-staged evidence), `GD-DEPLOY.R6` (deploy conditions);
  `.github/workflows/journeys.yml`; `scripts/deploy-neutral-paths.txt` (the R6ENG.1/ADR-114
  allowlist); `docs/build/readouts/GATE-LAUNCH.md` threshold 6; BACKLOG BL-74/BL-81.
- **Base:** `origin/main` @ `9c90b00` (the HUMAN-H12 merge-sweep tip — all PRs #195–#224
  landed; prod serves `dc3a8f6`, so `main` ⊋ deployed until the launch deploy R6LCH.1).
- **Branch:** `stevevitali/r6swp-1-post-merge-nightly`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory
  + self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-GO-2 REQ-POST-4
- **Started:** 2026-10-27T14:38Z · **Closed:** 2026-10-27T18:1xZ
- **Live stage:** prod (read-only — the suite drives real prod surfaces; no prod mutation).
- **Production mutations (this ticket's named scope):** `pulumi up --stack prod` of `main`
  HEAD was **conditionally** named (deliverable 1: only if the `main`-vs-deployed diff is
  deploy-neutral under the R6ENG.1 allowlist) and **did not fire** — the diff carries
  non-neutral code (see below), so the deploy arm's own precondition is false. The
  `workflow_dispatch` of `journeys.yml` on `main` is the only prod-touching act.
- **Dispatch:** `gh workflow run journeys.yml --ref main` → run **40523029148**
  (stage=`prod` default, `paid=false` default → $0 legs only, `steps=""` → full registry;
  `github.sha` = `9c90b00f…` = `JOURNEY_EXPECT_SHA`).
- **Deploy-neutral verdict (deliverable 1's precondition):** `dc3a8f6` IS an ancestor of
  `9c90b00` (`git merge-base --is-ancestor` ✓), but `git diff dc3a8f6..9c90b00` carries
  non-allowlisted paths — `apps/run-task/src/work-reader.ts`,
  `packages/orchestrator/src/spend.ts`, `packages/protocols/{manifests,src,skills}`,
  `packages/contracts/src/sidecars.ts`, `infra/pulumi/Pulumi.prod.yaml`, `.gitleaks.toml` —
  so the drift arm cannot pass and no redeploy is authorized. Honest posture: `main` ⊋
  deployed until R6LCH.1.
- **ci:** pass #225@15f759e — boundary read `logs/ci-R6SWP.1.json` (run
  `40551865601`: fast-path 38s, contracts 36s, public-safe 55s, integration 4m23s,
  images 9m27s, typecheck/lint/unit 25m57s, ci-pass anchor 19s)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:

- **D-OBS.1-3** — nightly JOURNEY.1 green on the deployed SHA; its own recorded verifier is
  "a scheduled nightly report with `provenance == deployments.sha == github.sha == main
  HEAD`" — merge-dependent, still impossible while prod trails `main`. This run's dispatch
  is the substitute evidence; dated tail owed.
- **D-SPA.28-1** — REQ-SEQ-10 entry gate (all flips merged AND ≥1 nightly green since the
  last flip). The merge half is now satisfied (sweep discharged); the nightly-green half
  still wants the literal arm. Dated tail owed.
- BL-74 / BL-81 dispositions — BACKLOG rows naming these debts; dated dispositions owed.

## Requirements

1. Diff `main` HEAD vs deployed SHA under the R6ENG.1 allowlist; redeploy only if
   deploy-neutral (precondition false → no deploy; recorded).
2. `workflow_dispatch` of `.github/workflows/journeys.yml` on `main` — the substitute arm
   (never satisfies the "scheduled" claim; recorded which); poll to completion; per-leg
   pass/red-owed census vs the registry.
3. Restore the R6CI.1-paused `schedule:` block (the workflow's own marker names R6SWP.1 as
   the restorer — required for the literal arm to ever land post-launch-deploy).
4. DEFERRALS dated tails on D-OBS.1-3 + D-SPA.28-1 (dispatch-substitute evidence + what
   remains for the literal arm); BL-74/BL-81 dispositions.
5. GATE-LAUNCH threshold-6 dated note (run URL + verdict).
6. Records: this ledger + `pr/R6SWP.1.md` + PR + BUILD_INDEX row 231 + LEDGER
   (`nextTicket → 197a_GATE-LAUNCH` if the sweep lands).
7. Verify: `check-build-memory.sh .` 0 violations; `check-append-only.mjs --base 9c90b00`
   OK; `ci-boundary.sh --json docs/build/logs/ci-R6SWP.1.json`.

## Acceptance criteria

- [ ] Prod `/healthz` = `main` HEAD *(live-executed)* — **cannot hold yet** (main ⊋
      deployed until R6LCH.1; recorded honestly; carried by the threshold-6 literal arm)
- [ ] A scheduled nightly is green on `main` HEAD with a provenance match
      *(live-executed)* — same carry; this run supplies the dispatch-substitute arm
- [ ] Universal phase-gate AC *(agentic)*

## Plan

1. Branch off `origin/main`; dispatch `journeys.yml` on `main`; poll.
2. Restore the schedule block in `journeys.yml` (code change this ticket owns).
3. On completion: read per-leg results; census pass/owed/fail vs `registry.ts`;
   root-cause any new-layer failure (fix on-branch if owed) or record the honest blocker.
4. Records per the requirements list.

## Test matrix

Docs/workflow-only change — the dispatched run is the test (live evidence). Gates at
close: `check-build-memory.sh .` (+ `--staged`), `check-append-only.mjs --base 9c90b00`,
the journeys workflow YAML parse (the restored block is verbatim the pre-pause shape).

## Progress

- 2026-10-27T14:38Z — branch cut at `9c90b00` (origin/main, the merge-sweep tip).
  `gh workflow run journeys.yml --ref main` → **run 40523029148** dispatched
  (workflow_dispatch; `github.sha`=main HEAD; inputs default: stage=prod, paid=false,
  full registry — $0 legs only).
- 2026-10-27T14:39Z — deploy-neutral verdict computed: `dc3a8f6` ancestor-of `9c90b00` ✓
  but the diff is non-neutral (code + infra paths) → deliverable-1 deploy arm does not
  fire; `main` ⊋ deployed recorded.
- 2026-10-27T14:4xZ — `journeys.yml` `schedule:` block restored verbatim (the R6CI.1
  marker's named action for this ticket); both crons (`5 6 * * *` nightly $0,
  `35 4 * * 1` weekly paid) live again on merge.
- 2026-10-27T15:09Z — run `40523029148` **cancelled at the 30-min job timeout**
  mid-registry: checkout→install→build→Chrome→**WIF auth PASS**→suite ran 14:39→15:08Z,
  artifact uploaded (19 leg screenshots, `report.json` never written — the runner only
  writes it at the end). Root cause is NOT auth/CLI (both proved working): it is
  `timeout-minutes: 30` vs a >30m registry → **F-R6SWP.1-1**. Fix on branch: timeout
  30→180 + a `steps` dispatch input for bounded reruns + **per-leg incremental
  report flush** (`partial: true`) so a kill can never again erase leg evidence
  (runner.ts + runner.test.ts leg).
- 2026-10-27T15:15Z — chunk dispatch on `main` (steps=N1..N11) → run `40528915892`,
  suite completed in **13 s**: every session-minting leg closed `fail` on
  `iamcredentials signJwt 403 PERMISSION_DENIED` (N1/N2/N3/N4/N7/N8/N9); the anonymous
  legs passed (N2.invite, N10); N11 skipped (paid). Root cause: the auth step
  impersonated `service_account: vars.JOURNEY_CI_SA`, and that var points at the
  **mailbox SA itself** — an impersonated token's caller is that SA, which holds no
  self-signing grant; the declared tokenCreator binding (infra/pulumi/journeys.ts)
  covers the **WIF principalSet**, not the SA → **F-R6SWP.1-2**.
- 2026-10-27T15:19Z — first fix attempt (drop `service_account`, keep
  `token_format: access_token`) → run `40529512751` on branch `7c0aee4`: auth@v2
  **refuses** — `"must specify a service_account to use when generating an OAuth 2.0
  Access Token"`. Pivoted: keep the WIF credentials file, mint the federated token
  in the run step via `gcloud auth application-default print-access-token` over
  `GOOGLE_APPLICATION_CREDENTIALS`.
- 2026-10-27T15:2xZ — canary on branch `2208d25` (steps=N1,N2,N3) → run `40530477715`:
  **N1 8.0s PASS · N2 7.5s PASS · N2.invite PASS · N3 11.2s PASS** — signJwt works as
  the federated principalSet; the 3.7-min stalls of run 40523029148 were the signJwt
  retries. Run concluded `failure` on provenance only (expected branch SHA vs deployed
  `dc3a8f6`, `.github/workflows/**` non-neutral → drift arm fails closed — honest and
  expected until the launch deploy).
- 2026-10-27T15:3xZ — added a dispatch-only `expect-sha` input (schedule still pins
  `github.sha`) so a dispatch can assert provenance against the **deployed** SHA —
  the GD-THRESH6.R6 nightly-on-deployed-SHA arm. Cancelled the just-started
  `expect=github.sha` full run `40531703907` (~15 min in) and re-dispatched once:
  **run `40532657165`** — full registry, `stage=prod`, `paid=false`,
  `expect-sha=dc3a8f6…` on branch head `7714686`.
- 2026-10-27T16:41Z — run `40532657165` **completed**, first-ever full census
  (65/65 legs in ~61 min, ~$0): **22 pass · 21 paid-skip · 22 green-fail.**
  Fail classes: 15× shared magic-link 429 (stacked canary+sweep dispatches primed
  SEC.2's limiter — the known transient class), 4× `signJwt 401` at ~T+57min
  (T4–T7 — the once-minted env token hit its 3600 s lifetime mid-suite;
  F-R6SWP.1-2's completion), 2× missing `JOURNEY_DATABASE_URL` (R6F, T7) +
  1× missing `JOURNEY_T8_EXPORT_TOKEN` (T8 — operator-minted, ~7 d expiry, cannot
  be a static secret) = **F-R6SWP.1-4** env-gap finding; 1× N9 known fixture
  substrate. Run-note: this run's `expect-sha` pin was malformed (the dispatch
  input received the raw `/healthz` JSON — `expected` shows it in report.json);
  observed SHAs are recorded correctly on both origins.
- 2026-10-27T16:5xZ — F-R6SWP.1-2 completed: dropped the `JOURNEY_GCP_ACCESS_TOKEN`
  export entirely — the mailbox's gcloud-ADC fallback mints a **fresh** federated
  token per signJwt (no expiry ceiling). Canary `40543625818` (steps T4–T7,
  `expect-sha=dc3a8f6…` correctly pinned): **T4 19s · T5 218s · T6 9s PASS; T7 fail
  = `JOURNEY_DATABASE_URL` (the env-gap, not auth); provenance `match: true`** —
  first strict provenance match the workflow has ever produced.
- 2026-10-27T17:0xZ — re-drive of the 15 429 legs `40544946473` dispatched
  (steps N8,R10,R10.keepalive,T12F,T13F,T17,X1.*,T1,T2.*,T3; limiter had ~20 min
  to cool).
- 2026-10-27T17:3xZ — re-drive `40544946473` completed: **N8 48s · R10 11s ·
  R10.keepalive 10s · T17 10s PASS** (limiter cooled), then the limiter tripped
  again at leg ~4–5 — X1.voices/usage/home/inbox/detail + T1/T2.badge/T2.matrix/T3
  all 429'd at ~227 s. **The throttle is structural, not transient** — the prod
  magic-link budget (~4–5 sends/window) < the suite's ~20+ signup demand →
  **F-R6SWP.1-5**: an isolated nightly hits the same wall. T12F + T13F also
  surfaced `JOURNEY_DATABASE_URL` (F-R6SWP.1-4 grows to 4 DB legs + T8's token).
  Provenance `match: true` on `dc3a8f6` again.
- 2026-10-27T17:4xZ — **combined census across `40532657165` + `40544946473`:**
  29 free legs proven pass on the deployed SHA · 21 paid-skips · 9 429-blocked
  (F-R6SWP.1-5) · 5 env-gap (F-R6SWP.1-4) · 1 N9 fixture = 65.

## Gap table

| requirement / AC | layer | state | evidence |
|---|---|---|---|
| Prod `/healthz` = `main` HEAD | live | **NOT MET — carried** (`main` ⊋ deployed until R6LCH.1; deploy-neutral precondition false) | `dc3a8f6..9c90b00` non-neutral diff; healthz `dc3a8f6…` |
| Scheduled nightly green on `main` HEAD + provenance match | live | **NOT MET — carried** (dispatch-substitute only; literal arm needs deploy + restored cron + F-R6SWP.1-4 wiring) | runs below; `40543625818` provenance `match:true` on deployed SHA |
| Suite executes end-to-end in CI | workflow | **MET** — first full execution ever; 65/65 legs, report + 44 screenshots in artifact | `40532657165` |
| Per-leg census vs registry | report | **MET** — combined across `40532657165`+`40544946473`: 29 proven pass / 21 paid-skip / 9 429-blocked / 5 env-gap / 1 fixture = 65 | `report.json` censuses above |
| Restore paused schedule | code | **MET** — both crons verbatim | `journeys.yml` schedule block |
| Root-cause new-layer failures | code | **MET** — F-R6SWP.1-1 (timeout→180 + steps input + per-leg flush), F-R6SWP.1-2 (caller identity → WIF principalSet via ADC), both proven | `40530477715`, `40543625818` |
| New env-gap obstacles | finding | **OPEN — F-R6SWP.1-4** — R6F/T7/T12F/T13F need `JOURNEY_DATABASE_URL` (read-pool DSN — a prod secret; provisioning is the operator's posture call), T8 needs `JOURNEY_T8_EXPORT_TOKEN` (operator-minted, ~7 d expiry — cannot be a static repo secret; needs a live-mint step or reclassification) | census fail classes |
| Magic-link 429 | finding | **OPEN — F-R6SWP.1-5 (structural)** — SEC.2's shared limiter serves ~4–5 magic-link sends/window vs ~20+ suite demand; re-drive passed its first 4 then 429'd the rest. Remediation is an owner/operator call: exempt `test+*` tenants from the limiter, pace signups in the runner, or pre-mint session fixtures | `40544946473` census |
| DEFERRALS tails (D-OBS.1-3, D-SPA.28-1) | records | **MET** — dated tails appended; both rows stay OPEN on the literal arm | `docs/tickets/DEFERRALS.md` |
| Threshold-6 dated note | records | **MET** — run URLs + verdict, dispatch-substitute framing verbatim | `readouts/GATE-LAUNCH.md` row 6 |
| BL-74 / BL-81 dispositions | records | **MET** — dated dispositions (below) | run ledger |
| Records + PR + INDEX + LEDGER | records | **MET** — PR #225, INDEX row 231, LEDGER state+log+findings, run ledger, PR body | this ledger; #225 |
| Verify gates | records | **MET** — `check-build-memory.sh .` 0 violations (15 warnings, all legacy/pre-existing class); `check-append-only.mjs --base 9c90b00` **OK**; `ci-boundary.sh` **pass** at `15f759e` | `logs/ci-R6SWP.1.json` |

### Live findings opened/closed this run

- **F-R6SWP.1-1 RESOLVED-ON-BRANCH** — `timeout-minutes: 30` < registry runtime (first
  full dispatch cancelled mid-run, zero per-leg evidence). Fix: timeout 180 + `steps`
  dispatch input + per-leg `report.json` flush (`partial: true`; runner.ts + test).
- **F-R6SWP.1-2 RESOLVED-ON-BRANCH** — `service_account: JOURNEY_CI_SA` impersonated the
  mailbox SA itself → `signJwt 403` (self-signing not granted); auth@v2 then refused
  token output w/o SA; a once-minted env token `401`'d mid-suite. Final shape: caller =
  WIF principalSet via gcloud-ADC per signJwt — the identity journeys.ts grants, no
  expiry ceiling. Proven `40530477715` (4/4) + `40543625818` (3/4; T7's fail is the
  env-gap, not auth).
- **F-R6SWP.1-4 OPEN** — nightly-blocking env inputs: `JOURNEY_DATABASE_URL`
  (R6F, T7, T12F, T13F — a `rhema_app_login` read pool suffices) and
  `JOURNEY_T8_EXPORT_TOKEN` (T8). No repo secret exists today (`gh secret list` =
  TURBO_TOKEN only). Operator remediation options: wire `secrets.JOURNEY_DATABASE_URL`
  bound to the `rhema_app_login` read pool + env export (posture decision — a prod DSN
  in GitHub secrets); T8's mint expires ~7 d so it needs an in-workflow mint step or
  leg reclassification — owner STB.5a's call.
- **F-R6SWP.1-5 OPEN** — **structural**: the prod magic-link limiter serves ~4–5
  sends per window (SEC.2, shared) while a full $0 registry demands ~20+ signups.
  The re-drive proved it: 4 fresh signups passed immediately then the limiter
  throttled the rest. An isolated nightly cannot go fully green under the current
  policy. Options: exempt `test+*@rhema.tools` tenants from the rate limit; pace
  signup legs (runner-side spacing — a throughput workaround, not a policy fix);
  or pre-mint session fixtures for the fixture-family legs (X1.* share
  `test+jrn-b@`). Owner decision — recorded, not silently worked around.
- **Run-note (not an F)** — the `40532657165` `expect-sha` input was fed the raw
  `/healthz` JSON by the dispatching script (extraction bug in the dispatch command,
  not the workflow): `provenance.expected` records it verbatim; `observed` is correct.
  `40543625818` re-proved the arm with the correct pin (`match: true`).

### BL-74 / BL-81 dispositions

- **BL-74** (OBS.1 post-deploy evidence + nightly green): advanced — the suite now runs
  end-to-end in CI and strict provenance match on the deployed SHA is demonstrated
  (`40543625818`); the row's nightly-green leg is gated on the same literal arm as
  D-OBS.1-3 (launch deploy + restored cron + F-R6SWP.1-4 wiring). Not done — carried.
- **BL-81** (15-segment SPA activation cadence / cleanup-wave entry): the merge half is
  discharged (chain on `main`); the nightly-green clause carries as D-SPA.28-1's tail.

## Evidence log

- Run `40523029148` (https://github.com/SteveVitali/Rhema/actions/runs/40523029148) —
  `workflow_dispatch` on `main` @ `9c90b00`, full registry. Setup→build→Chrome→**WIF auth
  PASS**; suite ran 14:39:11Z→15:08:43Z, killed by `timeout-minutes: 30` → conclusion
  `cancelled`; artifact `12744937147` = 19 leg screenshots, no `report.json`
  (F-R6SWP.1-1's evidence loss — fixed by the per-leg flush).
- Run `40528915892` (https://github.com/SteveVitali/Rhema/actions/runs/40528915892) —
  chunk dispatch on `main` @ `9c90b00`, `steps=N1..N11`. Suite total 13 s: 7 session legs
  `fail` on `iamcredentials signJwt 403` (F-R6SWP.1-2), N2.invite + N10 `pass`, N11
  `skipped` (paid). `provenance.match: false` (expected `9c90b00` vs deployed `dc3a8f6`,
  non-neutral diff → honest NO-MATCH). `report.json` in artifact.
- Run `40529512751` (https://github.com/SteveVitali/Rhema/actions/runs/40529512751) —
  canary on branch `7c0aee4`: auth@v2 fails fast — `access_token` output requires
  `service_account`. Zero legs ran.
- Run `40530477715` (https://github.com/SteveVitali/Rhema/actions/runs/40530477715) —
  canary on branch `2208d25`, `steps=N1,N2,N3`: **4/4 legs PASS** (N1 8.0s, N2 7.5s,
  N2.invite 0.8s, N3 11.2s); `passed: true`, `partial` absent (final write intact).
  Conclusion `failure` = provenance exit only (branch SHA vs deployed, by design).
- Run `40532657165` (https://github.com/SteveVitali/Rhema/actions/runs/40532657165) —
  **the sweep**: full 65-id registry, `paid=false`, branch `7714686`, ~61 min.
  **Census: 22 pass · 21 paid-skip · 22 fail** (all fails are expected-green legs —
  zero `owed`, the registry carries no red rows).
  - pass (22): N1 N2 N2.invite N3 N4 N7 N10 R1 R5 R7 R8.showcase R8.prefs R8.inbox
    P1.public P1.project P1.pill P1.runsheet P1.outline P1.figures P1.dossier
    P1.app-new C1
  - paid-skip (21): T9 N5 N6 N11 R4 R6 R9 T10 T11 T12 T13 T14 T15 T16 B16 B17
    B18A B18B B19A B19B B19C — correct for `paid=false`.
  - fail (22): **429 class (15)** — N8(106s) R10 R10.keepalive T12F T13F T17
    X1.voices X1.usage X1.home X1.inbox X1.detail T1 T2.badge T2.matrix T3
    (~227s each, signup poll timeout on `Too many attempts — wait a few minutes`);
    **signJwt 401 (4)** — T4 T5 T6 T7 (env-token expiry ~T+57min; FIXED);
    **env-gap (3)** — R6F `JOURNEY_DATABASE_URL`, T7 same, T8
    `JOURNEY_T8_EXPORT_TOKEN` (F-R6SWP.1-4); **fixture (1)** — N9 `Buy 1,000
    credits` absent (known substrate — the BILL.3 fixture sub + `sk_test` state).
  - provenance: `match: false` — the `expect-sha` dispatch input was malformed
    (received the raw `/healthz` JSON instead of the SHA — run-note bug, not a
    provenance defect); `observed` correctly reads `dc3a8f6…` on web+api.
- Run `40543625818` (https://github.com/SteveVitali/Rhema/actions/runs/40543625818) —
  chunk canary on branch `9cf3ea9`, steps T4–T7, `expect-sha=dc3a8f6…`: **T4 19s ·
  T5 218s · T6 9s PASS; T7 fail = `JOURNEY_DATABASE_URL` env-gap. Provenance
  `match: true`** — first strict match on the deployed SHA the workflow has
  produced; ADC-per-call token path proven end-to-end.
- Run `40544946473` (https://github.com/SteveVitali/Rhema/actions/runs/40544946473) —
  re-drive of the 15 429 legs, `expect-sha=dc3a8f6…`, provenance `match: true`:
  **4 pass (N8, R10, R10.keepalive, T17) · 2 env-gap (T12F, T13F —
  `JOURNEY_DATABASE_URL`) · 9 still-429 (X1.*, T1, T2.badge, T2.matrix, T3)** —
  the limiter re-tripped at leg ~4–5: F-R6SWP.1-5 is structural.

## Evidence report

**Nightly verdict on `main`:** the repaired workflow is **proven end-to-end in CI** —
the first-ever complete executions (65/65 $0 legs, ~61 min + 15-leg re-drive, ~$0)
with per-leg evidence; two stacked CI defects (timeout/evidence-loss + caller
identity) found, fixed on branch, and re-proven; strict provenance `match: true` on
the deployed `dc3a8f6` demonstrated twice. The suite is **not yet green**: **29 free
legs proven pass**; the rest fail in three dispositionable classes — 9 magic-link-429
legs (F-R6SWP.1-5, structural limiter < suite demand), 5 env-gap legs (F-R6SWP.1-4,
operator-wired inputs), 1 N9 known fixture substrate. `main` ⊋ deployed until
R6LCH.1 — a dispatch is substitute evidence, never the scheduled-nightly claim; the
literal arm rides the restored 06:05Z cron post-deploy, and a full green needs the
two open findings dispositioned first.
