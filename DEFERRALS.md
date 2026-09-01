# Deferred obligations ledger

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

<!-- Later tickets append their own sections below. Keep the newest ticket's section at the bottom. -->
