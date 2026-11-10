# Rhēma — operational readiness

> Rewritten 2026-10-10 by SPAREC.1 (`reconcile-build mode=backlog`, round-4 tail), alongside
> [`BACKLOG.md`](BACKLOG.md) / [`BACKLOG.csv`](BACKLOG.csv). Supersedes the 2026-10-04 REC.1 read —
> every round-4 disposition that changed a capability row is named. Every "owner" is a backlog row
> naming its landing. Evidence is the committed build memory: `docs/tickets/DEFERRALS.md`,
> `docs/build/LEDGER.md`, `docs/build/runs/*`, `docs/build/readouts/*`,
> `docs/build/COVERAGE_MATRIX.csv`, `docs/build/CAPSTONE_CLOSURE.md`.

## Verdict

**The round-4 frontend-SPA migration is engineered, deterministic-test green, and operator-gated at
the merge/deploy boundary — prod still runs pre-chain ancestors, so nothing round-4 is live yet.**

Read this in layers:

- **Engineered (verified in-repo, this chain):** the auth'd-surface SPA shell (ADR-106), all 14
  surface migrations, the `/bff/*` twin layer, the forever-SSR island set (ADR-107), code-owned
  forced-SSR for the Page family (phone UA + `showcase: true` via the BFF twin, ADR-108), the
  renderer-marker vocabulary (`data-renderer`/`data-mounted`/`data-route`), the `--expect-renderer`
  journey assert, and the cleanup wave that deleted the migration-window flag machinery
  (`?ssr=1`, `?renderer=spa`, `x-rhema-renderer`, `SPA_OVERRIDES`, `rhema:spaSurfaces`).
- **Fixture/deterministically verified:** every contract above is pinned by unit/dom/source-scan
  tests; SPACAP.2's executable baseline ran green on real prod
  (`reports/2026-10-10_SPACAP.2-public-ssr-baseline/` — 0 warnings, committed).
- **Live-executed: none of round 4.** Prod serves web `6ebb1cb…` / api `0acd16d…`, both pre-chain
  ancestors (`merge-base`-verified, 150/153 commits behind the round-4 tip). `/bff/app` is 404 on
  prod; the marker vocabulary is absent; no flagged surface exists. The harness's own refusal was
  exercised (provenance NO-MATCH, exit 1).
- **Operator-signed:** GATE-ACCEPT.SPA passed 2026-10-10 — all eight round-4 deviations ACCEPTED
  (`readouts/GATE-ACCEPT.SPA.md`); they stay open as tracking items on BL-83, not gate-blocking.

**Build state: `IN_PROGRESS`** — the live-verification tail, the ordered merge/deploy sequence, the
nightly bakes, and the historical round-3 obligations are all still owed and all tracked.

What stands between here and activation, in order:

- **The 15-segment activation cadence** (BL-81, SPACAP.2 runbook §3.1): the operator merges the
  chain bottom-up and deploys each SPAF boundary, honoring ≥1 nightly-green bake between segments
  (REQ-SEQ-10). The cleanup wave (PRs #158–#163) activates only after the `editor` flip's bake.
  Arm B (tip-deploy fallback) is recorded in the runbook.
- **The non-prod Resend secret** (BL-80): `rhema-nonprod-resend-api-key` is still `NOT_FOUND` in
  Secret Manager `rhema-507501` (probed on every SPA pass through SPA.25). It gates every `pr-<n>`
  preview leg — MAINT.6's session-mint proof, all `D-SPA.*-1/-2` preview legs/drills, D-OPS.1-1's
  signed-in preview suite. Prod legs do **not** need it (the live `rhema.tools` mailbox mints
  sessions). Never fabricated; never a repo secret.
- **Post-tip live verification** (BL-82): the composed suite with `--expect-renderer spa`, the
  two-tenant BFF probe, the public-SSR regression diff, the zero-CSP walk, the G2-fix live leg,
  and MAINT.4's OAuth sign-in legs — all SHA-matched to the deployed tip.
- **The historical path** (round-3 rows unchanged): the funded window, the operator rulings, the
  HUMAN gates (H2/H4/H5/H7), and the G2 hard gate all still stand (BL-01..BL-79).

## Post-migration operations facts (what changed for runbooks)

- **Forced SSR is code, not configuration.** The Page family's forced-SSR truth is the request
  path's own verdict — phone UA → SSR; `project.showcase: true` (BFF twin) → SSR + read-only.
  There is no renderer flag, header, query param, or Pulumi key left to consult; client SPA
  navigation mirrors the verdict via `twinForcesSsr` (ADR-108).
- **There is no flag rollback.** Post-SPA.28, rollback of any migrated surface is `git revert` of
  the cleanup commits + redeploy of the reverted images, then the per-surface verification legs
  re-run. The `rhema:spaSurfaces` stack key is deleted; `?ssr=1`/`x-rhema-renderer` are inert.
- **Activation is a sequence, not a deploy.** 15 segments bottom-up; each segment ends with its
  per-surface legs (`D-SPAF.*-1/-2`) and must show ≥1 nightly journey green (`D-SPAF.*-4`) before
  the next segment merges+deploys. The cleanup wave is segment 15's precondition, gated by
  `D-SPA.26-1/-27-1/-28-1`.
- **Provenance stays honest.** Any "live" claim requires `check-deploy-provenance --expect <sha>`
  all-PASS on web+api first. Today's prod is pre-chain: every round-4 live leg is owed until the
  tip deploys.

## Capability matrix

| # | Capability | Code state (highest layer reached) | Infra needed | Human gate (owner · due) | Proof |
|---|---|---|---|---|---|
| 1 | Sign-up, sign-in, admission | **Live.** Better Auth (Google + magic link), shared Redis throttle store; preview session-mint path code-complete (`preview-stack.mjs`, unit-pinned) | deployed | Operator seeds `rhema-nonprod-resend-api-key` (BL-80, D-MAINT.6-1) · before preview legs; H7 invite leg (BL-23) | `runs/SEC.2.md`; `preview-stack.test.mjs` |
| 2 | Tenant isolation + data security | **Live on prod SSR reads; engineered on `/bff/*`.** RLS role split live; SPA BFF twin layer session-gated + workspace-scoped with unit pins; two-tenant SPA probe is a post-tip leg | deployed | Post-tip two-tenant BFF probe (BL-82, D-SPACAP.2-2); pen-test procurement (BL-35) | `runs/SEC.1.md`; `bff.test.ts` |
| 3 | Import + ingestion | **Live.** Paste/upload/Substack path live; unchanged by the SPA migration (BFF twin re-serves the same data) | deployed | none blocking | `runs/ONB.1.md` |
| 4 | Review (core workflow) | **Live.** Delivers with research floor + preflight; CITE.1 pins queued per round-3 state | CITE.1 pins deploy (operator) | Funded-window probe legs (BL-67) | `runs/RES.1.md`, `runs/CITE.1.md` |
| 5 | Other workflows | **Mostly live.** draft/outline/profile_voice/chat delivered live; guard-refused legs ride the funded window | deployed | Operator product ruling (BL-20); funded window (BL-18/19) | `runs/DEF.1.md`, `runs/RUN.1.md` |
| 6 | IDE + migrated surfaces | **Engineered.** All 14 auth'd surfaces migrated to the SPA shell (code-complete, dom/unit-pinned); forever-SSR islands retain `page.js`/`ide.js` (ADR-107); forced-SSR Page family code-owned (ADR-108) | tip deploy via the 15-segment cadence | Per-surface prod legs + nightly bakes (BL-81); preview two-legs (BL-80) | `CAPSTONE_CLOSURE.md` §R4; `renderer-overrides.test.ts`; `SURFACE_GATES` |
| 7 | Payments (Stripe) | **Deliberately closed.** `purchaseMode:"closed"` deployed; unchanged by round 4 | deployed | Operator ruling `GD-BILL.3-1` + live-mode legs ≤$50 (BL-33/51) | `runs/BILL.3.md`, ADR-028 |
| 8 | Metering, ledger, reconciliation | **Live.** Proxy meter of record; `held>=0` convalidated; nightly `assertBalances` clean | none new | H7 admin/org key (BL-34); refund-window go-live ruling (BL-30) | `runs/DEF.4.md` |
| 9 | Estimation + pricing | **Live mechanism, open economics.** Single-source `surfacePricer`; pricing ruling operator-held | none new | Operator pricing ruling + metered flip + notice (BL-13/68/69) | `runs/EST.1.md`, `runs/ECON.2.md` |
| 10 | Export + data rights | **Mostly live.** Export + account zip live; clock/funded legs unchanged | deployed | Funded window + clock legs (BL-22) | `runs/CAP.3.md` |
| 11 | Notifications + inbox | **Live.** Digest + Inbox honest rows; inbox migrated to SPA in code | deployed | Per-flip inbox legs (BL-81, `D-SPAF.2-*`) | `runs/HOT.1.md` |
| 12 | Observability + SLOs | **Live and honest.** Corrected probes; named reds D-SLO.1-5..8; nightly journey bakes are now also the REQ-SEQ-10 activation pacing control | deployed | Named SLO remediation (BL-07); nightly bakes honored per segment (BL-81) | `runs/SLO.1.md`; `journeys.yml` |
| 13 | Infra, stages, delivery | **Partial — migration-ready.** Pulumi program carries the SPA services; `pr-<n>` preview machinery code-complete (blocked only on the Resend secret); prod provenance honestly pre-chain; rollback semantics are code-revert post-SPA.28 | `rhema-nonprod-resend-api-key` seed; ordered deploys | Operator: secret seed (BL-80) + 15-segment activation (BL-81) | `runs/OPS.1.md`; `preview-stack.mjs`; runbook §3.1 |
| 14 | Evaluation program (§18 / G2) | **Machinery only.** Unchanged by round 4; the hard gate stands | benchmark GCS bucket + principal | H2 corpus ≈$100k (BL-40/43/44/45) | `readouts/GATE-G2.md` |
| 15 | Content + claims | **Partial.** Showcase fixture drives the ADR-108 forced-SSR twin — the showcase leg is the G2 fix's live-verify target (D-SPACAP.3-1) | none | H5 essay + H4 venue stamps (BL-41/42) | ADR-062; `runs/GATE-G2` |
| 16 | Build memory + governance | **Trustworthy.** SPAREC.1 reconciled backlog — 465 expected sources, 0 orphans, verdict-consistent (incl. the BM-VERDICT-01 grammar repair, ADR-109); `check-append-only` + `check-build-memory` green at this commit | none | none — this pass lands it | this commit; `runs/SPAREC.1.md` |

## Critical path (ordered)

Each step names `ticket:` (backlog row → landing) and `proof:` (the artifact that shows it done).
Steps 1–3 activate round 4; 4–10 are the unchanged historical path to launch + §16.4 claims.

1. **Seed the non-prod Resend secret.** Operator seeds `rhema-nonprod-resend-api-key` in Secret
   Manager project `rhema-507501` (send-only Resend key on the prod account — the value never
   enters any ledger).
   ticket: `operator secret seed` (BL-80, D-MAINT.6-1) — proof: `gcloud secrets versions access`
   succeeds (NOT_FOUND → exists) recorded as a dated status-cell note on D-MAINT.6-1; the value
   itself is never printed or committed.
2. **Run the 15-segment activation.** Merge the chain bottom-up; at each SPAF boundary deploy, run
   the segment's marker curls + `--expect-renderer spa` legs (`D-SPAF.*-1/-2`), verify the
   rollback arm (`D-SPAF.*-3`), and require ≥1 nightly journey green (`D-SPAF.*-4`) before the
   next segment. The cleanup wave (PRs #158–#163) activates only after the `editor` flip's bake
   (`D-SPA.26-1/-27-1/-28-1` entry gates).
   ticket: `SPACAP.2 runbook §3.1` (BL-81) — proof: per-segment committed reports under
   `docs/build/reports/` + nightly `journeys.yml` greens + `check-deploy-provenance` all-PASS
   per deploy.
3. **Verify the deployed tip.** After segment 15: the full suite with `--expect-renderer spa`
   (D-SPACAP.2-1), two-tenant BFF probe (D-SPACAP.2-2), public-SSR regression diff vs the
   committed baseline (D-SPACAP.2-3), zero-CSP walk (D-SPACAP.2-4), the G2-fix live leg
   (D-SPACAP.3-1), MAINT.4 OAuth legs (D-MAINT.4-1). Then the preview-leg family once step 1's
   secret exists (every `D-SPA.*-1/-2`, D-OPS.1-1).
   ticket: `post-cadence verification` (BL-82, BL-80) — proof: `expect-sha`-matched reports with
   `consoleErrors:[]`/`failedRequests:[]` + flipped DEFERRALS rows.
4. **Run the funded live-verification window** (round-3 carryover): paid registry steps, full
   JOURNEY.1 suite, CAP.3/STB.5 residuals, RES.1/N6 legs, ECON.2 lever pairs.
   ticket: `round-4 funded window` (BL-16..19, BL-21/22, BL-56, BL-66, BL-67, BL-69, BL-71, BL-72)
   — proof: per-leg run ids + flipped D-rows; weekly metered spend within the $5 guard.
5. **Operator rulings on money surfaces.** `GD-ACT.1-1`, `GD-BILL.3-1`, `GD-RES.2-1`,
   metered-debit flip + notice, `D-DEF.4-3` refund-window go-live, pricing/lever rulings.
   ticket: `operator` (BL-13, BL-29, BL-30, BL-50, BL-51, BL-68, BL-75) — proof: dated GATE
   DECISIONS rows in `LEDGER.md` + live-verified config flips.
6. **H7 operator session** (one sitting): real invite signup, interactive browser/device legs,
   live-mode Stripe re-verify, admin/org key → usage.reconcile, exposure-window review,
   prod test-data cleanup.
   ticket: `HUMAN-H7` (BL-23, BL-24, BL-32, BL-33, BL-34, BL-37, BL-38) — proof: `invite_redemptions`
   row, real `cs_`/`sub_` ids, a `usage.reconcile` drift-%, the completed census + disclosure ruling.
7. **Get the named SLOs green.** D-SLO.1-5..8; each breach pauses feature work on its surface.
   ticket: `SLO.2` (BL-07) — proof: 7 consecutive green days on `rhema-prod — §13.5` + flipped
   D-rows.
8. **External security.** Pen-test procurement + triage.
   ticket: `operator` (BL-35) — proof: pen-test readout + zero open criticals.
9. **The G2 program** (hard gate). H2 corpus → live eval bindings → pilot wave → wave-1 LIFT read.
   ticket: `HUMAN-H2` (BL-40) → `GATE-G2` (BL-43/44/45) — proof: corpus in enclave with IAA floor;
   `readouts/GATE-G2.md` carrying PASSED.
10. **Close the build.** REC.2 spec reconciliation (BL-05), DOC.1/DOC.2 docs refresh (BL-06),
    round-4 maintenance incl. validator-stuck cells (BL-02), the final ledger read.
    ticket: `REC.2` → `DOC.1`/`DOC.2` → `SPAREC.2` — proof: `check-backlog.sh` still green;
    `LEDGER.md` `projectStatus: DONE` only when every open row has a landed disposition.

Off the critical path (owned, not sequenced): BL-25 dev/preview residuals, BL-31 matcher tuning,
BL-36 nightly golden, BL-39 H3 partner decision, BL-46 (accepted), BL-47/76/77/84 watch rows,
BL-73 spec-scheduled 1.x scope, BL-74 time-based soak windows, BL-78 funded-window residuals,
BL-83 accepted deviations (tracked; their re-verifiable arms ride steps 2–3).

## Cost and risk posture

### Measured costs (from committed run ledgers; credits at $0.01)

| What | Figure | Source |
|---|---|---|
| Prod infra (measured) | **$285.80/mo list** vs ~$50/mo target; billed-actuals export owed (D-OPS.2-1) | `runs/OPS.2.md`, ADR-082 |
| Per quick review | **~$7–10 metered**; cap-calibration data committed | LEDGER GD 2026-09-23 |
| Round-4 migration | **$0** — authored-dormant chain; no deploys, no prod mutations | `runs/SPA.*`, `runs/SPACAP.*` |
| Activation cadence | **$0 legs** — every `D-SPAF.*` leg and the composed suite are `paid:false` | `DEFERRALS.md` SPACAP.2 §0 |
| Preview legs (blocked) | **$0** — `pr-<n>` previews use `max_usd` $3/run guard + free legs | `runs/MAINT.6.md` |
| H2 corpus (not started) | ≈$100k across two quarters | manifest H2 |
| Live-mode Stripe legs | ≤$50 ceiling authorized; $0 spent (test mode) | `runs/STB.4.md` |

## Round-5 operational-readiness tail — 2026-10-17 (R5REC.1)

> Dated addendum — the 2026-10-10 body stays as written except where a row below names the
> supersession. Evidence: `readouts/GATE-ACCEPT.R5.md`, `docs/build/reports/2026-10-16_verif2/`,
> `docs/build/reports/2026-10-15_VERIF.1-*/`, `docs/build/reports/2026-10-16_COST.1/`,
> `docs/build/BACKLOG.csv` (reconciled this pass — 368 expected sources, verdict-consistent).

**Verdict update:** the chain tip is engineered + **preview-verified** (VERIF.2 live legs ran
green on `pr-186`), GATE-ACCEPT.R5 passed 2026-10-17 with all 14 deviations ACCEPTED as tracking
items — and **prod still serves pre-chain `ffbb8ad`**; no round-4/5 code is live. Merge/deploy
sweep stays operator-owned (`mergePolicy: OPERATOR`, BL-01 → BL-81 → BL-82).
`projectStatus: IN_PROGRESS`.

### What changed vs the 2026-10-10 read

| Then-stale fact | Now |
|---|---|
| `rhema-nonprod-resend-api-key` NOT_FOUND (capability rows 1/13, critical-path step 1, risk 3) | **Seeded by the operator 2026-10-16 (H8 item 1)** — `resend-pull` → `rhema:resendApiKey` → `seed-invite` → N2/N2.invite all green on pr-186; D-MAINT.6-1 DONE. Critical-path step 1 is complete; preview legs unblocked. |
| Preview-leg family unexecuted (BL-80) | VERIF.2 ran the wave on pr-186: **13 `D-SPA.*-1` rows discharged DONE** (D-SPA.12/13/14/15/17/18/19/21/22/23/25-1 + D-SPA.25-1 incl. T17 → REQ-ED-17 re-verdicted MET); **5 stay OPEN** — D-OPS.1-1 (signed-in suite), D-SPA.6-1, D-SPA.16-1, D-SPA.20-1, D-SPA.24-1 → REQ-OPS-5 honestly `MET-ENGINEERED`. |
| Prod cost $285.80 list | **$198.32/mo list** after COST.1 executed the H9-authorized class-A levers (`pulumi up` update 151); billed-actuals before/after read owed (D-COST.1-1); out-of-class levers (worker right-size + HA set) paused pending per-lever rulings (D-COST.1-3) — all on BL-29. |
| H8 operator bundle unscheduled | `docs/tickets/150_HUMAN-H8__operator-session-bundle.md` exists; 1/~12 items done — REQ-G1-5 PARTIAL → BL-86. |

### Soak / SLO posture

- **Soak:** D-OBS.1-2's 24h zero-MaxListenersWarning soak is DONE; the **first scheduled-nightly
  JOURNEY.1 green is merge-dependent** (`github.sha` = main HEAD ≠ chain tip) — REQ-OPS-6 → BL-74,
  named owner = the operator merge sweep.
- **Named-red SLOs stay OPEN:** `D-SLO.1-5`, `D-SLO.1-6`, `D-SLO.1-7`, `D-SLO.1-8` (BL-07) — each
  breach still pauses feature work on its surface; unchanged by round 5.
- **New live finding:** the `balance_divergence` alert paged 2026-10-15 — six included-bucket
  accounts at `expectedHeld=-3860`; classification is owed (R5OPS.1 finding (c)), homed with the
  first-finding measure on BL-24's family of ops residuals.
- **CDN usercontent delivery nonfunctional:** signed-URL edge + LB→`rhema-prod-user-content`
  origin read deny with `AccessDenied` 403 (config verified — `enableCdn`/`USE_ORIGIN_HEADERS`/
  `signedUrlKeyNames`); repair leg D-R5OPS.1-2 + REQ-OPS-3 PARTIAL → BL-24, needs an operator
  IAM/decision.
- **Nightly golden:** driver landed **fail-closed** (refuses without `GOLDEN_BUDGET_RULING=approved`
  + measured `--scores`; absent-manifest exit-0 is NON-EVIDENCE) — REQ-OPS-7 PARTIAL → BL-36;
  **the ~$150–300/night budget ruling `GD-R5OPS.1-1` is AWAITING the operator** — an agent must
  not answer it.
- **Funded wave:** `GD-FUNDED.1-1` = **CARRY** — the 21-leg funded wave stays owed on `D-CAP.2-1`;
  $0 spent; a future envelope ruling is required (REQ-FND-5..8 + REQ-G1-4 now honestly
  `MET-ENGINEERED(D-CAP.2-1)`).

### Operator flags standing after round 5

1. **Merge sweep** — operator-owned bottom-up merge + ordered deploys (BL-01/BL-81/BL-82); the
   round-5 chain tip is `stevevitali/r5cap-3-capstone-closure` (+ this reconcile branch).
2. **`GD-R5OPS.1-1`** — nightly-golden budget ruling, AWAITING (BL-36).
3. **`GD-FUNDED.1-1`** — funded-window envelope ruling, CARRY (BL-71/D-CAP.2-1).
4. **H8 session** — ~11 remaining items (BL-86 + the item rows it names).
5. **CDN IAM/origin decision** — usercontent signed-URL repair (D-R5OPS.1-2, BL-24).
6. **BL38.1 residue** — `prod:d5a74cc` deployments-stamp delete (operator write) + purge verify
   ~2026-10-30 (BL-85).
7. **Cost rulings** — out-of-class levers (D-COST.1-3) + billed-actuals export (D-OPS.2-1,
   D-COST.1-1) on BL-29.

`DONE` still requires every open row to land its disposition; this pass changed posture, not the
definition.

### Risks, ranked (2026-10-10 read)

1. **Activation ordering.** A wrong-order merge/deploy (or a tip-only deploy) jumps all-SSR→all-SPA
   with the flag-rollback path already deleted — the runbook's 15-segment cadence and Arm B
   fallback exist precisely for this (BL-81; REQ-SEQ-10's nightly pacing is unproven until real
   deploys — accepted deviation, BL-83).
2. **Rollback is heavier.** No flag exists post-SPA.28 — every rollback is `git revert` + redeploy
   + re-verified legs, which is slower than a config flip and has never been exercised live
   (REQ-SEQ-7, accepted). The runbook records the revert recipe per wave.
3. **The owed secret.** Every preview leg is one operator act away; the secret has been `NOT_FOUND`
   on ten consecutive probes — activation planning should not assume preview evidence exists
   (BL-80).
4. **Live-verification gap.** All round-4 claims are deterministic only until segment 15 deploys;
   six matrix rows stay PARTIAL as accepted tracking items (BL-83), and `MET-ENGINEERED` rows name
   their owed legs explicitly (ADR-109).
5. **Historical path unchanged.** Integration margin, spend-guard re-proof, named SLO reds, money
   rulings, exposure review, and the G2 hard gate are exactly as the 2026-10-04 read scored them
   (BL-01..BL-79).

## Round-7 tail — 2026-11-08 (R7REC.1)

> Dated addendum. Evidence: `reports/CAPSTONE_GAP_ANALYSIS_R7.md`, `readouts/GATE-ACCEPT.R7.md`,
> `reports/2026-11-08_R7DEP.2/`, `docs/demo-side-effects.md`, `BACKLOG.csv` (reconciled this
> pass — 420 expected sources, verdict-consistent). Live reads cited below.

### Round-7 capability matrix

| Capability | Code | Infra | Human (owner · date) | Highest layer | Proof |
|---|---|---|---|---|---|
| Public demo serving (`/demo` hub + four essays + tour) | shipped | demo corpus inside the web image (in-build content assertion); CDN invalidation `/bff/p/demo~*` on every deploy | none — deployed | live-executed | `runs/R7DEP.1.md`, `runs/R7DEP.2.md`; `D3.readonly`/`R11.demo`/`P1.demo`/`D1.hub`/`D2.tour` green at `4bc8cf4a`/`e578a767` |
| `demo_events` insert-only metrics path | shipped | `0061_demo_events.sql` applied on prod PG16 (owner `rhema_demo_writer` NOLOGIN, prosecdef, INSERT-only; `rhema_app` select denied); readers: ops/analytics queries via system role only | none | live-executed | `runs/R7DEP.1.md` Part B census; `demo-events.test.ts`; live `POST /a/demo` rows incl. `src=jrn` |
| R7b shell + keymap | shipped | none new | none | live-executed | `U1.shell`/`U2.noreload`/`U3.occlusion`/`U4.controls`/`U5.write`/`U6.chat`(stub)/`U7.import` green at `e578a767` (`prod-stageb/` + `t1f-legs/`) |
| Recurrence guards GUARD-1…4 in CI | shipped | none new | none | engineered | `guards-wiring.test.mjs`; `rhema/no-raw-controls` `error` 0 residue; `noreload.ts` sanctioned list; `u3UnscrimmedViolation` + tour arm; `ci.md` names all four |
| Hero-recording refresh rule | shipped | `hero-capture` recipe (`--web --expect-sha --out`, provenance + zero-cookie refusal + `checkHeroLimits`); re-capture only inside a phase preview, per 249a's recipe | none — assets committed | live-executed | `apps/web/public/media/hero-tour.mp4` 780,708 B + poster 5,769 B, sha256 in `licenses.exceptions.json`/`LICENSES.md`; manifest `violations: []` |
| Round-7 preview posture | history | one owned preview per phase under GD-PREVIEW.R7 (pr-259, pr-293 — both destroyed, zero-orphan sweeps; ≈$14/$20 measured) | expired at GATE-ACCEPT.R7 — **not standing authority** | live-executed | `runs/R7DEP.1.md`, `runs/R7DEP.2.md` teardown + spend records |

### Round-7 critical-path residuals (each names ticket + proof)

1. **Bespoke-capture walk** — ~32 dated Stage-B screenshot/probe arms (BL-104). ticket:
   `post-round Stage-B walk / HUMAN-H8` — proof: committed captures under `docs/build/reports/`
   at a deployed SHA + flipped D-rows.
2. **Defect insert** — F-9…F-14 + F-17 (BL-105). ticket: `post-round defect insert` — proof:
   each leg `--expect-sha` green at a deployed tip; D2.tour flips (D-R7TOUR.2-1).
3. **Paid U6 re-dispatch** — operator ruling only (BL-105, D-R7DEP.2-1). ticket: `operator` —
   proof: JSON 201 + streamed events + debited footnote; metered USD recorded (REQ-SPEC-32).
4. **`parseDraftLedgerSections` fix** — Roman-numeral `#` cells (BL-100, D-R7DEM.2c-1). ticket:
   `packages/protocols owner` — proof: `## Sections` unit test parses every row.
5. **Docs refresh** — REQ-CLOSE-4 (BL-107). ticket: `254_R7DOC.1` — proof: refreshed
   `apps/web/AGENTS.md` + docs set at the chain tip.
6. **Round-6 reconciliation** — nine OPEN rows (BL-106). ticket: `204_R6REC.1 / 205_R6REC.2`.

### Live reads (read-only, $0)

- `GET https://rhema.tools/healthz` → 200 `{"ok":true,"gitSha":"e578a767…"}` at
  2026-11-08T19:4xZ — prod serves the R7b deployed tip; provenance all-PASS recorded at the
  deploy (`deployments` row `prod:e578a767`, `runs/R7DEP.2.md`).
- Stack CI read: `ci-boundary.sh --stack --no-wait` recorded in `runs/R7REC.1.md` (BM-CI-01).
