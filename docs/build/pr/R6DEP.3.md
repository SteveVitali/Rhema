# R6DEP.3 — fix deploy to prod + post-deploy re-proofs

**Summary.** Operator-directed insert (no manifest ticket): deploy the R6FIX.2 tip
`dc3a8f6` to prod under GD-DEPLOY.R6 — the tip carries the two live-finding fixes
(F-R6H11-2: run-task image missing the vendored agent SDK → **zero runs could
execute on prod**; F-R6H11-1: restore-point apply corrected stored state but never
converged the live collab runtime → reconnects/stale flushes resurrected
restored-away text) — then run the live re-proofs both findings owed post-deploy.

**Deploy authority.** GD-DEPLOY.R6 four conditions, each evidenced BEFORE `up` in
`docs/build/reports/2026-10-27_R6DEP.3/prod-preflight/`: (1) `pulumi preview --diff`
classified — 10 updates + 1 replace = **stateless egress-proxy InstanceTemplate
only**, zero stateful replace/delete; (2) additive-migration lint on 0059 PASS
(single `ADD COLUMN … DEFAULT 0`); (3) cost delta $0 ≤ $15; (4) provenance plan →
all-PASS after.

**Verification.**

- **Deploy GREEN:** Cloud Build `36964998` all-10 images @ `dc3a8f6` — the new
  fail-closed SDK gates ran end-to-end (context assert + post-build uid-10002
  probe: `run-task image assert: vendored agent SDK readable+executable`) →
  `pulumi up --stack prod` **update 164** → provenance all-PASS (`/healthz`
  `gitSha=dc3a8f6…` web+api) → `deployments` row `prod:dc3a8f6…` recorded →
  smoke green ($0): public 6×200 ssr, `R8.inbox`+`T2.badge`, `N10`+`P1.public`,
  worker consuming on the new revision.
- **Migration:** `0059_live_docs_y_epoch.sql` applied via `prod-migrate-seed.mjs`
  (additive-lint in-band) BEFORE the roll; `_migrations` row + `live_docs.y_epoch
  bigint not null default 0` verified over the IAP tunnel.
- **F-R6H11-2 → RESOLVED (live):** paid canary `01M5Y4YQP827TCBXZHHV3AV4NC` on
  the jrn-a is_test tenant — Quick/Base review launched through the real UI →
  GKE pod on `run-task@sha256:19c95a63…` → real SDK tool calls (Bash/Glob/Read/
  Write/Edit hooks in pod logs) → 92 metered `usage_records` → `completed`.
  Runs execute on prod again.
- **F-R6H11-1 → RESOLVED (live):** restore re-proof CONVERGED — UI restore apply
  bumped `y_epoch` 0→1 exactly once, stored `y_state` clean; the loaded
  runtime's post-restore flush wrote the next edit with the restored-away
  marker still absent (no resurrection); a stale y-indexeddb replica
  reconnecting through real SS1 saw restored content only.
- **D-PRB.04-2 meter half discharged:** in-phase committed-meter advance +
  provisional ≈ render + terminal card observed live on the canary.
- **D-P1.20-1 cheap arms ($0):** leg (b) email-change round-trip PASS; leg (e)
  delete schedule→banner→cancel PASS.

**Honest negatives (not hidden).**

- **F-R6DEP3-1 (new live finding, OPEN):** the canary's report charged **505 cr**
  vs the run card's terminal committed meter **502 cr** — a 3-cr debit the live
  meter never rendered (the R6 leg's strict `reportSpent > finalSpent` assert;
  suspected terminal-flush race). The leg's outcome is FAIL on that assert —
  the meter-advance evidence it gathered first is real and lands D-PRB.04-2's
  meter half.
- **Spend:** the canary debited **~$5.02** (Σ debits 505 cr, list $7.62) —
  over the ~$3 intent in the directive; a successful Quick review's honest cost
  (R6H11's $0.26 was an intake-fail abort). Recorded verbatim.

**Records.** `runs/R6DEP.3.md`; BUILD_INDEX row 228; LEDGER CURRENT
STATE/findings (F-R6H11-1/-2 RESOLVED; F-R6DEP3-1 OPEN)/PHASE LOG;
DEFERRALS dated tails (D-PRB.04-2, D-P1.08-1, D-P1.20-1, D-OBS.1-3);
GATE-LAUNCH threshold-1 (re-proof discharges) + threshold-5 (non-protocol
deploy — golden stays `80db0d5`, no re-arm) dated notes.
`nextTicket` stays `196a_HUMAN-H12`. mergePolicy=OPERATOR — this PR is never
self-merged.
