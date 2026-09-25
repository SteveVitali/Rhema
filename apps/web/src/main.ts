import { serve } from "@hono/node-server";
import { createWebApp } from "./server.js";
import { apiDataSource } from "./data.js";
import type { SessionHeaders } from "./data.js";
import { parseSignupMode } from "@rhema/contracts";

// Container entrypoint (PRB.16 — the live Better Auth binding). The browser session is the
// `__Host-rhema.session_token` cookie on THIS host: `session(c)` forwards the Cookie header to the api,
// which resolves it against the `session` table (`resolveSessionPrincipal`). `/api/auth/*` proxies to the
// api server-side so the OAuth callback + every auth cookie stay on the app host (the browser never talks
// to api.rhema.tools). The dev/preview identity-header fallback (the PRB.15 gateway shim) still forwards
// when a gateway injects it — the API only honors those headers on non-prod stages. Runs only when
// invoked directly, so importing this module in tests never starts a listener.

const IDENTITY_HEADERS = ["x-rhema-user-id", "x-rhema-workspace-id", "x-rhema-billing-account-id"] as const;
const SESSION_COOKIE_NAME = "__Host-rhema.session_token";
const DEV_SESSION_COOKIE_NAME = "rhema-dev.session_token";

/** The session cookie names the api can emit (prod https `__Host-` name; http dev fallback). */
const SESSION_COOKIE_NAMES = [SESSION_COOKIE_NAME, DEV_SESSION_COOKIE_NAME] as const;

/** Hop-by-hop + host headers that must never be relayed upstream. */
const STRIPPED_HEADERS = ["host", "connection", "content-length", "transfer-encoding", "expect"] as const;

/** Relay an upstream Response verbatim, preserving MULTIPLE `set-cookie` lines (Headers folds them). */
function relayResponse(upstream: Response): Response {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") headers.append(key, value);
  });
  for (const sc of upstream.headers.getSetCookie()) headers.append("set-cookie", sc);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export function startWebServer(): void {
  const apiBaseUrl = (process.env.API_BASE_URL ?? "http://api:8080").replace(/\/+$/, "");
  // The app's own public origin — the OAuth/magic-link callbackURL (the api's trusted-origins check
  // requires it). Defaults to the request's origin in `beginAuth` when unset (dev).
  const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  const port = Number(process.env.PORT ?? 8080);

  /** Server-side api call with the viewer's cookie forwarded (and the client IP, for throttles). */
  const apiFetch = (path: string, init: RequestInit = {}, cookie?: string, clientIp?: string) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("cookie", cookie);
    if (clientIp) headers.set("x-forwarded-for", clientIp);
    // Server-side fetches carry no browser Origin; better-auth's CSRF/origin check 403s those on
    // auth mutations (surfaced live 2026-09-22: beginAuth → sign-in/social → 403). Declare the app
    // origin explicitly — it's a trusted origin on the api.
    if (appBaseUrl && !headers.has("origin")) headers.set("origin", appBaseUrl);
    return fetch(`${apiBaseUrl}${path}`, { ...init, headers, redirect: "manual" });
  };

  const app = createWebApp({
    dataSource: apiDataSource(apiBaseUrl),
    // PRB.08 — the final-month beta-plan offer (copy + a link only; set by the deploy when the window opens).
    ...(process.env.BETA_PLAN_OFFER_URL ? { betaPlanOfferUrl: process.env.BETA_PLAN_OFFER_URL } : {}),
    // PRB.13 — signup.mode (REQ-BETA-19 amended): the flag fails closed — unset/unparseable ⇒ `invite`.
    signupMode: parseSignupMode(process.env.SIGNUP_MODE),
    // P1.03 — the Page's collab transport (the LB path-routes /collab to the collab service).
    ...(process.env.COLLAB_WS_URL ? { collabWsUrl: process.env.COLLAB_WS_URL } : {}),
    session(c) {
      const forwarded: Record<string, string> = {};
      const cookie = c.req.header("cookie");
      if (cookie) forwarded.cookie = cookie;
      // dev/preview shim: a gateway-injected identity (never honored on prod — the api gates it).
      for (const h of IDENTITY_HEADERS) {
        const v = c.req.header(h);
        if (v) forwarded[h] = v;
      }
      return Object.keys(forwarded).length > 0 ? (forwarded satisfies SessionHeaders) : null;
    },
    // PRB.16 — every /api/auth/* request proxies to the api verbatim (the state cookie + session cookie +
    // OAuth callback all land on THIS host). `redirect: "manual"` keeps the api's 302s for the browser.
    authProxy: async (req) => {
      const u = new URL(req.url);
      const headers = new Headers(req.headers);
      for (const h of STRIPPED_HEADERS) headers.delete(h);
      const upstream = await fetch(`${apiBaseUrl}${u.pathname}${u.search}`, {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
        redirect: "manual",
        duplex: "half", // undici requires `duplex` when relaying a streaming request body
      });
      return relayResponse(upstream);
    },
    async beginAuth(method, args, c) {
      const clientIp = c?.req.header("x-forwarded-for")?.split(",")[0]?.trim();
      const cookie = c?.req.header("cookie");
      // the post-sign-in landing — the app host's /app (a trusted origin on the api); P1.17 lets the
      // caller carry a same-origin path (the funnel intent's ?entry&held&src fallback).
      const next = args.next && args.next.startsWith("/") && !args.next.startsWith("//") ? args.next : "/app";
      const callbackURL = `${appBaseUrl ?? new URL(c?.req.url ?? "http://localhost").origin}${next}`;
      if (method === "google") {
        const res = await apiFetch(
          "/api/auth/sign-in/social",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ provider: "google", callbackURL }),
          },
          cookie,
          clientIp,
        );
        // relay the OAuth `state` cookie so the proxied callback can verify it (better-auth binds the
        // flow to the same browser with a signed cookie + verification row).
        if (c) for (const sc of res.headers.getSetCookie()) c.header("set-cookie", sc, { append: true });
        if (!res.ok) return { redirect: "/login" };
        const body = (await res.json().catch(() => ({}))) as { url?: string };
        return body.url ? { redirect: body.url } : { redirect: "/login" };
      }
      // magic_link — the api enqueues the send (`auth.mail`); Resend itself is a deferred live leg.
      const res = await apiFetch(
        "/api/auth/sign-in/magic-link",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: args.email, callbackURL }),
        },
        cookie,
        clientIp,
      );
      if (c) for (const sc of res.headers.getSetCookie()) c.header("set-cookie", sc, { append: true });
      return { sent: res.ok };
    },
    async endSession(c) {
      const cookie = c.req.header("cookie");
      if (cookie) {
        await apiFetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, cookie).catch(() => undefined);
      }
      for (const name of SESSION_COOKIE_NAMES) {
        // A `__Host-`-named deletion still needs Secure (the browser applies the prefix rule to every
        // Set-Cookie carrying the name, Max-Age=0 included); the dev http name must NOT carry it.
        const secure = name.startsWith("__Host-") ? "; Secure" : "";
        c.header("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`, { append: true });
      }
    },
  });
  serve({ fetch: app.fetch, port });
  console.log(`[web] listening on :${port} (api ${apiBaseUrl})`);
}

if (process.argv[1] && process.argv[1].endsWith("main.js")) {
  startWebServer();
}
