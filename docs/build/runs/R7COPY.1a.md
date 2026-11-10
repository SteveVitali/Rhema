# R7COPY.1a — run record (the ONE enum label table + the jargon guard)

- **Ticket:** `docs/tickets/244_R7COPY.1a__labels-jargon-guard.md` — REQ-COPY-1, REQ-COPY-6, REQ-GUARD-2, REQ-DACC-6.
- **Branch:** `stevevitali/r7copy-1a-labels` ← `stevevitali/r7kit-3e-dossier` @ `85ef318d`.
- **Scope:** Stage A only, `$0`, no preview (`GD-PREVIEW.R7`), unmerged (`mergePolicy: OPERATOR`). Harness: `devin-desktop/swe-2-high/subagent`.
- **Audit refs:** B6 (phases render raw keys), C12 (mixed label case), D2/D3 (artifact-kind + provider keys raw), G2/G6 (AI-use statement leaks keys), H3, A1/A10, UXC-30.

## Plan (written before implementation)

1. One exhaustive typed label table — `UI_LABELS` in `@rhema/contracts` (`labels.ts`), every domain `Record<EnumKey,string>` so a new enum value fails typecheck; new `PHASE_KEYS` + `SOURCE_PROVIDER_KEYS` structural enums.
2. Fold every enum-keyed COPY/feed/files/run-sheet/state-map/`240` map into `labelLookup(UI_LABELS.…)` rebinds — never a second authored map.
3. REQ-COPY-6 jargon pass on every COPY leaf (verbatim §4.13 list).
4. REQ-GUARD-2: `lintInternalTerms` + `validateInternalTermAllow` in `vocab-lint.ts`; `BANNED_INTERNAL_TERMS` in `reserved-strings.ts`; ESLint `no-banned-strings` `bannedPatterns` leg seeded from the same list; `expectNoInternalKeys` DOM guard in `testkit.ts`.
5. AI-use statement renders labels not keys (G6).
6. Local `public-ssr-baseline` BEFORE/AFTER + honest SPA entry figure. Records + stacked PR; never merge.

## What changed

### The ONE label table (REQ-COPY-1; B6/C12/D2/D3)

- `packages/contracts/src/enums.ts` — `PHASE_KEYS` (39 shipped-manifest phase keys + 6 retired step-vocab keys still in older fixtures/records) + `PhaseKey`; `SOURCE_PROVIDER_KEYS` (7 ingestion/provider kinds) + `SourceProviderKey`. Manifest→enum parity is tested in `@rhema/orchestrator` `phase-labels.test.ts` — a manifest phase key missing from the enum fails the suite.
- `packages/contracts/src/labels.ts` (new) — `UI_LABELS`: ~60 sub-tables, each `Record<EnumKey,string>` (or a closed union with documented legacy keys — `runState` gains `delivered`, `artifactKind` gains `private`, `gateKind` gains `scope_confirm`/`spend_cap`/`publish_ready`, `draftOrigin` gains `agent`/`seeded`). One case rule: sentence case ("Second read (independent)", "Substack export", "Fact-check"). Participial interpolation words (`decisionAction`, `decisionActor`, `dispositionPast`, `feedPassed`, `provenanceKind`, `promoteScope`, `refundReason`) stay lowercase — they are words inside a sentence, not standalone labels. `plan`/`modelTier`/`rigor`/`seat` re-export the canonical `vocab.ts` display maps rather than re-spelling them. `labelLookup(m)` widens a domain map for `table[key] ?? fallback` sites.
- `apps/web/src/copy.ts` — every enum-keyed map folds to `labelLookup(UI_LABELS.…)` (or the direct rebind where a consumer indexes by the closed union: `gateOnExpiry`, `modelTier`, `timelineOrigin`, `provenanceKind`, `paletteSection`): `phaseLabel`, `runStateLabel`, `verdictLabel`, `stanceLabel`, `kindNounLabel`, `dimensionLabel`, `severityLabel`, `findingKindLabel`, `dispositionPast`, `obligationStateLabel`, `densityLabel`, `verbLabel`, `reasonLabel`, `kindLabel`, `doNothingLine`, `factLabel`, `scopeFieldLabel`, `provenanceBadge`, `decisionActorLabel`, `decisionActionLabel`, `policyLabel`, `optionLabel`, `verifiedByLabel`, `hunkKindLabel`, `originLabel`, `restoreGroup`, `layouts`, `sectionLabel`, `lockTitle`, `lockBadge`, `tierLabel`, `modeOption`, `sourceKind`, `tabs`, `calibrationVerdict`, `providerLabel`, `stateBadge`, `qualityBadge`, `runStateLabel`, `sectionLabels`, `notificationEvents`, `integrationStatusLabels`, `supportAccessActions`, `stages`, `phaseDefaults`, `bucketLabels`, `workflowLabels`, `stateLabels`, `expiryBucketLabels`, `nextStep`, `workflowLabel`, `originChip`, `verbs`, `deliveredLinkLabel`, `gateKind`, `artifactKind`, `findingKind`, `passed`, `views`, `tiers`, `sectionLabels`, `scopeLabel`, `seatLabel`, `flagLabel`, `guidanceLabel`, `refundReasonLabel`, `resolutionLabels`, `approvalDisplay`.
- `apps/web/src/feed-labels.ts` — `enums` resolves straight from `UI_LABELS` (phase/verdict/severity/runState + the merged `gateKind ∪ artifactKind ∪ claimKind` kind map + `feedPassed` + `decisionAction`) — the feed's own `feed.gateKind`/`feed.artifactKind`/`feed.findingKind` maps are gone; the merged kind map now covers all 63 artifact kinds + 15 gate kinds (a `draft_ledger`/`sidecar`/`publish_ready` payload no longer renders raw).
- `apps/web/src/run-sheet-labels.ts` — `toggleLabels` folds to `UI_LABELS.runToggle`; `runLabelFor` keeps the three verb-specific "Run review/Run revise/Run fact-check" COPY leaves (verb phrases, not a parallel enum map — the SPA.20 test pins `data-run-label="Run review"`).
- `apps/web/src/state-map.ts` — no authored enum map inside; its status-dot legend continues to build from `COPY.projectHome` leaves.

### The jargon pass (REQ-COPY-6 — the spec §4.13 list verbatim)

- `QUIET` — already absent from COPY (ADR-128 retired the bucket; only lowercase "Quiet hours" — the notification feature name — remains, unbanned by the case-sensitive pattern).
- `obligations` → `open items` / `items` — `addObligationLabel`, `obligatedToast`, `openObligations`, `triageObligationsFmt`, `stripFmt`, `obligation.{heading,severityHint,createCta,required,failed}`, `export.lede`.
- body-copy `gate(s)` → `approvals` / `spend confirmations` — `approvalPolicies.named`, `lockedNote`, `quietNote`, `landing.faq`.
- `the coherence read` → dropped — `compare.unlinkedNote`.
- `public funnel` → `the sign-up flow` — `landing.changelog.body`.
- `sidecar` → `Structured notes` in the artifact-kind table (the raw key `sidecar` no longer renders).
- `partial (0/1 phases)` → `steer.partialFmt`: "Finished in part — {done} of {total} phases done; the work so far is kept".
- `Waiting on your call` → `waiting for you` — `inbox.badgeLine`, `decisions.empty`.
- `Have an invitation?` → `Already have an account?` — `landing.finalCta.signIn` (`codeToggle` "Have an invitation code?" is a different phrase, kept).
- `the shared session contract…` → plain wording — `settings.sessionsNote` ("the same sign-in works across devices").

### REQ-GUARD-2

- `packages/contracts/src/reserved-strings.ts` — `BANNED_INTERNAL_TERMS` (the §4.13 list verbatim: `{id, text, pattern, flags, replacement}` — `QUIET` is case-sensitive on purpose) + `InternalTermAllow` shape + `BANNED_INTERNAL_TERM_ALLOW` (empty — the expected case).
- `packages/contracts/src/vocab-lint.ts` — `lintInternalTerms(entries, {allow})` (regex-matches leaf VALUES — never keys) + `validateInternalTermAllow(allow, rawViolations)`: an entry must be `demo.*` (H15-signed copy only), name a real term id, carry a `D-<TICKET>-<n>` deferral key + YYYY-MM-DD date + note, and cover a live violation (a stale/seeded allow fails closed).
- `tools/eslint-plugin-rhema/rules/no-banned-strings.js` — new `bannedPatterns` option (regex terms over Literal/TemplateElement VALUES; quoted property keys — internal event-type ids like `"gate.opened"` — are skipped on the pattern leg only; the substring `banned` leg is unchanged).
- `eslint.config.js` — imports `BANNED_INTERNAL_TERMS` from the built `packages/contracts/dist` (fails loudly unbuilt — the guard never silently passes unarmed) and scopes `banned` + `bannedPatterns` at the copy-bearing files (`apps/web/src/copy.ts`, `billing-copy.ts`, `contracts/src/labels.ts`).
- `apps/web/src/spa/testkit.ts` — `expectNoInternalKeys(scope, {extraExcludes})`: clones the scope, removes `[data-pm-host]`/`[data-copy-guard-exclude]`/script/style/template subtrees (essay content is data), and asserts no underscore-keyed `UI_LABELS` key (`chat_turn`, `second_read`, `draft_ledger`, `waiting_gate`, `substack_export`…) appears in rendered TEXT. Attributes never enter `textContent`, so "outside `data-*`" holds by construction. It is wired into `expectManifestEmission` for Element/Document scopes — every SPA surface render parity leg runs it (34 `*.dom.test.tsx` files, 1,609 tests green).
- `apps/web/src/spa/copy-guard.dom.test.tsx` (new) — seeded legs: a `chat_turn`/`second_read`/`draft_ledger`/`waiting_gate`/`substack_export` in rendered text fails; the same key inside `data-*` is ignored; `data-pm-host` prose is excluded; a labels-only surface passes.
- `packages/orchestrator/src/phase-labels.test.ts` (new) — every `WORKFLOW_MANIFESTS` `phase.key` is a declared `PHASE_KEYS` member.
- `apps/web/src/copy.test.ts` — REQ-COPY-1 exhaustiveness (`@ts-expect-error` on seeded fake keys for all five domains + per-key presence), label-table lint-cleanliness, the whole-table `lintInternalTerms` + `validateInternalTermAllow` legs, seeded-banned-leaf legs for every §4.13 term, seeded-allow legs (no D-row → fail; non-demo key → fail; stale → fail), and the verbatim-list assertion.

### AI-use statement (G6)

- `packages/ai-use/src/statement.ts` — `workflowCounts` + the phases sentence render `UI_LABELS.workflow`/`UI_LABELS.phase`; the model-tier list renders `MODEL_TIER_DISPLAY`. "15 review, 3 chat_turn … phases: intake, craft" now reads "15 Review, 3 Chat … phases: Intake, Craft". `statement.test.ts` updated: fixture phases moved to real manifest keys (`intake`/`letter`/`triage`/`draft`) — the prior `read`/`letter_writing` keys were invented fixture keys that had also been leaking verbatim.

## Verification

| Check | Result |
| --- | --- |
| `pnpm turbo build --filter=@rhema/contracts --filter=@rhema/ai-use` | PASS — 8 tasks |
| `pnpm turbo build --filter=@rhema/web...` (incl. `--filter=@rhema/orchestrator...`) | PASS — 13 tasks (Vite + tsc) |
| `pnpm --filter @rhema/web typecheck` | PASS |
| `pnpm --filter @rhema/web lint` (`eslint .`) | PASS — 0 errors (1 pre-existing unused-disable warning in `chat-live.tsx`) |
| `pnpm exec vitest run apps/web/src` | PASS — **1609/1609** (94 files; run-sheet `data-run-label` leg fixed — `runLabelFor` keeps the verb labels) |
| `pnpm exec vitest run packages/contracts/src packages/ai-use/src tools/eslint-plugin-rhema` | PASS — 402/403 → all green after `statement.test.ts` fixture update |
| `pnpm exec vitest run packages/orchestrator/src/phase-labels.test.ts tools/eslint-plugin-rhema apps/web/src/spa/copy-guard.dom.test.tsx packages/ai-use/src/statement.test.ts` | PASS — 58/58 |
| `pnpm check:dom-contract` | PASS |
| `pnpm check:spa-env` | PASS |
| `pnpm check:protocol-markers` | PASS — 313 public-facing files scanned |
| `pnpm exec eslint apps/web/src/copy.ts` (bannedPatterns leg, contracts dist removed) | PASS — the REQ-COPY-6 pattern list arms from the shared JSON with no build-order dependency |
| `pnpm check:spa-budget` | WARN-held (all ceilings held) — entry **+17.2 kB** gz vs baseline `04a4e98b`; chain tip already carried ≈ +15.4 kB (GD-KIT3A-BUDGET deficit) → **ticket increment ≈ +1.8 kB** (`UI_LABELS` joined the entry graph via `copy.ts`) |
| `public-ssr-baseline` BEFORE @ pre-change build vs AFTER @ branch build (local, `docs/build/reports/2026-11-07_public-ssr-baseline-{BEFORE,AFTER}`) | All five routes + favicon 200; semantic fields identical; normalized hashes moved on `/` only (`bytes` 56733→56734) — exactly the two enumerated public-copy leaves (GD-PUBDELTA.R7): `"the public funnel"`→`"the sign-up flow"`, `"Have an invitation? Sign in"`→`"Already have an account? Sign in"`. Same 2 warnings both runs (`/login` "private beta" wording — pre-existing, out of the banned list's scope; `/showcase` sample-dossier text absent on an unseeded local boot — data-dependent, identical before/after). |

## AC-gap table

| AC | Layer | Evidence | Status |
| --- | --- | --- | --- |
| One label table for every internal key reaching the UI (workflows, phases, artifact kinds, provider/source kinds, run state, every other contracts enum) | code + test | `contracts/src/labels.ts` `UI_LABELS` (~60 domains, `Record<EnumKey,string>`); folds in `copy.ts`/`feed-labels.ts`/`run-sheet-labels.ts`; `copy.test.ts` exhaustiveness legs (`@ts-expect-error` fake keys); `phase-labels.test.ts` manifest parity | PROVEN (Stage A) |
| Banned internal terms → plain language (REQ-COPY-6 verbatim list) | code + lint | jargon edits above; `lintInternalTerms(collectCopyStrings())` = [] | PROVEN (Stage A) |
| Copy lint + DOM guard (REQ-GUARD-2) | lint + DOM test | `BANNED_INTERNAL_TERMS` → `lintInternalTerms` + ESLint `bannedPatterns`; `expectNoInternalKeys` in `expectManifestEmission` (all surface parity legs) + seeded `copy-guard.dom.test.tsx`; seeded-leaf + seeded-allow legs in `copy.test.ts`; seeded `bannedPatterns` legs in `no-banned-strings.test.ts` | PROVEN (Stage A) |
| Export AI-use statement renders labels not keys | code + test | `statement.ts` label resolution + updated `statement.test.ts` | PROVEN (Stage A) |
| Public routes unchanged except enumerated deltas (REQ-DACC-6 / GD-PUBDELTA.R7) | local recapture | BEFORE/AFTER `baseline.json` pair — only `/` copy moved | PROVEN (Stage A; Stage-B deployed re-verification → `250_R7DEP.2`) |
| `D-R7COPY.1a-1` allow row for H15-signed demo copy | — | **not opened** — no `demo.*`/`demo.tour.*` leaf carried a banned term; `BANNED_INTERNAL_TERM_ALLOW` is empty (verified by the lint legs) | N/A |

## Evidence report

- No banned term survives in any `COPY` leaf; no snake_case key surfaces in rendered text (1,609-test sweep with the guard wired into the shared parity path).
- The two-leg guard structure means a future banned term in COPY fails BOTH `lintInternalTerms` (vitest) and `no-banned-strings` `bannedPatterns` (eslint).
- Deferrals: **none opened** (the H15-signed-demo-copy condition did not trigger); none closed.
- **CI:** pass #284@`219eaea` (run 42332167998 — all seven legs + ci-pass anchor; `logs/ci-R7COPY.1a.json`). Three reads: the first red on a lint-time `contracts/dist` import (list moved to shared JSON), the second on an unused import + an undeclared `data-copy-guard-exclude` hook (declared + asserted); one unrelated `ingest.test.ts` flake passed on rerun.
- Spend: **$0** — Stage A, all verification local (`GD-PREVIEW.R7`; no preview, no production mutation).
- Operator judgement calls: (a) participial interpolation words keep lowercase (sentence position, not standalone labels); (b) `runLabelFor` keeps verb-phrase COPY leaves (a CTA verb, not an enum label — pinned by the SPA.20 leg); (c) `steer.deliverableLabel` stays templated count copy in COPY (interpolated "{n} findings" templates compose labels, not pure enum maps); (d) lowercase "Quiet hours" (the notification feature) is not the banned uppercase bucket term; (e) the ai-use statement's "review obligations" sentence is exported-document prose, not a COPY leaf — left verbatim (the lint scans `COPY`, not generated documents); (f) ESLint `bannedPatterns` scopes to the copy-bearing files — quoted property keys (event-type ids) are internal vocabulary by design.
