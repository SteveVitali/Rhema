import { serve } from "@hono/node-server";
import { createInternalTokenMinter } from "./internal-token.js";
import { createWebApp } from "./server.js";
import { requestLogContext } from "./observability.js";
import { apiDataSource } from "./data.js";
import type { SessionHeaders } from "./data.js";
import {
  parseSignupMode,
  forwardedClientIp,
  INTERNAL_CLIENT_IP_HEADER,
  INTERNAL_IDENTITY_HEADER,
  INVITE_CODE_PARAM,
} from "@rhema/contracts";

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

  // SEC.2 (ADR-040) — the trusted web→api client-IP channel: the resolved browser IP rides
  // `x-rhema-client-ip`, authenticated by this service's runtime-SA OIDC ID token on
  // `x-rhema-internal-token` (audience = INTERNAL_AUTH_AUDIENCE, the api origin). The credential is
  // minted ambiently from the metadata server — NO secret reaches web (REQ-ARCH-30). The minter
  // caches to exp−60s, negative-caches a miss for 60s, and times out at 2s (internal-token.ts).
  // Unset audience ⇒ never stamped (local dev — the api's penultimate-XFF rule governs there).
  const mintInternalToken = createInternalTokenMinter({
    audience: process.env.INTERNAL_AUTH_AUDIENCE,
  });

  /** The trusted client-IP stamp for one resolved browser IP (undefined when no token can be minted). */
  const stampInternal = async (clientIp: string): Promise<Record<string, string> | undefined> => {
    const token = await mintInternalToken();
    if (!token) return undefined;
    return { [INTERNAL_CLIENT_IP_HEADER]: clientIp, [INTERNAL_IDENTITY_HEADER]: token };
  };

  /**
   * Server-side api call with the viewer's cookie forwarded + the resolved browser IP stamped on the
   * TRUSTED internal channel (ADR-040 — a caller-readable XFF position is never the bucket key when
   * the stamp verifies). No token ⇒ the XFF fallback carries it (dev posture).
   */
  const apiFetch = async (
    path: string,
    init: RequestInit = {},
    cookie?: string,
    clientIp?: string,
    requestId?: string,
  ) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("cookie", cookie);
    // OBS.1 — the request's correlation id joins this auth leg to the same LB→web→api trail.
    if (requestId) headers.set("x-rhema-request-id", requestId);
    if (clientIp) {
      const stamp = await stampInternal(clientIp);
      if (stamp) {
        for (const [k, v] of Object.entries(stamp)) headers.set(k, v);
      } else {
        headers.set("x-forwarded-for", clientIp);
      }
    }
    // Server-side fetches carry no browser Origin; better-auth's CSRF/origin check 403s those on
    // auth mutations (surfaced live 2026-09-22: beginAuth → sign-in/social → 403). Declare the app
    // origin explicitly — it's a trusted origin on the api.
    if (appBaseUrl && !headers.has("origin")) headers.set("origin", appBaseUrl);
    return fetch(`${apiBaseUrl}${path}`, { ...init, headers, redirect: "manual" });
  };

  const app = createWebApp({
    // SEC.2 — the signup call stamps the resolved browser IP on the trusted channel (ADR-040).
    dataSource: apiDataSource(apiBaseUrl, undefined, stampInternal),
    // PRB.08 — the final-month beta-plan offer (copy + a link only; set by the deploy when the window opens).
    ...(process.env.BETA_PLAN_OFFER_URL ? { betaPlanOfferUrl: process.env.BETA_PLAN_OFFER_URL } : {}),
    // PRB.13 — signup.mode (REQ-BETA-19 amended): the flag fails closed — unset/unparseable ⇒ `invite`.
    signupMode: parseSignupMode(process.env.SIGNUP_MODE),
    // SPA.28 — `SPA_SURFACES`/`SPA_OVERRIDES` are gone (REQ-SEQ-4's removal leg): the shell is the
    // sole renderer for every authenticated document, so there is no flag set to parse and no
    // override channel to honor — the env vars are simply un-read now.
    // P1.03 — the Page's collab transport (the LB path-routes /collab to the collab service).
    ...(process.env.COLLAB_WS_URL ? { collabWsUrl: process.env.COLLAB_WS_URL } : {}),
    // SPA.13 (REQ-BFF-16) — the GCS upload origin CSP admits for the browser's direct-PUT leg;
    // unset ⇒ the v4-signer default in createWebApp.
    ...(process.env.GCS_UPLOAD_ORIGIN ? { gcsUploadOrigin: process.env.GCS_UPLOAD_ORIGIN } : {}),
    // JOURNEY.1 — the image-baked deploy SHA for /healthz provenance.
    ...(process.env.RHEMA_BUILD_GIT_SHA ? { buildGitSha: process.env.RHEMA_BUILD_GIT_SHA } : {}),
    // OBS.1 — the Cloud Logging trace join field (app error lines join the LB's trace-sampled log).
    ...(process.env.GOOGLE_CLOUD_PROJECT ? { gcpProject: process.env.GOOGLE_CLOUD_PROJECT } : {}),
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
    // PRB.16 — every /api/auth/* request proxies to the api server-side (the state cookie + session
    // cookie + OAuth callback all land on THIS host). `redirect: "manual"` keeps the api's 302s for the
    // browser. SEC.2 (ADR-040): the proxy STRIPS any client-supplied internal stamp (a browser can set
    // `x-rhema-client-ip`/`x-rhema-internal-token` — the api ignores them without a valid token, but the
    // relay still must not forward a forged claim) and re-stamps the RESOLVED browser IP itself, so the
    // api's shared throttle + admission hooks key the real caller on the OAuth-callback/verify legs too.
    authProxy: async (req) => {
      const u = new URL(req.url);
      const headers = new Headers(req.headers);
      for (const h of STRIPPED_HEADERS) headers.delete(h);
      headers.delete(INTERNAL_CLIENT_IP_HEADER);
      headers.delete(INTERNAL_IDENTITY_HEADER);
      const browserIp = forwardedClientIp(req.headers.get("x-forwarded-for") ?? undefined);
      const stamp = browserIp !== "unknown" ? await stampInternal(browserIp) : undefined;
      if (stamp) {
        for (const [k, v] of Object.entries(stamp)) headers.set(k, v);
      } else if (browserIp !== "unknown") {
        // No token (dev/metadata outage): collapse the caller-controlled chain to the resolved hop,
        // so the api's penultimate-XFF rule still keys the real client, not this web instance's egress.
        headers.set("x-forwarded-for", browserIp);
      }
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
      // SEC.2 — the resolved browser IP under the LB rule (penultimate XFF hop — never the
      // caller-controlled first hop); it rides the trusted stamp on every server-side auth call.
      const clientIp = forwardedClientIp(c?.req.header("x-forwarded-for"));
      const cookie = c?.req.header("cookie");
      // the post-sign-in landing — the app host's /app (a trusted origin on the api); P1.17 lets the
      // caller carry a same-origin path (the funnel intent's ?entry&held&src fallback). SEC.2 — a
      // supplied invite code rides `rhema_ic` on the callbackURL so the api's magic-link verify /
      // OAuth callback admission hook sees the SAME code POST /signup validated.
      const next = args.next && args.next.startsWith("/") && !args.next.startsWith("//") ? args.next : "/app";
      const appOrigin = appBaseUrl ?? new URL(c?.req.url ?? "http://localhost").origin;
      const cb = new URL(next, appOrigin);
      if (args.code?.trim()) cb.searchParams.set(INVITE_CODE_PARAM, args.code.trim());
      const callbackURL = cb.toString();
      // SEC.2 — admission/throttle refusals on the verify/OAuth-callback legs redirect to
      // `errorCallbackURL` (NOT the post-sign-in callbackURL, whose `/app` session guard would drop
      // the `?error=` code and render a silent failure). `/login` renders the mapped copy.
      // Better-auth origin-checks it at verify/callback against trustedOrigins — the app origin qualifies.
      const errorCallbackURL = new URL("/login", appOrigin).toString();
      const authError = async (res: Response): Promise<{ error: string }> => {
        // the api's refusal codes (`rate_limited`, `invite_required`, invite reject reasons…) arrive
        // as `{code|error|message}` in the JSON body or on a redirect's `?error=`; classify 429 as
        // rate_limited regardless, and treat anything else as an unavailable auth call — never sent.
        let code: string | undefined;
        const loc = res.headers.get("location");
        if (loc) code = new URL(loc, "https://rhema.invalid").searchParams.get("error") ?? undefined;
        if (!code) {
          const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string; message?: string };
          code = body.code ?? body.error ?? (body.message === "rate_limited" ? "rate_limited" : undefined);
        }
        if (res.status === 429) code = "rate_limited";
        return { error: code ?? "auth_unavailable" };
      };
      if (method === "google") {
        const res = await apiFetch(
          "/api/auth/sign-in/social",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            // SEC.2 — the code rides `additionalData`; the api promotes it into the state's TRUSTED
            // serverContext only because this call carries the verified OIDC stamp (ADR-040).
            body: JSON.stringify({
              provider: "google",
              callbackURL,
              errorCallbackURL,
              ...(args.code?.trim() ? { additionalData: { [INVITE_CODE_PARAM]: args.code.trim() } } : {}),
            }),
          },
          cookie,
          clientIp,
          c ? requestLogContext(c).requestId : undefined,
        );
        // relay the OAuth `state` cookie so the proxied callback can verify it (better-auth binds the
        // flow to the same browser with a signed cookie + verification row).
        if (c) for (const sc of res.headers.getSetCookie()) c.header("set-cookie", sc, { append: true });
        if (!res.ok) return authError(res);
        const body = (await res.json().catch(() => ({}))) as { url?: string };
        return body.url ? { redirect: body.url } : { error: "auth_unavailable" };
      }
      // magic_link — the api enqueues the send (`auth.mail`) behind ITS shared throttle + admission
      // gate (SEC.2 — a refusal arrives here as the error, never a false "sent"); Resend itself is a
      // deferred live leg.
      const res = await apiFetch(
        "/api/auth/sign-in/magic-link",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          // `errorCallbackURL` rides the emailed link's query; a refused verify (invite/throttle)
          // lands back on /login with the api's stable `?error=` code instead of a dead /app guard.
          body: JSON.stringify({ email: args.email, callbackURL, errorCallbackURL }),
        },
        cookie,
        clientIp,
        c ? requestLogContext(c).requestId : undefined,
      );
      if (c) for (const sc of res.headers.getSetCookie()) c.header("set-cookie", sc, { append: true });
      if (!res.ok) return authError(res);
      return { sent: true };
    },
    async endSession(c) {
      const cookie = c.req.header("cookie");
      if (cookie) {
        await apiFetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, cookie, undefined, requestLogContext(c).requestId).catch(() => undefined);
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
