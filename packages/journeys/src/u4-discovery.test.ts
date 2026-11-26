// 336_R6FIX.54 — the U4_CONTROLS dossier runId discovery. The deployed leg fetches the
// tenant's `/bff/p/<slug>/timeline` twin through `page.request` (the browser context's
// session) — a bare Node `fetch` is anonymous and 401s, which left runId "" for the leg's
// whole lifetime: the dossier surface navigated to `/p/<slug>/review/` (NotFound leaf,
// control-clean) until R6FIX.44's h1 guard caught the silent pass. These legs pin the
// twin's real shape (rounds[].runs + ungrouped, run state on `card.state`).

import { describe, expect, it } from "vitest";
import { dossierRunIdFromTimeline } from "./u4-probe.js";

describe("dossierRunIdFromTimeline", () => {
  it("prefers the first completed run across rounds + ungrouped", () => {
    const twin = {
      rounds: [
        { n: 1, runs: [{ runId: "run_a", card: { state: "failed" } }, { runId: "run_b", card: { state: "completed" } }] },
        { n: 2, runs: [{ runId: "run_c", card: { state: "completed" } }] },
      ],
      ungrouped: [{ runId: "run_d", card: { state: "completed" } }],
    };
    expect(dossierRunIdFromTimeline(twin)).toBe("run_b");
  });

  it("falls back to the twin's first run when none is completed", () => {
    const twin = {
      rounds: [{ n: 1, runs: [{ runId: "run_x", card: { state: "running" } }] }],
      ungrouped: [],
    };
    expect(dossierRunIdFromTimeline(twin)).toBe("run_x");
  });

  it("reads ungrouped runs too", () => {
    const twin = { rounds: [], ungrouped: [{ runId: "run_u", card: { state: "completed" } }] };
    expect(dossierRunIdFromTimeline(twin)).toBe("run_u");
  });

  it("returns '' on an empty or malformed twin", () => {
    expect(dossierRunIdFromTimeline({ rounds: [], ungrouped: [] })).toBe("");
    expect(dossierRunIdFromTimeline(null)).toBe("");
    expect(dossierRunIdFromTimeline({})).toBe("");
    expect(dossierRunIdFromTimeline({ rounds: [{ runs: [{ card: { state: "completed" } }] }] })).toBe("");
  });
});
