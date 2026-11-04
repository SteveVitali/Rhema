# R2 — Markdown → sidecar converter feasibility (round 7, rhema.tools/demo)

- **Row:** R2 (research), 2026-11-03. No repo source was modified and nothing was committed. `pnpm turbo build --filter=@rhema/protocols... --filter=@rhema/findings-core...` ran and hit the cache (3/3).
- **Verdict: feasible.** A deterministic, pure-function converter turns the four projects' structured markdown into sidecars that the real validators accept. The 22 canonical sidecars the prototype emitted (5 claim ledgers, 5 findings, 5 rubrics, 5 response ledgers, 2 structure plans; 675 rows) all return `parseStatus: "ok"` from `parseSidecar` (`packages/protocols/parsers/index.ts`).
- **Negative controls prove the gate bites.** Each of these returns `failed`: the raw strings `"Verified (reuse confirmation)"`, `"Misleading"`, `"Skipped"`, `"Thesis & contribution"` and `"Voice & audience fit"`; a claim whose `url` is not the first source of its verdict-determining stance (REQ-OBJ-18); and `letterSection: "minor"`. Canonicalization therefore has to be explicit, because `coercedEnum` alone does not rescue it.
- **Scope of "deterministic".** It holds for identifiers, verdicts, tiers, dispositions, scores, tables and quotes. A few items need a small committed per-project override file rather than a heuristic: second-read reconciliation, one summary-level verdict re-score (GM v1 C15), the response-ledger→finding join for GM v2's minors, a handful of mixed dispositions, and the POV move map if Q3 says yes.
- **Prototype.** Throwaway `.mjs` files in `/private/tmp/claude-501/-Users-stevenvitali-Rh-ma/74b2ccff-5dcf-4a6d-8b25-f7c0cd70a956/scratchpad/r2/`: `lib.mjs`, `anchor.mjs`, `claims.mjs`, `letter.mjs`, `ledger.mjs`, `run-*.mjs`, `final-claims.mjs`, outputs under `out/`. They import the built `dist` of `@rhema/findings-core` (`splitMarkdownBlocks`, `diffMarkdown`, `traceRevisionMoves`) and `@rhema/protocols` (`parseSidecar`, `parseDraftLedgerSections`) by absolute path.
- **Rounds covered:** POV v1, SPD v1, CoR v2, GM v1, GM v2. Each review is anchored to the draft it read; each response is diffed against the next draft.

## 1. Parse rates

| Artifact | POV | SPD | CoR | GM v1 | GM v2 | Total |
|---|---|---|---|---|---|---|
| Claim-ledger entries (`### ID · Tier n · Verdict`) parsed / headings | 56/56 | 27/27 | 37/37 | 79/79 | 68/68 | **267/267 (100%)** |
| …verdict canonicalized | 56 | 27 | 37 | 79 | 68 | 100% (qualifiers split off: 1/0/0/4/21) |
| …≥1 evidence URL (links + `(reused note: slug)` + `as in <ID>`) | 55 | 27 | 37 | 78 | 67 | 264 (98.9%) |
| Letter: verdict + "The one thing" | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| Letter majors with all four bullets | 6/6 | 6/6 | 6/6 | 7/7 | 7/7 | 32/32 |
| Letter strengths / minors / line notes / considered-and-rejected | 5/14/4/5 | 6/12/4/4 | 5/10/5/5 | 11/11/5/6 | 9/12/3/7 | 36/59/21/27 |
| Scorecard dimensions mapped | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 40/40 |
| Second-read objections / strengths (labels parsed) | 5/3 | 5/3 | 5/3 | 5/3 | 5/3 | 25/15 (0 unlabeled) |
| Response-ledger rows | 47 | 44 | 42 | 80 | 87 | 300 |
| …disposition kind: exact / first-keyword / skip / unmapped | 40/6/1/0 | 42/0/0/2 | 36/6/0/0 | 71/7/0/2 | 74/2/0/11 | 263/21/1/15 (94.7% mapped) |
| …status unmapped | 0 | 0 | 0 | 3 | 2 | 5 (all fixable by rule, §2.4) |
| Revision-plan moves (with a `Discharges` column) | 13 (0) | 9 (9) | 11 prose (0) | 20 (20) | 12 (12) | 65 (41) |
| Structure plan: spine / sections (`02-structure-plan.md`) | 15/18 | — | — | 12/17 | — | 2/2 validate |
| Draft ledger `## Sections` rows: prototype / Rhēma `parseDraftLedgerSections` | 18 / **1** | — | — | 17 / **1** | — | see risk R4 |
| Drafter `03-claim-ledger.md`: entries with a verdict | 48/48 (H3 bullets) | — | — | 61/61 (table) | — | URLs: 0 linked / 145 |
| Source notes with all 6 fields / URL+date only | author 124/0, editor 0/**52** | 17/0, 39/1 | 4/11 | 265/2, 355/0 | — | **804/870 full (92.4%)**; 870/870 have URL+date |

**Failure taxonomy (claim ledgers)**

- **Headings.** None failed. Several variants are absorbed by one grammar: `^([A-Z]+\d+[a-z]?(?:-[a-z]+)?)\s*(\(...\))?\s*·\s*Tier\s+(\d)([^·]*)·\s*(.+)$`.
  - Section-style IDs: `III16`, `VII3-scope`, `P4`, `X11`.
  - Lettered sub-claims: SPD `C23a`.
  - Parentheticals after the ID: GM v2 `XV2 (reuse C44, fix checked)`, `VI4 ("parallelizable" clause)`.
  - Tier qualifiers: SPD `Tier 2, escalated to Tier 1`; POV `Tier 2 (escalated: reputationally protective)`, `Tier 1 (epigraph)`.
  - Free text after the verdict: `Verified (reuse confirmation)`; `Contradicted in one clause (major escalation); the rest Substantially accurate` (the first keyword wins); `Substantially accurate on substance; the quotation is unverifiable and must be de-quoted`.
- **Non-verdicts.** `Skipped` and `(not scored — evaluative)` (GM v1 C71, C75) map to `unverifiable` with a note, following the fixture precedent (CoR C37).
- **Summary overrides a heading.** In GM v1, C15's heading says *Substantially accurate*, but the combined summary says "re-scored **Misleading in context** by the editor after Phase 2". This is the only Tier-1 escalation in that round, so heading-only parsing would hide it. It needs an override row.
- **Body content outside entries.**
  - H2 appendices (`## Reuse confirmations`: 28 bullet-form claims in GM v2; `## References checked`) would glue onto the last H3. H3 bodies must stop at any H1/H2.
  - CoR `### Skipped` holds 2 bullet-form claims (`- **C37 · Tier 3**`).
- **Extra bullet labels.** POV adds `Note`, `Note (timeline)`, `Currency`, `Fix (optional)`, `Fix (minor)`. CoR adds `Report against interest`. These are carried in `note`.
- **Evidence without links.**
  - GM v2 has 42 source URLs recovered through `(reused note: slug)` → `agents/editor/research/sources/<slug>.md`, plus back-references (`Rakoff memorandum, as in III19`).
  - Unrecoverable: POV C46 (pure characterization), GM v1 C75 (skipped), GM v2 P8.
- **GM v2 file duplication.** `01-claim-ledger.md` is exactly Part A (43) + Part B (25) under a combined summary, with no duplicate IDs. `-A`/`-B` are subsets: convert the merged file only and render A/B raw or drop them.
- **Dates.** CoR has no `Verified|Checked YYYY-MM-DD`; the fallback is the first ISO date in the header ("opened during this session (2026-07-30)"). The fixture's `2026-08-19` for CoR has no source and should not be reused.
- **Self-consistency.** Summary counts reproduce exactly from headings for POV (49/7), SPD (22/3/2), CoR (35/2) and GM v1 (after the C15 override). GM v2 does not reconcile, because reuse confirmations appear both as headings and as bullets. The golden test should assert the four that do and record GM v2 as a known residual.

**Failure taxonomy (other artifacts)**

- **Letters.**
  - GM varies the problem label (`The problem, part one (the architecture)`, `Part two (identity…)`, `The problem (ledger XII2 Contradicted; …)`). Rule: every bullet that is not Where/Why/Direction is problem text.
  - Lists mix `- ` and `1. ` (SPD strengths, GM line notes).
  - Two major bodies exceed the 4096-char cap: GM v1 4159 and GM v2 4203.
  - Considered-and-rejected bullets inherit their origin from lead-in paragraphs ("From the second read, evaluated and not adopted:" vs "From my own deliberation…").
- **Response ledgers.**
  - Unmapped dispositions (15): `operational`, `no change needed`, `mooted by F33`, `covered by F54…`, `§3.B accept; the volume point **rebut**` (mixed), `(causes are F2, F4, …)`, `awaiting the author`.
  - Unmapped statuses: `rebutted` (×3), `unresolved`.
  - GM v1 adds a second, prose triage (`### F1 · Letter §Major 1 · adapt · open`) that is stale: status `open`/`pending` everywhere. The table is authoritative.
  - Column count is 5, except GM v2, which has 6 (`Evidence in v3`).
  - Minor rows carry no index into the letter. Positional matching agrees with best-overlap 13/14, 12/12, 10/10 and 10/11, but only 1/20 for GM v2: that ledger merges "Minor issues, line notes, and the claim ledger" into 20 rows against 12 letter minors.
- **Source notes.** POV's 52 editor notes are free-form ("Establishes: …" prose, a bare URL bullet, "Accessed …" sentence). 24 of them do have a `**URL:**` label. CoR author notes lack "Key passages" in 11/15.

## 2. Field mapping

### 2.1 Claim ledger → `claimLedgerSidecarSchema` (`packages/contracts/src/sidecars.ts`)

| Source | Field | Rule |
|---|---|---|
| ledger order | `ordinal` | 0-based document order. IDs like `III16`/`C23a` are not integers. The fixture's `C23a → 231` encoding is not extensible to section IDs. The original ID goes to a converter side-table (`labels.json`), because the schema has no label field. |
| `> …` quote lines | `text` | Joined, with the trailing locator parenthetical (`(l.10)`, `(Opening ¶1)`, `(§IV; fn 1)`) stripped. Kept verbatim; the fixtures' paraphrased texts are not a precedent to follow. |
| `Tier n` / `escalated to Tier m` | `tier` | Final tier (m when escalated). |
| verdict text | `verdict` | Leading keyword: `Verified→verified`, `Substantially accurate→substantially_accurate`, `Misleading[ in context]→misleading_in_context`, `Unsupported`, `Contradicted`, `Unverifiable`; `Skipped`/`(not scored…)` → `unverifiable`. The remainder (e.g. "(reuse confirmation)") is prepended to `note`. Summary re-scores are applied from the override file. |
| — | `kind` | **Omit.** Nothing in the markdown states it. A keyword classifier would assert REQ-OBJ-19 checkability that the editor never declared. The fixture's kinds were hand-assigned. |
| Evidence links, reused-note URLs, `as in <ID>` | `sources[]` | `{url, normalizedUrl, accessedAt, stance}`. `normalizedUrl` comes from `@rhema/contracts` `normalizeUrl` (the fixtures' `minnesotareformer.com` form is non-canonical). `accessedAt` = the ledger check date `T00:00:00Z`, declared as "date of the check session". `stance` = `verdictDeterminingStance(verdict)` (supports / contradicts / contextualizes); for `unsupported`/`unverifiable` use `contextualizes`. The ledger never labels a stance per link, so this is a declared lossy rule: GM III16 lists Forbes (contradicting) beside Pfefferkorn (context) under one stance. |
| first source | `url`, `normalizedUrl`, `accessedAt` | Must equal `sources[0]`, which is always of the determining stance under the rule above. That satisfies `parseClaimLedger`'s REQ-OBJ-18 check by construction. **Do not copy SPD fixture C23a's `misleading → contradicts`**: once `url` is set, it fails REQ-OBJ-18. |
| Fix / Finding / Note / Currency bullets | `note` | `Fix:` first, then `Finding:`, then others, verbatim. |
| — | `sourceCheck` | Omit. There is no fetch log, so `matches_citation` would be unprovable. |
| quote → draft | `anchor` | §3. Omitted when unresolved; the schema allows omission. |
| ledger header | `inventoryCount` | Taken from "Claims inventoried: N" (56/24/39/79/108). It differs from the row count (SPD 24 vs 27 entries; CoR 39 vs 37 headed + 2 skipped; GM v2 108 vs 68 headed). |

### 2.2 Editor's letter + second read → `findingsSidecarSchema`

| Source | kind | severity | origin / reconciliation | letterSection | anchor |
|---|---|---|---|---|---|
| Verdict "**The one thing:**" | `kind` of the major it restates | `major` (Q1) | editor | `one_thing` | its quoted text |
| `### n. title` + Where / The problem / Why it matters here / Direction | Kind of the first scorecard dimension whose Basis cites "Major issue n"/"MI n"; else keyword fallback. The mapping is dimension→kind: thesis/rigor/honesty→argument, evidence→claim, originality→discourse, structure→structure, prose→craft, voice→voice. 25/32 resolve via the scorecard. | `major` (the letters rank majors 1..n and never use "blocking"; grep finds 0 occurrences) | `both`+`kept` when a second-read objection reconciles to it, else `editor` | `major` | Where quotes (§3) |
| Strengths bullets | `craft` (Q2) | `note` | editor (`both` if text says "second read") | `strength` | quoted text |
| Minor issues | `claim` if it cites `Ledger Cn`/`ref [n]`/quote hygiene, else `craft` | `minor` | editor | — (no enum slot) | quoted text |
| Line notes | `craft` | `note` | editor | — | quoted text |
| Second-read objection not reconciled | `argument` | `minor` | `second_read`+`kept` | — | its quoted lines |
| Second-read objection rejected in "Considered and rejected" | `argument` | `note` | `second_read`+`rejected` | `considered_rejected` | `null` |
| Editor's own considered-and-rejected | `argument` | `note` | editor | `considered_rejected` | `null` |
| Roadmap "Open questions for the author" | `argument` | `note` | editor | `roadmap` | `null`; these are what `escalate` rows answer |

- **Body and title.** `body` = Problem + Why + Direction with the bold labels kept, truncated at 4093 chars plus "…". The full text is always available in the raw letter.
- **rubricDims** = every dimension whose Basis cites the major.
- **evidence.urls** = links in the problem and direction text, with `accessed` = the review date.
- **evidence.verdict** is set only for claim-kind minors that cite one ledger row.
- **suggestion.replacement: absent everywhere.** Directions are prescriptions, not replacement text. The POV fixture's `suggestion` was invented.

**Reconciliation.**

- Explicit mentions come first. GM v2's labels say "the second reader's objection 2.4"; "second read 2.3".
- The heuristic rule then counts an objection as reconciled when its title+body overlap with a major's title+problem is ≥ 0.15 and ≥ 2× the runner-up.
- An explicit rejection in Considered-and-rejected wins over a merge.
- Scored against the author ledgers' `Source` cells (`L Major 1 / SR i`, `Letter §Major 6(a); second read (i)`), this gets **23/25** right. Misses are CoR v→6 and GM v1 i→6, both below-margin ties. Hence the override file.
- Second-read strengths (15) are not findings. They render in the raw second read.

Totals emitted: 33/34/31/39/37 = 174 findings.

### 2.3 Scorecard → `rubricSidecarSchema`

- **Dimension names** go through an explicit map (`Thesis & contribution→thesis_contribution`, …, `Voice & audience fit→voice_audience_fit`). `coercedEnum` fails on `&`.
- **`score`** = the integer cell.
- **`cap`** is emitted when Basis matches `/cap(ped)?|by rule|rubric cap/`, with `at = min(score, 4)`, `reason` = Basis, and `entailedByFindingOrdinal` = the first cited major. Detected caps: POV rigor+originality, SPD rigor+evidence, GM v1 rigor+evidence, GM v2 evidence+originality, CoR none.
- The "Lowest dimensions" prose and "No aggregate score." render raw (REQ-IDE-30 holds trivially).

### 2.4 Response ledger → `responseLedgerSidecarSchema`

| Source | Field | Rule |
|---|---|---|
| Source cell | `findingOrdinal` | `Letter/L Major n`/`MI n` → that major. `Minor` → positional (4 ledgers) or override (GM v2). `SR <label>`/`2nd read Obj n` → the reconciled major or the second-read finding. `Open q(uestion) n`/`OQ` → the roadmap finding. Unrepresentable sources: `CL Cn`, `DR §`, `AN`, `CN`, `self`, `S`, legal/policy report, reception, scorecard. Only **135/300 rows (45%)** resolve to a letter-derived finding. |
| Disposition cell | `disposition.kind` | First keyword: `accept\|adapt\|rebut\|defer\|escalate`. `decline→rebut` (POV F-d5). `constraint→accept` (SPD F23). `duplicates…`, `mooted by`, `covered by` → `accept`. Skip `mapping only`/`(causes…)`. Mixed cells go to the override file. |
| Status cell | `disposition.status` | `done`, `verified`, `deferred`, `escalated` (also `awaiting…`, `escalated (resolved…)`), `honored`. `partial`/`pending`/`unresolved` → `open`. `resolved…`/`rebutted` → `done`. `mooted` → `mooted`. |
| Disposition text | `rationale` | The verbatim cell for `rebut`/`escalate`. Full text such as F-m5's evidence slug stays in the raw table. |
| Moves `Discharges` | `moveOrdinal` | First move whose Discharges lists the row ID (41 moves carry it: SPD, GM v1, GM v2). POV's 13 moves and CoR's prose plan carry none. |
| Evidence column / "Discharge evidence" list | `anchor` | The quoted spans anchored into v(N+1) (§3). |
| Revision-plan table | `moves[]` | `{ordinal: Mn, title, type, status}`. Discharges/moots are not emitted as ordinals, because they reference row IDs, not finding ordinals. |

- **One entry per finding.** GM v1 has 23 rows against 7 majors (F16a–h). The rule takes the first-listed row as the entry, and all rows render in the raw table. After dedup: 20/18/16/18/19 entries.

### 2.5 Structure plan → `structurePlanSidecarSchema`

- `spine` = the numbered items under "## The spine", with the trailing `*(§)*` stripped.
- `sections[]` = the "## Section map" rows: `ref` = the § cell (`—` → `S<i>`), `title` with bold stripped, `targetWords` from Budget, `purpose` = Function.
- No anchors (this is a forward plan, per DEF.1).
- The Entry→exit, Material, Promise/payoff, Apparatus and Cut-list content renders raw.

## 3. Anchors

**Method.**

- Blocks come from `splitMarkdownBlocks` (blank-line split, `b1…`). Offsets are block-relative, so the render ladder's rung 1 (`text.slice(start,end) === quote`) holds for exact and normalized hits.
- Candidate fragments are quoted spans (`"…"`/`“…”`), split on `…`, `...` and editorial insertions `[welfare nationalism]`, keeping pieces of ≥3 words.
- The ladder: **exact** (unique) → **exact-multi** → **normalized** (all quote marks unified, dashes, `*_\``, footnote markers `[^8]`/`[12]` dropped, whitespace collapsed; mapped back to raw offsets) → **fuzzy** (best-block word coverage ≥ 0.6).
- GM's `(l.N)` line hints are tried first on the hinted block and used as a last resort (`line`).
- Blocks after a References/Notes heading are excluded, because they repeat quoted text.

| Claims (quote → reviewed draft) | exact | normalized | fuzzy | line-hint | none |
|---|---|---|---|---|---|
| POV v1 (56) | 45 | 0 | 10 | 0 | 1 |
| SPD v1 (27) | 24 | 1 | 1 | 0 | 1 |
| CoR v2 (37) | 35 | 1 | 1 | 0 | 0 |
| GM v1 (79) | 57 | 0 | 20 | 1 | 1 |
| GM v2 (68) | 47 | 0 | 19 | 2 | 0 |
| **Total 267** | **208 (77.9%)** | 2 | 51 (19.1%) | 3 | 3 (1.1%) |

- **Fuzzy precision.** For 50 of the 51 fuzzy hits, the chosen block contains a 5-word shingle of the claim text.
- **Line-hint agreement (GM).** Against the `l.N` hints, v1 agrees 14 exact + 2 fuzzy + 1 line, with 1 fuzzy disagreement (an epigraph). v2 agrees 44 exact + 19 fuzzy + 2 line, with 3 exact disagreements; these are claims that recur at two lines (III16 is l.84 *and* l.152).
- **Why fuzzy happens.** Fuzzy is mostly ledger paraphrase or compression ("GAO: seven federal LE agencies…; ~60,000 searches"). A minority is inline citation clutter.
- **The 3 misses.** Two are non-quotes: SPD C24 ("All ten reference URLs") and POV C46. The third is GM v1 C9 (`Ref [2]: …`), a reference-list claim that the References exclusion hides. Reference claims (`Ref [n]`) should anchor into the References blocks instead.

**Letter majors (`Where`, 32):** 27 exact, 1 line-hint, 4 none.

- All 4 misses are section-only locators (`§VIII, which answers…`; `§IV (facets), §VI (…)`; `The seam at §V`), plus CoR major 2, whose only quote ("organized corrigibility") is 2 words.
- Proposed fallback: resolve the first `§<roman>` to that section's heading block.

**All 174 findings:** 106 anchored, 53 `null` (whole piece), 15 with no anchor text by design. Many minors, strengths and line notes carry no verbatim draft text.

**Response evidence → v(N+1):**

| Round | exact | fuzzy | none | no evidence |
|---|---|---|---|---|
| POV | 9 | — | — | 37 (group rows like "F-m rows" are not split) |
| SPD | 19 | 7 | 14 | 2 |
| CoR | 16 | 6 | 4 | 16 |
| GM v1 | 59 | — | 5 | 14 |
| GM v2 | 44 | 3 | 29 | — |

**Proposed confidence values (constants, golden-tested):**

| Rung | Confidence |
|---|---|
| exact unique | 1.0 |
| exact non-unique (first occurrence; hint-block occurrence when hinted) | 0.85 |
| normalized | 0.9 (equal to `resolveAnchor`'s rung-2 value) |
| fuzzy | `min(0.8, 0.8·coverage)`, with quote = the block's first ≤200 chars and offsets `[0, len]` |
| fuzzy that agrees with a line hint | 0.75 floor |
| line-hint only | 0.5 |
| section-heading fallback | 0.4 |
| none | finding `anchor: null`; claim/entry anchor omitted. `unanchored: true` is never needed |

## 4. Diffs and revision tracing (`diffMarkdown`, `traceRevisionMoves`)

| Round | Blocks before→after | Unchanged | Hunks (edited/mixed/added/removed) | Entries with move | Hunks linked to a move | Reachable by any evidence anchor |
|---|---|---|---|---|---|---|
| **POV v1→v2** | 144→144 | 83 | **30** (7/17/4/2) | 0 | **0** | 6 |
| SPD v1→v2 | 298→219 | 103 | 34 (14/18/2/0) | 35 rows | 13 (8 moves) | 22 |
| CoR v2→v3 | 284→259 | 95 | 42 (6/32/4/0) | 0 | 0 | 17 |
| GM v1→v2 | 158→156 | 64 | 38 (12/24/1/1) | 68 rows | 14 (11 moves) | 28 |
| GM v2→v3 | 156→174 | 86 | 36 (12/24/0/0) | 68 rows | 9 (8 moves) | 28 |

- **`traceRevisionMoves` needs `moveOrdinal` and an anchor on each entry.**
  - The **hero essay (POV) cannot link a single hunk mechanically.** Its moves table (`M1 structure: §XIV↔§XV swap…`) has no `Discharges` column. Its "Discharge evidence" list is keyed by finding group (`F1`, `F4/F-q2/F-q5`, `F-m rows`), not by move.
  - CoR's plan is a prose sentence. "Mixed" hunks dominate (17/30 in POV), so linkage is coarse even where it exists.
- **Options for POV.**
  - (a) A hand-authored `moves.json` override in the corpus, mapping POV and CoR rows to moves. The move notes name sections (`M5 §XI rebuild` ↔ F4/F-q2/F-q5), which makes it about 30 small judgements.
  - (b) Accept "Unlinked" for POV and CoR and tour the linkage on GM.
  - See Q3.

## 5. Converter spec

- **Package.** `packages/demo-corpus` (from R1), containing `src/convert/*.ts`. These are pure functions `(markdown: string, ctx) → {sidecar, labels, diagnostics}`. No I/O inside; the build script owns I/O.
- **Run order.** Post-sanitizer, on `corpus/<slug>/` (REQ-DEMO-CORPUS-*). Anchors are computed on the sanitized drafts, so the SPD image-path rewrite must run first.

| Module | Input | Output |
|---|---|---|
| `md/sections.ts` | any | `h2`/`h3` sections, H3 body stops at any H1/H2; bold-bullet reader with continuation lines; table reader (escaped `\|`); list reader (`- `/`1. `); boldLead |
| `md/quotes.ts` | text | fragments (quoted spans; split on ellipses/editorial brackets; ≥3 words, ≥2 if inside quotes) |
| `anchor.ts` | fragment, blocks, hints | §3 ladder → `Anchor` with confidence; uses `splitMarkdownBlocks` from `@rhema/findings-core` (single splitter, REQ-OBJ-16) |
| `claim-ledger.ts` | `01-claim-ledger.md`, draft, source-note index | `claimLedgerSidecar` + `labels` + summary-count check |
| `letter.ts` | `editors-letter.md` | typed letter (verdict, one-thing, strengths, majors, minors, line notes, roadmap OQs, considered, scorecard) |
| `second-read.ts` | `05-second-read.md` | objections/strengths/verdict |
| `reconcile.ts` | letter, second read, overrides | origin/reconciliation per objection + diagnostics (heuristic vs override disagreement → warning) |
| `findings.ts`, `rubric.ts` | typed letter, reconciliation, draft | `findingsSidecar`, `rubricSidecar` |
| `response-ledger.ts` | ledger md, findings, v(N+1), overrides | `responseLedgerSidecar` (+ `rows.json` of every row incl. unrepresentable, for the raw/table view) |
| `structure-plan.ts` | `02-structure-plan.md` | `structurePlanSidecar` |
| `draft-ledger.ts` | `04-draft-ledger.md` | rows with ordinal = row index (does **not** call `parseDraftLedgerSections`, R4) |
| `source-note.ts` | `sources/*.md` | `{slug, title, url?, accessed?}` index only (body raw) |
| `overrides.ts` | `corpus/<slug>/convert-overrides.json` | typed overrides: verdict re-scores, reconciliation, minor-row→finding map, mixed dispositions, move map |
| `index.ts` | project dir | all sidecars, each passed through `parseSidecar` — any `failed` aborts the build |

- **Tests: goldens per project.** For each `corpus/<slug>/`, the expected `.rhema/*.json` are committed and the test asserts byte-equality on canonical JSON. Additional assertions:
  - (i) every sidecar `parseSidecar(...).parseStatus === "ok"`;
  - (ii) ledger summary counts equal parsed verdict counts (POV, SPD, CoR, GM v1);
  - (iii) heading parse rate is 100% with a zero-unmapped verdict list;
  - (iv) anchor-rung histograms are pinned (a regression signal when the sanitizer or drafts change);
  - (v) every override row is consumed (a stale override fails);
  - (vi) the negative controls in this note's header.
- **Determinism.** No clock, no randomness, sorted keys, stable ordinals.

## 6. Must render raw (never structured, never paraphrased)

- **Review dossier prose:**
  - `00-piece-brief.md`, `02-discourse-report*.md`, `03-argument-notes.md`, `04-craft-notes.md`.
  - The letter's header bullets, "The piece's project", "Fact-check summary", "The discursive situation", "Reception forecast", "Lowest dimensions…" and the roadmap steps 1–4 (via the existing `parseLetterSections` paragraphs; `SLOT_PATTERNS` already matches Verdict, Strengths, Major issues, Revision roadmap and Considered and rejected in all five letters).
  - The second read's thesis, strengths, verdict, "Smaller notes", "Factual and quotational claims that struck me as suspicious" and the sentence-habits section.
- **Claim-ledger material:** the `## Summary` blocks, access notes, `## Reuse confirmations`, `## References checked`, CoR `### Skipped`, and the GM v2 `-A`/`-B` files.
- **Response material:**
  - The response letters `correspondence/*-response.md` (letter prose; no sidecar exists) and `v1-drafting-note.md`.
  - The response ledgers' Invariants, Gap-analysis log, "Phase 1 results…", New claims, and the full Findings table, including the 165 rows that have no finding ordinal.
  - GM v1's stale prose triage.
- **Drafting dossier:** `00/01/05/06` drafting files, the structure plan's non-tabular sections, GM's `draft-part*`/`ledger-slice*`, and the drafter `03-claim-ledger.md` (POV's has no linked URLs, so a `03-claim-ledger.json` would carry citations as prose only; offer it as structured for GM's table form at most).
- **Source notes:** all 870 bodies (structured fields extracted only for listing). POV's 52 free-form editor notes are raw, full stop.

## 7. Risks

- **R1 — Severity and kind are converter inventions.** The corpus never states severity (REQ-SPEC-4 says "emitted explicitly, never inferred"). The demo must label them "assigned by import rule" or the projection misrepresents the editor.
- **R2 — Stance and `accessedAt` are declared approximations.** One stance per claim and one session date per ledger. The cited⇒fetched chip has no fetch log behind it; the projector must say "not recorded", not "not fetched" (R3/R5 overlap).
- **R3 — POV traceability.** The hero tour step 8 ("each hunk traced to the finding it answers") is false for POV without a hand-authored move map (§4).
- **R4 — `parseDraftLedgerSections` drops real rows.** It skips non-integer `#` cells, so it reads 1/18 POV and 1/17 GM rows (only `#` = 0). Upstream real ledgers use Roman numerals. The demo should not call it; the bug should be logged as a DEFERRALS row for P1.10 consumers rather than fixed in R7.
- **R5 — Brief §2 claim correction (REQ-POS-3).**
  - Heading verdicts show **no Contradicted claim** in POV, SPD, CoR or GM v1.
  - GM v2 has 3 Tier-1 Contradicted (III16, VII3-scope, XII2) and 1 Tier-1 Misleading (XIII2).
  - SPD has 2 Tier-1 Misleading (C23a, C23d); GM v1 has 1 Tier-1 Misleading (C15, by summary override only).
  - So the contradicted-Tier-1 exemplar exists only in GM v2, not in the hero essay.
- **R6 — Sanitizer coupling.** Letters contain `sjs-substack` and `agent-scratch/…` paths. `utm_source=chatgpt` occurs 166× in 10 files (outlines, manifests, drafting, one `correspondence` file each in POV and GM); `r.jina.ai` occurs in 62 files (56 of them GM source notes). URLs must be sanitized before `normalizeUrl`, or `sources[]` and the denylist disagree.
- **R7 — Fixture drift.** `packages/protocols/fixtures/*` are illustrative twins: paraphrased texts, root-domain URLs, invented `p-intro-2` block ids, an invented `blocking`. Reuse their decisions (ordinal-by-ID-number, check date as `accessedAt`, Skipped→unverifiable) but not their content. Do not overwrite them; the demo goldens live in `demo-corpus`.
- **R8 — 4096-char finding bodies.** Truncation is lossy for 2 majors; the raw letter is the full record.

## Requirements emitted

- **REQ-DEMO-CONV-1.** The converter is a set of pure, deterministic functions in `packages/demo-corpus/src/convert/`. It runs on the sanitized corpus only, and its output is byte-stable for byte-stable input.
- **REQ-DEMO-CONV-2.** Every emitted sidecar passes `parseSidecar` (incl. `parseClaimLedger`'s REQ-OBJ-18 check). Any `failed` result aborts the demo build, and there is no partial output.
- **REQ-DEMO-CONV-3.** Claim-ledger headings parse at 100% using the §1 grammar. Verdicts are canonicalized by an explicit table, with qualifiers preserved in `note`, and an unmapped verdict fails the build.
- **REQ-DEMO-CONV-4.** Claim `ordinal` is 0-based ledger order. Source IDs (`C23a`, `III16`, `VII3-scope`) are kept in a side-table, and the projector displays the source ID.
- **REQ-DEMO-CONV-5.** `sources[]` take stance = `verdictDeterminingStance(verdict)` (`contextualizes` when null), `normalizedUrl` = `@rhema/contracts` `normalizeUrl`, and `accessedAt` = the ledger's check date. `url` = `sources[0]`. `kind` and `sourceCheck` are omitted.
- **REQ-DEMO-CONV-6.** Summary-level verdict re-scores (GM v1 C15) and every other non-derivable mapping live in a committed per-project `convert-overrides.json`. Each override cites its source line. Unused overrides fail the build.
- **REQ-DEMO-CONV-7.** Findings come from the letter (one-thing, majors, strengths, minors, line notes, considered-and-rejected, roadmap open questions) and from the second read (objections), using §2.2's declared severity/kind/origin rules. `suggestion` is never emitted.
- **REQ-DEMO-CONV-8.** Second-read reconciliation comes from the override file. The overlap heuristic runs as a lint: a disagreement between heuristic and override is a build warning listed in diagnostics.
- **REQ-DEMO-CONV-9.** Rubric rows use the explicit eight-name map. A cap is emitted only where the Basis states a cap, and no aggregate is computed or rendered.
- **REQ-DEMO-CONV-10.** Response-ledger entries exist only for rows that resolve to a findings ordinal, with one entry per finding (first-listed row). All rows, including unrepresentable ones, are emitted to `rows.json` and render in the raw ledger view.
- **REQ-DEMO-CONV-11.** Anchors use `splitMarkdownBlocks` on the sanitized draft, with block-relative offsets and the §3 ladder and confidence constants. An unresolved finding gets `anchor: null`; an unresolved claim or entry omits `anchor`. Rung histograms are golden-pinned.
- **REQ-DEMO-CONV-12.** Per-project goldens assert canonical-JSON equality, the summary-count reconciliation (POV, SPD, CoR, GM v1), and the zero-unmapped lists.
- **REQ-DEMO-CONV-13.** Every artifact in §6 renders as raw markdown. The converter never paraphrases or summarizes corpus text; titles and bodies are verbatim substrings, apart from declared truncation with "…".
- **REQ-DEMO-CONV-14.** The demo labels converter-assigned fields (severity, kind, origin reconciliation, stance, `accessedAt`) as import-rule assignments wherever they are displayed.
- **REQ-DEMO-CONV-15.** What-changed views are computed with `diffMarkdown`/`traceRevisionMoves` at build time. A round without move linkage shows its hunks as Unlinked, never as fabricated links.

## Open questions for operator

1. **One-thing severity.** Should the one-thing finding be `blocking` or `major`? The corpus never uses "blocking", and the existing fixture invented it. **Recommend `major` + `letterSection: one_thing`, with no `blocking` anywhere in the demo.**
2. **Strengths as findings.** Rhēma's `strength` slot expects findings rows, but a strength carries no defect. Emit them (severity `note`, kind `craft`) or render them raw only? **Recommend emitting them.** The dossier's letter-section refs and the tour's "protect these" beat need them.
3. **POV move linkage (hero tour step 8).** Should POV and CoR get a hand-authored F-row→move map (≈30 judgements, committed, labelled "mapped at import")? **Recommend yes for POV only.** Leave CoR Unlinked, and let the tour's tracing beat cite GM for mechanically sourced links if you want zero hand mapping.
4. **Unrepresentable response rows.** 165/300 rows answer dossier sources (ledger, discourse, argument and craft notes, self) that have no finding. Should they get synthesized findings? **Recommend no.** Show them in the raw ledger table. Synthesizing findings from the author's summaries would put author words in the editor's mouth.
