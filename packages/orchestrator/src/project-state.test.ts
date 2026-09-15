import { describe, expect, it } from "vitest";
import { projectState, type ProjectStateInput } from "./project-state.js";
import { createOrchestratorTestDb } from "./testing/pg.js";

// AC7: every §6.3 row (state key, pill, suggested next) reproduced from fixture row-sets, overlays included;
// no `status` column exists in the schema (REQ-PROD-9; REQ-SPEC-3).

const empty: ProjectStateInput = {
  outlinePresent: false,
  versions: [],
  reviews: [],
  responses: [],
  runs: [],
  exports: [],
};

function withDraft(over: Partial<ProjectStateInput>): ProjectStateInput {
  return { ...empty, versions: [{ n: 1, origin: "agent" }], ...over };
}

describe("§6.3 project state function (REQ-PROD-9; REQ-SPEC-3) — every row", () => {
  it("empty: no outline, no draft, no chat", () => {
    const s = projectState(empty);
    expect(s.key).toBe("empty");
    expect(s.pill).toBe("Empty");
    expect(s.suggested.action).toBe("start_or_upload");
    expect(s.overlay).toBeNull();
  });

  it("researching: chat has ≥1 Assistant turn, no outline — Make an outline only once a claim-shaped message exists", () => {
    const noClaims = projectState({ ...empty, chat: { assistantTurns: 2, claimShapedMessages: 0 } });
    expect(noClaims.key).toBe("researching");
    expect(noClaims.pill).toBe("Researching");
    expect(noClaims.suggested.action).toBe("none");

    const withClaims = projectState({ ...empty, chat: { assistantTurns: 2, claimShapedMessages: 1 } });
    expect(withClaims.key).toBe("researching");
    expect(withClaims.suggested.action).toBe("make_outline");
  });

  it("outlined: outline exists, no draft → Draft v1", () => {
    const s = projectState({ ...empty, outlinePresent: true });
    expect(s.key).toBe("outlined");
    expect(s.suggested.action).toBe("draft_v1");
  });

  it("draft: latest vN has no review → Review", () => {
    const s = projectState(withDraft({}));
    expect(s.key).toBe("draft");
    expect(s.pill).toBe("Draft");
    expect(s.suggested.action).toBe("review");
  });

  it("reviewed: latest reviewed + unanswered → Read the Editor's letter, then Revise once the letter is opened", () => {
    const beforeOpen = projectState(withDraft({ reviews: [{ draftN: 1 }] }));
    expect(beforeOpen.key).toBe("reviewed");
    expect(beforeOpen.suggested.action).toBe("read_letter");

    const afterOpen = projectState(withDraft({ reviews: [{ draftN: 1, letterOpenedAt: new Date() }] }));
    expect(afterOpen.key).toBe("reviewed");
    expect(afterOpen.suggested.action).toBe("revise");
  });

  it("edited_by_you: user forked a reviewed vN → v(N+1) origin=human_revision, orphaning the review", () => {
    const s = projectState({
      ...empty,
      versions: [
        { n: 1, origin: "agent" },
        { n: 2, origin: "human_revision" },
      ],
      reviews: [{ draftN: 1 }], // orphaned by the edit, unanswered
    });
    expect(s.key).toBe("edited_by_you");
    expect(s.pill).toBe("Edited by you");
    expect(s.suggested.action).toBe("revise_using_edits");
  });

  it("accepted → Export; exported → Archive", () => {
    const accepted = projectState(withDraft({ acceptedVersionN: 1 }));
    expect(accepted.key).toBe("accepted");
    expect(accepted.suggested.action).toBe("export");

    const exported = projectState(withDraft({ acceptedVersionN: 1, exports: [{ versionN: 1 }] }));
    expect(exported.key).toBe("exported");
    expect(exported.suggested.action).toBe("archive");
  });

  it("archived: read-only, no suggested next", () => {
    const s = projectState(withDraft({ archivedAt: new Date() }));
    expect(s.key).toBe("archived");
    expect(s.suggested.action).toBe("none");
  });

  it("overlay running: a run holds compute → pill Running, show the run card; base key preserved", () => {
    const s = projectState(withDraft({ runs: [{ state: "running" }] }));
    expect(s.overlay).toBe("running");
    expect(s.pill).toBe("Running");
    expect(s.suggested.action).toBe("show_run");
    expect(s.key).toBe("draft"); // underlying content state preserved
  });

  it("overlay needs_you: any run in waiting_gate → pill Needs you, the Approval card", () => {
    const s = projectState(withDraft({ runs: [{ state: "waiting_gate" }] }));
    expect(s.overlay).toBe("needs_you");
    expect(s.pill).toBe("Needs you");
    expect(s.suggested.action).toBe("approval");
  });

  it("running takes precedence over needs_you (§6.3 pseudocode order)", () => {
    const s = projectState(withDraft({ runs: [{ state: "running" }, { state: "waiting_gate" }] }));
    expect(s.overlay).toBe("running");
  });

  it("archived beats every overlay", () => {
    const s = projectState(withDraft({ archivedAt: new Date(), runs: [{ state: "waiting_gate" }] }));
    expect(s.key).toBe("archived");
    expect(s.overlay).toBeNull();
  });
});

describe("no stored project-state (REQ-SPEC-3) — state is computed, never a column", () => {
  it("the projects table has no `status` or `state` column", async () => {
    const db = await createOrchestratorTestDb();
    const cols = (
      await db.pg.query(
        "select column_name from information_schema.columns where table_schema='public' and table_name='projects'",
      )
    ).rows as { column_name: string }[];
    const names = new Set(cols.map((c) => c.column_name));
    expect(names.has("status")).toBe(false);
    expect(names.has("state")).toBe(false);
    expect(names.has("lifecycle_state")).toBe(false);
    await db.close();
  });
});
