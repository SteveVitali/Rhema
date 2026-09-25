import { describe, expect, it } from "vitest";
import { userSourceGuardText, userSourceMounts } from "./user-sources.js";

// P1.21 — the Memo run's `user_sources[]` (REQ-WF-8 / REQ-GENRE-6): each source mounts as a derived,
// read-only `user_sources/NN-name.md` server file whose bytes the agent reads but never fetches, and the
// source text rides the proxy credential context as the n-gram guard's diff corpus.

describe("userSourceMounts", () => {
  it("mounts each source at a deterministic ordinal+slug path", () => {
    const mounts = userSourceMounts([
      { name: "Q3 Board Metrics", text: "ARR grew 12%." },
      { name: "Internal Wiki — Headcount", url: "https://wiki.acme.co/headcount" },
    ]);
    expect(mounts.map((m) => m.path)).toEqual([
      "user_sources/01-q3-board-metrics.md",
      "user_sources/02-internal-wiki-headcount.md",
    ]);
    expect(mounts[0]!.name).toBe("Q3 Board Metrics");
  });

  it("writes the source text into the mounted file under a confidentiality header", () => {
    const [m] = userSourceMounts([{ name: "Metrics", text: "ARR grew 12%." }]);
    expect(m!.content).toContain("ARR grew 12%.");
    expect(m!.content).toContain("verified_against_user_source");
    expect(m!.content).toContain("forbids fetching user-supplied data");
  });

  it("mounts a url-only source as a by-reference stub (never fetched)", () => {
    const [m] = userSourceMounts([{ name: "Wiki page", url: "https://wiki.acme.co/x" }]);
    expect(m!.content).toContain("Supplied by reference only");
    expect(m!.content).toContain("https://wiki.acme.co/x");
  });

  it("skips malformed rows instead of throwing (hydration must not crash on a hand-built run)", () => {
    const mounts = userSourceMounts([{ name: "" }, "nope", null, { name: "Ok", text: "t" }]);
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.path).toBe("user_sources/04-ok.md");
  });

  it("returns [] for non-array input", () => {
    expect(userSourceMounts(undefined)).toEqual([]);
    expect(userSourceMounts({ name: "x" })).toEqual([]);
  });
});

describe("userSourceGuardText", () => {
  it("joins only the user-supplied texts (no boilerplate can trip the guard)", () => {
    const t = userSourceGuardText([
      { name: "A", text: "ARR grew 12%." },
      { name: "B", url: "https://x.example.com" },
      { name: "C", text: "churn fell to 4%" },
    ]);
    expect(t).toBe("ARR grew 12%.\n\nchurn fell to 4%");
  });

  it("returns undefined when no source carries text", () => {
    expect(userSourceGuardText([{ name: "B", url: "https://x.example.com" }])).toBeUndefined();
    expect(userSourceGuardText(undefined)).toBeUndefined();
  });
});
