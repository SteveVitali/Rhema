# SPA.10 — surface: usage (run ledger)

- **Status:** DONE (deterministic legs; preview two-leg + rollback BLOCKED — see §3; recorded honestly)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/107_SPA.10__surface-usage.md` (manifest row 107)
- **Branch:** `stevevitali/spa-10-surface-usage`, stacked on
  `stevevitali/spa-9-ide-chrome-layout` @ `1771922` (`OPERATOR` merge policy, **not merged**).
- **Goal:** migrate the `usage` surface (`/usage`, `/p/:slug/usage`) to the React SPA behind the
  `usage` flag — BFF read twins, ported components emitting the manifest vocabulary verbatim,
  component tests/axe, retained SSR, journey/gate wiring, the dev stage-fact line (REQ-SEQ-9).
- **Spend:** $0. No deploys, no production writes, no live legs (preview blocked — §3).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): `D-SPA.6-1` assessed — still OPEN. Leg (b) is exactly the
  preview leg this ticket also owes (flag-on `--expect-renderer spa` on `pr-<n>`); it needs CI
  images **pushed** for the chain SHA + `rhema:spaSurfaces` stack config on a provisioned preview.
  Neither exists (§3) — the row stays OPEN, unchanged (the same posture SPA.7–9 recorded).
- LEDGER CURRENT STATE read: `nextTicket: SPA.10`, `chainTip: stevevitali/spa-9-ide-chrome-layout`,
  `mergePolicy: OPERATOR`, `round: 4`, `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- Entry gate (REQ-SEQ-5): the foundation set SPA.1–9 all landed green before this run — BUILD_INDEX
  rows 128–134 carry them (PRs #120–127, unmerged stack); the base tip `1771922` is SPA.9's
  closeout. Asserted, not re-derived.
- Design sources applied: `docs/design/22` endpoint table (`p.projectUsage` row — slug→id off the
  request-scoped memo), `docs/design/29` route-map `usage` row (NOT IDE-framed — no `ide-chrome`
  AND-gate), `docs/design/27` (two-leg + rollback mechanics), `docs/design/28` F5 (dwell → React
  effect), spec `docs/frontend-spa-spec.md` §4/§8/§9.

## 1 — What landed

### `apps/web/src/server.ts` — `GET /bff/p/:slug/usage` (REQ-BFF-11, REQ-DAT-4/6)

- `bffRoute`-gated; `:slug` → `bffProjectRow` (the request-scoped `listProjects` memo — one
  upstream read per request no matter how many consumers).
- Unknown slug **or** missed/failed rollup → `{error:"not_found"}` 404 — the document's own answer
  (`renderDocument(notFoundElement)` at server.ts:3094/3099) verbatim.
- `swallowDegraded` rethrows upstream 401 → `bffRoute`'s `unauthenticated` envelope; every other
  miss degrades to the same 404 (SSR parity — the SSR swallows the rollup read to not-found too).
- The slug rides the returned payload (`{usageProject: {...dto, slug}}`) so the client's
  back-to-project link needs no second read.
- `/bff/usage` already shipped in SPA.5 (`{usage, account}`); untouched. No usage JSON mutation
  exists — `/usage.csv` stays a binary document nav (REQ-BFF-17); nothing in usage posts JSON.

### `apps/web/src/spa/queries.ts` — `projectUsageQuery(slug)`

- `BffProjectUsageTwin` typed payload; browser key `["bff","p",slug,"usage"]` (REQ-BFF-11 grammar);
  `bffFetch` transport (401 → session-expired document nav; 404 → `BffError{status:404}` the leaf
  maps to `notFound()`); BffError-no-retry + transport ≤2 retryPolicy.

### `apps/web/src/spa/surfaces/usage.tsx` — `UsageSurface` + `ProjectUsageSurface`

- `UsageSurface`: h1/PageTitle, level-1 glance (spendable/held balance, plan + trial line, billing
  period, month-to-date, included remainder/rollover, bucket rows, warnings, next expiry), CSV
  `<a href="/usage.csv">` document-nav anchor, recent-runs table with report links.
- `ProjectUsageSurface`: `Usage — <name>` h1, `X cr across N runs` total, per-run rollup rows with
  report links (`/app/usage/r/:runId` — a document nav), back-to-project link.
- Degrade honesty (REQ-BFF-9): each seam renders only when its half resolved — a `null` account
  leaves the glance out entirely; never a fabricated zero.
- Emits the full manifest vocabulary verbatim — `data-usage-*`/`data-project-usage-*` hooks,
  `data-spa-surface="usage"`/`"project-usage"` on the section root.
- All user-facing text via `COPY` (destructured `U`/`P` branch locals — the containment scan's
  leaf-only `COPY.*` grammar).

### `apps/web/src/spa/dwell.ts` — `useDwell(surface)` (REQ-BETA-10, design/28 F5)

- The SSR `dwellBeacon` inline script's verbatim React-effect port: `{surface, ms}` to `/a/dwell`
  every 30 s while visible + once on hide, `<4000 ms` guard, `sendBeacon` → keepalive-`fetch`
  fallback, fetch errors swallowed (beacons never surface).
- `UsageSurface` mounts `useDwell("usage")` — the same heartbeat `dwellSurface:"usage"` carries on
  the SSR document, running exactly while the surface is mounted. StrictMode-safe cleanup.
- `/p/:slug/usage` carries no dwell in SSR (the handler sets no `dwellSurface`) — parity kept.

### Route leaves (REQ-SEQ-9)

- `usage.tsx`: loader warms `usageQuery` **only** when the boot verdict is `spa`; component
  re-consults `isSpaEnabled` → `SsrHandoff` on any other verdict (never spends the BFF read);
  `isPending` → `SurfaceShell`; non-401 errors → `throw` to the route's designed error state
  (REQ-UX-6); degraded `null` halves render through.
- `p.$project.usage.tsx`: same shape + `projectUsageQuery(params.project)`; loader maps
  `BffError 404` → `notFound()` (the router's own not-found — never the error component);
  the component's post-mount 404 path maps identically.
- Both keep `pendingComponent: PendingShell`; `?ssr=1`/`?renderer=spa`/`x-rhema-renderer` overrides
  ride the unchanged boot/consult machinery.

### `apps/web/src/dom-contract.ts` — usage vocabulary completed

- The surface's manifest row went to 16 hooks: the account section's full set
  (`data-usage-plan`, `data-usage-mtd`, `data-usage-buckets`, `data-usage-warnings`,
  `data-usage-next-expiry`, `data-usage-csv`, `data-usage-runs`) plus the project rollup's
  (`data-project-usage-total`, `data-project-usage-runs`, `data-project-usage-run`) joined the
  existing rows — `check:dom-contract` reports usage 16/16 emitted+asserted, 498 entries / 18
  surfaces overall.

### `infra/config/stages.ts` — dev flag

- `STAGES.dev.spaSurfaces: ["usage"]` — the first flipped surface, dev only. `preview` stays `[]`
  (flips only via the `rhema:spaSurfaces` Pulumi stack config); `prod` untouched (SPAF.1's own
  operator-merged commit). `stages.test.ts` updated to pin the new dev value + the empty
  preview/prod invariant.

### Tests

- `apps/web/src/spa/usage.dom.test.tsx` (**14**): router-mounted legs at both routeIds — h1 +
  title + every usage manifest hook, content parity on the shared fixture, CSV anchor href,
  REQ-TST-2 parity (SSR twin rendered via `renderToStaticMarkup` under `PageDataContext`; every
  hook it emits is emitted by the React twin, `expectManifestEmission`), component axe on both
  surfaces, degraded-half legs, empty-runs legs, `SsrHandoff` + no-BFF-spend legs, slug in the
  query path, twin-404 → not-found (not the designed error), and the dwell heartbeat leg
  (sendBeacon to `/a/dwell` with `{surface:"usage", ms≥4000}` on the hide beat).
- `apps/web/src/bff.test.ts` — the `GET /bff/p/:slug/usage` block: typed payload with slug, unknown
  slug 404 `not_found`, missed rollup 404, upstream 401 → `unauthenticated`, request-scoped
  `listProjects` memo (one upstream read), unauthenticated 401.
- `apps/web/src/spa/spa.dom.test.tsx` — the seeded-session leg amended: the seeded principal now
  legitimately fetches `/bff/usage` (a real surface read), while `/session` + `/login` nav stay
  unspent. Assertion narrowed accordingly — the oracle leg is unchanged.
- Retained SSR: `billing-pages.test.ts`/`analytics-surfaces.test.ts` usage legs untouched — REQ-VFY-9
  disposition: render assertions now have React-twin counterparts in `usage.dom.test.tsx`; the
  `/usage.csv` HTTP + 404 legs stay HTTP-level (no component twin — the CSV anchor IS the surface).

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **PASS — 135/135 tasks** |
| `pnpm test` (root vitest) | **PASS — 471 files, 5,022 pass, 4 skip, 0 fail** |
| `usage.dom.test.tsx` | 14 legs |
| `bff.test.ts` | project-usage twin block green (full file 37 its) |
| `check:dom-contract` | **PASS — 498 entries / 18 surfaces; usage 16/16 emitted+asserted** |
| `check:spa-budget` | **PASS — usage leaf chunks 1.5 kB + 0.4 kB gzip; all ceilings held** |
| `check:licenses` | **PASS — 822 packages** |
| `check:no-cookies` / `check:spa-env` / `check:protocol-markers` | **PASS — clean** |

## 3 — Preview two-leg + rollback: BLOCKED (recorded honestly)

The ticket's staging-verified AC (legs A `x-rhema-renderer: ssr`, B flag-on `--expect-renderer
spa`, C full `paid:false` on `pr-<n>`; rollback drill; `D-SPA.6-1b`) could not execute:

- `pulumi stack ls` (infra/pulumi): only `dev` + `prod` exist — no `pr-<n>` stack.
- The CI `images` job builds the nine service images **locally** on the runner and records
  provenance digests — it does **not push** to GAR. No pullable image carries this chain's code;
  `preview-stack.mjs up` against placeholder images could not serve the SPA web build, so any leg
  would prove nothing (the same blocker `D-SPA.6-1` already names).
- `preview-stack.mjs init/config/up pr-<n>` + `rhema:spaSurfaces=usage` + a pushed-image deploy is
  the operator's path once images exist for the chain tip.

**Disposition:** staging-verified rows stay open — `D-SPA.6-1` OPEN unchanged (leg (b) IS this
leg's shape; it closes when the operator deploys pushed images + flag config on `pr-<n>`).
Compensating control: the deterministic legs cover the same contract — `usage.dom.test.tsx` mounts
the production router with flipped/unflipped verdicts (SsrHandoff + no-BFF-spend asserted),
`spa-flag.test.ts` pins the override semantics, `dom-contract` pins SSR⇄SPA vocabulary parity, and
`SURFACE_GATES["usage"]` → `X1.usage` — the renderer-agnostic tenant-isolation probe, registered
`expected:"green"` — is the leg that runs identically under either renderer.

## 4 — AC disposition

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations — typed JSON, preserved statuses | **MET (deterministic)** — `GET /bff/p/:slug/usage` added; `/bff/usage` reused; no usage JSON mutation exists (CSV is a document nav) |
| React surface emits the full dom-contract vocabulary — component tests + axe | **MET (deterministic)** — 16/16 hooks, `expectManifestEmission` + axe on both mounts |
| Retained SSR tests green — fallback untouched | **MET** — zero SSR deletions; SSR usage tests pass |
| Journey legs re-spec'd + `SURFACE_GATES['usage']`; preview two-leg A/B/C green on `pr-<n>` | **PARTIAL** — gate entry verified (`usage → X1.usage`, renderer-agnostic); preview legs **BLOCKED** (§3) → `D-SPA.6-1` stays OPEN |
| Rollback drill on preview | **BLOCKED** (§3) — compensating deterministic legs mounted instead |
| Entry gate: SPA.1–9 landed green | **MET** — BUILD_INDEX 128–134 |
| Dev stage-fact line; prod untouched | **MET** — `dev.spaSurfaces=["usage"]`; preview/prod `[]` pinned in test |

## 5 — Deviations + notes

- **Size ~830 lines vs ~600 guide** — recorded per SPA.5–9 precedent (the surface + its test file
  ARE the deliverable; parity legs + the dwell port carry their own weight).
- `dwell.ts` is the first React-effect heartbeat (design/28 F5) — the pattern later surfaces
  (`project`/`dossier`/`report`/`page`) reuse verbatim.
- Copy-containment workaround: `COPY.usage`/`COPY.projectUsage` object branches destructure to
  locals (the scan resolves `COPY.*` only to string leaves).
- `D-SPA.6-1` — OPEN, unchanged (§3). No new deferral rows.

## 6 — Closeout addendum (post-PR)

_Pending — filled after `gh pr create` + the single `gh pr checks --watch=false` read._
