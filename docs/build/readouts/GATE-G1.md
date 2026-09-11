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
- **Operator disposition:** _(none recorded — G1 has not been read out; the disposition lands here and in
  `docs/build/LEDGER.md` GATE DECISIONS when taken.)_
