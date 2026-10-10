# SPAREC.2 — run ledger: spec reconciliation (the SPA spec describes the landed system)

- **Ticket:** `docs/tickets/145_SPAREC.2__spec-reconciliation.md` (manifest row 145)
- **Base:** `stevevitali/sparec-1-backlog-readiness` @ `020ba46` (the chain tip, confirmed
  clean + synced at fork — `020ba46659702c14e8fde6a30e2c9951232b251f`).
- **Branch:** `stevevitali/sparec-2-spec-reconciliation`.
- **PR:** #166 stacked on `stevevitali/sparec-1-backlog-readiness`;
  `gh pr checks --watch=false` read once at closeout (§ 8).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** `reconcile-build mode=spec` — documentation/spec reconciliation only,
  offline-only, $0, no deploys, no production mutations, mergePolicy OPERATOR.
- **Spend:** $0.

## 1 — What this run is

The spec's own versioning rule applies: `docs/frontend-spa-spec.md` was authored v1.0
*before* the build and describes the migration window — per-surface flags, renderer
overrides, parity legs — in the present tense. The round-4 chain landed a different,
simpler end-state; the operator signed all eight proposed deviations **ACCEPTED** at
GATE-ACCEPT.SPA (2026-10-10). This run amends the spec to the landed shape (**§14 Spec
amendments**, append-only — the v1.0 body is not rewritten), puts dated pointed
supersession notes on `docs/rhema-design-spec.md` where the SPA build supersedes its
renderer prose in practice, and records the fold in `00_MANIFEST.md § Spec amendments
applied`. **Nothing closed** — offline-only, $0, no deploy, no operator secret; every
owed live leg stays a named DEFERRALS row.

## 2 — What landed

### `docs/frontend-spa-spec.md` — v1.0 → v1.1 (+349 lines; §14, 17 amendments)

The status line gains the dated amendment clause; §0.4's TOC gains the §14 entry; §14 is
appended between §13 and Appendix A. Each amendment names **what v1.0 said → what shipped
→ what authorized it** (a signed gate row, an ADR, or the spec's own pre-authorized
clause). Topics:

| § | Amendment | Authorized by |
|---|---|---|
| 14.1 | Flag-machinery sunset executed: `spa-flag.ts`, `WebDeps.spa`, `deps.surfaces`/`spaOverrides`, `parseSpaSurfaces`, `SPA_RENDERER_HEADER`, `SPA_SURFACES`/`SPA_OVERRIDES` envs, `StageConfig.spaSurfaces`, `rhema:spaSurfaces` deleted; `?ssr=1`/`?renderer=spa`/`x-rhema-renderer` inert; `--pin-renderer` refuses; contract names kept as always-on vocabulary (stage facts removed) | REQ-SEQ-4's own sunset clause + R7; GATE-ACCEPT.SPA rows 1–2 |
| 14.2 | REQ-VFY-8's per-flip gate amended to the single renderer leg (`--surface`/`--expect-renderer spa` + marker curls + composed-suite fold) | GATE-ACCEPT.SPA row 1 |
| 14.3 | REQ-SEQ-9's flag-off DOM parity retired by design; `check:dom-contract` is the compensating control | GATE-ACCEPT.SPA row 2 |
| 14.4 | REQ-SEQ-7 rollback is revert-by-construction (`git revert` + redeploy + re-verified legs); destructive drills never run on live prod | GATE-ACCEPT.SPA row 5 |
| 14.5 | REQ-SEQ-10 nightly pacing binds activation order at merge/deploy (15-segment cadence + cleanup entry gates), not PR authoring | GATE-ACCEPT.SPA row 6 + the 2026-10-08T19:12Z ruling |
| 14.6 | REQ-VFY-10's owed steps (R6F, T12F, T13F, T17) stay `expected:"red"` — owed-reporting — folded into `D-SPACAP.2-1`'s composed suite | GATE-ACCEPT.SPA row 3 |
| 14.7 | REQ-VFY-6's journey-axe authoritative leg is owed; component-axe on the manifest subset is the interim tier | GATE-ACCEPT.SPA row 4 |
| 14.8 | REQ-ED-12 forced-SSR re-seated on code: boot map owns phone; `project.showcase` on the five BFF twins owns showcase → `twinForcesSsr` → `SsrHandoff` | ADR-108 + GATE-ACCEPT.SPA row 7 |
| 14.9 | The forever-SSR island set: SPA.26 retired `outline` only; `page`/`ide` are permanent forced-SSR islands; `landing` the public island; `editor` stays retired | ADR-107 |
| 14.10 | REQ-ED-17 Source mode landed: plain-text CodeMirror 6 async chunk (87.2 kB gz) on the PM doc/collab seam; `lang-markdown` measured over the REQ-SAFE-7 ceiling → dropped | REQ-ED-17's envelope (Q-8/R20) + design/30 |
| 14.11 | REQ-BFF-5 mechanism: form-mode refusals 302 to the sheet URL; JSON envelope untouched | REQ-BFF-5's contract + gate row 8's fold |
| 14.12 | `SsrHandoff` re-scoped to permanent cases only; redirect-only rows are `reloadDocument` stubs | matrix MET-DIFFERENTLY rows + gate row 8 |
| 14.13 | REQ-TST-1's retained net concluded: 42 test files rewritten to BFF/shell/refusal contracts; removal-detecting tripwires committed | REQ-TST-1's disposition map + REQ-SEQ-4 sunset |
| 14.14 | Polls-as-data sole posture on the migrated set; meta-refresh survives only on the permanent SSR set | REQ-BFF-15 + REQ-SEQ-4 sunset |
| 14.15 | REQ-SAFE-7/R25 bundle ceilings held as adopted — never needed calibration | R25's first-real-build clause |
| 14.16 | No-drift confirmations: v1.0-carried amendments (R11, R20, REQ-NAV-6, REQ-BND-11) executed as written | — (record completeness) |
| 14.17 | The live-verification posture: engineered + green at tip, **none deployed**; every live leg ledgered | GATE-ACCEPT.SPA row 8 |

**Six rows stay PARTIAL** (REQ-VFY-6, REQ-VFY-8, REQ-VFY-10, REQ-SEQ-7, REQ-SEQ-9,
REQ-SEQ-10) — the amendments record compensating controls; no PARTIAL re-labelled MET;
every owed live leg keeps its named DEFERRALS row. Spec↔matrix inventory preserved
666/666 (the union gate re-run green, §4).

### `docs/rhema-design-spec.md` — supersession notes only (+32 lines)

The landed body is not rewritten. Three dated `⚑ Supersession note — 2026-10-10` banners
at the contradicted spots, plus the status-line clause:

1. **§12 services table `web` row** — "React Router framework-mode SSR … SSR the shell
   then hydrate" superseded in practice: `apps/web` is the Hono document server +
   esbuild islands (ADR-012 as-built), extended by the Vite/TanStack SPA (ADR-106);
   surviving islands `page`/`ide`/`landing` (ADR-107); forced-SSR is code (ADR-108).
2. **§13.1 stack line** — "**Web:** React Router framework mode (SSR)" + "**Editor:**
   Tiptap MIT core" superseded: the landed editor is the hand-rolled PM mount (the SPA
   spec rejects TipTap); Source mode shipped as designed REQ-ED-17.
3. **§17 beta-path paragraph** — REQ-BETA-21's "CodeMirror edit mode survives as 1.x
   Source mode" shipped early as a designed feature (SPA.25); schedule language
   superseded, substance not.

### `docs/tickets/00_MANIFEST.md § Spec amendments applied`

One append-only log line: the v1.1 bump, the amendment topics, the six held PARTIALs,
the GATE-ACCEPT.SPA authorization, ADR-106/107/108.

## 3 — Deviations from the ticket contract

None. Docs-only; no code paths touched; no DEFERRALS rows opened or closed (nothing
this run unblocks — every owed leg needs a deploy, an operator act, or a funded window).

## 4 — Validator + gate results (all green at closeout)

| Command | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135** tasks |
| `pnpm test` | **487 files / 5,562 pass / 6 skip / 0 fail** — one transient `run-sheet.dom.test.tsx` parallel-load flake on the first pass (untouched file; 24/24 green in isolation; the same flake class SPACAP.3 recorded); full re-run green |
| `pnpm check:licenses` | OK — 822 packages |
| `pnpm check:protocol-markers` | OK — 248 files |
| `pnpm check:no-cookies` | OK — 253 files |
| `pnpm check:spa-budget` | OK — all ceilings held |
| `pnpm check:spa-env` | OK — 111 sources / 146 artifacts |
| `pnpm check:dom-contract` | OK — journey selectors ⊆ manifest ⊆ emitted+asserted |
| coverage-matrix test | 6/6 green — spec↔matrix inventory 666/666 preserved under the union rule |
| `check-backlog.sh` | **465 expected sources — complete + non-duplicating + verdict-consistent** |
| `check-build-memory.sh .` | **0 violations** (7 warnings — the pre-existing baseline class: manifest banners, gate-cell wording, ledger nextTicket ordering, phase-log sizes, legacy index values, readout guard, old Harness headers) |
| `check-append-only.mjs --base 020ba46` | **OK** |

## 5 — Source accounting

- Spec requirement-id inventory unchanged: **666 ids, exact 1:1 with the matrix** — §14
  cites existing ids only; no requirement was added, renumbered, or dropped.
- Matrix untouched this run: the six PARTIALs stay PARTIAL; `MET-ENGINEERED`/`WAIVED`/
  `MET-DIFFERENTLY` verdicts (ADR-109 grammar) stand as SPAREC.1 left them.

## 6 — What remains open (carried, not closed)

Everything: BL-80's Resend-secret family (operator act — `rhema-nonprod-resend-api-key`
still NOT_FOUND; prod legs need only the live `rhema.tools` mailbox), BL-81's 15-segment
activation cadence (operator merge/deploy), BL-82's tip verification (post-cadence),
BL-83's accepted deviations (tracked), BL-84's watches (standing), and the whole round-3
path unchanged (BL-01..BL-79). Prod still serves pre-chain ancestors — no live claim is
made anywhere in §14.

## 7 — Files changed

`docs/frontend-spa-spec.md` (v1.1 bump + §14 appended) · `docs/rhema-design-spec.md`
(status clause + three supersession banners) · `docs/tickets/00_MANIFEST.md` (one
spec-amendments-applied line) · `docs/build/runs/SPAREC.2.md` ·
`docs/build/pr/SPAREC.2.md` · `docs/build/BUILD_INDEX.md` (+1 row) ·
`docs/build/LEDGER.md` (state advance + phase-log append).

## 8 — PR checks

PR **#166** (`gh pr create --base stevevitali/sparec-1-backlog-readiness`; never merged —
mergePolicy OPERATOR). `gh pr checks --watch=false` read **once** at closeout
2026-10-10T15:56Z: **"no checks reported on the 'stevevitali/sparec-2-spec-reconciliation'
branch"** — the chain's recurring first-read class (identical on SPA.28/SPACAP.1..3/
SPAREC.1). Inherited `integration`/privsep red, if it reports later, is waived per
GD-MAINT.4-1 and would be recorded, not inferred.
