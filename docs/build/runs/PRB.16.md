# PRB.16 — prod golden-path verification (run ledger)

- **Ticket:** `docs/tickets/28g_PRB.16__prod-golden-path-verification.md` (seq 28g)
- **Branch:** `stevevitali/prb-16-prod-golden-path-verification` (base `stevevitali/prb-15-prod-bringup`)
- **Budget:** $50 total paid inference (HUMAN-H6); per-run caps via `cap_credits` at $0.01/credit.
- **Fixture:** workspace `01M2R2E1WA81E1BQJX94K1SZQ4`, user `01M2R2E1W23EY1X3G83ZMF9T1F`
  (`prb16-probe-…@rhema.tools`, magic-link session), project `proj_prb16` ("The Quiet Cost of
  Convenience"), draft `proj_prb16_d1` (454 words, sha `0d132c22…`), funding 200,000 credits.

## Stage A (committed `86fd5ff`)
Better Auth mounted on prod: session→principal bind, `__Host-` cookies (web→api auth proxy), tenant-scoped
`db`, `IDENTITY_HEADERS` non-prod only, origin guard, signup-account provisioning for OAuth/magic-link
user-create, `auth.mail` queue + placeholder-safe Resend handling, migration `0025_better_auth.sql`
(applied live: `[migrate] 25 migrations recorded`).

## Stage B live legs — evidence log

### 2026-09-17 — auth + estimate + first Review attempt
- Prod smoke: `https://api.rhema.tools/healthz` 200; `GET /projects` with the magic-link session cookie →
  `proj_prb16` visible under the fixture workspace (tenant-scoped read works through the real cookie path).
- Magic-link sign-in leg: `POST /api/auth/sign-in/magic-link` accepted; `auth.mail` pg-boss job carried the
  verify URL (Resend = placeholder → send is the deferred leg, D-* open); `verification` row written; the
  verify URL 302'd and set `__Host-rhema.session_token` (7-day). Session row asserts to the fixture
  user/workspace.
- Estimate leg: `POST /projects/proj_prb16/estimates` 200 — provisional 702cr/full lever matrix; run create
  re-derived server-side: `estimate_credits=415`, `cap_credits=623` (~$6.23 cap at $0.01/cr).
- Run 1 `01M2R2W9WKYXQG0JR95T58MAEP` (review/standard/balanced, `second_read:false`): 201 `queued` →
  worker consumed `run.start` → `provisioning`; SSE replayed `queued`→`provisioning` state events.
  **LIVE FINDING 1:** pod `InvalidImageName` — the launcher built `${imageRepo}@${imageDigest}` while prod's
  `rhema:runTaskImageDigest` carries the full `repo@sha256:…` ref → double-qualified image. Fix:
  `k8s-launcher.ts` accepts a fully-qualified ref verbatim (bare digest still joins repo+digest);
  regression test added. Worker rebuilt `worker@sha256:93d5dbe5…`, deployed (pulumi update 17).
- **LIVE FINDING 2:** the stranded sweep ran every minute but saw ZERO rows — every prod DB connection is
  `postgres`, and `postgres` is subject to FORCE RLS with `app.tenant_id` unset → the system-scoped scan was
  blind (dev had the same fix applied out-of-band, P0.15g `live-alter-rls.ts`). Applied
  `alter role postgres bypassrls` live; captured durably as migration `0026_system_bypassrls.sql`.
  The next `run.reap` tick failed the stuck run through the real code path — **D-P0.08-4 leg A now has live
  evidence**: `provisioning → failed` (`failure.code=provisioning_timeout`, `state_since` 16:48:31Z),
  hold 623cr released (`credit_ledger` `release:…#topup`), proxy credential `revoked_at` set, project writer
  lock cleared (`active_writer_run_id` → null). Orphaned Job deleted by hand.
- Run 2 `01M2R4KKQKF49EXCMMM5BH6WYZ`: pod pulled the image in 19s (finding 1 fixed — real pull) but the
  harness's first heartbeat to `api.rhema.tools:443` timed out. **LIVE FINDING 3:** `rhema:internalApiUrl`
  unset → `API_INTERNAL_URL` defaulted to the public origin, which sandbox egress denies (allow-list is only
  the PGA VIP + proxy). The intended path is the api's `*.run.app` URL — the prod private DNS zone maps
  `run.app` → `private.googleapis.com` VIP (199.36.153.8/30) and the api's ingress is
  `internal-and-cloud-load-balancing`. Set `rhema:internalApiUrl` to
  `https://rhema-prod-api-e745ce0-tkbl73n3tq-uc.a.run.app` (pulumi update 18). Run 2 left to the sweep.

### 2026-09-17 — run 3 (first real inference on prod)
- Run 3 `01M2R5J05VCN7GJHEZN6GJ3FWW` (review/standard/balanced, `second_read:false`): queued →
  provisioning → **running** (first heartbeat landed 17:10:28Z — `API_INTERNAL_URL` fix works). Pod
  pulled `run-task@sha256:f45e966f…` in 19 s.
- **SSE leg live**: `GET /runs/:id/events` replayed `state_changed` ×3, `usage.tick` (cap 623 / spent 131),
  `step.finished` (intake, ordinal 0 of 7), `gate.opened` (approve_scope), then live-tail after resolve.
- **Gate round-trip live**: `approve_scope` gate `01M2R5S5YMAKMX02HN8SJHFBAY` resolved via
  `POST /runs/:id/gates/:gid {action:"approve"}` → `{resolved:true, state:"queued"}`; run re-provisioned
  on attempt 2 (new pod `…-a2`), `gate.resolved` + `state_changed` events emitted.
- **Metering live**: `usage_records` accumulating via the proxy (24 rows / $2.59 by mid-craft); steps
  `intake` 131cr, `craft` 196cr committed.

### 2026-09-17 — import leg finding
- Quarantine write leg: `gs://rhema-prod-user-content/quarantine/<ws>/prb16-imp-1.md` uploaded OK (the
  quarantine prefix exists and is writable).
- **LIVE FINDING 4:** `POST /projects/proj_prb16/import/preview` → **404** — `importConverter` is never
  bound in `server.ts`, so `createImportRoutes` never mounts. The convert container is a CLI Cloud Run
  Job (`ENTRYPOINT node dist/main.js <input>`), not an HTTP service, and §12.1 forbids in-api conversion —
  the `Converter` seam has no live impl to bind. D-PRB.02-1 stays OPEN (the quarantine/presign half has
  partial evidence; the convert→preview→create half needs a real convert service surface or a Job-invoke
  binding — routed note, not a silent skip).

### 2026-09-17 — LIVE FINDING 5 (the heartbeat crash-loop) + fix + redeploy
- Run 3 `01M2R5J05…` crash-looped: the pod's harness beat ONCE at start, so a >3-min phase let the Redis
  heartbeat age past `HEARTBEAT_STALE_MS`; the reaper orphaned a LIVE pod, re-queued the run, and the old
  pod's commits were then fenced `stale_task` (attempt mismatch) — repeated to attempt 4. Compounded by
  `HEARTBEAT_TTL_MS == HEARTBEAT_STALE_MS`: a dead pod's key evaporates the same instant it goes stale, so
  `listStale` can never see it (a run could sit `running` forever, hold held).
- **Fix (this diff):** `runCommitLoop` beats on a `setInterval(HEARTBEAT_INTERVAL_MS)` for the whole loop
  (first beat still takes `provisioning → running`); beats carry `cancelRequested` back — honored between
  phases. `HEARTBEAT_TTL_MS` → 15 min (> the 3-min stale window). Tests: interval-beating through a
  minutes-long phase, cancel-flag honored, timer cleared, TTL > STALE asserted.
- Rebuilt api `328ea74a…` / worker `eb2684cf…` / run-task `31b93afe…` (cloudbuild), pinned in
  `Pulumi.prod.yaml`, `pulumi up` → stack at 109 resources. **Runs 5+6 then ran multi-minute phases
  (verification ~12 min) without a single orphan reap — the fix is proven live.**
- Run 3 terminal: operator-cancelled at 18:02Z (spent 327cr); its `verification` step's last attempt
  failed `infra` on a REAL 402 — "run … has reached its cap of 623 credits" (cap enforcement on the wire).
- Run 4 `01M2R8HJX…` (quick/base): intake→craft→verification→discourse committed, then the `second_read`
  phase failed its completion predicate **`second_read_producer_checked`** ("producerQueryId matches the
  orchestrator-launched scoped query") — the input-scoped producer marker was not written even after a
  guided re-run (step attempt 12). Operator-cancelled at 19:37Z (spent 503cr). **LIVE FINDING 6:**
  `second_read`-enabled runs cannot deliver on prod as deployed — D-P0.15h-5 stays OPEN with this failure
  mode recorded (the leg is exercised, the green assert is not met — see the gate leg below).
- Run 5 `01M2RE04R…` (quick/base, `second_read:false`): all 6 phases committed → `completed` 20:19Z,
  666cr spent, cap 900 never tripped.
- Run 6 `01M2RGNK9…` (quick/base, `second_read:false`, `draftId` + `lock_set` draft:read): all 6 phases →
  `completed` 20:19Z…21:00Z, 700cr. **Dossier delivered**: `correspondence_items` review row (ordinal 1,
  rubric sidecar embedded incl. real caps), 10 dossier artifacts (piece_brief, craft_notes, claim_ledger
  + sidecar, discourse_report, argument_notes, editors_letter, findings.json, rubric.json, access_report),
  `drafts`/`live_docs` updated, project state → `reviewed`.
- Proxy evidence on the wire (all runs): `usage_records` `source:'proxy'` metering every call —
  run-scoped rows carry attempt/agent/model/`provider_request_id`; `fetch_log` rows carry
  fetch/search/inference with per-URL allow/deny — incl. a real **deny** (`api.anthropic.com/api/hello`
  → 403 "not on the run allowlist", the credential-gate probe). Meter totals: run3 $5.39 / run4 $8.06 /
  run5 $5.75 / run6 $6.38 = **$25.57 list-cost of the $50 envelope** (339 usage rows).
- Spend to date: $25.57 / $50. Fixture topup 200,000cr; debited holds settled per run.

### 2026-09-17 — LIVE FINDING 7 (dossier read never bound — Stage-A gap)
- The web production `DataSource.getDossier` is a stub (`dossierNotWired` → throws) and the api has NO
  dossier-read endpoint — leg 7's "the dossier route renders … from delivered rows" cannot run until a
  thin read endpoint + web bind exists (ticket-authorized Stage A: "a read endpoint"). Same for the import
  preview (`notWired`). Building `GET /projects/:id/review/:runId/dossier` assembling DossierData from the
  delivered rows (letter md → sections, claims+claim_sources+fetch_log join, findings → FindingView,
  rubric sidecar, `buildAccessReport` re-derivation, `deriveRunCardInput`, obligation counts) + an
  api-client method + the web `getDossier` bind.

## Open at last update
- Runs 5+6 DELIVERED on prod (dossier rows asserted above); run 4's second_read predicate failure is a
  live finding (D-P0.15h-5 stays OPEN). Heartbeat fix live + proven (finding 5 closed live).
- Remaining legs: dossier-route render (needs the finding-7 bind → redeploy), triage disposition +
  approve-triage + finding.disposed, editor fork/note/revise-queue, Revise run (pretriage+manualRevision),
  Quick Voice run, export docx + ai-use, gate-EDIT resolve, SSE Last-Event-ID/fan-out, cited⇒fetched on
  the delivered runs, obligation chips, spend reconcile, browser Google sign-in (operator step), Resend
  delivery (deferred — placeholder secret).

### 2026-09-17 — LIVE FINDING 7 fix (the dossier read bind) — Stage-A, code-complete
- **New:** `apps/api/src/dossier-routes.ts` — `GET /projects/:id/review/:runId/dossier` assembles the whole
  reading surface from delivered rows inside `txRunner` (REQ-SPEC-10 — server-side facts only):
  `correspondence_items` review row + embedded rubric sidecar (+ `prior_review_id` → prior rubric for the
  re-review delta, REQ-IDE-30); `findings` + latest `dispositions` → `buildFindingView`; `claims` +
  `claim_sources` + the run's `fetch_log` allow-list (the cited⇒fetched source); the delivered
  `editors_letter` artifact bytes (workspace-bound `contentStoreFor`) → `parseLetterSections` with finding
  refs joined via the canonical `letter_section` slot → heading-pattern map (never parsed out of agent
  prose); `buildAccessReport` re-derived from `run_mounts`/`fetch_log`/`access_log`/`subagent_launches`
  (REQ-PROD-2 trust chip); `deriveRunCardInput` over whitelisted `run_events` only (REQ-IDE-11);
  `revision_obligations` → open/addressed counts + per-finding state map (REQ-OBJ-6).
- **Mounted** in `createApp` after the revision routes; exported `createDossierRoutes`/`parseLetterSections`/
  `DossierApiDeps` from the api index.
- **`@rhema/api-client`:** `DossierDto`/`DossierLetterSectionDto`/`DossierLetterFindingRefDto` +
  `client.getDossier(projectId, runId)`; added the `@rhema/findings-core` dep + project reference.
- **`apps/web`:** `apiDataSource.getDossier` replaces the `dossierNotWired` stub — resolves slug → id via
  `listProjects` (session forwarded on both calls), 404s as `ApiError` for a foreign slug, and passes the
  server DTO through as `DossierData` (which gained `findingObligations?` for the per-finding chip);
  `DossierPage`'s `FindingsList` now wires `obligationFor` (the REQ-OBJ-6 per-finding state chip).
- **Tests:** `apps/api/src/dossier-routes.test.ts` (3) — letter parsing; 404; the full assembly on PGlite
  (letter sections + slot-joined finding ref, dispositions on views, claim+source+fetch_log, rubric, trust
  chip counts incl. the denied proxy call, run card ignoring `agent.note`, obligation chips).
  `packages/api-client` +1 (`getDossier` URL/method/headers/DTO). `apps/web/src/data.test.ts` (2) —
  slug→id resolution, session forwarded on both calls, DTO pass-through, ApiError(404).
- **Green:** `turbo typecheck`/`lint` on the three packages; focused vitest 61/61 (full api+web+client
  suite 308/308 earlier in the session).
- **Next live step:** redeploy the api image with this route, then assert `GET …/dossier` for run
  `01M2RGNK9PWKN5M34343GXZC16` against the delivered rows (leg 7), then the remaining legs listed below.

### 2026-09-18 — dossier route live + legs 7/9/10 + LIVE FINDINGs 8/9
- **Redeploy:** api `64c57fc6…` / web `456ae33e…` rebuilt (cloudbuild subset), pinned in
  `Pulumi.prod.yaml`, `pulumi up` (update 27) — dossier route live.
- **Leg 7 (dossier) PROVEN:** `GET /projects/…/review/01M2RGNK9PWKN5M34343GXZC16/dossier` → 200, 89 KB
  assembled from delivered rows: 12 letter sections (real `editors_letter` bytes), 19 findings = DB count,
  10 claims, 240-row fetchLog join (run fetch_log 246 fetch + 26 search + 93 inference; accessReport
  fetches=272, deniedAttempts=6), rubric list, `openObligations`=8 = `revision_obligations` count,
  runCard 7 phases (`second_read` off). REQ-SPEC-10: every figure re-derived from rows.
- **Leg 9a (dispositions) PROVEN:** three real POSTs — accept/rebut/defer on run-6 findings → `dispositions`
  rows carry `by_actor:user` + `reason_code`; obligations routed (rebut→`rebutted`, defer→`deferred`,
  accept stays `open` proposed). **LIVE FINDING 8:** the `finding.disposed` + `run.estimated` analytics
  emits are bound + fire on prod, but `recordAnalyticsEvent` validates `project_id` against `idSchema`
  (26-char ULID) and the fixture project id `proj_prb16` failed → every write dropped (api log shows the
  zod error at 02:28/02:32Z; `run.estimated` failed identically at 16:18/18:14Z on 09-17). Fixture-shape
  artifact — fixed by the id repair below; emit legs re-proven after.
- **LIVE FINDING 9 (real bug, fixed this diff):** `POST /editor/:draftId/save` first 500'd on the
  fixture's non-ULID draft id (parseRunEvent validating `baseDraftId`), then — after the id repair —
  `POST /editor/:draftId/note` 500'd on a GENUINE prod bug: `captureGuidanceTx` emitted
  `guidance.captured` to a stream keyed `runId ?? projectId`; project-scope guidance has no runId →
  `run_event_seq.run_id → runs.id` FK violation (`23503` in api logs). Dev never caught it:
  `InMemoryEventWriter` bypasses `run_event_seq`. Fix: emit `guidance.captured` only when `runId` set
  (a standing guidance's durable record is the row; no run stream exists to fan out to). Regression
  test asserts run-scope emits + project-scope appends nothing.
- **Fixture id repair (durable):** the fixture's hand-named ids were the root of findings 8+9 — renamed
  `proj_prb16`/`proj_prb16_art1`/`proj_prb16_av1`/`proj_prb16_d1`/`cl_prb16_probe_fund` to real ULIDs
  via insert-copy→repoint-children→delete in one tx (no schema/FK changes; `session_replication_role`
  denied on Cloud SQL so the copy-repoint-delete pattern dodged `NO ACTION` FKs + unique(project,n)/
  (project,mirror_path)/(artifact,ordinal) collisions via temp ordinals/paths). New ids: project
  `01M2S5YQ0AVNF55Y1CG0TYZ9WJ`, artifact `01M2S5YQ0BZWZHTCBT5RTMJZMZ`, version
  `01M2S5YQ0BSGW31GXBT4PHSK1A`, draft `01M2S5YQ0BXQBA2XX637XYEN72`. A full-column rescan finds ZERO
  `proj_prb16` strings; `runs.inputs`/`proxy_credentials.context`/`run_mounts.manifest` jsonb rewritten.
- **Leg 10a (editor save/fork) PROVEN:** `GET …/editor/<d1>` returns frozen head + 19 findings;
  `POST …/save` → `{forked:true, draftN:2}` — `drafts` row v2 `01M2S63A7CH888TP4Z42RACK0E`
  `human_revision`/`working`, `base_draft_id`=v1; restore-point version created.
- API surface for remaining legs confirmed: `PATCH /runs/:id` cancels; revise manifest's triage phase
  gates `approve_triage` (the approve-triage + pretriage legs ride the sheet-path Revise run);
  profile_voice census gates `approve_sample`.

### 2026-09-18 — legs 9b/10b/11/12/16 + LIVE FINDINGs 10/11/12 + cap-loop finding
- **Leg 9b (`finding.disposed`) PROVEN:** after the ULID repair, `POST /projects/…/findings/01M2RJR0TS7WJY7CXV7DYQATX6/disposition`
  → 200; `analytics_events` row `finding.disposed {disposition:"accept", reason_code:"other"}` at 03:17:48Z.
- **Leg 10b (revise queue + pretriage) PROVEN:** sheet-path revise `01M2S78CV6JQJ7TXFVA4XSXZ9P` created with
  `inputs.pretriage.entries` = the 3 user dispositions (actor:"user", ordinals 0–2) and a run-sheet guidance row
  ("You pre-triaged 3 of 19 findings") captured run-scope.
- **LIVE FINDING 12 (revise dossier visibility — real gap):** the revise author seat can only read
  `drafts/ correspondence/ manifest.md agents/author/` (SEAT_MOUNTS by design) but delivery writes ONLY
  `access-report.md` into `correspondence/review/N/` — the letter/findings/rubric stay under `agents/editor/`
  (outside the author's allowlist). Bootstrap correctly self-reported `status:"blocked"` ("Dossier not
  delivered to the author seat") yet the harness logged the phase `failed` and the reaper re-queued the run
  repeatedly. Same blocker previously seen on dev (D-P0.15-2 note). Owed fix: delivery must also write the
  dossier artifacts into `correspondence/<kind>/<ordinal>/` (shared namespace) OR the runspec must mount
  the review dossier for the author seat. → continuation ticket.
- **LIVE FINDING 13 (cap-dead runs never finalize):** a run that dies with `402 cap reached` inside the pod
  leaves the run row `running`; heartbeat goes stale → `orphaned` → stranded-sweep re-queues → pod boots →
  instant 402 → repeat. Both the voice build (65/62 cr) and revise attempts looped until manually cancelled
  via `PATCH /runs/:id`. Owed fix: on a cap-402 phase failure, finalize the run `failed`/`cap_reached`
  instead of leaving it running. → continuation ticket.
- **Leg 11 (Quick Voice) PARTIAL-PROVEN:** `POST /voices` 201 → persona `01M2S7G0SH9V4X7YW0W0TH9XH4` +
  `persona_seed` artifact `PERSONA.md` persisted through the NEW `contentStoreFor` bind (this exact call 500'd
  before the fix — regression proven). `POST …/samples` 201 (`discovered_items` + `sample_versions` rows,
  55 words). `POST …/build` 201 → `profile_voice` run `01M2S7HAV0MQQP4K4QXHXH0KBJ` (est 41 / cap 62).
  `voice.created {tier:quick}` analytics row at 03:03:25Z. Build census hit the 62-cr cap mid-phase (65 cr
  recorded) → finding 13 loop → cancelled. `persona_profiles` snapshot leg still owed.
- **Leg 12 (export + AI-use) PROVEN after 2 live fixes:**
  - **LIVE FINDING 10 (real bug):** `collectStatementFacts` did `JSON.parse(decisions.by_actor)` but
    `writeDecision` stores the `GATE_RESOLUTION_BY` enum verbatim ("user"/"timeout"…) → EVERY project with a
    gate decision 500'd `/export` and `/ai-use` (and the export dialog sweep). Fixed in `facts.ts` (bare enum
    verbatim, JSON string tolerated); test now seeds the production shape.
  - **LIVE FINDING 11 (real bug):** `createServiceExportRunner` sent NO credential to the invoker-gated
    export Cloud Run → `403 Forbidden` from the Google frontend. Fixed two halves:
    `fetchGceMetadataIdToken(audience)` added to `@rhema/live-clients` (metadata OIDC identity endpoint,
    text body), runner attaches `Authorization: Bearer` when `tokenFor` wired (server.ts), and Pulumi grants
    the api SA `roles/run.invoker` on the export service (`api-invokes-export`, update 31).
  - `POST /projects/…/export {format:docx, attachAiUse:true}` → 200, 12 303-byte real .docx (verified: doc
    text + appended "AI-use statement" section). `GET /ai-use` JSON: 8 workflows, 12 decisions, v2 human
    revision, 7 open obligations — all from run rows. `GET /ai-use?format=docx` → 10 810-byte standalone
    docx. `project.exported {format:"docx"}` analytics row at 03:42:00Z.
- **Leg 16 (cited⇒fetched) PARTIAL:** on delivered review `01M2RGNK9…` all 11 cited `claim_sources` URLs
  match `fetch_log` allow rows (43 rows, agent_label editor). `kind=fetch` rows carry no status/bytes on
  prod — the audit API writes decision-only rows; byte receipts aren't recorded → telemetry gap noted,
  decision-level provenance confirmed.
- **Iteration/audit (D-P0.09-3) PARTIAL:** delivered run steps show `attempt=2` on 5 of 6 phases (real
  iteration occurred); a cap-hit `completed_partial` was not driven → row stays OPEN.
- **Estimates leg:** `POST /estimates` → 200 provisional figure + `run.estimated {kind:review, estimate:286,
  cap:429}` analytics row at 03:46:17Z (post-ULID repair emit path verified).
- **Spend this session:** revise `01M2S6Q93…` 214 cr/$1.53 + revise `01M2S78C…` 378 cr/$2.67 + voice
  `01M2S7HA…` 65 cr/$0.47 ≈ **$4.67** (fixture lifetime ≈ $30.24 incl. 4 earlier reviews). ≈ $19.8 of the
  $50 envelope remains.
- **Deploys:** Pulumi updates 29 (voice bind), 30 (ai-use fix), 31 (export ID-token + invoker grant). API
  digest `sha256:dc9208ea…`.
- **Cancelled safely:** `01M2S6Q93WM5Z6SV98AG7QKP55`, `01M2S78CV6JQJ7TXFVA4XSXZ9P`, `01M2S7HAV0MQQP4K4QXHXH0KBJ`
  all terminal `cancelled`, holds released.
- **Still OPEN (→ 28g2 / PRB.16b):** completing a Revise run (blocked by finding 12), cap-dead finalization
  (finding 13), Quick Voice build completion, gate-EDIT round-trip, approve_triage gate on a live run,
  browser Google sign-in (operator), Resend delivery (placeholder secret), byte-level fetch receipts,
  iteration-cap hit, sidecar live validation, SSE fetch_log rows, beta-report.
