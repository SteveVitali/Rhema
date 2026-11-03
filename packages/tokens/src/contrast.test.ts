// The design system ships its WCAG 2.2 contrast invariants as COMPUTED tests (P1.01; §5.9):
//   shell body ≥ 7:1 (AAA body contrast), paper body ≥ 10:1 (§5.9 "AAA reading contrast"),
//   chips ≥ 4.5:1, non-text marks ≥ 3:1 — in BOTH themes, and for the pinned-paper pairings
//   (pinned-light paper inside the dark shell and vice versa — REQ-IDE-38 amended).

import { describe, it, expect } from "vitest";
import { contrastRatio } from "./contrast.js";
import { DARK_VARS, LIGHT_VARS, paperVars, paperScopeVars } from "./tokens.js";
import type { VarMap } from "./tokens.js";

const fg = (v: VarMap, k: string) => v[k]!;

/** Text colors that must clear a level against a ground. */
function expectMin(pairs: [string, string][], min: number, label: string) {
  for (const [a, b] of pairs) {
    const r = contrastRatio(a, b);
    expect(r, `${label}: ${a} on ${b} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  }
}

describe("§5.9 contrast invariants — dark theme", () => {
  const v = DARK_VARS;
  it("shell body ≥ 7:1", () => {
    expectMin(
      [
        [fg(v, "--shell-fg"), fg(v, "--shell-bg")],
        [fg(v, "--shell-fg"), fg(v, "--shell-surface")],
        [fg(v, "--shell-fg"), fg(v, "--shell-raised")],
      ],
      7,
      "dark shell body",
    );
    // muted/faint are secondary tiers — AA normal text, not the AAA body rule.
    expectMin([[fg(v, "--shell-fg-muted"), fg(v, "--shell-surface")]], 4.5, "dark shell muted");
    // UX.2 (ADR-070) — the faint tier IS used for real text (footer, meta lines, gate/run-sheet
    // captions at 11–13 px) — it must clear AA's 4.5:1 text bar on every shell ground, not the
    // 3:1 non-text-mark floor (the spec-verbatim #5f6873 failed axe's color-contrast on /pricing).
    expectMin(
      [
        [fg(v, "--shell-fg-faint"), fg(v, "--shell-bg")],
        [fg(v, "--shell-fg-faint"), fg(v, "--shell-surface")],
        [fg(v, "--shell-fg-faint"), fg(v, "--shell-raised")],
      ],
      4.5,
      "dark shell faint (text tier)",
    );
  });
  it("paper body ≥ 10:1 (AAA reading contrast)", () => {
    expectMin([[fg(v, "--paper-fg"), fg(v, "--paper-bg")]], 10, "dark paper");
    // muted paper text clears ordinary body contrast
    expect(contrastRatio(fg(v, "--paper-fg-muted"), fg(v, "--paper-bg"))).toBeGreaterThanOrEqual(4.5);
  });
  it("chips/labels ≥ 4.5:1 — accent + severity + state hues on their grounds", () => {
    expectMin(
      [
        [fg(v, "--accent"), fg(v, "--shell-bg")],
        [fg(v, "--accent"), fg(v, "--shell-surface")],
        [fg(v, "--sev-blocking"), fg(v, "--shell-surface")],
        [fg(v, "--sev-major"), fg(v, "--shell-surface")],
        [fg(v, "--sev-minor"), fg(v, "--shell-surface")],
        [fg(v, "--sev-note"), fg(v, "--shell-surface")],
        [fg(v, "--state-running"), fg(v, "--shell-surface")],
        [fg(v, "--state-needs-you"), fg(v, "--shell-surface")],
        [fg(v, "--state-ready"), fg(v, "--shell-surface")],
        [fg(v, "--state-failed"), fg(v, "--shell-surface")],
      ],
      4.5,
      "dark chips",
    );
  });
  it("non-text marks ≥ 3:1 — kind hues and the faint tier carry meaning", () => {
    expectMin(
      [
        [fg(v, "--kind-claim"), fg(v, "--shell-surface")],
        [fg(v, "--kind-discourse"), fg(v, "--shell-surface")],
        [fg(v, "--kind-argument"), fg(v, "--shell-surface")],
        [fg(v, "--kind-craft"), fg(v, "--shell-surface")],
        [fg(v, "--kind-voice"), fg(v, "--shell-surface")],
        [fg(v, "--kind-continuity"), fg(v, "--shell-surface")],
        [fg(v, "--kind-structure"), fg(v, "--shell-surface")],
      ],
      3,
      "dark marks",
    );
    // --shell-border / --paper-rule are spec-verbatim structural hairlines (decorative separators, not
    // meaningful marks) — assert they remain perceivable rather than demanding the 3:1 mark bar.
    expect(contrastRatio(fg(v, "--shell-border"), fg(v, "--shell-bg"))).toBeGreaterThanOrEqual(1.1);
    expect(contrastRatio(fg(v, "--paper-rule"), fg(v, "--paper-bg"))).toBeGreaterThanOrEqual(1.1);
  });
});

describe("§5.9 contrast invariants — light theme", () => {
  const v = LIGHT_VARS;
  it("shell body ≥ 7:1", () => {
    expectMin(
      [
        [fg(v, "--shell-fg"), fg(v, "--shell-bg")],
        [fg(v, "--shell-fg"), fg(v, "--shell-surface")],
        [fg(v, "--shell-fg"), fg(v, "--shell-raised")],
      ],
      7,
      "light shell body",
    );
    // muted is the spec-verbatim secondary tier (#5c6670) — AA normal text, not the AAA body rule.
    expectMin([[fg(v, "--shell-fg-muted"), fg(v, "--shell-surface")]], 4.5, "light shell muted");
    // UX.2 (ADR-070) — same text-tier bar on the light grounds (#7a828f failed it at ~3.5:1).
    expectMin(
      [
        [fg(v, "--shell-fg-faint"), fg(v, "--shell-bg")],
        [fg(v, "--shell-fg-faint"), fg(v, "--shell-surface")],
        [fg(v, "--shell-fg-faint"), fg(v, "--shell-raised")],
      ],
      4.5,
      "light shell faint (text tier)",
    );
  });
  it("paper body ≥ 10:1 (AAA reading contrast)", () => {
    expectMin([[fg(v, "--paper-fg"), fg(v, "--paper-bg")]], 10, "light paper");
    expect(contrastRatio(fg(v, "--paper-fg-muted"), fg(v, "--paper-bg"))).toBeGreaterThanOrEqual(4.5);
  });
  it("chips/labels ≥ 4.5:1", () => {
    expectMin(
      [
        [fg(v, "--accent"), fg(v, "--shell-bg")],
        [fg(v, "--accent"), fg(v, "--shell-surface")],
        [fg(v, "--sev-blocking"), fg(v, "--shell-surface")],
        [fg(v, "--sev-major"), fg(v, "--shell-surface")],
        [fg(v, "--sev-minor"), fg(v, "--shell-surface")],
        [fg(v, "--sev-note"), fg(v, "--shell-surface")],
        [fg(v, "--state-running"), fg(v, "--shell-surface")],
        [fg(v, "--state-needs-you"), fg(v, "--shell-surface")],
        [fg(v, "--state-ready"), fg(v, "--shell-surface")],
        [fg(v, "--state-failed"), fg(v, "--shell-surface")],
      ],
      4.5,
      "light chips",
    );
  });
  it("non-text marks ≥ 3:1", () => {
    expectMin(
      [
        [fg(v, "--kind-claim"), fg(v, "--shell-surface")],
        [fg(v, "--kind-discourse"), fg(v, "--shell-surface")],
        [fg(v, "--kind-argument"), fg(v, "--shell-surface")],
        [fg(v, "--kind-craft"), fg(v, "--shell-surface")],
        [fg(v, "--kind-voice"), fg(v, "--shell-surface")],
        [fg(v, "--kind-continuity"), fg(v, "--shell-surface")],
        [fg(v, "--kind-structure"), fg(v, "--shell-surface")],
      ],
      3,
      "light marks",
    );
    // borders/rules are structural hairlines (decorative) — perceivable, not meaningful marks.
    expect(contrastRatio(fg(v, "--shell-border"), fg(v, "--shell-bg"))).toBeGreaterThanOrEqual(1.05);
    expect(contrastRatio(fg(v, "--paper-rule"), fg(v, "--paper-bg"))).toBeGreaterThanOrEqual(1.05);
  });
});

// R7KIT.1 (REQ-KIT-1; UXC-32) — the previously-undefined diff/state tokens carry their own floors:
// `--paper-diff-add/del` are background tints on the sheet, so the paper's body text keeps its AAA
// ≥10:1 reading contrast ON the tint AND the tint stays perceivable against `--paper-bg` (≥1.1:1,
// the same floor the structural hairlines clear); `--state-ok` is a text/chip hue — AA ≥4.5:1 on
// every shell ground and on the scoped-paper grounds it can land inside `.paper`.
describe("R7KIT.1 token floors — diff tints + state-ok (UXC-32)", () => {
  for (const [name, v] of [["dark", DARK_VARS], ["light", LIGHT_VARS]] as const) {
    it(`${name}: paper body text keeps ≥10:1 on both diff tints, and the tints are perceivable`, () => {
      for (const tint of ["--paper-diff-add", "--paper-diff-del"] as const) {
        expect(
          contrastRatio(fg(v, "--paper-fg"), fg(v, tint)),
          `${name} paper-fg on ${tint}`,
        ).toBeGreaterThanOrEqual(10);
        expect(
          contrastRatio(fg(v, tint), fg(v, "--paper-bg")),
          `${name} ${tint} vs paper-bg`,
        ).toBeGreaterThanOrEqual(1.1);
      }
    });
    it(`${name}: --state-ok clears AA ≥4.5:1 as text on every shell ground`, () => {
      expectMin(
        [
          [fg(v, "--state-ok"), fg(v, "--shell-bg")],
          [fg(v, "--state-ok"), fg(v, "--shell-surface")],
          [fg(v, "--state-ok"), fg(v, "--shell-raised")],
        ],
        4.5,
        `${name} state-ok`,
      );
    });
  }
  it("the pinned-paper pairings keep both floors (the tints ride [data-paper] via PAPER_KEYS)", () => {
    for (const mode of ["light", "dark"] as const) {
      const p = paperVars(mode);
      for (const tint of ["--paper-diff-add", "--paper-diff-del"] as const) {
        expect(contrastRatio(p["--paper-fg"]!, p[tint]!), `pinned ${mode} ${tint}`).toBeGreaterThanOrEqual(10);
        expect(contrastRatio(p[tint]!, p["--paper-bg"]!)).toBeGreaterThanOrEqual(1.1);
      }
    }
  });
  it("--state-ok clears AA on the scoped sheet's grounds (it is re-emitted by paperScopeVars)", () => {
    for (const mode of ["light", "dark"] as const) {
      const s = paperScopeVars(mode);
      expectMin(
        [
          [s["--state-ok"]!, s["--shell-bg"]!],
          [s["--state-ok"]!, s["--shell-raised"]!],
        ],
        4.5,
        `paper ${mode} state-ok`,
      );
    }
  });
});

describe("pinned paper (REQ-IDE-38 amended — pinning never blends with the shell theme)", () => {
  it("pinned-light paper inside the dark shell keeps ≥ 10:1 body contrast", () => {
    const p = paperVars("light");
    expectMin([[p["--paper-fg"]!, p["--paper-bg"]!]], 10, "pinned light");
    expect(contrastRatio(p["--paper-fg-muted"]!, p["--paper-bg"]!)).toBeGreaterThanOrEqual(4.5);
  });
  it("pinned-dark paper inside the light shell keeps ≥ 10:1 body contrast", () => {
    const p = paperVars("dark");
    expectMin([[p["--paper-fg"]!, p["--paper-bg"]!]], 10, "pinned dark");
    expect(contrastRatio(p["--paper-fg-muted"]!, p["--paper-bg"]!)).toBeGreaterThanOrEqual(4.5);
  });
  it("the scoped sheet's faint tier clears AA as text (UX.2 / ADR-070)", () => {
    // `.paper` remaps --shell-fg-faint onto the sheet — meta text there is text, not a mark.
    for (const mode of ["light", "dark"] as const) {
      const s = paperScopeVars(mode);
      expectMin(
        [
          [s["--shell-fg-faint"]!, s["--shell-bg"]!],
          [s["--shell-fg-faint"]!, s["--shell-raised"]!],
        ],
        4.5,
        `paper ${mode} faint`,
      );
    }
  });
});
