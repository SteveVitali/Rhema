# Source-system extraction — what `~/agent-discourse` actually specifies

- Scope: ledger rows A1, A2, A3, A4, A5, A6, A8, A9 · Date: 2026-08-27 · Sources fetched: 0 web (this is a local close-read; 62 local files read in full, listed under Sources)
- Read in full: all four `skills/*/SKILL.md`, all 12 `skills/*/references/*.md`, all four `skills/*/README.md`, `conventions/{project-memory,personas}.md`, repo `README.md`, `.claude-plugin/*.json`, both `agent-scratch/notes/*.md`, the three project manifests, the three `PERSONA.md` seeds, the `sjs-substack` profile hub/calibration/provenance/corpus-index plus one hold-out corpus note, and from `the-politics-of-visibility`: the drafting note, commissioning brief, voice charter, response ledger, response letter, editor's letter, claim-ledger/second-read/fidelity-audit heads, both research indexes, one source note. Also `~/agent-skills/skills/orchestrate-build/SKILL.md` and the first 80 lines of its README. Drafts were not read in full (per assignment).

## Executive summary

**Observed.** The source system is four `SKILL.md` regimens (draft-from-outline 7 phases, editorial-review 7 phases, respond-to-review 7 phases, bootstrap-persona 6 phases + a compose mode) over two conventions: a per-piece *project memory* (shared record + two private agent namespaces) and a cross-project *persona library* (human seed + derived profile). Every phase writes a complete markdown artifact to disk before the next phase starts; files are the only inter-phase interface. Each skill has exactly one human gate (`autonomous:false`) and 2–3 opt-out flags for heavyweight phases. Every skill wants subagents for two jobs — research fan-out and *judgment independence* (second read, fidelity audit, gap analysis, blind check) — and specifies a labeled sequential fallback.

**Decisions this note supports (recommendations).**
1. The **project state machine is tiny** (§4): four states keyed on (outline?, latest draft reviewed?, latest review answered?), one loop, no terminal state. The founding prompt's "next workflow" rule is exactly what the skills already say in their delivery reports. Rhema should add the states the conventions omit: *human-revised draft*, *accepted/exported*, *archived*.
2. The **artifact inventory is 39 artifact types** (§2). First-pass visibility: 12 surfaced-editable, 10 surfaced-read-only, 12 inspectable, 5 hidden. The key nuance for T3: the *user is the author*, so most `agents/author/*` memory (outline, drafting dossier, voice charter, ledgers) is the user's own working record and should be inspectable; only `agents/editor/*` and the persona hold-out are truly harness-only. Refutes the strong form of T3.
3. **Every boundary rule is normative today** (§5): 19 rules the backend must enforce mechanically, of which 6 need sandbox mounts / scoped file APIs, 4 need URL-level fetch denylists (hold-outs, paywalls), and 3 need input-scoping of subagents (second read gets *only* the draft).
4. **Harness requirements are 14 items** (§6); the two hard ones are a fresh-context primitive that can be *input-scoped* (not just isolated) and a per-URL fetch denylist. Long-context + compaction survival is explicitly designed *out* by the file discipline.
5. Six items in the conventions will be **awkward to productize** (§9): the walk-up persona discovery, mixed-authorship `PERSONA.md`, in-place calibration corrections with inline provenance notes, the self-reported attestation, the single-review-per-version rule with no human-edit path, and unbounded Phase 2↔3 re-plan loops.

**Contradictions with theses/decisions:** T3 (strong form) refuted; T5 partly refuted — the convention's staleness rule has **two** inputs (corpus growth >25%, age >6 months), not three; a seed edit is *not* a staleness trigger in the source system and must be added by Rhema. Q-11 (no ethics gating) conflicts with `bootstrap-persona`'s hard rule that non-`self` `positions.md` is quotation-bound and its restrictive-default `usage=study`; the spec must consciously disable those.

## 1. Per-skill extraction (A1)

Conventions shared by all four skills: harness-neutral prose; frontmatter `name/license/description/inputs`; "never block on a missing input, infer and declare"; write every phase artifact fully to disk before the next phase; opt-out flags never relax operating principles; final report attests to the boundary allowlist; final report names the "natural next step".

### 1.1 `draft-from-outline` (author agent)

| Item | Observed |
|---|---|
| Inputs | `outline` (req.), `persona`, `register`, `venue`, `length`, `guidance`, `fidelity` (`adaptive`/`strict`), `project_dir`, `grounding` (default on), `audit` (default on), `autonomous` (default true) |
| Phases | 0 Intake → commissioning brief (4-way classification commitment/advice/material/alternatives; refusals; claim inventory with provenance classes and tiers; gaps; open questions) · 1 Voice binding → voice brief · 2 Structure plan (spine of 5–12 claims; section map with function/entry/exit/material/budget; promise/payoff; apparatus budget; cut list; deviations) · **GATE** · 3 Grounding (Tier-1 first; re-verify every outline citation; fill gaps; source notes) · 4 Draft (section-by-section, ledger updated per section; new claims logged as written) · 5 Consolidation (coherence, promise/payoff, thesis discipline, budget reconciliation, measured voice audit, provenance sweep) · 6 Fresh-context fidelity audit (6 walks; max 3 close-and-rerun iterations) · Delivery |
| Human gate | One: after Phase 2 when `autonomous=false` — present brief + voice brief + plan and wait. Observed in practice: `the-politics-of-visibility` v1 ran `autonomous:false`; operator answered "approved, proceed" (drafting note). Open questions are otherwise resolved conservatively and listed in the drafting note. |
| Subagent use | Phase 3 fan-out (each subagent gets a slice of the claim inventory + provenance rules + allowlist; writes its own source notes and ledger rows). Phase 6 fresh context given *exactly* draft, brief, plan, claim ledger, voice brief, outline — **not** the draft ledger or consolidation notes. **Phase 4 is never fanned out** ("a piece written by five contexts has five voices"). Observed: six research subagents, ~90 source notes for 48 claims. |
| Reads | outline; persona `profile/index.md` → voice-print, structure-repertoire, lexicon, exemplars, audience-and-venue (+continuity); existing `drafts/*` if any; own `agents/author/research/index.md` |
| Writes | `agents/author/outline/` (copy of source, never edited); `agents/author/drafting/v<N>/00–06`; `agents/author/research/{index.md,sources/*}`; `drafts/v<N>.md`; `correspondence/v<N>-drafting-note.md`; `manifest.md` (create if absent; round-log entry) |
| Opt-outs | `grounding=false` → every inherited claim ships `[unverified]`; `audit=false` → no independence check |
| Loops | Phase 3 Tier-1 failure → return to Phase 2 (**no iteration cap** — noted as open in the self-review, F17); Phase 6 ≤ 3 iterations |
| Cost drivers | Outline size (the real one: 2,615 lines / 10,125 words); claim count (48 inventoried; 72 outline URLs all `utm_source=chatgpt.com` → zero-trust fetch of every one); target length (9,700 words drafted); persona profile load (~9k words of profile files); audit iterations (2 observed) |
| Delivery report | Title/thesis, length vs target, 3 structural decisions, verified/unverified counts, largest cut, open questions, paths, next step, attestation. Never pastes the draft. |

### 1.2 `editorial-review` (editor agent)

| Item | Observed |
|---|---|
| Inputs | `draft` (req.), `venue`, `stage` (`early`/`near-final`), `persona`, `register`, `concerns`, `output_dir`, `project_dir`, `verification` (on), `discourse` (on), `second_read` (on). **No `autonomous` input and no human gate.** |
| Phases | 0 Intake → piece brief (thesis, genre, audience/venue bar, argument skeleton, claim inventory with tiers, research agenda) · 1 Verification → claim ledger (six-verdict closed vocabulary) · 2 Discourse mapping → discourse report (predecessors, originality verdict, strongest counterargument, misrepresentation check, reception forecast) · 3 Argument & substance (acceptability/relevance/sufficiency; continuity findings when persona given) · 4 Structure/prose/voice at three altitudes, depth scaled to `stage` · 5 Independent second read (fresh context, **draft only**, fixed instruction) + reconciliation · 6 Editor's letter + rubric (8 dims, 1–5, entailment caps, no aggregate) |
| Human gate | None. Delivery is the only surfacing point. |
| Subagent use | Phases 1, 2, 5 run in parallel as subagents after Phase 0; editor does Phase 4 meanwhile, then 3, then 6. Sequential fallback order 0,4,1,2,5,3,6 with Phase 5 labeled non-independent. |
| Reads | draft; prior `correspondence/*` (dossiers + response letters) in re-review rounds; own `agents/editor/research/`; persona structure-repertoire, audience-and-venue, positions, continuity — **deliberately not voice-print, lexicon, exemplars** |
| Writes | `correspondence/v<N>-review/{00-piece-brief,01-claim-ledger,02-discourse-report,05-second-read,editors-letter}.md`; `agents/editor/research/*`; manifest round log. **Ground truth:** every real dossier also contains `03-argument-notes.md` and `04-craft-notes.md` (all three projects, including the 2026-08-21 run under the current formulation) — the SKILL's dossier listing is out of date with practice (A3 deviation). |
| Opt-outs | `verification`, `discourse`, `second_read` — each must be declared in the letter |
| Re-review rule | Holds the author to the response letter: spot-check claimed changes, weigh rebuttals, don't re-raise well-rebutted findings; reuse verified claims whose wording is unchanged; check the response letter's unverified list first |
| Cost drivers | Claim count (56 checked on a 9.7k-word draft, 46 Tier-1); "dozens of searches" across Phases 1–2; fetch-blocked domains force mirror hunting (the claim ledger lists 9 blocked domains); draft length; `stage=near-final` adds line-level craft |
| Delivery report | Verdict, "the one thing", top 3 majors, one strength, pointers, attestation |

### 1.3 `respond-to-review` (author agent)

| Item | Observed |
|---|---|
| Inputs | `review` (req.; defaults to latest unanswered review), `draft`, `project_dir`, `persona`, `register`, `guidance`, `autonomous` (true), `research` (on), `gap_analysis` (on) |
| Phases | 0 Bootstrap (read draft **before** review; read dossier; map guidance; load own memory; create/update voice charter; seed response ledger) · 1 Independent verification & repair/rebuttal research · 2 Triage → response ledger (every finding class enumerated; one of accept/adapt/rebut/defer/escalate; mandatory rationale; revision plan as ordered *moves* with discharges/moots) · **GATE** · 3 Revise → `drafts/v(N+1).md` (structure → argument/evidence → craft; untouched text untouched; coherence read; invariants) · 4 Verify new claims · 5 Fresh-context gap analysis (coverage/discharge/faithfulness/rebuttal quality/regressions; ≤3 iterations) · 6 Deliver |
| Human gate | After Phase 2 when `autonomous=false` **or** when unresolved escalations exist, guidance is silent, *and* "the operator is reachable" — a conditional gate the harness must be able to answer. Under autonomy: conservative option + flag at the top of the letter. Observed: politics v1→v2 ran autonomously with no guidance; 2 escalations resolved conservatively and flagged. |
| Subagent use | Phase 1 fan-out when research load is heavy; Phase 5 fresh context given *only* letter+dossier, guidance, ledger, vN, v(N+1). |
| Reads | manifest; `drafts/vN.md`; the dossier; prior response ledgers; `agents/author/research/index.md`; `voice-charter.md`; persona voice-print, lexicon, exemplars |
| Writes | `agents/author/voice-charter.md` (create/update); `agents/author/ledgers/vN-response-ledger.md` (frozen at delivery); `agents/author/research/*`; `drafts/v(N+1).md`; `correspondence/vN-response.md`; manifest (current version, round log, next-round agenda for deferrals) |
| Opt-outs | `research=false` → rebuttals lose their evidentiary bar; `gap_analysis=false` → no completeness proof |
| Cost drivers | Finding count (49 in the real round); verdict re-verification (fetch every Contradicted/Misleading/Unsupported source); repair research (23 new references added); new-claim verification (33 rows); draft length growth (9.7k → 12.35k words); gap-analysis iterations |
| Delivery report | Disposition counts, escalations, 2–3 biggest moves, unverified/unresolved, paths, next step, attestation |

### 1.4 `bootstrap-persona`

| Item | Observed |
|---|---|
| Inputs | `persona` (req.; id, path, or new id), `corpus`, `personas_dir`, `mode` (`bootstrap`/`refresh`/`compose`), `usage` (`self`/`consented`/`house`/`study`; default `study` with prominent report), `sample` (default: everything up to ~12 pieces), `calibration` (on) |
| Phases | 0 Resolve/consent/census (enumerate corpus; choose sample; **reserve 1–2 hold-outs, never fetched**; write provenance; stub index) · 1 Close reading → one corpus note per piece · 2 Voice print, structure repertoire, lexicon, exemplars (≤12 excerpts ≤40 words) · 3 Positions, continuity, audience-and-venue · 4 Calibration (predict hold-out opening from title/subtitle/date/topic only → read → measured + qualitative compare → correct profile with logged corrections → optional blind check) · 5 Package (index hub with staleness verdict; append marked note to `PERSONA.md`; report) |
| Compose mode | 8 steps, no corpus read: resolve leaf members; most-restrictive mode; `register-map.md`; union positions/continuity with member+citation; optional `shared-lexicon.md`; **no voice files**; index with staleness = worst member; routing calibration (predict member from title/venue/date). Never exercised (`all-steven-vitali` is seed-only). |
| Human gate | None in-run. The appended seed note is the async gate ("three things for the human to decide"). |
| Subagent use | Phase 1 one subagent per piece/batch, each told the hold-out URL **never to open**; Phase 4 blind check in a fresh context. Observed run was fully sequential (no subagent primitive available; disclosed in `provenance.md`). |
| Reads | seed; `docs/*` (read-only); archive pages; under refresh: `provenance.md`, `calibration.md` first |
| Writes | everything under `profile/` (10 files + `corpus/`); appends to `PERSONA.md`; **never writes `docs/`** |
| Opt-outs | `calibration=false` → profile unfalsified |
| Cost drivers | Corpus size and sample (10 essays / 28.3k words read; 26.1k measured); per-piece note writing; measurement (the operator used ad-hoc Python scripts in `agent-scratch/tmp/`, contrary to the README's "no scripts" claim); PDF extraction for `docs/` corpora (untested — 6 PDFs never opened) |
| Staleness rule | Refresh when corpus grows >~25% **or** profile >~6 months old. A stale profile is still usable; consumer states the date. |

### 1.5 Cross-skill structural facts

- **Verdict vocabulary is shared**: Verified / Substantially accurate / Misleading in context / Unsupported / Contradicted / Unverifiable — used by editorial-review Phase 1, draft-from-outline Phase 3 (with a drafting-instruction column), and respond-to-review Phase 4. One enum in the data model (F1).
- **Ledger status vocabularies**: draft ledger `planned → drafted → seams-read → verified | cut | deferred`; response ledger `open → done → verified | mooted | deferred | escalated | honored`; both with `Phase status` headers (`intake|voice|plan|grounding|drafting|consolidation|audit|delivered` and `bootstrap|research|triage|gated|revising|verifying|gap-analysis|delivered`). These are the run/step state machines K1 wants, already named.
- **Precedence chain**: human `guidance` > voice charter > persona > model default (stated in personas.md, respond-to-review, README).
- **Three independence gates share one mechanism**: fresh context + explicitly enumerated inputs + "rebuild the list from the source, not from the extraction" (fidelity audit rebuilds commitments from the outline; gap analysis rebuilds findings from the dossier; second read gets the draft alone).
- **Skills cross-reference by relative path** (`provenance-rules.md` → `../../editorial-review/references/verification-protocol.md`; `voice-print.md` → `prose-standards.md §5`). The skill bundle is one unit; porting one skill alone breaks links.
- **Standalone mode** (editorial-review without project memory) exists and produced `constitution-of-reason`'s v2 dossier, later migrated. Rhema always has a project; drop standalone.

## 2. Complete artifact inventory (A2, A3) with first-pass visibility (feeds §E)

Legend — Producer: **H** human, **A** author agent, **E** editor agent, **B** bootstrap-persona, **S** system/derived. Mutability: *live* (edited in place across a run), *frozen-at-delivery*, *immutable-once-reviewed*, *append-only*, *human-only*. Size class from real projects: XS <500 words, S 0.5–2k, M 2–5k, L 5–15k, XL >15k or many files. Visibility: **SE** surfaced-editable, **SR** surfaced-read-only, **I** inspectable on demand, **H** hidden (harness-only).

### 2.1 Project memory

| # | Artifact (path) | Producer | Consumers | Mutability | Size | Visibility | Reason |
|---|---|---|---|---|---|---|---|
| 1 | `manifest.md` (title, slug, persona + profile date, venue, current version, round log, next-round agenda, provenance notes) | A/E/H | all agents, next-workflow rule | append-only round log; header fields updated | S (328–600 words) | **SR** as timeline; not a file | Derived from Run/Version/Event tables (E2). Round log *is* T1's spine. Next-round agenda → a structured backlog entity. |
| 2 | `drafts/v1.md` … `vN.md` | A (or H for uploaded / operator-registered versions) | all agents; user | immutable once a review or response exists for it; editable before | L (5.7k–14.1k words) | **SE** until reviewed, then **SR** with "fork to v(N+1)" | Immutability signal (D7). SPD v3/v4 are operator-registered versions — human edits already produce new versions in practice. |
| 3 | `drafts/figures/*.png`, `drafts/taxonomy_reference_sheet.md` (A3 deviation: non-draft assets inside `drafts/`) | H/A | draft, reviewer | free | S–M | **SE** as project assets / companion docs | Not in the convention; precedent for C12 (figures) and a "companion document" type. |
| 4 | `correspondence/vN-drafting-note.md` | A | editor, user | frozen | S (~1.1k) | **SR** | The delivered account of how vN was made; what the user reads first after a draft run. |
| 5 | `correspondence/vN-review/editors-letter.md` | E | author agent, user | frozen | L (4.1k–5.4k) | **SR**, rendered as the review hub | T2: sections map to UI (verdict, one thing, majors, strengths, roadmap, considered-and-rejected). |
| 6 | `…/00-piece-brief.md` | E | author (via dossier), gap analysis | frozen | S–M (1.7k–2.8k) | **I** | Editor's steelman + claim inventory + research agenda. Useful for trust ("here's what the editor thought you were writing"); not needed by default. |
| 7 | `…/01-claim-ledger.md` | E | author, user | frozen | L (3.8k–8.6k) | **SR** as a claims table | E6 transparency floor: every verdict with URL. Render as data, not prose. |
| 8 | `…/02-discourse-report.md` | E | author, user | frozen | M–L (4.1k–5.1k) | **SR** | Originality verdict, counterargument, reception forecast — high user value. |
| 9 | `…/03-argument-notes.md`, `…/04-craft-notes.md` (A3 deviation: emitted by every real run though absent from SKILL's dossier list) | E | author (finding classes), gap analysis | frozen | S–M (1.3k–2.2k) | **I** | Working notes folded into the letter; keep because the response ledger enumerates them as finding sources. |
| 10 | `…/05-second-read.md` | E (fresh context) | editor reconciliation, author, user | frozen | S–M (1.6k–2.1k) | **SR** | The "independent second opinion" is a marketable trust feature; also shows what the editor rejected. |
| 11 | `correspondence/vN-response.md` | A | editor (reads first next round), user | frozen | M (2.3k–3.4k) | **SR**; flags section surfaced as decisions-needed | T2: the point-by-point letter *is* the disposition UI's read-only view. |
| 12 | `agents/author/outline/*` (source material as given) | H | author agent, fidelity audit | never edited by agents | L–XL (10.1k words / 2,615 lines) | **SE** (it is the user's own document) | Refutes strong T3: this is user-supplied. Editing after v1 exists must be versioned (drafting note refers to it). |
| 13 | `agents/author/drafting/vN/00-commissioning-brief.md` | A | plan, audit, drafting note | frozen | M (3.4k) | **I** | User may want to see commitments/refusals/open questions; gate content comes from here. |
| 14 | `…/01-voice-brief.md` | A | Phases 4–6, later voice charter | frozen | S (1.4k) | **I** | Shows which persona member/targets were used. |
| 15 | `…/02-structure-plan.md` | A | Phase 3–6, **the gate** | live until gate, then frozen (re-plan appends) | M (3.1k) | **SR** at the gate with approve/edit-guidance; **I** after | The gate artifact. Whether the user may *edit* the plan vs. supply guidance is a C7 decision; the skill only reads `guidance`. |
| 16 | `…/03-claim-ledger.md` (author's) | A (+subagents) | Phase 4–6, drafting note | live, frozen at delivery | L (6.7k) | **I** as a claims table | Same shape as #7; user-facing when asking "was this verified?". |
| 17 | `…/04-draft-ledger.md` | A | Phase 5–6, resume point | live per section; frozen | S (1.2k) | **I** (progress) / **H** (content) | Its `Phase status` and section rows are the live-progress feed (D4); the deviation log is explicitly withheld from the audit and is process residue. |
| 18 | `…/05-consolidation-notes.md` | A | audit (withheld), drafting note | frozen | S (0.9k) | **H** | Process residue; nothing actionable for the user beyond what the drafting note reports. |
| 19 | `…/06-fidelity-audit.md` | A (fresh context) | Phase 6 closure, drafting note | frozen (per iteration) | L (7.3k) | **I** | "Independent audit" is a trust feature; surfaced summary in the drafting note suffices by default. |
| 20 | `agents/author/research/index.md` + `sources/<slug>.md` | A (+subagents) | author agent across rounds | append/update; never a raw page | XL (124 notes / 36.6k words on the real project) | **I** as a source library | E6: "sources actually fetched". The user's own research record; hide by default for simplicity, not secrecy. |
| 21 | `agents/author/ledgers/vN-response-ledger.md` | A | gap analysis, later rounds, response letter | live; **frozen at delivery** | M (2.9k–3.3k) | **SR** via the disposition UI (T2) | The disposition controls *are* this ledger; the frozen state must be enforced (SPD's ledger still reads `Phase status: gap-analysis` — never frozen; A3 defect). |
| 22 | `agents/author/voice-charter.md` | A (seeded from letter's Strengths + persona) | respond-to-review Phases 3–5 | living doc, round log appended | S (0.5k–0.75k) | **I**, with "add guidance" rather than direct edit | E3: precedence is guidance > charter, so user intent enters as guidance; direct edits would blur agent/human provenance. |
| 23 | `agents/editor/research/index.md` + `sources/*` | E (+subagents) | editor across rounds | append/update | L–XL (40–52 notes / 6–7k words) | **H** by default; **I** as sources-with-URLs only | The boundary's other half. Exposing the *URLs* satisfies E6 without exposing deliberations. |
| 24 | `agents/editor/notes.md` | E | E | living | — | **H** | Specified in the convention, **never used in any project** (A3). Drop. |

### 2.2 Persona library

| # | Artifact | Producer | Consumers | Mutability | Size | Visibility | Reason |
|---|---|---|---|---|---|---|---|
| 25 | `PERSONA.md` seed (id, byline, Mode, Corpus, Also, Members, free prose, Never list, known essays, provenance) | **H** | every skill; bootstrap | human-only prose **plus an agent-appended marked note** and a hand-maintained "pieces in progress" list | S (0.6k–0.7k) | **SE** (seed) + **SR** (agent note as a separate object) | J3: split the mixed-authorship file. The "pieces in progress" list is stale in practice (says politics has "no draft yet") — derive it. |
| 26 | `docs/*` (operator-supplied corpus files; 6 PDFs) | H | bootstrap | read-only to agents; never written | XL | **SE** (samples manager) | I1/I4: this becomes the ingestion pipeline. Untested path in the source system. |
| 27 | `profile/index.md` (hub: mode, coverage, staleness verdict, one-paragraph voice, load table, calibration verdict, known gaps) | B | every consumer first | regenerable | S (0.7k) | **SR** as the persona detail page | T5: staleness verdict lives here; render as a status pill computed by the system (F6), not read from prose. |
| 28 | `profile/voice-print.md` | B (+review corrections) | drafter, reviser; **not** editor | regenerable; calibration carve-out edits with inline markers | S–M (1.7k) | **I** ("advanced") | E4/E5: measured rates and rations are secret-sauce-adjacent and noisy for users; expose summary numbers only. |
| 29 | `profile/structure-repertoire.md` | B | drafter, editor | regenerable | S–M (1.4k) | **I** | Same. |
| 30 | `profile/lexicon.md` | B | drafter, reviser | regenerable | S (0.9k) | **I** | Same. |
| 31 | `profile/exemplars.md` (≤12 excerpts ≤40 words) | B | drafter, reviser | regenerable | S (0.6k) | **SR** | Short quotes from the user's own work; good "what the system learned" display. |
| 32 | `profile/positions.md` (40 cited positions + open tensions) | B | editor; drafter for continuity | regenerable | S–M (1.6k) | **SR** | High user value ("what you've argued"); open tensions are a trust feature. |
| 33 | `profile/continuity.md` | B | editor, drafter | regenerable | S (0.9k) | **SR** | Same. |
| 34 | `profile/audience-and-venue.md` | B | drafter, editor | regenerable | S (0.6k) | **I** | Venue mechanics; mostly derivable from the link. |
| 35 | `profile/calibration.md` (prediction, measured table, divergences, corrections, review corrections) | B | consumers "before trusting"; refresh | append-only after build | M (2.1k) | **SR** as a "calibration report" | J6: the honesty artifact — "prose right, mind wrong" is the best possible expectation-setting. |
| 36 | `profile/provenance.md` (census, sample, hold-outs, method, staleness rule) | B | refresh; audits | regenerable | S (0.7k) | **I** | Powers the staleness computation; census table → Sample entities. |
| 37 | `profile/corpus/index.md` + `<slug>.md` + `HOLDOUT-*.md` | B (+subagents) | Phase 2; refresh | regenerable; hold-out notes written only after prediction | L (11 notes / ~9.3k words) | **H** (notes); hold-out identity **H** until calibration | The hold-out must be unreadable by *any* consumer before Phase 4; corpus notes are distillation the "notes not corpora" rule exists for. |
| 38 | Composite extras: `profile/register-map.md`, `profile/shared-lexicon.md`, unioned `positions/continuity` with member tags | B (compose) | drafter/reviser (routing), editor (union) | regenerable; cheap to re-run | S | **SR** (register map as routing rules the user can override via `register`) | J4: never exercised in the source system; the provisional map lives in the seed today. |
| 39 | Legacy flat `<id>.md` persona | H | migration only | migrated on first write | — | n/a | Drop. |

**Counts:** 39 types; visibility SE 6 (2, 3, 12, 25-seed, 26, plus 15 at the gate if editing is allowed), SR 15, I 13, H 5. Size envelope of one mature project on disk: ~211k words of markdown excluding research notes (`wc` over the three projects), plus ~49k words of source notes — i.e. **one project ≈ 250k words ≈ 350k tokens** of durable text; a persona profile ≈ 20k words.

### 2.3 Ground-truth deviations worth carrying into the spec (A3)

1. Dossiers contain `03-argument-notes.md`/`04-craft-notes.md` in all three projects; the SKILL lists five files. Define the artifact schema once, in code.
2. `constitution-of-reason` starts at **v2** (author's own numbering; no v1 in memory), its dossier was produced standalone with stale path references, and its editor research is empty. Version labels must be importable, not always 1-based.
3. `structure-of-political-difference` has v3 and v4 registered as "operator-directed" with "new claims pending next claim-ledger round" — human revisions create versions outside any run, and its response ledger was never frozen.
4. `drafts/figures/` and `taxonomy_reference_sheet.md` live under `drafts/` — assets and companion docs have no home in the convention.
5. `agents/editor/notes.md` is never created; `manifest.md` in SPD/COR lacks the persona line the convention requires.
6. The `sjs-substack` seed carries a hand-maintained "pieces in progress" list that is already stale; the composite seed still says "~7 essays" after the census found 10 (self-review F22, escalated to the human, unresolved).
7. Zero `[unverified: …]` marks exist in any draft — the marking rule has never been exercised in shipped prose; the drafting note carries "report-level provenance flags" instead.
8. Measurement was done with ad-hoc Python (`agent-scratch/tmp/*.py`) despite the README's "no scripts" claim; corpus cache deleted afterwards per notes-not-corpora.

## 3. What the conventions imply about "the user is the author"

*Inferred.* The source system has two agents, but the human occupies the author's chair in every design statement: `guidance` outranks everything; escalations go "to the human author"; the voice charter's "deliberate departures from the persona" are the human's decisions recorded by the agent; the outline is the human's document. So `agents/author/*` is not a secret from the user — it is the user's own assistant's notebook. The privacy boundary that carries product value is **editor ↔ author** (the reviewer never sees the author's rationalizations; the author never sees the reviewer's undelivered deliberations), plus the **persona hold-out**. That is what §2's visibility column encodes and why T3's "hidden by default" should be narrowed to editor memory (E3).

## 4. The formal project state machine (A4)

### 4.1 State variables (all derivable; nothing needs storing as opinion)

- `outline`: none | present (path under `agents/author/outline/`)
- `drafts`: ordered versions v1..vN with per-version flags `reviewed(vK)` (a `correspondence/vK-review/` exists) and `answered(vK)` (a `correspondence/vK-response.md` exists, which implies `v(K+1)` exists)
- `origin(vK)`: drafted-from-outline | response-to-review | human-upload | human-revision (operator-registered)
- `persona`: none | seed-only | profiled(fresh) | profiled(stale) | composite(uncomposed | composed)

### 4.2 States and legal transitions

| State | Definition | Legal workflows (→ next state) | "Natural next step" the skills themselves name |
|---|---|---|---|
| **S0 Empty** | no outline, no draft | upload outline → S1; upload draft → S2(v1, human-upload); [roadmap] chat/research → outline → S1 | — |
| **S1 Outline only** | outline, no drafts | `draft-from-outline` → S2(v1) | — |
| **S2 Unreviewed draft** | latest vN has no review | `editorial-review(vN)` → S3; human edit before review → S2 (in place, vN mutable); human "register new version" → S2(v(N+1), human-revision); `draft-from-outline` again → S2(v(N+1)) (skill says: "you are writing the next version") | `editorial-review` |
| **S3 Reviewed, unanswered** | latest vN reviewed, no response | `respond-to-review` → S2(v(N+1)); human edit → **must** become v(N+1) (vN immutable) → S2(v(N+1)) with the vN review *orphaned* | `respond-to-review` |
| (loop) | S2 → S3 → S2 … | unbounded | `editorial-review` on v(N+1) |

The founding prompt's "next workflow" rule is exactly the S1/S2/S3 row logic; it is already what each skill's delivery report says.

### 4.3 Entry points

Three, per `project-memory.md` §Versioning ("a project may begin at any point in the chain"): (a) outline → `draft-from-outline` creates the layout; (b) hand-written draft → the first `editorial-review` creates the layout; (c) draft + dossier → `respond-to-review` "creates one next to the draft and migrates draft + dossier into it" (the COR path). Rhema adds (d) start from chat (roadmap `outline-from-research`, C16). Persona bootstrap is an independent machine (seed → profiled → stale → refreshed; members → composed) linked by the manifest's persona + profile-date fields.

### 4.4 Dead-ends and gaps the conventions leave

1. **No terminal state.** An `accept` verdict changes nothing; there is no "done / exported / published" (Q-9 export-only). Rhema must add *Accepted*, *Exported*, *Archived*.
2. **One review per version.** `correspondence/vN-review/` is a single directory and delivered dossiers are immutable, so a second review of the *same* vN (different genre protocol, a re-run after cancellation, a partial re-review per C4) has no path. Needs `vN-review-<k>/` or a Review entity keyed (version, run).
3. **Human edit of a reviewed draft orphans the review.** If the user edits vN after review, immutability forces v(N+1); `respond-to-review` defaults to "the latest unanswered review" (of vN) but would copy `drafts/vN.md` → `v(N+1).md` — which now exists. The skill has no rule for "respond to the vN review against a human-revised v(N+1)". SPD's operator-registered v3/v4 sidestepped this by never running a response afterwards. Rhema needs an explicit *human-revision* event and a response mode that targets (review of vN, base v(N+1)).
4. **`draft-from-outline` in a project with no outline** (entry b/c) is illegal; **editing the outline after v1** is undefined (it is "as given; never edited" but is the user's file).
5. **Versions need not start at 1** (COR starts at v2) and **round numbering diverges from version numbering** ("round 1" reviewed v1; COR's "round" reviewed v2).
6. **Deferred findings** go to a free-text `manifest.md` "Next-round agenda" that no skill formally reads back (editorial-review reads correspondence, not the manifest agenda). Needs a backlog entity consumed by the next review run.
7. **Cancellation / partial completion** is unspecified; the ledgers' `Phase status` fields are the resume points ("a fresh session reads ledger + drafts + dossier and continues") — K6 partial-result semantics can be built on them.
8. **Persona change mid-project** is unaddressed; the manifest records persona + profile date only. Voice charter continuity (respond-to-review seeds from "the member the charter already names") means a persona switch after v1 silently conflicts with the charter — supports J5's lock-after-v1 lean.

### 4.5 Human edits, precisely

- Before any review or response exists for vN: edit in place is legal (convention: immutable "once reviewed or responded to"). Caveat: the drafting note describes the delivered vN; editing makes it stale silently.
- After: edits **must** create v(N+1) with `origin=human-revision`, a round-log entry with `actor: operator` (SPD precedent), and the claim-laundering rule applies — SPD's manifest records "new intro claims uncited pending next claim-ledger round". So the system must mark human-added claims as *unverified* for the next review (F5, N3).
- Voice charter / ledgers / dossiers: never human-edited in the source system; human intent enters via `guidance` and the gate.

## 5. Mechanical-enforcement table (A5)

Every rule below is normative prose today ("the boundary is normative … operators who want hard enforcement should apply it at the OS layer"). Enforcement class: **FS** filesystem/mount scoping, **NET** fetch allow/deny list, **CTX** subagent input scoping, **DB** schema constraint/trigger, **RUN** orchestrator rule, **AUDIT** logged and checked post hoc.

| # | Rule (source) | Applies to | Enforcement | Notes |
|---|---|---|---|---|
| B1 | Author readable set is exactly `drafts/`, `correspondence/`, `manifest.md`, `agents/author/`, persona library (project-memory §boundary; all three author-side SKILLs) | author-role runs + their subagents | FS mount excluding `agents/editor/`; AUDIT of paths | Replaces the self-attestation. |
| B2 | Editor readable set is exactly `drafts/`, `correspondence/`, `manifest.md`, `agents/editor/`, persona library minus voice files | editor-role runs | FS + AUDIT | Persona partial visibility (B5) needs file-level, not dir-level, scoping. |
| B3 | No recursive search/listing/bulk read over the project root | all runs | FS (root not mounted; only allowed subtrees mounted) | The convention's "likeliest violation is a legitimate search" disappears if the root is simply absent. |
| B4 | Allowlist propagated verbatim into every subagent prompt | all subagent spawns | RUN (orchestrator injects) + FS (inherit mounts) | With FS enforcement the prose becomes belt-and-braces. |
| B5 | Per-role persona load table (personas.md §what loads when): editor never loads `voice-print`, `lexicon`, `exemplars`; drafter loads voice files of **one** member for composites | all persona consumers | FS (per-role persona view) + RUN (register routing recorded) | F2 agent-type capability config. |
| B6 | Second read receives **only the draft** (editorial-review Phase 5) | second-read subagent | CTX: sandbox with a single file, no web, no project mount | Independence, not just isolation. |
| B7 | Fidelity audit receives exactly draft, brief, plan, claim ledger, voice brief, outline — not the draft ledger or consolidation notes | audit subagent | CTX | Same. |
| B8 | Gap analysis receives exactly dossier, guidance, response ledger, vN, v(N+1) — not revision history | gap subagent | CTX | Same. |
| B9 | Hold-out pieces never fetched by any context before Phase 4; named by URL in every corpus subagent prompt | bootstrap runs | NET denylist per run + RUN | Also hide hold-out identity from the UI until calibration. |
| B10 | Respect paywalls / robots / platform terms; public pages only | all fetches | NET policy | I2/M4. |
| B11 | Never cite a source not fetched this session; every ledger row carries URL + accessed date | verification phases | AUDIT: every URL in an artifact must appear in the run's fetch log | Makes E6 "sources actually fetched" verifiable. |
| B12 | `docs/` is agent-read, never agent-written; never dump fetched pages anywhere | all runs | FS read-only mount; AUDIT no page-sized blobs | Notes-not-corpora. |
| B13 | Delivered artifacts immutable: dossiers, response letters, drafting notes; `drafts/vN` once reviewed/responded | storage | DB: write-once flag set by the delivering run / by review creation | F5. |
| B14 | Ledgers frozen at delivery; "never edit history — append reversals" | ledgers | DB: append-only rows; freeze flag | SPD shows freezing gets forgotten without enforcement. |
| B15 | `PERSONA.md` prose never rewritten by agents; only a marked note appended | bootstrap | DB: seed (user-owned) vs agent-note (system-owned) as separate fields | Resolves the mixed-authorship file. |
| B16 | Derived profile files never hand-edited **except** calibration corrections, each with inline marker + `calibration.md` log entry | profile | DB: profile immutable to users; corrections stored as structured records rendered into the profile | Self-review F03 carve-out. |
| B17 | Composite rules: members must be leaf personas; mode = most restrictive; no voice files at composite level; consumers state which member | compose runs + consumers | DB constraint (no composite members) + RUN | J4. |
| B18 | Draft never fanned out to parallel subagents; drafting is single-context | draft runs | RUN | Also a cost-shape fact: drafting is a long single context. |
| B19 | Iteration caps: audit ≤3, gap analysis ≤3; Phase 2↔3 re-plan **uncapped** | runs | RUN budget caps; add a cap for the re-plan loop | K4/L6. |
| B20 | Gate semantics: draft gate after Phase 2; response gate after Phase 2 or on unresolved escalations when "operator reachable" | runs | RUN: gate = durable wait state with timeout → conservative default + flag | Q-7 gates on by default; "reachable" must become a policy (wait N hours, then autonomous path). |
| B21 | Attest at delivery that no out-of-allowlist path was touched | runs | AUDIT replaces attestation with a generated access report | F4 "attestation becomes verifiable". |

### 5.1 Persist vs. recompute (project-memory §persist; personas §staleness)

| Class | Items | Rhema treatment |
|---|---|---|
| **Persist** (expensive, stable) | Source notes + research indexes; frozen ledgers; delivered dossiers, letters, drafting notes; voice charter; outline + drafting dossier (plan, cut list, deviations); manifest round log; persona per-piece notes, voice print, measured features, positions with citations, calibration results, provenance | Durable storage, versioned; these are the cross-round cache and the audit trail |
| **Recompute always** (cheap or perishable) | Any judgment about the *current* draft text; verdicts for claims whose wording/scope changed; reception forecasts and "current state of discourse" older than the round; anything about what a persona "would think" (labeled inference); staleness verdict | Never cache; compute staleness from hashes/dates (F6); mark forecasts with round stamps |
| **Never persist** | Raw fetched pages; judgments about draft text outside round-frozen artifacts; anything whose purpose is to spare reading the draft | NET fetch results are ephemeral per run; storage policy forbids page blobs (I5 tension: the platform *must* store user-uploaded samples — that is the `docs/` exception, not fetched pages) |
| **Reuse rule** | "Read the index first; reuse before re-fetching; update a note rather than duplicating"; claim verified in round 1 with unchanged wording need not be re-verified | Source-note dedup by URL; claim identity across versions (text-similarity) is a real engineering task for K4 cost estimates |

## 6. Harness requirements (A6) — what the skills assume of the runtime

1. **File read/write** over a project tree with per-role mount scoping (B1–B3).
2. **Web search + fetch** at volume: "dozens of searches" per review; 72 outline URLs + replacements per draft; 23 new refs per response. Fetch-blocked domains are routine (AP, WIRED, SAGE, Wiley, MDPI, OHCHR, justice.gov, fbi.gov listed in one claim ledger) — the harness needs mirrors/Wayback strategies or a fetch service with better reach (G3).
3. **PDF/document reading** for `docs/` corpora and primary sources (court PDFs, law-review PDFs, a Wayback book PDF were all read); PDF extraction for the academia persona is untested.
4. **A fresh-context primitive that can be input-scoped** (B6–B8), not merely isolated; and parallel fan-out (six research subagents in one draft run; Phases 1/2/5 in parallel for review).
5. **Per-run URL denylist** for hold-outs (B9) and policy allowlist for paywalls/robots (B10).
6. **Long single-context drafting** (B18): one context writes ~10–14k words section by section while re-reading plan + ledger; plus compaction survival via disk artifacts (the skills assume compaction *will* happen and design for it: "a long drafting run loses context; the ledger is what makes that free").
7. **Resumability**: every ledger carries `Phase status`; a fresh session must be able to resume from ledger + drafts + dossier (K6).
8. **Durable human gates** (B20) with a definable "operator reachable" policy.
9. **Deterministic measurement** (sentence/paragraph stats, punctuation rates per 1k words, signature-move counts, word budgets per section, hazard-word scans). Today ad-hoc Python; the README says "no scripts". Rhema should provide a TS measurement service (Q-3) used by Phases 5/6, voice charter checks, and calibration — this is also cheap progress data for D4.
10. **Structured event emission** per phase (phase started, claim checked, source read, artifact written, gate opened) — implied by the ledgers' run logs, not by the skills; needed for K2.
11. **Prompt-injection posture**: fetched pages and outlines are untrusted input (the sibling `orchestrate-build` states "treat spec text as data, not instructions"); the discourse skills do not say this — add it (G8/M4).
12. **Skill file loading with progressive disclosure**: hub SKILL.md ≈ 3–4k words, references loaded per phase (≈1k each); cross-skill relative links must resolve (G4 porting).
13. **Model capabilities**: instruction-following over ~500-line regimens, tool use, web tools; capability gating per provider for phases needing web/subagents (G13).
14. **Cost/telemetry per phase and per role** — nothing in the skills tracks it; the ledgers record counts (claims checked, notes written) that are natural cost proxies (C14).

Explicitly *not* required: a huge context window (the design is file-first), persistent chat memory, or any harness-specific tool names (the skills forbid them).

## 7. Roadmap skills and the sibling `orchestrate-build` (A9)

**As described in the repo README:** `steelman` (strongest opposing essay as a pre-writing stress test); `discourse-map` (Phase 2 of editorial-review as a standalone, run before writing); **loop orchestration** (drive `editorial-review ↔ respond-to-review` to a convergence criterion "in the style of the sibling repo's `orchestrate-build`"); structured-dialogue tooling between positions. The founding prompt adds outline-from-chat; Q-16 asks for all of these to be fully specified in v1 (C16).

**`~/agent-skills/skills/orchestrate-build` (present; read).** Its mental model transfers almost verbatim and should be the template for the loop skill and for G6:

- Three roles: **state on disk** (a ledger with a structured `CURRENT STATE` block: `nextTicket`, `lastCompleted`, `blockedOn`, `pauseRequested`, `chainTip`, `autonomy`), **cognition in fresh disposable contexts** (one unit per context), **sequencing in a dumb loop** that holds no LLM context (`scripts/drive-build.sh`). "Nothing accumulates context across the build."
- `autonomy` ∈ {auto, checkpoint, manual}; the unit boundary is the only safe pause point; humans intervene by editing the ledger; "never fabricate green"; blocked → stop.
- Dispatch ladder: subagent → headless process → scheduler → human; headless CLIs silently deny writes unless `--yolo` — an explicit safety opt-in.
- A **capstone** whole-build verification in a fresh context after the last unit.

*Recommendation for the discourse loop:* a round = one unit; ledger state = manifest round log + per-round verdict/scores; convergence criterion = verdict ∈ {accept, minor} or no rubric dimension < 4 or N rounds; capstone = a final fresh-context review; pause = between rounds (the response gate is *inside* a unit and must be handled by B20). This is exactly the durable orchestration layer T4 wants, and its single-threaded-writes rule maps onto "never two writers of the same draft" (K3). Alternatives rejected: driving rounds inside one long context (the sibling README's whole argument is against it); a per-finding loop (respond-to-review's moves-not-patches rule forbids it).

**Which enter v1 (P decision, recommendation):** loop-to-convergence (v1 — it is the product's core "run rounds" affordance and the orchestration layer must exist anyway); `discourse-map` (v1 — it is a subset of an existing phase and is the natural pre-writing research step from the in-IDE chat); outline-from-chat (v1 — required by the founding prompt's entry point d); `steelman` (v1.x — new regimen, cheap, high demo value); structured dialogue (later — no artifact model exists for it).

## 8. Known defects and decisions from the notes (A8)

From `2026-08-20-drafting-and-personas-requirements.md`: design decisions recorded — two skills not one (bootstrap is once-per-persona, drafting is per-piece); personas outside project memory with an ordered discovery rule; seed authoritative / profile derived; binding at draft time = exemplars + measured constraints + anti-signature + positions for continuity; hold-out fidelity check; one directory per persona with `PERSONA.md` + `docs/`; one author/two registers → separate personas; composite as union-not-average with `mode: compose` and a `register` input on consumers; non-goals: no persona tooling/scripts, no live bootstrap in that pass. As of that date `draft-from-outline` had never run (since run once, 2026-08-20).

From the self-review ledger (fresh-context review, closed 2026-08-20; 24 findings):
- **Fixed:** stale corpus-level aggregates from a mid-run measurement fix (F01, F06 → rule: recompute everything on method change); over-narrow anti-signature range (F02); convention vs calibration protocol contradiction on editing derived files (F03 → carve-out); draft-from-outline's recast-on-sight rule would have stripped the persona's signature negation-then-correction move (F04 → ration governs); second hold-out pattern unspecified (F05 → adopted); truncated quote (F07); continuity not absorbing calibration corrections (F08); label mismatch (F09); stale word counts (F10); missing URL column (F11).
- **Refuted:** hold-out leakage (F12); invented staleness rule (F13); sequential fallback inadequacy (F16).
- **Open/deferred:** composite path never exercised (F14); `docs/` PDF path never exercised (F15); **no iteration cap on the Phase 2↔3 re-plan loop** (F17); stale "~7 essays" in the composite seed (F22, escalated to human); sentence statistics are splitter-dependent (documented, unresolved).
- **Design judgment recorded:** the title-only content prediction "mostly measures topic guessability" (F19) — the calibration test proves prose fidelity, not mind fidelity; the profile's own verdict is "trust it for how a sentence should sound … do not trust it to predict what the author would argue".

From the real runs (manifests/letters): the politics project's round costs give the shape behind Q-10 — draft: 48 claims, ~90 source notes, 6 subagents, 2 audit iterations; review: 56 claims, 52 editor notes, full regimen; response: 49 findings, 23 new refs, 33 new-claim rows, draft +27% length. Length overrun against the corpus ceiling became a *standing escalation* the skills cannot resolve — an example of an identity-level decision that needs a UI.

## 9. Flags: what will be awkward to productize

1. **Directory-walk persona resolution** (`<project_dir>/../personas/`, walking up, `~/.agent-discourse/personas/`) and "state which was used" — replace with an explicit Project→Persona link and a profile snapshot id; the skill text must be edited at port time (G4).
2. **Mixed-authorship `PERSONA.md`** (human prose + agent-appended note + hand-maintained "pieces in progress") — split into seed, system note, and derived project list (J3).
3. **In-place calibration corrections with inline "Corrected after calibration" prose markers** — provenance must become structured records; otherwise the "profile lying about its provenance" failure returns the moment a UI lets users edit.
4. **Self-reported attestation** — meaningless in a product; replace with FS scoping + access log (B21).
5. **One review per version, immutable, no human-edit path** — the single largest gap between conventions and an editable IDE (§4.4 items 2–3; F5, N3, D17).
6. **`autonomous` as one boolean per skill** with one pause point each, and respond-to-review's "operator reachable" clause — gates need a durable wait state and a timeout policy (B20, C7).
7. **Unbounded loops and unbudgeted phases** (Phase 2↔3; "dozens of searches") — cost caps must be imposed from outside the skill (L6).
8. **Anchoring by quote + "§XI ¶2" strings** — every finding, invariant, and discharge evidence locates text by section/paragraph reference and short quote; the editor must resolve these against a live document (H3). Fragile across versions by design; the skills accept it because they re-read from disk.
9. **Measurement by ad-hoc scripts** contradicting "no scripts" — needs a first-class service (Q-3: TS).
10. **Dossier schema drift** (03/04 files) and **standalone mode** — fix the schema; drop standalone.
11. **Persona ethics machinery** (`usage=study` default, quotation-bound `positions.md` for non-`self`, `docs/` "does not enlarge what the mode permits") vs **Q-11 no gating** — keep `Mode` as metadata; consciously disable the behavioral rules in the ported skill text, and note the legal exposure once.
12. **Fetch-blocked primary sources** are handled by hand (mirrors, Wayback, syndication) — a product fetch layer must do this systematically or verdicts degrade to "unverifiable" at scale (G3).
13. **Skill text is the secret sauce** (rubric caps, verdict vocabulary, hazard lists, six restatement tests, disposition taxonomy) — E5: never ship as text; ship outputs.

## Rhema implications

1. **State machine (A4 → K1, F5, N3).** Adopt S0–S3 plus *Human-revised*, *Accepted*, *Exported*, *Archived*; model Review as (version, run) so re-review and genre-variant reviews of one version are legal (C4, C5). Confirms T1: the manifest round log is the spine.
2. **Visibility policy (A2 → E1–E4).** Use §2's column as the first pass: editor memory hidden (URLs exposed); author memory inspectable because the user is the author; delivered correspondence read-only and rendered as structured views (claims table, disposition UI); drafts editable until reviewed. Narrows T3.
3. **Enforcement (A5 → F4, G8).** Per-role sandbox mounts, input-scoped subagents, URL deny/allow lists, write-once flags, append-only ledgers, generated access reports. The convention itself says this is the intended hard layer.
4. **Harness (A6 → G1, G5, G13).** The two discriminating capabilities when scoring harnesses are input-scoped fresh contexts and controllable fetch; long context is not a requirement.
5. **Loop orchestration (A9 → G6, C16).** Port `orchestrate-build`'s ledger-plus-dumb-loop pattern; rounds are units; convergence criteria come from the rubric's structure (no aggregate score → use verdict and per-dimension floors).
6. **Persona staleness (T5, J2, F6).** Source rule has two inputs; add seed-hash and sample-set-hash as Rhema triggers; compute, don't store.
7. **Cost model (A7/C14).** The ledgers already count the cost proxies (claims, notes, findings, new refs, iterations); instrument those as first-class metrics.
8. **Measurement service (D14/H, Q-3).** Sentence/paragraph/punctuation/hazard metrics are used by five phases across three skills; build once in TS.
9. **Human-edit semantics (D17, N2, N3).** Editing a reviewed draft forks v(N+1) with `origin=human-revision`; human-added claims are auto-marked unverified for the next review; the drafting note/charter never edited directly — intent enters as guidance.
10. **Q-11 vs skill text.** Record explicitly that the ported bootstrap skill removes the restrictive-default and quotation-bound rules.

## Ledger updates

| Row | Proposed status | Evidence |
|---|---|---|
| A1 | done | §1 of this note (four SKILL bodies, 12 references, 4 READMEs read in full) |
| A2 | done | §2 inventory, 39 artifact types with producer/consumers/mutability/size/visibility |
| A3 | done | §2.3 — eight deviations (03/04 dossier files; v2-start; operator-registered versions; figures/companion docs under drafts; unused editor notes; missing manifest persona lines; zero `[unverified]` marks; ad-hoc measurement scripts) |
| A4 | done | §4 — states, entry points, next-workflow rule, eight dead-ends, human-edit semantics |
| A5 | done | §5 — 21 enforceable rules with enforcement class; persist/recompute table |
| A6 | done | §6 — 14 harness requirements |
| A8 | done | §8 — decisions and 24 self-review findings summarized; open items F14, F15, F17, F22 |
| A9 | done (recommendation pending P sign-off) | §7 — roadmap skills, `orchestrate-build` read, v1 placement proposed |
| E1–E4 | in-progress | §2 visibility column is the first pass for the design agent |
| T3 | revise | strong form refuted (§3): only editor memory + persona hold-out are harness-only |
| T5 | revise | staleness rule has two inputs in the source; seed-change trigger is a Rhema addition |

**New rows proposed:**
- **F9** — Review entity keyed by (version, run) so one version can carry multiple reviews (genre variants, partial re-reviews, re-runs); dossier artifact schema fixed in code (§2.3.1, §4.4.2).
- **N4** — `origin=human-revision` version type with automatic "claims pending verification" marking (§4.5; SPD precedent).
- **G14** — Input-scoped subagent primitive as a hard harness requirement (B6–B8) distinct from mere isolation.
- **G15** — Per-run URL denylist/allowlist service (hold-outs, paywall policy) (B9–B10).
- **M10** — Deterministic prose-measurement service in TS (voice metrics, budgets, hazard scan) shared by drafting, response, calibration, and progress UI.
- **C17** — Terminal states: Accepted / Exported / Archived; what "accept" verdict does in the UI.
- **C18** — Standing-escalation UI: identity-level forks that persist across rounds (length vs corpus ceiling; appendix labels) need a decisions inbox, not a letter section.

## Open questions / unverified

- I did not read any draft in full, the remaining corpus notes, `positions.md`/`continuity.md`/`lexicon.md`/`structure-repertoire.md`/`voice-print.md` bodies, the SPD/COR dossiers beyond sizes, or the politics outline itself; sizes and structure come from `wc` and heads. Claims about their *content* are taken from the index/hub files that describe them.
- Whether `drafts/figures/*.png` are referenced from the SPD drafts: a grep for `figures/` in `drafts/v*.md` returned 0 hits; the manifest says they are the piece's figures. The reference form (if any) is unverified.
- The `orchestrate-build` README was read only to line 80; `scripts/drive-build.sh` was not read.
- Cost/latency numbers (Q-10) are the operator's; this note only extracts the count-shaped proxies.
- Whether editorial-review's current formulation *intends* to keep emitting `03/04` (the SKILL text says the letter folds them in) — practice says yes; needs an operator call.
- "Operator reachable" (respond-to-review gate) has no definition anywhere in the repo.

## Sources

All local, read 2026-08-27; no web sources were fetched for this note.

1. `~/agent-discourse/README.md` — pipeline, principles, roadmap, authoring rules.
2. `~/agent-discourse/conventions/project-memory.md` — layout, boundary/allowlist, source-note format, persist/recompute, versioning.
3. `~/agent-discourse/conventions/personas.md` — seed/profile, resolution, load table, composites, modes, staleness.
4–7. `~/agent-discourse/skills/{draft-from-outline,editorial-review,respond-to-review,bootstrap-persona}/SKILL.md` — phases, inputs, gates, subagents, files.
8–19. `~/agent-discourse/skills/*/references/*.md` (12 files) — protocols, templates, ledgers, rubric, prose standards, provenance rules, calibration, corpus note, voice print.
20–23. `~/agent-discourse/skills/*/README.md` (4 files) — rationale, harness requirements, limitations.
24–25. `~/agent-discourse/agent-scratch/notes/2026-08-20-*.md` — requirements ledger; self-review ledger.
26–28. `~/agent-discourse/agent-scratch/projects/*/manifest.md` (3) — round logs, provenance notes, operator-registered versions.
29–31. `~/agent-discourse/agent-scratch/personas/*/PERSONA.md` (3) — seeds, agent note, composite register map.
32–35. `~/agent-discourse/agent-scratch/personas/sjs-substack/profile/{index,calibration,provenance,corpus/index}.md` and `corpus/HOLDOUT-narcissistic-injury.md` (head).
36–45. `~/agent-discourse/agent-scratch/projects/the-politics-of-visibility/`: `correspondence/v1-drafting-note.md`, `correspondence/v1-response.md`, `correspondence/v1-review/{editors-letter,01-claim-ledger (head),05-second-read (head),03-argument-notes (head),04-craft-notes (head)}.md`, `agents/author/{voice-charter.md, ledgers/v1-response-ledger.md (head), drafting/v1/00-commissioning-brief.md, drafting/v1/06-fidelity-audit.md (head), research/index.md (head), research/sources/solove-nothing-to-hide-2007.md}`, `agents/editor/research/index.md` (head).
46. `~/agent-discourse/agent-scratch/projects/structure-of-political-difference/drafts/taxonomy_reference_sheet.md` (head).
47. `~/agent-discourse/.claude-plugin/{plugin,marketplace}.json`, `.gitignore`.
48. `~/agent-discourse/agent-scratch/tmp/{recompute_voiceprint,check_quotes}.py` (heads) — measurement method.
49. `~/agent-skills/skills/orchestrate-build/SKILL.md` (full) and `README.md` (lines 1–80).
50. `~/Rhēma/docs/1_founding-prompt.md`, `~/Rhēma/docs/2_research-and-design-ledger.md`, `~/Rhēma/docs/research/1_research-brief.md`.
