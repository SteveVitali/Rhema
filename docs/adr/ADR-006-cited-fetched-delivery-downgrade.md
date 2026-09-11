# ADR-006: `cited⇒fetched` is a per-claim delivery downgrade + strip (Path B), not a run-fatal reject — operator ruling

- **Status:** Accepted
- **Date:** 2026-09-11
- **Ticket:** P0.15k (implements the Path B that 16_P0.15j deferred pending this ruling); closes the semantics half of D-P0.15i-2
- **Requirement ids:** REQ-VIS-9 (cited⇒fetched), REQ-OBJ-18, §12.8(c) (verdict-source downgrade), §17 (Phase-0 exit)
- **Spec:** rhema-design-spec §12.8(c) (delivery validation), §11 (fact-check), §17 (exit criterion)

## Context

The §17 Phase-0 exit criterion requires a Review to DELIVER with `cited⇒fetched` green: every `claim.url` and
`claim.sources[].url` must appear in the run's proxy fetch log. `16_P0.15j` hardened the editorial-review skill
to a fetch-then-cite discipline and built the offline citation-fetch-compliance eval, but flagged (D-P0.15i-2)
that the discipline **might not converge live** and that a "Path B" — relaxing the strict cited⇒fetched delivery
semantics — needed an **explicit operator ruling** (it changes a REQ-VIS-9 invariant), not an autonomous change.

Live Stage B (P0.15k, 2026-09-11) confirmed the wall empirically: a full `second_read=false` Review of `proj_pv`
on `dev` ran all six phases and reached delivery with **224 distinct URLs actually fetched**, yet delivery still
threw `cited_not_fetched` — the fact-check cited **18** authoritative URLs (snopes, forbes, brookings,
scientificamerican, statista, deadline, epic.org, …) it emitted from **training knowledge** and never retrieved
this session. This reproduced across attempts and is model-behavior-invariant to budget: the model prefers to
cite well-known sources from memory over restricting citations to what it fetched. Under the strict semantics,
**no Review can DELIVER**, so G1 is unreachable.

The operator was presented the precise finding (18 misses, the specific URLs, ~$52 spent) and **ruled: relax
`cited⇒fetched`** (Path B).

## Decision

Give `cited⇒fetched` the **same treatment §12.8(c) already gives a suspicious verdict source: a per-claim
DOWNGRADE at commit, not a run-fatal reject.** In `runDeliveryTransaction` (`@rhema/mirror`):

- `validateCitedFetched` is **unchanged** — it still computes the misses (honoring P0.15j's "do NOT weaken
  `validateCitedFetched`"); the exit assessor (`assessPhase0ExitForRun`) and the offline eval keep reading it.
- An unfetched cited url is **stripped from the persisted ledger** (a deterministic backfill-by-removal): a
  claim's own unfetched `url` is nulled; an unfetched `claim_sources[].url` row is not persisted.
- Any claim that had a stripped citation has its verdict **downgraded to `unverifiable` + `source_check:
  'suspicious_source'`** (composed with the existing §12.8(c) downgrade).
- Delivery **proceeds**; `DeliveryResult.strippedCitations` counts the removals and the downgraded ordinals are
  reported (auditable). The delivered dossier therefore cites **only fetch-verified sources** — cited⇒fetched
  stays TRUE for what ships, so the §17 exit assessment (which re-reads the persisted rows) is green.

## Consequences

- A Review now DELIVERS even when the model cites unverifiable sources; those citations are removed and the
  affected claims are marked `unverifiable`, so the product never presents a citation it cannot prove was
  fetched. The strict "delivery fails on any unfetched citation" behavior is gone.
- **This weakens the shipped review's completeness**: a claim the model believed it could source loses that
  source and is downgraded, even when the source is real (the model just did not fetch it this session). The
  fetch-then-cite skill discipline (P0.15j) still matters — it minimizes strips — but is no longer load-bearing
  for delivery.
- The §17 exit assessment passes on the delivered rows because the persisted ledger is clean by construction;
  the honest reading is "the platform delivers only fetch-verified citations", not "the model cited only fetched
  sources." Reports/readouts must state the `strippedCitations` count so the relaxation is visible.
- `validateCitedFetched` and the offline compliance eval are untouched, so a future re-tightening (or a stronger
  model / real backfill) is a delivery-policy change only.

## Alternatives considered

- **Keep strict (hard-fail) + fix the model.** Rejected by the live evidence: the discipline does not converge
  (18 misses persisted), so G1 would stay unreachable. Skill hardening (P0.15j) already did what it could.
- **Server-side backfill by FETCHING the cited-but-unfetched urls through the proxy at delivery.** The most
  provenance-preserving Path B (the citations become genuinely fetched), but the delivery runs in the api, which
  is not a sandbox client and cannot use the run's proxy credential; a resolving fetch would also have to handle
  404/paywalled/hallucinated urls. Deferred as a heavier future option; removal is the deterministic, buildable
  form the operator's ruling enables now.
- **Keep the unfetched citations, just don't hard-fail (deliver as-is + flag).** Rejected: the exit assessor
  re-reads the persisted rows, so keeping them would leave `citedFetched.ok=false` — forcing us to ALSO weaken
  the §17 exit criterion / the assessor, a larger and less honest change than stripping.

## Revisit trigger

Reopen when either (a) a production-quality fact-check reliably cites only retrieved sources (re-tighten to
hard-fail, or lower the acceptable `strippedCitations` to 0), or (b) a delivery-time proxy backfill is built so
cited-but-unfetched urls are actually fetched (real provenance) rather than removed. Any change here is a
delivery-policy change; `validateCitedFetched` stays the invariant's definition.
