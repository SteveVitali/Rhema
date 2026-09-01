# Calibration Protocol (Phase 4)

The held-out fidelity test: the step that turns a persona profile from an
assertion into a measured claim. Everything here is written to
`profile/calibration.md`.

## Why a hold-out at all

A profile synthesized from a corpus will always *look* right to the agent that
synthesized it, and the literature on stylistic personalization is blunt about
how large the residual gap is: inference-time methods (few-shot exemplars,
extracted style profiles, contrastive prompting) improve trait-level and
judge-level similarity while scoring *below a cross-author baseline* on trained
authorship verification, and the common metrics correlate with each other barely
at all ([authorship-gap evaluation][gap]); stylometric analysis of a frontier
model imitating distinctive literary voices finds in-context examples improve
alignment while the imitations still cluster with generic model output
([stylometric imitation study][stylo]).

So the question is not "did we capture the voice" (no) but **"where exactly does
the profile fail, and by how much"** — which is answerable, per persona, with one
piece the profile never saw.

## Protocol

### 1. Predict (before reading anything)

Inputs allowed: the profile you just wrote, plus the hold-out's **title,
subtitle, publication date, and a one-line topic** from the census. Nothing else
— not the piece, not its comments, not a summary of it, not another article about
it.

Draft **400–600 words of its opening** as the persona would write it, honoring
the profile's measured targets and rations. Save it verbatim under
`## Prediction` with a note of the inputs used. Do not revise it after reading
the real piece — it is evidence, not a draft.

Where Phase 0 reserved a **second hold-out** (corpora of ten or more), predict
only the primary. Read the second after step 2 as an unpredicted coverage
check: what does it contain that the profile has no category for? Record what
it falsifies under its own heading; it tests the profile's coverage, not the
prediction.

### 2. Read the real piece

Now fetch and read the hold-out in full. Write its corpus note as usual
(`references/corpus-note.md`), marked as the calibration piece.

### 3. Compare, measured

| Feature | Profile target | Prediction | Actual (hold-out) | Verdict |
|---|---|---|---|---|
| Sentence-length median | 24 | 21 | 27 | prediction ran short |
| Paragraph median (sentences) | 4 | 3 | 5 | short |
| First person per 1,000 w | 0.4 | 1.8 | 0.3 | **over-produced** |
| Em-dash per 1,000 w | 3 | 9 | 2 | **over-produced** |
| Signature inversion count | ≤2 in 500 w | 4 | 1 | **over-produced** |
| Thesis arrival (words in) | 350–600 | 120 | 540 | arrived far too early |
| Apparatus | none in openings | 1 header | none | violated |

Over-production of signature features and premature thesis delivery are the two
most common failures; both are fixable by ration and by structural instruction,
which is why they are measured rather than described.

### 4. Compare, qualitative

Four questions, answered with quotations from both texts:

1. **What move did the real opening make that the prediction did not?** (Most
   informative single line in the whole test.)
2. **What did the prediction do that the corpus never does?**
3. **Where did the register overshoot** — more emphatic, more aphoristic, more
   formal, warmer, more hedged?
4. **What does the real piece assume of the reader** that the prediction
   explained?

### 5. Correct the profile

Every divergence resolves to one of:

- **A measurement error** → fix the number, note the correction and its evidence.
- **A missing pattern** → add it to `structure-repertoire.md` or the signature
  table, cited to the hold-out.
- **A ration failure** → tighten the ration and record the observed-vs-produced
  rates, since this is the number a drafting audit will check.
- **An irreducible gap** → record it in `index.md` as a known limit. Some things
  (a specific mind's choice of example, the particular thought a paragraph
  arrives at) are not recoverable from a profile, and pretending otherwise
  produces confident pastiche.

Corrections go into the derived profile files. Anything that is an *authorial*
decision rather than an observation goes to the human, in the report and the
appended seed note.

### 6. Optional blind check

Where the harness supports subagents: give a fresh context the two openings,
unlabeled and lightly normalized (same headers, same length), and ask which was
written by the author of a named corpus — supplying two or three *other* short
excerpts from the corpus as reference, never the profile.

Record the verdict **and the stated reasons verbatim**. The reasons are the
useful part; treat the verdict as one weak observation. A single blind trial by a
model that shares weights with the generator is not evidence of quality, and the
profile must not report it as a score. Its value is diagnostic: the reasons name
the tells.

## What `calibration.md` must contain

```markdown
# Calibration — <persona slug>

- **Hold-out:** <title> (<url>) · published <date> · reserved at census, read <date>
- **Inputs to the prediction:** title, subtitle, date, one-line topic, profile v<date>
- **Result in one sentence:** <plainly, how close it got>

## Prediction
<the 400–600 words, verbatim>

## Measured comparison
<the table>

## Qualitative divergences
<the four questions, with quotations>

## Corrections made
| Divergence | Change | File | Evidence |

## Known limits (carried to index.md)
- <what this profile cannot supply>

## Blind check (optional)
- Verdict: <…> · Reasons, verbatim: "<…>"
```

## Refresh mode

On `mode: refresh`, the newest unread piece is the hold-out, which makes the test
do double duty: it calibrates the profile *and* detects drift. If the new piece
diverges from the profile in a consistent direction (longer, plainer, less
apparatus), that is a corpus-level change, not a profile error — record it as
drift in `voice-print.md` with both the old and new measurements, and note the
date the shift becomes the default.

[gap]: https://arxiv.org/abs/2604.26460
[stylo]: https://doi.org/10.1093/llc/fqaf035
