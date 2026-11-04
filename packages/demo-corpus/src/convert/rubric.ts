// Scorecard → `rubricSidecar` (R2 §2.3, normative; REQ-CONV-9). Dimension names go through the
// explicit RUBRIC_NAME_MAP (letter.ts) — `coercedEnum` cannot rescue `&`-names, so an unmapped
// name fails the conversion. A `cap` is emitted ONLY where the Basis states one
// (`cap(ped)?|by rule|rubric cap`), with `at = min(score, 4)`, `reason` = the Basis verbatim and
// `entailedByFindingOrdinal` = the first cited major's findings ordinal. No aggregate is
// computed or emitted — "Lowest dimensions" prose and "No aggregate score." render raw (R2 §6;
// REQ-IDE-30 holds trivially).

import type { RubricSidecar } from "@rhema/contracts";
import { parseSidecar } from "@rhema/protocols";
import { parseLetter } from "./letter.js";
import { bad, fail, ok, type Conversion, type Diagnostic } from "./result.js";

export interface RubricContext {
  /** findings ordinal per major index (`[major1→ordinal, …]`); defaults to the findings
   *  emission order (one_thing at 0, majors 1..n). */
  readonly majorOrdinals?: readonly number[];
}

export interface RubricOutput {
  readonly sidecar: RubricSidecar;
  /** Scorecard dimension names that mapped — empty `unmapped` is the contract. */
  readonly meta: { readonly dimensions: number; readonly capped: readonly string[] };
}

export function convertRubric(
  letterMarkdown: string,
  ctx: RubricContext = {},
): Conversion<RubricOutput> {
  const diagnostics: Diagnostic[] = [];
  const letter = parseLetter(letterMarkdown);
  // Dimension-name errors are fatal here (they warn inside parseLetter for findings' sake).
  for (const d of letter.diagnostics)
    if (d.code === "dimension_unmapped") diagnostics.push(fail(d.code, d.message));
  if (letter.scorecard.length === 0)
    diagnostics.push(fail("no_scorecard", "letter carries no `## Scorecard` table"));

  const majorOrdinal = (n: number) =>
    ctx.majorOrdinals?.[n - 1] ?? n; // one_thing=0, majors 1..n — the declared emission order

  const dimensions = letter.scorecard.map((d) => ({
    dimension: d.dimension,
    score: d.score,
    ...(d.capped
      ? {
          cap: {
            at: Math.min(d.score, 4) as 1 | 2 | 3 | 4,
            reason: d.basis,
            ...(d.cites.length > 0 ? { entailedByFindingOrdinal: majorOrdinal(d.cites[0]!) } : {}),
          },
        }
      : {}),
  }));

  if (diagnostics.some((d) => d.severity === "error")) return bad(diagnostics);
  const gate = parseSidecar("rubric.json", {
    json: { sidecar: "rubric", version: 1, dimensions },
  });
  if (gate.parseStatus === "failed") {
    for (const e of gate.errors) diagnostics.push(fail("sidecar_failed", e));
    return bad(diagnostics);
  }
  return ok(
    {
      sidecar: gate.value as RubricSidecar,
      meta: {
        dimensions: dimensions.length,
        capped: dimensions.filter((d) => d.cap).map((d) => d.dimension),
      },
    },
    diagnostics.filter((d) => d.severity === "warning").concat(
      letter.diagnostics.filter((d) => d.code !== "dimension_unmapped"),
    ),
  );
}
