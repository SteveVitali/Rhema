# R6SECR.1 — Pre-launch adversarial security review (REQ-SEC-3)

Manifest row 195 · GATE-LAUNCH threshold 2 · stacks on `stevevitali/r6cnt-2-showcase-build` ·
mergePolicy: **OPERATOR** (never self-merges).

**One launch-blocking critical found live on prod and fixed in-ticket: `revision-routes.ts`
served foreign-tenant draft content and accepted foreign-attacker guidance writes.** The full
adversarial review — controls checklist, live probe evidence, money-path review — lands in
`docs/build/reports/2026-10-23_R6SECR.1/adversarial-review.md` (its first paragraph states, as
required, that this review **is not independent** — performed by the same model family that
wrote the code; the external engagement stays deferred post-launch under ADR-112 / D-P1.22-3).

## Findings

| id | severity | status |
|---|---|---|
| **F-R6SECR.1-1** — cross-tenant read+write via the four `revision-routes` `/projects/:id/*` routes (diff + what-changed GETs leak foreign drafts; hunk-comment POSTs plant foreign `guidance` rows → prompt injection into the victim's next Revise) | **CRITICAL** | **FIXED** — `ownProject` guard on all four routes (scoped-db read; foreign project invisible under RLS → uniform 404; unbound `db` fails closed) |
| F-R6SECR.1-2 — no `Strict-Transport-Security` on `rhema.tools`/`api.rhema.tools` | low | DEFERRALS `D-R6SECR.1-2` (infra owner) |
| live §12.8/run-served legs (planted exfil, canary, sandbox, SSRF) | n/a | DEFERRALS `D-R6SECR.1-1` — needs a running run; `F-R6CNT.2-1` dead key + no spend authorization |

**Open criticals/highs: 0.**

## Root cause + why it shipped

`drafts`, `correspondence_items`, `artifact_versions`, `guidance` are tenant-by-FK tables (no
`workspace_id`, no RLS — `rls-catalog.test.ts` Bucket C): the route's project-ownership
predicate IS the tenancy boundary. `revision-routes.ts` was the only route module without one.
The deterministic two-tenant probe missed it because its fixture bound **no content store** —
every store-dependent route 500'd at `storeFor` before the unscoped SQL ran, reading as
fail-closed. Prod binds `contentStoreFor`, so the leak only existed live.

## Probe extension (the review's lasting artifact)

- Deterministic fixture now binds the prod `contentStoreFor` seam (`InMemoryContentStore`) and
  seeds a `response`-kind correspondence. **Verified both directions: buggy build → 4 findings
  (`dft_probe_*`/`corr_probe_*` leaked cross-tenant), fixed build → green (76 GETs, 0 findings).**
- Live mode: typed-id harvest + 37 planted-foreign-id api templates + 29 `/bff/*` legs (foreign
  slug picked outside the requester's slug set) + `POST /inbox/<foreign>/read` write leg.
- Prod run at $0, `is_test` tenants only: **178 legs + 4 writes → exactly F-R6SECR.1-1 red**;
  mint/traversal/anon/forged-cookie legs all clean; CSP nonce + `__Host-` cookie + cookie-free
  usercontent origin verified.

## Deploy record (executed 2026-10-23)

F-R6SECR.1-1 was live on prod `ba66c4b`; the fix is now **deployed and re-verified**:

- Stage 1 (api-only, GD-DEPLOY.R6): Cloud Build `40a99cb8` (`api@e0bf17d2` @ `80db0d5`) →
  `pulumi up` 1 update / 171 unchanged → former leak `GET /projects/<foreign>/v/2/diff/1` →
  **404 both directions**; live re-probe green.
- Stage 2 (full-set provenance): `image-set.yaml` build `5a9a5c8c` — all 10 images @ `80db0d5`,
  every digest re-pinned in `Pulumi.prod.yaml` (api digest differs from stage-1's; builds are
  not bit-reproducible, same source SHA) → `pulumi up` 10 updates + the stateless
  proxy-template replace (161 unchanged, zero stateful replace/delete) →
  `check-deploy-provenance --expect 80db0d5` **all-PASS** on `rhema.tools` +
  `api.rhema.tools` → `record-deployment` wrote `prod:80db0d521b…`
  (protocols `0.4.0+ec61156725a895ab`, nine digests, IAP tunnel).
- **Final live re-probe on the full set: `{passed:true, routesProbed:178, writesProbed:4,
  findings:0}`.**
- Migrations: none (additive lint trivially satisfied). Spend: $0 — image builds + rollouts
  only; no dispatched runs, no model calls.

## Verification

- `pnpm exec vitest run integration/src/two-tenant-probe.test.ts` — green (deterministic probe).
- `pnpm exec vitest run apps/api/src/version-routes.test.ts` — 13/13 green.
- `pnpm turbo typecheck lint --filter=@rhema/api --filter=@rhema/integration-tests` — green.
- `pnpm exec tsc -b` on the touched packages — green.
- Full repo gate + CI boundary recorded in `docs/build/logs/ci-R6SECR.1.json`.

Requirement stamped: **REQ-SEC-3**.
