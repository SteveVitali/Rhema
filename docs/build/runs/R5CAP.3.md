# R5CAP.3 — Round-5 capstone closure: routed gaps + the GATE-ACCEPT.R5 deviations draft — run ledger

- **Spec:** `docs/tickets/169_R5CAP.3__capstone-closure.md` (manifest row 169, round 5,
  Kind: capstone)
- **Normative loads:** `docs/build/reports/CAPSTONE_GAP_ANALYSIS_R5.md` (R5CAP.1's verdicts +
  routings — the input); `docs/post-spa-disposition-spec.md` (the ratified contract, §10
  register); `docs/build/CAPSTONE_CLOSURE.md` (the round-3/4 precedent this run appends to);
  `docs/tickets/DEFERRALS.md` + `docs/build/BACKLOG.csv` (effective statuses);
  `docs/tickets/170_GATE-ACCEPT.R5__accepted-deviations.md` (the consumer gate)
- **Base:** `stevevitali/r5cap-1-capstone-gap-analysis` tip @ `ddbd2e7`
- **Branch:** `stevevitali/r5cap-3-capstone-closure` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory
  @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-G1-1 REQ-G1-2
- **Live stage:** operator-gated — live re-verifies only where a routed gap needs one.
  **None did:** every routed gap binds an operator ruling/execution, a clock, an empty
  cohort, or a named in-chain ticket — no leg this ticket could honestly run. Zero prod
  contact, zero prod writes, $0.
- **Started:** 2026-10-17T00:15Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). The contract-named carrier set surveyed
row-by-row (status cell + unblock + verify recipe): D-CAP.2-1 (funded umbrella, CARRY),
D-SPA.24-1 (collab-wire legs — domains-bearing stage), D-SPA.16-1 / D-SPA.20-1 (N9 —
stripe-bearing stage), D-FIX.1-1 (T8 operator mint) / D-FIX.1-2 (T15/T16 paid halves —
ride the carried wave) / D-FIX.1-3 (BL-78 substrate executions + probes) / D-FIX.1-4
(digest clock), D-OPS.1-1 + D-SPA.6-1 (preview/prod-arm residuals), D-COST.1-1 (billed
actuals ← D-OPS.2-1) / D-COST.1-2 (empty `import_preview_p95_s` cohort) / D-COST.1-3
(paused out-of-class lever set), D-SLO.1-5..8 (named-red SLOs), D-BL38.1-1 (short-sha
stamp — fix-shape ruling) / D-BL38.1-2 (~10-30 purge clock), D-R5OPS.1-1 (first-finding —
no organic cohort) / D-R5OPS.1-2 (CDN origin 403 — contract ruling + IAM), D-SPA.28-1
(cleanup entry gate — merge sweep + nightly bake), D-P0.15-4 (live golden + manifest ←
GD-R5OPS.1-1 AWAITING). **No row is closeable by an offline docs ticket** — nothing here
unblocks a live leg; all are re-owed (dated notes appended) with their carriers verbatim,
never fabricated. GD-R5OPS.1-1 is a GATE DECISIONS item, not a DEFERRALS row — flagged
AWAITING, carried honestly into the deviations draft.

## Requirements (from the contract)

1. Every R5CAP.1-routed gap dispositioned — fix what's fixable (small honest fixes land
   with tests), else deferred-with-compensating-control or a deviation candidate.
2. The round-5 ACCEPTED-deviations list **drafted** for `170_GATE-ACCEPT.R5` — each row
   cites its evidence. Drafted, never signed.
3. `projectStatus` stays IN_PROGRESS unless the REQ-G1-1 completeness check passes (it
   does not — open carried items remain ledgered).
4. Close or re-owe every open row the contract names with honest evidence — never a
   fabricated flip.

## Acceptance criteria

- [ ] Zero R5CAP.1 gaps left unrouted (deterministic)
- [ ] The deviations list is complete and each entry cites its evidence (deterministic)
- [ ] universal phase-gate AC

## Plan

1. Re-walk R5CAP.1's routings table; for each routed item decide fixed / deferred /
   deviation — honestly: no routed item is an in-tree fix (all are live/operator/clock/
   future-ticket bound; REQ-MEM-6/7/8 belong to R5REC.2 by decomposition, not here).
2. Append the round-5 closure section to `docs/build/CAPSTONE_CLOSURE.md` (append-only —
   the round-3/4 text stays byte-frozen): dispositions + carrier census + the drafted
   deviations list (☐ operator sign-off column, unsigned).
3. Re-owe every contract-named OPEN row with a dated one-line note on its DEFERRALS cell
   (leading status token unchanged — effective status preserved).
4. Update the REQ-G1-1 COVERAGE_MATRIX row to cite the closure (owning_tickets += R5CAP.3).
5. Verify (turbo + pnpm test + matrix checker + build-memory + append-only), PR vs the
   r5cap-1 base, head-bound CI read, close via BUILD_INDEX/LEDGER/PHASE LOG.

## Test matrix

- `scripts/check-coverage-matrix.test.mjs` — 11-column schema, one row per spec id,
  verdict grammar, path/deferral/journey ref resolution (runs inside `pnpm test`).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — structure,
  DEFERRALS effective statuses, ledger/index coherence.
- `node docs/build/tools/check-append-only.mjs --base ddbd2e7` — LEDGER PHASE LOG + GATE
  DECISIONS prefix-only; DEFERRALS cells survive verbatim; manifest Plan-extensions grew.
- `pnpm turbo build lint typecheck` + `pnpm test` — docs-only diff must not regress.
- Manual: every deviations row cites ≥1 committed artifact (report/script/ledger/
  DEFERRALS id); every contract-named row appears in the dispositions table.

## Progress

- 00:15Z — Phase 0 complete: branch `stevevitali/r5cap-3-capstone-closure` @ `ddbd2e7`;
  skill + contract + CAPSTONE_GAP_ANALYSIS_R5 + DEFERRALS + LEDGER + precedent
  (CAPSTONE_CLOSURE CAP.3/SPACAP.3 sections) loaded. Committed mode; memory root
  `docs/build`.
- 00:2xZ — Disposition reasoning: R5CAP.1 routed 8 gap groups (5 PARTIAL + 3 MISSING) +
  the carried wave + named deviation candidates. **Zero are in-tree fixable** — each
  binds prod contact, an operator ruling/execution, a clock, an empty cohort, or
  R5REC.2's named scope. The honest closure is: deferred-with-compensating-control
  (carriers verbatim) + the drafted deviations register.
- 00:4xZ — Landed: `# R5CAP.3` section appended to `docs/build/CAPSTONE_CLOSURE.md`
  (R5.0 honest-scope statement · R5.1 routings 1:1 · R5.2 21-row carrier census · R5.3
  the 14-row unsigned deviations draft · R5.4 operator notes · R5.5 verdict record);
  dated `2026-10-17 (R5CAP.3)` re-owal notes on the 25 contract-named DEFERRALS rows
  (leading status tokens untouched); COVERAGE_MATRIX REQ-G1-1 row now cites
  `R5CAP.1;R5CAP.3` + `CAPSTONE_CLOSURE.md`.
- Evidence cites spot-verified before commit: `spa/main.tsx:58` (PRELOAD_SAFE deferral
  comment), `queries.ts:860/965/1062` (NAVC-18 `staleTime:0` comments) + `:1270`
  (`staleTime: PAGE_SESSION_IDLE_TTL_MS`), `runner.ts:82-85/165-189/333/368`
  (`cap_overrun` verdict + window pause), `page-mount.tsx:331` (`data-page-session`),
  `reports/2026-10-15_VERIF.1-thin-legs/` (inert + forced-SSR captures incl. phone
  `ssr-cause`), `runs/VERIF.1.md` (dossier sole-renderer-SPA finding).

## Gap table

| item (contract §) | required layer | achieved layer | status | evidence | if not met |
|---|---|---|---|---|---|
| Deliverable 1 — every routed gap dispositioned | engineered | engineered | met | CAPSTONE_CLOSURE.md §R5.2 dispositions table — all 9 R5CAP.1 routings + carrier census | — |
| Deliverable 2 — deviations list drafted, each row cites evidence | engineered | engineered | met | CAPSTONE_CLOSURE.md §R5.3 — 13 rows, every cell cites a committed artifact/D-id | — |
| Deliverable 3 — projectStatus IN_PROGRESS | engineered | engineered | met | LEDGER CURRENT STATE unchanged; REQ-G1-5 PARTIAL stands | — |
| Deliverable 4 — close or re-owe named rows | engineered | engineered | met | dated re-owal notes on the 21 named DEFERRALS rows; zero fabricated flips | — |
| AC: zero gaps unrouted | deterministic | deterministic | met | §R5.2 covers every routings-table row 1:1 | — |
| AC: deviations complete + evidence-cited | deterministic | deterministic | met | §R5.3 — evidence column is mandatory per row | — |
| AC: universal phase-gate | deterministic | deterministic | pending verify | turbo/test/validators | — |

## Evidence log

- `pnpm turbo build lint typecheck` — **135/135** (FULL TURBO cached, docs-only diff).
- `pnpm test` — **501 files / 5,814 pass / 4 skip / 0 fail** (344 s; identical to base).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — **0
  violations** (8 warnings, all pre-existing classes: manifest banner/order, PHASE LOG
  size legacy, live-verification vocabulary `run`, legacy readouts, missing Harness
  headers on old ledgers).
- `node docs/build/tools/check-append-only.mjs --base ddbd2e7` — **clean** (PHASE LOG +
  GATE DECISIONS prefix-only growth; every base DEFERRALS cell survives verbatim inside
  the same-position cell; manifest Plan-extensions untouched).
- `pnpm vitest run scripts/check-coverage-matrix.test.mjs` — **6/6** (11-col schema,
  one row per spec id, verdict grammar, ref resolution).
- DEFERRALS re-owal count: `grep -c 're-owed' docs/tickets/DEFERRALS.md` = **25** dated
  notes, one per contract-named carrier; `git diff` shows each as an in-cell tail
  append — no row deleted, no status token moved.
- Live verification: **n-a / gate-pending by contract** — `Live stage: operator-gated —
  live re-verifies only where a routed gap needs one`; no routed gap permitted an
  in-scope live leg (all are prod-contact / operator-execution / clock / cohort / named
  ticket bound — an ADR-013 pause class). Zero prod contact, zero prod writes, $0.

## Self-review

- Fresh re-read of the appended section from disk: every deviations row's "What
  deviates"/"Covering row" cites a committed artifact or D-id; the R5.1 table covers
  R5CAP.1's routings summary 1:1 (8 rows incl. the carried wave) plus the 11
  MET-ENGINEERED carriers; §R5.2's census names every row re-owed in DEFERRALS
  (D-OBS.1-3 + D-OPS.2-1 added on the re-read — they carry re-owal notes and must
  appear in the census).
- Accuracy checks vs evidence: NAVC-18 cites (`queries.ts:1270` vs `:860/:965/:1062`),
  `capUsd`/`cap_overrun` (runner.ts), `data-page-session` (page-mount.tsx:331),
  PRELOAD_SAFE deferral (main.tsx:58), phone/`ssr-cause` captures
  (`2026-10-15_VERIF.1-thin-legs/`), funded refusal ($80.86 ≥ ~$60,
  `2026-10-16_funded-env/`), cost before/after ($285.80→$198.32, `2026-10-16_COST.1/`),
  CDN verdict (`usercontent-cdn-verify.json`), golden driver fail-closed
  (`nightly-golden-driver.mjs`). All confirmed.
- Honesty: GD-R5OPS.1-1 flagged AWAITING (deviation row 8 + §R5.4 note) — not answered;
  `projectStatus` IN_PROGRESS kept; zero DEFERRALS flips; nothing signed/ticked for the
  operator (Sign-off column is `☐ operator` on all 14 rows).
- ADR assessment: no owned decision this run — the register drafts, the operator rules
  at row 170. Precedent (SPACAP.3) wrote an ADR only for its code fix; there is no code
  fix here.

## Evidence report

_(filled at close, after the head-bound CI read)_
