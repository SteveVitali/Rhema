# R7DATA.1 — The one real-data commit: sanitized corpus + real goldens + real snapshots

- **Spec:** `docs/tickets/219_R7DATA.1__real-corpus-data-commit.md` (row 219 of 254, round 7 R7a)
- **Base:** `stevevitali/r7dem-3b-runs` @ `c72c34e` · **Branch:** `stevevitali/r7data-1-real-corpus`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** agent-skills @ `e981ec5` (implement-spec)
- **Started:** 2026-11-04T06:07Z · **Closed:** —
- **Live stage:** Stage A only ($0) — local export + local gates; no preview, no network act.
- **Gate:** HUMAN-H14 SIGNED 2026-11-03 (`docs/build/readouts/HUMAN-H14.md`). Operator's words
  (verbatim): "sign H14 and continue". Signed export-manifest digest
  `19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91` (978 entries). Scope: exactly
  this digest — a different re-export needs a re-sign (H14 re-opens).

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start. Round-7-relevant rows: D-R6OSS.1-1 (the repo is
public — permanent history; why item-7 gates precede the commit) and D-R7DEM.2c-1 (REQ-CONV-17 →
BL-100, owner 253_R7REC.1 — unrelated to this ticket). No OPEN row is unblocked by this ticket;
none closed here. If H14 re-opens: `D-R7DATA.1-1` (kind P) per the ticket's Notes — not needed
(digest reproduced).

## Requirements (from the ticket's deliverables)

1. Re-export and verify the signature — digest == signed digest, else PAUSE. (REQ-CORPUS-14)
2. Real `convert-overrides.json` per project — R2 non-derivable mappings, every row cites
   file:line, ids + file:line + mapped value only, no quoted prose (P4-27). Denylist
   line-allowlist carried forward from `_rules/` unchanged. (REQ-CONV-6, REQ-CORPUS-2)
3. Real goldens via the 217 harness unchanged on the four real projects. (REQ-CONV-12 real half)
4. Real snapshots via the 218/218a regen command; contract/size/drift tests green on real data.
   (REQ-CORPUS-9, REQ-DWEB-15)
5. S-6 self-check: `assertShowcaseFixture` on GM v2 round-2 ledger; SPD C23a projects Tier 1 ·
   Misleading in context with its source. (REQ-CORPUS-10)
6. S-8 check: SPD v1→v2 What-changed carries natively linked hunks; unlinked stay Unlinked.
   (REQ-CONV-15 on real data)
7. Pre-commit gates in order on the staged tree: sanitizer re-run clean;
   `pnpm check:demo-corpus` (only S-11 credit lines allowlisted); `gitleaks dir` over every new
   path. (REQ-CORPUS-14, REQ-DOPS-4)
8. ONE data commit: corpus + overrides + allowlist + goldens + snapshots + `.gitignore`
   withholding lines/marker removal; every other commit carries no corpus-derived byte
   (per-commit `--stat` proof in the record).
9. Converter fixes only if real data forces them, in an earlier code commit with synthetic-first
   tests; larger than budget → PAUSE for a split.

## Acceptance criteria — (ticket § Acceptance criteria; layers recorded in the gap table)

H14 ticked + digest reproduced · pre-commit gates green with evidence · real goldens reconcile
(POV/SPD/CoR/GM v1) + GM v2 residual recorded + zero-unmapped + overrides consumed ·
`assertShowcaseFixture` on GM v2 + C23a · SPD v1→v2 linked hunks · real snapshots pass
contract/size/drift · override+allowlist rows ids+file:line only with a free-text-failing test ·
one corpus-byte commit + `public-safe` gitleaks green at PR head · universal phase-gate AC.

## Plan

1. Branch off `stevevitali/r7dem-3b-runs`; re-export to `/tmp/r7data1-export` (same inputs:
   source root + `_rules/` + `--date 2026-11-04`); compare digest + `diff -r` the withheld tree.
2. Probe `convertProject` per real slug with no overrides → collect error diagnostics (unmapped
   verdicts/dispositions/statuses, reconciliation, minor-finding resolution).
3. Author `packages/demo-corpus/overrides/<slug>/convert-overrides.json` rows (ids + file:line +
   mapped value only); iterate until the pipeline is green per slug.
4. Add `src/convert/real.test.ts` — the 217 harness pointed at `corpus/` + `overrides/` +
   `goldens/` (REGEN writes real goldens); summary reconciliation asserted on the reconciling
   rounds, GM v2 declared residual; zero-unmapped; S-6 claim-level checks.
5. Add `src/project/real.test.ts` — the 218/218a harness on real corpus → `snapshots/`;
   contract/size/drift + S-6 (`assertShowcaseFixture` on GM v2; SPD C23a) + S-8 (SPD v1→v2
   linked hunks) assertions.
6. `RHEMA_REGEN_GOLDENS=1` + `RHEMA_REGEN_SNAPSHOTS=1` produce the data; then gates
   (sanitizer/check-corpus/gitleaks), `pnpm turbo build lint typecheck` + `pnpm test`.
7. Commits: (a) code (tests + `.gitleaks.toml` if needed); (b) THE data commit (corpus +
   overrides + goldens + snapshots + `.gitignore`/tripwire removal); (c) closeout
   (run-ledger/BUILD_INDEX/LEDGER). PR `--base stevevitali/r7dem-3b-runs`.

## Test matrix

- convert real.test.ts: pipeline ok per slug; every sidecar parseSidecar ok; zero-unmapped;
  summaryReconciled true on the reconciling rounds; GM v2 `v2` round recorded-residual (asserts
  `false`); every override consumed; goldens byte-equal + re-run deterministic; a free-text
  guard over overrides/line-allowlist files.
- project real.test.ts: every emitted snapshot validates its kind; size bound; re-projection
  byte-identical (drift); GM v2 `assertShowcaseFixture`; SPD C23a tier 1 misleading_in_context +
  source; SPD v1→v2 `linkedHunks > 0`, unlinked hunks carry `moveId: null`.
- Gates: `pnpm check:demo-corpus`; `gitleaks dir` over corpus/goldens/snapshots/overrides;
  `git ls-files` tripwire checks (post-commit: marker gone, data tracked).

## Progress

- 2026-11-04 — branch cut at `c72c34e`; `@rhema/demo-corpus` build FULL TURBO.
- 2026-11-04 — re-export run: `--corpus /tmp/r7data1-export` needed `_rules/` copied in first
  (rules are exporter INPUT data at `<corpusRoot>/_rules/`). Clean export → kept 962 /
  excluded 43 / redactions 151 / published 4; manifest 978 entries; **digest
  `19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91` == signed**;
  `diff -r` withheld tree vs fresh export: identical. Gate GREEN — proceeding.

## Gap table

| AC | Layer | Evidence |
| --- | --- | --- |
| H14 ticked; digest reproduced before any commit | engineered + readout | `docs/build/readouts/HUMAN-H14.md` signed 2026-11-03 ("sign H14 and continue"); fresh `export.mjs` run to `/tmp/…` reproduced `19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91` exactly and `diff -rq` vs the withheld tree was silent — recorded in Progress. |
| Pre-commit gates green on the staged tree | engineered | `pnpm check:demo-corpus` clean (6 dirs scanned, 0 violations, 0 stale allowlist rows); `gitleaks dir` on `corpus/` and `goldens/` 0 leaks; `gitleaks dir` on `snapshots/` clean behind the same generated-data allowlist class as R7DEM.3b (`generic-api-key` on `"key"` envelope fields); the exporter's own inline sanitizer+denylist gate passed in the re-export. |
| Real goldens via the 217 harness; reconciliation per the spec | engineered + real-data | `src/convert/real.test.ts` — same harness, real paths. `summaryReconciled` true on POV v1, SPD v1, CoR v2, GM v1 (C15 riding `verdict-rescore`); GM v2 v2 declared residual asserted `false` (reuse confirmations appear as headings AND `## Reuse confirmations` bullets); zero-unmapped empty on all four; every override row consumed (unconsumed fails); goldens canonical-JSON byte-equal + deterministic. |
| `assertShowcaseFixture` on GM v2 + C23a | engineered + real-data | real.test.ts asserts it on GM v2's converted v2 ledger (III16/VII3-scope/XII2 all Tier 1 `contradicted` with nonempty `sources[]`) and asserts SPD C23a Tier 1 `misleading_in_context` with a source — R1's documented expectations on real data. |
| SPD v1→v2 linked hunks | engineered + real-data | `what-changed/v1-v2.json` `linkedHunks > 0` with M2-linked hunks; unlinked hunks carry `moveId: null`; the snapshot `diffs/1-2.json` `view.moves` repeats the check. |
| Real snapshots pass contract/size/drift | engineered + real-data | `src/project/real.test.ts` — every emitted chunk validates its registered kind; `indexViolations`/`resolveViolations` empty; per-kind envelope bound; lintCopy clean on generated labels; re-projection byte-identical to committed snapshots; `projects.json` carries the four rows in corpus order. |
| Override + allowlist rows ids + file:line only; no quoted prose | engineered | real.test.ts field-validation test — every key in `overrides.json`/`line-allowlist.json` within a declared allowlist of field names; every `cite` matches `file:line`; 18 corpus allowlist rows + 15 derived snapshots rows carry ids/reason only. |
| One commit carries corpus-derived bytes | engineered | `git show --stat d52c822` — 2057 files, all under `packages/demo-corpus/{corpus,overrides,goldens,snapshots}/` plus `.gitignore` removal + the inverted withholding test; the code commit `8fdb397` carries zero corpus bytes (10 files, src + tests + `.gitleaks.toml`). |
| `public-safe` gitleaks clean at PR head | engineered | `gitleaks dir` over corpus/goldens/snapshots/overrides — 0 leaks (corpus 5.5 MB, goldens 1.9 MB, snapshots 16.6 MB scanned). |
| Every new behavior has a failing-if-removed test | engineered | `real-variants.test.ts` (7) — synthesized real-shape inputs prove each fix fails before the change: wrapped/annotated summary counts, skipped id-list counting vs reason-prose false-positives, `### 2.1` labels, `#\|Header` + totals-row plans, override-precedence + unmapped-disposition + cite-file scoping. |
| Stage A only; no live claims | authored-code | $0. No preview, no network act beyond the operator-authorized local export inputs; no deployment, no paid inference. |

## Evidence log

- 2026-11-04 — converter fixes landed in `8fdb397` (item-9 earlier code commit): summary-count
  robustness (wraps, annotations, zero-strip, skipped-id counting — see Gap table), structure-plan
  `#|Header` variant + totals row, second-read `2.1` labels, response-ledger
  minor-finding/disposition precedence + cite-file scoping, files-tree `05-consolidation-notes`.
  `real-variants.test.ts` (7 synthesized-input tests) is the synthetic-first proof.
- 2026-11-04 — real overrides authored: `overrides/{the-governable-mind,constitution-of-reason,
  the-politics-of-visibility,structure-of-political-difference}/convert-overrides.json` — 25 rows
  total, each `file:line`-cited. ConvertProject green on all four slugs; zero unmapped.
- 2026-11-04 — `RHEMA_REGEN_GOLDENS=1` + `RHEMA_REGEN_SNAPSHOTS=1` produced the real goldens
  (2.0 MB) and snapshots (18 MB); `snapshots/_rules/line-allowlist.json` authored for the 15
  derived S-11 credit-line hits (corpus's 3 rows carried forward verbatim in derived chunks).
- 2026-11-04 — withholding tripwire inverted: `.gitignore` patterns removed; `withholding.test.ts`
  now asserts the marker is gone, dirs tracked, manifest digest == signed.
- 2026-11-04 — `pnpm turbo build lint typecheck` 138/138 · `pnpm test` 549 files / 6,576 pass /
  4 skip / 0 fail · `check:demo-corpus` clean · gitleaks clean at head.
- 2026-11-04 — data commit `d52c822` (the ONE corpus-byte commit, 2057 files). Records commit
  follows; push → PR `--base stevevitali/r7dem-3b-runs` → `ci-boundary` read.

## Evidence report

**Digest verdict: confirmed-reproduced.** A fresh local `export.mjs` run over
`~/agent-discourse/agent-scratch/projects` (`--date 2026-11-04`, `_rules/` seeded from the
withheld tree) emitted the signed manifest digest
`19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91` verbatim, with the H14 packet
aggregate (962 kept / 43 excluded / 151 redactions / 4 published), and `diff -rq` vs the withheld
tree was silent. The commit carries exactly the signed export.

**Real-data verification (parse rates).** convertProject `ok=true` on all four projects; zero
unmapped verdicts/dispositions/statuses; every emitted sidecar passes `parseSidecar`; claims
parsed 100% of headings (POV 56, SPD 56, CoR 37, GM v1 79, GM v2 68-headed incl. reuse); findings
parse per R2 (letters + second reads + reconciliations consumed).

**Summary reconciliation.** true on POV v1 (V49·SA7), SPD v1 (V22·SA3·Mic2), CoR v2 (V35·SA2),
GM v1 (V57·SA18·Mic1·Unv3 — C15 re-scored by override + skipped C71/C75 counted). GM v2 is the
recorded residual (R2 §1): reuse confirmations appear both as headings and `## Reuse
confirmations` bullets — `summaryReconciled.v2` asserted `false` with the reason declared in the
test.

**S-6.** `assertShowcaseFixture` passes on GM v2's real converted ledger; III16/VII3-scope/XII2
all emit Tier 1 `contradicted` with sources; SPD C23a emits Tier 1 `misleading_in_context` with a
source (R1's Tier-2→Tier-1 escalation).

**S-8.** SPD v1→v2 `linkedHunks > 0` (M2-linked hunks, the new §III); every unlinked hunk
`moveId: null` — no fabricated links anywhere in the corpus (REQ-CONV-15).

**Override bookkeeping.** GM 25 rows (1 verdict-rescore, 1 reconciliation, 20 minor-finding,
3 disposition) + CoR 2 reconciliation rows consumed end-to-end; POV/SPD carry empty files.
`rows.json` keeps every ledger row verbatim (REQ-CONV-10/16); join surface: joined findings carry
`findingOrdinal`; `noentry` lists recorded (one-thing/strengths/minor-10-GM-v2/no-answer rows
stay raw — honest absence, not a gap).
