# R7DEP.3 — post-acceptance prod deploy @ `b8307a40` (records)

Run-time insert (the R6DEP.2/3/4 precedent — records-only PR riding the deploy's own branch so
PR #304 stays a clean 250g diff). **Base: `stevevitali/r7fix-7-postround-defects`.**

## Authorization

Operator ruling 2026-11-08, verbatim (recorded `docs/build/LEDGER.md` PHASE LOG):
*"I'll handle merge myself. You can just deploy from latest open PR's branch tip right? …
Please proceed with everything and keep me updated."* — disposition (a): `pulumi up --stack prod`
at the latest PR tip under the same eight-condition discipline as `GD-DEPLOY.R7` (fresh ruling —
`GD-DEPLOY.R7` expired at the GATE-ACCEPT.R7 signature). Merges remain the operator's
(`mergePolicy: OPERATOR`).

## What shipped to prod

`e578a767` → **`b8307a401ba21a08cd15a7abcab2eb7c5743a506`** — the whole unmerged R7b stack tip:
R7DEP.2's prod deploy + GATE-ACCEPT.R7 records + R7CAP.1/R7REC.1 + **250g_R7FIX.7** (the six
acceptance-routed post-round defects: F-9 leg-side 206-ranged-media parity · F-10
nightly-evidence discharge · **F-11** closed-drawer `visibility:hidden` · **F-12**
`aria-selected`→`role="tab"` gate + FilesPane `ui-t-pm`→`ui-t-mut` · **F-13** native
`select[data-csl-style]`/`[data-md-profile]` · **F-14** native settings/review checkboxes).

## The eight conditions — all evidenced in order

1. **Preview walk + teardown — evidence carried, honestly labelled.** No NEW preview stood up
   (outside this authorization): pr-293's walk/teardown at `e578a767` (R7DEP.2 Part A) + this
   payload's legs being deploy-bound by definition (`D-R7FIX.7-1`).
2. **Image build** — Cloud Build `e8883414` SUCCESS, all-10 @ `b8307a40` → `rhema-prod` AR
   (12m14s; `_ALLOW_PLACEHOLDER_SDK=0`).
3. **`pulumi preview --diff` classified** — 10 updates + 1 replace, zero deletes, 169 unchanged;
   the ONE replace is the stateless `rhema-prod-proxy-tmpl` InstanceTemplate; **zero stateful
   replace/delete; zero migrations in the payload; cost Δ ≈ $0 ≤ $15**.
4. **`pulumi up --stack prod`** — update 175, 1m31s, zero destructive.
5. **`check-deploy-provenance` all-PASS** — `rhema.tools` + `api.rhema.tools` → `b8307a40`.
6. **`deployments` row** — `prod:b8307a40…`, `protocols_version=0.4.0+9c2b880dbee74bd8`,
   all-10 digests (operator IAP tunnel; re-established after the MIG roll, the recorded pattern).
7. **Rollback recipe committed** (run ledger § Part B — the `e578a767`/`7d470657` digest set) +
   **corpus-in-web-image** in-build `test -s` PASS on the deployed digest `977203e8…`.
8. **CDN invalidation** — `/bff/p/demo~*` on `rhema-prod-urlmap-6f2b86e`, host `rhema.tools`
   (dry-run == act, logs committed).

## `D-R7FIX.7-1` — prod leg arms at `b8307a40` ($0, provenance-matched)

**7/8 green** — F-11/F-12/F-13/F-14 all verified fixed at the deployed SHA:
`P1.project`, `P1.runsheet`, `P1.outline`, `P1.figures`, `P1.app-new` (axe clean), `T4` PASS;
`T5` PASS on retry (first-run `discovery listed 0 items` = flake, classified ×1 same-SHA rerun).

**Residual — F-R7DEP.3-1 (new finding, recorded not fixed):** `P1.pill` fails deterministic ×2 —
`[data-sync-pill]` overlaps `[data-ide-focus-exit]` ("Exit focus · Esc") at 1440×900 in focus
view. The F-11 pick itself is verified (the leg got past it); the overlap is a real surface
state the earlier red always masked. `D-R7DEP.3-1` opened; `D-R7FIX.7-1` → **partial** (the
four fix-verifications discharged; all-8-green criterion stays OPEN on the new finding).

## Spend / judgement calls

- Cloud Build ~12 min (~$0.5 list) + `pulumi up` (infra Δ≈$0) + prod read-only legs **$0**.
  No paid arms in this arm — the authorized `house-grant` + paid-U6 re-dispatch (ruling arm (b))
  rides `D-R7DEP.2-1` as a separate act.
- Judgement calls: (a) deploy rode carried pr-293 evidence, no second preview — recorded
  honestly, never claimed a fresh walk; (b) T5 first-run fail retried once at the same SHA
  per the flake-classification discipline; (c) `P1.pill` recorded as a NEW finding rather than
  an F-11 residual — different symptom class.

## Verify / evidence

- `runs/R7DEP.3.md` · `logs/r7deploy-tip/` (build log, digests, preview-diff, up,
  record-deployment, cdn) · `reports/2026-11-09_R7DEP.3/prod-legs{,-retry}/`
- `nextTicket`/`lastCompleted` UNCHANGED (`200_R6WATCH.1` — clock-bound).
- `mergePolicy: OPERATOR` — never merged by the run.
