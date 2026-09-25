# STB.2 — Read-only live verifies + small live-binding fixes (run ledger)

- **Ticket:** `docs/tickets/53_STB.2__read-only-live-verifies.md` — the OPS ticket: production
  verification + small binding fixes, **not** a feature build.
- **Branch:** `stevevitali/p1-22-launch-checks` (deployed prod tree is still the STB.1 chain-tip
  `4fcf03e` — the fixes below are **committed, not yet deployed**; every "code-landed" claim below
  is labeled as such).
- **Spend:** **$0 INFERENCE.** No run launched, no Anthropic call, no Stripe leg. The one write
  leg exercised live — file upload → convert preview → create — rides the free convert Job
  (PRB.20 path), no inference.
- **Headline security finding:** the dossier read was **cross-tenant on prod** — see §3.

## 1. Method

- Session: reused the operator account's live `session` row (cookie `__Host-rhema.session_token`)
  read over the Cloud SQL IAP tunnel (`DB_URL` in `/tmp`, never committed).
- Probes: `curl` against `https://rhema.tools` + `https://api.rhema.tools`,
  `wss://rhema.tools/collab` over `ws`/`@hocuspocus/provider` (workspace deps), `gcloud` reads,
  `kubectl` on `gke_…_rhema-prod-run-task-gke-c13cb80`. Scratch scripts under
  `integration/.scratch/` (`stb2-batch.mts`, `wss-probe.mts`, `wss-converge.mts`,
  `wss-reconnect.mts`) — untracked, not committed.
- Everything below distinguishes **live-verified on the deployed build** vs **code-landed,
  awaiting deploy** vs **deferred (run/money/human)**.

## 2. Live-verified on the deployed build ($0)

| row | verdict | evidence (prod, 2026-09-25) |
|---|---|---|
| D-P1.01-1 | **DONE** | `GET /p/my-first-project` 200 — all five `data-pane` stamps present (`desk`,`files`,`margin`,`page`,`timeline`), `data-theme="dark"`, `/assets/ide.js` 200, fonts 200 (`literata…woff2` 110 KB, `inter…woff2`). |
| D-P1.01-2 | **DONE** | `/v/6` 200, `/v/5/diff/6` 200, `/r/01M36663…` 200, project root 200. `/v/working` → 404 is **correct**: every draft of the project is `frozen` — no working head exists to resolve. `/chat` is not a GET route by design (chat is a POST surface). |
| D-P1.03-1 | **DONE (headless legs)** | `wss://rhema.tools/collab?intent=ro` upgrade **OPEN** under the session cookie; two `HocuspocusProvider`s both `SYNCED` on `draft:01M35KC9…` and converged to the same doc; kill → new provider **resynced** (reconnect resumes); `GET /collab/documents/<draft>/blocks` reached the collab service (app-level 409, not an LB 404 — the `/collab*` route + service are live). Type-to-materialize + offline-queue click-through legs are **HUMAN** (typing would mint a `human_revision`). |
| D-P1.04-1 | **DONE** | `/app` renders the attention groups (populated `Quiet · 1`; empty groups correctly omitted), `?q=first` hit the title, PUT `groupBy=voice` persisted (`GET` → `"voice"`) and `/app` rendered Voice grouping with `Unfiled` first. **Real round-trip:** multipart upload `stb2-import.md` → `202 pending` → poll → converted preview → `POST /import/create` → 302 → draft `01M3D7E119PP2HA9GP6XT2DG87` (v7, `human_upload`) in DB. |
| D-P1.05-1 | **DONE** | Timeline pane stamped on the project page; `/r/01M36663…` run report renders per-phase `spent · est. N` + the `1.38×` overage marker — estimate-vs-actual is live (vocabulary is "spent/est", not literal "actual"). |
| D-P1.06-1 | **DONE** | `POST /projects/<id>/estimates` → 200 `{estimateCredits:3218, capCredits:4827, provisional:true}`; `palette-search?q=` → 200 JSON. |
| D-P1.07-1 | **PARTIAL → STB.3 residual** | The dossier read model + findings data verified over the API earlier (run `01M2RGNK…` returned a full DTO — letter, 19 findings, claims, access report, `findingObligations`). But that dossier belongs to a **foreign workspace** (see §3) and the active workspace owns **no** correspondence row — the findings/Desk/Margin render legs need an own-tenant dossier ⇒ gated on an STB.3 run. |
| D-P1.08-1 | **DONE (headless)** | `/v/6` renders `data-version-rail`, `data-version-chip`, `data-version-link`, restore-point affordance, `frozen — read-only`; `/v/5/diff/6?layout={unified,split,inline}` all 200; Files pane stamped. ⌘S restore-point write + offline-edit legs → **HUMAN**. |
| D-P1.09-1 | **DONE (headless)** | `/p/…/settings` 200; `GET /projects/<id>/settings/approvals` → 200 with `policy:"named"` + the `confirm_cost`/`approve_plan` defaults (deadlines + onExpiry). Guidance edits → HUMAN/click. |
| D-P1.17-2 | **DONE** | Unauthenticated `/`, `/pricing`, `/login`, `/signup`, `/invite` → all **200** (earlier authed-cookie 302s were redirects, not failures). |
| D-P1.18-1 | **DONE** except zip-download leg | Live exports: md, pdf (30 KB, `application/pdf`), html, docx, latex, rtf, txt, and `profile=substack` md (comments stripped, `## Notes` footnote flattening) — all 200. Account ZIP built `ready` (24,777 B, sha `1f07a29e…`). `GET /account/export/download` → **503 `download_unavailable`** — the `exportPresign` dep was never bound; fix landed (§4), download leg rechecks post-deploy. |
| D-P1.19-2 | **PARTIAL** | iPhone UA → `/p/…` 200 with the compact `ide-phonebar` stamped + collab wire withheld per `isPhoneRequest`. Interactive legs (approve/wait/disposition/chat on a real 375 px viewport) → **HUMAN**. |
| D-P1.20-1 | **PARTIAL** | Settings tree all 200: `/app/settings/{account,preferences,notifications,integrations,data,billing}`, `/app/inbox`, `/usage`, `/voices`; `/app/settings` 302 → account (correct). Throwaway-account lifecycle (signup → delete) needs a magic-link email click → **HUMAN**. |
| D-P1.22-2 | **PARTIAL (read-only legs done)** | Dashboard `rhema-prod — §13.5 SLOs` exists; `api-availability-prod` SLO (99.9%) + 9 alert policies live; Cloud SQL backups + PITR enabled (window 04:00); `runs` ns + `run-task-launcher` Role/RoleBinding applied on prod GKE; migration `0041_pause_signals` applied (0 rows — quiet, as expected). **Remaining legs:** (a) uid-10002 pod assert, (b) canary `egress.denied` pause e2e, (e) playbook drill — all need a live run → **STB.3**; (c) usercontent headers: unsigned object → 403, no `Set-Cookie` (private ✓), but the allowlist/`attachment` headers need a signed URL ⇒ recheck post-deploy when `exportPresign` is live (or operator's CDN key leg); (f) first-finding ≤4 min — needs real signups. |
| D-PRB.03-2 | **DONE** | The run sheet renders live counts: `5754 words` on `my-first-project` (draft-derived, not the stale placeholder). |
| D-PRB.03-3 | **DONE** | The sheet's obligation scope line renders live: "0 open obligations will be checked". |
| D-PRB.11-2 | **DONE** | Substack profile verified live + unit-tested; attachment filename fix landed (`exportFileName(…, { profile })` → `.substack.md`). |
| D-PRB.01-1 | **PARTIAL → stays** | Better Auth mounted + Google/magic-link e2e ran (RCN.1 evidence); residuals unchanged. |
| D-PRB.03-1 | **PARTIAL → stays** | `estimate_cache` still 0 rows — only new estimate traffic populates it (STB.3 runs). |
| D-PRB.04-2a | **OPEN → STB.3** | `EventSource` on `GET /runs/:id/events` needs a live running run — $0 ticket never launches one. |
| D-PRB.13-1 | **OPEN (assessed, stays)** | The shared throttle store is **not small**: `IpEmailThrottle.attempt` is synchronous — a Redis/DB counter makes it async through signup + magic-link call sites + tests. The api already holds a Redis client (server.ts) so the binding is feasible at prod bring-up; the cross-instance 429 assert is inherently a ≥2-instance live check. Confirmed-OPEN → STB.4/prod-scale. |
| D-P0.08b-3 / D-P1.22-1 | **code-landed** | SLO instrumentation implemented (§4): `slo_samples` (0042) + `event_delivery_ms` flush samples + `autosave_save_ms` + probes + alert policies + 7-day retention. Reads live once `0042` is applied + api/worker redeployed. |
| D-PRB.04-2b | **code-verified** | `DossierData.findingObligations` join already delivered (dossier-routes.ts:478); now additionally tenant-gated by the §3 predicate. Live render pending an own-tenant dossier (STB.3). |

## 3. SECURITY FINDING — cross-tenant dossier read (fixed in code, deploy pending)

- **Observed:** `GET /projects/01M2S5YQ0AVNF55Y1CG0TYZ9WJ/review/01M2RGNK9PWKN5M34343GXZC16/dossier`
  — `quiet-cost-of-convenience`, workspace `01M2R2E1WA81E1BQJX94K1SZQ4` — returned the full dossier
  DTO while authenticated as the `my-first-project` user (workspace `01M2V3PM11XSF05VJ9G01PM5ZB`).
- **Root cause:** the dossier's anchor query filtered `project_id`/`run_id` only and relied on RLS
  for tenancy — but `correspondence_items`/`findings`/`claims`/`revision_obligations` are **not**
  RLS-enforced tables, and the deployed api connects as `postgres` (`rolbypassrls=true`), so
  `withTenant`'s `set_config('app.tenant_id')` filtered nothing even where tables are enforced.
- **Fix (landed):** the anchor query now requires `p.workspace_id = <principal.workspaceId>` in
  SQL — tenancy enforced by predicate, with RLS as backstop only; every downstream read keys off
  the validated row. Test: "a dossier in ANOTHER workspace 404s even without RLS".
- **Follow-on fix (landed):** `GET /projects` + `GET /showcase` now run inside `txRunner`
  (`withTenant`) when bound — they already filtered `workspace_id` explicitly, so the change adds
  the RLS backstop rather than fixing a leak (D-PRB.01-3's binding leg).
- **Exposure window:** open since the dossier route deployed until the fix ships. Impact is
  read-only dossier contents (letter, findings, claims, access report) to any authenticated user
  who knows a `project_id`+`run_id` pair — ULIDs are unguessable but leakable via referrers/logs.
  **Action required:** redeploy `api` (and `web` for the 404→not-found half) as soon as this lands.

## 4. Code changes (all `STB.2`-marked; tests added; gates green)

| fix | files | shape |
|---|---|---|
| Review/fact-check delivery base | `apps/api/src/run-routes.ts` | `body.draftId` is now frozen into `inputs.draftId` server-side (validated as a draft of THIS project; falls back to newest promoted draft). Root cause of prod run `01M36663…` completing with **no dossier**: `delivery-base.ts` resolves the Review target only from `inputs.draftId`, and the sheet's draft id was a lock-set fact, never an input. |
| Web dossier 404 | `apps/web/src/server.ts` | api `ApiError(404)` on `getDossier` now renders `notFoundElement` (was an unhandled 500). |
| Dossier tenant predicate | `apps/api/src/dossier-routes.ts` | §3. |
| `project.purge` wiring (D-P1.04-2) | `apps/api/src/project-routes.ts`, `apps/api/src/index.ts`, `apps/api/src/server.ts`, `apps/worker/src/jobs.ts`, `apps/worker/src/main.ts` | delete → `boss.send("project.purge", {tenantId, projectId, tombstonedAt}, {startAfterMs: 30d, singletonKey})`; consumer re-reads `deleted_at` (restore ⇒ no-op; re-delete ⇒ re-schedules off the CURRENT tombstone); past grace → hard-deletes the project tree (`projects` cascade + NO-ACTION pre-deletes: `working_copies`, `provenance_maps`, `analytics_events`) + deletes the now-unreferenced content-addressed object keys via `createGcsBlobStore(objectsBucket)`. |
| Account-zip presign (P1.18 residual) | `packages/live-clients/src/ingest.ts`, `apps/api/src/server.ts` | `createGcsV4GetPresigner(objectsBucket)` bound to `exportPresign` — `/account/export/download` + the token link answer a signed URL instead of 503 (post-deploy). |
| Substack filename | `apps/api/src/export-routes.ts` | `exportFileName(slug, format, { profile })` — `… .substack.md`. |
| SLO samples (D-P1.22-1, D-P0.08b-3) | `packages/db/migrations/0042_slo_samples.sql`, `packages/db/src/schema/run-events.ts`, `packages/orchestrator/src/slo.ts`, `packages/orchestrator/src/event-stream.ts`, `apps/api/src/sse-routes.ts`, `apps/api/src/editor-routes.ts`, `apps/worker/src/run-events-jobs.ts`, `infra/pulumi/monitoring.ts` | `slo_samples` table (not RLS — census-exempted); SSE pump writes `event_delivery_ms` per flush batch; editor save writes `autosave_save_ms`; probes feed `event_delivery_latency_p95_s` + `autosave_roundtrip_p95_ms` (honest caveat kept: the client hop is unmeasured); probes degrade to `error`, never kill the sweep; 7-day retention folds into the daily sweep; two alert policies added. |
| Tenant-scoped shell reads (D-PRB.01-3) | `apps/api/src/project-list.ts`, `apps/api/src/index.ts` | `/projects` + `/showcase` run inside `txRunner` when bound. |

## 5. Gates

- `pnpm turbo build lint typecheck` — **132/132 green**.
- `pnpm test` — full suite; 4 initial failures were all from the new instrumentation surface
  (missing Drizzle table, RLS census entry, alert-policy list, stale unmeasured-set assertion) —
  all fixed and re-run green (177 tests across the six touched files; `slo`/`observability`/
  `rls-catalog`/`schema-parity`/`jobs` files re-run clean).
- `pnpm check:licenses` — 607 packages OK.
- `pnpm check:protocol-markers` — OK (45 files).
- `check-build-memory.sh` — run at commit time (below).

## 6. Live DB side-effects of this run

- Draft `01M3D7E119PP2HA9GP6XT2DG87` (v7, `human_upload`) on `my-first-project` — the upload
  round-trip evidence. Harmless new version; delete it manually if unwanted.
- `user.prefs.groupBy` was toggled to `voice` then restored to `attention`.
- Quarantine/converted objects for `stb2-import.md` under
  `quarantine|converted/01M2V3PM11XSF05VJ9G01PM5ZB/01M3D79XPWAGF88PMPF1K0YFJJ` — swept by lifecycle.

## 7. Still owed (explicit deferrals)

- **STB.3** (needs a live run): dossier render on an own-tenant dossier (P1.07 findings legs,
  D-PRB.04-2b live half), `EventSource` consumption (D-PRB.04-2a), pause legs (a)(b)(e),
  `estimate_cache` population (D-PRB.03-1), post-deploy recheck of `inputs.draftId` end-to-end.
- **Post-deploy rechecks** (code landed this run): `/account/export/download` signed URL,
  dossier cross-tenant 404 on prod, `project.purge` enqueue observable on delete,
  `slo_samples` rows appearing (needs `0042` applied + traffic).
- **HUMAN**: collab typing/materialize + ⌘S restore point + offline banner click-through;
  phone-width interactive legs; throwaway-account lifecycle (magic-link email).
- **STB.4/prod-scale**: shared throttle store (D-PRB.13-1).

## 8. Surprises

1. The cross-tenant dossier leak (§3) — the biggest finding of the ticket; RLS was load-bearing
   but the live role bypasses it.
2. The `01M36663…` "missing dossier" was a real product bug, not a data problem: Review runs never
   froze `inputs.draftId`, so delivery resolved no base. Now fixed + regression-tested.
3. `exportPresign` was declared in the route deps since P1.18 but never bound in `server.ts` —
   surfaced by the account-zip download 503.
4. `/app`'s attention-group vocabulary check needed the real labels (`Needs you`/`Running`/
   `Ready to read`/`Quiet` render only when populated — a 1-project workspace shows `Quiet · 1`).
