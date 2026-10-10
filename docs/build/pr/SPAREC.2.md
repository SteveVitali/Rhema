# SPAREC.2 — spec reconciliation: the SPA spec describes the landed system (v1.0 → v1.1) + pointed supersession notes on the product spec

Manifest row 145 · stacks on `stevevitali/sparec-1-backlog-readiness` @ `020ba46` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
offline-only, no deploys, no production mutations.

Implements `docs/tickets/145_SPAREC.2__spec-reconciliation.md`
(`reconcile-build mode=spec`). The round-4 tail's spec pass: `docs/frontend-spa-spec.md`
was authored v1.0 before the build and still describes migration-window machinery in the
present tense; the chain landed, the operator signed all eight SPACAP.3 deviations
**ACCEPTED** at `docs/build/readouts/GATE-ACCEPT.SPA.md` (2026-10-10), and this PR amends
the spec to the as-built record — **§14 Spec amendments** appended, the v1.0 body left
byte-standing as history.

**Requirement IDs:** REQ-SEQ-1..4/-5/-6/-7/-9/-10/-11, REQ-VFY-4/-6/-8/-9/-10,
REQ-FW-3/-4/-7, REQ-BND-11, REQ-INV-5/-8, REQ-ISL-1/-4/-11, REQ-TL-12/-13,
REQ-BFF-5/-15, REQ-ED-12/-16/-17, REQ-NAV-6/-9, REQ-TST-1/-2, REQ-SAFE-6/-7,
REQ-SPEC-29/-31, REQ-BETA-21. **ADRs:** 106 (the SPA build), 107 (forever-SSR island
set), 108 (twin-flagged showcase handoff), 109 (verdict grammar — context).

## What landed

### `docs/frontend-spa-spec.md` — v1.0 → v1.1, §14 appended (17 amendments)

Every amendment names what v1.0 said, what shipped, and the record that authorized it
(signed gate row, ADR, or the spec's own pre-authorized clause):

- **§14.1 — the flag machinery's sunset executed** (authorized by REQ-SEQ-4's own sunset
  clause + R7; consequences signed GATE-ACCEPT.SPA rows 1–2). `spa-flag.ts`,
  `WebDeps.spa`/`deps.surfaces`/`deps.spaOverrides`, `parseSpaSurfaces`,
  `SPA_RENDERER_HEADER`, the `SPA_SURFACES`/`SPA_OVERRIDES` env emissions,
  `StageConfig.spaSurfaces`, `rhema:spaSurfaces` — all deleted. `?ssr=1`,
  `?renderer=spa`, `x-rhema-renderer` are inert request text; `--pin-renderer` refuses
  (exit 2). **Stage-fact disposition:** the contract names stay as always-on
  *vocabulary* — configuration removed, names kept.
- **§14.2 — REQ-VFY-8 single-leg recipe** (gate row 1): leg A is unexecutable post-sunset;
  the surviving recipe is `--surface <key> --expect-renderer spa` + marker curls + the
  folded composed suite.
- **§14.3 — REQ-SEQ-9 flag-off parity retired by design** (gate row 2); the compensating
  control is `check:dom-contract` + the dom suites on the surviving documents.
- **§14.4 — REQ-SEQ-7 revert-by-construction rollback** (gate row 5): `git revert` +
  redeploy + re-verified legs; destructive live drills deliberately never run.
- **§14.5 — REQ-SEQ-10 pacing-as-cadence** (gate row 6): binds activation order at
  merge/deploy (the 15-segment cadence + cleanup-wave entry gates), not PR authoring.
- **§14.6 — REQ-VFY-10 owed steps folded** (gate row 3): four `expected:"red"` registry
  steps (R6F, T12F, T13F, T17) report owed until their first prod legs inside
  `D-SPACAP.2-1`.
- **§14.7 — REQ-VFY-6 component-axe interim** (gate row 4): per-component axe on the
  interactive-manifest subset holds until the journey-level leg runs live.
- **§14.8 — REQ-ED-12 via ADR-108** (gate row 7): the boot map owns the phone leg; the
  BFF twin's `project.showcase` owns the showcase leg → `twinForcesSsr` → `SsrHandoff`.
- **§14.9 — the forever-SSR island set (ADR-107):** SPA.26 retired `outline` only;
  `page.js`/`ide.js` are permanent forced-SSR islands, `landing.js` the public island;
  `editor.js` stayed retired (SPA.24).
- **§14.10 — REQ-ED-17 Source mode** (SPA.25): plain-text CodeMirror 6 (async chunk,
  87.2 kB gz) on the same PM doc/collab seam; `@codemirror/lang-markdown` measured over
  the REQ-SAFE-7 ceiling → dropped (design/30 records the restore seam).
- **§14.11 — REQ-BFF-5 mechanism:** form-mode refusals redirect to the sheet URL (no SSR
  document left to re-render); the JSON envelope untouched.
- **§14.12 — boundary/nav re-scope:** `SsrHandoff` covers only the permanent cases;
  redirect-only rows are `reloadDocument` stubs (REQ-INV-8/REQ-FW-4/REQ-FW-7
  MET-DIFFERENTLY).
- **§14.13 — REQ-TST-1's retained net concluded** (SPA.27): 42 test files rewritten per
  the research/04 disposition map; removal-detecting tripwires committed.
- **§14.14 — polls-as-data sole posture** on the migrated set (meta-refresh stays on the
  permanent SSR set only).
- **§14.15 — REQ-SAFE-7 ceilings held as adopted** (R25; never needed calibration).
- **§14.16 — no-drift confirmations:** the v1.0-carried amendments (R11/REQ-SAFE-6,
  R20/REQ-ED-17, REQ-NAV-6 keying, REQ-BND-11's honest floor) executed as written.
- **§14.17 — the live-verification posture** (gate row 8): engineered + deterministic-green
  at the chain tip, **none deployed** — prod serves pre-chain ancestors (`6ebb1cb…` web /
  `0acd16d…` api); every live leg stays a named OPEN deferral.

**The six verification-procedure rows stay PARTIAL** (REQ-VFY-6, REQ-VFY-8, REQ-VFY-10,
REQ-SEQ-7, REQ-SEQ-9, REQ-SEQ-10) — the amendments record compensating controls; no
PARTIAL was re-labelled MET.

### `docs/rhema-design-spec.md` — supersession pointers only (landed body untouched)

Dated `⚑ Supersession note — 2026-10-10` banners at the three places the product spec's
renderer prose is superseded in practice: the §12 services-table `web` row ("React Router
framework-mode SSR … hydrate"), §13.1's stack line ("**Web:** React Router framework
mode (SSR)" + "**Editor:** Tiptap"), and the §17 beta-path paragraph (REQ-BETA-21's
CodeMirror stopgap shipped early as designed REQ-ED-17). Status line amended; the
landed body is not rewritten.

### `docs/tickets/00_MANIFEST.md` — § Spec amendments applied

Append-only log line recording the fold-back (v1.1 bump, the amendment topics, the six
PARTIALs held, GATE-ACCEPT.SPA authorization).

## Closed vs carried

Nothing closed — offline-only, $0, no deploy, no operator secret. All 465 expected
backlog sources stay homed; every owed live leg remains a named DEFERRALS row
(`D-SPA.*`, `D-SPAF.*`, `D-SPACAP.*`, `D-MAINT.6-1` — the still-NOT_FOUND non-prod
Resend secret gates previews only).

## Verify

`turbo build lint typecheck` 135/135 · `pnpm test` 487 files / **5,562 pass / 6 skip /
0 fail** (one transient `run-sheet.dom.test.tsx` parallel-load flake on the first pass —
24/24 green in isolation and green on the full re-run; the same untouched-file flake
class SPACAP.3 recorded) · all six `check:*` green (licenses 822 · protocol-markers ·
no-cookies 253 · spa-budget · spa-env · dom-contract — 666/666 spec↔matrix inventory
preserved) · coverage-matrix test 6/6 · `check-backlog.sh` clean at 465 sources ·
build-memory 0 violations / 7 pre-existing-class warnings · append-only OK vs `020ba46` ·
`gh pr checks --watch=false` read once at closeout (result recorded in
`docs/build/runs/SPAREC.2.md` §8; inherited `integration`/privsep red, if reported later,
is waived per GD-MAINT.4-1).
