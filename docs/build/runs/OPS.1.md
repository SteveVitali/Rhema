# OPS.1 — Preview stages: `dev` full stack + one `pr-<n>` preview up/destroy (run ledger)

- **Status:** IN PROGRESS — Stage A implementation under way
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/80_OPS.1__preview-stages.md` (manifest row 80)
- **Branch:** `stevevitali/ops-1-preview-stages` — base `stevevitali/sec-3-run-task-confinement`
  at `4a66704f7665c07fd873f00c15a315fd90620525` (SEC.3 / PR #101, unmerged, OPERATOR policy)
- **Goal:** make §13.2's stage model real — `dev` at prod parity for a verification window; a
  `preview-stack.mjs` guard that is the only `pr-<n>` init/up/destroy/rm path and refuses `prod`
  unconditionally; IaC-generated role secrets on fresh stacks (no hand-set `rhema:*DatabaseUrl`);
  an in-VPC migrate/seed that refuses `seedRealProjects` on previews; one `pr-<n>` exercised
  end to end with zero `rhema-prod-*` secret reachability; ≤ $15 infra, $0 inference.
- **Spend cap:** Stage B ≤ **$15** metered (aim ≈$8; round-3 cumulative entering: **$65.95**)
- **ADRs (owned decisions):** TBD-077 (dev standing shape + cost projection), TBD-078 (in-VPC
  migrate path — Cloud Run Job), TBD-079 (IaC-generated role secrets), TBD-080 (preview journey set)

## 0 — Context load

- DEFERRALS read first: **D-P0.15b-1** (the `pr-<n>` full-stack up/destroy never exercised — this
  ticket closes it); **D-P0.15c-1** (full `dev` deploy, prod equivalents DONE — the `dev` half is
  this ticket's Stage B); no other row routes to OPS.1.
- LEDGER gate decisions re-confirmed: `mergePolicy: OPERATOR`; `stack=prod` refused outright by the
  guard; no pre-dispatch pause for authorized work; no new third-party credentials; no preview DNS;
  round-3 cumulative pause at $100 / hard-stop $200.
- Dev stack state before `up` (enumerated 2026-10-04, `pulumi stack export`): **23 resources**
  — `rhema-dev-net` + `private-app` subnet only, 5 secret containers (anthropic/better-auth/
  google-oauth/run-token/stripe), 9 service accounts, 3 buckets (artifacts, user-content,
  access-logs), `rhema-dev-proxy-health`, `rhema-dev-cert`. No data plane, no compute, no sandbox
  subnet — the stale `Pulumi.dev.yaml` carries hand-set `workerDatabaseUrl`/`workerSystemDatabaseUrl`/
  `workerRedisUrl`/`proxyDatabaseUrl` (all replaced by IaC-generated secrets in this ticket).
- Journey survey: the only sessionless $0 leg is **N10** (anonymous public surfaces + static
  /showcase sample). Every session leg needs a magic link (Resend absent on previews);
  P1/C1/R*/N1–N9/X1 carry a signed-in half → deferred (owned decision d).

## 1 — Requirement matrix

| Req | Contract | Mechanism |
|-----|----------|-----------|
| REQ-ARCH-38 | previews never get prod secrets or user-text fixtures | guard + PREVIEW_REQUIRED_SECRETS (IaC-generated only) + migrate seed refusal + live secret-ref enumeration |
| REQ-ARCH-39 | deploys recorded with digests + protocols version | migrate job's `--record-deployment` leg + check-deploy-provenance over /healthz |
| REQ-ARCH-30 | no secret in repo/ledger; generated secrets in SM/encrypted state | @pulumi/random + tls key in encrypted state → SecretVersion → secretKeyRef mounts |
| REQ-SPEC-30 | fresh stacks born with the role split | migrate job `ALTER ROLE … LOGIN PASSWORD` for rhema_app_login + rhema_collab from the generated DSNs |
| REQ-SPEC-29 | preview accepted by walking credential-free journeys | N10 (+ smoke) |
| REQ-SPEC-32 | $0 inference; infra vs cap | no paid legs; resource-hours × list price ledger below |

## 2 — Test matrix

| # | Behavior | Test | Kind |
|---|----------|------|------|
| 1 | guard refuses prod for init/up/destroy/rm/refresh (+ select/output) | scripts/live/preview-stack.test.mjs | unit |
| 2 | guard refuses non-`^pr-\d+$` (dev, pr-test, pr-, pr1, prod-anything) | same | unit |
| 3 | guard refuses destroy/rm on untagged pr-<n> | same | unit |
| 4 | tree scan: no `pulumi destroy`/`stack rm` outside the guard in scripts/live + infra | same | unit |
| 5 | migrate entry refuses seedRealProjects for `pr-*`/`preview`, allows dev, prod runner unchanged | apps/worker/src/migrate.test.ts | unit |
| 6 | migrate entry's ALTER ROLE plan is NOLOGIN→LOGIN, password-quoted, role-name-validated | same | unit |
| 7 | stage facts: preview/dev required-secrets = generated+nonprod set; no rhema-prod-* prefixable; preview $3/invite/paused/base-only re-asserted | infra/config/stages.test.ts | unit |
| 8 | compute wiring: api/worker/collab/migrate DSNs via secretKeyRef only when required; non-prod API_BASE_URL/API_INTERNAL_URL/proxy URL from resources; MAX_USD_PER_RUN=3 on preview | infra/pulumi/compute.test.ts | unit |
| 9 | migrate Job exists only on non-prod, worker image, vpcAccess, worker SA | infra/pulumi/compute.test.ts | unit |
| 10 | live: preview secret-ref enumeration finds zero rhema-prod-* | Stage B gcloud describe | live |
| 11 | live: no real-project slugs in preview DB | Stage B migrate log + query | live |
| 12 | live: dev/preview smoke (api /healthz, web 200, worker boot, MAX_USD_PER_RUN=3, invite mode) | Stage B | live |
| 13 | live: destroy + rm clean, zero orphans | Stage B enumeration | live |

## 3 — Live spend ledger (resource-hours × list price; filled as legs run)

| Leg | Resource | Rate est. | Hours | Est. $ | Actual |
|-----|----------|-----------|-------|--------|--------|
| cloudbuild | E2_HIGHCPU_8 ×9 images | ~$0.036/min tier? (record actual) | — | ~0.60 | |
| dev window | AlloyDB 2vCPU ($0.34/h) + Redis 1GB ($0.049/h) + GKE ($0.10/h ctl + $0.067/h node) + proxy e2-small ($0.017/h) + worker min1 (~$0.036/h) + LB (~$0.025/h) | ~$0.60/h | ~3h | ~1.80 | |
| pr-102 window | same shape | ~$0.60/h | ~4h | ~2.40 | |
| SM/egress/misc | negligible | — | — | ~0.20 | |
| **total** | | | | **~$5** | |

## 4 — Implementation record

(filled during implementation)

## 5 — Gap analysis

(filled after fresh reread)

## 6 — Stage B evidence

(filled live)

## 7 — Deferrals + ADRs

(filled at closeout)
