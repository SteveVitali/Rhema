// `02-structure-plan.md` → `structurePlanSidecar` (R2 §2.5, normative; REQ-CONV-2). Only the two
// tabular sections convert: `## The spine` numbered items (trailing `*(§)*` stripped) and the
// `## Section map` rows (`ref` = the § cell with `—` → `S<i>`, `title` bold-stripped,
// `targetWords` = Budget, `purpose` = Function). No anchors — this is a forward plan, not a
// reverse outline (R2 §2.5). The Entry→exit, Material, Promise/payoff, Apparatus and Cut-list
// sections render raw from the markdown itself (R2 §6).

import type { StructurePlanSidecar } from "@rhema/contracts";
import { parseSidecar } from "@rhema/protocols";
import { headingSections, listItems, tables } from "./md/sections.js";
import { bad, fail, ok, type Conversion, type Diagnostic } from "./result.js";

const SPINE_TAIL_RE = /\s*\*?\(§[^)]*\)\*?\s*$/;
const BOLD_RE = /\*\*([^*]+)\*\*/g;

export interface StructurePlanMeta {
  readonly spine: number;
  readonly sections: number;
}

export interface StructurePlanOutput {
  readonly sidecar: StructurePlanSidecar;
  readonly meta: StructurePlanMeta;
}

/** Convert one sanitized `02-structure-plan.md` into a validated `structurePlanSidecar`. A plan
 *  with no spine items or no section-map rows fails closed (REQ-CONV-2); a `parseSidecar`
 *  `failed` aborts with no partial output. */
export function convertStructurePlan(
  markdown: string,
): Conversion<StructurePlanOutput> {
  const diagnostics: Diagnostic[] = [];
  const h2s = headingSections(markdown, 2);

  // ## The spine — numbered items, `*(§)*` locators stripped (R2 §2.5).
  const spineSec = h2s.find((s) => /spine/i.test(s.heading));
  const spine = (spineSec ? listItems(spineSec.body) : [])
    .map((i) => i.text.replace(SPINE_TAIL_RE, "").trim())
    .filter((t) => t !== "");
  if (spine.length === 0)
    diagnostics.push(fail("no_spine", "structure plan carries no `## The spine` items"));

  // ## Section map — `§ | Title | Budget | Function` rows.
  const mapSec = h2s.find((s) => /section map|sections/i.test(s.heading));
  const sections: StructurePlanSidecar["sections"][number][] = [];
  if (mapSec) {
    for (const t of tables(mapSec.body)) {
      const [head, ...body] = t;
      if (head === undefined) continue;
      const iRef = head.findIndex((h) => /^(§|ref|section)$/i.test(h.trim()));
      if (iRef < 0) continue;
      const iTitle = head.findIndex((h) => /^title/i.test(h.trim()));
      const iBudget = head.findIndex((h) => /^budget/i.test(h.trim()));
      const iFn = head.findIndex((h) => /^(function|purpose)/i.test(h.trim()));
      body.forEach((r, i) => {
        const ref = (r[iRef] ?? "").trim();
        const title = ((r[iTitle] ?? "") || "")
          .replace(BOLD_RE, "$1")
          .trim();
        const words = Number((r[iBudget] ?? "").replace(/[^\d]/g, ""));
        sections.push({
          ref: ref === "" || ref === "—" ? `S${i + 1}` : ref,
          title,
          ...(Number.isFinite(words) && (r[iBudget] ?? "").trim() !== ""
            ? { targetWords: words }
            : {}),
          ...((r[iFn] ?? "").trim() !== "" ? { purpose: (r[iFn] ?? "").trim() } : {}),
        });
      });
    }
  }
  if (sections.length === 0)
    diagnostics.push(fail("no_sections", "structure plan carries no `## Section map` rows"));

  if (diagnostics.some((d) => d.severity === "error")) return bad(diagnostics);

  const gate = parseSidecar("structure-plan.json", {
    json: { sidecar: "structure_plan", version: 1, spine, sections },
  });
  if (gate.parseStatus === "failed") {
    for (const e of gate.errors) diagnostics.push(fail("sidecar_failed", e));
    return bad(diagnostics);
  }

  return ok(
    {
      sidecar: gate.value as StructurePlanSidecar,
      meta: { spine: spine.length, sections: sections.length },
    },
    diagnostics,
  );
}
