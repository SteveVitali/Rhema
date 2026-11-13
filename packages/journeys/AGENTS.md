# AGENTS.md — Browser journeys

## Purpose

- Own the Playwright acceptance journeys: visible text, actionable controls, screenshots, renderer,
  navigation mechanism, deployed revision, and bounded provider spend.
- Root `AGENTS.md` applies. Read `apps/web/AGENTS.md` for surface contracts and `infra/AGENTS.md`
  before provisioning or changing an environment.

## Key Files

| File                                         | Lines (approx) | Purpose                                                       |
| -------------------------------------------- | -------------- | ------------------------------------------------------------- |
| `packages/journeys/src/registry.ts`          | ~890           | Step ownership, expected status, caps, and model-policy pins. |
| `packages/journeys/src/steps.ts`             | ~3.2k          | Core leg implementations and shared step helpers.             |
| `packages/journeys/src/r7legs.ts`            | ~1.7k          | The round-7 `D*`/`R*.demo`/`U*` leg families.                 |
| `packages/journeys/src/runner.ts`            | ~450           | Execution, evidence, outcomes, and document-load counting.    |
| `packages/journeys/src/cli.ts`               | ~300           | Target selection, provenance, and paid-dispatch preflight.    |
| `packages/journeys/src/settle.ts`            | ~350           | Renderer and navigation-mechanism assertions.                 |
| `packages/journeys/src/spend-guard.ts`       | ~120           | Trusted weekly spend measurement and cap errors.              |
| `packages/journeys/src/window-plan.ts`       | ~300           | Funded-window ordering and nine-row opening checklist.        |
| `packages/journeys/src/fixture-substrate.ts` | ~150           | Self-healing flagged-tenant fixture re-seating (R6DEP.4).     |

## Build & Test

```bash
pnpm turbo build --filter=@rhema/journeys...
pnpm --filter @rhema/journeys exec playwright install chromium
pnpm --filter @rhema/journeys typecheck
pnpm --filter @rhema/journeys lint
pnpm exec vitest run packages/journeys/src
```

- Run from the repo root. The offline occlusion test needs bundled Chromium; scheduled live runs
  install Chrome. The CLI tries Chrome, then falls back to bundled Chromium.
- Use `node packages/journeys/dist/cli.js`; executing the package's own bin through filtered pnpm
  is not reliable. Only run against an authorized deployed target; this example selects a free leg
  and refuses an unset expected revision:

```bash
node packages/journeys/dist/cli.js \
  --stage prod --steps N10 \
  --expect-sha "${RHEMA_JOURNEY_SHA:?Set the deployed revision to verify}" \
  --out docs/build/reports/local-N10
```

- The CLI resolves origins for `--stage prod`; other stages need explicit `--web` and `--api`.
  A stage fact or DNS hostname alone is not an origin resolver.
- `--steps` accepts CSV IDs; omit it for the registry. `--surface` selects `SURFACE_GATES` subsets.
  `--expect-renderer ssr|spa` asserts actual documents. `--invite-code` / `RHEMA_INVITE_CODE` seeds
  the preview signup path. `--pin-renderer` / `JOURNEY_PIN_RENDERER` are retired and exit 2.

## Code Conventions

- A step remains `expected: "red"` until its owner proves Stage B with a screenshot; failing red
  reports `owed`, failing green fails the run. Change the registry only with the corresponding proof.
- Correct ✓: assert committed visible text, actionable controls, and declared DOM selectors.
  Wrong ✗: pass because a bundle exists, a selector count is nonzero, or a run produced no error.
- Use `apps/web/src/dom-contract.ts` vocabulary. IDs retain their family prefixes:
  `N*`, `R*`, `T*`, `B*`, `P1.*`, `X1.*`, `C1`; sub-assertions use suffixes such as `N2.invite`.
  The round-7 families live in `src/r7legs.ts` beside `src/registry.ts`: `D*` demo legs
  (`D1.hub`, `D2.tour`, `D3.readonly`), `R*.demo` reads (`P1.demo`, `R11.demo`,
  `R8.showcase.spa`), and `U*` R7b surface legs (`U1.shell`, `U2.noreload`, `U3.occlusion`,
  `U4.controls`, `U5.write`, `U6.chat`, `U7.import`). `U3.stopgap` is superseded history —
  `U3.occlusion` is the standing REQ-PANE arm (GATE-ACCEPT.R7 signed the supersession).
- Preserve `data-renderer`, `data-route`, `data-mounted`, `data-nav-count`, and `data-page-session`
  on both renderers. SPA-space documents are `spa`; public and forced-SSR documents are `ssr`.

## Critical Gotchas

1. **Provenance is acceptance evidence.** Verify the expected chain-tip SHA before claiming a
   surface passed. Source code and an old deployed ancestor are different targets.
2. **Settle the mechanism, not just the result.** `settleClientNav` requires a `data-nav-count`
   tick with zero document loads. `settleDocumentNav` requires a new document load. Both use the
   runner's unconditional same-origin document-response counter, which survives a document swap.
3. **Paid runs are separate, authorized work.** Weekly `--paid` uses the committed ≤300-word
   fixture and a $5 ISO-week cap. Every dispatch declares `--headroom`; operators also need a
   system-role `JOURNEY_DATABASE_URL`. Only the scheduled self-bounding cron may attest no DB.
   Never impersonate that cron or use an application-role DSN: FORCE RLS can make real spend look
   like zero. The guard probes role trust and fails closed.
4. **A paid leg needs its own declared cap.** Each paid registry row has `capUsd` at least $0.50;
   metered leg-close throws `CapOverrunError` past it. Model-judgment launches must apply
   `cogsLeversFor` every time: N6/R4/B19C pin `testCheapRoute: false` with their full-tier caps.
5. **Funded windows are not weekly-cap bypasses.** `scripts/live/funded-window.mjs` uses the
   operator-authorized envelope and lifetime measurement scope. Its `--dry-run` prints nine
   pass/fail rows and launches no browser; an unmeasurable row fails closed. Preserve every row:

   | Row              | Required evidence                                                              |
   | ---------------- | ------------------------------------------------------------------------------ |
   | Database trust   | System-role DSN with a trustworthy meter read.                                 |
   | Cumulative spend | Pinned-scope flagged-tenant proxy spend below the authorized cap.              |
   | Headroom         | Declared headroom covers selected legs' summed `capUsd` and fits the envelope. |
   | Per-leg bounds   | Every paid leg declares a cap and enforces `CapOverrunError`.                  |
   | Ordering         | T9 first, then launchers, then riders, with B19C last and conditional.         |
   | Stable tenant    | `JOURNEY_FUNDED_STABLE_TAG` binds the purge-exempt funded identity.            |
   | Seed exclusions  | `req_jrn_` fixture rows do not count as real spend (REQ-ECON-6).               |
   | Model pins       | Required cheap-route opt-outs are applied (REQ-ECON-11).                       |
   | Pause state      | No active funded-pause sentinel.                                               |

6. **An overrun pauses all later paid dispatches.** `cap_overrun` writes a runtime pause sentinel
   named funded-pause.json in the state directory. Resume only after operator reauthorization;
   never remove it or change the
   cap/epoch simply to pass preflight. Read the latest GATE DECISIONS and deferral evidence before
   choosing a funded envelope: historical defaults are not present authorization.
7. **Preserve the historical refusal accurately.** On 2026-10-16 the funded bind measured $80.86
   against approximately $60 and refused: zero legs ran, $0 spent (GD-FUNDED.1-1 / D-CAP.2-1).
   Later rulings, including GD-ENV.R6, changed the envelope; consult `docs/build/LEDGER.md` for the
   current disposition. Never describe the refused attempt as a completed wave.
8. **Schedules do not grant extra spend.** `.github/workflows/journeys.yml` schedules free legs at
   06:05 UTC daily and the paid leg Monday 04:35 UTC with standing headroom $3. Keep dispatch,
   provenance, and spend constraints together when changing the workflow.
9. **A `ready-to-flip` leg in the nightly is a hazard, not a pass.** When an `expected:"red"`
   leg goes green on a scheduled run, the sweep reports it `ready-to-flip` — evidence the owner
   uses to flip the registry row — but the red expectation is still the committed contract until
   the owner lands the flip. Do not read a green nightly as proof a leg is already green in the
   registry, and do not pre-flip a row on a passing dry run.
10. **U6's one-off paid posture is history, not standing authority.** `GD-UX-PAIDLEG.R7`
    authorized exactly one manual paid `U6.chat` dispatch (< $10, Base tier, `--headroom` equal
    to `capUsd`). That dispatch ran 2026-11-08 and FAILED HTTP 402 (unfunded journey identity,
    metered $0.00) — the ruling's pause arm ended the paid work and the pre-authorization
    expired at GATE-ACCEPT.R7. Any further paid demo/chat dispatch needs a fresh operator
    ruling; the standing Monday `--paid --headroom 3` cron arm is a separate, already-authorized
    carrier. Never cite the expired ruling as authority.
11. **A non-TS asset read via `import.meta.url` never reaches `dist`.** `tsc -b` emits only
    TypeScript outputs, so `new URL("./x.json", import.meta.url)` resolves to a file the build
    does not create — the standing offender is `u6-stub-turn.fixture.json`, ENOENT in the
    nightly `U6.chat` leg since ~2026-11-06 (BL-111, carrier `259_R6FIX.10`; the defect is the
    committed harness code, not provenance). A leg fixture must be compiled in
    (`resolveJsonModule` import) or emitted by a build step; never assume a `src/` neighbor
    survives the compile.

## Do / Don't

- **Do:** report passes, owed/skipped legs, spend, and exact deployed provenance separately.
- **Don't:** promote a red step without browser evidence or treat this documentation as spend approval.
