# R6CLK.1 — dated clock reads + the R6WATCH.1 expansion (run ledger)

- **Spec:** `docs/tickets/199_R6CLK.1__clock-reads.md` (manifest row 199; REQ-CLK-1..6).
  Every read asserts its date has passed; a date not yet reached → "not yet" recorded and
  the row stays OPEN with its exact date.
- **Normative loads:** `docs/round-6-draft-spec.md` §4.9 (REQ-CLK-1..6, REQ-WATCH-1);
  `docs/tickets/DEFERRALS.md` (D-BL38.1-2, D-FIX.1-4, D-P1.04-2, D-COST.1-1, D-OPS.1-3,
  D-ECON.1-1, D-PRB.08-1, D-P1.18-1 + the REQ-WATCH-1 named rows); HUMAN-H10 readout;
  `docs/build/readouts/GATE-LAUNCH.md` (threshold-6 literal arm);
  `docs/build/reports/2026-10-27_R6LCH.1/LAUNCH-REPORT.md` (launch timestamp).
- **Base:** `origin/main` @ `73c1586b3e1c7335027d54473a920def4c644c04` (R6LCH.1 merge,
  PR #228). Prod serves `b953c55e` — verified **ancestor** of `main` @ `73c1586`
  (`git merge-base --is-ancestor b953c55e origin/main` → true).
- **Branch:** `stevevitali/r6clk-1-clock-reads` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec +
  build-memory + self-review @ `~/agent-skills`
- **Requirement ids stamped:** REQ-CLK-1 REQ-CLK-2 REQ-CLK-3 REQ-CLK-4 REQ-CLK-5 REQ-CLK-6
- **Started:** 2026-10-28T04:5xZ · **Closed:** 2026-10-28T06:2xZ (evidence reads
  05:2x–05:4xZ; records + boundary at 06:2xZ)
- **Live stage:** prod read-only — system-role DSN over the IAP proxy tunnel
  (`rhema-prod-proxy-*`, `localhost:15433`), `BEGIN READ ONLY` throughout; Cloud Logging
  reads; BigQuery metadata read; two anonymous/session HTTP probes. **Zero writes.**
- **Production mutations:** none — the 410 probe returns before the route's
  `downloaded_at` write (expired arm exits first); every DB session was `READ ONLY`.
- **Spend:** $0

## The six reads — verdicts

| Read | Verdict | Evidence |
|------|---------|----------|
| CLK-1 `project.purge` for `01M3SK380GQX41RKMD4KVFB34Q` | **NOT YET — 2026-10-30T21:41Z** | armed job `57bbef6f` `state=created` `start_after=2026-10-30T21:41:10.952Z`; project still tombstoned |
| CLK-2 Monday digest claims the stale-voice persona exactly once | **NOT YET — next sweep 2026-11-02T04:45Z** | machinery fired 2026-10-26 and claimed nothing; no T16 substrate exists |
| CLK-3 hand-dated tombstone destroyed + unreferenced objects | **CLOSED** | purge `357a8ba1` completed 2026-10-21T21:59:40.564Z; `objectsDeleted:0`; residue probe clean |
| CLK-4 billed actuals ≥ 24 h post console-flip | **NOT YET** | `billing_export_prod` holds **zero tables**; console flip unrecorded; recomputation proxy $256.65/mo appended |
| CLK-5 admin-key `usage.reconcile` green | **NOT YET** | hourly job completes but `report=skipped, window=skipped` on the placeholder key — the H10-provided key never reached the secret |
| CLK-6 T8 export 7-day expiry → 410 | **CLOSED** | live `GET /account/export/download?id=01M3D6BF8PT52GTP8KFQ5NMX22` → `HTTP 410 {"error":"export_link_expired"}` 2026-10-28T05:39:45Z |

## CLK-1 — the tombstoned project's +30 d purge (D-BL38.1-2)

- `pgboss.job` `57bbef6f-bf5d-4f48-8f5b-1c7065aed5ff`, name `project.purge`,
  singleton `project.purge:01M3SK380GQX41RKMD4KVFB34Q`, `state=created`,
  `created_on=2026-09-30T21:41:10.952Z`, `start_after=2026-10-30T21:41:10.952Z` — armed
  exactly on the tombstone+30 d fire date.
- The project row still sits `deleted_at=2026-09-30T21:41:10.945Z` on workspace
  `01M2V3PM11XSF05VJ9G01PM5ZB` ("The Library After Dark (review test)").
- **Verdict: not yet.** Re-read ≥ 2026-10-31 — the keyed `projects` select must return
  zero rows. D-BL38.1-2 dated tail appended.

## CLK-2 — the Monday digest claim (D-FIX.1-4)

Machinery state (system-role probe 2026-10-28T05:35Z):

- `notify.sweep.weekly` (`45 4 * * 1`, Mondays 04:45Z — `apps/worker/src/main.ts:760`)
  last fired **2026-10-26T04:45Z** — job `da54ea2b-0f63-495b-92fa-036532ef46bc`,
  `completed`. It fanned one `notify:voice_digest:<ws>:2026-10-26` job per workspace;
  all completed.
- Claims: **zero** `inbox_items`/`notification_deliveries` `voice_stale` rows exist —
  the sweep found no stale persona to claim.
- Substrate: three personas total on prod — `PRB16 Probe Voice` (09-18), `STB3 Probe
  Voice` (09-25), `JRN-C52F8F1D0F8A-T5VOICE` (10-27, `is_test`). `persona_profiles` n=2,
  last `built_at` 2026-09-26. **No `T16VOICE` persona exists** — T16 is
  `paid:true`/`expected:red` and has never run on prod; the funded wave stays parked
  (GD-ENV.R6).
- The digest claim additionally requires the persona to be in a derived attention state
  at sweep time (`voiceDigest` — `seed_changed`/`samples_changed`/`badly_off`/`aged`).
- **Verdict: not yet.** Next qualifying sweep **2026-11-02T04:45Z**; the T16 claim
  earliest rides the same-morning 04:35Z paid journeys sweep (schedule restored by
  R6SWP.1 on `main` 2026-10-27) if T16 runs and the derived state lands inside the
  10-minute gap — otherwise first claim no earlier than **2026-11-09T04:45Z**.
  D-FIX.1-4 dated tail appended.

## CLK-3 — the hand-dated tombstone's destruction (D-P1.04-2 → DONE)

- `pgboss.job` `357a8ba1-5260-4a8e-98a6-f182eaa78c38` `state=completed`
  2026-10-21T21:59:40.564Z for the R6WRT.1-minted tombstone
  `01M5G7M7RHWX8F0DYHGT2869JR` (workspace `01M5G7M7HC43N87M1Q903SFGQX`, `is_test`).
- Worker log line 2026-10-21T21:59:40.563Z:
  `project.purge 01M5G7M7RHWX8F0DYHGT2869JR → {"purged":true,"deleted":{"working_copies":0,"provenance_maps":0,"analytics_events":0,"projects":1},"objectsDeleted":0}`.
- Residue probe 2026-10-28T05:2xZ: project absent from the tombstoned-projects read;
  `artifact_versions` residue = 0.
- Honest caveat recorded in the deferral: `objectsDeleted:0` — the minted project was
  draft-only; the unreferenced-`s3_key` arm fired on an empty set.
- **Verdict: CLOSED** — D-P1.04-2 flipped DONE.

## CLK-4 — billed actuals (D-COST.1-1, D-OPS.1-3)

- The BigQuery billing export dataset `rhema-507501:billing_export_prod` exists but
  contains **zero tables** at 2026-10-28T05:3xZ — provisioned ~2026-09-29 and never
  populated. No billed-actuals surface exists to read. The console-flip timestamp (the
  D-OPS.2-1 operator act) is unrecorded in committed records; H10 recorded the export
  "enabled" 2026-10-21 but the dataset tells the truth: empty.
- Observed-side proxy appended (list-price recomputation — explicitly **not** billed
  actuals): `scripts/live/billing-read.mjs` 2026-10-28T05:30Z → est **$256.65/mo**;
  top five service classes: Cloud Run warm floor $64.80, Cloud SQL $55.30,
  Memorystore $35.77, GKE $28.46, proxy MIG $25.26 (then HTTPS LB $18.41, internal NLB
  $18.33). "Classes P1–P5" in the ticket is read as the top-five billed service classes;
  flagged to the operator in case the intended classes differ.
- **Verdict: not yet.** Both deferrals stay OPEN with the dated tail — the blocker is
  the empty export (operator re-check of the console export config) + the unrecorded
  flip timestamp.

## CLK-5 — the admin-key `usage.reconcile` (D-ECON.1-1, D-PRB.08-1)

- `usage.reconcile` runs hourly and completes (latest `d81dec78-0495-4a1c-a69b-e8c6a5d50a81`
  2026-10-28T03:15:29Z, `completed`).
- Worker log at the same instant: `usage.reconcile: report=skipped, window=skipped,
  balances 6 divergences` — and the standing boot warning `ANTHROPIC admin key is a
  placeholder — Usage & Cost report pull unconfigured` persists.
- **Finding:** `docs/build/readouts/HUMAN-H10.md` records "Anthropic admin API key
  provided" (2026-10-21), but `rhema-prod-anthropic-admin-key` `versions/latest` still
  serves the seeded placeholder at the consumer — the provided key never landed in the
  secret (or the seeded value is itself placeholder-shaped). Operator re-check owed.
- **Verdict: not yet.** A green read requires a `report=…`/`window=…` non-skip line
  after the real key binds; the balance-only arm is not the REQ-CLK-5 discharge.
  D-ECON.1-1 + D-PRB.08-1 dated tails appended.

## CLK-6 — T8 export 7-day expiry → 410 (D-P1.18-1 organic arm → DONE)

- The only prod `account_exports` row `01M3D6BF8PT52GTP8KFQ5NMX22` (created
  2026-09-25T21:08:15.766Z through the product surface — **not** hand-dated; operator
  workspace `01M2V3PM11XSF05VJ9G01PM5ZB`) aged naturally past
  `expires_at=2026-10-02T21:08:16.059Z`; probe read `expired=true`.
- Live probe 2026-10-28T05:39:45Z (session-authed arm — the row's emailed-token arm
  shares the identical `expires_at <= now` clause; the expired path returns before the
  `downloaded_at` write, zero writes):
  `GET https://api.rhema.tools/account/export/download?id=01M3D6BF8PT52GTP8KFQ5NMX22`
  → **HTTP 410 `{"error":"export_link_expired"}`**.
  (Session: a live `session` row of the operator account, per the STB.2 precedent; the
  token itself is never printed or committed.)
- **Verdict: CLOSED** — the organic 7-day clock arm is discharged; D-P1.18-1 dated
  tail appended (row already DONE on the hand-dated half; this closes the re-pointed
  organic observation).

## Residual checks

- **Nightly (`D-OBS.1-3`/`D-SPA.28-1`, GATE-LAUNCH threshold-6 literal arm):** the
  `journeys.yml` schedules were paused by R6CI.1 (`5d6e34a`, 2026-10-20, ADR-115 D7) and
  restored by the R6SWP.1 merge to `main` 2026-10-27T22:49Z (`9cf3ea9`; `schedule:` live
  on `main` @ `73c1586`). Last literal scheduled run: 2026-10-21T11:19Z (failed, pre-
  restore). First post-restore firing due **2026-10-28T06:05Z** — not yet fired as of
  2026-10-28T05:5xZ; historical scheduled runs land ~4–7 h late (10:16–13:44Z). The arm
  stays OWED until a scheduled `main` run lands green; the R6SWP.1 dispatch re-drive is
  substitute evidence, never the scheduled arm. GATE-LAUNCH readout dated note appended.
- **Deployed-vs-main provenance:** `b953c55e` **is an ancestor of** `main` @ `73c1586`
  — honest provenance; `main` is ahead only by the PR #228 merge + post-merge ledger
  records (deploy-neutral paths).

## Pre-window organic-cohort glance (D-P1.17-2 early data — NOT a REQ-WATCH-1 read)

Window ~1.6 h post-launch (probe 2026-10-28T05:35Z). Cohort = non-test workspaces minus
the two named smokes minus `test*@rhema.tools` synthetics:

- Organic signups since launch: **0** — the only post-launch `user` row is the smoke
  `14stevevitali+r6lch1@gmail.com` (03:58:46Z). All other recent signups are
  `test+j*@rhema.tools` on `is_test` workspaces.
- Organic runs since launch: **0** — post-launch non-test runs are all smoke-owned
  (`01M60AR5GG6Y0NXAWW5QH4GE2J`, `01M60AJ518F44M6025SGW9CHRV` on the smoke ws;
  `01M605XT4PD5FQZ6358JJ7HXDT` on the operator ws, pre-launch-refund leg).
- `acquisition_events` (anonymous, unexcludable): `landing.viewed` n=4 post-launch
  (05:18–05:30Z; n=104 on 10-27 pre-launch), `landing.dropzone_used` n=0 post-launch.
- `analytics_events` post-launch on non-test ws: only smoke-user events
  (`signup.completed`, `draft.imported`, `entry.chosen`, `finding.viewed` ×51,
  `run.report_viewed`, `surface.dwell` — one user).
- Honest label: **pre-window baseline, zero organic cohort** — no REQ-WATCH-1 claim
  either way. The 14-day window's committed queries are in ticket 200.

## R6WATCH.1 expansion (ticket 200 — expanded this run, not executed)

`docs/tickets/200_R6WATCH.1__post-launch-read.md` expanded skeleton → full BM-TICKET-03
ticket: exact launch timestamp `2026-10-28T04:0xZ`, window → `2026-11-11T04:0xZ`; the
organic non-test cohort clause (is_test + both smokes + synthetics, anonymous
`acquisition_events` caveat); per-row committed queries + sample thresholds for
D-R5OPS.1-1, D-COST.1-2, D-SLO.1-5/-7/-8, D-ECON.1-3/-4, D-ECON.2-5/-6/-7, D-P1.17-2;
the `GD-WATCH.R6` close-or-alert contract (sufficient samples → close on evidence;
thin/no data → standing alert-backed watch with owner/trigger/re-read, default re-read
launch + 28 d ≈ 2026-11-25T04:0xZ); Run/Depends/ACs; REQ-WATCH-1. **The read itself is
explicitly not executed** — `Run:` forbids starting before 2026-11-11T04:0xZ.

## Deferral dispositions (this run)

- **D-P1.04-2 → DONE** (CLK-3 evidence above).
- **D-P1.18-1** — organic 7-day arm observed (CLK-6); row's re-pointed remainder
  discharged.
- **D-BL38.1-2** — stays OPEN; armed+dated tail (`start_after=2026-10-30T21:41:10.952Z`,
  re-read ≥ 10-31).
- **D-FIX.1-4** — stays OPEN; machinery-proven/substrate-absent tail (next sweep
  2026-11-02T04:45Z conditioned on T16).
- **D-COST.1-1 / D-OPS.1-3** — stay OPEN; empty-export tails + the $256.65/mo
  recomputation append.
- **D-ECON.1-1 / D-PRB.08-1** — stay OPEN; placeholder-key tails + the
  H10-attestation-didn't-land finding.
- New deferrals: none — all "not yet" rows ride their existing carriers with dates.

## Verification

- Live-executed: every read above ran on prod read-only at the dated times ($0).
- Tests: no new behaviour — documentation-only ticket (evidence + ticket expansion).
- `check-build-memory.sh` → **0 violations**, 14 warnings (all pre-existing classes
  except the `updatedAt` ISO nit, fixed in `7b27c66`; the `nextTicket` warnings are
  the standing non-lowest-row class).
- `check-append-only.mjs --base 73c1586` → **OK**.
- `ci-boundary.sh` → **pass #229@`a5d2c73`** (run 40639558148 — all seven legs +
  `ci-pass` anchor: fast-path, typecheck/lint/unit, contracts, public-safe,
  integration, images; record `logs/ci-R6CLK.1.json` — gitignored subtree by design).
  The mode resolved full (no `ci-pass` anchor existed for the post-#228 non-docs tree
  — fail-closed by design).

## AC ledger

- [x] Each read evidenced, or recorded "not yet" with its date *(live-executed)* —
      2 closed (CLK-3, CLK-6), 4 "not yet" with exact dates/dates-conditions.
- [x] Universal phase-gate AC — verification green; req ids stamped; DEFERRALS rows for
      the non-automatically-verifiable arms; no deviations needing an ADR (the
      "classes P1–P5" reading is flagged, not deviated); BUILD_INDEX/LEDGER advanced;
      dates from the clock; protected records appended only; harness in this header.

## Self-review / gap analysis

- P1 — each verdict re-derived from the fresh probes, not carried claims: the earlier
  `objectsDeleted`/`expired` reads were re-probed; the 410 was re-executed at 05:39:45Z
  rather than citing the earlier session's probe.
- P2 — trap-check: the completed purge `01M5G7M7RHWX8F0DYHGT2869JR` is the R6WRT.1
  hand-dated mint (CLK-3's target), NOT the D-BL38.1-2 project — CLK-1 reads the keyed
  `57bbef6f` job only; the two tombstones are deliberately separated in the evidence.
- Honest flags: (a) the session-authed 410 arm was used for CLK-6 (identical clause;
  the emailed-token arm requires a token that exists only in the operator's mailbox —
  noted, not fabricated); (b) `objectsDeleted:0` recorded rather than overstating the
  objects arm; (c) `b953c55e`-is-ancestor ≠ `main`==prod — recorded as ancestor, the
  threshold-6 literal arm stays owed; (d) "classes P1–P5" interpreted as top-five
  service classes — flagged to the operator.
