import { describe, expect, it } from "vitest";
import { computeLockSet, conflicts, firstConflict, lockKeys, lockMode } from "./locks.js";

// AC4: lock matrix — second writer queues; review(vN,A) ∥ review(vN,B) allowed (k=1/k=2); persona run locks
// the persona, not the project. REQ-RUN-17; REQ-DATA-39/40.

describe("lock-set concurrency (§12.4; REQ-RUN-17)", () => {
  it("draft:read is shared; every other key is exclusive", () => {
    expect(lockMode(lockKeys.draftRead("d1"))).toBe("shared");
    expect(lockMode(lockKeys.draftWrite("d1"))).toBe("exclusive");
    expect(lockMode(lockKeys.nsWrite("author", "p1"))).toBe("exclusive");
    expect(lockMode(lockKeys.corr("d1", "review", 1))).toBe("exclusive");
    expect(lockMode(lockKeys.personaProfileWrite("pv1"))).toBe("exclusive");
  });

  it("a second writer-run on the same project conflicts (queues with the holder)", () => {
    const first = computeLockSet({
      workflow: "revise",
      seat: "author",
      projectId: "p1",
      nextDraftId: "d2",
      draftId: "d1",
    });
    const second = computeLockSet({
      workflow: "draft",
      seat: "author",
      projectId: "p1",
      nextDraftId: "d3",
    });
    expect(conflicts(second, first)).toBe(true);
    expect(firstConflict(second, first)).toBe(lockKeys.nsWrite("author", "p1"));
  });

  it("review(vN, A) ∥ review(vN, B) — variants take k=1 and k=2 and do not conflict", () => {
    const a = computeLockSet({ workflow: "review", seat: "editor", draftId: "d1", corrKind: "review", corrK: 1 });
    const b = computeLockSet({ workflow: "review", seat: "editor", draftId: "d1", corrKind: "review", corrK: 2 });
    expect(conflicts(a, b)).toBe(false);
    // both hold a shared read of the same draft — shared ∥ shared is fine.
    expect(a).toContain(lockKeys.draftRead("d1"));
    expect(b).toContain(lockKeys.draftRead("d1"));
  });

  it("two variants that both grabbed k=1 WOULD conflict (the corr lock is exclusive per k)", () => {
    const a = computeLockSet({ workflow: "review", seat: "editor", draftId: "d1", corrKind: "review", corrK: 1 });
    const dup = computeLockSet({ workflow: "review", seat: "editor", draftId: "d1", corrKind: "review", corrK: 1 });
    expect(conflicts(a, dup)).toBe(true);
  });

  it("a persona run locks the persona, not the project (review ∥ voice refresh)", () => {
    const persona = computeLockSet({ workflow: "refresh_voice", seat: "persona_builder", personaId: "pv1", projectId: "p1" });
    expect(persona).toEqual([lockKeys.personaProfileWrite("pv1")]);
    expect(persona).not.toContain(lockKeys.nsWrite("persona_builder", "p1"));

    const review = computeLockSet({ workflow: "review", seat: "editor", draftId: "d1", corrKind: "review", corrK: 1 });
    expect(conflicts(persona, review)).toBe(false); // review ∥ voice refresh
  });

  it("the Assistant takes no lock (Assistant ∥ anything)", () => {
    const assistant = computeLockSet({ workflow: "chat_turn", seat: "assistant", projectId: "p1" });
    expect(assistant).toEqual([]);
    const writer = computeLockSet({ workflow: "draft", seat: "author", projectId: "p1", nextDraftId: "d2" });
    expect(conflicts(assistant, writer)).toBe(false);
  });

  it("a reader ∥ a writer of the next version — the writer reserved a different draft id", () => {
    const reader = computeLockSet({ workflow: "review", seat: "editor", draftId: "d1", corrKind: "review", corrK: 1 });
    const writer = computeLockSet({ workflow: "draft", seat: "author", projectId: "p1", nextDraftId: "d2", draftId: "d1" });
    // reader shares draft:read:d1; writer holds draft:read:d1 (shared) + write:d2 → no exclusive overlap.
    expect(conflicts(reader, writer)).toBe(false);
  });
});
