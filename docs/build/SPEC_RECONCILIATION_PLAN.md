<!--
  docs/build/SPEC_RECONCILIATION_PLAN.md — REC.2 deliverable 2 (reconcile-build mode=spec, BM-RECON-02).
  The amendments that fold landed reality back into docs/rhema-design-spec.md.
  Rules: requirement ids are APPEND-ONLY (a fold-back gets a new id in its family, never a renumber;
  REQ-SPEC-23/26/28 stay reserved per ADR-098). An amendment is APPLIED only where its box is ticked
  — a tick is an operator GATE DECISIONS row or an explicit operator approval. The spec is not
  generated (no docs/spec_src/ + BUILD.sh exists), so amendments edit docs/rhema-design-spec.md
  directly; every applied amendment gets a manifest "## Spec amendments applied" line and an ADR.
  Reconciliation date: 2026-10-04.
-->

# Spec reconciliation plan

Evidence: `docs/build/TICKET_VS_SPEC.md` (per-ticket tags) · `docs/build/BUILD_INDEX.md` ·
`docs/tickets/00_MANIFEST.md` (REQ index + amendment log) · `docs/adr/` (ADR-001…105) ·
LEDGER GATE DECISIONS.

## 1. Fold-ins already carried by the spec (verified — no action)

| Fold-in (per the REC.2 contract) | Where the spec carries it |
|---|---|
| H3 deferred in part — open self-serve paid launch (ADR-008) | §17 amendment banner (2026-09-16) + Appendix A.13 note + REQ-BETA-19 row marker; manifest line exists |
| Round-3 amendments — REQ-SPEC-29…32 added; REQ-SPEC-8 / REQ-IDE-13 / REQ-SPEC-1 / REQ-GROWTH-1 amended | Appendix A.9 rows + the "Amended 2026-09-30" A.9 note; banners at §11.4/§12.8/§13.5/§14.1/§14.3; Appendix D.2 *Unverified*; manifest line exists |
| REQ-VIS-9 note reconciled through ADR-006 Path B | A.2 REQ-VIS-9 row marker + the A.9 note (2026-09-30) |
| ADR-014's supersession of D-PRB.16-5 | A.9 note bullet "§14.1 / §14.4 restated (REQ-SPEC-32(a)) … the D-PRB.16-5 practice … is superseded (ADR-014)" |
| Interim trial terms in force (ADR-014); restore condition defined, not met | §14.3 banner + REQ-SPEC-8 amended text in the A.9 note; the 2026-10-04 measured restore eval (NOT MET) is proposed as a datapoint note — A-4 below |

## 2. Amendments APPLIED this run (ticked — each tick is a pre-existing operator GATE DECISIONS row)

### [x] R-1 — the G2 deferral recorded in §17 (decision 2026-09-15; fold-back applied 2026-10-04)

- **Tick:** LEDGER GATE DECISIONS 2026-09-15 (`16c_GATE-G2` — "DEFERRED (operator decision) — proceed to
  Phase-B implementation now … deliberate override of §17/REQ-EVAL-15 'no UI spend beyond Phase 0 until G2'").
- **Target:** `docs/rhema-design-spec.md` (no `spec_src/` — the spec is a direct source file).
- **Anchor:** §17 Roadmap, the phase table — immediately after it, before the 2026-09-16 banner (the
  benchmark row's "the lift gate read before any UI spend beyond Phase 0" is the text the override suspends).
- **Before:** *(the row text stands verbatim — banners are append-only)* — no banner recorded the deferral.
- **After:** new `> **⚑ Amendment — 2026-09-15 …` banner: the wave-1/LIFT gate is DEFERRED — Phase-B UI
  proceeded without the eval; G2+H2 stay a HARD gate before public launch; no §16.4 marketing/efficacy claim
  ships until LIFT is met (REQ-EVAL-19); REQ-EVAL-16's consequences apply retroactively to UI built meanwhile
  if a later wave fails. Plus a `2026-10-04` entry in the status line naming both fold-backs.
- **Manifest line:** yes (§ Spec amendments applied). **ADR:** ADR-104.

### [x] R-2 — the early G3 read recorded in §17 + Appendix A.13 (decision 2026-09-23; fold-back applied 2026-10-04)

- **Tick:** LEDGER GATE DECISIONS 2026-09-23 (`28b_GATE-G3` — "PROCEED (operator decision — deliberate
  override of REQ-BETA-18's window)" with the recorded caveat: zero partner data; the $7–10/review vs $20/mo
  WTP finding would itself have been a pivot signal).
- **Target:** `docs/rhema-design-spec.md`.
- **Anchors:** (a) §17 — an addendum banner appended after the 2026-09-16 banner (which says G3 "reads on
  whatever real-world usage exists by then" — the read happened one week later); (b) Appendix A.13 — the
  REQ-BETA-18 row gains an amended marker and the post-table note gains a dated addendum.
- **Before:** §17 + A.13 recorded G3 *deferred and still to be read*; nothing recorded the 2026-09-23 read.
- **After:** the addendum records: G3 was **read early on operator evidence → PROCEED**; the
  ≥90-day/≥15-partner window was skipped entirely; evidence = the live prod platform end-to-end + a delivered
  in-cap Review + the measured cost structure; caveat = zero partner behavioral data, thresholds never
  evaluated (recorded, accepted); the full-IDE bodies (rows 29–50) unblocked.
- **Manifest line:** yes. **ADR:** ADR-105.

### [x] R-3 — manifest amendment-log retro line for the 2026-09-17 domain + database amendments

- **Tick:** the spec already carries the amendment (status line + §13.1/§13.3 banners + ADR-010); the
  manifest's `## Spec amendments applied` log — the contract's own index of applied amendments — lacks its
  line. This closes the bookkeeping gap; **no spec text changes**.
- **Target:** `docs/tickets/00_MANIFEST.md § Spec amendments applied`.
- **After:** a dated retro entry (marked *(retro: applied 2026-09-17 — spec banners already carried it;
  manifest line backfilled by REC.2)*) citing §13.1/§13.3 banners and ADR-010.
- **ADR:** none new (ADR-010 is the decision's record).

## 3. Proposed amendments — UNTICKED (operator tick is a GATE DECISIONS row or a later round; nothing applied)

Each row: target = `docs/rhema-design-spec.md` unless noted. Id families are append-only; the next free
ids are used (REQ-VIS-12, REQ-SPEC-33, REQ-SPEC-34 — REQ-SPEC-23/26/28 remain reserved per ADR-098).

### [ ] A-1 — REQ-VIS-12 (new): citation completeness is a measured, persisted rate; a bounded pre-delivery backfill exists

- **Landed reality:** CITE.1 (PR #104) shipped `runs.citation_completeness` + a
  `citation_completeness_daily` rollup + `run.citation_completeness` event (a reported signal, not an SLO)
  and a bounded pre-delivery backfill (`phase_class='backfill'`, budget `min(fetchBudget,24)`, one re-entry,
  never the REQ-SPEC-31 floor, `force_unverified`→0), on canonical cited⇒retrieved URL identity with
  search-row retrieval parity (ADR-083…086; baseline measured on prod: legacy byte-join 0.675 vs canonical 1.0).
- **Anchor:** Appendix A.2 REQ-VIS table, after REQ-VIS-11; cross-ref §8.4/§12.8.
- **Before:** *(row absent)*
- **After:** `| REQ-VIS-12 | Citation completeness: every completed Review/Fact-check records a
  canonical cited⇒retrieved completeness rate per run, rolled up daily as a reported signal (not an SLO);
  before delivery, a bounded backfill may re-fetch cited-but-unretrieved URLs once within
  min(fetchBudget, 24), metered to the run, never satisfying the REQ-SPEC-31 floor by itself | 8.4, 12.8 |
  new (fold-back from CITE.1; ADR-083…086) | the rate persists per run and aggregates; a backfilled URL
  joins the retrieved set |`
- **Disposition:** fold-back as a new id — **proposed, not applied.**

### [ ] A-2 — REQ-SPEC-34 (new): named COGS levers are server-owned configuration frozen onto the run

- **Landed reality:** ECON.2 (PR #105) shipped the `CogsLevers` contract + `resolveCogsLevers`: server
  `COGS_LEVERS` defaults, `is_test`-only client overrides (prod discards them), frozen into
  `runs.inputs.cogsLevers` + `input_snapshot.cogsLevers`; five named levers (L1 per-phase autoCompact
  window, L2 research fan-out shape 5/5⇄8/3, L3 §12.3-verbatim model routing, L4 TTL-only cache arm,
  L5 above-floor research envelope) each carrying a non-regression AC (ADR-087).
- **Anchor:** Appendix A.9 table, after REQ-SPEC-32; cross-ref §12.3/§14.4.
- **Before:** *(row absent)*
- **After:** `| REQ-SPEC-34 | **Cost-of-goods levers (fold-back from ECON.2; ADR-087).** Named COGS
  levers are server-owned configuration (`COGS_LEVERS` defaults; client overrides honoured only on
  is_test tenants and discarded on prod), resolved once and frozen onto the run's inputs and input
  snapshot; a lever ships only with a non-regression acceptance leg and stays inside the REQ-SPEC-31
  research floor and the verbatim-skill rule | 12.3, 14.4 | new | lever set frozen on the run row;
  offline accounting + non-regression legs |`
- **Disposition:** fold-back as a new id — **proposed, not applied.**

### [ ] A-3 — REQ-SPEC-33 (new): the paid-acceptance spend guard binds a system role and fails closed

- **Landed reality:** JOURNEY.1 (PR #83) ships a weekly ISO **metered-spend guard** that refuses paid
  journey legs pre-dispatch ($5/week on flagged-tenant metered spend). CAP.3 (PR #110, ADR-093) made it
  **fail-closed**: the guard binds the documented system pool; an app-role binding reads $0 through
  `usage_records` RLS and would silently bypass the cap — an unmeasurable/empty read now refuses. Measured
  live refusing: ISO-week $58.08 ≥ $5 (STB.5b + CAP.2 paid legs refused pre-browser, $0 metered).
- **Anchor:** Appendix A.9 table, after REQ-SPEC-32 (before A-2's row if both land); cross-ref §13.5.
- **Before:** *(row absent)*
- **After:** `| REQ-SPEC-33 | **Paid-verification spend guard (fold-back from JOURNEY.1 + CAP.3;
  ADR-093).** Scheduled/live acceptance legs that spend real money run only under a declared weekly
  ISO metered-spend bound, measured against the system role's read of the proxy ledger; the guard
  refuses pre-dispatch when the bound is met and **fails closed** when the spend is unmeasurable
  (an RLS-blind or empty read never passes) | 13.5 | new | a paid leg refuses at the cap and on a
  blind pool; the refusal is logged |`
- **Disposition:** fold-back as a new id — **proposed, not applied.**

### [ ] A-4 — note in an appendix: the REQ-SPEC-8 restore condition's first measured read (2026-10-04)

- **Landed reality:** ECON.2 evaluated the restore condition emit-only on prod data: the Standard/Base
  6,000-word estimate reads **$20.25 vs the ~$6 bound → NOT MET** (gap ≈$14.25; the five levers' modeled
  ceiling ≈$0.29/run); `pricing.json` untouched, the interim ~2,800-word terms stand; re-check + refit
  owed on measured evidence (D-ECON.2-6/-7).
- **Anchor:** the Appendix A.9 "Amended 2026-09-30" note, appended to the REQ-SPEC-8 bullet.
- **Before:** the bullet ends "…the §14.3 terms (≤ 6,000 words) return by configuration when the
  condition is met."
- **After:** append `*First measured read (ECON.2, 2026-10-04): $20.25 vs the $6 bound — NOT MET; the
  interim terms remain in force; the levers' modeled ceiling ≈$0.29/run does not close the gap.*`
- **Disposition:** note in an appendix — **proposed, not applied.**

### [ ] A-5 — note in an appendix: measured prod cost posture vs the $50/mo target

- **Landed reality:** OPS.2 (PR #103) measured the prod bill at **≈$285.80/mo list** (ADR-082; ~$152
  Cloud Run warm floor is the dominant term) against the ~$50/mo operator target recorded at H6;
  the HA pre-plan and warm-floor levers are plan-only (D-OPS.2-2).
- **Anchor:** §13.5 (after the SLO table / playbooks) or the §17 engineering-estimate note.
- **Before:** no measured figure in spec prose.
- **After:** a dated note line recording the measured bill, the warm-floor driver, and that levers are
  parked pre-decision.
- **Disposition:** note in an appendix — **proposed, not applied.**

### [ ] A-6 — note in an appendix: the edit-path semantics (ADR-048/049)

- **Landed reality:** EDIT.1 (PR #94) refined REQ-IDE-32/REQ-DATA-21's fork rule into deployed semantics:
  `/v/working` resolves the editable head (working head first, else highest-`n` incl. frozen); a frozen
  head's first write lazily forks v(N+1) `human_revision` without a confirm;
  `HUMAN_EDITABLE_DRAFT_ORIGINS` = {revision, upload, duplicate}; agent heads non-editable; no working
  copies (1.x); collab broadcasts `rhema.fork`/`rhema.readonly`.
- **Anchor:** §5.8 (versions and diffs) end-note, or the REQ-IDE-32 row in Appendix A.1.
- **Before:** REQ-IDE-32 says "editing a delivered version forks v(N+1) without a confirm" — the
  head-resolution and editable-origin rules are implicit.
- **After:** a dated note carrying the resolution + origin rules verbatim-ish.
- **Disposition:** note in an appendix — **proposed, not applied.**

### [ ] A-7 — note in an appendix: run-task confinement (ADR-074…076)

- **Landed reality:** SEC.3 (PR #101) confines the run task beyond the spec's two-uid text: distroless
  `nodejs22` image (no shell/package manager), vendored `setpriv`/`unshare`/`mount`/`dumb-init`,
  pure-argv ENTRYPOINT, readOnlyRootFilesystem + tmpfs, a `Localhost` AppArmor profile
  (`rhema-run-task`) + digest-pinned loader DaemonSet — proven live under the enforced profile.
- **Anchor:** §12.6 end-note or §13.3.
- **Before:** §12.6 specifies the three concentric layers + uid split; the confinement mechanism is
  unspecified.
- **After:** a dated note naming the distroless + AppArmor confinement as the deployed mechanism.
- **Disposition:** note in an appendix — **proposed, not applied.**

### [ ] A-8 — a spec ADR appendix (Appendix G) or an explicit pointer

- **Gap:** the spec's appendices run A–F (requirement index / decision register / research index /
  glossary / review dispositions / external-critique dispositions); it carries **no ADR appendix**.
  The decision record now spans ADR-001…105 in `docs/adr/` (generated index `docs/adr/README.md`),
  referenced inline at each amendment banner.
- **Anchor:** new `## Appendix G — Decision records` after Appendix F, or a §0.1 pointer line.
- **Before:** *(absent)*
- **After:** a short appendix: "the build's architecture decision records live in `docs/adr/`
  (ADR-001…NNN, append-only; index generated). Amendments cite them inline; this appendix exists so a
  spec reader knows the register exists."
- **Disposition:** note in an appendix — **proposed, not applied.**

## 4. The ADR set vs the spec's ADR appendix

- **Repo ADR set:** `docs/adr/ADR-001…ADR-105` (105 records; ADR-104/105 added by this ticket) +
  generated `docs/adr/README.md` index. Per-PR ADR columns: `docs/build/BUILD_INDEX.md`.
- **Spec ADR appendix:** **none exists** — the spec runs Appendices A–F only.
- **Delta:** the entire ADR-001…105 set. The spec's convention is instead to cite ADRs *inline* at the
  amendment banners (ADR-001 §12, ADR-008 §17, ADR-010 §13.1/§13.3, ADR-013…017 the 2026-09-30 banners,
  ADR-104/105 §17 after this run) — every spec-amending ADR is named at the point it amends.
- **Disposition:** the validator's set-equality check applies only when the spec carries an ADR
  appendix; it does not, so the delta is this dispositioned row + proposed amendment **A-8** (unticked)
  for an explicit pointer appendix. Every ADR's decision is either (a) a spec amendment already folded
  (ADR-001/002/003/006/008/010/013…017), (b) a mechanism the spec leaves to implementation (the bulk —
  dispositioned "implementation detail" in TICKET_VS_SPEC.md), or (c) a fold-back proposed above
  (ADR-083…087, 093 → A-1/A-2/A-3; ADR-048/049, 074…076, 082 → A-5/A-6/A-7), or (d) a build-process or
  MET-DIFFERENTLY record owned by the capstone trail (ADR-089, 098…103 — carried on
  `CAPSTONE_CLOSURE.md`'s ACCEPTED-deviations table, whose tick is 88a_GATE-ACCEPT's, not REC.2's).

## 5. Tick-state summary

| Row | Amendment | Tick | State |
|---|---|---|---|
| R-1 | G2 deferral → §17 banner + status line | [x] (GATE DECISIONS 2026-09-15) | **applied** — spec + manifest line + ADR-104 |
| R-2 | G3 early read → §17 addendum + A.13 | [x] (GATE DECISIONS 2026-09-23) | **applied** — spec + manifest line + ADR-105 |
| R-3 | 2026-09-17 manifest-log retro line | [x] (spec already carries it; ADR-010) | **applied** — manifest only |
| A-1 | REQ-VIS-12 citation-completeness rate + bounded backfill | [ ] | proposed |
| A-2 | REQ-SPEC-34 COGS levers as frozen run config | [ ] | proposed |
| A-3 | REQ-SPEC-33 paid-verification spend guard, fail-closed | [ ] | proposed |
| A-4 | REQ-SPEC-8 restore-condition first read (NOT MET) | [ ] | proposed |
| A-5 | measured prod bill ≈$285.80/mo note | [ ] | proposed |
| A-6 | edit-path semantics note (ADR-048/049) | [ ] | proposed |
| A-7 | run-task confinement note (ADR-074…076) | [ ] | proposed |
| A-8 | spec ADR appendix / pointer (Appendix G) | [ ] | proposed |
