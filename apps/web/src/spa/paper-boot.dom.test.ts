// @vitest-environment happy-dom
//
// REQ-WRITE-8 (239; B15) — the SPA-navigation paper arm: `applyPaperForPath` resolves
// `data-paper` synchronously at navigation start so the FIRST leaf paint sees the stored
// policy — never an intermediate value (the dark→light flash B15 measured on first paint).
// `reconcilePaperTheme` writes only on a real difference — the mirror arm already painted the
// right value, so the server truth never produces a second paper state within a navigation.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { paperStorageKey } from "@rhema/ide";
import { applyPaperForPath, projectSlugForPath, reconcilePaperTheme } from "./paper-boot.js";

/** Node ≥22's built-in experimental localStorage shadows happy-dom's Storage — the same
 *  MemStorage shim ide-chrome.dom.test.tsx carries. */
class MemStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  get length(): number {
    return this.map.size;
  }
}

describe("projectSlugForPath", () => {
  it("maps /p/<slug>/… and the demo alias, else null", () => {
    expect(projectSlugForPath("/p/acme")).toBe("acme");
    expect(projectSlugForPath("/p/acme/v/3")).toBe("acme");
    expect(projectSlugForPath("/demo/the-essay")).toBe("demo~the-essay");
    expect(projectSlugForPath("/app")).toBeNull();
    expect(projectSlugForPath("/")).toBeNull();
  });
});

describe("applyPaperForPath — the pre-paint mirror arm", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemStorage());
    document.documentElement.removeAttribute("data-paper");
    document.documentElement.removeAttribute("data-project");
  });

  it("applies the stored policy synchronously — no intermediate value before first paint", () => {
    localStorage.setItem(paperStorageKey("acme"), "dark");
    applyPaperForPath("/p/acme/v/4");
    expect(document.documentElement.getAttribute("data-paper")).toBe("dark");
    expect(document.documentElement.getAttribute("data-project")).toBe("acme");
  });

  it("a missing mirror falls to the project default `light` — never a stale policy from the previous project", () => {
    localStorage.setItem(paperStorageKey("other"), "dark");
    applyPaperForPath("/p/acme");
    expect(document.documentElement.getAttribute("data-paper")).toBe("light");
    expect(document.documentElement.getAttribute("data-project")).toBe("acme");
  });

  it("navigating BETWEEN projects swaps the policy atomically — the outgoing project's pin never lingers", () => {
    localStorage.setItem(paperStorageKey("a"), "dark");
    localStorage.setItem(paperStorageKey("b"), "follow");
    applyPaperForPath("/p/a");
    expect(document.documentElement.getAttribute("data-paper")).toBe("dark");
    applyPaperForPath("/p/b");
    expect(document.documentElement.getAttribute("data-paper")).toBe("follow");
    expect(document.documentElement.getAttribute("data-project")).toBe("b");
  });

  it("leaving project space clears both attributes — non-project routes carry no paper policy", () => {
    localStorage.setItem(paperStorageKey("acme"), "dark");
    applyPaperForPath("/p/acme");
    applyPaperForPath("/app/inbox");
    expect(document.documentElement.getAttribute("data-paper")).toBeNull();
    expect(document.documentElement.getAttribute("data-project")).toBeNull();
  });
});

describe("reconcilePaperTheme — the server-truth arm", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemStorage());
    document.documentElement.removeAttribute("data-paper");
  });

  it("writes only on a real difference — same policy leaves the attr untouched (no flip)", () => {
    document.documentElement.setAttribute("data-paper", "dark");
    reconcilePaperTheme("acme", "dark");
    expect(document.documentElement.getAttribute("data-paper")).toBe("dark");
    expect(localStorage.getItem(paperStorageKey("acme"))).toBe("dark");
  });

  it("a diverging twin truth corrects the attr + rewrites the mirror (the NEXT nav is flash-free)", () => {
    document.documentElement.setAttribute("data-paper", "light");
    reconcilePaperTheme("acme", "follow");
    expect(document.documentElement.getAttribute("data-paper")).toBe("follow");
    expect(localStorage.getItem(paperStorageKey("acme"))).toBe("follow");
  });

  it("null/absent policy is a no-op (a degraded twin never clobbers the mirror)", () => {
    document.documentElement.setAttribute("data-paper", "dark");
    reconcilePaperTheme("acme", null);
    expect(document.documentElement.getAttribute("data-paper")).toBe("dark");
  });
});
