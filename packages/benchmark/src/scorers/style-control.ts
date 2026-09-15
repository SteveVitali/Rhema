// Style-perturbed control (REQ-EVAL-9 C-e; deterministic). "Style-perturbed controls — the same draft 'laundered'
// (surface-polished, substance unchanged) must not score materially higher, or the judge is measuring fluency, not
// argument." This is the deterministic guard that pairs an original score with its laundered-twin score and flags a
// material rise. It applies to ANY score that should be substance-driven (the deterministic scorers here, and — in
// P0.14 — the LLM judges, which are disqualified if they fail it). A laundered twin whose SUBSTANCE is unchanged
// should move the score by no more than `tolerance`.

export interface StyleControlResult {
  readonly original: number;
  readonly laundered: number;
  /** laundered − original. */
  readonly delta: number;
  /** true when the laundered twin scored materially HIGHER — the metric is tracking fluency, not substance. */
  readonly materiallyHigher: boolean;
  readonly tolerance: number;
}

/**
 * Compare a score on a draft against the score on its laundered twin. A rise beyond `tolerance` fails the control.
 * (A DROP is not a failure of this control — laundering should not IMPROVE a substance score; a fall is separately
 * suspicious but not what C-e guards.)
 */
export function styleControl(
  original: number,
  laundered: number,
  tolerance = 0.05,
): StyleControlResult {
  const delta = laundered - original;
  return { original, laundered, delta, materiallyHigher: delta > tolerance, tolerance };
}
