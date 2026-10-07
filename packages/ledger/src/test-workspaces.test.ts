import { describe, expect, it } from "vitest";
import {
  matchesTestMailbox,
  flagWorkspaceIfTestTenant,
  isTestWorkspace,
} from "./test-workspaces.js";

// JOURNEY.1 (REQ-SPEC-29; ADR-020) — the test-tenant flag's exact-match rule and its single write
// path. The flag grants nothing; these tests pin the predicate's edges so a sloppy `includes` can
// never widen it.

describe("matchesTestMailbox — the exact-match rule", () => {
  const base = "test@rhema.tools";
  it("matches the base address and base+tag, nothing else", () => {
    expect(matchesTestMailbox("test@rhema.tools", base)).toBe(true);
    expect(matchesTestMailbox("test+nv@rhema.tools", base)).toBe(true);
    expect(matchesTestMailbox("test+jrn-a@rhema.tools", base)).toBe(true);
    // lookalikes never match
    expect(matchesTestMailbox("tesseract@rhema.tools", base)).toBe(false);
    expect(matchesTestMailbox("test@rhema.tools.evil", base)).toBe(false);
    expect(matchesTestMailbox("test+x@other.tools", base)).toBe(false);
    expect(matchesTestMailbox("xtest+tag@rhema.tools", base)).toBe(false);
    expect(matchesTestMailbox("test2@rhema.tools", base)).toBe(false);
    expect(matchesTestMailbox("", base)).toBe(false);
  });
  it("is case-insensitive and trims", () => {
    expect(matchesTestMailbox("  Test+NV@Rhema.Tools ", base)).toBe(true);
    expect(matchesTestMailbox("test+x@rhema.tools", "TEST@RHEMA.TOOLS")).toBe(true);
  });
  it("unset/empty mailbox config ⇒ nothing matches", () => {
    expect(matchesTestMailbox("test@rhema.tools", undefined)).toBe(false);
    expect(matchesTestMailbox("test@rhema.tools", null)).toBe(false);
    expect(matchesTestMailbox("test@rhema.tools", "")).toBe(false);
    expect(matchesTestMailbox("test@rhema.tools", "not-an-email")).toBe(false);
  });
});

describe("flagWorkspaceIfTestTenant — the only write path", () => {
  const fakeDb = (rows: { is_test: boolean }[] = []) => {
    const updates: string[] = [];
    return {
      updates,
      async query(sql: string, params?: unknown[]) {
        if (/update workspaces set is_test/.test(sql)) updates.push(String(params?.[0]));
        if (/select is_test from workspaces/.test(sql)) return { rows };
        return { rows: [] };
      },
    };
  };

  it("flags only matching addresses", async () => {
    const db = fakeDb();
    expect(
      await flagWorkspaceIfTestTenant(db, {
        workspaceId: "w1",
        email: "test+j1a@rhema.tools",
        testMailbox: "test@rhema.tools",
      }),
    ).toBe(true);
    expect(db.updates).toEqual(["w1"]);
    expect(
      await flagWorkspaceIfTestTenant(db, {
        workspaceId: "w2",
        email: "real.user@example.com",
        testMailbox: "test@rhema.tools",
      }),
    ).toBe(false);
    expect(db.updates).toEqual(["w1"]); // untouched
  });

  it("no configured mailbox ⇒ nothing is ever flagged", async () => {
    const db = fakeDb();
    expect(
      await flagWorkspaceIfTestTenant(db, {
        workspaceId: "w1",
        email: "test@rhema.tools",
        testMailbox: undefined,
      }),
    ).toBe(false);
    expect(db.updates).toEqual([]);
  });

  it("isTestWorkspace reads the flag, defaulting false", async () => {
    expect(await isTestWorkspace(fakeDb([{ is_test: true }]), "w1")).toBe(true);
    expect(await isTestWorkspace(fakeDb([{ is_test: false }]), "w1")).toBe(false);
    expect(await isTestWorkspace(fakeDb([]), "w1")).toBe(false);
  });
});
