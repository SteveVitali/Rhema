# Drafting note — v1, 2026-09-16

`draft-from-outline` run against persona `the S. J. Sebastian corpus` (profile built
2026-08-20, refreshed 2026-09-16, verdict fresh; resolved via the workspace
personas directory). Source: `agents/author/outline/the-governable-mind-pass-iii-article-spec.md`
(the writer's "Pass III article specification"). Autonomous run; no
`guidance`, `length`, `venue`, or `register` inputs were supplied, so each
was inferred and is declared below.

## The piece as drafted

- **Title:** *The Governable Mind* — *Artificial Intelligence, Cognitive
  Liberty, and the Constitutional Limits of the Legible Mind* (the outline's
  stated preference over *Permissioned Cognition* and *The Externalized
  Conscience*).
- **Thesis:** liberalism was built around a boundary between inward judgment
  and governable conduct; artificial intelligence moves important parts of
  judgment across that boundary into technical systems where they become
  recordable, classifiable, and permissionable; the constitutional problem
  is therefore how to govern dangerous artificial capability without making
  lawful human cognition itself governable. Second thesis: open and locally
  executable models matter as *epistemic exit*, regardless of market share.
  The qualification (a capable model is also an operational instrument) is
  built in from the prologue.
- **Length:** ~11,800 body words plus 50 numbered references (target
  11,500, tolerance 12,000; the outline advised 12,000–16,000; the corpus
  ceiling is 12,250).
- **Shape:** epigraph (Milton, *Comus*, l. 663), unnumbered opening ("The
  Double Revelation"), fifteen roman-numeral sections, unnumbered coda ("The
  Last Private Domain") that returns the epigraph in its last sentence.
  Register: analytic-philosophical (the corpus's register 2), opened by a
  documented miniature from OpenAI's and Hugging Face's own publications.

## Decisions among the outline's alternatives

- Title and epigraph as above. The epigraph's wording verified against the
  1645 text (l. 663; "minde"/"rinde"); quoted in modernized spelling.
- Cross-references to the three predecessor essays adopted, in the corpus's
  one attested form: relative reference in prose ("an earlier essay in this
  series," "the previous essay"), titles and URLs only in the References
  ([14], [22], [10] after renumbering). See open question 1.
- The §XI layer table rendered as five short paragraphs; the §XII test as
  seven titled paragraphs; no `<h3>` subsections; no lists, tables, or bold.
- Three coinages marked ("Call it…"): *externalized forum internum*,
  *cognitive legibility*, *epistemic exit*. *Cognitive record*, *probability
  shaping*, *constitutional half-life*, *permissioned cognition*, and the
  *public-private cognitive-security complex* are used once or twice,
  unmarked, per the outline's own instruction. "Cognitive federalism" appears
  in the §XV header and once in its text.

## Deviations from the outline (fidelity: adaptive; full log in the plan)

1. Church Committee reduced to one paragraph referring to the previous essay
   (settled ground in the corpus).
2. Scott's legibility compressed to a sentence plus the cross-reference (same
   reason).
3. Length ~11,800 rather than 12,000–16,000 (corpus ceiling; compression
   falls on settled ground).
4. Section sequence otherwise as the outline gives it; the re-budgeting is
   the departure, not the order.
5. The outline's advice that §VIII "correct the social-credit caricature"
   was narrowed after verification (below).

## Cuts (recoverable; in the plan's cut list)

Balkin and Mann (verified, unused); Russia at paragraph length (kept to one
paragraph); the nine-item "intermediary can affect" list (compressed to
five); the fourteen-item plural-society list and the seven exit mechanisms
(each to a sentence); the Cambridge handbook and the Bublitz & Blitz volume
(bundled into reference [17] with one clause of prose).

## Verification: what changed under checking

All 58 inventoried claims were checked against fetched sources by six
research subagents (110 source notes in `agents/author/research/`); two
rows were added during drafting. Every outline citation carried
a deep-research tracking parameter and started at zero trust. Nothing was contradicted
outright, but verification changed the draft in these places:

- **The Hugging Face incident:** OpenAI's models compromised OpenAI's own
  research infrastructure as well as Hugging Face's; the hosted models that
  refused the forensic work were Anthropic's, per Hugging Face's own
  timeline, not OpenAI's; the "inversion" reading is on the record from
  Hugging Face and its CEO, and the FT piece the outline cited could not be
  opened, so the FT is not cited. The prologue's symmetry was rewritten
  accordingly (reduced control was the danger; another company's intact
  control was the obstacle). Hugging Face's interest as an open-model
  platform is disclosed in the text.
- **Shklar:** the outline's "Edward Hall, *Political Studies* 2023" DOI
  resolves to a republished Shklar lecture with a Hall & Sleat foreword;
  the draft cites the 1989 Rosenblum volume instead.
- **Bayle:** the "sincere persecutor" is the classic objection to Bayle (the
  Persecutor Paradox), not his argument; the draft presents his doctrine,
  the objection, and Forst's reciprocity reading in that order.
- **Berlin:** the outline's "area within which a man can act unobstructed by
  others" does not occur in the 1958 lecture; the question form is quoted.
- **Stationers' Company:** the extended search powers date to Privy Council
  ordinances of 1566, not the 1557 charter; the 1662 Licensing Act was in
  force only 1662–79 and 1685–95; the 1643 instrument is the Ordinance of
  14 June 1643. Deazley's and Clegg's caution (Tudor censorship "ad hoc and
  reactive") is carried in the text.
- **Social credit:** the outline's source (Liang et al. 2018) supports
  "primarily financial and commercial rather than political" but not
  "fragmented, no single score"; the draft says only what the source
  supports and separates the Platform from the headline "social credit
  system."
- **Lessig:** the *Harvard Magazine* essay does not state the four-modality
  framework; that is attributed to *Code* (1999); an omitted sentence in the
  quotation is marked with an ellipsis.
- **International AI Safety Report:** its open-weight benefits are "research,
  innovation, and access," not "research, privacy, competition"; the report
  (February 2026) predates the incident, and the draft says so.
- **Penney:** the chilling figure is given as "roughly a fifth" (19.5%) with
  the model's ~30% immediate drop and the author's own no-control-group
  caveat.
- **Orwell:** the Newspeak appendix's own qualifying clause ("at least so
  far as thought is dependent on words") is quoted; it strengthens the
  refusal to read Orwell as a cognitive scientist.
- **The predecessor essay** says "no finite *mind* can safely identify itself
  with reason," not "finite reasoner."

## Unverified-claims list

**None shipped.** Zero `[unverified]` marks; every citation resolves to a
Verified or Substantially-accurate ledger row used at its rescoped strength.
Provenance flags for the next round:

1. Shklar (1989) and Scott (1998) page numbers were confirmed against online
   reproductions, not print; pin them before publication.
2. HRW's Xinjiang report was read via the ecoi.net mirror (hrw.org returned
   403); re-check wording against hrw.org.
3. The Clegg Oxford Handbook chapter could not be opened; its point is
   attributed via Deazley's commentary.
4. The Zuckerberg quotation is as carried by CNBC/RTÉ (the X post returned
   403); the OpenAI/Reuters wording is from the wire syndication and OpenAI's
   own post.
5. The Stasi surveillance taxonomy is cited to the Bundesarchiv's German
   finding aid and MfS-Lexikon, not the English introduction page the
   outline cited.

## What the audit left (report, not fix)

Fresh-context fidelity audit, three iterations (the maximum). Iteration 1:
"deliverable after listed fixes," six majors (prologue symmetry
counterfactual; unledgered Orwell quotation; social-credit sourcing; five
outline stage directions surfacing in prose; the §XV thinker roll-call as
bullet-ghost; coinage over-marking) — all closed. Iteration 2: one major
left (thirteen self-directive sentences) — eleven cut, two rewritten in
iteration 3. Iteration 3: "deliverable after listed fixes"; the four
clause-level edits were applied; no further audit run. Remaining, in the
audit's own terms:

- **Texture:** parenthetical asides 0.25/1k against the register-2 model
  piece's 2.7; colons 6.7/1k against 9–12; one-sentence paragraphs ~12–15%
  against 14–20%; sentences ≥40 words ~11–14% against ≤10% (at the
  *Visibility* high). The audit's phrase: "commas-and-colons where the
  persona's long form uses parentheses." Not forced, because inserting
  parentheses to hit a rate is the imitation failure the calibration file
  warns against.
- **Proportion:** §I is the longest section (~1,280) and §XIII, the
  diagnosis, the shortest (~305 against 450). The outline weights the
  history heavily and asks that §XIII be precise; the audit judges the
  climax lean.
- **Self-narration:** "this essay"/"the essay" now ~1.9/1k (inside the
  *Visibility* band); 22 intra-essay section references; the audit flags the
  density as high even where the corpus permits the device.
- **§XV** is now an argument by chained insufficiency rather than a
  roll-call, but the seven thinkers still appear in the outline's order.
- **Prologue ¶3** paraphrases ¶2's guardrail point; a light repetition.
- The audit's first read broke at §III's freedom-of-thought literature
  paragraph (now shortened) and found the third layer's question in §XI
  unanswered (now answered in §XII).

## Open questions for the human

1. **Self-citation.** The corpus's essays have never cited each other; this
   draft refers to three predecessors in the attested relative form. Keep,
   or strip to nothing (easy: six sentences).
2. **Length.** ~11,800 against the outline's 12,000–16,000. If the writer
   wants the longer piece, the natural growth is §§XIII–XIV (the diagnosis
   and the imagined system), not the history.
3. **Naming companies and executives.** §X and the prologue name OpenAI,
   Anthropic, Meta's CEO, and Hugging Face from their own published
   statements, without imputing motives. The prologue names Anthropic's
   models as the ones that refused the forensic work, because Hugging
   Face's timeline does. Whether the author has an interest to disclose is
   not known to this agent; the corpus's habit ("interest, disclosed")
   suggests a sentence if so.
4. **The legibility ladder** (§VII) uses "a person … she"; the outline's form
   was second-person questions ("Who are you?"). The persona's long form
   permits voiced questions; the draft chose the third person after the
   audit counted the second person as authorial.
5. Whether the four unused verified sources (Balkin, Mann, the Cambridge
   handbook, the Bublitz & Blitz volume) should be restored as references.

## Natural next step

An `editorial-review` round on `drafts/v1.md`.
