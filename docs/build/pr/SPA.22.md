# SPA.22 — surface: `run-report` (`/p/:p/r/:runId`)

Manifest row 131 · stacks on `stevevitali/spaf-12-prod-flip-dossier` @ `870f085` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/131_SPA.22__surface-run-report.md` per `docs/design/22_spa-bff-api-shape.md`
(`run-report` endpoint table), `docs/design/29` §route-map, `docs/design/27` (the REQ-VFY-10
owed delivered-render leg), and `docs/frontend-spa-spec.md` §11. **The thirteenth dev
surface** of the strangler migration — the run report: estimate-vs-metered reconciliation,
phase bars, claims, seat split, spend drivers, flags, suggested guidance, the
`?advanced=1` Level-4 usage rows, the §14.4 refund arms, and **the SSE live meter ported
as a live binding** (the ticket's explicit constraint — the run progress + spend ticker
stays on the existing same-origin event stream, never JSON polling). `run-report` is
**IDE-framed** — `/p/$project/r/$runId` resolves `run-report ∧ ide-chrome` at the server's
key-level AND. Dev flips on this commit; **prod is untouched — SPAF.13 owns that row**
(REQ-SEQ-10).

## Requirement IDs

REQ-SEQ-9 · REQ-VFY-8 · REQ-VFY-9 · REQ-VFY-10 (debt) · REQ-BFF-12/16 · REQ-DAT-13 ·
REQ-UX-3/4/5/10/13/14/15/16

## What lands

### Server (`apps/web/src/server.ts`)

- `liveFeedSlice(session, runId)` — replayed feed rows + `lastSeq` + the same-origin
  `eventsUrl`, best-effort (a degraded events read → no slice, never a failed twin).
- `runReportComposition` — the ONE composition both renderers share: `?advanced=1` →
  `getRunReport(session, runId, {advanced})`, Timeline read best-effort, Inbox run row
  marked read best-effort, missing report → the 404 arm.
- `GET /bff/p/:slug/r/:runId` — `bffRoute` + `bffProjectRow` (tenant-owned slug→row) →
  `{runReport:{slug,runId,report}, project, paperTheme, appTheme?, ide}` with `ide.feed`
  carrying the live slice (`density:"details"`); 401 / `{error:not_found}` 404 parity.
- **JSON mutations** (`wantsJson` + envelope) on every write the route owns — the refund
  POST (`{ok,redirect}` to `#report`) and the steering POSTs (pause/resume/cancel/steer →
  `{ok,redirect}`). JSON callers: 401 envelope, never a `/login` redirect; 404
  `{error:not_found}`; refusal statuses (400/403/404/409) preserved verbatim via `bffFail`.
  Form callers keep byte-identical 302s on either renderer.

### SPA (`apps/web/src/spa/**`)

- `queries.ts` — `BffRunReportTwin` + `runReportQuery`; only the server-owned keys
  (`advanced`, `focus`) forward, normalized into the query key.
- `routes/_authenticated/p.$project.r.$runId.tsx` — validated search, `isSpaEnabled`
  consult, twin warm on "spa" only, twin-404 → `notFound()`, `PendingShell`/`SurfaceShell`,
  `SsrHandoff` on any other verdict (zero BFF reads).
- `surfaces/run-report.tsx` — the shared `@rhema/ui` `RunReport` verbatim + the Advanced
  `<details>` + all four refund arms (eligible form → `bffFetch` → `{ok,redirect}` router
  nav; refused → invalidate/refetch, no invented notice; refunded/pending_review/denied
  status lines) + the frozen rate-table link. `useDwell`, `useShellChrome` + the shared
  Timeline gate card, phone-only chat at phone width, REQ-UX-16 serialize-before-disable.
- **Live meter as a live binding:** `ide.feed` → `useIdeFeed` → exactly one `EventSource`
  resuming at `?after=<lastSeq>`; `usage.tick` patches progress/spend in place; non-tick
  events converge one debounced BFF reread — ticks never storm refetches; reconnect/backoff
  stays the existing implementation's.

### Journeys + seed

- `seedDeliveredRunReport` (`@rhema/db`) — the delivered fixture on `showcase=false`:
  ledger grant+debit net-0 (3860/3860), `step:<phase>`-keyed `usage_records` totalling
  **4110 metered vs 3860 charged** — exercises reconciliation, seat split, flags, drivers,
  Advanced rows. Slug-idempotent (`jrn-<tag>-report`), deterministic, $0.
- `R6F` — the owed REQ-VFY-10 delivered-render leg (`expected:"red"`, `paid:false`):
  provisions via `JOURNEY_DATABASE_URL` (absent ⇒ `owed`, never fabricated), asserts the
  report vocabulary under both renderers.
- `SURFACE_GATES["run-report"] = {R6F}` + owed notes; `weeklyHolds: ["R6","R9"]` keep the
  paid live-meter/refund legs out of the $0 gate.

### Stage facts

`STAGES.dev.spaSurfaces += "run-report"`; `preview` stays `[]`; **prod untouched** —
`["usage","inbox","settings","voices","onboarding","project-home","billing","export",
"ide-chrome","outline","figures","run-sheet","dossier"]`, SPAF.13 owns the flip.

## Verification

- `pnpm turbo build lint typecheck` — **135/135** tasks.
- `pnpm test` — **5,558 pass / 6 skip / 0 fail** (484 files).
- `run-report.dom.test.tsx` — **15** legs (mount vocabulary, pending shell, refund
  eligible/refused/refunded/pending/denied, SsrHandoff, SSR/SPA parity, axe subset, live
  feed: one EventSource at `?after=<lastSeq>`, tick patches meter, non-tick → one reread).
- `server.test.ts` — **116** incl. +9 SPA.22 legs (twin verbatim, `?advanced`, feed slice,
  degraded-feed arm, 401/404, refund/steer envelopes, refusal statuses, form parity).
- `check:dom-contract` — run-report **26/26** emitted + asserted.
- `stages.test.ts` · `showcase.test.ts` · `registry.test.ts` · `surface-gates.test.ts` ·
  `cli-flags.test.ts` — all green (R6F + gate + the reworked empty-gate refusal leg).
- `check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-budget` ·
  `check:spa-env` — all clean.
- REQ-VFY-9 disposition: SSR HTML-string asserts stay as retained fallback coverage
  (`server.test.ts`); SPA render asserts in `run-report.dom.test.tsx`; status/mutation
  legs in `server.test.ts` + R6F.

## Deferred (honest — `docs/tickets/DEFERRALS.md`)

- `D-SPA.22-1` — preview two-leg + leg-C on `pr-<n>`: **`rhema-nonprod-resend-api-key`
  re-probed NOT_FOUND this run** (`gcloud … versions access` → NOT_FOUND; only
  `rhema-prod-resend-api-key` exists) — no signed-in preview session is mintable; same
  prerequisite stack as D-MAINT.6-1 / D-SPA.6-1 / … / D-SPA.21-1.
- `D-SPA.22-2` — the preview rollback drill (flag off → SSR serves the same DOM contract)
  rides the same preview.
- `D-OPS.1-1`, `D-SPA.6-1`, `D-MAINT.6-1` blocker-updated, stay OPEN. Nothing closed.

## Rollback

Flag off → the document path SSR already serves (`SsrHandoff` document-navigates unflipped
verdicts; asserted). The PR is additive-only on the render side; `git revert` of the
stage-fact line re-dormants the leaf on dev.
