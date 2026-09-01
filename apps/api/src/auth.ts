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
}

/** Enqueues the magic-link email onto the worker's `mail.send` queue (wired in P0.08 / PRB.09). */
export type SendMagicLink = (args: { email: string; url: string; token: string }) => Promise<void>;

export function createAuth(
  secrets: AuthSecrets,
  database: BetterAuthOptions["database"],
  sendMagicLink: SendMagicLink,
): ReturnType<typeof betterAuth> {
  // Annotated with a nameable type (ReturnType<typeof betterAuth>) so the emitted .d.ts is portable
  // and does not reference zod internals (TS2742); betterAuth() narrows its generic to the concrete
  // plugin/provider set, so we widen it back to the declared type.
  return betterAuth({
    baseURL: secrets.baseURL,
    secret: secrets.betterAuthSecret,
    database,
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
  }) as unknown as ReturnType<typeof betterAuth>;
}
