# SPA.10 — surface: usage (`/usage` + `/p/:slug/usage` → React SPA behind the `usage` flag)

**PR #128** · Manifest row 107 · stacks on `stevevitali/spa-9-ide-chrome-layout` @ `1771922` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/107_SPA.10__surface-usage.md` per `docs/design/22` (endpoint table —
`p.projectUsage`), `docs/design/29` (route-map `usage` — NOT IDE-framed), `docs/design/27`
(two-leg + rollback mechanics), `docs/design/28` F5 (dwell → React effect), and
`docs/frontend-spa-spec.md` §4/§8/§9. The first flipped surface of the round-4 chain —
`STAGES.dev.spaSurfaces` gains `"usage"`; preview/prod stay `[]`.

**Deployable dark:** nothing changes for an unflipped request — the leaf's loader skips its BFF
read and `SsrHandoff` document-navigates back to the same server route. SSR fallback + SSR
tests untouched (REQ-SEQ-11/12). `?ssr=1`/`?renderer=spa`/`x-rhema-renderer` overrides ride the
unchanged consult machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8/9 · REQ-BFF-10/11/17 · REQ-DAT-1/4/6 · REQ-INV-5 · REQ-BETA-10 ·
REQ-SEQ-5 · REQ-UX-3/4/5/10/13/14/15/16**

## What lands

### `GET /bff/p/:slug/usage` (the missing twin)

- `bffRoute`-gated; slug→id via the request-scoped `listProjects` memo (`bffProjectRow`).
- Unknown slug **or** missed/failed rollup → `{error:"not_found"}` 404 — the document's own
  answer verbatim; upstream 401 rethrows through `swallowDegraded` to the `unauthenticated`
  envelope.
- Slug rides the payload so the back-link needs no second read. `/bff/usage` (SPA.5) reused.
- **No usage JSON mutation exists** — `/usage.csv` stays a binary document-nav anchor
  (REQ-BFF-17); the envelope deliverable is satisfied vacuously.

### The surface (`spa/surfaces/usage.tsx`)

- `UsageSurface` — level-1 glance (balance/held, plan+trial, period, MTD, included remainder,
  buckets, warnings, next expiry), CSV anchor, recent-runs table with report links.
- `ProjectUsageSurface` — `Usage — <name>`, `X cr across N runs`, per-run rollup + report links,
  back-to-project. Twin-404 → router `notFound()` — never the error component.
- Degrade honesty: each seam renders only its resolved half — never a fabricated zero.
- **Full manifest vocabulary verbatim** — `data-usage-*`/`data-project-usage-*` now complete at
  16 hooks (`data-usage-plan/mtd/buckets/warnings/next-expiry/csv/runs` +
  `data-project-usage-total/runs/run` added); `check:dom-contract` 16/16 emitted+asserted.
- `useDwell("usage")` (`spa/dwell.ts`) — `render.tsx`'s dwellBeacon verbatim as a React effect
  (REQ-BETA-10, 28-F5): 30 s visible heartbeat + hide beat, <4 s guard, sendBeacon → keepalive
  fetch. The SSR parity heartbeat — `/p/:slug/usage` carries none, as in SSR.

### Route leaves

- Loader warms the twin only when the boot verdict is `spa` (the handoff path never spends the
  read); `isPending` → `SurfaceShell`; non-401 failures → the designed error state (REQ-UX-6);
  the project leaf maps `BffError 404` → `notFound()` in loader AND post-mount.

### Dev flag

- `STAGES.dev.spaSurfaces = ["usage"]`; preview `[]` (flips only via `rhema:spaSurfaces` stack
  config), prod `[]` (SPAF.1). `stages.test.ts` pins the new shape.

## Tests

- `usage.dom.test.tsx` (**14**) — production-router mounts at both routeIds: every manifest hook,
  content parity on shared fixtures, REQ-TST-2 parity vs the SSR twins (`renderToStaticMarkup` +
  `expectManifestEmission`), axe on both mounts, degraded/empty legs, SsrHandoff +
  never-spends-BFF, twin-404→notFound, the `/a/dwell` heartbeat leg.
- `bff.test.ts` — the project-twin block: typed payload + slug, unknown slug / missed rollup 404,
  401 → unauthenticated, request-scoped memo (one `listProjects`), 401 unauthenticated.
- `spa.dom.test.tsx` — seeded-session leg narrowed (the seed still skips `/session` + `/login`;
  `/bff/usage` is now a real surface fetch).
- SSR usage tests (`billing-pages`, `analytics-surfaces`) untouched — REQ-VFY-9 disposition:
  render assertions now have React-twin counterparts; CSV/404 legs stay HTTP-level.

## Verification

`pnpm turbo build lint typecheck` **135/135** · `pnpm test` **471 files / 5,022 pass / 0 fail**
· `check:dom-contract` 498 entries / 18 surfaces, usage 16/16 · `check:spa-budget` ceilings held
(usage chunks 1.5 + 0.4 kB gzip) · `check:licenses` 822 · `check:protocol-markers`,
`check:no-cookies`, `check:spa-env` clean.

## Preview two-leg + rollback — BLOCKED (recorded honestly)

No `pr-<n>` stack exists (`pulumi stack ls`: `dev` + `prod` only), and the CI `images` job builds
images **locally** with provenance-only digests — nothing is pushed to GAR, so no pullable image
carries this chain's code. Legs A/B/C + the rollback drill need pushed images + `preview-stack.mjs
init/config/up pr-<n>` + `rhema:spaSurfaces=usage` — the operator's deploy path. **D-SPA.6-1
stays OPEN** (its leg (b) is exactly this shape). Compensating deterministic legs: flipped AND
unflipped router mounts in `usage.dom.test.tsx` (SsrHandoff + no-BFF-spend asserted), override
semantics in `spa-flag.test.ts`, SSR⇄SPA vocabulary parity pinned by `check:dom-contract`, and
`SURFACE_GATES["usage"]` → `X1.usage` (renderer-agnostic tenant isolation, `expected:"green"`).

## Notes for the operator

- This is the first surface PR — the preview procedure in `SURFACE_GATES` TWO_LEG_PROCEDURE is
  what runs once images exist: leg A `--pin-renderer ssr --expect-renderer ssr`, leg B
  `rhema:spaSurfaces=usage` + `--expect-renderer spa`, leg C full `paid:false`; rollback =
  remove the stack config, re-run leg A.
- `useDwell` is the reusable pattern for the remaining `dwellSurface` pages
  (`project`/`dossier`/`report`/`page`).
- Merge policy `OPERATOR` — the stack merges bottom-up; this run does not merge.
