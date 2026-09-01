# Genres as protocols, the skill roadmap, and the persona system as a product

- Scope: ledger rows C2, C5, C16, A9, J1–J8 · theses tested: T5 (and T1/T2 where touched) · Date: 2026-08-27 · Sources fetched: 47 (plus 6 local `~/agent-discourse` documents read in full; 14 targeted pages could not be fetched and are listed under *Open questions / unverified*)

## Executive summary

**Genres (C2, C5).** Every genre surveyed has a real, named editorial practice — the magazine fact-check, the journal's originality/soundness split, the developmental→line→copy ladder, the op-ed's "to be sure" paragraph, Amazon's re-written six-pager — and every one of them is a *configuration* of the seven phases `editorial-review` already runs, not a new regimen. A genre in Rhema should therefore be a **protocol object**: rubric dimensions + anchors, venue bar (named exemplar venues and their published norms), phase toggles and depth, calibration language (verdict vocabulary), length/apparatus norms, integrity norms (what may not be machine-generated, what must be disclosed), and the artifacts the user is expected to already have. Recommendation for MVP: **four protocols — Academic (journal article / thesis chapter), Essay (Substack/blog/long-form opinion), Op-ed, and Business memo/report** — with Journalism, Creative nonfiction, Technical docs, Marketing copy, Speeches, and Fiction as v1.x additions in that order. Fiction is explicitly *not* MVP: the fact-check and discourse phases are wrong for it and the market already has a dedicated incumbent at $10–44/mo.

**Skills (A9, C16).** The four roadmap skills are fully specified below. Of fourteen invented candidates plus three of my own, **eight belong in v1** because they are cheap re-scopings of existing phases or are load-bearing for the MVP genres: `outline-from-research`, `fact-check-only`, `line-edit`, `cut-to-length`, `title-and-deck`, `abstract-and-keywords`, `visualize` (C12, operator-required), and `reverse-outline` (invented). `steelman` and `discourse-map` ship as v1 because they are already ~70% implemented inside `editorial-review` Phase 2–3. `loop-to-convergence` is v1 *as a gated orchestration*, never fully autonomous (the self-correction literature is unambiguous that unbounded loops degrade). `peer-review-simulation`, `reader-test`, `structured-dialogue`, `translate-register`, `literature-map`, `repackage-for-venue`, and `sharpen-thesis` are v2, each for a stated reason (mostly: they either require composite personas, an external scholarly index, or make claims the evidence does not support — audience simulation in particular).

**Personas (J1–J8).** `bootstrap-persona` maps cleanly onto the Run model with three run kinds (bootstrap / refresh / compose), one gate (census + sample + hold-out approval), and a persisted per-piece corpus-note step that makes partial refresh cheap. **T5 is confirmed with one amendment**: staleness has *four* inputs, not three — seed hash, sample-set hash, profile age, and *calibration status* (a profile with no hold-out test is "unfalsified," a distinct state from "stale"). Propose two cost tiers: **Quick Voice** (seed + ≤3 samples, no census, no hold-out; minutes, low single-digit dollars) and **Full Profile** (the real skill; tens of dollars at 10–12 pieces). On the lock question: **soft-lock after v1 with "fork under new persona"** — argued on the skill's own precedence rule (guidance > voice charter > persona), which makes a mid-project persona swap mostly a no-op for existing text and a homogenization hazard for new text. Composite personas: **data-model in MVP, UI in v1.x.** House-style personas: ship a small platform library sourced only from openly licensed style guides (Google CC-BY 4.0, Microsoft public, Diátaxis) plus *descriptive* venue profiles built from public archives; never redistribute AP/Chicago text.

## 1. Genres and jobs-to-be-done (C2, C5)

### 1.1 What "editorial review" means in each world

The founding premise of `editorial-review` (its README §2.1) is that elite review is four disciplines — magazine fact-checking, academic peer review, the levels-of-edit ladder, and argumentation theory — and the skill runs all four. Different genres weight the four differently and add their own gate. The table is the compressed finding of this section; the per-genre notes that follow give the evidence.

| Genre | Dominant discipline(s) | The genre's own gate | Verdict vocabulary the writer expects | Length norm (fetched) | Integrity norm (fetched) |
|---|---|---|---|---|---|
| Academic paper / thesis / grant | Peer review (originality, significance, validity, contextualization) + citation verification | "Does this survive R1/R2?"; for grants, "is it fundable and *mine*?" | accept / minor / major / reject | PLOS ONE abstract ≤300 words, title ≤250 chars [S37] | ICMJE: AI cannot be an author; disclose use in cover letter + text; author responsible for accuracy and plagiarism [S6]; NeurIPS 2025: no fabricated references, no submission text to LLMs by reviewers [S24]; NIH refuses applications "substantially developed by AI," caps 6/yr from 2025-09-25 [S7]; NSF: proposers "encouraged to indicate" AI use; reviewers prohibited from uploading proposals [S16] |
| Journalism / long-form reporting | Magazine fact-check (checker separate from writer, checks "individual facts as well as the big picture") [S17] | "Can every sentence be defended on factual grounds?" | publishable / needs checking / kill | (venue-set) | AP: AI output is "unvetted source material"; staff "do not use it to create publishable content" [S32] |
| Substack / blog essay | Argument critique + discourse map + voice | "Will *this* audience keep reading, and is it new?" | publish / revise / rethink | Substack has no limit; the operator's own profile records two length regimes (local) | Platform-level: none; reputational only |
| Op-ed | Argument + "to be sure" counterargument + timeliness | "Will an opinion editor take this *this week*?" | accept / pass | NYT 400–1,200; WaPo ≤750; WSJ 600–1,200; LAT ~750; USA Today 650–900; Globe ≤700 [S30] | Exclusivity to one outlet [S30] |
| Creative nonfiction / fiction | Developmental → line → copy ladder [S34]; margin notes + editorial letter | "Does the *experience* work?" (pacing, character, voice) | editorial letter; no verdict vocabulary | novel ~60–80k words (Reedsy pricing baseline) [S4] | Authors Guild: disclose substantial AI text; "do not use generative AI to purposely copy or mimic the unique styles, voices … of other writers" [S10]; KDP: AI-*generated* must be disclosed, AI-*assisted* need not [S19] |
| Business memo / report / whitepaper | Structure + argument + evidence; re-writing culture | "Can a room read this silently and decide?" | ship / rewrite | Amazon's "narratively structured six-page memos"; "great memos are written and re-written" [S8] | Internal; confidentiality dominates |
| Marketing copy | Brand voice + conversion; style-guide compliance | "On-brand and does it convert?" | on-brand / off-brand | short-form | 89% of B2B marketers already use AI copy tools; 87% say productivity improved, only 58% say quality did [S26] |
| Speech | Rhetoric, delivery, occasion | "Will it land in the room?" | (none formal) | by minutes, not words | none fetched |
| Technical documentation | Style-guide conformance + task-type fit | "Is it the right doc type and does it follow the guide?" | conforms / does not | n/a | Google dev style guide (CC-BY 4.0) [S41]; Microsoft Writing Style Guide (public) [S42]; Diátaxis four types [S9] |

### 1.2 Per-genre notes

Each note separates *Observed* (fetched) from *Inferred*, and ends with the Rhema analogue.

**Academic (papers, theses, grant proposals).**
*Observed.* Global output is in the millions of articles per year (STM-derived figures via secondary search: 4.2–4.7M records in 2020, 5–6.5% growth in 2021 — the STM 2024 report itself could not be fetched [unverified]). The integrity regime is the strictest of any genre and is converging: ICMJE forbids AI authorship and requires disclosure "in both the cover letter and the submitted work" [S6]; NeurIPS 2025 permits LLM use in preparation but prohibits "unverified LLM-generated content, such as fabricated references" and bars reviewers from sharing submission text with LLMs [S24]; NIH will not accept applications "substantially developed by AI" and, after observing PIs submitting "more than 40 distinct applications in a single … round," capped submissions at six per year [S7]; NSF prohibits reviewers from uploading proposal content to non-approved AI tools [S16]. Reviewer-side LLM use is already 6.5–16.9% of ICLR/NeurIPS reviews and correlates with low confidence and deadline proximity [S23]; the ICLR 2025 feedback-agent RCT (20k reviews) found 27% of reviewers revised after LLM feedback, adding ~80 words and more specificity [S28]. Willingness to pay: Elicit charges $49/mo Pro and $169/mo Scale for literature workflows [S40]; Grammarly Pro is $12/mo [S3]; Paperpal pricing could not be fetched.
*Inferred.* The JTBD is not "write my paper" — the integrity norms make that a liability — but "make my draft survive review": verified citations, a steelmanned contribution statement, a simulated R1, and an honest verdict. That is precisely `editorial-review`'s shape, which is why the operator's MVP intuition (Q-15) is right. Grant proposals are a *sub-protocol*: same phases, but the "contribution" dimension becomes "specific aims / significance / innovation / approach," and the integrity floor is harder (NIH's phrasing). Theses are the same protocol at chapter granularity with a committee, not a journal, as venue.
*Rhema analogue.* Protocol `academic` with variants `journal-article`, `thesis-chapter`, `grant-proposal`; each carries a **disclosure-statement generator** (ICMJE/NeurIPS-shaped) as an export artifact — the platform's integrity feature, not a gate (Q-11 concerns personas, not academic disclosure; this is a *service* to the user).

**Journalism / long-form reporting.**
*Observed.* The KSJ handbook's three models: magazine (dedicated checker verifies "everything in a near-finished piece, which includes individual facts as well as the big picture"), newspaper (journalists check their own; editors spot-check), hybrid [S17]. AP's standard: "Any output from a generative AI tool should be treated as unvetted source material"; staff "do not use it to create publishable content"; "You still have to be a journalist" [S32]. AP's own page and BBC's guidance were unfetchable (blocked); the AP language is quoted via Poynter.
*Inferred.* The artifact a reporter already has is not an outline but *notes, transcripts, and documents* — a different intake than `draft-from-outline` assumes. The JTBD is verification and libel-safety, not drafting. The genre's willingness to pay is institutional (newsrooms), not individual, and newsroom policy currently forbids exactly the drafting half of Rhema.
*Rhema analogue.* Protocol `reporting` in v1.x: `editorial-review` with `verification` mandatory, `discourse` optional, a **source-and-quote ledger** (who said what, on what record) added to the claim ledger, and `draft-from-outline` disabled by default. This is the one genre where "review-only" is the honest product.

**Substack / blog essays.**
*Observed.* Substack announced 4M paid subscriptions in Nov 2024 and 5M in March 2025 [S35]; an independent analyst notes it had not confirmed 6M by May 2026 and calls the growth "a real slog" against its $1.1B valuation [S29]; a secondary aggregator reports ~100k publications earning money (Apr 2026) and $450M gross writer revenue in 2025, with nearly half of paid creators earning under $500 [S5 — secondary, its own sources are tertiary; a widely circulated "8.4M paid" figure has no primary source [S29]]. Substack takes 10% [S35]. The operator's own bootstrapped persona (local `sjs-substack/profile/index.md`) documents the venue's mechanics: two length regimes, five registers, roman-numeral sections, no apparatus.
*Inferred.* Tens of thousands of writers earn *something*; the serious tail (10k+ publications past 1,000 paid subscribers, per [S5]) is the paying segment, and its JTBD is "publish weekly at a quality I can't sustain alone": discourse-map for originality, reception forecast, and voice preservation. This is the genre where the persona system is the differentiator — no incumbent does a measured, hold-out-tested voice profile (Sudowrite injects raw prose samples [S43]; Jasper generates an editable voice description from ≤8 samples [S2/search]; Grammarly offers tone, not voice [S3]).
*Rhema analogue.* Protocol `essay` — the operator's own use case; the default protocol for the persona-less "Unfiled" project space should probably be *this*, not academic, because it has the fewest apparatus requirements and the widest audience.

**Op-eds.**
*Observed.* Word counts and exclusivity per outlet [S30]; structure = lede, argument, ~3 supporting points, a "to be sure" paragraph that "acknowledges potential weaknesses and addresses counterarguments," conclusion; editors want timely, evidence-based, distinct pieces; do not simultaneously submit to multiple national papers [S18].
*Inferred.* The op-ed is `editorial-review` at miniature scale with two extra checks — a news peg (timeliness) and outlet fit (length + exclusivity). The "to be sure" paragraph *is* Phase 2's strongest-counterargument requirement made structural. Cheap to add; high value as a trial-tier demo because a full review of 750 words is a fraction of the $50–100 extreme (Q-10).
*Rhema analogue.* Protocol `op-ed`: `stage: near-final` default, `discourse` on, `second_read` on, `cut-to-length` bound to a target outlet from a venue table seeded with [S30].

**Creative nonfiction / fiction.**
*Observed.* A developmental edit delivers margin notes plus an editorial letter assessing "structure, pacing, characterization, plot development, voice, and dialogue"; for nonfiction, "argument clarity and organization"; cost 2.6–5.3¢/word (avg 3.05¢; ~$1,830 for 60k words) [S34]; the full ladder for an 80k manuscript runs $1,920–$4,560 [S4]. EFA benchmark hourly ranges (via secondary [S38]; the EFA chart itself was Cloudflare-blocked): developmental $55–80/hr, line $46–60, copy $36–45, proofreading $31–40; nonfiction consistently priced above fiction. Sudowrite prices $10/22/44 per month on credits [S1] and matches voice by injecting "at least five paragraphs" to "a full chapter" of the author's prose as persistent context [S43], via a Story Bible whose Style section is filled manually or by "Match My Style" [S44]. Authors Guild: disclose substantial AI text; do not mimic other living writers' styles [S10]. KDP distinguishes AI-generated (disclose) from AI-assisted (no disclosure) [S19].
*Inferred.* Fiction's editorial review has no fact-check, no discourse map, and a different rubric entirely (pacing, POV, character arc). Porting `editorial-review` would mean replacing 3 of 7 phases. Creative *nonfiction* (memoir, reported essay) is closer — but its dominant failure is fabricated first-person experience, which `draft-from-outline`'s principle 4 already forbids the machine from supplying. The market has an incumbent (Sudowrite) built for fiction and priced low.
*Rhema analogue.* `creative-nonfiction` protocol in v1.x (verification of the reported parts; developmental/line split; an "only-the-author-can-supply" gap list surfaced as a gate). Fiction: **explicitly deferred**; if ever, as a separate rubric family, not a toggle set.

**Business (memos, reports, whitepapers).**
*Observed.* Bezos: "We don't do PowerPoint … we write narratively structured six-page memos"; quality "varies widely"; authors "underestimate scope"; "The great memos are written and re-written, shared with colleagues who are asked to improve the work, set aside for a couple of days, and then edited again with a fresh mind" [S8]. That last sentence is a description of the Rhema loop — colleagues' improvement (review), setting aside (fresh context), editing again (respond).
*Inferred.* JTBD: "make this survive the silent read." Rubric: decision clarity, evidence, structure, anticipation of objections; length is hard-capped (six pages) so `cut-to-length` is load-bearing. Whitepapers add the marketing overlay (a thesis you are selling). Confidentiality dominates integrity norms, which makes web discourse-mapping *less* relevant and the fact-check of internal numbers *impossible* from the open web — the claim ledger must support "verified against user-supplied source" as a verdict.
*Rhema analogue.* Protocol `memo` (MVP): `discourse` off by default, `verification` on with **user-supplied-source** verdicts, length norm = page budget, rubric swaps *Originality & situatedness* for *Decision readiness*. Reasoning for MVP inclusion: it is the highest-willingness-to-pay individual segment after academics (salaried professionals, expensable), and it exercises the same machinery with the *fewest* new phases.

**Marketing copy.**
*Observed.* 95% of B2B marketers report AI use, 89% use AI content tools; the top challenge is "creating content that prompts desired action" (40%); "87% say productivity has improved" but only "58% say content quality has improved" [S26]. Jasper Pro is $59–69/mo with 2 brand voices, 5 knowledge assets, 3 audiences; Business adds a Style Guide "with rules enforcement" and unlimited voices [S2].
*Inferred.* A crowded, price-anchored market where the buyer is a team and the JTBD is throughput and brand conformity — the opposite of Rhema's "elite bar per piece" economics. The quality gap [S26] is real but the unit of value (short copy) cannot carry a $50 review.
*Rhema analogue.* No MVP protocol. A house-style persona plus `line-edit` covers the "on-brand" job in v2 if demanded; do not build a copy product.

**Speeches.**
*Observed.* Only salary aggregates were findable (Salary.com ~$137k average, secondary, not fetched); the Professional Speechwriters Association survey is members-only. No editorial-practice source fetched.
*Inferred.* Genre bar is oral: cadence, length-in-minutes, applause lines. The voice-print machinery (sentence length, rhythm) transfers; the review phases mostly do not.
*Rhema analogue.* Deferred; noted as a *register* (a persona member), not a protocol.

**Technical writing.**
*Observed.* Diátaxis's four documentation types (tutorial, how-to, reference, explanation) keyed to user need [S9]; Google's developer documentation style guide is CC-BY 4.0 [S41]; Microsoft's Writing Style Guide is public ("warm and relaxed, crisp and clear") [S42].
*Inferred.* Review here is conformance + type-fit: "this is a tutorial pretending to be reference." Openly licensed guides make this the *cheapest* genre to ship house-style personas for, and the rubric is nearly mechanical. Willingness to pay is institutional (docs teams).
*Rhema analogue.* Protocol `docs` in v1.x, primarily as a showcase for platform house-style personas (§3.6).

### 1.3 A genre is a protocol: the object that generalizes `editorial-review`

*Observed (local).* `editorial-review` already takes `venue`, `stage`, `persona`, `register`, and three phase toggles, and its rubric is eight fixed dimensions with entailment caps and a five-word verdict vocabulary (`references/rubric.md`). `draft-from-outline` takes `venue`, `length`, and an apparatus budget derived from "the venue's published work." The README calls the skills "draft-agnostic": calibration targets "are inputs or inferred and declared, never hardcoded." So the genre layer is *input defaults plus a rubric swap*, and nothing in the phase bodies needs to change.

*Recommendation.* Define a `Protocol` entity (F1 addition) with these fields; every field is something a skill already reads as an input or a reference file:

| Field | What it configures | Academic (MVP) | Essay (MVP) | Op-ed (MVP) | Memo (MVP) |
|---|---|---|---|---|---|
| `rubric` | dimension list + anchors + caps | the 8 existing dimensions | 8 existing; *Voice & audience fit* weighted in the letter | 8 existing + *Timeliness*; *Structure* anchors from [S18] | swap *Originality* → *Decision readiness*; add *Scope discipline* |
| `venue_bar` | named exemplar venues whose published norms set "4 = publishable" | user's target journal/committee | user's own archive (persona) or a named Substack | outlet table [S30] | "six-pager read silently" [S8] |
| `phase_toggles` | defaults for `verification`, `discourse`, `second_read`, `grounding`, `audit`, line depth | all on; `stage` inferred | all on | all on, `stage: near-final` | `discourse` off; `verification` on with user-supplied-source verdicts |
| `calibration_language` | verdict vocabulary the letter uses | accept / minor / major / reject / reject premise | publish / revise / rethink | run / pass (with "why not this week") | ship / rewrite / needs data |
| `length_norms` | target words or pages; apparatus budget | journal limits (e.g., abstract ≤300 [S37]) | persona's regimes | outlet word cap | page cap |
| `integrity_norms` | what the machine may not supply; disclosure artifact | ICMJE/NeurIPS-shaped disclosure statement [S6][S24]; no fabricated refs | none | exclusivity reminder | confidentiality: no web fetch of internal data |
| `intake_expectations` | artifacts the user typically already has | outline/notes + bibliography + prior drafts | notes or nothing | a take + a news peg | data + decision + audience |
| `review_vocabulary_hints` | how findings are phrased ("R1 would say…") | reviewer-voice | editor-voice | opinion-editor-voice | executive-reader-voice |

*Alternatives rejected.* (a) One universal rubric with genre "weights" — rejected because the rubric's power is its *caps* (a contradicted Tier-1 claim caps Evidence at 2), and caps are boolean per dimension; weights would reintroduce the aggregate score the rubric bans. (b) Separate skill forks per genre — rejected: four copies of a 500-line regimen drift, and the operator's IP (E5) is the phase machinery, not the rubric prose. (c) Fully free-form user-defined protocols in MVP — rejected for cost predictability (C14) and support burden; expose protocol *editing* of the safe fields (length, venue, toggles) in v1, rubric editing later.

### 1.4 MVP genre set

*Recommendation:* Academic, Essay, Op-ed, Memo. Reasons: (1) all four are `editorial-review` with defaults changed and at most one rubric dimension swapped; (2) they span the three willingness-to-pay pools that are *individual* (academics, independent writers, salaried professionals) rather than institutional (newsrooms, docs teams, marketing teams); (3) Op-ed gives the trial tier (D18) a full-regimen demo at a fraction of Q-10's cost curve; (4) Memo forces the user-supplied-source verdict path early, which every genre needs eventually. *Rejected for MVP:* Journalism (institutional buyer; policy forbids the drafting half), Fiction (different rubric family, incumbent), Marketing (throughput economics), Speeches (oral bar), Docs (institutional; but cheapest v1.x add via house styles).

## 2. Skills: the roadmap and the invented candidates (A9, C16)

### 2.1 Specification template and cost classes

Each skill below is given: purpose · phases · inputs · artifacts · human gates · cost class · grounding · v1 verdict. Cost classes are *inferred* from the one anchor the operator supplied (Q-10: $50–100 per full run of a 15k-word, 70-citation piece on a frontier model) and the phase structure of the skills; they must be replaced by measured numbers (A7, C14):

| Class | Meaning | Rough $ (frontier model) | Typical shape |
|---|---|---|---|
| C0 | one or two calls, no research, no subagent | < $0.50 | retitle, abstract |
| C1 | several calls over the whole draft, no web research | $0.5–3 | line-edit, cut-to-length, reverse-outline |
| C2 | one research-bearing phase or one fresh-context subagent | $3–15 | fact-check-only on a short piece, steelman, second read |
| C3 | multiple research phases, one piece | $15–50 | discourse-map, outline-from-research, quick-voice bootstrap |
| C4 | the full regimen | $50–100+ | editorial-review, draft-from-outline, respond-to-review, full bootstrap |

### 2.2 Roadmap skills (README "Roadmap"; A9; Q-16)

**`steelman`** — *construct the strongest opposing essay to a draft's thesis, as a pre-writing stress test.*
- *Purpose.* Give the author the best case against them *before* an editor finds it. The `editorial-review` skill already requires "steelman before you attack" (principle 2) and Phase 2 finds "the strongest existing counterargument"; `steelman` externalizes that into a standalone artifact the author can answer.
- *Phases.* (0) Intake: reconstruct the thesis and argument skeleton (reuse Phase 0 of `editorial-review`). (1) Rapoport pass: restate the piece's position "so clearly, vividly, and fairly that your target says, 'Thanks, I wish I'd thought of putting it that way'"; list points of agreement; state what was learned — Dennett's rendering of Rapoport's rules [S33] — *before* any objection. (2) Opposition research: fetch the actual best published objections (Phase 2 machinery) and record source notes. (3) Compose the opposing essay at the piece's own length regime and venue bar, in a neutral register (never the persona's voice — the point is that the author cannot dismiss it as pastiche). (4) Vulnerability map: for each of the piece's load-bearing inferences, the objection that lands, with the disanalogy or counter-evidence, ranked. (5) Fresh-context adjudication (optional, subagent): given both essays unlabeled, which is stronger and why — the *reasons* are the deliverable, per the bootstrap calibration protocol's "record them verbatim as diagnostic; do not treat the verdict as a score."
- *Inputs.* `draft` or `thesis + outline`; `venue`; `persona` (positions/continuity only — so the steelman can cite the author's own prior commitments against them); `research` toggle.
- *Artifacts.* `correspondence/vN-steelman/{00-restatement.md, 01-opposition-sources.md, steelman-essay.md, vulnerability-map.md, 05-adjudication.md}`; written by the **editor** seat (it is adversarial reading), so it lands in the editor's memory and the author sees only the delivered files.
- *Gates.* None required; one optional pause after Phase 1 ("is this restatement fair?") — the Rapoport restatement is the cheapest place for the human to correct a misreading.
- *Cost.* C2 without research, C3 with.
- *Grounding.* Debate between capable models measurably improves a weaker judge's accuracy — 76%/88% with debate vs 48%/60% naive baselines for human judges [S14]; multi-agent debate improves factuality and reasoning [S13]; LLMs are more persuasive than humans in debate when personalized (81.7% higher odds of agreement shift) [S46] — which is a *warning* as much as a capability: the steelman must be evidence-bound (source notes, the `editorial-review` verification standard) or it becomes a persuasion engine against the author's true position. Rapoport's rules [S33] supply the professional discipline.
- *Verdict.* **v1.** Cheap, differentiated, and a natural pre-write step between `outline-from-research` and `draft-from-outline`. Argue-against: it overlaps Phase 2; answer: as a standalone it runs *before* a draft exists, which Phase 2 cannot.

**`discourse-map`** — *map a question's live discursive terrain before writing begins.*
- *Purpose.* Phase 2 of `editorial-review` as a pre-writing skill: predecessors and neighbors, originality verdict for a *proposed* thesis, strongest existing counterargument, misrepresentation risks, reception forecast — plus the thing a pre-write map can do that a review cannot: identify the *open position* the piece could occupy.
- *Phases.* (0) Question intake: the thesis candidates and key terms (from chat, outline, or a sentence). (1) Strata search: academic literature, books, essays, online discourse — the skill's existing instruction — with the boundary rule that results are *notes*, not corpora. (2) Map: positions, their holders, their best statements (quoted, ≤40 words, URL), agreements/disagreements as edges. (3) Originality-in-advance: which of the candidate theses is novel / a synthesis / a restatement / a reinvention, per the existing four-way classification. (4) Occupiable ground: the claims nobody defends well, the counterargument nobody answers. (5) Reception forecast for each candidate.
- *Inputs.* `question` or `thesis[]`; `strata` (academic / general / online / all); `depth` (cap on sources); `persona` (continuity: what the author already argued).
- *Artifacts.* `agents/author/research/discourse-map/{map.md, sources/*.md, originality.md, open-ground.md}` — **author** seat, because it feeds drafting; the editor re-derives its own in review (the boundary rule's "the savings is the contamination").
- *Gates.* A single approval at the end ("choose the thesis / occupiable ground to pursue") — this gate is where `outline-from-research` begins.
- *Cost.* C3 (dozens of searches).
- *Grounding.* STORM-style pre-writing research (perspective-guided question asking; already cited in `draft-from-outline`'s README) and Co-STORM, where agents "ask questions on the user's behalf, allowing the user to discover unknown unknowns," organize findings into "a dynamic mind map," and 70%/78% of participants preferred it to search / a RAG chatbot [S15]. The interactive-map UI Co-STORM describes is the natural D9 surface for this skill.
- *Verdict.* **v1.** The phase already exists; the delta is an author-seat artifact and a map view. Argue-against: it duplicates review Phase 2 and doubles research cost across a project. Answer: the two seats *must* not share it (boundary rule); accept the cost, and show it as a feature ("the editor mapped the field independently and agreed/disagreed").

**`loop-to-convergence`** — *drive review ↔ respond rounds to a convergence criterion.*
- *Purpose.* The `orchestrate-build` pattern from the sibling repo (read locally): state on disk (the manifest's round log), cognition in fresh contexts (each round's skills), sequencing as a dumb loop.
- *Phases.* (0) Criterion intake: one of — verdict reaches *minor revisions*; all rubric dimensions ≥ N with no caps triggered; round budget K; spend budget $X; or "no major issue survives two rounds." (1) Loop: `editorial-review(vN)` → gate → `respond-to-review` → gate → check criterion. (2) Stall detection: if the rubric does not move and the same major issue recurs across two rounds, stop and escalate ("the editor and author disagree on X; you decide"). (3) Report: the trajectory (scores per round, major-issue lineage, spend).
- *Inputs.* `criterion`, `max_rounds` (default 3), `budget_usd`, `autonomy` (auto / checkpoint / manual — the exact vocabulary of `orchestrate-build`), `guidance` carried into each response round.
- *Artifacts.* `manifest.md` round log (existing) + `correspondence/convergence-report.md`; no private memory of its own — the loop is stateless by design.
- *Gates.* **On by default at every round boundary** (Q-7). `autonomy: auto` is allowed only with a hard `max_rounds` and `budget_usd`.
- *Cost.* K × (C4 + C4). At the extreme this is $100–200 per round; the estimate-before-run (T7) is mandatory.
- *Grounding.* Iterative refinement helps *once*: Self-Refine reports ~20% absolute average gains from generate→feedback→refine but gives no stopping rule [S11]; intrinsic self-correction without external feedback "at times … degrades" performance [S12]; and Kamoi et al. (repo README) locate the reliable regime in *verification easier than generation*. The design consequence is that convergence must be judged by the **external, evidence-bearing signals** the loop already produces (claim-ledger verdicts, capped rubric dimensions, second-read thesis agreement), never by the model's own sense of "done" — and that the loop must stall-detect, because a review/response pair that oscillates is the self-correction degradation case in a two-seat costume. The homogenization evidence in `respond-to-review`'s README (voice drift persists in direction under voice-preserving prompts) argues for a *hard* round cap: each round is a homogenization exposure.
- *Verdict.* **v1, gated.** Argue-against: at Q-10 prices an autonomous 3-round loop is a $300–600 button — a support and refund hazard (L8). Answer: ship it as the visible "Run next round" affordance with a criterion picker and cumulative spend meter, default `checkpoint`; expose `auto` only above a plan tier.

**`structured-dialogue`** — *tooling for exchanges between positions.*
- *Purpose.* A turn-based, evidence-bound exchange between two or more *positions* (not personas) on a question — a debate transcript the author can mine, or a dialogue-form piece.
- *Phases.* (0) Position intake (from `discourse-map` or the user). (1) Rounds: each side's turn must cite (source notes) or concede; a moderator agent enforces the Rapoport restatement before each rebuttal. (2) Judge pass in fresh context (which argument moved, why). (3) Distillation: the cruxes, the concessions, the unresolved.
- *Inputs.* `positions[]`, `rounds`, `evidence: required|optional`, `output: transcript|cruxes|dialogue-piece`.
- *Artifacts.* `agents/author/research/dialogues/<slug>/{transcript.md, judgment.md, cruxes.md}`.
- *Gates.* Pause between rounds optional; approval before the dialogue is promoted into a draft.
- *Cost.* C2–C3 depending on rounds and research.
- *Grounding.* Multi-agent debate [S13] and the debate-judging results [S14] are the direct precedent; the caveat from the review skill's README — persona review-boards are "a tool for *studying* reviewer bias, not adding rigor" (AgentReview) — means the dialogue is valuable as *material* and as an adjudication aid, not as a verdict.
- *Verdict.* **v2.** It depends on `discourse-map` and `steelman` for its inputs and has no MVP genre that requires it; the transcript UI is non-trivial (D9). Argue-for: it is the skill most obviously "discourse"-branded. Answer: brand later, ship the two skills it composes from first.

### 2.3 Invented candidates from the ledger (C16)

**`outline-from-research`** (chat → official outline).
Purpose: turn an in-IDE research session (D9) into the `outline` artifact `draft-from-outline` consumes — the operator's explicit requirement. Phases: (0) harvest the chat: claims, sources actually fetched (with URLs), decisions the user made, refusals; (1) classify into the four `draft-from-outline` Phase-0 classes (commitment / advice / material / alternatives) *now*, so the outline arrives pre-triaged; (2) propose a spine (5–12 claims) and section map with provenance per bullet; (3) gaps list. Inputs: `session`, `thesis` (optional), `venue`, `length`. Artifacts: `agents/author/outline/<slug>.md` with a provenance header (which session, which sources) — plus the source notes migrated into `agents/author/research/`. Gates: **one, mandatory** — the outline is the last cheap moment (the skill's own Phase-2 gate logic). Cost: C1–C2 (no new research; only re-fetch to confirm URLs). Grounding: the repo's own finding that outlines "produced with a research assistant, human or machine, [are] exactly where fabricated and misattributed references live" — hence the provenance header and the re-fetch; STORM's outline-from-perspectives (repo README). Verdict: **v1, MVP-critical**: it is the bridge from the founding prompt's "ChatGPT-level session" to the pipeline.

**`sharpen-thesis`.**
Purpose: from a muddy draft or note, produce 3–5 candidate theses, each "clear, contestable, and consistently the same claim," with what each commits the piece to and refuses. Phases: extract → candidates → for each, the strongest objection (mini-steelman) and the venue's appetite. Cost: C0–C1. Grounding: `editorial-review` Phase 3's thesis-discipline test (motte-and-bailey), and the second-read divergent-thesis diagnostic. Verdict: **v2** — its job is done adequately by the chat plus `discourse-map` Phase 3; as a button it is a C0 nicety, so cheap to add later that it should not consume MVP design attention.

**`fact-check-only`.**
Purpose: Phase 0 (claim inventory) + Phase 1 (verification) of `editorial-review` alone, with the ledger as the deliverable. Inputs: `draft`, `tiers` (Tier-1 only / all), `sources: web|user-supplied|both`. Artifacts: `correspondence/vN-factcheck/01-claim-ledger.md` (immutable once delivered). Gates: none. Cost: C2 for a short piece, C3 for a citation-dense paper. Grounding: verification is the regime where models are reliable (Kamoi, repo); FActScore's atomic-fact decomposition and retrieval-based verification at <2% estimator error [S20] is the same architecture at scale; ChatGPT's 58% biographical factuality [S20] is the reason it sells. The magazine model [S17] and AP's "unvetted source material" rule [S32] are the professional practice. Verdict: **v1, MVP** — the most legible trial-tier product ("one free fact-check"), and the *only* Rhema feature a newsroom's policy would permit today.

**`line-edit`.**
Purpose: the line level of the levels-of-edit ladder as a *suggestion-mode* pass — patterns with exemplars applied where they occur, never a "general polish." Phases: (0) load voice charter/persona voice print (author seat); (1) pattern scan (register hazards, economy, clarity) producing anchored suggestions; (2) apply as tracked changes, not rewrites. Inputs: `draft`, `depth` (patterns-only / full), `persona`. Artifacts: a suggestion set anchored to ranges (H3/H4), plus a short note of patterns found. Gates: the user accepts/rejects suggestions — the gate *is* the UI. Cost: C1. Grounding: EFA/Reedsy price line editing between developmental and copy ($46–60/hr; 4–8¢/word [S38]) — a clear paid job; the homogenization findings (repo, `respond-to-review` README: voice-preserving prompts reduce magnitude ~32% but not direction) are why it must be suggestion-mode with untouched text byte-identical, and why it runs in the author seat with the voice print loaded. Verdict: **v1.** Argue-against: Grammarly does this for $12/mo [S3]. Answer: Grammarly has no voice print; Rhema's line edit is *rationed against the author's measured signatures*, which is the differentiator worth naming in the UI ("3 em-dashes over your ration").

**`cut-to-length`.**
Purpose: reduce a draft to a venue's cap by *structural* cuts (the `draft-from-outline` Phase-5 rule: "cut from the over-budget sections, not uniformly — uniform trimming removes the specifics"). Phases: reverse-outline → budget per section → cut list with reasons → apply → seam read. Inputs: `draft`, `target` (words or a venue from the outlet table [S30]), `protect` (passages). Artifacts: new draft version + `cut-list.md` (preserved so a later round can restore). Gates: approve the cut list before applying. Cost: C1. Grounding: op-ed caps [S30], Amazon's page cap [S8], journal limits [S37]. Verdict: **v1, MVP** (required by Op-ed and Memo protocols).

**`title-and-deck`.**
Purpose: title/subtitle/deck candidates in the persona's title grammar (the profile's `structure-repertoire.md` records "title and subtitle conventions"), each with the promise it makes and whether the piece pays it off. Cost: C0. Grounding: the promise/payoff table in `draft-from-outline` Phase 2; the short-title citation-advantage paper could not be fetched (blocked) — *unverified*. Verdict: **v1** — trivially cheap, high-frequency, and a natural "ask the author agent" action in the editor.

**`abstract-and-keywords`.**
Purpose: abstract to a journal's limit and structure (PLOS ONE: ≤300 words; objectives, how, results and significance; no citations [S37]), keywords, plus highlights/plain-language summary where the venue wants them; every sentence in the abstract must be traceable to a claim-ledger row (no new claims in an abstract). Cost: C0–C1. Verdict: **v1** for the Academic protocol; fold into a `submission-pack` later (§2.4).

**`peer-review-simulation`** (journal-style R1/R2).
Purpose: two or three reviewer reports in the venue's review form (summary / strengths / weaknesses / questions / score — NeurIPS's form, repo README), plus an area-chair meta-review. Phases: Phase 0–3 of `editorial-review` with the *rubric replaced by the venue's form*; each reviewer report from a fresh context given a different *assigned concern* (soundness / novelty / clarity), not a personality. Cost: C3–C4. Grounding: the repo's own evidence that persona review boards re-skin one judgment (AgentReview) and that fresh-context second reads add ~a third of findings (Liang) — so reviewers must be *fresh contexts with distinct assigned concerns*, not "the harsh methodologist." The ICLR RCT shows LLM feedback improves *human* reviews (27% revised; +80 words; more specific) [S28] — the strongest evidence that the review-form genre is machine-tractable. Integrity: this simulates the *author's* pre-submission check; it must never be marketed as a tool for actual reviewers (NeurIPS/NSF prohibitions [S24][S16]). Verdict: **v2**, because in MVP the Academic protocol's `editorial-review` with `calibration_language = accept/minor/major/reject` already *is* an R1; the multi-report format is a presentation layer worth adding once the anchored-findings UI (D6) exists.

**`literature-map`** (academic).
Purpose: `discourse-map` over a scholarly index rather than the open web: citation neighborhood, key reviews, the exact gap. Requires an index: Semantic Scholar's API (214M papers, 2.49B citations; keyed access at 1 rps introductory [S39]) or OpenAlex (CC0 data; free tier with 10× via free key; pay-as-you-go at ~$0.0001/call [S36]). Elicit sells this workflow at $49–169/mo [S40]. Cost: C3. Verdict: **v2** — genuinely valuable for Academic, but it is an integration project (G3) and the MVP's discourse phase already reaches the open web. Prefer OpenAlex (CC0, cheap) when built.

**`reader-test`** (audience simulation).
Purpose: simulate N readers of the target audience and report where they bounce, what they take the thesis to be, what they quote. Grounding is *against* it as a measurement: silicon samples reproduce group *means* [S22] but "ChatGPT sampling is not reliable for statistical inference" — 48% of coefficients differed significantly from the human baseline, with less variance and instability across prompt wording and model versions [S31]. Verdict: **v2 at most, and reframed**: not "what 100 readers think" but the existing second read run *k* times with distinct assigned reader stances drawn from the reception forecast — labeled as forecast, never as data. Argue-for: it is a delightful demo. Answer: the demo lies, and the rubric's "no laundering" principle should extend to the product.

**`repackage-for-venue`.**
Purpose: from a finished piece, produce the same argument for a second venue (journal article → op-ed; memo → blog post) under the protocol object's length/apparatus/register norms. Phases: reverse-outline → new structure plan at the target length → draft → fidelity audit against the *source piece* (not an outline). Cost: C3. Verdict: **v2** — it depends on `translate-register` for the voice half and on composite personas (§3.5) to route the register; `cut-to-length` covers the MVP need.

**`translate-register`** (via composite persona).
Purpose: rewrite a piece from one member register of a composite persona to another (academic → essay). Grounding: text style transfer is a well-defined task with a content-preservation/style-strength tradeoff and hard evaluation problems (survey of 100+ papers [S45]); the repo's composite rule — "resolve to exactly one member … never blend two" — is exactly the constraint that makes it tractable. Verdict: **v2** — requires composite personas in the UI.

**`visualize`** (C12).
Purpose: from a selection or a chat request, produce a chart/figure/table/diagram with caption, alt text, and source line, inserted at the right location, iterable. Phases (LIDA's decomposition, which is the right architecture: summarizer → goal explorer → visgenerator → infographer [S21]): (0) data intake (user-supplied table/CSV or numbers already in the claim ledger — never numbers the model "remembers"); (1) chart-spec generation (Vega-Lite/Mermaid as *live spec*, rendered to SVG/PNG for export — spec is the source of truth so "make it a bar chart" is a spec edit); (2) render in sandbox; (3) caption + alt + source; (4) insert as a project asset with a figure ledger row. Review integration: `editorial-review` Phase 1 treats each figure's data as Tier-1 claims (the figure ledger row is what it checks). Gates: preview-before-insert. Cost: C1. Grounding: [S21]; precedent in the operator's `structure-of-political-difference/drafts/figures/`. Verdict: **v1, MVP** (operator decision Q-8/C12). Add one invariant from the fact-check discipline: a figure whose data has no ledger provenance renders with an `[unverified data]` badge.

### 2.4 Three further inventions

**`reverse-outline`** — produce the outline *the draft actually has* (one line per paragraph: its claim, its function, its entry/exit), diffed against the plan or the intended outline. It is the cheapest structural diagnostic there is, is a component of `cut-to-length`, `repackage-for-venue`, and the fidelity audit's "outline-restatement tests," and is the basis of the "what changed and why" view (D7). Cost C1. **v1.**

**`elicit-from-author`** — a short structured interview generated from the gaps only the author can supply (first-person experience, unpublished data, a decision among the outline's alternatives, the memo's actual recommendation), run as a chat, with answers written into `guidance`. Grounding: `draft-from-outline` principle 4 ("never invent what only the author can supply") and its Phase-0 "open questions" — today those are dumped in a note; this turns them into the gate UI. Cost C0. **v1** (it is mostly UI over an existing artifact).

**`submission-pack`** — for Academic: cover letter, abstract, keywords, highlights, disclosure statement (ICMJE/NeurIPS-shaped [S6][S24]), formatting to a venue's limits [S37], reference check against the claim ledger. For Op-ed: the pitch email with exclusivity line and word count [S30]. Cost C1. **v1.x** (after export, H7/C15).

### 2.5 The v1 verdict table

| Skill | Verdict | Cost | Seat | Why now / why not |
|---|---|---|---|---|
| outline-from-research | v1 (MVP) | C1–C2 | author | the chat→pipeline bridge the founding prompt requires |
| fact-check-only | v1 (MVP) | C2–C3 | editor | trial product; only newsroom-permissible feature |
| cut-to-length | v1 (MVP) | C1 | author | required by Op-ed and Memo protocols |
| visualize | v1 (MVP) | C1 | author | operator requirement (C12) |
| line-edit | v1 | C1 | author | rationed-against-voice-print differentiator |
| title-and-deck | v1 | C0 | author | trivial, frequent |
| abstract-and-keywords | v1 | C0–C1 | author | Academic protocol |
| reverse-outline | v1 | C1 | either | component of three others; D7 basis |
| elicit-from-author | v1 | C0 | author | gate UI over existing artifact |
| steelman | v1 | C2–C3 | editor | pre-write; 70% built |
| discourse-map | v1 | C3 | author | pre-write; phase exists |
| loop-to-convergence | v1, gated | K×2×C4 | orchestrator | the "run rounds" button; never unbounded |
| submission-pack | v1.x | C1 | author | needs export pipeline |
| peer-review-simulation | v2 | C3–C4 | editor | presentation layer over the Academic protocol |
| literature-map | v2 | C3 | author | needs OpenAlex/S2 integration |
| structured-dialogue | v2 | C2–C3 | author | composes from steelman + discourse-map |
| translate-register | v2 | C2 | author | needs composite personas in UI |
| repackage-for-venue | v2 | C3 | author | needs translate-register |
| sharpen-thesis | v2 | C0–C1 | author | covered by chat + discourse-map |
| reader-test | v2 (reframed) | C2 | editor | evidence says simulation ≠ measurement |

## 3. The persona system as a product (J1–J8, T5)

### 3.1 `bootstrap-persona` on the Run model (J1)

*Observed (local).* The skill has three modes and six phases; Phase 1 (close reading) is the heavyweight and "the natural place for parallelism"; every phase writes its file as it completes "do not hold the profile in context"; the hold-out is reserved in Phase 0 and "forbidden to every subagent"; sample sizing is "everything up to ~12 pieces; beyond that, a recency-weighted sample plus deliberate range coverage"; `calibration=false` "leaves the profile unfalsified." The operator's real run read 10/10 essays (26,134 words sampled, 2 held out) and produced a verdict of "prose machinery: mostly right … content: wrong" (local `sjs-substack/profile/index.md`).

*Recommendation.* Three run kinds under one `Run` type (K1), differing in their step list:

| Run kind | Steps (each a K1 phase with its own artifact) | Gate | Fan-out |
|---|---|---|---|
| `persona.bootstrap` | resolve+census → **gate** → close-read (one step per piece) → voice print → positions/continuity/venue → calibration (predict → read → compare → correct) → package | after census: user sees the sample list, exclusions, and the reserved hold-out(s), and the cost estimate; may include/omit pieces (this doubles as I4's include/omit UI) | per-piece close-read steps run as parallel subagents; each writes `corpus/<slug>.md` |
| `persona.refresh` | read provenance → census delta → close-read *new/changed pieces only* → re-synthesize → calibrate on newest unread piece → package | same gate, showing only the delta | same |
| `persona.compose` | resolve members → mode → register map → union substance → routing calibration → package | none (cheap) | none |

Inputs the UI collects: samples (uploads/links, I1–I4), an optional seed description (J3 — if empty, the skill "creates one from the corpus … marked as agent-drafted for the human to correct"), and — the two knobs worth exposing — `sample` cap and `calibration` on/off, the latter with the skill's own warning text. `usage` (Mode) is collected as metadata only (Q-11).

Sample sizing as a product rule: the skill's ~12-piece default is the *Full Profile* default; the census gate shows "N pieces found, K will be read closely, 1–2 held out" with a cost estimate per piece (the per-piece close-read is the unit of cost, so the estimate is linear and honest).

### 3.2 Drift and staleness: the state model (J2, F6, T5)

*Observed (local).* The convention's rule: stale if the corpus grew >~25% or the profile is >~6 months old; "a stale profile is still usable; the consuming skill states its date and the operator decides." The manifest records "the date of the profile used" per project. The skill appends a marked note to `PERSONA.md` after a build, so the seed *changes as a side effect of building* — a hashing subtlety.

*Recommendation.* Compute staleness from four stored facts, never store it as an opinion (F6):

- `seed_hash` — hash of the human-authored portion of `PERSONA.md` (exclude the agent-appended build note, or the profile will be "seed-changed" the moment it is built).
- `sample_set` — the set of (source id, content hash, include flag) at build time vs now.
- `built_at` and `corpus_size_at_build`.
- `calibration_status` — `tested` / `untested` / `tested-and-badly-off` (the skill's own "if the hold-out reveals the profile is badly off, say so in `index.md`").

States (one pill; ordered by severity; the first matching wins):

| State | Condition | Pill | Action offered | Cost tier |
|---|---|---|---|---|
| `never-built` | no profile | "No voice profile" | Build (Quick Voice / Full Profile) | C3 / C4 |
| `building` | run in progress | progress | — | — |
| `seed-changed` | `seed_hash` differs | "Description changed since profile" | *Re-synthesize* (Phases 2–5 only; corpus notes reused) | C2 |
| `samples-changed` | added/removed/changed samples | "N samples changed" | *Refresh* (close-read the delta, re-synthesize, calibrate on newest) | C2–C3 scaling with delta |
| `aged` | > 6 months, or corpus grew > 25% | "Profile from <date>; corpus +N%" | Refresh | C2–C3 |
| `unfalsified` | `calibration_status = untested` | "Untested voice" | *Run calibration* (Phase 4 alone) | C2 |
| `fresh` | none of the above | "Voice profile current" | — | — |

Two design rules fall out. **Partial refresh is the norm**, because the per-piece corpus notes are persisted and immutable-per-hash: a seed edit costs a re-synthesis, not a re-read; a sample edit costs one close-read per changed piece. This is the concrete answer to the founding prompt's worry that regeneration is "quite expensive." **Explanation is a diff of inputs**: the pill's popover lists exactly which of the four facts moved (T5's "diff-of-inputs explanation"), with the estimated refresh cost next to the action.

*T5 verdict.* **Confirmed with amendment.** Three inputs become four: the `unfalsified` state is real, cheap to resolve, and is the persona system's trust feature (J6) — a profile that has never predicted a hold-out is an assertion. Everything else in T5 holds: single pill, diff explanation, estimated-cost action, never a blocking error (the convention: stale is usable; consuming skills declare the date).

### 3.3 Cost tiers: Quick Voice vs Full Profile (J8)

| | Quick Voice | Full Profile |
|---|---|---|
| Inputs | seed (optional) + up to 3 samples (≤ ~2,000 words each) | seed + census of a linked archive/uploads; ~12 sampled |
| What runs | a *seed-only* persona per the convention ("a bare `PERSONA.md` seed is used as-is"), plus an agent-drafted seed from the 3 samples and a measured mini voice print (Phase 2 on 3 notes); no census, no hold-out | the six phases |
| What it produces | `PERSONA.md` (agent-drafted, marked) + `profile/{voice-print, exemplars, lexicon}` marked `low-confidence` and `untested`; **no** positions/continuity | full profile with calibration |
| Cost / time | C2–C3 · minutes | C4 · tens of minutes to an hour (parallel close-reads) |
| Pill after build | `unfalsified` (by construction) | `fresh` |
| Competitive frame | matches Sudowrite's raw-sample injection [S43] and Jasper's ≤8-sample editable description (search summary; help page blocked) at similar effort | no competitor does the hold-out test |

The upgrade path is monotone: a Quick Voice's three samples become the first three corpus notes of the Full Profile; nothing is thrown away.

### 3.4 Persona ↔ project linking and the lock question (J5; Q-20)

*Observed (local).* The precedence rule is explicit and appears in three places: **human guidance > voice charter > persona > model default**. `respond-to-review` seeds the per-piece voice charter from the persona *once* (Phase 0.6) and thereafter "the charter outranks the persona for this piece"; "a revision that switches register mid-piece is a defect the charter should catch." The manifest records the persona and profile date. The `respond-to-review` README's homogenization evidence says each rewrite exposure drifts voice in a consistent direction.

*Inferred.* Once v1 exists, the persona's *voice* influence on the project has already been transcribed into the voice charter; changing the persona afterwards does not retroactively change v1 and would make the next response round write new text against a different prior while the charter still protects the old one — the "switches register mid-piece" defect by construction. What a persona change *can* legitimately mean after v1 is one of three things, and each has a better UI than "change persona": (a) *I want this piece in a different register* → `repackage-for-venue` / `translate-register` (v2), or in MVP "fork this project under persona X," which re-runs the pipeline from the outline; (b) *I refreshed the profile and want the project to use the new measurements* → "update profile date" on the manifest — the charter is re-seeded only on explicit request, with a diff; (c) *I attached the wrong persona* → allowed before any draft exists, and after v1 only via fork.

*Recommendation.* **Freely changeable until `drafts/v1.md` exists; soft-locked after, with two escape hatches: "Fork under new persona" and "Adopt refreshed profile (re-seed charter)."** Alternatives rejected: a hard lock (rejected — Q-20 says argue; the refresh case is legitimate and common); fully free change (rejected — it silently violates the charter precedence rule and is a homogenization vector). Defaulting new projects to persona-less "Unfiled" (operator ⚑) is consistent: an unlinked project derives an ad-hoc voice "labeled as ad-hoc," which the convention already supports.

### 3.5 Composite personas in MVP? (J4)

*Observed (local).* A composite "has no voice of its own"; skills "resolve to exactly one member" via `register` or the register map; positions/continuity are unioned; the operator has one composite (`all-steven-vitali`) that is "seed only, never exercised" (2026-08-20 note). Composing is "cheap and expected" once members exist.

*Recommendation.* **Data model yes, UI no, in MVP.** Model `Persona.members[]` and `register_map` now (F1) so composites are not a migration; expose composition in v1.x once at least two leaf profiles per user is a common state (today it requires two Full Profiles, i.e., two C4 runs). The MVP UI need that composites solve — "which register is this piece in?" — is handled by the project's single linked leaf persona. Argue-for MVP: the editor's continuity check is strongest on the union. Answer: true, and it is the first v1.x feature; but shipping a UI for an object the operator has never run is the wrong order.

### 3.6 Platform-provided house-style personas (J7)

*Observed.* Openly reusable style sources: Google's developer documentation style guide is CC-BY 4.0 [S41]; Microsoft's Writing Style Guide is public with no stated reuse license on the page (© Microsoft) [S42]; Diátaxis is a public framework (license not stated on the page fetched) [S9]. Paid/closed: Chicago Manual of Style Online is $48/yr individual (search result; the subscription page itself was not fetched); AP Stylebook Online pricing could not be fetched (blocked). The convention's `house` mode exists precisely for "a venue's or tradition's style, not an individual's," and the excerpt rule limits any profile to ≤40-word quotations with source URLs.

*Recommendation.* Two kinds of platform persona, both `Mode: house`:

1. **Style-guide personas** (rules-first): built by ingesting an openly licensed guide as `docs/` and bootstrapping in a `rules` variant that emphasizes `lexicon.md` and apparatus norms over the voice print. Ship: *Google developer docs* (CC-BY, with attribution), *Microsoft writing style* (link-and-summarize only; do not redistribute text until reuse terms are confirmed), *Diátaxis type-fit*. Never ingest AP or Chicago text; a persona may *describe* "AP-style conventions" from public knowledge but the profile's excerpt rule and "notes, not corpora" already forbid mirroring the manual.
2. **Venue personas** (descriptive): bootstrapped from a venue's *public archive* exactly as a self persona would be — e.g., a named op-ed page, a named essay venue — recording length regimes, apparatus, title grammar, and audience notes; `positions.md` is omitted (a venue has none). These are the `venue_bar` for protocols (§1.3) made concrete. Source only what `robots.txt` and terms permit (the convention's "Respect access").

Sourcing cadence: platform personas are refreshed on the same four-input staleness model, on a schedule, by the platform — the pill is visible to users read-only.

### 3.7 The one-time ToS note (Q-11)

No ethics gating is a product decision; the exposure is contractual and legal, not moral. Anthropic's Usage Policy prohibits using the model to "impersonate real entities or create fake personas to falsely attribute content or mislead others about its origin without consent or legal right" and to "impersonate a human by presenting results as human-generated" [S25] — so a Rhema user who bootstraps a living writer's persona and publishes under that name puts *Rhema's* API access at risk, not only the user's account. The Authors Guild separately warns that mimicking "the unique styles, voices, or other distinctive attributes of other writers' works" risks unfair-competition and infringement claims [S10]. Minimal posture consistent with Q-11/Q-12: keep `Mode` as metadata; put the AUP language in the ToS as a pass-through; show it once at persona creation as a line of text, not a modal.

### 3.8 What the persona viewer should expose (J6, E4 — brief)

The calibration report is the trust feature and should be the *first* tab: prediction vs actual, the measured table, the corrections. `voice-print.md` rates and rations are inspectable (the user is the author; they are observations about the user's own work) but not editable in place — corrections go to the seed, per the convention's provenance rule, and the UI should make "correct this in your description" the only edit affordance on a derived file.

## Rhema implications

1. **(C5, F1)** Add a `Protocol` entity with the eight fields in §1.3; genres are protocol instances; skills read protocol fields as their existing inputs. No phase bodies change.
2. **(C2, Q-15)** MVP protocols: Academic, Essay, Op-ed, Memo. Essay is the default for persona-less "Unfiled" projects.
3. **(C16, A9)** Ship in v1: outline-from-research, fact-check-only, cut-to-length, visualize, line-edit, title-and-deck, abstract-and-keywords, reverse-outline, elicit-from-author, steelman, discourse-map, loop-to-convergence (gated). Everything else v1.x/v2 per §2.5.
4. **(C4, T1)** Skills that are re-scopings of existing phases (fact-check-only, line-edit, steelman) are the concrete content of "any workflow anywhere": the run model needs *phase subsets* as first-class runs, not only whole skills.
5. **(K1, C14)** Cost classes C0–C4 (§2.1) should become the run-estimate buckets until A7 measures real numbers; per-piece close-reads make persona estimates linear.
6. **(J2, F6, T5)** Four staleness inputs (seed hash excluding the build note; sample set; age/growth; calibration status) → seven states → one pill with diff-of-inputs and priced partial refresh. T5 confirmed with the `unfalsified` amendment.
7. **(J8)** Quick Voice (C2–C3, untested) and Full Profile (C4, tested) with a monotone upgrade path.
8. **(J5)** Soft lock after v1; "Fork under new persona" and "Adopt refreshed profile" are the escape hatches; the argument rests on the charter precedence rule.
9. **(J4)** Composite personas: schema now, UI v1.x.
10. **(J7, E5)** Platform house personas only from openly licensed or publicly archived sources; never redistribute AP/Chicago; venue personas are the protocol `venue_bar`.
11. **(C9/Q-11, L9)** One line of AUP pass-through at persona creation; no gating.
12. **(D6, T2)** `line-edit`'s suggestion set and `fact-check-only`'s ledger are the two skills whose *entire* output is anchored ranges — they should be the first two rendered in the anchored-findings UI, before the full dossier.
13. **(G3, literature-map)** When built, prefer OpenAlex (CC0, pay-as-you-go ~$0.0001/call) over Semantic Scholar's keyed 1-rps tier.
14. **(C12)** `visualize` should store a live spec (Vega-Lite/Mermaid) as the asset's source of truth and register each figure's data as Tier-1 claims in the ledger.
15. **(D18, L3)** The trial: one `fact-check-only` or one Op-ed-protocol review — both are full-regimen demonstrations at a fraction of Q-10's extreme.

## Ledger updates

| Row | Proposed status | Evidence |
|---|---|---|
| C2 | done (research) | §1.1–1.2: per-genre venue bar, artifacts, integrity norms, WTP with fetched sources [S1–S10, S17–S19, S24, S26, S30, S34–S38, S40–S42] |
| C5 | done (design) | §1.3 protocol object; §1.4 MVP set |
| C16 | done (research + design) | §2.2–2.5: 4 roadmap + 14 candidates + 3 inventions, each with purpose/phases/inputs/artifacts/gates/cost/grounding/verdict |
| A9 | done (decision) | §2.2 and §2.5: steelman, discourse-map, loop (gated) in v1; structured-dialogue v2 |
| J1 | done (design) | §3.1 run kinds, steps, gate, inputs |
| J2 | done (design) | §3.2 state model; T5 confirmed with amendment |
| J3 | done (design, brief) | §3.1 (agent-drafted seed marked for correction) and §3.8 (corrections go to seed) |
| J4 | done (decision) | §3.5 schema now, UI v1.x |
| J5 | done (decision) | §3.4 soft lock + two escape hatches |
| J6 | done (brief) | §3.8 |
| J7 | done (design) | §3.6 |
| J8 | done (design) | §3.3 |
| T5 | confirmed with amendment | §3.2 |

**New rows proposed.**

| ID | Item | Owner |
|---|---|---|
| C17 | `Protocol` entity spec: fields, which are user-editable in v1, seeding of venue tables (op-ed outlets [S30]; journal limits [S37]) | P/A |
| C18 | Disclosure-statement generator (ICMJE/NeurIPS-shaped) as an Academic export artifact; user-supplied-source verdicts in the claim ledger for Memo | P/A |
| K7 | Phase-subset runs as first-class run kinds (fact-check-only, second-read-only, calibration-only) | A |
| J9 | Seed hashing rule: exclude the agent-appended build note from `seed_hash`; define which `PERSONA.md` edits count as seed changes | A |
| J10 | Platform house-persona sourcing & licensing register (which guides, under what license, refresh schedule) | P/L |
| C19 | `visualize` figure ledger: data provenance per figure; `[unverified data]` badge; spec-as-source-of-truth | A/D |

## Open questions / unverified

- **Not fetched (blocked or 403/404):** COPE AI-authorship position; Nature's AI editorial policy (login redirect); AP's own generative-AI standards page and BBC AI guidance (blocked; AP language cited via Poynter [S32]); the Guardian style guide; AP Stylebook store; EFA's rates page and 2024 rate-chart PDF (Cloudflare; figures cited via a secondary [S38] and a search snippet); Paperpal pricing (page carried no prices); WAME recommendations; Science's manuscript instructions; the ICLR blog post (the arXiv paper [S28] was read instead); Jasper's Brand Voice help article (marketing page [S2] and search summary used); Nieman Lab's AP article; Editors Canada rates; the STM Report 2024 (figures are from search snippets only); the short-titles citation paper. Any claim resting on these is labeled accordingly above.
- **Substack numbers are contested.** 4M (Nov 2024) and 5M (Mar 2025) are well-attested [S35]; "8.4M paid in Q1 2026" circulates without a primary source and a May-2026 analyst says 6M had not been confirmed [S29]. Do not put an 8.4M figure in the spec.
- **Cost classes are inferred**, not measured; A7/C14 must replace them.
- **Speech and marketing genres** have no editorial-practice source fetched; their deferral rests on inference.
- **Microsoft style guide reuse terms** were not found on the page fetched; treat as link-only until confirmed.
- **Whether the operator's existing composite (`all-steven-vitali`) should be exercised** before the composite schema is finalized — a cheap local run would ground J4.
- **Op-ed venue table freshness**: the OpEd Project's outlet norms [S30] carry no date on the page; verify per outlet before seeding.

## Sources

Local (read in full this session): `~/agent-discourse/README.md`; `conventions/personas.md`; `conventions/project-memory.md`; `skills/{bootstrap-persona,draft-from-outline,editorial-review,respond-to-review}/SKILL.md`; `skills/editorial-review/README.md`; `skills/bootstrap-persona/README.md`; `skills/respond-to-review/README.md` (§1–2.5 and references); `skills/editorial-review/references/rubric.md`; `skills/bootstrap-persona/references/calibration-protocol.md` (§1–3); `agent-scratch/notes/*` (both); `agent-scratch/personas/sjs-substack/profile/index.md`; `~/agent-skills/skills/orchestrate-build/SKILL.md` (§0–2.1); `~/Rhēma/docs/1_founding-prompt.md`; `~/Rhēma/docs/2_research-and-design-ledger.md`.

Web (all accessed 2026-08-27):

1. [S1] https://www.sudowrite.com/pricing · Sudowrite pricing · fiction WTP ($10/22/44 credits).
2. [S2] https://www.jasper.ai/pricing and https://www.jasper.ai/brand-voice · Jasper pricing / Brand Voice · marketing WTP; brand-voice analogue.
3. [S3] https://www.grammarly.com/plans · Grammarly plans · $12/mo Pro; tone vs voice.
4. [S4] https://reedsy.com/blog/guide/editing/cost/ · Reedsy editing cost guide · per-word rates by edit type; 80k manuscript totals.
5. [S5] https://bestwriting.com/substack-statistics · Substack statistics (secondary; tertiary sourcing) · publications earning, revenue, distribution.
6. [S6] https://www.icmje.org/recommendations/browse/roles-and-responsibilities/defining-the-role-of-authors-and-contributors.html · ICMJE · AI authorship/disclosure.
7. [S7] https://grants.nih.gov/grants/guide/notice-files/NOT-OD-25-132.html · NIH NOT-OD-25-132 · AI-developed applications; 6/yr cap.
8. [S8] https://www.aboutamazon.com/news/company-news/2017-letter-to-shareholders · Bezos 2017 letter · six-page memos; re-writing.
9. [S9] https://diataxis.fr/ · Diátaxis · four documentation types.
10. [S10] https://authorsguild.org/resource/ai-best-practices-for-authors/ · Authors Guild AI best practices · disclosure; no style mimicry.
11. [S11] https://arxiv.org/abs/2303.17651 · Self-Refine · iterative refinement gains; no stopping rule.
12. [S12] https://arxiv.org/abs/2310.01798 · LLMs Cannot Self-Correct Reasoning Yet · degradation without external feedback.
13. [S13] https://arxiv.org/abs/2305.14325 · Multiagent debate · factuality/reasoning.
14. [S14] https://arxiv.org/abs/2402.06782 · Debating with more persuasive LLMs · judge accuracy 76/88 vs 48/60.
15. [S15] https://arxiv.org/abs/2408.15232 · Co-STORM · collaborative discourse; mind map; 70%/78% preference.
16. [S16] https://www.nsf.gov/news/notice-to-the-research-community-on-ai · NSF AI notice · proposer disclosure; reviewer prohibition.
17. [S17] https://ksjhandbook.org/fact-checking-science-journalism-how-to-make-sure-your-stories-are-true/the-three-models-of-fact-checking/ · KSJ three models · magazine/newspaper/hybrid.
18. [S18] http://www.theopedproject.org/resources · OpEd Project resources · op-ed structure; "to be sure."
19. [S19] https://kdp.amazon.com/en_US/help/topic/G200672390 · KDP content guidelines · AI-generated vs AI-assisted.
20. [S20] https://arxiv.org/abs/2305.14251 · FActScore · atomic facts; 58% ChatGPT; <2% estimator error.
21. [S21] https://arxiv.org/abs/2303.02927 · LIDA · visualization pipeline.
22. [S22] https://arxiv.org/abs/2209.06899 · Out of One, Many · silicon samples; algorithmic fidelity.
23. [S23] https://arxiv.org/abs/2403.07183 · Monitoring AI-modified content · 6.5–16.9% of reviews.
24. [S24] https://neurips.cc/Conferences/2025/LLM · NeurIPS 2025 LLM policy · authors/reviewers.
25. [S25] https://www.anthropic.com/legal/aup · Anthropic Usage Policy · impersonation clauses.
26. [S26] https://contentmarketinginstitute.com/articles/b2b-content-marketing-trends-research · CMI 2026 B2B report · AI adoption; quality gap.
27. [S27] https://www.grammarly.com/authorship · Grammarly Authorship · provenance tracking (context for integrity features).
28. [S28] https://arxiv.org/abs/2504.09737 · ICLR 2025 review-feedback RCT · 27% revised; +80 words.
29. [S29] https://simonowens.substack.com/p/is-substacks-subscription-growth · Simon Owens (secondary analysis) · growth deceleration; 8.4M unsourced.
30. [S30] https://www.theopedproject.org/submissions · OpEd Project submissions · outlet word counts and exclusivity.
31. [S31] https://www.cambridge.org/core/journals/political-analysis/article/synthetic-replacements-for-human-survey-data-the-perils-of-large-language-models/B92267DC26195C7F36E63EA04A47D2FE · Bisbee et al. 2024 · synthetic samples fail inference.
32. [S32] https://www.poynter.org/ethics-trust/2023/new-ap-stylebook-guidelines-artificial-intelligence-chatgpt/ · Poynter on AP AI guidance (secondary) · "unvetted source material."
33. [S33] https://www.themarginalian.org/2014/03/28/daniel-dennett-rapoport-rules-criticism/ · Dennett/Rapoport rules (secondary) · four steps.
34. [S34] https://reedsy.com/editing/developmental-editing · Reedsy developmental editing · deliverables; cost.
35. [S35] https://en.wikipedia.org/wiki/Substack · Wikipedia (secondary) · dated milestones; 10% fee; funding.
36. [S36] https://help.openalex.org/api/ · OpenAlex API · CC0; free key 10×; pay-as-you-go.
37. [S37] https://journals.plos.org/plosone/s/submission-guidelines · PLOS ONE guidelines · abstract ≤300; title ≤250 chars.
38. [S38] https://www.editorworld.com/article/book-editing-rates · EFA benchmarks (secondary) · hourly/per-word ranges by edit type.
39. [S39] https://www.semanticscholar.org/product/api · Semantic Scholar API · coverage; rate limits.
40. [S40] https://elicit.com/pricing · Elicit pricing · $49/$169 tiers.
41. [S41] https://developers.google.com/style · Google developer documentation style guide · CC-BY 4.0.
42. [S42] https://learn.microsoft.com/en-us/style-guide/welcome/ · Microsoft Writing Style Guide · public; principles.
43. [S43] https://sudowrite.com/blog/ai-voice-matching/ · Sudowrite voice matching · raw-sample injection.
44. [S44] https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/what-is-story-bible/jmWepHcQdJetNrE991fjJC · Sudowrite Story Bible docs · Style section.
45. [S45] https://arxiv.org/abs/2011.00416 · Text style transfer survey (CL 2022) · task definition; evaluation.
46. [S46] https://arxiv.org/abs/2403.14380 · Conversational persuasiveness of LLMs · 81.7% higher odds with personalization.
47. [S47] https://en.wikipedia.org/wiki/Straw_man · steelmanning definition (secondary; Rapoport rules not on page).

Search-only (not fetched; used for orientation, labeled where cited): STM Report figures; EFA 2024 chart summary; CMOS $48/yr; speechwriter salary aggregates.
