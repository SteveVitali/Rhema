# r7deploy-main — post-merge prod deploy @ `ebfd33f2` records

Run-time insert (the R7DEP.2/3 + r7deploy-composed precedent): the post-merge prod deploy of the
merged-`main` tip `ebfd33f2d06aff5d1e387fd50ac3d62eb73d8015` under `GD-DEPLOY.MAIN` — the operator's
2026-11-12 verbatim ruling *"…I authorize pulumi up at merged main tip…"* (relayed by the
orchestrator; not yet committed when the run opened — recorded verbatim in GATE DECISIONS by this
run). Prod `ee40639d` → `ebfd33f2`; the entire merged stack through #332 (every R6 tail row, inserts
255–260, R7b).

## Eight-condition discipline (all evidenced; full log set in `docs/build/logs/r7deploy-main/`)

1. Preview evidence carried honestly (pr-293 walk/teardown + three proven deploys; the payload's
   product delta is the deploy-bound ops fixes — no preview could have proven them earlier).
2. Cloud Build `ddc437fa` SUCCESS — all-10 @ `ebfd33f2` → `rhema-prod` AR; run-task vendored-SDK
   context + in-build contents asserts green. Digests re-verified per-service against AR.
3. `pulumi preview --diff` classified: **10 updates + 1 replace, zero deletes, 169 unchanged** —
   9 image rolls + the MIG version pin; the one replace is the stateless `rhema-prod-proxy-tmpl`
   InstanceTemplate (the identical class accepted at every prior deploy). Zero stateful touches;
   zero `packages/db` paths in the payload → additive-migration clause vacuous; cost Δ≈$0 ≤ $15.
4. `pulumi up --stack prod` — **update 177**, 10 updated + 1 replaced, 1m30s, zero destructive;
   proxy MIG rolled (`m4g8`/`g556` → `t1m0`/`nrqg`).
5. `check-deploy-provenance` all-PASS — web + api both report `build.gitSha = ebfd33f2`.
6. `deployments` row `prod:ebfd33f2…` recorded over the operator IAP tunnel
   (`protocols_version=0.4.0+9c2b880dbee74bd8`, all-10 digests).
7. Committed rollback recipe (revert, or re-pin the `ee40639d`/build-`4e7ae7f5` digest set — still
   in AR) + corpus-in-web-image in-build assert (Dockerfile `RUN test -s` at `#15 [builder 9/9]`,
   provenance-matched web digest `aacb7d42…`).
8. CDN invalidation `/bff/p/demo~*` on `rhema-prod-urlmap-6f2b86e` recorded (dry-run == act).

## Deployed re-proofs (the point of this deploy)

- **BL-112 / `D-BL38.1-2` — live-verified PARTIAL.** The first hourly `test-tenant.purge` tick on
  the deployed revision ran 260's watchdog verbatim:
  `[worker] project.purge.sweep → {"scanned":1,"rearmed":["01M3SK38…"]}` — GD-R6OPS.3-1 arm (a)
  executed live. The re-armed purge then **FAILED ×3 loudly** on `claims_draft_id_fkey` (draft
  `01M3SK386XX5RXA8W95HV83ZTF` holds 16 `claims` rows): the exact throw that silently killed the
  original armed job on 10-30 — the loss class is now proven end-to-end, and every attempt logged
  (260's loud logging works). It also surfaced a **new live-verified defect — `F-R7DEPMAIN-1` →
  BL-113:** `handleProjectPurge`'s `delete from projects` cascade assumption misses ~12 NO-ACTION
  leaves (prod `pg_constraint` read verbatim — claims/findings/correspondence/obligations/
  gates→steps/live_doc copies/promoted_version/self-FKs); any project that ran a Review is
  unpurgeable by the current handler. The tombstone survives → `D-BL38.1-2` and BL-112 stay OPEN;
  each hourly tick re-arms + fails loudly until BL-113 lands. A manual clear is a one-off prod
  write — operator-paused, not done.
- **`D-R6OPS.1-1` — dated disposition.** The 257 deny-degrade is deployed (worker rev `00089-tnk`);
  its live criterion rides the next `usage.reconcile` firing `2026-11-16T03:15Z` (past this
  window — recipe committed on the row; pre-deploy baseline of 5 consecutive daily 403 `failed`
  rows captured for contrast).
- **259** — the fixture fix now rides `main` and is deployed; the nightly cron's green is its own
  record — not claimed.

## Spend

Cloud Build ~24 min (~$1.1 list) + `pulumi up` Δ≈$0 + prod `BEGIN READ ONLY` reads $0. Golden
classified **non-affecting** (worker ops/billing/maintenance jobs only — no protocols/run-path/
harness/egress-proxy/security boundary). No funded/paid arms.

## Records

`runs/r7deploy-main.md` (run ledger + rollback recipe + re-proof verdicts) · BUILD_INDEX row 320 ·
LEDGER PHASE LOG `done` + GATE DECISIONS `GD-DEPLOY.MAIN` · DEFERRALS dated tails on `D-R6OPS.1-1` /
`D-BL38.1-2` / `D-ECON.1-1` · BACKLOG `BL-113` opened + `BL-112` dated note · `Pulumi.prod.yaml`
re-pin comments. `nextTicket`/`lastCompleted` **UNCHANGED** — the committed chain is exhausted.

Merge: OPERATOR (a run never merges itself).
