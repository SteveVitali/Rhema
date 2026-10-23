# R6GLD.1 — Golden validation: $100 minimal four-protocol cohort at the launch-candidate SHA (run ledger)

- **Spec:** `docs/tickets/196_R6GLD.1__golden-validation.md` (manifest row 196, round 6;
  REQ-DISC-3 — ADR-111's amended §17 launch criterion)
- **Normative loads:** `docs/round-6-draft-spec.md` §4.7; ADR-111 (§17 amendment: golden validation
  green on all four protocols at the launch SHA + re-run on protocol-affecting deploys);
  LEDGER GATE DECISIONS `GD-R5OPS.1-1` (nightly cadence declined; one-time bounded validation),
  `GD-GOLDEN-CAP.R6` (minimal cohort = one fixture per protocol × its primary Review workflow at
  default tier/rigor; **hard cap $100**; pause if the estimate exceeds);
  `scripts/live/nightly-golden-driver.mjs` (fail-closed skeleton — `GOLDEN_BUDGET_RULING=approved`
  one-shot + measured `--scores`); `scripts/nightly-golden.mjs` + `@rhema/benchmark`
  (`assertScoreFloors`, `promotionBlocked`); `packages/protocols` (the four seeded protocols +
  `GOLDEN_EVAL_FIXTURES`); `evals/fixtures/`; DEFERRALS **D-P0.15-4**.
- **Base:** `stevevitali/r6secr-1-adversarial-review` @ `c1f20f5` (chain tip at branch cut)
- **Branch:** `stevevitali/r6gld-1-golden-validation` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-DISC-3
- **Started:** 2026-10-23T09:30Z · **Resumed:** 2026-10-23T13:37Z (post F-R6GLD.1-1 fix — proxy
  cycled to `rhema-prod-proxy-8g3n` booting `anthropic-api-key` v4) · **Closed:**
  2026-10-23T16:20Z (PR #214, unmerged — OPERATOR)
- **Live stage:** prod, paid — one validation run (4 paid legs) on the deployed launch-candidate
  SHA `80db0d5` (verified via `api.rhema.tools/healthz` + `rhema.tools/healthz` at dispatch time).
- **Production mutations (ticket header, verbatim):** 4 paid runs on an `is_test` workspace (one
  per protocol). Supporting rows on the same flagged workspace: one audited test-tenant house
  grant (the documented funding seam — every prior paid leg ran on granted credits; actor
  `devin-cli:r6gld-1`), four fixture projects + their imported drafts, one magic-link session mint
  for `test+jrn-gld@rhema.tools` (fresh test identity — the older `test+jrn-a` tenant had 20 cr
  left and sat near the 26 h purge horizon). Nothing on a non-flagged tenant.
- **Resolved prerequisite:** F-R6CNT.2-1 (`rhema-prod-anthropic-api-key` v4 live; `/v1/models`
  200 — operator note 2026-10-23). A 401 on any model call = stop + flag first-line, no retry-spend.

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start. Relevant rows:
- **D-P0.15-4** (OPEN): the deferred nightly/live golden obligation — THIS ticket closes it with
  live evidence under the amended criterion (recurring cadence stays declined — never resurrected).
- **D-R6CNT.2-1** (OPEN): paid showcase run regeneration — separate cap-floor ruling; not unblocked here.
- **D-CAP.2-1** (OPEN): paid journey legs — funded-window spend-guarded; not this ticket.
- **D-R6SECR.1-1** (OPEN): §12.8 live exercise — not this ticket (the golden run is not a canary).

## Requirements (from the ticket)

1. Cohort covers all four protocols — one fixture per missing protocol (P1.21's protocols 2–4),
   committed floors, before any paid dispatch.
2. `--cohort minimal` driver mode (one fixture per protocol × its primary Review workflow, default
   tier/rigor — `review` · `standard` · `base`).
3. A committed estimate; > $100 → PAUSE (never trim protocols silently).
4. One validation run on the deployed launch-candidate SHA (`80db0d5`) with measured `--scores`;
   floors green on all four; `promotionBlocked` stays false.
5. `docs/ops/golden-rerun-rule.md` — re-run on every protocol-affecting deploy (ADR-111).
6. D-P0.15-4 closed with evidence.

## Out of scope

- A recurring cadence (declined, GD-R5OPS.1-1); the full workflow × project cohort.

## Acceptance criteria

- [x] All four protocols in the cohort; the estimate is committed before dispatch *(deterministic)*
- [ ] Spend ≤ $100 measured; floors green on all four *(live-executed — **$33.89 measured ≤ $100
  on the rerun (4/4 legs `completed`, reviews delivered); floors green on 3/4 — `golden-academic`
  produced 11 major findings vs the committed band `max:10` → gate `PROMOTION BLOCKED`
  → F-R6GLD.1-2, operator ruling owed*)*
- [x] The re-run rule is committed *(deterministic)*
- [ ] Universal phase-gate AC *(agentic — mostly held: new driver behaviour carries test pins
  (12 driver tests), REQ-DISC-3 stamped, ledgers advanced; the live-executed AC stays red)*

## Live evidence

**Dispatch (2026-10-23, prod @ `80db0d5`, workspace `01M5M2C6NC3058T528ZX2D44SG` `is_test=true`,
fresh billing account funded with an audited 8 000 cr house grant — ledger `hold`/`release`
pairs confirm $0 debited):**

- Pre-dispatch checks green: API+web provenance `80db0d5`, tenant `is_test`, balance 8 000 cr,
  committed estimate 6 572 cr / **$46.94** list < $100 cap → dispatched (never retried).
- Exactly one run per protocol was launched; all four failed at **research preflight** with
  `HTTP 401 authentication_error` on every model × tool combination
  (`claude-sonnet-5` / `claude-haiku-4-5` × `web_search` / `web_fetch`):

| leg | run | state | spend |
|---|---|---|---|
| golden-essay | `01M5M2D06JAFZAY55H2HFP8PF1` | failed (`research_preflight_failed`) | $0 |
| golden-academic | `01M5M2EEJ7FPW5YAA9GJZYF9XE` | failed (`research_preflight_failed`) | $0 |
| golden-op-ed | `01M5M2EZF2VNF8KJSTJ1869R98` | failed (`research_preflight_failed`) | $0 |
| golden-memo | `01M5M2FH04NXN6JXMS4382FQ7P` | failed (`research_preflight_failed`) | $0 |

- **Measured cohort spend: $0** (holds 4 566+4 564+4 564+3 318 cr fully released — ledger
  evidence; showcase seed rows on the workspace never touched the billing ledger).
- Collected score file: `docs/build/reports/2026-10-23_R6GLD.1/golden-scores.json`
  (4/4 legs, honest `failed` states — the driver never fabricates a manifest; `--execute`
  was therefore never run and `evals/fixtures/nightly-manifest.json` was not written).
- Context check: in the last 3 days the DB shows **zero real (non-zero-duration) completed
  runs** — all 37 `completed` rows are zero-duration showcase seeds; the 401 is platform-side
  (`authentication_error` on the model call), not tenant-funding. **Per the ticket: stopped,
  no retry, operator flag.**

## Progress — resume (2026-10-23 PM, honest rerun after F-R6GLD.1-1 cleared)

- **2026-10-23T13:37Z — resume.** F-R6GLD.1-1 root-caused + cleared upstream (LEDGER): the
  egress-proxy MIG held cached key v3 (`ReloadableAnthropicSecretProvider` refreshes only on
  SIGHUP — design gap carried); proxy cycled → `rhema-prod-proxy-8g3n` HEALTHY, boots v4,
  `/v1/models` + `claude-haiku-4-5`+`web_search` direct probes 200.
- **2026-10-23T13:39Z — machinery gap found live: same-SHA rerun is impossible without an
  attempt tag.** The first re-dispatch deduped onto the PRIOR attempt — the driver keyed runs
  `golden-<fixture>-<sha>`, so `POST /runs` returned the four old `failed` rows (identical
  ULIDs, $0, zero new model calls — `golden-scores-dedupe-noop.json` records the no-op; it also
  minted four empty fixture projects). **Fixed:** `--dispatch` now requires `--dispatch-tag`
  (<fixture, sha, tag> = the idempotency key; same-tag re-invocation is retry-safe, a rerun
  names a new attempt — pinned by test + documented in `golden-rerun-rule.md`).
- **2026-10-23T13:42Z → 15:55Z — real rerun (`--dispatch-tag rerun1`), all four legs
  `completed`, reviews delivered.** Research preflight passed on every leg — the 401 is gone.
- **2026-10-23T16:06Z — schemaValid measurement bug fixed.** The driver's `schemaValid`
  demanded `correspondence_items.verdict != null`, but the real delivery path
  (`mirror/delivery.ts`) never writes that column (per-claim verdicts live on `claims`) — every
  delivered review measured false-red. Re-predicated on the honest schema signal: completed +
  review CI + protocol stamp + parseable rubric w/ non-empty `dimensions[]` + ≥1 artifact + ≥1
  claim. Re-measured the same four runIds → `golden-scores-remeasured.json`.
- **2026-10-23T16:06Z — gate executed (not evaded):** `gateFixtures` → essay/op-ed/memo PASS,
  **academic FAIL — `findingCountsBySeverity.major` 11 > band max 10 → PROMOTION BLOCKED.**
  `gate-report.txt` committed. The band was authored a-priori (first live measurement ever);
  the 11 majors are 11 distinct well-formed findings on a deliberately weak 270-word proposal —
  a borderline band overage needing an **operator ruling** (re-rule the band via a GD amendment,
  or treat as a signal). Never widened unilaterally — that is the gate's entire point.

## Live evidence — rerun (2026-10-23, prod @ `80db0d5`, same workspace + grant)

| leg | run | state | duration | spend (list) | credits (metered) | findings b/M/m/n | review CI | stamp |
|---|---|---|---|---|---|---|---|---|
| golden-essay | `01M5MFYJ3P04SXRBPN26FYEE11` | completed | 39.5 min | $10.65 | 2 015 | 0/7/5/5 | `01M5MJ7175C42AQSSE0KHWW42G` | essay@1 |
| golden-academic | `01M5MJ7CGGPF3CMHDFZV80VFE2` | completed | 33.6 min | $8.69 | 1 597 | **0/11/5/6** | `01M5MM53WV5HXA45MRTEQC4CF2` | academic@1 |
| golden-op-ed | `01M5MM5AV1RHC4RJ1NWSA0X07G` | completed | 34.3 min | $8.56 | 1 566 | 3/3/3/6 | `01M5MP4BGG9MWETVZ2ZH831ZXP` | op-ed@1 |
| golden-memo | `01M5MP4XV5CVNP3301DFED7EJP` | completed | 25.2 min | $5.99 | 1 160 | 0/7/7/5 | `01M5MQK67WHNYZCNB7BFRHB7RY` | memo@1 |

- Every leg: `citedFetched: true`, `attestationViolations: 0`, rubric `dimensions[]` = 8,
  13–14 delivered artifacts, 7–11 claims.
- **Measured spend: $33.89 list** (usage_records, meter of record) ≤ $100 cap; estimate was
  $46.94. Total across BOTH dispatches: $0 + $33.89 = **$33.89**. Grant consumed:
  promo bucket 8 000 → 6 227 cr; daily bucket 10 → 0.
- Gate evidence: `reports/2026-10-23_R6GLD.1/golden-scores-remeasured.json` +
  `gate-report.txt` (`PROMOTION BLOCKED` — exit 1); `evals/fixtures/nightly-manifest.json`
  written by `--execute` (gitignored local artifact).
- Residue on the flagged workspace (inside the ticket's named mutations): 8 more fixture
  projects + drafts (4 from the dedupe no-op — `01M5MFVV7…`/`01M5MFVXJ…`/`01M5MFW00…`/`01M5MFW24…`
  — which minted projects but deduped to no runs, 4 from the real rerun), plus the first
  dispatch's 4. All on `is_test` `01M5M2C6NC3058T528ZX2D44SG`; the 26 h purge reclaims them.

## Finding

- **F-R6GLD.1-1 (RESOLVED — confirmed green live 2026-10-23):** the proxy cycle cleared it —
  all four rerun legs passed research preflight and completed with real research (45+ allowed
  fetches on leg 1 alone). The carried design gap (SIGHUP-only key refresh) stays noted in the
  LEDGER entry as owed engineering work, not launch-blocking. Original finding text:
  research preflight returned HTTP 401 `authentication_error` for both research model tiers on
  prod @ `80db0d5` although F-R6CNT.2-1's `/v1/models` probe was 200 — the failing surface was
  the model call carrying `web_search`/`web_fetch` server tools (the per-run
  `proxy_credential_id` path).
- **F-R6GLD.1-2 (OPEN, operator):** `golden-academic` measured **11 major findings** vs the
  committed `GOLDEN_LIVE_FLOORS` band `major: {max:10}` → `assertScoreFloors` FAIL →
  `promotionBlocked: true`. The run is NOT degenerate — the majors are 11 distinct, well-formed
  findings (zero blocking; cited-fetched clean; zero attestation violations). The band was
  authored before any live measurement existed. Operator ruling needed: re-calibrate the band
  with a recorded GD amendment (the amended §17 criterion then needs one more green rerun — the
  machinery now makes that cheap, ~$35 measured), or hold the criterion red as a genuine signal.

## Gap analysis

| requirement | evidence | state |
|---|---|---|
| 4 protocols, one fixture each, committed floors | `GOLDEN_EVAL_FIXTURES` (essay/academic/op-ed/memo) + `eval-fixtures.test.ts` (12 tests) | DONE (deterministic) |
| `--cohort minimal` driver, default review/standard/base | `nightly-golden-driver.mjs` + `nightly-golden-driver.test.mjs` (12 tests — +`--dispatch-tag` pin) | DONE (deterministic) |
| committed estimate, >$100 → pause | `cohort-estimate.json` — 6 572 cr / $46.94, `withinCap:true` | DONE (committed pre-dispatch) |
| 1 run per protocol on `80db0d5`, `is_test` | rerun1 tag: 4 fresh run ids, all `completed` (evidence table above) | DONE (live-executed) |
| measured `--scores`, floors green, `promotionBlocked:false` | `golden-scores-remeasured.json` — measured scores exist; floors green on 3/4, academic red (major 11>10) → `PROMOTION BLOCKED` | **RED (F-R6GLD.1-2, operator ruling)** |
| `docs/ops/golden-rerun-rule.md` | committed; updated with the `--dispatch-tag` contract | DONE (deterministic) |
| D-P0.15-4 closed with live evidence | live evidence exists and is honestly **red on one floor** — the deferral stays **OPEN** with a dated note | **OPEN (F-R6GLD.1-2)** |

## Operator flags

- **⚑ F-R6GLD.1-2 — `golden-academic` floor miss (major findings 11 > band max 10):** the rerun
  delivered four genuinely green runs (all `completed`, schema-valid reviews, cited⇒fetched
  clean, zero attestation violations) but the academic leg exceeded the a-priori major band by
  one finding. **Ruling needed:** re-calibrate `GOLDEN_LIVE_FLOORS.findingCountsBySeverity.major`
  with a GD amendment + one more `--dispatch-tag rerun2` pass (~$35 measured this time), or hold
  the amended §17 criterion red. The deferral D-P0.15-4 and GATE-LAUNCH threshold state stay
  honest-red until ruled.
- ~~F-R6GLD.1-1~~ — cleared: proxy cycle to `rhema-prod-proxy-8g3n` (v4) fixed the 401s; proven
  by four green end-to-end runs. The SIGHUP-only key-refresh design gap is carried in the LEDGER
  OPEN FINDINGS entry as owed (small, non-launch-blocking) engineering work.
- The four paid legs need funded balance on the flagged workspace: the only documented seam is
  `admin-cli house-grant` (audited `admin_actions` + ordinary ledger rows — never a balance UPDATE).
  Executed under GD-GOLDEN-CAP.R6's cohort authorization, actor `devin-cli:r6gld-1`, sized to the
  committed estimate + hold headroom. The rerun consumed ~1 773 cr of the 8 000 cr grant
  (6 227 remain — enough for one ruled rerun). `house-void` reverses the remainder.

- **ci: pass #214@a7acf73** (run 39985872467 — all seven legs + `ci-pass` anchor; boundary
  record `logs/ci-R6GLD.1-rerun.json`; first read timed out at 2700s with images/integration
  pending → job-polled green → re-read). Validators: check-build-memory 0 violations;
  append-only vs `c1f20f5` OK.
