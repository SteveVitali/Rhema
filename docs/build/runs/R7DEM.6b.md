# R7DEM.6b — anonymous demo metrics carve-out + reused-surface analytics suppression

- **Ticket:** `docs/tickets/223_R7DEM.6b__demo-metrics-carve-out.md` (row 223, round 7 / R7a)
- **Branch:** `stevevitali/r7dem-6b-metrics` (forked off `stevevitali/r7dem-6a-tour` @ `17f41bac`)
- **Base:** `stevevitali/r7dem-6a-tour`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec (loaded from `~/agent-skills`; self-review + build-memory siblings)
- **Spend:** $0 — Stage A only (GD-PREVIEW.R7: no per-ticket preview; D-R7DEM.6b-1 carries Stage B → 224)
- **Started:** 2026-11-04T17:46:09Z (`date -u`)
- **Closed:** run record + boundary read complete

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start. **D-R5OPS.1-1** (first-finding ≤4-min
organic-cohort query reads `finding.viewed` after `signup.completed`) is the row this ticket's
suppression work *interacts with* — the demo's contamination path is removed here, but the row
stays OPEN (the organic-cohort measurement is still owed; ticket Notes). No OPEN row becomes
verifiable by this ticket. New row owed: **D-R7DEM.6b-1** (Stage-B deployed-migration + insert
proof at the R7a phase preview).

## Requirements

REQ-TOUR-9 (the one sanctioned demo write), REQ-DOPS-5 (catalogue-driven suppression),
contributes REQ-DACC-3 (the single permitted non-GET). Invariants: §8.1 (sole sanctioned write),
§8.6 (ADR-126 append-only note), manifest 10/13/16/17, gotchas 2–3.

## Acceptance criteria

(Per ticket — engineered layer unless noted.)

1. `check-additive-migrations --files …0061_demo_events.sql` exits 0 on the committed file; a
   test feeds the linter a `GRANT rhema_demo_writer TO rhema_app` variant → `role_change`.
2. PGlite: as `rhema_app_login`, select/insert/update/delete on `demo_events` denied;
   `rhema_demo_event_insert` inserts one row for a valid event; out-of-enum/oversize rejected;
   function owner `rhema_demo_writer`, `prosecdef` true.
3. RLS census pins `demo_events` as NON_TENANT system store, `USER_ROLE_GRANTS` `-`;
   `system-pool-boundary.json` untouched.
4. `POST /a/demo` → `POST /analytics/demo` inserts exactly one row; oversize/out-of-enum/
   malformed → 204 no row; token bucket drops bursts.
5. No `Set-Cookie` on either route (signed in/out); no IP/UA read; no PII column; cookie +
   authorization stripped before the api.
6. Catalogue-driven suppression test: every `CLIENT_ANALYTICS_EVENTS` name emits zero in demo
   mode on every channel; a planted unsuppressed emitter fails it.
7. Emission-audit green with the three `demo.*` classified; recording proxy green with
   `POST /a/demo` the only non-GET; extended `D3.readonly` passes locally.
   *(fixture-verified)*
8. `D-R7DEM.6b-1` open with the 224 capture list. *(staging-verified, owed to 224 —
   met-engineered(D-R7DEM.6b-1))*
9. Universal phase-gate AC (verification green, tests, req ids stamped, records appended).

## Plan

- **Migration `0061_demo_events.sql`** (next free number): append-only `demo_events
  (id text pk default 'dem_' || replace(gen_random_uuid()::text,'-',''), at timestamptz
  default now(), event check 3-enum, essay/step/src bounded)`, NOLOGIN `rhema_demo_writer`
  (idempotent `do $$`), `GRANT INSERT` only, `SECURITY DEFINER` `rhema_demo_event_insert`
  (one schema-qualified INSERT, `set search_path=''`), `ALTER FUNCTION … OWNER TO
  rhema_demo_writer`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO rhema_app`. Every
  GRANT/REVOKE carries `ON` → the role-change lint cannot fire.
- **Census:** NON_TENANT += `demo_events`; USER_ROLE_GRANTS `-`; new
  `packages/security-checks/src/demo-events.test.ts` for the PGlite legs + lint-variant leg +
  no-PII-column leg.
- **Api:** `POST /analytics/demo` in analytics-routes.ts (deps.db, the `/analytics/landing`
  pre-auth precedent): ≤256 B body, allowlist 3 events + bounded fields, `select
  public.rhema_demo_event_insert($1,$2,$3,$4)`, always 204, never reads headers.
- **Web:** `POST /a/demo` outside the demo guard; ≤256 B text; per-instance token bucket
  (60/min shared — never keyed on identity); forwards via a `recordDemoEvent` DataSource seam
  (api-client `POST /analytics/demo`, no session headers ⇒ cookie/authorization never leave).
- **Client:** `apps/web/src/spa/demo-beacon.ts` `emitDemoEvent` (sendBeacon only, demo boot
  armed); hub inline script emits `demo.hub_viewed`; `demo-effects.tsx` wires the tour's
  `onStart`/`onCompleteOrCta` to `demo.tour_started`/`demo.tour_completed_or_cta`; `src` from
  `?src=`; D-legs navigate `?src=jrn`.
- **Catalogue:** 3 events into `ANALYTICS_EVENTS` (payload-only schema — anonymous envelope,
  decision recorded in ADR-126 note); `emission-audit.ts` classifies them `emitted` →
  `apps/web/src/spa/demo-beacon.ts`.
- **Suppression contract (REQ-DOPS-5):** catalogue-driven test — per-name channel registry
  (client beacon files must contain `isDemo(`; server `emit()` paths ride `demoDataSource`'s
  `postAnalyticsEvent` no-op / `postAcquisitionEvent` DemoUnsupported); planted unsuppressed
  emitter fails the static sweep.
- **D3.readonly:** `attachDemoRecord` records non-GET `postData`; the leg asserts every
  non-GET is `POST /a/demo` with a body matching the event shape. D-leg entries gain
  `?src=jrn`.
- **Records:** ADR-126 dated note; `D-R7DEM.6b-1`; run/pr/INDEX/LEDGER close.

## Test matrix

| AC | Test |
|---|---|
| 1 | `demo-events.test.ts` lint legs (real file clean; `GRANT … TO rhema_app` variant `role_change`) |
| 2 | `demo-events.test.ts` PGlite legs (role denials, definer insert, bad args, owner/prosecdef) |
| 3 | `rls-catalog.test.ts` pins; `system-pool-boundary.test.ts` unchanged |
| 4 | `analytics-routes.test.ts` (api) + `demo-metrics.test.ts` (web `/a/demo` → forwarded body) |
| 5 | same tests — Set-Cookie absence, header-read grep, column census |
| 6 | `demo-analytics.dom.test.tsx` suppression contract + static sweep |
| 7 | `emission-audit.test.ts`; `demo-side-effects.local.test.ts` + `demo-readonly.local.test.ts` |

## Progress

- setup: branch `stevevitali/r7dem-6b-metrics` @ `17f41bac` (base `stevevitali/r7dem-6a-tour`).
- implement: all 11 deliverables landed (migration + channel + relay + client emitters +
  catalogue/audit + suppression contract + D3 extension + records).

## Gap table

| Spec item | Required | Achieved | Status | Evidence |
|---|---|---|---|---|
| AC1 additive lint | engineered | engineered | met | `scripts/check-additive-migrations.test.mjs` (committed file clean; `GRANT … TO rhema_app` → role_change) + `check-additive-migrations --files` exit 0 |
| AC2 PGlite definer channel | engineered | engineered | met | `security-checks/src/demo-events.test.ts` (role denials; one-row insert; bad-arg rejects; prosecdef + owner) |
| AC3 census pins | engineered | engineered | met | `rls-catalog.test.ts` NON_TENANT + `-` |
| AC4 relay + bounded insert | engineered | engineered | met | `apps/web/src/demo-metrics.test.ts`; `apps/api/src/analytics-routes.test.ts` |
| AC5 no-cookie/no-PII | engineered | engineered | met | Set-Cookie asserts both arms; header-read grep; column census |
| AC6 catalogue-driven suppression | engineered | engineered | met | `demo-analytics.test.ts` + `demo-analytics.dom.test.tsx` (planted emitter fails) |
| AC7 audit + proxy + D3 | fixture-verified | fixture-verified | met | `emission-audit.test.ts`; local walks green; `demo-readonly.local.test.ts` (extended body) |
| AC8 deferral | engineered | staging | met-engineered(D-R7DEM.6b-1) | `docs/tickets/DEFERRALS.md` row |
| AC9 records | engineered | — | pending Phase 6 | this file + pr record + INDEX + LEDGER |

## Evidence log

- `node scripts/check-additive-migrations.mjs --files packages/db/migrations/0061_demo_events.sql` → 0 violations.
- vitest: security-checks demo-events + rls-catalog + parity 29; api analytics-routes green; web
  demo-metrics 4 + demo-analytics 4 + dom 3 + demo.test 36 etc 94; scripts additive test green.
- `pnpm turbo build lint typecheck` green; `check:dom-contract`/`no-cookies`/`spa-env`/`spa-budget` OK.
- `demo-readonly.local.test.ts` — extended D3.readonly body green (anon + returning, bodies shape-checked).
- `demo-side-effects.local.test.ts` — recording proxy green, `/a/demo` the only non-GET; side-effect
  table + walk JSONs + trace + screenshots regenerated (committed diffs).
- Skipped: `pnpm test` full sweep (CI legs cover it), preview/live legs (out of scope, $0).

## Evidence report

| Check | Result |
|---|---|
| `check-additive-migrations --files 0061_demo_events.sql` | PASS — 0 violations |
| `scripts/check-additive-migrations.test.mjs` | PASS (committed file clean; GRANT-membership variant → `role_change`; census updated) |
| `security-checks/src/demo-events.test.ts` | PASS — role denials, definer insert, bad-arg rejects, owner+prosecdef, no-PII census |
| `rls-catalog` + schema parity | PASS — `demo_events` NON_TENANT + `-`; Drizzle parity added |
| api `/analytics/demo` tests | PASS — valid→row; malformed/oversize/out-of-enum→204 no row; no Set-Cookie |
| web `/a/demo` tests | PASS — forward w/o session; bucket burst-drop; identity-read grep |
| suppression contract | PASS — catalogue-driven; DOM zero-emission both signed states; planted emitter fails |
| emission-audit | PASS — 3 `demo.*` classified `emitted` |
| `demo-readonly.local.test.ts` | PASS — extended D3 body green (anon+returning) |
| `demo-side-effects.local.test.ts` | PASS — `/a/demo` the only non-GET; table regenerated |
| build/lint/typecheck + check:* | PASS |
| `pnpm test` full sweep | SKIPPED — CI legs run it (focused vitest green) |
| preview/live legs | N/A — $0 Stage A (GD-PREVIEW.R7) |

**PR:** #258 (base `stevevitali/r7dem-6a-tour`, unmerged — mergePolicy OPERATOR).
**Commits:** `c69bf5d5` (implementation) + `c3f4826` (records) · boundary: `logs/ci-R7DEM.6b.json`.
**Deferrals:** opened D-R7DEM.6b-1 → 224; D-R5OPS.1-1 explicitly stays OPEN.

## Gap table

(pending Phase 4)

## Evidence log

(pending Phase 5)

## Evidence report

(pending Phase 6)
