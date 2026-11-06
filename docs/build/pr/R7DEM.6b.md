# PR — R7DEM.6b: anonymous demo metrics carve-out + reused-surface analytics suppression

- **Branch:** `stevevitali/r7dem-6b-metrics` → base `stevevitali/r7dem-6a-tour`
- **Ticket:** `docs/tickets/223_R7DEM.6b__demo-metrics-carve-out.md` · run `docs/build/runs/R7DEM.6b.md`
- **Stage:** A only ($0) — no preview (GD-PREVIEW.R7); deployed-migration + deployed-insert proof carried by `D-R7DEM.6b-1` → 224.
- **mergePolicy:** OPERATOR — never merged by this run.

## What lands

1. **`demo_events` + the insert-only channel** (`packages/db/migrations/0061_demo_events.sql`):
   append-only anonymous table `(id, at, event, essay, step, src)` — no IP, IP-hash, user id,
   cookie or UA column of any kind. New `NOLOGIN` role `rhema_demo_writer` holds `GRANT INSERT`
   only; `SECURITY DEFINER` `public.rhema_demo_event_insert(text,text,integer,text)` owns the
   schema-qualified INSERT with `set search_path=''`; `REVOKE ALL … FROM PUBLIC` + `GRANT
   EXECUTE … TO rhema_app`. No role-membership grant anywhere — every GRANT/REVOKE carries
   `ON <object>` so `check-additive-migrations` exits 0 (the `GRANT rhema_demo_writer TO
   rhema_app` shape is the live `role_change` rule, pinned in the test).
2. **`POST /analytics/demo`** (api, pre-auth on the user-serving `deps.db` — the landing
   precedent): ≤256 B body, three-name allowlist + bounded fields, `select
   public.rhema_demo_event_insert($1,$2,$3,$4)`, always 204, never reads a header.
3. **`POST /a/demo`** (web, outside the demo guard): sendBeacon `text/plain` JSON ≤ 256 B;
   per-instance token bucket (60/min shared, in-memory, never keyed on identity); forwards via
   `recordDemoEvent` on the headerless api client — cookie/authorization can never reach the
   api; always 204, never `Set-Cookie`.
4. **Client emitters** (`spa/demo-beacon.ts`, demo-boot armed): the `/demo` hub emits
   `demo.hub_viewed` (inline CSP-nonced script); the tour's 222 lifecycle callbacks emit
   `demo.tour_started`/`demo.tour_completed_or_cta`; `src` from `?src=` (propagated through tour
   hops; D-legs navigate `?src=jrn`).
5. **Catalogue + audit:** the three `demo.*` names enter `ANALYTICS_EVENTS` (payload-only
   schema — anonymous envelope, never the user/workspace envelope; decision recorded on the
   ADR-126 dated note) and are classified `emitted` → `demo-beacon.ts`.
6. **REQ-DOPS-5 suppression contract** (`demo-analytics.test.ts` + `.dom.test.tsx`):
   catalogue-driven — every `CLIENT_ANALYTICS_EVENTS` name emits zero on every channel in demo
   mode, signed in and out (`isDemo()` beacon seam; `demoDataSource.postAnalyticsEvent` no-op;
   `postAcquisitionEvent` → `DemoUnsupported`); a planted unsuppressed emitter fails the sweep.
7. **`D3.readonly` extension:** `attachDemoRecord` route-intercepts `/a/demo` (sendBeacon
   bodies never surface on the request event); the leg asserts every non-GET is `POST /a/demo`
   AND every captured body matches the `{event, essay?, step?, src?}` shape. Recording proxy
   + local walk green; side-effect table/screenshots regenerated.
8. **Records:** ADR-126 dated addendum; `D-R7DEM.6b-1` opened (Cloud SQL `createrole_self_grant`
   OWNER-TO proof + deployed insert → 224). `D-R5OPS.1-1` stays OPEN — this ticket removes the
   contamination path, not the owed organic-cohort measurement.

## Verify (Stage A, offline, $0)

- `pnpm turbo build lint typecheck` green; `check:dom-contract`/`no-cookies`/`spa-env`/`spa-budget` OK.
- `node scripts/check-additive-migrations.mjs --files packages/db/migrations/0061_demo_events.sql` → 0.
- vitest: `demo-events.test.ts` PGlite legs; api + web route tests; suppression contract;
  `emission-audit.test.ts`; `demo-readonly.local.test.ts` (extended body green);
  `demo-side-effects.local.test.ts` (proxy green, `/a/demo` the only non-GET).
- Skipped: full `pnpm test` sweep (CI legs cover it); no preview/live legs ($0).
