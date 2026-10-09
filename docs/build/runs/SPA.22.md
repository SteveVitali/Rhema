# SPA.22 — run ledger: surface `run-report` (`/p/:p/r/:runId`)

- **Ticket:** `docs/tickets/131_SPA.22__surface-run-report.md` (manifest row 131)
- **Branch:** `stevevitali/spa-22-surface-run-report` — forked from
  `stevevitali/spaf-12-prod-flip-dossier` @ `870f085` (the requested chain tip).
- **PR:** `pr/SPA.22.md` is the committed body; the PR is opened at closeout and its checks
  are read once (result recorded in § PR checks read below).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND
gcloud secrets list --filter='name~resend' --project=rhema-507501
→ only rhema-prod-resend-api-key
```

The secret was never printed (there is no version to print); the shared non-prod Resend
key is still absent, so no signed-in preview session can mint through the magic-link +
mailbox leg — the run-report route is session-gated. The preview two-leg and rollback
drill are honestly deferred (`D-SPA.22-1`/`-2`), with the deterministic in-repo proof
standing in. Same live blocker as `D-MAINT.6-1` / `D-SPA.6-1` / `D-SPA.12-1` … `D-SPA.21-1`.

## 0b — Inherited chain debt

None closed this run. `D-OPS.1-1`, `D-SPA.6-1`, `D-MAINT.6-1` blocker-updated (the SPA.22
re-probe), all stay OPEN; `D-SPAF.1-*`…`D-SPAF.12-*` stay OPEN behind the operator
merge+deploy prerequisite.

## 1 — What landed

### Server (`server.ts`)

- `liveFeedSlice(session, runId)` — the shared feed bag both twins serve: replayed feed
  rows + `lastSeq` + the same-origin `eventsUrl` (`/p/:slug/r/:runId/events`), best-effort
  (a degraded events read → no slice, never a failed twin). The chrome's `useIdeFeed`
  turns it into exactly one `EventSource` resuming at `?after=<lastSeq>` —
  reconnect/backoff stays the existing implementation's, not re-invented.
- `runReportComposition(c, session, row, runId)` — the ONE composition the SSR document
  and the twin share: `?advanced=1` → `getRunReport(session, runId, {advanced})`, the
  Timeline read best-effort, the Inbox run row marked read best-effort; a missing report
  is the 404 arm (the live feed is deliberately OUTSIDE it — an SPA chrome binding).
- `GET /bff/p/:slug/r/:runId` — `bffRoute` + `bffProjectRow` (tenant-owned slug→row);
  `{runReport:{slug,runId,report}, project, paperTheme, appTheme?, ide}` with `ide.feed`
  carrying the slice (`density:"details"`); 401/`{error:not_found}` 404 parity.
- `wantsJson` dual-mode on every write the route owns: the refund POST
  (`POST /p/:p/r/:runId/refund` → `{ok,redirect}` to `#report` vs the form's 302) and the
  steering POSTs (pause/resume/cancel/steer → `{ok,redirect}` vs form 302s). JSON callers
  get 401 `{error:unauthenticated}` never a `/login` redirect, 404 `{error:not_found}` on
  tenant/run misses, and refusal statuses (400/403/404/409) preserved verbatim via
  `bffFail` — never collapsed to 500. Form legs are byte-identical (steer 302 → project,
  refund 302 → `#report`).

### SPA (`spa/`)

- `queries.ts` — `BffRunReportTwin` + `RunReportTwinSearch` (server-owned keys
  `advanced`/`focus` only, normalized into the query key) + `runReportQuery` on the
  established retry/`bffFetch` policy.
- `routes/_authenticated/p.$project.r.$runId.tsx` — validates `advanced`/`focus`,
  `isSpaEnabled` consult, twin warmed on the "spa" verdict only, twin-404 → `notFound()`,
  `PendingShell`/`SurfaceShell` while in flight, `SsrHandoff` on any other verdict.
- `surfaces/run-report.tsx` — `RunReportSurface` renders the shared `@rhema/ui`
  `RunReport` verbatim (estimate line, phase bars + statuses, worked-example banner,
  metered-vs-charged differences, claims, seat split, drivers, flags, suggested guidance,
  frozen rate-table link) + the `?advanced=1` `<details>` Level-4 usage rows + the refund
  arms (eligible form → `bffFetch` POST → `{ok,redirect}` router nav on `#report`;
  refunded/pending_review/denied status lines; expected refusals invalidate/refetch —
  no invented notice). `useDwell("run-report")`, `useShellChrome` + the shared Timeline
  gate card (exported from `dossier.tsx`), phone-only chat at the phone device class,
  REQ-UX-16 serialize-before-disable + `aria-busy`.
- The SSE live meter is a **live binding**, not polling: the twin's `ide.feed` →
  `useIdeFeed` → one `EventSource`; `usage.tick` patches progress/spend in place; non-tick
  events (`cost.final`, `step.*`) converge one debounced BFF reread — ticks never storm
  refetches.

### Journeys + seed (`@rhema/journeys`, `@rhema/db`)

- `seedDeliveredRunReport(db, deps)` — builds on the delivered-dossier fixture on a
  `showcase=false` project: one `credit_ledger` grant + one debit (both 3860 → net-0 for
  the balance invariants), `usage_records` keyed `step:<phase>` totalling **4110 metered
  vs 3860 charged** so the report's reconciliation, seat split, flags, drivers, and the
  Advanced rows all exercise. Slug-idempotent (`jrn-<tag>-report`), deterministic, $0.
- `R6F` (new `expected:"red"`, `paid:false` step) — the owed REQ-VFY-10 delivered-render
  leg: provisions via `JOURNEY_DATABASE_URL` (absent ⇒ reports `owed`, never fabricates),
  walks `/p/:slug/r/:runId?advanced=1` under both renderers asserting the report
  vocabulary, phases, live hooks, Advanced rows, flags, drivers, claims, rate table.
- `SURFACE_GATES["run-report"] = {R6F}` + owed notes (preview blocker + expected:red
  semantics); `weeklyHolds: ["R6","R9"]` keep the paid live-meter/refund legs out of the
  $0 gate (REQ-VFY-10).

### Stage facts

`STAGES.dev.spaSurfaces` `…,"dossier"]` → `…,"dossier","run-report"]`; preview `[]`,
prod pinned (`[…,"run-sheet","dossier"]` — **SPAF.13 owns the prod flip**).

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135** tasks |
| `pnpm test` (repo root) | **5,558 pass / 6 skip / 0 fail** (484 files, 2 skipped) |
| `run-report.dom.test.tsx` | **15/15** (vocab, pending shell, refund arms, handoff, parity, axe, live feed) |
| `check:dom-contract` | run-report **26/26** emitted + asserted |
| `server.test.ts` | 116 incl. +9 SPA.22 legs (twin + feed slice + 401/404 + every JSON/form arm) |
| `stages.test.ts` | green (dev +`run-report`, prod/preview pinned) |
| `showcase.test.ts` | green (delivered-run-report seed leg: idempotent, net-0 ledger, metered≠charged) |
| `registry.test.ts` + `surface-gates.test.ts` + `cli-flags.test.ts` | green (R6F + gate + the empty-gate refusal reworked) |
| `check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-budget` / `check:spa-env` | all clean |
| REQ-VFY-9 disposition | **MET** — SSR HTML-string asserts stay as retained fallback coverage (`server.test.ts` report legs); SPA render asserts live in `run-report.dom.test.tsx`; status/mutation legs in `server.test.ts` + the R6F journey step |

### Mid-run fixes (all real, all re-verified)

- `run-report.dom.test.tsx` fixture: `meteredCredits === spentCredits` suppressed the
  `data-metered-line`/differences arms — fixture diverged (the intended exercise); refused-
  refund leg reworked so the eligible form persists until submit; the multi-state refund
  assertion split into per-arm mounts (stale root across remounts).
- `check:dom-contract`: `data-worked-example` gained assertion coverage; a mistaken
  `u("report")` URL-param manifest entry removed — `#report` is a fragment/id, not a query
  param (the `data-run-report` root covers it; `location.hash` asserted instead).
- `copy-containment.test.ts` (2 legs): `const RP = COPY.report` aliased a non-leaf —
  rewritten to `COPY.report.*` leaf refs; `=> bffFetch<MutationReply>(…)` read as JSX text
  (`>` ident `<`) — block-body return, the `dossier.tsx` precedent.
- `cli-flags.test.ts`: its "still empty gate" example was `run-report` — the manifest's
  LAST vacuous row, now gated by R6F. No real `SpaSurface` key can reach the refusal arm
  anymore, so the leg now stubs `SURFACE_GATES["run-report"].steps = []` (restored in
  `finally`) to prove the belt still refuses; a positive `R6F` resolution leg added;
  `surface-gates.test.ts` guards future owed-only rows structurally.
- Lint: `let f` → `const f` in the dom test.
- Harness note: `paywall.test.ts` walks `packages/ui/src` relative to CWD — it is green
  under the canonical root `pnpm test`; a `--filter @rhema/web` CWD run reds it as an
  invocation artifact, not a regression.

## 3 — Deferrals

Opened `D-SPA.22-1` (preview two-leg + leg C on `pr-<n>` — the Resend prerequisite) and
`D-SPA.22-2` (rollback drill on the same preview). `D-OPS.1-1`, `D-SPA.6-1`,
`D-MAINT.6-1` blocker-updated. **None closed** — every upstream OPEN row still needs its
named operator prerequisite.

## 4 — AC disposition

| AC | Layer | Disposition |
|---|---|---|
| `/bff/*` twins + envelope mutations for `run-report` green | deterministic · engineered | **MET** — `server.test.ts` +9 legs: twin verbatim, feed slice, 401/404, refund + steering envelopes, refusal statuses, form parity |
| React surface emits the full dom-contract vocabulary + component tests + axe | deterministic · engineered | **MET** — 26/26 emitted+asserted; 15 dom legs incl. scoped axe + the live-feed binding |
| Retained SSR tests stay green | deterministic · engineered | **MET** — the SSR fallback is untouched (the composition is shared, additive-only) |
| Journey legs re-spec'd + `SURFACE_GATES['run-report']`; preview two-leg green on `pr-<n>` | deterministic · staging-verified | **PARTIAL** — R6F + gate landed (`expected:"red"` per policy); the preview leg is `D-SPA.22-1` (secret absent) |
| Rollback drill evidence on the preview | deterministic · staging-verified | **DEFERRED** — `D-SPA.22-2` (rides the same preview) |
| Dev stage-fact line lands; prod untouched | deterministic · engineered | **MET** — `stages.test.ts` pins both |
| Universal phase-gate AC | agentic | **MET** — verification green; requirement ids stamped; deferrals ledgered; no ADRs (no design deviations); BUILD_INDEX + LEDGER advanced; append-only honored |

## PR checks read

`gh pr checks 153` at closeout (2026-10-09T20:4xZ) → **"no checks reported on the
'stevevitali/spa-22-surface-run-report' branch"** — the same closeout read as #140-#152
recorded; no inherited-red classification needed this run.
