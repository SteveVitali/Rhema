# implement-spec ledger — PRB.01 (beta web shell, invite gating, sample dossier)

- **Spec:** docs/tickets/17_PRB.01__beta-shell-and-invites.md
- **Base commit:** 4945d83 (GATE-G2 deferred; chain tip `stevevitali/p0-15k-live-three-project-reviews-cost`)
- **Branch:** stevevitali/prb-01-beta-shell-and-invites
- **Config:** full (all rigor phases on)
- **Context:** Phase 0 EXITED (G1 PASSED w/ accepted exceptions 2026-09-15). G2 (wave-1 LIFT) **DEFERRED**
  by operator (readouts/GATE-G2.md) — proceed to Phase-B. **Standing constraints:** no efficacy/marketing
  claims (§16.4 stands until the eval clears); no pricing/plans page (REQ-BETA-19); beta is private + capped.

## Deferrals read
- Scanned `DEFERRALS.md` for PRB/beta-scoped rows. This ticket depends on P0.01 (web app, Better Auth) +
  P0.02 (contracts).
- **D-P0.01-3 (OPEN)** — Sign-in with Google AND magic link works on `dev`. This is a **live-deploy** row
  (needs a deployed `dev`, Google OAuth consent, secrets). PRB.01 builds the invite-gating layer on top of
  P0.01's auth, but the live Google/magic-link end-to-end proof stays gate-pending (no `dev` in build env).
  → PRB.01 does NOT close D-P0.01-3; its invite-gating ACs are proven deterministically (unit/integration).
- Nothing else in DEFERRALS is unblocked by PRB.01 (D-P0.11-3→PRB.8, D-P0.10-1→PRB.9, D-P0.12-2→PRB.06,
  D-P0.09-2→P1.02/PRB.02 — all later tickets).

## Requirements (stamp in PR)
- REQ-BETA-19 — beta private + capped: no PR, no public pricing/plans page, no signup-without-invite.
- REQ-BETA-21 — stopgap #2 declared (flat shell); strict subset of Phase-1 on kept contracts.
- REQ-PROD-9 — project state is a pure function powering the pill + suggested-next (surface half).
- REQ-SPEC-3 — no stored `status` column; UI derives from the §6.3 state function (UI half).
- REQ-PROD-6 / REQ-BILL-18 — disjoint canonical vocabularies; banned strings lint over UI strings (Appendix D.2).
- REQ-POS-3 — sample dossier: Essay protocol, ≥1 contradicted Tier-1 claim with its fetched URL chip.

## Acceptance criteria
- AC1 — Signup without a valid invite is refused; with one, lands on the project list. *(deterministic)*
- AC2 — Project rows derive pill/action from the state function — no stored status (REQ-SPEC-3). *(deterministic)*
- AC3 — Sample dossier page renders read-only with its contradicted Tier-1 claim + fetched-URL chip visible
  (REQ-POS-3). *(deterministic)*
- AC4 — i18n/string lint green against Appendix D.2. *(deterministic)*
- AC5 — No public route exposes pricing, plans, or signup-without-invite (REQ-BETA-19). *(deterministic)*

## Reference facts extracted
- **§6.3 state function** (spec:877-905): pure fn of `(outline?, versions[], reviews[], responses[], runs[],
  accepted_version?, exports[], archived_at?)`; keys empty/researching/outlined/draft/reviewed/edited_by_you/
  accepted/exported/archived + overlays running/needs_you; each has a Pill + Suggested-next. REQ-SPEC-3: no
  stored status.
- **§5.9 tokens** (spec:717-746): dark shell CSS custom props (`--shell-bg:#0f1114` …), light overrides under
  `[data-theme="light"]`; contrast floors; Inter shell UI 13/14/12, Literata paper.
- **§4.2 URLs** (spec:374-394): canonical `/p/:project`, `/p/:project/r/:run[/g/:gate]`, etc. No `/runs/` or
  `/gates/`. `/app/...` for workspace.
- **Appendix D.2** (spec:3689-3701): banned/reserved strings (plans, tiers, rigor, seats, approvals, autonomy,
  views, banned words incl. "gate"/"Pro"/"tokens"/"Claude Code"/"unlimited", reserved product nouns).

## Plan

**Architecture decision (ADR-007):** the beta shell is a React SSR app rendered by **React Router v7
declarative SSR** (`StaticRouter` + `Routes`/`Route`/`Outlet`, `renderToStaticMarkup`), served by **Hono**
(`@hono/node-server`, consistent with apps/api), built by **`tsc -b`** (no Vite, no framework-mode). No
client hydration — progressive-enhancement native forms + `<a>` nav. This keeps the `turbo build/lint/
typecheck` green gate intact and fits REQ-BETA-21's "throwaway flat shell" (stopgap #2). The full-IDE shell
(P1.01) adopts the §5 design system + a bundled router.

**Packages & apps touched (build order):**
1. **`@rhema/tokens`** (author) — §5.9 token values as typed objects + `themeCss()` (`:root` dark + `[data-theme="light"]`, verbatim §5.9) + typography constants. No pure black/white.
2. **`@rhema/ui`** (author, React) — presentational primitives: `Shell`, `Pill`, `PrimaryAction`, `ProjectRow`/`ProjectList`, `Chip` (+ fetched-URL variant), `ClaimRow`, `DossierView`, `InvitePage`, `LoginForm`, `EmptyState`. Framework-free React; consume tokens; no router import.
3. **`@rhema/contracts`** (extend) — `vocab-lint.ts`: `lintCopy(strings)` consuming `BANNED_STRINGS`/`RESERVED_CLASSES` (honoring `except`) — the reusable "extends P0.02's data" wiring for UI strings.
4. **`@rhema/db`** (extend) — migration `0016_invites.sql`: `invites` (code pk, email allowlist, max_uses, used_count, expires_at, revoked_at…) + `invite_redemptions`; Drizzle schema + parity.
5. **`@rhema/api-client`** (author) — typed `createApiClient({baseUrl,fetch})`: `listProjects()→ProjectRow[]` (`{id,slug,title,state:ProjectStateDto}`), `checkInvite(code)`; shared DTO types (`ProjectStateDto` mirrors orchestrator `ProjectState`).
6. **`apps/api`** (extend) — `invite.ts` (`createInviteGate(db)`: `check`/`consume`; Better-Auth `user.create.before` hook seam), `project-list.ts` (`listProjectStates(db,principal)` → assembles `ProjectStateInput` from real rows, calls `projectState`), routes `GET /projects` (session) + `GET /invite/sample-dossier` (public). Wire `createAuth` to accept the invite gate.
7. **`apps/web`** (author) — the shell: `copy.ts` (i18n table), `routes.tsx` (canonical `/invite`,`/login`,`/app`,`/p/:project`; NO pricing/plans/public-signup), `server.ts` (Hono: public invite/login, invite-gated signup POST, auth-gated `/app`), `render.tsx` (SSR doc + token CSS), `data.ts` (`DataSource` seam + api-client impl + fake), sample dossier data (anonymized Essay stand-in with a **contradicted Tier-1 claim + fetched URL**, REQ-POS-3).

**Live/deferred:** the live Google + magic-link end-to-end (D-P0.01-3) and the operator content sign-off for
the sample dossier (H3 / REQ-POS-3) are deploy/HUMAN-gated → gate-pending DEFERRALS rows; the invite-gate
logic + shell + sample are proven deterministically.

## Test matrix
- **AC1** (invite gate): `apps/api invite.test.ts` (PGlite) — `check(absent/invalid/expired/revoked/used)`→refuse; `check(valid)`→ok; `consume` increments used_count + writes redemption + refuses reuse past max_uses; the `user.create.before` hook throws without a valid code. `apps/web` — `/login` POST with no/invalid invite → refused (no auth initiated); with valid → proceeds; `/app` unauthenticated → redirect to `/login`.
- **AC2** (state fn): `apps/api project-list.test.ts` (PGlite + `seedRealProjects`) — `listProjectStates` returns each project's `state` == `projectState(assembledInput)`; no `status` column read/written. `@rhema/ui ProjectRow` render — pill + primary-action label come from the DTO.
- **AC3** (sample dossier): `apps/web sample-dossier.test.ts` — the data has ≥1 `tier:1 verdict:"contradicted"` claim with a fetched URL (`sources[].stance:"contradicts"`); `DossierView` SSR markup shows it read-only + the fetched-URL chip; no disposition/triage controls rendered.
- **AC4** (vocab lint): `@rhema/contracts vocab-lint.test.ts` — `lintCopy` flags banned substrings, honors `except`. `apps/web copy.test.ts` — `lintCopy(ALL_COPY)` == [] (zero violations, Appendix D.2).
- **AC5** (no pricing/plans/signup): `apps/web routes.test.ts` — the route manifest has no path matching `/pricing|/plans|/signup|/billing`; every non-`/invite`,`/login` route is auth-gated; `buildRatesPublication`/pricing never imported by web.
- **Regression/invariants**: no-cross-package-relative-import lint; tokens no pure black/white; `turbo build lint typecheck` + `pnpm test` green across touched packages.

## Progress
- Phase 0–1 done: context loaded, branch cut, ledger seeded, plan + test matrix recorded, baseline green (102/102).
- Phase 2 implemented (all green individually):
  - `@rhema/tokens` — §5.9 values + `themeCss()` (7 tests).
  - `@rhema/contracts` — `vocab-lint.ts` `lintCopy` over reserved-strings (6 tests).
  - `@rhema/db` — migration `0016_invites.sql` + Drizzle `invites`/`invite_redemptions` (parity + migrate green).
  - `apps/api` — `invite.ts` gate (6), `project-list.ts` `listProjectStates`/`createShellRoutes` (5); wired into `createApp`.
  - `@rhema/api-client` — typed `createApiClient` (3).
  - `@rhema/ui` — React primitives + `DossierView` (4).
  - `apps/web` — copy table, sample dossier, state-map, data seam, pages, routes, render, Hono server, main (18 across routes/copy/server/sample-dossier).
  - vitest.config: added automatic JSX + `.test.tsx` globs (additive).
- Next: Phase 3 self-review, Phase 4 gap analysis + ADR-007, Phase 5 verification, Phase 6 PR + close.

## Gap table
(re-read ticket 17_PRB.01 fresh; every requirement + AC mapped to evidence)

| item (spec §) | status | evidence | notes |
|---|---|---|---|
| AC1 signup refused w/o invite; w/ one → list | met | `apps/api/src/invite.test.ts` (check/consume, 6); `apps/web/src/server.test.ts` AC1 (POST /login gates before auth; /app→/login) | live Google+magic-link e2e = D-P0.01-3 (deploy); gate is provider-agnostic + tested |
| AC2 rows derive pill/action from state fn; no stored status | met | `apps/api/src/project-list.test.ts` (5: derivation + `projectState()` equality + no status/state column + tenant scope); `packages/ui/src/ui.test.tsx` ProjectRow render | consumes `@rhema/orchestrator` `projectState` (REQ-SPEC-3) |
| AC3 sample dossier read-only + contradicted Tier-1 + fetched chip | met | `apps/web/src/server.test.ts` AC3 (`data-contradicted-tier1`, `data-fetched`, `courtlistener.com`, `aria-readonly`, no button/form); `sample-dossier.test.ts` (REQ-POS-3 invariant) | operator content sign-off = H3 (deferred) |
| AC4 i18n/string lint green vs Appendix D.2 | met | `packages/contracts/src/vocab-lint.test.ts` (6); `apps/web/src/copy.test.ts` (`lintCopy(collectCopyStrings())` == []) | reusable `lintCopy` consumes P0.02 reserved-strings |
| AC5 no public pricing/plans/signup-without-invite | met | `apps/web/src/routes.test.ts` (no pricing/plans/signup/billing path; public set = /,/invite,/login); `server.test.ts` AC5 (`/pricing`→404, no "pricing"/"plans" in home) | REQ-BETA-19 |
| Deliverable 1 invite gating (Google+magic link, no public signup, no pricing) | met | invite gate + web /login; no signup route; no pricing route | consume() call-site + Better-Auth mount = D-P0.01-3 |
| Deliverable 2 flat dark shell, canonical URLs, §5.9 tokens, no panes, phone-width | met | `@rhema/tokens` §5.9 + `data-theme="dark"`; `Shell` (max-width+gutter+wrap); `/p/:project` canonical | §5 pane system correctly NOT built (P1.01) |
| Deliverable 3 project list (pill + one primary action; attention grouping may be a simple sort) | met | `ProjectList`/`ProjectRow`; ordered `created_at desc` (the allowed simple sort) | attention-first grouping optional at beta per ticket |
| Deliverable 4 invite page + read-only sample dossier | met | `InvitePage` + `DossierView` + `SAMPLE_DOSSIER` | H3 sign-off deferred |
| Deliverable 5 vocab lint wiring (extends P0.02 data) | met | `@rhema/contracts` `lintCopy`; web copy table + test | eslint global rule left as coarse guard (word-boundary lint is the precise vehicle) |
| REQ-BETA-21 stopgap #2 declared | met | declared in `shell.tsx`, `@rhema/ui`/`@rhema/web` headers, ADR-007, PR body | on kept contracts (state fn, canonical URLs, DTOs) |
| Out of scope NOT built (import/run-sheet/triage/billing UI/§5 panes) | met | none present in diff | — |
| REQ-SPEC-3 no stored status column | met | `project-list.test.ts` asserts projects table has no status/state col | — |

## Evidence log

**5.1/5.2 unit + integration (deterministic, PGlite + Hono app.request):**
- `pnpm exec vitest run packages/tokens` → 7 pass (§5.9 values, no pure black/white in Dark, themeCss).
- `packages/contracts/src/vocab-lint.test.ts` → 6 pass (word-boundary, except handling, arrays/maps).
- `packages/db` parity + migrate → green (0016 invites table typed + applied idempotently).
- `apps/api/src/invite.test.ts` → 6 pass (check unknown/expired/revoked/exhausted/email; consume race + idempotency + max_uses).
- `apps/api/src/project-list.test.ts` → 5 pass (3 real projects `edited_by_you`; `projectState()` equality; no status column; varied states; tenant scope).
- `packages/api-client` → 3 pass; `packages/ui/src/ui.test.tsx` → 4 pass; `apps/web` (routes/copy/server/sample-dossier) → 18 pass.
- **Green gate:** `pnpm turbo build lint typecheck` → 102/102. **Full suite:** `pnpm test` → 1303 pass / 2 skip (server-postgres integration needs DATABASE_URL), no regressions.

**5.3 live HTTP boot** (`@hono/node-server` real socket, in-memory data source):
```
GET / invite            200  [dark,contradicted-t1,fetched-chip,courtlistener,proj-title]  b=11240
GET /login              200  [dark]
GET /app unauth         302  loc=/login
GET /app authed         200  [dark,proj-title,primary-action]
GET /pricing            404
POST /login nocode      400            (no auth attempted)
POST /login GOOD magic  200  [link-sent]
POST /login GOOD google 302  loc=/auth/google/start
```
Every AC observed over the wire: AC1 (gate refuses/accepts + /app→/login), AC2 (project row pill+action),
AC3 (contradicted Tier-1 + fetched chip on the read-only invite page), AC5 (/pricing 404, dark shell).

**Gate-pending (DEFERRALS D-PRB.01-1/-2/-3):** the live Google/magic-link e2e + `consume` at account creation
(needs Better Auth mounted on `dev`, D-P0.01-3); operator content sign-off for the sample dossier (H3); the
tenant-scoped `db` binding (D-P0.08-1). None fabricated as passed.

## Self-review (Phase 3/4.3) — independent fresh-context design review + fixes
A fresh-context Staff-Engineer review (spec + diff only) surfaced 8 findings; disposition:
- **FIXED — `consume()` same-user race** (check-then-act → double seat-burn under concurrency): rewritten as one
  atomic CTE (`ins` gated on validity + `on conflict (code,user_id) do nothing`; `upd` increments iff `ins`
  inserted; `already` = pre-statement redemption state). `apps/api/src/invite.ts`.
- **FIXED — email-bound invite unusable with Google** (email empty pre-OAuth → `email_mismatch`): the web
  `/login` validates Google code-only; the email binding is enforced at `consume()` post-OAuth (D-PRB.01-1).
  New test asserts no email is passed for the Google path. `apps/web/src/server.ts`.
- **FIXED — invalid `aria-readonly` on `<article>`**: replaced with `data-readonly` (read-only is guaranteed by
  the absence of any control, which the tests assert). `packages/ui/src/dossier.tsx` + tests.
- **DOCUMENTED — `consume()` not yet call-sited** (single-use enforcement fires at account creation): intended;
  Better Auth is not mounted (D-P0.01-3). Made explicit in D-PRB.01-1 + PR body.
- **DOCUMENTED — `POST /invite/check` is an unauthenticated validity oracle**: accepted for private,
  operator-issued, revocable beta codes; rate-limiting/coarser reasons are a public-launch follow-up (noted at
  the route + here). **Security note for a future ticket:** add rate-limiting to `/invite/check` before public.
- **ACCEPTED (documented, no change)**: sample dossier is an H3 stand-in (D-PRB.01-2); `lintCopy` enforces the
  banned-half of D.2 by design (reserved-class role can't be judged from a copy table); `/p/:project` loads the
  list at beta scale; `letterOpenedAt` unset at beta (reviewed→"Read the Editor's letter").
- Review also **confirmed clean**: no SSR XSS (renderToStaticMarkup escapes; no dangerouslySetInnerHTML), no
  route leaks (`/pricing/rates` is the pre-existing REQ-BILL-19 rates JSON, not a marketing page), correct SQL
  joins/scoping, NodeNext/`verbatimModuleSyntax` consistency, web decoupled from orchestrator/db.

Post-fix: `turbo build lint typecheck` 102/102; affected suites 35/35; live re-smoke confirms both fixes.

## Evidence report

**All five ACs met, deterministically + over a live socket.**

| AC | Evidence |
|---|---|
| AC1 invite gate | `invite.test.ts` (7: check unknown/expired/revoked/exhausted/email; consume atomic race, idempotency, email-bound, max_uses); `server.test.ts` AC1 (7: refuse w/o valid invite before any auth; Google code-only; `/app`→`/login`); live boot |
| AC2 state-fn rows | `project-list.test.ts` (5: `projectState()` equality, no status column, varied states, tenant scope); `ui.test.tsx`; live boot `/app` |
| AC3 read-only dossier | `server.test.ts` AC3 + `sample-dossier.test.ts` (REQ-POS-3 invariant); live boot `[contradicted-t1,fetched-chip,courtlistener]`, `data-readonly`, no controls |
| AC4 vocab lint | `vocab-lint.test.ts` (6); `copy.test.ts` (`lintCopy(collectCopyStrings())` == []) |
| AC5 no pricing/plans/signup | `routes.test.ts`; `server.test.ts` AC5; live `/pricing`→404 |

**Gaps found + closed:** the Phase-4 walk found none unclosed vs the ticket; the fresh-context review found 3
correctness/design defects (consume race, Google email-bound, invalid ARIA), all fixed with tests, plus 2
accepted-and-documented posture items (consume wiring, check oracle).

**Deviations/deferrals:** ADR-007 (React SSR, no Vite — REQ-BETA-21 stopgap #2). Gate-pending: D-PRB.01-1 (live
Google/magic-link + `consume` at account creation, rides D-P0.01-3), D-PRB.01-2 (sample-dossier operator
sign-off, H3), D-PRB.01-3 (tenant-scoped db binding, rides D-P0.08-1). None fabricated as passed.
