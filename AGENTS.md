# AGENTS.md — Rhema monorepo conventions

This file is authoritative for the conventions **every later ticket inherits** (package boundaries,
lint rules, CI job names, stage names). P0.01 owns it. Read it before adding code.

## Deferred obligations — READ FIRST, EVERY RUN
`docs/tickets/DEFERRALS.md` is the durable ledger of acceptance criteria/deliverables a ticket could
not fully satisfy at implementation time (usually needing a live GCP deploy or a HUMAN prerequisite
like H0).
At the **start of every `implement-spec` run**: read `DEFERRALS.md`; if this ticket — or a
prerequisite it depends on — unblocks any `OPEN` row, **closing that row (verify for real, flip to
`DONE` with evidence) is part of your run**. When you defer something new, append a row in the same
run. Phase-exit gates (`docs/tickets/*GATE*`) must not pass while an `OPEN` row scoped to that phase
remains.

## Build memory (build-memory v2, ADR-004)
`docs/build/` is the **committed** memory root (opted in by the `<!-- build-memory: v2 -->` marker in its
README): `docs/build/LEDGER.md` holds the machine state (`nextTicket`, `chainTip`, CURRENT STATE / OPEN
FINDINGS / GATE DECISIONS / RETURN PASS / PHASE LOG); `docs/build/BUILD_INDEX.md` is one row per landed PR;
`docs/build/runs/<ID>.md` are the per-ticket run ledgers, `docs/build/pr/<ID>.md` the PR bodies,
`docs/build/readouts/` the gate readouts; `docs/build/logs/` is the one gitignored subtree. `.agents/scratch/`
is retired (MAINT.1). `docs/tickets/00_MANIFEST.md § The chain` is the authoritative order; a human can drive
the stacked chain from it alone. `docs/adr/` holds decision records; its `README.md` is **generated** by
`build-memory adr-index` — never hand-edit it. Contracts + history are **append-only** (amend by a dated note
or a new ADR, never by rewriting a landed file); PRs **stack** and `mergePolicy: OPERATOR` — the operator
merges bottom-up, a run never merges its own PR; a **gate is a pause, not a block**; **secrets never** enter
any ledger. Validate with `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` (structure)
and `node docs/build/tools/check-append-only.mjs --base <base-sha>` (history only grew).

## Stack (Q-3, §13.1)
TypeScript **end-to-end; no Python anywhere**. pnpm + Turborepo; Pulumi (TypeScript) stacks; **GCP-first**
(amended 2026-09-02 from AWS-first; inference from the direct Anthropic API — see 00_MANIFEST § Spec
amendments applied). Node ≥ 20 (CI: 22). Test runner: Vitest. Linter: ESLint 9 flat config. Formatter: Prettier.

## Commands
```bash
pnpm install                       # @rhema/protocols is committed; @rhema/evals links RHEMA_EVALS_PATH, else evals-stub
pnpm turbo build lint typecheck    # the green gate (per-package, remote-cached)
pnpm test                          # vitest, colocated *.test.ts
pnpm check:licenses                # licence allowlist + exceptions (public-safe)
pnpm check:protocol-markers        # no protocol IP in public bundles (public-safe)
pnpm check:no-cookies              # never-cookies ingestion gate (public-safe)
```

## Bazel-compatible invariants (enforced, not advised)
1. **Explicit per-package dependencies.** Import only what a package's `package.json` declares.
2. **Project references.** Every package is a composite TS project; `tsc -b` builds the graph.
3. **No cross-package relative imports.** Cross the package boundary only via `@rhema/*`
   (`eslint-plugin-rhema/no-cross-package-relative-import`). Within a package, relative imports must
   carry the `.js` extension (NodeNext).
4. **Canonical vocabulary** (Appendix D.2; REQ-SPEC-2). Plans / model tiers / rigor / seats /
   approvals are disjoint and verbatim; banned synonyms are lint-errors
   (`eslint-plugin-rhema/no-banned-strings`). The harness is **never** called "Claude Code" in
   user-facing strings.

## Round-3 invariants (00_MANIFEST § Cross-cutting invariants 12–14)
- **A user surface is verified by walking it** (REQ-SPEC-29, ADR-016): Stage-B acceptance for any
  user-surface change is the JOURNEY.1 browser journeys (visible text + actionable controls +
  screenshots); a built client bundle without a served route fails CI; a close records deployed
  provenance = the chain-tip SHA.
- **User-serving vs system DB pools** (REQ-SPEC-30, ADR-017): user-serving code connects with a role
  that cannot bypass RLS; only the documented system pool may bypass — never for a user request, and
  always with explicit workspace predicates. A new tenant read extends the two-tenant probe.
- **Money and research are truthful** (REQ-SPEC-32, REQ-SPEC-31, ADR-014/015): debits equal metered
  burn clamped at the cap; every user-visible price/duration/trial claim comes from the one
  estimator/entitlement config; a Review that could not research says so and refunds the research
  phases.

## Browser journeys (JOURNEY.1; REQ-SPEC-29)
`packages/journeys` (`@rhema/journeys`) is the committed Playwright suite. `src/registry.ts` is the
step registry: a step is `expected: "red"` until its owner proves it in Stage B, then flips it
`"green"` with the screenshot — a green step failing fails the run, a red step failing reports `owed`.
```bash
pnpm --filter @rhema/journeys build
pnpm --filter @rhema/journeys exec playwright install chrome      # chromium for local dev
pnpm --filter @rhema/journeys exec rhema-journeys \
  --stage prod \                # resolves the stage's public origins; only prod has real DNS —
                                # any other stage needs explicit --web/--api
  --steps N2,N7,R1 \            # CSV of registry ids; omit for the whole registry
  --expect-sha <chain-tip-sha> --out docs/build/reports/<date>_journeys
```
`--paid` adds the paid legs (weekly only, bounded by the spend guard + the single ≤300-word fixture).
Post-ADR-093 the guard's `JOURNEY_DATABASE_URL` MUST be the **system-role** DSN — an app-login DSN
reads `usage_records` as $0 through FORCE RLS and blinds the guard. Nightly $0 legs and the weekly
`--paid` run come from `.github/workflows/journeys.yml`.

## Adding a package
1. Create `apps/<name>` or `packages/<name>` with `package.json` (`@rhema/<name>`, `type: module`,
   `build`/`typecheck`/`lint` scripts) and a `tsconfig.json` extending the repo-root
   `tsconfig.base.json` (`extends` = "../../tsconfig.base.json" from the package dir) with
   `references` to each `@rhema/*` dependency.
2. Add it to the root `tsconfig.json` `references` and (if a new container) the Pulumi program in `infra/pulumi/`.
3. Colocate tests as `*.test.ts` (excluded from `tsc` build; run by Vitest).

## Private packages (REQ-ARCH-37, amended 2026-09-01)
`@rhema/protocols` is a **committed workspace member** (`packages/protocols`): this repo is private, so
the protocol IP lives in its history. Open-source-readiness is an **export-time swap** — a public export
drops `packages/protocols` and renames `@rhema/protocols-stub` (`packages/protocols-stub`) back to
`@rhema/protocols`; the `public-safe` CI job builds that stub to prove the fallback still compiles. The
drift gate `scripts/check-upstream-diff.mjs` verifies the ported skills against the vendored pin at
`packages/protocols/upstream-pin/` (REQ-ARCH-5). `@rhema/evals` is still **path-resolved** to a separate
private checkout when `RHEMA_EVALS_PATH` is set (see `.pnpmfile.cjs`), falling back to `evals-stub`
otherwise — **never git submodules**. No protocol/eval text (skills, rubrics, calibration language,
prompts) may reach a client bundle, the OpenAPI document, or an event payload (REQ-ARCH-33).

## Stages (§13.2)
`dev` (shared integration, AlloyDB), `pr-<n>` (per-PR preview: small/paused AlloyDB, isolated GCS buckets,
Base tier, `max_usd` $3/run, never production secrets — REQ-ARCH-38), `prod` (Cloud SQL `db-g1-small` —
amended 2026-09-17 from AlloyDB; the ~$50/mo prod budget cannot carry an AlloyDB primary). Stage facts
live in `infra/config/stages.ts` and are unit-tested; the Pulumi program in `infra/pulumi/` consumes them.

## CI jobs (§13.2), in order
`typecheck/lint/unit` → `contracts` → `integration` → `images` → `public-safe`. Jobs may be thin
placeholders that later tickets fill; the pipeline, licence policy, and public-safe checks are real.

## Secrets (REQ-ARCH-30)
Never in the repo (gitleaks-scanned). Provider keys only in `egress-proxy`; Stripe/Better-Auth secrets
in Secret Manager. No secret as a plaintext env var to `web`/`collab`. Never reachable from the
model's process.
