# R7DATA.1 — The one real-data commit: sanitized corpus + real goldens + real snapshots

- **Ticket:** `docs/tickets/219_R7DATA.1__real-corpus-data-commit.md` (manifest row 219)
- **Base:** `stevevitali/r7dem-3b-runs` @ `c72c34e` · **Branch:** `stevevitali/r7data-1-real-corpus`
- **Gate:** HUMAN-H14 **SIGNED** 2026-11-03 (`docs/build/readouts/HUMAN-H14.md`, operator's words:
  "sign H14 and continue"). Signed export-manifest digest
  `19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91`.
- **Stage A only** — $0, local. No preview, no network act beyond the operator-authorized local
  export inputs; no deployment; no paid inference; no renderer override flags restored.

## What this does

Commits the exact H14-signed sanitized export plus its derived data — one data commit; public
history is permanent by design (D-R6OSS.1-1). A fresh local re-export reproduced the signed
digest byte-for-byte (`diff -rq` silent) before anything was staged.

- `corpus/` — the signed sanitized export, four projects (POV, SPD, CoR, GM); manifest digest ==
  signed; 962 kept / 43 excluded / 151 redactions / 4 published.
- `overrides/<slug>/convert-overrides.json` — the R2-identified non-derivable mappings only;
  every row is ids + `file:line` cite + mapped value (no quoted corpus prose).
- `goldens/` — real converter outputs through the unmodified 217 harness: every sidecar passes
  `parseSidecar`; zero-unmapped lists empty; summary counts reconcile on POV v1, SPD v1, CoR v2,
  GM v1; the GM v2 residual is recorded (asserted `false` with reason).
- `snapshots/` — real projector outputs + shared `projects.json`; contract, envelope and drift
  tests green; `snapshots/_rules/line-allowlist.json` covers the S-11 credit lines' 15 derived
  hits at exact file:line.
- `.gitignore` + `withholding.test.ts` — withholding patterns removed; the tripwire inverts
  (marker gone, dirs tracked, manifest digest == signed are now the enforced invariant).
- Converter/projector fixes (earlier code commit `8fdb397`, synthetic-first): real summary
  shapes (wrapped `·` items, annotated counts, `Skipped` id-lists, zero-count normalization);
  `#|Header` Section-map variant + totals row; `### 2.1` second-read labels; `minor-finding`/
  `disposition` override precedence + ledger-file cite scoping; `05-consolidation-notes` kind.
- `.gitleaks.toml` — the generated-snapshot allowlist extended to the real snapshots dir
  (same `generic-api-key` `"key"`-envelope false-positive class as R7DEM.3b).

## Every override row (operator review — all ids + file:line, no prose)

**the-governable-mind** (23 rows):

| kind | target | value | cite |
| --- | --- | --- | --- |
| verdict-rescore | claim C15 | misleading_in_context | `correspondence/v1-review/01-claim-ledger.md:9` |
| reconciliation | objection i | merged → major 6 | `agents/author/ledgers/v1-response-ledger.md:45` |
| minor-finding | row F42 | Minor 1 | `agents/author/ledgers/v2-response-ledger.md:110` |
| minor-finding | row F43 | Minor 1 | `agents/author/ledgers/v2-response-ledger.md:111` |
| minor-finding | row F44 | Minor 1 | `agents/author/ledgers/v2-response-ledger.md:112` |
| minor-finding | row F45 | Minor 1 | `agents/author/ledgers/v2-response-ledger.md:113` |
| minor-finding | row F46 | Minor 1 | `agents/author/ledgers/v2-response-ledger.md:114` |
| minor-finding | row F47 | Minor 1 | `agents/author/ledgers/v2-response-ledger.md:115` |
| minor-finding | row F48 | Minor 1 | `agents/author/ledgers/v2-response-ledger.md:116` |
| minor-finding | row F49 | Minor 1 | `agents/author/ledgers/v2-response-ledger.md:117` |
| minor-finding | row F50 | Minor 1 | `agents/author/ledgers/v2-response-ledger.md:118` |
| minor-finding | row F51 | Minor 2 | `agents/author/ledgers/v2-response-ledger.md:119` |
| minor-finding | row F52 | Minor 3 | `agents/author/ledgers/v2-response-ledger.md:120` |
| minor-finding | row F53 | Minor 4 | `agents/author/ledgers/v2-response-ledger.md:121` |
| minor-finding | row F54 | Minor 5 | `agents/author/ledgers/v2-response-ledger.md:122` |
| minor-finding | row F55 | Minor 6 | `agents/author/ledgers/v2-response-ledger.md:123` |
| minor-finding | row F56 | Minor 7 | `agents/author/ledgers/v2-response-ledger.md:124` |
| minor-finding | row F57 | Minor 7 | `agents/author/ledgers/v2-response-ledger.md:125` |
| minor-finding | row F58 | Minor 8 | `agents/author/ledgers/v2-response-ledger.md:126` |
| minor-finding | row F59 | Minor 9 | `agents/author/ledgers/v2-response-ledger.md:127` |
| minor-finding | row F60 | Minor 11 | `agents/author/ledgers/v2-response-ledger.md:128` |
| minor-finding | row F61 | Minor 12 | `agents/author/ledgers/v2-response-ledger.md:129` |
| disposition | row F49 | rebut | `agents/author/ledgers/v2-response-ledger.md:117` |
| disposition | row F58 | accept | `agents/author/ledgers/v2-response-ledger.md:126` |
| disposition | row F61 | defer | `agents/author/ledgers/v2-response-ledger.md:129` |

**constitution-of-reason** (2 rows):

| kind | target | value | cite |
| --- | --- | --- | --- |
| reconciliation | objection iii | merged → major 5 | `agents/author/ledgers/v2-response-ledger.md:26` |
| reconciliation | objection v | merged → major 6 | `agents/author/ledgers/v2-response-ledger.md:27` |

**the-politics-of-visibility / structure-of-political-difference** — empty override files:
nothing non-derivable in either ledger (positional + heuristic joins held on real data).

Rationale by kind: the C15 re-score is what the ledger's own summary declares; reconciliation
rows name merges the response ledger's Source cells state but the overlap heuristic missed;
the GM v2 minor map exists because GM v2's ledger merges minors, line notes and claim-ledger
rows into one ~20-row table (positional would silently misjoin); the three dispositions decide
mixed (`accept … **rebut**`) and unmapped (`awaiting the author`) cells the first-keyword rules
cannot.

## Verification (Stage A evidence)

- `pnpm turbo build lint typecheck` — 138/138 green.
- `pnpm test` — 549 files / **6,576 pass / 4 skip / 0 fail**.
- `pnpm check:demo-corpus` — clean, 6 corpus dirs scanned, 0 violations, 0 stale allowlist rows.
- `gitleaks dir` — 0 leaks on `corpus/` (5.5 MB), `goldens/` (1.9 MB), `snapshots/` (16.6 MB,
  under the narrow generated-data allowlist), `overrides/`.
- `src/convert/real.test.ts` (25) + `src/project/real.test.ts` (27) + `real-variants.test.ts`
  (7) — all green; real.test.ts covers conversion, reconciliation, zero-unmapped, override
  consumption, golden byte-equality, S-6 (`assertShowcaseFixture` on GM v2; SPD C23a), S-8
  (SPD linked hunks) and the ids+file:line-only field guard.
- Withholding invariant: `withholding.test.ts` asserts the marker is gone, the three dirs are
  tracked at HEAD, and `corpus/export-manifest.json` carries the signed digest.

## Commits

- `8fdb397` — code: converter/projector parse fixes + tests + `.gitleaks.toml` (no corpus bytes).
- `d52c822` — **the one data commit**: corpus + overrides + goldens + snapshots + withholding
  removal (2,057 files; `git show --stat` evidence in the run record).
- records commit — run/PR records, BUILD_INDEX, LEDGER.

## Requirements stamped

REQ-CORPUS-2, REQ-CORPUS-9, REQ-CORPUS-10, REQ-CORPUS-14, REQ-CONV-6, REQ-CONV-12 (real half),
REQ-CONV-15, REQ-DOPS-4; S-6, S-8, S-11, S-12 (round-7 draft spec §3.3); D-R6OSS.1-1,
HUMAN-H14, P4-27, GD-DEMO-BYLINE-SCOPE.R7.

## Deferrals

None opened; none closed. `D-R7DATA.1-1` was not needed — the digest reproduced. The GM v2
summary residual is a declared test invariant (asserted `false`), not a deferral — R2 §1 records
why it cannot reconcile by construction.

## Operator asks

- Review the 25 override rows above (the only authored mappings in the data commit) — each cites
  its corpus source line.
- Merge order stays bottom-up per `mergePolicy: OPERATOR`; this PR stacks on
  `stevevitali/r7dem-3b-runs` (PR #251, unmerged).
- This repo is public: the commit is permanent history — that is the H14-signed intent.
