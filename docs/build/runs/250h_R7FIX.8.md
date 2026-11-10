# 250h R7FIX.8 — F-R7DEP.3-1: the sync-pill/focus-exit overlap (run ledger)

- **Ticket:** `docs/tickets/250h_R7FIX.8__sync-pill-occlusion.md` (run-time insert — the
  R7DEP.3 deploy walk's residual, `D-R7DEP.3-1`) · **Branch:**
  `stevevitali/r7fix-8-sync-pill` · **Base:** `stevevitali/r7deploy-tip` (`dc1ba197`) ·
  **Date:** 2026-11-09 · **Harness:** devin-desktop/swe-2-high/subagent
- **Scope:** the P1.pill leg's 1440×900 overlap, fixed honestly — the reader keeps BOTH
  affordances (the strip's `[data-sync-pill]` in write/read view; the `[data-ide-focus-exit]`
  reveal in focus view). Stage A only, **$0**, zero production mutations — the prod arm
  discharges on the NEXT deploy (`D-R7FIX.8-1`).
- **Evidence:** `docs/build/reports/2026-11-09_R7DEP.3/prod-legs{,-retry}/` — `P1.pill` FAIL
  deterministic ×2 at `b8307a40` (provenance-matched): `sync pill covers text at desktop:
  button "Exit focus · Esc"`.

## Root cause (reproduced, not inferred)

A cascade-order defect, not a geometry choice. The focus-view exit pill is authored as
hidden outside focus view — `.ide-focus-exit { display: none }` (`packages/tokens/src/ide-css.ts`).
But the carrier is a kit `Button` (`class="ui-btn ui-btn--secondary ide-focus-exit"`), and
`.ui-btn { display: inline-flex }` (`packages/ui/src/ui-css.ts`) ties `.ide-focus-exit` at
single-class specificity and wins on source order — so the hide declaration never applied.

Live-measured on a local `demoDataSource` server (pre-fix): `[data-ide-focus-exit]` computed
`display:flex` (`inline-flex` blockified by `position:fixed`) with a live rect at
`top:10px; left:50%` — an **invisible (`opacity:0`), hit-testable 116×29 overlay at
top-centre in EVERY view**, not just focus view. On `/p/:slug/v/working` at 1440×900 the
page strip's `synced ✓` pill sits at ~y26–46/x678–748 under the app-shell top bar; the exit
box covers ~y4–33/x662–778 — the ~7-px vertical intersection is exactly what
`pillTextOverlap` reported (`ix>1 && iy>1`). The invisible box also swallowed pointer hits
over the strip's controls — a real defect, never a sanctioned affordance (no U3-class
exemption taken).

The finding's "in focus view" wording was the deploy walk's inference; the leg's own failure
screenshot shows write view — the overlap lives in write/read view where the strip renders.
(Inside true focus view the `.page-strip` is `display:none`, so the pill owns no box there
by design.)

## Fix

`packages/tokens/src/ide-css.ts` — `.ide-focus-exit` → `.ide .ide-focus-exit` on the hide
rule: two-class specificity beats `.ui-btn`'s single class regardless of source order, so
the authored gate (`display:none` outside focus view) now holds. The reveal rule
`.ide[data-view='focus'] .ide-focus-exit { display: inline-flex }` (three class-level
selectors) still out-specifies it — nothing about focus view changed: the exit pill mounts
its box there exactly as REQ-WRITE-4 intends, and the strip (pill included) stays hidden.
No pill hidden to pass the leg; no exit control dropped.

## Verification (fresh `pnpm turbo build` 46/46 first)

- `pnpm turbo build` — 46/46 · `pnpm turbo typecheck lint` — clean on the touched set
  (tokens, journeys, web).
- **Live-Chromium repro, before/after** (local `demoDataSource` server — the demo mounts the
  identical hosted `.ide` chrome + the same emitted `ideCss()`/`uiCss()` pair):
  - pre-fix: `[data-ide-focus-exit]` computed `display:flex`, rect `{x:662,y:4,w:116,h:29}`
    in `data-view="write"` (the defect's own signature);
  - post-fix: `display:none`, zero rect in write view; `f`-chord → `data-view="focus"` mounts
    its box; Esc restores.
- **New local arm — `packages/journeys/src/p1-pill.local.test.ts` (2/2 green):** the leg's
  verbatim `pillTextOverlap` (exported from `steps.ts`) over the hosted `.ide` at 1440×900 —
  write view: exit `display:none`/zero box + probe `null`; focus view: exit pill boxed,
  strip's pill owns no box, probe `null`; seeded negative: a restyled exit box over the
  strip's pill makes the probe report `button "Exit focus · Esc"` (the guard can fail).
- `tokens.test.ts` — R7FIX.8 cascade pin (the scoped hide selector + the reveal rule + a
  no-bare-selector guard): `packages/tokens` vitest **48/48**.
- Full sweeps: `packages/journeys/src` **233/233** (all local arms incl. the new one +
  `occlusion-harness`'s focus-exit leg still green) · `apps/web/src` **1669/1669**.
- `check:dom-contract` · `check:spa-budget` (entry +33.3 kB cumulative vs `04a4e98b` —
  ~0 kB this ticket, CSS-string only; GD-KIT3A-BUDGET/GD-SPA-ENTRY.R7 stand) ·
  `check:spa-env` · `check:protocol-markers` · `check:no-cookies` · `check:licenses` — green.
- `pnpm format` (prettier `--check .`) — repo-wide drift, pre-existing (3247 files at base);
  **not** a gate this diff moves either way.

## Judgement calls

- **Fix location: the tokens stylesheet, not the leg and not the component.** The leg
  correctly flagged a live invisible hit-box — a product defect in the emitted CSS, not a
  leg strictness issue; the Button/emission stays untouched.
- **`.ide` scoping over `!important`.** The file's own convention is scoped selectors
  (`.ide-cheatsheet[hidden]`, `.ide-palette[hidden]`); one ancestor class is the smallest
  honest strengthening and keeps the focus-view reveal a pure specificity win.
- **No U3-class exemption.** The ticket's exemption arm was for a sanctioned overlap; an
  invisible hit-testable overlay over strip controls is unsanctioned by definition —
  recorded as the defect it is, not exempted.
- **Prod arm not run.** Stage A only per the ticket — `D-R7FIX.8-1` carries the deployed
  `--steps P1.pill --expect-sha` re-walk to the next deploy; `D-R7DEP.3-1` stays OPEN with
  the dated note that the owner fix landed at this head.
- **Concurrent-worker note:** a sibling run (`paid-u6-run`, its own branch) was mid-flight
  in this checkout during verification — its pending BUILD_INDEX/LEDGER/DEFERRALS rows and
  `runs/pr/paid-u6-run.md` are recorded by that worker on its own PR; this commit stages
  only the R7FIX.8 hunks/files. Local-arm screenshot side effects in
  `docs/build/reports/` + `docs/demo-side-effects.md` were restored, not committed.
- **Spend: $0.** Local browser legs only; no funded/paid arms, no deploy.
