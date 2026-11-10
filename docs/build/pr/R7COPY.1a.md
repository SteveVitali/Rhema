## R7COPY.1a — the ONE enum label table + the jargon guard

**Stage A only, `$0`, unmerged** (`mergePolicy: OPERATOR`), stacked on `stevevitali/r7kit-3e-dossier`.

REQ-COPY-1, REQ-COPY-6, REQ-GUARD-2, REQ-DACC-6. Audit refs: B6, C12, D2, D3, G2, G6, H3, A1/A10, UXC-30.

### What changed

- **The ONE label table (REQ-COPY-1):** `UI_LABELS` in `packages/contracts/src/labels.ts` — ~60 `Record<EnumKey,string>` sub-tables (workflow, phase, artifact kind, run state, gate/decision kinds, provider/source kind, verdict, severity, finding/claim kinds, and every other enum a surface renders), all sentence-cased. New structural enums `PHASE_KEYS` (39 manifest keys + 6 retired) and `SOURCE_PROVIDER_KEYS`. Every enum-keyed map in `copy.ts`/`feed-labels.ts`/`run-sheet-labels.ts` folds into `labelLookup(UI_LABELS.…)` rebinds — a raw `chat_turn`/`draft_ledger`/`substack_export`/`waiting_gate` can no longer reach text, and a new enum value fails typecheck until labelled.
- **The jargon pass (REQ-COPY-6, verbatim §4.13 list):** `obligations`→`open items`; body-copy `gate(s)`→`approvals`/`spend confirmations`; `the coherence read` dropped; `public funnel`→`the sign-up flow`; `sidecar`→`Structured notes`; `partial (0/1 phases)`→`Finished in part — {done} of {total} phases done`; `Waiting on your call`→`waiting for you`; `Have an invitation?`→`Already have an account?`; `the shared session contract`→plain wording. `QUIET` is already absent (ADR-128); lowercase "Quiet hours" stays (the notification feature, not the bucket).
- **REQ-GUARD-2:** `BANNED_INTERNAL_TERMS` (verbatim list) + `lintInternalTerms`/`validateInternalTermAllow` in contracts; ESLint `no-banned-strings` gains a `bannedPatterns` leg seeded from the same list over the copy-bearing files (quoted property keys skipped — `"gate.opened"` is an event-type id). The DOM guard `expectNoInternalKeys` runs inside `expectManifestEmission` for every Element/Document parity leg — a seeded `chat_turn` in rendered text fails (`copy-guard.dom.test.tsx`), `data-*` attributes and `[data-pm-host]` essay prose are excluded. Allow entries for H15-signed `demo.*` leaves require a `demo.*` key + `D-<TICKET>-<n>` row + date and must cover a live violation — a seeded/stale allow fails closed.
- **AI-use statement (G6):** workflow counts, phases, and model tiers render `UI_LABELS`/`MODEL_TIER_DISPLAY` — "15 review, 3 chat_turn" → "15 Review, 3 Chat"; "phases: intake, craft" → "Intake, Craft".

### Verification

`turbo build` (contracts/ai-use/orchestrator/web) ✓ · `typecheck` web ✓ · `eslint` 0 errors · web sweep **1,609/1,609** · contracts+ai-use+rule suite all green · `phase-labels`/copy-guard/no-banned-strings seeded legs green · `check:dom-contract` ✓ · `check:spa-env` ✓ · `check:protocol-markers` ✓ · `check:spa-budget` ceilings held — entry **+17.2 kB vs `04a4e98b`**, ticket increment **≈ +1.8 kB** (the `UI_LABELS` table joins the entry graph; the chain's ≈ +15.4 kB `GD-KIT3A-BUDGET` deficit is unchanged) · local `public-ssr-baseline` BEFORE/AFTER pair: all routes identical except `/` — exactly the two enumerated public-copy leaves (`GD-PUBDELTA.R7`).

### Deferrals

None opened — no `demo.*`/`demo.tour.*` leaf carried a banned term, so `D-R7COPY.1a-1` and `BANNED_INTERNAL_TERM_ALLOW` stay empty (the lint legs pin this). Stage-B browser/deployed copy verification is owned by `250_R7DEP.2` as usual.

Full evidence: `docs/build/runs/R7COPY.1a.md`.
