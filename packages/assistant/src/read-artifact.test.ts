import { describe, expect, it } from "vitest";
import {
  resolveArtifactRef,
  sectionSlice,
  sectionList,
  type ChatArtifactRegistry,
  type ArtifactHandle,
} from "./read-artifact.js";

// REQ-CHAT-8 — the typed `read_artifact` resolver: `@v3 §II`, `@finding:v2/17`, `@outline`,
// `@review:v2`, `@figure`, `@voice`; unresolvable → a typed error naming what was looked for;
// section-scoped default; `--all` shows the token footprint first.

const DRAFT_MD = "# Title\n\nIntro text.\n\n## Methods\n\nMethods body here.\n\n## Results\n\nResults body.\n";

function registry(over: Partial<ChatArtifactRegistry> = {}): ChatArtifactRegistry {
  return {
    async draft(v, load) {
      if (v !== 3) return null;
      const h: ArtifactHandle = { path: "drafts/v3.md", kind: "draft", words: 9 };
      if (load) h.text = DRAFT_MD;
      return h;
    },
    async review(v) {
      return v === 2 ? { path: "correspondence/v2-review.md", kind: "review", text: "# letter" } : null;
    },
    async outline() {
      return { path: "outline.md", kind: "outline", text: "# outline" };
    },
    async finding(ordinal, version) {
      return ordinal === 17 && (version ?? 2) === 2
        ? { path: "findings/v2/17", kind: "finding", text: "finding 17 body" }
        : null;
    },
    async claim(ordinal, _version) {
      return ordinal === 41 ? { path: "claims/v2/41", kind: "claim", text: "claim 41" } : null;
    },
    async figure(ref) {
      return ref === "fig_a" ? { path: "assets/fig_a.png", kind: "figure", text: "<figure>" } : null;
    },
    async asset(ref) {
      return ref === "data.csv" ? { path: "assets/data.csv", kind: "asset", text: "a,b" } : null;
    },
    async threadBrief(ref) {
      return ref === "t1" || ref == null ? { path: "agents/assistant/threads/t1/brief.md", kind: "brief", text: "# brief" } : null;
    },
    async voice() {
      return { path: "personas/p1/profile/voice-print.md", kind: "persona", text: "# voice" };
    },
    ...over,
  };
}

describe("resolveArtifactRef (REQ-CHAT-8)", () => {
  it("@v3 §II slices the section (section-scoped default)", async () => {
    // §I = the first section under the title (Methods); §II = Results.
    const r = await resolveArtifactRef(registry(), "@v3 §II");
    expect(r.ok).toBe(true);
    if (r.ok && "artifact" in r) {
      expect(r.artifact.text).toContain("Results body.");
      expect(r.artifact.text).not.toContain("Methods body here.");
      expect(r.artifact.path).toBe("drafts/v3.md §II");
      expect(r.tokens).toBeGreaterThan(0);
    } else {
      expect.unreachable("expected an artifact");
    }
    const first = await resolveArtifactRef(registry(), "@v3 §I");
    if (first.ok && "artifact" in first) expect(first.artifact.text).toContain("Methods body here.");
    else expect.unreachable("expected §I to resolve");
  });

  it("a bare @v3 is section-scoped: returns the footprint + section list, not the document", async () => {
    const r = await resolveArtifactRef(registry(), "@v3");
    expect(r.ok).toBe(true);
    if (r.ok && "footprint" in r) {
      expect(r.footprint.tokens).toBeGreaterThan(0);
      expect(r.footprint.hint).toContain("--all");
    } else {
      expect.unreachable("expected a footprint");
    }
  });

  it("@v3 --all returns the whole document (footprint already shown by the caller)", async () => {
    const r = await resolveArtifactRef(registry(), "@v3", { all: true });
    expect(r.ok).toBe(true);
    if (r.ok && "artifact" in r) expect(r.artifact.text).toContain("Results body.");
    else expect.unreachable("expected the document");
  });

  it("@finding:v2/17, @claim:v2/41, @review:v2, @outline, @figure:<id>, @voice, @thread resolve", async () => {
    for (const [ref, want] of [
      ["@finding:v2/17", "finding 17 body"],
      ["@claim:v2/41", "claim 41"],
      ["@review:v2", "# letter"],
      ["@outline", "# outline"],
      ["@figure:fig_a", "<figure>"],
      ["@voice", "# voice"],
      ["@thread:t1", "# brief"],
    ] as const) {
      const r = await resolveArtifactRef(registry(), ref);
      expect(r.ok, ref).toBe(true);
      if (r.ok && "artifact" in r) expect(r.artifact.text, ref).toContain(want);
      else if (!(r.ok && "footprint" in r)) expect.unreachable(`${ref} should resolve`);
    }
  });

  it("unresolvable → typed error naming what was looked for", async () => {
    const r = await resolveArtifactRef(registry(), "@finding:v2/99");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("unresolvable_ref");
      expect(r.error.lookedFor).toBe("@finding:v2/99");
    }
    const missing = await resolveArtifactRef(registry(), "@v9");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.lookedFor).toBe("@v9");
    const nonsense = await resolveArtifactRef(registry(), "@bogus!");
    expect(nonsense.ok).toBe(false);
    if (!nonsense.ok) expect(nonsense.error.code).toBe("unresolvable_ref");
  });

  it("sectionSlice handles ordinal + text refs; sectionList names the top-level sections", () => {
    expect(sectionSlice(DRAFT_MD, "I")).toContain("Methods body");
    expect(sectionSlice(DRAFT_MD, "II")).toContain("Results body");
    expect(sectionSlice(DRAFT_MD, "Results")).toContain("Results body");
    expect(sectionSlice(DRAFT_MD, "ZZ")).toBeNull();
    expect(sectionList(DRAFT_MD)).toEqual(["Methods", "Results"]);
  });
});
