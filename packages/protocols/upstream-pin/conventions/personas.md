# Personas — the library, the seed, the profile, the rules

A **persona** is a portable description of a writing identity: how a body of
work sounds, how it is built, what it has already argued, and where its
published corpus can be read. Skills in this repo take a persona as an input so
that generated prose can be made to fit an existing body of work — the
operator's own, a venue's house style, or (under the rules below) someone
else's.

Personas are **cross-project by construction**. Project memory
([`project-memory.md`](project-memory.md)) holds one piece as it moves through
review rounds; a persona outlives every project and is shared by all of them.
That is the whole reason it is not stored inside a project directory.

## The simplest thing that works

One **directory per persona**, named by its id, containing one required file:
`PERSONA.md` — a description plus pointers to example writing. Nothing else is
required, and every skill must work with only this:

```
<personas_dir>/
  sjs-substack/
    PERSONA.md
  sjs-academic/
    PERSONA.md
    docs/                 # optional: corpus files not on the open web
  house-lrb/
    PERSONA.md
```

The directory is the unit because a persona accretes: local source files, then a
derived profile, then per-piece notes. A single flat file forces a migration the
first time any of that arrives, and migrations are where paths go stale. One
predictable entry filename — `PERSONA.md`, as `SKILL.md` is for skills — means an
agent pointed at `personas/` can list the directories and know where each one
starts.

```markdown
# sjs-substack

- **Name / byline:** S. J. Sebastian
- **Mode:** self                      # see "Modes and ethics" below
- **Corpus:** https://sjsebastian.substack.com/archive (all essays; ~7 as of 2026-08)
- **Also:** docs/*.md (older essays, supplied locally)

Philosophy, cultural commentary, the history of ideas. Continuous
argumentative prose in roman-numeral sections; begins from a conceptual error
and replaces it with a more exact model; ends on a stated fact rather than a
judgment. Minimal apparatus — no footnotes natively. First person is rare and
deliberate.

**Never:** listicles, tables, exclamation points, hedge stacks.
```

The only structural requirements are the `# <persona-id>` heading, a **Corpus**
pointer of some kind (URL, `docs/`, another local path, or "none — description
only"), and a **Mode**. Everything else is free prose: the seed is a human
document and the human is its author.

## `docs/` — corpus files supplied by hand

Optional. Where the corpus is not on the open web — manuscripts, PDFs, drafts,
platform exports, anything behind a login — the operator drops the files in
`<persona-id>/docs/` and points **Corpus** at them. Relative paths in
`PERSONA.md` resolve against the persona directory, so the whole persona stays
portable: move or share the directory and its corpus travels with it.

- **`docs/` is human-supplied and agent-read.** A skill reads it; a skill does
  not write to it. Filenames as delivered are fine — they are often the only
  metadata a manuscript has — and where publication dates matter, `PERSONA.md`
  or the bootstrap census records them.
- **Never dump fetched pages into it.** The excerpt rule below governs
  everything an agent stores; `docs/` is an exception for material the human
  already holds, not a licence to mirror a website.
- **Where the harness cannot read a format** (a PDF with no extractable text, a
  `.docx`, a scan), the skill says so per file rather than guessing at its
  contents, and the coverage fraction reflects it.

## The bootstrapped form

A seed is a description; a **profile** is derived, structured knowledge — the
one-time (refreshable) product of `bootstrap-persona`, so that later agents can
write to the persona *without re-researching the corpus*. It is written into the
same directory:

```
<personas_dir>/<persona-id>/
  PERSONA.md                 # the seed: human-authored, authoritative, required
  docs/                      # optional — corpus files supplied by the operator
  profile/                   # DERIVED — regenerable, never hand-tuned in place*
    index.md                 #   hub: what exists, how to load it, staleness verdict
    voice-print.md           #   measured + described: sentence/paragraph shape, punctuation
                             #   rates, register, signature moves, tics to ration
    structure-repertoire.md  #   how pieces are built: openings, section grammar, endings,
                             #   title/subtitle conventions, apparatus norms, length norms
    lexicon.md               #   signature terms and their meanings; words this author avoids
    exemplars.md             #   short quoted excerpts chosen as calibration targets, each
                             #   with what it demonstrates (see the excerpt rule below)
    positions.md             #   recurring theses and commitments, with the piece each is from
    continuity.md            #   what has already been argued where — for cross-reference,
                             #   and to avoid repeating or contradicting the corpus
    audience-and-venue.md    #   platform mechanics, publication cadence, reader expectations
    calibration.md           #   the held-out fidelity test: prediction, actual, corrections
    provenance.md            #   every piece read, URL or docs/ path, accessed date, coverage
    corpus/
      index.md               #   one line per piece note
      <piece-slug>.md        #   per-piece note (structure map, moves, exemplar quotes)
```

\* Corrections belong in `PERSONA.md` (they are authorial decisions and must
survive a re-bootstrap) or in `profile/calibration.md` (they are findings).
One exception: calibration corrections (`bootstrap-persona` Phase 4) are
written into the derived files themselves, each carrying an inline
"Corrected after calibration" note and a matching entry in `calibration.md` —
the logging is what keeps the provenance honest. Hand-editing a derived file
silently is how a profile starts lying about its own provenance.

**Legacy layout.** A persona found as a flat `<personas_dir>/<id>.md` is valid
input; the first skill that writes to it moves it to `<id>/PERSONA.md` unchanged
and says so. A persona directory with no `profile/` is also valid input — a
skill that finds one simply operates with less.

## Resolution

`persona` is an input naming a persona id (`sjs-substack`), a path (to the
persona directory or its `PERSONA.md`), or a URL to a corpus. For an id, search
for `<personas_dir>/<id>/PERSONA.md` — then, as a fallback, the legacy flat
`<personas_dir>/<id>.md` — in this order, and **state in the deliverable which
was used**:

1. an explicit `personas_dir` input;
2. `personas/` next to the project directory (`<project_dir>/../personas/`),
   then walking up — projects are often grouped under a `projects/` directory,
   so `<project_dir>/../../personas/` is the common case;
3. a `personas/` directory at the workspace root (in this repo, the operator's
   local `agent-scratch/personas/`, with projects under
   `agent-scratch/projects/`);
4. `~/.agent-discourse/personas/`.

If the id resolves to a seed with no `profile/`, use the seed and say so — do
not silently launch a corpus research pass inside another skill's run;
`bootstrap-persona` exists for that and the operator chooses when to pay for it.
If nothing resolves, derive an ad-hoc voice specification from whatever the
piece and inputs supply, label it as ad-hoc, and continue. **Never block on a
missing persona, and never invent a persona's positions.**

## What loads when (progressive disclosure)

A profile is bigger than any one task needs. `profile/index.md` is the hub; the
rest loads by role:

| Consumer | Loads | Why |
|---|---|---|
| `draft-from-outline` | `voice-print`, `structure-repertoire`, `lexicon`, `exemplars`, `audience-and-venue`, plus `continuity` when the piece may cross-reference prior work | Writing needs exemplars and measurable targets, not the whole corpus |
| `respond-to-review` | `voice-print`, `lexicon`, `exemplars` | The voice charter is seeded/checked against the persona; taste ties resolve to it |
| `editorial-review` | `structure-repertoire`, `audience-and-venue`, `positions`, `continuity` | Venue bar and the fit/continuity assessment — *not* `voice-print`, which would turn a review into a conformity check |
| `bootstrap-persona` (refresh) | `provenance`, `calibration`, then everything it rewrites | Reuse before recompute |

**For a composite persona** (see below), the same table applies with one
substitution: every voice file resolves to **one selected member**, while
`positions` and `continuity` come from the composite. So `editorial-review`
loads the composite's union directly — the whole body of work is exactly the
context it wants — while `draft-from-outline` and `respond-to-review` must first
select a register and say which one they selected.

## Persona vs. voice charter

They are different objects and must not be merged:

- A **persona** is a *prior over a body of work* — durable, cross-project,
  descriptive of many pieces.
- A **voice charter** (`agents/author/voice-charter.md`, per the project-memory
  convention) is a *contract for one piece* — its thesis commitments, its
  protected passages, the register it has actually established.

Precedence: **human guidance > voice charter > persona > model default.** A
piece may deliberately depart from its persona (a philosopher writing a
reported narrative); the departure is recorded in the charter, and the persona
is not thereby amended. A persona changes only when the human changes the seed
or a `bootstrap-persona --refresh` observes a real corpus-level shift.

The editor's use is deliberately narrower than the author's. An editor may hold
a piece to the venue's bar and flag drift from the body of work ("this
contradicts what you argued in *After Bureaucracy* without acknowledging it";
"this is the fourth piece to open on the same move"). An editor may **not**
treat persona divergence as a defect in itself — conformity is not a quality
criterion, and a reviewer that enforces a voice print becomes a style police
rather than a critic.

## One writer, several personas

A persona is a **register**, not a person. One human who writes essays for a
Substack and journal-style manuscripts for an academic page has two personas, not
one, and merging them produces a profile whose measurements are averages of two
distributions — which describes neither.

- **Separate ids, separate directories.** `sjs-substack` and `sjs-academic` are
  siblings; each `PERSONA.md` names the other, so an agent that loads one knows
  the other exists.
- **Structure and apparatus norms never cross.** Loading one persona's voice
  print while drafting under another is exactly the averaging error above.
- **Substance may cross, on instruction.** Positions the same author argued in
  another register are things they have committed to in print: an essay may cite
  its author's own paper, and an editor may flag a contradiction with it. But the
  crossover is an explicit instruction (`guidance`, or a second persona named for
  positions only) — never an automatic merge, and never for a non-`self` persona.

## Composite personas

The body of work as a whole is also a real object: the author of both registers
has one set of positions, one continuity record, one byline. A **composite
persona** names that whole. It is a **union of its members, never an average of
them**, and the distinction is the entire design:

```markdown
# all-sjs

- **Name / byline:** S. J. Sebastian
- **Mode:** self
- **Members:** sjs-substack, sjs-academic
- **Corpus:** the union of its members' corpora — none of its own
```

Rules:

- **A composite has no voice of its own.** No `voice-print.md`,
  `structure-repertoire.md`, or `exemplars.md` at composite level. A skill that
  needs a voice **resolves to exactly one member** — from the `register` input if
  given, else the venue, else the piece type via the composite's register map —
  loads that member's files, and **states which member it used**. If the register
  is genuinely ambiguous, say so and pick the member whose corpus the piece most
  resembles; never blend two.
- **What a composite legitimately owns is substance:** `positions.md` and
  `continuity.md` unioned across members, each entry still carrying its member,
  its piece, and its citation. This is the standing form of the cross-register
  crossover described above — and for an editor it is the most useful persona
  there is, because contradiction and repetition do not respect registers.
- **Optionally, `shared-lexicon.md`:** terms attested in *both* members, with
  each member's usage. A term used in only one register does not belong here;
  that is how academic jargon leaks into essays.
- **A composite is composed, not researched.** Its profile is built from its
  members' profiles, not from re-reading the corpus; if a member has no profile,
  the composite says so and covers what it can. Its staleness verdict is the
  worst of its members'.
- **Mode is the most restrictive of its members**, and a composite may not add
  permissions its members do not have.
- **Members are leaf personas.** No composite of composites — the routing rule
  must terminate.

A composite's own file layout is the ordinary one (`PERSONA.md`, optional
`profile/`); it simply has fewer files in `profile/`, plus `register-map.md`
recording how a piece routes to a member.

## Modes and ethics

Every persona declares a **Mode**, and the mode governs what may be done with
it:

| Mode | Meaning | Permitted |
|---|---|---|
| `self` | The operator's own body of work | Everything: draft, publish under the byline |
| `consented` | Another writer's work, used with their permission (note it) | As the permission says |
| `house` | A venue's or tradition's style, not an individual's | Register and structure calibration; the piece is published under its real author's name |
| `study` | A writer's corpus used to understand or emulate craft, without consent for publication | Analysis, exercises, explicitly labeled pastiche |

Rules that hold in every mode:

- **No deceptive attribution.** Text generated against a persona is never
  presented as that person's own writing, and never published under their name,
  absent `self` or explicit permission. `study` output is labeled.
- **Notes, not corpora.** A profile stores *distilled notes and short
  excerpts*, never wholesale copies of the source texts — for the same reason
  project memory never persists raw fetched pages (staleness, bulk, and the
  fact that the durable value is the distillation). Excerpts are the length a
  critic would quote: a sentence or two, up to ~40 words, each with a stated
  analytical purpose and its source URL or `docs/` path. The one exception is
  `docs/`, which holds files **the operator put there**; an agent reads it and
  never adds to it.
- **Respect access.** Public pages only; honor paywalls, `robots.txt`, and
  platform terms. Material the operator supplies in `docs/` is theirs to
  supply — and for a non-`self` persona, supplying it does not enlarge what the
  mode permits.
- **Living people are not instruments.** A persona of a non-consenting living
  writer may inform register and structure; it may not be used to manufacture
  positions they do not hold, and `positions.md` for a non-`self` persona
  records only what they demonstrably argued, quoted and cited.
- **The human owns the byline.** Persona conditioning is a drafting aid. No
  skill in this repo publishes.

## Provenance and staleness

A living corpus grows, so a profile is a dated observation, not a fact:

- `provenance.md` records, per piece read: title, URL, publication date,
  accessed date, and its role (sampled / held out / skipped, with reason). It
  also records the corpus size at bootstrap time.
- `index.md` carries a **staleness verdict**: bootstrap date, corpus size then,
  and the rule — a profile whose corpus has grown by more than ~25%, or that is
  more than ~6 months old, is stale for voice purposes and should be refreshed
  before a piece leans on it. A stale profile is still usable; the consuming
  skill states its date and the operator decides.
- **Persist** (expensive, stable): per-piece notes, the voice print, the
  measured features, positions with citations, calibration results, provenance.
- **Recompute** (cheap or perishable): anything about the *current* draft;
  audience/reception characterizations older than the round; any claim about
  what the persona "would think" about a new topic — that is inference, not
  memory, and it is labeled as inference wherever it appears.

## The honest limit

Persona conditioning shifts surface features reliably and authorial identity
only partially. Theory-grounded evaluation of inference-time stylistic
personalization finds that few-shot, profile-extraction, and contrastive
methods all score *below* a cross-author baseline on trained authorship
verification even while improving trait-level and judge-level scores, and that
the common metrics barely correlate with one another
([arXiv:2604.26460](https://arxiv.org/abs/2604.26460)); stylometric study of
GPT-4o imitating distinctive literary voices finds in-context examples improve
alignment while imitations still cluster with generic model output
([doi:10.1093/llc/fqaf035](https://doi.org/10.1093/llc/fqaf035)). So a profile
is a set of **checkable constraints and calibration targets**, not a voice
transplant. The `calibration.md` held-out test exists to keep that claim honest
per persona rather than in the abstract, and every consuming skill is expected
to report where it could not meet the profile's targets.
