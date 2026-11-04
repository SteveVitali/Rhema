// The review-level `labels.json` side-table (REQ-CONV-4 base, extended per REQ-CONV-14). 215
// landed the `{ordinal, id}` claims map; this module owns the grown shape: per-review
// `findings[]` source ids (with aliases the response-ledger join resolves — `SR n` rides its
// reconciled major), a per-field `importRule` marker for EVERY converter-assigned field
// (severity, kind, origin, reconciliation, plus 215's `stance`/`accessedAt`), and the S-10 role
// vocabulary generated display text is built from. R2 §7 R1 is the honesty rule behind it:
// these fields are never stated in the corpus — the label is what keeps an import-rule
// assignment from masquerading as the editor's own words.
//
// One `labels.json` per review dir, assembled here (`reviewLabels`) so each converter emits only
// its own labels slice and no two passes write the same file.

import { lintCopy } from "@rhema/contracts";

/** The marker text every converter-assigned field carries wherever it is displayed (R2 §7 R1). */
export const IMPORT_RULE_NOTE = "assigned by import rule";

/** Every converter-assigned field, by sidecar-json path. The test in findings.test.ts fails a
 *  field that lands in a sidecar without a marker — the list is the declared registry, and
 *  `importRule` mirrors it 1:1. `kind`/`severity`/`origin`/`reconciliation` are the 216 set;
 *  `sources[].stance`/`accessedAt` are 215's declared approximations (R2 §7 R2); the evidence
 *  `accessed` stamp is the same approximation on the findings side. */
export const CONVERTER_ASSIGNED_FIELDS = {
  claims: ["claims[].sources[].stance", "claims[].accessedAt", "claims[].sources[].accessedAt"],
  findings: [
    "findings[].kind",
    "findings[].severity",
    "findings[].origin",
    "findings[].reconciliation",
    "findings[].evidence.urls[].accessed",
  ],
} as const;

/** A finding's source id in the corpus vocabulary (`Major 1`, `SR 1`, `OQ 1`, `Strength 2`) —
 *  the join key 217's `Source`-cell resolution reads. `aliases` carry the extra source ids a
 *  merged or relocated row also answers to (a reconciled second-read objection rides its major). */
export interface FindingLabel {
  readonly ordinal: number;
  readonly id: string;
  readonly aliases?: readonly string[];
}

/** The S-10 role vocabulary (spec §3.3; GD-DEMO-ROLES.R7) for any generated label that names a
 *  participant — "author" is the human only (cross-cutting invariant 1/19). */
export const ROLES = {
  writer: "the writer",
  editor: "the editor (agent)",
  revising: "the revising agent",
  drafting: "the drafting agent",
} as const;

export interface ReviewLabels {
  readonly version: 1;
  readonly claims?: readonly { ordinal: number; id: string }[];
  readonly findings?: readonly FindingLabel[];
  /** Per-field "assigned by import rule" markers (REQ-CONV-14). */
  readonly importRule: Readonly<Record<string, string>>;
  readonly roles: typeof ROLES;
}

/**
 * Assemble the review-level `labels.json`: the converters' own source-id tables plus the full
 * import-rule marker set for whichever artifacts were emitted. Deterministic — sorted marker
 * keys, caller-ordered id rows.
 */
export function reviewLabels(parts: {
  readonly claims?: readonly { ordinal: number; id: string }[];
  readonly findings?: readonly FindingLabel[];
}): ReviewLabels {
  const fields = [
    ...(parts.claims ? CONVERTER_ASSIGNED_FIELDS.claims : []),
    ...(parts.findings ? CONVERTER_ASSIGNED_FIELDS.findings : []),
  ];
  return {
    version: 1,
    ...(parts.claims ? { claims: parts.claims } : {}),
    ...(parts.findings ? { findings: parts.findings } : {}),
    importRule: Object.fromEntries(
      [...fields].sort().map((f) => [f, IMPORT_RULE_NOTE] as const),
    ),
    roles: ROLES,
  };
}

/**
 * REQ-CONV-14's lint half: every string this file generates (marker text, role labels, source
 * ids) must pass `lintCopy` — demo label copy never uses "author" for an agent, and stays
 * inside the reserved-strings rules. Returns the violation list for the caller's diagnostic or
 * a test's `toEqual([])`.
 */
export function lintGeneratedLabels(labels: ReviewLabels): ReturnType<typeof lintCopy> {
  const entries: [string, string][] = [
    ["importRuleNote", IMPORT_RULE_NOTE],
    ...Object.entries(ROLES).map(([k, v]) => [`roles.${k}`, v] as [string, string]),
    ...(labels.claims ?? []).map((c) => [`claims[${c.ordinal}].id`, c.id] as [string, string]),
    ...(labels.findings ?? []).flatMap((f) =>
      [f.id, ...(f.aliases ?? [])].map(
        (id): [string, string] => [`findings[${f.ordinal}].id`, id],
      ),
    ),
  ];
  return lintCopy(entries);
}
