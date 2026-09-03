import { describe, expect, it } from "vitest";
import { interAnnotatorAgreement, type AlignmentCell } from "./iaa.js";

// AC3: IAA computation verified against a hand-computed fixture; below-floor drafts flagged for re-adjudication/drop
// (REQ-EVAL-4). κ is chance-corrected (REQ-EVAL-9b).

function cell(a: AlignmentCell["a"], b: AlignmentCell["b"]): AlignmentCell {
  return { a, b };
}
const M = (severity = "blocking") => ({ material: true, severity });
const I = (severity = "minor") => ({ material: false, severity });

describe("interAnnotatorAgreement — AC3", () => {
  // 4 matched-material + 1 matched-immaterial + 1 A-only + 1 B-only (n=7).
  // labels A=[m,m,m,m,i,m,absent] B=[m,m,m,m,i,absent,m]; p_o=5/7, p_e=27/49 → κ=(35−27)/(49−27)=8/22=4/11.
  const cells: AlignmentCell[] = [
    cell(M(), M()),
    cell(M(), M()),
    cell(M(), M()),
    cell(M(), M()),
    cell(I(), I()),
    cell(M(), null),
    cell(null, M()),
  ];

  it("reproduces the hand-computed κ, overlap and cell counts", () => {
    const r = interAnnotatorAgreement(cells, 0.6);
    expect(r.matched).toBe(5);
    expect(r.aOnly).toBe(1);
    expect(r.bOnly).toBe(1);
    expect(r.kappa).toBeCloseTo(4 / 11, 12);
    expect(r.overlap).toBeCloseTo(5 / 6, 12); // 2·5 / (6+6)
    expect(r.severityKappa).toBe(1); // matched severities all agree
  });

  it("flags a draft below the pre-registered floor, and clears it above", () => {
    expect(interAnnotatorAgreement(cells, 0.6).belowFloor).toBe(true); // 4/11 ≈ 0.36 < 0.6
    expect(interAnnotatorAgreement(cells, 0.3).belowFloor).toBe(false); // 0.36 > 0.3
  });

  it("perfect agreement → κ = 1, not below any floor", () => {
    const perfect: AlignmentCell[] = [cell(M(), M()), cell(M(), M()), cell(I(), I())];
    const r = interAnnotatorAgreement(perfect, 0.8);
    expect(r.kappa).toBe(1);
    expect(r.belowFloor).toBe(false);
    expect(r.overlap).toBe(1);
  });
});
