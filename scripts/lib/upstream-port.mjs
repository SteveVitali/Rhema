/**
 * Deterministic skill-port transform applier (REQ-ARCH-5 amended, spec §12.2).
 *
 * A ported skill/convention file MUST equal the pinned upstream file transformed by ONLY the
 * sanctioned edits: the six harness-neutral inputs, the `.rhema/phase-result.json` output, the
 * `sidecar: true` structured-output emission (with explicit severity — REQ-SPEC-4 — and the
 * re-review `carriesObligationId` — REQ-OBJ-4), the Q-11 edits (REQ-ARCH-8), the
 * persona-resolution edit, and the P1.14 `reseed` charter-reseed phase (REQ-WF-11 / §9.6). This
 * module is the side-effect-free engine that both the port generator
 * (`--write`) and the upstream-diff CI check (`scripts/check-upstream-diff.mjs`) run, so "generate"
 * and "verify" can never disagree, and any later hand-edit to a ported file that is not expressed as
 * a sanctioned op is caught as drift (REQ-SPEC-22: drift is a fork, not a diff).
 *
 * Every op carries a `category` drawn from SANCTIONED_CATEGORIES; an op with any other category is
 * itself a violation, so the sanctioned-delta set is closed by construction and enumerable as data.
 */

/** The only edit categories REQ-ARCH-5 (amended) sanctions. Any other category fails the contract. */
export const SANCTIONED_CATEGORIES = Object.freeze([
  "inputs", // the six harness inputs: phase / scope / changed_since / prior_review / resume_from / sidecar
  "phase-result", // the `.rhema/phase-result.json` output written at the end of every phase
  "sidecar", // structured-output emission behind `sidecar: true` (incl. explicit severity, carriesObligationId)
  "q11", // REQ-ARCH-8: drop usage=study default+report, the non-self positions.md quotation-bound rule, docs/-enlargement
  "persona-resolution", // resolve personas from the harness mount (/work/personas/<id>)
  "reseed", // P1.14 (REQ-WF-11 / §9.6): the Rhema-owned `phase=reseed` charter-reseed step documented in bootstrap-persona (the reseed_charter workflow's skill phase)
]);

class PortError extends Error {}

/** Count non-overlapping occurrences of `needle` in `hay`. */
function count(hay, needle) {
  if (needle === "") throw new PortError("empty match string");
  let n = 0;
  let i = 0;
  for (;;) {
    const at = hay.indexOf(needle, i);
    if (at === -1) return n;
    n++;
    i = at + needle.length;
  }
}

/**
 * Apply one sanctioned op to `text`, returning the new text. Each op's anchor/find must occur
 * EXACTLY once, so a transform can never silently land in the wrong place or match nothing.
 *
 * Ops:
 *   { op: "insertAfter", anchor, insert, category }  — insert `insert` immediately after `anchor`.
 *   { op: "replace",     find,   replace, category } — replace the unique `find` block with `replace`.
 *   { op: "delete",      find,            category } — remove the unique `find` block.
 */
export function applyOp(text, op) {
  if (!SANCTIONED_CATEGORIES.includes(op.category)) {
    throw new PortError(`op category "${op.category}" is not sanctioned (REQ-ARCH-5)`);
  }
  if (op.op === "insertAfter") {
    const c = count(text, op.anchor);
    if (c !== 1)
      throw new PortError(
        `insertAfter anchor found ${c}× (need 1): ${JSON.stringify(op.anchor.slice(0, 60))}`,
      );
    return text.replace(op.anchor, op.anchor + op.insert);
  }
  if (op.op === "replace") {
    const c = count(text, op.find);
    if (c !== 1)
      throw new PortError(
        `replace find found ${c}× (need 1): ${JSON.stringify(op.find.slice(0, 60))}`,
      );
    return text.replace(op.find, op.replace);
  }
  if (op.op === "delete") {
    const c = count(text, op.find);
    if (c !== 1)
      throw new PortError(
        `delete find found ${c}× (need 1): ${JSON.stringify(op.find.slice(0, 60))}`,
      );
    return text.replace(op.find, "");
  }
  throw new PortError(`unknown op "${op.op}"`);
}

/** Apply an ordered list of sanctioned ops to the upstream text. */
export function applyOps(upstreamText, ops) {
  return ops.reduce((acc, op) => applyOp(acc, op), upstreamText);
}

export { PortError };
