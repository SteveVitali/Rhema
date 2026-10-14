# ARMB.2 — drain the presign-PUT body; harness settles for SPA timing

Stacked on `stevevitali/armb-1-spa-asset-base` (PR #170). Corrective follow-up from the
Arm B production rerun — see `docs/build/runs/ARMB-2026-10-14.md` §7 for the live triage.

## What this fixes

**T5 — presigned GCS PUT flagged `net::ERR_ABORTED` (app-side, benign but real).**
`fetch()` resolves on headers; neither upload site consumed the response body, so
Chromium kept the request entry open until the step's next document navigation aborted
it — the `requestfailed` sweep then reported a failure on a PUT whose bytes had landed
byte-complete (verified: object exists in `rhema-prod-user-content`, the `quarantineKey`
chain completed, connection row `status=ok`). Live-reproduced both directions:
unconsumed body + `goto` → `ERR_ABORTED`; `await put.arrayBuffer()` → `requestfinished`.

- `apps/web/src/spa/surfaces/voices.tsx` — drain the PUT body before the `ok` check.
- `apps/web/src/spa/surfaces/onboarding.tsx` — same drain in `presignPut`.

**N8 — harness race.** `waitForURL` resolves on the SPA client-side navigation while the
leaf's BFF twin is still in flight; `a[data-edit-source]` attaches on the first data
paint (~1 s live). The step now waits for attach instead of an instant `count()`.

**N4 — tracked drift actually fixed.** The §14.3 Included variant (trial tenants) carries
no `data-credits-line`; `sheetFigure`'s waiting `textContent` threw the full timeout
before its own Included fallback could run. Now count-probes first — the post-settle
variant is final. (Closes the N4 half of D-OBS.1-3's EST.1/ACT.1 reconciliation.)

**T7 — harness race.** `pgboss.send` rides the `send-it` connection and commits ~12 ms
after the delete response; the step probed `rhema_project_purge_schedule` once and raced
the enqueue (the job row exists and verifies). Now polls the probe for ≤15 s.

## Verification

- `voices.dom.test.tsx` 32, `onboarding` 19, `billing` 26, `run-sheet` 24 — all green.
- `@rhema/web` + `@rhema/journeys` typecheck/lint green; `check:dom-contract`,
  `check:spa-env`, `check:protocol-markers`, `check:spa-budget` green.
- Live probe on prod `d5a74cc`: unconsumed-PUT repro aborts; drained-PUT finishes clean;
  `data-edit-source` attaches ~1 s after nav on a fresh-tenant project leaf.

## Test plan

- [x] Focused DOM packs + typecheck + lint + public-safe gates
- [ ] Post-deploy re-run: T5/N8/T7/N4 on the deployed SHA — expected green-or-owed
