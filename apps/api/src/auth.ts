import { betterAuth, type BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";

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
 * PRB.16 — provisioning seam for self-serve paths that never pass through `POST /signup` (Google OAuth,
 * magic link on a returning-but-never-provisioned account): the api binds `onUserCreate` to the same
 * personal-workspace + billing-account + membership rows `admitSignup` writes, so a session always
 * resolves to a principal (the session→membership→workspace join would otherwise return null).
 */
export interface AuthHooks {
  onUserCreate?: (user: { id: string; email: string; name?: string | null }) => Promise<void>;
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
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    verification: {
      fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    },
    // PRB.16 — a self-serve OAuth/magic-link user-create provisions the same account rows POST /signup
    // writes (the `resolveSessionPrincipal` join needs the personal-workspace membership).
    ...(hooks?.onUserCreate
      ? {
          databaseHooks: {
            user: {
              create: {
                after: async (user: { id: string; email: string; name?: string | null }) => {
                  await hooks.onUserCreate!({ id: user.id, email: user.email, name: user.name ?? null });
                },
              },
            },
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
        sendMagicLink: async ({ email, url, token }) => {
          await sendMagicLink({ email, url, token });
        },
      }),
    ],
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
    },
  }) as unknown as ReturnType<typeof betterAuth>;
}
