# PRB.06 — Revise delivery, what-changed, re-review, rubric delta

- **Spec:** `docs/tickets/22_PRB.06__revise-whatchanged-rereview.md`
- **Base:** `stevevitali/prb-05-triage-dispositions-gate-cards` @ `2cecdce`
- **Branch:** `stevevitali/prb-06-revise-whatchanged-rereview`
- **Config:** implement-spec full preset (autonomous; live legs NOT permitted — deterministic only per operator)

## Deferrals read
`docs/tickets/DEFERRALS.md` read at start. Relevant OPEN rows:
- `D-P0.12-2` — response-delivery auto-routing, explicitly owned by this ticket (its closure test: a delivered
  `response` with accept/adapt moves → `addressed`, a gap-check-verified move → `discharged`, asserted from
  rows). **In scope — to close for real this run.**
- `D-PRB.04-1/2` (live dossier read + SSE/obligation chips), `D-PRB.05-1` (live triage write) — same live
  deploy leg, not unblocked here.
- `D-P0.12-3` (matcher-3 floor / Convergence) — P0.15/1.x, untouched.

## Requirements
1. Server-side block-aligned markdown diff vN→v(N+1); join changed hunks to response-ledger moves via the
   move's discharge evidence resolved with the SAME quote-resolution service as findings (`resolveAnchor`);
   hunks with no move grouped Unlinked; rebutted findings render with rationale and no hunk.
2. What-changed view: move cards with obligation discharge lines ("discharges OBL-3 (F-07, carried from v2)
   — verified by gap check"), summary strip "N obligations addressed · M rebutted · K still open", Inline
   layout, server-rendered read-only; hunk comments → `Guidance` rows for the next Revise (REQ-IDE-33).
3. Re-review path: Review on v(N+1) passes `prior_review` + `changed_since`; carried/closed/new computed from
   obligation rows; `rereview.lineage{carried,closed,new,reopened}` event; rebutted findings not re-raised.
4. `revision.move_traced{finding_id, move_id, hunk_count, chars_changed}` at Revise delivery AND on
   manual-revision diffs (shared emit PRB.07 consumes).
5. Rubric delta: per-dimension before/after, NEVER an aggregate.
6. Response delivery routes obligations (`routeDisposition`/`dischargeByGapCheck`) — closes D-P0.12-2.

Out of scope (must NOT implement): side-by-side compare, prosemirror-changeset, restore-point UI, the full
Timeline pane, public pricing/signup, live/deploy/paid legs.

## Plan
- **contracts:** `responseLedgerSidecarSchema.moves[]` ({ordinal,title,type?,status}); events
  `revision.move_traced` + `rereview.lineage` (bounded payload whitelist).
- **findings-core `what-changed.ts`:** `splitMarkdownBlocks`, `diffMarkdown` (block LCS → edited/added/removed
  hunks), `joinHunksToMoves` (entry anchors → `resolveAnchor` over v(N+1) then vN blocks), `buildWhatChangedView`
  (move cards + Unlinked + rebutted + strip), `buildChangedSince` (hunks + `humanAdded`/`unverifiable` claim
  placeholders for `human_revision` origins), `buildRubricDelta` (rows only, no total), `traceRevisionMoves`
  (per-move event payloads `{findingId,moveId,hunkCount,charsChanged}`).
- **protocols md-twins:** render/parse the response-ledger `moves` block (round-trip by construction).
- **mirror delivery:** `DeliveryArgs.priorReviewId` → `correspondence_items.prior_review_id`; response branch —
  create the v(N+1) `drafts` row (`response_to_review`, base_draft_id, promoted version), persist the frozen
  ledger's disposition rows (agent rows where no user row; `move_ordinal`, `response_id`, `frozen_at`), compute
  the diff + join, emit `revision.move_traced` per move; hook ctx gains `priorReviewId`/`responseLedger`/
  `newDraftId`.
- **obligations hook:** response branch routes each ledger entry (accept/adapt+done → `addressed`;
  verified → `discharged` `verifiedBy:'gap_check'`; rebut → `rebutted`; defer → `deferred`; escalate → decision
  request; mooted → `mooted`); review branch emits `rereview.lineage` from the row-computed counts. Mount
  provider returns `ServerFile[]` — `obligations.json` + `changed-since.json` on a re-review's Editor manifest.
- **api:** `createRun` seeds `inputs.priorReviewId` (revise always; review when a prior review exists) +
  `inputs.changedSince` (server-computed block diff of the reviewed head vs the prior review's draft);
  deliver forces `delivery.priorReviewId`/`newDraftId` from the run row (never pod-trusted);
  `revision-routes.ts` — `GET /projects/:id/revisions/:cid/what-changed` (server assembly) +
  `POST /projects/:id/revisions/:cid/hunks/:hid/comments` → `captureGuidance(source:'inline_comment')`.
- **api-client:** `WhatChangedDto`/`getWhatChanged`/`postHunkComment`.
- **ui:** `WhatChangedView` (strip, move cards, Unlinked, rebutted, per-hunk comment forms) + `RubricDelta`.
- **web:** `/p/:project/revisions/:cid` page + comment POST; DossierPage rubric-delta section
  (`dossier.priorRubric`); COPY.whatChanged/rubricDelta.

## Test matrix
| AC | Tests |
|---|---|
| AC1 golden What-changed | findings-core `what-changed.test.ts` (join/Unlinked/rebutted); ui DOM `what-changed.test.tsx`; api route test assembles the fixture end-to-end |
| AC2 re-review counts | obligations `hook.test.ts` planted lineage → carried/closed/new + reopened regression |
| AC3 events | mirror `delivery.test.ts` `revision.move_traced` payload; hook `rereview.lineage` payload |
| AC4 humanAdded | `what-changed.test.ts` `buildChangedSince` on `human_revision` → placeholders; api createRun seeds inputs |
| AC5 hunk comment → Guidance | api revision-routes test → `guidance` row `source:'inline_comment'`; `consumeGuidance` delivers it at next Revise |
| AC6 rubric delta | findings-core + ui DOM: per-dimension rows, no aggregate |
| D-P0.12-2 | obligations delivery-integration: response delivery routes accept→addressed, verified→discharged |

## Progress
- Phase 0 done: branch cut, spec/manifest/DEFERRALS/LEDGER read, seams mapped, plan + matrix recorded.
- Contracts: `responseLedgerSidecarSchema.moves[]`, `revision.move_traced`, `rereview.lineage`,
  `ChangedSince`/`HumanAddedClaimPlaceholder` types.
- findings-core `what-changed.ts`: block diff, `resolveAnchor` move joins, Unlinked, rebutted cards,
  discharge lines, summary strip, `buildChangedSince` (humanAdded/unverifiable placeholders),
  `buildRubricDelta` (per-dimension only), `traceRevisionMoves`.
- protocols `md-twins`: response-ledger moves render/parse, exact JSON+MD round-trip; version re-frozen.
- mirror `delivery.ts`: `priorReviewId`/`newDraftId`, response-ledger fold (disposition rows +
  `move_ordinal`), v(N+1) `response_to_review` draft, server diff + `revision.move_traced`;
  `manual-trace.ts` shared seam for manual revisions.
- obligations `hook.ts`: response-ledger routing (accept/adapt→addressed, verified→discharged
  `verifiedBy:'gap_check'`, rebut→rebutted, defer→deferred, escalate→decision request, mooted→mooted);
  review branch emits `rereview.lineage` from row-computed carried/closed/new/reopened.
- api: `createRun` seeds `inputs.priorReviewId`/`inputs.changedSince` (server-computed); deliver forces
  them from the run row; `what-changed.ts` read model + `revision-routes.ts` (GET what-changed, POST
  hunk comment → `captureGuidance` `source:'inline_comment'`).
- api-client + ui + web: `WhatChangedDto`/`getWhatChanged`/`commentOnHunk`; `WhatChangedView` +
  `RubricDelta` components; `/p/:project/revisions/:cid` server-rendered page + comment POST; dossier
  rubric-delta section.
- Self-review + gap analysis done; full gates green (see Evidence).

## Gap table

| # | Requirement / AC / invariant | Status | Evidence |
|---|---|---|---|
| R1 | Server-side block-aligned diff vN→v(N+1); hunk→move joins via the same `resolveAnchor` ladder as findings; Unlinked group; rebutted finding renders with rationale and no hunk | met | `packages/findings-core/src/what-changed.ts` (`splitMarkdownBlocks`/`diffMarkdown`/`joinHunksToMoves`); `what-changed.test.ts` (11 tests) |
| R2 | What-changed view: move cards + obligation discharge lines + summary strip + Inline layout, server-rendered read-only | met | `buildWhatChangedView`; `packages/ui/src/what-changed.tsx`; `what-changed.test.tsx` (6 DOM tests); api `revision-routes.test.ts` golden assembly |
| AC1 | Golden: seeded multi-round project renders correct move↔finding↔obligation joins; unlinked edits grouped; rebutted finding rendered with rationale | met | api `revision-routes.test.ts` "assembles the what-changed view end-to-end" (fixture: move-linked hunk, unchanged separator, unlinked hunk, rebutted card w/ rationale) |
| AC2 | Re-review fixture: carried/closed/new computed from rows matches planted lineage; reopened regression appears | met | obligations `delivery-integration.test.ts` "emits rereview.lineage on a re-review: carried + closed + new from rows" |
| AC3 | `revision.move_traced` + `rereview.lineage` events fire with correct payloads | met | `contracts/events.ts` schemas (ULID ids, bounded payload); mirror `delivery.test.ts` move_traced payload; delivery-integration lineage payload |
| AC4 | Human-edited blocks → `humanAdded, verdict:'unverifiable'` placeholders passed as `changed_since` to the next Review | met | `buildChangedSince` on `human_revision` origins (`what-changed.test.ts`); api test "seeds changed_since with human-added placeholders"; `createRun` seeds `inputs.changedSince` server-side |
| AC5 | Hunk comment → `Guidance` row consumed by next Revise | met | `POST …/hunks/:hid/comments` → `captureGuidance` `source:'inline_comment'`, project+`revise` workflow scope (`revision-routes.test.ts`); `consumeGuidance` (P0.10) delivers at next Revise |
| AC6 | Rubric delta per dimension, no aggregate | met | `buildRubricDelta` emits rows only; ui `RubricDelta` renders before/after per dimension; no total/average anywhere |
| R4 | `revision.move_traced` at Revise delivery AND manual-revision diffs | met | `mirror/delivery.ts` emits per-move after the response fold; `manual-trace.ts` shared emit seam + `manual-trace.test.ts` |
| R6 | Response delivery routes obligations (closes D-P0.12-2) | met | `obligations/hook.ts` response branch + `delivery-integration.test.ts` "routes a delivered response's ledger rows" (accept→addressed, verified→discharged, rebut→rebutted) |
| REQ | REQ-IDE-33, REQ-WF-7, REQ-DATA-25, REQ-OBJ-6, REQ-BETA-7, REQ-BETA-8, REQ-PROD-11 | met | mapped above; stamped in the PR body |
| INV | Append-only contracts/history; ULID event ids; no protocol IP in events; no secrets | met | event payloads are ids + counts only; vocab-lint + protocol-markers green |
| INV | `@rhema/*` imports only; `.js` relative; explicit deps/refs | met | `packages/mirror` gained the `@rhema/findings-core` dep + tsconfig reference; turbo build/typecheck green |
| OOS | No side-by-side compare, prosemirror-changeset, restore-point UI, full Timeline pane | met (absent) | What-changed + Inline are the only shipped layouts; the API/read-model pair is left for P1.8 to reskin |

### Gaps found during this run's review (all closed)
- `revision.move_traced` emitted even on an empty diff → `traceRevisionMoves` skips an empty unlinked
  trace; stale `findings-core` dist rebuilt so Vitest resolves fresh output.
- Test fixtures used non-ULID ids reaching event payloads → ULID-shaped fixture ids (harness
  `testDeps()` already generates them via `toUlid()`).
- Response-delivery test violated `drafts (project_id,n)` + `one_working_head_per_project` → the
  original working draft is frozen before the v(N+1) `response_to_review` head is created.
- Obligation integration fixture used invalid ledger disposition/status values → corrected to schema
  values; all 4 tests pass.
- What-changed fixture's unlinked addition merged into the move hunk → an unchanged block separates
  them; rebutted-card assertion updated to the full DTO shape (findingId/title/severity/rationale).
- Lint: unused `wordCoverage`/edit-pair constant in `what-changed.ts` → wired into hunk classification
  or removed.
- `protocols_version` drift after the `md-twins` moves block → re-frozen
  (`0.4.0+64cbeef137b090c2`); `check-upstream-diff` OK.

## Evidence log
- Targeted: findings-core `what-changed.test.ts` 11; ui `what-changed.test.tsx` 6; mirror `delivery` 11 +
  `manual-trace`; obligations `delivery-integration` 4; protocols `roundtrip` 13; api `revision-routes`
  5; web `server` 35 — all green.
- `pnpm turbo build lint typecheck` → **108/108** tasks green.
- `pnpm test` (full suite) → **1659 passed / 2 skipped / 234 files** (server-postgres integration test
  self-skips without `DATABASE_URL`).
- `pnpm check:protocol-markers` → OK (39 files scanned). `node scripts/compute-protocols-version.mjs
  --write` applied; `check-upstream-diff` OK (16 ported files reconcile; sanctioned edits only).
- `pnpm check:licenses` → **pre-existing base failure only** (`duck` BSD, `pako` MIT AND Zlib — both in
  the base lockfile unchanged; same state as PRB.05's close). This change adds zero third-party deps
  (only the `@rhema/findings-core` workspace link in `packages/mirror`).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → 0 violations.
- Live verification: NOT RUN — live legs are not permitted for this ticket (deterministic-only per
  operator).

## Evidence report

**What landed.** The loop's return half: a `response` correspondence delivery now persists the frozen
response-ledger's disposition rows (with `move_ordinal`), creates the v(N+1) `response_to_review` draft
off `prior_review_id`, computes the server-side block diff, and emits `revision.move_traced` per joined
move — with `manual-trace.ts` giving human revisions the same seam. `what-changed.ts` (findings-core,
framework-free) is the diff/join/view-model core: blank-line block split, LCS hunk classification,
`resolveAnchor` quote-resolution to associate hunks with moves, Unlinked grouping, rebutted cards with
rationale, obligation discharge lines, and the "N addressed · M rebutted · K still open" strip. The
obligations hook routes every ledger row inside the delivery transaction (closing **D-P0.12-2**), and a
re-review emits `rereview.lineage{carried,closed,new,reopened}` computed from persisted rows — rebutted
findings are never re-raised. `createRun` seeds `priorReviewId` + a server-computed `changedSince` whose
human edits become `humanAdded`/`unverifiable` claim placeholders. The `GET what-changed` read model +
`POST hunk comments` (→ `Guidance` rows scoped to the next Revise) back the server-rendered
`/p/:project/revisions/:cid` page and the dossier's per-dimension rubric delta — a data/API pair P1.8
can reskin.

**Verification.** turbo 108/108; full suite 1659 pass/2 skip; protocol markers OK; upstream-diff OK;
`PROTOCOLS_VERSION` re-frozen `0.4.0+64cbeef137b090c2`; build-memory 0 violations; licenses = the same
pre-existing `duck`/`pako` base-lockfile failure PRB.05 recorded (zero third-party deps added).

**Deviations:** none from the spec. Out-of-scope items (side-by-side compare, prosemirror-changeset,
restore-point UI, the full Timeline pane) are absent by construction.
