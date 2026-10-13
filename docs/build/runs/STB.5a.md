# STB.5a — Headless live legs: the owed BL-21/BL-22 browser legs on test tenants (run ledger)

- **Status:** DONE — Stage A green (full repo verify below); Stage B executed on prod `$0`:
  the permanent T1–T8 steps ran in real browsers against production test tenants; two live
  product defects surfaced and were **filed, not fixed** (D-STB.5a-1, D-STB.5a-2) per the
  ticket's defect rule; one live-read gap filed (D-STB.5a-3).
- **Ticket:** `docs/tickets/84_STB.5a__headless-live-legs.md` (manifest row 84)
- **Primary obligations:** BL-21/BL-22; DEFERRALS rows `D-P1.07-1`, `D-PRB.04-1`, `D-P1.18-1`,
  `D-P1.19-1`, `D-P1.15-1`, `D-P1.04-2` — every row received a dated append-only STB.5a note.
- **Branch:** `stevevitali/stb-5a-headless-live-legs` — **PR #106** stacked on
  `stevevitali/econ-2-cogs-reduction` @ `bbe1e95ec34afa30c5acf084fd6ac520aa99baf1`
  (PR #105, `OPERATOR` merge policy — nothing merged by me).
- **Spend:** **$0 inference.** No run was launched by this ticket; `usage_records` metered $0
  (`weeklyMeteredUsd: 0` in the report; cap $5). Journey legs are reads/forms/syncs — the only
  model-priced surfaces (`sample reconstruct`, voice build) were deliberately untouched.
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude.
- **ADRs:** ADR-088 (live-leg clock rule, cadence map, the honest-owed boundary for clock legs).
- **Date:** 2026-10-04

## 0 — Environmental state (verified 2026-10-04)

- **Prod provenance:** api + web `/healthz` both report `build.gitSha
  b909fe9a802867064317b57ea573c018e6d83332` — the run asserted `--expect-sha` and matched.
- **DB access:** IAP tunnel `127.0.0.1:15433` → prod Postgres; `JOURNEY_DATABASE_URL` bound to the
  app-serving role (`rhema_app_login`, `NOBYPASSRLS`). pgboss schema is NOT granted to that role
  (proven live — `42501`), which is exactly why T7 stays owed (D-STB.5a-3).
- **Pulumi:** non-interactive `pulumi up` impossible (`PULUMI_ACCESS_TOKEN` unset; same block as
  D-CITE.1-1/D-ECON.2-1) — irrelevant to this ticket (no deploy needed; legs ride prod as-is).
- **Mailbox:** `test@rhema.tools` via the journeys DWD service account + `gcloud` ADC caller
  credential (`signJwt`), never a key file.
- **Signup throttle:** prod rate-limits magic-link sends per IP as a **token bucket** — observed
  live as `Too many attempts — wait a few minutes and try again.` (a refusal was followed by
  acceptance ~60 s later across three separate runs; a longer-window quota would not have
  refilled that fast). Two earlier canonical attempts died mid-run on it; `session.ts`'s mint now
  waits ~75 s and resubmits up to 3× on the throttle alert (a non-throttle refusal still fails
  with the page's own words), which is what carried the canonical run's 8 mints through.
- **Queue latency:** prod confirm→worker pickup measured ~5 min twice (send lands instantly;
  the worker's cadence is the wait) — T5's sync wait now keys on `connections.last_sync_at` /
  the row's `last synced` text (a `new` row renders a sample link too), never on link counts.

## 1 — What shipped (Stage A, journey harness only — no product code)

- `packages/journeys/src/stb5a.ts` — the T1–T16 step implementations. T1–T8 are the nightly $0
  browser legs; T9–T16 are registered weekly paid riders (they run only under `--paid`, riding
  the weekly leg's own-tenant delivered Review — none of them executed here, $0 stands).
- `packages/journeys/src/stb5a-helpers.ts` — the committed Substack export-zip fixture builder,
  the CSL-JSON bibliography fixture, the REQ-ARCH-33 marker scan, quiet-window arithmetic.
- `packages/journeys/src/impls.ts` — merged implementation dispatch (`STEP_IMPLS` + `STB5A_IMPLS`;
  kept out of `steps.ts` to avoid the steps↔stb5a cycle).
- `packages/journeys/src/registry.ts` + `registry.test.ts` — T1–T16 rows interleaved at the
  positions the weekly sequence needs (T9 first among paid steps; T10–T16 after R9); the green-set
  pin updated when T3 flipped red on the two live defects.
- `packages/journeys/src/session.ts` — the mint diagnostic: a signup that never reaches the
  "link sent" status now surfaces the page's `[role="alert"]` text (that's how the throttle was
  named from the report alone).
- `packages/journeys/src/stb5a.test.ts` — helper coverage incl. the marker-list drift pin
  against `scripts/lib/protocol-markers.mjs` and the AC-I-A change-key claim (post_date-only
  edits leave the post file's bytes untouched).
- `docs/adr/ADR-088-stb5a-live-leg-clocks-and-cadence.md` — nightly-$0 vs weekly-paid cadence and
  the rule for clock legs a test tenant can never reach (owed, never fabricated).
- `scripts/live/stb5a-{prod-query,scoped-query,import-repro}.mjs` — the read-only prod evidence
  harness used below (secret fetched at runtime via `gcloud`, tunnel-resolved, ROLLBACK-scoped).

## 2 — Stage B live run (prod `b909fe9a`, provenance match)

Canonical run: nonce **`8c74704271d7`** (06:12:22Z → 06:20:59Z) — `rhema-journeys --stage prod
--steps T1..T8 --expect-sha b909fe9a802867064317b57ea573c018e6d83332 --out
docs/build/reports/STB.5a` with `JOURNEY_DATABASE_URL` bound over the IAP tunnel.
`report.passed: true`; earlier same-day attempts (nonces `03a0b49be5d1`, `122bfbe0bdd5`,
`85c10a662560`) are recorded in §3/§5 — the throttle + queue-latency transients they exposed are
what the session/mint and waitSync changes answer.

| step | outcome | leg |
|---|---|---|
| T1 | PASS | signed-in `/showcase` → seeded Showcase dossier renders all 7 D-PRB.04-1 parts; findings-desk tab + filter select actionable |
| T2 | PASS | Inbox badge = rendered Needs-you rows; notification matrix ≥5 event rows + quiet-hours controls actionable |
| T3 | **owed** (expected-red) | in-app download 200 + PK zip + zero protocol markers — but the emailed token link → 404 (**D-STB.5a-1**) AND `notice=importFailed` (**D-STB.5a-2**), both defects collected in one run |
| T4 | PASS | CSL-JSON bibliography → html export renders the styled citation + reference list; no raw `[@key]`; zero markers |
| T5 | PASS | substack-export upload → auto-include off via the settings form → discover lists 2 `new` rows → confirm → `ingest.sync` included both, drawer v1 → Re-sync → still v1 — AC-I-A zero new versions live (417 s leg; worker pickup ~5 min is the wait) |
| T6 | PASS | scratch project → row menu (collapsed `<details>` group opened first) → Delete → lands in `?deleted=1` with actionable Restore; absent from live list |
| T7 | **owed** | `42501 permission denied for schema pgboss` — the queue-row read needs a system-scoped DSN or a `pgboss.job` grant (**D-STB.5a-3**) |
| T8 | **owed** | bogus token → 404 (gate verified); the 410 expired-link half is clock-unreachable — 26 h tenant purge < 7 d token TTL (ADR-088) |

Screenshots + machine report: `docs/build/reports/STB.5a/T1.png`…`T8.png`, `report.json`.

## 3 — Defects found live (filed, not fixed — the ticket's defect rule)

- **D-STB.5a-1** — `GET /export/download?token=` (anonymous, token IS the credential) 404s for
  every valid token: `createScopedDb` runs unauthenticated queries on the raw `rhema_app_login`
  pool with no `app.tenant_id`; `account_exports` carries FORCE RLS → the token_sha256 lookup sees
  zero rows. Proven both directions live: scoped query returns the `ready` row with its token
  hash; the same query unscoped returns 0 rows; the real emailed link fetched → 404.
- **D-STB.5a-2** — `POST /account/import` 500s for every real import: every export zip carries the
  seeded `showcase` project and every target tenant already holds its own →
  `on conflict do nothing` skips the row while `projectId` maps the never-inserted `prj_imp_*` id
  → `artifacts_project_id_fkey` (23503). Proven live (api `unhandled_route_error` log) AND
  reproduced in a rolled-back tenant tx against prod (`scripts/live/stb5a-import-repro.mjs`).
- **D-STB.5a-3** — `pgboss.job` unreachable by the user-serving role (42501) → T7's queued-job
  assertion has no prod read path; needs a system-scoped DSN or a bounded grant.

## 4 — DEFERRALS appends (all dated 2026-10-04, append-only)

`D-P1.07-1` (T11–T13 registered, owed on the paid-rider prerequisite) · `D-PRB.04-1` (T10
registered, same prerequisite) · `D-P1.18-1` (T4 DONE; T3 ran end-to-end → the two defects; T8
7-day half still clock-owed) · `D-P1.19-1` (T9/T14 registered paid riders; T16/gate legs still
owed) · `D-P1.15-1` (T5 PASS — AC-I-A's re-sync/zero-new-versions residual discharged live; the live
`substack` provider fetch + priced reconstruction legs stay STB.3-scoped) · `D-P1.04-2` (T6 live-verified; T7's job-row read owed on
D-STB.5a-3; destruction half clock-owed).

## 5 — Verification

- `pnpm test` — **446 files / 4,512 pass / 4 skip / 0 fail** (incl. journeys registry 7/7, stb5a helpers 8/8).
- `pnpm turbo build lint typecheck` — **135/135** green.
- `pnpm check:protocol-markers` — 54 public-facing files clean.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — **no violations**
  (pre-existing warnings only).
- `git diff --check` — clean.
- `git status` — journeys package + docs/build memory + DEFERRALS + the three evidence scripts
  under `packages/live-clients/` only; **zero product-code files touched**.

## 6 — Still owed (explicit)

- The weekly paid riders T9–T16 (delivered-Review prerequisites + quiet-hours asserts) — the
  weekly leg they ride on is gated by the $5/week spend guard, not by this ticket.
- D-STB.5a-1/-2 product fixes — owned by a product ticket, deliberately not fixed here.
- T7's queued-job read (D-STB.5a-3) and T8's expired-token half (26 h purge < 7 d TTL — needs a
  purge exemption or an operator hand-dated row; recorded in ADR-088).
