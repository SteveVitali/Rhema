# PRB.06 — Revise delivery, what-changed, re-review, rubric delta

**Spec:** `docs/tickets/22_PRB.06__revise-whatchanged-rereview.md` (REQ-IDE-33, REQ-WF-7, REQ-DATA-25,
REQ-OBJ-6, REQ-BETA-7, REQ-BETA-8, REQ-PROD-11)
· **Base:** `stevevitali/prb-05-triage-dispositions-gate-cards` · **Stacked PR — do not merge (mergePolicy=OPERATOR).**

## Summary

The loop's return half. A `response` correspondence delivery now persists the frozen response-ledger's
disposition rows (forward-linked by `move_ordinal`), creates the v(N+1) `response_to_review` draft off
the answered review, computes the server-side block-aligned diff, and emits `revision.move_traced` per
joined move — the same emit seam (`manual-trace.ts`) serving human-edited revisions. The obligations
hook routes every ledger row inside the delivery transaction (accept/adapt→`addressed`,
verified→`discharged` via gap check, rebut→`rebutted`, defer→`deferred`, escalate→decision request,
mooted→`mooted`), closing D-P0.12-2. A re-review carries `prior_review` + a server-computed
`changed_since`, computes carried/closed/new/reopened from persisted obligation rows (rebutted findings
are never re-raised), and emits `rereview.lineage`. The server-rendered What-changed view shows move
cards with obligation discharge lines, the summary strip ("N addressed · M rebutted · K still open"),
an Inline hunk layout with an Unlinked group, rebutted findings with rationale, and per-hunk comment
forms that write `Guidance` rows for the next Revise. Rubric delta renders per dimension — never an
aggregate.

## What changed

- **`@rhema/contracts`** — `responseLedgerSidecarSchema.moves[]` (`{ordinal,title,type?,status?,
  discharges?,moots?}`); events `revision.move_traced{correspondenceId?,draftId?,baseDraftId?,
  findingId?,moveId?,hunkCount,charsChanged}` and `rereview.lineage{correspondenceId,priorReviewId?,
  carried,closed,new,reopened}` (bounded payload whitelist — ids + counts only); `ChangedSince` /
  `HumanAddedClaimPlaceholder` types.
- **`@rhema/findings-core`** (framework-free) — `what-changed.ts`: `splitMarkdownBlocks` (blank-line
  boundaries, positional `b1..bn` ids), `diffMarkdown` (block LCS → edited/added/removed hunks),
  `joinHunksToMoves` (move discharge/moot evidence resolved with the SAME `resolveAnchor` quote ladder
  findings use, over v(N+1) then vN blocks), `buildWhatChangedView` (move cards + discharge lines +
  Unlinked + rebutted + summary strip), `buildChangedSince` (hunks + `humanAdded`/`unverifiable` claim
  placeholders for `human_revision` origins), `buildRubricDelta` (per-dimension rows, no total),
  `traceRevisionMoves` (per-move event payloads).
- **`@rhema/protocols`** — `md-twins` renders/parses the response-ledger `moves` block (exact
  JSON↔Markdown round-trip, corrupted-MD detection); `PROTOCOLS_VERSION` re-frozen
  (`0.4.0+64cbeef137b090c2`), upstream-diff OK.
- **`@rhema/mirror`** — `runDeliveryTransaction` gains `priorReviewId`/`newDraftId`; the response
  branch reads+validates `response-ledger.json`, freezes + forward-links the answered review's
  dispositions, persists ledger entries with `move_ordinal`, creates the v(N+1) `response_to_review`
  draft (single working head), diffs base→delivered content, and emits `revision.move_traced`;
  `manual-trace.ts` is the shared seam for human-revision diffs. New dep: `@rhema/findings-core`.
- **`@rhema/obligations`** — `hook.ts` response-ledger routing branch (the full disposition→state map
  above) inside the delivery tx; review branch emits `rereview.lineage` from row-computed counts;
  `queries.ts` resolves obligations via root finding ids / `obligation_findings` lineage edges.
- **`@rhema/orchestrator`** — runspec carries the re-review inputs.
- **`apps/api`** — `what-changed.ts` assembles the server-side read model (response correspondence →
  answered review → base/next drafts → ledger → obligation states → strip/discharge lines);
  `revision-routes.ts`: `GET /projects/:id/responses/:cid/what-changed` + `POST …/hunks/:hid/comments`
  (hunk-validated, anchored to the first changed block, `captureGuidance` `source:'inline_comment'`
  scoped to the project + `revise` workflow); `run-routes.ts` seeds `inputs.priorReviewId` +
  `inputs.changedSince` at run creation and forces `delivery.priorReviewId`/`newDraftId` from the run
  row (never pod-trusted).
- **`@rhema/api-client`** — `WhatChangedDto` family + `getWhatChanged` / `commentOnHunk`.
- **`@rhema/ui`** — `WhatChangedView` (strip, move cards, Unlinked, rebutted, per-hunk comment forms) +
  `RubricDelta`.
- **`apps/web`** — `GET /p/:project/revisions/:cid` server-rendered page + hunk-comment POST; the
  dossier renders the rubric delta when `priorRubric` exists; `COPY.whatChanged`/`rubricDelta`.

## Design decisions

- **One anchor ladder.** Hunk→move association resolves the move's discharge/moot evidence through the
  exact `resolveAnchor` service findings use — same failure modes, same semantics, no second matcher.
- **Unlinked is first-class.** Any hunk with no move lands in a labeled group, so human edits and
  un-triaged changes are visible rather than dropped.
- **Events carry ids + counts only.** `revision.move_traced`/`rereview.lineage` never embed hunk text
  or ledger prose — no protocol IP or draft content in the event stream (REQ-ARCH-33).
- **Server truth.** `prior_review`/`changed_since`/verdict context are computed or reconstructed
  server-side from stored run inputs; pod-supplied wire data is never trusted for them.
- **Per-dimension, never aggregate.** The rubric delta has no total/average by construction — rows only.
- **Data/API pair built for P1.8.** The What-changed read model + renderer are standalone so the later
  pane system reskins them rather than rebuilds them.

## Acceptance criteria

| AC | Evidence |
|---|---|
| Golden: correct move↔finding↔obligation joins; unlinked grouped; rebutted rendered w/ rationale | api `revision-routes.test.ts` end-to-end assembly + findings-core `what-changed.test.ts` (11) |
| Re-review: carried/closed/new from rows match planted lineage; reopened regression | obligations `delivery-integration.test.ts` "emits rereview.lineage … carried + closed + new from rows" |
| `revision.move_traced` + `rereview.lineage` correct payloads | mirror `delivery.test.ts`; delivery-integration lineage test; `contracts/events.ts` schemas |
| Human edits → `humanAdded, verdict:'unverifiable'` placeholders as `changed_since` | `buildChangedSince` test; api test "seeds changed_since with human-added placeholders" |
| Hunk comment → `Guidance` row for next Revise | api test: POST comment → `guidance` row `source:'inline_comment'`, `revise` workflow |
| Rubric delta per dimension, no aggregate | findings-core + ui tests; no total exists in the type |

## Out of scope (absent by construction)

Side-by-side compare · `prosemirror-changeset` · restore-point UI · the full Timeline pane · live/deploy
legs.

## Verification

- `pnpm turbo build lint typecheck` — **108/108** green.
- `pnpm test` — **1659 passed / 2 skipped / 234 files** (server-postgres self-skips without
  `DATABASE_URL`).
- `pnpm check:protocol-markers` — OK (39 files). `check-upstream-diff` — OK.
- `pnpm check:licenses` — pre-existing base failure only (`duck`/`pako`, unchanged base lockfile; zero
  third-party deps added).
- `check-build-memory.sh .` — 0 violations.
- Deferrals: **closed D-P0.12-2** (response-delivery auto-routing, asserted from rows); none opened.
