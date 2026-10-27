// The sanctioned-delta contract (REQ-ARCH-5 amended, spec §12.2) — PRIVATE, versioned with the port.
//
// It pins the upstream ~/agent-discourse commit and declares, per ported file, the EXACT ordered
// transforms that turn the pinned-upstream file into the ported file. The applier
// (scripts/lib/upstream-port.mjs) both GENERATES the ported files from this and VERIFIES them against
// it, so a ported skill differs from upstream by these edits and nothing else (REQ-SPEC-22: drift is
// a fork, not a diff). Every op's `category` must be in SANCTIONED_CATEGORIES.
//
// Ported skills: editorial-review, respond-to-review, bootstrap-persona, draft-from-outline.
// research_burst landed in P1.11 as a RHEMA-AUTHORED skill — it has no upstream pin, so it is
// declared in `rhemaOwned` below instead of receiving a transform list; the drift checker exempts
// declared files from pin-diffing and fails if a declared file is also present in the pin (it would
// need transforms). P1.12 (2026-09-2x): `outline-from-research` is likewise RHEMA-AUTHORED — the
// P1.12 ticket scheduled its port at this pin, but the pin carries no such skill (the vendored tree
// has exactly the four skills above), so it lands in `rhemaOwned` with the same declaration rule.

export const upstreamRepo = "agent-discourse";
export const upstreamCommit = "5fef4165042b080c1d4c6becc281dc5ce8860cb3";

/**
 * Rhema-owned files (P1.11 — REQ-ARCH-5's ownership declaration): files authored in this repo with no
 * upstream source, exempt from the pin-diff by declaration rather than by silence. Each entry is a
 * pin-relative path that must EXIST under packages/protocols and must NOT exist in the vendored pin —
 * a file that appears upstream later must move to `files` with a transform list, not stay here.
 */
export const rhemaOwned = [
  "skills/research-burst/SKILL.md",
  "skills/chat-turn/SKILL.md",
  // P1.12 — scheduled for an upstream port by the ticket, but the vendored pin has no
  // outline-from-research (see the header note); authored here, same declaration rule.
  "skills/outline-from-research/SKILL.md",
  // P1.13 — the Figure run's skill (§7.5/§6.2 Figure row): Rhema-authored like its P1.11/P1.12
  // siblings; no upstream pin carries it.
  "skills/figure/SKILL.md",
];

// The six harness-neutral inputs, shared verbatim across the three skills (REQ-ARCH-5). `sidecar`'s
// per-skill emission is documented in each skill's harness section (below), not here.
const SIX_INPUTS = (opts) => `
  - name: phase
    required: false
    description: "Rhema harness (REQ-ARCH-5): run one phase then stop. \\"N\\" runs only phase N; \\"N+\\" runs from N to the end; absent, the whole skill runs. Phase indices follow this skill's own fallback order (${opts.order})."
  - name: scope
    required: false
    description: "Rhema harness (REQ-ARCH-5${opts.scopeReq ? `, ${opts.scopeReq}` : ""}): narrow the run to a phase subset${opts.scopeNote ? ` — ${opts.scopeNote}` : ""}."
  - name: changed_since
    required: false
    description: "Rhema harness (REQ-ARCH-5): the prior version this input was human-revised from, so a re-run checks only what changed."
  - name: prior_review
    required: false
    description: "Rhema harness (REQ-ARCH-5): explicit path of the review being answered/extended, so a re-run reads the response letter first and does not re-raise well-rebutted findings."
  - name: resume_from
    required: false
    description: "Rhema harness (REQ-ARCH-5, 1.x): section-granular resume point."
  - name: sidecar
    required: false
    description: "Rhema harness (REQ-ARCH-5, REQ-SPEC-4): when true, emit the structured-output sidecar twins of §11.1 under .rhema/ beside each markdown deliverable${opts.sidecarList ? ` (${opts.sidecarList})` : ""}, and write .rhema/phase-result.json {status} at the end of every phase. Absent, the skill runs exactly as upstream."`;

export const files = {
  // ---------------- editorial-review (Review) ----------------
  "skills/editorial-review/SKILL.md": [
    {
      op: "insertAfter",
      category: "inputs",
      anchor:
        '    description: "Default true. Run the Phase 5 independent second read. Disabling loses the coverage gained from an uncontaminated reading (~a third of findings, empirically)."',
      insert: SIX_INPUTS({
        order: "0, 4, 1, 2, 5, 3, 6",
        scopeReq: "REQ-WF-13",
        scopeNote:
          "Fact-check is scope = the claim inventory + verification phases, reusing these implementations and artifact types; unchanged claims are not re-verified",
        sidecarList: "findings.json, 01-claim-ledger.json, rubric.json",
      }),
    },
    {
      op: "insertAfter",
      category: "inputs",
      anchor:
        "    description: \"Rhema harness (REQ-ARCH-5, REQ-SPEC-4): when true, emit the structured-output sidecar twins of §11.1 under .rhema/ beside each markdown deliverable (findings.json, 01-claim-ledger.json, rubric.json), and write .rhema/phase-result.json {status} at the end of every phase. Absent, the skill runs exactly as upstream.\"",
      insert: `
  - name: phase_output
    required: false
    description: "Rhema harness (REQ-ARCH-5): the exact dossier file(s) the pinned phase must write under output_dir — supplied by the harness from the phase manifest so the write target never drifts from the completion oracle. When set, the pinned phase writes precisely these file(s) (comma-separated) before .rhema/phase-result.json."`,
    },
    {
      op: "insertAfter",
      category: "sidecar",
      anchor: "because a phase was\nskipped.",
      insert: `

## Rhema harness inputs and structured output (added at port — REQ-ARCH-5)

These are harness-neutral additions; the review regimen is upstream-verbatim.

- \`phase\` runs one phase then stops (\`"N"\` = only phase N; \`"N+"\` = from N to the end), indexed in this skill's own fallback order 0, 4, 1, 2, 5, 3, 6.
- \`scope\` narrows the run to a phase subset — Fact-check is \`scope\` = the claim inventory + verification phases, reusing these implementations and artifact types (REQ-WF-13); unchanged claims are not re-verified.
- \`changed_since\` names the version this draft was human-revised from; \`prior_review\` names the review being answered, so a re-review reads the response letter first and does not re-raise well-rebutted findings.
- \`resume_from\` is a section-granular resume point (1.x).
- \`sidecar: true\` emits the structured-output twins of §11.1 to \`.rhema/\` beside each markdown deliverable — \`findings.json\`, \`01-claim-ledger.json\`, \`rubric.json\` — and writes \`.rhema/phase-result.json {status}\` at the end of every phase. The \`findings.json\` sidecar states each finding's \`severity\` explicitly (\`blocking | major | minor | note\` — REQ-SPEC-4), never inferred from prose; a re-review's \`findings.json\` may declare \`carriesObligationId\` (REQ-OBJ-4). With \`sidecar\` absent the skill runs exactly as upstream.
- \`phase_output\` names the exact dossier file(s) the pinned phase must write under \`output_dir\`, supplied by the harness from the phase manifest so the write target never drifts from the completion oracle. Honor it as authoritative.

### Per-phase artifacts under harness execution (REQ-ARCH-5)

Run whole (no \`phase\`), the regimen keeps craft (Phase 4) and argument (Phase 3) in context and synthesizes
them into the editor's letter, so it writes no standalone \`03-\`/\`04-\` file. Run **one phase at a time** by the
harness (\`phase="N"\`), each phase instead runs in a fresh context and communicates only through files — so
**every** phase, craft and argument included, must persist its full findings to its own dossier file before it
ends. Write exactly the file named by \`phase_output\` (equivalently, the file below for the pinned phase) under
\`output_dir\`, then write \`.rhema/phase-result.json {status:"done"}\`:

| Phase (fallback order) | \`phase\` | Dossier file to write |
|---|---|---|
| Intake | \`0\` | \`00-piece-brief.md\` |
| Craft (structure/prose/voice) | \`4\` | \`04-craft-notes.md\` |
| Verification | \`1\` | \`01-claim-ledger.md\` (+ \`01-claim-ledger.json\`) |
| Discourse | \`2\` | \`02-discourse-report.md\` |
| Second read | \`5\` | \`05-second-read.md\` |
| Argument | \`3\` | \`03-argument-notes.md\` |
| Letter | \`6\` | \`editors-letter.md\` (+ \`findings.json\`, \`rubric.json\`) |

The pinned phase reads the prior phases' dossier files it needs from \`output_dir\` (they are re-materialized into
the workspace at the start of each phase) rather than re-deriving them; it never treats the presence of an
earlier phase's \`00-piece-brief.md\`, or a stale \`.rhema/phase-result.json\`, as evidence that its own phase is
already done — it produces its declared file regardless. \`03-argument-notes.md\` and \`04-craft-notes.md\` carry
the same argument- and craft-critique findings the letter will later synthesize; writing them per phase is what
lets the letter phase run in its own fresh context.

### Sidecar JSON — the EXACT shape the harness validates (REQ-SPEC-12)

When \`sidecar: true\`, each \`.json\` twin is validated at commit against a strict schema; a shape mismatch fails
the phase (\`sidecar_validates\`). Emit **exactly** these structures. Every sidecar carries the envelope keys
\`"sidecar"\` and \`"version": 1\`; unknown extra keys are ignored; the listed enum tokens are the accepted values
(case / spaces / hyphens are canonicalized to snake_case, and a numeric string like \`"1"\` is accepted for a
numeric field, but stay close to these). Numeric fields (\`tier\`, \`score\`, \`version\`) are NUMBERS, not strings.

**\`01-claim-ledger.json\`** (Verification, phase \`1\`) — one row per claim in \`01-claim-ledger.md\`:

\`\`\`json
{
  "sidecar": "claim_ledger",
  "version": 1,
  "inventoryCount": 12,
  "claims": [
    {
      "ordinal": 0,
      "text": "the claim, quoted from the draft",
      "tier": 1,
      "verdict": "verified",
      "kind": "factual",
      "sourceCheck": "matches_citation",
      "sources": [
        { "url": "https://example.org/x", "normalizedUrl": "https://example.org/x", "accessedAt": "2026-09-09T00:00:00Z", "stance": "supports" }
      ],
      "note": "one line on the evidence"
    }
  ]
}
\`\`\`

Top-level **\`inventoryCount\`**: the Phase-0 claim inventory's row count — the denominator the phase's
coverage check (\`claim_rows_gte_inventory\`) reads. Emit it (an integer, or a numeric string). Without it
the phase cannot prove coverage and will not complete.

Required per claim row: \`ordinal\` (integer ≥ 0), \`text\` (string), \`tier\` (1, 2, or 3), \`verdict\`. All else is
optional. \`verdict\` ∈ {\`verified\`, \`substantially_accurate\`, \`misleading_in_context\`, \`unsupported\`,
\`contradicted\`, \`unverifiable\`, \`verified_against_user_source\`}. \`kind\` ∈ {\`factual\`, \`statistical\`,
\`quotation\`, \`interpretive\`, \`normative\`, \`predictive\`}. \`sourceCheck\` ∈ {\`matches_citation\`, \`reputable_list\`,
\`from_search\`, \`suspicious_source\`}. A source's \`stance\` ∈ {\`supports\`, \`contradicts\`, \`contextualizes\`}.

**Closure.** Every row must carry a REAL disposition, not a placeholder. A row whose verdict is
\`unverifiable\` is a completed check ONLY when it carries its evidence — a \`note\` saying why it cannot be
checked, and/or the trail you did try (\`url\`, \`normalizedUrl\`, \`accessedAt\`, \`sourceCheck\`, or non-empty
\`sources\`). A bare \`unverifiable\` row asserts nothing was checked: the phase's \`claim_ledger_closed\` gate
refuses it and the phase cannot go \`done\`. If research was genuinely exhausted, keep the rows — but write
WHY each check failed into \`note\`/\`sourceCheck\`/\`sources\` so the ledger is honest, and flag the residual in
\`phase-result.json\`/the ledger rather than letting placeholders pass as verdicts.

**\`findings.json\`** (Letter, phase \`6\`) — one row per finding:

\`\`\`json
{
  "sidecar": "findings",
  "version": 1,
  "findings": [
    {
      "ordinal": 0,
      "kind": "argument",
      "severity": "major",
      "origin": "editor",
      "anchor": null,
      "title": "short finding title",
      "body": "the finding, at most 4096 characters",
      "rubricDims": ["argument_rigor"],
      "letterSection": "major"
    }
  ]
}
\`\`\`

Required per finding row: \`ordinal\`, \`kind\`, \`severity\`, \`origin\`, \`anchor\` (an anchor object OR \`null\`),
\`title\`, \`body\`. \`kind\` ∈ {\`claim\`, \`discourse\`, \`argument\`, \`structure\`, \`craft\`, \`voice\`, \`continuity\`}.
\`severity\` ∈ {\`blocking\`, \`major\`, \`minor\`, \`note\`}. \`origin\` ∈ {\`editor\`, \`second_read\`, \`both\`}.
\`letterSection\` ∈ {\`one_thing\`, \`major\`, \`strength\`, \`roadmap\`, \`considered_rejected\`}. \`rubricDims\` entries are
rubric dimensions (below). An anchor object is \`{"blockId": "b1", "quote": "…", "startOffset": 0, "endOffset": 0, "confidence": 1}\`.

**\`rubric.json\`** (Letter, phase \`6\`) — the eight dimensions, each scored 1–5, NEVER aggregated:

\`\`\`json
{
  "sidecar": "rubric",
  "version": 1,
  "dimensions": [
    { "dimension": "thesis_contribution", "score": 3 },
    { "dimension": "argument_rigor", "score": 2, "cap": { "at": 2, "reason": "why the score is capped" } }
  ]
}
\`\`\`

Required per row: \`dimension\`, \`score\` (1–5). The eight dimensions: \`thesis_contribution\`, \`argument_rigor\`,
\`evidence_accuracy\`, \`originality_situatedness\`, \`structure\`, \`prose\`, \`voice_audience_fit\`,
\`intellectual_honesty\`.`,
    },
  ],

  // ---------------- respond-to-review (Revise) ----------------
  "skills/respond-to-review/SKILL.md": [
    {
      op: "insertAfter",
      category: "inputs",
      anchor:
        '    description: "Default true. Run the Phase 5 fresh-context completeness/faithfulness check. Disabling removes the proof that the review was actually metabolized rather than performatively addressed."',
      insert: SIX_INPUTS({
        order: "0, 1, 2, 3, 4, 5, 6",
        scopeNote: "a subset of the revise phases",
        sidecarList: "response-ledger.json — one row per finding",
      }),
    },
    {
      op: "insertAfter",
      category: "sidecar",
      anchor: "gratitude or boilerplate deference.",
      insert: `

## Rhema harness inputs and structured output (added at port — REQ-ARCH-5)

These are harness-neutral additions; the response regimen is upstream-verbatim.

- \`phase\` runs one phase then stops (\`"N"\` = only phase N; \`"N+"\` = from N to the end).
- \`scope\` narrows the run to a phase subset; \`changed_since\` names the version this draft was human-revised from.
- \`prior_review\` is the explicit path of the review being answered (it defaults from \`review\`); a re-review does not re-raise well-rebutted findings.
- \`resume_from\` is a section-granular resume point (1.x).
- \`sidecar: true\` emits the structured-output twin of §11.1 to \`.rhema/response-ledger.json\` — one row per finding — beside the markdown response ledger, and writes \`.rhema/phase-result.json {status}\` at the end of every phase. With \`sidecar\` absent the skill runs exactly as upstream.`,
    },
  ],

  // ---------------- bootstrap-persona (Quick Voice / Full Profile) ----------------
  "skills/bootstrap-persona/SKILL.md": [
    {
      op: "insertAfter",
      category: "inputs",
      anchor:
        '    description: "Default true. Run the Phase 4 held-out fidelity test. Disabling leaves the profile unfalsified — its accuracy becomes an assertion, and consuming skills have no measured expectation to check themselves against."',
      insert: SIX_INPUTS({
        order: "0, 1, 2, 3, 4, 5",
        scopeNote: "Quick Voice is scope = the census + close-reading + voice-print phases, no positions/calibration",
        sidecarList: "profile files are the artifacts; sidecar writes only .rhema/phase-result.json here",
      }),
    },
    {
      op: "insertAfter",
      category: "sidecar",
      anchor: "must not pretend to be built from thirty.",
      insert: `

## Rhema harness inputs and structured output (added at port — REQ-ARCH-5)

These are harness-neutral additions; the persona regimen is upstream-verbatim.

- \`phase\` runs one phase then stops (\`"N"\` = only phase N; \`"N+"\` = from N to the end); \`scope\` is Quick Voice = the census + close-reading + voice-print phases.
- \`changed_since\` / \`prior_review\` support the \`refresh\` and re-run paths; \`resume_from\` is a section-granular resume point (1.x).
- \`sidecar: true\` writes \`.rhema/phase-result.json {status}\` at the end of every phase; the persona profile files remain the artifacts (they have no additional JSON twin in the §11.1 set). With \`sidecar\` absent the skill runs exactly as upstream.`,
    },
    // ---- Q-11 edits (REQ-ARCH-8) ----
    {
      op: "replace",
      category: "q11",
      find: '    description: "Ethical mode — self | consented | house | study (see conventions/personas.md). Default: the seed\'s Mode field; absent, \'study\' is assumed (the most restrictive) and the assumption is reported prominently so the human can correct it."',
      replace:
        '    description: "Mode — self | consented | house | study (see conventions/personas.md). Metadata only (Q-11): recorded as personas.mode; it does not alter this skill\'s behavior. Default: the seed\'s Mode field, else \'self\'. Legal/impersonation exposure is stated once in the ToS/AUP, not gated here."',
    },
    {
      op: "replace",
      category: "q11",
      find: "8. **Respect the mode.** `usage` governs everything downstream. Under any mode\n   but `self` or `consented`, the profile carries a prominent header stating what\n   it may and may not be used for, and `positions.md` records only positions the\n   author demonstrably took, quoted and cited.",
      replace:
        "8. **Mode is metadata (Q-11).** `usage` is recorded (as `personas.mode`) and does\n   not alter what this skill does: it is not a gate on reading, measuring, or what\n   `positions.md` may record. Any legal/impersonation exposure is stated once in\n   the ToS/AUP, not enforced per mode here.",
    },
    {
      op: "replace",
      category: "q11",
      find: "2. **Settle `usage`.** From the seed's Mode, or the input, or default `study`\n   with a prominent report. If the mode is `consented`, record who consented and\n   how (one line, in `provenance.md`).",
      replace:
        "2. **Record `usage`.** From the seed's Mode, or the input, else `self`; store it\n   as metadata (`personas.mode`) — it does not change the pass. If the mode is\n   `consented`, record who consented and how (one line, in `provenance.md`).",
    },
    {
      op: "delete",
      category: "q11",
      find: ' Under any mode but `self`, this file is quotation-bound: no\n  extrapolated views, no "would probably argue."',
    },
    // ---- P1.14 reseed phase — declared at the CAPSTONE (2026-09-25). The `phase:"reseed"`
    // value + its Rhema-owned step section shipped in P1.14 (reseed_charter) without a manifest
    // declaration; REQ-SPEC-22 caught the drift at whole-chain verification. Category `inputs`:
    // both deltas extend and document the `phase` input's value domain.
    {
      op: "replace",
      category: "inputs",
      find: 'Phase indices follow this skill\'s own fallback order (0, 1, 2, 3, 4, 5)."',
      replace:
        'Phase indices follow this skill\'s own fallback order (0, 1, 2, 3, 4, 5). The Rhema-owned value \\"reseed\\" runs only the charter-reseed step (see \'Reseeding the voice charter\' below) — it is not one of the upstream six."',
    },
    {
      op: "insertAfter",
      category: "inputs",
      anchor: "   in the convention's closing section; do not oversell).",
      insert: `

## Phase reseed — Reseeding the voice charter *(Rhema-owned)*

A Rhema-owned step (added at port — P1.14; not one of the upstream six): after a
project adopts a rebuilt voice profile, the project's voice charter — the
\`agents/author/voice-charter.md\` consuming skills load — must be re-seeded from
the adopted profile so the voice-derived lines track the new truth.

The charter is two halves:

- **the seeded block** — every line above the \`## Guidance\` heading. These are
  the voice-derived lines (persona name, byline, register list, the voice-print
  pointers). Rewrite them from the mounted profile; they are yours to change.
- **the guidance section** — \`## Guidance\` and every line under it. These are
  the project's own edits to the seeded charter. They carry **verbatim** —
  byte-for-byte, no rewording, no reordering. The artifact kind's edit mode is
  guidance-only: guidance lines are outside this step's output scope, and the
  server-side diff the adopt dialog previewed treats any guidance change as a
  leak.

Steps:

1. Read the adopted profile's \`profile/index.md\` (mounted read-only) for the
   persona name, byline, and register list.
2. Read the current \`agents/author/voice-charter.md\` if it exists — for its
   guidance section only.
3. Write \`agents/author/voice-charter.md\`: the regenerated seeded block, a blank
   line, then the guidance section carried verbatim (or none if the charter had
   none).

If you produce no version, the server's deterministic reseed writes the same
shape — the seeded lines regenerate from the persona row and the guidance
carries. Either way, guidance bytes never change.`,
    },
  ],

  // ---------------- draft-from-outline (Draft) ----------------
  "skills/draft-from-outline/SKILL.md": [
    {
      op: "insertAfter",
      category: "inputs",
      anchor:
        '    description: "Default true: run to completion, taking the conservative option on open questions and flagging them in the drafting note. When false, pause once after the structure plan (Phase 2) — the last cheap moment to change the piece\'s shape."',
      insert: SIX_INPUTS({
        order: "0, 1, 2, 3, 4, 5, 6, 7",
        scopeNote:
          "a subset of the drafting phases (e.g. a one-section preview runs intake → plan → draft on the first planned section only)",
        sidecarList: "structure-plan.json, 03-claim-ledger.json",
      }),
    },
    {
      op: "insertAfter",
      category: "inputs",
      anchor:
        "    description: \"Rhema harness (REQ-ARCH-5, REQ-SPEC-4): when true, emit the structured-output sidecar twins of §11.1 under .rhema/ beside each markdown deliverable (structure-plan.json, 03-claim-ledger.json), and write .rhema/phase-result.json {status} at the end of every phase. Absent, the skill runs exactly as upstream.\"",
      insert: `
  - name: phase_output
    required: false
    description: "Rhema harness (REQ-ARCH-5): the exact dossier file(s) the pinned phase must write — supplied by the harness from the phase manifest so the write target never drifts from the completion oracle. When set, the pinned phase writes precisely these file(s) (comma-separated) before .rhema/phase-result.json."
  - name: replan
    required: false
    description: "Rhema harness (REQ-ARCH-5; §12.2 grounding → plan back-edge): on a re-run of the structure plan after a grounding failure, the failure context the re-plan must metabolize — which claims failed verification and why. The re-planned plan works around them; it never plans on a claim the ledger marked failed."
  - name: preview
    required: false
    description: "Rhema harness (REQ-ARCH-5; §7.6 trial preview): when set (e.g. {sections:1}), the Draft phase writes only the first planned section(s) of drafts/v<N>.md — a bounded first-section preview, not the whole piece. The remaining phases run unchanged over the partial draft."`,
    },
    {
      op: "insertAfter",
      category: "sidecar",
      anchor: "the ledger is what makes that free.",
      insert: `

## Rhema harness inputs and structured output (added at port — REQ-ARCH-5)

These are harness-neutral additions; the drafting regimen is upstream-verbatim.

- \`phase\` runs one phase then stops (\`"N"\` = only phase N; \`"N+"\` = from N to the end), indexed in this skill's own fallback order 0–7 (Delivery is phase \`7\`).
- \`scope\` narrows the run to a phase subset; \`changed_since\` / \`prior_review\` / \`resume_from\` support re-run and resume paths.
- \`sidecar: true\` emits the structured-output twins of §11.1 to \`.rhema/\` beside each markdown deliverable — \`structure-plan.json\` (Phase 2) and \`03-claim-ledger.json\` (Phase 3) — and writes \`.rhema/phase-result.json {status}\` at the end of every phase. With \`sidecar\` absent the skill runs exactly as upstream.
- \`phase_output\` names the exact file(s) the pinned phase must write, supplied by the harness from the phase manifest so the write target never drifts from the completion oracle. Honor it as authoritative.
- \`replan\` carries the grounding-failure context into a re-run of the structure plan (the §12.2 \`grounding → plan\` back-edge). When present, the plan re-runs around the failed claims — it must not plan on a claim the ledger marked failed, and the re-plan is noted in both the plan and the ledger.
- \`preview\` bounds the Draft phase to the first planned section(s) (the §7.6 first-section preview); every other phase runs unchanged.
- Under the harness the Phase-2 \`autonomous=false\` pause is the harness's Approve-plan gate — the plan is committed, the run parks for the human's decision (approve / edit / keep planning / stop), and the gate's edits arrive as a rewritten \`02-structure-plan.md\` (and its \`.json\` twin) at the next phase's materialization. The upstream \`autonomous\` input still governs standalone runs.

### Per-phase artifacts under harness execution (REQ-ARCH-5)

Run one phase at a time (\`phase="N"\`), each phase runs in a fresh context and communicates only through files — write exactly the file(s) \`phase_output\` names (equivalently, the row below for the pinned phase), then \`.rhema/phase-result.json {"status":"done"}\`:

| Phase (fallback order) | \`phase\` | File(s) to write |
|---|---|---|
| Intake | \`0\` | \`agents/author/drafting/v<N>/00-commissioning-brief.md\` |
| Voice | \`1\` | \`agents/author/drafting/v<N>/01-voice-brief.md\` |
| Structure plan | \`2\` | \`agents/author/drafting/v<N>/02-structure-plan.md\` (+ \`.rhema/structure-plan.json\`) |
| Grounding | \`3\` | \`agents/author/drafting/v<N>/03-claim-ledger.md\` (+ \`.rhema/03-claim-ledger.json\`) |
| Draft | \`4\` | \`drafts/v<N>.md\` (+ \`agents/author/drafting/v<N>/04-draft-ledger.md\`) |
| Consolidation | \`5\` | \`agents/author/drafting/v<N>/05-consolidation-notes.md\` |
| Fidelity audit | \`6\` | \`agents/author/drafting/v<N>/06-fidelity-audit.md\` |
| Delivery | \`7\` | \`correspondence/v<N>-drafting-note.md\` |

The pinned phase reads the prior phases' dossier files it needs from the materialized workspace rather than re-deriving them; it never treats the presence of an earlier phase's files, or a stale \`.rhema/phase-result.json\`, as evidence its own phase is done — it produces its declared file regardless.

Drafting is serial under the harness (REQ-WF-4): the Draft phase writes one section at a time in the plan's reading order, recording each in \`04-draft-ledger.md\` as it closes — it never fans sections out to parallel subagents, and no drafting subagent exists to delegate to. When Phase 3 cannot verify claims the plan depends on, it reports \`{"status":"replan"}\` in \`.rhema/phase-result.json\` — the harness re-runs Phase 2 with the failure as input (at most twice; a third failure escalates to a human decision rather than looping).

### Sidecar JSON — the EXACT shape the harness validates (REQ-SPEC-12)

When \`sidecar: true\`, each \`.json\` twin is validated at commit against a strict schema; a shape mismatch fails the phase (\`sidecar_validates\`). Emit **exactly** these structures. Every sidecar carries the envelope keys \`"sidecar"\` and \`"version": 1\`; unknown extra keys are ignored; the listed enum tokens are the accepted values (case / spaces / hyphens are canonicalized to snake_case, and a numeric string like \`"1"\` is accepted for a numeric field).

**\`structure-plan.json\`** (Phase 2) — the spine + the section map:

\`\`\`json
{
  "sidecar": "structure_plan",
  "version": 1,
  "spine": ["the argument's claims, in order — each a claim, not a topic"],
  "sections": [
    { "ref": "I", "title": "Opening — the Minneapolis scene", "targetWords": 700, "purpose": "make the abstraction concrete" }
  ],
  "alternativesConsidered": ["the outline's own seven-stage order"],
  "gaps": ["the counterargument's actual text — a Phase-3 research task"]
}
\`\`\`

Required: \`spine\` (string array — the gate requires ≥3 entries) and \`sections\` (one row per section: \`ref\`, \`title\`; \`targetWords\`/\`purpose\`/\`anchor\` optional).

\`anchor\` — **omit it on a forward plan.** A plan for new writing has no source text to anchor to, so a section row is \`{ "ref", "title", "targetWords"?, "purpose"? }\` and nothing else — never a prose placeholder like \`"heading + single descriptive sentence"\` and never a non-canonical object like \`{ "kind", "detail" }\` or \`{ "source", "location" }\` (the validator rejects every non-canonical shape). An \`anchor\` is allowed **only** when the plan reverse-outlines an existing draft, and then it is exactly \`{"blockId": <string>, "quote": <string>, "startOffset": <int>, "endOffset": <int>, "confidence": <0-1>}\` (optional \`"unanchored": true\`).

**\`03-claim-ledger.json\`** (Phase 3) — one row per claim in \`03-claim-ledger.md\`, the same \`claim_ledger\` envelope the reviewer's verification ledger uses:

\`\`\`json
{
  "sidecar": "claim_ledger",
  "version": 1,
  "claims": [
    {
      "ordinal": 0,
      "text": "the claim, quoted from the outline",
      "tier": 1,
      "verdict": "verified",
      "kind": "factual",
      "sourceCheck": "matches_citation",
      "sources": [
        { "url": "https://example.org/x", "normalizedUrl": "https://example.org/x", "accessedAt": "2026-09-09T00:00:00Z", "stance": "supports" }
      ],
      "note": "the drafting instruction — use as-is / rescoped / with attribution / do not use"
    }
  ]
}
\`\`\`

Required per claim row: \`ordinal\` (integer ≥ 0), \`text\`, \`tier\` (1, 2, or 3), \`verdict\`. \`verdict\` ∈ {\`verified\`, \`substantially_accurate\`, \`misleading_in_context\`, \`unsupported\`, \`contradicted\`, \`unverifiable\`, \`verified_against_user_source\`}. \`kind\` ∈ {\`factual\`, \`statistical\`, \`quotation\`, \`interpretive\`, \`normative\`, \`predictive\`}. \`sourceCheck\` ∈ {\`matches_citation\`, \`reputable_list\`, \`from_search\`, \`suspicious_source\`}. A source's \`stance\` ∈ {\`supports\`, \`contradicts\`, \`contextualizes\`}.

**Closure** (same gate as the review's verification ledger): every row must carry a REAL disposition — a
row whose verdict is \`unverifiable\` is a completed check only when it carries WHY (\`note\`, and/or the
trail you tried: \`url\`/\`normalizedUrl\`/\`accessedAt\`/\`sourceCheck\`/non-empty \`sources\`). A bare
\`unverifiable\` row asserts nothing was checked; the phase's \`claim_ledger_closed\` gate refuses it.`,
    },
  ],

  // ---------------- conventions/personas.md (Q-11 + persona resolution) ----------------
  "conventions/personas.md": [
    {
      op: "insertAfter",
      category: "persona-resolution",
      anchor: "## Resolution\n",
      insert:
        "\n**Under the Rhema harness (added at port — persona resolution):** a run's persona is materialized by the server at `/work/personas/<id>` (the seat's mount, §12.6); `personas_dir` is `/work/personas` and the id resolves to `/work/personas/<id>/PERSONA.md` directly — the discovery walk below does not run inside a run sandbox. The discovery order applies to standalone / CLI use.\n",
    },
    {
      op: "delete",
      category: "q11",
      find: " — and for a non-`self` persona, supplying it does not enlarge what the\n  mode permits",
    },
    {
      op: "delete",
      category: "q11",
      find: ", and `positions.md` for a non-`self` persona\n  records only what they demonstrably argued, quoted and cited",
    },
  ],
};
