<!--
  docs/build/readouts/GATE-G1.md (BM-INDEX-03) — append-only gate readout. Seeded by MAINT.1 as the committed
  home for the G1 disposition (replacing the retired .agents/scratch pointer). The operator's disposition is
  recorded here and in docs/build/LEDGER.md GATE DECISIONS when G1 is read out. Do NOT write the verdict token
  the validator reserves for a cleared gate unless the gate is genuinely cleared with no OPEN Phase-0 rows.
-->
# GATE-G1 — Phase-0 exit — readout

- **Criterion:** spec §17 Phase-0 row (quoted verbatim in `docs/tickets/00_MANIFEST.md § Milestone gates` and
  `docs/tickets/16a_GATE-G1__phase0-exit.md`): three real-project Reviews end-to-end in `dev` with
  `boundary.attested violations = 0`, `cited ⇒ fetched` green against the proxy log, every sidecar
  `parseStatus = ok`, a gate edit round-tripping through the serializer, proxy-metered cost = SDK cost ± 2%,
  and the §18 evaluation pilot wave run on the dev set with σ_d estimated and n fixed.
- **Verdict: NOT PASSABLE — pending (as of 2026-09-10).** The exit criterion is not yet met.
- **Per-item status (from `docs/phase0-exit-readout.md` + the run ledgers):**
  - Deterministic composition + pilot wave: **met** (proven in the FakeEngine integration suite, `P0.15`).
  - Live pipeline end-to-end: **proven** — agent launch → all six required phases → harvest → deliver path,
    with real proxy-logged server-side web research (`P0.15h`, `P0.15i`; `searches > 0`, ~190 fetch rows).
  - `cited ⇒ fetched` delivery: **not met** — the fact-check still cites authoritative URLs from training
    knowledge it did not retrieve this session (`D-P0.15i-2` → `16_P0.15j`).
  - Three-project Reviews + instrumented-cost runs + the readout rewrite with measured values: **owed**
    (`D-P0.15-1`, `D-P0.15-2` → `16_P0.15k`; operator-gated, paid inference).
- **What would clear it:** `16_P0.15j` (citation discipline) then `16_P0.15k` (the live G1 legs) reporting green,
  with no OPEN Phase-0-scoped DEFERRALS row remaining (DEFERRALS rule 4).
- **Operator disposition:** _(superseded — see the 2026-09-15 update below.)_

---

## Update — 2026-09-15 (after P0.15k Stage B ran live; PR #28)

**The core §17 criterion is now MET live.** All three real-project Reviews (`proj_pv`/`proj_sd`/`proj_cr`)
delivered green on `dev` with real inference — `assessPhase0ExitForRun` clean on each (`boundary.violations=0`,
sidecars validated at delivery, `cited⇒fetched` 0-miss on 22/36/26 cited URLs, one `correspondence_items` row
each); provision ~20–23 s (< 45 s SLO). This is the leg that held G1 for ~10 sessions.

### §17 item-by-item (measured)
- Three-project Reviews deliver, `boundary violations = 0`: **MET** ✓
- `cited ⇒ fetched` green: **MET** ✓ — via the operator's **Path B** ruling ([[ADR-006]]): the fetch-then-cite
  discipline did not converge live (a review fetched 224 URLs but still cited 18 from training knowledge), so
  delivery strips unfetched citations + downgrades the claim rather than hard-failing; `validateCitedFetched`
  unchanged. Caveat: most claims land `unverifiable` — the citation-completeness follow-up (ADR-006 revisit
  trigger: a delivery-time backfill) is queued; §16.4 marketing claims should await it.
- Every sidecar `parseStatus = ok`: **MET** ✓ (validated at delivery; a failed sidecar hard-fails delivery).
- Start-latency p95 (queued→running) ≤ 45 s: **MET** ✓ (~20–23 s measured — a D-P0.15-5 data point).
- Gate edit round-trips through the serializer into the next phase's file: **PARTIAL** — gate *resolution*
  proven live on all 3 reviews; the structured *edit→file* leg not driven live (D-P0.15-3 / D-P0.15k-2).
- proxy-metered cost = SDK cost ± 2%: **not comparable** — `sdk_estimate` rows not populated live (D-P0.08-2).
- §18 evaluation pilot wave (σ_d, n fixed): **machinery met** deterministically; the real-variance live pilot
  rides H2/G2 (the benchmark corpus), not this ticket.

### Disposition (operator, 2026-09-15)
**Core criterion MET; formal clear (the reserved verdict token) DEFERRED pending a Phase-0 deferrals
reconciliation.** The operator accepts the narrow remaining legs — D-P0.15-2/-3, D-P0.15k-1/-2, D-P0.08-2 — as
tracked post-Phase-0 follow-ups (none is the review pipeline). Per DEFERRALS rule 4 + the build-memory
validator, a formal G1 clear must have **no OPEN row referencing G1**; several OPEN P0.x rows that the live runs
now satisfy have not yet been reconciled/closed. So the honest state is **G1 core-ready, formal clear pending
the reconciliation** (a `reconcile-build` pass: close the live-proven P0.x deferrals, disposition the narrow
remainder). Only then is the verdict token written here.

---

## Disposition — 2026-09-15 (reconciled): **PASSED, with accepted exceptions**

The Phase-0 deferrals reconciliation is done (see `docs/tickets/DEFERRALS.md` § "Reconciliation — G1 clear"):
the live P0.15k Stage B (the three green Reviews + the full `dev` deploy) closed the live-deploy/agent/proxy/
mirror/orchestrator rows; the §18-eval rows are scoped to GATE **G2** (not G1); the beta/IDE/CI/ops rows are
scoped to their later phases. No OPEN DEFERRALS row references the literal `GATE-G1`.

**Verdict: PASSED** — the §17 Phase-0 exit criterion is met: a Review of each of the three real projects delivers
green on `dev` (`boundary.attested violations = 0`, `cited⇒fetched` green, every sidecar `parseStatus = ok`),
start-latency p95 well under the 45 s SLO, and the §18 pilot-wave clause met deterministically (FakeEngine).

**Accepted exceptions (operator, 2026-09-15) — tracked post-Phase-0 follow-ups, none is the review pipeline:**
- **D-P0.15-2 / D-P0.08-2** — proxy-metered = SDK cost ± 2% is *not comparable* live (no `sdk_estimate` rows);
  the estimator fold is proven live for review + fact_check, owed for revise/profile_voice (**D-P0.15k-1**).
- **D-P0.15-3 / D-P0.15k-2** — the live *structured* gate-EDIT round-trip (gate *resolution* is proven live).

**Standing consequence (§16.4):** the §1.4/§15.1 marketing claims do NOT ship until the citation-completeness
follow-up lands — under Path B (ADR-006) reviews currently deliver with many `unverifiable` verdicts. This is
acceptable for a Phase-0 *exit* (the pipeline is proven end-to-end) but is a release-gating caveat.

**Consequence:** Phase 0 is exited. The forward chain is **H2 (benchmark corpus) → G2 (wave-1 LIFT)**, which
gates all Phase-B UI (`17_PRB.01`+). The two accepted-exception legs + the citation-completeness follow-up are
tracked in DEFERRALS.
