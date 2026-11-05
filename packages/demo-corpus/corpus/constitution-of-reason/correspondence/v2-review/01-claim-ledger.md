# Claim Ledger — "The Constitution of Reason" (draft 2)

Phase 1 fact-check, per `skills/editorial-review/references/verification-protocol.md`.
All URLs below were opened during this session (2026-07-30). Where a primary
source was unreachable and a secondary source was used, the entry says so.

## Summary

- Claims inventoried: 39 (T1: 18, T2: 18, T3: 3)
- Checked: 37 — Verified: 35 · Substantially accurate: 2 · Misleading: 0 ·
  Unsupported: 0 · Contradicted: 0 · Unverifiable: 0
- Major-issue escalations: **none.** No Tier 1 claim is Contradicted or
  Misleading in context.
- Substantially-accurate items needing a fix: C9 (Kaesberg et al. gloss goes
  beyond the paper's framing), C17 (Federalist 51 authorship is formally
  disputed, though standard modern attribution is Madison).
- Skipped (with reason): C37 (Tier 3 pure characterization of how scholasticism
  "is often remembered" — an author's framing of a reputation, not a checkable
  fact; plausible on its face and immediately qualified in the draft). C39
  (general engineering claim fully subsumed by C2 and C4, both checked).
- **Report against interest:** the five citations flagged in the brief as
  "too good to check" — C7, C8, C10, C11, C12 — all check out, in every
  particular I could test: the arXiv IDs resolve, titles and authors match,
  and the specific findings the essay attributes to them (token variance,
  anonymous ICLR blogpost, "semantic contagion," experts held back even when
  identified, decomposable-vs-sequential split) are in the sources, several
  nearly verbatim. C4's oddly specific retitling parenthetical is also
  correct. This draft's scholarly apparatus is unusually sound.

## Ledger

### C1 · Tier 1 · Verified
> "Although the logos is common, the many live as though they had a private understanding." — Heraclitus, DK 22 B2 (epigraph); also §I ¶1: "the meaning of *logos* in them remains contested"
- **Finding:** Fragment number, wording, and reading all check out. The
  Stanford Encyclopedia of Philosophy renders B2: "Although this Word is
  common, the many live as if they had a private understanding" — the draft's
  epigraph is this standard rendering with *logos* left untranslated and
  "as though" for "as if." Wikipedia's Heraclitus article gives another
  standard translation with the same sense ("And though reason is common,
  most people live as though they had an understanding peculiar to
  themselves") and confirms the scholarly dispute over *logos* the draft's
  §I asserts (Kahn arguing multiple deliberate senses vs. Guthrie denying
  unusual usage; "Heraclitus might have a different meaning of the word for
  each usage").
- **Evidence:** [SEP, "Heraclitus"](https://plato.stanford.edu/entries/heraclitus/) — B2
  translation as quoted above. [Wikipedia, "Heraclitus"](https://en.wikipedia.org/wiki/Heraclitus) —
  alternate B2 translation; Kahn/Guthrie dispute over the meaning of *logos*.
- **Fix:** none required. Optional polish: credit the translation (it is
  closest to the Curd/McKirahan-family rendering) or mark it "trans. modified."

### C2 · Tier 1 · Verified
> "Anthropic's research system uses a lead agent to delegate different searches to subagents operating in their own contexts, then compresses their findings into a final synthesis." (Second Context ¶7; §VI "Search and Context Federation")
- **Finding:** Matches the primary source. The Anthropic engineering post:
  "the lead agent analyzes it, develops a strategy, and spawns subagents to
  explore different aspects simultaneously"; "Subagents facilitate
  compression by operating in parallel with their own context windows."
- **Evidence:** [Anthropic Engineering, "How we built our multi-agent research system"](https://www.anthropic.com/engineering/built-multi-agent-research-system).
- **Fix:** none.

### C3 · Tier 1 · Verified
> "Anthropic reports that this architecture performs especially well on breadth-first research questions—but it also reports that token use alone explained most of the performance variance in one analysis, and that multi-agent research consumed many times the tokens of ordinary chat." (§VI)
- **Finding:** All three sub-claims are in the source, with the numbers
  behind the draft's hedged phrasing: "multi-agent research systems excel
  especially for breadth-first queries"; "token usage by itself explains 80%
  of the variance" (three factors together explain 95%); "multi-agent
  systems use about 15× more tokens than chats." "Most of the variance" and
  "many times the tokens" are accurate compressions of 80% and 15×.
- **Evidence:** [Anthropic Engineering, "How we built our multi-agent research system"](https://www.anthropic.com/engineering/built-multi-agent-research-system) — all three quotations above.
- **Fix:** none. The draft could cite the exact figures (80%, 15×) for force.

### C4 · Tier 1 · Verified
> "Google's AI co-scientist organizes specialized agents around generation, reflection, ranking, evolution, and meta-review" (Second Context ¶7); "assigns specialized roles to generation, reflection, ranking, evolution, proximity, and meta-review processes … tournament-like evaluation" (§VI); ref [2]: "Gottweis, J., et al., 'Accelerating Scientific Discovery with Co-Scientist' (originally circulated as 'Towards an AI Co-Scientist'), arXiv:2502.18864 (2025)."
- **Finding:** All correct, including the retitling parenthetical the brief
  flagged as suspicious. arXiv:2502.18864 v1 (Feb 26, 2025) is titled
  "Towards an AI co-scientist," Gottweis and Weng first authors; the current
  version (v2, revised 2026) is titled "Accelerating scientific discovery
  with Co-Scientist," with "a tournament evolution process for self-improving
  hypotheses generation" in the abstract. Google's research blog names
  exactly six agents — Generation, Reflection, Ranking, Evolution, Proximity,
  Meta-review — and Elo-based tournament evaluation. Note the Second Context
  paragraph lists five roles (omitting proximity); §VI gives all six; both
  are accurate as written ("organizes … around" vs. exhaustive list).
- **Evidence:** [arXiv:2502.18864](https://arxiv.org/abs/2502.18864) — current
  title, tournament evolution. [arXiv:2502.18864v1](https://arxiv.org/abs/2502.18864v1) —
  v1 title "Towards an AI co-scientist," Gottweis et al.
  [Google Research blog, "Accelerating scientific breakthroughs with an AI co-scientist"](https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/) —
  six agent names, Elo tournaments.
- **Fix:** none.

### C5 · Tier 1 · Verified
> "But intrinsic self-correction—revision without new evidence or external feedback—has often proved unreliable. Models may preserve the original error or change correct answers into incorrect ones.[21]" (§VI)
- **Finding:** Exactly what the paper says. Huang et al., "Large Language
  Models Cannot Self-Correct Reasoning Yet" (arXiv:2310.01798, Oct 2023):
  "LLMs struggle to self-correct their responses without external feedback,
  and at times, their performance even degrades after self-correction"; the
  paper's subject is "intrinsic self-correction … without the crutch of
  external feedback" — the draft's definition matches the paper's.
- **Evidence:** [arXiv:2310.01798](https://arxiv.org/abs/2310.01798) — title,
  Jie Huang first author, quotations above.
- **Fix:** none.

### C6 · Tier 1 · Verified
> "Research separating error detection from error correction suggests that models can sometimes repair a mistake once its location is supplied while remaining poor at discovering the mistake independently.[22]" (§VI)
- **Finding:** Accurate. Tyen et al., "LLMs cannot find reasoning errors,
  but can correct them given the error location" (arXiv:2311.08516; ACL 2024
  Findings): "poor self-correction performance stems from LLMs' inability to
  find logical mistakes, rather than their ability to correct a known
  mistake"; providing error location "boosts downstream task performance
  across our 5 reasoning tasks." Reference dates it "(2024)" — submitted
  Nov 2023, revised/published 2024; the 2311 ID makes the year visible
  either way. Acceptable.
- **Evidence:** [arXiv:2311.08516](https://arxiv.org/abs/2311.08516) — title,
  Tyen first author, venue, quotations above.
- **Fix:** none (optionally cite as 2023/2024).

### C7 · Tier 1 · Verified
> "Comparative studies have found that popular debate methods do not reliably outperform strong chain-of-thought or self-consistency baselines despite consuming additional computation, although heterogeneity among models can help.[27]" — ref [27]: "'Multi-LLM-Agents Debate: Performance, Efficiency, and Scaling Challenges,' ICLR 2025 Blogposts Track (published without author attribution)." (§VI)
- **Finding:** The blogpost exists at the ICLR 2025 Blogposts Track and says
  what the draft says: "current MAD frameworks fail to consistently
  outperform simple single-agent test-time computation strategies"; "most
  MAD frameworks are not able to achieve consistently better performances
  than CoT"; "MAD cannot scale well with increased inference budget."
  Heterogeneity: "combining GPT-4o-mini and Llama3.1-70b together" improved
  accuracy, with the caveat that combination "does not always ha[ve]
  positive influence" — the draft's "can help" is properly hedged. The odd
  "published without author attribution" is literally true: the page's
  author block reads "PLACEHOLDER FOR ACADEMIC ATTRIBUTION" / "PLACEHOLDER
  FOR BIBTEX." I suspected this detail and it checks out.
- **Evidence:** [ICLR Blogposts 2025, "Multi-LLM-Agents Debate — Performance, Efficiency, and Scaling Challenges"](https://iclr-blogposts.github.io/2025/blog/mad/) — all quotations; placeholder attribution observed on page.
- **Fix:** none. (The ICLR virtual site lists a poster entry, so attribution
  may exist elsewhere; the citation as written is defensible since the
  published page itself carries no authors.)

### C8 · Tier 1 · Verified
> "Controlled work disentangling the ingredients of debate has found that intrinsic reasoning strength and genuine diversity matter more than most structural protocol choices, and that majority pressure can suppress correct minority judgments.[28]" (§VI)
- **Finding:** The paper exists and matches: Wu, Haolun; Li, Zhenkun; Li,
  Lingyao, "Can LLM Agents Really Debate? A Controlled Study of Multi-Agent
  Debate in Logical Reasoning" (arXiv:2511.07784, Nov 11, 2025). Findings:
  "intrinsic reasoning strength and group diversity are the dominant drivers
  of debate success," structural elements (turn order, confidence
  visibility) marginal, and "majority pressure suppresses independent
  correction." Author initials in ref [29-style] ("Wu, H., Z. Li, and L.
  Li") match. Flagged as too-good-to-check; it checks out.
- **Evidence:** [arXiv:2511.07784](https://arxiv.org/abs/2511.07784) — title,
  authors, date, quotations above.
- **Fix:** none.

### C9 · Tier 1 · Substantially accurate
> "Even the decision rule matters—voting can preserve a useful independence that forced consensus destroys.[29]" (§VI)
- **Finding:** The citation is real and supports the first half: Kaesberg,
  Becker, Wahle, Ruas, Gipp, "Voting or Consensus? Decision-Making in
  Multi-Agent Debate" (arXiv:2502.19130; ACL 2025 Findings) shows decision
  protocols "can highly impact final model answers." But the paper's actual
  finding is task-dependent, not directional: voting protocols improved
  reasoning tasks by 13.2% while *consensus protocols improved knowledge
  tasks* by 2.8%; the paper's diversity angle is that its proposed methods
  (All-Agents Drafting, Collective Improvement) raise performance "by
  increasing answer diversity," and that agents are agreeable and tend to
  improve the first agent's answer. The draft's mechanism — voting
  preserving an independence that consensus destroys — is the essay's gloss,
  compatible with but not stated by the paper, and it flattens the paper's
  finding that consensus is *better* for knowledge tasks.
- **Evidence:** [arXiv:2502.19130](https://arxiv.org/abs/2502.19130) — title,
  authors, ACL 2025 Findings; protocol-impact quotation; 13.2%/2.8%
  task-split; diversity-increasing methods.
- **Fix:** re-scope to what the paper shows, e.g.: "Even the decision rule
  matters — in one systematic comparison, voting and consensus protocols
  favored different task types, and the gains from new protocols came from
  increasing answer diversity." Or keep the independence point but attach it
  to [30] (Bertalanič & Fortuna), which does show consensus destroying
  correct answers.

### C10 · Tier 1 · Verified
> "A recent study of unguided debate among identical models found precisely this kind of semantic contagion: agents frequently discarded independently correct reasoning to adopt the modal answer, producing high consensus alongside lower accuracy and substantial communication cost.[30]" (§VII)
- **Finding:** Fully confirmed, down to the term. arXiv:2605.00914,
  Bertalanič & Fortuna, "The Cost of Consensus: Isolated Self-Correction
  Prevails Over Unguided Homogeneous Multi-Agent Debate" (submitted end of
  April 2026): teams of 10 *identical* models; "widespread semantic
  contagion" (the paper's own phrase, Fig. 1); "agents uncritically adopt
  majority answers (modal adoption up to 85.5%)"; "teams systematically
  generate, but subsequently discard, correct answers due to peer-induced
  sycophancy"; "debate consumes 2.1–3.4× more tokens … than self-correction
  for equal or lower accuracy." Author names and diacritics in ref [30]
  match. Flagged as too-good-to-check; it checks out exactly.
- **Evidence:** [arXiv:2605.00914](https://arxiv.org/abs/2605.00914) — title,
  authors, abstract findings. [arXiv HTML full text](https://arxiv.org/html/2605.00914v1) —
  "semantic contagion" verbatim; modal-adoption and token-cost quotations.
- **Fix:** none.

### C11 · Tier 1 · Verified
> "Recent experiments with self-organizing model teams found that teams often failed to match their strongest member even when explicitly told which agent was the expert. The systems tended toward integrative compromise—averaging expert and non-expert positions—and the problem worsened as teams grew.[31]" — ref [31]: "Pappu, A., et al., … Apple Machine Learning Research, arXiv:2602.01011 (2026)." (§VII)
- **Finding:** Fully confirmed. arXiv:2602.01011, Pappu, El, Cao, di Nolfo,
  Sun, Cao, Zou, "Multi-Agent Teams Hold Experts Back" (Feb 2026; ICML
  2026): "LLM teams consistently fail to match their expert agent's
  performance, even when explicitly told who the expert is, incurring
  performance losses of up to 41.1%"; "a tendency toward integrative
  compromise — averaging expert and non-expert views rather than
  appropriately weighting expertise — which increases with team size and
  correlates negatively with performance." The Apple attribution is correct:
  the paper is hosted on Apple Machine Learning Research. Flagged as
  too-good-to-check; it checks out verbatim.
- **Evidence:** [arXiv:2602.01011](https://arxiv.org/abs/2602.01011) — title,
  authors, dates, ICML 2026. [Apple Machine Learning Research, "Multi-Agent Teams Hold Experts Back"](https://machinelearning.apple.com/research/multi-agent-teams-experts) —
  hosting confirms the "Apple Machine Learning Research" attribution;
  quotations above.
- **Fix:** none.

### C12 · Tier 1 · Verified
> "A large controlled study of agent architectures found that multi-agent systems could produce large improvements on decomposable tasks while severely degrading sequential planning tasks. … Validation bottlenecks reduced some forms of error propagation, but no architecture dominated across tasks.[32]" (§VII)
- **Finding:** Confirmed. arXiv:2512.08296, Kim et al., "Towards a Science
  of Scaling Agent Systems" (Dec 9, 2025): 260 configurations, five
  architectures, six benchmarks; "relative performance change compared to
  single-agent baseline ranges from +80.8% on decomposable financial
  reasoning to −70.0% on sequential planning"; "architectures without
  centralized verification tend to propagate errors more"; no universal
  winner — success depends on matching coordination structure to task.
  "Large controlled study" is a fair description. Flagged as
  too-good-to-check; it checks out.
- **Evidence:** [arXiv:2512.08296](https://arxiv.org/abs/2512.08296) — title,
  Yubin Kim first author, quotations and figures above.
- **Fix:** none.

### C13 · Tier 1 · Verified
> "Mercier and Sperber's interactionist theory of reasoning … They argue that important functions of human reasoning are social: producing reasons for claims and evaluating reasons presented by others. … People can be remarkably skilled at constructing support for positions they already hold and surprisingly poor at impartially searching for reasons against them. Under suitable interactive conditions, however, another person may detect the weakness…" (§V)
- **Finding:** Accurate characterization of *The Enigma of Reason* (Harvard
  UP, 2017 — matching ref [13]). A review of the book confirms the two
  functions as characterized ("persuade skeptical others about one's
  beliefs, as well as the capacity to determine the legitimacy of others'
  claims"; generating justifications), myside bias as socially adaptive
  rather than a defect, and reasoning performing better in interactive
  settings than in solitary use — precisely the asymmetry the draft
  describes. Note the draft's careful hedges ("important functions," "should
  not be converted into a complete evolutionary history") if anything
  under-claim relative to the authors' stronger evolutionary thesis.
  *Primary unreachable this session:* the Harvard UP catalog page returned
  empty content twice and the authors' précis PDF was unreadable; verified
  against a secondary source per protocol §3.
- **Evidence:** [Psychology Today, "The Enigma of Reason: A Brief Review"](https://www.psychologytoday.com/us/blog/theory-knowledge/201808/the-enigma-reason-brief-review) —
  interactionist functions, myside bias, social-context advantage, contrast
  with the "intellectualist" view.
- **Fix:** none.

### C14 · Tier 1 · Verified
> "[Objectivity] depends upon social processes of transformative criticism: recognized places where criticism can be offered, shared standards by which claims are evaluated, actual uptake through which criticism can alter inquiry, and a qualified equality of intellectual authority…" (§III)
- **Finding:** The draft's four conditions match Longino's four criteria as
  standardly reported: (1) "publicly recognized forums for the criticism of
  evidence, methods, and assumptions"; (2) "publicly recognized standards"
  for evaluation; (3) "uptake of criticism, which requires that the
  community not merely tolerate dissent, but alter its beliefs"; (4)
  "tempered equality of intellectual authority." The draft's "qualified
  equality" for "tempered equality" is a fair paraphrase; "transformative
  criticism" is Longino's term. The draft's emphasis on uptake as the key
  condition is an authorial judgment, not misattribution.
- **Evidence:** [SEP, "Feminist Perspectives on Science"](https://plato.stanford.edu/entries/feminist-science/) —
  lists all four Longino criteria as quoted.
- **Fix:** none.

### C15 · Tier 1 · Verified
> "Unless we become hermits, he observed, the fixation of belief cannot remain merely an individual problem; our beliefs affect one another… The scientific method was superior because it sought beliefs determined by something external to any person's opinion—by a reality whose characteristics did not depend upon what anyone thought them to be.[7]" (§III)
- **Finding:** Faithful paraphrase of the primary text. Peirce, "The
  Fixation of Belief," *Popular Science Monthly* 12 (November 1877):
  "Unless we make ourselves hermits, we shall necessarily influence each
  other's opinions; so that the problem becomes how to fix belief, not in
  the individual merely, but in the community." And on science/external
  permanency: "There are Real things, whose characters are entirely
  independent of our opinions about them." Journal, volume, and year in ref
  [7] confirmed by the source header.
- **Evidence:** [Peirce, "The Fixation of Belief" (peirce.org)](https://www.peirce.org/writings/p107.html) —
  both passages and the *Popular Science Monthly* 12 (1877) header.
- **Fix:** none.

### C16 · Tier 1 · Verified
> "The opinion suppressed by authority may be true. It may contain the neglected part of a truth divided among opposing positions. Even when it is false, its serious contestation may prevent true belief from decaying into what Mill called 'dead dogma'… To silence an opinion because one is certain of its falsity is to confuse certainty with infallibility.[9]" (§IV)
- **Finding:** All four elements are in *On Liberty* ch. II, nearly
  verbatim: "if it is not fully, frequently, and fearlessly discussed, it
  will be held as a dead dogma, not a living truth"; "when the conflicting
  doctrines … share the truth between them; and the nonconforming opinion is
  needed to supply the remainder of the truth"; "All silencing of discussion
  is an assumption of infallibility." "Dead dogma" is correctly quoted and
  correctly attributed to ch. II (1859).
- **Evidence:** [Mill, *On Liberty*, ch. II (utilitarianism.com)](https://www.utilitarianism.com/ol/two.html) —
  all three quotations.
- **Fix:** none.

### C17 · Tier 1 · Substantially accurate
> "Madison's famous claim that 'ambition must be made to counteract ambition' does not assume that officeholders will become wise by entering separate branches.[10]" — ref [10]: "Madison, J., *The Federalist*, No. 51 (1788)." (§IV)
- **Finding:** The quotation is verbatim in Federalist No. 51 ("Ambition
  must be made to counteract ambition. The interest of the man must be
  connected with the constitutional rights of the place."), the year 1788 is
  correct (New York Packet, Feb 8, 1788), and the draft's reading matches
  the surrounding "If men were angels…" passage — the argument is expressly
  architectural, not a hope for wiser officeholders. One detail: the
  authorship of No. 51 is formally disputed; the Avalon text is headed
  "HAMILTON OR MADISON." Standard modern scholarly practice attributes
  No. 51 to Madison, so the citation follows convention, but "Madison's
  famous claim" states as settled what the documentary record marks as
  contested.
- **Evidence:** [Avalon Project, Federalist No. 51](https://avalon.law.yale.edu/18th_century/fed51.asp) —
  verbatim quote, context, date, "HAMILTON OR MADISON" header.
- **Fix:** optional and minor: no change needed for a general audience, or
  hedge the reference ("No. 51, conventionally attributed to Madison").

### C18 · Tier 1 · Verified
> "The Condorcet Jury Theorem gives this intuition a formal but highly conditional expression.[11] In its familiar form, if individuals independently have a better-than-random probability of selecting the correct answer to a binary question, majority accuracy rises as the group grows. … Competence matters. Independence matters. Correlated error can destroy the result." (§IV); and "A thousand judgments produced by the same error are not a thousand independent judgments."
- **Finding:** Correct statement and correct caveats. SEP: "Assuming UI
  [unconditional independence] and UC [unconditional competence >1/2], the
  probability of majority correctness … increases in (odd) group size n and
  converges to 1." On correlated error: "common causes create correlations"
  (shared evidence, shared perspective-shaping influences) that violate
  independence — exactly the draft's point. Ref [11]'s French title of the
  1785 *Essai* matches the SEP bibliography entry word for word.
- **Evidence:** [SEP, "Jury Theorems"](https://plato.stanford.edu/entries/jury-theorems/) —
  theorem statement, common-cause discussion, 1785 *Essai* citation.
- **Fix:** none.

### C19 · Tier 2 · Verified
> "In the *Sophist*, thought is described as a silent dialogue of the soul with itself.[4]" — ref [4]: "Plato, *Sophist* 263e; cf. *Theaetetus* 189e–190a." (§II)
- **Finding:** Both loci are correct. Sophist 263e (Fowler): "thought and
  speech are the same; only the former, which is a silent inner conversation
  of the soul with itself, has been given the special name of thought."
  Theaetetus 189e–190a (Jowett): "Thinking is the conversing of the mind
  with herself, which is carried on in question and answer…" The draft's
  wording ("silent dialogue of the soul with itself") is effectively the
  Fowler rendering.
- **Evidence:** [Perseus, Plato *Sophist* 263e (Fowler)](http://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0172%3Atext%3DSoph.%3Asection%3D263e) —
  quotation above. [Project Gutenberg, *Theaetetus* (Jowett)](https://www.gutenberg.org/cache/epub/1726/pg1726.txt) —
  quotation above.
- **Fix:** none.

### C20 · Tier 2 · Verified
> "Plato did not write treatises under his own name. He wrote dialogues." (§II)
- **Finding:** Confirmed as the scholarly consensus, with the standard
  footnote-level caveats (the *Apology* is a courtroom speech; letters of
  disputed authenticity). SEP: "Nearly everything he wrote takes the form of
  a dialogue"; "In all of his writings—except in the letters, if any of them
  are genuine—Plato never speaks to his audience directly and in his own
  voice"; SEP also contrasts this with contemporaries' treatise-writing.
  The draft's two-sentence version is an acceptable compression; its
  argumentative use (author absent as asserting voice) is exactly what SEP
  affirms.
- **Evidence:** [SEP, "Plato"](https://plato.stanford.edu/entries/plato/) —
  quotations above.
- **Fix:** none.

### C21 · Tier 2 · Verified
> "His logical works distinguish among forms of reasoning… Demonstration aims at knowledge from premises of the appropriate kind. Dialectic proceeds from reputable opinions and tests their implications.[5]" — ref [5]: "*Posterior Analytics* I.1–2; *Topics* I.1–2." (§II)
- **Finding:** Accurate, and the cited loci are the right ones. SEP: the
  premises of demonstrations must be "true, primary, immediate, better known
  … prior to the conclusion, causes of the conclusion" (*Posterior
  Analytics* I.2); "The premises of dialectical deductions, by contrast,
  must be accepted (*endoxos*)" (*Topics* I.1). "Reputable opinions" is the
  standard translation of *endoxa*.
- **Evidence:** [SEP, "Aristotle's Logic"](https://plato.stanford.edu/entries/aristotle-logic/) —
  quotations above.
- **Fix:** none.

### C22 · Tier 2 · Verified
> "In the disputed question and the familiar structure of Aquinas's articles, the question is posed. Arguments are presented against the position the author will eventually defend. A contrary consideration is introduced. The author gives a determination. Then the initial objections are answered one by one.[6]" and "The *sed contra* commonly appealed to authoritative sources." (§III)
- **Finding:** Correct in every element. The article structure is:
  objections; *sed contra*, which "almost always references authoritative
  literature, such as the Bible, Aristotle, or the Church Fathers" (matching
  the draft's "commonly appealed to authoritative sources"); *respondeo
  dicendum quod* (the determination); replies to each objection. SEP
  confirms the disputed question as "a regular form of teaching …
  characterized by a dialectical method" of opposed arguments from reason
  and authority, and that the *Summa* uses "an abbreviated form of the
  disputed question."
- **Evidence:** [Wikipedia, "Summa Theologica"](https://en.wikipedia.org/wiki/Summa_Theologica) —
  four-part article structure, sed contra and authority. [SEP, "Literary Forms of Medieval Philosophy"](https://plato.stanford.edu/entries/medieval-literary/) —
  quaestio disputata; Summa as abbreviated disputed question.
- **Fix:** none.

### C23 · Tier 2 · Verified
> "Communication is rational not merely when speakers causally influence one another, but when they orient themselves toward reaching understanding… Communicative action differs from strategic action, in which speech is used primarily to produce a desired effect.[12]" (§IV)
- **Finding:** Accurate rendering of the *Theory of Communicative Action*
  distinction. SEP: in communicative action, "the actions of the agents
  involved are coordinated not through egocentric calculations of success
  but through acts of reaching understanding" (citing the 1984 McCarthy
  translation, matching ref [12]); strategic action pursues success by
  producing effects on others. The draft's use (persuasion diverging from
  truth; rhetorical victory vs. reasons) is a legitimate application.
- **Evidence:** [SEP, "Jürgen Habermas"](https://plato.stanford.edu/entries/habermas/) —
  quotation and communicative/strategic contrast.
- **Fix:** none.

### C24 · Tier 2 · Verified
> "Practices of regulation, explanation, and problem-solving that initially occur between child and caregiver can become internalized as private speech and inner speech. The child gradually takes over functions once performed by another person.[14]" (§V)
- **Finding:** Correct statement of Vygotsky's internalization thesis and
  the social speech → private speech → inner speech sequence: "Every
  function in the child's cultural development appears twice: first, on the
  social level, and later, on the individual level; first, between people
  (interpsychological) and then inside the child (intrapsychological)"
  (Vygotsky 1978, p. 57); the more knowledgeable other's dialogue "is what
  gets internalized." Ref [14] cites *Thought and Language* (1934/1986),
  which is the right work for inner speech; the "appears twice" law is from
  *Mind in Society* — but the draft paraphrases the doctrine, not that
  sentence, so the citation is adequate.
- **Evidence:** [Simply Psychology, "Vygotsky's Sociocultural Theory"](https://www.simplypsychology.org/vygotsky.html) —
  genetic law quotation; social/private/inner speech stages; internalization
  of the caregiver's functions. (Secondary source; marxists.org primary text
  not fetched this session.)
- **Fix:** none.

### C25 · Tier 2 · Verified
> "His study of ship navigation treats cognitive work as distributed across sailors, instruments, procedures, representations, and time. The relevant computation is not contained completely within any one skull. It is accomplished by the organized system.[15]" (§V)
- **Finding:** Accurate. Hutchins's *Cognition in the Wild* analyzes
  navigation aboard the USS Palau with the unit of analysis "a collection of
  individuals and artifacts and their relations to each other in a
  particular work practice," showing "distributed cognition … manifested
  through the interaction between crew members as they interpret, process,
  and transform information into various representational states in order to
  safely navigate the ship." The draft's careful negative ("does not require
  claiming that the ship has a consciousness") is consistent with the
  theory's framing. Ref [15] (MIT Press, 1995) matches the standard citation.
- **Evidence:** [Wikipedia, "Distributed cognition"](https://en.wikipedia.org/wiki/Distributed_cognition) —
  USS Palau study, unit-of-analysis quotation. (MIT Press catalog page
  returned 403 this session.)
- **Fix:** none.

### C26 · Tier 2 · Verified
> "Their famous question—where does the mind stop and the rest of the world begin?—destabilizes the assumption that skin and skull supply the natural boundary of cognition.[16]" (§V)
- **Finding:** Exact. "Where does the mind stop and the rest of the world
  begin?" is verbatim the opening sentence of Clark & Chalmers, "The
  Extended Mind" (*Analysis* 1998, matching ref [16]). The characterization
  ("sufficiently integrated external resources can sometimes count as parts
  of a cognitive process rather than merely aids") matches the paper's
  active externalism and parity principle: "If, as we confront some task, a
  part of the world functions as a process which, were it done in the head,
  we would have no hesitation in recognizing as part of the cognitive
  process, then that part of the world is … part of the cognitive process."
- **Evidence:** [Clark & Chalmers, "The Extended Mind" (consc.net)](https://consc.net/papers/extended.html) —
  opening sentence and parity-principle quotation.
- **Fix:** none.

### C27 · Tier 2 · Verified
> "Minsky's *Society of Mind* proposed that what appears as unified intelligence might emerge from the interaction of many simpler agencies.[17] No single internal agent possesses the whole mind. The mind is the organization." (§V)
- **Finding:** Accurate. The theory "views the human mind as a vast society
  of individually simple processes known as agents … the fundamental
  thinking entities from which minds are built"; no individual agent is
  intelligent — intelligence arises from their organization ("The power of
  intelligence stems from our vast diversity, not from any single, perfect
  principle"). Ref [17] (Simon & Schuster, 1986) matches the standard
  citation.
- **Evidence:** [Wikipedia, "Society of Mind"](https://en.wikipedia.org/wiki/Society_of_Mind) —
  quotations above.
- **Fix:** none.

### C28 · Tier 2 · Verified
> "Chain-of-thought prompting demonstrated that eliciting intermediate reasoning artifacts could improve performance on many multi-step tasks.[18]" (§VI)
- **Finding:** Matches the paper. Wei et al., arXiv:2201.11903 (2022):
  "chain of thought prompting improves performance on a range of arithmetic,
  commonsense, and symbolic reasoning tasks."
- **Evidence:** [arXiv:2201.11903](https://arxiv.org/abs/2201.11903) — title,
  Jason Wei, quotation.
- **Fix:** none.

### C29 · Tier 2 · Verified
> "Self-consistency generates several reasoning paths and aggregates their answers rather than trusting the first or most probable completion.[19] The technique improved performance across a range of reasoning benchmarks…" (§VI)
- **Finding:** Matches. Wang et al., arXiv:2203.11171: "samples a diverse
  set of reasoning paths instead of only taking the greedy one, and then
  selects the most consistent answer by marginalizing out the sampled
  reasoning paths"; gains of 3.9%–17.9% across GSM8K, SVAMP, AQuA,
  StrategyQA, ARC-challenge.
- **Evidence:** [arXiv:2203.11171](https://arxiv.org/abs/2203.11171) — title,
  mechanism quotation, benchmark gains.
- **Fix:** none.

### C30 · Tier 2 · Verified
> "Reflexion-style systems convert feedback from prior attempts into textual memory that alters subsequent behavior.[20]" (§VI)
- **Finding:** Matches. Shinn et al., arXiv:2303.11366: "Reflexion agents
  verbally reflect on task feedback signals, then maintain their own
  reflective text in an episodic memory buffer to induce better
  decision-making in subsequent trials."
- **Evidence:** [arXiv:2303.11366](https://arxiv.org/abs/2303.11366) — title,
  Noah Shinn, quotation.
- **Fix:** none.

### C31 · Tier 2 · Verified
> "OpenAI's work on model-written critiques found that critique assistance helped human evaluators notice flaws in summaries they would otherwise miss.[23]" (§VI)
- **Finding:** Matches nearly verbatim: the abstract of Saunders et al.,
  "Self-critiquing models for assisting human evaluators" (arXiv:2206.05802,
  2022) states "critiques written by our models help humans find flaws in
  summaries that they would have otherwise missed." The OpenAI attribution
  is supported by the author roster (Saunders, Yeh, Wu, Bills, Ouyang, Ward,
  Leike — the OpenAI alignment team at the time; affiliations are not shown
  on the arXiv abstract page itself, and OpenAI's own page for the paper
  returned 403 this session).
- **Evidence:** [arXiv:2206.05802](https://arxiv.org/abs/2206.05802) — title,
  Saunders first author, abstract quotation. Author roster confirmed via
  arXiv listing.
- **Fix:** none.

### C32 · Tier 2 · Verified
> "A prover produces an answer. A verifier determines whether the answer is acceptable. Training can reward the prover not only for correctness but for producing reasoning that weaker verifiers—and, indirectly, humans—can inspect more reliably.[24]" (§VI)
- **Finding:** Matches. Kirchner et al., "Prover-Verifier Games improve
  legibility of LLM outputs" (arXiv:2407.13692, 2024): smaller verifier
  checks solutions; helpful prover trained to produce correct, verifiable
  solutions (against a "sneaky" prover); "legibility training transfers to
  time-constrained humans tasked with verifying solution correctness …
  human accuracy increases when checking the helpful prover's solutions."
- **Evidence:** [arXiv:2407.13692](https://arxiv.org/abs/2407.13692) — title,
  Jan Hendrik Kirchner, mechanism and human-transfer quotations.
- **Fix:** none.

### C33 · Tier 2 · Verified
> "The original proposals for AI debate were motivated partly by the hope that opposing systems could expose decisive information to a human unable to evaluate a complex answer directly.[25]" (§VI)
- **Finding:** Matches. Irving, Christiano, Amodei, "AI safety via debate"
  (arXiv:1805.00899, 2018): direct human judgment "can fail if the task is
  too complicated for a human to directly judge"; in debate, "two agents
  take turns making short statements … then a human judges which of the
  agents gave the most true, useful information." Ref [25]'s author list
  matches.
- **Evidence:** [arXiv:1805.00899](https://arxiv.org/abs/1805.00899) — title,
  authors, quotations.
- **Fix:** none.

### C34 · Tier 2 · Verified
> "Early multi-agent-debate experiments also reported improvements on factual and reasoning tasks.[26]" (§VI)
- **Finding:** Matches. Du et al., "Improving Factuality and Reasoning in
  Language Models through Multiagent Debate" (arXiv:2305.14325, 2023):
  "multiple language model instances propose and debate their individual
  responses and reasoning processes over multiple rounds"; the approach
  "improves the factual validity of generated content, reducing fallacious
  answers and hallucinations" and enhances reasoning. The draft's "reported"
  framing is apt given the later deflationary literature it cites (C7, C10).
- **Evidence:** [arXiv:2305.14325](https://arxiv.org/abs/2305.14325) — title,
  Yilun Du, quotations.
- **Fix:** none.

### C35 · Tier 2 · Verified
> "They encounter an intelligible order and fail to comprehend it. They hear, but do not hear rightly." (§I)
- **Finding:** Tracks fragments B1 and B34 as the brief suspected. SEP's
  B1: "Of this Word's being forever do men prove to be uncomprehending,
  both before they hear and once they have heard it." B34: "Having heard
  without comprehension they are like the deaf; this saying bears witness to
  them: present they are absent." The draft's unquoted gloss is a fair
  compression of both.
- **Evidence:** [SEP, "Heraclitus"](https://plato.stanford.edu/entries/heraclitus/) —
  B1 and B34 translations.
- **Fix:** none.

### C36 · Tier 2 · Verified
> "The theological history of the Logos would later add other meanings: rational order, divine wisdom, the Word through which form enters the world." (§I)
- **Finding:** Fair as compressed history. The Stoics made logos "the
  active divine principle animating existence" / "the fundamental ordering
  force of reality" (rational order); Philo of Alexandria treated logos as
  divine intermediary and "the bond of everything, holding all things
  together" (divine wisdom); John's Gospel: "In the beginning was the Word,
  and the Word was with God, and the Word was God" (the Word). The draft's
  three-item list maps cleanly onto Stoa–Philo–John.
- **Evidence:** [Wikipedia, "Logos"](https://en.wikipedia.org/wiki/Logos) —
  Heraclitus, Stoic, Philonic, and Johannine passages as quoted.
- **Fix:** none.

### C38 · Tier 3 (spot-check) · Verified
> "A court does not normally ask prosecution and defense to transcend their partiality… It assigns opposed roles… Witnesses are examined and cross-examined. Burdens of proof are allocated. Rules limit what counts as admissible. Advocacy is separated from judgment. Decisions can sometimes be appealed." (§IV)
- **Finding:** Standard, accurate description of the adversarial system:
  "two advocates represent their parties' case or position before an
  impartial person or group of people, usually a judge or jury," with a
  neutral decision-maker, party presentation of evidence, and structured
  procedural rules; judges referee rather than investigate (contrast with
  inquisitorial systems). The draft's caveats (procedural victory ≠ truth;
  courts pursue values beyond accuracy) make the characterization safer,
  not riskier.
- **Evidence:** [Wikipedia, "Adversarial system"](https://en.wikipedia.org/wiki/Adversarial_system) —
  quotation and three basic features.
- **Fix:** none.

### Skipped

- **C37 · Tier 3** — "Medieval scholasticism is often remembered as the
  image of intellectual confinement…" A characterization of a reputation,
  immediately qualified by the draft itself ("There is truth in the
  caricature… No serious history should…"). Nothing checkable beyond
  plausibility; plausible on its face. Not checked further.
- **C39 · Tier 3** — "Contemporary systems divide research among parallel
  agents…" General engineering claim wholly instantiated by the two named
  systems, both verified (C2, C4). No independent check needed.
