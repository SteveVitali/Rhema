# PRB.16 — Prod golden-path verification: the paying-user journey, exercised + asserted on prod

**Spec:** `docs/tickets/28g_PRB.16__prod-golden-path-verification.md` · **Base:**
`stevevitali/prb-15-prod-bringup` · **Stacked PR — do not merge (mergePolicy=OPERATOR).**
**Continuation:** `docs/tickets/28g2_PRB.16b__prod-golden-path-continuation.md` carries the un-run
legs (authorized split per the 28g spec's own clause; manifest § Plan extensions).

## What this PR is

The **Stage A** (PR-able) half of prod golden-path verification: the dossier read bind plus three
live-surfaced production bug fixes — each discovered by driving the journey on `rhema-507501/prod`
and fixed here so prod could proceed. The **Stage B** live legs are documented with row/log
evidence in `docs/build/runs/PRB.16.md`.

## Code changes

- **Dossier read bind (LIVE FINDING 7)** — `GET /projects/:id/review/:runId/dossier` in
  `apps/api/src/dossier-routes.ts` assembles `DossierData` straight from delivered rows: letter
  sections, findings + latest dispositions, claims + claim_sources + fetch-log joins, rubric
  sidecar, re-derived access report, whitelisted run-card events, revision-obligation counts and
  per-finding chips. `api-client.getDossier` + `DossierDto`; web `getDossier` + per-finding
  obligation chip.
- **Voice content-store bind** — `createVoiceRoutes` resolves the workspace-bound store via
  `contentStoreFor` (same seam as editor/export). On prod only the factory was wired, so
  `POST /voices`, `/samples` and seed writes 500'd `'content store unavailable'`.
- **LIVE FINDING 9 — `guidance.captured` FK** — `captureGuidanceTx` appended the event with
  `runId ?? projectId`; project-scoped guidance has no run, violating `run_event_seq.run_id →
  runs.id`. The run event now emits only when a real runId exists (the durable guidance row is
  unaffected).
- **LIVE FINDING 10 — AI-use `by_actor` 500** — `collectStatementFacts` JSON-parsed
  `decisions.by_actor`, but `writeDecision` stores the `GATE_RESOLUTION_BY` enum verbatim
  (`"user"`). Any project with a gate decision 500'd the AI-use statement and every export.
  `by_actor` now reads the bare enum (JSON string still tolerated for legacy fixtures); the test
  seeds the production shape.
- **LIVE FINDING 11 — api→export auth gap** — the api called the invoker-gated export Cloud Run
  service with no credential → 403 on every prod export. `createServiceExportRunner` takes an
  injectable `tokenFor`; `server.ts` wires `fetchGceMetadataIdToken` (metadata-server OIDC,
  audience = service root); Pulumi grants the api SA `roles/run.invoker` on the export service.
- **k8s launcher + resilience fixes** — fully-qualified `repo@digest` refs accepted
  (`InvalidImageName`); migration 0026 `BYPASSRLS` for the blind system sweeps; heartbeat
  crash-loop fix (interval beats + TTL > STALE); prod `internalApiUrl` → run.app PGA path.
- **Pulumi.prod.yaml** — api image pinned to digest
  `sha256:dc9208ead86ccc6d393e52746acf04792a710863acc2f74335156cf60f55d768`; invoker grant applied
  (prod updates 29–31).

## Live evidence on prod (asserted from rows/logs, ~$4.67 spend)

- `GET …/dossier` → **200 / 89 KB** off run `01M2RGNK9PWKN5M34343GXZC16` (12 letter sections,
  19 findings, 10 claims, fetch joins, rubric, access report, obligation chips).
- Dispositions **accept/rebut/defer** persisted; `finding.disposed` analytics
  `2026-09-18T03:17:48Z`.
- Editor **fork/save/note/revise-queue** persisted; `inputs.pretriage` on the revise run row.
- **SSE**: two-client fan-out, `Last-Event-ID: 1` replay → seq 2,3 exactly-once, keepalive pings
  through the LB.
- `run.estimated` `03:46:17Z`; `project.exported` `03:42:00Z` — **attached DOCX 12,303 B +
  standalone AI-use DOCX 10,810 B**, valid `docx` content-type on the wire.
- All 11 cited URLs carry `fetch_log` allow-rows (status/bytes null on `kind=fetch` — honest
  partial).
- Fixture ULID-repaired in place (hand-named `proj_prb16` ids broke ULID validation across
  analytics/editor paths — every child row + JSON ref repointed).

## Honestly open → 28g2 PRB.16b

- **LIVE FINDING 12** — delivery never writes the dossier into `correspondence/` (only
  `access-report.md`); the author seat's `correspondence/**` allowlist honestly blocks revise
  bootstrap (`status:"blocked"`, run `01M2S78CV6…` cancelled). Fix = write dossier artifacts to
  the shared namespace at delivery, or extend the revise runspec.
- **LIVE FINDING 13** — a cap-402'd run never finalizes: `running` → `orphaned` →
  `queued_reenqueued` → instant 402 → repeat (65/62 cr overspend on `01M2S7HAV0…`). Fix = finalize
  on cap-402/`blocked` phase results.
- Browser sign-in/magic-link legs (operator-gated; Resend key still a placeholder — GATE
  DECISIONS 2026-09-17), completing Revise/Quick Voice runs, gate-EDIT round trip, and telemetry
  stragglers — all dated in `DEFERRALS.md`, none fabricated green.

## Verify

`turbo build lint typecheck` affected packages green · `pnpm test` affected suites **171 pass / 22
files** (+ ai-use 7/7) · `check-build-memory.sh .` **0 violations** · prod evidence in
`docs/build/runs/PRB.16.md`.
