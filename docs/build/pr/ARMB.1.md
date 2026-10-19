# ARMB.1 — fix the SPA asset base + teach the journeys gate the forced-SSR verdict

Not a manifest ticket — the corrective commit for the Arm B tip deploy
(run ledger: `docs/build/runs/ARMB-2026-10-14.md`; election: LEDGER row `ARMB-1`).
Stacks on `stevevitali/spadoc-2-agent-docs-refresh` (PR #169, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> The `b35473d` tip deploy (Arm B) reached prod and passed provenance + every cheap check —
> then the compressed `--expect-renderer spa` surface run exposed two real defects that no
> earlier tier could have caught: **all signed-in preview legs were blocked on the missing
> `rhema-nonprod-resend-api-key` secret**, so the SPA's lazy-chunk loading and the renderer
> assert's forced-SSR edge were never exercised live until now.

## What this fixes

### 1. SPA asset base — lazy chunks 404'd on prod

`vite.config.ts` left `base` at the default `/`. The shell's manifest hrefs are server-built
(`/assets/spa/<file>` — always correct), but every URL the bundle *runtime* emits — dynamic
`import()`s, modulepreload dep hrefs, css refs — resolves from `base`, so browsers requested
`/assets/<chunk>.js`, a route nothing serves (SPA assets live under `/assets/spa/*`).
Prod logged 16–536 asset 404s per journey step and lazy leaves never mounted.

**Fix:** `base: "/assets/spa/"` — a **top-level** key; `build.base` does not exist and is
silently ignored (verified via `resolveConfig` — an earlier draft under `build:` resolved to
`"/"`). Emitted bundles now produce `./<chunk>` relative imports (resolved under
`/assets/spa/assets/` by the browser) and `/assets/spa/`-rooted preload hrefs.

**Regression test:** `asset-parity.test.ts` imports the real config object and asserts
`base === "/assets/spa/"` — a misplaced `build.base` or a revert to `/` fails the gate.

### 2. `--expect-renderer` had no model for the mandated forced-SSR verdicts

N7/R5/P1.* settle-lapses on `/p/showcase` (and phone-context `/p/showcase-copy`) were REQ-ED-12/
ADR-108 working correctly — `showcase: true` rows and phone UAs MUST serve SSR — while the
runner's gated-route assert treated every `ssr` on a gated route as a violation. Verified
against the prod DB: `showcase` rows are `showcase: true`.

**Fix:** the five forced-SSR branches stamp `<html data-ssr-cause="phone|showcase">`
(`PageData.ssrCause` → `render.tsx` htmlAttrs; declared in `dom-contract.ts`). `awaitMounted`
and the runner's document-response assert honor the stamp — an **unstamped** `ssr` on a gated
route still fails, so the assert's teeth are unchanged for every non-forced document.

## Verification

- `vite build` output inspected: `import("./<chunk>.js")` + `fe = e => "/assets/spa/" + e`
  for preload deps; zero `"/assets/"` root-absolute refs in the entry chunk.
- `vitest`: asset-parity (9), page (22), spa-shell (31), settle (19), runner (12) — all green.
- `check:dom-contract`, `check:spa-env`, `check:spa-budget`, `check:protocol-markers` — green.
- `turbo typecheck lint` on `@rhema/web` + `@rhema/journeys` — green.

## What this PR does NOT claim

- Prod verification of the fix — that is the redeploy + compressed-suite re-run recorded in
  the run ledger's §4/§5 (in progress at push time).
- Any change to the N4/N9/T3/T8 owed/fixture dispositions — re-triaged on the re-run.
