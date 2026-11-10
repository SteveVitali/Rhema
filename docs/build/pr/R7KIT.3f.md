## R7KIT.3f — the GUARD-1 migrate-tail (29-file residual batch, run-time insert)

**Stage A only, `$0`, unmerged** (`mergePolicy: OPERATOR`), stacked on `stevevitali/r7tour-2-repin`.

REQ-KIT-1 (RV-36 no-JS carriers), REQ-KIT-3 (per-batch enablement — this completes it), REQ-KIT-5, REQ-GUARD-1. Insert row per 249's own bound: the global `no-raw-controls` flip surfaced 340 diagnostics across 29 migration-uncovered files (~500–900 lines, ~4–6× the ~150 stop bound).

### What changed

- **All 29 census files migrated** — the dossier/report content family (15 `packages/ui` files), SPA shell surfaces (`app-shell`, `palette`, `chat-live`, `read-only`, `page-header`, `surfaces/run-report`, `surfaces/editor`), the demo SSR components (`demo-page`/`demo-markers`/`demo-banner`/`demo-effects`), plus `legal`, `chat-pane`, `gate-card`. **35 raw controls → primitives**; inline literals → `.ui-*`/`.ui-t-*` classes and the token map.
- **`uiTailCss()` — a second bounded stylesheet** (`packages/ui/src/ui-tail-css.ts`, 4,466 B ≤ asserted 5 kB) emitted beside `uiCss()` in `render.tsx` + `spa-shell.ts`. **`uiCss()` had 9 B of 24 kB headroom** — a bound bump would need a REQ-KIT-5 ruling, so the tail rides its own asserted bound instead. Same discipline: one function emits every `.ui-t-*` rule; values resolve onto the token scale where a step matches; computed colours/weights ride the `--d-sev`/`--d-w`/`--d-w2` custom-property seam.
- **Three named exemptions** (RV-36, no-JS carriers only): `dispositions.tsx` `HiddenField` + `ReasonRadio` (`reason_code` must post with JS disabled — a Radix radio needs client JS), `conversion.tsx` `HiddenField`. No style-literal exemptions.
- **GUARD-1 enabled** on all 29 files in `NO_RAW_CONTROLS_ENABLED`; the rule stays per-file — **the global `error` flip is 249's act and is not in this diff.**
- No-JS POST grammar parity: `name`/`value`/`method`/`action`/`data-*` carriers intact through the primitives (refund/duplicate/disposition/conversion forms verified).

### Two-session record

The first worker left the tree code-complete but unverified/uncommitted. This close fixed: stale-dist test failures (fresh build → 13/13), two missing tail rules (`ui-t-p410`, `ui-t-ml8` — full 119-class audit clean), the C10 inline-`background` leg (now asserts the `ui-btn--primary` class contract — same carrier the dossier banner ships), a `ui-tail-css.ts` bound comment (≤4 kB → ≤5 kB asserted, 4,466 B actual), prettier drift, and a `copy-containment` regex blind spot (`COPY.x.fmt.replace` read as a path segment — strip-one-segment retry, cannot mask a missing leaf).

### Verification

`turbo build` 13 ✓ · typecheck web+ui ✓ · eslint 0 errors · **AC-1 dry-run: 0 diagnostics** over the exact 122-file 249 scope (primitives + tests excluded; the flip uncommitted) · web sweep **1,662/1,662** (100 files) · ui **199/199** · rule **21/21** · `check:dom-contract`/`spa-entry-graph`/`spa-env`/`protocol-markers`/`demo-corpus` all OK · `uiCss()` **24,567/24,576** · `uiTailCss()` **4,466/5,120** · entry delta **+33.2 kB vs `04a4e98b`** (ceiling 307200 held; ≈ −0.2 kB this ticket — `GD-KIT3A-BUDGET`/`GD-SPA-ENTRY.R7` stand).

### Deferral

**D-R7KIT.3f-1 (OPEN):** Stage-B walk of the migrated surfaces at the R7b phase preview — `250_R7DEP.2`.

Full evidence: `docs/build/runs/R7KIT.3f.md`.
