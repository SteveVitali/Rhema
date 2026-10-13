// UX.1 — the branded magic-link email (replaces the bare "Sign in to Rhema" payload). One template,
// three render inputs: the verify URL (the ONLY place the token may appear), the configured expiry
// (minutes — derived from the same `expiresIn` the plugin enforces, never hard-coded), and a per-send
// nonce that makes each subject distinct without leaking the token (Gmail threads identical subjects;
// the token must never be subject-visible).

import { randomBytes } from "node:crypto";
import { MAGIC_LINK_EXPIRES_SECONDS, type SendMagicLink } from "./auth.js";

const BRAND = "Rhēma"; // macron — never "Rhema"

export interface MagicLinkMail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Escape a value before it lands inside HTML markup (the URL is server-built; escape anyway). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the sign-in email. `expiresInMinutes` comes from the plugin's configured `expiresIn`;
 * `sendNonce` is a fresh per-send value the caller generates (e.g. randomBytes hex) — it lives ONLY
 * in the subject + a footer line so an inbox can tell two sends apart; it is never the token.
 */
export function renderMagicLinkEmail(args: {
  url: string;
  expiresInMinutes: number;
  sendNonce: string;
}): MagicLinkMail {
  const { url, expiresInMinutes, sendNonce } = args;
  const minutes = Math.max(1, Math.round(expiresInMinutes));
  const expiryLine =
    minutes === 1 ? "This link expires in 1 minute." : `This link expires in ${minutes} minutes.`;
  const safetyLine = "Didn't request this? Ignore this email — nothing was signed in.";
  const subject = `Your ${BRAND} sign-in link · ${sendNonce}`;

  const text = [
    `Sign in to ${BRAND}`,
    "",
    `Use this link to sign in (${expiryLine.toLowerCase()})`,
    url,
    "",
    safetyLine,
  ].join("\n");

  const html = [
    `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f4f2ee;font-family:Georgia,'Times New Roman',serif;color:#1d1f24;">`,
    `<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e3ded4;border-radius:12px;padding:32px 28px;">`,
    `<p style="margin:0 0 20px;font-size:20px;font-weight:600;letter-spacing:0.2px;">${BRAND}</p>`,
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Sign in to ${BRAND} — this link is yours alone and it expires in ${minutes} minute${minutes === 1 ? "" : "s"}.</p>`,
    `<p style="margin:0 0 20px;"><a href="${esc(url)}" style="display:inline-block;background:#1d1f24;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:15px;font-weight:600;">Sign in to ${BRAND}</a></p>`,
    `<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#4a4e55;">If the button doesn't work, paste this link into your browser:</p>`,
    `<p style="margin:0 0 20px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${esc(url)}" style="color:#4a4e55;">${esc(url)}</a></p>`,
    `<p style="margin:0;font-size:13px;line-height:1.5;color:#6a6e75;">${safetyLine}</p>`,
    `<p style="margin:16px 0 0;font-size:11px;color:#9a9da3;">Sent by ${BRAND} · ref ${esc(sendNonce)}</p>`,
    `</div></body></html>`,
  ].join("");

  return { subject, text, html };
}

/**
 * The `SendMagicLink` the live composition hands `createAuth`: renders the branded template and
 * enqueues it on `auth.mail` (the worker's transport). A fresh nonce per send makes the subject
 * unique without the token ever leaving the URL.
 */
export function magicLinkSender(queue: {
  send(name: string, msg: Record<string, unknown>): Promise<unknown>;
}): SendMagicLink {
  return async ({ email, url }) => {
    const mail = renderMagicLinkEmail({
      url,
      expiresInMinutes: MAGIC_LINK_EXPIRES_SECONDS / 60,
      sendNonce: randomBytes(6).toString("hex"),
    });
    await queue.send("auth.mail", { to: email, ...mail });
  };
}
