# R6DEP.2 — Tip deploy to prod + post-deploy re-proofs

**Summary.** Operator-directed insert (no manifest ticket): deploy the pushed chain tip
`e04a8c8` (the R6INF.2 tip — findings fixes + infra) to prod under the GD-DEPLOY.R6
pre-authorization, then run the post-deploy re-proof legs that the tip's fixes arm: the
HSTS live-curl tail (D-R6SECR.1-2), the operator-minted prod invite's first consume
(D-SEC.2-1), and the R10.keepalive semantic re-arm on a domains-bearing posture stage
(D-SPA.24-1 residual — the session-owned UndoManager fix, F-R6POST.2-2). Plus the
§12.8 honest tail (D-R6SECR.1-1) and the threshold-6 dispatch evidence (journeys.yml
`workflow_dispatch` on the tip ref — a manual dispatch of the nightly $0 legs on the
deployed SHA, not "nightly on main").

**What changed.** `infra/pulumi/Pulumi.prod.yaml` digest pins → `e04a8c8`; build memory
(run ledger, this PR body, BUILD_INDEX row, LEDGER phase log, DEFERRALS dated notes,
GATE-LAUNCH dated notes) + `docs/build/reports/2026-10-26_R6DEP.2/` evidence. No
product code.

**Deploy authority.** GD-DEPLOY.R6 pre-authorizes `pulumi up --stack prod` on four
conditions — each evidenced in `reports/…/prod-preflight/` BEFORE the up: (1) preview
classification — zero replace/delete on stateful resources; (2) additive-migration lint
(zero migrations in `80db0d5..e04a8c8`); (3) cost delta ≤ $15 (image rolls only);
(4) provenance plan → `check-deploy-provenance --expect e04a8c8…` all-PASS after.

**Verification.** _(filled at close — deploy outcome, per-leg verdicts, CI line.)_

## Acceptance → evidence

_(condensed table lands at close; the run ledger `docs/build/runs/R6DEP.2.md` is the
source of truth.)_
