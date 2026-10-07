// JOURNEY.1 — session management (the "login through a real magic link" deliverable).
// Sessions are ONLY ever minted for `test@…`/`test+<tag>@…` addresses on the pinned mailbox's
// domain — `assertTestIdentity` refuses anything else, so the harness can never mint a session for
// a real user (and never lifts one: no cookie import path exists). Two identity shapes:
//
//   fresh  — `test+j<nonce><tag>@…`  (new-visitor legs; every run's N2 exercises the mailbox leg)
//   stable — `test+jrn-<tag>@…`      (returning-user legs; storageState-cached so a run doesn't
//                                    burn a link per step — a dead cache (the hourly purge reaped
//                                    the tenant) falls back to a fresh link, which is the
//                                    storage-state-expiry leg)

import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import type { MailboxClient } from "./mailbox.js";
import { TEST_MAILBOX } from "./mailbox.js";

/** the pinned mailbox's local-part and domain — `test` + `rhema.tools`. */
const [BASE_LOCAL, BASE_DOMAIN] = TEST_MAILBOX.split("@") as [string, string];

/** Refuse anything that is not a test-mailbox address — the session-minting guard. */
export function assertTestIdentity(email: string): void {
  const [local, domain] = email.trim().toLowerCase().split("@", 2);
  const ok = domain === BASE_DOMAIN && (local === BASE_LOCAL || local!.startsWith(`${BASE_LOCAL}+`));
  if (!ok) {
    throw new Error(
      `journeys may only mint sessions for test identities (${BASE_LOCAL}[+<tag>]@${BASE_DOMAIN}) — refused ${email}`,
    );
  }
}

/** A new-visitor identity (fresh every run — N2's mailbox leg runs cold each time). */
export function freshIdentity(nonce: string, tag: string): string {
  const clean = tag.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return `test+j${nonce}${clean}@rhema.tools`;
}

/** A returning identity (stable across runs — storageState survives between runs). */
export function stableIdentity(tag: string): string {
  const clean = tag.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return `test+jrn-${clean}@rhema.tools`;
}

export interface SessionDeps {
  readonly browser: Browser;
  readonly mailbox: MailboxClient;
  readonly webBaseUrl: string;
  /** dir for the storageState cache (gitignored; per-tag files) */
  readonly stateDir: string;
  /** magic-link wait budget (Resend delivery + gmail.list poll) */
  readonly linkTimeoutMs?: number;
  /** viewport for signed-in contexts (R4 checks 1440×900 separately) */
  readonly viewport?: { width: number; height: number };
}

export interface SignedIn {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly email: string;
  /** `mailbox` ⇒ the full link leg ran this call; `cache` ⇒ storageState carried the session. */
  readonly via: "mailbox" | "cache";
}

export class JourneySessions {
  constructor(private readonly deps: SessionDeps) {}

  private statePath(email: string): string {
    return path.join(this.deps.stateDir, `${email.replace(/[^a-z0-9]/g, "_")}.json`);
  }

  /**
   * A signed-in context for `email` — mints through the real magic-link flow. `useCache` reuses a
   * stored storageState when it still authenticates (the probe: /app must not bounce to /login).
   */
  async signIn(email: string, opts: { useCache?: boolean } = {}): Promise<SignedIn> {
    assertTestIdentity(email);
    const statePath = this.statePath(email);
    if (opts.useCache && existsSync(statePath)) {
      const cached = await this.open(statePath);
      const alive = await this.probe(cached.page);
      if (alive) return { ...cached, email, via: "cache" };
      await cached.context.close(); // dead state (purged tenant / expired cookie) — re-mint below
    }
    const fresh = await this.mint(email);
    await mkdir(this.deps.stateDir, { recursive: true });
    await fresh.context.storageState({ path: statePath });
    return { ...fresh, email, via: "mailbox" };
  }

  /** Probe a context: does /app authenticate (no /login bounce)? */
  private async probe(page: Page): Promise<boolean> {
    try {
      await page.goto(`${this.deps.webBaseUrl}/app`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      return !/\/login|\/signup/.test(new URL(page.url()).pathname);
    } catch {
      return false;
    }
  }

  private async open(storageState: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await this.deps.browser.newContext({
      baseURL: this.deps.webBaseUrl,
      storageState,
      ...(this.deps.viewport ? { viewport: this.deps.viewport } : {}),
    });
    return { context, page: await context.newPage() };
  }

  /**
   * The real magic-link round-trip: submit the /signup form (a fresh address is admitted under open
   * mode; a purged stable address re-provisions the same way), read the link out of the pinned test
   * mailbox, navigate it, and land signed-in. Asserts the "link sent" UI state AND the mailbox leg.
   */
  private async mint(email: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await this.deps.browser.newContext({
      baseURL: this.deps.webBaseUrl,
      ...(this.deps.viewport ? { viewport: this.deps.viewport } : {}),
    });
    const page = await context.newPage();
    await page.goto(`${this.deps.webBaseUrl}/signup`, { waitUntil: "domcontentloaded" });
    const sentAt = Math.floor(Date.now() / 1000) - 30;
    await page.fill('input[name="email"]', email);
    // the magic-link submit (never the google button — this harness uses no third-party IdP)
    await page.click('button[name="method"][value="magic_link"]');
    // "link sent" — the POST round-trips api admission + personal-workspace provisioning (the
    // Showcase seed writes artifacts + content-store bytes), so 15 s is too tight on prod; 45 s
    // still fails fast enough to matter.
    await page.waitForSelector('[role="status"]', { timeout: 45_000 });
    const link = await this.deps.mailbox.awaitMagicLink(
      email,
      sentAt,
      this.deps.linkTimeoutMs ?? 120_000,
    );
    await page.goto(link, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    // Signed-in assertion: landed inside the app (any non-auth path) AND the session cookie exists.
    const pathNow = new URL(page.url()).pathname;
    if (/\/login|\/signup/.test(pathNow)) {
      throw new Error(`magic link for ${email} did not authenticate (landed on ${pathNow})`);
    }
    const cookies = await context.cookies(this.deps.webBaseUrl);
    const hasSession = cookies.some((c) => /session/i.test(c.name));
    if (!hasSession) throw new Error(`magic link for ${email} set no session cookie`);
    return { context, page };
  }
}
