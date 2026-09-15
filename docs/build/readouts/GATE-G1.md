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
