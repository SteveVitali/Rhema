# SPAREC.1 — run ledger: backlog + operational readiness (the round-4 reconcile pass)

- **Ticket:** `docs/tickets/144_SPAREC.1__backlog-and-readiness.md` (manifest row 144)
- **Base:** `stevevitali/spacap-3-capstone-closure` @ `d5e5a3a` (the chain tip, confirmed clean +
  synced at fork).
- **Branch:** `stevevitali/sparec-1-backlog-readiness`.
- **PR:** stacked on `stevevitali/spacap-3-capstone-closure`; `gh pr checks --watch=false` read
  once at closeout (§ 8).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** `reconcile-build mode=backlog` — documentation/reconciliation only, offline-only, $0,
  no deploys, no production mutations, mergePolicy OPERATOR.
- **Spend:** $0.

## 1 — What this run is

The round-4 backlog reconcile: every `OPEN`/`PARTIAL` DEFERRALS row, every owed coverage-matrix
row, and every live ADR revisit trigger lands in exactly one `BACKLOG.csv` `sources` cell; the
human-readable backlog, the operational-readiness doc, and the ops runbook are rewritten for the
post-migration world; build-memory closes out per v2. **Nothing closed** — the run was
offline-only at $0 with no deploy and no operator secret, so no row's unblock arrived.

## 2 — What landed

### Backlog reconciliation (`BACKLOG.csv` — 5 rows appended, 2 dedup fixes)

- **BL-80** (`operational-prereq`, 29 sources) — the non-prod Resend secret + the whole preview
  family: `D-MAINT.6-1`, `D-SPA.6-1`, all `D-SPA.*-1` preview two-legs (12–24), `D-SPA.25-1` (T17),
  all `D-SPA.*-2` preview drills. One unblock: operator seeds `rhema-nonprod-resend-api-key`.
- **BL-81** (`operational-prereq`, 59 sources) — the 15-segment activation cadence: all 56
  `D-SPAF.*-1..-4` per-surface prod legs + the cleanup-wave entry gates `D-SPA.26-1/-27-1/-28-1`.
- **BL-82** (`operational-prereq`, 6 sources) — post-tip composed verification:
  `D-SPACAP.2-1..-4`, `D-SPACAP.3-1`, `D-MAINT.4-1` — SHA-matched live evidence only.
- **BL-83** (`process`, status `accepted`, 6 sources) — the GATE-ACCEPT.SPA signed deviations:
  REQ-SEQ-7/-9/-10, REQ-VFY-6/-8/-10 — tracking items, not gate-blocking.
- **BL-84** (`process`, 6 sources) — ADR revisit watches: ADR-104..ADR-109.
- **Dedup (validator-forced, minimal):** `ADR-021`/`ADR-024` removed from BL-79's sources (already
  homed on BL-56/BL-30 — RES.3 cited them as context, not ownership); `D-OBS.1-3` removed from
  BL-78's sources (single home = BL-74, the row's own nightly-green item; the N9-reseat arm stays
  in BL-78's title scope).

Result: **465 expected sources — complete + non-duplicating + verdict-consistent** (was 357 at
REC.1's round-3 pass; the round-4 chain added 108 owed sources).

### Verdict-consistency repair (ADR-109 — the owned decision)

`check-backlog.sh` flagged two `MET` rows citing OPEN legs (`met-with-owed-leg`). The honest
BM-VERDICT-01 verdict `MET-ENGINEERED(D-…)` was unwritable — the in-repo gate
(`scripts/check-coverage-matrix.test.mjs`) enforced a pre-parameterized five-bare-value set, the
exact cause of MAINT.3's dishonest `MET` revert on REQ-SPEC-31. Fixed at the gate: the verdict
cell now validates the full grammar (bare names + `NAME(params)` on the three parameterized
names); `REQ-SPEC-31` → `MET-ENGINEERED(D-RES.1-2)`, `REQ-ED-17` → `MET-ENGINEERED(D-SPA.25-1)`.
Sums now honest: engineering closed 513/666, requirement satisfied 511/666.

### DEFERRALS (append-only)

- `D-OBS.1-3` — dated status-hygiene note: a literal `|` inside `cells[rig|tier|toggles]`
  truncated the validator's last-cell read, leaving the row invisible to the gather; the note
  restores a canonical `OPEN` at the tail (the row was always OPEN in prose).
- `## SPAREC.1 — round-4 reconciliation map` appended — per-home dispositions, the carried-vs-
  closed accounting, the mooted-drill rationale (D-SPA.23-2/-24-2 stay OPEN — their surviving arm
  rides the activation).

### Readiness + runbook

- `OPERATIONAL_READINESS.md` rewritten — post-round-4 verdict (engineered/deterministic/live
  layers separated), post-migration ops facts (forced SSR is code; no flag rollback; activation is
  a sequence; provenance pre-chain), 16-row capability matrix updated, critical path re-ordered
  (seed secret → 15-segment activation → tip verification → the unchanged historical path), costs
  + risk register updated.
- `BACKLOG.md` rewritten — 2026-10-10 reconcile state, matrix sums, status-parse audit, rows by
  landing, ADR-104..109 sweep rows, risk-register review.
- `infra/PROD-BRINGUP.md` — the `rhema:spaSurfaces` bullet marked DELETED post-SPA.28 (historical
  text retained for pre-cleanup checkouts); new **§13 Post-migration SPA operations**: §13.0
  pre-chain provenance (web `6ebb1cb` / api `0acd16d`, `/bff/app` 404, markers absent,
  `check-deploy-provenance` gate), §13.1 forced-SSR is code (phone + showcase twin, ADR-108;
  inert retired signals), §13.2 rollback = `git revert` + redeploy + re-verified legs (no flag
  path exists), §13.3 the 15-segment activation cadence + Arm B, §13.4 the owed
  `rhema-nonprod-resend-api-key` (never fabricated; prod legs don't need it).

## 3 — Deviations from the ticket contract

1. **ADR-109 added** — the verdict-grammar divergence was a decision this ticket owns (the
   reconcile could not land clean without it); recorded per BM-ADR-01 rather than slipped in.
2. **Two prior-row source-cell edits** (BL-78, BL-79) — required by the no-duplicates invariant;
   minimal token removals, documented here and in BACKLOG.md; no prior row's title/status touched.
3. **No DEFERRALS status flips** — the mooted drills (D-SPA.23-2/-24-2) stay OPEN rather than
   closing on a code fact: their disposition is an activation decision, not an offline one.

## 4 — Validator + gate results (all green at closeout)

| Command | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135** tasks |
| `pnpm test` | **487 files / 5,562 pass / 6 skip / 0 fail** |
| `pnpm check:licenses` | OK — 822 packages |
| `pnpm check:protocol-markers` | OK — 248 files |
| `pnpm check:no-cookies` | OK — 253 files |
| `pnpm check:spa-budget` | OK — all ceilings held |
| `pnpm check:spa-env` | OK — 111 sources / 146 artifacts |
| `check-backlog.sh` | **465 expected sources — complete + non-duplicating + verdict-consistent** |
| coverage-matrix test | 6/6 green (the extended grammar gate) |
| `check-build-memory.sh .` | **0 violations** (7 warnings — the pre-existing baseline class: manifest banners, gate-cell wording, ledger nextTicket ordering, phase-log sizes, legacy index values, readout guard, old Harness headers) |
| `check-append-only.mjs --base d5e5a3a` | **OK** |

## 5 — Source accounting

- 465 expected sources; 106 new to round 4 (29 preview/secret + 59 activation + 6 tip-verification
  + 6 accepted deviations + 6 ADR watches); D-OBS.1-3 newly visible to the gather (+1 parse fix).
- DEFERRALS status read (checker-canonical): DONE 116 · OPEN 168 · PARTIAL 35 · ACCEPTED-SKELETON 1
  — 203 owed rows, every one homed on an open row.
- Round-3 rows preserved verbatim except the two source-cell dedups; round-4 rows are BL-80..BL-84
  appended only.

## 6 — What remains open (carried, not closed)

Everything: BL-80's Resend-secret family (operator act), BL-81's 15-segment cadence (operator
merge/deploy), BL-82's tip verification (post-cadence), BL-83's accepted deviations (tracked),
BL-84's watches (standing), and the whole round-3 path unchanged (BL-01..BL-79).

## 7 — Files changed

`docs/build/BACKLOG.csv` (+5 rows, −2 sources on BL-78, −2 on BL-79) · `docs/build/BACKLOG.md` ·
`docs/build/OPERATIONAL_READINESS.md` · `docs/build/COVERAGE_MATRIX.csv` (2 verdict cells + 1
routing cell) · `scripts/check-coverage-matrix.test.mjs` (BM-VERDICT-01 grammar) ·
`docs/adr/ADR-109-coverage-matrix-verdict-grammar.md` (new) + regenerated `docs/adr/README.md` ·
`docs/tickets/DEFERRALS.md` (D-OBS.1-3 note + SPAREC.1 reconciliation map) ·
`infra/PROD-BRINGUP.md` (§2 bullet supersession + §13) · `docs/build/runs/SPAREC.1.md` ·
`docs/build/pr/SPAREC.1.md` · `docs/build/BUILD_INDEX.md` (+1 row) · `docs/build/LEDGER.md`
(state advance + phase-log append).

## 8 — PR checks

`gh pr checks --watch=false` read once at closeout — recorded in § 8 of the closeout commit.
