import { Hono } from "hono";
import type { Context } from "hono";
import { toProjectRowView, groupByAttention, groupByVoice } from "./state-map.js";
import { renderDocument } from "./render.js";
import {
  inviteElement,
  landingElement,
  pricingElement,
  signupElement,
  loginElement,
  projectsElement,
  projectElement,
  newProjectElement,
  importElement,
  importPreviewElement,
  runSheetElement,
  dossierElement,
  revisionElement,
  pageElement,
  compareElement,
  exportElement,
  voicesElement,
  voiceNewElement,
  voiceDetailElement,
  voiceReseedElement,
  obligationNewElement,
  settingsElement,
  projectSettingsElement,
  usageElement,
  runReportElement,
  outlineElement,
  outlinePromoteElement,
  figuresElement,
  figureCardElement,
  visualizeElement,
  billingElement,
  billingReturnElement,
  projectUsageElement,
  inboxElement,
  showcaseElement,
  showcaseSignedInElement,
  notFoundElement,
} from "./routes.js";
import { FAVICON_SVG } from "./brand.js";
import { COPY } from "./copy.js";
import type { DataSource, SessionHeaders, ImportInput, ImportPreviewOutcome } from "./data.js";
import { feedLabelMaps, feedRowsFor } from "./feed-labels.js";
import type { TimelineDto, RunSheetContextDto, GateCardDto, InboxItemDto, ProjectSettingsPatch } from "@rhema/api-client";
import { parseScopes, scopedInputs, serializeScopes, scopeChip, VERB_TABLE, type ScopeRef } from "@rhema/commands";
import type { PaletteData } from "@rhema/ide";
import type { FeedRow } from "@rhema/ui";
import type { PageData } from "./page-data.js";
import { bffFail, bffRoute, bodyFields, confirmEmailHandler, mutationOutcome, projectRow as bffProjectRow, projectRows, swallowDegraded, wantsJson } from "./bff.js";
import { createSpaConsult } from "./spa-flag.js";
import { DEFAULT_SPA_ASSET_ROOT, spaShellResponse } from "./spa-shell.js";
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
  type SpaSurface,
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
import { GATE_KINDS, isCslStyle, isExportFormat, isMdExportProfile, claimsForAudience, errorClass, stackForLog, REQUEST_ID_HEADER, type GateKind, type PublicClaimsConfig } from "@rhema/contracts";
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
  /**
   * SPA.2 — the strangler surface-flag set (REQ-SEQ-1; spec §11): env `SPA_SURFACES` parsed
   * through `parseSpaSurfaces` (fail-closed — unset/invalid ⇒ ∅, every auth'd document GET
   * stays SSR). Consumed ONLY by `deps.spa`; no route flips until its surface ticket lands.
   */
  readonly spaSurfaces?: ReadonlySet<SpaSurface>;
  /**
   * SPA.2 — whether the force-SPA renderer overrides (`?renderer=spa`, `x-rhema-renderer: spa`)
   * are honored on this stage (env `SPA_OVERRIDES=1`; deployed iff the stage kind is non-prod —
   * REQ-SEQ-4). The force-SSR forms (`?ssr=1`, `x-rhema-renderer: ssr`) are honored on every
   * stage regardless of this flag.
   */
  readonly spaOverrides?: boolean;
  /**
   * SPA.2 — the per-request flag consult, `deps.spa(c, surface)`, applied inside spec §4's
   * fixed handler order AFTER the handler's session gate, server-owned redirects, and
   * forced-SSR capability checks (REQ-BND-11/REQ-SEQ-4). The consult re-checks the session
   * itself (overrides never bypass the gate), then the renderer overrides, then flag
   * membership with the `ide-chrome` AND-gate. Default: built from `spaSurfaces`/`spaOverrides`
   * + the wrapped `session`; injectable for tests like the other seams.
   */
  spa?(c: Context, surface: SpaSurface): boolean;
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

/**
 * BILL.3 (REQ-BILL-16) — map a billing POST failure's stable api code to truthful copy. The generic
 * "temporarily unavailable" line is now ONLY the genuinely-transient answer (Stripe unreachable,
 * or an unknown failure); every classified refusal gets its own sentence so the user knows what
 * actually happened. Unknown codes fall back to the generic note — never a blank page.
 */
function billingNoticeFor(code: string | undefined): string {
  switch (code) {
    case "purchase_closed":
      return COPY.billing.purchasePausedNote;
    case "topups_require_plan":
      return COPY.billing.topupRequiresPlanNote;
    case "first_month_cap":
      return COPY.billing.firstMonthCapNote;
    case "plan_waitlisted":
      return COPY.billing.planWaitlistedNote;
    case "no_stripe_customer":
      return COPY.billing.noStripeCustomerNote;
    case "stripe_rejected":
      return COPY.billing.stripeRejectedNote;
    case "stripe_unconfigured":
    case "stripe_credentials_unconfigured":
      return COPY.billing.stripeUnconfiguredNote;
    case "change":
      return COPY.billing.changeFailedNote;
    case "cancel":
      return COPY.billing.cancelFailedNote;
    case "autoreload":
      return COPY.billing.autoReloadFailedNote;
    case "waitlist":
      return COPY.billing.waitlistFailedNote;
    case "checkout":
    case "portal":
    case "stripe_unavailable":
    default:
      return COPY.billing.stripeDownNote;
  }
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
  // SPA.2 — the strangler flag consult (`deps.spa`, spec §4 order): installed from the deploy
  // facts (`spaSurfaces`/`spaOverrides`) over the WRAPPED session resolver, so a force-spa
  // override on a signed-out request still reads false (REQ-SEQ-4's never-bypass clause).
  deps = {
    ...deps,
    spa:
      deps.spa ??
      createSpaConsult({
        surfaces: deps.spaSurfaces,
        overrides: deps.spaOverrides,
        session: (c) => deps.session(c),
      }),
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
    `img-src 'self' https://usercontent.rhema.tools data:; connect-src 'self'${collabWsSource ? ` ${collabWsSource}` : ""} ${gcsUploadSource}; font-src 'self'; ` +
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
  app.get("/healthz", (c) =>
    c.json({ ok: true, service: "web", build: { gitSha: deps.buildGitSha ?? null } }),
  );

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
    // SPA.3 — the strangler consult at spec §4's fixed position (after the session gate, before
    // the page-data reads): the surface's flip ⇒ the shell document, else today's SSR continues.
    const spaDoc = await spaShellResponse(c, deps, "outline", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
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
    return c.html(
      renderDocument(c.req.path, outlinePromoteElement, {
        ...(promotion
          ? {
              outlinePromotion: {
                slug,
                projectTitle: row.title,
                promotion,
                scope,
                ...(threadId ? { threadId } : {}),
                ...(turnId ? { turnId } : {}),
              },
            }
          : {}),
        compact: isPhoneRequest(c),
      }),
      promotion ? 200 : 404,
    );
  });

  // The Promote click — the ONLY outline-run creator (the sheet is the consent, like the run sheet's
  // Run click). Re-renders the sheet with the started line on success.
  app.post("/p/:project/outline/promote", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
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
        return c.html(renderDocument(c.req.path, notFoundElement), 502);
      }
      return c.redirect(`/p/${slug}`);
    } catch (e) {
      // a missing thread/turn or a live-run conflict re-renders the sheet with the honest notice —
      // never a silent failure.
      const notice =
        e instanceof ApiError && e.status === 404
          ? COPY.promote.notFound
          : e instanceof ApiError && e.status === 409
            ? COPY.promote.notFound
            : COPY.promote.notFound;
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
      const promotion = await deps.dataSource
        .getOutlinePromotion?.(session, row.id, {
          scope,
          ...(str("threadId") ? { threadId: str("threadId") } : {}),
          ...(str("turnId") ? { turnId: str("turnId") } : {}),
        })
        .catch(() => null);
      return c.html(
        renderDocument(c.req.path, outlinePromoteElement, {
          ...(promotion
            ? {
                outlinePromotion: {
                  slug,
                  projectTitle: row.title,
                  promotion,
                  scope,
                  ...(str("threadId") ? { threadId: str("threadId") } : {}),
                  ...(str("turnId") ? { turnId: str("turnId") } : {}),
                  notice,
                },
              }
            : {}),
          compact: isPhoneRequest(c),
        }),
        e instanceof ApiError ? (e.status as 400) : 502,
      );
    }
  });

  // The durable outline editor (GET): the artifact's head + its parsed outline.json twin as the shared
  // spine-and-sections rows. Phone-width is read-only (§10.1). The Draft estimate line is the run-sheet
  // estimator over the outline's own words — recomputed on every render/save (the "live" estimate).
  app.get("/p/:project/outline", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult at spec §4's fixed position (after the session gate, before
    // the page-data reads): the surface's flip ⇒ the shell document, else today's SSR continues.
    const spaDoc = await spaShellResponse(c, deps, "outline", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const dto = await deps.dataSource
      .getOutline?.(session, row.id, c.req.query("slug") ? { slug: c.req.query("slug")! } : undefined)
      .catch(() => null);
    if (!dto || !dto.outline) {
      return c.html(
        renderDocument(c.req.path, outlineElement, { compact: isPhoneRequest(c) }),
        404,
      );
    }
    const o = dto.outline;
    const view = {
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
    };
    let draftEstimateCredits: number | undefined;
    try {
      // EST.1 — the surface API (the outline card's Draft pre-fill agrees with the sheet).
      draftEstimateCredits = surfaceEstimate({
        workflow: "draft",
        rigor: "standard",
        modelTier: "base",
        inputs: { words: dto.words ?? o.targetLength ?? 0 },
      }).estimateCredits;
    } catch {
      draftEstimateCredits = undefined;
    }
    const cited = dto.citedBy.runs.length > 0 || dto.citedBy.draftIds.length > 0;
    return c.html(
      renderDocument(c.req.path, outlineElement, {
        outline: {
          slug,
          editable: dto.editable && !isPhoneRequest(c),
          saveAction: `/p/${slug}/outline`,
          deleteAction: `/p/${slug}/outline/delete`,
          ...(draftEstimateCredits != null ? { draftEstimateCredits } : {}),
          outline: view,
          cited,
          ...(c.req.query("saved") === "1" ? { saved: true } : {}),
          ...(c.req.query("notice") === "cited" ? { notice: COPY.outlinePage.citedNote } : {}),
        },
        compact: isPhoneRequest(c),
      }),
    );
  });

  // The autosave: the form's `ed.*` fields decode through the SAME grammar the gate card posts → the
  // api's PATCH `edit` → one new version pair. A no-JS Save and the island's debounced submit land here.
  app.post("/p/:project/outline", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.json({ error: "not_found" }, 404);
    const form = await c.req.parseBody();
    const edits = decodeGateEditFields(form as Record<string, unknown>);
    const hasEdits = Object.values(edits).some(
      (v) => (Array.isArray(v) ? v.length > 0 : v != null && Object.keys(v).length > 0),
    );
    if (!hasEdits) return c.redirect(`/p/${slug}/outline`);
    const out = await deps.dataSource
      .patchOutline?.(session, row.id, { edit: edits as Record<string, unknown> })
      .catch((e: unknown) => e);
    if (out == null || out instanceof Error) {
      return wantsJson(c) ? c.json({ error: "save_failed" }, 422) : c.redirect(`/p/${slug}/outline`);
    }
    return wantsJson(c) ? c.json(out) : c.redirect(`/p/${slug}/outline?saved=1`);
  });

  // Deletion protection (§7.3): a cited outline's DELETE answers 409 `outline_cited` — the page's
  // notice names the rule instead of the artifact disappearing under a draft.
  app.post("/p/:project/outline/delete", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    try {
      await deps.dataSource.deleteOutline?.(session, row.id, undefined);
      return c.redirect(`/p/${slug}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        return c.redirect(`/p/${slug}/outline?notice=cited`);
      }
      throw e;
    }
  });

  // A gap's Answer — a standalone form (one input + button per gap row) → a `user_typed` claim lands in
  // the gap's section and the gap resolves. The gate card's `ed.gap.<id>` fields hit the same apply.
  app.post("/p/:project/outline/gaps/:gapId/answer", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const text = typeof form.text === "string" ? form.text.trim() : "";
    if (!text) return c.redirect(`/p/${slug}/outline`);
    await deps.dataSource
      .answerOutlineGap?.(session, row.id, c.req.param("gapId"), { text })
      .catch(() => null);
    return c.redirect(`/p/${slug}/outline?saved=1`);
  });

  // ---- P1.13 — the Figures surface (§7.5): the pane, the card, the /visualize sheet, and the
  //      insert-as-proposal actions. Every entry point (chat /visualize, a selection's Visualize,
  //      Edit figure, a craft finding's Visualize) opens the SAME sheet; the sheet's click is the
  //      only run creator (REQ-CHAT-25's consent rule, like /outline's Promote). ----

  /** The estimate for the sheet + the run create — one derivation, server-side (the api re-derives
   *  it too; these figures only pre-fill the card). */
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

  // The /visualize sheet (GET): the request (prefilled by the entry point), the spec-kind pick, the
  // honesty note, and the estimate. Iterate mode (`?figure=` + `?prior=`) replays the figure id.
  app.get("/p/:project/visualize", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult at spec §4's fixed position (after the session gate, before
    // the page-data reads): the surface's flip ⇒ the shell document, else today's SSR continues.
    const spaDoc = await spaShellResponse(c, deps, "figures", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // the @figure: scope ref carries the marker's `fig_` prefix — the row id is the bare ULID.
    const figureId = c.req.query("figure") ? figureIdFromRef(c.req.query("figure")!) : undefined;
    const priorVersion = Number(c.req.query("prior"));
    const est = figureEstimate(figureId != null);
    return c.html(
      renderDocument(c.req.path, visualizeElement, {
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
        compact: isPhoneRequest(c),
      }),
    );
  });

  // The Visualize click — the ONLY figure-run creator (the sheet IS the consent). Creates the
  // `figure` run via the same POST /runs path the run sheet uses, with the figure facts block.
  app.post("/p/:project/visualize", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const request = str("request").trim();
    const figureId = str("figureId") || undefined;
    const priorVersion = Number(str("priorVersion"));
    const specKind = (["vega_lite", "mermaid", "table"] as const).find((k) => k === str("specKind"));
    const est = figureEstimate(figureId != null);
    if (!request) {
      return c.html(
        renderDocument(c.req.path, visualizeElement, {
          visualize: {
            slug,
            request,
            specKind: str("specKind"),
            ...(figureId ? { figureId } : {}),
            entryPoint: str("entryPoint") || "chat",
            estimateCredits: est.estimateCredits,
            capCredits: est.capCredits,
            notice: COPY.visualize.requestRequired,
          },
          compact: isPhoneRequest(c),
        }),
        422,
      );
    }
    const sourceRefs = figureSourceRefs({
      request,
      insist: str("insist") === "1" || form.insist === "on",
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
      return c.redirect(`/p/${slug}/figures`);
    } catch (e) {
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
      return c.html(
        renderDocument(c.req.path, visualizeElement, {
          visualize: {
            slug,
            request,
            specKind: str("specKind"),
            ...(figureId ? { figureId } : {}),
            entryPoint: str("entryPoint") || "chat",
            estimateCredits: est.estimateCredits,
            capCredits: est.capCredits,
            notice:
              e instanceof ApiError && e.status === 404
                ? COPY.visualize.notFound
                : e instanceof ApiError
                  ? String(e.code ?? e.message)
                  : COPY.visualize.notFound,
          },
          compact: isPhoneRequest(c),
        }),
        e instanceof ApiError ? (e.status as 400) : 502,
      );
    }
  });

  // The Figures pane (GET): every figure card with its badge + version + insert/render state.
  app.get("/p/:project/figures", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult at spec §4's fixed position (after the session gate, before
    // the page-data reads): the surface's flip ⇒ the shell document, else today's SSR continues.
    const spaDoc = await spaShellResponse(c, deps, "figures", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const items = (await deps.dataSource.listFigures?.(session, row.id).catch(() => null)) ?? [];
    return c.html(
      renderDocument(c.req.path, figuresElement, {
        figures: { slug, items },
        compact: isPhoneRequest(c),
      }),
    );
  });

  // The figure card (GET): preview + type chips + fields + disclosures + the insert surface.
  app.get("/p/:project/figures/:figureId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult at spec §4's fixed position (after the session gate, before
    // the page-data reads): the surface's flip ⇒ the shell document, else today's SSR continues.
    const spaDoc = await spaShellResponse(c, deps, "figures", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const card = await deps.dataSource
      .getFigure?.(session, row.id, c.req.param("figureId"))
      .catch(() => null);
    if (!card) return c.html(renderDocument(c.req.path, figureCardElement, { compact: isPhoneRequest(c) }), 404);
    return c.html(
      renderDocument(c.req.path, figureCardElement, {
        figure: {
          slug,
          card,
          headDraftId: row.headDraftId ?? null,
          ...(c.req.query("saved") === "1" ? { saved: true } : {}),
          ...(c.req.query("notice") ? { notice: c.req.query("notice")! } : {}),
        },
        compact: isPhoneRequest(c),
      }),
    );
  });

  // The card's field edits (caption/alt/sourceLine) → the api's PATCH (alt ≤250 enforced there).
  app.post("/p/:project/figures/:figureId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    try {
      await deps.dataSource.patchFigure?.(session, row.id, figureId, {
        caption: str("caption"),
        alt: str("alt"),
        sourceLine: str("sourceLine"),
      });
      return c.redirect(`/p/${slug}/figures/${figureId}?saved=1`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        return c.redirect(`/p/${slug}/figures/${figureId}?notice=${encodeURIComponent("alt text is limited to 250 characters")}`);
      }
      throw e;
    }
  });

  // The type-chip iterate — a 0-cr mark edit (no run, no model call) → new version + re-render.
  app.post("/p/:project/figures/:figureId/spec-edit", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const mark = typeof form.mark === "string" ? form.mark : "";
    try {
      await deps.dataSource.editFigureSpec?.(session, row.id, figureId, { mark: mark as never });
      return c.redirect(`/p/${slug}/figures/${figureId}`);
    } catch (e) {
      const notice = e instanceof ApiError ? String(e.code ?? "chip_not_supported") : "chip_not_supported";
      return c.redirect(`/p/${slug}/figures/${figureId}?notice=${encodeURIComponent(notice)}`);
    }
  });

  // Restore v<n> — the version's spec/data/provenance copy back to head as a NEW version + re-render.
  app.post("/p/:project/figures/:figureId/versions/:n/restore", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const n = Number(c.req.param("n"));
    await deps.dataSource.restoreFigureVersion?.(session, row.id, figureId, n).catch(() => null);
    return c.redirect(`/p/${slug}/figures/${figureId}`);
  });

  // Insert… — the proposal card (alt + source line gate it server-side; nothing touches the draft).
  app.post("/p/:project/figures/:figureId/propose", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const afterBlockId = typeof form.afterBlockId === "string" && form.afterBlockId !== "" ? form.afterBlockId : undefined;
    try {
      await deps.dataSource.proposeFigure?.(session, row.id, figureId, {
        draftId: row.headDraftId ?? "",
        ...(afterBlockId ? { afterBlockId } : {}),
      });
      return c.redirect(`/p/${slug}/figures/${figureId}`);
    } catch (e) {
      const notice =
        e instanceof ApiError && e.status === 409 ? "figure_not_ready" : e instanceof ApiError ? String(e.code ?? "propose_failed") : "propose_failed";
      return c.redirect(`/p/${slug}/figures/${figureId}?notice=${encodeURIComponent(notice)}`);
    }
  });

  // Accept — ONE tx: the block splices through the draft save path (a frozen draft forks v(N+1)).
  app.post("/p/:project/figures/:figureId/proposals/accept", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    try {
      const out = await deps.dataSource.acceptFigureProposal?.(session, row.id, figureId);
      if (out?.inserted?.draftN != null) return c.redirect(`/p/${slug}/v/${out.inserted.draftN}`);
      return c.redirect(`/p/${slug}/figures/${figureId}`);
    } catch (e) {
      const notice = e instanceof ApiError ? String(e.code ?? "accept_failed") : "accept_failed";
      return c.redirect(`/p/${slug}/figures/${figureId}?notice=${encodeURIComponent(notice)}`);
    }
  });

  // Reject — clear the card; the figure asset stays in working figures.
  app.post("/p/:project/figures/:figureId/proposals/reject", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const figureId = c.req.param("figureId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    await deps.dataSource.rejectFigureProposal?.(session, row.id, figureId).catch(() => null);
    return c.redirect(`/p/${slug}/figures/${figureId}`);
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
    const q = (c.req.query("q") ?? "").trim();
    const voiceFilter = c.req.query("voice") || null; // a personaId or 'unfiled'
    const protocolFilter = c.req.query("protocol") || null; // a protocol id (§5.2 organisation)
    const sort = c.req.query("sort") === "title" ? "title" : "recent"; // Recent is the default
    const showArchived = c.req.query("archived") === "1";
    const showDeleted = c.req.query("deleted") === "1";
    const [rows, voices, groupBy, bal, search, protocols, deletedRows] = await Promise.all([
      deps.dataSource.listProjects(session),
      // The P1.04 seams degrade to empty/attention when a data source lacks them (fixtures, stale
      // bindings) — a missing method is a TypeError, not a rejection, so invoke inside .then.
      Promise.resolve().then(() => deps.dataSource.listVoices(session)).catch(() => []),
      Promise.resolve()
        .then(() => deps.dataSource.getProjectGrouping(session))
        .catch(() => "attention" as const),
      // PRB.12 — the §14.5 level-0 balance chip rides the nav (best-effort: a billing-read miss never
      // blocks the list).
      deps.dataSource.getBillingBalance(session).catch(() => undefined),
      q
        ? Promise.resolve()
            .then(() => deps.dataSource.searchProjects(session, q))
            .catch(() => [])
        : Promise.resolve(null),
      // the Protocol filter dropdown's options (the four seeded cards — picker metadata only).
      Promise.resolve().then(() => deps.dataSource.listProtocolCards(session)).catch(() => []),
      // `?deleted=1` — the 30-day restore window's rows (a separate scope: the list never mixes them).
      showDeleted
        ? Promise.resolve()
            .then(() => deps.dataSource.listDeletedProjects?.(session) ?? [])
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    // ---- P1.17 (§15.3) — the first-five-minutes precedence, run BEFORE the list renders ----
    // The Showcase opens first ONLY while it is the workspace's unopened only child; a user who
    // arrived carrying a file (entry draft/outline) wins instead — their file path lands first and
    // the Showcase waits as the list's second row. An archived or already-opened Showcase is just a
    // row. (Showcase rows are excluded from the count — the seed is not "the user's own work".)
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

    // SPA.3 — the strangler consult at spec §4's fixed position: AFTER the session gate AND the
    // first-five-minutes precedence (a carried file or an unopened Showcase still wins), before
    // the render. `project-home`'s flip ⇒ the shell document; else today's list continues.
    const spaDoc = await spaShellResponse(c, deps, "project-home", session);
    if (spaDoc) return spaDoc;

    let filtered = voiceFilter
      ? rows.filter((r) => (voiceFilter === "unfiled" ? r.voice == null : r.voice?.personaId === voiceFilter))
      : rows;
    if (protocolFilter) filtered = filtered.filter((r) => r.protocolId === protocolFilter);
    // Sort applies within each group (Needs-you keeps its deadline order regardless — §5.2).
    if (sort === "title") filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    const activeRows = filtered.filter((r) => r.archivedAt == null);
    const ctx = { voices };
    const toViews = (list: readonly typeof rows[number][]) => list.map((r) => toProjectRowView(r, ctx));
    return c.html(renderDocument(c.req.path, projectsElement, {
      home: {
        groupBy,
        attentionGroups: groupByAttention(activeRows).map((g) => ({ ...g, rows: toViews(g.rows) })),
        voiceGroups: groupByVoice(activeRows).map((g) => ({ ...g, rows: toViews(g.rows) })),
        voices,
        voiceFilter,
        protocolFilter,
        protocols,
        sort,
        showArchived,
        archivedRows: toViews(filtered.filter((r) => r.archivedAt != null)),
        showDeleted,
        deletedRows: toViews(deletedRows),
        ...(search != null ? { search: { q, results: search } } : {}),
      },
      ...(bal ? { balance: { spendableCredits: bal.spendableCredits, heldCredits: bal.heldCredits ?? 0 } } : {}),
      compact: isPhoneRequest(c),
    }));
  });

  // P1.04 — the Group-by select persists the per-user pref (PUT /settings/project-grouping) then
  // returns to the home (filter/search query params are dropped — grouping is the whole-page mode).
  app.post("/app/grouping", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const groupBy = form.groupBy === "voice" ? "voice" : "attention";
    await Promise.resolve()
      .then(() => deps.dataSource.setProjectGrouping(session, groupBy))
      .catch(() => undefined);
    return c.redirect("/app");
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

  /** The shared sheet loader: the protocol cards + the Voice picker's personas (+ REQ-GENRE-4's default
   *  display — Essay for no Voice; the api re-runs the full rule at create). */
  const loadNewProjectSheet = async (session: SessionHeaders) => {
    const [protocols, voices] = await Promise.all([
      Promise.resolve().then(() => deps.dataSource.listProtocolCards(session)).catch(() => []),
      Promise.resolve().then(() => deps.dataSource.listVoices(session)).catch(() => []),
    ]);
    return { protocols, voices };
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

  const renderNewProject = (
    c: Context,
    path: string,
    base: { protocols: Awaited<ReturnType<typeof loadNewProjectSheet>>["protocols"]; voices: Awaited<ReturnType<typeof loadNewProjectSheet>>["voices"] },
    np: Omit<NonNullable<PageData["newProject"]>, "protocols" | "voices">,
    extra?: Partial<PageData>,
  ) =>
    c.html(
      renderDocument(path, newProjectElement, {
        newProject: { protocols: base.protocols, voices: base.voices, ...np },
        compact: isPhoneRequest(c),
        ...extra,
      }),
    );

  app.get("/app/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult (spec §4 order): `onboarding`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "onboarding", session);
    if (spaDoc) return spaDoc;
    const entryQ = c.req.query("entry");
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "scratch";
    const sheet = await loadNewProjectSheet(session);
    return renderNewProject(c, c.req.path, sheet, {
      entry,
      defaultProtocolId: null,
      askProtocol: false,
      form: { title: "", protocolId: null, venue: null, personaId: null, startVersion: null, heldToken: null },
      // P1.17 — `?held=1` marks a landing drop-zone hold to claim (the script hydrates the file input).
      ...(c.req.query("held") === "1" ? { held: true } : {}),
    });
  });

  // The sheet's submit: scratch creates immediately; the upload entries run the workspace-scoped
  // conversion preview FIRST (§5.3's make-or-break moment — nothing is created until the user sees
  // source-beside-converted and clicks Create).
  app.post("/app/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const entryQ = typeof form.entry === "string" ? form.entry : "";
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "scratch";
    const picks = newProjectForm(form);
    const sheet = await loadNewProjectSheet(session);
    if (entry === "scratch") {
      if (!picks.title) {
        return renderNewProject(c, c.req.path, sheet, {
          entry, defaultProtocolId: null, askProtocol: false, form: picks, error: "A title is required.",
        }, undefined);
      }
      let created;
      try {
        created = await deps.dataSource.createProject(session, {
          title: picks.title, entry, protocolId: picks.protocolId, venue: picks.venue, personaId: picks.personaId,
        });
      } catch (e) {
        const message = e instanceof ApiError ? `Could not create the project (${e.code ?? e.status}).` : "Could not create the project.";
        return renderNewProject(c, c.req.path, sheet, {
          entry, defaultProtocolId: null, askProtocol: false, form: picks, error: message,
        });
      }
      return c.redirect(`/p/${created.slug}?created=scratch`);
    }
    // Upload entries — presign → quarantine PUT → convert → the preview leg (the PRB.20 path,
    // workspace-scoped: no project exists yet).
    const file = form.file;
    const bytes =
      file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0
        ? new Uint8Array(await (file as File).arrayBuffer())
        : undefined;
    const fileName = bytes && file && typeof file === "object" ? (file as File).name : undefined;
    const paste = typeof form.paste === "string" ? form.paste : "";
    if (!bytes && !paste.trim()) {
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks,
        error: "Upload a file or paste the text.",
      });
    }
    const sourceLabel = fileName ?? "pasted text";
    const raw = await Promise.resolve()
      .then(() =>
        deps.dataSource.previewWorkspaceImport(session, {
          ...(bytes ? { bytes, ...(fileName ? { fileName } : {}) } : { text: paste }),
        }),
      )
      .catch((e: unknown) => e);
    const out =
      raw && typeof raw === "object" && "status" in raw ? (raw as ImportPreviewOutcome) : null;
    if (!out) {
      // the preview seam missing/failed — re-render the sheet with the honest error, nothing created.
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks,
        error: "The conversion could not start — try again.",
      });
    }
    // ONB.1 — the title default chain: an explicitly typed title wins; then the document's own
    // leading H1 (`preview.title`); then the filename stem. Paste has no default — still required.
    const resolvedTitle =
      picks.title ||
      (out.status === "ready" ? out.preview.title : undefined) ||
      (fileName ? fileName.replace(/\.[^.]+$/, "").trim() : "");
    if (out.status === "pending") {
      // the title default resolves on the READY hop (the poll GET re-runs it with preview.title).
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks,
        pending: { quarantineKey: out.quarantineKey, sourceLabel },
      }, {
        autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: newProjectPollUrl(entry, out.quarantineKey, picks, sourceLabel) },
      });
    }
    if (!resolvedTitle) {
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks, error: "A title is required.",
      }, undefined);
    }
    return renderNewProject(c, c.req.path, sheet, {
      entry, defaultProtocolId: null, askProtocol: false, form: { ...picks, title: resolvedTitle },
      preview: {
        quarantineKey: out.quarantineKey,
        sourceLabel,
        sourceText: paste || (bytes ? `(${bytes.byteLength} bytes)` : ""),
        convertedMarkdown: out.preview.markdown,
        countLine: countLine(out.preview.counts),
        warnings: out.preview.warnings.map((w) => ({ message: w.message, blockId: w.anchor?.blockId ?? null })),
      },
    });
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
    const picks = newProjectForm(c.req.query() as Record<string, unknown>);
    const qk = c.req.query("qk");
    if (!qk) return c.redirect(`/app/new?entry=${entry}`);
    // SPA.3 — the strangler consult (spec §4 order): after the server-owned `qk` redirect, so a
    // missing quarantine key still lands on the entry sheet under the flag.
    const spaDoc = await spaShellResponse(c, deps, "onboarding", session);
    if (spaDoc) return spaDoc;
    const sheet = await loadNewProjectSheet(session);
    const sourceLabel = c.req.query("src") ?? "the upload";
    const out = await Promise.resolve()
      .then(() =>
        deps.dataSource.previewWorkspaceImport(session, {
          quarantineKey: qk,
          fileName: c.req.query("src") ?? undefined,
        }),
      )
      .catch(() => null);
    if (!out) return c.redirect(`/app/new?entry=${entry}`);
    if (out.status === "pending") {
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks,
        pending: { quarantineKey: qk, sourceLabel },
      }, {
        autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: newProjectPollUrl(entry, qk, picks, sourceLabel) },
      });
    }
    // ONB.1 — the same default chain as the POST: typed title → the document's H1 → the filename stem.
    const resolvedTitle =
      picks.title || out.preview.title || sourceLabel.replace(/\.[^.]+$/, "").trim();
    if (!resolvedTitle) return c.redirect(`/app/new?entry=${entry}`);
    return renderNewProject(c, c.req.path, sheet, {
      entry, defaultProtocolId: null, askProtocol: false, form: { ...picks, title: resolvedTitle },
      preview: {
        quarantineKey: qk,
        sourceLabel,
        sourceText: "(the uploaded source — already converted)",
        convertedMarkdown: out.preview.markdown,
        countLine: countLine(out.preview.counts),
        warnings: out.preview.warnings.map((w) => ({ message: w.message, blockId: w.anchor?.blockId ?? null })),
      },
    });
  });

  // The preview's Create (and Fix-now) — replays the quarantine key + the pick fields; the api adopts
  // the ALREADY-converted object (never a second upload or a second Job).
  app.post("/app/new/create", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const entryQ = typeof form.entry === "string" ? form.entry : "";
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "draft";
    const picks = newProjectForm(form);
    const qk = typeof form.qk === "string" ? form.qk : "";
    const sheet = await loadNewProjectSheet(session);
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
        return renderNewProject(c, c.req.path, sheet, {
          entry, defaultProtocolId: null, askProtocol: false, form: picks,
          pending: { quarantineKey: qk, sourceLabel: "the upload" },
        }, {
          autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: newProjectPollUrl(entry, qk, picks) },
        });
      }
      const message = e instanceof ApiError ? `Could not create the project (${e.code ?? e.status}).` : "Could not create the project.";
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks, error: message,
      }, undefined);
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
      return c.redirect(`/p/${created.slug}/v/${created.draftN}?${q.toString()}`);
    }
    return c.redirect(`/p/${created.slug}?${q.toString()}`);
  });

  // ---- P1.04 — the row actions (§5.2's "…" menu): the web POSTs resolve slug → id then call the
  // api through the data source. Slugs never change on rename; duplicate lands on the copy. ----

  /** Resolve the session-scoped project row for a slug (list rows are already tenant-scoped). */
  const projectRowFor = async (session: SessionHeaders, slug: string) =>
    (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug) ?? null;

  app.post("/p/:project/rename", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = await projectRowFor(session, slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const title = typeof form.title === "string" ? form.title.trim() : "";
    if (title) {
      await Promise.resolve()
        .then(() => deps.dataSource.renameProject(session, row.id, title))
        .catch(() => undefined);
    }
    return c.redirect(`/p/${slug}`);
  });

  app.post("/p/:project/duplicate", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = await projectRowFor(session, slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const copy = await Promise.resolve()
      .then(() => deps.dataSource.duplicateProject(session, row.id))
      .catch(() => null);
    return c.redirect(copy ? `/p/${copy.slug}` : `/p/${slug}`);
  });

  for (const [suffix, call] of [
    ["archive", (ds: DataSource, s: SessionHeaders, id: string) => ds.archiveProject(s, id)],
    ["unarchive", (ds: DataSource, s: SessionHeaders, id: string) => ds.unarchiveProject(s, id)],
    ["delete", (ds: DataSource, s: SessionHeaders, id: string) => ds.deleteProject(s, id)],
  ] as const) {
    app.post(`/p/:project/${suffix}`, async (c) => {
      const session = deps.session(c);
      if (!session) return c.redirect("/login");
      const slug = c.req.param("project");
      const row = await projectRowFor(session, slug);
      if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
      await Promise.resolve()
        .then(() => call(deps.dataSource, session, row.id))
        .catch(() => undefined);
      return c.redirect("/app");
    });
  }

  // Restore resolves against the DELETED rows (the live list never carries them — §5.2's 30-day window).
  app.post("/p/:project/restore", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const deleted = await Promise.resolve()
      .then(() => deps.dataSource.listDeletedProjects?.(session) ?? [])
      .catch(() => []);
    const row = deleted.find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    await Promise.resolve()
      .then(() => deps.dataSource.restoreProject(session, row.id))
      .catch(() => undefined);
    return c.redirect("/app?deleted=1");
  });

  // ---- P1.19 — the §5.11 Inbox (`/app/inbox`; REQ-IDE-2 amended): the global blocked-on-you →
  // unread → earlier → voices surface. The api's /inbox owns the ordering; the web page renders it
  // verbatim. The read POSTs collapse to the api's marks; deep links land on the focused surface. ----
  app.get("/app/inbox", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult (spec §4 order): `inbox`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "inbox", session);
    if (spaDoc) return spaDoc;
    const [items, badge] = await Promise.all([
      Promise.resolve()
        .then(() => deps.dataSource.getInbox?.(session) ?? [])
        .catch(() => []),
      Promise.resolve()
        .then(() => deps.dataSource.getInboxBadge?.(session))
        .then((b) => (b && typeof b.count === "number" ? b.count : 0))
        .catch(() => 0),
    ]);
    // §5.11 — "inline Approve opens the artifact in a side sheet first": an expanded gate row mounts
    // the run's REAL §6.4 card (the same `gateCardFor` the Needs-you surface renders). The row DTO
    // carries ids only, so the page loads each touched project's open-gates read once and joins by
    // gate id — a missing read degrades the row to its deep link, never a failed page.
    const gateProjectIds = [...new Set(items.filter((i) => i.gate != null).map((i) => i.projectId).filter((p): p is string => p != null))];
    const gateLists = await Promise.all(
      gateProjectIds.map((pid) =>
        Promise.resolve()
          .then(() => deps.dataSource.listGates(session, pid))
          .catch(() => [] as GateCardDto[]),
      ),
    );
    const gatesById = new Map(gateLists.flat().map((g) => [g.id, g] as const));
    const gateCards: Record<string, GateCardDto> = {};
    for (const it of items) {
      if (it.gate == null) continue;
      const card = gatesById.get(it.gate.gateId);
      if (card) gateCards[it.id] = card;
    }
    return c.html(
      renderDocument(c.req.path, inboxElement, {
        inbox: { items, badge, gateCards },
        compact: isPhoneRequest(c),
      }),
    );
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
    // SPA.3 — the strangler consult (spec §4 order): after the confirmEmail consume+redirect so a
    // token round-trip never lands in the shell.
    const spaDoc = await spaShellResponse(c, deps, "settings", session);
    if (spaDoc) return spaDoc;
    const account = await Promise.resolve()
      .then(() => deps.dataSource.getAccountSettings?.(session))
      .catch(() => undefined);
    return c.html(renderDocument(c.req.path, settingsElement, {
      settings: {
        section: "account",
        ...(account ? { account } : {}),
        saved: c.req.query("saved") === "1",
        ...(c.req.query("notice") ? { notice: c.req.query("notice")! } : {}),
      },
    }));
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
    // SPA.3 — the strangler consult (spec §4 order): `settings`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "settings", session);
    if (spaDoc) return spaDoc;
    const prefs = await Promise.resolve()
      .then(() => deps.dataSource.getPreferencesSettings?.(session))
      .catch(() => undefined);
    return c.html(renderDocument(c.req.path, settingsElement, {
      settings: {
        section: "preferences",
        ...(prefs ? { preferences: prefs } : {}),
        saved: c.req.query("saved") === "1",
      },
    }));
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
    // SPA.3 — the strangler consult (spec §4 order): `settings`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "settings", session);
    if (spaDoc) return spaDoc;
    const [notif, projects] = await Promise.all([
      Promise.resolve().then(() => deps.dataSource.getNotificationPrefs?.(session)).catch(() => undefined),
      Promise.resolve()
        .then(() => deps.dataSource.listProjects?.(session))
        .then((rows) => (rows ?? []).map((r) => ({ id: r.id, title: r.title })))
        .catch(() => [] as { id: string; title: string }[]),
    ]);
    return c.html(renderDocument(c.req.path, settingsElement, {
      settings: {
        section: "notifications",
        ...(notif ? { notifications: { ...notif, projects } } : {}),
        saved: c.req.query("saved") === "1",
        ...(c.req.query("notice") ? { notice: c.req.query("notice")! } : {}),
      },
    }));
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
    // SPA.3 — the strangler consult (spec §4 order): `settings`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "settings", session);
    if (spaDoc) return spaDoc;
    const integrations = await Promise.resolve()
      .then(() => deps.dataSource.getIntegrationsSettings?.(session))
      .catch(() => undefined);
    return c.html(renderDocument(c.req.path, settingsElement, {
      settings: {
        section: "integrations",
        ...(integrations ? { integrations } : {}),
        saved: c.req.query("saved") === "1",
      },
    }));
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
    // SPA.3 — the strangler consult (spec §4 order): `settings`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "settings", session);
    if (spaDoc) return spaDoc;
    const [privacy, data, acct] = await Promise.all([
      deps.dataSource.getPrivacySettings(session).catch(() => ({ analyticsOptOut: false })),
      Promise.resolve().then(() => deps.dataSource.getDataSettings?.(session)).catch(() => undefined),
      // P1.18 — the latest account-export build (best-effort: the section still renders without it).
      Promise.resolve()
        .then(() => deps.dataSource.getAccountExportState?.(session))
        .then((r) => r ?? { export: null })
        .catch(() => ({ export: null })),
    ]);
    const notice = c.req.query("notice");
    return c.html(renderDocument(c.req.path, settingsElement, {
      privacy: { analyticsOptOut: privacy.analyticsOptOut, saved: c.req.query("saved") === "1" },
      accountExport: {
        export: acct?.export ?? null,
        ...(notice ? { notice } : {}),
        ...(c.req.query("p") != null
          ? {
              imported: {
                projects: Number(c.req.query("p") ?? 0),
                voices: Number(c.req.query("v") ?? 0),
                files: Number(c.req.query("f") ?? 0),
                deduped: false,
              },
            }
          : {}),
      },
      settings: {
        section: "data",
        ...(data ? { data } : {}),
        saved: c.req.query("saved") === "1",
        ...(notice ? { notice } : {}),
      },
    }));
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
    // SPA.3 — the strangler consult (spec §4 order): `settings`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "settings", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session).catch(() => [])).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const [projectSettings, approvalSettings] = await Promise.all([
      Promise.resolve().then(() => deps.dataSource.getProjectSettings?.(session, row.id)).catch(() => undefined),
      Promise.resolve().then(() => deps.dataSource.getApprovalSettings?.(session, row.id)).catch(() => undefined),
    ]);
    if (!projectSettings) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(renderDocument(c.req.path, projectSettingsElement, {
      projectSettings: {
        slug,
        settings: projectSettings,
        ...(approvalSettings ? { approvalSettings } : {}),
        saved: c.req.query("saved") === "1",
        ...(c.req.query("notice") ? { notice: c.req.query("notice")! } : {}),
      },
    }));
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
    // SPA.3 — the strangler consult (spec §4 order): `usage`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "usage", session);
    if (spaDoc) return spaDoc;
    const [usage, usageAccount] = await Promise.all([
      deps.dataSource.getUsage(session).catch(() => undefined),
      // P1.16 — the §14.5 level-1 account read (buckets, period, warnings, next expiry). Best-effort:
      // a billing-read miss degrades to the glance, never a blank page.
      Promise.resolve().then(() => deps.dataSource.getUsageAccount?.(session)).catch(() => undefined),
    ]);
    return c.html(renderDocument(c.req.path, usageElement, {
      ...(usage ? { usage } : {}),
      ...(usageAccount ? { usageAccount } : {}),
      dwellSurface: "usage",
    }));
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
    // SPA.3 — the strangler consult (spec §4 order): `usage`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "usage", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const rows = await deps.dataSource.listProjects(session).catch(() => []);
    const row = rows.find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const usageProject = await Promise.resolve()
      .then(() => deps.dataSource.getUsageProject?.(session, row.id))
      .then((u) => (u ? { ...u, slug } : undefined))
      .catch(() => undefined);
    if (!usageProject) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(renderDocument(c.req.path, projectUsageElement, { usageProject }));
  });

  // ---- P1.16 — billing, full (§14.2/14.3/14.6): the plan card, Checkout/portal/auto-reload POSTs,
  // the Team waitlist, and the checkout-return poll (REQ-BILL-14 — the ≤30 s webhook-lag window).
  // P1.20 — the section's canonical §4.2 path is /app/settings/billing; the beta's /settings/billing
  // stays mounted as the legacy alias (existing form posts + deep links keep working). ----
  const billingPageHandler = async (c: Context) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult (spec §4 order): `billing`'s flip ⇒ the shell document. The
    // shared handler covers BOTH mounts (/app/settings/billing + the /settings/billing alias).
    const spaDoc = await spaShellResponse(c, deps, "billing", session);
    if (spaDoc) return spaDoc;
    const [subscription, plans] = await Promise.all([
      Promise.resolve().then(() => deps.dataSource.getSubscription?.(session)).catch(() => undefined),
      Promise.resolve().then(() => deps.dataSource.getPlans?.(session)).catch(() => undefined),
    ]);
    return c.html(renderDocument(c.req.path, billingElement, {
      compact: isPhoneRequest(c),
      ...(subscription && plans
        ? {
            billing: {
              subscription,
              plans,
              ...(c.req.query("saved") === "1" ? { saved: true } : {}),
              // BILL.3 — the notice code maps through the per-class copy (an api refusal is told
              // apart from Stripe being down; unknown codes land the generic note).
              ...(c.req.query("notice") ? { notice: billingNoticeFor(c.req.query("notice")) } : {}),
            },
          }
        : {}),
    }));
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
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
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
    if (!out?.url) return c.redirect(`${base}?notice=${failure ?? "checkout"}`);
    const target = stripeRedirectTarget(out.url, (m) => console.error(m));
    if (!target) return c.redirect(`${base}?notice=checkout`);
    return c.redirect(target);
  });
  billingPost("topup", async (c, base) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
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
    if (!out?.url) return c.redirect(`${base}?notice=${failure ?? "checkout"}`);
    const target = stripeRedirectTarget(out.url, (m) => console.error(m));
    if (!target) return c.redirect(`${base}?notice=checkout`);
    return c.redirect(target);
  });
  // Plan change — an upgrade applies now, a downgrade schedules to period end (§14.2/14.6).
  billingPost("change-plan", async (c, base) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const tier = typeof form.tier === "string" ? form.tier : "";
    const cycle = form.cycle === "annual" ? "annual" as const : "monthly" as const;
    const out = await Promise.resolve()
      .then(() => deps.dataSource.changePlan?.(session, tier, cycle))
      .catch(() => undefined);
    if (!out || "error" in out) return c.redirect(`${base}?notice=change`);
    return c.redirect(`${base}?saved=1`);
  });
  // Cancel = cancel_at_period_end — access runs to the paid-through date (§14.6).
  billingPost("cancel", async (c, base) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const out = await Promise.resolve()
      .then(() => deps.dataSource.cancelSubscription?.(session))
      .catch(() => undefined);
    if (!out?.applied) return c.redirect(`${base}?notice=cancel`);
    return c.redirect(`${base}?saved=1`);
  });
  // Auto-reload — the opt-in, user-capped, only unattended charge path (REQ-BILL-17).
  billingPost("auto-reload", async (c, base) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
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
    if (!out?.ok) return c.redirect(`${base}?notice=${failure ?? "autoreload"}`);
    return c.redirect(`${base}?saved=1`);
  });
  // The Stripe Customer-Portal session — payment methods, invoices, receipts live Stripe-side.
  billingPost("portal", async (c, base) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    let failure: string | null = null;
    const out = await Promise.resolve()
      .then(() => deps.dataSource.createBillingPortalSession?.(session, base))
      .catch((e) => {
        failure = billingFailureCode(e, "portal");
        console.error(`[web] billing portal failed: ${failure} (${e instanceof ApiError ? `api ${e.status}` : "no response"})`);
        return undefined;
      });
    if (!out?.url) return c.redirect(`${base}?notice=${failure ?? "portal"}`);
    const target = stripeRedirectTarget(out.url, (m) => console.error(m));
    if (!target) return c.redirect(`${base}?notice=portal`);
    return c.redirect(target);
  });
  // The Team tier's waitlist row (§14.2 — listed with its price; mechanics are 1.x).
  billingPost("waitlist", async (c, base) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const out = await Promise.resolve()
      .then(() => deps.dataSource.joinTeamWaitlist?.(session, {
        email: typeof form.email === "string" ? form.email : "",
        ...(typeof form.seats === "string" && Number(form.seats) > 0 ? { seats: Number(form.seats) } : {}),
      }))
      .catch(() => undefined);
    if (!out?.ok) return c.redirect(`${base}?notice=waitlist`);
    return c.redirect(`${base}?saved=1`);
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
    // SPA.3 — the strangler consult (spec §4 order): `billing`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "billing", session);
    if (spaDoc) return spaDoc;
    const sessionId = c.req.query("session_id") ?? "";
    const cancelled = c.req.query("cancelled") === "1";
    const checkoutReturn = sessionId
      ? await Promise.resolve()
          .then(() => deps.dataSource.getCheckoutSession?.(session, sessionId))
          .catch(() => undefined)
      : undefined;
    // §14.6's webhook-lag bound is real: an `open` row auto-refreshes only for 30 s after Checkout
    // creation, then leaves the pending/email-fallback copy on a stable page instead of polling forever.
    const openAgeMs = checkoutReturn?.createdAt ? Date.now() - Date.parse(checkoutReturn.createdAt) : Number.POSITIVE_INFINITY;
    const stillPolling = openAgeMs >= 0 && openAgeMs < 30_000;
    return c.html(renderDocument(c.req.path, billingReturnElement, {
      ...(checkoutReturn ? { checkoutReturn } : {}),
      ...(cancelled ? { checkoutCancelled: true } : {}),
      ...(checkoutReturn?.state === "open" && !cancelled && stillPolling
        ? { autoRefresh: { seconds: 5, url: `/billing/return?session_id=${encodeURIComponent(sessionId)}` } }
        : {}),
    }));
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
    // SPA.3 — the consult runs AFTER the Page family's forced-SSR capability check (REQ-ED-12 +
    // REQ-VFY-5): a phone request or a read-only `showcase` row keeps the server-rendered Page
    // even when `editor` flips — the flag never re-enables a mount the capability refused.
    if (!isPhoneRequest(c) && row.showcase !== true) {
      const spaDoc = await spaShellResponse(c, deps, "editor", session, { paperTheme: row.paperTheme });
      if (spaDoc) return spaDoc;
    }
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
    // a bounced disposition write (a gate row's per-finding override) re-renders with the error under
    // that row's controls — never dropped silently.
    const derror = c.req.query("derror");
    // PRB.12 — the presence timer actually rendered on this page for a card with a live countdown
    // (§6.4 item 2; REQ-SPEC-18). One mint per timer shown.
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
      row.activeRun
        ? Promise.resolve()
            .then(() => deps.dataSource.getRunEvents?.(session, row.activeRun!.runId))
            .then((events) =>
              events
                ? { rows: feedRowsFor(events, "details"), lastSeq: events.reduce((m, e) => Math.max(m, e.seq), 0) }
                : null,
            )
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    return c.html(
      renderDocument(c.req.path, projectElement, {
        // P1.01 — the project overview mounts inside the IDE frame; ?focus=1 seeds the Focus view.
        ...(await ideContext(c, session, { ...row, slug }, {
          inboxCount: badge ?? gates.length + decisions.length,
          ...(timeline ? { timelineView: timeline, runNextHref: `/p/${slug}/run` } : {}),
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
          ...(pageLoad
            ? {
                status: {
                  version: `v${pageLoad.doc.draftN}`,
                  ...(pageLoad.doc.meters?.words != null ? { words: pageLoad.doc.meters.words } : {}),
                  ...(pageLoad.doc.meters?.readMin != null ? { readMin: pageLoad.doc.meters.readMin } : {}),
                  ...(pageLoad.doc.venueCap ? { venueCap: pageLoad.doc.venueCap } : {}),
                },
              }
            : {}),
        })),
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
                ...(isPhoneRequest(c) || row.showcase ? { readOnly: true } : {}),
                ...(deps.collabWsUrl && !(isPhoneRequest(c) || row.showcase)
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
    // SPA.3 — the strangler consult (spec §4 order): `voices`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "voices", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const preview = await deps.dataSource.getVoiceReseedPreview(session, row.id).catch(() => null);
    if (!preview) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(
      renderDocument(c.req.path, voiceReseedElement, {
        voiceReseed: { slug, projectId: row.id, preview },
        compact: isPhoneRequest(c),
      }),
    );
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
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const current = await deps.dataSource.getApprovalOverrides(session, row.id).catch(() => ({}) as Record<string, number | null>);
    const overrides: Record<string, number | null> = { ...current };
    if (form.approve_triage_24h === "on") overrides.approve_triage = 24 * 60 * 60 * 1000;
    else delete overrides.approve_triage;
    await deps.dataSource.setApprovalOverrides(session, row.id, overrides);
    return c.redirect(`/p/${slug}`);
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
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
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
    await deps.dataSource.decideGate(session, row.id, c.req.param("gid"), {
      action: action === "wait" ? "wait" : (action as "approve" | "approve_autonomous" | "keep_planning" | "stop"),
      ...(guidance != null ? { guidance } : {}),
      ...(standing ? { standingRule: true } : {}),
      ...(hasEdits ? { edits } : {}),
      ...(overrides ? { overrides } : {}),
    });
    return c.redirect(`/p/${slug}`);
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
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const answer = typeof form.answer === "string" ? form.answer : "";
    await deps.dataSource.answerDecision(session, row.id, c.req.param("dcr"), answer);
    return c.redirect(`/p/${slug}`);
  });

  // Auth-gated: the §5.3 import flow (upload/paste → conversion preview → create).
  app.get("/p/:project/import", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult (spec §4 order): the import legs are `onboarding` AND
    // `ide-chrome` — a per-route AND composition since only these two onboarding legs are
    // IDE-framed (design/29 §route-map).
    const spaDoc = await spaShellResponse(c, deps, ["onboarding", "ide-chrome"], session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(
      renderDocument(c.req.path, importElement, {
        ...(await ideContext(c, session, row)),
        project: { title: row.title, pill: row.state.pill, slug },
        compact: isPhoneRequest(c),
      }),
    );
  });

  app.post("/p/:project/import/preview", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const input = await parseImportInput(c, slug);
    const out = await deps.dataSource.previewImport(session, input);
    if (out.status === "pending") {
      // PRB.21 — a cold convert Job runs ~2.5–4 min; never hold one request for it. Render the
      // converting state; the page re-polls the GET below (the api joins the in-flight execution —
      // a retry is neither a second upload nor a duplicate `jobs:run`).
      return c.html(
        renderDocument(c.req.path, importPreviewElement, {
          ...(await ideContext(c, session, { id: slug, slug })),
          project: { title: input.fileName ?? slug, pill: "", slug },
          compact: isPhoneRequest(c),
          conversion: {
            projectSlug: slug,
            sourceLabel: input.fileName ?? "pasted text",
            pending: true,
            quarantineKey: out.quarantineKey,
          },
          autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: importPollUrl(slug, out.quarantineKey, input.fileName) },
        }),
      );
    }
    return c.html(
      renderDocument(c.req.path, importPreviewElement, {
        ...(await ideContext(c, session, { id: slug, slug })),
        project: { title: input.fileName ?? slug, pill: "", slug },
        compact: isPhoneRequest(c),
        conversion: toConversionData(slug, input, out.preview, out.quarantineKey),
      }),
    );
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
    // SPA.3 — the strangler consult (spec §4 order): after the server-owned `qk` redirect; the
    // import legs gate on `onboarding` AND `ide-chrome`.
    const spaDoc = await spaShellResponse(c, deps, ["onboarding", "ide-chrome"], session);
    if (spaDoc) return spaDoc;
    const src = c.req.query("src");
    const input: ImportInput = { projectSlug: slug, quarantineKey: qk, ...(src ? { fileName: src } : {}) };
    const out = await deps.dataSource.previewImport(session, input);
    if (out.status === "pending") {
      return c.html(
        renderDocument(c.req.path, importPreviewElement, {
          ...(await ideContext(c, session, { id: slug, slug })),
          project: { title: input.fileName ?? slug, pill: "", slug },
          compact: isPhoneRequest(c),
          conversion: {
            projectSlug: slug,
            sourceLabel: input.fileName ?? "the upload",
            pending: true,
            quarantineKey: out.quarantineKey,
          },
          autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: importPollUrl(slug, out.quarantineKey, input.fileName) },
        }),
      );
    }
    return c.html(
      renderDocument(c.req.path, importPreviewElement, {
        ...(await ideContext(c, session, { id: slug, slug })),
        project: { title: input.fileName ?? slug, pill: "", slug },
        compact: isPhoneRequest(c),
        conversion: toConversionData(slug, input, out.preview, out.quarantineKey),
      }),
    );
  });

  app.post("/p/:project/import/create", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const input = await parseImportInput(c, slug);
    try {
      await deps.dataSource.createImport(session, input);
    } catch (e) {
      // PRB.21 — the converted object wasn't there yet (a stale preview page or a slow Job): the api
      // 409s `conversion_pending` — drop back to the converting state; its poll finishes the preview.
      if (e instanceof ApiError && e.status === 409 && e.code === "conversion_pending" && input.quarantineKey) {
        return c.html(
          renderDocument(c.req.path, importPreviewElement, {
            compact: isPhoneRequest(c),
            conversion: {
              projectSlug: slug,
              sourceLabel: input.fileName ?? "the upload",
              pending: true,
              quarantineKey: input.quarantineKey,
            },
            autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: importPollUrl(slug, input.quarantineKey, input.fileName) },
          }),
        );
      }
      throw e;
    }
    // The draft now exists; the flat project view shows it. (Fix-now block editing is PRB.07.)
    return c.redirect(`/p/${slug}`);
  });

  // Auth-gated: the run sheet — the launcher for Review / Revise / Fact-check and the ONLY paywall (§5.6).
  // GET renders the sheet for the chosen workflow/rigor (query-driven, no client bundle); the estimate is
  // computed via the shared @rhema/run-sheet estimator (the same one the stateless /estimates endpoint uses).
  app.get("/p/:project/run", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult (spec §4 order): `run-sheet`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "run-sheet", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // P1.06 — the sheet's ONE context read (§5.6; REQ-IDE-13): head draft, sections, obligations, the
    // trial entitlement, the consent pref, and `blockedBy` — the run THIS sheet's workflow+scope would
    // collide with under the P1.06 per-write-lock ruling. `row.activeRun` is only the fallback when the
    // context read fails (fail-conservative — never a surprise duplicate).
    const sheetCtx = await Promise.resolve()
      .then(() =>
        deps.dataSource.getRunSheetContext?.(session, row.id, {
          workflow: normalizeWorkflow(c.req.query("workflow") ?? "review"),
          ...(c.req.query("scope") ? { scope: c.req.query("scope")! } : {}),
        }),
      )
      .catch(() => null);
    const blocking = sheetCtx?.blockedBy ?? (sheetCtx == null ? row.activeRun : null);
    if (blocking) {
      return c.html(
        renderDocument(c.req.path, runSheetElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          runSheet: {
            slug,
            projectTitle: row.title,
            view: buildSheet(c.req.query(), undefined, deps.betaPlanOfferUrl, sheetCtx),
            activeRun: { runId: blocking.runId, state: blocking.state },
          },
          compact: isPhoneRequest(c),
        }),
      );
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
      ...buildSheet(c.req.query(), billing, deps.betaPlanOfferUrl, sheetCtx),
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
    // ACT.1 — the trial unlock's device fingerprint plants on the sheet GET so the Run POST can
    // forward it (minted HttpOnly; the api stores only its salted hash).
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
    return c.html(renderDocument(c.req.path, runSheetElement, {
      ...(await ideContext(c, session, row)),
      project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
      runSheet: {
        slug,
        projectTitle: row.title,
        view,
        // BILL.3 — the exhausted POST bounced back because purchase is closed: the paused line.
        ...(c.req.query("notice") === "purchase_paused" ? { notice: COPY.runSheet.purchasePaused } : {}),
      },
      ...(pretriage ? { pretriage } : {}),
      compact: isPhoneRequest(c),
    }));
  });

  // The Run click — the ONLY run creator (REQ-CHAT-25). Mints nothing new: the sheet-minted idempotency key
  // comes in the form. On success the sheet reports the run started (§5.6 item 10).
  app.post("/p/:project/run", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
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
    try {
      await deps.dataSource.createRun(session, row.id, {
        idempotencyKey: str("idempotencyKey") || randomUUID(),
        workflow,
        modelProfile: { tier: modelTier },
        modelTier,
        rigor,
        estimateCredits: Number(str("estimateCredits")) || 0,
        capCredits: Number(str("capCredits")) || 0,
        rateTableVersion: Number(str("rateTableVersion")) || 1,
        inputs: {},
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
      // Insufficient balance (§14.6): never a silent bill — re-render the sheet with the resolution notice,
      // no run created. Any other api error is a real failure and propagates.
      // PRB.21 / D-PRB.20-1 — a run went live between the sheet render and the click (or a second tab):
      // the api 409s `run_in_progress` and no second hold was taken. Re-render the in-progress state,
      // refreshing the active run fact from the project list — never an error page.
      if (e instanceof ApiError && e.status === 409 && e.code === "run_in_progress") {
        const fresh = await deps.dataSource
          .listProjects(session)
          .then((rows) => rows.find((r) => r.slug === slug))
          .catch(() => undefined);
        return c.html(
          renderDocument(c.req.path, runSheetElement, {
            ...(await ideContext(c, session, { ...fresh, id: row.id, slug })),
            project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
            runSheet: {
              slug,
              projectTitle: row.title,
              view,
              activeRun: fresh?.activeRun ?? { runId: "", state: "" },
            },
          }),
          409,
        );
      }
      if (e instanceof ApiError && e.status === 402) {
        // the panel is showing again (the Run click hit the balance wall) — count the impression.
        await deps.dataSource.recordExhaustedPrompt(session, "shown").catch(() => undefined);
        return c.html(renderDocument(c.req.path, runSheetElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          runSheet: { slug, projectTitle: row.title, view, notice: COPY.runSheet.insufficient },
        }));
      }
      // ACT.1 — every first-spend refusal renders honest copy and creates no run: `trial_denied`
      // (403), `phone_challenge_required` (403), `trial_ceiling` (429 — paused, retryable tomorrow),
      // `trial_word_cap`/`trial_shape`/`entitlement_unavailable` (422). The sheet re-renders without
      // the entitlement (the api's context read now reports none usable) so the dollar/cap arithmetic
      // the claim would have replaced shows honestly.
      if (
        e instanceof ApiError &&
        ["trial_denied", "phone_challenge_required", "trial_ceiling", "trial_word_cap", "trial_shape", "entitlement_unavailable"].includes(e.code ?? "")
      ) {
        const noticeByCode: Record<string, string> = {
          trial_denied: COPY.runSheet.trialDenied,
          phone_challenge_required: COPY.runSheet.trialPhoneChallenge,
          trial_ceiling: COPY.runSheet.trialCeiling,
          entitlement_unavailable: COPY.runSheet.entitlementUnavailable,
          trial_shape: COPY.runSheet.trialShape,
          trial_word_cap: COPY.runSheet.trialWordCapFmt.replace(
            /\{cap\}/g,
            String(postCtx?.entitlement?.wordCap ?? "—"),
          ),
        };
        const fresh = buildSheet(
          {
            workflow,
            rigor,
            ...(submittedTier ? { modelTier: submittedTier } : {}),
            words: str("words"),
            claims: str("claims"),
            ...toggleQuery,
          },
          await deps.dataSource.getBillingBalance(session).catch(() => undefined),
          deps.betaPlanOfferUrl,
          await Promise.resolve()
            .then(() =>
              deps.dataSource.getRunSheetContext?.(session, row.id, {
                workflow,
                ...(str("scope") ? { scope: str("scope") } : {}),
              }),
            )
            .catch(() => null),
        );
        return c.html(renderDocument(c.req.path, runSheetElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          runSheet: { slug, projectTitle: row.title, view: fresh, notice: noticeByCode[e.code!] },
        }), e.status as 403 | 422 | 429);
      }
      // EST.1 — a forged/stale tier the plan locks 403s `model_tier_requires_upgrade`/`trial_base_only`:
      // re-render the sheet at the plan-clamped tier (the view's `requestedModelTier` carries the "your
      // plan includes X only" notice) — never the suspension line for a lever the user can't pick.
      if (
        e instanceof ApiError &&
        e.status === 403 &&
        (e.code === "model_tier_requires_upgrade" || e.code === "trial_base_only")
      ) {
        return c.html(renderDocument(c.req.path, runSheetElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          runSheet: { slug, projectTitle: row.title, view },
        }), 403);
      }
      // REQ-SPEC-24.7 + PRB.13: a suspension or an unverified email can land between the sheet render and
      // the Run click — the api 403s with the reason code on the error (`account_suspended` /
      // `email_unverified`); re-render the sheet with the matching notice, never a silent failure.
      if (e instanceof ApiError && e.status === 403) {
        const fresh = buildSheet(
          {
            workflow,
            rigor,
            ...(submittedTier ? { modelTier: submittedTier } : {}),
            words: str("words"),
            claims: str("claims"),
            ...toggleQuery,
          },
          await deps.dataSource.getBillingBalance(session).catch(() => undefined),
          deps.betaPlanOfferUrl,
          postCtx,
        );
        const notice = e.code === "email_unverified" ? COPY.runSheet.emailUnverified : COPY.runSheet.suspended;
        return c.html(renderDocument(c.req.path, runSheetElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          runSheet: { slug, projectTitle: row.title, view: fresh, notice },
        }), 403);
      }
      throw e;
    }
    // Re-render the sheet with the run-started confirmation (the run card lives on the project view — P1.01).
    return c.html(renderDocument(c.req.path, runSheetElement, {
      ...(await ideContext(c, session, row)),
      project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
      runSheet: { slug, projectTitle: row.title, view, started: true },
    }));
  });

  // PRB.08 — the exhaustion panel's Payment-Link action (§14.6; the beta's ONE real-money channel). A plain
  // form POST (no JS needed): record `credits.exhausted_prompt{action_taken}` (REQ-BETA-12), then 302 to the
  // Payment Link for `open_payment_link`. The link URL comes from the api's balance read (deploy config) —
  // never a form field, so this route is no open redirect.
  app.post("/p/:project/exhausted", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const action = typeof form.action_taken === "string" && form.action_taken !== "" ? form.action_taken : "unknown";
    await deps.dataSource.recordExhaustedPrompt(session, action).catch(() => undefined);
    if (action === "open_payment_link") {
      const billing = await deps.dataSource.getBillingBalance(session).catch(() => undefined);
      // BILL.3 — the purchase switch binds the Payment Link too: anything short of an explicit `open`
      // (closed, absent on an older api, or a failed read) gets the paused note, never a checkout; and
      // the redirect target is validated against the Stripe-hosted allowlist before the 302 (the CSP
      // form-action list admits nothing else anyway).
      if (billing?.purchase !== "open") {
        return c.redirect(`/p/${slug}/run?notice=purchase_paused`);
      }
      // F32 (PRB.19): the Payment Link must carry `client_reference_id=<billingAccountId>` — without it the
      // Stripe-originated checkout lands `unresolved` (money taken, no grant(topup)). Composed, never
      // concatenated, so an existing query on the configured link survives.
      if (billing?.paymentLinkUrl) {
        const target = stripeRedirectTarget(
          paymentLinkWithReference(billing.paymentLinkUrl, billing.billingAccountId),
          (m) => console.error(m),
        );
        if (target) return c.redirect(target);
      }
    }
    return c.redirect(`/p/${slug}/run`);
  });

  // Auth-gated: the delivered-review dossier reading surface (PRB.04, §5.5/§5.7/§6.6). The findings-core read
  // models + @rhema/ui surfaces render server-side; the live data binding (reading a delivered run) is D-PRB.04-1.
  app.get("/p/:project/review/:runId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult (spec §4 order): `dossier`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "dossier", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const runId = c.req.param("runId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // STB.2 — the api's dossier 404 (a run that completed without a delivered review correspondence)
    // must render the not-found page, not escape as a 500.
    const dossier = await deps.dataSource.getDossier(session, { projectSlug: slug, runId }).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!dossier) return c.html(renderDocument(c.req.path, notFoundElement), 404);
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
    return c.html(renderDocument(c.req.path, dossierElement, {
      // P1.01 — the dossier IS the IDE's flagship reading surface: its findings feed the Margin
      // (cards ↔ ticks) + the Desk's screen-reader findings table, its run feeds the Timeline.
      // P1.07 — the ticks echo the SHARED filtered list (the same set the Margin/Desk render).
      ...(await ideContext(c, session, row, {
        findings: filteredRows.map((f) => ({ id: f.id, severity: f.severity, kind: f.kind, excerpt: f.title })),
        ...(timeline
          ? { timelineView: timeline, runNextHref: `/p/${slug}/run` }
          : { timeline: [{ id: runId, label: dossier.versionLabel, state: "delivered", href: `/p/${slug}/review/${runId}` }] }),
        status: { version: dossier.versionLabel },
      })),
      project: { title: dossier.projectTitle, pill: "", slug, headDraftId: row.headDraftId },
      dossier,
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
      compact: isPhoneRequest(c),
      dwellSurface: "dossier",
      ...(savedFindingId ? { triage: { savedFindingId } } : {}),
    }));
  });

  // ---- P1.05 — the run report + §6.5 steering + the live-feed SSE proxy (§5.5/§14.5) ----

  // The run report page (the Timeline card's "Run report" link; §14.5). `?advanced=1` lazy-loads the
  // Level-4 drill-down into the Advanced disclosure — the report read model is already split, so the
  // plain page never carries token-level rows (tokens appear ONLY inside the disclosure's copy).
  app.get("/p/:project/r/:runId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult (spec §4 order): `run-report`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "run-report", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project");
    const runId = c.req.param("runId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
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
    if (!report) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(
      renderDocument(c.req.path, runReportElement, {
        ...(await ideContext(c, session, row, {
          ...(timeline ? { timelineView: timeline, runNextHref: `/p/${slug}/run` } : {}),
        })),
        project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
        runReport: { slug, runId, report },
        dwellSurface: "report",
      }),
    );
  });

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
      if (!session) return c.redirect("/login");
      const slug = c.req.param("project");
      const runId = c.req.param("runId");
      const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
      if (!row || runId == null || runId === "") return c.html(renderDocument(c.req.path, notFoundElement), 404);
      const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
      const text = typeof form["text"] === "string" ? (form["text"] as string) : undefined;
      const note = typeof form["note"] === "string" ? (form["note"] as string) : undefined;
      try {
        await act(session, runId, text ?? note);
      } catch (e) {
        // a stale card (the run moved past the state) re-renders the page rather than erroring out —
        // the Timeline's fresh read shows the current state.
        if (!(e instanceof ApiError && (e.status === 404 || e.status === 409 || e.status === 400))) throw e;
      }
      return c.redirect(`/p/${slug}`);
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
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const runId = c.req.param("runId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row || runId == null || runId === "") return c.html(renderDocument(c.req.path, notFoundElement), 404);
    try {
      await deps.dataSource.requestRefund(session, runId);
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 404 || e.status === 409 || e.status === 403))) throw e;
    }
    return c.redirect(`/p/${slug}/r/${runId}#report`);
  });

  // PRB.05 — the disposition write (§5.7): the five verbs + note + optional reason chip. Progressive
  // enhancement: a plain form POST; a validation error re-renders the dossier with the error under the
  // card (a rebut/escalate with no rationale round-trips a 422). Two mount paths: the dossier route (its
  // runId locates the dossier to re-render) and the project-scoped route a gate card's per-row override uses.
  const dispositionHandler = async (c: Context) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const runId = c.req.param("runId") ?? "";
    const findingId = c.req.param("fid") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row || findingId === "") return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
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
      if (e instanceof ApiError && (e.status === 422 || e.status === 409)) {
        // Re-render the dossier with the error under the card when we have one; otherwise bounce back
        // to the project page (the error is on the gate row's form — the POST stays idempotent).
        if (runId === "") return c.redirect(`${back}${back.includes("?") ? "&" : "?"}derror=${encodeURIComponent(findingId)}`);
        const dossier = await deps.dataSource.getDossier(session, { projectSlug: slug, runId });
        const message =
          e.status === 409
            ? "This finding's disposition is frozen — the ledger locked at delivery."
            : `a rationale is required for ${verb}`;
        return c.html(
          renderDocument(c.req.path, dossierElement, {
            ...(await ideContext(c, session, row, {
              findings: dossier.findings.map((f) => ({ id: f.id, severity: f.severity, kind: f.kind, excerpt: f.title })),
            })),
            project: { title: dossier.projectTitle, pill: "", slug, headDraftId: row.headDraftId },
            dossier,
            compact: isPhoneRequest(c),
            triage: { dispositionError: { findingId, message } },
          }),
          e.status as 422 | 409,
        );
      }
      throw e;
    }
    return c.redirect(`${back}${back.includes("?") ? "&" : "?"}disposed=${encodeURIComponent(findingId)}`);
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
      if (!session) return c.redirect("/login");
      const slug = c.req.param("project") ?? "";
      const runId = c.req.param("runId") ?? "";
      const findingId = c.req.param("fid") ?? "";
      const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
      if (!row || findingId === "") return c.html(renderDocument(c.req.path, notFoundElement), 404);
      const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
      const nextRaw = typeof form["next"] === "string" ? form["next"] : "";
      const back = safeBack(nextRaw, runId !== "" ? `/p/${slug}/review/${runId}` : `/p/${slug}`);
      try {
        await act(session, row.id, findingId);
      } catch (e) {
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
      return c.redirect(`${back}${sep}${notice}=${encodeURIComponent(findingId)}#finding-${encodeURIComponent(findingId)}`);
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
    // SPA.3 — the strangler consult (spec §4 order): `dossier`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "dossier", session);
    if (spaDoc) return spaDoc;
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const back = safeBack(c.req.query("next") ?? "", `/p/${slug}`);
    return c.html(renderDocument(c.req.path, obligationNewElement, {
      obligationNew: { slug, projectTitle: row.title, back },
    }));
  });
  app.post("/p/:project/obligations", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof form["title"] === "string" ? form["title"].trim() : "";
    const severity = typeof form["severity"] === "string" ? form["severity"] : "";
    const back = safeBack(typeof form["next"] === "string" ? form["next"] : "", `/p/${slug}`);
    if (title === "") {
      return c.html(renderDocument(c.req.path, obligationNewElement, {
        obligationNew: { slug, projectTitle: row.title, back, error: COPY.obligation.required },
      }), 422);
    }
    if (deps.dataSource.createObligation == null) {
      return c.html(renderDocument(c.req.path, obligationNewElement, {
        obligationNew: { slug, projectTitle: row.title, back, error: COPY.obligation.failed },
      }), 503);
    }
    try {
      await deps.dataSource.createObligation(session, row.id, {
        title,
        severity: (["blocking", "major", "minor", "note"] as const).includes(severity as never)
          ? (severity as "blocking" | "major" | "minor" | "note")
          : "minor",
      });
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        return c.html(renderDocument(c.req.path, obligationNewElement, {
          obligationNew: { slug, projectTitle: row.title, back, error: COPY.obligation.failed },
        }), 422);
      }
      throw e;
    }
    const sep = back.includes("?") ? "&" : "?";
    return c.redirect(`${back}${sep}obligation=new`);
  });

  // ---- P1.07 — the one-preview bulk actions (§5.7; REQ-IDE-29 amended). bulk-preview bounces to the
  // GET with `?bulk=<action>` (the page renders the consolidated checklist + the single diff); bulk
  // dispatches the CHECKED subset (`only[]` — unchecked rows are never written). ----
  app.post("/p/:project/review/:runId/findings/bulk-preview", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const runId = c.req.param("runId") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const action = typeof form["action"] === "string" ? (form["action"] as string) : "";
    const section = typeof form["section"] === "string" ? (form["section"] as string) : "";
    if (!["apply_notes", "defer_minor", "accept_section"].includes(action)) {
      return c.redirect(`/p/${slug}/review/${runId}`);
    }
    const q = `bulk=${encodeURIComponent(action)}${section !== "" ? `&bsec=${encodeURIComponent(section)}` : ""}`;
    return c.redirect(`/p/${slug}/review/${runId}?${q}#findings`);
  });

  app.post("/p/:project/review/:runId/findings/bulk", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const runId = c.req.param("runId") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const action = typeof form["action"] === "string" ? (form["action"] as string) : "";
    const section = typeof form["section"] === "string" ? (form["section"] as string) : "";
    const only = form["only"] == null ? undefined
      : Array.isArray(form["only"]) ? (form["only"] as string[]).filter((s): s is string => typeof s === "string")
      : typeof form["only"] === "string" ? [form["only"] as string] : undefined;
    const back = `/p/${slug}/review/${runId}`;
    if (!["apply_notes", "defer_minor", "accept_section"].includes(action) || deps.dataSource.applyBulkFindings == null) {
      return c.redirect(back);
    }
    try {
      const result = await deps.dataSource.applyBulkFindings(session, row.id, runId, {
        action: action as "apply_notes" | "defer_minor" | "accept_section",
        ...(section !== "" ? { section } : {}),
        ...(only != null ? { only } : {}),
      });
      return c.redirect(`${back}?bulkdone=${result.count}&bulkskip=${result.skipped.length}#findings`);
    } catch (e) {
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
  app.get("/p/:project/revisions/:cid", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const cid = c.req.param("cid");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // SPA.3 — the consult runs AFTER the Page family's forced-SSR capability check (REQ-ED-12 +
    // REQ-VFY-5): phone / read-only showcase stays server-rendered even when `editor` flips.
    if (!isPhoneRequest(c) && row.showcase !== true) {
      const spaDoc = await spaShellResponse(c, deps, "editor", session, { paperTheme: row.paperTheme });
      if (spaDoc) return spaDoc;
    }
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
      }),
    );
  });

  app.post("/p/:project/revisions/:cid/hunks/:hunkId/comments", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const cid = c.req.param("cid");
    const hunkId = c.req.param("hunkId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const text = typeof form.text === "string" ? form.text.trim() : "";
    if (text !== "") {
      await deps.dataSource.commentOnHunk(session, row.id, cid, hunkId, text).catch(() => undefined);
    }
    return c.redirect(`/p/${slug}/revisions/${cid}?commented=${encodeURIComponent(hunkId)}`);
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
    // SPA.3 — the consult runs AFTER the Page family's forced-SSR capability check (REQ-ED-12 +
    // REQ-VFY-5): phone / read-only showcase stays server-rendered even when `editor` flips.
    if (!isPhoneRequest(c) && row.showcase !== true) {
      const spaDoc = await spaShellResponse(c, deps, "editor", session, { paperTheme: row.paperTheme });
      if (spaDoc) return spaDoc;
    }
    const v = c.req.param("v") ?? "working";
    const resolved = await deps.dataSource.resolveEditorDraft(session, row.id, v).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    // EDIT.1 — `working` resolves the EDITABLE head (working head, else highest-n draft served as
    // the lazy-fork source); a 404 here now means the project has no drafts at all — send the reader
    // back to the project page (the empty-state cards / import affordance live there) instead of
    // dead-ending on the 404 view. A numeric /v/:n keeps the truthful 404.
    if (!resolved) {
      if (v === "working") return c.redirect(`/p/${slug}`);
      return c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const pageLoad = await loadEditorPage(deps.dataSource, session, row.id, resolved.draftId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!pageLoad) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const { doc } = pageLoad;

    // P1.08 — the §5.8 version rail over the Page (REQ-IDE-32): the chips read, the restore-point
    // dropdown for THIS draft's live doc, the `?restore=<id>` preview card, and the `?restored=<n>`
    // undoable-apply notice. Each read is best-effort — a missing piece hides its affordance.
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
            ? {
                rail: {
                  data: railData,
                  currentN: doc.draftN,
                  points: restorePoints?.points ?? [],
                  ...(restorePreview?.ok === true
                    ? {
                        preview: {
                          // the preview's point re-uses the LISTED row when present (it carries
                          // `group`/`advanced` — the bare point read doesn't).
                          point:
                            restorePoints?.points.find((p) => p.id === restorePreview.point.id) ??
                            { ...restorePreview.point, group: "named" as const, advanced: false },
                          view: restorePreview.view,
                        },
                      }
                    : {}),
                  ...(restoredN != null && Number.isFinite(restoredN) ? { restoredN } : {}),
                },
              }
            : {}),
        },
        dwellSurface: "page",
      }),
    );
  });

  // P1.08 — the undoable restore-point apply (§5.8; REQ-IDE-34): the preview card's POST lands here;
  // the api writes a "Before restore" point on the CURRENT state first, then applies through
  // saveManualRevision (frozen ⇒ fork; agent/imported head ⇒ 409 → the page re-renders unchanged).
  app.post("/p/:project/v/:v/restore/:rp", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const v = c.req.param("v") ?? "working";
    const resolved = await deps.dataSource.resolveEditorDraft(session, row.id, v).catch(() => null);
    if (!resolved) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const applied = await Promise.resolve()
      .then(() => deps.dataSource.applyRestorePoint?.(session, row.id, resolved.draftId, c.req.param("rp") ?? ""))
      .catch(() => undefined);
    // A 409/404/503 (locked, unknown, unavailable) re-renders the page without the notice — the
    // preview card simply re-appears; a success redirects with `?restored=<n>` on the new head.
    return c.redirect(
      applied?.ok === true
        ? `/p/${slug}/v/${applied.draftN}?restored=${applied.draftN}`
        : `/p/${slug}/v/${v}`,
    );
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
    // SPA.3 — the consult runs AFTER the Page family's forced-SSR capability check (REQ-ED-12 +
    // REQ-VFY-5): phone / read-only showcase stays server-rendered even when `editor` flips.
    if (!isPhoneRequest(c) && row.showcase !== true) {
      const spaDoc = await spaShellResponse(c, deps, "editor", session, { paperTheme: row.paperTheme });
      if (spaDoc) return spaDoc;
    }
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
        dwellSurface: "page",
      }),
    );
  });

  // The compare page's hunk-comment POST — a Guidance row for the next Revise (`source:'inline_comment'`,
  // anchored server-side on the resolved hunk). Progressive enhancement: plain form POST → redirect.
  app.post("/p/:project/v/:n/diff/:m/hunks/:hunkId/comments", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const n = c.req.param("n") ?? "";
    const m = c.req.param("m") ?? "";
    const hunkId = c.req.param("hunkId") ?? "";
    const form = await c.req.parseBody();
    const text = typeof form.text === "string" ? form.text.trim() : "";
    if (text !== "") {
      await deps.dataSource.commentOnCompareHunk(session, row.id, n, m, hunkId, text).catch(() => undefined);
    }
    return c.redirect(`/p/${slug}/v/${n}/diff/${m}?commented=${encodeURIComponent(hunkId)}`);
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
    // SPA.3 — the consult runs AFTER the Page family's forced-SSR capability check (REQ-ED-12 +
    // REQ-VFY-5): phone / read-only showcase stays server-rendered even when `editor` flips.
    if (!isPhoneRequest(c) && row.showcase !== true) {
      const spaDoc = await spaShellResponse(c, deps, "editor", session, { paperTheme: row.paperTheme });
      if (spaDoc) return spaDoc;
    }
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
        dwellSurface: "page",
      }),
    );
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
    if (!session) return c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const text = typeof form.text === "string" ? form.text.trim() : "";
    if (text !== "") {
      await deps.dataSource.postEditorNote(session, t.row.id, t.draftId, text).catch(() => undefined);
    }
    return c.redirect(`/p/${t.slug}/edit/${t.draftId}?noted=1`);
  });

  // The banner's "Cancel run to edit" release (§6.3). A stale banner (the run already ended) just
  // re-renders — the next doc poll shows the released lock.
  app.post("/p/:project/edit/:draftId/cancel-run", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    await deps.dataSource.cancelEditorRun(session, t.row.id, t.draftId).catch(() => undefined);
    return c.redirect(`/p/${t.slug}/edit/${t.draftId}`);
  });

  // "Revise using your edits" (REQ-DATA-26): review of vN + the v(N+1) human-revision base. Lands on the
  // project page where the new run's card reports progress.
  app.post("/p/:project/edit/:draftId/revise", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    await deps.dataSource.reviseWithEdits(session, t.row.id, t.draftId).catch(() => undefined);
    return c.redirect(`/p/${t.slug}`);
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
    // SPA.3 — the strangler consult (spec §4 order): `export`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "export", session);
    if (spaDoc) return spaDoc;
    const t = await projectRow(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const dialog = await deps.dataSource.getExportDialog(session, t.row.id).catch(() => null);
    if (!dialog) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(
      renderDocument(c.req.path, exportElement, {
        ...(await ideContext(c, session, t.row)),
        project: { title: t.row.title, pill: t.row.state.pill, slug: t.slug, headDraftId: t.row.headDraftId },
        export: {
          slug: t.slug,
          projectId: t.row.id,
          dialog,
          ...(c.req.query("error") ? { error: COPY.export.exportFailed } : {}),
          ...(c.req.query("added") ? { added: true } : {}),
        },
        compact: isPhoneRequest(c),
      }),
    );
  });

  // The export POST — a plain form POST that streams the download back (progressive enhancement: no JS).
  app.post("/p/:project/export", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await projectRow(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
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
    if (!session) return c.redirect("/login");
    const t = await projectRow(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const sentence = typeof form.sentence === "string" ? form.sentence.trim() : "";
    if (sentence !== "") {
      await deps.dataSource.appendAiUseAddition(session, t.row.id, sentence).catch(() => undefined);
    }
    return c.redirect(`/p/${t.slug}/export?added=1`);
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
    const personaId = typeof form.voice_persona === "string" ? form.voice_persona : "";
    if (personaId) {
      await deps.dataSource
        .buildVoice(session, personaId, { tier: "quick", projectId: row.id })
        .catch(() => undefined);
    }
    return mutationOutcome(c, { redirect: `/p/${slug}/run${new URL(c.req.url).search}` });
  });

  // The voice library — the §9.1 three-group destination (your voices / house styles / shared).
  app.get("/voices", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult (spec §4 order): `voices`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "voices", session);
    if (spaDoc) return spaDoc;
    const voices = await deps.dataSource
      .listVoiceGroups(session)
      .catch(() => ({ voices: [], groups: { your_voices: [], house_styles: [], shared_with_you: [] } }));
    return c.html(renderDocument(c.req.path, voicesElement, { voices, compact: isPhoneRequest(c) }));
  });

  // The §9.2 creation sheet (GET) — name required; description/byline/sample/mode/tier optional.
  app.get("/voices/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    // SPA.3 — the strangler consult (spec §4 order): `voices`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "voices", session);
    if (spaDoc) return spaDoc;
    return c.html(renderDocument(c.req.path, voiceNewElement, { voiceNew: {}, compact: isPhoneRequest(c) }));
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
      return c.html(
        renderDocument(c.req.path, voiceNewElement, { voiceNew: { error: COPY.voice.new.nameRequired }, compact: isPhoneRequest(c) }),
        400,
      );
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
      return c.html(
        renderDocument(c.req.path, voiceNewElement, { voiceNew: { error: COPY.voice.new.sampleRequired }, compact: isPhoneRequest(c) }),
        400,
      );
    }
    if (intent === "build" && tier === "full") {
      const hasCorpus = hasSample || sampleUrl !== "";
      if (!hasCorpus) {
        if (wantsJson(c)) return c.json({ error: "full_required", detail: COPY.voice.new.fullRequired }, 400);
        return c.html(
          renderDocument(c.req.path, voiceNewElement, { voiceNew: { error: COPY.voice.new.fullRequired }, compact: isPhoneRequest(c) }),
          400,
        );
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
        .buildVoice(session, created.personaId, { tier })
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
    // SPA.3 — the strangler consult (spec §4 order): `voices`'s flip ⇒ the shell document.
    const spaDoc = await spaShellResponse(c, deps, "voices", session);
    if (spaDoc) return spaDoc;
    const personaId = c.req.param("persona");
    const detail = await deps.dataSource.getVoice(session, personaId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!detail) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const tab = c.req.query("tab");
    const sampleId = c.req.query("sample");
    const [estimate, updatePlan, connections, sampleDetail] = await Promise.all([
      deps.dataSource.estimateVoice(session, personaId, detail.tier === "full" ? "full" : "quick").catch(() => undefined),
      // The diff-of-inputs sheet's pre-computed route (§9.3) — best-effort; the pill alone suffices.
      deps.dataSource.getVoiceUpdatePlan?.(session, personaId).catch(() => undefined),
      // P1.15 — the Sources pane + the open sample drawer (best-effort; absent ⇒ the tab degrades
      // to the items list alone).
      tab === "samples" && deps.dataSource.listVoiceConnections
        ? deps.dataSource.listVoiceConnections(session, personaId).catch(() => undefined)
        : undefined,
      tab === "samples" && sampleId && deps.dataSource.getVoiceSample
        ? deps.dataSource.getVoiceSample(session, personaId, sampleId).catch(() => undefined)
        : undefined,
    ]);
    const notice =
      c.req.query("saved") === "1"
        ? COPY.voice.detail.seedSaved
        : c.req.query("added") === "1"
          ? COPY.voice.detail.sampleAdded
          : c.req.query("cancelled") === "1"
            ? COPY.voice.detail.cancelDone
            : c.req.query("corrected") === "1"
              ? COPY.voice.detail.correctionAdded
              : c.req.query("reconstruct") === "queued"
                ? COPY.voice.detail.reconstructQueued
                : c.req.query("build_failed") === "1"
                  ? COPY.voice.new.fullRequired
                  : undefined;
    return c.html(
      renderDocument(c.req.path, voiceDetailElement, {
        voice: {
          detail,
          ...(estimate ? { estimate } : {}),
          ...(updatePlan ? { updatePlan } : {}),
          ...(connections ? { connections } : {}),
          ...(sampleDetail ? { sampleDetail } : {}),
          ...(notice ? { notice } : {}),
          ...(tab ? { tab } : {}),
        },
        compact: isPhoneRequest(c),
      }),
    );
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
    const tier = form.tier === "full" ? "full" : "quick";
    await deps.dataSource.buildVoice(session, personaId, { tier }).catch(() => undefined);
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
  // session the flag consult decides — the surface's flip (or an honored `x-rhema-renderer: spa`)
  // serves the shell so SPA deep links the server has no explicit route for reach the client
  // router (it renders its own not-found for the truly unknown). Every other shape — non-GET
  // verbs, non-SPA paths, flag-off requests — keeps today's SSR 404 byte-for-byte.
  app.all("*", async (c) => {
    if (c.req.method === "GET") {
      const { surfaces } = spaRouteFor(c.req.path);
      if (surfaces != null) {
        const session = deps.session(c);
        if (!session) return c.redirect("/login");
        const spaDoc = await spaShellResponse(c, deps, surfaces, session);
        if (spaDoc) return spaDoc;
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

async function parseImportInput(c: Context, slug: string): Promise<ImportInput> {
  const form = await c.req.parseBody();
  // PRB.20 — the preview form replays the minted quarantine key in `qk` so Create does not re-upload.
  const qk = typeof form.qk === "string" && form.qk ? form.qk : undefined;
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
  return { projectSlug: slug, text: paste, ...(qk ? { quarantineKey: qk } : {}) };
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
