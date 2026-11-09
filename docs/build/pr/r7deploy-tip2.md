# r7deploy-tip2 — post-acceptance prod deploy @ `13e7d9dc` — **PAUSED: the named tip lacks the authorized payload** (records)

Run-time insert (the R7DEP.2/3 precedent — records-only PR riding the deploy branch so
PR #308 stays a clean 250i diff). **Base: `stevevitali/r7fix-9-paid-leg-pin`.**

## Authorization

Operator ruling 2026-11-09, verbatim (recorded `docs/build/LEDGER.md` PHASE LOG):
*"clock rows? can we expedite these somehow? i want you to do everything remaining,
including prod deploy, etc."* — disposition (b): `pulumi up --stack prod` at the newest
composed tip `ed906040` (250i's head — *"carries the sync-pill fix `D-R7FIX.8-1` + the
paid-leg pin"*) under the eight-condition discipline + fresh ruling.

## Why this run PAUSED — $0 spent, zero cloud mutations

**The tip the ruling describes does not exist.** Git-verified
(`docs/build/reports/2026-11-09_r7deploy-tip2/composed-tip-audit.txt`):

- `13e7d9dc` (the named tip = `ed906040` + the ruling-records commit) carries the paid-leg
  pin `12f6d889` (250i) but **NOT** the sync-pill fix `96f6a2e7` (250h). The two tickets were
  worked as **siblings** off `stevevitali/r7deploy-tip`: PR #307 (`r7fix-8-sync-pill`,
  the fix) and PR #308 (`r7fix-9-paid-leg-pin`, the pin) share merge-base `dc1ba197` — a
  fork, not a stack. No branch anywhere composes both.
- The fix is physically absent at `13e7d9dc`: `packages/tokens/src/ide-css.ts` still has the
  unscoped `.ide-focus-exit { display: none }` rule that loses the `.ui-btn` cascade (the
  exact F-R7DEP.3-1 mechanism); `D-R7FIX.8-1` doesn't exist in this branch's DEFERRALS.
- `b8307a40..13e7d9dc` carries **zero deployed product delta** — only journeys leg code
  (runs from a checkout, not an image) + `Pulumi.prod.yaml` re-pins (already live) + records.
  A deploy would roll 10 services product-identical, stamp provenance `13e7d9dc`, and write
  a `deployments` row reading as though the overlap fix is live — misleading evidence —
  while the `P1.pill` arm fails deterministically.

Per the eight-condition discipline, a payload/provenance mismatch → **PAUSE**, never proceed.
Composing the true tip (merge or rebase of the sibling PRs) is a canonical-order decision
under `mergePolicy: OPERATOR` + this run's "never merge" rule — it names which of #306/#307/#308
lands first and is recorded as the unblock in `runs/r7deploy-tip2.md`, not executed.

## Status

- prod unchanged: `/healthz` `build.gitSha` = `b8307a40` on web + api ($0 read).
- `D-R7DEP.3-1` stays **OPEN** with a dated note (the fix `96f6a2e7` is proven Stage-A on
  PR #307; the deployed re-walk rides the true composed tip).
- `D-R7FIX.9-1` unchanged — R4's green verdict rides the Monday paid cron (leg-side;
  no deploy dependency).
- `nextTicket`/`lastCompleted` UNCHANGED (`200_R6WATCH.1`).
- To resume: compose per `runs/r7deploy-tip2.md` § What unblocks, then re-run this arm at
  the composed SHA — identical procedure, plus the `P1.pill` arm gains its two row
  discharges (`D-R7FIX.8-1`, `D-R7DEP.3-1`).
