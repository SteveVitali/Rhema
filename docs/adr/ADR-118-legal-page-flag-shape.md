# ADR-118: The legal/trust pages' flag + placeholder shape — a contracts census of record, not JSX props

- **Status:** Accepted
- **Date:** 2026-10-21
- **Ticket:** R6LGL.1
- **Requirement ids:** REQ-LCH-1
- **Spec:** `docs/tickets/180_R6LGL.1__legal-trust-pages.md`; `docs/round-6-draft-spec.md`
  §4.2; LEDGER GATE DECISIONS `GD-LEGAL.R6`, `GD-LEGAL-DETAILS.R6`

## Context

R6LGL.1 ships the five public legal/trust documents (`/terms`, `/privacy`, `/refunds`,
`/acceptable-use`, `/contact`) whose text is **drafted** — the operator approves it verbatim
(HUMAN-H11) and GATE-LAUNCH requires `approved: true` on every page before launch. The ticket
explicitly owns the *shape* of that approval flag plus the placeholder scheme
(`GD-LEGAL-DETAILS.R6`: operating entity, governing-law jurisdiction, contact address are
unfilled slots until the operator records them), and two downstream consumers depend on it:

- **GATE-LAUNCH** reads "REQ-LCH-1 `approved: true` on every page" — a gate read needs a stable,
  machine-checkable location;
- **R6CNT.2** fills the placeholder slots with the operator's recorded values — a fill step
  needs stable slot names and a place the values land.

The shape also has to survive a correctness hazard the ticket names as an acceptance criterion:
a page must never ship `approved: true` while a `⟦KEY⟧` placeholder still renders — that
coupling must be a predicate a test can call, not a reviewer's memory.

## Decision

One committed table in `packages/contracts/src/legal.ts`:

- `LEGAL_PAGES` — one row per document: `routeId` (== its served path, `data-route`, and
  `SPA_PUBLIC_ROUTES` census entry), `title` (the `<title>`/`<h1>`/footer-label source of
  truth — `doc-meta.ts` reads it verbatim so the three can never drift), `navLabel`,
  **`approved`**, and `details` — the `LEGAL_DETAILS` keys the page's drafted text references.
- `LEGAL_DETAILS: Record<LegalDetailKey, string | null>` — the operator-fill slots
  (`OPERATING_ENTITY`, `GOVERNING_LAW`, `CONTACT_EMAIL`, `CONTACT_ADDRESS`); `null` ⇒ the page
  renders a `data-legal-placeholder` mark, a string ⇒ the approved value. R6CNT.2 fills these.
- `⟦KEY⟧` — the placeholder-token grammar inside `COPY.legal` strings
  (`LEGAL_PLACEHOLDER_RE`); `legal.tsx` substitutes filled values (`mailto:` for
  `CONTACT_EMAIL`) and marks unfilled slots.
- `legalApprovalViolations(pages)` — the shipped-set invariant: every `approved: true` row with
  an unfilled referenced detail is a violation. `apps/web/src/legal-pages.test.ts` +
  `contracts/legal.test.ts` pin it; the route handler reads the same table GATE-LAUNCH will.

Every row ships `approved: false` and every slot `null`. The census lives in **contracts**
(not copy.ts, not JSX): the flag is a shared product fact — consumed by the web renderer, the
route census, the gate readout, and R6CNT.2's fill — and contracts is where browser-safe shared
facts live.

## Consequences

- The approval flip is a one-line data change per page; the fill is `LEGAL_DETAILS[k] = "…"` —
  no JSX edits, no copy surgery.
- `approved:true` + any `null` referenced slot fails CI (`legalApprovalViolations` +
  rendered-mark counts), so a placeholder can never ride an approval into launch.
- `title`/`navLabel`/`routeId` single-sourcing means a title change can't desynchronize
  `<title>`, `<h1>`, and the footer link.
- Costs: two places hold "legal shape" (`LEGAL_PAGES` + `COPY.legal.<key>`) joined by
  `LEGAL_COPY_KEY` — the joined-by-name seam is pinned by tests (declared details == ⟦KEY⟧s
  referenced in the copy).

## Alternatives considered

- **`approved` as a field inside `COPY.legal`** — rejected: copy.ts is the user-facing string
  table linted for vocabulary; a gate-consumed flag is product state, not copy, and GATE-LAUNCH
  tooling shouldn't have to import the web app's copy table.
- **Per-page `approved` props on `LegalPage`** — rejected: five call sites for one shared
  decision; the flag would live in JSX where a gate read can't find it.
- **Placeholders as literal `TBD`/`…` strings without a census** — rejected: nothing could
  check "approved while placeholder remains" — the ticket's own AC requires the coupling to be
  machine-checkable.
- **Placeholders inside `LEGAL_PAGES` (copy in contracts)** — rejected: contracts is the
  vocabulary/facts package; drafted prose belongs in the web copy table the vocabulary lint
  covers.

## Revisit trigger

Reopen when (a) a legal document needs a *conditional* flag (approved for one audience,
draft for another) — the flat boolean is deliberately launch-scoped; (b) R6CNT.2 lands and a
`LEGAL_DETAILS` value turns out to need per-page variants rather than a global slot; or
(c) counsel requires versioning the approved text (an `approvedAt`/`approvedTextHash` field
would be the additive change).
