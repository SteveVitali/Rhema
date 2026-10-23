import { Hono } from "hono";
import type { Context } from "hono";
import { renderDocument } from "./render.js";
// SPA.28 — the deletion wave + override removal leave the SSR elements: the public funnel
// (invite / landing / pricing / signup / login / showcase ± signed-in) + the R6LGL.1 legal/trust
// documents (terms / privacy / refunds / acceptable-use / contact — REQ-LCH-1), the Page
// family's forced-SSR documents (project / page / compare / revision — REQ-ED-12, phone &
// showcase only; the `?ssr=1` escape is gone), and the not-found document every POST refusal +
// the catch-all still render. The flipped-surface elements are deleted with their render paths —
// `routes.tsx` keeps their manifest rows at `element: null` so the SPA router owns them.
import {
  inviteElement,
  landingElement,
  pricingElement,
  signupElement,
  loginElement,
  projectElement,
  revisionElement,
  pageElement,
  compareElement,
  showcaseElement,
  showcaseSignedInElement,
  notFoundElement,
} from "./routes.js";
import { legalElements } from "./legal.js";
import { FAVICON_SVG } from "./brand.js";
import { COPY } from "./copy.js";
import type { DataSource, SessionHeaders, ImportInput, ImportPreviewOutcome, DossierData } from "./data.js";
import { feedLabelMaps, feedRowsFor } from "./feed-labels.js";
import type { TimelineDto, RunSheetContextDto, GateCardDto, InboxItemDto, ProjectSettingsPatch, OutlineDto, EstimateRequestDto, CreatedRunDto, RestorePointsDto, RestorePreviewDto, VersionRailDto } from "@rhema/api-client";
import type { ProjectRow } from "@rhema/api-client";
import { parseScopes, scopedInputs, serializeScopes, scopeChip, VERB_TABLE, type ScopeRef } from "@rhema/commands";
import type { PaletteData } from "@rhema/ide";
import type { FeedRow } from "@rhema/ui";
import type { PageData } from "./page-data.js";
import { bffFail, bffRoute, bodyFields, confirmEmailHandler, mutationOutcome, projectHandoffHandler, projectRow as bffProjectRow, projectRows, swallowDegraded, wantsJson } from "./bff.js";
import { DEFAULT_SPA_ASSET_ROOT, spaShellDocument } from "./spa-shell.js";
import { isPhoneRequest } from "./device.js";
import { loadEditorPage, docJsonFor } from "./page-data.js";
import type { ConversionResult } from "@rhema/contracts";
import {
  PRICING,
  RIGORS,
  MODEL_TIERS,
  forwardedClientIp,
  spaRouteFor,
  type ModelTier,
  type Rigor,
  type SignupMode,
  type WorkflowKey,
  figureIdFromRef,
  STRIPE_HOSTED_ORIGINS,
  GOOGLE_OAUTH_ORIGINS,
  isGoogleOAuthRedirect,
  isStripeHostedRedirect,
  isLaunchedWorkflow,
} from "@rhema/contracts";
import {
  buildRunSheetView,
  resolveSheetConfig,
  sheetProfile,
  surfaceEstimate,
  type ToggleKey,
  type ToggleState,
} from "@rhema/run-sheet";
import { ApiError } from "@rhema/api-client";
import {
  logWebRouteError,
  requestContext as obsRequestContext,
  requestLogContext,
  webOnError,
  withRequestId,
} from "./observability.js";
import {
  applySeverityBudget,
  filterFindings,
  parseFindingFilters,
  // P1.09 — the gate card's `ed.*` form grammar → the structured-edits payload (§6.4 item 4).
  decodeGateEditFields,
} from "@rhema/findings-core";
import { GATE_KINDS, isCslStyle, isExportFormat, isMdExportProfile, claimsForAudience, errorClass, stackForLog, REQUEST_ID_HEADER, LEGAL_PAGES, type GateKind, type PublicClaimsConfig, type FindingView } from "@rhema/contracts";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CLIENT_ENTRIES } from "../client-entries.mjs";

// The beta web shell server (Hono). SSR only — every route renders HTML; forms POST and links navigate (no
// client bundle). Auth-gated routes redirect to /login. `signup.mode` decides what POST /login requires
// (REQ-BETA-19 amended 2026-09-16): `invite` — no code ⇒ no auth request is ever made; `open` — self-serve
// signup, a supplied code still validated. Account admission itself is the api's `POST /signup` (throttled
// per IP + email; invite consume happens there at creation); SEC.2 moved the magic-link SEND throttle to
// the api too (the shared Redis store + `hooks.before` on `/api/auth/sign-in/magic-link` — a direct caller
// can't bypass it), so the web's old per-instance limiter is RETIRED: a refusal arrives as the api's
// 429/`rate_limited` and renders the same copy (ADR-041). The live Better Auth session/OAuth binding is
// D-P0.01-3 (deploy) — injected via `session` / `beginAuth` so the shell is fully unit-testable offline.

export interface AuthOutcome {
  /** Redirect the browser here (e.g. the Google OAuth start, or the post-login landing). */
  readonly redirect?: string;
  /** A magic-link email was sent — show the "check your email" state. */
  readonly sent?: boolean;
  /**
   * SEC.2 — the auth call was refused upstream (the api's shared throttle ⇒ "rate_limited"; anything
   * else ⇒ "auth_unavailable"). The routes render the matching copy instead of a false "sent" state.
   */
  readonly error?: string;
}

export interface WebDeps {
  readonly dataSource: DataSource;
  /** Resolve the viewer's session into headers to forward to the api, or null when unauthenticated. */
  session(c: Context): SessionHeaders | null;
  /**
   * Begin auth AFTER the invite passed (magic link / Google). Default: magic-link "sent". The Context is
   * passed so the live impl can relay the api's Set-Cookie (the OAuth `state` cookie) onto the response.
   */
  beginAuth?(method: string, args: { code: string; email?: string; next?: string }, c?: Context): Promise<AuthOutcome>;
  /** End the session (clears the cookie). Default: no-op. */
  endSession?(c: Context): Promise<void>;
  /**
   * PRB.16 — the auth proxy: forwards `/api/auth/*` to the api server-side so every Better Auth cookie
   * plants host-only on THIS (the app) host — the OAuth callback, magic-link verify, sign-out, and the
   * state cookie all round-trip through it. Unset ⇒ `/api/auth/*` 404s (pre-PRB.16 posture).
   */
  authProxy?(req: Request): Promise<Response>;
  /** PRB.08 — the final-month beta-plan offer's link (copy + link only; unset ⇒ no offer line renders). */
  readonly betaPlanOfferUrl?: string;
  /**
   * PRB.13 — `signup.mode` (REQ-BETA-19 amended 2026-09-16): `invite` keeps the PRB.01 gate; `open`
   * permits a no-code signup. Unset ⇒ `invite` — the flag fails closed.
   */
  readonly signupMode?: SignupMode;
  // SPA.28 (REQ-SEQ-4's removal leg) — the migration-window machinery is GONE: `spaSurfaces`,
  // `spaOverrides`, and the `deps.spa` consult are retired. Every auth'd document handler serves
  // the shell unconditionally after its session gate + server-owned redirects + the Page family's
  // forced-SSR capability checks (phone/showcase — REQ-ED-12, the only request-path renderer
  // decision left); `?ssr=1`, `?renderer=spa`, and `x-rhema-renderer` are inert request text now.
  /**
   * SPA.3 — the on-disk dir the Vite SPA build emits into (`apps/web/public/spa`, consumed by the
   * manifest read + `/assets/spa/*`). Injectable so tests point at a fixture dir.
   */
  readonly spaAssetRoot?: string;
  /**
   * P1.03 — the collab WSS base the Page's island connects to (`wss://<host>/collab`, env
   * COLLAB_WS_URL). Unset ⇒ the Page mounts without a collab session (the static read view).
   */
  readonly collabWsUrl?: string;
  /**
   * SPA.13 (REQ-BFF-16; design/22 §5/E-2) — the origin CSP `connect-src` admits for the browser's
   * presign→direct-PUT upload leg (env `GCS_UPLOAD_ORIGIN`). Default `https://storage.googleapis.com`
   * — the host the api's v4 signer always mints (`presignQuarantinePut`). Deployable dark: the
   * admission changes no serving behavior until a surface consumes `POST /bff/import/presign`.
   */
  readonly gcsUploadOrigin?: string;
  /**
   * HOT.1 — the public-claims visibility config for the marketing pages (default `PUBLIC_CLAIMS`:
   * every gated claim hidden). A test flips ids here; ACT.1/EST.1 enable claims from config, never
   * by re-introducing parallel copy.
   */
  readonly claims?: PublicClaimsConfig;
  /** JOURNEY.1 (REQ-ARCH-39) — the image-baked deploy SHA surfaced on `/healthz` (`RHEMA_BUILD_GIT_SHA`). */
  readonly buildGitSha?: string;
  /**
   * OBS.1 — the GCP project id for the `logging.googleapis.com/trace` join field (deploy binds
   * `GOOGLE_CLOUD_PROJECT`). Unset ⇒ the trace field is omitted; requestId still propagates.
   */
  readonly gcpProject?: string;
}

/**
 * The browser's real source IP (SEC.2): the PENULTIMATE XFF hop — the one the GCP LB appended — never
 * the caller-controlled first hop. Headerless ⇒ every such caller shares the "unknown" bucket.
 * This is also the value the web stamps into `x-rhema-client-ip` on its api calls (ADR-040).
 */
function clientIp(c: Context): string {
  return forwardedClientIp(c.req.header("x-forwarded-for"));
}

function loginErrorFor(reason: string | undefined): string {
  switch (reason) {
    case "expired":
      return COPY.login.errorExpired;
    case "revoked":
      return COPY.login.errorRevoked;
    case "exhausted":
      return COPY.login.errorExhausted;
    case "email_mismatch":
      return COPY.login.errorEmailMismatch;
    default:
      return COPY.login.errorInvalid;
  }
}

const defaultBeginAuth = async (method: string): Promise<AuthOutcome> =>
  method === "google" ? { redirect: "/auth/google/start" } : { sent: true };

/**
 * MAINT.5 — the OAuth redirect target a `beginAuth` outcome may hand the browser. Relative paths are
 * same-origin (the offline stub's `/auth/google/start`); an absolute URL must be a Google OAuth hosted
 * origin — the CSP `form-action` allowlist's other half, mirroring `stripeRedirectTarget`. A refused
 * target renders `auth_unavailable`, never a followed URL we didn't vet.
 */
function oauthRedirectTarget(url: string, log: (msg: string) => void): string | null {
  if (!/^https?:\/\//.test(url)) return url;
  if (isGoogleOAuthRedirect(url)) return url;
  log(`[web] auth: refusing non-Google OAuth redirect target ${url.slice(0, 80)}`);
  return null;
}

/** The stable code a billing POST failure carries: the api's `{error}` code on an ApiError, else the
 *  route's own fallback label (a network/unknown failure IS the "temporarily unavailable" case). */
function billingFailureCode(err: unknown, fallback: string): string {
  return err instanceof ApiError && typeof err.code === "string" ? String(err.code) : fallback;
}

/**
 * BILL.3 (ADR-027) — the app only ever redirects to a Stripe-hosted origin (the CSP `form-action`
 * allowlist's other half). A checkout/portal URL that isn't on the allowlist is refused — logged and
 * rendered as the generic billing-down note, never followed.
 */
function stripeRedirectTarget(url: string | undefined, log: (msg: string) => void): string | null {
  if (!url) return null;
  if (isStripeHostedRedirect(url)) return url;
  log(`[web] billing: refusing non-Stripe redirect target ${url.slice(0, 80)}`);
  return null;
}

/** Map a refused admission's stable error code to copy (invite reject reasons reuse the invite copy). */
function signupErrorFor(error: string, open: boolean): string {
  switch (error) {
    case "rate_limited":
      return COPY.login.errorRateLimited;
    case "invite_required":
      return COPY.login.errorRequired;
    case "email_required":
      return open ? COPY.login.emailRequiredSelfServe : COPY.login.errorEmailRequired;
    case "signup_failed":
    case "auth_unavailable": // SEC.2 — a transient auth-call failure (the api unreachable), not a refusal
      return COPY.login.errorSignupUnavailable;
    // SEC.2 — better-auth's own verify-leg code: the emailed token is spent/expired, not refused.
    case "INVALID_TOKEN":
      return COPY.login.errorLinkInvalid;
    default:
      return loginErrorFor(error);
  }
}

/**
 * SEC.2 — the codes a verify/OAuth-callback error redirect can carry on `?error=` (the api's stable
 * admission codes + better-auth's protocol codes). Anything outside the set renders the generic
 * "unavailable" line — never the invite-invalid copy for an OAuth/transport failure.
 */
const LOGIN_ERROR_CODES = new Set([
  "rate_limited",
  "invite_required",
  "invite_rejected",
  "email_required",
  "signup_failed",
  "auth_unavailable",
  "INVALID_TOKEN",
  "unknown",
  "expired",
  "revoked",
  "exhausted",
  "email_mismatch",
]);

function loginQueryErrorFor(code: string | undefined, open: boolean): string | undefined {
  if (!code) return undefined;
  return signupErrorFor(LOGIN_ERROR_CODES.has(code) ? code : "signup_failed", open);
}

export function createWebApp(deps: WebDeps): Hono {
  const app = new Hono();
  // OBS.1 (ADR-053) — request correlation FIRST: resolve/echo the request id (the LB's trace id when
  // the hop carried one, else minted), stash the Cloud Logging trace field, and normalize non-Error
  // throws so EVERY failure reaches `onError` (a non-Error throw otherwise escapes `app.fetch` to a
  // silent bare 500 — the "5xx with no app log line" defect).
  app.use("*", obsRequestContext(deps.gcpProject ?? process.env.GOOGLE_CLOUD_PROJECT));
  // OBS.1 — stamp the resolved request id on the forwarded session headers once: every api-client
  // call (chat, SSE proxy, dossier, …) then carries `x-rhema-request-id` to the api unchanged.
  const innerSession = deps.session;
  deps = {
    ...deps,
    session: (c: Context) => withRequestId(innerSession(c), c),
  };
  const beginAuth = deps.beginAuth ?? defaultBeginAuth;

  // P1.22 (§13.3 audit; REQ-ARCH-24) — the web shell's Content-Security-Policy, stamped per response.
  // SSR-only app: a per-request nonce is injected into every `<script>` tag of HTML responses and the
  // policy runs scripts only with that nonce or from 'self' — an injected `<script>` in any rendered
  // surface (user titles, draft text shown on cards) cannot execute. `style-src 'unsafe-inline'` stays
  // because hand-authored `style=` attributes are pervasive (scoped to styles, which cannot exfiltrate);
  // images may come from the cookieless usercontent origin (the only non-self source). Non-HTML
  // responses (SSE, downloads, JSON) pass through untouched.
  // EDIT.1 — the Page's collab wire is a same-origin `wss://` endpoint (COLLAB_WS_URL). Chromium maps
  // 'self' onto wss:// for connect-src, but WebKit's coverage has historically been inconsistent —
  // carry the configured origin explicitly so the connect works in every engine (the source is the
  // operator-configured collab origin, never a wildcard).
  const collabWsSource = (() => {
    try {
      return deps.collabWsUrl ? new URL(deps.collabWsUrl).origin : null;
    } catch {
      return null;
    }
  })();
  // SPA.13 (REQ-BFF-16; design/22 §5/E-2) — voices is the first browser-upload surface: the SPA's
  // presign→direct-PUT leg connects to the signed-URL origin, so connect-src admits it. The value is
  // the operator-configured upload origin (`deps.gcsUploadOrigin`, default the v4 host) — never a
  // wildcard, parsed down to scheme+host before it enters the policy.
  const gcsUploadSource = (() => {
    try {
      return new URL(deps.gcsUploadOrigin ?? "https://storage.googleapis.com").origin;
    } catch {
      return "https://storage.googleapis.com";
    }
  })();
  const cspFor = (nonce: string) =>
    `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; ` +
    // R6UCD.1 (ADR-113): img-src also admits the GCS origin — an api-minted v4 URL is where an
    // allowlisted image is actually served from now; the inert usercontent host stays listed.
    `img-src 'self' https://usercontent.rhema.tools ${gcsUploadSource} data:; connect-src 'self'${collabWsSource ? ` ${collabWsSource}` : ""} ${gcsUploadSource}; font-src 'self'; ` +
    `object-src 'none'; frame-ancestors 'none'; base-uri 'self'; ` +
    // BILL.3 (ADR-027): a form submission whose response redirects to a Stripe-hosted page is checked
    // against `form-action` — the bare `'self'` blocked every purchase hand-off (the run-sheet Add
    // credits POST 302s to buy.stripe.com; Checkout/Portal POSTs 302 to checkout./billing.stripe.com).
    // The allowlist is the contracts' STRIPE_HOSTED_ORIGINS — the same list the redirect validator
    // enforces, so CSP can never admit a host we would not redirect to.
    // MAINT.5: same defect class for OAuth — POST /login 302s to accounts.google.com, and Chromium
    // applies `form-action` to that redirect target; GOOGLE_OAUTH_ORIGINS is likewise shared with the
    // redirect-target validator below.
    `form-action 'self' ${STRIPE_HOSTED_ORIGINS.join(" ")} ${GOOGLE_OAUTH_ORIGINS.join(" ")}`;
  app.use("*", async (c, next) => {
    await next();
    const res = c.res;
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return;
    const nonce = randomBytes(16).toString("base64");
    const stamped = (await res.text()).replace(/<script(?=[\s>])/gi, `<script nonce="${nonce}"`);
    const headers = new Headers(res.headers);
    // `new Headers(h)` can collapse multi-valued Set-Cookie in some runtimes — re-append them verbatim.
    // (never-cookies exempt: this preserves the viewer's own platform session cookie on the SSR
    //  response — it is not an ingestion-connector credential; the AC-I-B gate scans this file for
    //  connector surfaces only.)
    const setCookies = res.headers.getSetCookie?.() ?? [];
    headers.delete("set-cookie"); // never-cookies exempt — viewer session passthrough
    for (const v of setCookies) headers.append("set-cookie", v); // never-cookies exempt — viewer session passthrough
    headers.set("Content-Security-Policy", cspFor(nonce));
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    c.res = new Response(stamped, { status: res.status, statusText: res.statusText, headers });
  });

  // NAVC.3 (REQ-NAVC-20's bfcache posture; Q-A4-2) — a response computed for an authenticated
  // request is never stored: `no-store` keeps auth'd documents, `/bff/*` twins, `/session`, and
  // redirect answers out of both the HTTP disk cache and the bfcache (a session-carrying page
  // restored from bfcache would resurrect pre-logout DOM and stale twin state — the SPA's
  // client-nav freshness invariants assume a document can never come back warmer than the
  // server allowed). The stamp is a FLOOR: a handler that declared its own `cache-control`
  // wins verbatim (immutable `/assets/*`, SSE's `no-cache, no-transform`, the favicon's public
  // day). Anonymous requests (the public funnel) stay unstamped — their cache posture is the
  // handlers' own.
  app.use("*", async (c, next) => {
    const authed = deps.session(c) != null;
    await next();
    if (authed && c.res.headers.get("cache-control") == null) {
      c.res.headers.set("cache-control", "no-store");
    }
  });

  const signupOpen = deps.signupMode === "open";

  /** PRB.12 — mint a client-whitelisted analytics event through the api intake (POST /analytics/events).
   *  Fire-and-forget: telemetry NEVER breaks a page render, and an opted-out user simply records nothing. */
  const emit = (
    session: SessionHeaders,
    event: string,
    props: Record<string, unknown> = {},
    ids: { projectId?: string; runId?: string } = {},
  ): void => {
    try {
      void deps.dataSource.postAnalyticsEvent(session, { event, props, ...ids }).catch(() => undefined);
    } catch {
      // a seam that isn't bound yet drops the event — telemetry is never fatal to a page render.
    }
  };

  // ACT.1 (§14.3; REQ-GROWTH-10) — the device fingerprint for the trial unlock gate. The web host
  // mints `rhema_fp` — an opaque random value, HttpOnly + SameSite=Lax — on the first run-sheet GET
  // that lacks one, and forwards its value on the Run POST. The api stores ONLY a salted SHA-256;
  // the raw value never leaves this host's cookie jar (no script may read it — HttpOnly).
  const FP_COOKIE = "rhema_fp";
  const cookieValue = (c: Context, name: string): string | undefined => {
    const raw = c.req.header("cookie") ?? "";  // never-cookies exempt — rhema_fp first-party trial-abuse device fingerprint, not an ingestion-connector credential (AC-I-B scans this file for connector surfaces)
    for (const pair of raw.split(";")) {
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      if (pair.slice(0, eq).trim() === name) {
        const v = pair.slice(eq + 1).trim();
        return v === "" ? undefined : v;
      }
    }
    return undefined;
  };
  const ensureFingerprint = (c: Context): string => {
    const existing = cookieValue(c, FP_COOKIE);
    if (existing) return existing;
    const fp = randomBytes(24).toString("base64url");
    // Secure when the page is served over https (prod); the dev http stage plants it without.
    const secure = c.req.url.startsWith("https://") ? "; Secure" : "";
    c.header("set-cookie", `${FP_COOKIE}=${fp}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`, { append: true });  // never-cookies exempt — rhema_fp first-party trial-abuse device fingerprint, not an ingestion-connector credential (AC-I-B scans this file for connector surfaces)
    return fp;
  };

  // PRB.16 — an api-side 401 on a data call means the session is gone/invalid: land on /login rather
  // than a bare 500 (the session cookie may be expired while still present). OBS.1 — everything else
  // is exactly ONE structured error line (allowlisted fields, route TEMPLATE, message-stripped stack)
  // and a bare 500 whose only reference is the request id.
  app.onError((err, c) => {
    if (err instanceof ApiError && err.status === 401) return c.redirect("/login");
    return webOnError(err, c);
  });

  // JOURNEY.1 (REQ-ARCH-39) — the provenance check's network-reachable SHA (see apps/api /healthz).
  // VERIF.2 (F-OPS.1-10) — Cloud Run's GFE intercepts the bare `/healthz` on `*.run.app` origins
  // (a Google 404 the app never sees); the trailing-slash alias reaches the app, so preview
  // provenance probes it as the fallback path.
  const healthz = (c: Context) =>
    c.json({ ok: true, service: "web", build: { gitSha: deps.buildGitSha ?? null } });
  app.get("/healthz", healthz);
  app.get("/healthz/", healthz);

  // UX.1 — the favicon endpoints every document head links to (inline SVG brand mark; the .ico path
  // serves the same SVG — browsers honor the content type, not the extension).
  const favicon = (c: Context) => {
    c.header("content-type", "image/svg+xml");
    c.header("cache-control", "public, max-age=86400");
    return c.body(FAVICON_SVG);
  };
  app.get("/favicon.ico", favicon);
  app.get("/favicon.svg", favicon);

  // SPA.3 (REQ-BND-6) — the same-origin session probe the SPA's session query consumes. A session
  // cookie absent ⇒ 401; present ⇒ the api's /session payload verbatim. A dead upstream is a 502,
  // never a forged principal — the api remains the auth oracle (design/26 §server-owned).
  app.get("/session", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    try {
      const principal = await deps.dataSource.getSessionPrincipal(session);
      if (principal == null) {
        // OBS.1 — a user-visible 502 gets its one structured line.
        logWebRouteError(c, { status: 502, msg: "session_probe_empty", errorClass: "UnboundSeam" });
        return c.json({ error: "session_unavailable" }, 502);
      }
      return c.json(principal);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return c.json({ error: "unauthenticated" }, 401);
      logWebRouteError(c, {
        status: 502,
        msg: "session_probe_failed",
        upstreamStatus: e instanceof ApiError ? e.status : null,
        errorClass: errorClass(e),
      });
      return c.json({ error: "session_unavailable" }, 502);
    }
  });

  // SPA.4 (REQ-BFF-24; spec R12) — the standalone long-stale feed-label read the SPA's
  // `["feed-labels"]` query consumes. The maps stay server-owned (deploy-versioned COPY, the same
  // `feedLabelMaps()` object SSR embeds as data-feed-labels); the client formatter stays
  // fail-closed. Session-gated like every BFF read — the api remains the auth oracle.
  app.get("/bff/feed-labels", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    return c.json(feedLabelMaps());
  });

  // SPA.5 (REQ-BFF-1/8/9, REQ-DAT-1/4/12; design/22 §2) — the REFERENCE read twin: the `/usage`
  // document's data contract as JSON (the §2 table's `usage` row — `UsageDto` + `UsageAccountDto`
  // raw, composed once). Degrade semantics are verbatim: each seam is best-effort — a miss lands
  // `null` (the wrapped fetch already counted it into `degraded_reads`) — while an upstream 401 is
  // NOT degradation (`swallowDegraded` rethrows → the `{error:"unauthenticated"}` envelope, never
  // an empty page). SPA.10's `usage` surface builds on this shape.
  app.get(
    "/bff/usage",
    bffRoute(deps, async (c, session) => {
      const [usage, account] = await Promise.all([
        deps.dataSource.getUsage(session).catch(swallowDegraded),
        Promise.resolve()
          .then(() => deps.dataSource.getUsageAccount?.(session))
          .catch(swallowDegraded),
      ]);
      return c.json({ usage: usage ?? null, account: account ?? null });
    }),
  );

  // SPA.10 (REQ-BFF-11, REQ-DAT-4/6; design/22 §2 `p.projectUsage` row) — the `/p/:slug/usage`
  // document's typed read twin: slug→id through the request-scoped `listProjects` memo, then the
  // level-2 rollup verbatim. The SSR's miss semantics are preserved: an unknown slug OR a missed
  // rollup read answers `{error:"not_found"}` at 404 — the same answer the document gives — while
  // an upstream 401 rides `swallowDegraded`'s rethrow into the unauthenticated envelope. The slug
  // rides the payload so the client's back-link needs no second read.
  app.get(
    "/bff/p/:slug/usage",
    bffRoute(deps, async (c, session) => {
      const slug = c.req.param("slug");
      const row = slug ? await bffProjectRow(c, deps.dataSource, session, slug) : null;
      if (!row) return c.json({ error: "not_found" }, 404);
      const usageProject = await Promise.resolve()
        .then(() => deps.dataSource.getUsageProject?.(session, row.id))
        .then((u) => (u ? { ...u, slug } : null))
        .catch(swallowDegraded);
      if (!usageProject) return c.json({ error: "not_found" }, 404);
      return c.json({ usageProject });
    }),
  );

  // SPA.15 (REQ-BFF-1/8/9/11, REQ-DAT-4/12; design/22 §2 `app` row) — the `/app` document's read
  // twin: the project list + the home aggregate's seams as RAW DTOs (`rows`, `voices`, `groupBy`,
  // `balance`, `protocols`, `deletedRows`, `search`). Filtering (`?voice`/`?protocol`/`?sort`/
  // `?archived`) and the row→view mapping (`toProjectRowView`/`groupByAttention`/`groupByVoice`)
  // run CLIENT-side off the shared `state-map.ts` seam — the twin ships no view models (design/22
  // F10: the mapper is pure COPY+DTO, bundle-portable). `?q=` still drives the server-side
  // `searchProjects` read (search is never client-derivable) and `?deleted=1` gates the deleted
  // scope read. Degrade semantics mirror the document: `listProjects` stays load-bearing (uncaught —
  // `bffFail` maps an upstream 401 to `unauthenticated`); every optional seam rides
  // `swallowDegraded` (a miss lands the SSR's composed default; a mid-session 401 rethrows into the
  // unauthenticated envelope). The document's `?verified=1` mint + showcase/held precedence are
  // PRE-SHELL server acts — they never reach the twin (the shell is only served after precedence).
  app.get(
    "/bff/app",
    bffRoute(deps, async (c, session) => {
      const q = (c.req.query("q") ?? "").trim();
      const showDeleted = c.req.query("deleted") === "1";
      const [rows, voices, groupBy, bal, search, protocols, deletedRows] = await Promise.all([
        deps.dataSource.listProjects(session),
        Promise.resolve()
          .then(() => deps.dataSource.listVoices(session))
          .catch(swallowDegraded),
        Promise.resolve()
          .then(() => deps.dataSource.getProjectGrouping(session))
          .catch(swallowDegraded),
        // PRB.12 — the §14.5 level-0 balance chip rides the nav (best-effort, verbatim).
        deps.dataSource.getBillingBalance(session).catch(swallowDegraded),
        q
          ? Promise.resolve()
              .then(() => deps.dataSource.searchProjects(session, q))
              .catch(swallowDegraded)
          : Promise.resolve(null),
        Promise.resolve()
          .then(() => deps.dataSource.listProtocolCards(session))
          .catch(swallowDegraded),
        showDeleted
          ? Promise.resolve()
              .then(() => deps.dataSource.listDeletedProjects?.(session) ?? [])
              .catch(swallowDegraded)
          : Promise.resolve([]),
      ]);
      return c.json({
        rows,
        voices: voices ?? [],
        groupBy: groupBy ?? "attention",
        balance: bal ? { spendableCredits: bal.spendableCredits, heldCredits: bal.heldCredits ?? 0 } : null,
        protocols: protocols ?? [],
        deletedRows: deletedRows ?? [],
        ...(search != null ? { search: { q, results: search } } : {}),
      });
    }),
  );

  // SPA.11 (REQ-BFF-1/8/9, REQ-DAT-4; design/22 §2 `inbox` row) — the `/app/inbox` document's typed
  // read twin: `{items, badge, gateCards}` — the SAME aggregate the SSR handler composes, gate cards
  // keyed by inbox-item id so an expanded row mounts the real §6.4 card without a second read.
  // Degrade semantics ride `swallowDegraded` per seam (best-effort seams answer null/[]; a mid-session
  // upstream 401 is NOT degradation — it rethrows into the `unauthenticated` envelope). The SSR's
  // catch-everything tolerances stay on the document path — a dup'd join here would be the drift.
  app.get(
    "/bff/app/inbox",
    bffRoute(deps, async (c, session) => {
      const [items, badge] = await Promise.all([
        Promise.resolve()
          .then(() => deps.dataSource.getInbox?.(session) ?? [])
          .catch(swallowDegraded),
        Promise.resolve()
          .then(() => deps.dataSource.getInboxBadge?.(session))
          .then((b) => (b && typeof b.count === "number" ? b.count : 0))
          .catch(swallowDegraded),
      ]);
      const list: InboxItemDto[] = items ?? [];
      // The same per-project open-gates join the document runs — one listGates per touched project,
      // keyed by inbox-item id; a missed join degrades that row to its deep link, never a 500.
      const gateProjectIds = [
        ...new Set(
          list
            .filter((i) => i.gate != null)
            .map((i) => i.projectId)
            .filter((p): p is string => p != null),
        ),
      ];
      const gateLists = await Promise.all(
        gateProjectIds.map((pid) =>
          Promise.resolve()
            .then(() => deps.dataSource.listGates(session, pid))
            .catch(swallowDegraded),
        ),
      );
      const gatesById = new Map(
        gateLists.flatMap((gl) => gl ?? []).map((g) => [g.id, g] as const),
      );
      const gateCards: Record<string, GateCardDto> = {};
      for (const it of list) {
        if (it.gate == null) continue;
        const card = gatesById.get(it.gate.gateId);
        if (card) gateCards[it.id] = card;
      }
      return c.json({ items: list, badge: badge ?? 0, gateCards });
    }),
  );

  // ---- SPA.12 — the `settings` surface's read twins (REQ-BFF-1/8/9/16, REQ-DAT-1/4;
  //  design/22 §2 settings rows). Each mirrors its document handler's composition verbatim —
  //  the same seams, the same best-effort degrade (`swallowDegraded` lands `null` so the SPA
  //  renders the section's own `data-settings-unavailable` state, never a fabricated value;
  //  an upstream 401 rethrows into the unauthenticated envelope). ----
  app.get(
    "/bff/settings/account",
    bffRoute(deps, async (c, session) => {
      const account = await Promise.resolve()
        .then(() => deps.dataSource.getAccountSettings?.(session))
        .catch(swallowDegraded);
      return c.json({ account: account ?? null });
    }),
  );
  app.get(
    "/bff/settings/preferences",
    bffRoute(deps, async (c, session) => {
      const preferences = await Promise.resolve()
        .then(() => deps.dataSource.getPreferencesSettings?.(session))
        .catch(swallowDegraded);
      return c.json({ preferences: preferences ?? null });
    }),
  );
  app.get(
    "/bff/settings/notifications",
    bffRoute(deps, async (c, session) => {
      // The document's composition verbatim: the prefs read + the project list mapped to
      // {id,title} (the per-project run_progress opt-in rows) — off the request-scoped memo.
      const [notif, rows] = await Promise.all([
        Promise.resolve()
          .then(() => deps.dataSource.getNotificationPrefs?.(session))
          .catch(swallowDegraded),
        projectRows(c, deps.dataSource, session)
          .then((list) => list.map((r) => ({ id: r.id, title: r.title })))
          .catch(swallowDegraded),
      ]);
      return c.json({
        notifications:
          notif == null ? null : { ...notif, projects: rows ?? [] },
      });
    }),
  );
  app.get(
    "/bff/settings/integrations",
    bffRoute(deps, async (c, session) => {
      const integrations = await Promise.resolve()
        .then(() => deps.dataSource.getIntegrationsSettings?.(session))
        .catch(swallowDegraded);
      return c.json({ integrations: integrations ?? null });
    }),
  );
  app.get(
    "/bff/settings/data",
    bffRoute(deps, async (c, session) => {
      // The document's three-way compose: privacy toggle + the §14.7 Data read + the latest
      // account-export state. The notice/import-count flash params stay URL state (the leaf's
      // validated search) — they are never payload.
      const [privacy, data, acct] = await Promise.all([
        Promise.resolve()
          .then(() => deps.dataSource.getPrivacySettings(session))
          .catch(swallowDegraded),
        Promise.resolve()
          .then(() => deps.dataSource.getDataSettings?.(session))
          .catch(swallowDegraded),
        Promise.resolve()
          .then(() => deps.dataSource.getAccountExportState?.(session))
          .then((r) => r ?? { export: null })
          .catch(swallowDegraded),
      ]);
      return c.json({
        privacy: { analyticsOptOut: privacy?.analyticsOptOut ?? false },
        data: data ?? null,
        accountExport: { export: acct?.export ?? null },
      });
    }),
  );
  // design/22 §2 `p.settings` row (REQ-BFF-11, REQ-DAT-4/6) — the `/p/:slug/settings` document's
  // aggregate: slug→id through the request memo, `getProjectSettings` (a miss is the document's
  // own 404), the P1.09 approval-settings read as the best-effort join.
  app.get(
    "/bff/p/:slug/settings",
    bffRoute(deps, async (c, session) => {
      const slug = c.req.param("slug");
      const row = slug ? await bffProjectRow(c, deps.dataSource, session, slug) : null;
      if (!row) return c.json({ error: "not_found" }, 404);
      const [settings, approvalSettings] = await Promise.all([
        Promise.resolve()
          .then(() => deps.dataSource.getProjectSettings?.(session, row.id))
          .catch(swallowDegraded),
        Promise.resolve()
          .then(() => deps.dataSource.getApprovalSettings?.(session, row.id))
          .catch(swallowDegraded),
      ]);
      if (!settings) return c.json({ error: "not_found" }, 404);
      return c.json({
        projectSettings: {
          slug,
          settings,
          ...(approvalSettings ? { approvalSettings } : {}),
        },
      });
    }),
  );
  // REQ-BFF-21 (design/22 §7.1) — the one-shot email-confirm consume; the convention handler
  // carries the both-200 redirect arms + the replay-safe swallow.
  app.post("/bff/settings/account/confirm-email", confirmEmailHandler(deps));

  // ---- SPA.16 — the `billing` surface's read twins (REQ-BFF-1/8/9, REQ-DAT-4/12; design/22 §2
  //  `app.settings.billing` + `billing.return` rows). Each mirrors its document GET's composition
  //  verbatim: the same seams, the same best-effort degrade — `billing` is null unless BOTH the
  //  subscription and plans reads land (the SSR's `subscription && plans` gate, so the leaf renders
  //  the truthful `data-billing-down` state rather than fabricating a free tier); `balance`'s
  //  `paymentLinkUrl` is re-validated through the Stripe allowlist BEFORE serialization (a refused
  //  value is never on the wire — REQ-BFF-27). ----
  app.get("/bff/settings/billing", bffRoute(deps, async (c, session) => {
    const [subscription, plans, balance] = await Promise.all([
      Promise.resolve().then(() => deps.dataSource.getSubscription?.(session)).catch(swallowDegraded),
      Promise.resolve().then(() => deps.dataSource.getPlans?.(session)).catch(swallowDegraded),
      Promise.resolve().then(() => deps.dataSource.getBillingBalance?.(session)).catch(swallowDegraded),
    ]);
    const paymentLinkUrl = balance?.paymentLinkUrl != null
      ? stripeRedirectTarget(balance.paymentLinkUrl, (m) => console.error(m))
      : null;
    return c.json({
      billing: subscription && plans ? { subscription, plans } : null,
      balance: balance == null
        ? null
        : { ...balance, paymentLinkUrl: paymentLinkUrl ?? undefined },
    });
  }));
  // `GET /billing/return`'s twin — the checkout-return read verbatim: `session_id`/`cancelled` ride
  // the query (they are URL state, never payload), the row read degrades to `null`, and
  // `pollAfterSeconds` carries the server's §14.6 webhook-lag verdict (open ∧ ¬cancelled ∧
  // <30 s old ⇒ 5 s; otherwise absent — the leaf never polls on its own judgment, REQ-BFF-15).
  app.get("/bff/billing/return", bffRoute(deps, async (c, session) => {
    const sessionId = c.req.query("session_id") ?? "";
    const cancelled = c.req.query("cancelled") === "1";
    const checkoutReturn = sessionId
      ? await Promise.resolve()
          .then(() => deps.dataSource.getCheckoutSession?.(session, sessionId))
          .catch(swallowDegraded)
      : null;
    const openAgeMs = checkoutReturn?.createdAt
      ? Date.now() - Date.parse(checkoutReturn.createdAt)
      : Number.POSITIVE_INFINITY;
    const stillPolling = openAgeMs >= 0 && openAgeMs < 30_000;
    return c.json({
      checkoutReturn: checkoutReturn ?? null,
      cancelled,
      ...(checkoutReturn?.state === "open" && !cancelled && stillPolling
        ? { pollAfterSeconds: 5 }
        : {}),
    });
  }));

  // ---- SPA.13 — the `voices` surface's read twins (REQ-BFF-1/8/9/11/16; design/22 §2
  // voices/voicesNew/voiceDetail/p.voiceReseed) + the import presign (REQ-BFF-16 §5/E-2 — the BFF
  // mints the v4-signed PUT and never proxies bytes; the browser PUTs to `url` echoing
  // `requiredHeaders`). Each read composes exactly the seams its document GET composes; a degraded
  // seam lands `null`/absent (swallowDegraded's 401 rethrow → `unauthenticated`), never a
  // fabricated value — {error:"not_found"} remains a refusal, never an empty payload. ----
  app.get("/bff/voices", bffRoute(deps, async (c, session) =>
    // `GET /voices` — `PageData.voices` verbatim: the §9.1 three-group read, degraded ⇒ null.
    c.json({ voices: (await Promise.resolve().then(() => deps.dataSource.listVoiceGroups?.(session)).catch(swallowDegraded)) ?? null })));
  // Registered BEFORE /bff/voices/:persona — Hono matches in order and "new" would else land on the
  // param route (the same registration-order rule /v/:persona/samples/url documents).
  app.get("/bff/voices/new", bffRoute(deps, async (c) =>
    // `GET /voices/new` — `{voiceNew:{}}` verbatim: the sheet composes no remote reads today (the
    // form is static copy); the twin keeps the uniform pending/error path and is where future
    // creation options land.
    c.json({ voiceNew: {} })));
  app.get("/bff/voices/:persona", bffRoute(deps, async (c, session) => {
    // `GET /v/:persona` — `PageData.voice` verbatim: getVoice 404 → not_found; estimate/updatePlan
    // best-effort; connections/sampleDetail only on ?tab=samples (the document's own composition).
    const personaId = c.req.param("persona") ?? "";
    const detail = await deps.dataSource.getVoice(session, personaId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!detail) return c.json({ error: "not_found" }, 404);
    const tab = c.req.query("tab");
    const sampleId = c.req.query("sample");
    const [estimate, updatePlan, connections, sampleDetail] = await Promise.all([
      deps.dataSource.estimateVoice(session, personaId, detail.tier === "full" ? "full" : "quick").catch(swallowDegraded),
      Promise.resolve().then(() => deps.dataSource.getVoiceUpdatePlan?.(session, personaId)).catch(swallowDegraded),
      tab === "samples" && deps.dataSource.listVoiceConnections
        ? deps.dataSource.listVoiceConnections(session, personaId).catch(swallowDegraded)
        : undefined,
      tab === "samples" && sampleId && deps.dataSource.getVoiceSample
        ? deps.dataSource.getVoiceSample(session, personaId, sampleId).catch(swallowDegraded)
        : undefined,
    ]);
    return c.json({
      voice: {
        detail,
        ...(estimate ? { estimate } : {}),
        ...(updatePlan ? { updatePlan } : {}),
        ...(connections ? { connections } : {}),
        ...(sampleDetail ? { sampleDetail } : {}),
        ...(tab ? { tab } : {}),
      },
    });
  }));
  app.get("/bff/p/:slug/voice/reseed", bffRoute(deps, async (c, session) => {
    // `GET /p/:slug/voice/reseed` — `PageData.voiceReseed` verbatim: slug→id through the request
    // memo (REQ-BFF-11); the preview seam's miss is the document's own not_found.
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const preview = await deps.dataSource.getVoiceReseedPreview(session, row.id).catch(swallowDegraded);
    if (!preview) return c.json({ error: "not_found" }, 404);
    return c.json({ voiceReseed: { slug, projectId: row.id, preview } });
  }));
  app.post("/bff/import/presign", bffRoute(deps, async (c, session) => {
    // REQ-BFF-16 — the api's POST /import/presign verbatim; a web build without the seam answers
    // the payload's own refusal rather than a route-level 404.
    if (deps.dataSource.presignImportUpload == null) return c.json({ error: "upload_unavailable" }, 503);
    return c.json(await deps.dataSource.presignImportUpload(session));
  }));

  // ---- SPA.14 — the `onboarding` surface's read twins (REQ-BFF-1/8/9/11/16, REQ-DAT-1/4/6/9;
  //  design/22 §2 app.new/app.newPreview/p.import/p.importPreview rows). Each mirrors its document
  //  GET's composition verbatim: the same seams, the same degrade posture (`swallowDegraded` lands
  //  `null`; the SSR degrades the sheet reads to empty lists — the twin carries `null` so the leaf
  //  can tell "degraded" from "empty", and still renders the SSR's empty state). The document's
  //  server-owned redirects (`?qk` absent, unresolved title, a failed re-preview) become
  //  `{ok:true, redirect}` — a JSON caller is never handed a 302 (REQ-BFF-1). The pending read
  //  carries `pollAfterSeconds` so cadence stays server-owned (REQ-BFF-15; IMPORT_PREVIEW_POLL_SECONDS). ----
  app.get("/bff/app/new", bffRoute(deps, async (c, session) => {
    // `GET /app/new` — `loadNewProjectSheet`'s two reads verbatim. `entry`/picks/`held`-intent are
    // URL+client state per §2 — never payload.
    const [protocols, voices] = await Promise.all([
      Promise.resolve().then(() => deps.dataSource.listProtocolCards(session)).catch(swallowDegraded),
      Promise.resolve().then(() => deps.dataSource.listVoices(session)).catch(swallowDegraded),
    ]);
    return c.json({ newProject: { protocols, voices } });
  }));
  app.get("/bff/app/new/preview", bffRoute(deps, async (c, session) => {
    // `GET /app/new/preview` — the quarantine-key re-preview the poll page re-asks. The document's
    // three redirect legs (missing `qk`, a failed read-back, an empty resolved title) answer as
    // `{ok:true, redirect:"/app/new?entry=…"}`; `pending` answers the poll contract; `ready` carries
    // the §5.3 payload + the server-side resolved title (typed → the document's own H1 → filename
    // stem — the leaf renders, never re-derives).
    const entryQ = c.req.query("entry") ?? "draft";
    const entry = entryQ === "scratch" || entryQ === "outline" || entryQ === "draft" ? entryQ : "draft";
    const entryHref = `/app/new?entry=${entry}`;
    const qk = c.req.query("qk");
    if (!qk) return c.json({ ok: true, redirect: entryHref });
    const picks = newProjectForm(c.req.query() as Record<string, unknown>);
    const src = c.req.query("src");
    const sourceLabel = src ?? "the upload";
    const out = await Promise.resolve()
      .then(() =>
        deps.dataSource.previewWorkspaceImport(session, {
          quarantineKey: qk,
          ...(src != null ? { fileName: src } : {}),
        }),
      )
      .catch(() => null);
    if (!out) return c.json({ ok: true, redirect: entryHref });
    if (out.status === "pending") {
      return c.json({
        newProjectPreview: {
          status: "pending",
          quarantineKey: out.quarantineKey,
          sourceLabel,
          pollAfterSeconds: IMPORT_PREVIEW_POLL_SECONDS,
        },
      });
    }
    const resolvedTitle =
      picks.title || out.preview.title || sourceLabel.replace(/\.[^.]+$/, "").trim();
    if (!resolvedTitle) return c.json({ ok: true, redirect: entryHref });
    return c.json({
      newProjectPreview: {
        status: "ready",
        quarantineKey: out.quarantineKey,
        sourceLabel,
        sourceText: "(the uploaded source — already converted)",
        convertedMarkdown: out.preview.markdown,
        countLine: countLine(out.preview.counts),
        warnings: out.preview.warnings.map((w) => ({ message: w.message, blockId: w.anchor?.blockId ?? null })),
        title: out.preview.title,
        resolvedTitle,
      },
    });
  }));
  app.get("/bff/p/:slug/import", bffRoute(deps, async (c, session) => {
    // `GET /p/:slug/import` — project facts + the `ide` block + import-form context (§2 `p.import`).
    // The document composes `ideContext(c, session, row)`; the twin carries the SAME bag — the leaf
    // publishes it onto the React chrome (`palette` stays the JSON string the shell re-emits, files/
    // chat ride their DTOs). `compact` is boot-owned (`deviceClass`) — never payload.
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const ctx = await ideContext(c, session, row);
    return c.json({
      import: {
        project: { title: row.title, pill: row.state.pill, slug },
        paperTheme: ctx.paperTheme ?? "light",
        ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
        ide: ctx.ide,
      },
    });
  }));
  app.get("/bff/p/:slug/import/preview", bffRoute(deps, async (c, session) => {
    // `GET /p/:slug/import/preview` — the poll twin: `previewImport` on the SAME quarantine key (the
    // api joins the in-flight execution — never a second upload) + the slim
    // `ideContext(c, session, {id:slug, slug})` the document composes on this leg (its chrome titles
    // the shell with the SOURCE label, not the project title — verbatim). A missed slug or an
    // upstream refusal rides `bffFail` at the preserved status; missing `qk` answers the document's
    // own `../import` bounce as `{ok:true, redirect}`.
    const slug = c.req.param("slug") ?? "";
    const qk = c.req.query("qk");
    if (!qk) return c.json({ ok: true, redirect: `/p/${slug}/import` });
    const src = c.req.query("src");
    const input: ImportInput = { projectSlug: slug, quarantineKey: qk, ...(src ? { fileName: src } : {}) };
    const out = await deps.dataSource.previewImport(session, input);
    const ctx = await ideContext(c, session, { id: slug, slug });
    const project = { title: input.fileName ?? slug, pill: "", slug };
    const shell = {
      project,
      paperTheme: ctx.paperTheme ?? "light",
      ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
      ide: ctx.ide,
    };
    if (out.status === "pending") {
      return c.json({
        importPreview: {
          ...shell,
          conversion: {
            projectSlug: slug,
            sourceLabel: input.fileName ?? "the upload",
            pending: true as const,
            quarantineKey: out.quarantineKey,
            pollAfterSeconds: IMPORT_PREVIEW_POLL_SECONDS,
          },
        },
      });
    }
    return c.json({
      importPreview: { ...shell, conversion: toConversionData(slug, input, out.preview, out.quarantineKey) },
    });
  }));

  app.get(
    "/bff/p/:slug/export",
    bffRoute(deps, async (c, session) => {
      // `GET /p/:slug/export` — the §13.4 export-dialog twin (SPA.17; design/22 §2 `p.export`;
      // REQ-BFF-1/11, REQ-DAT-4/6). The document's own composition verbatim: slug→id off the
      // request-scoped memo, `getExportDialog` under the SSR's catch→not-found seam, project facts,
      // and the `ide` bag the leaf republishes onto the React chrome (the first IDE-framed flip —
      // REQ-SEQ-12). `?error`/`?added`/`?focus` stay URL state — flash params are never payload;
      // `compact` is boot-owned (`deviceClass`). The POST stays a document nav — bytes never ride
      // a JSON envelope (REQ-BFF-17).
      const slug = c.req.param("slug") ?? "";
      const row = await bffProjectRow(c, deps.dataSource, session, slug);
      if (!row) return c.json({ error: "not_found" }, 404);
      const dialog = await deps.dataSource.getExportDialog(session, row.id).catch(() => null);
      if (!dialog) return c.json({ error: "not_found" }, 404);
      const ctx = await ideContext(c, session, row);
      return c.json({
        export: {
          slug,
          projectId: row.id,
          dialog,
          project: { title: row.title, pill: row.state.pill, slug },
          paperTheme: ctx.paperTheme ?? "light",
          ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
          ide: ctx.ide,
        },
      });
    }),
  );

  // ---- SPA.18 — the `outline` surface's read twins (design/22 §2 `p.outline`/`p.outlinePromote`;
  //      REQ-BFF-1/11, REQ-DAT-4/6). The shared view-mapper + estimate helper below are the document
  //      GET's own composition factored out — the twin serializes the SAME `GateOutlineView` rows,
  //      the same estimate, the same `cited` fact; `?slug` (the artifact pick) + `?scope/threadId/
  //      turnId` are server-echoed READ inputs (the document reads them off the URL verbatim), while
  //      `?saved`/`?notice` flashes stay URL state the leaf renders, never payload. `compact` is
  //      boot-owned (`deviceClass`) — the twin carries the raw `dto.editable`, the leaf ANDs it.

  /** The document-composed outline rows (§7.3) — one mapper for the SSR GET and the BFF twin. */
  const outlineViewFor = (o: NonNullable<OutlineDto["outline"]>) => ({
    thesis: o.thesis,
    ...(o.venue != null ? { venue: o.venue } : {}),
    ...(o.targetLength != null ? { targetLength: o.targetLength } : {}),
    ...(o.protocol != null ? { protocol: o.protocol } : {}),
    ...(o.voice != null ? { voice: o.voice } : {}),
    spine: o.spine,
    sections: o.sections.map((s) => ({
      ref: s.ref,
      title: s.title,
      ...(s.targetWords != null ? { targetWords: s.targetWords } : {}),
      ...(s.function != null ? { function: s.function } : {}),
      ...(s.entry != null ? { entry: s.entry } : {}),
      ...(s.exit != null ? { exit: s.exit } : {}),
      claims: s.claims.map((cl) => ({
        id: cl.id,
        text: cl.text,
        provenanceKind: cl.provenance.kind,
        provenance: {
          ...(cl.provenance.turnId != null ? { turnId: cl.provenance.turnId } : {}),
          ...(cl.provenance.url != null ? { url: cl.provenance.url } : {}),
          ...(cl.provenance.notePath != null ? { notePath: cl.provenance.notePath } : {}),
        },
        unverified: cl.unverified === true,
      })),
    })),
    ...(o.alternativesConsidered != null ? { alternativesConsidered: o.alternativesConsidered } : {}),
    gaps: o.gaps.map((g) => ({
      id: g.id,
      needed: g.needed,
      ...(g.relatedClaimId != null ? { relatedClaimId: g.relatedClaimId } : {}),
      ...(g.sectionRef != null ? { sectionRef: g.sectionRef } : {}),
    })),
    ...(o.provenance?.urls != null
      ? { urls: o.provenance.urls.map((u) => ({ url: u.url, unverified: u.unverified === true })) }
      : {}),
  });

  /** The "Draft ≈N credits" line — EST.1's run-sheet estimator over the outline's own words. */
  const outlineDraftEstimate = (dto: OutlineDto): number | undefined => {
    try {
      return surfaceEstimate({
        workflow: "draft",
        rigor: "standard",
        modelTier: "base",
        inputs: { words: dto.words ?? dto.outline?.targetLength ?? 0 },
      }).estimateCredits;
    } catch {
      return undefined;
    }
  };

  app.get(
    "/bff/p/:slug/outline",
    bffRoute(deps, async (c, session) => {
      // `GET /p/:slug/outline` — the durable-editor twin. `editable` is the API's fact (the
      // document's `&& !isPhoneRequest` AND lands on the leaf's `deviceClass`); a swallowed/null
      // outline read answers the document's own not-found-arm twin — `{outline:null}` at 200 —
      // and a missed slug keeps the 404 envelope (REQ-DAT-13's degrade-parity, verbatim).
      const slug = c.req.param("slug") ?? "";
      const row = await bffProjectRow(c, deps.dataSource, session, slug);
      if (!row) return c.json({ error: "not_found" }, 404);
      const dto = await deps.dataSource
        .getOutline?.(session, row.id, c.req.query("slug") ? { slug: c.req.query("slug")! } : undefined)
        .catch(() => null);
      if (!dto || !dto.outline) return c.json({ outline: null });
      const draftEstimateCredits = outlineDraftEstimate(dto);
      const cited = dto.citedBy.runs.length > 0 || dto.citedBy.draftIds.length > 0;
      return c.json({
        outline: {
          slug,
          editable: dto.editable === true,
          saveAction: `/p/${slug}/outline`,
          deleteAction: `/p/${slug}/outline/delete`,
          ...(draftEstimateCredits != null ? { draftEstimateCredits } : {}),
          outline: outlineViewFor(dto.outline),
          cited,
        },
      });
    }),
  );

  app.get(
    "/bff/p/:slug/outline/promote",
    bffRoute(deps, async (c, session) => {
      // `GET /p/:slug/outline/promote` — the consent-sheet twin: the api's verbatim facts (scope,
      // source roster, URL set, estimate + cap) plus the scope/thread/turn the document reads off
      // the URL (the form's hidden fields replay them — server-echoed, never client-invented).
      // A refused/missing promotion read is the document's 404 arm → `{outlinePromotion:null}`.
      const slug = c.req.param("slug") ?? "";
      const row = await bffProjectRow(c, deps.dataSource, session, slug);
      if (!row) return c.json({ error: "not_found" }, 404);
      const scope = (c.req.query("scope") ?? "thread") as "thread" | "turn" | "research";
      const threadId = c.req.query("threadId") ?? c.req.query("thread");
      const turnId = c.req.query("turnId") ?? c.req.query("turn");
      const promotion = await deps.dataSource
        .getOutlinePromotion?.(session, row.id, {
          scope,
          ...(threadId ? { threadId } : {}),
          ...(turnId ? { turnId } : {}),
          ...(c.req.query("slug") ? { slug: c.req.query("slug")! } : {}),
        })
        .catch(() => null);
      if (!promotion) return c.json({ outlinePromotion: null });
      return c.json({
        outlinePromotion: {
          slug,
          projectTitle: row.title,
          promotion,
          scope,
          ...(threadId ? { threadId } : {}),
          ...(turnId ? { turnId } : {}),
        },
      });
    }),
  );

  // ---- SPA.19 — the `figures` surface's twins (design/22 §2 `p.figures`/`p.figureCard`/
  //      `p.visualize`; REQ-BFF-1/8/9/11, REQ-DAT-4/6/13). The pane twin is the document's own
  //      composition verbatim (a degraded `listFigures` lands `items:[]` — the SSR's
  //      `.catch(() => null) ?? []` arm, never a fabricated row); the card twin answers
  //      `{figure:null}` on a missed/declined read — the document's `figureCardElement` 404 arm,
  //      verbatim; the sheet twin echoes the entry-point params the document reads off the URL
  //      (`?request`/`?kind`/`?figure`→`figureIdFromRef`/`?prior`/`?entry`) plus the
  //      server-computed `figureEstimate` — the leaf never re-derives the honesty seeds or the
  //      price. Binary figure assets (the SVG/PNG/data downloads) stay document/asset
  //      navigations — no JSON twin proxies bytes (REQ-BFF-17-class). ----

  /** The estimate for the sheet + the run create — one derivation, server-side (the api re-derives
   *  it too; these figures only pre-fill the card). Hoisted ahead of the BFF twin so the document
   *  routes and the JSON read share the ONE derivation. */
  const figureEstimate = (iterate: boolean) =>
    // EST.1 — the surface API (the figure sheet's pre-fill agrees with the run sheet).
    surfaceEstimate({
      workflow: "figure",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { iterations: iterate ? 1 : 0, dataRows: 0 },
    });

  /** Classify the request text's provenance seeds (@claim:/@asset:/a URL/typed insist) into the
   *  sourceRefs shape the api's honesty seed reads. */
  const figureSourceRefs = (args: { request: string; insist: boolean; selectionText?: string }) => {
    const refs: Record<string, unknown> = {};
    const claimIds = [...args.request.matchAll(/@claim:([^\s]+)/g)].map((m) => m[1]!);
    if (claimIds.length > 0) refs.claimIds = claimIds;
    const asset = /@asset:([^\s]+)/.exec(args.request);
    if (asset) refs.assetId = asset[1];
    const url = /(https?:\/\/[^\s]+)/.exec(args.request);
    if (url) refs.url = url[1];
    if (args.selectionText) refs.selection = { quote: args.selectionText };
    if (args.insist) refs.insisted = true;
    return Object.keys(refs).length > 0 ? refs : undefined;
  };

  app.get(
    "/bff/p/:slug/figures",
    bffRoute(deps, async (c, session) => {
      // `GET /p/:slug/figures` — the pane twin: the api's FigureListItemDto rows verbatim
      // (badge text — `[unverified data]` — is the api's, never retyped here).
      const slug = c.req.param("slug") ?? "";
      const row = await bffProjectRow(c, deps.dataSource, session, slug);
      if (!row) return c.json({ error: "not_found" }, 404);
      const items = (await deps.dataSource.listFigures?.(session, row.id).catch(swallowDegraded)) ?? [];
      return c.json({ figures: { slug, items } });
    }),
  );

  app.get(
    "/bff/p/:slug/figures/:figureId",
    bffRoute(deps, async (c, session) => {
      // `GET /p/:slug/figures/:figureId` — the card twin: the full FigureCardDto + the head-draft
      // target the insert proposal gates on. A missed read is `{figure:null}` — the leaf renders
      // the document's own 404 arm (`COPY.visualize.notFound`), not the router's generic one.
      const slug = c.req.param("slug") ?? "";
      const row = await bffProjectRow(c, deps.dataSource, session, slug);
      if (!row) return c.json({ error: "not_found" }, 404);
      const card = await deps.dataSource
        .getFigure?.(session, row.id, c.req.param("figureId") ?? "")
        .catch(swallowDegraded);
      if (!card) return c.json({ figure: null });
      return c.json({
        figure: { slug, card, headDraftId: row.headDraftId ?? null },
      });
    }),
  );

  app.get(
    "/bff/p/:slug/visualize",
    bffRoute(deps, async (c, session) => {
      // `GET /p/:slug/visualize` — the consent sheet's composition verbatim: the URL-echoed
      // request/spec-kind/iterate picks + the server-computed estimate. `?figure=` keeps the
      // `fig_`-prefix strip (`figureIdFromRef`) — the leaf never re-derives it.
      const slug = c.req.param("slug") ?? "";
      const row = await bffProjectRow(c, deps.dataSource, session, slug);
      if (!row) return c.json({ error: "not_found" }, 404);
      const figureId = c.req.query("figure") ? figureIdFromRef(c.req.query("figure")!) : undefined;
      const priorVersion = Number(c.req.query("prior"));
      const est = figureEstimate(figureId != null);
      return c.json({
        visualize: {
          slug,
          request: c.req.query("request") ?? "",
          specKind: c.req.query("kind") ?? "",
          ...(figureId ? { figureId } : {}),
          ...(Number.isInteger(priorVersion) && priorVersion > 0 ? { priorVersion } : {}),
          entryPoint: c.req.query("entry") ?? "chat",
          estimateCredits: est.estimateCredits,
          capCredits: est.capCredits,
        },
      });
    }),
  );

  // ---- P1.01 — the IDE shell (§5.1; REQ-IDE-8/38) ---------------------------------------------------
  // Every /p/:project… document is an IDE surface: renderDocument stamps the theme attrs (no wrong-theme
  // flash — the inline boot script resolves dark|light|auto + the per-project paper pin before paint) and
  // PageData.ide feeds the shell's per-user×project pane key + the same-origin write endpoints. The theme
  // reads are best-effort — a data seam missing them degrades to the defaults, never a failed page.
  const ideContext = async (
    c: Context,
    session: SessionHeaders,
    row: { id: string; slug: string; paperTheme?: "light" | "follow" | "dark"; headDraftId?: string | null; activeRun?: { runId: string; state: string } | null },
    opts: {
      inboxCount?: number;
      findings?: { id: string; severity: string; kind: string; excerpt: string }[];
      timeline?: { id: string; label: string; state: string; href?: string }[];
      /** P1.05 — the structured Timeline pane read (supersedes `timeline` rows). */
      timelineView?: TimelineDto;
      /** P1.05 — the Desk's Live feed tab (replayed rows + the same-origin events URL). */
      feed?: { runId: string; eventsUrl: string; density: "summary" | "details" | "verbose"; rows: FeedRow[]; lastSeq?: number };
      /** the ⌘⇧R "run next step" target. */
      runNextHref?: string;
      status?: { version?: string; words?: number; readMin?: number; venueCap?: string; credits?: number; sync?: "synced" | "syncing" | "offline" };
    } = {},
  ): Promise<Pick<PageData, "theme" | "paperTheme" | "ide" | "compact">> => {
    const [principal, theme, files, chat] = await Promise.all([
      Promise.resolve()
        .then(() => deps.dataSource.getSessionPrincipal?.(session))
        .catch(() => null),
      Promise.resolve()
        .then(() => deps.dataSource.getTheme?.(session))
        .catch(() => null),
      // P1.08 — the §5.13 Files pane (best-effort: a missing read hides the pane's rows, not the page).
      Promise.resolve()
        .then(() => deps.dataSource.getFiles?.(session, row.id))
        .catch(() => undefined),
      // P1.11 — the Desk Chat read (best-effort: a missing seam degrades to the tab's placeholder).
      Promise.resolve()
        .then(() => deps.dataSource.getChat?.(session, row.id))
        .catch(() => undefined),
    ]);
    // P1.06 (§5.12; REQ-CHAT-28) — the ⌘K palette's embedded PaletteData: the state function's next
    // step pinned first in Run (with its estimate), Go-to = the timeline's versions + the Margin's
    // findings, Recent runs from the rounds, Settings = the settings links. Threads need no seed —
    // the section hides when empty. Every row is a navigation; the palette never launches a run.
    const next = opts.timelineView?.nextStep;
    const nextVerb = next?.verb ? (VERB_TABLE.find((v) => v.workflow === next.verb)?.verb ?? null) : null;
    const paletteData: PaletteData = {
      projectSlug: row.slug,
      ...(next && nextVerb
        ? {
            nextStep: {
              command: `/${nextVerb}`,
              label: next.label ?? `/${nextVerb}`,
              ...(next.estimateCredits != null ? { estimateCredits: next.estimateCredits } : {}),
            },
          }
        : {}),
      goto: [
        // versions — the Page's `/v/:n` routes.
        ...(opts.timelineView?.rounds ?? []).map((r) => ({
          label: `v${r.n}`,
          path: `/p/${row.slug}/v/${r.n}`,
          keywords: [`v${r.n}`, "version"],
        })),
        // findings — the Margin's rows (in-page anchors).
        ...(opts.findings ?? []).map((f) => ({
          label: f.excerpt.length > 60 ? `${f.excerpt.slice(0, 57)}…` : f.excerpt,
          path: `#finding-${f.id}`,
          keywords: [f.id, f.severity, f.kind],
        })),
        // P1.07 — REQ-OBJ-10: the palette's free-form obligation lands on the row-creation form
        // (`source: 'user'`, standing — the same write "Add to obligations" takes).
        { label: "New obligation…", path: `/p/${row.slug}/obligations/new`, keywords: ["obligation", "new", "add", "track"] },
      ],
      recentRuns: (opts.timelineView?.rounds ?? [])
        .flatMap((r) => r.runs)
        .slice(-8)
        .reverse()
        .map((run) => ({
          label: `${run.workflow} · ${run.state}`,
          path: `/p/${row.slug}/r/${run.runId}`,
          keywords: [run.workflow, run.state],
        })),
      settings: [
        // P1.20 — the §4.2 project-settings page + the §14.7 account tree.
        { label: "Project settings", path: `/p/${row.slug}/settings` },
        { label: "Account settings", path: "/app/settings/account" },
        { label: "Usage", path: "/usage" },
        // P1.16 — the plan card + the §14.5 level-2 rollup ride the IDE settings list too.
        { label: "Billing", path: "/app/settings/billing" },
        { label: "Project usage", path: `/p/${row.slug}/usage` },
      ],
    };
    return {
      ...(theme?.appTheme ? { theme: { pref: theme.appTheme } } : {}),
      paperTheme: row.paperTheme ?? "light",
      // P1.19 (§10.1) — every IDE-framed render inherits the phone-width flag from here: the Desk's
      // gate card and the Margin's finding affordances read `data.compact` directly.
      compact: isPhoneRequest(c),
      ide: {
        ...(principal?.userId ? { userId: principal.userId } : {}),
        projectId: row.id,
        ...(c.req.query("focus") === "1" ? { initialView: "focus" as const } : {}),
        // EDIT.1 — the Files-pane Source row is an edit entry point: it rides the one resolver
        // (`/v/working` → the editable head) instead of the legacy /edit/:id redirect hop.
        ...(row.headDraftId ? { sourceHref: `/p/${row.slug}/v/working` } : {}),
        ...(row.activeRun ? { activeRun: row.activeRun } : {}),
        ...(opts.inboxCount != null ? { inboxCount: opts.inboxCount } : {}),
        ...(opts.findings ? { findings: opts.findings } : {}),
        ...(opts.timeline ? { timeline: opts.timeline } : {}),
        ...(opts.timelineView ? { timelineView: opts.timelineView } : {}),
        ...(opts.feed ? { feed: opts.feed } : {}),
        ...(opts.runNextHref ? { runNextHref: opts.runNextHref } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        palette: JSON.stringify(paletteData),
        paletteSearchUrl: `/p/${row.slug}/palette-search`,
        themeUrl: "/ide/theme",
        paperThemeUrl: `/p/${row.slug}/paper-theme`,
        ...(files ? { files } : {}),
        ...(chat ? { chat } : {}),
      },
    };
  };

  /** SPA.22 — the live-feed slice every IDE-framed read shares: the replayed `details`-density
   *  rows + the last sequence for a non-terminal run, best-effort (a missing/degraded events read
   *  degrades to no feed, never a failed page). The `/p/:slug` reader + the `run-report` BFF twin
   *  consume it verbatim so both renderers seed the SAME initial feed (`data-feed-rows` +
   *  `data-feed-last-seq`) before the one same-origin SSE resumes at `?after=<lastSeq>`. */
  const liveFeedSlice = async (
    session: SessionHeaders,
    runId: string,
  ): Promise<{ rows: ReturnType<typeof feedRowsFor>; lastSeq: number } | null> =>
    Promise.resolve()
      .then(() => deps.dataSource.getRunEvents?.(session, runId))
      .then((events) =>
        events
          ? { rows: feedRowsFor(events, "details"), lastSeq: events.reduce((m, e) => Math.max(m, e.seq), 0) }
          : null,
      )
      .catch(() => null);

  // ---- SPA.20 — the `run-sheet` surface (REQ-BFF-1/8/9/11/12/23, REQ-DAT-4/6/12; design/22 §2
  //      `p.run` row + §7.3 the typed estimate twin). `runSheetComposition` is the ONE composition
  //      the document GET and `GET /bff/p/:slug/run` share — the same seams, the same degrade
  //      posture, the same side effects (the `voice.staleness_shown` emit, the exhausted-prompt
  //      impression, the `rhema_fp` mint) so the two renderers price + log identically. `sheet`
  //      ships the server-built RunSheetView VERBATIM (design/22's F13 ruling): `recompute.cells`,
  //      `idempotencyKey`, `entitlementId`, and the display strings ride inside — the SPA leaf
  //      repaints levers off `cells` and NEVER calls the estimator (`surfaceEstimate`/
  //      `buildLeverMatrix` stay server IP, out of the bundle). The estimate POST is the
  //      revalidation twin for out-of-matrix inputs — the api's `POST /projects/:id/estimates`
  //      verbatim. ----

  /** The sheet's ONE composition (document GET + BFF twin): context read → active-run precedence →
   *  billing/voice/pretriage reads → the RunSheetView. Returns `activeRun` when a non-terminal run
   *  blocks this workflow+scope — the document's own first-arm semantic. */
  const runSheetComposition = async (
    c: Context,
    session: SessionHeaders,
    row: ProjectRow,
    query: Record<string, string>,
  ): Promise<{
    view: ReturnType<typeof buildSheet>;
    activeRun?: { runId: string; state: string };
    pretriage?: { triaged: number; total: number };
  }> => {
    const slug = row.slug;
    // P1.06 — the sheet's ONE context read (§5.6; REQ-IDE-13): head draft, sections, obligations, the
    // trial entitlement, the consent pref, and `blockedBy` — the run THIS sheet's workflow+scope would
    // collide with under the P1.06 per-write-lock ruling. `row.activeRun` is only the fallback when the
    // context read fails (fail-conservative — never a surprise duplicate).
    const sheetCtx = await Promise.resolve()
      .then(() =>
        deps.dataSource.getRunSheetContext?.(session, row.id, {
          workflow: normalizeWorkflow(query.workflow ?? "review"),
          ...(query.scope ? { scope: query.scope } : {}),
        }),
      )
      .catch(() => null);
    const blocking = sheetCtx?.blockedBy ?? (sheetCtx == null ? row.activeRun : null);
    if (blocking) {
      return {
        view: buildSheet(query, undefined, deps.betaPlanOfferUrl, sheetCtx),
        activeRun: { runId: blocking.runId, state: blocking.state },
      };
    }
    // PRB.08 — the REAL balance: spendable credits, suspension, and the beta Payment Link for the panel.
    const billing = await deps.dataSource.getBillingBalance(session).catch(() => undefined);
    // PRB.10 — the voice line (§9.6): the project's linked persona + the shared pill, or the ad-hoc
    // default. When the pill's action is `update_voice` the priced chained action renders ("Update voice
    // first ≈N cr") — a fact + an action, never a gate (a stale/untested/never-built voice never blocks).
    const pv = await Promise.resolve()
      .then(() => deps.dataSource.getProjectVoice(session, row.id))
      .catch(() => null);
    let updateEstimateCredits: number | undefined;
    if (pv?.status?.action === "update_voice" && pv.personaId) {
      updateEstimateCredits = (
        await Promise.resolve()
          .then(() => deps.dataSource.estimateVoice(session, pv.personaId!, "quick"))
          .catch(() => null)
      )?.estimateCredits;
    }
    // PRB.12 — the staleness banner showing IS the `voice.staleness_shown` event (state = the pill's state).
    if (pv?.status?.action === "update_voice") {
      emit(session, "voice.staleness_shown", { state: pv.status.state }, { projectId: row.id });
    }
    const view = {
      ...buildSheet(query, billing, deps.betaPlanOfferUrl, sheetCtx),
      ...(pv
        ? {
            voice:
              pv.voiceMode === "ad_hoc"
                ? ({ mode: "ad_hoc" } as const)
                : ({
                    mode: "linked",
                    ...(pv.personaId ? { personaId: pv.personaId } : {}),
                    name: pv.name ?? pv.personaId,
                    ...(pv.status ? { pill: pv.status.pill } : {}),
                    ...(pv.snapshot?.builtAt ? { snapshotAt: pv.snapshot.builtAt } : {}),
                    ...(updateEstimateCredits != null
                      ? { updateEstimateCredits, updateAction: `/p/${slug}/update-voice` }
                      : {}),
                  } as const),
          }
        : {}),
    };
    // REQ-BETA-12 — the exhaustion prompt showing IS the telemetry event (action_taken:"shown"); the panel's
    // Payment-Link click records "open_payment_link" via /p/:slug/exhausted.
    if (view.insufficient) {
      await deps.dataSource.recordExhaustedPrompt(session, "shown").catch(() => undefined);
    }
    // ACT.1 — the trial unlock's device fingerprint plants on the sheet read so the Run POST can
    // forward it (minted HttpOnly; the api stores only its salted hash). The twin mints identically
    // — a SPA document load + its twin fetch leave the same billing trail the SSR GET leaves.
    if (view.entitlementId) ensureFingerprint(c);
    // PRB.05 / REQ-IDE-28: the Revise sheet shows "you pre-triaged N of M" (the user's rows are
    // highest-precedence guidance for the run). A failed read never blocks the sheet.
    let pretriage: { triaged: number; total: number } | undefined;
    if (view.workflow === "revise") {
      pretriage = await deps.dataSource
        .getPretriage(session, row.id)
        .then((p) => ({ triaged: p.triaged, total: p.total }))
        .catch(() => undefined);
    }
    return { view, pretriage };
  };

  // `GET /p/:slug/run`'s twin (design/22 §2 `p.run` — the aggregate). `view` is the server-built
  // RunSheetView verbatim; `activeRun` collapses the twin into the document's in-progress arm; the
  // `ide` bag republishes onto the React chrome (IDE-framed: `run-sheet` × `ide-chrome` AND-gate —
  // REQ-SEQ-12). `?notice` stays URL state — flashes are never payload. `phone` is boot-owned
  // (`deviceClass`), never the twin's to decide.
  app.get("/bff/p/:slug/run", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const { view, pretriage, activeRun } = await runSheetComposition(c, session, row, c.req.query());
    const ctx = await ideContext(c, session, row);
    return c.json({
      runSheet: {
        slug,
        projectTitle: row.title,
        view,
        ...(activeRun ? { activeRun } : {}),
      },
      ...(pretriage ? { pretriage } : {}),
      project: { title: row.title, pill: row.state.pill, slug },
      paperTheme: ctx.paperTheme ?? "light",
      ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
      ide: ctx.ide,
    });
  }));
  // REQ-BFF-23 — the typed estimate twin for revalidation + out-of-matrix inputs (design/22 §7.3):
  // the api's `POST /projects/:id/estimates` verbatim — the typed EstimateRequestDto body forwards,
  // the typed EstimateDto lands (the lever-matrix repaint is a client `cells` lookup and never
  // reaches this). A JSON caller is never handed a redirect — failures ride `bffFail` verbatim.
  app.post("/bff/p/:slug/estimate", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    if (deps.dataSource.estimate == null) return c.json({ error: "estimate_unavailable" }, 503);
    const body = (await c.req.json().catch(() => null)) as EstimateRequestDto | null;
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "invalid_request" }, 400);
    }
    return c.json(await deps.dataSource.estimate(session, row.id, body));
  }));

  // P1.06 — the ⌘K palette's free-text search proxy (§5.12): same-origin, session-forwarded to the
  // api's project search narrowed to THIS project; hits map to deep links (drafts → the editor,
  // letters → the revision page). Navigation only — this route never creates anything.
  app.get("/p/:project/palette-search", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ results: [] }, 401);
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.json({ results: [] }, 404);
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ results: [] });
    const hits =
      (await Promise.resolve()
        .then(() => deps.dataSource.searchPalette?.(session, q, row.id))
        .catch(() => undefined)) ?? [];
    const results = hits.map((h) => ({
      label: h.title,
      path:
        h.kind === "draft" && h.refId
          ? `/p/${slug}/edit/${h.refId}`
          : h.kind === "letter" && h.refId
            ? `/p/${slug}/revisions/${h.refId}`
            : `/p/${h.slug}`,
      keywords: [h.kind],
      snippet: h.snippet,
    }));
    return c.json({ results });
  });

  // The island's same-origin theme writes — the web server forwards the session to the api (the bundle
  // never holds a credential; REQ-ARCH-33). Fire-and-forget from the client; the localStorage mirror is
  // already applied optimistically, so a failed write degrades to session-local.
  app.post("/ide/theme", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { appTheme?: unknown } | null;
    const appTheme = body?.appTheme;
    if (appTheme !== "dark" && appTheme !== "light" && appTheme !== "auto") {
      return c.json({ error: "appTheme must be 'dark' | 'light' | 'auto'" }, 422);
    }
    const out = await deps.dataSource.setTheme(session, appTheme).catch(() => null);
    return c.json({ ok: true, appTheme, ...(out ? {} : { deferred: true }) });
  });

  app.post("/p/:project/paper-theme", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const slug = c.req.param("project");
    const body = (await c.req.json().catch(() => null)) as { paperTheme?: unknown } | null;
    const paperTheme = body?.paperTheme;
    if (paperTheme !== "light" && paperTheme !== "follow" && paperTheme !== "dark") {
      return c.json({ error: "paperTheme must be 'light' | 'follow' | 'dark'" }, 422);
    }
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.json({ error: "project not found" }, 404);
    const out = await deps.dataSource.setPaperTheme(session, row.id, paperTheme).catch(() => null);
    return c.json({ ok: true, paperTheme, ...(out ? {} : { deferred: true }) });
  });

  // ---- P1.11 — the Desk Chat write forwards (§7.1) -------------------------------------------
  // Same-origin posts the ChatDesk forms (and the island) hit; each resolves the slug, forwards the
  // session to the api's chat route, and answers JSON for the island or a redirect for a no-script
  // form submit. The api owns every rule — the web layer never interprets budgets or anchors.
  const chatBody = async (c: Context): Promise<Record<string, unknown>> => {
    if ((c.req.header("content-type") ?? "").includes("application/json")) {
      return ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    }
    const form = await c.req.parseBody();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) if (typeof v === "string") out[k] = v;
    return out;
  };
  // SPA.5 — `wantsJson` is now the shared BFF convention (bff.ts); the chat branches below consume
  // the same helper every surface mutation's JSON branch keys on.
  const chatProject = async (c: Context, session: SessionHeaders) => {
    const row = (await deps.dataSource.listProjects(session)).find(
      (r) => r.slug === c.req.param("project"),
    );
    return row ?? null;
  };
  /** A form POST redirects back to the project page (the Desk reopens on Chat); a JSON call gets the DTO. */
  const chatReply = (c: Context, slug: string, payload: unknown, status = 200) =>
    wantsJson(c) ? c.json(payload, status as never) : c.redirect(`/p/${slug}#chat`);

  /**
   * RUN.1 (BL-55) — the chat proxy's truthful error path. The api's refusal statuses pass through
   * VERBATIM (a 402 stays `{error:"insufficient_balance"}` at 402; a 409 stays `run_in_progress`) —
   * the caller can name the refusal instead of staring at a bare 502. An api 5xx, a dropped
   * connection, or an unbound seam is the only real gateway failure. Every refusal logs ONE
   * structured line — route TEMPLATE + requestId + upstream status/code — and NEVER the user's
   * message text, the thread's content, or any prompt material (the body arrives in `message`;
   * nothing logs it). OBS.1 — the line is the shared allowlisted shape: the request's OWN id (not a
   * call-local UUID), WARNING for an expected <5xx refusal, ERROR only for a real server fault.
   */
  type ChatCall<T> = { readonly out: T } | { readonly status: number; readonly code: string };
  const chatCall = async <T>(
    c: Context,
    fn: () => Promise<T> | undefined,
  ): Promise<ChatCall<T>> => {
    try {
      const out = await fn();
      if (out === undefined) {
        // the data-source seam isn't bound — the api would call this `chat_not_wired`.
        logWebRouteError(c, {
          status: 503,
          upstreamCode: "chat_not_wired",
          msg: "chat_seam_unbound",
          errorClass: "UnboundSeam",
        });
        return { status: 503, code: "chat_not_wired" };
      }
      return { out };
    } catch (e) {
      if (e instanceof ApiError) {
        const status = e.status >= 500 ? 502 : e.status;
        logWebRouteError(c, {
          status,
          upstreamStatus: e.status,
          upstreamCode: e.code ?? null,
          msg: "chat_upstream_refused",
          severity: status >= 500 ? "ERROR" : "WARNING",
          errorClass: errorClass(e),
          stack: stackForLog(e),
        });
        return { status, code: status === 502 ? "chat_upstream_error" : (e.code ?? "chat_refused") };
      }
      logWebRouteError(c, {
        status: 502,
        msg: "chat_upstream_unreachable",
        errorClass: errorClass(e),
        stack: stackForLog(e),
      });
      return { status: 502, code: "chat_unavailable" };
    }
  };
  /** The JSON reply a failed chat call returns — identical for form posts (no redirect eats the truth). */
  const chatFail = (c: Context, res: { status: number; code: string }) =>
    c.json({ error: res.code }, res.status as never);

  app.post("/p/:project/chat/turns", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const body = await chatBody(c);
    const threadId = typeof body.threadId === "string" ? body.threadId : "";
    const message = typeof body.message === "string" ? body.message : "";
    if (!threadId || !message.trim()) return c.json({ error: "threadId + message required" }, 422);
    // P1.12 — the `/outline` verb never runs inline (REQ-CHAT-25's consent rule): it resolves to the
    // promotion SHEET — the sheet's Promote click is the only outline-run creator. `/outline @turn:id`
    // scopes to one turn; bare `/outline` promotes the whole thread.
    const outlineCmd = /^\/outline(?:\s+@turn:([^\s]+))?\s*$/.exec(message.trim());
    if (outlineCmd) {
      const turn = outlineCmd[1];
      return c.redirect(
        `/p/${row.slug}/outline/promote?scope=${turn ? "turn" : "thread"}&threadId=${encodeURIComponent(threadId)}${turn ? `&turnId=${encodeURIComponent(turn)}` : ""}`,
      );
    }
    // P1.13 — the `/visualize` verb never runs inline either (the same REQ-CHAT-25 consent rule):
    // it resolves to the visualize SHEET with the typed request prefilled — the sheet's Visualize
    // click is the only figure-run creator. `/visualize <text>` seeds the request verbatim
    // (@claim:/@asset:/URL refs ride the text; the POST classifies them into provenance seeds).
    const vizCmd = /^\/visualize(?:\s+(.*))?$/s.exec(message.trim());
    if (vizCmd) {
      const request = vizCmd[1]?.trim() ?? "";
      return c.redirect(
        `/p/${row.slug}/visualize${request ? `?request=${encodeURIComponent(request)}` : ""}`,
      );
    }
    const res = await chatCall(c, () =>
      deps.dataSource.postChatTurn?.(session, row.id, threadId, {
        message,
        ...(typeof body.modelTier === "string" ? { modelTier: body.modelTier } : {}),
        ...(typeof body.idempotencyKey === "string" ? { idempotencyKey: body.idempotencyKey } : {}),
        // R5ECON.2 — the R4 leg's registry pin rides the same post (`{testCheapRoute:false}`;
        // is_test-only at the api). A form post carries it as a JSON string; the island as an object.
        ...(cogsLeversField(body.cogsLevers) ? { cogsLevers: cogsLeversField(body.cogsLevers) } : {}),
      }),
    );
    if (!("out" in res)) return chatFail(c, res);
    return chatReply(c, row.slug, res.out, 201);
  });

  app.post("/p/:project/chat/plan-decision", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const body = await chatBody(c);
    const threadId = typeof body.threadId === "string" ? body.threadId : "";
    const action = body.action;
    if (!threadId || (action !== "run_research" && action !== "first_step" && action !== "edit" && action !== "cancel"))
      return c.json({ error: "threadId + action required" }, 422);
    const res = await chatCall(c, () =>
      deps.dataSource.postChatPlanDecision?.(session, row.id, threadId, {
        action,
        ...(typeof body.runId === "string" ? { runId: body.runId } : {}),
      }),
    );
    if (!("out" in res)) return chatFail(c, res);
    const out = res.out;
    // run_research resolves to the SHEET href — the sheet's Run click is the only run creator.
    if (action === "run_research" && out.sheet?.href && !wantsJson(c)) return c.redirect(out.sheet.href);
    return chatReply(c, row.slug, out);
  });

  app.post("/p/:project/chat/threads", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const body = await chatBody(c);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name required" }, 422);
    const res = await chatCall(c, () =>
      deps.dataSource.createChatThread?.(session, row.id, { name }),
    );
    if (!("out" in res)) return chatFail(c, res);
    const out = res.out;
    return chatReply(c, row.slug, out, 201);
  });

  app.post("/p/:project/chat/pins", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const body = await chatBody(c);
    const threadId = typeof body.threadId === "string" ? body.threadId : "";
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    if (!threadId || !summary) return c.json({ error: "threadId + summary required" }, 422);
    const res = await chatCall(c, () =>
      deps.dataSource.addChatPin?.(session, row.id, threadId, {
        summary,
        ...(typeof body.kind === "string" ? { kind: body.kind as "fact" | "ref" | "source" } : {}),
        ...(typeof body.ref === "string" && body.ref ? { ref: body.ref } : {}),
        ...(body.dropOldest === "true" || body.dropOldest === true ? { dropOldest: true } : {}),
      }),
    );
    if (!("out" in res)) return chatFail(c, res);
    const out = res.out;
    return chatReply(c, row.slug, out, 201);
  });

  app.post("/p/:project/chat/pins/:pinId/remove", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const body = await chatBody(c);
    const threadId = typeof body.threadId === "string" ? body.threadId : "";
    if (!threadId) return c.json({ error: "threadId required" }, 422);
    const res = await chatCall(c, () =>
      deps.dataSource.removeChatPin?.(session, row.id, threadId, c.req.param("pinId")),
    );
    if (!("out" in res)) return chatFail(c, res);
    const out = res.out;
    return chatReply(c, row.slug, out);
  });

  app.post("/p/:project/chat/corrections", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const body = await chatBody(c);
    const threadId = typeof body.threadId === "string" ? body.threadId : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!threadId || !text) return c.json({ error: "threadId + text required" }, 422);
    const res = await chatCall(c, () =>
      deps.dataSource.postChatCorrection?.(session, row.id, threadId, { text }),
    );
    if (!("out" in res)) return chatFail(c, res);
    const out = res.out;
    return chatReply(c, row.slug, out, 201);
  });

  // §7.4 — "Ask about this draft": the anchored suggestion. A refusal (over one paragraph) re-renders
  // with the api's message (it names /lineedit @section / /revise as commands — never run inline).
  app.post("/p/:project/chat/suggestions", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const body = await chatBody(c);
    const ref = typeof body.ref === "string" ? body.ref : "";
    const replacement = typeof body.replacement === "string" ? body.replacement : "";
    if (!ref || !replacement.trim()) return c.json({ error: "ref + replacement required" }, 422);
    const res = await chatCall(c, () =>
      deps.dataSource.postChatSuggestion?.(session, row.id, {
        anchor: {
          ref,
          ...(typeof body.version === "string" && /^\d+$/.test(body.version)
            ? { version: Number(body.version) }
            : typeof body.version === "number"
              ? { version: body.version }
              : {}),
          ...(typeof body.block === "string" && body.block ? { block: body.block } : {}),
        },
        replacement,
      }),
    );
    if (!("out" in res)) {
      // §7.4 — an over-paragraph refusal is a caller-correctable 422 (the code names /lineedit·/revise);
      // every other refusal keeps the api's truthful status + the structured log line.
      if (res.code === "suggestion_too_large" && !wantsJson(c)) return c.redirect(`/p/${row.slug}#chat`);
      return chatFail(c, res);
    }
    return chatReply(c, row.slug, res.out, 201);
  });

  // §7.6 — the "Paste my notes" scratch write (lands at agents/author/notes.md — the author intake).
  app.post("/p/:project/chat/notes", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const body = await chatBody(c);
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return c.json({ error: "text required" }, 422);
    const res = await chatCall(c, () =>
      deps.dataSource.postChatNote?.(session, row.id, { text }),
    );
    if (!("out" in res)) return chatFail(c, res);
    const out = res.out;
    return chatReply(c, row.slug, out, 201);
  });

  // §7.1 — attachments: the island presigns + PUTs to quarantine first, then posts the key here
  // (the api converts + lands the source note). A no-script submit with a pasted quarantineKey works too.
  app.post("/p/:project/chat/attachments", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const body = await chatBody(c);
    const quarantineKey = typeof body.quarantineKey === "string" ? body.quarantineKey : "";
    const filename = typeof body.filename === "string" ? body.filename : "";
    const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
    if (!quarantineKey || !filename || !mediaType)
      return c.json({ error: "quarantineKey + filename + mediaType required" }, 422);
    const res = await chatCall(c, () =>
      deps.dataSource.postChatAttachment?.(session, row.id, {
        quarantineKey,
        filename,
        mediaType,
        ...(typeof body.threadId === "string" && body.threadId ? { threadId: body.threadId } : {}),
      }),
    );
    if (!("out" in res)) return chatFail(c, res);
    const out = res.out;
    return chatReply(c, row.slug, out, 201);
  });

  // The island's turn-status poll — JSON only (the metered strip; never model prose).
  app.get("/p/:project/chat/turns/:runId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const row = await chatProject(c, session);
    if (!row) return c.json({ error: "project not found" }, 404);
    const threadId = c.req.query("thread") ?? "";
    const res = await chatCall(c, () =>
      deps.dataSource.getChatTurn?.(session, row.id, threadId, c.req.param("runId")),
    );
    if (!("out" in res)) return chatFail(c, res);
    return c.json(res.out);
  });

  // ---- P1.12 — the Outline surface (§7.3): the promotion sheet, the durable editor, deletion ----

  // The promotion sheet (GET): the api's verbatim facts (scope, source-copy roster, the URL set the
  // run re-fetches, the estimate + cap). The Promote click is the consent — it creates the run.
  app.get("/p/:project/outline/promote", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR sheet + its api reads are deleted; the leaf
    // composes the same facts off the /bff twin). A `?ssr=1` request converges here too — this
    // surface has no SSR document left to serve (and SPA.28 reads no override params at all).
    return spaShellDocument(c, deps, session);
  });

  // The Promote click — the ONLY outline-run creator (the sheet is the consent, like the run sheet's
  // Run click). Re-renders the sheet with the started line on success. SPA.18 (REQ-BFF-1/2): the JSON
  // arm posts the same scope/threadId/turnId/slug fields through `bodyFields`, answers the success
  // as the `{ok,redirect:"/p/:slug"}` envelope (the identical destination the 302 carried), and maps
  // the refusal codes through `bffFail` at the preserved status — never a redirect.
  app.post("/p/:project/outline/promote", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const scope = (str("scope") || "thread") as "thread" | "turn" | "research";
    try {
      const out = await deps.dataSource.promoteOutline?.(session, row.id, {
        ...(str("threadId") ? { threadId: str("threadId") } : {}),
        scope,
        ...(str("turnId") ? { turnId: str("turnId") } : {}),
        ...(str("slug") ? { slug: str("slug") } : {}),
        idempotencyKey: str("idempotencyKey") || randomUUID(),
      });
      if (!out) {
        // OBS.1 — the promote seam is unbound: a user-visible 502 gets its one structured line.
        logWebRouteError(c, { status: 502, msg: "outline_promote_unbound", errorClass: "UnboundSeam" });
        return wantsJson(c)
          ? c.json({ error: "upstream_unavailable" }, 502)
          : c.html(renderDocument(c.req.path, notFoundElement), 502);
      }
      return mutationOutcome(c, { redirect: `/p/${slug}`, data: out });
    } catch (e) {
      // the JSON arm answers the ApiError's stable `{error, detail?}` at the preserved status
      // (thread_not_found 404 / run_in_progress 409 / ≥500 → 502) — never a redirect, never a sheet.
      if (wantsJson(c)) return bffFail(c, e, { msg: "outline_promote_failed" });
      // OBS.1 — the failure surfaced as a ≥500 page status gets its one structured line (a handled
      // <500 refusal renders the notice silently — expected, not a server fault).
      if (!(e instanceof ApiError) || e.status >= 500) {
        logWebRouteError(c, {
          status: e instanceof ApiError ? e.status : 502,
          upstreamStatus: e instanceof ApiError ? e.status : null,
          upstreamCode: e instanceof ApiError ? (e.code ?? null) : null,
          msg: "outline_promote_failed",
          errorClass: errorClass(e),
          stack: stackForLog(e),
        });
      }
      // SPA.27 — the SSR sheet is deleted: a form-mode failure lands back on the sheet URL (the
      // leaf recomposes the same promotion facts off the twin) instead of a server re-render.
      const retry = new URLSearchParams({ scope });
      if (str("threadId")) retry.set("threadId", str("threadId"));
      if (str("turnId")) retry.set("turnId", str("turnId"));
      return c.redirect(`/p/${slug}/outline/promote?${retry.toString()}`);
    }
  });

  // The durable outline editor (GET): the artifact's head + its parsed outline.json twin as the shared
  // spine-and-sections rows. Phone-width is read-only (§10.1). The Draft estimate line is the run-sheet
  // estimator over the outline's own words — recomputed on every render/save (the "live" estimate).
  app.get("/p/:project/outline", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (SSR editor + its api reads deleted; the leaf composes
    // the same DTO off the /bff twin, `?saved`/`?notice` stay URL flash state).
    return spaShellDocument(c, deps, session);
  });

  // The autosave: the form's `ed.*` fields decode through the SAME grammar the gate card posts → the
  // api's PATCH `edit` → one new version pair. A no-JS Save and the island's debounced submit land
  // here. SPA.18 (REQ-BFF-1/2): a JSON caller may post the SAME flat `ed.*` field map OR a structured
  // `{edit}` body (`bodyFields` reads the JSON content-type) — the decode is identical either way;
  // the success answer stays the patch result verbatim (the design/22 unchanged-shape twin — an
  // `{ok:true, …}` envelope already), while the empty-edits no-op and the failure arm become
  // `mutationOutcome`/`{error:"save_failed"}` 422 — a JSON caller is never handed a redirect.
  app.post("/p/:project/outline", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const body = await bodyFields(c);
    const edits =
      body.edit != null && typeof body.edit === "object" && !Array.isArray(body.edit)
        ? (body.edit as Record<string, unknown>)
        : (decodeGateEditFields(body) as Record<string, unknown>);
    const hasEdits = Object.values(edits).some(
      (v) => (Array.isArray(v) ? v.length > 0 : v != null && Object.keys(v).length > 0),
    );
    if (!hasEdits) return mutationOutcome(c, { redirect: `/p/${slug}/outline` });
    const out = await deps.dataSource
      .patchOutline?.(session, row.id, { edit: edits })
      .catch((e: unknown) => e);
    if (out == null || out instanceof Error) {
      return wantsJson(c) ? c.json({ error: "save_failed" }, 422) : c.redirect(`/p/${slug}/outline`);
    }
    return wantsJson(c) ? c.json(out) : c.redirect(`/p/${slug}/outline?saved=1`);
  });

  // Deletion protection (§7.3): a cited outline's DELETE answers 409 `outline_cited` — the page's
  // notice names the rule instead of the artifact disappearing under a draft. SPA.18: the JSON arm
  // rides `bffFail` (the `outline_cited` code passes through at 409 — never a redirect) and success
  // envelopes the same `/p/:slug` target.
  app.post("/p/:project/outline/delete", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    try {
      await deps.dataSource.deleteOutline?.(session, row.id, undefined);
      return mutationOutcome(c, { redirect: `/p/${slug}` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        return wantsJson(c)
          ? bffFail(c, e, { msg: "outline_delete_refused" })
          : c.redirect(`/p/${slug}/outline?notice=cited`);
      }
      throw e;
    }
  });

  // A gap's Answer — a standalone form (one input + button per gap row) → a `user_typed` claim lands in
  // the gap's section and the gap resolves. The gate card's `ed.gap.<id>` fields hit the same apply.
  // SPA.18: the JSON arm reads `{text}` off `bodyFields`, keeps the blank-input no-op and the swallow,
  // and answers the SAME `/outline?saved=1` target as `{ok,redirect}` — never a 302.
  app.post("/p/:project/outline/gaps/:gapId/answer", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const body = await bodyFields(c);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return mutationOutcome(c, { redirect: `/p/${slug}/outline` });
    await deps.dataSource
      .answerOutlineGap?.(session, row.id, c.req.param("gapId"), { text })
      .catch(() => null);
    return mutationOutcome(c, { redirect: `/p/${slug}/outline?saved=1` });
  });

  // ---- P1.13 — the Figures surface (§7.5): the pane, the card, the /visualize sheet, and the
  //      insert-as-proposal actions. Every entry point (chat /visualize, a selection's Visualize,
  //      Edit figure, a craft finding's Visualize) opens the SAME sheet; the sheet's click is the
  //      only run creator (REQ-CHAT-25's consent rule, like /outline's Promote). ----

  // `figureEstimate`/`figureSourceRefs` live ahead of the BFF twins block (SPA.19) — the
  // `/bff/p/:slug/visualize` read and these routes share the one derivation.

  // The /visualize sheet (GET): the request (prefilled by the entry point), the spec-kind pick, the
  // honesty note, and the estimate. Iterate mode (`?figure=` + `?prior=`) replays the figure id.
  app.get("/p/:project/visualize", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR sheet is deleted; the leaf recomposes the
    // request/spec/estimate params off the /bff twin).
    return spaShellDocument(c, deps, session);
  });

  // The Visualize click — the ONLY figure-run creator (the sheet IS the consent). Creates the
  // `figure` run via the same POST /runs path the run sheet uses, with the figure facts block.
  // SPA.19 (REQ-BFF-1/2/3): the JSON arm posts the same field map through `bodyFields`, answers the
  // success as `{ok, redirect:"/p/:slug/figures"}` (the identical destination the 302 carried), a
  // blank request as `{error:"request_required", detail}` 422 (the document's re-render arm), and
  // an upstream refusal through `bffFail` at the preserved status — never a redirect, never a sheet.
  app.post("/p/:project/visualize", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const request = str("request").trim();
    const figureId = str("figureId") || undefined;
    const priorVersion = Number(str("priorVersion"));
    const specKind = (["vega_lite", "mermaid", "table"] as const).find((k) => k === str("specKind"));
    const est = figureEstimate(figureId != null);
    if (!request) {
      if (wantsJson(c)) {
        return c.json({ error: "request_required", detail: COPY.visualize.requestRequired }, 422);
      }
      // SPA.27 — the SSR sheet is deleted: a form-mode validation failure lands back on the
      // sheet URL (the leaf holds its own field state) instead of a 422 re-render.
      return c.redirect(`/p/${slug}/visualize`);
    }
    const sourceRefs = figureSourceRefs({
      request,
      insist: str("insist") === "1" || form.insist === "on" || form.insist === true,
      ...(str("selectionText") ? { selectionText: str("selectionText") } : {}),
    });
    try {
      await deps.dataSource.createRun(session, row.id, {
        idempotencyKey: str("idempotencyKey") || randomUUID(),
        workflow: "figure",
        modelProfile: { tier: "balanced" },
        modelTier: "balanced",
        rigor: "standard",
        estimateCredits: est.estimateCredits,
        capCredits: est.capCredits,
        rateTableVersion: est.rateTableVersion,
        inputs: {},
        figure: {
          ...(figureId ? { figureId } : {}),
          entryPoint: str("entryPoint") || "chat",
          request,
          ...(specKind ? { specKind } : {}),
          ...(sourceRefs ? { sourceRefs } : {}),
          ...(Number.isInteger(priorVersion) && priorVersion > 0 ? { priorVersion } : {}),
        },
      });
      return mutationOutcome(c, { redirect: `/p/${slug}/figures` });
    } catch (e) {
      // the JSON arm answers the refusal at the preserved status — never a redirect, never a sheet.
      if (wantsJson(c)) return bffFail(c, e, { msg: "figure_run_failed" });
      // OBS.1 — a ≥500 page status gets its one structured line; a handled <500 refusal renders the
      // notice silently (expected, not a server fault).
      if (!(e instanceof ApiError) || e.status >= 500) {
        logWebRouteError(c, {
          status: e instanceof ApiError ? e.status : 502,
          upstreamStatus: e instanceof ApiError ? e.status : null,
          upstreamCode: e instanceof ApiError ? (e.code ?? null) : null,
          msg: "figure_run_failed",
          errorClass: errorClass(e),
          stack: stackForLog(e),
        });
      }
      // SPA.27 — the SSR sheet is deleted: a form-mode upstream failure lands back on the pane
      // (the twin re-read reports the true state) instead of a re-rendered error sheet.
      return c.redirect(`/p/${slug}/figures`);
    }
  });

  // The Figures pane (GET): every figure card with its badge + version + insert/render state.
  app.get("/p/:project/figures", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR pane + listFigures read are deleted; the leaf
    // composes the same roster off the /bff twin).
    return spaShellDocument(c, deps, session);
  });

  // The figure card (GET): preview + type chips + fields + disclosures + the insert surface.
  app.get("/p/:project/figures/:figureId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR card is deleted; `?saved`/`?notice` stay URL
    // flash state the leaf renders).
    return spaShellDocument(c, deps, session);
  });

  // The card's field edits (caption/alt/sourceLine) → the api's PATCH (alt ≤250 enforced there).
  // SPA.19: the JSON arm answers `mutationOutcome` — the `?saved=1`/`?notice=` redirect URL is the
  // envelope's `redirect` verbatim (flash state stays URL-owned, never a payload invention).
  app.post("/p/:project/figures/:figureId", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    try {
      await deps.dataSource.patchFigure?.(session, row.id, figureId, {
        caption: str("caption"),
        alt: str("alt"),
        sourceLine: str("sourceLine"),
      });
      return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}?saved=1` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}?notice=${encodeURIComponent("alt text is limited to 250 characters")}` });
      }
      if (wantsJson(c)) return bffFail(c, e, { msg: "figure_patch_failed" });
      throw e;
    }
  });

  // The type-chip iterate — a 0-cr mark edit (no run, no model call) → new version + re-render.
  app.post("/p/:project/figures/:figureId/spec-edit", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const mark = typeof form.mark === "string" ? form.mark : "";
    try {
      await deps.dataSource.editFigureSpec?.(session, row.id, figureId, { mark: mark as never });
      return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}` });
    } catch (e) {
      const notice = e instanceof ApiError ? String(e.code ?? "chip_not_supported") : "chip_not_supported";
      return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}?notice=${encodeURIComponent(notice)}` });
    }
  });

  // Restore v<n> — the version's spec/data/provenance copy back to head as a NEW version + re-render.
  app.post("/p/:project/figures/:figureId/versions/:n/restore", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const n = Number(c.req.param("n"));
    await deps.dataSource.restoreFigureVersion?.(session, row.id, figureId, n).catch(() => null);
    return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}` });
  });

  // Insert… — the proposal card (alt + source line gate it server-side; nothing touches the draft).
  app.post("/p/:project/figures/:figureId/propose", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const afterBlockId = typeof form.afterBlockId === "string" && form.afterBlockId !== "" ? form.afterBlockId : undefined;
    try {
      const out = await deps.dataSource.proposeFigure?.(session, row.id, figureId, {
        draftId: row.headDraftId ?? "",
        ...(afterBlockId ? { afterBlockId } : {}),
      });
      return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}`, data: out });
    } catch (e) {
      const notice =
        e instanceof ApiError && e.status === 409 ? "figure_not_ready" : e instanceof ApiError ? String(e.code ?? "propose_failed") : "propose_failed";
      return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}?notice=${encodeURIComponent(notice)}` });
    }
  });

  // Accept — ONE tx: the block splices through the draft save path (a frozen draft forks v(N+1)).
  app.post("/p/:project/figures/:figureId/proposals/accept", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    try {
      const out = await deps.dataSource.acceptFigureProposal?.(session, row.id, figureId);
      if (out?.inserted?.draftN != null) return mutationOutcome(c, { redirect: `/p/${slug}/v/${out.inserted.draftN}`, data: out });
      return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}` });
    } catch (e) {
      const notice = e instanceof ApiError ? String(e.code ?? "accept_failed") : "accept_failed";
      return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}?notice=${encodeURIComponent(notice)}` });
    }
  });

  // Reject — clear the card; the figure asset stays in working figures.
  app.post("/p/:project/figures/:figureId/proposals/reject", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    await deps.dataSource.rejectFigureProposal?.(session, row.id, figureId).catch(() => null);
    return mutationOutcome(c, { redirect: `/p/${slug}/figures/${figureId}` });
  });


  // PRB.16 — the Better Auth surface, proxied to the api so the OAuth callback + auth cookies live on
  // this host (the browser never talks to api.rhema.tools; see apps/api/src/auth-context.ts).
  // OBS.1 — the request id rides through here too, so an auth-call 5xx joins the same trail.
  if (deps.authProxy) {
    const proxy = deps.authProxy;
    app.all("/api/auth/*", (c) => {
      const headers = new Headers(c.req.raw.headers);
      headers.set(REQUEST_ID_HEADER, requestLogContext(c).requestId);
      return proxy(new Request(c.req.raw, { headers }));
    });
  }

  // A viewer with a live session never needs the public pages — send them straight to the app.
  // Without this check `/` renders the sign-in affordance unconditionally, so a returning signed-in
  // user "has to log in again" (each sign-in mints a redundant session row).
  const signedIn = async (c: Context): Promise<boolean> => {
    const s = deps.session(c);
    return s ? await deps.dataSource.checkSession(s).catch(() => false) : false;
  };

  // Public: the invite page (+ read-only sample dossier). In `open` mode the access note drops the
  // invitation requirement — still no marketing page, still factual. The partner-cohort machinery
  // keeps `/invite`; P1.17 takes `/` for the §15.1 landing (the Notes rule).
  const invite = async (c: Context) =>
    (await signedIn(c))
      ? c.redirect("/app")
      : c.html(renderDocument(c.req.path, inviteElement, { invite: { signupOpen } }, { origin: new URL(c.req.url).origin }));
  app.get("/invite", invite);

  // P1.17 — the pre-auth funnel beacons. `landing.viewed` fires server-side on the landing GET
  // (the api hashes the forwarded IP into acquisition_events); the client beacon endpoint relays
  // the drop-zone hold + any landing-side signals. Fire-and-forget — analytics never slow the page.
  const landingBeacon = (event: "landing.viewed" | "landing.dropzone_used", c: Context, props?: Record<string, unknown>, token?: string) => {
    try {
      void deps.dataSource
        .recordLandingEvent?.({
          event,
          ...(props ? { props } : {}),
          ...(token ? { token } : {}),
          ip: clientIp(c),
        })
        .catch(() => undefined);
    } catch {
      /* an unbound seam drops the event — the page still renders */
    }
  };

  // ACT.1 — the claims fold for a marketing render: `trial.firstReviewIncluded` resolves per the
  // page's AUDIENCE (`trial.audience` in pricing.json). A signed-in JOURNEY.1 test tenant can PREVIEW
  // the gated claim with `?audience=test` (`/session`'s `isTest` answers); everyone else — anonymous,
  // real-user, non-test — renders the audience-disabled form. The everyone-flip stays the operator's.
  const audienceClaims = async (c: Context): Promise<{ claims?: PublicClaimsConfig; isTest: boolean }> => {
    const session = deps.session(c);
    const principal = session
      ? await Promise.resolve()
          .then(() => deps.dataSource.getSessionPrincipal?.(session))
          .catch(() => null)
      : null;
    const isTest = principal?.isTest === true;
    return { claims: claimsForAudience(deps.claims, isTest), isTest };
  };

  // P1.17 (§15.1) — `/` is the public landing: the twelve sections in the v0.3 order, the drop-zone
  // hero, the sample dossier. A signed-in viewer still goes straight to /app — except the flagged
  // test tenant asking for the `?audience=test` preview (the gated-claim render Stage B verifies).
  app.get("/", async (c) => {
    const { claims, isTest } = await audienceClaims(c);
    const preview = c.req.query("audience") === "test" && isTest;
    if (!preview && (await signedIn(c))) return c.redirect("/app");
    landingBeacon("landing.viewed", c, c.req.query("src") ? { src: c.req.query("src") } : undefined);
    return c.html(renderDocument(c.req.path, landingElement, { invite: { signupOpen }, claims }, { origin: new URL(c.req.url).origin }));
  });

  // P1.17 (§15.2) — /pricing: the derived page model (the annual toggle re-renders prices and shows
  // the 15% saving in dollars — REQ-GROWTH-8).
  app.get("/pricing", async (c) => {
    const { claims, isTest } = await audienceClaims(c);
    if (!(c.req.query("audience") === "test" && isTest) && (await signedIn(c))) return c.redirect("/app");
    return c.html(
      renderDocument(
        c.req.path,
        pricingElement,
        {
          pricing: { annual: c.req.query("cycle") === "annual" },
          claims,
        },
        { origin: new URL(c.req.url).origin },
      ),
    );
  });

  // P1.17 (§15.3) — /signup: the intent-carrying admission form. `?intent=review` (the drop-zone
  // route) maps to entry `draft`; `?entry=` carries the chosen first step; `?held=1` marks a
  // client-side file hold; `?src=` is the acquisition label. Google or magic link — same admission
  // seam as /login's POST (invite mode still requires a code; open mode never does).
  const SIGNUP_ENTRIES = new Set(["scratch", "outline", "draft"] as const);
  const signupEntryFrom = (raw: string | undefined, intent: string | undefined) => {
    if (raw === "scratch" || raw === "outline" || raw === "draft") return raw;
    if (intent === "review") return "draft" as const;
    return undefined;
  };
  const renderSignup = (
    c: Context,
    signup: NonNullable<PageData["signup"]>,
    status: 200 | 400 | 429 = 200,
  ) =>
    c.html(
      renderDocument(
        c.req.path,
        signupElement,
        { signup: { ...signup, signupOpen } },
        { origin: new URL(c.req.url).origin },
      ),
      status,
    );

  app.get("/signup", async (c) => {
    if (await signedIn(c)) return c.redirect("/app");
    return renderSignup(c, {
      entry: signupEntryFrom(c.req.query("entry"), c.req.query("intent")),
      src: c.req.query("src") ?? undefined,
      held: c.req.query("held") === "1",
    });
  });

  app.post("/signup", async (c) => {
    const form = await c.req.parseBody();
    const code = typeof form.code === "string" ? form.code : "";
    const email = typeof form.email === "string" ? form.email : "";
    const method = typeof form.method === "string" ? form.method : "magic_link";
    const entry = SIGNUP_ENTRIES.has(form.entry as "scratch")
      ? (form.entry as "scratch" | "outline" | "draft")
      : undefined;
    const src = typeof form.src === "string" && form.src.length <= 80 ? form.src : undefined;
    const held = form.held === "1";

    // invite mode: no code ⇒ no auth request is ever made (the PRB.01 gate, preserved verbatim).
    if (!signupOpen && !code.trim()) {
      return renderSignup(c, { error: COPY.login.errorRequired, code, email, entry, src, held }, 400);
    }
    if (method === "magic_link") {
      if (!email.trim()) {
        return renderSignup(
          c,
          { error: signupOpen ? COPY.login.emailRequiredSelfServe : COPY.login.errorEmailRequired, code, email, entry, src, held },
          400,
        );
      }
      // SEC.2 — the send throttle lives at the api now (the shared store; a direct /api/auth caller
      // can't bypass it). The api's `rate_limited` refusal renders the same 429 page here.
      let res: Awaited<ReturnType<DataSource["signup"]>> | null;
      try {
        res = await deps.dataSource.signup({
          email,
          ...(code.trim() ? { code } : {}),
          method,
          clientIp: clientIp(c), // the resolved browser IP — stamped web→api per ADR-040
          ...(entry || src || held
            ? { intent: { ...(entry ? { entry } : {}), ...(src ? { src } : {}), ...(held ? { held: true } : {}) } }
            : {}),
        });
      } catch {
        res = null;
      }
      if (!res) {
        return renderSignup(c, { error: COPY.login.errorSignupUnavailable, code, email, entry, src, held }, 400);
      }
      if (!res.ok) {
        return renderSignup(
          c,
          { error: signupErrorFor(res.error, signupOpen), code, email, entry, src, held },
          res.status === 429 ? 429 : 400,
        );
      }
    } else if (!signupOpen || code.trim()) {
      const check = await deps.dataSource.checkInvite(code, undefined);
      if (!check.ok) {
        return renderSignup(c, { error: loginErrorFor(check.reason), code, email, entry, src, held }, 400);
      }
    }

    // The funnel intent rides the post-auth landing (the OAuth/magic-link callbackURL): /app reads
    // the ?entry&held&src query as its precedence fallback, and the held-file claim survives as a
    // marker (never bytes — the file itself stays in IndexedDB).
    const nextParams = new URLSearchParams();
    if (entry) nextParams.set("entry", entry);
    if (src) nextParams.set("src", src);
    if (held) nextParams.set("held", "1");
    const nextQuery = nextParams.toString();
    const outcome = await beginAuth(
      method,
      { code, email: email || undefined, next: nextQuery ? `/app?${nextQuery}` : "/app" },
      c,
    );
    if (outcome.error) {
      // SEC.2 — the api's send-throttle refusal (or a transient auth failure) renders the same copy the
      // retired web-side limiter did; a false "sent" page must never appear.
      return renderSignup(
        c,
        { error: signupErrorFor(outcome.error, signupOpen), code, email, entry, src, held },
        outcome.error === "rate_limited" ? 429 : 400,
      );
    }
    if (outcome.redirect) {
      const target = oauthRedirectTarget(outcome.redirect, (m) => console.error(m));
      if (!target) {
        return renderSignup(
          c,
          { error: signupErrorFor("auth_unavailable", signupOpen), code, email, entry, src, held },
          400,
        );
      }
      return c.redirect(target);
    }
    return renderSignup(c, { sent: true, email, entry, src, held }, 200);
  });

  // UX.1 — `/showcase` (manifest invariant 13): a SIGNED-IN viewer resolves to their own Showcase —
  // the api's session-bound GET /showcase names the project slug + dossier run, and the route 302s
  // onto the dossier (the showcase artifact) or the project page when no review run exists yet. A
  // signed-OUT visitor — or a signed-in account with no Showcase — gets the static, read-only sample
  // page; no other tenant's project can ever render here.
  app.get("/showcase", async (c) => {
    const session = deps.session(c);
    const authed = session ? await deps.dataSource.checkSession(session).catch(() => false) : false;
    if (session && authed) {
      const entry = await Promise.resolve()
        .then(() => deps.dataSource.getShowcaseEntry?.(session))
        .catch(() => undefined);
      const sc = entry?.showcase;
      if (sc) {
        return c.redirect(sc.reviewRunId ? `/p/${sc.slug}/review/${sc.reviewRunId}` : `/p/${sc.slug}`);
      }
      return c.html(renderDocument(c.req.path, showcaseSignedInElement, {}, { origin: new URL(c.req.url).origin }));
    }
    return c.html(renderDocument(c.req.path, showcaseElement, {}, { origin: new URL(c.req.url).origin }));
  });

  // R6LGL.1 (REQ-LCH-1) — the legal/trust documents (/terms, /privacy, /refunds,
  // /acceptable-use, /contact): public SSR like the rest of the funnel (REQ-BND-5), served to
  // signed-in readers too — a session never redirects away from a legal document. `LEGAL_PAGES`
  // is the census of record; each row's drafted text ships `approved: false` until HUMAN-H11.
  for (const legal of LEGAL_PAGES) {
    app.get(legal.routeId, (c) =>
      c.html(
        renderDocument(c.req.path, legalElements[legal.routeId], {}, { origin: new URL(c.req.url).origin }),
      ),
    );
  }

  // Public: sign in — invitation required in `invite` mode, optional in `open`. GET renders the form;
  // POST enforces the mode gate (REQ-BETA-19 amended).
  app.get("/login", async (c) => {
    if (await signedIn(c)) return c.redirect("/app");
    // SEC.2 — a magic-link verify / OAuth-callback refusal lands here as `?error=` (the api's
    // `errorCallbackURL` channel); surface the mapped copy instead of a bare form. 400 keeps the
    // refusal out of any cache-key equivalence with the clean form.
    const err = loginQueryErrorFor(c.req.query("error"), signupOpen);
    return c.html(
      renderDocument(
        c.req.path,
        loginElement,
        { login: { signupOpen, ...(err ? { error: err } : {}) } },
        { origin: new URL(c.req.url).origin },
      ),
      err ? 400 : 200,
    );
  });

  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const code = typeof form.code === "string" ? form.code : "";
    const email = typeof form.email === "string" ? form.email : "";
    const method = typeof form.method === "string" ? form.method : "magic_link";

    const renderLogin = (login: {
      error?: string;
      sent?: boolean;
      code?: string;
      email?: string;
    }, status: 200 | 400 | 429) =>
      // every re-render carries the mode flag — an error page must keep the open-mode copy.
      c.html(
        renderDocument(
          c.req.path,
          loginElement,
          { login: { ...login, signupOpen } },
          { origin: new URL(c.req.url).origin },
        ),
        status,
      );

    // invite mode: no code ⇒ no auth request is ever made (the PRB.01 gate, preserved verbatim).
    if (!signupOpen && !code.trim()) {
      return renderLogin({ error: COPY.login.errorRequired, code, email }, 400);
    }

    if (method === "magic_link") {
      // a magic link needs an email; Google resolves it via OAuth instead.
      if (!email.trim()) {
        return renderLogin(
          { error: signupOpen ? COPY.login.emailRequiredSelfServe : COPY.login.errorEmailRequired, code, email },
          400,
        );
      }
      // SEC.2 — the send throttle moved to the api (the shared store on /api/auth/sign-in/magic-link;
      // a direct caller can't bypass it). The api's `rate_limited` refusal renders the same 429 page.
      // Admission + provisioning is the api's `POST /signup` — invite mode requires a valid code there and
      // consumes it at creation; open mode treats the code as optional (still validated when supplied);
      // a returning account resolves `created:false` so a re-login with an exhausted code still sends.
      let res: Awaited<ReturnType<DataSource["signup"]>> | null;
      try {
        res = await deps.dataSource.signup({ email, ...(code.trim() ? { code } : {}), method, clientIp: clientIp(c) });
      } catch {
        res = null; // a transport/5xx failure is "unavailable", never a refusal
      }
      if (!res) {
        return renderLogin({ error: COPY.login.errorSignupUnavailable, code, email }, 400);
      }
      if (!res.ok) {
        return renderLogin(
          { error: signupErrorFor(res.error, signupOpen), code, email },
          res.status === 429 ? 429 : 400,
        );
      }
    } else if (!signupOpen || code.trim()) {
      // Google resolves the email via OAuth (unknown pre-auth), so admission — invite consume included —
      // runs post-OAuth at `user.create` in the live deploy (D-PRB.01-1). Here we only pre-gate the code:
      // required in invite mode; optional-but-validated in open mode.
      const check = await deps.dataSource.checkInvite(code, undefined);
      if (!check.ok) {
        return renderLogin({ error: loginErrorFor(check.reason), code, email }, 400);
      }
    }

    const outcome = await beginAuth(method, { code, email: email || undefined }, c);
    if (outcome.error) {
      // SEC.2 — the api's send-throttle refusal (or a transient auth failure) renders the same copy the
      // retired web-side limiter did; a false "sent" page must never appear.
      return renderLogin(
        { error: signupErrorFor(outcome.error, signupOpen), code, email },
        outcome.error === "rate_limited" ? 429 : 400,
      );
    }
    if (outcome.redirect) {
      const target = oauthRedirectTarget(outcome.redirect, (m) => console.error(m));
      if (!target) {
        return renderLogin({ error: COPY.login.errorSignupUnavailable, code, email }, 400);
      }
      return c.redirect(target);
    }
    return renderLogin({ sent: true, email }, 200);
  });

  app.post("/logout", async (c) => {
    await deps.endSession?.(c);
    return c.redirect("/");
  });

  // Auth-gated: the §5.2 workspace home (P1.04). The attention-grouped list (Needs you / Running /
  // Ready to read / Quiet-collapsed) or the alternate Voice grouping when the user's stored pref says
  // so; the Voice filter chips narrow both; `?q=` swaps the groups for the server-side search hits;
  // `?archived=1` adds the archived rows under the affordance. Every row's state arrives derived —
  // the api assembles it from the row sets through `projectState`; this route only maps → groups.
  app.get("/app", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // P1.17 (§3.5) — the verification return: a `?verified=1` landing emits `email.verified` once
    // (the acquisition mint binds the identity; the api dedupes the same user re-arriving).
    if (c.req.query("verified") === "1") {
      try {
        void deps.dataSource
          .postAcquisitionEvent?.(session, { event: "email.verified", props: { trigger: "magic_link" } })
          .catch(() => undefined);
      } catch {
        /* telemetry is never fatal */
      }
    }
    // ---- P1.17 (§15.3) — the first-five-minutes precedence, run BEFORE the list renders ----
    // The Showcase opens first ONLY while it is the workspace's unopened only child; a user who
    // arrived carrying a file (entry draft/outline) wins instead — their file path lands first and
    // the Showcase waits as the list's second row. An archived or already-opened Showcase is just a
    // row. (Showcase rows are excluded from the count — the seed is not "the user's own work".)
    const rows = await deps.dataSource.listProjects(session);
    const showcaseRows = rows.filter((r) => r.showcase === true);
    const ownRows = rows.filter((r) => r.showcase !== true);
    if (ownRows.length === 0 && showcaseRows.length > 0) {
      const entry = await Promise.resolve()
        .then(() => deps.dataSource.getShowcaseEntry?.(session))
        .catch(() => undefined);
      const showcase = entry?.showcase;
      // The auth redirect may carry the intent verbatim (?entry=&held=1) when the api-side intent
      // write raced or the deploy skipped it — the query is the fallback source.
      const queryEntry = c.req.query("entry");
      const intentEntry =
        entry?.intent?.entry ??
        (queryEntry === "draft" || queryEntry === "outline" || queryEntry === "scratch" ? queryEntry : undefined);
      // The drop-zone hold marker survives the magic-link leg as intent.held (a flag, never bytes) —
      // the OAuth redirect's ?held=1 is the fallback for deploys that skipped the intent write.
      const heldQuery = entry?.intent?.held === true || c.req.query("held") === "1" ? "&held=1" : "";
      if (intentEntry === "draft" || intentEntry === "outline") {
        // the carried-file precedence (§15.3 rule: the dropped file wins).
        return c.redirect(`/app/new?entry=${intentEntry}${heldQuery}`);
      }
      if (showcase && !showcase.opened && !showcase.archived) {
        const anchor = showcase.firstFindingId ? `#finding-${showcase.firstFindingId}` : "";
        return c.redirect(`/p/${showcase.slug}/review/${showcase.reviewRunId}${anchor}`);
      }
    }

    // SPA.27 — sole renderer: the shell (the SSR list is deleted; the leaf composes the same
    // grouping/filter/search state off the /bff twins). The precedence redirects above still run
    // first — a server-owned redirect wins over any renderer.
    return spaShellDocument(c, deps, session);
  });

  // P1.04 — the Group-by select persists the per-user pref (PUT /settings/project-grouping) then
  // returns to the home (filter/search query params are dropped — grouping is the whole-page mode).
  app.post("/app/grouping", async (c) => {
    const session = deps.session(c);
    // SPA.15 — the `wantsJson` split (REQ-BFF-1/2/3): a JSON caller posts `{groupBy}` and gets the
    // `{ok:true, redirect:"/app"}` envelope (the 302's target verbatim — grouping drops the live
    // filters, same as the form post); the form post's 302 is unchanged.
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const groupBy = form.groupBy === "voice" ? "voice" : "attention";
    await Promise.resolve()
      .then(() => deps.dataSource.setProjectGrouping(session, groupBy))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: "/app" });
  });

  // ---- P1.04 — the §5.3 new-project sheet: exactly three entries (scratch / outline / draft) ----

  const NEW_PROJECT_ENTRIES = new Set(["scratch", "outline", "draft"] as const);
  type NewProjectEntry = "scratch" | "outline" | "draft";

  /** The sheet's submitted picker fields — carried through preview/poll/create as hidden inputs. */
  const newProjectForm = (form: Record<string, unknown>) => {
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string).trim() : "");
    const sv = Number(str("startVersion"));
    return {
      title: str("title"),
      protocolId: str("protocolId") || null,
      venue: str("venue") || null,
      personaId: str("personaId") || null,
      startVersion: Number.isInteger(sv) && sv >= 1 ? sv : null,
      // ONB.1 — the held draft's client-side token, echoed back on the create redirect (`?hc=`):
      // the island deletes the IndexedDB hold ONLY when the echoed token matches its record.
      heldToken: str("heldToken") || null,
    };
  };

  /** The pending preview's poll URL — the form fields ride the query so a refresh round-trips them. */
  const newProjectPollUrl = (
    entry: NewProjectEntry,
    quarantineKey: string,
    form: ReturnType<typeof newProjectForm>,
    sourceLabel?: string,
  ): string => {
    const p = new URLSearchParams({ entry, qk: quarantineKey, title: form.title });
    if (form.protocolId) p.set("protocolId", form.protocolId);
    if (form.venue) p.set("venue", form.venue);
    if (form.personaId) p.set("personaId", form.personaId);
    if (form.startVersion != null) p.set("startVersion", String(form.startVersion));
    if (form.heldToken) p.set("heldToken", form.heldToken);
    if (sourceLabel) p.set("src", sourceLabel);
    return `/app/new/preview?${p.toString()}`;
  };

  app.get("/app/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR sheet is deleted; the leaf composes the entry /
    // held-hold / picker state off the /bff twin).
    return spaShellDocument(c, deps, session);
  });

  // The sheet's submit: scratch creates immediately; the upload entries run the workspace-scoped
  // conversion preview FIRST (§5.3's make-or-break moment — nothing is created until the user sees
  // source-beside-converted and clicks Create). SPA.14 — the `wantsJson` split (REQ-BFF-1/2/3/15/16):
  // a JSON caller carries `quarantineKey`+`fileName` (the browser's presign→direct-PUT leg already
  // landed the bytes — the BFF never proxies them) or `paste`; refusals answer the stable
  // `{error,detail}` the document's inline re-render would paint; `pending` answers the
  // `{ok,pending:{pollAfterSeconds},redirect:<poll-url>}` contract (the leaf navigates to the
  // preview leg; the twin's `refetchInterval` re-asks at the SAME server-owned cadence the SSR
  // meta-refresh keeps); `ready` answers the §5.3 payload inline (the leaf renders it on the sheet —
  // the document's own POST-time preview is non-addressable state too).
  app.post("/app/new", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const json = wantsJson(c);
    const form = await bodyFields(c);
    const entryQ = typeof form.entry === "string" ? form.entry : "";
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "scratch";
    const picks = newProjectForm(form);
    // SPA.27 — the SSR sheet is deleted: form-mode validation/upstream failures land back on the
    // sheet URL (the leaf holds its own field state) instead of an inline re-render.
    if (entry === "scratch") {
      if (!picks.title) {
        if (json) return c.json({ error: "title_required", detail: COPY.newProject.titleRequired }, 400);
        return c.redirect(`/app/new?entry=${entry}`);
      }
      let created;
      try {
        created = await deps.dataSource.createProject(session, {
          title: picks.title, entry, protocolId: picks.protocolId, venue: picks.venue, personaId: picks.personaId,
        });
      } catch (e) {
        if (json) return bffFail(c, e, { msg: "new_project_create_failed" });
        return c.redirect(`/app/new?entry=${entry}`);
      }
      return mutationOutcome(c, { redirect: `/p/${created.slug}?created=scratch` });
    }
    // Upload entries — presign → quarantine PUT → convert → the preview leg (the PRB.20 path,
    // workspace-scoped: no project exists yet). A JSON caller replays `quarantineKey`/`qk` (the
    // browser PUT already landed) or `paste` — never bytes.
    const file = form.file;
    const bytes =
      file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0
        ? new Uint8Array(await (file as File).arrayBuffer())
        : undefined;
    const fileName =
      (bytes && file && typeof file === "object" ? (file as File).name : undefined) ??
      (typeof form.fileName === "string" && form.fileName !== "" ? form.fileName : undefined);
    const quarantineKey =
      (typeof form.qk === "string" && form.qk !== "" ? form.qk : undefined) ??
      (typeof form.quarantineKey === "string" && form.quarantineKey !== "" ? form.quarantineKey : undefined);
    const paste = typeof form.paste === "string" ? form.paste : "";
    if (!bytes && !paste.trim() && !quarantineKey) {
      if (json) return c.json({ error: "source_required", detail: COPY.newProject.uploadOrPasteRequired }, 400);
      return c.redirect(`/app/new?entry=${entry}`);
    }
    const sourceLabel = fileName ?? (quarantineKey ? "the upload" : "pasted text");
    const raw = await Promise.resolve()
      .then(() =>
        deps.dataSource.previewWorkspaceImport(session, {
          ...(bytes
            ? { bytes, ...(fileName ? { fileName } : {}) }
            : quarantineKey
              ? { quarantineKey, ...(fileName ? { fileName } : {}) }
              : { text: paste }),
        }),
      )
      .catch((e: unknown) => e);
    const out =
      raw && typeof raw === "object" && "status" in raw ? (raw as ImportPreviewOutcome) : null;
    if (!out) {
      // the preview seam missing/failed — the JSON caller gets the api's refusal at its preserved
      // status (or the 502 the swallowed failure degrades to); a form post lands back on the
      // sheet, nothing created.
      if (json) {
        if (raw instanceof ApiError) return bffFail(c, raw, { msg: "new_project_preview_failed" });
        return c.json({ error: "conversion_start_failed", detail: COPY.newProject.conversionStartFailed }, 502);
      }
      return c.redirect(`/app/new?entry=${entry}`);
    }
    // ONB.1 — the title default chain: an explicitly typed title wins; then the document's own
    // leading H1 (`preview.title`); then the filename stem. Paste has no default — still required.
    const resolvedTitle =
      picks.title ||
      (out.status === "ready" ? out.preview.title : undefined) ||
      (fileName ? fileName.replace(/\.[^.]+$/, "").trim() : "");
    if (out.status === "pending") {
      // the title default resolves on the READY hop (the poll GET re-runs it with preview.title).
      const pollUrl = newProjectPollUrl(entry, out.quarantineKey, picks, sourceLabel);
      if (json) {
        return c.json({
          ok: true,
          pending: { pollAfterSeconds: IMPORT_PREVIEW_POLL_SECONDS },
          redirect: pollUrl,
        });
      }
      // SPA.27 — the meta-refresh document is deleted: a form post follows the SAME poll URL the
      // JSON envelope carries (the leaf's refetchInterval keeps the server-owned cadence).
      return c.redirect(pollUrl);
    }
    if (!resolvedTitle) {
      if (json) return c.json({ error: "title_required", detail: COPY.newProject.titleRequired }, 400);
      return c.redirect(`/app/new?entry=${entry}`);
    }
    const preview = {
      quarantineKey: out.quarantineKey,
      sourceLabel,
      sourceText: paste || (bytes ? `(${bytes.byteLength} bytes)` : ""),
      convertedMarkdown: out.preview.markdown,
      countLine: countLine(out.preview.counts),
      warnings: out.preview.warnings.map((w) => ({ message: w.message, blockId: w.anchor?.blockId ?? null })),
    };
    if (json) {
      // The ready preview the document renders on the POST — the leaf paints it in place.
      return c.json({ ok: true, data: { form: { ...picks, title: resolvedTitle }, preview } });
    }
    // SPA.27 — the SSR preview leg is deleted: the poll URL round-trips the picks + key so the
    // preview leaf recomposes the ready card off the /bff twin.
    return c.redirect(newProjectPollUrl(entry, out.quarantineKey, { ...picks, title: resolvedTitle }, sourceLabel));
  });

  // PRB.21-style poll leg for the new-project preview (meta-refresh target): re-preview the SAME
  // quarantine key — a warm read-back answers in ~190 ms; cold re-answers pending inside the bound.
  app.get("/app/new/preview", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const entryQ = c.req.query("entry") ?? "draft";
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "draft";
    const qk = c.req.query("qk");
    if (!qk) return c.redirect(`/app/new?entry=${entry}`);
    // SPA.27 — sole renderer: the shell (the pending/ready SSR legs are deleted; the leaf's twin
    // re-asks the quarantine key at the server-owned cadence and recomposes both states).
    return spaShellDocument(c, deps, session);
  });

  // The preview's Create (and Fix-now) — replays the quarantine key + the pick fields; the api adopts
  // the ALREADY-converted object (never a second upload or a second Job). SPA.14 — `wantsJson`: the
  // JSON caller gets the SAME redirect target in the `{ok,redirect}` envelope (the `?created=&cn=&cu=
  // &hc=` vocabulary verbatim); a still-converting key is the pending contract, never an error.
  app.post("/app/new/create", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const json = wantsJson(c);
    const form = await bodyFields(c);
    const entryQ = typeof form.entry === "string" ? form.entry : "";
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "draft";
    const picks = newProjectForm(form);
    const qk = typeof form.qk === "string" ? form.qk : "";
    let created;
    try {
      created = await deps.dataSource.createProject(session, {
        title: picks.title,
        entry,
        protocolId: picks.protocolId,
        venue: picks.venue,
        personaId: picks.personaId,
        ...(picks.startVersion != null ? { startVersion: picks.startVersion } : {}),
        quarantineKey: qk,
      });
    } catch (e) {
      // A still-converting key (a stale preview page or a slow Job) drops back to the converting
      // state — its poll finishes the preview, no bytes re-uploaded.
      if (e instanceof ApiError && e.status === 409 && e.code === "conversion_pending") {
        const pollUrl = newProjectPollUrl(entry, qk, picks);
        if (json) {
          return c.json({
            ok: true,
            pending: { pollAfterSeconds: IMPORT_PREVIEW_POLL_SECONDS },
            redirect: pollUrl,
          });
        }
        // SPA.27 — the meta-refresh document is deleted: follow the poll URL (the leaf's
        // refetchInterval keeps the cadence).
        return c.redirect(pollUrl);
      }
      if (json) return bffFail(c, e, { msg: "new_project_create_failed" });
      // SPA.27 — the SSR sheet is deleted: a form-mode create failure lands back on the sheet.
      return c.redirect(`/app/new?entry=${entry}`);
    }
    // §5.3's per-entry landing: the project opens with its next-step card (`?created=` drives it) and —
    // for an upload that left warnings — the Conversion-notes line. Fix-now lands on the Page at the
    // imported draft where the [unconverted] markers live.
    const q = new URLSearchParams({ created: entry });
    if (created.conversionNotes) {
      q.set("cn", String(created.conversionNotes.warnings));
      q.set("cu", String(created.conversionNotes.unconverted));
    }
    // ONB.1 — the held-draft consumed handshake: the token the island stamped into the form echoes on
    // the success redirect. The landing island on the landing page renders `data-held-consumed` —
    // a hold is deleted ONLY when the echoed token matches its record (server-confirmed consumption).
    if (picks.heldToken) q.set("hc", picks.heldToken);
    const action = typeof form.action === "string" ? form.action : "create";
    if (action === "fix_now" && entry === "draft" && created.draftN != null) {
      return mutationOutcome(c, { redirect: `/p/${created.slug}/v/${created.draftN}?${q.toString()}` });
    }
    return mutationOutcome(c, { redirect: `/p/${created.slug}?${q.toString()}` });
  });

  // ---- P1.04 — the row actions (§5.2's "…" menu): the web POSTs resolve slug → id then call the
  // api through the data source. Slugs never change on rename; duplicate lands on the copy. ----

  /** Resolve the session-scoped project row for a slug (list rows are already tenant-scoped). */
  const projectRowFor = async (session: SessionHeaders, slug: string) =>
    (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug) ?? null;

  app.post("/p/:project/rename", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = await projectRowFor(session, slug);
    if (!row) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const form = await c.req.parseBody();
    const title = typeof form.title === "string" ? form.title.trim() : "";
    if (title) {
      await Promise.resolve()
        .then(() => deps.dataSource.renameProject(session, row.id, title))
        .catch(() => undefined);
    }
    // SPA.23 — the overview's inline rename form is a leaf-intercepted write; a JSON caller gets
    // the envelope, the form post keeps the redirect.
    return mutationOutcome(c, { redirect: `/p/${slug}` });
  });

  app.post("/p/:project/duplicate", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = await projectRowFor(session, slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const copy = await Promise.resolve()
      .then(() => deps.dataSource.duplicateProject(session, row.id))
      .catch(() => null);
    // SPA.15 — the redirect's wording is verbatim (the copy's page, or the source row on a
    // swallowed write); a JSON caller receives it as the envelope's `redirect`, never a 302.
    return mutationOutcome(c, { redirect: copy ? `/p/${copy.slug}` : `/p/${slug}` });
  });

  for (const [suffix, call] of [
    ["archive", (ds: DataSource, s: SessionHeaders, id: string) => ds.archiveProject(s, id)],
    ["unarchive", (ds: DataSource, s: SessionHeaders, id: string) => ds.unarchiveProject(s, id)],
    ["delete", (ds: DataSource, s: SessionHeaders, id: string) => ds.deleteProject(s, id)],
  ] as const) {
    app.post(`/p/:project/${suffix}`, async (c) => {
      const session = deps.session(c);
      // SPA.15 — the row actions' JSON branch (REQ-BFF-1/2/3): `{ok:true, redirect:"/app"}`; the
      // swallowed write stays swallowed (a refused action repaints truth on the list refetch).
      if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
      const slug = c.req.param("project");
      const row = await projectRowFor(session, slug);
      if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
      await Promise.resolve()
        .then(() => call(deps.dataSource, session, row.id))
        .catch(() => undefined);
      return mutationOutcome(c, { redirect: "/app" });
    });
  }

  // Restore resolves against the DELETED rows (the live list never carries them — §5.2's 30-day window).
  app.post("/p/:project/restore", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const deleted = await Promise.resolve()
      .then(() => deps.dataSource.listDeletedProjects?.(session) ?? [])
      .catch(() => []);
    const row = deleted.find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    await Promise.resolve()
      .then(() => deps.dataSource.restoreProject(session, row.id))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: "/app?deleted=1" });
  });

  // ---- P1.19 — the §5.11 Inbox (`/app/inbox`; REQ-IDE-2 amended): the global blocked-on-you →
  // unread → earlier → voices surface. The api's /inbox owns the ordering; the web page renders it
  // verbatim. The read POSTs collapse to the api's marks; deep links land on the focused surface. ----
  app.get("/app/inbox", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR inbox + its items/badge/gate-card reads are
    // deleted; the leaf composes the same feed off the /bff twins).
    return spaShellDocument(c, deps, session);
  });
  // A row's "Mark read" — no-JS friendly (plain form POST → redirect back to the Inbox). SPA.11:
  // the `wantsJson` branch (REQ-BFF-1/2) — a JSON caller posts `{item}` and gets the `{ok:true,
  // redirect:"/app/inbox"}` envelope, never a 302; the form post's 302 is verbatim.
  app.post("/app/inbox/read", async (c) => {
    const session = deps.session(c);
    // A JSON caller never rides the /login document redirect — the BFF convention answers 401.
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const raw = wantsJson(c)
      ? ((await c.req.json().catch(() => null)) as { item?: unknown } | null)?.item
      : (await c.req.parseBody()).item;
    const item = typeof raw === "string" ? raw : "";
    if (item) {
      await Promise.resolve()
        .then(() => deps.dataSource.markInboxItemRead?.(session, item))
        .catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: "/app/inbox" });
  });
  app.post("/app/inbox/read-all", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    await Promise.resolve()
      .then(() => deps.dataSource.markInboxAllRead?.(session))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: "/app/inbox" });
  });

  // ---- P1.20 — the §14.7 settings tree (`/app/settings/:section`; §4.2). The beta's `/settings`
  // migrated — legacy paths 302 onto the tree; the REQ-PROD-15 toggle lives in Data now. ----

  // Legacy path migrations — session first (an anonymous hit still bounces to /login), then the
  // canonical section keeps the flash params.
  app.get("/settings", async (c) => {
    if (!deps.session(c)) return c.redirect("/login");
    return c.redirect("/app/settings/account", 302);
  });
  app.get("/app/settings", async (c) => {
    if (!deps.session(c)) return c.redirect("/login");
    return c.redirect("/app/settings/account", 302);
  });

  // ---- Account ----
  app.get("/app/settings/account", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // A magic-link email-change lands here (?confirmEmail=<token>) — consume it server-side, then
    // bounce to the section with the outcome flash.
    const confirmToken = c.req.query("confirmEmail");
    if (confirmToken) {
      const out = await Promise.resolve()
        .then(() => deps.dataSource.confirmEmailChange?.(session, confirmToken))
        .catch(() => undefined);
      const ok = out != null && "ok" in out && out.ok === true;
      return c.redirect(`/app/settings/account?notice=${ok ? "email-confirmed" : "email-confirm-failed"}`);
    }
    // SPA.27 — sole renderer: the shell (after the confirmEmail consume+redirect so a token
    // round-trip never lands in the shell; `?saved`/`?notice` stay URL flash state).
    return spaShellDocument(c, deps, session);
  });
  // SPA.12 — the `wantsJson` split (REQ-BFF-1/2/3): JSON callers post the same flat field
  // vocabulary and get the `{ok:true, redirect}` envelope (the redirect IS the flash URL the
  // 302 would carry); form posts keep the 302 verbatim. No session → JSON callers get
  // `{error:"unauthenticated"}` 401, form callers keep the /login bounce.
  app.post("/app/settings/account", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const req: { name?: string; byline?: string | null; image?: string | null } = {};
    if (typeof form.name === "string" && form.name.trim() !== "") req.name = form.name.trim();
    if (typeof form.byline === "string") req.byline = form.byline.trim() === "" ? null : form.byline.trim();
    if (typeof form.image === "string") req.image = form.image.trim() === "" ? null : form.image.trim();
    await Promise.resolve()
      .then(() => deps.dataSource.updateAccountSettings?.(session, req))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: "/app/settings/account?saved=1" });
  });
  app.post("/app/settings/account/email", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const email = typeof form.email === "string" ? form.email : "";
    const out = await Promise.resolve()
      .then(() => deps.dataSource.requestEmailChange?.(session, email))
      .catch(() => undefined);
    const ok = out != null && "ok" in out && out.ok === true;
    return mutationOutcome(c, { redirect: `/app/settings/account?notice=${ok ? "email-pending" : "email-invalid"}` });
  });
  app.post("/app/settings/sessions/revoke", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const sessionId = typeof form.sessionId === "string" ? form.sessionId : "";
    if (sessionId) {
      await Promise.resolve()
        .then(() => deps.dataSource.revokeSession?.(session, sessionId))
        .catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: "/app/settings/account?saved=1" });
  });

  // ---- REQ-ACCT-4 — delete account: typed confirmation → the 14-day grace; cancel inside it. ----
  app.post("/app/settings/account/delete", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const confirmation = typeof form.confirmation === "string" ? form.confirmation : "";
    const out = await Promise.resolve()
      .then(() => deps.dataSource.requestAccountDeletion?.(session, confirmation))
      .catch(() => undefined);
    const ok = out != null && "ok" in out && out.ok === true;
    return mutationOutcome(c, { redirect: `/app/settings/data?notice=${ok ? "deletion-scheduled" : "confirmation-required"}` });
  });
  app.post("/app/settings/account/delete/cancel", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const out = await Promise.resolve()
      .then(() => deps.dataSource.cancelAccountDeletion?.(session))
      .catch(() => undefined);
    const ok = out != null && "ok" in out && out.ok === true;
    return mutationOutcome(c, { redirect: `/app/settings/data?notice=${ok ? "deletion-cancelled" : "cancel-failed"}` });
  });

  // ---- Preferences ----
  app.get("/app/settings/preferences", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell.
    return spaShellDocument(c, deps, session);
  });
  // One form posts every account default — "" selects unset the key (the api treats null as delete),
  // the consent threshold clamps at 1,000 (REQ-BILL-4), the theme write rides P1.01's endpoint.
  app.post("/app/settings/preferences", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const prefs: Record<string, unknown> = {};
    const tier = form.defaultModelTier;
    prefs.defaultModelTier = tier === "base" || tier === "balanced" || tier === "frontier" ? tier : null;
    const rigor = form.defaultRigor;
    prefs.defaultRigor = rigor === "quick" || rigor === "standard" || rigor === "full_board" ? rigor : null;
    const rigorByWorkflow: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      if (!k.startsWith("rigor_") || k === "rigor_default") continue;
      const wf = k.slice("rigor_".length);
      // UX.1 — only LAUNCHED workflows may carry an override: the api 422s an unlaunched key, so a
      // crafted form field would poison the whole save. Drop it here (same shape as the enum
      // fallbacks below — unknown input resolves to nothing, never a lie).
      if (!isLaunchedWorkflow(wf)) continue;
      rigorByWorkflow[wf] = v === "quick" || v === "standard" || v === "full_board" ? v : null;
    }
    prefs.rigorByWorkflow = rigorByWorkflow;
    const policy = form.approvalPolicy;
    prefs.approvalPolicy =
      policy === "named" || policy === "wait_each" || policy === "run_to_completion" ? policy : null;
    const editor: Record<string, unknown> = {};
    const paperTheme = form.paperTheme;
    editor.paperTheme = paperTheme === "light" || paperTheme === "follow" || paperTheme === "dark" ? paperTheme : null;
    const fontPreset = form.fontPreset;
    editor.fontPreset = fontPreset === "serif" || fontPreset === "sans" || fontPreset === "mono" ? fontPreset : null;
    const step = Number(form.fontSizeStep);
    editor.fontSizeStep = form.fontSizeStep !== "" && Number.isInteger(step) && step >= -2 && step <= 2 ? step : null;
    prefs.editor = editor;
    const consent = Math.max(0, Math.min(1000, Math.trunc(Number(form.consentUnder) || 0)));
    const appTheme = form.appTheme;
    await Promise.all([
      Promise.resolve().then(() => deps.dataSource.updatePreferences?.(session, prefs)),
      Promise.resolve().then(() => deps.dataSource.setConsentPref?.(session, consent)),
      appTheme === "dark" || appTheme === "light" || appTheme === "auto"
        ? Promise.resolve().then(() => deps.dataSource.setTheme?.(session, appTheme))
        : Promise.resolve(),
    ]).catch(() => undefined);
    return mutationOutcome(c, { redirect: "/app/settings/preferences?saved=1" });
  });

  // ---- Notifications (P1.19's server-side store; the api rejects the non-configurable rows) ----
  app.get("/app/settings/notifications", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell.
    return spaShellDocument(c, deps, session);
  });
  app.post("/app/settings/notifications", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const email: Record<string, boolean> = {};
    const inApp: Record<string, boolean> = {};
    const project: Record<string, { run_progress?: boolean }> = {};
    for (const [k, v] of Object.entries(form)) {
      if (typeof v !== "string") continue;
      if (k.startsWith("email_")) email[k.slice(6)] = v === "on" || v === "digest";
      else if (k.startsWith("inapp_")) inApp[k.slice(6)] = v === "on";
      else if (k.startsWith("rp_")) project[k.slice(3)] = { run_progress: v === "on" };
    }
    // quiet hours — HH:MM UTC inputs; off ⇒ null.
    let quietHours: { startMinutesUtc: number; endMinutesUtc: number } | null | undefined;
    if (form.qh_enabled === "on") {
      const hm = (s: unknown) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(typeof s === "string" ? s : "");
        if (!m) return null;
        const mins = Number(m[1]) * 60 + Number(m[2]);
        return mins >= 0 && mins <= 1439 ? mins : null;
      };
      const start = hm(form.qh_start);
      const end = hm(form.qh_end);
      quietHours = start != null && end != null ? { startMinutesUtc: start, endMinutesUtc: end } : undefined;
    } else if (form.qh_enabled === "off") {
      quietHours = null;
    }
    // P1.19's api writes ONE per-project opt-in per call — the form posts every `rp_` select, so the
    // account matrix + digest + quiet hours ride the first write and each extra project goes
    // sequentially (concurrent read-modify-write merges could lose a row).
    const accountPatch = {
      email,
      inApp,
      digest: { run_finished: (form.digest_run_finished === "hourly" ? "hourly" : "off") as "hourly" | "off" },
      ...(quietHours !== undefined ? { quietHours } : {}),
    };
    const projectIds = Object.keys(project);
    const patches: Parameters<NonNullable<DataSource["updateNotificationPrefs"]>>[1][] =
      projectIds.length === 0
        ? [accountPatch]
        : projectIds.map((pid, i) => ({
            ...(i === 0 ? accountPatch : {}),
            project: { [pid]: project[pid]! },
          }));
    let ok = true;
    for (const patch of patches) {
      const out = await Promise.resolve()
        .then(() => deps.dataSource.updateNotificationPrefs?.(session, patch))
        .catch(() => undefined);
      if (!(out != null && "ok" in out && out.ok === true)) {
        ok = false;
        break;
      }
    }
    return mutationOutcome(c, { redirect: `/app/settings/notifications?${ok ? "saved=1" : "notice=rejected"}` });
  });

  // ---- Integrations (REQ-ACCT-2's uniform cards; disconnect drops the credential now) ----
  app.get("/app/settings/integrations", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell.
    return spaShellDocument(c, deps, session);
  });
  app.post("/app/settings/integrations/:id/disconnect", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    await Promise.resolve()
      .then(() => deps.dataSource.disconnectIntegration?.(session, c.req.param("id")))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: "/app/settings/integrations?saved=1" });
  });

  // ---- Data (Q-12 minimal): privacy toggles + support access + posture copy + export + delete ----
  app.get("/app/settings/data", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (`?notice`/`?p`/`?v`/`?f`/`?saved` stay URL flash state
    // the leaf maps).
    return spaShellDocument(c, deps, session);
  });
  // The REQ-PROD-15 toggle's new home — the checkbox posts "on" when EXCLUDE is checked.
  app.post("/app/settings/data/privacy", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    try {
      // Unswallowed verbatim (the document path 500s on a failed write) — but a JSON caller
      // always earns the {error} envelope at the preserved status, never an HTML 500.
      await deps.dataSource.setAnalyticsOptOut(session, form.analyticsOptOut === "on");
    } catch (e) {
      if (wantsJson(c)) return bffFail(c, e, { msg: "settings_privacy_write_failed" });
      throw e;
    }
    return mutationOutcome(c, { redirect: "/app/settings/data?saved=1" });
  });
  // REQ-VIS-11 — the 72-h support grant; revoke is a no-op-safe write either way.
  app.post("/app/settings/data/support-access", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    await Promise.resolve()
      .then(() => deps.dataSource.setSupportAccess?.(session, form.enabled === "on"))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: "/app/settings/data?saved=1" });
  });
  // Q-26 — the preference-learning toggle stores the opt-OUT (default-on ⇒ unchecked box = optOut).
  app.post("/app/settings/data/preference-learning", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    await Promise.resolve()
      .then(() => deps.dataSource.setPreferenceOptOut?.(session, form.learning !== "on"))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: "/app/settings/data?saved=1" });
  });
  // P1.18 — "Export everything" (REQ-ACCT-3): queue the account zip; the build + emailed link are
  // the worker's. A repeat click dedupes server-side (the same row answers).
  app.post("/app/settings/data/export", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    await deps.dataSource.requestAccountExport?.(session).catch(() => undefined);
    return mutationOutcome(c, { redirect: "/app/settings/data?notice=requested" });
  });
  // The in-app download of the ready zip — presigned through the api.
  app.get("/app/settings/data/export/download", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const id = c.req.query("id");
    const dl = await Promise.resolve()
      .then(() => deps.dataSource.getAccountExportDownloadUrl?.(session, id))
      .catch(() => null);
    if (!dl) return c.redirect("/app/settings/data?notice=expired");
    return c.redirect(dl.downloadUrl, 302);
  });
  // The restore half — upload an export zip; the api replays it idempotently. SPA.12: the
  // transport stays multipart forever (a file never enters a JSON body — REQ-BFF-17); a caller
  // that merely ACCEPTS json (the SPA posts FormData with accept: application/json) gets the
  // envelope's redirect instead of the 302 — the notice vocabulary lands verbatim either way.
  app.post("/app/settings/data/import", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await c.req.parseBody();
    const file = form.archive;
    const bytes =
      file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0
        ? new Uint8Array(await (file as File).arrayBuffer())
        : null;
    if (!bytes) return mutationOutcome(c, { redirect: "/app/settings/data?notice=importFailed" });
    try {
      if (!deps.dataSource.importAccountExport) return mutationOutcome(c, { redirect: "/app/settings/data?notice=importFailed" });
      const r = await deps.dataSource.importAccountExport(session, bytes);
      if (r.deduped) return mutationOutcome(c, { redirect: "/app/settings/data?notice=deduped" });
      return mutationOutcome(c, { redirect: `/app/settings/data?notice=imported&p=${r.projects}&v=${r.voices}&f=${r.files}` });
    } catch {
      return mutationOutcome(c, { redirect: "/app/settings/data?notice=importFailed" });
    }
  });

  // ---- legacy POSTs (the beta surface's old form targets) — keep working, land on the new tree ----
  // P1.01 — the app-theme control (the no-JS form counterpart of the IDE shell's theme menu; both write
  // "user".app_theme through the api). Now redirects to the Preferences section the control moved to.
  app.post("/settings/theme", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const appTheme = form.appTheme;
    if (appTheme === "dark" || appTheme === "light" || appTheme === "auto") {
      await deps.dataSource.setTheme(session, appTheme).catch(() => undefined);
    }
    return c.redirect("/app/settings/preferences?saved=1");
  });
  app.post("/settings/privacy", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    // The old checkbox posted "on" when sharing was ON — the flag it binds is the inverse (opt-OUT).
    // The canonical endpoint is /app/settings/data/privacy now; this legacy post keeps working.
    const optOut = form.analytics !== "on";
    await deps.dataSource.setAnalyticsOptOut(session, optOut);
    return c.redirect("/app/settings/data?saved=1");
  });

  // ---- P1.20 — `/p/:project/settings` (§4.2): the REQ-GENRE-2 safe fields + P1.09's approvals ----
  app.get("/p/:project/settings", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the leaf composes the settings + approvals read off the
    // /bff twin; `?saved`/`?notice` stay URL flash state).
    return spaShellDocument(c, deps, session);
  });
  // The safe-field patch (REQ-GENRE-2): "" selects mean "inherit the account default" (rigor/tier) or
  // "keep" (venue/protocol). A protocol change stamps the marker the next Review's scope card carries.
  app.post("/p/:project/settings", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await projectRows(c, deps.dataSource, session).catch(() => [])).find((r) => r.slug === slug);
    // A JSON caller never gets an HTML not-found — the {error} envelope at 404 is the twin's own
    // answer (REQ-BFF-4); the form leg keeps the notFoundElement document.
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const patch: ProjectSettingsPatch = {};
    if (typeof form.venue === "string") patch.venue = form.venue.trim() === "" ? null : form.venue.trim();
    if (typeof form.protocolId === "string" && form.protocolId !== "") patch.protocolId = form.protocolId;
    const rigor = form.rigorDefault;
    if (rigor === "quick" || rigor === "standard" || rigor === "full_board" || rigor === "") {
      patch.rigorDefault = rigor === "" ? null : rigor;
    }
    const tier = form.modelTierDefault;
    if (tier === "base" || tier === "balanced" || tier === "frontier" || tier === "") {
      patch.modelTierDefault = tier === "" ? null : tier;
    }
    const paperTheme = form.paperTheme;
    if (paperTheme === "light" || paperTheme === "follow" || paperTheme === "dark") patch.paperTheme = paperTheme;
    // protocol overrides — only when at least one override field arrived set/cleared.
    const ovLength = Number(form.ov_length);
    const stage = form.stage === "early" || form.stage === "near_final" ? form.stage : undefined;
    const phaseDefaults: Record<string, boolean> = {};
    let sawOverrideField = false;
    for (const [k, v] of Object.entries(form)) {
      if (!k.startsWith("pd_")) continue;
      sawOverrideField = true;
      const phase = k.slice(3);
      if (v === "on") phaseDefaults[phase] = true;
      else if (v === "off") phaseDefaults[phase] = false;
    }
    if (sawOverrideField || typeof form.ov_length === "string" || stage !== undefined) {
      const overrides: NonNullable<ProjectSettingsPatch["protocolOverrides"]> = {};
      if (typeof form.ov_length === "string" && form.ov_length !== "" && Number.isFinite(ovLength) && ovLength > 0) {
        overrides.length = Math.trunc(ovLength);
      }
      if (Object.keys(phaseDefaults).length > 0) overrides.phaseDefaults = phaseDefaults;
      if (stage !== undefined) overrides.stage = stage;
      // the form IS the whole override state — an all-defaults submit stores null (cleared), not "{}".
      patch.protocolOverrides = Object.keys(overrides).length > 0 ? overrides : null;
    }
    const out = await Promise.resolve()
      .then(() => deps.dataSource.updateProjectSettings?.(session, row.id, patch))
      .catch(() => undefined);
    const ok = out != null && "ok" in out && out.ok === true;
    return mutationOutcome(c, { redirect: `/p/${slug}/settings?${ok ? "saved=1" : "notice=invalid"}` });
  });
  // REQ-GATE-10's edit half — a standing rule's body/workflows update in place (retire stays a
  // separate row-level action; guidance never deletes).
  app.post("/p/:project/settings/guidance/:gid", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await projectRows(c, deps.dataSource, session).catch(() => [])).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const body = typeof form.body === "string" ? form.body.trim() : "";
    if (body !== "") {
      const workflows =
        typeof form.workflows === "string" && form.workflows.trim() !== ""
          ? form.workflows.split(",").map((w) => w.trim()).filter((w) => w !== "")
          : null;
      await Promise.resolve()
        .then(() => deps.dataSource.updateGuidance?.(session, row.id, c.req.param("gid"), { body, workflows }))
        .catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: `/p/${slug}/settings?saved=1` });
  });
  app.get("/usage", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR page + its usage/account reads are deleted; the
    // leaf composes the same level-0/1 facts off the /bff twins).
    return spaShellDocument(c, deps, session);
  });
  // REQ-BILL-11 — the level-1 CSV export, proxied with the viewer's session (the api is internal).
  app.get("/usage.csv", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const dl = await Promise.resolve()
      .then(() => deps.dataSource.downloadUsageCsv?.(session))
      .catch(() => undefined);
    if (!dl) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return new Response(dl.bytes, {
      status: 200,
      headers: {
        "content-type": dl.mediaType,
        "content-disposition": `attachment; filename="${dl.fileName}"`,
      },
    });
  });
  // §14.5 level 2 — the per-project usage rollup (/p/:project/usage).
  app.get("/p/:project/usage", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the leaf composes the level-2 rollup off the /bff twin;
    // a missing project is the client router's not-found).
    return spaShellDocument(c, deps, session);
  });

  // ---- P1.16 — billing, full (§14.2/14.3/14.6): the plan card, Checkout/portal/auto-reload POSTs,
  // the Team waitlist, and the checkout-return poll (REQ-BILL-14 — the ≤30 s webhook-lag window).
  // P1.20 — the section's canonical §4.2 path is /app/settings/billing; the beta's /settings/billing
  // stays mounted as the legacy alias (existing form posts + deep links keep working). ----
  const billingPageHandler = async (c: Context) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell — the shared handler covers BOTH mounts
    // (/app/settings/billing + the /settings/billing alias); `?saved`/`?notice` stay URL flash
    // state the leaf maps through `billingNoticeFor` verbatim.
    return spaShellDocument(c, deps, session);
  };
  app.get("/app/settings/billing", billingPageHandler);
  app.get("/settings/billing", billingPageHandler);
  // P1.20 — every billing POST mounts on the canonical path AND the beta alias; the redirect returns
  // to whichever surface posted (the Stripe returnTo follows the same base).
  const billingBase = (c: Context) => (c.req.path.startsWith("/app/") ? "/app/settings/billing" : "/settings/billing");
  const billingPost = (path: string, handler: (c: Context, base: string) => Promise<Response>) => {
    app.post(`/app/settings/billing/${path}`, (c) => handler(c, billingBase(c)));
    app.post(`/settings/billing/${path}`, (c) => handler(c, billingBase(c)));
  };
  // Subscribe / top-up — mint the Checkout session server-side and 302 to Stripe. BILL.3: the failure
  // carries the api's stable code through to the notice (a refused checkout is told apart from Stripe
  // being down) and the redirect target is validated against the Stripe-hosted allowlist before the
  // 302 is ever emitted — never a half-minted state, never a non-Stripe hand-off.
  billingPost("subscribe", async (c, base) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const tier = typeof form.tier === "string" ? form.tier : "";
    const cycle = form.cycle === "annual" ? "annual" : "monthly";
    let failure: string | null = null;
    const out = await Promise.resolve()
      .then(() => deps.dataSource.startCheckout?.(session, {
        kind: "subscribe", plan: tier, cycle, returnTo: base,
      }))
      .catch((e) => {
        failure = billingFailureCode(e, "checkout");
        console.error(`[web] billing subscribe failed: ${failure} (${e instanceof ApiError ? `api ${e.status}` : "no response"})`);
        return undefined;
      });
    if (!out?.url) return mutationOutcome(c, { redirect: `${base}?notice=${failure ?? "checkout"}` });
    const target = stripeRedirectTarget(out.url, (m) => console.error(m));
    if (!target) return mutationOutcome(c, { redirect: `${base}?notice=checkout` });
    // REQ-BFF-3/27 — the Stripe hand-off rides the `{url}` envelope for a JSON caller
    // (mutationOutcome re-validates at serialization); the form post keeps its 302 verbatim.
    return mutationOutcome(c, { url: target });
  });
  billingPost("topup", async (c, base) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const packId = typeof form.packId === "string" ? form.packId : "";
    let failure: string | null = null;
    const out = await Promise.resolve()
      .then(() => deps.dataSource.startCheckout?.(session, {
        kind: "topup", packId, returnTo: base,
      }))
      .catch((e) => {
        failure = billingFailureCode(e, "checkout");
        console.error(`[web] billing topup failed: ${failure} (${e instanceof ApiError ? `api ${e.status}` : "no response"})`);
        return undefined;
      });
    if (!out?.url) return mutationOutcome(c, { redirect: `${base}?notice=${failure ?? "checkout"}` });
    const target = stripeRedirectTarget(out.url, (m) => console.error(m));
    if (!target) return mutationOutcome(c, { redirect: `${base}?notice=checkout` });
    return mutationOutcome(c, { url: target });
  });
  // Plan change — an upgrade applies now, a downgrade schedules to period end (§14.2/14.6).
  billingPost("change-plan", async (c, base) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const tier = typeof form.tier === "string" ? form.tier : "";
    const cycle = form.cycle === "annual" ? "annual" as const : "monthly" as const;
    const out = await Promise.resolve()
      .then(() => deps.dataSource.changePlan?.(session, tier, cycle))
      .catch(() => undefined);
    if (!out || "error" in out) return mutationOutcome(c, { redirect: `${base}?notice=change` });
    return mutationOutcome(c, { redirect: `${base}?saved=1` });
  });
  // Cancel = cancel_at_period_end — access runs to the paid-through date (§14.6).
  billingPost("cancel", async (c, base) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const out = await Promise.resolve()
      .then(() => deps.dataSource.cancelSubscription?.(session))
      .catch(() => undefined);
    if (!out?.applied) return mutationOutcome(c, { redirect: `${base}?notice=cancel` });
    return mutationOutcome(c, { redirect: `${base}?saved=1` });
  });
  // Auto-reload — the opt-in, user-capped, only unattended charge path (REQ-BILL-17).
  billingPost("auto-reload", async (c, base) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    // BILL.3 — opt-IN is a purchase-path write (it schedules an unattended charge): keep the api's
    // `purchase_closed` class so the notice is the paused copy, not a generic "didn't save".
    let failure: string | null = null;
    const out = await Promise.resolve()
      .then(() => deps.dataSource.setAutoReload?.(session, {
        enabled: form.enabled === "1",
        ...(typeof form.thresholdCredits === "string" && Number(form.thresholdCredits) > 0
          ? { thresholdCredits: Number(form.thresholdCredits) } : {}),
        ...(typeof form.packId === "string" && form.packId ? { packId: form.packId } : {}),
        ...(typeof form.monthlyCapUsd === "string" && Number(form.monthlyCapUsd) > 0
          ? { monthlyCapUsd: Number(form.monthlyCapUsd) } : {}),
      }))
      .catch((e) => {
        failure = billingFailureCode(e, "autoreload");
        console.error(`[web] billing auto-reload failed: ${failure} (${e instanceof ApiError ? `api ${e.status}` : "no response"})`);
        return undefined;
      });
    if (!out?.ok) return mutationOutcome(c, { redirect: `${base}?notice=${failure ?? "autoreload"}` });
    return mutationOutcome(c, { redirect: `${base}?saved=1` });
  });
  // The Stripe Customer-Portal session — payment methods, invoices, receipts live Stripe-side.
  billingPost("portal", async (c, base) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    let failure: string | null = null;
    const out = await Promise.resolve()
      .then(() => deps.dataSource.createBillingPortalSession?.(session, base))
      .catch((e) => {
        failure = billingFailureCode(e, "portal");
        console.error(`[web] billing portal failed: ${failure} (${e instanceof ApiError ? `api ${e.status}` : "no response"})`);
        return undefined;
      });
    if (!out?.url) return mutationOutcome(c, { redirect: `${base}?notice=${failure ?? "portal"}` });
    const target = stripeRedirectTarget(out.url, (m) => console.error(m));
    if (!target) return mutationOutcome(c, { redirect: `${base}?notice=portal` });
    return mutationOutcome(c, { url: target });
  });
  // The Team tier's waitlist row (§14.2 — listed with its price; mechanics are 1.x).
  billingPost("waitlist", async (c, base) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const out = await Promise.resolve()
      .then(() => deps.dataSource.joinTeamWaitlist?.(session, {
        email: typeof form.email === "string" ? form.email : "",
        ...(typeof form.seats === "string" && Number(form.seats) > 0 ? { seats: Number(form.seats) } : {}),
      }))
      .catch(() => undefined);
    if (!out?.ok) return mutationOutcome(c, { redirect: `${base}?notice=waitlist` });
    return mutationOutcome(c, { redirect: `${base}?saved=1` });
  });
  // REQ-BILL-19 — the published rate tables, relayed verbatim so a run report's rate-table link
  // resolves on the app host (the api is internal; the upstream endpoint is public).
  app.get("/pricing/rates", async (c) => {
    const out = await Promise.resolve()
      .then(() => deps.dataSource.getRatesPublication?.())
      .catch(() => undefined);
    if (!out) return c.json({ error: "unavailable" }, 503);
    return c.json(out);
  });
  // The checkout return (REQ-BILL-14): Stripe lands here with ?session_id=. `open` ⇒ the document
  // auto-refreshes (webhook lag ≤30 s); `completed` ⇒ continue to where the user started. A
  // `cancelled=1` return (the Stripe cancel_url) renders the cancelled copy — the session row stays
  // `open` forever, so auto-refresh would poll a state that can never change (STB.4 live finding).
  app.get("/billing/return", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the meta-refresh document is deleted; the leaf polls the
    // /bff twin's server-owned `pollAfterSeconds` through the same ≤30 s window).
    return spaShellDocument(c, deps, session);
  });
  // The dwell heartbeat's sink (REQ-BETA-10): the beacon posts {surface, ms}; the route wraps it into the
  // whitelisted `surface.dwell` mint. A missing/malformed body is a quiet 204 — heartbeats are lossy by design.
  app.post("/a/dwell", async (c) => {
    const session = deps.session(c);
    if (!session) return c.body(null, 401);
    const body = (await c.req.json().catch(() => null)) as { surface?: unknown; ms?: unknown } | null;
    if (typeof body?.surface === "string" && typeof body?.ms === "number" && body.ms > 0) {
      emit(session, "surface.dwell", { surface: body.surface.slice(0, 40), ms: Math.min(Math.round(body.ms), 3_600_000) });
    }
    return c.body(null, 204);
  });

  // P1.17 — the pre-auth landing beacon: landing.js posts the drop-zone hold here (never the file —
  // the bytes stay in IndexedDB; the token is the claim marker). Public, quiet 204 on anything odd.
  app.post("/a/landing", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      event?: unknown;
      props?: unknown;
      token?: unknown;
    } | null;
    if (body?.event === "landing.viewed" || body?.event === "landing.dropzone_used") {
      landingBeacon(
        body.event,
        c,
        body.props && typeof body.props === "object" && !Array.isArray(body.props)
          ? (body.props as Record<string, unknown>)
          : undefined,
        typeof body.token === "string" ? body.token.slice(0, 80) : undefined,
      );
    }
    return c.body(null, 204);
  });

  // P1.17 — the session-authed acquisition mint (the dossier's anchor-viewed beacon, the
  // verification-return's email.verified): forwards to POST /analytics/acquisition — the api binds
  // the identity and honors opt-out. A missing session is a quiet 204 (the event is telemetry).
  app.post("/a/acq", async (c) => {
    const session = deps.session(c);
    if (!session) return c.body(null, 204);
    const body = (await c.req.json().catch(() => null)) as {
      event?: unknown;
      props?: unknown;
      projectId?: unknown;
      runId?: unknown;
    } | null;
    if (typeof body?.event !== "string") return c.body(null, 204);
    try {
      void deps.dataSource
        .postAcquisitionEvent?.(session, {
          event: body.event,
          ...(body.props && typeof body.props === "object" && !Array.isArray(body.props)
            ? { props: body.props as Record<string, unknown> }
            : {}),
          ...(typeof body.projectId === "string" ? { projectId: body.projectId } : {}),
          ...(typeof body.runId === "string" ? { runId: body.runId } : {}),
        })
        .catch(() => undefined);
    } catch {
      /* unbound seam — drop the event */
    }
    return c.body(null, 204);
  });

  // Auth-gated: the flat project view (canonical /p/:project) + the Needs-you surface (PRB.05: the open
  // gate cards) and the Decisions list (the beta Inbox stand-in, §5.7).
  /** SPA.23 — the `/p/:slug` composition both renderers share (REQ-BFF-2's one-composition rule):
   *  the six parallel reads, the presence-timer emit, the working-head pageLoad, and the
   *  badge/timeline/live-feed slices. The document handler renders it through `projectElement`;
   *  `GET /bff/p/:slug` answers the same facts as JSON. The URL-echo fields (`?rename`,
   *  `?created`/`cn`/`cu`, `?hc`, `?derror`) stay renderer-side — the document reads its own query;
   *  the leaf merges its own search (URL state is never payload). */
  const projectOverviewComposition = async (
    c: Context,
    session: SessionHeaders,
    row: ProjectRow,
  ) => {
    const slug = row.slug;
    const [gates, decisions, approvalOverrides, approvalSettings, explainersDismissed, projectVoice] = await Promise.all([
      deps.dataSource.listGates(session, row.id).catch(() => []),
      deps.dataSource.listDecisions(session, row.id).catch(() => []),
      deps.dataSource.getApprovalOverrides(session, row.id).catch(() => ({}) as Record<string, number | null>),
      // P1.09 — the full §6.4 settings read (policy + per-kind grid + standing guidance). Optional
      // seam: absent ⇒ the page falls back to the PRB.05 opt-in form.
      Promise.resolve()
        .then(() => deps.dataSource.getApprovalSettings?.(session, row.id))
        .catch(() => undefined),
      // P1.09 — the user's dismissed explainers (the first-approval explainer mounts once, §5.11).
      Promise.resolve()
        .then(() => deps.dataSource.getExplainers?.(session))
        .then((e) => e?.dismissed ?? [])
        .catch(() => []),
      // PRB.10 — the voice picker: the project's linked-voice facts + the selectable personas (§9.6).
      // (Deferred inside .then so a data source missing the voice seam degrades to no-picker, not a 500.)
      Promise.all([
        Promise.resolve().then(() => deps.dataSource.getProjectVoice(session, row.id)).catch(() => null),
        Promise.resolve().then(() => deps.dataSource.listVoices(session)).catch(() => []),
      ]).then(([current, options]) =>
        current
          ? { current, options, ...(c.req.query("voice_locked") === "1" ? { locked: true as const } : {}) }
          : undefined,
      ),
    ]);
    // PRB.12 — the presence timer actually rendered on this page for a card with a live countdown
    // (§6.4 item 2; REQ-SPEC-18). One mint per timer shown — the BFF read IS the render for the
    // SPA path, so the mint fires identically there (the same-side-effect parity the shared
    // compositions keep).
    for (const g of gates) {
      if (g.presenceDeadlineAt && !g.pausedWhileReading) {
        emit(session, "gate.presence_timer_shown", { kind: g.kind }, { projectId: row.id, runId: g.runId });
      }
    }
    // P1.02 item 12 — `/p/:project` opens the Page on the working head. The doc read is exact and
    // best-effort: a missing/locked head degrades to the plain overview, never a failed page.
    const pageLoad = row.headDraftId
      ? await loadEditorPage(deps.dataSource, session, row.id, row.headDraftId).catch(() => null)
      : null;
    // P1.05 — the Timeline pane's round log (§5.5) + the live feed's replayed rows for a non-terminal
    // run (§5.5's Desk auto-open). Both best-effort: a failed read degrades to the empty timeline/feed,
    // never a failed page.
    // P1.19 — the rail badge is GLOBAL (open approvals + decisions across every project — §5.11);
    // the api's /inbox/badge owns the count. A data source without the seam (fixtures) keeps the
    // project-local count it always had.
    const badge = await Promise.resolve()
      .then(() => deps.dataSource.getInboxBadge?.(session))
      .then((b) => (b && typeof b.count === "number" ? b.count : null))
      .catch(() => null);
    const [timeline, feedData] = await Promise.all([
      Promise.resolve()
        .then(() => deps.dataSource.getTimeline?.(session, slug))
        .catch(() => null),
      row.activeRun ? liveFeedSlice(session, row.activeRun.runId) : Promise.resolve(null),
    ]);
    return { gates, decisions, approvalOverrides, approvalSettings, explainersDismissed, projectVoice, pageLoad, badge, timeline, feedData };
  };

  /** SPA.23 — the ide-context opts the overview's two renderers share (timeline + feed + the
   *  working-head status meters). */
  const overviewIdeOpts = (
    slug: string,
    comp: Awaited<ReturnType<typeof projectOverviewComposition>>,
    row: ProjectRow,
  ) => ({
    inboxCount: comp.badge ?? comp.gates.length + comp.decisions.length,
    ...(comp.timeline ? { timelineView: comp.timeline, runNextHref: `/p/${slug}/run` } : {}),
    ...(row.activeRun && comp.feedData
      ? {
          feed: {
            runId: row.activeRun.runId,
            eventsUrl: `/p/${slug}/r/${row.activeRun.runId}/events`,
            density: "details" as const,
            rows: comp.feedData.rows,
            lastSeq: comp.feedData.lastSeq,
          },
        }
      : {}),
    ...(comp.pageLoad
      ? {
          status: {
            version: `v${comp.pageLoad.doc.draftN}`,
            ...(comp.pageLoad.doc.meters?.words != null ? { words: comp.pageLoad.doc.meters.words } : {}),
            ...(comp.pageLoad.doc.meters?.readMin != null ? { readMin: comp.pageLoad.doc.meters.readMin } : {}),
            ...(comp.pageLoad.doc.venueCap ? { venueCap: comp.pageLoad.doc.venueCap } : {}),
          },
        }
      : {}),
  });

  /** SPA.23 — the `/v/:v` document's reads shared verbatim with `GET /bff/p/:slug/v/:v`
   *  (REQ-BFF-2): draft resolution (the `working`-miss redirect arm included), the page load, the
   *  version rail, the restore-point list, and the `?restore=` preview read. `?restored`/`?noted`
   *  are display echoes and stay renderer-side (URL state is never payload). */
  const versionPageComposition = async (
    c: Context,
    session: SessionHeaders,
    row: ProjectRow,
    v: string,
  ) => {
    const resolved = await deps.dataSource.resolveEditorDraft(session, row.id, v).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    // EDIT.1 — `working` resolves the EDITABLE head; a 404 here means the project has no drafts at
    // all — send the reader back to the project page (the empty-state cards live there) instead of
    // dead-ending on the 404 view. A numeric /v/:n keeps the truthful 404. The BFF twin answers the
    // same arm as `{ok:true, redirect}` — the leaf redirects (server stays authoritative).
    if (!resolved) {
      return v === "working" ? ({ kind: "redirect" as const } ) : ({ kind: "notFound" as const });
    }
    const pageLoad = await loadEditorPage(deps.dataSource, session, row.id, resolved.draftId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!pageLoad) return { kind: "notFound" as const };
    // P1.08 — the §5.8 version rail over the Page (REQ-IDE-32): the chips read, the restore-point
    // dropdown for THIS draft's live doc, and the `?restore=<id>` preview read. Each read is
    // best-effort — a missing piece hides its affordance.
    const railData = await Promise.resolve()
      .then(() => deps.dataSource.getVersions(session, row.id))
      .catch(() => null);
    const restorePoints = await Promise.resolve()
      .then(() => deps.dataSource.listRestorePoints?.(session, row.id, resolved.draftId))
      .catch(() => undefined);
    const restorePick = c.req.query("restore") ?? null;
    const restorePreview = restorePick
      ? ((await Promise.resolve()
          .then(() => deps.dataSource.previewRestorePoint?.(session, row.id, resolved.draftId, restorePick))
          .catch(() => undefined)) ?? null)
      : null;
    return { kind: "ok" as const, resolved, pageLoad, railData, restorePoints, restorePreview };
  };

  /** SPA.23 — the §5.8 rail bag both renderers assemble identically: `?restore`'s preview card
   *  re-uses the LISTED point row when present (it carries `group`/`advanced` — the bare point
   *  read doesn't); `?restored=` merges leaf-side. */
  const pageRailBag = (
    currentN: number,
    railData: VersionRailDto,
    restorePoints: RestorePointsDto | null | undefined,
    restorePreview: RestorePreviewDto | null | undefined,
    restoredN?: number | null,
  ) => ({
    data: railData,
    currentN,
    points: restorePoints?.points ?? [],
    ...(restorePreview?.ok === true
      ? {
          preview: {
            point:
              restorePoints?.points.find((p) => p.id === restorePreview.point.id) ??
              { ...restorePreview.point, group: "named" as const, advanced: false },
            view: restorePreview.view,
          },
        }
      : {}),
    ...(restoredN != null && Number.isFinite(restoredN) ? { restoredN } : {}),
  });

  app.get("/p/:project", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const rows = await deps.dataSource.listProjects(session);
    const row = rows.find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // P1.19 — REQ-IDE-48: opening a project with an UNREAD finished run lands on its walkthrough
    // (the row's href is already workflow-shaped: the letter for reviews, what-changed for revisions,
    // v1 on the Page for drafts). The row marks read on the way through so the hand-off fires once —
    // a repeated open lands on the plain project home. A data source without the Inbox seam never
    // redirects (fixtures keep the overview).
    if (c.req.query("focus") !== "1" && deps.dataSource.getInbox) {
      const finishedRow = await Promise.resolve()
        .then(() => deps.dataSource.getInbox!(session))
        .then(
          (items) =>
            items.find(
              (i) => i.kind === "event" && i.type === "run_finished" && i.unread === true && i.projectId === row.id,
            ),
        )
        .catch(() => undefined);
      if (finishedRow) {
        await Promise.resolve()
          .then(() => deps.dataSource.markInboxItemRead?.(session, finishedRow.id))
          .catch(() => undefined);
        return c.redirect(finishedRow.href);
      }
    }
    // The Page family's forced-SSR capability check (REQ-ED-12 + REQ-VFY-5): a phone request or a
    // read-only `showcase` row keeps the server-rendered Page — the only SSR arm the deletion wave
    // left standing and the ONLY request-path renderer decision remaining (SPA.28: the `?ssr=1` /
    // `x-rhema-renderer` escape is gone; those params are inert text here like everywhere else).
    const forcedSsr = isPhoneRequest(c) || row.showcase === true;
    if (!forcedSsr) {
      return spaShellDocument(c, deps, session, { paperTheme: row.paperTheme });
    }
    const comp = await projectOverviewComposition(c, session, row);
    const { gates, decisions, approvalOverrides, approvalSettings, explainersDismissed, projectVoice, pageLoad } = comp;
    // a bounced disposition write (a gate row's per-finding override) re-renders with the error under
    // that row's controls — never dropped silently.
    const derror = c.req.query("derror");
    return c.html(
      renderDocument(c.req.path, projectElement, {
        // P1.01 — the project overview mounts inside the IDE frame; ?focus=1 seeds the Focus view.
        ...(await ideContext(c, session, { ...row, slug }, overviewIdeOpts(slug, comp, row))),
        project: {
          title: row.title,
          pill: row.state.pill,
          slug,
          headDraftId: row.headDraftId,
          // P1.04 — the row action's Rename (?rename=1 renders the inline title form) and the §5.3
          // create landing (?created=scratch|outline|draft → the next-step card; cn/cu carry the
          // conversion's warning/unconverted counts onto the Conversion-notes line).
          ...(c.req.query("rename") === "1" ? { rename: true } : {}),
          // ONB.1 — `?hc=<token>` echoes the consumed hold token; the page renders the
          // `data-held-consumed` marker the landing island matches against before deleting.
          ...(c.req.query("hc") ? { heldConsumed: c.req.query("hc") } : {}),
          ...(["scratch", "outline", "draft"].includes(c.req.query("created") ?? "")
            ? {
                created: {
                  entry: c.req.query("created") as "scratch" | "outline" | "draft",
                  draftN: row.headDraftN ?? null,
                  ...(c.req.query("cn") != null || c.req.query("cu") != null
                    ? {
                        notes: {
                          warnings: Number(c.req.query("cn") ?? 0) || 0,
                          unconverted: Number(c.req.query("cu") ?? 0) || 0,
                        },
                      }
                    : {}),
                },
              }
            : {}),
        },
        ...(pageLoad
          ? {
              page: {
                slug,
                projectId: row.id,
                doc: pageLoad.doc,
                docJson: pageLoad.docJson,
                // P1.19 — §10.1: the overview's Page is reader-only on phone width.
                // EDIT.1 — the Showcase overview Page is read-only too (§15.4; matches /v/:v).
                // SPA.28 — `forcedSsr` is phone/showcase only now (the `?ssr=1` leg is gone).
                ...(forcedSsr ? { readOnly: true } : {}),
                ...(deps.collabWsUrl && !forcedSsr
                  ? { collabWsUrl: deps.collabWsUrl }
                  : {}),
              },
            }
          : {}),
        gates,
        dwellSurface: "project",
        decisions,
        approvalOverrides,
        ...(approvalSettings ? { approvalSettings } : {}),
        explainersDismissed,
        ...(projectVoice ? { projectVoice } : {}),
        compact: isPhoneRequest(c),
        ssrCause: isPhoneRequest(c) ? "phone" : "showcase",
        ...(derror
          ? {
              triage: {
                dispositionError: {
                  findingId: derror,
                  message: COPY.triage.noteRequired,
                },
              },
            }
          : {}),
      }),
    );
  });

  // PRB.10 — the project voice picker (§9.6; REQ-DATA-32): the select POSTs the chosen persona (or "" for
  // "No voice" — the ad-hoc default, REQ-PERSONA-20); the api pins the profile snapshot server-side.
  app.post("/p/:project/voice", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await projectRows(c, deps.dataSource, session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const personaId = typeof form.personaId === "string" && form.personaId !== "" ? form.personaId : null;
    const register = typeof form.register === "string" && form.register !== "" ? form.register : undefined;
    const res = await deps.dataSource
      .setProjectVoice(session, row.id, { personaId, ...(register !== undefined ? { register } : {}) })
      .then(() => ({ ok: true as const }))
      .catch((e) => ({ ok: false as const, locked: e instanceof ApiError && e.status === 409 }));
    // P1.14 — the soft lock (§9.6): a direct voice change after v1 409s; the redirect lands on the
    // notice that names the two hatches (adopt / fork).
    if (!res.ok && res.locked) return mutationOutcome(c, { redirect: `/p/${slug}?voice_locked=1` });
    return mutationOutcome(c, { redirect: `/p/${slug}` });
  });

  // ---- P1.14 — the §9.6 hatches: adopt the refreshed profile (+ optional charter reseed) or fork
  //  the project under a different voice. The reseed preview is a GET page (the diff before commit). ----
  app.get("/p/:project/voice/reseed", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR diff sheet is deleted; the leaf composes the
    // reseed preview off the /bff twin).
    return spaShellDocument(c, deps, session);
  });

  app.post("/p/:project/voice/adopt", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await projectRows(c, deps.dataSource, session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const reseed = form.reseed === "true" || form.reseed === "on";
    await deps.dataSource.adoptProjectVoice(session, row.id, { reseed }).catch(() => undefined);
    return mutationOutcome(c, { redirect: `/p/${slug}` });
  });

  app.post("/p/:project/voice/fork", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await projectRows(c, deps.dataSource, session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const personaId = typeof form.personaId === "string" && form.personaId !== "" ? form.personaId : "";
    if (!personaId) return mutationOutcome(c, { redirect: `/p/${slug}` });
    const forked = await deps.dataSource
      .forkProjectVoice(session, row.id, { personaId })
      .catch(() => null);
    if (!forked) return mutationOutcome(c, { redirect: `/p/${slug}` });
    return mutationOutcome(c, { redirect: `/p/${forked.slug}` });
  });

  // PRB.05 — the per-project approve_triage 24-h opt-in (§6.4 R3): the checkbox writes the
  // `approval_overrides` row the api validates (≥2 h, wait-default kinds only — REQ-SPEC-1).
  app.post("/p/:project/approval-overrides", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const form = await c.req.parseBody();
    const current = await deps.dataSource.getApprovalOverrides(session, row.id).catch(() => ({}) as Record<string, number | null>);
    const overrides: Record<string, number | null> = { ...current };
    if (form.approve_triage_24h === "on") overrides.approve_triage = 24 * 60 * 60 * 1000;
    else delete overrides.approve_triage;
    await deps.dataSource.setApprovalOverrides(session, row.id, overrides);
    // SPA.23 — the opt-in form is a leaf-intercepted write; a JSON caller gets the envelope.
    return mutationOutcome(c, { redirect: `/p/${slug}` });
  });

  // ---- P1.09 — the Approvals settings surface (§6.4 item 3; REQ-SPEC-1) + standing guidance (§6.5;
  // REQ-GATE-10) + the one-time explainers (§5.11). Plain forms; the api re-validates everything. ----
  app.post("/p/:project/settings/approvals", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await projectRows(c, deps.dataSource, session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const policy =
      form.policy === "named" || form.policy === "wait_each" || form.policy === "run_to_completion"
        ? form.policy
        : undefined;
    // the per-kind grid: "" = project default (no override), "wait" = remove (null), else ms.
    const overrides: Record<string, number | null> = {};
    for (const kind of GATE_KINDS) {
      const v = form[`ov_${kind}`];
      if (typeof v !== "string") continue;
      if (v === "wait") overrides[kind] = null;
      else if (v !== "" && Number.isFinite(Number(v)) && Number(v) > 0) overrides[kind] = Number(v);
    }
    try {
      await deps.dataSource.putApprovalSettings?.(session, row.id, {
        ...(policy ? { policy } : {}),
        overrides,
      });
      // P1.20 — the project-settings page's copy of the form carries `returnTo` and lands back there.
      const back =
        typeof form.returnTo === "string" && form.returnTo.startsWith("/p/")
          ? form.returnTo
          : `/p/${slug}`;
      return mutationOutcome(c, { redirect: `${back}?approvals=saved` });
    } catch (e) {
      // an illegal override (REQ-SPEC-1) re-renders with the notice, never a silent write.
      if (e instanceof ApiError && e.status === 422) {
        const back =
          typeof form.returnTo === "string" && form.returnTo.startsWith("/p/")
            ? form.returnTo
            : `/p/${slug}`;
        return mutationOutcome(c, { redirect: `${back}?approvals=invalid` });
      }
      throw e;
    }
  });

  app.post("/p/:project/guidance", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await projectRows(c, deps.dataSource, session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const body = typeof form.body === "string" ? form.body.trim() : "";
    const workflows =
      typeof form.workflows === "string" && form.workflows.trim() !== ""
        ? form.workflows.split(",").map((w) => w.trim()).filter((w) => w !== "")
        : undefined;
    if (body !== "") {
      await deps.dataSource.createProjectGuidance?.(session, row.id, {
        body,
        ...(workflows && workflows.length > 0 ? { workflows } : {}),
      });
    }
    const back =
      typeof form.returnTo === "string" && form.returnTo.startsWith("/p/")
        ? form.returnTo
        : `/p/${slug}`;
    return mutationOutcome(c, { redirect: back });
  });

  // Retire (§6.5; REQ-GATE-10): active=false, never deleted. "Edit" = retire + the Add form posts the
  // replacement (the settings section composes the two).
  app.post("/p/:project/guidance/:gid/retire", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await projectRows(c, deps.dataSource, session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    await deps.dataSource.retireGuidance?.(session, row.id, c.req.param("gid"));
    const back =
      typeof (form as Record<string, unknown>).returnTo === "string" &&
        ((form as Record<string, unknown>).returnTo as string).startsWith("/p/")
        ? ((form as Record<string, unknown>).returnTo as string)
        : `/p/${slug}`;
    return mutationOutcome(c, { redirect: back });
  });

  // the one-time inline explainer's dismiss (§5.11/§6.4 — once per user, never a modal).
  app.post("/p/:project/explainers/:name/dismiss", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    await deps.dataSource.dismissExplainer?.(session, c.req.param("name")).catch(() => undefined);
    return c.redirect(`/p/${slug}`);
  });

  // PRB.05 — a gate card's decision (§6.4). The card's action buttons POST here; the api resolves/holds.
  // P1.09: the card's structured `ed.*` fields decode into the edits payload (server-side applies them
  // to the sidecar — the client sends deltas, never the base document), and `ed.runOverride` is the
  // per-run deadline pick ("this run only", REQ-SPEC-1-validated at the api).
  app.post("/p/:project/gates/:gid", async (c) => {
    const session = deps.session(c);
    // SPA.21 — `wantsJson` dual-mode: the dossier's focused-gate card + the Inbox row post through
    // the envelope (`{error}` at the preserved status; `{ok,redirect}` on success).
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const action = typeof form.action === "string" ? form.action : "";
    const guidance = typeof form.guidance === "string" && form.guidance.trim() !== "" ? form.guidance : undefined;
    const standing = form.standing === "true" || form.standing === "on";
    const edits = decodeGateEditFields(form as Record<string, unknown>);
    const hasEdits = Object.values(edits).some((v) => (Array.isArray(v) ? v.length > 0 : v != null && Object.keys(v).length > 0));
    // the per-run override ("this run only"): resolve the gate's kind from the open-gates read so the
    // posted value can never name a different kind's override.
    let overrides: Record<string, number | null> | undefined;
    const runOverride = typeof form["ed.runOverride"] === "string" ? form["ed.runOverride"] : "";
    if (runOverride !== "") {
      const gate = (await deps.dataSource.listGates(session, row.id).catch(() => [])).find(
        (g) => g.id === c.req.param("gid"),
      );
      if (gate && (GATE_KINDS as readonly string[]).includes(gate.kind)) {
        overrides = { [gate.kind as GateKind]: runOverride === "wait" ? null : Number(runOverride) };
      }
    }
    try {
      await deps.dataSource.decideGate(session, row.id, c.req.param("gid"), {
        action: action === "wait" ? "wait" : (action as "approve" | "approve_autonomous" | "keep_planning" | "stop"),
        ...(guidance != null ? { guidance } : {}),
        ...(standing ? { standingRule: true } : {}),
        ...(hasEdits ? { edits } : {}),
        ...(overrides ? { overrides } : {}),
      });
    } catch (e) {
      if (wantsJson(c)) return bffFail(c, e, { msg: "gate_decide_failed" });
      throw e;
    }
    return mutationOutcome(c, { redirect: `/p/${slug}` });
  });

  // PRB.05 — a presence/reading ping from a gate card's inline script (§6.4 item 2; REQ-SPEC-18).
  // Progressive enhancement: with no JS the pings simply never arrive and the gate keeps its long
  // deadline. Returns 204 — the script doesn't navigate.
  app.post("/p/:project/gates/:gid/activity", async (c) => {
    const session = deps.session(c);
    if (!session) return c.body(null, 401);
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.body(null, 404);
    const form = await c.req.parseBody();
    const activity = typeof form.activity === "string" ? form.activity : "";
    if (activity !== "present" && activity !== "reading" && activity !== "blur") return c.body(null, 422);
    await deps.dataSource.recordGateActivity(session, row.id, c.req.param("gid"), activity).catch(() => undefined);
    return c.body(null, 204);
  });

  // PRB.05 — answer a Decisions row (the row's option, or "dismiss").
  app.post("/p/:project/decisions/:dcr", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const form = await c.req.parseBody();
    const answer = typeof form.answer === "string" ? form.answer : "";
    await deps.dataSource.answerDecision(session, row.id, c.req.param("dcr"), answer);
    // SPA.23 — a decision answer can ride the leaf's delegated submit; a JSON caller gets the
    // envelope, the form post keeps the redirect.
    return mutationOutcome(c, { redirect: `/p/${slug}` });
  });

  // Auth-gated: the §5.3 import flow (upload/paste → conversion preview → create).
  app.get("/p/:project/import", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR sheet is deleted; the leaf mounts inside the IDE
    // chrome and composes the flow off the /bff twins).
    return spaShellDocument(c, deps, session);
  });

  app.post("/p/:project/import/preview", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const json = wantsJson(c);
    const slug = c.req.param("project");
    const input = await importInputFromFields(await bodyFields(c), slug);
    const raw = await Promise.resolve()
      .then(() => deps.dataSource.previewImport(session, input))
      .catch((e: unknown) => e);
    if (!(raw && typeof raw === "object" && "status" in raw)) {
      // The document path keeps today's thrown-failure → error page; the JSON caller gets the
      // api's refusal at its preserved status (`bffFail`).
      if (json) return bffFail(c, raw, { msg: "import_preview_failed" });
      throw raw;
    }
    const out = raw as ImportPreviewOutcome;
    if (out.status === "pending") {
      // PRB.21 — a cold convert Job runs ~2.5–4 min; never hold one request for it. Render the
      // converting state; the page re-polls the GET below (the api joins the in-flight execution —
      // a retry is neither a second upload nor a duplicate `jobs:run`). SPA.14 — the JSON caller
      // gets the pending contract: `redirect` is the SAME server-owned poll URL the meta-refresh
      // carries; the leaf navigates there and its twin's `refetchInterval` keeps the cadence.
      const pollUrl = importPollUrl(slug, out.quarantineKey, input.fileName);
      if (json) {
        return c.json({
          ok: true,
          pending: { pollAfterSeconds: IMPORT_PREVIEW_POLL_SECONDS },
          redirect: pollUrl,
        });
      }
      // SPA.27 — the meta-refresh document is deleted: a form post follows the SAME poll URL the
      // JSON envelope carries (the leaf's refetchInterval keeps the server-owned cadence).
      return c.redirect(pollUrl);
    }
    if (json) {
      // The ready preview the document renders on the POST — non-addressable state the leaf
      // paints in place (the GET twin's `qk` leg stays the poll/refresh target).
      return c.json({ ok: true, data: { conversion: toConversionData(slug, input, out.preview, out.quarantineKey) } });
    }
    // SPA.27 — the SSR preview leg is deleted: the poll URL round-trips the quarantine key so the
    // preview leaf recomposes the ready card off the /bff twin.
    return c.redirect(importPollUrl(slug, out.quarantineKey, input.fileName));
  });

  // PRB.21 — the pending preview's poll leg (the page's meta-refresh target): re-preview the SAME
  // quarantine key. Warm, the read-back cache answers in ~190 ms; cold, the api joins the still-running
  // execution and answers `pending` again inside the bounded wait — the page refreshes itself until ready.
  app.get("/p/:project/import/preview", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const qk = c.req.query("qk");
    if (!qk) return c.redirect(`/p/${slug}/import`);
    // SPA.27 — sole renderer: the shell (the pending/ready SSR legs are deleted; the leaf's twin
    // re-asks the quarantine key at the server-owned cadence and recomposes both states).
    return spaShellDocument(c, deps, session);
  });

  app.post("/p/:project/import/create", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const input = await importInputFromFields(await bodyFields(c), slug);
    try {
      await deps.dataSource.createImport(session, input);
    } catch (e) {
      // PRB.21 — the converted object wasn't there yet (a stale preview page or a slow Job): the api
      // 409s `conversion_pending` — drop back to the converting state; its poll finishes the preview.
      if (e instanceof ApiError && e.status === 409 && e.code === "conversion_pending" && input.quarantineKey) {
        if (wantsJson(c)) {
          return c.json({
            ok: true,
            pending: { pollAfterSeconds: IMPORT_PREVIEW_POLL_SECONDS },
            redirect: importPollUrl(slug, input.quarantineKey, input.fileName),
          });
        }
        // SPA.27 — the meta-refresh document is deleted: follow the poll URL (the leaf's
        // refetchInterval keeps the cadence).
        return c.redirect(importPollUrl(slug, input.quarantineKey, input.fileName));
      }
      if (wantsJson(c)) return bffFail(c, e, { msg: "import_create_failed" });
      throw e;
    }
    // The draft now exists; the flat project view shows it. (Fix-now block editing is PRB.07.)
    return mutationOutcome(c, { redirect: `/p/${slug}` });
  });

  // Auth-gated: the run sheet — the launcher for Review / Revise / Fact-check and the ONLY paywall (§5.6).
  // GET renders the sheet for the chosen workflow/rigor (query-driven, no client bundle); the estimate is
  // computed via the shared @rhema/run-sheet estimator (the same one the stateless /estimates endpoint uses).
  app.get("/p/:project/run", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR sheet is deleted; the leaf composes the ONE
    // `runSheetComposition` off the `/bff/p/:slug/run` twin — side effects included — and
    // `?notice=purchase_paused` stays URL flash state).
    return spaShellDocument(c, deps, session);
  });

  // The Run click — the ONLY run creator (REQ-CHAT-25). Mints nothing new: the sheet-minted idempotency key
  // comes in the form. On success the sheet reports the run started (§5.6 item 10).
  app.post("/p/:project/run", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    // SPA.20 (REQ-BFF-1/2) — a JSON caller posts the SAME flat field map as the form
    // (`bodyFields` decodes both content types; an unchecked checkbox contributes nothing
    // either way — the `toggleKeys` sentinel grammar is unchanged).
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const workflow = normalizeWorkflow(str("workflow"));
    const rigor = normalizeRigor(str("rigor"));
    // EST.1 — the submitted `modelTier` is the USER'S CHOICE (the collapsed-row select posts it). A
    // canonical value is honoured verbatim — the api's plan gate stays the enforcer (a tier the plan
    // locks 403s `trial_base_only` and the notice re-renders); a missing/garbage value resolves
    // through the same chain as the GET. Tier no longer derives from rigor (BL-58; ADR-035).
    const submittedTier = str("modelTier");
    const words = Number(str("words")) || 0;
    const claims = Number(str("claims")) || undefined;
    // PRB.23 — the Advanced toggles ride the SAME form as `toggle.<key>` checkboxes plus a
    // `toggleKeys` sentinel (an unchecked box submits NOTHING, so the sentinel is what lets an
    // explicit OFF reach the server). The resolved set is sent to the api, which freezes it into
    // the run's inputs (phase opt-out flags) and prices the SAME set — before this, the estimate
    // priced rigor defaults while the pod ran every manifest phase regardless.
    //
    // ECON.1 (§6.5) — the checkboxes render for ONE rigor and never re-render when the rigor radio
    // changes (the inline script repaints the estimate box only). `toggleRigor` marks the rendered
    // rigor: a submitted set whose marker no longer matches the submitted rigor is a STALE claim —
    // the boxes describe another notch's defaults (Standard's checked discourse/second_read riding a
    // Quick submit was the 2026-09-30 incident). Drop it entirely: the api then derives the
    // submitted rigor's own defaults — presets are server-derived unless the user changed a toggle
    // under Advanced for the SAME rigor the sheet rendered.
    const renderedRigor = str("toggleRigor");
    const toggleKeys = str("toggleKeys").split(",").filter(Boolean);
    const toggles: Record<string, boolean> = {};
    const toggleQuery: Record<string, string> = {};
    if (toggleKeys.length > 0 && renderedRigor === rigor) {
      for (const key of toggleKeys) {
        const on = str(`toggle.${key}`) === "on";
        toggles[key] = on;
        toggleQuery[`toggle.${key}`] = on ? "on" : "off";
      }
    }
    const billing = await deps.dataSource.getBillingBalance(session).catch(() => undefined);
    // EST.1 — the re-render reads the SAME context the GET does (real head-draft counts, resolved
    // defaults, plan tiers, calibrated durations) — the posted word/claim counts round-trip the
    // rendered figure, and a post-confirm view can never fall back to the mock counts.
    const postCtx = await Promise.resolve()
      .then(() =>
        deps.dataSource.getRunSheetContext?.(session, row.id, {
          workflow,
          ...(str("scope") ? { scope: str("scope") } : {}),
        }),
      )
      .catch(() => null);
    const view = buildSheet(
      {
        workflow,
        rigor,
        ...(submittedTier ? { modelTier: submittedTier } : {}),
        words: str("words"),
        claims: str("claims"),
        ...toggleQuery,
      },
      billing,
      deps.betaPlanOfferUrl,
      postCtx,
    );
    // the frozen tier = the submitted choice when canonical, else the resolved/clamped default.
    const modelTier = (MODEL_TIERS as readonly string[]).includes(submittedTier)
      ? (submittedTier as ModelTier)
      : view.modelTier;
    // P1.06 (§5.6; REQ-BILL-4) — the "don't ask under N" pref rides the same form; persist it via the
    // settings write before the run create (a pref write never blocks a run — failures swallow).
    const dontAskUnder = Number(str("dontAskUnder"));
    if (Number.isInteger(dontAskUnder) && dontAskUnder >= 0 && str("dontAskUnder") !== "") {
      await deps.dataSource.setConsentPref?.(session, Math.min(dontAskUnder, 1000)).catch(() => undefined);
    }
    let created: CreatedRunDto | undefined;
    try {
      created = await deps.dataSource.createRun(session, row.id, {
        idempotencyKey: str("idempotencyKey") || randomUUID(),
        workflow,
        modelProfile: { tier: modelTier },
        modelTier,
        rigor,
        estimateCredits: Number(str("estimateCredits")) || 0,
        capCredits: Number(str("capCredits")) || 0,
        rateTableVersion: Number(str("rateTableVersion")) || 1,
        // R5ECON.2 — a posted `cogsLevers` field (JSON string) is the N6 leg's registry pin; the api
        // resolves it into `inputs.cogsLevers` on is_test only (REQ-ECON-11's opt-out channel).
        inputs: {
          ...(cogsLeversField(str("cogsLevers")) ? { cogsLevers: cogsLeversField(str("cogsLevers")) } : {}),
        },
        // the sheet's resolved Advanced toggle set — the api freezes it into the run inputs as
        // manifest opt-out flags AND re-derives the estimate from it (PRB.23).
        toggles,
        // REQ-BILL-6: freeze the word/claim counts the estimate was computed for on the run record.
        inputSnapshot: { wordCount: words, ...(claims != null ? { claimCount: claims } : {}) },
        // P1.06 (§7.2) — the sheet's full state: scope (canonical serialized), free-text guidance, the
        // Approvals pick, and the head draft + corr slot the lock set needs (scoped readers parallelize).
        ...(str("scope") ? { scope: str("scope") } : {}),
        ...(str("guidance") ? { guidance: str("guidance") } : {}),
        // P1.06 (§5.6 collapsed row; REQ-SPEC-17) — the editable scope facts; the api freezes them and
        // re-derives the scope-gate blocking flag (a protocol/venue change is never client-trusted).
        ...(str("protocol") ? { protocol: str("protocol") } : {}),
        ...(str("venue") ? { venue: str("venue") } : {}),
        ...(str("stage") ? { stage: str("stage") } : {}),
        // P1.21 (§6.7/REQ-GENRE-6) — the memo sheet's user_sources field (`name :: url-or-text` per
        // line) parses into the api's validated array; the api refuses it off the memo protocol and
        // freezes the source domains into the run's URL policy (fetches are denied, not advised).
        ...(parseUserSourcesField(str("userSources")).length > 0
          ? { userSources: parseUserSourcesField(str("userSources")) }
          : {}),
        ...(str("approval") ? { approvalPolicy: str("approval") as "named" | "wait_each" | "run_to_completion" } : {}),
        // P1.09 (§5.6/§6.4) — the sheet's "this run only, autonomously" check posts `autoProceedRun`;
        // the api freezes runs.gates_off on THIS run only (the project policy is untouched).
        ...(form.autoRun === "on" ? { autoProceedRun: true } : {}),
        ...(row.headDraftId ? { draftId: row.headDraftId } : {}),
        corrKind: workflow === "review" || workflow === "fact_check" ? workflow : undefined,
        corrK: 1,
        // ACT.1 — the included-Review claim: the entitlement id the sheet rendered (hidden field)
        // + the `rhema_fp` device fingerprint (minted on the GET; the api stores only its hash).
        ...(str("entitlementId") ? { entitlementId: str("entitlementId") } : {}),
        ...(cookieValue(c, FP_COOKIE) ? { fingerprint: cookieValue(c, FP_COOKIE) } : {}),
      });
    } catch (e) {
      // SPA.20 (REQ-BFF-4/5) — a JSON caller never gets a re-rendered sheet: the api's stable
      // `{error, detail?}` rides at the preserved status (`run_in_progress` 409,
      // `insufficient_balance` 402, the `trial_*`/`entitlement_*`/`model_tier_*` refusals, ≥500 →
      // 502). The leaf repaints server truth off the invalidated twin — the same answers the SSR
      // re-render arms below carry.
      if (wantsJson(c)) return bffFail(c, e, { msg: "run_create_failed" });
      // SPA.27 — the SSR re-render arms are deleted: a form-mode refusal lands back on the sheet
      // URL and the leaf repaints the SAME server truth off its twin — `run_in_progress` 409
      // collapses to the in-progress arm, the 402 balance wall shows through the billing read, and
      // the `trial_*`/`entitlement_*`/`model_tier_*`/suspension refusals show through the context
      // read's entitlement/tier facts (the notices were inline paint; there is no URL for them).
      if (e instanceof ApiError && e.status === 402) {
        // the panel is showing again (the Run click hit the balance wall) — count the impression.
        await deps.dataSource.recordExhaustedPrompt(session, "shown").catch(() => undefined);
      }
      if (
        e instanceof ApiError &&
        e.status < 500 &&
        (e.status === 402 ||
          e.status === 403 ||
          e.status === 429 ||
          (e.status === 409 && e.code === "run_in_progress") ||
          (e.status === 422 &&
            ["trial_word_cap", "trial_shape", "entitlement_unavailable"].includes(e.code ?? "")))
      ) {
        return c.redirect(`/p/${slug}/run`);
      }
      // a genuine ≥500 (or an unrecognized refusal) is a real failure — never a silent redirect.
      throw e;
    }
    // SPA.20 — the JSON success answer: `{ok:true, data:{runId,state}}` — the leaf shows the
    // started confirmation off `data` and the invalidated twin collapses to the in-progress arm
    // (the api's own server truth — the document's `started:true` render has no URL of its own).
    if (wantsJson(c)) {
      return mutationOutcome(c, { data: { runId: created?.runId, state: created?.state } });
    }
    // SPA.27 — the `started:true` re-render is deleted: a form-mode success lands on the sheet
    // URL, where the twin reports the now-active run.
    return c.redirect(`/p/${slug}/run`);
  });

  // PRB.08 — the exhaustion panel's Payment-Link action (§14.6; the beta's ONE real-money channel). A plain
  // form POST (no JS needed): record `credits.exhausted_prompt{action_taken}` (REQ-BETA-12), then 302 to the
  // Payment Link for `open_payment_link`. The link URL comes from the api's balance read (deploy config) —
  // never a form field, so this route is no open redirect.
  app.post("/p/:project/exhausted", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    // SPA.20 (REQ-BFF-1/2/27) — `bodyFields` decodes both content types; the JSON arms answer the
    // SAME envelope the 302s carried: `{ok,redirect:"…?notice=purchase_paused"}` for a closed
    // purchase switch, `{ok,url}` for the Payment Link hand-off (validated against the Stripe-hosted
    // allowlist AGAIN inside mutationOutcome — a refused link can never reach the wire, and a JSON
    // caller is never handed a 302), `{ok,redirect}` for the plain return.
    const form = await bodyFields(c);
    const action = typeof form.action_taken === "string" && form.action_taken !== "" ? form.action_taken : "unknown";
    await deps.dataSource.recordExhaustedPrompt(session, action).catch(() => undefined);
    if (action === "open_payment_link") {
      const billing = await deps.dataSource.getBillingBalance(session).catch(() => undefined);
      // BILL.3 — the purchase switch binds the Payment Link too: anything short of an explicit `open`
      // (closed, absent on an older api, or a failed read) gets the paused note, never a checkout; and
      // the redirect target is validated against the Stripe-hosted allowlist before the 302 (the CSP
      // form-action list admits nothing else anyway).
      if (billing?.purchase !== "open") {
        return mutationOutcome(c, { redirect: `/p/${slug}/run?notice=purchase_paused` });
      }
      // F32 (PRB.19): the Payment Link must carry `client_reference_id=<billingAccountId>` — without it the
      // Stripe-originated checkout lands `unresolved` (money taken, no grant(topup)). Composed, never
      // concatenated, so an existing query on the configured link survives.
      if (billing?.paymentLinkUrl) {
        const target = stripeRedirectTarget(
          paymentLinkWithReference(billing.paymentLinkUrl, billing.billingAccountId),
          (m) => console.error(m),
        );
        if (target) return mutationOutcome(c, { url: target });
      }
    }
    return mutationOutcome(c, { redirect: `/p/${slug}/run` });
  });

  // Auth-gated: the delivered-review dossier reading surface (PRB.04, §5.5/§5.7/§6.6). The findings-core read
  // models + @rhema/ui surfaces render server-side; the live data binding (reading a delivered run) is D-PRB.04-1.
  //
  // SPA.21 — `dossierComposition` is the ONE composition the document GET and `GET
  // /bff/p/:slug/review/:runId` share (the runSheetComposition precedent): the same seams, the same
  // degrade posture, the same view emissions (`run.report_viewed`, per-finding `finding.viewed`,
  // `secondread.opened`, the inbox-read mark), the same URL-owned view state — so the two renderers
  // read + log identically and the twin can never price/diff differently.
  const dossierComposition = async (
    c: Context,
    session: SessionHeaders,
    row: ProjectRow,
    runId: string,
  ): Promise<{
    dossier: DossierData;
    filteredRows: FindingView[];
    timeline: TimelineDto | null;
    savedFindingId?: string;
    dossierView: NonNullable<PageData["dossierView"]>;
  } | null> => {
    const slug = row.slug;
    // STB.2 — the api's dossier 404 (a run that completed without a delivered review correspondence)
    // must render the not-found page, not escape as a 500.
    const dossier = await deps.dataSource.getDossier(session, { projectSlug: slug, runId }).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!dossier) return null;
    // P1.19 — landing on a run deep link collapses the run's Inbox rows read (REQ-MOBILE-16; the
    // api's mark is idempotent — opening the dossier from anywhere counts as "seen").
    await Promise.resolve()
      .then(() => deps.dataSource.markInboxRunRead?.(session, runId))
      .catch(() => undefined);
    // P1.05 — the dossier carries the same Timeline pane (the card's own run resolves into its round).
    const timeline = await Promise.resolve()
      .then(() => deps.dataSource.getTimeline?.(session, slug))
      .catch(() => null);
    const savedFindingId = c.req.query("disposed") || undefined;
    // PRB.12 — the reading surface's view emissions (the intake whitelist's whole reason to exist):
    // the report view itself, each rendered finding, and the second-read section when it has content.
    emit(session, "run.report_viewed", { cost_actual: dossier.runCard.spentCredits }, { projectId: row.id, runId });
    for (const f of dossier.findings) {
      emit(session, "finding.viewed", { severity: f.severity, phase_of_origin: f.origin }, { projectId: row.id, runId });
    }
    if (dossier.findings.some((f) => f.origin === "second_read")) {
      emit(session, "secondread.opened", {}, { projectId: row.id, runId });
    }
    // P1.07 — the findings-surface view state (§5.7): shared filters (sev/kind/disp/sec/url/sug/obl),
    // triage mode (?triage=1), the consolidated bulk preview (?bulk=<action>[&bsec]), a dispatch
    // result (?bulkdone), and the notice a bounced finding POST re-renders (?applied/?promoted/?obligated/?ferr).
    const filters: Record<string, string | undefined> = {
      sev: c.req.query("sev"), kind: c.req.query("kind"), disp: c.req.query("disp"),
      sec: c.req.query("sec"), url: c.req.query("url"), sug: c.req.query("sug"), obl: c.req.query("obl"),
    };
    const filteredRows = filterFindings(
      applySeverityBudget([...dossier.findings], dossier.rigor),
      parseFindingFilters(filters),
    );
    const bulkAction = c.req.query("bulk");
    const bulkPreview = bulkAction != null && deps.dataSource.previewBulkFindings != null
      ? await deps.dataSource
          .previewBulkFindings(session, row.id, runId, {
            action: bulkAction as "apply_notes" | "defer_minor" | "accept_section",
            ...(c.req.query("bsec") != null ? { section: c.req.query("bsec")! } : {}),
          })
          .catch(() => null)
      : null;
    const bulkDone = c.req.query("bulkdone");
    const notice = (() => {
      const applied = c.req.query("applied");
      if (applied != null) return { kind: "applied" as const, findingId: applied };
      const promoted = c.req.query("promoted");
      if (promoted != null) return { kind: "promoted" as const, findingId: promoted };
      const obligated = c.req.query("obligated");
      if (obligated != null) return { kind: "obligated" as const, findingId: obligated };
      const ferr = c.req.query("ferr");
      if (ferr != null) {
        return {
          kind: "error" as const,
          findingId: ferr,
          message: c.req.query("fmsg") ?? "The finding action did not complete.",
        };
      }
      return undefined;
    })();
    // P1.19 — the Inbox gate row's `?gate=<id>` deep link (§5.11): the open gate's card mounts at the
    // head of the artifact so the approve flow reads the artifact first — and it's the only gate
    // surface reachable at phone width, where the Timeline is display:none.
    const focusGateId = c.req.query("gate");
    const focusedGate =
      focusGateId != null && focusGateId !== ""
        ? ((await deps.dataSource.listGates(session, row.id).catch(() => [])).find(
            (g) => g.id === focusGateId,
          ) ?? null)
        : null;
    return {
      dossier,
      filteredRows,
      timeline,
      ...(savedFindingId ? { savedFindingId } : {}),
      dossierView: {
        filters,
        triage: c.req.query("triage") === "1",
        ...(bulkPreview != null
          ? {
              bulk: {
                action: bulkAction!,
                ...(c.req.query("bsec") != null ? { section: c.req.query("bsec")! } : {}),
                preview: bulkPreview,
              },
            }
          : {}),
        ...(bulkDone != null ? { bulkDone: { count: Number(bulkDone) || 0, skipped: Number(c.req.query("bulkskip") ?? "0") || 0 } } : {}),
        ...(notice != null ? { notice } : {}),
        ...(focusedGate != null ? { focusedGate } : {}),
      },
    };
  };

  app.get("/p/:project/review/:runId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR dossier is deleted; the leaf composes the shared
    // `dossierComposition` — view emissions, filters, bulk/gate/deep-link view state — off the
    // /bff twin, and the client router owns the not-found).
    return spaShellDocument(c, deps, session);
  });

  // SPA.21 — `GET /p/:slug/review/:runId`'s twin (design/22 §2 `p.review` row; REQ-BFF-1/8/9/11):
  // the dossier + dossierView + the `ide` chrome bag off the SHARED composition. `?disposed` rides
  // the twin as `triage.savedFindingId` verbatim; `compact` is boot-owned (`deviceClass`), never
  // the twin's to decide.
  app.get("/bff/p/:slug/review/:runId", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const runId = c.req.param("runId") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const comp = await dossierComposition(c, session, row, runId);
    if (!comp) return c.json({ error: "not_found" }, 404);
    const ctx = await ideContext(c, session, row, {
      findings: comp.filteredRows.map((f) => ({ id: f.id, severity: f.severity, kind: f.kind, excerpt: f.title })),
      ...(comp.timeline
        ? { timelineView: comp.timeline, runNextHref: `/p/${slug}/run` }
        : { timeline: [{ id: runId, label: comp.dossier.versionLabel, state: "delivered", href: `/p/${slug}/review/${runId}` }] }),
      status: { version: comp.dossier.versionLabel },
    });
    return c.json({
      dossier: comp.dossier,
      dossierView: comp.dossierView,
      ...(comp.savedFindingId ? { triage: { savedFindingId: comp.savedFindingId } } : {}),
      project: { title: comp.dossier.projectTitle, pill: "", slug },
      paperTheme: ctx.paperTheme ?? "light",
      ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
      ide: ctx.ide,
    });
  }));

  // ---- P1.05 — the run report + §6.5 steering + the live-feed SSE proxy (§5.5/§14.5) ----

  /** SPA.22 — the run report's ONE composition (document GET + BFF twin; design/22 §2's
   *  `p.runReport` row): the `?advanced=1` report read + the Timeline pane read + the Inbox
   *  read-receipt, in the same order and with the same degrade posture the document always had —
   *  the report degrades ANY failure to the 404 arm; the timeline is best-effort. The live feed
   *  stays OUT of the composition (the document never carried it — the twin adds the slice for
   *  the SPA's live meter binding, design/22 §2 note (f)). */
  const runReportComposition = async (
    c: Context,
    session: SessionHeaders,
    row: ProjectRow,
    runId: string,
  ): Promise<{
    report: Awaited<ReturnType<DataSource["getRunReport"]>>;
    timeline: TimelineDto | null;
  } | null> => {
    const slug = row.slug;
    const advanced = c.req.query("advanced") === "1";
    // P1.19 — a run_finished Inbox row's generic-workflow landing is this report; mark the collapsed
    // row read on open (same read-receipt as the dossier's, REQ-MOBILE-16).
    await Promise.resolve()
      .then(() => deps.dataSource.markInboxRunRead?.(session, runId))
      .catch(() => undefined);
    const [report, timeline] = await Promise.all([
      deps.dataSource.getRunReport(session, runId, { advanced }).catch(() => null),
      Promise.resolve()
        .then(() => deps.dataSource.getTimeline(session, slug))
        .catch(() => null),
    ]);
    if (!report) return null;
    return { report, timeline };
  };

  // The run report page (the Timeline card's "Run report" link; §14.5). `?advanced=1` lazy-loads the
  // Level-4 drill-down into the Advanced disclosure — the report read model is already split, so the
  // plain page never carries token-level rows (tokens appear ONLY inside the disclosure's copy).
  app.get("/p/:project/r/:runId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR report is deleted; the leaf composes the shared
    // `runReportComposition` + live-feed slice off the /bff twin — the inbox read-receipt rides
    // the twin verbatim).
    return spaShellDocument(c, deps, session);
  });

  // SPA.22 — `GET /p/:slug/r/:runId`'s twin (design/22 §2 `p.runReport` row; REQ-BFF-1/8/9/11):
  // the shared composition's `{report, timeline}` + the `ide` chrome bag + the LIVE feed slice the
  // `/p/:slug` reader carries verbatim when a live run exists (design/22 §2 note (f)) — the
  // replayed rows + `lastSeq` + the same-origin events URL let the leaf's `useIdeFeed` bind the
  // one EventSource with `?after=` resume, so the report's run progress + spend ticker is the
  // live binding REQ-UX-15 names (the ticket's KEY PORT).
  app.get("/bff/p/:slug/r/:runId", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const runId = c.req.param("runId") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const comp = await runReportComposition(c, session, row, runId);
    if (!comp) return c.json({ error: "not_found" }, 404);
    const feedData = row.activeRun ? await liveFeedSlice(session, row.activeRun.runId) : null;
    const ctx = await ideContext(c, session, row, {
      ...(comp.timeline ? { timelineView: comp.timeline, runNextHref: `/p/${slug}/run` } : {}),
      ...(row.activeRun && feedData
        ? {
            feed: {
              runId: row.activeRun.runId,
              eventsUrl: `/p/${slug}/r/${row.activeRun.runId}/events`,
              density: "details" as const,
              rows: feedData.rows,
              lastSeq: feedData.lastSeq,
            },
          }
        : {}),
    });
    return c.json({
      runReport: { slug, runId, report: comp.report },
      project: { title: row.title, pill: row.state.pill, slug },
      paperTheme: ctx.paperTheme ?? "light",
      ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
      ide: ctx.ide,
    });
  }));

  // §4.2 — the usage deep-link's canonical redirect: /app/usage/r/:run → /p/<slug>/r/<run>#report.
  app.get("/app/usage/r/:runId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const runId = c.req.param("runId");
    const report = await deps.dataSource.getRunReport(session, runId).catch(() => null);
    if (!report?.projectSlug) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.redirect(`/p/${report.projectSlug}/r/${runId}#report`);
  });

  // The live feed's same-origin SSE proxy — the browser's EventSource never leaves this host (the
  // session forwards server-side; REQ-ARCH-33). `after`/`Last-Event-ID` ride through for resume.
  app.get("/p/:project/r/:runId/events", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const slug = c.req.param("project");
    const runId = c.req.param("runId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const upstream = await deps.dataSource
      .streamRunEvents(session, runId, {
        ...(c.req.query("after") ? { after: c.req.query("after")! } : {}),
        ...(c.req.header("last-event-id") ? { lastEventId: c.req.header("last-event-id")! } : {}),
      })
      .catch((e: unknown) => {
        // OBS.1 — a dropped/refused upstream is no longer a silent 502: ONE structured line with
        // the request's id + the error class (the throw itself carries no user text into the log).
        logWebRouteError(c, {
          status: 502,
          msg: "sse_upstream_unreachable",
          errorClass: errorClass(e),
          stack: stackForLog(e),
        });
        return null;
      });
    if (!upstream || upstream.body == null) {
      // OBS.1 — an upstream NON-ok response that resolves still answers 502 here: the USER-VISIBLE
      // 502 is the error line's status/severity (a misclassified 4xx→502 is itself worth the trail).
      // The 404 pass-through is the expected "no such run" — not a server fault, no line.
      if (upstream && upstream.status !== 404) {
        logWebRouteError(c, { status: 502, upstreamStatus: upstream.status, msg: "sse_upstream_refused" });
      }
      return c.json({ error: "upstream_unavailable" }, upstream?.status === 404 ? 404 : 502);
    }
    if (!upstream.ok) {
      // OBS.1 — a resolved non-ok upstream passes its status through: ≥500 is the one ERROR line
      // (the api's own line shares the requestId), an expected <500 refusal a WARNING.
      logWebRouteError(c, {
        status: upstream.status,
        upstreamStatus: upstream.status,
        msg: "sse_upstream_refused",
        severity: upstream.status >= 500 ? "ERROR" : "WARNING",
      });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  });

  // The §6.5 steering POSTs — plain form posts (no-JS), each forwarding to the api's thin adapter over
  // the orchestrator seam, then redirecting back to the project (the Timeline re-reads the new state).
  const steerHandler =
    (act: (session: SessionHeaders, runId: string, text?: string) => Promise<unknown>) =>
    async (c: Context) => {
      const session = deps.session(c);
      // SPA.22 — the `wantsJson` dual-mode branch (REQ-BFF-1/3/4): a JSON caller is never handed
      // the document's 302/404 HTML arms — `{error}` at the preserved status on refusal,
      // `{ok,redirect}` on success (the leaf navigates the redirect + invalidates).
      if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
      const slug = c.req.param("project");
      const runId = c.req.param("runId");
      const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
      if (!row || runId == null || runId === "")
        return wantsJson(c)
          ? c.json({ error: "not_found" }, 404)
          : c.html(renderDocument(c.req.path, notFoundElement), 404);
      const form = await bodyFields(c);
      const text = typeof form["text"] === "string" ? (form["text"] as string) : undefined;
      const note = typeof form["note"] === "string" ? (form["note"] as string) : undefined;
      try {
        await act(session, runId, text ?? note);
      } catch (e) {
        // a stale card (the run moved past the state) re-renders the page rather than erroring out —
        // the Timeline's fresh read shows the current state. A JSON caller gets the api's status
        // preserved in the envelope so the leaf maps 400/404/409 to invalidate-and-re-read
        // (design/22 §3's stale-state note); the form post keeps the redirect arm.
        if (wantsJson(c)) return bffFail(c, e, { msg: "run_steer_failed" });
        if (!(e instanceof ApiError && (e.status === 404 || e.status === 409 || e.status === 400))) throw e;
      }
      return mutationOutcome(c, { redirect: `/p/${slug}` });
    };

  app.post("/p/:project/r/:runId/pause", steerHandler((s, runId) => deps.dataSource.pauseRun(s, runId)));
  app.post("/p/:project/r/:runId/resume", steerHandler((s, runId, note) => deps.dataSource.resumeRun(s, runId, note)));
  app.post("/p/:project/r/:runId/stop", steerHandler((s, runId) => deps.dataSource.stopRun(s, runId)));
  app.post("/p/:project/r/:runId/cancel", steerHandler((s, runId) => deps.dataSource.stopRun(s, runId)));
  app.post("/p/:project/r/:runId/note", steerHandler(async (s, runId, text) => {
    if (text == null || text.trim() === "") return; // an empty note is a no-op, never a write
    return deps.dataSource.postRunNote(s, runId, text);
  }));
  app.post("/p/:project/r/:runId/walkthrough", steerHandler((s, runId) => deps.dataSource.retryWalkthrough(s, runId)));

  // DEF.4 — the §14.4 refund-window POST (plain form; REQ-SPEC-24(6)). The report's `refundWindow`
  // block is the only place this control renders, so the api's flag + eligibility re-check is the
  // authority — an expected refusal (closed flag / ineligible / already decided) just re-renders the
  // report, which now carries the honest block state (ineligible / pending_review / denied).
  app.post("/p/:project/r/:runId/refund", async (c) => {
    const session = deps.session(c);
    // SPA.22 — the `wantsJson` dual-mode branch (REQ-BFF-1/3/4): the leaf's refund form posts
    // `{accept: application/json}` and follows `{ok,redirect}` (the same `/p/:slug/r/:runId#report`
    // target) — an expected refusal's preserved status maps to invalidate-and-re-read, which is
    // the SSR stale→re-render arm verbatim (design/22 §3's stale-state note).
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const runId = c.req.param("runId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row || runId == null || runId === "")
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    try {
      await deps.dataSource.requestRefund(session, runId);
    } catch (e) {
      if (wantsJson(c)) return bffFail(c, e, { msg: "run_refund_failed" });
      if (!(e instanceof ApiError && (e.status === 404 || e.status === 409 || e.status === 403))) throw e;
    }
    return mutationOutcome(c, { redirect: `/p/${slug}/r/${runId}#report` });
  });

  // PRB.05 — the disposition write (§5.7): the five verbs + note + optional reason chip. Progressive
  // enhancement: a plain form POST; a validation error re-renders the dossier with the error under the
  // card (a rebut/escalate with no rationale round-trips a 422). Two mount paths: the dossier route (its
  // runId locates the dossier to re-render) and the project-scoped route a gate card's per-row override uses.
  const dispositionHandler = async (c: Context) => {
    const session = deps.session(c);
    // SPA.21 — the `wantsJson` dual-mode branch (REQ-BFF-1/3/4): a JSON caller is never handed the
    // document's 302/404 HTML arms — `{error}` at the preserved status, `{ok,redirect}` on success.
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const runId = c.req.param("runId") ?? "";
    const findingId = c.req.param("fid") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row || findingId === "") {
      return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const verb = str("verb");
    const note = str("note");
    const adaptedText = str("adapted_text");
    const reasonCode = str("reason_code");
    const back = safeBack(str("next"), runId !== "" ? `/p/${slug}/review/${runId}` : `/p/${slug}`);
    try {
      await deps.dataSource.recordDisposition(session, row.id, findingId, {
        kind: verb as "accept" | "adapt" | "rebut" | "defer" | "escalate",
        ...(note.trim() !== "" ? { rationale: note } : {}),
        ...(adaptedText.trim() !== "" ? { adaptedText } : {}),
        ...(reasonCode.trim() !== "" ? { reasonCode } : {}),
      });
    } catch (e) {
      // JSON callers get the upstream code/status verbatim — the leaf repaints the refusal itself.
      if (wantsJson(c)) return bffFail(c, e, { msg: "dossier_disposition_failed" });
      if (e instanceof ApiError && (e.status === 422 || e.status === 409)) {
        // SPA.27 — the dossier re-render is deleted: the form-mode failure bounces back with the
        // SAME `ferr`/`fmsg` flash vocabulary the finding-action posts already carry (the leaf
        // renders the notice off URL state — `derror` when there's no dossier to land on).
        const key = runId === "" ? "derror" : "ferr";
        const msg =
          e.status === 409
            ? "This finding's disposition is frozen — the ledger locked at delivery."
            : `a rationale is required for ${verb}`;
        return c.redirect(
          `${back}${back.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(findingId)}&fmsg=${encodeURIComponent(msg)}`,
        );
      }
      throw e;
    }
    // `{ok,redirect}` carries the IDENTICAL `?disposed=` flash URL the 302 would have.
    return mutationOutcome(c, { redirect: `${back}${back.includes("?") ? "&" : "?"}disposed=${encodeURIComponent(findingId)}` });
  };
  app.post("/p/:project/review/:runId/findings/:fid/disposition", dispositionHandler);
  app.post("/p/:project/findings/:fid/disposition", dispositionHandler);

  // ---- P1.07 — the findings-surface writes (§5.7; REQ-SPEC-6/REQ-IDE-26/REQ-OBJ-9). All plain form
  // POSTs: Apply splices the suggestion (free, no run), promote lifts a rejected row, Add-to-obligations
  // files a user-sourced obligation. A bounced write redirects back with `ferr=<findingId>` so the
  // dossier re-renders the notice line. ----
  const findingActionHandler =
    (
      act: (session: SessionHeaders, projectId: string, findingId: string) => Promise<unknown>,
      notice: "applied" | "promoted" | "obligated",
    ) =>
    async (c: Context) => {
      const session = deps.session(c);
      // SPA.21 — `wantsJson` dual-mode (REQ-BFF-1/3/4): JSON callers get `{error}`/`{ok,redirect}`,
      // never the document's 302/HTML arms.
      if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
      const slug = c.req.param("project") ?? "";
      const runId = c.req.param("runId") ?? "";
      const findingId = c.req.param("fid") ?? "";
      const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
      if (!row || findingId === "") {
        return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
      }
      const form = await bodyFields(c);
      const nextRaw = typeof form["next"] === "string" ? form["next"] : "";
      const back = safeBack(nextRaw, runId !== "" ? `/p/${slug}/review/${runId}` : `/p/${slug}`);
      try {
        await act(session, row.id, findingId);
      } catch (e) {
        if (wantsJson(c)) return bffFail(c, e, { msg: "dossier_finding_action_failed" });
        if (e instanceof ApiError && (e.status === 404 || e.status === 409 || e.status === 422)) {
          const sep = back.includes("?") ? "&" : "?";
          const msg =
            e.status === 409
              ? "This finding's disposition is frozen — the ledger locked at delivery."
              : e.status === 422
                ? "The suggestion can't be applied — its anchor no longer resolves."
                : "The finding wasn't found.";
          return c.redirect(`${back}${sep}ferr=${encodeURIComponent(findingId)}&fmsg=${encodeURIComponent(msg)}`);
        }
        throw e;
      }
      const sep = back.includes("?") ? "&" : "?";
      return mutationOutcome(c, { redirect: `${back}${sep}${notice}=${encodeURIComponent(findingId)}#finding-${encodeURIComponent(findingId)}` });
    };

  const callApply = (s: SessionHeaders, p: string, f: string) => {
    const fn = deps.dataSource.applyFinding;
    return fn == null ? Promise.reject(new ApiError(404, "finding-write")) : fn(s, p, f);
  };
  const callPromote = (s: SessionHeaders, p: string, f: string) => {
    const fn = deps.dataSource.promoteFinding;
    return fn == null ? Promise.reject(new ApiError(404, "finding-write")) : fn(s, p, f);
  };
  const callObligate = (s: SessionHeaders, p: string, f: string) => {
    const fn = deps.dataSource.addFindingToObligations;
    return fn == null ? Promise.reject(new ApiError(404, "finding-write")) : fn(s, p, f);
  };

  app.post("/p/:project/review/:runId/findings/:fid/apply", findingActionHandler(callApply, "applied"));
  app.post("/p/:project/findings/:fid/apply", findingActionHandler(callApply, "applied"));
  app.post("/p/:project/review/:runId/findings/:fid/promote", findingActionHandler(callPromote, "promoted"));
  app.post("/p/:project/findings/:fid/promote", findingActionHandler(callPromote, "promoted"));
  app.post("/p/:project/review/:runId/findings/:fid/obligations", findingActionHandler(callObligate, "obligated"));
  app.post("/p/:project/findings/:fid/obligations", findingActionHandler(callObligate, "obligated"));

  // ---- P1.07 — the palette's free-form obligation (REQ-OBJ-10). GET renders the one-field form
  //      (the palette row + the Desk's "New obligation" land here); POST files `source: 'user'`
  //      and returns to `next` with the `obligation` notice. ----
  app.get("/p/:project/obligations/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR form is deleted; `?next`/`?back` stay the
    // safeBack-confined URL state the leaf resolves).
    return spaShellDocument(c, deps, session);
  });
  // SPA.21 — `GET /p/:slug/obligations/new`'s twin (design/22 §2 `p.obligationNew` row): the document's
  // own composition verbatim — slug, project title, the `safeBack`-resolved `back`. The create POST
  // is the SAME `/p/:slug/obligations` path with a `wantsJson` branch (the DOM contract's form action
  // is the wire contract).
  app.get("/bff/p/:slug/obligations/new", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    // design/22 `p.obligationNew`: `?back` keeps the `safeBack` `/p/…` confinement.
    const back = safeBack(c.req.query("back") ?? "", `/p/${slug}`);
    return c.json({ obligationNew: { slug, projectTitle: row.title, back } });
  }));
  app.post("/p/:project/obligations", async (c) => {
    const session = deps.session(c);
    // SPA.21 — `wantsJson` dual-mode: JSON callers get `{error}`/`{ok,redirect}`, never HTML/302.
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) {
      return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const form = await bodyFields(c);
    const title = typeof form["title"] === "string" ? form["title"].trim() : "";
    const severity = typeof form["severity"] === "string" ? form["severity"] : "";
    const back = safeBack(typeof form["next"] === "string" ? form["next"] : "", `/p/${slug}`);
    if (title === "") {
      // the document's empty-title arm is a 422 re-render; the JSON arm is the same status + a
      // stable code (the leaf re-renders the form's own error line).
      if (wantsJson(c)) return c.json({ error: "title_required", detail: COPY.obligation.required }, 422);
      // SPA.27 — the SSR form is deleted: a form-mode failure lands back on the form URL (the
      // leaf holds its own field/error state) with the safeBack-confined `back` preserved.
      return c.redirect(`/p/${slug}/obligations/new?back=${encodeURIComponent(back)}`);
    }
    if (deps.dataSource.createObligation == null) {
      if (wantsJson(c)) return c.json({ error: "obligation_unavailable" }, 503);
      return c.redirect(`/p/${slug}/obligations/new?back=${encodeURIComponent(back)}`);
    }
    try {
      await deps.dataSource.createObligation(session, row.id, {
        title,
        severity: (["blocking", "major", "minor", "note"] as const).includes(severity as never)
          ? (severity as "blocking" | "major" | "minor" | "note")
          : "minor",
      });
    } catch (e) {
      if (wantsJson(c)) return bffFail(c, e, { msg: "obligation_create_failed" });
      if (e instanceof ApiError && e.status < 500) {
        return c.redirect(`/p/${slug}/obligations/new?back=${encodeURIComponent(back)}`);
      }
      throw e;
    }
    const sep = back.includes("?") ? "&" : "?";
    return mutationOutcome(c, { redirect: `${back}${sep}obligation=new` });
  });

  // ---- P1.07 — the one-preview bulk actions (§5.7; REQ-IDE-29 amended). bulk-preview bounces to the
  // GET with `?bulk=<action>` (the page renders the consolidated checklist + the single diff); bulk
  // dispatches the CHECKED subset (`only[]` — unchecked rows are never written). ----
  app.post("/p/:project/review/:runId/findings/bulk-preview", async (c) => {
    const session = deps.session(c);
    // SPA.21 — `wantsJson` dual-mode: the preview bounce is a navigation request — a JSON caller
    // gets `{ok,redirect}` carrying the IDENTICAL `?bulk=&bsec=#findings` URL.
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const runId = c.req.param("runId") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const action = typeof form["action"] === "string" ? (form["action"] as string) : "";
    const section = typeof form["section"] === "string" ? (form["section"] as string) : "";
    if (!["apply_notes", "defer_minor", "accept_section"].includes(action)) {
      return mutationOutcome(c, { redirect: `/p/${slug}/review/${runId}` });
    }
    const q = `bulk=${encodeURIComponent(action)}${section !== "" ? `&bsec=${encodeURIComponent(section)}` : ""}`;
    return mutationOutcome(c, { redirect: `/p/${slug}/review/${runId}?${q}#findings` });
  });

  app.post("/p/:project/review/:runId/findings/bulk", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const runId = c.req.param("runId") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const action = typeof form["action"] === "string" ? (form["action"] as string) : "";
    const section = typeof form["section"] === "string" ? (form["section"] as string) : "";
    const only = form["only"] == null ? undefined
      : Array.isArray(form["only"]) ? (form["only"] as string[]).filter((s): s is string => typeof s === "string")
      : typeof form["only"] === "string" ? [form["only"] as string] : undefined;
    const back = `/p/${slug}/review/${runId}`;
    if (!["apply_notes", "defer_minor", "accept_section"].includes(action) || deps.dataSource.applyBulkFindings == null) {
      return mutationOutcome(c, { redirect: back });
    }
    try {
      const result = await deps.dataSource.applyBulkFindings(session, row.id, runId, {
        action: action as "apply_notes" | "defer_minor" | "accept_section",
        ...(section !== "" ? { section } : {}),
        ...(only != null ? { only } : {}),
      });
      return mutationOutcome(c, { redirect: `${back}?bulkdone=${result.count}&bulkskip=${result.skipped.length}#findings` });
    } catch (e) {
      if (wantsJson(c)) return bffFail(c, e, { msg: "dossier_bulk_failed" });
      if (e instanceof ApiError && (e.status === 409 || e.status === 422)) {
        return c.redirect(`${back}?ferr=bulk&fmsg=${encodeURIComponent("The bulk action did not complete — the ledger may be frozen.")}#findings`);
      }
      throw e;
    }
  });

  // ---- P1.07 — the shared deep link (§5.7): /p/:project/f/:fid resolves to the finding's dossier
  //      anchor — the same href the Margin card, Desk row, and palette row land on. ----
  app.get("/p/:project/f/:fid", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const findingId = c.req.param("fid") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row || findingId === "" || deps.dataSource.resolveFinding == null) {
      return c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const resolved = await deps.dataSource.resolveFinding(session, row.id, findingId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!resolved) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.redirect(`/p/${slug}/review/${resolved.runId}#${resolved.anchor}`);
  });

  // PRB.06 — the What-changed page (§5.8): what changed and why for a delivered response. GET renders the
  // server-joined view; the hunk comment POST lands a Guidance row for the next Revise (§6.5).
  // -------------------------------------------------------------------------------------------------------------------
  // SPA.23 — the `editor` surface's five BFF read twins + the handoff POST (design/23 §7,
  // design/22 §2 editor rows; REQ-BFF-1/2/9/11/22). Every twin runs the SAME server-side
  // composition the document performs (REQ-BFF-2) — `docJson` is the only omission (the leaf
  // derives it via `markdownToDoc`, F5) — and URL-echo fields (`?noted`/`?restored`/`?hc`/
  // `?rename`/`?created`/`?derror`/`?layout`/`?commented`) stay leaf-owned. The server-owned keys
  // (`?restore`, `?focus`) ride the twin's query so React Query keys them correctly.
  // -------------------------------------------------------------------------------------------------------------------

  // `GET /bff/p/:slug` — the project-overview aggregate: the shared composition verbatim + the
  // `ide` chrome bag (timeline/feed/status slices included via `overviewIdeOpts`).
  app.get("/bff/p/:slug", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const comp = await projectOverviewComposition(c, session, row);
    const ctx = await ideContext(c, session, { ...row, slug }, overviewIdeOpts(slug, comp, row));
    const { projectVoice, pageLoad } = comp;
    const phone = isPhoneRequest(c);
    return c.json({
      project: {
        title: row.title,
        pill: row.state.pill,
        slug,
        headDraftId: row.headDraftId,
        headDraftN: row.headDraftN ?? null,
        // SPACAP.3 (G2) — the row leg of the forced-SSR truth the boot map cannot carry
        // (`isPhoneRequest(c) || row.showcase === true` on the document): the leaf hands a
        // showcase navigation back to a document load, which lands the forced-SSR arm.
        ...(row.showcase === true ? { showcase: true } : {}),
      },
      gates: comp.gates,
      decisions: comp.decisions,
      approvalOverrides: comp.approvalOverrides,
      ...(comp.approvalSettings ? { approvalSettings: comp.approvalSettings } : {}),
      explainersDismissed: comp.explainersDismissed,
      ...(projectVoice ? { projectVoice } : {}),
      ...(pageLoad
        ? {
            page: {
              slug,
              projectId: row.id,
              doc: pageLoad.doc,
              ...(phone || row.showcase ? { readOnly: true } : {}),
              ...(deps.collabWsUrl && !(phone || row.showcase) ? { collabWsUrl: deps.collabWsUrl } : {}),
            },
          }
        : {}),
      paperTheme: ctx.paperTheme ?? "light",
      ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
      ide: ctx.ide,
    });
  }));

  // REQ-BFF-22 — the handoff POST (the `?focus=1` suppression + the unread-run_finished consume live
  // inside `projectHandoffHandler`, verbatim with the document's redirect arm).
  app.post("/bff/p/:slug/handoff", projectHandoffHandler(deps));

  // `GET /bff/p/:slug/v/:v` — the version Page. The `working`-miss arm answers
  // `{ok:true, redirect:"/p/:slug"}` (the document's 302 verbatim; REQ-BFF-8).
  app.get("/bff/p/:slug/v/:v", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const v = c.req.param("v") ?? "working";
    const vcomp = await versionPageComposition(c, session, row, v);
    if (vcomp.kind === "redirect") return c.json({ ok: true, redirect: `/p/${slug}` });
    if (vcomp.kind === "notFound") return c.json({ error: "not_found" }, 404);
    const { pageLoad, railData, restorePoints, restorePreview } = vcomp;
    const { doc } = pageLoad;
    const phone = isPhoneRequest(c);
    const ctx = await ideContext(c, session, row, {
      status: {
        version: `v${doc.draftN}`,
        ...(doc.meters?.words != null ? { words: doc.meters.words } : {}),
        ...(doc.meters?.readMin != null ? { readMin: doc.meters.readMin } : {}),
        ...(doc.venueCap ? { venueCap: doc.venueCap } : {}),
      },
    });
    return c.json({
      page: {
        slug,
        projectId: row.id,
        doc,
        ...(phone || row.showcase ? { readOnly: true } : {}),
        ...(deps.collabWsUrl && !(phone || row.showcase) ? { collabWsUrl: deps.collabWsUrl } : {}),
        ...(railData && !phone
          ? { rail: pageRailBag(doc.draftN, railData, restorePoints, restorePreview) }
          : {}),
      },
      project: {
        title: row.title,
        pill: row.state.pill,
        slug,
        headDraftId: row.headDraftId,
        ...(row.showcase === true ? { showcase: true } : {}),
      },
      paperTheme: ctx.paperTheme ?? "light",
      ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
      ide: ctx.ide,
    });
  }));

  // `GET /bff/p/:slug/v/:n/diff/:m` — the §5.8 generalized compare (`?layout`/`?commented` are
  // leaf-owned echoes; `m` may be `working`).
  app.get("/bff/p/:slug/v/:n/diff/:m", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const n = c.req.param("n") ?? "";
    const m = c.req.param("m") ?? "";
    const data = await deps.dataSource.getVersionDiff(session, row.id, n, m).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!data) return c.json({ error: "not_found" }, 404);
    const ctx = await ideContext(c, session, row);
    return c.json({
      compare: { slug, n, m, data },
      project: {
        title: row.title,
        pill: row.state.pill,
        slug,
        headDraftId: row.headDraftId,
        ...(row.showcase === true ? { showcase: true } : {}),
      },
      paperTheme: ctx.paperTheme ?? "light",
      ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
      ide: ctx.ide,
    });
  }));

  // `GET /bff/p/:slug/a/:artifactId` — the read-only artifact Page (415/404 → the twin's 404).
  app.get("/bff/p/:slug/a/:artifactId", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const doc = await deps.dataSource
      .getArtifactPage(session, row.id, c.req.param("artifactId") ?? "")
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 404 || e.status === 415)) return null;
        throw e;
      });
    if (!doc) return c.json({ error: "not_found" }, 404);
    const ctx = await ideContext(c, session, row, {
      status: {
        version: `v${doc.draftN}`,
        ...(doc.meters?.words != null ? { words: doc.meters.words } : {}),
        ...(doc.meters?.readMin != null ? { readMin: doc.meters.readMin } : {}),
      },
    });
    return c.json({
      page: { slug, projectId: row.id, doc, readOnly: true },
      project: {
        title: row.title,
        pill: row.state.pill,
        slug,
        headDraftId: row.headDraftId,
        ...(row.showcase === true ? { showcase: true } : {}),
      },
      paperTheme: ctx.paperTheme ?? "light",
      ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
      ide: ctx.ide,
    });
  }));

  // `GET /bff/p/:slug/revisions/:cid` — the What-changed read (`?commented` is a leaf-owned echo).
  app.get("/bff/p/:slug/revisions/:cid", bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug") ?? "";
    const row = await bffProjectRow(c, deps.dataSource, session, slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const data = await deps.dataSource.getWhatChanged(session, row.id, c.req.param("cid") ?? "").catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!data) return c.json({ error: "not_found" }, 404);
    const ctx = await ideContext(c, session, row);
    return c.json({
      revision: { slug, data },
      project: {
        title: row.title,
        pill: row.state.pill,
        slug,
        headDraftId: row.headDraftId,
        ...(row.showcase === true ? { showcase: true } : {}),
      },
      paperTheme: ctx.paperTheme ?? "light",
      ...(ctx.theme?.pref ? { appTheme: ctx.theme.pref } : {}),
      ide: ctx.ide,
    });
  }));

  app.get("/p/:project/revisions/:cid", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const cid = c.req.param("cid");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // The Page family's forced-SSR capability check (REQ-ED-12 + REQ-VFY-5): phone / read-only
    // showcase keeps the server-rendered revision document — the only renderer decision left
    // (SPA.28: the `?ssr=1`/`x-rhema-renderer` escape is gone); everything else gets the shell.
    if (isPhoneRequest(c) || row.showcase === true) {
      const data = await deps.dataSource.getWhatChanged(session, row.id, cid).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      });
      if (!data) return c.html(renderDocument(c.req.path, notFoundElement), 404);
      const commented = c.req.query("commented") || undefined;
      return c.html(
        renderDocument(c.req.path, revisionElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          revision: { slug, data, ...(commented ? { commentedHunkId: commented } : {}) },
          compact: isPhoneRequest(c),
          ssrCause: isPhoneRequest(c) ? "phone" : "showcase",
        }),
      );
    }
    return spaShellDocument(c, deps, session, { paperTheme: row.paperTheme });
  });

  app.post("/p/:project/revisions/:cid/hunks/:hunkId/comments", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const cid = c.req.param("cid");
    const hunkId = c.req.param("hunkId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const form = await c.req.parseBody();
    const text = typeof form.text === "string" ? form.text.trim() : "";
    if (text !== "") {
      await deps.dataSource.commentOnHunk(session, row.id, cid, hunkId, text).catch(() => undefined);
    }
    const href = `/p/${slug}/revisions/${cid}?commented=${encodeURIComponent(hunkId)}`;
    // SPA.23 — the leaf's delegated submit posts JSON; the form post keeps the redirect
    // (mutationOutcome owns the wantsJson fork).
    return mutationOutcome(c, { redirect: href });
  });

  // -------------------------------------------------------------------------------------------------------------------
  // PRB.07 — the source editor (§5.4/§6.3; REQ-BETA-21 stopgap #1 → 1.x Source mode). GET renders the SSR
  // page (CodeMirror host + lock banner + projected findings rail + note field); the client bundle then
  // drives the debounced autosave + lock poll through the same-origin routes below — the browser never
  // talks to the api directly, so the session stays server-side. The form POSTs (note / cancel-run /
  // revise) are progressive enhancement: they work with no JS at all. There is no Save button and no
  // unsaved-changes dialog anywhere — /save is the autosave/beacon endpoint, not a control.
  // -------------------------------------------------------------------------------------------------------------------

  /** Resolve :project → the row + draftId param, or null (404). */
  const editorTarget = async (c: Context, session: SessionHeaders) => {
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return null;
    return { slug, row, draftId: c.req.param("draftId") ?? "" };
  };

  // -------------------------------------------------------------------------------------------------------------------
  // P1.02 + EDIT.1 — the Page routes (§5.4; REQ-DATA-28/29 amended). `/p/:project/v/working` resolves
  // the EDITABLE head (ADR-048: the working head, else the highest-n draft — a frozen import or
  // reviewed head served editable-with-banner as the lazy-fork source); `/p/:project/v/:n` renders
  // that version's draft exactly (frozen ⇒ still editable — the first keystroke's autosave forks
  // v(N+1) server-side). The CodeMirror `/edit/:draftId` page is superseded (redirect below); its
  // same-origin /doc /save /note /cancel-run /revise endpoints stay — they ARE the Page's transport
  // surface (the seam, unchanged for P1.03's swap).
  // -------------------------------------------------------------------------------------------------------------------

  app.get("/p/:project/v/:v", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // The Page family's forced-SSR capability check (REQ-ED-12 + REQ-VFY-5): phone / read-only
    // showcase keeps the server-rendered Page — the only renderer decision left (SPA.28: the
    // `?ssr=1`/`x-rhema-renderer` escape is gone); everything else gets the shell.
    if (isPhoneRequest(c) || row.showcase === true) {
      const v = c.req.param("v") ?? "working";
      const vcomp = await versionPageComposition(c, session, row, v);
      // EDIT.1 — `working` resolves the EDITABLE head (working head, else highest-n draft served as
      // the lazy-fork source); a 404 here now means the project has no drafts at all — send the reader
      // back to the project page (the empty-state cards / import affordance live there) instead of
      // dead-ending on the 404 view. A numeric /v/:n keeps the truthful 404.
      if (vcomp.kind === "redirect") return c.redirect(`/p/${slug}`);
      if (vcomp.kind === "notFound") return c.html(renderDocument(c.req.path, notFoundElement), 404);
      const { pageLoad, railData, restorePoints, restorePreview } = vcomp;
      const { doc } = pageLoad;

      // P1.08 — the `?restored=<n>` undoable-apply notice is a display echo (never payload).
      const restoredQ = c.req.query("restored");
      const restoredN = restoredQ != null ? Number(restoredQ) : null;
      // P1.19 — §10.1: below ~768px the Page is reader-only (the ✗ column bans editing; the rail's
      // restore/diff affordances hide with it).
      const phone = isPhoneRequest(c);

      return c.html(
        renderDocument(c.req.path, pageElement, {
          ...(await ideContext(c, session, row, {
            status: {
              version: `v${doc.draftN}`,
              ...(doc.meters?.words != null ? { words: doc.meters.words } : {}),
              ...(doc.meters?.readMin != null ? { readMin: doc.meters.readMin } : {}),
              ...(doc.venueCap ? { venueCap: doc.venueCap } : {}),
            },
          })),
          project: {
            title: row.title,
            pill: row.state.pill,
            slug,
            headDraftId: row.headDraftId,
            // ONB.1 — the consumed-hold marker (`?hc=`) rides the fix-now landing too.
            ...(c.req.query("hc") ? { heldConsumed: c.req.query("hc") } : {}),
          },
          compact: phone,
          ssrCause: phone ? "phone" : "showcase",
          page: {
            slug,
            projectId: row.id,
            doc,
            docJson: pageLoad.docJson,
            // phone width ⇒ reader-only Page (§10.1): no edits, no collab wire, no version rail.
            // EDIT.1 — the Showcase Page is read-only too (§15.4): the guard 409s its HTTP saves and
            // the collab attach is read-only, so the SSR must carry the same posture (the read-only
            // note + banner, no editable affordance).
            ...(phone || row.showcase ? { readOnly: true } : {}),
            // a read-only SSR page gets NO collab wire: the island mounts the static view and nothing
            // connects, types, or forks (locks mid-session still attach read-only + the rhema.readonly
            // stateless flips the pill — the socket stays for pages that were writable at render).
            ...(deps.collabWsUrl && !(phone || row.showcase) ? { collabWsUrl: deps.collabWsUrl } : {}),
            ...(c.req.query("noted") ? { noteSaved: true } : {}),
            ...(railData && !phone
              ? { rail: pageRailBag(doc.draftN, railData, restorePoints, restorePreview, restoredN) }
              : {}),
          },
          dwellSurface: "page",
        }),
      );
    }
    return spaShellDocument(c, deps, session, { paperTheme: row.paperTheme });
  });

  // P1.08 — the undoable restore-point apply (§5.8; REQ-IDE-34): the preview card's POST lands here;
  // the api writes a "Before restore" point on the CURRENT state first, then applies through
  // saveManualRevision (frozen ⇒ fork; agent/imported head ⇒ 409 → the page re-renders unchanged).
  app.post("/p/:project/v/:v/restore/:rp", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const v = c.req.param("v") ?? "working";
    const resolved = await deps.dataSource.resolveEditorDraft(session, row.id, v).catch(() => null);
    if (!resolved) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const applied = await Promise.resolve()
      .then(() => deps.dataSource.applyRestorePoint?.(session, row.id, resolved.draftId, c.req.param("rp") ?? ""))
      .catch(() => undefined);
    // A 409/404/503 (locked, unknown, unavailable) re-renders the page without the notice — the
    // preview card simply re-appears; a success redirects with `?restored=<n>` on the new head.
    const href =
      applied?.ok === true
        ? `/p/${slug}/v/${applied.draftN}?restored=${applied.draftN}`
        : `/p/${slug}/v/${v}`;
    // SPA.23 — a JSON caller gets the mutation envelope (the applied DTO on success, null on the
    // miss) with the same landing href; the form post keeps the redirect (mutationOutcome owns the
    // wantsJson fork).
    return mutationOutcome(c, { data: applied?.ok === true ? applied : null, redirect: href });
  });

  // P1.08 — the §5.8 generalized compare (REQ-IDE-33): `/v/:n/diff/:m` over ANY draft pair (`m` may be
  // `working`), `?layout=side|inline|moves` picks the read-only layout; the api projection is the SAME
  // What-changed assembly the response page renders (unledgered pairs land every hunk Unlinked).
  app.get("/p/:project/v/:n/diff/:m", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // The Page family's forced-SSR capability check (REQ-ED-12 + REQ-VFY-5): phone / read-only
    // showcase keeps the SSR compare — the only renderer decision left (SPA.28: the `?ssr=1` /
    // `x-rhema-renderer` escape is gone); everything else gets the shell.
    if (isPhoneRequest(c) || row.showcase === true) {
      const n = c.req.param("n") ?? "";
      const m = c.req.param("m") ?? "";
      const data = await deps.dataSource.getVersionDiff(session, row.id, n, m).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      });
      if (!data) return c.html(renderDocument(c.req.path, notFoundElement), 404);
      const layoutQ = c.req.query("layout");
      const layout = layoutQ === "inline" || layoutQ === "moves" ? layoutQ : "side";
      const commented = c.req.query("commented") || undefined;
      return c.html(
        renderDocument(c.req.path, compareElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          compare: { slug, n, m, layout, data, ...(commented ? { commentedHunkId: commented } : {}) },
          compact: isPhoneRequest(c),
          ssrCause: isPhoneRequest(c) ? "phone" : "showcase",
          dwellSurface: "page",
        }),
      );
    }
    return spaShellDocument(c, deps, session, { paperTheme: row.paperTheme });
  });

  // The compare page's hunk-comment POST — a Guidance row for the next Revise (`source:'inline_comment'`,
  // anchored server-side on the resolved hunk). Progressive enhancement: plain form POST → redirect.
  app.post("/p/:project/v/:n/diff/:m/hunks/:hunkId/comments", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const n = c.req.param("n") ?? "";
    const m = c.req.param("m") ?? "";
    const hunkId = c.req.param("hunkId") ?? "";
    const form = await c.req.parseBody();
    const text = typeof form.text === "string" ? form.text.trim() : "";
    if (text !== "") {
      await deps.dataSource.commentOnCompareHunk(session, row.id, n, m, hunkId, text).catch(() => undefined);
    }
    const href = `/p/${slug}/v/${n}/diff/${m}?commented=${encodeURIComponent(hunkId)}`;
    // SPA.23 — the leaf's delegated submit posts JSON; the form post keeps the redirect
    // (mutationOutcome owns the wantsJson fork).
    return mutationOutcome(c, { redirect: href });
  });

  // P1.02 item 4 — the Page renders ANY markdown artifact, read-only (non-draft kinds have no save
  // path; the DTO's draftId is the artifact id, so the transport URLs 404 if ever called — the island
  // mounts read-only anyway).
  app.get("/p/:project/a/:artifactId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // The Page family's forced-SSR capability check (REQ-ED-12 + REQ-VFY-5): phone / read-only
    // showcase keeps the SSR artifact Page — the only renderer decision left (SPA.28: the
    // `?ssr=1`/`x-rhema-renderer` escape is gone); everything else gets the shell.
    if (isPhoneRequest(c) || row.showcase === true) {
      const doc = await deps.dataSource
        .getArtifactPage(session, row.id, c.req.param("artifactId") ?? "")
        .catch((e) => {
          if (e instanceof ApiError && (e.status === 404 || e.status === 415)) return null;
          throw e;
        });
      if (!doc) return c.html(renderDocument(c.req.path, notFoundElement), 404);
      return c.html(
        renderDocument(c.req.path, pageElement, {
          ...(await ideContext(c, session, row, {
            status: {
              version: `v${doc.draftN}`,
              ...(doc.meters?.words != null ? { words: doc.meters.words } : {}),
              ...(doc.meters?.readMin != null ? { readMin: doc.meters.readMin } : {}),
            },
          })),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          compact: isPhoneRequest(c),
          page: {
            slug,
            projectId: row.id,
            doc,
            docJson: docJsonFor(doc),
            readOnly: true,
          },
          ssrCause: isPhoneRequest(c) ? "phone" : "showcase",
          dwellSurface: "page",
        }),
      );
    }
    return spaShellDocument(c, deps, session, { paperTheme: row.paperTheme });
  });

  // The superseded CodeMirror page redirects to the Page (the route's JSON/form endpoints below stay —
  // the Page's transport uses them; `?noted=1` survives the hop).
  app.get("/p/:project/edit/:draftId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // EDIT.1 — a non-exact read: a stale base id lands on its working child (`/v/<childN>`, the live
    // editing surface) rather than on the frozen view, matching the save/doc routes' resolution.
    const doc = await deps.dataSource.getEditorDoc(session, t.row.id, t.draftId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!doc) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const noted = c.req.query("noted") ? "?noted=1" : "";
    return c.redirect(`/p/${t.slug}/v/${doc.draftN}${noted}`);
  });

  // The client bundle's lock poll — the doc read as JSON (the api's EditorDocDto verbatim).
  app.get("/p/:project/edit/:draftId/doc", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const t = await editorTarget(c, session);
    if (!t) return c.json({ error: "not_found" }, 404);
    const doc = await deps.dataSource.getEditorDoc(session, t.row.id, t.draftId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!doc) return c.json({ error: "not_found" }, 404);
    return c.json(doc);
  });

  // The debounced autosave (no Save button — this IS the save). The client bundle POSTs
  // application/json { markdown }; the pagehide beacon POSTs text/plain raw markdown (beacons can't set
  // JSON content types). A held §6.3 lock → the api's 409 passes through.
  app.post("/p/:project/edit/:draftId/save", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const t = await editorTarget(c, session);
    if (!t) return c.json({ error: "not_found" }, 404);
    const contentType = c.req.header("content-type") ?? "";
    let markdown: string | null = null;
    // P1.02 — the Page's live provenance capture rides the same JSON save body.
    let meta: { provenanceSpans?: { blockId: string; source: unknown }[]; agentSpans?: { blockId: string; from: number; to: number }[] } | undefined;
    if (contentType.includes("text/plain")) {
      markdown = await c.req.text();
    } else {
      const body = (await c.req.json().catch(() => ({}))) as {
        markdown?: string;
        provenanceSpans?: { blockId: string; source: unknown }[];
        agentSpans?: { blockId: string; from: number; to: number }[];
      };
      if (typeof body.markdown === "string") markdown = body.markdown;
      if (body.provenanceSpans || body.agentSpans) {
        meta = { provenanceSpans: body.provenanceSpans, agentSpans: body.agentSpans };
      }
    }
    if (markdown == null) return c.json({ error: "markdown required" }, 400);
    try {
      // only pass the 5th arg when the Page sent capture metadata — keeps the no-meta call shape the
      // beta contract established (and the existing route tests' exact-arity assertions intact).
      const saved = meta
        ? await deps.dataSource.saveEditorDraft(session, t.row.id, t.draftId, markdown, meta)
        : await deps.dataSource.saveEditorDraft(session, t.row.id, t.draftId, markdown);
      return c.json(saved);
    } catch (e) {
      // The api's status passes through — 409 (locked) is what flips the client bundle into the
      // read-only banner state; 5xx/network failures queue the doc for retry.
      if (e instanceof ApiError) return c.json({ error: e.message }, e.status as 400);
      throw e;
    }
  });

  // The note field → a Guidance row (REQ-DATA-41's beta form). Progressive enhancement: a plain form POST.
  app.post("/p/:project/edit/:draftId/note", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const form = await c.req.parseBody();
    const text = typeof form.text === "string" ? form.text.trim() : "";
    if (text !== "") {
      await deps.dataSource.postEditorNote(session, t.row.id, t.draftId, text).catch(() => undefined);
    }
    const href = `/p/${t.slug}/edit/${t.draftId}?noted=1`;
    // SPA.23 — the leaf's delegated submit posts JSON; the form post keeps the redirect (the
    // /edit/:draftId GET still resolves to its /v/:n hop for both — mutationOutcome owns the
    // wantsJson fork).
    return mutationOutcome(c, { redirect: href });
  });

  // The banner's "Cancel run to edit" release (§6.3). A stale banner (the run already ended) just
  // re-renders — the next doc poll shows the released lock.
  app.post("/p/:project/edit/:draftId/cancel-run", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    await deps.dataSource.cancelEditorRun(session, t.row.id, t.draftId).catch(() => undefined);
    const href = `/p/${t.slug}/edit/${t.draftId}`;
    // SPA.23 — the leaf's delegated submit posts JSON; the form post keeps the redirect
    // (mutationOutcome owns the wantsJson fork).
    return mutationOutcome(c, { redirect: href });
  });

  // "Revise using your edits" (REQ-DATA-26): review of vN + the v(N+1) human-revision base. Lands on the
  // project page where the new run's card reports progress.
  app.post("/p/:project/edit/:draftId/revise", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) {
      return wantsJson(c)
        ? c.json({ error: "not_found" }, 404)
        : c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    await deps.dataSource.reviseWithEdits(session, t.row.id, t.draftId).catch(() => undefined);
    const href = `/p/${t.slug}`;
    // SPA.23 — the leaf's delegated submit posts JSON; the form post keeps the redirect
    // (mutationOutcome owns the wantsJson fork).
    return mutationOutcome(c, { redirect: href });
  });

  // -------------------------------------------------------------------------------------------------------------------
  // PRB.11 — export + the AI-use statement (§13.4, §8.4 REQ-VIS-10, §11.7). The dialog GET reads formats +
  // the never-blocking obligation line + the statement preview (opening it sweeps pre_export horizons);
  // the export POST proxies the binary download; the addition POST is the only statement write
  // (append-only); /export/ai-use/:fmt is the standalone statement download.
  // -------------------------------------------------------------------------------------------------------------------

  /** slug → the project row (the shell's canonical lookup). */
  const projectRow = async (c: Context, session: SessionHeaders) => {
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    return row ? { slug, row } : null;
  };

  app.get("/p/:project/export", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR dialog is deleted; `?error`/`?added` stay
    // leaf-owned URL echoes).
    return spaShellDocument(c, deps, session);
  });

  // The export POST — a plain form POST that streams the download back (progressive enhancement: no JS).
  app.post("/p/:project/export", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const t = await projectRow(c, session);
    if (!t) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    // SPA.17 (REQ-BFF-17) — the export's product is a binary `content-disposition` Response:
    // bytes never traverse a JSON envelope, so a `wantsJson` caller gets the honest refusal
    // instead of a 302 it could never follow to a file. The SPA keeps the NATIVE form POST —
    // the download IS the document navigation (design/22 §5).
    if (wantsJson(c)) return c.json({ error: "binary_download" }, 400);
    const form = await c.req.parseBody();
    const format = typeof form.format === "string" && isExportFormat(form.format) ? form.format : null;
    if (!format) {
      return c.redirect(`/p/${t.slug}/export?error=1`);
    }
    // P1.18 — the profile is md-only (a select the page always renders; drop it for any other
    // format so the SSR form can't 422 on a legal combination — the api enforces the same rule).
    const profile =
      format === "md" && typeof form.profile === "string" && isMdExportProfile(form.profile)
        ? form.profile
        : undefined;
    const cslStyle =
      typeof form.cslStyle === "string" && isCslStyle(form.cslStyle) ? form.cslStyle : undefined;
    try {
      const dl = await deps.dataSource.exportProject(session, t.row.id, {
        format,
        ...(profile ? { profile } : {}),
        ...(cslStyle ? { cslStyle } : {}),
        attachAiUse: form.attachAiUse === "on",
        attachProvenance: form.attachProvenance === "on",
      });
      return new Response(dl.bytes, {
        status: 200,
        headers: {
          "content-type": dl.mediaType,
          "content-disposition": `attachment; filename="${dl.fileName}"`,
        },
      });
    } catch {
      return c.redirect(`/p/${t.slug}/export?error=1`);
    }
  });

  // The append-only statement write — one sentence at a time (REQ-VIS-10; no edit/delete exists).
  app.post("/p/:project/export/addition", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const t = await projectRow(c, session);
    if (!t) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    // SPA.17 — the `wantsJson` split (REQ-BFF-1/2/3): a JSON caller posts `{sentence}` and gets
    // the `{ok,redirect}` envelope whose redirect is the SAME `?added=1` flash target; the form
    // post's 302 is verbatim.
    const form = await bodyFields(c);
    const sentence = typeof form.sentence === "string" ? form.sentence.trim() : "";
    if (sentence !== "") {
      await deps.dataSource.appendAiUseAddition(session, t.row.id, sentence).catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: `/p/${t.slug}/export?added=1` });
  });

  // The standalone statement download (any registered format — the §8.4 REQ-VIS-10 artifact).
  app.get("/p/:project/export/ai-use/:fmt", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await projectRow(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const fmt = c.req.param("fmt");
    if (!isExportFormat(fmt)) {
      return c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const dl = await deps.dataSource.downloadAiUseStatement(session, t.row.id, fmt).catch(() => null);
    if (!dl) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return new Response(dl.bytes, {
      status: 200,
      headers: {
        "content-type": dl.mediaType,
        "content-disposition": `attachment; filename="${dl.fileName}"`,
      },
    });
  });

  // -------------------------------------------------------------------------------------------------------------------
  // PRB.10 — Quick Voice (§9.2–§9.6). SSR only: the library, the creation sheet, the detail page (seed
  // editor + samples + build history), the project picker's POST, and the run sheet's chained
  // "Update voice first" action. Every pill renders the shared status projection verbatim.
  // -------------------------------------------------------------------------------------------------------------------

  // The run sheet's "Update voice first (≈N cr)" — launches a Quick-Voice build for the project's linked
  // persona and lands back on the sheet (the sheet re-reads the pill, which now says Building). The main
  // run is NEVER blocked by voice state — this is the optional chained action only.
  app.post("/p/:project/update-voice", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await projectRows(c, deps.dataSource, session)).find((r) => r.slug === slug);
    if (!row) return wantsJson(c) ? c.json({ error: "not_found" }, 404) : c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const personaId = typeof form.voice_persona === "string" ? form.voice_persona : "";
    if (personaId) {
      await deps.dataSource
        .buildVoice(session, personaId, {
          tier: "quick",
          projectId: row.id,
          ...(cogsLeversField(str("cogsLevers")) ? { cogsLevers: cogsLeversField(str("cogsLevers")) } : {}),
        })
        .catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: `/p/${slug}/run${new URL(c.req.url).search}` });
  });

  // The voice library — the §9.1 three-group destination (your voices / house styles / shared).
  app.get("/voices", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR library is deleted).
    return spaShellDocument(c, deps, session);
  });

  // The §9.2 creation sheet (GET) — name required; description/byline/sample/mode/tier optional.
  app.get("/voices/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR sheet is deleted).
    return spaShellDocument(c, deps, session);
  });

  // The creation sheet's POST: create the persona (+ Mode metadata), attach any pasted sample through the
  // §9.5 model, and — on "Create and build" — start the profile_voice{tier: quick} run (§9.2 item 3).
  app.post("/voices/new", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const name = str("name").trim();
    if (!name) {
      // SPA.13 — the JSON caller gets the refusal the document would re-render (REQ-BFF-2): the
      // SAME copy as `voiceNew.error`, stable code, preserved status.
      if (wantsJson(c)) return c.json({ error: "name_required", detail: COPY.voice.new.nameRequired }, 400);
      // SPA.27 — the SSR sheet is deleted: a form-mode failure lands back on the form URL (the
      // leaf holds its own field/error state; `?err` rides the notice vocabulary).
      return c.redirect("/voices/new?err=name_required");
    }
    const intent = str("intent") === "build" ? "build" : "save";
    // Upload OR paste (§9.2 beta subset): a .md/.txt/.html file decodes to canonical text here; richer
    // formats ride the same quarantine→convert seam the api accepts as `quarantineKey` (the deploy leg).
    // SPA.13 (REQ-BFF-16) — a JSON caller carries `quarantineKey` instead: the browser already
    // presigned→PUT the bytes (the BFF never proxies them); the api's convert seam resolves it.
    const quarantineKey = str("quarantineKey").trim();
    const file = form.sample_file;
    const fileText =
      file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0
        ? new TextDecoder().decode(await (file as File).arrayBuffer())
        : "";
    const sampleText = (fileText || str("sample_text")).trim();
    // A quarantined upload counts as corpus for the sheet's own build gate, same as pasted text.
    const hasSample = sampleText !== "" || quarantineKey !== "";
    const sampleUrl = str("sample_url").trim();
    const tier = str("tier") === "full" ? "full" : "quick";
    // The sheet's own gate mirrors the api's (shared constants in findings-core): Quick needs a
    // description or ≥1 sample; Full needs ≥4 samples — the creation sheet attaches at most two
    // (text/file + URL), so a Full build always lands on the detail page to add the rest.
    if (intent === "build" && tier === "quick" && !hasSample && !sampleUrl) {
      if (wantsJson(c)) return c.json({ error: "sample_required", detail: COPY.voice.new.sampleRequired }, 400);
      return c.redirect("/voices/new?err=sample_required");
    }
    if (intent === "build" && tier === "full") {
      const hasCorpus = hasSample || sampleUrl !== "";
      if (!hasCorpus) {
        if (wantsJson(c)) return c.json({ error: "full_required", detail: COPY.voice.new.fullRequired }, 400);
        return c.redirect("/voices/new?err=full_required");
      }
    }
    const created = await deps.dataSource.createVoice(session, {
      name,
      ...(str("byline").trim() ? { byline: str("byline").trim() } : {}),
      ...(str("description").trim() ? { description: str("description") } : {}),
      mode: str("mode") || "self",
    });
    if (quarantineKey) {
      // The browser's presign→direct-PUT leg already landed the bytes in quarantine (REQ-BFF-16);
      // the api's convert seam resolves the key — the BFF never proxied them.
      await deps.dataSource
        .addVoiceSample(session, created.personaId, {
          quarantineKey,
          ...(str("sample_title").trim() ? { title: str("sample_title").trim() } : {}),
        })
        .catch(() => undefined);
    } else if (sampleText) {
      await deps.dataSource
        .addVoiceSample(session, created.personaId, {
          text: sampleText,
          ...(str("sample_title").trim() ? { title: str("sample_title").trim() } : {}),
        })
        .catch(() => undefined);
    }
    // The fetcher-only URL path (REQ-INGEST-13) — the api fetches; the sheet never does.
    if (sampleUrl) {
      await deps.dataSource
        .addVoiceSampleUrl(session, created.personaId, { url: sampleUrl })
        .catch(() => undefined);
    }
    if (intent === "build") {
      const built = await deps.dataSource
        .buildVoice(session, created.personaId, {
          tier,
          ...(cogsLeversField(str("cogsLevers")) ? { cogsLevers: cogsLeversField(str("cogsLevers")) } : {}),
        })
        .then(() => true)
        .catch(() => false);
      // The api's gate rejected the build (e.g. Full needs ≥4 samples — the sheet carries at most
      // two) → land on the detail page with the notice instead of a silent drop.
      if (!built) return mutationOutcome(c, { redirect: `/v/${created.personaId}?build_failed=1` });
    }
    return mutationOutcome(c, { redirect: `/v/${created.personaId}` });
  });

  // The voice detail page (§9.5): five tabs — Overview (pill + diff-of-inputs + gate card),
  // Description (seed + corrections + build notes), Samples, Profile, Runs. `?tab=` selects;
  // unknown/absent ⇒ overview.
  app.get("/v/:persona", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.27 — sole renderer: the shell (the SSR detail page is deleted; `?tab`/`?sample` +
    // the notice params stay leaf-owned URL state).
    return spaShellDocument(c, deps, session);
  });

  // The seed editor's save — recomputes the J9 hash; the pill flips live on the redirect (§9.3).
  app.post("/v/:persona/seed", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const registers = str("registers")
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r !== "");
    await deps.dataSource
      .saveVoiceSeed(session, personaId, {
        description: str("description"),
        byline: str("byline"),
        registers,
      })
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?saved=1` });
  });

  // A pasted sample through the §9.5 model — the response's refreshed corpus words + status are the
  // estimate's <500 ms refresh (REQ-PERSONA-3); the redirect re-reads them.
  app.post("/v/:persona/samples", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const file = form.file;
    const fileText =
      file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0
        ? new TextDecoder().decode(await (file as File).arrayBuffer())
        : "";
    // SPA.13 (REQ-BFF-16) — a JSON caller can carry a `quarantineKey` instead: the browser already
    // presigned→PUT the bytes (the BFF never proxies them); the api's convert seam resolves it.
    // The form path keeps server-side byte-transit (the no-JS floor).
    const quarantineKey = str("quarantineKey").trim();
    const text = (fileText || str("text")).trim();
    if (quarantineKey) {
      await deps.dataSource
        .addVoiceSample(session, personaId, {
          quarantineKey,
          ...(str("title").trim() ? { title: str("title").trim() } : {}),
        })
        .catch(() => undefined);
    } else if (text) {
      await deps.dataSource
        .addVoiceSample(session, personaId, {
          text,
          ...(str("title").trim() ? { title: str("title").trim() } : {}),
        })
        .catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: `/v/${personaId}?added=1` });
  });

  // P1.14 — the fetcher-only URL ingestion path (REQ-INGEST-13): the api's fetcher is the only
  // network path; a failed fetch re-renders the Samples tab (the error never becomes a sample).
  // Registered BEFORE /samples/:itemId — otherwise `url` would be eaten as an item id.
  app.post("/v/:persona/samples/url", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const url = typeof form.url === "string" ? form.url.trim() : "";
    const title = typeof form.title === "string" && form.title.trim() !== "" ? form.title.trim() : undefined;
    if (url) {
      await deps.dataSource
        .addVoiceSampleUrl(session, personaId, { url, ...(title ? { title } : {}) })
        .catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples&added=1` });
  });

  // The per-item include/omit toggle (REQ-INGEST-4).
  app.post("/v/:persona/samples/:itemId", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const included = form.included === true || form.included === "true" || form.included === "on";
    await deps.dataSource
      .setVoiceSampleIncluded(session, personaId, c.req.param("itemId"), included)
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples` });
  });

  // ---- P1.15 — the Sources pane (§9.5): link / discover / confirm / re-sync / settings / remove. ----

  // Link a source. Three provider flows, one route: `provider` selects the shape — a Substack
  // publication address, a single URL, or a Substack export zip (multipart file → quarantine →
  // the substack_export connection). There is NO credential field anywhere in the form (AC-I-B).
  app.post("/v/:persona/connections", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string).trim() : "");
    const provider = str("provider");
    try {
      if (provider === "substack" && str("handle")) {
        await deps.dataSource.createVoiceConnection(session, personaId, {
          provider: "substack",
          handle: str("handle"),
          ...(form.dailySync ? { dailySync: true } : {}),
        });
      } else if (provider === "url" && str("url")) {
        await deps.dataSource.createVoiceConnection(session, personaId, {
          provider: "url",
          url: str("url"),
        });
      } else if (provider === "substack_export" && str("quarantineKey")) {
        // SPA.13 (REQ-BFF-16) — the browser's presign→direct-PUT leg already landed the bytes in
        // quarantine; the JSON body carries the key verbatim. The BFF never proxies them.
        await deps.dataSource.createVoiceConnection(session, personaId, {
          provider: "substack_export",
          quarantineKey: str("quarantineKey"),
        });
      } else if (provider === "substack_export") {
        const file = form.file;
        const bytes =
          file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0
            ? new Uint8Array(await (file as File).arrayBuffer())
            : null;
        if (bytes) {
          await deps.dataSource.linkVoiceExportZip(session, personaId, bytes);
        }
      }
    } catch {
      // The link failed — the Sources pane re-renders with the connection's own error line.
    }
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples` });
  });

  // The review step: discovery rows land server-side (listing data only — REQ-INGEST-3); the
  // Samples tab then shows them awaiting the confirm checkboxes.
  app.post("/v/:persona/connections/:cid/discover", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    await deps.dataSource
      .discoverVoiceConnection(session, personaId, c.req.param("cid"))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples` });
  });

  // The confirm step (REQ-INGEST-4): checked items' externalIds ride `include` (repeatable);
  // everything the provider listed but the box left unchecked is omitted.
  app.post("/v/:persona/connections/:cid/confirm", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const cid = c.req.param("cid");
    // Multi-value grammar: a form post repeats `include`/`known` (parseBody all:true); a JSON caller
    // posts string arrays — bodyFields decodes them verbatim (REQ-BFF-2's flat-field contract).
    const form = wantsJson(c)
      ? await bodyFields(c)
      : await c.req.parseBody({ all: true });
    const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v != null && v !== "" ? [v] : []);
    const included = new Set(list(form.include).filter((v): v is string => typeof v === "string"));
    const known = list(form.known).filter((v): v is string => typeof v === "string");
    await deps.dataSource
      .confirmVoiceConnection(session, personaId, cid, {
        items: known.map((externalId) => ({ externalId, include: included.has(externalId) })),
      })
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples` });
  });

  // The manual Re-sync (REQ-INGEST-6) + "Re-sync all".
  app.post("/v/:persona/connections/:cid/sync", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    await deps.dataSource
      .syncVoiceConnection(session, personaId, c.req.param("cid"))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples` });
  });
  app.post("/v/:persona/sync", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    await deps.dataSource.syncAllVoiceConnections(session, personaId).catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples` });
  });

  // The per-source settings (auto-include new items; daily auto-sync).
  app.post("/v/:persona/connections/:cid/settings", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    await deps.dataSource
      .patchVoiceConnection(session, personaId, c.req.param("cid"), {
        autoIncludeNew: form.autoIncludeNew === "on" || form.autoIncludeNew === "true" || form.autoIncludeNew === true,
        dailySync: form.dailySync === "on" || form.dailySync === "true" || form.dailySync === true,
      })
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples` });
  });

  // Remove — soft-detach the source; the items + versions stay in the corpus.
  app.post("/v/:persona/connections/:cid/remove", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    await deps.dataSource
      .removeVoiceConnection(session, personaId, c.req.param("cid"))
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples` });
  });

  // The priced reconstruction pass (REQ-INGEST-10): the drawer's button IS the opt-in confirm —
  // its label carried the estimate; the POST sends `confirmed: true` and the api enqueues the
  // metered worker job (never inline, never inside convert).
  app.post("/v/:persona/samples/:itemId/reconstruct", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const itemId = c.req.param("itemId");
    const form = await bodyFields(c);
    const tier = form.tier === "visual" ? "visual" : "text";
    await deps.dataSource
      .reconstructVoiceSample(session, personaId, itemId, { tier, confirmed: true })
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=samples&sample=${itemId}&reconstruct=queued` });
  });

  // Delete the voice (REQ-INGEST-16): the persona vanishes from every read; the purge job cascades.
  app.post("/v/:persona/delete", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    // The typed-name confirm (the form requires it) — belt, since the api cascade is destructive.
    if (typeof form.confirm === "string" && form.confirm === "delete") {
      await deps.dataSource.deleteVoice(session, personaId).catch(() => undefined);
      return mutationOutcome(c, { redirect: "/voices" });
    }
    return mutationOutcome(c, { redirect: `/v/${personaId}` });
  });

  // "Build voice" — a profile_voice{tier} run (§9.2 item 3); the api's gate owns the tier checks.
  app.post("/v/:persona/build", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const tier = form.tier === "full" ? "full" : "quick";
    // R5ECON.2 — the B19C pin path: `cogsLevers={testCheapRoute:false}` rides the same post the
    // Build click makes (the api resolves it is_test-only; REQ-ECON-11's mandatory opt-out).
    await deps.dataSource
      .buildVoice(session, personaId, {
        tier,
        ...(cogsLeversField(str("cogsLevers")) ? { cogsLevers: cogsLeversField(str("cogsLevers")) } : {}),
      })
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}` });
  });

  // P1.14 — the ONE "Update voice" verb (§9.3; REQ-SPEC-27): no `scope` ⇒ the api's routed scope
  // (cheapest sufficient); `scope=full_from_quick` is the Quick→Full upgrade the button carries.
  app.post("/v/:persona/update", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const scope = typeof form.scope === "string" && form.scope !== "" ? form.scope : undefined;
    const register = typeof form.register === "string" && form.register !== "" ? form.register : undefined;
    await deps.dataSource
      .updateVoice(session, personaId, {
        ...(scope ? { scope: scope as "full_from_quick" } : {}),
        ...(register ? { register } : {}),
      })
      .catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}` });
  });

  // P1.14 — the approve_sample card's decision (§9.2/§6.4): run-scoped (the build is a persona run).
  app.post("/v/:persona/gates/:gid", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const action = typeof form.action === "string" ? form.action : "";
    const runId = typeof form.runId === "string" ? form.runId : undefined;
    // The card's form posts the gate id; the run id rides a hidden field so a stale page can't
    // aim the decision at a different run's gate.
    if (runId && (action === "approve" || action === "wait" || action === "stop")) {
      await deps.dataSource.decideRunGate(session, runId, c.req.param("gid"), { action }).catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: `/v/${personaId}` });
  });

  // P1.14 — "Correct this in your description" (§9.4; REQ-PERSONA-7): the blockquote + the
  // consume-once corrections row write together at the api.
  app.post("/v/:persona/corrections", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const text = typeof form.text === "string" ? form.text.trim() : "";
    const statementRef = typeof form.statementRef === "string" && form.statementRef.trim() !== "" ? form.statementRef.trim() : undefined;
    const artifactId = typeof form.artifactId === "string" && form.artifactId.trim() !== "" ? form.artifactId.trim() : undefined;
    if (text) {
      await deps.dataSource
        .addVoiceCorrection(session, personaId, {
          text,
          ...(statementRef ? { statementRef } : {}),
          ...(artifactId ? { artifactId } : {}),
        })
        .catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: `/v/${personaId}?tab=description&corrected=1` });
  });

  // P1.14 — the house/shared card's Fork (§9.1): the copy becomes your editable persona.
  app.post("/v/:persona/fork", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const forked = await deps.dataSource.forkVoice(session, personaId).catch(() => null);
    if (!forked) return mutationOutcome(c, { redirect: `/v/${personaId}` });
    return mutationOutcome(c, { redirect: `/v/${forked.personaId}` });
  });

  // Cancel an open build (the detail page's Cancel).
  app.post("/v/:persona/cancel", async (c) => {
    const session = deps.session(c);
    if (!session) return wantsJson(c) ? c.json({ error: "unauthenticated" }, 401) : c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await bodyFields(c);
    const runId = typeof form.runId === "string" ? form.runId : "";
    if (runId) await deps.dataSource.cancelVoiceRun(session, runId).catch(() => undefined);
    return mutationOutcome(c, { redirect: `/v/${personaId}?cancelled=1` });
  });

  // The client bundles (built by build-client.mjs at `pnpm build` from CLIENT_ENTRIES — HOT.1's
  // bundle↔route parity: every built entry is served; a missing artifact 404s with an EMPTY body and
  // the page still works — the textarea stays the read-only no-JS view and the form POSTs carry the
  // write paths; the IDE shell's server-rendered panes stay static. Never a silent fall-through to the
  // not-found HTML.)
  for (const entry of CLIENT_ENTRIES) {
    app.get(`/assets/${entry}.js`, async (c) => {
      const body = await readFile(new URL(`../public/${entry}.js`, import.meta.url)).catch(() => null);
      if (!body) return c.body(null, 404);
      return c.body(body, 200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
      });
    });
  }
  // P1.01 (REQ-IDE-39) — the self-hosted variable fonts themeCss()'s @font-face blocks point at
  // (/assets/fonts/<file>; build-client.mjs copies them from the Fontsource packages into public/fonts/).
  // Long-cacheable: the filenames carry the face+subset, and a changed face ships a new filename.
  app.get("/assets/fonts/:file", async (c) => {
    const file = c.req.param("file") ?? "";
    if (!/^[\w.-]+\.woff2$/.test(file)) return c.body(null, 404);
    const body = await readFile(new URL(`../public/fonts/${file}`, import.meta.url)).catch(() => null);
    if (!body) return c.body(null, 404);
    return c.body(body, 200, {
      "content-type": "font/woff2",
      "cache-control": "public, max-age=31536000, immutable",
    });
  });

  // SPA.3 (REQ-TL-4/5) — the Vite SPA bundle under `<spaAssetRoot>` (default public/spa/): the
  // shell's manifest tags reference `/assets/spa/<file>` where <file> is the manifest's `assets/`
  // subtree. The name gate admits ONLY `assets/<name>.<ext>` shapes — every segment starts with a
  // word char (no `.`/`..`/dotdirs, so traversal is refused by construction) and sourcemaps
  // (`*.map`, Vite's hidden `sourcemap` output) never serve. Content-hashed ⇒ immutable cache.
  const spaAssetRoot = deps.spaAssetRoot ?? DEFAULT_SPA_ASSET_ROOT;
  const SPA_ASSET_TYPES: Readonly<Record<string, string>> = {
    js: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    woff2: "font/woff2",
    json: "application/json; charset=utf-8",
  };
  const SPA_ASSET_NAME = /^assets\/(?:[\w][\w.-]*\/)*[\w][\w.-]*\.(\w+)$/; // [\w] first char — no ".." or dotdirs
  app.get("/assets/spa/*", async (c) => {
    const rel = c.req.path.slice("/assets/spa/".length);
    const m = SPA_ASSET_NAME.exec(rel);
    const type = m != null && !rel.endsWith(".map") ? SPA_ASSET_TYPES[m[1]!] : undefined;
    if (type == null) return c.body(null, 404);
    const body = await readFile(join(spaAssetRoot, rel)).catch(() => null);
    if (body == null) return c.body(null, 404);
    return c.body(body, 200, {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
    });
  });

  // SPA.3 (REQ-BND-4/11; design/26 §catch-all) — the catch-all splits on session + SPA space:
  // a GET under an authenticated SPA prefix WITHOUT a session gets the same /login redirect every
  // auth'd route enforces (a signed-out deep link never sees the shell NOR the public 404); WITH a
  // session the shell serves unconditionally — SPA.28 removed the flag consult (every SPA-space
  // surface is SPA-only now), so deep links the server has no explicit route for reach the client
  // router and it renders its own not-found for the truly unknown. Every other shape — non-GET
  // verbs, non-SPA paths — keeps today's SSR 404 byte-for-byte.
  app.all("*", async (c) => {
    if (c.req.method === "GET") {
      const { surfaces } = spaRouteFor(c.req.path);
      if (surfaces != null) {
        const session = deps.session(c);
        if (!session) return c.redirect("/login");
        return spaShellDocument(c, deps, session);
      }
    }
    return c.html(renderDocument(c.req.path, notFoundElement), 404);
  });

  return app;
}

// §10.1's phone-width input set is a server-rendered variant of the SAME components (REQ-SPEC-20);
// `isPhoneRequest` moved to ./device.js for SPA.3 so the shell module shares the one verdict
// without a server↔shell import cycle.

/** A `next` redirect target must stay inside the app (no open redirects). */
function safeBack(next: string, fallback: string): string {
  return next.startsWith("/p/") ? next : fallback;
}

/**
 * F32 (PRB.19) — the Payment-Link 302 target carries `client_reference_id=<billingAccountId>` so the
 * Stripe-originated checkout joins the caller's account (a bare link lands the purchase `unresolved`).
 * Composed via `URL` (an existing query on the configured link survives; `set` never double-appends).
 * A malformed configured URL or a missing account id returns the link unchanged — the redirect never breaks.
 */
export function paymentLinkWithReference(link: string, billingAccountId: string | undefined): string {
  if (!billingAccountId) return link;
  try {
    const url = new URL(link);
    url.searchParams.set("client_reference_id", billingAccountId);
    return url.toString();
  } catch {
    return link;
  }
}

// ---- run sheet helpers (§5.6) ----

/** Generous beta house-credit balance (REQ-BETA-14): no plans/trials in the beta; runs draw house credits. */
const BETA_HOUSE_CREDITS = 200_000;

const RUN_SHEET_WORKFLOWS = new Set<WorkflowKey>(["review", "revise", "fact_check"]);
function normalizeWorkflow(v: string): WorkflowKey {
  return RUN_SHEET_WORKFLOWS.has(v as WorkflowKey) ? (v as WorkflowKey) : "review";
}
function normalizeRigor(v: string): Rigor {
  return (RIGORS as readonly string[]).includes(v) ? (v as Rigor) : "standard";
}
/**
 * EST.1 (ADR-035) — the sheet's rigor/tier resolution. Explicit `?rigor=`/`?tier=`/`?modelTier=` beat
 * the context's resolved defaults (the api folds project → account prefs → 'standard'/null into
 * `project.rigor`/`project.modelTier`); a null tier default falls to the rigor notch's §6.5 column;
 * then the plan's `allowedModelTiers` clamp — a clamped tier carries `requestedModelTier` for the
 * "your plan includes X only" notice. Tier is a USER CHOICE inside plan rules, never again an
 * implicit consequence of the rigor notch (BL-58).
 */
function resolveSheetLevers(
  query: Record<string, string>,
  workflow: WorkflowKey,
  ctx?: RunSheetContextDto | null,
) {
  const allowed = (ctx?.account?.allowedModelTiers as ModelTier[] | undefined) ?? undefined;
  const resolved = resolveSheetConfig({
    workflow,
    rigor: query.rigor ?? null,
    modelTier: query.tier ?? query.modelTier ?? null,
    // ctx.project.rigor is already the api's project→prefs→'standard' fold; pass it as the project leg.
    projectRigorDefault: ctx?.project?.rigor ?? null,
    // ctx.project.modelTier is already project model_tier_default ?? account defaultModelTier (null ⇒ notch).
    projectModelTierDefault: ctx?.project?.modelTier ?? null,
    ...(allowed ? { allowedModelTiers: allowed } : {}),
  });
  return resolved;
}

/**
 * P1.21 — parse the memo sheet's `user_sources` field: one `name :: url-or-text` per line (an
 * http(s) tail is the source's url; anything else is pasted text). Blank/malformed lines drop —
 * the api's own validation is the authority; this is just the form's wire shape.
 */
function parseUserSourcesField(raw: string): { name: string; url?: string; text?: string }[] {
  const out: { name: string; url?: string; text?: string }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf("::");
    const name = (sep >= 0 ? trimmed.slice(0, sep) : trimmed).trim();
    const tail = sep >= 0 ? trimmed.slice(sep + 2).trim() : "";
    if (!name) continue;
    if (/^https?:\/\//i.test(tail)) out.push({ name, url: tail });
    else if (tail) out.push({ name, text: tail });
    else out.push({ name });
  }
  return out.slice(0, 8);
}

/**
 * R5ECON.2 (REQ-ECON-10/11) — a posted `cogsLevers` field is the per-leg COGS-lever pin the api
 * resolves ONLY on `is_test` workspaces (the N6/R4/B19C model-judgment opt-outs). It arrives as a
 * JSON object on a JSON post or as its JSON-string form on a form post; either way forward the
 * parsed OBJECT verbatim — malformed ⇒ dropped (the api's sanitize is the authority anyway).
 */
function cogsLeversField(raw: unknown): Readonly<Record<string, unknown>> | undefined {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return undefined;
    }
  }
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Readonly<Record<string, unknown>>)
    : undefined;
}

/** Build the RunSheetView from the query (beta launcher). Word count is query-driven; the live per-draft
 *  metadata binding is the deploy leg (like the import pipeline). PRB.08: the spendable balance is the
 *  account's REAL ledger balance when the billing read resolves — the flat beta house-credit figure is only
 *  the degraded fallback (an api outage must not block the sheet). */
function buildSheet(
  query: Record<string, string>,
  billing?: { spendableCredits: number; suspended: boolean; paymentLinkUrl?: string; purchase?: "open" | "closed" },
  planOfferUrl?: string,
  // P1.06 — the api's run-sheet context (head draft, sections, obligations, entitlement, consent pref,
  // the project scope defaults). Unset ⇒ the sheet renders its bare defaults (context fetch failed open).
  ctx?: RunSheetContextDto | null,
) {
  const workflow = normalizeWorkflow(query.workflow ?? "review");
  // EST.1 — rigor + tier resolve through the one resolver (explicit → project → account → notch →
  // plan clamp); the returned `requestedModelTier` flags a clamp for the notice.
  const resolved = resolveSheetLevers(query, workflow, ctx);
  const rigor = resolved.rigor;
  const modelTier = resolved.modelTier;
  // EST.1 — the measured word count only: no draft ⇒ no figure ("—" + estimating, never the §5.6
  // mock's 5,180). A stored length override still prefills an unmeasured draft (P1.22 W10).
  const measuredWords =
    (Number(query.words) > 0 ? Number(query.words) : 0) ||
    (ctx?.headDraft?.words ?? 0) ||
    (ctx?.project?.protocolOverrides?.length ?? 0);
  const words = measuredWords;
  // P1.22 W10 — toggle prefill mirrors the launch's layering exactly: the seeded protocol's own
  // `phase_defaults` (e.g. Memo's `discourse:false`) at the bottom, then the project's stored
  // overrides, then the `toggle.*` query levers on top — what the sheet shows is what the run freezes.
  const STORED_TO_TOGGLE: Record<string, ToggleKey> = {
    verification: "fact_check",
    discourse: "discourse",
    secondRead: "second_read",
    grounding: "grounding",
    audit: "audit",
  };
  const toggles: ToggleState = {};
  const selectedProtocolId = (query.protocol || ctx?.project?.protocol || null)?.toLowerCase() ?? null;
  const protoDefaults = selectedProtocolId
    ? ctx?.project?.protocolDefaults?.[selectedProtocolId]?.phaseDefaults
    : undefined;
  for (const [stored, toggleKey] of Object.entries(STORED_TO_TOGGLE)) {
    const pv = protoDefaults?.[stored];
    if (typeof pv === "boolean") toggles[toggleKey] = pv;
    const v = ctx?.project?.protocolOverrides?.phaseDefaults?.[stored];
    if (typeof v === "boolean") toggles[toggleKey] = v;
  }
  // EST.1 (F-EST.1-2; ECON.1 §6.5 conformance on the SHEET side): seed/stored `true`s may only
  // DISABLE relative to the selected rigor's preset — a `true` the preset already turns off would
  // otherwise render a CHECKED box that submits back as an "explicit" lever and wins at launch
  // (the F-ECON.1-1 shape laundered through this prefill — observed live on run
  // 01M3Y5HJPC3SAQ1TGPVBATB1HE: Quick froze discourse:true/second_read:true and ran the phase).
  // A `?toggle.x=on` lever below still wins in both directions.
  const rigorToggleDefaults = (() => {
    try {
      return sheetProfile(workflow).rigorDefaults[rigor]?.toggles ?? {};
    } catch {
      return {};
    }
  })();
  for (const key of Object.keys(toggles) as ToggleKey[]) {
    if (toggles[key] === true && rigorToggleDefaults[key] === false) delete toggles[key];
  }
  for (const key of ["fact_check", "discourse", "second_read", "repair_research", "gap_check"] as const) {
    if (query[`toggle.${key}`] === "on") toggles[key] = true;
    else if (query[`toggle.${key}`] === "off") toggles[key] = false;
  }

  // P1.06 (§7.2; REQ-CHAT-23) — the command scope: `?scope=` is the canonical serialized form
  // (`section:III`); parse → pill labels + the scope's estimator inputs (the scoped price).
  const scopeRefs = parseScopes(query.scope);
  const scoped = scopeRefs.length > 0 ? scopedInputs(scopeRefs, ctx?.sections ?? []) : null;
  // §14.3 — a trial entitlement whose word cap the draft exceeds covers the FIRST wordCap words: the
  // sheet's scope becomes the covered slice (a "first N words" pill) so the Included line stays honest.
  // MAINT.3 — the entitlement applies ONLY to the one configured shape (review at
  // PRICING.trial.entitlement's rigor + tier — the api's `trial_shape` gate reads the same config).
  // Rendering `Included` + posting the hidden entitlementId for ANY other shape (a Quick launch on an
  // entitled account) 422'd every launch and never re-offered the funded figure: suppress the
  // entitlement on a shape mismatch so the honest estimate renders and the run launches on credits.
  const rawEntitlement = ctx?.entitlement ?? null;
  const entitlement =
    rawEntitlement &&
    workflow === PRICING.trial.entitlement.kind &&
    rigor === PRICING.trial.entitlement.rigor &&
    modelTier === PRICING.trial.entitlement.modelTier
      ? rawEntitlement
      : null;
  const effectiveScopes: ScopeRef[] =
    scopeRefs.length === 0 && entitlement && words > entitlement.wordCap
      ? [{ kind: "words", upto: entitlement.wordCap }]
      : scopeRefs;

  const headN = ctx?.headDraft?.n ?? null;
  const targetVersion = headN != null ? `v${headN}` : "v1";
  // P1.06 (REQ-SPEC-17's sheet half) — the scope-gate blocking condition the sheet surfaces: Full
  // board, or a `--protocol`/`--venue` lever (or edited field) that departs the project's pinned scope.
  const approvalPick =
    query.approvals === "named" || query.approvals === "wait_each" || query.approvals === "run_to_completion"
      ? query.approvals
      : ctx?.project?.approvalPolicy;
  const scopeBlocking =
    rigor === "full_board" ||
    (!!query.protocol && query.protocol !== (ctx?.project?.protocol ?? null)) ||
    (!!query.venue && query.venue !== (ctx?.project?.venue ?? ""));
  // P1.20 (§6.7) — a settings-page protocol change marks the next Review's scope card: the sheet
  // surfaces the marker + the same blocking consequence (the api freezes `scopeBlocking` itself).
  const protocolChanged = workflow === "review" && ctx?.project?.protocolChanged === true;
  const claimsQuery = Number(query.claims) > 0 ? Number(query.claims) : undefined;
  return buildRunSheetView({
    workflow,
    targetVersion,
    rigor,
    modelTier,
    inputs: words > 0 ? { words } : {},
    // EST.1 — fail-closed inputs: no measured count ⇒ the box renders "—" (never a mock figure).
    inputsAvailable: words > 0,
    ...(resolved.requestedModelTier ? { requestedModelTier: resolved.requestedModelTier } : {}),
    allowedModelTiers: resolved.allowedModelTiers,
    ...(ctx?.durations ? { durations: ctx.durations } : {}),
    ...(claimsQuery != null ? { claimCount: claimsQuery } : {}),
    ...(Object.keys(toggles).length ? { toggles } : {}),
    scope: {
      // §7.2 — a typed `--protocol`/`--venue`/`--stage` lever presets the row; the project default fills
      // whatever the command left unset.
      protocol: query.protocol || ctx?.project?.protocol || "Essay",
      // P1.21 — the four §6.7 protocol options (id+name) the selector renders, from the api context.
      ...(ctx?.protocols ? { protocolOptions: ctx.protocols } : {}),
      ...(query.venue || ctx?.project?.venue ? { venue: query.venue || ctx?.project?.venue || "" } : {}),
      // P1.22 W10 — `--stage` lever > stored override > the selected protocol's own stage default
      // (Op-ed's `near_final`) > unset.
      ...(() => {
        const s =
          query.stage ||
          ctx?.project?.protocolOverrides?.stage ||
          (selectedProtocolId ? ctx?.project?.protocolDefaults?.[selectedProtocolId]?.stage : null);
        return s ? { stage: s } : {};
      })(),
    },
    spendableCredits: billing?.spendableCredits ?? BETA_HOUSE_CREDITS,
    idempotencyKey: randomUUID(),
    insufficientMode: "beta",
    // P1.06 — the §7.2 scope pills + the scoped price beside the whole-draft figure.
    ...(effectiveScopes.length > 0
      ? {
          commandScope: {
            serialized: serializeScopes(effectiveScopes),
            labels: effectiveScopes.map(scopeChip),
            ...(scoped ? { scopedInputs: scoped } : {}),
          },
        }
      : {}),
    // P1.06 — the collapsed-row rows: the project's approval policy + the user's consent pref.
    // §7.2's `--wait`/`--auto` preset the Approvals pick; `--budget N` presets the editable cap.
    ...(approvalPick ? { approvalPolicy: approvalPick as "named" | "wait_each" | "run_to_completion" } : {}),
    // RUN.1 (ADR-050) — the project's gate overrides ride so the scope line and the parked gate can
    // never disagree (approve_scope:null ⇒ "waits for you" on both).
    ...(ctx?.project?.approvalOverrides ? { projectGateOverrides: ctx.project.approvalOverrides } : {}),
    scopeBlocking,
    ...(protocolChanged ? { protocolChanged: true } : {}),
    ...(ctx?.dontAskUnder != null ? { dontAskUnder: ctx.dontAskUnder } : {}),
    ...(ctx?.standingNotes != null ? { standingNotes: ctx.standingNotes } : {}),
    ...(Number(query.budget) > 0 ? { capOverrideCredits: Math.round(Number(query.budget)) } : {}),
    ...(typeof query.guidance === "string" && query.guidance ? { guidance: query.guidance } : {}),
    // P1.21 — the memo sheet's typed user_sources text round-trips on re-render.
    ...(typeof query.userSources === "string" && query.userSources ? { userSourcesText: query.userSources } : {}),
    // P1.06 — the promote-on-launch line: a WORKING head freezes to its vN on launch (§5.6 item 7).
    ...(ctx?.headDraft ? { headState: ctx.headDraft.state, promoteToVersion: `v${ctx.headDraft.n}` } : {}),
    // §14.3/ACT.1 — the claimable (locked-or-unused) trial entitlement → the `Included` rendering
    // (+ its word-cap detail). The row `id` round-trips as the Run form's hidden `entitlementId`.
    ...(entitlement
      ? {
          entitlement: true,
          entitlementDetails: {
            id: entitlement.id,
            wordCap: entitlement.wordCap,
            rigor: entitlement.rigor,
            modelTier: entitlement.modelTier,
            kind: entitlement.kind,
          },
        }
      : {}),
    // REQ-OBJ-6 — the obligation scope line ("N open obligations will be checked / addressed").
    ...(ctx
      ? {
          scopeLine:
            (workflow === "review" ? ctx.reviewScopeLine : workflow === "revise" ? ctx.reviseScopeLine : null) ??
            undefined,
        }
      : {}),
    // BILL.3 — purchase closed ⇒ the exhaustion panel renders the paused line, never the link button.
    // The balance DTO's `purchase` is optional for older apis — fail closed for the LINK either way,
    // but only render the paused note when the api actually answered.
    ...(billing && billing.purchase !== "open" ? { purchaseClosed: true } : {}),
    ...(billing?.paymentLinkUrl && billing.purchase === "open"
      ? { paymentLinkUrl: billing.paymentLinkUrl }
      : {}),
    ...(billing?.suspended ? { suspended: true } : {}),
    ...(planOfferUrl ? { planOfferUrl } : {}),
  });
}

/** Render the §5.3 count line from the structured counts. */
function countLine(c: ConversionResult["counts"]): string {
  const n = (x: number) => x.toLocaleString("en-US");
  const p = (x: number, one: string) => `${n(x)} ${x === 1 ? one : one + "s"}`;
  return [p(c.words, "word"), p(c.footnotes, "footnote"), `${n(c.citationSpans)} citation-like ${c.citationSpans === 1 ? "span" : "spans"}`, p(c.tables, "table"), p(c.figures, "figure")].join(" · ");
}

/**
 * PRB.21 — the pending preview's self-poll cadence + its GET URL (meta-refresh target). The page
 * re-polls on the quarantine key every few seconds; each poll holds at most the api's bounded wait
 * (~20 s) and returns the moment the converted object lands.
 */
const IMPORT_PREVIEW_POLL_SECONDS = 5;
function importPollUrl(slug: string, quarantineKey: string, sourceLabel?: string): string {
  const q = `?qk=${encodeURIComponent(quarantineKey)}`;
  return `/p/${slug}/import/preview${q}${sourceLabel ? `&src=${encodeURIComponent(sourceLabel)}` : ""}`;
}

/**
 * The import form's field grammar → `ImportInput` (SPA.14 — extracted so the `wantsJson` branches
 * share it: `bodyFields` decodes JSON and multipart/urlencoded alike). `qk` is the form vocabulary;
 * the JSON upload leg additionally accepts the REQ-BFF-16 `quarantineKey`/`fileName` pair it minted
 * — the BFF still never proxies bytes (a JSON `file` is never a File).
 */
async function importInputFromFields(form: Record<string, unknown>, slug: string): Promise<ImportInput> {
  const qk =
    (typeof form.qk === "string" && form.qk ? form.qk : undefined) ??
    (typeof form.quarantineKey === "string" && form.quarantineKey ? form.quarantineKey : undefined);
  const fileName = typeof form.fileName === "string" && form.fileName ? form.fileName : undefined;
  const paste = typeof form.paste === "string" ? form.paste : "";
  const file = form.file;
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    return {
      projectSlug: slug,
      fileName: f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
      ...(qk ? { quarantineKey: qk } : {}),
    };
  }
  return {
    projectSlug: slug,
    text: paste,
    ...(fileName ? { fileName } : {}),
    ...(qk ? { quarantineKey: qk } : {}),
  };
}



function toConversionData(slug: string, input: ImportInput, result: ConversionResult, quarantineKey: string) {
  return {
    projectSlug: slug,
    sourceLabel: input.fileName ?? "pasted text",
    // A re-polled preview (PRB.21) carries only the quarantine key — the source bytes already live in
    // quarantine, so the source pane states that plainly rather than rendering blank.
    sourceText: input.text ?? (input.bytes ? `(${input.bytes.byteLength} bytes)` : "(the uploaded source — already converted)"),
    convertedMarkdown: result.markdown,
    countLine: countLine(result.counts),
    warnings: result.warnings.map((w) => ({ message: w.message, blockId: w.anchor?.blockId ?? null })),
    // the create form replays this verbatim — no second upload, no second convert run.
    quarantineKey,
  };
}
