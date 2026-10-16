import { mkdtempSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";
import { JourneySessions, assertTestIdentity, freshIdentity, stableIdentity } from "./session.js";
import { journeyNonce, testIdentity, marker } from "./nonce.js";
import { provenanceMatch } from "./provenance.js";

// JOURNEY.1 — the session guard + identity shapes + provenance compare (deterministic halves).

describe("assertTestIdentity — the session-minting guard", () => {
  it("accepts the base and plus-tag forms only", () => {
    expect(() => assertTestIdentity("test@rhema.tools")).not.toThrow();
    expect(() => assertTestIdentity("test+jrn-a@rhema.tools")).not.toThrow();
    expect(() => assertTestIdentity("test+j1nv@rhema.tools")).not.toThrow();
  });
  it("refuses every real/lookalike address — the harness cannot mint real-user sessions", () => {
    for (const bad of [
      "steve@rhema.tools",
      "test@evil.tools",
      "test@rhema.tools.evil",
      "tesseract@rhema.tools",
      "attacker+test@rhema.tools.evil",
      "",
      "not-an-email",
    ]) {
      expect(() => assertTestIdentity(bad), bad).toThrow(/test identities/);
    }
  });
});

describe("identity + nonce shapes", () => {
  it("freshIdentity is nonce-namespaced and unique per run", () => {
    const n1 = journeyNonce();
    const n2 = journeyNonce();
    expect(n1).not.toBe(n2);
    expect(freshIdentity(n1, "nv")).toBe(`test+j${n1}nv@rhema.tools`);
    expect(freshIdentity(n1, "nv")).not.toBe(freshIdentity(n2, "nv"));
  });
  it("stableIdentity is cache-stable across runs", () => {
    expect(stableIdentity("a")).toBe("test+jrn-a@rhema.tools");
    expect(stableIdentity("a")).toBe(stableIdentity("a"));
  });
  it("testIdentity + marker namespace artifacts", () => {
    expect(testIdentity("abc123", "tA")).toBe("test+jabc123ta@rhema.tools");
    expect(marker("deadbeef", "proj")).toBe("JRN-DEADBEEF-PROJ");
  });
});

// SPA.6 — the session-context wiring contract: onPage fires BEFORE the page's first navigation
// (a cached mint's /app probe is renderer-checked). SPA.28 — the extraHTTPHeaders pin leg retired
// with `x-rhema-renderer`; no session context may inject renderer headers anymore.
describe("JourneySessions — wiring order (REQ-VFY-7)", () => {
  it("a cached sign-in wires the page before its first goto (and carries no renderer pin)", async () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), "jrns-"));
    const email = stableIdentity("a");
    writeFileSync(path.join(stateDir, `${email.replace(/[^a-z0-9]/g, "_")}.json`), "{}");
    const order: string[] = [];
    const ctxOpts: Record<string, unknown>[] = [];
    const page = {
      url: () => "https://app.test/app",
      goto: async () => {
        order.push("goto");
        return { status: () => 200 };
      },
      waitForLoadState: async () => undefined,
    } as unknown as Page;
    const context = {
      newPage: async () => {
        order.push("newPage");
        return page;
      },
      storageState: async () => undefined,
      close: async () => undefined,
      cookies: async () => [{ name: "rhema-dev.session_token" }],
    };
    const browser = {
      newContext: async (o?: Record<string, unknown>) => {
        ctxOpts.push(o ?? {});
        return context;
      },
    } as unknown as Browser;
    const sessions = new JourneySessions({
      browser,
      mailbox: {} as never,
      webBaseUrl: "https://app.test",
      stateDir,
      onPage: () => order.push("onPage"),
    });
    const s = await sessions.signIn(email, { useCache: true });
    expect(s.via).toBe("cache");
    // SPA.28 — the context carries NO extraHTTPHeaders (the x-rhema-renderer pin is retired);
    // the wiring still precedes the probe's first navigation.
    expect(ctxOpts[0]).not.toHaveProperty("extraHTTPHeaders");
    expect(order).toEqual(["newPage", "onPage", "goto"]);
  });
});

// MAINT.6 (D-OPS.1-1) — the invite-code channel through mint: the seeded code rides the /signup
// form's real `code` field (the web stamps it `rhema_ic` on the link's callbackURL); absent ⇒ the
// field is left empty and open-mode minting is unchanged.
describe("JourneySessions — the --invite-code mint channel", () => {
  const harness = (inviteCode?: string, codeVisible = true) => {
    const stateDir = mkdtempSync(path.join(tmpdir(), "jrns-ic-"));
    const fills: [string, string][] = [];
    const clicks: string[] = [];
    const page = {
      url: () => "https://app.test/app",
      goto: async () => ({ status: () => 200 }),
      fill: async (sel: string, val: string) => {
        fills.push([sel, val]);
      },
      click: async (sel: string) => {
        clicks.push(sel);
      },
      waitForSelector: async () => ({}),
      waitForLoadState: async () => undefined,
      waitForTimeout: async () => undefined,
      locator: (sel: string) => ({
        // MAINT.6 — `codeVisible` models the invite-mode shape (the input rendered directly);
        // false models open-mode's collapsed <details> disclosure, which the mint opens first.
        isVisible: async () =>
          sel === 'input[name="code"]' ? codeVisible : sel.includes("summary") || sel.includes("status"),
        fill: async (val: string) => {
          fills.push([sel, val]);
        },
        click: async () => {
          clicks.push(sel);
        },
        first: () => ({
          isVisible: async () => sel.includes("status"), // the "link sent" status appears
          textContent: async () => null,
        }),
      }),
    } as unknown as Page;
    const context = {
      newPage: async () => page,
      storageState: async () => undefined,
      close: async () => undefined,
      cookies: async () => [{ name: "rhema.session_token" }],
    };
    const browser = {
      newContext: async () => context,
    } as unknown as Browser;
    const mailbox = {
      awaitMagicLink: async () => "https://app.test/api/auth/magic-link/verify?token=t",
    };
    const sessions = new JourneySessions({
      browser,
      mailbox: mailbox as never,
      webBaseUrl: "https://app.test",
      stateDir,
      ...(inviteCode ? { inviteCode } : {}),
    });
    return { sessions, fills, clicks };
  };

  it("fills input[name=code] with the seeded code before the magic_link submit", async () => {
    const { sessions, fills } = harness("prv-131-test");
    const email = freshIdentity("abcd", "ic");
    const s = await sessions.signIn(email);
    expect(s.via).toBe("mailbox");
    const codeFills = fills.filter(([sel]) => sel === 'input[name="code"]');
    expect(codeFills).toEqual([['input[name="code"]', "prv-131-test"]]);
    expect(fills).toContainEqual(['input[name="email"]', email]);
  });

  it("leaves the code field untouched when no invite code is configured", async () => {
    const { sessions, fills } = harness();
    await sessions.signIn(freshIdentity("efgh", "ic"));
    expect(fills.some(([sel]) => sel === 'input[name="code"]')).toBe(false);
  });

  it("opens the collapsed <details> disclosure first when the code field is hidden (open-mode form)", async () => {
    const { sessions, fills, clicks } = harness("prv-131-test", /* codeVisible */ false);
    await sessions.signIn(freshIdentity("ijkl", "ic"));
    expect(clicks).toContain('details:has(input[name="code"]) > summary');
    expect(fills).toContainEqual(['input[name="code"]', "prv-131-test"]);
  });
});

describe("provenanceMatch — the deploy-provenance compare", () => {
  it("matches full and short SHAs in either direction", () => {
    const full = "e6c91039e66ac3c42e97b6a8ce67150516a67ddf";
    expect(provenanceMatch(full, { web: full, api: full })).toBe(true);
    expect(provenanceMatch("e6c9103", { web: full })).toBe(true);
    expect(provenanceMatch(full, { web: "e6c9103" })).toBe(true);
  });
  it("fails closed on absent/unknown/mismatched SHAs", () => {
    const full = "e6c91039e66ac3c42e97b6a8ce67150516a67ddf";
    expect(provenanceMatch(full, { web: null })).toBe(false);
    expect(provenanceMatch(full, { web: "unknown" })).toBe(false);
    expect(provenanceMatch(full, { web: full, api: "deadbeef" + full.slice(8) })).toBe(false);
    expect(provenanceMatch("", { web: full })).toBe(false);
  });
});
