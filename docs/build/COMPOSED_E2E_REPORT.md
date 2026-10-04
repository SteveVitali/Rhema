# CAP.2 — Composed end-to-end verification report

**Ticket:** `docs/tickets/87_CAP.2__capstone-composed-verification.md` · **Branch:** `stevevitali/cap-2-composed-verification` · **Chain tip under test:** `b8b9ec0` (+ this ticket's docs-only head) · **Run:** 2026-10-04, ~07:34–09:10 UTC · **CAP.2 metered model spend: $0** (every paid leg refused pre-dispatch by the weekly guard; every executed leg was a $0 browser/API leg).

**Contract language being answered:** *"This ticket runs the whole build as one unit … the composed path runs green, or every non-green is an xfail/skip whose reason starts with a `D-*` id"*. This report is the honest ledger. **It does not claim a green build.** The honest headline: the deterministic composed path is fully green (4,552 tests, 0 failures); the live suite is **18 green / 3 owed-with-D-id / 3 fail → now classified to D-ids / 21 paid-skipped → classified to a D-id** against CURRENT prod; the paid composed journey and the chain-tip suite are environment-blocked with resume commands filed.

## 0. Provenance — what "current production" was

```bash
curl -s https://api.rhema.tools/healthz   # {"build":{"gitSha":"b909fe9a802867064317b57ea573c018e6d83332"},…}
curl -s https://rhema.tools/healthz       # {"build":{"gitSha":"b909fe9a802867064317b57ea573c018e6d83332"},…}
```

Both `/healthz` endpoints report **`b909fe9a`**, the DEF.4-era deployment. The chain tip `b8b9ec0` carries five undeployed tickets (CITE.1, ECON.2, STB.5a, STB.5b, CAP.1). Two deploys are owed (image pins already committed in `infra/pulumi/Pulumi.prod.yaml`); `pulumi up` is blocked on an expired Pulumi Cloud credential — operator `pulumi login` is the unblock (**D-CAP.2-2**, D-CITE.1-1, D-ECON.2-1). Every live signal below is therefore read as *current-prod evidence*, never as chain-tip evidence; no result is mislabeled.

## 1. Deterministic composed path — GREEN

| Command | Observed signal |
|---|---|
| `pnpm test` | **448 test files passed, 1 skipped (449); 4,552 tests passed, 4 skipped, 0 failed** (~515 s). Includes the SEC.1 two-tenant probe vitest, `emission-audit`/`analytics` suites, `cost-calibration` (admissibility + n≥5 floor + ≤10 % cap-reach pins), journeys 45-step registry wiring, and every package's colocated suite. Intentional 500-path log lines in `integration/src/two-tenant-probe.test.ts` are exercised assertions, not failures. |
| `pnpm turbo build lint typecheck` | **135/135 tasks green** (all packages build, lint, typecheck; remote-cache hits where applicable). |
| `pnpm check:licenses` | 745 deps scanned; allowlist-clean (last full read at CAP.1 on an unchanged dep set; re-run in the closeout gate). |
| `pnpm check:protocol-markers` | 54 markers, no protocol IP in public bundles. |
| `node docs/build/tools/check-append-only.mjs --base b8b9ec0` | Append-only invariants hold (run in the closeout gate; this ticket only appends). |
| `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` (and `--staged`) | 0 violations expected at closeout; re-run after every ledger/index edit. |

## 2. Full JOURNEY.1 registry suite vs current prod (`b909fe9a`)

```bash
rhema-journeys --stage prod \
  --expect-sha b909fe9a802867064317b57ea573c018e6d83332 \
  --out docs/build/reports/2026-10-04_CAP.2-journeys
# suite nonce 1218d1acdedd · started 07:56:58Z · finished 08:09:55Z (~13 min)
# provenance match (api+web) · weeklyMeteredUsd: 0 · spend $0 ≤ $5
```

Report: `docs/build/reports/2026-10-04_CAP.2-journeys/report.json` + 8 PNGs under `screens/`. **45 registered steps** (the registry lists 46 entries; `N2.invite` is the second assertion inside the N2 step id — the runner emits it as its own result row).

| Outcome | Count | Steps |
|---|---|---|
| **PASS (green)** | 18 | N1 N2 N2.invite N3 N7 N8 N10 R1 R5 R7 R8 C1 X1 T1 T2 T4 T5 T6 |
| **FAIL → owed to a D-id** | 3 | N4 → **D-OBS.1-3** (EST.1/ACT.1 sheet drift: `data-credits-line` selector vs `data-included` variant — 30 s timeout; re-confirmed, dated note appended) · N9 → **D-OBS.1-3** (BILL.3 fixture sub on stale billing account `01M3V0VJ…`; `/usage` renders, "Buy 1,000 credits" absent; pre-existing substrate drift) · P1 → **D-CAP.2-3** (*new live defect this run surfaced*: `.ide .ide-actions a` base `min-height:24px` declared **after** the `<768px` 44 px override at equal specificity ⇒ override dead at every width ⇒ "Edit source" measured 105×25 px at 390 px; filed-not-fixed per the defect rule, routed CAP.3) |
| **owed (expected-red, failed)** | 3 | T3 → **D-STB.5a-1** (emailed export token RLS 404) + **D-STB.5a-2** (import `artifacts_project_id_fkey` 500) · T7 → **D-STB.5a-3** (42501 pgboss read path) · T8 → **D-P1.18-1** (410-half clock-unreachable: 26 h tenant purge < 7 d token TTL; ADR-088 clock-leg rule) |
| **skipped (paid, no `--paid`)** | 21 | T9 N5 N6 N11 R4 R6 R9 T10–T16 B16 B17 B18A B18B B19A B19B B19C → all classified under **D-CAP.2-1** (weekly guard; each also carries its own owed row — D-P0.03-2, D-P0.08b-2, D-DEF.4-1, D-CITE.1-4, D-RES.1-2, D-P1.07-1, D-P1.19-1, D-STB.5b-*, D-P1.10-1/-P1.12-1/-P1.14-1, D-P1.21-2) |

**Classification completeness:** all 45 outcomes carry a green signal or a `D-*` reason. The three unexpected expected-green failures each resolve to a row — N4/N9 are *pre-existing substrate drift on the deployed image* (D-OBS.1-3, dated re-confirmation appended; a fresh deploy alone will not clear them — the EST.1/ACT.1 selector reconciliation and the BILL.3 account repair are the unblocks), P1 is a *real CSS defect in shipped code* (D-CAP.2-3), not a test bug and not a stale-build artifact — `9f94621` authored the losing order and it is still in the tip.

## 3. SEC.1 two-tenant probe — PASS ($0, live)

```bash
pnpm exec tsx integration/.scratch/cap2-mint-sessions.mts   # minted two flagged test tenants
   (cap2a / cap2b, real magic-link sessions via the test mailbox; sessions stay in .scratch, never committed)
PROBE_SESSION_A=<…> PROBE_SESSION_B=<…> \
  pnpm exec tsx integration/src/two-tenant-probe.ts \
    --base-url https://api.rhema.tools --web-url https://rhema.tools
# observed: PASS — /voices /projects /inbox /billing/usage list routes tenant-scoped;
#   foreign detail 404/deny; foreign refund write rejected; web /voices /app /app/inbox
#   /usage render own-tenant only; zero cross-tenant marker leakage.
```

The deterministic half also ran inside `pnpm test` (`two-tenant-probe.test.ts` — its 500-path log lines are exercised assertions). Fresh CAP.2 live evidence, not a cite of SEC.1's prior run.

## 4. Paid new-visitor journey incl. the trial Review — REFUSED PRE-DISPATCH ($0)

```bash
# guard measurement (system role — the app role reads $0 through usage_records RLS: D-STB.5b-1)
node integration/.scratch/cap2-system-query.mjs        # weekly metered: $58.07792 / 1,675 proxy rows, ISO week 2026-09-28
JOURNEY_DATABASE_URL=<system DSN> rhema-journeys --stage prod --paid --steps N5
# observed: "spend guard refused: weekly metered spend $58.08 has reached the $5 cap" → exit 3, pre-browser
```

ISO-week flagged-tenant metered spend is **$58.08 ≥ $5**; the guard fires correctly when bound to the truthful (system) DSN. No metered spend occurred — the refusal happened before a browser launched. **D-CAP.2-1** files the block: closes at the ISO-week reset **Mon 2026-10-05 00:00 UTC** (re-measure under the system role) or an operator override; resume command recorded in the row. This covers the contract's "one paid new-visitor journey including the trial Review, if the weekly guard permits it" — the guard does not permit it this week. R9's own row stays D-DEF.4-1.

## 5. REQ-SPEC-32(c) calibration regeneration — ran live, 0 admissible (honest non-adoption)

```bash
# IAP tunnel up → app-DB Secret Manager DSN →
DB_URL='postgres://…@127.0.0.1:15433/rhema' pnpm exec tsx integration/.scratch/econ1-harvest.mts
# observed: 198 observations harvested (55 new upserts over ECON.1's run — organic traffic accumulated)
#   admissible: 0   inadmissible: 116 no_proxy_rows · 64 not_completed · 18 pre_preset_fix
#   cap_calibration_reports: 0 rows · cost_card_cells: 46 measured cells (`econ1@2026-10-04`)
#   adopted multipliers: NONE — modeled defaults stand (1.5× hold / 1.35× tighten / 1.25× floor / 2× breaker)
```

Zero admissible samples is the truthful count — no `cap_multiplier` may honestly be adopted under `CAP_REFIT_MIN_SAMPLE=5`. This is recorded as *mechanism-green, adoption-blocked*: the harvest→cards→refit pipeline runs against the durable store, and the zero remains owed to **D-ECON.1-3** (dated note appended with the 198-observation re-measure), the admissible-sample path owed to **D-ECON.2-6/-7**. The tunnel was closed after the read; the scratch scripts live in gitignored `integration/.scratch/`; the harvest's own writes are the calibration store's designed contents (not user-state mutation).

## 6. CAP.1 gap-walk — what $0 could reach, and what stayed owed

The 2026-10-04 suite is itself the $0 walker: the 24 free steps exercised the un-walked PARTIAL surfaces the registry can reach — shell regions (N1–N3, P1), settings/billing surfaces (N4, N7–N9), public surfaces (R1, R5, R7, R8), claims/dossier (C1, N7), export download (X1, R5), and the headless STB.5a legs (T1–T8: session mint, sync idempotency **T5 re-PASS — zero new `sample_versions` on re-sync**, delete-leg T6, token/queue/clock legs T3/T7/T8 → owed rows). Direct progress on CAP.1's two findings:

- **D-CAP.1-2 (REQ-BETA-5 emission-audit coverage):** the *live-stream* half is now verified — all **37** distinct prod `analytics_events.event` names are present in the 67-name `ANALYTICS_EVENT_NAMES` catalogue and classified in `BETA_EMISSION_AUDIT` (zero uncatalogued emissions; zero events stuck `beta_absent`). Still owed: the zero-*uninstrumented-surface* half — surfaces that emit nothing leave no stream trace; needs an exercise-all-surfaces leg → routed **CAP.3**.
- **D-CAP.1-1 (REQ-IDE-1 deep-link layout restore):** walked-for-$0 assessment — still unreachable: its carrier leg T15 is `paid:true` (needs an open gate ⇒ a real run ⇒ the guard refuses this week), and no free tenant holds a finding/gate deep link. Stays OPEN → routed **CAP.3**.
- **AT-RISK seam (REQ-ACCT-3):** T3 re-ran → still owed on D-STB.5a-1/-2 — no drift, seam diagnosis stands.

Remaining un-walked PARTIALs are carried almost entirely by the 21 paid steps (D-CAP.2-1) or need non-journey surfaces; the composed report routes them wholesale to CAP.3 rather than fabricating reach.

## 7. What this run did NOT prove (stated plainly)

1. **Not the chain tip.** Every live signal above is `b909fe9a`, five tickets behind `b8b9ec0`. The chain-tip suite is owed to **D-CAP.2-2** (Pulumi 401 → operator login → `pulumi up` ×2 → provenance check → re-run). Until then "rhema works as a whole at the tip" is unproven, not green.
2. **Not the paid half of the registry.** 21 of 45 steps never executed (D-CAP.2-1); the paid new-visitor journey incl. trial Review is unproven this week.
3. **Not calibration adoption.** 0 admissible samples → defaults stand (D-ECON.1-3).
4. **A new defect exists in shipped code:** the phone action-row ≥44 px rule is dead CSS (D-CAP.2-3) — visible to any phone-width user on the project page today.
5. **N4/N9 substrate drift persists** (D-OBS.1-3) — the nightly-green story still needs the EST.1/ACT.1 selector reconciliation and the BILL.3 account repair; a redeploy alone does not close them.

## 8. Spend accounting & cleanup

- CAP.2 metered model spend: **$0** (guard refused every paid dispatch pre-browser; all executed legs $0). Weekly ceiling untouched.
- Infra: IAP tunnel opened for DB reads and **closed**; no Pulumi mutations attempted after the 401.
- Shared-store writes: two flagged `is_test` tenants (`cap2a`/`cap2b`) + the suite's `test+j<nonce>*` tenants (nonce `1218d1acdedd`) — designed throwaway fixtures; session cookies/DSNs never committed (`.scratch` is gitignored). Calibration-store rows written by the harvest are its designed contents.
- No canonical or production user state mutated.
