# ADR-085: Mechanism A — a bounded, separately-metered pre-delivery backfill re-entry (never the research budget, never the RES.1 floor)

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CITE.1
- **Requirement ids:** REQ-VIS-9; REQ-SPEC-31 (non-regression)
- **Spec:** §8.4, §12.7, §12.8(c); ADR-006 (Path B residual); ADR-026 (RES.1 floor), ADR-084

## Context

The ticket offers three mechanisms to make Path B's strip rare:
**A** — an in-phase re-entry (a bounded "fetch these missed citations" instruction before the phase
commits); **B** — a harness-driven pre-delivery backfill through the run's proxy credential with a
cheap support check; **C** — discipline only (runspec/skill text, no mechanism).

The anchor audit showed the dominant pre-CITE.1 miss classes were *parity defects* (ADR-083), not
genuine unretrieved citations — but a residual class (`trulyUnretrieved`) remains: the model cites a
URL it never fetched, discovered only when the committed claim ledger meets the fetch log. Waiting
until delivery to learn that is too late to do anything but strip.

Mechanism B fetches blind: it would spend proxy fetches on URLs whose content nothing then feeds back
to the model, and its "support check" adds a second model call. Mechanism C is a prompt hope with no
enforcement and no measurement.

## Decision

**Mechanism A, bounded: one server-side checked re-entry inside the final phase, stamped `backfill`.**

1. **The check is server-truth, not pod-trust.** The pod calls
   `GET /internal/runs/:id/retrieved-urls` (token-authed, run-fenced): the API returns the run's
   retrieved set — `fetch_log` `kind in ('fetch','search')` allow'd rows, canonicalized with the
   SAME `@rhema/contracts` `normalizeUrl` the delivery guard applies (ADR-083). The harness computes
   `cited ∖ retrieved` on the COMMITTED phase output's claim ledger — identical identity to
   `validateCitedFetched`.
2. **At most one re-entry, fetch-only.** If misses exist, the same spec re-runs once with
   `phaseClass: "backfill"` and guidance naming the missed canonical URLs ("fetch each of these
   URLs now — one call per URL, no searching; do not modify any dossier files"). Its outputs are
   discarded — the delivered dossier is the committed one; the re-entry exists ONLY to land the
   fetch rows. A crashed/failed re-entry delivers anyway (Path B stays the residual — never a
   regression).
3. **A dedicated allowance, never the research envelope.** `backfillFetchBudget = min(fetchBudget,
   24)` authored per run (`CITE_BACKFILL_FETCH_ALLOWANCE`), a SEPARATE budget line from `fetchBudget`
   and never drawable from the `fetchFloor` share. The proxy admits a `backfill`-stamped request
   against `backfillFetchBudget − backfillUsed` (the tracker's dedicated counter), grants NO
   `web_search` tool (backfill never discovers), and honors an explicit `fetch:false` policy — the
   mechanism never widens what the run forbids.
4. **`backfill` is a phase class end-to-end** (migration 0056 `fetch_log.phase_class` +
   `usage_records.phase_class`). Every backfill fetch is metered to the run on the row of record —
   ECON.2 reads `phase_class='backfill'` for the mechanism-cost delta — but settles on the tracker's
   dedicated counter so it can never consume the RES.1 floor or the research bound.
5. **Forced-Unverified test runs get `backfillFetchBudget: 0`** (alongside the zeroed budgets/floors)
   — a `force_unverified` fixture cannot rescue its coverage through the mechanism; non-verification
   workflows author `backfillFetchBudget: 0` since they never stamp the class.
6. **Best-effort seam.** An unbound/unreachable retrieved-urls route or a crashed re-entry degrades
   to the pre-CITE.1 outcome (the strip), never a delivery failure.

## Consequences

- The cited⇒retrieved gap is closed *inside* the run with the agent's own fetch tool, on evidence the
  server recomputes — the strip becomes the residual for genuinely unretrievable URLs.
- The mechanism is bounded in three independent places: one re-entry per run, a per-call `max_uses`
  clamp, and the dedicated allowance exhausted-and-dropped.
- RES.1's floor is structurally protected: backfill traffic is a separate budget line and a separate
  tracker counter — it cannot spend the reserved share, and it cannot be charged against it either.
- The mechanism costs real money, separately visible — `usage_records.phase_class='backfill'` is the
  ECON.2 attribution join.

## Alternatives considered

- **Mechanism B (in-run pre-delivery backfill through the proxy credential + support check)** —
  rejected: it spends fetches the model never consumes, needs a second model call to decide, and
  runs at the delivery boundary where a failure is least recoverable. Its one advantage (no re-entry
  of a phase) is outweighed by mechanism A reusing the phase's own fetch tool with the missed URLs
  in context.
- **Mechanism C (discipline only)** — rejected: unenforced, unmeasured — exactly the posture that
  let the strip go unmeasured until now.
- **Re-enter EVERY phase with cited ledgers, not just the final one** — rejected for now: the Review
  manifest produces the claim ledger in the final phase; revisiting earlier phases' ledgers is a
  per-manifest decision the baseline evidence didn't require.

## Revisit trigger

Reopen if the Stage-B measured rate shows `trulyUnretrieved` misses persisting despite a successful
re-entry (model declining to fetch — a mechanism-B support check may then be worth the second call),
or if the 24-fetch ceiling proves mis-sized in either direction on production evidence.
