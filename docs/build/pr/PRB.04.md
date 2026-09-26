# PRB.04 — `findings-core` and the dossier reading surfaces

**Spec:** `docs/tickets/20_PRB.04__findings-core-and-dossier.md` (§5.7, §5.5, §6.6, §10.2 REQ-MOBILE-4, §12.5, §12.6)
· **Base:** `stevevitali/prb-03-estimator-and-run-sheet` · **Stacked PR — do not merge (mergePolicy=OPERATOR).**

## Summary
The reading half of the review. Fills the P0.01 `packages/findings-core` skeleton with the framework-free
logic web and the 1.x mobile app share verbatim (REQ-MOBILE-4 / REQ-SPEC-20), and builds the beta dossier
reading surfaces on top of it: the run card + live feed, the Editor's letter, the claim ledger table, the
second-read reconciliation view, the rubric, the runtime trust chip, and the obligation chips. Reading surfaces
only — dispositions UI/verbs + gate cards are PRB.05, what-changed/diffs are PRB.06, the Margin/triage/Apply/
clustering are P1.7, the walkthrough/run report are P1.5.

## What changed
- **`packages/findings-core` (NEW body; framework-free — no React):**
  - `anchor.ts` — the anchoring ladder `resolveAnchor` (exact → normalized → fuzzy-with-confidence → unanchored;
    unresolved is still surfaced, never dropped).
  - `disposition.ts` — the five-verb state machine: rationale required for `rebut`/`escalate` only, `defer`
    default text, freeze semantics (immutable at delivery), `canDispose` (false while provisional/frozen).
  - `find-view.ts` — `buildFindingView` (read model from rows) + `groupFindingsForList` (Whole piece heads the
    list; count-preserving).
  - `reconciliation.ts` — second-read states + `detectReconciliationConflicts` (pre-triage-then-rejected).
  - `rubric.ts` — the five-dot rubric view model with inline caps and **no aggregate**.
  - `ledger.ts` — disposition/claim summaries + `claimUrlViews` (the fetched⇒proxy-log join).
  - `run-card.ts` — `deriveRunCardInput` (consumes ONLY whitelisted §12.5 orchestrator events; agent-authored
    text can never enter) + `buildRunCardView`.
  - `feed.ts` — the Summary/Details/Verbose density split (internal events never shown).
  - `deadline.ts` — gate deadline math. `trust-chip.ts` — the trust chip derived only from `access_report`.
- **`eslint.config.js`** — a `no-restricted-imports` override banning `react`/`react-dom` in
  `packages/findings-core/**` (the AC1 "no React (lint)").
- **`@rhema/ui` (NEW read-only surfaces, text-agnostic):** `RunCard`/`LiveFeed`, `FindingCard`/`FindingsList`/
  `ConflictRow`, `ClaimsTable`, `RubricView`, `SecondReadView`, `LetterView`, `TrustChip`/`ObligationChip`/
  `VersionObligationChip`. Depends on `@rhema/findings-core` + `@rhema/contracts`.
- **`apps/web`** — the delivered-review dossier page (`/p/:project/review/:runId`) assembling every surface via
  findings-core builders, wired through a `DataSource.getDossier` seam (production binding deferred, D-PRB.04-1);
  `COPY.review` (vocab-lint-clean); route + 10 render tests.

## Design decisions
- **findings-core is framework-free by construction** (REQ-MOBILE-4): pure functions + types, enforced by an
  eslint `no-restricted-imports` override and a source-scan self-test. Presentation lives entirely in `@rhema/ui`.
- **The run card cannot render agent text** (REQ-IDE-11): `deriveRunCardInput` whitelists the orchestrator event
  types and copies only their numeric/enum fields, so a stream carrying `agent.note`/`finding` prose/
  `artifact.written.summary` contributes nothing to the card. The `RunCardInput` type has no free-text field.
- **The trust chip's dynamic content is a pure projection of `access_report`** (REQ-PROD-2); the static
  vocabulary comes in as labels so the canonical-vocabulary lint covers the app copy, not the logic package.
- **Provisional/frozen cards are read-only** via `canDispose`; `FindingCard` renders its (PRB.05) `controls` slot
  only when disposable — so a provisional card never exposes controls, by construction.

## Verification
- `pnpm turbo build lint typecheck` → **108/108** green.
- `pnpm test` → **1549 passed / 2 skipped** (+91 over the base: findings-core 66, ui dossier-surfaces 17, web
  dossier route 8).
- `pnpm check:protocol-markers` → OK. `pnpm check:licenses` → pre-existing `duck`/`pako` failure (both in the
  base lockfile; this PR adds zero third-party deps — only workspace links).
- `check-build-memory.sh .` → 0 violations.

## Requirement IDs
REQ-IDE-11, REQ-IDE-12, REQ-IDE-14, REQ-IDE-15 (amended), REQ-IDE-23, REQ-IDE-25, REQ-IDE-26, REQ-IDE-30,
REQ-IDE-31, REQ-PROD-2, REQ-MOBILE-4, REQ-OBJ-6, REQ-OBJ-18, REQ-OBJ-19, REQ-SPEC-4.

## Acceptance criteria → evidence

| AC | Status | Evidence |
|---|---|---|
| AC1 — findings-core suite: anchor ladder, disposition rules (rationale rebut/escalate only), freeze; no React (lint) | ✅ met | `findings-core/src/anchor.test.ts` (8), `disposition.test.ts` (11), `no-react.test.ts` + the eslint `no-restricted-imports` override (smoke-verified to error on a react import) |
| AC2 — run card renders only orchestrator state/counters; agent-authored progress text renders none (REQ-IDE-11) | ✅ met | `run-card.test.ts` (AGENT_PROSE absent from the derived input) + `dossier-surfaces.test.tsx` RunCard + `server.test.ts` dossier route |
| AC3 — provisional cards expose no disposition controls; conflict row on the pre-triage-then-rejected fixture (REQ-IDE-15) | ✅ met | `disposition.test.ts` `canDispose`; `dossier-surfaces.test.tsx` (provisional → no `data-disposition-controls`; conflict row) + `server.test.ts` |
| AC4 — every claim URL shows a fetched-✓ chip iff in the proxy log; two-source stances render both edges (REQ-IDE-25, REQ-OBJ-18) | ✅ met | `ledger.test.ts` `claimUrlViews`; `dossier-surfaces.test.tsx` ClaimsTable (one fetched chip; both `data-stance`) + `server.test.ts` |
| AC5 — rubric renders dot rows with cap reasons; no aggregate anywhere in DOM (REQ-IDE-30) | ✅ met | `rubric.test.ts`; `dossier-surfaces.test.tsx` RubricView (8 rows, cap inline, no `/40`/total) + `server.test.ts` |
| AC6 — trust chip text derives from `access_report` fields only (REQ-PROD-2) | ✅ met | `trust-chip.test.ts` (field-tracking; injected note ignored); `dossier-surfaces.test.tsx` TrustChip + `server.test.ts` |
| AC7 — unanchored findings listed under "Whole piece", never dropped (REQ-IDE-23) | ✅ met | `find-view.test.ts` (`countGrouped` == input); `dossier-surfaces.test.tsx` FindingsList + `server.test.ts` |

## Deferrals opened
- **D-PRB.04-1** — live delivered-dossier read binding (`getDossier` → a real assembled `DossierData`), unblocked
  by the live worker (D-P0.08-1). The read models + surfaces + page assembly are deterministic; the production
  `apiDataSource.getDossier` throws (`notWired`).
- **D-PRB.04-2** — live SSE feed consumption (browser `EventSource`) + per-finding obligation-state chips (the
  obligations read-API join). The pure event→view-model mapping + the components are tested; the live wiring
  rides D-P0.08-1 / D-P0.08b / the P0.12 read.

No OPEN deferral row was unblocked by PRB.04 (a reading-surfaces-only ticket with no live legs).

## Notes
GATE G2 is DEFERRED (ledger `16c_GATE-G2`): this PR ships Phase-B reading UI with **no efficacy/marketing
claims (§16.4)** and **no public pricing/signup (REQ-BETA-19)** — the dossier is an auth-gated reading surface.
No live/deploy/paid legs; nothing was run live.
