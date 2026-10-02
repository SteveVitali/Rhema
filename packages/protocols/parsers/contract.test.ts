import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SIDECAR_REGISTRY } from "@rhema/contracts";
import { WORKFLOW_MANIFESTS, pathToKind, type WorkflowManifest } from "../src/index.js";
import { PARSERS } from "./index.js";
import { SERIALIZABLE_SIDECARS } from "../serializers/index.js";

// AC2 (REQ-SPEC-22): the manifest ↔ SKILL.md contract test. It extracts phase headings, sidecar names,
// opt-out flags and artifact filenames from each ported SKILL.md and asserts equality with the manifests,
// the path→kind map (F11), the parsers and the serializers. Drift (e.g. a renamed phase heading) is a
// fork, not a diff — it turns this test red.

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readSkill = (skill: string): string =>
  readFileSync(resolve(PKG_ROOT, "skills", skill, "SKILL.md"), "utf8");

// One primary (full) manifest per ported skill; scope-variants (fact_check / refresh_voice /
// calibrate_voice) reuse the same SKILL.md and are checked for the ⊆ properties only.
const PRIMARY: Record<string, string> = {
  "editorial-review": "review",
  "respond-to-review": "revise",
  "bootstrap-persona": "profile_voice",
  "draft-from-outline": "draft",
};

const manifests = Object.values(WORKFLOW_MANIFESTS) as WorkflowManifest[];
const bySkill = new Map<string, WorkflowManifest[]>();
for (const m of manifests) (bySkill.get(m.skill) ?? bySkill.set(m.skill, []).get(m.skill)!).push(m);

// ---- pure extractors over SKILL.md text (so a mutated copy can be driven through the same checks) ----

function skillPhaseNumbers(md: string): Set<string> {
  const out = new Set<string>();
  for (const m of md.matchAll(/^## Phase (\S+)\b/gm)) out.add(m[1]!);
  return out;
}
/** Upstream terminal `## Delivery` steps are UNNUMBERED (draft-from-outline numbers 0–6 then
 *  "## Delivery"). When the manifests declare exactly one skillPhase beyond the numbered set and the
 *  heading exists, that phase's heading is `## Delivery` — count it satisfied. (Renaming the heading
 *  still turns the check red.) */
function skillPhaseNumbersWithDelivery(md: string, unionPhases: Set<string>): Set<string> {
  const out = skillPhaseNumbers(md);
  const missing = [...unionPhases].filter((sp) => !out.has(sp));
  if (missing.length === 1 && /^## Delivery\b/m.test(md)) out.add(missing[0]!);
  return out;
}
function skillSidecars(md: string): Set<string> {
  const block = /name: sidecar[\s\S]*?description: "([\s\S]*?)"\n/.exec(md);
  const desc = block?.[1] ?? "";
  const out = new Set<string>();
  for (const m of desc.matchAll(/([\w.-]+\.json)/g)) if (m[1] !== "phase-result.json") out.add(m[1]!);
  return out;
}
function skillOptOutFlags(md: string): Set<string> {
  const out = new Set<string>();
  for (const m of md.matchAll(/- name: (\w+)\n\s+required: false\n\s+description: "([^"]*)"/g)) {
    if (/Default true\.\s*Run\b[\s\S]*Phase/.test(m[2]!)) out.add(m[1]!);
  }
  return out;
}
function normalizeVersionTokens(path: string): string {
  return path.replace(/v\(N\+1\)/g, "v2").replace(/v<N>/g, "v1").replace(/vN/g, "v1");
}
/** Filenames named inside a SKILL.md fenced dossier/profile tree (the artifacts the skill says it writes). */
function fencedMdFilenames(md: string): string[] {
  const out = new Set<string>();
  let inFence = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    // normalizeVersionTokens on the LINE first so `v<N>-drafting-note.md` extracts as
    // `v1-drafting-note.md` (the `<`/`>` chars aren't filename chars, so the token would otherwise
    // truncate to `-drafting-note.md` and never classify). Pure placeholders like `<piece-slug>.md`
    // still don't extract — as before.
    for (const m of normalizeVersionTokens(line).matchAll(/[A-Za-z0-9_./()+-]+\.md/g)) out.add(m[0]);
  }
  return [...out];
}
// The mirror-tree directory contexts a fenced filename may be relative to (§11.1); a real artifact
// classifies under at least one, a renamed/bogus filename under none.
const DIR_PREFIXES = ["", "profile/", "correspondence/", "drafts/", "agents/author/", "agents/editor/"];
const classifiesUnderSomePrefix = (fname: string): boolean =>
  DIR_PREFIXES.some((p) => pathToKind(normalizeVersionTokens(p + fname)) !== null);
const setEq = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((x) => b.has(x));

/** Every way this skill's SKILL.md and its manifests can disagree (empty ⇒ in contract). */
function violations(skill: string, md: string, ms: WorkflowManifest[]): string[] {
  const v: string[] = [];
  const primary = ms.find((m) => m.workflow === PRIMARY[skill])!;
  const unionPhases = new Set(ms.flatMap((m) => m.phases.map((p) => p.skillPhase)));
  const unionSidecars = new Set(ms.flatMap((m) => m.phases.flatMap((p) => p.sidecars)));
  const unionFlags = new Set(
    ms.flatMap((m) => m.phases.map((p) => p.optOutFlag).filter((f): f is string => !!f)),
  );

  // 1. phase headings ↔ manifest skillPhases
  const numbered = skillPhaseNumbersWithDelivery(md, unionPhases);
  if (!setEq(numbered, unionPhases)) {
    v.push(`phase headings ${[...numbered].sort()} ≠ manifest skillPhases ${[...unionPhases].sort()}`);
  }
  // 2. sidecar names ↔ manifest ↔ registry ↔ parsers
  if (!setEq(skillSidecars(md), unionSidecars)) {
    v.push(`sidecar names ${[...skillSidecars(md)]} ≠ manifest sidecars ${[...unionSidecars]}`);
  }
  for (const s of unionSidecars) {
    if (!(s in SIDECAR_REGISTRY)) v.push(`manifest sidecar "${s}" is not a known schema`);
    if (!(s in PARSERS)) v.push(`manifest sidecar "${s}" has no parser`);
  }
  // 3. opt-out flags ↔ manifest optOutFlag
  if (!setEq(skillOptOutFlags(md), unionFlags)) {
    v.push(`opt-out flags ${[...skillOptOutFlags(md)].sort()} ≠ manifest optOutFlag ${[...unionFlags].sort()}`);
  }
  // 4. every PRIMARY-manifest artifact classifies via the F11 path→kind map (manifest ↔ path→kind).
  //    (Scope-variants like fact_check may carry intermediates — e.g. 00-claim-inventory.md — that are
  //    not committed artifact kinds; the canonical committed set is the primary manifest's.)
  for (const p of primary.phases) {
    for (const artifact of p.artifacts) {
      if (pathToKind(normalizeVersionTokens(artifact)) === null) {
        v.push(`primary-manifest artifact "${artifact}" does not classify via the path→kind map`);
      }
    }
  }
  // 5. every artifact filename the SKILL names in a fenced dossier tree classifies via the path→kind map
  //    (SKILL ↔ path→kind) — a renamed artifact heading classifies under no directory and turns this red.
  for (const fname of fencedMdFilenames(md)) {
    if (!classifiesUnderSomePrefix(fname)) {
      v.push(`fenced artifact filename "${fname}" does not classify via the path→kind map`);
    }
  }
  return v;
}

describe("manifest ↔ SKILL.md contract (AC2, REQ-SPEC-22)", () => {
  for (const [skill, ms] of bySkill) {
    it(`${skill}: SKILL.md agrees with its manifests, the F11 map and the parsers`, () => {
      expect(violations(skill, readSkill(skill), ms)).toEqual([]);
    });
  }

  it("every serializer's sidecar is a known schema with a parser (serializers ⊆ parsers ⊆ registry)", () => {
    for (const s of SERIALIZABLE_SIDECARS) {
      expect(s in SIDECAR_REGISTRY).toBe(true);
      expect(s in PARSERS).toBe(true);
    }
  });

  describe("fails on planted drift", () => {
    const skill = "editorial-review";
    const ms = bySkill.get(skill)!;

    it("renaming a phase heading number → red", () => {
      const drifted = readSkill(skill).replace("## Phase 1 —", "## Phase 9 —");
      const v = violations(skill, drifted, ms);
      expect(v.some((x) => x.includes("phase headings"))).toBe(true);
    });

    it("renaming a sidecar filename → red", () => {
      const drifted = readSkill(skill).replace(/findings\.json/g, "findingz.json");
      const v = violations(skill, drifted, ms);
      expect(v.some((x) => x.includes("sidecar names"))).toBe(true);
    });

    it("renaming an opt-out flag → red", () => {
      const drifted = readSkill(skill).replace("- name: discourse", "- name: discourse_map");
      const v = violations(skill, drifted, ms);
      expect(v.some((x) => x.includes("opt-out flags"))).toBe(true);
    });

    it("renaming an artifact filename → red", () => {
      const drifted = readSkill(skill).replace(/editors-letter\.md/g, "editor-letter.md");
      const v = violations(skill, drifted, ms);
      expect(v.some((x) => x.includes("does not classify via the path→kind map"))).toBe(true);
    });
  });
});
