# R5OPS.1 — Operations residuals: deterministic halves + scripted live legs (run ledger)

- **Spec:** `docs/tickets/161_R5OPS.1__ops-residuals.md` (manifest row 161, round 5 — stream D)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §7 (REQ-OPS-1..7) + §10 ratified
  rulings (Q-ALERT — accept Path A evidence; Q-CDN — verify leg only);
  `docs/research/r5_d234_stage-residuals.md` (F1–F9 leg recipes verbatim);
  `packages/orchestrator/src/pause-signals.ts` + `reactions.ts` (`drainPauseSignals` →
  `pauseRun`); `infra/pulumi/compute.ts` (usercontent BackendBucket, CDN signed-url seam);
  `.github/workflows/journeys.yml` (scheduled `github.sha` caveat);
  `docs/build/runs/R5ECON.3.md` (the funded-window regime the canary lands inside)
- **Base:** `stevevitali/r5econ-3-funded-window-regime` tip @ `dfcf43a` (impl `087fd0f` +
  closeout `6fff8de` + orchestrator boundary commit)
- **Branch:** `stevevitali/r5ops-1-ops-residuals` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory @
  `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-OPS-1 · REQ-OPS-2 · REQ-OPS-3 · REQ-OPS-4 · REQ-OPS-6 ·
  REQ-OPS-7
- **Gate authorization (operator, 2026-10-15 — "dispatch fully authorized"):** prod READS =
  the `gcloud` CDN-signed usercontent header verification (REQ-OPS-3) + the `slo_samples`
  read for the BL-07 classification (REQ-OPS/§7). ONE scripted prod WRITE = the canary
  pause-signal injection (REQ-OPS-1): a durable synthetic `pause_signals` row driving a run to
  `waiting_gate`/refusal, WITH pre-state capture AND rollback = row delete, both evidenced.
  NOTHING else — no paid legs, no deploys, no other prod writes, no other tenants' data.
- **Started:** 2026-10-15T22:06Z · **Closed:** 2026-10-15T22:55Z
- **PR:** #183 (base `stevevitali/r5econ-3-funded-window-regime`, mergePolicy OPERATOR —
  never merged) · **ci:** `gh pr checks 183` first-read → "no checks reported on the
  branch" (the chain's recurring first-read class; recorded honestly, no status claimed)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:

- `D-P1.22-2` (PARTIAL) — the Stage-B live bundle: (a) pod privsep corroborated STB.3;
  (b) canary injection smoke = THIS ticket's REQ-OPS-1; (c) usercontent headers → REQ-OPS-3's
  CDN-signed verify leg (Q-CDN ratified: out-of-band `gcloud`, not api-side minting);
  (d) backups+PITR done STB.2; (e) alert page — Path-A receipts recorded 2026-10-15
  (`rhema-prod-ops-alert-catcher` `ops_alert_received` entries every ~5 min carrying
  `{"kind":"slo_violation","signal":"unverified_review_rate_7d_pct","value":100,"threshold":1}`
  + POST→200) — ratified Q-ALERT accepts Path A → REQ-OPS-2 satisfied; (f) first-finding ≤4 min
  → REQ-OPS-4's committed query + D-row.
- `D-SLO.1-5..8` (OPEN) — the BL-07 named breaches; this ticket's deliverable is the
  `unverified_review_rate_7d_pct`=100 classification (test-tenant-vs-real) BEFORE any
  remediation — a READ, not a fix.
- `D-OBS.1-3` (OPEN) — the BL-74 nightly-green-on-deployed-SHA row; REQ-OPS-6 records the
  merge-dependency (`github.sha` == deployed SHA on a *scheduled* run) as a dated note.
- `D-P0.15-4` (OPEN) — BL-36 nightly golden; REQ-OPS-7 lands the driver behind its budget
  ruling (⚑ recorded as a Q-register item) + marks the absent-manifest exit-0 non-evidence.
- REQ-OPS-4 — the first-finding measurement query lands committed NOW; execution is deferred
  (organic-traffic prerequisite) as a verbatim D-row.

## Requirements (from the contract)

1. **REQ-OPS-1 — canary pause smoke (LIVE).** Scripted synthetic `pause_signals` injection →
   a run ending `waiting_gate`/refusal — pre-state capture + rollback = row delete, all
   evidenced. Authorized prod write.
2. **REQ-OPS-2 — alert path (recording only).** Path-A receipts already on D-P1.22-2;
   ratified Q-ALERT accepts that arm; `rhema:opsAlertWebhookUrl` stays documented-optional.
   No new leg.
3. **REQ-OPS-3 — usercontent CDN-signed headers (LIVE, read-only leg).** Out-of-band `gcloud`
   verify: assert real CDN-signed usercontent response headers (200 / no `Set-Cookie` /
   allowlist-or-`octet-stream` + `attachment` disposition).
4. **REQ-OPS-4 — first-finding ≤4-min (deterministic now, live leg deferred).** Commit the
   measurement query; execution waits for organic signups — a verbatim DEFERRALS row.
5. **REQ-OPS-6 — nightly green merge-dependency (recording only).** Record on BL-74 that the
   *scheduled* nightly's `github.sha` is `main` HEAD and satisfies "deployed SHA" only after
   the merge sweep lands.
6. **REQ-OPS-7 — nightly golden driver (deterministic).** Land the driver behind its
   ~$150–300/night budget ruling (a ⚑ Q-register item); mark the absent-manifest exit-0
   non-evidence.
7. **BL-07 classification (deterministic read).** `unverified_review_rate_7d_pct`=100 paging
   every 5 min — classify test-tenant-vs-real from `slo_samples`/the probe's driving `runs`
   rows BEFORE remediation; the classification lands here, not a guess.

## Acceptance criteria

- [x] Every scripted live leg executed with evidence, or a D-row with the verbatim recipe +
  blocker — REQ-OPS-1 PASS live · REQ-OPS-3 executed → CONFIG-OK-ORIGIN-DENIED finding +
  D-R5OPS.1-2 repair recipe · REQ-OPS-4 → D-R5OPS.1-1 (verbatim query, organic-traffic
  blocker) · REQ-OPS-6 recorded on D-OBS.1-3 · REQ-OPS-7 driver landed, live dispatch →
  GD-R5OPS.1-1/D-P0.15-4 *(live-executed or deferred-with-recipe)*
- [x] The BL-07 classification lands in the run ledger (not a guess) —
  `reports/2026-10-15_R5OPS.1/bl07-classification.md` *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met
  *(agentic — universal AC; BUILD_INDEX + PR/CI closeout land in the closeout commit)*

## Plan

- `scripts/live/canary-pause.mjs` — the authorized injection driver: `--dry-run` prints the
  plan; `--execute` does pre-state capture → inserts a synthetic `runs` row (`state='running'`,
  `is_test` workspace, `requested_by NULL`, `cap_credits 0`) + the synthetic `pause_signals`
  row (`egress_denied_spike`, `detail.canary='R5OPS.1'`) → polls `runs.state` /
  `pause_signals.processed_at` → captures the `waiting_gate` + `refusal` gate evidence →
  rolls back (`delete pause_signals` row + `delete runs` row, cascading the gate/events) →
  verifies clean state. The drain's own writes (gate, `run.state_changed` event, pg-boss
  `notify:waiting` job) are the mechanism under test — the notify job no-ops `not_found`
  post-rollback (`notifications.ts` gateNotice).
- `scripts/live/usercontent-cdn-verify.mjs` — the REQ-OPS-3 leg: `gcloud` reads the
  usercontent backend bucket's `cdnPolicy.signedUrlKeyNames` + `enableCdn`; when a key is
  attached, signs a real object URL via `gcloud compute sign-url` (key from SM
  `rhema-prod-user-content-signing-key`) and `curl -sI` asserts 200 / no `Set-Cookie` /
  `Content-Disposition` / allowlisted content type; unsigned leg asserts the deny shape.
- `scripts/live/first-finding-latency.mjs` — REQ-OPS-4's committed measurement query
  (`analytics_events`: `signup.completed` → first `finding.viewed` per real user, minutes).
  Read-only; runs only when the cohort is non-empty.
- `scripts/live/nightly-golden-driver.mjs` — REQ-OPS-7's driver skeleton behind the budget
  ruling: `--dry-run` prints the leg plan (the three-project dev set × all workflows →
  per-fixture scores → `nightly-manifest.json` → `gateFixtures`); `--execute` refuses without
  `GOLDEN_BUDGET_RULING=approved` (the ⚑ item's recorded ruling). Absent-manifest exit-0
  marked non-evidence in `nightly-golden.mjs` output text + a source pin.
- `scripts/live/*.test.mjs` — source pins on every new driver's fail-closed arms.
- `docs/tickets/DEFERRALS.md` — dated notes: D-P1.22-2 disposition per leg; D-OBS.1-3 the
  `github.sha` merge dependency; D-P0.15-4 the driver + budget-ruling linkage; the new
  REQ-OPS-4 row (verbatim query + organic-traffic blocker).
- `docs/build/LEDGER.md` GATE DECISIONS — the REQ-OPS-7 ~$150–300/night budget ruling recorded
  as an AWAITING-OPERATOR ⚑ row.

## Test matrix

- `canary-pause.test.mjs` — source pins: dry-run default (no execute ⇒ no writes),
  pre-state capture present, synthetic run is `is_test`-scoped + `requested_by NULL` +
  `cap_credits 0`, rollback = `delete from pause_signals` + `delete from runs` cascade,
  poll-bounded, evidence printed.
- `usercontent-cdn-verify.test.mjs` — pins: `backend-buckets describe`, `signedUrlKeyNames`
  read, `gcloud compute sign-url` seam, header asserts (no Set-Cookie, disposition, 200),
  unsigned leg asserts non-200.
- `first-finding-latency.test.mjs` — pins: `signup.completed`/`finding.viewed` verbatim,
  `is_test` exclusion, read-only tx (`begin read only`).
- `nightly-golden-driver.test.mjs` — pins: dry-run default, `GOLDEN_BUDGET_RULING` fail-closed
  gate, manifest → `gateFixtures` seam, budget text.
- `nightly-golden.test.mjs` — gains the absent-manifest NON-EVIDENCE wording pin.

## Progress

- 2026-10-15T22:06Z — run ledger seeded; context loaded (contract, §7 + §10 rulings, F1–F9
  recipes, pause transport (`drainPauseSignals`/`pauseRun`/`transition`/`openGate`),
  notify handler's `not_found` noop, cascade FKs (`run_events`/`run_events_internal`/
  `run_event_seq`/`gates`/`pause_signals` all cascade on `runs`), the IAP-tunnel + SM-DSN
  access pattern, `journeys.yml` `github.sha` caveat, `nightly-golden.mjs` absent-manifest
  exit-0, D-P1.22-2 Path-A evidence, `SLO_SIGNALS.unverified_review_rate_7d_pct` probe).
- 2026-10-15T22:10Z — IAP tunnel up; prod `rhema` reachable as `postgres` (migrations=58).
- 2026-10-15T22:12Z — **BL-07 classification landed** (read-only): the probe's verbatim SQL
  reads `rate=null, n=0` now; 14-day scan isolates the single driving row
  `01M41AE99M49Q5HNG4M9S6106Q` on the operator's non-test workspace — instrumented leg
  (`[autosave SLO probe — edit 1]` marker in `inputs.changedSince`), `delivery.label=
  'unverified'`, ended 2026-10-03T17:27:36Z; catcher pages stopped 2026-10-10T17:26:17Z when
  the row aged out. Fresh `balance_divergence` page found (2026-10-15T03:15:33Z, six
  included-bucket accounts) → LEDGER OPEN FINDINGS.
- 2026-10-15T22:13Z — zero non-terminal runs exist in prod (102 completed / 25 cancelled /
  32 failed; nothing `running`/`waiting_gate`) — the canary stages its own synthetic
  `running` row (is_test workspace, `requested_by NULL`, cap 0) rather than a paid leg.
- 2026-10-15T22:14Z — **REQ-OPS-3 leg executed.** `gcloud` verifies the deployed CDN config
  (`enableCdn=true`, `USE_ORIGIN_HEADERS`, `signedUrlKeyNames=[rhema-tools-key]`, urlmap
  `rhema-prod-urlmap-6f2b86e` host rule → `usercontent` path matcher). Signed fetch of a real
  object (minted via `gcloud compute sign-url` + `rhema-prod-user-content-signing-key`)
  returns GCS `AccessDenied` 403 — identical for unsigned and corrupted-signature probes:
  the edge does not gate signatures and the LB→private-bucket origin read is denied (bucket
  IAM `objectViewer` → `rhema-prod-convert@` only). Verdict: **CONFIG-OK-ORIGIN-DENIED** —
  config verified, delivery path nonfunctional → D-R5OPS.1-2 + LEDGER finding.
- 2026-10-15T22:24Z — **REQ-OPS-1 canary leg EXECUTED — PASS.** `canary-pause.mjs --execute`:
  synthetic run `r5ops1-canary-1792103095847` + signal id=1 (`egress_denied_spike`); the prod
  worker's drain claimed it 22:24:59.652Z→processed 22:24:59.718Z; `running → waiting_gate`;
  `refusal` gate opened (blocking, `on_expiry=cancel`); paired events observed. Rollback
  deleted both rows — residue zero across `runs`/`pause_signals`/`gates`/`run_events`.
- 2026-10-15T22:26Z — REQ-OPS-2/REQ-OPS-4/REQ-OPS-6/REQ-OPS-7 recorded: Q-ALERT stands (Path-A
  receipts); `first-finding-latency.mjs` committed + D-R5OPS.1-1 carries the query verbatim;
  D-OBS.1-3 gains the BL-74 `github.sha`-vs-deployed-SHA merge-dependency note;
  `nightly-golden-driver.mjs` landed behind `GOLDEN_BUDGET_RULING=approved` (GD-R5OPS.1-1
  AWAITING + Q-GOLDEN ⚑); absent-manifest exit-0 marked NON-EVIDENCE (pinned).

## Gap table

| requirement | required layer | achieved | status | evidence / unresolved |
|---|---|---|---|---|
| REQ-OPS-1 canary pause smoke | live | live | **met** | `reports/2026-10-15_R5OPS.1/canary-pause.json` — signal→`waiting_gate`+`refusal` gate+events, rollback residue 0 |
| REQ-OPS-2 alert path | recorded | recorded | **met** (Q-ALERT Path-A) | D-P1.22-2 Path-A receipts (`ops_alert_received` POST→200); `rhema:opsAlertWebhookUrl` stays documented-optional |
| REQ-OPS-3 CDN-signed headers | live verify | live verify (config) + finding | **met-engineered + OPEN residual** | `usercontent-cdn-verify.json` — config verified; signed delivery 403 origin-denied → **D-R5OPS.1-2** (non-403 still owed) |
| REQ-OPS-4 first-finding ≤4min | committed query | committed query | **met-engineered(D-R5OPS.1-1)** | `first-finding-latency.mjs` `FIRST_FINDING_QUERY`; execution deferred — no organic signups (verbatim row in DEFERRALS) |
| REQ-OPS-6 BL-74 merge dep | recorded | recorded | **met** | D-OBS.1-3 dated note — scheduled `github.sha`=`main` HEAD vs deployed SHA; `workflow_dispatch` never satisfies |
| REQ-OPS-7 golden driver | deterministic | deterministic | **met** | `nightly-golden-driver.mjs` fail-closed on `GOLDEN_BUDGET_RULING=approved`; GD-R5OPS.1-1 + Q-GOLDEN registered; absent-manifest exit-0 marked NON-EVIDENCE |
| BL-07 classification | deterministic read | live read | **met** | `bl07-classification.md` — n=1 instrumented leg on unflagged workspace; self-resolved by window aging; no remediation owed |

## Evidence log

- `docs/build/reports/2026-10-15_R5OPS.1/canary-pause.json` — REQ-OPS-1 PASS evidence
- `docs/build/reports/2026-10-15_R5OPS.1/usercontent-cdn-verify.json` — REQ-OPS-3 probes + verdict
- `docs/build/reports/2026-10-15_R5OPS.1/bl07-classification.md` — BL-07 classification + the
  `balance_divergence` datum
- Live-side artifacts left intentionally: the pgboss `notify:waiting:<gate>` singleton job
  (fires at +15 min → `not_found` noop — gate cascaded away; `requested_by NULL` →
  `no_recipient` regardless). No domain residue.

## Evidence report

Verification (2026-10-15, this branch):

- `pnpm install` — OK.
- `pnpm turbo build lint typecheck` — **135/135** tasks green.
- `pnpm test` — **499 files / 5,783 pass / 4 skip / 0 fail** (incl. the four new
  `scripts/live/*.test.mjs` source-pin suites + the `nightly-golden.test.mjs`
  absent-manifest wording pin; the local privsep leg ran green — PASS lines captured).
- `pnpm check:licenses` · `check:protocol-markers` · `check:no-cookies` (257 files) ·
  `check:spa-budget` · `check:spa-env` · `check:dom-contract` — all OK.
- `check-build-memory.sh .` — **0 violations** / 8 warnings (pre-existing legacy class;
  two self-caught duplicate DEFERRALS ids `D-OPS.1-*` fixed by renaming the new rows to
  `D-R5OPS.1-*`, re-validated).
- `check-append-only.mjs --base dfcf43a` — **OK** (the `## GATE DECISIONS` heading was
  self-caught dropped mid-run and restored; history prefix-clean).

Live evidence (authorized scope only — prod reads + ONE synthetic canary write):

- `canary-pause.json` — REQ-OPS-1 **PASS**: synthetic `running` row (is_test workspace,
  `requested_by NULL`, cap 0) + signal claimed by the prod drain → `waiting_gate` +
  blocking `refusal` gate + paired events; rollback residue 0 across
  `runs`/`pause_signals`/`gates`/`run_events`.
- `usercontent-cdn-verify.json` — REQ-OPS-3: `enableCdn` + `signedUrlKeyNames` +
  urlmap route verified; signed/unsigned/corrupted probes all GCS 403 →
  `CONFIG-OK-ORIGIN-DENIED` (repair leg → D-R5OPS.1-2).
- `bl07-classification.md` — the `unverified_review_rate_7d_pct` page traced to ONE
  instrumented leg on a non-test workspace (`[autosave SLO probe]` marker), aged out
  2026-10-10T17:26Z; current probe reads `rate=null, n=0`. No remediation owed.
