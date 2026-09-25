<!--
  docs/build/readouts/CAPSTONE.md — the manifest's ledger-only CAPSTONE row: whole-chain gap analysis
  of the 50 executed ticket rows (PRs #1–#76) against the ratified design spec (docs/rhema-design-spec.md,
  470 REQ ids across 22 families) + composed end-to-end verification of the chain tip.
  Produced 2026-09-26 on `stevevitali/p1-22-launch-checks` (chain tip 2a8a2b8 + the CAPSTONE fixes).
  No number in this document is fabricated; every gate below was run fresh in this session.
-->
# CAPSTONE — whole-chain gap analysis + composed verification

**Scope.** All 50 manifest ticket rows are executed (LEDGER `nextTicket: DONE`); this row is the
ledger-only whole-chain verification the manifest schedules after row 50. It does four things:

1. **Per-REQ coverage** — every `REQ-*` id in the spec mapped to its owner (ticket / gate / deferral),
   classified `IMPLEMENTED`, `IMPLEMENTED (live legs deferred)`, `DEFERRED` (manifest-level),
   `GATE/HUMAN`, or `GAP`.
2. **Composed verification** — every gate command run fresh at the chain tip, real numbers.
3. **Cross-cutting invariant + out-of-scope sweep** — the manifest's invariant list and its
   "no ticket does this" list rechecked against the tree.
4. **Honest negative space** — what is not yet verified, grouped by the dependency that blocks it.

## 1. Composed verification (fresh runs, this session)

| Gate | Result | Numbers |
|---|---|---|
| `pnpm turbo build lint typecheck` | **PASS** | 132/132 tasks (84 cached / 48 rebuilt after the protocols-manifest edit), 1m39s |
| `pnpm test` | **PASS** | **3,496 passed / 3 skipped / 375 files**, 643 s. Reconciles P1.22's claim (3,496/3/375 — the PHASE LOG's `3,493` was a pre-close count; commit message + fresh run agree at 3,496). |
| `pnpm check:licenses` | **PASS** | 607 packages checked |
| `pnpm check:protocol-markers` | **PASS** | 45 public-facing files scanned, no markers |
| `pnpm check:no-cookies` | **PASS (after fix)** | 28 ingestion-surface files scanned. First run FAILED: 2 hits at `apps/web/src/server.ts:193-194` — the CSP middleware's `set-cookie` re-append (viewer-session passthrough, not a connector credential). Resolved by annotating the lines with the gate's documented `never-cookies` exemption (the scanner's ALLOW list already exists for exactly this class). |
| `node scripts/check-upstream-diff.mjs` | **PASS (after fix)** | 22 ported files reconcile with pin `5fef4165` + only sanctioned edits. First run FAILED: `skills/bootstrap-persona/SKILL.md` carried the P1.14 `phase:"reseed"` value + a Rhema-owned "Phase reseed" section with no manifest declaration — a genuine REQ-SPEC-22 drift the gate caught. Fixed: two `category:"inputs"` transforms declared in `upstream-port.manifest.mjs`; `PROTOCOLS_VERSION` re-frozen (`0.4.0+76956a14…` → `0.4.0+619079b3ba004cf1`). |
| `bash …/check-build-memory.sh .` | **PASS** | 0 violations, 0 warnings |

### Test flake accounting

The full suite was run three times this session:

- **Run 1** — 2 failures: the protocols-version drift (real finding, fixed above) + the archive
  `rejects a non-export zip` test timing out at the 5 s default under full parallel load.
- **Run 2** — 1 failure: the same archive test timing out again under load (green in isolation).
- **Run 3 (authoritative, after fixes)** — **all green: 375 files, 3,496 tests passed, 3 skipped.**

The archive test was the same class as the documented run-sheet lever-matrix flake (embedded-pg
seed under full-suite parallelism edging past a default timeout, never an assertion failure). It now
carries `{ timeout: 30_000 }` — the identical headroom its two sibling tests in the same file already
had (they were hardened the same way at P1.18). The pre-existing `packages/run-sheet` lever-matrix
~100 ms perf-budget flake under parallel load did not recur in run 3.

## 2. §17 Phase-1 exit criterion — CAPSTONE status

P1.22's `docs/phase1-exit-readout.md` is the criterion-by-criterion readout; CAPSTONE verified its
labels against the deferral rows and the fresh gates. One stale clause found — a dated correction is
appended to that document (append-only convention).

| Criterion | Readout verdict | CAPSTONE check |
|---|---|---|
| §3.5 activation metrics measurable | MET (build) | **Consistent.** Whitelisted analytics contract + intake exist; "measurable ≠ measured" is honestly labelled. |
| First finding ≤ 4 min | UNMEASURED — Stage B | **Consistent.** Honest; rides D-P1.22-2. |
| Nightly golden green on all 4 protocols | UNMEASURED — Stage B | **Consistent.** `scripts/nightly-golden.mjs` exists + tested; no live nightly has run (D-P0.15-4 OPEN). |
| Instrumented costs replace provisional figures | PARTIAL | **Consistent, with one stale clause:** the row cites the ±2% cross-check as "awaiting the operator's ruling (D-PRB.16-5)" — **D-PRB.16-5 was ruled DONE 2026-09-22** (cap-meter-only; the ~18 % proxy-list-vs-committed gap is the rate card working as designed). The genuinely-unresolved residue is `sdk_estimate` rows unpopulated live (D-P0.08-2) + protocols 2–4/`RIGOR_MULTIPLIERS` still modelled (D-P0.15-2 PARTIAL). Verdict stays PARTIAL; the citation was stale, not the verdict. Correction appended to the readout. |
| Benchmark wave 1 dispositioned | NOT RUN (G2) | **Consistent.** G2 deferred by operator decision 2026-09-15 (readouts/GATE-G2.md); the machinery is in `@rhema/benchmark`. |
| No superiority claim on launch surfaces (REQ-EVAL-19) | MET (deterministic) | **Consistent.** `COMPARATIVE_WAVE_MET = false` pinned; `launch-surface.test.ts` 26 assertions green in run 3. |

**§17 summary:** the Phase-1 criterion is **NOT met as written** — and the spec never promised it
would be met at chain tip: rows 2/3 are live-only legs (explicitly UNMEASURED, deferral-tracked),
row 4 is PARTIAL, row 5 is an operator-deferred gate. Nothing in the chain claims otherwise.

## 3. Per-REQ coverage — the whole inventory

470 unique `REQ-*` ids appear in `docs/rhema-design-spec.md` (id pattern `REQ-[A-Z]+-[0-9]+`, the
manifest's `req_id_pattern`). Each was resolved against the manifest's authoritative
Requirement-ID→ticket index, then classified:

- **IMPLEMENTED** — owner ticket landed Stage A; deterministic evidence in `runs/<ID>.md`; no open
  deferral on the owner.
- **IMPLEMENTED (live legs deferred)** — owner landed Stage A; open `D-*` row(s) carry the live/Stage-B
  legs (the row ids are in the evidence column).
- **DEFERRED** — manifest-level deferral (1.x, superseded, reserved, out-of-scope constraint) — no
  D-row owed because the manifest itself is the row.
- **GATE/HUMAN** — owned by a gate (G1–G3) or HUMAN row (H2/H3) or the manifest/ledger itself.
- **CONSTRAINT** — REQ-MOBILE-1 (the scope rule; binds, nothing to build).
- **GAP** — **zero.** Every spec REQ has an owner or an explicit deferral.

| Status | Count |
|---|---|
| IMPLEMENTED | 115 |
| IMPLEMENTED, live legs → deferrals | 301 |
| DEFERRED (manifest: 1.x / superseded / reserved / out-of-scope) | 44 |
| GATE/HUMAN-owned | 9 |
| CONSTRAINT | 1 |
| **GAP** | **0** |

### Per-family summary

| Family | REQs | Implemented (deterministic) | Implemented, live legs deferred | Deferred (1.x / superseded / out-of-scope) | Gate/HUMAN-owned | Constraint |
|---|---|---|---|---|---|---|
| REQ-ACCT | 4 | 1 | 3 | 0 | 0 | 0 |
| REQ-ARCH | 40 | 9 | 30 | 1 | 0 | 0 |
| REQ-BETA | 22 | 10 | 3 | 3 | 6 | 0 |
| REQ-BILL | 19 | 4 | 15 | 0 | 0 | 0 |
| REQ-CHAT | 30 | 0 | 28 | 2 | 0 | 0 |
| REQ-DATA | 44 | 22 | 20 | 2 | 0 | 0 |
| REQ-EVAL | 20 | 0 | 18 | 0 | 2 | 0 |
| REQ-GATE | 16 | 12 | 1 | 3 | 0 | 0 |
| REQ-GENRE | 7 | 0 | 7 | 0 | 0 | 0 |
| REQ-GROWTH | 17 | 0 | 17 | 0 | 0 | 0 |
| REQ-IDE | 50 | 7 | 41 | 2 | 0 | 0 |
| REQ-INGEST | 14 | 0 | 14 | 0 | 0 | 0 |
| REQ-MOBILE | 22 | 1 | 2 | 18 | 0 | 1 |
| REQ-OBJ | 19 | 4 | 10 | 5 | 0 | 0 |
| REQ-PERSONA | 27 | 0 | 26 | 1 | 0 | 0 |
| REQ-POS | 13 | 2 | 10 | 1 | 0 | 0 |
| REQ-PROD | 16 | 8 | 6 | 1 | 1 | 0 |
| REQ-RUN | 18 | 16 | 2 | 0 | 0 | 0 |
| REQ-SPEC | 28 | 12 | 12 | 4 | 0 | 0 |
| REQ-VIS | 11 | 2 | 9 | 0 | 0 | 0 |
| REQ-VIZ | 16 | 0 | 16 | 0 | 0 | 0 |
| REQ-WF | 17 | 5 | 11 | 1 | 0 | 0 |

### What "implemented" does and does not mean here

- Owner-ticket execution is proven by the landed PR + its run ledger; the live-verification column in
  `BUILD_INDEX.md` records which tickets have live evidence (`run`/`gate-pending`/`fixture-only`/`n-a`).
  Phase-0 engine/pipeline owners (P0.05–P0.15) were additionally exercised live on `dev`/`prod` during
  the P0.15* inserts and the PRB.15–PRB.21 prod legs even where their own index row predates that
  evidence (the dated live-proof annotations live in DEFERRALS).
- The 301 "live legs deferred" REQs are overwhelmingly Phase-1 (P1.*) surfaces whose Stage-B
  dev/prod deploy legs ride the `D-P1.*` rows — they are build-complete and deployment-gated, exactly
  as the manifest's Stage-A/Stage-B split intends.
- The 9 GATE/HUMAN-owned REQs: REQ-EVAL-15/16 (G2 — deferred, hard gate before public launch),
  REQ-BETA-16/17/18 (H3/G3 — deferred, thresholds pre-registered in `BETA_GATE_THRESHOLDS`),
  REQ-BETA-1/3/4/20/21/22 (manifest/ledger/gate mechanics — satisfied by the chain itself:
  chain trace = BUILD_INDEX, tags = `beta`/`post-beta` chain rows, budget row = LEDGER spend tracking,
  pre-registration = code + readouts, decision record = spec §17 quoted at G3).
- The 44 DEFERRED REQs are all *named* deferrals (1.x feature set, superseded/reserved REQ-SPEC ids,
  REQ-OBJ-15's v2-spike constraint) — none is an uncovered implementation obligation.

### Full table

| REQ | Owner | Status | Evidence / open deferrals |
|---|---|---|---|
| REQ-ACCT-1 | PRB.09 | IMPL | fixture-only |
| REQ-ACCT-2 | P1.20 | IMPL(live→def) | gate-pending / D-P1.20-1 |
| REQ-ACCT-3 | P1.18 | IMPL(live→def) | gate-pending / D-P1.18-1 |
| REQ-ACCT-4 | P1.20 | IMPL(live→def) | gate-pending / D-P1.20-1 |
| REQ-ARCH-1 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 |
| REQ-ARCH-2 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 |
| REQ-ARCH-3 | P0.08 | IMPL | fixture-only |
| REQ-ARCH-4 | PRB.02 | IMPL(live→def) | fixture-only / D-PRB.02-2 D-PRB.02-3 |
| REQ-ARCH-5 | P0.03 | IMPL(live→def) | fixture-only / D-P0.03-1 D-P0.03-2 D-P0.03-3 |
| REQ-ARCH-6 | P0.03 | IMPL(live→def) | fixture-only / D-P0.03-1 D-P0.03-2 D-P0.03-3 |
| REQ-ARCH-7 | P0.06 | IMPL(live→def) | fixture-only / D-P0.06-3 |
| REQ-ARCH-8 | P0.03 | IMPL(live→def) | fixture-only / D-P0.03-1 D-P0.03-2 D-P0.03-3 |
| REQ-ARCH-9 | P0.08 | IMPL | fixture-only |
| REQ-ARCH-10 | deferred 1.x | DEFERRED | constraint binds now |
| REQ-ARCH-11 | P0.08 | IMPL | fixture-only |
| REQ-ARCH-12 | P0.08b | IMPL(live→def) | n-a / D-P0.08b-3 |
| REQ-ARCH-13 | P0.08b | IMPL(live→def) | n-a / D-P0.08b-3 |
| REQ-ARCH-14 | P0.06 | IMPL(live→def) | fixture-only / D-P0.06-3 |
| REQ-ARCH-15 | P0.06 | IMPL(live→def) | fixture-only / D-P0.06-3 |
| REQ-ARCH-16 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-ARCH-17 | P0.05 | IMPL | n-a |
| REQ-ARCH-18 | P0.05 | IMPL | n-a |
| REQ-ARCH-19 | P0.06 | IMPL(live→def) | fixture-only / D-P0.06-3 |
| REQ-ARCH-20 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-ARCH-21 | P1.22 | IMPL(live→def) | gate-pending / D-P1.22-1 D-P1.22-2 D-P1.22-3 / halves: (a)(b) PRB.02/P0.05, (c) P0.09 delivery checks, (d) P0.07 |
| REQ-ARCH-22 | PRB.02 | IMPL(live→def) | fixture-only / D-PRB.02-2 D-PRB.02-3 |
| REQ-ARCH-23 | PRB.02 | IMPL(live→def) | fixture-only / D-PRB.02-2 D-PRB.02-3 |
| REQ-ARCH-24 | PRB.02 | IMPL(live→def) | fixture-only / D-PRB.02-2 D-PRB.02-3 |
| REQ-ARCH-25 | P0.02 | IMPL | n-a |
| REQ-ARCH-26 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 |
| REQ-ARCH-27 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 |
| REQ-ARCH-28 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 / audited P1.22 |
| REQ-ARCH-29 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 / audited P1.22 |
| REQ-ARCH-30 | P0.07 | IMPL | fixture-only |
| REQ-ARCH-31 | P0.07 | IMPL | fixture-only |
| REQ-ARCH-32 | P0.08 | IMPL | fixture-only / emission P0.07 |
| REQ-ARCH-33 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 / packaging P0.03 |
| REQ-ARCH-34 | P1.22 | IMPL(live→def) | gate-pending / D-P1.22-1 D-P1.22-2 D-P1.22-3 |
| REQ-ARCH-35 | PRB.08 | IMPL(live→def) | fixture-only / D-PRB.08-1 |
| REQ-ARCH-36 | P0.15 | IMPL(live→def) | fixture-only / D-P0.15-2 D-P0.15-3 D-P0.15-4 D-P0.15-5 |
| REQ-ARCH-37 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 |
| REQ-ARCH-38 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 |
| REQ-ARCH-39 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 |
| REQ-ARCH-40 | P0.01 | IMPL(live→def) | gate-pending / D-P0.01-3 D-P0.01-4 D-P0.01-6 |
| REQ-BETA-1 | this manifest | GATE | chain trace |
| REQ-BETA-2 | PRB.12 | IMPL | fixture-only |
| REQ-BETA-3 | this manifest | GATE | tags |
| REQ-BETA-4 | ledger budget row | GATE |  |
| REQ-BETA-5 | PRB.12 | IMPL | fixture-only |
| REQ-BETA-6 | PRB.05 | IMPL | fixture-only |
| REQ-BETA-7 | PRB.06 | IMPL | fixture-only |
| REQ-BETA-8 | PRB.06 | IMPL | fixture-only |
| REQ-BETA-9 | PRB.12 | IMPL | fixture-only / 11's emission PRB.02 |
| REQ-BETA-10 | PRB.12 | IMPL | fixture-only / 11's emission PRB.02 |
| REQ-BETA-11 | PRB.12 | IMPL | fixture-only / 11's emission PRB.02 |
| REQ-BETA-12 | PRB.12 | IMPL | fixture-only / 11's emission PRB.02 |
| REQ-BETA-13 | PRB.12 | IMPL | fixture-only / 11's emission PRB.02 |
| REQ-BETA-14 | PRB.08 | IMPL(live→def) | fixture-only / D-PRB.08-1 / 15's self-serve purchase path PRB.13 |
| REQ-BETA-15 | PRB.08 | IMPL(live→def) | fixture-only / D-PRB.08-1 / 15's self-serve purchase path PRB.13 |
| REQ-BETA-16 | HUMAN H3 | GATE | **deferred 2026-09-16** — users pay their own way |
| REQ-BETA-17 | HUMAN H3 | GATE | **deferred 2026-09-16** — users pay their own way |
| REQ-BETA-18 | gate G3 | GATE | **deferred** — parked pending real-world data; thresholds already pre-registered in PRB.12's `BETA_GATE_THRESHOLDS` |
| REQ-BETA-19 | PRB.01 | IMPL(live→def) | fixture-only / D-PRB.01-1 D-PRB.01-2 D-PRB.01-3 / invite machinery; **amended 2026-09-16** — the open-signup surface → PRB.13 |
| REQ-BETA-20 | gates G1–G3 | GATE | this manifest |
| REQ-BETA-21 | this manifest + PRB.01/PRB.07 | GATE |  |
| REQ-BETA-22 | spec §17 decision record | GATE | quoted at G3 |
| REQ-BILL-1 | PRB.03 | IMPL(live→def) | fixture-only / D-PRB.03-2 D-PRB.03-3 |
| REQ-BILL-2 | P0.11 | IMPL | n-a |
| REQ-BILL-3 | P0.11 | IMPL | n-a |
| REQ-BILL-4 | PRB.03 | IMPL(live→def) | fixture-only / D-PRB.03-2 D-PRB.03-3 |
| REQ-BILL-5 | PRB.03 | IMPL(live→def) | fixture-only / D-PRB.03-2 D-PRB.03-3 |
| REQ-BILL-6 | PRB.03 | IMPL(live→def) | fixture-only / D-PRB.03-2 D-PRB.03-3 |
| REQ-BILL-7 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-BILL-8 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 / levels 3–4 P1.05 |
| REQ-BILL-9 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-BILL-10 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-BILL-11 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-BILL-12 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-BILL-13 | PRB.08 | IMPL(live→def) | fixture-only / D-PRB.08-1 |
| REQ-BILL-14 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-BILL-15 | P0.11 | IMPL | n-a |
| REQ-BILL-16 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-BILL-17 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-BILL-18 | P0.02 | IMPL | n-a |
| REQ-BILL-19 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-CHAT-1 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-2 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-3 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-4 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-5 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-6 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-7 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-8 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-9 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-10 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-11 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-12 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-13 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-14 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-15 | P1.12 | IMPL(live→def) | gate-pending / D-P1.12-1 |
| REQ-CHAT-16 | P1.12 | IMPL(live→def) | gate-pending / D-P1.12-1 |
| REQ-CHAT-17 | P1.12 | IMPL(live→def) | gate-pending / D-P1.12-1 |
| REQ-CHAT-18 | P1.12 | IMPL(live→def) | gate-pending / D-P1.12-1 |
| REQ-CHAT-19 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-20 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-21 | P1.06 | IMPL(live→def) | gate-pending / D-P1.06-1 |
| REQ-CHAT-22 | P1.06 | IMPL(live→def) | gate-pending / D-P1.06-1 |
| REQ-CHAT-23 | P1.06 | IMPL(live→def) | gate-pending / D-P1.06-1 |
| REQ-CHAT-24 | P1.06 | IMPL(live→def) | gate-pending / D-P1.06-1 |
| REQ-CHAT-25 | PRB.03 | IMPL(live→def) | fixture-only / D-PRB.03-2 D-PRB.03-3 |
| REQ-CHAT-26 | deferred 1.x | DEFERRED | manifest row |
| REQ-CHAT-27 | deferred 1.x | DEFERRED | manifest row |
| REQ-CHAT-28 | P1.06 | IMPL(live→def) | gate-pending / D-P1.06-1 |
| REQ-CHAT-29 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-CHAT-30 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-DATA-1 | P0.02 | IMPL | n-a |
| REQ-DATA-2 | P0.02 | IMPL | n-a |
| REQ-DATA-3 | P0.02 | IMPL | n-a |
| REQ-DATA-4 | P0.02 | IMPL | n-a |
| REQ-DATA-5 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-DATA-6 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-DATA-7 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-DATA-8 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-DATA-9 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 / b/d halves P1.02, PRB.02 |
| REQ-DATA-10 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-DATA-11 | P0.05 | IMPL | n-a |
| REQ-DATA-12 | P0.05 | IMPL | n-a |
| REQ-DATA-13 | P0.05 | IMPL | n-a |
| REQ-DATA-14 | P0.02 | IMPL | n-a |
| REQ-DATA-15 | P0.05 | IMPL | n-a / proxy half P0.07 |
| REQ-DATA-16 | P0.07 | IMPL | fixture-only |
| REQ-DATA-17 | P0.06 | IMPL(live→def) | fixture-only / D-P0.06-3 |
| REQ-DATA-18 | P0.06 | IMPL(live→def) | fixture-only / D-P0.06-3 |
| REQ-DATA-19 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-DATA-20 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-DATA-21 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-DATA-22 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 / UI PRB.05 |
| REQ-DATA-23 | P1.12 | IMPL(live→def) | gate-pending / D-P1.12-1 |
| REQ-DATA-24 | PRB.07 | IMPL(live→def) | fixture-only / D-PRB.07-1 |
| REQ-DATA-25 | PRB.06 | IMPL | fixture-only |
| REQ-DATA-26 | PRB.07 | IMPL(live→def) | fixture-only / D-PRB.07-1 |
| REQ-DATA-27 | deferred 1.x | DEFERRED | manifest row |
| REQ-DATA-28 | P1.02 | IMPL | gate-pending |
| REQ-DATA-29 | P1.02 | IMPL | gate-pending / block capture PRB.07 |
| REQ-DATA-30 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-DATA-31 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-DATA-32 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 / full sheet P1.14 |
| REQ-DATA-33 | P0.08 | IMPL | fixture-only |
| REQ-DATA-34 | P0.11 | IMPL | n-a |
| REQ-DATA-35 | P0.10 | IMPL | n-a |
| REQ-DATA-36 | P0.10 | IMPL | n-a |
| REQ-DATA-37 | P0.02 | IMPL | n-a / write-boundary P0.08b, mapper P0.06 |
| REQ-DATA-38 | P0.08b | IMPL(live→def) | n-a / D-P0.08b-3 |
| REQ-DATA-39 | P0.08 | IMPL | fixture-only / guidance leg P0.10 |
| REQ-DATA-40 | P0.08 | IMPL | fixture-only / guidance leg P0.10 |
| REQ-DATA-41 | P0.08 | IMPL | fixture-only / guidance leg P0.10 |
| REQ-DATA-42 | P0.11 | IMPL | n-a |
| REQ-DATA-43 | deferred 1.x | DEFERRED | manifest row |
| REQ-DATA-44 | P1.03 | IMPL(live→def) | gate-pending / D-P1.03-1 / roles 1.x |
| REQ-EVAL-1 | P0.13 | IMPL(live→def) | n-a / D-P0.13-1 D-P0.13-3 D-P0.13-5 / human halves H2 |
| REQ-EVAL-2 | P0.13 | IMPL(live→def) | n-a / D-P0.13-1 D-P0.13-3 D-P0.13-5 / human halves H2 |
| REQ-EVAL-3 | P0.13 | IMPL(live→def) | n-a / D-P0.13-1 D-P0.13-3 D-P0.13-5 / human halves H2 |
| REQ-EVAL-4 | P0.13 | IMPL(live→def) | n-a / D-P0.13-1 D-P0.13-3 D-P0.13-5 / human halves H2 |
| REQ-EVAL-5 | P0.13 | IMPL(live→def) | n-a / D-P0.13-1 D-P0.13-3 D-P0.13-5 / human halves H2 |
| REQ-EVAL-6 | P0.14 | IMPL(live→def) | n-a / D-P0.14-1 D-P0.14-2 D-P0.14-3 |
| REQ-EVAL-7 | P0.14 | IMPL(live→def) | n-a / D-P0.14-1 D-P0.14-2 D-P0.14-3 |
| REQ-EVAL-8 | P0.14 | IMPL(live→def) | n-a / D-P0.14-1 D-P0.14-2 D-P0.14-3 |
| REQ-EVAL-9 | P0.14 | IMPL(live→def) | n-a / D-P0.14-1 D-P0.14-2 D-P0.14-3 |
| REQ-EVAL-10 | P0.14 | IMPL(live→def) | n-a / D-P0.14-1 D-P0.14-2 D-P0.14-3 |
| REQ-EVAL-11 | P0.14 | IMPL(live→def) | n-a / D-P0.14-1 D-P0.14-2 D-P0.14-3 |
| REQ-EVAL-12 | P0.13 | IMPL(live→def) | n-a / D-P0.13-1 D-P0.13-3 D-P0.13-5 |
| REQ-EVAL-13 | P0.13 | IMPL(live→def) | n-a / D-P0.13-1 D-P0.13-3 D-P0.13-5 |
| REQ-EVAL-14 | P0.13 | IMPL(live→def) | n-a / D-P0.13-1 D-P0.13-3 D-P0.13-5 |
| REQ-EVAL-15 | gate G2 | GATE | computation/ log P0.14 |
| REQ-EVAL-16 | gate G2 | GATE | computation/ log P0.14 |
| REQ-EVAL-17 | P0.14 | IMPL(live→def) | n-a / D-P0.14-1 D-P0.14-2 D-P0.14-3 |
| REQ-EVAL-18 | P0.14 | IMPL(live→def) | n-a / D-P0.14-1 D-P0.14-2 D-P0.14-3 |
| REQ-EVAL-19 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-EVAL-20 | P0.14 | IMPL(live→def) | n-a / D-P0.14-1 D-P0.14-2 D-P0.14-3 |
| REQ-GATE-1 | P0.10 | IMPL | n-a |
| REQ-GATE-2 | PRB.05 | IMPL | fixture-only |
| REQ-GATE-3 | P0.10 | IMPL | n-a |
| REQ-GATE-4 | P0.10 | IMPL | n-a |
| REQ-GATE-5 | P1.09 | IMPL(live→def) | gate-pending / D-P1.09-1 / triage half PRB.05 |
| REQ-GATE-6 | P0.10 | IMPL | n-a |
| REQ-GATE-7 | PRB.05 | IMPL | fixture-only |
| REQ-GATE-8 | PRB.09 | IMPL | fixture-only |
| REQ-GATE-9 | P0.10 | IMPL | n-a |
| REQ-GATE-10 | P0.10 | IMPL | n-a / management UI P1.09/P1.20 |
| REQ-GATE-11 | P0.10 | IMPL | n-a |
| REQ-GATE-12 | P0.10 | IMPL | n-a / UI P1.05 |
| REQ-GATE-13 | P0.10 | IMPL | n-a / UI P1.05 |
| REQ-GATE-14 | deferred 1.x | DEFERRED | manifest row |
| REQ-GATE-15 | deferred 1.x | DEFERRED | manifest row |
| REQ-GATE-16 | deferred 1.x | DEFERRED | manifest row |
| REQ-GENRE-1 | P0.03 | IMPL(live→def) | fixture-only / D-P0.03-1 D-P0.03-2 D-P0.03-3 |
| REQ-GENRE-2 | P1.21 | IMPL(live→def) | gate-pending / D-P1.21-1 D-P1.21-2 |
| REQ-GENRE-3 | P1.21 | IMPL(live→def) | gate-pending / D-P1.21-1 D-P1.21-2 |
| REQ-GENRE-4 | P1.04 | IMPL(live→def) | gate-pending / D-P1.04-1 D-P1.04-2 / data P0.03 |
| REQ-GENRE-5 | PRB.11 | IMPL(live→def) | fixture-only / D-PRB.11-2 / Academic half P1.21 |
| REQ-GENRE-6 | P1.21 | IMPL(live→def) | gate-pending / D-P1.21-1 D-P1.21-2 |
| REQ-GENRE-7 | P1.21 | IMPL(live→def) | gate-pending / D-P1.21-1 D-P1.21-2 |
| REQ-GROWTH-1 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-GROWTH-2 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-GROWTH-3 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-GROWTH-4 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-GROWTH-5 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-GROWTH-6 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-GROWTH-7 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-GROWTH-8 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-GROWTH-9 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-GROWTH-10 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-GROWTH-11 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-GROWTH-12 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-GROWTH-13 | PRB.03 | IMPL(live→def) | fixture-only / D-PRB.03-2 D-PRB.03-3 |
| REQ-GROWTH-14 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-GROWTH-15 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-GROWTH-16 | PRB.03 | IMPL(live→def) | fixture-only / D-PRB.03-2 D-PRB.03-3 |
| REQ-GROWTH-17 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-IDE-1 | P1.01 | IMPL(live→def) | gate-pending / D-P1.01-1 D-P1.01-2 |
| REQ-IDE-2 | P1.19 | IMPL(live→def) | gate-pending / D-P1.19-1 D-P1.19-2 |
| REQ-IDE-3 | P1.04 | IMPL(live→def) | gate-pending / D-P1.04-1 D-P1.04-2 |
| REQ-IDE-4 | P1.04 | IMPL(live→def) | gate-pending / D-P1.04-1 D-P1.04-2 |
| REQ-IDE-5 | P1.04 | IMPL(live→def) | gate-pending / D-P1.04-1 D-P1.04-2 |
| REQ-IDE-6 | P1.04 | IMPL(live→def) | gate-pending / D-P1.04-1 D-P1.04-2 |
| REQ-IDE-7 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-IDE-8 | P1.01 | IMPL(live→def) | gate-pending / D-P1.01-1 D-P1.01-2 |
| REQ-IDE-9 | P1.01 | IMPL(live→def) | gate-pending / D-P1.01-1 D-P1.01-2 |
| REQ-IDE-10 | P1.01 | IMPL(live→def) | gate-pending / D-P1.01-1 D-P1.01-2 |
| REQ-IDE-11 | P1.05 | IMPL(live→def) | gate-pending / D-P1.05-1 / beta subset PRB.04 |
| REQ-IDE-12 | P1.05 | IMPL(live→def) | gate-pending / D-P1.05-1 / beta subset PRB.04 |
| REQ-IDE-13 | P1.06 | IMPL(live→def) | gate-pending / D-P1.06-1 / beta PRB.03 |
| REQ-IDE-14 | P1.05 | IMPL(live→def) | gate-pending / D-P1.05-1 / beta PRB.04 |
| REQ-IDE-15 | PRB.04 | IMPL(live→def) | fixture-only / D-PRB.04-1 D-PRB.04-2 |
| REQ-IDE-16 | PRB.05 | IMPL | fixture-only |
| REQ-IDE-17 | P0.10 | IMPL | n-a |
| REQ-IDE-18 | P1.05 | IMPL(live→def) | gate-pending / D-P1.05-1 |
| REQ-IDE-19 | P1.05 | IMPL(live→def) | gate-pending / D-P1.05-1 |
| REQ-IDE-20 | deferred 1.x | DEFERRED | manifest row |
| REQ-IDE-21 | deferred 1.x | DEFERRED | manifest row |
| REQ-IDE-22 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-IDE-23 | P1.07 | IMPL(live→def) | gate-pending / D-P1.07-1 / beta PRB.04 |
| REQ-IDE-24 | P1.07 | IMPL(live→def) | gate-pending / D-P1.07-1 |
| REQ-IDE-25 | PRB.04 | IMPL(live→def) | fixture-only / D-PRB.04-1 D-PRB.04-2 |
| REQ-IDE-26 | PRB.04 | IMPL(live→def) | fixture-only / D-PRB.04-1 D-PRB.04-2 |
| REQ-IDE-27 | PRB.05 | IMPL | fixture-only |
| REQ-IDE-28 | PRB.05 | IMPL | fixture-only |
| REQ-IDE-29 | P1.07 | IMPL(live→def) | gate-pending / D-P1.07-1 |
| REQ-IDE-30 | PRB.04 | IMPL(live→def) | fixture-only / D-PRB.04-1 D-PRB.04-2 |
| REQ-IDE-31 | PRB.04 | IMPL(live→def) | fixture-only / D-PRB.04-1 D-PRB.04-2 |
| REQ-IDE-32 | P1.08 | IMPL(live→def) | gate-pending / D-P1.08-1 / fork rule PRB.07 |
| REQ-IDE-33 | P1.08 | IMPL(live→def) | gate-pending / D-P1.08-1 / beta PRB.06 |
| REQ-IDE-34 | P1.08 | IMPL(live→def) | gate-pending / D-P1.08-1 / storage P1.03 |
| REQ-IDE-35 | P1.08 | IMPL(live→def) | gate-pending / D-P1.08-1 |
| REQ-IDE-36 | P1.08 | IMPL(live→def) | gate-pending / D-P1.08-1 |
| REQ-IDE-37 | P1.08 | IMPL(live→def) | gate-pending / D-P1.08-1 |
| REQ-IDE-38 | P1.01 | IMPL(live→def) | gate-pending / D-P1.01-1 D-P1.01-2 |
| REQ-IDE-39 | P1.01 | IMPL(live→def) | gate-pending / D-P1.01-1 D-P1.01-2 |
| REQ-IDE-40 | P1.01 | IMPL(live→def) | gate-pending / D-P1.01-1 D-P1.01-2 |
| REQ-IDE-41 | P1.01 | IMPL(live→def) | gate-pending / D-P1.01-1 D-P1.01-2 |
| REQ-IDE-42 | P1.01 | IMPL(live→def) | gate-pending / D-P1.01-1 D-P1.01-2 |
| REQ-IDE-43 | P1.03 | IMPL(live→def) | gate-pending / D-P1.03-1 |
| REQ-IDE-44 | P1.02 | IMPL | gate-pending |
| REQ-IDE-45 | P1.02 | IMPL | gate-pending |
| REQ-IDE-46 | P1.03 | IMPL(live→def) | gate-pending / D-P1.03-1 |
| REQ-IDE-47 | P1.19 | IMPL(live→def) | gate-pending / D-P1.19-1 D-P1.19-2 / email PRB.09 |
| REQ-IDE-48 | P1.19 | IMPL(live→def) | gate-pending / D-P1.19-1 D-P1.19-2 |
| REQ-IDE-49 | P1.06 | IMPL(live→def) | gate-pending / D-P1.06-1 |
| REQ-IDE-50 | P0.02 | IMPL | n-a |
| REQ-INGEST-1 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 |
| REQ-INGEST-2 | P1.15 | IMPL(live→def) | gate-pending / D-P1.15-1 |
| REQ-INGEST-3 | P1.15 | IMPL(live→def) | gate-pending / D-P1.15-1 |
| REQ-INGEST-4 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 |
| REQ-INGEST-5 | P1.15 | IMPL(live→def) | gate-pending / D-P1.15-1 |
| REQ-INGEST-6 | P1.15 | IMPL(live→def) | gate-pending / D-P1.15-1 |
| REQ-INGEST-7 | P1.15 | IMPL(live→def) | gate-pending / D-P1.15-1 / plumbing PRB.02 |
| REQ-INGEST-8 | PRB.02 | IMPL(live→def) | fixture-only / D-PRB.02-2 D-PRB.02-3 |
| REQ-INGEST-9 | P1.15 | IMPL(live→def) | gate-pending / D-P1.15-1 |
| REQ-INGEST-10 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 |
| REQ-INGEST-11 | P1.15 | IMPL(live→def) | gate-pending / D-P1.15-1 |
| REQ-INGEST-12 | PRB.02 | IMPL(live→def) | fixture-only / D-PRB.02-2 D-PRB.02-3 |
| REQ-INGEST-13 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-INGEST-14 | P1.15 | IMPL(live→def) | gate-pending / D-P1.15-1 |
| REQ-MOBILE-1 | constraint | CONSTRAINT | scope rule — constraint |
| REQ-MOBILE-2 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-3 | P1.19 | IMPL(live→def) | gate-pending / D-P1.19-1 D-P1.19-2 / amended web half |
| REQ-MOBILE-4 | PRB.04 | IMPL(live→def) | fixture-only / D-PRB.04-1 D-PRB.04-2 |
| REQ-MOBILE-5 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-6 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-7 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-8 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-9 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-10 | PRB.09 | IMPL | fixture-only / rule applied to email |
| REQ-MOBILE-11 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-12 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-13 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-14 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-15 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-16 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-17 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-18 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-19 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-20 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-21 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-MOBILE-22 | deferred 1.x | DEFERRED | the app; phone-width-web aspects via REQ-SPEC-20 |
| REQ-OBJ-1 | P0.02 | IMPL | n-a |
| REQ-OBJ-2 | P0.12 | IMPL(live→def) | n-a / D-P0.12-3 |
| REQ-OBJ-3 | P0.12 | IMPL(live→def) | n-a / D-P0.12-3 |
| REQ-OBJ-4 | P0.12 | IMPL(live→def) | n-a / D-P0.12-3 |
| REQ-OBJ-5 | P0.12 | IMPL(live→def) | n-a / D-P0.12-3 |
| REQ-OBJ-6 | P0.12 | IMPL(live→def) | n-a / D-P0.12-3 / surfaces PRB.03/04/06, PRB.11, P1.08/P1.19 |
| REQ-OBJ-7 | P0.02 | IMPL | n-a |
| REQ-OBJ-8 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-OBJ-9 | deferred 1.x | DEFERRED | kind pre-registered P0.02 |
| REQ-OBJ-10 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 / hook half P0.05 |
| REQ-OBJ-11 | P0.03 | IMPL(live→def) | fixture-only / D-P0.03-1 D-P0.03-2 D-P0.03-3 / CI input-source test |
| REQ-OBJ-12 | deferred 1.x | DEFERRED | posture copy P1.20 |
| REQ-OBJ-13 | deferred 1.x | DEFERRED | posture copy P1.20 |
| REQ-OBJ-14 | deferred 1.x | DEFERRED | posture copy P1.20 |
| REQ-OBJ-15 | out-of-scope constraint | DEFERRED | manifest row |
| REQ-OBJ-16 | P0.02 | IMPL | n-a |
| REQ-OBJ-17 | P0.02 | IMPL | n-a |
| REQ-OBJ-18 | P0.04 | IMPL | n-a / delivery P0.09, DDL P0.02 |
| REQ-OBJ-19 | P0.03 | IMPL(live→def) | fixture-only / D-P0.03-1 D-P0.03-2 D-P0.03-3 / field P0.02 |
| REQ-PERSONA-1 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-PERSONA-2 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 |
| REQ-PERSONA-3 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 |
| REQ-PERSONA-4 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 |
| REQ-PERSONA-5 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-PERSONA-6 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-7 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-8 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-9 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-10 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-11 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-12 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-13 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-14 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-15 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-16 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / 13/14 beta subset PRB.10 |
| REQ-PERSONA-17 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 |
| REQ-PERSONA-18 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-PERSONA-19 | deferred 1.x | DEFERRED | house styles |
| REQ-PERSONA-20 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 |
| REQ-PERSONA-21 | P1.04 | IMPL(live→def) | gate-pending / D-P1.04-1 D-P1.04-2 |
| REQ-PERSONA-22 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-PERSONA-23 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-PERSONA-24 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-PERSONA-25 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-PERSONA-26 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-PERSONA-27 | PRB.10 | IMPL(live→def) | fixture-only / D-PRB.10-1 |
| REQ-POS-1 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-POS-2 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-POS-3 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 / beta sample PRB.01 |
| REQ-POS-4 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-POS-5 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-POS-6 | PRB.11 | IMPL(live→def) | fixture-only / D-PRB.11-2 |
| REQ-POS-7 | P1.18 | IMPL(live→def) | gate-pending / D-P1.18-1 |
| REQ-POS-8 | P1.02 | IMPL | gate-pending |
| REQ-POS-9 | P1.02 | IMPL | gate-pending |
| REQ-POS-10 | deferred 1.x | DEFERRED | manifest row |
| REQ-POS-11 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-POS-12 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-POS-13 | P1.17 | IMPL(live→def) | gate-pending / D-P1.17-1 D-P1.17-2 |
| REQ-PROD-1 | P0.02 | IMPL | n-a |
| REQ-PROD-2 | PRB.04 | IMPL(live→def) | fixture-only / D-PRB.04-1 D-PRB.04-2 |
| REQ-PROD-3 | P1.06 | IMPL(live→def) | gate-pending / D-P1.06-1 |
| REQ-PROD-4 | PRB.05 | IMPL | fixture-only |
| REQ-PROD-5 | P1.06 | IMPL(live→def) | gate-pending / D-P1.06-1 |
| REQ-PROD-6 | P0.02 | IMPL | n-a |
| REQ-PROD-7 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-PROD-8 | P1.04 | IMPL(live→def) | gate-pending / D-P1.04-1 D-P1.04-2 |
| REQ-PROD-9 | P0.08 | IMPL | fixture-only / surfaces P1.04/PRB.01 |
| REQ-PROD-10 | P1.04 | IMPL(live→def) | gate-pending / D-P1.04-1 D-P1.04-2 |
| REQ-PROD-11 | PRB.06 | IMPL | fixture-only |
| REQ-PROD-12 | deferred 1.x | DEFERRED | stall half P0.12 |
| REQ-PROD-13 | this manifest | GATE | rows = epics |
| REQ-PROD-14 | P1.02 | IMPL | gate-pending |
| REQ-PROD-15 | PRB.12 | IMPL | fixture-only |
| REQ-PROD-16 | PRB.12 | IMPL | fixture-only |
| REQ-RUN-1 | P0.08 | IMPL | fixture-only |
| REQ-RUN-2 | P0.08 | IMPL | fixture-only |
| REQ-RUN-3 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-RUN-4 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-RUN-5 | P0.10 | IMPL | n-a |
| REQ-RUN-6 | P0.10 | IMPL | n-a |
| REQ-RUN-7 | P0.10 | IMPL | n-a |
| REQ-RUN-8 | P0.10 | IMPL | n-a |
| REQ-RUN-9 | P0.08 | IMPL | fixture-only |
| REQ-RUN-10 | P0.08 | IMPL | fixture-only |
| REQ-RUN-11 | P0.08 | IMPL | fixture-only |
| REQ-RUN-12 | P0.08 | IMPL | fixture-only |
| REQ-RUN-13 | P0.08 | IMPL | fixture-only |
| REQ-RUN-14 | P0.08 | IMPL | fixture-only |
| REQ-RUN-15 | P0.08 | IMPL | fixture-only |
| REQ-RUN-16 | P0.08 | IMPL | fixture-only |
| REQ-RUN-17 | P0.08 | IMPL | fixture-only |
| REQ-RUN-18 | P0.10 | IMPL | n-a |
| REQ-SPEC-1 | P0.10 | IMPL | n-a |
| REQ-SPEC-2 | P0.02 | IMPL | n-a |
| REQ-SPEC-3 | P0.08 | IMPL | fixture-only |
| REQ-SPEC-4 | P0.03 | IMPL(live→def) | fixture-only / D-P0.03-1 D-P0.03-2 D-P0.03-3 |
| REQ-SPEC-5 | superseded | DEFERRED | manifest row |
| REQ-SPEC-6 | P1.07 | IMPL(live→def) | gate-pending / D-P1.07-1 |
| REQ-SPEC-7 | P1.07 | IMPL(live→def) | gate-pending / D-P1.07-1 |
| REQ-SPEC-8 | P1.16 | IMPL(live→def) | gate-pending / D-P1.16-1 |
| REQ-SPEC-9 | P0.10 | IMPL | n-a / serializers P0.04 |
| REQ-SPEC-10 | P0.06 | IMPL(live→def) | fixture-only / D-P0.06-3 |
| REQ-SPEC-11 | P0.07 | IMPL | fixture-only |
| REQ-SPEC-12 | P0.04 | IMPL | n-a / delivery P0.09 |
| REQ-SPEC-13 | P0.08 | IMPL | fixture-only / data P0.03 |
| REQ-SPEC-14 | P0.02 | IMPL | n-a |
| REQ-SPEC-15 | P1.11 | IMPL(live→def) | gate-pending / D-P1.11-1 |
| REQ-SPEC-16 | PRB.03 | IMPL(live→def) | fixture-only / D-PRB.03-2 D-PRB.03-3 / API P0.08 |
| REQ-SPEC-17 | P0.10 | IMPL | n-a |
| REQ-SPEC-18 | PRB.05 | IMPL | fixture-only / state P0.10 |
| REQ-SPEC-19 | P1.02 | IMPL | gate-pending |
| REQ-SPEC-20 | P1.19 | IMPL(live→def) | gate-pending / D-P1.19-1 D-P1.19-2 / beta halves PRB.05/PRB.09 |
| REQ-SPEC-21 | P0.02 | IMPL | n-a |
| REQ-SPEC-22 | P0.04 | IMPL | n-a |
| REQ-SPEC-23 | reserved | DEFERRED | merged |
| REQ-SPEC-24 | P0.11 | IMPL | n-a / item 7 PRB.08 |
| REQ-SPEC-25 | P1.22 | IMPL(live→def) | gate-pending / D-P1.22-1 D-P1.22-2 D-P1.22-3 / halves P0.07/P0.09/PRB.02 |
| REQ-SPEC-26 | reserved | DEFERRED | merged |
| REQ-SPEC-27 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-SPEC-28 | reserved | DEFERRED | merged |
| REQ-VIS-1 | P0.02 | IMPL | n-a |
| REQ-VIS-2 | P0.02 | IMPL | n-a |
| REQ-VIS-3 | P1.08 | IMPL(live→def) | gate-pending / D-P1.08-1 |
| REQ-VIS-4 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-VIS-5 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-VIS-6 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-VIS-7 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 / hook half P0.05 |
| REQ-VIS-8 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 / beta PRB.10 |
| REQ-VIS-9 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-VIS-10 | PRB.11 | IMPL(live→def) | fixture-only / D-PRB.11-2 |
| REQ-VIS-11 | P0.06 | IMPL(live→def) | fixture-only / D-P0.06-3 / support-access surface P1.20 |
| REQ-VIZ-1 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-2 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-3 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-4 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-5 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-6 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-7 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-8 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-9 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-10 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-11 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-12 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-13 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-14 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-15 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-VIZ-16 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-WF-1 | P0.03 | IMPL(live→def) | fixture-only / D-P0.03-1 D-P0.03-2 D-P0.03-3 |
| REQ-WF-2 | P0.09 | IMPL(live→def) | fixture-only / D-P0.09-3 |
| REQ-WF-3 | PRB.03 | IMPL(live→def) | fixture-only / D-PRB.03-2 D-PRB.03-3 |
| REQ-WF-4 | P1.10 | IMPL(live→def) | gate-pending / D-P1.10-1 |
| REQ-WF-5 | P1.10 | IMPL(live→def) | gate-pending / D-P1.10-1 |
| REQ-WF-6 | P0.02 | IMPL | n-a |
| REQ-WF-7 | P0.12 | IMPL(live→def) | n-a / D-P0.12-3 |
| REQ-WF-8 | P1.21 | IMPL(live→def) | gate-pending / D-P1.21-1 D-P1.21-2 |
| REQ-WF-9 | PRB.05 | IMPL | fixture-only |
| REQ-WF-10 | PRB.05 | IMPL | fixture-only |
| REQ-WF-11 | P1.14 | IMPL(live→def) | gate-pending / D-P1.14-1 |
| REQ-WF-12 | P0.02 | IMPL | n-a / UI 1.x |
| REQ-WF-13 | P0.03 | IMPL(live→def) | fixture-only / D-P0.03-1 D-P0.03-2 D-P0.03-3 |
| REQ-WF-14 | P1.13 | IMPL(live→def) | gate-pending / D-P1.13-1 |
| REQ-WF-15 | P0.12 | IMPL(live→def) | n-a / D-P0.12-3 / loop 1.x |
| REQ-WF-16 | deferred 1.x | DEFERRED | manifest row |
| REQ-WF-17 | P0.02 | IMPL | n-a |

## 4. Cross-cutting invariants — re-check at the chain tip

| # | Invariant | Result | Evidence |
|---|---|---|---|
| 1 | TypeScript end-to-end, no Python | **HOLDS** | zero `*.py` files in the tree; all tooling Node/TS |
| 2 | Explicit per-package dependencies | **HOLDS** | turbo build clean at 132/132; pnpmfile only resolves `@rhema/evals` |
| 3 | Composite `tsc -b` project references | **HOLDS** | typecheck green across 45 packages |
| 4 | No cross-package relative imports / `.js` NodeNext | **HOLDS** | `eslint-plugin-rhema/no-cross-package-relative-import` green in lint |
| 5 | Canonical vocabulary, banned strings linted | **HOLDS** | `no-banned-strings` rule green; `vocab-lint.test.ts` green |
| 6 | No protocol IP in public bundles/OpenAPI/events | **HOLDS** | `check:protocol-markers` — 45 public files, no markers |
| 7 | Secrets never committed; provider keys only via egress-proxy | **HOLDS** | gitleaks clean on committed tree (P1.22 sweep); provider key isolated to proxy + Secret Manager; `.env` hits are ignored local-dev values, never committed |
| 8 | No plaintext secrets to web/collab/model process; run-token by file + uid boundary | **HOLDS (build)** | `secrets-manifests.test.ts` (11) asserts env posture + 0600/0400 file delivery; live pod-log leg → D-P0.15f-1/-2 (D-P1.22-2) |
| 9 | Tenant isolation + RLS | **HOLDS** | `rls-catalog.test.ts` pg_catalog census + pooled two-tenant probe (P1.22) |
| 10 | usercontent cookieless | **HOLDS** | `usercontent-csp.test.ts` (10): no Set-Cookie, attachment/octet-stream, `__Host-` posture |
| 11 | Ingestion connectors never accept credentials/cookies | **HOLDS (after fix)** | `check:no-cookies` green on 28 files — after annotating the viewer-session Set-Cookie passthrough (a *response* preserve, not a connector input) with the gate's own exemption |
| 12 | Full-board fetcher-only routing | **HOLDS** | `injection-controls.test.ts` (P1.22, 102 checks) |
| 13 | Retention/backup/deletion | **HOLDS (build)** | `retention-backup.test.ts`; live config leg rides Stage B |
| 14 | No fabricated metrics | **HOLDS** | phase1-exit-readout labels UNMEASURED honestly (one stale citation corrected — see §2) |
| 15 | No superiority claims before a met wave | **HOLDS** | launch-surface lint 26 assertions green; `COMPARATIVE_WAVE_MET=false` |
| 16 | Stage separation / preview-prod boundaries | **HOLDS** | `infra/config/stages.ts` + tests; pr-* preview posture preserved |
| 17 | No out-of-scope features | **HOLDS** — see §5 | sweep below |

**Invariant violations found at the CAPSTONE: zero standing** — the two gate failures (upstream-diff
drift, no-cookies false-positive classification) were violations *detected by the gates themselves*
and resolved in this session; the tree they certify is the committed one.

## 5. Out-of-scope sweep — "no ticket does this"

Sweep of the manifest's out-of-scope list against the tree:

| Out-of-scope item | Finding | Classification |
|---|---|---|
| Publishing integrations (Q-9) | none — export formats are file exports (md/docx/pdf…), no publish connectors | clean |
| Persona ethics gating (Q-11) | `personas.mode` is metadata-only (the Q-11 manifest transform records, never gates) | clean |
| Plagiarism detection | no matches | clean |
| Leaderboards / contribution metrics | no matches | clean |
| Browser/computer-use pane | no matches | clean |
| Safety classifiers on actions | no matches | clean |
| User-configured MCP/tools, per-seat corpora | only vendored Claude SDK type declarations mention MCP — dependency surface, not a feature | clean |
| Folders / manual ordering (never) | no matches | clean |
| Scheduling | only *existing* sweep/orchestrator cron machinery (pg-boss sweeps — in scope) | clean |
| Training on user content | REQ-EVAL-3 provider no-training verification gate is *enforced* in code | clean |
| Argument graph (REQ-OBJ-15) | deferred by manifest; v2 spike gated on §18 corpus with kill criteria | deferred-by-design |
| Fiction/marketing protocols | only the four spec protocols (Essay/Academic/Op-ed/Memo) seeded | clean |
| Mobile app + 1.x set (BYO keys, variants, working copies, suggestion marks, Source mode, span-provenance rendering, sharing roles, Team tier, Run rounds, Cut/Line/Titles/Abstract/Reverse-outline/Interview/Steelman/Map-the-field, seat profile pages, pref aggregation) | the `RunKind`/`Protocol` registries name the kinds; Team stays hidden in settings nav (`VISIBLE_SETTINGS_SECTIONS`); `wtp`/interview references are admin-CLI telemetry (`wtp.recorded`) and the upstream skill inventory — no built 1.x surface found | clean |
| Additional ingestion providers | Substack + URL + upload + paste + export-zip are the P1.15 set — the spec's own MVP list | in-scope |
| Non-Anthropic providers (1.x) | provider *registry* types (REQ-ARCH-10's constraint binds now — the harness seam exists, no second provider wired) | deferred-by-design |
| Temporal | only a vendored SDK `.d.ts` mention | clean |

**No out-of-scope creep found.**

## 6. What is NOT yet verified — the honest negative space

84 deferral rows are not cleanly DONE (73 OPEN + 9 PARTIAL + 2 ACCEPTED-SKELETON). Grouped by the
dependency that blocks them:

### Deploy-gated (need `pulumi up` / a deploy before anything else runs)

- **D-P1.\* Stage-B bundles** — D-P1.01-1/-2, D-P1.03-1, D-P1.04-1/-2, D-P1.05-1, D-P1.06-1,
  D-P1.07-1, D-P1.08-1, D-P1.09-1, D-P1.10-1, D-P1.11-1, D-P1.12-1, D-P1.13-1, D-P1.14-1, D-P1.15-1,
  D-P1.16-1, D-P1.17-2, D-P1.18-1, D-P1.19-1, D-P1.20-1, D-P1.21-2, D-P1.22-2: the whole Phase-1
  surface's live deploys + migrations + headless live asserts (each row carries its spend cap, mostly
  $0–$15). This is the bulk of Stage B.
- **D-P0.01-5** (custom IAM role — code DONE, applies at next `pulumi up`), **D-P0.01-6** (subnet
  masks — hardening, ACCEPTED-SKELETON), **D-P0.01-4** (self-hosted Turbo remote cache — re-deferred
  ACCEPTED-SKELETON), **D-P0.06-3** (distroless run-task image — needs image work + a live privsep
  check; re-deferred with compensating controls), **D-PRB.13-1** (Redis shared throttle binding).
- **D-P1.22-1** (SLO instrumentation legs — event-delivery client-ack + autosave timing need the
  deployed probe + the instrumentation code paths).

### Live-run-gated (need a deployed env + real inference/traffic)

- Phase-0 residual legs: **D-P0.03-1/-2/-3** (per-skill sidecar live runs), **D-P0.08b-2/-3** (SSE
  outbox/SLO live), **D-P0.09-3** (audit/gap cap), **D-P0.15-2/-3** (PARTIAL — revise/profile_voice
  folds + ±2% cross-check over populated `sdk_estimate`), **D-P0.15-4** (live nightly golden),
  **D-P0.15-5** (start-latency p95), **D-P0.15b-1/-2/-3/-4**, **D-P0.15c-1/-2/-3/-4/-5**,
  **D-P0.15d-2**, **D-P0.15f-1/-2** (two-uid/injector pod-log proof — ride D-P1.22-2),
  **D-P0.15h-2/-4/-5** (hook envelope live, PARTIAL gate-expiry consumption, scoped second-read),
  **D-P0.15i-1** (PARTIAL).
- PRB residual legs: **D-PRB.01-1/-2/-3** (dossier sign-off + live sample legs), **D-PRB.02-2/-3**,
  **D-PRB.03-1/-2/-3**, **D-PRB.04-1/-2**, **D-PRB.07-1** (browser legs inside), **D-PRB.08-1**
  (PARTIAL — usage.reconcile admin-key leg), **D-PRB.10-1**, **D-PRB.11-2**, **D-PRB.13-2**
  (self-serve live legs — partially landed), **D-PRB.16-4** (PARTIAL — `gate.expiry` consumption;
  a real armed gate expires organically 2026-09-25).
- **D-PRB.21-1** — the *live product finding*: the Review workflow is uncompletable at derived caps
  (five `cap_reached` deaths, context-accumulation burn; PRB.22/PRB.23 measured + bounded the
  research surface, acceptance not met — stop clause honored). Open and honestly logged in LEDGER
  OPEN FINDINGS.

### Human-gated (operator / contracting)

- **H2 corpus** — D-P0.13-1/-3/-4/-5, D-P0.14-1/-2/-3 (≥24 commissioned drafts + two annotating
  editors + adjudicator; the §18 machinery is built, the corpus is human-procured). Gates G2.
- **H4 venue verification** — D-P1.21-1 (real `verified_at` stamps for the venue tables).
- **H5 showcase essay** — D-P1.17-1 (operator decision on the real essay; fixture dossier rides).
- **D-PRB.01-2** — operator sign-off on the sample dossier content (REQ-POS-3).
- **Browser click-throughs** — D-P0.01-3 (Google sign-in after the operator's OAuth-console redirect
  add + Resend DNS for magic link; prod smoke proven, the click legs owed), D-PRB.13-2 (self-serve
  legs), D-P1.19-2 (~375 px device smoke).
- **D-P0.12-3** — matcher/convergence tuning needs real adjudication data (→1.x).

### Procurement-gated (money/credentials outside the repo)

- **D-P1.22-3** — external penetration test (scope doc written — `docs/security/pen-test-scope.md`;
  procurement + triage operator-owned).
- **D-PRB.08-1 (leg b)** — `ANTHROPIC_ADMIN_KEY` for the live `usage.reconcile` pull (credential
  procurement).
- **H2 corpus commissioning** — ≈$100k per Q-23 (also the human-gated entry above).
- **Real-money Stripe legs** — the Payment-Link purchase was proven by the operator's real checkout
  (D-PRB.17-1 DONE 2026-09-22); further live-mode billing legs ride D-P1.16-1 at operator discretion.

## 7. Gap ledger by severity

Severity scale: **BLOCKER** (spec obligation unmet with no deferral) · **MAJOR** (implemented wrong /
unverifiable as claimed) · **MINOR** (documentation/status drift, hygiene) · **OBSERVATION** (noted,
no action owed).

| Sev | Count | Items |
|---|---|---|
| BLOCKER | **0** | — |
| MAJOR | **0** | — |
| MINOR | 4 | (1) `phase1-exit-readout.md` row 4 cited D-PRB.16-5 as "awaiting ruling" — ruled DONE 2026-09-22 (dated correction appended). (2) DEFERRALS status cells: a tail of rows read `OPEN` where the G1 reconciliation's reconciled-DONE list covers them — the file's own convention leaves the flip to "their next touch" (hygiene, not a gap). (3) LEDGER PHASE LOG's P1.22 test count `3,493` vs the commit message's `3,496` — the fresh run reads 3,496; commit + fresh agree (log entry preserved, noted here). (4) `apps/worker/src/jobs.ts` `TODO(P1.20+)` purge objects leg — already inside D-P1.04-2's scope (named here so Stage B doesn't miss it). |
| OBSERVATION | 2 | (a) `*_not_wired` 503 seams (chat/export/import/voice routes) are DI fail-closed answers, bound on prod where the surface exists; the chat surface's deploy is P1.11's Stage-B row. (b) D-P0.04-1's "private CI" premise was superseded by REQ-ARCH-37's committed-member amendment — the protocols suite + freeze check run in the standard `typecheck-lint-unit` CI job; the row is flipped DONE with this run's evidence. |

**New gaps uncovered by CAPSTONE: 0.** Every REQ has an owner; every unmet leg has a named deferral
row; the two gate failures were real finds fixed in-session (manifest drift declaration, gate
exemption annotation) and one test flake was hardened with the file's own convention.

## 8. New deferrals

**None.** The only genuinely-new obligation surfaced (`jobs.ts` purge objects leg) is already scoped
inside **D-P1.04-2**. The four MINOR items are corrections/hygiene, not obligations. One row was
*closed* instead: **D-P0.04-1 → DONE** (private-CI premise superseded; the committed protocols suite
+ freeze check run in the standard CI job).

## 9. Verdict

The 50-row build chain is **implementation-complete at Stage A** with zero unmapped spec requirements
and zero BLOCKER/MAJOR gaps. What stands between this tree and "fully verified" is exactly what the
manifest + DEFERRALS already name: the Stage-B deploy/live legs (the D-P1.\* bundles + Phase-0
residuals), the human legs (H2/H4/H5 + click-throughs + dossier sign-off), the procurement legs
(pen test, admin key, corpus commissioning), the deferred gates (G2 LIFT eval, G3 beta gates, H3
partner program), and one live product finding (D-PRB.21-1 cap-math). Per the standing gate
decisions, **G2 stays a HARD gate before public launch and §16.4 claims remain forbidden until LIFT
is met** — nothing in this CAPSTONE loosens that.
