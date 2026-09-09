# Voice Print, Structure Repertoire, Lexicon (Phase 2)

What to measure, what to describe, and how to record both so that
`draft-from-outline` gets *constraints* rather than adjectives, and so that the
Phase 5 audits can count rather than opine.

The governing rule: **every line in these files is either a measurement with its
sample, or a description with a quoted instance.** A sentence that is neither is
removed.

## 1. `voice-print.md`

### 1.1 Measured features

Compute across the sampled corpus (never including the hold-out). For each,
record the value, the sample it came from, and the method — exact count or
estimate from sampled passages. Both are acceptable; conflating them is not.
If the extraction or measurement method changes mid-run (a fixed bug, a
different text scope), recompute and rewrite **every figure already recorded**
— corpus-level aggregates included; mixing the outputs of two method versions
in one table is how a profile acquires confident numbers nobody can reproduce.

| Feature | Record as |
|---|---|
| Sentence length | median, interquartile range, max; and the *shape* (e.g. bimodal: long builds punctuated by 4–8-word declaratives) |
| Paragraph length | median sentences, range; whether one-sentence paragraphs occur and how often |
| Piece length | median and range, by piece type |
| Section length | median words per section; sections per piece |
| First person | occurrences per 1,000 words; what it is used for (methodological asides? confession? never?) |
| Second person | occurrences per 1,000 words; direct address of the reader |
| Questions | per 1,000 words; rhetorical vs. genuine |
| Em-dash | per 1,000 words; parenthetical vs. emphatic use |
| Colon / semicolon | per 1,000 words |
| Parentheses | per 1,000 words |
| Quotation | how often the author quotes, at what length, and whether block or inline |
| Apparatus | headers, lists, tables, footnotes, epigraphs — per piece |
| Sentence openings | distribution of the most common opening forms (subject-first, conjunction, subordinate clause, "It is/There are") |

### 1.2 Register, described with evidence

Two to five paragraphs, each anchored to at least one quoted instance:

- **Diction level** and its consistency; where it deliberately drops or rises.
- **How emphasis is achieved** — syntax, position, repetition, brevity, italics?
- **How abstraction and concretion alternate** — does an abstract claim get an
  example within a sentence, a paragraph, a section, or never?
- **Stance toward the reader** — instructing, thinking aloud, arguing,
  confiding, diagnosing.
- **Tolerance for uncertainty** — hedged or declarative; how the author signals
  that something is contested.

### 1.3 Signature moves, with rates and rations

One row per move. The rate is the whole point: a move at 2 per essay becomes a
parody at 9, and imitation systematically over-produces.

| Move | Observed rate | Exemplar | Ration for a new piece |
|---|---|---|---|
| Inversion ("They do not eliminate X; they relocate it") | ~4 per 4,000 words | "<≤40 words>" | ≤5, and never two in a paragraph |
| Aphoristic section close | most sections | "<…>" | keep, but not every section |
| Named-thinker pivot mid-argument | 1–2 per essay | "<…>" | ≤2, and only where the thinker does work |

### 1.4 Anti-signature

What the corpus demonstrably does **not** do, stated as prohibitions a drafter
can check: no listicles; no exclamation points; no second-person address; no
footnotes; no headline questions; no scare quotes; no throat-clearing openings.
Include, for each, the evidence ("zero instances across 7 pieces / ~34,000
words").

Then the **hazard overlap**: which items on the model-register hazard list
([`draft-from-outline`'s prose standards §5](../../draft-from-outline/references/prose-standards.md))
this author's genuine habits resemble — the dangerous cases, because a drafter
imitating the persona and a drafter falling into machine register will produce
the same sentence. Name them explicitly so the ration is enforced rather than
excused.

## 2. `structure-repertoire.md`

How pieces are built, with the pieces that exemplify each pattern:

- **Opening patterns** observed, in order of frequency, each with the piece it is
  from and the first sentence quoted. Include what the opening *withholds* — many
  strong essayists delay the thesis by a known distance; measure it ("thesis
  arrives ~350–600 words in, after the mistaken view is stated").
- **Section grammar:** numbered or titled or unmarked; header style (nominal
  phrases? questions? single words?); typical section count; whether sections are
  argumentative stages or topical bins.
- **Middle-game moves:** where concessions go, where the strongest counterargument
  appears, whether historical or theoretical material is front-loaded or
  interleaved.
- **Ending patterns:** what the last paragraph does, quoted; whether the piece
  resolves, refuses, widens, or returns to the opening image.
- **Title and subtitle grammar:** the actual pattern ("`The <Abstract Noun> of
  <Abstract Noun>` + subtitle beginning `Toward…`" or "`<Verb>ing the
  <Noun>`"), with all observed titles listed so a drafter can pattern-match.
- **Length and pacing norms**, and the venue's expectations where they differ.
- **Apparatus norms:** what appears, what never does, and the citation practice
  (none, inline links, endnotes) — including where the human has overridden the
  venue's native practice.

## 3. `lexicon.md`

- **Conceptual vocabulary:** the terms the author reuses across pieces, each with
  the sense they give it and the piece where it was introduced. This is often the
  most valuable file in the profile: a persona's toolkit is a small set of
  concepts doing repeated work, and using them correctly is most of sounding like
  them.
- **Characteristic connectives and qualifiers** — the actual transition words this
  author uses, since transitions are where imitations most obviously fail.
- **Names and canon:** thinkers, schools, and works cited across the corpus, with
  frequency. A drafter should know whose company this writing keeps.
- **Absent vocabulary:** words and constructions conspicuously missing, with the
  zero-instance evidence. Include the near-misses — words the author uses *once*
  are not signature vocabulary.

## 4. Recording conventions

- Every file opens with: corpus coverage (pieces read / corpus size), date, and a
  pointer to `provenance.md`.
- Every measurement carries its sample and method.
- Every description carries a quoted instance and its source slug.
- Where the corpus is too small to support a claim, write the claim as a
  hypothesis with the evidence available and mark it `low-confidence`.
  Downstream skills are instructed to treat low-confidence lines as advisory.
- Nothing in these files is prescriptive about the *next* piece except the
  ration column and the anti-signature list, both of which are derived from
  measured rates. Authorial intent belongs in the seed.
