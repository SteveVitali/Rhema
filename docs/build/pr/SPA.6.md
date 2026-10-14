# SPA.6 — Journey harness: --expect-renderer/--surface, SURFACE_GATES, settle helpers, probe re-spec

Manifest row 103 · stacks on `stevevitali/spa-5-bff-conventions` @ `1e84a99` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/103_SPA.6__journey-harness.md` per `docs/design/27_spa-acceptance-mechanics.md`
(settle contract + step-split table + probe re-spec rules) and `docs/design/29_spa-migration-sequencing.md`
§two-leg procedure; `docs/frontend-spa-spec.md` §10.

**Deployable dark:** additive-only — the journey harness gains flags and helpers; the app's only
changes are additive `data-*` assertion hooks; no flag set anywhere; the SSR fallback untouched.

## Requirement IDs

**REQ-VFY-3 · REQ-VFY-4 · REQ-VFY-7 · REQ-VFY-8 · REQ-VFY-10 · REQ-SEQ-4 · REQ-SEQ-7 ·
REQ-TST-7 · REQ-TL-13**

## What lands

- **`src/settle.ts` (new)** — `awaitMounted` / `gotoOk` / `settleNav` / `reloadSettled`: every
  same-origin document settles on `data-mounted` (+ optional `data-route`/`data-renderer`
  equality); foreign origins (Stripe checkout) no-op; failures report the *observed* marker
  state. `RendererName`, `RENDERER_HEADER`, `onOurOrigin`, `rendererOfDocument` — one vocabulary
  for runner + settle + steps (REQ-VFY-3/4/7, REQ-TL-13).
- **`src/surface-gates.ts` (new)** — `SURFACE_GATES` is total over all 15 `SpaSurface` keys: per
  surface, the `paid:false` gate subset (`steps`), `legNotes`, `owed` (free-coverage debt, owner
  named), `weeklyHolds` (paid legs the weekly re-proves — never in a gate, REQ-VFY-10).
  `stepsForSurfaces` unions in registry order and **refuses an empty gate** — `outline`,
  `figures`, `run-report` are owed-not-gated today, so a vacuous `--surface` run is impossible.
  `TWO_LEG_PROCEDURE` serializes the leg A/B/C + rollback contract.
- **`src/runner.ts`** — `deps.pinRenderer` stamps `x-rhema-renderer` on **every** context (anon,
  cached-mint, fresh-mint, step-rolled via `ctx.extraHTTPHeaders`); `deps.expectRenderer` checks
  `data-renderer` on every same-origin 2xx `text/html` document response, awaited before
  classification — a wrong/absent marker fails a green step, reports `owed` on a red one. Report
  gains `renderer:{expect,pin}` (additive). **Wiring fix:** session pages are wired via a new
  `JourneySessions.onPage` — before the mint's first navigation; previously the mint's own docs
  escaped the check.
- **`src/cli.ts` + `cli-flags.ts` (new)** — `--expect-renderer` / `--pin-renderer` / `--surface`
  (+ `JOURNEY_*` env forms); every invalid value is an asserted error string → exit 2. The
  prod refusal on `--pin-renderer spa` (`--stage prod` or `*.rhema.tools`) is enforced because
  `SPA_OVERRIDES` never sets there — a spa pin on prod could only produce vacuous green.
  `--surface` intersects with `--steps`/`--journey`; `--steps P1`/`X1` still select the split
  families by prefix.
- **`src/registry.ts` — the P1/X1 splits:** `P1` → `P1.public|project|pill|runsheet|app-new`;
  `X1` → `X1.voices|usage|home|inbox|detail`. Asserts/owners/green evidence carry over verbatim;
  `--steps P1` selects the family. `check-coverage-matrix` resolves umbrella `journey:P1`/`X1`
  refs to the families.
- **Probe re-specs (`steps.ts`, `stb5a.ts`):** every same-origin doc nav settles on markers (SSR
  resolves at serve; the SPA after the router's data paint — the same call holds on both). The
  conversion preview waits on `[data-conversion-action]`; the estimate matrix reads the typed
  `data-estimate-matrix` JSON embed; all post targets pin to `data-*-form` hooks. Surviving raw
  waits: session mint/probe plumbing (now wired) and the Stripe-hosted hop (foreign origin —
  markers inapplicable, commented).
- **Additive DOM hooks:** `pages.tsx` (`data-restore-form`, `data-new-project-form`,
  `data-apply-form=<id>`, `data-duplicate-form`, `data-obligation-form`,
  `data-source-settings-form`, `data-samples-form`, `data-notifications-form`,
  `data-export-request-form`); ui (`data-conversion-form`/`data-conversion-action`,
  `data-menu-form`/`data-menu-action`, the `data-estimate-matrix` embed). Both renderers emit
  the same hooks — leg A and leg B assert an identical contract.

## Tests

110 journey tests (11 files): settle contract ×11, gate schema/bijection/paid-free/empty-refusal
×11, CLI refusal table ×9, runner renderer+pin ×5, session wiring-order + pin ×1, split-registry
×7. Removal-catching hook renders in `packages/ui` (3) and five `apps/web` route assertions.
Full suite + turbo green (numbers in `runs/SPA.6.md`).

## Live legs → `D-SPA.6-1` (OPEN)

Both staging-verified legs are deferred with byte-level blocker evidence: prod `6ebb1cb`
predates the SPA stack (`data-renderer`/`data-mounted` absent on `/` + `/login`, curl-verified)
and no `pr-<n>` stack exists (`pulumi stack ls` → dev+prod only; preview creation is an operator
deploy act). The unblock steps + verify recipe + compensating controls are on the row.
