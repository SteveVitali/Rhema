# Agent Discourse: Canonical Product & Business Viability Critique

**Date:** August 27, 2026  
**Subject:** SteveVitali/agent-discourse and the viability of a SaaS product for serious written discourse

## Executive conclusion

Agent Discourse is worth productizing, but not as a generic “AI writing app” and not primarily as a better text generator. The attractive product is an **AI-native environment for serious written reasoning**: a workspace in which research, claims, sources, objections, editorial findings, revisions, author history, and independent review rounds are first-class objects.

The strongest analogy to Cursor/Devin is not “Cursor, but for prose.” It is **“an agentic development environment for arguments and manuscripts.”** Cursor works because software has persistent artifacts, interpretable state, diffs, tests, diagnostics, tool use, execution loops, and review. Agent Discourse becomes compelling when written discourse is given analogous machinery: claim ledgers, source provenance, argument graphs, editorial diagnostics, revision obligations, manuscript diffs, author memory, independent reviewers, and verification.

The market opportunity is real but narrow enough that positioning matters. Generic AI writing is heavily commoditized by ChatGPT, Claude, Gemini, Superhuman/Grammarly, Type, Lex, and similar tools. Deep research is becoming a horizontal frontier-model capability. Academic peer review and literature research are also increasingly crowded. The comparatively open wedge is **high-stakes long-form nonfiction and analytical writing where the user cares whether the argument survives scrutiny, not merely whether the prose is fluent.**

The central commercial risk is that frontier models will rapidly absorb any feature describable as a prompt (“critique this,” “fact-check this,” “simulate readers,” “rewrite in my voice”). The defensible product therefore must accumulate value in workflow, structured state, evaluations, author/project memory, evidence graphs, calibration, provenance, and longitudinal interaction data.

The crucial product test is not whether users say the review is impressive. It is whether serious writers repeatedly put important work through multiple review/revision rounds, accept material changes because of the system, and prefer its structured workflow over simply uploading the same draft to ChatGPT or Claude.

---

## 1. What Agent Discourse actually contains

The repository already encodes a more substantial theory of machine-assisted writing than most commercial “AI writer” products.

The flagship `editorial-review` skill explicitly separates:

- intake and steelmanning;
- fact checking with a claim ledger;
- discourse mapping and originality audit;
- strongest counterargument;
- reception forecasting;
- independent fresh-context second read;
- argument critique;
- craft critique;
- editor’s letter, rubric, and ordered revision roadmap.

The repo’s design philosophy is especially important. It treats known LLM-review failure modes as architectural constraints rather than prompt warnings: sycophancy is countered with venue calibration; generic feedback with passage anchoring; hallucinated sourcing with “fetched-and-read only” citation obligations; single-pass coverage ceilings with an uncontaminated second read; and over-prosecution with explicit “report against interest” behavior.

`respond-to-review` is similarly important because it does not treat review comments as commands. Findings are triaged into dispositions such as accept, adapt, rebut, defer, or escalate; revisions are performed as global moves rather than local patches; and a fresh-context audit checks whether the change actually discharged the criticism.

The persona machinery is also stronger than ordinary “brand voice.” The repository distinguishes a register from a person and attempts to capture both stylistic regularities and substantive continuity across a body of work: recurring positions, prior claims, structural habits, lexicon, examples, and held-out calibration.

These are product primitives, not merely prompt tricks.

Sources:
- https://github.com/SteveVitali/agent-discourse
- https://github.com/SteveVitali/agent-discourse/blob/main/skills/editorial-review/README.md
- https://github.com/SteveVitali/agent-discourse/blob/main/skills/respond-to-review/README.md
- https://github.com/SteveVitali/agent-discourse/blob/main/skills/draft-from-outline/README.md

---

## 2. The market is not “AI writing”; it is several collapsing layers

### Horizontal frontier platforms

ChatGPT now combines deep research, persistent projects/memory, connected sources, file manipulation, and ChatGPT Work for creating/editing documents. OpenAI explicitly positions Projects for long-running writing and research, while Work can turn context from tools/files into finished documents and iterate on them.

Google’s Gemini Notebook (formerly NotebookLM) has become an agentic research environment with stronger reasoning, code execution, source organization, and artifact production. Deep Research Max adds longer-horizon research and MCP/private-source connectivity.

These products make “research before you write,” “remember project context,” and “produce a cited report” horizontal capabilities.

Sources:
- https://help.openai.com/en/articles/10500283-deep-research-faq
- https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- https://openai.com/chatgpt-work/
- https://help.openai.com/en/articles/20001278-creating-and-editing-documents-spreadsheets-and-presentations-with-chatgpt-work
- https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook/
- https://blog.google/innovation-and-ai/products/notebooklm/better-research-notebooklm/
- https://blog.google/innovation-and-ai/models-and-research/gemini-models/next-generation-gemini-deep-research/

### Document-native AI writing environments

Type.ai already markets itself as an intelligent editor for long-form work and supports documents up to 150,000 words with access to frontier models. Products such as Lex validate the broader demand for AI-native document environments.

Source:
- https://type.ai/pricing

### Grammarly / Superhuman is the most dangerous direct horizontal competitor

Grammarly has evolved into a suite of task-specific writing agents. Reader Reactions predicts how a chosen audience may interpret a text. Citation Finder flags claims requiring support and can surface sources that support or contradict the argument. Superhuman Docs adds an AI-native document surface, while Superhuman Go is building an agent layer that follows users across applications.

This is strategically important because Grammarly already has distribution at enormous scale and can productize “specialist reviewer agents” as a feature.

Sources:
- https://www.grammarly.com/ai-agents
- https://support.grammarly.com/hc/en-us/articles/38552281546765-Docs-Grammarly-s-new-AI-writing-surface-user-guide
- https://www.grammarly.com/ai-agents/citation-finder
- https://www.grammarly.com/ai-agents/reader-reactions
- https://blog.superhuman.com/introducing-superhuman-docs/
- https://superhuman.com/go

### Academic research and peer review are increasingly specialized

The academic stack is already fragmented among literature-discovery systems, citation/evidence systems, writing tools, and pre-submission review products. Elicit, Consensus, Scite, Paperpal, and a growing set of AI peer-review systems make academia technologically adjacent but commercially crowded.

A 2026 survey of AI manuscript-review tools already describes distinct categories for literature intelligence, document chat, writing support, and manuscript-readiness review. This supports avoiding academia as the first wedge unless Agent Discourse develops domain-specific scientific/methodological infrastructure.

---

## 3. Why the repo’s architecture is more defensible than “multi-agent writing”

The literature is an important caution.

Self-Refine showed that iterative model feedback can improve outputs substantially, but this makes simple review/revision loops increasingly commoditized.

More recent work on multi-agent debate is less flattering to “agent councils.” A NeurIPS 2025 study found that majority voting accounts for much of the apparent performance gain commonly attributed to debate; debate itself did not necessarily improve expected correctness. Work on LLM-as-a-judge systems also documents position bias, prompt sensitivity, leniency, and inconsistent inter-model agreement.

This means the moat cannot be “we run five agents.”

Agent Discourse is strongest exactly where it does something more disciplined:

- independent context boundaries;
- explicit source-verification obligations;
- structured intermediate artifacts;
- separation of review disciplines;
- calibrated decision rules;
- traceable dispositions;
- fresh-context audits;
- human escalation for identity-level decisions.

These mechanisms should be surfaced and evaluated as product behavior.

Sources:
- Self-Refine: https://papers.nips.cc/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract-Conference.html
- Debate or Vote: https://mlanthology.org/neurips/2025/choi2025neurips-debate/
- Judging the Judges: https://aclanthology.org/2025.ijcnlp-long.18/
- LLM peer-review prompt sensitivity: https://www.sciencedirect.com/science/article/pii/S107663322600365X
- ICLR 2025 human/AI review study: https://www.mdpi.com/2304-6775/14/3/55

---

## 4. The best initial market wedge

The most promising initial customer is not “someone who needs writing help.”

It is a person producing **high-stakes analytical or long-form nonfiction** who already possesses an argument and cares disproportionately about whether it is defensible and publishable.

Candidate segments:

- serious Substack/newsletter writers;
- journalists and magazine writers;
- policy analysts and think-tank researchers;
- public intellectuals and essayists;
- technical founders and engineers writing public essays;
- analysts writing investment/strategy theses;
- nonfiction authors;
- eventually editorial teams and publications.

The job-to-be-done is:

> “I have spent serious time on this. Before I publish it, tell me what is actually wrong, prove it, help me repair it without destroying my voice, and check the revision again.”

This is much stronger than “help me write.”

---

## 5. Cultural risk: authorship and authenticity are becoming product requirements

AI assistance in public writing has become culturally contested in 2026. Substack introduced a reader-facing AI-text scanning feature in July 2026. Public debate around AI-assisted op-eds and professional writing has intensified.

This creates both a risk and an opportunity.

Risk: a product that visibly generates large amounts of prose may be associated with “AI slop,” reputationally harming the exact serious writers it wants to attract.

Opportunity: a product positioned as **editorial augmentation rather than authorship substitution** can fit the emerging norm much better. The system can keep authorship legible: which passages were human-authored, which claims were researched by agents, which edits were suggested, which revisions were accepted, and what the author ultimately decided.

The repo’s “author seat” and rejection/rebuttal semantics are unusually well suited to this cultural environment.

Source:
- https://support.substack.com/hc/en-us/articles/50891130623508-How-can-I-detect-AI-on-Substack

Research also suggests an important distinction: AI assistance can improve individual efficiency/quality while widespread uniform AI generation can reduce diversity and produce homogenization. Agent Discourse should therefore optimize for preserving and sharpening the author’s own thinking rather than replacing it.

Sources:
- https://www.sciencedirect.com/science/article/pii/S294988212500091X
- https://www.sciencedirect.com/science/article/pii/S294988212600040X

---

## 6. Product thesis: an IDE for arguments, not a word processor with chat

The Cursor analogy is directionally right but needs to be applied at the level of **domain structure**, not UI imitation.

Software engineering has:
- source files;
- syntax and ASTs;
- compiler errors;
- tests;
- runtime behavior;
- diffs and commits;
- dependency graphs;
- code review;
- CI;
- agent execution.

Serious written discourse needs its own equivalents:

| Software environment | Discourse environment |
|---|---|
| source file | manuscript |
| AST / symbols | thesis, claims, premises, sections |
| dependency graph | argument graph |
| test | claim verification / objection test |
| compiler diagnostic | editorial finding |
| linter | craft/style diagnostics |
| debugger | evidence/argument trace |
| git diff | semantic manuscript diff |
| code review | editorial dossier |
| CI | pre-publication review suite |
| issue | revision obligation |
| repository history | body-of-work / author corpus |
| agent | researcher/editor/author/reviewer |
| build artifact | publishable manuscript |

This should drive the downstream product refactor.

---

## 7. The canonical object model

A robust SaaS should not store the user’s work primarily as chats and blobs of generated prose. It should model at least:

### Project
A book, essay, investigation, research theme, or recurring publication.

### Manuscript
A versioned text artifact.

### Claim
A proposition asserted by the manuscript, including location, type, confidence, and load-bearingness.

### Source
A fetched document with provenance and access metadata.

### Evidence relation
Support / contradict / contextualize / unverifiable.

### Argument node
Premise, inference, conclusion, objection, rebuttal, assumption.

### Finding
An editorial diagnosis anchored to text/argument/evidence.

### Disposition
Accept / adapt / rebut / defer / escalate.

### Revision obligation
A durable task produced by a finding and closed only when discharged.

### Revision move
A global or local change with rationale and affected obligations.

### Review run
A reproducible execution with model, skills, sources, settings, and artifacts.

### Reader/venue profile
Calibration target rather than roleplay persona.

### Author corpus
Prior work and source material used to derive continuity.

### Author model
Measured stylistic traits, positions, continuity, known preferences, disputed preferences.

### Decision/provenance event
What was changed, by whom/what, why, and on what evidence.

The product’s compounding value lies in this graph.

---

## 8. UX implications

The application should have at least four tightly coupled surfaces.

### A. Manuscript surface
A high-quality editor with comments, semantic diffs, inline source/finding anchors, and version history.

### B. Dossier / diagnostics surface
A structured review rather than a long chat response:
- editorial verdict;
- ranked major issues;
- claim ledger;
- argument map;
- discourse/originality map;
- strongest counterarguments;
- reader/venue analysis;
- craft findings;
- ordered revision plan.

### C. Agent/workflow surface
Visible runs showing:
- current phase;
- sources consulted;
- unresolved decisions;
- human gates;
- outputs/artifacts;
- cost/time/rigor setting.

### D. Knowledge surface
Project corpus, author corpus, sources, prior positions, prior rejected findings, venue profiles, and reusable research.

Chat is useful, but it should be one interaction mode over the stateful system—not the database and not the primary product metaphor.

---

## 9. What to deprioritize

### Generic autocomplete
High-quality autocomplete is useful but commoditized and not strategic.

### “Many AI personas”
Easy to demo; weak epistemic foundation; easy to clone.

### Marketing-copy workflows
Crowded and poorly aligned with the project’s strongest insight.

### Full academic workflow at launch
Would pull the product into citation styles, journal requirements, statistical review, equations, reference managers, discipline-specific methods, and institutional procurement.

### Overbuilding Google Docs parity
Comments, collaboration, export/import, and reliable editing matter eventually, but building a complete office suite before proving the editorial loop would be a trap.

### Fully autonomous publishing
Strategically misaligned with serious writers and increases authenticity risk.

---

## 10. Defensibility

The durable moat cannot be prompts, models, or generic agent orchestration.

Potential defensible assets are:

1. **Editorial methodology** — encoded protocols, independence rules, calibration rules, and revision semantics.
2. **Evaluation corpus** — blind comparisons against human editors and frontier-model baselines.
3. **Longitudinal author model** — history of accepted/rejected suggestions, positions, stylistic preferences, and revision behavior.
4. **Manuscript/evidence graph** — structured claims, sources, findings, objections, and revision lineage.
5. **Venue and audience calibration** — empirically grounded profiles rather than generic personas.
6. **Workflow switching costs** — corpus, project memory, source libraries, revision history, and editorial preferences.
7. **Trust/brand** — writers come to believe the system’s judgment is unusually good.
8. **Open methodology + proprietary evaluations/data** — the open-source skills can function as auditable methodology and distribution while the hosted product compounds execution data, UX, memory, and evaluation infrastructure.

---

## 11. Business-model implications

A heavyweight editorial workflow should not imitate Grammarly’s cheap, always-on interaction economics.

The product can charge for **expensive judgment**.

A plausible initial model:

- free/light diagnostic;
- metered deep-review credits;
- $30–80/month serious-writer tier;
- $100–300/month professional tier with larger corpora and more deep runs;
- later team/editorial pricing.

The exact price should be discovered empirically. The critical point is that the customer’s denominator is not “tokens” or “grammar checks”; it is the cost in time/reputation of publishing weak work and the cost of a capable human editor.

Usage-based compute exposure should remain visible internally even if packaged into plans. Deep research, multiple independent reads, and repeated revision audits can be expensive, so the architecture should support selectable rigor levels.

---

## 12. The benchmark that determines whether this is a company

The product should be developed alongside an evaluation program.

Construct a corpus of serious nonfiction drafts with known editorial problems and, ideally, professional-editor annotations.

Blindly compare:
- frontier model with a strong one-shot prompt;
- frontier model with an iterative generic workflow;
- Grammarly/Superhuman where comparable;
- Agent Discourse;
- human editor(s).

Measure:
- material-issue recall;
- false-positive rate;
- specificity/anchoring;
- factual accuracy;
- source quality;
- novelty of findings;
- severity calibration;
- usefulness of revision plans;
- manuscript improvement after revision;
- voice/meaning preservation;
- independent-review marginal contribution;
- cost and latency.

The business passes its first real test if Agent Discourse produces a **large and repeatable** lift over simply asking the best frontier model to review the manuscript.

A small lift is insufficient because horizontal platforms have distribution and rapidly improve.

---

## 13. MVP / product-validation plan

The next MVP should prove the review-revision loop, not the entire IDE.

### Core flow
1. Import/paste manuscript.
2. Identify target venue/audience and draft stage.
3. Run deep editorial review.
4. Render structured dossier.
5. Let the author accept, adapt, rebut, defer, or challenge findings.
6. Propose or manually perform revision moves.
7. Show semantic diff and obligations discharged.
8. Run independent second-round review.
9. Compare before/after diagnostics.

### Instrument everything
Track:
- finding accepted/rejected;
- reason;
- whether author changed text;
- whether recommendation was materially adopted;
- whether change survives later review;
- whether author requests another review;
- time spent in dossier versus chat;
- subsequent manuscript upload;
- willingness to pay.

The north-star early signal is not words generated. It is **repeat review/revision cycles on important manuscripts.**

---

## 14. Strongest bull case

If successful, Agent Discourse becomes the persistent reasoning environment for people whose output is arguments rather than code.

The product can expand from:
1. manuscript review;
2. research/discourse mapping before drafting;
3. structured argument construction;
4. author-corpus continuity;
5. collaborative editorial workflows;
6. policy/strategy/research deliberation;
7. generalized human–agent discourse and decision systems.

The underlying object graph—claims, evidence, objections, revisions, provenance—has applicability far beyond publishing.

---

## 15. Strongest bear case

The bear case is serious.

Frontier platforms can already:
- research;
- retrieve sources;
- remember projects;
- edit documents;
- simulate audiences;
- critique;
- create custom workflows;
- run agents.

Their marginal cost of adding “deep editorial review” is small, and their distribution is enormous.

If Agent Discourse remains a bundle of excellent prompts/skills inside a prettier editor, it will be a feature, not a durable company.

The product also faces:
- a relatively narrow initial user base;
- potentially expensive inference;
- authorship/authenticity anxiety;
- difficult objective evaluation of editorial quality;
- high UX expectations from writers accustomed to Docs/Word;
- the possibility that users prefer flexible chat over structured workflow;
- the possibility that the best writers value human editorial relationships specifically because they are human.

The company exists only if structured editorial intelligence produces materially better outcomes and enough workflow lock-in to offset those forces.

---

## 16. Final recommendation

Proceed, but refactor the product plan around a stronger thesis:

> **Agent Discourse is an agentic development environment for arguments and serious manuscripts.**

The editor is the canvas. The manuscript is the primary artifact. But the differentiated system lives underneath it:

- claim/evidence graph;
- argument graph;
- review runs;
- editorial findings;
- durable revision obligations;
- author/venue memory;
- provenance;
- independent-context execution;
- evaluation/calibration.

Do not optimize the roadmap around “AI writing features.” Optimize it around turning written reasoning into a **stateful, testable, reviewable, revisable process**.

That architecture is both truer to what the open-source project already does and much more likely to remain valuable as raw model capability commoditizes.

