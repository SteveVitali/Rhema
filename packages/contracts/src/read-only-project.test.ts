// R7RO.1 (REQ-DWEB-14) — the shared read-only type: reason vocabulary + wire validation.
import { describe, expect, it } from "vitest";
import {
  READ_ONLY_REASONS,
  readOnlyProjectOf,
  type ReadOnlyProject,
} from "./read-only-project.js";

describe("ReadOnlyProject (REQ-DWEB-14; S-3)", () => {
  it("names exactly the three reasons — demo, showcase, run_lock (never 'frozen')", () => {
    expect(READ_ONLY_REASONS).toEqual(["demo", "showcase", "run_lock"]);
    // RV-19 — a frozen VERSION is not a reason: typing in it forks v(N+1) (REQ-WRITE-7).
    expect(READ_ONLY_REASONS).not.toContain("frozen");
  });

  it.each(READ_ONLY_REASONS)("parses the %s reason", (reason) => {
    expect(readOnlyProjectOf({ reason })).toEqual({ reason } satisfies ReadOnlyProject);
  });

  it("fails closed on unknown reasons and non-objects", () => {
    for (const v of [
      undefined,
      null,
      "showcase",
      42,
      {},
      { reason: "frozen" },
      { reason: "locked" },
      { reason: 7 },
      { reason: null },
      [],
    ]) {
      expect(readOnlyProjectOf(v)).toBeNull();
    }
  });
});
