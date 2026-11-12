// 259_R6FIX.10 (BL-111) — Stage A pin for the nightly-red root cause: `r7legs.ts`'s `U6_CHAT`
// read `u6-stub-turn.fixture.json` as a `src/` sibling via `import.meta.url`, but `tsc -b` emits
// only TypeScript outputs — the emitted `dist/r7legs.js` resolved `dist/u6-stub-turn.fixture.json`,
// a file the build never wrote → ENOENT in the scheduled `journeys.yml` leg since ~2026-11-06
// (a committed harness defect, not a product leg). The fix follows steps.ts's pattern: the
// fixture lives in the package-root `fixtures/` dir, resolved one level up from the module —
// `src/../fixtures` and `dist/../fixtures` land on the same committed file, so the resolution is
// identical under vitest (src) and under `node dist/cli.js` (the nightly arm).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { U6_STUB_TURN_FIXTURE } from "./r7legs.js";

describe("the U6 stub-turn fixture (BL-111)", () => {
  it("resolves at the exact path the emitted leg reads", () => {
    // The path the leg hands to readFile — exported so this assertion keys on the SAME
    // computation `node dist/cli.js` performs, not a re-derived copy.
    expect(existsSync(U6_STUB_TURN_FIXTURE)).toBe(true);
  });

  it("lands in package-root fixtures/ — never a src/ or dist/ sibling", () => {
    const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    expect(normalize(U6_STUB_TURN_FIXTURE)).toBe(
      join(pkgRoot, "fixtures", "u6-stub-turn.fixture.json"),
    );
    // The emitted module sits in dist/: pin the path the ENOENT actually named.
    const distSaid = join(pkgRoot, "dist", "u6-stub-turn.fixture.json");
    expect(U6_STUB_TURN_FIXTURE).not.toBe(distSaid);
  });

  it("parses to the leg's stub input — the 201 envelope + the SSE stream + the twin turn", () => {
    const fx = JSON.parse(readFileSync(U6_STUB_TURN_FIXTURE, "utf8")) as {
      created: { ok: true; data: { runId: string; state: string } };
      events: { seq: number; type: string; payload: Record<string, unknown> }[];
      turn: { id: string };
    };
    expect(fx.created.ok).toBe(true);
    expect(fx.created.data.runId).toBeTruthy();
    expect(fx.events.length).toBeGreaterThan(0);
    expect(fx.events.every((e) => typeof e.seq === "number" && typeof e.type === "string")).toBe(
      true,
    );
    // the twin patch row is keyed on the same run id the 201 envelope returns.
    expect(fx.turn.id).toBe(fx.created.data.runId);
  });
});
