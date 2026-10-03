---
name: outline-from-research
license: MIT
description: "Rhema-authored (P1.12; §7.3, §6.2 Outline row): turn a promoted Assistant thread — its transcript, brief, pins, and fetched source notes — into a versioned outline artifact. Harvest the thread's material and re-fetch exactly its URL set (a failed re-fetch becomes an [unverified] claim, never a dropped one), classify the claims, propose a 5–12 claim spine with a section map, then list the alternatives considered and the gaps only the author can fill. The product is the author-owned outline under agents/author/outline/ — the sanctioned conduit out of the assistant namespace (REQ-SPEC-15)."
inputs:
  - name: thread_dir
    required: true
    description: "The promoted Assistant thread's directory under agents/assistant/threads/ — session transcript, brief.md, pins.json. Read-only: the thread is the input, never a write target."
  - name: promotion_scope
    required: true
    description: "\"thread\" — the whole thread; \"turn\" — the scoped turn plus its ancestors only. Turn-scoped runs carry `turn` below."
  - name: turn
    required: false
    description: "The turn id a turn-scoped promotion is anchored to; the harvest covers that turn and its ancestor chain, nothing later."
  - name: urls
    required: true
    description: "The thread's exact URL set to re-fetch (comma-separated), frozen server-side from the research index. Re-fetch EXACTLY these — no new searches, no substitutions — unless `allow_search` is set."
  - name: allow_search
    required: false
    description: "Rhema harness (§7.3): when the author explicitly asks for new material, searches are permitted inside the run's search budget. Absent/false, every fetch targets a `urls` entry verbatim."
  - name: thesis
    required: false
    description: "The run-sheet lever, prefilled from the thread brief where one exists. The outline's spine must serve it; where the material argues a better thesis, say so under alternatives considered."
  - name: venue
    required: false
    description: "Where the piece is aimed (publication, Substack, journal, internal memo). Sets length and apparatus norms for the section map."
  - name: target_length
    required: false
    description: "Target word count for the finished piece — the section word budgets must reconcile to it."
  - name: protocol
    required: false
    description: "The project's protocol id (rubric contract the draft will be reviewed against)."
  - name: voice
    required: false
    description: "The voice binding (persona id/path or ad-hoc specification) the eventual draft reads."
  - name: outline_dir
    required: true
    description: "Rhema harness (P1.12): the per-run working directory under the assistant research namespace (agents/assistant/research/outline-<runId>/) — phases 0–2 write their working files here; the final artifact does NOT land here."
  - name: outline_path
    required: true
    description: "Rhema harness (P1.12): the outline artifact's mirror path (agents/author/outline/<slug>.md) — granted writable for this run by the harness's declared-output mechanism. Its .json twin (same path, .json) carries the structured rows the Approve-outline card and the editor read."
  - name: guidance
    required: false
    description: "Standing/pinned guidance delivered at the phase boundary (§6.5): promoted chat notes and corrections the outline must honor. Guidance outranks the material where they conflict."
  - name: phase
    required: false
    description: "Rhema harness (REQ-ARCH-5): run one phase then stop. \"N\" runs only phase N; \"N+\" runs from N to the end; absent, the whole skill runs. Phase indices follow this skill's own fallback order (0, 1, 2, 3)."
  - name: scope
    required: false
    description: "Rhema harness (REQ-ARCH-5): narrow the run to a phase subset."
  - name: changed_since
    required: false
    description: "Rhema harness (REQ-ARCH-5): the prior outline version this run amends (REQ-WF-11) — a re-outline reads the prior artifact first and diffs rather than re-derives."
  - name: prior_review
    required: false
    description: "Rhema harness (REQ-ARCH-5): explicit path of a review the new outline must answer."
  - name: resume_from
    required: false
    description: "Rhema harness (REQ-ARCH-5, 1.x): section-granular resume point."
  - name: sidecar
    required: false
    description: "Rhema harness (REQ-ARCH-5, REQ-SPEC-4): when true, emit the structured-output sidecar twin of §11.1 under .rhema/ beside each markdown deliverable (outline.json), and write .rhema/phase-result.json {status} at the end of every phase."
  - name: phase_output
    required: false
    description: "Rhema harness (REQ-ARCH-5): the exact dossier file(s) the pinned phase must write — supplied by the harness from the phase manifest so the write target never drifts from the completion oracle. When set, the pinned phase writes precisely these file(s) (comma-separated) before .rhema/phase-result.json."
---

# Outline from research

You are the Assistant seat promoting a chat thread into an **outline artifact**.
The thread is the material; the outline is the only thing you write outside the
assistant namespace — `outline_path` under `agents/author/outline/` is granted
writable for this run, and it is the ONLY author path you may touch (the
two-conduit rule, REQ-SPEC-15). You never write drafts, correspondence, or
anything under `agents/author/` outside the declared outline files.

## The re-fetch contract (§7.3 — load-bearing)

`urls` is the thread's exact URL set. Re-fetch **exactly** those URLs through
the metered egress path under the run's URL policy — same content the thread's
source notes were built from, freshened. Rules:

- **A failed re-fetch is never silently dropped.** Paywall, robots, timeout,
  policy refusal — the claim that source supported becomes a claim marked
  `[unverified]` in the outline, citing the failed URL. You never retry a failed
  URL within the run, and you never substitute a different source for it.
- **No new searches** unless `allow_search` is set — the author asked for the
  thread's material, not a new literature review.
- A successful re-fetch that CONTRADICTS the thread's source note keeps the
  claim but marks it `[unverified]` with a one-line divergence note — the card
  shows the author, never a quiet swap.

## Phase 0 — Harvest

Read `thread_dir` (session transcript, `brief.md`, `pins.json`), the research
index, and every source note under `agents/assistant/research/sources/` the
thread cites. When `promotion_scope` is `turn`, harvest only the named turn and
its ancestor chain. Re-fetch the `urls` set per the contract above.

Write `<outline_dir>/00-harvest.md`:

- the thread digest — turns in scope, the brief's thesis if one exists, pinned
  facts;
- one line per URL: `fetched <url>` or `FAILED <url> — <reason>` (the
  `[unverified]` roster the later phases must carry, never shrink);
- the claim inventory the thread produced, each tagged with where it came from
  (turn id, source URL, or pin).

## Phase 1 — Classify

Group the harvested claims: what kind of claim each is (factual, interpretive,
normative, anecdote) and which bucket of the eventual argument it belongs to.
Write `<outline_dir>/01-claims.md` — one row per claim with its provenance tag
and unverified flag carried through verbatim. Claims the re-fetch could not
re-verify keep `[unverified]` — classification never launders a failed fetch
into a verified one.

## Phase 2 — Spine

Propose the argument: **5–12 claims in order**, each an assertion, not a topic —
then the section map (§7.3's spine-and-sections row): each section's working
title, the **function** it performs, its **entry state** (what the reader
believes on arrival), its **exit state**, its **word budget** reconciled against
`target_length`, and the claim rows it carries. Record **alternatives
considered** — the other spines/theses the material could support and why this
one wins.

Write `<outline_dir>/02-spine.md`.

## Phase 3 — Gaps + the artifact

Reconcile and ship. The outline artifact at `outline_path`:

```markdown
# Outline — <thesis>

<!-- provenance
thread: <thread id> · scope: <thread|turn[:id]> · run: <run id>
generated: <iso timestamp> · sources: <n> (<m> unverified)
-->

- **Thesis:** …
- **Venue / audience / target length:** …
- **Protocol / voice:** …

## Spine
1. <claim> — <which sections carry it>
…

## Sections
### <ref> <title> — <target words>w
- function / entry / exit: …
- - <claim bullet> *(source: <url|turn|user>)* / *([unverified] — fetch failed: <url>)*

## Alternatives considered
- …

## Gaps only the author can fill
- <what only the author can supply> *(section <ref>)*

## Sources
- <url> — fetched <iso> / FAILED — [unverified]
```

Write its structured twin at the same path with `.json` (the exact
`outline.json` contract below) AND the oracle copy at
`agents/assistant/.rhema/outline.json`, then `.rhema/phase-result.json`.

The gate after this phase is the human's — the artifact is presented as-is; you
never self-edit it to look more finished than the material supports.

### Sidecar JSON — the EXACT shape the harness validates (REQ-SPEC-12)

```json
{
  "sidecar": "outline",
  "version": 1,
  "thesis": "…",
  "venue": "…", "targetLength": 2400, "protocol": "…", "voice": "…",
  "provenance": {
    "threadId": "…", "scope": "thread|turn", "turnId": "…", "runId": "…",
    "generatedAt": "<iso>",
    "urls": [{ "url": "…", "fetchedAt": "<iso>", "unverified": true }]
  },
  "spine": ["c1", "c4", "c2", "… — claim ids in argument order, 5–12 of them"],
  "sections": [
    {
      "ref": "I", "title": "…", "targetWords": 600,
      "function": "…", "entry": "…", "exit": "…",
      "claims": [
        {
          "id": "c1", "text": "…",
          "provenance": { "kind": "thread|source|user_typed|generated", "turnId": "…", "url": "…", "notePath": "…" },
          "unverified": false
        }
      ]
    }
  ],
  "alternativesConsidered": ["…"],
  "gaps": [{ "id": "g1", "needed": "…", "relatedClaimId": "c3", "sectionRef": "II" }]
}
```

Required: `thesis`, `sections` (each with `ref`/`title`/`claims`), `spine`
(5–12 claim ids — every id a claim the sections carry). Every claim row carries
`provenance.kind`; a claim whose source failed re-fetch carries
`unverified: true` — the badge is data, never prose decoration.

## Per-phase artifacts under harness execution (REQ-ARCH-5)

| Phase (fallback order) | `phase` | File(s) to write |
|---|---|---|
| Harvest | `0` | `<outline_dir>/00-harvest.md` |
| Classify | `1` | `<outline_dir>/01-claims.md` |
| Spine | `2` | `<outline_dir>/02-spine.md` |
| Gaps | `3` | `outline_path` (+ its `.json` twin + `.rhema/outline.json`) |

A pinned phase reads the prior phases' files from the materialized workspace
rather than re-deriving them; it never treats a stale `.rhema/phase-result.json`
as evidence its own phase is done.
