# DOC.2 — agent docs refresh

Manifest row 93 (the last chain row) · `agent-docs` refresh mode, scope `.` · stacks on
`stevevitali/doc-1-repo-docs-refresh` (PR #114) · merge policy **OPERATOR** — do not merge
from the build environment · docs-only, **$0**, no live stage, nothing deployed.

## What lands

The AGENTS.md hierarchy converged onto the composed build (`20e29ec`, rounds 0–3, PRs
#1–#114) — the drift DOC.1 flagged plus the round-3 additions the ticket's notes require.
Every changed claim verified against current code (`package.json`, `ci.yml`,
`infra/config/stages.ts`, `packages/journeys/src/cli.ts`, `.pnpmfile.cjs`).

**Drift fixed in `AGENTS.md`:**

- **Commands comment** — "runs against public stubs unless `RHEMA_PROTOCOLS_PATH` is set"
  was dead since the 2026-09-01 REQ-ARCH-37 amendment: `@rhema/protocols` is a committed
  workspace member; only `@rhema/evals` is path-resolved via `RHEMA_EVALS_PATH`.
  Corrected (same fix DOC.1 made to `CONTRIBUTING.md`).
- **Stages** — `prod` was "AlloyDB min primary kept warm"; prod is **Cloud SQL
  `db-g1-small`** since the 2026-09-17 amendment (`stages.ts`, `engine:"cloudsql"`).
- **`../../tsconfig.base.json`** — a package-relative path dangling at repo scope;
  reworded ("extends the repo-root `tsconfig.base.json`").
- **Command rows** — added `pnpm check:no-cookies` (the never-cookies public-safe gate);
  all rows re-verified against `package.json`.

**Sections added (round-3 notes):**

- **Round-3 invariants** — manifest invariants 12–14: user surfaces verified by walking
  them (REQ-SPEC-29), user-serving vs system DB pools (REQ-SPEC-30), money/research
  truthfulness (REQ-SPEC-32/31).
- **Browser journeys (JOURNEY.1)** — `rhema-journeys` run instructions: `--stage` (only
  `prod` has real DNS), `--steps`, `--expect-sha`, `--paid` (weekly, spend-guard bound),
  the post-ADR-093 **`JOURNEY_DATABASE_URL` = system-role DSN** rule, and the
  `expected:"red"→"green"` owner-flip convention.
- **Build memory** — section already present (marker exists); added `mergePolicy:
  OPERATOR` and the `check-append-only.mjs --base` validator.

**`CLAUDE.md`** — created (one line: `@AGENTS.md`) — the skill's Phase-2.3 bridge so the
same source of truth serves every harness.

## Requirement ids

REQ-SPEC-29, REQ-SPEC-30, REQ-SPEC-31, REQ-SPEC-32 — the round-3 invariants the refreshed
doc records (docs ids of `docs/rhema-design-spec.md`).

## Detector result (honest)

`check-agent-docs-freshness.sh .` → **0 issues, exit 0** (was 4 critical at Phase 0).
Two of the four were **detector bugs**, fixed upstream in `~/agent-skills` (uncommitted,
recorded in `runs/DOC.2.md`): the `*/build/*` exclusion nuked `docs/build/` — the
committed memory root the script's own check 1F requires — and `.claude/worktrees/`
stale snapshots were scanned despite being a gitignored agent-harness dir (a registered,
clean, merged worktree; left in place for the operator). The remaining two were real doc
fixes (`tsconfig.base.json` ref; and the DOC.1-flagged `RHEMA_PROTOCOLS_PATH` drift was
caught by hand audit, not the structural detector).

## Verification

- `check-agent-docs-freshness.sh .` — **0 critical / 0 issues** (deterministic AC;
  Build-memory section present — 1F coverage check green)
- `check-append-only.mjs --base 20e29ec` — **OK**
- `check-build-memory.sh .` — **0 violations**
- docs-only — no code, no tests added, no deploy, $0

## Not in this PR

- Human-facing docs — DOC.1 (PR #114).
- Removal of the stale `.claude/worktrees/agent-*` worktree — noted, left for the
  operator (clean, on the merged `stevevitali/rh1-build-memory-v2-migration` branch).
- `projectStatus` — stays **IN_PROGRESS** per the GATE-ACCEPT readout: the build is not
  DONE while OPEN rows remain ledgered; `nextTicket: DONE` (row 93 was the last).
