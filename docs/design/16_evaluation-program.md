# Rhema — the comparative evaluation program (round-2 workstream C)

- Scope: round-2 ledger §C rows C1–C5, Q-23 · Date: 2026-09-01 · Sources fetched this session: 7 (plus internal docs; research/12's sources were fetched 2026-08-27 and are cited as internal evidence, per the rigor rule)
- Output status: design note + a **ready-to-merge spec §18** (in §6.1 below) + §17/§3.5 amendments. No other file modified.
- Requirement IDs: `REQ-EVAL-1 … REQ-EVAL-20`, canonical statements in the §18 draft (§6.1); the body sections argue them.

## Executive summary

The spec's §13.5 evals are a *regression harness* — fixtures from three known projects, deterministic scorers, nightly floors. They can prove Rhema has not gotten worse; they cannot prove Rhema is better than "paste the draft into the best frontier model," which is the only comparison that determines whether this is a company (critique §12; crosswalk rows 12.1–12.3, all ABSENT). This note designs that comparison end-to-end.

**Corpus (C1):** commission ~30 unpublished, human-written serious-nonfiction drafts from working writers under written license; guarantee unseen-ness by post-cutoff creation, no-AI-authorship attestation, no prior transmission to any model, canaries, and a memorization probe; gold-annotate each draft with two independent professional editors plus an adjudicator into the Finding schema, with a *material* flag. Cost ≈ **$1,250/draft** (fee + two annotators + adjudication; EFA/Reedsy rates fetched), ≈ **$38k one-time** for n=30. Paired design on 30 drafts detects a ~8–10-point recall difference at 80% power.

**Arms and blinding (C2):** six arms — a *steelmanned* one-shot frontier baseline (externally tuned on a dev set, best current model from any provider, native search, refreshed every wave), an iterative generic workflow, Grammarly-class (craft metrics only), Rhema Standard, Rhema Full board, and a human-editor reference. All outputs normalized into the common Finding schema by blinded extraction; scoring is reference-based against gold, so position bias never touches the headline metric; the full analysis is pre-registered.

**Metrics (C3):** all twelve of critique §12, each with a named scorer; recall matching, FP validity, novelty, and post-revision preference are **human-adjudicated** — the fetched LLM-judge literature (position, verbosity, self-preference biases) disqualifies LLM judges from exactly those calls; LLM judges survive only on secondary metrics, cross-family, position-swapped, and calibrated against a human subset each wave. Voice preservation is measured with the product's own voice-print bands plus a claim-ledger meaning diff.

**Economics and cadence (C4):** a full wave ≈ **$3k compute + $8–14k human scoring**; corpus is capex, waves are opex. Lift criterion proposed: **major-or-blocking material-issue recall ≥ +15 points absolute over the steelmanned one-shot arm, at an invalid-finding rate no worse than baseline, sustained across two consecutive pre-registered waves**, with go/no-go consequences specified (marketing gate immediately; pricing and protocol-R&D stop-loss at the second miss). Q-23 recommendation: **$50k for the first two quarters (program build), then ~$10–15k/quarter steady state**; a flat $10k/quarter works but pushes the decidable criterion ~2 quarters past launch, during which no superiority claim may ship.

**Integration (C5):** §6.1 is a merge-ready spec §18; §6.2 amends the Phase-0/1 exit criteria; §6.4 gives the publish/keep-private split that turns the eval into defensibility asset 2 of critique §10 without leaking the corpus or the protocols.

---

## 1. Framing: what this program is, against what exists

Three things in the current spec are adjacent but not this:

1. **§13.5 evals** — self-referential regression fixtures. Necessary (they gate protocol/engine promotion) and reused here as infrastructure, but they compare Rhema-today to Rhema-yesterday, never Rhema to the alternative a buyer already has.
2. **§3.5 quality metrics** — in-product telemetry (accept+adapt share, second-read yield). These measure what users do with findings, not whether the findings are *true and complete* against ground truth. A confident, wrong dossier can score well on §3.5.
3. **§16.3 #13** — "a third more findings from the second read" is a README claim, deferred to in-product measurement. In-product measurement cannot answer it either: more findings is not more *correct* findings. Only a gold set can (REQ-EVAL-13).

The critique's bar (12.3): the business passes only with a **large, repeatable lift** over simply asking the best frontier model. That bar is fair, and it cuts both ways: an eval whose baseline is a lazy prompt is theater, and an eval we cannot afford to repeat proves nothing about "repeatable." Both constraints shape everything below.

Presumption note per round-2 ledger §0: nothing here cites the critique as evidence; external claims carry URLs fetched 2026-09-01; figures derived from the spec's provisional credit model are flagged as provisional (§16.3 #1).

---

## 2. C1 — The corpus

### 2.1 Sourcing options

| Option | Real editorial problems? | Unseen by models? | Licensing | Verdict |
|---|---|---|---|---|
| **(a) Operator's three projects** | yes, known intimately | not in training data, but *seen by us*: protocols were iterated against them (§13.5 fixtures) | already held | **Dev set only.** They are the development set by construction; using them in headline numbers is training-on-test at the product level. |
| **(b) Public pre/post-edit pairs** (arXiv v1→published, open peer-review histories, published essays with known drafts) | yes, with a free "what the editor did" signal | **no** — anything public before a model's cutoff is presumptively in training data; the arms could pattern-match the known fixes | mixed (some CC-BY) | Methodology development only: calibrate the annotation protocol and matcher training cheaply. Never scored. |
| **(c) Commissioned drafts** — pay working nonfiction writers for real, in-progress, unpublished drafts | yes — the flaws are organic, at natural salience | **yes, guaranteeable** (post-cutoff creation + attestation + embargo, §2.3) | written license, priced in | **Primary corpus.** |
| **(d) Partnerships** (MFA/writing programs, Substack writers, magazine slush with consent) | yes | yes if unpublished | consent chains are long; slush raises third-party-rights issues | 1.x supplement — a cheaper pipeline for corpus *rotation* once the program exists; too slow/fragile to build v1 on. |
| **(e) Synthetic-flaw injection** — take a clean base, inject known flaws (fabricated citation, dropped counterargument, buried thesis, unsupported causal leap) | **no** — injected flaws are cleaner, more salient, and stylistically marked; their distribution is ours, not the world's; detection difficulty is not representative | yes | trivial | Supplement only: per-category recall *floors* and scorer development. A model that finds 95% of injected flaws has passed a unit test, not an editorial exam. Synthetic numbers never appear in headline results (validity limits stated wherever used). |

**Recommendation:** (c) primary at n≈30, (a) as the frozen dev set, (e) as a scorer-development suite, (b) for annotator training, (d) as the rotation pipeline from year 2. Stratification of the 30: **12 Essay · 10 Academic · 6 Op-ed · 2 Memo** (mirrors the wedge-decision segments and the four shipped protocols; Memo small because its verification mode differs), lengths stratified 2k / 5k / 8k words (roughly 1:2:1), each draft at a real "review-ready" stage (near-final enough that a developmental read is meaningful — commission brief specifies stage).

### 2.2 Licensing and consent

Per-draft written agreement covering: (i) non-exclusive perpetual license for internal evaluation, including transmission to third-party model APIs under those providers' terms; (ii) the draft stays unpublished until we release it from embargo (minimum: through the wave that scores it; writers may publish after rotation-out); (iii) no excerpt appears in public materials without a separate opt-in; (iv) author warrants the draft is their own work, contains no third-party text they cannot license, and — critical, §2.3 — **was written without generative-AI drafting or revision** (research assistance excepted, disclosed); (v) optional paid add-on: the author returns for one hour post-wave to blind-rate revised versions ("still my piece", §4.2). One provider detail belongs in the license text: current frontier models are not all available under zero-data-retention (e.g., Claude Fable 5 requires ≥30-day API retention — pricing/model docs, accessed 2026-09-01), so the license must cover retention under provider API terms; before first transmission, verify each provider account's training/retention posture in writing (open item, §Open questions).

### 2.3 Contamination control — how "unseen" is guaranteed

The drafts must be unseen by every model under test, in the strong sense (not in pretraining, not memorized, not stylistically machine-authored):

1. **Post-cutoff creation.** Commission brief requires drafts begun after a stated date ≥ the newest arm model's published training cutoff; drafts predating it are ineligible unless verifiably never posted anywhere (author attestation + web/near-duplicate search on shingled excerpts).
2. **No-AI-authorship attestation + provenance.** The warranty in §2.2(iv), plus the author's version history where available. Rationale: a draft partially generated by a frontier model breaks the benchmark twice — the "known problems" become machine-flavored, and the self-preference literature shows judges and reviewers favor low-perplexity, familiar text (arXiv 2410.21819: LLM evaluators rate lower-perplexity outputs higher than humans do), so an arm could score on recognition rather than editing. AI-text detectors are unreliable; we use them only as a screening flag, never as proof — the attestation and provenance trail carry the weight.
3. **Embargo enclave.** Corpus lives in a private, access-logged store (the eval enclave, REQ-EVAL-3); drafts are never pasted into consumer AI products, never used in demos, marketing, model training, or fixtures; transmission to model APIs happens only inside benchmark runs, from accounts whose no-training terms were verified.
4. **Canary strings.** Each draft carries a unique canary token (invisible-in-context footer) so any future leak into a training corpus is detectable by probing.
5. **Memorization probe per wave.** Before scoring, each arm model is prompted with each draft's title + first ~100 words and asked to continue; high-overlap continuation flags the draft as contaminated for that model and excludes it from that arm's scoring (pre-registered exclusion rule).
6. **Rotation.** ≥ 20%/year of the corpus is retired and replaced (pipeline (d)); retired drafts may be released to authors. Rotation also underwrites the *repeatability* half of the lift criterion: wave-over-wave results on partially-fresh drafts are stronger evidence than reruns on a static set.

### 2.4 Gold-set annotation protocol

- **Annotators:** professional developmental/substantive editors (EFA-listed or equivalent), matched to genre (academic editors for the Academic stratum). Trained on the schema using corpus (b); certification = acceptable agreement on two training drafts.
- **Task:** an exhaustive editorial read producing findings in the product's own schema — `kind ∈ {claim, discourse, argument, structure, craft, voice, continuity}`, `severity ∈ {blocking, major, minor, note}`, anchor (quote + location), body — plus one flag the product doesn't have: **`material`** = "a competent editor would require this addressed before publication." Two editors annotate **independently** (the same independence discipline the product enforces on its second read).
- **Adjudication:** a third senior editor merges the two sets: aligns duplicates (anchor overlap + substance), resolves severity and materiality disagreements, and rules on issues raised by only one editor (kept-material / kept-minor / dropped). Output: the **gold set** — typically 15–30 material issues on a 5k serious-nonfiction draft (the spec's own volume estimate: 40–50 total findings on a 2–5k essay, §5.7).
- **Quality gates:** report inter-annotator agreement per draft (issue-level alignment rate; weighted kappa on severity for aligned issues). A draft below floor (proposed: alignment < 0.5 before adjudication) gets a fourth read or is dropped — an editorial ground truth two professionals can't roughly agree on is not ground truth (REQ-EVAL-4). Publishing the IAA numbers is part of the defensibility play (§6.4): every "AI beats humans" benchmark that hides its human-agreement floor is rightly distrusted.

### 2.5 Cost per draft (evidence)

Fetched rates, accessed 2026-09-01:

- **EFA 2026 rate chart** (the-efa.org/rates): developmental editing $60.00–82.50/hr at 4.0–7.0 pages/hr; line editing $50.00–70.00/hr; manuscript assessment $40.00–54.00/hr or 1.5–1.8¢/word (academic-humanities exemplar rows; ranges vary by genre).
- **Reedsy marketplace** (reedsy.com/blog/guide/editing/cost): developmental editing $0.026–0.053/word; editorial assessment $0.018–0.029/word.

Derivation for a 5k-word draft (≈20 standard pages): a developmental-depth read at 4–7 pages/hr is 3–5 hr → $180–410 at EFA hourly rates; our task adds structured-schema annotation overhead (+30–50%) → **$250–550 per editor**. Two editors + adjudication (1.5 hr senior, ≈$120) → **$620–1,220 per draft**; midpoint ≈ **$900** blended across the 2k/5k/8k mix. Commissioning fee: no fetchable market rate for licensing an unpublished draft exists; **$300–500/draft** is my estimate (anchored loosely to freelance kill-fee practice — flagged as inference). Author revision-rating add-on ≈ $50.

**Corpus one-time cost, n=30: ≈ $12k fees + $26k annotation ≈ $38k** (range $30–48k). This is capital expenditure — the annotated corpus is reused by every wave and is itself defensibility asset 2 (critique §10.2).

### 2.6 n and the power argument

Design: **paired** — every arm reviews every draft, so the primary comparison is the within-draft difference in material-issue recall between Rhema Full board and the steelmanned one-shot arm.

Primary endpoint: per-draft recall of gold **major-or-blocking material** issues; analysis = mean paired difference (Wilcoxon as the pre-registered nonparametric backstop; a finding-level mixed model with draft random effects as the pre-registered secondary, which typically adds sensitivity).

Power (two-sided α=.05, power .80): n = ((1.96+0.84)·σ_d/δ)², σ_d = SD of the per-draft paired recall difference. With ~20 gold issues/draft, binomial jitter alone puts σ_d near 0.14; heterogeneity pushes it toward 0.20. So:

| σ_d | n for δ=0.10 | MDE at n=30 |
|---|---|---|
| 0.15 | 18 | 0.077 |
| 0.20 | 32 | 0.103 |

**n=30 detects an 8–10-point recall difference under realistic variance** — comfortably below the +15-point lift criterion (§5.3), which is where a criterion should sit: the bar is well above the noise floor, so a pass is not a fluke and a fail is informative. Honest caveats, pre-registered: the **pilot wave (n=6 dev drafts) exists to estimate σ_d**; final n is fixed after the pilot with a floor of 24 (REQ-EVAL-5); subgroup (per-genre) results at n=6–12 per stratum are reported as descriptive, never as claims.

---

## 3. C2 — Arms and blinding

### 3.1 The six arms

| Arm | Definition |
|---|---|
| **A1 · Strong one-shot frontier** | The steelmanned baseline — see below. One request (plus the model's own tool loop), current best frontier model, native web search on, maximum effort/thinking settings. |
| **A2 · Iterative generic workflow** | What a motivated user could run in any chat product with a public recipe: multi-pass review (claims pass → structure pass → prose pass → self-critique → consolidated letter), ~5 turns, web search on, **no Rhema protocol content**. Recipe published with the methodology. |
| **A3 · Grammarly-class** | Where comparable only: scored on craft/note-level metrics and FP rate; excluded from material-issue recall headlines (it does not attempt developmental review — scoring it there would be a strawman in reverse). |
| **A4 · Rhema Standard** | The shipped product at Standard rigor, default tier, protocol matched to the draft's stratum. |
| **A5 · Rhema Full board** | Full board rigor (verification, discourse, independent second read, audit all on), Frontier tier. |
| **A6 · Human editor(s)** | Fresh professional editors (never the gold annotators), commissioned at a realistic engagement (a paid manuscript assessment, time-boxed to market norms, ≈4–6 hr) — the reference point for "what money currently buys," not a ceiling claim. |

**Steelmanning A1 (or the eval is theater).** The baseline is adversarially owned: (i) its prompt is developed on the *dev set* by someone incentivized to beat Rhema — a contracted prompt engineer (or a separate internal owner whose bonus metric is A1's score), iterating freely; (ii) A1 receives **the same inputs Rhema receives** — draft, genre, venue, stage, and the author's stated goals — never a bare "review this"; (iii) it runs on the best available frontier model *at wave time* from any provider, at maximum reasoning settings, with native search; the pre-registration names the two candidate models (currently a Claude Opus/Fable-class and a GPT-5.6-class model — pricing pages for both fetched 2026-09-01) and **the better-scoring one is the baseline** (best-of-two, stated in advance — we bind ourselves to the strongest defensible reading); (iv) the baseline prompt is **published in full** with the results (§6.4) so nobody can claim we sandbagged it; (v) it is re-steelmanned every wave — frontier releases trigger an off-cycle mini-wave (§5.4) because the bar the company must clear moves with the frontier. Rhema arms, symmetrically, are the shipped product at pinned `protocol@version` — no eval-only tuning (REQ-EVAL-6, REQ-EVAL-20).

### 3.2 Presentation normalization and blinding

The structural problem: Rhema outputs a typed dossier; A1 outputs prose; A6 outputs a memo. Comparing them raw confounds substance with format, and format is exactly what LLM judges are biased by.

- **Normalization pass:** every arm's output is converted into the common schema — a flat list of `{kind, severity, anchor-quote, body}` findings plus a plan/letter text — by extractors **blind to arm** (outputs stripped of branding, formatting, and self-reference before extraction; Rhema's dossier exports losslessly, others are extracted). Extraction rule: **verbatim substance only** — the extractor may segment and locate, never sharpen; a vague baseline comment stays vague. A fixed extraction model may pre-segment as a *suggestion*; a human verifies every unit (REQ-EVAL-7). Extraction fidelity is audited on a 10% sample by a second extractor.
- **Scoring is reference-based, not pairwise.** The headline metrics (recall, FP, severity calibration) compare each arm's normalized findings to the gold set independently. No judge ever sees two arms side-by-side for these — which removes position bias from the headline path entirely (position bias in pairwise LLM judging is systematic and judge/task-dependent: arXiv 2406.07791, 15 judges, ~150k instances).
- **Where pairwise is unavoidable** (post-revision preference, §4): human judges, both presentation orders judged (position-swap), arm identity stripped, order randomized per judge.
- **Matching protocol** (the recall measurement): a candidate finding *hits* a gold issue iff (anchor overlap or whole-piece match) **and** the finding's substance entails the gold issue's core problem. Two trained matchers, blind to arm, work from the normalized lists; disagreements adjudicated by the senior editor. An automatic matcher may propose alignments; humans confirm every hit (REQ-EVAL-8).

### 3.3 Order effects and repeatability

Within-wave: each arm runs once per draft at fixed settings; the two Rhema arms and A1 additionally run **twice** on a 10-draft subsample to estimate run-to-run variance (published as a stability band around every headline number — "repeatable" is measured, not asserted). Draft order is irrelevant (runs are independent); judge/matcher item order is randomized; matcher drift is checked with seeded repeat items.

### 3.4 Pre-registration

Before the first scored (non-pilot) wave, freeze and hash-commit: arms and exact configurations (model IDs, settings, prompts), corpus manifest, metric definitions, matching rules, exclusion rules (incl. the memorization probe), the statistical analysis, and the lift criterion. Deviations are logged and reported. The dev set is explicitly exempt and never contributes to headline numbers. Internal commitment is the floor; registering the analysis plan publicly (e.g., OSF) is the credibility upgrade recommended for the wave we intend to publish (REQ-EVAL-10).

---

## 4. C3 — Metrics: all twelve of critique §12, operationalized

| # | Metric | Operationalization | Scorer | Why this scorer |
|---|---|---|---|---|
| 1 | **Material-issue recall** (headline) | share of gold material issues hit (matching protocol §3.2); primary = major+blocking subset | **human matchers + adjudication** | the load-bearing number; LLM matching-only would let judge bias set the company's fate |
| 2 | **False-positive rate** | unmatched findings adjudicated by an editor panel into `valid-but-missed-by-gold` (→ novelty credit) vs `invalid` (wrong, pedantic-beyond-brief, or hallucinated); FP = invalid/total findings | **human panel**, blind to arm | leniency-prone LLM judges under-flag confident nonsense |
| 3 | **Specificity / anchoring** | share of findings whose anchor quote resolves in the draft (exact→normalized→fuzzy, the product's own anchor ladder §5.7); mean anchor precision | deterministic | free and exact |
| 4 | **Factual accuracy** | audit sample (~10 claim-findings/arm/draft): are the reviewer's own factual assertions and verdicts correct against sources? error rate | human fact-checker | ground truth requires reading sources |
| 5 | **Source quality** | fetched-source mix rated on a fixed rubric (primary/secondary/tertiary; live vs dead; independence from the draft's own citations) | deterministic classification + human spot-check | mostly mechanical |
| 6 | **Novelty of findings** | count of `valid-but-missed-by-gold` findings (from #2) confirmed by the panel as real and material — "the machine caught what two professionals missed" | human panel | the strongest publishable claim; must be unimpeachable |
| 7 | **Severity calibration** | weighted kappa between arm severity and adjudicated severity on matched findings; over-severity rate | deterministic on human-matched pairs | — |
| 8 | **Revision-plan usefulness** | anchored 1–5 rubric (actionability, ordering, proportionality), rated blind by editors on de-branded plans; LLM judge as secondary only | human primary; hardened LLM secondary | quality-of-advice judgments are where leniency/verbosity bias bites |
| 9 | **Post-revision improvement** | each arm revises per its own review (Rhema Revise; baselines prompted to revise per their letter); then (a) gold-issue resolution count — how many gold material issues the revision actually fixed, human-checked; (b) blind pairwise preference, revised vs original and revised vs baseline-revised, both orders | human | end-to-end loop value; pairwise = human only |
| 10 | **Voice / meaning preservation** | see §4.2 | deterministic + human spot-check | ties to product machinery |
| 11 | **Second-read marginal contribution** | within A5: gold hits unique to second-read-origin findings (`origin=second_read`, kept at reconciliation) — measures *correct* marginal yield, superseding the in-product proxy of §16.3 #13 | deterministic on human-matched data | — |
| 12 | **Cost & latency** | proxy-metered dollars (list cost) and wall-clock per arm per draft; every quality table carries the cost column; recall-per-dollar curve across arms/rigor | deterministic (§12.7 metering) | — |

### 4.1 Judge design, hardened against the documented biases

The literature fetched this session and in research/12: position bias is systematic across judges and tasks (arXiv 2406.07791); the CALM framework catalogues 12 bias families and finds significant residual bias even in strong judges (arXiv 2410.02736); self-preference bias tracks perplexity — judges favor text that reads like their own (arXiv 2410.21819); and our own crosswalk row 3.2 already concedes position/leniency/prompt-sensitivity. Consequences, as rules:

1. **Deterministic before LLM; human where it counts.** Same ordering philosophy as §13.5, extended: metrics 1, 2, 6, 8-primary, 9 are human-adjudicated, full stop (REQ-EVAL-8). LLM judges are confined to secondary/scale roles (#8 secondary, exploratory analyses, matcher *suggestions*).
2. **Cross-family judging.** Any LLM judge must be from a different model family than every generator arm it scores (self-preference/perplexity familiarity). Since arms span providers, this means at least two judge families with results reported per judge (REQ-EVAL-9).
3. **Position:** LLM judges never do pairwise on headline metrics; where used pairwise (secondary), both orders, disagreement = tie.
4. **Verbosity:** judges score per-finding units of controlled length, never whole documents; unit length is reported as a covariate.
5. **Leniency:** anchored rubrics with named failure exemplars at each scale point; no unanchored "rate 1–10."
6. **Calibration gate:** every wave, each LLM judge is scored against the human-adjudicated subset; weighted kappa < 0.6 disqualifies that judge's numbers from the wave report (REQ-EVAL-9). Judge prompts are frozen in the pre-registration.

### 4.2 Voice preservation, tied to the voice-print machinery

The product already measures voice deterministically (voice print: feature rates with per-piece ranges — em-dash/1k, sentence-length distribution, short-sentence share, signature-move rations, lexicon; §9, design/8 §voice-print). The benchmark reuses that service:

- **Band conformance:** measure the author's features on the *original* draft (the author's own writing defines the bands, supplemented by the author's corpus where licensed); measure each arm's *revised* draft; score = share of features remaining within the author's band, and drift direction. Cross-arm convergence (all arms' revisions drifting toward the same point) is reported as the homogenization signal research/12 warns about (voice drift persists in direction even under voice-preserving prompts — respond-to-review README evidence, research/12 §loop-to-convergence).
- **Meaning diff:** run the claim inventory on original and revised; every dropped, negated, or materially weakened Tier-1 claim must trace to a disposed finding; untraced meaning changes are counted as violations (this is the eval-side twin of the product's obligation lineage).
- **Human spot-check:** commissioned authors (paid add-on, §2.2) blind-rate revisions "still my piece" 1–5 across arms, order-randomized. Small n; reported as descriptive support, not a primary endpoint.

---

## 5. C4 — Economics, cadence, the lift criterion

### 5.1 Cost per full benchmark wave (honest estimate)

Compute, per 5k-word draft (list prices fetched 2026-09-01: Claude Opus 5 $5/$25 per MTok, Sonnet 5 $2/$10, Haiku 4.5 $1/$5, Fable 5 $10/$50, web search $10/1k; GPT-5.6-Sol $4/$20; batch 50% where usable). Rhema-arm costs use the spec's provisional credit model (§6.2; list cost = credits/1.4 ¢ per §14.1) and are **provisional until §16.3 #1's instrumented runs**:

| Item (per draft) | Est. list cost |
|---|---|
| A5 Rhema Full board Review (Frontier, 5k ≈ 2,520 cr) + Revise (≈ 2,070 cr) | ≈ $33 |
| A4 Rhema Standard (Balanced Review ≈ 1,300 cr + Revise ≈ 1,060 cr) | ≈ $17 |
| A1 one-shot, both candidate models, review + revise (≈60k in / 12k out + ~25 searches each) | ≈ $3 |
| A2 iterative generic (~5 turns + revise) | ≈ $5 |
| LLM secondary judges (cross-family, double-judged) | ≈ $3–4 |
| Memorization probes, extraction-model suggestions, misc | ≈ $2 |
| **Compute subtotal** | **≈ $63** |

× 30 drafts ≈ **$1.9k**, + stability reruns (3 arms × 10 drafts) ≈ $0.8k → **compute ≈ $2.5–3k per wave**. Compute is not the cost driver.

Human scoring, per wave: matching + FP/novelty adjudication (two matchers, 2.5–4 hr/draft total at $40–60/hr, + senior adjudication) ≈ $310–460/draft → **$9–14k at full n=30**; post-revision pairwise + plan ratings ≈ $1.5–2k; author spot-checks ≈ $1.5k optional. **Full wave ≈ $12–18k all-in; lean wave (full human adjudication on a stratified 15-draft subsample, deterministic + LLM-secondary on the rest) ≈ $6–9k; automated-only tracking wave ≈ $3k.**

One-time capex: corpus + gold ≈ **$38k** (§2.5); human-editor reference arm A6 ≈ **$7.5k** (30 × ~$250 assessments; a fixed reference — humans don't version-bump, so A6 is re-run only if the corpus rotates or the engagement definition changes); pilot wave on dev set ≈ $3k.

### 5.2 Q-23: what each budget level buys

| Budget | What it buys | What it cannot buy |
|---|---|---|
| **$2k/quarter** | Automated tracking only: quarterly automated-only wave on a 12-draft subsample + synthetic-flaw suite + dev fixtures; baseline-drift monitoring (is the frontier closing the gap?). | Any gold corpus (build would take ~5 years). The lift criterion is **undecidable**; no superiority claim can ever ship; critique 12.3 stands unanswered. This tier funds instrumentation, not an evaluation program. |
| **$10k/quarter** | Staged build: Q1 pilot gold corpus n=6 (≈$7k) + pilot wave; Q2–Q4 add ~8 drafts/quarter (≈$8k each) with lean waves between; full n≈30 and **wave 1 at ~Q4, wave 2 at ~Q5** → criterion decidable ~12–15 months from start. Steady state thereafter: quarterly lean waves + annual full wave + rotation. | A decided criterion **before** launch (assuming launch inside year 1). Launch-time marketing runs on pilot-corpus numbers labeled *preliminary*; no superiority claims until two full waves (REQ-EVAL-19). |
| **$50k/quarter** | Q1: full corpus (≈$38k) + A6 arm + pilot wave. Q2: **two full pre-registered waves** (≈$15k each) → **criterion decidable before/at launch**; published methodology + results ship with the launch. Steady state falls to ~$15–20k/quarter (one full wave + rotation of ~8 drafts/yr + model-release mini-waves); surplus funds third-party audit access and a second-generation corpus. | — (this is the fully-funded program) |

**Recommendation:** frame it as **capex + opex, not a flat quarterly**: approve ~**$100k across the first two quarters** (corpus, A6, two full waves — the $50k tier for exactly two quarters), then **$10–15k/quarter steady state**. If the operator insists on one flat number, **$10k/quarter** is the minimum at which the program is real — with the explicit consequence that the launch narrative must survive ~2 quarters without a superiority claim.

### 5.3 The lift criterion (numeric) and the go/no-go

Proposed, to be frozen in the pre-registration (REQ-EVAL-15):

> **LIFT.** On the primary endpoint — recall of gold **major-or-blocking material issues** — Rhema Full board exceeds the steelmanned one-shot arm (A1, best-of-two frontier models) by **≥ 15 percentage points absolute**, with an invalid-finding rate (metric 2) **no worse than A1's**, **sustained across two consecutive pre-registered waves** (which differ in model versions and/or ≥20% of corpus). Guard rails, both required: (a) blinded editors prefer the Rhema-revised manuscript over the A1-revised manuscript in **≥ 60%** of pairwise judgments (metric 9b); (b) voice band-conformance (metric 10) not worse than A1's revision.

Why 15: it sits ~1.5–2× above the n=30 minimum detectable effect (§2.6), so passing is statistically meaningful and failing is informative; and it is the smallest gap that supports the only marketing sentence worth having (at plausible baseline recall of 30–45%, +15 points is "finds a third to half again as many of the issues professional editors flagged as must-fix"). A 5-point lift — real but small — is precisely the "feature, not company" outcome the critique names, since horizontal platforms close small gaps by default.

**Consequences (REQ-EVAL-16), explicit and pre-committed:**

- **Immediately, always:** no user-facing or investor-facing superiority claim ships except from a wave meeting pre-registered criteria (extends REQ-GROWTH-5's "only measured claims"). This gate binds from day one, in every budget tier.
- **One miss** (wave meets neither LIFT nor comes within its confidence band): superiority marketing stays off; Full-board pricing premium is re-justified on measured second-read marginal contribution (metric 11) or reduced; protocol R&D pivots to eval-driven iteration against the specific recall gaps the wave exposed; re-test next wave.
- **Two consecutive misses on a healthy benchmark** (IAA floors met, baseline steelman audit passed): the editorial-quality thesis is treated as **falsified at current model capability**. Stop-loss: protocol R&D spend is frozen; the operator decides between (i) repositioning on the value the benchmark *did* validate (workflow, provenance, trust, voice — the assets that don't depend on lift), (ii) shelving Full board and competing at Standard economics, or (iii) wind-down of the quality-premium strategy. What the program forbids is the fourth option: continuing to sell rigor the measurement contradicts.
- **Symmetric honesty:** if A1 *beats* Rhema on any headline metric in any wave, that result is reported internally unspun, and the §17 roadmap re-opens.

### 5.4 Cadence and what gates what

| Moment | Wave | Gates |
|---|---|---|
| Phase-0 exit (spec §17) | **Pilot wave** on dev set (n=6): every scorer, the matching protocol, extraction, and both Rhema arms exercised end-to-end; σ_d estimated; final n fixed | Phase-0 exit criterion amendment (§6.2): the benchmark *machinery* must work before the IDE is built on top of the protocols it measures |
| Pre-launch (Phase-1 exit) | **Wave 1** on the gold corpus (full or preliminary, per budget tier) | launch marketing claims (REQ-EVAL-19); the pricing page's rigor narrative |
| Quarterly | full or lean wave per tier | continued claims; Full-board pricing justification; protocol-promotion context (a protocol version that regresses benchmark recall does not promote, extending §13.5's floor rule) |
| ≤30 days after a major frontier release | **mini-wave**: A1 re-steelmanned + Rhema arms on a 10-draft subsample | early warning that the bar moved; triggers an off-cycle full wave if the gap halves |

---

## 6. C5 — Integration

### 6.1 Ready-to-merge spec section — **§18 Evaluation program**

> ## 18. Evaluation program (comparative benchmark)
>
> §13.5's evals are regression instruments: they compare Rhema to Rhema. This section defines the **comparative benchmark**: the standing measurement of Rhema against the strongest alternatives a writer already has, on ground truth established by professional editors. Its outputs gate marketing claims, Full-board pricing, and protocol R&D continuation. It shares the §13.5 harness (fixtures format, deterministic scorers, pinned `protocol@version`, proxy metering) and adds a corpus, human adjudication, and a pre-registered analysis.
>
> ### 18.1 Corpus
>
> **REQ-EVAL-1.** The benchmark corpus is distinct from `evals/fixtures/`: ≥24 (target 30) unpublished, human-written serious-nonfiction drafts, stratified across the shipped protocols (Essay-weighted) and lengths 2k/5k/8k, each commissioned from a working writer under a written license covering evaluation use and transmission to model providers under their API terms. The three real projects are the frozen **dev set**; dev-set results never appear in headline numbers. Synthetic-flaw suites are scorer-development tools; their numbers are never published as benchmark results.
>
> **REQ-EVAL-2 (contamination).** Every corpus draft satisfies, with evidence recorded per draft: created after the newest arm model's training cutoff (or verifiably never published/indexed); author attestation of human authorship without generative-AI drafting; near-duplicate web search clean; unique canary embedded; per-wave memorization probe passed for each arm model (failure excludes the draft from that arm, by pre-registered rule).
>
> **REQ-EVAL-3 (enclave).** The corpus and gold annotations live in an access-logged private store; they are never used in training, fixtures, demos, or marketing; drafts reach model APIs only inside benchmark runs from accounts whose no-training/retention terms were verified in writing. ≥20% of the corpus rotates per year.
>
> **REQ-EVAL-4 (gold set).** Two independent professional editors annotate each draft in the Finding schema (§5.7 vocabulary) plus a `material` flag; a third senior editor adjudicates into the gold set. Inter-annotator agreement is computed per draft and reported with results; drafts below the pre-registered agreement floor are re-adjudicated or dropped.
>
> **REQ-EVAL-5 (power).** The primary analysis is paired per-draft. A pilot wave on the dev set estimates the variance of the paired recall difference; final n is fixed from that estimate at ≥80% power for a 10-point recall difference, floor n=24.
>
> ### 18.2 Arms
>
> **REQ-EVAL-6.** Six arms: (A1) **steelmanned one-shot frontier** — prompt adversarially tuned on the dev set by an owner incentivized to maximize its score, given the same inputs Rhema receives, run on the best current frontier model from any provider (best-of-the-two pre-registered candidates), native search, maximum reasoning settings, re-steelmanned every wave, and its prompt published with results; (A2) iterative generic workflow (published recipe, no protocol content); (A3) Grammarly-class, scored only on craft-level metrics and FP rate; (A4) Rhema Standard; (A5) Rhema Full board; (A6) human professional editors at a market-realistic paid engagement, distinct from the gold annotators. Rhema arms run the shipped product at pinned `protocol@version` with no eval-only tuning.
>
> **REQ-EVAL-7 (normalization).** All arm outputs are normalized into the common finding schema by extractors blind to arm, from de-branded outputs, under a verbatim-substance rule (segment and locate, never sharpen); extraction fidelity is audited on a sample.
>
> ### 18.3 Scoring
>
> **REQ-EVAL-8 (human adjudication where it counts).** Material-issue recall matching, false-positive validity, novelty confirmation, and post-revision pairwise preference are decided by trained humans blind to arm, with senior adjudication; automated matchers may only suggest.
>
> **REQ-EVAL-9 (judge hardening).** LLM judges are restricted to secondary metrics and suggestions; any LLM judge is from a different model family than every arm it scores; pairwise LLM judging (secondary only) is position-swapped with disagreement scored as a tie; rubrics are anchored with exemplars; scoring is per-finding-unit with length reported; each wave, every LLM judge is calibrated against the human-adjudicated subset and is disqualified below weighted kappa 0.6.
>
> **REQ-EVAL-10 (pre-registration).** Before each scored wave: arms and exact configurations, corpus manifest, metric definitions, matching and exclusion rules, the statistical analysis, and the lift criterion are frozen and hash-committed (public registration for waves intended for publication). Deviations are logged in the wave report. The dev set is exempt.
>
> **REQ-EVAL-11 (metrics).** The wave report computes: material-issue recall (primary: major+blocking); false-positive rate; anchoring/specificity (deterministic, the §5.7 anchor ladder); reviewer factual accuracy (audited sample); source quality; novelty (panel-confirmed valid-but-missed-by-gold); severity calibration (weighted kappa vs adjudicated severity); revision-plan usefulness (anchored human rubric); post-revision improvement (gold-issue resolution count + blinded pairwise preference); voice/meaning preservation (REQ-EVAL-12); second-read marginal contribution (REQ-EVAL-13); cost and latency (REQ-EVAL-14).
>
> **REQ-EVAL-12 (voice preservation).** Measured with the product's own measurement service: post-revision voice-feature band conformance against the author's measured ranges, drift direction, and cross-arm convergence (homogenization signal); a claim-inventory meaning diff in which every dropped/negated/weakened Tier-1 claim must trace to a disposed finding; optional blinded author ratings as descriptive support.
>
> **REQ-EVAL-13 (second read).** The second read's marginal contribution is measured as gold-set hits unique to `origin=second_read` findings kept at reconciliation. This supersedes §16.3 #13's in-product-only measurement; no upgrade copy quotes a second-read number from any other source.
>
> **REQ-EVAL-14 (economics).** Every quality table carries proxy-metered list cost and wall-clock per arm; the report includes recall-per-dollar across arms and rigor levels.
>
> ### 18.4 The lift criterion and consequences
>
> **REQ-EVAL-15 (LIFT).** The pre-registered pass criterion: Rhema Full board over A1 on major-or-blocking material-issue recall by ≥15 percentage points absolute, at an invalid-finding rate no worse than A1, sustained across two consecutive pre-registered waves differing in model versions and/or ≥20% of corpus; and blinded editors prefer the Rhema-revised manuscript over the A1-revised manuscript in ≥60% of pairwise judgments with voice band-conformance not worse than A1's.
>
> **REQ-EVAL-16 (go/no-go).** No superiority claim ships except from a wave meeting pre-registered criteria (extends REQ-GROWTH-5). One miss: superiority marketing off; Full-board premium re-justified on measured second-read contribution or re-priced; protocol R&D redirected at the exposed recall gaps. Two consecutive misses on a healthy benchmark (agreement floors met, baseline steelman audit passed): protocol R&D spend freezes and the operator disposes among reposition-on-validated-value, compete-at-Standard-economics, or wind-down of the quality-premium strategy; continuing to sell rigor the measurement contradicts is not an option. Adverse results are reported internally unspun.
>
> **REQ-EVAL-17 (cadence).** Pilot wave at Phase-0 exit (machinery, dev set); wave 1 before launch gates launch claims; quarterly waves thereafter (full or lean per budget); a major frontier release triggers a re-steelmanned mini-wave within 30 days, escalating to a full wave if the measured gap halves.
>
> ### 18.5 Publication and defensibility
>
> **REQ-EVAL-18.** Public per published wave: full methodology (corpus construction protocol, annotation schema and IAA, metric definitions, matching rules, judge-bias controls, pre-registration reference), the A1 baseline prompt and A2 recipe verbatim, aggregate results per arm with stability bands, and consented examples. Private, always: the corpus texts and gold annotations (contamination + license), per-draft results, Rhema protocol content (SS class, §8.4), and Rhema run prompts. Third-party auditors may verify under NDA with logged enclave access. Benchmark-derived marketing copy cites the wave id.
>
> **REQ-EVAL-19.** Extends REQ-GROWTH-5: any comparative or superiority statement on any surface (landing, pricing, Showcase, sales, investor materials) must cite a pre-registered wave that met criteria; preliminary-corpus results are always labeled preliminary and never ground a superiority claim.
>
> **REQ-EVAL-20 (infrastructure).** Benchmark runs execute on the §12 run architecture with §12.7 metering, pinned engine build and `protocol@version`, config-hash recorded per run; results are durable rows joinable to run ledger data. The benchmark harness lives beside `evals/` and reuses its scorer framework.

### 6.2 §17 amendments (exit criteria)

- **Phase 0 exit criterion, append:** "…and the **evaluation pilot wave** has run end-to-end on the dev set: all six arms executable, normalization and matching protocols exercised with trained matchers, all deterministic scorers green, σ_d estimated and benchmark n fixed (REQ-EVAL-5)."
- **Phase 1 exit criterion, append:** "…; **benchmark wave 1** on the gold corpus is complete and dispositioned by the operator; no superiority claim appears on any launch surface unless the wave met its pre-registered criteria (REQ-EVAL-19)."
- **Phase 1 ships-list, add:** "benchmark corpus commissioning + gold annotation (tier-dependent n per Q-23)."
- **§17 engineering table, add row:** "Evaluation program: corpus pipeline, enclave, extraction/matching tooling, wave runner + report | 2–3 PM | mostly reuse of evals harness; matching UI is the new build."

### 6.3 §3.5 amendment

Add to the Quality row: "**benchmark lift vs strong one-shot (REQ-EVAL-15): measured quarterly**" — and a footnote that this is the one metric in the table produced outside product telemetry.

### 6.4 The publishable-eval defensibility play

Critique §10 asset 2 is the *corpus + blind comparisons*; crosswalk 10.8 flags our closed-protocol posture as diverging from "open methodology." The resolution: **open the evaluation's methodology, keep the product's methodology closed.** Publish (per REQ-EVAL-18): the annotation protocol with real IAA numbers, the steelmanned baseline prompt verbatim, the bias-control design with citations, aggregates with stability bands — the things that make the result *auditable*. Withhold: corpus, gold, per-draft rows, protocol internals. Publishing the baseline prompt is the move competitors won't copy (their evals rarely survive it) and it immunizes the result against the only fatal rebuttal ("weak baseline"). Publishing IAA does the same for "editors don't even agree." If LIFT fails, nothing is published and the discipline of REQ-EVAL-19 is itself the (quieter) trust story. Sequencing: publish only after two waves sustain the criterion — a single-wave publication invites a replication we haven't done ourselves.

---

## Rhema implications (numbered)

1. The benchmark, not the nightly evals, is the answer to crosswalk gap 1; §18 (as drafted in §6.1) plus the §17/§3.5 amendments close rows 12.1–12.3 and 16.2's "evaluation/calibration ◐". (C5, F1)
2. Corpus is capex (~$38k at n=30), waves are opex ($3k automated / $6–9k lean / $12–18k full). Q-23 should be answered as capex+opex, not a flat tier; recommendation in §5.2. (C4, Q-23)
3. The dev set / gold set split makes the three real projects *more* useful, not obsolete — but permanently bars them from headline numbers. (C1)
4. The steelmanned, published, best-of-two baseline is the program's credibility keystone; budget an external prompt-engineer contract (~$2–5k/wave) as a line item. (C2)
5. Human adjudication dominates cost because the LLM-judge literature says it must: the four metrics that decide the company's fate cannot be LLM-scored. Any future cost-down must subsample, never substitute. (C3)
6. REQ-EVAL-13 supersedes §16.3 #13; REQ-EVAL-19 extends REQ-GROWTH-5; the v0.3 synthesis should mark both. (F1)
7. The go/no-go structure gives operator decision Q-22 (MVP philosophy) a harder edge: under the $10k tier, a full-IDE launch happens *before* the criterion is decidable — one more argument the E-workstream should weigh. (E2 linkage)

## Ledger updates

| Row | Proposed status | Evidence |
|---|---|---|
| C1 | done | this note §2: sourcing table, licensing, contamination guarantee, annotation protocol, $/draft from fetched EFA+Reedsy rates, n=30 with power argument |
| C2 | done | §3: six arms incl. steelman procedure, normalization/blinding, order effects, pre-registration |
| C3 | done | §4: all 12 metrics operationalized with scorers; judge hardening from fetched bias literature (2406.07791, 2410.02736, 2410.21819); voice-print-tied preservation metric |
| C4 | done | §5: wave cost table, three Q-23 tiers, LIFT criterion + go/no-go |
| C5 | done | §6: merge-ready §18 (REQ-EVAL-1..20), §17/§3.5 amendments, publication policy |
| Q-23 | operator decision pending | recommendation: ~$100k first two quarters (capex) then $10–15k/q; flat-$10k acceptable with the no-claims-at-launch consequence |
| New row proposal C6 | open | verify each provider account's API training/retention terms in writing before first corpus transmission (see Open questions) |
| New row proposal C7 | open | operator confirmation of LIFT's numbers (15 pts / 60% / two waves) before pre-registration freezes them |

## Open questions / unverified

1. **Provider data-handling terms not fetched this session.** The claim that API data is not used for training by default was *not* verified for either provider; REQ-EVAL-3 requires written verification before any draft is transmitted. Claude Fable 5's ≥30-day retention requirement *was* verified (pricing/model docs) and is reflected in the license language.
2. **Commissioning fee ($300–500/draft) is inference** — no market rate for licensing unpublished drafts exists to fetch; validate with the first five commissions.
3. **σ_d and gold-set density (15–30 material issues/draft) are estimates** until the pilot wave; the power argument is explicitly pilot-adaptive (REQ-EVAL-5).
4. **Rhema arm costs are provisional** (spec §16.3 #1); the wave cost table re-computes after instrumented runs.
5. **Matcher labor rate/hours** ($40–60/hr, 2.5–4 hr/draft) is estimated from the task's shape, not a fetched rate; the pilot measures it.
6. **Baseline model landscape moves.** The named candidates (Claude Opus/Fable-class, GPT-5.6-class) are current as of 2026-09-01; the pre-registration names them per wave.
7. Whether to publicly register wave 1 (OSF) or only hash-commit internally is left to the operator with the publication decision (§6.4).

## Sources (accessed 2026-09-01)

1. https://www.the-efa.org/rates/ · EFA 2026 editorial rate chart · developmental $60–82.50/hr at 4–7 pages/hr; assessment $40–54/hr, 1.5–1.8¢/word · annotation and A6 costing.
2. https://reedsy.com/blog/guide/editing/cost/ · Reedsy editing cost guide · developmental $0.026–0.053/word; assessment $0.018–0.029/word · cost triangulation.
3. https://arxiv.org/abs/2406.07791 · "Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge" · position bias systematic across 15 judges/150k instances · judge-hardening rules 1, 3.
4. https://arxiv.org/abs/2410.02736 · "Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge" (CALM) · 12 bias families; residual bias in strong judges · REQ-EVAL-9 design.
5. https://arxiv.org/abs/2410.21819 · "Self-Preference Bias in LLM-as-a-Judge" · self-preference tracks perplexity/familiarity · cross-family rule; §2.3 no-AI-authorship rationale.
6. https://platform.claude.com/docs/en/about-claude/pricing · Anthropic pricing · Opus 5 $5/$25, Sonnet 5 $2/$10, Haiku 4.5 $1/$5, Fable 5 $10/$50 per MTok; web search $10/1k; batch 50%; Fable 5 retention note via model docs · wave cost table.
7. https://developers.openai.com/api/docs/pricing · OpenAI pricing · GPT-5.6-Sol $4/$20 per MTok; web search $10/1k calls · A1 second-candidate costing.

Internal (previously fetched, cited as internal evidence per rigor rules): docs/research/12_skills-genres-personas.md (S11–S14, S28: self-refine/self-correction limits, debate-judging, ICLR RCT; homogenization/voice-drift; reader-test verdict), docs/3_rhema-design-spec.md (§3.5, §5.7, §6.2, §6.7, §8.4, §9, §13.5, §14.1, §16.3, §17), docs/4_external-chatgpt-product-business-critique.md (§10, §12–13), docs/design/14_external-critique-crosswalk.md (rows 3.2, 10.2, 10.8, 12.1–12.3, 13.1–13.4, gap table), docs/design/8_personas-and-ingestion-ux.md (voice-print machinery).
