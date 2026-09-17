# PRB.15 — Prod bring-up: the `prod` stage profile, the Pulumi prod stack, the operator-gated deploy (Stage A)

**Spec:** `docs/tickets/28f_PRB.15__prod-bringup.md` · REQ-ARCH-1/2, REQ-ARCH-26/27/28/29,
REQ-ARCH-30/31, REQ-ARCH-38, REQ-ARCH-39, REQ-EVAL-3, §13.1–13.5, §12.1 · **Base:**
`stevevitali/prb-14-run-resilience-cost-fidelity` · **Stacked PR — do not merge
(mergePolicy=OPERATOR).**

## ⚠️ Stage B pending operator gate

This PR is **Stage A only** — the offline, no-spend construction half. **Nothing here has run against
GCP.** `pulumi up prod`, the prod migrations, the smoke checks, the live provenance stamp, and the
D-P0.13-2 provider-verification write are all `[OPERATOR GATE]`d (HUMAN-H6 + a stated budget) and are
scripted — not executed — in **`infra/PROD-BRINGUP.md`**.

## Summary

> Take the deterministically-proven + dev-proven system to prod — authored, not yet deployed.

**The `prod` stage profile** (`infra/config/stages.ts`): `signup.mode: "open"` (prod only — dev and
preview keep `invite`), the real domains (`rhema.app` / `api.rhema.app` /
`rhemausercontent.com`), and the 12-id `requiredSecrets` checklist — all as unit-tested stage facts
the program consumes, so the deployed shape can't drift from the tested shape.

**The prod Pulumi stack**: `Pulumi.prod.yaml` + the program deltas — every `ALL_SECRET_IDS`
container provisioned (versions stay operator-only), the full least-privilege grant set (fetcher's
`objectCreator` conditioned to the `quarantine/` prefix; the proxy still the sole
`anthropic-api-key` reader), the AlloyDB bootstrap password bound to a Pulumi secret, the per-stack
Artifact Registry repo, `convert` as a Cloud Run **Job** (its §12.1 shape), and the full prod env
wiring for api/worker/web.

**Domains/TLS/origin**: a managed cert over `rhema.app` + `api.rhema.app` + `rhemausercontent.com` +
`*.rhemausercontent.com`; a host-routing URL map sending `api.rhema.app` to the api NEG and
`[*.]rhemausercontent.com` to a `BackendBucket` over the **private** `user-content` bucket —
cookieless by construction (separate registrable domain), CDN-enabled for edge signature
verification, `USE_ORIGIN_HEADERS` honoring the attachment/octet-stream + no-store headers
`servingHeadersFor` emits. A reserved global IPv4 + the `dnsRecords` stack output hand the operator
the exact records to apply.

**The full image set**: the four remaining sleeper Dockerfiles (`web`, `fetcher`, `convert`,
`collab`) replaced with real two-stage images — `web` serves the SSR shell + bundled editor,
`fetcher` serves `/fetch` + `/healthz`, `convert` runs the real CLI via `ENTRYPOINT`, `collab` gets
an honest `/healthz` server (the Hocuspocus impl is still its own ticket — no fake surface). The
`egress-proxy` image already runs the real `createProxyServer` — verified at source (**D-P0.07-4's
image leg closes**). The CI `images` job and `cloudbuild.yaml` now build all **9** services.

**Runbook + provenance**: `infra/PROD-BRINGUP.md` scripts the whole Stage B — `applyMigrations` +
`seedProtocols` on prod AlloyDB via `scripts/live/prod-migrate-seed.mjs` (never `seedRealProjects`),
the `infra/k8s/apply.sh` post-step, the 12 secret versions + the CDN signed-url key, the
`deployments` row via `scripts/live/record-deployment.mjs` (computes the real `PROTOCOLS_VERSION`
itself; refuses stub/empty — **D-P0.04-2's live half is authored**), and the verbatim D-P0.13-2 write
via `scripts/live/record-provider-verification.mjs` (asserts `providerTransmissible("anthropic",
now)` in-process).

## Deferrals touched

- **D-P0.07-4 → DONE (image leg)** — the egress-proxy image runs `createProxyServer`; the live serve
  leg stays under D-P0.15c-6.
- **Annotated, still OPEN** (the `pulumi up prod` / live writes are Stage B): D-P0.01-1,
  D-P0.01-7, D-P0.15b-1, D-P0.15c-1, D-P0.04-2, D-P0.13-2.
- **D-PRB.13-1** annotated — the Redis throttle binding was evaluated and deliberately left for
  PRB.16 (the row's verify path is a live cross-instance assertion; the sync `attempt` interface
  change is out of this ticket's listed scope).

## Stage-B checklist (the operator's exact remaining path)

See `infra/PROD-BRINGUP.md` — steps 0–10: H6 confirmation → `pulumi stack init prod` → config +
secrets → image build/digest-pinning → `pulumi up` → k8s post-step → DNS → secret versions +
signed-url key → migrate/seed → provenance row → verbatim provider-verification write → smoke →
flip the genuinely-proven deferral rows.

## Verification

- `pnpm turbo build lint typecheck` — **111/111 tasks**
- `infra/pulumi` `tsc --noEmit` — clean vs `@pulumi/gcp@8.41.1`
- `pnpm test` — all green; `stages.test.ts` 16/16 (prod-open signup, real domains, secret checklist,
  sandbox isolation). One pre-existing timing flake in `run-sheet/lever-matrix.test.ts` observed
  under load (104.9ms vs <100ms; green standalone) — unrelated.
- `pnpm check:protocol-markers` — OK (39 files) · `pnpm check:licenses` — OK (502 pkgs) ·
  `node scripts/check-upstream-diff.mjs` — OK · `check-build-memory.sh .` — **0 violations**
