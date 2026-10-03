# OPS.1 — Preview stages: `dev` full stack + one `pr-<n>` preview up/destroy

Ticket: `docs/tickets/80_OPS.1__preview-stages.md` · run ledger: `docs/build/runs/OPS.1.md`
Stacks on `stevevitali/sec-3-run-task-confinement` (PR #101, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> §13.2's stage model is now real, not aspirational. `dev` ran the full
> prod-parity program (173 resources — VPC, AlloyDB, Redis, GKE, proxy MIG, seven
> Cloud Run services, convert + migrate Jobs, the LB chain) inside the
> verification window, then returned to idle per ADR-077. `pr-102` ran the
> complete guarded lifecycle — init → up (187) → in-VPC migrate → smoke → N10
> journey → destroy → `stack rm` — with zero `rhema-prod-*` secret reachability
> and $0 inference.

- **The guard is the only `pr-<n>` path** (`scripts/live/preview-stack.mjs`):
  `init` stamps `rhema:owner=ops-preview`; every verb refuses `prod`/`prod-*`
  unconditionally, refuses non-`^pr-\d+$` names, and refuses destroy/rm when the
  ownership tag can't be verified (fail-closed). 42 refusal tests incl. a tree
  scan proving no other `pulumi destroy`/`stack rm` lives in scripts/infra.
- **Fresh non-prod stacks need zero hand secrets** (ADR-079): the program mints
  the postgres/collab/app DSNs (`@pulumi/random`), the RS256 run-token keypair
  (`@pulumi/tls`), better-auth + email-action secrets, the AlloyDB password
  mirror, and — after the pr-102 worker crash-looped on a version-less container
  — explicit *placeholder* versions for the eight operator-only ids
  (`anthropic-api-key` etc. — invalid by design; $0-inference previews want any
  provider call to 401). Prod's provisioned set is byte-identical.
- **In-VPC migrate/seed** (ADR-078): `apps/worker/src/migrate.ts` runs as a
  Cloud Run Job under the worker SA — applies migrations, `ALTER ROLE … LOGIN
  PASSWORD` from the mounted DSNs, seeds protocols/agent types, **refuses
  `seedRealProjects` off dev** (REQ-ARCH-38 — proven live in the pr-102
  execution log), and writes the `deployments` provenance row.
- **dev exercised live:** all 7 services Ready on prod-parity digests; migrate
  idempotent 0001–0039 + role LOGINs + dev-allowed seeds; smoke green through
  the self-signed LB (`/healthz` → `gitSha b909fe9a`); live env verified
  (`MAX_USD_PER_RUN=10`, `SIGNUP_MODE=invite`). Standing projection ≈$390/mo ≫
  $15 → destroyed to the zero-cost skeleton (~46 free resources; the private-app
  subnet finish waits on GCP's serverless reservation release, F-OPS.1-12).
- **pr-102 exercised live:** migrate `seedRealProjects refused`; zero
  `rhema-prod-*` refs across all services/jobs; `MAX_USD_PER_RUN=3`, invite
  signup, `test_tenants`/`committed`/`closed` modes; `/healthz` 200 via the LB;
  web 200; worker booted (consumers + crons + SLO sweep); **N10 journey PASS**
  with screenshot (`docs/build/reports/2026-10-03_OPS.1-pr-102-N10/`).

## Live findings → fixes (F-OPS.1-1…13)

- **F-OPS.1-13 (near-miss, most important):** the shared JOURNEY.1 mailbox
  resources were adopted into every stack — a `pulumi destroy` would have
  deleted `rhema-journeys` (DWD is keyed to the SA's numeric unique_id) plus the
  CI/operator token-creator grants. Caught mid-destroy on dev; the URNs were
  state-deleted out, the real SA verified alive, and `journeys.ts` now marks
  all four `retainOnDelete` (observed `delete[retain]` on pr-102's teardown).
- F-OPS.1-6/7 — AlloyDB refuses `activationPolicy: NEVER` on create (now
  `ALWAYS` + `ignoreChanges` on paused stages); one `us-central1` capacity
  exhaustion, retried after freeing dev.
- F-OPS.1-8 — the non-prod api's `INTERNAL_LOAD_BALANCER` ingress contradicted
  its deliberate public-invoker grant (GFE-404'd everything); api now gets
  `INGRESS_TRAFFIC_ALL` off prod. Prod unchanged.
- F-OPS.1-9 — operator-only secrets ship empty containers on fresh stacks;
  non-prod writes placeholder versions (worker boots cleanly).
- F-OPS.1-10 — `run.app`'s GFE intercepts exact `/healthz`; the self-signed LB
  `*` host map is the documented smoke path.
- F-OPS.1-11 — N10's "no private beta" assertion was open-mode-shaped; invite
  stages render honest access-gated copy by design. The step now detects the
  invite markers and asserts *that* wording instead.
- F-OPS.1-12 — Direct-VPC-egress `serverless-ipv4-cloudrun-*` reservations hold
  the private-app subnet for a GCP-controlled interval after the last service
  deletes; destroy retries converge.
- F-OPS.1-1…5 — secret-version/IAM ordering (`containerPrereqs`), gcsfuse
  `storage.objects.list`, `uselibpqcompat=true` for hostssl DSNs, bare-digest
  provenance, dead-revision wait (forced re-roll + refresh).

## Deferrals

`docs/tickets/DEFERRALS.md` → new OPS.1 section: **D-OPS.1-1** (signed-in
journey legs — mailbox/Resend absent on previews by design), **D-OPS.1-2**
(live paused-AlloyDB leg — NEVER is update-only), **D-OPS.1-3** (billing-export
confirmation — 24 h lag). Append-only dated notes landed on **D-P0.15b-1**
(first real pr-<n> lifecycle) and **D-P0.15c-1** (dev half done live).

## Gates

`pnpm turbo build lint typecheck` 135/135 · `pnpm test` green · guard 42/42 ·
migrate 12/12 · stages 21/21 · monitoring + compute suites green ·
`check-build-memory.sh` clean.

## Spend

List-price ledger ≈ **$5** (resource-hours × us-central1 rates: dev ~3 h,
pr-102 ~4 h, image build/retag, negligible SM/egress) — under the $15 cap;
billing-export confirmation carried as D-OPS.1-3. **Inference: $0** (no paid
legs; placeholder keys 401 by design).
