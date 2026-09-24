---
name: figure
license: MIT
description: "Rhema-authored (P1.13; §7.5, §6.2 Figure row): turn a visualize request — a selection, a claim-ledger row, an uploaded CSV/JSON, a URL, typed numbers, or free text — into a versioned figure asset. The data-resolution honesty step classifies where every number comes from BEFORE any spec exists (model-memory numbers are refused; the insist path lands kind:\"none\" + a persistent [unverified data] badge). The spec lands at the canonical assets/figures/<figure-id>/ path (Vega-Lite schema-validated with ≤3 retries, Mermaid, or a GFM/HTML table), the deterministic light+dark render is the figure.render worker job (never this skill's output, never a browser), and the caption phase emits the card fields + the figure.json twin."
inputs:
  - name: figure_id
    required: true
    description: "The figures row id this run iterates (server-minted at run creation — the asset directory assets/figures/<figure_id>/ is already its home)."
  - name: figure_dir
    required: true
    description: "The committed asset directory (assets/figures/<figure_id>/) — granted writable for this run by the declared-output mechanism. Spec, data, and provenance commit here; the renders land here later via the worker."
  - name: work_dir
    required: true
    description: "The per-run working directory under the author namespace (agents/author/figures/<runId>/) — phases write their working files here; the committed asset files do NOT land here."
  - name: entry_point
    required: true
    description: "How the run was opened: chat | selection | command | edit_block | craft_finding. The seeded provenance kind rides with it (selection → \"selection\"; an existing block keeps its own)."
  - name: request
    required: true
    description: "The visualize request verbatim (\"make a bar chart of the CHES correlations\", \"drop the liberal row\", \"log scale\"). On an iterate run this is the change request; on the first run it is the figure's intent."
  - name: spec_kind
    required: false
    description: "The requested spec kind when the request fixes it: vega_lite | mermaid | table. Absent, you choose the kind the request implies (chart/number-plot → vega_lite; flow/state/sequence/class/ER/xychart → mermaid; table → table). An unsupported figure type is DECLINED with a suggestion — never improvised."
  - name: source_refs
    required: false
    description: "The entry point's data source, server-frozen: selection_text (the Page selection's numbers), claim_ids (@claim:… rows), asset_id (@asset:… upload), url (to fetch now), or typed_rows (values the user typed inline). Drives the provenance classification; absent ⇒ the honesty step's refuse/insist fork applies."
  - name: prior_version
    required: false
    description: "Iterate runs only: the version n this run produces n+1 from — its spec/data/provenance are materialized under versions/<n>/; re-run spec generation with the prior spec as context. A request that changes DATA re-runs Phase 0's honesty step, not just the spec."
  - name: guidance
    required: false
    description: "Standing/pinned guidance delivered at the phase boundary (§6.5). Guidance outranks the request where they conflict."
  - name: phase
    required: false
    description: "Rhema harness (REQ-ARCH-5): run one phase then stop. \"N\" runs only phase N; \"N+\" runs from N to the end; absent, the whole skill runs. Phase indices follow this skill's own fallback order (0, 1, 2, 3)."
  - name: scope
    required: false
    description: "Rhema harness (REQ-ARCH-5): narrow the run to a phase subset."
  - name: changed_since
    required: false
    description: "Rhema harness (REQ-ARCH-5): the prior version this run amends."
  - name: prior_review
    required: false
    description: "Rhema harness (REQ-ARCH-5): explicit path of a review the figure must answer."
  - name: resume_from
    required: false
    description: "Rhema harness (REQ-ARCH-5, 1.x): section-granular resume point."
  - name: sidecar
    required: false
    description: "Rhema harness (REQ-ARCH-5, REQ-SPEC-4): when true, emit the structured-output sidecar twin of §11.1 under .rhema/ (figure.json), and write .rhema/phase-result.json {status} at the end of every phase."
  - name: phase_output
    required: false
    description: "Rhema harness (REQ-ARCH-5): the exact file(s) the pinned phase must write — supplied by the harness from the phase manifest so the write target never drifts from the completion oracle. When set, the pinned phase writes precisely these file(s) (comma-separated) before .rhema/phase-result.json."
---

# Figure

You are the Drafter seat producing a **figure asset** — spec + data + provenance,
versioned per iteration, living under `figure_dir`. A figure is a claim-bearing
asset: its numbers are fact-checkable claims, and the data-honesty rule below is
load-bearing (REQ-WF-14). You write ONLY inside `figure_dir` and `work_dir` —
the committed spec/data/provenance files land under `assets/figures/<figure_id>/`
(the declared-output grant); the renders do NOT (the `figure.render` worker job
writes `render.svg` + `render.dark.svg` — you never produce them).

## Phase 0 — The honesty step (load-bearing, REQ-VIZ-4/5)

Before ANY spec exists, classify where every number comes from and write
`figure_dir/provenance.json`. The six kinds:

| `kind` | source | badge |
|---|---|---|
| `selection` | numbers in the selection/draft | none — the review checks them anyway |
| `claim_ledger` | a claim-ledger row (`@claim:…`) | inherits the claim's verified state |
| `asset_upload` | an uploaded CSV/JSON (`@asset:…`) | none |
| `fetched` | a URL fetched for this figure, now | "✓ fetched" source line |
| `user_typed` | numbers the user typed/corrected inline | *author-supplied* |
| `none` | the user insisted on unsourced numbers | **persistent [unverified data]** |

Rules:

- **Numbers the model "remembers" are refused.** Say so — "I don't have a source
  for these numbers" — and offer the four routes (point at a source, upload a
  CSV, fetch a URL, type the values). Only if the user insists does the figure
  proceed with `kind:"none"` — and the `[unverified data]` badge persists on the
  asset and every export until provenance attaches or a review verdict lands.
- **A fetched source is fetched through the metered path**, under the run's URL
  policy. A failed fetch is never silently swapped for a different source —
  report it and reclassify (`none` if the user insists anyway).
- `provenance.json` shape: `{kind, refs:[{url?, accessedAt?, claimId?, assetId?,
  transform?}], computedBy:"drafter"|"assistant"|"user", verification:"unverified"}`.
  `computedBy` is `assistant` only when the assistant seat authored the numbers.
- Write `figure_dir/data.csv` — the numbers EXACTLY as plotted — for every
  chart/table figure (a diagram may have no data file). Corrections the user
  typed over the grid record as `user_typed` refs with a `transform` note.

Write `<work_dir>/00-data.md` — the classification table (one row per datum:
value, column, kind, ref) plus the honesty-step narrative (what was refused,
what the user chose). Then `.rhema/phase-result.json`.

## Phase 1 — Spec

Choose the kind (`spec_kind` may pin it):

- **vega_lite** — charts. Author `figure_dir/spec.vl.json`: a valid Vega-Lite
  v5 spec, `data.values` naming the `data.csv` columns, no embedded data copies.
  **Schema-validate before finishing**: check every mark/encoding/channel/
  transform against the Vega-Lite schema; on a violation, fix and re-validate —
  at most **3 attempts**, feeding the validator's error back into each retry.
  After the third failure, stop honestly: write `.rhema/phase-result.json`
  `{status:"blocked"}` with the last validator error — never ship a spec you
  could not validate.
- **mermaid** — flowchart / state / sequence / class / ER / xychart diagrams.
  Author `figure_dir/diagram.mmd` (plain mermaid source, no init directives —
  theming is the renderer's).
- **table** — a GFM (or simple HTML) table. Author `figure_dir/table.md`; it
  needs no render.
- **anything else** — decline with a suggestion ("a static choropleth isn't
  supported — a bar chart of the same values works"). Write the refusal in
  `<work_dir>/01-spec-notes.md` and `{status:"blocked"}` — never improvise a
  generic drawing canvas.

On an iterate run (`prior_version` set): re-generate the spec with the prior
spec as context — keep `versions/<n>/` untouched (the system snapshots the prior
spec/data/provenance into it). Write `<work_dir>/01-spec-notes.md` — the spec
choice, validation attempts, and what the request changed. Then
`.rhema/phase-result.json`.

## Phase 2 — Render request

The deterministic render is the `figure.render` worker job — your only output
this phase is the packaged request `<work_dir>/02-render-request.json`:

```json
{
  "figureId": "<figure_id>",
  "specPath": "assets/figures/<figure_id>/spec.vl.json",
  "dataPath": "assets/figures/<figure_id>/data.csv",
  "provenancePath": "assets/figures/<figure_id>/provenance.json",
  "render": "light+dark | none"
}
```

`render: "none"` when the spec kind is `table` (tables need no render). Then
`.rhema/phase-result.json`.

## Phase 3 — Caption

Write the card's text fields + the sidecar twin.

`<work_dir>/03-caption.md` — the card verbatim: **title**, **caption** (the
italic line, no "Figure N." — numbers are computed from document order),
**alt** (≤250 chars, describes the chart for a screen reader — required before
insert), **source line** ("Source: CHES 2019 (chesdata.eu), authors'
calculation." — required before insert), and the provenance echo (kind + the
badge the card carries: `[unverified data]` for kind:none, *author-supplied* for
user_typed, nothing otherwise).

Then the oracle copy of the twin at `agents/author/.rhema/figure.json` (the
exact contract below), then `.rhema/phase-result.json`.

### Sidecar JSON — the EXACT shape the harness validates (REQ-SPEC-12)

```json
{
  "sidecar": "figure",
  "version": 1,
  "figureId": "<figure_id>",
  "specKind": "vega_lite | mermaid | table",
  "kind": "chart | diagram | table",
  "title": "…",
  "caption": "…",
  "alt": "… ≤250 chars",
  "sourceLine": "Source: …",
  "provenanceKind": "selection | claim_ledger | asset_upload | fetched | user_typed | none",
  "request": "<the iterate request; omit on the first version>"
}
```

All fields are required except `request`. `provenanceKind` echoes the honesty
step's classification — it never launders `none` into something sourced.

## Per-phase artifacts under harness execution (REQ-ARCH-5)

| Phase (fallback order) | `phase` | File(s) to write |
|---|---|---|
| Data | `0` | `<work_dir>/00-data.md` + `figure_dir/data.csv` + `figure_dir/provenance.json` |
| Spec | `1` | `<work_dir>/01-spec-notes.md` + `figure_dir/`'s spec file (spec.vl.json \| diagram.mmd \| table.md) |
| Render | `2` | `<work_dir>/02-render-request.json` |
| Caption | `3` | `<work_dir>/03-caption.md` + `agents/author/.rhema/figure.json` |

A pinned phase reads the prior phases' files from the materialized workspace
rather than re-deriving them; it never treats a stale `.rhema/phase-result.json`
as evidence its own phase is done.
