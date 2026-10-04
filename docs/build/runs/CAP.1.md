# CAP.1 — Capstone gap analysis (run ledger)

- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/86_CAP.1__capstone-gap-analysis.md` (manifest row 86 — the first standard
  CAP.1; the ledger-only CAPSTONE row of 2026-09-26 is a different artifact, see §5)
- **Branch:** `stevevitali/cap-1-capstone-gap-analysis`
- **Base:** `stevevitali/stb-5b-bounded-paid-legs` @ `6397c1f` (PR #107, OPERATOR merge policy —
  nothing merged by the build)
- **Spend:** $0 — audit work, no inference, no deploy, no prod reads or writes

## 1. The independence guarantee (the ticket's central constraint)

Verdicts were recorded **before** any `docs/build/runs/*` ledger or
`docs/build/readouts/*` file was opened this session. The ordered read set was:
spec in full → `00_MANIFEST.md` → `DEFERRALS.md` (statuses re-extracted
mechanically) → `BUILD_INDEX.md` (PR index, not a run ledger) → the composed
tree (route tables, `registry.ts`, contracts, manifests, colocated tests).
Only after `COVERAGE_MATRIX.csv` and `CAPSTONE_GAP_ANALYSIS.md` were written and
validated did this run open `runs/*` + `readouts/*` for reconciliation (§5).

## 2. Deliverables

| Deliverable | Path | State |
|---|---|---|
| Coverage matrix | `docs/build/COVERAGE_MATRIX.csv` | 474 rows / 11 exact columns; every cited path re-verified on disk |
| Gap analysis | `docs/build/CAPSTONE_GAP_ANALYSIS.md` | method, roll-ups, seam hunt, top-11 gaps routed |
| Completeness test | `scripts/check-coverage-matrix.test.mjs` | 6 vitest assertions — header, one-row-per-REQ, verdicts, evidence nonblank, ref integrity |
| ADR | `docs/adr/ADR-089-cap1-verdict-rubric.md` | the verdict rubric as an owned decision (index regenerated via `adr-index.sh`) |
| New deferrals | `docs/tickets/DEFERRALS.md` | `D-CAP.1-1` (REQ-IDE-1 layout-restore clause), `D-CAP.1-2` (REQ-BETA-5 emission-audit coverage) — the only two un-tracked findings |
| Build memory | LEDGER / BUILD_INDEX / this file / `pr/CAP.1.md` | updated this run |

## 3. Independent verdict roll-up

474 spec ids (`REQ-[A-Z]+-\d+`, extracted mechanically from `rhema-design-spec.md`):

| MET | MET-DIFFERENTLY | PARTIAL | MISSING | AT-RISK-INTEGRATION |
|---|---|---|---|---|
| 309 | 18 | 113 | 33 | 1 |

30 of 33 MISSING are spec-scheduled 1.x/Later scope (level column carries "not
owed yet"); 2 are amended-away partner rows (BETA-16/17, self-serve substituted);
none is a silent gap — every MISSING row names its phasing. The single
AT-RISK-INTEGRATION is **REQ-ACCT-3** (export→import: T3 red on two live defects,
D-STB.5a-1/-2 — the composed seam broke where each side passed alone).

The PARTIAL mass decomposes structurally: user surfaces whose containing surface
has no green journey walk (routed **CAP.2**), owed live legs on existing `D-*`
rows (routed to the rows / **CAP.3**), unreachable-by-construction capabilities
(D-STB.5b-2/-3), and operator/HUMAN-owned halves (H2/H3/H4/H7). Full seam-hunt
detail is in the analysis doc §4.

## 4. Checks run this session

| Check | Result |
|---|---|
| `pnpm vitest run scripts/check-coverage-matrix.test.mjs` | **PASS** 6/6 |
| `node docs/build/tools/check-append-only.mjs --base 6397c1f` | **OK** (path correction: the ticket text names `scripts/check-append-only.mjs`; the committed tool lives at `docs/build/tools/check-append-only.mjs` — recorded verbatim) |
| `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` | **0 violations**, 7 warnings — all pre-existing baseline warnings (manifest banners, ledger-budget size, legacy index statuses, readout guard sentence, harness headers on pre-existing ledgers); first run flagged ADR-089's missing `## Revisit trigger`, fixed before this line |
| `pnpm test` | **PASS** — 448 files / 4,552 tests passed, 4 skipped, **0 failed** (449 files, 455.6 s; incl. the new matrix test + `privsep.docker` 217 s) |
| `pnpm check:licenses` | **OK** — 745 packages |
| `pnpm check:protocol-markers` | **OK** — 54 public-facing files clean |
| `pnpm turbo build lint typecheck` | **135/135** (FULL TURBO — all cache hits; only docs + the matrix test changed) |

CSV self-validation (run before the test existed): 474/474 id-set equality vs the
spec extraction, zero dupes, all 11 columns populated, all `MET`/`MET-DIFFERENTLY`
rows evidence-nonblank, **0 missing cited paths** (89 initial citation misses —
guessed test filenames — corrected to the real colocated files; e.g.
`packages/mirror` tests are delivery/validation/materialize, not freeze/manifest).

## 5. Reconciliation vs `runs/*` + `readouts/CAPSTONE.md` (post-verdict)

Read after the matrix froze. **No contradiction requiring a verdict change.**

- The 2026-09-26 `readouts/CAPSTONE.md` (PRs #1–#76, **470** ids — pre-round-3
  spec) classified 115 IMPL / 301 IMPL-live-deferred / 44 DEFERRED / 9
  GATE/HUMAN / 1 CONSTRAINT / **0 GAP**. Under this run's stricter rubric its
  "IMPL(live→def)" splits into MET (legs since verified — STB.2/3/4/5a, journey
  greens) and PARTIAL (still-open rows, un-walked surfaces). Its "0 GAP" is
  consistent with this matrix's finding that every non-MET row has an owner,
  a deferral row, or a spec-deferred level. The +4 ids since then are
  REQ-SPEC-29..32 (round-3 amendments).
- Verdicts where CAP.1 is **stricter on newer information**: REQ-ACCT-3 (prior
  IMPL(live→def) → AT-RISK; the live legs ran after that pass and found
  D-STB.5a-1/-2), REQ-ARCH-13 (→ PARTIAL; 2238 ms breach measured), REQ-DATA-20
  and REQ-ARCH-21 (→ PARTIAL; D-STB.5b-2/-3 found both unreachable), REQ-BETA-5
  (→ PARTIAL; emission coverage never audited → D-CAP.1-2), REQ-IDE-1 (→
  PARTIAL; layout-restore clause untracked → D-CAP.1-1).
- `readouts/GATE-G2.md` confirms the matrix's EVAL treatment: the eval never
  ran; G2 is a HARD gate before public launch; §16.4 claims do not ship — so
  REQ-EVAL-15/-16 stay PARTIAL and REQ-EVAL-19's prohibition is the MET row.
- Spot-checked run ledgers (STB.5a/5b, SLO.1, ECON.1, ACT.1, CITE.1, RES.2,
  DEF.4): every ledger's own claims match or are more conservative than the
  matrix's verdict on the same requirements. CITE.1's Stage-B block (expired
  Pulumi credential + weekly guard) matches the CITE.1 routing.
- One prior-ledger inaccuracy worth noting, not re-litigating: STB.5b recorded
  its own Stage-B as refused correctly; the matrix independently marks the
  underlying requirements PARTIAL, which is what the ledger's carry-forward
  notes imply — no write-back needed (append-only).

## 6. Decisions

- **ADR-089** — the five-verdict rubric + evidence bars (MET needs tests + a
  green journey walk for user surfaces; MISSING carries spec-phasing in `level`;
  MET-DIFFERENTLY names the superseding amendment/ADR).
- **Two new deferral rows** — the audit's own findings with no prior tracker
  (`D-CAP.1-1`, `D-CAP.1-2`), both routed to CAP.2's composed verification.
- **No spec amendment requested** — the gaps are verification debt + two live
  defects, not spec-tree drift. `ITERATION_CAPS.{audit,gapCheck}` (D-STB.5b-2)
  is the one place a spec-amendment *or* a wiring fix could resolve; routing
  left to CAP.3 deliberately.
- **Routing summary for the top gaps:** CAP.3 — ACCT-3 seam, paid B-legs,
  DATA-20/ARCH-21 wiring, ARCH-13 SLO breach, billing live legs, R9 refund
  ruling, D-STB.5b-1 meter fix; CAP.2 — the un-walked surface PARTIALs + the
  composed re-verification at a merged SHA; CITE.1 — the citation-completeness
  legs; H2/H3/H4/H7 — corpus, partners, venue table, operator arms.

## 7. Provenance

Commit(s) on `stevevitali/cap-1-capstone-gap-analysis` stacked on `6397c1f`;
PR number + SHA recorded in `BUILD_INDEX.md` / PHASE LOG at close.
