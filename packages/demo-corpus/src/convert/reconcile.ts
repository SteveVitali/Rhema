// Second-read ↔ letter reconciliation (R2 §2.2; REQ-CONV-8). The `reconciliation` override file
// is AUTHORITATIVE; the R2 overlap heuristic runs as a lint — a disagreement between the
// heuristic-ruled outcome and the override is a build warning in diagnostics, never a silent
// adoption.
//
// Ruled order for an objection with no override: (1) an explicit rejection in the letter's
// Considered-and-rejected wins over a merge; (2) an explicit mention in a major
// ("the second reader's objection 2.4") merges; (3) the overlap heuristic merges when
// title+body vs the major's title+problem scores ≥ 0.15 and ≥ 2× the runner-up; (4) otherwise
// the objection stands alone as a second-read finding (`kept`).

import { warn, type Diagnostic } from "./result.js";
import type { OverrideBook, ReconciliationOverride } from "./overrides.js";
import type { LetterMajor, ParsedLetter } from "./letter.js";
import type { ParsedSecondRead, SecondReadObjection } from "./second-read.js";

export type ReconciliationOutcome =
  | { readonly kind: "merged"; readonly major: number }
  | { readonly kind: "kept" }
  | { readonly kind: "rejected" };

export interface Reconciliation {
  /** objection label → outcome. */
  readonly outcomes: ReadonlyMap<string, ReconciliationOutcome>;
  /** major number → the objection labels merged into it. */
  readonly mergedInto: ReadonlyMap<number, readonly string[]>;
  readonly diagnostics: readonly Diagnostic[];
}

// R2 §2.2 thresholds, verbatim.
export const OVERLAP_FLOOR = 0.15;
export const MARGIN_RATIO = 2;
const REJECT_TITLE_FLOOR = 0.35;
const SLICE = 900;

const STOP = new Set(
  "the a an and or of to in is it its that this as on for with by be are was not no but from at which what essay piece draft section own one their they its has have".split(
    " ",
  ),
);
const toks = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );

export function textOverlap(a: string, b: string): number {
  const A = toks(a);
  const B = toks(b);
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return i / Math.max(1, Math.min(A.size, B.size));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An explicit `second read('s) (objection) <label>` mention inside a major's own text. */
function explicitMerge(o: SecondReadObjection, majors: readonly LetterMajor[]): number | null {
  const re = new RegExp(
    `second read(?:er)?(?:'s)?(?: objection)?\\s*\\(?${esc(o.label)}\\)?(?![\\d.])`,
    "i",
  );
  const hit = majors.find((m) => re.test([...m.labels, m.where, m.problem].join(" ")));
  return hit?.n ?? null;
}

/** An explicit rejection in Considered-and-rejected (label mention or title overlap ≥ 0.35). */
function explicitRejection(o: SecondReadObjection, letter: ParsedLetter): boolean {
  return letter.considered.some(
    (c) =>
      c.origin === "second_read" &&
      (new RegExp(`(?:objection|obj\\.?)\\s*\\(?${esc(o.label)}\\)?\\b`, "i").test(
        c.title + " " + c.raw,
      ) ||
        textOverlap(o.title, c.title + " " + c.raw.slice(0, 300)) >= REJECT_TITLE_FLOOR),
  );
}

/** The overlap heuristic: best-scoring major at ≥ floor and ≥ 2× the runner-up. */
function heuristicMerge(
  o: SecondReadObjection,
  majors: readonly LetterMajor[],
): { major: number; score: number } | null {
  const scored = majors
    .map((m) => ({
      n: m.n,
      s: textOverlap(
        o.title + " " + o.body.slice(0, SLICE),
        m.title + " " + m.problem.slice(0, SLICE),
      ),
    }))
    .sort((x, y) => y.s - x.s);
  const best = scored[0];
  if (best && best.s >= OVERLAP_FLOOR && best.s >= MARGIN_RATIO * (scored[1]?.s ?? 0))
    return { major: best.n, score: best.s };
  return null;
}

/** The ruled outcome without overrides — deterministic signals first, heuristic last. */
function ruledOutcome(
  o: SecondReadObjection,
  letter: ParsedLetter,
): ReconciliationOutcome {
  if (explicitRejection(o, letter)) return { kind: "rejected" };
  const explicit = explicitMerge(o, letter.majors);
  if (explicit !== null) return { kind: "merged", major: explicit };
  const h = heuristicMerge(o, letter.majors);
  if (h) return { kind: "merged", major: h.major };
  return { kind: "kept" };
}

const same = (a: ReconciliationOutcome, b: ReconciliationOutcome): boolean =>
  a.kind === b.kind && (a.kind !== "merged" || (b.kind === "merged" && a.major === b.major));

/**
 * Reconcile every second-read objection. An override row for the label is authoritative; when
 * the heuristic-ruled outcome disagrees with it, `reconcile_disagreement` warns in diagnostics
 * (REQ-CONV-8). Rows are consumed from `overrides` via `take` — an unconsumed reconciliation
 * row fails downstream in `convertFindings`.
 */
export function reconcileSecondRead(
  letter: ParsedLetter,
  secondRead: ParsedSecondRead,
  overrides?: OverrideBook,
): Reconciliation {
  const diagnostics: Diagnostic[] = [];
  const outcomes = new Map<string, ReconciliationOutcome>();
  const merged = new Map<number, string[]>();

  for (const o of secondRead.objections) {
    const ruled = ruledOutcome(o, letter);
    const ov = overrides?.take(
      "reconciliation",
      (r) => (r as ReconciliationOverride).objection === o.label,
    ) as ReconciliationOverride | undefined;
    let outcome = ruled;
    if (ov) {
      outcome =
        ov.outcome === "merged"
          ? { kind: "merged", major: ov.major ?? 0 }
          : ov.outcome === "rejected"
            ? { kind: "rejected" }
            : { kind: "kept" };
      if (!same(outcome, ruled))
        diagnostics.push(
          warn(
            "reconcile_disagreement",
            `override reconciles objection ${o.label} as ${ov.outcome}` +
              (ov.outcome === "merged" ? `→major ${ov.major}` : "") +
              `; the letter-ruled outcome was ${ruled.kind}` +
              (ruled.kind === "merged" ? `→major ${ruled.major}` : "") +
              ` (cite ${ov.cite}) — the override is authoritative`,
          ),
        );
    }
    outcomes.set(o.label, outcome);
    if (outcome.kind === "merged")
      merged.set(outcome.major, [...(merged.get(outcome.major) ?? []), o.label]);
  }
  return { outcomes, mergedInto: merged, diagnostics };
}
