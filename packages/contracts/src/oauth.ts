// The Google OAuth hosted surface the web's POST /login form submits into (MAINT.5). The api's
// answer to `sign-in/social` is a Google authorization URL and the web relays it as the POST's 302 —
// Chromium enforces CSP `form-action` on a form submission's redirect TARGET, so this origin must sit
// in the `form-action` allowlist (the same defect class as BILL.3's Stripe hand-off). The CSP list and
// the redirect-target validator share this ONE constant — a hosted page the app hands off to is always
// reachable by form submission AND always validated before a 302 is emitted (defence in depth).

export const GOOGLE_OAUTH_ORIGINS = ["https://accounts.google.com"] as const;

/** True when `url` parses AND its origin is a Google OAuth surface above. Non-URL input ⇒ false —
 *  the caller never redirects to it. Relative URLs are NOT URLs — callers handle them separately. */
export function isGoogleOAuthRedirect(url: string): boolean {
  try {
    return (GOOGLE_OAUTH_ORIGINS as readonly string[]).includes(new URL(url).origin);
  } catch {
    return false;
  }
}
