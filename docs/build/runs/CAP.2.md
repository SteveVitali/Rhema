# CAP.2 — capstone composed verification (run ledger)

- **Spec:** `docs/tickets/87_CAP.2__capstone-composed-verification.md` (manifest row 87, round-3 tail)
- **Base:** `stevevitali/cap-1-capstone-gap-analysis` @ `b8b9ec0feed1cd71cc8aae897f86d421b59e75b2` (PR #108 open; tree verified clean at fork)
- **Branch:** `stevevitali/cap-2-composed-verification` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli/claude (Cognition agentic coding CLI subagent)
- **Skills:** implement-spec @ `~/agent-skills` (pin: see evidence log)
- **Started:** 2026-10-04T07:51Z
- **Closed:** (pending)
- **Config:** full rigor; amended cap ≤ $10 metered (aim ≈$5); round-3 cumulative ~$71

## Deferrals read

Read `docs/tickets/DEFERRALS.md` in full (874 lines) at run start. Rows bearing on this run:

- `D-DEF.4-1` — R9 refund journey owed (deploy half DONE on prod `b909fe9a`; `--paid` refused at the
  weekly guard).
- `D-CITE.1-1…-5` — deploy blocked on the Pulumi 401; N11 + measured-rate legs owed.
- `D-ECON.2-1…-7` — same deploy block + weekly guard; the REQ-SPEC-8 restore read is NOT MET.
- `D-STB.5a-1/-2/-3` — T3 live defects (export-token 404, import 500) + T7 pgboss read gap.
- `D-STB.5b-1/-2/-3` — guard DSN-sensitivity; `ITERATION_CAPS.{audit,gapCheck}` no consumer;
  `fetchViaFetcher` holdout-only.
- `D-P0.03-2` (B16 sidecar-absent), `D-P0.08b-2` (B17), `D-P1.21-2` (B18B), `D-P1.10-1`/`D-P1.12-1`/
  `D-P1.14-1` (B19*), `D-P1.07-1` (T13), `D-P1.19-1` (T15/T16), `D-P1.18-1` (T8), `D-ECON.1-3/-4`
  (calibration store), `D-ACT.1-3` (trial audience flip), `D-OBS.1-3` (nightly-green-on-SHA).
- `D-CAP.1-1` (deep-link layout restore — REQ-IDE-1 clause 2) and `D-CAP.1-2` (emission-audit
  coverage) — both routed to **this** ticket by CAP.1: walked as seam targets where $0 permits.
- `D-RES.1-2` (N6 — ran under ECON.1 2026-10-02 but still owed its dossier-evidence half),
  `D-RES.1-3` (cut by cap).

No OPEN row this ticket unblocks becomes closable here *except* where a $0 live leg can genuinely
discharge it (assessed during the run; anything still blocked gets its own `D-CAP.2-<n>`).

## Environmental state (verified at run start, `date -u`)

- `date -u` 2026-10-04T07:51Z; ISO week = 2026-09-28 → resets Mon 2026-10-05 00:00 UTC.
- Deployed prod: api + web `/healthz` `build.gitSha = b909fe9a802867064317b57ea573c018e6d83332`
  (DEF.4 era). Chain tip `b8b9ec0` carries CITE.1 + ECON.2 + STB.5a + STB.5b + CAP.1 **undeployed**
  (image pins committed in `infra/pulumi/Pulumi.prod.yaml`).
- `pulumi whoami` → `PULUMI_ACCESS_TOKEN must be set` — the stored token 401s (D-CITE.1-1/D-ECON.2-1);
  `pulumi login` is an operator act. No deploy possible.
- gcloud live: `14stevevitali@gmail.com` / `rhema-507501`. Mailbox `test@rhema.tools` readable
  keylessly via the `rhema-journeys` DWD service account (H7 done). Playwright chromium installed.
- Weekly journey-spend guard: $58.08 ≥ $5 measured 2026-10-04 (system role; STB.5b/CITE.1/DEF.4) —
  `--paid` refuses until the ISO reset. $0 legs run now.
- DB reads via IAP tunnel `gcloud compute ssh rhema-prod-proxy-c519 --tunnel-through-iap --
  -L 15433:10.46.0.3:5432`; system DSN composed from `rhema-prod-alloydb-password`; app DSN from
  `rhema-prod-app-database-url` (host rewritten to the tunnel). **D-STB.5b-1 remembered:** spend reads
  only under the SYSTEM role — app role reads $0 through RLS.

## Requirements (spec § In scope + Round-3 notes)

1. Composed-final-state verification exercising the fully-wired path — unit/integration + composed
   runtime run where the build has one.
2. The full JOURNEY.1 registry suite on the deployed prod stage, every step expected green;
   still-red steps recorded as xfail w/ their D-ids.
3. The deterministic composed path (unit/integration over the composed tree).
4. The SEC.1 two-tenant probe — $0, live.
5. One paid new-visitor journey incl. the trial Review — guard-permitting, else environment-blocked
   with the exact resume sequence.
6. REQ-SPEC-32(c) calibration report regenerated from ECON.1's store; admissible-sample count
   recorded honestly.
7. Walk CAP.1's seam targets at $0 where possible (~60 un-walked-surface PARTIALs; AT-RISK
   REQ-ACCT-3; D-CAP.1-1/-2); xfail the rest.
8. `docs/build/COMPOSED_E2E_REPORT.md` — commands + observed signals per scenario.

## Acceptance criteria

- [x] composed path green, or every non-green an xfail/skip whose reason starts with a `D-*` id
      (deterministic) — **met by classification, not by green**: 3 fails + 3 owed + 21 paid-skips
      all resolve to `D-*` rows; deterministic tree green
- [x] `COMPOSED_E2E_REPORT.md` records commands + observed signals per scenario (agentic)
- [x] every environment block recorded with what closes it, routed to the operator (agentic) —
      `D-CAP.2-1/-2/-3` each carry blocker, closer, owner, resume command
- [x] universal phase-gate AC (verification green; tests; req ids stamped; deferrals; ADRs; index) —
      pending closeout: LEDGER/BUILD_INDEX/PR; ADR n/a (docs-only ticket, no owned decisions
      beyond the filed defect rows)

## Plan

Cheapest-first, all legs $0 unless named:

1. Baseline health (1.2): `pnpm test` + `pnpm turbo build lint typecheck` at the chain tip.
2. Live provenance read: `/healthz` on api+web (done above — `b909fe9a…`).
3. Open IAP tunnel; re-measure the weekly guard under the SYSTEM role (D-STB.5b-1 convention).
4. JOURNEY.1 $0 suite: `rhema-journeys --stage prod --steps <all paid:false steps>
   --expect-sha b909fe9a…` with `JOURNEY_DATABASE_URL` = app-role DSN — expected: every green step
   PASS, T3/T7/T8 owed.
5. Paid legs: a real `--paid` dispatch attempt to capture the verbatim guard refusal →
   `D-CAP.2-<n>` with the resume command + the deploy-owed block (chain-tip suite needs the two
   pending deploys; resume sequence documented).
6. SEC.1 probe: mint `test+cap2a/b` sessions through the real magic-link funnel; run
   `two-tenant-probe.ts --base-url https://api.rhema.tools --web-url https://rhema.tools`.
7. REQ-SPEC-32(c): re-run `econ1-harvest.mts` (idempotent upserts on the platform aggregate
   tables — the designed mechanism ECON.1 itself ran on prod) → record admissible count.
8. $0 seam walks within the suite's reach: T3 = REQ-ACCT-3 AT-RISK evidence; T15/D-CAP.1-1 and the
   emission-audit leg (D-CAP.1-2) attempted where the harness permits.
9. `COMPOSED_E2E_REPORT.md` + DEFERRALS rows + ADR if owned decisions arise.
10. Close: green gate, PR stacked on #108's branch, LEDGER/BUILD_INDEX/closeout.

## Test matrix (1.4 — this ticket adds no product code; the matrix is the composed run itself)

| AC | Planned test | Where |
|---|---|---|
| composed path green/xfail-with-D-id | full registry run vs current prod | step 4 |
| deterministic tree green | `pnpm test` + `turbo build lint typecheck` | step 1 |
| two-tenant isolation | live probe, 2 real sessions | step 6 |
| calibration report | harvest re-run + admissible count | step 7 |
| report exists w/ commands+signals | `COMPOSED_E2E_REPORT.md` | step 9 |

New gap rows found → `D-CAP.2-<n>`; new product gaps → routed to CAP.3, never closed here.

## Progress

- 2026-10-04T07:51Z — Phase 0 done: branch forked at b8b9ec0 (tree clean), DEFERRALS + CAP.1 outputs
  + LEDGER read, environment verified (above).
- 2026-10-04 — baseline: `pnpm turbo build lint typecheck` 135/135 FULL TURBO green; `pnpm test`
  running. IAP tunnel up (`rhema-prod-proxy-c519` zone `us-central1-c` — CITE.1's doc said `-a`;
  the instance lives in `-c`).
- 2026-10-04 — weekly guard re-measured live under the SYSTEM role: **$58.07792 / 1,675
  `source='proxy'` rows** (ISO week 2026-09-28) — `--paid` will refuse; verbatim refusal captured:
  `spend guard refused: weekly metered spend $58.08 has reached the $5 cap` → exit 3.
- 2026-10-04 — REQ-SPEC-32(c) harvest re-run over the tunnel: **55 observations upserted, 198
  total; admissible = 0** (116 `no_proxy_rows` / 64 `not_completed` / 18 `pre_preset_fix`);
  `cost_card_cells` recomputed 46 (`econ1@2026-10-04`); `cap_calibration_reports` **0 rows** —
  identical honest outcome to ECON.1.
- 2026-10-04 — emission-audit coverage leg (D-CAP.1-2, $0): 37 distinct prod
  `analytics_events.event` names — **all catalogued** (67-name catalogue; zero uncatalogued
  emissions; zero prod events classified `beta_absent`). Row stays OPEN: the
  zero-UNinstrumented-surface half still needs an exercising leg.
- 2026-10-04 — SEC.1 live two-tenant probe: `passed:true, findings:[]`, 8 routes × 2 tenants +
  2 write probes ($0; sessions `test+j55e5171f6cbfcap2a/b` minted through the real magic-link
  funnel).
- 2026-10-04 — $0 registry suite vs current prod `--expect-sha b909fe9a…` done (nonce
  `1218d1acdedd`, 07:56:58→08:09:55Z, provenance match, $0): **18 PASS / 3 owed / 3 FAIL /
  21 paid-skips**. Owed: T3 (D-STB.5a-1/-2), T7 (D-STB.5a-3), T8 (D-P1.18-1). FAIL: N4 +
  N9 → D-OBS.1-3 (pre-existing substrate drift on the deployed image — dated re-confirmation
  appended); P1 → **new live defect**: `.ide-actions a` phone 44 px rule is dead CSS
  (source-order: base 24 px declared after the media override, equal specificity ⇒ base wins;
  `9f94621` authored it, still in the tip; measured 105×25 live) → `D-CAP.2-3`, routed CAP.3.
- 2026-10-04 — Phase 4 gap table + `D-CAP.2-1/-2/-3` rows appended; `COMPOSED_E2E_REPORT.md`
  written (§2 per-step classification — every non-green carries a D-id).
- 2026-10-04 — `pnpm test`: **448 files pass / 1 skip; 4,552 tests pass / 4 skip / 0 fail**
  (~515 s). Deterministic composed path fully green.

## Gap table

| # | Spec requirement | Verdict | Evidence / routing |
|---|---|---|---|
| 1 | Composed-final-state verification — unit/integration + composed runtime where the build has one | **MET (deterministic) / environment-blocked (live tip)** | `pnpm test` 4,552 pass 0 fail + turbo 135/135; live composed suite ran vs current prod → § below; chain-tip live owed → `D-CAP.2-2` |
| 2 | Full JOURNEY.1 registry on deployed prod, every step expected green; still-red steps xfail w/ D-ids | **PARTIAL→classified** | 18 green / 3 owed (T3 D-STB.5a-1/-2, T7 D-STB.5a-3, T8 D-P1.18-1) / 3 fail→`D-OBS.1-3` (N4,N9), `D-CAP.2-3` (P1) / 21 paid-skips→`D-CAP.2-1` — every non-green starts with a D-id |
| 3 | Deterministic composed path | **MET** | `pnpm test` 448/4,552/0-fail; `turbo build lint typecheck` 135/135 |
| 4 | SEC.1 two-tenant probe, $0, live | **MET** | `passed:true, findings:[]` — 8 routes × 2 tenants + 2 write probes; real magic-link sessions |
| 5 | One paid new-visitor journey incl. trial Review (guard-permitting) | **environment-blocked** | verbatim refusal `$58.08 ≥ $5` → exit 3 pre-browser, $0 spent → `D-CAP.2-1` w/ resume command (reset 2026-10-05) |
| 6 | REQ-SPEC-32(c) calibration regenerated; admissible count honest | **MET (honest 0)** | 198 obs, **0 admissible** (116/64/18 inadmissible); 0 reports; defaults stand → `D-ECON.1-3` note |
| 7 | Walk CAP.1 gap targets at $0; xfail the rest | **MET (where reachable)** | suite = the $0 walker (24 steps incl. REQ-ACCT-3's T3); `D-CAP.1-2` live-stream half verified (37/37 catalogued) — instrumented half → CAP.3; `D-CAP.1-1` unreachable at $0 → CAP.3 |
| 8 | `COMPOSED_E2E_REPORT.md` commands + observed signals | **MET** | `docs/build/COMPOSED_E2E_REPORT.md` §0–8 |
| 9 | Every environment block w/ closer + operator routing | **MET** | `D-CAP.2-1` (weekly reset/override), `D-CAP.2-2` (pulumi login→up→provenance→re-run), `D-CAP.2-3` (product fix) — all routed |
| — | Out-of-scope confirmed not implemented | **confirmed** | no product code changed (P1 defect filed, not fixed); no deploy attempted post-401; no canonical/prod user-state mutation; mergePolicy=OPERATOR respected |
| — | Cross-cutting invariants | **held** | append-only (all edits appends/dated notes); secrets never committed (`.scratch` gitignored; sessions never in tree); canonical vocabulary; no banned strings |

## Evidence log

| leg | command | observed signal |
|---|---|---|
| provenance | `curl https://api.rhema.tools/healthz` + web | `build.gitSha = b909fe9a802867064317b57ea573c018e6d83332` on both |
| deploy state | `pulumi whoami` | `PULUMI_ACCESS_TOKEN must be set` — stored token 401s (D-CITE.1-1) |
| weekly guard (system role) | `cap2-system-query.mjs` `sum(list_cost_usd) … is_test … source='proxy' ts ≥ 2026-09-28` | `$58.07792` / 1,675 rows |
| paid dispatch attempt | `rhema-journeys --stage prod --paid --steps N5` (system `JOURNEY_DATABASE_URL`) | `spend guard refused: weekly metered spend $58.08 has reached the $5 cap` → exit 3 |
| REQ-SPEC-32(c) harvest | `DB_URL=<system> tsx integration/.scratch/econ1-harvest.mts 2026-10-02T07:34:00Z` | harvested 55 → 198 obs; admissible 0 (116 no_proxy / 64 not_completed / 18 pre_preset_fix); 46 cells; 0 reports |
| emission audit vs live stream | distinct `analytics_events.event` (system role) vs `ANALYTICS_EVENT_NAMES` + `BETA_EMISSION_AUDIT` | 37/37 catalogued; 0 uncatalogued; 0 beta_absent drift |
| SEC.1 probe | `two-tenant-probe.ts --base-url https://api.rhema.tools --web-url https://rhema.tools` w/ 2 magic-link sessions | `passed:true`, `findings:[]`, 8 routes + 2 write probes |
| deterministic tree | `pnpm turbo build lint typecheck` | 135/135 green (FULL TURBO) |
| deterministic tree | `pnpm test` | **448 files pass / 1 skip; 4,552 tests pass / 4 skip / 0 fail** (~515 s) |
| JOURNEY.1 suite vs current prod | `rhema-journeys --stage prod --expect-sha b909fe9a… --out docs/build/reports/2026-10-04_CAP.2-journeys` (app-role `JOURNEY_DATABASE_URL`) | nonce `1218d1acdedd`; **18 pass / 3 owed / 3 fail / 21 paid-skip**; provenance match; $0 |
| P1 defect probe | read `packages/tokens/src/ide-css.ts` + `git show 9f94621:…` | base `.ide-actions a{min-height:24px}` declared AFTER the `<768px` 44 px rule, equal specificity ⇒ override dead; live measure 105×25 px |

## Evidence report

**Primary artifact:** `docs/build/COMPOSED_E2E_REPORT.md` — provenance, per-step classification
(45 rows, every non-green D-id'd), SEC.1 probe, guard refusal verbatim, calibration counts,
CAP.1-gap walk, honest non-claims, spend/cleanup.

**Suite artifacts:** `docs/build/reports/2026-10-04_CAP.2-journeys/report.json` + 8 PNGs.

**Headline:** deterministic composed path fully green (4,552/0); live composed path **not green** —
classified to `D-OBS.1-3` (N4/N9 pre-existing substrate drift), `D-CAP.2-3` (new shipped-CSS
defect), `D-CAP.2-1` (21 paid steps + the paid journey — weekly guard), `D-CAP.2-2` (chain-tip
suite — Pulumi 401). No fabricated green anywhere; nothing marked green that wasn't observed.

**D-rows written/touched:** `D-CAP.2-1`, `D-CAP.2-2`, `D-CAP.2-3` (new, appended);
dated re-confirmations on `D-OBS.1-3`, `D-ECON.1-3`, `D-CAP.1-1`, `D-CAP.1-2`.

**Spend:** CAP.2 metered $0 (weekly $58.08 unchanged — guard refused every dispatch).
**Cleanup:** IAP tunnel closed; `.scratch` sessions/DSNs uncommitted; flagged test tenants are the
designed throwaway fixtures (suite nonce `1218d1acdedd`, probe pair `cap2a/b`).
