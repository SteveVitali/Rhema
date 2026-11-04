# R7DATA.1 — The one real-data commit: sanitized corpus + real goldens + real snapshots

- **Sequence:** 219 of 254 · **Phase:** round 7 (R7a) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 214c_HUMAN-H14 (the operator's signed export-manifest digest; nothing real is
  committed without it), 218a_R7DEM.3b (the dossier, run-report, timeline, replay and card-count
  projection; with its own dependency on 218_R7DEM.3, it completes the corpus → convert → project
  pipeline proven on the synthetic fixture)
- **Run:** `implement-spec spec=docs/tickets/219_R7DATA.1__real-corpus-data-commit.md`
- **Gate status:**
  - [ ] **HUMAN-H14 signed** (`214c_HUMAN-H14`; `docs/build/readouts/HUMAN-H14.md`: operator's
    verbatim approval + the export-manifest digest). Unticked → **do not start**; report "gate pending".
  - Not pre-authorized: a commit whose corpus digest differs from the signed digest. A mismatch
    → **PAUSE** for a re-sign (H14 re-opens); never commit and explain afterwards.
- **Live stage:** Stage A only ($0): a local export from `~/agent-discourse` and local gates. No
  preview (`GD-PREVIEW.R7`) and no network act.
- **Production mutations:** none (the repo is public, so this commit is **permanent public
  history**: pre-state = the PR base; the only rollback is an operator-authorized history act, per
  the F-R6DEP.2-2 precedent, which is why every gate below runs first)
- **Size budget:** ~250 changed lines of code/records (overrides, residual declarations, tripwire
  removal, evidence) excl. the corpus, goldens and snapshots data

## Goal
Land the real corpus, its real converter goldens and its real DTO snapshots in a single data commit,
after the operator's corpus sign-off and after every local gate passes. The commit carries exactly
the bytes the operator signed. The converter's real-data claims (summary-count reconciliation,
zero-unmapped lists, the GM v2 contradicted-claim self-check) are verified here for the first time
on committed data.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §3.3 S-6, S-8, S-11, S-12; §4.1 REQ-CORPUS-2, 10, 14; §4.2
  (REQ-CONV-12 amended: real goldens land here; REQ-CONV-6 overrides); §4.17 REQ-DOPS-4; §5.2; §6
  HUMAN-H14; §8.
- `docs/build/planning/2026-11-03_r7-demo/R2-converter-feasibility.md` §1 (expected parse rates and
  the Self-consistency line: POV/SPD/CoR/GM v1 reconcile, GM v2 is a known residual), §3 (expected
  rung histogram ranges), §4 (expected hunk/link counts; SPD linked), §5 tests (i)–(vi).
- `R1-corpus-census.md` §3 (the GM v2 Tier-1 Contradicted rows S-6 cites).
- `R4-acceptance-deploy-conventions.md` §3 gitleaks (sanitizer stripping over allowlisting; full
  history scanned on push).
- `REVIEW-round-7-draft-spec.md` RV-5.
- `docs/build/readouts/HUMAN-H14.md` (the signed digest) and 214b's run record (the recorded input
  tree digest, exporter SHA, aggregate counts, packet path).
- Anchors (re-confirm at build time): `packages/demo-corpus/.gitignore` (the withholding lines and
  dated marker) and the tripwire test 214 added; `tools/demo-corpus/export.mjs`; the 217
  pipeline/golden harness and the 218/218a regeneration command; `pnpm check:demo-corpus`;
  `.gitleaks.toml`; `packages/contracts/src/domain/showcase.ts` (`assertShowcaseFixture`); local
  `gitleaks` (≥ 8.19, `gitleaks dir`).

## In scope — deliverables
1. **Re-export and verify the signature.** Re-run the deterministic exporter from the local
   source. Its export-manifest digest must equal the H14-signed digest, or PAUSE. (REQ-CORPUS-14)
2. **Real converter inputs.**
   - Author each real project's `convert-overrides.json`, every row citing its source line, for the
     R2-identified non-derivable mappings: GM v1 C15 re-score, second-read reconciliation, GM v2
     minor-row map, mixed dispositions.
   - Carry forward the denylist line-allowlist for the Published credit lines (file:line, S-11)
     from the withheld `_rules/` that 214b authored and H14 reviewed. Add no entry beyond those
     credit lines.
   - Both are corpus-derived data and land in the data commit. (REQ-CONV-6, REQ-CORPUS-2)
   - **No quoted prose** (P4-27). The override and allowlist rows are created or committed after
     H14 signed. So every row holds ids plus file:line only (and the mapped value, e.g. a
     canonical verdict or finding ordinal), never a quoted corpus phrase. The PR body lists every
     such row (file, row id, file:line, kind) under a heading that flags them for the operator's
     merge read.
3. **Real goldens** via the 217 harness, unchanged, pointed at the four real projects: canonical
   JSON for every sidecar; summary-count reconciliation for POV, SPD, CoR and GM v1; GM v2
   declared as a recorded residual with its reason; zero-unmapped lists; pinned rung histograms.
   (REQ-CONV-12 real half)
4. **Real snapshots** via the 218/218a regeneration command, with the contract, size and drift
   tests green on real data. (REQ-CORPUS-9, REQ-DWEB-15 on real rounds)
5. **S-6 self-check**: `assertShowcaseFixture` passes on GM v2's round-2 ledger; SPD's C23a
   projects as Tier 1 · Misleading in context with its source. (REQ-CORPUS-10)
6. **S-8 check**: SPD v1→v2 What-changed carries the natively linked hunks; unlinked hunks are
   Unlinked. (REQ-CONV-15 on real data)
7. **Pre-commit gates, in order, on the staged tree:** sanitizer re-run clean;
   `pnpm check:demo-corpus` (denylist; the only allowlisted lines are the S-11 credit lines);
   `gitleaks dir` over every new path; no `.gitleaks.toml` entry added unless it is a narrow,
   dated regex (sanitizer stripping preferred). (REQ-CORPUS-14, REQ-DOPS-4)
8. **The one data commit.** A single commit carries every real corpus byte, the real overrides
   and allowlist, the real goldens and the real snapshots, and removes the withholding
   `.gitignore` lines and the marker that arms 214's tripwire. Any other commit in the PR carries
   no corpus-derived byte, which `git show --stat` per commit proves in the run record.
9. **Converter fixes only if real data forces them.** A real-data parse failure the fixture missed
   is fixed in a separate, earlier code commit: the fixture gains the variant additively plus a
   synthetic golden, and the code is tested on synthetic first. If the fix is larger than the
   budget, PAUSE and request a split rather than stretching.

## Out of scope
- Serving the corpus, putting it in the web image, the image-content assertion: 220_R7DEM.4.
- Hub, cards, tour copy: 221a/222; copy sign-off: 223a_HUMAN-H15.
- Any deploy: 224_R7DEP.1.
- Rewriting history for any reason: operator act only.

## Acceptance criteria
- [ ] H14 ticked before any work starts, and the re-exported digest equals the signed digest
      *(agentic · layer: human-completed)*
- [ ] Every pre-commit gate in item 7 green on the staged tree, with evidence in the run record
      *(deterministic · layer: engineered)*
- [ ] Real goldens: summary counts reconcile for POV, SPD, CoR and GM v1; GM v2 residual recorded;
      zero-unmapped lists empty; every override consumed *(deterministic · layer:
      fixture-verified)*
- [ ] `assertShowcaseFixture` passes on GM v2; C23a projects as S-6 states *(deterministic ·
      layer: fixture-verified)*
- [ ] SPD v1→v2 What-changed shows the linked hunks (M2 → F1, the new §III) *(deterministic ·
      layer: fixture-verified)*
- [ ] Real snapshots pass the 218/218a contract, size and drift tests *(deterministic · layer:
      fixture-verified)*
- [ ] Every real `convert-overrides.json` row and every line-allowlist row holds ids plus file:line
      only, with no quoted corpus prose. A test over those files fails on any free-text field
      beyond the declared id, file:line and mapped-value fields. The PR body lists each row for
      the operator's merge read (P4-27) *(deterministic · layer: engineered)*
- [ ] Exactly one commit carries corpus-derived bytes (per-commit `--stat` recorded); the
      withholding lines are removed in that commit; CI `public-safe` gitleaks (full history on
      push) green at the PR head *(deterministic · layer: engineered)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-CORPUS-14, REQ-CORPUS-10 (GM v2 execution), REQ-CORPUS-2 (real allowlist entries),
REQ-CONV-12 (real goldens), REQ-CONV-6 (real overrides), REQ-CONV-15 (SPD on real data),
REQ-DOPS-4 (pre-commit gates on the real commit)

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 3 (no private/eval text; protocols public), 8, 14, 15
  (scoped authority: the H14 signature covers exactly one digest), 17, 18 (this is the one sanctioned
  real-corpus merge, after HUMAN-H14), 19.
- Spec §8.3 (essay content is data; pen name per S-11), §8.5 (`licenses`, `no-cookies`,
  `spa-budget` stay green; no snapshot is bundled), §8.6 (records appended only), §8.7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.
  Rule 5 binds: the H14 words and digest are quoted verbatim in the run record.

## Notes
- **Withholds nothing else.** After this commit the only open corpus-related gate is HUMAN-H15
  (demo copy). This ticket makes no copy, serving or public claim.
- **Owns:** the real `convert-overrides.json` files and the GM v2 residual declaration. It commits
  the credit-line allowlist entries 214b authored, but does not originate them.
- **Consumes:** 214's exporter, gates, layout and tripwire (owner 214); 214b's withheld `_rules/`
  and packet digest (owner 214b); 217's harness (owner 217); the regeneration command and tests
  (owners 218 and 218a). This ticket changes none of their behaviour
  except under item 9.
- **DEFERRALS:** D-R6OSS.1-1 (the repo is public) is why item 7 precedes item 8. If H14 is
  re-opened by a digest mismatch, open `D-R7DATA.1-1` (kind `P`, "H14 pending · withholds: real
  corpus bytes, goldens, snapshots") and stop.
