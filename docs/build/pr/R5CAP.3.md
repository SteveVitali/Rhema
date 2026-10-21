# R5CAP.3 — Round-5 capstone closure: routed gaps + the GATE-ACCEPT.R5 deviations draft

Manifest row 169 · stacks on `stevevitali/r5cap-1-capstone-gap-analysis` (tip `ddbd2e7`) ·
merge policy **OPERATOR** — do not merge from the build environment · contract
`docs/tickets/169_R5CAP.3__capstone-closure.md` · run ledger `docs/build/runs/R5CAP.3.md` ·
the closure itself is appended to `docs/build/CAPSTONE_CLOSURE.md` (`# R5CAP.3` section —
the round-3/4 text is byte-frozen above it, per append-only).

## What lands

**Every R5CAP.1-routed gap is dispositioned — zero left unrouted.** The honest shape of
this closure is different from SPACAP.3's: R5CAP.1 routed **no in-tree fixable item**, so
nothing here is a code fix — every routed gap is deferred-with-compensating-control on a
named carrier or drafted as a signed-deviation candidate:

- The 5 PARTIAL routings (REQ-OPS-3/6/7, REQ-COST-5, REQ-G1-5) → deferred, each mapped to
  a drafted deviations row (CAPSTONE_CLOSURE §R5.3 rows 7–11) with its carrier verbatim.
- The 3 MISSING routings (REQ-MEM-6/7/8) → deferred to the named in-chain owner **R5REC.2**
  (manifest row 172) — drafted as deviations row 13.
- The carried funded wave (GD-FUNDED.1-1 CARRY) → deviations row 6 on D-CAP.2-1; $0 spent.
- The 11 MET-ENGINEERED carriers (NAVT-5, OPS-4, COST-1/6, FIX-*) → §R5.2 census, rows 5/12.

**The round-5 ACCEPTED-deviations list is drafted — never signed** — 14 rows at
`CAPSTONE_CLOSURE.md` §R5.3 for the operator's signature at `170_GATE-ACCEPT.R5`:
preload-deferred (NAVM-7) · phone-contract boundary ratified (dossier sole-renderer SPA at
phone width, live-verified `ffbb8ad`) · levered-expected cap basis (ECON-9/Q-ECON.e) ·
NAVC-18 mark-read freshness asymmetry · posture-bound preview residuals · the carried
funded wave · CDN signed-delivery nonfunctional · golden budget AWAITING (GD-R5OPS.1-1 —
flagged, never answered) · merge-sweep-owned nightly green + prod layer · ~$50 target
unmet ($198.32 stands; paused classes) · H8 bundle remainder · clock/cohort/ruling-bound
residuals · spec fold-back at row 172 · the umbrella honestly-owed tail.

**Honest carries, verbatim:**

- `projectStatus` stays **IN_PROGRESS** — REQ-G1-5 is PARTIAL and the open rows of §R5.2
  remain ledgered; the REQ-G1-1 completeness check does not pass and is not claimed to.
- **GD-R5OPS.1-1** (the ~$150–300/night golden-run budget, ⚑ Q-GOLDEN) stays AWAITING —
  carried into the register as row 8, flagged for the operator, never answered.
- **Zero DEFERRALS flips** — 25 contract-named OPEN rows re-owed with dated one-line
  notes (carriers verbatim); none was closeable offline; none fabricated.
- Live stage boundary held: no leg needed prod contact → **zero prod contact, $0**.

## What changed (files)

- `docs/build/CAPSTONE_CLOSURE.md` — appended `# R5CAP.3` section: honest scope statement
  (R5.0), routed-gap dispositions 1:1 (R5.1), the 21-row carrier census (R5.2), the
  14-row unsigned deviations draft (R5.3), operator note items (R5.4), verdict record
  (R5.5).
- `docs/tickets/DEFERRALS.md` — dated `2026-10-17 (R5CAP.3)` re-owal notes appended inside
  the status cells of the 25 named carriers; leading status tokens unchanged (all OPEN).
- `docs/build/COVERAGE_MATRIX.csv` — REQ-G1-1 row cites this closure
  (`R5CAP.1;R5CAP.3` owners; evidence adds `CAPSTONE_CLOSURE.md`).
- `docs/build/runs/R5CAP.3.md` — the run ledger.

## Verification

- `pnpm turbo build lint typecheck` — **135/135** · `pnpm test` — **501 files / 5,814
  pass / 4 skip / 0 fail** (docs-only diff; identical to base).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — **0
  violations** (8 pre-existing-class warnings).
- `node docs/build/tools/check-append-only.mjs --base ddbd2e7` — **clean** (PHASE LOG +
  GATE DECISIONS prefix-only; DEFERRALS cells survive verbatim).
- `pnpm vitest run scripts/check-coverage-matrix.test.mjs` — **6/6**.
- No live legs run and none owed by this ticket — every routed gap binds a live stage the
  `Live stage: operator-gated` header does not authorize (ADR-013): each is recorded as a
  deviation/owed item with its recipe, reported, never self-authorized.

## Requirement ids stamped

REQ-G1-1 (the completeness check consumed — every routed gap dispositioned, the register
drafted; `projectStatus` honestly IN_PROGRESS) · REQ-G1-2 (no discharged work re-emitted —
the closures are dispositions on named carriers, not re-runs).

## Acceptance criteria → evidence

| AC | status | evidence |
|---|---|---|
| Zero R5CAP.1 gaps left unrouted | met | CAPSTONE_CLOSURE §R5.1 — all 8 routings + the carried wave + 11 ME carriers mapped 1:1 |
| Deviations list complete + each entry cites evidence | met | §R5.3 — 14 rows; every row names its covering D-id/report/script |
| universal phase-gate | met | turbo 135/135; test 5,814/0 fail; build-memory 0 violations; append-only clean; matrix 6/6 |
