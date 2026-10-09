# SPA.15 — run ledger: surface `project-home` (`/app`)

- **Ticket:** `docs/tickets/117_SPA.15__surface-project-home.md` (manifest row 117)
- **Branch:** `stevevitali/spa-15-surface-project-home` — forked from
  `stevevitali/spaf-5-prod-flip-onboarding` @ `2a7014e` (the requested chain tip).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 1 — What landed

### `GET /bff/app` — the §5.2 aggregate twin (`server.ts`, REQ-BFF-1/8/9, REQ-DAT-4/12)

- Returns the document's aggregate as **raw DTOs**: `{rows, voices, groupBy, balance,
  protocols, deletedRows, search?}` — `listProjects`, `listVoices`,
  `getProjectGrouping`, `getBillingBalance`, `searchProjects(?q)`,
  `listProtocolCards`, `listDeletedProjects(?deleted=1)` — the exact seam set the
  design/22 §2 `app.index` row names.
- Filtering (`?voice`/`?protocol`/`?sort`/`?archived`) and the row→view mapping run
  **client-side** off the shared `state-map.ts` seam (`toProjectRowView` /
  `groupByAttention` / `groupByVoice`) — one mapper, both renderers (design/22 F10;
  the twin ships no view models). Only `?q=` (server-side `searchProjects`) and
  `?deleted=1` (the 30-day scope read) ride the wire — they are the non-derivable
  reads.
- Degrade semantics mirror the document: `listProjects` stays load-bearing (uncaught
  → `bffFail` → 502/`upstream_unavailable`; upstream 401 → `{error:"unauthenticated"}` 401);
  every optional seam rides `swallowDegraded` (a miss lands the SSR's composed
  default — `[]` voices/protocols/deletedRows, `"attention"` groupBy, `null`
  balance; a mid-session 401 rethrows into the unauthenticated envelope).
- The document's `?verified=1` mint + showcase/held/carried-file precedence remain
  **pre-shell server acts** — the fixed handler order (session → verified →
  precedence → flag consult → SSR) is unchanged; the twin never sees them
  (REQ-BFF-20, REQ-BND-11).

### JSON mutation branches (`wantsJson` + `mutationOutcome`, REQ-BFF-1/2/3)

- `POST /app/grouping` → `{ok:true, redirect:"/app"}` (grouping drops the live
  filters, as the form's 302 always did); form post still 302s.
- `POST /p/:slug/{archive,unarchive,delete}` → `{ok,redirect:"/app"}`; swallowed
  writes stay swallowed (the list refetch repaints truth).
- `POST /p/:slug/duplicate` → `{ok,redirect:"/p/<copy-slug>"}` — the copy's page,
  or the source slug on a swallowed write (the 302's wording verbatim).
- `POST /p/:slug/restore` → `{ok,redirect:"/app?deleted=1"}`; resolves against the
  **deleted** list only (an active slug answers `{error:"not_found"}` 404).
- Every branch: unauthed JSON → 401 `{error:"unauthenticated"}`, never a `/login`
  redirect; unknown slug → `{error:"not_found"}` 404 vs the form's not-found
  document. `POST /p/:slug/rename` is the editor surface's POST (`/app` emits no
  rename form — the menu's Rename is a `?rename=1` link); `/p/:slug/voice` and the
  `/app/new*` legs already carry their JSON branches (SPA.13/14).

### `spa/surfaces/project-home.tsx` (the §5.2 React twin)

- Ports `ProjectsPage` verbatim — same `<Shell>`/`<PageTitle>` chrome, same controls
  bar (New project suppressed on `compact`, §10.1), search form, Group-by POST
  form, Protocol/Sort GET filter form, Archived/Recently-deleted toggle links, the
  Voice chips, then attention-or-voice groups or the `?q=` search section, then the
  archived `<details>` and the deleted restore section. Every hook literal resolves
  to the manifest.
- The twin's raw DTOs are mapped + filtered + grouped in a `useMemo` through the
  same `state-map.ts` helpers the SSR composes — Needs-you deadline order survives
  `sort=title` because the flat-list sort precedes grouping (§5.2).
- Delegated `onSubmit` on the surface root: GET forms (`/app` search + filter bar)
  build the same `/app?…` URL the form would and `router.navigate` — the display
  filters never hit the BFF; `?q`/`?deleted` ride the twin's key and refetch. POST
  forms on `/app/*`/`/p/*` ride the JSON branch — fields are collected **before**
  `aria-busy` + disabled controls mark the in-flight form (REQ-UX-16), the
  envelope's `redirect` navigates in-router (an unflipped `/p/:slug` target takes
  `SsrHandoff`'s document nav itself), and settle invalidates `["bff"]` — the list
  repaints from the server, never optimistic mirroring. `/logout` is deliberately
  not intercepted — the session teardown stays a native document POST.
- `ProjectHomeSurface` is pure props (`twin`, `params`, `compact`) — the leaf owns
  the query, the surface owns the markup + delegation.

### The leaf (`spa/routes/_authenticated/app.index.tsx`)

- `validateSearch` covers the full live vocabulary (`q/voice/protocol/sort/
  archived/deleted` + the precedence params `verified/entry/held` — a shell-load
  URL can still carry them; the server consumed them before the consult).
- **flagParam fix:** the router's JSON-shaped parse turns `?deleted=1` into the
  NUMBER `1` — `oneParam("1")` was dropping every `=1` flag on this leaf. All four
  flag params now ride `flagParam` (normalizes `1 | "1"` → `"1"`), and the loader
  normalizes the same way so the warm key equals the leaf's `useQuery` key.
- Loader warms `projectHomeQuery({q, deleted})` **only** on the `"spa"` verdict —
  the unflipped path never spends a BFF read; component renders `SsrHandoff` for
  anything else. Non-401 failures throw into the route's designed error state
  (REQ-UX-6); a 401 document-navs `/login` inside `bffFetch`.

### DOM contract (REQ-VFY-2)

- `project-home` block gains the hooks the SSR always emitted and the SPA now makes
  load-bearing: `data-group-by`, `data-filter-form`, `data-archived-toggle`,
  `data-deleted-toggle`, `data-search-results`, `data-archived-section`, the row
  anatomy (`data-indicator`, `data-menu-action`, `data-disabled-reason`,
  `data-collapsed-marker`, `data-cue-when-closed`, `data-cue-when-open`,
  `data-group`), and the field names (`q`, `groupBy`, `voice`, `protocol`, `sort`,
  `archived`, `deleted`). 54 hooks — 54 emitted / 54 asserted.

### Journeys (renderer-agnostic by construction)

- `SURFACE_GATES["project-home"] = {R1, R7, T2.badge, T6, T7, P1.project, X1.home}`
  already matches the design/27 gate subset verbatim — re-spec audit: every gated
  step settles on `data-mounted`/`data-renderer` (`gotoOk`/`settleNav` wait for the
  mount marker), probes manifest hooks (`data-collapsed-group="quiet"`, text
  locators), and all legs are `paid:false`. No step edit needed — same outcome as
  SPA.14.

### Stage fact + gates

- `STAGES.dev.spaSurfaces` gains `"project-home"` (REQ-SEQ-9's dev line); preview
  stays `[]`, prod stays `["usage","inbox","settings","voices","onboarding"]` —
  SPAF.6 owns the prod flip.
- `check-protocol-markers.mjs` `SPA_WEB_SRC_ALLOW` += `state-map.` — the shared
  row-mapper is now in the SPA bundle graph (pure COPY + type-only imports; the
  guard caught it exactly as designed).

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | green (135 tasks; web lint/typecheck clean) |
| `pnpm test` (repo-wide) | **5,294 pass / 4 skip / 0 fail** — 478 files |
| `project-home.dom.test.tsx` | **17 legs** — mounted production router, all verdicts |
| `bff.test.ts` SPA.15 block | **16 legs** — twin legs + the six mutation branches |
| Retained SSR tests (`server.test.ts` P1.04 et al.) | green — `pages.tsx` untouched on this surface |
| `check:dom-contract` | OK — journeys ⊆ manifest ⊆ emitted+asserted (project-home 54/54) |
| `check:spa-budget` | OK |
| `check:licenses` | OK — 822 packages |
| `check:protocol-markers` | OK — 208 files, no leaks (allowlist += `state-map.`) |
| `check:no-cookies` | OK — 224 files |
| `check:spa-env` | OK — 92 client sources / 124 artifacts |
| `check-build-memory.sh` / `check-append-only.mjs` | clean at closeout |

Mid-run reds (all real, all fixed): `oneParam("1")` dropped the numeric-parsed
`=1` flags (→ `flagParam`); `bffFail`'s upstream-5xx→502 mapping pinned; the
copy-containment leaf scan rejected the `COPY.projectHome` namespace alias
(→ leaf refs); a stale `el()` from a double-mounted test split into two legs.

## 3 — Preview legs: BLOCKED, honestly deferred

`gcloud secrets versions access latest --secret=rhema-nonprod-resend-api-key
--project=rhema-507501` re-probed this run → `NOT_FOUND` (output redirected to a
temp file; the value was never printed — there is none to print). Without the
operator-seeded shared secret, `preview-stack.mjs resend-pull` cannot seed
`rhema:resendApiKey`, no signed-in preview session can mint, and `/app` is
session-gated — so legs A/B/C and the rollback drill stay owed:

- `D-SPA.15-1` — preview two-leg (A: `--pin-renderer ssr --expect-renderer ssr`;
  B: `rhema:spaSurfaces += project-home` + `--expect-renderer spa` on the
  `project-home` gate subset; C: `paid:false`), with verbatim recipes in-row.
- `D-SPA.15-2` — rollback drill (flag off → `data-renderer="ssr"` + the SSR DOM
  contract intact).
- `D-OPS.1-1` / `D-MAINT.6-1` / `D-SPA.6-1` stay OPEN — same operative blocker;
  nothing moved, no dated note appended (the probe evidence lands in the
  D-SPA.15 rows).
- Compensating deterministic legs cover the same contract:
  `project-home.dom.test.tsx` mounts the flipped/unflipped/compact verdicts
  (SsrHandoff + zero-BFF-read asserted), and `check:dom-contract` pins SSR⇄SPA
  vocabulary parity.

## 4 — AC disposition

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations for `project-home` — typed JSON, preserved statuses | **MET (deterministic)** — `GET /bff/app` raw-DTO aggregate + 6 POST branches (`grouping`, `archive`/`unarchive`/`delete`, `duplicate`, `restore`); 401/404/502 parity with the document's answers; bff.test block pins both modes |
| React surface emits the full dom-contract vocabulary — component tests + axe | **MET (deterministic)** — manifest parity test vs the SSR markup on the same fixture (≥15 emitted entries compared + value-bearing literals byte-checked); axe on the mounted surface; `data-spa-error` designed state; REQ-UX-16 in-flight leg |
| Retained SSR tests green — the fallback untouched | **MET** — `pages.tsx`/`ProjectsPage` unchanged; the whole P1.04 `server.test.ts` block green (5,294 total) |
| Journey legs re-spec'd + `SURFACE_GATES['project-home']`; preview two-leg A/B/C green | **PARTIAL** — gate verified against design/27 verbatim (`{R1,R7,T2.badge,T6,T7,P1.project,X1.home}`), renderer-agnostic + non-vacuous; preview legs **BLOCKED** (§3) → `D-SPA.15-1` OPEN |
| Rollback drill evidence on the preview | **BLOCKED** (§3) — recorded arm `D-SPA.15-2`; compensating deterministic legs mounted instead |
| Server precedence stays server-side ahead of the flag (REQ-BND-11) | **MET** — `?verified=1` mint + showcase/held-file/carried-file redirects run before `spaShellResponse(…, "project-home")`; handler order unchanged, twin never sees them |
| Dev stage-fact line; prod untouched | **MET** — `dev.spaSurfaces=[…,"project-home"]`; preview `[]` / prod `[…,"onboarding"]` pinned |
| REQ-VFY-9 disposition | **MET** — SSR HTML-string asserts stay as retained fallback coverage (the F8 class map keeps them while the document path lives); the SPA's render assert class moves to `project-home.dom.test.tsx` component legs; status/mutation legs live in `bff.test.ts` |
| Phase-gate AC | **MET** — deferred live legs ledgered (D-SPA.15-1/-2), append-only, requirement ids stamped in the PR |

## 5 — Deviations + notes

- **`flagParam` on the leaf (fix, not deviation):** the router parses `?x=1` to the
  number `1`; `oneParam("1")` silently dropped `archived`/`deleted`/`verified`/`held`
  so the leaf would have missed every flag param. `flagParam` (the SPA.12
  normalizer) is the canonical fix; the loader normalizes the same way so the
  `ensureQueryData` warm key equals the `useQuery` key.
- **Rename POST keeps its document grammar:** `/p/:slug/rename` is emitted only by
  the `/p/:slug` editor surface (the home menu's Rename is a `?rename=1` GET link).
  Its JSON branch lands with the editor surface ticket; this surface needs no
  rename POST.
- **`data-voice-group` section order:** `groupBy=voice` renders `VoiceGroupList`
  (Unfiled first, then alphabetical voices — the shared mapper's order, both
  renderers).
- **Size ~1.46k lines vs ~600 guide** — recorded per SPA.10–14 precedent (the
  surface file + the 17-leg dom test + the 16-leg BFF block + the server twins ARE
  the deliverable; `pages.tsx` gained zero lines).
- **`D-SPA.15-1`/`-2` are new deferral rows**; no other deferral state changed.

## 6 — Closeout addendum (post-PR)

- **PR:** #139 — `stevevitali/spa-15-surface-project-home` → base
  `stevevitali/spaf-5-prod-flip-onboarding`. Merge policy OPERATOR — not merged.
- **PR checks (read once at closeout, `gh pr checks 139 --watch=false`):**
  `typecheck / lint / unit` — **pending** (recorded; the local turbo 135/135 +
  5,294-test suite is the deterministic evidence; GD-MAINT.4-1's inherited-red
  waiver stands for the integration/privsep legs only — none appeared in the
  read).
- **Commits:** `14eee98` implementation + tests + DEFERRALS D-SPA.15-1/-2; the
  build-memory closeout rides this file's commit.
- **Memory:** `runs/SPA.15.md` (this file), `pr/SPA.15.md` (the PR body),
  BUILD_INDEX row 146, LEDGER advance (`lastCompleted: SPA.15`,
  `nextTicket: SPAF.6`, `chainTip → stevevitali/spa-15-surface-project-home`),
  PHASE LOG entry appended.
- **Deferrals opened:** `D-SPA.15-1` (preview two-leg A/B/C — verbatim recipe
  in-row), `D-SPA.15-2` (rollback-drill arm). None closed — the Resend blocker
  is unchanged (`D-MAINT.6-1` operative).
- **Spend:** $0 — `paid:false` legs only; no preview, no deploys, no prod
  mutations.
