// R7COPY.1a (REQ-COPY-1) — every shipped workflow manifest's `phase.key` is a declared PhaseKey:
// the UI's ONE label table (`UI_LABELS.phase`) is exhaustive over the enum, so a manifest that
// introduces a new phase key must extend PHASE_KEYS (contracts/enums.ts) with a label — the UI
// never renders the raw key.
import { describe, expect, it } from "vitest";
import { PHASE_KEYS } from "@rhema/contracts";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";

describe("REQ-COPY-1 — manifest phase keys are all declared PhaseKeys", () => {
  it("every manifest phase.key is a member of PHASE_KEYS", () => {
    const keys = new Set<string>(PHASE_KEYS);
    const undeclared: string[] = [];
    for (const [workflow, manifest] of Object.entries(WORKFLOW_MANIFESTS)) {
      for (const phase of manifest.phases) {
        if (!keys.has(phase.key)) undeclared.push(`${workflow}:${phase.key}`);
      }
    }
    expect(undeclared, "phase keys missing from contracts PHASE_KEYS/UI_LABELS").toEqual([]);
  });
});
