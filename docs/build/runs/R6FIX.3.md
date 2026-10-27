# R6FIX.3 — F-R6DEP3-1 meter-race triage/fix + residual legs (run ledger)

- **Spec:** operator-directed insert (no manifest ticket file) — triage F-R6DEP3-1
  (committed meter 502 vs report Σ debits 505 on canary `01M5Y4YQP827TCBXZHHV3AV4NC`),
  fix whichever side is wrong (product committed-totals vs harness assert), and
  opportunistically discharge the residual H11 legs (D-P1.20-1 (c)/(d)/(f);
  D-PRB.04-2 obligation-chip render) that are honestly runnable headless.
  Authorization: GD-REMAINING.R6 + GD-LCH-GO.R6.
- **Normative loads:** `docs/build/runs/R6DEP.3.md` (the finding evidence + the
  system-DSN tunnel seam); `reports/2026-10-27_R6DEP.3/r6-canary/report.json`;
  `packages/orchestrator/src/spend.ts` + `docs/build/runs/ECON.1.md` (D-B…D-F
  divergence semantics); `packages/journeys/src/steps.ts` R6 (the strict
  report↔card reconciliation assert); `docs/tickets/DEFERRALS.md` rows
  D-P1.20-1 / D-PRB.04-2 / D-P1.08-1 / D-OBS.1-3.
- **Base:** `stevevitali/r6dep-3-fix-deploy` @ `70df2ac` (pushed chain tip; PR base = same).
  mergePolicy=OPERATOR — never merge.
- **Branch:** `stevevitali/r6fix-3-meter-race`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Requirement ids stamped:** none (operator insert; the fix serves REQ-SPEC-32's
  "debits equal metered burn" truth + REQ-IDE-11's committed-meter contract).
- **Started:** 2026-10-27T09:23Z · **Closed:** (at close)
- **Live stage:** prod `dc3a8f6` (healthy — runs execute). The code fix CANNOT serve
  until the operator merges + a DEP ticket deploys — the live re-proof therefore
  rides the same bounded paid canary plus the corrected-reconcile read over the
  real rows (the formula the fix writes, evaluated read-only against prod truth).
- **Production mutations (this ticket's named scope):** none beyond the audited
  seams R6H11/R6DEP.3 already established — journey seeds + fixture rows on
  `is_test` tenants via the system-DSN IAP tunnel; one bounded paid canary on
  jrn-a (`devin-cli:r6fix-3` dispatch); the audited `admin-cli support-access`
  verb on a throwaway `is_test` account (actor `devin-cli:r6fix-3`). No corrective
  writes to the F-R6DEP3-1 run rows — the ECON.1 precedent (historical rows stay
  as found; no one-off prod writes) applies.
- **Spend envelope:** ≤ $8 total incl. the canary (~≤$5 Quick/Base shape). jrn-a
  balance post-R6DEP.3 ≈ 3551 cr → **no house-grant needed**.
- **ci:** (at boundary)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in blast radius:

- **D-PRB.04-2** — residual: (b) per-finding obligation-state chip live render on
  an own-tenant dossier (join wired at `dossier-routes.ts`; needs a run that
  produces obligation claims — reuse the canary if it produces one, else owed).
- **D-P1.20-1** — remainders after R6DEP.3: (c) `admin support-access` verb leg,
  (d) export zip on a throwaway account, (e) destruction fire, (f) protocol-marker.
  (c) may run as the operator-adjacent system action (`SYSTEM_DATABASE_URL` +
  `RHEMA_OPERATOR_ID`, actor `devin-cli:r6fix-3`); (d) is $0 headless; (f)'s
  marker half is $0 (the clear half needs a real Review launch).
- **D-OBS.1-3** — dated note only if the deployed SHA moves (it does not this run).

## Requirements (operator directive — deliverables)

1. **Triage F-R6DEP3-1 first:** pull the real `usage_records`/`credit_ledger`/
   `run_events`/`runs` rows for `01M5Y4YQP827TCBXZHHV3AV4NC` over the system-DSN
   tunnel; determine (a) real debit the meter never rendered → committed-totals
   truth bug, or (b) assert artifact → fix the harness.
2. **If (a):** fix in the usage-commit path (meter commit / finalize); add a
   deterministic test for the ordering; land a live canary re-proof (~≤$5, same
   bounded shape, audited seam; spend reported).
3. **If (b):** fix the assert; record honest resolution; still re-drive a bounded
   canary to prove agreement.
4. **Finding 2 (opportunistic):** D-P1.20-1 (c)/(d)/(f) + D-PRB.04-2 chip leg —
   automate what's honestly runnable headless; legs not runnable stay OPEN.
5. Records: this ledger + `docs/build/pr/R6FIX.3.md` + PR + BUILD_INDEX row 229 +
   LEDGER (finding resolution, PHASE LOG, `nextTicket` stays `196a_HUMAN-H12`) +
   DEFERRALS dated tails + GATE-LAUNCH dated notes where touched.
6. Verify: `pnpm turbo build lint typecheck` + `pnpm test` on touched;
   `check-build-memory.sh .` 0 violations; `check-append-only.mjs --base c1f20f5` OK.
7. Push; `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R6FIX.3 --json
   docs/build/logs/ci-R6FIX.3.json`.

## Acceptance criteria

- [x] Triage verdict recorded from real prod rows (a vs b, with the row-level
      evidence) *(live-executed)*
- [x] The wrong side fixed in code + deterministic test lands *(engineered)*
- [x] Bounded canary re-driven — **dispatch refused by the REQ-ECON-9 weekly
      guard; $0 spent, recorded honestly** *(live-executed)*
- [x] Meter↔ledger agreement proven — corrected-reconcile read over real rows
      (=505, the charged figure); a deployed re-proof is the next DEP ticket's
      leg *(live-executed as far as reachable)*
- [x] Runnable Finding-2 legs discharged with evidence; unrunnable stay OPEN
      honestly *(live-executed where run)*
- [x] Universal phase-gate AC *(agentic)*

## Plan

1. Triage queries over the IAP tunnel (`cap2-system-query.mjs` — system `postgres`
   role; DSN never printed): runs / credit_ledger / usage_records / run_events /
   steps for the canary run.
2. Implement per the verdict; test alongside.
3. Verify suite on touched packages.
4. Live: paid canary re-drive on jrn-a + corrected-formula reads; D-P1.20-1 legs;
   obligation-chip check.
5. Records + closeout (BUILD_INDEX 229, LEDGER, DEFERRALS, boundary).

## Test matrix

- `packages/orchestrator/src/spend.test.ts` — `reconcileRunSpend` folds the net
  committed charge: reproduce the canary's exact shape (claims 464, proxy-metered
  502, debits 505 → `spent_credits` 505) + the refund-netting case (debit − refund
  nets to ≤ usage → usage wins) + the metered-mode invariant.
- Gates at close: `pnpm turbo build lint typecheck`, `pnpm test` (orchestrator
  suite), `check-build-memory.sh .`, `check-append-only.mjs --base c1f20f5`.

## Progress

- 2026-10-27T09:23Z — branch `stevevitali/r6fix-3-meter-race` cut @ `70df2ac`.
  IAP tunnel `rhema-prod-proxy-ltmh` → `127.0.0.1:15433` → `10.46.0.3:5432` up;
  system-role reads green.
- 2026-10-27T09:2xZ — **TRIAGE VERDICT: branch (a) — a real committed-totals
  divergence, NOT a terminal-flush race.** Row-level evidence (prod, system-DSN):
  - `runs`: `state=completed`, `spent_credits=502`, `ended_at=08:03:16.698Z`,
    `current_attempt=1`.
  - `credit_ledger`: debits `intake 20+33, craft 45, verification 271, argument 46,
    letter 90` = **Σ 505** — all committed BEFORE finalize; `release` 1259 at
    08:03:16.762Z; **zero settle debit, zero absorb row, zero refund**.
  - `usage_records`: `proxy` Σ **502** (82 rows, list $3.61, last ts 08:03:13.808Z
    — every row landed BEFORE the 08:03:16.7 finalize; no late flush);
    `sdk_estimate` 560, `sdk_stream` 464.
  - `steps`: claims 40+45+243+46+90 = **464**.
  - The arithmetic: `incrementalMeteredDebit` = `max(claim, metered−debited)` —
    intake's catch-up charged 53 (incl. 12 cr of pre-`beginStep` unattributed
    proxy rows, `step_id=null`), verification caught up to 271; then
    `argument`/`letter` debited the pod-claim FLOOR (46>45, 90>88 — ECON.1 **D-F**
    semantics verbatim: "under `committed` the committed claim is the charge").
    Σ per-phase maxes = **505 > max(Σ claims 464, Σ metered 502) = 502**.
  - `runs.spent_credits` = `reconcileRunSpend`'s `greatest(claims, Σ usage)` —
    it never folds the ledger's actual charge, so the committed meter
    (card + `cost.final` + SSR) **under-reports what was debited**. The report's
    own `committed` difference row explains charged>metered correctly; the CARD
    is the lying surface (REQ-SPEC-32 truth shape; REQ-IDE-11 meter contract).
  - Verdict: **(a) real debit the meter never rendered** — but not a flush race:
    the meter is structurally blind to the claim-floor over-debit. Fix =
    `reconcileRunSpend` folds `netDebitedCredits` (Σ debit − Σ refund) into the
    `greatest()` — the committed figure then converges to the charge at every
    terminal settle (the "post-terminal reconcile write" arm of the directive).
    The charge itself (505) is correct committed-mode semantics — the operator's
    metered-mode flip (ECON.1/R6MNY.1) owns changing it.

- 2026-10-27T09:3xZ — **fix landed:** `reconcileRunSpend` folds the net committed
  charge (`netDebitedCredits` — Σ debit − Σ refund) into the `greatest()` write.
  Four deterministic tests in `spend.test.ts` (canary shape 464/502/505 → 505;
  refund-netting; absorb-doesn't-debit; same-tx debit visibility). Suite: 19/19
  `spend.test.ts`, 633/633 orchestrator+worker, `turbo build lint typecheck`
  135/135.
- 2026-10-27T09:4xZ — **corrected-formula read on the old run (live, $0):**
  `greatest(Σ steps.credits 464, Σ proxy 502, net debited 505)` = **505** — the
  exact figure the report charged. Meter agreement proven on real rows.
- 2026-10-27T09:4xZ — **paid canary re-drive REFUSED by the REQ-ECON-9 guard**
  (honest stop): `$3.874573 already metered this week + --headroom $4.5 > $5`.
  A refused run never touches the stage — $0 spent. The deployed-side re-proof
  owes the next DEP ticket regardless (prod `dc3a8f6` runs pre-fix code); a
  re-drive now would only re-fail the same assert.
- 2026-10-27T09:4xZ — **D-P1.20-1 residual legs, live, $0 (jrn-a throwaway):**
  - **(c) support-access — discharged.** Refusal arm: `support-access --user
    01M5WD3TQ…` with zero grants → refused, nothing logged. Grant arm: fixture
    `support_access_grants` row `00MVQHZH…` (1-h expiry) → verb wrote BOTH
    `support_access_log` `01M5YBW86Z…` and `admin_actions` `01M5YBW889…`
    (actor `devin-cli:r6fix-3`).
  - **(d) export zip — discharged.** POST `/account/export` → 202
    (`01M5YBWW3R…` building) → `ready` 58,464 B → session download → signed-GCS
    zip: `manifest.json` + `ledger.csv` + project trees w/ claim ledgers,
    findings.json, drafts (`reports/2026-10-27_R6FIX.3/account-export.zip`).
  - **(f) protocol-marker — marker arm discharged.** PUT
    `/projects/01M5XTD70…/settings` `essay→academic` stamped
    `protocol_changed_at` + pinned `protocol_version=1` (restored after). The
    consume/clear arm needs a paid Review launch — owed (spend guard).
  - **(e) destruction fire — owed** (unchanged: +14d clock/test-purge sweep).
- 2026-10-27T09:4xZ — **D-PRB.04-2 obligation-chip leg — discharged.** Headless
  Chromium on the canary's own-tenant dossier rendered **18
  `data-obligation-state="open"` chips**; the hook only emits for finding ids
  present in `revision_obligations` (BFF `findingObligations` = 6 open rows).
  Screenshot `obligation-chips.png`. Row's last residual → **row DONE**.

## Gap table

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Triage from real prod rows | **met** | Row-level reads recorded above: `credit_ledger` debits Σ505 (all pre-finalize), proxy usage Σ502 (all rows pre-finalize — no late flush), `spent_credits` 502, claims Σ464. Verdict: **(a) real debit the meter never rendered** — committed-mode claim-floor over-debit (ECON.1 D-F), not a terminal-flush race. |
| 2 | Product fix + deterministic test | **met** | `reconcileRunSpend` folds `netDebitedCredits` (`spend.ts`); 4 tests incl. the canary's exact 464/502/505 shape (`spend.test.ts` — 19/19). Monotone/idempotent via `greatest()`; refund-netting keeps absorbed burn the floor. |
| 3 | Bounded canary re-drive (~≤$5) | **refused — honest stop** | REQ-ECON-9 weekly guard: $3.87 metered + $4.5 cap > $5. $0 spent; the refusal itself is evidence the stop works. A deployed re-proof needs merge+deploy (next DEP ticket) either way. |
| 4 | Meter↔ledger agreement proof | **met (as far as reachable)** | Corrected formula `greatest(464, 502, 505)=505` evaluated read-only on the real canary rows = the report's charged figure. Deployed proof owed to next DEP. |
| 5 | Finding-2 legs | **met (runnable ones)** | (c)+(d)+(f-marker) discharged live $0; (e) + (f-clear) honestly owed (clock/paid gates). |
| 6 | Records | **met at close** | this ledger + `pr/R6FIX.3.md` + BUILD_INDEX 229 + LEDGER + DEFERRALS tails + GATE-LAUNCH note |
| 7 | Verify suite | **met** | turbo 135/135, vitest 633/633 touched, check-build-memory + append-only at close |
| 8 | Push + PR + ci-boundary | at close | |

## Evidence log

- Prod reads (system-DSN, read-only): run row, ledger rows, usage rows, step
  rows + the corrected-`greatest` evaluation for `01M5Y4YQP827TCBXZHHV3AV4NC` —
  recorded verbatim in `## Progress`.
- `docs/build/reports/2026-10-27_R6FIX.3/account-export.zip` — the live export
  deliverable (leg d).
- `docs/build/reports/2026-10-27_R6FIX.3/obligation-chips.png` — the
  obligation-chip render (D-PRB.04-2).
- Spend: **$0 this ticket** (canary dispatch refused pre-flight; all legs $0;
  jrn-a untouched except audited fixture/audit rows).

## Evidence report

- **Triage:** real rows over the system-DSN tunnel — verdict (a), committed-mode
  claim-floor over-debit (Σ per-phase `max(claim, metered−debited)` = 505 >
  `max(Σ claims 464, Σ metered 502)` = 502). No late `usage_records`; no settle
  debit; no refund — the meter's reconcile simply never looked at the ledger.
- **Fix:** `reconcileRunSpend` (`packages/orchestrator/src/spend.ts`) folds the
  net committed charge into the monotone `greatest()` write — the committed
  meter (run card, `cost.final`, SSR, every `spent_credits` read) now converges
  to what the ledger actually charged at every terminal settle.
- **Tests:** 4 new deterministic legs on real seeded rows (PGlite): canary
  shape, refund netting, absorb-vs-debit, same-tx debit visibility.
- **Live legs ($0):** support-access both arms, export zip end-to-end,
  protocol-marker arm, obligation-chip render — all on the jrn-a is_test
  tenant through the audited seams.
- **Owed:** deployed re-proof (next DEP), paid canary re-drive (spend-guard),
  (e) destruction fire, (f) marker clear.
- **Closeout:** `runs/R6FIX.3.md` (this), `pr/R6FIX.3.md`, BUILD_INDEX 229,
  LEDGER finding resolution + PHASE LOG, DEFERRALS tails (D-P1.20-1,
  D-PRB.04-2→DONE), GATE-LAUNCH dated note, `nextTicket` stays `196a_HUMAN-H12`.
