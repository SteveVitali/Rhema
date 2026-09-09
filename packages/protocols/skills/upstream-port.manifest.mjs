// The sanctioned-delta contract (REQ-ARCH-5 amended, spec §12.2) — PRIVATE, versioned with the port.
//
// It pins the upstream ~/agent-discourse commit and declares, per ported file, the EXACT ordered
// transforms that turn the pinned-upstream file into the ported file. The applier
// (scripts/lib/upstream-port.mjs) both GENERATES the ported files from this and VERIFIES them against
// it, so a ported skill differs from upstream by these edits and nothing else (REQ-SPEC-22: drift is
// a fork, not a diff). Every op's `category` must be in SANCTIONED_CATEGORIES.
//
// Ported skills: editorial-review, respond-to-review, bootstrap-persona. draft-from-outline /
// outline-from-research / research_burst are deliberately deferred to the full-IDE phase (§17).

export const upstreamRepo = "agent-discourse";
export const upstreamCommit = "5fef4165042b080c1d4c6becc281dc5ce8860cb3";

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

Required per claim row: \`ordinal\` (integer ≥ 0), \`text\` (string), \`tier\` (1, 2, or 3), \`verdict\`. All else is
optional. \`verdict\` ∈ {\`verified\`, \`substantially_accurate\`, \`misleading_in_context\`, \`unsupported\`,
\`contradicted\`, \`unverifiable\`, \`verified_against_user_source\`}. \`kind\` ∈ {\`factual\`, \`statistical\`,
\`quotation\`, \`interpretive\`, \`normative\`, \`predictive\`}. \`sourceCheck\` ∈ {\`matches_citation\`, \`reputable_list\`,
\`from_search\`, \`suspicious_source\`}. A source's \`stance\` ∈ {\`supports\`, \`contradicts\`, \`contextualizes\`}.

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
