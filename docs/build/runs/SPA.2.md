# SPA.2 — SPA surface flags: parse → WebDeps → deps.spa → deploy wiring (run ledger)

- **Status:** DONE (Stage A; offline-only ticket — no deploy, no live legs owed)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/99_SPA.2__flag-plumbing.md` (manifest row 99)
- **Branch:** `stevevitali/spa-2-flag-plumbing`, stacked on
  `stevevitali/spa-1-vite-toolchain-adr106` @ `42f41c3` (`OPERATOR` merge policy, **not merged**).
- **Goal:** the whole strangler consult — `SPA_SURFACES` CSV parsed fail-closed, the 14-key +
  `ide-chrome` vocabulary, `deps.spa(c, surface)` inside spec §4's fixed handler order, and the
  deploy wiring (stage fact → `compute.ts` env → `rhema:spaSurfaces` stack config;
  `SPA_OVERRIDES` non-prod only). Deployable dark: **no flag is set anywhere** (REQ-SEQ-5) and
  no route consults `deps.spa` until the shell document lands (SPA.3+).
- **Spend:** $0. No deploys, no production writes.

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by SPA.2 — the open rows are
  live-deploy legs, HUMAN prerequisites (H2/H3/H6), or funded-window journeys; none is SPA-scoped
  or gated on flag plumbing. No new row owed: every AC is deterministic-engineered.
- LEDGER CURRENT STATE read: `nextTicket: SPA.2`, `chainTip:` =
  `stevevitali/spa-1-vite-toolchain-adr106` (tip `42f41c3`), `mergePolicy: OPERATOR`.
- Design sources applied, not re-derived: `docs/frontend-spa-spec.md` §4 (fixed handler order),
  §11 (flag bullets), Appendix D (the verbatim vocabulary + override channel names);
  `docs/design/29_spa-migration-sequencing.md` §flag-mechanism (the concrete pseudocode — the
  consult's `set.has(surface) && (!ideFramed(surface) || set.has("ide-chrome"))` tail is applied
  verbatim); `docs/design/26_spa-public-auth-boundary.md` §3 (the handler shape — session gate →
  server redirects → `deps.spa` → shell‖SSR); spec Appendix E E-1 (the override consult lives
  INSIDE `deps.spa`, between forced-SSR and flag membership).

## 1 — What landed

- **`packages/contracts/src/spa.ts`** — `SPA_SURFACES` (the 14 keys + `ide-chrome`, spec
  Appendix D flip-order verbatim) + `SpaSurface` union; `SPA_IDE_FRAMED_SURFACES` (the keys whose
  EVERY route mounts inside the IDE chrome: `export`, `dossier`, `run-sheet`, `run-report`,
  `editor`); `SPA_RENDERER_HEADER` (`x-rhema-renderer`, shared with the future journey harness +
  probes); `parseSpaSurfaces(raw, warn?)` — `undefined`/`null`/empty ⇒ `∅`, tokens trimmed +
  deduped, unknown tokens dropped and reported in **one** warn line, never throws (the
  `parseSignupMode` fail-closed precedent — REQ-SEQ-1).
- **`apps/web/src/spa-flag.ts`** — `createSpaConsult({surfaces, overrides, session})` builds
  `deps.spa(c, surface)`. The order inside is the REQ-SEQ-4/design-29 pseudocode verbatim:
  1. **session gate re-checked inside the consult** — a force-spa override on a signed-out
     request still reads `false` (the "overrides never bypass the session gate" clause made
     structural, not advisory);
  2. `?ssr=1` **or** `x-rhema-renderer: ssr` ⇒ `false` — honored on **every** stage (the
     escape hatch wins even when a force-spa signal is also present);
  3. `?renderer=spa` **or** `x-rhema-renderer: spa` ⇒ `true` — only where `overrides` (env
     `SPA_OVERRIDES=1`, non-prod kinds only) — refused silently off those stages (flag
     membership then decides, exactly the pseudocode);
  4. flag membership + the `ide-chrome` AND-gate:
     `surfaces.has(surface) && (!IDE_FRAMED.has(surface) || surfaces.has("ide-chrome"))`.
- **IDE-framed granularity decision:** `ideFramed` is key-level per the design pseudocode.
  `onboarding` is deliberately NOT in `SPA_IDE_FRAMED_SURFACES` — the route map marks only its
  two `/p/:p/import*` legs IDE-framed, so key-level framing would either hold `/app/new` hostage
  to `ide-chrome` (breaking flip position 5) or let the import legs flip early. The surface
  ticket composes the gate at the call site: `deps.spa(c, "onboarding") && deps.spa(c,
  "ide-chrome")` — which is exactly REQ-SEQ-2's "surface key AND ide-chrome" for that route
  (pinned by a test). Owned decision; no ADR owed (applies the normative route map verbatim).
- **`apps/web/src/server.ts`** — `WebDeps` gains `spaSurfaces?: ReadonlySet<SpaSurface>`,
  `spaOverrides?: boolean`, and `spa?(c, surface)` (optional-injectable like `beginAuth`;
  `createWebApp` installs the consult over the **wrapped** `withRequestId` session seam when
  absent). No route consults `deps.spa` yet — SPA.3's shell + the surface tickets are the
  consumers; per spec §4 the handler's own session gate, `?verified=1` mint, `/app` precedence,
  `/p/:slug` handoff, and forced-SSR checks still run BEFORE the consult.
- **`apps/web/src/main.ts`** — `spaSurfaces: parseSpaSurfaces(process.env.SPA_SURFACES)` +
  `spaOverrides: process.env.SPA_OVERRIDES === "1"` beside `signupMode` (design/29's
  `main.ts:108`-shape directive).
- **`infra/config/stages.ts`** — `StageConfig.spaSurfaces: readonly SpaSurface[]` (type-only
  import — the program stays dependency-free of contracts runtime code); **`[]` on all three
  kinds** (REQ-SEQ-5 — no flag anywhere until the foundation set lands), each with its own
  comment (dev rides surface tickets; previews flip via `rhema:spaSurfaces`; prod flips are
  separate operator-merged commits per REQ-SEQ-10).
- **`infra/pulumi/compute.ts`** — `ComputeArgs.spaSurfaces?: string` (the raw CSV override) and,
  inside the web envs block beside `SIGNUP_MODE`: `SPA_SURFACES` = `args.spaSurfaces ??
  cfg.spaSurfaces.join(",")`, plus `SPA_OVERRIDES=1` iff `cfg.kind !== "prod"` (the
  `IDENTITY_HEADERS` precedent — prod never carries the force-spa posture).
- **`infra/pulumi/index.ts`** — `rhemaConfig.get("spaSurfaces")` → `createCompute({spaSurfaces})`
  — the `preview-stack.mjs config` path the per-flip runbook drives (never committed; the stage
  fact stays the git-visible truth).
- **`infra/PROD-BRINGUP.md`** §2 — `rhema:spaSurfaces` documented (the
  `runbook-completeness.test.ts` gate caught it — every `rhema:*` key read in the program must be
  named in the runbook).
- **`packages/security-checks/src/secrets-manifests.test.ts`** — the web-env non-secret allowlist
  gains `SPA_SURFACES` + `SPA_OVERRIDES` (mode strings, same class as `SIGNUP_MODE`; the gate
  caught them — exactly its job).

## 2 — Tests (every behavior fails if the code is removed)

- `packages/contracts/src/spa.test.ts` (9) — the 15-token vocabulary pinned verbatim incl. order;
  the IDE-framed set pinned (and `onboarding`/`ide-chrome` pinned OUT of it); the header name
  pinned; parse edges: unset/empty ⇒ ∅ silently, CSV trim/dedupe, single key, full round-trip,
  unknown tokens dropped + **exactly one** warn line naming all of them, all-garbage ⇒ ∅, case
  sensitivity (`PROJECT-HOME` dropped).
- `apps/web/src/spa-flag.test.ts` (9) — real-`Context` probe routes: ∅ ⇒ all-SSR; flag on/off
  membership; the AND-gate per framed key (flag alone ⇒ false; flag+chrome ⇒ true; chrome alone
  ⇒ false; non-framed flag unaffected); the route-level `onboarding`+`ide-chrome` composition;
  `?ssr=1` + `x-rhema-renderer: ssr` forced-SSR on BOTH override postures and winning over a
  simultaneous force-spa; `?renderer=spa`/`x-rhema-renderer: spa` honored iff `overrides`
  (non-prod), refused on the prod posture (flag membership decides); unknown renderer values fall
  through to the flag; **the session gate precedes the override** — signed-out + force-spa ⇒
  false.
- `infra/config/stages.test.ts` (+2) — every stage's `spaSurfaces` is `[]`; every listed key must
  be a known `SpaSurface` (the vocabulary gate).
- `infra/pulumi/compute.test.ts` (+2) — `SPA_SURFACES` emitted once, inside the web envs block,
  = `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`; `index.ts` reads `rhema:spaSurfaces` and
  passes it through; `SPA_OVERRIDES` emitted once, web-only, gated `cfg.kind !== "prod"`.

## 3 — Verify

- `pnpm vitest run` scoped (contracts spa + web spa-flag + stages + compute): **56/56**.
- `pnpm turbo build lint typecheck`: **135/135 tasks** (after the two gate-driven fixes below).
- `pnpm test` (full suite): **452 files / 4,611 pass / 4 skip / 0 fail** (includes the 145 s
  `privsep.docker` leg locally — green).
- `pnpm install --frozen-lockfile`: clean (no manifest changes).
- `check-build-memory.sh` + `check-append-only.mjs --base 42f41c3`: clean (append-only OK;
  structure warnings are all pre-existing).

## 4 — Findings / deviations / CI

- **Gate-driven fixes (real, landed in this PR):** two standing guards caught the new surface on
  first full run — `secrets-manifests.test.ts` (the web env allowlist) and
  `runbook-completeness.test.ts` (`rhema:*` key docs). Both amended in-place per their own
  contract (allowlist entry + runbook bullet); not deviations.
- **Deferrals:** none opened, none closed.
- **REQ ids stamped:** REQ-SEQ-1, REQ-SEQ-2, REQ-SEQ-3, REQ-SEQ-4, REQ-SEQ-5 (the `[]`-everywhere
  posture), REQ-BND-11 (the consult's position in the fixed order), REQ-FW-3 (the flag plumbing
  half; the shell document itself is SPA.3).
- **Out of scope held:** no flag set on any stage (REQ-SEQ-5); no route consumes `deps.spa` (the
  shell is SPA.3); no surface content; overrides never bypass session/redirect/forced-SSR.
- **CI:** recorded at closeout (`gh pr checks --watch=false`); the inherited
  `integration`/privsep red on this chain is classified under GD-MAINT.4-1, not repaired.
