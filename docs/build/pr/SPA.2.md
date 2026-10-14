# SPA.2 — SPA surface flags: parse → WebDeps → deps.spa → deploy wiring

Manifest row 99 · stacks on `stevevitali/spa-1-vite-toolchain-adr106` @ `42f41c3` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/99_SPA.2__flag-plumbing.md` per `docs/frontend-spa-spec.md` §4/§11 +
Appendix D and `docs/design/29_spa-migration-sequencing.md` §flag-mechanism (pseudocode applied
verbatim), `docs/design/26_spa-public-auth-boundary.md` §3.

**Deployable dark:** the consult is additive-only — **no flag is set on any stage** (REQ-SEQ-5)
and **no route consults `deps.spa` yet** (the shell document is SPA.3, surface flips are the
surface tickets). SSR stays the only renderer; nothing here is reachable.

## Requirement IDs

**REQ-SEQ-1 · REQ-SEQ-2 · REQ-SEQ-3 · REQ-SEQ-4 · REQ-SEQ-5 · REQ-BND-11 · REQ-FW-3**

## What lands

- **`@rhema/contracts` `spa.ts`** — `SpaSurface` union (14 keys + `ide-chrome`, spec Appendix D
  order verbatim), `SPA_IDE_FRAMED_SURFACES`, `SPA_RENDERER_HEADER` (`x-rhema-renderer`),
  `parseSpaSurfaces` — fail-closed: unset/empty ⇒ `∅`, unknown tokens dropped + **one** warn
  line, never throws (the `signupMode` precedent). *(REQ-SEQ-1/2)*
- **`apps/web` `spa-flag.ts`** — `createSpaConsult` builds `deps.spa(c, surface)`, spec §4's
  consult order verbatim: **session gate re-checked inside** → `?ssr=1`/`x-rhema-renderer: ssr`
  ⇒ SSR on every stage → `?renderer=spa`/`x-rhema-renderer: spa` ⇒ SPA **only** where
  `SPA_OVERRIDES=1` → flag membership → `ide-chrome` AND-gate on the framed keys.
  *(REQ-SEQ-4, REQ-BND-11)*
- **`WebDeps`** — `spaSurfaces` + `spaOverrides` facts + optional `spa` seam (createWebApp
  installs the consult over the `withRequestId`-wrapped session); **`main.ts`** wires
  `SPA_SURFACES`/`SPA_OVERRIDES` envs beside `SIGNUP_MODE`.
- **`StageConfig.spaSurfaces`** — `readonly SpaSurface[]`, `[]` on dev/preview/prod
  (REQ-SEQ-5); **`compute.ts`** emits web env `SPA_SURFACES` (stage fact, or the
  `rhema:spaSurfaces` stack config when set) + `SPA_OVERRIDES=1` iff `kind !== "prod"`;
  **`index.ts`** reads the config; **`PROD-BRINGUP.md`** documents the key. *(REQ-SEQ-3)*
- **Owned decision (recorded, no ADR owed):** `ideFramed` is key-level per the design
  pseudocode; `onboarding` stays unframed because only its `/p/:p/import*` legs are IDE-framed —
  those handlers compose `deps.spa(c,"onboarding") && deps.spa(c,"ide-chrome")` (REQ-SEQ-2's
  "key AND chrome" per route), pinned by test.

## Overrides never bypass the gates

The consult re-runs `deps.session(c)` first: a signed-out request carrying `?renderer=spa` or
`x-rhema-renderer: spa` still reads `false` (REQ-SEQ-4's clause made structural). Server
redirects and forced-SSR capability checks remain handler-side and run BEFORE the consult —
unchanged.

## Test evidence

- contracts `spa.test.ts` 9 · web `spa-flag.test.ts` 9 · `stages.test.ts` +2 ·
  `compute.test.ts` +2 — parse edges, consult order, override honored/refused per stage
  posture, the AND-gate, session-gate precedence.
- Two standing guards did their job on the first full run: the web-env non-secret allowlist
  (`secrets-manifests`) + the `rhema:*` runbook gate — both amended per their own contract.
- Gate: `turbo build lint typecheck` 135/135 · full `pnpm test` green (tally in `runs/SPA.2.md`)
  · `pnpm install --frozen-lockfile` clean.
- CI: `integration`/privsep red is inherited on this chain — classified under GD-MAINT.4-1, not
  repaired.
