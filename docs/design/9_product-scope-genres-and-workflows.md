# Product scope, genres, and workflows — naming, the workflow catalogue, genre protocols, the project lifecycle, the feature matrix, and success metrics

- Scope: ledger rows **C1** (naming), **C3** (feature matrix), **C5** (genre protocols as product), **C6** (argued additions/drops), **C11** (success metrics), **C16 + A9** (v1 skills as product-facing workflows), plus the project lifecycle as the user experiences it (A4 → K1/C17). Touches C4, C7, D18, J5, L3, L6, Q-4, Q-7, Q-8, Q-15, Q-16, Q-18, Q-20 · Date: 2026-08-27
- Evidence base read in full: `docs/research/12_skills-genres-personas.md` (note 12), `2_source-system-extraction.md` (note 2), `4_coding-agent-ux-part2.md` (note 4), `10_pricing-billing-auth.md` (note 10), `5_writing-products-and-substack.md` (note 5), `6_landing-onboarding-trials.md` (note 6); `conventions/{personas,project-memory}.md`; `skills/editorial-review/references/rubric.md` (for the eight dimensions and caps). Parallel design docs referenced, not duplicated: `design/2` (IDE shell), `design/6` (chat, gates, visualizations), `design/8` (personas).
- Requirement IDs: `REQ-PROD-n` (product scope, naming, metrics), `REQ-WF-n` (workflows), `REQ-GENRE-n` (protocols).

## Summary of decisions (≤300 words)

1. **Naming.** Two agent seats and one assistant: **Drafter** (the author-side agent; never "Author," because the user is the author and ICMJE/COPE forbid AI authorship), **Editor** (the independent review seat), **Assistant** (the in-IDE research chat). Workflows are verbs: *Outline · Draft · Review · Revise · Profile voice*, plus the v1 set (*Fact-check, Cut to length, Line edit, Titles, Abstract, Reverse outline, Steelman, Map the field, Interview me, Figure, Run rounds*). Gates are **Approvals** (approve-with-deadline). Rigor is one dial with three notches — **Quick / Standard / Full board** — bundling phases + model tier + second-read model. Tiers: **Free · Writer $20 · Studio $100 · Studio Max $200 · Team $40/seat**, with the cent-credit from note 10.
2. **Workflow catalogue.** 16 workflows: 4 ported + 12 v1. Each is a run kind with named phases, at most one approval, typed artifacts, a cost class, and a rigor-notch price range. Phase-subset runs (Fact-check, Line edit) are first-class, not flags.
3. **Genre = protocol object.** Nine fields; four MVP protocols (Academic, Essay, Op-ed, Memo) fully specified; Essay is the default for Unfiled projects; users pick protocol + venue per project, may override the *safe* fields, and later genres are new rows, never skill forks.
4. **Lifecycle.** Eleven user-visible states over the four-state source machine, adding *Edited by you*, *Accepted*, *Exported*, *Archived*; one "Suggested next" rule; **Run rounds** converges on external signals (verdict, caps, second-read agreement), never on the model's sense of done; stall detection stops oscillation.
5. **Feature matrix.** 74 features phased MVP / v1 / later; mobile, composites, BYO keys, sharing roles, and Team are v1.x; scheduling, literature map, peer-review simulation, and reader-test are later.
6. **Departures (Q-20).** Four, each argued: soft-lock persona after v1 (not hard lock); mobile after web MVP; structured-dialogue specified but not shipped in v1; C0/C1 workflows ship with no approval gate.

---

## 1. Naming (C1)

### 1.1 Principles

Names are chosen against four tests, in priority order: (a) **integrity** — a name must not misstate who authored what (note 5 §2.3: ICMJE "chatbots should not be listed as authors"; COPE "fully responsible" authors); (b) **boundary legibility** — the user should be able to infer from names alone why the Editor "never saw the Drafter's rationalizations" (T3 as narrowed by note 2 §3); (c) **verb-shaped workflows** — every workflow is something the user *does*, matching the command-palette grammar every coding IDE converged on (note 4 §5 "Command palette" row); (d) **no collisions** across roles, tiers, model tiers, and rigor notches (Devin's ACU/prompt-credit split after the Windsurf merger is the cautionary case, note 4 §1.1).

### 1.2 Agent roles

| Internal namespace | Product name | What it is | Rejected alternatives and why |
|---|---|---|---|
| `agents/author/*` | **Drafter** | The author-side agent: drafts from outlines, revises after review, runs line edits and cuts. Its memory is the user's own working record (inspectable). | *Author* — the user is the author (note 2 §3; every skill routes escalations "to the human author"); an "Author agent" invites exactly the authorship claim ICMJE forbids. *Writer* — same problem, and collides with the Writer tier. *Ghostwriter* — accurate but toxic in academic venues. *Scribe* — cute, opaque. |
| `agents/editor/*` | **Editor** | The independent review seat: reviews, fact-checks, steelmans. Its deliberations are hidden; its delivered dossier is the product. | *Reviewer* — accurate but generic, and academic users would read it as "peer reviewer," which `peer-review-simulation` later occupies. *Critic* — adversarial tone. Kept **Editor** because the landing line "an editorial board for everything you write" (note 6 §5.1) depends on it. |
| (chat, no private memory) | **Assistant** | The in-IDE long-context research chat (G9 in `design/6`). Reads the shared record; can start any workflow; its terminal artifact is an Outline. | *Researcher* — undersells (it also explains findings, drafts titles); *Copilot* — trademark adjacency. **Assistant** is what ChatGPT/Claude users already expect. |

**REQ-PROD-1.** Product surfaces use *Drafter / Editor / Assistant*; the words "author" and "authored" are reserved for the human user and appear in provenance labels ("Edited by you", "AI-use statement"). Acceptance: no UI string labels an agent as "author".

**REQ-PROD-2.** Every artifact carries a role badge (Drafter / Editor / You / Assistant) and the boundary rule is stated in the Editor's dossier header as a trust chip ("Editor reviewed v2 with no access to the Drafter's notes — verified by access log"), per note 2 B21 and note 4 implication 7.

### 1.3 Workflows

Names are verbs (imperative, one or two words) for the palette and buttons; the noun form names the artifact.

| Skill (source / note 12) | Product verb | Artifact noun | Seat |
|---|---|---|---|
| `outline-from-research` | **Outline** ("Make an outline from this chat") | Outline | Assistant → Drafter |
| `draft-from-outline` | **Draft** | Draft v1 (+ Drafting note) | Drafter |
| `editorial-review` | **Review** — with rigor notches *Quick review / Standard review / Full board review* | Review (dossier: Editor's letter, Claim ledger, Discourse report, Second read, Rubric) | Editor |
| `respond-to-review` | **Revise** ("Revise from this review") | Draft v(N+1) + Response letter (+ Triage ledger) | Drafter |
| `bootstrap-persona` (bootstrap / refresh / compose) | **Profile voice** / **Refresh voice** / **Compose voice** (v1.x) | Voice profile | Persona builder |
| `fact-check-only` | **Fact-check** | Claim ledger | Editor |
| `cut-to-length` | **Cut to length** | Draft v(N+1) + Cut list | Drafter |
| `line-edit` | **Line edit** | Suggestion set | Drafter |
| `title-and-deck` | **Titles** | Title candidates | Drafter |
| `abstract-and-keywords` | **Abstract** | Abstract & keywords | Drafter |
| `reverse-outline` | **Reverse outline** | Reverse outline (+ diff vs plan) | either |
| `elicit-from-author` | **Interview me** | Guidance (answers) | Drafter |
| `visualize` | **Figure** ("Make a figure") | Figure (spec + data + provenance) | Drafter |
| `steelman` | **Steelman** | Steelman essay + Vulnerability map | Editor |
| `discourse-map` | **Map the field** | Field map (+ Open ground) | Drafter (author research) |
| `loop-to-convergence` | **Run rounds** | Convergence report | Orchestrator |
| `submission-pack` (v1.x) | **Submission pack** | Cover letter, disclosure statement, formatted files | Drafter |

Rationale for the two contested ones. **Revise** rather than *Respond*: the user's job is a better draft; the response letter is a by-product that academics recognize and essayists do not. The triage step ("Approve triage") is where "respond" semantics live, so nothing is lost. **Map the field** rather than *Discourse map*: "discourse" is the repo's brand word but tests as jargon outside philosophy; the Editor's report keeps the internal name ("Discourse report") because it is a *section* of the dossier, not a button.

**REQ-PROD-3.** Workflow verbs are the only names users see in palette, buttons, run cards, and price cards; skill ids appear only in developer docs and telemetry.

### 1.4 Gates → Approvals

Gates are called **Approvals** and implemented as approve-with-deadline (note 4 §6.1; Q-7). Each has a proper name that is also the artifact under approval:

| Approval | Workflow | What is shown | Deadline default |
|---|---|---|---|
| **Approve plan** | Draft | Structure plan + commissioning brief + voice brief | 30 min, then proceed |
| **Confirm scope** | Review (all notches) | Estimate + rigor notch + protocol/venue + phases | before spend; no auto-proceed above the consent threshold (note 10 §5.5) |
| **Approve triage** | Revise | Triage ledger (dispositions + ordered moves) + escalations | 30 min, then conservative defaults + flag |
| **Approve outline** | Outline | Proposed outline with provenance per bullet | none (the outline *is* the next thing you read) |
| **Approve sample** | Profile voice / Refresh voice | Census, sample list, hold-outs, per-piece estimate | before spend |
| **Approve cut list** | Cut to length | Cut list with reasons | 15 min |
| **Choose a thesis** | Map the field | Open-ground candidates | none (terminal) |
| **Continue?** | Run rounds | Round summary + spend so far + criterion status | per `autonomy` (checkpoint default) |

*Rejected:* "Checkpoint" (means restore point in Cursor/Claude Code — collision), "Gate" (engineering word; hostile), "Review step" (collides with Review).

**REQ-PROD-4.** Every Approval renders as a card in the round timeline and the Inbox with: the artifact, an estimate delta if any, **Approve**, **Approve and run autonomously** (turns off later approvals in this run), **Edit guidance** (queues guidance, keeps waiting), **Stop**. A countdown shows the deadline; "Wait for me" disables it per run or per project (Devin's "Wait for my approval," note 4 §1.2).

### 1.5 Rigor levels

One user-facing dial, **Rigor**, with three notches. It bundles the skill's opt-out phases, the model quality tier (note 10 §4.5), and the second-read model (Amp's "oracle," note 4 §4.3). Factory's principle — autonomy ⊥ planning (note 4 §4.4) — is honored by keeping the *Approvals* policy a separate control from *Rigor*.

| Notch | Phases (Review) | Model tier | Second read | Who it is for |
|---|---|---|---|---|
| **Quick** | Intake · Argument · Craft · Letter + Rubric; fact-check limited to the 5 most load-bearing claims; Discourse off | Standard (Sonnet-class everywhere) | off | trial, early drafts, weekly essays |
| **Standard** | all seven | Advanced (Opus-class judgment / Sonnet-class research) | on, same tier | the default for paid users |
| **Full board** | all seven; near-final line depth | Frontier (Fable-class judgment / Opus-class research) | on, **different model family** | submission-grade academic, op-ed to a national outlet |

An **Advanced** disclosure under the dial unbundles: per-phase toggles (fact-check / discourse / second read / grounding / audit), model tier, `stage` (early / near-final). Every change updates the estimate live (note 10 §5.5 #1).

*Rejected:* Low/Standard/Elite (note 4 C17 proposal) — "Low" is self-deprecating on a price card; "Elite" promises a judgment we cannot guarantee. A raw model picker — rejected per Q-4 (curated) and note 10 §4.5 (per-phase routing beats model downgrades; users should not have to know that).

**REQ-PROD-5.** Rigor is a per-run setting with a per-project default; each notch has a published credit range on the price card and a live estimate in the launch sheet. Model names appear only in Advanced and in the run report.

### 1.6 Tiers and model tiers

Tiers (note 10 §5.2 numbers, renamed): **Free** (600 one-time credits, Standard model tier only, 1 concurrent run) · **Writer $20/mo** (2,000 credits) · **Studio $100/mo** (12,000) · **Studio Max $200/mo** (26,000) · **Team $40/seat** (4,000 pooled, v1.x). Model quality tiers, shown only in Advanced: **Standard / Advanced / Frontier** (credit multipliers ≈ 1× / 2.2× / 4.5×).

Why not mirror *Pro/Max*: "Pro" would collide three ways (a tier, note 10's model tier, and the rigor notch users read as "professional"). Why not *Writer/Editor/Publisher*: Editor is an agent. **Writer / Studio** reads as a writing product, and "Studio" carries the "workshop with an editorial board" image the landing sells. Credit unit is the cent-credit; displayed as credits *and* dollars (note 10 §3 #3).

**REQ-PROD-6.** Tier names, model-tier names, rigor notches, role names, and approval names are disjoint vocabularies (no shared words). Acceptance: a lint over the i18n string table.

### 1.7 Other vocabulary

- **Project** (never "document"); **Draft vN**; **Round** (one Review + Revise pair); **Timeline** (the round log, T1); **Findings** (Editor's anchored comments, T2); **Dispositions**: *accept / adapt / rebut / defer / escalate* (verbatim from the skill; note 5 §4.2 confirms "resolve" is the wrong verb); **Voice** (persona, user-facing: "Voice profile", "Voices" library) — the word *persona* is kept only in developer docs because consumers read "persona" as marketing-segment jargon (note 5 §1.3 shows every competitor says "voice"); **Unfiled** for persona-less projects (⚑); **Showcase project** (the seeded worked example, note 6 §5.2).

**REQ-PROD-7.** The persona system is labeled **Voice** in all product surfaces; `design/8` uses "Voice profile / Quick Voice / Full Profile" accordingly.

---

## 2. The workflow catalogue (C16, A9)

### 2.1 Common contract

Every workflow is a **run kind** on the K1 run model with: a launch sheet (inputs + estimate + cap + rigor), a phase list the orchestrator knows (progress is orchestrator-driven, note 4 implication 9), at most one Approval, typed artifacts with a review policy (Gate / Notify / Silent — Antigravity, note 4 §4.2), a cost class (note 12 §2.1: C0 < $0.50 · C1 $0.5–3 · C2 $3–15 · C3 $15–50 · C4 $50–100+, list-price COGS on a frontier model; ×1.4 and ÷$0.01 for credits), and a delivery report rendered as the **run report** (cost by phase × role, unmet targets, suggested guidance — Devin Session Insights, note 4 §1.2).

**REQ-WF-1.** Every run kind declares `{inputs, phases[], approval?, artifacts[], cost_class, rigor_applicable, genres[], phase_subset_of?}` in code; the launch sheet and progress UI are generated from that declaration, never hand-built per workflow.

**REQ-WF-2.** Runs freeze their input version; agents never write into a human-editable document (note 8 carry-forward, ledger change log turn 10). A run that would write a draft produces a *new version*; a run that produces suggestions (Line edit, Figure) produces *proposals* the user accepts into the working copy.

**REQ-WF-3.** Every run's launch sheet shows: estimate in credits and dollars, the guaranteed 1.5× cap, the three or four levers that move the estimate (rigor notch, phase toggles, length target), and the balance after the hold (note 10 §5.5). Consent is explicit above 500 credits or 25% of balance.

Credit ranges below use note 10 §5.4 price cards (list × 1.4). "2k / 5k / 8k / 15k" are word counts with the note's claim densities. They are model outputs, not measurements (A7); ranges must be re-published from telemetry before the price card ships (note 10 open question 7).

### 2.2 The four ported workflows

#### Draft (`draft-from-outline`) — MVP
- **Purpose (user).** "Write the first full draft from my outline, in my voice, with every inherited citation re-verified."
- **Launch sheet.** Outline (project's current outline); Voice (project's linked voice or none → ad-hoc, labeled); Venue (from protocol); Target length (protocol default, editable); Fidelity (*adaptive* default / *strict*); Guidance (free text; Interview-me answers pre-filled); Rigor (Quick = grounding off with `[unverified]` marks, audit off; Standard/Full board = both on).
- **Phases (user-visible names).** Reading the outline → Binding voice → **Approve plan** → Verifying sources → Writing (section by section; the draft streams into a read-only editor pane) → Tightening → Independent audit (≤3 passes) → Delivered.
- **Approval.** *Approve plan* (structure plan + brief + voice brief). Trial: pre-approved with a 0-minute deadline so the first run never stalls (note 6 §5.2).
- **Artifacts.** Draft v1 (Surfaced-editable until reviewed); Drafting note (read-only, Notify); Commissioning brief, Voice brief, Structure plan, Drafter's claim ledger, Fidelity audit (Inspectable); Draft ledger progress rows drive the live feed (note 2 #17).
- **Cost.** C4. Credits: 2k blog 190 / 430 / 830 · 5k essay 400 / 940 / 1,830 · 8k paper 830 / 1,950 / 3,830 · 15k paper 1,460 / 3,500 / 6,890 (Quick / Standard / Full board; Quick here = Standard model tier with grounding on — grounding off is cheaper still and shown as a lever).
- **Genres.** All four MVP protocols. Journalism (v1.x) disables it by default (note 12 §1.2).
- **Trial.** "Draft the first section (preview)" ≤ 800 words (note 6 §5.3 #3).
- **REQ-WF-4.** Draft never fans out the writing phase (B18); the editor pane shows one streaming section at a time with a per-section budget bar from the draft ledger.
- **REQ-WF-5.** The Phase 2↔3 re-plan loop is capped at 2 (note 2 F17 open defect; B19); the third failure escalates to the user as an Approval ("Sources for claim X could not be verified — proceed with `[unverified]`, cut, or stop?").

#### Review (`editorial-review`) — MVP
- **Purpose.** "Tell me honestly whether this survives the venue: every claim checked, the field mapped, an independent second read, a verdict."
- **Launch sheet.** Draft version (default: latest); Protocol + Venue (project defaults, overridable per run); Stage (early / near-final; inferred from protocol and version number); Concerns (free text, "look especially at…"); Rigor (§1.5); Advanced toggles.
- **Phases.** Reading the piece → Checking claims (live counter "41 claims · 33 verified") ∥ Mapping the field ∥ Second read (fresh context, draft only) → Weighing the argument → Reading the prose → Reconciling the second read → Writing the letter → Delivered. Sequential fallback labels the second read "not independent" (note 2 §1.2).
- **Approval.** *Confirm scope* only (the source skill has no in-run gate; adding one would break the "fresh context sees only the draft" independence). Delivery is the surfacing point.
- **Artifacts.** Editor's letter (read-only hub, Gate = the user must open it before Revise is suggested); Claim ledger (read-only table with URL per verdict — E6 floor); Discourse report; Second read (read-only, shows rejected findings — "what the Editor considered and dismissed"); Rubric (8 dimensions, caps visible, no aggregate); Piece brief, Argument notes, Craft notes (Inspectable). **Findings** are the anchored projection of all of these (T2; `design/6`).
- **Cost.** C2 (Quick, short) to C4. Credits: 2k blog 250 / 570 / 1,100 · 5k essay 560 / 1,300 / 2,520 · 8k paper 1,240 / 2,930 / 5,750 · 15k paper 2,080 / 4,950 / 9,730. Quick on an 8k paper ≈ 330–450 (fact-check limited; note 10's "fact-check off" row is 330).
- **Genres.** All; the protocol object supplies rubric swaps, calibration language, and phase defaults (§3).
- **Trial.** One free **Quick review** ≤ 3,000 words (note 6 §5.3 #2).
- **REQ-WF-6.** A Review is keyed by (version, run), so one version may carry a Quick review and a later Full board review, or two protocol variants in parallel (note 2 §4.4 #2; C4 "parallel review variants").
- **REQ-WF-7.** Re-review of v(N+1) reads the response letter first and does not re-raise well-rebutted findings; the run report states "N findings carried, M closed, K new" (note 2 §1.2 re-review rule).
- **REQ-WF-8.** Memo protocol runs support `verified against user-supplied source` verdicts and never fetch internal data from the web (note 12 §1.2 Business).

#### Revise (`respond-to-review`) — MVP
- **Purpose.** "Take the review seriously: verify its load-bearing findings, decide each one, and produce the next draft with a point-by-point letter."
- **Launch sheet.** Review to answer (default: latest unanswered); Base draft (default: the reviewed version; *or* your edited copy — see §4.4); Guidance (free text + dispositions you already set in the Findings UI, which pre-fill the triage ledger); Rigor (Quick = repair research off, gap analysis off; Standard = both on; Full board = both on, Frontier).
- **Phases.** Reading the draft first → Reading the review → Checking the Editor's evidence → Triage → **Approve triage** → Revising (moves in order; untouched text byte-identical) → Verifying new claims → Independent gap check (≤3) → Delivered.
- **Approval.** *Approve triage*: the triage ledger as an editable table (disposition + rationale + move order) with escalations pinned at the top. This is the operator's gate (Q-7) and the one the founding prompt names ("triage before revise").
- **Artifacts.** Draft v(N+1) (new version, `origin=revise`); Response letter (read-only; "Flags" section surfaces standing escalations to the **Decisions inbox**, note 2 C18); Triage ledger frozen at delivery (Surfaced-read-only via the Findings UI); Voice charter (Inspectable; "add guidance" only, never edited in place — E3).
- **Cost.** C4. Credits: 2k 220 / 510 / 990 · 5k 450 / 1,060 / 2,070 · 8k 900 / 2,140 / 4,220 · 15k 1,570 / 3,760 / 7,420.
- **Genres.** All.
- **REQ-WF-9.** Dispositions set in the Findings UI *are* the triage ledger's seed rows; the run may add rows (finding classes the user did not touch) but never overrides a user disposition without an escalation.
- **REQ-WF-10.** "Operator reachable" (note 2 B20) is defined as: the approval deadline (30 min default; per-project setting; "Wait for me" = infinite). On expiry, conservative defaults apply and every auto-resolved escalation is flagged in the letter and the Decisions inbox.

#### Profile voice / Refresh voice / Compose voice (`bootstrap-persona`) — MVP (compose v1.x)
- **Purpose.** "Learn how I actually write — measured, tested on a held-out piece — so drafts and revisions sound like me."
- **Launch sheet.** Samples (uploads / linked archive; include/omit per item — I4); Description (optional; agent-drafted if empty, marked); Sample cap (default ≤12); Calibration on/off (with the skill's own warning text); Mode (metadata only, Q-11); one-line AUP notice (note 12 §3.7). Two products: **Quick Voice** (≤3 samples, no census/hold-out, C2–C3, minutes) and **Full Profile** (C4, tens of minutes).
- **Phases.** Counting the corpus → **Approve sample** → Close reading (one step per piece, parallel) → Measuring voice → Recording positions → Calibration (predict → read → compare → correct) → Packaged.
- **Approval.** *Approve sample* (census, exclusions, reserved hold-outs, per-piece estimate — linear and honest).
- **Artifacts.** Voice profile (hub with staleness pill computed, not read); Calibration report (first tab — the trust feature, J6); Exemplars, Positions, Continuity (read-only); Voice print, Structure repertoire, Lexicon (Inspectable, "advanced"); corpus notes and hold-out identity (hidden until calibration).
- **Cost.** C3/C4. Credits: 50k-word corpus 310 / 760 / 1,510; Quick Voice ≈ 60–200.
- **Genres.** Independent of genre; a voice is a register (one writer, several voices).
- **REQ-WF-11.** Staleness is computed from four inputs (seed hash excluding the build note, sample set, age/growth, calibration status) into the seven-state pill in note 12 §3.2; Refresh voice is a partial run costing only the delta.
- **REQ-WF-12.** Compose voice ships with the data model (`members[]`, `register_map`) in MVP and its UI in v1.x (J4).

### 2.3 The twelve v1 workflows

Verdicts and cost classes are note 12 §2.5; the product framing is this document's. "MVP" = in the first public release; "v1" = within the first-year spec; "v1.x" = a named minor after MVP.

| # | Workflow | Purpose (user) | Launch inputs | Phases (user-visible) | Approval | Artifacts | Cost / credits (Quick·Standard·Full) | Genres | Phase |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Outline** (`outline-from-research`) | Turn this chat into an official outline I can draft from. | chat session (or selection of messages); thesis (optional); venue; length | Harvesting the chat → Sorting claims (commitment / advice / material / alternatives) → Proposing a spine → Listing gaps → **Approve outline** | Approve outline (mandatory; last cheap moment) | Outline (typed: thesis, venue, audience, target length, sections with claim bullets, sources fetched in-session with URLs); source notes migrated into Drafter research | C1–C2 · 40–150 · 90–330 · 180–650 | all | **MVP** |
| 2 | **Fact-check** (`fact-check-only`) | Check every claim against fetched sources; give me the ledger. | draft version; tiers (Tier-1 only / all); sources (web / my files / both) | Inventorying claims → Checking claims → Ledger delivered | none | Claim ledger (immutable; anchored verdict badges per citation) | C2–C3 · 5k/20 claims ≈ 230 · 540 · 1,050; scales ≈ 11 / 26 / 51 credits per verified claim (note 10 §4.3 ×1.4) | all; the only workflow newsroom policy permits (note 12 §1.2) | **MVP** (trial candidate) |
| 3 | **Cut to length** (`cut-to-length`) | Bring this under the venue's cap by cutting from the over-budget sections, not uniformly. | draft version; target (words, or a venue from the outlet table); protected passages (selections) | Reverse outlining → Budgeting sections → **Approve cut list** → Cutting → Seam read | Approve cut list | Draft v(N+1) (`origin=cut`); Cut list (preserved for restoration) | C1 · 30–90 · 70–200 · 140–400 | Op-ed, Memo (required); all | **MVP** |
| 4 | **Figure** (`visualize`, C12) | Make a chart/table/diagram from these numbers, put it where it belongs, and let me iterate. | data (selection, pasted table, CSV, or claim-ledger rows — never remembered numbers); type hint; placement (cursor / "best spot") | Reading the data → Proposing a spec → Rendering → Captioning → Proposal inserted | Preview-before-insert (the proposal *is* the gate) | Figure asset (Vega-Lite / Mermaid spec + data + provenance → SVG); figure ledger row; `[unverified data]` badge when data has no ledger provenance | C1 · 10–40 · 20–90 · 40–180 | all; Academic and Memo most | **MVP** (Q-8) |
| 5 | **Line edit** (`line-edit`) | Tighten the sentences without changing my voice — rationed against my own measured signatures. | draft version; depth (patterns only / full); voice | Loading your voice → Scanning patterns → Proposing changes (as suggestions) | none — accept/reject in the editor is the gate | Suggestion set anchored to ranges; pattern note ("3 em-dashes over your ration") | C1 · 5k words ≈ 60 · 140 · 280 | all | **v1** |
| 6 | **Titles** (`title-and-deck`) | Give me title/subtitle/deck options in my title grammar, each with the promise it makes. | draft or outline; count (5) | Reading → Candidates | none | Title candidates (each: promise / does the piece pay it off) | C0 · 3 · 7 · 15 | all | **v1** |
| 7 | **Abstract** (`abstract-and-keywords`) | An abstract to the journal's limit, traceable sentence-by-sentence to verified claims. | draft; venue limits (from protocol/venue table); structured? | Reading the ledger → Drafting → Tracing | none | Abstract & keywords (+ highlights / plain-language summary if the venue wants them) | C0–C1 · 5 · 12 · 25 | Academic (Memo: executive summary variant) | **v1** |
| 8 | **Reverse outline** (`reverse-outline`) | Show me the outline this draft actually has, against the one I meant. | draft version; compare to (outline / structure plan / previous version) | Reading → Mapping paragraphs → Diffing | none | Reverse outline (one line per paragraph: claim, function, entry/exit) + diff | C1 · 10 · 25 · 50 | all | **v1** (basis of "what changed and why," D7) |
| 9 | **Interview me** (`elicit-from-author`) | Ask me the things only I can answer before you draft or revise. | the open-questions list from the commissioning brief / triage escalations | Generating questions → Chat interview → Guidance written | none (it is a chat) | Guidance entries (feed the next Draft/Revise launch sheet) | C0 · 2–5 | all; Memo and Creative nonfiction most | **v1** (MVP-cheap; ships as the Approve-plan card's "Answer questions" action) |
| 10 | **Steelman** (`steelman`) | Write the strongest case against my thesis before an editor finds it. | draft or thesis + outline; venue; voice (positions only); research on/off | Restating your position fairly → (optional pause: "is this restatement fair?") → Opposition research → Writing the opposing essay → Mapping vulnerabilities → (optional) Blind adjudication | optional after restatement | Steelman essay (neutral register, never your voice); Vulnerability map; Adjudication (reasons only, never a score) | C2 (no research) / C3 · 150–400 · 350–900 · 700–1,800 | Academic, Essay, Op-ed; Memo (objections) | **v1** |
| 11 | **Map the field** (`discourse-map`) | Before I write: who has argued what, where is the open ground, is my thesis new? | question or thesis candidates; strata (academic / general / online / all); depth (source cap); voice (continuity) | Searching the strata → Mapping positions → Judging originality in advance → Finding open ground → Forecasting reception → **Choose a thesis** | Choose a thesis (terminal; hands off to Outline) | Field map (positions, holders, best statements ≤40 words with URLs, edges); Originality verdict; Open ground; source notes (Drafter research seat) | C3 · 300–700 · 700–1,600 · 1,400–3,200 | Academic, Essay, Op-ed; Memo off by default (confidentiality) | **v1** |
| 12 | **Run rounds** (`loop-to-convergence`) | Keep reviewing and revising until it is ready — with a criterion, a round cap, and a budget. | criterion (§4.5); max rounds (default 3); budget; autonomy (checkpoint default / auto / manual); guidance carried into each Revise | Round k: Review → Revise → **Continue?** → check criterion → Stall check → Convergence report | Continue? at every round boundary (Q-7); Approve triage inside each Revise unless *auto* | Convergence report (trajectory: rubric per round, major-issue lineage, spend); the timeline's round log | K × (C4 + C4); 2k blog 3 rounds ≈ 1,400 · 3,200 · 6,300; 15k paper 3 rounds ≈ 11,000 · 26,000 · 51,000 | all | **v1**, gated; *auto* only on Studio+ |

**REQ-WF-13.** Fact-check, Line edit, and the second read are **phase-subset runs** of Review (note 12 K7 proposal): they reuse the Review phase implementations and produce the same artifact types, so a Fact-check ledger produced today is reused verbatim by a Review of the same unchanged version tomorrow (claims whose wording is unchanged are not re-verified — note 2 §5.1 reuse rule).

**REQ-WF-14.** Figure data with no ledger provenance renders an `[unverified data]` badge; Review treats every figure's data as Tier-1 claims (note 12 §2.3 `visualize`).

**REQ-WF-15.** Run rounds is never unbounded: `max_rounds ≤ 5`, a budget is mandatory, `autonomy: auto` requires Studio or above and both caps, and stall detection (§4.5) halts and escalates.

**REQ-WF-16.** Steelman is evidence-bound: with research on, every objection in the vulnerability map cites a fetched source; with research off, the essay is labeled "argument only — no sources checked." (Note 12 §2.2: personalized LLM persuasion is a hazard, not only a capability.)

### 2.4 v1.x and later workflows (specified for Q-16, not shipped in v1)

| Workflow | Phase | Reason (note 12 §2.5) |
|---|---|---|
| **Submission pack** | v1.x | needs the export pipeline (C15): cover letter, disclosure statement (ICMJE/NeurIPS-shaped), formatting to venue limits, reference check; op-ed pitch email with exclusivity line |
| **Compose voice** (UI) | v1.x | schema in MVP; needs two Full Profiles per user to be common |
| **Peer-review simulation** | later | presentation layer (R1/R2/AC letters) over the Academic protocol's review; reviewers = fresh contexts with distinct assigned concerns, never personalities |
| **Literature map** | later | needs OpenAlex integration (CC0; prefer over Semantic Scholar) |
| **Structured dialogue** | later | composes from Steelman + Map the field; no MVP genre requires it (Q-16 departure, §8) |
| **Translate register / Repackage for venue** | later | need composite voices in the UI |
| **Sharpen thesis** | later | covered by Assistant + Map the field |
| **Reader test** | later, reframed | silicon samples are not measurement (Bisbee et al.); ships only as *k* assigned-stance second reads labeled "forecast" |

**REQ-WF-17.** The run-kind registry accepts new kinds without schema changes; later workflows are registry rows plus skill files.

---

## 3. Genres as protocol objects (C5)

### 3.1 The object

A genre is a **Protocol** — configuration over the seven Review phases and the Draft/Revise inputs, never a skill fork (note 12 §1.3; alternatives rejected there: weighted universal rubric, per-genre skill copies, free-form user protocols in MVP).

```ts
type Protocol = {
  id: 'academic' | 'essay' | 'op-ed' | 'memo' | string;   // later: 'reporting', 'creative-nonfiction', 'docs', ...
  version: number;                                          // protocols are versioned; runs record the version used
  name: string; tagline: string;                            // "Academic — journal article, thesis chapter, grant"
  variants: ProtocolVariant[];                              // e.g. academic: journal-article | thesis-chapter | grant-proposal
  rubric: { dimensions: RubricDimension[8]; swaps?: {from: string; to: RubricDimension}[]; caps: CapRule[] };
  venue_bar: { kind: 'user-venue' | 'own-archive' | 'outlet-table' | 'silent-read'; table?: VenueRow[]; prompt: string };
  phase_defaults: { verification: boolean; discourse: boolean; second_read: boolean; grounding: boolean; audit: boolean;
                    stage: 'early' | 'near-final' | 'infer'; line_depth: 'light' | 'full' };
  calibration_language: { verdicts: string[]; reviewer_voice: string };
  length_norms: { unit: 'words' | 'pages' | 'minutes'; default?: number; from_venue?: boolean; apparatus: 'none'|'light'|'full' };
  integrity_norms: { machine_may_not_supply: string[]; disclosure_artifact?: 'icmje' | 'none'; exclusivity_reminder?: boolean;
                     web_fetch_of_user_data: 'allowed' | 'forbidden' };
  intake_expectations: { typical_inputs: string[]; entry_default: 'chat' | 'outline' | 'draft' };
  workflow_availability: Record<WorkflowId, 'default' | 'available' | 'off'>;
  user_editable: ('venue' | 'length' | 'phase_defaults' | 'stage')[];  // v1: safe fields only; rubric editing later
};
```

**REQ-GENRE-1.** `Protocol` is a first-class entity (F1) with versioning; every run records `protocol_id@version` and `venue`; skills read protocol fields as their existing inputs (`venue`, `stage`, `length`, toggles) plus a rubric file selected by id. No phase body changes per genre.

**REQ-GENRE-2.** In v1 users may override only `venue`, `length_norms`, `phase_defaults`, and `stage` per project (and per run in Advanced). Rubric editing and custom protocols are later; the protocol IP stays in outputs, not text (E5).

### 3.2 The eight dimensions and the caps (shared substrate)

From `rubric.md`: *Thesis & contribution · Argument rigor · Evidence & accuracy · Originality & situatedness · Structure · Prose · Voice & audience fit · Intellectual honesty*, scored 1–5 against absolute anchors pegged to the venue ("4 = publishable after minor revision"), **no aggregate**, with entailment caps: a Contradicted/Misleading Tier-1 claim caps *Evidence* at 2; an ignored strongest counterargument caps *Argument rigor* at 3; unwitting reinvention caps *Originality* at 2; a second-read thesis divergence caps *Thesis* at 3. Protocols may **swap** at most one dimension and **add** at most one; caps are boolean and travel with the dimension. The UI renders the rubric as eight bars with a cap marker and the finding that entailed it; never a total.

### 3.3 The four MVP protocols

| Field | **Academic** | **Essay** | **Op-ed** | **Memo** |
|---|---|---|---|---|
| Variants | journal-article (default) · thesis-chapter · grant-proposal (Thesis → "Specific aims / significance / innovation / approach") | long-form (default) · newsletter-short | national (default) · regional/trade | six-pager (default) · report · whitepaper |
| Rubric | the 8 as-is | the 8; the letter leads with *Voice & audience fit* and *Originality* | the 8 **+ Timeliness** (news peg); *Structure* anchors from the OpEd Project form (lede · argument · ~3 points · "to be sure" · close) | swap *Originality & situatedness* → **Decision readiness** ("can a room read this silently and decide?"); add **Scope discipline** (page budget honored without losing specifics) |
| Venue bar | user's target journal / committee (typed; venue table seeded with journal limits, e.g. PLOS ONE abstract ≤300 words) | your own archive (linked voice) or a named venue | outlet table seeded from the OpEd Project (NYT 400–1,200; WaPo ≤750; WSJ 600–1,200; LAT ~750; USA Today 650–900; Globe ≤700) — verify per outlet before seeding | "six-pager read silently" (Bezos); optional named audience |
| Phase defaults | all on; `stage: infer` (v1 = early, v≥2 = near-final) | all on; `stage: infer` | all on; `stage: near-final`; line depth full | `discourse` **off**; `verification` on with **user-supplied-source** verdicts; `web_fetch_of_user_data: forbidden` |
| Calibration language (verdicts) | accept · minor revisions · major revisions · reject · reject premise — reviewer voice ("R1 would say…") | publish · revise · rethink — editor voice | run · pass (with "why not this week") — opinion-editor voice | ship · rewrite · needs data — executive-reader voice |
| Length / apparatus | words from venue; apparatus full (footnotes + structured citations; ~10 CSL styles at export); abstract/keywords required | persona's regimes (two length regimes in the operator's own profile); apparatus none/light (no footnotes natively) | outlet word cap; apparatus none (links only) | pages (6 default); apparatus light (appendix/data tables); executive summary required |
| Integrity norms | no fabricated references (every citation verified or marked); **disclosure statement** (ICMJE/NeurIPS-shaped) generated at export; the machine may not supply results, data, or first-person method claims | none platform-level; provenance appendix optional | exclusivity reminder at export ("one outlet at a time"); news peg must be sourced | confidentiality: no web fetch of internal figures; the machine may not supply the recommendation or the numbers (Interview me collects them) |
| Intake expectations | outline/notes + bibliography (BibTeX/CSL-JSON import) + prior drafts; entry default: outline | notes or nothing; entry default: chat | a take + a news peg; entry default: chat (short) | data + decision + audience; entry default: outline |
| Workflow availability | Draft, Review, Revise, Fact-check, Abstract (default), Cut to length, Figure, Line edit, Titles, Reverse outline, Steelman, Map the field, Run rounds, Submission pack (v1.x) | all except Abstract (available, not default) | all; **Cut to length bound to the outlet**; Map the field default on | all; Map the field **available, off by default**; Figure default on; Abstract → "executive summary" |
| Trial fit | Quick review ≤3k words (a short paper section) | Quick review; the default Unfiled protocol | **the best trial demo**: a full-regimen review of 750 words is a fraction of Q-10's curve (note 12 §1.4) | Quick review with user-supplied sources |

**REQ-GENRE-3.** The four protocols above ship as seeded, versioned rows with the venue tables named; the Op-ed outlet table carries a `verified_at` per row and is re-verified before launch (note 12 open question).

**REQ-GENRE-4.** Essay is the default protocol for **Unfiled** projects (⚑ persona-less default); Academic is the default when the project's linked voice has `apparatus: full` in its structure repertoire; otherwise the new-project sheet asks once.

**REQ-GENRE-5.** The Academic disclosure statement (ICMJE/COPE/NeurIPS-shaped: which tool, which model tier, which phases, human responsibility) is generated from run history at export; it is a service, never a gate (Q-11 concerns personas, not disclosure).

**REQ-GENRE-6.** Memo protocol runs carry a per-run `user_sources[]` set (uploaded files / pasted tables) against which `verified against user-supplied source` is the only permitted verdict for internal figures; the launch sheet says so.

### 3.4 How users pick and override

1. **New project sheet** (after the entry-point choice): protocol picker as four cards with tagline + "what the Editor will hold you to" + typical cost band; a venue field (typeahead over the protocol's table, free text allowed); target length prefilled from the venue. Default per REQ-GENRE-4; one click to accept.
2. **Project settings › Genre & venue**: change protocol any time; changing it after a review exists does not touch delivered dossiers (they record `protocol@version`), and the next Review shows "protocol changed since v2 was reviewed" in its scope card.
3. **Per-run override** in the Review launch sheet (Advanced): protocol, venue, stage, phase toggles. Two reviews of one version under two protocols are legal (REQ-WF-6) and render side by side as "Review A (Academic) / Review B (Op-ed)".
4. **Safe-field editing** (REQ-GENRE-2) lives in the project settings; a per-project *standing guidance* ("always skip Map the field for this newsletter") is the coding-IDE "don't ask again" rule scoped to a project (note 4 §3.8).

### 3.5 How later genres plug in

A later genre is (a) a Protocol row, (b) optionally a rubric swap file, (c) optionally a venue table, (d) optionally a new *ledger column* — the two known ones are Journalism's **source-and-quote ledger** (who said what, on what record; note 12 §1.2) and Creative nonfiction's **only-the-author-can-supply gap list** surfaced as an Approval. Order (note 12 §1): Journalism (`reporting`, review-only default; v1.x), Creative nonfiction (v1.x), Technical docs (`docs`, showcase for platform house voices; v1.x), Marketing copy (later, as house voice + Line edit — never a copy product), Speeches (a register, not a protocol), Fiction (explicitly deferred: different rubric family, incumbent at $10–44/mo).

**REQ-GENRE-7.** Adding a protocol requires no code change outside a registry row, a rubric file, and (if any) one ledger-column extension; the claim-ledger schema has an extensible `extra` column set for genre ledgers.

---

## 4. The project lifecycle as the user experiences it (A4 → K1, C17, N3)

### 4.1 Entry points

Four (note 2 §4.3 + founding prompt): **Start from scratch** (opens the Assistant inside the empty project; three chips: *Research this · Propose a structure · Make an outline*), **Upload an outline** (.md/.docx/.pdf → Outline artifact; right rail "Outline detected: 7 sections, ~4,200 target words"), **Upload a draft** (→ Draft v1 `origin=upload`; "3,100 words, 12 citation-like spans"; primary button *Quick review*), and **Upload a draft + review** (a reviewed draft from elsewhere; v1.x — needs dossier import). Every new workspace also holds the **Showcase project** (note 6 §5.2), read-only, forkable.

**REQ-PROD-8.** Version labels are importable (a project may start at v3); rounds are numbered independently of versions (note 2 §4.4 #5).

### 4.2 The state machine the user sees

The source machine has four states (note 2 §4.2); Rhema surfaces eleven, all derived from artifacts and runs — nothing is stored as opinion.

| State (pill on the project card) | Definition (derived) | Legal workflows | **Suggested next** (the primary button) |
|---|---|---|---|
| **Empty** | no outline, no draft | Assistant chat; uploads | *Start from scratch / Upload* |
| **Researching** | chat has ≥1 assistant turn; no outline | Map the field, Steelman (thesis), Outline | *Make an outline* (appears once the chat contains ≥1 claim-shaped message) |
| **Outlined** | outline exists; no draft | Draft, Interview me, Map the field, Steelman, Titles | *Draft v1* |
| **Drafting / Running** | a run holds the write lock on the next version | Assistant (read-only side questions); Stop | (run card with phase progress, ETA, spend/cap) |
| **Draft** (unreviewed) | latest vN has no review | Review (any notch), Fact-check, Line edit, Cut, Figure, Titles, Reverse outline, Steelman, edit in place | *Review* (Quick on trial; Standard on paid) |
| **Needs you** (approval waiting) | any run in a waiting-on-approval state | Approve / Edit guidance / Stop | the Approval card |
| **Reviewed** | latest vN reviewed, unanswered | Revise, Interview me, Fact-check (targeted), Review again (other notch/protocol), edit → forks | *Revise from this review* — enabled after the Editor's letter has been opened |
| **Edited by you** | user edited a reviewed vN → v(N+1) `origin=human-revision` exists, orphaning the vN review | Revise (targets: review of vN, base v(N+1)); Review (fresh); Fact-check ("new claims pending") | *Revise using your edits* or *Review v(N+1)* |
| **Accepted** | user marked a version accepted (or Review verdict ∈ {accept, minor} and user confirmed) | Export, Submission pack, Titles/Abstract, further rounds (re-opens) | *Export* |
| **Exported** | ≥1 export of the accepted version | re-export; Archive | *Archive* (soft suggestion) |
| **Archived** | user archived; runs blocked; read-only | Unarchive; Export | — |

`Needs you` and `Running` are overlays (a project in *Draft* may also be *Running* a Fact-check). The project list groups by **Needs you / Running / Ready to read / Idle** (note 4 §5 "Workspace" row), with a one-line model-written summary per row.

**REQ-PROD-9.** State is a pure function of (outline?, versions[], reviews[], responses[], runs[], accepted_version?, exports[], archived_at?); the same function powers the card pill, the Suggested-next button, the palette's enabled verbs, and the mobile app.

### 4.3 The "Suggested next" rule

The founding prompt's next-step rule, kept as the *default* and never the *only* path (C4 ⚑ "far too impoverished"):

```
if archived                       → none
elif running                      → none (show run)
elif approval waiting             → the Approval
elif accepted && !exported        → Export
elif no outline && no draft       → (chat has claims ? Outline : Start)
elif outline && no draft          → Draft v1
elif latest.reviewed && !answered → (letter opened ? Revise : Read the Editor's letter)
elif latest.origin == human-revision && orphaned review → Revise using your edits
elif !latest.reviewed             → Review (notch = project default; Quick on Free)
```

Secondary suggestions (up to two chips) come from protocol `workflow_availability='default'` and the state: e.g., in *Draft* for Op-ed, "Cut to 750 (WaPo)" when over cap; in *Reviewed* for Academic, "Fact-check the 3 new figures". Every workflow remains reachable from the palette and the artifact's context menu regardless of state ("any workflow anywhere"), subject only to input availability.

**REQ-PROD-10.** The Suggested-next button is never the only affordance; the palette lists every workflow with a disabled-reason tooltip when inputs are missing ("needs an outline").

### 4.4 Human edits, versions, and the orphaned review

- Editing an **unreviewed** draft is in place (autosave; restore points). The drafting note is marked "describes the delivered version; you have edited since".
- Editing a **reviewed** draft forks immediately to **v(N+1) `origin=human-revision`** (N3; note 2 §4.5). The Findings UI stays anchored to vN and shows a banner: "You are editing v3 (your copy). The Editor's findings refer to v2." Anchors re-map by quote when possible.
- **Revise using your edits** runs `respond-to-review` with `review = vN review, base = v(N+1)`; it treats the user's edits as already-made moves (discharges are detected by the gap check), and marks human-added claims *pending verification* for the next Review (F5/N4).
- **Accept** is explicit: a button on any version (default suggested when a Review verdict is accept/minor). Accepting freezes the version and enables Export and Submission pack; further rounds re-open it (state returns to *Reviewed* or *Draft*).

**REQ-PROD-11.** Human-added or human-changed claims in an `origin=human-revision` version are auto-marked `pending verification` and listed in the next Review scope card ("12 claims changed since the last check").

### 4.5 Loop to convergence (Run rounds)

Round = one unit (Review → Revise), sequenced by the orchestrator's dumb loop with state in the round log (`orchestrate-build` pattern; note 2 §7).

**Criteria (pick one or more; all must hold):**
1. Verdict ∈ {accept, minor revisions} (or the protocol's equivalent: publish / run / ship).
2. No rubric dimension carries a cap, and every dimension ≥ *floor* (user-set; default 4; "publishable after minor revision").
3. Second read's thesis statement agrees with the Editor's (no *Thesis* cap).
4. No *major* finding survives two consecutive rounds (lineage tracked by finding id across dossiers).
Always: `max_rounds` (default 3, max 5) and `budget` (credits). These are the *external, evidence-bearing signals* the loop produces; the model's own sense of "done" is never a criterion (Self-Refine has no stopping rule; intrinsic self-correction degrades — note 12 §2.2).

**Stall detection:** if the rubric vector does not improve on any dimension between rounds *and* the same major-issue lineage recurs, stop and escalate: "The Editor and Drafter disagree on X after two rounds — you decide" (Decisions inbox). Each round is a homogenization exposure (respond-to-review README, cited in note 12), which is why the round cap is hard.

**Autonomy:** *checkpoint* (default; Continue? at each boundary, Approve triage inside each Revise), *manual* (every Approval), *auto* (Studio+; only with both caps; approvals auto-proceed with conservative defaults and every auto-decision is flagged). The run card shows cumulative spend vs budget, rounds used, and the criterion status as chips.

**REQ-PROD-12.** Run rounds produces a Convergence report (rubric trajectory chart, major-issue lineage table, spend per round) and writes each round to the timeline exactly as if run by hand; stopping mid-loop leaves a normal *Reviewed* or *Draft* state.

### 4.6 Concurrency the user can rely on

Never two writers of one draft (K3): a run that will write v(N+1) takes a write lock shown as a lock badge on the editor; the user may edit a **working copy** that reconciles as suggestions at delivery (note 8 carry-forward). Reads (Fact-check, Steelman, Titles, a parallel Review under another protocol) never lock. Parallel section drafting ("draft §II and §IV now"; Warp's executable plan, note 4 §4.5) is v1.x.

---

## 5. Feature matrix (C3)

Definitions: **MVP** = first public release (Free + Writer + Studio tiers; four protocols; web only). **v1** = the first-year spec; "v1.x" marks named minors after MVP. **Later** = v2+. Every row cites its source.

| # | Feature | MVP | v1 | Later | Source |
|---|---|---|---|---|---|
| **Projects & entry** | | | | | |
| 1 | Project list grouped Needs you / Running / Ready / Idle; secondary grouping by Voice; Unfiled default | ● | | | D2 ⚑, note 4 §5 |
| 2 | Three entry points (scratch / outline / draft) | ● | | | ⚑ |
| 3 | Entry point 4: draft + existing review (dossier import) | | v1.x | | note 2 §4.3 (c) |
| 4 | Showcase project seeded in every workspace | ● | | | note 6 §5.2 |
| 5 | Templates (protocol-shaped starter outlines) | | v1.x | | C6 |
| 6 | Search across projects/artifacts; archive; duplicate; fork under new voice | ● (search v1.x) | | | D2, J5 |
| **Assistant / chat** | | | | | |
| 7 | Long-context Assistant with web research, plan card + estimate before research bursts | ● | | | ⚑, note 5 §5 |
| 8 | Outline workflow (promote chat → Outline) | ● | | | C16 |
| 9 | Ask about this draft (read-only side questions during runs) | ● | | | note 4 §1.6 |
| 10 | Assistant can start any workflow (`start_workflow`) with the launch sheet | ● | | | G9 |
| **Core loop** | | | | | |
| 11 | Draft / Review / Revise (ported) | ● | | | ⚑ |
| 12 | Rigor dial (Quick / Standard / Full board) + Advanced toggles | ● | | | §1.5 |
| 13 | Approvals (approve-with-deadline; Wait for me) | ● | | | Q-7 |
| 14 | Findings UI: anchored comments carrying suggestions; dispositions; Margin/Full/Clean; bulk-with-preview | ● | | | T2, note 5 §4 |
| 15 | Claim ledger as table with URL per verdict; per-citation "verified" badge | ● | | | E6 |
| 16 | Second read shown incl. rejected findings | ● | | | note 2 #10 |
| 17 | Rubric view (8 bars, caps, no total) | ● | | | rubric.md |
| 18 | Draft diff vN→vN+1 annotated by triage moves; comments → next-round guidance | ● | | | D7 |
| 19 | Round timeline with run cards (phase, counters, ETA, spend/cap) | ● | | | D4 |
| 20 | Run report + round walkthrough (≤200 words) | ● (report) | walkthrough v1.x | | note 4 D20 |
| 21 | Decisions inbox for standing escalations | ● | | | note 2 C18 |
| 22 | Steering: stop (keep partials), queue guidance, comment on finding, edit plan mid-run | ● (first three) | edit-plan v1.x | | K5 |
| 23 | Review keyed by (version, run); parallel protocol variants | ● | | | REQ-WF-6 |
| 24 | Partial re-review of one section | | v1.x | | C4 |
| 25 | Parallel section drafting | | v1.x | | note 4 §4.5 |
| **v1 workflows** | | | | | |
| 26 | Fact-check · Cut to length · Figure · Outline | ● | | | §2.3 |
| 27 | Line edit · Titles · Abstract · Reverse outline · Interview me | | ● | | §2.3 |
| 28 | Steelman · Map the field · Run rounds (gated) | | ● | | §2.3 |
| 29 | Submission pack; Compose voice UI | | v1.x | | §2.4 |
| 30 | Peer-review simulation; Literature map; Structured dialogue; Translate register; Repackage; Reader test (reframed) | | | ● | §2.4 |
| **Genres** | | | | | |
| 31 | Academic, Essay, Op-ed, Memo protocols; venue tables | ● | | | §3 |
| 32 | Safe-field protocol editing; standing guidance per project | ● | | | REQ-GENRE-2 |
| 33 | Journalism (review-only), Creative nonfiction, Technical docs | | v1.x | | §3.5 |
| 34 | Custom protocols / rubric editing; Marketing; Fiction | | | ● (fiction: never as toggles) | §3.5 |
| **Editor & documents** | | | | | |
| 35 | Markdown-backed ProseMirror editor; paper in a dark shell; real light theme; two font presets; focus mode | ● | | | T6, Q-14 |
| 36 | Autosave (four layers), restore points, "unsaved" never exists | ● | | | N1 |
| 37 | Footnotes; structured citations (CSL-JSON items + cite nodes); BibTeX/CSL-JSON/Zotero import | ● | | | Q-8, note 5 §2 |
| 38 | Math (inline/block) | ● | | | H2 |
| 39 | Span-level provenance (you / Drafter / pasted / Assistant) + provenance appendix + AI-use statement | ● (marks) | appendix + statement ● | | note 5 §1.4, §2.3 |
| 40 | Figures: spec + data + provenance → SVG; iterate in chat; fact-checked | ● | | | Q-8, C12 |
| **Voices** | | | | | |
| 41 | Quick Voice and Full Profile; Approve sample; staleness pill (7 states); partial Refresh | ● | | | J1–J8 |
| 42 | Sample ingestion: upload (.md .txt .docx .pdf .rtf .odt .html .epub), paste, URL, Substack public archive, Medium/RSS; include/omit; re-sync | ● (Substack + upload + URL) | Medium/RSS/Ghost v1.x | | I1–I4 |
| 43 | Calibration report first tab; exemplars/positions/continuity read-only | ● | | | J6 |
| 44 | Soft-lock after v1; Fork under new voice; Adopt refreshed profile | ● | | | J5 |
| 45 | Composite voices (schema MVP, UI v1.x) | schema | UI v1.x | | J4 |
| 46 | Platform house/venue voices (openly licensed guides; descriptive venue profiles) | | v1.x | | J7 |
| **Export** | | | | | |
| 47 | Export md / txt / docx / pdf (Typst) / html | ● | | | Q-9, C15 |
| 48 | Export LaTeX, odt, rtf; Google Docs via Drive `drive.file` | LaTeX ● | odt/rtf/GDocs v1.x | | C15 |
| 49 | ~10 CSL styles at export | ● (5) | 10 v1.x | | note 5 §2 |
| 50 | "Send to Substack/Ghost/WordPress draft" | | | ● (still export-only; user publishes) | Q-9 |
| **Billing & usage** | | | | | |
| 51 | Cent-credits; tiers Free/Writer/Studio/Studio Max; prepaid top-ups; rollover 1 month | ● | | | note 10 |
| 52 | Pre-run estimate + guaranteed 1.5× cap; consent threshold; overage off by default | ● | | | note 10 §5.5 |
| 53 | Usage dashboard: account → project → run → phase × role × flags; tokens behind Advanced | ● | | | D12, L5 |
| 54 | Budget caps per project; alerts 50/80/100% | ● | | | L6 |
| 55 | Team tier (pooled credits, per-member caps) | | v1.x | | Q-6 |
| 56 | BYO keys (15% platform credits; no cap guarantee) | | v1.1 | | L7, Q-4 |
| 57 | Auto-refund of failed runs | ● | | | L8 |
| **Sharing & collaboration** | | | | | |
| 58 | Share a review dossier read-only by link (never default-shared) | | v1.x | | C13 |
| 59 | Project roles viewer / editor / admin (Databricks model); invite by email | | v1.x | | Q-6, C13 |
| 60 | Human co-reviewer comments merged into the Findings list | | v1.x | | C10 |
| 61 | Org/workspace entity, SSO (WorkOS), spend CSV | | | ● | L1 |
| **Mobile & notifications** | | | | | |
| 62 | Email + in-app notifications: run finished, approval waiting, voice stale | ● | | | D16 |
| 63 | Mobile app (Expo/RN): read drafts & findings, dispose, approve, chat, notify, light edits; "run next with defaults" | | v1.x | | Q-18, D19 |
| 64 | Push notifications | | v1.x (with the app) | | D16 |
| **Platform** | | | | | |
| 65 | Command palette with workflow verbs and artifact jumps | ● | | | D3 |
| 66 | Keyboard map; density toggle Summary/Normal/Verbose on the feed | ● | | | note 4 §3.8 |
| 67 | Account: profile, notifications, data export/delete; per-account analytics opt-out | ● | | | Q-12 |
| 68 | Multi-provider models (Anthropic first; research phases Anthropic in v1) | ● (Anthropic) | OpenAI/Google for non-research phases v1.x | | Q-4, G13 |
| 69 | Scheduling / automations ("re-check claims monthly", refresh voice on growth) | | | ● | note 4 §5 |
| 70 | User-configured MCP/tools | | | ● (maybe never) | note 4 §5 |
| 71 | Public API | | | ● | — |
| 72 | Trial: reverse trial 14 days, 600 credits, one Quick review ≤3k, daily micro-grant for chat, persistent capability-gated free tier | ● | | | D18 |
| 73 | Landing page with drop-zone hero, workflow strip, pricing on homepage | ● | | | D15 |
| 74 | English-only; localization | ● | | ● | Q-17 |

**REQ-PROD-13.** The matrix is the phasing source of truth for the ticketing session (O6); each row becomes an epic id `EPIC-<n>` matching the row number.

---

## 6. Argued additions and drops (C6)

Each C6 candidate, plus additions from the research, with a decision.

| Candidate | Decision | Argument |
|---|---|---|
| Outline-from-chat | **Add (MVP)** | The founding prompt's entry point (d); a *run*, not an export, so the outline arrives pre-triaged with provenance (note 5 §5; note 12 §2.3). |
| Steelman pre-write | **Add (v1)** | 70% built inside Review Phase 2; the standalone runs *before* a draft exists, which Phase 2 cannot; debate evidence supports it and demands the evidence-bound constraint (REQ-WF-16). |
| Discourse map → Map the field | **Add (v1)** | Phase exists; author-seat artifact; the boundary rule means the Editor re-derives it — accept the double cost and show it as independence (note 12 §2.2). |
| Convergence loop ("run rounds until score ≥ X") | **Add (v1), gated, criterion-based** | Never "score ≥ X" (the rubric bans aggregates); criteria are verdict/caps/floors/lineage (§4.5). Unbounded loops degrade and homogenize; caps are hard. |
| Citation manager | **Drop as a manager; add import/export** | Do not build Zotero. Structured citations in-model, BibTeX/CSL-JSON/Zotero import, CSL styles at export (note 5 §2 "adopt Zotero's lesson in reverse"). |
| Plagiarism / self-repetition check via `continuity` | **Add self-repetition (MVP, inside Review); drop plagiarism detection** | Continuity findings ("fourth piece to open on the same move") are already a Review output when a voice is linked. External plagiarism detection is a different product with licensing and false-positive liabilities; the claim ledger's "nothing cited that wasn't fetched" is the integrity story. |
| Reading-time & venue-length meters | **Add (MVP)** | Trivial; WordPress Outline precedent (note 5 §3.2); the venue cap from the protocol makes the meter *mean* something ("+212 over WaPo"). |
| Export to docx/pdf/latex/Substack-md | **Add (MVP: md/txt/docx/pdf/html/LaTeX)** | Q-9; Substack-flavored markdown is a profile of the md export (no footnote apparatus, links only) — a one-line option, not an integration. |
| Share-to-reviewer link | **Add (v1.x)** | Read-only dossier link for an advisor; never default-shared (Amp's shared-by-default rejected, note 4 §4.6). |
| Templates | **Add (v1.x)** | Protocol-shaped starter outlines are cheap once protocols exist; not needed for activation because the Showcase project fills the empty state. |
| Fact-check-only | **Add (MVP)** | The most legible trial product and the only feature a newsroom permits (note 12 §2.3). |
| Line edit rationed against voice print | **Add (v1)** | Differentiator over Grammarly ($12/mo, no voice print); suggestion-mode only (homogenization evidence). |
| Reader test / audience simulation | **Drop as measurement; later as labeled forecast** | Silicon samples fail statistical inference (48% of coefficients differ); the "no laundering" principle extends to the product (note 12 §2.3). |
| Peer-review simulation | **Later** | The Academic protocol's calibration language already *is* an R1; the multi-report format is presentation over the same dossier. |
| Reverse outline | **Add (v1)** | Cheapest structural diagnostic; component of Cut, Repackage, the fidelity audit, and the "what changed and why" view. |
| Interview me | **Add (v1; MVP-cheap)** | Turns the commissioning brief's open questions from a dumped note into the Approve-plan card's "Answer questions" action (principle 4: never invent what only the author can supply). |
| Disclosure statement / AI-use statement | **Add (v1)** | Emerging integrity primitive (Grammarly/iA Authorship; ICMJE/COPE); no competitor ties it to a review dossier (note 5 §2.3). |
| Persona ethics gating | **Drop** | Q-11; one-line AUP pass-through at voice creation. |
| Publishing to platforms | **Drop** | Q-9; "Send to draft" is at most a later export target. |
| Leaderboards / contribution metrics | **Drop** | Writing is not a lines-of-code sport (note 4 §5). |
| Browser/computer-use pane | **Drop** | The research feed *is* the agent's browser (note 4 §5). |
| Safety classifiers on actions | **Drop; replace with the spend gate** | Prose agents do not `rm -rf`; the only irreversible actions are spend and overwrite, both gated (note 4 §5). |
| Daily-expiring micro-grant | **Add (trial only)** | Habit loop for cheap actions (Lovable/v0); heavyweight runs stay on monthly credits (note 6 §5.3 #4). |
| Scheduling ("re-check claims monthly") | **Later** | Rounds are author-initiated; the only scheduled job worth having is platform-side voice refresh (note 4 §5). |

**REQ-PROD-14.** Reading-time and venue-cap meters render in the editor status bar from the protocol's `length_norms` and the venue row; over-cap shows the Cut to length chip.

---

## 7. Success metrics and analytics events (C11)

### 7.1 North star and the funnel

**North star: pieces accepted per month** (a version marked *Accepted* after ≥1 Review) — the buyer's value metric ("pieces taken through a round," note 10 §3 #2), not runs or tokens.

| Stage | Metric | Target (first 90 days after launch; to be re-based) | Why |
|---|---|---|---|
| Acquisition | Landing → signup rate; drop-zone usage share | signup ≥ 6% of landing visits; ≥ 40% of signups arrive via the drop-zone | note 6 §2 (demo-in-hero converts) |
| Activation (inference-free) | **Opened a finding and saw its anchor** in the Showcase project within 60 s | ≥ 70% of signups | T2 activation event (note 6 §5.2) |
| Activation (own work) | First own run completed (Quick review / Fact-check / Draft preview) within 24 h | ≥ 45% of signups (AI/ML activation median 54.8%, note 6 §3.3) | — |
| Value | First Revise completed ("round-1 rate"); **round-2 rate** (a second Review on v≥2) | round-1 ≥ 50% of first reviews; round-2 ≥ 35% | the loop is the product (T1) |
| Conversion | Trial → Writer/Studio within 14 days | ≥ 10% (reverse-trial hybrid median ~8%, note 6 §4.2) | grant economics require ≥ ~10% at ≤ $4 inference/signup |
| Retention | Monthly active projects per paying user; 30/90-day paid retention | ≥ 1.5 projects; 90-day ≥ 60% | writers' cadence is per piece, not daily |
| Quality | Disposition mix (accept+adapt share of findings); second-read yield (findings unique to the second read); user-reported "the one thing was right" (thumbs on the letter) | accept+adapt ≥ 55%; second-read yield measured (README claims ~⅓ — verify before quoting) | note 6 open question |
| Economics | **Gross margin per run** (credits billed × $0.01 − list COGS); credit utilization; estimate accuracy (actual/estimate); cap-breach rate (absorbed); refund rate | blended GM ≥ 50% (note 10 §5.3); utilization 55–65%; p90 actual/estimate ≤ 1.3; cap breach ≤ 3% of runs | note 10 |
| Trust | Approval latency (time to approve); auto-proceed share; run cancel rate; boundary-attestation failures (must be 0) | auto-proceed < 40% (people are reading the plans); cancel < 8% | Q-7 |
| Voice | Profiles built; staleness-refresh conversion; calibration verdict distribution | ≥ 30% of paid users build a voice in month 1 | J-rows |

### 7.2 Analytics event catalogue

Events are emitted by the orchestrator and the web app; user-visible run events (K2) are a separate stream. Names are `object.verb`; every event carries `{user_id, workspace_id, project_id?, run_id?, protocol_id?, tier, surface: web|mobile}`.

- **Acquisition/onboarding:** `landing.viewed`, `landing.dropzone_used`, `signup.completed{method}`, `email.verified{trigger: first_run}`, `showcase.opened`, `showcase.finding_anchor_viewed` (activation), `entry.chosen{scratch|outline|draft}`.
- **Projects:** `project.created{protocol, venue, voice?}`, `project.protocol_changed`, `project.voice_linked`, `project.forked{reason: new_voice}`, `project.accepted{version}`, `project.exported{format}`, `project.archived`.
- **Runs:** `run.estimated{kind, rigor, estimate, cap, levers_shown}`, `run.lever_changed{lever, delta}`, `run.launched{kind, rigor, estimate}`, `run.phase_started/finished{phase, duration, cost}`, `run.approval_opened{approval}`, `run.approval_decided{approve|approve_auto|guidance|stop, latency, auto_proceeded}`, `run.stopped{phase, partials_kept}`, `run.completed{cost_actual, cost_estimate, cap_hit, verdict?}`, `run.failed{stage, refunded}`, `run.report_viewed`.
- **Findings/dispositions:** `finding.viewed{phase_of_origin, severity}`, `finding.disposed{disposition}`, `findings.bulk_previewed`, `findings.bulk_applied{count}`, `diff.comment_added`, `letter.opened`, `letter.rated{up|down}`, `secondread.opened`.
- **Loop:** `rounds.started{criterion, max_rounds, budget, autonomy}`, `rounds.round_completed{k, rubric_vector, verdict}`, `rounds.stalled`, `rounds.converged{criterion_met}`.
- **Voice:** `voice.created{quick|full, samples}`, `voice.sample_approved{n_read, held_out}`, `voice.built{calibration_status}`, `voice.staleness_shown{state}`, `voice.refreshed{delta_pieces}`.
- **Billing:** `credits.granted{source}`, `credits.held/debited/released`, `estimate.consent_shown/accepted/declined`, `paywall.shown{location: launch_sheet}`, `plan.upgraded{from,to}`, `topup.purchased`, `refund.issued{reason}`.
- **Editor:** `draft.edited{version, reviewed: bool, forked: bool}`, `draft.restore_point_used`, `figure.proposed/accepted/iterated`, `citation.imported{format}`.

**REQ-PROD-15.** Every run event carries `cost_actual`, `cost_estimate`, and `rigor` so estimate accuracy and margin roll up without joins; product analytics honor the per-account opt-out (Q-12).

**REQ-PROD-16.** A weekly metrics report (the table in §7.1) is generated from the event stream; the trial grant size and the consent threshold are tuned from `run.estimated`/`run.completed` and `paywall.shown` data, not fixed in code.

---

## 8. Risks and recommended departures (Q-20)

### 8.1 Departures from operator requirements

1. **Persona change after the first draft: soft-lock, not hard lock.** The founding prompt leans to "just not allow this to change after the first draft." Recommendation: freely changeable until v1 exists; after that, **Fork under new voice** and **Adopt refreshed profile (re-seed charter)** are the two escape hatches, and the plain "change voice" control is disabled with an explanation. Reasoning: the precedence rule (guidance > charter > persona) means a swap after v1 is mostly a no-op for existing text and a register-switch defect for new text (note 12 §3.4); but the *refresh* case is legitimate and common (a profile refreshed mid-project should be adoptable), and a hard lock would push users to duplicate projects by hand. The operator's intent (protect the voice) is fully honored; only the UI shape differs.
2. **Mobile ships after the web MVP (v1.x), not in MVP.** Q-18 asks for a limited mobile app. Reasoning: the mobile core (approve from the train, read findings, dispose) depends on artifacts that exist only once the web loop is live and on push infrastructure; Substack itself launched its app editor a year after web and still keeps composition on web (note 5 §3.1). The feature split is fixed now (matrix #63) so the app is a projection, not a redesign.
3. **Structured dialogue is specified but not shipped in v1.** Q-16 asks for roadmap skills "in v1 spec." All four are fully specified (note 12 §2.2); three ship in v1; structured dialogue composes from Steelman + Map the field, needs a transcript UI, and no MVP genre requires it. Shipping it before its components would invert the dependency.
4. **C0/C1 workflows have no Approval.** Q-7 says gates on by default. Titles, Abstract, Reverse outline, Line edit, Interview me, and Figure cost < $3 and produce proposals the user accepts or discards — the acceptance *is* the gate, and an approval card in front of a 3-credit run is friction without protection. Approvals stay on for every C2+ run and every run that writes a version. Q-7's rationale ("steps are long and expensive") does not apply to these.

### 8.2 Risks

| Risk | Severity | Mitigation in this design |
|---|---|---|
| **Cost ranges are model outputs, not measurements** (A7 open); price cards could be wrong by 2× | High | Publish ranges only after one instrumented run per workflow (note 10 open q. 7); the 1.5× cap absorbs variance; ranges in §2 are marked provisional. |
| **Rigor dial hides that "Quick" is a different product** (no discourse map, top-5 claims) | Medium | The notch's card lists what is off; the run report says "the full board adds …"; the Quick verdict vocabulary is the same but the letter is labeled "Quick review". |
| **Run rounds becomes a $300–600 button** | High | Budget mandatory; auto only on Studio+; stall detection; cumulative spend meter; every round is a normal timeline entry. |
| **Naming drift between internal `author`/`editor` and product Drafter/Editor** | Low | Single i18n table; REQ-PROD-6 lint; telemetry uses skill ids. |
| **Protocol tables go stale** (op-ed word caps change; journal limits) | Medium | `verified_at` per venue row; users can type their own venue; stale rows show the date. |
| **Memo confidentiality vs. web research** | High (trust) | Protocol forbids web fetch of user data; user-supplied-source verdicts; the launch sheet states it. |
| **Trial economics** (≤ $4 inference/signup requires ≥ ~10% conversion) | High | Quick review only on ≤ 3k words; Op-ed protocol as the cheapest full-regimen demo; grant re-sized from telemetry (REQ-PROD-16). |
| **Reviewer-side misuse** (a peer reviewer uploads someone else's manuscript; NeurIPS/NSF prohibit) | Medium (policy) | ToS clause; the product is positioned as the *author's* pre-submission check; Peer-review simulation stays later and is never marketed to reviewers. |
| **Homogenization across rounds** | Medium | Hard round caps; Line edit is suggestion-mode with byte-identical untouched text; voice charter precedence surfaced in the UI. |
| **Human-revision orphaning confuses users** | Medium | Explicit *Edited by you* state, banner, and "Revise using your edits" path (§4.4). |
| **Four protocols in MVP stretch QA** | Medium | All four are the same seven phases with defaults; the golden-corpus regression (G11) runs each protocol on the three real projects plus one op-ed and one memo fixture. |

---

## Ledger updates

| Row | Status | Evidence |
|---|---|---|
| C1 | done (design) | §1: Drafter / Editor / Assistant; workflow verbs; Approvals; Rigor Quick/Standard/Full board; tiers Free/Writer/Studio/Studio Max/Team; model tiers Standard/Advanced/Frontier; "Voice" for persona in product surfaces |
| C3 | done (design) | §5 feature matrix, 74 rows phased MVP/v1/later |
| C4 | in-progress → design input | §4.3 any-workflow-anywhere + Suggested next; parallel variants; phase-subset runs |
| C5 | done (design) | §3 protocol object (TypeScript), four MVP protocols spelled out, override rules, plug-in path |
| C6 | done (decision) | §6 — 24 candidates argued |
| C7 | design input | §1.4 Approvals table with deadlines; REQ-PROD-4; REQ-WF-10 defines "operator reachable" |
| C11 | done (design) | §7 metrics + event catalogue |
| C16 / A9 | done (product framing) | §2 catalogue: 4 ported + 12 v1 + 8 later, each with launch sheet, phases, approvals, artifacts, cost, genres, phase |
| C17 (terminal states) | done | §4.2 Accepted / Exported / Archived + Edited by you |
| C18 (standing escalations) | design input | Decisions inbox referenced in §2.2 Revise and §4.5 |
| J5 | confirmed | §8.1 #1 soft-lock departure argued |
| D18 | design input | trial shape in §1.6, §2.2, matrix #72 |
| K7 (phase-subset runs) | adopted | REQ-WF-13 |
| Q-16 | departure noted | §8.1 #3 |
| Q-18 | departure noted | §8.1 #2 |
| Q-7 | refinement | §8.1 #4 (no approval on C0/C1 proposals) |

**Proposed new rows.**
- **C20** — i18n vocabulary lint: role / tier / model-tier / rigor / approval names disjoint (REQ-PROD-6). (D/A)
- **C21** — Venue table governance: seeded rows with `verified_at`, re-verification schedule, user-typed venues. (P)
- **C22** — Quick review configuration as a named rigor notch profile (phases, claim cap, word cap, model tier) shared by trial and paid tiers. (P/A) — supersedes note 6's "C-x Quick Review configuration".
- **K8** — State derivation function (REQ-PROD-9) as one shared module used by web, mobile, palette, and notifications. (A)
- **N4** — `origin=human-revision` version with `pending verification` claim marking and "Revise using your edits" run mode (REQ-PROD-11). (A)

## Open questions

1. **Cost ranges** in §2 derive from note 10's parametric model; the price card must not ship until A7 telemetry replaces them (the Quick-notch numbers are the least certain).
2. **"Drafter"** is my pick over "Author"; the operator may prefer to keep "Author" for continuity with the repo — the ICMJE argument stands either way and I recommend against "Author" in academic surfaces even if kept elsewhere.
3. **Default Approval deadline** (30 min) is a judgment call; note 4 says "minutes, not 30 s" and nothing in the evidence fixes a number. Tune from `run.approval_decided.latency`.
4. **Op-ed outlet table** rows carry no date on the source page; verify before seeding (note 12).
5. **Whether Interview me should be MVP** rather than v1: it is C0 and mostly UI over an existing artifact; I placed it v1 but flagged it MVP-cheap. `design/6` may pull it forward as the Approve-plan card's "Answer questions" action.
6. **Second-read yield ("~⅓ of findings")** is a README claim; do not use it in upgrade copy until measured in-product.
7. **Reporting protocol** intake (notes, transcripts, documents rather than an outline) needs an ingestion design before v1.x; not covered here.
