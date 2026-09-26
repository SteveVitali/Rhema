# PRB.05 — Triage, dispositions, reason codes, gate cards

**Spec:** `docs/tickets/21_PRB.05__triage-dispositions-gate-cards.md` (§5.7 dispositions, §6.4 gate-card
anatomy, §10.1/§10.3 phone-width, REQ-IDE-27/28, REQ-WF-9/10, REQ-SPEC-18/20, REQ-BETA-6)
· **Base:** `stevevitali/prb-04-findings-core-and-dossier` · **Stacked PR — do not merge (mergePolicy=OPERATOR).**

## Summary

The deciding half of the review. The five-verb disposition write (§5.7) now flows from shared,
framework-free rules in `@rhema/findings-core` through `@rhema/ui` form components and the api's
project-scoped routes into `dispositions` rows — reversible until delivery freezes the ledger and
links each row forward to its response. The §6.4 gate card is one generic component covering every
beta gate kind, the Approve-triage card renders the response ledger itself (escalations pinned,
per-row `actor:"user"` overrides serialized back through P0.10's overlay flow, wait-by-default with
the per-project 24-h opt-in), and a minimal Decisions list serves escalations, obligation-horizon
arrivals, and stall escalations. Every surface works at phone width from the same components and
contracts (REQ-SPEC-20).

## What changed

- **`@rhema/contracts`** — `reasonCode` on `dispositionSchema` + `FindingView.disposition`
  (REQ-BETA-6); `actor: "user" | "drafter"` on `responseLedgerEntrySchema.disposition` (REQ-SPEC-9);
  `adaptedText`/`reasonCode` on `FindingView.disposition`; `GateView.presenceTimer`.
- **`@rhema/db`** — migration 0018: additive nullable `dispositions.reason_code`.
- **`@rhema/findings-core`** (framework-free, no React) — `triage.ts` (escalation-first triage order,
  `buildTriageQueue`, `pretriageSummary`, `dispositionToLedgerEntry`/`buildPretriageLedger`,
  `mergeTriageProposals` user-wins); `gate-card.ts` (`buildGateCard`/`gateViewFromRow`: do-nothing
  outcome, spend, phone action set, presence timer emitted ONLY for auto-proceed + server-set
  presence deadline); `decisions.ts` (`buildDecisionsList` open-rows projection); disposition state
  gains `adaptedText`/`reasonCode`; `buildFindingView` carries them.
- **`@rhema/ui`** — `DispositionControls` (five verbs + note + optional reason chips + editable adapt
  suggestion; `compact` stacks for phone), `GateCard` (artifact, deadline/"waiting for you",
  do-nothing, spend, actions, countdown + paused note, standing-guidance checkbox, presence-ping
  script only on auto-proceed cards), `TriageLedger` (the approve_triage row list), `DecisionsList`;
  `FindingsList.controlsFor` slot rendered only when `canDispose`.
- **`@rhema/protocols`** — `md-twins` renders/parses `disposition.actor` (response-ledger twin);
  `protocols_version` recomputed (`0.4.0+dc5d506f645f4c2d`), upstream-diff OK.
- **`@rhema/mirror`** — `runDeliveryTransaction` freezes + `response_id`-links open dispositions when
  a `response` correspondence delivers (§5.7 freeze-at-delivery).
- **`apps/api`** — `triage-routes.ts`: `POST …/findings/:fid/disposition` (validate → upsert-until-
  freeze → obligation routing via `@rhema/obligations` → optional `finding.disposed` emit);
  `GET/POST …/decisions` (open rows; answers validated against the row's options); `GET …/gates`
  (card DTOs + artifact title + approve_triage ledger rows merged user-over-agent);
  `POST …/gates/:gid/decide` (hold on wait; `approve_triage` merges the human's rows into the
  response-ledger write-back overlay via P0.10 `resolveGate` edits); `POST …/gates/:gid/activity`;
  `GET/PUT …/approval-overrides` (schema-validated; the approve_triage 24-h opt-in);
  `GET …/pretriage`. `run-routes.ts` seeds Revise runs with `inputs.pretriage` (the `actor:"user"`
  response-ledger sidecar) + a run-scope guidance record stating user rows are authoritative
  (REQ-IDE-28). All project-scoped routes enforce an explicit workspace check (RLS is the live
  backstop).
- **`@rhema/api-client`** — typed DTOs + methods for all of the above.
- **`apps/web`** — dossier disposition controls (error + saved round-trips, frozen 409 notice);
  the `/p/:slug` Needs-you surface (gate cards + Decisions + the 24-h opt-in checkbox); gate
  decide/activity POSTs; project-scoped disposition POST for gate-row overrides (with a visible
  `derror` bounce); the Revise sheet's "you pre-triaged N of M" line; `COPY.triage/.gates/.decisions`
  (vocab-lint-clean — the `wrong` chip reads "Incorrect" per Appendix D.2).

## Design decisions

- **One model, two densities.** `buildGateCard`/`DispositionControls`/`DecisionsList` take `compact`;
  the shell sniffs the request and renders the §10.1 input set — same contracts, same components, no
  phone fork (REQ-SPEC-20). No bulk action exists anywhere.
- **User rows are authoritative by construction.** User dispositions serialize as
  `actor:"user"` ledger entries; `mergeTriageProposals` makes a user row always win over the agent's
  proposal for the same finding (REQ-WF-9); Revise receives them via `inputs.pretriage` plus a
  run-scope guidance record (REQ-IDE-28).
- **The presence timer is server-gated twice** (REQ-SPEC-18): the api arms `presence_deadline_at`
  only for auto-proceed gates (P0.10 `recordGateActivity`), and `buildGateCard`/`gateViewFromRow`
  refuse to emit a timer for anything else — wait-default cards render no script and can never arm.
- **Cards, never modals** — every decision surface is a plain `<form>`; the no-JS path round-trips
  422/409 back into the page with the error under the card.
- **Reason codes are telemetry** (REQ-BETA-6): persisted on the row (nullable `reason_code`) and
  emitted via the optional `emitDisposed` seam — never required, never in the response-ledger schema.

## Verification

- `pnpm turbo build lint typecheck` → **108/108** green.
- `pnpm test` → **1626 passed / 2 skipped** (231 files). Targeted: findings-core (incl. triage 9,
  gate-card 11, decisions 2, disposition), ui triage-surfaces 22, web triage-surfaces 13, api
  triage-routes 14 (PGlite, real tx paths), mirror delivery 10 (freeze + forward-link), protocols
  roundtrip 12 (`disposition.actor`).
- `pnpm check:protocol-markers` → OK. `check-upstream-diff` → OK.
- `pnpm check:licenses` → pre-existing `duck`/`pako` base-lockfile failure; this PR adds zero
  third-party deps (workspace links only).
- Live legs: **not run** (deterministic-only per operator; D-PRB.05-1 records the live binding +
  telemetry sink).

## Requirement IDs

REQ-IDE-16 (amended, card anatomy), REQ-IDE-27, REQ-IDE-28, REQ-GATE-2 (UI half), REQ-GATE-5 (triage
half), REQ-GATE-7, REQ-GATE-10 (capture UI), REQ-SPEC-18 (UI half), REQ-SPEC-20 (gate/disposition
half), REQ-WF-9, REQ-WF-10, REQ-BETA-6, REQ-PROD-4, REQ-SPEC-9, REQ-OBJ-2/3/5/7/8.

## Acceptance criteria → evidence

| AC | Status | Evidence |
|---|---|---|
| AC1 — dispositions write ledger entries w/ actor/rationale; frozen at delivery; forward move-link interface | ✅ met | api `triage-routes.test.ts` (actor `{user}` + rationale persisted; frozen → 409); `mirror/delivery.test.ts` (response delivery freezes + `response_id`-links; review does not); `move_ordinal` col + `moveOrdinal`/`moveId` schema fields assert the PRB.06 link interface |
| AC2 — pre-triage reaches Revise as highest-precedence guidance; never overridden | ✅ met | `run-routes.ts` `inputs.pretriage` sidecar (`actor:"user"`) + run-scope guidance; `mergeTriageProposals` user-wins (`triage.test.ts`) |
| AC3 — approve-triage overrides serialize into the response-ledger file Revise reads | ✅ met | `mergedTriageLedger` → `resolveGate` `edits` → `overlayVersionIds` (api test "approve_triage merges user rows over the agent's ledger into the response-ledger overlay") |
| AC4 — presence timer = 10-min countdown only for auto-proceed + focused + unread; wait-default never | ✅ met | `buildGateCard` presence gating + `gate-card.test.ts` (11); api activity test ("arms only on auto-proceed"); `gateViewFromRow` emits `presenceTimer` only for auto-proceed |
| AC5 — reason codes optional everywhere; text required only for rebut/escalate | ✅ met | `RATIONALE_REQUIRED` + 422 tests; optional chips DOM-tested; nullable `reason_code` (migration 0018) |
| AC6 — phone-width approve/wait/stop + five verbs + a note from same components; no bulk | ✅ met | `gateCardActions("phone")` + compact `DispositionControls`; `triage-surfaces.test.tsx` phone tests; web compact render tests |

## Deferrals

- **Opened:** D-PRB.05-1 — live triage-write path (delivered-review + Revise run on `dev`) +
  `finding.disposed` telemetry sink binding.
- **Closed:** none — no OPEN row is unblocked by this ticket (D-P0.10-1 reminders → PRB.09;
  D-P0.10-2 sweep is ops; D-PRB.04-1/-2 are the dossier live read/SSE legs).

## Notes

GATE G2 stays DEFERRED: no efficacy/marketing claims, no public pricing/signup. Approvals are cards
with deadlines, never blocking modals. Out-of-scope items (triage-mode queue chrome/J-K, Margin,
clustering, bulk-with-one-preview, Apply, email gate actions, P1.9 field editing) are absent by
construction.
