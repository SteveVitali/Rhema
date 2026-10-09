# SPA.15 — surface: project-home (`/app` → React SPA behind the `project-home` flag)

**Manifest row 117** · stacks on `stevevitali/spaf-5-prod-flip-onboarding` @ `2a7014e` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/117_SPA.15__surface-project-home.md` per `docs/design/22`
(endpoint table — the `app.index` row), `docs/design/29` (route-map `project-home`),
`docs/design/27` (two-leg + rollback mechanics + the REQ-VFY-9 class map), and
`docs/frontend-spa-spec.md` §4/§8/§9. `STAGES.dev.spaSurfaces` gains `"project-home"`;
preview `[]` and prod `["usage","inbox","settings","voices","onboarding"]` stay
unchanged (the prod flip is SPAF.6's own row, gated on the REQ-SEQ-10 bake).

**Deployable dark:** nothing changes for an unflipped request — the leaf's loader
skips its BFF read and `SsrHandoff` document-navigates back to `/app`, where the
server re-runs session → `?verified=1` mint → showcase/held-file precedence → flag
consult → SSR. That order is normative and unchanged (REQ-BFF-20, REQ-BND-11). SSR
fallback + SSR tests untouched (REQ-SEQ-11/12); `?ssr=1`/`x-rhema-renderer` overrides
ride the unchanged consult machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8/9 · REQ-BFF-20 · REQ-BND-11 · REQ-BFF-1/2/3/8/9/11 ·
REQ-DAT-4/12 · REQ-NAV-5 · REQ-UX-3/4/5/10/13/14/15/16**

## What lands

### `GET /bff/app` — the §5.2 aggregate twin (REQ-BFF-1/8/9, REQ-DAT-4/12)

- `{rows, voices, groupBy, balance, protocols, deletedRows, search?}` — raw DTOs over
  the exact seam set the design table names (`listProjects`, `listVoices`,
  `getProjectGrouping`, `getBillingBalance`, `searchProjects(?q)`,
  `listProtocolCards`, `listDeletedProjects(?deleted=1)`).
- **Raw DTOs, no view models** — the filter/sort/group derivation and the row→view
  mapping run client-side off the shared `state-map.ts` seam (`toProjectRowView` /
  `groupByAttention` / `groupByVoice`), so SSR and SPA can never drift on row
  anatomy (design/22 F10). Only `?q=` and `?deleted=1` ride the wire — the
  non-derivable reads.
- Degrade parity: `listProjects` load-bearing (`bffFail` → 502; upstream 401 →
  `{error:"unauthenticated"}`); every optional seam rides `swallowDegraded` to the
  SSR's composed defaults; a mid-session 401 rethrows.

### JSON mutation branches (REQ-BFF-1/2/3)

- `POST /app/grouping` → `{ok,redirect:"/app"}` · `POST /p/:slug/{archive,
  unarchive,delete}` → `{ok,redirect:"/app"}` · `POST /p/:slug/duplicate` →
  `{ok,redirect:"/p/<copy>"}` (source slug on a swallowed write) ·
  `POST /p/:slug/restore` → `{ok,redirect:"/app?deleted=1"}` (deleted-list
  resolution only — an active slug answers `{error:"not_found"}`).
- Unauthed JSON → 401 envelope, never a redirect; unknown slugs →
  `{error:"not_found"}` vs the form's not-found document. Form posts keep their
  exact 302 behaviour — the dual-mode is `wantsJson` + `bodyFields` +
  `mutationOutcome`.

### `spa/surfaces/project-home.tsx` + the wired leaf

- `ProjectHomeSurface` ports `ProjectsPage` verbatim — controls bar, Voice chips,
  attention/voice groups, `?q=` search section, archived `<details>`, deleted
  restore section — all hooks resolve to the manifest. `compact` (phone) withholds
  the new-project affordance (§10.1).
- Delegated `onSubmit`: GET forms become in-router `/app?…` navigations; POST forms
  ride the JSON branch — fields collected before `aria-busy` + disabled controls
  (REQ-UX-16), `redirect` navigates in-router, settle invalidates `["bff"]`.
  `/logout` stays a native document POST.
- Leaf warms `projectHomeQuery({q, deleted})` only on the `"spa"` verdict;
  `flagParam` normalizes the router's numeric `=1` parse (the fix that keeps
  `?archived=1`/`?deleted=1`/`?verified=1`/`?held=1` alive through validation).

### DOM contract + journeys + stage fact

- `project-home` manifest block: +16 hooks (`data-group-by`, `data-filter-form`,
  `data-archived-toggle`, `data-deleted-toggle`, `data-search-results`,
  `data-archived-section`, the row anatomy hooks, and the seven field names) —
  54/54 emitted+asserted.
- `SURFACE_GATES["project-home"]` already matches the design/27 subset verbatim
  (`R1`, `R7`, `T2.badge`, `T6`, `T7`, `P1.project`, `X1.home`) — audited
  renderer-agnostic (every gated step settles on `data-mounted`) and `paid:false`.
- `STAGES.dev.spaSurfaces += "project-home"`; protocol-markers allowlist +=
  `state-map.` (the shared mapper joined the bundle graph — pure COPY + type-only).

## Verification

- `pnpm turbo build lint typecheck` — green (135 tasks)
- `pnpm test` — **5,294 pass / 4 skip / 0 fail** (478 files)
- `src/spa/project-home.dom.test.tsx` — 17 legs: mounted `/app` under
  flipped/compact verdicts, controls + chips + groups + all three conditional
  sections, delegated JSON POSTs (`/app/grouping`, row-menu archive/duplicate,
  restore), GET-form in-router nav, `aria-busy` in-flight leg, empty state,
  REQ-TST-2 parity vs `ProjectsPage` on the same fixture, axe, designed error
  state, SsrHandoff with zero BFF reads.
- `src/bff.test.ts` — +16 legs: twin aggregate/`?deleted=1`/`?q=` gating,
  degrade→SSR defaults, 401 pass-through, load-bearing 5xx→502, and both-mode
  mutation legs.
- `check:dom-contract` / `check:spa-budget` / `check:licenses` /
  `check:protocol-markers` / `check:no-cookies` / `check:spa-env` — all OK.

## Honestly deferred (deterministic proxies in place)

- `D-SPA.15-1` — preview two-leg A/B/C on `pr-<n>` — **blocked:** the shared secret
  `rhema-nonprod-resend-api-key` is absent from `rhema-507501` (re-probed this run →
  `NOT_FOUND`; never printed — no signed-in preview session can mint). Recipe +
  evidence verbatim in `docs/tickets/DEFERRALS.md`.
- `D-SPA.15-2` — rollback drill on the same preview — recorded arm, same blocker.
- `D-OPS.1-1` / `D-MAINT.6-1` / `D-SPA.6-1` stay OPEN (unchanged prerequisites).

## Chain position

Base `stevevitali/spaf-5-prod-flip-onboarding` (`2a7014e`) → this branch
`stevevitali/spa-15-surface-project-home`. Next row: SPAF.6 (prod flip:
project-home) — gated on the REQ-SEQ-10 nightly-green chain (D-SPAF.1-4 …
D-SPAF.5-4) per the 2026-10-08T19:12Z sequencing ruling.
