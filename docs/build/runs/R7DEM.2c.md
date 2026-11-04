# R7DEM.2c — Converter: response ledgers, structure plan, what-changed, pipeline + golden harness

- **Spec:** `docs/tickets/217_R7DEM.2c__convert-ledgers-diffs.md` (seq 217 of 254; manifest row 217)
- **Base:** `stevevitali/r7dem-2b-letters` @ `fe8a758` (chainTip; stack rides unmerged PRs #240–#248, OPERATOR)
- **Branch:** `stevevitali/r7dem-2c-ledgers`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-04T02:07Z
- **Config:** Stage A only ($0). No preview (GD-PREVIEW.R7). Synthetic fixture only — the real
  export (HUMAN-H14 SIGNED 2026-11-03) is never an input here (REQ-CORPUS-14; S-12). Size budget
  ~600 changed lines excl. fixtures and goldens.
- **Closed:** (open)
- **ci:** (unread — read at closeout on the pushed head)

## Deferrals read

- Round-7 OPEN rows scanned: `D-R7OPEN.1-1`, `D-R7KIT.1-1`, `D-R7RO.1-1`, `D-R7FIX.1-1`,
  `D-R7COPY.0-1/-2` — all Stage-B/preview legs owed at 224's phase preview; a Stage-A converter
  ticket does not unblock them.
- `D-R6OSS.1-1` OPEN — the public-flip row; operator-owned. Not closed here.
- BL-100 (`docs/build/BACKLOG.csv:101`) — `parseDraftLedgerSections` reads only 1 of 17–18 real
  rows (Roman-numeral `#` cells). Spec §7 BACKLOG residue; this ticket opens companion DEFERRALS
  row `D-R7DEM.2c-1` (owner 253_R7REC.1), per REQ-CONV-17 / P4-22.

## Requirements

From the ticket's deliverables (REQ ids per the stamp list):

1. `src/convert/response-ledger.ts` per R2 §2.4: `findingOrdinal` resolution (letter majors, minors
   positional or by override, second-read labels via 216's reconciliation/labels aliases, open
   questions → roadmap finding); first-keyword disposition kinds with declared mappings; status
   mapping; verbatim `rationale` for rebut/escalate; `moveOrdinal` from a `Discharges` column;
   `moves[]` from the plan table; evidence anchored into v(N+1) via the 215 ladder; one entry per
   finding (first-listed row); unresolvable rows raw-table-only (216 default); ALL rows →
   `rows.json`. (REQ-CONV-10, REQ-CONV-16 consumer)
2. Override kinds added to the 215 mechanism: minor-row → finding map, mixed dispositions, and
   (only where a source table states it) move linkage. No hand-authored move map without a spec
   amendment — rounds without linkage stay Unlinked. (REQ-CONV-6 extension, REQ-CONV-15)
3. `src/convert/structure-plan.ts` per R2 §2.5: spine, sections; no anchors; the rest raw.
   (REQ-CONV-2)
4. Draft ledgers render raw: no draft-ledger sidecar; `src/convert/**` never imports
   `parseDraftLedgerSections` (test pins). Open `D-R7DEM.2c-1` (parser bug; BL-100 xref; owner
   `253_R7REC.1`; unblock: "253 R7REC.1 closes it to BACKLOG"). (REQ-CONV-17)
5. What-changed at build time (REQ-CONV-15): per round, `diffMarkdown` (vN → vN+1, sanitized
   drafts) + `traceRevisionMoves`/`buildWhatChangedView` over the response-ledger entries/moves →
   deterministic artifact 218 projects. Hunk with no trace is explicitly `Unlinked`; no link
   without an entry carrying both `moveOrdinal` and an anchor (test pins).
6. Pipeline `src/convert/index.ts`: per project dir, all passes in order, every sidecar through
   `parseSidecar`, abort with no partial output on any `failed`, every override row consumed.
   (REQ-CONV-2, REQ-CONV-6)
7. Golden harness (REQ-CONV-12 amended): per project under the 214 layout, canonical-JSON byte
   equality for every sidecar, `labels.json`, `rows.json`, what-changed artifact; summary-count
   reconciliation; zero-unmapped verdict/disposition/status lists; anchor-rung histograms;
   stale-override failure. Runs on the synthetic fixture in every PR; same harness 219 points at
   real projects.

## Acceptance criteria

| # | AC (ticket) | Required layer |
|---|---|---|
| 1 | response-ledger + structure-plan sidecars `parseStatus:"ok"`; a planted invalid sidecar aborts with no output | fixture-verified |
| 2 | disposition/status mapping zero-unmapped on fixture; mixed cells only via override; unconsumed override fails | fixture-verified |
| 3 | raw-only rows appear in `rows.json`, never as sidecar entries | fixture-verified |
| 4 | what-changed: discharges round links hunks; no-discharges round every hunk Unlinked; no fabricated link | fixture-verified |
| 5 | no `parseDraftLedgerSections` import under `src/convert/**` | engineered |
| 6 | REQ-CONV-17 DEFERRALS row opened (owner 253, date, BL xref, unblock, verification) | engineered |
| 7 | golden harness green + byte-stable on re-run | fixture-verified |
| 8 | optional local smoke on withheld real export (if produced): aggregate rates only | engineered |
| 9 | universal phase-gate AC | agentic |

## Plan

- `overrides.ts`: add `minor-finding`, `disposition`, `move-link` kinds additively (typed rows,
  `file:line` cites, consumption-tracked).
- `response-ledger.ts`: table scan (any `Disposition`-headed table is a row table incl. preamble;
  `## Revision plan` `Move` table → moves incl. `Discharges`/`Moots`); source-cell classifier per
  R2 §2.4; disposition/status tables verbatim from R2 §2.4 + prototype; `Discharge evidence`
  `- **Fn:** "…"` list + `Evidence` column → anchors into v(N+1); one entry per finding.
- `structure-plan.ts`: `## The spine` numbered items + `## Section map` rows → sidecar (no anchors).
- `draft-ledger.ts`: row-indexed `## Sections` rows only — never `parseDraftLedgerSections`.
- `index.ts`: `convertProject(files, overrides)` — discovery off `versions.json` +
  `correspondence/*-review/`, ledgers, drafting dirs; writes canonical-JSON outputs map; aborts
  (`ok:false`, empty outputs) on any error-level diagnostic or failed `parseSidecar`.
- What-changed artifact per adjacent draft pair: `{from,to,hunks[{id,kind,before,after,chars}],
  moves[trace], unlinkedHunks, unlinkedEntries, rebutted, summary}`.
- Fixture: append `## Discharge evidence` (F1/F2/F5 quotes verbatim from v2) to
  `v1-response-ledger.md` in `source/` + regenerate `corpus/` (additive bytes only);
  add `convert-overrides.json` exercising `minor-finding` (G1 → The one thing); COVERAGE.md dated note.
- Golden harness `convert/pipeline.test.ts` + `response-ledger.test.ts` etc.; goldens under
  `fixtures/synthetic/goldens/the-borrowed-commons/`.

## Test matrix

- response-ledger: v1 → 5 entries (F1/F2/F4/F5/F6); finding ordinals {1,2,8,9,13}; F3 dedups onto F1;
  moveOrdinals {F1:1, F2:3, F5:2}; rationale on rebut/escalate verbatim; F7/F8/F9 raw-only in rows.json.
  v2 → G1 via minor-finding override → ordinal 0; G2/G3 raw-only; zero unmapped on resolvable rows.
- dispositions: `decline`→rebut, `rebut with evidence`→rebut, mixed cell → override-only;
  statuses `done/escalated/open`; `operational`/`no change needed` unmapped on raw-only rows (never
  reach mapper); a mixed cell on a resolvable row fails without override, passes with it.
- moves: Discharges column absent (v2) → no moveOrdinals → all hunks Unlinked.
- what-changed v1→v2: M1/M2/M3 each link ≥1 hunk; remaining hunks Unlinked; v2→v3 all Unlinked.
- structure-plan: spine 5, sections 4, parseSidecar ok.
- draft-ledger: 4 rows ordinals 0–3, `#` cells verbatim Roman; no parseDraftLedgerSections import
  (repo-wide grep test).
- pipeline: byte-equal goldens; planted invalid sidecar → ok:false + empty outputs; stale override
  fails; byte-stable re-run.
- DEFERRALS row exists with owner/date/BL xref/unblock (asserted by hand, engineered).

## Progress

- 2026-11-04T02:07Z — branch `stevevitali/r7dem-2c-ledgers` forked off `fe8a758`; ledger seeded.
- 2026-11-04 — implemented `overrides.ts` (+`minor-finding`/`disposition`/`move-link`),
  `response-ledger.ts`, `structure-plan.ts`, `draft-ledger.ts`, `what-changed.ts`,
  `convertProject` pipeline in `index.ts`; fixture `## Discharge evidence` appended (additive,
  exporter regenerated); `convert-overrides.json` (minor-finding G1→"The one thing");
  `D-R7DEM.2c-1` opened (BL-100, owner 253_R7REC.1). Verify: turbo 138/138, vitest 6,472 pass
  (196 demo-corpus), lint/typecheck clean, `check:demo-corpus` 0 viol.

## Gap table

| item (spec §) | required | achieved | status | evidence |
|---|---|---|---|---|
| response-ledger sidecar `parseStatus:"ok"`; invalid aborts no-output (deliv.1/6) | fixture-verified | fixture-verified | met | `pipeline.test.ts` sidecar re-parse loop + planted-invalid leg |
| disposition/status zero-unmapped; mixed only via override; unconsumed fails (deliv.2) | fixture-verified | fixture-verified | met | `response-ledger.test.ts` map tables + override legs; `pipeline.test.ts` unmapped + stale-override legs |
| raw-only rows in `rows.json`, never entries (deliv.1) | fixture-verified | fixture-verified | met | `response-ledger.test.ts` rows.json leg (F7/F8/F9, G2/G3) |
| what-changed linked vs Unlinked rounds; no fabricated link (deliv.5) | fixture-verified | fixture-verified | met | `pipeline.test.ts` what-changed legs (v1→v2 linked h3; v2→v3 all Unlinked) |
| no `parseDraftLedgerSections` import under `src/convert/**` (deliv.4) | engineered | engineered | met | `pipeline.test.ts` source-scan leg |
| `D-R7DEM.2c-1` opened w/ owner/date/BL-100/unblock (deliv.4) | engineered | engineered | met | `docs/tickets/DEFERRALS.md` R7DEM.2c section |
| golden harness green + byte-stable (deliv.7) | fixture-verified | fixture-verified | met | `pipeline.test.ts` goldens leg + re-run determinism |
| optional real-export smoke (AC) | engineered | — | n-a | 214b's withheld real export exists but is not an input to Stage-A tests (REQ-CORPUS-14); aggregate-only smoke not run — real-corpus rates are 219's evidence |
| pipeline-wide override consumption (deliv.6) | fixture-verified | fixture-verified | met | end-of-run `book.unconsumed()` check in `convertProject` |
| structure plan spine+sections, no anchors, rest raw (deliv.3) | fixture-verified | fixture-verified | met | `structure-plan.ts` + `structure-plan.json` golden; RAW_ONLY covers the rest |
| universal phase-gate AC | agentic | engineered | met | this ledger; CI read at head below |

## Evidence log

- `pnpm turbo build lint typecheck` → 138/138 successful.
- `pnpm exec vitest run packages/demo-corpus` → 17 files, 196 tests pass (was 125/15 at base).
- `pnpm test` → 6,472 pass / 6 skip / 0 fail (544 files).
- `pnpm check:demo-corpus` → clean, 0 violations.
- v1 ledger → 5 entries {1,2,8,9,13} + 3 moves; F3 dedups onto F1; F7/F8/F9 raw-only.
- v2 ledger → 1 entry (G1 via minor-finding override); G2/G3 raw-only; no moveOrdinals.
- what-changed v1→v2: M1+M3 link h3 (coarse, real); v2→v3: 4 hunks all Unlinked.
- `04-draft-ledger.rows.json`: 4 rows, `#` cells verbatim I–IV.

## Evidence report

Finished the converter: response ledgers + structure plans become validated sidecars; per-round
What-changed is computed at build time from `diffMarkdown`/`buildWhatChangedView` —
`traceRevisionMoves` with links only through entries carrying `moveOrdinal`+anchor; one pipeline
runs every pass per project, aborts on any error with no partial output, and is byte-pinned by
per-project canonical-JSON goldens. Draft ledgers render raw (row-indexed `rows` twin only);
the `parseDraftLedgerSections` Roman-numeral bug is `D-R7DEM.2c-1` → BL-100, owner 253_R7REC.1.
Requirement ids stamped: REQ-CONV-2, REQ-CONV-6, REQ-CONV-10, REQ-CONV-12, REQ-CONV-15,
REQ-CONV-17. Stage A only ($0); no preview (GD-PREVIEW.R7); synthetic fixture only
(REQ-CORPUS-14; S-12).
