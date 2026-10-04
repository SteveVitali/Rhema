# DOC.1 — repo docs refresh

Manifest row 92 · refresh-repo-docs (scope `.`, incremental, apply) · stacks on
`stevevitali/rec-3-integration-plan` (PR #113) · merge policy **OPERATOR** — do not merge
from the build environment · docs-only, **$0**, no live stage, nothing deployed.

## What lands

Human-facing docs converged onto what the composed build (`b3e0fe1`, rounds 0–3) actually
does. Every changed claim verified against current code — flags read live
(`infra/config/stages.ts`, `packages/contracts/src/domain/pricing.json`,
`refund-window.ts`), terms taken from their ADRs, verdicts from DEFERRALS rows — nothing
fabricated.

- **`README.md`** — replaced the "P0.01 skeleton" framing with the product that runs on
  `rhema.tools`; added a verified **Status** section (interim trial `test_tenants` ≤2,800
  words · ADR-014; `purchaseMode:"closed"` · ADR-028; refund window `test_tenants` only ·
  ADR-071/BL-30; ~$285/mo measured vs $50 target · OPS.2/ADR-082; four open SLO breaches
  D-SLO.1-5…8; G2 deferred → no efficacy claims) and a **Round-3 invariants** section
  (REQ-SPEC-29…32); corrected the layout (`apps/turbo-cache`, ~20 missing packages,
  `integration/`).
- **`docs/README.md`** — added the missing mode-table rows (`phase1-exit-readout.md`
  append-only; `docs/ops/` + `docs/security/` living) and a current-state paragraph.
- **`docs/phase1-exit-readout.md`** — dated **append-only** correction (2026-10-04):
  reconciles the "UNMEASURED — Stage B" rows to what the live legs produced (row 2 still
  unmeasured; nightly golden still D-P0.15-4; row 4 PARTIAL with the one-estimator +
  `debitMode:"committed"` sharpened; G2 deferred; plus the new open-state facts).
- **`CONTRIBUTING.md`** — removed the dead `RHEMA_PROTOCOLS_PATH`/public-stubs story;
  `packages/protocols` is committed, only `RHEMA_EVALS_PATH` remains (`.pnpmfile.cjs`).
- **`SECURITY.md`** — AWS Secrets Manager → GCP Secret Manager; "policies land in P0.02" →
  the landed REQ-SPEC-30 posture (`rhema_app_login`, two-tenant probe).
- **`LICENSES.md`** — protocols committed-member correction; `beautiful-mermaid` resolved
  as `MIT@1.1.3` (was "unverified").
- **`docs/ops/debit-mode-flip.md`** — `rhema.app` → `rhema.tools` (×2; superseded domain)
  + the stack's real Resend sender.
- **`integration/README.md`** — added the ~20 live-stage drivers the package now carries
  (prod bring-up, two-tenant probe, instrumented folder, scans, exit driver).
- **`packages/journeys/README.md`** — layout completed (`cli`/`impls`/`nonce`/`stb5a*`/
  `stb5b*`/`provision-res1` + four newer fixtures).
- **`packages/contracts/test/fixtures/README.md`** — "skills do not yet emit sidecars" →
  landed (D-P0.03-1); nightly golden growth still D-P0.15-4.
- **`apps/run-task/vendor/README.md`** — runtime base is distroless `nodejs22-debian12`
  (SEC.3), still glibc linux-x64.

## Requirement ids

REQ-SPEC-29, REQ-SPEC-30, REQ-SPEC-31, REQ-SPEC-32 — the round-3 docs invariants this
refresh records (docs ids of `docs/rhema-design-spec.md`).

## Detector result (honest)

`check-repo-docs-freshness.sh .` → 365 docs, **16 broken refs, 0 stale suspects** — before
and after. **All 16 are report-only or false-positive surfaces**, audited individually:
append-only ADR inline-code examples, frozen spec/design/research figure URIs
(intentionally inert per ADR-046), historical ticket-contract code examples, a test
fixture's input data, and template placeholders inside `packages/protocols` + the verbatim
`upstream-pin` (upstream-diff gate). Fixing them would falsify frozen/historical/pinned
records — classified in `docs/build/runs/DOC.1.md`, not silently skipped. **Zero new
broken refs introduced.**

## Verification

- `check-append-only.mjs --base b3e0fe1` — **OK**
- `check-build-memory.sh .` — **0 violations** (8 pre-existing warnings)
- docs-only — no code, no tests added, no deploy, $0

## Not in this PR

- Agent-facing docs (`AGENTS.md`/`CLAUDE.md`) — DOC.2 (manifest row 93).
- A `CHANGELOG.md` — none exists; release notes live in
  `docs/build/reports/RELEASE_NOTES_DRAFT.md` (no fabricated changelog).
- Stale `package.json` `description` fields — noted in the run ledger for a future pass.
