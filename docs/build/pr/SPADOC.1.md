# SPADOC.1 — repo docs refresh (SPA era)

Manifest row 147 · refresh-repo-docs (scope `.`, incremental, apply) · stacks on
`stevevitali/sparec-3-integration-plan` (PR #167) · merge policy **OPERATOR** — do not merge
from the build environment · docs-only, **$0**, no live stage, nothing deployed.

## What lands

The human-facing docs converge onto the composed build at `f4e5eb5` — the round-4 SPA reality.
Every changed claim was verified against current code first (`contracts/spa.ts`,
`client-entries.mjs`, `server.ts`'s five `isPhoneRequest || row.showcase` arms and unconditional
`spaShellDocument` serves, the `/bff/*` twins, `journeys/src/cli.ts`, `check-spa-env.mjs`,
`check-dom-contract.mjs`, ADR-106/107/108). Where a doc describes live posture it now says so
honestly: **authored-dormant** — prod still serves pre-chain ancestors while the operator runs
the ordered activation (`docs/build/INTEGRATION_PLAN.md` §R4; spec §14.17).

- **`README.md`** — `web` was "React Router SSR shell" → Hono SSR host + Vite/TanStack SPA +
  same-origin BFF (ADR-106; React Router is server-side only). Status re-dated and gains the
  round-4 bullet: the permanent hybrid (public funnel SSR forever; phone/showcase forced-SSR
  Page family per ADR-108; every other auth'd document GET → the SPA shell unconditionally;
  `page.js`/`ide.js`/`landing.js` the surviving islands per ADR-107) and the deleted flag
  machinery (`?ssr=1`/`?renderer=spa`/`x-rhema-renderer` inert; rollback = `git revert` +
  redeploy).
- **`apps/web/README.md`** — the mid-migration intro ("nothing serves it and no flag exists
  yet") and the flag-era islands row rewritten to the post-cleanup truth (unconditional shell;
  the one renderer verdict left is `isPhoneRequest(c) || row.showcase === true`; the permanent
  SSR island set; `outline` SPA.26 / `editor` SPA.24 retired). Gates section gains the missing
  `check:spa-env` + `check:dom-contract` rows (added by SPA.7/SPA.8).
- **`docs/README.md`** — "Where the build is" re-dated to 2026-10-10 with the authored-dormant
  round-4 state; mode table gains the five untabled round-4 docs (`frontend-spa-brief`,
  `research-ledger`, `OUTLINE_TRACE`, `decomposition-prompt` — frozen; `frontend-spa-spec` —
  frozen-with-amendments, §14 wins).
- **`packages/journeys/README.md`** — documents the round-4 CLI surface: `--surface`,
  `--expect-renderer`, the retired `--pin-renderer` refusal (exit 2), `--invite-code`.
- **`docs/security/pen-test-scope.md` + `pen-test-vendor-package.md`** — the engagement target
  now notes the pending activation so a post-activation pen test scopes the SPA shell +
  `/bff/*` layer, not an SSR-only app.

## Requirement ids

none — process/capstone row per the ticket.

## Detector result (honest)

`check-repo-docs-freshness.sh .` → **447 docs, 16 broken refs, 0 stale suspects** — before and
after. The 16 are the same report-only/false-positive set DOC.1 classified (append-only ADR
code examples, frozen figure URIs inert per ADR-046, historical ticket contracts, a test
fixture's input, `packages/protocols`/`upstream-pin` template placeholders). **Zero new broken
refs introduced.**

## Claims deliberately left stale (with reason)

- `docs/rhema-design-spec.md` §12's `React Router SSR · ECS` mermaid node — frozen-with-
  amendments; already banner-superseded at that row by SPAREC.2.
- `research-ledger.md` / `decomposition-prompt.md` / `OUTLINE_TRACE.md` /
  `frontend-spa-brief.md` — frozen records of the plan *as designed*; spec §14 is the as-built
  record.
- `docs/security/usercontent-csp-audit.md` "the SSR app" — a dated audit record; accurate at
  its date.
- `apps/web/package.json` `description` + `client-entries.mjs` comment drift — code metadata,
  outside the doc corpus (DOC.1 precedent).

## Gate evidence

`pnpm turbo build lint typecheck` 135/135 · `pnpm test` 487 files / 5,562 pass / 6 skip /
0 fail · all six `check:*` green (licenses 822 · protocol-markers 248 · no-cookies 253 ·
spa-budget · spa-env · dom-contract) · `check-backlog.sh` clean at 465 · build-memory
0 violations / 7 pre-existing-class warnings · `check-append-only.mjs --base f4e5eb5` OK.

Run ledger: `docs/build/runs/SPADOC.1.md`.
