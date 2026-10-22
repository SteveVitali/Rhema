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
pnpm check:spa-budget              # SPA bundle gzip ceilings (public-safe)
pnpm check:spa-env                 # env-leak tripwire: no server env / VITE_* secrets in bundles (public-safe)
pnpm check:dom-contract            # emitted-DOM manifest: journeys ⊆ manifest ⊆ emitted ⊆ asserted (unit job)
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

## Frontend — the SPA hybrid (round 4; ADR-106/107/108)
`apps/web` is a **Hono SSR host + Vite-built TanStack Router/Query SPA + same-origin BFF**.
React Router survives only as the server-side manifest/match library — it is never shipped to
browsers. **Authored vs activated:** prod still serves pre-chain ancestors; this section
describes landed code. Live posture changes only through the operator's ordered activation
(`docs/build/INTEGRATION_PLAN.md` §R4) — never claim a round-4 surface is live without
`check-deploy-provenance` green.

- **Renderer split.** The public funnel (`SPA_PUBLIC_ROUTES` — `/`, `/invite`, `/pricing`,
  `/signup`, `/login`, `/showcase`) stays SSR forever; every other authenticated document GET
  serves `spaShellDocument` unconditionally (`apps/web/src/spa-shell.ts`). The document census
  is `SPA_DOCUMENT_ROUTES` in `packages/contracts/src/spa.ts` — a `surfaces: null` row is a
  server-owned redirect GET (registered in the client tree as a `reloadDocument` stub so the
  server's 302 still answers).
- **Flag machinery is deleted (SPA.27/28).** `?ssr=1`, `?renderer=spa`, `x-rhema-renderer`,
  `SPA_OVERRIDES`, the `SPA_SURFACES` env + `rhema:spaSurfaces` stack key — all inert or removed;
  never resurrect them (`renderer-overrides.test.ts` + `check:spa-env` are the tripwires).
  `SPA_SURFACES`/`SPA_IDE_FRAMED_*`/`SPA_DOCUMENT_ROUTES` survive as **contract vocabulary
  only** — no request-path code consults them.
- **Forced-SSR is a server verdict (REQ-ED-12, ADR-108).** The five Page-family GETs serve SSR
  on `isPhoneRequest(c) || row.showcase === true`. The boot `surfaces` map owns the phone leg;
  the BFF twin's `project.showcase` owns the showcase leg — leaves consult `twinForcesSsr`
  (`spa/states.tsx`) and hand off through `SsrHandoff` → `replaceDocument` (`spa/dom.ts`, the
  one document-navigation seam — `navigateDocument`/`replaceDocument` share the `spaRuntime`
  arms; `/logout`, external hand-offs, binaries are document navigations). The client never
  decides a renderer.
- **Client-side navigation is one delegated interceptor (round 5, ADR-110).** A single
  bubble-phase `click` listener on `document` — installed by `mountSpa`, never
  `createSpaRouter` — routes in-tree `<a href>` clicks to `router.navigate`. The ordered
  guard pipeline + skip-list are normative in `apps/web/src/spa/nav-intercept.ts`
  (modifiers/secondary-button/contenteditable/`target`/`download`/`data-spa-native`/
  foreign-origin/hash-only/out-of-tree/`RELOAD_STUB_IDS` stays native or doc-navs).
  Interception is unconditional once in-tree — it never consults `surfaces`,
  `deviceClass`, `twinForcesSsr`, or `spaRouteFor`; renderer verdicts stay in leaf
  pipelines. Clicks always push; no intent-preload ships. Settle contract:
  `data-nav-count` (every document stamps `"0"`; HeadManager ticks committed
  transitions) + `data-mounted` removed while a nav is pending.
- **Transport.** `bffFetch` (`spa/bff.ts`) is the ONE JSON transport — same-origin `/…` paths
  only, `credentials:"same-origin"`, no client POST retries; non-2xx throws
  `BffError{status,code,detail?,requestId}`; 401 → `/login` document nav. Reads are the typed
  `/bff/*` twins. Writes post to the same paths a no-JS form would — the server dual-modes on
  `content-type`/`accept`: JSON callers get `{ok:true, redirect?, flash?, data?, pending?,
  url?}` (`url` = allowlist-validated external hand-off only); form posts get the verbatim
  302+flash URL (the no-JS floor is always equivalent). Failures are
  `{error:"<stable_code>", detail?}` at the preserved status — a JSON caller never gets a
  redirect; stale-state 400/404/409 means re-read → invalidate the owning Query keys.
- **Query conventions (REQ-FW-7).** Loaders orchestrate `ensureQueryData` with
  endpoint-verbatim keys + `defaultPreloadStaleTime: 0`; leaves use `useQuery` + `SurfaceShell`,
  not `useSuspenseQuery`.
- **DOM contract.** `apps/web/src/dom-contract.ts` is the committed selector manifest — the
  `data-*` hooks / roles / field names are THE test+journey vocabulary; `check:dom-contract`
  fails on a selector a journey or test cites that the manifest doesn't declare, and on a
  manifest entry nothing emits or asserts. Never invent an undeclared hook.
- **Component tests.** `*.dom.test.tsx` run under happy-dom + Testing Library + `axe-core`
  (`apps/web/vitest.config.ts` `environmentMatchGlobs`, `test-setup.ts`); layout-dependent axe
  rules stay off — the journey-level axe leg is the deferred authoritative tier.
- **Permanent islands (ADR-107).** `CLIENT_ENTRIES = ["ide","page","landing"]`
  (`apps/web/client-entries.mjs`): `page.js`/`ide.js` mount forever on the forced-SSR family +
  SSR-framed IDE documents; `outline` (SPA.26) and `editor` (SPA.24) are retired. An entry
  leaves the list only when nothing served can mount it — removing `page`/`ide` is a REQ-ED-12
  design change, not cleanup.
- **Source mode (SPA.25, REQ-ED-17).** `spa/page-source-mode.ts` — a CodeMirror 6 view loaded
  only via `import()` (the `codemirror` async group; plain-text — `@codemirror/lang-markdown`
  broke the REQ-SAFE-7 ceiling). Commits flow through `applySourceMarkdown`
  (`packages/editor/src/source-mode.ts`, three-way top-level-block merge); the PM view stays
  mounted + dispatching inside `data-pm-host`.
- **Rollback is `git revert` + redeploy** — no flag exists to flip (spec §14.4).

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

Round-4 CLI surface: `--surface <key[,key…]>` scopes a run to a `SURFACE_GATES` surface;
`--expect-renderer <ssr|spa>` fails the run when a served document's `data-renderer` differs
(`spa` on every authenticated SPA-space document, `ssr` on public + forced-SSR arms);
`--invite-code` (env `RHEMA_INVITE_CODE`) seeds the preview invite path. `--pin-renderer`/
`JOURNEY_PIN_RENDERER` are **retired** (SPA.28 deleted `x-rhema-renderer`) and refuse loudly with
exit 2. The marker vocabulary `data-renderer` / `data-mounted` / `data-route` is the settle +
renderer contract — it stays true on both renderers.

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
