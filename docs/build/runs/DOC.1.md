# DOC.1 — repo docs refresh (run ledger)

- **Spec:** `docs/tickets/92_DOC.1__repo-docs-refresh.md` (manifest row 92, round-3 tail)
- **Base:** `stevevitali/rec-3-integration-plan` @ `b3e0fe1` (PR #113 open; tree verified
  clean at fork; `git log -1` = `b3e0fe1`)
- **Branch:** `stevevitali/doc-1-repo-docs-refresh` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** refresh-repo-docs @ `~/agent-skills` (scope `.`, audit=incremental, apply=true)
- **Requirement ids stamped:** REQ-SPEC-29 / REQ-SPEC-30 / REQ-SPEC-31 / REQ-SPEC-32 (the
  round-3 docs invariants this refresh records)
- **Started:** 2026-10-04
- **Closed:** 2026-10-04
- **Config:** docs-only; **Live stage: none**; metered spend **$0**; zero prod writes, zero
  deploys, zero merges

## What this run did

Ran `refresh-repo-docs` end-to-end against the composed build at `b3e0fe1` (rounds 0–3, PRs
#1–#113). Every changed claim was verified against current code before it was written — flags
read live (`infra/config/stages.ts`, `packages/contracts/src/domain/pricing.json`,
`refund-window.ts`), ADRs read for the terms they record, run ledgers consulted only for
verdicts the DEFERRALS rows already carry.

### Phase 0 — detector

`check-repo-docs-freshness.sh .`: **365 docs scanned, 16 broken refs, 0 stale suspects.**
All 16 resolve to **report-only or detector false-positive surfaces** (audited
claim-by-claim; ledger at close):

| Surface | Refs | Why not fixed |
|---|---|---|
| `docs/adr/ADR-046` (append-only) | `figure_1_five_questions.png`, `target`, `…` | inline-code examples inside an ADR describing the figure-inerting mechanism; append-only record |
| `docs/design/6` (frozen) | `asset://fig_01J…` | intentionally-inert figure URI (ADR-046's whole point: unresolved figure assets are never fetched) |
| `docs/research/8`,`9` (frozen) | `path`, `asset://sha256`, `file.png` | placeholders/inert URIs in frozen research notes |
| `docs/rhema-design-spec.md` (frozen-with-amendments) | `asset://fig_01J…` | inert figure URI in the ratified spec — corrections go through the amendment protocol, not an edit |
| `docs/tickets/41`, `71` (historical) | `asset://fig_<id`, `figure_1.png` | inline-code examples inside landed contract text |
| `packages/editor/test/fixtures/converted-sample.md` | `asset://fig-1`, `asset://inline-1` | test fixture — the refs ARE the fixture's input; editing breaks the test |
| `packages/protocols/{conventions,skills}` + `upstream-pin/` twins | `sources/slug.md`, `](url)` | template placeholders in protocol IP; the pin is verbatim vendored — `check-upstream-diff.mjs` forbids divergence |

Zero broken refs were introduced by this run (detector re-run post-edit: same 16, same docs).

### Phase 1–2 — audit + fix (living docs only)

Findings ledger: `/tmp/repo-docs-findings.md` (session). Drift classes fixed:

- **Skeleton-era framing (critical):** root `README.md` described "the P0.01 skeleton …
  services ship as placeholders" — rewritten to the composed product on `rhema.tools`, with
  a verified **Status** section (the honesty anchors: interim trial `test_tenants`/2,800-word
  cap per `pricing.json` + ADR-014; `purchaseMode:"closed"` all stages per `stages.ts` +
  ADR-028; `refundWindowMode:"test_tenants"` + ADR-071/BL-30; ~$285/mo measured vs $50
  target per OPS.2/ADR-082; four open SLO breaches D-SLO.1-5…8; G2 deferred → no efficacy
  claims, REQ-EVAL-19) and a **Round-3 invariants** section (REQ-SPEC-29…32, each claim
  traced to the spec text). Layout lists corrected: `apps/` gains `turbo-cache`;
  `packages/` gains ~20 members grouped by function; `integration/` described.
- **Superseded infrastructure claims (critical→moderate):** `SECURITY.md` said secrets live
  in "AWS Secrets Manager / SSM" and RLS "policies land in P0.02" — corrected to GCP Secret
  Manager + the landed REQ-SPEC-30 posture (`rhema_app_login`, two-tenant probe).
  `docs/ops/debit-mode-flip.md` carried `rhema.app` twice (superseded domain) — corrected to
  `rhema.tools` + the stack's actual Resend sender `hello@rhema.tools`.
- **Dead resolver story (moderate):** `CONTRIBUTING.md` documented `RHEMA_PROTOCOLS_PATH`
  and "builds against the PUBLIC stubs" — dead since the 2026-09-01 REQ-ARCH-37 amendment
  (`.pnpmfile.cjs` resolves only `RHEMA_EVALS_PATH`; `packages/protocols` is committed).
  `LICENSES.md` carried the same stale note + an unresolved `beautiful-mermaid` licence
  caveat — the dep is `MIT@1.1.3` (verified in `node_modules`), its EPL-2.0 transitive is
  excepted.
- **Stale temporal claims (moderate):** `packages/contracts/test/fixtures/README.md` said
  skills "do not yet emit sidecars (lands P0.03/P0.04)" — landed (D-P0.03-1 DONE).
  `apps/run-task/vendor/README.md` named `node:22-bookworm-slim` as the runtime — distroless
  `nodejs22-debian12` since SEC.3 (still glibc linux-x64; verified `loadSdkQuery`/
  `sdk-adapter`/`pathToClaudeCodeExecutable` all current).
- **Map gaps (moderate):** `docs/README.md` had no rows for `phase1-exit-readout.md`,
  `docs/ops/`, or `docs/security/` — added with modes (append-only / living) plus a
  current-state paragraph (prod on `rhema.tools`, REQ-SPEC-29…32, the open postures).
- **Coverage gaps (minor):** `integration/README.md` described only the G21 +
  server-postgres files — the package grew ~20 live-stage drivers (prod bring-up,
  two-tenant probe, instrumented folder, live exit driver, scans); added a "Live-stage
  drivers" section with per-file accurate one-liners from their headers.
  `packages/journeys/README.md` layout missed `cli.ts`/`impls.ts`/`nonce.ts`/`stb5a*`/
  `stb5b*`/`provision-res1.ts` and four newer fixtures — added.
- **Append-only correction (per round-3 notes):** `docs/phase1-exit-readout.md` gained a
  dated 2026-10-04 entry — never rewriting — reconciling its "UNMEASURED — Stage B" rows to
  the state the round-3 live legs produced: row 2 (≤4-min first finding) still unmeasured;
  row 3 nightly golden still OPEN (D-P0.15-4; the *scheduled* suite that exists is the
  journey harness, REQ-SPEC-29); row 4 still PARTIAL (one estimator + calibration store +
  `debitMode:"committed"` everywhere); row 5 benchmark unrun/G2 deferred (ADR-104); row 6
  still MET via `lintGrowthCopy`; plus the new open-state facts (SLO breaches, $285/mo,
  closed purchases, test-tenant refund window).

### Verified-accurate docs (audited, no edit needed)

`infra/pulumi/README.md` (stacks/guard/OPS.1/OPS.2 all match code), `infra/PROD-BRINGUP.md`
(current through OPS.2 amendments), `docs/ops/slo-review.md` + playbooks,
`docs/security/*` (dated audit records, internally consistent), `packages/journeys/README.md`
run commands (bin `rhema-journeys` → `dist/cli.js`, flags, `journeys.yml` crons all verified).

## Reported, not fixed (frozen/report-only surfaces)

- The 16 detector hits above — frozen specs/research/design, append-only ADR text,
  historical ticket contracts, a test fixture, and the verbatim upstream pin. The detector
  cannot reach zero on this corpus without falsifying records; each item is classified, not
  silently skipped.
- `AGENTS.md`/`CLAUDE.md` drift (e.g. `RHEMA_PROTOCOLS_PATH` comment, "five-job CI" naming)
  is **DOC.2's scope** — noted, untouched.
- No `CHANGELOG.md` exists; none fabricated — release notes live in
  `docs/build/reports/RELEASE_NOTES_DRAFT.md` (REC.3, historical record).
- `package.json` `description` fields still carry "skeleton"/"Fargate" wording on several
  packages — code metadata, outside the doc corpus; noted for a future hygiene pass.

## Verification

- `check-repo-docs-freshness.sh .` — 16 broken refs (all report-only/false-positive,
  classified above); **0 new broken refs introduced**; 0 stale suspects.
- `node docs/build/tools/check-append-only.mjs --base b3e0fe1` — **OK**.
- `check-build-memory.sh .` — **0 violations** (8 pre-existing warnings, none new).
- No code changed; no tests added (docs-only ticket) — the deterministic gate suite was not
  re-run since nothing it covers moved.

## Deferrals

- No DEFERRALS row unblocked or closed by this ticket; none opened (nothing deferred — the
  residual detector hits are report-only classifications, not owed work; the DOC.2
  agent-docs scope is its own chain row).
