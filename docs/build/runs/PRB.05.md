# PRB.05 — Triage, dispositions, reason codes, gate cards

- **Spec:** `docs/tickets/21_PRB.05__triage-dispositions-gate-cards.md`
- **Base:** `stevevitali/prb-04-findings-core-and-dossier` @ `91f66f8`
- **Branch:** `stevevitali/prb-05-triage-dispositions-gate-cards`
- **Config:** implement-spec full preset (autonomous; live legs NOT permitted — deterministic only per operator)

## Deferrals read
`docs/tickets/DEFERRALS.md` read at start. Relevant OPEN rows: `D-P0.10-1` (gate reminder
notifications — PRB.09 + inbox), `D-P0.10-2` (queued-stranded sweep), `D-PRB.04-1` (dossier live read
binding — deploy leg). None is unblocked by this ticket: the disposition/gate/decisions writes are
proven deterministically (PGlite + in-memory stores); their live bindings follow the same deferral
pattern as the dossier read.

## Requirements
1. Five-verb disposition UI on finalized findings: rationale only for rebut/escalate; defer prefilled
   "Not this round"; adapt opens editable suggestion; reversible before freeze; `reason_code` chips
   optional (REQ-BETA-6); pre-triage "you pre-triaged N of M".
2. Approve-triage card: ledger-based UI, escalations first, primary **Approve proposals**, per-row
   `actor: user` overrides serialized via P0.10 overlay flow; waits by default; 24-h opt-in.
3. One generic gate card for all beta kinds (approve_triage, approve_scope informational + blocking,
   approve_sample, confirm_cost, spend_overrun, resume_partial, refusal): artifact, deadline or
   "waiting for you", do-nothing sentence, cost so far + remaining, five actions, countdown +
   pause-while-reading, presence timer (REQ-SPEC-18), standing-guidance checkbox.
4. Phone-width (§10.1): approve/wait/stop, five dispositions + note, no bulk — same components
   (REQ-SPEC-20).
5. Minimal Decisions list (escalate dispositions, horizon arrivals, stall escalations).

Out of scope (must NOT implement): triage-mode queue chrome/JK, Margin, clustering,
bulk-with-one-preview, Apply, email gate actions (PRB.09), plan/scope structured-field editing.

## Acceptance criteria
- AC1: disposition rows write ledger entries with actor/rationale per §5.7; frozen at delivery;
  forward move-link interface asserted (REQ-IDE-27). *(deterministic)*
- AC2: pre-triage reaches Revise as highest-precedence guidance; never overridden (REQ-IDE-28;
  REQ-WF-9 fixture through overlay path). *(deterministic)*
- AC3: Approve-triage overrides serialize into the response-ledger file the Revise phase reads
  (REQ-SPEC-9, via P0.10). *(deterministic)*
- AC4: presence timer = 10-min countdown only for auto-proceed gates, project focused, artifact
  unread; wait-default gates never show it (REQ-SPEC-18). *(deterministic)*
- AC5: reason codes optional everywhere; text required only for rebut/escalate (REQ-BETA-6;
  REQ-MOBILE-11). *(deterministic)*
- AC6: phone-width approve/wait/stop + all five verbs with a note at 375 px from same components
  (REQ-SPEC-20). *(deterministic)*

## Plan
- `contracts`: `reasonCode` on `dispositionSchema`/`FindingView.disposition`; `actor` on
  `responseLedgerEntrySchema.disposition` (+ `dispositions.reason_code` migration 0018).
- `protocols`: `md-twins` render/parse `disposition.actor`.
- `findings-core`: `DispositionInput/State` + reasonCode/adaptedText; new `triage.ts`
  (escalation-first sort, merge-user-wins, pretriage ledger+summary); new `gate-card.ts`
  (GateView builder, actions, do-nothing, presence-timer rules); new `decisions.ts`.
- `ui`: `dispositions.tsx`, `gate-card.tsx` (+ `ApproveTriageCard`), `decisions.tsx`;
  `FindingsList.controlsFor`.
- `api-client`: DTOs + recordDisposition/decisions/gates methods.
- `api`: `triage-routes.ts` — POST disposition (validate+upsert+obligation routing+`finding.disposed`),
  GET/POST decisions, GET gates (incl. approve_triage ledger rows from the artifact store),
  GET pretriage; revise `createRun` seeds `inputs.pretriage` + guidance.
- `web`: DataSource + routes (disposition POST, gate decide/hold, decisions answer), DossierPage
  controls + pretriage line, ProjectPage "Needs you" gate cards + Decisions, phone `compact` variant.

## Test matrix
| AC | Tests |
|---|---|
| AC1 | api `triage-routes.test.ts`: row write w/ actor+rationale; reversible update; frozen→409; move-link fields present. `disposition.test.ts`: reason/adapted carried; freeze. |
| AC2 | `triage.test.ts`: merge user-wins; pretriage ledger actor:user. api: revise createRun seeds inputs+guidance. serialize→bytes contain `"actor":"user"`. |
| AC3 | `gate-overlay.test.ts` response_ledger case: resolveGate edits → overlay bytes carry actor:user; hydration overlays. |
| AC4 | `gate-card.test.ts`: presenceTimer only auto-proceed+deadline; wait kinds never. api activity route already covered by P0.10 — assert view mapping + DOM. |
| AC5 | `disposition.test.ts` + api 422s; DOM reason chips optional. |
| AC6 | DOM tests (`triage-surfaces.test.tsx`): compact GateCard = approve/wait/stop; compact controls = 5 verbs + note; no bulk action. |

## Progress
- Phase 0–1 done: reconnaissance complete; plan + matrix recorded.
- Resumed mid-run (prior worker left substantial uncommitted work): critically re-read every touched
  file, fixed review findings (below), then ran the full verification.
- Phase 2–4 done: implementation complete, self-review (2 passes) done, gap table below all met.
- Phase 5 done: full suite + green gate re-run after the last fixes (see Evidence log).

## Gap table

| # | Requirement / AC / invariant | Status | Evidence |
|---|---|---|---|
| D1 | Five-verb disposition UI: accept/adapt/rebut/defer/escalate; rationale only rebut/escalate; defer prefill "Not this round"; adapt editable suggestion; reason chips optional; reversible pre-freeze | met | `packages/ui/src/dispositions.tsx` (`DispositionControls`); `disposition.test.ts`; `triage-surfaces.test.tsx` (22 DOM tests); api `triage-routes.test.ts` reversible-write test |
| D2 | Approve-triage card: ledger as UI, escalations pinned first, primary "Approve proposals", per-row `actor:"user"` overrides → P0.10 overlay, wait default + per-project 24-h opt-in | met | `gate-card.tsx` `TriageLedger` + `findings-core/triage.ts` `triageTier` sort; api `mergedTriageLedger` → `resolveGate` edits (`triage-routes.test.ts` AC2/AC3 test); `approvalOverridesSchema` PUT route + project-page opt-in checkbox (`triage-surfaces.test.ts`) |
| D3 | One generic gate card for all beta kinds: artifact, deadline/"waiting for you", do-nothing, spend, actions, countdown/pause, presence timer, standing-guidance checkbox | met | `findings-core/gate-card.ts` `buildGateCard` + `gateViewFromRow`; `ui/gate-card.tsx`; `triage-surfaces.test.tsx` per-kind anatomy tests |
| D4 | Phone-width: approve/wait/stop + five verbs + note, same components, no bulk | met | `gateCardActions("phone")`; `compact` variants; `triage-surfaces.test.tsx` "phone-width offers Approve / Wait for me / Stop only"; web `triage-surfaces.test.ts` compact tests |
| D5 | Minimal Decisions list: escalations, horizon arrivals, stall escalations | met | `findings-core/decisions.ts` `buildDecisionsList`; `ui/decisions.tsx`; api decisions routes; `decisions.test.ts`, api + web tests |
| AC1 | Disposition rows write ledger entries w/ actor+rationale; frozen at delivery; forward move-link interface | met | api write persists `by_actor:{user}` + rationale (`triage-routes.test.ts` AC1); `mirror/delivery.ts` freezes + `response_id`-links on response delivery (`delivery.test.ts` 2 tests); `move_ordinal`/`moveId`/`moveOrdinal` interface in DB+schemas |
| AC2 | Pre-triage reaches Revise as highest-precedence guidance; never overridden | met | `run-routes.ts` seeds `inputs.pretriage` (response-ledger sidecar, `actor:"user"`) + run-scope guidance "authoritative"; `mergeTriageProposals` user-wins (`triage.test.ts`) |
| AC3 | Approve-triage overrides serialize into the response-ledger file Revise reads | met | `mergedTriageLedger` + P0.10 `resolveGate` `edits` → `overlayVersionIds` (api test "merges user rows over the agent's ledger") |
| AC4 | Presence timer 10-min only for auto-proceed + focused + unread; wait-default never shows it | met | `buildGateCard` gates `presence.active` on `autoProceed && presenceDeadlineAt && !held`; `recordGateActivity` (P0.10) arms only auto-proceed; DOM + api tests; `gateViewFromRow` emits `presenceTimer` only for auto-proceed |
| AC5 | Reason codes optional everywhere; text required only rebut/escalate | met | `RATIONALE_REQUIRED=["rebut","escalate"]`; `reason_code` nullable col (migration 0018) + optional schema fields; 422 tests |
| AC6 | 375px: approve/wait/stop + all five verbs with a note, shared components, no bulk | met | `compact` props end-to-end; DOM tests (phone); no bulk control exists |
| INV | findings-core framework-free (no React) | met | `no-react.test.ts` + eslint override (PRB.04) |
| INV | `@rhema/*` imports only; `.js` relative; explicit deps/refs | met | `apps/api` package.json + tsconfig reference added; turbo build/typecheck green |
| INV | Approvals are cards, never blocking modals | met | all surfaces are `<form>`-based cards |
| INV | User edits reach the files the next phase reads (REQ-SPEC-9) | met | overlay write-back to the response-ledger artifact + `inputs.pretriage` |
| INV | Canonical vocabulary; harness never "Claude Code"; no marketing/efficacy claims (G2 deferred) | met | `copy.test.ts`/vocab-lint green; no marketing surface added |
| OOS | No triage-mode queue chrome/J-K, Margin, clustering, bulk-preview, Apply UI, email gates, plan/scope field editing | met (absent) | grep: no keydown/bulk/apply controls in new UI |

### Gaps found during this run's review (all closed)
- Tenant isolation: project-scoped triage/decisions/gates routes lacked an explicit workspace check
  (convention: explicit `workspace_id` filter; RLS is the live backstop) → added `ownProject` + a
  workspace filter on the finding join + a cross-workspace 404 regression test.
- A gate-row per-finding override's validation bounce (`?derror=`) re-rendered `/p/:slug` but never
  displayed the error → wired `triage.dispositionError` through the project page to the row's controls.
- `mergedTriageLedger` originally read the project's latest review regardless of the gate's run context
  → now threads the gate/run `inputs.correspondenceId` hint (same source `loadTriageRows` uses).
- `POST decisions` accepted any answer → now validated against the row's `options` (422 otherwise).
- `GET decisions` returned raw rows → now uses the shared `buildDecisionsList` projection.
- Gate DTO lacked the artifact title (§6.4 item 1) → added from `artifacts.mirror_path`.
- Unknown gate actions reached `resolveGate` → `GATE_DECIDE_ACTIONS` 422 gate added.
- api-client `RecordDispositionDto` mismatched the api body (dead `deferUntil`, wrong field types) →
  aligned; dead `deferUntil` dropped from both sides.
- `protocols_version` drift after the `md-twins` actor field → recomputed (`0.4.0+dc5d506f645f4c2d`),
  `upstream-diff` OK.
- Duplicated ledger-entry builder in the api → uses `dispositionToLedgerEntry` from findings-core.

## Evidence log
- `npx vitest run` targeted (findings-core, ui, mirror delivery, protocols roundtrip, api triage-routes,
  web triage-surfaces): **188 pass** (then api file re-run after tenant fix: 14/14).
- `pnpm turbo build lint typecheck` → **108/108** tasks green (twice: before and after review fixes).
- `pnpm test` (full suite) → **1626 passed / 2 skipped / 231 files**.
- `pnpm check:protocol-markers` → OK (39 files scanned). `node scripts/compute-protocols-version.mjs
  --write` applied; `check-upstream-diff` OK (16 ported files reconcile; only sanctioned edits).
- `pnpm check:licenses` → pre-existing `duck`/`pako` base-lockfile failure; this change adds zero
  third-party deps (only the `@rhema/findings-core` workspace link in apps/api).
- Live verification: NOT RUN — live legs are not permitted for this ticket (deterministic-only per
  operator); the live binding is deferred (D-PRB.05-1).

## Evidence report

**What landed.** The deciding half of the review: the five-verb disposition write (§5.7) through
`findings-core` validation into `dispositions` rows (`by_actor: user`, optional `reason_code` —
migration 0018), reversible until delivery freeze (`mirror/delivery.ts` freezes + `response_id`-links
open rows on a `response` correspondence; `move_ordinal` is the forward move-link interface PRB.06
fills). `DispositionControls`/`GateCard`/`TriageLedger`/`DecisionsList` in `@rhema/ui` render the same
model `@rhema/findings-core` builds — `compact` = the §10.1 phone set (approve/wait/stop; five verbs +
a note; no bulk). The Approve-triage card's per-row overrides merge user-first over the agent ledger
and serialize through P0.10's overlay write-back (`resolveGate` edits → `overlayVersionIds`); the gate
waits by default with the per-project 24-h opt-in (`approval_overrides`, schema-validated). Revise run
creation seeds `inputs.pretriage` (the `actor:"user"` response-ledger sidecar) + a run-scope
"authoritative" guidance record (REQ-IDE-28). The Decisions list (beta Inbox stand-in) serves
escalations/horizon arrivals/stall escalations from open `decision_requests`. Web SSR wires all of it:
dossier disposition forms, the `/p/:slug` Needs-you cards + Decisions + opt-in checkbox, gate
decide/activity POSTs, the Revise sheet's "you pre-triaged N of M".

**Verification.** turbo 108/108; full suite 1626 pass/2 skip; targeted 188 incl. the 14 api route tests
(PGlite, real tx paths) and 35 DOM/route tests for the surfaces; protocol markers OK; licenses =
pre-existing base failure only. Self-review + gap analysis closed 9 real findings (incl. a
cross-workspace tenancy hole on the new project-scoped routes — now explicit-checked + regression-tested).
No live/deploy legs run (not permitted); D-PRB.05-1 records the live binding + `finding.disposed` sink.

**Deviations:** none from the spec. Out-of-scope items (queue chrome/J-K, Margin, clustering,
bulk-with-one-preview, Apply, email gates, P1.9 field editing) are absent by construction.
