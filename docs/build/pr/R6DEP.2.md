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

**What changed.** `infra/pulumi/Pulumi.prod.yaml` digest pins → `e04a8c8`;
`packages/journeys/src/registry.ts` `R10.keepalive` `expected:"red"→"green"` on live
evidence (+ the baseline test's green set); `.github/workflows/journeys.yml` one-line
suite-exec fix (F-R6DEP.2-1 layer 3 — the own-bin `pnpm exec` invocation can never
resolve; replaced with `node packages/journeys/dist/cli.js`); build memory (run ledger,
this PR body, BUILD_INDEX row 225, LEDGER CURRENT STATE/OPEN FINDINGS/PHASE LOG,
DEFERRALS dated notes, GATE-LAUNCH threshold-5/6 dated notes) +
`docs/build/reports/2026-10-26_R6DEP.2/` evidence. No shipped product code.

**Deploy authority.** GD-DEPLOY.R6 pre-authorizes `pulumi up --stack prod` on four
conditions — each evidenced in `reports/…/prod-preflight/` BEFORE the up: (1) preview
classification — zero replace/delete on stateful resources; (2) additive-migration lint
(zero migrations in `80db0d5..e04a8c8`); (3) cost delta ≤ $15 (image rolls only);
(4) provenance plan → `check-deploy-provenance --expect e04a8c8…` all-PASS after.

**Verification.**

- **Deploy GREEN:** Cloud Build `a8d53c59` all-10 images @ `e04a8c8` → ten digests
  pinned → `pulumi up --stack prod` **update 163** (11 updates + 1 stateless-proxy
  InstanceTemplate replace; zero stateful replace/delete; $0 delta) → provenance
  all-PASS on `rhema.tools` + `api.rhema.tools` (`/healthz` = `e04a8c8…`) →
  `deployments` row `prod:e04a8c8…` with protocols `0.4.0+ec61156725a895ab` + all ten
  digests (system-DSN tunnel).
- **Smoke GREEN ($0):** public routes 6×200 `data-renderer="ssr"`; api healthz;
  signed-in `R8.inbox` + `T2.badge` PASS; SSR arm `N10` + `P1.public` PASS; worker
  consuming (`run.walkthrough` + billing cron in prod logs).
- **D-R6SECR.1-2 CLOSED:** `Strict-Transport-Security: max-age=31536000;
  includeSubDomains` live on `https://rhema.tools/` (200) and
  `https://api.rhema.tools/session` (401).
- **D-SEC.2-1 discharged:** the operator's `r6-*` code (env-only, never committed —
  scrubbed + history rewritten after an early slip; F-R6DEP.2-2, operator revoke ask
  outstanding) → `N1` + `N2.invite` PASS → `invites.used_count` 0→1 + one
  `invite_redemptions` row, verified over the tunnel. D-PRB.01-1 dated tail.
- **D-SPA.24-1 DONE:** posture stage `pr-219` (sslip.io SANs ACTIVE after a
  `FAILED_NOT_VISIBLE`→`--replace` recovery; `COLLAB_WS_URL` live) → `N8` PASS +
  `R10.keepalive` `ready-to-flip` → `expected:"green"` — same `data-page-session`
  AND pre-leave ⌘Z intact across the remount (F-R6POST.2-2's fix live-proven).
  Stage destroyed to zero (196/196 — trailing subnet freed after ~80 min of the
  managed serverless-reservation GC, retried per R6POST.2) + `rm` + LB-address
  released + orphan sweep ZERO across 25+ classes; spend ≈$2–4 ≤ $8.
- **D-OPS.1-1 dated tail** (keepalive arm discharged; N9's funded-tenant substrate
  residual stays) · **D-R6SECR.1-1 dated tail** ((a)/(e)/(f) live-evidenced; hostile
  fixture legs (b)/(c)/(d)/`egress.denied` carried — no bounded-spend authorization).
- **Threshold-6:** three `workflow_dispatch` runs on the tip ref (`stage=prod`,
  `paid=false`) — `40349459730` vars unset → `40361523387` WIF template condition
  → `40363400137` authed, failed at the suite exec (`pnpm exec` own-bin bug).
  F-R6DEP.2-1: layers 1–2 repaired live (repo vars + `attributeCondition` →
  `SteveVitali/Rhema`); layer 3 fixed on this branch — **unprovable pre-merge by
  ADR-114 design** (workflow paths are non-neutral ⇒ a fix-carrying ref fails strict
  provenance vs deployed `e04a8c8`). The post-merge `main` dispatch is the real arm.
  $0 — zero legs ran in any dispatch; the local $0-leg equivalents passed on the
  deployed SHA.
- **Threshold-5:** dated note — `80db0d5..e04a8c8` is non-protocol-affecting under
  `docs/ops/golden-rerun-rule.md`; the re-run rule does NOT re-arm (validated SHA
  stays `80db0d5`'s green cohort).
- **Gates:** `pnpm turbo build lint typecheck` 135/135 · `pnpm test` full suite green
  (registry baseline updated post-flip; 9/9) · all `check:*` gates ·
  `check-build-memory.sh` 0 violations · `check-append-only.mjs --base c1f20f5` OK ·
  ci-boundary `logs/ci-R6DEP.2.json`.
- **Spend:** prod legs $0; posture stage ~2.5 h lifetime (Cloud Run + AlloyDB +
  Redis + GKE while held) ≤ ~$5 estimate, swept to zero.

**Merge.** Stays OPEN — `mergePolicy: OPERATOR`; the operator merges bottom-up.

## Acceptance → evidence

| Ask | Evidence |
| --- | --- |
| Deploy `e04a8c8` to prod under GD-DEPLOY.R6 | `reports/2026-10-26_R6DEP.2/prod-preflight/` + `pulumi up` update 163 + provenance all-PASS + `deployments` row |
| Post-deploy smoke | `prod-smoke/report.json` (R8.inbox, T2.badge) + `prod-ssr-leg/report.json` (N10, P1.public) + public-route 200s + worker logs |
| HSTS live (D-R6SECR.1-2) | `prod-smoke/hsts.txt` curls — header on both origins |
| Invite consume (D-SEC.2-1) | `invite-leg/` — used_count 0→1 + one redemption row, tunnel-verified |
| R10.keepalive re-arm (D-SPA.24-1) | `posture/report.json` — ready-to-flip on pr-219; registry flipped |
| §12.8 tail (D-R6SECR.1-1) | dated DEFERRALS note — (a)/(e)/(f) evidenced; (b)/(c)/(d)/egress.denied carried |
| Threshold-6 dispatch | runs `40349459730`/`40361523387`/`40363400137` + F-R6DEP.2-1 repairs |
| Threshold-5 golden note | GATE-LAUNCH readout dated note — non-protocol-affecting |
| Rollback | `reports/2026-10-26_R6DEP.2/rollback-recipe.md` |
