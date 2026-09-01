# Rhema — round-2 research & design ledger (v1 — complete, 2026-09-01)

Second-round work plan, triggered by the independent external critique
([4_external-chatgpt-product-business-critique.md](4_external-chatgpt-product-business-critique.md))
and its point-by-point crosswalk against the spec (`docs/design/14_external-critique-crosswalk.md`:
81 rows — 48 ALIGNED · 19 PARTIAL · 6 DIVERGES · 4 ABSENT · 4 CRITIQUE-WEAKER). Output of this
round: **spec v0.3** — targeted amendments to `rhema-design-spec.md`, plus a new Appendix F
dispositioning every critique claim (accept / adapt / rebut / defer, with rationale — the same
discipline the product applies to reviews).

Conventions as in round 1 ([2_research-and-design-ledger.md](2_research-and-design-ledger.md)):
status `open → in-progress → done | blocked-on-operator | dropped(reason)`; every `done` row
carries evidence; nothing cited that was not fetched. Q-1…Q-20 remain binding; new operator
decisions register as Q-21+.

## 0. Framing: what round 2 is and is not

- **Not a redo.** The crosswalk shows the critique independently re-derives most of the spec at
  lower resolution; §§4–13 of the spec (IA, IDE surfaces, visibility, data model, execution,
  platform) stand. Round 2 is five targeted workstreams and a v0.3 synthesis.
- **The critique's evidence is unverified.** 11 of its citations are flagged shaky (A-stream).
  No spec change may cite the critique itself as evidence — only sources we fetch.
- **Presumption rules:** operator decisions (Q-*) > spec v0.2 with its recorded evidence >
  critique claims, each defeasible by verified evidence and strong argument.

## A. Verify the critique's evidence base

| ID | Item | Status | Evidence |
|---|---|---|---|
| A1 | Fetch and verdict every citation in doc 4 (≈30 URLs), esp. the 11 flagged shaky in crosswalk part 3: the NeurIPS "debate or vote" study (`mlanthology.org` is not a known venue mirror), "Deep Research Max", the uncited 2026 AI-manuscript-review survey behind the anti-academia argument, the $30–80 price floor (no source), Substack AI-detection support article, homogenization papers | done | docs/research/13_critique-evidence-verification.md |
| A2 | Independently verify the competitive claims that move strategy: Grammarly/Superhuman agents (Reader Reactions, Citation Finder, Docs, Go), ChatGPT Projects/Work document flows, Gemini Notebook/Deep Research, Type.ai 150k-word docs — current state, fetched today, deltas vs our round-1 notes 3/4/5 (which predate or partially cover these) | done | docs/research/13_critique-evidence-verification.md |
| A3 | Substack AI-scanning / authorship-culture claim (§5): verify the feature, its reader-facing behavior, and any platform-policy movement since; assess the real reputational-risk mechanism for our Essay segment | done | docs/research/13_critique-evidence-verification.md |
| A4 | Multi-agent-debate / LLM-judge literature check: does the verified literature support the critique's "the moat cannot be many agents" and our spec's independent-second-read design equally? Reconcile with research/12's reader-test finding | done | docs/research/13_critique-evidence-verification.md |

## B. Object model, round 2

| ID | Item | Status | Evidence |
|---|---|---|---|
| B1 | **Revision obligations** as a first-class durable object (critique §7; crosswalk gap 4-adjacent): design the type (finding lineage → obligation → discharged-by move/round), its relation to the existing response ledger and §6.8 stall-detection lineage, UI surfacing (open obligations chip per version; "obligations discharged" in what-changed view), migration cost into §11. Recommendation drafted in round-1 assessment: **adopt for v0.3** | done | docs/design/15_object-model-round2.md |
| B2 | **Longitudinal author model** (crosswalk gap 3): design what learns from accepted/rejected/rebutted findings across projects — disposition-derived standing guidance ("this author rebuts hedging findings"), feeding the Drafter's guidance and the Editor's calibration *without* corrupting independence (the Editor must not learn to pull punches); privacy/retention; where it lives (Voice? account-level preference profile?); staged: capture now (already in DDL), learn later? | done | docs/design/15_object-model-round2.md |
| B3 | **Argument graph** (crosswalk gap 4): research argument-mining reliability (can models populate premise/inference/objection graphs at useful precision on real essays?); decide MVP/1.x/2 posture; design the spike (what artifact, what UI, what falsifies it); relation to existing claim ledger + discourse report. Default stance from round-1 assessment: v2 research spike, not an MVP object — confirm or refute with evidence | done | docs/design/15_object-model-round2.md |
| B4 | Evidence-relation audit: crosswalk says spec's claim-ledger treatment already exceeds the critique's support/contradict/contextualize/unverifiable in places — verify, and normalize the vocabulary in §11 if adopting any change | done | docs/design/15_object-model-round2.md |

## C. The evaluation program (crosswalk gap 1 — largest absence)

| ID | Item | Status | Evidence |
|---|---|---|---|
| C1 | Design the comparative benchmark: corpus of serious nonfiction drafts with known editorial problems (sourcing strategy, licensing, contamination control, professional-editor annotation cost), n and power | done | docs/design/16_evaluation-program.md |
| C2 | Blind arms: strong one-shot frontier prompt · iterative generic workflow · Grammarly-class where comparable · Rhema at Standard and Full board · human editor(s); protocol for blinding and order effects | done | docs/design/16_evaluation-program.md |
| C3 | Metrics per critique §12 (material-issue recall, FP rate, anchoring, factual accuracy, severity calibration, revision-plan usefulness, post-revision improvement, voice preservation, second-read marginal contribution, cost/latency) — operationalize each; judge methodology hardened against the LLM-judge biases our own research documented (A4) | done | docs/design/16_evaluation-program.md |
| C4 | Program economics and cadence: cost per full benchmark run, when it gates what (pre-launch go/no-go? quarterly?), the **lift criterion** ("large and repeatable" made numeric) and what happens if unmet | done | docs/design/16_evaluation-program.md |
| C5 | Integration: new spec section (§13.5 extension or new §18 "Evaluation program"), Phase-0/1 exit criteria amendments, marketing use of results (publishable eval = defensibility asset 2 in critique §10) | done | docs/design/16_evaluation-program.md |

## D. Wedge, positioning, and authorship legibility

| ID | Item | Status | Evidence |
|---|---|---|---|
| D1 | **Wedge decision input** (crosswalk DIVERGES; critique §4 + our own research/12 both lean Essay-led): draft the two GTM narratives (Essay-led vs Academic-led; both protocols ship regardless), landing/pricing-page and Showcase-content implications, and a recommendation | done | docs/design/17_wedge-positioning-authorship.md (rec: Essay-led GTM; Q-21 final call at v0.3 review); Q-21 pending: producing recommendation memo |
| D2 | **Authorship legibility to MVP?** (crosswalk gap 5): re-cost span-level provenance marks + AI-use statement + Authorship overlay at MVP vs 1.x, in light of A3; the R14/F46 deferral was engineering-driven — quantify the minimal MVP slice (e.g., statement + run-level provenance without span marks) | done | docs/design/17_wedge-positioning-authorship.md |
| D3 | Positioning language pass: "editorial board" (ours) vs "agentic development environment for arguments" (critique §16) — test both against the D1 wedge; decide whether Draft-from-outline is demoted from co-headline to supporting act in narrative (not in product) | done | docs/design/17_wedge-positioning-authorship.md |
| D4 | Competitive-moat statement for the spec (§1.4 extension): the eight defensibility assets of critique §10 mapped to what we actually build (methodology, eval corpus, longitudinal model, graph, calibration, switching costs), each with its spec section or an honest "not yet" | done | docs/design/17_wedge-positioning-authorship.md |

## E. MVP philosophy (crosswalk divergence 2 — the strategic one)

| ID | Item | Status | Evidence |
|---|---|---|---|
| E1 | Reconcile "prove the review-revision loop before the full IDE" with the 52–67-PM plan: design a **validation-first phasing option** — e.g., after Phase 0 (18–23 PM, unavoidable), a minimal "Review beta" (import → run sheet → dossier → triage → revise → diff → re-review; no Voices, no Assistant, no mobile, minimal editor) instrumented per critique §13; estimate its PM and what it defers | done | docs/design/18_mvp-philosophy-review-beta.md |
| E2 | Decision memo: full-IDE Phase 1 vs Review-beta-then-IDE, with the critique's instrumentation list mapped onto our §3.5 events (crosswalk says north-star metrics already align: repeat rounds ≈ our round-2 rate); risks of each (beta burns the launch moment vs building 50 PM on unvalidated demand) | done | docs/design/18_mvp-philosophy-review-beta.md (recommendation: validation-first; Q-22 = operator's final call at v0.3 review); Q-22 pending: producing decision memo |

## F. Synthesis: spec v0.3

| ID | Item | Status | Evidence |
|---|---|---|---|
| F1 | Amend the spec per A–E outcomes (expected: §§1–3, 15, 17 revised; §11 + obligations; new evaluation section; Appendix F "External-critique dispositions" with all 81 crosswalk rows dispositioned) | done | spec v0.3 (91,424 words; +74 REQs; new §18, Appendix F) |
| F2 | Delta review: fresh-context pass over the v0.2→v0.3 diff only (consistency, no regressions against Q-decisions or the 133 round-1 dispositions) | done | docs/design/19_review-v03-delta.md (0 blocker/6 major/8 minor) → all 14 fixed |
| F3 | Update both ledgers; final state note in memory | done | ledgers + memory updated this turn |

## Q. New operator decisions needed (Q-21+)

| ID | Question | Blocks |
|---|---|---|
| Q-21 | **Wedge:** Essay-led GTM (critique + research/12 convergence) with Academic shipping but not headlining — or keep the founding prompt's academic-first framing? | D1, D3, F1 |
| Q-22 | **MVP philosophy:** full-IDE Phase 1 as specced, or a validation-first Review beta between Phase 0 and the full IDE? (E1 will size it; this asks your prior.) | E2, F1 |
| Q-23 | **Benchmark budget appetite:** the eval program needs professional-editor annotations and repeated frontier-model runs — rough tolerance per quarter ($2k? $10k? $50k?) shapes C1–C4 | C4 |
| Q-24 | **Authorship legibility:** if D2 shows a cheap MVP slice (AI-use statement + run-level provenance, no span marks), do you want it in MVP? | D2, F1 |
| Q-25 | **Argument graph appetite:** are you drawn to it as the product's long-term soul (worth a funded spike soon) or content to let B3's evidence decide its timing? | B3 |
| Q-26 | **Longitudinal author model:** comfortable with cross-project learning from dispositions by default (with opt-out), or opt-in only? Interacts with Q-12's minimal-privacy posture | B2 |

## Change log
- 2026-09-01 — v0 created from the external critique, the crosswalk (design/14), and the round-1 assessment discussion. Awaiting operator answers Q-21…Q-26 and go-signal to launch workstreams A–E.
- 2026-09-01 (go-signal) — Operator approved the round-2 plan without pre-answering Q-21…Q-26; workstreams A–E launched in parallel. D1 and E2 produce recommendation/decision memos; final calls land at v0.3 review. Outputs: research/13 (A), design/15 (B), design/16 (C), design/17 (D), design/18 (E).
- 2026-09-01 — E-stream done (design/18, REQ-BETA-1…22): Review beta ≈28–37 PM (Phase 0 ≈16.5–21; product layer 10–15; double-work tax 3–5); Essay-only, Review+Revise+Fact-check, optional inline Quick Voice, no chat, manual invites + Stripe Payment Links, 20–25 design partners in three cohorts. Recommendation: validation-first as a loop-first *sequenced Phase 1* (subset of same epics, not a fork); gate order Phase 0 → C benchmark (UI-free, measures lift) → beta (measures demand) → full IDE → public launch; benchmark and beta are complements. Decision rule: full-IDE-direct only if benchmark passed AND ≥15 target writers committed with money — both currently fail → beta.
- 2026-09-01 — D-stream done (design/17, REQ-POS-1…13): D1 recommends Essay-led GTM (Academic ships complete, never headlines; both narratives written in full; asymmetric downside favors Essay; revisit at 90-day telemetry re-base). D2: R14 over-bundled — MVP authorship slice = AI-use statement + block-level provenance appendix + block-level Authorship overlay + write-only span capture with degrade-on-human-edit, ≈1.25–2 PM; span rendering/rebasing stays 1.x. D3: headline stays "An editorial board for everything you write."; critique's "development environment for arguments" becomes §1.1's category thesis; Draft demoted in narrative only. D4: ready-to-merge §1.6 moat statement mapping the eight defensibility assets. Substack-culture claim argued conditionally pending research/13.
- 2026-09-01 — C-stream done (design/16, REQ-EVAL-1…20; merge-ready spec §18 + §17/§3.5 amendments): lift criterion = Full board ≥ +15 points absolute recall of gold major/blocking issues over a steelmanned best-of-two frontier one-shot, at equal-or-better invalid-finding rate, across two pre-registered waves; guard rails ≥60% blinded pairwise preference for the revised manuscript + voice band-conformance not worse; claims gate immediately, pricing/protocol stop-loss at second consecutive miss. Costs: ~$38k one-time corpus (n=30, ~$900/draft annotation) + $7.5k human-editor arm; $12–18k per full wave. Q-23 rec: ~$100k across first two quarters (criterion decidable at launch), then $10–15k/q. Publish play: open methodology + published steelman baseline prompt; corpus/gold/protocols private. Caveat: provider training/retention terms need written verification before transmitting corpus drafts.
- 2026-09-01 — B-stream done (design/15, REQ-OBJ-1…19): B1 adopt RevisionObligation for v0.3 MVP — the one deliberately mutable object over the immutable record; blocking/major findings spawn at delivery (minors on accept/adapt, notes never); closed only by verified move / rationale-enforced rebut-defer / mooting; reopened on regression; makes REQ-WF-7 carried/closed/new and §6.8 stall detection computed facts incl. hand-run rounds; folds in BacklogItem; +1.5–2.5 PM. B2: workspace-level preference profile (not Voice); Drafter/Assistant consume, Editor never — three-layer firewall (mount exclusion, closed derivation schema, human-approved standing-guidance release valve); capture in DDL now, learning 1.x/2.0. B3: no argument object in MVP/1.x; v2 falsifiable spike gated on the eval corpus (relation F1≈61 in-genre, κ=0.56 on editorials, no writer-benefit study). B4: verdict vocabulary frozen (spec exceeds critique — verified); adopt claim_sources[] stance edges + claim.kind; reject confidence scores. Proposed answers: Q-25 evidence-led timing; Q-26 default-on account-local with opt-out, cross-account opt-in only.
- 2026-09-01 — A-stream done (research/13): 26 URLs → 21 VERIFIED · 4 PARTIALLY · 1 UNREACHABLE · 0 MISREPRESENTED · 0 DEAD-OR-FAKE. Crosswalk part-3 suspicions largely overturned: "Debate or Vote" is a real NeurIPS 2025 Spotlight; "Deep Research Max" real; homogenization/radiology/MDPI papers real; Substack reader-facing Pangram scan real (Jul 21 2026; email-excluded, reader-private results, per-post opt-out); Type.ai 150k verified; all Grammarly/OpenAI/Google claims verified — Grammarly already ships Authorship tracking (strengthens Q-24 MVP slice). Collapsed: $30–80/mo floor (no source; market clusters $16–36 → our $20 tier stands) and the uncited "2026 survey". PARTIALLY: Citation Finder = supporting sources only; Superhuman Docs = Coda rebrand. A4: literature undermines agent councils and supports our independent-second-read design; judge requirements C-a…C-g handed to §18. New row A5: correct crosswalk part 3 inside Appendix F (do not edit design/14 in place). **F1 launched.**
- 2026-09-01 — **Round 2 complete.** F1: spec v0.3 synthesized (90,246 → 91,424 words after fixes; +74 REQs: OBJ 19, EVAL 20, POS 13, BETA 22; new §18 Evaluation program; §17 re-phased Phase 0 → benchmark → Review beta → full IDE; Appendix F: all 81 critique rows dispositioned, 11 crosswalk-part-3 corrections). F2 delta review: 0 blocker / 6 major / 8 minor — all 14 fixed (kind count 62 → 63 with `preference_profile` contract rows; PM reconciled: direct ≈57–74, beta path ≈60–79 with the 3–5 PM tax explicit; §5.4 authorship phasing corrected). Awaiting operator ratification of Q-21…Q-26 (§16.3 #25–30): Q-21 Essay-led GTM · Q-22 validation-first sequenced Phase 1 (decision rule: full-IDE-direct only if benchmark passed AND ≥15 committed paying writers) · Q-23 ~$100k eval capex over two quarters then $10–15k/q · Q-24 authorship slice in MVP (~1.25–2 PM) · Q-25 argument graph = evidence-led v2 spike · Q-26 default-on account-local preference learning with opt-out, cross-account opt-in only.
- 2026-09-01 (ratification) — Operator ratified Q-21…Q-26 as recommended. Spec updated to **v1.0 — canonical**: §16.3 #25–30 and Appendix B.2 R19–R26 are now decisions; LIFT numbers (15 pts / 60% / two waves) confirmed for pre-registration. Spec renamed `docs/3_rhema-design-spec.md` → **`docs/rhema-design-spec.md`** (unnumbered canonical doc, per operator); all tracked references updated. Hand-off contract written: `docs/6_ticket-decomposition-prompt.md` — paste into a fresh session to run `decompose-spec` producing `docs/tickets/` (Eleutheria pattern: 00_MANIFEST + PXX.Y implement-spec contracts, stacked PR chain, gitignored). Design work is complete; next session begins the build.
- 2026-09-01 (build start, revision to Q-13) — **`docs/` is now committed and tracked**, superseding the
  earlier "intermediates gitignored / tickets gitignored" stance (Q-13; hand-off note above). The spec,
  design, research, and tickets are the project's source of truth and are versioned in git (private repo
  `SteveVitali/Rhema`). They remain *derived* (regenerable from the spec) but are no longer local-only.
  Only per-run machine scratch (`.agents/`) stays gitignored. Consequence: the deferred-obligations
  ledger lives at `docs/tickets/DEFERRALS.md` (a hand-maintained, non-generated companion), enforced via
  root `AGENTS.md`.
