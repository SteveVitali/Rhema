# R6FIX.53 — journeys suite crash on a route.fetch teardown race

**Harness:** devin-cli / swe-2-high (orchestrator direct; not a subagent — one-line-guard fix)
**Branch:** `stevenvitali/r6fix-53-route-fetch-abort` off `stevenvitali/r6fix-52-mem-hygiene`
**Ticket:** `docs/tickets/335_R6FIX.53__route-fetch-abort.md`

## What happened

2026-11-25 06:23Z scheduled journeys run `45560244600` (the D-SPAF discharge bake — ~45
deferral rows riding it) died at 06:42:53Z, 19m in, with:

```
TargetClosedError2: "route.fetch: Request context disposed." while running route callback.
  at packages/journeys/dist/r7legs.js:1327
```

The `**/bff/p/*` GET-patch handler in `r7legs.ts` (the U6.chat stub-turn leg's terminal
twin refetch) `await route.fetch()`-ed while Playwright was tearing the page's context
down mid-navigation (`GET /bff/p/untitled-6`). The rejection escaped the route callback
and became a fatal unhandled rejection — the suite process died with **zero leg verdicts
written**. Same abort-race class as 317_R6FIX.46 (SSE sink); only `route.fetch` callsite
in the package (verified by grep).

## Fix

`r7legs.ts:1394–1416` — the handler's `route.fetch()` + both `route.fulfill` paths are now
guarded: a fetch rejection (disposal/mid-teardown) degrades to `route.abort().catch()`, and
both fulfills get `.catch(() => undefined)` per the file's `settle.ts` convention. The leg
semantics are unchanged — the patch only stops a closing page from killing the suite.

## Verify

- `pnpm install --frozen-lockfile` (fresh worktree) — clean.
- `pnpm turbo build --filter=@rhema/journeys...` — clean.
- `pnpm --filter @rhema/journeys typecheck` — clean. `lint` — clean.
- `pnpm exec vitest run packages/journeys/src` — **240/243 pass**; the 3 failures are
  `demo-side-effects.local.test.ts` → "local server or bundled Chromium unavailable"
  (`apps/web/dist/main.js` absent in this worktree — environment-gated, not the change;
  unrun legs reported, not claimed — CI runs them).
- No new unit test authored: reproducing a Playwright context-teardown-mid-fetch requires
  the real browser/network race; the deterministic proof is the re-run nightly (live stage
  per the ticket — a green run also discharges the ~45 D-SPAF.* bake rows).

## Logged exposure (docs-only half)

The crash's Playwright call-log printed the fixture session cookie
(`__Host-rhema.session_token=2dmJSsm9…`, **test-tenant** session) into the public repo's
CI log — a live credential in a public log, low value (fixture account, expiring). A full
request-header redaction policy for Playwright error output is out of scope → recorded in
the ticket; no deferral opened (assessed low-value fixture credential).

## Deferrals

None opened; the D-SPAF.* bake rows stay OPEN pending a green nightly re-run.
