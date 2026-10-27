# R6SWP.1 — post-merge nightly sweep

REQ-GO-2 · REQ-POST-4 · manifest row 197 · mergePolicy: **OPERATOR — do not merge.**

The round-6 merge sweep put the chain on `main` (`9c90b00`, tip `7413b17`). This ticket
executes the post-merge nightly: prove the repaired `journeys.yml` end-to-end in CI, read
the per-leg verdict, restore the paused schedule, and record honest evidence toward
GATE-LAUNCH threshold 6. Production still serves `dc3a8f6` — `main ⊋ deployed` until the
launch deploy (R6LCH.1); no deploy arm fired (the `dc3a8f6..9c90b00` diff is non-neutral
under the ADR-114 allowlist — see the run ledger).

## What this PR contains

1. **`journeys.yml` — the schedule restored** (the R6CI.1 pause marker's named action for
   this ticket): `5 6 * * *` nightly $0 legs + `35 4 * * 1` weekly paid, verbatim.
2. **`journeys.yml` — F-R6SWP.1-1 fixes:** `timeout-minutes` 30→180 (the first-ever suite
   execution, dispatch `40523029148`, was killed mid-registry at the 30-min ceiling and
   lost all per-leg evidence); a `steps` dispatch input for bounded reruns.
3. **`journeys.yml` — F-R6SWP.1-2 fix:** the repair-era auth impersonated
   `vars.JOURNEY_CI_SA` — which **is the mailbox SA itself**, so every session-minting leg
   closed ~1.5 s on `iamcredentials signJwt 403` (dispatch `40528915892`: 7 fails in 13 s).
   `auth@v2` also refuses `access_token` output without `service_account` (dispatch
   `40529512751`). The run step now mints the caller token as the **federated WIF
   principalSet** — `gcloud auth application-default print-access-token` over the exported
   credentials file — the identity `infra/pulumi/journeys.ts`'s tokenCreator binding
   actually grants. Canary `40530477715`: **N1/N2/N2.invite/N3 all PASS.**
4. **`journeys.yml` — dispatch-only `expect-sha` input:** a dispatch may pin the deployed
   SHA for an on-deployed-SHA green run (the GD-THRESH6.R6 arm); the schedule always pins
   `github.sha`.
5. **`packages/journeys/src/runner.ts` — per-leg incremental `report.json` flush**
   (`partial: true`): a wall-clock kill now leaves completed-leg verdicts behind (the exact
   evidence loss F-R6SWP.1-1 measured). Runner test leg added.
6. **Build memory:** run ledger `runs/R6SWP.1.md`, DEFERRALS dated tails (D-OBS.1-3,
   D-SPA.28-1), GATE-LAUNCH threshold-6 dated note, BUILD_INDEX row 231, LEDGER.

## Evidence (live-executed)

| run | ref | scope | result |
|---|---|---|---|
| `40523029148` | `main` `9c90b00` | full registry | **cancelled @30 min** — WIF/CLI/build all PASS; suite killed mid-registry (F-R6SWP.1-1) |
| `40528915892` | `main` `9c90b00` | steps N1..N11 | signJwt 403 on all 7 session legs (F-R6SWP.1-2); N2.invite+N10 pass |
| `40529512751` | branch `7c0aee4` | steps N1,N2,N3 | auth@v2 refuses token w/o service_account (intermediate fix) |
| `40530477715` | branch `2208d25` | steps N1,N2,N3 | **4/4 legs PASS** — federated-token fix proven |
| `40532657165` | branch `7714686` | **full registry** | first-ever complete census (~61 min): 22 pass / 21 paid-skip / 22 fail |
| `40543625818` | branch `9cf3ea9` | steps T4–T7 | T4/T5/T6 **PASS**, T7 env-gap; **provenance `match: true` on `dc3a8f6`** |
| `40544946473` | branch `9cf3ea9` | 15 429-legs re-drive | N8/R10/R10.keepalive/T17 **PASS**; limiter re-tripped at ~leg 4 — **structural** (F-R6SWP.1-5); T12F/T13F env-gap |

**Combined census on the deployed `dc3a8f6` (provenance `match: true` twice):**
**29 free legs proven pass** · 21 paid-skips (correct) · 9 magic-link-429 legs
(F-R6SWP.1-5: limiter ~4–5 sends/window < ~20+ suite demand) · 5 env-gap legs
(F-R6SWP.1-4: `JOURNEY_DATABASE_URL` ×4, `JOURNEY_T8_EXPORT_TOKEN` ×1 — operator
acts) · 1 N9 known fixture substrate.

## Honest limits (not claims)

- A `workflow_dispatch` is **dispatch-substitute evidence, never a scheduled nightly.** The
  literal arm — scheduled nightly green with `provenance == deployments.sha == github.sha ==
  main HEAD` — can only close after R6LCH.1 deploys `main` to prod AND the restored 06:05Z
  cron fires; until then every scheduled run reads provenance NO-MATCH by design.
- `main` ≠ prod: the conditional deploy arm's precondition (deploy-neutral diff) is false.
- **Two findings gate a fully-green nightly — operator dispositions owed:** F-R6SWP.1-4
  (wire `JOURNEY_DATABASE_URL`/`JOURNEY_T8_EXPORT_TOKEN` or reclassify the legs) and
  F-R6SWP.1-5 (the prod magic-link limiter < suite demand: exempt `test+*` tenants,
  pace signups, or pre-mint session fixtures).
- No GCP mutations: the signJwt fix rides the already-declared Pulumi binding; the mailbox
  SA's self-signing gap needed no new grant once the caller is the principalSet.

## Requirements stamped

REQ-GO-2 (nightly green evidence toward the gate) · REQ-POST-4 (post-merge sweep record).

## Verify

- `pnpm --filter @rhema/journeys typecheck` + vitest `runner.test.ts` 17/17 green.
- `check-build-memory.sh .` 0 violations; `check-append-only.mjs --base 9c90b00` OK;
  `ci-boundary.sh --ticket R6SWP.1` → `docs/build/logs/ci-R6SWP.1.json`.
- AC layers stated in the run ledger's gap table; the literal scheduled-nightly arm is
  carried openly (DEFERRALS tails + threshold-6 note).
