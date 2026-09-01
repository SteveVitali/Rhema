# Deferred obligations ledger

> **Maintained companion — NOT a generated ticket.** This file is hand-maintained and committed. It
> is not produced by `decompose-spec` and must be **preserved across any ticket regeneration** — never
> overwritten or deleted. Rows are append-only (see rules below). It has no `NN_` sequence prefix
> precisely so it is not mistaken for a chain ticket.

Durable, in-repo record of **acceptance criteria and deliverables that a ticket could not fully
satisfy at implementation time** — almost always because they need a live AWS deploy or a HUMAN
prerequisite (Phase 0a / H0 etc.) that was not yet done. Each row names how it was proxied now, what
unblocks it, and exactly how to verify it when unblocked.

**This file is the source of truth for "what still owes verification."** It is read at the start of
every `implement-spec` run (via `AGENTS.md`). The rules:

1. **Every run, first:** read this file. If the ticket you are about to implement — or a prerequisite
   it depends on (e.g. H0 finishing, or an earlier ticket landing the egress-proxy SG) — unblocks any
   `OPEN` row, **closing that row is part of your run**: verify it for real, then flip it to `DONE`
   with the date and evidence (commit/PR).
2. **Never delete a row.** Flip `OPEN` → `DONE` (verified) or `WONTFIX` (with a reason). History stays.
3. **When you defer something new,** append a row here in the same run that defers it. A deferral that
   is not in this file did not happen.
4. **Backstop gates:** the phase-exit gates in `docs/tickets` (e.g. `16a_GATE-G1__phase0-exit.md`) must
   refuse to pass while any `OPEN` row scoped to that phase remains. Treat an open row as gate-blocking.

Status values: `OPEN` (owed) · `DONE` (verified — add date + evidence) · `WONTFIX` (add reason) ·
`ACCEPTED-SKELETON` (intentionally minimal for now; revisit at the named ticket).

---

## P0.01 — monorepo & infra (PR #1)

| ID | Item (AC / deliverable) | Why deferred | Unblocked by | How to verify when unblocked | Proxy in place now | Status |
|---|---|---|---|---|---|---|
| D-P0.01-1 | **AC2** — `sst deploy --stage pr-test` stands up an isolated preview (0-ACU Aurora, isolated buckets) and tears down cleanly; `dev` deploys the skeleton | No AWS credentials/CLI in the build env; H0 not done | **H0** (AWS account, domains, Secrets Manager, SES) | `sst deploy --stage pr-test` → confirm 0-ACU Aurora + isolated buckets; `sst remove --stage pr-test` clean; `sst deploy --stage dev` | `infra/sst.config.ts`, `infra/config/stages.ts` (+ `stages.test.ts`) | OPEN |
| D-P0.01-2 | **AC3 (live half)** — route-table/SG assertion that the sandbox subnet has no IGW/NAT route and egresses only to the proxy SG | Needs a live VPC to read | **H0** + **P0.07** (egress-proxy SG exists) | After deploy: assert sandbox route table has no `0.0.0.0/0`; its SG egress targets only the proxy SG | Static: `stages.test.ts` asserts `hasInternetRoute:false`, egress `["sg:egress-proxy"]`; `sst.config.ts` no-route RT | OPEN |
| D-P0.01-3 | **AC5** — Sign-in with Google **and** magic link works on `dev` | Needs a deployed `dev`, Google OAuth consent screen, and secrets in Secrets Manager | **H0** (Google OAuth consent + secrets) + a `dev` deploy | On `dev`: complete a Google sign-in and a magic-link sign-in end-to-end | Code: `apps/api/src/auth.ts` (`createAuth`), `packages/db` auth schema | OPEN |
| D-P0.01-4 | Turbo remote cache **self-hosted on S3** — the cache server itself | Config-only for the skeleton (endpoint via `TURBO_API`/`TURBO_TOKEN`) | Infra hardening / when CI cache perf matters | Point `TURBO_API` at the S3-backed cache proxy and confirm remote cache hits in CI | `turbo.json` `remoteCache.enabled`; CI env wired | ACCEPTED-SKELETON (revisit: P1.22 / ops) |
| D-P0.01-5 | **IAM as code** — explicit least-privilege policies | SST `link:` grants scoped access implicitly; explicit policies not yet authored | Security hardening | Author + review explicit IAM policy documents per service | `sst.config.ts` `link:` grants | ACCEPTED-SKELETON (revisit: P1.22) |
| D-P0.01-6 | Non-sandbox subnets sized `/20` | Only the sandbox subnet is explicitly `/20`; SST manages the public/private subnets | Infra hardening | Confirm/adjust SST-managed subnet CIDR masks to `/20` | `sst.config.ts` sandbox `/20` | ACCEPTED-SKELETON (revisit: infra hardening) |

## P0.02 — contracts & data model (PR #2)

| ID | Item (AC / deliverable) | Why deferred | Unblocked by | How to verify when unblocked | Proxy in place now | Status |
|---|---|---|---|---|---|---|
| D-P0.02-1 | Run the forward-only migrations + real-project seed against a **server** Postgres (the CI `postgres:16` service / real Aurora), not only the in-process PGlite build | The deterministic DB ACs run on PGlite (a real Postgres compiled to WASM) in the unit/contracts jobs — no DB service needed; the server-Postgres run belongs in the `integration` job, which P0.08 fills | **P0.08** (fills the `integration` CI job + wires a pg client) | In the integration job: connect the `pg` client to the `postgres:16` service, run `applyMigrations` + `seedRealProjects`, assert success | `@rhema/db` `applyMigrations`/`seedRealProjects` are engine-agnostic (an `{exec,query}` target); PGlite covers AC2 now (migrate/seed/rls/invariants tests) | ACCEPTED-SKELETON (revisit: P0.08 integration job) |

## P0.03 — protocols port & manifests (PR #3)

| ID | Item (AC / deliverable) | Why deferred | Unblocked by | How to verify when unblocked | Proxy in place now | Status |
|---|---|---|---|---|---|---|
| D-P0.03-1 | **AC4** — with `sidecar: true`, a recorded live run of each ported skill on a real-project fixture emits sidecars that validate against P0.02's schemas | No engine runs skills yet (the engine + two-uid image is P0.06); a true run is a full editorial/persona workflow on real prose — budget-capped, and the exhaustive three-project matrix is P0.15's job (ticket Notes) | **P0.06** (engine) → **P0.15** (live 3-project runs) | With the engine: run each of review/revise/fact_check/profile_voice with `sidecar:true` on a seeded real project; assert `.rhema/*.json` validate against `@rhema/contracts` `SIDECAR_REGISTRY` and `parseStatus=ok` (the §17 / G1 exit criterion) | Manifests declare each phase's `sidecars[]` **from the P0.02 `SIDECAR_REGISTRY` filenames** (manifests.test.ts asserts every declared sidecar is a known schema); the sidecar emission is a documented, `sidecar:true`-gated additive delta (upstream-diff green) | OPEN |
| D-P0.03-2 | **AC5** — with `sidecar` absent, the skills run unchanged against upstream conventions (one dry run) | Same: needs the engine to run a skill end-to-end | **P0.06** → **P0.15** | Run a ported skill with no `sidecar` input and confirm behavior identical to upstream (diff outputs) | `sidecar` is opt-in (default absent); the upstream-diff gate proves the ONLY deltas are the six inputs / phase-result / `sidecar:true` emission / Q-11 / persona-resolution, so with `sidecar` absent no behavior changes vs upstream | OPEN |
| D-P0.03-3 | **AC6** — `phase: "N"` runs exactly phase N then stops, writing `.rhema/phase-result.json` | The one-phase-per-`query()` execution is the engine's job (P0.06); the manifest supplies the phase list + completion oracle data, but nothing executes phases yet | **P0.06** (engine phase runner) → **P0.15** | With the engine: invoke a ported skill with `phase:"2"`; assert only phase 2's artifacts appear and `.rhema/phase-result.json {status}` is written, then it stops | The `phase` input is ported into every SKILL.md (upstream-diff green); each manifest phase carries `skillPhase`, `completionPredicates`, and the phase-result contract is documented in the harness section | OPEN |
| D-P0.03-4 | **AC1/AC2/AC3/AC7/AC8 CI execution** — the protocols checks run green in CI | Was blocked because the ported skills/manifests lived in a **gitignored private checkout** absent from CI | **DONE via design change** (2026-09-01): `packages/protocols` is now a **committed workspace member** (operator decision; REQ-ARCH-37 amended) | n/a | The whole graph (incl. `packages/protocols` build/lint + its tests) runs in the normal `typecheck-lint-unit` job; the upstream-diff (AC1) runs there against the **vendored pin** `packages/protocols/upstream-pin/` (no external repo). Verified green locally: `turbo build lint typecheck` + `pnpm test` + `check-upstream-diff.mjs` | DONE (2026-09-01; committed-member normalization) |
| D-P0.03-5 | Live DB seed of the Essay protocol **body** (`seedProtocols` upserting the P0.02 placeholder) against a server Postgres | Deterministic AC7 is proven at the shape/SQL level (fake target); running the upsert against the real migrated `protocols` table belongs with the integration job | **P0.15** (integration / live 3-project runs) | In integration: after P0.02's `protocolsSeed` placeholder, run `seedProtocols(db)`; assert the `protocols` row body is the real §6.7 Essay config with 8 dims and `venue_table_verified_at` set | `seedProtocols` upserts (`on conflict … do update`) the P0.02 placeholder; `protocols.test.ts` asserts the SQL, params, `verified_at`, and 8-dim body deterministically | OPEN |

<!-- Later tickets append their own sections below. Keep the newest ticket's section at the bottom. -->
