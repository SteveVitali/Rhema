// Vega-Lite spec validation (§7.5; REQ-VIZ-6): the spec phase's pre-compile gate. The validator's
// errors are the feedback text the retry loop feeds back into spec generation (≤3 attempts — the
// run's `MAX_SPEC_ATTEMPTS`), so each error is a plain string the model can act on.

import { compile } from "vega-lite";

/** The §7.5 retry bound — "schema-validated, ≤3 retries" (REQ-VIZ-6). */
export const MAX_SPEC_ATTEMPTS = 3 as const;

export interface VegaLiteValidation {
  readonly ok: boolean;
  /** human/model-readable reasons the spec failed (empty when ok). */
  readonly errors: readonly string[];
}

const CONTAINER_KEYS = ["layer", "hconcat", "vconcat", "concat", "facet", "repeat"] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Structural checks vega-lite's compile won't name clearly — run BEFORE compile so the retry
 *  feedback names the missing piece, not a downstream assembly error. */
function structuralErrors(spec: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const hasContainer = CONTAINER_KEYS.some((k) => spec[k] != null);
  if (spec.mark == null && !hasContainer) {
    errors.push("spec has neither `mark` nor a composition operator (layer/concat/facet/repeat)");
  }
  if (spec.data == null) {
    errors.push("spec has no `data` — the figure's data.csv must be bound as `data.values`");
  }
  if (spec.mark != null && spec.encoding == null && !hasContainer) {
    errors.push("unit spec has a `mark` but no `encoding`");
  }
  if (spec.transform != null && !Array.isArray(spec.transform)) {
    errors.push("`transform` must be an array");
  }
  return errors;
}

/**
 * Validate a Vega-Lite spec: structural checks first, then the real `compile` as the schema
 * authority (it normalizes + assembles; an invalid spec throws with the library's own message).
 * Pure — never mutates `spec`.
 */
export function validateVegaLiteSpec(spec: unknown): VegaLiteValidation {
  if (!isObject(spec)) {
    return { ok: false, errors: ["spec is not a JSON object"] };
  }
  const errors = structuralErrors(spec);
  if (errors.length > 0) return { ok: false, errors };
  try {
    compile(spec as unknown as Parameters<typeof compile>[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [msg] };
  }
  return { ok: true, errors: [] };
}
