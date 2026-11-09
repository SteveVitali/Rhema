# r7deploy-composed — post-acceptance prod deploy @ `ee40639d` — **DEPLOYED + provenance-PASS + `P1.pill` arm green** (records)

Run-time insert (the R7DEP.2/3 + r7deploy-tip2 precedent — records riding the deploy carrier so
PR #308 stays a clean 250i diff). **Base: `stevevitali/r7fix-9-paid-leg-pin`.**

## Authorization

Operator ruling 2026-11-09, verbatim (recorded `docs/build/LEDGER.md` PHASE LOG + GATE
DECISIONS): *"clock rows? can we expedite these somehow? i want you to do everything remaining,
including prod deploy, etc."* — disposition (b): `pulumi up --stack prod` at the newest composed
tip under the eight-condition discipline.

## Resume after the recorded pause

PR #309 (`r7deploy-tip2`) correctly **PAUSED** on git evidence: the then-named tip `13e7d9dc`
did not carry the sync-pill fix `96f6a2e7` (250h) — the composed tip the ruling describes did
not exist. The orchestrator has since composed it: **`stevevitali/r7deploy-composed` @
`ee40639d`** = `r7fix-9-paid-leg-pin` (250i paid-leg pin) + `r7fix-8-sync-pill` (250h sync-pill
fix) + `paid-u6-run` (#306 records), union-resolved on append-only records — carrying the REAL
deployed-product delta vs `b8307a40` (`packages/tokens/src/ide-css.ts` `.ide .ide-focus-exit`
scoping — the `D-R7FIX.8-1`/`D-R7DEP.3-1` payload).

## The eight conditions — all DONE

| # | Condition | Evidence |
| - | --------- | -------- |
| 1 | Preview walk/teardown | carried honestly — pr-293's all-16-green walk + zero-orphan teardown; R7DEP.3's proven-deploy discipline; the 250h delta leg-walked Stage-A on #307; no new preview (outside the ruling) |
| 2 | Image build | Cloud Build **`4e7ae7f5`** SUCCESS all-10 @ `ee40639d` → `rhema-prod` AR; run-task vendored-SDK assert PASS; digests re-verified vs AR |
| 3 | `pulumi preview --diff` | **10 updates + 1 replace, zero deletes, 169 unchanged** — 9 image rolls + MIG version pin; the one replace = stateless `rhema-prod-proxy-tmpl`; **zero stateful replace/delete; zero migrations; Δ≈$0 ≤$15** |
| 4 | `pulumi up --stack prod` | **update 176** (1m32s, zero destructive; proxy MIG rolled → `m4g8`/`g556`) |
| 5 | `check-deploy-provenance` | **all-PASS** — `rhema.tools` + `api.rhema.tools` → `ee40639d…` |
| 6 | `deployments` row | `prod:ee40639d`, `protocols_version 0.4.0+9c2b880dbee74bd8`, all-10 digests — operator IAP tunnel `rhema-prod-proxy-m4g8` |
| 7 | Rollback + corpus | committed rollback recipe (`b8307a40`/`e8883414` digest set) + corpus-in-web-image in-build `test -s` DONE inside `4e7ae7f5` on deployed digest `c9ce8640…` |
| 8 | CDN invalidate | `/bff/p/demo~*` on `rhema-prod-urlmap-6f2b86e` host `rhema.tools` submitted |
| 5′ | `P1.pill` prod arm | **PASS at `ee40639d`** — provenance-matched, $0, screenshots committed → `D-R7FIX.8-1` + `D-R7DEP.3-1` **DISCHARGED**; `D-R7FIX.7-1` residual met → **CLOSED** |

## Spend

Cloud Build ~18 min (~$0.8 list) + `pulumi up` Δ≈$0 + `P1.pill` prod read-only $0. Golden
non-affecting $0. No funded/paid arms.

## Status

- prod serves `ee40639d` (provenance-verified); `deployments` row written.
- `D-R7FIX.9-1` unchanged — R4's green verdict rides the Monday `journeys.yml` paid cron
  (leg-side; no deploy dependency).
- `nextTicket`/`lastCompleted` UNCHANGED (`200_R6WATCH.1` / `R7REC.1`).
- `mergePolicy: OPERATOR` — this PR is records visibility only; never self-merged.
