// 275_R6WEB.1 (RH-30) — the per-request CSP nonce channel.
//
// The nonce is minted by the document middleware BEFORE the handler runs and rides the request's
// AsyncLocalStorage scope (the same pattern `runWithPrincipal` uses on the api for the session
// principal — a request-scoped value that never crosses a tenant or request boundary). The document
// builders (`renderDocument`, `renderSpaShell`) read `currentCspNonce()` at author time and stamp it
// into the `<script>` tags THEY emit; the middleware stamps the same value into the
// `Content-Security-Policy` header on `text/html` responses. Markup the server did not author can no
// longer inherit a valid nonce — the response body is never rewritten.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import type { MiddlewareHandler } from "hono";

const nonceScope = new AsyncLocalStorage<string>();

/** Run `fn` with `nonce` as the request's CSP nonce (the HTML middleware wraps `next()` in this). */
export function runWithCspNonce<T>(nonce: string, fn: () => T): T {
  return nonceScope.run(nonce, fn);
}

/**
 * The request's CSP nonce at author time, or `null` outside a nonced request (tests calling the
 * builders directly, or a render after the request finished). `null` ⇒ emit the tag un-nonced —
 * fail-closed: an unmatched nonce never executes under `script-src 'nonce-…' 'self'`.
 */
export function currentCspNonce(): string | null {
  return nonceScope.getStore() ?? null;
}

/**
 * 275_R6WEB.1 (RH-30) — the document middleware: mint the per-request nonce, run the handler chain
 * inside its ALS scope (so the document builders can attach it to the `<script>` tags THEY author),
 * then stamp the policy + hardening headers on `text/html` responses. The response BODY is never
 * read or rewritten — the retired regex pass nonced every `<script>` in the whole body, letting
 * markup the server did not author inherit a working nonce; a tag the builders didn't emit now
 * stays un-nonced and fails closed under `script-src 'nonce-…' 'self'`.
 */
export function cspHtmlMiddleware(cspFor: (nonce: string) => string): MiddlewareHandler {
  return async (c, next) => {
    const nonce = randomBytes(16).toString("base64");
    await runWithCspNonce(nonce, () => next());
    const res = c.res;
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return;
    res.headers.set("Content-Security-Policy", cspFor(nonce));
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  };
}

