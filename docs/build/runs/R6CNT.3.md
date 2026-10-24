# R6CNT.3 — Showcase Full-board regeneration (run ledger)

- **Spec:** operator dispatch (per-ticket worker brief — no manifest ticket file; insert row).
  GD-REMAINING.R6 item 4: "approve all remaining tasks, proceed" — the bounded Showcase
  Full-board regeneration at **≤ $40 measured** (committed estimator floor $33.48).
- **Normative loads:** `docs/tickets/DEFERRALS.md` **D-R6CNT.2-1** (the row this run discharges) +
  **D-R6SECR.1-1** (the §12.8 live-exercise piggyback) · `docs/adr/ADR-121-*.md` (the authored-fixture
  deviation + revisit trigger) · `docs/build/runs/R6CNT.2.md` (the funding-gate record + deploy/seed
  path this run reuses) · `docs/build/runs/R6GLD.1.md` (the is_test workspace + house-grant funding
  seam + dispatch recipe) · `docs/tickets/194_R6CNT.2__showcase-build.md` (the prescribed mechanism:
  "the delivered bundle exported into the `SHOWCASE_FIXTURE` shape").
- **Base:** `stevevitali/r6ops-2-alert-channels` @ `be4c12d` (pushed chain tip at branch cut)
- **Branch:** `stevevitali/r6cnt-3-showcase-regen` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-10-23T23:08Z · **Closed:** 2026-10-24T00:04Z
- **Live stage:** prod — the brief's named mutations only.
- **Production mutations:**
  - ONE paid Full-board Review run of the Wells essay on the flagged `is_test` workspace
    `01M5M2C6NC3058T528ZX2D44SG` (GD-REMAINING.R6 ≤$40; never retried — a failure is recorded, not
    re-dispatched). Supporting rows on the same flagged workspace: one project + imported draft, one
    magic-link session mint for `test+jrn-gld@rhema.tools`. Funding path = the already-granted
    R6GLD.1 house grant (6,227 cr promo available ≥ the 3,348 cr declared cap — **no new grant
    needed**; `admin-cli house-grant` remains the documented seam if the balance had been short).
  - ~~a redeploy of the tip under `GD-DEPLOY.R6` carrying the regenerated `SHOWCASE_FIXTURE`~~ —
    **not executed**: the delivered bundle failed the Showcase contract (see Outcome); nothing
    redeployed, no image built.
  - ~~the showcase seed re-applied per R6CNT.2's own path (`prod-migrate-seed` +
    `showcase-seed-sweep`)~~ — **not executed**: the authored fixture stays; the flag workspace's
    showcase row is untouched, `/showcase` continues to serve the authored dossier.

  Rollback = `git revert` + redeploy; the showcase row is seed content — re-seeding the prior
  fixture restores it.

## Funding gate — the estimate re-check (recorded BEFORE any dispatch)

The estimator itself (`resolveEstimation`, `packages/run-sheet` dist — `estimator_cells` on prod is
EMPTY, verified over the system-role DSN in R6CNT.2 ⇒ the modeled estimators govern), same inputs as
the R6CNT.2 record (Wells `words:1640`, density-derived claims 7, 7 active phases at `full_board`):

| config | estimate | declared cap (`ceil(1.5×est)`) | cap USD | verdict |
|---|---|---|---|---|
| review · `full_board` · frontier (§6.5 default tier) | 10,043 cr | 15,065 cr | **$150.65** | > $40 |
| review · `full_board` · **base** (the cheapest legal tier) | 2,232 cr | 3,348 cr | **$33.48** | **≤ $40 → DISPATCH at base** |

Recomputed 2026-10-23T23:08Z — identical to the R6CNT.2 floor (the estimator is deterministic and
`estimator_cells` remains empty). The authorization is **≤ $40 measured** (`usage_records` list-USD,
the meter of record); the declared cap 3,348 cr bounds metered burn far below it (a clamped cap
cannot overrun). Workspace balance 6,227 cr ≥ 3,348 cr ⇒ no new grant.

## Deferrals read

- **D-R6CNT.2-1** (OPEN): the paid Full-board regeneration — THIS run discharges it (dispatch →
  export → `assertShowcaseFixture` green on the regenerated bundle → reseed → `/showcase` serves the
  real-run dossier).
- **D-R6SECR.1-1** (OPEN): the §12.8 live exercise — this run piggybacks: a real dispatched run
  exercises the live egress/attestation channel end-to-end (fetch_log egress rows through the proxy,
  the cited⇒fetched audit, `egress` decisions observable) + the run-task sandbox (two-uid / mount
  posture inspectable in-pod). The **planted-fixture legs** (canary, >256-char query, per-run domain
  cap, ≥12-word n-gram → `suspicious_query`/`egress.denied` pauses) need hostile fixture content the
  Wells essay does not carry — honestly carried, date-tailed.
- **D-P1.17-1/-2** (DONE / dated tails): unaffected — the real-essay content decision stands; the
  fixture's provenance upgrades authored → pipeline-produced.
- **F-R6GLD.1-1** (RESOLVED): the proxy key 401 cleared (v4); the model path is live — verified by
  the four completed `rerun1` legs. A 401 on this run's model calls = stop + flag first-line.

## Requirements

1. Re-estimate the Full-board run; > $40 → STOP (done above: **$33.48 → proceed**).
2. ONE real Full-board Review run of the Wells essay on prod `is_test` workspace (never retried).
3. From the REAL delivered run output: regenerate the `SHOWCASE_FIXTURE` bundle (letter, claims,
   findings, rubric, run-card figures, fetch audit); `assertShowcaseFixture` + seed tests green.
4. Reseed/redeploy per R6CNT.2's own path; verify `/showcase` renders the real-run findings live.
5. Piggyback: collect the D-R6SECR.1-1 §12.8 evidence the run exercises; date-tail the deferral.
6. Spend from `usage_records` reported; ≤ $40 total.
7. Records: this ledger + `docs/build/pr/R6CNT.3.md` + PR + BUILD_INDEX row 223 + LEDGER PHASE LOG +
   DEFERRALS updates + GATE-LAUNCH threshold-4 dated note (if showcase state changes) +
   `nextTicket` stays `196a_HUMAN-H12`.
8. Verify: `pnpm turbo build lint typecheck` touched packages + `pnpm test` touched +
   `check-build-memory.sh` 0 violations + `check-append-only.mjs --base c1f20f5` OK.
9. Push; `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R6CNT.3 --json docs/build/logs/ci-R6CNT.3.json`.

## Acceptance criteria

- [x] Fresh estimate ≤ $40, committed before dispatch *(deterministic — done: $33.48)*
- [x] One dispatched `review`/`full_board`/`base` run reaches a terminal state on the deployed SHA
      *(live-executed — `completed` on `80db0d5`, 7/7 phases)*
- [ ] `assertShowcaseFixture` green on the regenerated bundle — **NOT MET: the delivered bundle is
      contract-ineligible (0 contradicted tier-1 / 0 sourced claims); no swap; authored fixture
      stays** *(deterministic — measured, not waived)*
- [ ] `/showcase` signed-in dossier serves the real-run-derived findings — **NOT MET (blocked by the
      row above; `/showcase` continues to serve the authored dossier, unchanged)**
- [x] §12.8 exercised legs evidenced; the remainder honestly carried in D-R6SECR.1-1 *(live-executed —
      `reports/2026-10-23_R6CNT.3/live-exercise.md`)*
- [x] Measured spend ≤ $40 from `usage_records` *(live-executed — $10.68 list / 1,991 cr)*
- [x] The universal phase-gate AC *(agentic)*

## Plan

- `scripts/live/showcase-regen.mjs` — the driver (dry-run default): `--estimate` (deterministic
  re-check), `--dispatch` (provenance → is_test → balance → session mint → ingest → refined
  estimate → ONE launch → poll to terminal → measured spend → scores JSON), `--export <runId>`
  (delivered bundle → `showcase-bundle.json` over the system DSN + GCS object reads).
- Fixture swap in `packages/db/src/seed/showcase.ts`: the delivered bundle's letter/claims/
  findings/rubric/run-card/fetch-audit exported verbatim; V1 stays the verbatim essay (it IS the
  imported draft); outline + V2 + response letter stay authored (author-side work product a Review
  run never produces) — reconciled to the delivered findings; provenance annotated.
- In-pod §12.8 legs during the run (kubectl `runs` namespace): pod securityContext/uids, mount
  posture, the scoped second-read sequence where observable; post-run `fetch_log`/`access_log`/
  attestation reads.
- Reseed: `prod-migrate-seed` (additive lint in-band; `seedProtocols` upsert) + retire the flag
  workspace's authored showcase + `showcase-seed-sweep --seed`; redeploy under GD-DEPLOY.R6
  (10-image build → preview classify → up → provenance → record-deployment) so provisioning-time
  seeds carry the new fixture; live verify via a minted session → `GET /showcase` → dossier.

## Progress

- 2026-10-23T23:04Z — branch cut @ `be4c12d`; prod `/healthz` gitSha **80db0d5** on
  api+web (R6OPS.2's channel-only deploy did not roll images — confirmed at dispatch time).
- 2026-10-23T23:08Z — estimate re-check: base 2,232 cr / cap 3,348 cr = **$33.48 ≤ $40** →
  dispatch authorized. Workspace `01M5M2C6NC3058T528ZX2D44SG` confirmed live (is_test, member
  `test+jrn-gld@rhema.tools`, 6,227 cr promo available, inside the 26 h purge horizon).
- 2026-10-23T23:10Z — real-run findings shape probed on prod (R6GLD.1 `01M5MFYJ3…`): findings DO
  carry `anchor`/`suggestion`/`evidence`/`rubric_dims`/`letter_section`; claims carry
  tier/verdict/kind/note/source_check + `claim_sources`; the letter renders from GCS via
  `artifact_versions.s3_key` — the export reads both stores.
- 2026-10-23T23:11Z — `scripts/live/showcase-regen.mjs` + source-scan test landed; estimate
  committed to `reports/2026-10-23_R6CNT.3/regen-estimate.json`.
- 2026-10-23T23:13Z — **dispatch 1 → refused at $0.** `POST /runs` → `402 insufficient_balance,
  required: 6696`: the platform **circuit breaker is TRIPPED** (absorbed 643 / gross 3,069 = 20.9%
  > 5% over the trailing 24 h — REQ-SPEC-24.5), so the new-run hold sizes cap ×2 = 6,696 cr >
  6,227 available. A pre-dispatch refusal, not a run — the creation rolled back (no run row, no
  hold, $0). Honest note: the doubled hold does NOT change the estimator's declared figure
  ($33.48) — the bound stays ≤$40 measured; metered spend is clamped at the cap regardless.
- 2026-10-23T23:14Z — **house-grant top-up** (the documented funding seam; balance was the only
  shortfall): `admin-cli house-grant --billing-account 01M5M2C6NC8AF1VJNJBGQ9SW4F --workspace
  01M5M2C6NC3058T528ZX2D44SG --credits 1000 --expires 2026-10-25`, actor `devin-cli:r6cnt-3` —
  audited (`admin_actions` `01M5NGSCMSH6KZG9WQ6360M8J3`, ledger `01M5NGSCAXQHHVCGZETQ8V2EP5`).
  Balance → 7,227 ≥ 6,696.
- 2026-10-23T23:16Z — **dispatch (same tag `r6cnt3`, idempotent — never a second run):**
  provenance `80db0d5` both origins; magic-link session minted for `test+jrn-gld@rhema.tools`;
  project `01M5NGSSXW576BQZQHE8CZXH7M` (essay, 1,651 w — the verbatim Gutenberg v1 the fixture
  carries); refined estimate 2,232 cr / cap 3,348 cr; **run `01M5NGSTDRVN42JHTAA9C2SDDW`
  launched** review/full_board/base.
- 2026-10-23T23:45Z — **§12.8(f) live in-pod evidence** (pod `run-01m5ngstdrvn42jhtaa9c2sddw-a1-cxf7c`,
  ns `runs`, GKE `rhema-prod-run-task-gke-c13cb80`): harness uid 10001 (capEff
  setuid/setgid/sys_admin/sys_chroot) vs agent uid 10002 (capEff **none**); the credential
  injector listens 127.0.0.1:37799 → proxy 10.8.16.4:8443 — the agent uid holds no run token /
  provider credential; pod spec: AppArmor `rhema-run-task`, readOnlyRootFilesystem, drop ALL +
  SETUID/SETGID/SYS_ADMIN/SYS_CHROOT, fsGroup 10001, harness-secrets ro 0440. `[hook]` allow/deny
  lines enforcing the mount allow-list live. Evidence: `reports/2026-10-23_R6CNT.3/run-pod-spec.yaml`
  + `run-pod-log-*.txt`.
- 2026-10-23T23:52Z — **run `01M5NGSTDRVN42JHTAA9C2SDDW` → `completed`** (36.5 min, 7/7 phases
  committed, delivered 14 artifacts + 14 claims + 15 findings + rubric + letter). Meter of
  record (`usage_records`): **$10.68 list / 1,991 cr** across 117 rows — inside the ≤$40 bound.
  `runs.spent_credits` 697 = the proxy-metered rows exactly; ledger net −323 cr after the
  6,696-cr hold released and **both unclosed research phases auto-refunded** (verification 256 +
  discourse 120, REQ-SPEC-32 live) + 374 cr breaker-absorbed (`adjustment`).
- 2026-10-23T23:54Z — **the delivered bundle is CONTRACT-INELIGIBLE — the authored fixture stays.**
  `--export` wrote `reports/2026-10-23_R6CNT.3/showcase-bundle.json` (letter 24.2 KB, 14 claims,
  15 findings, 341 fetch_log rows). The run's own dossier self-reports: **verification never
  closed** — all 14 claims delivered `unverifiable` with `url NULL`, `source_check NULL`, **zero
  `claim_sources`** (finding 0, blocking: "0 of 14 inventoried claims were checked, including all
  three Tier-1 claims"); **discourse never closed** (finding 1, blocking: provenance of the text —
  possibly prior-published Wells — flagged, unresolved). Consequence: **zero contradicted
  tier-1 claims and zero fetched-source claims** → the verbatim bundle fails
  `assertShowcaseFixture`'s REQ-POS-3 half; the letter itself opens "this review is conditional."
  Per the deferral's own clause ("if its delivered bundle is materially better, re-export") and
  the brief's "replace only if appropriate," **no swap** — `SHOWCASE_FIXTURE` stays the authored
  H11-approved bundle (ADR-121 stands). The emit path was still proven (`--emit` → a valid
  generated module whose record independently confirms 0 contradicted tier-1 / 0 sourced claims).
- 2026-10-23T23:56Z — **F-R6CNT.3-1 opened** (LEDGER OPEN FINDINGS): the phase `done` gate accepted
  a schema-valid but *unclosed* claim ledger — verification exited 0 with `claimRowCount:14`,
  `inventoryCount:0` after spending its research budget on 185 searches / 41 fetches; the harness
  fact was visible at phase end but did not fail the phase. Downstream honesty worked (blocking
  findings + entailment-capped rubric + auto-refunds); the completion gate is the defect.
- 2026-10-23T23:58Z — **D-R6SECR.1-1 live-exercise evidence** collected:
  `reports/2026-10-23_R6CNT.3/live-exercise.md` — (a) full-board fetch through `fetcher` live
  (41 fetches + 185 searches through the credential-injecting proxy), (e) second-read isolation
  proven by `subagent_launches` (`second-reader`, `explicit_files`, `["drafts/v1.md"]` only),
  (f) two-uid sandbox + hook-layer allow/deny enforcement in the run's own `access_log`
  (Bash deny ×12, Glob deny ×20); (b)/(c)/(d)/`egress.denied` honestly carried — nothing hostile
  on the Wells essay, zero `deny` rows in `fetch_log`.

## Outcome — the honest middle

**Discharged:** the paid leg of D-R6CNT.2-1 — ONE real Full-board `review` run dispatched on the
deployed `80db0d5`, `is_test` workspace, completed inside its declared cap (697 / 6,696 cr card,
net charge 323 cr), measured **$10.68 ≤ $40** from `usage_records`. The pipeline-provenance proof
half-advanced: a real run DOES produce a real full-board dossier end-to-end (15 findings, a
24 KB letter, an 8-dimension capped rubric, the live fetch audit).

**Not discharged:** the run-produced regeneration. The delivered bundle fails the Showcase
contract (`assertShowcaseFixture`: no contradicted tier-1 claim, no fetched-source claim), and the
deferral's conditional ("materially better") is unmet — it is strictly *worse* than the authored
bundle on the contract axis. The authored fixture therefore stays; **no reseed/redeploy** (the
showcase state is unchanged — the R6CNT.2 reseed path was not re-run, `/showcase` continues to
serve the authored dossier, live-verified prior to close). `D-R6CNT.2-1` stays **OPEN** — dated
tail: the paid leg is done; what remains owed is a run that produces a *showcase-grade* bundle
(blocked on `F-R6CNT.3-1` at base tier, or a stronger-tier authorization).

**Landed for the discharge path:** `scripts/live/showcase-regen.mjs` (--estimate/--dispatch/
--export/--emit + fail-closed budget/provenance/tenant gates) and the `showcase.ts`
parameterization (per-target `DossierRunCard` — the Showcase binds the pipeline-produced card at
swap time; writable journey dossiers keep the authored card so the run-report fixture's
charged=spent=3,860 fold is untouched; real-run field robustness — `claims.url`/`normalized_url`,
`claim_sources.normalized_url`, null-safe evidence/rubricDims/anchor reads).

## Gap table

| requirement (brief) | result | layer |
|---|---|---|
| Re-estimate ≤$40; STOP if over | **PASS** — base cap $33.48 committed pre-dispatch (`regen-estimate.json`) | deterministic |
| `is_test`/operator-named workspace + funding path | **PASS** — `is_test` verified; 402 refusal resolved by the audited `house-grant` seam | live-executed |
| prod `/healthz` SHA at dispatch | **PASS** — `80db0d5` api+web | live-executed |
| ONE real Full-board run, never retried | **PASS** — `01M5NGSTDRVN42JHTAA9C2SDDW` `completed` (one run; the 402 attempt created no run row) | live-executed |
| Export the real delivered dossier | **PASS-as-export** — `showcase-bundle.json` committed verbatim | live-executed |
| Replace the authored fixture | **N/A by contract** — bundle contract-ineligible (0 contradicted tier-1 / 0 sourced claims); authored stays per ADR-121 | — |
| Reseed/redeploy + `/showcase` live verify | **N/A** (no swap); `/showcase` verified unchanged (200, Wells dossier serving) | live-executed |
| §12.8 piggyback evidence | **PASS partial** — (a)/(e)/(f)+hook-layer live; (b)/(c)/(d)/`egress.denied` carried on `D-R6SECR.1-1` | live-executed |
| Spend from `usage_records` ≤$40 | **PASS** — $10.68 list / 1,991 cr / 117 rows | live-executed |
| Records (ledger/PR/index/LEDGER/DEFERRALS/GATE-LAUNCH/nextTicket) | **PASS** — all written; `nextTicket` `196a_HUMAN-H12` preserved | — |

## Evidence report

- Run: `01M5NGSTDRVN42JHTAA9C2SDDW` — `completed`, started 23:16:17Z, ended 23:52:48Z (36.5 min);
  7/7 phases `done` (intake 43 / craft 53 / verification 137 / discourse 51 / second_read 25 /
  argument 82 / letter 107 cr); correspondence `01M5NJWVS5SQ0P2R5E4K3KKX7E` (`essay@1`, 14
  artifacts, 14 claims, 15 findings).
- Spend reconciliation (three surfaces, recorded together): `usage_records` Σ **$10.68 list /
  1,991 cr** (117 rows: proxy 697 cr/$4.996 + sdk_estimate 796 cr/$5.687 + sdk_stream 498 cr/$0)
  · `runs.spent_credits` **697** = the proxy rows exactly · `credit_ledger` hold 6,696 → debits
  699 → **refunds 376 (verification 256 + discourse 120)** → release 5,997 → adjustment 374
  (breaker-absorbed) → net **−323 cr** (balance 7,227 → 6,904).
- Contract-ineligibility detail: claims {tier1:3 (ordinals 1,4,7 — incl. the Paradoxides claim),
  all `unverifiable`}; `claim_sources` 0 rows; findings 0–1 `blocking` self-report the unclosed
  phases; rubric caps `evidence_accuracy`+`originality_situatedness` at 2 with
  `entailedByFindingOrdinal` reasons; letter opens with a conditional-review disclosure.
- `assertShowcaseFixture` on the emitted record (scratch `--emit` proof): contradicted tier-1 =
  **0** → would throw → authored fixture correctly retained.
- §12.8: `live-exercise.md` + pod spec/logs; `fetch_log` 341 rows all `allow` (0 `deny`);
  `access_log` hook decisions incl. 32 denies (mount allow-list); `subagent_launches`
  second-reader `explicit_files:["drafts/v1.md"]`.

**Deviations/deferrals:** none opened beyond the recorded `F-R6CNT.3-1` (a finding, not a
deferral) — `D-R6CNT.2-1`/`D-R6SECR.1-1` dated tails stand on the same rows. Honest residual:
the run produced a real dossier but not a showcase-grade one; whether the regeneration retries
at a stronger tier (fresh estimate then — likely >$40, new ruling needed) or waits on the
F-R6CNT.3-1 fix is the operator's call, recorded in the PR body's carries.

**CI:** `ci-boundary` reads **pass** at head `6e813fe` (run 40044496261 — fast-path + typecheck/lint/unit + contracts + public-safe + integration + images + `ci-pass` anchor; the first read timed out at 2700 s on the 39 m unit leg → job-polled green → re-read, the R6OPS.2 precedent); record `docs/build/logs/ci-R6CNT.3.json`.
