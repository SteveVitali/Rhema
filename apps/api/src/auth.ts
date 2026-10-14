import { betterAuth, type BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { APIError, createAuthMiddleware, getOAuthState, addOAuthServerContext } from "better-auth/api";
import {
  resolveClientIp,
  INTERNAL_IDENTITY_HEADER,
  INVITE_CODE_PARAM,
  type IpEmailThrottle,
  type SignupMode,
} from "@rhema/contracts";
import type { InviteGate } from "./invite.js";

// Better Auth, self-hosted in our Postgres (§13.1; R4): Google OAuth + email magic link + sessions.
//
// Secrets (Google client id/secret, the Better Auth secret) are DELIVERED IN, read from Secrets
// Manager by the caller (REQ-ARCH-30) — never hard-coded and never handed to `web`/`collab`. `auth`
// is built by a factory (not at import time) so the module carries no secret and nothing executes
// until `api` wires its real Drizzle adapter over @rhema/db in P0.08.

export interface AuthSecrets {
  baseURL: string;
  betterAuthSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  /**
   * Origins allowed to hit the auth endpoints cross-origin (PRB.15: the app apex
   * `https://rhema.tools` when auth mounts on `api.rhema.tools`). Needed by the live OAuth/magic-link
   * binding (D-P0.01-3); orthogonal to cookie scope — a trusted origin still only ever receives
   * host-only `__Host-` cookies.
   */
  trustedOrigins?: string[];
}

/** Enqueues the magic-link email onto the worker's `auth.mail` queue (wired PRB.16; Resend = D-PRB.16-x). */
export type SendMagicLink = (args: { email: string; url: string; token: string }) => Promise<void>;

/**
 * UX.1 — the magic-link token lifetime, in SECONDS, configured on the plugin AND read by the email
 * template (one constant feeds both — the "expires in" line can never disagree with the gate).
 * 15 minutes: long enough for a slow mailbox, short enough to bound a forwarded link.
 */
export const MAGIC_LINK_EXPIRES_SECONDS = 15 * 60;

/**
 * PRB.16 — provisioning seam for self-serve paths that never pass through `POST /signup` (Google OAuth,
 * magic link on a returning-but-never-provisioned account): the api binds `onUserCreate` to the same
 * personal-workspace + billing-account + membership rows `admitSignup` writes, so a session always
 * resolves to a principal (the session→membership→workspace join would otherwise return null).
 */
export interface AuthHooks {
  onUserCreate?: (user: { id: string; email: string; name?: string | null }) => Promise<void>;
  /**
   * SEC.2 (REQ-BETA-19 amended) — the SAME admission boundary POST /signup enforces, applied to the
   * Better Auth creation paths a direct `/api/auth/*` caller could otherwise reach: the OAuth callback
   * and magic-link verify create `user` rows that must clear `signup.mode` + the invite check, and the
   * invite consumes AT creation (the PRB.01 invariant). `user.create.before` runs it; a refusal throws
   * an `APIError` (stable `{code}` — magic-link verify maps it onto the error redirect), never a bare
   * false that would surface as a 500.
   */
  readonly admission?: AuthAdmission;
}

/**
 * SEC.2 — the admission seams the Better Auth hooks need. `accountThrottle`/`magicLinkThrottle` are the
 * SHARED-store throttles (Redis on prod — one bucket across api instances, D-PRB.13-1 closed);
 * `verifyInternalToken` trusts the web-stamped `x-rhema-client-ip` only behind a verified OIDC token.
 */
export interface AuthAdmission {
  /** `signup.mode` — the same flag `POST /signup` reads (`invite` fails closed). */
  readonly mode: SignupMode;
  /** The invite gate — `check` before the user row exists; `consume` at creation. */
  readonly inviteGate: InviteGate;
  /**
   * Does a `user` row already exist for this email? A returning account is NEVER re-gated by the mode
   * flag or a code (admitSignup's same bypass — its exhausted single-use code must not lock it out).
   */
  readonly knownUser: (email: string) => Promise<boolean>;
  /** Account-creation throttle (per IP + per email) on every `user` row create — the `/signup` limit. */
  readonly accountThrottle: IpEmailThrottle;
  /** The magic-link SEND throttle (per IP + per email) on `POST /sign-in/magic-link`. */
  readonly magicLinkThrottle: IpEmailThrottle;
  /**
   * MAINT.4 — the OAuth sign-in START throttle (per IP only — the provider identity is
   * unknown at initiation) on `POST /sign-in/social` + `/sign-in/oauth2/*`. It replaces
   * the library's built-in `/sign-in/*` limiter, which is now disabled (`rateLimit` on
   * the options below): its `getIP` keying could not see the client under ADR-040 and
   * collapsed every caller into one global `no-trusted-ip` bucket.
   */
  readonly signinThrottle?: IpEmailThrottle;
  /** Verify the web service's OIDC token so its stamped `x-rhema-client-ip` is trusted (ADR-040). */
  readonly verifyInternalToken?: (token: string) => Promise<boolean>;
}

// SEC.2 — `INVITE_CODE_PARAM` (`rhema_ic`) moved to @rhema/contracts (the web stamps it on the
// callbackURL + the OAuth `additionalData`; the api reads it here). Re-exported for existing imports.
export { INVITE_CODE_PARAM };

/** Pull a supplied invite code out of a `callbackURL` query string (the magic-link link's channel). */
function inviteCodeFromCallbackUrl(callbackURL: unknown): string | undefined {
  if (typeof callbackURL !== "string" || !callbackURL) return undefined;
  try {
    const v = new URL(callbackURL, "https://rhema.invalid").searchParams.get(INVITE_CODE_PARAM);
    return v?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the invite code a Better Auth creation flow carried. Precedence:
 *  1. `state.serverContext.rhema_ic` — the TRUSTED channel (the api's `before` hook promotes the web's
 *     code here only behind a verified OIDC internal token; a direct caller cannot write it).
 *  2. `state.rhema_ic` / `state.callbackURL`'s `?rhema_ic=` — client-supplied channels; still read so
 *     a token-less path keeps working, but every code is invite-gate-VALIDATED regardless of channel,
 *     so forging the transport buys nothing.
 *  3. The magic-link leg's emailed `callbackURL` (visible on the verify request's query/body).
 * `getOAuthState` throws/no-ops outside an OAuth callback.
 */
async function inviteCodeFor(ctx: { query?: Record<string, unknown>; request?: Request; body?: unknown } | null): Promise<string | undefined> {
  try {
    const state = (await getOAuthState()) as
      | (Record<string, unknown> & { serverContext?: Record<string, unknown>; callbackURL?: unknown })
      | null;
    const trusted = state?.serverContext?.[INVITE_CODE_PARAM];
    if (typeof trusted === "string" && trusted.trim()) return trusted.trim();
    const v = state?.[INVITE_CODE_PARAM];
    if (typeof v === "string" && v.trim()) return v.trim();
    const fromStateCb = inviteCodeFromCallbackUrl(typeof state?.callbackURL === "string" ? state.callbackURL : undefined);
    if (fromStateCb) return fromStateCb;
  } catch {
    /* no request-scoped OAuth state on this path */
  }
  const cb =
    (typeof ctx?.query?.["callbackURL"] === "string" ? (ctx.query["callbackURL"] as string) : undefined) ??
    (ctx?.request ? new URL(ctx.request.url).searchParams.get("callbackURL") : null) ??
    (typeof (ctx?.body as Record<string, unknown> | undefined)?.["callbackURL"] === "string"
      ? ((ctx!.body as Record<string, unknown>)["callbackURL"] as string)
      : undefined);
  return inviteCodeFromCallbackUrl(cb);
}

/**
 * SEC.2 — the deploy's magic-link SEND throttle (per source IP + per email): the same beta-grade shape
 * the web's now-retired per-instance limiter carried (20/IP·h, 4/email·h), but shared across instances
 * and enforced AT the api where the send happens (ADR-041).
 */
export const MAGIC_LINK_THROTTLE_DEFAULTS = { perIp: 20, perEmail: 4, windowMs: 3_600_000 } as const;

/**
 * MAINT.4 — the OAuth sign-in START throttle (per source IP) on `sign-in/social` +
 * `sign-in/oauth2/*`. 10/min/IP is sized for real retries: a user clicking "Continue
 * with Google" on a flaky connection gets ~6 s between counted starts, while one IP's
 * abuse saturates at 10/min. (The library default it replaces was 3/10s on a SINGLE
 * global bucket — the prod 429s this ticket repairs.) The email dimension is dead at
 * initiation — the provider has not told us who the user is — so `attempt` is always
 * called ip-only; `perEmail` exists only for the shared options shape.
 */
export const OAUTH_SIGNIN_THROTTLE_DEFAULTS = { perIp: 10, perEmail: 10, windowMs: 60_000 } as const;

const NO_VERIFY = async () => false;

/** The request's client IP under the SEC.2 rule (verified stamp, else the LB-appended XFF hop). */
async function authClientIp(
  ctx: { headers?: Headers; request?: Request } | null,
  verify: (token: string) => Promise<boolean>,
): Promise<string> {
  const headers = ctx?.request?.headers ?? ctx?.headers;
  return headers ? resolveClientIp(headers, verify) : "unknown";
}

export function createAuth(
  secrets: AuthSecrets,
  database: BetterAuthOptions["database"],
  sendMagicLink: SendMagicLink,
  hooks?: AuthHooks,
): ReturnType<typeof betterAuth> {
  // PRB.15 (rhema.tools single-zone amendment, 2026-09-17 — REQ-ARCH-24 amended): user content now
  // serves from a SIBLING subdomain on the app's own zone (`usercontent.rhema.tools`), so the old
  // "separate registrable domain ⇒ cookies can't cross" boundary is gone. The replacement invariant:
  // every cookie Better Auth emits is host-only under a literal `__Host-` name — the browser then
  // REQUIRES Secure + Path=/ + no Domain attribute to store it at all, and rejects a same-named
  // `Domain=rhema.tools` plant from any subdomain (session clobbering/fixation from user content).
  // It also means session material can never ride to `usercontent.*` (a Domain=-scoped cookie would).
  const secure = secrets.baseURL.startsWith("https://");
  // Annotated with a nameable type (ReturnType<typeof betterAuth>) so the emitted .d.ts is portable
  // and does not reference zod internals (TS2742); betterAuth() narrows its generic to the concrete
  // plugin/provider set, so we widen it back to the declared type.
  return betterAuth({
    baseURL: secrets.baseURL,
    secret: secrets.betterAuthSecret,
    database,
    ...(secrets.trustedOrigins ? { trustedOrigins: secrets.trustedOrigins } : {}),
    // PRB.16 — the committed schema (0002 + 0025) is snake_case; Better Auth's default column names are
    // camelCase (`userId`, `expiresAt`, …). Map every field explicitly so the Kysely adapter queries the
    // real columns — a missed mapping is a silent `column "userId" does not exist` at runtime.
    user: {
      fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
    },
    session: {
      fields: {
        token: "token",
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    account: {
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      // PRB.19 follow-up — D-P0.01-3 requires Google AND magic-link to work for the SAME user. The
      // prod operator account was created via magic-link, so a first Google sign-in for that email
      // previously failed with `account_not_linked` (Better Auth's anti-takeover default). Enable
      // linking gated to `trustedProviders` (Google verifies its emails; the existing account's
      // email is already verified via the magic link), so same-email social + magic-link converge
      // on one account without opening a takeover surface.
      //
      // `requireLocalEmailVerified: false` (v1.7.x default is true) — a same-email Google sign-in
      // must link even when the local row's email_verified is false (e.g. a magic-link request whose
      // delivery never completed). Google only asserts emails it has verified, so trusting it here
      // can't cross accounts; on link, better-auth promotes the local row to email_verified=true.
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        requireLocalEmailVerified: false,
      },
    },
    verification: {
      fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    },
    // PRB.16 — a self-serve OAuth/magic-link user-create provisions the same account rows POST /signup
    // writes (the `resolveSessionPrincipal` join needs the personal-workspace membership).
    //
    // SEC.2 — the SAME admission boundary now guards every Better Auth creation path: `user.create.before`
    // throttles the creation (shared account throttle, trusted-IP bucket) and enforces `signup.mode` +
    // the invite CHECK before the row exists — a refusal throws an APIError whose `code` is the stable
    // `SignupRejectReason` (magic-link verify maps it to `?error=`; the OAuth callback's `redirectOnError`
    // does the same), so no `user`/`workspaces`/`billing_accounts` row is ever left behind. `create.after`
    // consumes the invite AT creation (the PRB.01 invariant) before provisioning.
    ...(hooks?.onUserCreate || hooks?.admission
      ? {
          databaseHooks: {
            user: {
              create: {
                before: async (
                  user: { id: string; email: string; name?: string | null },
                  ctx: { headers?: Headers; request?: Request; query?: Record<string, unknown>; body?: unknown } | null,
                ) => {
                  const admission = hooks?.admission;
                  if (!admission) return; // no admission bound ⇒ the PRB.16 posture (hook absent).
                  const email = String(user.email ?? "").toLowerCase();
                  // A returning account is never re-gated — the same bypass `admitSignup` gives an
                  // already-provisioned email (an exhausted single-use code must not lock out re-login).
                  if (await admission.knownUser(email)) return;
                  // Throttle BEFORE any invite work — a direct /api/auth/* caller cannot bypass the
                  // account-creation limit `POST /signup` enforces.
                  const ip = await authClientIp(ctx, admission.verifyInternalToken ?? NO_VERIFY);
                  const verdict = await admission.accountThrottle.attempt(ip, email || undefined);
                  if (!verdict.allowed) {
                    throw new APIError("TOO_MANY_REQUESTS", { message: "rate_limited", code: "rate_limited" });
                  }
                  const code = await inviteCodeFor(ctx);
                  if (admission.mode === "invite" && !code) {
                    throw new APIError("FORBIDDEN", { message: "invite_required", code: "invite_required" });
                  }
                  if (code) {
                    const check = await admission.inviteGate.check(code, email);
                    if (!check.ok) {
                      throw new APIError("FORBIDDEN", {
                        message: check.reason ?? "unknown",
                        code: check.reason ?? "invite_rejected",
                      });
                    }
                  }
                },
                after: async (
                  user: { id: string; email: string; name?: string | null },
                  ctx: { headers?: Headers; request?: Request; query?: Record<string, unknown>; body?: unknown } | null,
                ) => {
                  const admission = hooks?.admission;
                  const email = String(user.email ?? "").toLowerCase();
                  // Consume at creation (PRB.01): the same code the `before` check passed; a race to
                  // exhaustion refuses provisioning — the bare user row retries cleanly, exactly the
                  // posture `admitSignup` documents.
                  if (admission) {
                    const code = await inviteCodeFor(ctx);
                    if (code) {
                      const consumed = await admission.inviteGate.consume(code, user.id, email);
                      if (!consumed.ok) {
                        console.warn(
                          `[api] auth: invite consume failed at create (${consumed.reason ?? "unknown"}) — account left unprovisioned`,
                        );
                        return;
                      }
                    }
                  }
                  if (hooks?.onUserCreate) {
                    await hooks.onUserCreate({ id: user.id, email: user.email, name: user.name ?? null });
                  }
                },
              },
            },
          },
        }
      : {}),
    // SEC.2 — the magic-link SEND gate: `hooks.before` runs before the endpoint handler, so a direct
    // `POST /api/auth/sign-in/magic-link` hits the same shared throttle + admission the web path does —
    // over-limit ⇒ 429 `rate_limited` with NO email enqueued; in invite mode a never-seen email needs a
    // valid code even to SEND (a refusal leaves nothing queued).
    ...(hooks?.admission
      ? {
          hooks: {
            before: createAuthMiddleware(async (ctx) => {
              const admission = hooks!.admission!;
              // ctx.path is the better-call endpoint path (basePath-stripped); the raw URL match is
              // belt-and-suspenders for a differently-mounted handler.
              const path =
                ctx.path ?? (ctx.request ? new URL(ctx.request.url).pathname : "");
              // OAuth sign-in initiation (`/sign-in/social`, `/sign-in/oauth2/<provider>`): promote the
              // web-carried invite code into the state's TRUSTED `serverContext` — but ONLY when the
              // request proves itself the web service (verified OIDC internal token). A direct caller's
              // `additionalData.rhema_ic` stays client-supplied: `inviteCodeFor` reads it as a fallback
              // and the invite gate validates it either way, so the untrusted channel buys nothing.
              if (path === "/sign-in/social" || path.endsWith("/sign-in/social") || /\/sign-in\/oauth2(\/|$)/.test(path)) {
                // MAINT.4 — the OAuth sign-in START throttle: the library's built-in
                // `/sign-in/*` limiter is disabled (`rateLimit` below — its XFF keying is
                // broken under ADR-040), so the audited channel carries the limit. It runs
                // BEFORE the token early-returns below so an unstamped caller still keys
                // on the penultimate XFF hop (`resolveClientIp`'s rule) rather than
                // escaping the bucket entirely.
                if (admission.signinThrottle) {
                  const ip = await authClientIp(ctx, admission.verifyInternalToken ?? NO_VERIFY);
                  const verdict = await admission.signinThrottle.attempt(ip);
                  if (!verdict.allowed) {
                    throw new APIError("TOO_MANY_REQUESTS", { message: "rate_limited", code: "rate_limited" });
                  }
                }
                const verify = admission.verifyInternalToken ?? NO_VERIFY;
                const headers = ctx.request?.headers ?? ctx.headers;
                const token = headers?.get(INTERNAL_IDENTITY_HEADER);
                if (!token) return;
                let verified = false;
                try {
                  verified = await verify(token);
                } catch {
                  verified = false;
                }
                if (!verified) return;
                const body = (ctx.body ?? {}) as {
                  additionalData?: Record<string, unknown>;
                  callbackURL?: unknown;
                };
                const raw =
                  (typeof body.additionalData?.[INVITE_CODE_PARAM] === "string"
                    ? (body.additionalData[INVITE_CODE_PARAM] as string)
                    : undefined) ?? inviteCodeFromCallbackUrl(body.callbackURL);
                const code = raw?.trim();
                if (code) await addOAuthServerContext({ [INVITE_CODE_PARAM]: code });
                return;
              }
              if (path !== "/sign-in/magic-link" && !path.endsWith("/sign-in/magic-link")) return;
              const body = (ctx.body ?? {}) as { email?: unknown; callbackURL?: unknown };
              const email = typeof body.email === "string" ? body.email.toLowerCase() : "";
              const ip = await authClientIp(ctx, admission.verifyInternalToken ?? NO_VERIFY);
              const verdict = await admission.magicLinkThrottle.attempt(ip, email || undefined);
              if (!verdict.allowed) {
                throw new APIError("TOO_MANY_REQUESTS", { message: "rate_limited", code: "rate_limited" });
              }
              if (email && !(await admission.knownUser(email))) {
                // A never-seen email's send IS an admission: invite mode requires a valid code (carried
                // on the callbackURL's `rhema_ic`), open mode still validates a supplied one.
                const code = inviteCodeFromCallbackUrl(body.callbackURL);
                if (admission.mode === "invite" && !code) {
                  throw new APIError("FORBIDDEN", { message: "invite_required", code: "invite_required" });
                }
                if (code) {
                  const check = await admission.inviteGate.check(code, email);
                  if (!check.ok) {
                    throw new APIError("FORBIDDEN", {
                      message: check.reason ?? "unknown",
                      code: check.reason ?? "invite_rejected",
                    });
                  }
                }
              }
            }),
          },
        }
      : {}),
    socialProviders: {
      google: {
        clientId: secrets.googleClientId,
        clientSecret: secrets.googleClientSecret,
      },
    },
    plugins: [
      magicLink({
        // UX.1 — the configured expiry the email template quotes (MAGIC_LINK_EXPIRES_SECONDS is the
        // single value both sides read).
        expiresIn: MAGIC_LINK_EXPIRES_SECONDS,
        sendMagicLink: async ({ email, url, token }) => {
          await sendMagicLink({ email, url, token });
        },
      }),
    ],
    // MAINT.4 — the library's built-in rate limiter is OFF deliberately. It was never
    // opted into or audited (better-auth v1.7.2 defaults it ON only in production,
    // `rateLimit.enabled = options.rateLimit?.enabled ?? isProduction`), and its `getIP`
    // keying is broken under ADR-040: `beginAuth`'s stamped web→api channel deliberately
    // omits XFF, and authProxy's relayed multi-hop XFF is rejected without
    // `trustedProxies` — so every request resolved null → ONE shared `no-trusted-ip`
    // bucket (prod evidence: 3 sign-in starts per 10 s across ALL users; the library's
    // own "falling back to a single shared per-path bucket" warning; 8×429 in 14d on
    // `sign-in/social`). The app's audited channel owns the limit instead:
    // `admission.signinThrottle` in the `hooks.before` social branch keys on
    // `resolveClientIp` — the OIDC-verified stamp, else the penultimate XFF hop. Do NOT
    // list `x-rhema-client-ip` in `ipAddressHeaders` below — `getIP` cannot verify the
    // OIDC stamp, so a direct api caller could mint unlimited forged buckets.
    // (Reachable-mutation audit recorded in `docs/build/runs/MAINT.4.md`: every
    // unauthenticated creation path keeps an app-channel limit; no `customRules` needed.)
    rateLimit: { enabled: false },
    advanced: {
      // `cookiePrefix` puts `__Host-` literally in the cookie NAME better-auth tracks, so the same
      // name round-trips set→read. `useSecureCookies:false` suppresses the library's `__Secure-`
      // name-prefix (a `__Secure-__Host-…` name would not satisfy the `__Host-` position-0 rule);
      // `Secure` itself is pinned via `defaultCookieAttributes` on https base URLs. On an http dev
      // baseURL a `__Host-`/`Secure` cookie would be rejected outright, so dev keeps a plain prefix.
      cookiePrefix: secure ? "__Host-rhema" : "rhema-dev",
      useSecureCookies: false,
      // NEVER Domain-scope an auth cookie: Domain=rhema.tools would ride to usercontent.* AND violate
      // the __Host- contract. Disabled explicitly so the intent is reviewable, not just defaulted.
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: { secure, sameSite: "lax", path: "/", httpOnly: true },
      // MAINT.4 — kept only for the session record's best-effort `ip_address` (this field
      // used to feed the built-in limiter, which `rateLimit.enabled:false` above disables).
      // Post-ADR-040 the "both forward the original client in x-forwarded-for" premise no
      // longer holds: `beginAuth` deliberately omits XFF (the OIDC-verified stamp is the
      // trusted channel), and authProxy's relayed chain is multi-hop — `getIP` rejects a
      // multi-hop chain without `trustedProxies`, resolving null. The app throttles never
      // read this; they resolve the client through `resolveClientIp` (client-ip.ts).
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
  }) as unknown as ReturnType<typeof betterAuth>;
}
