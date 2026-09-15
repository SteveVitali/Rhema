# Run ledger — PRB.04 (`findings-core` and the dossier reading surfaces)

- **Spec:** docs/tickets/20_PRB.04__findings-core-and-dossier.md (§5.7, §5.5, §6.6, §10.2 REQ-MOBILE-4, §12.5, §12.6; REQ-IDE-11/12/14/15/23/25/26/30/31, REQ-PROD-2, REQ-OBJ-6/18/19, REQ-SPEC-4)
- **Base:** a21c4d69e6cdc573836517d41c7a635f1670c90d (stevevitali/prb-03-estimator-and-run-sheet)
- **Branch:** stevevitali/prb-04-findings-core-and-dossier
- **Config:** implement-spec full (all rigor phases on); autonomous=true; committed build-memory mode; mergePolicy=OPERATOR (stacked, do not merge)

## Deferrals read
Read DEFERRALS.md in full. No OPEN row is unblocked BY PRB.04: it is a reading-surfaces-only UI ticket with
no live/deploy legs. The obligation-chip deliverable consumes P0.12's read APIs (`@rhema/obligations`
`ObligationCounts`), whose live call-site (D-P0.12-1) is already DONE and whose auto-routing (D-P0.12-2) is
PRB.06's. All remaining OPEN rows need H0 / the live worker / H2 / H3 / PRB.06. New live-data rows are opened
for the beta dossier surface's live binding (a delivered-dossier read endpoint) + the H3 content sign-off is
already tracked (D-PRB.01-2).

## Requirements (from spec)
- REQ-MOBILE-4 / §10.2: `findings-core` holds the framework-free logic web + 1.x mobile share verbatim —
  disposition state machine, anchor mapping, ledger summaries, deadline math. NO React in the package.
- REQ-IDE-11 (§5.5): run cards render orchestrator-emitted phase state/counters/elapsed/credits-vs-cap/ETA;
  no progress element derives from agent-authored text.
- REQ-IDE-12: opt-out phases render greyed "off".
- REQ-IDE-14: live feed in Summary/Details densities (Verbose behind Advanced); no event carries prompt/
  reasoning/private memory.
- REQ-IDE-15 (amended): findings stream as provisional (no disposition controls), finalize at delivery; a
  pre-triaged-then-reconciliation-rejected finding surfaces as a conflict row (not silently dropped).
- REQ-IDE-23: findings render on the frozen version; unanchored listed under "Whole piece", never dropped
  (beta = list-first, no Margin decorations — those are P1.7).
- REQ-IDE-25 / REQ-OBJ-18: claim URLs carry a fetched-✓ chip iff in the proxy fetch log; multi-source stance
  edges (supports/contradicts/contextualizes).
- REQ-IDE-26: second-read reconciliation states — corroborated ✓✓ / kept / rejected-collapsed-with-reason
  (promotable → user-origin row).
- REQ-IDE-30: rubric = per-dimension 1–5 dot rows, caps with reasons inline, NEVER an aggregate.
- REQ-IDE-31 / REQ-PROD-2 / §12.6: Editor's letter renders in Read mode with a sticky mini-TOC + passage
  links resolving to findings; the attestation section is the runtime trust chip whose text derives ONLY from
  `access_report` fields (hydration manifest + proxy log).
- REQ-OBJ-6: obligation-state chips on blocking/major finding cards + the version header (`⚑ 3 open · 2 addressed`).
- REQ-OBJ-19 / §12.8(c): `claim.kind` rendering ("interpretive — not a matter of verification").
- REQ-SPEC-4: severity vocabulary blocking/major/minor/note rendered as emitted (explicit).

## Acceptance criteria
- AC1: `findings-core` unit suite — anchor ladder (exact/normalized/fuzzy/unanchored fixtures), disposition
  rules (rationale required for rebut/escalate only), freeze behavior — no React imports (lint). *(deterministic)*
- AC2: run card renders only orchestrator-emitted state/counters (agent-authored progress text fixture → none
  of it renders — REQ-IDE-11). *(deterministic)*
- AC3: provisional cards expose no disposition controls; conflict row renders on the pre-triage-then-rejected
  fixture (REQ-IDE-15). *(deterministic)*
- AC4: every claim URL shows a fetched-✓ chip iff present in the proxy fetch log; two-source stance fixture
  renders both edges (REQ-IDE-25; REQ-OBJ-18). *(deterministic)*
- AC5: rubric renders as dot rows with cap reasons; no aggregate anywhere in DOM (REQ-IDE-30). *(deterministic)*
- AC6: trust chip text derives from `access_report` fields only (REQ-PROD-2). *(deterministic)*
- AC7: unanchored findings listed under "Whole piece", never dropped (REQ-IDE-23). *(deterministic)*

## Plan
Packages:
1. **packages/findings-core** (fill the P0.01 skeleton; framework-free; deps @rhema/contracts only):
   - `anchor.ts` — the anchoring ladder: `resolveAnchor(anchor, blocks)` exact → normalized → fuzzy(confidence)
     → unanchored ("Whole piece"); a `PassageResolution` result carrying method + confidence.
   - `disposition.ts` — the five-verb state machine: `dispositionRules` (rationale required for rebut/escalate
     only; defer default text; accept/adapt/apply need none), `validateDisposition`, `applyDisposition`, freeze
     semantics (`freezeLedger` → cards lock; a frozen row is immutable), `canDispose(finding)` false when
     provisional.
   - `find-view.ts` — `buildFindingView(finding, disposition?, {provisional})` from row shapes; grouping
     `groupFindingsForList` → sections incl. "Whole piece" for `anchor===null`; never drops.
   - `ledger.ts` — `summarizeLedger` (verb counts) + `summarizeClaims` (by verdict/tier) + `summarizeReconciliation`.
   - `deadline.ts` — gate deadline math (remaining ms, expired, humanized band) — pure, clock injected.
   - `trust-chip.ts` — `buildTrustChip(accessReport)` → the REQ-PROD-2 string DERIVED ONLY from access_report
     fields (mount facts, fetches, denied, subagent scoping); an `AccessReportFacts` input type mirroring
     `@rhema/mirror` `AccessReport` (contracts-level, no mirror dep).
   - `run-card.ts` — `buildRunCardView(orchestratorState)` from ONLY the §12.5 orchestrator event payloads
     (phase list ✓/◐/○, counters, credits/cap, ETA band); rejects/ignores any agent-authored text field.
   - `reconciliation.ts` — conflict detection: a pre-triaged (user disposition present) finding later marked
     `reconciliation:'rejected'` → a conflict row (REQ-IDE-15).
2. **@rhema/ui** — read-only presentational components (text-agnostic, copy as props; render findings-core view
   models): `RunCard` + `LiveFeed`, `LetterView`, `ClaimsTable`, `SecondReadView`, `RubricView`, `TrustChip`,
   `ObligationChip`, `FindingCard`/`FindingsList`, `VersionHeader`. DOM-tested with renderToStaticMarkup.
3. **apps/web** — a beta dossier reading page assembling the surfaces via findings-core builders, wired through
   a `DataSource.getDossier` seam (production binding deferred to the live delivered-dossier read — new DEFERRAL
   like import); COPY additions; route + page-data + render tests. A representative fixture drives the render
   (the live delivered-dossier data is the deferred leg).
4. **eslint.config.js** — a `no-restricted-imports` override banning `react`/`react-dom` in
   `packages/findings-core/**` (the AC1 "no React (lint)"). Belt-and-suspenders self-test in the package.

Order: findings-core (logic + tests) → eslint no-react override → @rhema/ui components (+ tests) → web wiring
(+ tests) → gap analysis → close → verify.

## Test matrix
- AC1 → findings-core `anchor.test.ts` (exact/normalized/fuzzy-with-confidence/unanchored fixtures),
  `disposition.test.ts` (rationale required for rebut/escalate ONLY; accept/adapt/apply/defer none; freeze →
  immutable; provisional → cannot dispose), and `no-react.test.ts` (source scan asserts no react import); the
  eslint override is the lint enforcement.
- AC2 → ui `dossier-surfaces.test.tsx` RunCard: a fixture whose payload includes an agent-authored `note`/
  `progressText` field renders NONE of that text; only orchestrator counters/state render; opt-out phase greyed
  "off".
- AC3 → ui test: a provisional FindingCard has NO disposition-verb controls (no A/D/R/F/E buttons); the
  pre-triage-then-rejected fixture renders a conflict row with both the user's disposition and the withdrawal.
- AC4 → ui ClaimsTable test: URL in the fetch log → fetched-✓ chip present; URL absent → no chip; the
  two-source (supports + contradicts) fixture renders both stance edges.
- AC5 → ui RubricView test: eight dot rows, cap reason inline, and NO aggregate/total anywhere in the DOM
  (assert no "/40", no "total", no summed number).
- AC6 → findings-core `trust-chip.test.ts`: `buildTrustChip` output is a pure function of the access_report
  fields (change a field → the string changes; a field not in access_report cannot appear); ui `TrustChip`
  renders only that derived string.
- AC7 → findings-core `find-view.test.ts` + ui FindingsList test: an unanchored finding (anchor null) is
  grouped under "Whole piece" and present in the output; a mixed fixture drops nothing (count in == count out).

## Progress
- Phase 0-1: spec + ledger + deferrals loaded; branch cut; baseline `turbo build lint typecheck` 108/108 +
  `pnpm test` 1458 pass/2 skip green.
- Phase 2: `packages/findings-core` filled (anchor ladder, disposition machine, find-view + grouping,
  reconciliation, rubric, ledger/claim summaries, run-card + event derivation, feed density, deadline math,
  trust chip) + 66 unit tests; eslint `no-restricted-imports` no-react override + self-test. `@rhema/ui` reading
  surfaces (chips/run-card/findings/claims/rubric/second-read/letter) + 17 DOM tests. apps/web dossier page +
  `/p/:project/review/:runId` route + `getDossier` data seam (prod binding deferred) + COPY.review + 10 route
  tests. Tests alongside each; all package suites green.

## Gap table
Re-read the spec (§5.5/§5.7/§6.6/§10.2/§12.5/§12.6) fresh; every requirement + AC diffed against the code.

| item (spec §) | status | evidence |
|---|---|---|
| AC1 anchor ladder (exact/normalized/fuzzy/unanchored) + disposition rules (rationale rebut/escalate only) + freeze — no React (lint) | met | `packages/findings-core/src/anchor.ts` `resolveAnchor` (+ `anchor.test.ts` 8); `disposition.ts` `validateDisposition`/`freezeDisposition`/`canDispose` (+ `disposition.test.ts` 11); eslint `no-restricted-imports` override (`eslint.config.js`, smoke-verified it errors on a react import) + `no-react.test.ts` |
| AC2 run card renders orchestrator state/counters only; agent-authored progress text renders none | met | `run-card.ts` `deriveRunCardInput` (whitelist `CARD_EVENT_TYPES`; ignores `agent.note`/`finding.emitted`/`artifact.written`) + `run-card.test.ts` (AGENT_PROSE absent from input JSON) + ui `RunCard` DOM test + web `server.test.ts` ("no agent prose", "412 / 1,860 cr", off phase) |
| AC3 provisional cards no disposition controls; conflict row on pre-triage-then-rejected | met | `disposition.ts` `canDispose` (false while provisional/frozen); `findings.tsx` `FindingCard` renders `controls` ONLY when `canDispose`; `reconciliation.ts` `detectReconciliationConflicts`; ui test (provisional → no `data-disposition-controls`/`data-verb`; delivered → would host) + `ConflictRow` render; web route test |
| AC4 fetched-✓ chip iff URL in proxy log; two-source stances render both edges | met | `ledger.ts` `claimUrlViews` (fetched = normalizedUrl ∈ log) + `ledger.test.ts`; ui `ClaimsTable`/`UrlChip` (FetchedUrlChip iff fetched) + DOM test (one fetched chip; both `data-stance`); web route test |
| AC5 rubric dot rows + cap reasons; no aggregate in DOM | met | `rubric.ts` `buildRubricView` (no total field) + `rubric.test.ts` (no total/aggregate/sum keys); ui `RubricView` DOM test (8 `data-rubric-row`, cap inline, no `/40`/total) + web route test |
| AC6 trust chip text derives from access_report only | met | `trust-chip.ts` `trustChipFacts`/`buildTrustChip` (dynamic content = pure projection of the report; static vocab in via labels) + `trust-chip.test.ts` (field-tracking; injected `note` ignored); ui `TrustChip` + web route test |
| AC7 unanchored findings under "Whole piece", never dropped | met | `find-view.ts` `groupFindingsForList` (Whole piece heads the list; `countGrouped` == input) + `find-view.test.ts`; ui `FindingsList` DOM test; web route test |
| REQ-IDE-12 opt-out phases greyed "off" | met | `deriveRunCardInput` `offPhases` → status "off"; `RunCard` renders `data-phase-status="off"` + off label; tests |
| REQ-IDE-14 feed Summary/Details/Verbose; internal never | met | `feed.ts` `filterFeed`/`feedIncludes` (+ `feed.test.ts`); ui `LiveFeed` DOM test (Details vs Verbose; internal dropped) |
| REQ-IDE-26 second-read states (corroborated/kept/rejected-collapsed, promotable) | met | `reconciliation.ts` `reconciliationStateOf`/`summarizeReconciliation`/`collapsedRejected`; ui `SecondReadView` (✓✓ + promotable) + tests |
| REQ-IDE-31 / REQ-PROD-2 letter read-mode + mini-TOC + passage links + trust chip as attestation | met | `letter.tsx` `LetterView` (sticky TOC, `data-passage-link`, attestation section = `TrustChip`) + DOM test; web route test |
| REQ-OBJ-6 obligation chips on finding cards + version header | met (component + version header) / per-finding join deferred | `chips.tsx` `ObligationChip` (finding-card slot, tested) + `VersionObligationChip` (`⚑ N open · M addressed`, web-wired + tested); per-finding obligation-state join → D-PRB.04-2 |
| REQ-OBJ-18 multi-source stance edges | met | `claimUrlViews` emits every `sources[]` edge; `ClaimsTable` renders `data-stance`; tests |
| REQ-OBJ-19 `claim.kind` "not a matter of verification" | met | `ClaimsTable` `notCheckable` (from `CHECKABLE_CLAIM_KINDS`); web COPY `notCheckableFmt`; tests |
| REQ-SPEC-4 severity emitted explicitly (blocking/major/minor/note) | met | `FindingCard` renders `view.severity` from the row (never inferred); severity order in `find-view.ts` |
| REQ-MOBILE-4 findings-core framework-free (no React) | met | eslint override + `no-react.test.ts`; package.json declares no react dep |
| §5.7 ledger summaries; §6.4 gate deadline math | met | `ledger.ts` `summarizeLedger`/`summarizeClaims`; `deadline.ts` `gateDeadlineState`/`remainingParts` (+ `deadline.test.ts`) |
| Bazel invariants (composite project + refs; no cross-pkg relative; `.js` ext; `@rhema/*` boundaries) | met | findings-core in root `tsconfig.json` refs (P0.01); ui/web tsconfig + package.json add findings-core (+ contracts to ui); grep: no `../../` cross-package imports in new files; all intra-package imports carry `.js` |
| GATE G2: no efficacy/marketing claims; no public pricing/signup | met | reading surfaces only; COPY.review has no efficacy claim + no price; dossier route is auth-gated; copy vocab-lint green |
| Out of scope: dispositions UI/verbs + gate cards (PRB.05) | not implemented (correct) | `FindingCard` renders NO verb buttons; the `controls` slot is unused by PRB.04; no gate cards |
| Out of scope: what-changed/diffs (PRB.06) | not implemented (correct) | no diff/move-join surface |
| Out of scope: Margin decorations / triage / Apply / clustering (P1.7) | not implemented (correct) | list-first only; no Margin/underline decorations; no triage mode; no Apply button; no clustering |
| Out of scope: walkthrough / run report (P1.5) | not implemented (correct) | run card ≠ run report; no walkthrough |

## Adversarial / self-review (Phase 3/4) — findings + closure
Two-pass self-review (mechanical + Staff-Engineer re-read of every changed file against the spec). Surfaced +
closed:
1. **Live feed component had no DOM test** (deliverable 2 "run card + live feed"). CLOSED: added `LiveFeed`
   Details/Verbose DOM tests (internal events never render; verbose adds the verbose rows).
2. **`data-fetched` collision** between the claims wrapper span and the `FetchedUrlChip` primitive made the
   "exactly one fetched chip" assertion count 2. CLOSED: renamed the wrapper attribute to `data-url-in-log`.
Observations accepted (documented): the beta is list-first (no Margin decorations — P1.7); the anchor ladder's
normalized/fuzzy rungs return a resolution + confidence but do not re-map to raw offsets (offset re-mapping
serves Margin decorations — P1.7); the live delivered-dossier read + the browser SSE subscription + the
per-finding obligation-state join are live legs (D-PRB.04-1/-2).

## Evidence log
- `pnpm turbo build lint typecheck` → 108/108 tasks green.
- `pnpm test` → 1549 passed / 2 skipped (baseline 1458 → +91: findings-core 66 + ui dossier-surfaces 17 + web dossier route 8).
- findings-core suite: 11 files / 66 tests green (`vitest run packages/findings-core`).
- ui dossier surfaces: 17 tests green (`vitest run packages/ui/src/dossier-surfaces.test.tsx`).
- web: 40 tests green incl. the 10 dossier-route tests + copy vocab-lint (`lintCopy` → only sanctioned "Advanced" x1).
- no-react lint: `eslint` errors on a react import inside findings-core (smoke-verified) + the source-scan self-test.
- `pnpm check:protocol-markers` → OK (39 files, no markers). `pnpm check:licenses` → **pre-existing** failure
  on `duck` (BSD) / `pako` (MIT AND Zlib), both in the base HEAD lockfile; PRB.04's lockfile diff adds ONLY
  workspace links (zero third-party deps), so this ticket does not touch what the licence gate covers.
- `check-build-memory.sh .` → 0 violations.

## Evidence report
See `docs/build/pr/PRB.04.md` (the submitted PR body carries the AC → evidence table).
