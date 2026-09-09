# Project Memory — layout and boundary rules

The durable, on-disk memory for one piece of writing as it moves through
review rounds. Skills in this repo read and write it; it is what lets a later
agent reuse expensive research instead of recomputing it, while keeping the
author's and editor's judgment strictly separated.

## Layout

One directory per piece ("project"). Location is the operator's choice
(`project_dir` input); by default skills create it next to the original draft,
named after the piece's slug. The layout is location-independent — the
manifest makes it identifiable.

```
<project_dir>/
  manifest.md                  # title, slug, persona, current version, round log
  drafts/
    v1.md                      # immutable once a review or response exists for it
    v2.md
  correspondence/              # the SHARED record — everything formally delivered
    v1-drafting-note.md        #   draft-from-outline's account of how v1 was made
    v1-review/                 #   editorial-review dossier for drafts/v1.md
      editors-letter.md        #   (+ claim ledger, discourse report, second read)
    v1-response.md             #   respond-to-review's response letter for that review
    v2-review/
  agents/                      # PRIVATE per-agent memory — never cross-read
    editor/
      research/
        index.md               #   one line per source note
        sources/<slug>.md      #   distilled source notes (see format below)
      notes.md                 #   editor's own working notes across rounds
    author/
      outline/                 #   source material the piece was drafted from (as given)
      drafting/v1/             #   draft-from-outline working dossier for v1
        00-commissioning-brief.md … 06-fidelity-audit.md
      research/                #   same structure as editor's
      ledgers/
        v1-response-ledger.md  #   frozen response ledger per round
      voice-charter.md         #   living doc: voice, commitments, protected strengths
```

A piece's **persona** — the body of work it belongs to — lives outside the
project, in a shared library ([`personas.md`](personas.md)), because a voice
outlives any one piece. The manifest records which persona a piece was written
against and the date of the profile used, so a later round can tell whether the
voice knowledge has since been refreshed.

## The boundary rule

Context separation is what keeps rounds honest: the editor of v2 must not
inherit the author's rationalizations, and the author must not inherit the
editor's undelivered deliberations.

- The **persona library** is outside the project and readable by every agent:
  it holds published work and derived observations about it, not either side's
  private deliberations. Which files each role may load is specified in
  [`personas.md`](personas.md) — the editor deliberately does not load the
  voice print.
- Every agent may read **`drafts/`**, **`correspondence/`**, and
  **`manifest.md`** — the shared record. This mirrors real practice: reviewers
  see the author's response memo; authors see the delivered review, and both
  see every draft.
- An agent may read and write **only its own** `agents/<name>/` directory.
  Reading another agent's directory is a boundary violation even when it would
  save work — the savings is the contamination.
- Delivered artifacts are **immutable**: once a review dossier or response
  letter is in `correspondence/`, later rounds append new artifacts; they
  never edit old ones. Same for `drafts/vN.md` once reviewed or responded to.

**Allowlist discipline.** The rule is held as an allowlist, not a prohibition:
an agent's readable set is *exactly* `drafts/`, `correspondence/`,
`manifest.md`, and its own `agents/<role>/` — nothing else in the project
directory exists for it. In practice:

- **Never run a recursive search, listing, or bulk read over the project
  root** (`grep -r`, `find`, glob sweeps, "read the whole directory") — the
  likeliest violation is not a deliberate read but a legitimate search that
  inhales another agent's files as a side effect. Scope every search and
  listing to explicit allowed paths.
- **Propagate the boundary into every subagent.** Subagents never read this
  document or the skill file — they know only their prompt. Any subagent
  prompt that touches the project directory must state the allowed-path set
  verbatim and the no-recursive-ops rule.
- **Attest at delivery.** Each skill's final report states that no paths
  outside the agent's allowed set were accessed. The attestation forces a
  self-audit and gives the operator a checkable claim — every path an agent
  touches is in its transcript.

**What this is and isn't.** The boundary is *normative*: it binds agents that
read these conventions, which is the intended threat model (cooperative
agents; the adversary is sloppiness, not malice). It does not bind a
misbehaving run or third-party tooling — operators who want hard enforcement
should apply it at the OS layer (per-role users with `chmod 700` on each
`agents/<role>/`, or per-role sandboxes whose mounts exclude the other roles'
directories); nothing in this layout precludes that.

## Source notes: the persisted fruit of deep research

The expensive part of web research is discovery and distillation, not
re-fetching a known URL. What gets persisted is the distilled note:

```markdown
# <source-slug>
- **URL:** <url> · **Accessed:** <date> · **For:** <round/purpose>
- **What it establishes:** <the claims this source supports or defeats, precisely scoped>
- **Key passages:** <short quotes with enough context to reuse without re-reading>
- **Reliability:** <primary/secondary; independence; known bias>
- **Relevance to this project:** <which findings/claims/sections it bears on>
```

Append one line per note to `research/index.md` (`- [slug](sources/slug.md) —
what it settles`). Before any new research pass, read the index first and
reuse; add notes for every source genuinely read; update a note rather than
duplicating it.

## Persist vs. recompute

**Persist** (expensive to reproduce, stable across rounds):
- Distilled source notes and the research index.
- Decisions with their rationales (frozen response ledgers, frozen draft
  ledgers, delivered dossiers, drafting notes and letters) — the record of
  *why*, which no re-read of the draft can reconstruct.
- The author's voice charter and project intent.
- The outline and the drafting dossier: the structure plan, the cut list, and
  the deviations are why the piece is shaped as it is, and a later round that
  proposes restoring a cut section should be able to read why it was cut.
- The manifest's round log (what happened when, at which version).

**Recompute always** (cheap, or poisoned by staleness):
- Any judgment about the *current* draft's text — always re-read from disk;
  never trust a memory artifact's characterization of prose that may have
  changed.
- Verification verdicts for any claim whose wording, scope, or context
  changed since the note was written.
- Reception forecasts and discourse "current state" summaries older than the
  round they were written in — discourse moves; source notes carry accessed
  dates so staleness is checkable.

**Never persist**: transcripts of raw fetched pages (re-fetch by URL when
needed); judgments about draft text embedded outside the round-frozen
artifacts; anything whose only purpose is to spare a future agent from
reading the draft itself.

## Versioning

Drafts are `v<N>.md`, monotonically increasing; the current version is the
highest `N`, recorded in the manifest. A review of `vN` lives at
`correspondence/vN-review/`; the response that produces `v(N+1)` lives at
`correspondence/vN-response.md`; the note accounting for how `vN` was drafted
from source material lives at `correspondence/vN-drafting-note.md`. Round log
entries in the manifest are one-liners: date, event (`v1 drafted from outline`,
`review v2 delivered`, `response v2 → v3`), actor.

A project may begin at any point in the chain: with an outline (then
`draft-from-outline` creates the layout and delivers `v1`), or with a finished
draft someone wrote by hand (then the first review creates it).
