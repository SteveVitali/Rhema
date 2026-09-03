import { describe, expect, it } from "vitest";
import { assertHeadlineTable, DevSetInHeadlineError } from "./report-guard.js";
import { isHeadlineBarred, DEV_SET_PROJECT_KEYS } from "./fixture.js";

// AC6: a wave report render with a dev-set (or scorer-development-only) draft in a headline table fails (REQ-EVAL-1).
// The DB-backed variant (assertHeadlineDrafts) is exercised in corpus-wave.test.ts against real corpus rows.

describe("assertHeadlineTable — AC6", () => {
  it("passes for a table of only non-dev-set, non-synthetic drafts", () => {
    expect(() =>
      assertHeadlineTable([
        { draftId: "d1", isDevSet: false },
        { draftId: "d2", isDevSet: false },
      ]),
    ).not.toThrow();
  });
  it("FAILS when a dev-set draft is in a headline table", () => {
    expect(() =>
      assertHeadlineTable([
        { draftId: "d1", isDevSet: false },
        { draftId: "d2", isDevSet: true },
      ]),
    ).toThrow(DevSetInHeadlineError);
  });
  it("FAILS when a scorer-development (synthetic) draft is in a headline table", () => {
    let err: unknown;
    try {
      assertHeadlineTable([{ draftId: "syn1", isDevSet: false, scorerDevelopmentOnly: true }]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DevSetInHeadlineError);
    expect((err as DevSetInHeadlineError).draftIds).toEqual(["syn1"]);
  });
});

describe("fixture headline-bar", () => {
  it("bars dev-set and scorer-development fixtures", () => {
    expect(isHeadlineBarred({ isDevSet: true })).toBe(true);
    expect(isHeadlineBarred({ isDevSet: false, scorerDevelopmentOnly: true })).toBe(true);
    expect(isHeadlineBarred({ isDevSet: false })).toBe(false);
  });
  it("registers exactly the three real projects as the frozen dev set", () => {
    expect(DEV_SET_PROJECT_KEYS).toHaveLength(3);
  });
});
