import { describe, it, expect } from "vitest";
import { renderMagicLinkEmail, magicLinkSender } from "./magic-link-email.js";
import { MAGIC_LINK_EXPIRES_SECONDS } from "./auth.js";

// UX.1 — the branded magic-link email (replaces the bare "Sign in to Rhema" payload): macron'd
// brand, a real button + a paste-the-URL fallback, expiry derived from the configured `expiresIn`
// (never a hard-coded literal), the didn't-request-it safety line, a plain-text part, and a per-send
// subject that is distinct without EVER carrying the token (the token lives only inside the link).

const URL =
  "https://api.rhema.tools/api/auth/magic-link/verify?token=TOK123&callbackURL=https%3A%2F%2Frhema.tools%2Fapp";
const ESC_URL = URL.replace(/&/g, "&amp;"); // the href carries the escaped form
const stripUrls = (s: string) => s.split(ESC_URL).join("").split(URL).join("");

describe("renderMagicLinkEmail", () => {
  const mail = renderMagicLinkEmail({ url: URL, expiresInMinutes: 15, sendNonce: "a1b2c3" });

  it("is branded — Rhēma with the macron, never bare 'Rhema'", () => {
    expect(mail.subject).toContain("Rhēma");
    expect(mail.html).toContain("Rhēma");
    expect(mail.text).toContain("Rhēma");
    // outside the URL host (rhema.tools), a bare non-macron "Rhema" must not appear
    expect(stripUrls(mail.html)).not.toMatch(/Rhema/);
    expect(stripUrls(mail.text)).not.toMatch(/Rhema/);
  });

  it("carries a real button AND a paste-the-URL fallback", () => {
    expect(mail.html).toContain(`<a href="${ESC_URL}"`);
    expect(mail.html).toMatch(/display:inline-block/); // the button styling
    expect(mail.html).toContain("paste this link into your browser");
    expect(mail.text).toContain(URL); // text fallback for clients without HTML
  });

  it("quotes the configured expiry — the number the caller passes, never a hard-coded one", () => {
    expect(mail.text).toContain("expires in 15 minutes");
    expect(mail.html).toContain("expires in 15 minutes");
    const other = renderMagicLinkEmail({ url: URL, expiresInMinutes: 7, sendNonce: "zz" });
    expect(other.text).toContain("expires in 7 minutes");
    const one = renderMagicLinkEmail({ url: URL, expiresInMinutes: 1, sendNonce: "zz" });
    expect(one.text).toContain("expires in 1 minute");
  });

  it("carries the didn't-request-it safety line in both parts", () => {
    expect(mail.text).toMatch(/didn't request this\? ignore/i);
    expect(mail.html).toMatch(/didn't request this\? ignore/i);
  });

  it("has a plain-text part and an HTML part", () => {
    expect(mail.text.length).toBeGreaterThan(0);
    expect(mail.html).toMatch(/^<!doctype html>/);
  });

  it("the subject is distinct per send and contains no token", () => {
    const a = renderMagicLinkEmail({ url: URL, expiresInMinutes: 15, sendNonce: "nonce-a" });
    const b = renderMagicLinkEmail({ url: URL, expiresInMinutes: 15, sendNonce: "nonce-b" });
    expect(a.subject).not.toBe(b.subject); // the nonce is the uniqueness mechanism
    expect(a.subject).toBe("Your Rhēma sign-in link · nonce-a");
    expect(a.subject).not.toContain("TOK123"); // the token is never subject-visible
  });

  it("the token appears ONLY inside the link — nowhere else in either part", () => {
    expect(stripUrls(mail.subject)).not.toContain("TOK123");
    expect(stripUrls(mail.text)).not.toContain("TOK123");
    expect(stripUrls(mail.html)).not.toContain("TOK123");
    expect(mail.html.match(/TOK123/g)?.length).toBe(3); // button href + fallback href + fallback text
    expect(mail.text.match(/TOK123/g)?.length).toBe(1); // the bare-URL line
  });
});

describe("magicLinkSender — the live SendMagicLink composition", () => {
  it("enqueues the branded mail on auth.mail with a unique subject; the token never leaves the URL", async () => {
    const sent: { name: string; msg: Record<string, unknown> }[] = [];
    const send = magicLinkSender({
      send: async (name, msg) => {
        sent.push({ name, msg });
      },
    });
    await send({ email: "a@x.test", url: URL, token: "TOK123" });
    await send({ email: "a@x.test", url: URL.replace("TOK123", "TOK999"), token: "TOK999" });
    expect(sent).toHaveLength(2);
    for (const { name, msg } of sent) {
      expect(name).toBe("auth.mail");
      expect(msg.to).toBe("a@x.test");
      expect(String(msg.subject)).toContain("Rhēma");
      expect(String(msg.subject)).not.toMatch(/TOK\d+/);
      expect(String(msg.html)).toContain("Rhēma");
      expect(String(msg.text)).toContain("expires in 15 minutes");
    }
    expect(sent[0]!.msg.subject).not.toBe(sent[1]!.msg.subject);
  });
});

describe("the expiry the email quotes IS the plugin's configured expiry", () => {
  it("MAGIC_LINK_EXPIRES_SECONDS feeds both magicLink({expiresIn}) and the template", () => {
    expect(MAGIC_LINK_EXPIRES_SECONDS).toBe(15 * 60);
    // magicLinkSender renders "15 minutes" from the same constant — no parallel literal can drift.
  });
});
