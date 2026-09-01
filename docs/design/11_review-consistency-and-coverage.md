# Review 11 — Consistency, coverage, index integrity, and hand-off readiness

- **Target:** `docs/3_rhema-design-spec.md` v1.0 (2026-08-27), read in full; `docs/1_founding-prompt.md`; `docs/2_research-and-design-ledger.md` §O, §Q, new rows, change log.
- **Reviewer stance:** fresh context, adversarial; no prior sessions seen; design/ and research/ folders not opened.
- **Lenses:** (1) internal consistency · (2) coverage vs founding prompt and Q-1…Q-20 · (3) requirement-index integrity · (4) hand-off readiness (ledger O6).
- **Severity:** *blocker* = a ticket written from the spec as-is would implement the wrong thing or two tickets would contradict; *major* = a ticket writer must guess or open a source document; *minor* = wording/labelling drift that a find-and-replace fixes.
- **Totals:** 4 blocker · 19 major · 22 minor (45 findings).

The spec does not modify anything; every fix below is a proposal for the spec author.

---

## Lens 1 — Internal consistency

### 1. [blocker] Workflow-catalogue cost column is labelled by rigor but computed by model tier
- **Location:** §6.1 "Credit ranges below are Quick / Standard / Full board"; §6.2 column header "Credits (Quick / Standard / Full board)".
- **Problem:** The triples are model-tier figures at Standard rigor, not rigor notches. Evidence: §15.2's Essay card "Full round Base 1,410 · Balanced 3,290 · Frontier 6,420" equals the first/second/third values of §6.2's 5k rows (400+560+450 = 1,410); the ratios are exactly the 1× / 2.2× / 4.5× model multipliers of §12.3; §9.2 states the same 310/760/1,510 figures "by model tier"; §7.6 quotes "Draft v1 ≈ 400 cr (Base) · 940 (Balanced)". A ticket implementing the estimator or the pricing cards from §6.2 as written would price Quick rigor at Base cost and Full board at Frontier cost.
- **Fix:** Relabel §6.1 and the §6.2 header "Credits at Standard rigor (Base / Balanced / Frontier)"; add one sentence giving the rigor multipliers (Quick and Full board relative to Standard) or a second small table, since §14.3 and §15.2 quote Quick (≈180) and Full-board-on-Base (≈350) figures that currently have no derivation anywhere.

### 2. [blocker] REQ-SPEC-1's "never shorten below the default" contradicts four other rules
- **Location:** §6.4 REQ-SPEC-1 "per-project policy may lengthen or remove deadlines, never shorten below the default".
- **Problem:** (a) Approve triage's default is *wait* (infinite); the per-project opt-in "24 h then proceed" in the same table is a shortening. (b) *Run to completion* policy removes Approve plan/scope/etc. entirely — a 0-minute deadline. (c) "Trial preview runs pre-approve Approve plan with a 0-minute deadline" (§6.4 item 2). (d) `Project.approvalOverrides` (§11.3) is typed `{deadlineMinutes: number | null}` "lengthen/remove only", which cannot express the triage opt-in. REQ-RUN-5 ("don't ask" records auto-approval rather than skipping) and REQ-DATA-36 (`run_to_completion` opens only spend/refusal gates) pull in opposite directions on whether a skipped gate has a row.
- **Fix:** Restate REQ-SPEC-1 as: "Per-kind overrides may lengthen, remove, or — for kinds whose default is *wait* — add a deadline ≥ 2 h; the three named policies and the trial pre-approval are the only mechanisms that resolve a gate without a human, and each writes a `Decision{by:'policy'|'trial'}` row; spend gates never auto-proceed." Change `Decision.by` to include `'policy'`; change `approvalOverrides` typing to allow a number on wait-kinds.

### 3. [blocker] The MVP Assistant plan card creates a run kind that is not in the MVP
- **Location:** §7.1 "*Run as background research* (a `discourse-map`-class run card)" (REQ-CHAT-10, MVP); §7.2 "`/research` → Map the field"; §3.2 row 28 Map the field = v1; §16.3 #7 "`/deep-research` backing `/research`".
- **Problem:** REQ-CHAT-10 and the first-five-minutes script (§7.6, MVP, activation-critical) require a run to exist when a chat turn exceeds its budget, but the only candidate workflows (`discourse-map` / Map the field) ship in v1, and `WorkflowKey` carries an undocumented `'research_burst'` that appears in no catalogue row, no feature-matrix row, no phase manifest, and no visibility row. §16.3 #7 also refers to a `/deep-research` command that the spec never defines.
- **Fix:** Add a `research_burst` row to §6.2 (seat Assistant, phases, artifacts = chat source notes, cost class C1, no Approval, MVP) and a feature-matrix row; state explicitly that Map the field (v1) is a different, Drafter-seat workflow; delete or define `/deep-research`.

### 4. [blocker] The visibility policy table does not enumerate the v1 workflow artifacts it must classify
- **Location:** §8.1 REQ-VIS-1 "a contract test enumerates every `ArtifactKind`"; §8.2 "39 source artifact types plus 7 Rhema additions … 46"; §11.3 `CorrespondenceKind = … 'cut_list' | 'field_map' | 'steelman' | 'convergence_report'`.
- **Problem:** §8.2 has no row for cut list, field map, steelman essay, vulnerability map, adjudication, convergence report, title candidates, abstract, reverse outline, suggestion set / pattern note, or `Guidance` — all artifacts of §6.2 workflows (four of them MVP: Fact-check's immutable ledger is arguably #7, but Cut to length's cut list, Figure's working figures and Outline's outline v2 are not). The "46" count also does not reconcile with the table (37 non-dropped source rows, several carrying two kinds). The Browser snapshot test (REQ-VIS-3) and the path→kind map (F11) cannot be written without a closed list.
- **Fix:** Add a fourth block to §8.2 ("Workflow additions") with one row per kind above; restate the totals from the table; publish the closed `ArtifactKind` enum in §11.3 instead of `/* the 46 kinds */ string`.

### 5. [major] Seat vocabulary: three seats in §6.6, five or six elsewhere
- **Location:** §6.6 "the three seats"; §14.5 level 2 "cost by seat (Drafter / Editor / Researcher / Persona builder / Assistant)"; §14.5 wireframe seats "Editor / Researcher / Second read"; §6.2 seats "Persona builder", "Orchestrator", "either"; §11.3 `AgentTypeKey = 'author'|'editor'|'assistant'|'persona_builder'|'steelman'|'discourse_mapper'`.
- **Problem:** "Researcher" and "Second read" are not seats in any type; `UsageRecord.role: AgentTypeKey` cannot represent them. "Orchestrator" (Run rounds) has no `AgentTypeKey`. §6.2 assigns Steelman to the Editor seat and Map the field to "Drafter (research)", while `AgentTypeKey` gives each its own key and §6.6 calls them "future seats … new badges". Mounts (§12.6) list only four seats, so a Steelman run's namespace is undefined.
- **Fix:** Fix the seat set once in §6.6: three user-facing seats + Persona builder + System; declare that Steelman runs in the Editor namespace and Map the field in the Drafter namespace (drop `'steelman'|'discourse_mapper'` from `AgentTypeKey` or add their mounts); make "Researcher" and "Second read" *subagent labels* under a seat in §14.5 and say so.

### 6. [major] Run-report URL has three different shapes
- **Location:** §4.2 `/app/usage/runs/:run` and `/p/:project/r/:run`; §14.5 level 3 `/p/:id/runs/:run`; §4.2 mobile `rhema://p/<project>/runs/<run>/gates/<gate>`.
- **Problem:** Web uses `/r/`, the usage section uses `/runs/`, and the mobile deep link uses `/runs/…/gates/…` while the web fragment for the same target is `#gate`. REQ-IDE-1 promises one stable URL per run/approval.
- **Fix:** Pick `/p/:project/r/:run` (+ `/g/:gate` or `#gate`) everywhere; make the mobile scheme mirror it.

### 7. [major] Attention groups differ between web and mobile
- **Location:** §5.2 "Needs you / Running / Ready to read / Quiet"; §10.3 S2 "Needs you / Running / Ready / Idle"; §10.3 wireframe "EVERYTHING ELSE".
- **Problem:** REQ-SPEC-3 makes the project state function shared with mobile; the group labels are not.
- **Fix:** Use the §5.2 labels verbatim in §10.3 and the wireframe.

### 8. [major] Mobile approval screen still assumes three named gates
- **Location:** §10.3 REQ-MOBILE-12 "the three named kinds plus spend gates share the screen".
- **Problem:** §6.4 defines eight named Approvals plus four spend/refusal kinds (twelve `GateKind`s). Approve outline, Approve sample, Approve cut list, Choose a thesis and Continue? are undesigned for mobile though §7.3 says the outline card is approvable on mobile (REQ-CHAT-18).
- **Fix:** Change REQ-MOBILE-12 to "all twelve gate kinds render on the one screen; kinds with structured editable fields (plan, scope, cut list, triage) show fields read-only with a comment box".

### 9. [major] Free-tier daily allowance: "no web research" vs mobile "research beyond the daily allowance"
- **Location:** §14.3 "chat on 10 credits/day (nightly expiry, no web research, no runs)"; §10.1/§10.3 REQ-MOBILE-13 "estimate chip before research beyond the daily allowance".
- **Problem:** Direct contradiction on whether the free daily grant can spend on search/fetch; and "daily allowance" is a Free-tier concept applied to all mobile users.
- **Fix:** In §10 replace with "estimate chip before any research burst (plan card, §7.1); on Free, research tools are disabled".

### 10. [major] `agents/author/research` is "hidden by default" in §8.2 but a default Browser section in §5.13
- **Location:** §8.2 #20 "I as a source library … Hidden by default for simplicity"; §5.13 Research section "the Drafter's source library … visibility I / H-with-URLs"; REQ-VIS-3 "default tree shows exactly the SE and SR kinds".
- **Problem:** The Browser's default tree contains a section whose contents are level I, violating REQ-VIS-3's own AC (snapshot test).
- **Fix:** Either promote `source_note (author)` to SR (as a list; bodies on click) or move Research under the Advanced disclosure; align #20 and REQ-VIS-3.

### 11. [major] Phasing vocabulary — "v1", "v1.x", "v1.1", the "v1" matrix column, and §17 "1.x" do not mean the same thing
- **Location:** §3.1 "v1 — the first-year spec; v1.x marks named minors after MVP"; §3.2 column "v1" containing entries "v1.x" and "v1.1"; §6.2 Phase "v1" for Line edit; §17 places Line edit in "1.x".
- **Problem:** REQ-PROD-13 makes the matrix the phasing source of truth, but "v1" as a column heading, "v1" as a cell value, "v1.x", and "v1.1" are used interchangeably; §17 has no "1.1" milestone though §3.2 uses it for BYO keys, mobile light edits, and "run next with defaults".
- **Fix:** Rename the matrix columns "MVP · 1.x (named minor, give the minor: 1.1/1.2) · Later"; replace bare "v1" in §6.2 and §8 with the minor number; add "1.1" and "1.2" rows to §17 or collapse both into "1.x".

### 12. [major] What creates the `runs` row — sheet open, or Run click?
- **Location:** §5.6 items 1 and 9 (estimate on open; `hold(cap)` on Run); §12.4 "`[*] --> created: POST /runs`", "created → estimating → awaiting_consent"; REQ-CHAT-25 "The run sheet is the only way a run is created".
- **Problem:** §12.4 has the run row created at estimate time (every sheet open would produce an abandoned `created`/`estimating` row and every consent second-click is a `confirm_cost` *gate* on a run), while §5.6 describes estimate as a stateless pre-pass and the run as created on click. Analytics (`run.estimated` vs `run.launched`), the Inbox (an `awaiting_consent` run with an open gate would appear as Needs-you) and REQ-RUN-13 ("hold before launch") depend on which is true.
- **Fix:** State one model: `POST /projects/:id/estimates` (stateless, cached) and `POST /projects/:id/runs` on click, with `awaiting_consent` reachable only for mobile "run with defaults" or Assistant-prepared runs; or keep §12.4 and say sheet-open rows are reaped after N minutes and never surface as gates.

### 13. [major] Six-value verdict vocabulary vs seven-value `ClaimVerdict`
- **Location:** §8.2 #7 "six-value verdict"; §8.4 "the six-verdict vocabulary"; Glossary "six-value verdict"; §11.3 `ClaimVerdict` adds `'verified_against_user_source'`; §6.2 REQ-WF-8.
- **Fix:** Say "six-value (seven under the Memo protocol)" once in §5.7 and use `ClaimVerdict` everywhere.

### 14. [major] Review phase count: seven or eight?
- **Location:** §6.2 Review row lists "… Second read → Weighing → Reading the prose → **Reconciling the second read** → Writing the letter"; §5.5 wireframe and §12.2 manifest list seven phases with no reconciliation phase; §6.5 "all seven phases".
- **Problem:** Progress "k/n", the run report and REQ-IDE-12 need the exact phase list; reconciliation is either a phase or part of `letter`.
- **Fix:** Drop "Reconciling the second read" from §6.2 or add it to the manifest as a sub-step of `letter` with an explicit note.

### 15. [major] Draft phase list: is "plan" a phase?
- **Location:** §6.2 Draft "Reading the outline → Binding voice → **Approve plan** → Verifying sources"; §12.2 "intake → voice → **plan (gateAfter approve_plan)** → grounding"; §6.4 "Approve plan … after Binding voice".
- **Fix:** Add "Planning the structure" as a user-visible phase in §6.2 and change §6.4 to "after Planning the structure".

### 16. [major] Model names visible in the chat composer contradict the Advanced-only rule
- **Location:** §7.1 "notch first, model name in small type (`Base · Sonnet 5 …`)" in the per-thread picker; §5.1 Advanced tier "model names behind tiers"; REQ-PROD-5 "model names only in Advanced and the run report".
- **Fix:** Either make the composer picker show notch only with the model name on hover/Advanced, or amend REQ-PROD-5 to admit the chat picker.

### 17. [major] Two naming schemes for the persona run kinds
- **Location:** §9.2–9.4 `persona.bootstrap`, `persona.refresh{scope}`, `persona.calibrate`, `persona.compose`, `charter.reseed`; §11.3 `WorkflowKey` `'profile_voice' | 'refresh_voice' | 'calibrate_voice' | 'compose_voice' | 'reseed_charter'`.
- **Fix:** Use `WorkflowKey` values in §9 (or add a mapping table) so telemetry, the Runs tab filter and tickets use one key.

### 18. [major] Per-verified-claim constant is 24 in one place and 11 in another
- **Location:** §5.6 "21 claims × 24 cr ≈ 500"; §15.2 "roughly 24 credits on Base"; §6.2 Fact-check "≈11/26/51 per verified claim"; §14.5 wireframe "34 verified claims × ~11 cr = 371".
- **Problem:** REQ-GROWTH-9 generates FAQ copy from `cost_per_verified_claim[tier]`; two constants exist for the same Base tier.
- **Fix:** State that Review's marginal cost per claim is 24 (includes re-read context) and Fact-check's is 11 (no dossier context), and name the two constants distinctly — or make them one.

### 19. [minor] Approval policy value naming drift
- **Location:** §5.6 wireframe "○ Run to end"; §6.4 "*Run to completion*"; §11.3 `'run_to_completion'`.
- **Fix:** "Run to completion" everywhere.

### 20. [minor] "checkpoint" appears as a UI-facing autonomy value despite §4.3's ban
- **Location:** §4.3 "Never 'gate' or 'checkpoint' in the UI"; §6.4 and §6.8 "*checkpoint* (default) · manual · auto"; §12.4 user copy "resumed from your last checkpoint".
- **Fix:** Rename the autonomy value ("Ask each round") and the copy ("from the last completed phase").

### 21. [minor] `DraftOrigin` lists `cut`; the version-rail chip list omits it
- **Location:** §5.8 origin list vs §11.3 `DraftOrigin`. **Fix:** add `cut` to §5.8.

### 22. [minor] Finding/Disposition field names differ between §5.7 and §11.3
- **Location:** §5.7 `reviewId; versionId`, `disposition.by: "user" | "drafter"`; §11.3 `correspondenceId; draftId`, `by: Actor`.
- **Fix:** Declare §11.3 canonical and change §5.7 to a "view" type or align names.

### 23. [minor] Walkthrough is v1.x but three MVP behaviours depend on it
- **Location:** §3.2 row 20 "round walkthrough (v1.x)"; §5.11 REQ-IDE-48 "lands on the walkthrough card" (MVP); §5.8 "Mobile shows the walkthrough"; §10.3 S4.
- **Fix:** Either ship the ≤200-word walkthrough in MVP (it is one model call) or define the MVP fallback card (deliverable chips + "one thing").

### 24. [minor] Glossary "Approval" omits `refusal`, `spend_overrun`, `resume_partial`
- **Fix:** Add "Spend and Refusal gates always wait" naming the four kinds.

### 25. [minor] "Wait for me" is missing from the card actions list
- **Location:** §6.4 item 1 lists four actions; REQ-PROD-4, §10.3 and `Decision.action 'hold'` include Wait for me.
- **Fix:** Add "Wait for me (hold)" to §6.4 item 1.

### 26. [minor] Piece brief is SR in §5.13 but I in §8.2
- **Location:** §5.13 Rounds "piece brief … SR"; §8.2 #6 "I (SR at Confirm scope)". **Fix:** align §5.13 to "I (surfaced at Confirm scope)".

### 27. [minor] Chat default model tier vs account default
- **Location:** §7.1 `model: 'per-thread tier (default Base)'`; §14.7 "default model tier … Balanced on paid". **Fix:** say chat threads default to Base regardless of the account default, and why.

### 28. [minor] epub export appears in §12.1 and §13.4 but not in the feature matrix
- **Location:** §3.2 rows 47–48. **Fix:** add epub to row 48.

### 29. [minor] Op-ed protocol's default workflow (Map the field) is not in MVP
- **Location:** §6.7 "Map the field default" for Op-ed; §3.2 row 28 v1. **Fix:** mark "(from 1.x)" or make Fact-check the Op-ed default in MVP.

### 30. [minor] Free trial "What it covers" arithmetic
- **Location:** §14.2 "one Full-board Base review of a ≤3k-word piece, or one blog loop" on 600 credits; a 2k Base loop per §6.2 is 190+250+220 = 660.
- **Fix:** Regenerate from `pricing.json` (REQ-GROWTH-4) once instrumented; until then say "most of one blog loop".

---

## Lens 2 — Coverage vs the founding prompt and the Q decisions

### 31. [major] Q-9's export list is silently deferred
- **Location:** Q-9 "Export to txt / rtf / md / Word / Google Docs / PDF / LaTeX etc."; §13.4 "odt, rtf, epub, Google Docs … v1.x".
- **Problem:** rtf and Google Docs are named in the operator decision and deferred without a §16.1 entry; §16.1 claims to list every Q-20 departure.
- **Fix:** Add D7 to §16.1 (reason: pandoc rtf fidelity and the Drive OAuth review cycle) or pull rtf into MVP (pandoc already produces it in the export container).

### 32. [major] Founding-prompt "Medium" linking is deferred without argument
- **Location:** Prompt "link to … a Substack, Medium, or perhaps others"; §9.5 Medium v1.x.
- **Fix:** Add to §16.1 with the reason (Medium's RSS window / export-zip only) or ship the export-zip importer (I7) in MVP.

### 33. [major] Founding-prompt genre breadth is narrowed without a §16.1 entry
- **Location:** Prompt "ideally we want to support all possible use cases (high academia, journalism, blog, creative writing, business writing …)"; Q-15 "more than academic"; §2.1 defers Journalism, Creative nonfiction, Fiction.
- **Problem:** Q-15 is satisfied, but the prompt's explicit list is cut and the reasoning lives only in §2.1/§3.4 tables, not in the departures register the operator is asked to review.
- **Fix:** Add a §16.1 row summarising the deferral and its reasons; the content already exists.

### 34. [major] "Knowledge bases" per agent type are never addressed
- **Location:** Prompt "specialized agent toolsets, additional knowledge bases, available skills … model and other configurations"; §11.3 `AgentType` has tools, skills, model, persona view — no knowledge-base concept; §3.2 row 70 defers only "user-configured MCP/tools".
- **Fix:** State explicitly in §6.6 or §11.3 that the Drafter's research library and the voice profile *are* its knowledge bases and that user-attached corpora are Later (row 70 or a new row).

### 35. [minor] "Re-organize" projects has no affordance beyond grouping
- **Location:** Prompt "create, re-organize, open for editing"; §5.2 row actions (Rename/Duplicate/Archive/Delete), group-by and filters; no folders, tags or manual ordering.
- **Fix:** One sentence in §5.2: "Organisation is by voice, protocol and state only; folders/tags are Later" (and a matrix row).

### 36. [minor] Q-3 "no Stripe account yet" and account ownership are not turned into setup work
- **Location:** Q-3; §13.1/§14.6 assume Stripe, Claude Platform on AWS Marketplace, Expo, Google Drive API, Apple developer accounts.
- **Fix:** Add a "Phase 0 accounts and registrations" line to §17 (Stripe + Tax registrations L13, AWS Marketplace subscription, Apple/Google developer, Expo, Google OAuth consent screen).

### 37. [minor] Q-14 "Substack as counter-inspiration" is cited but the concrete borrowings are not listed in one place
- **Location:** §5.9 and §15.1 mention Substack indirectly via research/5.
- **Fix:** One line in §5.9: "From Substack: Lora-class serif at 17 px, 65–75 cpl, `.dark-mode` paper pinning, the web-vs-app split."

### 38. [minor] Q-8 "auto-inserted at the right spot" became "insert as proposal at a stated anchor" — argue it
- **Location:** §7.5 REQ-VIZ-10. The change is right (agents never write into human-editable docs, REQ-WF-2) but is an operator-wording departure not in §16.1.
- **Fix:** One row in §16.1 or a "Rejected: silent auto-insert" line in §7.5.

### 39. [minor] All six §16.1 departures (D1–D6) are argued and traceable to R1/R2/R3 and design sources — confirmed. Two additional Q-20-relevant departures found above (#31, #32) are not.

---

## Lens 3 — Requirement-index integrity

### 40. [major] Twelve Appendix A rows cite a section that does not contain the ID (of 373 checked mechanically)
- **Location (row → cited § → where it actually is or is not):** REQ-IDE-18 → 6.5 (never stated in the body); REQ-IDE-32 → 5.8 (stated in 5.4); REQ-DATA-35 → 6.4/12.4 (absent); REQ-DATA-36 → 6.4 (absent); REQ-GATE-10 → 6.5 (stated in 6.4); REQ-VIZ-1 → 7.5 (absent); REQ-VIZ-2 → 7.5 (absent; the `alt` ≤250 rule is stated without the ID); REQ-INGEST-4 → 9.5 (absent); REQ-SPEC-2, -3, -4, -5 → their cited sections (none of the five REQ-SPEC IDs except REQ-SPEC-1 appears in the body).
- **Problem:** §0.1 promises "where it lands in this spec" per ID; a ticket writer following the index for these twelve lands on prose that never names them and must infer the amended text (REQ-DATA-35/36 are marked *amended* yet the amended text is nowhere labelled).
- **Fix:** Insert the ten missing IDs at the sentence that carries them; correct the two wrong section numbers.

### 41. [major] Four acceptance-criterion labels are referenced but never defined
- **Location:** §9.3 "AC-P-A", §9.4 "AC-P-C", §9.5 "AC-I-A", "AC-I-B".
- **Problem:** These read like an AC register that exists only in design/8. Only five `**AC:**` hooks exist in the whole spec (REQ-PROD-6, REQ-VIS-3, REQ-BILL-3, REQ-BILL-5, §15.3), so the O6 promise that "requirements without an AC hook … need one written then" applies to ~360 of 373 rows.
- **Fix:** Either define AC-P-A/-C and AC-I-A/-B inline or drop the labels; add an "AC" column to Appendix A even if most cells read "to write (O6)", so the ticketing session can see the coverage.

### 42. [minor] Spot-check of 40 further IDs (REQ-IDE-1/5/8/13/23/27/33/43/44/47; REQ-VIS-3/9; REQ-DATA-5/7/14/21/32; REQ-BILL-3/4/6; REQ-GROWTH-1/11/13/16; REQ-ARCH-1/5/12/21/33; REQ-RUN-1/8/17; REQ-CHAT-2/10/15/25; REQ-GATE-1/5; REQ-VIZ-4/13; REQ-MOBILE-1/6/10; REQ-PERSONA-7/14/22; REQ-INGEST-5; REQ-PROD-6/9; REQ-WF-2; REQ-GENRE-4) — all resolve to the cited section with matching substance. The 368 design-ID count and family totals reconcile. No REQ ID cited in the body is missing from Appendix A.

### 43. [minor] `QualityTier` vs `ModelTier`
- **Location:** §14.5 "`QualityTier = 'base'|'balanced'|'frontier'`"; §11.3 `ModelTier`. **Fix:** one name.

---

## Lens 4 — Hand-off readiness (O6)

### 44. [major] The spec is not self-contained where it says it is — five contracts are "adopted by reference"
- **Location:** §3.5 analytics catalogue "design/9 §7.2's, adopted verbatim" (only four event names given); §10.5 mobile contracts/endpoints "design/7 §8's"; §11.3 "the full listing in design/3 §3.2 remains the reference"; §11.4 DDL "design/3 §3.3 … adopted with these changes"; §14.5 read models "design/4 §6.3's". §0.1: "nothing here requires opening a source to be understood."
- **Problem:** Tickets for the event catalogue, the API/mobile contracts, the schema and the usage read models cannot be written from this document; and the design documents are declared *superseded* wherever they disagree, so a ticket writer must diff two documents to know which fields survived the renames.
- **Fix:** Add Appendix E with the full analytics event list, the DDL (post-rename), the REST/internal/mobile endpoint table, and the usage read-model types — or explicitly change §0.1 to name the five design sections that remain normative.

### 45. [major] Phase manifests and estimator constants are given for only four of the seventeen catalogued workflows
- **Location:** §12.2 gives manifests for Review, Draft, Revise, Profile voice; §9.2 gives the Quick Voice formula; nothing for Outline, Fact-check, Cut to length, Figure (all MVP) or the v1 set; §16.3 #1 defers the numbers to instrumented runs but not the *shape* (phase keys, artifacts, `phaseClass`, `budgetShare`, `gateAfter`).
- **Fix:** Add a manifest stub table (key, index, label, artifact, gateAfter, phaseClass) for every §6.2 row; state the estimator as a formula per workflow (`a + b·words + c·claims`, tier and rigor multipliers) with provisional constants, so the estimator ticket has a signature even before calibration.

### 46. [minor] REQ → epic mapping is absent
- **Location:** §3.1 "each row becomes epic `EPIC-<n>`"; Appendix A has "Spec §" but no matrix row.
- **Fix:** Add an "Epic" column to Appendix A (many-to-one is fine).

### 47. [minor] Showcase project content is unspecified
- **Location:** §2.4 / §15.3 "a ~2,000-word essay's outline, v1, full-board dossier …"; ledger C23.
- **Problem:** The $0 activation is the top-of-funnel; which essay, whose voice, which protocol, and whether its URLs must still resolve at launch are open.
- **Fix:** Name the source (one of the three real projects, licensed) or add it to §16.3 with an owner.

### 48. [minor] `Approve sample` and `Continue?` expiry values are not mapped to `Gate.onExpiry`
- **Location:** §6.4 table vs §11.3 enum. **Fix:** add an `onExpiry` column to the §6.4 table.

### 49. [minor] The i18n lint (REQ-PROD-6, REQ-BILL-18) lacks its word lists in one place
- **Location:** banned words scattered across §4.3, §6.6, §14.1, §0.3. **Fix:** a single "Banned and reserved strings" list in Appendix D.

---

## Summary by severity

| Severity | Count | IDs |
|---|---|---|
| blocker | 4 | 1, 2, 3, 4 |
| major | 19 | 5–18, 31–34, 40, 41, 44, 45 |
| minor | 22 | 19–30, 35–39, 42, 43, 46–49 |

The three findings to fix first: **#1** (cost column mislabelled by rigor — every price surface and the estimator inherit it), **#2** (REQ-SPEC-1 contradicts the triage opt-in, run-to-completion, trial pre-approval and the override type), **#4** (the visibility policy cannot be contract-tested because MVP/v1 artifact kinds are unenumerated). #3 (the MVP plan card depends on a v1 workflow) should be resolved in the same pass.
