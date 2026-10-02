// Signup admission mode (PRB.13; REQ-BETA-19 amended 2026-09-16). `invite` = the PRB.01 private-beta gate:
// no valid code ⇒ no auth request is made and no account is created. `open` = self-serve account creation
// with no invite required — partner cohorts still onboard by code (a supplied code is still validated +
// consumed). The invite machinery (invites/invite_redemptions tables, createInviteGate) is retained either
// way; the mode only changes whether a code is REQUIRED.
//
// Fail-closed: an unknown/absent value parses to `invite` — a deploy typo can never silently open signup.

export const SIGNUP_MODES = ["invite", "open"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

/** Parse a stage-config/env value; unknown or unset ⇒ `invite` (fail-closed — never fail open). */
export function parseSignupMode(raw: string | undefined | null): SignupMode {
  return raw === "open" ? "open" : "invite";
}

/**
 * SEC.2 — the query/body param that carries a supplied invite code through the Better Auth flows
 * (`rhema_ic`): on the magic-link link's `callbackURL`, and on the OAuth leg in `additionalData`
 * (promoted into the state's trusted `serverContext` by the api only behind a verified internal
 * token — ADR-040). Shared so the web stamps and the api reads the same name.
 */
export const INVITE_CODE_PARAM = "rhema_ic";
