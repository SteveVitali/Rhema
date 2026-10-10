# SPADOC.2 — agent docs refresh (SPA era)

Manifest row 148 — **the last chain row** · agent-docs refresh (scope `.`) · stacks on
`stevevitali/spadoc-1-repo-docs-refresh` (PR #168) · merge policy **OPERATOR** — do not merge
from the build environment · docs-only, **$0**, no live stage, nothing deployed.

## What lands

`AGENTS.md` converges onto the composed build — the file every future worker reads first now
teaches the landed SPA architecture instead of leaving round-4 implicit. Every claim was
verified against the code before it was written (`bff.ts`, `bff.ts`/`MutationEnvelope`,
`spa/states.tsx`, `spa/dom.ts`, `main.tsx`, `dom-contract.ts`, `vitest.config.ts`,
`client-entries.mjs`, `contracts/src/spa.ts`, `editor/src/source-mode.ts`,
`page-source-mode.ts`, `server.ts`'s five `isPhoneRequest || row.showcase` arms, `cli.ts`'s
`--pin-renderer` refusal, `check-dom-contract.mjs`, ADR-106/107/108, spec §14).

- **New section: "Frontend — the SPA hybrid (round 4; ADR-106/107/108)"** — the hybrid
  (Hono SSR host + Vite/TanStack SPA + same-origin BFF; React Router server-side only); the
  authored-vs-activated honesty clause (prod = pre-chain ancestors; activation =
  `INTEGRATION_PLAN.md` §R4; `check-deploy-provenance` before any live claim); the renderer
  split (`SPA_PUBLIC_ROUTES` forever-SSR vs unconditional `spaShellDocument`; `surfaces: null`
  rows as `reloadDocument` stubs); the deleted flag machinery (`?ssr=1`, `?renderer=spa`,
  `x-rhema-renderer`, `SPA_OVERRIDES`, `rhema:spaSurfaces` — inert/removed, tripwired);
  `SPA_SURFACES` et al. as contract vocabulary only; forced-SSR as a server verdict
  (`isPhoneRequest || row.showcase`; boot map owns phone, twin `project.showcase` owns
  showcase, `twinForcesSsr` → `SsrHandoff` → `navigateDocument`); `bffFetch`-only transport +
  the `{ok,redirect,flash,data,pending,url}` mutation envelope with no-JS form equivalence +
  `{error,detail?}` failures; Query conventions (`ensureQueryData` +
  `defaultPreloadStaleTime: 0`, `useQuery` + `SurfaceShell`); the `dom-contract.ts` manifest +
  `data-*` hook vocabulary; the `*.dom.test.tsx` stack (happy-dom + Testing Library + axe);
  the permanent island set `["ide","page","landing"]` (ADR-107) + its removal rule; Source
  mode (SPA.25, `applySourceMarkdown`, `data-pm-host`); rollback = `git revert` + redeploy.
- **Commands** — `pnpm check:dom-contract` added (it runs in the `typecheck/lint/unit` CI job;
  all six `check:*` now listed).
- **Browser journeys** — the round-4 CLI surface: `--surface`, `--expect-renderer <ssr|spa>`,
  `--invite-code`, the retired `--pin-renderer` refusal (exit 2), and the
  `data-renderer`/`data-mounted`/`data-route` marker contract.
- **`CLAUDE.md`** — unchanged (the `@AGENTS.md` bridge is already correct).

## Requirement ids

none — process/capstone row per the ticket.

## Detector result (honest)

`check-agent-docs-freshness.sh .` → **1 doc scanned, 0 issues, exit 0** — before and after.
The drift was semantic absence (the doc never described the frontend), not broken refs.

## Gate evidence

`pnpm turbo build lint typecheck` 135/135 (FULL TURBO) · `pnpm test` 487 files / 5,562 pass /
6 skip / 0 fail · all six `check:*` green (licenses 822 · protocol-markers 248 · no-cookies
253 · spa-budget · spa-env 111/146 · dom-contract) · build-memory 0 violations /
pre-existing-class warnings · `check-append-only.mjs --base 930778b` OK.

Run ledger: `docs/build/runs/SPADOC.2.md`.
