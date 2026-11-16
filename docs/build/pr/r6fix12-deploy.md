# r6fix12-deploy — post-merge prod deploy @ `040e36a9` under `GD-HOTFIX.R6`

The deploy arm of `262_R6FIX.12` (the F-15/BL-105 sign-up redirect-loop hotfix), executed
under the operator's 2026-11-15 verbatim ruling: *"…deploy through the documented prod deploy
path, with pre-state capture (current revision), rollback (re-point to the previous revision)
and post-deploy verification (N1/N3 against prod plus a manual GET of the redirect chain). I
authorize that deploy now, conditional on my merge and green CI."* — both conditions verified
at open: PR #337 `MERGED` 2026-11-15T23:27Z and all seven checks `SUCCESS`.

**Deploy SHA:** `040e36a9fd676fe2f9e17e44d87219cf97658c1d` (merged-`main` tip; prod
`ebfd33f2` → `040e36a9`). Carries 262's web/api redirect fix + 261's worker purge-FK fix
(PROD-LOADED) + api-client + leg-side test + records. Zero `packages/db` paths — no
migrations. Not protocol-affecting → golden re-run n/a ($0).

## The eight conditions — all evidenced

1. Preview evidence carried honestly (no new preview — the ticket's Stage-A local browser
   arm + the proven deploy discipline at `e578a767`/`b8307a40`/`ee40639d`/`ebfd33f2`).
2. Cloud Build `9acde02a` SUCCESS (12m46s) — all-10 images @ `040e36a9` → `rhema-prod` AR;
   run-task vendored-SDK context + in-build uid-10002 asserts green.
3. `pulumi preview --diff` classified: **10 updates + 1 replace (stateless
   `rhema-prod-proxy-tmpl` only), zero deletes, 169 unchanged** — zero stateful touches,
   migrations none, Δ≈$0 ≤ $15.
4. `pulumi up --stack prod` — **update 178**, 10 updated + 1 replaced, 1m30s, zero
   destructive; proxy MIG rolled `{t1m0,nrqg}` → `{zkrx,ld01}`.
5. `check-deploy-provenance` all-PASS — `rhema.tools` + `api.rhema.tools` `build.gitSha =
   040e36a9…`.
6. `deployments` row `prod:040e36a9…`, `protocols_version=0.4.0+9c2b880dbee74bd8`, all-10
   digests — over the operator IAP tunnel (system-role DSN, host rewritten, never printed).
7. Committed rollback recipe (revert or re-pin the `ebfd33f2`/build-`ddc437fa` digest set) +
   corpus-in-web-image in-build assert (`#15 [builder 9/9]`, provenance-matched).
8. CDN invalidation `/bff/p/demo~*` on `rhema-prod-urlmap-6f2b86e` host `rhema.tools`
   (dry-run == act; both logs committed).

## Post-deploy verification (the ruling's own leg)

- **(a) N1 + N3 against prod @ `040e36a9` — both PASS** (9.6 s / 15.0 s; provenance match;
  $0): real magic-link signups through the Gmail DWD mailbox + Resend — the exact chain that
  `ERR_TOO_MANY_REDIRECTS`'d pre-fix (held drop → `/app?entry=draft&held=1` →
  `/app/new?entry=draft&held=1` shell → one create → `/p/<slug>/import`). Report committed at
  `reports/2026-11-16_r6fix12-deploy/report.json` (grep-verified token-free); signed-in PNGs
  kept gitignored per GD-OPS-RULES.R6 (c).
- **(b) Manual GET of the redirect chain — every chain ends 200 in ≤2 hops, no cycle**:
  `/app?entry=draft&held=1` → 302 `/login` → 200; `?entry=outline` → 302 `/login` → 200;
  `?entry=draft&held=1&src=hero` (OAuth callback target) → 302 `/login` → 200;
  `/app/new?entry=draft&held=1` → 302 `/login` → 200; bare `/app` → 302 `/login` → 200.
  (Unauthed arm — the session gate precedes the intent arm; the authed hop mechanics are the
  N1/N3 green arm.)
- **(c) `D-R6FIX.11-1` verified live in-window:** the new worker revision
  `…-00090-glz`'s boot tick ran the sweep → re-armed `project.purge:01M3SK38…` → attempts 1–2
  FAILED `claims_draft_id_fkey` on the **draining `00089-tnk`** (old code, revision-labelled)
  → attempt 3 on **`00090-glz`** `purged:true` — 16 claims/24 findings/9+9 obligations/
  gate/correspondence/project + 27 objects deleted, sever 0. Verify select: tombstone
  `01M3SK38…` → **0 rows**. `D-R6FIX.11-1` → DONE, `D-BL38.1-2` → DONE (~16.5 d late),
  BL-112 + BL-113 closed, BL-105's F-15 note chain updated (row stays OPEN for F-16/paid-U6).

## Spend

Cloud Build ~13 min (~$0.6 list) + `pulumi up` (Δ≈$0) + free journey legs $0 + read-only
DB reads $0. No paid/funded arms. Harness: devin-desktop/swe-2-high/subagent.

`mergePolicy: OPERATOR` — this run does not merge. Rollback is the operator's go (recipe
committed in `docs/build/runs/r6fix12-deploy.md`).
