# 19 — Fresh-context adversarial review of the v0.2 → v0.3 delta

**Target:** `docs/3_rhema-design-spec.md` (v0.3 — post-external-critique, 2026-09-01).
**Scope:** the delta only — the five round-2 workstream applications (research/13; design/15–18), the new objects and sections, Appendix F, and their seams with surviving v0.2 rules. v0.2 content already dispositioned in Appendix E was not re-litigated.
**Method:** every section F1 claims to have touched was read against its stream source; Appendix F's 81 rows were counted and verdict-checked row-for-row against design/14; Q-21…Q-26 hygiene was checked at every occurrence; PM arithmetic was recomputed; vocabulary and cross-references were swept mechanically.
**Reviewer stance:** fresh context; no knowledge of the sessions that produced v0.3.

**Totals: 0 blocker · 6 major · 8 minor.** The delta is a faithful, high-quality application of the five streams — the failures found are integration seams and stale v0.2 residue, not mutations of the stream designs. Section 3 lists what was checked and found clean.

---

## 1. Findings

Severity scale: **blocker** = the spec cannot go to operator review / O6 ticketing as-is; **major** = a normative contradiction, wrong number, or dangling reference a ticket writer or the operator would act on incorrectly; **minor** = hygiene, precision, or an inherited design gap worth a note.

### F-1 · MAJOR — §5.4 still phases the Authorship overlay as 1.x, contradicting the delta's own headline item

- **Location:** §5.4 (line ~520): "span-level provenance marks and the *Authorship* overlay (Advanced) are 1.x"
- **Problem:** v0.3's headline change #3 moves the **block-level** Authorship overlay (and write-only span capture) to MVP (§3.2 row 39; REQ-POS-8/9; §8.4 floor table). §5.4 — which Appendix A.12 lists as an *implementing section* for REQ-POS-8 and REQ-POS-9 — still carries the v0.2 sentence deferring the overlay wholesale, and neither §5.4's editing-rules paragraph nor REQ-SPEC-19's MVP-editor inventory mentions the block-level overlay toggle or span-granularity capture at agent-origin transactions. §3.2 is the declared phasing source of truth (REQ-PROD-13), so the conflict is mechanically resolvable, but a ticket writer working from §5.4 builds the wrong phase.
- **Fix:** reword the §5.4 sentence to "span-level provenance *marks* and the span-level Authorship overlay are 1.x (REQ-POS-10); the **block-level** Authorship overlay ships at MVP as a View-menu (Advanced) toggle rendered as sidecar decorations (REQ-POS-8), and agent-origin transactions record span-granularity provenance at capture, degrading to block-level `mixed` on any human edit (REQ-POS-9)." Add both items to REQ-SPEC-19's MVP list.

### F-2 · MAJOR — §17's beta-path totals are v0.2 numbers, unreconciled with the v0.3 additions

- **Location:** §17, beta-path reconciliation paragraph: "the beta path totals ≈ 55–72 PM against 52–67 direct"
- **Problem:** three inconsistencies in the numbers the Q-22 decision memo turns on. (a) The comparison baseline is stale: the same section's engineering table now states the direct plan at **≈ 57–74 PM** with the v0.3 additions; comparing the beta path against "52–67 direct" understates the direct plan by the very deltas v0.3 added. (b) The beta cumulative "≈ 28–37 PM" is design/18's pre-v0.3 figure, but the beta's own nine-step flow ships v0.3 work — the obligations chip and lineage (the +1.5–2.5 PM of REQ-OBJ-1…8 lands substantially in the engine/delivery path the beta needs) — so 28–37 excludes cost the beta path incurs. (c) The spec's own arithmetic doesn't close: Phase 0 as stated (18–23) + "10–15 beyond Phase 0" = 28–38, not 28–37; design/18 §2.3 closed this gap by noting the beta's Phase 0 is ≈ 16.5–21 (Draft's port defers), a load-bearing note the synthesis dropped. §16.3 #24 repeats the unadjusted "≈ 28–37 PM".
- **Fix:** re-derive both totals with the v0.3 deltas (beta cumulative ≈ 29.5–39.5 incl. obligations; beta-path total ≈ 60–79 vs direct 57–74 — the "beta costs ~3–5 PM" conclusion survives, so say so with the right numbers); restore design/18's Draft-port-deferred Phase-0 note; update §16.3 #24's beta clause to match.

### F-3 · MAJOR — §17 engineering-table footnote contradicts its own total's arithmetic

- **Location:** §17 engineering table, Total row + footnote: "+1.5–2.5, inside the engine/IDE rows … +1.25–2, inside the editor/export rows"
- **Problem:** the listed rows (including the new Evaluation-program 2–3 PM row) sum to 54–70. The stated v0.3 total "≈ 57–74" equals that row-sum **plus** obligations (1.5–2.5) **plus** the authorship slice (1.25–2) — i.e., the deltas are additive on top of the rows. But the footnote says those two deltas sit "inside" the engine/IDE and editor/export rows, whose values are unchanged from v0.2 (they still sum to 52–67 without the eval row). Both readings cannot be true: either the rows already contain the deltas (total should be ≈ 54–70) or they do not (footnote is wrong). As written the table invites a double-count reading of ±2.75–4.5 PM.
- **Fix:** either bump the four affected rows (engine 9–11 → ~10–12, IDE 9–11 → ~9.5–12, editor 6–8 → ~7–9.5, export unchanged or +0.25) and state the total as the row-sum, or keep the rows and reword the footnote: "carried as additive line items here; folded into the affected rows at the Phase-0 re-estimate."

### F-4 · MAJOR — an Appendix E.4 bullet is stranded as the file's last line, after Appendix F

- **Location:** file end (line 4013), immediately after the F.2 table: "**Review 11 #23 (ship walkthrough at MVP) vs review 12 #28's cut list** → shipped at MVP"
- **Problem:** this is an E.4 ("Where reviews conflicted") bullet — its six siblings are at lines ~3821–3828 — left orphaned at the end of the document, presumably when Appendix F was inserted before E.4's final bullet. Appendix F now ends with a fragment of Appendix E content, and E.4's list is incomplete. A pure editing artifact, but it sits in the two appendices whose integrity is the delta's audit trail.
- **Fix:** move the bullet into §E.4's list (after the "Review 12 #16" bullet); confirm nothing else trailed it.

### F-5 · MAJOR — §8.2 row 1 still routes the manifest's agenda to `backlog_item` rows, a table v0.3 drops

- **Location:** §8.2, per-artifact table row 1 (line ~1332): "Its 'next-round agenda' becomes `backlog_item` rows."
- **Problem:** REQ-OBJ-7 removes `BacklogItem` ("rows migrate to `source='agenda'` obligations"; §11.4: "`backlog_items` dropped after migration"; Appendix D.2 bans "backlog"). The §8.2 policy-table note — normative text a ticket writer implements — still creates rows in a table that no longer exists. This is the one surviving "backlog" residue in the spec.
- **Fix:** reword to "Its 'next-round agenda' becomes `source: 'agenda'` revision-obligation rows (§11.7; REQ-OBJ-7)."

### F-6 · MAJOR — the rendered preference profile has no ArtifactKind, no §8.2 row, and no mount path

- **Location:** §11.3 / §11.7 / REQ-OBJ-9: "renderedArtifactVersionId: ArtifactVersionId } // preferences.md snapshot; consumers pin it per run"
- **Problem:** three seams, all unclosed. (a) Every `ArtifactVersion` hangs off an `Artifact` whose `kind` must be one of the frozen 62 `ArtifactKind` values (REQ-SPEC-14 contract test) — `preferences.md` has no kind, so the object REQ-OBJ-9 requires cannot legally exist. (b) REQ-OBJ-9 declares the rendered file "SR", but §8.1 computes visibility *from kind* via the §8.2 table, which has no row for it — the SR assertion has nothing to key on. (c) REQ-OBJ-10's firewall is enforced "by the mount manifest", yet §12.6's seat-mount tables (presented as the exhaustive allowlist: "the project root *is* the allowlist") and §11.5's mirror tree were not amended to show where `preferences.md` mounts for Drafter/Assistant seats. All of this is 1.x (capture-only at MVP), so nothing breaks at MVP — but the spec's own contract tests would reject the 1.x design as written. design/15 §2.4 says rendering "reuses the `guidance_record` pattern" without deciding the kind; the synthesis inherited the gap rather than closing it.
- **Fix:** decide and record now: either reuse kind `guidance_record` (cheapest; note it in §11.7 and add the § 8.2 note) or pre-register a 63rd kind `preference_profile` for 1.x with the contract-test bump; add an §8.2 row (SR, reasons UX/IB); add one line to §12.6's Drafter/Assistant mount rows and §11.5's tree reserving the `preferences.md` mount point, with the Editor/independence exclusion stated there (REQ-OBJ-10's enforcement point).

### F-7 · MINOR — REQ-EVAL-15's acceptance hook points at the wrong open question

- **Location:** Appendix A.11, REQ-EVAL-15 AC column: "pre-registered criterion; operator confirms numbers (§16.3 #27)"
- **Problem:** §16.3 #27 is Q-23 (benchmark *budget*). No §16.3 item records the required operator confirmation of the LIFT numbers (15 pts / 60% / two waves) that §18.4 itself says "is required before the pre-registration freezes them". The confirmation obligation exists only inside §18.4 prose, untracked.
- **Fix:** add the numbers-confirmation to §16.3 (its own row, or a sentence inside #27) and point REQ-EVAL-15's AC there.

### F-8 · MINOR — the §5.7 obligation-state chip omits `mooted`

- **Location:** §5.7, "Obligations on the surface (v0.3)": "obligation-state chip (`open · addressed · discharged · rebutted · deferred · reopened`)"
- **Problem:** §11.3's `ObligationState` has seven values; the chip enumeration lists six, silently dropping `mooted` — which §11.7 says is "confirmed at the next triage", i.e., it *does* surface.
- **Fix:** add `mooted` to the chip list, or state the rendering rule ("mooted renders as discharged pending triage confirmation").

### F-9 · MINOR — front-matter delta paragraph cites REQ-OBJ-17 for a change it doesn't make

- **Location:** front matter, delta paragraph: "claims gain `sources[]` stance edges and a `kind` (REQ-OBJ-17…19)"
- **Problem:** REQ-OBJ-17 is the `ClaimVerdict` vocabulary *freeze* — nothing claims "gain" from it. The gains are REQ-OBJ-18 (stance edges) and REQ-OBJ-19 (`kind`).
- **Fix:** "…the verdict vocabulary is frozen and claims gain `sources[]` stance edges and a `kind` (REQ-OBJ-17…19)" or cite 18–19 only.

### F-10 · MINOR — Q-21 conditioning is inconsistent across the REQ-POS rows that depend on it

- **Location:** Appendix A.12: REQ-POS-1 "new (awaiting Q-21)" vs REQ-POS-2/-3 "new"; §15.2: "Card order amended v0.3 (REQ-POS-2): the Essay card leads"
- **Problem:** §16.3 #25 says a contrary Q-21 ruling "reverts copy and card order" — i.e., REQ-POS-2 (segment-table/pricing-card order) and plausibly REQ-POS-3 (Essay-protocol Showcase) are exactly as Q-21-contingent as REQ-POS-1, yet only REQ-POS-1 carries the "awaiting Q-21" status, and §15.2 presents the card order as settled ("amended v0.3") with no pending marker. Recommendation hygiene is otherwise excellent (§2.1, §16.3 #25–30, §17, §18.6 all clearly marked); this is the one place a Q-21-dependent change reads as decided.
- **Fix:** tag REQ-POS-2 (and REQ-POS-3 if the operator's Q-21 ruling should reopen the Showcase protocol) "awaiting Q-21" in A.12, and add "(Q-21 rec.)" to §15.2's card-order sentence.

### F-11 · MINOR — the stall-detection query escalates legitimately deferred obligations

- **Location:** §6.8: "`exists obligation where severity in ('blocking','major') and roundsOpen ≥ 2 and state ≠ 'rebutted'`"
- **Problem:** `roundsOpen` counts "consecutive covering reviews delivered while not discharged" (§11.3), and the query excludes only `rebutted`. A major obligation deferred with an in-horizon 3-round `deferHorizon` accrues `roundsOpen` and trips the stall escalation at round 2 — despite being a recorded, rationale-backed snooze the product promised is "a snooze, never a burial". This is *faithful* to design/15 §1.5 (an inherited gap, not a synthesis mutation), but the two texts now bind it as the MVP behavior.
- **Fix:** exclude `deferred` while its horizon has not arrived (`state not in ('rebutted','deferred')` plus the horizon-arrival return-to-open already specced), or pause `roundsOpen` accrual during an active deferral.

### F-12 · MINOR — "shipped-product only" arms vs a wave 1 that runs before any product ships

- **Location:** §18.2 REQ-EVAL-6: "Rhema arms run the shipped product at pinned `protocol@version` with no eval-only tuning"
- **Problem:** §18's preamble and §17 place wave 1 during/after Phase 0, explicitly "no product UI — it runs on the Phase-0 engine", when nothing is "shipped". The intent (no eval-only forks) is clear, but the letter of REQ-EVAL-6 is unsatisfiable at the first gate it governs.
- **Fix:** reword to "the production engine and protocol package as they will ship, at pinned `protocol@version`, with no eval-only tuning or forks."

### F-13 · MINOR — the beta's posture on the authorship slice is unstated

- **Location:** §17 Review-beta row (scope list) and REQ-BETA-3's inclusion rule
- **Problem:** the beta row enumerates v0.3 obligation surfaces ("what-changed + obligations chip") but is silent on slices S1–S4 (AI-use statement, provenance appendix/overlay, span capture). Under REQ-BETA-3 they are off the nine-step flow → deferred; yet the delta's own rationale (research/13 §A3; §16.3 #28: the launch segment "most exposed to authorship anxiety") describes exactly the beta's Substack-essayist partners, who would run ≥90 days and export real manuscripts without the disclosure artifact. Either answer is defensible; the spec just doesn't give one.
- **Fix:** one sentence in the §17 beta row (or a REQ-BETA note): S1 at least rides the beta's export path, or the slice is explicitly post-beta with the exposure accepted.

### F-14 · MINOR — §11.1's immutability principle is not annotated with its new exception

- **Location:** §11.1, last principle: "Immutability is a state, not a flag the agent remembers; drift and project state are computed, never stored as opinion."
- **Problem:** v0.3 deliberately introduces "the one deliberately mutable object over the immutable record" (§11.7, R19) whose row `state` *is* stored (a trigger-maintained cache of append-only transitions). §11.7 self-describes cleanly, but the data-model principles a reader checks first still read as exceptionless.
- **Fix:** append one clause: "(one deliberate v0.3 exception: revision obligations — mutable row state cached from append-only `obligation_transitions`, §11.7)."

---

## 2. Notes on severity

No blockers: every contradiction found has a mechanical resolution inside the spec (§3.2 is the declared phasing authority for F-1; the F-2/F-3 corrections preserve the Q-22 conclusion's direction), and none of the six majors misapplies a stream's design — they are stale v0.2 residue (F-1, F-5), unreconciled arithmetic (F-2, F-3), an insertion artifact (F-4), and an inherited under-specification (F-6).

## 3. Checked and found clean (for the record)

- **Appendix F integrity:** exactly 81 disposition rows (5+5+4+3+3+4+3+16+5+6+8+6+3+4+6); crosswalk verdicts reproduced row-for-row from design/14 and the tallies confirmed at 48 ALIGNED · 19 PARTIAL · 6 DIVERGES · 4 ABSENT · 4 CRITIQUE-WEAKER; every disposition's section pointer spot-checked resolves (§1.1, §1.6, §2.1, §3.4/3.5, §5.7/5.8, §11.7, §16.4, §17, §18, REQ-OBJ/EVAL/POS/BETA); F.2's eleven corrections match research/13's verdicts, including the retracted fabrication suspicions and the two collapsed claims.
- **Requirement index:** REQ-OBJ-1…19, REQ-EVAL-1…20, REQ-POS-1…13, REQ-BETA-1…22 — unique, contiguous, matching the defining stream documents ID-for-ID; A.10–A.13 rows' section pointers resolve; REQ-WF-7's amendment is mirrored consistently in §6.2, A.8 and A.10; REQ-BETA-22 → §16.3 #26 correct; §16.4's REQ-BETA-16 citation ("working editors as calibration readers") verified against design/18.
- **Faithful application:** §18 reproduces design/16's LIFT criterion, six arms, judge requirements C-a…C-g, consequences, cadence and economics without mutation; §1.1/§1.6/§15.1 apply design/17's ready-to-merge texts with the required row-2/3 status updates and no dilution; §11.7 reproduces design/15's spawn/discharge/lineage/firewall semantics and the argument-graph kill criteria verbatim in substance; §17's gate order matches design/18's; §3.5's beta north-star is properly Q-22-conditioned.
- **Integration seams:** obligations spawn inside the REQ-DATA-7 delivery transaction, consistent with immutability-as-state (correspondence stays write-once; only the obligation row mutates, history append-only); the Editor firewall composes with §8.3's private-memory rules and reuses §12.6's mount-manifest mechanism (F-6's mount-path gap noted); §13.5 ↔ §18 cross-references are present and non-contradictory ("evals compare Rhema to Rhema"); §18.6's program economics are correctly kept outside §14's credit system and REQ-EVAL-14 uses §12.7 proxy-metered list cost; the authorship slice does not reverse R14/F46 — R14's §0.3 row remains true because only span *rendering* stays 1.x, and R25/E-appendix record the re-slicing.
- **Vocabulary:** all new text uses the canonical vocabularies (Quick/Standard/Full board; Base/Balanced/Frontier; Free/Writer/Studio/Studio Max/Team; Drafter/Editor/Assistant; blocking/major/minor/note); "Obligation" added to §4.3 and D.2's reserved nouns with "backlog" banned (residue: F-5); no duplicated paragraphs or truncated sentences found beyond F-4.
- **Recommendation hygiene:** Q-22, Q-23, Q-25, Q-26 are consistently marked as recommendations awaiting the operator at every occurrence (front matter, §3.5, §11.7, §16.3 #26–30, §17, §18.4, §18.6, A.13); Q-24's "recommendation applied, pending ratification" is labeled at row 39, §16.3 #28, and R25; Q-21 is well-marked everywhere except the A.12/§15.2 asymmetry of F-10.
